import { asBoolean, asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
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
} from "../../resident";

const MINNESOTA_STATE_CODE = "MN";
const MINNESOTA_STATE_NAME = "Minnesota";
const MINNESOTA_FORM_RECORD_KEY = "m1";

type MinnesotaFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function calculateMinnesotaTax(
  taxableIncome: number,
  filingStatus: MinnesotaFilingStatus,
): number {
  const brackets: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ] =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? [
          [47_620, 0.0535],
          [189_180, 0.068],
          [330_410, 0.0785],
        ]
      : filingStatus === "head_of_household"
        ? [
            [40_100, 0.0535],
            [161_130, 0.068],
            [264_050, 0.0785],
          ]
        : filingStatus === "married_filing_separately"
          ? [
              [23_810, 0.0535],
              [94_590, 0.068],
              [165_205, 0.0785],
            ]
          : [
              [32_570, 0.0535],
              [106_990, 0.068],
              [198_630, 0.0785],
            ];

  const firstCap = brackets[0];
  const secondCap = brackets[1];
  const thirdCap = brackets[2];

  if (taxableIncome <= firstCap[0]) {
    return toWholeDollars(taxableIncome * firstCap[1]);
  }

  if (taxableIncome <= secondCap[0]) {
    return toWholeDollars(firstCap[0] * firstCap[1] + (taxableIncome - firstCap[0]) * secondCap[1]);
  }

  if (taxableIncome <= thirdCap[0]) {
    return toWholeDollars(
      firstCap[0] * firstCap[1] +
        (secondCap[0] - firstCap[0]) * secondCap[1] +
        (taxableIncome - secondCap[0]) * thirdCap[1],
    );
  }

  return toWholeDollars(
    firstCap[0] * firstCap[1] +
      (secondCap[0] - firstCap[0]) * secondCap[1] +
      (thirdCap[0] - secondCap[0]) * thirdCap[1] +
      (taxableIncome - thirdCap[0]) * 0.0985,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MINNESOTA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MINNESOTA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line4Deduction = toWholeDollars(
    asNumber(formRecord?.deduction_amount) ?? getFederalDeductionBase(args.federalSummary, filingStatus),
  );
  const line5Exemptions = toWholeDollars(asNumber(formRecord?.exemption_amount) ?? 0);
  const line6StateIncomeTaxRefundSubtraction = toWholeDollars(
    asNumber(formRecord?.state_income_tax_refund_amount) ?? 0,
  );
  const line7Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line8TotalSubtractions = toWholeDollars(
    line4Deduction + line5Exemptions + line6StateIncomeTaxRefundSubtraction + line7Subtractions,
  );
  const line9MinnesotaTaxableIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line8TotalSubtractions,
    0,
  );
  const line10Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateMinnesotaTax(line9MinnesotaTaxableIncome, filingStatus),
  );
  const line16NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const marriageCredit = toWholeDollars(asNumber(formRecord?.marriage_credit_amount) ?? 0);
  const line17TaxAfterCredits = Math.max(line10Tax - line16NonrefundableCredits - marriageCredit, 0);
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits)),
    stateCode: MINNESOTA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line17TaxAfterCredits - payments.totalPayments, 0),
    startingPoint: line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line9MinnesotaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line17TaxAfterCredits,
  });

  const validationResults = [];

  if (
    args.input.household.dependents.length > 0 &&
    asNumber(formRecord?.exemption_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Minnesota line 5 stayed at the common-path zero amount because no Schedule M1DQC-derived exemption amount was supplied for the dependent facts on this return.",
        nodeIds: ["mn.m1.line5"],
        ruleId: "MN.exemption_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    filingStatus === "married_filing_jointly" &&
    args.input.household.spouse &&
    line9MinnesotaTaxableIncome >= 48_000 &&
    asNumber(formRecord?.marriage_credit_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Minnesota marriage credit stayed at zero because no Schedule M1MA spouse-by-spouse earned-income result was supplied for this joint return.",
        nodeIds: ["mn.m1.line16"],
        ruleId: "MN.marriage_credit_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    args.federalSummary?.deduction_strategy === "itemized" &&
    asNumber(formRecord?.deduction_amount) == null &&
    asBoolean(formRecord?.force_standard_deduction) !== true
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Minnesota itemized deductions used the federal itemized base on this path because no Minnesota-specific M1SA amount was supplied.",
        nodeIds: ["mn.m1.line4"],
        ruleId: "MN.itemized_deduction_federal_base_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.mn.starting_point", "carryforward"),
      createStateEdge("bridge.mn.starting_point", "mn.m1.line9"),
      createStateEdge("mn.m1.line9", "mn.m1.line10"),
      createStateEdge("mn.m1.line10", "mn.m1.line17"),
      createStateEdge("mn.m1.line17", "mn.summary.total_tax"),
      createStateEdge("mn.m1.line23", "mn.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota federal adjusted gross income starting point",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.mn.starting_point",
        nodeType: "bridge",
        value: line1FederalAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota additions schedule total",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota additions",
        lineCode: "line2",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line2",
        nodeType: "calculation",
        value: line2Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota standard deduction or M1SA itemized deduction",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota deductions",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line4",
        nodeType: "calculation",
        value: line4Deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota Schedule M1DQC exemption amount",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota exemptions",
        lineCode: "line5",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line5",
        nodeType: "calculation",
        value: line5Exemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota state income tax refund subtraction",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota state income tax refund subtraction",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line6",
        nodeType: "calculation",
        value: line6StateIncomeTaxRefundSubtraction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota subtractions schedule total",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota subtractions",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line7",
        nodeType: "calculation",
        value: line7Subtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line4 + line5 + line6 + line7",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota total subtractions",
        lineCode: "line8",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line8",
        nodeType: "calculation",
        value: line8TotalSubtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line1 + line2 - line8, 0)",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota taxable income",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line9",
        nodeType: "calculation",
        value: line9MinnesotaTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota 2025 tax rate schedule",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota tax",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line10",
        nodeType: "calculation",
        value: line10Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota nonrefundable credits and marriage credit",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota tax after credits",
        lineCode: "line17",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line17",
        nodeType: "summary",
        value: line17TaxAfterCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Minnesota payment and withholding total",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota total payments",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.m1.line23",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form M1 summary total tax",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota total tax summary",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.summary.total_tax",
        nodeType: "summary",
        value: summary.total_tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form M1 summary total payments",
        jurisdiction: MINNESOTA_STATE_CODE,
        label: "Minnesota total payments summary",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "mn.summary.total_payments",
        nodeType: "summary",
        value: summary.total_payments,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
