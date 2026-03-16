import type { StateArtifactsArgs } from "../../common";
import {
  deriveAllocationRatio,
  deriveNonresidentStateSourceIncome,
} from "../../return-kind";
import { toWholeDollars } from "../../resident";

function roundMassachusettsRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatMassachusettsRatio(value: number | null): string | null {
  return value == null ? null : roundMassachusettsRatio(value).toFixed(4);
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countMassachusettsResidentDays(args: StateArtifactsArgs): number | null {
  const explicitDaysInState = args.stateReturn.residency_determination?.days_in_state;
  const explicitDaysEverywhere = args.stateReturn.residency_determination?.days_everywhere;

  if (
    typeof explicitDaysInState === "number" &&
    explicitDaysInState >= 0 &&
    typeof explicitDaysEverywhere === "number" &&
    explicitDaysEverywhere > 0
  ) {
    return Math.min(explicitDaysInState, explicitDaysEverywhere);
  }

  let residentDays = 0;

  for (const period of args.stateReturn.residency_periods) {
    if (period.state_code !== "MA" || period.residency_type.toLowerCase() !== "resident") {
      continue;
    }

    const start = parseIsoDate(period.start_date);
    const end = parseIsoDate(period.end_date);

    if (!start || !end) {
      continue;
    }

    const clampedStart =
      start < new Date(Date.UTC(args.input.tax_year, 0, 1))
        ? new Date(Date.UTC(args.input.tax_year, 0, 1))
        : start;
    const clampedEnd =
      end > new Date(Date.UTC(args.input.tax_year, 11, 31))
        ? new Date(Date.UTC(args.input.tax_year, 11, 31))
        : end;

    if (clampedEnd < clampedStart) {
      continue;
    }

    residentDays += Math.floor((clampedEnd.getTime() - clampedStart.getTime()) / 86_400_000) + 1;
  }

  return residentDays > 0 ? residentDays : null;
}

function getMassachusettsPartYearProration(args: StateArtifactsArgs): {
  readonly ratio: number | null;
  readonly usedIncomeProxy: boolean;
} {
  if (args.returnKindContext?.returnKind !== "part_year_resident") {
    return {
      ratio: null,
      usedIncomeProxy: false,
    };
  }

  const daysEverywhere = args.stateReturn.residency_determination?.days_everywhere ?? 365;
  const residentDays = countMassachusettsResidentDays(args);

  if (residentDays != null && daysEverywhere > 0) {
    return {
      ratio: roundMassachusettsRatio(residentDays / daysEverywhere),
      usedIncomeProxy: false,
    };
  }

  const profile = args.stateReturn.allocation_profile;

  if (
    profile &&
    typeof profile.resident_period_income === "number" &&
    typeof profile.everywhere_income === "number" &&
    profile.everywhere_income > 0
  ) {
    return {
      ratio: roundMassachusettsRatio(profile.resident_period_income / profile.everywhere_income),
      usedIncomeProxy: true,
    };
  }

  return {
    ratio: null,
    usedIncomeProxy: false,
  };
}

function getMassachusettsNonresidentDeductionRatio(args: StateArtifactsArgs): number | null {
  const returnKind = args.returnKindContext?.returnKind ?? "resident";

  if (returnKind === "resident") {
    return null;
  }

  const profile = args.stateReturn.allocation_profile;
  const nonresidentSourceIncome =
    deriveNonresidentStateSourceIncome(args.stateReturn) ??
    (() => {
      if (
        returnKind === "part_year_resident" &&
        profile &&
        typeof profile.state_source_income === "number" &&
        typeof profile.resident_period_income === "number"
      ) {
        return toWholeDollars(
          Math.max(profile.state_source_income - profile.resident_period_income, 0),
        );
      }

      return null;
    })();

  if (nonresidentSourceIncome == null) {
    return returnKind === "nonresident"
      ? roundMassachusettsRatio(
          deriveAllocationRatio(args.stateReturn) ??
            args.returnKindContext?.effectiveRatio ??
            0,
        )
      : 0;
  }

  const nonresidentEverywhereIncome =
    returnKind === "nonresident"
      ? profile?.everywhere_income ?? args.returnKindContext?.originalAdjustedGrossIncome ?? null
      : profile &&
          typeof profile.everywhere_income === "number" &&
          typeof profile.resident_period_income === "number"
        ? Math.max(profile.everywhere_income - profile.resident_period_income, 0)
        : null;

  if (typeof nonresidentEverywhereIncome === "number" && nonresidentEverywhereIncome > 0) {
    return roundMassachusettsRatio(nonresidentSourceIncome / nonresidentEverywhereIncome);
  }

  return returnKind === "nonresident"
    ? roundMassachusettsRatio(
        deriveAllocationRatio(args.stateReturn) ??
          args.returnKindContext?.effectiveRatio ??
          0,
      )
    : nonresidentSourceIncome > 0
      ? 1
      : 0;
}

function getMassachusettsCombinedProrationRatio(args: StateArtifactsArgs): {
  readonly nonresidentRatio: number | null;
  readonly partYearRatio: number | null;
  readonly totalRatio: number;
  readonly usedIncomeProxyForPartYearDays: boolean;
} {
  const returnKind = args.returnKindContext?.returnKind ?? "resident";

  if (returnKind === "resident") {
    return {
      nonresidentRatio: null,
      partYearRatio: null,
      totalRatio: 1,
      usedIncomeProxyForPartYearDays: false,
    };
  }

  if (returnKind === "nonresident") {
    const nonresidentRatio = getMassachusettsNonresidentDeductionRatio(args) ?? 0;
    return {
      nonresidentRatio,
      partYearRatio: null,
      totalRatio: nonresidentRatio,
      usedIncomeProxyForPartYearDays: false,
    };
  }

  const partYearProration = getMassachusettsPartYearProration(args);
  const nonresidentRatio = getMassachusettsNonresidentDeductionRatio(args) ?? 0;
  const partYearRatio = partYearProration.ratio ?? 0;

  return {
    nonresidentRatio,
    partYearRatio,
    totalRatio: roundMassachusettsRatio(
      partYearRatio + (1 - partYearRatio) * nonresidentRatio,
    ),
    usedIncomeProxyForPartYearDays: partYearProration.usedIncomeProxy,
  };
}

export {
  formatMassachusettsRatio,
  getMassachusettsCombinedProrationRatio,
  roundMassachusettsRatio,
};
