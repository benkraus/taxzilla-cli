import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildCaStateArtifacts } from "./core-engine/states/ca/index";
import { buildStateArtifacts as buildMdStateArtifacts } from "./core-engine/states/md/index";
import { buildStateArtifacts as buildNyStateArtifacts } from "./core-engine/states/ny/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("specialized state part-year and nonresident flows", () => {
  it("computes California part-year resident tax using the 540NR proration flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CA", {
        startingPointStrategy: "federal_agi",
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          state_source_income: 40_000,
          apportionment_ratio: 0.4,
        },
        stateWithholding: 2_000,
      }),
      stateCode: "CA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 40_000,
      taxable_income: 37_718,
      total_tax: 2_021,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 21,
      allocation_ratio: 0.4,
      resident_taxable_income: 37_718,
      return_kind: "part_year_resident",
      starting_point_strategy: "federal_agi",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["CA.allocation_profile_applied", "CA.form540.computed"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ca.form540nr.line32", value: 40_000 }),
        expect.objectContaining({ node_id: "ca.form540nr.line35", value: 37_718 }),
        expect.objectContaining({ node_id: "ca.form540nr.line36", value: "0.0552" }),
        expect.objectContaining({ node_id: "ca.form540nr.line40", value: 2_021 }),
      ]),
    );
  });

  it("computes California nonresident tax using California taxable income and exemption percentages", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CA", {
        startingPointStrategy: "federal_agi",
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "CA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CA",
      plugin_manifest_id: "ca.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_573,
      total_tax: 1_263,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 263,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_573,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "federal_agi",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ca.form540nr.line35", value: 23_573 }),
        expect.objectContaining({ node_id: "ca.form540nr.line38", value: "0.2500" }),
        expect.objectContaining({ node_id: "ca.form540nr.line40", value: 1_263 }),
      ]),
    );
  });

  it("computes New York part-year resident tax with the IT-203 income percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary({
        line4b_taxable_ira_distributions: 0,
      }),
      inputReturn: makeReturn("NY", {
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
      stateCode: "NY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NY",
      plugin_manifest_id: "ny.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 46_000,
      total_tax: 2_476,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 476,
      allocation_ratio: 0.5,
      resident_taxable_income: 46_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "NY.it203.income_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ny.it203.line44", value: 4_952 }),
        expect.objectContaining({ node_id: "ny.it203.line45", value: "0.5000" }),
        expect.objectContaining({ node_id: "ny.it203.line46", value: 2_476 }),
      ]),
    );
  });

  it("computes New York nonresident tax from the full-year base tax instead of taxing apportioned income directly", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary({
        line4b_taxable_ira_distributions: 0,
      }),
      inputReturn: makeReturn("NY", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "NY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NY",
      plugin_manifest_id: "ny.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_000,
      total_tax: 1_238,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 238,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ny.it203.line45", value: "0.2500" }),
        expect.objectContaining({ node_id: "ny.it203.line46", value: 1_238 }),
      ]),
    );
  });

  it("computes Maryland part-year resident tax with a resident local-tax component and nonresident carryover income", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MD", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        localReturns: [
          {
            jurisdiction_code: "510",
            jurisdiction_name: "Baltimore City",
            resident_status: "part_year_resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 3_000,
      }),
      stateCode: "MD",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MD",
      plugin_manifest_id: "md.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 46_725,
      total_tax: 3_568,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 568,
      allocation_ratio: 0.5,
      resident_taxable_income: 46_725,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MD.part_year_proration_applied",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "md.form502.line28", value: 1_406 }),
    );
  });

  it("computes Maryland nonresident tax with the 505NR factor flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MD", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "MD",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MD",
      plugin_manifest_id: "md.ty2025.stub.v1",
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_362,
      total_tax: 1_622,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 622,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_362,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MD.nonresident_factor_applied",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MD.local_tax_rate_minimum_assumed",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "md.form502.line28", value: 526 }),
    );
  });
});
