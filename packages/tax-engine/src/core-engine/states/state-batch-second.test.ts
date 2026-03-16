import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildAzStateArtifacts } from "./az/index";
import { buildStateArtifacts as buildGaStateArtifacts } from "./ga/index";
import { buildStateArtifacts as buildIaStateArtifacts } from "./ia/index";
import { buildStateArtifacts as buildIdStateArtifacts } from "./id/index";
import { buildStateArtifacts as buildLaStateArtifacts } from "./la/index";
import { buildStateArtifacts as buildMsStateArtifacts } from "./ms/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./test-helpers";

describe("resident state second batch builders", () => {
  it("computes Arizona resident tax with dependent credits on the common path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AZ", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2006-05-05" },
        ],
        stateAdditions: [{ description: "Arizona addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Arizona subtraction", amount: 200 }],
        stateWithholding: 1_500,
      }),
      stateCode: "AZ",
    });

    expect(artifacts.summary).toEqual({
      state_code: "AZ",
      plugin_manifest_id: getStateManifest("AZ").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 85_050,
      total_tax: 2_001,
      total_payments: 1_500,
      refund_amount: 0,
      amount_owed: 501,
    });
  });

  it("uses Arizona federal-base itemized deductions and flags multistate credit review when no claim is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 75_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 18_000,
      }),
      inputReturn: makeReturn("AZ", {
        requestedStates: ["AZ", "CA"],
        stateWithholding: 100,
        taxpayer: {
          date_of_birth: "1950-01-01",
          is_blind: true,
        },
      }),
      stateCode: "AZ",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["AZ.itemized_deduction_federal_base_used"]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.other_state_credit_review",
    );
  });

  it("computes the Arizona other-state credit from structured multistate claims", async () => {
    const inputReturn = makeReturn("AZ", {
      adjustedGrossIncome: 60_000,
      requestedStates: ["AZ", "CA"],
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "AZ",
          source_state_code: "CA",
          category: "wages",
          income_amount: 20_000,
          tax_paid: 700,
          creditable_tax: 400,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "AZ",
    });

    expect(artifacts.summary.total_tax).toBe(737);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.other_state_credit_review",
    );
  });

  it("uses Arizona deduction and dependent-credit overrides when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("AZ", {
        stateWithholding: 100,
        pluginFactBag: {
          form140: {
            deduction_amount: 20_000,
            dependent_tax_credit_amount: 250,
          },
        },
      }),
      stateCode: "AZ",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line43", value: 20_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line49", value: 250 }),
    );
  });

  it("supports Arizona itemized and forced-standard deduction switches without the default warnings", async () => {
    const itemizedArtifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("AZ", {
        stateWithholding: 100,
        taxpayer: {
          date_of_birth: "1950-01-01",
        },
        pluginFactBag: {
          form140: {
            itemized_deductions_total: 12_000,
            other_exemption_amount: 500,
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "AZ",
    });
    const forcedStandardArtifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildAzStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("AZ", {
        stateWithholding: 100,
        pluginFactBag: {
          form140: {
            charitable_standard_deduction_addition: 750,
            force_standard_deduction: true,
          },
        },
      }),
      stateCode: "AZ",
    });

    expect(itemizedArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line43", value: 12_000 }),
    );
    expect(itemizedArtifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.itemized_deduction_federal_base_used",
    );
    expect(itemizedArtifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "AZ.other_exemption_amount_missing",
    );
    expect(forcedStandardArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "az.form140.line43", value: 16_500 }),
    );
  });

  it("computes Georgia resident tax with dependent exemptions", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        dependents: [
          { person_id: "dep-1", date_of_birth: "2018-05-05" },
          { person_id: "dep-2", date_of_birth: "2020-02-02" },
        ],
        stateAdditions: [{ description: "Georgia addback", amount: 500 }],
        stateSubtractions: [{ description: "Georgia subtraction", amount: 100 }],
        stateWithholding: 4_000,
      }),
      stateCode: "GA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "GA",
      plugin_manifest_id: getStateManifest("GA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 80_400,
      total_tax: 4_173,
      total_payments: 4_000,
      refund_amount: 0,
      amount_owed: 173,
    });
  });

  it("uses a zero Georgia itemized path for MFS spouse-itemized cases and flags multistate credit review", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        filingStatus: "married_filing_separately",
        requestedStates: ["GA", "FL"],
        retirementDistributions: [
          {
            source_document_id: "1099r-1",
            gross_distribution: 5_000,
            taxable_amount: 5_000,
            distribution_codes: ["7"],
            ira_sep_simple: false,
          },
        ],
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
        },
        stateFilingStatus: "mfs",
        stateWithholding: 100,
        pluginFactBag: {
          ga500: {
            spouse_itemized_federal: true,
          },
        },
      }),
      stateCode: "GA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["GA.mfs_itemized_deduction_zero_used"]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "GA.other_state_credit_review",
    );
  });

  it("computes Georgia retirement exclusion and other-state credit from structured inputs", async () => {
    const inputReturn = makeReturn("GA", {
      adjustedGrossIncome: 70_000,
      requestedStates: ["GA", "SC"],
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
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "GA",
          source_state_code: "SC",
          category: "wages",
          income_amount: 15_000,
          tax_paid: 500,
          creditable_tax: 300,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 70_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "GA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ga.form500.line10", value: 5_000 }),
    );
    expect(artifacts.summary.total_tax).toBe(2_383);
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["GA.retirement_income_exclusion_computed"]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "GA.other_state_credit_review",
    );
  });

  it("computes Georgia low-income credit from the official worksheet", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 18_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateWithholding: 400,
      }),
      stateCode: "GA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "GA",
      plugin_manifest_id: getStateManifest("GA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 18_000,
      taxable_income: 2_000,
      total_tax: 94,
      total_payments: 400,
      refund_amount: 306,
      amount_owed: 0,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "GA.low_income_credit_computed",
    );
  });

  it("uses a Georgia deduction override when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        stateWithholding: 100,
        pluginFactBag: {
          ga500: {
            deduction_amount: 9_999,
          },
        },
      }),
      stateCode: "GA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ga.form500.line12", value: 9_999 }),
    );
  });

  it("records when Georgia uses the federal itemized base without a Georgia override", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 55_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 16_500,
      }),
      inputReturn: makeReturn("GA", {
        stateWithholding: 100,
      }),
      stateCode: "GA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "GA.itemized_deduction_federal_base_used",
    );
  });

  it("supports Georgia itemized overrides from either the explicit flag or the federal itemized path", async () => {
    const explicitItemizedArtifacts = await buildArtifacts({
      adjustedGrossIncome: 45_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("GA", {
        stateWithholding: 100,
        pluginFactBag: {
          ga500: {
            itemized_deductions_total: 14_000,
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "GA",
    });
    const federalItemizedArtifacts = await buildArtifacts({
      adjustedGrossIncome: 45_000,
      builder: buildGaStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 14_000,
      }),
      inputReturn: makeReturn("GA", {
        stateWithholding: 100,
        pluginFactBag: {
          ga500: {
            itemized_deductions_total: 14_000,
          },
        },
      }),
      stateCode: "GA",
    });

    expect(explicitItemizedArtifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ga.form500.line12", value: 14_000 }),
    );
    expect(federalItemizedArtifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "GA.itemized_deduction_federal_base_used",
    );
  });

  it("computes Iowa resident tax using an alternate-tax override and exemption credits", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 80_000,
      }),
      inputReturn: makeReturn("IA", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateAdditions: [{ description: "Iowa addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Iowa subtraction", amount: 500 }],
        stateWithholding: 2_500,
        pluginFactBag: {
          ia1040: {
            alternate_tax_amount: 2_800,
          },
        },
      }),
      stateCode: "IA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IA",
      plugin_manifest_id: getStateManifest("IA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 80_000,
      taxable_income: 80_500,
      total_tax: 2_720,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 220,
    });
  });

  it("warns when Iowa uses estimated taxable income, regular-tax fallback, multistate credit review, and local exclusion", async () => {
    const inputReturn = makeReturn("IA", {
      filingStatus: "married_filing_jointly",
      localReturns: [
        {
          jurisdiction_code: "SD-001",
          jurisdiction_name: "School District",
          resident_status: "resident",
          additions: [],
          subtractions: [],
          credits: [],
          payments: [],
          plugin_fact_bag: {},
        },
      ],
      requestedStates: ["IA", "IL"],
      spouse: {
        person_id: "spouse",
        date_of_birth: "1991-01-01",
      },
      stateFilingStatus: "married_filing_jointly",
      stateWithholding: 100,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "IL",
          tax_type: "withholding",
          amount: 125,
          person_id: "taxpayer",
          local_jurisdiction_code: null,
          source_document_id: "w2-1",
          payer_state_code: "IL",
          work_state_code: "IL",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildIaStateArtifacts,
      inputReturn,
      stateCode: "IA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "IA.federal_taxable_income_estimated_from_agi",
        "IA.alternate_tax_defaulted_to_regular",
        "IA.other_state_credit_review",
        "IA.local_returns_excluded_from_ia1040",
      ]),
    );
  });

  it("warns when a single Iowa filer needs alternate-tax handling because of senior/blind status", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 25_000,
      builder: buildIaStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 20_000,
      }),
      inputReturn: makeReturn("IA", {
        stateWithholding: 100,
        taxpayer: {
          is_blind: true,
        },
      }),
      stateCode: "IA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "IA.alternate_tax_defaulted_to_regular",
    );
  });

  it("computes Idaho resident tax with QBI deduction and food tax credit", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ID", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateAdditions: [{ description: "Idaho addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Idaho subtraction", amount: 500 }],
        stateWithholding: 3_000,
        pluginFactBag: {
          form40: {
            qualified_business_income_deduction: 2_000,
          },
        },
      }),
      stateCode: "ID",
    });

    expect(artifacts.summary).toEqual({
      state_code: "ID",
      plugin_manifest_id: getStateManifest("ID").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 83_500,
      total_tax: 4_426,
      total_payments: 3_310,
      refund_amount: 0,
      amount_owed: 1_116,
    });
  });

  it("warns when Idaho estimates itemized deductions and lacks a QBI override", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildIdStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 25_000,
      }),
      inputReturn: makeReturn("ID", {
        filingStatus: "married_filing_jointly",
        scheduleCBusinesses: [
          {
            business_id: "biz-1",
            owner_person_id: "taxpayer",
            gross_receipts_or_sales: 10_000,
            returns_and_allowances: 0,
            cost_of_goods_sold: 0,
            other_business_income: 0,
            expenses: [{ amount: 2_000 }],
            home_office_deduction: 0,
          },
        ],
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
        },
        stateFilingStatus: "married_filing_jointly",
        stateWithholding: 100,
      }),
      stateCode: "ID",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "ID.itemized_deduction_derived_from_federal_itemized_total",
        "ID.qbi_deduction_default_zero",
      ]),
    );
  });

  it("uses an Idaho deduction override and warns from Schedule E when QBI data is missing", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildIdStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("ID", {
        scheduleEActivities: [
          {
            owner_person_id: "taxpayer",
            activity_type: "partnership_k1",
            entity_name: "Idaho Partners LLC",
            materially_participates: true,
            income_items: [{ description: "Ordinary income", amount: 2_000 }],
            expense_items: [],
            source_document_ids: [],
          },
        ],
        stateWithholding: 100,
        pluginFactBag: {
          form40: {
            deduction_amount: 19_000,
          },
        },
      }),
      stateCode: "ID",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "id.form40.line16", value: 19_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "ID.qbi_deduction_default_zero",
    );
  });

  it("computes Louisiana resident tax on the flat-rate path", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("LA", {
        stateAdditions: [{ description: "Louisiana addback", amount: 1_000 }],
        stateSubtractions: [{ description: "Louisiana subtraction", amount: 500 }],
        stateWithholding: 3_500,
      }),
      stateCode: "LA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "LA",
      plugin_manifest_id: getStateManifest("LA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 88_000,
      total_tax: 2_640,
      total_payments: 3_500,
      refund_amount: 860,
      amount_owed: 0,
    });
  });

  it("derives Louisiana retirement and Social Security subtractions on the resident common path", async () => {
    const customReturn = makeReturn("LA", {
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

    customReturn.facts.income.social_security_benefits = [
      {
        source_document_id: "ssa-1",
        benefits_paid: 6_000,
        net_benefits: 6_000,
      },
    ];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary({
        line5b_taxable_pensions_and_annuities: 5_000,
        line6b_taxable_social_security_benefits: 6_000,
      }),
      inputReturn: customReturn,
      stateCode: "LA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "la.it540.line3.retirement_exclusion", value: 5_000 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "la.it540.line3.social_security_subtraction", value: 6_000 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "LA.retirement_income_exclusion_computed",
        "LA.social_security_subtraction_computed",
      ]),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.senior_standard_deduction_override_missing",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.other_state_credit_not_claimed",
    );
  });

  it("uses Louisiana overrides for deductions, exclusions, and credits when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildLaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("LA", {
        stateWithholding: 100,
        pluginFactBag: {
          it540: {
            standard_deduction_amount: 20_000,
            retirement_income_exclusion_amount: 4_000,
            other_taxes: 100,
            nonrefundable_credits: [{ amount: 50 }],
            refundable_credits: [{ amount: 25 }],
          },
        },
      }),
      stateCode: "LA",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "la.it540.line5", value: 20_000 }),
    );
    expect(artifacts.summary.total_payments).toBe(125);
  });

  it("suppresses Louisiana retirement and social security warnings when override data is present", async () => {
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
        social_security_subtraction_amount: 6_000,
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
      "LA.retirement_income_exclusion_computed",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "LA.social_security_subtraction_computed",
    );
  });

  it("computes Mississippi resident tax with exemptions and the zero-rate threshold", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MS", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateAdditions: [{ description: "Mississippi addback", amount: 500 }],
        stateSubtractions: [{ description: "Mississippi subtraction", amount: 100 }],
        stateWithholding: 4_000,
      }),
      stateCode: "MS",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MS",
      plugin_manifest_id: getStateManifest("MS").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 90_600,
      total_tax: 3_546,
      total_payments: 4_000,
      refund_amount: 454,
      amount_owed: 0,
    });
  });

  it("warns when Mississippi must estimate itemized deductions from the federal return", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 20_000,
      }),
      inputReturn: makeReturn("MS", {
        saltDeduction: 4_000,
        stateWithholding: 100,
      }),
      stateCode: "MS",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "MS.itemized_deduction_derived_from_federal_itemized_total",
    );
  });

  it("uses a Mississippi deduction override when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MS", {
        stateWithholding: 100,
        pluginFactBag: {
          form80105: {
            deduction_amount: 7_500,
          },
        },
      }),
      stateCode: "MS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ms.form80105.line5", value: 7_500 }),
    );
  });

  it("uses a Mississippi itemized-deduction override when supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildMsStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 10_000,
      }),
      inputReturn: makeReturn("MS", {
        stateWithholding: 100,
        pluginFactBag: {
          form80105: {
            itemized_deductions_total: 8_500,
          },
        },
      }),
      stateCode: "MS",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ms.form80105.line5", value: 8_500 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "MS.itemized_deduction_derived_from_federal_itemized_total",
    );
  });
});
