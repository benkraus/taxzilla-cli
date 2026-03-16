import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "./index";

describe("evaluateTy2025CoreEngine", () => {
  it("computes an additional child tax credit refund when the child credit exceeds tax liability", async () => {
    const refundableChildCreditReturn = structuredClone(sampleReturnTy2025) as any;

    refundableChildCreditReturn.requested_jurisdictions.states = [];
    refundableChildCreditReturn.state_returns = {};
    refundableChildCreditReturn.facts.income.wages = [
      {
        wage_id: "wage_actc_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_acme",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 25000,
        federal_income_tax_withheld: 0,
        social_security_wages: 25000,
        social_security_tax_withheld: 1550,
        medicare_wages_and_tips: 25000,
        medicare_tax_withheld: 362.5,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    refundableChildCreditReturn.facts.income.taxable_interest = [];
    refundableChildCreditReturn.facts.payments.withholdings = [];
    refundableChildCreditReturn.household.dependents = [
      {
        person_id: "p_child_actc_1",
        name: {
          first: "Maya",
          last: "Rivera",
          full_legal_name: "Maya Rivera",
        },
        date_of_birth: "2020-02-14",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
    ];
    refundableChildCreditReturn.facts.credits.candidate_child_tax_credit_dependent_ids = [
      "p_child_actc_1",
    ];
    refundableChildCreditReturn.facts.credits.candidate_credit_for_other_dependent_ids = [];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(refundableChildCreditReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 925,
      line19_child_tax_credit_or_credit_for_other_dependents: 925,
      line24_total_tax: 0,
      line28_additional_child_tax_credit: 1275,
      line33_total_payments: 1275,
      line34_refund_amount: 1275,
      line37_amount_owed: 0,
      additional_child_tax_credit: 1275,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8812.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule 8812 child tax credit, credit for other dependents, and additional child tax credit were computed.",
      node_ids: ["8812.summary.nonrefundable_credit", "8812.summary.additional_child_tax_credit"],
    });
  });

  it("computes the american opportunity credit when income stays within the phaseout range", async () => {
    const educationCreditReturn = structuredClone(sampleReturnTy2025) as any;

    educationCreditReturn.requested_jurisdictions.states = [];
    educationCreditReturn.state_returns = {};
    educationCreditReturn.facts.income.wages = [
      {
        wage_id: "wage_8863_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_acme",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 60000,
        federal_income_tax_withheld: 0,
        social_security_wages: 60000,
        social_security_tax_withheld: 3720,
        medicare_wages_and_tips: 60000,
        medicare_tax_withheld: 870,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    educationCreditReturn.facts.income.taxable_interest = [];
    educationCreditReturn.facts.payments.withholdings = [];
    educationCreditReturn.facts.credits.education_credits = {
      students: [
        {
          student_person_id: "p_taxpayer",
          source_document_ids: [],
          qualified_expenses_paid: 4000,
          tax_free_assistance: 0,
          is_aotc_candidate: true,
          is_llc_candidate: false,
        },
      ],
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(educationCreditReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 5071.5,
      line20_other_nonrefundable_credits: 1500,
      line24_total_tax: 3571.5,
      line29_refundable_education_credit: 1000,
      line33_total_payments: 1000,
      line37_amount_owed: 2571.5,
      education_credit_nonrefundable: 1500,
      education_credit_refundable: 1000,
    });
  });

  it("uses the married filing separately Form 2441 lived-apart exception when supplied", async () => {
    const mfsForm2441Return = structuredClone(sampleReturnTy2025) as any;

    mfsForm2441Return.requested_jurisdictions.states = [];
    mfsForm2441Return.state_returns = {};
    mfsForm2441Return.household.filing_status = "married_filing_separately";
    mfsForm2441Return.household.spouse = {
      person_id: "p_spouse_2441",
      name: {
        first: "Taylor",
        last: "Rivera",
        full_legal_name: "Taylor Rivera",
      },
    };
    mfsForm2441Return.facts.income.taxable_interest = [];
    mfsForm2441Return.facts.payments.withholdings = [];
    mfsForm2441Return.facts.income.wages = [
      {
        wage_id: "wage_mfs_2441_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_mfs_2441_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 30000,
        federal_income_tax_withheld: 0,
        social_security_wages: 30000,
        social_security_tax_withheld: 1860,
        medicare_wages_and_tips: 30000,
        medicare_tax_withheld: 435,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    mfsForm2441Return.household.dependents = [
      {
        person_id: "p_child_2441_1",
        name: {
          first: "Maya",
          last: "Rivera",
          full_legal_name: "Maya Rivera",
        },
        date_of_birth: "2020-02-14",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
    ];
    mfsForm2441Return.facts.credits.child_and_dependent_care = {
      qualifying_person_ids: ["p_child_2441_1"],
      providers: [
        {
          provider_id: "provider_2441_1",
          name: "Neighborhood Daycare",
        },
      ],
      expenses: [
        {
          person_id: "p_child_2441_1",
          provider_id: "provider_2441_1",
          amount: 3000,
          months_of_care: 12,
        },
      ],
    };
    mfsForm2441Return.facts.state_specific_fact_bag = {
      ...mfsForm2441Return.facts.state_specific_fact_bag,
      federal: {
        form2441: {
          allow_married_filing_separately_lived_apart_exception: true,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(mfsForm2441Return));

    expect(result.federal_summary).toMatchObject({
      child_and_dependent_care_credit: 810,
      line20_other_nonrefundable_credits: 810,
      line24_total_tax: 661.5,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form2441.mfs_exception_applied",
      severity: "info",
      status: "pass",
      message:
        "Married filing separately Form 2441 used the lived-apart exception flag from the federal extension bag and computed the credit instead of suppressing it.",
      node_ids: ["2441.summary.allowed_credit"],
    });
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.form2441.mfs_default_ineligible",
      ),
    ).toBeUndefined();
  });

  it("computes line 27a and the three-child ACTC comparison path", async () => {
    const threeChildActcReturn = structuredClone(sampleReturnTy2025) as any;

    threeChildActcReturn.requested_jurisdictions.states = [];
    threeChildActcReturn.state_returns = {};
    threeChildActcReturn.facts.income.wages = [
      {
        wage_id: "wage_eic_actc_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_eic_actc_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 20000,
        federal_income_tax_withheld: 0,
        social_security_wages: 20000,
        social_security_tax_withheld: 1240,
        medicare_wages_and_tips: 20000,
        medicare_tax_withheld: 290,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    threeChildActcReturn.facts.income.taxable_interest = [];
    threeChildActcReturn.facts.payments.withholdings = [];
    threeChildActcReturn.household.dependents = [
      {
        person_id: "p_child_eic_1",
        name: {
          first: "Ava",
          last: "Rivera",
          full_legal_name: "Ava Rivera",
        },
        date_of_birth: "2017-03-10",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
      {
        person_id: "p_child_eic_2",
        name: {
          first: "Leo",
          last: "Rivera",
          full_legal_name: "Leo Rivera",
        },
        date_of_birth: "2019-06-14",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
      {
        person_id: "p_child_eic_3",
        name: {
          first: "Noah",
          last: "Rivera",
          full_legal_name: "Noah Rivera",
        },
        date_of_birth: "2021-11-02",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
    ];
    threeChildActcReturn.facts.credits.candidate_child_tax_credit_dependent_ids = [
      "p_child_eic_1",
      "p_child_eic_2",
      "p_child_eic_3",
    ];
    threeChildActcReturn.facts.credits.candidate_credit_for_other_dependent_ids = [];
    threeChildActcReturn.facts.credits.candidate_eitc_child_ids = [
      "p_child_eic_1",
      "p_child_eic_2",
      "p_child_eic_3",
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(threeChildActcReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 425,
      line19_child_tax_credit_or_credit_for_other_dependents: 425,
      line24_total_tax: 0,
      line27a_earned_income_credit: 8046,
      line28_additional_child_tax_credit: 2625,
      line33_total_payments: 10671,
      line34_refund_amount: 10671,
      line37_amount_owed: 0,
      additional_child_tax_credit: 2625,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "1040.line27a",
        value: 8046,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.eic.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 1040 line 27a earned income credit was computed from candidate EIC children, earned income, AGI, and the TY2025 investment-income limit.",
      node_ids: ["1040.line27a"],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8812.alt_actc_method_computed",
      severity: "info",
      status: "pass",
      message:
        "Three-or-more-child ACTC comparison was computed against the earned-income method before the refundable child credit was finalized.",
      node_ids: ["1040.line27a", "8812.summary.additional_child_tax_credit"],
    });
  });
});
