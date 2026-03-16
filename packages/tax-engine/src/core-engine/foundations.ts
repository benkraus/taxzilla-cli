import type {
  CoreEngineInput,
  CoreEngineScheduleCBusiness,
  CoreEngineWageInput,
} from "./input";
import {
  CAPITAL_LOSS_DEDUCTION_LIMIT_BY_FILING_STATUS,
  EARNED_INCOME_CREDIT_INVESTMENT_INCOME_LIMIT_2025,
  EARNED_INCOME_CREDIT_PARAMETERS_BY_CHILD_BUCKET,
  EDUCATION_CREDIT_PHASEOUT_BY_FILING_STATUS,
  PREMIUM_TAX_CREDIT_FPL_BY_REGION,
  REGULAR_MEDICARE_WITHHOLDING_RATE,
  STANDARD_DEDUCTION_BY_FILING_STATUS,
  type EarnedIncomeCreditChildBucket,
  type EarnedIncomeCreditParameters,
} from "./constants";
import {
  asRecord,
  asString,
  getFederalEicExtension,
  getFederalForm8812Extension,
  roundMoney,
  roundRate,
  sumNamedAmounts,
  sumNumbers,
  toNumber,
  uniqueStrings,
} from "./helpers";
import type {
  CapitalLossCarryforwardComputation,
  CapitalLossDeductionComputation,
  EarnedIncomeCreditComputation,
  FederalFilingStatus,
  PremiumTaxCreditRegion,
  ScheduleDSpecialGainComputation,
} from "./types";

function sumForm1099DivPayloadAmount(
  sourceDocuments: ReadonlyArray<unknown>,
  field: string,
): number {
  return roundMoney(
    sumNumbers(
      sourceDocuments.flatMap((sourceDocument) => {
        const record = asRecord(sourceDocument);

        if (asString(record?.document_type) !== "FORM_1099_DIV") {
          return [];
        }

        const payload = asRecord(record?.payload);
        const value = payload?.[field];

        return typeof value === "number" ? [value] : [];
      }),
    ),
  );
}

function buildForm1099DivPayloadPointers(
  sourceDocuments: ReadonlyArray<unknown>,
  field: string,
): string[] {
  return sourceDocuments.flatMap((sourceDocument, index) => {
    const record = asRecord(sourceDocument);

    if (asString(record?.document_type) !== "FORM_1099_DIV") {
      return [];
    }

    const payload = asRecord(record?.payload);
    return typeof payload?.[field] === "number"
      ? [`/source_documents/${index}/payload/${field}`]
      : [];
  });
}

function calculateCapitalLossDeduction(args: {
  readonly filingStatus: FederalFilingStatus;
  readonly scheduleDNetCapitalGainOrLossTotal: number;
}): CapitalLossDeductionComputation {
  const deductionLimit = CAPITAL_LOSS_DEDUCTION_LIMIT_BY_FILING_STATUS[args.filingStatus];

  if (args.scheduleDNetCapitalGainOrLossTotal >= 0) {
    return {
      deductibleCapitalGainOrLoss: args.scheduleDNetCapitalGainOrLossTotal,
      deductionLimit,
    };
  }

  return {
    deductibleCapitalGainOrLoss: roundMoney(
      -Math.min(Math.abs(args.scheduleDNetCapitalGainOrLossTotal), deductionLimit),
    ),
    deductionLimit,
  };
}

function calculateCapitalLossCarryforward(args: {
  readonly rawTaxableIncome: number;
  readonly scheduleDLine15LongTermNet: number;
  readonly scheduleDLine21LossDeduction: number;
  readonly scheduleDLine7ShortTermNet: number;
}): CapitalLossCarryforwardComputation {
  if (args.scheduleDLine21LossDeduction <= 0) {
    return {
      longTermCarryforward: 0,
      shortTermCarryforward: 0,
      totalCarryforward: 0,
    };
  }

  const worksheetLine4 = roundMoney(
    Math.min(
      args.scheduleDLine21LossDeduction,
      Math.max(args.rawTaxableIncome + args.scheduleDLine21LossDeduction, 0),
    ),
  );
  const shortTermLossMagnitude = roundMoney(Math.max(-args.scheduleDLine7ShortTermNet, 0));
  const longTermLossMagnitude = roundMoney(Math.max(-args.scheduleDLine15LongTermNet, 0));
  const shortTermCarryforward = roundMoney(
    Math.max(
      shortTermLossMagnitude - (worksheetLine4 + Math.max(args.scheduleDLine15LongTermNet, 0)),
      0,
    ),
  );
  const longTermCarryforward = roundMoney(
    Math.max(
      longTermLossMagnitude -
        (Math.max(args.scheduleDLine7ShortTermNet, 0) +
          Math.max(worksheetLine4 - shortTermLossMagnitude, 0)),
      0,
    ),
  );

  return {
    longTermCarryforward,
    shortTermCarryforward,
    totalCarryforward: roundMoney(shortTermCarryforward + longTermCarryforward),
  };
}

function calculateScheduleDSpecialGains(
  sourceDocuments: ReadonlyArray<unknown>,
): ScheduleDSpecialGainComputation {
  return {
    collectibles28PercentGainTotal: sumForm1099DivPayloadAmount(
      sourceDocuments,
      "collectibles_28_percent_gain",
    ),
    section1202GainTotal: sumForm1099DivPayloadAmount(sourceDocuments, "section_1202_gain"),
    unrecapturedSection1250GainTotal: sumForm1099DivPayloadAmount(
      sourceDocuments,
      "unrecaptured_section_1250_gain",
    ),
  };
}

function calculateScheduleDLine18(args: {
  readonly reportedCollectibles28PercentGainTotal: number;
  readonly reportedTaxableSection1202GainTotal: number;
  readonly scheduleDShortTermCapitalGainOrLossTotal: number;
}): number {
  return roundMoney(
    Math.max(
      args.reportedCollectibles28PercentGainTotal +
        args.reportedTaxableSection1202GainTotal +
        Math.min(args.scheduleDShortTermCapitalGainOrLossTotal, 0),
      0,
    ),
  );
}

function calculateScheduleDLine19(args: {
  readonly reportedTwentyEightRateGainTotal: number;
  readonly reportedUnrecapturedSection1250GainTotal: number;
  readonly scheduleDShortTermCapitalGainOrLossTotal: number;
}): number {
  const worksheetLossOffset = roundMoney(
    Math.max(
      -(
        args.reportedTwentyEightRateGainTotal +
        Math.min(args.scheduleDShortTermCapitalGainOrLossTotal, 0)
      ),
      0,
    ),
  );

  return roundMoney(
    Math.max(args.reportedUnrecapturedSection1250GainTotal - worksheetLossOffset, 0),
  );
}

function calculateScheduleCBusinessNetProfit(
  business: CoreEngineScheduleCBusiness,
  additionalGrossReceiptsByBusinessId?: ReadonlyMap<string, number>,
): number {
  const expensesTotal = sumNumbers(business.expenses.map((expense) => expense.amount));
  const additionalGrossReceipts =
    business.business_id != null ? additionalGrossReceiptsByBusinessId?.get(business.business_id) ?? 0 : 0;

  return roundMoney(
    toNumber(business.gross_receipts_or_sales) -
      toNumber(business.returns_and_allowances) -
      toNumber(business.cost_of_goods_sold) +
      additionalGrossReceipts +
      toNumber(business.other_business_income) -
      expensesTotal -
      toNumber(business.home_office_deduction),
  );
}

function sumItemizedDeductionTotals(
  itemizedDeductions: CoreEngineInput["facts"]["itemized_deductions"],
): number {
  const mortgageInterestTotal = sumNumbers(
    itemizedDeductions.mortgage_interest_items.map(
      (item) =>
        toNumber(item.mortgage_interest_received) +
        toNumber(item.points_paid) +
        toNumber(item.mortgage_insurance_premiums) +
        toNumber(item.real_estate_taxes_paid),
    ),
  );

  return roundMoney(
    toNumber(itemizedDeductions.medical_and_dental_expenses) +
      toNumber(itemizedDeductions.state_and_local_income_or_sales_taxes) +
      toNumber(itemizedDeductions.real_estate_taxes) +
      toNumber(itemizedDeductions.personal_property_taxes) +
      toNumber(itemizedDeductions.other_taxes) +
      mortgageInterestTotal +
      toNumber(itemizedDeductions.charitable_cash_contributions) +
      toNumber(itemizedDeductions.charitable_noncash_contributions) +
      toNumber(itemizedDeductions.casualty_and_theft_losses) +
      sumNamedAmounts(itemizedDeductions.other_itemized_deductions),
  );
}

function isFederalFilingStatus(value: string): value is FederalFilingStatus {
  return value in STANDARD_DEDUCTION_BY_FILING_STATUS;
}

function getFederalFilingStatus(input: CoreEngineInput): FederalFilingStatus {
  return isFederalFilingStatus(input.household.filing_status)
    ? input.household.filing_status
    : "single";
}

function buildEarnedIncomeByPersonId(
  input: CoreEngineInput,
  additionalGrossReceiptsByBusinessId?: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const earnedIncomeByPersonId = new Map<string, number>();

  for (const wage of input.facts.income.wages) {
    if (!wage.person_id) {
      continue;
    }

    earnedIncomeByPersonId.set(
      wage.person_id,
      roundMoney(
        (earnedIncomeByPersonId.get(wage.person_id) ?? 0) + wage.wages_tips_other_compensation,
      ),
    );
  }

  for (const business of input.facts.income.schedule_c_businesses) {
    if (!business.owner_person_id) {
      continue;
    }

    earnedIncomeByPersonId.set(
      business.owner_person_id,
      roundMoney(
        (earnedIncomeByPersonId.get(business.owner_person_id) ?? 0) +
          calculateScheduleCBusinessNetProfit(business, additionalGrossReceiptsByBusinessId),
      ),
    );
  }

  return earnedIncomeByPersonId;
}

function getTotalEarnedIncome(
  input: CoreEngineInput,
  additionalGrossReceiptsByBusinessId?: ReadonlyMap<string, number>,
): number {
  return roundMoney(
    sumNumbers(input.facts.income.wages.map((wage) => wage.wages_tips_other_compensation)) +
      sumNumbers(
        input.facts.income.schedule_c_businesses.map((business) =>
          calculateScheduleCBusinessNetProfit(business, additionalGrossReceiptsByBusinessId),
        ),
      ),
  );
}

function getCandidateEitcChildIds(input: CoreEngineInput): string[] {
  return uniqueStrings(input.facts.credits.candidate_eitc_child_ids ?? []);
}

function getTotalSocialSecurityTaxWithheld(input: CoreEngineInput): number {
  return roundMoney(
    sumNumbers(
      input.facts.income.wages.map((wage) => toNumber(wage.social_security_tax_withheld)),
    ),
  );
}

function getTotalMedicareTaxWithheld(input: CoreEngineInput): number {
  return roundMoney(
    sumNumbers(input.facts.income.wages.map((wage) => toNumber(wage.medicare_tax_withheld))),
  );
}

function getTotalSocialSecurityWages(input: CoreEngineInput): number {
  return roundMoney(
    sumNumbers(
      input.facts.income.wages.map(
        (wage) => toNumber(wage.social_security_wages) || wage.wages_tips_other_compensation,
      ),
    ),
  );
}

function getTotalMedicareWages(input: CoreEngineInput): number {
  return roundMoney(
    sumNumbers(
      input.facts.income.wages.map(
        (wage) => toNumber(wage.medicare_wages_and_tips) || wage.wages_tips_other_compensation,
      ),
    ),
  );
}

function calculateAdditionalMedicareTaxWithheld(wages: ReadonlyArray<CoreEngineWageInput>): number {
  return roundMoney(
    sumNumbers(
      wages.map((wage) => {
        const medicareWages =
          toNumber(wage.medicare_wages_and_tips) || wage.wages_tips_other_compensation;
        const regularMedicareWithholding = medicareWages * REGULAR_MEDICARE_WITHHOLDING_RATE;

        return Math.max(
          toNumber(wage.medicare_tax_withheld) - roundMoney(regularMedicareWithholding),
          0,
        );
      }),
    ),
  );
}

function computeEarnedIncomeCreditForIncomeMetric(
  incomeAmount: number,
  filingStatus: FederalFilingStatus,
  parameters: EarnedIncomeCreditParameters,
): number {
  if (incomeAmount <= 0) {
    return 0;
  }

  const phaseoutThreshold =
    filingStatus === "married_filing_jointly"
      ? parameters.phaseoutThresholdMarriedJoint
      : parameters.phaseoutThresholdOther;
  const phaseInCredit = roundMoney(
    Math.min(incomeAmount, parameters.earnedIncomeAmount) * parameters.phaseInRate,
  );
  const baseCredit = Math.min(phaseInCredit, parameters.maxCredit);

  if (incomeAmount <= phaseoutThreshold) {
    return roundMoney(baseCredit);
  }

  return roundMoney(
    Math.max(
      parameters.maxCredit - (incomeAmount - phaseoutThreshold) * parameters.phaseoutRate,
      0,
    ),
  );
}

function calculateEarnedIncomeCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly capitalGainOrLossTotal: number;
  readonly filingStatus: FederalFilingStatus;
  readonly input: CoreEngineInput;
  readonly ordinaryDividendsTotal: number;
  readonly taxExemptInterestTotal: number;
  readonly taxableInterestTotal: number;
  readonly totalEarnedIncome: number;
}): EarnedIncomeCreditComputation {
  const form8812Extension = getFederalForm8812Extension(args.input);

  if (form8812Extension?.line27a_eic_override != null) {
    return {
      amount: roundMoney(Math.max(form8812Extension.line27a_eic_override, 0)),
      qualifyingChildrenCount: Math.min(getCandidateEitcChildIds(args.input).length, 3),
    };
  }

  if (args.input.household.can_be_claimed_as_dependent === true) {
    return {
      amount: 0,
      qualifyingChildrenCount: Math.min(getCandidateEitcChildIds(args.input).length, 3),
    };
  }

  const separatedSpouseExceptionAllowed =
    getFederalEicExtension(args.input)?.allow_married_filing_separately_separated_spouse_rules ===
    true;

  if (
    args.filingStatus === "married_filing_separately" &&
    !separatedSpouseExceptionAllowed
  ) {
    return {
      amount: 0,
      qualifyingChildrenCount: Math.min(getCandidateEitcChildIds(args.input).length, 3),
    };
  }

  const qualifyingChildrenCount = Math.min(
    getCandidateEitcChildIds(args.input).length,
    3,
  ) as EarnedIncomeCreditChildBucket;

  if (qualifyingChildrenCount === 0) {
    return {
      amount: 0,
      qualifyingChildrenCount,
    };
  }

  const investmentIncome = roundMoney(
    args.taxExemptInterestTotal +
      args.taxableInterestTotal +
      args.ordinaryDividendsTotal +
      Math.max(args.capitalGainOrLossTotal, 0),
  );

  if (investmentIncome > EARNED_INCOME_CREDIT_INVESTMENT_INCOME_LIMIT_2025) {
    return {
      amount: 0,
      qualifyingChildrenCount,
    };
  }

  const filingStatusForTable =
    args.filingStatus === "married_filing_separately" && separatedSpouseExceptionAllowed
      ? "single"
      : args.filingStatus;
  const parameters = EARNED_INCOME_CREDIT_PARAMETERS_BY_CHILD_BUCKET[qualifyingChildrenCount];
  const earnedIncomeBasedCredit = computeEarnedIncomeCreditForIncomeMetric(
    Math.max(args.totalEarnedIncome, 0),
    filingStatusForTable,
    parameters,
  );
  const adjustedGrossIncomeBasedCredit = computeEarnedIncomeCreditForIncomeMetric(
    Math.max(args.adjustedGrossIncome, 0),
    filingStatusForTable,
    parameters,
  );

  return {
    amount: roundMoney(Math.min(earnedIncomeBasedCredit, adjustedGrossIncomeBasedCredit)),
    qualifyingChildrenCount,
  };
}

function getPremiumTaxCreditRegion(input: CoreEngineInput): PremiumTaxCreditRegion {
  const stateCode = input.residency_and_nexus.primary_home_address?.state_code;

  if (stateCode === "AK") {
    return "alaska";
  }

  if (stateCode === "HI") {
    return "hawaii";
  }

  return "contiguous";
}

function getFederalPovertyLine(region: PremiumTaxCreditRegion, familySize: number): number {
  const normalizedFamilySize = Math.max(familySize, 1);
  const table = PREMIUM_TAX_CREDIT_FPL_BY_REGION[region];

  return table.householdOfOne + (normalizedFamilySize - 1) * table.additionalPerson;
}

function getEducationCreditPhaseoutMultiplier(
  adjustedGrossIncome: number,
  filingStatus: FederalFilingStatus,
): number {
  const phaseout = EDUCATION_CREDIT_PHASEOUT_BY_FILING_STATUS[filingStatus];

  if (phaseout.end === 0) {
    return 0;
  }

  if (adjustedGrossIncome <= phaseout.start) {
    return 1;
  }

  if (adjustedGrossIncome >= phaseout.end) {
    return 0;
  }

  return roundRate((phaseout.end - adjustedGrossIncome) / (phaseout.end - phaseout.start));
}

export {
  buildEarnedIncomeByPersonId,
  buildForm1099DivPayloadPointers,
  calculateAdditionalMedicareTaxWithheld,
  calculateCapitalLossCarryforward,
  calculateCapitalLossDeduction,
  calculateEarnedIncomeCredit,
  calculateScheduleCBusinessNetProfit,
  calculateScheduleDLine18,
  calculateScheduleDLine19,
  calculateScheduleDSpecialGains,
  computeEarnedIncomeCreditForIncomeMetric,
  getCandidateEitcChildIds,
  getEducationCreditPhaseoutMultiplier,
  getFederalFilingStatus,
  getFederalPovertyLine,
  getPremiumTaxCreditRegion,
  getTotalEarnedIncome,
  getTotalMedicareTaxWithheld,
  getTotalMedicareWages,
  getTotalSocialSecurityTaxWithheld,
  getTotalSocialSecurityWages,
  isFederalFilingStatus,
  sumForm1099DivPayloadAmount,
  sumItemizedDeductionTotals,
};
