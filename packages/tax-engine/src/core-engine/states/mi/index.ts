import { asBoolean, asNumber, asRecord, asString, getAgeOnLastDayOfTaxYear } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveCombinedStateTaxedIncome } from "../return-kind";
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
} from "../resident";

const MICHIGAN_STATE_CODE = "MI";
const MICHIGAN_STATE_NAME = "Michigan";
const MICHIGAN_FORM_RECORD_KEY = "mi1040";
const MICHIGAN_FLAT_TAX_RATE = 0.0425;
const MICHIGAN_PERSONAL_EXEMPTION = 5_800;
const MICHIGAN_SPECIAL_EXEMPTION = 3_400;
const MICHIGAN_EITC_RATE = 0.3;

function roundMichiganRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function getBirthYearOnMichiganReturn(args: StateArtifactsArgs): number | null {
  const people = [args.input.household.taxpayer, args.input.household.spouse];

  for (const person of people) {
    const dateOfBirth = asString(asRecord(person)?.date_of_birth);

    if (typeof dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return Number(dateOfBirth.slice(0, 4));
    }
  }

  return null;
}

function isPotentiallyEligibleForMichiganRetirementSubtraction(args: StateArtifactsArgs): boolean {
  const birthYear = getBirthYearOnMichiganReturn(args);

  if (birthYear != null) {
    return birthYear <= 1966;
  }

  const people = [args.input.household.taxpayer, args.input.household.spouse];

  return people.some((person) => {
    const age = getAgeOnLastDayOfTaxYear(asString(asRecord(person)?.date_of_birth), args.input.tax_year);
    return age != null && age >= 59;
  });
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MICHIGAN_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MICHIGAN_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const allocatedMichiganAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const line10FederalAdjustedGrossIncome = allocatedMichiganAdjustedGrossIncome;
  const line11Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line13Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line14AdjustedMichiganIncome = Math.max(
    allocatedMichiganAdjustedGrossIncome + line11Additions - line13Subtractions,
    0,
  );
  const line14FullYearAdjustedMichiganIncome = Math.max(
    fullYearFederalAdjustedGrossIncome + line11Additions - line13Subtractions,
    0,
  );
  const line15ExemptionAmount = toWholeDollars(
    (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
      MICHIGAN_PERSONAL_EXEMPTION +
      (asNumber(formRecord?.special_exemption_count) ?? 0) * MICHIGAN_SPECIAL_EXEMPTION +
      (asNumber(formRecord?.special_exemption_amount) ?? 0),
  );
  const line18AllocationPercentage =
    isAllocatedReturn && line14FullYearAdjustedMichiganIncome > 0 && line14AdjustedMichiganIncome > 0
      ? roundMichiganRatio(line14AdjustedMichiganIncome / line14FullYearAdjustedMichiganIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const line19ProratedExemptionAmount =
    line18AllocationPercentage == null
      ? line15ExemptionAmount
      : toWholeDollars(line15ExemptionAmount * line18AllocationPercentage);
  const effectiveExemptionAmount =
    line18AllocationPercentage == null ? line15ExemptionAmount : line19ProratedExemptionAmount;
  const line16TaxableIncome = Math.max(line14AdjustedMichiganIncome - effectiveExemptionAmount, 0);
  const line17Tax = toWholeDollars(line16TaxableIncome * MICHIGAN_FLAT_TAX_RATE);
  const line18OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line21NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line24TotalTax = Math.max(line17Tax + line18OtherTaxes - line21NonrefundableCredits, 0);
  const line28MichiganEitc =
    asBoolean(formRecord?.claim_michigan_eitc) === false
      ? 0
      : isAllocatedReturn && args.stateReturn.return_kind === "nonresident" && line16TaxableIncome <= 0
        ? 0
        : toWholeDollars(
            (fullYearFederalSummary?.line27a_earned_income_credit ?? 0) * MICHIGAN_EITC_RATE,
          );
  const refundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) + line28MichiganEitc,
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: MICHIGAN_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line24TotalTax - payments.totalPayments, 0),
    startingPoint: line14AdjustedMichiganIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line16TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line24TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        allocation_ratio: line18AllocationPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Michigan whole-dollar rules",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan MI-1040 federal adjusted gross income starting point",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.mi.starting_point",
      nodeType: "bridge",
      value: line10FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.mi1040.additions",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan additions",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line11",
      nodeType: "calculation",
      value: line11Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.mi1040.subtractions",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan subtractions",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line13",
      nodeType: "calculation",
      value: line13Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line10 + line11 - line13, 0)",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan adjusted income",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line14",
      nodeType: "calculation",
      value: line14AdjustedMichiganIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "personal and dependent exemptions + special exemptions",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan exemption amount",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line15",
      nodeType: "calculation",
      value: line15ExemptionAmount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line14 - line15, 0)",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan taxable income",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line16",
      nodeType: "calculation",
      value: line16TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line16 * 0.0425",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan tax before credits",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line17",
      nodeType: "calculation",
      value: line17Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line17 + line18 - line21, 0)",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan total tax",
      lineCode: "line24",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line24",
      nodeType: "summary",
      value: line24TotalTax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "MI-1040H Schedule NR line 17 adjusted gross income from all sources",
            jurisdiction: MICHIGAN_STATE_CODE,
            label: "Michigan Schedule NR total adjusted income",
            lineCode: "schedule_nr.line17",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "mi.schedule_nr.line17",
            nodeType: "calculation",
            value: line14FullYearAdjustedMichiganIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "MI-1040H Schedule NR line 18 Michigan income percentage",
            jurisdiction: MICHIGAN_STATE_CODE,
            label: "Michigan Schedule NR income percentage",
            lineCode: "schedule_nr.line18",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "mi.schedule_nr.line18",
            nodeType: "calculation",
            value:
              line18AllocationPercentage == null
                ? null
                : line18AllocationPercentage.toFixed(4),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "MI-1040H Schedule NR line 19 prorated exemption amount",
            jurisdiction: MICHIGAN_STATE_CODE,
            label: "Michigan Schedule NR prorated exemption amount",
            lineCode: "schedule_nr.line19",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "mi.schedule_nr.line19",
            nodeType: "calculation",
            value: line19ProratedExemptionAmount,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "federal EIC * 0.3 unless explicitly disabled",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan earned income tax credit",
      lineCode: "line28",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line28",
      nodeType: "calculation",
      value: line28MichiganEitc,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan total payments",
      lineCode: "line32",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.mi1040.line32",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mi1040.line16",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.summary.taxable_income",
      nodeType: "summary",
      value: line16TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mi1040.line24",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.summary.total_tax",
      nodeType: "summary",
      value: line24TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mi1040.line32",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line32 - line24, 0)",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line24 - line32, 0)",
      jurisdiction: MICHIGAN_STATE_CODE,
      label: "Michigan amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mi.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.mi.starting_point", "carryforward"),
    createStateEdge("bridge.mi.starting_point", "mi.mi1040.line14"),
    createStateEdge("mi.mi1040.line11", "mi.mi1040.line14"),
    createStateEdge("mi.mi1040.line13", "mi.mi1040.line14"),
    createStateEdge("mi.mi1040.line14", "mi.mi1040.line16"),
    createStateEdge("mi.mi1040.line15", "mi.mi1040.line16"),
    createStateEdge("mi.mi1040.line16", "mi.mi1040.line17"),
    createStateEdge("mi.mi1040.line17", "mi.mi1040.line24"),
    createStateEdge("mi.mi1040.line28", "mi.mi1040.line32"),
    createStateEdge("mi.mi1040.line24", "mi.summary.total_tax"),
    createStateEdge("mi.mi1040.line32", "mi.summary.total_payments"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("mi.schedule_nr.line17", "mi.schedule_nr.line18"),
          createStateEdge("mi.schedule_nr.line18", "mi.schedule_nr.line19"),
          createStateEdge("mi.schedule_nr.line19", "mi.mi1040.line16"),
        ]
      : []),
  ];

  const validationResults = [];
  const hasRetirementDistributions = args.input.facts.income.retirement_distributions.some(
    (distribution) => (distribution.gross_distribution ?? 0) > 0,
  );
  const needsRetirementSubtractionReview =
    hasRetirementDistributions &&
    line13Subtractions === 0 &&
    isPotentiallyEligibleForMichiganRetirementSubtraction(args);

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Michigan Schedule NR proration was applied using total adjusted income, Michigan adjusted income, and the prorated exemption amount.",
        nodeIds: [
          "mi.schedule_nr.line17",
          "mi.schedule_nr.line18",
          "mi.schedule_nr.line19",
        ],
        ruleId: "MI.schedule_nr_proration_applied",
        severity: "info",
      }),
    );
  }

  if (needsRetirementSubtractionReview) {
    validationResults.push(
      buildValidationResult({
        message:
          "Michigan retirement or pension subtraction may apply for this return under the 2025 birth-year and age rules, but no subtraction amount was supplied. The MI-1040 path kept the direct AGI-to-taxable-income calculation and left retirement subtraction at zero pending a qualified-benefits review.",
        nodeIds: ["mi.mi1040.line13"],
        ruleId: "MI.retirement_subtraction_review",
        severity: "info",
      }),
    );
  }

  if (args.stateReturn.local_returns.length > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Michigan city or local returns were supplied. The TY2025 MI-1040 summary excludes separate city-return taxes, credits, and payments, so the engine intentionally kept those amounts out of the state computation.",
        nodeIds: ["mi.summary.total_tax"],
        ruleId: "MI.local_returns_excluded_from_mi1040",
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
