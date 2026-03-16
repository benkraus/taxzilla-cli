import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildOkStateArtifacts } from "./core-engine/states/ok/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("Oklahoma state completeness", () => {
  it("derives Schedule 511-D itemized deductions from canonical facts without an estimate warning", async () => {
    const inputReturn = makeReturn("OK", {
      adjustedGrossIncome: 60_000,
      pluginFactBag: {
        form511: {
          use_itemized_deductions: true,
        },
      },
      stateWithholding: 100,
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 10_000;
    inputReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = 4_000;
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

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 24_000,
      }),
      inputReturn,
      stateCode: "OK",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line10", value: 20_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.itemized_deduction_estimated",
    );
  });

  it("applies Schedule 511-E and Schedule 511-F proration from structured out-of-state income facts", async () => {
    const inputReturn = makeReturn("OK", {
      adjustedGrossIncome: 80_000,
      dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
      requestedStates: ["OK", "AR"],
      stateWithholding: 100,
    });

    inputReturn.facts.credits.candidate_child_tax_credit_dependent_ids = ["dep-1"];
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [
        {
          state_code: "AR",
          income_class: "business",
          allocation_method: "reported",
          person_id: "taxpayer",
          source_document_id: "k1-1",
          total_amount: 20_000,
          state_source_amount: 20_000,
          resident_period_amount: null,
          nonresident_period_amount: null,
          work_state_code: null,
          locality_code: null,
          duty_days_in_state: null,
          duty_days_everywhere: null,
          entity_name: "Arkansas LLC",
        },
      ],
      withholding: [],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary({
        child_and_dependent_care_credit: 1_000,
        line19_child_tax_credit_or_credit_for_other_dependents: 2_000,
        line28_additional_child_tax_credit: 500,
      }),
      inputReturn,
      stateCode: "OK",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line4", value: 20_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line12", value: 6_263 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line15", value: 150 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.child_related_credit_not_claimed",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.out_of_state_proration_not_modeled",
    );
  });

  it("computes Form 511-TX style credits from structured other-state tax credit claims", async () => {
    const inputReturn = makeReturn("OK", {
      adjustedGrossIncome: 10_000,
      requestedStates: ["OK", "KS"],
      stateWithholding: null as any,
      pluginFactBag: {
        form511: {
          exemption_amount: 0,
          standard_deduction_amount: 0,
        },
      },
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "OK",
          source_state_code: "KS",
          category: "wages",
          income_amount: 5_000,
          tax_paid: 200,
          creditable_tax: null,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 10_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "OK",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ok.form511.line16", value: 144 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.other_state_credit_review",
    );
  });

  it("does not emit blanket multistate warnings when no qualifying proration or credit inputs exist", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OK", {
        requestedStates: ["OK", "TX"],
        stateWithholding: null as any,
      }),
      stateCode: "OK",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.other_state_credit_review",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OK.out_of_state_proration_not_modeled",
    );
  });
});
