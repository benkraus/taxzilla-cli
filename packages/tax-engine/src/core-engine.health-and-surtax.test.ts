import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "./index";

describe("evaluateTy2025CoreEngine", () => {
  it("computes additional medicare tax and credits employer withholding from form 8959", async () => {
    const additionalMedicareReturn = structuredClone(sampleReturnTy2025) as any;

    additionalMedicareReturn.requested_jurisdictions.states = [];
    additionalMedicareReturn.state_returns = {};
    additionalMedicareReturn.facts.income.taxable_interest = [];
    additionalMedicareReturn.facts.income.wages = [
      {
        wage_id: "wage_8959_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_acme",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 260000,
        social_security_wages: 176100,
        social_security_tax_withheld: 10918.2,
        medicare_wages_and_tips: 260000,
        medicare_tax_withheld: 4310,
        federal_income_tax_withheld: 0,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    additionalMedicareReturn.facts.payments.withholdings = [];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(additionalMedicareReturn));

    expect(result.activated_module_ids).toContain("federal.form8959");
    expect(result.federal_summary).toMatchObject({
      additional_medicare_tax: 540,
      additional_medicare_tax_withheld: 540,
      line23_other_taxes: 540,
      line25d_federal_withholding: 540,
      form_8959_activated: true,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8959.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8959 Additional Medicare Tax and withholding credit were computed from Medicare wages and self-employment earnings.",
      node_ids: [
        "8959.line18.additional_medicare_tax",
        "8959.line24.additional_medicare_tax_withheld",
      ],
    });
  });

  it("computes net investment income tax from interest, dividends, and capital gains", async () => {
    const niitReturn = structuredClone(sampleReturnTy2025) as any;

    niitReturn.requested_jurisdictions.states = [];
    niitReturn.state_returns = {};
    niitReturn.facts.payments.withholdings = [];
    niitReturn.facts.income.wages = [
      {
        wage_id: "wage_8960_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_acme",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 150000,
        social_security_wages: 150000,
        social_security_tax_withheld: 9300,
        medicare_wages_and_tips: 150000,
        medicare_tax_withheld: 2175,
        federal_income_tax_withheld: 0,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    niitReturn.facts.income.taxable_interest = [];
    niitReturn.facts.income.dividends = [
      {
        dividend_id: "div_8960_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099div_8960_1",
        payer_name: "Example Brokerage",
        ordinary_dividends: 20000,
        qualified_dividends: 20000,
        capital_gain_distributions: 0,
        federal_income_tax_withheld: 0,
        foreign_tax_paid: 0,
        exempt_interest_dividends: 0,
        state_local_rows: [],
      },
    ];
    niitReturn.facts.income.capital_transactions = [
      {
        capital_transaction_id: "cap_8960_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099b_8960_1",
        asset_description: "Index fund sale",
        date_sold: "2025-10-01",
        proceeds: 80000,
        cost_basis: 30000,
        adjustments: 0,
        gain_or_loss: 50000,
        term: "long",
        form_8949_box: "A",
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(niitReturn));

    expect(result.activated_module_ids).toContain("federal.form8960");
    expect(result.federal_summary).toMatchObject({
      net_investment_income: 70000,
      net_investment_income_tax: 760,
      line23_other_taxes: 760,
      form_8960_activated: true,
      schedule_2_activated: true,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8960.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8960 net investment income tax was computed from investment income totals and the filing-status threshold.",
      node_ids: ["8960.line8.net_investment_income", "8960.line17.net_investment_income_tax"],
    });
  });

  it("includes passive Schedule E income in net investment income tax but excludes materially participating activities", async () => {
    const scheduleENiitReturn = structuredClone(sampleReturnTy2025) as any;

    scheduleENiitReturn.requested_jurisdictions.states = [];
    scheduleENiitReturn.state_returns = {};
    scheduleENiitReturn.facts.payments.withholdings = [];
    scheduleENiitReturn.facts.income.taxable_interest = [];
    scheduleENiitReturn.facts.income.dividends = [];
    scheduleENiitReturn.facts.income.capital_transactions = [];
    scheduleENiitReturn.facts.income.wages = [
      {
        wage_id: "wage_sched_e_niit_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_sched_e_niit_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 190000,
        social_security_wages: 176100,
        social_security_tax_withheld: 10918.2,
        medicare_wages_and_tips: 190000,
        medicare_tax_withheld: 2755,
        federal_income_tax_withheld: 0,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    scheduleENiitReturn.facts.income.schedule_e_activities = [
      {
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "Makaha Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Gross rents",
            amount: 12000,
          },
        ],
        expense_items: [
          {
            description: "Repairs and taxes",
            amount: 3000,
          },
        ],
        source_document_ids: [],
      },
      {
        owner_person_id: "p_taxpayer",
        activity_type: "partnership_k1",
        entity_name: "Operating Partnership",
        materially_participates: true,
        income_items: [
          {
            description: "Ordinary business income",
            amount: 10000,
          },
        ],
        expense_items: [
          {
            description: "Released deductions",
            amount: 0,
          },
        ],
        source_document_ids: [],
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(scheduleENiitReturn));

    expect(result.activated_module_ids).toContain("federal.form8960");
    expect(result.federal_summary).toMatchObject({
      line8_other_income: 19000,
      line9_total_income: 209000,
      line11_adjusted_gross_income: 209000,
      net_investment_income: 9000,
      net_investment_income_tax: 342,
      line23_other_taxes: 342,
      schedule_e_activity_net_total: 19000,
      schedule_e_investment_income_total: 9000,
      form_8960_activated: true,
      schedule_e_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "8960.line4a.schedule_e_investment_income",
        value: 9000,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8960.computed",
      severity: "info",
      status: "pass",
      message:
        "Form 8960 net investment income tax was computed from investment income totals, passive Schedule E activity amounts, and the filing-status threshold.",
      node_ids: [
        "8960.line4a.schedule_e_investment_income",
        "8960.line8.net_investment_income",
        "8960.line17.net_investment_income_tax",
      ],
    });
  });

  it("caps excess advance premium tax credit repayment below 400 percent of the federal poverty line", async () => {
    const cappedRepaymentReturn = structuredClone(sampleReturnTy2025) as any;

    cappedRepaymentReturn.requested_jurisdictions.states = [];
    cappedRepaymentReturn.state_returns = {};
    cappedRepaymentReturn.facts.income.wages = [
      {
        wage_id: "wage_8962_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_acme",
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
    cappedRepaymentReturn.facts.income.taxable_interest = [];
    cappedRepaymentReturn.facts.payments.withholdings = [];
    cappedRepaymentReturn.facts.credits.premium_tax_credit = {
      policies: [
        {
          policy_id: "ptc_cap_1",
          source_document_id: "doc_1095a_cap_1",
          marketplace_identifier: "Covered CA",
          covered_person_ids: ["p_taxpayer"],
          monthly_rows: [
            {
              month: "annual",
              advance_payment_of_premium_tax_credit: 2000,
              enrollment_premium: 1500,
              second_lowest_cost_silver_plan_premium: 1500,
            },
          ],
        },
      ],
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(cappedRepaymentReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 1471.5,
      line23_other_taxes: 500,
      line24_total_tax: 1971.5,
      line33_total_payments: 0,
      line37_amount_owed: 1971.5,
      net_premium_tax_credit: 0,
      excess_advance_premium_tax_credit_repayment: 500,
      schedule_2_activated: true,
    });
  });

  it("uses the married filing separately Form 8962 exception when supplied", async () => {
    const mfsExceptionReturn = structuredClone(sampleReturnTy2025) as any;

    mfsExceptionReturn.requested_jurisdictions.states = [];
    mfsExceptionReturn.state_returns = {};
    mfsExceptionReturn.household.filing_status = "married_filing_separately";
    mfsExceptionReturn.household.spouse = {
      person_id: "p_spouse_8962",
      name: {
        first: "Taylor",
        last: "Rivera",
        full_legal_name: "Taylor Rivera",
      },
    };
    mfsExceptionReturn.facts.income.wages = [
      {
        wage_id: "wage_mfs_8962_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_mfs_8962_1",
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
    mfsExceptionReturn.facts.income.taxable_interest = [];
    mfsExceptionReturn.facts.payments.withholdings = [];
    mfsExceptionReturn.facts.credits.premium_tax_credit = {
      policies: [
        {
          policy_id: "ptc_mfs_exception_1",
          source_document_id: "doc_1095a_mfs_exception_1",
          marketplace_identifier: "Covered CA",
          covered_person_ids: ["p_taxpayer"],
          monthly_rows: [
            {
              month: "annual",
              advance_payment_of_premium_tax_credit: 600,
              enrollment_premium: 4000,
              second_lowest_cost_silver_plan_premium: 4800,
            },
          ],
        },
      ],
    };
    mfsExceptionReturn.facts.state_specific_fact_bag = {
      ...mfsExceptionReturn.facts.state_specific_fact_bag,
      federal: {
        form8962: {
          allow_married_filing_separately_exception: true,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(mfsExceptionReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 1471.5,
      line24_total_tax: 1471.5,
      line31_other_payments: 3400,
      line33_total_payments: 3400,
      line34_refund_amount: 1928.5,
      line37_amount_owed: 0,
      net_premium_tax_credit: 3400,
      excess_advance_premium_tax_credit_repayment: 0,
      schedule_2_activated: false,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8962.mfs_exception_overridden",
      severity: "info",
      status: "pass",
      message:
        "Married filing separately Form 8962 processing used an explicit exception flag from the federal extension bag instead of suppressing premium tax credit computation.",
      node_ids: ["8962.summary.net_premium_tax_credit", "8962.summary.excess_advance_ptc_repayment"],
    });
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.form8962.mfs_default_path",
      ),
    ).toBeUndefined();
  });

  it("uses the below-FPL Form 8962 exception when supplied", async () => {
    const belowFplExceptionReturn = structuredClone(sampleReturnTy2025) as any;

    belowFplExceptionReturn.requested_jurisdictions.states = [];
    belowFplExceptionReturn.state_returns = {};
    belowFplExceptionReturn.facts.income.wages = [
      {
        wage_id: "wage_low_income_8962_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_low_income_8962_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 10000,
        federal_income_tax_withheld: 0,
        social_security_wages: 10000,
        social_security_tax_withheld: 620,
        medicare_wages_and_tips: 10000,
        medicare_tax_withheld: 145,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    belowFplExceptionReturn.facts.income.taxable_interest = [];
    belowFplExceptionReturn.facts.payments.withholdings = [];
    belowFplExceptionReturn.facts.credits.premium_tax_credit = {
      policies: [
        {
          policy_id: "ptc_low_income_exception_1",
          source_document_id: "doc_1095a_low_income_exception_1",
          marketplace_identifier: "Covered CA",
          covered_person_ids: ["p_taxpayer"],
          monthly_rows: [
            {
              month: "annual",
              advance_payment_of_premium_tax_credit: 0,
              enrollment_premium: 6000,
              second_lowest_cost_silver_plan_premium: 6000,
            },
          ],
        },
      ],
    };
    belowFplExceptionReturn.facts.state_specific_fact_bag = {
      ...belowFplExceptionReturn.facts.state_specific_fact_bag,
      federal: {
        form8962: {
          allow_household_income_below_fpl_exception: true,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(belowFplExceptionReturn));

    expect(result.federal_summary).toMatchObject({
      line16_regular_income_tax: 0,
      line24_total_tax: 0,
      line31_other_payments: 6000,
      line33_total_payments: 6000,
      line34_refund_amount: 6000,
      line37_amount_owed: 0,
      net_premium_tax_credit: 6000,
      excess_advance_premium_tax_credit_repayment: 0,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.form8962.low_income_exception_overridden",
      severity: "info",
      status: "pass",
      message:
        "Below-100%-of-FPL Form 8962 processing used an explicit federal extension flag so premium tax credit reconciliation continued instead of being suppressed.",
      node_ids: ["8962.summary.net_premium_tax_credit"],
    });
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.form8962.low_income_default_path",
      ),
    ).toBeUndefined();
  });

});
