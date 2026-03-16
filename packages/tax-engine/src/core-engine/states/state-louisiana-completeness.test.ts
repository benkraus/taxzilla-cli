import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildLaStateArtifacts } from "./la/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./test-helpers";

describe("Louisiana state completeness", () => {
  it("derives retirement, Social Security, and other-state credit amounts from resident common-path facts", async () => {
    const inputReturn = makeReturn("LA", {
      adjustedGrossIncome: 50_000,
      requestedStates: ["LA", "TX"],
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 10_000,
          taxable_amount: 10_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
      taxpayer: {
        date_of_birth: "1950-01-01",
      },
    });

    inputReturn.facts.income.social_security_benefits = [
      {
        source_document_id: "ssa-1",
        benefits_paid: 6_000,
        net_benefits: 6_000,
      },
    ];
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "LA",
          source_state_code: "TX",
          category: "wages",
          income_amount: 20_000,
          tax_paid: 700,
          creditable_tax: 600,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary({
        line5b_taxable_pensions_and_annuities: 10_000,
        line6b_taxable_social_security_benefits: 6_000,
      }),
      inputReturn,
      stateCode: "LA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "la.it540.line3.retirement_exclusion",
        value: 6_000,
      }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "la.it540.line3.social_security_subtraction",
        value: 6_000,
      }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({
        node_id: "la.it540.line10.schedule_c_credit",
        value: 403,
      }),
    );
    expect(artifacts.summary.total_tax).toBe(362);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "LA.retirement_income_exclusion_computed",
        "LA.social_security_subtraction_computed",
      ]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.other_state_credit_not_claimed",
    );
  });

  it("records a review note when a multistate Louisiana resident has no Schedule C style credit claim", async () => {
    const inputReturn = makeReturn("LA", {
      requestedStates: ["LA", "TX"],
      retirementDistributions: [
        {
          source_document_id: "1099r-1",
          gross_distribution: 5_000,
          taxable_amount: 5_000,
          distribution_codes: ["7"],
          ira_sep_simple: false,
        },
      ],
      stateWithholding: 100,
      taxpayer: {
        date_of_birth: "1950-01-01",
      },
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [
        {
          allocation_method: "reported",
          income_class: "wages",
          person_id: "taxpayer",
          source_document_id: "w2-tx-1",
          state_code: "TX",
          total_amount: 5_000,
          state_source_amount: 5_000,
          resident_period_amount: 0,
          nonresident_period_amount: 5_000,
          work_state_code: "TX",
          locality_code: null,
          duty_days_in_state: null,
          duty_days_everywhere: null,
          entity_name: null,
        },
      ],
      withholding: [],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary({
        line5b_taxable_pensions_and_annuities: 5_000,
      }),
      inputReturn,
      stateCode: "LA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "LA.retirement_income_exclusion_computed",
        "LA.other_state_credit_not_claimed",
      ]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.senior_standard_deduction_override_missing",
    );
  });
});
