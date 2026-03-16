import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { sampleReturnTy2025, statesRegistryTy2025 } from "./blueprint";
import { parseCanonicalReturnEnvelopeEffect, parseCoreEngineInputEffect } from "./core-engine/references";
import { buildStateArtifacts as buildMaStateArtifacts } from "./core-engine/states/ma/index";
import { normalizeStateArtifactsArgsForReturnKind } from "./core-engine/states/return-kind";
import { buildStateArtifacts as buildVtStateArtifacts } from "./core-engine/states/vt/index";

function getStateManifest(stateCode: string): any {
  return statesRegistryTy2025.find((manifest) => manifest.state_code === stateCode)!;
}

function cloneReturn(): any {
  return structuredClone(sampleReturnTy2025);
}

function makeFederalSummary(overrides: Record<string, unknown> = {}): any {
  return {
    deduction_strategy: "standard",
    itemized_deduction_total: 0,
    line10_adjustments: 0,
    line15_taxable_income: 0,
    line16_regular_income_tax: 0,
    line24_total_tax: 0,
    line27a_earned_income_credit: 0,
    standard_deduction: 15_750,
    ...overrides,
  };
}

function makeStateReturn(stateCode: string, overrides: Record<string, unknown> = {}): any {
  const manifest = getStateManifest(stateCode);
  const sampleStateReturn = structuredClone(sampleReturnTy2025.state_returns.CA) as any;

  delete sampleStateReturn.prepared_summary;

  return {
    ...sampleStateReturn,
    state_code: stateCode,
    return_kind: "resident",
    state_filing_status: "single",
    starting_point_strategy: "custom",
    plugin_manifest_id: manifest.plugin_manifest_id,
    residency_periods: [
      {
        state_code: stateCode,
        residency_type: "resident",
        taxpayer_or_spouse: "taxpayer",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
      },
    ],
    additions: [],
    subtractions: [],
    state_specific_income_items: [],
    state_specific_deductions: [],
    state_specific_credits: [],
    state_payments: [],
    local_returns: [],
    plugin_fact_bag: {},
    ...overrides,
  };
}

function makeReturn(stateCode: string, options: Record<string, any> = {}): any {
  const taxReturn = cloneReturn();
  const manifest = getStateManifest(stateCode);
  const stateReturn = makeStateReturn(stateCode, {
    allocation_profile: options.allocationProfile,
    plugin_fact_bag: options.pluginFactBag ?? {},
    residency_determination: options.residencyDetermination,
    return_kind: options.returnKind ?? "resident",
    state_filing_status: options.stateFilingStatus ?? "single",
    local_returns: options.localReturns ?? [],
    state_payments: options.statePayments ?? [],
    additions: options.stateAdditions ?? [],
    subtractions: options.stateSubtractions ?? [],
    state_specific_credits: options.stateSpecificCredits ?? [],
    state_specific_deductions: options.stateDeductions ?? [],
    state_specific_income_items: options.stateSpecificIncomeItems ?? [],
  });

  taxReturn.requested_jurisdictions.states = [stateCode];
  taxReturn.state_returns = {
    [stateCode]: {
      ...stateReturn,
      plugin_manifest_id: manifest.plugin_manifest_id,
    },
  };
  taxReturn.household.filing_status = "single";
  taxReturn.household.taxpayer = {
    ...taxReturn.household.taxpayer,
    person_id: "taxpayer",
    date_of_birth: "1990-01-01",
    is_blind: false,
    can_be_claimed_as_dependent: false,
  };
  taxReturn.household.spouse = undefined;
  taxReturn.household.dependents = options.dependents ?? [];
  taxReturn.facts.income = {
    ...taxReturn.facts.income,
    wages: [
      {
        person_id: "taxpayer",
        source_document_id: "w2-1",
        wages_tips_other_compensation: options.adjustedGrossIncome ?? 100_000,
        federal_income_tax_withheld: 0,
      },
    ],
    taxable_interest: [],
    dividends: [],
    capital_transactions: options.capitalTransactions ?? [],
    retirement_distributions: [],
    unemployment_compensation: [],
    social_security_benefits: [],
    nonemployee_compensation: [],
    miscellaneous_1099_income: [],
    schedule_c_businesses: [],
    schedule_e_activities: [],
    other_income_items: [],
  };
  taxReturn.facts.adjustments = {};
  taxReturn.facts.itemized_deductions = {
    medical_and_dental_expenses: 0,
    state_and_local_income_or_sales_taxes: 0,
    real_estate_taxes: 0,
    personal_property_taxes: 0,
    other_taxes: 0,
    mortgage_interest_items: [],
    charitable_cash_contributions: 0,
    charitable_noncash_contributions: 0,
    casualty_and_theft_losses: 0,
    other_itemized_deductions: [],
  };
  taxReturn.facts.credits = {
    candidate_child_tax_credit_dependent_ids: [],
    candidate_credit_for_other_dependent_ids: [],
    candidate_eitc_child_ids: [],
    child_and_dependent_care: {
      qualifying_person_ids: [],
      providers: [],
      expenses: [],
    },
    education_credits: {
      students: [],
    },
    premium_tax_credit: {
      policies: [],
    },
    other_nonrefundable_credits: [],
    other_refundable_credits: [],
  };
  taxReturn.facts.payments = {
    withholdings:
      options.stateWithholding == null
        ? []
        : [
            {
              jurisdiction: "state",
              state_code: stateCode,
              amount: options.stateWithholding,
              description: `${stateCode} withholding`,
            },
          ],
    estimated_payments: [],
    extension_payments: [],
    prior_year_overpayment_applied_to_2025: null,
  };
  taxReturn.facts.health_coverage = {
    marketplace_policies: [],
    hsa_coverage_months: [],
  };
  taxReturn.facts.state_specific_fact_bag = {};

  return taxReturn;
}

async function buildArtifacts(args: {
  readonly adjustedGrossIncome: number;
  readonly builder: (args: any) => any;
  readonly federalSummary?: any;
  readonly inputReturn: any;
  readonly stateCode: string;
}) {
  const canonicalReturn = await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(args.inputReturn));
  const input = await Effect.runPromise(parseCoreEngineInputEffect(canonicalReturn));
  const stateReturn = input.state_returns[args.stateCode]!;
  const normalized = normalizeStateArtifactsArgsForReturnKind({
    adjustedGrossIncome: args.adjustedGrossIncome,
    federalSummary: args.federalSummary,
    input,
    manifest: getStateManifest(args.stateCode),
    stateReturn,
  });
  const artifacts = args.builder(normalized.normalizedArgs);
  return {
    ...artifacts,
    validationResults: [...normalized.validationResults, ...artifacts.validationResults],
  };
}

describe("specialized Massachusetts and Vermont part-year and nonresident flows", () => {
  it("computes Massachusetts resident tax with resident exemptions intact", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MA", {
        stateWithholding: 5_000,
      }),
      stateCode: "MA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MA",
      plugin_manifest_id: getStateManifest("MA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 95_600,
      total_tax: 4_780,
      total_payments: 5_000,
      refund_amount: 220,
      amount_owed: 0,
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual([
      "MA.low_income_adjustments_not_claimed",
    ]);
  });

  it("computes Massachusetts part-year resident tax with combined day and nonresident-source proration", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MA", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        residencyDetermination: {
          resolved_return_kind: "part_year_resident",
          days_in_state: 183,
          days_everywhere: 365,
        },
        stateWithholding: 2_500,
      }),
      stateCode: "MA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MA",
      plugin_manifest_id: getStateManifest("MA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 47_428,
      total_tax: 2_371,
      total_payments: 2_500,
      refund_amount: 129,
      amount_owed: 0,
      allocation_ratio: 0.4,
      resident_taxable_income: 47_428,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MA.allocation_profile_applied",
        "MA.form1_nrpy_proration_applied",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ma.form1nrpy.line3", value: "0.5014" }),
        expect.objectContaining({ node_id: "ma.form1nrpy.line14g", value: "0.1667" }),
        expect.objectContaining({ node_id: "ma.schedule_rnr.proration_ratio", value: "0.5845" }),
        expect.objectContaining({ node_id: "ma.form1.line5", value: 2_572 }),
      ]),
    );
  });

  it("computes Massachusetts nonresident tax with the Form 1-NR/PY line 14g ratio", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildMaStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("MA", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 1_200,
      }),
      stateCode: "MA",
    });

    expect(artifacts.summary).toEqual({
      state_code: "MA",
      plugin_manifest_id: getStateManifest("MA").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 23_900,
      total_tax: 1_195,
      total_payments: 1_200,
      refund_amount: 5,
      amount_owed: 0,
      allocation_ratio: 0.25,
      nonresident_source_income: 23_900,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "ma.form1nrpy.line14g", value: "0.2500" }),
        expect.objectContaining({ node_id: "ma.schedule_rnr.proration_ratio", value: "0.2500" }),
        expect.objectContaining({ node_id: "ma.form1.line5", value: 1_100 }),
      ]),
    );
  });

  it("computes Vermont resident tax on the resident-equivalent IN-111 base", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VT", {
        stateWithholding: 2_500,
      }),
      stateCode: "VT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VT",
      plugin_manifest_id: getStateManifest("VT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 100_000,
      taxable_income: 87_050,
      total_tax: 4_140,
      total_payments: 2_500,
      refund_amount: 0,
      amount_owed: 1_640,
    });
  });

  it("computes Vermont part-year resident tax with the Schedule IN-113 line 35 percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VT", {
        returnKind: "part_year_resident",
        allocationProfile: {
          everywhere_income: 100_000,
          resident_period_income: 40_000,
          nonresident_source_income: 10_000,
          state_source_income: 50_000,
          apportionment_ratio: 0.5,
        },
        stateWithholding: 1_500,
      }),
      stateCode: "VT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VT",
      plugin_manifest_id: getStateManifest("VT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 50_000,
      taxable_income: 50_000,
      total_tax: 2_070,
      total_payments: 1_500,
      refund_amount: 0,
      amount_owed: 570,
      allocation_ratio: 0.5,
      resident_taxable_income: 50_000,
      return_kind: "part_year_resident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "VT.allocation_profile_applied",
        "VT.schedule_in113_income_adjustment_applied",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "vt.in113.line28", value: 50_000 }),
        expect.objectContaining({ node_id: "vt.in113.line35", value: "0.5000" }),
        expect.objectContaining({ node_id: "vt.in111.line15", value: 50 }),
        expect.objectContaining({ node_id: "vt.in111.line16", value: 2_070 }),
      ]),
    );
  });

  it("computes Vermont nonresident tax with the Schedule IN-113 income-adjustment percentage", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 100_000,
      builder: buildVtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("VT", {
        returnKind: "nonresident",
        allocationProfile: {
          everywhere_income: 100_000,
          nonresident_source_income: 25_000,
          state_source_income: 25_000,
          source_income_ratio: 0.25,
        },
        stateWithholding: 700,
      }),
      stateCode: "VT",
    });

    expect(artifacts.summary).toEqual({
      state_code: "VT",
      plugin_manifest_id: getStateManifest("VT").plugin_manifest_id,
      adjusted_gross_income_or_starting_point: 25_000,
      taxable_income: 25_000,
      total_tax: 1_035,
      total_payments: 700,
      refund_amount: 0,
      amount_owed: 335,
      allocation_ratio: 0.25,
      nonresident_source_income: 25_000,
      resident_taxable_income: null,
      return_kind: "nonresident",
      starting_point_strategy: "custom",
    });
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "VT.allocation_profile_applied",
        "VT.schedule_in113_income_adjustment_applied",
      ]),
    );
    expect(artifacts.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node_id: "vt.in113.line28", value: 25_000 }),
        expect.objectContaining({ node_id: "vt.in113.line35", value: "0.2500" }),
        expect.objectContaining({ node_id: "vt.in111.line15", value: 25 }),
        expect.objectContaining({ node_id: "vt.in111.line16", value: 1_035 }),
      ]),
    );
  });
});
