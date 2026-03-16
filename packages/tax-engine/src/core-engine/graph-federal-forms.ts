import type { FormsGraphNode } from "../blueprint";
import type { CoreEngineInput } from "./input";
import { getFederalScheduleDExtension, roundMoney, toNumber } from "./helpers";
import {
  FEDERAL_FORM_2441_MODULE_ID,
  FEDERAL_FORM_8812_MODULE_ID,
  FEDERAL_FORM_8863_MODULE_ID,
  FEDERAL_FORM_8889_MODULE_ID,
  FEDERAL_FORM_8949_MODULE_ID,
  FEDERAL_FORM_8959_MODULE_ID,
  FEDERAL_FORM_8960_MODULE_ID,
  FEDERAL_FORM_8962_MODULE_ID,
  FEDERAL_SCHEDULE_C_MODULE_ID,
  FEDERAL_SCHEDULE_D_MODULE_ID,
  FEDERAL_SCHEDULE_SE_MODULE_ID,
} from "./types";
import type { FederalComputation, FederalModuleActivationState } from "./types";
import { buildForm1099DivPayloadPointers } from "./foundations";
import { inferCapitalTransactionTerm } from "./income";

function buildScheduleCNodes(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  if (args.input.facts.income.schedule_c_businesses.length === 0) {
    return [];
  }

  return [
    {
      node_id: "schc.line31.net_profit",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_C_MODULE_ID,
      form_code: "Schedule C",
      line_code: "31",
      label: "Net profit or loss",
      data_type: "money",
      value: args.computation.scheduleCBusinessNetProfit,
      formula_ref:
        args.computation.linkedNonemployeeCompensationToScheduleCTotal > 0
          ? "gross receipts + linked or inferred 1099-NEC amounts - expenses - home office"
          : "gross receipts - expenses - home office",
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
  ];
}

function buildScheduleDNodes(args: {
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  const scheduleDExtension = getFederalScheduleDExtension(args.input);
  const scheduleDTermOptions = {
    sourceDocuments: args.input.source_documents,
    termOverrides: scheduleDExtension?.transaction_term_overrides ?? [],
  };
  const shortTermFormulaParts = ["sum(short-term 8949 transactions)"];
  const longTermFormulaParts = ["sum(long-term 8949 transactions)"];

  if (args.computation.capitalGainDistributionsTotal > 0) {
    longTermFormulaParts.push("schd.line13");
  }

  if (args.computation.taxableSection1202GainTotal > 0) {
    longTermFormulaParts.push("taxable section 1202 gain");
  }

  if (args.computation.scheduleDPriorYearShortTermCapitalLossCarryforward !== 0) {
    shortTermFormulaParts.push("prior-year short-term capital loss carryforward");
  }

  if (args.computation.scheduleDPriorYearLongTermCapitalLossCarryforward !== 0) {
    longTermFormulaParts.push("prior-year long-term capital loss carryforward");
  }

  if (
    args.input.facts.income.capital_transactions.length === 0 &&
    args.computation.capitalGainDistributionsTotal === 0 &&
    args.computation.scheduleDPriorYearShortTermCapitalLossCarryforward === 0 &&
    args.computation.scheduleDPriorYearLongTermCapitalLossCarryforward === 0 &&
    args.computation.scheduleDCollectibles28PercentGainTotal === 0 &&
    args.computation.scheduleDUnrecapturedSection1250GainTotal === 0 &&
    args.computation.taxableSection1202GainTotal === 0
  ) {
    return [];
  }

  const nodes: FormsGraphNode[] = [];

  if (args.input.facts.income.capital_transactions.length > 0) {
    nodes.push({
      node_id: "8949.total.net_gain_or_loss",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_8949_MODULE_ID,
      form_code: "8949",
      line_code: "summary",
      label: "Capital transaction net gain or loss",
      data_type: "money",
      value: args.computation.capitalTransactionsNetTotal,
      formula_ref: "sum(input.8949.*)",
      source_json_pointers: args.input.facts.income.capital_transactions.flatMap(
        (_transaction, index) => [
          `/facts/income/capital_transactions/${index}/gain_or_loss`,
          `/facts/income/capital_transactions/${index}/proceeds`,
          `/facts/income/capital_transactions/${index}/cost_basis`,
          `/facts/income/capital_transactions/${index}/adjustments`,
        ],
      ),
    });
  }

  nodes.push(
    {
      node_id: "schd.line7",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "7",
      label: "Net short-term capital gain or loss",
      data_type: "money",
      value: args.computation.scheduleDShortTermCapitalGainOrLossTotal,
      formula_ref: shortTermFormulaParts.join(" + "),
      source_json_pointers: [
        ...args.input.facts.income.capital_transactions.flatMap((transaction, index) =>
          inferCapitalTransactionTerm(transaction, scheduleDTermOptions) === "long"
            ? []
            : [
                `/facts/income/capital_transactions/${index}/date_acquired`,
                `/facts/income/capital_transactions/${index}/date_sold`,
                `/facts/income/capital_transactions/${index}/gain_or_loss`,
                `/facts/income/capital_transactions/${index}/proceeds`,
                `/facts/income/capital_transactions/${index}/cost_basis`,
                `/facts/income/capital_transactions/${index}/adjustments`,
              ],
        ),
        ...(args.computation.scheduleDPriorYearShortTermCapitalLossCarryforward !== 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/prior_year_short_term_capital_loss_carryforward"]
          : []),
        ...(scheduleDTermOptions.termOverrides.length > 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/transaction_term_overrides"]
          : []),
      ],
    },
    {
      node_id: "schd.line13",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "13",
      label: "Capital gain distributions",
      data_type: "money",
      value: args.computation.capitalGainDistributionsTotal,
      formula_ref: "sum(1099-DIV capital gain distributions)",
      source_json_pointers: args.input.facts.income.dividends.flatMap((dividend, index) =>
        toNumber(dividend.capital_gain_distributions) > 0
          ? [`/facts/income/dividends/${index}/capital_gain_distributions`]
          : [],
      ),
    },
    {
      node_id: "schd.line15",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "15",
      label: "Net long-term capital gain or loss",
      data_type: "money",
      value: args.computation.scheduleDLongTermCapitalGainOrLossTotal,
      formula_ref: longTermFormulaParts.join(" + "),
      source_json_pointers: [
        ...args.input.facts.income.capital_transactions.flatMap((transaction, index) =>
          inferCapitalTransactionTerm(transaction, scheduleDTermOptions) === "long"
            ? [
                `/facts/income/capital_transactions/${index}/date_acquired`,
                `/facts/income/capital_transactions/${index}/date_sold`,
                `/facts/income/capital_transactions/${index}/gain_or_loss`,
                `/facts/income/capital_transactions/${index}/proceeds`,
                `/facts/income/capital_transactions/${index}/cost_basis`,
                `/facts/income/capital_transactions/${index}/adjustments`,
              ]
            : [],
        ),
        ...args.input.facts.income.dividends.flatMap((dividend, index) =>
          toNumber(dividend.capital_gain_distributions) > 0
            ? [`/facts/income/dividends/${index}/capital_gain_distributions`]
            : [],
        ),
        ...(args.computation.taxableSection1202GainTotal > 0
          ? [
              ...buildForm1099DivPayloadPointers(args.input.source_documents, "section_1202_gain"),
              "/facts/state_specific_fact_bag/federal/schedule_d/section1202_exclusion_amount",
            ]
          : []),
        ...(args.computation.scheduleDPriorYearLongTermCapitalLossCarryforward !== 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/prior_year_long_term_capital_loss_carryforward"]
          : []),
        ...(scheduleDTermOptions.termOverrides.length > 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/transaction_term_overrides"]
          : []),
      ],
    },
  );

  if (args.computation.section1202ExclusionAmount > 0) {
    nodes.push({
      node_id: "schd.summary.section1202_exclusion",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "summary.section1202_exclusion",
      label: "Excluded section 1202 gain",
      data_type: "money",
      value: args.computation.section1202ExclusionAmount,
      formula_ref: "explicit allowable section 1202 exclusion amount from the federal extension bag",
      source_json_pointers: ["/facts/state_specific_fact_bag/federal/schedule_d/section1202_exclusion_amount"],
    });
  }

  if (args.computation.scheduleDCollectibles28PercentGainTotal > 0) {
    nodes.push({
      node_id: "schd.line18",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "18",
      label: "28% rate gain",
      data_type: "money",
      value: args.computation.scheduleDCollectibles28PercentGainTotal,
      formula_ref:
        args.computation.taxableSection1202GainTotal > 0
          ? "28% Rate Gain Worksheet from reviewed 1099-DIV collectibles gain, taxable section 1202 gain, and short-term loss offsets"
          : "28% Rate Gain Worksheet from reviewed 1099-DIV collectibles gain inputs and short-term loss offsets",
      source_json_pointers: [
        ...buildForm1099DivPayloadPointers(
          args.input.source_documents,
          "collectibles_28_percent_gain",
        ),
        ...buildForm1099DivPayloadPointers(args.input.source_documents, "section_1202_gain"),
        ...(args.computation.section1202ExclusionAmount > 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/section1202_exclusion_amount"]
          : []),
      ],
    });
  }

  if (args.computation.scheduleDUnrecapturedSection1250GainTotal > 0) {
    nodes.push({
      node_id: "schd.line19",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "19",
      label: "Unrecaptured section 1250 gain",
      data_type: "money",
      value: args.computation.scheduleDUnrecapturedSection1250GainTotal,
      formula_ref:
        "Unrecaptured Section 1250 Gain Worksheet from reviewed 1099-DIV inputs and loss offsets",
      source_json_pointers: [
        ...buildForm1099DivPayloadPointers(
          args.input.source_documents,
          "unrecaptured_section_1250_gain",
        ),
        ...(args.computation.taxableSection1202GainTotal > 0
          ? ["/facts/state_specific_fact_bag/federal/schedule_d/section1202_exclusion_amount"]
          : []),
      ],
    });
  }

  nodes.push({
    node_id: "schd.line16",
    node_type: "line",
    jurisdiction: "federal",
    module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
    form_code: "Schedule D",
    line_code: "16",
    label: "Net capital gain or loss",
    data_type: "money",
    value: args.computation.scheduleDNetCapitalGainOrLossTotal,
    formula_ref: "schd.line7 + schd.line15",
  });

  if (args.computation.scheduleDNetCapitalGainOrLossTotal < 0) {
    nodes.push({
      node_id: "schd.line21",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_D_MODULE_ID,
      form_code: "Schedule D",
      line_code: "21",
      label: "Deductible capital loss for Form 1040 line 7",
      data_type: "money",
      value: args.computation.capitalGainOrLossTotal,
      formula_ref:
        "if schd.line16 is a loss, cap the deductible amount at the annual filing-status limit",
    });
  }

  return nodes;
}

function buildScheduleSENodes(computation: FederalComputation): FormsGraphNode[] {
  if (computation.selfEmploymentTax === 0) {
    return [];
  }

  return [
    {
      node_id: "schse.line4a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_SE_MODULE_ID,
      form_code: "Schedule SE",
      line_code: "4a",
      label: "Net earnings from self-employment",
      data_type: "money",
      value: computation.selfEmploymentNetEarnings,
      formula_ref: "Schedule C net profit x 92.35%",
    },
    {
      node_id: "schse.line12",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_SE_MODULE_ID,
      form_code: "Schedule SE",
      line_code: "12",
      label: "Self-employment tax",
      data_type: "money",
      value: computation.selfEmploymentTax,
      formula_ref: "social security portion + medicare portion",
    },
    {
      node_id: "schse.summary.deduction",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_SCHEDULE_SE_MODULE_ID,
      form_code: "Schedule SE",
      line_code: "summary.deduction",
      label: "Deduction for one-half of self-employment tax",
      data_type: "money",
      value: computation.selfEmploymentTaxDeduction,
      formula_ref: "schse.line12 / 2",
    },
  ];
}

function buildOptionalFederalFormNodes(args: {
  readonly activations: FederalModuleActivationState;
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  const nodes: FormsGraphNode[] = [];

  if (args.activations.form2441Activated) {
    nodes.push({
      node_id: "2441.summary.qualifying_expenses",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_2441_MODULE_ID,
      form_code: "2441",
      line_code: "summary.qualifying_expenses",
      label: "Qualified child and dependent care expenses",
      data_type: "money",
      value: args.computation.form2441QualifiedExpenses,
      formula_ref: "sum(facts.credits.child_and_dependent_care.expenses.*)",
    });
    nodes.push({
      node_id: "2441.summary.allowed_credit",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_2441_MODULE_ID,
      form_code: "2441",
      line_code: "summary.allowed_credit",
      label: "Allowed child and dependent care credit",
      data_type: "money",
      value: args.computation.childAndDependentCareCredit,
      formula_ref: "qualified expenses x applicable percentage, limited by earned income",
    });
  }

  if (args.activations.form8812Activated) {
    nodes.push({
      node_id: "8812.summary.qualifying_children_count",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_8812_MODULE_ID,
      form_code: "8812",
      line_code: "summary.qualifying_children_count",
      label: "Qualifying child credit candidates",
      data_type: "integer",
      value: args.computation.form8812QualifyingChildrenCount,
      formula_ref: "count(candidate_child_tax_credit_dependent_ids)",
    });
    nodes.push(
      {
        node_id: "8812.summary.other_dependents_count",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8812_MODULE_ID,
        form_code: "8812",
        line_code: "summary.other_dependents_count",
        label: "Other dependent credit candidates",
        data_type: "integer",
        value: args.computation.form8812OtherDependentsCount,
        formula_ref: "count(candidate_credit_for_other_dependent_ids)",
      },
      {
        node_id: "8812.summary.nonrefundable_credit",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8812_MODULE_ID,
        form_code: "8812",
        line_code: "summary.nonrefundable_credit",
        label: "Allowed child tax credit and credit for other dependents",
        data_type: "money",
        value: args.computation.line19ChildTaxCreditOrCreditForOtherDependents,
        formula_ref: "combined child/other dependent credit after phaseout and tax limitation",
      },
      {
        node_id: "8812.summary.additional_child_tax_credit",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8812_MODULE_ID,
        form_code: "8812",
        line_code: "summary.additional_child_tax_credit",
        label: "Additional child tax credit",
        data_type: "money",
        value: args.computation.form8812AdditionalChildTaxCredit,
        formula_ref: args.computation.form8812AlternativeActcMethodUsed
          ? "max(earned_income_method, credit_limit_worksheet_b_method), limited by unused child credit and per-child cap"
          : args.computation.form8812AlternativeActcMethodConsidered
            ? "max(earned_income_method, credit_limit_worksheet_b_method comparison)"
            : "unused child tax credit limited by earned income and per-child cap",
      },
    );
  }

  if (args.activations.form8863Activated) {
    nodes.push({
      node_id: "8863.summary.net_qualified_expenses",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_8863_MODULE_ID,
      form_code: "8863",
      line_code: "summary.net_qualified_expenses",
      label: "Net qualified education expenses",
      data_type: "money",
      value: args.computation.form8863NetQualifiedExpenses,
      formula_ref: "sum(qualified_expenses_paid - tax_free_assistance)",
    });
    nodes.push(
      {
        node_id: "8863.summary.nonrefundable_credit",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8863_MODULE_ID,
        form_code: "8863",
        line_code: "summary.nonrefundable_credit",
        label: "Allowed nonrefundable education credit",
        data_type: "money",
        value: args.computation.educationCreditNonrefundable,
        formula_ref: "AOTC and LLC after MAGI phaseout, net of refundable portion",
      },
      {
        node_id: "8863.summary.refundable_credit",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8863_MODULE_ID,
        form_code: "8863",
        line_code: "summary.refundable_credit",
        label: "Refundable education credit",
        data_type: "money",
        value: args.computation.educationCreditRefundable,
        formula_ref: "40% of allowed AOTC",
      },
    );
  }

  if (args.activations.form8889Activated) {
    nodes.push({
      node_id: "8889.summary.hsa_deduction",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_8889_MODULE_ID,
      form_code: "8889",
      line_code: "summary.hsa_deduction",
      label: "HSA deduction candidate",
      data_type: "money",
      value: roundMoney(
        toNumber(
          args.input.facts.adjustments.health_savings_account_deduction as
            | number
            | null
            | undefined,
        ),
      ),
      formula_ref: "facts.adjustments.health_savings_account_deduction",
      source_json_pointers: ["/facts/adjustments/health_savings_account_deduction"],
    });
  }

  if (args.activations.form8959Activated) {
    nodes.push(
      {
        node_id: "8959.line18.additional_medicare_tax",
        node_type: "line",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8959_MODULE_ID,
        form_code: "8959",
        line_code: "18",
        label: "Additional Medicare Tax",
        data_type: "money",
        value: args.computation.additionalMedicareTax,
        formula_ref:
          "0.9% of medicare wages and self-employment earnings above filing-status threshold",
      },
      {
        node_id: "8959.line24.additional_medicare_tax_withheld",
        node_type: "line",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8959_MODULE_ID,
        form_code: "8959",
        line_code: "24",
        label: "Additional Medicare Tax withholding credit",
        data_type: "money",
        value: args.computation.additionalMedicareTaxWithheld,
        formula_ref: "medicare tax withheld in excess of regular 1.45% employee withholding",
      },
    );
  }

  if (args.activations.form8960Activated) {
    nodes.push(
      ...(args.computation.scheduleEInvestmentIncomeTotal !== 0
        ? [
            {
              node_id: "8960.line4a.schedule_e_investment_income",
              node_type: "line" as const,
              jurisdiction: "federal",
              module_id: FEDERAL_FORM_8960_MODULE_ID,
              form_code: "8960",
              line_code: "4a",
              label: "Schedule E investment income or loss",
              data_type: "money" as const,
              value: args.computation.scheduleEInvestmentIncomeTotal,
              formula_ref:
                "net Schedule E activity amounts treated as investment income because the taxpayer did not materially participate",
            },
          ]
        : []),
      {
        node_id: "8960.line8.net_investment_income",
        node_type: "line",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8960_MODULE_ID,
        form_code: "8960",
        line_code: "8",
        label: "Net investment income",
        data_type: "money",
        value: args.computation.netInvestmentIncome,
        formula_ref:
          args.computation.scheduleEInvestmentIncomeTotal !== 0
            ? "taxable interest + ordinary dividends + Schedule E investment income + positive net capital gain amounts, including capital gain distributions"
            : "taxable interest + ordinary dividends + positive net capital gain amounts, including capital gain distributions",
      },
      {
        node_id: "8960.line17.net_investment_income_tax",
        node_type: "line",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8960_MODULE_ID,
        form_code: "8960",
        line_code: "17",
        label: "Net investment income tax",
        data_type: "money",
        value: args.computation.netInvestmentIncomeTax,
        formula_ref: "3.8% of the lesser of net investment income or MAGI excess over threshold",
      },
    );
  }

  if (args.activations.form8962Activated) {
    nodes.push(
      {
        node_id: "8962.summary.advance_ptc",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8962_MODULE_ID,
        form_code: "8962",
        line_code: "summary.advance_ptc",
        label: "Advance premium tax credit payments",
        data_type: "money",
        value: args.computation.form8962AdvancePremiumTaxCreditTotal,
        formula_ref: "sum(advance_payment_of_premium_tax_credit)",
      },
      {
        node_id: "8962.summary.net_premium_tax_credit",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8962_MODULE_ID,
        form_code: "8962",
        line_code: "summary.net_premium_tax_credit",
        label: "Net premium tax credit",
        data_type: "money",
        value: args.computation.netPremiumTaxCredit,
        formula_ref: "allowed premium tax credit less advance payments",
      },
      {
        node_id: "8962.summary.excess_advance_ptc_repayment",
        node_type: "summary",
        jurisdiction: "federal",
        module_id: FEDERAL_FORM_8962_MODULE_ID,
        form_code: "8962",
        line_code: "summary.excess_advance_ptc_repayment",
        label: "Excess advance premium tax credit repayment",
        data_type: "money",
        value: args.computation.excessAdvancePremiumTaxCreditRepayment,
        formula_ref:
          "advance payments in excess of allowed premium tax credit, limited when applicable",
      },
    );
  }

  return nodes;
}

export {
  buildOptionalFederalFormNodes,
  buildScheduleCNodes,
  buildScheduleDNodes,
  buildScheduleSENodes,
};
