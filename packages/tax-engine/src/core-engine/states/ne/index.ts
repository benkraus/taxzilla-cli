import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
  sumNumbers,
} from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
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

const NEBRASKA_STATE_CODE = "NE";
const NEBRASKA_STATE_NAME = "Nebraska";
const NEBRASKA_FORM_RECORD_KEY = "form1040n";
const NEBRASKA_PERSONAL_EXEMPTION_CREDIT = 171;

function calculateNebraskaAdditionalYesCount(args: StateArtifactsArgs): number {
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const countPersonQualifiers = (person: unknown): number => {
    const age = getAgeOnLastDayOfTaxYear(asString(asRecord(person)?.date_of_birth), args.input.tax_year);
    return Number(age != null && age >= 65) + Number(asBoolean(asRecord(person)?.is_blind) === true);
  };
  const taxpayerYesCount = countPersonQualifiers(args.input.household.taxpayer);
  const spouseYesCount =
    args.input.household.spouse != null && filingStatus === "married_filing_jointly"
      ? countPersonQualifiers(args.input.household.spouse)
      : 0;

  return taxpayerYesCount + spouseYesCount;
}

function calculateNebraskaFactDerivedFederalItemizedDeductions(args: {
  readonly adjustedGrossIncome: number;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const itemizedFacts = args.input.facts.itemized_deductions;
  const medicalDeduction = Math.max(
    toWholeDollars(itemizedFacts.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.adjustedGrossIncome * 0.075),
    0,
  );
  const taxesDeduction = toWholeDollars(
    (itemizedFacts.state_and_local_income_or_sales_taxes ?? 0) +
      (itemizedFacts.real_estate_taxes ?? 0) +
      (itemizedFacts.personal_property_taxes ?? 0) +
      (itemizedFacts.other_taxes ?? 0),
  );
  const interestDeduction = toWholeDollars(
    sumNumbers(
      itemizedFacts.mortgage_interest_items.map(
        (item) =>
          (item.mortgage_interest_received ?? 0) +
          (item.points_paid ?? 0) +
          (item.mortgage_insurance_premiums ?? 0),
      ),
    ),
  );
  const charitableDeduction = toWholeDollars(
    (itemizedFacts.charitable_cash_contributions ?? 0) +
      (itemizedFacts.charitable_noncash_contributions ?? 0),
  );
  const casualtyDeduction = toWholeDollars(itemizedFacts.casualty_and_theft_losses ?? 0);
  const otherDeductions = toWholeDollars(
    sumNumbers(itemizedFacts.other_itemized_deductions.map((item) => item.amount)),
  );

  return toWholeDollars(
    medicalDeduction +
      taxesDeduction +
      interestDeduction +
      charitableDeduction +
      casualtyDeduction +
      otherDeductions,
  );
}

function calculateNebraskaStandardDeduction(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): {
  readonly deduction: number;
  readonly itemizedDeductionEstimated: boolean;
  readonly line6StandardDeduction: number;
  readonly line9ItemizedDeduction: number;
} {
  const standardOverride = asNumber(args.formRecord?.standard_deduction_amount);
  const itemizedOverride = asNumber(args.formRecord?.itemized_deductions_total);
  const line6StandardDeduction =
    standardOverride ??
    (() => {
      const yesCountOverride = asNumber(args.formRecord?.additional_standard_deduction_yes_count);
      const yesCount = Math.max(
        0,
        Math.min(
          toWholeDollars(
            yesCountOverride ?? calculateNebraskaAdditionalYesCount(args.stateArtifactsArgs),
          ),
          args.filingStatus === "married_filing_jointly" ? 4 : 2,
        ),
      );

      switch (args.filingStatus) {
        case "married_filing_jointly":
        case "qualifying_surviving_spouse":
          return 17_200 + yesCount * 1_650;
        case "head_of_household":
          return 12_600 + yesCount * 2_000;
        case "married_filing_separately":
          return 8_600 + yesCount * 1_650;
        case "single":
        default:
          return 8_600 + yesCount * 2_000;
      }
    })();
  const factDerivedFederalItemizedDeductions = calculateNebraskaFactDerivedFederalItemizedDeductions({
    adjustedGrossIncome: args.stateArtifactsArgs.adjustedGrossIncome,
    input: args.stateArtifactsArgs.input,
  });
  const itemizedBase = toWholeDollars(
    itemizedOverride ??
      (factDerivedFederalItemizedDeductions > 0
        ? factDerivedFederalItemizedDeductions
        : args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized"
          ? args.stateArtifactsArgs.federalSummary.itemized_deduction_total
          : 0),
  );
  const stateAndLocalIncomeTaxes =
    asNumber(args.formRecord?.state_and_local_income_taxes_amount) ??
    (args.stateArtifactsArgs.input.facts.itemized_deductions.state_and_local_income_or_sales_taxes ?? 0);
  const line9ItemizedDeduction = Math.max(
    toWholeDollars(itemizedBase - stateAndLocalIncomeTaxes),
    0,
  );
  const deduction = Math.max(line6StandardDeduction, line9ItemizedDeduction);

  return {
    deduction,
    itemizedDeductionEstimated:
      factDerivedFederalItemizedDeductions <= 0 &&
      args.stateArtifactsArgs.federalSummary?.deduction_strategy === "itemized" &&
      itemizedOverride == null,
    line6StandardDeduction: toWholeDollars(line6StandardDeduction),
    line9ItemizedDeduction,
  };
}

function calculateNebraskaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly nebraskaAdjustedGrossIncome: number;
  readonly stateArtifactsArgs: StateArtifactsArgs;
  readonly totalTaxBeforeCredits: number;
}): number {
  const explicitCredit = asNumber(args.formRecord?.tax_paid_to_other_state_credit);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (
    args.stateArtifactsArgs.stateReturn.return_kind !== "resident" ||
    args.nebraskaAdjustedGrossIncome <= 0 ||
    args.totalTaxBeforeCredits <= 0
  ) {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === NEBRASKA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const ratio = Math.max(Math.min(claim.income_amount / args.nebraskaAdjustedGrossIncome, 1), 0);
        const nebraskaCreditLimit = toWholeDollars(args.totalTaxBeforeCredits * ratio);
        const creditableTax = claim.creditable_tax ?? claim.tax_paid;

        return total + Math.min(creditableTax, nebraskaCreditLimit);
      }, 0),
  );
}

function calculateNebraskaIncomeTax(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
  taxableIncome: number,
): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  switch (filingStatus) {
    case "married_filing_jointly":
    case "qualifying_surviving_spouse":
      if (taxableIncome <= 8_040) {
        return toWholeDollars(taxableIncome * 0.0246);
      }

      if (taxableIncome <= 48_250) {
        return toWholeDollars(197.78 + (taxableIncome - 8_040) * 0.0351);
      }

      if (taxableIncome <= 77_730) {
        return toWholeDollars(1_609.15 + (taxableIncome - 48_250) * 0.0501);
      }

      return toWholeDollars(3_086.1 + (taxableIncome - 77_730) * 0.052);
    case "head_of_household":
      if (taxableIncome <= 7_510) {
        return toWholeDollars(taxableIncome * 0.0246);
      }

      if (taxableIncome <= 38_590) {
        return toWholeDollars(184.75 + (taxableIncome - 7_510) * 0.0351);
      }

      if (taxableIncome <= 57_630) {
        return toWholeDollars(1_275.66 + (taxableIncome - 38_590) * 0.0501);
      }

      return toWholeDollars(2_229.56 + (taxableIncome - 57_630) * 0.052);
    case "married_filing_separately":
    case "single":
    default:
      if (taxableIncome <= 4_030) {
        return toWholeDollars(taxableIncome * 0.0246);
      }

      if (taxableIncome <= 24_120) {
        return toWholeDollars(99.14 + (taxableIncome - 4_030) * 0.0351);
      }

      if (taxableIncome <= 38_870) {
        return toWholeDollars(804.3 + (taxableIncome - 24_120) * 0.0501);
      }

      return toWholeDollars(1_543.28 + (taxableIncome - 38_870) * 0.052);
  }
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: NEBRASKA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, NEBRASKA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line5FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const deduction = calculateNebraskaStandardDeduction({
    filingStatus,
    formRecord,
    stateArtifactsArgs: args,
  });
  const line11NebraskaIncomeBeforeAdjustments = Math.max(
    line5FederalAdjustedGrossIncome - deduction.deduction,
    0,
  );
  const line12Additions = sumStateAdditionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.additions),
  );
  const line13Subtractions = sumStateSubtractionAmounts(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.subtractions),
  );
  const nebraskaAdjustedGrossIncome = Math.max(
    line5FederalAdjustedGrossIncome + line12Additions - line13Subtractions,
    0,
  );
  const line14NebraskaTaxableIncome = Math.max(
    line11NebraskaIncomeBeforeAdjustments + line12Additions - line13Subtractions,
    0,
  );
  const line15IncomeTax =
    asNumber(formRecord?.income_tax_amount) ??
    calculateNebraskaIncomeTax(filingStatus, line14NebraskaTaxableIncome);
  const line16OtherTaxes = toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0);
  const line17TotalTaxBeforeCredits = toWholeDollars(line15IncomeTax + line16OtherTaxes);
  const line18PersonalExemptionCredit = toWholeDollars(
    asNumber(formRecord?.personal_exemption_credit_amount) ??
      (countPersonalExemptions(args.input, filingStatus) + countDependentExemptions(args.input)) *
        NEBRASKA_PERSONAL_EXEMPTION_CREDIT,
  );
  const taxPaidToOtherStateCredit = calculateNebraskaOtherStateCredit({
    formRecord,
    nebraskaAdjustedGrossIncome,
    stateArtifactsArgs: args,
    totalTaxBeforeCredits: line17TotalTaxBeforeCredits,
  });
  const line20OtherNonrefundableCredits = sumStateNonrefundableCredits(
    args.stateReturn,
    readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + taxPaidToOtherStateCredit,
  );
  const line24TotalTax = Math.max(
    line17TotalTaxBeforeCredits - line18PersonalExemptionCredit - line20OtherNonrefundableCredits,
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: NEBRASKA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line24TotalTax - payments.totalPayments, 0),
    startingPoint: line5FederalAdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line14NebraskaTaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line24TotalTax,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 rounded to Nebraska whole-dollar rules",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska Form 1040N federal adjusted gross income starting point",
      lineCode: "line5",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.ne.starting_point",
      nodeType: "bridge",
      value: line5FederalAdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Nebraska standard deduction chart with age-65/blind adjustments or plugin override",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska standard deduction",
      lineCode: "line6",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line6",
      nodeType: "calculation",
      value: deduction.line6StandardDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "federal itemized deductions less state and local income taxes",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska itemized deductions",
      lineCode: "line9",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line9",
      nodeType: "calculation",
      value: deduction.line9ItemizedDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line6, line9)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska deduction",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line10",
      nodeType: "calculation",
      value: deduction.deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line5 - line10, 0)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska income before adjustments",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line11",
      nodeType: "calculation",
      value: line11NebraskaIncomeBeforeAdjustments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state additions + state_specific_income_items + plugin_fact_bag.form1040n.additions",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska adjustments increasing federal AGI",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line12",
      nodeType: "calculation",
      value: line12Additions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state subtractions + state_specific_deductions + plugin_fact_bag.form1040n.subtractions",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska adjustments decreasing federal AGI",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line13",
      nodeType: "calculation",
      value: line13Subtractions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line11 + line12 - line13, 0)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska taxable income",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line14",
      nodeType: "calculation",
      value: line14NebraskaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Nebraska resident tax calculation schedule",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska income tax",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line15",
      nodeType: "calculation",
      value: line15IncomeTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line15 + line16",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska tax before personal exemption credit",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line17",
      nodeType: "calculation",
      value: line17TotalTaxBeforeCredits,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "$171 times Nebraska personal exemptions or plugin override",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska personal exemption credit",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line18",
      nodeType: "calculation",
      value: line18PersonalExemptionCredit,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line17 - line18 - line20, 0)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska total tax",
      lineCode: "line24",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line24",
      nodeType: "summary",
      value: line24TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska total payments",
      lineCode: "line33",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.form1040n.line33",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form1040n.line14",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.summary.taxable_income",
      nodeType: "summary",
      value: line14NebraskaTaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form1040n.line24",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.summary.total_tax",
      nodeType: "summary",
      value: line24TotalTax,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form1040n.line33",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska summary total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line33 - line24, 0)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line24 - line33, 0)",
      jurisdiction: NEBRASKA_STATE_CODE,
      label: "Nebraska amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "ne.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.ne.starting_point", "carryforward"),
    createStateEdge("bridge.ne.starting_point", "ne.form1040n.line11"),
    createStateEdge("ne.form1040n.line10", "ne.form1040n.line11"),
    createStateEdge("ne.form1040n.line11", "ne.form1040n.line14"),
    createStateEdge("ne.form1040n.line12", "ne.form1040n.line14"),
    createStateEdge("ne.form1040n.line13", "ne.form1040n.line14"),
    createStateEdge("ne.form1040n.line14", "ne.form1040n.line15"),
    createStateEdge("ne.form1040n.line15", "ne.form1040n.line17"),
    createStateEdge("ne.form1040n.line17", "ne.form1040n.line24"),
    createStateEdge("ne.form1040n.line18", "ne.form1040n.line24"),
    createStateEdge("ne.form1040n.line24", "ne.summary.total_tax"),
    createStateEdge("ne.form1040n.line33", "ne.summary.total_payments"),
  ];

  const validationResults = [];

  if (deduction.itemizedDeductionEstimated) {
    validationResults.push(
      buildValidationResult({
        message:
          "Nebraska itemized deductions were derived from the federal Schedule A total less state and local income taxes. Vehicle-tax detail from the Nebraska booklet was not separately supplied on this path.",
        nodeIds: ["ne.form1040n.line9", "ne.form1040n.line10"],
        ruleId: "NE.itemized_deduction_derived_from_federal_schedule_a",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    args.input.requested_jurisdictions.states.length > 1 &&
    taxPaidToOtherStateCredit === 0 &&
    (args.input.facts.state?.other_state_tax_credit_claims ?? []).filter(
      (claim) => claim.resident_state_code === NEBRASKA_STATE_CODE,
    ).length === 0 &&
    !args.stateReturn.state_specific_credits.some(
      (credit) => asString(credit.description)?.toLowerCase().includes("other state"),
    )
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Nebraska credit for tax paid to another state stayed at zero because no Schedule II style claim amount was supplied for the available multistate facts.",
        nodeIds: ["ne.form1040n.line24"],
        ruleId: "NE.other_state_credit_review",
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
