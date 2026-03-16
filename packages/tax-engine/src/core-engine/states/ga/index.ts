import { asBoolean, asNumber, asRecord, asString, getAgeOnLastDayOfTaxYear } from "../../helpers";
import { sumItemizedDeductionTotals } from "../../foundations";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../return-kind";
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

const GEORGIA_STATE_CODE = "GA";
const GEORGIA_STATE_NAME = "Georgia";
const GEORGIA_FORM_RECORD_KEY = "ga500";
const GEORGIA_FLAT_TAX_RATE = 0.0519;
const GEORGIA_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 12_000,
  married_filing_jointly: 24_000,
  married_filing_separately: 12_000,
  qualifying_surviving_spouse: 12_000,
  single: 12_000,
} as const;
const GEORGIA_ADDITIONAL_DEDUCTION = 1_300;
const GEORGIA_DEPENDENT_EXEMPTION = 4_000;
const GEORGIA_RETIREMENT_EXCLUSION_62_TO_64 = 35_000;
const GEORGIA_RETIREMENT_EXCLUSION_65_AND_OVER = 65_000;

function roundGeorgiaSchedule3Ratio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateGeorgiaDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly derivedFromFederalFacts: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      derivedFromFederalFacts: false,
    };
  }

  const standardDeduction =
    GEORGIA_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus] +
    toWholeDollars(
      (asNumber(args.formRecord?.additional_deduction_box_count) ??
        countSeniorTaxpayers(args.stateArtifactsArgs.input) + countBlindTaxpayers(args.stateArtifactsArgs.input)) *
        GEORGIA_ADDITIONAL_DEDUCTION,
    );
  const federalItemizedDeductionFactsTotal = toWholeDollars(
    sumItemizedDeductionTotals(args.stateArtifactsArgs.input.facts.itemized_deductions),
  );
  const itemizedDeductionsTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (federalItemizedDeductionFactsTotal > 0 ? federalItemizedDeductionFactsTotal : undefined) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
        : 0),
  );
  const mustItemize =
    args.filingStatus === "married_filing_separately" &&
    asBoolean(args.formRecord?.spouse_itemized_federal) === true;
  const useItemizedDeductions =
    mustItemize ||
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized";

  if (useItemizedDeductions) {
    return {
      deduction: itemizedDeductionsTotal,
      derivedFromFederalFacts:
        asNumber(args.formRecord?.itemized_deductions_total) == null &&
        federalItemizedDeductionFactsTotal > 0,
    };
  }

  return {
    deduction: standardDeduction,
    derivedFromFederalFacts: false,
  };
}

function calculateGeorgiaLowIncomeCredit(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const overrideAmount = asNumber(args.formRecord?.low_income_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (
    args.stateArtifactsArgs.input.household.can_be_claimed_as_dependent === true ||
    args.federalAdjustedGrossIncome >= 20_000
  ) {
    return 0;
  }

  const creditPerExemption =
    args.federalAdjustedGrossIncome < 6_000
      ? 26
      : args.federalAdjustedGrossIncome <= 7_999
        ? 20
        : args.federalAdjustedGrossIncome <= 9_999
          ? 14
          : args.federalAdjustedGrossIncome <= 14_999
            ? 8
            : 5;
  const exemptionCount =
    countPersonalExemptions(args.stateArtifactsArgs.input, args.filingStatus) +
    countDependentExemptions(args.stateArtifactsArgs.input) +
    countSeniorTaxpayers(args.stateArtifactsArgs.input);

  return toWholeDollars(exemptionCount * creditPerExemption);
}

function calculateGeorgiaRetirementIncomeExclusion(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitAmount = asNumber(args.formRecord?.retirement_income_exclusion_amount);

  if (explicitAmount != null) {
    return toWholeDollars(explicitAmount);
  }

  const taxableRetirementIncome = toWholeDollars(
    args.input.facts.income.retirement_distributions.reduce(
      (total, distribution) => total + Math.max(distribution.taxable_amount ?? 0, 0),
      0,
    ),
  );

  if (taxableRetirementIncome <= 0) {
    return 0;
  }

  const eligibleExclusionCap = [args.input.household.taxpayer, args.input.household.spouse].reduce<number>(
    (total, person) => {
      const age = getAgeOnLastDayOfTaxYear(
        asString(asRecord(person)?.date_of_birth),
        args.input.tax_year,
      );

      if (age == null || age < 62) {
        return total;
      }

      if (age >= 65) {
        return total + GEORGIA_RETIREMENT_EXCLUSION_65_AND_OVER;
      }

      return total + GEORGIA_RETIREMENT_EXCLUSION_62_TO_64;
    },
    0,
  );

  return toWholeDollars(Math.min(taxableRetirementIncome, eligibleExclusionCap));
}

function calculateGeorgiaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly totalTaxBeforeCredits: number;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(Math.max(explicitCredit, 0));
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  const georgiaAdjustedGrossIncome = Math.max(
    toWholeDollars(args.stateArtifactsArgs.adjustedGrossIncome) +
      sumStateAdditionAmounts(
        args.stateArtifactsArgs.stateReturn,
        readNamedAmountArrayTotal(args.formRecord?.additions),
      ) -
      sumStateSubtractionAmounts(
        args.stateArtifactsArgs.stateReturn,
        readNamedAmountArrayTotal(args.formRecord?.subtractions),
      ),
    0,
  );

  if (georgiaAdjustedGrossIncome <= 0 || args.totalTaxBeforeCredits <= 0) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === GEORGIA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const georgiaCreditLimit = toWholeDollars(
          args.totalTaxBeforeCredits *
            Math.max(Math.min(claim.income_amount / georgiaAdjustedGrossIncome, 1), 0),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, georgiaCreditLimit);
      }, 0),
  );
}

function hasPotentialGeorgiaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === GEORGIA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== GEORGIA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== GEORGIA_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: GEORGIA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, GEORGIA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const line8FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const georgiaSourceAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? georgiaSourceAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line9Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const retirementIncomeExclusion = calculateGeorgiaRetirementIncomeExclusion({
    formRecord,
    input: args.input,
  });
  const line10Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions) +
      retirementIncomeExclusion,
  );
  const line11GeorgiaAdjustedGrossIncome = Math.max(line8FederalAdjustedGrossIncome + line9Additions - line10Subtractions, 0);
  const schedule3Additions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule3_additions_total) ??
          line9Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line9Additions;
  const schedule3Subtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule3_subtractions_total) ??
          line10Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line10Subtractions;
  const schedule3GeorgiaIncome = Math.max(
    georgiaSourceAdjustedGrossIncome + schedule3Additions - schedule3Subtractions,
    0,
  );
  const schedule3Ratio =
    isAllocatedReturn && line11GeorgiaAdjustedGrossIncome > 0 && schedule3GeorgiaIncome > 0
      ? roundGeorgiaSchedule3Ratio(schedule3GeorgiaIncome / line11GeorgiaAdjustedGrossIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const deductionResult = calculateGeorgiaDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs:
      fullYearFederalSummary === args.federalSummary
        ? args
        : {
            ...args,
            federalSummary: fullYearFederalSummary,
          },
  });
  const line12Deduction = deductionResult.deduction;
  const line13DependentExemption = toWholeDollars(
    asNumber(formRecord?.dependent_exemption_amount) ??
      countDependentExemptions(args.input) * GEORGIA_DEPENDENT_EXEMPTION,
  );
  const schedule3ProratedDeductionsAndExemptions =
    schedule3Ratio == null
      ? line12Deduction + line13DependentExemption
      : toWholeDollars((line12Deduction + line13DependentExemption) * schedule3Ratio);
  const line14TaxableIncome = Math.max(
    (schedule3Ratio == null ? line11GeorgiaAdjustedGrossIncome : schedule3GeorgiaIncome) -
      schedule3ProratedDeductionsAndExemptions,
    0,
  );
  const regularTax = toWholeDollars(line14TaxableIncome * GEORGIA_FLAT_TAX_RATE);
  const lowIncomeCredit = calculateGeorgiaLowIncomeCredit({
    federalAdjustedGrossIncome: line8FederalAdjustedGrossIncome,
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line15Tax = Math.max(regularTax - lowIncomeCredit, 0);
  const line16OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line17OtherStateCredit = calculateGeorgiaOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
    totalTaxBeforeCredits: line15Tax + line16OtherTaxes,
  });
  const line17NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + line17OtherStateCredit,
  );
  const line19TotalTax = Math.max(line15Tax + line16OtherTaxes - line17NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: GEORGIA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line19TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? schedule3GeorgiaIncome : line8FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line14TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line19TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: schedule3GeorgiaIncome,
        allocation_ratio: schedule3Ratio ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Georgia whole-dollar rules",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia Form 500 federal adjusted gross income starting point",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ga.starting_point",
      nodeType: "bridge",
      value: line8FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.ga500.additions",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia additions",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line9",
      nodeType: "calculation",
      value: line9Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin retirement exclusion",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia subtractions",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line10",
      nodeType: "calculation",
      value: line10Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 + line9 - line10, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia adjusted gross income",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line11",
      nodeType: "calculation",
      value: line11GeorgiaAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Georgia standard or itemized deduction common path",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia deduction",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line12",
      nodeType: "calculation",
      value: line12Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Georgia dependent exemption amount",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia dependent exemption",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line13",
      nodeType: "calculation",
      value: line13DependentExemption,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line11 - line12 - line13, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia taxable income",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line14",
      nodeType: "calculation",
      value: line14TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max((line14 * 0.0519) - low_income_credit, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia tax before other credits",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line15",
      nodeType: "calculation",
      value: line15Tax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Georgia Schedule 3 line 8, Column A",
            jurisdiction: GEORGIA_STATE_CODE,
            label: "Georgia Schedule 3 total Georgia adjusted gross income",
            lineCode: "schedule3.line8a",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ga.schedule3.line8a",
            nodeType: "calculation",
            value: line11GeorgiaAdjustedGrossIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Georgia Schedule 3 line 8, Column C",
            jurisdiction: GEORGIA_STATE_CODE,
            label: "Georgia Schedule 3 Georgia income",
            lineCode: "schedule3.line8c",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ga.schedule3.line8c",
            nodeType: "calculation",
            value: schedule3GeorgiaIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Georgia Schedule 3 line 9 ratio",
            jurisdiction: GEORGIA_STATE_CODE,
            label: "Georgia Schedule 3 ratio",
            lineCode: "schedule3.line9",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ga.schedule3.line9",
            nodeType: "calculation",
            value: schedule3Ratio?.toFixed(4) ?? "0.0000",
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Georgia Schedule 3 line 13",
            jurisdiction: GEORGIA_STATE_CODE,
            label: "Georgia Schedule 3 prorated deductions and exemptions",
            lineCode: "schedule3.line13",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ga.schedule3.line13",
            nodeType: "calculation",
            value: schedule3ProratedDeductionsAndExemptions,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line15 + line16 - line17, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia total tax",
      lineCode: "line19",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line19",
      nodeType: "summary",
      value: line19TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia total payments",
      lineCode: "line31",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.form500.line31",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form500.line14",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.summary.taxable_income",
      nodeType: "summary",
      value: line14TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form500.line19",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.summary.total_tax",
      nodeType: "summary",
      value: line19TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form500.line31",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line31 - line19, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line19 - line31, 0)",
      jurisdiction: GEORGIA_STATE_CODE,
      label: "Georgia amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ga.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ga.starting_point", "carryforward"),
    createStateEdge("bridge.ga.starting_point", "ga.form500.line11"),
    createStateEdge("ga.form500.line9", "ga.form500.line11"),
    createStateEdge("ga.form500.line10", "ga.form500.line11"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ga.schedule3.line8a", "ga.schedule3.line9"),
          createStateEdge("ga.schedule3.line8c", "ga.schedule3.line9"),
          createStateEdge("ga.schedule3.line9", "ga.schedule3.line13"),
          createStateEdge("ga.schedule3.line13", "ga.form500.line14"),
        ]
      : []),
    createStateEdge("ga.form500.line11", "ga.form500.line14"),
    createStateEdge("ga.form500.line12", "ga.form500.line14"),
    createStateEdge("ga.form500.line13", "ga.form500.line14"),
    createStateEdge("ga.form500.line14", "ga.form500.line15"),
    createStateEdge("ga.form500.line15", "ga.form500.line19"),
    createStateEdge("ga.form500.line19", "ga.summary.total_tax"),
    createStateEdge("ga.form500.line31", "ga.summary.total_payments"),
  ];

  const validationResults = [];

  if (
    fullYearFederalSummary?.deduction_strategy === "itemized" &&
    asNumber(formRecord?.itemized_deductions_total) == null &&
    !deductionResult.derivedFromFederalFacts
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia itemized deductions used the federal itemized base because no Georgia-specific itemized total was supplied.",
        nodeIds: ["ga.form500.line12"],
        ruleId: "GA.itemized_deduction_federal_base_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    filingStatus === "married_filing_separately" &&
    asBoolean(formRecord?.spouse_itemized_federal) === true &&
    asNumber(formRecord?.itemized_deductions_total) == null &&
    line12Deduction === 0
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia married-filing-separately itemized deductions were unavailable even though the spouse itemized federally, so this path kept Georgia itemized deductions at zero.",
        nodeIds: ["ga.form500.line12"],
        ruleId: "GA.mfs_itemized_deduction_zero_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia Schedule 3 applied the Georgia-income ratio to deductions and exemptions so part-year and nonresident taxable income follows the official proration path.",
        nodeIds: ["ga.schedule3.line9", "ga.schedule3.line13", "ga.form500.line14"],
        ruleId: "GA.schedule3_ratio_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line9Additions !== 0 || line10Subtractions !== 0) &&
    (asNumber(formRecord?.schedule3_additions_total) == null ||
      asNumber(formRecord?.schedule3_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia Schedule 3 Georgia-income additions or subtractions were not supplied explicitly, so the engine allocated those modifications using the state allocation profile ratio.",
        nodeIds: ["ga.schedule3.line8c"],
        ruleId: "GA.schedule3_modifications_allocated_by_ratio",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    retirementIncomeExclusion > 0 &&
    asNumber(formRecord?.retirement_income_exclusion_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia retirement-income exclusion was computed from TY2025 age-qualified retirement distributions using the statutory per-taxpayer exclusion caps.",
        nodeIds: ["ga.form500.line10"],
        ruleId: "GA.retirement_income_exclusion_computed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (!isAllocatedReturn && line8FederalAdjustedGrossIncome < 20_000 && asNumber(formRecord?.low_income_credit_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia low-income credit was computed from the official worksheet using federal adjusted gross income, personal exemptions, dependent exemptions, and age-65 counts.",
        nodeIds: ["ga.form500.line15"],
        ruleId: "GA.low_income_credit_computed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    line17OtherStateCredit === 0 &&
    asNumber(formRecord?.tax_paid_to_other_state_credit) == null &&
    asNumber(formRecord?.other_state_credit_amount) == null &&
    hasPotentialGeorgiaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Georgia credit for tax paid to another state stayed at zero because no Georgia credit claim amount was supplied for the available multistate facts.",
        nodeIds: ["ga.form500.line19"],
        ruleId: "GA.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
