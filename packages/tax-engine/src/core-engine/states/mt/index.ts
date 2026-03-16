import { asNumber } from "../../helpers";
import {
  sumCapitalGainDistributions,
  sumCapitalGainOrLossByTerm,
  sumScheduleCBusinessNetProfit,
} from "../../income";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getFederalDeductionBase,
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

const MONTANA_STATE_CODE = "MT";
const MONTANA_STATE_NAME = "Montana";
const MONTANA_FORM_RECORD_KEY = "form2";
const MONTANA_SENIOR_SUBTRACTION_AMOUNT = 5_660;

type MontanaFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateMontanaFederalTaxableIncome(args: {
  readonly adjustedGrossIncome: number;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly filingStatus: MontanaFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
}): {
  readonly amount: number;
  readonly estimatedFromAdjustedGrossIncome: boolean;
} {
  const explicitAmount =
    asNumber(args.formRecord?.federal_taxable_income_amount) ??
    asNumber(args.formRecord?.federal_form_1040_line15_amount) ??
    args.federalSummary?.line15_taxable_income;

  if (explicitAmount != null) {
    return {
      amount: toWholeDollars(explicitAmount),
      estimatedFromAdjustedGrossIncome: false,
    };
  }

  return {
    amount: toWholeDollars(
      Math.max(args.adjustedGrossIncome - getFederalDeductionBase(args.federalSummary, args.filingStatus), 0),
    ),
    estimatedFromAdjustedGrossIncome: true,
  };
}

function getMontanaOrdinaryIncomeThreshold(filingStatus: MontanaFilingStatus): number {
  if (filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse") {
    return 42_200;
  }

  if (filingStatus === "head_of_household") {
    return 31_700;
  }

  return 21_100;
}

function calculateMontanaOrdinaryIncomeTax(
  ordinaryIncome: number,
  filingStatus: MontanaFilingStatus,
): number {
  const threshold = getMontanaOrdinaryIncomeThreshold(filingStatus);

  if (ordinaryIncome <= 0) {
    return 0;
  }

  if (ordinaryIncome <= threshold) {
    return toWholeDollars(ordinaryIncome * 0.047);
  }

  return toWholeDollars(threshold * 0.047 + (ordinaryIncome - threshold) * 0.059);
}

function calculateMontanaLongTermCapitalGainTax(args: {
  readonly filingStatus: MontanaFilingStatus;
  readonly netLongTermCapitalGain: number;
  readonly ordinaryIncome: number;
}): number {
  if (args.netLongTermCapitalGain <= 0) {
    return 0;
  }

  const threshold = getMontanaOrdinaryIncomeThreshold(args.filingStatus);
  const lowRateWindow = Math.max(threshold - args.ordinaryIncome, 0);
  const lowRateGain = Math.min(args.netLongTermCapitalGain, lowRateWindow);
  const highRateGain = Math.max(args.netLongTermCapitalGain - lowRateGain, 0);

  return toWholeDollars(lowRateGain * 0.03 + highRateGain * 0.041);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MONTANA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MONTANA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const federalTaxableIncome = calculateMontanaFederalTaxableIncome({
    adjustedGrossIncome: args.adjustedGrossIncome,
    federalSummary: args.federalSummary,
    filingStatus,
    formRecord,
  });
  const line3FederalTaxableIncome = federalTaxableIncome.amount;
  const line4MontanaAdditions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line5MontanaSubtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line6SeniorSubtraction = toWholeDollars(
    asNumber(formRecord?.senior_subtraction_amount) ??
      countSeniorTaxpayers(args.input) * MONTANA_SENIOR_SUBTRACTION_AMOUNT,
  );
  const line7MontanaTaxableIncome = Math.max(
    line3FederalTaxableIncome + line4MontanaAdditions - line5MontanaSubtractions - line6SeniorSubtraction,
    0,
  );
  const netLongTermCapitalGain = Math.max(
    toWholeDollars(
      asNumber(formRecord?.net_long_term_capital_gain_amount) ??
        (sumCapitalGainOrLossByTerm(args.input.facts.income.capital_transactions, "long") +
          sumCapitalGainDistributions(args.input.facts.income.dividends)),
    ),
    0,
  );
  const ordinaryIncome = Math.max(line7MontanaTaxableIncome - netLongTermCapitalGain, 0);
  const line8OrdinaryIncomeTax = calculateMontanaOrdinaryIncomeTax(ordinaryIncome, filingStatus);
  const line8LongTermCapitalGainTax = calculateMontanaLongTermCapitalGainTax({
    filingStatus,
    netLongTermCapitalGain,
    ordinaryIncome,
  });
  const line8TaxBeforeCredits = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? line8OrdinaryIncomeTax + line8LongTermCapitalGainTax,
  );
  const line9NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line10TotalTax = Math.max(line8TaxBeforeCredits - line9NonrefundableCredits, 0);
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits)),
    stateCode: MONTANA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line10TotalTax - payments.totalPayments, 0),
    startingPoint: line3FederalTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7MontanaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line10TotalTax,
  });

  const validationResults = [];

  if (federalTaxableIncome.estimatedFromAdjustedGrossIncome) {
    validationResults.push(
      buildValidationResult({
        message:
          "Montana Form 2 started from an AGI-minus-federal-deduction estimate because no federal taxable income source was supplied.",
        nodeIds: ["bridge.mt.starting_point"],
        ruleId: "MT.federal_taxable_income_estimated_from_agi",
        severity: "info",
      }),
    );
  }

  if (sumScheduleCBusinessNetProfit(args.input.facts.income.schedule_c_businesses) > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Montana source apportionment for resident pass-through and multistate business income stays on the common resident path here. Supply explicit Montana adjustments when the federal Schedule C result does not match Montana treatment.",
        nodeIds: ["mt.form2.line4", "mt.form2.line5"],
        ruleId: "MT.business_adjustment_review",
        severity: "info",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line15", "bridge.mt.starting_point", "carryforward"),
      createStateEdge("bridge.mt.starting_point", "mt.form2.line7"),
      createStateEdge("mt.form2.line7", "mt.form2.line8"),
      createStateEdge("mt.form2.line8", "mt.form2.line10"),
      createStateEdge("mt.form2.line10", "mt.summary.total_tax"),
      createStateEdge("mt.form2.line12", "mt.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line15 federal taxable income or common-path fallback",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana federal taxable income starting point",
        lineCode: "line3",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.mt.starting_point",
        nodeType: "bridge",
        value: line3FederalTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana additions schedule total",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana additions",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line4",
        nodeType: "calculation",
        value: line4MontanaAdditions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana subtractions schedule total",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana subtractions",
        lineCode: "line5",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line5",
        nodeType: "calculation",
        value: line5MontanaSubtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana taxpayer age 65+ subtraction",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana senior subtraction",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line6",
        nodeType: "calculation",
        value: line6SeniorSubtraction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line3 + line4 - line5 - line6, 0)",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana taxable income",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line7",
        nodeType: "calculation",
        value: line7MontanaTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana ordinary income tax plus long-term capital gains tax",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana income tax before credits",
        lineCode: "line8",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line8",
        nodeType: "calculation",
        value: line8TaxBeforeCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana credits from Schedule III and overrides",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana nonrefundable credits",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line9",
        nodeType: "calculation",
        value: line9NonrefundableCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line8 - line9, 0)",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana total tax",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line10",
        nodeType: "summary",
        value: line10TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Montana payments and withholding total",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana total payments",
        lineCode: "line12",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.form2.line12",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 2 summary taxable income",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana taxable income summary",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.summary.taxable_income",
        nodeType: "summary",
        value: summary.taxable_income,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 2 summary total tax",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 2 summary total payments",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_payments - total_tax, 0)",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(total_tax - total_payments, 0)",
        jurisdiction: MONTANA_STATE_CODE,
        label: "Montana amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mt.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
