import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildOhStateArtifacts } from "./core-engine/states/oh/index";

describe("specialized credit-based state part-year and nonresident flows", () => {
  it("computes Ohio part-year resident tax with the IT NRC nonresident-credit flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildOhStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OH", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateWithholding: 2_000,
      }),
      stateCode: "OH",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OH",
      plugin_manifest_id: getStateManifest("OH").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 50_000,
      total_tax: 247,
      total_payments: 2_000,
      refund_amount: 1_753,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 50_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OH.itnrc_nonresident_credit_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "oh.it1040.line11_resident", value: 494 }),
        expect.objectContaining({ node_id: "oh.itnrc.line19", value: "0.5000" }),
        expect.objectContaining({ node_id: "oh.itnrc.line20", value: 247 }),
      ]),
    );
  });

  it("computes Ohio nonresident tax with the IT NRC nonresident-credit flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildOhStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OH", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "OH",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OH",
      plugin_manifest_id: getStateManifest("OH").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 123,
      total_payments: 1_000,
      refund_amount: 877,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OH.itnrc_nonresident_credit_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "oh.it1040.line11_resident", value: 494 }),
        expect.objectContaining({ node_id: "oh.itnrc.line19", value: "0.7500" }),
        expect.objectContaining({ node_id: "oh.itnrc.line20", value: 371 }),
      ]),
    );
  });
});
