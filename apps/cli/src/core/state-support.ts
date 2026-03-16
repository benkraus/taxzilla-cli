import {
  sampleReturnTy2025,
  statesRegistryTy2025,
  type CanonicalReturnEnvelope,
  type StatePluginManifest,
} from "@taxzilla/tax-engine";

import { CliUsageError } from "./errors";
import type { SupportedFilingStatus } from "./types";

const starterStateTemplate = structuredClone(
  sampleReturnTy2025.state_returns.CA,
) as Record<string, unknown>;

const stateManifestByCode = new Map(
  statesRegistryTy2025.map((manifest) => [manifest.state_code, manifest] as const),
);

export const cliSupportedStateCodes = statesRegistryTy2025.map((manifest) => manifest.state_code);

export function parseRequestedStateCodes(
  rawValues: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const requestedStateCodes: string[] = [];
  const seen = new Set<string>();
  const invalidStateCodes: string[] = [];

  for (const rawValue of rawValues) {
    const normalizedEntries = rawValue
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value.length > 0);

    for (const stateCode of normalizedEntries) {
      if (!stateManifestByCode.has(stateCode)) {
        invalidStateCodes.push(stateCode);
        continue;
      }

      if (seen.has(stateCode)) {
        continue;
      }

      seen.add(stateCode);
      requestedStateCodes.push(stateCode);
    }
  }

  if (invalidStateCodes.length > 0) {
    throw new CliUsageError({
      message:
        invalidStateCodes.length === 1
          ? `Unknown state code: ${invalidStateCodes[0]}. Use a two-letter USPS state code such as CA or NY.`
          : `Unknown state codes: ${invalidStateCodes.join(", ")}. Use two-letter USPS state codes such as CA or NY.`,
    });
  }

  return requestedStateCodes;
}

export function formatRequestedStateCodes(stateCodes: ReadonlyArray<string>): string {
  return stateCodes.length === 0 ? "none" : stateCodes.join(", ");
}

export function buildStarterStateReturns(args: {
  readonly filingStatus: SupportedFilingStatus;
  readonly requestedStateCodes: ReadonlyArray<string>;
}): CanonicalReturnEnvelope["state_returns"] {
  const stateReturns: Record<string, unknown> = {};

  for (const stateCode of args.requestedStateCodes) {
    const manifest = stateManifestByCode.get(stateCode);

    if (manifest == null) {
      throw new CliUsageError({
        message: `Unknown state code: ${stateCode}.`,
      });
    }

    stateReturns[stateCode] = createStarterStateReturn({
      filingStatus: args.filingStatus,
      manifest,
      stateCode,
    });
  }

  return stateReturns as CanonicalReturnEnvelope["state_returns"];
}

function createStarterStateReturn(args: {
  readonly filingStatus: SupportedFilingStatus;
  readonly manifest: StatePluginManifest;
  readonly stateCode: string;
}) {
  const template = structuredClone(starterStateTemplate) as Record<string, unknown> & {
    prepared_summary?: unknown;
  };
  const returnKind = defaultStateReturnKind(args.manifest);
  delete template.prepared_summary;

  return {
    ...template,
    state_code: args.stateCode,
    enabled: true,
    return_kind: returnKind,
    state_filing_status: args.filingStatus,
    starting_point_strategy: args.manifest.starting_point_strategy,
    federal_reference_pointer: defaultFederalReferencePointer(args.manifest),
    residency_periods: buildStarterResidencyPeriods(args.stateCode, returnKind),
    additions: [],
    subtractions: [],
    state_specific_income_items: [],
    state_specific_deductions: [],
    state_specific_credits: [],
    local_returns: [],
    local_return_refs: [],
    plugin_manifest_id: args.manifest.plugin_manifest_id,
    state_payments: [],
    plugin_fact_bag: {},
  };
}

function defaultStateReturnKind(manifest: StatePluginManifest): StatePluginManifest["supports_return_kinds"][number] {
  if (manifest.supports_return_kinds.includes("resident")) {
    return "resident";
  }

  if (manifest.supports_return_kinds.includes("no_return_required")) {
    return "no_return_required";
  }

  if (manifest.supports_return_kinds.includes("informational_only")) {
    return "informational_only";
  }

  if (manifest.supports_return_kinds.includes("extension_only")) {
    return "extension_only";
  }

  return manifest.supports_return_kinds[0] ?? "resident";
}

function defaultFederalReferencePointer(manifest: StatePluginManifest): string | null {
  switch (manifest.starting_point_strategy) {
    case "federal_taxable_income":
      return "/artifacts/federal_summary/taxable_income";
    case "federal_agi":
    case "custom":
      return "/artifacts/federal_summary/adjusted_gross_income";
    case "none":
      return null;
    default:
      return null;
  }
}

function buildStarterResidencyPeriods(
  stateCode: string,
  returnKind: StatePluginManifest["supports_return_kinds"][number],
) {
  if (returnKind !== "resident") {
    return [];
  }

  return [
    {
      state_code: stateCode,
      residency_type: "resident",
      taxpayer_or_spouse: "taxpayer",
      start_date: "2025-01-01",
      end_date: "2025-12-31",
    },
  ];
}
