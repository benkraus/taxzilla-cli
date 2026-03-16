import { asBoolean, asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../return-kind";
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

const NORTH_CAROLINA_STATE_CODE = "NC";
const NORTH_CAROLINA_STATE_NAME = "North Carolina";
const NORTH_CAROLINA_FORM_RECORD_KEY = "d400";
const NORTH_CAROLINA_FLAT_TAX_RATE = 0.0425;
const NORTH_CAROLINA_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 19_125,
  married_filing_jointly: 25_500,
  married_filing_separately: 12_750,
  qualifying_surviving_spouse: 25_500,
  single: 12_750,
} as const;

function calculateNorthCarolinaDeduction(args: {
  readonly federalDeductionStrategy: StateArtifactsArgs["federalSummary"] extends infer T
    ? T extends { deduction_strategy: infer U }
      ? U
      : "standard"
    : "standard";
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
}): number {
  const standardDeduction =
    args.filingStatus === "married_filing_separately" && asBoolean(args.formRecord?.spouse_itemized_federal)
      ? 0
      : NORTH_CAROLINA_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const itemizedDeductionsTotal = toWholeDollars(asNumber(args.formRecord?.itemized_deductions_total) ?? 0);

  if (args.federalDeductionStrategy === "itemized" && itemizedDeductionsTotal > standardDeduction) {
    return itemizedDeductionsTotal;
  }

  return standardDeduction;
}

function roundNorthCarolinaPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function hasPotentialNorthCarolinaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === NORTH_CAROLINA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== NORTH_CAROLINA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== NORTH_CAROLINA_STATE_CODE &&
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
      stateName: NORTH_CAROLINA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NORTH_CAROLINA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const line6FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const allocatedNorthCarolinaAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? allocatedNorthCarolinaAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line7Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line9Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line10ChildDeduction = toWholeDollars(asNumber(formRecord?.child_deduction_amount) ?? 0);
  const line11Deduction = calculateNorthCarolinaDeduction({
    federalDeductionStrategy: fullYearFederalSummary?.deduction_strategy ?? "standard",
    filingStatus,
    formRecord,
  });
  const schedulePnLine18AllocatedAdditions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_pn_additions_total) ??
          line7Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line7Additions;
  const schedulePnLine20AllocatedSubtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_pn_subtractions_total) ??
          line9Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line9Subtractions;
  const line12bFullYearTaxableIncome = Math.max(
    fullYearFederalAdjustedGrossIncome +
      line7Additions -
      line9Subtractions -
      line10ChildDeduction -
      line11Deduction,
    0,
  );
  const schedulePnLine21FullYearIncome = Math.max(
    fullYearFederalAdjustedGrossIncome + line7Additions - line9Subtractions,
    0,
  );
  const schedulePnLine21AllocatedIncome = isAllocatedReturn
    ? Math.max(
        allocatedNorthCarolinaAdjustedGrossIncome +
          schedulePnLine18AllocatedAdditions -
          schedulePnLine20AllocatedSubtractions,
        0,
      )
    : schedulePnLine21FullYearIncome;
  const line13TaxablePercentage =
    isAllocatedReturn && schedulePnLine21FullYearIncome > 0 && schedulePnLine21AllocatedIncome > 0
      ? roundNorthCarolinaPercentage(schedulePnLine21AllocatedIncome / schedulePnLine21FullYearIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const line14NorthCarolinaTaxableIncome =
    line13TaxablePercentage == null
      ? line12bFullYearTaxableIncome
      : toWholeDollars(line12bFullYearTaxableIncome * line13TaxablePercentage);
  const line15Tax = toWholeDollars(line14NorthCarolinaTaxableIncome * NORTH_CAROLINA_FLAT_TAX_RATE);
  const line16OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line18NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line19TotalTax = Math.max(line15Tax + line16OtherTaxes - line18NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: NORTH_CAROLINA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line19TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? schedulePnLine21AllocatedIncome : line6FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line14NorthCarolinaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line19TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: schedulePnLine21AllocatedIncome,
        allocation_ratio: line13TaxablePercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to North Carolina whole-dollar rules",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina D-400 federal adjusted gross income starting point",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.nc.starting_point",
      nodeType: "bridge",
      value: line6FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.d400.additions",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina additions",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line7",
      nodeType: "calculation",
      value: line7Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.d400.subtractions",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina deductions from adjusted gross income",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line9",
      nodeType: "calculation",
      value: line9Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "plugin_fact_bag.d400.child_deduction_amount",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina child deduction",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line10",
      nodeType: "calculation",
      value: line10ChildDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "North Carolina standard deduction or itemized deductions total",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina deduction",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line11",
      nodeType: "calculation",
      value: line11Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line6 + line7 - line9 - line10 - line11, 0)",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina full-year taxable income before Schedule PN",
      lineCode: "line12b",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line12b",
      nodeType: "calculation",
      value: line12bFullYearTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: line13TaxablePercentage == null ? "line12b" : "line12b * line13",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina taxable income",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line14",
      nodeType: "calculation",
      value: line14NorthCarolinaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line14 * 0.0425",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina tax before credits",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line15",
      nodeType: "calculation",
      value: line15Tax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "North Carolina Schedule PN Part B line 16, Column A",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN full-year adjusted gross income",
            lineCode: "schedule_pn.line16a",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line16a",
            nodeType: "calculation",
            value: fullYearFederalAdjustedGrossIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "North Carolina Schedule PN Part B line 16, Column B",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN adjusted gross income subject to North Carolina tax",
            lineCode: "schedule_pn.line16b",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line16b",
            nodeType: "calculation",
            value: allocatedNorthCarolinaAdjustedGrossIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "North Carolina Schedule PN Part B line 18, Column A",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN full-year additions",
            lineCode: "schedule_pn.line18a",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line18a",
            nodeType: "calculation",
            value: line7Additions,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "North Carolina Schedule PN Part B line 18, Column B from explicit override or allocation-profile ratio",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN North Carolina additions",
            lineCode: "schedule_pn.line18b",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line18b",
            nodeType: "calculation",
            value: schedulePnLine18AllocatedAdditions,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "North Carolina Schedule PN Part B line 20, Column A",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN full-year deductions from adjusted gross income",
            lineCode: "schedule_pn.line20a",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line20a",
            nodeType: "calculation",
            value: line9Subtractions,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "North Carolina Schedule PN Part B line 20, Column B from explicit override or allocation-profile ratio",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN North Carolina deductions from adjusted gross income",
            lineCode: "schedule_pn.line20b",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line20b",
            nodeType: "calculation",
            value: schedulePnLine20AllocatedSubtractions,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "max(line16a + line18a - line20a, 0)",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN full-year income after additions and deductions",
            lineCode: "schedule_pn.line21a",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line21a",
            nodeType: "calculation",
            value: schedulePnLine21FullYearIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "max(line16b + line18b - line20b, 0)",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina Schedule PN income subject to North Carolina tax",
            lineCode: "schedule_pn.line21b",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.schedule_pn.line21b",
            nodeType: "calculation",
            value: schedulePnLine21AllocatedIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "North Carolina Schedule PN Part B line 24",
            jurisdiction: NORTH_CAROLINA_STATE_CODE,
            label: "North Carolina taxable income percentage",
            lineCode: "line13",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "nc.d400.line13",
            nodeType: "calculation",
            value: line13TaxablePercentage?.toFixed(4) ?? "0.0000",
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line15 + line16 - line18, 0)",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina total tax",
      lineCode: "line19",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line19",
      nodeType: "summary",
      value: line19TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina total payments",
      lineCode: "line21",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.d400.line21",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "d400.line14",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.summary.taxable_income",
      nodeType: "summary",
      value: line14NorthCarolinaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "d400.line19",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.summary.total_tax",
      nodeType: "summary",
      value: line19TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "d400.line21",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line21 - line19, 0)",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line19 - line21, 0)",
      jurisdiction: NORTH_CAROLINA_STATE_CODE,
      label: "North Carolina amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nc.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.nc.starting_point", "carryforward"),
    createStateEdge("bridge.nc.starting_point", "nc.d400.line12b"),
    createStateEdge("nc.d400.line7", "nc.d400.line12b"),
    createStateEdge("nc.d400.line9", "nc.d400.line12b"),
    createStateEdge("nc.d400.line10", "nc.d400.line12b"),
    createStateEdge("nc.d400.line11", "nc.d400.line12b"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("nc.schedule_pn.line16a", "nc.schedule_pn.line21a"),
          createStateEdge("nc.schedule_pn.line18a", "nc.schedule_pn.line21a"),
          createStateEdge("nc.schedule_pn.line20a", "nc.schedule_pn.line21a"),
          createStateEdge("nc.schedule_pn.line16b", "nc.schedule_pn.line21b"),
          createStateEdge("nc.schedule_pn.line18b", "nc.schedule_pn.line21b"),
          createStateEdge("nc.schedule_pn.line20b", "nc.schedule_pn.line21b"),
          createStateEdge("nc.schedule_pn.line21a", "nc.d400.line13"),
          createStateEdge("nc.schedule_pn.line21b", "nc.d400.line13"),
          createStateEdge("nc.d400.line13", "nc.d400.line14"),
        ]
      : []),
    createStateEdge("nc.d400.line12b", "nc.d400.line14"),
    createStateEdge("nc.d400.line14", "nc.d400.line15"),
    createStateEdge("nc.d400.line15", "nc.d400.line19"),
    createStateEdge("nc.d400.line19", "nc.summary.total_tax"),
    createStateEdge("nc.d400.line21", "nc.summary.total_payments"),
  ];

  const validationResults = [];

  if (args.input.household.dependents.length > 0 && asNumber(formRecord?.child_deduction_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Carolina child deduction stayed at zero because no separate child-deduction amount was supplied on this path.",
        nodeIds: ["nc.d400.line10"],
        ruleId: "NC.child_deduction_not_claimed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    filingStatus === "married_filing_separately" &&
    asBoolean(formRecord?.spouse_itemized_federal) === true &&
    asNumber(formRecord?.itemized_deductions_total) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Carolina married-filing-separately spouse-itemized handling kept the North Carolina deduction at zero because no North Carolina itemized deduction total was supplied.",
        nodeIds: ["nc.d400.line11"],
        ruleId: "NC.mfs_itemized_deduction_zero_used",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Carolina Schedule PN applied the line 24 taxable percentage to full-year North Carolina taxable income so part-year and nonresident tax follows the official allocated-income path.",
        nodeIds: ["nc.d400.line13", "nc.d400.line14"],
        ruleId: "NC.schedule_pn_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line7Additions !== 0 || line9Subtractions !== 0) &&
    (asNumber(formRecord?.schedule_pn_additions_total) == null ||
      asNumber(formRecord?.schedule_pn_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Carolina Schedule PN column B additions or deductions were not supplied explicitly, so the engine allocated those modifications using the state allocation profile ratio.",
        nodeIds: ["nc.schedule_pn.line18b", "nc.schedule_pn.line20b"],
        ruleId: "NC.schedule_pn_modifications_allocated_by_ratio",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (hasPotentialNorthCarolinaOtherStateCreditInputs(args)) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Carolina credit for tax paid to another state stayed at zero because no North Carolina credit claim amount was supplied as a state-specific or plugin credit.",
        nodeIds: ["nc.d400.line19"],
        ruleId: "NC.other_state_credit_review",
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
