import { describe, expect, it } from "vitest";

import {
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
} from "./income-amounts";

describe("core-engine income amounts", () => {
  it("sums childcare, education, premium tax credit, and schedule C inputs", () => {
    expect(
      sumCareExpenses([
        { amount: 200 },
        { amount: 150.55 },
      ] as any),
    ).toBe(350.55);
    expect(
      sumEducationExpenses([
        {
          qualified_expenses_paid: 1000,
          tax_free_assistance: 200,
        },
        {
          qualified_expenses_paid: 100,
          tax_free_assistance: 250,
        },
      ] as any),
    ).toBe(800);
    expect(
      sumAdvancePremiumTaxCredits([
        {
          monthly_rows: [
            { advance_payment_of_premium_tax_credit: 10 },
            { advance_payment_of_premium_tax_credit: 20.5 },
          ],
        },
        {
          monthly_rows: [{ advance_payment_of_premium_tax_credit: 5 }],
        },
      ] as any),
    ).toBe(35.5);
    expect(
      sumScheduleCBusinessNetProfit(
        [
          {
            business_id: "biz_1",
            gross_receipts_or_sales: 500,
            returns_and_allowances: 25,
            cost_of_goods_sold: 50,
            other_business_income: 5,
            home_office_deduction: 10,
            expenses: [{ amount: 100 }],
          },
        ] as any,
        new Map([["biz_1", 30]]),
      ),
    ).toBe(350);
  });

  it("sums documented withholding and dividend or interest totals", () => {
    const input = {
      facts: {
        income: {
          wages: [{ federal_income_tax_withheld: 100 }],
          taxable_interest: [{ federal_income_tax_withheld: 5, tax_exempt_interest: 15 }],
          dividends: [
            {
              federal_income_tax_withheld: 7,
              qualified_dividends: 20,
              exempt_interest_dividends: 8,
              capital_gain_distributions: 12,
            },
          ],
          retirement_distributions: [{ federal_income_tax_withheld: 9 }],
          unemployment_compensation: [{ federal_income_tax_withheld: 11 }],
          nonemployee_compensation: [{ federal_income_tax_withheld: 13 }],
          miscellaneous_1099_income: [{ federal_income_tax_withheld: 17 }],
        },
      },
    };

    expect(sumDocumentedFederalWithholding(input as any)).toBe(162);
    expect(sumQualifiedDividends(input.facts.income.dividends as any)).toBe(20);
    expect(sumTaxExemptInterest(input.facts.income.taxable_interest as any)).toBe(15);
    expect(sumExemptInterestDividends(input.facts.income.dividends as any)).toBe(8);
    expect(sumCapitalGainDistributions(input.facts.income.dividends as any)).toBe(12);
  });

  it("computes taxable social security benefits across filing status branches", () => {
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 0,
        filingStatus: "single",
        socialSecurityBenefitsNetTotal: 0,
      }),
    ).toBe(0);
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 24000,
        filingStatus: "single",
        socialSecurityBenefitsNetTotal: 10000,
      }),
    ).toBe(0);
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 30000,
        filingStatus: "single",
        socialSecurityBenefitsNetTotal: 10000,
      }),
    ).toBe(2500);
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 50000,
        filingStatus: "single",
        socialSecurityBenefitsNetTotal: 10000,
      }),
    ).toBe(8500);
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 1000,
        filingStatus: "married_filing_separately",
        socialSecurityBenefitsNetTotal: 10000,
      }),
    ).toBe(850);
    expect(
      calculateTaxableSocialSecurityBenefits({
        allowMarriedFilingSeparatelyLivedApartException: true,
        combinedIncome: 26000,
        filingStatus: "married_filing_separately",
        socialSecurityBenefitsNetTotal: 10000,
      }),
    ).toBe(500);
    expect(
      calculateTaxableSocialSecurityBenefits({
        combinedIncome: 38000,
        filingStatus: "married_filing_jointly",
        socialSecurityBenefitsNetTotal: 12000,
      }),
    ).toBe(3000);
  });
});
