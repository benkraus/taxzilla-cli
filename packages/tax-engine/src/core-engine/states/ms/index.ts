import { asNumber, sumNamedAmounts, sumNumbers } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
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
} from "../resident";

const MISSISSIPPI_STATE_CODE = "MS";
const MISSISSIPPI_STATE_NAME = "Mississippi";
const MISSISSIPPI_FORM_RECORD_KEY = "form80105";
const MISSISSIPPI_FLAT_TAX_RATE = 0.044;
const MISSISSIPPI_OTHER_STATE_CREDIT_ZERO_BRACKET = 10_000;
const MISSISSIPPI_ZERO_TAX_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 10_000,
  married_filing_jointly: 20_000,
  married_filing_separately: 10_000,
  qualifying_surviving_spouse: 20_000,
  single: 10_000,
} as const;
const MISSISSIPPI_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 3_400,
  married_filing_jointly: 4_600,
  married_filing_separately: 2_300,
  qualifying_surviving_spouse: 4_600,
  single: 2_300,
} as const;
const MISSISSIPPI_BASE_EXEMPTION_BY_FILING_STATUS = {
  head_of_household: 8_000,
  married_filing_jointly: 12_000,
  married_filing_separately: 6_000,
  qualifying_surviving_spouse: 12_000,
  single: 6_000,
} as const;
const MISSISSIPPI_ADDITIONAL_EXEMPTION = 1_500;

function calculateMississippiDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly itemizedDeductionEstimated: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      itemizedDeductionEstimated: false,
    };
  }

  const standardDeduction = MISSISSIPPI_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const itemizedOverride = asNumber(args.formRecord?.itemized_deductions_total);
  const itemizedFacts = args.stateArtifactsArgs.input.facts.itemized_deductions;
  const factDerivedMedicalDeduction = Math.max(
    toWholeDollars(itemizedFacts.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.stateArtifactsArgs.adjustedGrossIncome * 0.075),
    0,
  );
  const factDerivedTaxes = toWholeDollars(
    asNumber(args.formRecord?.mississippi_schedule_a_taxes_amount) ??
      (itemizedFacts.real_estate_taxes ?? 0) +
        (itemizedFacts.personal_property_taxes ?? 0) +
        (itemizedFacts.other_taxes ?? 0),
  );
  const factDerivedInterest = toWholeDollars(
    sumNumbers(
      itemizedFacts.mortgage_interest_items.map(
        (item) =>
          (item.mortgage_interest_received ?? 0) +
          (item.points_paid ?? 0) +
          (item.mortgage_insurance_premiums ?? 0),
      ),
    ),
  );
  const factDerivedCharity = toWholeDollars(
    (itemizedFacts.charitable_cash_contributions ?? 0) +
      (itemizedFacts.charitable_noncash_contributions ?? 0),
  );
  const factDerivedCasualtyLosses = toWholeDollars(itemizedFacts.casualty_and_theft_losses ?? 0);
  const factDerivedOtherDeductions = toWholeDollars(
    sumNamedAmounts(itemizedFacts.other_itemized_deductions),
  );
  const factDerivedItemizedTotal = toWholeDollars(
    factDerivedMedicalDeduction +
      factDerivedTaxes +
      factDerivedInterest +
      factDerivedCharity +
      factDerivedCasualtyLosses +
      factDerivedOtherDeductions,
  );
  const estimatedItemizedTotal =
    factDerivedItemizedTotal > 0
      ? factDerivedItemizedTotal
      : args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? Math.max(
            toWholeDollars(args.stateArtifactsArgs.federalSummary.itemized_deduction_total) -
              toWholeDollars(
                args.stateArtifactsArgs.input.facts.itemized_deductions
                  .state_and_local_income_or_sales_taxes ?? 0,
              ),
            0,
          )
        : 0;
  const itemizedDeductionsTotal = toWholeDollars(itemizedOverride ?? estimatedItemizedTotal);

  return {
    deduction: Math.max(standardDeduction, itemizedDeductionsTotal),
    itemizedDeductionEstimated:
      itemizedOverride == null &&
      factDerivedItemizedTotal <= 0 &&
      args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized",
  };
}

function calculateMississippiOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line17IncomeTaxDue: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  const claims = (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
    .filter((claim) => claim.resident_state_code === MISSISSIPPI_STATE_CODE)
    .filter((claim) => claim.income_amount > 0);
  const totalClaimedIncome = toWholeDollars(sumNumbers(claims.map((claim) => claim.income_amount)));

  if (totalClaimedIncome <= 0 || args.line17IncomeTaxDue <= 0) {
    return 0;
  }

  const mississippiTaxAtHighestRate = toWholeDollars(
    Math.max(totalClaimedIncome - MISSISSIPPI_OTHER_STATE_CREDIT_ZERO_BRACKET, 0) *
      MISSISSIPPI_FLAT_TAX_RATE,
  );
  const totalCredit = claims.reduce((total, claim) => {
    const apportionedMississippiTax = toWholeDollars(
      mississippiTaxAtHighestRate *
        Math.max(Math.min(claim.income_amount / totalClaimedIncome, 1), 0),
    );
    const creditableTax = claim.creditable_tax ?? claim.tax_paid;

    return total + Math.min(creditableTax, apportionedMississippiTax);
  }, 0);

  return Math.min(toWholeDollars(totalCredit), args.line17IncomeTaxDue);
}

function readMississippiPassThroughEntityCredit(
  formRecord: Record<string, unknown> | undefined,
): number {
  return toWholeDollars(
    asNumber(formRecord?.pass_through_entity_tax_credit) ??
      asNumber(formRecord?.pass_through_entity_tax_credit_amount) ??
      asNumber(formRecord?.electing_pass_through_entity_tax_credit_amount) ??
      asNumber(formRecord?.form_80_161_line_3d_amount) ??
      0,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MISSISSIPPI_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MISSISSIPPI_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line4MississippiAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const { deduction: line5Deduction, itemizedDeductionEstimated } = calculateMississippiDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line6Exemption = toWholeDollars(
    asNumber(formRecord?.exemption_amount) ??
      MISSISSIPPI_BASE_EXEMPTION_BY_FILING_STATUS[filingStatus] +
        countDependentExemptions(args.input) * MISSISSIPPI_ADDITIONAL_EXEMPTION +
        (countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input)) *
          MISSISSIPPI_ADDITIONAL_EXEMPTION,
  );
  const line7TaxableIncome = Math.max(line4MississippiAdjustedGrossIncome - line5Deduction - line6Exemption, 0);
  const line17IncomeTaxDue = toWholeDollars(
    Math.max(line7TaxableIncome - MISSISSIPPI_ZERO_TAX_THRESHOLD_BY_FILING_STATUS[filingStatus], 0) *
      MISSISSIPPI_FLAT_TAX_RATE,
  );
  const line18OtherStateCredit = calculateMississippiOtherStateCredit({
    formRecord,
    line17IncomeTaxDue,
    stateArtifactsArgs: args,
  });
  const line19OtherCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line20NetIncomeTaxDue = Math.max(
    line17IncomeTaxDue - line18OtherStateCredit - line19OtherCredits,
    0,
  );
  const line21And22OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line23TotalTax = Math.max(line20NetIncomeTaxDue + line21And22OtherTaxes, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const line26PassThroughEntityTaxCredit = readMississippiPassThroughEntityCredit(formRecord);
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord) + line26PassThroughEntityTaxCredit,
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: MISSISSIPPI_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line23TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line23TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Mississippi whole-dollar rules",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi 80-105 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ms.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form80105.additions",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form80105.subtractions",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3, 0)",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi adjusted gross income",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line4",
      nodeType: "calculation",
      value: line4MississippiAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "greater of Mississippi standard deduction or Mississippi itemized deductions",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi deduction",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line5",
      nodeType: "calculation",
      value: line5Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Mississippi filing-status, dependent, age, and blindness exemptions",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi exemptions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line6",
      nodeType: "calculation",
      value: line6Exemption,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line4 - line5 - line6, 0)",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line7",
      nodeType: "calculation",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line7 - zero-tax threshold, 0) * 0.044",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi income tax",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line17",
      nodeType: "calculation",
      value: line17IncomeTaxDue,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 + line21_22, 0)",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi total tax",
      lineCode: "line23",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line23",
      nodeType: "summary",
      value: line23TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi total payments",
      lineCode: "line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.form80105.line20",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form80105.line7",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.summary.taxable_income",
      nodeType: "summary",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form80105.line23",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.summary.total_tax",
      nodeType: "summary",
      value: line23TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form80105.line20",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 - line23, 0)",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line11 - line20, 0)",
      jurisdiction: MISSISSIPPI_STATE_CODE,
      label: "Mississippi amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ms.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ms.starting_point", "carryforward"),
    createStateEdge("bridge.ms.starting_point", "ms.form80105.line4"),
    createStateEdge("ms.form80105.line2", "ms.form80105.line4"),
    createStateEdge("ms.form80105.line3", "ms.form80105.line4"),
    createStateEdge("ms.form80105.line4", "ms.form80105.line7"),
    createStateEdge("ms.form80105.line5", "ms.form80105.line7"),
    createStateEdge("ms.form80105.line6", "ms.form80105.line7"),
    createStateEdge("ms.form80105.line7", "ms.form80105.line17"),
    createStateEdge("ms.form80105.line17", "ms.form80105.line23"),
    createStateEdge("ms.form80105.line23", "ms.summary.total_tax"),
    createStateEdge("ms.form80105.line20", "ms.summary.total_payments"),
  ];

  const validationResults = [];

  if (itemizedDeductionEstimated) {
    validationResults.push(
      buildValidationResult({
        message:
          "Mississippi itemized deductions were derived from the federal itemized total after removing state and local income or sales taxes because no Mississippi-specific itemized total was supplied.",
        nodeIds: ["ms.form80105.line5"],
        ruleId: "MS.itemized_deduction_derived_from_federal_itemized_total",
        severity: "info",
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
