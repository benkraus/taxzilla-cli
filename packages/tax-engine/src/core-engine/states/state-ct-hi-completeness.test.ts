import { describe, expect, it } from "vitest";
import { Effect } from "effect";

import { sampleReturnTy2025, statesRegistryTy2025 } from "../../blueprint";
import {
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
} from "../references";
import { normalizeStateArtifactsArgsForReturnKind } from "./return-kind";
import { buildStateArtifacts as buildCtStateArtifacts } from "./ct/index";
import { buildStateArtifacts as buildHiStateArtifacts } from "./hi/index";

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
    line24_total_tax: 0,
    line15_taxable_income: 0,
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

function makeReturn(
  stateCode: string,
  options: {
    readonly adjustedGrossIncome?: number;
    readonly dependents?: any[];
    readonly filingStatus?: string;
    readonly pluginFactBag?: Record<string, unknown>;
    readonly sourceDocuments?: any[];
    readonly spouse?: any | null;
    readonly stateAdditions?: any[];
    readonly stateFilingStatus?: string;
    readonly stateSubtractions?: any[];
    readonly stateWithholding?: number;
    readonly taxpayer?: any;
    readonly wages?: any[];
  } = {},
): any {
  const taxReturn = cloneReturn();
  const manifest = getStateManifest(stateCode);
  const stateReturn = makeStateReturn(stateCode, {
    plugin_fact_bag: options.pluginFactBag ?? {},
    state_filing_status: options.stateFilingStatus ?? "single",
    additions: options.stateAdditions ?? [],
    subtractions: options.stateSubtractions ?? [],
  });

  taxReturn.requested_jurisdictions.states = [stateCode];
  taxReturn.state_returns = {
    [stateCode]: {
      ...stateReturn,
      plugin_manifest_id: manifest.plugin_manifest_id,
    },
  };
  taxReturn.source_documents = options.sourceDocuments ?? [];
  taxReturn.household.filing_status = options.filingStatus ?? "single";
  taxReturn.household.taxpayer = {
    ...taxReturn.household.taxpayer,
    person_id: "taxpayer",
    date_of_birth: "1990-01-01",
    is_blind: false,
    can_be_claimed_as_dependent: false,
    ...options.taxpayer,
  };
  taxReturn.household.spouse =
    options.spouse === null
      ? undefined
      : options.spouse ??
        (options.filingStatus === "married_filing_jointly"
          ? {
              person_id: "spouse",
              date_of_birth: "1991-01-01",
              is_blind: false,
              can_be_claimed_as_dependent: false,
            }
          : undefined);
  taxReturn.household.dependents = options.dependents ?? [];
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

  return taxReturn;
}

async function buildArtifacts(args: {
  readonly adjustedGrossIncome: number;
  readonly builder: (args: any) => any;
  readonly federalSummary?: any;
  readonly inputReturn: any;
  readonly stateCode: string;
}) {
  const canonicalReturn = await Effect.runPromise(
    parseCanonicalReturnEnvelopeEffect(args.inputReturn),
  );
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

describe("Connecticut and Hawaii completeness", () => {
  it("computes the Connecticut property tax credit from 2025 schedule thresholds without an override", async () => {
    const inputReturn = makeReturn("CT", {
      stateWithholding: 100,
    });

    inputReturn.facts.itemized_deductions.real_estate_taxes = 5_000;

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 90_000,
      builder: buildCtStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "CT",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line21", value: 75 }),
    );
    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "ct.ct1040.line24", value: 4_425 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "CT.property_tax_credit_override_missing",
    );
  });

  it("applies the Hawaii line 22 itemized deduction limitation worksheet without an override", async () => {
    const inputReturn = makeReturn("HI", {
      stateWithholding: 100,
    });

    inputReturn.facts.itemized_deductions.medical_and_dental_expenses = 20_000;
    inputReturn.facts.itemized_deductions.mortgage_interest_items = [
      {
        source_document_id: "1098-1",
        mortgage_interest_received: 10_000,
      },
    ];
    inputReturn.facts.itemized_deductions.charitable_cash_contributions = 5_000;
    inputReturn.facts.itemized_deductions.casualty_and_theft_losses = 1_000;
    inputReturn.facts.itemized_deductions.other_itemized_deductions = [
      {
        description: "Investment interest",
        amount: 2_000,
      },
    ];

    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 200_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn,
      stateCode: "HI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line22", value: 22_004 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "HI.itemized_deduction_limited",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "HI.itemized_deduction_override_missing",
    );
  });

  it("computes the Hawaii disability exemption schedule from certified blindness inputs", async () => {
    const artifacts = await buildArtifacts({
      adjustedGrossIncome: 50_000,
      builder: buildHiStateArtifacts,
      federalSummary: makeFederalSummary(),
      inputReturn: makeReturn("HI", {
        filingStatus: "married_filing_jointly",
        spouse: {
          person_id: "spouse",
          date_of_birth: "1950-01-01",
          is_blind: false,
          can_be_claimed_as_dependent: false,
        },
        stateFilingStatus: "married_filing_jointly",
        stateWithholding: 100,
        taxpayer: {
          is_blind: true,
        },
      }),
      stateCode: "HI",
    });

    expect(artifacts.nodes).toContainEqual(
      expect.objectContaining({ node_id: "hi.n11.line25", value: 9_288 }),
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).toContain(
      "HI.disability_exemption_applied",
    );
    expect(artifacts.validationResults.map((result: any) => result.rule_id)).not.toContain(
      "HI.disability_exemption_override_missing",
    );
  });
});
