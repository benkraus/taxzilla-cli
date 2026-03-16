import { sumItemizedDeductionTotals } from "../../foundations";
import { asNumber, normalizeTextMatch } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countDependentExemptions,
  countPersonalExemptions,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  sumStateSubtractionAmounts,
  toWholeDollars,
} from "../resident";

const OKLAHOMA_STATE_CODE = "OK";
const OKLAHOMA_STATE_NAME = "Oklahoma";
const OKLAHOMA_FORM_RECORD_KEY = "form511";
const OKLAHOMA_ITEMIZED_DEDUCTION_CAP = 17_000;
const OKLAHOMA_CHILD_CARE_CREDIT_RATE = 0.2;
const OKLAHOMA_CHILD_TAX_CREDIT_RATE = 0.05;
const OKLAHOMA_STANDARD_DEDUCTION = {
  head_of_household: 9_350,
  married_filing_jointly: 12_700,
  married_filing_separately: 6_350,
  qualifying_surviving_spouse: 12_700,
  single: 6_350,
} as const;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.min(value, 1), 0);
}

function calculateOklahomaSingleTaxRaw(taxableIncome: number): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (taxableIncome <= 1_000) {
    return taxableIncome * 0.0025;
  }

  if (taxableIncome <= 2_500) {
    return 2.5 + (taxableIncome - 1_000) * 0.0075;
  }

  if (taxableIncome <= 3_750) {
    return 13.75 + (taxableIncome - 2_500) * 0.0175;
  }

  if (taxableIncome <= 4_900) {
    return 35.63 + (taxableIncome - 3_750) * 0.0275;
  }

  if (taxableIncome <= 7_200) {
    return 67.25 + (taxableIncome - 4_900) * 0.0375;
  }

  return 153.5 + (taxableIncome - 7_200) * 0.0475;
}

function calculateOklahomaTax(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly taxableIncome: number;
}): number {
  if (args.taxableIncome <= 0) {
    return 0;
  }

  const usesTable = args.taxableIncome < 100_000;
  const taxableIncomeForComputation = usesTable
    ? Math.floor(args.taxableIncome / 50) * 50 + 25
    : args.taxableIncome;

  const isSplitRateReturn =
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "qualifying_surviving_spouse" ||
    args.filingStatus === "head_of_household";
  const rawTax = isSplitRateReturn
    ? calculateOklahomaSingleTaxRaw(taxableIncomeForComputation / 2) * 2
    : calculateOklahomaSingleTaxRaw(taxableIncomeForComputation);

  return toWholeDollars(rawTax);
}

function getOklahomaStandardDeduction(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  return OKLAHOMA_STANDARD_DEDUCTION[filingStatus];
}

function calculateOklahomaItemizedDeduction(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitAmount = asNumber(args.formRecord?.itemized_deductions_total);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  const itemizedFacts = args.input.facts.itemized_deductions;
  const factDerivedFederalItemizedTotal = Math.max(
    toWholeDollars(sumItemizedDeductionTotals(itemizedFacts)),
    0,
  );
  const hasDetailedItemizedFacts =
    factDerivedFederalItemizedTotal > 0 ||
    (itemizedFacts.medical_and_dental_expenses ?? 0) > 0 ||
    (itemizedFacts.charitable_cash_contributions ?? 0) > 0 ||
    (itemizedFacts.charitable_noncash_contributions ?? 0) > 0;
  const line1FederalItemizedDeductions = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_schedule_a_line17_itemized_deductions_amount) ??
        asNumber(args.formRecord?.federal_itemized_deductions_amount) ??
        (hasDetailedItemizedFacts
          ? factDerivedFederalItemizedTotal
          : args.federalSummary?.itemized_deduction_total ?? 0),
    ),
    0,
  );
  const line2StateAndLocalIncomeOrSalesTaxes = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_schedule_a_line5a_state_and_local_income_or_sales_taxes_amount) ??
        asNumber(args.formRecord?.state_and_local_income_or_sales_taxes_amount) ??
        (itemizedFacts.state_and_local_income_or_sales_taxes ?? 0),
    ),
    0,
  );
  const line3FederalItemizedLessSalt = Math.max(
    line1FederalItemizedDeductions - line2StateAndLocalIncomeOrSalesTaxes,
    0,
  );

  if (!hasDetailedItemizedFacts && args.federalSummary?.itemized_deduction_total != null) {
    return line3FederalItemizedLessSalt;
  }

  const line4MedicalAndDentalExpenses = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_schedule_a_line4_medical_and_dental_expenses_amount) ??
        (itemizedFacts.medical_and_dental_expenses ?? 0),
    ),
    0,
  );
  const line5GiftsToCharity = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_schedule_a_line14_gifts_to_charity_amount) ??
        (itemizedFacts.charitable_cash_contributions ?? 0) +
          (itemizedFacts.charitable_noncash_contributions ?? 0),
    ),
    0,
  );
  const cappedBucket = Math.max(
    line3FederalItemizedLessSalt - line4MedicalAndDentalExpenses - line5GiftsToCharity,
    0,
  );

  return cappedBucket > OKLAHOMA_ITEMIZED_DEDUCTION_CAP
    ? OKLAHOMA_ITEMIZED_DEDUCTION_CAP + line4MedicalAndDentalExpenses + line5GiftsToCharity
    : line3FederalItemizedLessSalt;
}

function getOklahomaExemptionThreshold(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  switch (filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      return 25_000;
    case "married_filing_separately":
      return 12_500;
    case "head_of_household":
      return 19_000;
    default:
      return 15_000;
  }
}

function calculateOklahomaExemptionAmount(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const overrideAmount = asNumber(args.formRecord?.exemption_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const baseExemptions =
    countPersonalExemptions(args.stateArtifactsArgs.input, args.filingStatus) +
    countDependentExemptions(args.stateArtifactsArgs.input);
  const ageOrBlindAdditionalExemptions =
    args.adjustedGrossIncome <= getOklahomaExemptionThreshold(args.filingStatus)
      ? countSeniorTaxpayers(args.stateArtifactsArgs.input) + countBlindTaxpayers(args.stateArtifactsArgs.input)
      : 0;

  return (baseExemptions + ageOrBlindAdditionalExemptions) * 1_000;
}

function shouldUseOklahomaItemizedDeduction(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
}): boolean {
  if (args.formRecord?.force_standard_deduction === true) {
    return false;
  }

  if (args.formRecord?.use_itemized_deductions === true) {
    return true;
  }

  return args.federalSummary?.deduction_strategy === "itemized";
}

function isEligibleOklahomaOutOfStateIncome(args: {
  readonly allocationMethod: string;
  readonly incomeClass: string;
}): boolean {
  switch (args.incomeClass) {
    case "business":
    case "rental":
    case "pass_through":
      return true;
    case "capital_gain":
    case "other":
      return (
        args.allocationMethod === "property_location" ||
        args.allocationMethod === "entity_apportionment" ||
        args.allocationMethod === "manual_override"
      );
    default:
      return false;
  }
}

function calculateOklahomaOutOfStateIncome(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitAmount =
    asNumber(args.formRecord?.out_of_state_income_amount) ??
    asNumber(args.formRecord?.form_511_line4_out_of_state_income_amount) ??
    asNumber(args.formRecord?.schedule_511e_out_of_state_income_amount);

  if (explicitAmount != null) {
    return Math.max(toWholeDollars(explicitAmount), 0);
  }

  return toWholeDollars(
    (args.input.facts.state?.income_sourcing ?? []).reduce((total, entry) => {
      if (
        entry.state_code === OKLAHOMA_STATE_CODE ||
        entry.state_code === "" ||
        !isEligibleOklahomaOutOfStateIncome({
          allocationMethod: entry.allocation_method,
          incomeClass: entry.income_class,
        })
      ) {
        return total;
      }

      return (
        total +
        Math.max(
          toWholeDollars(
            entry.resident_period_amount ?? entry.state_source_amount ?? entry.total_amount,
          ),
          0,
        )
      );
    }, 0),
  );
}

function calculateOklahomaScheduleEProrationRatio(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line3AfterSubtractions: number;
  readonly line7OklahomaAdjustedGrossIncome: number;
}): number {
  const explicitPercentage =
    asNumber(args.formRecord?.schedule_511e_percentage) ??
    asNumber(args.formRecord?.schedule_511e_proration_percentage);

  if (explicitPercentage != null) {
    return clampRatio(explicitPercentage / 100);
  }

  const explicitRatio =
    asNumber(args.formRecord?.schedule_511e_ratio) ??
    asNumber(args.formRecord?.schedule_511e_proration_ratio) ??
    asNumber(args.formRecord?.out_of_state_proration_ratio);

  if (explicitRatio != null) {
    return clampRatio(explicitRatio);
  }

  if (args.line3AfterSubtractions <= 0) {
    return 1;
  }

  return clampRatio(args.line7OklahomaAdjustedGrossIncome / args.line3AfterSubtractions);
}

function calculateOklahomaScheduleFProrationRatio(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line1FederalAdjustedGrossIncome: number;
  readonly line7OklahomaAdjustedGrossIncome: number;
}): number {
  const explicitPercentage =
    asNumber(args.formRecord?.schedule_511f_percentage) ??
    asNumber(args.formRecord?.schedule_511f_proration_percentage);

  if (explicitPercentage != null) {
    return clampRatio(explicitPercentage / 100);
  }

  const explicitRatio =
    asNumber(args.formRecord?.schedule_511f_ratio) ??
    asNumber(args.formRecord?.schedule_511f_proration_ratio);

  if (explicitRatio != null) {
    return clampRatio(explicitRatio);
  }

  if (args.line1FederalAdjustedGrossIncome <= 0) {
    return 1;
  }

  return clampRatio(args.line7OklahomaAdjustedGrossIncome / args.line1FederalAdjustedGrossIncome);
}

function calculateOklahomaChildTaxCreditBase(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitAmount =
    asNumber(args.formRecord?.federal_child_tax_credit_amount) ??
    asNumber(args.formRecord?.federal_child_tax_and_additional_child_tax_credit_amount);

  if (explicitAmount != null) {
    return Math.max(toWholeDollars(explicitAmount), 0);
  }

  const federalCombinedCredit = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_line19_child_tax_credit_or_credit_for_other_dependents_amount) ??
        args.federalSummary?.line19_child_tax_credit_or_credit_for_other_dependents ??
        args.federalSummary?.child_tax_credit_or_credit_for_other_dependents ??
        0,
    ),
    0,
  );
  const federalCreditForOtherDependents = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_credit_for_other_dependents_amount) ??
        Math.min(
          federalCombinedCredit,
          args.input.facts.credits.candidate_credit_for_other_dependent_ids.length * 500,
        ),
    ),
    0,
  );
  const federalAdditionalChildTaxCredit = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_additional_child_tax_credit_amount) ??
        args.federalSummary?.line28_additional_child_tax_credit ??
        args.federalSummary?.additional_child_tax_credit ??
        0,
    ),
    0,
  );

  return Math.max(federalCombinedCredit - federalCreditForOtherDependents, 0) + federalAdditionalChildTaxCredit;
}

function calculateOklahomaChildRelatedCredit(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly line1FederalAdjustedGrossIncome: number;
  readonly line7OklahomaAdjustedGrossIncome: number;
}): number {
  const explicitCredit = asNumber(args.formRecord?.child_care_or_child_tax_credit_amount);

  if (explicitCredit != null) {
    return Math.max(toWholeDollars(explicitCredit), 0);
  }

  if (args.line1FederalAdjustedGrossIncome > 100_000) {
    return 0;
  }

  const federalChildCareCredit = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.federal_child_care_credit_amount) ??
        args.federalSummary?.child_and_dependent_care_credit ??
        0,
    ),
    0,
  );
  const federalChildTaxCredit = calculateOklahomaChildTaxCreditBase({
    federalSummary: args.federalSummary,
    formRecord: args.formRecord,
    input: args.input,
  });
  const baseCredit = Math.max(
    toWholeDollars(federalChildCareCredit * OKLAHOMA_CHILD_CARE_CREDIT_RATE),
    toWholeDollars(federalChildTaxCredit * OKLAHOMA_CHILD_TAX_CREDIT_RATE),
  );

  if (args.line7OklahomaAdjustedGrossIncome < args.line1FederalAdjustedGrossIncome) {
    const scheduleFRatio = calculateOklahomaScheduleFProrationRatio({
      formRecord: args.formRecord,
      line1FederalAdjustedGrossIncome: args.line1FederalAdjustedGrossIncome,
      line7OklahomaAdjustedGrossIncome: args.line7OklahomaAdjustedGrossIncome,
    });

    return toWholeDollars(baseCredit * scheduleFRatio);
  }

  return baseCredit;
}

function hasOklahomaChildRelatedCreditInputs(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
}): boolean {
  return (
    asNumber(args.formRecord?.child_care_or_child_tax_credit_amount) != null ||
    asNumber(args.formRecord?.federal_child_care_credit_amount) != null ||
    asNumber(args.formRecord?.federal_child_tax_credit_amount) != null ||
    asNumber(args.formRecord?.federal_child_tax_and_additional_child_tax_credit_amount) != null ||
    asNumber(args.formRecord?.federal_line19_child_tax_credit_or_credit_for_other_dependents_amount) != null ||
    asNumber(args.formRecord?.federal_additional_child_tax_credit_amount) != null ||
    args.federalSummary?.child_and_dependent_care_credit != null ||
    args.federalSummary?.line19_child_tax_credit_or_credit_for_other_dependents != null ||
    args.federalSummary?.child_tax_credit_or_credit_for_other_dependents != null ||
    args.federalSummary?.line28_additional_child_tax_credit != null ||
    args.federalSummary?.additional_child_tax_credit != null
  );
}

function isEligibleOklahomaOtherStateCreditCategory(category: string): boolean {
  const normalizedCategory = normalizeTextMatch(category);

  if (normalizedCategory.length === 0) {
    return true;
  }

  if (
    normalizedCategory.includes("interest") ||
    normalizedCategory.includes("dividend") ||
    normalizedCategory.includes("refund") ||
    normalizedCategory.includes("unemployment") ||
    normalizedCategory.includes("rental") ||
    normalizedCategory.includes("royalty") ||
    normalizedCategory.includes("oil") ||
    normalizedCategory.includes("gas")
  ) {
    return false;
  }

  return (
    normalizedCategory.includes("wage") ||
    normalizedCategory.includes("salary") ||
    normalizedCategory.includes("commission") ||
    normalizedCategory.includes("personal") ||
    normalizedCategory.includes("service") ||
    normalizedCategory.includes("compensation") ||
    normalizedCategory.includes("gambl") ||
    normalizedCategory.includes("w2g") ||
    normalizedCategory.includes("retirement") ||
    normalizedCategory.includes("pension") ||
    normalizedCategory.includes("annuit") ||
    normalizedCategory.includes("ira")
  );
}

function calculateOklahomaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line7OklahomaAdjustedGrossIncome: number;
  readonly line14TotalIncomeTax: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return Math.max(toWholeDollars(explicitCredit), 0);
  }

  if (args.line7OklahomaAdjustedGrossIncome <= 0 || args.line14TotalIncomeTax <= 0) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter(
        (claim) =>
          claim.resident_state_code === OKLAHOMA_STATE_CODE &&
          claim.income_amount > 0 &&
          isEligibleOklahomaOtherStateCreditCategory(claim.category),
      )
      .reduce((total, claim) => {
        const limitationRatio = clampRatio(claim.income_amount / args.line7OklahomaAdjustedGrossIncome);
        const limitationAmount = toWholeDollars(args.line14TotalIncomeTax * limitationRatio);
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, limitationAmount);
      }, 0),
  );
}

function hasPotentialOklahomaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (!stateFacts) {
    return false;
  }

  const hasStructuredClaim = stateFacts.other_state_tax_credit_claims.some(
    (claim) => claim.resident_state_code === OKLAHOMA_STATE_CODE,
  );

  if (hasStructuredClaim) {
    return true;
  }

  const hasOtherStateWithholding = stateFacts.withholding.some(
    (entry) =>
      entry.jurisdiction_level === "state" &&
      entry.state_code !== OKLAHOMA_STATE_CODE &&
      entry.amount > 0,
  );

  if (hasOtherStateWithholding) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== OKLAHOMA_STATE_CODE &&
      (entry.income_class === "wages" ||
        entry.income_class === "retirement" ||
        entry.income_class === "other"),
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: OKLAHOMA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, OKLAHOMA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const usesItemizedDeduction = shouldUseOklahomaItemizedDeduction({
    federalSummary: args.federalSummary,
    formRecord,
  });
  const line1FederalAdjustedGrossIncome = Math.max(toWholeDollars(args.adjustedGrossIncome), 0);
  const line2Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line3AfterSubtractions = Math.max(line1FederalAdjustedGrossIncome - line2Subtractions, 0);
  const line4OutOfStateIncome = calculateOklahomaOutOfStateIncome({
    formRecord,
    input: args.input,
  });
  const line5AfterOutOfStateIncome = Math.max(line3AfterSubtractions - line4OutOfStateIncome, 0);
  const line6Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line7OklahomaAdjustedGrossIncome = Math.max(line5AfterOutOfStateIncome + line6Additions, 0);
  const line8Adjustments = Math.max(
    toWholeDollars(
      asNumber(formRecord?.adjustments_amount) ??
        asNumber(formRecord?.oklahoma_adjustments_amount) ??
        asNumber(formRecord?.schedule_511c_adjustments_amount) ??
        0,
    ),
    0,
  );
  const line9OklahomaIncomeAfterAdjustments = Math.max(line7OklahomaAdjustedGrossIncome - line8Adjustments, 0);
  const line10Deduction = usesItemizedDeduction
    ? calculateOklahomaItemizedDeduction({
        federalSummary: args.federalSummary,
        formRecord,
        input: args.input,
      })
    : Math.max(
        toWholeDollars(
          asNumber(formRecord?.standard_deduction_amount) ?? getOklahomaStandardDeduction(filingStatus),
        ),
        0,
      );
  const line11Exemptions = calculateOklahomaExemptionAmount({
    adjustedGrossIncome: line1FederalAdjustedGrossIncome,
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line12TotalDeductionsAndExemptions =
    line4OutOfStateIncome > 0
      ? toWholeDollars(
          (line10Deduction + line11Exemptions) *
            calculateOklahomaScheduleEProrationRatio({
              formRecord,
              line3AfterSubtractions,
              line7OklahomaAdjustedGrossIncome,
            }),
        )
      : line10Deduction + line11Exemptions;
  const line13OklahomaTaxableIncome = Math.max(
    line9OklahomaIncomeAfterAdjustments - line12TotalDeductionsAndExemptions,
    0,
  );
  const line14BaseIncomeTax = asNumber(formRecord?.income_tax_amount) ?? calculateOklahomaTax({
    filingStatus,
    taxableIncome: line13OklahomaTaxableIncome,
  });
  const line14OtherTaxes = Math.max(toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0), 0);
  const line14TotalIncomeTax = line14BaseIncomeTax + line14OtherTaxes;
  const line15ChildCareOrChildTaxCredit = calculateOklahomaChildRelatedCredit({
    federalSummary: args.federalSummary,
    formRecord,
    input: args.input,
    line1FederalAdjustedGrossIncome,
    line7OklahomaAdjustedGrossIncome,
  });
  const line16OtherStateCredit = calculateOklahomaOtherStateCredit({
    formRecord,
    line7OklahomaAdjustedGrossIncome,
    line14TotalIncomeTax,
    stateArtifactsArgs: args,
  });
  const line17OtherCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line20TotalTax = Math.max(
    line14TotalIncomeTax - line15ChildCareOrChildTaxCredit - line16OtherStateCredit - line17OtherCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: OKLAHOMA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line20TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line13OklahomaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line20TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Oklahoma whole-dollar rules",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma Form 511 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ok.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form511.subtractions",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma subtractions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line2",
      nodeType: "calculation",
      value: line2Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 - line2, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma income after subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line3",
      nodeType: "calculation",
      value: line3AfterSubtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "plugin_fact_bag.form511.out_of_state_income_amount or state income_sourcing for non-Oklahoma property and business income",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma out-of-state income deduction",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line4",
      nodeType: "calculation",
      value: line4OutOfStateIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line3 - line4, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma income after out-of-state deduction",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line5",
      nodeType: "calculation",
      value: line5AfterOutOfStateIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form511.additions",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma additions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line6",
      nodeType: "calculation",
      value: line6Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line5 + line6, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma adjusted gross income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line7",
      nodeType: "calculation",
      value: line7OklahomaAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "plugin_fact_bag.form511.adjustments_amount or Schedule 511-C total",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma adjustments",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line8",
      nodeType: "calculation",
      value: line8Adjustments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line7 - line8, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma income after adjustments",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line9",
      nodeType: "calculation",
      value: line9OklahomaIncomeAfterAdjustments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        usesItemizedDeduction
          ? "Schedule 511-D from canonical Schedule A facts or plugin_fact_bag.form511.itemized_deductions_total"
          : "Oklahoma standard deduction",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma deduction",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line10",
      nodeType: "calculation",
      value: line10Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Oklahoma personal, dependent, and age/blind exemptions",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma exemptions",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line11",
      nodeType: "calculation",
      value: line11Exemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        line4OutOfStateIncome > 0
          ? "Schedule 511-E: (line10 + line11) * min(line7 / line3, 100%)"
          : "line10 + line11",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma total deductions and exemptions",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line12",
      nodeType: "calculation",
      value: line12TotalDeductionsAndExemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line9 - line12, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma taxable income",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line13",
      nodeType: "calculation",
      value: line13OklahomaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Oklahoma tax table equivalent or computation worksheet",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma income tax before credits",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line14",
      nodeType: "calculation",
      value: line14TotalIncomeTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "Schedule 511-F from federal child care credit, child tax credit, and Oklahoma AGI ratio or plugin override",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma child care or child tax credit",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line15",
      nodeType: "calculation",
      value: line15ChildCareOrChildTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "Form 511-TX limitation from structured other-state credit claims or explicit plugin override",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma credit for tax paid to another state",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line16",
      nodeType: "calculation",
      value: line16OtherStateCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line14 - line15 - line16 - line17, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma total tax",
      lineCode: "line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line20",
      nodeType: "summary",
      value: line20TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma total payments",
      lineCode: "line33",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.form511.line33",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form511.line13",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.summary.taxable_income",
      nodeType: "summary",
      value: line13OklahomaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form511.line20",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.summary.total_tax",
      nodeType: "summary",
      value: line20TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form511.line33",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line33 - line20, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 - line33, 0)",
      jurisdiction: OKLAHOMA_STATE_CODE,
      label: "Oklahoma amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ok.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ok.starting_point", "carryforward"),
    createStateEdge("bridge.ok.starting_point", "ok.form511.line3"),
    createStateEdge("ok.form511.line2", "ok.form511.line3"),
    createStateEdge("ok.form511.line3", "ok.form511.line5"),
    createStateEdge("ok.form511.line4", "ok.form511.line5"),
    createStateEdge("ok.form511.line5", "ok.form511.line7"),
    createStateEdge("ok.form511.line6", "ok.form511.line7"),
    createStateEdge("ok.form511.line7", "ok.form511.line9"),
    createStateEdge("ok.form511.line8", "ok.form511.line9"),
    createStateEdge("ok.form511.line10", "ok.form511.line12"),
    createStateEdge("ok.form511.line11", "ok.form511.line12"),
    createStateEdge("ok.form511.line3", "ok.form511.line12"),
    createStateEdge("ok.form511.line7", "ok.form511.line12"),
    createStateEdge("ok.form511.line9", "ok.form511.line13"),
    createStateEdge("ok.form511.line12", "ok.form511.line13"),
    createStateEdge("ok.form511.line13", "ok.form511.line14"),
    createStateEdge("ok.form511.line14", "ok.form511.line20"),
    createStateEdge("ok.form511.line15", "ok.form511.line20"),
    createStateEdge("ok.form511.line16", "ok.form511.line20"),
    createStateEdge("ok.form511.line20", "ok.summary.total_tax"),
    createStateEdge("ok.form511.line33", "ok.summary.total_payments"),
  ];

  const validationResults = [];
  const hasCandidateChildCareCredit =
    args.input.facts.credits.child_and_dependent_care.qualifying_person_ids.length > 0;
  const hasCandidateChildTaxCredit =
    args.input.facts.credits.candidate_child_tax_credit_dependent_ids.length > 0;
  const hasOtherStateRequested = args.input.requested_jurisdictions.states.some(
    (stateCode) => stateCode !== OKLAHOMA_STATE_CODE && stateCode !== "",
  );

  if (
    line1FederalAdjustedGrossIncome <= 100_000 &&
    (hasCandidateChildCareCredit || hasCandidateChildTaxCredit) &&
    line15ChildCareOrChildTaxCredit === 0 &&
    !hasOklahomaChildRelatedCreditInputs({
      federalSummary: args.federalSummary,
      formRecord,
    })
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Oklahoma child care or child tax credit remained zero because no federal child care or child tax credit amount was present to carry into Schedule 511-F.",
        nodeIds: ["ok.form511.line15"],
        ruleId: "OK.child_related_credit_not_claimed",
        severity: "info",
      }),
    );
  }

  if (
    hasOtherStateRequested &&
    line16OtherStateCredit === 0 &&
    asNumber(formRecord?.tax_paid_to_other_state_credit) == null &&
    asNumber(formRecord?.other_state_credit_amount) == null &&
    hasPotentialOklahomaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Oklahoma credit for tax paid to another state stayed at zero because no Form 511-TX style claim amount was supplied for the available other-state income or withholding facts.",
        nodeIds: ["ok.form511.line16"],
        ruleId: "OK.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
