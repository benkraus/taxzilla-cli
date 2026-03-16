import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildIlStateArtifacts } from "./core-engine/states/il/index";
import { buildStateArtifacts as buildKyStateArtifacts } from "./core-engine/states/ky/index";
import { buildStateArtifacts as buildUtStateArtifacts } from "./core-engine/states/ut/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("Illinois, Kentucky, and Utah state completeness", () => {
  it("lets a dependent Illinois taxpayer keep the personal exemption when base income stays within the official limit", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 2_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IL", {
        householdCanBeClaimedAsDependent: true,
        taxpayer: {
          can_be_claimed_as_dependent: true,
        },
      }),
      stateCode: "IL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "il.il1040.line10", value: 2_850 }),
    );
    expect(artifacts.summary.total_tax).toBe(0);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "IL.dependent_taxpayer_exemption_override_missing",
    );
  });

  it("computes Illinois Schedule CR from structured credit claims", async () => {
    const inputReturn = makeReturn("IL", {
      adjustedGrossIncome: 50_000,
      requestedStates: ["IL", "WI"],
      stateWithholding: 500,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "IL",
          source_state_code: "WI",
          category: "wages",
          income_amount: 10_000,
          tax_paid: 800,
          creditable_tax: null,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "IL",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "il.schedule_cr.line51", value: 467 }),
    );
    expect(artifacts.summary.total_tax).toBe(1_867);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "IL.schedule_cr_credit_review",
    );
  });

  it("computes Kentucky Schedule ITC family-size credit from the 2025 table", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 22_650,
      builder: buildKyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KY", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateWithholding: 100,
      }),
      stateCode: "KY",
    });

    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ky.schedule_itc.line20", value: 2 }),
        expect.objectContaining({ node_id: "ky.form740.line21.percentage", value: "0.8" }),
        expect.objectContaining({ node_id: "ky.form740.line21", value: 620 }),
      ]),
    );
    expect(artifacts.summary.total_tax).toBe(155);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "KY.family_size_tax_credit_computed",
    );
  });

  it("computes Utah credit for tax paid to another state from structured claims", async () => {
    const inputReturn = makeReturn("UT", {
      adjustedGrossIncome: 30_000,
      requestedStates: ["UT", "ID"],
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "UT",
          source_state_code: "ID",
          category: "wages",
          income_amount: 10_000,
          tax_paid: 400,
          creditable_tax: null,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildUtStateArtifacts,
      federalSummary: makeFederalSummary({
        standard_deduction: 15_750,
      }),
      inputReturn,
      stateCode: "UT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ut.tc40a.code17", value: 186 }),
    );
    expect(artifacts.summary.total_tax).toBe(372);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "UT.other_state_credit_applied",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "UT.other_state_credit_review",
    );
  });
});
