import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveAllocationRatio, deriveCombinedStateTaxedIncome } from "../return-kind";
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
} from "../resident";

const RHODE_ISLAND_STATE_CODE = "RI";
const RHODE_ISLAND_STATE_NAME = "Rhode Island";
const RHODE_ISLAND_FORM_RECORD_KEY = "ri1040";
const RHODE_ISLAND_EXEMPTION_AMOUNT = 5_100;
const RHODE_ISLAND_EXEMPTION_PHASEOUT_THRESHOLD = 254_250;
const RHODE_ISLAND_PHASEOUT_INCREMENT = 7_250;
const RHODE_ISLAND_PHASEOUT_MAX_EXCESS = 29_000;
const RHODE_ISLAND_PHASEOUT_STEP = 0.2;

function roundRhodeIslandAllocationPercentage(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function calculateRhodeIslandStandardDeduction(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  if (filingStatus === "married_filing_jointly") {
    return 21_800;
  }

  if (filingStatus === "head_of_household") {
    return 16_350;
  }

  return 10_900;
}

function calculateRhodeIslandTax(taxableIncome: number): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  if (taxableIncome <= 79_900) {
    return toWholeDollars(taxableIncome * 0.0375);
  }

  if (taxableIncome <= 181_650) {
    return toWholeDollars(taxableIncome * 0.0475 - 799);
  }

  return toWholeDollars(taxableIncome * 0.0599 - 3_051.46);
}

function calculateRhodeIslandPhaseoutMultiplier(modifiedFederalAdjustedGrossIncome: number): number {
  const excessIncome =
    modifiedFederalAdjustedGrossIncome - RHODE_ISLAND_EXEMPTION_PHASEOUT_THRESHOLD;

  if (excessIncome <= 0) {
    return 1;
  }

  if (excessIncome > RHODE_ISLAND_PHASEOUT_MAX_EXCESS) {
    return 0;
  }

  const reductionSteps = Math.ceil(excessIncome / RHODE_ISLAND_PHASEOUT_INCREMENT);

  return Math.max(1 - reductionSteps * RHODE_ISLAND_PHASEOUT_STEP, 0);
}

function applyRhodeIslandWorksheetPhaseout(args: {
  readonly baseAmount: number;
  readonly modifiedFederalAdjustedGrossIncome: number;
}): number {
  return toWholeDollars(
    args.baseAmount *
      calculateRhodeIslandPhaseoutMultiplier(args.modifiedFederalAdjustedGrossIncome),
  );
}

function calculateRhodeIslandOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly line3ModifiedFederalAdjustedGrossIncome: number;
  readonly line8Tax: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return Math.max(toWholeDollars(explicitCredit), 0);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind === "nonresident" ||
    args.line3ModifiedFederalAdjustedGrossIncome <= 0 ||
    args.line8Tax <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter(
        (claim) =>
          claim.resident_state_code === RHODE_ISLAND_STATE_CODE && claim.income_amount > 0,
      )
      .reduce((total, claim) => {
        const rhodeIslandLimitation = toWholeDollars(
          args.line8Tax *
            Math.max(
              Math.min(
                claim.income_amount / args.line3ModifiedFederalAdjustedGrossIncome,
                1,
              ),
              0,
            ),
        );
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, rhodeIslandLimitation);
      }, 0),
  );
}

function hasPotentialRhodeIslandOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === RHODE_ISLAND_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== RHODE_ISLAND_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== RHODE_ISLAND_STATE_CODE &&
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
      stateName: RHODE_ISLAND_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, RHODE_ISLAND_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalAdjustedGrossIncome = toWholeDollars(
    args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome,
  );
  const rhodeIslandAdjustedGrossIncome = isAllocatedReturn
    ? toWholeDollars(deriveCombinedStateTaxedIncome(args.stateReturn) ?? args.adjustedGrossIncome)
    : fullYearFederalAdjustedGrossIncome;
  const allocationRatio =
    deriveAllocationRatio(args.stateReturn) ??
    (isAllocatedReturn && fullYearFederalAdjustedGrossIncome > 0
      ? rhodeIslandAdjustedGrossIncome / fullYearFederalAdjustedGrossIncome
      : null);
  const line1FederalAdjustedGrossIncome = fullYearFederalAdjustedGrossIncome;
  const additionTotal = sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions));
  const subtractionTotal = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const line2NetModifications = additionTotal - subtractionTotal;
  const line3ModifiedFederalAdjustedGrossIncome = line1FederalAdjustedGrossIncome + line2NetModifications;
  const line4Deduction = toWholeDollars(
    asNumber(formRecord?.standard_deduction_amount) ??
      applyRhodeIslandWorksheetPhaseout({
        baseAmount: calculateRhodeIslandStandardDeduction(filingStatus),
        modifiedFederalAdjustedGrossIncome: line3ModifiedFederalAdjustedGrossIncome,
      }),
  );
  const line5IncomeAfterDeduction = Math.max(line3ModifiedFederalAdjustedGrossIncome - line4Deduction, 0);
  const line6Exemptions = toWholeDollars(
    asNumber(formRecord?.exemption_amount) ??
      applyRhodeIslandWorksheetPhaseout({
        baseAmount:
          (countPersonalExemptions(args.input, filingStatus) +
            countDependentExemptions(args.input)) *
          RHODE_ISLAND_EXEMPTION_AMOUNT,
        modifiedFederalAdjustedGrossIncome: line3ModifiedFederalAdjustedGrossIncome,
      }),
  );
  const line7TaxableIncome = Math.max(line5IncomeAfterDeduction - line6Exemptions, 0);
  const line8Tax = toWholeDollars(
    asNumber(formRecord?.income_tax_amount) ?? calculateRhodeIslandTax(line7TaxableIncome),
  );
  const otherStateCredit = calculateRhodeIslandOtherStateCredit({
    formRecord,
    line3ModifiedFederalAdjustedGrossIncome,
    line8Tax,
    stateArtifactsArgs: args,
  });
  const line10aIncomeTaxAfterCredits = Math.max(
    line8Tax -
      sumStateNonrefundableCredits(
        args.stateReturn,
        readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + otherStateCredit,
      ),
    0,
  );
  const scheduleLine12AllocatedRhodeIslandIncome = isAllocatedReturn
    ? Math.max(
        rhodeIslandAdjustedGrossIncome +
          toWholeDollars(
            asNumber(
              args.returnKindContext?.returnKind === "part_year_resident"
                ? formRecord?.schedule_iii_net_modifications_amount
                : formRecord?.schedule_ii_net_modifications_amount,
            ) ??
              asNumber(formRecord?.allocated_net_modifications_amount) ??
              line2NetModifications * Math.max(allocationRatio ?? 0, 0),
          ),
        0,
      )
    : null;
  const scheduleAllocationPercentage =
    isAllocatedReturn &&
    line3ModifiedFederalAdjustedGrossIncome > 0 &&
    scheduleLine12AllocatedRhodeIslandIncome != null &&
    scheduleLine12AllocatedRhodeIslandIncome > 0
      ? roundRhodeIslandAllocationPercentage(
          scheduleLine12AllocatedRhodeIslandIncome / line3ModifiedFederalAdjustedGrossIncome,
        )
      : isAllocatedReturn
        ? 0
        : null;
  const line11AllocatedIncomeTax =
    scheduleAllocationPercentage == null
      ? line10aIncomeTaxAfterCredits
      : toWholeDollars(line10aIncomeTaxAfterCredits * scheduleAllocationPercentage);
  const line13aTotalTax = Math.max(
    line11AllocatedIncomeTax + toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0),
    0,
  );
  const allocatedTaxableIncome =
    scheduleAllocationPercentage == null
      ? line7TaxableIncome
      : toWholeDollars(line7TaxableIncome * scheduleAllocationPercentage);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: RHODE_ISLAND_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line13aTotalTax - payments.totalPayments, 0),
    startingPoint: scheduleLine12AllocatedRhodeIslandIncome ?? line1FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: allocatedTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line13aTotalTax,
  });
  const summaryWithAllocatedOverrides = isAllocatedReturn
    ? {
        ...summary,
        adjusted_gross_income_or_starting_point:
          scheduleLine12AllocatedRhodeIslandIncome ?? summary.adjusted_gross_income_or_starting_point,
        allocation_ratio: scheduleAllocationPercentage ?? summary.allocation_ratio ?? null,
      }
    : summary;

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island federal adjusted gross income starting point",
      lineCode: "line1",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ri.starting_point",
      nodeType: "bridge",
      value: line1FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Rhode Island additions minus subtractions",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island net modifications",
      lineCode: "line2",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line2",
      nodeType: "calculation",
      value: line2NetModifications,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line1 + line2",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island modified federal adjusted gross income",
      lineCode: "line3",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line3",
      nodeType: "calculation",
      value: line3ModifiedFederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Rhode Island standard deduction",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island deduction",
      lineCode: "line4",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line4",
      nodeType: "calculation",
      value: line4Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line3 - line4, 0)",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island income after deduction",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line5",
      nodeType: "calculation",
      value: line5IncomeAfterDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Rhode Island exemptions",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island exemptions",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line6",
      nodeType: "calculation",
      value: line6Exemptions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line5 - line6, 0)",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island taxable income",
      lineCode: "line7",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line7",
      nodeType: "calculation",
      value: line7TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Rhode Island TY2025 tax computation worksheet",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island tax before credits",
      lineCode: "line8",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line8",
      nodeType: "calculation",
      value: line8Tax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line8 - credits, 0)",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island income tax after credits",
      lineCode: "line10a",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.ri1040.line10a",
      nodeType: "calculation",
      value: line10aIncomeTaxAfterCredits,
    }),
    ...(isAllocatedReturn
        ? args.returnKindContext?.returnKind === "nonresident"
          ? [
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule II line 12, Column A Rhode Island modified federal AGI",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule II Rhode Island modified federal AGI",
                lineCode: "schedule_ii.line12a",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_ii.line12a",
                nodeType: "calculation",
                value: scheduleLine12AllocatedRhodeIslandIncome,
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule II line 12, Column B modified federal AGI",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule II total modified federal AGI",
                lineCode: "schedule_ii.line12b",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_ii.line12b",
                nodeType: "calculation",
                value: line3ModifiedFederalAdjustedGrossIncome,
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule II line 13 allocation percentage",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule II allocation percentage",
                lineCode: "schedule_ii.line13",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_ii.line13",
                nodeType: "calculation",
                value: scheduleAllocationPercentage?.toFixed(4) ?? "0.0000",
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule II line 15 tax after credits before allocation",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule II tax before allocation",
                lineCode: "schedule_ii.line15",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_ii.line15",
                nodeType: "calculation",
                value: line10aIncomeTaxAfterCredits,
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule II line 16 Rhode Island income tax",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule II Rhode Island income tax",
                lineCode: "schedule_ii.line16",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_ii.line16",
                nodeType: "calculation",
                value: line11AllocatedIncomeTax,
              }),
            ]
          : [
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule III line 13 Rhode Island total income",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule III Rhode Island total income",
                lineCode: "schedule_iii.line13",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_iii.line13",
                nodeType: "calculation",
                value: scheduleLine12AllocatedRhodeIslandIncome,
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule III line 14 allocation percentage",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule III allocation percentage",
                lineCode: "schedule_iii.line14",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_iii.line14",
                nodeType: "calculation",
                value: scheduleAllocationPercentage?.toFixed(4) ?? "0.0000",
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule III line 15 tax after credits before allocation",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule III tax before allocation",
                lineCode: "schedule_iii.line15",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_iii.line15",
                nodeType: "calculation",
                value: line10aIncomeTaxAfterCredits,
              }),
              createStateNode({
                formCode: primaryFormCode,
                formulaRef: "Rhode Island Schedule III line 16 Rhode Island income tax",
                jurisdiction: RHODE_ISLAND_STATE_CODE,
                label: "Rhode Island Schedule III Rhode Island income tax",
                lineCode: "schedule_iii.line16",
                moduleId: args.manifest.plugin_manifest_id,
                nodeId: "ri.schedule_iii.line16",
                nodeType: "calculation",
                value: line11AllocatedIncomeTax,
              }),
            ]
        : []),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef:
          scheduleAllocationPercentage == null
            ? "line10a + other taxes"
            : "schedule II or III line16 + other taxes",
        jurisdiction: RHODE_ISLAND_STATE_CODE,
        label: "Rhode Island total tax",
        lineCode: "line13a",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "ri.ri1040.line13a",
        nodeType: "summary",
        value: line13aTotalTax,
      }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef:
        scheduleAllocationPercentage == null ? "ri1040.line7" : "ri1040.line7 * schedule allocation percentage",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.summary.taxable_income",
      nodeType: "summary",
      value: allocatedTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "ri1040.line13a",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.summary.total_tax",
      nodeType: "summary",
      value: line13aTotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(total payments - total tax, 0)",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.summary.refund_amount",
      nodeType: "summary",
      value: summaryWithAllocatedOverrides.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(total tax - total payments, 0)",
      jurisdiction: RHODE_ISLAND_STATE_CODE,
      label: "Rhode Island amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ri.summary.amount_owed",
      nodeType: "summary",
      value: summaryWithAllocatedOverrides.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ri.starting_point", "carryforward"),
    createStateEdge("bridge.ri.starting_point", "ri.ri1040.line3"),
    createStateEdge("ri.ri1040.line2", "ri.ri1040.line3"),
    createStateEdge("ri.ri1040.line3", "ri.ri1040.line5"),
    createStateEdge("ri.ri1040.line4", "ri.ri1040.line5"),
    createStateEdge("ri.ri1040.line5", "ri.ri1040.line7"),
    createStateEdge("ri.ri1040.line6", "ri.ri1040.line7"),
    createStateEdge("ri.ri1040.line7", "ri.ri1040.line8"),
    createStateEdge("ri.ri1040.line8", "ri.ri1040.line10a"),
    ...(isAllocatedReturn
      ? args.returnKindContext?.returnKind === "nonresident"
        ? [
            createStateEdge("ri.schedule_ii.line12a", "ri.schedule_ii.line13"),
            createStateEdge("ri.schedule_ii.line12b", "ri.schedule_ii.line13"),
            createStateEdge("ri.ri1040.line10a", "ri.schedule_ii.line15"),
            createStateEdge("ri.schedule_ii.line13", "ri.schedule_ii.line16"),
            createStateEdge("ri.schedule_ii.line15", "ri.schedule_ii.line16"),
            createStateEdge("ri.schedule_ii.line16", "ri.ri1040.line13a"),
          ]
        : [
            createStateEdge("ri.schedule_iii.line13", "ri.schedule_iii.line14"),
            createStateEdge("ri.ri1040.line10a", "ri.schedule_iii.line15"),
            createStateEdge("ri.schedule_iii.line14", "ri.schedule_iii.line16"),
            createStateEdge("ri.schedule_iii.line15", "ri.schedule_iii.line16"),
            createStateEdge("ri.schedule_iii.line16", "ri.ri1040.line13a"),
          ]
      : [createStateEdge("ri.ri1040.line10a", "ri.ri1040.line13a")]),
    createStateEdge("ri.ri1040.line13a", "ri.summary.total_tax"),
    createStateEdge("ri.summary.total_payments", "ri.summary.refund_amount"),
    createStateEdge("ri.summary.total_payments", "ri.summary.amount_owed"),
  ];

  const validationResults: StateArtifactsResult["validationResults"] = [];
  if (line3ModifiedFederalAdjustedGrossIncome > RHODE_ISLAND_EXEMPTION_PHASEOUT_THRESHOLD) {
    validationResults.push(
      buildValidationResult({
        message:
          "Rhode Island TY2025 deduction and exemption phaseouts were applied using the official high-income worksheet.",
        nodeIds: ["ri.ri1040.line4", "ri.ri1040.line6"],
        ruleId: "RI.deduction_and_exemption_phaseout_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (otherStateCredit === 0 && hasPotentialRhodeIslandOtherStateCreditInputs(args)) {
    validationResults.push(
      buildValidationResult({
        message:
          "Rhode Island credit for tax paid to another state stayed at zero because no RI-1040MU style claim amount was supplied for the available multistate facts.",
        nodeIds: ["ri.ri1040.line10a"],
        ruleId: "RI.other_state_credit_review",
        severity: "info",
      }),
    );
  }

  if (isAllocatedReturn) {
    validationResults.push(
      buildValidationResult({
        message:
          args.returnKindContext?.returnKind === "nonresident"
            ? "Rhode Island Schedule II allocation was applied using modified federal adjusted gross income and Rhode Island income tax before allocation."
            : "Rhode Island Schedule III allocation was applied using Rhode Island total income and Rhode Island income tax before allocation.",
        nodeIds:
          args.returnKindContext?.returnKind === "nonresident"
            ? [
                "ri.schedule_ii.line12a",
                "ri.schedule_ii.line12b",
                "ri.schedule_ii.line13",
                "ri.schedule_ii.line16",
              ]
            : [
                "ri.schedule_iii.line13",
                "ri.schedule_iii.line14",
                "ri.schedule_iii.line16",
              ],
        ruleId:
          args.returnKindContext?.returnKind === "nonresident"
            ? "RI.schedule_ii_allocation_applied"
            : "RI.schedule_iii_allocation_applied",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    isAllocatedReturn &&
    line2NetModifications !== 0 &&
    asNumber(formRecord?.allocated_net_modifications_amount) == null &&
    asNumber(formRecord?.schedule_ii_net_modifications_amount) == null &&
    asNumber(formRecord?.schedule_iii_net_modifications_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Rhode Island Schedule II/III net modifications were not supplied explicitly, so the engine apportioned Rhode Island modifications using the state allocation profile ratio.",
        nodeIds:
          args.returnKindContext?.returnKind === "nonresident"
            ? ["ri.schedule_ii.line12a", "ri.schedule_ii.line13"]
            : ["ri.schedule_iii.line13", "ri.schedule_iii.line14"],
        ruleId:
          args.returnKindContext?.returnKind === "nonresident"
            ? "RI.schedule_ii_modifications_allocated"
            : "RI.schedule_iii_modifications_allocated",
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
