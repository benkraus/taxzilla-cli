import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
} from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveCombinedStateTaxedIncome } from "../return-kind";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countBlindTaxpayers,
  countDependentExemptions,
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
} from "../resident";

const ILLINOIS_STATE_CODE = "IL";
const ILLINOIS_STATE_NAME = "Illinois";
const ILLINOIS_FORM_RECORD_KEY = "il1040";
const ILLINOIS_FLAT_TAX_RATE = 0.0495;
const ILLINOIS_EARNED_INCOME_TAX_CREDIT_RATE = 0.2;
const ILLINOIS_CHILD_TAX_CREDIT_RATE = 0.2;
const ILLINOIS_PERSONAL_EXEMPTION = 2_850;
const ILLINOIS_SENIOR_OR_BLIND_EXEMPTION = 1_000;

function roundIllinoisRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function countIllinoisDependentTaxpayerExemptions(args: {
  readonly baseIncome: number;
  readonly input: StateArtifactsArgs["input"];
  readonly stateReturn: StateArtifactsArgs["stateReturn"];
}): number {
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const taxpayerCanBeClaimed =
    (asBoolean((args.input.household.taxpayer as any)?.can_be_claimed_as_dependent) ??
      args.input.household.can_be_claimed_as_dependent) === true;
  const spouseCanBeClaimed =
    filingStatus === "married_filing_jointly" &&
    asBoolean((args.input.household.spouse as any)?.can_be_claimed_as_dependent) === true;
  const claimedTaxpayerCount = Number(taxpayerCanBeClaimed) + Number(spouseCanBeClaimed);

  if (claimedTaxpayerCount <= 0) {
    return countPersonalExemptions(args.input, filingStatus);
  }

  return args.baseIncome <= claimedTaxpayerCount * ILLINOIS_PERSONAL_EXEMPTION
    ? claimedTaxpayerCount
    : 0;
}

function getIllinoisExemptionAllowance(args: {
  readonly adjustedGrossIncome: number;
  readonly baseIncome: number;
  readonly input: StateArtifactsArgs["input"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateReturn: StateArtifactsArgs["stateReturn"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.personal_exemption_override);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const threshold = filingStatus === "married_filing_jointly" ? 500_000 : 250_000;

  if (args.adjustedGrossIncome > threshold) {
    return 0;
  }

  return (
    (countIllinoisDependentTaxpayerExemptions({
      baseIncome: args.baseIncome,
      input: args.input,
      stateReturn: args.stateReturn,
    }) +
      countDependentExemptions(args.input)) *
      ILLINOIS_PERSONAL_EXEMPTION +
    (countSeniorTaxpayers(args.input) + countBlindTaxpayers(args.input)) *
      ILLINOIS_SENIOR_OR_BLIND_EXEMPTION
  );
}

function calculateIllinoisScheduleCrCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly illinoisBaseIncome: number;
  readonly illinoisTaxBeforeCredits: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.schedule_cr_credit_amount) ??
    asNumber(args.formRecord?.tax_paid_to_other_states_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind === "nonresident") {
    return 0;
  }

  if (args.illinoisBaseIncome <= 0 || args.illinoisTaxBeforeCredits <= 0) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === ILLINOIS_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const illinoisTaxOnClaimedIncome = toWholeDollars(
          args.illinoisTaxBeforeCredits *
            Math.max(Math.min(claim.income_amount / args.illinoisBaseIncome, 1), 0),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, illinoisTaxOnClaimedIncome);
      }, 0),
  );
}

function hasPotentialIllinoisScheduleCrInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === ILLINOIS_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== ILLINOIS_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== ILLINOIS_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function calculateIllinoisEarnedIncomeTaxCredit(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
  readonly prorationRatio: number | null;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.earned_income_tax_credit_amount) ??
    asNumber(args.formRecord?.illinois_earned_income_tax_credit_amount) ??
    asNumber(args.formRecord?.illinois_eitc_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  const baseCredit = toWholeDollars(
    Math.max(args.federalSummary?.line27a_earned_income_credit ?? 0, 0) *
      ILLINOIS_EARNED_INCOME_TAX_CREDIT_RATE,
  );

  if (args.prorationRatio == null) {
    return baseCredit;
  }

  return toWholeDollars(baseCredit * args.prorationRatio);
}

function countIllinoisChildTaxCreditDependents(args: {
  readonly input: StateArtifactsArgs["input"];
}): number {
  return args.input.household.dependents.filter((dependent) => {
    const dateOfBirth = asString(asRecord(dependent)?.date_of_birth);
    const age = getAgeOnLastDayOfTaxYear(dateOfBirth, args.input.tax_year);

    return age != null && age < 12;
  }).length;
}

function calculateIllinoisChildTaxCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly illinoisEarnedIncomeTaxCredit: number;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.child_tax_credit_amount) ??
    asNumber(args.formRecord?.illinois_child_tax_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.illinoisEarnedIncomeTaxCredit <= 0) {
    return 0;
  }

  if (countIllinoisChildTaxCreditDependents({ input: args.input }) <= 0) {
    return 0;
  }

  return toWholeDollars(
    args.illinoisEarnedIncomeTaxCredit * ILLINOIS_CHILD_TAX_CREDIT_RATE,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: ILLINOIS_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, ILLINOIS_FORM_RECORD_KEY);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const allocatedIllinoisAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : toWholeDollars(args.adjustedGrossIncome);
  const line3Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line6Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line9BaseIncome = Math.max(
    allocatedIllinoisAdjustedGrossIncome + line3Additions - line6Subtractions,
    0,
  );
  const line47FederalBaseIncome = Math.max(
    fullYearFederalAdjustedGrossIncome + line3Additions - line6Subtractions,
    0,
  );
  const line10ExemptionAllowance = getIllinoisExemptionAllowance({
    adjustedGrossIncome: fullYearFederalAdjustedGrossIncome,
    baseIncome: line47FederalBaseIncome,
    formRecord,
    input: args.input,
    stateReturn: args.stateReturn,
  });
  const line48IllinoisBaseIncomeRatio =
    isAllocatedReturn && line47FederalBaseIncome > 0 && line9BaseIncome > 0
      ? roundIllinoisRatio(line9BaseIncome / line47FederalBaseIncome)
      : isAllocatedReturn
        ? 0
        : null;
  const line50ProratedExemptionAllowance =
    line48IllinoisBaseIncomeRatio == null
      ? line10ExemptionAllowance
      : toWholeDollars(line10ExemptionAllowance * line48IllinoisBaseIncomeRatio);
  const line11NetIncome = Math.max(
    line9BaseIncome -
      (line50ProratedExemptionAllowance === 0 && !isAllocatedReturn
        ? line10ExemptionAllowance
        : line50ProratedExemptionAllowance),
    0,
  );
  const line14Tax = toWholeDollars(line11NetIncome * ILLINOIS_FLAT_TAX_RATE);
  const line15OtherTax = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line16ScheduleCrCredit = calculateIllinoisScheduleCrCredit({
    formRecord,
    illinoisBaseIncome: line9BaseIncome,
    illinoisTaxBeforeCredits: line14Tax + line15OtherTax,
    stateArtifactsArgs: args,
  });
  const line16NonrefundableCredits = toWholeDollars(
    sumStateNonrefundableCredits(
      args.stateReturn,
      readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
    ) + line16ScheduleCrCredit,
  );
  const line18TotalTax = Math.max(line14Tax + line15OtherTax - line16NonrefundableCredits, 0);
  const line29IllinoisEarnedIncomeTaxCredit = calculateIllinoisEarnedIncomeTaxCredit({
    federalSummary: args.federalSummary,
    formRecord,
    prorationRatio: line48IllinoisBaseIncomeRatio,
  });
  const line30IllinoisChildTaxCredit = calculateIllinoisChildTaxCredit({
    formRecord,
    illinoisEarnedIncomeTaxCredit: line29IllinoisEarnedIncomeTaxCredit,
    input: args.input,
  });
  const line31RefundableCredits = toWholeDollars(
    readNamedAmountArrayTotal(formRecord?.refundable_credits) +
      (asNumber(formRecord?.pass_through_entity_tax_credit) ?? 0) +
      line29IllinoisEarnedIncomeTaxCredit +
      line30IllinoisChildTaxCredit,
  );
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: line31RefundableCredits,
    stateCode: ILLINOIS_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line18TotalTax - payments.totalPayments, 0),
    startingPoint: isAllocatedReturn ? line9BaseIncome : fullYearFederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line11NetIncome,
    totalPayments: payments.totalPayments,
    totalTax: line18TotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point: line9BaseIncome,
        allocation_ratio:
          line48IllinoisBaseIncomeRatio ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Illinois whole-dollar rules",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois Form IL-1040 federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.il.starting_point",
      nodeType: "bridge",
      value: allocatedIllinoisAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.il1040.additions",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois additions",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line3",
      nodeType: "calculation",
      value: line3Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.il1040.subtractions",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois subtractions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line6",
      nodeType: "calculation",
      value: line6Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line1 + line3 - line6, 0)",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois base income",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line9",
      nodeType: "calculation",
      value: line9BaseIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Illinois personal exemption cliff and senior/blind additions",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois exemption allowance",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line10",
      nodeType: "calculation",
      value: line10ExemptionAllowance,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line9 - line10, 0)",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois net income",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line11",
      nodeType: "calculation",
      value: line11NetIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line11 * 0.0495",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois tax before credits",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line14",
      nodeType: "calculation",
      value: line14Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Illinois Schedule CR plus other Illinois nonrefundable credits",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois nonrefundable credits",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line16",
      nodeType: "calculation",
      value: line16NonrefundableCredits,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line14 + line15 - line16, 0)",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois total tax",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line18",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    ...(line16ScheduleCrCredit > 0
      ? [
          createStateNode({
            formCode: "IL-1040-Schedule-CR",
            formulaRef: "Lesser of tax paid to another state or Illinois tax on the same income",
            jurisdiction: ILLINOIS_STATE_CODE,
            label: "Illinois Schedule CR credit",
            lineCode: "line51",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "il.schedule_cr.line51",
            nodeType: "calculation",
            value: line16ScheduleCrCredit,
          }),
        ]
      : []),
    ...(isAllocatedReturn
      ? [
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Illinois Schedule NR Step 5 line 46 base income taxed by Illinois",
            jurisdiction: ILLINOIS_STATE_CODE,
            label: "Illinois Schedule NR Illinois base income",
            lineCode: "schedule_nr.line46",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "il.schedule_nr.line46",
            nodeType: "calculation",
            value: line9BaseIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Illinois Schedule NR Step 5 line 47 federal base income",
            jurisdiction: ILLINOIS_STATE_CODE,
            label: "Illinois Schedule NR federal base income",
            lineCode: "schedule_nr.line47",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "il.schedule_nr.line47",
            nodeType: "calculation",
            value: line47FederalBaseIncome,
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "line46 / line47 rounded to four decimals",
            jurisdiction: ILLINOIS_STATE_CODE,
            label: "Illinois Schedule NR base income ratio",
            lineCode: "schedule_nr.line48",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "il.schedule_nr.line48",
            nodeType: "calculation",
            value:
              line48IllinoisBaseIncomeRatio == null
                ? null
                : line48IllinoisBaseIncomeRatio.toFixed(4),
          }),
          createStateNode({
            formCode: primaryFormCode,
            formulaRef: "Illinois Schedule NR Step 5 line 50 prorated exemption allowance",
            jurisdiction: ILLINOIS_STATE_CODE,
            label: "Illinois Schedule NR prorated exemption allowance",
            lineCode: "schedule_nr.line50",
            moduleId: args.manifest.plugin_manifest_id,
            nodeId: "il.schedule_nr.line50",
            nodeType: "calculation",
            value: line50ProratedExemptionAllowance,
          }),
        ]
      : []),
    createStateNode({
      formCode: "IL-1040-Schedule-IL-E-EITC",
      formulaRef:
        "2025 Schedule IL-E/EITC line 7 federal EIC x 20%, carried through line 8 when Schedule NR proration applies",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois earned income tax credit",
      lineCode: "line29",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line29",
      nodeType: "calculation",
      value: line29IllinoisEarnedIncomeTaxCredit,
    }),
    createStateNode({
      formCode: "IL-1040-Schedule-IL-E-EITC",
      formulaRef:
        "2025 Schedule IL-E/EITC line 11 Illinois earned income tax credit x 20% when at least one dependent is under age 12",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois child tax credit",
      lineCode: "line30",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line30",
      nodeType: "calculation",
      value: line30IllinoisChildTaxCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois total payments",
      lineCode: "line31",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.il1040.line31",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "il1040.line11",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.summary.taxable_income",
      nodeType: "summary",
      value: line11NetIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "il1040.line18",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.summary.total_tax",
      nodeType: "summary",
      value: line18TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "il1040.line31",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line31 - line18, 0)",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line18 - line31, 0)",
      jurisdiction: ILLINOIS_STATE_CODE,
      label: "Illinois amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "il.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.il.starting_point", "carryforward"),
    createStateEdge("bridge.il.starting_point", "il.il1040.line9"),
    createStateEdge("il.il1040.line3", "il.il1040.line9"),
    createStateEdge("il.il1040.line6", "il.il1040.line9"),
    createStateEdge("il.il1040.line9", "il.il1040.line11"),
    createStateEdge("il.il1040.line10", "il.il1040.line11"),
    createStateEdge("il.il1040.line11", "il.il1040.line14"),
    createStateEdge("il.il1040.line16", "il.il1040.line18"),
    createStateEdge("il.il1040.line14", "il.il1040.line18"),
    createStateEdge("il.il1040.line18", "il.summary.total_tax"),
    createStateEdge("il.il1040.line29", "il.il1040.line30"),
    createStateEdge("il.il1040.line29", "il.il1040.line31"),
    createStateEdge("il.il1040.line30", "il.il1040.line31"),
    createStateEdge("il.il1040.line31", "il.summary.total_payments"),
    ...(line16ScheduleCrCredit > 0 ? [createStateEdge("il.schedule_cr.line51", "il.il1040.line16")] : []),
    ...(isAllocatedReturn
      ? [
          createStateEdge("il.schedule_nr.line46", "il.schedule_nr.line48"),
          createStateEdge("il.schedule_nr.line47", "il.schedule_nr.line48"),
          createStateEdge("il.schedule_nr.line48", "il.schedule_nr.line50"),
          createStateEdge("il.schedule_nr.line50", "il.il1040.line11"),
          createStateEdge("il.schedule_nr.line48", "il.il1040.line29"),
        ]
      : []),
  ];

  const validationResults = [];

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          "Illinois Schedule NR proration was applied using Illinois base income, federal base income, and the prorated exemption allowance.",
        nodeIds: [
          "il.schedule_nr.line46",
          "il.schedule_nr.line47",
          "il.schedule_nr.line48",
          "il.schedule_nr.line50",
        ],
        ruleId: "IL.schedule_nr_proration_applied",
        severity: "info",
      }),
    );
  }

  const hasStructuredScheduleCrSupport =
    asNumber(formRecord?.schedule_cr_credit_amount) != null ||
    asNumber(formRecord?.tax_paid_to_other_states_credit) != null ||
    asNumber(formRecord?.other_state_credit_amount) != null ||
    (args.input.facts.state?.other_state_tax_credit_claims ?? []).some(
      (claim) => claim.resident_state_code === ILLINOIS_STATE_CODE,
    );

  if (
    args.stateReturn.return_kind !== "nonresident" &&
    line16ScheduleCrCredit === 0 &&
    !hasStructuredScheduleCrSupport &&
    hasPotentialIllinoisScheduleCrInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Illinois Schedule CR stayed at zero because no structured claim or explicit credit amount was supplied for the other-state tax information on this return.",
        nodeIds: ["il.il1040.line18"],
        ruleId: "IL.schedule_cr_credit_review",
        severity: "info",
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
