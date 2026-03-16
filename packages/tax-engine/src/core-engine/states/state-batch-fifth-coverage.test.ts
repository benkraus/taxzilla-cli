import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildArStateArtifacts } from "./ar/index";
import { buildStateArtifacts as buildDeStateArtifacts } from "./de/index";
import { buildStateArtifacts as buildMeStateArtifacts } from "./me/index";
import { buildStateArtifacts as buildOrStateArtifacts } from "./or/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("resident state fifth batch coverage branches", () => {
  it("uses Arkansas deduction and personal credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildArStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AR", {
        stateWithholding: 100,
        pluginFactBag: {
          ar1000f: {
            deduction_amount: 4_000,
            personal_tax_credit_amount: 200,
          },
        },
      }),
      stateCode: "AR",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ar.ar1000f.line27", value: 4_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ar.ar1000f.line7", value: 200 }),
    );
  });

  it("uses Delaware itemized deductions and personal credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 7_500,
      }),
      inputReturn: makeReturn("DE", {
        stateWithholding: 100,
        pluginFactBag: {
          pit_res: {
            personal_credits_amount: 999,
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "DE",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line20", value: 7_500 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line27a", value: 999 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line21", value: 0 }),
    );
  });

  it("uses Delaware additional standard deduction boxes and age-60 personal credits on the official 2025 line path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 35_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("DE", {
        stateWithholding: 100,
        taxpayer: {
          date_of_birth: "1955-01-01",
          is_blind: true,
        },
      }),
      stateCode: "DE",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line21", value: 5_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line27b", value: 110 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitres.line24", value: 1_098 }),
    );
  });

  it("uses Arkansas AR1000NR source overrides and suppresses modification apportionment warnings", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildArStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AR", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 60_000,
          nonresident_source_income: 18_000,
          state_source_income: 18_000,
        },
        pluginFactBag: {
          ar1000nr: {
            arkansas_source_additions_amount: 400,
            arkansas_source_subtractions_amount: 100,
          },
        },
        stateAdditions: [{ description: "Arkansas addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Arkansas subtraction", amount: 500 }],
        stateWithholding: 200,
      }),
      stateCode: "AR",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ar.ar1000nr.line38a", value: 18_300 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AR.line38_modifications_allocated",
    );
  });

  it("uses Delaware PIT-NON source overrides and suppresses modification apportionment warnings", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildDeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("DE", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 60_000,
          nonresident_source_income: 18_000,
          state_source_income: 18_000,
        },
        pluginFactBag: {
          pit_non: {
            delaware_source_additions_amount: 250,
            delaware_source_subtractions_amount: 75,
          },
        },
        stateAdditions: [{ description: "Delaware addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Delaware subtraction", amount: 500 }],
        stateWithholding: 200,
      }),
      stateCode: "DE",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "de.pitnon.line30a", value: 18_175 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "DE.pitnon_modifications_allocated",
    );
  });

  it("applies the Maine deduction and personal exemption phaseouts at higher income", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 400_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        stateWithholding: 100,
      }),
      stateCode: "ME",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "ME.personal_exemption_phaseout_override_missing",
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "me.1040me.line17", value: 0 }),
        expect.objectContaining({ node_id: "me.1040me.line18", value: 2_408 }),
      ]),
    );
  });

  it("respects a Maine personal exemption override even when phaseout thresholds are exceeded", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 400_000,
      builder: buildMeStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ME", {
        stateWithholding: 100,
        pluginFactBag: {
          "1040me": {
            personal_exemption_amount: 0,
          },
        },
      }),
      stateCode: "ME",
    });

    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "me.1040me.line18", value: 0 }),
      ]),
    );
  });

  it("defaults the Oregon federal tax subtraction to zero when no federal tax source is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildOrStateArtifacts,
      inputReturn: makeReturn("OR", {
        stateWithholding: 100,
      }),
      stateCode: "OR",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "OR.federal_tax_subtraction_default_zero",
    );
  });

  it("uses Oregon federal tax liability inputs without requiring a computed federal summary", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildOrStateArtifacts,
      inputReturn: makeReturn("OR", {
        pluginFactBag: {
          or40: {
            federal_tax_liability_amount: 3_000,
          },
        },
        stateWithholding: 100,
      }),
      stateCode: "OR",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "or.or40.line16", value: 3_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "OR.federal_tax_subtraction_default_zero",
    );
  });

  it("caps Oregon federal tax subtraction and phases out exemption credits at higher income", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 150_000,
      builder: buildOrStateArtifacts,
      federalSummary: makeFederalSummary({
        line16_regular_income_tax: 12_000,
      }),
      inputReturn: makeReturn("OR", {
        stateWithholding: 100,
      }),
      stateCode: "OR",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "or.or40.line16", value: 0 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "or.or40.line27", value: 0 }),
    );
  });
});
