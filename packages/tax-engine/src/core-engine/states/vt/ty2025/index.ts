import { asNumber, toNumber } from "../../../helpers";
import { buildNonemployeeCompensationRollup, sumScheduleCBusinessNetProfit } from "../../../income";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../../return-kind";
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
} from "../../resident";

const VERMONT_STATE_CODE = "VT";
const VERMONT_STATE_NAME = "Vermont";
const VERMONT_FORM_RECORD_KEY = "in111";
const VERMONT_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 11_450,
  married_filing_jointly: 15_300,
  married_filing_separately: 7_650,
  qualifying_surviving_spouse: 15_300,
  single: 7_650,
} as const;
const VERMONT_ADDITIONAL_STANDARD_DEDUCTION = 1_250;
const VERMONT_PERSONAL_EXEMPTION_AMOUNT = 5_300;

type VermontFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateVermontRateScheduleTax(
  taxableIncome: number,
  filingStatus: VermontFilingStatus,
): number {
  const schedule: ReadonlyArray<readonly [number, number, number]> =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? [
          [75_000, 0, 0.0335],
          [82_500, 2_513, 0.0335],
          [199_450, 2_764, 0.066],
          [304_000, 10_482, 0.076],
          [Infinity, 18_428, 0.0875],
        ]
      : filingStatus === "head_of_household"
        ? [
            [66_200, 0, 0.0335],
            [75_000, 2_218, 0.066],
            [171_000, 2_799, 0.066],
            [276_850, 9_135, 0.076],
            [Infinity, 17_179, 0.0875],
          ]
        : filingStatus === "married_filing_separately"
          ? [
              [41_250, 0, 0.0335],
              [75_000, 1_382, 0.066],
              [99_725, 3_609, 0.066],
              [152_000, 5_241, 0.076],
              [Infinity, 9_214, 0.0875],
            ]
          : [
              [49_400, 0, 0.0335],
              [75_000, 1_655, 0.066],
              [119_700, 3_345, 0.066],
              [249_700, 6_295, 0.076],
              [Infinity, 16_175, 0.0875],
            ];

  const lowerBounds =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? [0, 75_000, 82_500, 199_450, 304_000]
      : filingStatus === "head_of_household"
        ? [0, 66_200, 75_000, 171_000, 276_850]
        : filingStatus === "married_filing_separately"
          ? [0, 41_250, 75_000, 99_725, 152_000]
          : [0, 49_400, 75_000, 119_700, 249_700];

  for (const [index, [upperBound, baseTax, rate]] of schedule.entries()) {
    if (taxableIncome <= upperBound) {
      return toWholeDollars(baseTax + (taxableIncome - lowerBounds[index]!) * rate);
    }
  }

  return 0;
}

function roundVermontPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatVermontPercentage(value: number): string {
  return roundVermontPercentage(value).toFixed(4);
}

function calculateVermontChildTaxCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly allocationRatio: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly qualifyingChildCount: number;
  readonly residentOrPartYearCreditsEligible: boolean;
}): number {
  const overrideAmount = asNumber(args.formRecord?.child_tax_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (!args.residentOrPartYearCreditsEligible || args.qualifyingChildCount <= 0) {
    return 0;
  }

  const baseCredit = args.qualifyingChildCount * 1_000;
  const phaseoutReduction =
    args.adjustedGrossIncome > 125_000
      ? Math.ceil((args.adjustedGrossIncome - 125_000) / 1_000) * 20
      : 0;
  const phasedCredit = Math.max(baseCredit - phaseoutReduction, 0);

  return toWholeDollars(phasedCredit * args.allocationRatio);
}

function calculateVermontIncomeAdjustmentPercentage(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly sourceAdjustedGrossIncome: number;
}): {
  readonly line27AdjustedGrossIncome: number;
  readonly line28VermontPortionOfAdjustedGrossIncome: number;
  readonly line29NonVermontIncome: number;
  readonly line30TotalIncome: number;
  readonly line31IncomeNotSubjectToTax: number;
  readonly line32ExemptMilitaryPay: number;
  readonly line33TotalIncomeNotSubjectToTax: number;
  readonly line34VermontIncomeSubjectToTax: number;
  readonly line35IncomeAdjustmentRatio: number;
} {
  const line27AdjustedGrossIncome = Math.max(args.adjustedGrossIncome, 0);
  const line28VermontPortionOfAdjustedGrossIncome = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.income_adjustment_numerator_amount) ??
        args.sourceAdjustedGrossIncome,
    ),
    0,
  );
  const line29NonVermontIncome = Math.max(
    line27AdjustedGrossIncome - line28VermontPortionOfAdjustedGrossIncome,
    0,
  );
  const line30TotalIncome = line27AdjustedGrossIncome;
  const line32ExemptMilitaryPay = Math.max(
    toWholeDollars(asNumber(args.formRecord?.exempt_military_pay_amount) ?? 0),
    0,
  );
  const line31IncomeNotSubjectToTax = line29NonVermontIncome;
  const line33TotalIncomeNotSubjectToTax = line31IncomeNotSubjectToTax + line32ExemptMilitaryPay;
  const line34VermontIncomeSubjectToTax = toWholeDollars(
    line30TotalIncome - line33TotalIncomeNotSubjectToTax,
  );

  if (line30TotalIncome < 0 && line34VermontIncomeSubjectToTax > 0) {
    return {
      line27AdjustedGrossIncome,
      line28VermontPortionOfAdjustedGrossIncome,
      line29NonVermontIncome,
      line30TotalIncome,
      line31IncomeNotSubjectToTax,
      line32ExemptMilitaryPay,
      line33TotalIncomeNotSubjectToTax,
      line34VermontIncomeSubjectToTax,
      line35IncomeAdjustmentRatio: 1,
    };
  }

  if (line34VermontIncomeSubjectToTax <= 0 || line30TotalIncome <= 0) {
    return {
      line27AdjustedGrossIncome,
      line28VermontPortionOfAdjustedGrossIncome,
      line29NonVermontIncome,
      line30TotalIncome,
      line31IncomeNotSubjectToTax,
      line32ExemptMilitaryPay,
      line33TotalIncomeNotSubjectToTax,
      line34VermontIncomeSubjectToTax,
      line35IncomeAdjustmentRatio: 0,
    };
  }

  return {
    line27AdjustedGrossIncome,
    line28VermontPortionOfAdjustedGrossIncome,
    line29NonVermontIncome,
    line30TotalIncome,
    line31IncomeNotSubjectToTax,
    line32ExemptMilitaryPay,
    line33TotalIncomeNotSubjectToTax,
    line34VermontIncomeSubjectToTax,
    line35IncomeAdjustmentRatio: roundVermontPercentage(
      line34VermontIncomeSubjectToTax / line30TotalIncome,
    ),
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: VERMONT_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, VERMONT_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const isNonresidentReturn = args.returnKindContext?.returnKind === "nonresident";
  const line1FederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const line2VermontAdjustments = toWholeDollars(
    sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
  );
  const line3AdjustedGrossIncomeWithModifications = toWholeDollars(
    line1FederalAdjustedGrossIncome + line2VermontAdjustments,
  );
  const additionalDeductionBoxes = countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input);
  const line4StandardDeduction = toWholeDollars(
    asNumber(formRecord?.standard_deduction_amount) ??
      VERMONT_STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus] +
        additionalDeductionBoxes * VERMONT_ADDITIONAL_STANDARD_DEDUCTION,
  );
  const line5PersonalExemptionDeduction = toWholeDollars(
    asNumber(formRecord?.personal_exemption_deduction_amount) ??
      (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
        VERMONT_PERSONAL_EXEMPTION_AMOUNT,
  );
  const line6DeductionAndExemptions = line4StandardDeduction + line5PersonalExemptionDeduction;
  const line7VermontTaxableIncome = Math.max(
    line3AdjustedGrossIncomeWithModifications - line6DeductionAndExemptions,
    0,
  );
  const taxFromRateSchedule = calculateVermontRateScheduleTax(line7VermontTaxableIncome, filingStatus);
  const minimumTaxBase = Math.max(
    line1FederalAdjustedGrossIncome - toWholeDollars(asNumber(formRecord?.us_obligation_interest_amount) ?? 0),
    0,
  );
  const line8VermontIncomeTax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ??
      (line1FederalAdjustedGrossIncome > 150_000
        ? Math.max(toWholeDollars(minimumTaxBase * 0.03), taxFromRateSchedule)
        : taxFromRateSchedule),
  );
  const line9TaxAdjustments = toWholeDollars(asNumber(formRecord?.tax_adjustment_amount) ?? 0);
  const line10TaxWithAdjustments = Math.max(line8VermontIncomeTax + line9TaxAdjustments, 0);
  const charitableContributions = toWholeDollars(
    asNumber(formRecord?.charitable_contribution_amount) ??
      toNumber(args.input.facts.itemized_deductions.charitable_cash_contributions) +
        toNumber(args.input.facts.itemized_deductions.charitable_noncash_contributions),
  );
  const line13CharitableCredit = toWholeDollars(
    asNumber(formRecord?.charitable_credit_amount) ??
      Math.min(charitableContributions * 0.05, 1_000),
  );
  const line14VermontIncomeTax = Math.max(line10TaxWithAdjustments - line13CharitableCredit, 0);
  const sourceAdjustedGrossIncome = isAllocatedReturn
    ? Math.max(
        toWholeDollars(
          asNumber(formRecord?.allocated_adjusted_gross_income_amount) ??
            deriveCombinedStateTaxedIncome(args.stateReturn) ??
            args.adjustedGrossIncome,
        ),
        0,
      )
    : line1FederalAdjustedGrossIncome;
  const line15Worksheet = calculateVermontIncomeAdjustmentPercentage({
    adjustedGrossIncome: line1FederalAdjustedGrossIncome,
    formRecord,
    sourceAdjustedGrossIncome,
  });
  const line15IncomeAdjustmentPercentage =
    asNumber(formRecord?.income_adjustment_percentage) ??
    (isAllocatedReturn ? line15Worksheet.line35IncomeAdjustmentRatio * 100 : 100);
  const line16AdjustedVermontIncomeTax = toWholeDollars(
    line14VermontIncomeTax * (line15IncomeAdjustmentPercentage / 100),
  );
  const qualifyingChildCount = args.input.household.dependents.filter((dependent) => {
    const dependentRecord = dependent as Record<string, unknown>;
    const birthYearValue = typeof dependentRecord.date_of_birth === "string"
      ? Number(dependentRecord.date_of_birth.slice(0, 4))
      : null;
    return birthYearValue != null && birthYearValue >= 2019 && birthYearValue <= 2025;
  }).length;
  const residentOrPartYearCreditsEligible = !isNonresidentReturn;
  const residentCreditAllocationRatio =
    residentOrPartYearCreditsEligible && isAllocatedReturn
      ? line15Worksheet.line35IncomeAdjustmentRatio
      : residentOrPartYearCreditsEligible
        ? 1
        : 0;
  const childTaxCredit = calculateVermontChildTaxCredit({
    adjustedGrossIncome: line1FederalAdjustedGrossIncome,
    allocationRatio: residentCreditAllocationRatio,
    formRecord,
    qualifyingChildCount,
    residentOrPartYearCreditsEligible,
  });
  const childAndDependentCareCredit = toWholeDollars(
    asNumber(formRecord?.child_and_dependent_care_credit_amount) ??
      (residentOrPartYearCreditsEligible
        ? toWholeDollars(
            ((args.returnKindContext?.originalFederalSummary ?? args.federalSummary)
              ?.child_and_dependent_care_credit ?? 0) * 0.72,
          )
        : 0),
  );
  const line17OtherStateCredit = toWholeDollars(
    asNumber(formRecord?.other_state_credit_amount) ??
      (isNonresidentReturn ? 0 : 0),
  );
  const line18VermontTaxCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) +
      childTaxCredit +
      childAndDependentCareCredit,
  );
  const line19TotalCredits = line17OtherStateCredit + line18VermontTaxCredits;
  const line20TaxAfterCredits = Math.max(line16AdjustedVermontIncomeTax - line19TotalCredits, 0);
  const nonemployeeRollup = buildNonemployeeCompensationRollup(args.input);
  const fullYearScheduleCNetProfit = sumScheduleCBusinessNetProfit(
    args.input.facts.income.schedule_c_businesses,
    nonemployeeRollup.receiptsByBusinessId,
  );
  const fullYearSelfEmploymentIncome = fullYearScheduleCNetProfit + nonemployeeRollup.line8jAmountTotal;
  const childCareContributionAllocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (line1FederalAdjustedGrossIncome > 0
      ? roundVermontPercentage(sourceAdjustedGrossIncome / line1FederalAdjustedGrossIncome)
      : 0);
  const line21ContributionBase = isAllocatedReturn
    ? Math.max(
        toWholeDollars(
          asNumber(formRecord?.vermont_self_employment_income_amount) ??
            (() => {
              const outsideAmount = asNumber(formRecord?.self_employment_income_outside_vermont_amount);
              if (outsideAmount != null) {
                return fullYearSelfEmploymentIncome - toWholeDollars(outsideAmount);
              }

              return fullYearSelfEmploymentIncome * childCareContributionAllocationRatio;
            })(),
        ),
        0,
      )
    : Math.max(
        fullYearSelfEmploymentIncome -
          toWholeDollars(asNumber(formRecord?.self_employment_income_outside_vermont_amount) ?? 0),
        0,
      );
  const line21ChildCareContribution = toWholeDollars(
    asNumber(formRecord?.child_care_contribution_amount) ??
      line21ContributionBase * 0.0011,
  );
  const line22UseTax = toWholeDollars(asNumber(formRecord?.use_tax_amount) ?? 0);
  const line23TotalVermontTaxes = line20TaxAfterCredits + line21ChildCareContribution + line22UseTax;
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits)),
    stateCode: VERMONT_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line23TotalVermontTaxes - payments.totalPayments, 0),
    startingPoint:
      isAllocatedReturn
        ? line15Worksheet.line28VermontPortionOfAdjustedGrossIncome
        : line3AdjustedGrossIncomeWithModifications,
    stateReturn: args.stateReturn,
    taxableIncome:
      isAllocatedReturn
        ? line15Worksheet.line34VermontIncomeSubjectToTax
        : line7VermontTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line23TotalVermontTaxes,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point:
          line15Worksheet.line28VermontPortionOfAdjustedGrossIncome,
        allocation_ratio: line15Worksheet.line35IncomeAdjustmentRatio,
      }
    : summary;

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Vermont Schedule IN-113 income adjustment was applied using Vermont-source or resident-period adjusted gross income and the official line 35 percentage.",
        nodeIds: [
          "vt.in113.line28",
          "vt.in113.line34",
          "vt.in113.line35",
          "vt.in111.line15",
          "vt.in111.line16",
        ],
        ruleId: "VT.schedule_in113_income_adjustment_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    residentOrPartYearCreditsEligible &&
    qualifyingChildCount > 0 &&
    line1FederalAdjustedGrossIncome > 125_000 &&
    asNumber(formRecord?.child_tax_credit_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Vermont child tax credit was phased down above $125,000 of adjusted gross income using the statutory $20-per-$1,000 reduction.",
        nodeIds: ["vt.in111.line18"],
        ruleId: "VT.child_tax_credit_phased_down",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (line1FederalAdjustedGrossIncome > 150_000 && asNumber(formRecord?.us_obligation_interest_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Vermont’s minimum tax compares 3% of federal AGI less interest from U.S. obligations to the ordinary income-tax schedule. This common path assumed zero U.S.-obligation interest because no plugin_fact_bag.in111.us_obligation_interest_amount override was provided.",
        nodeIds: ["vt.in111.line8"],
        ruleId: "VT.minimum_tax_interest_assumed_zero",
        severity: "info",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    fullYearSelfEmploymentIncome > 0 &&
    asNumber(formRecord?.child_care_contribution_amount) == null &&
    asNumber(formRecord?.vermont_self_employment_income_amount) == null &&
    asNumber(formRecord?.self_employment_income_outside_vermont_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Vermont child care contribution uses Vermont-source self-employment income. Because no explicit Vermont or outside-Vermont self-employment amount was supplied, the engine apportioned self-employment income using the state allocation profile ratio.",
        nodeIds: ["vt.in111.line21", "vt.in113.line35"],
        ruleId: "VT.child_care_contribution_ratio_proxy",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.vt.starting_point", "carryforward"),
      createStateEdge("bridge.vt.starting_point", "vt.in111.line7"),
      createStateEdge("vt.in111.line7", "vt.in111.line8"),
      ...(isAllocatedReturn
        ? [
            createStateEdge("vt.in113.line28", "vt.in113.line34"),
            createStateEdge("vt.in113.line31", "vt.in113.line33"),
            createStateEdge("vt.in113.line32", "vt.in113.line33"),
            createStateEdge("vt.in113.line33", "vt.in113.line34"),
            createStateEdge("vt.in113.line34", "vt.in113.line35"),
            createStateEdge("vt.in113.line35", "vt.in111.line15"),
            createStateEdge("vt.in111.line14", "vt.in111.line16"),
            createStateEdge("vt.in111.line15", "vt.in111.line16"),
          ]
        : []),
      createStateEdge("vt.in111.line8", "vt.in111.line23"),
      createStateEdge("vt.in111.line23", "vt.summary.total_tax"),
      createStateEdge("vt.in111.line26", "vt.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont line 3 adjusted gross income with modifications",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont adjusted gross income with modifications",
        lineCode: "line3",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.vt.starting_point",
        nodeType: "bridge",
        value: line3AdjustedGrossIncomeWithModifications,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont additions less Vermont subtractions",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont income modifications",
        lineCode: "line2",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line2",
        nodeType: "calculation",
        value: line2VermontAdjustments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont standard deduction table plus age/blind additional deduction boxes",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont standard deduction",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line4",
        nodeType: "calculation",
        value: line4StandardDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont personal exemption deduction",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont personal exemption deduction",
        lineCode: "line5e",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line5e",
        nodeType: "calculation",
        value: line5PersonalExemptionDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line4 + line5e",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont total deduction and exemptions",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line6",
        nodeType: "calculation",
        value: line6DeductionAndExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line3 - line6, 0)",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont taxable income",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line7",
        nodeType: "calculation",
        value: line7VermontTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont rate schedule or 3% minimum-tax comparison",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont income tax",
        lineCode: "line8",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line8",
        nodeType: "calculation",
        value: line8VermontIncomeTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont tax adjustments",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont tax adjustments",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line9",
        nodeType: "calculation",
        value: line9TaxAdjustments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line8 + line9",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont tax with adjustments",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line10",
        nodeType: "calculation",
        value: line10TaxWithAdjustments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont charitable contribution credit",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont charitable contribution credit",
        lineCode: "line13",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line13",
        nodeType: "calculation",
        value: line13CharitableCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line10 - line13",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont income tax after charitable credit",
        lineCode: "line14",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line14",
        nodeType: "calculation",
        value: line14VermontIncomeTax,
      }),
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule IN-113 line 28 Vermont portion of adjusted gross income",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Vermont portion of adjusted gross income",
              lineCode: "line28",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in113.line28",
              nodeType: "calculation",
              value: line15Worksheet.line28VermontPortionOfAdjustedGrossIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule IN-113 line 31 non-Vermont income",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Non-Vermont income",
              lineCode: "line31",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in113.line31",
              nodeType: "calculation",
              value: line15Worksheet.line31IncomeNotSubjectToTax,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule IN-113 line 32 exempt military pay",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Vermont exempt military pay",
              lineCode: "line32",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in113.line32",
              nodeType: "calculation",
              value: line15Worksheet.line32ExemptMilitaryPay,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule IN-113 line 34 Vermont income subject to tax",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Vermont income subject to tax",
              lineCode: "line34",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in113.line34",
              nodeType: "calculation",
              value: line15Worksheet.line34VermontIncomeSubjectToTax,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule IN-113 line 35 Vermont income adjustment ratio",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Vermont income adjustment ratio",
              lineCode: "line35",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in113.line35",
              nodeType: "calculation",
              value: formatVermontPercentage(line15Worksheet.line35IncomeAdjustmentRatio),
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Form IN-111 line 15 income adjustment percentage from Schedule IN-113",
              jurisdiction: VERMONT_STATE_CODE,
              label: "Vermont income adjustment percentage",
              lineCode: "line15",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "vt.in111.line15",
              nodeType: "calculation",
              value: toWholeDollars(line15IncomeAdjustmentPercentage * 100) / 100,
            }),
          ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line14 * line15 percentage",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Adjusted Vermont income tax",
        lineCode: "line16",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line16",
        nodeType: "calculation",
        value: line16AdjustedVermontIncomeTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont credits including child and dependent care, child tax credit, and other state credits",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont tax credits",
        lineCode: "line19",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line19",
        nodeType: "calculation",
        value: line19TotalCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont child care contribution worksheet",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont child care contribution",
        lineCode: "line21",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line21",
        nodeType: "calculation",
        value: line21ChildCareContribution,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line20 + line21 + line22",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Total Vermont taxes",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line23",
        nodeType: "summary",
        value: line23TotalVermontTaxes,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Vermont payments and withholding total",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont total payments",
        lineCode: "line26",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.in111.line26",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "IN-111 summary total tax",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "IN-111 summary total payments",
        jurisdiction: VERMONT_STATE_CODE,
        label: "Vermont total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "vt.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
    ],
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
