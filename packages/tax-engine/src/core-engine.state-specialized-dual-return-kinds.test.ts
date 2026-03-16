import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildNjStateArtifacts } from "./core-engine/states/nj/index";

describe("specialized dual-return state part-year and nonresident flows", () => {
  it("computes New Jersey part-year resident tax by aggregating resident and nonresident periods", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNjStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NJ", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        residencyDetermination: {
          resolved_return_kind: "part_year_resident",
          days_in_state: 183,
          days_everywhere: 365,
        },
        stateWithholding: 2_000,
      }),
      stateCode: "NJ",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NJ",
      plugin_manifest_id: getStateManifest("NJ").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 49_000,
      total_tax: 1_102,
      total_payments: 2_000,
      refund_amount: 898,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 39_499,
      nonresident_source_income: 9_501,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NJ.allocation_profile_applied",
        "NJ.part_year_dual_return_aggregation_applied",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "nj.nj1040py.ratio.resident", value: "0.5014" }),
        expect.objectContaining({ node_id: "nj.nj1040py.line42", value: 39_499 }),
        expect.objectContaining({ node_id: "nj.nj1040nr.line41", value: "0.0955" }),
        expect.objectContaining({ node_id: "nj.nj1040nr.line42", value: 402 }),
      ]),
    );
  });

  it("computes New Jersey nonresident tax with the NJ-1040NR income-percentage flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNjStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NJ", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "NJ",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NJ",
      plugin_manifest_id: getStateManifest("NJ").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 24_000,
      total_tax: 1_013,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 13,
      allocation_ratio: 0.25,
      nonresident_source_income: 24_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NJ.allocation_profile_applied",
        "NJ.nj1040nr_income_percentage_applied",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "nj.nj1040nr.line39a", value: 99_000 }),
        expect.objectContaining({ node_id: "nj.nj1040nr.line41", value: "0.2424" }),
        expect.objectContaining({ node_id: "nj.nj1040nr.line42", value: 1_013 }),
      ]),
    );
  });
});
