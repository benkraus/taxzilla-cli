import { asNumber, asString } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../../return-kind";
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
} from "../../resident";

const WEST_VIRGINIA_STATE_CODE = "WV";
const WEST_VIRGINIA_STATE_NAME = "West Virginia";
const WEST_VIRGINIA_FORM_RECORD_KEY = "it140";
const WEST_VIRGINIA_EXEMPTION_AMOUNT = 2_000;
const WEST_VIRGINIA_NO_EXEMPTION_MINIMUM = 500;

function roundWestVirginiaPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateWestVirginiaTax(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
  taxableIncome: number,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (filingStatus === "married_filing_separately") {
    if (taxableIncome < 5_000) {
      return toWholeDollars(taxableIncome * 0.0222);
    }

    if (taxableIncome < 12_500) {
      return toWholeDollars(111 + (taxableIncome - 5_000) * 0.0296);
    }

    if (taxableIncome < 20_000) {
      return toWholeDollars(333 + (taxableIncome - 12_500) * 0.0333);
    }

    if (taxableIncome < 30_000) {
      return toWholeDollars(582.75 + (taxableIncome - 20_000) * 0.0444);
    }

    return toWholeDollars(1_026.75 + (taxableIncome - 30_000) * 0.0482);
  }

  if (taxableIncome < 10_000) {
    return toWholeDollars(taxableIncome * 0.0222);
  }

  if (taxableIncome < 25_000) {
    return toWholeDollars(222 + (taxableIncome - 10_000) * 0.0296);
  }

  if (taxableIncome < 40_000) {
    return toWholeDollars(666 + (taxableIncome - 25_000) * 0.0333);
  }

  if (taxableIncome < 60_000) {
    return toWholeDollars(1_165.5 + (taxableIncome - 40_000) * 0.0444);
  }

  return toWholeDollars(2_053.5 + (taxableIncome - 60_000) * 0.0482);
}

function calculateWestVirginiaOtherStateCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly westVirginiaTaxBeforeCredits: number;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind !== "resident" ||
    args.adjustedGrossIncome <= 0 ||
    args.westVirginiaTaxBeforeCredits <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === WEST_VIRGINIA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const ratio = Math.max(Math.min(claim.income_amount / args.adjustedGrossIncome, 1), 0);
        const westVirginiaCreditLimit = toWholeDollars(args.westVirginiaTaxBeforeCredits * ratio);
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, westVirginiaCreditLimit);
      }, 0),
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: WEST_VIRGINIA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, WEST_VIRGINIA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const westVirginiaTaxedIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : fullYearFederalAdjustedGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? westVirginiaTaxedIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line1FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line4WestVirginiaAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const scheduleALine2WestVirginiaIncome = isAllocatedReturn
    ? Math.max(
        westVirginiaTaxedIncome +
          toWholeDollars(
            asNumber(formRecord?.schedule_a_additions_total) ??
              line2Additions * Math.max(allocationRatio ?? 0, 0),
          ) -
          toWholeDollars(
            asNumber(formRecord?.schedule_a_subtractions_total) ??
              line3Subtractions * Math.max(allocationRatio ?? 0, 0),
          ),
        0,
      )
    : line4WestVirginiaAdjustedGrossIncome;
  const line5LowIncomeExclusion = toWholeDollars(
    asNumber(formRecord?.low_income_earned_income_exclusion_amount) ?? 0,
  );
  const exemptionCount =
    countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input);
  const line6Exemptions = toWholeDollars(
    asNumber(formRecord?.exemption_deduction_amount) ??
      (exemptionCount > 0
        ? exemptionCount * WEST_VIRGINIA_EXEMPTION_AMOUNT
        : WEST_VIRGINIA_NO_EXEMPTION_MINIMUM),
  );
  const line7WestVirginiaTaxableIncome = Math.max(
    line4WestVirginiaAdjustedGrossIncome - line5LowIncomeExclusion - line6Exemptions,
    0,
  );
  const scheduleALine3AllocationPercentage =
    isAllocatedReturn && line1FederalAdjustedGrossIncome > 0 && scheduleALine2WestVirginiaIncome > 0
      ? roundWestVirginiaPercentage(scheduleALine2WestVirginiaIncome / line1FederalAdjustedGrossIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const fullYearLine8IncomeTaxDue =
    asNumber(formRecord?.income_tax_amount) ??
    calculateWestVirginiaTax(filingStatus, line7WestVirginiaTaxableIncome);
  const line8IncomeTaxDue =
    scheduleALine3AllocationPercentage == null
      ? fullYearLine8IncomeTaxDue
      : toWholeDollars(fullYearLine8IncomeTaxDue * scheduleALine3AllocationPercentage);
  const familyTaxCredit = toWholeDollars(asNumber(formRecord?.family_tax_credit_amount) ?? 0);
  const otherStateCredit = calculateWestVirginiaOtherStateCredit({
    adjustedGrossIncome: line4WestVirginiaAdjustedGrossIncome,
    formRecord,
    stateArtifactsArgs: args,
    westVirginiaTaxBeforeCredits: line8IncomeTaxDue,
  });
  const line9Credits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + familyTaxCredit + otherStateCredit,
  );
  const line10IncomeTaxAfterCredits = Math.max(line8IncomeTaxDue - line9Credits, 0);
  const line12Penalty = toWholeDollars(asNumber(formRecord?.penalty_amount) ?? 0);
  const line13UseTax = toWholeDollars(asNumber(formRecord?.use_tax_amount) ?? 0);
  const line14TotalTax = line10IncomeTaxAfterCredits + line12Penalty + line13UseTax;
  const refundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) +
      (asNumber(formRecord?.senior_citizen_tax_credit_amount) ?? 0) +
      (asNumber(formRecord?.homestead_excess_property_tax_credit_amount) ?? 0) +
      (asNumber(formRecord?.build_wv_property_value_adjustment_credit_amount) ?? 0),
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: WEST_VIRGINIA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line14TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? scheduleALine2WestVirginiaIncome : line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome:
      scheduleALine3AllocationPercentage == null
        ? line7WestVirginiaTaxableIncome
        : toWholeDollars(line7WestVirginiaTaxableIncome * scheduleALine3AllocationPercentage),
    totalPayments: payments.totalPayments,
    totalTax: line14TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: scheduleALine2WestVirginiaIncome,
        allocation_ratio: scheduleALine3AllocationPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to West Virginia whole-dollar rules",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia IT-140 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.wv.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.it140.additions",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.it140.subtractions",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3, 0)",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia adjusted gross income",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line4",
      nodeType: "calculation",
      value: line4WestVirginiaAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "plugin_fact_bag.it140.low_income_earned_income_exclusion_amount",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia low-income earned income exclusion",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line5",
      nodeType: "calculation",
      value: line5LowIncomeExclusion,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "West Virginia exemption deduction worksheet or override",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia exemptions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line6",
      nodeType: "calculation",
      value: line6Exemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line4 - line5 - line6, 0)",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line7",
      nodeType: "calculation",
      value: line7WestVirginiaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "West Virginia tax rate schedule or explicit override",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia income tax due",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line8",
      nodeType: "calculation",
      value: line8IncomeTaxDue,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 - line9, 0)",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia income tax after credits",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line10",
      nodeType: "calculation",
      value: line10IncomeTaxAfterCredits,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line10 + line12 + line13",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia total tax",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line14",
      nodeType: "summary",
      value: line14TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia total payments",
      lineCode: "line23",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.it140.line23",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        scheduleALine3AllocationPercentage == null
          ? "it140.line7"
          : "it140.line7 * schedule_a.line3",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.summary.taxable_income",
      nodeType: "summary",
      value: summaryWithAllocatedOverrides.taxable_income,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it140.line14",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.summary.total_tax",
      nodeType: "summary",
      value: line14TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "it140.line23",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "wv.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line23 - line14, 0)",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wv.summary.refund_amount",
        nodeType: "summary",
      value: summaryWithAllocatedOverrides.refund_amount,
    }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line14 - line23, 0)",
      jurisdiction: WEST_VIRGINIA_STATE_CODE,
      label: "West Virginia amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wv.summary.amount_owed",
        nodeType: "summary",
      value: summaryWithAllocatedOverrides.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.wv.starting_point", "carryforward"),
    createStateEdge("bridge.wv.starting_point", "wv.it140.line4"),
    createStateEdge("wv.it140.line2", "wv.it140.line4"),
    createStateEdge("wv.it140.line3", "wv.it140.line4"),
    createStateEdge("wv.it140.line4", "wv.it140.line7"),
    createStateEdge("wv.it140.line5", "wv.it140.line7"),
    createStateEdge("wv.it140.line6", "wv.it140.line7"),
    createStateEdge("wv.it140.line7", "wv.it140.line8"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("wv.schedule_a.line2", "wv.schedule_a.line3"),
          createStateEdge("bridge.wv.starting_point", "wv.schedule_a.line3"),
          createStateEdge("wv.schedule_a.line3", "wv.it140.line8"),
        ]
      : []),
    createStateEdge("wv.it140.line8", "wv.it140.line10"),
    createStateEdge("wv.it140.line10", "wv.it140.line14"),
    createStateEdge("wv.it140.line14", "wv.summary.total_tax"),
    createStateEdge("wv.it140.line23", "wv.summary.total_payments"),
  ];

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (line4WestVirginiaAdjustedGrossIncome <= 10_000 && line5LowIncomeExclusion === 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "West Virginia low-income earned income exclusion stayed at zero because no low-income exclusion amount was separately claimed on this path.",
        nodeIds: ["wv.it140.line5"],
        ruleId: "WV.low_income_exclusion_not_claimed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (line4WestVirginiaAdjustedGrossIncome <= 60_000 && familyTaxCredit === 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "West Virginia family tax credit stayed at zero because no family-credit table result was separately claimed on this path.",
        nodeIds: ["wv.it140.line10"],
        ruleId: "WV.family_tax_credit_not_claimed",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    args.input.requested_jurisdictions.states.length > 1 &&
    otherStateCredit === 0 &&
    !args.stateReturn.state_specific_credits.some(
      (credit) => asString(credit.description)?.toLowerCase().includes("other state"),
    )
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "West Virginia credit for tax paid to another state stayed at zero because no structured claim amount was supplied for the available multistate facts.",
        nodeIds: ["wv.it140.line10"],
        ruleId: "WV.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "West Virginia IT-140NRC allocation was applied by multiplying full-year West Virginia tax by the ratio of West Virginia income to federal income.",
        nodeIds: ["wv.schedule_a.line2", "wv.schedule_a.line3", "wv.it140.line8"],
        ruleId: "WV.it140nrc_ratio_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line2Additions !== 0 || line3Subtractions !== 0) &&
    (asNumber(formRecord?.schedule_a_additions_total) == null ||
      asNumber(formRecord?.schedule_a_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "West Virginia Schedule A additions or subtractions were not supplied explicitly, so the engine apportioned those modifications using the state allocation profile ratio.",
        nodeIds: ["wv.schedule_a.line2", "wv.schedule_a.line3"],
        ruleId: "WV.it140nrc_modifications_allocated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges,
    nodes: [
      ...nodes,
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "West Virginia IT-140NRC Schedule A line 2 West Virginia income",
              jurisdiction: WEST_VIRGINIA_STATE_CODE,
              label: "West Virginia Schedule A West Virginia income",
              lineCode: "schedule_a.line2",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "wv.schedule_a.line2",
              nodeType: "calculation",
              value: scheduleALine2WestVirginiaIncome,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "West Virginia IT-140NRC Schedule A line 3 ratio",
              jurisdiction: WEST_VIRGINIA_STATE_CODE,
              label: "West Virginia Schedule A allocation ratio",
              lineCode: "schedule_a.line3",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "wv.schedule_a.line3",
              nodeType: "calculation",
              value: scheduleALine3AllocationPercentage?.toFixed(4) ?? "0.0000",
            }),
          ]
        : []),
    ],
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
