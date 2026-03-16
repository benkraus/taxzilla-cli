import type {
  FormsGraphEdge,
  FormsGraphModule,
  FormsGraphNode,
  FormsGraphValidationResult,
  StatePluginManifest,
} from "../../blueprint";
import { sumNumbers } from "../helpers";
import type { CoreEngineInput, CoreEngineStateReturn } from "../input";
import type { CoreEngineFederalSummary, CoreEngineStateSummary } from "../public";

type StateArtifactsReturnKindContext = {
  readonly allocatedAdjustedGrossIncome: number;
  readonly effectiveRatio: number | null;
  readonly originalAdjustedGrossIncome: number;
  readonly originalFederalSummary?: CoreEngineFederalSummary;
  readonly returnKind: "nonresident" | "part_year_resident" | "resident";
};

type StateArtifactsArgs = {
  readonly adjustedGrossIncome: number;
  readonly federalSummary?: CoreEngineFederalSummary;
  readonly input: CoreEngineInput;
  readonly manifest: StatePluginManifest;
  readonly returnKindContext?: StateArtifactsReturnKindContext;
  readonly stateReturn: CoreEngineStateReturn;
};

type StateArtifactsResult = {
  readonly edges: FormsGraphEdge[];
  readonly nodes: FormsGraphNode[];
  readonly summary: CoreEngineStateSummary;
  readonly validationResults: FormsGraphValidationResult[];
};

type StateArtifactsBuilder = (args: StateArtifactsArgs) => StateArtifactsResult;

type GenericStateSummaryDefaults = {
  readonly defaultTaxableIncome?: number | null;
  readonly defaultTotalTax?: number;
};

type GenericStateGraphArgs = {
  readonly manifest: StatePluginManifest;
  readonly stateReturn: CoreEngineStateReturn;
  readonly summary: CoreEngineStateSummary;
  readonly startingPointFormulaRef?: string;
  readonly startingPointLabel?: string;
};

function buildStateSummaryExtensions(
  stateReturn: CoreEngineStateReturn,
  taxableIncome: number | null,
): Partial<CoreEngineStateSummary> {
  const allocationProfile = stateReturn.allocation_profile;

  if (
    !allocationProfile ||
    (stateReturn.return_kind !== "part_year_resident" && stateReturn.return_kind !== "nonresident")
  ) {
    return {};
  }

  const allocationRatio =
    allocationProfile.apportionment_ratio ?? allocationProfile.source_income_ratio ?? null;

  if (stateReturn.return_kind === "part_year_resident") {
    return {
      allocation_ratio: allocationRatio,
      resident_taxable_income: taxableIncome,
      return_kind: stateReturn.return_kind,
      starting_point_strategy: stateReturn.starting_point_strategy,
    };
  }

  return {
    allocation_ratio: allocationRatio,
    nonresident_source_income: taxableIncome ?? allocationProfile.nonresident_source_income ?? null,
    resident_taxable_income: null,
    return_kind: stateReturn.return_kind,
    starting_point_strategy: stateReturn.starting_point_strategy,
  };
}

function buildStateSummary(
  stateReturn: CoreEngineStateReturn,
  adjustedGrossIncome: number,
  defaults?: GenericStateSummaryDefaults,
): CoreEngineStateSummary {
  if (stateReturn.prepared_summary) {
    return {
      state_code: stateReturn.state_code,
      plugin_manifest_id: stateReturn.plugin_manifest_id,
      adjusted_gross_income_or_starting_point:
        stateReturn.prepared_summary.adjusted_gross_income_or_starting_point,
      taxable_income: stateReturn.prepared_summary.taxable_income,
      total_tax: stateReturn.prepared_summary.total_tax,
      total_payments: stateReturn.prepared_summary.total_payments,
      refund_amount: stateReturn.prepared_summary.refund_amount,
      amount_owed: stateReturn.prepared_summary.amount_owed,
      ...buildStateSummaryExtensions(stateReturn, stateReturn.prepared_summary.taxable_income),
    };
  }

  const totalPayments = sumNumbers(stateReturn.state_payments.map((payment) => payment.amount));
  const totalTax = defaults?.defaultTotalTax ?? 0;

  return {
    state_code: stateReturn.state_code,
    plugin_manifest_id: stateReturn.plugin_manifest_id,
    adjusted_gross_income_or_starting_point: adjustedGrossIncome,
    taxable_income: defaults?.defaultTaxableIncome ?? null,
    total_tax: totalTax,
    total_payments: totalPayments,
    refund_amount: Math.max(totalPayments - totalTax, 0),
    amount_owed: Math.max(totalTax - totalPayments, 0),
    ...buildStateSummaryExtensions(stateReturn, defaults?.defaultTaxableIncome ?? null),
  };
}

function buildStatePluginModule(manifest: StatePluginManifest): FormsGraphModule {
  const primaryForm = manifest.form_catalog.find((entry) => entry.role === "main_return");

  return {
    module_id: manifest.plugin_manifest_id,
    jurisdiction: manifest.state_code,
    module_type: "state_plugin",
    form_code: primaryForm?.form_code ?? manifest.form_catalog[0]?.form_code,
    version: manifest.version,
    enabled: true,
  };
}

function buildStateNodesAndEdgesForState(args: GenericStateGraphArgs): {
  readonly edges: FormsGraphEdge[];
  readonly nodes: FormsGraphNode[];
} {
  const stateCodeLower = args.stateReturn.state_code.toLowerCase();
  const formCode = args.manifest.form_catalog[0]?.form_code;

  const nodes: FormsGraphNode[] = [
    {
      node_id: `bridge.${stateCodeLower}.starting_point`,
      node_type: "bridge",
      jurisdiction: args.stateReturn.state_code,
      module_id: args.manifest.plugin_manifest_id,
      form_code: formCode,
      line_code: "start",
      label:
        args.startingPointLabel ?? `${args.stateReturn.state_code} starting point from federal AGI`,
      data_type: "money",
      value: args.summary.adjusted_gross_income_or_starting_point,
      formula_ref: args.startingPointFormulaRef ?? "1040.line11",
    },
    {
      node_id: `${stateCodeLower}.summary.total_payments`,
      node_type: "summary",
      jurisdiction: args.stateReturn.state_code,
      module_id: args.manifest.plugin_manifest_id,
      form_code: formCode,
      line_code: "summary.total_payments",
      label: `${args.stateReturn.state_code} total payments`,
      data_type: "money",
      value: args.summary.total_payments,
      formula_ref: "prepared_summary.total_payments",
    },
    {
      node_id: `${stateCodeLower}.summary.refund_amount`,
      node_type: "summary",
      jurisdiction: args.stateReturn.state_code,
      module_id: args.manifest.plugin_manifest_id,
      form_code: formCode,
      line_code: "summary.refund_amount",
      label: `${args.stateReturn.state_code} refund amount`,
      data_type: "money",
      value: args.summary.refund_amount,
      formula_ref: "prepared_summary.refund_amount",
    },
    {
      node_id: `${stateCodeLower}.summary.amount_owed`,
      node_type: "summary",
      jurisdiction: args.stateReturn.state_code,
      module_id: args.manifest.plugin_manifest_id,
      form_code: formCode,
      line_code: "summary.amount_owed",
      label: `${args.stateReturn.state_code} amount owed`,
      data_type: "money",
      value: args.summary.amount_owed,
      formula_ref: "prepared_summary.amount_owed",
    },
  ];

  if (args.summary.taxable_income != null) {
    nodes.push({
      node_id: `${stateCodeLower}.summary.taxable_income`,
      node_type: "summary",
      jurisdiction: args.stateReturn.state_code,
      module_id: args.manifest.plugin_manifest_id,
      form_code: formCode,
      line_code: "summary.taxable_income",
      label: `${args.stateReturn.state_code} taxable income`,
      data_type: "money",
      value: args.summary.taxable_income,
      formula_ref: "prepared_summary.taxable_income",
    });
  }

  nodes.push({
    node_id: `${stateCodeLower}.summary.total_tax`,
    node_type: "summary",
    jurisdiction: args.stateReturn.state_code,
    module_id: args.manifest.plugin_manifest_id,
    form_code: formCode,
    line_code: "summary.total_tax",
    label: `${args.stateReturn.state_code} total tax`,
    data_type: "money",
    value: args.summary.total_tax,
    formula_ref: "prepared_summary.total_tax",
  });

  const edges: FormsGraphEdge[] = [
    {
      from_node_id: "1040.line11",
      to_node_id: `bridge.${stateCodeLower}.starting_point`,
      edge_type: "carryforward",
    },
  ];

  if (args.summary.taxable_income != null) {
    edges.push(
      {
        from_node_id: `bridge.${stateCodeLower}.starting_point`,
        to_node_id: `${stateCodeLower}.summary.taxable_income`,
        edge_type: "dependency",
      },
      {
        from_node_id: `${stateCodeLower}.summary.taxable_income`,
        to_node_id: `${stateCodeLower}.summary.total_tax`,
        edge_type: "dependency",
      },
    );
  } else {
    edges.push({
      from_node_id: `bridge.${stateCodeLower}.starting_point`,
      to_node_id: `${stateCodeLower}.summary.total_tax`,
      edge_type: "dependency",
    });
  }

  return { nodes, edges };
}

function buildStateNodesAndEdges(args: {
  readonly activeStateReturns: ReadonlyArray<CoreEngineStateReturn>;
  readonly adjustedGrossIncome: number;
  readonly stateManifestsByCode: ReadonlyMap<string, StatePluginManifest>;
}): { readonly nodes: FormsGraphNode[]; readonly edges: FormsGraphEdge[] } {
  const nodes: FormsGraphNode[] = [];
  const edges: FormsGraphEdge[] = [];

  for (const stateReturn of args.activeStateReturns) {
    const manifest = args.stateManifestsByCode.get(stateReturn.state_code);

    if (!manifest) {
      continue;
    }

    const summary = buildStateSummary(stateReturn, args.adjustedGrossIncome);
    const graph = buildStateNodesAndEdgesForState({
      manifest,
      stateReturn,
      summary,
    });

    nodes.push(...graph.nodes);
    edges.push(...graph.edges);
  }

  return { nodes, edges };
}

function buildGenericStateArtifacts(
  args: StateArtifactsArgs,
  options?: {
    readonly defaultTaxableIncome?: number | null;
    readonly defaultTotalTax?: number;
    readonly startingPointFormulaRef?: string;
    readonly startingPointLabel?: string;
    readonly validationResults?: ReadonlyArray<FormsGraphValidationResult>;
  },
): StateArtifactsResult {
  const summary = buildStateSummary(args.stateReturn, args.adjustedGrossIncome, {
    defaultTaxableIncome: options?.defaultTaxableIncome,
    defaultTotalTax: options?.defaultTotalTax,
  });
  const graph = buildStateNodesAndEdgesForState({
    manifest: args.manifest,
    stateReturn: args.stateReturn,
    summary,
    startingPointFormulaRef: options?.startingPointFormulaRef,
    startingPointLabel: options?.startingPointLabel,
  });

  return {
    edges: graph.edges,
    nodes: graph.nodes,
    summary,
    validationResults: [...(options?.validationResults ?? [])],
  };
}

function buildIncomeTaxStateStubArtifacts(
  args: StateArtifactsArgs,
  options: {
    readonly stateName: string;
  },
): StateArtifactsResult {
  const stateCodeLower = args.stateReturn.state_code.toLowerCase();

  return buildGenericStateArtifacts(args, {
    validationResults: [
      {
        rule_id: `${args.stateReturn.state_code}.plugin.stub`,
        severity: "warning",
        status: "fail",
        message: `${options.stateName} currently uses the scaffold income-tax state plugin. This return stayed on the generic state-summary path until a dedicated ${options.stateName} tax computation module is implemented.`,
        node_ids: [`bridge.${stateCodeLower}.starting_point`, `${stateCodeLower}.summary.total_tax`],
      },
    ],
  });
}

function buildNoIndividualIncomeTaxStateArtifacts(
  args: StateArtifactsArgs,
  options: {
    readonly stateName: string;
  },
): StateArtifactsResult {
  const stateCodeLower = args.stateReturn.state_code.toLowerCase();

  return buildGenericStateArtifacts(args, {
    defaultTaxableIncome: 0,
    validationResults: [
      {
        rule_id: `${args.stateReturn.state_code}.no_individual_income_tax`,
        severity: "info",
        status: "pass",
        message: `${options.stateName} is registered as having no individual income tax for TY2025, so the state module computed zero tax and tracked only state payment, refund, and balance flow.`,
        node_ids: [
          `bridge.${stateCodeLower}.starting_point`,
          `${stateCodeLower}.summary.total_tax`,
          `${stateCodeLower}.summary.total_payments`,
        ],
      },
    ],
  });
}

export {
  buildGenericStateArtifacts,
  buildIncomeTaxStateStubArtifacts,
  buildNoIndividualIncomeTaxStateArtifacts,
  buildStateNodesAndEdges,
  buildStatePluginModule,
  buildStateSummaryExtensions,
  buildStateSummary,
};

export type {
  StateArtifactsArgs,
  StateArtifactsBuilder,
  StateArtifactsResult,
  StateArtifactsReturnKindContext,
};
