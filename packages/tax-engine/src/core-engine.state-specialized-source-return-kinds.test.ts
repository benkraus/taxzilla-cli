import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildCtStateArtifacts } from "./core-engine/states/ct/index";
import { buildStateArtifacts as buildVaStateArtifacts } from "./core-engine/states/va/index";
import { buildStateArtifacts as buildWvStateArtifacts } from "./core-engine/states/wv/index";

describe("specialized source-based state part-year and nonresident flows", () => {
  it("computes Connecticut part-year resident tax with Schedule CT-1040AW apportionment", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CT", {
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
      stateCode: "CT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CT",
      plugin_manifest_id: getStateManifest("CT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 50_000,
      total_tax: 2_525,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 525,
      allocation_ratio: 0.5,
      resident_taxable_income: 50_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "CT.schedule_ct1040aw_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ct.schedule_ct1040aw.line6", value: 50_000 }),
        expect.objectContaining({ node_id: "ct.schedule_ct1040aw.line9", value: "0.5000" }),
        expect.objectContaining({ node_id: "ct.ct1040.line11", value: 2_525 }),
      ]),
    );
  });

  it("computes Connecticut nonresident tax with Schedule CT-1040AW apportionment", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CT", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "CT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CT",
      plugin_manifest_id: getStateManifest("CT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 1_263,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 263,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "CT.schedule_ct1040aw_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ct.schedule_ct1040aw.line6", value: 25_000 }),
        expect.objectContaining({ node_id: "ct.schedule_ct1040aw.line9", value: "0.2500" }),
        expect.objectContaining({ node_id: "ct.ct1040.line11", value: 1_263 }),
      ]),
    );
  });

  it("computes Virginia part-year resident tax with Form 760PY proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VA", {
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
      stateCode: "VA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VA",
      plugin_manifest_id: getStateManifest("VA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 45_159,
      total_tax: 2_339,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 339,
      allocation_ratio: 0.5,
      resident_taxable_income: 45_159,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "VA.form760py_proration_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "va.form760py.standard_deduction_ratio", value: "0.5000" }),
        expect.objectContaining({ node_id: "va.form760py.exemption_ratio", value: "0.5014" }),
        expect.objectContaining({ node_id: "va.form760.line15", value: 45_159 }),
      ]),
    );
  });

  it("computes Virginia nonresident tax with Form 763 percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VA", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_200,
      }),
      stateCode: "VA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VA",
      plugin_manifest_id: getStateManifest("VA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 22_580,
      taxable_income: 22_580,
      total_tax: 1_041,
      total_payments: 1_200,
      refund_amount: 159,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 22_580,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "VA.form763_nonresident_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "va.form760.line16", value: "0.2500" }),
        expect.objectContaining({ node_id: "va.form763.line17", value: 22_580 }),
        expect.objectContaining({ node_id: "va.form763.line18", value: 1_041 }),
      ]),
    );
  });

  it("computes West Virginia part-year resident tax with IT-140NRC ratio", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
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
      stateCode: "WV",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WV",
      plugin_manifest_id: getStateManifest("WV").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 49_000,
      total_tax: 1_943,
      total_payments: 2_000,
      refund_amount: 57,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 49_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "WV.it140nrc_ratio_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "wv.schedule_a.line2", value: 50_000 }),
        expect.objectContaining({ node_id: "wv.schedule_a.line3", value: "0.5000" }),
        expect.objectContaining({ node_id: "wv.it140.line8", value: 1_943 }),
      ]),
    );
  });

  it("computes West Virginia nonresident tax with IT-140NRC ratio", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWvStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WV", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "WV",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WV",
      plugin_manifest_id: getStateManifest("WV").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 24_500,
      total_tax: 971,
      total_payments: 1_000,
      refund_amount: 29,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 24_500,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "WV.it140nrc_ratio_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "wv.schedule_a.line2", value: 25_000 }),
        expect.objectContaining({ node_id: "wv.schedule_a.line3", value: "0.2500" }),
        expect.objectContaining({ node_id: "wv.it140.line8", value: 971 }),
      ]),
    );
  });
});
