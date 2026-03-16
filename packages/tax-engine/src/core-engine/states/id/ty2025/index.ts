import { asNumber } from "../../../helpers";
import { sumItemizedDeductionTotals } from "../../../foundations";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countDependentExemptions,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  sumStateSubtractionAmounts,
  toWholeDollars,
} from "../../resident";

const IDAHO_STATE_CODE = "ID";
const IDAHO_STATE_NAME = "Idaho";
const IDAHO_FORM_RECORD_KEY = "form40";
const IDAHO_FLAT_TAX_RATE = 0.053;
const IDAHO_FOOD_TAX_CREDIT = 155;
const IDAHO_ADDITIONAL_DEDUCTION_SINGLE_OR_HOH = 1_950;
const IDAHO_ADDITIONAL_DEDUCTION_OTHER = 1_550;
const IDAHO_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 22_500,
  married_filing_jointly: 30_000,
  married_filing_separately: 15_000,
  qualifying_surviving_spouse: 30_000,
  single: 15_000,
} as const;

function countIdahoFoodCreditPeople(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
  args: StateArtifactsArgs,
): number {
  const baseCount = filingStatus === "married_filing_jointly" ? 2 : 1;
  return baseCount + countDependentExemptions(args.input);
}

function calculateIdahoDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly itemizedDeductionEstimated: boolean;
  readonly deduction: number;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      itemizedDeductionEstimated: false,
    };
  }

  const standardDeduction = IDAHO_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const itemizedOverride = asNumber(args.formRecord?.itemized_deductions_total);
  const factDerivedItemizedTotal = Math.max(
    toWholeDollars(sumItemizedDeductionTotals(args.stateArtifactsArgs.input.facts.itemized_deductions)) -
      toWholeDollars(
        args.stateArtifactsArgs.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0,
      ),
    0,
  );
  const estimatedItemizedTotal =
    args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
      ? Math.max(
          toWholeDollars(args.stateArtifactsArgs.federalSummary.itemized_deduction_total) -
            toWholeDollars(
              args.stateArtifactsArgs.input.facts.itemized_deductions
                .state_and_local_income_or_sales_taxes ?? 0,
            ),
          0,
        )
      : 0;
  const itemizedDeductionsTotal = toWholeDollars(
    itemizedOverride ?? (factDerivedItemizedTotal > 0 ? factDerivedItemizedTotal : estimatedItemizedTotal),
  );

  return {
    deduction: Math.max(standardDeduction, itemizedDeductionsTotal),
    itemizedDeductionEstimated:
      itemizedOverride == null &&
      factDerivedItemizedTotal === 0 &&
      args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized",
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: IDAHO_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, IDAHO_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line7FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line8Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line10Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line11IdahoAdjustedGrossIncome = Math.max(
    line7FederalAdjustedGrossIncome + line8Additions - line10Subtractions,
    0,
  );
  const { deduction: line16Deduction, itemizedDeductionEstimated } = calculateIdahoDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line17AgeOrBlindDeduction = toWholeDollars(
    asNumber(formRecord?.age_or_blind_deduction_amount) ??
      (countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input)) *
        (filingStatus === "single" || filingStatus === "head_of_household"
          ? IDAHO_ADDITIONAL_DEDUCTION_SINGLE_OR_HOH
          : IDAHO_ADDITIONAL_DEDUCTION_OTHER),
  );
  const line18QualifiedBusinessIncomeDeduction = toWholeDollars(
    asNumber(formRecord?.qualified_business_income_deduction) ??
      asNumber(formRecord?.federal_form_1040_line_13a_13b_total) ??
      asNumber(formRecord?.federal_qbi_and_schedule_1a_deductions_amount) ??
      0,
  );
  const line19TaxableIncome = Math.max(
    line11IdahoAdjustedGrossIncome -
      line16Deduction -
      line17AgeOrBlindDeduction -
      line18QualifiedBusinessIncomeDeduction,
    0,
  );
  const line20Tax = toWholeDollars(line19TaxableIncome * IDAHO_FLAT_TAX_RATE);
  const line21OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line22NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line28TotalTax = Math.max(line20Tax + line21OtherTaxes - line22NonrefundableCredits, 0);
  const foodTaxCredit = toWholeDollars(
    asNumber(formRecord?.food_tax_credit_amount) ??
      (asNumber(formRecord?.food_tax_credit_qualifying_people_count) ??
        countIdahoFoodCreditPeople(filingStatus, args)) *
        IDAHO_FOOD_TAX_CREDIT,
  );
  const refundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) + foodTaxCredit,
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: IDAHO_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line28TotalTax - payments.totalPayments, 0),
    startingPoint: line7FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line19TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line28TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Idaho whole-dollar rules",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho Form 40 federal adjusted gross income starting point",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.id.starting_point",
      nodeType: "bridge",
      value: line7FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form40.additions",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho additions",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line8",
      nodeType: "calculation",
      value: line8Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form40.subtractions",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho subtractions",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line10",
      nodeType: "calculation",
      value: line10Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line7 + line8 - line10, 0)",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho adjusted gross income",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line11",
      nodeType: "calculation",
      value: line11IdahoAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "greater of Idaho standard deduction or Idaho itemized deductions",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho deduction",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line16",
      nodeType: "calculation",
      value: line16Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Idaho age or blindness deduction worksheet",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho age or blindness deduction",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line17",
      nodeType: "calculation",
      value: line17AgeOrBlindDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "Federal Form 1040 lines 13a and 13b total or plugin_fact_bag.form40.qualified_business_income_deduction",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho qualified business income deduction",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line18",
      nodeType: "calculation",
      value: line18QualifiedBusinessIncomeDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line11 - line16 - line17 - line18, 0)",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho taxable income",
      lineCode: "line19",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line19",
      nodeType: "calculation",
      value: line19TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line19 * 0.053",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho tax before credits",
      lineCode: "line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line20",
      nodeType: "calculation",
      value: line20Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 + line21 - line22, 0)",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho total tax",
      lineCode: "line28",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line28",
      nodeType: "summary",
      value: line28TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "food tax credit + state_payments or canonical payment fallback + other refundable credits",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho total payments",
      lineCode: "line44",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.form40.line44",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form40.line19",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.summary.taxable_income",
      nodeType: "summary",
      value: line19TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form40.line28",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.summary.total_tax",
      nodeType: "summary",
      value: line28TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form40.line44",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line44 - line28, 0)",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line28 - line44, 0)",
      jurisdiction: IDAHO_STATE_CODE,
      label: "Idaho amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "id.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.id.starting_point", "carryforward"),
    createStateEdge("bridge.id.starting_point", "id.form40.line11"),
    createStateEdge("id.form40.line8", "id.form40.line11"),
    createStateEdge("id.form40.line10", "id.form40.line11"),
    createStateEdge("id.form40.line11", "id.form40.line19"),
    createStateEdge("id.form40.line16", "id.form40.line19"),
    createStateEdge("id.form40.line17", "id.form40.line19"),
    createStateEdge("id.form40.line18", "id.form40.line19"),
    createStateEdge("id.form40.line19", "id.form40.line20"),
    createStateEdge("id.form40.line20", "id.form40.line28"),
    createStateEdge("id.form40.line28", "id.summary.total_tax"),
    createStateEdge("id.form40.line44", "id.summary.total_payments"),
  ];

  const validationResults = [];

  if (itemizedDeductionEstimated) {
    validationResults.push(
      buildValidationResult({
        message:
          "Idaho itemized deductions were estimated from the federal itemized total minus state and local income or sales taxes because no Idaho-specific itemized deduction override was supplied.",
        nodeIds: ["id.form40.line16"],
        ruleId: "ID.itemized_deduction_derived_from_federal_itemized_total",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    line18QualifiedBusinessIncomeDeduction === 0 &&
    (args.input.facts.income.schedule_c_businesses.length > 0 ||
      args.input.facts.income.schedule_e_activities.length > 0)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Idaho qualified business income deduction was not supplied, so this resident module used zero for the Idaho QBI deduction.",
        nodeIds: ["id.form40.line18"],
        ruleId: "ID.qbi_deduction_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
