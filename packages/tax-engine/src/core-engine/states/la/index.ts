import { asNumber, sumNumbers } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
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

const LOUISIANA_STATE_CODE = "LA";
const LOUISIANA_STATE_NAME = "Louisiana";
const LOUISIANA_FORM_RECORD_KEY = "it540";
const LOUISIANA_FLAT_TAX_RATE = 0.03;
const LOUISIANA_RETIREMENT_EXCLUSION_PER_SENIOR = 6_000;
const LOUISIANA_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 25_000,
  married_filing_jointly: 25_000,
  married_filing_separately: 12_500,
  qualifying_surviving_spouse: 25_000,
  single: 12_500,
} as const;

function calculateLouisianaRetirementIncomeExclusion(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
}): number {
  const explicitAmount = asNumber(args.formRecord?.retirement_income_exclusion_amount);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  const seniorCount = countSeniorTaxpayers(args.input);

  if (seniorCount <= 0) {
    return 0;
  }

  const federalRetirementIncome =
    (args.federalSummary?.line4b_taxable_ira_distributions ?? 0) +
    (args.federalSummary?.line5b_taxable_pensions_and_annuities ?? 0);
  const fallbackRetirementIncome = sumNumbers(
    args.input.facts.income.retirement_distributions.map(
      (distribution) => distribution.taxable_amount ?? distribution.gross_distribution ?? 0,
    ),
  );
  const taxableRetirementIncome = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.retirement_income_amount) ??
        (federalRetirementIncome > 0 ? federalRetirementIncome : fallbackRetirementIncome),
    ),
    0,
  );

  return Math.min(
    taxableRetirementIncome,
    seniorCount * LOUISIANA_RETIREMENT_EXCLUSION_PER_SENIOR,
  );
}

function calculateLouisianaSocialSecuritySubtraction(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
}): number {
  const explicitAmount = asNumber(args.formRecord?.social_security_subtraction_amount);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  return Math.max(
    toWholeDollars(args.federalSummary?.line6b_taxable_social_security_benefits ?? 0),
    0,
  );
}

function calculateLouisianaOtherStateCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly totalIncomeTaxBeforeCredits: number;
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

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === LOUISIANA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0 || args.adjustedGrossIncome <= 0) {
          return total;
        }

        const limitationRatio = Math.max(
          Math.min(claim.income_amount / args.adjustedGrossIncome, 1),
          0,
        );
        const creditLimit = args.totalIncomeTaxBeforeCredits * limitationRatio;
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, creditLimit);
      }, 0),
  );
}

function hasPotentialLouisianaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === LOUISIANA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== LOUISIANA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== LOUISIANA_STATE_CODE &&
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
      stateName: LOUISIANA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, LOUISIANA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line3RetirementIncomeExclusion = calculateLouisianaRetirementIncomeExclusion({
    federalSummary: args.federalSummary,
    formRecord,
    input: args.input,
  });
  const line3SocialSecuritySubtraction = calculateLouisianaSocialSecuritySubtraction({
    federalSummary: args.federalSummary,
    formRecord,
  });
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions) +
      line3RetirementIncomeExclusion +
      line3SocialSecuritySubtraction,
  );
  const line4LouisianaAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const line5Deduction = toWholeDollars(
    asNumber(formRecord?.standard_deduction_amount) ??
      LOUISIANA_STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus],
  );
  const line7TaxableIncome = Math.max(line4LouisianaAdjustedGrossIncome - line5Deduction, 0);
  const line8Tax = toWholeDollars(line7TaxableIncome * LOUISIANA_FLAT_TAX_RATE);
  const line9OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line10OtherStateCredit = calculateLouisianaOtherStateCredit({
    adjustedGrossIncome: line4LouisianaAdjustedGrossIncome,
    formRecord,
    stateArtifactsArgs: args,
    totalIncomeTaxBeforeCredits: line8Tax + line9OtherTaxes,
  });
  const line10NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line10TotalCredits = line10OtherStateCredit + line10NonrefundableCredits;
  const line11TotalTax = Math.max(line8Tax + line9OtherTaxes - line10TotalCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: LOUISIANA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line11TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line11TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Louisiana whole-dollar rules",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana IT-540 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.la.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.it540.additions",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "state subtractions + state_specific_deductions + retirement exclusion + taxable social security subtraction",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Louisiana retirement income exclusion common path or override",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana retirement income exclusion",
      lineCode: "line3.retirement_exclusion",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line3.retirement_exclusion",
      nodeType: "calculation",
      value: line3RetirementIncomeExclusion,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Louisiana taxable Social Security subtraction common path or override",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana Social Security subtraction",
      lineCode: "line3.social_security_subtraction",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line3.social_security_subtraction",
      nodeType: "calculation",
      value: line3SocialSecuritySubtraction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3, 0)",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana adjusted gross income",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line4",
      nodeType: "calculation",
      value: line4LouisianaAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Louisiana standard deduction or override",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana deduction",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line5",
      nodeType: "calculation",
      value: line5Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line4 - line5, 0)",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line7",
      nodeType: "calculation",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line7 * 0.03",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana tax before credits",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line8",
      nodeType: "calculation",
      value: line8Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Louisiana Schedule C credit for taxes paid to another state",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana credit for taxes paid to another state",
      lineCode: "line10.schedule_c_credit",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line10.schedule_c_credit",
      nodeType: "calculation",
      value: line10OtherStateCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Louisiana nonrefundable credits",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana other nonrefundable credits",
      lineCode: "line10.nonrefundable_credits",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line10.nonrefundable_credits",
      nodeType: "calculation",
      value: line10NonrefundableCredits,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 + line9 - line10 total credits, 0)",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana total tax",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line11",
      nodeType: "summary",
      value: line11TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana total payments",
      lineCode: "line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.it540.line20",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it540.line7",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.summary.taxable_income",
      nodeType: "summary",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it540.line11",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.summary.total_tax",
      nodeType: "summary",
      value: line11TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it540.line20",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 - line11, 0)",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line11 - line20, 0)",
      jurisdiction: LOUISIANA_STATE_CODE,
      label: "Louisiana amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "la.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.la.starting_point", "carryforward"),
    createStateEdge("bridge.la.starting_point", "la.it540.line4"),
    createStateEdge("la.it540.line2", "la.it540.line4"),
    createStateEdge("la.it540.line3", "la.it540.line4"),
    createStateEdge("la.it540.line3.retirement_exclusion", "la.it540.line3"),
    createStateEdge("la.it540.line3.social_security_subtraction", "la.it540.line3"),
    createStateEdge("la.it540.line4", "la.it540.line7"),
    createStateEdge("la.it540.line5", "la.it540.line7"),
    createStateEdge("la.it540.line7", "la.it540.line8"),
    createStateEdge("la.it540.line8", "la.it540.line11"),
    createStateEdge("la.it540.line10.schedule_c_credit", "la.it540.line11"),
    createStateEdge("la.it540.line10.nonrefundable_credits", "la.it540.line11"),
    createStateEdge("la.it540.line11", "la.summary.total_tax"),
    createStateEdge("la.it540.line20", "la.summary.total_payments"),
  ];

  const validationResults = [];
  const socialSecurityBenefitTotal = toWholeDollars(
    sumNumbers(
      args.input.facts.income.social_security_benefits.map(
        (benefit) => benefit.net_benefits ?? benefit.benefits_paid ?? 0,
      ),
    ),
  );
  const retirementDistributionTotal = Math.max(
    toWholeDollars(
      sumNumbers(
        args.input.facts.income.retirement_distributions.map(
          (distribution) =>
            distribution.taxable_amount ?? distribution.gross_distribution ?? 0,
        ),
      ),
    ),
    0,
  );

  if (
    retirementDistributionTotal > 0 &&
    countSeniorTaxpayers(args.input) > 0 &&
    asNumber(formRecord?.retirement_income_exclusion_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Louisiana retirement-income exclusion was computed from TY2025 taxable retirement distributions using the resident senior exclusion cap.",
        nodeIds: ["la.it540.line3", "la.it540.line3.retirement_exclusion"],
        ruleId: "LA.retirement_income_exclusion_computed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    socialSecurityBenefitTotal > 0 &&
    asNumber(formRecord?.social_security_subtraction_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Louisiana Social Security subtraction was derived from federal taxable Social Security benefits on the resident common path.",
        nodeIds: ["la.it540.line3", "la.it540.line3.social_security_subtraction"],
        ruleId: "LA.social_security_subtraction_computed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (hasPotentialLouisianaOtherStateCreditInputs(args)) {
    if (
      line10OtherStateCredit === 0 &&
      asNumber(formRecord?.tax_paid_to_other_state_credit) == null &&
      asNumber(formRecord?.other_state_credit_amount) == null &&
      (args.input.facts.state?.other_state_tax_credit_claims ?? []).filter(
        (claim) => claim.resident_state_code === LOUISIANA_STATE_CODE,
      ).length === 0
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Louisiana credit for taxes paid to another state stayed at zero because no Schedule C style credit claim amount was supplied for the available multistate facts.",
          nodeIds: ["la.it540.line10.schedule_c_credit", "la.it540.line11"],
          ruleId: "LA.other_state_credit_not_claimed",
          severity: "info",
          status: "pass",
        }),
      );
    }
  }

  return {
    edges,
    nodes,
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
