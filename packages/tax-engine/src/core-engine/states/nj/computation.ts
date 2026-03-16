import {
  asBoolean,
  asNumber,
  asRecord,
  getAgeOnLastDayOfTaxYear,
  sumNumbers,
} from "../../helpers";
import type { StateArtifactsArgs } from "../common";
import {
  countBlindTaxpayers,
  countDependentExemptions,
  countPersonalExemptions,
  countSeniorTaxpayers,
  normalizeResidentFilingStatus,
  toWholeDollars,
} from "../resident";

type NewJerseyFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

type NewJerseyRetirementExclusionResult = {
  readonly line20aRetirementIncome: number;
  readonly line28aPensionExclusion: number;
  readonly line28bOtherRetirementIncomeExclusion: number;
  readonly line28cTotalRetirementExclusion: number;
  readonly missingSingleSpouseAllocationOverride: boolean;
};

type NewJerseyPropertyTaxBenefitResult = {
  readonly line40aPropertyTaxesPaid: number;
  readonly line41PropertyTaxDeduction: number;
  readonly line56PropertyTaxCredit: number;
  readonly usedPropertyTaxCredit: boolean;
};

const NEW_JERSEY_CHILD_TAX_CREDIT_BY_TAXABLE_INCOME: ReadonlyArray<
  readonly [number, number]
> = [
  [30_000, 1_000],
  [40_000, 800],
  [50_000, 600],
  [60_000, 400],
  [80_000, 200],
] as const;

function calculateNewJerseyTax(
  taxableIncome: number,
  filingStatus: NewJerseyFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  const jointLike =
    filingStatus === "married_filing_jointly" ||
    filingStatus === "head_of_household" ||
    filingStatus === "qualifying_surviving_spouse";

  if (jointLike) {
    if (taxableIncome <= 20_000) {
      return toWholeDollars(taxableIncome * 0.014);
    }

    if (taxableIncome <= 50_000) {
      return toWholeDollars(taxableIncome * 0.0175 - 70);
    }

    if (taxableIncome <= 70_000) {
      return toWholeDollars(taxableIncome * 0.0245 - 420);
    }

    if (taxableIncome <= 80_000) {
      return toWholeDollars(taxableIncome * 0.035 - 1_154.5);
    }

    if (taxableIncome <= 150_000) {
      return toWholeDollars(taxableIncome * 0.05525 - 2_775);
    }

    if (taxableIncome <= 500_000) {
      return toWholeDollars(taxableIncome * 0.0637 - 4_042.5);
    }

    if (taxableIncome <= 1_000_000) {
      return toWholeDollars(taxableIncome * 0.0897 - 17_042.5);
    }

    return toWholeDollars(taxableIncome * 0.1075 - 34_842.5);
  }

  if (taxableIncome <= 20_000) {
    return toWholeDollars(taxableIncome * 0.014);
  }

  if (taxableIncome <= 35_000) {
    return toWholeDollars(taxableIncome * 0.0175 - 70);
  }

  if (taxableIncome <= 40_000) {
    return toWholeDollars(taxableIncome * 0.035 - 682.5);
  }

  if (taxableIncome <= 75_000) {
    return toWholeDollars(taxableIncome * 0.05525 - 1_492.5);
  }

  if (taxableIncome <= 500_000) {
    return toWholeDollars(taxableIncome * 0.0637 - 2_126.25);
  }

  if (taxableIncome <= 1_000_000) {
    return toWholeDollars(taxableIncome * 0.0897 - 15_126.25);
  }

  return toWholeDollars(taxableIncome * 0.1075 - 32_926.25);
}

function calculateNewJerseyRetirementExclusionMaximum(args: {
  readonly filingStatus: NewJerseyFilingStatus;
  readonly grossIncome: number;
  readonly retirementIncome: number;
}): number {
  const { grossIncome, retirementIncome } = args;

  if (grossIncome > 150_000) {
    return 0;
  }

  if (args.filingStatus === "married_filing_jointly") {
    if (grossIncome <= 100_000) {
      return 100_000;
    }

    if (grossIncome <= 125_000) {
      return retirementIncome * 0.5;
    }

    return retirementIncome * 0.25;
  }

  if (
    args.filingStatus === "single" ||
    args.filingStatus === "head_of_household" ||
    args.filingStatus === "qualifying_surviving_spouse"
  ) {
    if (grossIncome <= 100_000) {
      return 75_000;
    }

    if (grossIncome <= 125_000) {
      return retirementIncome * 0.375;
    }

    return retirementIncome * 0.1875;
  }

  if (grossIncome <= 100_000) {
    return 50_000;
  }

  if (grossIncome <= 125_000) {
    return retirementIncome * 0.25;
  }

  return retirementIncome * 0.125;
}

function calculateNewJerseyRetirementDistributionTotal(
  input: StateArtifactsArgs["input"],
): number {
  return toWholeDollars(
    sumNumbers(
      input.facts.income.retirement_distributions.map(
        (distribution) => distribution.taxable_amount ?? distribution.gross_distribution ?? 0,
      ),
    ),
  );
}

function calculateNewJerseyRetirementExclusion(args: {
  readonly filingStatus: NewJerseyFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly grossIncome: number;
  readonly input: StateArtifactsArgs["input"];
}): NewJerseyRetirementExclusionResult {
  const overrideRetirementIncome = asNumber(args.formRecord?.retirement_income_amount);
  const line20aRetirementIncome = toWholeDollars(
    overrideRetirementIncome ?? calculateNewJerseyRetirementDistributionTotal(args.input),
  );
  const overrideLine28a = asNumber(args.formRecord?.pension_exclusion_amount);

  if (overrideLine28a != null) {
    const line28aPensionExclusion = toWholeDollars(overrideLine28a);
    const otherExclusion = toWholeDollars(
      asNumber(args.formRecord?.other_retirement_income_exclusion_amount) ??
        asNumber(args.formRecord?.special_retirement_exclusion_amount) ??
        0,
    );

    return {
      line20aRetirementIncome,
      line28aPensionExclusion,
      line28bOtherRetirementIncomeExclusion: otherExclusion,
      line28cTotalRetirementExclusion: line28aPensionExclusion + otherExclusion,
      missingSingleSpouseAllocationOverride: false,
    };
  }

  const eligibleSeniorOrBlindCount =
    countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input);

  if (eligibleSeniorOrBlindCount === 0) {
    return {
      line20aRetirementIncome,
      line28aPensionExclusion: 0,
      line28bOtherRetirementIncomeExclusion: 0,
      line28cTotalRetirementExclusion: 0,
      missingSingleSpouseAllocationOverride: false,
    };
  }

  const maximumExclusion = toWholeDollars(
    calculateNewJerseyRetirementExclusionMaximum({
      filingStatus: args.filingStatus,
      grossIncome: args.grossIncome,
      retirementIncome: line20aRetirementIncome,
    }),
  );
  const line28aPensionExclusion = Math.min(line20aRetirementIncome, maximumExclusion);
  const explicitSpecialExclusion = toWholeDollars(
    asNumber(args.formRecord?.special_retirement_exclusion_amount) ?? 0,
  );
  const partnershipIncome = toWholeDollars(asNumber(args.formRecord?.partnership_income_amount) ?? 0);
  const sCorporationIncome = toWholeDollars(asNumber(args.formRecord?.s_corporation_income_amount) ?? 0);
  const wageIncome = toWholeDollars(
    sumNumbers(args.input.facts.income.wages.map((wage) => wage.wages_tips_other_compensation)),
  );
  const businessIncome = toWholeDollars(
    asNumber(args.formRecord?.business_income_amount) ?? 0,
  );
  const line8OtherIncome = wageIncome + businessIncome + partnershipIncome + sCorporationIncome;
  const remainingExclusion = Math.max(maximumExclusion - line28aPensionExclusion, 0);
  const line28bOtherRetirementIncomeExclusion = explicitSpecialExclusion > 0
    ? explicitSpecialExclusion
    : args.grossIncome <= 150_000 && line8OtherIncome <= 3_000
      ? remainingExclusion
      : 0;

  return {
    line20aRetirementIncome,
    line28aPensionExclusion,
    line28bOtherRetirementIncomeExclusion,
    line28cTotalRetirementExclusion:
      line28aPensionExclusion + line28bOtherRetirementIncomeExclusion,
    missingSingleSpouseAllocationOverride:
      args.filingStatus === "married_filing_jointly" &&
      eligibleSeniorOrBlindCount === 1 &&
      line20aRetirementIncome > 0 &&
      overrideRetirementIncome == null,
  };
}

function calculateNewJerseyExemptionAmount(args: {
  readonly filingStatus: NewJerseyFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.exemption_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const veteranCount = toWholeDollars(asNumber(args.formRecord?.veteran_exemption_count) ?? 0);
  const dependentCount = countDependentExemptions(args.input);
  const collegeDependentCount = toWholeDollars(
    asNumber(args.formRecord?.college_dependent_count) ??
      args.input.household.dependents.filter((dependent) => {
        const dependentRecord = asRecord(dependent);
        const age = getAgeOnLastDayOfTaxYear(
          typeof dependentRecord?.date_of_birth === "string" ? dependentRecord.date_of_birth : null,
          args.input.tax_year,
        );
        return age != null && age < 22 && asBoolean(dependentRecord?.is_full_time_student) === true;
      }).length,
  );

  return toWholeDollars(
    countPersonalExemptions(args.input, args.filingStatus) * 1_000 +
      countSeniorTaxpayers(args.input) * 1_000 +
      countBlindTaxpayers(args.input) * 1_000 +
      veteranCount * 6_000 +
      dependentCount * 1_500 +
      collegeDependentCount * 1_000,
  );
}

function calculateNewJerseyPropertyTaxBenefit(args: {
  readonly filingStatus: NewJerseyFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line39TaxableIncome: number;
  readonly otherStateCreditAmount: number;
}): NewJerseyPropertyTaxBenefitResult {
  const overridePropertyTaxesPaid = asNumber(args.formRecord?.property_taxes_paid_amount);
  const rentPaidAmount = toWholeDollars(asNumber(args.formRecord?.rent_paid_amount) ?? 0);
  const propertyTaxesPaid = toWholeDollars(
    overridePropertyTaxesPaid ?? rentPaidAmount * 0.18,
  );
  const maintainedSameMainHomeWithSpouse = asBoolean(
    args.formRecord?.maintained_same_main_home_with_spouse,
  ) === true;
  const deductionCap =
    args.filingStatus === "married_filing_separately" && maintainedSameMainHomeWithSpouse
      ? 7_500
      : 15_000;
  const creditAmount =
    args.filingStatus === "married_filing_separately" && maintainedSameMainHomeWithSpouse ? 25 : 50;
  const line41PropertyTaxDeduction = Math.min(propertyTaxesPaid, deductionCap);

  if (propertyTaxesPaid <= 0) {
    return {
      line40aPropertyTaxesPaid: 0,
      line41PropertyTaxDeduction: 0,
      line56PropertyTaxCredit: 0,
      usedPropertyTaxCredit: false,
    };
  }

  if (
    asBoolean(args.formRecord?.force_property_tax_credit) === true &&
    args.otherStateCreditAmount <= 0
  ) {
    return {
      line40aPropertyTaxesPaid: propertyTaxesPaid,
      line41PropertyTaxDeduction: 0,
      line56PropertyTaxCredit: creditAmount,
      usedPropertyTaxCredit: true,
    };
  }

  if (
    asBoolean(args.formRecord?.force_property_tax_deduction) === true ||
    args.otherStateCreditAmount > 0
  ) {
    return {
      line40aPropertyTaxesPaid: propertyTaxesPaid,
      line41PropertyTaxDeduction,
      line56PropertyTaxCredit: 0,
      usedPropertyTaxCredit: false,
    };
  }

  const taxBeforeDeduction = calculateNewJerseyTax(args.line39TaxableIncome, args.filingStatus);
  const taxAfterDeduction = calculateNewJerseyTax(
    Math.max(args.line39TaxableIncome - line41PropertyTaxDeduction, 0),
    args.filingStatus,
  );
  const deductionBenefit = taxBeforeDeduction - taxAfterDeduction;

  if (deductionBenefit >= creditAmount) {
    return {
      line40aPropertyTaxesPaid: propertyTaxesPaid,
      line41PropertyTaxDeduction,
      line56PropertyTaxCredit: 0,
      usedPropertyTaxCredit: false,
    };
  }

  return {
    line40aPropertyTaxesPaid: propertyTaxesPaid,
    line41PropertyTaxDeduction: 0,
    line56PropertyTaxCredit: creditAmount,
    usedPropertyTaxCredit: true,
  };
}

function calculateNewJerseyChildAndDependentCareCredit(args: {
  readonly federalCreditAmount: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly taxableIncome: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.child_and_dependent_care_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (args.taxableIncome > 150_000) {
    return 0;
  }

  const percentage =
    args.taxableIncome <= 30_000
      ? 0.5
      : args.taxableIncome <= 60_000
        ? 0.4
        : args.taxableIncome <= 90_000
          ? 0.3
          : args.taxableIncome <= 120_000
            ? 0.2
            : 0.1;

  return toWholeDollars(args.federalCreditAmount * percentage);
}

function calculateNewJerseyChildTaxCredit(args: {
  readonly filingStatus: NewJerseyFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly taxableIncome: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.child_tax_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (args.filingStatus === "married_filing_separately") {
    return 0;
  }

  const qualifyingChildCount = toWholeDollars(
    asNumber(args.formRecord?.qualifying_child_tax_credit_count) ??
      args.input.household.dependents.filter((dependent) => {
        const birthDate = asRecord(dependent)?.date_of_birth;
        const age = typeof birthDate === "string"
          ? getAgeOnLastDayOfTaxYear(birthDate, args.input.tax_year)
          : null;
        return age != null && age <= 5;
      }).length,
  );

  for (const [upperBound, creditPerChild] of NEW_JERSEY_CHILD_TAX_CREDIT_BY_TAXABLE_INCOME) {
    if (args.taxableIncome <= upperBound) {
      return qualifyingChildCount * creditPerChild;
    }
  }

  return 0;
}

function calculateNewJerseyRefundableCredits(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly filingStatus: NewJerseyFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly line42TaxableIncome: number;
  readonly line56PropertyTaxCredit: number;
}): number {
  const earnedIncomeCredit = toWholeDollars(
    asNumber(args.formRecord?.earned_income_credit_amount) ??
      ((args.federalSummary?.line27a_earned_income_credit ?? 0) * 0.4),
  );
  const childAndDependentCareCredit = calculateNewJerseyChildAndDependentCareCredit({
    federalCreditAmount: args.federalSummary?.child_and_dependent_care_credit ?? 0,
    formRecord: args.formRecord,
    taxableIncome: args.line42TaxableIncome,
  });
  const childTaxCredit = calculateNewJerseyChildTaxCredit({
    filingStatus: args.filingStatus,
    formRecord: args.formRecord,
    input: args.input,
    taxableIncome: args.line42TaxableIncome,
  });

  return toWholeDollars(
    args.line56PropertyTaxCredit +
      earnedIncomeCredit +
      childAndDependentCareCredit +
      childTaxCredit +
      (asNumber(args.formRecord?.pass_through_business_alternative_income_tax_credit_amount) ?? 0) +
      (asNumber(args.formRecord?.wounded_warrior_caregivers_credit_amount) ?? 0) +
      (asNumber(args.formRecord?.excess_unemployment_contribution_credit_amount) ?? 0) +
      (asNumber(args.formRecord?.excess_disability_contribution_credit_amount) ?? 0) +
      (asNumber(args.formRecord?.excess_family_leave_contribution_credit_amount) ?? 0),
  );
}

function calculateNewJerseyAutomaticIncomeSubtractions(
  input: StateArtifactsArgs["input"],
): number {
  const socialSecurityBenefitTotal = toWholeDollars(
    sumNumbers(
      input.facts.income.social_security_benefits.map(
        (benefit) => benefit.net_benefits ?? benefit.benefits_paid ?? 0,
      ),
    ),
  );
  const unemploymentCompensationTotal = toWholeDollars(
    sumNumbers(
      input.facts.income.unemployment_compensation.map(
        (benefit) => benefit.unemployment_compensation ?? 0,
      ),
    ),
  );

  return socialSecurityBenefitTotal + unemploymentCompensationTotal;
}

export {
  calculateNewJerseyAutomaticIncomeSubtractions,
  calculateNewJerseyExemptionAmount,
  calculateNewJerseyPropertyTaxBenefit,
  calculateNewJerseyRefundableCredits,
  calculateNewJerseyRetirementExclusion,
  calculateNewJerseyTax,
};

export type {
  NewJerseyPropertyTaxBenefitResult,
  NewJerseyRetirementExclusionResult,
};
