import { getFederalFilingStatus } from "../../../foundations";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
  roundMoney,
  sumNamedAmounts,
  sumNumbers,
} from "../../../helpers";
import type { CoreEngineInput, CoreEngineNamedAmount, CoreEngineStateReturn } from "../../../input";

type CaliforniaFilingStatus = "head_of_household" | "joint_or_qss" | "single_or_mfs";
type CaliforniaDeductionStrategy = "itemized" | "standard";
type CaliforniaTaxComputationMethod = "tax_rate_schedule" | "tax_table";

type CaliforniaTaxBracket = {
  readonly base: number;
  readonly over: number;
  readonly rate: number;
};

type CaliforniaExemptionCreditComputation = {
  readonly blindCount: number;
  readonly dependentCount: number;
  readonly dependentCreditAmount: number;
  readonly line32ExemptionCredits: number;
  readonly personalCount: number;
  readonly reductionStepCount: number;
  readonly seniorCount: number;
  readonly seniorOrBlindCreditAmount: number;
};

type CaliforniaComputation = {
  readonly allocatedCaliforniaAdjustedGrossIncome: number | null;
  readonly allocatedCaliforniaTaxableIncome: number | null;
  readonly allocatedExemptionCreditPercentage: number | null;
  readonly deductionStrategy: CaliforniaDeductionStrategy;
  readonly filingStatus: CaliforniaFilingStatus;
  readonly isAllocatedReturn: boolean;
  readonly line13FederalAdjustedGrossIncome: number;
  readonly line14Subtractions: number;
  readonly line16Additions: number;
  readonly line17CaliforniaAdjustedGrossIncome: number;
  readonly line18Deduction: number;
  readonly line19TaxableIncome: number;
  readonly line36CaliforniaTaxRate: number | null;
  readonly line37CaliforniaTaxBeforeExemptionCredits: number | null;
  readonly line39ProratedExemptionCredits: number | null;
  readonly line40RegularTaxBeforeCredits: number | null;
  readonly line31Tax: number;
  readonly line32ExemptionCredits: number;
  readonly line33TaxAfterExemptionCredits: number;
  readonly line34OtherTax: number;
  readonly line35TaxBeforeCredits: number;
  readonly line47NonrefundableCredits: number;
  readonly line48TaxAfterCredits: number;
  readonly line61AlternativeMinimumTax: number;
  readonly line62BehavioralHealthServicesTax: number;
  readonly line63OtherTaxes: number;
  readonly line64TotalTax: number;
  readonly line78TotalPayments: number;
  readonly line91UseTax: number;
  readonly line92IndividualSharedResponsibilityPenalty: number;
  readonly line95PaymentsAfterPenalty: number;
  readonly line97RefundAmount: number;
  readonly line100AmountOwed: number;
  readonly nonrefundableCreditsTotal: number;
  readonly paymentsUsedCanonicalStatePayments: boolean;
  readonly reportedItemizedDeductionTotal: number;
  readonly refundableCreditsTotal: number;
  readonly statePaymentsFallbackTotal: number;
  readonly standardDeduction: number;
  readonly taxComputationMethod: CaliforniaTaxComputationMethod;
};

const CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_RATE = 0.01;
const CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_THRESHOLD = 1_000_000;
const CALIFORNIA_DEPENDENT_STANDARD_DEDUCTION_MINIMUM = 1_350;
const CALIFORNIA_EXEMPTION_CREDIT_REDUCTION_PER_STEP = 6;
const CALIFORNIA_EXEMPTION_THRESHOLD_BY_FILING_STATUS: Record<CaliforniaFilingStatus, number> = {
  head_of_household: 378_310,
  joint_or_qss: 504_411,
  single_or_mfs: 252_203,
};
const CALIFORNIA_EXEMPTION_STEP_SIZE_BY_FILING_STATUS: Record<CaliforniaFilingStatus, number> = {
  head_of_household: 2_500,
  joint_or_qss: 2_500,
  single_or_mfs: 2_500,
};
const CALIFORNIA_PERSONAL_EXEMPTION_CREDIT = 153;
const CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT = 475;
const CALIFORNIA_HEAD_OF_HOUSEHOLD_STATE_FILING_STATUS_ALIASES = new Set([
  "4",
  "head_of_household",
  "head of household",
  "hoh",
]);
const CALIFORNIA_JOINT_STATE_FILING_STATUS_ALIASES = new Set([
  "2",
  "5",
  "joint",
  "married_filing_jointly",
  "married filing jointly",
  "mfj",
  "qualifying_surviving_spouse",
  "qualifying surviving spouse",
  "qss",
]);
const CALIFORNIA_SINGLE_OR_MFS_STATE_FILING_STATUS_ALIASES = new Set([
  "1",
  "3",
  "single",
  "married_filing_separately",
  "married filing separately",
  "mfs",
]);
const CALIFORNIA_STANDARD_DEDUCTION_BY_FILING_STATUS: Record<CaliforniaFilingStatus, number> = {
  head_of_household: 11_412,
  joint_or_qss: 11_412,
  single_or_mfs: 5_706,
};
const CALIFORNIA_TAX_BRACKETS_BY_FILING_STATUS: Record<
  CaliforniaFilingStatus,
  readonly CaliforniaTaxBracket[]
> = {
  single_or_mfs: [
    { over: 0, base: 0, rate: 0.01 },
    { over: 11_079, base: 110.79, rate: 0.02 },
    { over: 26_264, base: 414.49, rate: 0.04 },
    { over: 41_452, base: 1_022.01, rate: 0.06 },
    { over: 57_542, base: 1_987.41, rate: 0.08 },
    { over: 72_724, base: 3_201.97, rate: 0.093 },
    { over: 371_479, base: 30_986.19, rate: 0.103 },
    { over: 445_771, base: 38_638.27, rate: 0.113 },
    { over: 742_953, base: 72_219.84, rate: 0.123 },
  ],
  joint_or_qss: [
    { over: 0, base: 0, rate: 0.01 },
    { over: 22_158, base: 221.58, rate: 0.02 },
    { over: 52_528, base: 828.98, rate: 0.04 },
    { over: 82_904, base: 2_044.02, rate: 0.06 },
    { over: 115_084, base: 3_974.82, rate: 0.08 },
    { over: 145_448, base: 6_403.94, rate: 0.093 },
    { over: 742_958, base: 61_972.37, rate: 0.103 },
    { over: 891_542, base: 77_276.52, rate: 0.113 },
    { over: 1_485_906, base: 144_439.65, rate: 0.123 },
  ],
  head_of_household: [
    { over: 0, base: 0, rate: 0.01 },
    { over: 22_173, base: 221.73, rate: 0.02 },
    { over: 52_530, base: 828.87, rate: 0.04 },
    { over: 67_716, base: 1_436.31, rate: 0.06 },
    { over: 83_805, base: 2_401.65, rate: 0.08 },
    { over: 98_990, base: 3_616.45, rate: 0.093 },
    { over: 505_208, base: 41_394.72, rate: 0.103 },
    { over: 606_251, base: 51_802.15, rate: 0.113 },
    { over: 1_010_417, base: 97_472.91, rate: 0.123 },
  ],
};

function toCaliforniaWholeDollars(value: number): number {
  return Math.round(value);
}

function readNamedAmountArray(value: unknown): CoreEngineNamedAmount[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const amount = asNumber(record?.amount);

    if (amount == null) {
      return [];
    }

    return [
      {
        description: asString(record?.description) ?? "State plugin amount",
        amount,
      },
    ];
  });
}

function readNamedAmountArrayTotal(value: unknown): number {
  return toCaliforniaWholeDollars(sumNamedAmounts(readNamedAmountArray(value)));
}

function getCaliforniaScheduleCaRecord(stateReturn: CoreEngineStateReturn): Record<string, unknown> | undefined {
  return asRecord(asRecord(stateReturn.plugin_fact_bag)?.schedule_ca);
}

function getCaliforniaForm540Record(stateReturn: CoreEngineStateReturn): Record<string, unknown> | undefined {
  return asRecord(asRecord(stateReturn.plugin_fact_bag)?.form540);
}

function normalizeCaliforniaFilingStatus(
  stateReturn: CoreEngineStateReturn,
  input: CoreEngineInput,
): CaliforniaFilingStatus {
  const rawStateFilingStatus = stateReturn.state_filing_status?.trim().toLowerCase();

  if (rawStateFilingStatus) {
    if (CALIFORNIA_SINGLE_OR_MFS_STATE_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "single_or_mfs";
    }

    if (CALIFORNIA_JOINT_STATE_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "joint_or_qss";
    }

    if (CALIFORNIA_HEAD_OF_HOUSEHOLD_STATE_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "head_of_household";
    }
  }

  switch (getFederalFilingStatus(input)) {
    case "head_of_household":
      return "head_of_household";
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return "joint_or_qss";
    default:
      return "single_or_mfs";
  }
}

function isCaliforniaMarriedFilingSeparately(
  stateReturn: CoreEngineStateReturn,
  input: CoreEngineInput,
): boolean {
  const rawStateFilingStatus = stateReturn.state_filing_status?.trim().toLowerCase();

  if (
    rawStateFilingStatus != null &&
    CALIFORNIA_SINGLE_OR_MFS_STATE_FILING_STATUS_ALIASES.has(rawStateFilingStatus) &&
    rawStateFilingStatus !== "1" &&
    rawStateFilingStatus !== "single"
  ) {
    return true;
  }

  return getFederalFilingStatus(input) === "married_filing_separately";
}

function getPersonCanBeClaimedAsDependent(person: unknown): boolean | null {
  return asBoolean(asRecord(person)?.can_be_claimed_as_dependent);
}

function calculateCaliforniaPersonalExemptionCount(
  input: CoreEngineInput,
  filingStatus: CaliforniaFilingStatus,
): number {
  const taxpayerCanBeClaimed =
    getPersonCanBeClaimedAsDependent(input.household.taxpayer) ??
    input.household.can_be_claimed_as_dependent ??
    false;
  const spouseCanBeClaimed =
    getPersonCanBeClaimedAsDependent(input.household.spouse) ??
    input.household.can_be_claimed_as_dependent ??
    false;

  if (filingStatus === "single_or_mfs" || filingStatus === "head_of_household") {
    return taxpayerCanBeClaimed ? 0 : 1;
  }

  return Math.max((taxpayerCanBeClaimed ? 0 : 1) + (spouseCanBeClaimed ? 0 : 1), 0);
}

function calculateCaliforniaBlindExemptionCount(input: CoreEngineInput): number {
  const householdPeople: Array<unknown> = [input.household.taxpayer, input.household.spouse];

  return householdPeople.reduce<number>((count, person) => {
    return count + (asBoolean(asRecord(person)?.is_blind) === true ? 1 : 0);
  }, 0);
}

function calculateCaliforniaSeniorExemptionCount(input: CoreEngineInput): number {
  const householdPeople: Array<unknown> = [input.household.taxpayer, input.household.spouse];

  return householdPeople.reduce<number>((count, person) => {
    const age = getAgeOnLastDayOfTaxYear(
      asString(asRecord(person)?.date_of_birth),
      input.tax_year,
    );

    return count + (age != null && age >= 65 ? 1 : 0);
  }, 0);
}

function getCaliforniaDependentStandardDeduction(
  input: CoreEngineInput,
  filingStatus: CaliforniaFilingStatus,
): number {
  const wageIncomeTotal = sumNumbers(
    input.facts.income.wages.map((wage) => wage.wages_tips_other_compensation),
  );
  const scheduleCBusinessNetTotal = sumNumbers(
    input.facts.income.schedule_c_businesses.map((business) => {
      const expensesTotal = sumNumbers(business.expenses.map((expense) => expense.amount));

      return (
        (business.gross_receipts_or_sales ?? 0) -
        (business.returns_and_allowances ?? 0) -
        (business.cost_of_goods_sold ?? 0) +
        (business.other_business_income ?? 0) -
        expensesTotal -
        (business.home_office_deduction ?? 0)
      );
    }),
  );
  const earnedIncome = toCaliforniaWholeDollars(
    roundMoney(wageIncomeTotal + scheduleCBusinessNetTotal),
  );

  return Math.min(
    Math.max(earnedIncome, CALIFORNIA_DEPENDENT_STANDARD_DEDUCTION_MINIMUM),
    CALIFORNIA_STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus],
  );
}

function calculateCaliforniaStandardDeduction(
  input: CoreEngineInput,
  filingStatus: CaliforniaFilingStatus,
): number {
  if (input.household.can_be_claimed_as_dependent === true) {
    return getCaliforniaDependentStandardDeduction(input, filingStatus);
  }

  return CALIFORNIA_STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus];
}

export {
  CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_RATE,
  CALIFORNIA_BEHAVIORAL_HEALTH_SERVICES_TAX_THRESHOLD,
  CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT,
  CALIFORNIA_EXEMPTION_CREDIT_REDUCTION_PER_STEP,
  CALIFORNIA_EXEMPTION_STEP_SIZE_BY_FILING_STATUS,
  CALIFORNIA_EXEMPTION_THRESHOLD_BY_FILING_STATUS,
  CALIFORNIA_PERSONAL_EXEMPTION_CREDIT,
  CALIFORNIA_TAX_BRACKETS_BY_FILING_STATUS,
  calculateCaliforniaBlindExemptionCount,
  calculateCaliforniaPersonalExemptionCount,
  calculateCaliforniaSeniorExemptionCount,
  calculateCaliforniaStandardDeduction,
  getCaliforniaForm540Record,
  getCaliforniaScheduleCaRecord,
  isCaliforniaMarriedFilingSeparately,
  normalizeCaliforniaFilingStatus,
  readNamedAmountArrayTotal,
  toCaliforniaWholeDollars,
};

export type {
  CaliforniaComputation,
  CaliforniaDeductionStrategy,
  CaliforniaExemptionCreditComputation,
  CaliforniaFilingStatus,
  CaliforniaTaxBracket,
  CaliforniaTaxComputationMethod,
};
