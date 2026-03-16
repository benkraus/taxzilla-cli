import { Either, Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "../index";

describe("evaluateTy2025CoreEngine", () => {
  it("builds a deterministic graph for the bundled sample return", async () => {
    const result = await Effect.runPromise(evaluateTy2025CoreEngine(sampleReturnTy2025));

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.scheduleA",
      "federal.scheduleB",
      "ca.ty2025.stub.v1",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 85000,
      line3a_qualified_dividends: 0,
      line2b_taxable_interest: 45.32,
      line3b_ordinary_dividends: 0,
      line7_capital_gain_or_loss: 0,
      line8_other_income: 0,
      line9_total_income: 85045.32,
      line10_adjustments: 0,
      line11_adjusted_gross_income: 85045.32,
      line12_deductions: 15750,
      line15_taxable_income: 69295.32,
      line16_regular_income_tax: 10158.97,
      line19_child_tax_credit_or_credit_for_other_dependents: 0,
      line20_other_nonrefundable_credits: 0,
      line23_other_taxes: 0,
      line24_total_tax: 10158.97,
      line25d_federal_withholding: 9000,
      line26_estimated_and_extension_payments: 0,
      line28_additional_child_tax_credit: 0,
      line29_refundable_education_credit: 0,
      line31_other_payments: 0,
      line33_total_payments: 9000,
      line34_refund_amount: 0,
      line37_amount_owed: 1158.97,
      itemized_deduction_total: 4200,
      standard_deduction: 15750,
      schedule1_additional_income_total: 0,
      schedule2_other_taxes_total: 0,
      schedule3_nonrefundable_credits_total: 0,
      schedule3_payments_total: 0,
      total_adjustments: 0,
      federal_withholding: 9000,
      child_and_dependent_care_credit: 0,
      child_tax_credit_or_credit_for_other_dependents: 0,
      additional_child_tax_credit: 0,
      education_credit_nonrefundable: 0,
      education_credit_refundable: 0,
      capital_gain_distributions_total: 0,
      net_premium_tax_credit: 0,
      excess_advance_premium_tax_credit_repayment: 0,
      deduction_strategy: "standard",
      schedule_a_activated: true,
      schedule_1_activated: false,
      schedule_2_activated: false,
      schedule_b_activated: true,
      schedule_3_activated: false,
      schedule_c_activated: false,
      schedule_d_activated: false,
    });
    expect(result.graph.jurisdictions).toEqual(["federal", "CA"]);
    expect(result.graph.execution_order).toContain("scha.line17");
    expect(result.graph.execution_order).toContain("1040.choice.deduction_strategy");
    expect(result.graph.execution_order).toContain("1040.line37");

    const adjustedGrossIncomeNode = result.graph.nodes.find(
      (node) => node.node_id === "1040.line11",
    );
    const deductionNode = result.graph.nodes.find((node) => node.node_id === "1040.line12");
    const californiaBridgeNode = result.graph.nodes.find(
      (node) => node.node_id === "bridge.ca.starting_point",
    );
    const californiaTaxNode = result.graph.nodes.find((node) => node.node_id === "ca.form540.line64");

    expect(adjustedGrossIncomeNode?.value).toBe(85045.32);
    expect(deductionNode?.value).toBe(15750);
    expect(californiaBridgeNode?.value).toBe(85045);
    expect(californiaTaxNode?.value).toBe(3661);
    expect(result.state_summaries).toEqual([
      {
        state_code: "CA",
        plugin_manifest_id: "ca.ty2025.stub.v1",
        adjusted_gross_income_or_starting_point: 85045,
        taxable_income: 79339,
        total_tax: 3661,
        total_payments: 4200,
        refund_amount: 539,
        amount_owed: 0,
      },
    ]);
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "CA.form540.tax_table_used",
      severity: "info",
      status: "pass",
      message:
        "California Form 540 line 31 used the official 2025 tax table path for taxable income of $100,000 or less.",
      node_ids: ["ca.form540.line19", "ca.form540.line31"],
    });
  });

  it("keeps the federal core module active when schedule B and state plugins are unnecessary", async () => {
    const returnWithoutInterest = structuredClone(sampleReturnTy2025) as any;
    returnWithoutInterest.facts.income.taxable_interest = [];
    returnWithoutInterest.requested_jurisdictions.states = [];
    returnWithoutInterest.state_returns = {};

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(returnWithoutInterest));

    expect(result.activated_module_ids).toEqual(["federal.form1040.core", "federal.scheduleA"]);
    expect(result.federal_summary.schedule_b_activated).toBe(false);
    expect(result.federal_summary.schedule_a_activated).toBe(true);
    expect(result.federal_summary.line2b_taxable_interest).toBe(0);
    expect(result.state_summaries).toEqual([]);
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.interest.schedule_b.activation",
      severity: "info",
      status: "skip",
      message: "Schedule B not required for this return.",
    });
  });

  it("fails with a typed error when the canonical return envelope is invalid", async () => {
    const result = await Effect.runPromise(Effect.either(evaluateTy2025CoreEngine({})));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("InvalidCanonicalReturnError");
    }
  });

  it("activates additional core federal modules and rolls them into 1040 totals", async () => {
    const expandedReturn = structuredClone(sampleReturnTy2025) as any;

    expandedReturn.household.dependents = [
      {
        person_id: "p_child_1",
        name: {
          first: "Jamie",
          last: "Rivera",
          full_legal_name: "Jamie Rivera",
        },
        date_of_birth: "2018-04-02",
        relationship_to_taxpayer: "child",
        months_lived_with_taxpayer: 12,
        qualifying_for_child_tax_credit: true,
        qualifying_for_credit_for_other_dependents: false,
        qualifying_for_eitc: true,
        is_disabled: false,
        is_full_time_student: false,
      },
    ];
    expandedReturn.facts.income.dividends = [
      {
        dividend_id: "div_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099div_1",
        payer_name: "Example Brokerage",
        ordinary_dividends: 350.5,
        qualified_dividends: 100,
        capital_gain_distributions: 0,
        federal_income_tax_withheld: 0,
        foreign_tax_paid: 0,
        exempt_interest_dividends: 0,
        state_local_rows: [],
      },
    ];
    expandedReturn.facts.income.capital_transactions = [
      {
        capital_transaction_id: "cap_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099b_1",
        asset_description: "ETF sale",
        date_sold: "2025-06-15",
        proceeds: 5000,
        cost_basis: 4250.5,
        adjustments: 0,
        gain_or_loss: 749.5,
        term: "long",
        form_8949_box: "A",
      },
    ];
    expandedReturn.facts.income.schedule_c_businesses = [
      {
        business_id: "biz_1",
        owner_person_id: "p_taxpayer",
        business_name: "Rivera Consulting",
        accounting_method: "cash",
        materially_participates: true,
        gross_receipts_or_sales: 20000,
        returns_and_allowances: 0,
        cost_of_goods_sold: 0,
        other_business_income: 500,
        expenses: [
          {
            description: "Software subscriptions",
            amount: 4000,
          },
        ],
        home_office_deduction: 1000,
        vehicle_expense_method: "none",
        source_document_ids: [],
        state_allocations: [],
      },
    ];
    expandedReturn.facts.income.other_income_items = [
      {
        other_income_id: "oth_1",
        person_id: "p_taxpayer",
        description: "Jury duty pay",
        amount: 125,
        schedule1_category: "other",
        source_document_ids: [],
        state_allocations: [],
      },
    ];
    expandedReturn.facts.adjustments.health_savings_account_deduction = 1200;
    expandedReturn.facts.adjustments.student_loan_interest_deduction = 600;
    expandedReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = 8500;
    expandedReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "doc_1098_1",
        lender_name: "Example Lender",
        mortgage_interest_received: 9000,
      },
    ];
    expandedReturn.facts.itemized_deductions.charitable_cash_contributions = 2000;
    expandedReturn.facts.itemized_deductions.charitable_noncash_contributions = 250;
    expandedReturn.facts.credits.other_nonrefundable_credits = [
      {
        description: "Foreign tax credit carryover",
        amount: 400,
      },
    ];
    expandedReturn.facts.credits.other_refundable_credits = [
      {
        description: "Recovery rebate correction",
        amount: 150,
      },
    ];
    expandedReturn.facts.credits.child_and_dependent_care = {
      qualifying_person_ids: ["p_child_1"],
      providers: [
        {
          provider_id: "prov_1",
          name: "Neighborhood Daycare",
        },
      ],
      expenses: [
        {
          person_id: "p_child_1",
          provider_id: "prov_1",
          amount: 2400,
          months_of_care: 6,
        },
      ],
    };
    expandedReturn.facts.credits.candidate_child_tax_credit_dependent_ids = ["p_child_1"];
    expandedReturn.facts.credits.education_credits = {
      students: [
        {
          student_person_id: "p_taxpayer",
          source_document_ids: [],
          qualified_expenses_paid: 2000,
          tax_free_assistance: 500,
          is_aotc_candidate: true,
          is_llc_candidate: false,
        },
      ],
    };
    expandedReturn.facts.credits.premium_tax_credit = {
      policies: [
        {
          policy_id: "ptc_1",
          source_document_id: "doc_1095a_1",
          marketplace_identifier: "Covered CA",
          covered_person_ids: ["p_taxpayer"],
          monthly_rows: [
            {
              month: "annual",
              advance_payment_of_premium_tax_credit: 300,
              enrollment_premium: 500,
              second_lowest_cost_silver_plan_premium: 450,
            },
          ],
        },
      ],
    };
    expandedReturn.facts.payments.estimated_payments = [
      {
        payment_id: "est_1",
        jurisdiction: "federal",
        amount: 1200,
        paid_date: "2025-04-15",
        quarter: "Q1",
      },
    ];
    expandedReturn.facts.payments.prior_year_overpayment_applied_to_2025 = 200;
    expandedReturn.facts.health_coverage.hsa_coverage_months = [
      {
        person_id: "p_taxpayer",
        month: "january",
        coverage_type: "self_only",
      },
    ];
    expandedReturn.facts.health_coverage.marketplace_policies = [
      {
        policy_id: "mkt_1",
        source_document_id: "doc_1095a_1",
        marketplace_identifier: "Covered CA",
        covered_person_ids: ["p_taxpayer"],
        monthly_rows: [
          {
            month: "annual",
            advance_payment_of_premium_tax_credit: 300,
            enrollment_premium: 500,
            second_lowest_cost_silver_plan_premium: 450,
          },
        ],
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(expandedReturn));

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.schedule1",
      "federal.schedule2",
      "federal.schedule3",
      "federal.scheduleA",
      "federal.scheduleB",
      "federal.scheduleC",
      "federal.scheduleD",
      "federal.scheduleSE",
      "federal.form2441",
      "federal.form8812",
      "federal.form8863",
      "federal.form8889",
      "federal.form8949",
      "federal.form8962",
      "ca.ty2025.stub.v1",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 85000,
      line3a_qualified_dividends: 100,
      line2b_taxable_interest: 45.32,
      line3b_ordinary_dividends: 350.5,
      line7_capital_gain_or_loss: 749.5,
      line8_other_income: 15625,
      line9_total_income: 101770.32,
      line10_adjustments: 2895.04,
      line11_adjusted_gross_income: 98875.28,
      line12_deductions: 19750,
      line15_taxable_income: 79125.28,
      line16_regular_income_tax: 12262.1,
      line19_child_tax_credit_or_credit_for_other_dependents: 2200,
      line20_other_nonrefundable_credits: 880,
      line23_other_taxes: 2490.08,
      line24_total_tax: 11672.18,
      line25d_federal_withholding: 9000,
      line26_estimated_and_extension_payments: 1400,
      line28_additional_child_tax_credit: 0,
      line29_refundable_education_credit: 0,
      line31_other_payments: 150,
      line33_total_payments: 10550,
      line34_refund_amount: 0,
      line37_amount_owed: 1122.18,
      itemized_deduction_total: 19750,
      standard_deduction: 15750,
      schedule1_additional_income_total: 15625,
      schedule2_other_taxes_total: 2490.08,
      schedule3_nonrefundable_credits_total: 880,
      schedule3_payments_total: 1550,
      self_employment_tax: 2190.08,
      self_employment_tax_deduction: 1095.04,
      additional_medicare_tax: 0,
      additional_medicare_tax_withheld: 0,
      net_investment_income: 1145.32,
      net_investment_income_tax: 0,
      child_and_dependent_care_credit: 480,
      child_tax_credit_or_credit_for_other_dependents: 2200,
      additional_child_tax_credit: 0,
      education_credit_nonrefundable: 0,
      education_credit_refundable: 0,
      capital_gain_distributions_total: 0,
      net_premium_tax_credit: 0,
      excess_advance_premium_tax_credit_repayment: 300,
      deduction_strategy: "itemized",
      form_8959_activated: false,
      form_8960_activated: false,
      schedule_a_activated: true,
      schedule_1_activated: true,
      schedule_2_activated: true,
      schedule_b_activated: true,
      schedule_3_activated: true,
      schedule_c_activated: true,
      schedule_d_activated: true,
      schedule_se_activated: true,
    });
    expect(result.graph.execution_order).toContain("sch1.line10");
    expect(result.graph.execution_order).toContain("sch1.line13");
    expect(result.graph.execution_order).toContain("sch1.line15");
    expect(result.graph.execution_order).toContain("sch1.line21");
    expect(result.graph.execution_order).toContain("sch1.line26");
    expect(result.graph.execution_order).toContain("sch2.summary.other_taxes");
    expect(result.graph.execution_order).toContain("schse.line12");
    expect(result.graph.execution_order).toContain("sch3.part2.total_payments");
    expect(result.graph.execution_order).toContain("8949.total.net_gain_or_loss");
    expect(result.graph.execution_order).toContain("1040.line24");
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line13",
        value: 1200,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line15",
        value: 1095.04,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line21",
        value: 600,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8962.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8962 premium tax credit reconciliation was computed from household income, poverty line, and marketplace policy totals.",
      node_ids: [
        "8962.summary.advance_ptc",
        "8962.summary.net_premium_tax_credit",
        "8962.summary.excess_advance_ptc_repayment",
      ],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.line16.preferential_rate_worksheet",
      severity: "info",
      status: "pass",
      message:
        "Line 16 was computed with the TY2025 qualified dividends and capital gain worksheet path.",
      node_ids: ["1040.line3a", "1040.line7", "1040.line16"],
    });
  });

});
