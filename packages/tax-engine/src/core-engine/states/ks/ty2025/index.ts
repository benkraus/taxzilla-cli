import { asBoolean, asNumber, sumNumbers } from "../../../helpers";
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

const KANSAS_STATE_CODE = "KS";
const KANSAS_STATE_NAME = "Kansas";
const KANSAS_FORM_RECORD_KEY = "k40";
const KANSAS_BASE_EXEMPTION_BY_FILING_STATUS = {
  head_of_household: 9_160,
  married_filing_jointly: 18_320,
  married_filing_separately: 9_160,
  qualifying_surviving_spouse: 18_320,
  single: 9_160,
} as const;
const KANSAS_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 6_180,
  married_filing_jointly: 8_240,
  married_filing_separately: 4_120,
  qualifying_surviving_spouse: 8_240,
  single: 3_605,
} as const;
const KANSAS_SENIOR_BLIND_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: [6_180, 7_030, 7_880],
  married_filing_jointly: [8_240, 8_940, 9_640, 10_340, 11_040],
  married_filing_separately: [4_120, 4_820, 5_520, 6_220, 6_920],
  qualifying_surviving_spouse: [8_240, 8_940, 9_640, 10_340, 11_040],
  single: [3_605, 4_455, 5_305],
} as const;
const KANSAS_ADDITIONAL_EXEMPTION_AMOUNT = 2_320;

type KansasFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateKansasStandardDeduction(args: {
  readonly filingStatus: KansasFilingStatus;
  readonly yesCount: number;
}): number {
  const deductionTable = KANSAS_SENIOR_BLIND_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const maxIndex = deductionTable.length - 1;
  const deductionIndex = Math.min(Math.max(args.yesCount, 0), maxIndex);

  return deductionTable[deductionIndex] ?? KANSAS_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
}

function calculateKansasDeduction(args: {
  readonly filingStatus: KansasFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly usesItemizedDeduction: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      usesItemizedDeduction: asBoolean(args.formRecord?.use_itemized_deductions) === true,
    };
  }

  const yesCount = countSeniorTaxpayers(args.stateArtifactsArgs.input) + countBlindTaxpayers(args.stateArtifactsArgs.input);
  const standardDeduction = calculateKansasStandardDeduction({
    filingStatus: args.filingStatus,
    yesCount,
  });
  const itemizedFacts = args.stateArtifactsArgs.input.facts.itemized_deductions;
  const factDerivedMedicalDeduction = Math.max(
    toWholeDollars(itemizedFacts.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.stateArtifactsArgs.adjustedGrossIncome ?? 0) * 0.075,
    0,
  );
  const factDerivedTaxes = toWholeDollars(
    (itemizedFacts.real_estate_taxes ?? 0) + (itemizedFacts.personal_property_taxes ?? 0),
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
  const factDerivedItemizedTotal = toWholeDollars(
    factDerivedMedicalDeduction + factDerivedTaxes + factDerivedInterest + factDerivedCharity,
  );
  const itemizedDeductionTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (factDerivedItemizedTotal > 0
        ? factDerivedItemizedTotal
        : args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
          ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
          : 0),
  );
  const mustItemize =
    args.filingStatus === "married_filing_separately" &&
    asBoolean(args.formRecord?.spouse_itemized_federal) === true;
  const explicitlyRequestedItemized = asBoolean(args.formRecord?.use_itemized_deductions) === true;
  const useItemizedDeduction =
    mustItemize ||
    (explicitlyRequestedItemized && itemizedDeductionTotal > 0) ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionTotal > standardDeduction);

  return {
    deduction: useItemizedDeduction ? itemizedDeductionTotal : standardDeduction,
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function calculateKansasOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly totalIncomeTaxBeforeCredits: number;
}): number {
  const explicitCredit = asNumber(args.formRecord?.credit_for_taxes_paid_to_other_states);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  const kansasAdjustedGrossIncome = Math.max(
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

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === KANSAS_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0 || kansasAdjustedGrossIncome <= 0) {
          return total;
        }

        const limitationRatio = Math.max(
          Math.min(claim.income_amount / kansasAdjustedGrossIncome, 1),
          0,
        );
        const creditLimit = args.totalIncomeTaxBeforeCredits * limitationRatio;
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, creditLimit);
      }, 0),
  );
}

function hasPotentialKansasOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === KANSAS_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== KANSAS_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== KANSAS_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function calculateKansasExemptionAllowance(args: {
  readonly filingStatus: KansasFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.exemption_allowance_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const headOfHouseholdAdditionalExemption = args.filingStatus === "head_of_household"
    ? KANSAS_ADDITIONAL_EXEMPTION_AMOUNT
    : 0;
  const dependentExemptions =
    countDependentExemptions(args.input) * KANSAS_ADDITIONAL_EXEMPTION_AMOUNT;
  const childBornExemptions =
    toWholeDollars(asNumber(args.formRecord?.child_born_exemption_count) ?? 0) *
    KANSAS_ADDITIONAL_EXEMPTION_AMOUNT;
  const stillbirthExemptions =
    toWholeDollars(asNumber(args.formRecord?.stillbirth_exemption_count) ?? 0) *
    KANSAS_ADDITIONAL_EXEMPTION_AMOUNT;
  const disabledVeteranExemptions =
    toWholeDollars(asNumber(args.formRecord?.disabled_veteran_exemption_count) ?? 0) *
    KANSAS_ADDITIONAL_EXEMPTION_AMOUNT;

  return toWholeDollars(
    KANSAS_BASE_EXEMPTION_BY_FILING_STATUS[args.filingStatus] +
      headOfHouseholdAdditionalExemption +
      dependentExemptions +
      childBornExemptions +
      stillbirthExemptions +
      disabledVeteranExemptions,
  );
}

function calculateKansasTax(taxableIncome: number, filingStatus: KansasFilingStatus): number {
  const jointLikeStatus =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse";
  const threshold = jointLikeStatus ? 46_000 : 23_000;
  const subtractionAmount = jointLikeStatus ? 175 : 87;

  if (taxableIncome <= threshold) {
    return toWholeDollars(taxableIncome * 0.052);
  }

  return toWholeDollars(taxableIncome * 0.0558 - subtractionAmount);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: KANSAS_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, KANSAS_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line2Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line3KansasAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line2Subtractions,
    0,
  );
  const deductionResult = calculateKansasDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line4Deduction = deductionResult.deduction;
  const line5ExemptionAllowance = calculateKansasExemptionAllowance({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line7TaxableIncome = Math.max(
    line3KansasAdjustedGrossIncome - line4Deduction - line5ExemptionAllowance,
    0,
  );
  const line8KansasTax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateKansasTax(line7TaxableIncome, filingStatus),
  );
  const line11OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line12TotalIncomeTax = line8KansasTax + line11OtherTaxes;
  const line13CreditForTaxesPaidToOtherStates = calculateKansasOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
    totalIncomeTaxBeforeCredits: line12TotalIncomeTax,
  });
  const line15NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line18TotalTax = Math.max(
    line12TotalIncomeTax - line13CreditForTaxesPaidToOtherStates - line15NonrefundableCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: KANSAS_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line18TotalTax - payments.totalPayments, 0),
    startingPoint: line3KansasAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line18TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Kansas whole-dollar rules",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas K-40 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ks.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.k40.additions",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas additions",
      lineCode: "line2.additions",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line2.additions",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.k40.subtractions",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas subtractions",
      lineCode: "line2.subtractions",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line2.subtractions",
      nodeType: "calculation",
      value: line2Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + additions - subtractions, 0)",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas adjusted gross income",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line3",
      nodeType: "calculation",
      value: line3KansasAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kansas standard deduction or itemized deductions",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas deduction",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line4",
      nodeType: "calculation",
      value: line4Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kansas resident credit worksheet for taxes paid to another state",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas credit for taxes paid to another state",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line13",
      nodeType: "calculation",
      value: line13CreditForTaxesPaidToOtherStates,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kansas exemption allowance",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas exemption allowance",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line5",
      nodeType: "calculation",
      value: line5ExemptionAllowance,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line3 - line4 - line5, 0)",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line7",
      nodeType: "calculation",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kansas tax tables or tax computation schedule common path",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas tax before credits",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line8",
      nodeType: "calculation",
      value: line8KansasTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 + line11 - line13 - line15, 0)",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas total tax",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line18",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas total payments",
      lineCode: "line27",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.k40.line27",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "k40.line7",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.summary.taxable_income",
      nodeType: "summary",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "k40.line18",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.summary.total_tax",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "k40.line27",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line27 - line18, 0)",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line18 - line27, 0)",
      jurisdiction: KANSAS_STATE_CODE,
      label: "Kansas amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ks.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ks.starting_point", "carryforward"),
    createStateEdge("bridge.ks.starting_point", "ks.k40.line3"),
    createStateEdge("ks.k40.line2.additions", "ks.k40.line3"),
    createStateEdge("ks.k40.line2.subtractions", "ks.k40.line3"),
    createStateEdge("ks.k40.line3", "ks.k40.line7"),
    createStateEdge("ks.k40.line4", "ks.k40.line7"),
    createStateEdge("ks.k40.line5", "ks.k40.line7"),
    createStateEdge("ks.k40.line7", "ks.k40.line8"),
    createStateEdge("ks.k40.line8", "ks.k40.line18"),
    createStateEdge("ks.k40.line13", "ks.k40.line18"),
    createStateEdge("ks.k40.line18", "ks.summary.total_tax"),
    createStateEdge("ks.k40.line27", "ks.summary.total_payments"),
  ];

  const validationResults = [];

  if (
    asBoolean(formRecord?.use_itemized_deductions) === true &&
    asNumber(formRecord?.itemized_deductions_total) == null &&
    !deductionResult.usesItemizedDeduction
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Kansas itemized deductions were requested without a Kansas itemized amount, so this resident module fell back to the computed Kansas standard deduction.",
        nodeIds: ["ks.k40.line4"],
        ruleId: "KS.itemized_deduction_defaulted_to_standard",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    line13CreditForTaxesPaidToOtherStates === 0 &&
    asNumber(formRecord?.credit_for_taxes_paid_to_other_states) == null &&
    hasPotentialKansasOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Kansas credit for taxes paid to another state stayed at zero because no Schedule S style claim amount was supplied for the available multistate facts.",
        nodeIds: ["ks.k40.line18"],
        ruleId: "KS.other_state_credit_review",
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
