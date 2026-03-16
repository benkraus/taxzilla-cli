import type { FormsGraphNode } from "../../../blueprint";
import type { CoreEngineInput } from "../../input";
import { getFederalForm8812Extension, toNumber } from "../../helpers";
import { FEDERAL_FORM_1040_CORE_MODULE_ID } from "./types";
import type { FederalComputation, FederalModuleActivationState } from "./types";
import { buildSourceDocumentPayloadPointersById } from "./income";
import { buildSchedule1AdjustmentSourcePointers } from "./graph-schedule";
import { DERIVED_ADJUSTMENT_KEYS, SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS } from "./constants";

function buildFederal1040Nodes(args: {
  readonly activations: FederalModuleActivationState;
  readonly computation: FederalComputation;
  readonly input: CoreEngineInput;
}): FormsGraphNode[] {
  return [
    {
      node_id: "1040.line1a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "1a",
      label: "Wages, salaries, tips",
      data_type: "money",
      value: args.computation.wageTotal,
      formula_ref: "sum(input.w2.*)",
    },
    {
      node_id: "1040.line2a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "2a",
      label: "Tax-exempt interest",
      data_type: "money",
      value: args.computation.line2aTaxExemptInterest,
      formula_ref: "sum(1099-INT tax-exempt interest) + sum(1099-DIV exempt-interest dividends)",
      source_json_pointers: [
        ...args.input.facts.income.taxable_interest.flatMap((interest, index) =>
          toNumber(interest.tax_exempt_interest) > 0
            ? [`/facts/income/taxable_interest/${index}/tax_exempt_interest`]
            : [],
        ),
        ...args.input.facts.income.dividends.flatMap((dividend, index) =>
          toNumber(dividend.exempt_interest_dividends) > 0
            ? [`/facts/income/dividends/${index}/exempt_interest_dividends`]
            : [],
        ),
      ],
    },
    {
      node_id: "1040.line2b",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "2b",
      label: "Taxable interest",
      data_type: "money",
      value: args.computation.taxableInterestTotal,
      formula_ref: args.activations.scheduleBActivated ? "schedb.line2" : "literal(0)",
    },
    {
      node_id: "1040.line3a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "3a",
      label: "Qualified dividends",
      data_type: "money",
      value: args.computation.qualifiedDividendsTotal,
      formula_ref: "sum(1099-DIV qualified dividends)",
      source_json_pointers: args.input.facts.income.dividends.flatMap((dividend, index) =>
        toNumber(dividend.qualified_dividends) > 0
          ? [`/facts/income/dividends/${index}/qualified_dividends`]
          : [],
      ),
    },
    {
      node_id: "1040.line3b",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "3b",
      label: "Ordinary dividends",
      data_type: "money",
      value: args.computation.ordinaryDividendsTotal,
      formula_ref: args.activations.scheduleBActivated ? "schedb.line4" : "literal(0)",
    },
    {
      node_id: "1040.line4a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "4a",
      label: "IRA distributions",
      data_type: "money",
      value: args.computation.line4aIraDistributions,
      formula_ref: "sum(1099-R IRA gross distributions)",
      source_json_pointers: args.input.facts.income.retirement_distributions.flatMap(
        (distribution, index) =>
          distribution.ira_sep_simple
            ? [
                `/facts/income/retirement_distributions/${index}/gross_distribution`,
                `/facts/income/retirement_distributions/${index}/taxable_amount`,
                ...buildSourceDocumentPayloadPointersById(
                  args.input.source_documents,
                  distribution.source_document_id,
                  ["gross_distribution", "taxable_amount", "taxable_amount_not_determined"],
                ),
              ]
            : [],
      ),
    },
    {
      node_id: "1040.line4b",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "4b",
      label: "Taxable IRA distributions",
      data_type: "money",
      value: args.computation.line4bTaxableIraDistributions,
      formula_ref:
        "sum(IRA taxable amounts, using reviewed 1099-R fallback when box 2a is unavailable)",
      source_json_pointers: args.input.facts.income.retirement_distributions.flatMap(
        (distribution, index) =>
          distribution.ira_sep_simple
            ? [
                `/facts/income/retirement_distributions/${index}/taxable_amount`,
                `/facts/income/retirement_distributions/${index}/gross_distribution`,
                ...buildSourceDocumentPayloadPointersById(
                  args.input.source_documents,
                  distribution.source_document_id,
                  [
                    "taxable_amount",
                    "gross_distribution",
                    "taxable_amount_not_determined",
                    "distribution_code_1",
                    "distribution_code_2",
                  ],
                ),
              ]
            : [],
      ),
    },
    {
      node_id: "1040.line5a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "5a",
      label: "Pensions and annuities",
      data_type: "money",
      value: args.computation.line5aPensionsAndAnnuities,
      formula_ref: "sum(1099-R non-IRA gross distributions)",
      source_json_pointers: args.input.facts.income.retirement_distributions.flatMap(
        (distribution, index) =>
          distribution.ira_sep_simple
            ? []
            : [
                `/facts/income/retirement_distributions/${index}/gross_distribution`,
                `/facts/income/retirement_distributions/${index}/taxable_amount`,
                ...buildSourceDocumentPayloadPointersById(
                  args.input.source_documents,
                  distribution.source_document_id,
                  ["gross_distribution", "taxable_amount", "taxable_amount_not_determined"],
                ),
              ],
      ),
    },
    {
      node_id: "1040.line5b",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "5b",
      label: "Taxable pensions and annuities",
      data_type: "money",
      value: args.computation.line5bTaxablePensionsAndAnnuities,
      formula_ref:
        "sum(non-IRA taxable amounts, using reviewed 1099-R fallback when box 2a is unavailable)",
      source_json_pointers: args.input.facts.income.retirement_distributions.flatMap(
        (distribution, index) =>
          distribution.ira_sep_simple
            ? []
            : [
                `/facts/income/retirement_distributions/${index}/taxable_amount`,
                `/facts/income/retirement_distributions/${index}/gross_distribution`,
                ...buildSourceDocumentPayloadPointersById(
                  args.input.source_documents,
                  distribution.source_document_id,
                  [
                    "taxable_amount",
                    "gross_distribution",
                    "taxable_amount_not_determined",
                    "distribution_code_1",
                    "distribution_code_2",
                  ],
                ),
              ],
      ),
    },
    {
      node_id: "1040.line7",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "7",
      label: "Capital gain or loss",
      data_type: "money",
      value: args.computation.capitalGainOrLossTotal,
      formula_ref: args.activations.scheduleDActivated
        ? args.computation.scheduleDNetCapitalGainOrLossTotal < 0
          ? "schd.line21"
          : "schd.line16"
        : args.computation.capitalGainDistributionsTotal > 0
          ? "sum(1099-DIV capital gain distributions)"
          : "literal(0)",
      source_json_pointers: args.activations.scheduleDActivated
        ? undefined
        : args.input.facts.income.dividends.flatMap((dividend, index) =>
            toNumber(dividend.capital_gain_distributions) > 0
              ? [`/facts/income/dividends/${index}/capital_gain_distributions`]
              : [],
          ),
    },
    {
      node_id: "1040.line8",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "8",
      label: "Other income from Schedule 1",
      data_type: "money",
      value: args.computation.schedule1AdditionalIncomeTotal,
      formula_ref: args.activations.schedule1Activated ? "sch1.line10" : "literal(0)",
    },
    {
      node_id: "1040.line10",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "10",
      label: "Adjustments to income",
      data_type: "money",
      value: args.computation.totalAdjustments,
      formula_ref: args.activations.schedule1Activated ? "sch1.line26" : "literal(0)",
    },
    {
      node_id: "1040.line6a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "6a",
      label: "Social Security benefits",
      data_type: "money",
      value: args.computation.line6aSocialSecurityBenefits,
      formula_ref: "sum(SSA-1099 net benefits for 2025)",
      source_json_pointers: args.input.facts.income.social_security_benefits.flatMap(
        (benefit, index) => [
          `/facts/income/social_security_benefits/${index}/net_benefits`,
          `/facts/income/social_security_benefits/${index}/benefits_paid`,
          `/facts/income/social_security_benefits/${index}/benefits_repaid`,
          ...buildSourceDocumentPayloadPointersById(
            args.input.source_documents,
            benefit.source_document_id,
            ["net_benefits_for_2025", "benefits_paid_in_2025", "benefits_repaid_in_2025"],
          ),
        ],
      ),
    },
    {
      node_id: "1040.line6b",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "6b",
      label: "Taxable Social Security benefits",
      data_type: "money",
      value: args.computation.line6bTaxableSocialSecurityBenefits,
      formula_ref:
        "social_security_benefits_worksheet(line1a, line2a, line2b, line3b, line4b, line5b, line7, line8, line10, line6a, filing_status)",
      source_json_pointers: [
        ...args.input.facts.income.social_security_benefits.flatMap((benefit, index) => [
          `/facts/income/social_security_benefits/${index}/net_benefits`,
          `/facts/income/social_security_benefits/${index}/benefits_paid`,
          `/facts/income/social_security_benefits/${index}/benefits_repaid`,
          ...buildSourceDocumentPayloadPointersById(
            args.input.source_documents,
            benefit.source_document_id,
            ["net_benefits_for_2025", "benefits_paid_in_2025", "benefits_repaid_in_2025"],
          ),
        ]),
        ...buildSchedule1AdjustmentSourcePointers(args.input.facts.adjustments, {
          excludedKeys: DERIVED_ADJUSTMENT_KEYS,
          includedKeys: SOCIAL_SECURITY_WORKSHEET_ADJUSTMENT_KEYS,
        }),
      ],
    },
    {
      node_id: "1040.line9",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "9",
      label: "Total income",
      data_type: "money",
      value: args.computation.totalIncome,
      formula_ref:
        "1040.line1a + 1040.line2b + 1040.line3b + 1040.line4b + 1040.line5b + 1040.line6b + 1040.line7 + 1040.line8",
    },
    {
      node_id: "1040.line11",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "11",
      label: "Adjusted gross income",
      data_type: "money",
      value: args.computation.adjustedGrossIncome,
      formula_ref: "1040.line9 - 1040.line10",
    },
    {
      node_id: "1040.line12",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "12",
      label: "Deduction amount",
      data_type: "money",
      value: args.computation.line12Deductions,
      formula_ref: args.activations.scheduleAActivated
        ? "max(standard_deduction, scha.line17)"
        : "standard_deduction",
    },
    {
      node_id: "1040.line15",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "15",
      label: "Taxable income",
      data_type: "money",
      value: args.computation.line15TaxableIncome,
      formula_ref: "max(1040.line11 - 1040.line12, 0)",
    },
    {
      node_id: "1040.line16",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "16",
      label: "Regular income tax",
      data_type: "money",
      value: args.computation.line16RegularIncomeTax,
      formula_ref:
        args.computation.line16TaxComputationMethod === "schedule_d_tax_worksheet"
          ? "schedule_d_tax_worksheet(line15, line3a, schd.line15, schd.line16, schd.line18, schd.line19, filing_status)"
          : args.computation.line16TaxComputationMethod ===
              "qualified_dividends_and_capital_gain_worksheet"
            ? "qualified_dividends_and_capital_gain_tax_worksheet(line15, line3a, line7, filing_status)"
            : "federal_tax_brackets(line15, filing_status)",
    },
    {
      node_id: "1040.line19",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "19",
      label: "Child tax credit or credit for other dependents",
      data_type: "money",
      value: args.computation.line19ChildTaxCreditOrCreditForOtherDependents,
      formula_ref: args.activations.form8812Activated
        ? "8812.summary.nonrefundable_credit"
        : "literal(0)",
    },
    {
      node_id: "1040.line20",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "20",
      label: "Other nonrefundable credits",
      data_type: "money",
      value: args.computation.line20OtherNonrefundableCredits,
      formula_ref: args.activations.schedule3Activated
        ? "sch3.part1.total_nonrefundable_credits"
        : "literal(0)",
    },
    {
      node_id: "1040.line23",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "23",
      label: "Other taxes",
      data_type: "money",
      value: args.computation.line23OtherTaxes,
      formula_ref: args.activations.schedule2Activated ? "sch2.summary.other_taxes" : "literal(0)",
    },
    {
      node_id: "1040.line24",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "24",
      label: "Total tax",
      data_type: "money",
      value: args.computation.line24TotalTax,
      formula_ref: "max(1040.line16 - 1040.line19 - 1040.line20, 0) + 1040.line23",
    },
    {
      node_id: "1040.line25d",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "25d",
      label: "Federal income tax withheld",
      data_type: "money",
      value: args.computation.federalWithholding,
      formula_ref: args.computation.usesDocumentedFederalWithholdingFallback
        ? args.activations.form8959Activated
          ? "sum(document federal withholding fields) + 8959.line24"
          : "sum(document federal withholding fields)"
        : args.activations.form8959Activated
          ? "sum(facts.payments.withholdings where jurisdiction=federal) + 8959.line24"
          : "sum(facts.payments.withholdings where jurisdiction=federal)",
      source_json_pointers: args.computation.usesDocumentedFederalWithholdingFallback
        ? [
            ...args.input.facts.income.wages.flatMap((wage, index) =>
              toNumber(wage.federal_income_tax_withheld) > 0
                ? [`/facts/income/wages/${index}/federal_income_tax_withheld`]
                : [],
            ),
            ...args.input.facts.income.taxable_interest.flatMap((interest, index) =>
              toNumber(interest.federal_income_tax_withheld) > 0
                ? [`/facts/income/taxable_interest/${index}/federal_income_tax_withheld`]
                : [],
            ),
            ...args.input.facts.income.dividends.flatMap((dividend, index) =>
              toNumber(dividend.federal_income_tax_withheld) > 0
                ? [`/facts/income/dividends/${index}/federal_income_tax_withheld`]
                : [],
            ),
            ...args.input.facts.income.retirement_distributions.flatMap((distribution, index) =>
              toNumber(distribution.federal_income_tax_withheld) > 0
                ? [`/facts/income/retirement_distributions/${index}/federal_income_tax_withheld`]
                : [],
            ),
            ...args.input.facts.income.unemployment_compensation.flatMap((unemployment, index) =>
              toNumber(unemployment.federal_income_tax_withheld) > 0
                ? [`/facts/income/unemployment_compensation/${index}/federal_income_tax_withheld`]
                : [],
            ),
            ...args.input.facts.income.nonemployee_compensation.flatMap(
              (nonemployeeCompensation, index) =>
                toNumber(nonemployeeCompensation.federal_income_tax_withheld) > 0
                  ? [`/facts/income/nonemployee_compensation/${index}/federal_income_tax_withheld`]
                  : [],
            ),
            ...args.input.facts.income.miscellaneous_1099_income.flatMap(
              (miscellaneousIncome, index) =>
                toNumber(miscellaneousIncome.federal_income_tax_withheld) > 0
                  ? [
                      `/facts/income/miscellaneous_1099_income/${index}/federal_income_tax_withheld`,
                    ]
                  : [],
            ),
          ]
        : args.input.facts.payments.withholdings.flatMap((withholding, index) =>
            withholding.jurisdiction === "federal"
              ? [`/facts/payments/withholdings/${index}/amount`]
              : [],
          ),
    },
    {
      node_id: "1040.line26",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "26",
      label: "Estimated tax and extension payments",
      data_type: "money",
      value: args.computation.line26EstimatedAndExtensionPayments,
      formula_ref:
        "federal estimated payments + extension payments + prior-year overpayment applied",
    },
    {
      node_id: "1040.line27a",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "27a",
      label: "Earned income credit",
      data_type: "money",
      value: args.computation.line27aEarnedIncomeCredit,
      formula_ref:
        args.computation.line27aEarnedIncomeCredit > 0
          ? "earned_income_credit(candidate_eitc_child_ids, earned_income, adjusted_gross_income, investment_income, filing_status)"
          : "literal(0)",
      source_json_pointers:
        args.computation.line27aEarnedIncomeCredit > 0 ||
        getFederalForm8812Extension(args.input)?.line27a_eic_override != null
          ? [
              "/facts/credits/candidate_eitc_child_ids",
              "/facts/state_specific_fact_bag/federal/form8812/line27a_eic_override",
            ]
          : undefined,
    },
    {
      node_id: "1040.line28",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "28",
      label: "Additional child tax credit",
      data_type: "money",
      value: args.computation.line28AdditionalChildTaxCredit,
      formula_ref: args.activations.form8812Activated
        ? "8812.summary.additional_child_tax_credit"
        : "literal(0)",
    },
    {
      node_id: "1040.line29",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "29",
      label: "Refundable education credit",
      data_type: "money",
      value: args.computation.line29RefundableEducationCredit,
      formula_ref: args.activations.form8863Activated
        ? "8863.summary.refundable_credit"
        : "literal(0)",
    },
    {
      node_id: "1040.line31",
      node_type: "line",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "31",
      label: "Other payments and refundable credits",
      data_type: "money",
      value: args.computation.line31OtherPayments,
      formula_ref:
        args.activations.schedule3Activated || args.activations.form8962Activated
          ? "other refundable credits + 8962.summary.net_premium_tax_credit"
          : "literal(0)",
    },
    {
      node_id: "1040.line33",
      node_type: "calculation",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "33",
      label: "Total payments",
      data_type: "money",
      value: args.computation.line33TotalPayments,
      formula_ref: "1040.line25d + 1040.line26 + 1040.line27a + 1040.line28 + 1040.line29 + 1040.line31",
    },
    {
      node_id: "1040.line34",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "34",
      label: "Refund amount",
      data_type: "money",
      value: args.computation.line34RefundAmount,
      formula_ref: "max(1040.line33 - 1040.line24, 0)",
    },
    {
      node_id: "1040.line37",
      node_type: "summary",
      jurisdiction: "federal",
      module_id: FEDERAL_FORM_1040_CORE_MODULE_ID,
      form_code: "1040",
      line_code: "37",
      label: "Amount owed",
      data_type: "money",
      value: args.computation.line37AmountOwed,
      formula_ref: "max(1040.line24 - 1040.line33, 0)",
    },
  ];
}

export { buildFederal1040Nodes };
