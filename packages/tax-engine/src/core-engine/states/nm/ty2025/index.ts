import { asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  calculateResidentStatePayments,
  countDependentExemptions,
  countPersonalExemptions,
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

const NEW_MEXICO_STATE_CODE = "NM";
const NEW_MEXICO_STATE_NAME = "New Mexico";
const NEW_MEXICO_FORM_RECORD_KEY = "pit1";

type NewMexicoFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundToFourDecimalPlaces(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateNewMexicoStateLocalTaxAddback(args: {
  readonly filingStatus: NewMexicoFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly federalDeductionAmount: number;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.state_local_tax_addback_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (
    args.federalSummary?.deduction_strategy !== "itemized" ||
    args.federalDeductionAmount <= 0
  ) {
    return 0;
  }

  const line1StateAndLocalIncomeTaxes = toWholeDollars(
    args.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0,
  );
  const line2TotalStateAndLocalTaxes = toWholeDollars(
    line1StateAndLocalIncomeTaxes +
      (args.input.facts.itemized_deductions.real_estate_taxes ?? 0) +
      (args.input.facts.itemized_deductions.personal_property_taxes ?? 0),
  );

  if (line1StateAndLocalIncomeTaxes <= 0 || line2TotalStateAndLocalTaxes <= 0) {
    return 0;
  }

  const federalSaltCap =
    args.filingStatus === "married_filing_separately" ? 5_000 : 10_000;
  const line4ScheduleAStateAndLocalTaxesDeducted = toWholeDollars(
    asNumber(args.formRecord?.schedule_a_line5e_amount) ??
      Math.min(line2TotalStateAndLocalTaxes, federalSaltCap),
  );

  if (line4ScheduleAStateAndLocalTaxesDeducted <= 0) {
    return 0;
  }

  const line3Proportion = roundToFourDecimalPlaces(
    line1StateAndLocalIncomeTaxes / line2TotalStateAndLocalTaxes,
  );
  const line5StateIncomeTaxPortion = toWholeDollars(
    line4ScheduleAStateAndLocalTaxesDeducted * line3Proportion,
  );
  const line6LimitedStateIncomeTaxDeduction = Math.min(
    line4ScheduleAStateAndLocalTaxesDeducted,
    line5StateIncomeTaxPortion,
  );
  const line7FederalStandardDeduction = toWholeDollars(
    asNumber(args.formRecord?.federal_standard_deduction_amount) ??
      args.federalSummary?.standard_deduction ??
      0,
  );
  const line9ExcessItemizedDeduction = Math.max(
    args.federalDeductionAmount - line7FederalStandardDeduction,
    0,
  );

  return toWholeDollars(
    Math.min(line6LimitedStateIncomeTaxDeduction, line9ExcessItemizedDeduction),
  );
}

function calculateNewMexicoCertainDependentDeduction(args: {
  readonly filingStatus: NewMexicoFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.certain_dependents_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (
    args.filingStatus !== "head_of_household" &&
    args.filingStatus !== "married_filing_jointly"
  ) {
    return 0;
  }

  if (args.input.household.can_be_claimed_as_dependent === true) {
    return 0;
  }

  return Math.max(countDependentExemptions(args.input) - 1, 0) * 4_000;
}

function calculateNewMexicoLowAndMiddleIncomeExemption(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly filingStatus: NewMexicoFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.low_middle_income_exemption_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const threshold =
    args.filingStatus === "single"
      ? 36_667
      : args.filingStatus === "married_filing_separately"
        ? 27_500
        : 55_000;

  if (args.federalAdjustedGrossIncome > threshold) {
    return 0;
  }

  const baseAmount =
    args.filingStatus === "single"
      ? 20_000
      : args.filingStatus === "married_filing_separately"
        ? 15_000
        : 30_000;
  const reductionRate =
    args.filingStatus === "single"
      ? 0.15
      : args.filingStatus === "married_filing_separately"
        ? 0.2
        : 0.1;
  const reduction = Math.max(args.federalAdjustedGrossIncome - baseAmount, 0) * reductionRate;
  const perExemptionAmount = Math.max(2_500 - reduction, 0);
  const exemptionCount =
    countPersonalExemptions(args.input, args.filingStatus) + countDependentExemptions(args.input);

  return toWholeDollars(perExemptionAmount * exemptionCount);
}

function calculateNewMexicoTax(
  taxableIncome: number,
  filingStatus: NewMexicoFilingStatus,
): number {
  if (filingStatus === "married_filing_jointly" || filingStatus === "head_of_household") {
    if (taxableIncome <= 8_000) {
      return toWholeDollars(taxableIncome * 0.017);
    }

    if (taxableIncome <= 16_000) {
      return toWholeDollars(136 + (taxableIncome - 8_000) * 0.032);
    }

    if (taxableIncome <= 24_000) {
      return toWholeDollars(392 + (taxableIncome - 16_000) * 0.047);
    }

    if (taxableIncome <= 315_000) {
      return toWholeDollars(768 + (taxableIncome - 24_000) * 0.049);
    }

    return toWholeDollars(15_027 + (taxableIncome - 315_000) * 0.059);
  }

  if (filingStatus === "married_filing_separately") {
    if (taxableIncome <= 4_000) {
      return toWholeDollars(taxableIncome * 0.017);
    }

    if (taxableIncome <= 8_000) {
      return toWholeDollars(68 + (taxableIncome - 4_000) * 0.032);
    }

    if (taxableIncome <= 12_000) {
      return toWholeDollars(196 + (taxableIncome - 8_000) * 0.047);
    }

    if (taxableIncome <= 157_500) {
      return toWholeDollars(384 + (taxableIncome - 12_000) * 0.049);
    }

    return toWholeDollars(7_513.5 + (taxableIncome - 157_500) * 0.059);
  }

  if (taxableIncome <= 5_500) {
    return toWholeDollars(taxableIncome * 0.017);
  }

  if (taxableIncome <= 11_000) {
    return toWholeDollars(93.5 + (taxableIncome - 5_500) * 0.032);
  }

  if (taxableIncome <= 16_000) {
    return toWholeDollars(269.5 + (taxableIncome - 11_000) * 0.047);
  }

  if (taxableIncome <= 210_000) {
    return toWholeDollars(504.5 + (taxableIncome - 16_000) * 0.049);
  }

  return toWholeDollars(10_010.5 + (taxableIncome - 210_000) * 0.059);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: NEW_MEXICO_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NEW_MEXICO_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line9FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line12FederalDeductionAmount = toWholeDollars(
    asNumber(formRecord?.federal_deduction_amount) ??
      (args.federalSummary?.deduction_strategy === "itemized"
        ? args.federalSummary.itemized_deduction_total
        : args.federalSummary?.standard_deduction ?? 0),
  );
  const line10StateLocalTaxAddback = calculateNewMexicoStateLocalTaxAddback({
    federalDeductionAmount: line12FederalDeductionAmount,
    federalSummary: args.federalSummary,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line11Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line13CertainDependentDeduction = calculateNewMexicoCertainDependentDeduction({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line14LowAndMiddleIncomeExemption = calculateNewMexicoLowAndMiddleIncomeExemption({
    federalAdjustedGrossIncome: line9FederalAdjustedGrossIncome,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line15TotalDeductionsAndExemptions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line17TaxableIncome = Math.max(
    line9FederalAdjustedGrossIncome +
      line10StateLocalTaxAddback +
      line11Additions -
      line12FederalDeductionAmount -
      line13CertainDependentDeduction -
      line14LowAndMiddleIncomeExemption -
      line15TotalDeductionsAndExemptions,
    0,
  );
  const line18Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateNewMexicoTax(line17TaxableIncome, filingStatus),
  );
  const line20OtherStateCredit = toWholeDollars(asNumber(formRecord?.other_state_credit_amount) ?? 0);
  const line21BusinessCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.business_credits),
  );
  const line22NetIncomeTax = Math.max(line18Tax - line20OtherStateCredit - line21BusinessCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: NEW_MEXICO_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line22NetIncomeTax - payments.totalPayments, 0),
    startingPoint: line9FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line17TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line22NetIncomeTax,
  });

  const validationResults: StateArtifactsResult["validationResults"] = [];

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.nm.starting_point", "carryforward"),
      createStateEdge("bridge.nm.starting_point", "nm.pit1.line17"),
      createStateEdge("nm.pit1.line17", "nm.pit1.line18"),
      createStateEdge("nm.pit1.line18", "nm.pit1.line22"),
      createStateEdge("nm.pit1.line22", "nm.summary.total_tax"),
      createStateEdge("nm.pit1.line32", "nm.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Federal adjusted gross income from 1040.line11",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "Federal adjusted gross income for New Mexico",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.nm.starting_point",
        nodeType: "bridge",
        value: line9FederalAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico PIT-1 line 10 worksheet using Schedule A lines 5a, 5d, 5e, and the federal standard-deduction comparison",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico state and local tax addback",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line10",
        nodeType: "calculation",
        value: line10StateLocalTaxAddback,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico additions from PIT-ADJ common path",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico additions",
        lineCode: "line11",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line11",
        nodeType: "calculation",
        value: line11Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Federal standard or itemized deduction amount",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico federal deduction amount",
        lineCode: "line12",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line12",
        nodeType: "calculation",
        value: line12FederalDeductionAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico deduction for certain dependents",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico deduction for certain dependents",
        lineCode: "line13",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line13",
        nodeType: "calculation",
        value: line13CertainDependentDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico low- and middle-income tax exemption worksheet",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico low- and middle-income tax exemption",
        lineCode: "line14",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line14",
        nodeType: "calculation",
        value: line14LowAndMiddleIncomeExemption,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico deductions and exemptions from PIT-ADJ common path",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico deductions and exemptions from federal income",
        lineCode: "line15",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line15",
        nodeType: "calculation",
        value: line15TotalDeductionsAndExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line9 + line10 + line11 - line12 - line13 - line14 - line15, 0)",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico taxable income",
        lineCode: "line17",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line17",
        nodeType: "calculation",
        value: line17TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico 2025 tax rate schedules or override",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico tax",
        lineCode: "line18",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line18",
        nodeType: "calculation",
        value: line18Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico credit for taxes paid to another state common path",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico credit for taxes paid to another state",
        lineCode: "line20",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line20",
        nodeType: "calculation",
        value: line20OtherStateCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "New Mexico business-related income tax credits and other nonrefundable credits",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico business-related income tax credits",
        lineCode: "line21",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line21",
        nodeType: "calculation",
        value: line21BusinessCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line18 - line20 - line21, 0)",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "Net New Mexico income tax",
        lineCode: "line22",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line22",
        nodeType: "summary",
        value: line22NetIncomeTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico total payments and credits",
        lineCode: "line32",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.pit1.line32",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pit1.line17",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.summary.taxable_income",
        nodeType: "summary",
        value: line17TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pit1.line22",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.summary.total_tax",
        nodeType: "summary",
        value: line22NetIncomeTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pit1.line32",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.refund_amount",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico summary refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.amount_owed",
        jurisdiction: NEW_MEXICO_STATE_CODE,
        label: "New Mexico summary amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "nm.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
