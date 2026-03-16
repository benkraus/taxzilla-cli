import { asNumber } from "../../helpers";
import { sumScheduleCBusinessNetProfit } from "../../income-amounts";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
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
} from "../resident";

const OHIO_STATE_CODE = "OH";
const OHIO_STATE_NAME = "Ohio";
const OHIO_FORM_RECORD_KEY = "it1040";

type OhioFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundOhioRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateOhioBusinessIncomeDeduction(args: {
  readonly filingStatus: OhioFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.business_income_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const cap = args.filingStatus === "married_filing_separately" ? 125_000 : 250_000;
  const scheduleCBusinessIncome = Math.max(
    sumScheduleCBusinessNetProfit(args.input.facts.income.schedule_c_businesses),
    0,
  );
  const additionalBusinessIncome = toWholeDollars(asNumber(args.formRecord?.additional_business_income_amount) ?? 0);

  return toWholeDollars(Math.min(Math.max(scheduleCBusinessIncome + additionalBusinessIncome, 0), cap));
}

function calculateOhioTax(ohioAdjustedGrossIncome: number): number {
  if (ohioAdjustedGrossIncome <= 26_050) {
    return 0;
  }

  return toWholeDollars(360.69 + (ohioAdjustedGrossIncome - 26_050) * 0.0275);
}

function calculateOhioExemptionAmount(args: {
  readonly filingStatus: OhioFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly ohioAdjustedGrossIncome: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.exemption_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const count =
    countPersonalExemptions(args.input, args.filingStatus) + countDependentExemptions(args.input);

  if (args.ohioAdjustedGrossIncome > 100_000) {
    return 0;
  }

  const perExemptionAmount =
    args.ohioAdjustedGrossIncome <= 40_000
      ? 2_400
      : args.ohioAdjustedGrossIncome <= 80_000
        ? 2_150
        : 1_900;

  return count * perExemptionAmount;
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: OHIO_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, OHIO_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const line1FederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const line2Adjustments = toWholeDollars(
    sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
  );
  const line3BusinessIncomeDeduction = calculateOhioBusinessIncomeDeduction({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line5OhioAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Adjustments - line3BusinessIncomeDeduction,
    0,
  );
  const line8Tax = toWholeDollars(asNumber(formRecord?.tax_amount) ?? calculateOhioTax(line5OhioAdjustedGrossIncome));
  const line9Credits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) +
      toWholeDollars(asNumber(formRecord?.nonbusiness_credit_amount) ?? 0),
  );
  const line10ExemptionAmount = calculateOhioExemptionAmount({
    filingStatus,
    formRecord,
    input: args.input,
    ohioAdjustedGrossIncome: line5OhioAdjustedGrossIncome,
  });
  const line11ResidentTotalTax = Math.max(line8Tax - line9Credits - line10ExemptionAmount, 0);
  const allocatedOhioAdjustedGrossIncome = isAllocatedReturn
    ? Math.max(
        toWholeDollars(
          asNumber(formRecord?.itnrc_ohio_income_amount) ??
            (() => {
              const sourcedFederalAdjustedGrossIncome =
                deriveCombinedStateTaxedIncome(args.stateReturn) ??
                args.returnKindContext?.allocatedAdjustedGrossIncome ??
                args.adjustedGrossIncome;
              const allocationRatio =
                deriveAllocationRatio(args.stateReturn) ??
                (line1FederalAdjustedGrossIncome > 0
                  ? sourcedFederalAdjustedGrossIncome / line1FederalAdjustedGrossIncome
                  : 0);

              return (
                sourcedFederalAdjustedGrossIncome +
                line2Adjustments * allocationRatio -
                line3BusinessIncomeDeduction * allocationRatio
              );
            })(),
        ),
        0,
      )
    : line5OhioAdjustedGrossIncome;
  const line16OhioAdjustedGrossIncome = isAllocatedReturn ? line5OhioAdjustedGrossIncome : null;
  const line17OhioIncomeTaxedByOhio = isAllocatedReturn ? allocatedOhioAdjustedGrossIncome : null;
  const line18NonresidentPortionOfOhioIncome =
    line16OhioAdjustedGrossIncome == null || line17OhioIncomeTaxedByOhio == null
      ? null
      : Math.max(line16OhioAdjustedGrossIncome - line17OhioIncomeTaxedByOhio, 0);
  const line19NonresidentPortionRatio =
    line16OhioAdjustedGrossIncome != null &&
    line16OhioAdjustedGrossIncome > 0 &&
    line18NonresidentPortionOfOhioIncome != null
      ? roundOhioRatio(line18NonresidentPortionOfOhioIncome / line16OhioAdjustedGrossIncome)
      : isAllocatedReturn
        ? 1
        : null;
  const line20NonresidentCredit =
    line19NonresidentPortionRatio == null
      ? 0
      : toWholeDollars(line11ResidentTotalTax * line19NonresidentPortionRatio);
  const line11TotalTax = Math.max(line11ResidentTotalTax - line20NonresidentCredit, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: OHIO_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line11TotalTax - payments.totalPayments, 0),
    startingPoint: line17OhioIncomeTaxedByOhio ?? line5OhioAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line17OhioIncomeTaxedByOhio ?? line5OhioAdjustedGrossIncome,
    totalPayments: payments.totalPayments,
    totalTax: line11TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point:
          line17OhioIncomeTaxedByOhio ?? summary.adjusted_gross_income_or_starting_point,
        allocation_ratio:
          line16OhioAdjustedGrossIncome != null &&
          line16OhioAdjustedGrossIncome > 0 &&
          line17OhioIncomeTaxedByOhio != null
            ? roundOhioRatio(line17OhioIncomeTaxedByOhio / line16OhioAdjustedGrossIncome)
            : summary.allocation_ratio ?? null,
      }
    : summary;

  const validationResults = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Ohio IT NRC nonresident credit was applied using full-year Ohio tax, Ohio income taxable by Ohio, and the nonresident-portion ratio so part-year and nonresident tax follows the official credit-based allocation path.",
        nodeIds: ["oh.itnrc.line16", "oh.itnrc.line17", "oh.itnrc.line19", "oh.itnrc.line20"],
        ruleId: "OH.itnrc_nonresident_credit_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line2Adjustments !== 0 || line3BusinessIncomeDeduction !== 0) &&
    asNumber(formRecord?.itnrc_ohio_income_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Ohio IT NRC Ohio-taxed income was not supplied explicitly, so the engine apportioned Ohio net adjustments and the business income deduction using the state allocation profile ratio.",
        nodeIds: ["oh.it1040.line2", "oh.it1040.line3", "oh.itnrc.line17", "oh.itnrc.line19"],
        ruleId: "OH.itnrc_income_components_allocated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.oh.starting_point", "carryforward"),
      createStateEdge("bridge.oh.starting_point", "oh.it1040.line5"),
      ...(isAllocatedReturn
        ? [
            createStateEdge("oh.it1040.line5", "oh.itnrc.line16"),
            createStateEdge("oh.itnrc.line16", "oh.itnrc.line18"),
            createStateEdge("oh.itnrc.line17", "oh.itnrc.line18"),
            createStateEdge("oh.itnrc.line18", "oh.itnrc.line19"),
            createStateEdge("oh.it1040.line11_resident", "oh.itnrc.line20"),
            createStateEdge("oh.itnrc.line19", "oh.itnrc.line20"),
            createStateEdge("oh.itnrc.line20", "oh.it1040.line11"),
          ]
        : []),
      createStateEdge("oh.it1040.line5", "oh.it1040.line8"),
      createStateEdge("oh.it1040.line8", "oh.it1040.line11"),
      createStateEdge("oh.it1040.line11", "oh.summary.total_tax"),
      createStateEdge("oh.it1040.line14", "oh.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 rounded to Ohio whole-dollar rules",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio federal adjusted gross income",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.oh.starting_point",
        nodeType: "bridge",
        value: line1FederalAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio additions minus Ohio subtractions common path",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio net adjustments",
        lineCode: "line2",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line2",
        nodeType: "calculation",
        value: line2Adjustments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio business income deduction up to $250,000 or $125,000 MFS",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio business income deduction",
        lineCode: "line3",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line3",
        nodeType: "calculation",
        value: line3BusinessIncomeDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line1 + line2 - line3, 0)",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio adjusted gross income",
        lineCode: "line5",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line5",
        nodeType: "calculation",
        value: line5OhioAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio 2025 tax calculation formula from line 8 instructions",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio tax",
        lineCode: "line8",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line8",
        nodeType: "calculation",
        value: line8Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio nonbusiness credits and other nonrefundable credits",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio credits before exemption amount",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line9",
        nodeType: "calculation",
        value: line9Credits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio exemption schedule based on Ohio AGI and exemption count",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio exemption amount",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line10",
        nodeType: "calculation",
        value: line10ExemptionAmount,
      }),
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Ohio IT NRC line 16 Ohio adjusted gross income",
              jurisdiction: OHIO_STATE_CODE,
              label: "Ohio IT NRC Ohio adjusted gross income",
              lineCode: "line16",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "oh.itnrc.line16",
              nodeType: "calculation",
              value: line16OhioAdjustedGrossIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef:
                "Ohio IT NRC line 17 Ohio income taxable by Ohio using allocated AGI plus apportioned Ohio adjustments and business-income deduction",
              jurisdiction: OHIO_STATE_CODE,
              label: "Ohio IT NRC Ohio income taxable by Ohio",
              lineCode: "line17",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "oh.itnrc.line17",
              nodeType: "calculation",
              value: line17OhioIncomeTaxedByOhio,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "max(line16 - line17, 0)",
              jurisdiction: OHIO_STATE_CODE,
              label: "Ohio IT NRC nonresident portion of Ohio income",
              lineCode: "line18",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "oh.itnrc.line18",
              nodeType: "calculation",
              value: line18NonresidentPortionOfOhioIncome,
            }),
            createStateNode({
              dataType: "string",
              formCode: primaryFormCode,
              formulaRef: "line18 / line16",
              jurisdiction: OHIO_STATE_CODE,
              label: "Ohio IT NRC nonresident portion ratio",
              lineCode: "line19",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "oh.itnrc.line19",
              nodeType: "calculation",
              value:
                line19NonresidentPortionRatio == null
                  ? null
                  : line19NonresidentPortionRatio.toFixed(4),
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Ohio IT NRC line 19 * Ohio resident total tax",
              jurisdiction: OHIO_STATE_CODE,
              label: "Ohio IT NRC nonresident credit",
              lineCode: "line20",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "oh.itnrc.line20",
              nodeType: "calculation",
              value: line20NonresidentCredit,
            }),
          ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Ohio resident-path total tax before IT NRC nonresident credit",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio resident-path total tax before nonresident credit",
        lineCode: "line11_resident",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line11_resident",
        nodeType: "calculation",
        value: line11ResidentTotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          line20NonresidentCredit > 0
            ? "max(resident line11 tax - IT NRC line20 nonresident credit, 0)"
            : "max(line8 - line9 - line10, 0)",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio total tax",
        lineCode: "line11",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line11",
        nodeType: "summary",
        value: line11TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio total payments",
        lineCode: "line14",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.it1040.line14",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: line17OhioIncomeTaxedByOhio == null ? "it1040.line5" : "itnrc.line17",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.summary.taxable_income",
        nodeType: "summary",
        value: line17OhioIncomeTaxedByOhio ?? line5OhioAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "it1040.line11",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.summary.total_tax",
        nodeType: "summary",
        value: line11TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "it1040.line14",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line14 - line11, 0)",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line11 - line14, 0)",
        jurisdiction: OHIO_STATE_CODE,
        label: "Ohio amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "oh.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
