import { asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
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

const SOUTH_CAROLINA_STATE_CODE = "SC";
const SOUTH_CAROLINA_STATE_NAME = "South Carolina";
const SOUTH_CAROLINA_FORM_RECORD_KEY = "sc1040";
const SOUTH_CAROLINA_DEPENDENT_EXEMPTION_AMOUNT = 4_930;

function roundSouthCarolinaScheduleNrRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateSouthCarolinaTax(incomeSubjectToTax: number): number {
  if (incomeSubjectToTax < 3_550) {
    return 0;
  }

  if (incomeSubjectToTax < 7_000) {
    const bucketStart = Math.floor(incomeSubjectToTax / 50) * 50;
    return toWholeDollars(Math.round((bucketStart - 3_550) * 0.03));
  }

  if (incomeSubjectToTax < 17_900) {
    const bucketStart = Math.floor(incomeSubjectToTax / 100) * 100;
    return 105 + ((bucketStart - 7_000) / 100) * 3;
  }

  if (incomeSubjectToTax < 100_000) {
    const bucketStart = Math.floor(incomeSubjectToTax / 100) * 100;
    return 435 + ((bucketStart - 17_900) / 100) * 6;
  }

  return toWholeDollars(incomeSubjectToTax * 0.06 - 642);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: SOUTH_CAROLINA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, SOUTH_CAROLINA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const southCarolinaAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : fullYearFederalAdjustedGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? southCarolinaAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line1FederalTaxableIncome = Math.max(
    toWholeDollars(
      asNumber(formRecord?.federal_taxable_income_amount) ??
        fullYearFederalSummary?.line15_taxable_income ??
        0,
    ),
    0,
  );
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const lineWDependentExemption = toWholeDollars(
    asNumber(formRecord?.dependent_exemption_amount) ??
      countDependentExemptions(args.input) * SOUTH_CAROLINA_DEPENDENT_EXEMPTION_AMOUNT,
  );
  const line4Subtractions =
    sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)) +
    lineWDependentExemption;
  const scheduleNrLine32SouthCarolinaAdditions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_nr_additions_total) ??
          line2Additions * Math.max(allocationRatio ?? 0, 0),
      )
    : line2Additions;
  const scheduleNrLine42SouthCarolinaSubtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.schedule_nr_subtractions_total) ??
          line4Subtractions * Math.max(allocationRatio ?? 0, 0),
      )
    : line4Subtractions;
  const line43TotalSouthCarolinaAdjustments =
    scheduleNrLine32SouthCarolinaAdditions - scheduleNrLine42SouthCarolinaSubtractions;
  const line44SouthCarolinaModifiedAdjustedGrossIncome = isAllocatedReturn
    ? Math.max(southCarolinaAdjustedGrossIncome + line43TotalSouthCarolinaAdjustments, 0)
    : null;
  const line45ScheduleNrRatio =
    isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0 && southCarolinaAdjustedGrossIncome > 0
      ? roundSouthCarolinaScheduleNrRatio(
          southCarolinaAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome,
        )
      : isAllocatedReturn
        ? 0
        : null;
  const line46DeductionAdjustment = toWholeDollars(
    asNumber(formRecord?.deduction_adjustment_amount) ??
      getFederalDeductionBase(fullYearFederalSummary, filingStatus),
  );
  const line47ScheduleNrAllowableDeductions =
    line45ScheduleNrRatio == null
      ? line46DeductionAdjustment
      : toWholeDollars(line46DeductionAdjustment * line45ScheduleNrRatio);
  const line5IncomeSubjectToTax =
    line44SouthCarolinaModifiedAdjustedGrossIncome == null
      ? Math.max(line1FederalTaxableIncome + line2Additions - line4Subtractions, 0)
      : Math.max(line44SouthCarolinaModifiedAdjustedGrossIncome - line47ScheduleNrAllowableDeductions, 0);
  const line6Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateSouthCarolinaTax(line5IncomeSubjectToTax),
  );
  const line12Credits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line15TotalTax = Math.max(line6Tax - line12Credits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: SOUTH_CAROLINA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line15TotalTax - payments.totalPayments, 0),
    startingPoint:
      line44SouthCarolinaModifiedAdjustedGrossIncome ?? line1FederalTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line5IncomeSubjectToTax,
    totalPayments: payments.totalPayments,
    totalTax: line15TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point:
          line44SouthCarolinaModifiedAdjustedGrossIncome ?? summary.adjusted_gross_income_or_starting_point,
        allocation_ratio: line45ScheduleNrRatio ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "South Carolina Schedule NR proration was applied using Schedule NR ratio, Schedule NR deduction adjustment, and South Carolina income subject to tax.",
        nodeIds: [
          "sc.schedule_nr.line31a",
          "sc.schedule_nr.line31b",
          "sc.schedule_nr.line45",
          "sc.schedule_nr.line47",
          "sc.sc1040.line5",
        ],
        ruleId: "SC.schedule_nr_proration_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line2Additions !== 0 || line4Subtractions !== 0) &&
    (asNumber(formRecord?.schedule_nr_additions_total) == null ||
      asNumber(formRecord?.schedule_nr_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "South Carolina Schedule NR additions or subtractions were not supplied explicitly, so the engine apportioned those adjustments using the state allocation profile ratio.",
        nodeIds: [
          "sc.schedule_nr.line32",
          "sc.schedule_nr.line42",
          "sc.schedule_nr.line45",
        ],
        ruleId: "SC.schedule_nr_adjustments_allocated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    fullYearFederalSummary?.deduction_strategy === "itemized" &&
    asNumber(formRecord?.deduction_adjustment_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "South Carolina Schedule NR itemized deduction adjustment was not supplied, so the engine used the federal itemized deduction total as the Schedule NR line 46 proxy.",
        nodeIds: ["sc.schedule_nr.line46", "sc.schedule_nr.line47"],
        ruleId: "SC.schedule_nr_itemized_deduction_proxy",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line15", "bridge.sc.starting_point", "carryforward"),
      createStateEdge("bridge.sc.starting_point", "sc.sc1040.line5"),
      ...(isAllocatedReturn
        ? [
            createStateEdge("sc.schedule_nr.line31a", "sc.schedule_nr.line45"),
            createStateEdge("sc.schedule_nr.line31b", "sc.schedule_nr.line45"),
            createStateEdge("sc.schedule_nr.line32", "sc.schedule_nr.line43"),
            createStateEdge("sc.schedule_nr.line42", "sc.schedule_nr.line43"),
            createStateEdge("sc.schedule_nr.line43", "sc.schedule_nr.line44"),
            createStateEdge("sc.schedule_nr.line45", "sc.schedule_nr.line47"),
            createStateEdge("sc.schedule_nr.line46", "sc.schedule_nr.line47"),
            createStateEdge("sc.schedule_nr.line44", "sc.sc1040.line5"),
            createStateEdge("sc.schedule_nr.line47", "sc.sc1040.line5"),
          ]
        : []),
      createStateEdge("sc.sc1040.line5", "sc.sc1040.line6"),
      createStateEdge("sc.sc1040.line6", "sc.summary.total_tax"),
      createStateEdge("sc.sc1040.line23", "sc.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line15 federal taxable income",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "Federal taxable income for South Carolina",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.sc.starting_point",
        nodeType: "bridge",
        value: line1FederalTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "South Carolina additions common path",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina additions",
        lineCode: "line2",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line2",
        nodeType: "calculation",
        value: line2Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$4,930 per dependent unless overridden",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina dependent exemption",
        lineCode: "linew",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.linew",
        nodeType: "calculation",
        value: lineWDependentExemption,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "South Carolina subtractions plus line w dependent exemption",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina total subtractions",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line4",
        nodeType: "calculation",
        value: line4Subtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          line44SouthCarolinaModifiedAdjustedGrossIncome == null
            ? "max(line1 + line2 - line4, 0)"
            : "max(schedule_nr.line44 - schedule_nr.line47, 0)",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina income subject to tax",
        lineCode: "line5",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line5",
        nodeType: "calculation",
        value: line5IncomeSubjectToTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "2025 South Carolina SC1040TT table or tax rate schedule",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina tax on taxable income",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line6",
        nodeType: "calculation",
        value: line6Tax,
      }),
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "South Carolina Schedule NR line 31, Column A federal adjusted gross income",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR federal adjusted gross income",
              lineCode: "schedule_nr.line31a",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line31a",
              nodeType: "calculation",
              value: fullYearFederalAdjustedGrossIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef:
                "South Carolina Schedule NR line 31, Column B South Carolina adjusted gross income",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR South Carolina adjusted gross income",
              lineCode: "schedule_nr.line31b",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line31b",
              nodeType: "calculation",
              value: southCarolinaAdjustedGrossIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef:
                "South Carolina Schedule NR line 32 South Carolina additions from explicit override or allocation-profile ratio",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR South Carolina additions",
              lineCode: "schedule_nr.line32",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line32",
              nodeType: "calculation",
              value: scheduleNrLine32SouthCarolinaAdditions,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef:
                "South Carolina Schedule NR line 42 South Carolina subtractions from explicit override or allocation-profile ratio",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR South Carolina subtractions",
              lineCode: "schedule_nr.line42",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line42",
              nodeType: "calculation",
              value: scheduleNrLine42SouthCarolinaSubtractions,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule NR line 32 minus line 42",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR total South Carolina adjustments",
              lineCode: "schedule_nr.line43",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line43",
              nodeType: "calculation",
              value: line43TotalSouthCarolinaAdjustments,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule NR line 31, Column B plus line 43",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR South Carolina modified adjusted gross income",
              lineCode: "schedule_nr.line44",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line44",
              nodeType: "calculation",
              value: line44SouthCarolinaModifiedAdjustedGrossIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule NR line 31, Column B divided by line 31, Column A",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR ratio",
              lineCode: "schedule_nr.line45",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line45",
              nodeType: "calculation",
              value: line45ScheduleNrRatio?.toFixed(4) ?? "0.0000",
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "South Carolina Schedule NR line 46 deduction adjustment",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR deduction adjustment",
              lineCode: "schedule_nr.line46",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line46",
              nodeType: "calculation",
              value: line46DeductionAdjustment,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: line45ScheduleNrRatio == null ? "line46" : "line46 * line45",
              jurisdiction: SOUTH_CAROLINA_STATE_CODE,
              label: "South Carolina Schedule NR allowable deductions",
              lineCode: "schedule_nr.line47",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "sc.schedule_nr.line47",
              nodeType: "calculation",
              value: line47ScheduleNrAllowableDeductions,
            }),
          ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "South Carolina nonrefundable credits common path",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina credits",
        lineCode: "line12",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line12",
        nodeType: "calculation",
        value: line12Credits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line6 - line12, 0)",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina total tax",
        lineCode: "line15",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line15",
        nodeType: "summary",
        value: line15TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina total payments",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.sc1040.line23",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "sc1040.line5",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.summary.taxable_income",
        nodeType: "summary",
        value: line5IncomeSubjectToTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "sc1040.line15",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.summary.total_tax",
        nodeType: "summary",
        value: line15TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "sc1040.line23",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.refund_amount",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina summary refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.summary.refund_amount",
        nodeType: "summary",
        value: summaryWithAllocatedOverrides.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.amount_owed",
        jurisdiction: SOUTH_CAROLINA_STATE_CODE,
        label: "South Carolina summary amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "sc.summary.amount_owed",
        nodeType: "summary",
        value: summaryWithAllocatedOverrides.amount_owed,
      }),
    ],
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
