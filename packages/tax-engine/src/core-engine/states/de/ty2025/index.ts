import { asBoolean, asNumber, asRecord, asString, getAgeOnLastDayOfTaxYear } from "../../../helpers";
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

const DELAWARE_STATE_CODE = "DE";
const DELAWARE_STATE_NAME = "Delaware";
const DELAWARE_FORM_RECORD_KEY = "pit_res";
const DELAWARE_NONRESIDENT_FORM_RECORD_KEY = "pit_non";
const DELAWARE_STANDARD_DEDUCTION_BY_FILING_STATUS = {
  head_of_household: 3_250,
  married_filing_jointly: 6_500,
  married_filing_separately: 3_250,
  qualifying_surviving_spouse: 6_500,
  single: 3_250,
} as const;
const DELAWARE_PERSONAL_CREDIT_AMOUNT = 110;
const DELAWARE_ADDITIONAL_STANDARD_DEDUCTION_AMOUNT = 2_500;

type DelawareFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

function roundDelawareRatio(value: number): number {
  return Math.round(Math.max(Math.min(value, 1), 0) * 10_000) / 10_000;
}

function calculateDelawareDeduction(args: {
  readonly filingStatus: DelawareFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly usesStandardDeduction: boolean;
  readonly usesItemizedDeduction: boolean;
} {
  const overrideAmount = asNumber(args.formRecord?.deduction_amount);

  if (overrideAmount != null) {
    return {
      deduction: toWholeDollars(overrideAmount),
      usesStandardDeduction: asBoolean(args.formRecord?.use_itemized_deductions) !== true,
      usesItemizedDeduction: asBoolean(args.formRecord?.use_itemized_deductions) === true,
    };
  }

  const standardDeduction = DELAWARE_STANDARD_DEDUCTION_BY_FILING_STATUS[args.filingStatus];
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
    usesStandardDeduction: !useItemizedDeduction,
    usesItemizedDeduction: useItemizedDeduction,
  };
}

function countDelawareAdditionalPersonalCreditBoxes(input: StateArtifactsArgs["input"]): number {
  return [input.household.taxpayer, input.household.spouse].filter((person) => {
    const dateOfBirth = asString(asRecord(person)?.date_of_birth);
    const age = getAgeOnLastDayOfTaxYear(dateOfBirth, input.tax_year);
    return age != null && age >= 60;
  }).length;
}

function calculateDelawarePersonalCredits(args: {
  readonly filingStatus: DelawareFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): {
  readonly line27aPersonalCredits: number;
  readonly line27bAdditionalPersonalCredits: number;
} {
  const overrideAmount = asNumber(args.formRecord?.personal_credits_amount);
  const additionalOverrideAmount = asNumber(args.formRecord?.additional_personal_credits_amount);

  const line27aPersonalCredits =
    overrideAmount != null
      ? toWholeDollars(overrideAmount)
      : (
          countPersonalExemptions(args.input, args.filingStatus) +
          countDependentExemptions(args.input) +
          toWholeDollars(asNumber(args.formRecord?.additional_exemption_count) ?? 0)
        ) *
        DELAWARE_PERSONAL_CREDIT_AMOUNT;

  const line27bAdditionalPersonalCredits =
    additionalOverrideAmount != null
      ? toWholeDollars(additionalOverrideAmount)
      : countDelawareAdditionalPersonalCreditBoxes(args.input) * DELAWARE_PERSONAL_CREDIT_AMOUNT;

  return {
    line27aPersonalCredits,
    line27bAdditionalPersonalCredits,
  };
}

function calculateDelawareAdditionalStandardDeduction(args: {
  readonly deductionResult: ReturnType<typeof calculateDelawareDeduction>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.additional_standard_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  if (!args.deductionResult.usesStandardDeduction) {
    return 0;
  }

  return (
    countBlindTaxpayers(args.input) +
    [args.input.household.taxpayer, args.input.household.spouse].filter((person) => {
      const dateOfBirth = asString(asRecord(person)?.date_of_birth);
      const age = getAgeOnLastDayOfTaxYear(dateOfBirth, args.input.tax_year);
      return age != null && age >= 65;
    }).length
  ) * DELAWARE_ADDITIONAL_STANDARD_DEDUCTION_AMOUNT;
}

function calculateDelawareTax(taxableIncome: number): number {
  if (taxableIncome <= 2_000) {
    return 0;
  }

  if (taxableIncome <= 5_000) {
    return toWholeDollars((taxableIncome - 2_000) * 0.022);
  }

  if (taxableIncome <= 10_000) {
    return toWholeDollars(66 + (taxableIncome - 5_000) * 0.039);
  }

  if (taxableIncome <= 20_000) {
    return toWholeDollars(261 + (taxableIncome - 10_000) * 0.048);
  }

  if (taxableIncome <= 25_000) {
    return toWholeDollars(741 + (taxableIncome - 20_000) * 0.052);
  }

  if (taxableIncome <= 60_000) {
    return toWholeDollars(1_001 + (taxableIncome - 25_000) * 0.0555);
  }

  return toWholeDollars(2_943.5 + (taxableIncome - 60_000) * 0.066);
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: DELAWARE_STATE_NAME,
    });
  }

  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord =
    (isAllocatedReturn
      ? getStatePluginRecord(args.stateReturn, DELAWARE_NONRESIDENT_FORM_RECORD_KEY)
      : undefined) ?? getStatePluginRecord(args.stateReturn, DELAWARE_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const fullYearArgs = {
    ...args,
    adjustedGrossIncome: args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
    federalSummary: args.returnKindContext?.originalFederalSummary ?? args.federalSummary,
  };
  const line1FederalAdjustedGrossIncome = toWholeDollars(fullYearArgs.adjustedGrossIncome);
  const line2Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line3Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line4DelawareAdjustedGrossIncome = Math.max(
    line1FederalAdjustedGrossIncome + line2Additions - line3Subtractions,
    0,
  );
  const deduction = calculateDelawareDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: fullYearArgs,
  });
  const line21AdditionalStandardDeduction = calculateDelawareAdditionalStandardDeduction({
    deductionResult: deduction,
    formRecord,
    input: args.input,
  });
  const line23TaxableIncome = Math.max(
    line4DelawareAdjustedGrossIncome - deduction.deduction - line21AdditionalStandardDeduction,
    0,
  );
  const line24Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateDelawareTax(line23TaxableIncome),
  );
  const personalCredits = calculateDelawarePersonalCredits({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line28OtherStateCredit = toWholeDollars(
    asNumber(formRecord?.tax_paid_to_other_state_credit) ??
      asNumber(formRecord?.other_state_credit_amount) ??
      0,
  );
  const line29OtherNonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line29TotalTax = Math.max(
    line24Tax -
      personalCredits.line27aPersonalCredits -
      personalCredits.line27bAdditionalPersonalCredits -
      line28OtherStateCredit -
      line29OtherNonrefundableCredits,
    0,
  );

  if (isAllocatedReturn) {
    const allocationRatio =
      deriveAllocationRatio(args.stateReturn) ??
      (line4DelawareAdjustedGrossIncome > 0
        ? args.adjustedGrossIncome / line4DelawareAdjustedGrossIncome
        : 0);
    const sourcedDelawareAdjustedGrossIncome = Math.max(
      toWholeDollars(
        asNumber(formRecord?.delaware_source_adjusted_gross_income_amount) ??
          (args.returnKindContext?.returnKind === "nonresident"
            ? deriveNonresidentStateSourceIncome(args.stateReturn) ??
              deriveCombinedStateTaxedIncome(args.stateReturn) ??
              args.adjustedGrossIncome
            : deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome),
      ) +
        toWholeDollars(
          asNumber(formRecord?.delaware_source_additions_amount) ??
            line2Additions * allocationRatio,
        ) -
        toWholeDollars(
          asNumber(formRecord?.delaware_source_subtractions_amount) ??
            line3Subtractions * allocationRatio,
        ),
      0,
    );
    const line29Exclusion = toWholeDollars(asNumber(formRecord?.exclusion_amount) ?? 0);
    const line30bDelawareAdjustedGrossIncome = Math.max(
      line4DelawareAdjustedGrossIncome - line29Exclusion,
      0,
    );
    const line30aModifiedDelawareSourceIncome = Math.max(
      sourcedDelawareAdjustedGrossIncome -
        (asNumber(formRecord?.delaware_source_exclusion_amount) != null
          ? toWholeDollars(asNumber(formRecord?.delaware_source_exclusion_amount) ?? 0)
          : line30bDelawareAdjustedGrossIncome > 0
            ? toWholeDollars(
                (line29Exclusion * sourcedDelawareAdjustedGrossIncome) / line30bDelawareAdjustedGrossIncome,
              )
            : 0),
      0,
    );
    const prorationDecimal =
      line30bDelawareAdjustedGrossIncome > 0 && line30aModifiedDelawareSourceIncome > 0
        ? roundDelawareRatio(
            line30aModifiedDelawareSourceIncome / line30bDelawareAdjustedGrossIncome,
          )
        : 0;
    const line43ProratedTaxLiability = toWholeDollars(line24Tax * prorationDecimal);
    const line44aPersonalCredits = toWholeDollars(
      personalCredits.line27aPersonalCredits * prorationDecimal,
    );
    const line44bAdditionalPersonalCredits = toWholeDollars(
      personalCredits.line27bAdditionalPersonalCredits * prorationDecimal,
    );
    const line45PartYearOtherStateCredit =
      args.returnKindContext?.returnKind === "part_year_resident"
        ? line28OtherStateCredit
        : 0;
    const line46OtherNonrefundableCredits = toWholeDollars(
      line29OtherNonrefundableCredits * prorationDecimal,
    );
    const line48Balance = Math.max(
      line43ProratedTaxLiability -
        line44aPersonalCredits -
        line44bAdditionalPersonalCredits -
        line45PartYearOtherStateCredit -
        line46OtherNonrefundableCredits,
      0,
    );
    const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: refundableCredits,
      stateCode: DELAWARE_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const allocatedTaxableIncome = toWholeDollars(line23TaxableIncome * prorationDecimal);
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(line48Balance - payments.totalPayments, 0),
      startingPoint: line30aModifiedDelawareSourceIncome,
      stateReturn: args.stateReturn,
      taxableIncome: allocatedTaxableIncome,
      totalPayments: payments.totalPayments,
      totalTax: line48Balance,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: line30aModifiedDelawareSourceIncome,
      allocation_ratio: prorationDecimal,
      resident_taxable_income:
        args.returnKindContext?.returnKind === "part_year_resident"
          ? allocatedTaxableIncome
          : null,
      nonresident_source_income:
        args.returnKindContext?.returnKind === "nonresident"
          ? allocatedTaxableIncome
          : null,
    };
    const validationResults = [
      buildValidationResult({
        message:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "Delaware PIT-NON proration was applied using modified Delaware source income over Delaware adjusted gross income, with Delaware tax and personal credits multiplied by the official proration decimal."
            : "Delaware PIT-NON nonresident tax was computed using modified Delaware source income over Delaware adjusted gross income, with Delaware tax and personal credits multiplied by the official proration decimal.",
        nodeIds: ["de.pitnon.line30a", "de.pitnon.line30b", "de.pitnon.line43"],
        ruleId:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "DE.pitnon_part_year_proration_applied"
            : "DE.pitnon_nonresident_proration_applied",
        severity: "info",
        status: "pass",
      }),
    ];

    if (
      (line2Additions !== 0 || line3Subtractions !== 0) &&
      (asNumber(formRecord?.delaware_source_additions_amount) == null ||
        asNumber(formRecord?.delaware_source_subtractions_amount) == null)
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Delaware source additions or subtractions were not supplied explicitly, so the engine apportioned those modifications using the state allocation ratio.",
          nodeIds: ["de.pitnon.line30a", "de.pitnon.line43"],
          ruleId: "DE.pitnon_modifications_allocated",
          severity: "info",
          status: "pass",
        }),
      );
    }

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.de.starting_point", "carryforward"),
        createStateEdge("bridge.de.starting_point", "de.pitnon.line30a"),
        createStateEdge("de.pitnon.line30a", "de.pitnon.line43"),
        createStateEdge("de.pitnon.line30b", "de.pitnon.line43"),
        createStateEdge("de.pitnon.line43", "de.pitnon.line48"),
        createStateEdge("de.pitnon.line48", "de.summary.total_tax"),
        createStateEdge("de.pitnon.line54", "de.summary.total_payments"),
      ],
      nodes: [
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Delaware modified source income from PIT-NON line 30a",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware modified source income",
          lineCode: "line30a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "bridge.de.starting_point",
          nodeType: "bridge",
          value: line30aModifiedDelawareSourceIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "PIT-NON modified Delaware source income",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON modified Delaware source income",
          lineCode: "line30a",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line30a",
          nodeType: "calculation",
          value: line30aModifiedDelawareSourceIncome,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "PIT-NON Delaware adjusted gross income",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON Delaware adjusted gross income",
          lineCode: "line30b",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line30b",
          nodeType: "calculation",
          value: line30bDelawareAdjustedGrossIncome,
        }),
        createStateNode({
          dataType: "string",
          formCode: primaryFormCode,
          formulaRef: "line30a / line30b",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON proration decimal",
          lineCode: "line43.decimal",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line43.decimal",
          nodeType: "calculation",
          value: prorationDecimal.toFixed(4),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Tax from Delaware rate schedule multiplied by PIT-NON proration decimal",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON prorated tax liability",
          lineCode: "line43",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line43",
          nodeType: "calculation",
          value: line43ProratedTaxLiability,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Prorated Delaware personal and other credits",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON total nonrefundable credits",
          lineCode: "line47",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line47",
          nodeType: "calculation",
          value:
            line44aPersonalCredits +
            line44bAdditionalPersonalCredits +
            line45PartYearOtherStateCredit +
            line46OtherNonrefundableCredits,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(line43 - line47, 0)",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON balance",
          lineCode: "line48",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line48",
          nodeType: "summary",
          value: line48Balance,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Delaware withholding, estimates, and refundable credits",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware PIT-NON total payments",
          lineCode: "line54",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.pitnon.line54",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "pitnon.line48",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware summary total tax",
          lineCode: "summary.total_tax",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.summary.total_tax",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "pitnon.line54",
          jurisdiction: DELAWARE_STATE_CODE,
          label: "Delaware summary total payments",
          lineCode: "summary.total_payments",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "de.summary.total_payments",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_payments,
        }),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: DELAWARE_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line29TotalTax - payments.totalPayments, 0),
    startingPoint: line4DelawareAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line23TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line29TotalTax,
  });

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.de.starting_point", "carryforward"),
      createStateEdge("bridge.de.starting_point", "de.pitres.line23"),
      createStateEdge("de.pitres.line23", "de.pitres.line24"),
      createStateEdge("de.pitres.line24", "de.pitres.line29"),
      createStateEdge("de.pitres.line29", "de.summary.total_tax"),
      createStateEdge("de.pitres.line35", "de.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 plus Delaware additions minus Delaware subtractions",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware adjusted gross income",
        lineCode: "line12",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.de.starting_point",
        nodeType: "bridge",
        value: line4DelawareAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Delaware standard deduction or federal itemized deduction common path",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware deduction",
        lineCode: "line20",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line20",
        nodeType: "calculation",
        value: deduction.deduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$2,500 per age-65-or-blind box when Delaware standard deduction is used",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware additional standard deduction",
        lineCode: "line21",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line21",
        nodeType: "calculation",
        value: line21AdditionalStandardDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line12 - line20 - line21, 0)",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware taxable income",
        lineCode: "line23",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line23",
        nodeType: "calculation",
        value: line23TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "2025 Delaware tax table under $60,000 or tax schedule over $60,000",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware income tax",
        lineCode: "line24",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line24",
        nodeType: "calculation",
        value: line24Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$110 per Delaware personal credit slot unless overridden",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware personal credits",
        lineCode: "line27a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line27a",
        nodeType: "calculation",
        value: personalCredits.line27aPersonalCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$110 per taxpayer or spouse age 60 or over unless overridden",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware additional personal credits",
        lineCode: "line27b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line27b",
        nodeType: "calculation",
        value: personalCredits.line27bAdditionalPersonalCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Credit for taxes paid to another state or override",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware other state credit",
        lineCode: "line28",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line28",
        nodeType: "calculation",
        value: line28OtherStateCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line24 - line27a - line27b - line28 - other nonrefundable credits, 0)",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware total tax",
        lineCode: "line29",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line29",
        nodeType: "summary",
        value: line29TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware total payments",
        lineCode: "line35",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.pitres.line35",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pitres.line23",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.summary.taxable_income",
        nodeType: "summary",
        value: line23TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pitres.line29",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.summary.total_tax",
        nodeType: "summary",
        value: line29TotalTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "pitres.line35",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line35 - line29, 0)",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line29 - line35, 0)",
        jurisdiction: DELAWARE_STATE_CODE,
        label: "Delaware amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "de.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults: [],
  };
}

export { buildStateArtifacts };
