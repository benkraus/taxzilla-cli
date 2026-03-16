import {
  decodeCanonicalReturnEnvelope,
  sampleReturnTy2025,
  type CanonicalReturnEnvelope,
} from "@taxzilla/tax-engine";
import { Either } from "effect";
import { readFile } from "node:fs/promises";

import {
  CliCanonicalValidationError,
  CliFileReadError,
  CliJsonParseError,
} from "./errors";
import { buildStarterStateReturns } from "./state-support";
import type { SupportedFilingStatus } from "./types";

export async function loadCanonicalReturnFromFile(path: string): Promise<CanonicalReturnEnvelope> {
  const rawText = await readTextFile(path);
  const parsed = parseJson(path, rawText);
  const decoded = decodeCanonicalReturnEnvelope(parsed);

  if (Either.isLeft(decoded)) {
    throw new CliCanonicalValidationError({
      path,
      parseError: decoded.left,
    });
  }

  return structuredClone(decoded.right);
}

export function createStarterReturn(args: {
  readonly returnId: string;
  readonly taxYear: 2025;
  readonly filingStatus: SupportedFilingStatus;
  readonly createdAt: string;
  readonly requestedStateCodes?: ReadonlyArray<string>;
}): CanonicalReturnEnvelope {
  const template = structuredClone(sampleReturnTy2025) as CanonicalReturnEnvelope;
  const blankFacts = blankValue(template.facts);
  const blankElections = blankValue(template.elections);
  const blankResidency = blankValue(template.residency_and_nexus) as Record<string, unknown>;
  const blankArtifacts = blankValue(template.artifacts);
  const requestedStateCodes = [...(args.requestedStateCodes ?? [])];

  return {
    ...template,
    return_id: args.returnId,
    tax_year: args.taxYear,
    processing_year: args.taxYear + 1,
    requested_jurisdictions: {
      federal: true,
      states: requestedStateCodes,
    },
    lifecycle: {
      status: "intake",
      created_at: args.createdAt,
      updated_at: args.createdAt,
      locked_for_filing: false,
    },
    household: {
      filing_status: args.filingStatus,
      taxpayer: {
        person_id: "p_taxpayer",
        role: "taxpayer",
        name: {
          first: "",
          last: "",
          full_legal_name: "",
        },
        date_of_birth: null,
        tax_id_token: null,
        last4_tax_id: "",
        citizenship_status: "us_citizen",
        is_blind: false,
        is_full_time_student: false,
        occupation: "",
        contact: {
          email: "",
          phone: "",
        },
      },
      spouse: null,
      dependents: [],
      can_be_claimed_as_dependent: false,
      is_amended_return: false,
    },
    residency_and_nexus: {
      ...blankResidency,
      primary_home_address: {
        line1: "",
        city: "",
        state_code: requestedStateCodes.length === 1 ? requestedStateCodes[0]! : "",
        postal_code: "",
        country_code: "US",
      },
      mailing_address: null,
      residency_periods: [],
      moves_during_year: [],
      work_states: [],
      military_service: {
        is_active_duty: false,
        legal_residence_state: null,
        spouse_relieved_by_msra: null,
      },
      foreign_residency_days: 0,
    },
    source_documents: [],
    facts: blankFacts,
    elections: blankElections,
    state_returns: buildStarterStateReturns({
      filingStatus: args.filingStatus,
      requestedStateCodes,
    }),
    efile: {
      signature_method: null,
      signers: [],
      partner: null,
      submission_history: [],
    },
    artifacts: blankArtifacts,
    provenance_index: {},
    evidence_log: [],
    extensions: {},
  };
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    throw new CliFileReadError({
      path,
      cause,
    });
  }
}

function parseJson(path: string, rawText: string): unknown {
  try {
    return JSON.parse(rawText) as unknown;
  } catch (cause) {
    throw new CliJsonParseError({
      path,
      cause,
    });
  }
}

function blankValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [];
  }

  if (typeof value === "number") {
    return 0;
  }

  if (typeof value === "string") {
    return "";
  }

  if (typeof value === "boolean") {
    return false;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, blankValue(nestedValue)]),
  );
}
