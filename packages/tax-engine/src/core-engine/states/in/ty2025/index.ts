import { asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveCombinedStateTaxedIncome } from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
  countPersonalExemptions,
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

const INDIANA_STATE_CODE = "IN";
const INDIANA_STATE_NAME = "Indiana";
const INDIANA_FORM_RECORD_KEY = "it40";
const INDIANA_FLAT_TAX_RATE = 0.03;
const INDIANA_PERSONAL_EXEMPTION = 1_000;

function roundIndianaProrationRatio(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: INDIANA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, INDIANA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const indianaTaxedIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const line1FederalAdjustedGrossIncome = indianaTaxedIncome;
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line4ExemptionAmount = toWholeDollars(
    (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
      INDIANA_PERSONAL_EXEMPTION +
      (asNumber(formRecord?.additional_exemption_amount) ?? 0),
  );
  const line8ScheduleDProrationRatio =
    isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0 && indianaTaxedIncome > 0
      ? roundIndianaProrationRatio(indianaTaxedIncome / fullYearFederalAdjustedGrossIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const line9ProratedExemptionAmount =
    line8ScheduleDProrationRatio == null
      ? line4ExemptionAmount
      : toWholeDollars(line4ExemptionAmount * line8ScheduleDProrationRatio);
  const effectiveExemptionAmount =
    line8ScheduleDProrationRatio == null ? line4ExemptionAmount : line9ProratedExemptionAmount;
  const line7IndianaTaxableIncome = Math.max(
    indianaTaxedIncome + line2Additions - line3Subtractions - effectiveExemptionAmount,
    0,
  );
  const line8StateTax = toWholeDollars(line7IndianaTaxableIncome * INDIANA_FLAT_TAX_RATE);
  const countyTaxableIncome = toWholeDollars(
    asNumber(formRecord?.county_taxable_income) ??
      (isAllocatedReturn ? 0 : line7IndianaTaxableIncome),
  );
  const line9CountyTax = toWholeDollars(
    asNumber(formRecord?.county_tax_amount) ??
      countyTaxableIncome * (asNumber(formRecord?.county_tax_rate) ?? 0),
  );
  const line10OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line11NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line12TotalTax = Math.max(line8StateTax + line9CountyTax + line10OtherTaxes - line11NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: INDIANA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line12TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7IndianaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line12TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        allocation_ratio:
          line8ScheduleDProrationRatio ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Indiana whole-dollar rules",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana IT-40 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.in.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.it40.additions",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.it40.subtractions",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana deductions and subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "basic exemptions + plugin_fact_bag.it40.additional_exemption_amount",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana exemption amount",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line4",
      nodeType: "calculation",
      value: line4ExemptionAmount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3 - line4, 0)",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line7",
      nodeType: "calculation",
      value: line7IndianaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line7 * 0.03",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana state adjusted gross income tax",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line8",
      nodeType: "calculation",
      value: line8StateTax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Indiana Schedule D line 7 total exemptions before proration",
            jurisdiction: INDIANA_STATE_CODE,
            label: "Indiana Schedule D total exemptions before proration",
            lineCode: "schedule_d.line7",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "in.schedule_d.line7",
            nodeType: "calculation",
            value: line4ExemptionAmount,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Indiana Schedule A box 21D proration ratio rounded to three decimals",
            jurisdiction: INDIANA_STATE_CODE,
            label: "Indiana Schedule D proration ratio",
            lineCode: "schedule_d.line8",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "in.schedule_d.line8",
            nodeType: "calculation",
            value:
              line8ScheduleDProrationRatio == null
                ? null
                : line8ScheduleDProrationRatio.toFixed(3),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Indiana Schedule D line 9 prorated exemptions",
            jurisdiction: INDIANA_STATE_CODE,
            label: "Indiana Schedule D prorated exemptions",
            lineCode: "schedule_d.line9",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "in.schedule_d.line9",
            nodeType: "calculation",
            value: line9ProratedExemptionAmount,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "county_tax_amount or county_taxable_income * county_tax_rate",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana county income tax",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line9",
      nodeType: "calculation",
      value: line9CountyTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 + line9 + line10 - line11, 0)",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana total tax",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line12",
      nodeType: "summary",
      value: line12TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana total payments",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.it40.line17",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it40.line7",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.summary.taxable_income",
      nodeType: "summary",
      value: line7IndianaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it40.line12",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.summary.total_tax",
      nodeType: "summary",
      value: line12TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it40.line17",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line17 - line12, 0)",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line12 - line17, 0)",
      jurisdiction: INDIANA_STATE_CODE,
      label: "Indiana amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "in.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.in.starting_point", "carryforward"),
    createStateEdge("bridge.in.starting_point", "in.it40.line7"),
    createStateEdge("in.it40.line2", "in.it40.line7"),
    createStateEdge("in.it40.line3", "in.it40.line7"),
    createStateEdge("in.it40.line4", "in.it40.line7"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("in.schedule_d.line7", "in.schedule_d.line9"),
          createStateEdge("in.schedule_d.line8", "in.schedule_d.line9"),
          createStateEdge("in.schedule_d.line9", "in.it40.line7"),
        ]
      : []),
    createStateEdge("in.it40.line7", "in.it40.line8"),
    createStateEdge("in.it40.line7", "in.it40.line9"),
    createStateEdge("in.it40.line8", "in.it40.line12"),
    createStateEdge("in.it40.line9", "in.it40.line12"),
    createStateEdge("in.it40.line12", "in.summary.total_tax"),
    createStateEdge("in.it40.line17", "in.summary.total_payments"),
  ];

  const validationResults = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Indiana IT-40PNR used Indiana-taxed income as the starting point and prorated Schedule D exemptions using the Schedule A proration ratio.",
        nodeIds: ["in.schedule_d.line7", "in.schedule_d.line8", "in.schedule_d.line9"],
        ruleId: "IN.schedule_d_proration_applied",
        severity: "info",
      }),
    );
  }

  if (
    asNumber(formRecord?.county_tax_amount) == null &&
    asNumber(formRecord?.county_tax_rate) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Indiana county income tax was not supplied, so this resident module computed only the state base tax path and left county tax at zero.",
        nodeIds: ["in.it40.line9"],
        ruleId: "IN.county_tax_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    asNumber(formRecord?.county_tax_amount) == null &&
    asNumber(formRecord?.county_tax_rate) != null &&
    asNumber(formRecord?.county_taxable_income) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Indiana county tax on part-year and nonresident returns depends on county-specific sourcing and residency facts. Supply county_tax_amount or county_taxable_income explicitly instead of relying on the resident county-tax shortcut.",
        nodeIds: ["in.it40.line9"],
        ruleId: "IN.county_taxable_income_default_zero",
        severity: "info",
      }),
    );
  }

  if (args.stateReturn.local_returns.length > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Indiana local returns were present, and this module intentionally excludes those separate local liabilities and payments from the state IT-40 summary.",
        nodeIds: ["in.it40.line9"],
        ruleId: "IN.local_returns_excluded_from_it40",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
