import { describe, expect, it } from "vitest";

import { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn } from "./test-helpers";
import { buildStateArtifacts as buildCoStateArtifacts } from "./co/index";
import { buildStateArtifacts as buildInStateArtifacts } from "./in/index";
import { buildStateArtifacts as buildIlStateArtifacts } from "./il/index";
import { buildStateArtifacts as buildKyStateArtifacts } from "./ky/index";
import { buildStateArtifacts as buildMiStateArtifacts } from "./mi/index";
import { buildStateArtifacts as buildNcStateArtifacts } from "./nc/index";
import { buildStateArtifacts as buildUtStateArtifacts } from "./ut/index";

describe("specialized flat-tax state part-year and nonresident flows", () => {
  it("computes Illinois part-year resident tax with the Schedule NR proration flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IL", {
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
      stateCode: "IL",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IL",
      plugin_manifest_id: getStateManifest("IL").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 48_575,
      total_tax: 2_404,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 404,
      allocation_ratio: 0.5,
      resident_taxable_income: 48_575,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "IL.schedule_nr_proration_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "il.schedule_nr.line48", value: "0.5000" }),
        expect.objectContaining({ node_id: "il.schedule_nr.line50", value: 1_425 }),
      ]),
    );
  });

  it("computes Illinois nonresident tax with the Schedule NR proration flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IL", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "IL",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IL",
      plugin_manifest_id: getStateManifest("IL").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 24_287,
      total_tax: 1_202,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 202,
      allocation_ratio: 0.25,
      nonresident_source_income: 24_287,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "il.schedule_nr.line48", value: "0.2500" }),
        expect.objectContaining({ node_id: "il.schedule_nr.line50", value: 713 }),
      ]),
    );
  });

  it("computes Michigan part-year resident tax with the Schedule NR exemption proration flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MI", {
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
      stateCode: "MI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MI",
      plugin_manifest_id: getStateManifest("MI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 47_100,
      total_tax: 2_002,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 2,
      allocation_ratio: 0.5,
      resident_taxable_income: 47_100,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MI.schedule_nr_proration_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "mi.schedule_nr.line18", value: "0.5000" }),
        expect.objectContaining({ node_id: "mi.schedule_nr.line19", value: 2_900 }),
      ]),
    );
  });

  it("computes Michigan nonresident tax with the Schedule NR exemption proration flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MI", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "MI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MI",
      plugin_manifest_id: getStateManifest("MI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_550,
      total_tax: 1_001,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 1,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_550,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "mi.schedule_nr.line18", value: "0.2500" }),
        expect.objectContaining({ node_id: "mi.schedule_nr.line19", value: 1_450 }),
      ]),
    );
  });

  it("computes Indiana part-year resident tax with Schedule D exemption proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildInStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IN", {
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
      stateCode: "IN",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IN",
      plugin_manifest_id: getStateManifest("IN").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 49_500,
      total_tax: 1_485,
      total_payments: 2_000,
      refund_amount: 515,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 49_500,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["IN.schedule_d_proration_applied", "IN.county_tax_default_zero"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "in.schedule_d.line8", value: "0.500" }),
        expect.objectContaining({ node_id: "in.schedule_d.line9", value: 500 }),
      ]),
    );
  });

  it("computes Indiana nonresident tax with Schedule D exemption proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildInStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IN", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "IN",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IN",
      plugin_manifest_id: getStateManifest("IN").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 24_750,
      total_tax: 743,
      total_payments: 1_000,
      refund_amount: 257,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 24_750,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "in.schedule_d.line8", value: "0.250" }),
        expect.objectContaining({ node_id: "in.schedule_d.line9", value: 250 }),
      ]),
    );
  });

  it("warns when Indiana allocated returns provide only a county rate without an allocated county base", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildInStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IN", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        pluginFactBag: {
          it40: {
            county_tax_rate: 0.01,
          },
        },
      }),
      stateCode: "IN",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "IN.county_taxable_income_default_zero",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "in.it40.line9", value: 0 }),
    );
  });

  it("computes Kentucky part-year resident tax with 740-NP percentage-prorated itemized deductions and personal tax credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildKyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KY", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        pluginFactBag: {
          form740: {
            itemized_deductions_total: 10_000,
            personal_tax_credit_amount: 200,
          },
        },
        stateWithholding: 1_800,
      }),
      stateCode: "KY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "KY",
      plugin_manifest_id: getStateManifest("KY").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 45_000,
      total_tax: 1_700,
      total_payments: 1_800,
      refund_amount: 100,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 45_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "KY.section_d_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ky.form740.line7", value: "0.5000" }),
        expect.objectContaining({ node_id: "ky.form740.line12", value: 5_000 }),
        expect.objectContaining({ node_id: "ky.form740.line18", value: 100 }),
      ]),
    );
  });

  it("computes Kentucky nonresident tax with 740-NP percentage-prorated itemized deductions and personal tax credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildKyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KY", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        pluginFactBag: {
          form740: {
            itemized_deductions_total: 10_000,
            personal_tax_credit_amount: 200,
          },
        },
        stateWithholding: 1_000,
      }),
      stateCode: "KY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "KY",
      plugin_manifest_id: getStateManifest("KY").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 22_500,
      total_tax: 850,
      total_payments: 1_000,
      refund_amount: 150,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 22_500,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ky.form740.line7", value: "0.2500" }),
        expect.objectContaining({ node_id: "ky.form740.line12", value: 2_500 }),
        expect.objectContaining({ node_id: "ky.form740.line18", value: 50 }),
      ]),
    );
  });

  it("computes North Carolina part-year resident tax with the Schedule PN full-year taxable-income percentage flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNcStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NC", {
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
      stateCode: "NC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NC",
      plugin_manifest_id: getStateManifest("NC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 43_625,
      total_tax: 1_854,
      total_payments: 2_000,
      refund_amount: 146,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 43_625,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "NC.schedule_pn_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "nc.d400.line12b", value: 87_250 }),
        expect.objectContaining({ node_id: "nc.d400.line13", value: "0.5000" }),
        expect.objectContaining({ node_id: "nc.d400.line14", value: 43_625 }),
      ]),
    );
  });

  it("computes North Carolina nonresident tax with the Schedule PN full-year taxable-income percentage flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNcStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NC", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "NC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NC",
      plugin_manifest_id: getStateManifest("NC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 21_813,
      total_tax: 927,
      total_payments: 1_000,
      refund_amount: 73,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 21_813,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "nc.d400.line12b", value: 87_250 }),
        expect.objectContaining({ node_id: "nc.d400.line13", value: "0.2500" }),
        expect.objectContaining({ node_id: "nc.d400.line14", value: 21_813 }),
      ]),
    );
  });

  it("computes Colorado part-year resident tax with the Form 104PN modified-AGI apportionment percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCoStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 84_250,
      }),
      inputReturn: makeReturn("CO", {
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
      stateCode: "CO",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CO",
      plugin_manifest_id: getStateManifest("CO").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 42_125,
      total_tax: 1_854,
      total_payments: 2_000,
      refund_amount: 146,
      amount_owed: 0,
      allocation_ratio: 0.5,
      resident_taxable_income: 42_125,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "CO.form104pn_percentage_applied",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "co.dr0104pn.modified_federal_agi", value: 100_000 }),
        expect.objectContaining({ node_id: "co.dr0104pn.modified_colorado_agi", value: 50_000 }),
        expect.objectContaining({ node_id: "co.dr0104pn.percentage", value: "0.5000" }),
        expect.objectContaining({ node_id: "co.dr0104pn.apportioned_tax", value: 1_854 }),
      ]),
    );
  });

  it("computes Colorado nonresident tax with the Form 104PN modified-AGI apportionment percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCoStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 84_250,
      }),
      inputReturn: makeReturn("CO", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "CO",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CO",
      plugin_manifest_id: getStateManifest("CO").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 21_063,
      total_tax: 927,
      total_payments: 1_000,
      refund_amount: 73,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 21_063,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "co.dr0104pn.modified_federal_agi", value: 100_000 }),
        expect.objectContaining({ node_id: "co.dr0104pn.modified_colorado_agi", value: 25_000 }),
        expect.objectContaining({ node_id: "co.dr0104pn.percentage", value: "0.2500" }),
        expect.objectContaining({ node_id: "co.dr0104pn.apportioned_tax", value: 927 }),
      ]),
    );
  });

  it("computes Utah part-year resident tax with the TC-40B income percentage flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildUtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("UT", {
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
      stateCode: "UT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "UT",
      plugin_manifest_id: getStateManifest("UT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 50_000,
      total_tax: 2_250,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 250,
      allocation_ratio: 0.5,
      resident_taxable_income: 50_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "UT.tc40b_income_percentage_applied",
        "UT.tc40b_credit_classification_assumed",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ut.tc40b.line39", value: "0.5000" }),
        expect.objectContaining({ node_id: "ut.tc40b.line40", value: 4_500 }),
        expect.objectContaining({ node_id: "ut.tc40b.line41", value: 2_250 }),
      ]),
    );
  });

  it("computes Utah nonresident tax with the TC-40B income percentage flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildUtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("UT", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_000,
      }),
      stateCode: "UT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "UT",
      plugin_manifest_id: getStateManifest("UT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 1_125,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 125,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ut.tc40b.line39", value: "0.2500" }),
        expect.objectContaining({ node_id: "ut.tc40b.line41", value: 1_125 }),
      ]),
    );
  });
});
