import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildPaStateArtifacts } from "./core-engine/states/pa/index";

describe("specialized Pennsylvania part-year and nonresident flows", () => {
  it("computes Pennsylvania part-year resident tax with allocated Pennsylvania income", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
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
      stateCode: "PA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "PA",
      plugin_manifest_id: getStateManifest("PA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 50_000,
      total_tax: 1_535,
      total_payments: 2_000,
      refund_amount: 465,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 50_000,
      nonresident_source_income: null,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["PA.schedule_gl_allocation_applied"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "pa.schedule_gl.allocation_ratio", value: "0.5000" }),
        expect.objectContaining({ node_id: "pa.pa40.line11", value: 50_000 }),
        expect.objectContaining({ node_id: "pa.pa40.line14", value: 1_535 }),
      ]),
    );
  });

  it("computes Pennsylvania nonresident tax with Pennsylvania-source income only", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "PA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "PA",
      plugin_manifest_id: getStateManifest("PA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 768,
      total_payments: 1_000,
      refund_amount: 232,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["PA.nonresident_allocation_applied"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "pa.schedule_gl.allocation_ratio", value: "0.2500" }),
        expect.objectContaining({ node_id: "pa.pa40.line11", value: 25_000 }),
        expect.objectContaining({ node_id: "pa.pa40.line14", value: 768 }),
      ]),
    );
  });
});
