import { asNumber } from "../../../helpers";
import { toWholeDollars } from "../../resident";

type NewYorkFilingStatus =
  | "head_of_household"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "qualifying_surviving_spouse"
  | "single";

type HouseholdCreditRow = {
  readonly amountsByPeopleCount: readonly number[];
  readonly extraPersonAmount: number;
  readonly lowerExclusiveBound: number;
  readonly upperInclusiveBound: number;
};

const NEW_YORK_CITY_FIXED_SCHOOL_CREDIT_BY_MONTH = {
  married_filing_jointly: [10, 21, 31, 42, 52, 63, 73, 83, 94, 104, 115, 125],
  qualifying_surviving_spouse: [10, 21, 31, 42, 52, 63, 73, 83, 94, 104, 115, 125],
  head_of_household: [5, 10, 16, 21, 26, 31, 36, 42, 47, 52, 57, 63],
  married_filing_separately: [5, 10, 16, 21, 26, 31, 36, 42, 47, 52, 57, 63],
  single: [5, 10, 16, 21, 26, 31, 36, 42, 47, 52, 57, 63],
} as const satisfies Record<NewYorkFilingStatus, readonly number[]>;

const NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_SINGLE: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 5_000,
    amountsByPeopleCount: [75],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 5_000,
    upperInclusiveBound: 6_000,
    amountsByPeopleCount: [60],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 6_000,
    upperInclusiveBound: 7_000,
    amountsByPeopleCount: [50],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 7_000,
    upperInclusiveBound: 20_000,
    amountsByPeopleCount: [45],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 20_000,
    upperInclusiveBound: 25_000,
    amountsByPeopleCount: [40],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 25_000,
    upperInclusiveBound: 28_000,
    amountsByPeopleCount: [20],
    extraPersonAmount: 0,
  },
];

const NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_JOINT_LIKE: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 5_000,
    amountsByPeopleCount: [90, 105, 120, 135, 150, 165, 180],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 5_000,
    upperInclusiveBound: 6_000,
    amountsByPeopleCount: [75, 90, 105, 120, 135, 150, 165],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 6_000,
    upperInclusiveBound: 7_000,
    amountsByPeopleCount: [65, 80, 95, 110, 125, 140, 155],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 7_000,
    upperInclusiveBound: 20_000,
    amountsByPeopleCount: [60, 75, 90, 105, 120, 135, 150],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 20_000,
    upperInclusiveBound: 22_000,
    amountsByPeopleCount: [60, 70, 80, 90, 100, 110, 120],
    extraPersonAmount: 10,
  },
  {
    lowerExclusiveBound: 22_000,
    upperInclusiveBound: 25_000,
    amountsByPeopleCount: [50, 60, 70, 80, 90, 100, 110],
    extraPersonAmount: 10,
  },
  {
    lowerExclusiveBound: 25_000,
    upperInclusiveBound: 28_000,
    amountsByPeopleCount: [40, 45, 50, 55, 60, 65, 70],
    extraPersonAmount: 5,
  },
  {
    lowerExclusiveBound: 28_000,
    upperInclusiveBound: 32_000,
    amountsByPeopleCount: [20, 25, 30, 35, 40, 45, 50],
    extraPersonAmount: 5,
  },
];

const NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_MFS: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 5_000,
    amountsByPeopleCount: [45, 53, 60, 68, 75, 83, 90],
    extraPersonAmount: 8,
  },
  {
    lowerExclusiveBound: 5_000,
    upperInclusiveBound: 6_000,
    amountsByPeopleCount: [38, 45, 53, 60, 68, 75, 83],
    extraPersonAmount: 8,
  },
  {
    lowerExclusiveBound: 6_000,
    upperInclusiveBound: 7_000,
    amountsByPeopleCount: [33, 40, 48, 55, 63, 70, 78],
    extraPersonAmount: 8,
  },
  {
    lowerExclusiveBound: 7_000,
    upperInclusiveBound: 20_000,
    amountsByPeopleCount: [30, 38, 45, 53, 60, 68, 75],
    extraPersonAmount: 8,
  },
  {
    lowerExclusiveBound: 20_000,
    upperInclusiveBound: 22_000,
    amountsByPeopleCount: [30, 35, 40, 45, 50, 55, 60],
    extraPersonAmount: 5,
  },
  {
    lowerExclusiveBound: 22_000,
    upperInclusiveBound: 25_000,
    amountsByPeopleCount: [25, 30, 35, 40, 45, 50, 55],
    extraPersonAmount: 5,
  },
  {
    lowerExclusiveBound: 25_000,
    upperInclusiveBound: 28_000,
    amountsByPeopleCount: [20, 23, 25, 28, 30, 33, 35],
    extraPersonAmount: 3,
  },
  {
    lowerExclusiveBound: 28_000,
    upperInclusiveBound: 32_000,
    amountsByPeopleCount: [10, 13, 15, 18, 20, 23, 25],
    extraPersonAmount: 3,
  },
];

const NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_SINGLE: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 10_000,
    amountsByPeopleCount: [15],
    extraPersonAmount: 0,
  },
  {
    lowerExclusiveBound: 10_000,
    upperInclusiveBound: 12_500,
    amountsByPeopleCount: [10],
    extraPersonAmount: 0,
  },
];

const NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_JOINT_LIKE: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 15_000,
    amountsByPeopleCount: [30, 60, 90, 120, 150, 180, 210],
    extraPersonAmount: 30,
  },
  {
    lowerExclusiveBound: 15_000,
    upperInclusiveBound: 17_500,
    amountsByPeopleCount: [25, 50, 75, 100, 125, 150, 175],
    extraPersonAmount: 25,
  },
  {
    lowerExclusiveBound: 17_500,
    upperInclusiveBound: 20_000,
    amountsByPeopleCount: [15, 30, 45, 60, 75, 90, 105],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 20_000,
    upperInclusiveBound: 22_500,
    amountsByPeopleCount: [10, 20, 30, 40, 50, 60, 70],
    extraPersonAmount: 10,
  },
];

const NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_MFS: readonly HouseholdCreditRow[] = [
  {
    lowerExclusiveBound: Number.NEGATIVE_INFINITY,
    upperInclusiveBound: 15_000,
    amountsByPeopleCount: [15, 30, 45, 60, 75, 90, 105],
    extraPersonAmount: 15,
  },
  {
    lowerExclusiveBound: 15_000,
    upperInclusiveBound: 17_500,
    amountsByPeopleCount: [13, 25, 38, 50, 63, 75, 88],
    extraPersonAmount: 13,
  },
  {
    lowerExclusiveBound: 17_500,
    upperInclusiveBound: 20_000,
    amountsByPeopleCount: [8, 15, 23, 30, 38, 45, 53],
    extraPersonAmount: 8,
  },
  {
    lowerExclusiveBound: 20_000,
    upperInclusiveBound: 22_500,
    amountsByPeopleCount: [5, 10, 15, 20, 25, 30, 35],
    extraPersonAmount: 5,
  },
];

function getPeopleCountAmount(args: {
  readonly amountsByPeopleCount: readonly number[];
  readonly extraPersonAmount: number;
  readonly peopleCount: number;
}): number {
  if (args.peopleCount <= 0) {
    return 0;
  }

  if (args.peopleCount <= args.amountsByPeopleCount.length) {
    return args.amountsByPeopleCount[args.peopleCount - 1] ?? 0;
  }

  const baseAmount = args.amountsByPeopleCount[args.amountsByPeopleCount.length - 1] ?? 0;
  return baseAmount + (args.peopleCount - args.amountsByPeopleCount.length) * args.extraPersonAmount;
}

function calculateHouseholdCreditFromTable(args: {
  readonly adjustedGrossIncome: number;
  readonly peopleCount: number;
  readonly rows: readonly HouseholdCreditRow[];
}): number {
  for (const row of args.rows) {
    if (
      args.adjustedGrossIncome > row.lowerExclusiveBound &&
      args.adjustedGrossIncome <= row.upperInclusiveBound
    ) {
      return getPeopleCountAmount({
        amountsByPeopleCount: row.amountsByPeopleCount,
        extraPersonAmount: row.extraPersonAmount,
        peopleCount: args.peopleCount,
      });
    }
  }

  return 0;
}

function calculateNewYorkStateHouseholdCredit(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: NewYorkFilingStatus;
  readonly peopleCount: number;
}): number {
  if (args.canBeClaimedAsDependent) {
    return 0;
  }

  if (args.filingStatus === "single") {
    return calculateHouseholdCreditFromTable({
      adjustedGrossIncome: args.federalAdjustedGrossIncome,
      peopleCount: 1,
      rows: NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_SINGLE,
    });
  }

  if (args.filingStatus === "married_filing_separately") {
    return calculateHouseholdCreditFromTable({
      adjustedGrossIncome: args.federalAdjustedGrossIncome,
      peopleCount: args.peopleCount,
      rows: NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_MFS,
    });
  }

  return calculateHouseholdCreditFromTable({
    adjustedGrossIncome: args.federalAdjustedGrossIncome,
    peopleCount: args.peopleCount,
    rows: NEW_YORK_STATE_HOUSEHOLD_CREDIT_TABLE_JOINT_LIKE,
  });
}

function calculateNewYorkCityTax(args: {
  readonly filingStatus: NewYorkFilingStatus;
  readonly taxableIncome: number;
}): number {
  if (args.taxableIncome <= 0) {
    return 0;
  }

  if (
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
  ) {
    if (args.taxableIncome <= 21_600) {
      return toWholeDollars(args.taxableIncome * 0.03078);
    }

    if (args.taxableIncome <= 45_000) {
      return toWholeDollars(665 + (args.taxableIncome - 21_600) * 0.03762);
    }

    if (args.taxableIncome <= 90_000) {
      return toWholeDollars(1_545 + (args.taxableIncome - 45_000) * 0.03819);
    }

    return toWholeDollars(3_264 + (args.taxableIncome - 90_000) * 0.03876);
  }

  if (args.filingStatus === "head_of_household") {
    if (args.taxableIncome <= 14_400) {
      return toWholeDollars(args.taxableIncome * 0.03078);
    }

    if (args.taxableIncome <= 30_000) {
      return toWholeDollars(443 + (args.taxableIncome - 14_400) * 0.03762);
    }

    if (args.taxableIncome <= 60_000) {
      return toWholeDollars(1_030 + (args.taxableIncome - 30_000) * 0.03819);
    }

    return toWholeDollars(2_176 + (args.taxableIncome - 60_000) * 0.03876);
  }

  if (args.taxableIncome <= 12_000) {
    return toWholeDollars(args.taxableIncome * 0.03078);
  }

  if (args.taxableIncome <= 25_000) {
    return toWholeDollars(369 + (args.taxableIncome - 12_000) * 0.03762);
  }

  if (args.taxableIncome <= 50_000) {
    return toWholeDollars(858 + (args.taxableIncome - 25_000) * 0.03819);
  }

  return toWholeDollars(1_813 + (args.taxableIncome - 50_000) * 0.03876);
}

function calculateNewYorkCityHouseholdCredit(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: NewYorkFilingStatus;
  readonly peopleCount: number;
}): number {
  if (args.canBeClaimedAsDependent) {
    return 0;
  }

  if (args.filingStatus === "single") {
    return calculateHouseholdCreditFromTable({
      adjustedGrossIncome: args.federalAdjustedGrossIncome,
      peopleCount: 1,
      rows: NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_SINGLE,
    });
  }

  if (args.filingStatus === "married_filing_separately") {
    return calculateHouseholdCreditFromTable({
      adjustedGrossIncome: args.federalAdjustedGrossIncome,
      peopleCount: args.peopleCount,
      rows: NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_MFS,
    });
  }

  return calculateHouseholdCreditFromTable({
    adjustedGrossIncome: args.federalAdjustedGrossIncome,
    peopleCount: args.peopleCount,
    rows: NEW_YORK_CITY_HOUSEHOLD_CREDIT_TABLE_JOINT_LIKE,
  });
}

function calculateNewYorkCitySchoolTaxCreditFixedAmount(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly filingStatus: NewYorkFilingStatus;
  readonly income: number;
  readonly monthsResident: number;
}): number {
  if (args.canBeClaimedAsDependent || args.income > 250_000 || args.monthsResident <= 0) {
    return 0;
  }

  const clampedMonths = Math.max(Math.min(args.monthsResident, 12), 1);
  return NEW_YORK_CITY_FIXED_SCHOOL_CREDIT_BY_MONTH[args.filingStatus][clampedMonths - 1] ?? 0;
}

function calculateNewYorkCitySchoolTaxRateReduction(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly filingStatus: NewYorkFilingStatus;
  readonly taxableIncome: number;
}): number {
  if (args.canBeClaimedAsDependent || args.taxableIncome <= 0 || args.taxableIncome > 500_000) {
    return 0;
  }

  if (
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse"
  ) {
    if (args.taxableIncome <= 21_600) {
      return toWholeDollars(args.taxableIncome * 0.00171);
    }

    return toWholeDollars(37 + (args.taxableIncome - 21_600) * 0.00228);
  }

  if (args.filingStatus === "head_of_household") {
    if (args.taxableIncome <= 14_400) {
      return toWholeDollars(args.taxableIncome * 0.00171);
    }

    return toWholeDollars(25 + (args.taxableIncome - 14_400) * 0.00228);
  }

  if (args.taxableIncome <= 12_000) {
    return toWholeDollars(args.taxableIncome * 0.00171);
  }

  return toWholeDollars(21 + (args.taxableIncome - 12_000) * 0.00228);
}

function resolveNewYorkHouseholdCreditAdjustedGrossIncome(args: {
  readonly combinedAdjustedGrossIncome: number | null;
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: NewYorkFilingStatus;
  readonly spouseAdjustedGrossIncome: number | null;
}): number {
  if (args.filingStatus !== "married_filing_separately") {
    return args.federalAdjustedGrossIncome;
  }

  if (args.combinedAdjustedGrossIncome != null) {
    return toWholeDollars(args.combinedAdjustedGrossIncome);
  }

  if (args.spouseAdjustedGrossIncome != null) {
    return toWholeDollars(args.federalAdjustedGrossIncome + args.spouseAdjustedGrossIncome);
  }

  return args.federalAdjustedGrossIncome;
}

function calculateNewYorkCityProratedStandardDeduction(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly filingStatus: NewYorkFilingStatus;
  readonly monthsResident: number;
}): number {
  const annualStandardDeduction =
    args.filingStatus === "single" && args.canBeClaimedAsDependent
      ? 3_100
      : args.filingStatus === "married_filing_jointly" ||
          args.filingStatus === "qualifying_surviving_spouse"
        ? 16_050
        : args.filingStatus === "head_of_household"
          ? 11_200
          : 8_000;

  return toWholeDollars((annualStandardDeduction * Math.max(Math.min(args.monthsResident, 12), 0)) / 12);
}

function calculateNewYorkCityPartYearResidentTax(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: NewYorkFilingStatus;
  readonly itemizedDeductionAmount: number | null;
  readonly monthsResident: number;
  readonly newYorkAdjustedGrossIncome: number;
  readonly peopleCount: number;
  readonly dependentExemptionCount: number;
  readonly explicitHouseholdCreditAmount: number | null;
  readonly accumulationDistributionCreditAmount: number;
}): {
  readonly dependentExemptionAmount: number;
  readonly dependentExemptionValue: number;
  readonly householdCreditAmount: number;
  readonly residentPeriodAdjustedGrossIncome: number;
  readonly residentPeriodDeduction: number;
  readonly tax: number;
  readonly taxAfterCredits: number;
  readonly taxableIncome: number;
  readonly totalCredits: number;
} {
  const residentRatio = Math.max(Math.min(args.monthsResident, 12), 0) / 12;
  const residentPeriodAdjustedGrossIncome = toWholeDollars(
    args.newYorkAdjustedGrossIncome * residentRatio,
  );
  const residentPeriodDeduction =
    args.itemizedDeductionAmount == null
      ? calculateNewYorkCityProratedStandardDeduction({
          canBeClaimedAsDependent: args.canBeClaimedAsDependent,
          filingStatus: args.filingStatus,
          monthsResident: args.monthsResident,
        })
      : toWholeDollars(args.itemizedDeductionAmount);
  const dependentExemptionValue = toWholeDollars(1_000 * residentRatio);
  const dependentExemptionAmount = dependentExemptionValue * args.dependentExemptionCount;
  const taxableIncome = Math.max(
    residentPeriodAdjustedGrossIncome - residentPeriodDeduction - dependentExemptionAmount,
    0,
  );
  const tax = calculateNewYorkCityTax({
    filingStatus: args.filingStatus,
    taxableIncome,
  });
  const householdCreditAmount =
    args.explicitHouseholdCreditAmount ??
    toWholeDollars(
      calculateNewYorkCityHouseholdCredit({
        canBeClaimedAsDependent: args.canBeClaimedAsDependent,
        federalAdjustedGrossIncome: args.federalAdjustedGrossIncome,
        filingStatus: args.filingStatus,
        peopleCount: args.peopleCount,
      }) * residentRatio,
    );
  const totalCredits = householdCreditAmount + args.accumulationDistributionCreditAmount;

  return {
    dependentExemptionAmount,
    dependentExemptionValue,
    householdCreditAmount,
    residentPeriodAdjustedGrossIncome,
    residentPeriodDeduction,
    tax,
    taxAfterCredits: Math.max(tax - totalCredits, 0),
    taxableIncome,
    totalCredits,
  };
}

function resolveNewYorkCityPartYearResidentTax(args: {
  readonly canBeClaimedAsDependent: boolean;
  readonly filingStatus: NewYorkFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly fullYearDeductionAmount: number;
  readonly fullYearNewYorkAdjustedGrossIncome: number;
  readonly householdCreditFederalAdjustedGrossIncome: number;
  readonly peopleCount: number;
  readonly dependentExemptionCount: number;
  readonly monthsResident: number;
  readonly useItemizedDeduction: boolean;
}): {
  readonly accumulationDistributionCreditAmount: number;
  readonly usesIncomeProxy: boolean;
  readonly usesItemizedDeductionProxy: boolean;
} & ReturnType<typeof calculateNewYorkCityPartYearResidentTax> {
  const adjustedGrossIncomeOverride = asNumber(args.formRecord?.nyc_adjusted_gross_income_amount);
  const itemizedDeductionOverride = asNumber(args.formRecord?.nyc_itemized_deduction_amount);
  const householdCreditOverride = asNumber(args.formRecord?.nyc_household_credit_amount);
  const accumulationDistributionCreditAmount = toWholeDollars(
    asNumber(args.formRecord?.nyc_accumulation_distribution_credit_amount) ?? 0,
  );

  return {
    ...calculateNewYorkCityPartYearResidentTax({
      accumulationDistributionCreditAmount,
      canBeClaimedAsDependent: args.canBeClaimedAsDependent,
      dependentExemptionCount: args.dependentExemptionCount,
      explicitHouseholdCreditAmount:
        householdCreditOverride == null ? null : toWholeDollars(householdCreditOverride),
      federalAdjustedGrossIncome: args.householdCreditFederalAdjustedGrossIncome,
      filingStatus: args.filingStatus,
      itemizedDeductionAmount:
        itemizedDeductionOverride == null ? null : toWholeDollars(itemizedDeductionOverride),
      monthsResident: args.monthsResident,
      newYorkAdjustedGrossIncome:
        adjustedGrossIncomeOverride == null
          ? args.fullYearNewYorkAdjustedGrossIncome
          : toWholeDollars(adjustedGrossIncomeOverride),
      peopleCount: args.peopleCount,
    }),
    accumulationDistributionCreditAmount,
    usesIncomeProxy: adjustedGrossIncomeOverride == null,
    usesItemizedDeductionProxy: args.useItemizedDeduction && itemizedDeductionOverride == null,
  };
}

export {
  calculateNewYorkCityHouseholdCredit,
  calculateNewYorkCityPartYearResidentTax,
  calculateNewYorkCityProratedStandardDeduction,
  calculateNewYorkCitySchoolTaxCreditFixedAmount,
  calculateNewYorkCitySchoolTaxRateReduction,
  calculateNewYorkCityTax,
  resolveNewYorkHouseholdCreditAdjustedGrossIncome,
  resolveNewYorkCityPartYearResidentTax,
  calculateNewYorkStateHouseholdCredit,
};

export type {
  NewYorkFilingStatus,
};
