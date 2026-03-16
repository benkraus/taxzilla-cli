import { asBoolean, asNumber, sumNamedAmounts, sumNumbers } from "../../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../../common";
import {
  buildResidentStateSummary,
  buildResidentUnsupportedArtifacts,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
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

const ALABAMA_STATE_CODE = "AL";
const ALABAMA_STATE_NAME = "Alabama";
const ALABAMA_FORM_RECORD_KEY = "form40";

function calculateAlabamaItemizedDeduction(args: {
  readonly adjustedGrossIncome: number;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): number {
  const overrideAmount = asNumber(args.formRecord?.itemized_deductions_total);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const itemizedFacts = args.input.facts.itemized_deductions;
  const medicalDeduction = Math.max(
    toWholeDollars(itemizedFacts.medical_and_dental_expenses ?? 0) -
      toWholeDollars(args.adjustedGrossIncome * 0.04),
    0,
  );
  const taxesDeduction = toWholeDollars(
    asNumber(args.formRecord?.alabama_schedule_a_taxes_amount) ??
      asNumber(args.formRecord?.deductible_taxes_amount) ??
      (itemizedFacts.real_estate_taxes ?? 0) +
        (itemizedFacts.personal_property_taxes ?? 0) +
        (itemizedFacts.other_taxes ?? 0),
  );
  const interestDeduction = toWholeDollars(
    asNumber(args.formRecord?.alabama_schedule_a_interest_amount) ??
      sumNumbers(
        itemizedFacts.mortgage_interest_items.map(
          (item) =>
            (item.mortgage_interest_received ?? 0) +
            (item.points_paid ?? 0) +
            (item.mortgage_insurance_premiums ?? 0),
        ),
      ) +
        toWholeDollars(asNumber(args.formRecord?.qualified_vehicle_loan_interest_deduction_amount) ?? 0),
  );
  const charitableDeduction = toWholeDollars(
    asNumber(args.formRecord?.alabama_schedule_a_charitable_contributions_amount) ??
      (itemizedFacts.charitable_cash_contributions ?? 0) +
        (itemizedFacts.charitable_noncash_contributions ?? 0),
  );
  const casualtyDeduction = toWholeDollars(
    asNumber(args.formRecord?.alabama_schedule_a_casualty_losses_amount) ??
      (itemizedFacts.casualty_and_theft_losses ?? 0),
  );
  const otherDeductions = toWholeDollars(
    asNumber(args.formRecord?.alabama_schedule_a_other_deductions_amount) ??
      sumNamedAmounts(itemizedFacts.other_itemized_deductions),
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

function calculateAlabamaFederalTaxDeduction(args: {
  readonly federalSummary: StateArtifactsArgs["federalSummary"];
  readonly formRecord: Record<string, unknown> | undefined;
}): number {
  const overrideAmount = asNumber(args.formRecord?.federal_tax_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const explicitFederalLine22Tax = asNumber(args.formRecord?.federal_form_1040_line22_tax_amount);
  const explicitNetInvestmentIncomeTax = asNumber(args.formRecord?.federal_form_8960_line17_amount);
  const explicitForm2439Credit = asNumber(args.formRecord?.credits_from_form_2439_amount) ?? 0;
  const explicitRefundableAdoptionCredit =
    asNumber(args.formRecord?.refundable_adoption_credit_amount) ?? 0;
  const earnedIncomeCredit = args.federalSummary?.line27a_earned_income_credit ?? 0;
  const additionalChildTaxCredit = args.federalSummary?.line28_additional_child_tax_credit ?? 0;
  const refundableEducationCredit = args.federalSummary?.line29_refundable_education_credit ?? 0;

  if (explicitFederalLine22Tax != null) {
    return Math.max(
      toWholeDollars(
        explicitFederalLine22Tax +
          (explicitNetInvestmentIncomeTax ?? 0) -
          earnedIncomeCredit -
          additionalChildTaxCredit -
          refundableEducationCredit -
          explicitRefundableAdoptionCredit -
          explicitForm2439Credit,
      ),
      0,
    );
  }

  if (!args.federalSummary) {
    return 0;
  }

  return Math.max(
    toWholeDollars(
      args.federalSummary.line24_total_tax -
        earnedIncomeCredit -
        additionalChildTaxCredit -
        refundableEducationCredit -
        explicitRefundableAdoptionCredit -
        explicitForm2439Credit,
    ),
    0,
  );
}

function calculateAlabamaOtherStateCredit(args: {
  readonly formRecord: Record<string, unknown> | undefined;
  readonly stateArtifactsArgs: StateArtifactsArgs;
}): number {
  const explicitCredit =
    asNumber(args.formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(args.formRecord?.other_state_credit_amount);

  if (explicitCredit != null) {
    return toWholeDollars(explicitCredit);
  }

  if (args.stateArtifactsArgs.stateReturn.return_kind !== "resident") {
    return 0;
  }

  return toWholeDollars(
    (args.stateArtifactsArgs.input.facts.state?.other_state_tax_credit_claims ?? [])
      .filter((claim) => claim.resident_state_code === ALABAMA_STATE_CODE)
      .reduce((total, claim) => {
        if (claim.income_amount <= 0) {
          return total;
        }

        const creditableTax = claim.creditable_tax ?? claim.tax_paid;
        const alabamaTaxOnClaimedIncome = calculateAlabamaTax({
          filingStatus: normalizeResidentFilingStatus(
            args.stateArtifactsArgs.input,
            args.stateArtifactsArgs.stateReturn,
          ),
          taxableIncome: Math.max(toWholeDollars(claim.income_amount), 0),
        });

        return total + Math.min(creditableTax, alabamaTaxOnClaimedIncome);
      }, 0),
  );
}

function hasPotentialAlabamaOtherStateCreditInputs(args: StateArtifactsArgs): boolean {
  const stateFacts = args.input.facts.state;

  if (stateFacts == null) {
    return false;
  }

  if (
    stateFacts.other_state_tax_credit_claims.some(
      (claim) => claim.resident_state_code === ALABAMA_STATE_CODE,
    )
  ) {
    return true;
  }

  if (
    stateFacts.withholding.some(
      (entry) =>
        entry.jurisdiction_level === "state" &&
        entry.state_code !== "" &&
        entry.state_code !== ALABAMA_STATE_CODE &&
        entry.amount > 0,
    )
  ) {
    return true;
  }

  return stateFacts.income_sourcing.some(
    (entry) =>
      entry.state_code !== "" &&
      entry.state_code !== ALABAMA_STATE_CODE &&
      Math.max(
        entry.resident_period_amount ?? 0,
        entry.state_source_amount ?? 0,
        entry.total_amount,
      ) > 0,
  );
}

function calculateAlabamaStandardDeduction(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
  adjustedGrossIncome: number,
): number {
  if (filingStatus === "married_filing_separately") {
    if (adjustedGrossIncome <= 12_999) {
      return 4_250;
    }

    if (adjustedGrossIncome >= 17_750) {
      return 2_500;
    }

    return 4_250 - (Math.floor((adjustedGrossIncome - 13_000) / 250) + 1) * 88;
  }

  if (filingStatus === "head_of_household") {
    if (adjustedGrossIncome <= 25_999) {
      return 5_200;
    }

    if (adjustedGrossIncome >= 35_500) {
      return 2_500;
    }

    return 5_200 - (Math.floor((adjustedGrossIncome - 26_000) / 500) + 1) * 135;
  }

  if (filingStatus === "married_filing_jointly") {
    if (adjustedGrossIncome <= 25_999) {
      return 8_500;
    }

    if (adjustedGrossIncome >= 35_500) {
      return 5_000;
    }

    return 8_500 - (Math.floor((adjustedGrossIncome - 26_000) / 500) + 1) * 175;
  }

  if (adjustedGrossIncome <= 25_999) {
    return 3_000;
  }

  if (adjustedGrossIncome >= 35_500) {
    return 2_500;
  }

  return 3_000 - (Math.floor((adjustedGrossIncome - 26_000) / 500) + 1) * 25;
}

function calculateAlabamaPersonalExemption(
  filingStatus: ReturnType<typeof normalizeResidentFilingStatus>,
): number {
  return filingStatus === "married_filing_jointly" || filingStatus === "head_of_household"
    ? 3_000
    : 1_500;
}

function calculateAlabamaDependentExemption(args: {
  readonly adjustedGrossIncome: number;
  readonly dependentCount: number;
}): number {
  if (args.dependentCount <= 0) {
    return 0;
  }

  if (args.adjustedGrossIncome <= 50_000) {
    return args.dependentCount * 1_000;
  }

  if (args.adjustedGrossIncome <= 100_000) {
    return args.dependentCount * 500;
  }

  return args.dependentCount * 300;
}

function calculateAlabamaTax(args: {
  readonly filingStatus: ReturnType<typeof normalizeResidentFilingStatus>;
  readonly taxableIncome: number;
}): number {
  if (args.taxableIncome <= 0) {
    return 0;
  }

  const firstBracketCap =
    args.filingStatus === "married_filing_jointly" || args.filingStatus === "head_of_household"
      ? 1_000
      : 500;
  const secondBracketCap =
    args.filingStatus === "married_filing_jointly" || args.filingStatus === "head_of_household"
      ? 6_000
      : 3_000;
  const firstBracketIncome = Math.min(args.taxableIncome, firstBracketCap);
  const secondBracketIncome = Math.max(Math.min(args.taxableIncome, secondBracketCap) - firstBracketCap, 0);
  const thirdBracketIncome = Math.max(args.taxableIncome - secondBracketCap, 0);

  return toWholeDollars(
    firstBracketIncome * 0.02 + secondBracketIncome * 0.04 + thirdBracketIncome * 0.05,
  );
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: ALABAMA_STATE_NAME,
    });
  }

  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, ALABAMA_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line10AdjustedGrossIncome = Math.max(
    toWholeDollars(args.adjustedGrossIncome) +
      sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
    0,
  );
  const itemizedDeductionAmount = calculateAlabamaItemizedDeduction({
    adjustedGrossIncome: line10AdjustedGrossIncome,
    formRecord,
    input: args.input,
  });
  const useItemizedDeductions =
    asNumber(formRecord?.itemized_deductions_total) != null ||
    asBoolean(formRecord?.use_itemized_deductions) === true ||
    formRecord?.use_itemized_deductions === true;
  const line11Deduction = useItemizedDeductions
    ? itemizedDeductionAmount
    : toWholeDollars(
        asNumber(formRecord?.standard_deduction_amount) ??
          calculateAlabamaStandardDeduction(filingStatus, line10AdjustedGrossIncome),
      );
  const line12FederalTaxDeduction = calculateAlabamaFederalTaxDeduction({
    federalSummary: args.federalSummary,
    formRecord,
  });
  const line13PersonalExemption = toWholeDollars(
    asNumber(formRecord?.personal_exemption_amount) ?? calculateAlabamaPersonalExemption(filingStatus),
  );
  const line14DependentExemption = toWholeDollars(
    asNumber(formRecord?.dependent_exemption_amount) ??
      calculateAlabamaDependentExemption({
        adjustedGrossIncome: line10AdjustedGrossIncome,
        dependentCount: countDependentExemptions(args.input),
      }),
  );
  const line15TotalDeductions =
    line11Deduction + line12FederalTaxDeduction + line13PersonalExemption + line14DependentExemption;
  const line16TaxableIncome = Math.max(line10AdjustedGrossIncome - line15TotalDeductions, 0);
  const line17IncomeTaxDue = toWholeDollars(
    asNumber(formRecord?.income_tax_amount) ??
      calculateAlabamaTax({
        filingStatus,
        taxableIncome: line16TaxableIncome,
      }),
  );
  const otherStateCreditAmount = calculateAlabamaOtherStateCredit({
    formRecord,
    stateArtifactsArgs: args,
  });
  const line18NetTaxDue = Math.max(
    line17IncomeTaxDue +
      toWholeDollars(asNumber(formRecord?.other_taxes) ?? 0) -
      sumStateNonrefundableCredits(
        args.stateReturn,
        readNamedAmountArrayTotal(formRecord?.nonrefundable_credits) + otherStateCreditAmount,
      ),
    0,
  );
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: ALABAMA_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line18NetTaxDue - payments.totalPayments, 0),
    startingPoint: line10AdjustedGrossIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line16TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line18NetTaxDue,
  });

  const nodes = [
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "1040.line11 plus Alabama additions minus Alabama subtractions",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama adjusted gross income",
      lineCode: "line10",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "bridge.al.starting_point",
      nodeType: "bridge",
      value: line10AdjustedGrossIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Alabama standard or itemized deduction",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama deduction",
      lineCode: "line11",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line11",
      nodeType: "calculation",
      value: line11Deduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "federal tax deduction override or federal summary total tax",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama federal tax deduction",
      lineCode: "line12",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line12",
      nodeType: "calculation",
      value: line12FederalTaxDeduction,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Alabama filing-status personal exemption",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama personal exemption",
      lineCode: "line13",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line13",
      nodeType: "calculation",
      value: line13PersonalExemption,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "dependent exemption per Alabama AGI band",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama dependent exemption",
      lineCode: "line14",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line14",
      nodeType: "calculation",
      value: line14DependentExemption,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "line11 + line12 + line13 + line14",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama total deductions",
      lineCode: "line15",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line15",
      nodeType: "calculation",
      value: line15TotalDeductions,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line10 - line15, 0)",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama taxable income",
      lineCode: "line16",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line16",
      nodeType: "calculation",
      value: line16TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "Alabama TY2025 rate schedule or override",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama income tax due",
      lineCode: "line17",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line17",
      nodeType: "calculation",
      value: line17IncomeTaxDue,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(line17 + other taxes - credits, 0)",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama net tax due",
      lineCode: "line18",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.form40.line18",
      nodeType: "summary",
      value: line18NetTaxDue,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "state_payments or canonical payment fallback + refundable credits",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama total payments",
      lineCode: "summary.total_payments",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.summary.total_payments",
      nodeType: "summary",
      value: payments.totalPayments,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form40.line16",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama summary taxable income",
      lineCode: "summary.taxable_income",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.summary.taxable_income",
      nodeType: "summary",
      value: line16TaxableIncome,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "form40.line18",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama summary total tax",
      lineCode: "summary.total_tax",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.summary.total_tax",
      nodeType: "summary",
      value: line18NetTaxDue,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(total payments - total tax, 0)",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama refund amount",
      lineCode: "summary.refund_amount",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.summary.refund_amount",
      nodeType: "summary",
      value: summary.refund_amount,
    }),
    createStateNode({
      formCode: primaryFormCode,
      formulaRef: "max(total tax - total payments, 0)",
      jurisdiction: ALABAMA_STATE_CODE,
      label: "Alabama amount owed",
      lineCode: "summary.amount_owed",
      moduleId: args.manifest.plugin_manifest_id,
      nodeId: "al.summary.amount_owed",
      nodeType: "summary",
      value: summary.amount_owed,
    }),
  ];

  const edges = [
    createStateEdge("1040.line11", "bridge.al.starting_point", "carryforward"),
    createStateEdge("bridge.al.starting_point", "al.form40.line16"),
    createStateEdge("al.form40.line11", "al.form40.line15"),
    createStateEdge("al.form40.line12", "al.form40.line15"),
    createStateEdge("al.form40.line13", "al.form40.line15"),
    createStateEdge("al.form40.line14", "al.form40.line15"),
    createStateEdge("al.form40.line15", "al.form40.line16"),
    createStateEdge("al.form40.line16", "al.form40.line17"),
    createStateEdge("al.form40.line17", "al.form40.line18"),
    createStateEdge("al.form40.line18", "al.summary.total_tax"),
    createStateEdge("al.summary.total_payments", "al.summary.refund_amount"),
    createStateEdge("al.summary.total_payments", "al.summary.amount_owed"),
  ];

  const validationResults = [];
  const otherStateCreditOverrideAmount =
    asNumber(formRecord?.tax_paid_to_other_state_credit) ??
    asNumber(formRecord?.other_state_credit_amount);

  if (args.federalSummary?.deduction_strategy === "itemized" && useItemizedDeductions === false) {
    validationResults.push(
      buildValidationResult({
        message:
          "Alabama itemized deductions were not supplied, so this resident computation used the Alabama standard deduction instead of inferring a state itemized amount from the federal return.",
        nodeIds: ["al.form40.line11"],
        ruleId: "AL.itemized_deduction_defaulted_to_standard",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (asNumber(formRecord?.federal_tax_deduction_amount) == null && args.federalSummary == null) {
    validationResults.push(
      buildValidationResult({
        message:
          "Alabama federal tax deduction was not supplied and no federal summary was available, so this resident computation defaulted that deduction to zero.",
        nodeIds: ["al.form40.line12"],
        ruleId: "AL.federal_tax_deduction_default_zero",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    otherStateCreditAmount === 0 &&
    otherStateCreditOverrideAmount == null &&
    hasPotentialAlabamaOtherStateCreditInputs(args)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Alabama Schedule OC stayed at zero because no structured claim amount was supplied for the available multistate facts.",
        nodeIds: ["al.form40.line18"],
        ruleId: "AL.other_state_credit_review",
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
