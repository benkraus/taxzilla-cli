import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildArStateArtifacts } from "./core-engine/states/ar/index";
import { buildStateArtifacts as buildDeStateArtifacts } from "./core-engine/states/de/index";
import { buildStateArtifacts as buildMeStateArtifacts } from "./core-engine/states/me/index";
import { buildStateArtifacts as buildOrStateArtifacts } from "./core-engine/states/or/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("resident state fifth batch builders", () => {
  it("computes Arkansas resident tax with the indexed rate schedule and personal credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildArStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AR", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Arkansas addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Arkansas subtraction", amount: 500 }],
        stateWithholding: 2_500,
      }),
      stateCode: "AR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "AR",
      plugin_manifest_id: getStateManifest("AR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 98_030,
      total_tax: 3_645,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 1_145,
    });
  });

  it("computes Delaware resident tax with standard deduction and personal credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("DE", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Delaware addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Delaware subtraction", amount: 500 }],
        stateWithholding: 3_000,
      }),
      stateCode: "DE",
    });

    expect(artifacts.summary).toEqual({
      state_code: "DE",
      plugin_manifest_id: getStateManifest("DE").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 97_250,
      total_tax: 5_072,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 2_072,
    });
  });

  it("computes Maine resident tax with the 2025 standard deduction table", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        stateAdditions: [{ description: "Maine addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Maine subtraction", amount: 500 }],
        stateWithholding: 4_000,
      }),
      stateCode: "ME",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ME",
      plugin_manifest_id: getStateManifest("ME").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_500,
      taxable_income: 80_450,
      total_tax: 5_258,
      total_payments: 4_000,
      refund_amount: 0,
      amount_owed: 1_258,
    });
  });

  it("computes Oregon resident tax with federal tax subtraction and exemption credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 90_000,
      builder: buildOrStateArtifacts,
      federalSummary: makeFederalSummary({
        line16_regular_income_tax: 5_000,
      }),
      inputReturn: makeReturn("OR", {
        stateAdditions: [{ description: "Oregon addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Oregon subtraction", amount: 500 }],
        stateWithholding: 5_000,
      }),
      stateCode: "OR",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OR",
      plugin_manifest_id: getStateManifest("OR").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 90_500,
      taxable_income: 82_665,
      total_tax: 6_692,
      total_payments: 5_000,
      refund_amount: 0,
      amount_owed: 1_692,
    });
  });
});
