import { asNumber } from "../../helpers";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import { deriveCombinedStateTaxedIncome } from "../return-kind";
import {
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
  sumStateNonrefundableCredits,
  toWholeDollars,
} from "../resident";
import {
  WISCONSIN_FORM_RECORD_KEY,
  WISCONSIN_STATE_CODE,
  buildResidentArtifacts,
  calculateWisconsinExemptions,
  calculateWisconsinSchoolPropertyCredit,
  calculateWisconsinStandardDeduction,
  calculateWisconsinTax,
} from "./common";

const WISCONSIN_STATE_NAME = "Wisconsin";

function roundWisconsinRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildAllocatedArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, WISCONSIN_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const isNonresident = args.returnKindContext?.returnKind === "nonresident";
  const fullYearFederalIncome = Math.max(
    toWholeDollars(args.returnKindContext?.originalAdjustedGrossIncome ?? args.adjustedGrossIncome),
    0,
  );
  const line30WisconsinIncome = Math.max(
    toWholeDollars(
      asNumber(formRecord?.wisconsin_income_amount) ??
        deriveCombinedStateTaxedIncome(args.stateReturn) ??
        args.adjustedGrossIncome,
    ),
    0,
  );
  const line31FederalIncome = fullYearFederalIncome;
  const line32Ratio =
    line30WisconsinIncome <= 0 || line31FederalIncome <= 0
      ? 1
      : roundWisconsinRatio(Math.min(line30WisconsinIncome / line31FederalIncome, 1));
  const line33TaxComputationBase =
    line30WisconsinIncome <= 0 ? 0 : Math.max(line30WisconsinIncome, line31FederalIncome);
  const line34StandardDeduction = calculateWisconsinStandardDeduction({
    filingStatus,
    formRecord,
    input: args.input,
    incomeForTable: line31FederalIncome,
  });
  const dependentWorksheetZeroTax =
    (args.input.household.can_be_claimed_as_dependent ?? false) === true &&
    line30WisconsinIncome > 0 &&
    toWholeDollars(line34StandardDeduction * line32Ratio) > line30WisconsinIncome;
  const exemptions = calculateWisconsinExemptions({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line35IncomeAfterStandardDeduction = dependentWorksheetZeroTax
    ? 0
    : Math.max(line33TaxComputationBase - line34StandardDeduction, 0);
  const line36TotalExemptions = dependentWorksheetZeroTax ? 0 : exemptions.totalExemptions;
  const line37TaxableIncome = dependentWorksheetZeroTax
    ? 0
    : Math.max(line35IncomeAfterStandardDeduction - line36TotalExemptions, 0);
  const line38FullYearTax = dependentWorksheetZeroTax
    ? 0
    : toWholeDollars(
        asNumber(formRecord?.tax_amount) ?? calculateWisconsinTax(line37TaxableIncome, filingStatus),
      );
  const line39ProratedTax = dependentWorksheetZeroTax
    ? 0
    : toWholeDollars(line38FullYearTax * line32Ratio);
  const line40ItemizedDeductionCredit = toWholeDollars(
    asNumber(formRecord?.itemized_deduction_credit_amount) ?? 0,
  );
  const line41AdditionalChildAndDependentCareCredit = toWholeDollars(
    asNumber(formRecord?.additional_child_dependent_care_credit_amount) ?? 0,
  );
  const line42BlindWorkerCredit = toWholeDollars(
    asNumber(formRecord?.blind_worker_transportation_credit_amount) ?? 0,
  );
  const schoolPropertyCredit = calculateWisconsinSchoolPropertyCredit({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line43BaseSchoolPropertyTaxCredit = toWholeDollars(
    asNumber(formRecord?.school_property_tax_credit_base_amount) ??
      schoolPropertyCredit.baseCredit,
  );
  const line43ProratedSchoolPropertyTaxCredit = isNonresident
    ? 0
    : toWholeDollars(
        asNumber(formRecord?.school_property_tax_credit_prorated_amount) ??
          line43BaseSchoolPropertyTaxCredit * line32Ratio,
      );
  const line44Credits = dependentWorksheetZeroTax
    ? 0
    : line40ItemizedDeductionCredit +
      line41AdditionalChildAndDependentCareCredit +
      line42BlindWorkerCredit +
      line43ProratedSchoolPropertyTaxCredit;
  const line45TaxAfterLines40Through43 = Math.max(line39ProratedTax - line44Credits, 0);
  const line48MarriedCoupleCredit = dependentWorksheetZeroTax
    ? 0
    : toWholeDollars(asNumber(formRecord?.married_couple_credit_amount) ?? 0);
  const line49ScheduleCrCredits = dependentWorksheetZeroTax
    ? 0
    : sumStateNonrefundableCredits(
        args.stateReturn,
        readNamedAmountArrayTotal(formRecord?.nonrefundable_credits),
      );
  const line50OtherStateCredit = dependentWorksheetZeroTax
    ? 0
    : toWholeDollars(asNumber(formRecord?.tax_paid_to_other_state_credit) ?? 0);
  const line51CreditsAfterLine46 = line48MarriedCoupleCredit + line49ScheduleCrCredits + line50OtherStateCredit;
  const line52NetTax = dependentWorksheetZeroTax
    ? 0
    : Math.max(line45TaxAfterLines40Through43 - line51CreditsAfterLine46, 0);
  const allocatedTaxableIncome = dependentWorksheetZeroTax
    ? 0
    : toWholeDollars(line37TaxableIncome * line32Ratio);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: WISCONSIN_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = {
    state_code: args.stateReturn.state_code,
    plugin_manifest_id: args.stateReturn.plugin_manifest_id,
    adjusted_gross_income_or_starting_point: line30WisconsinIncome,
    taxable_income: allocatedTaxableIncome,
    total_tax: line52NetTax,
    total_payments: payments.totalPayments,
    refund_amount: Math.max(payments.totalPayments - line52NetTax, 0),
    amount_owed: Math.max(line52NetTax - payments.totalPayments, 0),
    allocation_ratio: line32Ratio,
    ...(args.stateReturn.return_kind === "part_year_resident"
      ? {
          resident_taxable_income: allocatedTaxableIncome,
          return_kind: args.stateReturn.return_kind,
          starting_point_strategy: args.stateReturn.starting_point_strategy,
        }
      : {
          nonresident_source_income: allocatedTaxableIncome,
          resident_taxable_income: null,
          return_kind: args.stateReturn.return_kind,
          starting_point_strategy: args.stateReturn.starting_point_strategy,
        }),
  };

  const validationResults = [
    buildValidationResult({
      message:
        "Wisconsin Form 1NPR was applied by computing full-year tax first, then prorating it with the line 32 Wisconsin-income ratio before the return-kind-specific credit lines were applied.",
      nodeIds: [
        "wi.form1npr.line30",
        "wi.form1npr.line31",
        "wi.form1npr.line32",
        "wi.form1npr.line39",
        "wi.form1npr.line52",
      ],
      ruleId: "WI.form1npr_ratio_applied",
      severity: "info",
      status: "pass",
    }),
  ];

  if (dependentWorksheetZeroTax) {
    validationResults.push(
      buildValidationResult({
        message:
          "The Wisconsin dependent standard deduction worksheet produced a line 34c amount that exceeded Wisconsin income after applying the line 32 ratio, so Form 1NPR zeroed lines 35, 38, 39, and 52.",
        nodeIds: ["wi.form1npr.line34c", "wi.form1npr.line32", "wi.form1npr.line35", "wi.form1npr.line52"],
        ruleId: "WI.form1npr_dependent_zero_tax",
        severity: "info",
        status: "pass",
      }),
    );
  }

  if (
    !isNonresident &&
    schoolPropertyCredit.derivedFromTables &&
    asNumber(formRecord?.school_property_tax_credit_base_amount) == null &&
    asNumber(formRecord?.school_property_tax_credit_prorated_amount) == null
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Wisconsin Form 1NPR school property tax credit was computed from the official renter and homeowner tables and then prorated by the line 32 Wisconsin-income ratio.",
        nodeIds: ["wi.form1npr.line32", "wi.form1npr.line43c"],
        ruleId: "WI.form1npr_school_property_credit_computed_from_tables",
        severity: "info",
        status: "pass",
      }),
    );
  } else if (
    !isNonresident &&
    asNumber(formRecord?.school_property_tax_credit_prorated_amount) == null &&
    (asNumber(formRecord?.school_property_tax_credit_base_amount) != null ||
      asNumber(formRecord?.school_property_tax_credit_amount) != null)
  ) {
    validationResults.push(
      buildValidationResult({
        message:
          "Wisconsin Form 1NPR school property tax credit was supplied as a pre-proration amount, so the engine applied the line 32 ratio to derive line 43c.",
        nodeIds: ["wi.form1npr.line32", "wi.form1npr.line43c"],
        ruleId: "WI.form1npr_school_property_credit_prorated",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.wi.starting_point", "carryforward"),
      createStateEdge("bridge.wi.starting_point", "wi.form1npr.line31"),
      createStateEdge("wi.form1npr.line30", "wi.form1npr.line32"),
      createStateEdge("wi.form1npr.line31", "wi.form1npr.line32"),
      createStateEdge("wi.form1npr.line32", "wi.form1npr.line39"),
      createStateEdge("wi.form1npr.line38", "wi.form1npr.line39"),
      createStateEdge("wi.form1npr.line40", "wi.form1npr.line44"),
      createStateEdge("wi.form1npr.line41", "wi.form1npr.line44"),
      createStateEdge("wi.form1npr.line42", "wi.form1npr.line44"),
      createStateEdge("wi.form1npr.line43c", "wi.form1npr.line44"),
      createStateEdge("wi.form1npr.line39", "wi.form1npr.line45"),
      createStateEdge("wi.form1npr.line44", "wi.form1npr.line45"),
      createStateEdge("wi.form1npr.line45", "wi.form1npr.line52"),
      createStateEdge("wi.form1npr.line51", "wi.form1npr.line52"),
      createStateEdge("wi.form1npr.line52", "wi.summary.total_tax"),
      createStateEdge("wi.form1npr.line71", "wi.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Form 1NPR line 30 Wisconsin income",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR Wisconsin income",
        lineCode: "line30",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line30",
        nodeType: "bridge",
        value: line30WisconsinIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 adjusted gross income",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR federal income",
        lineCode: "line31",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.wi.starting_point",
        nodeType: "bridge",
        value: line31FederalIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line30 / line31 rounded to four decimals, clamped to 1.0000",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR income ratio",
        lineCode: "line32",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line32",
        nodeType: "calculation",
        value: line32Ratio.toFixed(4),
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "larger of line30 and line31, unless line30 is zero or less",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR tax computation base",
        lineCode: "line33",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line33",
        nodeType: "calculation",
        value: line33TaxComputationBase,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin Form 1NPR standard deduction table using line31",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR standard deduction",
        lineCode: "line34c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line34c",
        nodeType: "calculation",
        value: line34StandardDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line33 - line34c, 0)",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR income after standard deduction",
        lineCode: "line35",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line35",
        nodeType: "calculation",
        value: line35IncomeAfterStandardDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$700 exemptions on line 36a and $250 age-65 exemptions on line 36b",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR exemptions",
        lineCode: "line36c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line36c",
        nodeType: "calculation",
        value: line36TotalExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Age-65 exemptions included in line 36c",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR age-65 exemptions",
        lineCode: "line36b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line36b",
        nodeType: "calculation",
        value: dependentWorksheetZeroTax ? 0 : exemptions.additionalSeniorExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line35 - line36c, 0)",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR taxable income",
        lineCode: "line37",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line37",
        nodeType: "calculation",
        value: line37TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin 2025 tax table or worksheet",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR full-year tax",
        lineCode: "line38",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line38",
        nodeType: "calculation",
        value: line38FullYearTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line38 multiplied by the line32 ratio",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR prorated tax",
        lineCode: "line39",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line39",
        nodeType: "calculation",
        value: line39ProratedTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Schedule 1 itemized deduction credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR itemized deduction credit",
        lineCode: "line40",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line40",
        nodeType: "calculation",
        value: line40ItemizedDeductionCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Schedule WI-2441 credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR additional child and dependent care tax credit",
        lineCode: "line41",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line41",
        nodeType: "calculation",
        value: line41AdditionalChildAndDependentCareCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Blind worker transportation services credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR blind worker transportation credit",
        lineCode: "line42",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line42",
        nodeType: "calculation",
        value: line42BlindWorkerCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "School property credit tables or override, then prorated by line32",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR school property tax credit",
        lineCode: "line43c",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line43c",
        nodeType: "calculation",
        value: line43ProratedSchoolPropertyTaxCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "add lines 40, 41, 42, and 43c",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR credits before line 45",
        lineCode: "line44",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line44",
        nodeType: "calculation",
        value: line44Credits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line39 - line44, 0)",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR tax after credits on lines 40 through 43c",
        lineCode: "line45",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line45",
        nodeType: "calculation",
        value: line45TaxAfterLines40Through43,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Married couple credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR married couple credit",
        lineCode: "line48",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line48",
        nodeType: "calculation",
        value: line48MarriedCoupleCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Schedule CR and state-specific nonrefundable credits",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR other nonrefundable credits",
        lineCode: "line49",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line49",
        nodeType: "calculation",
        value: line49ScheduleCrCredits,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Schedule OS credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR tax paid to another state credit",
        lineCode: "line50",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line50",
        nodeType: "calculation",
        value: line50OtherStateCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "add lines 48, 49, and 50",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR credits after line 46",
        lineCode: "line51",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line51",
        nodeType: "calculation",
        value: line51CreditsAfterLine46,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line45 - line51, 0)",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR net tax",
        lineCode: "line52",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line52",
        nodeType: "summary",
        value: line52NetTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback plus refundable credits",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin Form 1NPR total payments",
        lineCode: "line71",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1npr.line71",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Allocated equivalent of line37 using line32 ratio",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.taxable_income",
        nodeType: "summary",
        value: allocatedTaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form1npr.line52",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.total_tax",
        nodeType: "summary",
        value: line52NetTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form1npr.line71",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary total payments",
        lineCode: "summary.total_payments",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.total_payments",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.refund_amount",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary refund amount",
        lineCode: "summary.refund_amount",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.refund_amount",
        nodeType: "summary",
        value: summary.refund_amount,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "summary.amount_owed",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary amount owed",
        lineCode: "summary.amount_owed",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.amount_owed",
        nodeType: "summary",
        value: summary.amount_owed,
      }),
    ],
    summary,
    validationResults,
  };
}

function buildStateArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  if (!supportsAllocatedResidentComputation(args.stateReturn, "custom")) {
    return buildResidentUnsupportedArtifacts(args, {
      startingPointStrategy: "custom",
      stateName: WISCONSIN_STATE_NAME,
    });
  }

  const isAllocatedReturn =
    args.returnKindContext?.returnKind === "part_year_resident" ||
    args.returnKindContext?.returnKind === "nonresident";

  return isAllocatedReturn ? buildAllocatedArtifacts(args) : buildResidentArtifacts(args);
}

export { buildStateArtifacts };
