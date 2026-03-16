import type { FormsGraphNode } from "../../../blueprint";
import type { CoreEngineInput, CoreEngineNamedAmount } from "../../input";
import { DERIVED_ADJUSTMENT_KEYS, SCHEDULE_1_DIRECT_ADJUSTMENT_LINES } from "./constants";
import { asRecord, asString, roundMoney, sumNamedAmounts, toNumber } from "../../helpers";
import { buildMisc1099IncomeRollup, buildSourceDocumentPayloadPointersById } from "./income";
import { buildScheduleEActivitySourcePointers } from "./graph-inputs";
import {
  FEDERAL_FORM_1040_CORE_MODULE_ID,
  FEDERAL_SCHEDULE_1_MODULE_ID,
  FEDERAL_SCHEDULE_2_MODULE_ID,
  FEDERAL_SCHEDULE_3_MODULE_ID,
  FEDERAL_SCHEDULE_A_MODULE_ID,
  FEDERAL_SCHEDULE_B_MODULE_ID,
  type FederalComputation,
  type Schedule1AdjustmentLineItem,
} from "./types";

function buildScheduleBNodes(computation: FederalComputation): FormsGraphNode[] {
  return [
    {
      node_id: "schedb.line2",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_B_MODULE_ID,
      form_code: "Schedule B",
      line_code: "2",
      label: "Taxable interest total",
      data_type: "money",
      value: computation.taxableInterestTotal,
      formula_ref: "sum(input.1099int.*)",
    },
    {
      node_id: "schedb.line4",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_B_MODULE_ID,
      form_code: "Schedule B",
      line_code: "4",
      label: "Ordinary dividends total",
      data_type: "money",
      value: computation.ordinaryDividendsTotal,
      formula_ref: "sum(input.1099div.*)",
    },
  ];
}

function buildSchedule1AdjustmentSourcePointers(
  adjustments: CoreEngineInput["facts"]["adjustments"],
  options?: {
    readonly excludedKeys?: ReadonlySet<string>;
    readonly includedKeys?: ReadonlySet<string>;
  },
): string[] {
  const pointers: string[] = [];

  for (const [adjustmentKey, value] of Object.entries(adjustments)) {
    if (options?.includedKeys && !options.includedKeys.has(adjustmentKey)) {
      continue;
    }

    if (options?.excludedKeys?.has(adjustmentKey)) {
      continue;
    }

    if (typeof value === "number" && value !== 0) {
      pointers.push(`/facts/adjustments/${adjustmentKey}`);
      continue;
    }

    if (Array.isArray(value) && value.length > 0) {
      pointers.push(`/facts/adjustments/${adjustmentKey}`);
    }
  }

  return pointers;
}

function getSchedule1OtherAdjustments(
  adjustments: CoreEngineInput["facts"]["adjustments"],
): CoreEngineNamedAmount[] {
  const otherAdjustments = adjustments.other_adjustments;

  if (!Array.isArray(otherAdjustments)) {
    return [];
  }

  return otherAdjustments.flatMap((item) => {
    const record = asRecord(item);
    const description = asString(record?.description);
    const amount = record?.amount;

    if (!description || typeof amount !== "number") {
      return [];
    }

    return [
      {
        description,
        amount: roundMoney(amount),
      },
    ];
  });
}

function buildSchedule1AdjustmentLineItems(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): Schedule1AdjustmentLineItem[] {
  const items: Schedule1AdjustmentLineItem[] = [];

  for (const line of SCHEDULE_1_DIRECT_ADJUSTMENT_LINES) {
    const value =
      line.adjustmentKey === "deductible_part_of_self_employment_tax"
        ? args.computation.selfEmploymentTaxDeduction
        : roundMoney(
            toNumber(
              args.input.facts.adjustments[line.adjustmentKey] as number | null | undefined,
            ),
          );

    if (value === 0) {
      continue;
    }

    items.push({
      formulaRef:
        line.adjustmentKey === "deductible_part_of_self_employment_tax"
          ? "schse.summary.deduction"
          : `facts.adjustments.${line.adjustmentKey}`,
      label: line.label,
      lineCode: line.lineCode,
      nodeId: line.nodeId,
      sourceJsonPointers: [`/facts/adjustments/${line.adjustmentKey}`],
      value,
    });
  }

  return items;
}

function buildSchedule1Nodes(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  if (
    args.computation.schedule1AdditionalIncomeTotal === 0 &&
    args.computation.totalAdjustments === 0
  ) {
    return [];
  }

  const hasLine8OtherIncome =
    args.computation.line8bGamblingIncomeTotal > 0 ||
    args.computation.line8jNonbusinessActivityIncomeTotal > 0 ||
    args.computation.line8zOtherIncomeTotal > 0;
  const misc1099IncomeRollup = buildMisc1099IncomeRollup(args.input);
  const directAdjustmentLineItems = buildSchedule1AdjustmentLineItems(args);
  const otherAdjustmentItems = getSchedule1OtherAdjustments(args.input.facts.adjustments);
  const otherAdjustmentNodeIds = otherAdjustmentItems.map((_item, index) => `sch1.line24z.${index}`);
  const line26FormulaParts = [
    ...directAdjustmentLineItems.map((item) => item.nodeId),
    otherAdjustmentItems.length > 0 ? "sch1.line25" : null,
  ].filter((part): part is string => part !== null);
  const additionalIncomeFormulaParts = [
    args.computation.scheduleCBusinessNetProfit !== 0 ? "sch1.line3" : null,
    args.computation.scheduleEActivityNetTotal !== 0 ? "sch1.line5" : null,
    args.computation.unemploymentCompensationTotal > 0 ? "sch1.line7" : null,
    hasLine8OtherIncome ? "sch1.line9" : null,
  ].filter((part): part is string => part !== null);

  return [
    ...(args.computation.scheduleCBusinessNetProfit !== 0
      ? [
          {
            node_id: "sch1.line3",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "3",
            label: "Business income or loss",
            data_type: "money" as const,
            value: args.computation.scheduleCBusinessNetProfit,
            formula_ref: "schc.line31.net_profit",
            source_json_pointers: [
              ...args.input.facts.income.schedule_c_businesses.flatMap((_business, index) => [
                `/facts/income/schedule_c_businesses/${index}/gross_receipts_or_sales`,
                `/facts/income/schedule_c_businesses/${index}/returns_and_allowances`,
                `/facts/income/schedule_c_businesses/${index}/cost_of_goods_sold`,
                `/facts/income/schedule_c_businesses/${index}/other_business_income`,
                `/facts/income/schedule_c_businesses/${index}/expenses`,
                `/facts/income/schedule_c_businesses/${index}/home_office_deduction`,
              ]),
              ...args.input.facts.income.nonemployee_compensation.flatMap(
                (_nonemployeeCompensation, index) => [
                  `/facts/income/nonemployee_compensation/${index}/amount`,
                  `/facts/income/nonemployee_compensation/${index}/linked_business_id`,
                ],
              ),
            ],
          },
        ]
      : []),
    ...(args.computation.scheduleEActivityNetTotal !== 0
      ? [
          {
            node_id: "sch1.line5",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "5",
            label: "Rental real estate, royalties, partnerships, S corporations, trusts, etc.",
            data_type: "money" as const,
            value: args.computation.scheduleEActivityNetTotal,
            formula_ref: "sche.summary.total",
            source_json_pointers: args.input.facts.income.schedule_e_activities.flatMap(
              (activity, index) =>
                buildScheduleEActivitySourcePointers(activity, index, misc1099IncomeRollup),
            ),
          },
        ]
      : []),
    ...(args.computation.unemploymentCompensationTotal > 0
      ? [
          {
            node_id: "sch1.line7",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "7",
            label: "Unemployment compensation",
            data_type: "money" as const,
            value: args.computation.unemploymentCompensationTotal,
            formula_ref: "sum(1099-G unemployment compensation)",
            source_json_pointers: args.input.facts.income.unemployment_compensation.flatMap(
              (unemployment, index) => [
                `/facts/income/unemployment_compensation/${index}/unemployment_compensation`,
                ...buildSourceDocumentPayloadPointersById(
                  args.input.source_documents,
                  unemployment.source_document_id,
                  ["unemployment_compensation"],
                ),
              ],
            ),
          },
        ]
      : []),
    ...(args.computation.line8bGamblingIncomeTotal > 0
      ? [
          {
            node_id: "sch1.line8b",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "8b",
            label: "Gambling income",
            data_type: "money" as const,
            value: args.computation.line8bGamblingIncomeTotal,
            formula_ref: "sum(1099-MISC wagering amounts)",
            source_json_pointers: args.input.facts.income.miscellaneous_1099_income.flatMap(
              (miscellaneousIncome, index) =>
                miscellaneousIncome.income_category === "wagering"
                  ? [`/facts/income/miscellaneous_1099_income/${index}/amount`]
                  : [],
            ),
          },
        ]
      : []),
    ...(args.computation.line8jNonbusinessActivityIncomeTotal > 0
      ? [
          {
            node_id: "sch1.line8j",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "8j",
            label: "Activity not engaged in for profit income",
            data_type: "money" as const,
            value: args.computation.line8jNonbusinessActivityIncomeTotal,
            formula_ref:
              "sum(unlinked 1099-NEC amounts not tied to a Schedule C business in the current return)",
            source_json_pointers: args.input.facts.income.nonemployee_compensation.flatMap(
              (_nonemployeeCompensation, index) => [
                `/facts/income/nonemployee_compensation/${index}/amount`,
                `/facts/income/nonemployee_compensation/${index}/linked_business_id`,
              ],
            ),
          },
        ]
      : []),
    ...(args.computation.line8zOtherIncomeTotal > 0
      ? [
          {
            node_id: "sch1.line8z",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "8z",
            label: "Other income",
            data_type: "money" as const,
            value: args.computation.line8zOtherIncomeTotal,
            formula_ref:
              "sum(manual other income items and supported 1099-MISC other-income or substitute-payment categories)",
            source_json_pointers: [
              ...args.input.facts.income.other_income_items.map(
                (_item, index) => `/facts/income/other_income_items/${index}/amount`,
              ),
              ...args.input.facts.income.miscellaneous_1099_income.flatMap(
                (miscellaneousIncome, index) =>
                  miscellaneousIncome.income_category === "other_income" ||
                  miscellaneousIncome.income_category === "other"
                    ? [`/facts/income/miscellaneous_1099_income/${index}/amount`]
                    : [],
              ),
            ],
          },
        ]
      : []),
    ...(hasLine8OtherIncome
      ? [
          {
            node_id: "sch1.line9",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "9",
            label: "Total other income",
            data_type: "money" as const,
            value: args.computation.otherIncomeDirectTotal,
            formula_ref: [
              args.computation.line8bGamblingIncomeTotal > 0 ? "sch1.line8b" : null,
              args.computation.line8jNonbusinessActivityIncomeTotal > 0 ? "sch1.line8j" : null,
              args.computation.line8zOtherIncomeTotal > 0 ? "sch1.line8z" : null,
            ]
              .filter((part): part is string => part !== null)
              .join(" + "),
          },
        ]
      : []),
    {
      node_id: "sch1.line10",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
      form_code: "Schedule 1",
      line_code: "10",
      label: "Additional income total",
      data_type: "money",
      value: args.computation.schedule1AdditionalIncomeTotal,
      formula_ref:
        additionalIncomeFormulaParts.length > 0
          ? additionalIncomeFormulaParts.join(" + ")
          : "literal(0)",
      source_json_pointers: [
        ...args.input.facts.income.nonemployee_compensation.flatMap(
          (_nonemployeeCompensation, index) => [
            `/facts/income/nonemployee_compensation/${index}/amount`,
            `/facts/income/nonemployee_compensation/${index}/linked_business_id`,
          ],
        ),
        ...args.input.facts.income.miscellaneous_1099_income.map(
          (_miscellaneousIncome, index) => `/facts/income/miscellaneous_1099_income/${index}/amount`,
        ),
        ...args.input.facts.income.schedule_e_activities.flatMap((activity, index) =>
          buildScheduleEActivitySourcePointers(activity, index, misc1099IncomeRollup),
        ),
        ...args.input.facts.income.unemployment_compensation.flatMap((unemployment, index) => [
          `/facts/income/unemployment_compensation/${index}/unemployment_compensation`,
          ...buildSourceDocumentPayloadPointersById(
            args.input.source_documents,
            unemployment.source_document_id,
            ["unemployment_compensation"],
          ),
        ]),
      ],
    },
    ...directAdjustmentLineItems.map((item) => ({
      node_id: item.nodeId,
      node_type: "line" as const,
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
      form_code: "Schedule 1",
      line_code: item.lineCode,
      label: item.label,
      data_type: "money" as const,
      value: item.value,
      formula_ref: item.formulaRef,
      source_json_pointers: [...item.sourceJsonPointers],
    })),
    ...otherAdjustmentItems.map((item, index) => ({
      node_id: otherAdjustmentNodeIds[index]!,
      node_type: "line" as const,
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
      form_code: "Schedule 1",
      line_code: "24z",
      label: item.description,
      data_type: "money" as const,
      value: item.amount,
      formula_ref: `facts.adjustments.other_adjustments[${index}]`,
      source_json_pointers: [
        `/facts/adjustments/other_adjustments/${index}/description`,
        `/facts/adjustments/other_adjustments/${index}/amount`,
      ],
    })),
    ...(otherAdjustmentItems.length > 0
      ? [
          {
            node_id: "sch1.line25",
            node_type: "line" as const,
            jurisdiction: "federal",
            module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
            form_code: "Schedule 1",
            line_code: "25",
            label: "Other adjustments total",
            data_type: "money" as const,
            value: sumNamedAmounts(otherAdjustmentItems),
            formula_ref: otherAdjustmentNodeIds.join(" + "),
            source_json_pointers: otherAdjustmentItems.flatMap((_item, index) => [
              `/facts/adjustments/other_adjustments/${index}/description`,
              `/facts/adjustments/other_adjustments/${index}/amount`,
            ]),
          },
        ]
      : []),
    {
      node_id: "sch1.line26",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_1_MODULE_ID,
      form_code: "Schedule 1",
      line_code: "26",
      label: "Adjustments to income total",
      data_type: "money",
      value: args.computation.totalAdjustments,
      formula_ref: line26FormulaParts.length > 0 ? line26FormulaParts.join(" + ") : "literal(0)",
      source_json_pointers: buildSchedule1AdjustmentSourcePointers(args.input.facts.adjustments, {
        excludedKeys: DERIVED_ADJUSTMENT_KEYS,
      }),
    },
  ];
}

function buildSchedule2Nodes(computation: FederalComputation): FormsGraphNode[] {
  if (computation.schedule2OtherTaxesTotal === 0) {
    return [];
  }

  return [
    {
      node_id: "sch2.summary.other_taxes",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_2_MODULE_ID,
      form_code: "Schedule 2",
      line_code: "summary.other_taxes",
      label: "Other taxes",
      data_type: "money",
      value: computation.schedule2OtherTaxesTotal,
      formula_ref: "Schedule SE + Form 8959 + Form 8960 + Form 8962 repayment taxes",
    },
  ];
}

function buildScheduleANodes(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  if (args.computation.itemizedDeductionTotal === 0) {
    return [];
  }

  return [
    {
      node_id: "scha.line17",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_A_MODULE_ID,
      form_code: "Schedule A",
      line_code: "17",
      label: "Total itemized deductions",
      data_type: "money",
      value: args.computation.itemizedDeductionTotal,
      formula_ref: "sum(itemized_deductions.*)",
      source_json_pointers: [
        "/facts/itemized_deductions/medical_and_dental_expenses",
        "/facts/itemized_deductions/state_and_local_income_or_sales_taxes",
        "/facts/itemized_deductions/real_estate_taxes",
        "/facts/itemized_deductions/personal_property_taxes",
        "/facts/itemized_deductions/other_taxes",
        "/facts/itemized_deductions/mortgage_interest_items",
        "/facts/itemized_deductions/charitable_cash_contributions",
        "/facts/itemized_deductions/charitable_noncash_contributions",
        "/facts/itemized_deductions/casualty_and_theft_losses",
        "/facts/itemized_deductions/other_itemized_deductions",
      ],
    },
    {
      node_id: "1040.choice.deduction_strategy",
      node_type: "choice",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "deduction_strategy",
      label: "Deduction strategy",
      data_type: "enum",
      value: args.computation.deductionStrategy,
      formula_ref: "max(standard_deduction, Schedule A)",
    },
  ];
}

function buildSchedule3Nodes(computation: FederalComputation): FormsGraphNode[] {
  if (
    computation.schedule3NonrefundableCreditsTotal === 0 &&
    computation.schedule3PaymentsTotal === 0
  ) {
    return [];
  }

  return [
    {
      node_id: "sch3.part1.total_nonrefundable_credits",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_3_MODULE_ID,
      form_code: "Schedule 3",
      line_code: "part1",
      label: "Additional nonrefundable credits",
      data_type: "money",
      value: computation.schedule3NonrefundableCreditsTotal,
      formula_ref: "child/dependent care + education credits + other nonrefundable credits",
    },
    {
      node_id: "sch3.part2.total_payments",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_3_MODULE_ID,
      form_code: "Schedule 3",
      line_code: "part2",
      label: "Additional payments and refundable credits",
      data_type: "money",
      value: computation.schedule3PaymentsTotal,
      formula_ref:
        "estimated payments + extension payments + prior-year overpayment + other refundable credits + net premium tax credit",
    },
  ];
}

export {
  buildSchedule1AdjustmentLineItems,
  buildSchedule1AdjustmentSourcePointers,
  buildSchedule1Nodes,
  buildSchedule2Nodes,
  buildSchedule3Nodes,
  buildScheduleANodes,
  buildScheduleBNodes,
  getSchedule1OtherAdjustments,
};
