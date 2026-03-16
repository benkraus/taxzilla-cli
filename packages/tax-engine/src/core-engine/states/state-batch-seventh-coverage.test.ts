import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildHiStateArtifacts } from "./hi/index";
import { buildStateArtifacts as buildNmStateArtifacts } from "./nm/index";
import { buildStateArtifacts as buildScStateArtifacts } from "./sc/index";
import { buildStateArtifacts as buildWiStateArtifacts } from "./wi/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("resident state seventh batch coverage branches", () => {
  it("limits Hawaii itemized deductions at higher AGI without requiring an override", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 200_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("HI", {
        stateWithholding: 100,
      }),
      stateCode: "HI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line22", value: 11_004 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "HI.itemized_deduction_limited",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "HI.itemized_deduction_override_missing",
    );
  });

  it("computes Hawaii disability exemptions without an explicit override and still honors the override when supplied", async () => {
    const computedArtifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("HI", {
        stateWithholding: 100,
        taxpayer: {
          is_blind: true,
        },
      }),
      stateCode: "HI",
    });
    const overrideArtifacts = await buildArtifacts({
      adjustedGrossIncome: 200_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("HI", {
        stateWithholding: 100,
        taxpayer: {
          is_blind: true,
        },
        pluginFactBag: {
          n11: {
            exemption_amount: 3_000,
            itemized_deduction_amount: 14_000,
          },
        },
      }),
      stateCode: "HI",
    });

    expect(computedArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line25", value: 7_000 }),
    );
    expect(computedArtifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "HI.disability_exemption_applied",
    );
    expect(computedArtifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "HI.disability_exemption_override_missing",
    );
    expect(overrideArtifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "HI.disability_exemption_override_missing",
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line22", value: 14_000 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line25", value: 3_000 }),
    );
  });

  it("computes the New Mexico line 10 SALT addback worksheet and low-income exemption path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNmStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 10_000,
      }),
      inputReturn: makeReturn("NM", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        filingStatus: "head_of_household",
        stateWithholding: 100,
      }),
      stateCode: "NM",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line14", value: 2_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "NM.state_local_tax_addback_override_missing",
    );
  });

  it("uses New Mexico override inputs for the addback, dependent deduction, exemption, and other-state credit", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNmStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 10_000,
      }),
      inputReturn: makeReturn("NM", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        filingStatus: "head_of_household",
        stateWithholding: 100,
        pluginFactBag: {
          pit1: {
            state_local_tax_addback_amount: 2_000,
            certain_dependents_deduction_amount: 4_000,
            low_middle_income_exemption_amount: 5_000,
            other_state_credit_amount: 300,
          },
        },
      }),
      stateCode: "NM",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line10", value: 2_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line13", value: 4_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line14", value: 5_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line22", value: 64 }),
    );
    expect(artifacts.validationResults).toEqual([]);
  });

  it("uses the New Mexico certain-dependent deduction path for married joint returns", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNmStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NM", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        filingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_jointly",
        stateWithholding: 100,
      }),
      stateCode: "NM",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line13", value: 4_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line14", value: 10_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nm.pit1.line18", value: 4 }),
    );
  });

  it("uses the South Carolina lower-income table path below $7,000", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 10_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 5_000,
      }),
      inputReturn: makeReturn("SC", {
        stateWithholding: 100,
      }),
      stateCode: "SC",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "sc.sc1040.line6", value: 44 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "sc.sc1040.line15", value: 44 }),
    );
  });

  it("uses the South Carolina high-income rate schedule and dependent exemption override", async () => {
    const scheduledArtifacts = await buildArtifacts({
      adjustedGrossIncome: 150_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 150_000,
      }),
      inputReturn: makeReturn("SC", {
        stateWithholding: 100,
      }),
      stateCode: "SC",
    });
    const overrideArtifacts = await buildArtifacts({
      adjustedGrossIncome: 150_000,
      builder: buildScStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 150_000,
      }),
      inputReturn: makeReturn("SC", {
        stateWithholding: 100,
        pluginFactBag: {
          sc1040: {
            dependent_exemption_amount: 1_000,
          },
        },
      }),
      stateCode: "SC",
    });

    expect(scheduledArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "sc.sc1040.line6", value: 8_358 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "sc.sc1040.linew", value: 1_000 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "sc.sc1040.line5", value: 149_000 }),
    );
  });

  it("uses the Wisconsin dependent standard-deduction worksheet and senior exemption branch", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
        householdCanBeClaimedAsDependent: true,
        stateWithholding: 100,
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
      }),
      stateCode: "WI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line8", value: 11_076 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line10b", value: 250 }),
    );
  });

  it("computes Wisconsin school property tax credit from the official tables and still honors explicit overrides", async () => {
    const warningReturn = makeReturn("WI", {
      stateWithholding: 100,
    });

    warningReturn.facts.itemized_deductions.real_estate_taxes = 3_000;

    const warningArtifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: warningReturn,
      stateCode: "WI",
    });
    const overrideArtifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildWiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("WI", {
        stateWithholding: 100,
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
        pluginFactBag: {
          form1: {
            additional_child_dependent_care_credit_amount: 60,
            blind_worker_transportation_credit_amount: 70,
            itemized_deduction_credit_amount: 50,
            school_property_tax_credit_amount: 80,
          },
        },
      }),
      stateCode: "WI",
    });

    expect(warningArtifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "WI.school_property_tax_credit_computed_from_tables",
    );
    expect(warningArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line16", value: 300 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line13", value: 50 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line14", value: 60 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line15", value: 70 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line16", value: 80 }),
    );
    expect(overrideArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "wi.form1.line18", value: 839 }),
    );
  });
});
