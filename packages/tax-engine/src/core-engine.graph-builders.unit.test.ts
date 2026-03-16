import { describe, expect, it } from "vitest";

import { buildFederal1040Nodes } from "./core-engine/graph-1040";
import { buildFederalEdges } from "./core-engine/graph-edges";
import { buildOptionalFederalFormNodes, buildScheduleDNodes } from "./core-engine/graph-federal-forms";
import { buildCapitalTransactionInputNodes, buildScheduleENodes } from "./core-engine/graph-inputs";
import {
  buildSchedule1AdjustmentSourcePointers,
  buildSchedule1Nodes,
  getSchedule1OtherAdjustments,
} from "./core-engine/graph-schedule";

describe("core-engine graph builders", () => {
  it("filters and points schedule 1 other adjustments", () => {
    const adjustments = {
      educator_expenses: 250,
      student_loan_interest: 0,
      other_adjustments: [
        {
          description: "Attorney fees",
          amount: 150,
        },
        {
          description: "Ignored",
          amount: "bad",
        },
        {
          amount: 50,
        },
      ],
      nested_array: [],
    };

    expect(getSchedule1OtherAdjustments(adjustments as any)).toEqual([
      {
        description: "Attorney fees",
        amount: 150,
      },
    ]);
    expect(getSchedule1OtherAdjustments({ other_adjustments: null } as any)).toEqual([]);
    expect(buildSchedule1AdjustmentSourcePointers(adjustments as any)).toEqual([
      "/facts/adjustments/educator_expenses",
      "/facts/adjustments/other_adjustments",
    ]);
    expect(
      buildSchedule1Nodes({
        computation: {
          otherIncomeDirectTotal: 50,
          schedule1AdditionalIncomeTotal: 50,
          line8bGamblingIncomeTotal: 0,
          line8jNonbusinessActivityIncomeTotal: 0,
          line8zOtherIncomeTotal: 50,
          scheduleCBusinessNetProfit: 0,
          scheduleEActivityNetTotal: 0,
          unemploymentCompensationTotal: 0,
          totalAdjustments: 10,
        } as any,
        input: {
          source_documents: [],
          facts: {
            adjustments: {
              other_adjustments: [{ description: "Attorney fees", amount: 10 }],
            },
            income: {
              nonemployee_compensation: [],
              miscellaneous_1099_income: [{ amount: 50 }],
              other_income_items: [],
              schedule_e_activities: [],
              unemployment_compensation: [],
            },
          },
        } as any,
      }).find((node) => node.node_id === "sch1.line9")?.formula_ref,
    ).toBe("sch1.line8z");
    expect(
      buildSchedule1Nodes({
        computation: {
          otherIncomeDirectTotal: 35,
          schedule1AdditionalIncomeTotal: 35,
          line8bGamblingIncomeTotal: 20,
          line8jNonbusinessActivityIncomeTotal: 15,
          line8zOtherIncomeTotal: 0,
          scheduleCBusinessNetProfit: 0,
          scheduleEActivityNetTotal: 0,
          unemploymentCompensationTotal: 0,
          totalAdjustments: 0,
        } as any,
        input: {
          source_documents: [],
          facts: {
            adjustments: {},
            income: {
              nonemployee_compensation: [{ amount: 15 }],
              miscellaneous_1099_income: [{ amount: 20, income_category: "wagering" }],
              other_income_items: [],
              schedule_e_activities: [],
              unemployment_compensation: [],
            },
          },
        } as any,
      }).find((node) => node.node_id === "sch1.line9")?.formula_ref,
    ).toBe("sch1.line8b + sch1.line8j");
  });

  it("builds derived capital transaction inputs and schedule E nodes without part 1 totals", () => {
    expect(
      buildCapitalTransactionInputNodes([
        {
          proceeds: 100,
          cost_basis: 40,
          adjustments: -10,
          date_acquired: "2024-01-01",
          date_sold: "2025-02-01",
        },
      ] as any),
    ).toEqual([
      expect.objectContaining({
        node_id: "input.8949.0.gain_or_loss",
        value: 50,
      }),
    ]);

    const scheduleENodes = buildScheduleENodes({
      input: {
        source_documents: [],
        facts: {
          state_specific_fact_bag: {
            federal: {},
          },
          income: {
            schedule_e_activities: [
              {
                activity_type: "partnership_k1",
                owner_person_id: "p_taxpayer",
                entity_name: "K-1 Activity",
                income_items: [{ description: "income", amount: 100 }],
                expense_items: [{ description: "expense", amount: 60 }],
              },
              {
                activity_type: "other",
                owner_person_id: "p_taxpayer",
                entity_name: "Other Activity",
                income_items: [{ description: "income", amount: 25 }],
                expense_items: [],
              },
            ],
            miscellaneous_1099_income: [],
          },
        },
      } as any,
      computation: {
        scheduleEPart1NetTotal: 0,
        scheduleEPart2NetTotal: 40,
        scheduleEActivityNetTotal: 65,
      } as any,
    });

    expect(scheduleENodes.map((node) => node.node_id)).toContain("sche.part2.total");
    expect(scheduleENodes.map((node) => node.node_id)).not.toContain("sche.part1.total");
    expect(scheduleENodes.find((node) => node.node_id === "sche.summary.total")?.formula_ref).toBe(
      "sche.part2.total + sche.activity.1.net",
    );
  });

  it("builds schedule D nodes and optional federal form nodes for carryforwards and ACTC formulas", () => {
    expect(
      buildScheduleDNodes({
        input: {
          source_documents: [],
          facts: {
            state_specific_fact_bag: {
              federal: {},
            },
            income: {
              capital_transactions: [],
              dividends: [],
            },
          },
        } as any,
        computation: {
          capitalGainDistributionsTotal: 0,
          scheduleDPriorYearShortTermCapitalLossCarryforward: 0,
          scheduleDPriorYearLongTermCapitalLossCarryforward: 0,
          scheduleDCollectibles28PercentGainTotal: 0,
          scheduleDUnrecapturedSection1250GainTotal: 0,
          taxableSection1202GainTotal: 0,
        } as any,
      }),
    ).toEqual([]);

    const scheduleDNodes = buildScheduleDNodes({
      input: {
        source_documents: [
          {
            document_type: "FORM_1099_DIV",
            payload: {
              section_1202_gain: 100,
              unrecaptured_section_1250_gain: 50,
            },
          },
        ],
        facts: {
          state_specific_fact_bag: {
            federal: {
              schedule_d: {
                transaction_term_overrides: [
                  {
                    source_document_id: "doc_txn",
                    proceeds: 100,
                    term: "long",
                  },
                ],
              },
            },
          },
          income: {
            capital_transactions: [
              {
                source_document_id: "doc_txn",
                proceeds: 100,
                date_sold: "2025-01-01",
              },
            ],
            dividends: [
              {
                capital_gain_distributions: 25,
              },
            ],
          },
        },
      } as any,
      computation: {
        capitalTransactionsNetTotal: 80,
        capitalGainDistributionsTotal: 25,
        taxableSection1202GainTotal: 60,
        scheduleDPriorYearShortTermCapitalLossCarryforward: 10,
        scheduleDPriorYearLongTermCapitalLossCarryforward: 20,
        scheduleDShortTermCapitalGainOrLossTotal: 10,
        scheduleDLongTermCapitalGainOrLossTotal: 120,
        scheduleDCollectibles28PercentGainTotal: 0,
        scheduleDUnrecapturedSection1250GainTotal: 50,
        scheduleDNetCapitalGainOrLossTotal: 130,
        section1202ExclusionAmount: 40,
      } as any,
    });

    expect(
      scheduleDNodes.find((node) => node.node_id === "schd.line15")?.source_json_pointers,
    ).toContain("/facts/state_specific_fact_bag/federal/schedule_d/prior_year_long_term_capital_loss_carryforward");
    expect(
      scheduleDNodes.find((node) => node.node_id === "schd.line15")?.source_json_pointers,
    ).toContain("/facts/state_specific_fact_bag/federal/schedule_d/transaction_term_overrides");
    expect(
      scheduleDNodes.find((node) => node.node_id === "schd.line19")?.source_json_pointers,
    ).toContain("/facts/state_specific_fact_bag/federal/schedule_d/section1202_exclusion_amount");

    expect(
      buildOptionalFederalFormNodes({
        activations: {
          form2441Activated: false,
          form8812Activated: true,
          form8863Activated: false,
          form8889Activated: false,
          form8959Activated: false,
          form8960Activated: false,
          form8962Activated: false,
          scheduleSEActivated: false,
        } as any,
        computation: {
          form8812QualifyingChildrenCount: 3,
          form8812OtherDependentsCount: 0,
          line19ChildTaxCreditOrCreditForOtherDependents: 500,
          form8812AdditionalChildTaxCredit: 1500,
          form8812AlternativeActcMethodUsed: true,
          form8812AlternativeActcMethodConsidered: true,
        } as any,
        input: {
          facts: {
            income: {},
          },
        } as any,
      }).find((node) => node.node_id === "8812.summary.additional_child_tax_credit")?.formula_ref,
    ).toContain("credit_limit_worksheet_b_method");
  });

  it("builds 1040 fallback pointers and schedule E edges for unclassified activities", () => {
    const input = {
      source_documents: [],
      facts: {
        adjustments: {},
        state_specific_fact_bag: {
          federal: {
            form8812: {
              line27a_eic_override: 77,
            },
          },
        },
        payments: {
          withholdings: [],
        },
        income: {
          taxable_interest: [
            {
              tax_exempt_interest: 10,
              federal_income_tax_withheld: 4,
            },
            {
              tax_exempt_interest: 0,
              federal_income_tax_withheld: 0,
            },
          ],
          dividends: [
            {
              exempt_interest_dividends: 5,
              capital_gain_distributions: 15,
              federal_income_tax_withheld: 3,
            },
            {
              exempt_interest_dividends: 0,
              capital_gain_distributions: 0,
              federal_income_tax_withheld: 0,
            },
          ],
          retirement_distributions: [
            {
              federal_income_tax_withheld: 2,
            },
            {
              federal_income_tax_withheld: 0,
            },
          ],
          social_security_benefits: [],
          unemployment_compensation: [
            {
              federal_income_tax_withheld: 6,
            },
            {
              federal_income_tax_withheld: 0,
            },
          ],
          nonemployee_compensation: [
            {
              federal_income_tax_withheld: 8,
            },
            {
              federal_income_tax_withheld: 0,
            },
          ],
          miscellaneous_1099_income: [
            {
              federal_income_tax_withheld: 12,
            },
            {
              federal_income_tax_withheld: 0,
            },
          ],
          wages: [
            {
              federal_income_tax_withheld: 9,
            },
            {
              federal_income_tax_withheld: 0,
            },
          ],
          schedule_e_activities: [
            {
              activity_type: "other",
              owner_person_id: "p_taxpayer",
              entity_name: "Other Activity",
              income_items: [{ description: "income", amount: 20 }],
              expense_items: [],
            },
          ],
        },
      },
    };

    const federal1040Nodes = buildFederal1040Nodes({
      activations: {
        scheduleBActivated: false,
        scheduleDActivated: false,
        form8959Activated: true,
      } as any,
      computation: {
        line2aTaxExemptInterest: 15,
        taxableInterestTotal: 0,
        qualifiedDividendsTotal: 0,
        ordinaryDividendsTotal: 0,
        line4aIraDistributions: 0,
        line4bTaxableIraDistributions: 0,
        line5aPensionsAndAnnuities: 0,
        line5bTaxablePensionsAndAnnuities: 0,
        line6aSocialSecurityBenefits: 0,
        line6bTaxableSocialSecurityBenefits: 0,
        capitalGainOrLossTotal: 15,
        schedule1AdditionalIncomeTotal: 0,
        totalIncome: 15,
        totalAdjustments: 0,
        adjustedGrossIncome: 15,
        deductionAmount: 0,
        taxableIncome: 15,
        line16RegularIncomeTax: 0,
        line19ChildTaxCreditOrCreditForOtherDependents: 0,
        line20OtherNonrefundableCredits: 0,
        line23OtherTaxes: 0,
        line24TotalTax: 0,
        federalWithholding: 12,
        usesDocumentedFederalWithholdingFallback: true,
        line26EstimatedAndExtensionPayments: 0,
        line27aEarnedIncomeCredit: 0,
        line28AdditionalChildTaxCredit: 0,
        line29RefundableEducationCredit: 0,
        line31OtherPayments: 0,
        line33TotalPayments: 12,
        line34RefundAmount: 12,
        line37AmountOwed: 0,
        capitalGainDistributionsTotal: 15,
      } as any,
      input: input as any,
    });

    expect(
      federal1040Nodes.find((node) => node.node_id === "1040.line2a")?.source_json_pointers,
    ).toContain("/facts/income/dividends/0/exempt_interest_dividends");
    expect(federal1040Nodes.find((node) => node.node_id === "1040.line7")?.formula_ref).toBe(
      "sum(1099-DIV capital gain distributions)",
    );
    expect(
      federal1040Nodes.find((node) => node.node_id === "1040.line25d")?.source_json_pointers,
    ).toContain("/facts/income/miscellaneous_1099_income/0/federal_income_tax_withheld");
    expect(
      federal1040Nodes.find((node) => node.node_id === "1040.line27a")?.source_json_pointers,
    ).toContain("/facts/state_specific_fact_bag/federal/form8812/line27a_eic_override");
    expect(federal1040Nodes.find((node) => node.node_id === "1040.line25d")?.formula_ref).toBe(
      "sum(document federal withholding fields) + 8959.line24",
    );

    const edges = buildFederalEdges({
      activations: {
        scheduleEActivated: true,
      } as any,
      capitalTransactionInputNodes: [],
      computation: {
        scheduleEActivityNetTotal: 20,
        line8bGamblingIncomeTotal: 0,
        line8jNonbusinessActivityIncomeTotal: 0,
        line8zOtherIncomeTotal: 0,
        scheduleCBusinessNetProfit: 0,
        unemploymentCompensationTotal: 0,
        usesPreferentialRateTaxComputation: false,
      } as any,
      dividendInputNodes: [],
      input: input as any,
      interestInputNodes: [],
      otherIncomeInputNodes: [],
      scheduleEActivities: input.facts.income.schedule_e_activities as any,
      wageInputNodes: [],
    });

    expect(edges).toContainEqual({
      from_node_id: "sche.activity.0.net",
      to_node_id: "sche.summary.total",
      edge_type: "dependency",
    });
    expect(edges).not.toContainEqual({
      from_node_id: "sche.part1.total",
      to_node_id: "sche.summary.total",
      edge_type: "dependency",
    });
  });
});
