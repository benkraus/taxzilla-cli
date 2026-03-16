import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { evaluateTy2025CoreEngine, sampleReturnTy2025 } from "./index";

describe("evaluateTy2025CoreEngine", () => {
  it("rolls retirement income, unemployment compensation, and Social Security benefits into the TY2025 1040 flow", async () => {
    const benefitsReturn = structuredClone(sampleReturnTy2025) as any;

    benefitsReturn.requested_jurisdictions.states = [];
    benefitsReturn.state_returns = {};
    benefitsReturn.facts.payments.withholdings = [];
    benefitsReturn.facts.income.wages = [
      {
        wage_id: "wage_benefits_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_benefits_1",
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
    benefitsReturn.facts.income.taxable_interest = [
      {
        interest_id: "int_benefits_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099int_benefits_1",
        payer_name: "City Bank",
        interest_income: 200,
        tax_exempt_interest: 500,
        us_savings_bonds_and_treasury_interest: 0,
        federal_income_tax_withheld: 0,
        foreign_tax_paid: 0,
        state_local_rows: [],
      },
    ];
    benefitsReturn.facts.income.dividends = [];
    benefitsReturn.facts.income.capital_transactions = [];
    benefitsReturn.facts.income.other_income_items = [];
    benefitsReturn.facts.income.schedule_c_businesses = [];
    benefitsReturn.facts.income.retirement_distributions = [
      {
        distribution_id: "ret_benefits_ira_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099r_benefits_ira_1",
        payer_name: "Example IRA Custodian",
        gross_distribution: 4000,
        taxable_amount: 4000,
        federal_income_tax_withheld: 0,
        distribution_codes: ["7"],
        ira_sep_simple: true,
        state_local_rows: [],
      },
      {
        distribution_id: "ret_benefits_pension_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099r_benefits_pension_1",
        payer_name: "Example Pension Trust",
        gross_distribution: 6000,
        taxable_amount: null,
        federal_income_tax_withheld: 0,
        distribution_codes: ["7"],
        ira_sep_simple: false,
        state_local_rows: [],
      },
    ];
    benefitsReturn.facts.income.unemployment_compensation = [
      {
        unemployment_id: "unemp_benefits_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_1099g_benefits_1",
        payer_name: "State Department of Labor",
        unemployment_compensation: 2500,
        federal_income_tax_withheld: 0,
        state_code: "CA",
      },
    ];
    benefitsReturn.facts.income.social_security_benefits = [
      {
        social_security_id: "ssa_benefits_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_ssa1099_benefits_1",
        benefits_paid: 12000,
        benefits_repaid: 0,
        net_benefits: 12000,
        medicare_part_b_premiums: 0,
        medicare_part_d_premiums: 0,
      },
    ];
    benefitsReturn.facts.adjustments.health_savings_account_deduction = 1000;
    benefitsReturn.facts.adjustments.student_loan_interest_deduction = 600;
    benefitsReturn.facts.itemized_deductions = {
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
    benefitsReturn.source_documents.push({
      document_id: "doc_1099r_benefits_pension_1",
      document_type: "FORM_1099_R",
      tax_year: 2025,
      issuer_name: "Example Pension Trust",
      recipient_person_ids: ["p_taxpayer"],
      source_file: {
        file_name: "1099r-benefits-pension.pdf",
        mime_type: "application/pdf",
        storage_uri: "s3://bucket/1099r-benefits-pension.pdf",
        uploaded_at: "2026-03-13T10:00:00Z",
        page_count: 1,
        sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        capture_method: "web_upload",
      },
      parse_status: "reviewed",
      overall_confidence: 0.99,
      extracted_fields: [],
      payload: {
        payer_name: "Example Pension Trust",
        gross_distribution: 6000,
        taxable_amount: null,
        taxable_amount_not_determined: true,
        total_distribution: true,
        federal_income_tax_withheld: 0,
        distribution_code_1: "7",
        ira_sep_simple: false,
        state_local_rows: [],
      },
      raw_text_excerpt: "",
      notes: "",
    });

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(benefitsReturn));

    expect(result.activated_module_ids).toEqual([
      "federal.form1040.core",
      "federal.schedule1",
      "federal.scheduleB",
      "federal.form8889",
    ]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 30000,
      line2a_tax_exempt_interest: 500,
      line2b_taxable_interest: 200,
      line4a_ira_distributions: 4000,
      line4b_taxable_ira_distributions: 4000,
      line5a_pensions_and_annuities: 6000,
      line5b_taxable_pensions_and_annuities: 6000,
      line6a_social_security_benefits: 12000,
      line6b_taxable_social_security_benefits: 10200,
      line8_other_income: 2500,
      line9_total_income: 52900,
      line10_adjustments: 1600,
      line11_adjusted_gross_income: 51300,
      line12_deductions: 15750,
      line15_taxable_income: 35550,
      line16_regular_income_tax: 4027.5,
      line24_total_tax: 4027.5,
      line33_total_payments: 0,
      line37_amount_owed: 4027.5,
      tax_exempt_interest_total: 500,
      unemployment_compensation_total: 2500,
      schedule_1_activated: true,
      schedule_b_activated: true,
      schedule_a_activated: false,
      schedule_2_activated: false,
    });
    expect(result.graph.execution_order).toContain("sch1.line7");
    expect(result.graph.execution_order).toContain("1040.line2a");
    expect(result.graph.execution_order).toContain("1040.line4b");
    expect(result.graph.execution_order).toContain("1040.line6b");
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.retirement_distributions.taxable_amount_assumed",
      severity: "warning",
      status: "pass",
      message:
        "At least one retirement distribution did not include an explicit taxable amount, so the engine treated the gross distribution as taxable unless a non-taxable rollover code was present.",
      node_ids: ["1040.line4b", "1040.line5b"],
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.social_security_benefits.computed",
      severity: "info",
      status: "pass",
      message:
        "Social Security benefits were evaluated with the TY2025 worksheet path and rolled into Form 1040 lines 6a and 6b.",
      node_ids: ["1040.line2a", "1040.line6a", "1040.line6b"],
    });
  });

  it("uses the married filing separately Social Security lived-apart exception when supplied", async () => {
    const mfsSocialSecurityReturn = structuredClone(sampleReturnTy2025) as any;

    mfsSocialSecurityReturn.requested_jurisdictions.states = [];
    mfsSocialSecurityReturn.state_returns = {};
    mfsSocialSecurityReturn.household.filing_status = "married_filing_separately";
    mfsSocialSecurityReturn.household.spouse = {
      person_id: "p_spouse_ssa_mfs_1",
      name: {
        first: "Taylor",
        last: "Rivera",
        full_legal_name: "Taylor Rivera",
      },
    };
    mfsSocialSecurityReturn.facts.payments.withholdings = [];
    mfsSocialSecurityReturn.facts.income.wages = [];
    mfsSocialSecurityReturn.facts.income.taxable_interest = [];
    mfsSocialSecurityReturn.facts.income.dividends = [];
    mfsSocialSecurityReturn.facts.income.capital_transactions = [];
    mfsSocialSecurityReturn.facts.income.retirement_distributions = [];
    mfsSocialSecurityReturn.facts.income.unemployment_compensation = [];
    mfsSocialSecurityReturn.facts.income.other_income_items = [];
    mfsSocialSecurityReturn.facts.income.social_security_benefits = [
      {
        social_security_id: "ssa_mfs_exception_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_ssa_mfs_exception_1",
        benefits_paid: 12000,
        benefits_repaid: 0,
        net_benefits: 12000,
        medicare_part_b_premiums: 0,
        medicare_part_d_premiums: 0,
      },
    ];
    mfsSocialSecurityReturn.facts.state_specific_fact_bag = {
      ...mfsSocialSecurityReturn.facts.state_specific_fact_bag,
      federal: {
        social_security: {
          allow_married_filing_separately_lived_apart_exception: true,
        },
      },
    };

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(mfsSocialSecurityReturn));

    expect(result.federal_summary).toMatchObject({
      line6a_social_security_benefits: 12000,
      line6b_taxable_social_security_benefits: 0,
      line9_total_income: 0,
      line16_regular_income_tax: 0,
      line24_total_tax: 0,
      line37_amount_owed: 0,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.social_security_benefits.mfs_exception_applied",
      severity: "info",
      status: "pass",
      message:
        "Married filing separately Social Security benefits used the lived-apart exception flag from the federal extension bag, so the non-zero base-threshold worksheet path was applied.",
      node_ids: ["1040.line6a", "1040.line6b"],
    });
  });

  it("falls back to documented federal withholding when the payments block has no federal rows", async () => {
    const withholdingReturn = structuredClone(sampleReturnTy2025) as any;

    withholdingReturn.requested_jurisdictions.states = [];
    withholdingReturn.state_returns = {};
    withholdingReturn.facts.payments.withholdings = [];
    withholdingReturn.facts.income.wages = [
      {
        wage_id: "wage_withholding_fallback_1",
        person_id: "p_taxpayer",
        source_document_id: "doc_w2_withholding_fallback_1",
        employer_name: "Acme Inc.",
        employer_ein: "12-3456789",
        wages_tips_other_compensation: 40000,
        federal_income_tax_withheld: 1200,
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
    withholdingReturn.facts.income.taxable_interest = [];
    withholdingReturn.facts.income.dividends = [];
    withholdingReturn.facts.income.capital_transactions = [];
    withholdingReturn.facts.income.retirement_distributions = [];
    withholdingReturn.facts.income.unemployment_compensation = [];
    withholdingReturn.facts.income.social_security_benefits = [];
    withholdingReturn.facts.income.other_income_items = [];
    withholdingReturn.facts.income.schedule_c_businesses = [];
    withholdingReturn.facts.itemized_deductions = {
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

    const result = await Effect.runPromise(evaluateTy2025CoreEngine(withholdingReturn));

    expect(result.activated_module_ids).toEqual(["federal.form1040.core"]);
    expect(result.federal_summary).toMatchObject({
      line1a_wages: 40000,
      line16_regular_income_tax: 2671.5,
      line24_total_tax: 2671.5,
      line25d_federal_withholding: 1200,
      line33_total_payments: 1200,
      line37_amount_owed: 1471.5,
      federal_withholding: 1200,
      schedule_a_activated: false,
      schedule_1_activated: false,
      schedule_b_activated: false,
    });
    expect(result.graph.validation_results).toContainEqual({
      rule_id: "federal.withholding.document_fallback",
      severity: "info",
      status: "pass",
      message:
        "Line 25d used documented federal withholding from income facts because the canonical payments.withholdings array did not include federal rows.",
      node_ids: ["1040.line25d"],
    });
  });

});
