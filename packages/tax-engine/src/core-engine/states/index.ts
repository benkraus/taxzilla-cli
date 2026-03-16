import type {
  FormsGraphEdge,
  FormsGraphNode,
  FormsGraphValidationResult,
  StatePluginManifest,
} from "../../blueprint";
import type { CoreEngineInput, CoreEngineStateReturn } from "../input";
import type { CoreEngineFederalSummary, CoreEngineStateSummary } from "../public";
import {
  buildStateNodesAndEdges,
  buildStatePluginModule,
  buildStateSummary,
  type StateArtifactsArgs,
  type StateArtifactsBuilder,
  type StateArtifactsResult,
} from "./common";
import { stateArtifactBuilders } from "./registry";
import { normalizeStateArtifactsArgsForReturnKind } from "./return-kind";

function buildStateArtifacts(args: {
  readonly activeStateReturns: ReadonlyArray<CoreEngineStateReturn>;
  readonly adjustedGrossIncome: number;
  readonly federalSummary?: CoreEngineFederalSummary;
  readonly input: CoreEngineInput;
  readonly stateManifestsByCode: ReadonlyMap<string, StatePluginManifest>;
}): {
  readonly edges: FormsGraphEdge[];
  readonly nodes: FormsGraphNode[];
  readonly stateSummaries: CoreEngineStateSummary[];
  readonly validationResults: FormsGraphValidationResult[];
} {
  const nodes: FormsGraphNode[] = [];
  const edges: FormsGraphEdge[] = [];
  const stateSummaries: CoreEngineStateSummary[] = [];
  const validationResults: FormsGraphValidationResult[] = [];

  for (const stateReturn of args.activeStateReturns) {
    const manifest = args.stateManifestsByCode.get(stateReturn.state_code);

    if (!manifest) {
      continue;
    }

    const builder = stateArtifactBuilders[stateReturn.state_code];

    if (!builder) {
      continue;
    }

    const normalized = normalizeStateArtifactsArgsForReturnKind({
      adjustedGrossIncome: args.adjustedGrossIncome,
      federalSummary: args.federalSummary,
      input: args.input,
      manifest,
      stateReturn,
    });
    const artifacts = builder(normalized.normalizedArgs);

    nodes.push(...artifacts.nodes);
    edges.push(...artifacts.edges);
    stateSummaries.push(artifacts.summary);
    validationResults.push(...normalized.validationResults, ...artifacts.validationResults);
  }

  return {
    edges,
    nodes,
    stateSummaries,
    validationResults,
  };
}

export {
  buildStateArtifacts,
  buildStateNodesAndEdges,
  buildStatePluginModule,
  buildStateSummary,
  stateArtifactBuilders,
};

export type { StateArtifactsArgs, StateArtifactsBuilder, StateArtifactsResult };
