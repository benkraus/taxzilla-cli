import type {
  FormsGraphEdge,
  FormsGraphNode,
  FormsGraphValidationResult,
  StatePluginManifest,
} from "../../../blueprint";
import type { CoreEngineInput, CoreEngineStateReturn } from "../../input";
import type { CoreEngineStateSummary } from "../../public";
import {
  buildCaliforniaStateSummary,
  calculateCaliforniaComputation,
} from "./computation";
import type { CaliforniaComputation } from "./types";

function buildCaliforniaStateNodes(args: {
  readonly computation: CaliforniaComputation;
  readonly manifest: StatePluginManifest;
}): FormsGraphNode[] {
  const primaryFormCode = args.manifest.form_catalog[0]?.form_code;

  return [
    {
      node_id: "bridge.ca.starting_point",
      node_type: "bridge",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line13",
      label: "California Form 540 line 13 federal adjusted gross income",
      data_type: "money",
      value: args.computation.line13FederalAdjustedGrossIncome,
      formula_ref: "1040.line11 rounded to California whole-dollar rules",
    },
    {
      node_id: "ca.form540.line14",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line14",
      label: "California adjustments - subtractions",
      data_type: "money",
      value: args.computation.line14Subtractions,
      formula_ref: "schedule_ca.subtractions_total",
    },
    {
      node_id: "ca.form540.line16",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line16",
      label: "California adjustments - additions",
      data_type: "money",
      value: args.computation.line16Additions,
      formula_ref: "schedule_ca.additions_total",
    },
    {
      node_id: "ca.form540.line17",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line17",
      label: "California adjusted gross income",
      data_type: "money",
      value: args.computation.line17CaliforniaAdjustedGrossIncome,
      formula_ref: "line13 - line14 + line16",
    },
    {
      node_id: "ca.form540.line18",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line18",
      label: "California deductions",
      data_type: "money",
      value: args.computation.line18Deduction,
      formula_ref:
        args.computation.deductionStrategy === "itemized"
          ? "max(itemized_deductions_total, standard_deduction) + state_specific_deductions"
          : "standard_deduction + state_specific_deductions",
    },
    {
      node_id: "ca.form540.line19",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line19",
      label: "California taxable income",
      data_type: "money",
      value: args.computation.line19TaxableIncome,
      formula_ref: "max(line17 - line18, 0)",
    },
    {
      node_id: "ca.form540.line31",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line31",
      label: "California tax",
      data_type: "money",
      value: args.computation.line31Tax,
      formula_ref:
        args.computation.taxComputationMethod === "tax_table"
          ? "tax_table(line19, filing_status)"
          : "tax_rate_schedule(line19, filing_status)",
    },
    {
      node_id: "ca.form540.line32",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line32",
      label: "California exemption credits",
      data_type: "money",
      value: args.computation.line32ExemptionCredits,
      formula_ref: "exemption_credit_worksheet(line13, filing_status, lines7_to_10)",
    },
    {
      node_id: "ca.form540.line33",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line33",
      label: "California tax after exemption credits",
      data_type: "money",
      value: args.computation.line33TaxAfterExemptionCredits,
      formula_ref: "max(line31 - line32, 0)",
    },
    {
      node_id: "ca.form540.line34",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line34",
      label: "California additional tax from special schedules",
      data_type: "money",
      value: args.computation.line34OtherTax,
      formula_ref: "plugin_fact_bag.form540.line34_other_tax",
    },
    {
      node_id: "ca.form540.line35",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line35",
      label: "California tax before nonrefundable credits",
      data_type: "money",
      value: args.computation.line35TaxBeforeCredits,
      formula_ref: "line33 + line34",
    },
    ...(args.computation.isAllocatedReturn
      ? [
          {
            node_id: "ca.form540nr.line32",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line32",
            label: "California adjusted gross income (Form 540NR line 32)",
            data_type: "money" as const,
            value: args.computation.allocatedCaliforniaAdjustedGrossIncome,
            formula_ref: "schedule_ca.part_iv.line1",
          },
          {
            node_id: "ca.form540nr.line35",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line35",
            label: "California taxable income (Form 540NR line 35)",
            data_type: "money" as const,
            value: args.computation.allocatedCaliforniaTaxableIncome,
            formula_ref: "max(line32 - prorated_deductions, 0)",
          },
          {
            node_id: "ca.form540nr.line36",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line36",
            label: "California tax rate (Form 540NR line 36)",
            data_type: "string" as const,
            value:
              args.computation.line36CaliforniaTaxRate == null
                ? null
                : args.computation.line36CaliforniaTaxRate.toFixed(4),
            formula_ref: "round(line31 / line19, 4)",
          },
          {
            node_id: "ca.form540nr.line37",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line37",
            label: "California tax before exemption credits (Form 540NR line 37)",
            data_type: "money" as const,
            value: args.computation.line37CaliforniaTaxBeforeExemptionCredits,
            formula_ref: "line35 * line36",
          },
          {
            node_id: "ca.form540nr.line38",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line38",
            label: "California exemption credit percentage (Form 540NR line 38)",
            data_type: "string" as const,
            value:
              args.computation.allocatedExemptionCreditPercentage == null
                ? null
                : args.computation.allocatedExemptionCreditPercentage.toFixed(4),
            formula_ref: "min(round(line35 / line19, 4), 1)",
          },
          {
            node_id: "ca.form540nr.line39",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line39",
            label: "California prorated exemption credits (Form 540NR line 39)",
            data_type: "money" as const,
            value: args.computation.line39ProratedExemptionCredits,
            formula_ref: "line32_exemption_credits * line38",
          },
          {
            node_id: "ca.form540nr.line40",
            node_type: "calculation" as const,
            jurisdiction: "CA",
            module_id: args.manifest.plugin_manifest_id,
            form_code: primaryFormCode,
            line_code: "line40",
            label: "California regular tax before credits (Form 540NR line 40)",
            data_type: "money" as const,
            value: args.computation.line40RegularTaxBeforeCredits,
            formula_ref: "max(line37 - line39, 0)",
          },
        ]
      : []),
    {
      node_id: "ca.form540.line47",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line47",
      label: "California total nonrefundable credits",
      data_type: "money",
      value: args.computation.line47NonrefundableCredits,
      formula_ref: "state_specific_credits + plugin_fact_bag.form540.nonrefundable_credits",
    },
    {
      node_id: "ca.form540.line48",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line48",
      label: "California tax after nonrefundable credits",
      data_type: "money",
      value: args.computation.line48TaxAfterCredits,
      formula_ref: args.computation.isAllocatedReturn
        ? "max(form540nr.line40 + line34 - line47, 0)"
        : "max(line35 - line47, 0)",
    },
    {
      node_id: "ca.form540.line61",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line61",
      label: "California alternative minimum tax",
      data_type: "money",
      value: args.computation.line61AlternativeMinimumTax,
      formula_ref: "plugin_fact_bag.form540.line61_alternative_minimum_tax",
    },
    {
      node_id: "ca.form540.line62",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line62",
      label: "California Behavioral Health Services Tax",
      data_type: "money",
      value: args.computation.line62BehavioralHealthServicesTax,
      formula_ref: args.computation.isAllocatedReturn
        ? "max(form540nr.line35 - 1000000, 0) * 0.01"
        : "max(line19 - 1000000, 0) * 0.01",
    },
    {
      node_id: "ca.form540.line63",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line63",
      label: "California other taxes and credit recapture",
      data_type: "money",
      value: args.computation.line63OtherTaxes,
      formula_ref: "plugin_fact_bag.form540.line63_other_taxes_and_credit_recapture",
    },
    {
      node_id: "ca.form540.line64",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line64",
      label: "California total tax",
      data_type: "money",
      value: args.computation.line64TotalTax,
      formula_ref: "line48 + line61 + line62 + line63",
    },
    {
      node_id: "ca.form540.line78",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line78",
      label: "California total payments",
      data_type: "money",
      value: args.computation.line78TotalPayments,
      formula_ref: "state_payments + refundable_credits",
    },
    {
      node_id: "ca.form540.line91",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line91",
      label: "California use tax",
      data_type: "money",
      value: args.computation.line91UseTax,
      formula_ref: "plugin_fact_bag.form540.use_tax",
    },
    {
      node_id: "ca.form540.line92",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line92",
      label: "California individual shared responsibility penalty",
      data_type: "money",
      value: args.computation.line92IndividualSharedResponsibilityPenalty,
      formula_ref: "plugin_fact_bag.form540.individual_shared_responsibility_penalty",
    },
    {
      node_id: "ca.form540.line95",
      node_type: "calculation",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line95",
      label: "California payments after penalty",
      data_type: "money",
      value: args.computation.line95PaymentsAfterPenalty,
      formula_ref: "max(max(line78 - line91, 0) - line92, 0)",
    },
    {
      node_id: "ca.form540.line97",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line97",
      label: "California overpaid tax refund",
      data_type: "money",
      value: args.computation.line97RefundAmount,
      formula_ref: "max(line95 - line64, 0)",
    },
    {
      node_id: "ca.form540.line100",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "line100",
      label: "California amount owed",
      data_type: "money",
      value: args.computation.line100AmountOwed,
      formula_ref: "max(line64 - line95, 0)",
    },
    {
      node_id: "ca.summary.taxable_income",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "summary.taxable_income",
      label: "California summary taxable income",
      data_type: "money",
      value: args.computation.allocatedCaliforniaTaxableIncome ?? args.computation.line19TaxableIncome,
      formula_ref: args.computation.isAllocatedReturn ? "form540nr.line35" : "form540.line19",
    },
    {
      node_id: "ca.summary.total_tax",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "summary.total_tax",
      label: "California summary total tax",
      data_type: "money",
      value: args.computation.line64TotalTax,
      formula_ref: "form540.line64",
    },
    {
      node_id: "ca.summary.total_payments",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "summary.total_payments",
      label: "California summary total payments",
      data_type: "money",
      value: args.computation.line78TotalPayments,
      formula_ref: "form540.line78",
    },
    {
      node_id: "ca.summary.refund_amount",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "summary.refund_amount",
      label: "California summary refund amount",
      data_type: "money",
      value: args.computation.line97RefundAmount,
      formula_ref: "form540.line97",
    },
    {
      node_id: "ca.summary.amount_owed",
      node_type: "summary",
      jurisdiction: "CA",
      module_id: args.manifest.plugin_manifest_id,
      form_code: primaryFormCode,
      line_code: "summary.amount_owed",
      label: "California summary amount owed",
      data_type: "money",
      value: args.computation.line100AmountOwed,
      formula_ref: "form540.line100",
    },
  ];
}

function buildCaliforniaStateEdges(args: {
  readonly computation: CaliforniaComputation;
}): FormsGraphEdge[] {
  const edges: FormsGraphEdge[] = [
    { from_node_id: "1040.line11", to_node_id: "bridge.ca.starting_point", edge_type: "carryforward" },
    { from_node_id: "bridge.ca.starting_point", to_node_id: "ca.form540.line17", edge_type: "dependency" },
    { from_node_id: "ca.form540.line14", to_node_id: "ca.form540.line17", edge_type: "dependency" },
    { from_node_id: "ca.form540.line16", to_node_id: "ca.form540.line17", edge_type: "dependency" },
    { from_node_id: "ca.form540.line17", to_node_id: "ca.form540.line19", edge_type: "dependency" },
    { from_node_id: "ca.form540.line18", to_node_id: "ca.form540.line19", edge_type: "dependency" },
    { from_node_id: "ca.form540.line19", to_node_id: "ca.form540.line31", edge_type: "dependency" },
    { from_node_id: "ca.form540.line19", to_node_id: "ca.form540.line62", edge_type: "dependency" },
    { from_node_id: "ca.form540.line31", to_node_id: "ca.form540.line33", edge_type: "dependency" },
    { from_node_id: "ca.form540.line32", to_node_id: "ca.form540.line33", edge_type: "dependency" },
    { from_node_id: "ca.form540.line33", to_node_id: "ca.form540.line35", edge_type: "dependency" },
    { from_node_id: "ca.form540.line34", to_node_id: "ca.form540.line35", edge_type: "dependency" },
    { from_node_id: "ca.form540.line35", to_node_id: "ca.form540.line48", edge_type: "dependency" },
    { from_node_id: "ca.form540.line47", to_node_id: "ca.form540.line48", edge_type: "dependency" },
    { from_node_id: "ca.form540.line48", to_node_id: "ca.form540.line64", edge_type: "dependency" },
    { from_node_id: "ca.form540.line61", to_node_id: "ca.form540.line64", edge_type: "dependency" },
    { from_node_id: "ca.form540.line62", to_node_id: "ca.form540.line64", edge_type: "dependency" },
    { from_node_id: "ca.form540.line63", to_node_id: "ca.form540.line64", edge_type: "dependency" },
    { from_node_id: "ca.form540.line78", to_node_id: "ca.form540.line95", edge_type: "dependency" },
    { from_node_id: "ca.form540.line91", to_node_id: "ca.form540.line95", edge_type: "dependency" },
    { from_node_id: "ca.form540.line92", to_node_id: "ca.form540.line95", edge_type: "dependency" },
    { from_node_id: "ca.form540.line64", to_node_id: "ca.form540.line97", edge_type: "dependency" },
    { from_node_id: "ca.form540.line95", to_node_id: "ca.form540.line97", edge_type: "dependency" },
    { from_node_id: "ca.form540.line64", to_node_id: "ca.form540.line100", edge_type: "dependency" },
    { from_node_id: "ca.form540.line95", to_node_id: "ca.form540.line100", edge_type: "dependency" },
    { from_node_id: "ca.form540.line64", to_node_id: "ca.summary.total_tax", edge_type: "dependency" },
    { from_node_id: "ca.form540.line78", to_node_id: "ca.summary.total_payments", edge_type: "dependency" },
    { from_node_id: "ca.form540.line97", to_node_id: "ca.summary.refund_amount", edge_type: "dependency" },
    { from_node_id: "ca.form540.line100", to_node_id: "ca.summary.amount_owed", edge_type: "dependency" },
  ];

  if (args.computation.isAllocatedReturn) {
    edges.push(
      { from_node_id: "ca.form540.line17", to_node_id: "ca.form540nr.line32", edge_type: "dependency" },
      { from_node_id: "ca.form540.line18", to_node_id: "ca.form540nr.line35", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line32", to_node_id: "ca.form540nr.line35", edge_type: "dependency" },
      { from_node_id: "ca.form540.line31", to_node_id: "ca.form540nr.line36", edge_type: "dependency" },
      { from_node_id: "ca.form540.line19", to_node_id: "ca.form540nr.line36", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line35", to_node_id: "ca.form540nr.line37", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line36", to_node_id: "ca.form540nr.line37", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line35", to_node_id: "ca.form540nr.line38", edge_type: "dependency" },
      { from_node_id: "ca.form540.line19", to_node_id: "ca.form540nr.line38", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line38", to_node_id: "ca.form540nr.line39", edge_type: "dependency" },
      { from_node_id: "ca.form540.line32", to_node_id: "ca.form540nr.line39", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line37", to_node_id: "ca.form540nr.line40", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line39", to_node_id: "ca.form540nr.line40", edge_type: "dependency" },
      { from_node_id: "ca.form540nr.line35", to_node_id: "ca.summary.taxable_income", edge_type: "dependency" },
    );
  } else {
    edges.push({
      from_node_id: "ca.form540.line19",
      to_node_id: "ca.summary.taxable_income",
      edge_type: "dependency",
    });
  }

  return edges;
}

function buildCaliforniaValidationResults(args: {
  readonly computation: CaliforniaComputation;
}): FormsGraphValidationResult[] {
  const validations: FormsGraphValidationResult[] = [
    {
      rule_id: "CA.form540.computed",
      severity: "info",
      status: "pass",
      message:
        args.computation.isAllocatedReturn
          ? "California Form 540NR computed total-year tax first, then applied Schedule CA (540NR) Part IV line 32 through line 40 proration to reach California tax for a part-year or nonresident return."
          : "California resident Form 540 line 13 through line 100 core tax flow was computed from federal AGI, California adjustments, deductions, credits, and payments.",
      node_ids: args.computation.isAllocatedReturn
        ? ["ca.form540.line19", "ca.form540.line31", "ca.form540nr.line32", "ca.form540nr.line40", "ca.form540.line64"]
        : ["ca.form540.line17", "ca.form540.line19", "ca.form540.line64", "ca.form540.line78"],
    },
    {
      rule_id:
        args.computation.taxComputationMethod === "tax_table"
          ? "CA.form540.tax_table_used"
          : "CA.form540.tax_rate_schedule_used",
      severity: "info",
      status: "pass",
      message:
        args.computation.taxComputationMethod === "tax_table"
          ? "California Form 540 line 31 used the official 2025 tax table path for taxable income of $100,000 or less."
          : "California Form 540 line 31 used the official 2025 tax rate schedule path for taxable income over $100,000.",
      node_ids: ["ca.form540.line19", "ca.form540.line31"],
    },
  ];

  if (args.computation.paymentsUsedCanonicalStatePayments) {
    validations.push({
      rule_id: "CA.form540.state_payments.canonical",
      severity: "info",
      status: "pass",
      message:
        "California payments used the explicit state_return.state_payments array as the source of truth before refund or balance due was computed.",
      node_ids: ["ca.form540.line78"],
    });
  } else {
    validations.push({
      rule_id: "CA.form540.state_payments.fallback",
      severity: "info",
      status: "pass",
      message:
        "California payments fell back to canonical state withholding, estimated payment, and extension payment facts because state_return.state_payments was empty.",
      node_ids: ["ca.form540.line78"],
    });
  }

  if (args.computation.nonrefundableCreditsTotal > 0) {
    validations.push({
      rule_id: "CA.form540.nonrefundable_credits.applied",
      severity: "info",
      status: "pass",
      message:
        "California nonrefundable credits from state_specific_credits and plugin_fact_bag.form540 were applied before total tax was finalized.",
      node_ids: ["ca.form540.line47", "ca.form540.line48", "ca.form540.line64"],
    });
  }

  if (args.computation.refundableCreditsTotal > 0) {
    validations.push({
      rule_id: "CA.form540.refundable_credits.applied",
      severity: "info",
      status: "pass",
      message:
        "California refundable credits from plugin_fact_bag.form540 were included in total payments before refund or balance due was computed.",
      node_ids: ["ca.form540.line78", "ca.form540.line97", "ca.form540.line100"],
    });
  }

  return validations;
}

function buildCaliforniaStateArtifacts(args: {
  readonly federalAdjustedGrossIncome: number;
  readonly input: CoreEngineInput;
  readonly manifest: StatePluginManifest;
  readonly stateReturn: CoreEngineStateReturn;
}): {
  readonly edges: FormsGraphEdge[];
  readonly nodes: FormsGraphNode[];
  readonly summary: CoreEngineStateSummary;
  readonly validationResults: FormsGraphValidationResult[];
} {
  const computation = calculateCaliforniaComputation(args);

  return {
    edges: buildCaliforniaStateEdges({
      computation,
    }),
    nodes: buildCaliforniaStateNodes({
      computation,
      manifest: args.manifest,
    }),
    summary: buildCaliforniaStateSummary({
      computation,
      stateReturn: args.stateReturn,
    }),
    validationResults: buildCaliforniaValidationResults({
      computation,
    }),
  };
}

export { buildCaliforniaStateArtifacts };
