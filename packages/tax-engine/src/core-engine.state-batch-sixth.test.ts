import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildCtStateArtifacts } from "./core-engine/states/ct/index";
import { buildStateArtifacts as buildOhStateArtifacts } from "./core-engine/states/oh/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("resident state sixth batch builders", () => {
  it("computes Ohio resident tax with the 2025 line 8 calculation and exemption schedule", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildOhStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OH", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Ohio addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Ohio subtraction", amount: 500 }],
        stateWithholding: 2_000,
      }),
      stateCode: "OH",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OH",
      plugin_manifest_id: getStateManifest("OH").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 100_500,
      total_tax: 2_408,
      total_payments: 2_000,
      refund_amount: 0,
      amount_owed: 408,
    });
  });

  it("computes Connecticut resident tax with the common-path personal exemption phaseout", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CT", {
        stateAdditions: [{ description: "Connecticut addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Connecticut subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "CT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CT",
      plugin_manifest_id: getStateManifest("CT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 100_500,
      total_tax: 5_080,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 2_580,
    });
  });
});
