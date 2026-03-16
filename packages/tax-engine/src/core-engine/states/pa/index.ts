import {
  buildNonemployeeCompensationRollup,
  resolveMisc1099IncomeAmount,
  sumCapitalGainDistributions,
  sumCapitalGainOrLoss,
  sumScheduleCBusinessNetProfit,
} from "../../income";
import { buildScheduleERollup, roundMoney, sumNamedAmounts, sumNumbers } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  deriveAllocationRatio,
  deriveCombinedStateTaxedIncome,
  deriveNonresidentStateSourceIncome,
} from "../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateNonrefundableCredits,
  toWholeDollars,
} from "../resident";

const PENNSYLVANIA_STATE_CODE = "PA";
const PENNSYLVANIA_STATE_NAME = "Pennsylvania";
const PENNSYLVANIA_FORM_RECORD_KEY = "pa40";
const PENNSYLVANIA_FLAT_TAX_RATE = 0.0307;

function roundPennsylvaniaRatio(value: number): number {
  return Math.round(Math.max(Math.min(value, 1), 0) * 10_000) / 10_000;
}

function buildPennsylvaniaLocalReturnValidationResults(
  stateReturn: StateArtifactsArgs["stateReturn"],
): StateArtifactsResult["validationResults"] {
  if (stateReturn.local_returns.length === 0) {
    return [];
  }

  return [
    buildValidationResult({
      message:
        "Pennsylvania local earned-income-tax returns were supplied. The TY2025 PA-40 summary excludes separate local-return taxes, credits, and payments, so the engine intentionally left those amounts out of the state computation.",
      nodeIds: ["pa.summary.total_tax", "pa.summary.total_payments"],
      ruleId: "PA.local_returns_excluded_from_pa40",
      severity: "info",
      status: "pass",
    }),
  ];
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: PENNSYLVANIA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, PENNSYLVANIA_FORM_RECORD_KEY);
  const nonemployeeRollup = buildNonemployeeCompensationRollup(args.input);
  const scheduleERollup = buildScheduleERollup(args.input.facts.income.schedule_e_activities, {
    allowReportedNetLossesWithoutLimitationOverrides: true,
  });
  const line1Compensation = toWholeDollars(
    sumNumbers(args.input.facts.income.wages.map((wage) => wage.wages_tips_other_compensation)),
  );
  const line2Interest = toWholeDollars(
    sumNumbers(
      args.input.facts.income.taxable_interest.map((interest) => interest.interest_income),
    ),
  );
  const line3Dividends = toWholeDollars(
    sumNumbers(
      args.input.facts.income.dividends.map((dividend) => dividend.ordinary_dividends ?? 0),
    ),
  );
  const rawLine4BusinessIncome = roundMoney(
    sumScheduleCBusinessNetProfit(
      args.input.facts.income.schedule_c_businesses,
      nonemployeeRollup.receiptsByBusinessId,
    ) + nonemployeeRollup.line8jAmountTotal,
  );
  const line4BusinessIncome = Math.max(toWholeDollars(rawLine4BusinessIncome), 0);
  const rawLine5NetGains = roundMoney(
    sumCapitalGainOrLoss(args.input.facts.income.capital_transactions) +
      sumCapitalGainDistributions(args.input.facts.income.dividends),
  );
  const line5NetGains = Math.max(toWholeDollars(rawLine5NetGains), 0);
  const rawLine6RentsRoyaltiesEtc = toWholeDollars(scheduleERollup.totalNetTotal);
  const line6RentsRoyaltiesEtc = Math.max(rawLine6RentsRoyaltiesEtc, 0);
  const rawLine7Gambling = roundMoney(
    sumNumbers(
      args.input.facts.income.miscellaneous_1099_income
        .filter((income) => income.income_category === "wagering")
        .map((income) => resolveMisc1099IncomeAmount(income, args.input.source_documents)),
    ),
  );
  const line7Gambling = Math.max(toWholeDollars(rawLine7Gambling), 0);
  const line8OtherIncome = toWholeDollars(
    sumNamedAmounts(args.stateReturn.additions) +
      sumNamedAmounts(args.stateReturn.state_specific_income_items) +
      readNamedAmountArrayTotal(formRecord?.other_class_income),
  );
  const line9TotalPaTaxableIncome =
    line1Compensation +
    line2Interest +
    line3Dividends +
    line4BusinessIncome +
    line5NetGains +
    line6RentsRoyaltiesEtc +
    line7Gambling +
    line8OtherIncome;
  const line10AllowableDeductions = toWholeDollars(
    sumNamedAmounts(args.stateReturn.state_specific_deductions) +
      readNamedAmountArrayTotal(formRecord?.allowable_deductions),
  );
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";

  if (isAllocatedReturn) {
    const allocatedPennsylvaniaTaxableIncomeBase = Math.max(
      toWholeDollars(
        args.returnKindContext?.returnKind === "nonresident"
          ? (deriveNonresidentStateSourceIncome(args.stateReturn) ??
              deriveCombinedStateTaxedIncome(args.stateReturn) ??
              args.adjustedGrossIncome)
          : (deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome),
      ),
      0,
    );
    const allocationRatio =
      line9TotalPaTaxableIncome > 0
        ? roundPennsylvaniaRatio(allocatedPennsylvaniaTaxableIncomeBase / line9TotalPaTaxableIncome)
        : (deriveAllocationRatio(args.stateReturn) ?? 0);
    const allocatedLine10AllowableDeductions = toWholeDollars(
      line10AllowableDeductions * allocationRatio,
    );
    const line11TaxableIncomeAfterDeductions = Math.max(
      allocatedPennsylvaniaTaxableIncomeBase - allocatedLine10AllowableDeductions,
      0,
    );
    const line12Tax = toWholeDollars(
      line11TaxableIncomeAfterDeductions * PENNSYLVANIA_FLAT_TAX_RATE,
    );
    const line13NonrefundableCredits = toWholeDollars(
      sumStateNonrefundableCredits(
        args.stateReturn,
        readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
      ) * allocationRatio,
    );
    const line14TotalTax = Math.max(line12Tax - line13NonrefundableCredits, 0);
    const refundableCredits = toWholeDollars(
      (readNamedAmountArrayTotal(formRecord?.refundable_credits) +
        (formRecord?.tax_forgiveness_credit && typeof formRecord.tax_forgiveness_credit === "number"
          ? formRecord.tax_forgiveness_credit
          : 0)) *
        allocationRatio,
    );
    const payments = calculateResidentStatePayments({
      additionalPaymentTotal: readPluginPaymentTotal(formRecord),
      input: args.input,
      refundableCreditsTotal: refundableCredits,
      stateCode: PENNSYLVANIA_STATE_CODE,
      stateReturn: args.stateReturn,
    });
    const summary = buildResidentStateSummary({
      amountOwed: Math.max(line14TotalTax - payments.totalPayments, 0),
      startingPoint: allocatedPennsylvaniaTaxableIncomeBase,
      stateReturn: args.stateReturn,
      taxableIncome: line11TaxableIncomeAfterDeductions,
      totalPayments: payments.totalPayments,
      totalTax: line14TotalTax,
    });
    const summaryWithAllocatedOverrides = {
      ...summary,
      adjusted_gross_income_or_starting_point: allocatedPennsylvaniaTaxableIncomeBase,
      allocation_ratio: allocationRatio,
      nonresident_source_income:
        args.returnKindContext?.returnKind === "nonresident"
          ? line11TaxableIncomeAfterDeductions
          : (summary.nonresident_source_income ?? null),
      resident_taxable_income:
        args.returnKindContext?.returnKind === "part_year_resident"
          ? line11TaxableIncomeAfterDeductions
          : null,
    };
    const validationResults = [
      buildValidationResult({
        message:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "Pennsylvania part-year resident tax used resident-period and Pennsylvania-source nonresident income through the PA-40 Schedule G-L allocation path."
            : "Pennsylvania nonresident tax used Pennsylvania-source income through the PA-40 allocation path.",
        nodeIds: ["pa.schedule_gl.allocated_income", "pa.pa40.line11", "pa.pa40.line14"],
        ruleId:
          args.returnKindContext?.returnKind === "part_year_resident"
            ? "PA.schedule_gl_allocation_applied"
            : "PA.nonresident_allocation_applied",
        severity: "info",
        status: "pass",
      }),
    ];

    if (
      (line10AllowableDeductions !== 0 ||
        readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) !== 0) &&
      allocationRatio > 0 &&
      allocationRatio < 1
    ) {
      validationResults.push(
        buildValidationResult({
          message:
            "Pennsylvania allowable deductions and credits were not supplied with state-source breakdowns, so the engine apportioned them using the Pennsylvania allocation ratio.",
          nodeIds: ["pa.pa40.line10", "pa.pa40.line13", "pa.schedule_gl.allocation_ratio"],
          ruleId: "PA.deductions_and_credits_allocated",
          severity: "info",
          status: "pass",
        }),
      );
    }

    validationResults.push(...buildPennsylvaniaLocalReturnValidationResults(args.stateReturn));

    return {
      edges: [
        createStateEdge("1040.line11", "bridge.pa.starting_point", "carryforward"),
        createStateEdge("bridge.pa.starting_point", "pa.schedule_gl.allocated_income"),
        createStateEdge("pa.schedule_gl.allocated_income", "pa.pa40.line11"),
        createStateEdge("pa.pa40.line11", "pa.pa40.line14"),
        createStateEdge("pa.pa40.line14", "pa.summary.total_tax"),
        createStateEdge("pa.pa40.line24", "pa.summary.total_payments"),
      ],
      nodes: [
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            args.returnKindContext?.returnKind === "part_year_resident"
              ? "Resident-period Pennsylvania income plus Pennsylvania-source income during the nonresident period"
              : "Pennsylvania-source taxable income",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania allocated taxable income base",
          lineCode: "start",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "bridge.pa.starting_point",
          nodeType: "bridge",
          value: allocatedPennsylvaniaTaxableIncomeBase,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Pennsylvania allocated taxable income before apportioned deductions",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania Schedule G-L allocated income",
          lineCode: "allocated_income",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.schedule_gl.allocated_income",
          nodeType: "calculation",
          value: allocatedPennsylvaniaTaxableIncomeBase,
        }),
        createStateNode({
          dataType: "string",
          formCode: primaryFormCode,
          formulaRef:
            "allocated Pennsylvania taxable income base / full-year Pennsylvania taxable income base",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania allocation ratio",
          lineCode: "allocation_ratio",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.schedule_gl.allocation_ratio",
          nodeType: "calculation",
          value: allocationRatio.toFixed(4),
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "Apportioned Pennsylvania allowable deductions",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania allowable deductions",
          lineCode: "line10",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.pa40.line10",
          nodeType: "calculation",
          value: allocatedLine10AllowableDeductions,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(allocated income - apportioned deductions, 0)",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania taxable income after deductions",
          lineCode: "line11",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.pa40.line11",
          nodeType: "calculation",
          value: line11TaxableIncomeAfterDeductions,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            "Pennsylvania flat tax on allocated taxable income after apportioned deductions and credits",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania total tax",
          lineCode: "line14",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.pa40.line14",
          nodeType: "summary",
          value: line14TotalTax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef:
            "state_payments or canonical payment fallback + apportioned refundable credits",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania total payments",
          lineCode: "line24",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.pa40.line24",
          nodeType: "summary",
          value: payments.totalPayments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "pa40.line11",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania summary taxable income",
          lineCode: "summary.taxable_income",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.summary.taxable_income",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.taxable_income,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "pa40.line14",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania summary total tax",
          lineCode: "summary.total_tax",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.summary.total_tax",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_tax,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "pa40.line24",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania summary total payments",
          lineCode: "summary.total_payments",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.summary.total_payments",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.total_payments,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_payments - total_tax, 0)",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania refund amount",
          lineCode: "summary.refund_amount",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.summary.refund_amount",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.refund_amount,
        }),
        createStateNode({
          formCode: primaryFormCode,
          formulaRef: "max(total_tax - total_payments, 0)",
          jurisdiction: PENNSYLVANIA_STATE_CODE,
          label: "Pennsylvania amount owed",
          lineCode: "summary.amount_owed",
          moduleId: args.manifest.plugin_manifest_id,
          nodeId: "pa.summary.amount_owed",
          nodeType: "summary",
          value: summaryWithAllocatedOverrides.amount_owed,
        }),
      ],
      summary: summaryWithAllocatedOverrides,
      validationResults,
    };
  }

  const line11TaxableIncomeAfterDeductions = Math.max(
    line9TotalPaTaxableIncome - line10AllowableDeductions,
    0,
  );
  const line12Tax = toWholeDollars(line11TaxableIncomeAfterDeductions * PENNSYLVANIA_FLAT_TAX_RATE);
  const line13NonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
  );
  const line14TotalTax = Math.max(line12Tax - line13NonrefundableCredits, 0);
  const refundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) +
      (formRecord?.tax_forgiveness_credit && typeof formRecord.tax_forgiveness_credit === "number"
        ? formRecord.tax_forgiveness_credit
        : 0),
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: PENNSYLVANIA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line14TotalTax - payments.totalPayments, 0),
    startingPoint: line9TotalPaTaxableIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line11TaxableIncomeAfterDeductions,
    totalPayments: payments.totalPayments,
    totalTax: line14TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "sum of Pennsylvania taxable compensation class",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania compensation income class",
      lineCode: "line1a",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line1a",
      nodeType: "input",
      value: line1Compensation,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "sum of Pennsylvania taxable interest class",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania interest income class",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line2",
      nodeType: "input",
      value: line2Interest,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "sum of Pennsylvania dividend income class",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania dividend income class",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line3",
      nodeType: "input",
      value: line3Dividends,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Pennsylvania business/profession class net, floored at zero",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania business income class",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line4",
      nodeType: "calculation",
      value: line4BusinessIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Pennsylvania sale/exchange class net, floored at zero",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania sale, exchange, or disposition of property class",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line5",
      nodeType: "calculation",
      value: line5NetGains,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        "Pennsylvania rents, royalties, patents, copyrights, estates, and trusts class net, floored at zero",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania rents and royalties class",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line6",
      nodeType: "calculation",
      value: line6RentsRoyaltiesEtc,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Pennsylvania gambling and lottery winnings class, floored at zero",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania gambling and lottery winnings class",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line7",
      nodeType: "calculation",
      value: line7Gambling,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "other Pennsylvania class income overrides and additions",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania other class income",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line8",
      nodeType: "calculation",
      value: line8OtherIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "sum of positive Pennsylvania class totals",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania total taxable income before deductions",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line9",
      nodeType: "calculation",
      value: line9TotalPaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_specific_deductions + plugin_fact_bag.pa40.allowable_deductions",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania allowable deductions",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line10",
      nodeType: "calculation",
      value: line10AllowableDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line9 - line10, 0)",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania taxable income after deductions",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line11",
      nodeType: "calculation",
      value: line11TaxableIncomeAfterDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line11 * 0.0307",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania tax before credits",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line12",
      nodeType: "calculation",
      value: line12Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line12 - line13, 0)",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania total tax",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line14",
      nodeType: "summary",
      value: line14TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania total payments",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.pa40.line13",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "pa40.line11",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.summary.taxable_income",
      nodeType: "summary",
      value: line11TaxableIncomeAfterDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "pa40.line14",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.summary.total_tax",
      nodeType: "summary",
      value: line14TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "pa40.line13",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line13 - line14, 0)",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line14 - line13, 0)",
      jurisdiction: PENNSYLVANIA_STATE_CODE,
      label: "Pennsylvania amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "pa.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("pa.pa40.line1a", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line2", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line3", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line4", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line5", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line6", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line7", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line8", "pa.pa40.line9"),
    createStateEdge("pa.pa40.line9", "pa.pa40.line11"),
    createStateEdge("pa.pa40.line10", "pa.pa40.line11"),
    createStateEdge("pa.pa40.line11", "pa.pa40.line12"),
    createStateEdge("pa.pa40.line12", "pa.pa40.line14"),
    createStateEdge("pa.pa40.line14", "pa.summary.total_tax"),
    createStateEdge("pa.pa40.line13", "pa.summary.total_payments"),
  ];

  const validationResults = [];

  if (
    rawLine4BusinessIncome < 0 ||
    rawLine5NetGains < 0 ||
    rawLine6RentsRoyaltiesEtc < 0 ||
    rawLine7Gambling < 0
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Pennsylvania class losses were not allowed to offset other income classes in this resident computation, so negative class totals were floored at zero.",
        nodeIds: ["pa.pa40.line4", "pa.pa40.line5", "pa.pa40.line6", "pa.pa40.line7"],
        ruleId: "PA.class_losses_floored",
        severity: "info",
      }),
    );
  }

  validationResults.push(...buildPennsylvaniaLocalReturnValidationResults(args.stateReturn));

  return {
    edges,
    nodes,
    summary,
    validationResults,
  };
}

export { buildStateArtifacts };
