import { asBoolean, asNumber, sumNamedAmounts } from "../../helpers";
import { sumCapitalGainOrLossByTerm } from "../../income";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  deriveAllocationRatio,
  deriveCombinedStateTaxedIncome,
} from "../return-kind";
import {
  formatMassachusettsRatio,
  getMassachusettsCombinedProrationRatio,
  roundMassachusettsRatio,
} from "./proration";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countDependentExemptions,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateNonrefundableCredits,
  toWholeDollars,
} from "../resident";

const MASSACHUSETTS_STATE_CODE = "MA";
const MASSACHUSETTS_STATE_NAME = "Massachusetts";
const MASSACHUSETTS_FORM_RECORD_KEY = "form1";
const MASSACHUSETTS_REGULAR_RATE = 0.05;
const MASSACHUSETTS_SHORT_TERM_GAIN_RATE = 0.085;
const MASSACHUSETTS_COLLECTIBLES_RATE = 0.12;
const MASSACHUSETTS_SURTAX_RATE = 0.04;
const MASSACHUSETTS_SURTAX_THRESHOLD = 1_083_150;
const MASSACHUSETTS_PERSONAL_EXEMPTION_BY_FILING_STATUS = {
  head_of_household: 6_800,
  married_filing_jointly: 8_800,
  married_filing_separately: 4_400,
  qualifying_surviving_spouse: 8_800,
  single: 4_400,
} as const;
const MASSACHUSETTS_DEPENDENT_EXEMPTION = 1_000;
const MASSACHUSETTS_SENIOR_EXEMPTION = 700;
const MASSACHUSETTS_BLIND_EXEMPTION = 2_200;

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: MASSACHUSETTS_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, MASSACHUSETTS_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const derivedFederalGrossIncome = toWholeDollars(
    (args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome) +
      Math.max(
        (args.returnKindContext?.originalFederalSummary ?? args.federalSummary)?.line10_adjustments ?? 0,
        0,
      ),
  );
  const fullYearMassachusettsGrossIncome = toWholeDollars(
    asNumber(formRecord?.massachusetts_gross_income_override) ??
      derivedFederalGrossIncome,
  );
  const combinedMassachusettsIncome = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.massachusetts_allocated_gross_income_amount) ??
          deriveCombinedStateTaxedIncome(args.stateReturn) ??
          args.adjustedGrossIncome,
      )
    : fullYearMassachusettsGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearMassachusettsGrossIncome > 0
      ? roundMassachusettsRatio(combinedMassachusettsIncome / fullYearMassachusettsGrossIncome)
      : null);
  const deductionProration = getMassachusettsCombinedProrationRatio(args);
  const incomeAllocationRatio =
    allocationRatio ??
    (isAllocatedReturn ? deductionProration.totalRatio : 1);
  const rawAdditions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.additions) +
      sumNamedAmounts(args.stateReturn.state_specific_income_items) +
      readNamedAmountArrayTotal(formRecord?.additions),
  );
  const rawSubtractions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.subtractions) + readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const rawDeductions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.state_specific_deductions) +
      readNamedAmountArrayTotal(formRecord?.deductions),
  );
  const baseExemptions = toWholeDollars(
    MASSACHUSETTS_PERSONAL_EXEMPTION_BY_FILING_STATUS[filingStatus] +
      countDependentExemptions(args.input) * MASSACHUSETTS_DEPENDENT_EXEMPTION +
      countSeniorTaxpayers(args.input) * MASSACHUSETTS_SENIOR_EXEMPTION +
      countBlindTaxpayers(args.input) * MASSACHUSETTS_BLIND_EXEMPTION,
  );
  const line1MassachusettsGrossIncome = combinedMassachusettsIncome;
  const line2Additions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.allocated_additions_amount) ??
          rawAdditions * incomeAllocationRatio,
      )
    : rawAdditions;
  const line3Subtractions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.allocated_subtractions_amount) ??
          rawSubtractions * incomeAllocationRatio,
      )
    : rawSubtractions;
  const line4Deductions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.allocated_deductions_amount) ??
          rawDeductions * deductionProration.totalRatio,
      )
    : rawDeductions;
  const line5Exemptions = isAllocatedReturn
    ? toWholeDollars(
        asNumber(formRecord?.prorated_exemptions_amount) ??
          baseExemptions * deductionProration.totalRatio,
      )
    : baseExemptions;
  const rawShortTermCapitalGain = toWholeDollars(
    sumCapitalGainOrLossByTerm(args.input.facts.income.capital_transactions, "short"),
  );
  const line6ShortTermCapitalGain = Math.max(
    isAllocatedReturn
      ? toWholeDollars(
          asNumber(formRecord?.allocated_short_term_capital_gain_amount) ??
            rawShortTermCapitalGain * incomeAllocationRatio,
        )
      : rawShortTermCapitalGain,
    0,
  );
  const line7CollectiblesGain = Math.max(
    isAllocatedReturn
      ? toWholeDollars(
          asNumber(formRecord?.allocated_collectibles_gain_amount) ??
            toWholeDollars(asNumber(formRecord?.collectibles_gain_amount) ?? 0) *
              incomeAllocationRatio,
        )
      : toWholeDollars(asNumber(formRecord?.collectibles_gain_amount) ?? 0),
    0,
  );
  const line8RegularFivePercentIncome = Math.max(
    line1MassachusettsGrossIncome +
      line2Additions -
      line3Subtractions -
      line4Deductions -
      line5Exemptions -
      line6ShortTermCapitalGain -
      line7CollectiblesGain,
    0,
  );
  const line9RegularTax = toWholeDollars(line8RegularFivePercentIncome * MASSACHUSETTS_REGULAR_RATE);
  const line10ShortTermTax = toWholeDollars(
    line6ShortTermCapitalGain * MASSACHUSETTS_SHORT_TERM_GAIN_RATE,
  );
  const line11CollectiblesTax = toWholeDollars(
    line7CollectiblesGain * MASSACHUSETTS_COLLECTIBLES_RATE,
  );
  const totalMassachusettsTaxableIncome =
    line8RegularFivePercentIncome + line6ShortTermCapitalGain + line7CollectiblesGain;
  const line12MillionairesSurtax = toWholeDollars(
    Math.max(totalMassachusettsTaxableIncome - MASSACHUSETTS_SURTAX_THRESHOLD, 0) *
      MASSACHUSETTS_SURTAX_RATE,
  );
  const line13OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line14NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const noTaxStatusApplies = asBoolean(formRecord?.no_tax_status_applies) === true;
  const line18TotalTax = noTaxStatusApplies
    ? 0
    : Math.max(
        line9RegularTax +
          line10ShortTermTax +
          line11CollectiblesTax +
          line12MillionairesSurtax +
          line13OtherTaxes -
          line14NonrefundableCredits -
          (asNumber(formRecord?.limited_income_credit_amount) ?? 0),
        0,
      );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: MASSACHUSETTS_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line18TotalTax - payments.totalPayments, 0),
    startingPoint: line1MassachusettsGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: totalMassachusettsTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line18TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: line1MassachusettsGrossIncome,
        allocation_ratio: allocationRatio ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts gross income override or federal AGI common-path fallback",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts Form 1 gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ma.starting_point",
      nodeType: "bridge",
      value: line1MassachusettsGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts additions and other 5% class income adjustments",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts additions",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line2",
      nodeType: "calculation",
      value: line2Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts subtractions",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts subtractions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line3",
      nodeType: "calculation",
      value: line3Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts deductions",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts deductions",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line4",
      nodeType: "calculation",
      value: line4Deductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts personal, dependent, senior, and blindness exemptions",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts exemptions",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line5",
      nodeType: "calculation",
      value: line5Exemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts short-term capital gains class",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts short-term capital gain base",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line6",
      nodeType: "calculation",
      value: line6ShortTermCapitalGain,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts collectibles gain override",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts collectibles gain base",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line7",
      nodeType: "calculation",
      value: line7CollectiblesGain,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "5% income class after deductions, exemptions, and special-rate classes",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts 5% income class taxable base",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line8",
      nodeType: "calculation",
      value: line8RegularFivePercentIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line8 * 0.05",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts 5% class tax",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line9",
      nodeType: "calculation",
      value: line9RegularTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line6 * 0.085",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts short-term capital gains tax",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line10",
      nodeType: "calculation",
      value: line10ShortTermTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line7 * 0.12",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts collectibles tax",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line11",
      nodeType: "calculation",
      value: line11CollectiblesTax,
    }),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "Form 1-NR/PY line 3 part-year resident proration ratio using resident days over total days",
            jurisdiction: MASSACHUSETTS_STATE_CODE,
            label: "Massachusetts part-year resident proration ratio",
            lineCode: "line3",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ma.form1nrpy.line3",
            nodeType: "calculation",
            value: formatMassachusettsRatio(deductionProration.partYearRatio),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "Form 1-NR/PY line 14g nonresident deduction and exemption ratio",
            jurisdiction: MASSACHUSETTS_STATE_CODE,
            label: "Massachusetts nonresident deduction and exemption ratio",
            lineCode: "line14g",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ma.form1nrpy.line14g",
            nodeType: "calculation",
            value: formatMassachusettsRatio(deductionProration.nonresidentRatio),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "Schedule R/NR combined resident-day and nonresident-source proration of deductions and exemptions",
            jurisdiction: MASSACHUSETTS_STATE_CODE,
            label: "Massachusetts combined deduction and exemption proration ratio",
            lineCode: "schedule_rnr.proration_ratio",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ma.schedule_rnr.proration_ratio",
            nodeType: "calculation",
            value: formatMassachusettsRatio(deductionProration.totalRatio),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef:
              "Massachusetts source and resident-period gross income used by Form 1-NR/PY",
            jurisdiction: MASSACHUSETTS_STATE_CODE,
            label: "Massachusetts allocated gross income",
            lineCode: "line12",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "ma.form1nrpy.line12",
            nodeType: "calculation",
            value: line1MassachusettsGrossIncome,
          }),
        ]
      : []),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(total taxable income - 1083150, 0) * 0.04",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts millionaires surtax",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line12",
      nodeType: "calculation",
      value: line12MillionairesSurtax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts total tax after credits and overrides",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts total tax",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line18",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts total payments",
      lineCode: "line27",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.form1.line27",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Massachusetts total taxable income across active rate classes",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.summary.taxable_income",
      nodeType: "summary",
      value: totalMassachusettsTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form1.line18",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.summary.total_tax",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form1.line27",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line27 - line18, 0)",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line18 - line27, 0)",
      jurisdiction: MASSACHUSETTS_STATE_CODE,
      label: "Massachusetts amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ma.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("bridge.ma.starting_point", "ma.form1.line8"),
    createStateEdge("ma.form1.line2", "ma.form1.line8"),
    createStateEdge("ma.form1.line3", "ma.form1.line8"),
    createStateEdge("ma.form1.line4", "ma.form1.line8"),
    createStateEdge("ma.form1.line5", "ma.form1.line8"),
    createStateEdge("ma.form1.line6", "ma.form1.line8"),
    createStateEdge("ma.form1.line7", "ma.form1.line8"),
    createStateEdge("ma.form1.line8", "ma.form1.line9"),
    createStateEdge("ma.form1.line9", "ma.form1.line18"),
    createStateEdge("ma.form1.line10", "ma.form1.line18"),
    createStateEdge("ma.form1.line11", "ma.form1.line18"),
    createStateEdge("ma.form1.line12", "ma.form1.line18"),
    createStateEdge("ma.form1.line18", "ma.summary.total_tax"),
    createStateEdge("ma.form1.line27", "ma.summary.total_payments"),
    ...(isAllocatedReturn
      ? [
          createStateEdge("ma.form1nrpy.line3", "ma.schedule_rnr.proration_ratio"),
          createStateEdge("ma.form1nrpy.line14g", "ma.schedule_rnr.proration_ratio"),
          createStateEdge("ma.schedule_rnr.proration_ratio", "ma.form1.line4"),
          createStateEdge("ma.schedule_rnr.proration_ratio", "ma.form1.line5"),
        ]
      : []),
  ];

  const validationResults: StateArtifactsResult["validationResults"] = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Massachusetts Form 1-NR/PY proration was applied using the part-year resident day ratio, the nonresident deduction and exemption ratio, and Massachusetts source or resident-period income.",
        nodeIds: [
          "ma.form1nrpy.line3",
          "ma.form1nrpy.line14g",
          "ma.schedule_rnr.proration_ratio",
          "ma.form1.line4",
          "ma.form1.line5",
        ],
        ruleId: "MA.form1_nrpy_proration_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (deductionProration.usedIncomeProxyForPartYearDays) {
    validationResults.push(
      buildValidationResult({
        message:
          "Massachusetts part-year proration normally uses resident days over total days. Because no usable residency day count was supplied, this computation proxied the day ratio from resident-period income over everywhere income.",
        nodeIds: ["ma.form1nrpy.line3"],
        ruleId: "MA.part_year_day_ratio_income_proxy",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    (rawAdditions !== 0 ||
      rawSubtractions !== 0 ||
      rawDeductions !== 0 ||
      rawShortTermCapitalGain !== 0) &&
    (asNumber(formRecord?.allocated_additions_amount) == null ||
      asNumber(formRecord?.allocated_subtractions_amount) == null ||
      asNumber(formRecord?.allocated_deductions_amount) == null ||
      asNumber(formRecord?.allocated_short_term_capital_gain_amount) == null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Massachusetts allocated additions, subtractions, deductions, or short-term capital gains were not supplied explicitly, so the engine apportioned those items using the state allocation profile and Form 1-NR/PY proration ratios.",
        nodeIds: [
          "ma.form1.line2",
          "ma.form1.line3",
          "ma.form1.line4",
          "ma.form1.line6",
        ],
        ruleId: "MA.form1_nrpy_allocated_amounts_derived",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    asNumber(formRecord?.massachusetts_gross_income_override) == null &&
    ((args.returnKindContext?.originalFederalSummary ?? args.federalSummary)?.line10_adjustments ?? 0) > 0
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Massachusetts starts from Massachusetts gross income rather than federal AGI. Because no Massachusetts gross-income override was supplied, this module derived gross income by adding federal adjustments back to federal adjusted gross income.",
        nodeIds: ["bridge.ma.starting_point"],
        ruleId: "MA.gross_income_derived_from_federal_adjustments",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (rawShortTermCapitalGain < 0) {
    validationResults.push(
      buildValidationResult({
        message:
          "Negative Massachusetts short-term capital gains were floored at zero because Massachusetts taxes short-term gains in a separate income class and this common path does not carry a net short-term loss into the regular-income bucket.",
        nodeIds: ["ma.form1.line6"],
        ruleId: "MA.short_term_loss_zeroed_under_class_system",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (!noTaxStatusApplies && asNumber(formRecord?.limited_income_credit_amount) == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Massachusetts No Tax Status and Limited Income Credit were not claimed on this path, so the return stayed on the direct rate-class computation without a separate low-income adjustment worksheet result.",
        nodeIds: ["ma.form1.line18"],
        ruleId: "MA.low_income_adjustments_not_claimed",
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
