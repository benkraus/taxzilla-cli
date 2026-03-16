import type {
  CoreEngineInput,
  CoreEngineMisc1099IncomeCategory,
  CoreEngineScheduleEActivityType,
} from "../../input";
import {
  MISC_1099_TO_LINE_8Z_CATEGORIES,
  MISC_1099_UNSUPPORTED_CATEGORIES,
} from "./constants";
import { getFederalMisc1099Overrides, normalizeTextMatch, roundMoney } from "../../helpers";
import {
  resolveMisc1099IncomeAmount,
  resolveNonemployeeCompensationAmount,
} from "./income-source-documents";
import type { Misc1099IncomeRollup, NonemployeeCompensationRollup } from "./types";

function addMoneyToMap<Key extends number | string>(
  map: Map<Key, number>,
  key: Key,
  amount: number,
): void {
  map.set(key, roundMoney((map.get(key) ?? 0) + amount));
}

function buildNonemployeeCompensationRollup(
  input: CoreEngineInput,
): NonemployeeCompensationRollup {
  const receiptsByBusinessId = new Map<string, number>();
  const ownedBusinessIdsByPersonId = new Map<string, string[]>();

  for (const business of input.facts.income.schedule_c_businesses) {
    if (!business.owner_person_id || !business.business_id) {
      continue;
    }

    const ownedBusinessIds = ownedBusinessIdsByPersonId.get(business.owner_person_id) ?? [];
    ownedBusinessIds.push(business.business_id);
    ownedBusinessIdsByPersonId.set(business.owner_person_id, ownedBusinessIds);
  }

  let autoLinkedCount = 0;
  let invalidLinkedBusinessCount = 0;
  let line8jAmountTotal = 0;
  let line8jCount = 0;
  let linkedToScheduleCAmountTotal = 0;

  for (const nonemployeeCompensation of input.facts.income.nonemployee_compensation) {
    const amount = resolveNonemployeeCompensationAmount(
      nonemployeeCompensation,
      input.source_documents,
    );

    if (amount === 0) {
      continue;
    }

    const explicitBusinessId = nonemployeeCompensation.linked_business_id;
    const hasExplicitLinkedBusiness =
      explicitBusinessId != null &&
      input.facts.income.schedule_c_businesses.some(
        (business) => business.business_id === explicitBusinessId,
      );

    if (hasExplicitLinkedBusiness) {
      addMoneyToMap(receiptsByBusinessId, explicitBusinessId, amount);
      linkedToScheduleCAmountTotal = roundMoney(linkedToScheduleCAmountTotal + amount);
      continue;
    }

    if (explicitBusinessId != null) {
      invalidLinkedBusinessCount += 1;
    }

    const ownedBusinessIds = ownedBusinessIdsByPersonId.get(nonemployeeCompensation.person_id) ?? [];

    if (ownedBusinessIds.length === 1) {
      const inferredBusinessId = ownedBusinessIds[0]!;
      addMoneyToMap(receiptsByBusinessId, inferredBusinessId, amount);
      linkedToScheduleCAmountTotal = roundMoney(linkedToScheduleCAmountTotal + amount);
      autoLinkedCount += 1;
      continue;
    }

    line8jAmountTotal = roundMoney(line8jAmountTotal + amount);
    line8jCount += 1;
  }

  return {
    autoLinkedCount,
    invalidLinkedBusinessCount,
    line8jAmountTotal,
    line8jCount,
    linkedToScheduleCAmountTotal,
    receiptsByBusinessId,
  };
}

function getScheduleEActivityTypeCandidatesForMisc1099Category(
  incomeCategory: CoreEngineMisc1099IncomeCategory,
): ReadonlyArray<CoreEngineScheduleEActivityType> {
  if (incomeCategory === "rents") {
    return ["rental_real_estate", "farm_rental"];
  }

  if (incomeCategory === "royalties") {
    return ["royalty"];
  }

  return [];
}

function buildMisc1099IncomeRollup(input: CoreEngineInput): Misc1099IncomeRollup {
  let line8bGamblingAmountTotal = 0;
  let line8zOtherIncomeAmountTotal = 0;
  let scheduleEAutoLinkedCount = 0;
  let scheduleEMappedCount = 0;
  let scheduleEMappedIncomeAmountTotal = 0;
  let scheduleEReviewCount = 0;
  let scheduleEReviewIncomeAmountTotal = 0;
  let unsupportedIncomeAmountTotal = 0;
  let unsupportedCount = 0;
  const scheduleEIncomeByActivityIndex = new Map<number, number>();
  const scheduleEMiscIndicesByActivityIndex = new Map<number, number[]>();
  const scheduleEReviewCategories = new Set<CoreEngineMisc1099IncomeCategory>();
  const unsupportedCategories = new Set<CoreEngineMisc1099IncomeCategory>();
  const misc1099OverrideBySourceDocumentId = new Map(
    getFederalMisc1099Overrides(input).map((override) => [override.source_document_id, override]),
  );

  for (const [index, miscellaneousIncome] of input.facts.income.miscellaneous_1099_income.entries()) {
    const amount = resolveMisc1099IncomeAmount(miscellaneousIncome, input.source_documents);

    if (amount === 0) {
      continue;
    }

    const explicitOverride = misc1099OverrideBySourceDocumentId.get(
      miscellaneousIncome.source_document_id,
    );

    if (explicitOverride?.treatment === "ignore_non_taxable") {
      continue;
    }

    if (explicitOverride?.treatment === "schedule1_line8z") {
      line8zOtherIncomeAmountTotal = roundMoney(line8zOtherIncomeAmountTotal + amount);
      continue;
    }

    if (explicitOverride?.treatment === "schedule_e_activity") {
      const matchingActivityIndices = input.facts.income.schedule_e_activities.flatMap(
        (activity, activityIndex) =>
          activity.owner_person_id === miscellaneousIncome.person_id &&
          ((explicitOverride.activity_id && activity.activity_id === explicitOverride.activity_id) ||
            (explicitOverride.activity_entity_name &&
              normalizeTextMatch(activity.entity_name) ===
                normalizeTextMatch(explicitOverride.activity_entity_name)))
            ? [activityIndex]
            : [],
      );

      if (matchingActivityIndices.length === 1) {
        const matchingActivityIndex = matchingActivityIndices[0]!;
        addMoneyToMap(scheduleEIncomeByActivityIndex, matchingActivityIndex, amount);
        const mappedMiscIndices = scheduleEMiscIndicesByActivityIndex.get(matchingActivityIndex) ?? [];
        mappedMiscIndices.push(index);
        scheduleEMiscIndicesByActivityIndex.set(matchingActivityIndex, mappedMiscIndices);
        scheduleEMappedCount += 1;
        scheduleEMappedIncomeAmountTotal = roundMoney(scheduleEMappedIncomeAmountTotal + amount);
        continue;
      }
    }

    if (miscellaneousIncome.income_category === "wagering") {
      line8bGamblingAmountTotal = roundMoney(line8bGamblingAmountTotal + amount);
      continue;
    }

    if (MISC_1099_TO_LINE_8Z_CATEGORIES.has(miscellaneousIncome.income_category)) {
      line8zOtherIncomeAmountTotal = roundMoney(line8zOtherIncomeAmountTotal + amount);
      continue;
    }

    const scheduleEActivityTypeCandidates = getScheduleEActivityTypeCandidatesForMisc1099Category(
      miscellaneousIncome.income_category,
    );

    if (scheduleEActivityTypeCandidates.length > 0) {
      const candidateActivityIndices = input.facts.income.schedule_e_activities.flatMap(
        (activity, activityIndex) =>
          activity.owner_person_id === miscellaneousIncome.person_id &&
          scheduleEActivityTypeCandidates.includes(activity.activity_type)
            ? [activityIndex]
            : [],
      );

      if (candidateActivityIndices.length === 1) {
        const activityIndex = candidateActivityIndices[0]!;
        addMoneyToMap(scheduleEIncomeByActivityIndex, activityIndex, amount);
        const mappedMiscIndices = scheduleEMiscIndicesByActivityIndex.get(activityIndex) ?? [];
        mappedMiscIndices.push(index);
        scheduleEMiscIndicesByActivityIndex.set(activityIndex, mappedMiscIndices);
        scheduleEAutoLinkedCount += 1;
        scheduleEMappedCount += 1;
        scheduleEMappedIncomeAmountTotal = roundMoney(scheduleEMappedIncomeAmountTotal + amount);
        continue;
      }

      scheduleEReviewCategories.add(miscellaneousIncome.income_category);
      scheduleEReviewCount += 1;
      scheduleEReviewIncomeAmountTotal = roundMoney(scheduleEReviewIncomeAmountTotal + amount);
      continue;
    }

    if (MISC_1099_UNSUPPORTED_CATEGORIES.has(miscellaneousIncome.income_category)) {
      unsupportedCategories.add(miscellaneousIncome.income_category);
      unsupportedIncomeAmountTotal = roundMoney(unsupportedIncomeAmountTotal + amount);
      unsupportedCount += 1;
    }
  }

  return {
    line8bGamblingAmountTotal,
    line8zOtherIncomeAmountTotal,
    scheduleEAutoLinkedCount,
    scheduleEIncomeByActivityIndex,
    scheduleEMappedCount,
    scheduleEMappedIncomeAmountTotal,
    scheduleEMiscIndicesByActivityIndex,
    scheduleEReviewCategories: [...scheduleEReviewCategories].sort(),
    scheduleEReviewCount,
    scheduleEReviewIncomeAmountTotal,
    unsupportedCategories: [...unsupportedCategories].sort(),
    unsupportedCount,
    unsupportedIncomeAmountTotal,
  };
}

export {
  buildMisc1099IncomeRollup,
  buildNonemployeeCompensationRollup,
  getScheduleEActivityTypeCandidatesForMisc1099Category,
};
