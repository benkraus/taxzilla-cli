import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAzStateArtifacts } from "./core-engine/states/az/index";
import { buildStateArtifacts as buildIdStateArtifacts } from "./core-engine/states/id/index";
import { buildStateArtifacts as buildKsStateArtifacts } from "./core-engine/states/ks/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("state completeness for Arizona, Idaho, and Kansas", () => {
  it("derives Arizona itemized deductions from canonical facts and computes exemptions without an override", async () => {
    const inputReturn = makeReturn("AZ", {
      adjustedGrossIncome: 60_000,
      stateWithholding: 100,
      taxpayer: {
        date_of_birth: "1950-01-01",
        is_blind: true,
      },
      pluginFactBag: {
        form140: {
          other_exemption_count: 1,
          qualifying_parent_grandparent_count: 1,
          use_itemized_deductions: true,
        },
      },
    });

    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 18_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn,
      stateCode: "AZ",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line43", value: 18_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line44", value: 15_900 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.itemized_deduction_override_missing",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.other_exemption_amount_missing",
    );
  });

  it("uses Idaho fact-derived itemized deductions and federal QBI totals without estimation warnings", async () => {
    const inputReturn = makeReturn("ID", {
      adjustedGrossIncome: 80_000,
      filingStatus: "married_filing_jointly",
      spouse: {
        person_id: "spouse",
        date_of_birth: "1991-01-01",
        is_blind: false,
        can_be_claimed_as_dependent: false,
      },
      scheduleCBusinesses: [
        {
          business_id: "biz-1",
          owner_person_id: "taxpayer",
          gross_receipts_or_sales: 20_000,
          returns_and_allowances: 0,
          cost_of_goods_sold: 0,
          other_business_income: 0,
          expenses: [{ amount: 5_000 }],
          home_office_deduction: 0,
        },
      ],
      stateFilingStatus: "married_filing_jointly",
      stateWithholding: 100,
      pluginFactBag: {
        form40: {
          federal_form_1040_line_13a_13b_total: 1_500,
        },
      },
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 7_000;
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 25_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildIdStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      inputReturn,
      stateCode: "ID",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "id.form40.line16", value: 32_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "id.form40.line18", value: 1_500 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "ID.itemized_deduction_derived_from_federal_itemized_total",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "ID.qbi_deduction_default_zero",
    );
  });

  it("computes Kansas itemized deductions from canonical facts and Schedule CR style credits from state facts", async () => {
    const inputReturn = makeReturn("KS", {
      adjustedGrossIncome: 30_000,
      requestedStates: ["KS", "MO"],
      stateFilingStatus: "single",
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 2_000;
    inputReturn.facts.itemized_deductions.personal_property_taxes = 500;
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 3_000;
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "KS",
          source_state_code: "MO",
          category: "wages",
          income_amount: 10_000,
          tax_paid: 300,
          creditable_tax: 250,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildKsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "KS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ks.k40.line4", value: 5_500 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ks.k40.line13", value: 250 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KS.itemized_deduction_defaulted_to_standard",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KS.other_state_credit_review",
    );
  });
});
