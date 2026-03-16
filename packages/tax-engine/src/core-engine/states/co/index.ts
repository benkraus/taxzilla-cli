import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../return-kind";
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
} from "../resident";

const COLORADO_STATE_CODE = "CO";
const COLORADO_STATE_NAME = "Colorado";
const COLORADO_FORM_RECORD_KEY = "dr0104";
const COLORADO_FLAT_TAX_RATE = 0.044;

function roundColoradoApportionmentPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateColoradoFederalTaxableIncome(args: {
  readonly adjustedGrossIncome: number;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
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
      Math.max(
        args.adjustedGrossIncome - getFederalDeductionBase(args.federalSummary, args.filingStatus),
        0,
      ),
    ),
    estimatedFromAdjustedGrossIncome: true,
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: COLORADO_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, COLORADO_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const federalTaxableIncome = calculateColoradoFederalTaxableIncome({
    adjustedGrossIncome: fullYearFederalAdjustedGrossIncome,
    federalSummary: fullYearFederalSummary,
    filingStatus,
    formRecord,
  });
  const line1FederalTaxableIncome = federalTaxableIncome.amount;
  const coloradoAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? coloradoAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line3Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line4Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line8ColoradoTaxableIncome = Math.max(
    line1FederalTaxableIncome + line3Additions - line4Subtractions,
    0,
  );
  const pnModifiedFederalAdjustedGrossIncome = Math.max(
    fullYearFederalAdjustedGrossIncome + line3Additions - line4Subtractions,
    0,
  );
  const pnColoradoAdditions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.apportionment_additions_total) ??
          line3Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line3Additions;
  const pnColoradoSubtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.apportionment_subtractions_total) ??
          line4Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line4Subtractions;
  const pnModifiedColoradoAdjustedGrossIncome = Math.max(
    coloradoAdjustedGrossIncome + pnColoradoAdditions - pnColoradoSubtractions,
    0,
  );
  const pnApportionmentPercentage =
    isAllocatedReturn && pnModifiedFederalAdjustedGrossIncome > 0 && pnModifiedColoradoAdjustedGrossIncome > 0
      ? roundColoradoApportionmentPercentage(
          pnModifiedColoradoAdjustedGrossIncome / pnModifiedFederalAdjustedGrossIncome,
        )
      : isAllocatedReturn
        ? 0
        : null;
  const line10Tax = toWholeDollars(line8ColoradoTaxableIncome * COLORADO_FLAT_TAX_RATE);
  const line11OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line13NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const apportionedColoradoTaxableIncome =
    pnApportionmentPercentage == null
      ? line8ColoradoTaxableIncome
      : toWholeDollars(line8ColoradoTaxableIncome * pnApportionmentPercentage);
  const apportionedIncomeTax =
    pnApportionmentPercentage == null
      ? line10Tax
      : toWholeDollars(line10Tax * pnApportionmentPercentage);
  const line22TotalTax = Math.max(apportionedIncomeTax + line11OtherTaxes - line13NonrefundableCredits, 0);
  const line34RefundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) +
      (asNumber(formRecord?.tabor_sales_tax_refund) ?? 0),
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: line34RefundableCredits,
    stateCode: COLORADO_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const line37AmountOwed = Math.max(line22TotalTax - payments.totalPayments, 0);
  const summary = buildResidentStateSummary({
    amountOwed: line37AmountOwed,
    startingPoint: isAllocatedReturn ? pnModifiedColoradoAdjustedGrossIncome : line1FederalTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: apportionedColoradoTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line22TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: pnModifiedColoradoAdjustedGrossIncome,
        allocation_ratio: pnApportionmentPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line15 rounded to Colorado whole-dollar rules",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado Form DR 0104 federal taxable income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.co.starting_point",
      nodeType: "bridge",
      value: line1FederalTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.dr0104.additions",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado additions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line3",
      nodeType: "calculation",
      value: line3Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.dr0104.subtractions",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado subtractions",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line4",
      nodeType: "calculation",
      value: line4Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line3 - line4, 0)",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado taxable income",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line8",
      nodeType: "calculation",
      value: line8ColoradoTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line8 * 0.044",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado income tax before credits",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line10",
      nodeType: "calculation",
      value: apportionedIncomeTax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Colorado Form 104PN modified federal adjusted gross income",
            jurisdiction: COLORADO_STATE_CODE,
            label: "Colorado 104PN modified federal adjusted gross income",
            lineCode: "form104pn.modified_federal_agi",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "co.dr0104pn.modified_federal_agi",
            nodeType: "calculation",
            value: pnModifiedFederalAdjustedGrossIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Colorado Form 104PN modified Colorado adjusted gross income",
            jurisdiction: COLORADO_STATE_CODE,
            label: "Colorado 104PN modified Colorado adjusted gross income",
            lineCode: "form104pn.modified_colorado_agi",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "co.dr0104pn.modified_colorado_agi",
            nodeType: "calculation",
            value: pnModifiedColoradoAdjustedGrossIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Colorado Form 104PN apportionment percentage",
            jurisdiction: COLORADO_STATE_CODE,
            label: "Colorado 104PN apportionment percentage",
            lineCode: "form104pn.percentage",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "co.dr0104pn.percentage",
            nodeType: "calculation",
            value: pnApportionmentPercentage?.toFixed(4) ?? "0.0000",
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Colorado Form 104PN apportioned income tax",
            jurisdiction: COLORADO_STATE_CODE,
            label: "Colorado 104PN apportioned income tax",
            lineCode: "form104pn.apportioned_tax",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "co.dr0104pn.apportioned_tax",
            nodeType: "calculation",
            value: apportionedIncomeTax,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line10 + line11 - line13, 0)",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado total tax",
      lineCode: "line22",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line22",
      nodeType: "summary",
      value: line22TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado total payments",
      lineCode: "line35",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.dr0104.line35",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "dr0104.line8",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.summary.taxable_income",
      nodeType: "summary",
      value: apportionedColoradoTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "dr0104.line22",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.summary.total_tax",
      nodeType: "summary",
      value: line22TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "dr0104.line35",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line35 - line22, 0)",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line22 - line35, 0)",
      jurisdiction: COLORADO_STATE_CODE,
      label: "Colorado amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "co.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line15", "bridge.co.starting_point", "carryforward"),
    createStateEdge("bridge.co.starting_point", "co.dr0104.line8"),
    createStateEdge("co.dr0104.line3", "co.dr0104.line8"),
    createStateEdge("co.dr0104.line4", "co.dr0104.line8"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("co.dr0104pn.modified_federal_agi", "co.dr0104pn.percentage"),
          createStateEdge("co.dr0104pn.modified_colorado_agi", "co.dr0104pn.percentage"),
          createStateEdge("co.dr0104.line10", "co.dr0104.line22"),
          createStateEdge("co.dr0104.line8", "co.dr0104pn.apportioned_tax"),
          createStateEdge("co.dr0104pn.percentage", "co.dr0104pn.apportioned_tax"),
          createStateEdge("co.dr0104pn.apportioned_tax", "co.dr0104.line22"),
        ]
      : []),
    createStateEdge("co.dr0104.line8", "co.dr0104.line10"),
    createStateEdge("co.dr0104.line22", "co.summary.total_tax"),
    createStateEdge("co.dr0104.line35", "co.summary.total_payments"),
  ];

  const validationResults = [];

  if (federalTaxableIncome.estimatedFromAdjustedGrossIncome) {
    validationResults.push(
      buildValidationResult({
        message:
          "Colorado federal taxable income was estimated from adjusted gross income minus the federal deduction base because no explicit 1040 line 15 amount was supplied.",
        nodeIds: ["bridge.co.starting_point"],
        ruleId: "CO.federal_taxable_income_estimated_from_agi",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Colorado Form 104PN applied the modified-AGI apportionment percentage to Colorado income tax so part-year and nonresident tax follows the official allocation path.",
        nodeIds: ["co.dr0104pn.percentage", "co.dr0104pn.apportioned_tax"],
        ruleId: "CO.form104pn_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line3Additions !== 0 || line4Subtractions !== 0) &&
    (asNumber(formRecord?.apportionment_additions_total) == null ||
      asNumber(formRecord?.apportionment_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Colorado Form 104PN modified-AGI additions or subtractions were not supplied explicitly, so the engine allocated those modifications using the state allocation profile ratio.",
        nodeIds: ["co.dr0104pn.modified_colorado_agi"],
        ruleId: "CO.form104pn_modifications_allocated_by_ratio",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn && (line11OtherTaxes !== 0 || line13NonrefundableCredits !== 0 || line34RefundableCredits !== 0)) {
    validationResults.push(
      buildValidationResult({
        message:
          "Colorado allocated returns can require credit- and surtax-specific apportionment rules. This path apportioned the core income tax and then applied any supplied other taxes or credits directly.",
        nodeIds: ["co.dr0104.line22", "co.dr0104.line35"],
        ruleId: "CO.form104pn_credit_apportionment_review",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (asNumber(formRecord?.tabor_sales_tax_refund) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Colorado TABOR refund was left at zero because no TY2025 sales-tax-refund amount was supplied for this return.",
        nodeIds: ["co.dr0104.line35"],
        ruleId: "CO.tabor_refund_default_zero",
        severity: "info",
        status: "pass",
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
