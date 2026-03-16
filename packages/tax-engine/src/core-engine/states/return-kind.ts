import type { FormsGraphValidationResult } from "../../blueprint";
import type { CoreEngineFederalSummary } from "../public";
import type { StateArtifactsArgs } from "./common";

type ResidentLikeReturnKind = "resident" | "part_year_resident" | "nonresident";

function toWholeDollars(value: number): number {
  return Math.round(value);
}

function clampRatio(value: number): number {
  return Math.max(Math.min(value, 1), 0);
}

function getResidentLikeReturnKind(
  stateReturn: StateArtifactsArgs["stateReturn"],
): ResidentLikeReturnKind | null {
  switch (stateReturn.return_kind) {
    case "resident":
    case "part_year_resident":
    case "nonresident":
      return stateReturn.return_kind;
    default:
      return null;
  }
}

function deriveAllocationRatio(stateReturn: StateArtifactsArgs["stateReturn"]): number | null {
  const returnKind = getResidentLikeReturnKind(stateReturn);
  const profile = stateReturn.allocation_profile;

  if (!profile || !returnKind || returnKind === "resident") {
    return returnKind === "resident" ? 1 : null;
  }

  const everywhereIncome = profile.everywhere_income;
  const directAllocatedIncome =
    returnKind === "part_year_resident"
      ? profile.resident_period_income
      : profile.nonresident_source_income ?? profile.state_source_income;

  if (
    typeof everywhereIncome === "number" &&
    everywhereIncome > 0 &&
    typeof directAllocatedIncome === "number"
  ) {
    return clampRatio(directAllocatedIncome / everywhereIncome);
  }

  const explicitRatio =
    returnKind === "part_year_resident"
      ? profile.apportionment_ratio ?? profile.source_income_ratio
      : profile.source_income_ratio ?? profile.apportionment_ratio;

  return typeof explicitRatio === "number" ? clampRatio(explicitRatio) : null;
}

function deriveAllocatedStartingPoint(
  stateReturn: StateArtifactsArgs["stateReturn"],
  startingPoint: number,
): number | null {
  const returnKind = getResidentLikeReturnKind(stateReturn);
  const profile = stateReturn.allocation_profile;

  if (!returnKind) {
    return null;
  }

  if (returnKind === "resident") {
    return toWholeDollars(startingPoint);
  }

  if (!profile) {
    return null;
  }

  const explicitAllocatedIncome =
    returnKind === "part_year_resident"
      ? profile.resident_period_income
      : profile.nonresident_source_income ?? profile.state_source_income;

  if (typeof explicitAllocatedIncome === "number") {
    return toWholeDollars(explicitAllocatedIncome);
  }

  const derivedRatio = deriveAllocationRatio(stateReturn);

  return derivedRatio == null ? null : toWholeDollars(startingPoint * derivedRatio);
}

function deriveResidentPeriodIncome(
  stateReturn: StateArtifactsArgs["stateReturn"],
): number | null {
  const profile = stateReturn.allocation_profile;

  if (!profile || typeof profile.resident_period_income !== "number") {
    return null;
  }

  return toWholeDollars(profile.resident_period_income);
}

function deriveNonresidentStateSourceIncome(
  stateReturn: StateArtifactsArgs["stateReturn"],
): number | null {
  const profile = stateReturn.allocation_profile;
  const directAmount = profile?.nonresident_source_income ?? profile?.state_source_income;

  if (typeof directAmount !== "number") {
    return null;
  }

  return toWholeDollars(directAmount);
}

function deriveCombinedStateTaxedIncome(
  stateReturn: StateArtifactsArgs["stateReturn"],
): number | null {
  const returnKind = getResidentLikeReturnKind(stateReturn);

  if (!returnKind) {
    return null;
  }

  if (returnKind === "resident") {
    return null;
  }

  if (returnKind === "nonresident") {
    return deriveNonresidentStateSourceIncome(stateReturn);
  }

  const profile = stateReturn.allocation_profile;

  if (!profile) {
    return null;
  }

  if (typeof profile.state_source_income === "number") {
    return toWholeDollars(profile.state_source_income);
  }

  const residentPeriodIncome = deriveResidentPeriodIncome(stateReturn);
  const nonresidentIncome = deriveNonresidentStateSourceIncome(stateReturn);

  if (residentPeriodIncome == null && nonresidentIncome == null) {
    return null;
  }

  return toWholeDollars((residentPeriodIncome ?? 0) + (nonresidentIncome ?? 0));
}

function hasUsableAllocationProfile(stateReturn: StateArtifactsArgs["stateReturn"]): boolean {
  const returnKind = getResidentLikeReturnKind(stateReturn);

  if (!returnKind || returnKind === "resident") {
    return returnKind === "resident";
  }

  return deriveAllocatedStartingPoint(stateReturn, 1) != null || deriveAllocationRatio(stateReturn) != null;
}

function supportsAllocatedResidentComputation(
  stateReturn: StateArtifactsArgs["stateReturn"],
  expectedStartingPointStrategy: StateArtifactsArgs["stateReturn"]["starting_point_strategy"],
): boolean {
  if (stateReturn.starting_point_strategy !== expectedStartingPointStrategy) {
    return false;
  }

  const returnKind = getResidentLikeReturnKind(stateReturn);

  if (!returnKind) {
    return false;
  }

  return returnKind === "resident" || hasUsableAllocationProfile(stateReturn);
}

function scaleFederalSummary(
  federalSummary: CoreEngineFederalSummary | undefined,
  ratio: number,
  allocatedAdjustedGrossIncome: number,
): CoreEngineFederalSummary | undefined {
  if (!federalSummary) {
    return undefined;
  }

  const scaledEntries = Object.entries(federalSummary).map(([key, value]) => {
    if (typeof value !== "number") {
      return [key, value] as const;
    }

    if (key === "line11_adjusted_gross_income") {
      return [key, allocatedAdjustedGrossIncome] as const;
    }

    return [key, toWholeDollars(value * ratio)] as const;
  });

  return Object.fromEntries(scaledEntries) as CoreEngineFederalSummary;
}

function normalizeStateArtifactsArgsForReturnKind(
  args: StateArtifactsArgs,
): {
  readonly normalizedArgs: StateArtifactsArgs;
  readonly validationResults: FormsGraphValidationResult[];
} {
  const returnKind = getResidentLikeReturnKind(args.stateReturn);

  if (!returnKind || returnKind === "resident") {
    return {
      normalizedArgs: {
        ...args,
        returnKindContext: {
          allocatedAdjustedGrossIncome: args.adjustedGrossIncome,
          effectiveRatio: 1,
          originalAdjustedGrossIncome: args.adjustedGrossIncome,
          originalFederalSummary: args.federalSummary,
          returnKind: "resident",
        },
      },
      validationResults: [],
    };
  }

  const allocatedAdjustedGrossIncome = deriveAllocatedStartingPoint(
    args.stateReturn,
    args.adjustedGrossIncome,
  );

  if (allocatedAdjustedGrossIncome == null) {
    return {
      normalizedArgs: {
        ...args,
        returnKindContext: {
          allocatedAdjustedGrossIncome: args.adjustedGrossIncome,
          effectiveRatio: null,
          originalAdjustedGrossIncome: args.adjustedGrossIncome,
          originalFederalSummary: args.federalSummary,
          returnKind,
        },
      },
      validationResults: [],
    };
  }

  const explicitRatio = deriveAllocationRatio(args.stateReturn);
  const effectiveRatio =
    explicitRatio ??
    (args.adjustedGrossIncome > 0
      ? allocatedAdjustedGrossIncome / args.adjustedGrossIncome
      : null);
  const scaledFederalSummary =
    effectiveRatio == null
      ? args.federalSummary
      : scaleFederalSummary(args.federalSummary, effectiveRatio, allocatedAdjustedGrossIncome);
  const allocationMethod = args.stateReturn.allocation_profile?.allocation_method ?? "derived_ratio";

  return {
    normalizedArgs: {
      ...args,
      adjustedGrossIncome: allocatedAdjustedGrossIncome,
      federalSummary: scaledFederalSummary,
      returnKindContext: {
        allocatedAdjustedGrossIncome,
        effectiveRatio,
        originalAdjustedGrossIncome: args.adjustedGrossIncome,
        originalFederalSummary: args.federalSummary,
        returnKind,
      },
    },
    validationResults: [
      {
        rule_id: `${args.stateReturn.state_code}.allocation_profile_applied`,
        severity: "info",
        status: "pass",
        message: `Applied ${returnKind.replaceAll("_", " ")} allocation inputs using ${allocationMethod} to drive state computation.`,
        node_ids: [`bridge.${args.stateReturn.state_code.toLowerCase()}.starting_point`],
      },
    ],
  };
}

export {
  deriveCombinedStateTaxedIncome,
  deriveAllocatedStartingPoint,
  deriveAllocationRatio,
  deriveNonresidentStateSourceIncome,
  deriveResidentPeriodIncome,
  getResidentLikeReturnKind,
  hasUsableAllocationProfile,
  normalizeStateArtifactsArgsForReturnKind,
  supportsAllocatedResidentComputation,
};
