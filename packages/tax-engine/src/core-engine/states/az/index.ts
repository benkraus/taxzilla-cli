import { asBoolean, asNumber, asRecord, asString, getAgeOnLastDayOfTaxYear } from "../../helpers";
import { sumItemizedDeductionTotals } from "../../foundations";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
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

const ARIZONA_STATE_CODE = "AZ";
const ARIZONA_STATE_NAME = "Arizona";
const ARIZONA_FORM_RECORD_KEY = "form140";
const ARIZONA_FLAT_TAX_RATE = 0.025;
const ARIZONA_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 23_625,
  married_filing_jointly: 31_500,
  married_filing_separately: 15_750,
  qualifying_surviving_spouse: 31_500,
  single: 15_750,
} as const;
const ARIZONA_DEPENDENT_CREDIT_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 200_000,
  married_filing_jointly: 400_000,
  married_filing_separately: 200_000,
  qualifying_surviving_spouse: 400_000,
  single: 200_000,
} as const;
const ARIZONA_DEPENDENT_CREDIT_UNDER_17 = 100;
const ARIZONA_DEPENDENT_CREDIT_17_AND_OVER = 25;
const ARIZONA_AGE_65_EXEMPTION = 2_100;
const ARIZONA_BLIND_EXEMPTION = 1_500;
const ARIZONA_OTHER_EXEMPTION = 2_300;
const ARIZONA_QUALIFYING_PARENT_EXEMPTION = 10_000;

function countArizonaDependentCreditBuckets(args: StateArtifactsArgs): {
  readonly age17AndOverCount: number;
  readonly under17Count: number;
} {
  let under17Count = 0;
  let age17AndOverCount = 0;

  for (const dependent of args.input.household.dependents) {
    const age = getAgeOnLastDayOfTaxYear(
      asString(asRecord(dependent)?.date_of_birth),
      args.input.tax_year,
    );

    if (age != null && age < 17) {
      under17Count += 1;
      continue;
    }

    age17AndOverCount += 1;
  }

  return {
    age17AndOverCount,
    under17Count,
  };
}

function calculateArizonaDependentCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const overrideAmount = asNumber(args.formRecord?.dependent_tax_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const under17Count = toWholeDollars(
    asNumber(args.formRecord?.dependent_credit_under_17_count) ??
      countArizonaDependentCreditBuckets(args.stateArtifactsArgs).under17Count,
  );
  const age17AndOverCount = toWholeDollars(
    asNumber(args.formRecord?.dependent_credit_age_17_and_over_count) ??
      countArizonaDependentCreditBuckets(args.stateArtifactsArgs).age17AndOverCount,
  );
  const baseCredit =
    under17Count * ARIZONA_DEPENDENT_CREDIT_UNDER_17 +
    age17AndOverCount * ARIZONA_DEPENDENT_CREDIT_17_AND_OVER;
  const threshold = ARIZONA_DEPENDENT_CREDIT_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const excessIncome = Math.max(args.adjustedGrossIncome - threshold, 0);
  const reductionSteps = Math.ceil(excessIncome / 1_000);
  const phaseoutMultiplier =
    asNumber(args.formRecord?.dependent_tax_credit_multiplier) ??
    Math.max(1 - reductionSteps * 0.05, 0);

  return toWholeDollars(baseCredit * phaseoutMultiplier);
}

function calculateArizonaDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly usedFederalItemizedProxy: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      usedFederalItemizedProxy: false,
    };
  }

  const charitableContributionBase = toWholeDollars(
    (args.stateArtifactsArgs.input.facts.itemized_deductions.charitable_cash_contributions ?? 0) +
      (args.stateArtifactsArgs.input.facts.itemized_deductions.charitable_noncash_contributions ?? 0),
  );
  const charitableAddOn = toWholeDollars(
    asNumber(args.formRecord?.charitable_standard_deduction_addition) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "standard"
        ? charitableContributionBase * 0.25
        : 0),
  );
  const standardDeduction =
    ARIZONA_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus] + charitableAddOn;
  const federalItemizedFactsTotal = toWholeDollars(
    sumItemizedDeductionTotals(args.stateArtifactsArgs.input.facts.itemized_deductions),
  );
  const itemizedDeductionsTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (federalItemizedFactsTotal > 0 ? federalItemizedFactsTotal : undefined) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
        : 0),
  );
  const useItemizedDeduction =
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionsTotal > standardDeduction);

  if (useItemizedDeduction) {
    return {
      deduction: itemizedDeductionsTotal,
      usedFederalItemizedProxy:
        asNumber(args.formRecord?.itemized_deductions_total) == null &&
        federalItemizedFactsTotal === 0 &&
        args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized",
    };
  }

  return {
    deduction: standardDeduction,
    usedFederalItemizedProxy: false,
  };
}

function calculateArizonaExemptions(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitTotal = asNumber(args.formRecord?.total_exemption_amount);
  const legacyOtherExemptionAmount = asNumber(args.formRecord?.other_exemption_amount);

  if (explicitTotal != null) {
    return toWholeDollars(explicitTotal);
  }

  const ageExemption = countSeniorTaxpayers(args.stateArtifactsArgs.input) * ARIZONA_AGE_65_EXEMPTION;
  const blindExemption = countBlindTaxpayers(args.stateArtifactsArgs.input) * ARIZONA_BLIND_EXEMPTION;
  const otherExemptionCount = toWholeDollars(
    asNumber(args.formRecord?.other_exemption_count) ??
      asNumber(args.formRecord?.other_exemption_qualifying_person_count) ??
      0,
  );
  const qualifyingParentCount = toWholeDollars(
    asNumber(args.formRecord?.qualifying_parent_grandparent_count) ??
      asNumber(args.formRecord?.qualifying_parents_and_grandparents_count) ??
      0,
  );

  return toWholeDollars(
    ageExemption +
      blindExemption +
      (legacyOtherExemptionAmount ?? otherExemptionCount * ARIZONA_OTHER_EXEMPTION) +
      qualifyingParentCount * ARIZONA_QUALIFYING_PARENT_EXEMPTION,
  );
}

function calculateArizonaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly totalTaxBeforeCredits: number;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(Math.max(explicitCredit, 0));
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  const arizonaAdjustedGrossIncome = Math.max(
    toWholeDollars(args.stateArtifactsArgs.adjustedGrossIncome) +
      sumStateAdditionAmounts(
        args.stateArtifactsArgs.stateReturn,
        readNamedAmountArrayTotal(args.formRecord?.additions),
      ) -
      sumStateSubtractionAmounts(
        args.stateArtifactsArgs.stateReturn,
        readNamedAmountArrayTotal(args.formRecord?.subtractions),
      ),
    0,
  );

  if (arizonaAdjustedGrossIncome <= 0 || args.totalTaxBeforeCredits <= 0) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === ARIZONA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const arizonaCreditLimit = toWholeDollars(
          args.totalTaxBeforeCredits *
            Math.max(Math.min(claim.income_amount / arizonaAdjustedGrossIncome, 1), 0),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, arizonaCreditLimit);
      }, 0),
  );
}

function hasPotentialArizonaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === ARIZONA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== ARIZONA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== ARIZONA_STATE_CODE &&
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
      stateName: ARIZONA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, ARIZONA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line15FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line16Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line18Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line42ArizonaAdjustedGrossIncome = Math.max(
    line15FederalAdjustedGrossIncome + line16Additions - line18Subtractions,
    0,
  );
  const deductionResult = calculateArizonaDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line43Deduction = deductionResult.deduction;
  const line44OtherExemptions = calculateArizonaExemptions({
    formRecord,
    stateArtifactsArgs: args,
  });
  const line45TaxableIncome = Math.max(
    line42ArizonaAdjustedGrossIncome - line43Deduction - line44OtherExemptions,
    0,
  );
  const line46Tax = toWholeDollars(line45TaxableIncome * ARIZONA_FLAT_TAX_RATE);
  const line47OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line49DependentTaxCredit = calculateArizonaDependentCredit({
    adjustedGrossIncome: line15FederalAdjustedGrossIncome,
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line50OtherStateCredit = calculateArizonaOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
    totalTaxBeforeCredits: line46Tax + line47OtherTaxes,
  });
  const line50NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + line50OtherStateCredit,
  );
  const line58TotalTax = Math.max(
    line46Tax + line47OtherTaxes - line49DependentTaxCredit - line50NonrefundableCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: ARIZONA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line58TotalTax - payments.totalPayments, 0),
    startingPoint: line15FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line45TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line58TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Arizona whole-dollar rules",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona Form 140 federal adjusted gross income starting point",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.az.starting_point",
      nodeType: "bridge",
      value: line15FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form140.additions",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona additions",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line16",
      nodeType: "calculation",
      value: line16Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form140.subtractions",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona subtractions",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line18",
      nodeType: "calculation",
      value: line18Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line15 + line16 - line18, 0)",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona adjusted gross income",
      lineCode: "line42",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line42",
      nodeType: "calculation",
      value: line42ArizonaAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Arizona standard or itemized deduction common path",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona deduction",
      lineCode: "line43",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line43",
      nodeType: "calculation",
      value: line43Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "Arizona exemptions from age, blindness, other exemptions, qualifying parents/grandparents, or plugin_fact_bag.form140.total_exemption_amount",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona exemptions",
      lineCode: "line44",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line44",
      nodeType: "calculation",
      value: line44OtherExemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line42 - line43 - line44, 0)",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona taxable income",
      lineCode: "line45",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line45",
      nodeType: "calculation",
      value: line45TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line45 * 0.025",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona tax before credits",
      lineCode: "line46",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line46",
      nodeType: "calculation",
      value: line46Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Arizona dependent credit worksheet",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona dependent tax credit",
      lineCode: "line49",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line49",
      nodeType: "calculation",
      value: line49DependentTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line46 + line47 - line49 - line50, 0)",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona total tax",
      lineCode: "line58",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line58",
      nodeType: "summary",
      value: line58TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona total payments",
      lineCode: "line74",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.form140.line74",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form140.line45",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.summary.taxable_income",
      nodeType: "summary",
      value: line45TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form140.line58",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.summary.total_tax",
      nodeType: "summary",
      value: line58TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form140.line74",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line74 - line58, 0)",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line58 - line74, 0)",
      jurisdiction: ARIZONA_STATE_CODE,
      label: "Arizona amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "az.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.az.starting_point", "carryforward"),
    createStateEdge("bridge.az.starting_point", "az.form140.line42"),
    createStateEdge("az.form140.line16", "az.form140.line42"),
    createStateEdge("az.form140.line18", "az.form140.line42"),
    createStateEdge("az.form140.line42", "az.form140.line45"),
    createStateEdge("az.form140.line43", "az.form140.line45"),
    createStateEdge("az.form140.line44", "az.form140.line45"),
    createStateEdge("az.form140.line45", "az.form140.line46"),
    createStateEdge("az.form140.line46", "az.form140.line58"),
    createStateEdge("az.form140.line49", "az.form140.line58"),
    createStateEdge("az.form140.line58", "az.summary.total_tax"),
    createStateEdge("az.form140.line74", "az.summary.total_payments"),
  ];

  const validationResults = [];

  if (deductionResult.usedFederalItemizedProxy) {
    validationResults.push(
      buildValidationResult({
        message:
          "Arizona itemized deductions used the federal itemized base because no Arizona-specific Schedule A total was supplied.",
        nodeIds: ["az.form140.line43"],
        ruleId: "AZ.itemized_deduction_federal_base_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    line50OtherStateCredit === 0 &&
    asNumber(formRecord?.tax_paid_to_other_state_credit) == null &&
    asNumber(formRecord?.other_state_credit_amount) == null &&
    hasPotentialArizonaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Arizona credit for taxes paid to another state stayed at zero because no Form 309 style claim amount was supplied for the available multistate facts.",
        nodeIds: ["az.form140.line58"],
        ruleId: "AZ.other_state_credit_review",
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
