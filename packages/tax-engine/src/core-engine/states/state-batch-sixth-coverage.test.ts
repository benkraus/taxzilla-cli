import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildCtStateArtifacts } from "./ct/index";
import { buildStateArtifacts as buildOhStateArtifacts } from "./oh/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("resident state sixth batch coverage branches", () => {
  it("uses the Ohio business income deduction override and exemption schedule on lower AGI", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildOhStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("OH", {
        stateWithholding: 100,
        pluginFactBag: {
          it1040: {
            business_income_deduction_amount: 50_000,
          },
        },
      }),
      stateCode: "OH",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "oh.it1040.line3", value: 50_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "oh.it1040.line10", value: 2_400 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "oh.it1040.line11", value: 0 }),
    );
  });

  it("uses the Connecticut personal exemption and property tax credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 18_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CT", {
        stateWithholding: 100,
        pluginFactBag: {
          ct1040: {
            personal_exemption_amount: 9_000,
            property_tax_credit_amount: 200,
          },
        },
      }),
      stateCode: "CT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line17", value: 9_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line21", value: 200 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line24", value: 70 }),
    );
  });

  it("computes the Connecticut property tax credit from itemized property taxes without an override", async () => {
    const customReturn = makeReturn("CT", {
      stateWithholding: 100,
    });

    customReturn.facts.itemized_deductions.real_estate_taxes = 5_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "CT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line21", value: 300 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "CT.property_tax_credit_override_missing",
    );
  });

  it("computes the Connecticut default personal exemption estimate on lower AGI", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 18_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("CT", {
        stateWithholding: 100,
      }),
      stateCode: "CT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line17", value: 12_000 }),
    );
  });
});
