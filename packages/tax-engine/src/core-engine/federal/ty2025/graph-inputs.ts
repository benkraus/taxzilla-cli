import type {
  FederalModuleCatalogEntry,
  FormsGraphModule,
  FormsGraphNode,
} from "../../../blueprint";
import type {
  CoreEngineCapitalTransactionInput,
  CoreEngineDividendInput,
  CoreEngineInput,
  CoreEngineOtherIncomeItem,
  CoreEngineScheduleEActivity,
  CoreEngineTaxableInterestInput,
  CoreEngineWageInput,
} from "../../input";
import { SCHEDULE_E_PART_1_ACTIVITY_TYPES, SCHEDULE_E_PART_2_ACTIVITY_TYPES } from "./constants";
import {
  buildScheduleERollup,
  getFederalScheduleELimitationOverrides,
  roundMoney,
  toNumber,
} from "../../helpers";
import { buildMisc1099IncomeRollup } from "./income";
import {
  buildCapitalTransactionNodeId,
  buildDividendNodeId,
  buildOtherIncomeNodeId,
  buildScheduleBNodeId,
  buildScheduleEActivityNodeId,
  buildWageNodeId,
  inferFederalModuleType,
} from "./references";
import {
  FEDERAL_FORM_1040_CORE_MODULE_ID,
  FEDERAL_FORM_8949_MODULE_ID,
  FEDERAL_SCHEDULE_1_MODULE_ID,
  FEDERAL_SCHEDULE_B_MODULE_ID,
  FEDERAL_SCHEDULE_E_MODULE_ID,
  type FederalComputation,
  type Misc1099IncomeRollup,
} from "./types";

function buildFederalModules(
  entries: ReadonlyArray<FederalModuleCatalogEntry>,
): FormsGraphModule[] {
  return entries.map((entry) => ({
    module_id: entry.module_id,
    jurisdiction: "federal",
    module_type: inferFederalModuleType(entry),
    form_code: entry.form_code,
    version: "2025.engine.1",
    enabled: true,
  }));
}

function buildWageInputNodes(wages: ReadonlyArray<CoreEngineWageInput>): FormsGraphNode[] {
  return wages.map((wage, index) => ({
    node_id: buildWageNodeId(index),
    node_type: "input",
    jurisdiction: "federal",
    module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
    form_code: "W-2",
    line_code: "box1",
    label: "W-2 wages",
    data_type: "money",
    value: wage.wages_tips_other_compensation,
    source_json_pointers: [`/facts/income/wages/${index}/wages_tips_other_compensation`],
  }));
}

function buildInterestInputNodes(
  interests: ReadonlyArray<CoreEngineTaxableInterestInput>,
): FormsGraphNode[] {
  return interests.map((interest, index) => ({
    node_id: buildScheduleBNodeId(index),
    node_type: "input",
    jurisdiction: "federal",
    module_id: FEDERAL_SCHEDULE_B_MODULE_ID,
    form_code: "1099-INT",
    line_code: "box1",
    label: "Taxable interest",
    data_type: "money",
    value: interest.interest_income,
    source_json_pointers: [`/facts/income/taxable_interest/${index}/interest_income`],
  }));
}

function buildDividendInputNodes(
  dividends: ReadonlyArray<CoreEngineDividendInput>,
): FormsGraphNode[] {
  return dividends.map((dividend, index) => ({
    node_id: buildDividendNodeId(index),
    node_type: "input",
    jurisdiction: "federal",
    module_id: FEDERAL_SCHEDULE_B_MODULE_ID,
    form_code: "1099-DIV",
    line_code: "box1a",
    label: "Ordinary dividends",
    data_type: "money",
    value: toNumber(dividend.ordinary_dividends),
    source_json_pointers: [`/facts/income/dividends/${index}/ordinary_dividends`],
  }));
}

function buildCapitalTransactionInputNodes(
  transactions: ReadonlyArray<CoreEngineCapitalTransactionInput>,
): FormsGraphNode[] {
  return transactions.map((transaction, index) => ({
    node_id: buildCapitalTransactionNodeId(index),
    node_type: "input",
    jurisdiction: "federal",
    module_id: FEDERAL_FORM_8949_MODULE_ID,
    form_code: "8949",
    line_code: "gain_or_loss",
    label: "Capital transaction gain or loss",
    data_type: "money",
    value:
      transaction.gain_or_loss ??
      roundMoney(
        transaction.proceeds - toNumber(transaction.cost_basis) + toNumber(transaction.adjustments),
      ),
    source_json_pointers: [
      `/facts/income/capital_transactions/${index}/gain_or_loss`,
      `/facts/income/capital_transactions/${index}/date_acquired`,
      `/facts/income/capital_transactions/${index}/date_sold`,
      `/facts/income/capital_transactions/${index}/proceeds`,
      `/facts/income/capital_transactions/${index}/cost_basis`,
      `/facts/income/capital_transactions/${index}/adjustments`,
    ],
  }));
}

function buildOtherIncomeInputNodes(
  items: ReadonlyArray<CoreEngineOtherIncomeItem>,
): FormsGraphNode[] {
  return items.map((item, index) => ({
    node_id: buildOtherIncomeNodeId(index),
    node_type: "input",
    jurisdiction: "federal",
    module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
    form_code: "Schedule 1",
    line_code: "other_income",
    label: item.description,
    data_type: "money",
    value: item.amount,
    source_json_pointers: [`/facts/income/other_income_items/${index}/amount`],
  }));
}

function buildScheduleEActivitySourcePointers(
  activity: CoreEngineScheduleEActivity,
  index: number,
  misc1099IncomeRollup?: Misc1099IncomeRollup,
): string[] {
  return [
    ...activity.income_items.map(
      (_item, itemIndex) => `/facts/income/schedule_e_activities/${index}/income_items/${itemIndex}/amount`,
    ),
    ...activity.expense_items.map(
      (_item, itemIndex) =>
        `/facts/income/schedule_e_activities/${index}/expense_items/${itemIndex}/amount`,
    ),
    ...(misc1099IncomeRollup?.scheduleEMiscIndicesByActivityIndex.get(index) ?? []).map(
      (miscIndex) => `/facts/income/miscellaneous_1099_income/${miscIndex}/amount`,
    ),
  ];
}

function buildScheduleENodes(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  if (!args.input.facts.income.schedule_e_activities.length) {
    return [];
  }

  const misc1099IncomeRollup = buildMisc1099IncomeRollup(args.input);
  const scheduleERollup = buildScheduleERollup(args.input.facts.income.schedule_e_activities, {
    additionalIncomeByActivityIndex: misc1099IncomeRollup.scheduleEIncomeByActivityIndex,
    limitationOverrides: getFederalScheduleELimitationOverrides(args.input),
  });
  const part1FormulaParts = scheduleERollup.activityNets
    .filter((activity) => SCHEDULE_E_PART_1_ACTIVITY_TYPES.has(activity.activityType))
    .map((activity) => buildScheduleEActivityNodeId(activity.index));
  const part2FormulaParts = scheduleERollup.activityNets
    .filter((activity) => SCHEDULE_E_PART_2_ACTIVITY_TYPES.has(activity.activityType))
    .map((activity) => buildScheduleEActivityNodeId(activity.index));
  const unclassifiedFormulaParts = scheduleERollup.activityNets
    .filter(
      (activity) =>
        !SCHEDULE_E_PART_1_ACTIVITY_TYPES.has(activity.activityType) &&
        !SCHEDULE_E_PART_2_ACTIVITY_TYPES.has(activity.activityType),
    )
    .map((activity) => buildScheduleEActivityNodeId(activity.index));

  const activityNodes = scheduleERollup.activityNets.flatMap((activity) => {
    const sourceActivity = args.input.facts.income.schedule_e_activities[activity.index];

    /* v8 ignore next 3 */
    if (!sourceActivity) {
      return [];
    }

    return [
      {
        node_id: buildScheduleEActivityNodeId(activity.index),
        node_type: "line" as const,
        jurisdiction: "federal",
        module_id: FEDERAL_SCHEDULE_E_MODULE_ID,
        form_code: "Schedule E",
        line_code: "activity.net",
        label: `${activity.entityName} net supplemental income or loss`,
        data_type: "money" as const,
        value: activity.netAmount,
        formula_ref: "sum(income_items) - sum(expense_items)",
        source_json_pointers: buildScheduleEActivitySourcePointers(
          sourceActivity,
          activity.index,
          misc1099IncomeRollup,
        ),
      },
    ];
  });

  return [
    ...activityNodes,
    ...(part1FormulaParts.length > 0
      ? [
          {
            node_id: "sche.part1.total",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_E_MODULE_ID,
            form_code: "Schedule E",
            line_code: "part1.total",
            label: "Part I rental and royalty net income or loss",
            data_type: "money" as const,
            value: args.computation.scheduleEPart1NetTotal,
            formula_ref: part1FormulaParts.join(" + "),
          },
        ]
      : []),
    ...(part2FormulaParts.length > 0
      ? [
          {
            node_id: "sche.part2.total",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_E_MODULE_ID,
            form_code: "Schedule E",
            line_code: "part2.total",
            label: "Part II pass-through net income or loss",
            data_type: "money" as const,
            value: args.computation.scheduleEPart2NetTotal,
            formula_ref: part2FormulaParts.join(" + "),
          },
        ]
      : []),
    {
      node_id: "sche.summary.total",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_E_MODULE_ID,
      form_code: "Schedule E",
      line_code: "summary.total",
      label: "Schedule E total supplemental income or loss",
      data_type: "money",
      value: args.computation.scheduleEActivityNetTotal,
      formula_ref: [
        part1FormulaParts.length > 0 ? "sche.part1.total" : null,
        part2FormulaParts.length > 0 ? "sche.part2.total" : null,
        ...unclassifiedFormulaParts,
      ]
        .filter((part): part is string => part !== null)
        .join(" + "),
      source_json_pointers: args.input.facts.income.schedule_e_activities.flatMap((activity, index) =>
        buildScheduleEActivitySourcePointers(activity, index, misc1099IncomeRollup),
      ),
    },
  ];
}

export {
  buildCapitalTransactionInputNodes,
  buildDividendInputNodes,
  buildFederalModules,
  buildInterestInputNodes,
  buildOtherIncomeInputNodes,
  buildScheduleEActivitySourcePointers,
  buildScheduleENodes,
  buildWageInputNodes,
};
