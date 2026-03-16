import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "../index";

describe("evaluateTy2025CoreEngine", () => {
  it("breaks other Schedule 1 adjustments into line 24z, line 25, and line 26 nodes", async () => {
    const schedule1AdjustmentReturn = structuredClone(sampleReturnTy2025) as any;

    schedule1AdjustmentReturn.requested_jurisdictions.states = [];
    schedule1AdjustmentReturn.state_returns = {};
    schedule1AdjustmentReturn.facts.income.taxable_interest = [];
    schedule1AdjustmentReturn.facts.adjustments.educator_expenses = 250;
    schedule1AdjustmentReturn.facts.adjustments.other_adjustments = [
      {
        description: "Attorney fees for unlawful discrimination claim",
        amount: 150,
      },
      {
        description: "Reforestation amortization",
        amount: 50,
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(schedule1AdjustmentReturn));

    expect(result.federal_summary).toMatchObject({
      line10_adjustments: 450,
      total_adjustments: 450,
      schedule_1_activated: true,
    });
    expect(result.graph.execution_order).toContain("sch1.line11");
    expect(result.graph.execution_order).toContain("sch1.line24z.0");
    expect(result.graph.execution_order).toContain("sch1.line24z.1");
    expect(result.graph.execution_order).toContain("sch1.line25");
    expect(result.graph.execution_order).toContain("sch1.line26");
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line11",
        value: 250,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line24z.0",
        label: "Attorney fees for unlawful discrimination claim",
        value: 150,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line24z.1",
        label: "Reforestation amortization",
        value: 50,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line25",
        value: 200,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line26",
        value: 450,
      }),
    );
  });

  it("routes 1099-NEC and supported 1099-MISC categories through Schedule C and Schedule 1", async () => {
    const schedule1ClassificationReturn = structuredClone(sampleReturnTy2025) as any;

    schedule1ClassificationReturn.requested_jurisdictions.states = [];
    schedule1ClassificationReturn.state_returns = {};
    schedule1ClassificationReturn.facts.payments.withholdings = [];
    schedule1ClassificationReturn.facts.income.wages = [];
    schedule1ClassificationReturn.facts.income.taxable_interest = [];
    schedule1ClassificationReturn.facts.income.dividends = [];
    schedule1ClassificationReturn.facts.income.capital_transactions = [];
    schedule1ClassificationReturn.facts.income.retirement_distributions = [];
    schedule1ClassificationReturn.facts.income.unemployment_compensation = [];
    schedule1ClassificationReturn.facts.income.social_security_benefits = [];
    schedule1ClassificationReturn.facts.income.other_income_items = [];
    schedule1ClassificationReturn.facts.adjustments.health_savings_account_deduction = 0;
    schedule1ClassificationReturn.facts.adjustments.student_loan_interest_deduction = 0;
    schedule1ClassificationReturn.facts.itemized_deductions = {
      medical_and_dental_expenses: 0,
      state_and_local_income_or_sales_taxes: 0,
      real_estate_taxes: 0,
      personal_property_taxes: 0,
      other_taxes: 0,
      mortgage_interest_items: [],
      charitable_cash_contributions: 0,
      charitable_noncash_contributions: 0,
      casualty_and_theft_losses: 0,
      other_itemized_deductions: [],
    };
    schedule1ClassificationReturn.facts.income.schedule_c_businesses = [
      {
        business_id: "biz_nec_1",
        owner_person_id: "p_taxpayer",
        business_name: "Consulting",
        accounting_method: "cash",
        materially_participates: true,
        gross_receipts_or_sales: 10000,
        returns_and_allowances: 0,
        cost_of_goods_sold: 0,
        other_business_income: 0,
        expenses: [
          {
            description: "Software",
            amount: 2000,
          },
        ],
        home_office_deduction: 0,
        vehicle_expense_method: "none",
        source_document_ids: [],
        state_allocations: [],
      },
      {
        business_id: "biz_nec_2",
        owner_person_id: "p_taxpayer",
        business_name: "Side Project",
        accounting_method: "cash",
        materially_participates: true,
        gross_receipts_or_sales: 0,
        returns_and_allowances: 0,
        cost_of_goods_sold: 0,
        other_business_income: 0,
        expenses: [],
        home_office_deduction: 0,
        vehicle_expense_method: "none",
        source_document_ids: [],
        state_allocations: [],
      },
    ];
    schedule1ClassificationReturn.facts.income.nonemployee_compensation = [
      {
        nec_id: "nec_linked_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099nec_linked_1",
        payer_name: "Client A",
        amount: 5000,
        federal_income_tax_withheld: 0,
        linked_business_id: "biz_nec_1",
        state_local_rows: [],
      },
      {
        nec_id: "nec_unlinked_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099nec_unlinked_1",
        payer_name: "Client B",
        amount: 1200,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
    ];
    schedule1ClassificationReturn.facts.income.miscellaneous_1099_income = [
      {
        misc_income_id: "misc_gambling_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_gambling_1",
        payer_name: "Casino",
        income_category: "wagering",
        amount: 300,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_other_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_other_1",
        payer_name: "Issuer",
        income_category: "other_income",
        amount: 400,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_substitute_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_substitute_1",
        payer_name: "Broker",
        income_category: "substitute_payments",
        amount: 250,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_rent_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_rent_1",
        payer_name: "Tenant",
        income_category: "rents",
        amount: 700,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
    ];

    const result = await Effect.runPromise(
      evaluateTy2025CoreEngine(schedule1ClassificationReturn),
    );

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.schedule1",
      "federal.schedule2",
      "federal.scheduleC",
      "federal.scheduleSE",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 0,
      line8_other_income: 15150,
      line9_total_income: 15150,
      line10_adjustments: 918.42,
      line11_adjusted_gross_income: 14231.58,
      line12_deductions: 15750,
      line15_taxable_income: 0,
      line16_regular_income_tax: 0,
      line23_other_taxes: 1836.84,
      line24_total_tax: 1836.84,
      line33_total_payments: 0,
      line37_amount_owed: 1836.84,
      schedule1_additional_income_total: 15150,
      self_employment_tax: 1836.84,
      self_employment_tax_deduction: 918.42,
      schedule_1_activated: true,
      schedule_2_activated: true,
      schedule_c_activated: true,
      schedule_se_activated: true,
      schedule_b_activated: false,
    });
    expect(result.graph.execution_order).toContain("sch1.line3");
    expect(result.graph.execution_order).toContain("sch1.line8b");
    expect(result.graph.execution_order).toContain("sch1.line8j");
    expect(result.graph.execution_order).toContain("sch1.line8z");
    expect(result.graph.execution_order).toContain("sch1.line9");
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.nonemployee_compensation.schedule_c_mapped",
      severity: "info",
      status: "pass",
      message:
        "1099-NEC amounts tied to an existing or inferred sole Schedule C business were included in business income before self-employment tax was computed.",
      node_ids: ["schc.line31.net_profit", "sch1.line3", "schse.line12"],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.nonemployee_compensation.line8j_review",
      severity: "warning",
      status: "pass",
      message:
        "Unlinked 1099-NEC amounts were routed to Schedule 1 line 8j because the return did not provide a usable Schedule C business link; review whether any should instead belong on Schedule C.",
      node_ids: ["sch1.line8j", "sch1.line9", "sch1.line10", "1040.line8"],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.misc_1099.schedule_e_override_required",
      severity: "warning",
      status: "fail",
      message:
        "Some 1099-MISC rents or royalties could not be tied to a unique Schedule E activity for this return (rents); add federal.misc_1099.overrides entries for those source documents or provide unique matching Schedule E activities before relying on Schedule E totals.",
      node_ids: ["1040.line8"],
    });
  });

  it("routes Schedule E activities through Schedule 1 line 5 and Form 1040 line 8", async () => {
    const scheduleEReturn = structuredClone(sampleReturnTy2025) as any;

    scheduleEReturn.requested_jurisdictions.states = [];
    scheduleEReturn.state_returns = {};
    scheduleEReturn.facts.income.taxable_interest = [];
    scheduleEReturn.facts.income.schedule_e_activities = [
      {
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "Makiki Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Gross rents",
            amount: 12000,
          },
        ],
        expense_items: [
          {
            description: "Operating expenses",
            amount: 4000,
          },
        ],
        source_document_ids: [],
      },
      {
        owner_person_id: "p_taxpayer",
        activity_type: "partnership_k1",
        entity_name: "Island Partners LLC",
        materially_participates: true,
        income_items: [
          {
            description: "Ordinary business income",
            amount: 1500,
          },
        ],
        expense_items: [
          {
            description: "Section 179 carryover",
            amount: 200,
          },
        ],
        source_document_ids: [],
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(scheduleEReturn));

    expect(result.activated_module_ids).toContain("federal.scheduleE");
    expect(result.activated_module_ids).toContain("federal.schedule1");
    expect(result.federal_summary).toMatchObject({
      line8_other_income: 9300,
      line9_total_income: 94300,
      line11_adjusted_gross_income: 94300,
      schedule1_additional_income_total: 9300,
      schedule_e_activity_net_total: 9300,
      schedule_1_activated: true,
      schedule_e_activated: true,
    });
    expect(result.graph.execution_order).toContain("sche.part1.total");
    expect(result.graph.execution_order).toContain("sche.part2.total");
    expect(result.graph.execution_order).toContain("sche.summary.total");
    expect(result.graph.execution_order).toContain("sch1.line5");
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line5",
        value: 9300,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_e.computed",
      severity: "info",
      status: "pass",
      message:
        "Schedule E activities were netted from canonical income and expense items, then rolled into Schedule 1 line 5 and Form 1040 line 8.",
      node_ids: ["sche.summary.total", "sch1.line5", "sch1.line10", "1040.line8"],
    });
  });

  it("fails when Schedule E losses lack upstream limitation inputs", async () => {
    const scheduleELossReturn = structuredClone(sampleReturnTy2025) as any;

    scheduleELossReturn.requested_jurisdictions.states = [];
    scheduleELossReturn.state_returns = {};
    scheduleELossReturn.facts.income.taxable_interest = [];
    scheduleELossReturn.facts.income.schedule_e_activities = [
      {
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "North Shore Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Gross rents",
            amount: 2000,
          },
        ],
        expense_items: [
          {
            description: "Operating expenses",
            amount: 5000,
          },
        ],
        source_document_ids: [],
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(scheduleELossReturn));

    expect(result.federal_summary).toMatchObject({
      line8_other_income: -3000,
      line9_total_income: 82000,
      line11_adjusted_gross_income: 82000,
      schedule1_additional_income_total: -3000,
      schedule_e_activity_net_total: -3000,
      schedule_e_activated: true,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_e.loss_limitation_input_required",
      severity: "warning",
      status: "fail",
      message:
        "At least one Schedule E activity still produced a loss without an explicit limitation override or an explicit allow_reported_net_losses_without_limitation_overrides flag. Supply federal.schedule_e limitation results before relying on Schedule E losses.",
      node_ids: ["sche.summary.total", "sch1.line5", "1040.line8"],
    });
  });

  it("allows reported Schedule E losses when the federal extension explicitly authorizes them", async () => {
    const allowedScheduleELossReturn = structuredClone(sampleReturnTy2025) as any;

    allowedScheduleELossReturn.requested_jurisdictions.states = [];
    allowedScheduleELossReturn.state_returns = {};
    allowedScheduleELossReturn.facts.income.taxable_interest = [];
    allowedScheduleELossReturn.facts.income.schedule_e_activities = [
      {
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "North Shore Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Gross rents",
            amount: 2000,
          },
        ],
        expense_items: [
          {
            description: "Operating expenses",
            amount: 5000,
          },
        ],
        source_document_ids: [],
      },
    ];
    allowedScheduleELossReturn.facts.state_specific_fact_bag = {
      ...allowedScheduleELossReturn.facts.state_specific_fact_bag,
      federal: {
        schedule_e: {
          allow_reported_net_losses_without_limitation_overrides: true,
          limitation_overrides: [],
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(allowedScheduleELossReturn));

    expect(result.federal_summary).toMatchObject({
      line8_other_income: -3000,
      schedule_e_activity_net_total: -3000,
      schedule_e_activated: true,
    });
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.schedule_e.loss_limitation_input_required",
      ),
    ).toBeUndefined();
  });

  it("maps 1099-MISC rents and royalties into a unique Schedule E activity", async () => {
    const mappedMiscScheduleEReturn = structuredClone(sampleReturnTy2025) as any;

    mappedMiscScheduleEReturn.requested_jurisdictions.states = [];
    mappedMiscScheduleEReturn.state_returns = {};
    mappedMiscScheduleEReturn.facts.income.taxable_interest = [];
    mappedMiscScheduleEReturn.facts.income.schedule_e_activities = [
      {
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "Kailua Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Direct rents",
            amount: 2000,
          },
        ],
        expense_items: [
          {
            description: "Operating expenses",
            amount: 500,
          },
        ],
        source_document_ids: [],
      },
      {
        owner_person_id: "p_taxpayer",
        activity_type: "royalty",
        entity_name: "Book Royalty",
        materially_participates: false,
        income_items: [],
        expense_items: [],
        source_document_ids: [],
      },
    ];
    mappedMiscScheduleEReturn.facts.income.miscellaneous_1099_income = [
      {
        misc_income_id: "misc_rent_sched_e_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_sched_e_rent_1",
        payer_name: "Tenant",
        income_category: "rents",
        amount: 700,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_royalty_sched_e_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_sched_e_royalty_1",
        payer_name: "Publisher",
        income_category: "royalties",
        amount: 300,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(mappedMiscScheduleEReturn));

    expect(result.activated_module_ids).toContain("federal.scheduleE");
    expect(result.federal_summary).toMatchObject({
      line8_other_income: 2500,
      line9_total_income: 87500,
      line11_adjusted_gross_income: 87500,
      schedule1_additional_income_total: 2500,
      schedule_e_activity_net_total: 2500,
      schedule_e_investment_income_total: 2500,
      schedule_e_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sche.activity.0.net",
        value: 2200,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sche.activity.1.net",
        value: 300,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.misc_1099.schedule_e_mapped",
      severity: "info",
      status: "pass",
      message:
        "Supported 1099-MISC rents and royalties were auto-linked to a unique Schedule E activity owned by the recipient and included before Schedule 1 line 5 was computed.",
      node_ids: ["sche.summary.total", "sch1.line5", "1040.line8"],
    });
  });

  it("routes ambiguous and unsupported 1099-MISC rows with explicit federal overrides", async () => {
    const misc1099OverrideReturn = structuredClone(sampleReturnTy2025) as any;

    misc1099OverrideReturn.requested_jurisdictions.states = [];
    misc1099OverrideReturn.state_returns = {};
    misc1099OverrideReturn.facts.income.taxable_interest = [];
    misc1099OverrideReturn.facts.income.schedule_e_activities = [
      {
        activity_id: "sched_e_override_target_1",
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "Kailua Rental",
        materially_participates: false,
        income_items: [],
        expense_items: [],
        source_document_ids: [],
      },
      {
        activity_id: "sched_e_override_target_2",
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "Waikiki Rental",
        materially_participates: false,
        income_items: [],
        expense_items: [],
        source_document_ids: [],
      },
    ];
    misc1099OverrideReturn.facts.income.miscellaneous_1099_income = [
      {
        misc_income_id: "misc_override_rent_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_override_rent_1",
        payer_name: "Tenant",
        income_category: "rents",
        amount: 700,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_override_attorney_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_override_attorney_1",
        payer_name: "Law Office",
        income_category: "attorney_fees",
        amount: 300,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
      {
        misc_income_id: "misc_override_medical_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099misc_override_medical_1",
        payer_name: "Insurer",
        income_category: "medical_payments",
        amount: 200,
        federal_income_tax_withheld: 0,
        state_local_rows: [],
      },
    ];
    misc1099OverrideReturn.facts.state_specific_fact_bag = {
      ...misc1099OverrideReturn.facts.state_specific_fact_bag,
      federal: {
        misc_1099: {
          overrides: [
            {
              source_document_id: "doc_1099misc_override_rent_1",
              treatment: "schedule_e_activity",
              activity_id: "sched_e_override_target_2",
            },
            {
              source_document_id: "doc_1099misc_override_attorney_1",
              treatment: "schedule1_line8z",
            },
            {
              source_document_id: "doc_1099misc_override_medical_1",
              treatment: "ignore_non_taxable",
            },
          ],
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(misc1099OverrideReturn));

    expect(result.federal_summary).toMatchObject({
      line8_other_income: 1000,
      schedule_e_activity_net_total: 700,
      schedule_e_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sche.activity.1.net",
        value: 700,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sch1.line8z",
        value: 300,
      }),
    );
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.misc_1099.schedule_e_override_required",
      ),
    ).toBeUndefined();
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.misc_1099.override_required",
      ),
    ).toBeUndefined();
  });

  it("applies Schedule E limitation overrides from the federal extension bag", async () => {
    const scheduleEOverrideReturn = structuredClone(sampleReturnTy2025) as any;

    scheduleEOverrideReturn.requested_jurisdictions.states = [];
    scheduleEOverrideReturn.state_returns = {};
    scheduleEOverrideReturn.facts.income.taxable_interest = [];
    scheduleEOverrideReturn.facts.income.schedule_e_activities = [
      {
        activity_id: "sched_e_loss_1",
        owner_person_id: "p_taxpayer",
        activity_type: "rental_real_estate",
        entity_name: "North Shore Rental",
        materially_participates: false,
        income_items: [
          {
            description: "Gross rents",
            amount: 2000,
          },
        ],
        expense_items: [
          {
            description: "Operating expenses",
            amount: 5000,
          },
        ],
        source_document_ids: [],
      },
    ];
    scheduleEOverrideReturn.facts.state_specific_fact_bag = {
      ...scheduleEOverrideReturn.facts.state_specific_fact_bag,
      federal: {
        schedule_e: {
          limitation_overrides: [
            {
              activity_id: "sched_e_loss_1",
              allowed_net_after_limitations: 0,
            },
          ],
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(scheduleEOverrideReturn));

    expect(result.federal_summary).toMatchObject({
      line8_other_income: 0,
      line9_total_income: 85000,
      line11_adjusted_gross_income: 85000,
      schedule1_additional_income_total: 0,
      schedule_e_activity_net_total: 0,
      schedule_e_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "sche.activity.0.net",
        value: 0,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_e.loss_limitations_overridden",
      severity: "info",
      status: "pass",
      message:
        "Schedule E activity limitation overrides from the federal extension bag were applied before Schedule 1 line 5 and Form 1040 line 8 were computed.",
      node_ids: ["sche.summary.total"],
    });
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.schedule_e.loss_limitation_input_required",
      ),
    ).toBeUndefined();
  });

});
