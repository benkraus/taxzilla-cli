import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveCombinedStateTaxedIncome } from "../return-kind";
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

const KENTUCKY_STATE_CODE = "KY";
const KENTUCKY_STATE_NAME = "Kentucky";
const KENTUCKY_FORM_RECORD_KEY = "form740";
const KENTUCKY_FLAT_TAX_RATE = 0.04;
const KENTUCKY_STANDARD_DEDUCTION = 3_270;
const KENTUCKY_FAMILY_SIZE_PERCENTAGES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1] as const;
const KENTUCKY_FAMILY_SIZE_THRESHOLD_BY_SIZE = {
  1: [15_650, 16_276, 16_902, 17_528, 18_153, 18_779, 19_406, 19_876, 20_345, 20_815],
  2: [21_150, 21_996, 22_842, 23_688, 24_533, 25_379, 26_226, 26_861, 27_495, 28_130],
  3: [26_650, 27_716, 28_782, 29_848, 30_913, 31_979, 33_046, 33_846, 34_645, 35_445],
  4: [32_150, 33_436, 34_722, 36_008, 37_293, 38_579, 39_866, 40_830, 41_795, 42_760],
} as const;

function roundKentuckyPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateKentuckyFamilySize(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly stateReturn: StateArtifactsArgs["stateReturn"];
}): 1 | 2 | 3 | 4 {
  const overrideFamilySize = asNumber(args.formRecord?.family_size_override) ?? asNumber(args.formRecord?.family_size);

  if (overrideFamilySize != null) {
    return Math.max(Math.min(Math.trunc(overrideFamilySize), 4), 1) as 1 | 2 | 3 | 4;
  }

  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const qualifyingChildCount =
    Math.max(Math.trunc(asNumber(args.formRecord?.qualifying_child_count) ?? args.input.household.dependents.length), 0);
  const baselineFamilySize =
    filingStatus === "married_filing_jointly" ||
    (filingStatus === "married_filing_separately" && args.input.household.spouse != null)
      ? 2
      : 1;

  return Math.max(Math.min(baselineFamilySize + qualifyingChildCount, 4), 1) as 1 | 2 | 3 | 4;
}

function calculateKentuckyFamilySizeModifiedGrossIncome(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line1FederalAdjustedGrossIncome: number;
  readonly line9ModifiedKentuckyAdjustedGrossIncome: number;
}): number {
  const overrideAmount =
    asNumber(args.formRecord?.family_size_modified_gross_income) ??
    asNumber(args.formRecord?.modified_gross_income_amount);

  if (overrideAmount != null) {
    return Math.max(toWholeDollars(overrideAmount), 0);
  }

  const federalBaseIncome = Math.max(
    args.line1FederalAdjustedGrossIncome +
      (asNumber(args.formRecord?.spouse_federal_adjusted_gross_income) ?? 0) +
      (asNumber(args.formRecord?.tax_exempt_interest_amount) ?? 0) +
      (asNumber(args.formRecord?.non_kentucky_municipal_bond_interest_amount) ?? 0) +
      (asNumber(args.formRecord?.federal_form_4972_lump_sum_distribution_amount) ?? 0),
    0,
  );
  const kentuckyBaseIncome = Math.max(
    args.line9ModifiedKentuckyAdjustedGrossIncome +
      (asNumber(args.formRecord?.spouse_kentucky_adjusted_gross_income) ?? 0) +
      (asNumber(args.formRecord?.kentucky_form_4972k_lump_sum_distribution_amount) ?? 0),
    0,
  );

  return Math.max(toWholeDollars(federalBaseIncome), toWholeDollars(kentuckyBaseIncome));
}

function calculateKentuckyFamilySizeCreditPercentage(args: {
  readonly familySize: 1 | 2 | 3 | 4;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly modifiedGrossIncome: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.family_size_tax_credit_percentage);

  if (overrideAmount != null) {
    return Math.max(Math.min(overrideAmount, 1), 0);
  }

  const thresholds = KENTUCKY_FAMILY_SIZE_THRESHOLD_BY_SIZE[args.familySize];

  for (const [index, threshold] of thresholds.entries()) {
    if (args.modifiedGrossIncome <= threshold) {
      return KENTUCKY_FAMILY_SIZE_PERCENTAGES[index] ?? 0;
    }
  }

  return 0;
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: KENTUCKY_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, KENTUCKY_FORM_RECORD_KEY);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const line1FederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const kentuckyAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.schedule_m_additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.schedule_m_subtractions),
  );
  const line8ModifiedFederalAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const line9ModifiedKentuckyAdjustedGrossIncome = Math.max(
    kentuckyAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const line7KentuckyPercentage =
    isAllocatedReturn && line8ModifiedFederalAdjustedGrossIncome > 0 && line9ModifiedKentuckyAdjustedGrossIncome > 0
      ? roundKentuckyPercentage(
          line9ModifiedKentuckyAdjustedGrossIncome / line8ModifiedFederalAdjustedGrossIncome,
        )
      : isAllocatedReturn
        ? 0
        : null;
  const line10StandardDeduction = toWholeDollars(
    asNumber(formRecord?.standard_deduction_override) ?? KENTUCKY_STANDARD_DEDUCTION,
  );
  const line11ItemizedDeductionsTotal = toWholeDollars(asNumber(formRecord?.itemized_deductions_total) ?? 0);
  const usesItemizedDeductions = line11ItemizedDeductionsTotal > line10StandardDeduction;
  const line12AllowedItemizedDeductions = usesItemizedDeductions
    ? line7KentuckyPercentage == null
      ? line11ItemizedDeductionsTotal
      : toWholeDollars(line11ItemizedDeductionsTotal * line7KentuckyPercentage)
    : 0;
  const line13TaxableIncome = Math.max(
    line9ModifiedKentuckyAdjustedGrossIncome -
      (usesItemizedDeductions ? line12AllowedItemizedDeductions : line10StandardDeduction),
    0,
  );
  const line14Tax = toWholeDollars(line13TaxableIncome * KENTUCKY_FLAT_TAX_RATE);
  const line15OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line16NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line17PersonalTaxCreditBase = toWholeDollars(asNumber(formRecord?.personal_tax_credit_amount) ?? 0);
  const line18AllowedPersonalTaxCredit =
    line7KentuckyPercentage == null
      ? line17PersonalTaxCreditBase
      : toWholeDollars(line17PersonalTaxCreditBase * line7KentuckyPercentage);
  const line19OtherNonrefundableCredits = Math.max(line16NonrefundableCredits - line17PersonalTaxCreditBase, 0);
  const line19TaxAfterPersonalCredits = Math.max(
    line14Tax + line15OtherTaxes - line19OtherNonrefundableCredits - line18AllowedPersonalTaxCredit,
    0,
  );
  const line20FamilySize = calculateKentuckyFamilySize({
    formRecord,
    input: args.input,
    stateReturn: args.stateReturn,
  });
  const line20ModifiedGrossIncome = calculateKentuckyFamilySizeModifiedGrossIncome({
    formRecord,
    line1FederalAdjustedGrossIncome,
    line9ModifiedKentuckyAdjustedGrossIncome,
  });
  const line21FamilySizeTaxCreditPercentage = calculateKentuckyFamilySizeCreditPercentage({
    familySize: line20FamilySize,
    formRecord,
    modifiedGrossIncome: line20ModifiedGrossIncome,
  });
  const line21FamilySizeTaxCredit = toWholeDollars(
    asNumber(formRecord?.family_size_tax_credit_amount) ??
      asNumber(formRecord?.family_size_tax_credit_refund) ??
      (line19TaxAfterPersonalCredits * line21FamilySizeTaxCreditPercentage),
  );
  const line20TotalTax = Math.max(line19TaxAfterPersonalCredits - line21FamilySizeTaxCredit, 0);
  const line29RefundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) +
      (asNumber(formRecord?.pass_through_entity_credit_refund) ?? 0),
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: line29RefundableCredits,
    stateCode: KENTUCKY_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line20TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? line9ModifiedKentuckyAdjustedGrossIncome : line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line13TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line20TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: line9ModifiedKentuckyAdjustedGrossIncome,
        allocation_ratio: line7KentuckyPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Kentucky whole-dollar rules",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky Form 740 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ky.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form740.schedule_m_additions",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky Schedule M additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form740.schedule_m_subtractions",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky Schedule M subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line2 - line3, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky adjusted gross income after Schedule M modifications",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line9",
      nodeType: "calculation",
      value: line9ModifiedKentuckyAdjustedGrossIncome,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Kentucky Form 740-NP Section D line 36 percentage",
            jurisdiction: KENTUCKY_STATE_CODE,
            label: "Kentucky nonresident and part-year percentage",
            lineCode: "line7",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ky.form740.line7",
            nodeType: "calculation",
            value: line7KentuckyPercentage?.toFixed(4) ?? "0.0000",
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Kentucky Form 740-NP Section D line 33 column A",
            jurisdiction: KENTUCKY_STATE_CODE,
            label: "Kentucky modified federal adjusted gross income",
            lineCode: "line8",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ky.form740.line8",
            nodeType: "calculation",
            value: line8ModifiedFederalAdjustedGrossIncome,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kentucky standard deduction or override",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky standard deduction",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line10",
      nodeType: "calculation",
      value: line10StandardDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kentucky Schedule A itemized deductions total",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky itemized deductions total",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line11",
      nodeType: "calculation",
      value: line11ItemizedDeductionsTotal,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: line7KentuckyPercentage == null ? "line11" : "line11 * line7",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky allowed itemized deductions",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line12",
      nodeType: "calculation",
      value: line12AllowedItemizedDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: usesItemizedDeductions ? "max(line9 - line12, 0)" : "max(line9 - line10, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky taxable income",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line13",
      nodeType: "calculation",
      value: line13TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line13 * 0.04",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky tax before credits",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line14",
      nodeType: "calculation",
      value: line14Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Kentucky personal tax credit worksheet or override",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky personal tax credit base",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line17",
      nodeType: "calculation",
      value: line17PersonalTaxCreditBase,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: line7KentuckyPercentage == null ? "line17" : "line17 * line7",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky allowed personal tax credit",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line18",
      nodeType: "calculation",
      value: line18AllowedPersonalTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line14 + line15 - line19 - line18, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky tax after personal and other nonrefundable credits",
      lineCode: "line19",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line19",
      nodeType: "calculation",
      value: line19TaxAfterPersonalCredits,
    }),
    createStateNode({
      formCode: "Schedule-ITC",
      formulaRef: "Kentucky family size for Schedule ITC Section C",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky family size",
      lineCode: "section_c.line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.schedule_itc.line20",
      nodeType: "calculation",
      value: line20FamilySize,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Schedule ITC Section C family size percentage",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky family size tax credit percentage",
      lineCode: "line21.percentage",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line21.percentage",
      nodeType: "calculation",
      value: line21FamilySizeTaxCreditPercentage.toFixed(1),
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line19 multiplied by the Schedule ITC family size percentage",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky family size tax credit",
      lineCode: "line21",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line21",
      nodeType: "calculation",
      value: line21FamilySizeTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line19 - line21, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky total tax",
      lineCode: "line20",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line20",
      nodeType: "summary",
      value: line20TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky total payments",
      lineCode: "line31",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.form740.line31",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form740.line13",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.summary.taxable_income",
      nodeType: "summary",
      value: line13TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form740.line20",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.summary.total_tax",
      nodeType: "summary",
      value: line20TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form740.line31",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line31 - line20, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line20 - line31, 0)",
      jurisdiction: KENTUCKY_STATE_CODE,
      label: "Kentucky amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ky.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ky.starting_point", "carryforward"),
    createStateEdge("bridge.ky.starting_point", "ky.form740.line9"),
    createStateEdge("ky.form740.line2", "ky.form740.line9"),
    createStateEdge("ky.form740.line3", "ky.form740.line9"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ky.form740.line8", "ky.form740.line7"),
          createStateEdge("ky.form740.line9", "ky.form740.line7"),
        ]
      : []),
    createStateEdge("ky.form740.line11", "ky.form740.line12"),
    ...(isAllocatedReturn ? [createStateEdge("ky.form740.line7", "ky.form740.line12")] : []),
    createStateEdge("ky.form740.line9", "ky.form740.line13"),
    createStateEdge("ky.form740.line10", "ky.form740.line13"),
    createStateEdge("ky.form740.line12", "ky.form740.line13"),
    createStateEdge("ky.form740.line13", "ky.form740.line14"),
    createStateEdge("ky.form740.line17", "ky.form740.line18"),
    ...(isAllocatedReturn ? [createStateEdge("ky.form740.line7", "ky.form740.line18")] : []),
    createStateEdge("ky.form740.line14", "ky.form740.line19"),
    createStateEdge("ky.form740.line18", "ky.form740.line19"),
    createStateEdge("ky.form740.line19", "ky.form740.line21"),
    createStateEdge("ky.form740.line19", "ky.form740.line20"),
    createStateEdge("ky.form740.line21", "ky.form740.line20"),
    createStateEdge("ky.form740.line20", "ky.summary.total_tax"),
    createStateEdge("ky.form740.line31", "ky.summary.total_payments"),
  ];

  const validationResults = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Kentucky Form 740-NP applied the Section D percentage to itemized deductions and personal tax credits while taxing Kentucky adjusted gross income on the nonresident and part-year path.",
        nodeIds: ["ky.form740.line7", "ky.form740.line12", "ky.form740.line18"],
        ruleId: "KY.section_d_percentage_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (line21FamilySizeTaxCredit > 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Kentucky Schedule ITC Section C family size tax credit was computed from the official 2025 family-size table and modified gross income.",
        nodeIds: ["ky.schedule_itc.line20", "ky.form740.line21"],
        ruleId: "KY.family_size_tax_credit_computed",
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
