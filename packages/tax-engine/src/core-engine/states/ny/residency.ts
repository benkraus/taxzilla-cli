import { asBoolean, asNumber, asRecord, normalizeTextMatch } from "../../helpers";
import type { StateArtifactsArgs } from "../common";
import { toWholeDollars } from "../resident";
import type { NewYorkFilingStatus } from "./local";

const NEW_YORK_CITY_LOCAL_ALIASES = new Set([
  "bronx",
  "kings",
  "newyork",
  "newyorkcity",
  "nyc",
  "queens",
  "richmond",
]);

type NewYorkCityResidency = {
  readonly applies: boolean;
  readonly fullYear: boolean;
  readonly localReturn: StateArtifactsArgs["stateReturn"]["local_returns"][number] | null;
  readonly monthsResident: number;
  readonly partYear: boolean;
};

function normalizeLocalJurisdiction(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return normalizeTextMatch(value).replace(/[^a-z]/g, "");
}

function resolveNewYorkCityResidency(
  formRecord: Record<string, unknown> | undefined,
  stateReturn: StateArtifactsArgs["stateReturn"],
): NewYorkCityResidency {
  const explicitMonths = asNumber(formRecord?.nyc_resident_months);
  const explicitFullYear = asBoolean(formRecord?.nyc_full_year_resident) === true;
  const explicitPartYear = asBoolean(formRecord?.nyc_part_year_resident) === true;
  const localReturn =
    stateReturn.local_returns.find((entry) => {
      const jurisdiction =
        normalizeLocalJurisdiction(entry.jurisdiction_name) ??
        normalizeLocalJurisdiction(entry.jurisdiction_code);
      return jurisdiction != null && NEW_YORK_CITY_LOCAL_ALIASES.has(jurisdiction);
    }) ?? null;

  const localResidentStatus = localReturn?.resident_status.trim().toLowerCase() ?? "";
  const monthsResident = explicitMonths != null
    ? Math.max(Math.min(toWholeDollars(explicitMonths), 12), 0)
    : localReturn != null && localResidentStatus.includes("part")
      ? Math.max(
          Math.min(
            toWholeDollars(
              asNumber(asRecord(localReturn.plugin_fact_bag)?.nyc_resident_months) ?? 0,
            ),
            12,
          ),
          0,
        )
      : localReturn != null || explicitFullYear
        ? 12
        : 0;
  const applies = explicitFullYear || explicitPartYear || localReturn != null || monthsResident > 0;
  const partYear =
    explicitPartYear ||
    (explicitMonths != null && explicitMonths > 0 && explicitMonths < 12) ||
    localResidentStatus.includes("part");

  return {
    applies,
    fullYear: applies && !partYear,
    localReturn,
    monthsResident: monthsResident === 0 && applies ? 12 : monthsResident,
    partYear,
  };
}

function getNewYorkHouseholdCreditPeopleCount(
  input: StateArtifactsArgs["input"],
  filingStatus: NewYorkFilingStatus,
): number {
  return (
    input.household.dependents.length +
    (filingStatus === "married_filing_jointly" ||
    filingStatus === "married_filing_separately" ||
    filingStatus === "qualifying_surviving_spouse"
      ? 2
      : 1)
  );
}

export {
  getNewYorkHouseholdCreditPeopleCount,
  resolveNewYorkCityResidency,
};

export type { NewYorkCityResidency };
