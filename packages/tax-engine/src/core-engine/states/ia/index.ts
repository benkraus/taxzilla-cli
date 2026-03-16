import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio } from "../return-kind";
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
} from "../resident";

const IOWA_STATE_CODE = "IA";
const IOWA_STATE_NAME = "Iowa";
const IOWA_FORM_RECORD_KEY = "ia1040";
const IOWA_FLAT_TAX_RATE = 0.038;
const IOWA_PERSONAL_EXEMPTION_CREDIT = 40;
const IOWA_AGE_OR_BLIND_CREDIT = 20;
const IOWA_DEPENDENT_CREDIT = 40;

function roundIowaRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function getIowaPersonalCreditCount(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  return filingStatus === "married_filing_jointly" ? 2 : 1;
}

function calculateIowaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly iowaTaxBeforeResidentCredits: number;
  readonly iowaTaxableIncome: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind !== "resident" ||
    args.iowaTaxBeforeResidentCredits <= 0 ||
    args.iowaTaxableIncome <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === IOWA_STATE_CODE && claim.income_amount > 0)
      .reduce((total, claim) => {
        const iowaLimitation = toWholeDollars(
          args.iowaTaxBeforeResidentCredits *
            Math.max(Math.min(claim.income_amount / args.iowaTaxableIncome, 1), 0),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, iowaLimitation);
      }, 0),
  );
}

function hasPotentialIowaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === IOWA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== IOWA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== IOWA_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: IOWA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, IOWA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const estimatedFederalTaxableIncome = Math.max(
    toWholeDollars(
      args.adjustedGrossIncome - getFederalDeductionBase(fullYearFederalSummary, filingStatus),
    ),
    0,
  );
  const line2FederalTaxableIncome = toWholeDollars(
    fullYearFederalSummary?.line15_taxable_income ?? estimatedFederalTaxableIncome,
  );
  const line3Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line4Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line5IowaTaxableIncome = Math.max(line2FederalTaxableIncome + line3Additions - line4Subtractions, 0);
  const regularTax = toWholeDollars(line5IowaTaxableIncome * IOWA_FLAT_TAX_RATE);
  const alternateTax = asNumber(formRecord?.alternate_tax_amount);
  const line6Tax = toWholeDollars(alternateTax == null ? regularTax : Math.min(regularTax, alternateTax));
  const line7LumpSumTax = toWholeDollars(asNumber(formRecord?.lump_sum_tax_amount) ?? 0);
  const personalExemptionCredit = toWholeDollars(
    asNumber(formRecord?.personal_exemption_credit_amount) ??
      getIowaPersonalCreditCount(filingStatus) * IOWA_PERSONAL_EXEMPTION_CREDIT,
  );
  const ageOrBlindCredit = toWholeDollars(
    asNumber(formRecord?.age_or_blind_credit_amount) ??
      (countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input)) * IOWA_AGE_OR_BLIND_CREDIT,
  );
  const dependentCredit = toWholeDollars(
    asNumber(formRecord?.dependent_credit_amount) ??
      countDependentExemptions(args.input) * IOWA_DEPENDENT_CREDIT,
  );
  const line8ExemptionCredits = personalExemptionCredit + ageOrBlindCredit + dependentCredit;
  const iowaTaxBeforeResidentCredits = Math.max(line6Tax + line7LumpSumTax - line8ExemptionCredits, 0);
  const line9OtherStateCredit = calculateIowaOtherStateCredit({
    formRecord,
    iowaTaxBeforeResidentCredits,
    iowaTaxableIncome: line5IowaTaxableIncome,
    stateArtifactsArgs: args,
  });
  const line9ResidentCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) +
      line9OtherStateCredit,
  );
  const line10NetIowaTax = Math.max(
    line6Tax + line7LumpSumTax - line8ExemptionCredits - line9ResidentCredits,
    0,
  );
  const line11SchoolDistrictSurtax = toWholeDollars(
    asNumber(formRecord?.school_district_surtax_amount) ??
      line10NetIowaTax * (asNumber(formRecord?.school_district_surtax_rate) ?? 0),
  );
  const line12OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line13TotalTaxBeforeIa126 = Math.max(
    line10NetIowaTax + line11SchoolDistrictSurtax + line12OtherTaxes,
    0,
  );
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn &&
    (args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome) > 0
      ? args.adjustedGrossIncome /
        (args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome)
      : null);
  const line34NetIncomeEverywhere = line5IowaTaxableIncome;
  const line35IowaSourceNetIncome = isAllocatedReturn
    ? Math.max(
        toWholeDollars(
          asNumber(formRecord?.ia126_iowa_source_net_income_amount) ??
            line34NetIncomeEverywhere * Math.max(allocationRatio ?? 0, 0),
        ),
        0,
      )
    : null;
  const line36NonIowaIncome =
    line35IowaSourceNetIncome == null
      ? null
      : Math.max(line34NetIncomeEverywhere - line35IowaSourceNetIncome, 0);
  const line37NonIowaRatio =
    !isAllocatedReturn || line36NonIowaIncome == null
      ? null
      : line34NetIncomeEverywhere > 0
        ? roundIowaRatio(line36NonIowaIncome / line34NetIncomeEverywhere)
        : 0;
  const line38Ia126Credit =
    line37NonIowaRatio == null
      ? 0
      : toWholeDollars(line13TotalTaxBeforeIa126 * line37NonIowaRatio);
  const line13TotalTax = Math.max(line13TotalTaxBeforeIa126 - line38Ia126Credit, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: IOWA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line13TotalTax - payments.totalPayments, 0),
    startingPoint: line35IowaSourceNetIncome ?? line2FederalTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line35IowaSourceNetIncome ?? line5IowaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line13TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point:
          line35IowaSourceNetIncome ?? summary.adjusted_gross_income_or_starting_point,
        allocation_ratio:
          line34NetIncomeEverywhere > 0 && line35IowaSourceNetIncome != null
            ? roundIowaRatio(line35IowaSourceNetIncome / line34NetIncomeEverywhere)
            : summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line15 rounded to Iowa whole-dollar rules",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa IA 1040 federal taxable income starting point",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ia.starting_point",
      nodeType: "bridge",
      value: line2FederalTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.ia1040.additions",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa additions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line3",
      nodeType: "calculation",
      value: line3Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.ia1040.subtractions",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa subtractions",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line4",
      nodeType: "calculation",
      value: line4Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line2 + line3 - line4, 0)",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa taxable income",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line5",
      nodeType: "calculation",
      value: line5IowaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "min(regular tax, alternate tax override when supplied)",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa income tax",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line6",
      nodeType: "calculation",
      value: line6Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Iowa personal, age/blind, and dependent exemption credits",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa exemption credits",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line8",
      nodeType: "calculation",
      value: line8ExemptionCredits,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line6 + line7 - line8 - line9, 0)",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa net tax after credits",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line10",
      nodeType: "calculation",
      value: line10NetIowaTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "school district surtax amount or line10 * school_district_surtax_rate",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa school district surtax",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line11",
      nodeType: "calculation",
      value: line11SchoolDistrictSurtax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line10 + line11 + other taxes",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa total tax",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line13",
      nodeType: "summary",
      value: line13TotalTaxBeforeIa126,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "IA 126 net income from everywhere after Iowa additions and subtractions",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa IA 126 net income from everywhere",
            lineCode: "ia126.line34",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.line34",
            nodeType: "calculation",
            value: line34NetIncomeEverywhere,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "IA 126 Iowa-source net income override or apportioned Iowa taxable income",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa IA 126 Iowa-source net income",
            lineCode: "ia126.line35",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.line35",
            nodeType: "calculation",
            value: line35IowaSourceNetIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "max(line34 - line35, 0)",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa IA 126 non-Iowa income",
            lineCode: "ia126.line36",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.line36",
            nodeType: "calculation",
            value: line36NonIowaIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "line36 / line34 rounded to four decimals",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa IA 126 non-Iowa income ratio",
            lineCode: "ia126.line37",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.line37",
            nodeType: "calculation",
            value: line37NonIowaRatio == null ? null : line37NonIowaRatio.toFixed(4),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "IA 1040 line13 tax before credit multiplied by IA 126 line37",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa IA 126 nonresident and part-year credit",
            lineCode: "ia126.credit",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.credit",
            nodeType: "calculation",
            value: line38Ia126Credit,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "max(ia1040.line13 - ia126.credit, 0)",
            jurisdiction: IOWA_STATE_CODE,
            label: "Iowa tax after IA 126 credit",
            lineCode: "ia126.net_tax",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ia.ia126.net_tax",
            nodeType: "summary",
            value: line13TotalTax,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa total payments",
      lineCode: "line26",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.ia1040.line26",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "ia1040.line5",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.summary.taxable_income",
      nodeType: "summary",
      value: line5IowaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "ia1040.line13",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.summary.total_tax",
      nodeType: "summary",
      value: line13TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "ia1040.line26",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line26 - line13, 0)",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line13 - line26, 0)",
      jurisdiction: IOWA_STATE_CODE,
      label: "Iowa amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ia.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line15", "bridge.ia.starting_point", "carryforward"),
    createStateEdge("bridge.ia.starting_point", "ia.ia1040.line5"),
    createStateEdge("ia.ia1040.line3", "ia.ia1040.line5"),
    createStateEdge("ia.ia1040.line4", "ia.ia1040.line5"),
    createStateEdge("ia.ia1040.line5", "ia.ia1040.line6"),
    createStateEdge("ia.ia1040.line6", "ia.ia1040.line10"),
    createStateEdge("ia.ia1040.line8", "ia.ia1040.line10"),
    createStateEdge("ia.ia1040.line10", "ia.ia1040.line13"),
    createStateEdge("ia.ia1040.line11", "ia.ia1040.line13"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ia.ia1040.line13", "ia.ia126.credit"),
          createStateEdge("ia.ia126.line37", "ia.ia126.credit"),
          createStateEdge("ia.ia1040.line13", "ia.ia126.net_tax"),
          createStateEdge("ia.ia126.credit", "ia.ia126.net_tax"),
          createStateEdge("ia.ia126.net_tax", "ia.summary.total_tax"),
        ]
      : [createStateEdge("ia.ia1040.line13", "ia.summary.total_tax")]),
    createStateEdge("ia.ia1040.line26", "ia.summary.total_payments"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ia.ia126.line34", "ia.ia126.line36"),
          createStateEdge("ia.ia126.line35", "ia.ia126.line36"),
          createStateEdge("ia.ia126.line34", "ia.ia126.line37"),
          createStateEdge("ia.ia126.line36", "ia.ia126.line37"),
        ]
      : []),
  ];

  const validationResults = [];

  if (fullYearFederalSummary == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Iowa federal taxable income was estimated from federal adjusted gross income minus the default federal deduction base because no computed federal summary was available on this path.",
        nodeIds: ["bridge.ia.starting_point"],
        ruleId: "IA.federal_taxable_income_estimated_from_agi",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    alternateTax == null &&
    (filingStatus !== "single" ||
      countSeniorTaxpayers(args.input) > 0 ||
      countBlindTaxpayers(args.input) > 0)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          isAllocatedReturn
            ? "Iowa alternate tax was not supplied, so this module kept the regular-tax full-year path before applying the IA 126 nonresident and part-year credit."
            : "Iowa alternate tax was not supplied, so this resident module stayed on the regular-tax path without an alternate-tax comparison.",
        nodeIds: ["ia.ia1040.line6"],
        ruleId: "IA.alternate_tax_defaulted_to_regular",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Iowa IA 126 was applied by computing full-year Iowa tax first and then reducing it by the non-Iowa income ratio derived from Iowa-source net income and net income from everywhere.",
        nodeIds: [
          "ia.ia126.line34",
          "ia.ia126.line35",
          "ia.ia126.line37",
          "ia.ia126.credit",
          "ia.ia126.net_tax",
        ],
        ruleId: "IA.ia126_credit_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line3Additions !== 0 || line4Subtractions !== 0) &&
    asNumber(formRecord?.ia126_iowa_source_net_income_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Iowa IA 126 Iowa-source net income was not supplied explicitly, so the engine apportioned Iowa additions and subtractions using the state allocation profile ratio.",
        nodeIds: ["ia.ia1040.line3", "ia.ia1040.line4", "ia.ia126.line35", "ia.ia126.line37"],
        ruleId: "IA.ia126_adjustments_allocated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    !isAllocatedReturn &&
    line9OtherStateCredit === 0 &&
    asNumber(formRecord?.tax_paid_to_other_state_credit) == null &&
    asNumber(formRecord?.other_state_credit_amount) == null &&
    hasPotentialIowaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Iowa credit for tax paid to another state stayed at zero because no IA 130 style claim amount was supplied for the available multistate facts.",
        nodeIds: ["ia.ia1040.line10"],
        ruleId: "IA.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  if (args.stateReturn.local_returns.length > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Iowa local return artifacts were supplied, and this IA 1040 module intentionally excludes those separate local liabilities and payments from the state summary. School district surtax remains modeled only through the IA 1040 plugin inputs.",
        nodeIds: ["ia.ia1040.line11"],
        ruleId: "IA.local_returns_excluded_from_ia1040",
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
