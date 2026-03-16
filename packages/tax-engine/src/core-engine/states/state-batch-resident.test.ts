import { describe, expect, it } from "vitest";

import { buildStateArtifacts as buildCoStateArtifacts } from "./co/index";
import { buildStateArtifacts as buildIlStateArtifacts } from "./il/index";
import { buildStateArtifacts as buildInStateArtifacts } from "./in/index";
import { buildStateArtifacts as buildKyStateArtifacts } from "./ky/index";
import { buildStateArtifacts as buildMaStateArtifacts } from "./ma/index";
import { buildStateArtifacts as buildMiStateArtifacts } from "./mi/index";
import { buildStateArtifacts as buildNcStateArtifacts } from "./nc/index";
import { buildStateArtifacts as buildPaStateArtifacts } from "./pa/index";
import { buildStateArtifacts as buildUtStateArtifacts } from "./ut/index";
import {
  buildArtifacts,
  getStateManifest,
  makeFederalSummary,
  makeReturn,
} from "./test-helpers";

describe("resident state batch builders", () => {
  it("computes Colorado resident tax from federal taxable income and explicit payments", async () => {
    const customReturn = makeReturn("CO", {
      stateAdditions: [{ description: "Colorado addback", amount: 1_000 }],
      statePayments: [{ description: "CO direct payment", amount: 2_800 }],
      stateSubtractions: [{ description: "Colorado subtraction", amount: 250 }],
      pluginFactBag: {
        dr0104: {
          refundable_credits: [{ description: "TABOR", amount: 400 }],
        },
      },
      stateWithholding: null as any,
    });
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCoStateArtifacts,
      federalSummary: makeFederalSummary({
        line15_taxable_income: 84_250,
      }),
      inputReturn: customReturn,
      stateCode: "CO",
    });

    expect(artifacts.summary).toEqual({
      state_code: "CO",
      plugin_manifest_id: getStateManifest("CO").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 84_250,
      taxable_income: 85_000,
      total_tax: 3_740,
      total_payments: 3_200,
      refund_amount: 0,
      amount_owed: 540,
    });
  });

  it("warns when Colorado federal taxable income or TABOR data is missing", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildCoStateArtifacts,
      inputReturn: makeReturn("CO", {
        stateWithholding: 1_500,
      }),
      stateCode: "CO",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "CO.federal_taxable_income_estimated_from_agi",
        "CO.tabor_refund_default_zero",
      ]),
    );
  });

  it("computes Illinois resident tax with the full exemption allowance below the AGI cliff", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IL", {
        stateAdditions: [{ description: "Illinois addback", amount: 500 }],
        stateSubtractions: [{ description: "Illinois subtraction", amount: 100 }],
        stateWithholding: 3_000,
      }),
      stateCode: "IL",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IL",
      plugin_manifest_id: getStateManifest("IL").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 97_550,
      total_tax: 4_829,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 1_829,
    });
  });

  it("warns for Illinois dependent-taxpayer exemptions and multistate credits", async () => {
    const customReturn = makeReturn("IL", {
      householdCanBeClaimedAsDependent: true,
      requestedStates: ["IL", "WI"],
      stateWithholding: 500,
      taxpayer: {
        can_be_claimed_as_dependent: true,
      },
    });
    customReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          jurisdiction_level: "state",
          state_code: "WI",
          tax_type: "withholding",
          amount: 25,
          person_id: "taxpayer",
          local_jurisdiction_code: null,
          source_document_id: "w2-1",
          payer_state_code: "WI",
          work_state_code: "WI",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildIlStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "IL",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "IL.schedule_cr_credit_review",
      ]),
    );
  });

  it("computes Indiana county tax when a county rate is supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildInStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("IN", {
        pluginFactBag: {
          it40: {
            county_tax_rate: 0.01,
            county_withholding: 200,
          },
        },
        stateWithholding: 3_000,
      }),
      stateCode: "IN",
    });

    expect(artifacts.summary).toEqual({
      state_code: "IN",
      plugin_manifest_id: getStateManifest("IN").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 99_000,
      total_tax: 3_960,
      total_payments: 3_200,
      refund_amount: 0,
      amount_owed: 760,
    });
  });

  it("warns when Indiana county tax or local-return data is missing", async () => {
    const customReturn = makeReturn("IN", {
      localReturns: [
        {
          jurisdiction_code: "INDY",
          jurisdiction_name: "Indianapolis",
          resident_status: "resident",
          additions: [],
          subtractions: [],
          credits: [],
          payments: [],
          plugin_fact_bag: {},
        },
      ],
      stateWithholding: 1_000,
    });
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildInStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "IN",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["IN.county_tax_default_zero", "IN.local_returns_excluded_from_it40"]),
    );
  });

  it("uses a single Kentucky standard deduction on a joint return", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildKyStateArtifacts,
      federalSummary: makeFederalSummary({
        standard_deduction: 31_500,
      }),
      inputReturn: makeReturn("KY", {
        filingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1991-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_jointly",
        stateWithholding: 4_000,
      }),
      stateCode: "KY",
    });

    expect(artifacts.summary).toEqual({
      state_code: "KY",
      plugin_manifest_id: getStateManifest("KY").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 96_730,
      total_tax: 3_869,
      total_payments: 4_000,
      refund_amount: 131,
      amount_owed: 0,
    });
  });

  it("computes Kentucky family size credit without a warning when dependent data is present", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildKyStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("KY", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateWithholding: 500,
      }),
      stateCode: "KY",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "KY.family_size_tax_credit_missing",
    );
  });

  it("computes Michigan EITC and exemption-driven taxable income", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildMiStateArtifacts,
      federalSummary: makeFederalSummary({
        line27a_earned_income_credit: 2_000,
      }),
      inputReturn: makeReturn("MI", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        stateWithholding: 100,
      }),
      stateCode: "MI",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MI",
      plugin_manifest_id: getStateManifest("MI").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 20_000,
      taxable_income: 8_400,
      total_tax: 357,
      total_payments: 700,
      refund_amount: 343,
      amount_owed: 0,
    });
  });

  it("treats Michigan local returns as separate from the MI-1040 summary", async () => {
    const customReturn = makeReturn("MI", {
      localReturns: [
        {
          jurisdiction_code: "DET",
          jurisdiction_name: "Detroit",
          resident_status: "resident",
          additions: [],
          subtractions: [],
          credits: [],
          payments: [],
          plugin_fact_bag: {},
        },
      ],
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
    });
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildMiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "MI",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining(["MI.local_returns_excluded_from_mi1040"]),
    );
  });

  it("computes North Carolina resident tax with itemized deductions and a child deduction override", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildNcStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 14_000,
      }),
      inputReturn: makeReturn("NC", {
        dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
        pluginFactBag: {
          d400: {
            child_deduction_amount: 2_500,
            itemized_deductions_total: 14_000,
          },
        },
        stateWithholding: 3_000,
      }),
      stateCode: "NC",
    });

    expect(artifacts.summary).toEqual({
      state_code: "NC",
      plugin_manifest_id: getStateManifest("NC").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 83_500,
      total_tax: 3_549,
      total_payments: 3_000,
      refund_amount: 0,
      amount_owed: 549,
    });
  });

  it("records North Carolina zero-used review notes for child deduction, MFS itemized handling, and multistate credit claims", async () => {
    const inputReturn = makeReturn("NC", {
      dependents: [{ person_id: "dep-1", date_of_birth: "2018-05-05" }],
      filingStatus: "married_filing_separately",
      pluginFactBag: {
        d400: {
          spouse_itemized_federal: true,
        },
      },
      requestedStates: ["NC", "SC"],
      spouse: {
        person_id: "spouse",
        date_of_birth: "1991-01-01",
      },
      stateFilingStatus: "married_filing_separately",
      stateWithholding: 500,
    });

    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [
        {
          amount: 250,
          jurisdiction_level: "state",
          local_jurisdiction_code: null,
          payer_state_code: "SC",
          person_id: "taxpayer",
          source_document_id: "w2-sc-1",
          state_code: "SC",
          tax_type: "withholding",
          work_state_code: "SC",
        },
      ],
      other_state_tax_credit_claims: [],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildNcStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 7_000,
      }),
      inputReturn,
      stateCode: "NC",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NC.child_deduction_not_claimed",
        "NC.mfs_itemized_deduction_zero_used",
        "NC.other_state_credit_review",
      ]),
    );
  });

  it("computes Utah taxpayer tax credit from the federal deduction base", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildUtStateArtifacts,
      federalSummary: makeFederalSummary({
        standard_deduction: 15_750,
      }),
      inputReturn: makeReturn("UT", {
        stateWithholding: 500,
      }),
      stateCode: "UT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "UT",
      plugin_manifest_id: getStateManifest("UT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 30_000,
      taxable_income: 30_000,
      total_tax: 558,
      total_payments: 500,
      refund_amount: 0,
      amount_owed: 58,
    });
  });

  it("computes the Utah other-state credit from structured multistate credit claims", async () => {
    const customReturn = makeReturn("UT", {
      requestedStates: ["UT", "ID"],
      stateWithholding: 100,
    });
    customReturn.facts.state = {
      ...(customReturn.facts.state ?? {
        income_sourcing: [],
        local_jurisdictions: [],
        other_state_tax_credit_claims: [],
        overrides: [],
        residency: [],
        withholding: [],
      }),
      other_state_tax_credit_claims: [
      {
        resident_state_code: "UT",
        source_state_code: "ID",
        category: "wages",
        income_amount: 10_000,
        tax_paid: 300,
      },
      ],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildUtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode: "UT",
    });

    expect(artifacts.summary.total_tax).toBe(372);
    expect(artifacts.summary.amount_owed).toBe(272);
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ut.tc40a.code17", value: 186 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "UT.other_state_credit_applied",
    );
  });

  it("computes Pennsylvania resident tax by class while flooring losses at zero", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
        scheduleCBusinesses: [
          {
            business_id: "biz-1",
            owner_person_id: "taxpayer",
            gross_receipts_or_sales: 500,
            returns_and_allowances: 0,
            cost_of_goods_sold: 0,
            other_business_income: 0,
            expenses: [{ amount: 1_500 }],
            home_office_deduction: 0,
          },
        ],
        stateDeductions: [{ description: "PA deduction", amount: 300 }],
        stateWithholding: 1_000,
        taxableInterest: [
          {
            source_document_id: "1099int-1",
            interest_income: 500,
          },
        ],
        wages: [
          {
            person_id: "taxpayer",
            source_document_id: "w2-1",
            wages_tips_other_compensation: 50_000,
            federal_income_tax_withheld: 0,
          },
        ],
      }),
      stateCode: "PA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "PA",
      plugin_manifest_id: getStateManifest("PA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_500,
      taxable_income: 50_200,
      total_tax: 1_541,
      total_payments: 1_000,
      refund_amount: 0,
      amount_owed: 541,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "PA.class_losses_floored",
    );
  });

  it("marks Pennsylvania local returns as excluded from the PA-40 summary", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 20_000,
      builder: buildPaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("PA", {
        localReturns: [
          {
            jurisdiction_code: "PIT",
            jurisdiction_name: "Pittsburgh",
            resident_status: "resident",
            additions: [],
            subtractions: [],
            credits: [],
            payments: [],
            plugin_fact_bag: {},
          },
        ],
      }),
      stateCode: "PA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "PA.local_returns_excluded_from_pa40",
    );
  });

  it("computes Massachusetts rate classes and the surtax", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 1_200_000,
      builder: buildMaStateArtifacts,
      federalSummary: makeFederalSummary({
        line10_adjustments: 1_000,
      }),
      inputReturn: makeReturn("MA", {
        capitalTransactions: [
          {
            source_document_id: "8949-1",
            proceeds: 20_000,
            cost_basis: 10_000,
            gain_or_loss: 10_000,
            term: "short",
          },
        ],
        stateWithholding: 65_000,
      }),
      stateCode: "MA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MA",
      plugin_manifest_id: getStateManifest("MA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 1_201_000,
      taxable_income: 1_196_600,
      total_tax: 64_718,
      total_payments: 65_000,
      refund_amount: 282,
      amount_owed: 0,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MA.gross_income_derived_from_federal_adjustments",
        "MA.low_income_adjustments_not_claimed",
      ]),
    );
  });

  it("warns when Massachusetts short-term losses are present without a fuller worksheet", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildMaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MA", {
        capitalTransactions: [
          {
            source_document_id: "8949-1",
            proceeds: 10_000,
            cost_basis: 15_000,
            gain_or_loss: -5_000,
            term: "short",
          },
        ],
        stateWithholding: 500,
      }),
      stateCode: "MA",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MA.short_term_loss_zeroed_under_class_system",
        "MA.low_income_adjustments_not_claimed",
      ]),
    );
  });

  it.each([
    ["CO", buildCoStateArtifacts],
    ["IL", buildIlStateArtifacts],
    ["IN", buildInStateArtifacts],
    ["KY", buildKyStateArtifacts],
    ["MA", buildMaStateArtifacts],
    ["MI", buildMiStateArtifacts],
    ["NC", buildNcStateArtifacts],
    ["PA", buildPaStateArtifacts],
    ["UT", buildUtStateArtifacts],
  ])("falls back to the generic state path for unsupported resident kinds: %s", async (stateCode, builder) => {
    const customReturn = makeReturn(stateCode, {});
    customReturn.state_returns[stateCode].return_kind = "part_year_resident";

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: builder as any,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode,
    });

    expect(artifacts.validationResults.some((result: any) => result.rule_id.endsWith(".resident_only"))).toBe(true);
    expect(artifacts.summary.state_code).toBe(stateCode);
  });

  it.each([
    ["CO", buildCoStateArtifacts],
    ["IL", buildIlStateArtifacts],
    ["IN", buildInStateArtifacts],
    ["KY", buildKyStateArtifacts],
    ["MA", buildMaStateArtifacts],
    ["MI", buildMiStateArtifacts],
    ["NC", buildNcStateArtifacts],
    ["PA", buildPaStateArtifacts],
    ["UT", buildUtStateArtifacts],
  ])("falls back to the generic state path for unsupported starting-point strategies: %s", async (stateCode, builder) => {
    const customReturn = makeReturn(stateCode, {});
    customReturn.state_returns[stateCode].starting_point_strategy = "federal_agi";

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: builder as any,
      federalSummary: makeFederalSummary(),
      inputReturn: customReturn,
      stateCode,
    });

    expect(
      artifacts.validationResults.some((result: any) =>
        result.rule_id.endsWith(".starting_point_unsupported"),
      ),
    ).toBe(true);
    expect(artifacts.summary.state_code).toBe(stateCode);
  });
});
