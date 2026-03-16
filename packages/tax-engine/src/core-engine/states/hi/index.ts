import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
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
import {
  calculateHawaiiDeduction,
  calculateHawaiiExemptions,
  type HawaiiFilingStatus,
} from "./computation";

const HAWAII_STATE_CODE = "HI";
const HAWAII_STATE_NAME = "Hawaii";
const HAWAII_FORM_RECORD_KEY = "n11";
type HawaiiTaxBracket = readonly [upperBound: number, rate: number, baseTax: number];

function calculateHawaiiTax(
  taxableIncome: number,
  filingStatus: HawaiiFilingStatus,
): number {
  const schedules: ReadonlyArray<HawaiiTaxBracket> =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? [
          [19_200, 0.014, 0],
          [28_800, 0.032, 269],
          [38_400, 0.055, 576],
          [48_000, 0.064, 1_104],
          [72_000, 0.068, 1_718],
          [96_000, 0.072, 3_350],
          [250_000, 0.076, 5_078],
          [350_000, 0.079, 16_782],
          [450_000, 0.0825, 24_682],
          [550_000, 0.09, 32_932],
          [650_000, 0.1, 41_932],
          [Number.POSITIVE_INFINITY, 0.11, 51_932],
        ]
      : filingStatus === "head_of_household"
        ? [
            [14_400, 0.014, 0],
            [21_600, 0.032, 202],
            [28_800, 0.055, 432],
            [36_000, 0.064, 828],
            [54_000, 0.068, 1_289],
            [72_000, 0.072, 2_513],
            [187_500, 0.076, 3_809],
            [262_500, 0.079, 12_587],
            [337_500, 0.0825, 18_512],
            [412_500, 0.09, 24_700],
            [487_500, 0.1, 31_450],
            [Number.POSITIVE_INFINITY, 0.11, 38_950],
          ]
        : [
            [9_600, 0.014, 0],
            [14_400, 0.032, 134],
            [19_200, 0.055, 288],
            [24_000, 0.064, 552],
            [36_000, 0.068, 859],
            [48_000, 0.072, 1_675],
            [125_000, 0.076, 2_539],
            [175_000, 0.079, 8_391],
            [225_000, 0.0825, 12_341],
            [275_000, 0.09, 16_466],
            [325_000, 0.1, 20_966],
            [Number.POSITIVE_INFINITY, 0.11, 25_966],
          ];

  let lowerBound = 0;

  for (const [upperBound, rate, baseTax] of schedules) {
    if (taxableIncome <= upperBound) {
      return toWholeDollars(baseTax + (taxableIncome - lowerBound) * rate);
    }

    lowerBound = upperBound;
  }

  return 0;
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: HAWAII_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, HAWAII_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line20HawaiiAdjustedGrossIncome = Math.max(
    toWholeDollars(args.adjustedGrossIncome) +
      sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
    0,
  );
  const deduction = calculateHawaiiDeduction({
    adjustedGrossIncome: line20HawaiiAdjustedGrossIncome,
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line24IncomeAfterDeduction = line20HawaiiAdjustedGrossIncome - deduction.selectedDeductionAmount;
  const exemptions = calculateHawaiiExemptions({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line25Exemptions = exemptions.totalExemptions;
  const line26TaxableIncome = Math.max(line24IncomeAfterDeduction - line25Exemptions, 0);
  const line27Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateHawaiiTax(line26TaxableIncome, filingStatus),
  );
  const line30NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line33TotalTax = Math.max(line27Tax - line30NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: HAWAII_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line33TotalTax - payments.totalPayments, 0),
    startingPoint: line20HawaiiAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line26TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line33TotalTax,
  });

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (deduction.worksheetLimitedAmount && asNumber(formRecord?.itemized_deduction_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Hawaii itemized deductions were reduced using the official Total Itemized Deductions Worksheet because Hawaii AGI exceeds the limitation threshold.",
        nodeIds: ["hi.n11.line22"],
        ruleId: "HI.itemized_deduction_limited",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (exemptions.usesDisabilityExemption && asNumber(formRecord?.exemption_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Hawaii line 25 applied the certified disability exemption schedule from Form N-11 instructions. Form N-172 certification is still required for the return to claim this path.",
        nodeIds: ["hi.n11.line25"],
        ruleId: "HI.disability_exemption_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.hi.starting_point", "carryforward"),
      createStateEdge("bridge.hi.starting_point", "hi.n11.line24"),
      createStateEdge("hi.n11.line24", "hi.n11.line26"),
      createStateEdge("hi.n11.line26", "hi.n11.line27"),
      createStateEdge("hi.n11.line27", "hi.summary.total_tax"),
      createStateEdge("hi.n11.line33", "hi.summary.total_tax"),
      createStateEdge("hi.n11.line38", "hi.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 plus Hawaii additions minus Hawaii subtractions",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii adjusted gross income",
        lineCode: "line20",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.hi.starting_point",
        nodeType: "bridge",
        value: line20HawaiiAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          asNumber(formRecord?.itemized_deduction_amount) != null
            ? "plugin_fact_bag.n11.itemized_deduction_amount override"
            : deduction.worksheetLimitedAmount
              ? "Hawaii Total Itemized Deductions Worksheet line 11"
              : "Hawaii itemized deductions worksheet total",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii total itemized deductions",
        lineCode: "line22",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line22",
        nodeType: "calculation",
        value: deduction.itemizedDeductionAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Hawaii standard deduction schedule",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii standard deduction",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line23",
        nodeType: "calculation",
        value: deduction.standardDeductionAmount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line20 minus line22 or line23",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii income after deductions",
        lineCode: "line24",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line24",
        nodeType: "calculation",
        value: line24IncomeAfterDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          asNumber(formRecord?.exemption_amount) != null
            ? "plugin_fact_bag.n11.exemption_amount override"
            : exemptions.usesDisabilityExemption
              ? "Hawaii disability exemption schedule from Form N-11 line 25 instructions"
              : "$1,144 multiplied by Hawaii line 6e exemption count",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii exemptions",
        lineCode: "line25",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line25",
        nodeType: "calculation",
        value: line25Exemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line24 - line25, 0)",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii taxable income",
        lineCode: "line26",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line26",
        nodeType: "calculation",
        value: line26TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "2025 Hawaii tax rate schedules or override",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii income tax",
        lineCode: "line27",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line27",
        nodeType: "calculation",
        value: line27Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Hawaii nonrefundable credits common path",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii nonrefundable credits",
        lineCode: "line30",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line30",
        nodeType: "calculation",
        value: line30NonrefundableCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line27 - line30, 0)",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii total tax",
        lineCode: "line33",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line33",
        nodeType: "summary",
        value: line33TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii total payments",
        lineCode: "line38",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.n11.line38",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "n11.line26",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.summary.taxable_income",
        nodeType: "summary",
        value: line26TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "n11.line33",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.summary.total_tax",
        nodeType: "summary",
        value: line33TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "n11.line38",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.refund_amount",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii summary refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.amount_owed",
        jurisdiction: HAWAII_STATE_CODE,
        label: "Hawaii summary amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "hi.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
