import { asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveCombinedStateTaxedIncome } from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
  createStateEdge,
  createStateNode,
  getFederalDeductionBase,
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

const UTAH_STATE_CODE = "UT";
const UTAH_STATE_NAME = "Utah";
const UTAH_FORM_RECORD_KEY = "tc40";
const UTAH_FLAT_TAX_RATE = 0.045;
const UTAH_CREDIT_RATE = 0.06;
const UTAH_DEPENDENT_EXEMPTION_AMOUNT = 2_111;
const UTAH_PHASEOUT_RATE = 0.013;
const UTAH_PHASEOUT_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 27_320,
  married_filing_jointly: 36_426,
  married_filing_separately: 18_213,
  qualifying_surviving_spouse: 36_426,
  single: 18_213,
} as const;

function roundUtahIncomePercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateUtahOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly utahTaxBeforeOtherStateCredit: number;
  readonly utahTaxableIncome: number;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind === "nonresident" ||
    args.utahTaxBeforeOtherStateCredit <= 0 ||
    args.utahTaxableIncome <= 0
  ) {
    return 0;
  }

  return Math.min(
    toWholeDollars(
      (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
        .filter((claim) => claim.resident_state_code === UTAH_STATE_CODE)
        .reduce((total, claim) => {
          if (claim.income_amount <= 0) {
            return total;
          }

          const ratio = Math.max(Math.min(claim.income_amount / args.utahTaxableIncome, 1), 0);
          const utahTaxOnClaimedIncome = toWholeDollars(args.utahTaxBeforeOtherStateCredit * ratio);
          const creditableTax = claim.creditable_tax ?? claim.tax_paid;

          return total + Math.min(creditableTax, utahTaxOnClaimedIncome);
        }, 0),
    ),
    args.utahTaxBeforeOtherStateCredit,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: UTAH_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, UTAH_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const allocatedUtahAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const line1FederalAdjustedGrossIncome = allocatedUtahAdjustedGrossIncome;
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line4Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line9UtahTaxableIncome = Math.max(
    allocatedUtahAdjustedGrossIncome + line2Additions - line4Subtractions,
    0,
  );
  const line9FullYearUtahTaxableIncome = Math.max(
    fullYearFederalAdjustedGrossIncome + line2Additions - line4Subtractions,
    0,
  );
  const line10TaxBase = isAllocatedReturn ? line9FullYearUtahTaxableIncome : line9UtahTaxableIncome;
  const line10Tax = toWholeDollars(line10TaxBase * UTAH_FLAT_TAX_RATE);
  const federalDeductionBase = getFederalDeductionBase(fullYearFederalSummary, filingStatus);
  const stateIncomeTaxIncludedInFederalItemized = toWholeDollars(
    fullYearFederalSummary?.deduction_strategy === "itemized"
      ? args.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0
      : 0,
  );
  const dependentExemptionAmount = toWholeDollars(
    (asNumber(formRecord?.dependent_exemption_count) ?? countDependentExemptions(args.input)) *
      UTAH_DEPENDENT_EXEMPTION_AMOUNT,
  );
  const line17TaxpayerTaxCreditBase = Math.max(
    federalDeductionBase - stateIncomeTaxIncludedInFederalItemized + dependentExemptionAmount,
    0,
  );
  const line18TaxpayerTaxCredit = toWholeDollars(
    asNumber(formRecord?.taxpayer_tax_credit_override) ??
      Math.max(
        line17TaxpayerTaxCreditBase * UTAH_CREDIT_RATE -
          Math.max(
            fullYearFederalAdjustedGrossIncome -
              UTAH_PHASEOUT_THRESHOLD_BY_FILING_STATUS[filingStatus],
            0,
          ) *
            UTAH_PHASEOUT_RATE,
        0,
      ),
  );
  const line19OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line20NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line20ApportionableNonrefundableCredits = isAllocatedReturn
    ? toWholeDollars(
        readNamedAmountArrayTotal(formRecord?.apportionable_nonrefundable_credits) +
          (Array.isArray(formRecord?.apportionable_nonrefundable_credits)
            ? 0
            : line20NonrefundableCredits),
      )
    : line20NonrefundableCredits;
  const line20BaseNonapportionableNonrefundableCredits = isAllocatedReturn
    ? toWholeDollars(readNamedAmountArrayTotal(formRecord?.nonapportionable_nonrefundable_credits))
    : 0;
  const line21ResidentTaxBeforeOtherStateCredit = Math.max(
    line10Tax + line19OtherTaxes - line18TaxpayerTaxCredit - line20NonrefundableCredits,
    0,
  );
  const line40TaxBeforeRatio = Math.max(
    line10Tax + line19OtherTaxes - line18TaxpayerTaxCredit - line20ApportionableNonrefundableCredits,
    0,
  );
  const line41TaxBeforeNonapportionableCredits =
    isAllocatedReturn && line9UtahTaxableIncome > 0 && line9FullYearUtahTaxableIncome > 0
      ? toWholeDollars(
          line40TaxBeforeRatio *
            roundUtahIncomePercentage(line9UtahTaxableIncome / line9FullYearUtahTaxableIncome),
        )
      : null;
  const line20OtherStateCredit = calculateUtahOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
    utahTaxBeforeOtherStateCredit: isAllocatedReturn
      ? line41TaxBeforeNonapportionableCredits ?? 0
      : line21ResidentTaxBeforeOtherStateCredit,
    utahTaxableIncome: line9UtahTaxableIncome,
  });
  const line20NonapportionableNonrefundableCredits = isAllocatedReturn
    ? line20BaseNonapportionableNonrefundableCredits + line20OtherStateCredit
    : 0;
  const line21ResidentTotalTax = Math.max(
    line21ResidentTaxBeforeOtherStateCredit - line20OtherStateCredit,
    0,
  );
  const line39IncomePercentage =
    isAllocatedReturn && line9FullYearUtahTaxableIncome > 0 && line9UtahTaxableIncome > 0
      ? roundUtahIncomePercentage(line9UtahTaxableIncome / line9FullYearUtahTaxableIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const line41AllocatedTax =
    line39IncomePercentage == null
      ? null
      : Math.max(
          toWholeDollars(line40TaxBeforeRatio * line39IncomePercentage) -
            line20NonapportionableNonrefundableCredits,
          0,
        );
  const line21TotalTax = isAllocatedReturn ? line41AllocatedTax ?? 0 : line21ResidentTotalTax;
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: UTAH_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line21TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line9UtahTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line21TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        allocation_ratio: line39IncomePercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Utah whole-dollar rules",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah TC-40 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ut.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.tc40.additions",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.tc40.subtractions",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah subtractions",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line4",
      nodeType: "calculation",
      value: line4Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line4, 0)",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah taxable income",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line9",
      nodeType: "calculation",
      value: line9UtahTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line9 * 0.045",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah tax before credits",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line10",
      nodeType: "calculation",
      value: line10Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Utah taxpayer tax credit worksheet",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah taxpayer tax credit",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line18",
      nodeType: "calculation",
      value: line18TaxpayerTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "TC-40S credit carried to TC-40A Part 4 code 17",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah credit for income tax paid to another state",
      lineCode: "tc40a.code17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40a.code17",
      nodeType: "calculation",
      value: line20OtherStateCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line10 + line19 - line18 - line20, 0)",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah total tax",
      lineCode: "line21",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line21",
      nodeType: "summary",
      value: line21TotalTax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "TC-40B income percentage",
            jurisdiction: UTAH_STATE_CODE,
            label: "Utah TC-40B income percentage",
            lineCode: "tc40b.line39",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ut.tc40b.line39",
            nodeType: "calculation",
            value: line39IncomePercentage == null ? null : line39IncomePercentage.toFixed(4),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "TC-40B tax before applying income percentage",
            jurisdiction: UTAH_STATE_CODE,
            label: "Utah TC-40B tax before income percentage",
            lineCode: "tc40b.line40",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ut.tc40b.line40",
            nodeType: "calculation",
            value: line40TaxBeforeRatio,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "TC-40B apportioned Utah tax",
            jurisdiction: UTAH_STATE_CODE,
            label: "Utah TC-40B apportioned tax",
            lineCode: "tc40b.line41",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ut.tc40b.line41",
            nodeType: "summary",
            value: line41AllocatedTax,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah total payments",
      lineCode: "line24",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.tc40.line24",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "tc40.line9",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.summary.taxable_income",
      nodeType: "summary",
      value: line9UtahTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "tc40.line21",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.summary.total_tax",
      nodeType: "summary",
      value: line21TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "tc40.line24",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line24 - line21, 0)",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line21 - line24, 0)",
      jurisdiction: UTAH_STATE_CODE,
      label: "Utah amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ut.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ut.starting_point", "carryforward"),
    createStateEdge("bridge.ut.starting_point", "ut.tc40.line9"),
    createStateEdge("ut.tc40.line2", "ut.tc40.line9"),
    createStateEdge("ut.tc40.line4", "ut.tc40.line9"),
    createStateEdge("ut.tc40.line9", "ut.tc40.line10"),
    createStateEdge("ut.tc40.line10", "ut.tc40.line21"),
    createStateEdge("ut.tc40.line18", "ut.tc40.line21"),
    createStateEdge("ut.tc40a.code17", isAllocatedReturn ? "ut.tc40b.line41" : "ut.tc40.line21"),
    createStateEdge("ut.tc40.line21", "ut.summary.total_tax"),
    createStateEdge("ut.tc40.line24", "ut.summary.total_payments"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ut.tc40b.line39", "ut.tc40b.line41"),
          createStateEdge("ut.tc40b.line40", "ut.tc40b.line41"),
          createStateEdge("ut.tc40b.line41", "ut.summary.total_tax"),
        ]
      : []),
  ];

  const validationResults = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Utah TC-40B apportionment was applied using the Utah income percentage and the full-year TC-40 tax before allocation.",
        nodeIds: ["ut.tc40b.line39", "ut.tc40b.line40", "ut.tc40b.line41"],
        ruleId: "UT.tc40b_income_percentage_applied",
        severity: "info",
      }),
    );

    if (!Array.isArray(formRecord?.apportionable_nonrefundable_credits)) {
      validationResults.push(
        buildValidationResult({
          message:
            "Utah TC-40B does not currently distinguish apportionable and nonapportionable nonrefundable credits unless they are supplied explicitly, so existing Utah nonrefundable credits were treated as apportionable on this allocated return.",
          nodeIds: ["ut.tc40b.line40"],
          ruleId: "UT.tc40b_credit_classification_assumed",
          severity: "info",
        }),
      );
    }
  }

  if (args.input.requested_jurisdictions.states.filter((stateCode) => stateCode !== UTAH_STATE_CODE).length > 0) {
    if (line20OtherStateCredit > 0) {
      validationResults.push(
        buildValidationResult({
          message:
            "Utah credit for income tax paid to another state was computed from structured TC-40S-style multistate credit claims and carried to TC-40A code 17.",
          nodeIds: ["ut.tc40a.code17", isAllocatedReturn ? "ut.tc40b.line41" : "ut.tc40.line21"],
          ruleId: "UT.other_state_credit_applied",
          severity: "info",
          status: "pass",
        }),
      );
    } else if (args.stateReturn.return_kind !== "nonresident") {
      validationResults.push(
        buildValidationResult({
          message:
            "Utah requested-jurisdictions included another state, but no TC-40S-style credit claim or explicit code 17 override was supplied, so the Utah other-state credit remained zero.",
          nodeIds: ["ut.tc40a.code17", isAllocatedReturn ? "ut.tc40b.line41" : "ut.tc40.line21"],
          ruleId: "UT.other_state_credit_review",
          severity: "info",
        }),
      );
    }
  }

  return {
    edges,
    nodes,
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
