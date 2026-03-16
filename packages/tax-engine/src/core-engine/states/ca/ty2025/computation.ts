import { asNumber, roundMoney, sumNamedAmounts, sumNumbers } from "../../../helpers";
import type { CoreEngineInput, CoreEngineStateReturn } from "../../../input";
import type { CoreEngineStateSummary } from "../../../public";
import { buildStateSummaryExtensions } from "../../common";
import { deriveCombinedStateTaxedIncome } from "../../return-kind";
import {
  CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_RATE,
  CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_THRESHOLD,
  CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT,
  CALIFORNIA_EXEMPTION_CREDIT_REDUCTION_PER_STEP,
  CALIFORNIA_EXEMPTION_STEP_SIZE_BY_FILING_STATUS,
  CALIFORNIA_EXEMPTION_THRESHOLD_BY_FILING_STATUS,
  CALIFORNIA_PERSONAL_EXEMPTION_CREDIT,
  CALIFORNIA_TAX_BRACKETS_BY_FILING_STATUS,
  calculateCaliforniaBlindExemptionCount,
  calculateCaliforniaPersonalExemptionCount,
  calculateCaliforniaSeniorExemptionCount,
  calculateCaliforniaStandardDeduction,
  getCaliforniaForm540Record,
  getCaliforniaScheduleCaRecord,
  isCaliforniaMarriedFilingSeparately,
  normalizeCaliforniaFilingStatus,
  readNamedAmountArrayTotal,
  toCaliforniaWholeDollars,
  type CaliforniaComputation,
  type CaliforniaExemptionCreditComputation,
  type CaliforniaFilingStatus,
  type CaliforniaTaxComputationMethod,
} from "./types";

function calculateCaliforniaExemptionCredits(args: {
  readonly blindCount: number;
  readonly dependentCount: number;
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: CaliforniaFilingStatus;
  readonly isMarriedFilingSeparately: boolean;
  readonly personalCount: number;
  readonly seniorCount: number;
}): CaliforniaExemptionCreditComputation {
  const threshold = CALIFORNIA_EXEMPTION_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const stepSize = args.isMarriedFilingSeparately
    ? 1_250
    : CALIFORNIA_EXEMPTION_STEP_SIZE_BY_FILING_STATUS[args.filingStatus];
  const excessAgi = Math.max(args.federalAdjustedGrossIncome - threshold, 0);
  const reductionStepCount = excessAgi > 0 ? Math.ceil(excessAgi / stepSize) : 0;
  const seniorOrBlindCount = args.personalCount + args.blindCount + args.seniorCount;
  const seniorOrBlindCreditAmount = Math.max(
    seniorOrBlindCount * CALIFORNIA_PERSONAL_EXEMPTION_CREDIT -
      reductionStepCount * CALIFORNIA_EXEMPTION_CREDIT_REDUCTION_PER_STEP * seniorOrBlindCount,
    0,
  );
  const dependentCreditAmount = Math.max(
    args.dependentCount * CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT -
      reductionStepCount * CALIFORNIA_EXEMPTION_CREDIT_REDUCTION_PER_STEP * args.dependentCount,
    0,
  );

  return {
    blindCount: args.blindCount,
    dependentCount: args.dependentCount,
    dependentCreditAmount,
    line32ExemptionCredits: seniorOrBlindCreditAmount + dependentCreditAmount,
    personalCount: args.personalCount,
    reductionStepCount,
    seniorCount: args.seniorCount,
    seniorOrBlindCreditAmount,
  };
}

function calculateCaliforniaRegularTaxFromRateSchedule(
  taxableIncome: number,
  filingStatus: CaliforniaFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  const brackets = CALIFORNIA_TAX_BRACKETS_BY_FILING_STATUS[filingStatus];
  let selectedBracket = brackets[0]!;

  for (const bracket of brackets) {
    if (taxableIncome > bracket.over) {
      selectedBracket = bracket;
      continue;
    }

    break;
  }

  return roundMoney(
    selectedBracket.base + (taxableIncome - selectedBracket.over) * selectedBracket.rate,
  );
}

function calculateCaliforniaTaxTableAmount(
  taxableIncome: number,
  filingStatus: CaliforniaFilingStatus,
): number {
  if (taxableIncome <= 50) {
    return 0;
  }

  const midpointIncome = Math.floor((taxableIncome - 51) / 100) * 100 + 100;
  return Math.round(calculateCaliforniaRegularTaxFromRateSchedule(midpointIncome, filingStatus));
}

function calculateCaliforniaLine31Tax(args: {
  readonly filingStatus: CaliforniaFilingStatus;
  readonly taxableIncome: number;
}): { readonly line31Tax: number; readonly taxComputationMethod: CaliforniaTaxComputationMethod } {
  if (args.taxableIncome <= 100_000) {
    return {
      line31Tax: calculateCaliforniaTaxTableAmount(args.taxableIncome, args.filingStatus),
      taxComputationMethod: "tax_table",
    };
  }

  return {
    line31Tax: Math.round(
      calculateCaliforniaRegularTaxFromRateSchedule(args.taxableIncome, args.filingStatus),
    ),
    taxComputationMethod: "tax_rate_schedule",
  };
}

function calculateCaliforniaBehavioralHealthServicesTax(taxableIncome: number): number {
  if (taxableIncome <= CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_THRESHOLD) {
    return 0;
  }

  return Math.round(
    (taxableIncome - CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_THRESHOLD) *
      CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_RATE,
  );
}

function roundCaliforniaRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function resolveCaliforniaAdjustedGrossIncome(args: {
  readonly scheduleCaRecord: Record<string, unknown> | undefined;
  readonly stateReturn: CoreEngineStateReturn;
}): number | null {
  const explicitAmount =
    asNumber(args.scheduleCaRecord?.part_iv_line1_california_agi_amount) ??
    asNumber(args.scheduleCaRecord?.california_agi_amount) ??
    asNumber(args.scheduleCaRecord?.line1_california_agi_amount);

  if (explicitAmount != null) {
    return toCaliforniaWholeDollars(explicitAmount);
  }

  return deriveCombinedStateTaxedIncome(args.stateReturn);
}

function calculateCaliforniaPaymentsFallbackTotal(
  input: CoreEngineInput,
  stateCode: string,
): number {
  const withholdingTotal = sumNumbers(
    input.facts.payments.withholdings
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );
  const estimatedPaymentTotal = sumNumbers(
    input.facts.payments.estimated_payments
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );
  const extensionPaymentTotal = sumNumbers(
    input.facts.payments.extension_payments
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );

  return toCaliforniaWholeDollars(withholdingTotal + estimatedPaymentTotal + extensionPaymentTotal);
}

function calculateCaliforniaComputation(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly input: CoreEngineInput;
  readonly stateReturn: CoreEngineStateReturn;
}): CaliforniaComputation {
  const filingStatus = normalizeCaliforniaFilingStatus(args.stateReturn, args.input);
  const scheduleCaRecord = getCaliforniaScheduleCaRecord(args.stateReturn);
  const form540Record = getCaliforniaForm540Record(args.stateReturn);
  const line13FederalAdjustedGrossIncome = toCaliforniaWholeDollars(args.federalAdjustedGrossIncome);
  const line14Subtractions = toCaliforniaWholeDollars(
    sumNamedAmounts(args.stateReturn.subtractions) +
      readNamedAmountArrayTotal(scheduleCaRecord?.subtractions),
  );
  const line16Additions = toCaliforniaWholeDollars(
    sumNamedAmounts(args.stateReturn.additions) +
      sumNamedAmounts(args.stateReturn.state_specific_income_items) +
      readNamedAmountArrayTotal(scheduleCaRecord?.additions),
  );
  const line17CaliforniaAdjustedGrossIncome =
    line13FederalAdjustedGrossIncome - line14Subtractions + line16Additions;
  const isMarriedFilingSeparately = isCaliforniaMarriedFilingSeparately(
    args.stateReturn,
    args.input,
  );
  const standardDeduction = calculateCaliforniaStandardDeduction(args.input, filingStatus);
  const reportedItemizedDeductionTotal = toCaliforniaWholeDollars(
    asNumber(form540Record?.itemized_deductions_total) ??
      asNumber(scheduleCaRecord?.itemized_deductions_total) ??
      0,
  );
  const additionalStateDeductionsTotal = toCaliforniaWholeDollars(
    sumNamedAmounts(args.stateReturn.state_specific_deductions),
  );
  const deductionStrategy = reportedItemizedDeductionTotal > standardDeduction ? "itemized" : "standard";
  const line18Deduction =
    Math.max(reportedItemizedDeductionTotal, standardDeduction) + additionalStateDeductionsTotal;
  const line19TaxableIncome = Math.max(line17CaliforniaAdjustedGrossIncome - line18Deduction, 0);
  const line31TaxComputation = calculateCaliforniaLine31Tax({
    filingStatus,
    taxableIncome: line19TaxableIncome,
  });
  const exemptionCredits = calculateCaliforniaExemptionCredits({
    blindCount: calculateCaliforniaBlindExemptionCount(args.input),
    dependentCount: args.input.household.dependents.length,
    federalAdjustedGrossIncome: line13FederalAdjustedGrossIncome,
    filingStatus,
    isMarriedFilingSeparately,
    personalCount: calculateCaliforniaPersonalExemptionCount(args.input, filingStatus),
    seniorCount: calculateCaliforniaSeniorExemptionCount(args.input),
  });
  const allocatedCaliforniaAdjustedGrossIncome =
    args.stateReturn.return_kind === "resident"
      ? null
      : resolveCaliforniaAdjustedGrossIncome({
          scheduleCaRecord,
          stateReturn: args.stateReturn,
        });
  const deductionPercentage =
    allocatedCaliforniaAdjustedGrossIncome == null
      ? null
      : line17CaliforniaAdjustedGrossIncome > 0
        ? Math.min(
            Math.max(
              roundCaliforniaRatio(
                allocatedCaliforniaAdjustedGrossIncome / line17CaliforniaAdjustedGrossIncome,
              ),
              0,
            ),
            1,
          )
        : allocatedCaliforniaAdjustedGrossIncome > 0
          ? 1
          : 0;
  const allocatedCaliforniaTaxableIncome =
    allocatedCaliforniaAdjustedGrossIncome == null || deductionPercentage == null
      ? null
      : Math.max(
          allocatedCaliforniaAdjustedGrossIncome -
            toCaliforniaWholeDollars(line18Deduction * deductionPercentage),
          0,
        );
  const line36CaliforniaTaxRate =
    allocatedCaliforniaTaxableIncome == null
      ? null
      : line19TaxableIncome > 0
        ? roundCaliforniaRatio(line31TaxComputation.line31Tax / line19TaxableIncome)
        : 0;
  const line37CaliforniaTaxBeforeExemptionCredits =
    allocatedCaliforniaTaxableIncome == null || line36CaliforniaTaxRate == null
      ? null
      : toCaliforniaWholeDollars(allocatedCaliforniaTaxableIncome * line36CaliforniaTaxRate);
  const allocatedExemptionCreditPercentage =
    allocatedCaliforniaTaxableIncome == null
      ? null
      : line19TaxableIncome > 0
        ? Math.min(
            Math.max(
              roundCaliforniaRatio(allocatedCaliforniaTaxableIncome / line19TaxableIncome),
              0,
            ),
            1,
          )
        : 0;
  const line39ProratedExemptionCredits =
    allocatedExemptionCreditPercentage == null
      ? null
      : toCaliforniaWholeDollars(
          exemptionCredits.line32ExemptionCredits * allocatedExemptionCreditPercentage,
        );
  const line40RegularTaxBeforeCredits =
    line37CaliforniaTaxBeforeExemptionCredits == null || line39ProratedExemptionCredits == null
      ? null
      : Math.max(line37CaliforniaTaxBeforeExemptionCredits - line39ProratedExemptionCredits, 0);
  const line33TaxAfterExemptionCredits = Math.max(
    line31TaxComputation.line31Tax - exemptionCredits.line32ExemptionCredits,
    0,
  );
  const line34OtherTax = toCaliforniaWholeDollars(asNumber(form540Record?.line34_other_tax) ?? 0);
  const line35TaxBeforeCredits =
    (line40RegularTaxBeforeCredits ?? line33TaxAfterExemptionCredits) + line34OtherTax;
  const nonrefundableCreditsTotal = toCaliforniaWholeDollars(
    sumNamedAmounts(args.stateReturn.state_specific_credits) +
      readNamedAmountArrayTotal(form540Record?.nonrefundable_credits) +
      (asNumber(form540Record?.line40_child_and_dependent_care_credit) ?? 0) +
      (asNumber(form540Record?.line46_renters_credit) ?? 0),
  );
  const line47NonrefundableCredits = nonrefundableCreditsTotal;
  const line48TaxAfterCredits = Math.max(line35TaxBeforeCredits - line47NonrefundableCredits, 0);
  const line61AlternativeMinimumTax = toCaliforniaWholeDollars(
    asNumber(form540Record?.line61_alternative_minimum_tax) ?? 0,
  );
  const line62BehavioralHealthServicesTax = calculateCaliforniaBehavioralHealthServicesTax(
    allocatedCaliforniaTaxableIncome ?? line19TaxableIncome,
  );
  const line63OtherTaxes = toCaliforniaWholeDollars(
    asNumber(form540Record?.line63_other_taxes_and_credit_recapture) ?? 0,
  );
  const line64TotalTax =
    line48TaxAfterCredits +
    line61AlternativeMinimumTax +
    line62BehavioralHealthServicesTax +
    line63OtherTaxes;
  const explicitStatePaymentsTotal = toCaliforniaWholeDollars(
    sumNumbers(args.stateReturn.state_payments.map((payment) => payment.amount)),
  );
  const statePaymentsFallbackTotal = calculateCaliforniaPaymentsFallbackTotal(
    args.input,
    args.stateReturn.state_code,
  );
  const line73Withholding = toCaliforniaWholeDollars(asNumber(form540Record?.line73_withholding) ?? 0);
  const refundableCreditsTotal = toCaliforniaWholeDollars(
    readNamedAmountArrayTotal(form540Record?.refundable_credits) +
      (asNumber(form540Record?.line74_refundable_program_4_0_credit) ?? 0) +
      (asNumber(form540Record?.line75_eitc) ?? 0) +
      (asNumber(form540Record?.line76_yctc) ?? 0) +
      (asNumber(form540Record?.line77_fytc) ?? 0),
  );
  const line78TotalPayments =
    (explicitStatePaymentsTotal > 0
      ? explicitStatePaymentsTotal
      : statePaymentsFallbackTotal + line73Withholding) +
    refundableCreditsTotal;
  const line91UseTax = toCaliforniaWholeDollars(asNumber(form540Record?.use_tax) ?? 0);
  const line92IndividualSharedResponsibilityPenalty = toCaliforniaWholeDollars(
    asNumber(form540Record?.individual_shared_responsibility_penalty) ?? 0,
  );
  const line95PaymentsAfterPenalty = Math.max(
    Math.max(line78TotalPayments - line91UseTax, 0) - line92IndividualSharedResponsibilityPenalty,
    0,
  );
  const line97RefundAmount = Math.max(line95PaymentsAfterPenalty - line64TotalTax, 0);
  const line100AmountOwed = Math.max(line64TotalTax - line95PaymentsAfterPenalty, 0);

  return {
    allocatedCaliforniaAdjustedGrossIncome,
    allocatedCaliforniaTaxableIncome,
    allocatedExemptionCreditPercentage,
    deductionStrategy,
    filingStatus,
    isAllocatedReturn: allocatedCaliforniaAdjustedGrossIncome != null,
    line13FederalAdjustedGrossIncome,
    line14Subtractions,
    line16Additions,
    line17CaliforniaAdjustedGrossIncome,
    line18Deduction,
    line19TaxableIncome,
    line36CaliforniaTaxRate,
    line37CaliforniaTaxBeforeExemptionCredits,
    line39ProratedExemptionCredits,
    line40RegularTaxBeforeCredits,
    line31Tax: line31TaxComputation.line31Tax,
    line32ExemptionCredits: exemptionCredits.line32ExemptionCredits,
    line33TaxAfterExemptionCredits,
    line34OtherTax,
    line35TaxBeforeCredits,
    line47NonrefundableCredits,
    line48TaxAfterCredits,
    line61AlternativeMinimumTax,
    line62BehavioralHealthServicesTax,
    line63OtherTaxes,
    line64TotalTax,
    line78TotalPayments,
    line91UseTax,
    line92IndividualSharedResponsibilityPenalty,
    line95PaymentsAfterPenalty,
    line97RefundAmount,
    line100AmountOwed,
    nonrefundableCreditsTotal,
    paymentsUsedCanonicalStatePayments: explicitStatePaymentsTotal > 0,
    reportedItemizedDeductionTotal,
    refundableCreditsTotal,
    statePaymentsFallbackTotal,
    standardDeduction,
    taxComputationMethod: line31TaxComputation.taxComputationMethod,
  };
}

function buildCaliforniaStateSummary(args: {
  readonly computation: CaliforniaComputation;
  readonly stateReturn: CoreEngineStateReturn;
}): CoreEngineStateSummary {
  const adjustedGrossIncomeOrStartingPoint =
    args.computation.allocatedCaliforniaAdjustedGrossIncome ??
    args.computation.line17CaliforniaAdjustedGrossIncome;
  const taxableIncome =
    args.computation.allocatedCaliforniaTaxableIncome ?? args.computation.line19TaxableIncome;

  return {
    state_code: args.stateReturn.state_code,
    plugin_manifest_id: args.stateReturn.plugin_manifest_id,
    adjusted_gross_income_or_starting_point: adjustedGrossIncomeOrStartingPoint,
    taxable_income: taxableIncome,
    total_tax: args.computation.line64TotalTax,
    total_payments: args.computation.line78TotalPayments,
    refund_amount: args.computation.line97RefundAmount,
    amount_owed: args.computation.line100AmountOwed,
    ...buildStateSummaryExtensions(args.stateReturn, taxableIncome),
  };
}

export {
  buildCaliforniaStateSummary,
  calculateCaliforniaComputation,
  calculateCaliforniaExemptionCredits,
  calculateCaliforniaLine31Tax,
  calculateCaliforniaRegularTaxFromRateSchedule,
  calculateCaliforniaTaxTableAmount,
};
