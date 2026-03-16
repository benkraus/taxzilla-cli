import type { CoreEngineInput } from "./input";
import {
  ADDITIONAL_CHILD_TAX_CREDIT_EARNED_INCOME_THRESHOLD,
  ADDITIONAL_CHILD_TAX_CREDIT_PER_CHILD,
  ADDITIONAL_MEDICARE_TAX_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD_BY_FILING_STATUS,
  CHILD_AND_DEPENDENT_CARE_MULTI_PERSON_EXPENSE_LIMIT,
  CHILD_AND_DEPENDENT_CARE_SINGLE_PERSON_EXPENSE_LIMIT,
  CHILD_TAX_CREDIT_PER_CHILD,
  CHILD_TAX_CREDIT_PHASEOUT_THRESHOLD_BY_FILING_STATUS,
  CREDIT_FOR_OTHER_DEPENDENT_AMOUNT,
  NET_INVESTMENT_INCOME_TAX_RATE,
  NET_INVESTMENT_INCOME_THRESHOLD_BY_FILING_STATUS,
  PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_ALL_OTHER,
  PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_SINGLE,
  SELF_EMPLOYMENT_EARNINGS_FACTOR,
  SELF_EMPLOYMENT_MEDICARE_RATE,
  SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_WAGE_BASE_2025,
} from "./constants";
import {
  getFederalForm2441Extension,
  getFederalForm8812Extension,
  getFederalForm8962Extension,
  getHouseholdPersonId,
  roundMoney,
  roundRate,
  sumNumbers,
  toNumber,
  toPositiveNumber,
  uniqueStrings,
} from "./helpers";
import {
  calculateAdditionalMedicareTaxWithheld,
  getEducationCreditPhaseoutMultiplier,
  getFederalPovertyLine,
  getPremiumTaxCreditRegion,
  getTotalSocialSecurityWages,
  getTotalMedicareWages,
} from "./foundations";
import { sumAdvancePremiumTaxCredits, sumEducationExpenses } from "./income";
import type { FederalFilingStatus, Form2441CreditComputation, Form8812CreditComputation, Form8863CreditComputation, Form8959Computation, Form8960Computation, Form8962CreditComputation, ScheduleSEComputation } from "./types";

function calculateScheduleSE(args: {
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
  readonly scheduleCBusinessNetProfit: number;
}): ScheduleSEComputation {
  if (args.scheduleCBusinessNetProfit <= 0) {
    return {
      medicareTaxPortion: 0,
      netEarnings: 0,
      selfEmploymentTax: 0,
      selfEmploymentTaxDeduction: 0,
      socialSecurityTaxPortion: 0,
    };
  }

  const netEarnings = roundMoney(args.scheduleCBusinessNetProfit * SELF_EMPLOYMENT_EARNINGS_FACTOR);

  if (netEarnings < 400) {
    return {
      medicareTaxPortion: 0,
      netEarnings,
      selfEmploymentTax: 0,
      selfEmploymentTaxDeduction: 0,
      socialSecurityTaxPortion: 0,
    };
  }

  const remainingSocialSecurityBase = Math.max(
    SOCIAL_SECURITY_WAGE_BASE_2025 - getTotalSocialSecurityWages(args.input),
    0,
  );
  const socialSecurityTaxPortion = roundMoney(
    Math.min(netEarnings, remainingSocialSecurityBase) * SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE,
  );
  const medicareTaxPortion = roundMoney(netEarnings * SELF_EMPLOYMENT_MEDICARE_RATE);
  const selfEmploymentTax = roundMoney(socialSecurityTaxPortion + medicareTaxPortion);

  return {
    medicareTaxPortion,
    netEarnings,
    selfEmploymentTax,
    selfEmploymentTaxDeduction: roundMoney(selfEmploymentTax / 2),
    socialSecurityTaxPortion,
  };
}

function calculateForm8959(args: {
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
  readonly selfEmploymentNetEarnings: number;
}): Form8959Computation {
  const medicareWages = getTotalMedicareWages(args.input);
  const additionalMedicareTax = roundMoney(
    Math.max(
      medicareWages +
        Math.max(args.selfEmploymentNetEarnings, 0) -
        ADDITIONAL_MEDICARE_THRESHOLD_BY_FILING_STATUS[args.filingStatus],
      0,
    ) * ADDITIONAL_MEDICARE_TAX_RATE,
  );

  return {
    additionalMedicareTax,
    additionalMedicareTaxWithheld: calculateAdditionalMedicareTaxWithheld(
      args.input.facts.income.wages,
    ),
  };
}

function calculateForm8960(args: {
  readonly adjustedGrossIncome: number;
  readonly scheduleDNetCapitalGainOrLossTotal: number;
  readonly scheduleEInvestmentIncomeTotal: number;
  readonly filingStatus: FederalFilingStatus;
  readonly ordinaryDividendsTotal: number;
  readonly taxableInterestTotal: number;
}): Form8960Computation {
  const netInvestmentIncome = roundMoney(
    Math.max(
      args.taxableInterestTotal +
        args.ordinaryDividendsTotal +
        args.scheduleEInvestmentIncomeTotal +
        Math.max(args.scheduleDNetCapitalGainOrLossTotal, 0),
      0,
    ),
  );
  const modifiedAdjustedGrossIncomeExcess = roundMoney(
    Math.max(
      args.adjustedGrossIncome -
        NET_INVESTMENT_INCOME_THRESHOLD_BY_FILING_STATUS[args.filingStatus],
      0,
    ),
  );

  return {
    netInvestmentIncome,
    netInvestmentIncomeTax: roundMoney(
      Math.min(netInvestmentIncome, modifiedAdjustedGrossIncomeExcess) *
        NET_INVESTMENT_INCOME_TAX_RATE,
    ),
  };
}

function getPremiumTaxCreditApplicableFigure(householdIncomePercentage: number): number {
  if (householdIncomePercentage <= 150) {
    return 0;
  }

  if (householdIncomePercentage <= 200) {
    return roundRate((householdIncomePercentage - 150) * 0.0004);
  }

  if (householdIncomePercentage <= 250) {
    return roundRate(0.02 + (householdIncomePercentage - 200) * 0.0004);
  }

  if (householdIncomePercentage <= 300) {
    return roundRate(0.04 + (householdIncomePercentage - 250) * 0.0004);
  }

  if (householdIncomePercentage <= 350) {
    return roundRate(0.06 + (householdIncomePercentage - 300) * 0.00025);
  }

  if (householdIncomePercentage <= 400) {
    return roundRate(0.0725 + (householdIncomePercentage - 350) * 0.00025);
  }

  return 0.085;
}

function getPremiumTaxCreditRepaymentCap(
  filingStatus: FederalFilingStatus,
  householdIncomePercentage: number | null,
): number | null {
  if (householdIncomePercentage == null || householdIncomePercentage >= 400) {
    return null;
  }

  const caps =
    filingStatus === "single"
      ? PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_SINGLE
      : PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_ALL_OTHER;

  const matchingCap = caps.find(
    (candidate) => householdIncomePercentage <= candidate.maxHouseholdIncomePercentage,
  )!;

  return matchingCap.cap;
}

function getForm2441CreditRate(adjustedGrossIncome: number): number {
  if (adjustedGrossIncome <= 15000) {
    return 0.35;
  }

  const reductionSteps = Math.ceil((adjustedGrossIncome - 15000) / 2000);
  return Math.max(roundRate(0.35 - reductionSteps * 0.01), 0.2);
}

function calculateForm2441Credit(args: {
  readonly adjustedGrossIncome: number;
  readonly earnedIncomeByPersonId: ReadonlyMap<string, number>;
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
  readonly totalEarnedIncome: number;
}): Form2441CreditComputation {
  const form2441Extension = getFederalForm2441Extension(args.input);
  const qualifyingPersonIds = uniqueStrings(
    args.input.facts.credits.child_and_dependent_care.qualifying_person_ids,
  );
  const expensePersonIds = uniqueStrings(
    args.input.facts.credits.child_and_dependent_care.expenses.map((expense) => expense.person_id),
  );
  const eligiblePersonIds = qualifyingPersonIds.length > 0 ? qualifyingPersonIds : expensePersonIds;
  const eligiblePersonIdSet = new Set(eligiblePersonIds);
  const qualifiedExpenses = roundMoney(
    sumNumbers(
      args.input.facts.credits.child_and_dependent_care.expenses
        .filter((expense) => eligiblePersonIdSet.has(expense.person_id))
        .map((expense) => expense.amount),
    ),
  );
  const qualifyingPersonCount = eligiblePersonIds.length;
  const expenseLimit =
    qualifyingPersonCount >= 2
      ? CHILD_AND_DEPENDENT_CARE_MULTI_PERSON_EXPENSE_LIMIT
      : qualifyingPersonCount === 1
        ? CHILD_AND_DEPENDENT_CARE_SINGLE_PERSON_EXPENSE_LIMIT
        : 0;

  const canUseMarriedFilingSeparatelyLivedApartException =
    args.filingStatus === "married_filing_separately" &&
    form2441Extension?.allow_married_filing_separately_lived_apart_exception === true;

  if (
    expenseLimit === 0 ||
    (args.filingStatus === "married_filing_separately" &&
      !canUseMarriedFilingSeparatelyLivedApartException)
  ) {
    return {
      creditRate: getForm2441CreditRate(args.adjustedGrossIncome),
      nonrefundableCredit: 0,
      qualifiedExpenses,
      qualifyingPersonCount,
    };
  }

  const taxpayerPersonId = getHouseholdPersonId(args.input.household.taxpayer);
  const spousePersonId = getHouseholdPersonId(args.input.household.spouse);
  const taxpayerEarnedIncome =
    taxpayerPersonId && args.earnedIncomeByPersonId.has(taxpayerPersonId)
      ? args.earnedIncomeByPersonId.get(taxpayerPersonId)!
      : args.totalEarnedIncome;
  const spouseEarnedIncome =
    spousePersonId && args.earnedIncomeByPersonId.has(spousePersonId)
      ? args.earnedIncomeByPersonId.get(spousePersonId)!
      : 0;
  const earnedIncomeLimit =
    args.filingStatus === "married_filing_jointly"
      ? Math.min(taxpayerEarnedIncome, spouseEarnedIncome)
      : taxpayerEarnedIncome;
  const allowedExpenses = roundMoney(
    Math.min(qualifiedExpenses, expenseLimit, Math.max(earnedIncomeLimit, 0)),
  );
  const creditRate = getForm2441CreditRate(args.adjustedGrossIncome);

  return {
    creditRate,
    nonrefundableCredit: roundMoney(allowedExpenses * creditRate),
    qualifiedExpenses,
    qualifyingPersonCount,
  };
}

function calculateForm8812Credit(args: {
  readonly additionalMedicareTax: number;
  readonly adjustedGrossIncome: number;
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
  readonly line16RegularIncomeTax: number;
  readonly line27aEarnedIncomeCredit: number;
  readonly medicareTaxWithheldTotal: number;
  readonly selfEmploymentTaxDeduction: number;
  readonly socialSecurityTaxWithheldTotal: number;
  readonly totalEarnedIncome: number;
}): Form8812CreditComputation {
  const form8812Extension = getFederalForm8812Extension(args.input);
  const qualifyingChildrenCount = uniqueStrings(
    args.input.facts.credits.candidate_child_tax_credit_dependent_ids,
  ).length;
  const qualifyingChildIdSet = new Set(
    args.input.facts.credits.candidate_child_tax_credit_dependent_ids,
  );
  const otherDependentsCount = uniqueStrings(
    args.input.facts.credits.candidate_credit_for_other_dependent_ids.filter(
      (dependentId) => !qualifyingChildIdSet.has(dependentId),
    ),
  ).length;

  if (args.input.household.can_be_claimed_as_dependent === true) {
    return {
      additionalChildTaxCredit: 0,
      alternativeMethodAdditionalChildTaxCredit: 0,
      alternativeMethodConsidered: false,
      alternativeMethodUsed: false,
      creditBeforePhaseout: 0,
      creditLimitWorksheetAAmount: 0,
      earnedIncomeMethodAdditionalChildTaxCredit: 0,
      nonrefundableChildTaxCredit: 0,
      nonrefundableCombinedCredit: 0,
      nonrefundableOtherDependentCredit: 0,
      otherDependentsCount,
      phaseoutReduction: 0,
      qualifyingChildrenCount,
      reducedChildTaxCredit: 0,
      reducedOtherDependentCredit: 0,
    };
  }

  const potentialChildCredit = qualifyingChildrenCount * CHILD_TAX_CREDIT_PER_CHILD;
  const potentialOtherDependentCredit = otherDependentsCount * CREDIT_FOR_OTHER_DEPENDENT_AMOUNT;
  const creditBeforePhaseout = potentialChildCredit + potentialOtherDependentCredit;
  const phaseoutThreshold = CHILD_TAX_CREDIT_PHASEOUT_THRESHOLD_BY_FILING_STATUS[args.filingStatus];
  const phaseoutReduction =
    args.adjustedGrossIncome > phaseoutThreshold
      ? Math.ceil((args.adjustedGrossIncome - phaseoutThreshold) / 1000) * 50
      : 0;
  const reducedChildTaxCredit = Math.max(potentialChildCredit - phaseoutReduction, 0);
  const reducedOtherDependentCredit = Math.max(
    potentialOtherDependentCredit - Math.max(phaseoutReduction - potentialChildCredit, 0),
    0,
  );
  const creditLimitWorksheetAAmount = roundMoney(
    Math.max(
      args.line16RegularIncomeTax -
        toPositiveNumber(form8812Extension?.credit_limit_worksheet_b_line15_additional_credits),
      0,
    ),
  );
  const nonrefundableCombinedCredit = roundMoney(
    Math.min(reducedChildTaxCredit + reducedOtherDependentCredit, creditLimitWorksheetAAmount),
  );
  const nonrefundableChildTaxCredit = roundMoney(
    Math.min(reducedChildTaxCredit, nonrefundableCombinedCredit),
  );
  const nonrefundableOtherDependentCredit = roundMoney(
    Math.min(
      reducedOtherDependentCredit,
      Math.max(nonrefundableCombinedCredit - nonrefundableChildTaxCredit, 0),
    ),
  );
  const remainingChildTaxCredit = roundMoney(
    Math.max(reducedChildTaxCredit - nonrefundableChildTaxCredit, 0),
  );
  const earnedIncomeForActc = roundMoney(
    Math.max(
      form8812Extension?.earned_income_override ?? args.totalEarnedIncome,
      0,
    ),
  );
  const earnedIncomeMethodAmount = roundMoney(
    Math.max(earnedIncomeForActc - ADDITIONAL_CHILD_TAX_CREDIT_EARNED_INCOME_THRESHOLD, 0) *
      0.15,
  );
  const earnedIncomeMethodAdditionalChildTaxCredit = roundMoney(
    Math.min(
      remainingChildTaxCredit,
      qualifyingChildrenCount * ADDITIONAL_CHILD_TAX_CREDIT_PER_CHILD,
      earnedIncomeMethodAmount,
    ),
  );
  const perChildActcCap = qualifyingChildrenCount * ADDITIONAL_CHILD_TAX_CREDIT_PER_CHILD;
  const alternativeMethodConsidered =
    qualifyingChildrenCount >= 3 && remainingChildTaxCredit > earnedIncomeMethodAdditionalChildTaxCredit;
  const payrollTaxAmount = roundMoney(
    args.socialSecurityTaxWithheldTotal +
      args.medicareTaxWithheldTotal +
      args.selfEmploymentTaxDeduction +
      args.additionalMedicareTax,
  );
  const creditLimitWorksheetBLine10 = roundMoney(
    args.line27aEarnedIncomeCredit +
      toPositiveNumber(form8812Extension?.credit_limit_worksheet_b_line10_schedule3_line11),
  );
  const alternativeMethodAmount = alternativeMethodConsidered
    ? roundMoney(
        Math.min(
          remainingChildTaxCredit,
          perChildActcCap,
          Math.max(payrollTaxAmount - creditLimitWorksheetBLine10, 0),
        ),
      )
    : 0;
  const additionalChildTaxCredit = roundMoney(
    Math.max(earnedIncomeMethodAdditionalChildTaxCredit, alternativeMethodAmount),
  );

  return {
    additionalChildTaxCredit,
    alternativeMethodAdditionalChildTaxCredit: alternativeMethodAmount,
    alternativeMethodConsidered,
    alternativeMethodUsed:
      alternativeMethodConsidered &&
      alternativeMethodAmount > earnedIncomeMethodAdditionalChildTaxCredit,
    creditBeforePhaseout,
    creditLimitWorksheetAAmount,
    earnedIncomeMethodAdditionalChildTaxCredit,
    nonrefundableChildTaxCredit,
    nonrefundableCombinedCredit,
    nonrefundableOtherDependentCredit,
    otherDependentsCount,
    phaseoutReduction,
    qualifyingChildrenCount,
    reducedChildTaxCredit,
    reducedOtherDependentCredit,
  };
}

function calculateForm8863Credit(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
}): Form8863CreditComputation {
  const students = args.input.facts.credits.education_credits.students;

  if (
    students.length === 0 ||
    args.input.household.can_be_claimed_as_dependent === true ||
    args.filingStatus === "married_filing_separately"
  ) {
    return {
      netQualifiedExpenses: sumEducationExpenses(students),
      nonrefundableCredit: 0,
      refundableCredit: 0,
    };
  }

  let aotcBeforePhaseout = 0;
  let llcQualifiedExpenses = 0;
  let netQualifiedExpenses = 0;

  for (const student of students) {
    const netExpenses = Math.max(
      toNumber(student.qualified_expenses_paid) - toNumber(student.tax_free_assistance),
      0,
    );

    netQualifiedExpenses += netExpenses;

    if (student.is_aotc_candidate) {
      aotcBeforePhaseout +=
        Math.min(netExpenses, 2000) + Math.max(Math.min(netExpenses - 2000, 2000), 0) * 0.25;
      continue;
    }

    if (student.is_llc_candidate) {
      llcQualifiedExpenses += netExpenses;
    }
  }

  const phaseoutMultiplier = getEducationCreditPhaseoutMultiplier(
    args.adjustedGrossIncome,
    args.filingStatus,
  );
  const allowedAotc = roundMoney(aotcBeforePhaseout * phaseoutMultiplier);
  const allowedLlc = roundMoney(Math.min(llcQualifiedExpenses, 10000) * 0.2 * phaseoutMultiplier);
  const refundableCredit = roundMoney(allowedAotc * 0.4);

  return {
    netQualifiedExpenses: roundMoney(netQualifiedExpenses),
    nonrefundableCredit: roundMoney(allowedAotc + allowedLlc - refundableCredit),
    refundableCredit,
  };
}

function calculateForm8962Credit(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
}): Form8962CreditComputation {
  const form8962Extension = getFederalForm8962Extension(args.input);
  const policies = args.input.facts.credits.premium_tax_credit.policies;
  const advancePremiumTaxCreditTotal = sumAdvancePremiumTaxCredits(policies);
  const annualEnrollmentPremium = roundMoney(
    sumNumbers(
      policies.flatMap((policy) =>
        policy.monthly_rows.map((row) => toNumber(row.enrollment_premium)),
      ),
    ),
  );
  const annualSecondLowestSilverPremium = roundMoney(
    sumNumbers(
      policies.flatMap((policy) =>
        policy.monthly_rows.map((row) => toNumber(row.second_lowest_cost_silver_plan_premium)),
      ),
    ),
  );

  if (policies.length === 0) {
    return {
      advancePremiumTaxCreditTotal,
      excessAdvancePremiumTaxCreditRepayment: 0,
      householdIncomePercentage: null,
      netPremiumTaxCredit: 0,
    };
  }

  if (
    args.filingStatus === "married_filing_separately" &&
    form8962Extension?.allow_married_filing_separately_exception !== true
  ) {
    return {
      advancePremiumTaxCreditTotal,
      excessAdvancePremiumTaxCreditRepayment: advancePremiumTaxCreditTotal,
      householdIncomePercentage: null,
      netPremiumTaxCredit: 0,
    };
  }

  const familySize =
    1 + (args.input.household.spouse != null ? 1 : 0) + args.input.household.dependents.length;
  const federalPovertyLine = getFederalPovertyLine(
    getPremiumTaxCreditRegion(args.input),
    familySize,
  );
  const householdIncomePercentage = Math.floor((args.adjustedGrossIncome / federalPovertyLine) * 100);

  if (
    householdIncomePercentage == null ||
    (householdIncomePercentage < 100 &&
      form8962Extension?.allow_household_income_below_fpl_exception !== true)
  ) {
    return {
      advancePremiumTaxCreditTotal,
      excessAdvancePremiumTaxCreditRepayment: 0,
      householdIncomePercentage,
      netPremiumTaxCredit: 0,
    };
  }

  const applicableFigure = getPremiumTaxCreditApplicableFigure(householdIncomePercentage);
  const expectedContribution = roundMoney(args.adjustedGrossIncome * applicableFigure);
  const allowedPremiumTaxCredit = roundMoney(
    Math.max(
      Math.min(annualEnrollmentPremium, annualSecondLowestSilverPremium) - expectedContribution,
      0,
    ),
  );
  const netPremiumTaxCredit = roundMoney(
    Math.max(allowedPremiumTaxCredit - advancePremiumTaxCreditTotal, 0),
  );
  const uncappedExcessRepayment = roundMoney(
    Math.max(advancePremiumTaxCreditTotal - allowedPremiumTaxCredit, 0),
  );
  const repaymentCap = getPremiumTaxCreditRepaymentCap(
    args.filingStatus,
    householdIncomePercentage,
  );

  return {
    advancePremiumTaxCreditTotal,
    excessAdvancePremiumTaxCreditRepayment: roundMoney(
      repaymentCap == null
        ? uncappedExcessRepayment
        : Math.min(uncappedExcessRepayment, repaymentCap),
    ),
    householdIncomePercentage,
    netPremiumTaxCredit,
  };
}

export {
  calculateForm2441Credit,
  calculateForm8812Credit,
  calculateForm8863Credit,
  calculateForm8959,
  calculateForm8960,
  calculateForm8962Credit,
  calculateScheduleSE,
  getForm2441CreditRate,
  getPremiumTaxCreditApplicableFigure,
  getPremiumTaxCreditRepaymentCap,
};
