import type { FormsGraphEdge, FormsGraphNode } from "../../../blueprint";
import type { CoreEngineInput, CoreEngineScheduleEActivity } from "../../input";
import { SCHEDULE_E_PART_1_ACTIVITY_TYPES, SCHEDULE_E_PART_2_ACTIVITY_TYPES } from "./constants";
import { buildScheduleERollup } from "../../helpers";
import { buildMisc1099IncomeRollup } from "./income";
import { buildSchedule1AdjustmentLineItems, getSchedule1OtherAdjustments } from "./graph-schedule";
import { buildScheduleEActivityNodeId } from "./references";
import type { FederalComputation, FederalModuleActivationState } from "./types";

function buildFederalEdges(args: {
  readonly activations: FederalModuleActivationState;
  readonly capitalTransactionInputNodes: ReadonlyArray<FormsGraphNode>;
  readonly computation: FederalComputation;
  readonly dividendInputNodes: ReadonlyArray<FormsGraphNode>;
  readonly input: CoreEngineInput;
  readonly interestInputNodes: ReadonlyArray<FormsGraphNode>;
  readonly otherIncomeInputNodes: ReadonlyArray<FormsGraphNode>;
  readonly scheduleEActivities: ReadonlyArray<CoreEngineScheduleEActivity>;
  readonly wageInputNodes: ReadonlyArray<FormsGraphNode>;
}): FormsGraphEdge[] {
  const edges: FormsGraphEdge[] = args.wageInputNodes.map((node) => ({
    from_node_id: node.node_id,
    to_node_id: "1040.line1a",
    edge_type: "dependency" as const,
  }));

  if (args.activations.scheduleBActivated) {
    edges.push(
      ...args.interestInputNodes.map((node) => ({
        from_node_id: node.node_id,
        to_node_id: "schedb.line2",
        edge_type: "dependency" as const,
      })),
      ...args.dividendInputNodes.map((node) => ({
        from_node_id: node.node_id,
        to_node_id: "schedb.line4",
        edge_type: "dependency" as const,
      })),
      {
        from_node_id: "schedb.line2",
        to_node_id: "1040.line2b",
        edge_type: "dependency",
      },
      {
        from_node_id: "schedb.line4",
        to_node_id: "1040.line3b",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8949Activated) {
    edges.push(
      ...args.capitalTransactionInputNodes.map((node) => ({
        from_node_id: node.node_id,
        to_node_id: "8949.total.net_gain_or_loss",
        edge_type: "dependency" as const,
      })),
      {
        from_node_id: "8949.total.net_gain_or_loss",
        to_node_id: "schd.line7",
        edge_type: "dependency",
      },
      {
        from_node_id: "8949.total.net_gain_or_loss",
        to_node_id: "schd.line15",
        edge_type: "dependency",
      },
      {
        from_node_id: "8949.total.net_gain_or_loss",
        to_node_id: "schd.line16",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.scheduleDActivated) {
    edges.push(
      {
        from_node_id: "schd.line7",
        to_node_id: "schd.line16",
        edge_type: "dependency",
      },
      {
        from_node_id: "schd.line15",
        to_node_id: "schd.line16",
        edge_type: "dependency",
      },
      {
        from_node_id:
          args.computation.scheduleDNetCapitalGainOrLossTotal < 0 ? "schd.line21" : "schd.line16",
        to_node_id: "1040.line7",
        edge_type: "dependency",
      },
    );

    if (args.computation.capitalGainDistributionsTotal > 0) {
      edges.push({
        from_node_id: "schd.line13",
        to_node_id: "schd.line15",
        edge_type: "dependency",
      });
    }

    if (args.computation.scheduleDCollectibles28PercentGainTotal > 0) {
      edges.push({
        from_node_id: "schd.line18",
        to_node_id: "1040.line16",
        edge_type: "dependency",
      });
    }

    if (args.computation.scheduleDUnrecapturedSection1250GainTotal > 0) {
      edges.push({
        from_node_id: "schd.line19",
        to_node_id: "1040.line16",
        edge_type: "dependency",
      });
    }

    if (args.computation.scheduleDNetCapitalGainOrLossTotal < 0) {
      edges.push({
        from_node_id: "schd.line16",
        to_node_id: "schd.line21",
        edge_type: "dependency",
      });
    }
  }

  if (args.activations.scheduleCActivated) {
    if (args.computation.scheduleCBusinessNetProfit !== 0) {
      edges.push({
        from_node_id: "schc.line31.net_profit",
        to_node_id: "sch1.line3",
        edge_type: "dependency",
      });
    }
  }

  if (args.activations.scheduleEActivated) {
    const misc1099IncomeRollup = buildMisc1099IncomeRollup(args.input);
    const scheduleERollup = buildScheduleERollup(args.scheduleEActivities, {
      additionalIncomeByActivityIndex: misc1099IncomeRollup.scheduleEIncomeByActivityIndex,
    });
    const hasPart1Activities = scheduleERollup.activityNets.some((activity) =>
      SCHEDULE_E_PART_1_ACTIVITY_TYPES.has(activity.activityType),
    );
    const hasPart2Activities = scheduleERollup.activityNets.some((activity) =>
      SCHEDULE_E_PART_2_ACTIVITY_TYPES.has(activity.activityType),
    );

    edges.push(
      ...scheduleERollup.activityNets.map((activity) => {
        const inPart1 = SCHEDULE_E_PART_1_ACTIVITY_TYPES.has(activity.activityType);
        const inPart2 = SCHEDULE_E_PART_2_ACTIVITY_TYPES.has(activity.activityType);

        return {
          from_node_id: buildScheduleEActivityNodeId(activity.index),
          to_node_id: inPart1
            ? "sche.part1.total"
            : inPart2
              ? "sche.part2.total"
              : "sche.summary.total",
          edge_type: "dependency" as const,
        };
      }),
      ...(hasPart1Activities
        ? [
            {
              from_node_id: "sche.part1.total",
              to_node_id: "sche.summary.total",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(hasPart2Activities
        ? [
            {
              from_node_id: "sche.part2.total",
              to_node_id: "sche.summary.total",
              edge_type: "dependency" as const,
            },
          ]
        : []),
    );
  }

  if (args.activations.scheduleSEActivated) {
    edges.push(
      {
        from_node_id: "schc.line31.net_profit",
        to_node_id: "schse.line4a",
        edge_type: "dependency",
      },
      {
        from_node_id: "schse.line4a",
        to_node_id: "schse.line12",
        edge_type: "dependency",
      },
      {
        from_node_id: "schse.line12",
        to_node_id: "schse.summary.deduction",
        edge_type: "derivation",
      },
      {
        from_node_id: "schse.line12",
        to_node_id: "sch2.summary.other_taxes",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.schedule1Activated) {
    const hasLine8OtherIncome =
      args.computation.line8bGamblingIncomeTotal > 0 ||
      args.computation.line8jNonbusinessActivityIncomeTotal > 0 ||
      args.computation.line8zOtherIncomeTotal > 0;
    const directAdjustmentLineItems = buildSchedule1AdjustmentLineItems({
      computation: args.computation,
      input: args.input,
    });
    const otherAdjustmentItems = getSchedule1OtherAdjustments(args.input.facts.adjustments);
    const otherAdjustmentNodeIds = otherAdjustmentItems.map((_item, index) => `sch1.line24z.${index}`);
    const adjustmentDependencyNodeIds = [
      ...directAdjustmentLineItems.map((item) => item.nodeId),
      ...otherAdjustmentNodeIds,
      otherAdjustmentItems.length > 0 ? "sch1.line25" : null,
    ].filter((nodeId): nodeId is string => nodeId !== null);

    edges.push(
      ...args.otherIncomeInputNodes.map((node) => ({
        from_node_id: node.node_id,
        to_node_id: "sch1.line8z",
        edge_type: "dependency" as const,
      })),
      ...(args.computation.scheduleCBusinessNetProfit !== 0
        ? [
            {
              from_node_id: "sch1.line3",
              to_node_id: "sch1.line10",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(args.computation.scheduleEActivityNetTotal !== 0
        ? [
            {
              from_node_id: "sche.summary.total",
              to_node_id: "sch1.line5",
              edge_type: "dependency" as const,
            },
            {
              from_node_id: "sch1.line5",
              to_node_id: "sch1.line10",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(args.computation.unemploymentCompensationTotal > 0
        ? [
            {
              from_node_id: "sch1.line7",
              to_node_id: "sch1.line10",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(args.computation.line8bGamblingIncomeTotal > 0
        ? [
            {
              from_node_id: "sch1.line8b",
              to_node_id: "sch1.line9",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(args.computation.line8jNonbusinessActivityIncomeTotal > 0
        ? [
            {
              from_node_id: "sch1.line8j",
              to_node_id: "sch1.line9",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(args.computation.line8zOtherIncomeTotal > 0
        ? [
            {
              from_node_id: "sch1.line8z",
              to_node_id: "sch1.line9",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...(hasLine8OtherIncome
        ? [
            {
              from_node_id: "sch1.line9",
              to_node_id: "sch1.line10",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...otherAdjustmentNodeIds.map((nodeId) => ({
        from_node_id: nodeId,
        to_node_id: "sch1.line25",
        edge_type: "dependency" as const,
      })),
      ...(otherAdjustmentItems.length > 0
        ? [
            {
              from_node_id: "sch1.line25",
              to_node_id: "sch1.line26",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      ...adjustmentDependencyNodeIds
        .filter((nodeId) => nodeId !== "sch1.line25")
        .map((nodeId) => ({
          from_node_id: nodeId,
          to_node_id: "sch1.line26",
          edge_type: "dependency" as const,
        })),
      {
        from_node_id: "sch1.line10",
        to_node_id: "1040.line8",
        edge_type: "dependency",
      },
      {
        from_node_id: "sch1.line26",
        to_node_id: "1040.line10",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8889Activated && args.activations.schedule1Activated) {
    edges.push({
      from_node_id: "8889.summary.hsa_deduction",
      to_node_id: "sch1.line13",
      edge_type: "dependency",
    });
  }

  if (args.activations.scheduleSEActivated && args.activations.schedule1Activated) {
    edges.push({
      from_node_id: "schse.summary.deduction",
      to_node_id: "sch1.line15",
      edge_type: "dependency",
    });
  }

  if (args.activations.form2441Activated && args.activations.schedule3Activated) {
    edges.push({
      from_node_id: "2441.summary.allowed_credit",
      to_node_id: "sch3.part1.total_nonrefundable_credits",
      edge_type: "dependency",
    });
  }

  if (args.activations.form8812Activated) {
    edges.push(
      {
        from_node_id: "1040.line27a",
        to_node_id: "8812.summary.additional_child_tax_credit",
        edge_type: "dependency",
      },
      {
        from_node_id: "8812.summary.nonrefundable_credit",
        to_node_id: "1040.line19",
        edge_type: "dependency",
      },
      {
        from_node_id: "8812.summary.additional_child_tax_credit",
        to_node_id: "1040.line28",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8863Activated) {
    edges.push(
      {
        from_node_id: "8863.summary.nonrefundable_credit",
        to_node_id: "sch3.part1.total_nonrefundable_credits",
        edge_type: "dependency",
      },
      {
        from_node_id: "8863.summary.refundable_credit",
        to_node_id: "1040.line29",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8962Activated) {
    edges.push({
      from_node_id: "8962.summary.net_premium_tax_credit",
      to_node_id: "1040.line31",
      edge_type: "dependency",
    });
  }

  if (args.activations.schedule2Activated) {
    edges.push({
      from_node_id: "sch2.summary.other_taxes",
      to_node_id: "1040.line23",
      edge_type: "dependency",
    });
  }

  if (args.activations.form8959Activated) {
    edges.push(
      {
        from_node_id: "8959.line18.additional_medicare_tax",
        to_node_id: "sch2.summary.other_taxes",
        edge_type: "dependency",
      },
      {
        from_node_id: "8959.line24.additional_medicare_tax_withheld",
        to_node_id: "1040.line25d",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8960Activated) {
    edges.push(
      ...(args.computation.scheduleEInvestmentIncomeTotal !== 0
        ? [
            {
              from_node_id: "8960.line4a.schedule_e_investment_income",
              to_node_id: "8960.line8.net_investment_income",
              edge_type: "dependency" as const,
            },
          ]
        : []),
      {
        from_node_id: "8960.line8.net_investment_income",
        to_node_id: "8960.line17.net_investment_income_tax",
        edge_type: "dependency",
      },
      {
        from_node_id: "8960.line17.net_investment_income_tax",
        to_node_id: "sch2.summary.other_taxes",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.form8962Activated && args.activations.schedule2Activated) {
    edges.push({
      from_node_id: "8962.summary.excess_advance_ptc_repayment",
      to_node_id: "sch2.summary.other_taxes",
      edge_type: "dependency",
    });
  }

  if (args.activations.scheduleAActivated) {
    edges.push(
      {
        from_node_id: "scha.line17",
        to_node_id: "1040.choice.deduction_strategy",
        edge_type: "condition",
      },
      {
        from_node_id: "1040.choice.deduction_strategy",
        to_node_id: "1040.line12",
        edge_type: "dependency",
      },
    );
  }

  edges.push(
    {
      from_node_id: "1040.line1a",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line2a",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line2b",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line3b",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line4b",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line5b",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line6a",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line7",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line8",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line10",
      to_node_id: "1040.line6b",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line1a",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line2b",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line3b",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line4b",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line5b",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line6b",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line7",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line8",
      to_node_id: "1040.line9",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line9",
      to_node_id: "1040.line11",
      edge_type: "derivation",
    },
    {
      from_node_id: "1040.line10",
      to_node_id: "1040.line11",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line11",
      to_node_id: "1040.line15",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line12",
      to_node_id: "1040.line15",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line15",
      to_node_id: "1040.line16",
      edge_type: "derivation",
    },
    {
      from_node_id: "1040.line16",
      to_node_id: "1040.line19",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line19",
      to_node_id: "1040.line20",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line16",
      to_node_id: "1040.line24",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line19",
      to_node_id: "1040.line24",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line20",
      to_node_id: "1040.line24",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line23",
      to_node_id: "1040.line24",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line25d",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line26",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line27a",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line28",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line29",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line31",
      to_node_id: "1040.line33",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line24",
      to_node_id: "1040.line34",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line33",
      to_node_id: "1040.line34",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line24",
      to_node_id: "1040.line37",
      edge_type: "dependency",
    },
    {
      from_node_id: "1040.line33",
      to_node_id: "1040.line37",
      edge_type: "dependency",
    },
  );

  if (args.computation.usesPreferentialRateTaxComputation) {
    edges.push(
      {
        from_node_id: "1040.line3a",
        to_node_id: "1040.line16",
        edge_type: "dependency",
      },
      {
        from_node_id: "1040.line7",
        to_node_id: "1040.line16",
        edge_type: "dependency",
      },
    );
  }

  if (args.activations.schedule3Activated) {
    edges.push({
      from_node_id: "sch3.part1.total_nonrefundable_credits",
      to_node_id: "1040.line20",
      edge_type: "dependency",
    });
  }

  return edges;
}

export { buildFederalEdges };
