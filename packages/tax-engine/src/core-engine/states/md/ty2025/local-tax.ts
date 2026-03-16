import { asNumber, asString, normalizeTextMatch } from "../../../helpers";
import type {
  CoreEngineInput,
  CoreEngineStateLocalJurisdictionFact,
  CoreEngineStateReturn,
} from "../../../input";

type MarylandFilingStatus =
  | "head_of_household"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "qualifying_surviving_spouse"
  | "single";

type MarylandLocalTaxResult = {
  readonly amount: number;
  readonly collapsedJurisdictions: boolean;
  readonly jurisdictionName: string | null;
  readonly missingJurisdiction: boolean;
  readonly usedDefaultMinimumRate: boolean;
  readonly usedOverrideRate: boolean;
};

const FIXED_LOCAL_RATE_BY_JURISDICTION = new Map<string, number>([
  ["baltimorecity", 0.032],
  ["alleganycounty", 0.0303],
  ["baltimorecounty", 0.032],
  ["calvertcounty", 0.032],
  ["carolinecounty", 0.032],
  ["carrollcounty", 0.0303],
  ["cecilcounty", 0.0274],
  ["charlescounty", 0.0303],
  ["dorchestercounty", 0.033],
  ["garrettcounty", 0.0265],
  ["harfordcounty", 0.0306],
  ["howardcounty", 0.032],
  ["kentcounty", 0.032],
  ["montgomerycounty", 0.032],
  ["princegeorgescounty", 0.032],
  ["queenannescounty", 0.032],
  ["stmaryscounty", 0.032],
  ["somersetcounty", 0.032],
  ["talbotcounty", 0.024],
  ["washingtoncounty", 0.0295],
  ["wicomicocounty", 0.032],
  ["worcestercounty", 0.0225],
  ["nonresident", 0.0225],
]);

function toWholeDollars(value: number): number {
  return Math.round(value);
}

function normalizeMarylandJurisdiction(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return normalizeTextMatch(value).replace(/[^a-z]/g, "");
}

function dedupeJurisdictions(jurisdictions: readonly (string | null)[]): readonly string[] {
  return [...new Set(jurisdictions.filter((value): value is string => value != null))];
}

function filterMarylandLocalJurisdictionFacts(
  localJurisdictionFacts: readonly CoreEngineStateLocalJurisdictionFact[],
  returnKind: CoreEngineStateReturn["return_kind"],
): readonly CoreEngineStateLocalJurisdictionFact[] {
  const matchingResidentStatuses =
    returnKind === "resident"
      ? ["resident", "full_year_resident", "local_resident"]
      : returnKind === "part_year_resident"
        ? ["part_year_resident", "resident", "local_resident"]
        : ["nonresident"];
  const filtered = localJurisdictionFacts.filter((fact) =>
    matchingResidentStatuses.includes(
      normalizeTextMatch(asString(fact.resident_status) ?? "resident"),
    ),
  );

  return filtered.length > 0 ? filtered : localJurisdictionFacts;
}

function resolveMarylandLocalJurisdictionCandidates(
  input: CoreEngineInput,
  stateReturn: CoreEngineStateReturn,
  formRecord: Record<string, unknown> | undefined,
): readonly string[] {
  const explicit =
    asString(formRecord?.local_jurisdiction_name) ??
    asString(formRecord?.local_jurisdiction) ??
    asString(formRecord?.county_name) ??
    asString(formRecord?.county);

  if (explicit) {
    return dedupeJurisdictions([normalizeMarylandJurisdiction(explicit)]);
  }

  if (stateReturn.local_returns.length > 0) {
    const jurisdictions = dedupeJurisdictions(
      stateReturn.local_returns.map(
        (localReturn) =>
          normalizeMarylandJurisdiction(localReturn.jurisdiction_name) ??
          normalizeMarylandJurisdiction(localReturn.jurisdiction_code),
      ),
    );

    if (jurisdictions.length > 0) {
      return jurisdictions;
    }
  }

  if ((stateReturn.local_return_refs?.length ?? 0) > 0) {
    const jurisdictions = dedupeJurisdictions(
      (stateReturn.local_return_refs ?? []).map((localReturnRef) =>
        normalizeMarylandJurisdiction(localReturnRef.jurisdiction_code),
      ),
    );

    if (jurisdictions.length > 0) {
      return jurisdictions;
    }
  }

  const localJurisdictionFacts =
    input.facts.state?.local_jurisdictions.filter(
      (fact) =>
        fact.state_code === "MD" &&
        normalizeMarylandJurisdiction(fact.jurisdiction_name ?? fact.jurisdiction_code) != null,
    ) ?? [];

  if (localJurisdictionFacts.length === 0) {
    return [];
  }

  const preferredJurisdictionFacts = filterMarylandLocalJurisdictionFacts(
    localJurisdictionFacts,
    stateReturn.return_kind,
  );
  const preferredJurisdictions = dedupeJurisdictions(
    preferredJurisdictionFacts.map((fact) =>
      normalizeMarylandJurisdiction(fact.jurisdiction_name ?? fact.jurisdiction_code),
    ),
  );

  if (preferredJurisdictions.length === 1) {
    return preferredJurisdictions;
  }

  const sortedPreferredFacts = [...preferredJurisdictionFacts].sort((left, right) => {
    const leftEnd = Date.parse(asString(left.residency_end_date) ?? "9999-12-31");
    const rightEnd = Date.parse(asString(right.residency_end_date) ?? "9999-12-31");

    if (leftEnd !== rightEnd) {
      return rightEnd - leftEnd;
    }

    const leftStart = Date.parse(asString(left.residency_start_date) ?? "0001-01-01");
    const rightStart = Date.parse(asString(right.residency_start_date) ?? "0001-01-01");

    if (leftStart !== rightStart) {
      return rightStart - leftStart;
    }

    const leftIncome = (left.local_source_wages ?? 0) + (left.local_source_other_income ?? 0);
    const rightIncome = (right.local_source_wages ?? 0) + (right.local_source_other_income ?? 0);
    return rightIncome - leftIncome;
  });

  if (sortedPreferredFacts.length > 0) {
    return dedupeJurisdictions([
      normalizeMarylandJurisdiction(
        sortedPreferredFacts[0]?.jurisdiction_name ?? sortedPreferredFacts[0]?.jurisdiction_code,
      ),
      ...preferredJurisdictions,
    ]);
  }

  return dedupeJurisdictions(
    localJurisdictionFacts.map((fact) =>
      normalizeMarylandJurisdiction(fact.jurisdiction_name ?? fact.jurisdiction_code),
    ),
  );
}

function calculateAnneArundelCountyTax(
  taxableIncome: number,
  filingStatus: MarylandFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (
    filingStatus === "married_filing_jointly" ||
    filingStatus === "head_of_household" ||
    filingStatus === "qualifying_surviving_spouse"
  ) {
    if (taxableIncome <= 75_000) {
      return toWholeDollars(taxableIncome * 0.027);
    }

    if (taxableIncome <= 480_000) {
      return toWholeDollars(2_025 + (taxableIncome - 75_000) * 0.0294);
    }

    return toWholeDollars(13_932 + (taxableIncome - 480_000) * 0.032);
  }

  if (taxableIncome <= 50_000) {
    return toWholeDollars(taxableIncome * 0.027);
  }

  if (taxableIncome <= 400_000) {
    return toWholeDollars(1_350 + (taxableIncome - 50_000) * 0.0294);
  }

  return toWholeDollars(11_640 + (taxableIncome - 400_000) * 0.032);
}

function calculateFrederickCountyTax(
  taxableIncome: number,
  filingStatus: MarylandFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (
    filingStatus === "married_filing_jointly" ||
    filingStatus === "head_of_household" ||
    filingStatus === "qualifying_surviving_spouse"
  ) {
    if (taxableIncome <= 25_000) {
      return toWholeDollars(taxableIncome * 0.0225);
    }

    if (taxableIncome <= 100_000) {
      return toWholeDollars(25_000 * 0.0225 + (taxableIncome - 25_000) * 0.0275);
    }

    if (taxableIncome <= 250_000) {
      return toWholeDollars(
        25_000 * 0.0225 + 75_000 * 0.0275 + (taxableIncome - 100_000) * 0.0296,
      );
    }

    return toWholeDollars(
      25_000 * 0.0225 +
        75_000 * 0.0275 +
        150_000 * 0.0296 +
        (taxableIncome - 250_000) * 0.032,
    );
  }

  if (taxableIncome <= 25_000) {
    return toWholeDollars(taxableIncome * 0.0225);
  }

  if (taxableIncome <= 50_000) {
    return toWholeDollars(25_000 * 0.0225 + (taxableIncome - 25_000) * 0.0275);
  }

  if (taxableIncome <= 150_000) {
    return toWholeDollars(
      25_000 * 0.0225 + 25_000 * 0.0275 + (taxableIncome - 50_000) * 0.0296,
    );
  }

  return toWholeDollars(
    25_000 * 0.0225 +
      25_000 * 0.0275 +
      100_000 * 0.0296 +
      (taxableIncome - 150_000) * 0.032,
  );
}

function calculateMarylandLocalTax(args: {
  readonly filingStatus: MarylandFilingStatus;
  readonly input: CoreEngineInput;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateReturn: CoreEngineStateReturn;
  readonly taxableIncome: number;
}): MarylandLocalTaxResult {
  const explicitRate = asNumber(args.formRecord?.local_tax_rate);
  const jurisdictionCandidates = resolveMarylandLocalJurisdictionCandidates(
    args.input,
    args.stateReturn,
    args.formRecord,
  );
  const jurisdictionName = jurisdictionCandidates[0] ?? null;
  const collapsedJurisdictions = jurisdictionCandidates.length > 1;

  if (explicitRate != null) {
    return {
      amount: toWholeDollars(args.taxableIncome * explicitRate),
      collapsedJurisdictions,
      jurisdictionName,
      missingJurisdiction: false,
      usedDefaultMinimumRate: false,
      usedOverrideRate: true,
    };
  }

  if (!jurisdictionName) {
    return {
      amount: toWholeDollars(args.taxableIncome * FIXED_LOCAL_RATE_BY_JURISDICTION.get("nonresident")!),
      collapsedJurisdictions: false,
      jurisdictionName: null,
      missingJurisdiction: false,
      usedDefaultMinimumRate: true,
      usedOverrideRate: false,
    };
  }

  if (jurisdictionName === "annearundelcounty") {
    return {
      amount: calculateAnneArundelCountyTax(args.taxableIncome, args.filingStatus),
      collapsedJurisdictions,
      jurisdictionName,
      missingJurisdiction: false,
      usedDefaultMinimumRate: false,
      usedOverrideRate: false,
    };
  }

  if (jurisdictionName === "frederickcounty") {
    return {
      amount: calculateFrederickCountyTax(args.taxableIncome, args.filingStatus),
      collapsedJurisdictions,
      jurisdictionName,
      missingJurisdiction: false,
      usedDefaultMinimumRate: false,
      usedOverrideRate: false,
    };
  }

  const fixedRate = FIXED_LOCAL_RATE_BY_JURISDICTION.get(jurisdictionName);

  return {
    amount: toWholeDollars(
      args.taxableIncome * (fixedRate ?? FIXED_LOCAL_RATE_BY_JURISDICTION.get("nonresident")!),
    ),
    collapsedJurisdictions,
    jurisdictionName,
    missingJurisdiction: false,
    usedDefaultMinimumRate: fixedRate == null,
    usedOverrideRate: false,
  };
}

export { calculateMarylandLocalTax };

export type { MarylandFilingStatus, MarylandLocalTaxResult };
