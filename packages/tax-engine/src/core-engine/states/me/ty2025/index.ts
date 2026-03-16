import { asBoolean, asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import { deriveCombinedStateTaxedIncome } from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countPersonalExemptions,
  countSeniorTaxpayers,
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

const MAINE_STATE_CODE = "ME";
const MAINE_STATE_NAME = "Maine";
const MAINE_FORM_RECORD_KEY = "1040me";
const MAINE_PERSONAL_EXEMPTION_AMOUNT = 5_150;
const MAINE_PERSONAL_EXEMPTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 366_750,
  married_filing_jointly: 400_100,
  married_filing_separately: 200_050,
  qualifying_surviving_spouse: 400_100,
  single: 333_450,
} as const;
const MAINE_PERSONAL_EXEMPTION_PHASEOUT_DENOMINATOR_BY_FILING_STATUS = {
  head_of_household: 125_000,
  married_filing_jointly: 125_000,
  married_filing_separately: 62_500,
  qualifying_surviving_spouse: 125_000,
  single: 125_000,
} as const;
const MAINE_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: [22_500, 24_500, 26_500],
  married_filing_jointly: [30_000, 31_600, 33_200, 34_800, 36_400],
  married_filing_separately: [15_000, 16_600, 18_200, 19_800, 21_400],
  qualifying_surviving_spouse: [30_000, 31_600, 33_200, 34_800, 36_400],
  single: [15_000, 17_000, 19_000],
} as const;
const MAINE_DEDUCTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS = {
  head_of_household: 150_000,
  married_filing_jointly: 200_050,
  married_filing_separately: 100_000,
  qualifying_surviving_spouse: 200_050,
  single: 100_000,
} as const;
const MAINE_DEDUCTION_PHASEOUT_DENOMINATOR_BY_FILING_STATUS = {
  head_of_household: 112_500,
  married_filing_jointly: 150_000,
  married_filing_separately: 75_000,
  qualifying_surviving_spouse: 150_000,
  single: 75_000,
} as const;

type MaineFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundMaineRatio(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 10_000) / 10_000;
}

function calculateMainePhaseoutRatio(value: number, threshold: number, denominator: number): number {
  if (value <= threshold) {
    return 0;
  }

  return Math.min((value - threshold) / denominator, 1);
}

function calculateMaineStandardDeduction(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: MaineFilingStatus;
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): {
  readonly deduction: number;
  readonly usesItemizedDeduction: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      usesItemizedDeduction: asBoolean(args.formRecord?.use_itemized_deductions) === true,
    };
  }

  const deductionTable = MAINE_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const yesCount = Math.min(
    countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input),
    deductionTable.length - 1,
  );
  const standardDeduction = deductionTable[yesCount] ?? deductionTable[0] ?? 0;
  const itemizedDeductionTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (args.federalSummary?.deduction_strategy === "itemized"
        ? args.federalSummary.itemized_deduction_total
        : 0),
  );
  const useItemizedDeduction =
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionTotal > standardDeduction);
  const unphasedDeduction = useItemizedDeduction ? itemizedDeductionTotal : standardDeduction;
  const phaseoutRatio = calculateMainePhaseoutRatio(
    args.adjustedGrossIncome,
    MAINE_DEDUCTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS[args.filingStatus],
    MAINE_DEDUCTION_PHASEOUT_DENOMINATOR_BY_FILING_STATUS[args.filingStatus],
  );

  return {
    deduction: toWholeDollars(unphasedDeduction * (1 - phaseoutRatio)),
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function calculateMainePersonalExemption(args: {
  readonly adjustedGrossIncome: number;
  readonly filingStatus: MaineFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): {
  readonly amount: number;
} {
  const overrideAmount = asNumber(args.formRecord?.personal_exemption_amount);

  if (overrideAmount != null) {
    return {
      amount: toWholeDollars(overrideAmount),
    };
  }

  const exemptionCount = countPersonalExemptions(args.input, args.filingStatus);
  const phaseoutRatio = calculateMainePhaseoutRatio(
    args.adjustedGrossIncome,
    MAINE_PERSONAL_EXEMPTION_PHASEOUT_THRESHOLD_BY_FILING_STATUS[args.filingStatus],
    MAINE_PERSONAL_EXEMPTION_PHASEOUT_DENOMINATOR_BY_FILING_STATUS[args.filingStatus],
  );
  return {
    amount: toWholeDollars(exemptionCount * MAINE_PERSONAL_EXEMPTION_AMOUNT * (1 - phaseoutRatio)),
  };
}

function calculateMaineTax(taxableIncome: number): number {
  if (taxableIncome <= 26_050) {
    return toWholeDollars(taxableIncome * 0.058);
  }

  if (taxableIncome <= 61_600) {
    return toWholeDollars(1_511 + (taxableIncome - 26_050) * 0.0675);
  }

  return toWholeDollars(3_910 + (taxableIncome - 61_600) * 0.0715);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MAINE_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MAINE_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalSummary = args.returnKindContext?.originalFederalSummary ?? args.federalSummary;
  const fullYearAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const additionTotal = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const subtractionTotal = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line14MaineAdjustedGrossIncome = Math.max(
    fullYearAdjustedGrossIncome + additionTotal - subtractionTotal,
    0,
  );
  const deduction = calculateMaineStandardDeduction({
    adjustedGrossIncome: line14MaineAdjustedGrossIncome,
    filingStatus,
    federalSummary: fullYearFederalSummary,
    formRecord,
    input: args.input,
  });
  const personalExemption = calculateMainePersonalExemption({
    adjustedGrossIncome: line14MaineAdjustedGrossIncome,
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line19TaxableIncome = Math.max(
    line14MaineAdjustedGrossIncome - deduction.deduction - personalExemption.amount,
    0,
  );
  const line20Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateMaineTax(line19TaxableIncome),
  );
  if (isAllocatedReturn) {
    const allocationProfile = args.stateReturn.allocation_profile;
    const maineTaxedAdjustedGrossIncome = Math.max(
      toWholeDollars(
        asNumber(formRecord?.maine_taxed_adjusted_gross_income_amount) ??
          deriveCombinedStateTaxedIncome(args.stateReturn) ??
          args.adjustedGrossIncome,
      ),
      0,
    );
    const totalIncomeForRatio = Math.max(
      toWholeDollars(allocationProfile?.everywhere_income ?? fullYearAdjustedGrossIncome),
      0,
    );
    const nonMaineIncomeForRatio = toWholeDollars(
      asNumber(formRecord?.non_maine_income_amount) ??
        Math.max(totalIncomeForRatio - maineTaxedAdjustedGrossIncome, 0),
    );
    const line2RatioOfIncome =
      totalIncomeForRatio > 0
        ? roundMaineRatio(nonMaineIncomeForRatio / totalIncomeForRatio)
        : nonMaineIncomeForRatio > 0
          ? 1
          : 0;
    const line3NonMaineFederalAdjustments = toWholeDollars(
      asNumber(formRecord?.non_maine_federal_adjustments_amount) ??
        ((fullYearFederalSummary?.line10_adjustments ?? 0) * line2RatioOfIncome),
    );
    const line4NonMaineFederalAdjustedGrossIncome = Math.max(
      nonMaineIncomeForRatio - line3NonMaineFederalAdjustments,
      0,
    );
    const line5cNonMaineModifications = toWholeDollars(
      asNumber(formRecord?.non_maine_modifications_amount) ??
        ((additionTotal - subtractionTotal) * line2RatioOfIncome),
    );
    const line6NonMaineAdjustedGrossIncome = Math.max(
      line4NonMaineFederalAdjustedGrossIncome + line5cNonMaineModifications,
      0,
    );
    const line7NonresidentCreditRatio =
      line14MaineAdjustedGrossIncome > 0
        ? roundMaineRatio(line6NonMaineAdjustedGrossIncome / line14MaineAdjustedGrossIncome)
        : line6NonMaineAdjustedGrossIncome > 0
          ? 1
          : 0;
    const line21NonresidentCredit = toWholeDollars(line20Tax * line7NonresidentCreditRatio);
    const line22TotalTax = Math.max(
      line20Tax + toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0) - line21NonresidentCredit,
      0,
    );
    const line23NonrefundableCredits = toWholeDollars(
      asNumber(formRecord?.allocated_nonrefundable_credits_amount) ??
        sumStateNonrefundableCredits(
          args.stateReturn,
          readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
        ),
    );
    const line24NetTax = Math.max(line22TotalTax - line23NonrefundableCredits, 0);
    const maineTaxedIncomeRatio = Math.max(1 - line7NonresidentCreditRatio, 0);
    const allocatedTaxableIncome = toWholeDollars(
      asNumber(formRecord?.allocated_taxable_income_amount) ??
        line19TaxableIncome * maineTaxedIncomeRatio,
    );
    const refundableCredits = toWholeDollars(
      asNumber(formRecord?.allocated_refundable_credits_amount) ??
        readNamedAmountArrayTotal(formRecord?.refundable_credits),
    );
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: refundableCredits,
      stateCode: MAINE_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(line24NetTax - payments.totalPayments, 0),
      startingPoint: Math.max(line14MaineAdjustedGrossIncome - line6NonMaineAdjustedGrossIncome, 0),
      stateReturn: args.stateReturn,
      taxableIncome: allocatedTaxableIncome,
      totalPayments: payments.totalPayments,
      totalTax: line24NetTax,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: Math.max(
        line14MaineAdjustedGrossIncome - line6NonMaineAdjustedGrossIncome,
        0,
      ),
      allocation_ratio: roundMaineRatio(maineTaxedIncomeRatio),
    };
    const validationResults: StateArtifactsResult["validationResults"] = [
      buildValidationResult({
        message:
          "Maine Schedule NR nonresident credit was computed from 2025 non-Maine adjusted gross income and reduced the full-year Maine tax.",
        nodeIds: ["me.schedule_nr.line7", "me.1040me.line21", "me.1040me.line24"],
        ruleId: "ME.schedule_nr_credit_applied",
        severity: "info",
        status: "pass",
      }),
    ];

    if (
      readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) > 0 &&
      asNumber(formRecord?.allocated_nonrefundable_credits_amount) == null
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Maine Schedule A credits were not separated between prorated personal credits and full business credits, so the engine used the aggregated nonrefundable credit total. Supply plugin_fact_bag.1040me.allocated_nonrefundable_credits_amount to override.",
          nodeIds: ["me.1040me.line23"],
          ruleId: "ME.allocated_nonrefundable_credits_override_recommended",
        }),
      );
    }

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.me.starting_point", "carryforward"),
        createStateEdge("bridge.me.starting_point", "me.1040me.line19"),
        createStateEdge("me.schedule_nr.line7", "me.1040me.line21"),
        createStateEdge("me.1040me.line20", "me.1040me.line21"),
        createStateEdge("me.1040me.line21", "me.1040me.line22"),
        createStateEdge("me.1040me.line22", "me.1040me.line24"),
        createStateEdge("me.1040me.line27", "me.summary.total_payments"),
      ],
      nodes: [
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "1040.line11 plus Maine additions minus Maine subtractions",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine adjusted gross income",
          lineCode: "line14",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "bridge.me.starting_point",
          nodeType: "bridge",
          value: line14MaineAdjustedGrossIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Maine standard deduction chart or federal itemized deduction common path",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine deduction",
          lineCode: "line17",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line17",
          nodeType: "calculation",
          value: deduction.deduction,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "$5,150 per Maine personal exemption unless overridden",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine personal exemption deduction",
          lineCode: "line18",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line18",
          nodeType: "calculation",
          value: personalExemption.amount,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(line14 - line17 - line18, 0)",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine taxable income",
          lineCode: "line19",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line19",
          nodeType: "calculation",
          value: line19TaxableIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Maine resident rate schedule or override",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine income tax",
          lineCode: "line20",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line20",
          nodeType: "calculation",
          value: line20Tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Schedule NR line 2 ratio of non-Maine income to total income",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine Schedule NR ratio of income",
          lineCode: "schedule_nr.line2",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.schedule_nr.line2",
          nodeType: "calculation",
          value: line2RatioOfIncome.toFixed(4),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Schedule NR line 6 divided by Form 1040ME line 16",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine Schedule NR nonresident credit ratio",
          lineCode: "schedule_nr.line7",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.schedule_nr.line7",
          nodeType: "calculation",
          value: line7NonresidentCreditRatio.toFixed(4),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "line20 * Schedule NR line7",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine nonresident credit",
          lineCode: "line21",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line21",
          nodeType: "calculation",
          value: line21NonresidentCredit,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "line20 plus other taxes minus line21",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine total tax before Schedule A credits",
          lineCode: "line22",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line22",
          nodeType: "calculation",
          value: line22TotalTax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Maine Schedule A nonrefundable credits",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine nonrefundable credits",
          lineCode: "line23",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line23",
          nodeType: "calculation",
          value: line23NonrefundableCredits,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(line22 - line23, 0)",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine net tax",
          lineCode: "line24",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line24",
          nodeType: "summary",
          value: line24NetTax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "state_payments or canonical payment fallback + refundable credits",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine total payments",
          lineCode: "line27",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.1040me.line27",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "allocated Maine taxable income proxy from Schedule NR credit ratio",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine summary taxable income",
          lineCode: "summary.taxable_income",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.summary.taxable_income",
          nodeType: "summary",
          value: allocatedTaxableIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Form 1040ME line24",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine summary total tax",
          lineCode: "summary.total_tax",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.summary.total_tax",
          nodeType: "summary",
          value: line24NetTax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Form 1040ME line27",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine summary total payments",
          lineCode: "summary.total_payments",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.summary.total_payments",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_payments - total_tax, 0)",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine refund amount",
          lineCode: "summary.refund_amount",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.summary.refund_amount",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.refund_amount,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_tax - total_payments, 0)",
          jurisdiction: MAINE_STATE_CODE,
          label: "Maine amount owed",
          lineCode: "summary.amount_owed",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "me.summary.amount_owed",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.amount_owed,
        }),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }

  const line24NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line25TotalTax = Math.max(line20Tax - line24NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: MAINE_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line25TotalTax - payments.totalPayments, 0),
    startingPoint: line14MaineAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line19TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line25TotalTax,
  });

  const validationResults: StateArtifactsResult["validationResults"] = [];

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.me.starting_point", "carryforward"),
      createStateEdge("bridge.me.starting_point", "me.1040me.line19"),
      createStateEdge("me.1040me.line19", "me.1040me.line20"),
      createStateEdge("me.1040me.line20", "me.1040me.line25"),
      createStateEdge("me.1040me.line25", "me.summary.total_tax"),
      createStateEdge("me.1040me.line27", "me.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 plus Maine additions minus Maine subtractions",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine adjusted gross income",
        lineCode: "line14",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.me.starting_point",
        nodeType: "bridge",
        value: line14MaineAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maine standard deduction chart or federal itemized deduction common path",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine deduction",
        lineCode: "line17",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line17",
        nodeType: "calculation",
        value: deduction.deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$5,150 per Maine personal exemption unless overridden",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine personal exemption deduction",
        lineCode: "line18",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line18",
        nodeType: "calculation",
        value: personalExemption.amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line14 - line17 - line18, 0)",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine taxable income",
        lineCode: "line19",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line19",
        nodeType: "calculation",
        value: line19TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Maine resident rate schedule or override",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine income tax",
        lineCode: "line20",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line20",
        nodeType: "calculation",
        value: line20Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line20 - nonrefundable credits, 0)",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine total tax",
        lineCode: "line25",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line25",
        nodeType: "summary",
        value: line25TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine total payments",
        lineCode: "line27",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.1040me.line27",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040me.line19",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.summary.taxable_income",
        nodeType: "summary",
        value: line19TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040me.line25",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.summary.total_tax",
        nodeType: "summary",
        value: line25TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040me.line27",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line27 - line25, 0)",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line25 - line27, 0)",
        jurisdiction: MAINE_STATE_CODE,
        label: "Maine amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "me.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
