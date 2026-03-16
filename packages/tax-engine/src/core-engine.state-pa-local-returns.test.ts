import { describe, expect, it } from "vitest";

import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";
import { buildStateArtifacts as buildPaStateArtifacts } from "./core-engine/states/pa/index";

describe("Pennsylvania local-return handling", () => {
  it("keeps resident local return payments out of the PA-40 summary", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
        adjustedGrossIncome: 20_000,
        localReturns: [
          {
            jurisdiction_code: "PIT",
            jurisdiction_name: "Pittsburgh",
            resident_status: "resident",
            additions: [{ description: "Local addback", amount: 500 }],
            subtractions: [{ description: "Local subtraction", amount: 200 }],
            credits: [{ description: "Local credit", amount: 75 }],
            payments: [{ description: "Pittsburgh EIT payment", amount: 600 }],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 400,
      }),
      stateCode: "PA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "PA",
      plugin_manifest_id: getStateManifest("PA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 20_000,
      taxable_income: 20_000,
      total_tax: 614,
      total_payments: 400,
      refund_amount: 0,
      amount_owed: 214,
    });
    expect(artifacts.validationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "PA.local_returns_excluded_from_pa40",
          severity: "info",
          status: "pass",
        }),
      ]),
    );
  });

  it("keeps nonresident local return payments out of the PA-40 allocation path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        localReturns: [
          {
            jurisdiction_code: "LST",
            jurisdiction_name: "Allegheny County",
            resident_status: "nonresident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [{ description: "Local EIT payment", amount: 500 }],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 1_000,
      }),
      stateCode: "PA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "PA",
      plugin_manifest_id: getStateManifest("PA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 768,
      total_payments: 1_000,
      refund_amount: 232,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule_id: "PA.nonresident_allocation_applied",
          severity: "info",
          status: "pass",
        }),
        expect.objectContaining({
          rule_id: "PA.local_returns_excluded_from_pa40",
          severity: "info",
          status: "pass",
        }),
      ]),
    );
  });
});
