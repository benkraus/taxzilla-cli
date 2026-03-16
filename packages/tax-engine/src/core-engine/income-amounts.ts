import type {
  CoreEngineCareExpense,
  CoreEngineDividendInput,
  CoreEngineEducationStudent,
  CoreEngineInput,
  CoreEngineMarketplacePolicy,
  CoreEngineScheduleCBusiness,
  CoreEngineTaxableInterestInput,
} from "./input";
import { calculateScheduleCBusinessNetProfit } from "./foundations";
import { roundMoney, sumNumbers, toNumber } from "./helpers";
import type { FederalFilingStatus } from "./types";

function sumCareExpenses(expenses: ReadonlyArray<CoreEngineCareExpense>): number {
  return roundMoney(sumNumbers(expenses.map((expense) => expense.amount)));
}

function sumEducationExpenses(students: ReadonlyArray<CoreEngineEducationStudent>): number {
  return roundMoney(
    sumNumbers(
      students.map((student) =>
        Math.max(
          toNumber(student.qualified_expenses_paid) - toNumber(student.tax_free_assistance),
          0,
        ),
      ),
    ),
  );
}

function sumAdvancePremiumTaxCredits(policies: ReadonlyArray<CoreEngineMarketplacePolicy>): number {
  return roundMoney(
    sumNumbers(
      policies.flatMap((policy) =>
        policy.monthly_rows.map((row) => toNumber(row.advance_payment_of_premium_tax_credit)),
      ),
    ),
  );
}

function sumScheduleCBusinessNetProfit(
  businesses: ReadonlyArray<CoreEngineScheduleCBusiness>,
  additionalGrossReceiptsByBusinessId?: ReadonlyMap<string, number>,
): number {
  return roundMoney(
    sumNumbers(
      businesses.map((business) =>
        calculateScheduleCBusinessNetProfit(business, additionalGrossReceiptsByBusinessId),
      ),
    ),
  );
}

function sumQualifiedDividends(dividends: ReadonlyArray<CoreEngineDividendInput>): number {
  return roundMoney(
    sumNumbers(dividends.map((dividend) => toNumber(dividend.qualified_dividends))),
  );
}

function sumTaxExemptInterest(interests: ReadonlyArray<CoreEngineTaxableInterestInput>): number {
  return roundMoney(
    sumNumbers(interests.map((interest) => toNumber(interest.tax_exempt_interest))),
  );
}

function sumExemptInterestDividends(dividends: ReadonlyArray<CoreEngineDividendInput>): number {
  return roundMoney(
    sumNumbers(dividends.map((dividend) => toNumber(dividend.exempt_interest_dividends))),
  );
}

function sumCapitalGainDistributions(dividends: ReadonlyArray<CoreEngineDividendInput>): number {
  return roundMoney(
    sumNumbers(dividends.map((dividend) => toNumber(dividend.capital_gain_distributions))),
  );
}

function sumDocumentedFederalWithholding(input: CoreEngineInput): number {
  return roundMoney(
    sumNumbers(input.facts.income.wages.map((wage) => toNumber(wage.federal_income_tax_withheld))) +
      sumNumbers(
        input.facts.income.taxable_interest.map((interest) =>
          toNumber(interest.federal_income_tax_withheld),
        ),
      ) +
      sumNumbers(
        input.facts.income.dividends.map((dividend) => toNumber(dividend.federal_income_tax_withheld)),
      ) +
      sumNumbers(
        input.facts.income.retirement_distributions.map((distribution) =>
          toNumber(distribution.federal_income_tax_withheld),
        ),
      ) +
      sumNumbers(
        input.facts.income.unemployment_compensation.map((unemployment) =>
          toNumber(unemployment.federal_income_tax_withheld),
        ),
      ) +
      sumNumbers(
        input.facts.income.nonemployee_compensation.map((nonemployeeCompensation) =>
          toNumber(nonemployeeCompensation.federal_income_tax_withheld),
        ),
      ) +
      sumNumbers(
        input.facts.income.miscellaneous_1099_income.map((miscellaneousIncome) =>
          toNumber(miscellaneousIncome.federal_income_tax_withheld),
        ),
      ),
  );
}

function calculateTaxableSocialSecurityBenefits(args: {
  readonly allowMarriedFilingSeparatelyLivedApartException?: boolean;
  readonly combinedIncome: number;
  readonly filingStatus: FederalFilingStatus;
  readonly socialSecurityBenefitsNetTotal: number;
}): number {
  if (args.socialSecurityBenefitsNetTotal <= 0) {
    return 0;
  }

  const halfBenefits = roundMoney(args.socialSecurityBenefitsNetTotal / 2);
  const usesMarriedFilingSeparatelyLivedApartException =
    args.filingStatus === "married_filing_separately" &&
    args.allowMarriedFilingSeparatelyLivedApartException === true;
  const baseAmount =
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
      ? 32000
      : args.filingStatus === "married_filing_separately" &&
          !usesMarriedFilingSeparatelyLivedApartException
        ? 0
        : 25000;
  const adjustedBaseAmount =
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
      ? 44000
      : args.filingStatus === "married_filing_separately" &&
          !usesMarriedFilingSeparatelyLivedApartException
        ? 0
        : 34000;
  const lowerRateCap =
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
      ? 6000
      : args.filingStatus === "married_filing_separately" &&
          !usesMarriedFilingSeparatelyLivedApartException
        ? 0
        : 4500;

  if (args.combinedIncome <= baseAmount) {
    return 0;
  }

  if (args.combinedIncome <= adjustedBaseAmount) {
    return roundMoney(Math.min(halfBenefits, (args.combinedIncome - baseAmount) / 2));
  }

  return roundMoney(
    Math.min(
      args.socialSecurityBenefitsNetTotal * 0.85,
      (args.combinedIncome - adjustedBaseAmount) * 0.85 + Math.min(halfBenefits, lowerRateCap),
    ),
  );
}

export {
  calculateTaxableSocialSecurityBenefits,
  sumAdvancePremiumTaxCredits,
  sumCapitalGainDistributions,
  sumCareExpenses,
  sumDocumentedFederalWithholding,
  sumEducationExpenses,
  sumExemptInterestDividends,
  sumQualifiedDividends,
  sumScheduleCBusinessNetProfit,
  sumTaxExemptInterest,
};
