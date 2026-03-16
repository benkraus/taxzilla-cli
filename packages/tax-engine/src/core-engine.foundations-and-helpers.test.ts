import { describe, expect, it } from "vitest";

import { sampleReturnTy2025 } from "./index";
import {
  buildEarnedIncomeByPersonId,
  buildForm1099DivPayloadPointers,
  calculateAdditionalMedicareTaxWithheld,
  calculateCapitalLossCarryforward,
  calculateCapitalLossDeduction,
  calculateEarnedIncomeCredit,
  calculateScheduleCBusinessNetProfit,
  calculateScheduleDLine18,
  calculateScheduleDLine19,
  calculateScheduleDSpecialGains,
  computeEarnedIncomeCreditForIncomeMetric,
  getCandidateEitcChildIds,
  getEducationCreditPhaseoutMultiplier,
  getFederalFilingStatus,
  getFederalPovertyLine,
  getPremiumTaxCreditRegion,
  getTotalEarnedIncome,
  getTotalMedicareTaxWithheld,
  getTotalMedicareWages,
  getTotalSocialSecurityTaxWithheld,
  getTotalSocialSecurityWages,
  isFederalFilingStatus,
  sumForm1099DivPayloadAmount,
  sumItemizedDeductionTotals,
} from "./core-engine/foundations";
import {
  allowReportedNetLossesWithoutLimitationOverrides,
  applyScheduleELimitationOverride,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  buildScheduleERollup,
  getAgeOnLastDayOfTaxYear,
  getFederalEicExtension,
  getFederalExtension,
  getFederalForm2441Extension,
  getFederalForm8812Extension,
  getFederalForm8962Extension,
  getFederalMisc1099Overrides,
  getFederalScheduleDExtension,
  getFederalScheduleELimitationOverrides,
  getFederalSocialSecurityExtension,
  getHouseholdPersonDateOfBirth,
  getHouseholdPersonId,
  getHouseholdPersonIsFullTimeStudent,
  hasScheduleELimitationOverrideData,
  matchScheduleELimitationOverride,
  normalizeTextMatch,
  parseIsoDate,
  roundMoney,
  roundRate,
  sumAdjustmentValues,
  sumNamedAmounts,
  sumNumbers,
  sumNumericLeaves,
  toNumber,
  toPositiveNumber,
  uniqueStrings,
} from "./core-engine/helpers";

function cloneReturn(): any {
  return structuredClone(sampleReturnTy2025);
}

function makeScheduleEActivity(overrides: Record<string, unknown>): any {
  return {
    activity_id: "activity",
    activity_type: "rental_real_estate",
    entity_name: "Activity LLC",
    owner_person_id: "p_taxpayer",
    materially_participates: false,
    income_items: [],
    expense_items: [],
    ...overrides,
  };
}

describe("core-engine helpers", () => {
  it("covers coercion, arithmetic, and parsing helpers", () => {
    expect(sumNumbers([1, 2, 3])).toBe(6);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundRate(0.123456)).toBe(0.1235);
    expect(toNumber(null)).toBe(0);
    expect(toPositiveNumber(-5)).toBe(0);
    expect(parseIsoDate("2025-02-01")?.toISOString()).toContain("2025-02-01");
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
    expect(asRecord({ ok: true })).toEqual({ ok: true });
    expect(asRecord([])).toBeUndefined();
    expect(asString("hi")).toBe("hi");
    expect(asString(42)).toBeNull();
    expect(asNumber(42)).toBe(42);
    expect(asNumber("42")).toBeNull();
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean("true")).toBeNull();
    expect(normalizeTextMatch("  Mixed Case  ")).toBe("mixed case");
    expect(uniqueStrings(["b", "a", "b", "c"])).toEqual(["b", "a", "c"]);
    expect(sumNumericLeaves({ a: 1, b: [2, { c: 3, d: "nope" }] })).toBe(6);
    expect(
      sumNamedAmounts([
        { description: "one", amount: 1.2 },
        { description: "two", amount: 2.3 },
      ]),
    ).toBe(3.5);
  });

  it("reads federal extension data and household helpers from the canonical input", () => {
    const input = cloneReturn();
    input.facts.state_specific_fact_bag.federal = {
      eic: {
        allow_married_filing_separately_separated_spouse_rules: true,
      },
      form2441: {
        allow_married_filing_separately_lived_apart_exception: true,
      },
      form8812: {
        line27a_eic_override: 123,
      },
      form8962: {
        allow_married_filing_separately_exception: true,
        allow_household_income_below_fpl_exception: true,
      },
      misc_1099: {
        overrides: [
          {
            source_document_id: "doc_misc_1",
            treatment: "schedule1_line8z",
          },
        ],
      },
      schedule_d: {
        prior_year_short_term_capital_loss_carryforward: 100,
      },
      schedule_e: {
        allow_reported_net_losses_without_limitation_overrides: true,
        limitation_overrides: [
          {
            activity_id: "activity_1",
            allowed_net_after_limitations: -25,
          },
        ],
      },
      social_security: {
        allow_married_filing_separately_lived_apart_exception: true,
      },
    };
    input.household.taxpayer.is_full_time_student = true;

    expect(getFederalExtension(input)).toBeDefined();
    expect(getFederalEicExtension(input)?.allow_married_filing_separately_separated_spouse_rules).toBe(true);
    expect(getFederalForm2441Extension(input)?.allow_married_filing_separately_lived_apart_exception).toBe(
      true,
    );
    expect(getFederalForm8812Extension(input)?.line27a_eic_override).toBe(123);
    expect(getFederalForm8962Extension(input)?.allow_household_income_below_fpl_exception).toBe(true);
    expect(getFederalMisc1099Overrides(input)).toHaveLength(1);
    expect(getFederalScheduleDExtension(input)?.prior_year_short_term_capital_loss_carryforward).toBe(
      100,
    );
    expect(allowReportedNetLossesWithoutLimitationOverrides(input)).toBe(true);
    expect(getFederalScheduleELimitationOverrides(input)).toHaveLength(1);
    expect(getFederalSocialSecurityExtension(input)?.allow_married_filing_separately_lived_apart_exception).toBe(
      true,
    );
    expect(getHouseholdPersonId(input.household.taxpayer)).toBe("p_taxpayer");
    expect(getHouseholdPersonDateOfBirth(input.household.taxpayer)).toBe("1990-05-14");
    expect(getHouseholdPersonIsFullTimeStudent(input.household.taxpayer)).toBe(true);
    expect(getHouseholdPersonIsFullTimeStudent({})).toBe(false);
    expect(getAgeOnLastDayOfTaxYear("2002-12-31", 2025)).toBe(23);
    expect(getAgeOnLastDayOfTaxYear("2000-01-01", 2025)).toBe(25);
    expect(getAgeOnLastDayOfTaxYear("not-a-date", 2025)).toBeNull();
    expect(getAgeOnLastDayOfTaxYear(null, 2025)).toBeNull();

    const invalidInput = cloneReturn();
    invalidInput.facts.state_specific_fact_bag.federal = "invalid";
    expect(getFederalExtension(invalidInput)).toBeUndefined();
  });

  it("matches and applies schedule E limitation overrides while rolling up activity totals", () => {
    const overrides = [
      {
        activity_id: "rental-1",
        allowed_net_after_limitations: -20,
      },
      {
        entity_name: "Royalty Co",
        passive_loss_disallowed: 10,
      },
      {
        entity_name: "Ignored",
      },
    ];
    const usedIndexes = new Set<number>();
    const rentalActivity = makeScheduleEActivity({
      activity_id: "rental-1",
      entity_name: "Rental One",
      income_items: [{ description: "rent", amount: 50 }],
      expense_items: [{ description: "expense", amount: 150 }],
    });
    const royaltyActivity = makeScheduleEActivity({
      activity_id: "royalty-1",
      activity_type: "royalty",
      entity_name: "Royalty Co",
      income_items: [{ description: "royalty", amount: 40 }],
      expense_items: [{ description: "expense", amount: 10 }],
    });

    expect(hasScheduleELimitationOverrideData(overrides[0] as any)).toBe(true);
    expect(hasScheduleELimitationOverrideData(overrides[2] as any)).toBe(false);
    expect(matchScheduleELimitationOverride(rentalActivity, overrides as any, usedIndexes)).toMatchObject(
      {
        activity_id: "rental-1",
      },
    );
    expect(matchScheduleELimitationOverride(royaltyActivity, overrides as any, usedIndexes)).toMatchObject(
      {
        entity_name: "Royalty Co",
      },
    );
    expect(
      applyScheduleELimitationOverride(-100, {
        allowed_net_after_limitations: -25,
      } as any),
    ).toBe(-25);
    expect(
      applyScheduleELimitationOverride(-100, {
        passive_loss_disallowed: 40,
        at_risk_loss_disallowed: 10,
        basis_loss_disallowed: 5,
        prior_year_passive_loss_carryforward_used: 15,
      } as any),
    ).toBe(-60);
    expect(applyScheduleELimitationOverride(25, undefined)).toBe(25);

    const rollup = buildScheduleERollup(
      [
        rentalActivity,
        royaltyActivity,
        makeScheduleEActivity({
          activity_id: "k1-1",
          activity_type: "partnership_k1",
          entity_name: "Partnership K-1",
          income_items: [{ description: "k1", amount: 100 }],
          expense_items: [{ description: "expense", amount: 60 }],
          materially_participates: false,
        }),
        makeScheduleEActivity({
          activity_id: "other-1",
          activity_type: "other",
          entity_name: "Other Activity",
          income_items: [{ description: "income", amount: 25 }],
          expense_items: [],
          materially_participates: true,
        }),
        makeScheduleEActivity({
          activity_id: "loss-1",
          activity_type: "farm_rental",
          entity_name: "Loss Farm",
          income_items: [{ description: "income", amount: 10 }],
          expense_items: [{ description: "expense", amount: 40 }],
          materially_participates: false,
        }),
      ] as any,
      {
        additionalIncomeByActivityIndex: new Map([[1, 5]]),
        limitationOverrides: overrides as any,
      },
    );

    expect(rollup.activityNets.map((activity) => activity.netAmount)).toEqual([-20, 45, 40, 25, -30]);
    expect(rollup.activityNetInvestmentIncomeTotal).toBe(35);
    expect(rollup.limitationOverrideCount).toBe(2);
    expect(rollup.negativeActivityCount).toBe(1);
    expect(rollup.part1NetTotal).toBe(-5);
    expect(rollup.part2NetTotal).toBe(40);
    expect(rollup.totalNetTotal).toBe(60);
    expect(rollup.unclassifiedActivityCount).toBe(1);
  });

  it("sums adjustment values with include and exclude filters", () => {
    const adjustments = {
      educator_expenses: 250,
      student_loan_interest: 500,
      other_adjustments: [
        { description: "attorney", amount: 100 },
        { description: "reforestation", amount: 50 },
      ],
      nested: {
        amount: 25,
      },
    };

    expect(sumAdjustmentValues(adjustments as any)).toBe(925);
    expect(
      sumAdjustmentValues(adjustments as any, {
        includedKeys: new Set(["educator_expenses", "other_adjustments"]),
      }),
    ).toBe(400);
    expect(
      sumAdjustmentValues(adjustments as any, {
        excludedKeys: new Set(["student_loan_interest", "nested"]),
      }),
    ).toBe(400);
  });
});

describe("core-engine foundations", () => {
  it("covers dividend payload helpers and schedule D calculations", () => {
    const sourceDocuments = [
      {
        document_type: "FORM_1099_DIV",
        payload: {
          collectibles_28_percent_gain: 125,
          section_1202_gain: 30,
          unrecaptured_section_1250_gain: 20,
        },
      },
      {
        document_type: "FORM_W2",
        payload: {
          wages: 1,
        },
      },
    ];

    expect(sumForm1099DivPayloadAmount(sourceDocuments as any, "collectibles_28_percent_gain")).toBe(
      125,
    );
    expect(buildForm1099DivPayloadPointers(sourceDocuments as any, "section_1202_gain")).toEqual([
      "/source_documents/0/payload/section_1202_gain",
    ]);
    expect(calculateScheduleDSpecialGains(sourceDocuments as any)).toEqual({
      collectibles28PercentGainTotal: 125,
      section1202GainTotal: 30,
      unrecapturedSection1250GainTotal: 20,
    });
    expect(
      calculateCapitalLossDeduction({
        filingStatus: "single",
        scheduleDNetCapitalGainOrLossTotal: 500,
      }),
    ).toEqual({
      deductibleCapitalGainOrLoss: 500,
      deductionLimit: 3000,
    });
    expect(
      calculateCapitalLossDeduction({
        filingStatus: "married_filing_separately",
        scheduleDNetCapitalGainOrLossTotal: -5000,
      }),
    ).toEqual({
      deductibleCapitalGainOrLoss: -1500,
      deductionLimit: 1500,
    });
    expect(
      calculateCapitalLossCarryforward({
        rawTaxableIncome: 4000,
        scheduleDLine15LongTermNet: -2000,
        scheduleDLine21LossDeduction: 3000,
        scheduleDLine7ShortTermNet: -5000,
      }),
    ).toEqual({
      longTermCarryforward: 2000,
      shortTermCarryforward: 2000,
      totalCarryforward: 4000,
    });
    expect(
      calculateCapitalLossCarryforward({
        rawTaxableIncome: 4000,
        scheduleDLine15LongTermNet: 100,
        scheduleDLine21LossDeduction: 0,
        scheduleDLine7ShortTermNet: -100,
      }),
    ).toEqual({
      longTermCarryforward: 0,
      shortTermCarryforward: 0,
      totalCarryforward: 0,
    });
    expect(
      calculateScheduleDLine18({
        reportedCollectibles28PercentGainTotal: 60,
        reportedTaxableSection1202GainTotal: 20,
        scheduleDShortTermCapitalGainOrLossTotal: -50,
      }),
    ).toBe(30);
    expect(
      calculateScheduleDLine19({
        reportedTwentyEightRateGainTotal: 60,
        reportedUnrecapturedSection1250GainTotal: 55,
        scheduleDShortTermCapitalGainOrLossTotal: -20,
      }),
    ).toBe(55);
  });

  it("computes business profit, itemized deductions, earned income, and payroll totals", () => {
    const business = {
      business_id: "biz_1",
      gross_receipts_or_sales: 1000,
      returns_and_allowances: 50,
      cost_of_goods_sold: 100,
      other_business_income: 20,
      home_office_deduction: 30,
      expenses: [{ description: "supplies", amount: 200 }],
    };
    const input = cloneReturn();
    input.household.filing_status = "head_of_household";
    input.facts.income.wages = [
      {
        person_id: "p_taxpayer",
        wages_tips_other_compensation: 10000,
        social_security_wages: 9000,
        social_security_tax_withheld: 558,
        medicare_wages_and_tips: 9000,
        medicare_tax_withheld: 145.5,
      },
      {
        wages_tips_other_compensation: 5000,
        social_security_tax_withheld: 310,
        medicare_tax_withheld: 72.5,
      },
    ];
    input.facts.income.schedule_c_businesses = [
      {
        ...business,
        owner_person_id: "p_taxpayer",
      },
      {
        ...business,
        business_id: "biz_2",
        owner_person_id: undefined,
      },
    ];
    input.facts.credits.candidate_eitc_child_ids = ["child_1", "child_1", "child_2"];

    expect(calculateScheduleCBusinessNetProfit(business as any, new Map([["biz_1", 80]]))).toBe(720);
    expect(
      calculateScheduleCBusinessNetProfit(
        {
          ...business,
          business_id: null,
        } as any,
        new Map([["biz_1", 80]]),
      ),
    ).toBe(640);
    expect(
      sumItemizedDeductionTotals({
        medical_and_dental_expenses: 100,
        state_and_local_income_or_sales_taxes: 200,
        real_estate_taxes: 300,
        personal_property_taxes: 25,
        other_taxes: 10,
        mortgage_interest_items: [
          {
            mortgage_interest_received: 400,
            points_paid: 50,
            mortgage_insurance_premiums: 25,
            real_estate_taxes_paid: 75,
          },
        ],
        charitable_cash_contributions: 40,
        charitable_noncash_contributions: 35,
        casualty_and_theft_losses: 15,
        other_itemized_deductions: [{ description: "misc", amount: 20 }],
      } as any),
    ).toBe(1295);
    expect(isFederalFilingStatus("single")).toBe(true);
    expect(isFederalFilingStatus("bogus")).toBe(false);
    expect(getFederalFilingStatus(input)).toBe("head_of_household");
    input.household.filing_status = "bogus";
    expect(getFederalFilingStatus(input)).toBe("single");
    expect(buildEarnedIncomeByPersonId(input as any, new Map([["biz_1", 80]])).get("p_taxpayer")).toBe(
      10720,
    );
    expect(getTotalEarnedIncome(input as any, new Map([["biz_1", 80], ["biz_2", 10]]) )).toBe(16370);
    expect(getCandidateEitcChildIds(input as any)).toEqual(["child_1", "child_2"]);
    expect(
      getCandidateEitcChildIds({
        facts: {
          credits: {},
        },
      } as any),
    ).toEqual([]);
    expect(getTotalSocialSecurityTaxWithheld(input as any)).toBe(868);
    expect(getTotalMedicareTaxWithheld(input as any)).toBe(218);
    expect(getTotalSocialSecurityWages(input as any)).toBe(14000);
    expect(getTotalMedicareWages(input as any)).toBe(14000);
    expect(calculateAdditionalMedicareTaxWithheld(input.facts.income.wages as any)).toBe(15);
  });

  it("covers earned income credit, poverty line, and education phaseout helpers", () => {
    expect(
      computeEarnedIncomeCreditForIncomeMetric(0, "single", {
        earnedIncomeAmount: 10000,
        maxCredit: 3000,
        phaseInRate: 0.3,
        phaseoutRate: 0.2,
        phaseoutThresholdMarriedJoint: 20000,
        phaseoutThresholdOther: 15000,
      }),
    ).toBe(0);
    expect(
      computeEarnedIncomeCreditForIncomeMetric(5000, "single", {
        earnedIncomeAmount: 10000,
        maxCredit: 3000,
        phaseInRate: 0.3,
        phaseoutRate: 0.2,
        phaseoutThresholdMarriedJoint: 20000,
        phaseoutThresholdOther: 15000,
      }),
    ).toBe(1500);
    expect(
      computeEarnedIncomeCreditForIncomeMetric(18000, "single", {
        earnedIncomeAmount: 10000,
        maxCredit: 3000,
        phaseInRate: 0.3,
        phaseoutRate: 0.2,
        phaseoutThresholdMarriedJoint: 20000,
        phaseoutThresholdOther: 15000,
      }),
    ).toBe(2400);
    expect(
      computeEarnedIncomeCreditForIncomeMetric(18000, "married_filing_jointly", {
        earnedIncomeAmount: 10000,
        maxCredit: 3000,
        phaseInRate: 0.3,
        phaseoutRate: 0.2,
        phaseoutThresholdMarriedJoint: 20000,
        phaseoutThresholdOther: 15000,
      }),
    ).toBe(3000);

    const baseInput = {
      household: {
        can_be_claimed_as_dependent: false,
        filing_status: "married_filing_separately",
      },
      residency_and_nexus: {
        primary_home_address: {
          state_code: "HI",
        },
      },
      facts: {
        credits: {
          candidate_eitc_child_ids: ["c1", "c2", "c3", "c4"],
        },
        state_specific_fact_bag: {
          federal: {
            eic: {
              allow_married_filing_separately_separated_spouse_rules: true,
            },
          },
        },
      },
    };

    expect(
      calculateEarnedIncomeCredit({
        adjustedGrossIncome: 22000,
        capitalGainOrLossTotal: 0,
        filingStatus: "married_filing_separately",
        input: baseInput as any,
        ordinaryDividendsTotal: 0,
        taxExemptInterestTotal: 0,
        taxableInterestTotal: 0,
        totalEarnedIncome: 21000,
      }),
    ).toEqual({
      amount: 8046,
      qualifyingChildrenCount: 3,
    });

    const overrideInput = {
      ...baseInput,
      facts: {
        ...baseInput.facts,
        state_specific_fact_bag: {
          federal: {
            form8812: {
              line27a_eic_override: 777,
            },
          },
        },
      },
    };
    expect(
      calculateEarnedIncomeCredit({
        adjustedGrossIncome: 22000,
        capitalGainOrLossTotal: 0,
        filingStatus: "single",
        input: overrideInput as any,
        ordinaryDividendsTotal: 0,
        taxExemptInterestTotal: 0,
        taxableInterestTotal: 0,
        totalEarnedIncome: 21000,
      }).amount,
    ).toBe(777);

    expect(
      calculateEarnedIncomeCredit({
        adjustedGrossIncome: 22000,
        capitalGainOrLossTotal: 0,
        filingStatus: "single",
        input: {
          ...baseInput,
          household: {
            ...baseInput.household,
            can_be_claimed_as_dependent: true,
          },
        } as any,
        ordinaryDividendsTotal: 0,
        taxExemptInterestTotal: 0,
        taxableInterestTotal: 0,
        totalEarnedIncome: 21000,
      }).amount,
    ).toBe(0);

    expect(
      calculateEarnedIncomeCredit({
        adjustedGrossIncome: 22000,
        capitalGainOrLossTotal: 5000,
        filingStatus: "single",
        input: {
          ...baseInput,
          household: {
            ...baseInput.household,
            filing_status: "single",
          },
          facts: {
            ...baseInput.facts,
            credits: {
              candidate_eitc_child_ids: ["c1"],
            },
            state_specific_fact_bag: {},
          },
        } as any,
        ordinaryDividendsTotal: 7000,
        taxExemptInterestTotal: 0,
        taxableInterestTotal: 1000,
        totalEarnedIncome: 21000,
      }).amount,
    ).toBe(0);

    expect(getPremiumTaxCreditRegion(baseInput as any)).toBe("hawaii");
    expect(
      getPremiumTaxCreditRegion({
        residency_and_nexus: {
          primary_home_address: {
            state_code: "AK",
          },
        },
      } as any),
    ).toBe("alaska");
    expect(getPremiumTaxCreditRegion({ residency_and_nexus: {} } as any)).toBe("contiguous");
    expect(getFederalPovertyLine("contiguous", 0)).toBeGreaterThan(0);
    expect(getEducationCreditPhaseoutMultiplier(50000, "married_filing_separately")).toBe(0);
    expect(getEducationCreditPhaseoutMultiplier(50000, "single")).toBe(1);
    expect(getEducationCreditPhaseoutMultiplier(100000, "single")).toBe(0);
    expect(getEducationCreditPhaseoutMultiplier(85000, "single")).toBe(0.5);
  });
});
