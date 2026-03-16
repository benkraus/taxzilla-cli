import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAlStateArtifacts } from "./core-engine/states/al/index";
import { buildStateArtifacts as buildNdStateArtifacts } from "./core-engine/states/nd/index";
import { buildStateArtifacts as buildOkStateArtifacts } from "./core-engine/states/ok/index";
import { buildStateArtifacts as buildRiStateArtifacts } from "./core-engine/states/ri/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./core-engine.state-test-helpers";

describe("resident state fourth batch builders", () => {
  it("computes Alabama resident tax with the common deduction path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        line24_total_tax: 2_000,
      }),
      inputReturn: makeReturn("AL", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateWithholding: 1_700,
      }),
      stateCode: "AL",
    });

    expect(artifacts.summary).toEqual({
      state_code: "AL",
      plugin_manifest_id: getStateManifest("AL").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 40_000,
      taxable_income: 33_000,
      total_tax: 1_610,
      total_payments: 1_700,
      refund_amount: 90,
      amount_owed: 0,
    });
  });

  it("flags Alabama multistate credit review when other-state facts exist without a claim amount", async () => {
    const inputReturn = makeReturn("AL", {
      pluginFactBag: {
        form40: {
          use_itemized_deductions: true,
        },
      },
      requestedStates: ["AL", "GA"],
      stateWithholding: 500,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "GA",
          tax_type: "withholding",
          amount: 200,
          person_id: "taxpayer",
          local_jurisdiction_code: null,
          source_document_id: "w2-1",
          payer_state_code: "GA",
          work_state_code: "GA",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAlStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 15_000,
      }),
      inputReturn,
      stateCode: "AL",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "AL.other_state_credit_review",
    );
  });

  it("computes North Dakota resident tax from federal taxable income and adjustments", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 65_000,
      builder: buildNdStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 60_000,
      }),
      inputReturn: makeReturn("ND", {
        stateAdditions: [{ description: "North Dakota addback", amount: 500 }],
        stateSubtractions: [{ description: "North Dakota subtraction", amount: 100 }],
        stateWithholding: 1_000,
      }),
      stateCode: "ND",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ND",
      plugin_manifest_id: getStateManifest("ND").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 60_000,
      taxable_income: 60_400,
      total_tax: 1_208,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 208,
    });
  });

  it("computes Oklahoma resident tax on the common path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 120_000,
      builder: buildOkStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OK", {
        stateWithholding: 5_000,
      }),
      stateCode: "OK",
    });

    expect(artifacts.summary).toEqual({
      state_code: "OK",
      plugin_manifest_id: getStateManifest("OK").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 120_000,
      taxable_income: 112_650,
      total_tax: 5_162,
      total_payments: 5_000,
      refund_amount: 0,
      amount_owed: 162,
    });
  });

  it("computes Rhode Island resident tax with modifications and exemptions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("RI", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateAdditions: [{ description: "RI addition", amount: 1_000 }],
        stateSubtractions: [{ description: "RI subtraction", amount: 200 }],
        stateWithholding: 3_000,
      }),
      stateCode: "RI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "RI",
      plugin_manifest_id: getStateManifest("RI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 79_700,
      total_tax: 2_989,
      total_payments: 3_000,
      refund_amount: 11,
      amount_owed: 0,
    });
  });

  it("applies Rhode Island high-income phaseouts and flags only unresolved multistate credit review", async () => {
    const inputReturn = makeReturn("RI", {
      requestedStates: ["RI", "MA"],
      stateWithholding: 10_000,
    });
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "MA",
          tax_type: "withholding",
          amount: 750,
          person_id: "taxpayer",
          local_jurisdiction_code: null,
          source_document_id: "w2-1",
          payer_state_code: "MA",
          work_state_code: "MA",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 300_000,
      builder: buildRiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "RI",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "RI.deduction_and_exemption_phaseout_applied",
        "RI.other_state_credit_review",
      ]),
    );
  });
});
