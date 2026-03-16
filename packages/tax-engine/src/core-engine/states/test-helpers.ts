import { Effect } from "effect";

import { sampleReturnTy2025, statesRegistryTy2025 } from "../../index";
import {
  parseCanonicalReturnEnvelopeEffect,
  parseCoreEngineInputEffect,
} from "../references";
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
    line24_total_tax: 0,
    line15_taxable_income: 0,
    line27a_earned_income_credit: 0,
    standard_deduction: 15_750,
    ...overrides,
  };
}

function makeStateReturn(
  stateCode: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    readonly allocationProfile?: Record<string, unknown>;
    readonly capitalTransactions?: any[];
    readonly dependents?: any[];
    readonly dividends?: any[];
    readonly filingStatus?: string;
    readonly householdCanBeClaimedAsDependent?: boolean;
    readonly localReturns?: any[];
    readonly miscellaneous1099Income?: any[];
    readonly nonemployeeCompensation?: any[];
    readonly pluginFactBag?: Record<string, unknown>;
    readonly requestedStates?: string[];
    readonly residencyDetermination?: Record<string, unknown>;
    readonly retirementDistributions?: any[];
    readonly returnKind?: string;
    readonly saltDeduction?: number;
    readonly scheduleCBusinesses?: any[];
    readonly scheduleEActivities?: any[];
    readonly sourceDocuments?: any[];
    readonly spouse?: any | null;
    readonly stateAdditions?: any[];
    readonly stateDeductions?: any[];
    readonly stateFilingStatus?: string;
    readonly statePayments?: any[];
    readonly stateSpecificCredits?: any[];
    readonly stateSpecificIncomeItems?: any[];
    readonly startingPointStrategy?: string;
    readonly stateSubtractions?: any[];
    readonly stateWithholding?: number;
    readonly taxableInterest?: any[];
    readonly taxpayer?: any;
    readonly wages?: any[];
  } = {},
): any {
  const taxReturn = cloneReturn();
  const manifest = getStateManifest(stateCode);
  const stateReturn = makeStateReturn(stateCode, {
    local_returns: options.localReturns ?? [],
    allocation_profile: options.allocationProfile,
    plugin_fact_bag: options.pluginFactBag ?? {},
    residency_determination: options.residencyDetermination,
    return_kind: options.returnKind ?? "resident",
    state_additions: undefined,
    state_filing_status: options.stateFilingStatus ?? "single",
    starting_point_strategy: options.startingPointStrategy ?? "custom",
    state_payments: options.statePayments ?? [],
    additions: options.stateAdditions ?? [],
    subtractions: options.stateSubtractions ?? [],
    state_specific_credits: options.stateSpecificCredits ?? [],
    state_specific_deductions: options.stateDeductions ?? [],
    state_specific_income_items: options.stateSpecificIncomeItems ?? [],
  });

  taxReturn.requested_jurisdictions.states = options.requestedStates ?? [stateCode];
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
        (options.filingStatus === "married_filing_jointly" ||
        options.filingStatus === "married_filing_separately" ||
        options.filingStatus === "qualifying_surviving_spouse"
          ? {
              person_id: "spouse",
              date_of_birth: "1991-01-01",
              is_blind: false,
              can_be_claimed_as_dependent: false,
            }
          : undefined);
  taxReturn.household.dependents = options.dependents ?? [];
  taxReturn.household.can_be_claimed_as_dependent =
    options.householdCanBeClaimedAsDependent ?? false;
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
    taxable_interest: options.taxableInterest ?? [],
    dividends: options.dividends ?? [],
    capital_transactions: options.capitalTransactions ?? [],
    retirement_distributions: options.retirementDistributions ?? [],
    unemployment_compensation: [],
    social_security_benefits: [],
    nonemployee_compensation: options.nonemployeeCompensation ?? [],
    miscellaneous_1099_income: options.miscellaneous1099Income ?? [],
    schedule_c_businesses: options.scheduleCBusinesses ?? [],
    schedule_e_activities: options.scheduleEActivities ?? [],
    other_income_items: [],
  };
  taxReturn.facts.adjustments = {};
  taxReturn.facts.itemized_deductions = {
    medical_and_dental_expenses: 0,
    state_and_local_income_or_sales_taxes: options.saltDeduction ?? 0,
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

async function parseInput(customReturn: any) {
  const canonicalReturn = await Effect.runPromise(parseCanonicalReturnEnvelopeEffect(customReturn));
  return Effect.runPromise(parseCoreEngineInputEffect(canonicalReturn));
}

async function buildArtifacts(args: {
  readonly adjustedGrossIncome: number;
  readonly builder: (args: any) => any;
  readonly federalSummary?: any;
  readonly inputReturn: any;
  readonly stateCode: string;
}) {
  const input = await parseInput(args.inputReturn);
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

export { buildArtifacts, getStateManifest, makeFederalSummary, makeReturn, parseInput };
