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

const CONNECTICUT_STATE_CODE = "CT";
const CONNECTICUT_STATE_NAME = "Connecticut";
const CONNECTICUT_FORM_RECORD_KEY = "ct1040";
const CONNECTICUT_PERSONAL_EXEMPTION_BY_FILING_STATUS = {
  head_of_household: 19_000,
  married_filing_jointly: 24_000,
  married_filing_separately: 12_000,
  qualifying_surviving_spouse: 24_000,
  single: 15_000,
} as const;
const CONNECTICUT_PROPERTY_TAX_CREDIT_PHASEOUT_BY_FILING_STATUS = {
  head_of_household: [
    [54_500, 0],
    [64_500, 0.15],
    [74_500, 0.3],
    [84_500, 0.45],
    [94_500, 0.6],
    [104_500, 0.75],
    [114_500, 0.9],
    [Number.POSITIVE_INFINITY, 1],
  ],
  married_filing_jointly: [
    [70_500, 0],
    [80_500, 0.15],
    [90_500, 0.3],
    [100_500, 0.45],
    [110_500, 0.6],
    [120_500, 0.75],
    [130_500, 0.9],
    [Number.POSITIVE_INFINITY, 1],
  ],
  married_filing_separately: [
    [35_250, 0],
    [40_250, 0.15],
    [45_250, 0.3],
    [50_250, 0.45],
    [55_250, 0.6],
    [60_250, 0.75],
    [65_250, 0.9],
    [Number.POSITIVE_INFINITY, 1],
  ],
  qualifying_surviving_spouse: [
    [70_500, 0],
    [80_500, 0.15],
    [90_500, 0.3],
    [100_500, 0.45],
    [110_500, 0.6],
    [120_500, 0.75],
    [130_500, 0.9],
    [Number.POSITIVE_INFINITY, 1],
  ],
  single: [
    [49_500, 0],
    [59_500, 0.15],
    [69_500, 0.3],
    [79_500, 0.45],
    [89_500, 0.6],
    [99_500, 0.75],
    [109_500, 0.9],
    [Number.POSITIVE_INFINITY, 1],
  ],
} as const;

type ConnecticutFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundConnecticutApportionmentPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateConnecticutPersonalExemption(args: {
  readonly connecticutAdjustedGrossIncome: number;
  readonly filingStatus: ConnecticutFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
}): number {
  const overrideAmount = asNumber(args.formRecord?.personal_exemption_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const baseExemption = CONNECTICUT_PERSONAL_EXEMPTION_BY_FILING_STATUS[args.filingStatus];

  if (args.connecticutAdjustedGrossIncome <= baseExemption) {
    return baseExemption;
  }

  const reductionSteps = Math.ceil((args.connecticutAdjustedGrossIncome - baseExemption) / 1_000);
  return Math.max(baseExemption - reductionSteps * 1_000, 0);
}

function calculateConnecticutTax(taxableIncome: number, filingStatus: ConnecticutFilingStatus): number {
  const thresholds: readonly [number, number, number, number, number, number] =
    filingStatus === "married_filing_jointly" || filingStatus === "qualifying_surviving_spouse"
      ? [20_000, 100_000, 200_000, 400_000, 500_000, 1_000_000]
      : filingStatus === "head_of_household"
        ? [16_000, 80_000, 160_000, 320_000, 400_000, 800_000]
        : [10_000, 50_000, 100_000, 200_000, 250_000, 500_000];

  if (taxableIncome <= thresholds[0]) {
    return toWholeDollars(taxableIncome * 0.03);
  }

  if (taxableIncome <= thresholds[1]) {
    return toWholeDollars(thresholds[0] * 0.03 + (taxableIncome - thresholds[0]) * 0.05);
  }

  if (taxableIncome <= thresholds[2]) {
    return toWholeDollars(
      thresholds[0] * 0.03 +
        (thresholds[1] - thresholds[0]) * 0.05 +
        (taxableIncome - thresholds[1]) * 0.055,
    );
  }

  if (taxableIncome <= thresholds[3]) {
    return toWholeDollars(
      thresholds[0] * 0.03 +
        (thresholds[1] - thresholds[0]) * 0.05 +
        (thresholds[2] - thresholds[1]) * 0.055 +
        (taxableIncome - thresholds[2]) * 0.06,
    );
  }

  if (taxableIncome <= thresholds[4]) {
    return toWholeDollars(
      thresholds[0] * 0.03 +
        (thresholds[1] - thresholds[0]) * 0.05 +
        (thresholds[2] - thresholds[1]) * 0.055 +
        (thresholds[3] - thresholds[2]) * 0.06 +
        (taxableIncome - thresholds[3]) * 0.065,
    );
  }

  if (taxableIncome <= thresholds[5]) {
    return toWholeDollars(
      thresholds[0] * 0.03 +
        (thresholds[1] - thresholds[0]) * 0.05 +
        (thresholds[2] - thresholds[1]) * 0.055 +
        (thresholds[3] - thresholds[2]) * 0.06 +
        (thresholds[4] - thresholds[3]) * 0.065 +
        (taxableIncome - thresholds[4]) * 0.069,
    );
  }

  return toWholeDollars(
    thresholds[0] * 0.03 +
      (thresholds[1] - thresholds[0]) * 0.05 +
      (thresholds[2] - thresholds[1]) * 0.055 +
      (thresholds[3] - thresholds[2]) * 0.06 +
      (thresholds[4] - thresholds[3]) * 0.065 +
      (thresholds[5] - thresholds[4]) * 0.069 +
      (taxableIncome - thresholds[5]) * 0.0699,
  );
}

function getConnecticutPropertyTaxCreditPhaseoutRate(args: {
  readonly connecticutAdjustedGrossIncome: number;
  readonly filingStatus: ConnecticutFilingStatus;
}): number {
  const row = CONNECTICUT_PROPERTY_TAX_CREDIT_PHASEOUT_BY_FILING_STATUS[args.filingStatus].find(
    ([upperBound]) => args.connecticutAdjustedGrossIncome <= upperBound,
  );

  return row?.[1] ?? 1;
}

function calculateConnecticutPropertyTaxCredit(args: {
  readonly connecticutAdjustedGrossIncome: number;
  readonly filingStatus: ConnecticutFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly taxBeforeCredits: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.property_tax_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const qualifyingPropertyTaxesPaid = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.property_tax_credit_base_amount) ??
        asNumber(args.formRecord?.property_taxes_paid_amount) ??
        ((args.input.facts.itemized_deductions.real_estate_taxes ?? 0) +
          (args.input.facts.itemized_deductions.personal_property_taxes ?? 0)),
    ),
    0,
  );
  const maximumCredit = Math.min(qualifyingPropertyTaxesPaid, 300);
  const phaseoutRate = getConnecticutPropertyTaxCreditPhaseoutRate({
    connecticutAdjustedGrossIncome: args.connecticutAdjustedGrossIncome,
    filingStatus: args.filingStatus,
  });
  const phasedCredit = Math.max(maximumCredit - toWholeDollars(maximumCredit * phaseoutRate), 0);

  return Math.min(phasedCredit, Math.max(args.taxBeforeCredits, 0));
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: CONNECTICUT_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, CONNECTICUT_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const connecticutSourceAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : fullYearFederalAdjustedGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? connecticutSourceAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line1FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const line4Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line6Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line7ConnecticutAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line4Additions - line6Subtractions,
    0,
  );
  const scheduleAwLine6IncomeSubjectToConnecticutTax = isAllocatedReturn
    ? Math.max(
        connecticutSourceAdjustedGrossIncome +
          toWholeDollars(
            asNumber(formRecord?.ct_source_additions_total) ??
              line4Additions * Math.max(allocationRatio ?? 0, 0),
          ) -
          toWholeDollars(
            asNumber(formRecord?.ct_source_subtractions_total) ??
              line6Subtractions * Math.max(allocationRatio ?? 0, 0),
          ),
        0,
      )
    : line7ConnecticutAdjustedGrossIncome;
  const line17PersonalExemption = calculateConnecticutPersonalExemption({
    connecticutAdjustedGrossIncome: line7ConnecticutAdjustedGrossIncome,
    filingStatus,
    formRecord,
  });
  const line10TaxableIncome = Math.max(
    line7ConnecticutAdjustedGrossIncome - line17PersonalExemption,
    0,
  );
  const scheduleAwLine7TaxCalculationBase =
    scheduleAwLine6IncomeSubjectToConnecticutTax > line10TaxableIncome
      ? scheduleAwLine6IncomeSubjectToConnecticutTax
      : line10TaxableIncome;
  const scheduleAwLine8Tax = toWholeDollars(
    asNumber(formRecord?.schedule_ct1040aw_tax_amount) ??
      calculateConnecticutTax(scheduleAwLine7TaxCalculationBase, filingStatus),
  );
  const scheduleAwLine9ApportionmentPercentage =
    isAllocatedReturn && scheduleAwLine7TaxCalculationBase > 0
      ? roundConnecticutApportionmentPercentage(
          scheduleAwLine6IncomeSubjectToConnecticutTax / scheduleAwLine7TaxCalculationBase,
        )
      : isAllocatedReturn
        ? 0
        : null;
  const line11Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ??
      (scheduleAwLine9ApportionmentPercentage == null
        ? calculateConnecticutTax(line10TaxableIncome, filingStatus)
        : scheduleAwLine8Tax * scheduleAwLine9ApportionmentPercentage),
  );
  const line21PropertyTaxCredit = calculateConnecticutPropertyTaxCredit({
    connecticutAdjustedGrossIncome: line7ConnecticutAdjustedGrossIncome,
    filingStatus,
    formRecord,
    input: args.input,
    taxBeforeCredits: line11Tax,
  });
  const line23OtherCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line24TotalTax = Math.max(line11Tax - line21PropertyTaxCredit - line23OtherCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: CONNECTICUT_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line24TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? scheduleAwLine6IncomeSubjectToConnecticutTax : line7ConnecticutAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome:
      scheduleAwLine9ApportionmentPercentage == null
        ? line10TaxableIncome
        : toWholeDollars(line10TaxableIncome * scheduleAwLine9ApportionmentPercentage),
    totalPayments: payments.totalPayments,
    totalTax: line24TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: scheduleAwLine6IncomeSubjectToConnecticutTax,
        allocation_ratio: scheduleAwLine9ApportionmentPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Connecticut Schedule CT-1040AW allocation was applied using income subject to Connecticut tax and the apportionment percentage before resident-line credits.",
        nodeIds: [
          "ct.schedule_ct1040aw.line6",
          "ct.schedule_ct1040aw.line7",
          "ct.schedule_ct1040aw.line9",
          "ct.ct1040.line11",
        ],
        ruleId: "CT.schedule_ct1040aw_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (line4Additions !== 0 || line6Subtractions !== 0) &&
    (asNumber(formRecord?.ct_source_additions_total) == null ||
      asNumber(formRecord?.ct_source_subtractions_total) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Connecticut source additions or subtractions were not supplied explicitly, so the engine apportioned those modifications using the state allocation profile ratio.",
        nodeIds: [
          "ct.schedule_ct1040aw.line6",
          "ct.schedule_ct1040aw.line9",
        ],
        ruleId: "CT.schedule_ct1040aw_modifications_allocated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.ct.starting_point", "carryforward"),
      createStateEdge("bridge.ct.starting_point", "ct.ct1040.line10"),
      createStateEdge("ct.ct1040.line10", "ct.ct1040.line11"),
      ...(isAllocatedReturn
        ? [
            createStateEdge("ct.schedule_ct1040aw.line6", "ct.schedule_ct1040aw.line7"),
            createStateEdge("ct.ct1040.line10", "ct.schedule_ct1040aw.line7"),
            createStateEdge("ct.schedule_ct1040aw.line7", "ct.schedule_ct1040aw.line8"),
            createStateEdge("ct.schedule_ct1040aw.line6", "ct.schedule_ct1040aw.line9"),
            createStateEdge("ct.schedule_ct1040aw.line7", "ct.schedule_ct1040aw.line9"),
            createStateEdge("ct.schedule_ct1040aw.line8", "ct.ct1040.line11"),
            createStateEdge("ct.schedule_ct1040aw.line9", "ct.ct1040.line11"),
          ]
        : []),
      createStateEdge("ct.ct1040.line11", "ct.ct1040.line24"),
      createStateEdge("ct.ct1040.line24", "ct.summary.total_tax"),
      createStateEdge("ct.ct1040.line27", "ct.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 rounded to Connecticut whole-dollar rules",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut federal adjusted gross income",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.ct.starting_point",
        nodeType: "bridge",
        value: line1FederalAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Connecticut additions common path",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut additions",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line4",
        nodeType: "calculation",
        value: line4Additions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Connecticut subtractions common path",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut subtractions",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line6",
        nodeType: "calculation",
        value: line6Subtractions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line1 + line4 - line6, 0)",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut adjusted gross income",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line7",
        nodeType: "calculation",
        value: line7ConnecticutAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Connecticut personal exemption common-path estimate or override",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut personal exemption",
        lineCode: "line17",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line17",
        nodeType: "calculation",
        value: line17PersonalExemption,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line7 - line17, 0)",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut taxable income",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line10",
        nodeType: "calculation",
        value: line10TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Connecticut resident marginal tax schedule or override",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut tax",
        lineCode: "line11",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line11",
        nodeType: "calculation",
        value: line11Tax,
      }),
      ...(isAllocatedReturn
        ? [
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule CT-1040AW line 6 income subject to Connecticut tax",
              jurisdiction: CONNECTICUT_STATE_CODE,
              label: "Connecticut income subject to Connecticut tax",
              lineCode: "schedule_ct1040aw.line6",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ct.schedule_ct1040aw.line6",
              nodeType: "calculation",
              value: scheduleAwLine6IncomeSubjectToConnecticutTax,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule CT-1040AW line 7 greater of full-year taxable income or line 6",
              jurisdiction: CONNECTICUT_STATE_CODE,
              label: "Connecticut Schedule CT-1040AW tax calculation base",
              lineCode: "schedule_ct1040aw.line7",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ct.schedule_ct1040aw.line7",
              nodeType: "calculation",
              value: scheduleAwLine7TaxCalculationBase,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule CT-1040AW line 8 Connecticut tax on line 7",
              jurisdiction: CONNECTICUT_STATE_CODE,
              label: "Connecticut Schedule CT-1040AW tax before apportionment",
              lineCode: "schedule_ct1040aw.line8",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ct.schedule_ct1040aw.line8",
              nodeType: "calculation",
              value: scheduleAwLine8Tax,
            }),
            createStateNode({
              formCode: primaryFormCode,
              formulaRef: "Schedule CT-1040AW line 9 apportionment percentage",
              jurisdiction: CONNECTICUT_STATE_CODE,
              label: "Connecticut Schedule CT-1040AW apportionment percentage",
              lineCode: "schedule_ct1040aw.line9",
              moduleId: args.manifest.plugin_manifest_id,
              nodeId: "ct.schedule_ct1040aw.line9",
              nodeType: "calculation",
              value: scheduleAwLine9ApportionmentPercentage?.toFixed(4) ?? "0.0000",
            }),
          ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Connecticut property tax credit worksheet result or override",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut property tax credit",
        lineCode: "line21",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line21",
        nodeType: "calculation",
        value: line21PropertyTaxCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line11 - line21 - line23, 0)",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut total tax",
        lineCode: "line24",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line24",
        nodeType: "summary",
        value: line24TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut total payments",
        lineCode: "line27",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.ct1040.line27",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          summaryWithAllocatedOverrides.allocation_ratio == null
            ? "ct1040.line10"
            : "ct1040.line10 * schedule CT-1040AW line9",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.summary.taxable_income",
        nodeType: "summary",
        value: summaryWithAllocatedOverrides.taxable_income,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "ct1040.line24",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.summary.total_tax",
        nodeType: "summary",
        value: line24TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "ct1040.line27",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line27 - line24, 0)",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.summary.refund_amount",
        nodeType: "summary",
        value: summaryWithAllocatedOverrides.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line24 - line27, 0)",
        jurisdiction: CONNECTICUT_STATE_CODE,
        label: "Connecticut amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ct.summary.amount_owed",
        nodeType: "summary",
        value: summaryWithAllocatedOverrides.amount_owed,
      }),
    ],
    summary: summaryWithAllocatedOverrides,
    validationResults,
  };
}

export { buildStateArtifacts };
