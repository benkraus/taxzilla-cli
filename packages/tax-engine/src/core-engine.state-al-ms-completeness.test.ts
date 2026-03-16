import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAlStateArtifacts } from "./core-engine/states/al/index";
import { buildStateArtifacts as buildMsStateArtifacts } from "./core-engine/states/ms/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("state completeness for Alabama and Mississippi", () => {
  it("derives Alabama itemized deductions, computes a worksheet-style federal tax deduction, and applies state-credit claims", async () => {
    const inputReturn = makeReturn("AL", {
      adjustedGrossIncome: 60_000,
      requestedStates: ["AL", "GA"],
      stateWithholding: 100,
      dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
      pluginFactBag: {
        form40: {
          use_itemized_deductions: true,
          federal_form_1040_line22_tax_amount: 5_000,
          federal_form_8960_line17_amount: 100,
        },
      },
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 10_000;
    inputReturn.facts.itemized_deductions.real_estate_taxes = 2_000;
    inputReturn.facts.itemized_deductions.personal_property_taxes = 500;
    inputReturn.facts.itemized_deductions.other_taxes = 300;
    inputReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "1098-1",
        mortgage_interest_received: 4_000,
        points_paid: 0,
        mortgage_insurance_premiums: 0,
        real_estate_taxes_paid: 0,
      },
    ];
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 3_000;
    inputReturn.facts.itemized_deductions.other_itemized_deductions = [
      { description: "misc", amount: 200 },
    ];
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "AL",
          source_state_code: "GA",
          category: "wages",
          income_amount: 15_000,
          tax_paid: 800,
          creditable_tax: null,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "AL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line11", value: 17_600 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line12", value: 5_100 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "al.form40.line18", value: 1_015 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AL.itemized_deduction_defaulted_to_standard",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AL.federal_tax_deduction_default_zero",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AL.other_state_credit_review",
    );
  });

  it("derives Mississippi itemized deductions from Schedule A style facts without estimation warnings", async () => {
    const inputReturn = makeReturn("MS", {
      adjustedGrossIncome: 50_000,
      stateWithholding: 100,
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 5_000;
    inputReturn.facts.itemized_deductions.real_estate_taxes = 2_000;
    inputReturn.facts.itemized_deductions.personal_property_taxes = 400;
    inputReturn.facts.itemized_deductions.other_taxes = 300;
    inputReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "1098-1",
        mortgage_interest_received: 4_500,
        points_paid: 0,
        mortgage_insurance_premiums: 0,
        real_estate_taxes_paid: 0,
      },
    ];
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 6_000;
    inputReturn.facts.itemized_deductions.casualty_and_theft_losses = 800;
    inputReturn.facts.itemized_deductions.other_itemized_deductions = [
      { description: "misc", amount: 700 },
    ];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      inputReturn,
      stateCode: "MS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ms.form80105.line5", value: 15_950 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MS.itemized_deduction_derived_from_federal_itemized_total",
    );
  });
});
