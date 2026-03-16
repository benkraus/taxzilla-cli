import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { sampleReturnTy2025, statesRegistryTy2025 } from "../../blueprint";
import { parseCanonicalReturnEnvelopeEffect, parseCoreEngineInputEffect } from "../references";
import { buildStateArtifacts as buildMoStateArtifacts } from "./mo/index";
import { buildStateArtifacts as buildNeStateArtifacts } from "./ne/index";
import { normalizeStateArtifactsArgsForReturnKind } from "./return-kind";

function cloneReturn(): any {
  return structuredClone(sampleReturnTy2025);
}

function getStateManifest(stateCode: string): any {
  return statesRegistryTy2025.find((manifest) => manifest.state_code === stateCode)!;
}

function makeFederalSummary(overrides: Record<string, unknown> = {}): any {
  return {
    deduction_strategy: "standard",
    itemized_deduction_total: 0,
    line10_adjustments: 0,
    line16_regular_income_tax: 0,
    line23_other_taxes: 0,
    line24_total_tax: 0,
    line15_taxable_income: 0,
    line27a_earned_income_credit: 0,
    line29_refundable_education_credit: 0,
    self_employment_tax: 0,
    standard_deduction: 15_750,
    ...overrides,
  };
}

function makeReturn(
  stateCode: string,
  options: {
    readonly adjustedGrossIncome?: number;
    readonly filingStatus?: string;
    readonly pluginFactBag?: Record<string, unknown>;
    readonly requestedStates?: string[];
    readonly stateFilingStatus?: string;
    readonly stateWithholding?: number | null;
    readonly wages?: any[];
  } = {},
): any {
  const taxReturn = cloneReturn();
  const manifest = getStateManifest(stateCode);
  const sampleStateReturn = structuredClone(sampleReturnTy2025.state_returns.CA) as any;

  delete sampleStateReturn.prepared_summary;

  taxReturn.requested_jurisdictions.states = options.requestedStates ?? [stateCode];
  taxReturn.state_returns = {
    [stateCode]: {
      ...sampleStateReturn,
      additions: [],
      local_returns: [],
      plugin_fact_bag: options.pluginFactBag ?? {},
      plugin_manifest_id: manifest.plugin_manifest_id,
      return_kind: "resident",
      starting_point_strategy: "custom",
      state_code: stateCode,
      state_filing_status: options.stateFilingStatus ?? "single",
      state_payments: [],
      state_specific_credits: [],
      state_specific_deductions: [],
      state_specific_income_items: [],
      subtractions: [],
    },
  };
  taxReturn.household.filing_status = options.filingStatus ?? "single";
  taxReturn.household.taxpayer = {
    ...taxReturn.household.taxpayer,
    person_id: "taxpayer",
    date_of_birth: "1990-01-01",
    is_blind: false,
    can_be_claimed_as_dependent: false,
  };
  taxReturn.household.spouse = undefined;
  taxReturn.household.dependents = [];
  taxReturn.facts.income = {
    ...taxReturn.facts.income,
    wages:
      options.wages ??
      [
        {
          person_id: "taxpayer",
          source_document_id: "w2-1",
          wages_tips_other_compensation: options.adjustedGrossIncome ?? 100_000,
          federal_income_tax_withheld: 0,
        },
      ],
    taxable_interest: [],
    dividends: [],
    capital_transactions: [],
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

  return args.builder(normalized.normalizedArgs);
}

describe("state completeness for Missouri and Nebraska", () => {
  it("derives Missouri MO-A deductions, computes the federal tax deduction worksheet amount, and applies the resident other-state credit", async () => {
    const inputReturn = makeReturn("MO", {
      adjustedGrossIncome: 80_000,
      requestedStates: ["MO", "IL"],
      stateWithholding: null as any,
      pluginFactBag: {
        mo1040: {
          use_itemized_deductions: true,
        },
      },
      wages: [
        {
          person_id: "taxpayer",
          source_document_id: "w2-1",
          wages_tips_other_compensation: 80_000,
          federal_income_tax_withheld: 0,
          social_security_tax_withheld: 4_960,
          medicare_tax_withheld: 1_160,
        },
      ],
    });

    inputReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = 4_000;
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "MO",
          source_state_code: "IL",
          category: "wages",
          income_amount: 10_000,
          tax_paid: 600,
          creditable_tax: 500,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 80_000,
      builder: buildMoStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
        line23_other_taxes: 300,
        line24_total_tax: 5_500,
        line27a_earned_income_credit: 200,
        line29_refundable_education_credit: 100,
        self_employment_tax: 900,
      }),
      inputReturn,
      stateCode: "MO",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line13", value: 780 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line14", value: 15_020 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "mo.mo1040.line38", value: 2_486 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toEqual(
      expect.arrayContaining([
        "MO.federal_tax_deduction_default_zero",
        "MO.itemized_deduction_standard_used",
        "MO.other_state_credit_review",
      ]),
    );
  });

  it("still emits Missouri warnings when the resident itemized and multistate inputs are actually missing", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 40_000,
      builder: buildMoStateArtifacts,
      inputReturn: makeReturn("MO", {
        requestedStates: ["MO", "IA"],
        stateFilingStatus: "single",
        stateWithholding: null,
        pluginFactBag: {
          mo1040: {
            use_itemized_deductions: true,
          },
        },
      }),
      stateCode: "MO",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "MO.federal_tax_deduction_default_zero",
        "MO.itemized_deduction_standard_used",
        "MO.other_state_credit_review",
      ]),
    );
  });

  it("derives Nebraska itemized deductions from canonical facts and computes the resident Schedule II credit", async () => {
    const inputReturn = makeReturn("NE", {
      adjustedGrossIncome: 60_000,
      requestedStates: ["NE", "IA"],
      stateWithholding: null as any,
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 10_000;
    inputReturn.facts.itemized_deductions.state_and_local_income_or_sales_taxes = 3_000;
    inputReturn.facts.itemized_deductions.real_estate_taxes = 2_000;
    inputReturn.facts.itemized_deductions.personal_property_taxes = 400;
    inputReturn.facts.itemized_deductions.other_taxes = 100;
    inputReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "1098-1",
        mortgage_interest_received: 4_000,
        points_paid: 0,
        mortgage_insurance_premiums: 0,
        real_estate_taxes_paid: 0,
      },
    ];
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 1_500;
    inputReturn.facts.itemized_deductions.charitable_noncash_contributions = 500;
    inputReturn.facts.itemized_deductions.other_itemized_deductions = [
      { description: "misc", amount: 200 },
    ];
    inputReturn.facts.state = {
      residency: [],
      income_sourcing: [],
      withholding: [],
      other_state_tax_credit_claims: [
        {
          resident_state_code: "NE",
          source_state_code: "IA",
          category: "wages",
          income_amount: 15_000,
          tax_paid: 700,
          creditable_tax: 650,
        },
      ],
      local_jurisdictions: [],
      overrides: [],
    };

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 60_000,
      builder: buildNeStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 15_000,
      }),
      inputReturn,
      stateCode: "NE",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ne.form1040n.line9", value: 14_200 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ne.form1040n.line24", value: 1_257 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toEqual(
      expect.arrayContaining([
        "NE.itemized_deduction_derived_from_federal_schedule_a",
        "NE.other_state_credit_review",
      ]),
    );
  });

  it("still emits Nebraska fallback warnings when only the federal summary estimate exists and no resident claim was supplied", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 30_000,
      builder: buildNeStateArtifacts,
      federalSummary: makeFederalSummary({
        deduction_strategy: "itemized",
        itemized_deduction_total: 12_000,
      }),
      inputReturn: makeReturn("NE", {
        requestedStates: ["NE", "CO"],
        stateFilingStatus: "single",
        stateWithholding: null,
      }),
      stateCode: "NE",
    });

    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toEqual(
      expect.arrayContaining([
        "NE.itemized_deduction_derived_from_federal_schedule_a",
        "NE.other_state_credit_review",
      ]),
    );
  });
});
