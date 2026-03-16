import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildNmStateArtifacts } from "./core-engine/states/nm/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("New Mexico state completeness", () => {
  it("computes the PIT-1 line 10 state and local tax addback from the current worksheet", async () => {
    const inputReturn = makeReturn("NM", {
      saltDeduction: 6_000,
      stateWithholding: 0,
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 4_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNmStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 18_000,
        standard_deduction: 15_750,
      }),
      inputReturn,
      stateCode: "NM",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NM",
      plugin_manifest_id: getStateManifest("NM").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 84_250,
      total_tax: 3_849,
      total_payments: 0,
      refund_amount: 0,
      amount_owed: 3_849,
    });
    expect(
      artifacts.nodes.find((node: any) => node.node_id === "nm.pit1.line10")?.value,
    ).toBe(2_250);
    expect(
      artifacts.validationResults.some(
        (result: any) => result.rule_id === "NM.state_local_tax_addback_override_missing",
      ),
    ).toBe(false);
  });
});
