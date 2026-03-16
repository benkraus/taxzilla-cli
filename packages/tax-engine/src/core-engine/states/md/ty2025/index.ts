import { asBoolean, asNumber, sumNumbers } from "../../../helpers";
import { calculateScheduleCBusinessNetProfit } from "../../../foundations";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
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
import { calculateMarylandAllocatedReturn } from "./allocated";
import { calculateMarylandLocalTax } from "./local-tax";

const MARYLAND_STATE_CODE = "MD";
const MARYLAND_STATE_NAME = "Maryland";
const MARYLAND_FORM_RECORD_KEY = "md502";
const MARYLAND_STANDARD_DEDUCTION = {
  higher: 6_700,
  lower: 3_350,
} as const;
const MARYLAND_ITEMIZED_DEDUCTION_ADD_BACK_CAP = {
  higher: 40_000,
  lower: 20_000,
} as const;
const MARYLAND_ITEMIZED_DEDUCTION_PHASEOUT_THRESHOLD = {
  higher: 200_000,
  lower: 100_000,
} as const;
const MARYLAND_PERSONAL_EXEMPTION_AMOUNT = 3_200;
const MARYLAND_AGE_OR_BLIND_EXEMPTION_AMOUNT = 1_000;

type MarylandFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateMarylandTax(
  taxableIncome: number,
  filingStatus: MarylandFilingStatus,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  const jointLike =
    filingStatus === "married_filing_jointly" ||
    filingStatus === "head_of_household" ||
    filingStatus === "qualifying_surviving_spouse";

  if (taxableIncome <= 1_000) {
    return toWholeDollars(taxableIncome * 0.02);
  }

  if (taxableIncome <= 2_000) {
    return toWholeDollars(20 + (taxableIncome - 1_000) * 0.03);
  }

  if (taxableIncome <= 3_000) {
    return toWholeDollars(50 + (taxableIncome - 2_000) * 0.04);
  }

  if (jointLike) {
    if (taxableIncome <= 150_000) {
      return toWholeDollars(90 + (taxableIncome - 3_000) * 0.0475);
    }

    if (taxableIncome <= 175_000) {
      return toWholeDollars(7_072.5 + (taxableIncome - 150_000) * 0.05);
    }

    if (taxableIncome <= 225_000) {
      return toWholeDollars(8_322.5 + (taxableIncome - 175_000) * 0.0525);
    }

    if (taxableIncome <= 300_000) {
      return toWholeDollars(10_947.5 + (taxableIncome - 225_000) * 0.055);
    }

    if (taxableIncome <= 600_000) {
      return toWholeDollars(15_072.5 + (taxableIncome - 300_000) * 0.0575);
    }

    if (taxableIncome <= 1_200_000) {
      return toWholeDollars(32_322.5 + (taxableIncome - 600_000) * 0.0625);
    }

    return toWholeDollars(69_822.5 + (taxableIncome - 1_200_000) * 0.065);
  }

  if (taxableIncome <= 100_000) {
    return toWholeDollars(90 + (taxableIncome - 3_000) * 0.0475);
  }

  if (taxableIncome <= 125_000) {
    return toWholeDollars(4_697.5 + (taxableIncome - 100_000) * 0.05);
  }

  if (taxableIncome <= 150_000) {
    return toWholeDollars(5_947.5 + (taxableIncome - 125_000) * 0.0525);
  }

  if (taxableIncome <= 250_000) {
    return toWholeDollars(7_260 + (taxableIncome - 150_000) * 0.055);
  }

  if (taxableIncome <= 500_000) {
    return toWholeDollars(12_760 + (taxableIncome - 250_000) * 0.0575);
  }

  if (taxableIncome <= 1_000_000) {
    return toWholeDollars(27_135 + (taxableIncome - 500_000) * 0.0625);
  }

  return toWholeDollars(58_385 + (taxableIncome - 1_000_000) * 0.065);
}

function getMarylandRegularExemptionValue(
  adjustedGrossIncome: number,
  filingStatus: MarylandFilingStatus,
  dependentTaxpayer: boolean,
): number {
  if (dependentTaxpayer) {
    return 0;
  }

  if (filingStatus === "married_filing_jointly" || filingStatus === "head_of_household" || filingStatus === "qualifying_surviving_spouse") {
    if (adjustedGrossIncome <= 150_000) {
      return MARYLAND_PERSONAL_EXEMPTION_AMOUNT;
    }

    if (adjustedGrossIncome <= 175_000) {
      return 1_600;
    }

    if (adjustedGrossIncome <= 200_000) {
      return 800;
    }

    return 0;
  }

  if (adjustedGrossIncome <= 100_000) {
    return MARYLAND_PERSONAL_EXEMPTION_AMOUNT;
  }

  if (adjustedGrossIncome <= 125_000) {
    return 1_600;
  }

  if (adjustedGrossIncome <= 150_000) {
    return 800;
  }

  return 0;
}

function calculateMarylandTwoIncomeSubtraction(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly line6Additions: number;
  readonly line13SubtractionsBeforeTwoIncome: number;
  readonly stateReturn: StateArtifactsArgs["stateReturn"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.two_income_subtraction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (!args.input.household.spouse) {
    return 0;
  }

  const taxpayerIncome = sumNumbers(
    args.input.facts.income.wages
      .filter((wage) => wage.person_id !== "spouse")
      .map((wage) => wage.wages_tips_other_compensation),
  );
  const spouseIncome = sumNumbers(
    args.input.facts.income.wages
      .filter((wage) => wage.person_id === "spouse")
      .map((wage) => wage.wages_tips_other_compensation),
  );
  const taxpayerBusinessIncome = sumNumbers(
    args.input.facts.income.schedule_c_businesses
      .filter((business) => business.owner_person_id !== "spouse")
      .map((business) => calculateScheduleCBusinessNetProfit(business)),
  );
  const spouseBusinessIncome = sumNumbers(
    args.input.facts.income.schedule_c_businesses
      .filter((business) => business.owner_person_id === "spouse")
      .map((business) => calculateScheduleCBusinessNetProfit(business)),
  );
  const additionsSplit = args.line6Additions / 2;
  const subtractionsSplit = args.line13SubtractionsBeforeTwoIncome / 2;

  return toWholeDollars(
    Math.min(
      Math.max(taxpayerIncome + taxpayerBusinessIncome + additionsSplit - subtractionsSplit, 0),
      Math.max(spouseIncome + spouseBusinessIncome + additionsSplit - subtractionsSplit, 0),
      1_200,
    ),
  );
}

function calculateMarylandNetCapitalGainProxy(args: StateArtifactsArgs): number {
  const transactionNetCapitalGain = sumNumbers(
    args.input.facts.income.capital_transactions.map((transaction) =>
      asNumber(transaction.gain_or_loss) ??
      transaction.proceeds -
        (asNumber(transaction.cost_basis) ?? 0) -
        (asNumber(transaction.adjustments) ?? 0),
    ),
  );
  const capitalGainDistributions = sumNumbers(
    args.input.facts.income.dividends.map(
      (dividend) => asNumber(dividend.capital_gain_distributions) ?? 0,
    ),
  );

  return toWholeDollars(Math.max(transactionNetCapitalGain + capitalGainDistributions, 0));
}

function calculateMarylandItemizedDeduction(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly federalItemizedDeductionTotal: number;
  readonly filingStatus: MarylandFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): {
  readonly line17aFederalItemizedDeductions: number;
  readonly line17bStateIncomeTaxAddback: number;
  readonly line17cPhaseoutAmount: number;
  readonly line17Deduction: number;
} {
  const explicitDeduction = asNumber(args.formRecord?.itemized_deduction_amount);

  if (explicitDeduction != null) {
    return {
      line17aFederalItemizedDeductions: toWholeDollars(args.federalItemizedDeductionTotal),
      line17bStateIncomeTaxAddback: toWholeDollars(
        asNumber(args.formRecord?.itemized_deduction_state_income_tax_addback_amount) ?? 0,
      ),
      line17cPhaseoutAmount: toWholeDollars(
        asNumber(args.formRecord?.itemized_deduction_phaseout_amount) ?? 0,
      ),
      line17Deduction: toWholeDollars(explicitDeduction),
    };
  }

  const line17aFederalItemizedDeductions = toWholeDollars(args.federalItemizedDeductionTotal);
  const deductionBand =
    args.filingStatus === "married_filing_jointly" ||
    args.filingStatus === "head_of_household" ||
    args.filingStatus === "qualifying_surviving_spouse"
      ? "higher"
      : "lower";
  const addbackCap = MARYLAND_ITEMIZED_DEDUCTION_ADD_BACK_CAP[deductionBand];
  const phaseoutThreshold = MARYLAND_ITEMIZED_DEDUCTION_PHASEOUT_THRESHOLD[deductionBand];
  const nonIncomeTaxesClaimed = toWholeDollars(
    (args.input.facts.itemized_deductions.real_estate_taxes ?? 0) +
      (args.input.facts.itemized_deductions.personal_property_taxes ?? 0) +
      (args.input.facts.itemized_deductions.other_taxes ?? 0),
  );
  const stateIncomeOrSalesTaxesClaimed = toWholeDollars(
    args.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0,
  );
  const line17bStateIncomeTaxAddback = Math.max(
    Math.min(stateIncomeOrSalesTaxesClaimed, addbackCap - Math.min(nonIncomeTaxesClaimed, addbackCap)),
    0,
  );
  const line17cPhaseoutAmount = Math.max(
    toWholeDollars((args.federalAdjustedGrossIncome - phaseoutThreshold) * 0.075),
    0,
  );
  const line17Deduction = Math.max(
    line17aFederalItemizedDeductions - line17bStateIncomeTaxAddback - line17cPhaseoutAmount,
    0,
  );

  return {
    line17aFederalItemizedDeductions,
    line17bStateIncomeTaxAddback,
    line17cPhaseoutAmount,
    line17Deduction,
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MARYLAND_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MARYLAND_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const jointLike =
    filingStatus === "married_filing_jointly" ||
    filingStatus === "head_of_household" ||
    filingStatus === "qualifying_surviving_spouse";
  const line1FederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const line6Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line13SubtractionsBeforeTwoIncome = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line14TwoIncomeSubtraction =
    filingStatus === "married_filing_jointly"
      ? calculateMarylandTwoIncomeSubtraction({
          formRecord,
          input: args.input,
          line6Additions,
          line13SubtractionsBeforeTwoIncome,
          stateReturn: args.stateReturn,
        })
      : 0;
  const line15TotalSubtractions = line13SubtractionsBeforeTwoIncome + line14TwoIncomeSubtraction;
  const line16MarylandAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line6Additions - line15TotalSubtractions,
    0,
  );
  const standardDeduction = jointLike
    ? MARYLAND_STANDARD_DEDUCTION.higher
    : MARYLAND_STANDARD_DEDUCTION.lower;
  const itemizedDeductionResult = calculateMarylandItemizedDeduction({
    federalAdjustedGrossIncome: line1FederalAdjustedGrossIncome,
    federalItemizedDeductionTotal:
      fullYearFederalSummary?.deduction_strategy === "itemized"
        ? fullYearFederalSummary.itemized_deduction_total
        : 0,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const useItemizedDeduction =
    asBoolean(formRecord?.use_itemized_deductions) === true ||
    (asBoolean(formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionResult.line17Deduction > standardDeduction);
  const line17Deduction = useItemizedDeduction
    ? itemizedDeductionResult.line17Deduction
    : standardDeduction;
  const regularExemptionValue = getMarylandRegularExemptionValue(
    line16MarylandAdjustedGrossIncome,
    filingStatus,
    args.input.household.can_be_claimed_as_dependent ?? false,
  );
  const line19Exemptions = toWholeDollars(
    asNumber(formRecord?.exemption_amount) ??
      (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
        regularExemptionValue +
        (countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input)) *
          MARYLAND_AGE_OR_BLIND_EXEMPTION_AMOUNT,
  );
  const line20TaxableNetIncome = Math.max(
    line16MarylandAdjustedGrossIncome - line17Deduction - line19Exemptions,
    0,
  );
  const line21MarylandTax = toWholeDollars(
    asNumber(formRecord?.state_tax_amount) ?? calculateMarylandTax(line20TaxableNetIncome, filingStatus),
  );
  const line20aNetCapitalGainIncomeSubjectToAdditionalTax = toWholeDollars(
    asNumber(formRecord?.net_capital_gain_income_subject_to_additional_tax_amount) ??
      (line1FederalAdjustedGrossIncome > 350_000 ? calculateMarylandNetCapitalGainProxy(args) : 0),
  );
  const line21bCapitalGainAdditionalTax = toWholeDollars(
    line20aNetCapitalGainIncomeSubjectToAdditionalTax * 0.02,
  );
  const line24NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line27MarylandTaxAfterCredits = Math.max(
    line21MarylandTax + line21bCapitalGainAdditionalTax - line24NonrefundableCredits,
    0,
  );
  const localTaxResult = calculateMarylandLocalTax({
    filingStatus,
    input: args.input,
    formRecord,
    stateReturn: args.stateReturn,
    taxableIncome: line20TaxableNetIncome,
  });
  const allocatedComputation =
    args.stateReturn.return_kind === "resident"
      ? null
      : calculateMarylandAllocatedReturn({
          calculateStateTax: calculateMarylandTax,
          filingStatus,
          formRecord,
          fullYearAdjustedGrossIncome: line1FederalAdjustedGrossIncome,
          fullYearDeduction: line17Deduction,
          fullYearExemptions: line19Exemptions,
          fullYearStateTax: line21MarylandTax,
          fullYearTaxableNetIncome: line20TaxableNetIncome,
          input: args.input,
          line21bCapitalGainAdditionalTax,
          line24NonrefundableCredits,
          stateReturn: args.stateReturn,
        });
  const effectiveLocalTaxResult =
    allocatedComputation == null ? localTaxResult : allocatedComputation.residentLocalTaxResult;
  const line28LocalTax = allocatedComputation?.totalLocalTax ?? localTaxResult.amount;
  const totalMarylandTax = allocatedComputation?.totalTax ?? (line27MarylandTaxAfterCredits + line28LocalTax);
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits)),
    stateCode: MARYLAND_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(totalMarylandTax - payments.totalPayments, 0),
    startingPoint:
      allocatedComputation?.combinedMarylandAdjustedGrossIncome ?? line16MarylandAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: allocatedComputation?.combinedTaxableNetIncome ?? line20TaxableNetIncome,
    totalPayments: payments.totalPayments,
    totalTax: totalMarylandTax,
  });

  const validationResults = [];

  if (effectiveLocalTaxResult?.usedDefaultMinimumRate) {
    validationResults.push(
      buildValidationResult({
        message:
          "Maryland local income tax used the statewide 2.25% minimum rate because no county-specific rate could be resolved from plugin_fact_bag.md502, local return references, or Maryland local-jurisdiction facts. Supply a county or Baltimore City jurisdiction when a more specific TY2025 rate should replace the minimum-rate fallback.",
        nodeIds: ["md.form502.line28"],
        ruleId: "MD.local_tax_rate_minimum_assumed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (allocatedComputation != null) {
    validationResults.push(
      buildValidationResult({
        message:
          args.stateReturn.return_kind === "part_year_resident"
            ? "Maryland part-year resident tax used the official proration flow: Maryland-source adjusted gross income, prorated deductions and exemptions, resident local tax on the resident-period base, and separate nonresident tax when Maryland-source income remained during the nonresident period."
            : "Maryland nonresident tax used the Form 505/505NR factor flow so state tax is allocated from the full-year Maryland tax base instead of taxing apportioned income as a resident return.",
        nodeIds: ["md.form502.line16", "md.form502.line20", "md.form502.line21", "md.form502.line28"],
        ruleId:
          args.stateReturn.return_kind === "part_year_resident"
            ? "MD.part_year_proration_applied"
            : "MD.nonresident_factor_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (effectiveLocalTaxResult?.collapsedJurisdictions) {
    validationResults.push(
      buildValidationResult({
        message:
          "Maryland local income tax resolved multiple county or Baltimore City inputs down to the last matching jurisdiction in the available TY2025 residency facts before applying local tax. Supply an explicit local tax rate override when a separate-jurisdiction worksheet result should replace that collapsed path.",
        nodeIds: ["md.form502.line28"],
        ruleId: "MD.multiple_local_jurisdictions_collapsed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.md.starting_point", "carryforward"),
      createStateEdge("bridge.md.starting_point", "md.form502.line17a"),
      createStateEdge("md.form502.line17a", "md.form502.line17"),
      createStateEdge("md.form502.line17b", "md.form502.line17"),
      createStateEdge("md.form502.line17c", "md.form502.line17"),
      createStateEdge("bridge.md.starting_point", "md.form502.line20"),
      createStateEdge("md.form502.line20", "md.form502.line21"),
      createStateEdge("md.form502.line21", "md.form502.line27"),
      createStateEdge("md.form502.line27", "md.summary.total_tax"),
      createStateEdge("md.form502.line41", "md.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland adjusted gross income",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland adjusted gross income",
        lineCode: "line16",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.md.starting_point",
        nodeType: "bridge",
        value: line16MarylandAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland additions",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland additions",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line6",
        nodeType: "calculation",
        value: line6Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland total subtractions including two-income subtraction",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland total subtractions",
        lineCode: "line15",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line15",
        nodeType: "calculation",
        value: line15TotalSubtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Federal Schedule A total itemized deductions",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland federal itemized deductions",
        lineCode: "line17a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line17a",
        nodeType: "calculation",
        value: itemizedDeductionResult.line17aFederalItemizedDeductions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland line 17b state and local income tax addback capped by other taxes inside the federal SALT limitation",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland itemized deduction addback",
        lineCode: "line17b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line17b",
        nodeType: "calculation",
        value: itemizedDeductionResult.line17bStateIncomeTaxAddback,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "7.5% of federal adjusted gross income above the Maryland line 17c threshold",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland itemized deduction phaseout",
        lineCode: "line17c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line17c",
        nodeType: "calculation",
        value: itemizedDeductionResult.line17cPhaseoutAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland standard deduction or Maryland itemized deduction after line 17b and 17c adjustments",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland deduction",
        lineCode: "line17",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line17",
        nodeType: "calculation",
        value: line17Deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland exemption chart and age/blind exemptions",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland exemptions",
        lineCode: "line19",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line19",
        nodeType: "calculation",
        value: line19Exemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line16 - line17 - line19, 0)",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland taxable net income",
        lineCode: "line20",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line20",
        nodeType: "calculation",
        value: line20TaxableNetIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland state tax schedule",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland state tax",
        lineCode: "line21",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line21",
        nodeType: "calculation",
        value: line21MarylandTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland Form 502CG net capital gain income from explicit input or federal capital-gain proxy when federal adjusted gross income exceeds $350,000",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Net capital gain income subject to additional tax",
        lineCode: "line20a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line20a",
        nodeType: "calculation",
        value: line20aNetCapitalGainIncomeSubjectToAdditionalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "2% of line20a",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland capital gain additional tax",
        lineCode: "line21b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line21b",
        nodeType: "calculation",
        value: line21bCapitalGainAdditionalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland credits and county tax",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland local tax",
        lineCode: "line28",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line28",
        nodeType: "calculation",
        value: line28LocalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maryland withholding and estimated payments",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland total payments",
        lineCode: "line41",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.form502.line41",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 502 summary total tax",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 502 summary total payments",
        jurisdiction: MARYLAND_STATE_CODE,
        label: "Maryland total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "md.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
