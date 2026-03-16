import { describe, expect, it } from "vitest";

import {
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
} from "./federal-calculations";
import {
  computePreferentialRateTax,
  computeRegularIncomeTax,
  computeScheduleDTaxWorksheetTax,
} from "./income-tax";

describe("core-engine federal calculations", () => {
  it("covers schedule SE and surtax computations", () => {
    expect(
      calculateScheduleSE({
        filingStatus: "single",
        input: {
          facts: {
            income: {
              wages: [],
            },
          },
        } as any,
        scheduleCBusinessNetProfit: 0,
      }),
    ).toEqual({
      medicareTaxPortion: 0,
      netEarnings: 0,
      selfEmploymentTax: 0,
      selfEmploymentTaxDeduction: 0,
      socialSecurityTaxPortion: 0,
    });
    expect(
      calculateScheduleSE({
        filingStatus: "single",
        input: {
          facts: {
            income: {
              wages: [],
            },
          },
        } as any,
        scheduleCBusinessNetProfit: 300,
      }),
    ).toEqual({
      medicareTaxPortion: 0,
      netEarnings: 277.05,
      selfEmploymentTax: 0,
      selfEmploymentTaxDeduction: 0,
      socialSecurityTaxPortion: 0,
    });

    const scheduleSE = calculateScheduleSE({
      filingStatus: "single",
      input: {
        facts: {
          income: {
            wages: [
              {
                social_security_wages: 160000,
              },
            ],
          },
        },
      } as any,
      scheduleCBusinessNetProfit: 50000,
    });

    expect(scheduleSE.netEarnings).toBe(46175);
    expect(scheduleSE.socialSecurityTaxPortion).toBeGreaterThan(0);
    expect(scheduleSE.medicareTaxPortion).toBe(1339.08);
    expect(scheduleSE.selfEmploymentTaxDeduction).toBe(round(scheduleSE.selfEmploymentTax / 2));

    expect(
      calculateForm8959({
        filingStatus: "single",
        input: {
          facts: {
            income: {
              wages: [
                {
                  medicare_wages_and_tips: 250000,
                  medicare_tax_withheld: 4000,
                },
              ],
            },
          },
        } as any,
        selfEmploymentNetEarnings: 10000,
      }),
    ).toEqual({
      additionalMedicareTax: 540,
      additionalMedicareTaxWithheld: 375,
    });

    expect(
      calculateForm8960({
        adjustedGrossIncome: 300000,
        scheduleDNetCapitalGainOrLossTotal: 10000,
        scheduleEInvestmentIncomeTotal: 5000,
        filingStatus: "single",
        ordinaryDividendsTotal: 2000,
        taxableInterestTotal: 1000,
      }),
    ).toEqual({
      netInvestmentIncome: 18000,
      netInvestmentIncomeTax: 684,
    });
  });

  it("covers premium tax credit thresholds and direct rate helpers", () => {
    expect(getPremiumTaxCreditApplicableFigure(150)).toBe(0);
    expect(getPremiumTaxCreditApplicableFigure(175)).toBe(0.01);
    expect(getPremiumTaxCreditApplicableFigure(225)).toBe(0.03);
    expect(getPremiumTaxCreditApplicableFigure(275)).toBe(0.05);
    expect(getPremiumTaxCreditApplicableFigure(325)).toBe(0.0663);
    expect(getPremiumTaxCreditApplicableFigure(375)).toBe(0.0788);
    expect(getPremiumTaxCreditApplicableFigure(450)).toBe(0.085);

    expect(getPremiumTaxCreditRepaymentCap("single", null)).toBeNull();
    expect(getPremiumTaxCreditRepaymentCap("single", 450)).toBeNull();
    expect(getPremiumTaxCreditRepaymentCap("single", 150)).toBe(500);
    expect(getPremiumTaxCreditRepaymentCap("married_filing_jointly", 150)).toBe(1000);

    expect(getForm2441CreditRate(10000)).toBe(0.35);
    expect(getForm2441CreditRate(25000)).toBe(0.3);
    expect(getForm2441CreditRate(100000)).toBe(0.2);
  });

  it("covers form 2441, 8812, 8863, and 8962 branches", () => {
    expect(
      calculateForm2441Credit({
        adjustedGrossIncome: 50000,
        earnedIncomeByPersonId: new Map(),
        filingStatus: "single",
        input: {
          household: {
            taxpayer: {
              person_id: "p_taxpayer",
            },
            spouse: null,
          },
          facts: {
            credits: {
              child_and_dependent_care: {
                qualifying_person_ids: [],
                expenses: [],
              },
            },
            state_specific_fact_bag: {},
          },
        } as any,
        totalEarnedIncome: 20000,
      }),
    ).toEqual({
      creditRate: 0.2,
      nonrefundableCredit: 0,
      qualifiedExpenses: 0,
      qualifyingPersonCount: 0,
    });

    expect(
      calculateForm2441Credit({
        adjustedGrossIncome: 30000,
        earnedIncomeByPersonId: new Map([
          ["p_taxpayer", 30000],
          ["p_spouse", 10000],
        ]),
        filingStatus: "married_filing_jointly",
        input: {
          household: {
            taxpayer: {
              person_id: "p_taxpayer",
            },
            spouse: {
              person_id: "p_spouse",
            },
          },
          facts: {
            credits: {
              child_and_dependent_care: {
                qualifying_person_ids: ["child_1"],
                expenses: [
                  {
                    person_id: "child_1",
                    amount: 5000,
                  },
                ],
              },
            },
            state_specific_fact_bag: {},
          },
        } as any,
        totalEarnedIncome: 30000,
      }),
    ).toEqual({
      creditRate: 0.27,
      nonrefundableCredit: 810,
      qualifiedExpenses: 5000,
      qualifyingPersonCount: 1,
    });

    expect(
      calculateForm2441Credit({
        adjustedGrossIncome: 30000,
        earnedIncomeByPersonId: new Map([["p_taxpayer", 30000]]),
        filingStatus: "married_filing_separately",
        input: {
          household: {
            taxpayer: {
              person_id: "p_taxpayer",
            },
            spouse: null,
          },
          facts: {
            credits: {
              child_and_dependent_care: {
                qualifying_person_ids: ["child_1"],
                expenses: [
                  {
                    person_id: "child_1",
                    amount: 3000,
                  },
                ],
              },
            },
            state_specific_fact_bag: {
              federal: {
                form2441: {
                  allow_married_filing_separately_lived_apart_exception: true,
                },
              },
            },
          },
        } as any,
        totalEarnedIncome: 30000,
      }).nonrefundableCredit,
    ).toBe(810);

    expect(
      calculateForm2441Credit({
        adjustedGrossIncome: 30000,
        earnedIncomeByPersonId: new Map([["p_spouse", 15000]]),
        filingStatus: "single",
        input: {
          household: {
            taxpayer: {},
            spouse: null,
          },
          facts: {
            credits: {
              child_and_dependent_care: {
                qualifying_person_ids: ["child_1", "child_2"],
                expenses: [
                  {
                    person_id: "child_1",
                    amount: 4000,
                  },
                  {
                    person_id: "child_2",
                    amount: 4000,
                  },
                ],
              },
            },
            state_specific_fact_bag: {},
          },
        } as any,
        totalEarnedIncome: 12000,
      }).nonrefundableCredit,
    ).toBe(1620);

    expect(
      calculateForm8812Credit({
        additionalMedicareTax: 0,
        adjustedGrossIncome: 50000,
        filingStatus: "single",
        input: {
          household: {
            can_be_claimed_as_dependent: true,
          },
          facts: {
            credits: {
              candidate_child_tax_credit_dependent_ids: ["child_1"],
              candidate_credit_for_other_dependent_ids: ["other_1"],
            },
            state_specific_fact_bag: {},
          },
        } as any,
        line16RegularIncomeTax: 500,
        line27aEarnedIncomeCredit: 0,
        medicareTaxWithheldTotal: 0,
        selfEmploymentTaxDeduction: 0,
        socialSecurityTaxWithheldTotal: 0,
        totalEarnedIncome: 20000,
      }).additionalChildTaxCredit,
    ).toBe(0);

    const form8812 = calculateForm8812Credit({
      additionalMedicareTax: 200,
      adjustedGrossIncome: 45000,
      filingStatus: "single",
      input: {
        household: {
          can_be_claimed_as_dependent: false,
        },
        facts: {
          credits: {
            candidate_child_tax_credit_dependent_ids: ["child_1", "child_2", "child_3"],
            candidate_credit_for_other_dependent_ids: ["child_1", "child_2", "child_3", "other_1"],
          },
          state_specific_fact_bag: {
            federal: {
              form8812: {
                credit_limit_worksheet_b_line10_schedule3_line11: 50,
              },
            },
          },
        },
      } as any,
      line16RegularIncomeTax: 1000,
      line27aEarnedIncomeCredit: 100,
      medicareTaxWithheldTotal: 3000,
      selfEmploymentTaxDeduction: 400,
      socialSecurityTaxWithheldTotal: 5000,
      totalEarnedIncome: 50000,
    });

    expect(form8812.qualifyingChildrenCount).toBe(3);
    expect(form8812.otherDependentsCount).toBe(1);
    expect(form8812.additionalChildTaxCredit).toBeGreaterThan(0);
    expect(form8812.alternativeMethodConsidered).toBe(true);

    expect(
      calculateForm8863Credit({
        adjustedGrossIncome: 50000,
        filingStatus: "married_filing_separately",
        input: {
          household: {
            can_be_claimed_as_dependent: false,
          },
          facts: {
            credits: {
              education_credits: {
                students: [
                  {
                    qualified_expenses_paid: 4000,
                    tax_free_assistance: 0,
                    is_aotc_candidate: true,
                  },
                ],
              },
            },
          },
        } as any,
      }),
    ).toEqual({
      netQualifiedExpenses: 4000,
      nonrefundableCredit: 0,
      refundableCredit: 0,
    });

    expect(
      calculateForm8863Credit({
        adjustedGrossIncome: 85000,
        filingStatus: "single",
        input: {
          household: {
            can_be_claimed_as_dependent: false,
          },
          facts: {
            credits: {
              education_credits: {
                students: [
                  {
                    qualified_expenses_paid: 4000,
                    tax_free_assistance: 0,
                    is_aotc_candidate: true,
                    is_llc_candidate: true,
                  },
                  {
                    qualified_expenses_paid: 6000,
                    tax_free_assistance: 1000,
                    is_aotc_candidate: false,
                    is_llc_candidate: true,
                  },
                ],
              },
            },
          },
        } as any,
      }),
    ).toEqual({
      netQualifiedExpenses: 9000,
      nonrefundableCredit: 1250,
      refundableCredit: 500,
    });

    expect(
      calculateForm8962Credit({
        adjustedGrossIncome: 50000,
        filingStatus: "single",
        input: {
          household: {
            spouse: null,
            dependents: [],
          },
          residency_and_nexus: {
            primary_home_address: {
              state_code: "CA",
            },
          },
          facts: {
            credits: {
              premium_tax_credit: {
                policies: [],
              },
            },
            state_specific_fact_bag: {},
          },
        } as any,
      }),
    ).toEqual({
      advancePremiumTaxCreditTotal: 0,
      excessAdvancePremiumTaxCreditRepayment: 0,
      householdIncomePercentage: null,
      netPremiumTaxCredit: 0,
    });

    expect(
      calculateForm8962Credit({
        adjustedGrossIncome: 50000,
        filingStatus: "married_filing_separately",
        input: {
          household: {
            spouse: {},
            dependents: [],
          },
          residency_and_nexus: {
            primary_home_address: {
              state_code: "CA",
            },
          },
          facts: {
            credits: {
              premium_tax_credit: {
                policies: [
                  {
                    monthly_rows: [
                      {
                        advance_payment_of_premium_tax_credit: 100,
                        enrollment_premium: 200,
                        second_lowest_cost_silver_plan_premium: 190,
                      },
                    ],
                  },
                ],
              },
            },
            state_specific_fact_bag: {},
          },
        } as any,
      }).excessAdvancePremiumTaxCreditRepayment,
    ).toBe(100);

    const lowIncomeDefault = calculateForm8962Credit({
      adjustedGrossIncome: 10000,
      filingStatus: "single",
      input: {
        household: {
          spouse: null,
          dependents: [],
        },
        residency_and_nexus: {
          primary_home_address: {
            state_code: "CA",
          },
        },
        facts: {
          credits: {
            premium_tax_credit: {
              policies: [
                {
                  monthly_rows: [
                    {
                      advance_payment_of_premium_tax_credit: 50,
                      enrollment_premium: 200,
                      second_lowest_cost_silver_plan_premium: 190,
                    },
                  ],
                },
              ],
            },
          },
          state_specific_fact_bag: {},
        },
      } as any,
    });
    expect(lowIncomeDefault.netPremiumTaxCredit).toBe(0);
    expect(lowIncomeDefault.householdIncomePercentage).toBeLessThan(100);

    const lowIncomeException = calculateForm8962Credit({
      adjustedGrossIncome: 10000,
      filingStatus: "single",
      input: {
        household: {
          spouse: null,
          dependents: [],
        },
        residency_and_nexus: {
          primary_home_address: {
            state_code: "CA",
          },
        },
        facts: {
          credits: {
            premium_tax_credit: {
              policies: [
                {
                  monthly_rows: [
                    {
                      advance_payment_of_premium_tax_credit: 50,
                      enrollment_premium: 200,
                      second_lowest_cost_silver_plan_premium: 190,
                    },
                  ],
                },
              ],
            },
          },
          state_specific_fact_bag: {
            federal: {
              form8962: {
                allow_household_income_below_fpl_exception: true,
              },
            },
          },
        },
      } as any,
    });

    expect(lowIncomeException.netPremiumTaxCredit).toBeGreaterThan(0);
    expect(lowIncomeException.householdIncomePercentage).toBeLessThan(100);
  });
});

describe("core-engine income tax worksheets", () => {
  it("covers ordinary and preferential tax computation branches", () => {
    expect(computeRegularIncomeTax(10000, "single")).toBe(1000);
    expect(
      computePreferentialRateTax({
        filingStatus: "single",
        qualifiedDividendsTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        taxableIncome: 0,
      }),
    ).toEqual({
      method: "ordinary_brackets",
      tax: 0,
      usesWorksheet: false,
    });
    expect(
      computePreferentialRateTax({
        filingStatus: "single",
        qualifiedDividendsTotal: 10000,
        scheduleDNetCapitalGainOrLossTotal: 5000,
        taxableIncome: 50000,
      }),
    ).toEqual({
      method: "qualified_dividends_and_capital_gain_worksheet",
      tax: 4209,
      usesWorksheet: true,
    });
    expect(
      computeScheduleDTaxWorksheetTax({
        filingStatus: "single",
        qualifiedDividendsTotal: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDLongTermCapitalGainOrLossTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        taxableIncome: 0,
      }),
    ).toEqual({
      method: "ordinary_brackets",
      tax: 0,
      usesWorksheet: false,
    });

    const worksheetTax = computeScheduleDTaxWorksheetTax({
      filingStatus: "single",
      qualifiedDividendsTotal: 10000,
      scheduleDCollectibles28PercentGainTotal: 2000,
      scheduleDLongTermCapitalGainOrLossTotal: 15000,
      scheduleDNetCapitalGainOrLossTotal: 15000,
      scheduleDUnrecapturedSection1250GainTotal: 1000,
      taxableIncome: 70000,
    });

    expect(worksheetTax.method).toBe("schedule_d_tax_worksheet");
    expect(worksheetTax.usesWorksheet).toBe(true);
    expect(worksheetTax.tax).toBeGreaterThan(0);
  });
});

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
