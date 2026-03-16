import { asBoolean, asNumber } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  deriveAllocationRatio,
  deriveCombinedStateTaxedIncome,
  deriveNonresidentStateSourceIncome,
} from "../../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
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

const ARKANSAS_STATE_CODE = "AR";
const ARKANSAS_STATE_NAME = "Arkansas";
const ARKANSAS_FORM_RECORD_KEY = "ar1000f";
const ARKANSAS_NONRESIDENT_FORM_RECORD_KEY = "ar1000nr";
const ARKANSAS_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 2_470,
  married_filing_jointly: 4_940,
  married_filing_separately: 2_470,
  qualifying_surviving_spouse: 4_940,
  single: 2_470,
} as const;
const ARKANSAS_PERSONAL_TAX_CREDIT_AMOUNT = 29;

type ArkansasFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundArkansasRatio(value: number): number {
  return Math.round(Math.max(Math.min(value, 1), 0) * 1_000_000) / 1_000_000;
}

function calculateArkansasDeduction(args: {
  readonly filingStatus: ArkansasFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
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

  const standardDeduction = ARKANSAS_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
  const itemizedDeductionTotal = toWholeDollars(
    asNumber(args.formRecord?.itemized_deductions_total) ??
      (args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
        ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
        : 0),
  );
  const useItemizedDeduction =
    asBoolean(args.formRecord?.use_itemized_deductions) === true ||
    (asBoolean(args.formRecord?.force_standard_deduction) !== true &&
      itemizedDeductionTotal > standardDeduction);

  return {
    deduction: useItemizedDeduction ? itemizedDeductionTotal : standardDeduction,
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function calculateArkansasPersonalTaxCredits(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly filingStatus: ArkansasFilingStatus;
}): number {
  const overrideAmount = asNumber(args.formRecord?.personal_tax_credit_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const personalCreditCount =
    countPersonalExemptions(args.input, args.filingStatus) +
    countDependentExemptions(args.input) +
    countBlindTaxpayers(args.input) +
    toWholeDollars(asNumber(args.formRecord?.additional_personal_credit_count) ?? 0);

  return personalCreditCount * ARKANSAS_PERSONAL_TAX_CREDIT_AMOUNT;
}

function calculateArkansasTax(taxableIncome: number): number {
  if (taxableIncome <= 5_599) {
    return 0;
  }

  if (taxableIncome <= 11_199) {
    return toWholeDollars(taxableIncome * 0.02 - 111.98);
  }

  if (taxableIncome <= 15_999) {
    return toWholeDollars(taxableIncome * 0.03 - 223.97);
  }

  if (taxableIncome <= 26_399) {
    return toWholeDollars(taxableIncome * 0.034 - 287.97);
  }

  if (taxableIncome <= 94_700) {
    return toWholeDollars(taxableIncome * 0.039 - 419.96);
  }

  if (taxableIncome <= 97_800) {
    return toWholeDollars(taxableIncome * 0.039 - 89.3);
  }

  return toWholeDollars(3_809 + (taxableIncome - 100_000) * 0.039);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: ARKANSAS_STATE_NAME,
    });
  }

  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord =
    (isAllocatedReturn
      ? getStatePluginRecord(args.stateReturn, ARKANSAS_NONRESIDENT_FORM_RECORD_KEY)
      : undefined) ?? getStatePluginRecord(args.stateReturn, ARKANSAS_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1ArkansasAdjustedGrossIncome = Math.max(
    toWholeDollars(args.adjustedGrossIncome) +
      sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
    0,
  );
  const deduction = calculateArkansasDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });

  if (isAllocatedReturn) {
    const fullYearArkansasAdjustedGrossIncome = Math.max(
      toWholeDollars(args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome) +
        sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
        sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
      0,
    );
    const baseAllocatedArkansasAdjustedGrossIncome = Math.max(
      toWholeDollars(
        args.returnKindContext?.returnKind === "nonresident"
          ? deriveNonresidentStateSourceIncome(args.stateReturn) ??
              deriveCombinedStateTaxedIncome(args.stateReturn) ??
              args.adjustedGrossIncome
          : deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome,
      ),
      0,
    );
    const preliminaryAllocationRatio =
      deriveAllocationRatio(args.stateReturn) ??
      (fullYearArkansasAdjustedGrossIncome > 0
        ? baseAllocatedArkansasAdjustedGrossIncome / fullYearArkansasAdjustedGrossIncome
        : 0);
    const line38AArkansasAdjustedGrossIncome = Math.max(
      baseAllocatedArkansasAdjustedGrossIncome +
        toWholeDollars(
          asNumber(formRecord?.arkansas_source_additions_amount) ??
            sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) *
              preliminaryAllocationRatio,
        ) -
        toWholeDollars(
          asNumber(formRecord?.arkansas_source_subtractions_amount) ??
            sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)) *
              preliminaryAllocationRatio,
        ),
      0,
    );
    const line38BTotalIncome = fullYearArkansasAdjustedGrossIncome;
    const allocationRatio =
      line38BTotalIncome > 0 && line38AArkansasAdjustedGrossIncome > 0
        ? roundArkansasRatio(line38AArkansasAdjustedGrossIncome / line38BTotalIncome)
        : roundArkansasRatio(preliminaryAllocationRatio);
    const line4TaxableIncome = Math.max(
      fullYearArkansasAdjustedGrossIncome - deduction.deduction,
      0,
    );
    const allocatedTaxableIncome = toWholeDollars(line4TaxableIncome * allocationRatio);
    const line5Tax = toWholeDollars(calculateArkansasTax(line4TaxableIncome));
    const line7PersonalTaxCredits = calculateArkansasPersonalTaxCredits({
      filingStatus,
      formRecord,
      input: args.input,
    });
    const line8NonrefundableCredits = sumStateNonrefundableCredits(
      args.stateReturn,
      readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
    );
    const line38NetTax = Math.max(
      line5Tax - line7PersonalTaxCredits - line8NonrefundableCredits,
      0,
    );
    const line38DApportionedTaxLiability = toWholeDollars(line38NetTax * allocationRatio);
    const refundableCredits = toWholeDollars(
      readNamedAmountArrayTotal(formRecord?.refundable_credits) * allocationRatio,
    );
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: refundableCredits,
      stateCode: ARKANSAS_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(line38DApportionedTaxLiability - payments.totalPayments, 0),
      startingPoint: line38AArkansasAdjustedGrossIncome,
      stateReturn: args.stateReturn,
      taxableIncome: allocatedTaxableIncome,
      totalPayments: payments.totalPayments,
      totalTax: line38DApportionedTaxLiability,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: line38AArkansasAdjustedGrossIncome,
      allocation_ratio: allocationRatio,
      resident_taxable_income:
        args.returnKindContext?.returnKind === "part_year_resident"
          ? allocatedTaxableIncome
          : null,
      nonresident_source_income:
        args.returnKindContext?.returnKind === "nonresident"
          ? allocatedTaxableIncome
          : summary.nonresident_source_income ?? null,
    };
    const validationResults = [
      buildValidationResult({
        message:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "Arkansas part-year resident tax was computed using the AR1000NR line 38 ratio and apportioned net tax."
            : "Arkansas nonresident tax was computed using the AR1000NR line 38 ratio and apportioned net tax.",
        nodeIds: ["ar.ar1000nr.line38a", "ar.ar1000nr.line38c", "ar.ar1000nr.line38d"],
        ruleId:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "AR.part_year_allocation_applied"
            : "AR.nonresident_allocation_applied",
        severity: "info",
        status: "pass",
      }),
    ];

    if (
      (sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) !== 0 ||
        sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)) !== 0) &&
      (asNumber(formRecord?.arkansas_source_additions_amount) == null ||
        asNumber(formRecord?.arkansas_source_subtractions_amount) == null)
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Arkansas source additions or subtractions were not supplied explicitly, so the engine apportioned those modifications using the AR1000NR allocation ratio.",
          nodeIds: ["ar.ar1000nr.line38a", "ar.ar1000nr.line38c"],
          ruleId: "AR.line38_modifications_allocated",
          severity: "info",
          status: "pass",
        }),
      );
    }

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.ar.starting_point", "carryforward"),
        createStateEdge("bridge.ar.starting_point", "ar.ar1000nr.line38a"),
        createStateEdge("ar.ar1000nr.line38a", "ar.ar1000nr.line38c"),
        createStateEdge("ar.ar1000nr.line38b", "ar.ar1000nr.line38c"),
        createStateEdge("ar.ar1000nr.line38", "ar.ar1000nr.line38d"),
        createStateEdge("ar.ar1000nr.line38c", "ar.ar1000nr.line38d"),
        createStateEdge("ar.ar1000nr.line38d", "ar.summary.total_tax"),
        createStateEdge("ar.ar1000nr.line46", "ar.summary.total_payments"),
      ],
      nodes: [
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            args.returnKindContext?.returnKind === "part_year_resident"
              ? "Arkansas resident-period income plus Arkansas-source income during the nonresident period, with apportioned Arkansas modifications"
              : "Arkansas-source income",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas allocated adjusted gross income",
          lineCode: "line38a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "bridge.ar.starting_point",
          nodeType: "bridge",
          value: line38AArkansasAdjustedGrossIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "AR1000NR line 38A Arkansas adjusted gross income",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas line 38A Arkansas adjusted gross income",
          lineCode: "line38a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line38a",
          nodeType: "calculation",
          value: line38AArkansasAdjustedGrossIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "AR1000NR line 38B total of line 25 columns A and B",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas line 38B total income",
          lineCode: "line38b",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line38b",
          nodeType: "calculation",
          value: line38BTotalIncome,
        }),
        createStateNode({
          dataType: "string",
          formCode: primaryFormCode,
          formulaRef: "AR1000NR line 38A divided by line 38B, rounded to six decimals",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas allocation ratio",
          lineCode: "line38c",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line38c",
          nodeType: "calculation",
          value: allocationRatio.toFixed(6),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Full-year Arkansas taxable income before NR/PY apportionment",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas taxable income",
          lineCode: "line4",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000f.line4",
          nodeType: "calculation",
          value: line4TaxableIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "2025 Arkansas indexed tax brackets on full-year taxable income",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas income tax",
          lineCode: "line5",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000f.line5",
          nodeType: "calculation",
          value: line5Tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Full-year Arkansas personal tax credits",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas personal tax credits",
          lineCode: "line7",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000f.line7",
          nodeType: "calculation",
          value: line7PersonalTaxCredits,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(line5 - line7 - nonrefundable credits, 0)",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas net tax before allocation",
          lineCode: "line38",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line38",
          nodeType: "summary",
          value: line38NetTax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "AR1000NR line 38 multiplied by line 38C",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas apportioned tax liability",
          lineCode: "line38d",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line38d",
          nodeType: "summary",
          value: line38DApportionedTaxLiability,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Arkansas withholding, estimates, extension payments, prior payments, and apportioned refundable credits",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas total payments",
          lineCode: "line46",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.ar1000nr.line46",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "full-year taxable income multiplied by the Arkansas line 38 ratio",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas summary taxable income",
          lineCode: "summary.taxable_income",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.summary.taxable_income",
          nodeType: "summary",
          value: allocatedTaxableIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "ar1000nr.line38d",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas summary total tax",
          lineCode: "summary.total_tax",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.summary.total_tax",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "ar1000nr.line46",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas summary total payments",
          lineCode: "summary.total_payments",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.summary.total_payments",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_payments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_payments - total_tax, 0)",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas refund amount",
          lineCode: "summary.refund_amount",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.summary.refund_amount",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.refund_amount,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_tax - total_payments, 0)",
          jurisdiction: ARKANSAS_STATE_CODE,
          label: "Arkansas amount owed",
          lineCode: "summary.amount_owed",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "ar.summary.amount_owed",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.amount_owed,
        }),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }

  const line4TaxableIncome = Math.max(line1ArkansasAdjustedGrossIncome - deduction.deduction, 0);
  const line5Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateArkansasTax(line4TaxableIncome),
  );
  const line7PersonalTaxCredits = calculateArkansasPersonalTaxCredits({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line8NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line9TotalTax = Math.max(line5Tax - line7PersonalTaxCredits - line8NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: ARKANSAS_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line9TotalTax - payments.totalPayments, 0),
    startingPoint: line1ArkansasAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line4TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line9TotalTax,
  });

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.ar.starting_point", "carryforward"),
      createStateEdge("bridge.ar.starting_point", "ar.ar1000f.line4"),
      createStateEdge("ar.ar1000f.line4", "ar.ar1000f.line5"),
      createStateEdge("ar.ar1000f.line5", "ar.ar1000f.line9"),
      createStateEdge("ar.ar1000f.line9", "ar.summary.total_tax"),
      createStateEdge("ar.ar1000f.line16", "ar.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 plus Arkansas additions minus Arkansas subtractions",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas adjusted gross income",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.ar.starting_point",
        nodeType: "bridge",
        value: line1ArkansasAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Arkansas standard deduction or federal itemized deduction common path",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas deduction",
        lineCode: "line27",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line27",
        nodeType: "calculation",
        value: deduction.deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line1 - line27, 0)",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas taxable income",
        lineCode: "line4",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line4",
        nodeType: "calculation",
        value: line4TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "2025 Arkansas indexed tax brackets or override",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas income tax",
        lineCode: "line5",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line5",
        nodeType: "calculation",
        value: line5Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$29 per personal, dependent, and blindness credit slot unless overridden",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas personal tax credits",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line7",
        nodeType: "calculation",
        value: line7PersonalTaxCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line5 - line7 - nonrefundable credits, 0)",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas total tax",
        lineCode: "line9",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line9",
        nodeType: "summary",
        value: line9TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas total payments",
        lineCode: "line16",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.ar1000f.line16",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "ar1000f.line4",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.summary.taxable_income",
        nodeType: "summary",
        value: line4TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "ar1000f.line9",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.summary.total_tax",
        nodeType: "summary",
        value: line9TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "ar1000f.line16",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line16 - line9, 0)",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line9 - line16, 0)",
        jurisdiction: ARKANSAS_STATE_CODE,
        label: "Arkansas amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ar.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults: [],
  };
}

export { buildStateArtifacts };
