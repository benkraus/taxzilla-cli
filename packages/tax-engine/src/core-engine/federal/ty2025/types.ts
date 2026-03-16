import type {
  CoreEngineDeductionStrategy,
  CoreEngineLine16TaxComputationMethod,
} from "../../public";
import type {
  CoreEngineMisc1099IncomeCategory,
  CoreEngineScheduleEActivityType,
} from "../../input";

const FEDERAL_FORM_1040_CORE_MODULE_ID = "federal.form1040.core" as const;
const FEDERAL_SCHEDULE_1_MODULE_ID = "federal.schedule1" as const;
const FEDERAL_SCHEDULE_2_MODULE_ID = "federal.schedule2" as const;
const FEDERAL_SCHEDULE_3_MODULE_ID = "federal.schedule3" as const;
const FEDERAL_SCHEDULE_A_MODULE_ID = "federal.scheduleA" as const;
const FEDERAL_SCHEDULE_B_MODULE_ID = "federal.scheduleB" as const;
const FEDERAL_SCHEDULE_C_MODULE_ID = "federal.scheduleC" as const;
const FEDERAL_SCHEDULE_D_MODULE_ID = "federal.scheduleD" as const;
const FEDERAL_SCHEDULE_E_MODULE_ID = "federal.scheduleE" as const;
const FEDERAL_SCHEDULE_SE_MODULE_ID = "federal.scheduleSE" as const;
const FEDERAL_FORM_2441_MODULE_ID = "federal.form2441" as const;
const FEDERAL_FORM_8812_MODULE_ID = "federal.form8812" as const;
const FEDERAL_FORM_8863_MODULE_ID = "federal.form8863" as const;
const FEDERAL_FORM_8889_MODULE_ID = "federal.form8889" as const;
const FEDERAL_FORM_8949_MODULE_ID = "federal.form8949" as const;
const FEDERAL_FORM_8959_MODULE_ID = "federal.form8959" as const;
const FEDERAL_FORM_8960_MODULE_ID = "federal.form8960" as const;
const FEDERAL_FORM_8962_MODULE_ID = "federal.form8962" as const;

type FederalTaxBracket = {
  readonly ceiling: number;
  readonly rate: number;
};

type FederalFilingStatus =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household"
  | "qualifying_surviving_spouse";

type FederalModuleActivationState = {
  readonly form2441Activated: boolean;
  readonly form8812Activated: boolean;
  readonly form8863Activated: boolean;
  readonly form8889Activated: boolean;
  readonly form8949Activated: boolean;
  readonly form8959Activated: boolean;
  readonly form8960Activated: boolean;
  readonly form8962Activated: boolean;
  readonly schedule1Activated: boolean;
  readonly schedule2Activated: boolean;
  readonly schedule3Activated: boolean;
  readonly scheduleAActivated: boolean;
  readonly scheduleBActivated: boolean;
  readonly scheduleCActivated: boolean;
  readonly scheduleDActivated: boolean;
  readonly scheduleEActivated: boolean;
  readonly scheduleSEActivated: boolean;
};

type FederalComputation = {
  readonly additionalMedicareTax: number;
  readonly additionalMedicareTaxWithheld: number;
  readonly amountOwed: number;
  readonly capitalGainOrLossTotal: number;
  readonly capitalGainDistributionsTotal: number;
  readonly capitalLossCarryforwardGenerated: number;
  readonly capitalLossDeductionLimit: number;
  readonly capitalTransactionsNetTotal: number;
  readonly childAndDependentCareCredit: number;
  readonly childTaxCreditOrCreditForOtherDependents: number;
  readonly deductionStrategy: CoreEngineDeductionStrategy;
  readonly documentedFederalWithholding: number;
  readonly educationCreditNonrefundable: number;
  readonly educationCreditRefundable: number;
  readonly estimatedAndExtensionPayments: number;
  readonly excessAdvancePremiumTaxCreditRepayment: number;
  readonly federalWithholding: number;
  readonly form2441CreditRate: number;
  readonly form2441QualifiedExpenses: number;
  readonly form8812AdditionalChildTaxCredit: number;
  readonly form8812CreditBeforePhaseout: number;
  readonly form8812OtherDependentsCount: number;
  readonly form8812PhaseoutReduction: number;
  readonly form8812QualifyingChildrenCount: number;
  readonly form8863NetQualifiedExpenses: number;
  readonly form8962AdvancePremiumTaxCreditTotal: number;
  readonly form8962HouseholdIncomePercentage: number | null;
  readonly form8812AlternativeActcMethodConsidered: boolean;
  readonly form8812AlternativeActcMethodUsed: boolean;
  readonly iraDistributionsGrossTotal: number;
  readonly itemizedDeductionTotal: number;
  readonly line12Deductions: number;
  readonly line15TaxableIncome: number;
  readonly line16RegularIncomeTax: number;
  readonly line19ChildTaxCreditOrCreditForOtherDependents: number;
  readonly line20OtherNonrefundableCredits: number;
  readonly line23OtherTaxes: number;
  readonly line24TotalTax: number;
  readonly line26EstimatedAndExtensionPayments: number;
  readonly line27aEarnedIncomeCredit: number;
  readonly line28AdditionalChildTaxCredit: number;
  readonly line29RefundableEducationCredit: number;
  readonly line31OtherPayments: number;
  readonly line33TotalPayments: number;
  readonly line34RefundAmount: number;
  readonly line37AmountOwed: number;
  readonly line8bGamblingIncomeTotal: number;
  readonly line8jNonbusinessActivityIncomeTotal: number;
  readonly line8zOtherIncomeTotal: number;
  readonly line2aTaxExemptInterest: number;
  readonly line4aIraDistributions: number;
  readonly line4bTaxableIraDistributions: number;
  readonly line5aPensionsAndAnnuities: number;
  readonly line5bTaxablePensionsAndAnnuities: number;
  readonly line6aSocialSecurityBenefits: number;
  readonly line6bTaxableSocialSecurityBenefits: number;
  readonly netInvestmentIncome: number;
  readonly netInvestmentIncomeTax: number;
  readonly netPremiumTaxCredit: number;
  readonly otherNonrefundableCreditsTotal: number;
  readonly otherRefundableCreditsTotal: number;
  readonly ordinaryDividendsTotal: number;
  readonly pensionsAndAnnuitiesGrossTotal: number;
  readonly qualifiedDividendsTotal: number;
  readonly line16TaxComputationMethod: CoreEngineLine16TaxComputationMethod;
  readonly linkedNonemployeeCompensationToScheduleCTotal: number;
  readonly misc1099UnsupportedIncomeAmountTotal: number;
  readonly misc1099UnsupportedIncomeCategories: ReadonlyArray<CoreEngineMisc1099IncomeCategory>;
  readonly misc1099ScheduleEAutoLinkedCount: number;
  readonly misc1099ScheduleEMappedCount: number;
  readonly misc1099ScheduleEMappedIncomeAmountTotal: number;
  readonly misc1099ScheduleEReviewCategories: ReadonlyArray<CoreEngineMisc1099IncomeCategory>;
  readonly misc1099ScheduleEReviewCount: number;
  readonly misc1099ScheduleEReviewIncomeAmountTotal: number;
  readonly nonemployeeCompensationAutoLinkedCount: number;
  readonly nonemployeeCompensationInvalidLinkedBusinessCount: number;
  readonly nonemployeeCompensationLine8jCount: number;
  readonly otherIncomeDirectTotal: number;
  readonly retirementTaxableAmountAssumptionCount: number;
  readonly scheduleCBusinessNetProfit: number;
  readonly scheduleEActivityNetTotal: number;
  readonly scheduleEInvestmentIncomeTotal: number;
  readonly scheduleELimitationOverrideCount: number;
  readonly scheduleENegativeActivityCount: number;
  readonly scheduleEPart1NetTotal: number;
  readonly scheduleEPart2NetTotal: number;
  readonly scheduleEUnclassifiedActivityCount: number;
  readonly schedule1AdditionalIncomeTotal: number;
  readonly schedule2OtherTaxesTotal: number;
  readonly schedule3NonrefundableCreditsTotal: number;
  readonly schedule3PaymentsTotal: number;
  readonly scheduleDCollectibles28PercentGainTotal: number;
  readonly scheduleDLongTermCapitalGainOrLossTotal: number;
  readonly scheduleDNetCapitalGainOrLossTotal: number;
  readonly scheduleDPriorYearLongTermCapitalLossCarryforward: number;
  readonly scheduleDPriorYearShortTermCapitalLossCarryforward: number;
  readonly scheduleDShortTermCapitalGainOrLossTotal: number;
  readonly scheduleDUnrecapturedSection1250GainTotal: number;
  readonly section1202ExclusionAmount: number;
  readonly section1202GainTotal: number;
  readonly selfEmploymentNetEarnings: number;
  readonly selfEmploymentTax: number;
  readonly selfEmploymentTaxDeduction: number;
  readonly socialSecurityBenefitsNetTotal: number;
  readonly socialSecurityWorksheetAdjustmentTotal: number;
  readonly standardDeduction: number;
  readonly taxExemptInterestTotal: number;
  readonly totalAdjustments: number;
  readonly totalIncome: number;
  readonly taxableIraDistributionsTotal: number;
  readonly taxablePensionsAndAnnuitiesTotal: number;
  readonly taxableSocialSecurityBenefitsTotal: number;
  readonly taxableSection1202GainTotal: number;
  readonly adjustedGrossIncome: number;
  readonly taxableInterestTotal: number;
  readonly unemploymentCompensationTotal: number;
  readonly unresolvedCapitalTransactionTermCount: number;
  readonly usesDocumentedFederalWithholdingFallback: boolean;
  readonly usesPreferentialRateTaxComputation: boolean;
  readonly wageTotal: number;
};

type Form2441CreditComputation = {
  readonly creditRate: number;
  readonly nonrefundableCredit: number;
  readonly qualifiedExpenses: number;
  readonly qualifyingPersonCount: number;
};

type Form8812CreditComputation = {
  readonly additionalChildTaxCredit: number;
  readonly alternativeMethodAdditionalChildTaxCredit: number;
  readonly alternativeMethodConsidered: boolean;
  readonly alternativeMethodUsed: boolean;
  readonly creditBeforePhaseout: number;
  readonly creditLimitWorksheetAAmount: number;
  readonly earnedIncomeMethodAdditionalChildTaxCredit: number;
  readonly nonrefundableCombinedCredit: number;
  readonly nonrefundableOtherDependentCredit: number;
  readonly nonrefundableChildTaxCredit: number;
  readonly otherDependentsCount: number;
  readonly phaseoutReduction: number;
  readonly qualifyingChildrenCount: number;
  readonly reducedChildTaxCredit: number;
  readonly reducedOtherDependentCredit: number;
};

type Form8863CreditComputation = {
  readonly netQualifiedExpenses: number;
  readonly nonrefundableCredit: number;
  readonly refundableCredit: number;
};

type Form8962CreditComputation = {
  readonly advancePremiumTaxCreditTotal: number;
  readonly excessAdvancePremiumTaxCreditRepayment: number;
  readonly householdIncomePercentage: number | null;
  readonly netPremiumTaxCredit: number;
};

type EarnedIncomeCreditComputation = {
  readonly amount: number;
  readonly qualifyingChildrenCount: number;
};

type PremiumTaxCreditRegion = "contiguous" | "alaska" | "hawaii";

type ScheduleSEComputation = {
  readonly netEarnings: number;
  readonly selfEmploymentTax: number;
  readonly selfEmploymentTaxDeduction: number;
  readonly socialSecurityTaxPortion: number;
  readonly medicareTaxPortion: number;
};

type Form8959Computation = {
  readonly additionalMedicareTax: number;
  readonly additionalMedicareTaxWithheld: number;
};

type Form8960Computation = {
  readonly netInvestmentIncome: number;
  readonly netInvestmentIncomeTax: number;
};

type ScheduleEActivityNet = {
  readonly activityType: CoreEngineScheduleEActivityType;
  readonly entityName: string;
  readonly index: number;
  readonly netAmount: number;
};

type ScheduleERollup = {
  readonly activityNets: ReadonlyArray<ScheduleEActivityNet>;
  readonly activityNetInvestmentIncomeTotal: number;
  readonly limitationOverrideCount: number;
  readonly negativeActivityCount: number;
  readonly part1NetTotal: number;
  readonly part2NetTotal: number;
  readonly totalNetTotal: number;
  readonly unclassifiedActivityCount: number;
};

type Schedule1AdjustmentLineItem = {
  readonly formulaRef: string;
  readonly label: string;
  readonly lineCode: string;
  readonly nodeId: string;
  readonly sourceJsonPointers: ReadonlyArray<string>;
  readonly value: number;
};

type PreferentialRateTaxComputation = {
  readonly method: CoreEngineLine16TaxComputationMethod;
  readonly tax: number;
  readonly usesWorksheet: boolean;
};

type CapitalLossDeductionComputation = {
  readonly deductibleCapitalGainOrLoss: number;
  readonly deductionLimit: number;
};

type CapitalLossCarryforwardComputation = {
  readonly longTermCarryforward: number;
  readonly shortTermCarryforward: number;
  readonly totalCarryforward: number;
};

type ScheduleDSpecialGainComputation = {
  readonly collectibles28PercentGainTotal: number;
  readonly section1202GainTotal: number;
  readonly unrecapturedSection1250GainTotal: number;
};

type NonemployeeCompensationRollup = {
  readonly autoLinkedCount: number;
  readonly invalidLinkedBusinessCount: number;
  readonly line8jAmountTotal: number;
  readonly line8jCount: number;
  readonly linkedToScheduleCAmountTotal: number;
  readonly receiptsByBusinessId: ReadonlyMap<string, number>;
};

type Misc1099IncomeRollup = {
  readonly line8bGamblingAmountTotal: number;
  readonly line8zOtherIncomeAmountTotal: number;
  readonly scheduleEAutoLinkedCount: number;
  readonly scheduleEIncomeByActivityIndex: ReadonlyMap<number, number>;
  readonly scheduleEMappedCount: number;
  readonly scheduleEMappedIncomeAmountTotal: number;
  readonly scheduleEMiscIndicesByActivityIndex: ReadonlyMap<number, ReadonlyArray<number>>;
  readonly scheduleEReviewCategories: ReadonlyArray<CoreEngineMisc1099IncomeCategory>;
  readonly scheduleEReviewCount: number;
  readonly scheduleEReviewIncomeAmountTotal: number;
  readonly unsupportedCategories: ReadonlyArray<CoreEngineMisc1099IncomeCategory>;
  readonly unsupportedCount: number;
  readonly unsupportedIncomeAmountTotal: number;
};

export {
  FEDERAL_FORM_1040_CORE_MODULE_ID,
  FEDERAL_FORM_2441_MODULE_ID,
  FEDERAL_FORM_8812_MODULE_ID,
  FEDERAL_FORM_8863_MODULE_ID,
  FEDERAL_FORM_8889_MODULE_ID,
  FEDERAL_FORM_8949_MODULE_ID,
  FEDERAL_FORM_8959_MODULE_ID,
  FEDERAL_FORM_8960_MODULE_ID,
  FEDERAL_FORM_8962_MODULE_ID,
  FEDERAL_SCHEDULE_1_MODULE_ID,
  FEDERAL_SCHEDULE_2_MODULE_ID,
  FEDERAL_SCHEDULE_3_MODULE_ID,
  FEDERAL_SCHEDULE_A_MODULE_ID,
  FEDERAL_SCHEDULE_B_MODULE_ID,
  FEDERAL_SCHEDULE_C_MODULE_ID,
  FEDERAL_SCHEDULE_D_MODULE_ID,
  FEDERAL_SCHEDULE_E_MODULE_ID,
  FEDERAL_SCHEDULE_SE_MODULE_ID,
};

export type {
  CapitalLossCarryforwardComputation,
  CapitalLossDeductionComputation,
  EarnedIncomeCreditComputation,
  FederalComputation,
  FederalFilingStatus,
  FederalModuleActivationState,
  FederalTaxBracket,
  Form2441CreditComputation,
  Form8812CreditComputation,
  Form8863CreditComputation,
  Form8959Computation,
  Form8960Computation,
  Form8962CreditComputation,
  Misc1099IncomeRollup,
  NonemployeeCompensationRollup,
  PreferentialRateTaxComputation,
  PremiumTaxCreditRegion,
  Schedule1AdjustmentLineItem,
  ScheduleDSpecialGainComputation,
  ScheduleEActivityNet,
  ScheduleERollup,
  ScheduleSEComputation,
};
