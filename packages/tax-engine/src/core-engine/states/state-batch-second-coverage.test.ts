import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAzStateArtifacts } from "./az/index";
import { buildStateArtifacts as buildIaStateArtifacts } from "./ia/index";
import { buildStateArtifacts as buildIdStateArtifacts } from "./id/index";
import { buildStateArtifacts as buildLaStateArtifacts } from "./la/index";
import { buildStateArtifacts as buildMsStateArtifacts } from "./ms/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("resident state second batch coverage branches", () => {
  it("falls back cleanly when Arizona charitable contribution inputs are null", async () => {
    const customReturn = makeReturn("AZ", {
      stateWithholding: 100,
      pluginFactBag: {
        form140: {
          force_standard_deduction: true,
        },
      },
    });

    customReturn.facts.itemized_deductions.charitable_cash_contributions = null;
    customReturn.facts.itemized_deductions.charitable_noncash_contributions = null;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "AZ",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line43", value: 15_750 }),
    );
  });

  it("computes the Iowa other-state credit from a structured resident claim", async () => {
    const inputReturn = makeReturn("IA", {
      requestedStates: ["IA", "IL"],
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "IA",
          source_state_code: "IL",
          category: "wages",
          income_amount: 5_000,
          tax_paid: 250,
          creditable_tax: 180,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 25_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 20_000,
      }),
      inputReturn,
      stateCode: "IA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ia.ia1040.line10", value: 540 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "IA.other_state_credit_review",
    );
  });

  it("treats missing Idaho SALT detail as zero in the itemized-deduction estimate", async () => {
    const customReturn = makeReturn("ID", {
      stateWithholding: 100,
    });

    customReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = null;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildIdStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 25_000,
      }),
      inputReturn: customReturn,
      stateCode: "ID",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "id.form40.line16", value: 25_000 }),
    );
  });

  it("does not emit a Louisiana senior warning on the 2025 resident path", async () => {
    const customReturn = makeReturn("LA", {
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
      taxpayer: {
        date_of_birth: "1950-01-01",
      },
    });

    customReturn.facts.income.social_security_benefits = [
      {
        source_document_id: "ssa-1",
        benefits_paid: 6_000,
      },
    ];
    customReturn.state_returns.LA.plugin_fact_bag = {
      it540: {
        retirement_income_exclusion_amount: 5_000,
        subtractions: [{ amount: 6_000 }],
      },
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "LA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.senior_standard_deduction_override_missing",
    );
  });

  it("treats missing Louisiana retirement and Social Security amounts as zero", async () => {
    const customReturn = makeReturn("LA", {
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
    });

    customReturn.facts.income.social_security_benefits = [
      {
        source_document_id: "ssa-1",
      },
    ];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "LA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.retirement_income_exclusion_computed",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.social_security_subtraction_computed",
    );
  });

  it("treats missing Mississippi SALT detail as zero in the itemized-deduction estimate", async () => {
    const customReturn = makeReturn("MS", {
      stateWithholding: 100,
    });

    customReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = null;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 10_000,
      }),
      inputReturn: customReturn,
      stateCode: "MS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ms.form80105.line5", value: 10_000 }),
    );
  });
});
