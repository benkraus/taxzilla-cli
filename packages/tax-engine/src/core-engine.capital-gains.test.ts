import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "./index";

describe("evaluateTy2025CoreEngine", () => {
  it("uses the preferential-rate worksheet for qualified dividends and capital gain distributions without activating schedule D", async () => {
    const preferentialRateReturn = structuredClone(sampleReturnTy2025) as any;

    preferentialRateReturn.requested_jurisdictions.states = [];
    preferentialRateReturn.state_returns = {};
    preferentialRateReturn.facts.payments.withholdings = [];
    preferentialRateReturn.facts.income.wages = [
      {
        wage_id: "wage_qdcg_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_qdcg_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 40000,
        federal_income_tax_withheld: 0,
        social_security_wages: 40000,
        social_security_tax_withheld: 2480,
        medicare_wages_and_tips: 40000,
        medicare_tax_withheld: 580,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    preferentialRateReturn.facts.income.taxable_interest = [];
    preferentialRateReturn.facts.income.capital_transactions = [];
    preferentialRateReturn.facts.income.dividends = [
      {
        dividend_id: "div_qdcg_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099div_qdcg_1",
        payer_name: "Example Brokerage",
        ordinary_dividends: 1000,
        qualified_dividends: 1000,
        capital_gain_distributions: 2000,
        federal_income_tax_withheld: 0,
        foreign_tax_paid: 0,
        exempt_interest_dividends: 0,
        state_local_rows: [],
      },
    ];
    preferentialRateReturn.facts.itemized_deductions = {
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

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(preferentialRateReturn));

    expect(result.activated_module_ids).toEqual(["federal.form1040.core", "federal.scheduleB"]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 40000,
      line3a_qualified_dividends: 1000,
      line2b_taxable_interest: 0,
      line3b_ordinary_dividends: 1000,
      line7_capital_gain_or_loss: 2000,
      line8_other_income: 0,
      line9_total_income: 43000,
      line10_adjustments: 0,
      line11_adjusted_gross_income: 43000,
      line12_deductions: 15750,
      line15_taxable_income: 27250,
      line16_regular_income_tax: 2671.5,
      line24_total_tax: 2671.5,
      line33_total_payments: 0,
      line37_amount_owed: 2671.5,
      capital_gain_distributions_total: 2000,
      schedule_b_activated: true,
      schedule_d_activated: false,
      form_8960_activated: false,
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

  it("uses the Schedule D tax worksheet when 1099-DIV special-rate gains are present", async () => {
    const specialRateGainReturn = structuredClone(sampleReturnTy2025) as any;

    specialRateGainReturn.requested_jurisdictions.states = [];
    specialRateGainReturn.state_returns = {};
    specialRateGainReturn.facts.payments.withholdings = [];
    specialRateGainReturn.facts.income.taxable_interest = [];
    specialRateGainReturn.facts.income.capital_transactions = [];
    specialRateGainReturn.facts.income.wages = [
      {
        wage_id: "wage_special_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_special_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 40000,
        federal_income_tax_withheld: 0,
        social_security_wages: 40000,
        social_security_tax_withheld: 2480,
        medicare_wages_and_tips: 40000,
        medicare_tax_withheld: 580,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    specialRateGainReturn.facts.income.dividends = [
      {
        dividend_id: "div_special_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099div_special_1",
        payer_name: "Example Brokerage",
        ordinary_dividends: 1000,
        qualified_dividends: 1000,
        capital_gain_distributions: 4000,
        federal_income_tax_withheld: 0,
        foreign_tax_paid: 0,
        exempt_interest_dividends: 0,
        state_local_rows: [],
      },
    ];
    specialRateGainReturn.source_documents.push({
      document_id: "doc_1099div_special_1",
      document_type: "FORM_1099_DIV",
      tax_year: 2025,
      issuer_name: "Example Brokerage",
      recipient_person_ids: ["p_taxpayer"],
      source_file: {
        file_name: "1099div-special.pdf",
        mime_type: "application/pdf",
        storage_uri: "s3://bucket/1099div-special.pdf",
        uploaded_at: "2026-03-12T10:00:00Z",
        page_count: 1,
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        capture_method: "web_upload",
      },
      parse_status: "reviewed",
      overall_confidence: 0.99,
      extracted_fields: [],
      payload: {
        payer_name: "Example Brokerage",
        ordinary_dividends: 1000,
        qualified_dividends: 1000,
        total_capital_gain_distributions: 4000,
        unrecaptured_section_1250_gain: 1000,
        collectibles_28_percent_gain: 500,
        section_1202_gain: 0,
        state_local_rows: [],
      },
      raw_text_excerpt: "",
      notes: "",
    });

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(specialRateGainReturn));

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.scheduleA",
      "federal.scheduleB",
      "federal.scheduleD",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 40000,
      line3a_qualified_dividends: 1000,
      line3b_ordinary_dividends: 1000,
      line7_capital_gain_or_loss: 4000,
      line9_total_income: 45000,
      line11_adjusted_gross_income: 45000,
      line12_deductions: 15750,
      line15_taxable_income: 29250,
      line16_regular_income_tax: 2851.5,
      line24_total_tax: 2851.5,
      line33_total_payments: 0,
      line37_amount_owed: 2851.5,
      capital_gain_distributions_total: 4000,
      line16_tax_computation_method: "schedule_d_tax_worksheet",
      schedule_d_collectibles_28_percent_gain_total: 500,
      schedule_d_unrecaptured_section_1250_gain_total: 1000,
      schedule_b_activated: true,
      schedule_d_activated: true,
    });
    expect(result.graph.execution_order).toContain("schd.line18");
    expect(result.graph.execution_order).toContain("schd.line19");
    expect(result.graph.execution_order).not.toContain("schd.line21");
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.line16.schedule_d_tax_worksheet",
      severity: "info",
      status: "pass",
      message: "Line 16 was computed with the TY2025 Schedule D Tax Worksheet path.",
      node_ids: ["1040.line3a", "schd.line16", "schd.line18", "schd.line19", "1040.line16"],
    });
  });

  it("caps deductible capital losses on line 7 and surfaces Schedule D carryforward input requirements", async () => {
    const capitalLossReturn = structuredClone(sampleReturnTy2025) as any;

    capitalLossReturn.requested_jurisdictions.states = [];
    capitalLossReturn.state_returns = {};
    capitalLossReturn.facts.payments.withholdings = [];
    capitalLossReturn.facts.income.taxable_interest = [];
    capitalLossReturn.facts.income.dividends = [];
    capitalLossReturn.facts.income.wages = [
      {
        wage_id: "wage_loss_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_loss_1",
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
    capitalLossReturn.facts.income.capital_transactions = [
      {
        capital_transaction_id: "cap_loss_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099b_loss_1",
        asset_description: "Loss sale",
        date_sold: "2025-11-01",
        proceeds: 1000,
        cost_basis: 11000,
        adjustments: 0,
        gain_or_loss: -10000,
        term: "short",
        form_8949_box: "A",
      },
    ];
    capitalLossReturn.elections.capital_loss_carryforward_imported = true;

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(capitalLossReturn));

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.scheduleA",
      "federal.scheduleD",
      "federal.form8949",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 25000,
      line7_capital_gain_or_loss: -3000,
      line9_total_income: 22000,
      line11_adjusted_gross_income: 22000,
      line12_deductions: 15750,
      line15_taxable_income: 6250,
      line16_regular_income_tax: 625,
      line24_total_tax: 625,
      line33_total_payments: 0,
      line37_amount_owed: 625,
      schedule_d_activated: true,
    });
    expect(result.graph.execution_order).toContain("schd.line21");
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_d.capital_loss_limited",
      severity: "info",
      status: "pass",
      message:
        "Schedule D net capital loss exceeded the annual deductible limit, so Form 1040 line 7 was capped and the remaining modeled loss carries forward.",
      node_ids: ["schd.line16", "schd.line21", "1040.line7"],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_d.imported_carryforward_required",
      severity: "warning",
      status: "fail",
      message:
        "Capital loss carryforward import was flagged, but federal.schedule_d must provide both prior-year short-term and long-term carryforward amounts before Schedule D can be treated as complete.",
      node_ids: ["schd.line7", "schd.line15", "schd.line16", "schd.line21", "1040.line7"],
    });
  });

  it("applies imported capital loss carryforwards from the federal extension bag", async () => {
    const carryforwardOnlyReturn = structuredClone(sampleReturnTy2025) as any;

    carryforwardOnlyReturn.requested_jurisdictions.states = [];
    carryforwardOnlyReturn.state_returns = {};
    carryforwardOnlyReturn.facts.payments.withholdings = [];
    carryforwardOnlyReturn.facts.income.taxable_interest = [];
    carryforwardOnlyReturn.facts.income.dividends = [];
    carryforwardOnlyReturn.facts.income.capital_transactions = [];
    carryforwardOnlyReturn.facts.income.wages = [
      {
        wage_id: "wage_carryforward_only_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_carryforward_only_1",
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
    carryforwardOnlyReturn.elections.capital_loss_carryforward_imported = true;
    carryforwardOnlyReturn.facts.state_specific_fact_bag = {
      ...carryforwardOnlyReturn.facts.state_specific_fact_bag,
      federal: {
        schedule_d: {
          prior_year_short_term_capital_loss_carryforward: 1500,
          prior_year_long_term_capital_loss_carryforward: 0,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(carryforwardOnlyReturn));

    expect(result.activated_module_ids).toContain("federal.scheduleD");
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 25000,
      line7_capital_gain_or_loss: -1500,
      line9_total_income: 23500,
      line11_adjusted_gross_income: 23500,
      line15_taxable_income: 7750,
      line16_regular_income_tax: 775,
      line24_total_tax: 775,
      schedule_d_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line7",
        value: -1500,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line15",
        value: 0,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_d.imported_carryforward_computed",
      severity: "warning",
      status: "pass",
      message:
        "Prior-year short-term and long-term capital loss carryforwards from the federal extension bag were applied to Schedule D before Form 1040 line 7 was computed.",
      node_ids: ["schd.line7", "schd.line15", "schd.line16", "schd.line21", "1040.line7"],
    });
  });

  it("applies explicit section 1202 exclusion amounts before the Schedule D worksheet runs", async () => {
    const section1202Return = structuredClone(sampleReturnTy2025) as any;

    section1202Return.requested_jurisdictions.states = [];
    section1202Return.state_returns = {};
    section1202Return.facts.payments.withholdings = [];
    section1202Return.facts.income.taxable_interest = [];
    section1202Return.facts.income.dividends = [];
    section1202Return.facts.income.capital_transactions = [];
    section1202Return.facts.income.wages = [
      {
        wage_id: "wage_section1202_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_section1202_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 40000,
        federal_income_tax_withheld: 0,
        social_security_wages: 40000,
        social_security_tax_withheld: 2480,
        medicare_wages_and_tips: 40000,
        medicare_tax_withheld: 580,
        box12: [],
        box14: [],
        state_local_rows: [],
        is_household_employee: false,
      },
    ];
    section1202Return.source_documents.push({
      document_id: "doc_1099div_section1202_1",
      document_type: "FORM_1099_DIV",
      payload: {
        section_1202_gain: 1000,
      },
    });
    section1202Return.facts.state_specific_fact_bag = {
      ...section1202Return.facts.state_specific_fact_bag,
      federal: {
        schedule_d: {
          section1202_exclusion_amount: 750,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(section1202Return));

    expect(result.activated_module_ids).toContain("federal.scheduleD");
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 40000,
      line7_capital_gain_or_loss: 250,
      line9_total_income: 40250,
      line16_tax_computation_method: "schedule_d_tax_worksheet",
      schedule_d_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.summary.section1202_exclusion",
        value: 750,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line18",
        value: 250,
      }),
    );
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.schedule_d.section1202_exclusion_applied",
      severity: "warning",
      status: "pass",
      message:
        "Section 1202 gain was reduced by the explicit exclusion amount from the federal extension bag before Schedule D and line 16 tax computations ran.",
      node_ids: ["schd.line18", "schd.summary.section1202_exclusion", "1040.line16"],
    });
  });

  it("infers long-term capital gain treatment from acquisition and sale dates", async () => {
    const inferredTermReturn = structuredClone(sampleReturnTy2025) as any;

    inferredTermReturn.requested_jurisdictions.states = [];
    inferredTermReturn.state_returns = {};
    inferredTermReturn.facts.income.taxable_interest = [];
    inferredTermReturn.facts.income.dividends = [];
    inferredTermReturn.facts.income.capital_transactions = [
      {
        capital_transaction_id: "cap_inferred_term_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099b_inferred_term_1",
        asset_description: "Mutual fund sale",
        date_acquired: "2024-01-10",
        date_sold: "2025-06-15",
        proceeds: 6000,
        cost_basis: 1000,
        adjustments: 0,
        gain_or_loss: 5000,
        term: "unknown",
        form_8949_box: "A",
      },
    ];

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(inferredTermReturn));

    expect(result.federal_summary).toMatchObject({
      line7_capital_gain_or_loss: 5000,
      line9_total_income: 90000,
      schedule_d_activated: true,
    });
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line7",
        value: 0,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line15",
        value: 5000,
      }),
    );
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.schedule_d.term_override_required",
      ),
    ).toBeUndefined();
  });

  it("uses reviewed 1099-B payloads to resolve missing capital transaction terms", async () => {
    const sourceDocumentTermReturn = structuredClone(sampleReturnTy2025) as any;

    sourceDocumentTermReturn.requested_jurisdictions.states = [];
    sourceDocumentTermReturn.state_returns = {};
    sourceDocumentTermReturn.facts.income.taxable_interest = [];
    sourceDocumentTermReturn.facts.income.dividends = [];
    sourceDocumentTermReturn.facts.income.capital_transactions = [
      {
        capital_transaction_id: "cap_source_doc_term_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099b_source_doc_term_1",
        asset_description: "Mutual fund sale",
        date_sold: "2025-06-15",
        proceeds: 6000,
        cost_basis: 1000,
        adjustments: 0,
        gain_or_loss: 5000,
        term: "unknown",
        form_8949_box: "A",
      },
    ];
    sourceDocumentTermReturn.source_documents.push({
      document_id: "doc_1099b_source_doc_term_1",
      document_type: "FORM_1099_B",
      payload: {
        transactions: [
          {
            asset_description: "Mutual fund sale",
            date_acquired: "2024-01-10",
            date_sold: "2025-06-15",
            proceeds: 6000,
            term: "long",
            form_8949_box: "A",
          },
        ],
      },
    });

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(sourceDocumentTermReturn));

    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line7",
        value: 0,
      }),
    );
    expect(result.graph.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "schd.line15",
        value: 5000,
      }),
    );
    expect(
      result.graph.validation_results.find(
        (validation) => validation.rule_id === "federal.schedule_d.term_override_required",
      ),
    ).toBeUndefined();
  });

});
