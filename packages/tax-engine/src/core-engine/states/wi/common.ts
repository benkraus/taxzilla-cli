import { asBoolean, asNumber, asRecord } from "../../helpers";
import { sumScheduleCBusinessNetProfit } from "../../income-amounts";
import { resolveNonemployeeCompensationAmount } from "../../income-source-documents";
import type { StateArtifactsArgs, StateArtifactsResult } from "../common";
import {
  buildResidentStateSummary,
  buildValidationResult,
  calculateResidentStatePayments,
  countDependentExemptions,
  countSeniorTaxpayers,
  createStateEdge,
  createStateNode,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  sumStateSubtractionAmounts,
  toWholeDollars,
} from "../resident";
import { WISCONSIN_STANDARD_DEDUCTION_ROWS } from "./standard-deduction-table";

const WISCONSIN_STATE_CODE = "WI";
const WISCONSIN_FORM_RECORD_KEY = "form1";

type WisconsinFilingStatus = ReturnType<typeof normalizeResidentFilingStatus>;

type WisconsinExemptions = {
  readonly additionalSeniorExemptions: number;
  readonly totalExemptions: number;
};

type WisconsinSchoolPropertyCreditComputation = {
  readonly baseCredit: number;
  readonly derivedFromTables: boolean;
};

function getPersonCanBeClaimedAsDependent(person: unknown): boolean {
  return asBoolean(asRecord(person)?.can_be_claimed_as_dependent) === true;
}

function calculateWisconsinEarnedIncome(input: StateArtifactsArgs["input"]): number {
  const wages = input.facts.income.wages.reduce(
    (sum, wage) => sum + Math.max(wage.wages_tips_other_compensation ?? 0, 0),
    0,
  );
  const scheduleCBusinessIncome = Math.max(
    sumScheduleCBusinessNetProfit(input.facts.income.schedule_c_businesses),
    0,
  );
  const nonemployeeCompensation = input.facts.income.nonemployee_compensation.reduce(
    (sum, item) => sum + Math.max(resolveNonemployeeCompensationAmount(item, input.source_documents), 0),
    0,
  );

  return toWholeDollars(wages + scheduleCBusinessIncome + nonemployeeCompensation);
}

function lookupWisconsinStandardDeduction(
  income: number,
  filingStatus: WisconsinFilingStatus,
): number {
  const columnIndex =
    filingStatus === "married_filing_jointly"
      ? 3
      : filingStatus === "married_filing_separately"
        ? 4
        : filingStatus === "head_of_household"
          ? 5
          : 2;
  const row =
    WISCONSIN_STANDARD_DEDUCTION_ROWS.find(([at, less]) => income >= at && income < less) ??
    WISCONSIN_STANDARD_DEDUCTION_ROWS[WISCONSIN_STANDARD_DEDUCTION_ROWS.length - 1];

  return row?.[columnIndex] ?? 0;
}

function calculateWisconsinStandardDeduction(args: {
  readonly filingStatus: WisconsinFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
  readonly incomeForTable: number;
}): number {
  const overrideAmount = asNumber(args.formRecord?.standard_deduction_amount);

  if (overrideAmount != null) {
    return toWholeDollars(overrideAmount);
  }

  const tableDeduction = lookupWisconsinStandardDeduction(args.incomeForTable, args.filingStatus);

  if ((args.input.household.can_be_claimed_as_dependent ?? false) !== true) {
    return tableDeduction;
  }

  const earnedIncome = calculateWisconsinEarnedIncome(args.input);
  return Math.min(Math.max(earnedIncome + 450, 1_350), tableDeduction);
}

function calculateWisconsinExemptions(args: {
  readonly filingStatus: WisconsinFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): WisconsinExemptions {
  const overrideAmount = asNumber(args.formRecord?.exemption_amount);

  if (overrideAmount != null) {
    return {
      additionalSeniorExemptions: 0,
      totalExemptions: toWholeDollars(overrideAmount),
    };
  }

  const taxpayerAllowed = !getPersonCanBeClaimedAsDependent(args.input.household.taxpayer);
  const spouseAllowed =
    args.filingStatus === "married_filing_jointly" &&
    !getPersonCanBeClaimedAsDependent(args.input.household.spouse);
  const personalAndDependentCount =
    (taxpayerAllowed ? 1 : 0) + (spouseAllowed ? 1 : 0) + countDependentExemptions(args.input);
  const seniorCount = [
    taxpayerAllowed ? args.input.household.taxpayer : undefined,
    spouseAllowed ? args.input.household.spouse : undefined,
  ].filter(Boolean).length
    ? countSeniorTaxpayers(args.input)
    : 0;

  return {
    additionalSeniorExemptions: seniorCount * 250,
    totalExemptions: personalAndDependentCount * 700 + seniorCount * 250,
  };
}

function calculateWisconsinTax(
  taxableIncome: number,
  filingStatus: WisconsinFilingStatus,
): number {
  if (filingStatus === "married_filing_jointly") {
    if (taxableIncome <= 19_580) {
      return toWholeDollars(taxableIncome * 0.035);
    }

    if (taxableIncome <= 67_300) {
      return toWholeDollars(685.3 + (taxableIncome - 19_580) * 0.044);
    }

    if (taxableIncome <= 431_060) {
      return toWholeDollars(2_784.98 + (taxableIncome - 67_300) * 0.053);
    }

    return toWholeDollars(22_064.26 + (taxableIncome - 431_060) * 0.0765);
  }

  if (filingStatus === "married_filing_separately") {
    if (taxableIncome <= 9_790) {
      return toWholeDollars(taxableIncome * 0.035);
    }

    if (taxableIncome <= 33_650) {
      return toWholeDollars(342.65 + (taxableIncome - 9_790) * 0.044);
    }

    if (taxableIncome <= 215_530) {
      return toWholeDollars(1_392.49 + (taxableIncome - 33_650) * 0.053);
    }

    return toWholeDollars(11_032.13 + (taxableIncome - 215_530) * 0.0765);
  }

  if (taxableIncome <= 14_680) {
    return toWholeDollars(taxableIncome * 0.035);
  }

  if (taxableIncome <= 50_480) {
    return toWholeDollars(513.8 + (taxableIncome - 14_680) * 0.044);
  }

  if (taxableIncome <= 323_290) {
    return toWholeDollars(2_089 + (taxableIncome - 50_480) * 0.053);
  }

  return toWholeDollars(16_547.93 + (taxableIncome - 323_290) * 0.0765);
}

function hasWisconsinSchoolPropertyInputs(formRecord: Record<string, unknown> | undefined): boolean {
  return (
    asNumber(formRecord?.rent_paid_with_heat_included_amount) != null ||
    asNumber(formRecord?.rent_paid_without_heat_amount) != null ||
    asNumber(formRecord?.property_taxes_paid_amount) != null
  );
}

function getWisconsinSchoolPropertyCreditLimit(
  filingStatus: WisconsinFilingStatus,
): number {
  return filingStatus === "married_filing_separately" ? 150 : 300;
}

function calculateWisconsinRenterSchoolPropertyTaxCredit(
  rentPaid: number,
  heatIncluded: boolean,
): number {
  if (rentPaid <= 0) {
    return 0;
  }

  if (heatIncluded) {
    if (rentPaid < 100) {
      return 1;
    }

    return Math.min(Math.floor((rentPaid - 100) * 0.024) + 4, 300);
  }

  if (rentPaid < 100) {
    return 2;
  }

  return Math.min(2 + 3 * Math.floor(rentPaid / 100), 300);
}

function calculateWisconsinHomeownerSchoolPropertyTaxCredit(
  propertyTaxesPaid: number,
): number {
  if (propertyTaxesPaid <= 0) {
    return 0;
  }

  return Math.min(2 + 3 * Math.floor((propertyTaxesPaid - 1) / 25), 300);
}

function calculateWisconsinSchoolPropertyCredit(args: {
  readonly filingStatus: WisconsinFilingStatus;
  readonly formRecord: Record<string, unknown> | undefined;
  readonly input: StateArtifactsArgs["input"];
}): WisconsinSchoolPropertyCreditComputation {
  const explicitAmount = asNumber(args.formRecord?.school_property_tax_credit_amount);

  if (explicitAmount != null) {
    return {
      baseCredit: toWholeDollars(explicitAmount),
      derivedFromTables: false,
    };
  }

  const rentWithHeatIncluded = Math.max(
    toWholeDollars(asNumber(args.formRecord?.rent_paid_with_heat_included_amount) ?? 0),
    0,
  );
  const rentWithoutHeatIncluded = Math.max(
    toWholeDollars(asNumber(args.formRecord?.rent_paid_without_heat_amount) ?? 0),
    0,
  );
  const propertyTaxesPaid = Math.max(
    toWholeDollars(
      asNumber(args.formRecord?.property_taxes_paid_amount) ??
        args.input.facts.itemized_deductions.real_estate_taxes ??
        0,
    ),
    0,
  );
  const hasTableInputs =
    rentWithHeatIncluded > 0 || rentWithoutHeatIncluded > 0 || propertyTaxesPaid > 0;

  if (!hasTableInputs) {
    return {
      baseCredit: 0,
      derivedFromTables: false,
    };
  }

  const renterCredit = Math.min(
    calculateWisconsinRenterSchoolPropertyTaxCredit(rentWithHeatIncluded, true) +
      calculateWisconsinRenterSchoolPropertyTaxCredit(rentWithoutHeatIncluded, false),
    getWisconsinSchoolPropertyCreditLimit(args.filingStatus),
  );
  const homeownerCredit = calculateWisconsinHomeownerSchoolPropertyTaxCredit(propertyTaxesPaid);

  return {
    baseCredit: Math.min(
      renterCredit + homeownerCredit,
      getWisconsinSchoolPropertyCreditLimit(args.filingStatus),
    ),
    derivedFromTables: true,
  };
}

function buildResidentArtifacts(args: StateArtifactsArgs): StateArtifactsResult {
  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;
  const formRecord = getStatePluginRecord(args.stateReturn, WISCONSIN_FORM_RECORD_KEY);
  const filingStatus = normalizeResidentFilingStatus(args.input, args.stateReturn);
  const line1FederalAdjustedGrossIncome = toWholeDollars(args.adjustedGrossIncome);
  const line6NetModifications = toWholeDollars(
    sumStateAdditionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.additions)) -
      sumStateSubtractionAmounts(args.stateReturn, readNamedAmountArrayTotal(formRecord?.subtractions)),
  );
  const line7WisconsinIncome = Math.max(line1FederalAdjustedGrossIncome + line6NetModifications, 0);
  const line8StandardDeduction = calculateWisconsinStandardDeduction({
    filingStatus,
    formRecord,
    input: args.input,
    incomeForTable: line7WisconsinIncome,
  });
  const exemptions = calculateWisconsinExemptions({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line11TaxableIncome = Math.max(
    line7WisconsinIncome - line8StandardDeduction - exemptions.totalExemptions,
    0,
  );
  const line12Tax = toWholeDollars(
    asNumber(formRecord?.tax_amount) ?? calculateWisconsinTax(line11TaxableIncome, filingStatus),
  );
  const line13ItemizedDeductionCredit = toWholeDollars(
    asNumber(formRecord?.itemized_deduction_credit_amount) ?? 0,
  );
  const line14ChildAndDependentCareCredit = toWholeDollars(
    asNumber(formRecord?.additional_child_dependent_care_credit_amount) ?? 0,
  );
  const line15BlindWorkerCredit = toWholeDollars(
    asNumber(formRecord?.blind_worker_transportation_credit_amount) ?? 0,
  );
  const schoolPropertyCredit = calculateWisconsinSchoolPropertyCredit({
    filingStatus,
    formRecord,
    input: args.input,
  });
  const line16SchoolPropertyTaxCredit = schoolPropertyCredit.baseCredit;
  const line17Credits =
    line13ItemizedDeductionCredit +
    line14ChildAndDependentCareCredit +
    line15BlindWorkerCredit +
    line16SchoolPropertyTaxCredit +
    sumStateNonrefundableCredits(args.stateReturn);
  const line18NetTax = Math.max(line12Tax - line17Credits, 0);
  const refundableCredits = toWholeDollars(readNamedAmountArrayTotal(formRecord?.refundable_credits));
  const payments = calculateResidentStatePayments({
    additionalPaymentTotal: readPluginPaymentTotal(formRecord),
    input: args.input,
    refundableCreditsTotal: refundableCredits,
    stateCode: WISCONSIN_STATE_CODE,
    stateReturn: args.stateReturn,
  });
  const summary = buildResidentStateSummary({
    amountOwed: Math.max(line18NetTax - payments.totalPayments, 0),
    startingPoint: line7WisconsinIncome,
    stateReturn: args.stateReturn,
    taxableIncome: line11TaxableIncome,
    totalPayments: payments.totalPayments,
    totalTax: line18NetTax,
  });

  const validationResults = [];

  if (schoolPropertyCredit.derivedFromTables) {
    validationResults.push(
      buildValidationResult({
        message:
          "Wisconsin school property tax credit was computed from the official renter and homeowner tables using the available rent and property-tax inputs.",
        nodeIds: ["wi.form1.line16"],
        ruleId: "WI.school_property_tax_credit_computed_from_tables",
        severity: "info",
        status: "pass",
      }),
    );
  }

  return {
    edges: [
      createStateEdge("1040.line11", "bridge.wi.starting_point", "carryforward"),
      createStateEdge("bridge.wi.starting_point", "wi.form1.line11"),
      createStateEdge("wi.form1.line11", "wi.form1.line12"),
      createStateEdge("wi.form1.line12", "wi.summary.total_tax"),
      createStateEdge("wi.form1.line31", "wi.summary.total_payments"),
    ],
    nodes: [
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "1040.line11 rounded to Wisconsin whole-dollar rules",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin federal adjusted gross income",
        lineCode: "line1",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "bridge.wi.starting_point",
        nodeType: "bridge",
        value: line1FederalAdjustedGrossIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin additions minus Wisconsin subtractions common path",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin net modifications",
        lineCode: "line6",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line6",
        nodeType: "calculation",
        value: line6NetModifications,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "line1 plus line6",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin income",
        lineCode: "line7",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line7",
        nodeType: "calculation",
        value: line7WisconsinIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin standard deduction table or dependent worksheet",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin standard deduction",
        lineCode: "line8",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line8",
        nodeType: "calculation",
        value: line8StandardDeduction,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "$700 exemptions on line 10a and $250 age-65 exemptions on line 10b",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin exemptions",
        lineCode: "line10",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line10",
        nodeType: "calculation",
        value: exemptions.totalExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Age-65 Wisconsin exemptions included in line10",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin additional age-65 exemptions",
        lineCode: "line10b",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line10b",
        nodeType: "calculation",
        value: exemptions.additionalSeniorExemptions,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "max(line7 - line8 - line10, 0)",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin taxable income",
        lineCode: "line11",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line11",
        nodeType: "calculation",
        value: line11TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin 2025 tax rates or override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin tax",
        lineCode: "line12",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line12",
        nodeType: "calculation",
        value: line12Tax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin itemized deduction credit common path or override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin itemized deduction credit",
        lineCode: "line13",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line13",
        nodeType: "calculation",
        value: line13ItemizedDeductionCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin additional child and dependent care tax credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin additional child and dependent care tax credit",
        lineCode: "line14",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line14",
        nodeType: "calculation",
        value: line14ChildAndDependentCareCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin blind worker transportation services credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin blind worker transportation services credit",
        lineCode: "line15",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line15",
        nodeType: "calculation",
        value: line15BlindWorkerCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin renter's and homeowner's school property tax credit override",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin school property tax credit",
        lineCode: "line16",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line16",
        nodeType: "calculation",
        value: line16SchoolPropertyTaxCredit,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "Wisconsin total credits and net tax common path",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin net tax",
        lineCode: "line18",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line18",
        nodeType: "summary",
        value: line18NetTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "state_payments or canonical payment fallback + refundable credits",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin total payments",
        lineCode: "line31",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.form1.line31",
        nodeType: "summary",
        value: payments.totalPayments,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form1.line11",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary taxable income",
        lineCode: "summary.taxable_income",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.taxable_income",
        nodeType: "summary",
        value: line11TaxableIncome,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form1.line18",
        jurisdiction: WISCONSIN_STATE_CODE,
        label: "Wisconsin summary total tax",
        lineCode: "summary.total_tax",
        moduleId: args.manifest.plugin_manifest_id,
        nodeId: "wi.summary.total_tax",
        nodeType: "summary",
        value: line18NetTax,
      }),
      createStateNode({
        formCode: primaryFormCode,
        formulaRef: "form1.line31",
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

export {
  WISCONSIN_STATE_CODE,
  WISCONSIN_FORM_RECORD_KEY,
  buildResidentArtifacts,
  calculateWisconsinExemptions,
  calculateWisconsinSchoolPropertyCredit,
  calculateWisconsinStandardDeduction,
  calculateWisconsinTax,
  hasWisconsinSchoolPropertyInputs,
};
