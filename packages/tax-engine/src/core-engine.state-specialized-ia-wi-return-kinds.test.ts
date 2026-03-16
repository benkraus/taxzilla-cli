import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildIaStateArtifacts } from "./core-engine/states/ia/index";
import { buildStateArtifacts as buildWiStateArtifacts } from "./core-engine/states/wi/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("specialized Iowa and Wisconsin return-kind flows", () => {
  it("keeps Iowa resident tax on the resident IA 1040 path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("IA", {
        adjustedGrossIncome: 100_000,
        stateAdditions: [{ description: "Iowa addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Iowa subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "IA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IA",
      plugin_manifest_id: getStateManifest("IA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_000,
      taxable_income: 80_500,
      total_tax: 3_019,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 519,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual([]);
  });

  it("computes Iowa part-year resident tax with the IA 126 credit flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("IA", {
        adjustedGrossIncome: 100_000,
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateAdditions: [{ description: "Iowa addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Iowa subtraction", amount: 500 }],
        stateWithholding: 1_200,
      }),
      stateCode: "IA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IA",
      plugin_manifest_id: getStateManifest("IA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 32_200,
      taxable_income: 32_200,
      total_tax: 1_208,
      total_payments: 1_200,
      refund_amount: 0,
      amount_owed: 8,
      allocation_ratio: 0.4,
      resident_taxable_income: 32_200,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "IA.allocation_profile_applied",
        "IA.ia126_credit_applied",
        "IA.ia126_adjustments_allocated",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ia.ia126.line35", value: 32_200 }),
        expect.objectContaining({ node_id: "ia.ia126.line37", value: "0.6000" }),
        expect.objectContaining({ node_id: "ia.ia126.credit", value: 1_811 }),
        expect.objectContaining({ node_id: "ia.ia126.net_tax", value: 1_208 }),
      ]),
    );
  });

  it("computes Iowa nonresident tax with the IA 126 credit flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("IA", {
        adjustedGrossIncome: 100_000,
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateAdditions: [{ description: "Iowa addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Iowa subtraction", amount: 500 }],
        stateWithholding: 900,
      }),
      stateCode: "IA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IA",
      plugin_manifest_id: getStateManifest("IA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 20_125,
      taxable_income: 20_125,
      total_tax: 755,
      total_payments: 900,
      refund_amount: 145,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 20_125,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "IA.allocation_profile_applied",
        "IA.ia126_credit_applied",
        "IA.ia126_adjustments_allocated",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ia.ia126.line35", value: 20_125 }),
        expect.objectContaining({ node_id: "ia.ia126.line37", value: "0.7500" }),
        expect.objectContaining({ node_id: "ia.ia126.credit", value: 2_264 }),
        expect.objectContaining({ node_id: "ia.ia126.net_tax", value: 755 }),
      ]),
    );
  });

  it("keeps Wisconsin resident tax on the resident Form 1 path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
        adjustedGrossIncome: 100_000,
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Wisconsin addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Wisconsin subtraction", amount: 500 }],
        stateWithholding: 3_000,
      }),
      stateCode: "WI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WI",
      plugin_manifest_id: getStateManifest("WI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 94_584,
      total_tax: 4_427,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 1_427,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual([]);
  });

  it("computes Wisconsin part-year resident tax with the Form 1NPR ratio flow", async () => {
    const inputReturn = makeReturn("WI", {
      adjustedGrossIncome: 100_000,
      returnKind: "part_year_resident",
      allocationProfile: {
        everywhere_income: 100_000,
        resident_period_income: 40_000,
        nonresident_source_income: 10_000,
        state_source_income: 50_000,
        apportionment_ratio: 0.5,
      },
      stateWithholding: 1_200,
      pluginFactBag: {
        form1: {
          itemized_deduction_credit_amount: 80,
          blind_worker_transportation_credit_amount: 60,
          school_property_tax_credit_base_amount: 120,
          married_couple_credit_amount: 40,
          tax_paid_to_other_state_credit: 70,
        },
      },
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 3_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "WI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WI",
      plugin_manifest_id: getStateManifest("WI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 47_712,
      total_tax: 1_926,
      total_payments: 1_200,
      refund_amount: 0,
      amount_owed: 726,
      allocation_ratio: 0.5,
      resident_taxable_income: 47_712,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "WI.allocation_profile_applied",
        "WI.form1npr_ratio_applied",
        "WI.form1npr_school_property_credit_prorated",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "wi.form1npr.line30", value: 50_000 }),
        expect.objectContaining({ node_id: "wi.form1npr.line32", value: "0.5000" }),
        expect.objectContaining({ node_id: "wi.form1npr.line39", value: 2_236 }),
        expect.objectContaining({ node_id: "wi.form1npr.line43c", value: 60 }),
        expect.objectContaining({ node_id: "wi.form1npr.line52", value: 1_926 }),
      ]),
    );
  });

  it("computes Wisconsin part-year school property tax credit from the official tables when no override is supplied", async () => {
    const inputReturn = makeReturn("WI", {
      adjustedGrossIncome: 100_000,
      returnKind: "part_year_resident",
      allocationProfile: {
        everywhere_income: 100_000,
        resident_period_income: 40_000,
        nonresident_source_income: 10_000,
        state_source_income: 50_000,
        apportionment_ratio: 0.5,
      },
      stateWithholding: 1_200,
      pluginFactBag: {
        form1: {
          itemized_deduction_credit_amount: 80,
          blind_worker_transportation_credit_amount: 60,
          married_couple_credit_amount: 40,
          tax_paid_to_other_state_credit: 70,
        },
      },
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 3_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "WI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WI",
      plugin_manifest_id: getStateManifest("WI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 47_712,
      total_tax: 1_836,
      total_payments: 1_200,
      refund_amount: 0,
      amount_owed: 636,
      allocation_ratio: 0.5,
      resident_taxable_income: 47_712,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "WI.allocation_profile_applied",
        "WI.form1npr_ratio_applied",
        "WI.form1npr_school_property_credit_computed_from_tables",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "wi.form1npr.line43c", value: 150 }),
        expect.objectContaining({ node_id: "wi.form1npr.line52", value: 1_836 }),
      ]),
    );
  });

  it("computes Wisconsin nonresident tax with the Form 1NPR ratio flow", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
        adjustedGrossIncome: 100_000,
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 800,
        pluginFactBag: {
          form1: {
            itemized_deduction_credit_amount: 50,
            blind_worker_transportation_credit_amount: 40,
            tax_paid_to_other_state_credit: 30,
          },
        },
      }),
      stateCode: "WI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "WI",
      plugin_manifest_id: getStateManifest("WI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_856,
      total_tax: 998,
      total_payments: 800,
      refund_amount: 0,
      amount_owed: 198,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_856,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["WI.allocation_profile_applied", "WI.form1npr_ratio_applied"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "wi.form1npr.line30", value: 25_000 }),
        expect.objectContaining({ node_id: "wi.form1npr.line32", value: "0.2500" }),
        expect.objectContaining({ node_id: "wi.form1npr.line39", value: 1_118 }),
        expect.objectContaining({ node_id: "wi.form1npr.line43c", value: 0 }),
        expect.objectContaining({ node_id: "wi.form1npr.line52", value: 998 }),
      ]),
    );
  });
});
