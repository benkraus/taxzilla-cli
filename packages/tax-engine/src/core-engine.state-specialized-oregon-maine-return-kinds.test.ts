import { describe, expect, it } from "vitest";

import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildMeStateArtifacts } from "./core-engine/states/me/index";
import { buildStateArtifacts as buildOrStateArtifacts } from "./core-engine/states/or/index";

describe("specialized Oregon and Maine part-year and nonresident flows", () => {
  it("keeps the Oregon resident flow stable", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 90_000,
      builder: buildOrStateArtifacts,
      federalSummary: makeFederalSummary({
        line16_regular_income_tax: 5_000,
      }),
      inputReturn: makeReturn("OR", {
        stateWithholding: 5_000,
      }),
      stateCode: "OR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OR",
      plugin_manifest_id: getStateManifest("OR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 90_000,
      taxable_income: 82_165,
      total_tax: 6_648,
      total_payments: 5_000,
      refund_amount: 0,
      amount_owed: 1_648,
    });
  });

  it("computes Oregon part-year resident tax with the OR-40-P percentage path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildOrStateArtifacts,
      federalSummary: makeFederalSummary({
        line16_regular_income_tax: 4_000,
      }),
      inputReturn: makeReturn("OR", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateWithholding: 4_000,
      }),
      stateCode: "OR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OR",
      plugin_manifest_id: getStateManifest("OR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 46_583,
      total_tax: 3_806,
      total_payments: 4_000,
      refund_amount: 194,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 46_583,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OR.or40p_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "or.or40np.line35", value: "0.5000" }),
        expect.objectContaining({ node_id: "or.or40p.line43", value: 93_165 }),
        expect.objectContaining({ node_id: "or.or40p.line45", value: 3_934 }),
        expect.objectContaining({ node_id: "or.summary.total_tax", value: 3_806 }),
      ]),
    );
  });

  it("computes Oregon nonresident tax with the OR-40-N percentage path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildOrStateArtifacts,
      federalSummary: makeFederalSummary({
        line16_regular_income_tax: 4_000,
      }),
      inputReturn: makeReturn("OR", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 2_000,
      }),
      stateCode: "OR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OR",
      plugin_manifest_id: getStateManifest("OR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_291,
      total_tax: 1_689,
      total_payments: 2_000,
      refund_amount: 311,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_291,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OR.or40n_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "or.or40np.line35", value: "0.2500" }),
        expect.objectContaining({ node_id: "or.or40n.line45", value: 23_291 }),
        expect.objectContaining({ node_id: "or.or40n.line54", value: 1_689 }),
      ]),
    );
  });

  it("keeps the Maine resident flow stable", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        stateWithholding: 4_000,
      }),
      stateCode: "ME",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ME",
      plugin_manifest_id: getStateManifest("ME").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 79_850,
      total_tax: 5_215,
      total_payments: 4_000,
      refund_amount: 0,
      amount_owed: 1_215,
    });
  });

  it("computes Maine part-year resident tax with Schedule NR nonresident credit reduction", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateWithholding: 3_000,
      }),
      stateCode: "ME",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ME",
      plugin_manifest_id: getStateManifest("ME").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 39_925,
      total_tax: 2_607,
      total_payments: 3_000,
      refund_amount: 393,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 39_925,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "ME.schedule_nr_credit_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "me.schedule_nr.line7", value: "0.5000" }),
        expect.objectContaining({ node_id: "me.1040me.line21", value: 2_608 }),
        expect.objectContaining({ node_id: "me.1040me.line24", value: 2_607 }),
      ]),
    );
  });

  it("computes Maine nonresident tax with Schedule NR nonresident credit reduction", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_500,
      }),
      stateCode: "ME",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ME",
      plugin_manifest_id: getStateManifest("ME").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 19_963,
      total_tax: 1_304,
      total_payments: 1_500,
      refund_amount: 196,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 19_963,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "ME.schedule_nr_credit_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "me.schedule_nr.line7", value: "0.7500" }),
        expect.objectContaining({ node_id: "me.1040me.line21", value: 3_911 }),
        expect.objectContaining({ node_id: "me.1040me.line24", value: 1_304 }),
      ]),
    );
  });
});
