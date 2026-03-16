import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildMdStateArtifacts } from "./core-engine/states/md/index";
import { buildStateArtifacts as buildMnStateArtifacts } from "./core-engine/states/mn/index";
import { buildStateArtifacts as buildMtStateArtifacts } from "./core-engine/states/mt/index";
import { buildStateArtifacts as buildNjStateArtifacts } from "./core-engine/states/nj/index";
import { buildStateArtifacts as buildNyStateArtifacts } from "./core-engine/states/ny/index";
import { buildStateArtifacts as buildVtStateArtifacts } from "./core-engine/states/vt/index";
import { buildArtifacts, makeFederalSummary, makeReturn } from "./core-engine.state-test-helpers";

describe("resident state eighth batch coverage branches", () => {
  it("uses the Maryland minimum local tax rate when no county can be resolved", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MD", {
        stateWithholding: 100,
      }),
      stateCode: "MD",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MD.local_tax_rate_minimum_assumed",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "md.form502.line28", value: 2_103 }),
    );
  });

  it("uses Maryland local jurisdiction facts before warning about a missing local tax rate", async () => {
    const inputReturn = makeReturn("MD", {
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [
        {
          state_code: "MD",
          jurisdiction_code: "510",
          jurisdiction_name: "Baltimore City",
          jurisdiction_type: "city",
          resident_status: "resident",
          local_source_wages: 100_000,
          local_source_other_income: 0,
          withholding_total: 0,
          estimated_payments_total: 0,
          credits_total: 0,
          residency_start_date: "2025-01-01",
          residency_end_date: "2025-12-31",
        },
      ],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "MD",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MD.local_tax_rate_minimum_assumed",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "md.form502.line28", value: 2_990 }),
    );
  });

  it("collapses multiple Maryland local jurisdictions to the last matching residency period", async () => {
    const inputReturn = makeReturn("MD", {
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [
        {
          state_code: "MD",
          jurisdiction_code: "24045",
          jurisdiction_name: "Worcester County",
          jurisdiction_type: "county",
          resident_status: "resident",
          local_source_wages: 40_000,
          local_source_other_income: 0,
          withholding_total: 0,
          estimated_payments_total: 0,
          credits_total: 0,
          residency_start_date: "2025-01-01",
          residency_end_date: "2025-06-30",
        },
        {
          state_code: "MD",
          jurisdiction_code: "510",
          jurisdiction_name: "Baltimore City",
          jurisdiction_type: "city",
          resident_status: "resident",
          local_source_wages: 60_000,
          local_source_other_income: 0,
          withholding_total: 0,
          estimated_payments_total: 0,
          credits_total: 0,
          residency_start_date: "2025-07-01",
          residency_end_date: "2025-12-31",
        },
      ],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "MD",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MD.multiple_local_jurisdictions_collapsed",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "md.form502.line28", value: 2_990 }),
    );
  });

  it("warns when Minnesota needs both exemption and marriage-credit overrides", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 70_000,
      builder: buildMnStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MN", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
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
      stateCode: "MN",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MN.exemption_default_zero",
        "MN.marriage_credit_default_zero",
      ]),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mn.m1.line9", value: 54_250 }),
    );
  });

  it("uses an estimated Montana federal taxable income fallback when no federal taxable income source is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMtStateArtifacts,
      inputReturn: makeReturn("MT", {
        stateWithholding: 100,
      }),
      stateCode: "MT",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MT.federal_taxable_income_estimated_from_agi",
    );
  });

  it("uses explicit Montana federal taxable income inputs without the AGI fallback notice", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMtStateArtifacts,
      inputReturn: makeReturn("MT", {
        pluginFactBag: {
          form2: {
            federal_form_1040_line15_amount: 22_000,
          },
        },
        stateWithholding: 100,
      }),
      stateCode: "MT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "bridge.mt.starting_point", value: 22_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MT.federal_taxable_income_estimated_from_agi",
    );
  });

  it("phases down the Vermont child credit at higher income and assumes zero U.S.-obligation interest when none is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 160_000,
      builder: buildVtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VT", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2020-02-02" }],
        stateWithholding: 100,
      }),
      stateCode: "VT",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "VT.child_tax_credit_phased_down",
        "VT.minimum_tax_interest_assumed_zero",
      ]),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "vt.in111.line19", value: 300 }),
    );
  });

  it("warns when New Jersey needs retirement allocation and COJ property-tax overrides", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 120_000,
      builder: buildNjStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NJ", {
        filingStatus: "married_filing_jointly",
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_jointly",
        retirementDistributions: [
          {
            source_document_id: "1099r-1",
            gross_distribution: 30_000,
            taxable_amount: 30_000,
            federal_income_tax_withheld: 0,
            distribution_codes: ["7"],
            ira_sep_simple: false,
          },
        ],
        pluginFactBag: {
          nj1040: {
            other_state_credit_amount: 500,
            rent_paid_amount: 12_000,
          },
        },
        stateWithholding: 100,
      }),
      stateCode: "NJ",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NJ.retirement_exclusion_joint_allocation_review",
        "NJ.property_tax_benefit_defaulted_to_deduction",
      ]),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nj.nj1040.line28a", value: 15_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "nj.nj1040.line41", value: 2_160 }),
    );
  });

  it("warns when New York MFS household credits are missing combined AGI inputs", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("NY", {
        filingStatus: "married_filing_separately",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_separately",
        localReturns: [
          {
            jurisdiction_code: "NYC",
            jurisdiction_name: "New York City",
            resident_status: "resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
        stateWithholding: 100,
      }),
      stateCode: "NY",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NY.household_credit_spouse_agi_derived",
        "NY.itemized_deduction_federal_base_used",
      ]),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line40", value: 38 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line48", value: 15 }),
    );
  });

  it("uses spouse AGI inputs to compute New York MFS household credits without MFS warnings", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NY", {
        filingStatus: "married_filing_separately",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_separately",
        localReturns: [
          {
            jurisdiction_code: "NYC",
            jurisdiction_name: "New York City",
            resident_status: "resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
        pluginFactBag: {
          it201: {
            spouse_federal_adjusted_gross_income_amount: 10_000,
          },
        },
        stateWithholding: 100,
      }),
      stateCode: "NY",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toEqual(
      expect.arrayContaining([
        "NY.household_credit_mfs_review",
        "NY.nyc_household_credit_mfs_review",
      ]),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line40", value: 13 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line48", value: 0 }),
    );
  });

  it("computes New York City part-year resident tax with the IT-360.1 path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("NY", {
        pluginFactBag: {
          it201: {
            nyc_part_year_resident: true,
            nyc_resident_months: 6,
          },
        },
        stateWithholding: 1_000,
      }),
      stateCode: "NY",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NY.nyc_part_year_tax_computed",
        "NY.nyc_part_year_income_prorated",
      ]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "NY.nyc_part_year_tax_override_missing",
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line47", value: 46_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line50", value: 1_660 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line69", value: 31 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ny.it201.line69a", value: 99 }),
    );
  });
});
