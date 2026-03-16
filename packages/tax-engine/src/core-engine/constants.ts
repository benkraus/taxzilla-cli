import type { CoreEngineMisc1099IncomeCategory, CoreEngineScheduleEActivityType } from "./input";
import type { FederalFilingStatus, FederalTaxBracket } from "./types";

// 2025 baseline standard deductions and ordinary-income rate ceilings from the IRS
// 2025 inflation-adjustment release.
const STANDARD_DEDUCTION_BY_FILING_STATUS: Record<FederalFilingStatus, number> = {
  single: 15750,
  married_filing_jointly: 31500,
  married_filing_separately: 15750,
  head_of_household: 23625,
  qualifying_surviving_spouse: 31500,
};

const FEDERAL_TAX_BRACKETS_BY_FILING_STATUS: Record<
  FederalFilingStatus,
  ReadonlyArray<FederalTaxBracket>
> = {
  single: [
    { ceiling: 11925, rate: 0.1 },
    { ceiling: 48475, rate: 0.12 },
    { ceiling: 103350, rate: 0.22 },
    { ceiling: 197300, rate: 0.24 },
    { ceiling: 250525, rate: 0.32 },
    { ceiling: 626350, rate: 0.35 },
    { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  married_filing_jointly: [
    { ceiling: 23850, rate: 0.1 },
    { ceiling: 96950, rate: 0.12 },
    { ceiling: 206700, rate: 0.22 },
    { ceiling: 394600, rate: 0.24 },
    { ceiling: 501050, rate: 0.32 },
    { ceiling: 751600, rate: 0.35 },
    { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  married_filing_separately: [
    { ceiling: 11925, rate: 0.1 },
    { ceiling: 48475, rate: 0.12 },
    { ceiling: 103350, rate: 0.22 },
    { ceiling: 197300, rate: 0.24 },
    { ceiling: 250525, rate: 0.32 },
    { ceiling: 375800, rate: 0.35 },
    { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  head_of_household: [
    { ceiling: 17000, rate: 0.1 },
    { ceiling: 64850, rate: 0.12 },
    { ceiling: 103350, rate: 0.22 },
    { ceiling: 197300, rate: 0.24 },
    { ceiling: 250500, rate: 0.32 },
    { ceiling: 626350, rate: 0.35 },
    { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  qualifying_surviving_spouse: [
    { ceiling: 23850, rate: 0.1 },
    { ceiling: 96950, rate: 0.12 },
    { ceiling: 206700, rate: 0.22 },
    { ceiling: 394600, rate: 0.24 },
    { ceiling: 501050, rate: 0.32 },
    { ceiling: 751600, rate: 0.35 },
    { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
};

const CHILD_AND_DEPENDENT_CARE_SINGLE_PERSON_EXPENSE_LIMIT = 3000;
const CHILD_AND_DEPENDENT_CARE_MULTI_PERSON_EXPENSE_LIMIT = 6000;
const CHILD_TAX_CREDIT_PER_CHILD = 2200;
const CREDIT_FOR_OTHER_DEPENDENT_AMOUNT = 500;
const ADDITIONAL_CHILD_TAX_CREDIT_PER_CHILD = 1700;
const ADDITIONAL_CHILD_TAX_CREDIT_EARNED_INCOME_THRESHOLD = 2500;
const EARNED_INCOME_CREDIT_INVESTMENT_INCOME_LIMIT_2025 = 11950;
const SELF_EMPLOYMENT_EARNINGS_FACTOR = 0.9235;
const SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE = 0.124;
const SELF_EMPLOYMENT_MEDICARE_RATE = 0.029;
const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const REGULAR_MEDICARE_WITHHOLDING_RATE = 0.0145;
const ADDITIONAL_MEDICARE_TAX_RATE = 0.009;
const NET_INVESTMENT_INCOME_TAX_RATE = 0.038;

const CHILD_TAX_CREDIT_PHASEOUT_THRESHOLD_BY_FILING_STATUS: Record<FederalFilingStatus, number> = {
  single: 200000,
  married_filing_jointly: 400000,
  married_filing_separately: 200000,
  head_of_household: 200000,
  qualifying_surviving_spouse: 400000,
};

type EarnedIncomeCreditChildBucket = 0 | 1 | 2 | 3;

type EarnedIncomeCreditParameters = {
  readonly earnedIncomeAmount: number;
  readonly maxCredit: number;
  readonly phaseInRate: number;
  readonly phaseoutRate: number;
  readonly phaseoutThresholdMarriedJoint: number;
  readonly phaseoutThresholdOther: number;
};

const EARNED_INCOME_CREDIT_PARAMETERS_BY_CHILD_BUCKET: Record<
  EarnedIncomeCreditChildBucket,
  EarnedIncomeCreditParameters
> = {
  0: {
    earnedIncomeAmount: 8490,
    maxCredit: 649,
    phaseInRate: 0.0765,
    phaseoutRate: 0.0765,
    phaseoutThresholdMarriedJoint: 18650,
    phaseoutThresholdOther: 11620,
  },
  1: {
    earnedIncomeAmount: 12730,
    maxCredit: 4328,
    phaseInRate: 0.34,
    phaseoutRate: 0.1598,
    phaseoutThresholdMarriedJoint: 30380,
    phaseoutThresholdOther: 23350,
  },
  2: {
    earnedIncomeAmount: 17880,
    maxCredit: 7152,
    phaseInRate: 0.4,
    phaseoutRate: 0.2106,
    phaseoutThresholdMarriedJoint: 30380,
    phaseoutThresholdOther: 23350,
  },
  3: {
    earnedIncomeAmount: 17880,
    maxCredit: 8046,
    phaseInRate: 0.45,
    phaseoutRate: 0.2106,
    phaseoutThresholdMarriedJoint: 30380,
    phaseoutThresholdOther: 23350,
  },
};

const EDUCATION_CREDIT_PHASEOUT_BY_FILING_STATUS: Record<
  FederalFilingStatus,
  { readonly start: number; readonly end: number }
> = {
  single: { start: 80000, end: 90000 },
  married_filing_jointly: { start: 160000, end: 180000 },
  married_filing_separately: { start: 0, end: 0 },
  head_of_household: { start: 80000, end: 90000 },
  qualifying_surviving_spouse: { start: 160000, end: 180000 },
};

const ADDITIONAL_MEDICARE_THRESHOLD_BY_FILING_STATUS: Record<FederalFilingStatus, number> = {
  single: 200000,
  married_filing_jointly: 250000,
  married_filing_separately: 125000,
  head_of_household: 200000,
  qualifying_surviving_spouse: 250000,
};

const NET_INVESTMENT_INCOME_THRESHOLD_BY_FILING_STATUS: Record<FederalFilingStatus, number> = {
  single: 200000,
  married_filing_jointly: 250000,
  married_filing_separately: 125000,
  head_of_household: 200000,
  qualifying_surviving_spouse: 250000,
};

const QUALIFIED_DIVIDEND_ZERO_RATE_THRESHOLD_BY_FILING_STATUS: Record<FederalFilingStatus, number> =
  {
    single: 48350,
    married_filing_jointly: 96700,
    married_filing_separately: 48350,
    head_of_household: 64750,
    qualifying_surviving_spouse: 96700,
  };

const QUALIFIED_DIVIDEND_FIFTEEN_RATE_THRESHOLD_BY_FILING_STATUS: Record<
  FederalFilingStatus,
  number
> = {
  single: 533400,
  married_filing_jointly: 600050,
  married_filing_separately: 300000,
  head_of_household: 566700,
  qualifying_surviving_spouse: 600050,
};

const CAPITAL_LOSS_DEDUCTION_LIMIT_BY_FILING_STATUS: Record<FederalFilingStatus, number> = {
  single: 3000,
  married_filing_jointly: 3000,
  married_filing_separately: 1500,
  head_of_household: 3000,
  qualifying_surviving_spouse: 3000,
};

const DERIVED_ADJUSTMENT_KEYS = new Set(["deductible_part_of_self_employment_tax"]);

const SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS = new Set([
  "educator_expenses",
  "certain_business_expenses_of_reservists_performing_artists_and_fee_basis_officials",
  "health_savings_account_deduction",
  "moving_expenses_for_armed_forces",
  "self_employed_sep_simple_and_qualified_plans",
  "self_employed_health_insurance",
  "penalty_on_early_withdrawal_of_savings",
  "alimony_paid_for_pre_2019_divorce",
  "ira_deduction",
  "other_adjustments",
]);

const RETIREMENT_DISTRIBUTION_NONTAXABLE_CODES = new Set(["G", "H"]);
const MISC_1099_TO_LINE_8Z_CATEGORIES = new Set<CoreEngineMisc1099IncomeCategory>([
  "other_income",
  "other",
  "substitute_payments",
]);
const SCHEDULE_E_PART_1_ACTIVITY_TYPES = new Set<CoreEngineScheduleEActivityType>([
  "rental_real_estate",
  "royalty",
  "farm_rental",
]);
const SCHEDULE_E_PART_2_ACTIVITY_TYPES = new Set<CoreEngineScheduleEActivityType>([
  "partnership_k1",
  "s_corp_k1",
  "estate_or_trust_k1",
]);
const MISC_1099_UNSUPPORTED_CATEGORIES = new Set<CoreEngineMisc1099IncomeCategory>([
  "rents",
  "royalties",
  "attorney_fees",
  "crop_insurance",
  "medical_payments",
  "payment_settlement",
]);

const PREMIUM_TAX_CREDIT_FPL_BY_REGION = {
  contiguous: {
    householdOfOne: 15060,
    additionalPerson: 5380,
  },
  alaska: {
    householdOfOne: 18810,
    additionalPerson: 6660,
  },
  hawaii: {
    householdOfOne: 17310,
    additionalPerson: 6170,
  },
} as const;

const PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_SINGLE = [
  { maxHouseholdIncomePercentage: 199, cap: 500 },
  { maxHouseholdIncomePercentage: 299, cap: 975 },
  { maxHouseholdIncomePercentage: 399, cap: 1625 },
] as const;

const PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_ALL_OTHER = [
  { maxHouseholdIncomePercentage: 199, cap: 1000 },
  { maxHouseholdIncomePercentage: 299, cap: 1950 },
  { maxHouseholdIncomePercentage: 399, cap: 3250 },
] as const;

const SCHEDULE_1_DIRECT_ADJUSTMENT_LINES = [
  {
    adjustmentKey: "educator_expenses",
    label: "Educator expenses",
    lineCode: "11",
    nodeId: "sch1.line11",
  },
  {
    adjustmentKey:
      "certain_business_expenses_of_reservists_performing_artists_and_fee_basis_officials",
    label: "Certain business expenses of reservists, performing artists, and fee-basis officials",
    lineCode: "12",
    nodeId: "sch1.line12",
  },
  {
    adjustmentKey: "health_savings_account_deduction",
    label: "Health savings account deduction",
    lineCode: "13",
    nodeId: "sch1.line13",
  },
  {
    adjustmentKey: "moving_expenses_for_armed_forces",
    label: "Moving expenses for members of the Armed Forces",
    lineCode: "14",
    nodeId: "sch1.line14",
  },
  {
    adjustmentKey: "deductible_part_of_self_employment_tax",
    label: "Deductible part of self-employment tax",
    lineCode: "15",
    nodeId: "sch1.line15",
  },
  {
    adjustmentKey: "self_employed_sep_simple_and_qualified_plans",
    label: "Self-employed SEP, SIMPLE, and qualified plans",
    lineCode: "16",
    nodeId: "sch1.line16",
  },
  {
    adjustmentKey: "self_employed_health_insurance",
    label: "Self-employed health insurance deduction",
    lineCode: "17",
    nodeId: "sch1.line17",
  },
  {
    adjustmentKey: "penalty_on_early_withdrawal_of_savings",
    label: "Penalty on early withdrawal of savings",
    lineCode: "18",
    nodeId: "sch1.line18",
  },
  {
    adjustmentKey: "alimony_paid_for_pre_2019_divorce",
    label: "Alimony paid",
    lineCode: "19a",
    nodeId: "sch1.line19a",
  },
  {
    adjustmentKey: "ira_deduction",
    label: "IRA deduction",
    lineCode: "20",
    nodeId: "sch1.line20",
  },
  {
    adjustmentKey: "student_loan_interest_deduction",
    label: "Student loan interest deduction",
    lineCode: "21",
    nodeId: "sch1.line21",
  },
] as const;

export {
  ADDITIONAL_CHILD_TAX_CREDIT_EARNED_INCOME_THRESHOLD,
  ADDITIONAL_CHILD_TAX_CREDIT_PER_CHILD,
  ADDITIONAL_MEDICARE_TAX_RATE,
  ADDITIONAL_MEDICARE_THRESHOLD_BY_FILING_STATUS,
  CAPITAL_LOSS_DEDUCTION_LIMIT_BY_FILING_STATUS,
  CHILD_AND_DEPENDENT_CARE_MULTI_PERSON_EXPENSE_LIMIT,
  CHILD_AND_DEPENDENT_CARE_SINGLE_PERSON_EXPENSE_LIMIT,
  CHILD_TAX_CREDIT_PER_CHILD,
  CHILD_TAX_CREDIT_PHASEOUT_THRESHOLD_BY_FILING_STATUS,
  CREDIT_FOR_OTHER_DEPENDENT_AMOUNT,
  DERIVED_ADJUSTMENT_KEYS,
  EARNED_INCOME_CREDIT_INVESTMENT_INCOME_LIMIT_2025,
  EARNED_INCOME_CREDIT_PARAMETERS_BY_CHILD_BUCKET,
  EDUCATION_CREDIT_PHASEOUT_BY_FILING_STATUS,
  FEDERAL_TAX_BRACKETS_BY_FILING_STATUS,
  MISC_1099_TO_LINE_8Z_CATEGORIES,
  MISC_1099_UNSUPPORTED_CATEGORIES,
  NET_INVESTMENT_INCOME_TAX_RATE,
  NET_INVESTMENT_INCOME_THRESHOLD_BY_FILING_STATUS,
  PREMIUM_TAX_CREDIT_FPL_BY_REGION,
  PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_ALL_OTHER,
  PREMIUM_TAX_CREDIT_REPAYMENT_CAPS_SINGLE,
  QUALIFIED_DIVIDEND_FIFTEEN_RATE_THRESHOLD_BY_FILING_STATUS,
  QUALIFIED_DIVIDEND_ZERO_RATE_THRESHOLD_BY_FILING_STATUS,
  REGULAR_MEDICARE_WITHHOLDING_RATE,
  RETIREMENT_DISTRIBUTION_NONTAXABLE_CODES,
  SCHEDULE_1_DIRECT_ADJUSTMENT_LINES,
  SCHEDULE_E_PART_1_ACTIVITY_TYPES,
  SCHEDULE_E_PART_2_ACTIVITY_TYPES,
  SELF_EMPLOYMENT_EARNINGS_FACTOR,
  SELF_EMPLOYMENT_MEDICARE_RATE,
  SELF_EMPLOYMENT_SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_WAGE_BASE_2025,
  SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS,
  STANDARD_DEDUCTION_BY_FILING_STATUS,
};

export type { EarnedIncomeCreditChildBucket, EarnedIncomeCreditParameters };
