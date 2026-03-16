import { describe, expect, it } from "vitest";

import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./test-helpers";
import { buildStateArtifacts as buildArStateArtifacts } from "./ar/index";
import { buildStateArtifacts as buildDeStateArtifacts } from "./de/index";

describe("specialized Arkansas and Delaware part-year and nonresident flows", () => {
  it("computes Arkansas part-year resident tax with the AR1000NR line 38 ratio", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildArStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AR", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateAdditions: [{ description: "Arkansas addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Arkansas subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "AR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "AR",
      plugin_manifest_id: getStateManifest("AR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_200,
      taxable_income: 48_966,
      total_tax: 1_821,
      total_payments: 2_500,
      refund_amount: 679,
      amount_owed: 0,
      allocation_ratio: 0.499502,
      resident_taxable_income: 48_966,
      nonresident_source_income: null,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["AR.part_year_allocation_applied", "AR.line38_modifications_allocated"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ar.ar1000nr.line38a", value: 50_200 }),
        expect.objectContaining({ node_id: "ar.ar1000nr.line38c", value: "0.499502" }),
        expect.objectContaining({ node_id: "ar.ar1000nr.line38d", value: 1_821 }),
      ]),
    );
  });

  it("computes Arkansas nonresident tax with the AR1000NR line 38 ratio", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildArStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AR", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateAdditions: [{ description: "Arkansas addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Arkansas subtraction", amount: 500 }],
        stateWithholding: 1_000,
      }),
      stateCode: "AR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "AR",
      plugin_manifest_id: getStateManifest("AR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_125,
      taxable_income: 24_508,
      total_tax: 911,
      total_payments: 1_000,
      refund_amount: 89,
      amount_owed: 0,
      allocation_ratio: 0.25,
      resident_taxable_income: null,
      nonresident_source_income: 24_508,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["AR.nonresident_allocation_applied", "AR.line38_modifications_allocated"]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ar.ar1000nr.line38a", value: 25_125 }),
        expect.objectContaining({ node_id: "ar.ar1000nr.line38c", value: "0.250000" }),
        expect.objectContaining({ node_id: "ar.ar1000nr.line38d", value: 911 }),
      ]),
    );
  });

  it("computes Delaware part-year resident tax with PIT-NON proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("DE", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateAdditions: [{ description: "Delaware addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Delaware subtraction", amount: 500 }],
        stateWithholding: 3_000,
      }),
      stateCode: "DE",
    });

    expect(artifacts.summary).toEqual({
      state_code: "DE",
      plugin_manifest_id: getStateManifest("DE").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_200,
      taxable_income: 48_576,
      total_tax: 2_533,
      total_payments: 3_000,
      refund_amount: 467,
      amount_owed: 0,
      allocation_ratio: 0.4995,
      resident_taxable_income: 48_576,
      nonresident_source_income: null,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "DE.pitnon_part_year_proration_applied",
        "DE.pitnon_modifications_allocated",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "de.pitnon.line30a", value: 50_200 }),
        expect.objectContaining({ node_id: "de.pitnon.line43.decimal", value: "0.4995" }),
        expect.objectContaining({ node_id: "de.pitnon.line48", value: 2_533 }),
      ]),
    );
  });

  it("computes Delaware nonresident tax with PIT-NON proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("DE", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateAdditions: [{ description: "Delaware addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Delaware subtraction", amount: 500 }],
        stateWithholding: 1_500,
      }),
      stateCode: "DE",
    });

    expect(artifacts.summary).toEqual({
      state_code: "DE",
      plugin_manifest_id: getStateManifest("DE").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_125,
      taxable_income: 24_313,
      total_tax: 1_268,
      total_payments: 1_500,
      refund_amount: 232,
      amount_owed: 0,
      allocation_ratio: 0.25,
      resident_taxable_income: null,
      nonresident_source_income: 24_313,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "DE.pitnon_nonresident_proration_applied",
        "DE.pitnon_modifications_allocated",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "de.pitnon.line30a", value: 25_125 }),
        expect.objectContaining({ node_id: "de.pitnon.line43.decimal", value: "0.2500" }),
        expect.objectContaining({ node_id: "de.pitnon.line48", value: 1_268 }),
      ]),
    );
  });
});
