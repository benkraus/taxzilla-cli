import { Either, Schema } from "effect";

import type { BlueprintTaxYear } from "../blueprint";
import { CoreEngineFederalExtensionSchema } from "./input";
import type {
  CoreEngineFederalEicExtension,
  CoreEngineFederalExtension,
  CoreEngineFederalForm2441Extension,
  CoreEngineFederalForm8812Extension,
  CoreEngineFederalForm8962Extension,
  CoreEngineFederalMisc1099Override,
  CoreEngineInput,
  CoreEngineNamedAmount,
  CoreEngineScheduleEActivity,
  CoreEngineFederalScheduleDExtension,
  CoreEngineFederalScheduleEExtension,
  CoreEngineScheduleELimitationOverride,
  CoreEngineFederalSocialSecurityExtension,
} from "./input";
import { SCHEDULE_E_PART_1_ACTIVITY_TYPES, SCHEDULE_E_PART_2_ACTIVITY_TYPES } from "./constants";
import type { ScheduleEActivityNet, ScheduleERollup } from "./types";

function sumNumbers(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: number | null | undefined): number {
  return value ?? 0;
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeTextMatch(value: string): string {
  return value.trim().toLowerCase();
}

function toPositiveNumber(value: number | null | undefined): number {
  return Math.max(toNumber(value), 0);
}

function getFederalExtension(input: CoreEngineInput): CoreEngineFederalExtension | undefined {
  const decoded = Schema.decodeUnknownEither(CoreEngineFederalExtensionSchema)(
    input.facts.state_specific_fact_bag?.federal,
  );

  return Either.isRight(decoded) ? decoded.right : undefined;
}

function getFederalEicExtension(input: CoreEngineInput): CoreEngineFederalEicExtension | undefined {
  return getFederalExtension(input)?.eic;
}

function getFederalForm8812Extension(
  input: CoreEngineInput,
): CoreEngineFederalForm8812Extension | undefined {
  return getFederalExtension(input)?.form8812;
}

function getFederalForm2441Extension(
  input: CoreEngineInput,
): CoreEngineFederalForm2441Extension | undefined {
  return getFederalExtension(input)?.form2441;
}

function getFederalForm8962Extension(
  input: CoreEngineInput,
): CoreEngineFederalForm8962Extension | undefined {
  return getFederalExtension(input)?.form8962;
}

function getFederalSocialSecurityExtension(
  input: CoreEngineInput,
): CoreEngineFederalSocialSecurityExtension | undefined {
  return getFederalExtension(input)?.social_security;
}

function getFederalScheduleDExtension(
  input: CoreEngineInput,
): CoreEngineFederalScheduleDExtension | undefined {
  return getFederalExtension(input)?.schedule_d;
}

function getFederalScheduleEExtension(
  input: CoreEngineInput,
): CoreEngineFederalScheduleEExtension | undefined {
  return getFederalExtension(input)?.schedule_e;
}

function getFederalScheduleELimitationOverrides(
  input: CoreEngineInput,
): ReadonlyArray<CoreEngineScheduleELimitationOverride> {
  return getFederalScheduleEExtension(input)?.limitation_overrides ?? [];
}

function allowReportedNetLossesWithoutLimitationOverrides(input: CoreEngineInput): boolean {
  return (
    getFederalScheduleEExtension(input)?.allow_reported_net_losses_without_limitation_overrides ===
    true
  );
}

function getFederalMisc1099Overrides(
  input: CoreEngineInput,
): ReadonlyArray<CoreEngineFederalMisc1099Override> {
  return getFederalExtension(input)?.misc_1099?.overrides ?? [];
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function getHouseholdPersonId(person: unknown): string | null {
  return asString(asRecord(person)?.person_id);
}

function getHouseholdPersonDateOfBirth(person: unknown): string | null {
  return asString(asRecord(person)?.date_of_birth);
}

function getHouseholdPersonIsFullTimeStudent(person: unknown): boolean {
  return asBoolean(asRecord(person)?.is_full_time_student) ?? false;
}

function getAgeOnLastDayOfTaxYear(
  dateOfBirth: string | null,
  taxYear: BlueprintTaxYear,
): number | null {
  if (!dateOfBirth) {
    return null;
  }

  const date = new Date(`${dateOfBirth}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const endOfTaxYear = new Date(Date.UTC(taxYear, 11, 31));
  return endOfTaxYear.getUTCFullYear() - date.getUTCFullYear();
}

function sumNumericLeaves(input: unknown): number {
  if (typeof input === "number") {
    return input;
  }

  if (Array.isArray(input)) {
    return sumNumbers(input.map(sumNumericLeaves));
  }

  if (input && typeof input === "object") {
    return sumNumbers(Object.values(input).map(sumNumericLeaves));
  }

  return 0;
}

function sumAdjustmentValues(
  adjustments: CoreEngineInput["facts"]["adjustments"],
  options?: {
    readonly excludedKeys?: ReadonlySet<string>;
    readonly includedKeys?: ReadonlySet<string>;
  },
): number {
  let total = 0;

  for (const [key, value] of Object.entries(adjustments)) {
    if (options?.includedKeys && !options.includedKeys.has(key)) {
      continue;
    }

    if (options?.excludedKeys?.has(key)) {
      continue;
    }

    total += sumNumericLeaves(value);
  }

  return roundMoney(total);
}

function sumNamedAmounts(items: ReadonlyArray<CoreEngineNamedAmount>): number {
  return roundMoney(sumNumbers(items.map((item) => item.amount)));
}

function calculateScheduleEActivityNet(activity: CoreEngineScheduleEActivity): number {
  return roundMoney(sumNamedAmounts(activity.income_items) - sumNamedAmounts(activity.expense_items));
}

function hasScheduleELimitationOverrideData(
  override: CoreEngineScheduleELimitationOverride,
): boolean {
  return (
    override.allowed_net_after_limitations != null ||
    override.prior_year_passive_loss_carryforward_used != null ||
    override.passive_loss_disallowed != null ||
    override.at_risk_loss_disallowed != null ||
    override.basis_loss_disallowed != null
  );
}

function matchScheduleELimitationOverride(
  activity: CoreEngineScheduleEActivity,
  overrides: ReadonlyArray<CoreEngineScheduleELimitationOverride>,
  usedOverrideIndexes: Set<number>,
): CoreEngineScheduleELimitationOverride | undefined {
  let entityNameMatchIndex: number | undefined;

  for (const [index, override] of overrides.entries()) {
    if (usedOverrideIndexes.has(index) || !hasScheduleELimitationOverrideData(override)) {
      continue;
    }

    if (
      override.activity_id &&
      activity.activity_id &&
      override.activity_id === activity.activity_id
    ) {
      usedOverrideIndexes.add(index);
      return override;
    }

    if (
      entityNameMatchIndex === undefined &&
      override.entity_name &&
      normalizeTextMatch(override.entity_name) === normalizeTextMatch(activity.entity_name)
    ) {
      entityNameMatchIndex = index;
    }
  }

  if (entityNameMatchIndex === undefined) {
    return undefined;
  }

  usedOverrideIndexes.add(entityNameMatchIndex);
  return overrides[entityNameMatchIndex];
}

function applyScheduleELimitationOverride(
  rawNetAmount: number,
  override: CoreEngineScheduleELimitationOverride | undefined,
): number {
  if (!override) {
    return rawNetAmount;
  }

  if (override.allowed_net_after_limitations != null) {
    return roundMoney(override.allowed_net_after_limitations);
  }

  const disallowedLossTotal =
    toPositiveNumber(override.passive_loss_disallowed) +
    toPositiveNumber(override.at_risk_loss_disallowed) +
    toPositiveNumber(override.basis_loss_disallowed);
  const priorYearPassiveLossCarryforwardUsed = toPositiveNumber(
    override.prior_year_passive_loss_carryforward_used,
  );

  return roundMoney(rawNetAmount + disallowedLossTotal - priorYearPassiveLossCarryforwardUsed);
}

function buildScheduleERollup(
  activities: ReadonlyArray<CoreEngineScheduleEActivity>,
  options?: {
    readonly additionalIncomeByActivityIndex?: ReadonlyMap<number, number>;
    readonly allowReportedNetLossesWithoutLimitationOverrides?: boolean;
    readonly limitationOverrides?: ReadonlyArray<CoreEngineScheduleELimitationOverride>;
  },
): ScheduleERollup {
  const activityNets: ScheduleEActivityNet[] = [];
  let activityNetInvestmentIncomeTotal = 0;
  let limitationOverrideCount = 0;
  let negativeActivityCount = 0;
  let part1NetTotal = 0;
  let part2NetTotal = 0;
  let unclassifiedActivityCount = 0;
  const usedOverrideIndexes = new Set<number>();

  activities.forEach((activity, index) => {
    const additionalIncome = roundMoney(options?.additionalIncomeByActivityIndex?.get(index) ?? 0);
    const rawNetAmount = roundMoney(calculateScheduleEActivityNet(activity) + additionalIncome);
    const limitationOverride = matchScheduleELimitationOverride(
      activity,
      options?.limitationOverrides ?? [],
      usedOverrideIndexes,
    );
    const netAmount = applyScheduleELimitationOverride(rawNetAmount, limitationOverride);

    if (limitationOverride) {
      limitationOverrideCount += 1;
    }

    activityNets.push({
      activityType: activity.activity_type,
      entityName: activity.entity_name,
      index,
      netAmount,
    });

    if (
      rawNetAmount < 0 &&
      !limitationOverride &&
      options?.allowReportedNetLossesWithoutLimitationOverrides !== true
    ) {
      negativeActivityCount += 1;
    }

    if (activity.materially_participates !== true) {
      activityNetInvestmentIncomeTotal = roundMoney(activityNetInvestmentIncomeTotal + netAmount);
    }

    if (SCHEDULE_E_PART_1_ACTIVITY_TYPES.has(activity.activity_type)) {
      part1NetTotal = roundMoney(part1NetTotal + netAmount);
      return;
    }

    if (SCHEDULE_E_PART_2_ACTIVITY_TYPES.has(activity.activity_type)) {
      part2NetTotal = roundMoney(part2NetTotal + netAmount);
      return;
    }

    unclassifiedActivityCount += 1;
  });

  return {
    activityNets,
    activityNetInvestmentIncomeTotal: roundMoney(activityNetInvestmentIncomeTotal),
    limitationOverrideCount,
    negativeActivityCount,
    part1NetTotal,
    part2NetTotal,
    totalNetTotal: roundMoney(sumNumbers(activityNets.map((activity) => activity.netAmount))),
    unclassifiedActivityCount,
  };
}

export {
  applyScheduleELimitationOverride,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  buildScheduleERollup,
  allowReportedNetLossesWithoutLimitationOverrides,
  getAgeOnLastDayOfTaxYear,
  getFederalEicExtension,
  getFederalExtension,
  getFederalForm2441Extension,
  getFederalForm8812Extension,
  getFederalForm8962Extension,
  getFederalMisc1099Overrides,
  getFederalScheduleDExtension,
  getFederalScheduleEExtension,
  getFederalScheduleELimitationOverrides,
  getFederalSocialSecurityExtension,
  getHouseholdPersonDateOfBirth,
  getHouseholdPersonId,
  getHouseholdPersonIsFullTimeStudent,
  hasScheduleELimitationOverrideData,
  matchScheduleELimitationOverride,
  normalizeTextMatch,
  parseIsoDate,
  roundMoney,
  roundRate,
  sumAdjustmentValues,
  sumNamedAmounts,
  sumNumbers,
  sumNumericLeaves,
  toNumber,
  toPositiveNumber,
  uniqueStrings,
};
