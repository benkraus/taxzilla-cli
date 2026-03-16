import type {
  FormsGraphEdge,
  FormsGraphNode,
  FormsGraphValidationResult,
  StateStartingPointStrategy,
} from "../../blueprint";
import { STANDARD_DEDUCTION_BY_FILING_STATUS } from "../constants";
import { getFederalFilingStatus } from "../foundations";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getAgeOnLastDayOfTaxYear,
  sumNamedAmounts,
  sumNumbers,
  toNumber,
} from "../helpers";
import type { CoreEngineInput, CoreEngineNamedAmount, CoreEngineStateReturn } from "../input";
import type { CoreEngineFederalSummary, CoreEngineStateSummary } from "../public";
import { buildGenericStateArtifacts, buildStateSummaryExtensions } from "./common";
import type { StateArtifactsArgs, StateArtifactsResult } from "./common";
import {
  getResidentLikeReturnKind,
  hasUsableAllocationProfile,
  supportsAllocatedResidentComputation,
} from "./return-kind";

type ResidentFilingStatus = ReturnType<typeof getFederalFilingStatus>;

type ResidentStatePayments = {
  readonly additionalPaymentTotal: number;
  readonly explicitStatePaymentsTotal: number;
  readonly paymentsUsedCanonicalStatePayments: boolean;
  readonly refundableCreditsTotal: number;
  readonly statePaymentsFallbackTotal: number;
  readonly totalPayments: number;
};

type ResidentUnsupportedArgs = {
  readonly reasonNodeId?: string;
  readonly startingPointStrategy: StateStartingPointStrategy;
  readonly stateName: string;
};

const JOINT_FILING_STATUS_ALIASES = new Set([
  "2",
  "joint",
  "married_filing_jointly",
  "married filing jointly",
  "mfj",
  "qualifying_surviving_spouse",
  "qualifying surviving spouse",
  "qss",
]);
const MFS_FILING_STATUS_ALIASES = new Set([
  "3",
  "married_filing_separately",
  "married filing separately",
  "mfs",
]);
const HEAD_OF_HOUSEHOLD_ALIASES = new Set(["4", "head_of_household", "head of household", "hoh"]);
const SINGLE_FILING_STATUS_ALIASES = new Set(["1", "single"]);

function toWholeDollars(value: number): number {
  return Math.round(value);
}

function getStatePluginRecord(
  stateReturn: CoreEngineStateReturn,
  recordKey: string,
): Record<string, unknown> | undefined {
  return asRecord(asRecord(stateReturn.plugin_fact_bag)?.[recordKey]);
}

function readNamedAmountArray(value: unknown): CoreEngineNamedAmount[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const amount = asNumber(record?.amount);

    if (amount == null) {
      return [];
    }

    return [
      {
        description: asString(record?.description) ?? "State plugin amount",
        amount,
      },
    ];
  });
}

function readNamedAmountArrayTotal(value: unknown): number {
  return toWholeDollars(sumNamedAmounts(readNamedAmountArray(value)));
}

function normalizeResidentFilingStatus(
  input: CoreEngineInput,
  stateReturn: CoreEngineStateReturn,
): ResidentFilingStatus {
  const rawStateFilingStatus = stateReturn.state_filing_status?.trim().toLowerCase();

  if (rawStateFilingStatus) {
    if (SINGLE_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "single";
    }

    if (JOINT_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "married_filing_jointly";
    }

    if (MFS_FILING_STATUS_ALIASES.has(rawStateFilingStatus)) {
      return "married_filing_separately";
    }

    if (HEAD_OF_HOUSEHOLD_ALIASES.has(rawStateFilingStatus)) {
      return "head_of_household";
    }
  }

  return getFederalFilingStatus(input);
}

function getPersonCanBeClaimedAsDependent(person: unknown): boolean | null {
  return asBoolean(asRecord(person)?.can_be_claimed_as_dependent);
}

function countPersonalExemptions(
  input: CoreEngineInput,
  filingStatus: ResidentFilingStatus,
): number {
  const taxpayerCanBeClaimed =
    getPersonCanBeClaimedAsDependent(input.household.taxpayer) ??
    input.household.can_be_claimed_as_dependent ??
    false;

  const spouseCanBeClaimed =
    getPersonCanBeClaimedAsDependent(input.household.spouse) ??
    input.household.can_be_claimed_as_dependent ??
    false;

  if (filingStatus === "married_filing_jointly") {
    return (taxpayerCanBeClaimed ? 0 : 1) + (spouseCanBeClaimed ? 0 : 1);
  }

  return taxpayerCanBeClaimed ? 0 : 1;
}

function countDependentExemptions(input: CoreEngineInput): number {
  return input.household.dependents.length;
}

function countSeniorTaxpayers(input: CoreEngineInput): number {
  return [input.household.taxpayer, input.household.spouse].filter(
    (person) =>
      person != null &&
      (() => {
        const dateOfBirth = asString(asRecord(person)?.date_of_birth);
        const age = getAgeOnLastDayOfTaxYear(dateOfBirth, input.tax_year);
        return age != null && age >= 65;
      })(),
  ).length;
}

function countBlindTaxpayers(input: CoreEngineInput): number {
  return [input.household.taxpayer, input.household.spouse].filter(
    (person) => asBoolean(asRecord(person)?.is_blind) === true,
  ).length;
}

function calculateStatePaymentsFallbackTotal(input: CoreEngineInput, stateCode: string): number {
  const withholdingTotal = sumNumbers(
    input.facts.payments.withholdings
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );
  const estimatedPaymentTotal = sumNumbers(
    input.facts.payments.estimated_payments
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );
  const extensionPaymentTotal = sumNumbers(
    input.facts.payments.extension_payments
      .filter((payment) => payment.jurisdiction === "state" && payment.state_code === stateCode)
      .map((payment) => payment.amount),
  );

  return toWholeDollars(withholdingTotal + estimatedPaymentTotal + extensionPaymentTotal);
}

function calculateResidentStatePayments(args: {
  readonly additionalPaymentTotal?: number;
  readonly input: CoreEngineInput;
  readonly refundableCreditsTotal?: number;
  readonly stateCode: string;
  readonly stateReturn: CoreEngineStateReturn;
}): ResidentStatePayments {
  const explicitStatePaymentsTotal = toWholeDollars(
    sumNumbers(args.stateReturn.state_payments.map((payment) => payment.amount)),
  );
  const statePaymentsFallbackTotal = calculateStatePaymentsFallbackTotal(args.input, args.stateCode);
  const additionalPaymentTotal = toWholeDollars(args.additionalPaymentTotal ?? 0);
  const refundableCreditsTotal = toWholeDollars(args.refundableCreditsTotal ?? 0);
  const basePaymentTotal =
    explicitStatePaymentsTotal > 0
      ? explicitStatePaymentsTotal
      : statePaymentsFallbackTotal + additionalPaymentTotal;

  return {
    additionalPaymentTotal,
    explicitStatePaymentsTotal,
    paymentsUsedCanonicalStatePayments: explicitStatePaymentsTotal > 0,
    refundableCreditsTotal,
    statePaymentsFallbackTotal,
    totalPayments: basePaymentTotal + refundableCreditsTotal,
  };
}

function buildResidentStateSummary(args: {
  readonly amountOwed: number;
  readonly startingPoint: number;
  readonly stateReturn: CoreEngineStateReturn;
  readonly taxableIncome: number;
  readonly totalPayments: number;
  readonly totalTax: number;
}): CoreEngineStateSummary {
  return {
    state_code: args.stateReturn.state_code,
    plugin_manifest_id: args.stateReturn.plugin_manifest_id,
    adjusted_gross_income_or_starting_point: args.startingPoint,
    taxable_income: args.taxableIncome,
    total_tax: args.totalTax,
    total_payments: args.totalPayments,
    refund_amount: Math.max(args.totalPayments - args.totalTax, 0),
    amount_owed: args.amountOwed,
    ...buildStateSummaryExtensions(args.stateReturn, args.taxableIncome),
  };
}

function createStateNode(args: {
  readonly dataType?: "boolean" | "date" | "enum" | "integer" | "money" | "string";
  readonly formCode: string | undefined;
  readonly formulaRef: string;
  readonly jurisdiction: string;
  readonly label: string;
  readonly lineCode: string;
  readonly moduleId: string;
  readonly nodeId: string;
  readonly nodeType: "bridge" | "input" | "calculation" | "summary" | "validation";
  readonly value: boolean | number | string | null;
}): FormsGraphNode {
  return {
    node_id: args.nodeId,
    node_type: args.nodeType,
    jurisdiction: args.jurisdiction,
    module_id: args.moduleId,
    form_code: args.formCode,
    line_code: args.lineCode,
    label: args.label,
    data_type: args.dataType ?? (typeof args.value === "number" ? "money" : "string"),
    value: args.value,
    formula_ref: args.formulaRef,
  };
}

function createStateEdge(
  fromNodeId: string,
  toNodeId: string,
  edgeType: FormsGraphEdge["edge_type"] = "dependency",
): FormsGraphEdge {
  return {
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    edge_type: edgeType,
  };
}

function buildResidentUnsupportedArtifacts(
  args: StateArtifactsArgs,
  options: ResidentUnsupportedArgs,
): StateArtifactsResult {
  const stateCodeLower = args.stateReturn.state_code.toLowerCase();
  const reasonNodeId = options.reasonNodeId ?? `bridge.${stateCodeLower}.starting_point`;
  const validations: FormsGraphValidationResult[] = [];
  const residentLikeReturnKind = getResidentLikeReturnKind(args.stateReturn);

  if (residentLikeReturnKind == null) {
    validations.push({
      rule_id: `${args.stateReturn.state_code}.resident_only`,
      severity: "warning",
      status: "fail",
      message: `${options.stateName} state computation currently supports resident, part-year resident, and nonresident individual returns only. This return stayed on the generic state-summary fallback path.`,
      node_ids: [reasonNodeId],
    });
  } else if (
    residentLikeReturnKind !== "resident" &&
    !hasUsableAllocationProfile(args.stateReturn)
  ) {
    validations.push({
      rule_id: `${args.stateReturn.state_code}.resident_only`,
      severity: "warning",
      status: "fail",
      message: `${options.stateName} ${residentLikeReturnKind.replaceAll("_", " ")} computation requires state_return.allocation_profile inputs. This return stayed on the generic state-summary fallback path.`,
      node_ids: [reasonNodeId],
    });
  }

  if (args.stateReturn.starting_point_strategy !== options.startingPointStrategy) {
    validations.push({
      rule_id: `${args.stateReturn.state_code}.starting_point_unsupported`,
      severity: "warning",
      status: "fail",
      message: `${options.stateName} state computation currently supports the ${options.startingPointStrategy} starting-point strategy only. This return stayed on the generic state-summary fallback path.`,
      node_ids: [reasonNodeId],
    });
  }

  return buildGenericStateArtifacts(args, {
    validationResults: validations,
  });
}

function buildValidationResult(args: {
  readonly message: string;
  readonly nodeIds: string[];
  readonly ruleId: string;
  readonly severity?: "info" | "warning" | "error";
  readonly status?: "pass" | "fail" | "skip";
}): FormsGraphValidationResult {
  return {
    rule_id: args.ruleId,
    severity: args.severity ?? "warning",
    status: args.status ?? "fail",
    message: args.message,
    node_ids: args.nodeIds,
  };
}

function sumStateAdditionAmounts(
  stateReturn: CoreEngineStateReturn,
  pluginAdditionTotal = 0,
): number {
  return toWholeDollars(
    sumNamedAmounts(stateReturn.additions) +
      sumNamedAmounts(stateReturn.state_specific_income_items) +
      pluginAdditionTotal,
  );
}

function sumStateSubtractionAmounts(
  stateReturn: CoreEngineStateReturn,
  pluginSubtractionTotal = 0,
): number {
  return toWholeDollars(
    sumNamedAmounts(stateReturn.subtractions) +
      sumNamedAmounts(stateReturn.state_specific_deductions) +
      pluginSubtractionTotal,
  );
}

function sumStateNonrefundableCredits(
  stateReturn: CoreEngineStateReturn,
  pluginCreditTotal = 0,
): number {
  return toWholeDollars(sumNamedAmounts(stateReturn.state_specific_credits) + pluginCreditTotal);
}

function getFederalDeductionBase(
  federalSummary: CoreEngineFederalSummary | undefined,
  filingStatus: ResidentFilingStatus,
): number {
  if (!federalSummary) {
    return STANDARD_DEDUCTION_BY_FILING_STATUS[filingStatus];
  }

  return federalSummary.deduction_strategy === "itemized"
    ? federalSummary.itemized_deduction_total
    : federalSummary.standard_deduction;
}

function readPluginPaymentTotal(record: Record<string, unknown> | undefined): number {
  if (!record) {
    return 0;
  }

  return toWholeDollars(
    toNumber(asNumber(record.withholding)) +
      toNumber(asNumber(record.estimated_payments)) +
      toNumber(asNumber(record.extension_payment)) +
      toNumber(asNumber(record.prior_year_credit)) +
      toNumber(asNumber(record.payment_carryforward)) +
      toNumber(asNumber(record.other_payments)) +
      toNumber(asNumber(record.county_withholding)) +
      readNamedAmountArrayTotal(record.additional_payments),
  );
}

export {
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
  getFederalDeductionBase,
  getStatePluginRecord,
  normalizeResidentFilingStatus,
  readNamedAmountArray,
  readNamedAmountArrayTotal,
  readPluginPaymentTotal,
  supportsAllocatedResidentComputation,
  sumStateAdditionAmounts,
  sumStateNonrefundableCredits,
  sumStateSubtractionAmounts,
  toWholeDollars,
};
