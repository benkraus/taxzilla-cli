import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
  sumNamedAmounts,
  sumNumbers,
} from "../../helpers";
import { sumScheduleCBusinessNetProfit } from "../../income-amounts";
import { resolveNonemployeeCompensationAmount } from "../../income-source-documents";
import type { StateArtifactsArgs } from "../common";
import {
  countDependentExemptions,
  countPersonalExemptions,
  countSeniorTaxpayers,
  normalizeResidentFilingStatus,
  toWholeDollars,
} from "../resident";

const HAWAII_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 6_424,
  married_filing_jointly: 8_800,
  married_filing_separately: 4_400,
  qualifying_surviving_spouse: 8_800,
  single: 4_400,
} as const;
const HAWAII_REGULAR_EXEMPTION_AMOUNT = 1_144;

type HawaiiFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;
type HawaiiExemptionComputation = {
  readonly totalExemptions: number;
  readonly usesDisabilityExemption: boolean;
};

function getHawaiiItemizedDeductionThreshold(filingStatus: HawaiiFilingStatus): number {
  return filingStatus === "married_filing_separately" ? 83_400 : 166_800;
}

function calculateHawaiiEarnedIncome(input: StateArtifactsArgs["input"]): number {
  const wages = input.facts.income.wages.reduce(
    (sum, wage) => sum + Math.max(wage.wages_tips_other_compensation ?? 0, 0),
    0,
  );
  const scheduleCBusinessIncome = Math.max(
    sumScheduleCBusinessNetProfit(input.facts.income.schedule_c_businesses),
    0,
  );
  const nonemployeeCompensation = input.facts.income.nonemployee_compensation.reduce(
    (sum, item) =>
      sum + Math.max(resolveNonemployeeCompensationAmount(item, input.source_documents), 0),
    0,
  );

  return toWholeDollars(wages + scheduleCBusinessIncome + nonemployeeCompensation);
}

function calculateHawaiiStandardDeduction(args: {
  readonly filingStatus: HawaiiFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.standard_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const standardDeduction = HAWAII_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const canBeClaimedAsDependent = args.input.household.can_be_claimed_as_dependent ?? false;

  if (!canBeClaimedAsDependent) {
    return standardDeduction;
  }

  const earnedIncome = calculateHawaiiEarnedIncome(args.input);
  return Math.min(Math.max(500, earnedIncome), standardDeduction);
}

function sumHawaiiMortgageInterest(input: StateArtifactsArgs["input"]): number {
  return toWholeDollars(
    sumNumbers(
      input.facts.itemized_deductions.mortgage_interest_items.map(
        (item) =>
          (item.mortgage_interest_received ?? 0) +
          (item.points_paid ?? 0) +
          (item.mortgage_insurance_premiums ?? 0),
      ),
    ),
  );
}

function calculateHawaiiMedicalDeduction(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.medical_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  return Math.max(
    toWholeDollars(args.input.facts.itemized_deductions.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.adjustedGrossIncome * 0.075),
    0,
  );
}

function isHawaiiOtherItemizedDeductionMatch(
  description: string | null,
  patterns: ReadonlyArray<RegExp>,
): boolean {
  if (!description) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(description));
}

function calculateHawaiiEstimatedItemizedDeductionTotal(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitTotal = asNumber(args.formRecord?.itemized_deductions_total);

  if (explicitTotal != null) {
    return toWholeDollars(explicitTotal);
  }

  const itemizedFacts = args.stateArtifactsArgs.input.facts.itemized_deductions;
  const medicalDeduction = calculateHawaiiMedicalDeduction({
    adjustedGrossIncome: args.adjustedGrossIncome,
    formRecord: args.formRecord,
    input: args.stateArtifactsArgs.input,
  });
  const taxesDeduction = toWholeDollars(
    (itemizedFacts.state_and_local_income_or_sales_taxes ?? 0) +
      (itemizedFacts.real_estate_taxes ?? 0) +
      (itemizedFacts.personal_property_taxes ?? 0) +
      (itemizedFacts.other_taxes ?? 0),
  );
  const charitableDeduction = toWholeDollars(
    (itemizedFacts.charitable_cash_contributions ?? 0) +
      (itemizedFacts.charitable_noncash_contributions ?? 0),
  );
  const casualtyDeduction = toWholeDollars(itemizedFacts.casualty_and_theft_losses ?? 0);
  const otherDeductionTotal = toWholeDollars(sumNamedAmounts(itemizedFacts.other_itemized_deductions));
  const estimatedTotal = toWholeDollars(
    medicalDeduction +
      taxesDeduction +
      sumHawaiiMortgageInterest(args.stateArtifactsArgs.input) +
      charitableDeduction +
      casualtyDeduction +
      otherDeductionTotal,
  );

  if (estimatedTotal > 0) {
    return estimatedTotal;
  }

  return toWholeDollars(
    args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
      ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
      : 0,
  );
}

function calculateHawaiiUnlimitedItemizedDeductionBucket(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly itemizedDeductionTotal: number;
}): number {
  const itemizedFacts = args.input.facts.itemized_deductions;
  const investmentInterestOverride = asNumber(args.formRecord?.investment_interest_amount);
  const gamblingAndCasualtyLossOverride = asNumber(
    args.formRecord?.gambling_and_casualty_losses_amount,
  );
  const investmentInterestFromOtherDeductions = sumNamedAmounts(
    itemizedFacts.other_itemized_deductions.filter((entry) =>
      isHawaiiOtherItemizedDeductionMatch(asString(entry.description), [/investment interest/i]),
    ),
  );
  const gamblingAndCasualtyLossesFromOtherDeductions = sumNamedAmounts(
    itemizedFacts.other_itemized_deductions.filter((entry) =>
      isHawaiiOtherItemizedDeductionMatch(asString(entry.description), [
        /gambling/i,
        /casualty/i,
        /theft/i,
      ]),
    ),
  );
  const unlimitedBucket = toWholeDollars(
    calculateHawaiiMedicalDeduction({
      adjustedGrossIncome: args.adjustedGrossIncome,
      formRecord: args.formRecord,
      input: args.input,
    }) +
      toWholeDollars(investmentInterestOverride ?? investmentInterestFromOtherDeductions) +
      toWholeDollars(itemizedFacts.casualty_and_theft_losses ?? 0) +
      toWholeDollars(
        gamblingAndCasualtyLossOverride ?? gamblingAndCasualtyLossesFromOtherDeductions,
      ),
  );

  return Math.min(unlimitedBucket, args.itemizedDeductionTotal);
}

function calculateHawaiiLimitedItemizedDeduction(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: HawaiiFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly isLimited: boolean;
  readonly itemizedDeductionAmount: number;
  readonly worksheetBaseAmount: number;
} {
  const overrideAmount = asNumber(args.formRecord?.itemized_deduction_amount);

  if (overrideAmount != null) {
    return {
      isLimited: false,
      itemizedDeductionAmount: toWholeDollars(overrideAmount),
      worksheetBaseAmount: toWholeDollars(overrideAmount),
    };
  }

  const worksheetBaseAmount = calculateHawaiiEstimatedItemizedDeductionTotal({
    adjustedGrossIncome: args.adjustedGrossIncome,
    formRecord: args.formRecord,
    stateArtifactsArgs: args.stateArtifactsArgs,
  });
  const adjustedGrossIncomeThreshold = getHawaiiItemizedDeductionThreshold(args.filingStatus);

  if (worksheetBaseAmount <= 0 || args.adjustedGrossIncome <= adjustedGrossIncomeThreshold) {
    return {
      isLimited: false,
      itemizedDeductionAmount: worksheetBaseAmount,
      worksheetBaseAmount,
    };
  }

  const unlimitedBucket = calculateHawaiiUnlimitedItemizedDeductionBucket({
    adjustedGrossIncome: args.adjustedGrossIncome,
    formRecord: args.formRecord,
    input: args.stateArtifactsArgs.input,
    itemizedDeductionTotal: worksheetBaseAmount,
  });

  if (unlimitedBucket >= worksheetBaseAmount) {
    return {
      isLimited: false,
      itemizedDeductionAmount: worksheetBaseAmount,
      worksheetBaseAmount,
    };
  }

  const limitedBucket = worksheetBaseAmount - unlimitedBucket;
  const reduction = Math.min(
    toWholeDollars(limitedBucket * 0.8),
    toWholeDollars((args.adjustedGrossIncome - adjustedGrossIncomeThreshold) * 0.03),
  );

  return {
    isLimited: reduction > 0,
    itemizedDeductionAmount: Math.max(worksheetBaseAmount - reduction, 0),
    worksheetBaseAmount,
  };
}

function getHawaiiSeniorExemptionEligibleCount(args: {
  readonly filingStatus: HawaiiFilingStatus;
  readonly input: StateArtifactsArgs["input"];
  readonly excludedPersonIds?: ReadonlySet<string>;
}): number {
  const excludedPersonIds = args.excludedPersonIds ?? new Set<string>();
  const householdCanBeClaimedAsDependent = args.input.household.can_be_claimed_as_dependent ?? false;
  let count = 0;

  for (const person of [
    args.input.household.taxpayer,
    args.filingStatus === "married_filing_jointly" ? args.input.household.spouse : undefined,
  ]) {
    const personRecord = asRecord(person);
    const personId = asString(personRecord?.person_id);
    const canBeClaimedAsDependent =
      asBoolean(personRecord?.can_be_claimed_as_dependent) ?? householdCanBeClaimedAsDependent;
    const age = getAgeOnLastDayOfTaxYear(asString(personRecord?.date_of_birth), args.input.tax_year);

    if (
      personId != null &&
      !excludedPersonIds.has(personId) &&
      canBeClaimedAsDependent !== true &&
      age != null &&
      age >= 65
    ) {
      count += 1;
    }
  }

  return count;
}

function calculateHawaiiDeduction(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: HawaiiFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly itemizedDeductionAmount: number;
  readonly selectedDeductionAmount: number;
  readonly standardDeductionAmount: number;
  readonly usesItemizedDeduction: boolean;
  readonly worksheetBaseAmount: number;
  readonly worksheetLimitedAmount: boolean;
} {
  const standardDeductionAmount = calculateHawaiiStandardDeduction({
    filingStatus: args.filingStatus,
    formRecord: args.formRecord,
    input: args.stateArtifactsArgs.input,
  });
  const limitedItemizedDeduction = calculateHawaiiLimitedItemizedDeduction({
    adjustedGrossIncome: args.adjustedGrossIncome,
    filingStatus: args.filingStatus,
    formRecord: args.formRecord,
    stateArtifactsArgs: args.stateArtifactsArgs,
  });
  const itemizedDeductionAmount = limitedItemizedDeduction.itemizedDeductionAmount;
  const useItemizedDeduction =
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionAmount > standardDeductionAmount);

  return {
    itemizedDeductionAmount,
    selectedDeductionAmount: useItemizedDeduction
      ? itemizedDeductionAmount
      : standardDeductionAmount,
    standardDeductionAmount,
    usesItemizedDeduction: useItemizedDeduction,
    worksheetBaseAmount: limitedItemizedDeduction.worksheetBaseAmount,
    worksheetLimitedAmount: limitedItemizedDeduction.isLimited,
  };
}

function calculateHawaiiExemptions(args: {
  readonly filingStatus: HawaiiFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): HawaiiExemptionComputation {
  const overrideAmount = asNumber(args.formRecord?.exemption_amount);

  if (overrideAmount != null) {
    return {
      totalExemptions: toWholeDollars(overrideAmount),
      usesDisabilityExemption: false,
    };
  }

  const taxpayerId = asString(asRecord(args.input.household.taxpayer)?.person_id);
  const spouseId = asString(asRecord(args.input.household.spouse)?.person_id);
  const taxpayerClaimsDisabilityExemption =
    asBoolean(args.formRecord?.taxpayer_claims_disability_exemption) === true ||
    asBoolean(asRecord(args.input.household.taxpayer)?.is_blind) === true ||
    (asBoolean(args.formRecord?.claim_disability_exemption) === true &&
      (args.filingStatus !== "married_filing_jointly" ||
        asBoolean(asRecord(args.input.household.spouse)?.is_blind) !== true));
  const spouseClaimsDisabilityExemption =
    args.filingStatus === "married_filing_jointly" &&
    (asBoolean(args.formRecord?.spouse_claims_disability_exemption) === true ||
      asBoolean(asRecord(args.input.household.spouse)?.is_blind) === true);
  const disabilityExemptionCount =
    Number(taxpayerClaimsDisabilityExemption) + Number(spouseClaimsDisabilityExemption);

  if (disabilityExemptionCount > 0) {
    if (disabilityExemptionCount >= 2) {
      return {
        totalExemptions: 14_000,
        usesDisabilityExemption: true,
      };
    }

    const excludedPersonIds = new Set<string>(
      [taxpayerClaimsDisabilityExemption ? taxpayerId : null, spouseClaimsDisabilityExemption ? spouseId : null].filter(
        (personId): personId is string => personId != null,
      ),
    );
    const nonDisabledPersonalExemptionCount = Math.max(
      countPersonalExemptions(args.input, args.filingStatus) - disabilityExemptionCount,
      0,
    );
    const nonDisabledSeniorExemptionCount = getHawaiiSeniorExemptionEligibleCount({
      filingStatus: args.filingStatus,
      input: args.input,
      excludedPersonIds,
    });

    return {
      totalExemptions:
        7_000 +
        nonDisabledPersonalExemptionCount * HAWAII_REGULAR_EXEMPTION_AMOUNT +
        nonDisabledSeniorExemptionCount * HAWAII_REGULAR_EXEMPTION_AMOUNT,
      usesDisabilityExemption: true,
    };
  }

  const exemptionCount =
    countPersonalExemptions(args.input, args.filingStatus) +
    countDependentExemptions(args.input) +
    countSeniorTaxpayers(args.input);

  return {
    totalExemptions: exemptionCount * HAWAII_REGULAR_EXEMPTION_AMOUNT,
    usesDisabilityExemption: false,
  };
}

export {
  calculateHawaiiDeduction,
  calculateHawaiiExemptions,
  type HawaiiExemptionComputation,
  type HawaiiFilingStatus,
};
