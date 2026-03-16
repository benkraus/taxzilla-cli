import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./test-helpers";
import { buildStateArtifacts as buildGaStateArtifacts } from "./ga/index";
import { buildStateArtifacts as buildRiStateArtifacts } from "./ri/index";
import { buildStateArtifacts as buildScStateArtifacts } from "./sc/index";

describe("specialized proration state part-year and nonresident flows", () => {
  it("computes Georgia part-year resident tax with Schedule 3 prorated deductions and exemptions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateWithholding: 2_500,
      }),
      stateCode: "GA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "GA",
      plugin_manifest_id: getStateManifest("GA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 42_000,
      total_tax: 2_180,
      total_payments: 2_500,
      refund_amount: 320,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 42_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "GA.schedule3_ratio_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ga.schedule3.line9", value: "0.5000" }),
        expect.objectContaining({ node_id: "ga.schedule3.line13", value: 8_000 }),
        expect.objectContaining({ node_id: "ga.form500.line14", value: 42_000 }),
      ]),
    );
  });

  it("computes Georgia nonresident tax with Schedule 3 prorated deductions and exemptions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_200,
      }),
      stateCode: "GA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "GA",
      plugin_manifest_id: getStateManifest("GA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 21_000,
      total_tax: 1_090,
      total_payments: 1_200,
      refund_amount: 110,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 21_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ga.schedule3.line9", value: "0.2500" }),
        expect.objectContaining({ node_id: "ga.schedule3.line13", value: 4_000 }),
        expect.objectContaining({ node_id: "ga.form500.line14", value: 21_000 }),
      ]),
    );
  });

  it("computes South Carolina part-year resident tax with Schedule NR proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 84_250,
      }),
      inputReturn: makeReturn("SC", {
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
      stateCode: "SC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "SC",
      plugin_manifest_id: getStateManifest("SC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 42_125,
      total_tax: 1_887,
      total_payments: 3_000,
      refund_amount: 1_113,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 42_125,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "SC.schedule_nr_proration_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "sc.schedule_nr.line45", value: "0.5000" }),
        expect.objectContaining({ node_id: "sc.schedule_nr.line47", value: 7_875 }),
        expect.objectContaining({ node_id: "sc.sc1040.line5", value: 42_125 }),
      ]),
    );
  });

  it("computes South Carolina nonresident tax with Schedule NR proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 84_250,
      }),
      inputReturn: makeReturn("SC", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 800,
      }),
      stateCode: "SC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "SC",
      plugin_manifest_id: getStateManifest("SC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 21_062,
      total_tax: 621,
      total_payments: 800,
      refund_amount: 179,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 21_062,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "sc.schedule_nr.line45", value: "0.2500" }),
        expect.objectContaining({ node_id: "sc.schedule_nr.line47", value: 3_938 }),
        expect.objectContaining({ node_id: "sc.sc1040.line5", value: 21_062 }),
      ]),
    );
  });

  it("computes Rhode Island part-year resident tax with Schedule III allocation", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
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
      stateCode: "RI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "RI",
      plugin_manifest_id: getStateManifest("RI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 42_000,
      total_tax: 1_596,
      total_payments: 2_000,
      refund_amount: 404,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 42_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "RI.schedule_iii_allocation_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ri.schedule_iii.line14", value: "0.5000" }),
        expect.objectContaining({ node_id: "ri.schedule_iii.line16", value: 1_596 }),
      ]),
    );
  });

  it("computes Rhode Island nonresident tax with Schedule II allocation", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "RI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "RI",
      plugin_manifest_id: getStateManifest("RI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 21_000,
      total_tax: 798,
      total_payments: 1_000,
      refund_amount: 202,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 21_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "RI.schedule_ii_allocation_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ri.schedule_ii.line13", value: "0.2500" }),
        expect.objectContaining({ node_id: "ri.schedule_ii.line16", value: 798 }),
      ]),
    );
  });
});
