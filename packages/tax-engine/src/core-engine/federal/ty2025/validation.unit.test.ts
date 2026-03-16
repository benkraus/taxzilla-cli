import { describe, expect, it } from "vitest";

import { buildValidationResults } from "./validation";

function getValidation(validations: ReturnType<typeof buildValidationResults>, ruleId: string) {
  const validation = validations.find((candidate) => candidate.rule_id === ruleId);
  expect(validation, `missing validation ${ruleId}`).toBeDefined();
  return validation!;
}

function makeBaseInput(): any {
  return {
    tax_year: 2025,
    household: {
      filing_status: "married_filing_separately",
      taxpayer: {
        person_id: "p_taxpayer",
        date_of_birth: "2007-06-01",
        is_full_time_student: true,
      },
      spouse: {
        person_id: "p_spouse",
        date_of_birth: "2006-07-01",
        is_full_time_student: true,
      },
      can_be_claimed_as_dependent: false,
    },
    source_documents: [],
    elections: {
      capital_loss_carryforward_imported: true,
    },
    facts: {
      income: {
        capital_transactions: [
          {
            source_document_id: "doc_txn_1",
            proceeds: 100,
          },
        ],
      },
      credits: {
        education_credits: {
          students: [
            {
              is_aotc_candidate: true,
              is_llc_candidate: true,
            },
          ],
        },
      },
      state_specific_fact_bag: {
        federal: {},
      },
    },
  };
}

function makeActivations(): any {
  return {
    scheduleBActivated: true,
    scheduleDActivated: true,
    scheduleEActivated: true,
    scheduleSEActivated: true,
    schedule1Activated: true,
    schedule2Activated: true,
    form2441Activated: true,
    form8812Activated: true,
    form8863Activated: true,
    form8959Activated: true,
    form8960Activated: true,
    form8962Activated: true,
  };
}

describe("buildValidationResults", () => {
  it("emits overridden and fully computed validations when extension facts are present", () => {
    const input = makeBaseInput();
    input.facts.state_specific_fact_bag.federal = {
      eic: {
        allow_married_filing_separately_separated_spouse_rules: true,
      },
      form2441: {
        allow_married_filing_separately_lived_apart_exception: true,
      },
      form8812: {
        line27a_eic_override: 321,
      },
      form8962: {
        allow_married_filing_separately_exception: true,
        allow_household_income_below_fpl_exception: true,
      },
      schedule_d: {
        prior_year_short_term_capital_loss_carryforward: 200,
        prior_year_long_term_capital_loss_carryforward: 300,
        section1202_exclusion_amount: 40,
      },
      social_security: {
        allow_married_filing_separately_lived_apart_exception: true,
      },
    };

    const validations = buildValidationResults({
      activations: makeActivations(),
      hasIdentityFacts: true,
      activeStateReturns: [
        {
          state_code: "CA",
        },
      ] as any,
      computation: {
        deductionStrategy: "itemized",
        line4aIraDistributions: 1000,
        line4bTaxableIraDistributions: 500,
        line5aPensionsAndAnnuities: 2000,
        line5bTaxablePensionsAndAnnuities: 1500,
        retirementTaxableAmountAssumptionCount: 1,
        unemploymentCompensationTotal: 300,
        linkedNonemployeeCompensationToScheduleCTotal: 500,
        scheduleCBusinessNetProfit: 700,
        selfEmploymentTax: 100,
        nonemployeeCompensationAutoLinkedCount: 1,
        line8jNonbusinessActivityIncomeTotal: 50,
        nonemployeeCompensationInvalidLinkedBusinessCount: 1,
        line8bGamblingIncomeTotal: 25,
        line8zOtherIncomeTotal: 35,
        misc1099ScheduleEMappedCount: 1,
        misc1099ScheduleEReviewCount: 1,
        misc1099ScheduleEReviewCategories: ["rents"],
        misc1099UnsupportedIncomeCategories: ["medical_payments"],
        scheduleEActivityNetTotal: 120,
        scheduleELimitationOverrideCount: 1,
        scheduleENegativeActivityCount: 1,
        scheduleEUnclassifiedActivityCount: 1,
        usesDocumentedFederalWithholdingFallback: true,
        line6aSocialSecurityBenefits: 9000,
        form8812QualifyingChildrenCount: 3,
        form8812AlternativeActcMethodUsed: true,
        line27aEarnedIncomeCredit: 8046,
        educationCreditRefundable: 500,
        scheduleDCollectibles28PercentGainTotal: 200,
        scheduleDUnrecapturedSection1250GainTotal: 50,
        scheduleDNetCapitalGainOrLossTotal: -100,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 90,
        form8962HouseholdIncomePercentage: 90,
        usesPreferentialRateTaxComputation: true,
        line16TaxComputationMethod: "schedule_d_tax_worksheet",
        section1202GainTotal: 100,
        section1202ExclusionAmount: 40,
      } as any,
      input,
    });

    expect(getValidation(validations, "federal.identity.complete").status).toBe("pass");
    expect(getValidation(validations, "federal.interest.schedule_b.activation").status).toBe("pass");
    expect(getValidation(validations, "federal.social_security_benefits.mfs_exception_applied").message).toContain(
      "lived-apart exception",
    );
    expect(getValidation(validations, "federal.form2441.mfs_exception_applied").message).toContain(
      "lived-apart exception",
    );
    expect(getValidation(validations, "federal.form8812.alt_actc_method_computed").message).toContain(
      "controlling refundable child credit",
    );
    expect(getValidation(validations, "federal.eic.computed").message).toContain("override");
    expect(getValidation(validations, "federal.eic.mfs_exception_overridden").status).toBe("pass");
    expect(getValidation(validations, "federal.form8863.mfs_ineligible").status).toBe("skip");
    expect(getValidation(validations, "federal.form8863.aotc_precedence").status).toBe("pass");
    expect(
      getValidation(validations, "federal.form8863.refundable_aotc_age_restriction_review").status,
    ).toBe("pass");
    expect(getValidation(validations, "federal.schedule_d.imported_carryforward_computed").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.form8960.computed").message).toContain(
      "passive Schedule E activity amounts",
    );
    expect(getValidation(validations, "federal.form8962.mfs_exception_overridden").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.form8962.low_income_exception_overridden").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.line16.schedule_d_tax_worksheet").status).toBe("pass");
    expect(getValidation(validations, "federal.schedule_d.section1202_exclusion_applied").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "CA.plugin.enabled").status).toBe("pass");
  });

  it("emits default-path warnings and failures when exception inputs are missing", () => {
    const input = makeBaseInput();
    const validations = buildValidationResults({
      activations: {
        ...makeActivations(),
        scheduleBActivated: false,
      },
      hasIdentityFacts: false,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        line6aSocialSecurityBenefits: 4000,
        misc1099ScheduleEReviewCount: 1,
        misc1099ScheduleEReviewCategories: ["royalties"],
        misc1099UnsupportedIncomeCategories: ["medical_payments"],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 1,
        scheduleEUnclassifiedActivityCount: 1,
        line27aEarnedIncomeCredit: 0,
        form8812QualifyingChildrenCount: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: -200,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        form8962HouseholdIncomePercentage: 90,
        usesPreferentialRateTaxComputation: true,
        line16TaxComputationMethod: "qualified_dividends_and_capital_gain_worksheet",
        section1202GainTotal: 80,
        section1202ExclusionAmount: 0,
      } as any,
      input,
    });

    expect(getValidation(validations, "federal.identity.complete").status).toBe("fail");
    expect(getValidation(validations, "federal.interest.schedule_b.activation").status).toBe("skip");
    expect(getValidation(validations, "federal.misc_1099.schedule_e_override_required").status).toBe(
      "fail",
    );
    expect(getValidation(validations, "federal.misc_1099.override_required").status).toBe("fail");
    expect(getValidation(validations, "federal.schedule_e.loss_limitation_input_required").status).toBe(
      "fail",
    );
    expect(getValidation(validations, "federal.schedule_e.unclassified_activity_type").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.social_security_benefits.mfs_default_path").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.form2441.mfs_default_ineligible").status).toBe("pass");
    expect(getValidation(validations, "federal.schedule_d.term_override_required").status).toBe("fail");
    expect(getValidation(validations, "federal.schedule_d.imported_carryforward_required").status).toBe(
      "fail",
    );
    expect(getValidation(validations, "federal.form8960.computed").message).not.toContain(
      "passive Schedule E activity amounts",
    );
    expect(getValidation(validations, "federal.form8962.mfs_default_path").status).toBe("pass");
    expect(getValidation(validations, "federal.form8962.low_income_default_path").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.line16.preferential_rate_worksheet").status).toBe(
      "pass",
    );
    expect(getValidation(validations, "federal.schedule_d.section1202_exclusion_required").status).toBe(
      "fail",
    );
  });

  it("falls back to the 1040 node when imported carryforwards are flagged without schedule D activation", () => {
    const validations = buildValidationResults({
      activations: {
        ...makeActivations(),
        scheduleDActivated: false,
      },
      hasIdentityFacts: true,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        misc1099ScheduleEReviewCount: 0,
        misc1099ScheduleEReviewCategories: [],
        misc1099UnsupportedIncomeCategories: [],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 0,
        scheduleEUnclassifiedActivityCount: 0,
        line6aSocialSecurityBenefits: 0,
        form8812QualifyingChildrenCount: 0,
        line27aEarnedIncomeCredit: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        usesPreferentialRateTaxComputation: false,
        section1202GainTotal: 0,
      } as any,
      input: makeBaseInput(),
    });

    expect(getValidation(validations, "federal.schedule_d.imported_carryforward_required").node_ids).toEqual([
      "1040.line7",
    ]);
  });

  it("covers mixed retirement nodes, direct EIC computation messaging, and spouse-driven AOTC review", () => {
    const input = makeBaseInput();
    input.household.taxpayer.date_of_birth = "1980-06-01";
    input.household.taxpayer.is_full_time_student = false;

    const validations = buildValidationResults({
      activations: makeActivations(),
      hasIdentityFacts: true,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        line4aIraDistributions: 1000,
        line4bTaxableIraDistributions: 0,
        line5aPensionsAndAnnuities: 0,
        line5bTaxablePensionsAndAnnuities: 400,
        retirementTaxableAmountAssumptionCount: 1,
        misc1099ScheduleEReviewCount: 0,
        misc1099ScheduleEReviewCategories: [],
        misc1099UnsupportedIncomeCategories: [],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 0,
        scheduleEUnclassifiedActivityCount: 0,
        line27aEarnedIncomeCredit: 500,
        educationCreditRefundable: 200,
        form8812QualifyingChildrenCount: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        section1202GainTotal: 0,
        usesPreferentialRateTaxComputation: false,
      } as any,
      input,
    });

    expect(getValidation(validations, "federal.retirement_distributions.computed").node_ids).toEqual([
      "1040.line4a",
      "1040.line5b",
    ]);
    expect(getValidation(validations, "federal.eic.computed").message).toContain(
      "earned income credit was computed",
    );
    expect(
      getValidation(validations, "federal.form8863.refundable_aotc_age_restriction_review").status,
    ).toBe("pass");
  });

  it("covers the complementary retirement nodes and schedule C mapping without downstream business outputs", () => {
    const validations = buildValidationResults({
      activations: makeActivations(),
      hasIdentityFacts: true,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        line4aIraDistributions: 0,
        line4bTaxableIraDistributions: 500,
        line5aPensionsAndAnnuities: 1000,
        line5bTaxablePensionsAndAnnuities: 0,
        retirementTaxableAmountAssumptionCount: 0,
        linkedNonemployeeCompensationToScheduleCTotal: 100,
        scheduleCBusinessNetProfit: 0,
        selfEmploymentTax: 0,
        misc1099ScheduleEReviewCount: 0,
        misc1099ScheduleEReviewCategories: [],
        misc1099UnsupportedIncomeCategories: [],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 0,
        scheduleEUnclassifiedActivityCount: 0,
        line27aEarnedIncomeCredit: 0,
        form8812QualifyingChildrenCount: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        section1202GainTotal: 0,
        usesPreferentialRateTaxComputation: false,
      } as any,
      input: makeBaseInput(),
    });

    expect(getValidation(validations, "federal.retirement_distributions.computed").node_ids).toEqual([
      "1040.line4b",
      "1040.line5a",
    ]);
    expect(getValidation(validations, "federal.nonemployee_compensation.schedule_c_mapped").node_ids).toEqual([
      "schc.line31.net_profit",
    ]);
  });

  it("emits the schedule D worksheet validation without special-rate nodes when none apply", () => {
    const validations = buildValidationResults({
      activations: {
        ...makeActivations(),
        form8962Activated: false,
      },
      hasIdentityFacts: true,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        misc1099ScheduleEReviewCount: 0,
        misc1099ScheduleEReviewCategories: [],
        misc1099UnsupportedIncomeCategories: [],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 0,
        scheduleEUnclassifiedActivityCount: 0,
        line27aEarnedIncomeCredit: 0,
        form8812QualifyingChildrenCount: 0,
        usesPreferentialRateTaxComputation: true,
        line16TaxComputationMethod: "schedule_d_tax_worksheet",
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        section1202GainTotal: 0,
      } as any,
      input: makeBaseInput(),
    });

    expect(getValidation(validations, "federal.line16.schedule_d_tax_worksheet").node_ids).toEqual([
      "1040.line3a",
      "schd.line16",
      "1040.line16",
    ]);
  });

  it("covers schedule E mapping without downstream income nodes and EIC override-only activation", () => {
    const input = makeBaseInput();
    input.facts.state_specific_fact_bag.federal = {
      form8812: {
        line27a_eic_override: 123,
      },
    };

    const validations = buildValidationResults({
      activations: makeActivations(),
      hasIdentityFacts: true,
      activeStateReturns: [],
      computation: {
        deductionStrategy: "standard",
        misc1099ScheduleEMappedCount: 1,
        misc1099ScheduleEReviewCount: 0,
        misc1099ScheduleEReviewCategories: [],
        misc1099UnsupportedIncomeCategories: [],
        scheduleEActivityNetTotal: 0,
        scheduleELimitationOverrideCount: 0,
        scheduleENegativeActivityCount: 0,
        scheduleEUnclassifiedActivityCount: 0,
        line27aEarnedIncomeCredit: 0,
        form8812QualifyingChildrenCount: 0,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 0,
        scheduleDNetCapitalGainOrLossTotal: 0,
        capitalGainOrLossTotal: 0,
        scheduleEInvestmentIncomeTotal: 0,
        section1202GainTotal: 0,
        usesPreferentialRateTaxComputation: false,
      } as any,
      input,
    });

    expect(getValidation(validations, "federal.misc_1099.schedule_e_mapped").node_ids).toEqual([
      "sche.summary.total",
    ]);
    expect(getValidation(validations, "federal.eic.computed").message).toContain("override");
  });
});
