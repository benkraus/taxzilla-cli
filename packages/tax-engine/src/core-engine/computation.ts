import type { CoreEngineInput } from "./input";
import { DERIVED_ADJUSTMENT_KEYS, SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS, STANDARD_DEDUCTION_BY_FILING_STATUS } from "./constants";
import {
  allowReportedNetLossesWithoutLimitationOverrides,
  buildScheduleERollup,
  getFederalScheduleDExtension,
  getFederalScheduleELimitationOverrides,
  getFederalSocialSecurityExtension,
  roundMoney,
  sumAdjustmentValues,
  sumNamedAmounts,
  sumNumbers,
  toNumber,
} from "./helpers";
import {
  buildEarnedIncomeByPersonId,
  calculateEarnedIncomeCredit,
  calculateScheduleDSpecialGains,
  calculateScheduleDLine18,
  calculateScheduleDLine19,
  calculateCapitalLossDeduction,
  calculateCapitalLossCarryforward,
  getFederalFilingStatus,
  getTotalEarnedIncome,
  getTotalMedicareTaxWithheld,
  getTotalSocialSecurityTaxWithheld,
  sumItemizedDeductionTotals,
} from "./foundations";
import {
  buildMisc1099IncomeRollup,
  buildNonemployeeCompensationRollup,
  resolveRetirementDistributionAmounts,
  resolveSocialSecurityBenefitAmounts,
  resolveUnemploymentCompensationAmount,
  sumCapitalGainDistributions,
  sumCapitalGainOrLoss,
  sumCapitalGainOrLossByTerm,
  sumDocumentedFederalWithholding,
  sumExemptInterestDividends,
  sumQualifiedDividends,
  sumScheduleCBusinessNetProfit,
  sumTaxExemptInterest,
  calculateTaxableSocialSecurityBenefits,
  inferCapitalTransactionTerm,
} from "./income";
import { calculateForm2441Credit, calculateForm8812Credit, calculateForm8863Credit, calculateForm8959, calculateForm8960, calculateForm8962Credit, calculateScheduleSE } from "./federal-calculations";
import { computePreferentialRateTax, computeScheduleDTaxWorksheetTax } from "./income-tax";
import type { FederalComputation, FederalModuleActivationState } from "./types";

function normalizeCapitalLossCarryforward(value: number | null | undefined): number {
  const normalizedValue = roundMoney(toNumber(value));

  if (normalizedValue === 0) {
    return 0;
  }

  return -Math.abs(normalizedValue);
}

function buildFederalActivations(
  input: CoreEngineInput,
  totals: {
    readonly advancePremiumTaxCreditTotal: number;
    readonly careExpenseTotal: number;
    readonly capitalGainOrLossTotal: number;
    readonly capitalGainDistributionsTotal: number;
    readonly capitalTransactionsNetTotal: number;
    readonly capitalLossCarryforwardTotal: number;
    readonly collectibles28PercentGainTotal: number;
    readonly educationExpenseTotal: number;
    readonly hsaDeductionTotal: number;
    readonly itemizedDeductionTotal: number;
    readonly nonrefundableCreditsTotal: number;
    readonly ordinaryDividendsTotal: number;
    readonly otherIncomeTotal: number;
    readonly refundableCreditsTotal: number;
    readonly scheduleCBusinessNetProfit: number;
    readonly scheduleEActivityNetTotal: number;
    readonly scheduleEInvestmentIncomeTotal: number;
    readonly section1202GainTotal: number;
    readonly taxableInterestTotal: number;
    readonly totalAdjustments: number;
    readonly totalPaymentsBeyondWithholding: number;
    readonly unrecapturedSection1250GainTotal: number;
  },
): FederalModuleActivationState {
  const form2441Activated =
    input.facts.credits.child_and_dependent_care.qualifying_person_ids.length > 0 ||
    input.facts.credits.child_and_dependent_care.providers.length > 0 ||
    input.facts.credits.child_and_dependent_care.expenses.length > 0;
  const form8812Activated =
    input.facts.credits.candidate_child_tax_credit_dependent_ids.length > 0 ||
    input.facts.credits.candidate_credit_for_other_dependent_ids.length > 0;
  const form8863Activated = input.facts.credits.education_credits.students.length > 0;
  const form8889Activated =
    totals.hsaDeductionTotal > 0 || input.facts.health_coverage.hsa_coverage_months.length > 0;
  const form8949Activated = input.facts.income.capital_transactions.length > 0;
  const form8959Activated = input.facts.income.wages.length > 0;
  const form8960Activated =
    totals.taxableInterestTotal > 0 ||
    totals.ordinaryDividendsTotal > 0 ||
    totals.capitalGainOrLossTotal > 0 ||
    totals.capitalGainDistributionsTotal > 0 ||
    totals.section1202GainTotal > 0 ||
    totals.scheduleEInvestmentIncomeTotal !== 0;
  const form8962Activated =
    input.facts.credits.premium_tax_credit.policies.length > 0 ||
    input.facts.health_coverage.marketplace_policies.length > 0;
  const schedule1Activated =
    totals.otherIncomeTotal !== 0 ||
    totals.scheduleCBusinessNetProfit !== 0 ||
    totals.scheduleEActivityNetTotal !== 0 ||
    totals.totalAdjustments !== 0;
  const scheduleSEActivated = totals.scheduleCBusinessNetProfit > 0;
  const schedule3Activated =
    form2441Activated ||
    form8863Activated ||
    totals.nonrefundableCreditsTotal > 0 ||
    totals.totalPaymentsBeyondWithholding > 0 ||
    totals.refundableCreditsTotal > 0 ||
    form8962Activated;
  const scheduleAActivated = totals.itemizedDeductionTotal > 0;
  const scheduleBActivated = totals.taxableInterestTotal > 0 || totals.ordinaryDividendsTotal > 0;
  const scheduleCActivated = input.facts.income.schedule_c_businesses.length > 0;
  const scheduleDActivated =
    totals.capitalTransactionsNetTotal !== 0 ||
    totals.capitalLossCarryforwardTotal !== 0 ||
    form8949Activated ||
    totals.collectibles28PercentGainTotal > 0 ||
    totals.section1202GainTotal > 0 ||
    totals.unrecapturedSection1250GainTotal > 0;
  const scheduleEActivated = input.facts.income.schedule_e_activities.length > 0;

  return {
    form2441Activated,
    form8812Activated,
    form8863Activated,
    form8889Activated,
    form8949Activated,
    form8959Activated,
    form8960Activated,
    form8962Activated,
    schedule1Activated,
    schedule2Activated: false,
    schedule3Activated,
    scheduleAActivated,
    scheduleBActivated,
    scheduleCActivated,
    scheduleDActivated,
    scheduleEActivated,
    scheduleSEActivated,
  };
}

function finalizeFederalActivations(
  activations: FederalModuleActivationState,
  computation: FederalComputation,
): FederalModuleActivationState {
  return {
    ...activations,
    form8959Activated:
      activations.form8959Activated &&
      (computation.additionalMedicareTax > 0 || computation.additionalMedicareTaxWithheld > 0),
    form8960Activated: activations.form8960Activated && computation.netInvestmentIncomeTax > 0,
    schedule2Activated: computation.line23OtherTaxes > 0,
    scheduleSEActivated: activations.scheduleSEActivated && computation.selfEmploymentTax > 0,
    schedule3Activated:
      computation.line20OtherNonrefundableCredits > 0 || computation.schedule3PaymentsTotal > 0,
  };
}

function buildFederalComputation(
  input: CoreEngineInput,
  activations: FederalModuleActivationState,
): FederalComputation {
  const filingStatus = getFederalFilingStatus(input);
  const scheduleDExtension = getFederalScheduleDExtension(input);
  const socialSecurityExtension = getFederalSocialSecurityExtension(input);
  const scheduleDTermOptions = {
    sourceDocuments: input.source_documents,
    termOverrides: scheduleDExtension?.transaction_term_overrides ?? [],
  };
  const priorYearShortTermCapitalLossCarryforward = normalizeCapitalLossCarryforward(
    scheduleDExtension?.prior_year_short_term_capital_loss_carryforward,
  );
  const priorYearLongTermCapitalLossCarryforward = normalizeCapitalLossCarryforward(
    scheduleDExtension?.prior_year_long_term_capital_loss_carryforward,
  );
  const wageTotal = roundMoney(
    sumNumbers(input.facts.income.wages.map((wage) => wage.wages_tips_other_compensation)),
  );
  const taxableInterestTotal = roundMoney(
    sumNumbers(input.facts.income.taxable_interest.map((interest) => interest.interest_income)),
  );
  const taxExemptInterestTotal = roundMoney(
    sumTaxExemptInterest(input.facts.income.taxable_interest) +
      sumExemptInterestDividends(input.facts.income.dividends),
  );
  const ordinaryDividendsTotal = roundMoney(
    sumNumbers(
      input.facts.income.dividends.map((dividend) => toNumber(dividend.ordinary_dividends)),
    ),
  );
  const qualifiedDividendsTotal = sumQualifiedDividends(input.facts.income.dividends);
  const capitalGainDistributionsTotal = sumCapitalGainDistributions(input.facts.income.dividends);
  const resolvedRetirementDistributions = input.facts.income.retirement_distributions.map(
    (distribution) => ({
      ...resolveRetirementDistributionAmounts(distribution, input.source_documents),
      iraSepSimple: distribution.ira_sep_simple,
    }),
  );
  const iraDistributionsGrossTotal = roundMoney(
    sumNumbers(
      resolvedRetirementDistributions
        .filter((distribution) => distribution.iraSepSimple)
        .map((distribution) => distribution.grossDistribution),
    ),
  );
  const taxableIraDistributionsTotal = roundMoney(
    sumNumbers(
      resolvedRetirementDistributions
        .filter((distribution) => distribution.iraSepSimple)
        .map((distribution) => distribution.taxableAmount),
    ),
  );
  const pensionsAndAnnuitiesGrossTotal = roundMoney(
    sumNumbers(
      resolvedRetirementDistributions
        .filter((distribution) => !distribution.iraSepSimple)
        .map((distribution) => distribution.grossDistribution),
    ),
  );
  const taxablePensionsAndAnnuitiesTotal = roundMoney(
    sumNumbers(
      resolvedRetirementDistributions
        .filter((distribution) => !distribution.iraSepSimple)
        .map((distribution) => distribution.taxableAmount),
    ),
  );
  const retirementTaxableAmountAssumptionCount = resolvedRetirementDistributions.filter(
    (distribution) => distribution.assumedTaxableAmount,
  ).length;
  const unemploymentCompensationTotal = roundMoney(
    sumNumbers(
      input.facts.income.unemployment_compensation.map((unemployment) =>
        resolveUnemploymentCompensationAmount(unemployment, input.source_documents),
      ),
    ),
  );
  const resolvedSocialSecurityBenefits = input.facts.income.social_security_benefits.map(
    (benefit) => resolveSocialSecurityBenefitAmounts(benefit, input.source_documents),
  );
  const socialSecurityBenefitsNetTotal = roundMoney(
    sumNumbers(resolvedSocialSecurityBenefits.map((benefit) => benefit.netBenefits)),
  );
  const scheduleDSpecialGains = calculateScheduleDSpecialGains(input.source_documents);
  const section1202ExclusionAmount = roundMoney(
    Math.min(
      Math.max(toNumber(scheduleDExtension?.section1202_exclusion_amount), 0),
      scheduleDSpecialGains.section1202GainTotal,
    ),
  );
  const taxableSection1202GainTotal = roundMoney(
    Math.max(scheduleDSpecialGains.section1202GainTotal - section1202ExclusionAmount, 0),
  );
  const capitalTransactionsNetTotal = sumCapitalGainOrLoss(input.facts.income.capital_transactions);
  const scheduleDShortTermCapitalGainOrLossTotal = sumCapitalGainOrLossByTerm(
    input.facts.income.capital_transactions,
    "short",
    scheduleDTermOptions,
  );
  const scheduleDLongTermCapitalGainOrLossTotal = roundMoney(
    sumCapitalGainOrLossByTerm(input.facts.income.capital_transactions, "long", scheduleDTermOptions) +
      capitalGainDistributionsTotal +
      taxableSection1202GainTotal,
  );
  const scheduleDShortTermCapitalGainOrLossTotalWithCarryforward = roundMoney(
    scheduleDShortTermCapitalGainOrLossTotal + priorYearShortTermCapitalLossCarryforward,
  );
  const scheduleDLongTermCapitalGainOrLossTotalWithCarryforward = roundMoney(
    scheduleDLongTermCapitalGainOrLossTotal + priorYearLongTermCapitalLossCarryforward,
  );
  const scheduleDNetCapitalGainOrLossTotal = roundMoney(
    scheduleDShortTermCapitalGainOrLossTotalWithCarryforward +
      scheduleDLongTermCapitalGainOrLossTotalWithCarryforward,
  );
  const scheduleDCollectibles28PercentGainTotal = calculateScheduleDLine18({
    reportedCollectibles28PercentGainTotal: scheduleDSpecialGains.collectibles28PercentGainTotal,
    reportedTaxableSection1202GainTotal: taxableSection1202GainTotal,
    scheduleDShortTermCapitalGainOrLossTotal: scheduleDShortTermCapitalGainOrLossTotalWithCarryforward,
  });
  const scheduleDUnrecapturedSection1250GainTotal = calculateScheduleDLine19({
    reportedTwentyEightRateGainTotal: roundMoney(
      scheduleDSpecialGains.collectibles28PercentGainTotal + taxableSection1202GainTotal,
    ),
    reportedUnrecapturedSection1250GainTotal:
      scheduleDSpecialGains.unrecapturedSection1250GainTotal,
    scheduleDShortTermCapitalGainOrLossTotal: scheduleDShortTermCapitalGainOrLossTotalWithCarryforward,
  });
  const capitalLossDeduction = calculateCapitalLossDeduction({
    filingStatus,
    scheduleDNetCapitalGainOrLossTotal,
  });
  const capitalGainOrLossTotal = capitalLossDeduction.deductibleCapitalGainOrLoss;
  const nonemployeeCompensationRollup = buildNonemployeeCompensationRollup(input);
  const misc1099IncomeRollup = buildMisc1099IncomeRollup(input);
  const scheduleERollup = buildScheduleERollup(input.facts.income.schedule_e_activities, {
    additionalIncomeByActivityIndex: misc1099IncomeRollup.scheduleEIncomeByActivityIndex,
    allowReportedNetLossesWithoutLimitationOverrides:
      allowReportedNetLossesWithoutLimitationOverrides(input),
    limitationOverrides: getFederalScheduleELimitationOverrides(input),
  });
  const scheduleCBusinessNetProfit = sumScheduleCBusinessNetProfit(
    input.facts.income.schedule_c_businesses,
    nonemployeeCompensationRollup.receiptsByBusinessId,
  );
  const otherIncomeItemsTotal = roundMoney(
    sumNumbers(input.facts.income.other_income_items.map((item) => item.amount)),
  );
  const line8bGamblingIncomeTotal = misc1099IncomeRollup.line8bGamblingAmountTotal;
  const line8jNonbusinessActivityIncomeTotal = nonemployeeCompensationRollup.line8jAmountTotal;
  const line8zOtherIncomeTotal = roundMoney(
    otherIncomeItemsTotal + misc1099IncomeRollup.line8zOtherIncomeAmountTotal,
  );
  const otherIncomeDirectTotal = roundMoney(
    line8bGamblingIncomeTotal + line8jNonbusinessActivityIncomeTotal + line8zOtherIncomeTotal,
  );
  const scheduleSEComputation = calculateScheduleSE({
    filingStatus,
    input,
    scheduleCBusinessNetProfit,
  });
  const socialSecurityWorksheetAdjustmentTotal = roundMoney(
    sumAdjustmentValues(input.facts.adjustments, {
      excludedKeys: DERIVED_ADJUSTMENT_KEYS,
      includedKeys: SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS,
    }) + scheduleSEComputation.selfEmploymentTaxDeduction,
  );
  const taxableSocialSecurityBenefitsTotal = calculateTaxableSocialSecurityBenefits({
    allowMarriedFilingSeparatelyLivedApartException:
      socialSecurityExtension?.allow_married_filing_separately_lived_apart_exception,
    combinedIncome: roundMoney(
      wageTotal +
      taxableInterestTotal +
      ordinaryDividendsTotal +
      taxableIraDistributionsTotal +
      taxablePensionsAndAnnuitiesTotal +
      capitalGainOrLossTotal +
      otherIncomeDirectTotal +
      unemploymentCompensationTotal +
      scheduleCBusinessNetProfit +
      taxExemptInterestTotal +
      socialSecurityBenefitsNetTotal / 2 -
      socialSecurityWorksheetAdjustmentTotal,
    ),
    filingStatus,
    socialSecurityBenefitsNetTotal,
  });
  const unresolvedCapitalTransactionTermCount = input.facts.income.capital_transactions.filter(
    (transaction) => inferCapitalTransactionTerm(transaction, scheduleDTermOptions) === "unknown",
  ).length;
  const schedule1AdditionalIncomeTotal = roundMoney(
    otherIncomeDirectTotal +
      unemploymentCompensationTotal +
      scheduleCBusinessNetProfit +
      scheduleERollup.totalNetTotal,
  );
  const rawAdjustmentsTotal = sumAdjustmentValues(input.facts.adjustments, {
    excludedKeys: DERIVED_ADJUSTMENT_KEYS,
  });
  const totalAdjustments = roundMoney(
    rawAdjustmentsTotal + scheduleSEComputation.selfEmploymentTaxDeduction,
  );
  const adjustedGrossIncome = roundMoney(
    wageTotal +
      taxableInterestTotal +
      ordinaryDividendsTotal +
      taxableIraDistributionsTotal +
      taxablePensionsAndAnnuitiesTotal +
      taxableSocialSecurityBenefitsTotal +
      capitalGainOrLossTotal +
      schedule1AdditionalIncomeTotal -
      totalAdjustments,
  );
  const itemizedDeductionTotal = sumItemizedDeductionTotals(input.facts.itemized_deductions);
  const standardDeduction = STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus];
  const deductionStrategy =
    activations.scheduleAActivated && itemizedDeductionTotal > standardDeduction
      ? "itemized"
      : "standard";
  const line12Deductions =
    deductionStrategy === "itemized" ? itemizedDeductionTotal : standardDeduction;
  const rawTaxableIncome = roundMoney(adjustedGrossIncome - line12Deductions);
  const line15TaxableIncome = roundMoney(Math.max(rawTaxableIncome, 0));
  const preferentialRateTaxComputation =
    scheduleDCollectibles28PercentGainTotal > 0 || scheduleDUnrecapturedSection1250GainTotal > 0
      ? computeScheduleDTaxWorksheetTax({
          filingStatus,
          qualifiedDividendsTotal,
          scheduleDCollectibles28PercentGainTotal,
          scheduleDLongTermCapitalGainOrLossTotal:
            scheduleDLongTermCapitalGainOrLossTotalWithCarryforward,
          scheduleDNetCapitalGainOrLossTotal,
          scheduleDUnrecapturedSection1250GainTotal,
          taxableIncome: line15TaxableIncome,
        })
      : computePreferentialRateTax({
          filingStatus,
          qualifiedDividendsTotal,
          scheduleDNetCapitalGainOrLossTotal,
          taxableIncome: line15TaxableIncome,
        });
  const line16RegularIncomeTax = preferentialRateTaxComputation.tax;
  const earnedIncomeByPersonId = buildEarnedIncomeByPersonId(
    input,
    nonemployeeCompensationRollup.receiptsByBusinessId,
  );
  const totalEarnedIncome = getTotalEarnedIncome(
    input,
    nonemployeeCompensationRollup.receiptsByBusinessId,
  );
  const socialSecurityTaxWithheldTotal = getTotalSocialSecurityTaxWithheld(input);
  const medicareTaxWithheldTotal = getTotalMedicareTaxWithheld(input);
  const form8959Computation = calculateForm8959({
    filingStatus,
    input,
    selfEmploymentNetEarnings: scheduleSEComputation.netEarnings,
  });
  const earnedIncomeCreditComputation = calculateEarnedIncomeCredit({
    adjustedGrossIncome,
    capitalGainOrLossTotal,
    filingStatus,
    input,
    ordinaryDividendsTotal,
    taxExemptInterestTotal,
    taxableInterestTotal,
    totalEarnedIncome,
  });
  const line27aEarnedIncomeCredit = earnedIncomeCreditComputation.amount;
  const form2441Credit = calculateForm2441Credit({
    adjustedGrossIncome,
    earnedIncomeByPersonId,
    filingStatus,
    input,
    totalEarnedIncome,
  });
  const form8812Credit = calculateForm8812Credit({
    additionalMedicareTax: form8959Computation.additionalMedicareTax,
    adjustedGrossIncome,
    filingStatus,
    input,
    line16RegularIncomeTax,
    line27aEarnedIncomeCredit,
    medicareTaxWithheldTotal,
    selfEmploymentTaxDeduction: scheduleSEComputation.selfEmploymentTaxDeduction,
    socialSecurityTaxWithheldTotal,
    totalEarnedIncome,
  });
  const line19ChildTaxCreditOrCreditForOtherDependents = form8812Credit.nonrefundableCombinedCredit;
  const otherNonrefundableCreditsTotal = sumNamedAmounts(
    input.facts.credits.other_nonrefundable_credits,
  );
  const form8863Credit = calculateForm8863Credit({
    adjustedGrossIncome,
    filingStatus,
    input,
  });
  const remainingTaxAfterLine19 = roundMoney(
    Math.max(line16RegularIncomeTax - line19ChildTaxCreditOrCreditForOtherDependents, 0),
  );
  const allowedOtherNonrefundableCredits = roundMoney(
    Math.min(otherNonrefundableCreditsTotal, remainingTaxAfterLine19),
  );
  const remainingTaxAfterOtherNonrefundableCredits = roundMoney(
    Math.max(remainingTaxAfterLine19 - allowedOtherNonrefundableCredits, 0),
  );
  const childAndDependentCareCredit = roundMoney(
    Math.min(form2441Credit.nonrefundableCredit, remainingTaxAfterOtherNonrefundableCredits),
  );
  const remainingTaxAfterForm2441 = roundMoney(
    Math.max(remainingTaxAfterOtherNonrefundableCredits - childAndDependentCareCredit, 0),
  );
  const educationCreditNonrefundable = roundMoney(
    Math.min(form8863Credit.nonrefundableCredit, remainingTaxAfterForm2441),
  );
  const line20OtherNonrefundableCredits = roundMoney(
    allowedOtherNonrefundableCredits + childAndDependentCareCredit + educationCreditNonrefundable,
  );
  const form8960Computation = calculateForm8960({
    adjustedGrossIncome,
    filingStatus,
    ordinaryDividendsTotal,
    scheduleEInvestmentIncomeTotal: scheduleERollup.activityNetInvestmentIncomeTotal,
    scheduleDNetCapitalGainOrLossTotal,
    taxableInterestTotal,
  });
  const form8962Credit = calculateForm8962Credit({
    adjustedGrossIncome,
    filingStatus,
    input,
  });
  const line23OtherTaxes = roundMoney(
    scheduleSEComputation.selfEmploymentTax +
      form8959Computation.additionalMedicareTax +
      form8960Computation.netInvestmentIncomeTax +
      form8962Credit.excessAdvancePremiumTaxCreditRepayment,
  );
  const line24TotalTax = roundMoney(
    Math.max(
      line16RegularIncomeTax -
        line19ChildTaxCreditOrCreditForOtherDependents -
        line20OtherNonrefundableCredits,
      0,
    ) + line23OtherTaxes,
  );
  const directFederalWithholding = roundMoney(
    sumNumbers(
      input.facts.payments.withholdings
        .filter((withholding) => withholding.jurisdiction === "federal")
        .map((withholding) => withholding.amount),
    ),
  );
  const documentedFederalWithholding = sumDocumentedFederalWithholding(input);
  const usesDocumentedFederalWithholdingFallback =
    directFederalWithholding === 0 && documentedFederalWithholding > 0;
  const federalWithholding = roundMoney(
    (usesDocumentedFederalWithholdingFallback
      ? documentedFederalWithholding
      : directFederalWithholding) + form8959Computation.additionalMedicareTaxWithheld,
  );
  const estimatedAndExtensionPayments = roundMoney(
    sumNumbers(
      input.facts.payments.estimated_payments
        .filter((payment) => payment.jurisdiction === "federal")
        .map((payment) => payment.amount),
    ) +
      sumNumbers(
        input.facts.payments.extension_payments
          .filter((payment) => payment.jurisdiction === "federal")
          .map((payment) => payment.amount),
      ) +
      toNumber(input.facts.payments.prior_year_overpayment_applied_to_2025),
  );
  const otherRefundableCreditsTotal = sumNamedAmounts(input.facts.credits.other_refundable_credits);
  const line26EstimatedAndExtensionPayments = estimatedAndExtensionPayments;
  const line27a = line27aEarnedIncomeCredit;
  const line28AdditionalChildTaxCredit = form8812Credit.additionalChildTaxCredit;
  const educationCreditRefundable = form8863Credit.refundableCredit;
  const line29RefundableEducationCredit = educationCreditRefundable;
  const netPremiumTaxCredit = form8962Credit.netPremiumTaxCredit;
  const line31OtherPayments = roundMoney(otherRefundableCreditsTotal + netPremiumTaxCredit);
  const schedule2OtherTaxesTotal = line23OtherTaxes;
  const schedule3NonrefundableCreditsTotal = line20OtherNonrefundableCredits;
  const schedule3PaymentsTotal = roundMoney(
    line26EstimatedAndExtensionPayments + line31OtherPayments,
  );
  const line33TotalPayments = roundMoney(
    federalWithholding +
      line26EstimatedAndExtensionPayments +
      line27a +
      line28AdditionalChildTaxCredit +
      line29RefundableEducationCredit +
      line31OtherPayments,
  );
  const line34RefundAmount = roundMoney(Math.max(line33TotalPayments - line24TotalTax, 0));
  const line37AmountOwed = roundMoney(Math.max(line24TotalTax - line33TotalPayments, 0));
  const capitalLossCarryforward = calculateCapitalLossCarryforward({
    rawTaxableIncome,
    scheduleDLine15LongTermNet: scheduleDLongTermCapitalGainOrLossTotalWithCarryforward,
    scheduleDLine21LossDeduction: Math.max(-capitalGainOrLossTotal, 0),
    scheduleDLine7ShortTermNet: scheduleDShortTermCapitalGainOrLossTotalWithCarryforward,
  });

  return {
    additionalMedicareTax: form8959Computation.additionalMedicareTax,
    additionalMedicareTaxWithheld: form8959Computation.additionalMedicareTaxWithheld,
    amountOwed: line37AmountOwed,
    adjustedGrossIncome,
    capitalGainOrLossTotal,
    capitalGainDistributionsTotal,
    capitalLossCarryforwardGenerated: capitalLossCarryforward.totalCarryforward,
    capitalLossDeductionLimit: capitalLossDeduction.deductionLimit,
    capitalTransactionsNetTotal,
    childAndDependentCareCredit,
    childTaxCreditOrCreditForOtherDependents: line19ChildTaxCreditOrCreditForOtherDependents,
    deductionStrategy,
    documentedFederalWithholding,
    educationCreditNonrefundable,
    educationCreditRefundable,
    estimatedAndExtensionPayments,
    excessAdvancePremiumTaxCreditRepayment: form8962Credit.excessAdvancePremiumTaxCreditRepayment,
    federalWithholding,
    form2441CreditRate: form2441Credit.creditRate,
    form2441QualifiedExpenses: form2441Credit.qualifiedExpenses,
    form8812AdditionalChildTaxCredit: form8812Credit.additionalChildTaxCredit,
    form8812AlternativeActcMethodConsidered: form8812Credit.alternativeMethodConsidered,
    form8812AlternativeActcMethodUsed: form8812Credit.alternativeMethodUsed,
    form8812CreditBeforePhaseout: form8812Credit.creditBeforePhaseout,
    form8812OtherDependentsCount: form8812Credit.otherDependentsCount,
    form8812PhaseoutReduction: form8812Credit.phaseoutReduction,
    form8812QualifyingChildrenCount: form8812Credit.qualifyingChildrenCount,
    form8863NetQualifiedExpenses: form8863Credit.netQualifiedExpenses,
    form8962AdvancePremiumTaxCreditTotal: form8962Credit.advancePremiumTaxCreditTotal,
    form8962HouseholdIncomePercentage: form8962Credit.householdIncomePercentage,
    iraDistributionsGrossTotal,
    itemizedDeductionTotal,
    line12Deductions,
    line15TaxableIncome,
    line16RegularIncomeTax,
    line19ChildTaxCreditOrCreditForOtherDependents,
    line20OtherNonrefundableCredits,
    line23OtherTaxes,
    line24TotalTax,
    line26EstimatedAndExtensionPayments,
    line27aEarnedIncomeCredit: line27a,
    line28AdditionalChildTaxCredit,
    line29RefundableEducationCredit,
    line31OtherPayments,
    line33TotalPayments,
    line34RefundAmount,
    line37AmountOwed,
    line8bGamblingIncomeTotal,
    line8jNonbusinessActivityIncomeTotal,
    line8zOtherIncomeTotal,
    line2aTaxExemptInterest: taxExemptInterestTotal,
    line4aIraDistributions: iraDistributionsGrossTotal,
    line4bTaxableIraDistributions: taxableIraDistributionsTotal,
    line5aPensionsAndAnnuities: pensionsAndAnnuitiesGrossTotal,
    line5bTaxablePensionsAndAnnuities: taxablePensionsAndAnnuitiesTotal,
    line6aSocialSecurityBenefits: socialSecurityBenefitsNetTotal,
    line6bTaxableSocialSecurityBenefits: taxableSocialSecurityBenefitsTotal,
    netInvestmentIncome: form8960Computation.netInvestmentIncome,
    netInvestmentIncomeTax: form8960Computation.netInvestmentIncomeTax,
    netPremiumTaxCredit,
    line16TaxComputationMethod: preferentialRateTaxComputation.method,
    linkedNonemployeeCompensationToScheduleCTotal:
      nonemployeeCompensationRollup.linkedToScheduleCAmountTotal,
    misc1099ScheduleEAutoLinkedCount: misc1099IncomeRollup.scheduleEAutoLinkedCount,
    misc1099ScheduleEMappedCount: misc1099IncomeRollup.scheduleEMappedCount,
    misc1099ScheduleEMappedIncomeAmountTotal: misc1099IncomeRollup.scheduleEMappedIncomeAmountTotal,
    misc1099ScheduleEReviewCategories: misc1099IncomeRollup.scheduleEReviewCategories,
    misc1099ScheduleEReviewCount: misc1099IncomeRollup.scheduleEReviewCount,
    misc1099ScheduleEReviewIncomeAmountTotal:
      misc1099IncomeRollup.scheduleEReviewIncomeAmountTotal,
    misc1099UnsupportedIncomeAmountTotal: misc1099IncomeRollup.unsupportedIncomeAmountTotal,
    misc1099UnsupportedIncomeCategories: misc1099IncomeRollup.unsupportedCategories,
    nonemployeeCompensationAutoLinkedCount: nonemployeeCompensationRollup.autoLinkedCount,
    nonemployeeCompensationInvalidLinkedBusinessCount:
      nonemployeeCompensationRollup.invalidLinkedBusinessCount,
    nonemployeeCompensationLine8jCount: nonemployeeCompensationRollup.line8jCount,
    otherNonrefundableCreditsTotal,
    otherRefundableCreditsTotal,
    ordinaryDividendsTotal,
    pensionsAndAnnuitiesGrossTotal,
    qualifiedDividendsTotal,
    otherIncomeDirectTotal,
    retirementTaxableAmountAssumptionCount,
    scheduleCBusinessNetProfit,
    scheduleEActivityNetTotal: scheduleERollup.totalNetTotal,
    scheduleEInvestmentIncomeTotal: scheduleERollup.activityNetInvestmentIncomeTotal,
    scheduleELimitationOverrideCount: scheduleERollup.limitationOverrideCount,
    scheduleENegativeActivityCount: scheduleERollup.negativeActivityCount,
    scheduleEPart1NetTotal: scheduleERollup.part1NetTotal,
    scheduleEPart2NetTotal: scheduleERollup.part2NetTotal,
    scheduleEUnclassifiedActivityCount: scheduleERollup.unclassifiedActivityCount,
    schedule1AdditionalIncomeTotal,
    schedule2OtherTaxesTotal,
    schedule3NonrefundableCreditsTotal,
    schedule3PaymentsTotal,
    scheduleDCollectibles28PercentGainTotal,
    scheduleDLongTermCapitalGainOrLossTotal:
      scheduleDLongTermCapitalGainOrLossTotalWithCarryforward,
    scheduleDNetCapitalGainOrLossTotal,
    scheduleDPriorYearLongTermCapitalLossCarryforward: priorYearLongTermCapitalLossCarryforward,
    scheduleDPriorYearShortTermCapitalLossCarryforward: priorYearShortTermCapitalLossCarryforward,
    scheduleDShortTermCapitalGainOrLossTotal:
      scheduleDShortTermCapitalGainOrLossTotalWithCarryforward,
    scheduleDUnrecapturedSection1250GainTotal,
    section1202ExclusionAmount,
    section1202GainTotal: scheduleDSpecialGains.section1202GainTotal,
    selfEmploymentNetEarnings: scheduleSEComputation.netEarnings,
    selfEmploymentTax: scheduleSEComputation.selfEmploymentTax,
    selfEmploymentTaxDeduction: scheduleSEComputation.selfEmploymentTaxDeduction,
    socialSecurityBenefitsNetTotal,
    socialSecurityWorksheetAdjustmentTotal,
    standardDeduction,
    taxExemptInterestTotal,
    taxableIraDistributionsTotal,
    taxableInterestTotal,
    taxablePensionsAndAnnuitiesTotal,
    taxableSocialSecurityBenefitsTotal,
    taxableSection1202GainTotal,
    totalAdjustments,
    totalIncome: roundMoney(
      wageTotal +
        taxableInterestTotal +
        ordinaryDividendsTotal +
        taxableIraDistributionsTotal +
        taxablePensionsAndAnnuitiesTotal +
        taxableSocialSecurityBenefitsTotal +
        capitalGainOrLossTotal +
        schedule1AdditionalIncomeTotal,
    ),
    unemploymentCompensationTotal,
    unresolvedCapitalTransactionTermCount,
    usesDocumentedFederalWithholdingFallback,
    usesPreferentialRateTaxComputation: preferentialRateTaxComputation.usesWorksheet,
    wageTotal,
  };
}

export { buildFederalActivations, buildFederalComputation, finalizeFederalActivations };
