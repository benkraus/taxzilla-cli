import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildMtStateArtifacts } from "./core-engine/states/mt/index";
import { buildStateArtifacts as buildWiStateArtifacts } from "./core-engine/states/wi/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("Wisconsin and Montana completeness", () => {
  it("keeps Wisconsin Form 1NPR school property credit at zero when explicit renter or homeowner inputs are zero", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
        adjustedGrossIncome: 100_000,
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        pluginFactBag: {
          form1: {
            property_taxes_paid_amount: 0,
            rent_paid_with_heat_included_amount: 0,
            rent_paid_without_heat_amount: 0,
          },
        },
        returnKind: "part_year_resident",
        stateWithholding: 1_200,
      }),
      stateCode: "WI",
    });

    const ruleIds = artifacts.validationResults.map((result: any) => result.rule_id);

    expect(ruleIds).toEqual(expect.arrayContaining(["WI.allocation_profile_applied", "WI.form1npr_ratio_applied"]));
    expect(ruleIds.some((ruleId: string) => ruleId.includes("school_property"))).toBe(false);
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1npr.line43c", value: 0 }),
    );
  });

  it("uses Montana Form 1040 line 15 inputs directly for Form 2 line 3", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMtStateArtifacts,
      inputReturn: makeReturn("MT", {
        pluginFactBag: {
          form2: {
            federal_form_1040_line15_amount: 22_000,
          },
        },
        stateWithholding: 100,
      }),
      stateCode: "MT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "bridge.mt.starting_point", value: 22_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MT.federal_taxable_income_estimated_from_agi",
    );
  });

  it("uses the AGI-minus-deduction estimate for Montana only when no line 3 source is available", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMtStateArtifacts,
      inputReturn: makeReturn("MT", {
        stateWithholding: 100,
      }),
      stateCode: "MT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "bridge.mt.starting_point", value: 24_250 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MT.federal_taxable_income_estimated_from_agi",
    );
  });
});
