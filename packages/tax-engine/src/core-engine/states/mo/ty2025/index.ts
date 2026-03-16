import { asBoolean, asNumber, sumNumbers } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
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
} from "../../resident";

const MISSOURI_STATE_CODE = "MO";
const MISSOURI_STATE_NAME = "Missouri";
const MISSOURI_FORM_RECORD_KEY = "mo1040";
const MISSOURI_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 23_625,
  married_filing_jointly: 31_500,
  married_filing_separately: 15_750,
  qualifying_surviving_spouse: 31_500,
  single: 15_750,
} as const;

type MissouriFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateMissouriQualifyingConditionCount(args: StateArtifactsArgs): number {
  return countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input);
}

function calculateMissouriFederalTaxDeductionPercentage(missouriAdjustedGrossIncome: number): number {
  if (missouriAdjustedGrossIncome <= 25_000) {
    return 0.35;
  }

  if (missouriAdjustedGrossIncome <= 50_000) {
    return 0.25;
  }

  if (missouriAdjustedGrossIncome <= 100_000) {
    return 0.15;
  }

  if (missouriAdjustedGrossIncome <= 125_000) {
    return 0.05;
  }

  return 0;
}

function calculateMissouriFactDerivedFederalItemizedDeductions(args: {
  readonly adjustedGrossIncome: number;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const itemizedFacts = args.input.facts.itemized_deductions;
  const medicalDeduction = Math.max(
    toWholeDollars(itemizedFacts.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.adjustedGrossIncome * 0.075),
    0,
  );
  const taxesDeduction = toWholeDollars(
    (itemizedFacts.state_and_local_income_or_sales_taxes ?? 0) +
      (itemizedFacts.real_estate_taxes ?? 0) +
      (itemizedFacts.personal_property_taxes ?? 0) +
      (itemizedFacts.other_taxes ?? 0),
  );
  const interestDeduction = toWholeDollars(
    sumNumbers(
      itemizedFacts.mortgage_interest_items.map(
        (item) =>
          (item.mortgage_interest_received ?? 0) +
          (item.points_paid ?? 0) +
          (item.mortgage_insurance_premiums ?? 0),
      ),
    ),
  );
  const charitableDeduction = toWholeDollars(
    (itemizedFacts.charitable_cash_contributions ?? 0) +
      (itemizedFacts.charitable_noncash_contributions ?? 0),
  );
  const casualtyDeduction = toWholeDollars(itemizedFacts.casualty_and_theft_losses ?? 0);
  const otherDeductions = toWholeDollars(
    sumNumbers(itemizedFacts.other_itemized_deductions.map((item) => item.amount)),
  );

  return toWholeDollars(
    medicalDeduction +
      taxesDeduction +
      interestDeduction +
      charitableDeduction +
      casualtyDeduction +
      otherDeductions,
  );
}

function calculateMissouriStandardDeduction(args: {
  readonly filingStatus: MissouriFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly itemizedDeductionTotal: number;
  readonly line14Deduction: number;
  readonly requestedItemizedWithoutAvailableTotal: boolean;
  readonly usesItemizedDeduction: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      itemizedDeductionTotal: toWholeDollars(asNumber(args.formRecord?.itemized_deductions_total) ?? 0),
      line14Deduction: toWholeDollars(overrideAmount),
      requestedItemizedWithoutAvailableTotal: false,
      usesItemizedDeduction: asBoolean(args.formRecord?.use_itemized_deductions) === true,
    };
  }

  const baseStandardDeduction = MISSOURI_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const qualifyingConditionCount = calculateMissouriQualifyingConditionCount(args.stateArtifactsArgs);
  const additionalStandardDeductionPerCondition =
    args.filingStatus === "single" || args.filingStatus === "head_of_household" ? 2_000 : 1_600;
  const standardDeduction =
    baseStandardDeduction + qualifyingConditionCount * additionalStandardDeductionPerCondition;
  const federalItemizedDeductions = toWholeDollars(
    asNumber(args.formRecord?.federal_itemized_deductions_total) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
        : calculateMissouriFactDerivedFederalItemizedDeductions({
            adjustedGrossIncome: args.stateArtifactsArgs.adjustedGrossIncome,
            input: args.stateArtifactsArgs.input,
          })),
  );
  const socialSecurityTax = toWholeDollars(
    asNumber(args.formRecord?.social_security_tax_amount) ??
      sumNumbers(
        args.stateArtifactsArgs.input.facts.income.wages.map(
          (wage) => wage.social_security_tax_withheld ?? 0,
        ),
      ),
  );
  const medicareTax = toWholeDollars(
    asNumber(args.formRecord?.medicare_tax_amount) ??
      sumNumbers(
        args.stateArtifactsArgs.input.facts.income.wages.map((wage) => wage.medicare_tax_withheld ?? 0),
      ),
  );
  const selfEmploymentTax = toWholeDollars(
    asNumber(args.formRecord?.self_employment_tax_amount) ??
      (args.stateArtifactsArgs.federalSummary?.self_employment_tax ?? 0),
  );
  const netStateIncomeTaxes = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.state_and_local_income_taxes_amount) ??
        (args.stateArtifactsArgs.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0),
    ) - toWholeDollars(asNumber(args.formRecord?.earnings_taxes_amount) ?? 0),
    0,
  );
  const itemizedDeductionTotal = Math.max(
    toWholeDollars(
      federalItemizedDeductions + socialSecurityTax + medicareTax + selfEmploymentTax - netStateIncomeTaxes,
    ),
    0,
  );
  const explicitlyRequestedItemized = asBoolean(args.formRecord?.use_itemized_deductions) === true;
  const useItemizedDeduction =
    (explicitlyRequestedItemized && itemizedDeductionTotal > 0) ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionTotal > standardDeduction);

  return {
    itemizedDeductionTotal,
    line14Deduction: useItemizedDeduction ? itemizedDeductionTotal : standardDeduction,
    requestedItemizedWithoutAvailableTotal:
      explicitlyRequestedItemized && itemizedDeductionTotal <= 0 && federalItemizedDeductions <= 0,
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function calculateMissouriTax(taxableIncome: number): number {
  if (taxableIncome <= 1_313) {
    return 0;
  }

  if (taxableIncome <= 2_626) {
    return toWholeDollars((taxableIncome - 1_313) * 0.02);
  }

  if (taxableIncome <= 3_939) {
    return toWholeDollars(26 + (taxableIncome - 2_626) * 0.025);
  }

  if (taxableIncome <= 5_252) {
    return toWholeDollars(59 + (taxableIncome - 3_939) * 0.03);
  }

  if (taxableIncome <= 6_565) {
    return toWholeDollars(98 + (taxableIncome - 5_252) * 0.035);
  }

  if (taxableIncome <= 7_878) {
    return toWholeDollars(144 + (taxableIncome - 6_565) * 0.04);
  }

  if (taxableIncome <= 9_191) {
    return toWholeDollars(197 + (taxableIncome - 7_878) * 0.045);
  }

  return toWholeDollars(256 + (taxableIncome - 9_191) * 0.047);
}

function calculateMissouriFederalTaxDeduction(args: {
  readonly filingStatus: MissouriFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly missouriAdjustedGrossIncome: number;
}): {
  readonly federalTaxLiabilityAmount: number;
  readonly hasFederalTaxInputs: boolean;
  readonly percentage: number;
  readonly deduction: number;
  readonly usedOverride: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.federal_tax_deduction_amount);
  const explicitFederalTaxLiabilityAmount = asNumber(args.formRecord?.federal_tax_liability_amount);
  const explicitFederalLine22TaxAmount = asNumber(args.formRecord?.federal_form_1040_line22_tax_amount);
  const federalLine22TaxAmount =
    explicitFederalLine22TaxAmount ??
    (args.federalSummary == null
      ? null
      : Math.max(
          toWholeDollars(args.federalSummary.line24_total_tax) -
            toWholeDollars(args.federalSummary.line23_other_taxes ?? 0),
          0,
        ));
  const otherFederalTaxAmount = toWholeDollars(
    asNumber(args.formRecord?.other_federal_tax_amount) ??
      asNumber(args.formRecord?.federal_other_taxes_amount) ??
      (args.federalSummary?.line23_other_taxes ?? 0),
  );
  const federalTaxLiabilityAmount = Math.max(
    toWholeDollars(
      explicitFederalTaxLiabilityAmount ??
        (federalLine22TaxAmount == null
          ? 0
          : federalLine22TaxAmount -
            (args.federalSummary?.line27a_earned_income_credit ?? 0) -
            (args.federalSummary?.line29_refundable_education_credit ?? 0) +
            otherFederalTaxAmount),
    ),
    0,
  );
  const percentage = calculateMissouriFederalTaxDeductionPercentage(args.missouriAdjustedGrossIncome);
  const hasFederalTaxInputs =
    overrideAmount != null ||
    explicitFederalTaxLiabilityAmount != null ||
    explicitFederalLine22TaxAmount != null ||
    args.federalSummary != null;

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      federalTaxLiabilityAmount,
      hasFederalTaxInputs,
      percentage,
      usedOverride: true,
    };
  }

  const cap =
    args.filingStatus === "married_filing_jointly" || args.filingStatus === "qualifying_surviving_spouse"
      ? 10_000
      : 5_000;

  return {
    deduction: toWholeDollars(Math.min(federalTaxLiabilityAmount * percentage, cap)),
    federalTaxLiabilityAmount,
    hasFederalTaxInputs,
    percentage,
    usedOverride: false,
  };
}

function calculateMissouriOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly missouriAdjustedGrossIncome: number;
  readonly missouriTax: number;
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
    args.missouriAdjustedGrossIncome <= 0 ||
    args.missouriTax <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === MISSOURI_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const missouriIncomePercentage = Math.max(
          Math.min(claim.income_amount / args.missouriAdjustedGrossIncome, 1),
          0,
        );
        const missouriCreditLimit = toWholeDollars(args.missouriTax * missouriIncomePercentage);
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, missouriCreditLimit);
      }, 0),
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MISSOURI_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MISSOURI_FORM_RECORD_KEY);
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
  const line6MissouriAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const federalTaxDeduction = calculateMissouriFederalTaxDeduction({
    filingStatus,
    formRecord,
    federalSummary: args.federalSummary,
    missouriAdjustedGrossIncome: line6MissouriAdjustedGrossIncome,
  });
  const deduction = calculateMissouriStandardDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line15HeadOfHouseholdExemption =
    asNumber(formRecord?.head_of_household_exemption_amount) ??
    (filingStatus === "head_of_household" || filingStatus === "qualifying_surviving_spouse"
      ? 1_400
      : 0);
  const line16Through18AdditionalDeductions = toWholeDollars(
    asNumber(formRecord?.other_deductions_amount) ??
      (asNumber(formRecord?.long_term_care_deduction_amount) ?? 0) +
        (asNumber(formRecord?.health_care_sharing_deduction_amount) ?? 0) +
        (asNumber(formRecord?.active_duty_military_deduction_amount) ?? 0),
  );
  const line29MissouriTaxableIncome = Math.max(
    line6MissouriAdjustedGrossIncome -
      federalTaxDeduction.deduction -
      deduction.line14Deduction -
      line15HeadOfHouseholdExemption -
      line16Through18AdditionalDeductions,
    0,
  );
  const line30Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateMissouriTax(line29MissouriTaxableIncome),
  );
  const otherStateCredit = calculateMissouriOtherStateCredit({
    formRecord,
    missouriAdjustedGrossIncome: line6MissouriAdjustedGrossIncome,
    missouriTax: line30Tax,
    stateArtifactsArgs: args,
  });
  const line37NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + otherStateCredit,
  );
  const line38TotalTax = Math.max(line30Tax - line37NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: MISSOURI_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line38TotalTax - payments.totalPayments, 0),
    startingPoint: line6MissouriAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line29MissouriTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line38TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Missouri whole-dollar rules",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri MO-1040 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.mo.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.mo1040.additions",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.mo1040.subtractions",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3, 0)",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri adjusted gross income",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line6",
      nodeType: "calculation",
      value: line6MissouriAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Missouri federal tax deduction percentage * federal tax liability, capped by filing status",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri federal tax deduction",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line13",
      nodeType: "calculation",
      value: federalTaxDeduction.deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Missouri standard deduction or itemized deductions",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri deduction",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line14",
      nodeType: "calculation",
      value: deduction.line14Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "HOH or qualifying widow(er) additional exemption amount",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri head of household or qualifying widow(er) exemption",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line15",
      nodeType: "calculation",
      value: line15HeadOfHouseholdExemption,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line16 through line18 post-AGI deductions",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri additional deductions",
      lineCode: "line16to18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line16to18",
      nodeType: "calculation",
      value: line16Through18AdditionalDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line6 - line13 - line14 - line15 - line16to18, 0)",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri taxable income",
      lineCode: "line29",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line29",
      nodeType: "calculation",
      value: line29MissouriTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Missouri tax chart common path",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri income tax",
      lineCode: "line30",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line30",
      nodeType: "calculation",
      value: line30Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line30 - line37, 0)",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri total tax",
      lineCode: "line38",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line38",
      nodeType: "summary",
      value: line38TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri total payments",
      lineCode: "line45",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.mo1040.line45",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mo1040.line29",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.summary.taxable_income",
      nodeType: "summary",
      value: line29MissouriTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mo1040.line38",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.summary.total_tax",
      nodeType: "summary",
      value: line38TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "mo1040.line45",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line45 - line38, 0)",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line38 - line45, 0)",
      jurisdiction: MISSOURI_STATE_CODE,
      label: "Missouri amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "mo.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.mo.starting_point", "carryforward"),
    createStateEdge("bridge.mo.starting_point", "mo.mo1040.line6"),
    createStateEdge("mo.mo1040.line2", "mo.mo1040.line6"),
    createStateEdge("mo.mo1040.line3", "mo.mo1040.line6"),
    createStateEdge("mo.mo1040.line6", "mo.mo1040.line29"),
    createStateEdge("mo.mo1040.line13", "mo.mo1040.line29"),
    createStateEdge("mo.mo1040.line14", "mo.mo1040.line29"),
    createStateEdge("mo.mo1040.line15", "mo.mo1040.line29"),
    createStateEdge("mo.mo1040.line16to18", "mo.mo1040.line29"),
    createStateEdge("mo.mo1040.line29", "mo.mo1040.line30"),
    createStateEdge("mo.mo1040.line30", "mo.mo1040.line38"),
    createStateEdge("mo.mo1040.line38", "mo.summary.total_tax"),
    createStateEdge("mo.mo1040.line45", "mo.summary.total_payments"),
  ];

  const validationResults = [];

  if (
    !federalTaxDeduction.usedOverride &&
    federalTaxDeduction.federalTaxLiabilityAmount === 0 &&
    !federalTaxDeduction.hasFederalTaxInputs
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Missouri federal tax deduction defaulted to zero because neither a federal tax liability input nor an explicit Missouri override was supplied on this path.",
        nodeIds: ["mo.mo1040.line13"],
        ruleId: "MO.federal_tax_deduction_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    args.input.requested_jurisdictions.states.length > 1 &&
    otherStateCredit === 0 &&
    (args.input.facts.state?.other_state_tax_credit_claims ?? []).filter(
      (claim) => claim.resident_state_code === MISSOURI_STATE_CODE,
    ).length === 0 &&
    !args.stateReturn.state_specific_credits.some(
      (credit) => credit.description.toLowerCase().includes("other state"),
    )
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Missouri credit for tax paid to another state stayed at zero because no structured claim or explicit Missouri credit amount was supplied on this path.",
        nodeIds: ["mo.mo1040.line38"],
        ruleId: "MO.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  if (deduction.requestedItemizedWithoutAvailableTotal) {
    validationResults.push(
      buildValidationResult({
        message:
          "Missouri itemized deductions were requested without a Missouri-specific itemized total, so this path kept the computed Missouri standard deduction.",
        nodeIds: ["mo.mo1040.line14"],
        ruleId: "MO.itemized_deduction_standard_used",
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
