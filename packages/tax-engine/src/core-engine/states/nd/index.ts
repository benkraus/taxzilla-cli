import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
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

const NORTH_DAKOTA_STATE_CODE = "ND";
const NORTH_DAKOTA_STATE_NAME = "North Dakota";
const NORTH_DAKOTA_FORM_RECORD_KEY = "nd1";

function calculateNorthDakotaFederalTaxableIncome(args: {
  readonly adjustedGrossIncome: number;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
}): number {
  return toWholeDollars(
    asNumber(args.formRecord?.federal_taxable_income_amount) ??
      asNumber(args.formRecord?.federal_form_1040_line15_amount) ??
      args.federalSummary?.line15_taxable_income ??
      Math.max(args.adjustedGrossIncome - getFederalDeductionBase(args.federalSummary, args.filingStatus), 0),
  );
}

function calculateNorthDakotaOtherStateCredit(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly northDakotaTax: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.income_tax_paid_to_another_state_credit) ??
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  const northDakotaAdjustedGrossIncome = Math.max(toWholeDollars(args.adjustedGrossIncome), 0);

  if (northDakotaAdjustedGrossIncome <= 0 || args.northDakotaTax <= 0) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === NORTH_DAKOTA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const ratio = Math.max(
          Math.min(claim.income_amount / northDakotaAdjustedGrossIncome, 1),
          0,
        );
        const northDakotaTaxOnClaimedIncome = toWholeDollars(args.northDakotaTax * ratio);
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, northDakotaTaxOnClaimedIncome);
      }, 0),
  );
}

function calculateNorthDakotaTax(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly taxableIncome: number;
}): number {
  const taxableIncome = args.taxableIncome;

  if (taxableIncome <= 0) {
    return 0;
  }

  const filingStatus =
    args.filingStatus === "married_filing_jointly" || args.filingStatus === "qualifying_surviving_spouse"
      ? "joint"
      : args.filingStatus === "head_of_household"
        ? "head_of_household"
        : "single";

  if (filingStatus === "joint") {
    if (taxableIncome <= 80_650) {
      return toWholeDollars(taxableIncome * 0.0195);
    }

    if (taxableIncome <= 196_700) {
      return toWholeDollars(1_572.68 + (taxableIncome - 80_650) * 0.022);
    }

    if (taxableIncome <= 250_000) {
      return toWholeDollars(4_125.78 + (taxableIncome - 196_700) * 0.0264);
    }

    if (taxableIncome <= 533_400) {
      return toWholeDollars(5_532.98 + (taxableIncome - 250_000) * 0.029);
    }

    return toWholeDollars(13_751.58 + (taxableIncome - 533_400) * 0.025);
  }

  if (filingStatus === "head_of_household") {
    if (taxableIncome <= 54_000) {
      return toWholeDollars(taxableIncome * 0.0195);
    }

    if (taxableIncome <= 139_400) {
      return toWholeDollars(1_053 + (taxableIncome - 54_000) * 0.022);
    }

    if (taxableIncome <= 250_000) {
      return toWholeDollars(2_931.8 + (taxableIncome - 139_400) * 0.0264);
    }

    if (taxableIncome <= 533_400) {
      return toWholeDollars(5_851.64 + (taxableIncome - 250_000) * 0.029);
    }

    return toWholeDollars(14_070.24 + (taxableIncome - 533_400) * 0.025);
  }

  if (taxableIncome <= 48_350) {
    return toWholeDollars(taxableIncome * 0.0195);
  }

  if (taxableIncome <= 117_850) {
    return toWholeDollars(942.83 + (taxableIncome - 48_350) * 0.022);
  }

  if (taxableIncome <= 245_950) {
    return toWholeDollars(2_471.83 + (taxableIncome - 117_850) * 0.0264);
  }

  if (taxableIncome <= 533_400) {
    return toWholeDollars(5_853.27 + (taxableIncome - 245_950) * 0.029);
  }

  return toWholeDollars(14_189.32 + (taxableIncome - 533_400) * 0.025);
}

function hasPotentialNorthDakotaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === NORTH_DAKOTA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== NORTH_DAKOTA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== NORTH_DAKOTA_STATE_CODE &&
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
      stateName: NORTH_DAKOTA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NORTH_DAKOTA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalTaxableIncome = calculateNorthDakotaFederalTaxableIncome({
    adjustedGrossIncome: args.adjustedGrossIncome,
    federalSummary: args.federalSummary,
    filingStatus,
    formRecord,
  });
  const line3Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line6Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line7NorthDakotaTaxableIncome = Math.max(
    line1FederalTaxableIncome + line3Additions - line6Subtractions,
    0,
  );
  const line8Tax = asNumber(formRecord?.income_tax_amount) ?? calculateNorthDakotaTax({
    filingStatus,
    taxableIncome: line7NorthDakotaTaxableIncome,
  });
  const line9OtherStateCredit = calculateNorthDakotaOtherStateCredit({
    adjustedGrossIncome: args.adjustedGrossIncome,
    formRecord,
    northDakotaTax: line8Tax,
    stateArtifactsArgs: args,
  });
  const line10OtherCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line11OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line12TotalTax = Math.max(line8Tax + line11OtherTaxes - line9OtherStateCredit - line10OtherCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: NORTH_DAKOTA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line12TotalTax - payments.totalPayments, 0),
    startingPoint: line1FederalTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line7NorthDakotaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line12TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line15 rounded to North Dakota whole-dollar rules",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota Form ND-1 federal taxable income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.nd.starting_point",
      nodeType: "bridge",
      value: line1FederalTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.nd1.additions",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota additions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line3",
      nodeType: "calculation",
      value: line3Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.nd1.subtractions",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota subtractions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line6",
      nodeType: "calculation",
      value: line6Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line3 - line6, 0)",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line7",
      nodeType: "calculation",
      value: line7NorthDakotaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "ND-1 tax rate schedules or plugin_fact_bag.nd1.income_tax_amount",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota income tax before credits",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line8",
      nodeType: "calculation",
      value: line8Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "North Dakota Schedule ND-1CR resident credit computation or explicit override",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota credit for income tax paid to another state",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line9",
      nodeType: "calculation",
      value: line9OtherStateCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 + line11 - line9 - line10, 0)",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota total tax",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line12",
      nodeType: "summary",
      value: line12TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota total payments",
      lineCode: "line22",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.nd1.line22",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "nd1.line7",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.summary.taxable_income",
      nodeType: "summary",
      value: line7NorthDakotaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "nd1.line12",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.summary.total_tax",
      nodeType: "summary",
      value: line12TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "nd1.line22",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line22 - line12, 0)",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line12 - line22, 0)",
      jurisdiction: NORTH_DAKOTA_STATE_CODE,
      label: "North Dakota amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "nd.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line15", "bridge.nd.starting_point", "carryforward"),
    createStateEdge("bridge.nd.starting_point", "nd.nd1.line7"),
    createStateEdge("nd.nd1.line3", "nd.nd1.line7"),
    createStateEdge("nd.nd1.line6", "nd.nd1.line7"),
    createStateEdge("nd.nd1.line7", "nd.nd1.line8"),
    createStateEdge("nd.nd1.line8", "nd.nd1.line12"),
    createStateEdge("nd.nd1.line9", "nd.nd1.line12"),
    createStateEdge("nd.nd1.line12", "nd.summary.total_tax"),
    createStateEdge("nd.nd1.line22", "nd.summary.total_payments"),
  ];

  const validationResults = [];

  if (
    args.federalSummary == null &&
    asNumber(formRecord?.federal_taxable_income_amount) == null &&
    asNumber(formRecord?.federal_form_1040_line15_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Dakota federal taxable income was estimated from adjusted gross income minus the federal deduction base because no explicit TY2025 line 15 amount or federal summary was supplied.",
        nodeIds: ["bridge.nd.starting_point"],
        ruleId: "ND.federal_taxable_income_estimated_from_agi",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    args.input.requested_jurisdictions.states.some(
      (stateCode) => stateCode !== NORTH_DAKOTA_STATE_CODE && stateCode !== "",
    ) &&
    line9OtherStateCredit === 0 &&
    (args.input.facts.state?.other_state_tax_credit_claims ?? []).filter(
      (claim) => claim.resident_state_code === NORTH_DAKOTA_STATE_CODE,
    ).length === 0 &&
    hasPotentialNorthDakotaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "North Dakota credit for income tax paid to another state stayed at zero because no ND-1TC style claim amount was supplied for the available multistate facts.",
        nodeIds: ["nd.nd1.line9"],
        ruleId: "ND.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  return {
    edges,
    nodes,
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
