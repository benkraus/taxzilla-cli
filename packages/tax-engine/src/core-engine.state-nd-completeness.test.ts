import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildNdStateArtifacts } from "./core-engine/states/nd/index";
import { buildArtifacts, makeReturn } from "./core-engine.state-test-helpers";

describe("North Dakota state completeness", () => {
  it("uses ND-1 taxable-income overrides and structured ND-1CR claims", async () => {
    const inputReturn = makeReturn("ND", {
      adjustedGrossIncome: 65_000,
      requestedStates: ["ND", "MN"],
      pluginFactBag: {
        nd1: {
          federal_taxable_income_amount: 55_000,
        },
      },
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "ND",
          source_state_code: "MN",
          category: "wages",
          income_amount: 10_000,
          tax_paid: 300,
          creditable_tax: null,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 65_000,
      builder: buildNdStateArtifacts,
      inputReturn,
      stateCode: "ND",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "bridge.nd.starting_point", value: 55_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nd.nd1.line9", value: 168 }),
    );
    expect(artifacts.summary.total_tax).toBe(921);
    expect(
      artifacts.validationResults.map((result: any) => result.rule_id),
    ).not.toContain("ND.federal_taxable_income_estimated_from_agi");
    expect(
      artifacts.validationResults.map((result: any) => result.rule_id),
    ).not.toContain("ND.other_state_credit_review");
  });
});
