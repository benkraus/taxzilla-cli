import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildHiStateArtifacts } from "./core-engine/states/hi/index";
import { buildStateArtifacts as buildNmStateArtifacts } from "./core-engine/states/nm/index";
import { buildStateArtifacts as buildScStateArtifacts } from "./core-engine/states/sc/index";
import { buildStateArtifacts as buildWiStateArtifacts } from "./core-engine/states/wi/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("resident state seventh batch builders", () => {
  it("computes Hawaii resident tax with the N-11 rate schedule and exemption path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("HI", {
        stateAdditions: [{ description: "Hawaii addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Hawaii subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "HI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "HI",
      plugin_manifest_id: getStateManifest("HI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 94_956,
      total_tax: 6_108,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 3_608,
    });
  });

  it("computes New Mexico resident tax with PIT-1 additions and the federal deduction bridge", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNmStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NM", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "New Mexico addback", amount: 1_000 }],
        stateSubtractions: [{ description: "New Mexico subtraction", amount: 500 }],
        stateWithholding: 3_000,
      }),
      stateCode: "NM",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NM",
      plugin_manifest_id: getStateManifest("NM").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 84_750,
      total_tax: 3_873,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 873,
    });
  });

  it("computes South Carolina resident tax from the federal taxable income starting point", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("SC", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "South Carolina addback", amount: 1_000 }],
        stateSubtractions: [{ description: "South Carolina subtraction", amount: 500 }],
        stateWithholding: 2_000,
      }),
      stateCode: "SC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "SC",
      plugin_manifest_id: getStateManifest("SC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_000,
      taxable_income: 70_640,
      total_tax: 3_597,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 1_597,
    });
  });

  it("computes Wisconsin resident tax with the 2025 standard deduction table", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
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
  });
});
