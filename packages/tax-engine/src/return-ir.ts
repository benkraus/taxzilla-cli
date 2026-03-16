import { Effect, Either, Schema } from "effect";

import {
  BlueprintTaxYearSchema,
  CanonicalReturnEnvelope,
  CanonicalReturnEnvelopeSchema,
  CoreEngineFederalSummarySchema,
  CoreEngineResult,
  CoreEngineResultSchema,
  CoreEngineStateSummarySchema,
  FormsGraphEdge,
  FormsGraphModule,
  FormsGraphNode,
  InvalidCanonicalReturnError,
  RequestedJurisdictions,
  RequestedJurisdictionsSchema,
  StateReturnKind,
  StateReturnKindSchema,
  TaxEngineCoreError,
  evaluateTy2025CoreEngineFromEnvelope,
} from "./index";

export const ReturnIrMappingEntrySchema = Schema.Struct({
  emitted_target_path: Schema.String,
  graph_node_id: Schema.String,
  canonical_json_pointers: Schema.Array(Schema.String),
  human_label: Schema.String,
  jurisdiction: Schema.String,
  form_code: Schema.NullOr(Schema.String),
  line_code: Schema.NullOr(Schema.String),
});
export type ReturnIrMappingEntry = Schema.Schema.Type<typeof ReturnIrMappingEntrySchema>;

export const ReturnIrFieldSchema = Schema.Struct({
  graph_node_id: Schema.String,
  line_code: Schema.NullOr(Schema.String),
  label: Schema.String,
  data_type: Schema.String,
  value: Schema.Unknown,
  formula_ref: Schema.NullOr(Schema.String),
  source_json_pointers: Schema.Array(Schema.String),
});
export type ReturnIrField = Schema.Schema.Type<typeof ReturnIrFieldSchema>;

export const ReturnIrFormSchema = Schema.Struct({
  module_id: Schema.String,
  form_code: Schema.NullOr(Schema.String),
  jurisdiction: Schema.String,
  fields: Schema.Array(ReturnIrFieldSchema),
});
export type ReturnIrForm = Schema.Schema.Type<typeof ReturnIrFormSchema>;

export const AttachmentIRKindSchema = Schema.Literal(
  "binary_attachment",
  "rendered_pdf",
  "manifest",
  "validation_report",
);
export type AttachmentIRKind = Schema.Schema.Type<typeof AttachmentIRKindSchema>;

export const AttachmentIRSchema = Schema.Struct({
  artifact_id: Schema.String,
  kind: AttachmentIRKindSchema,
  file_name: Schema.NullOr(Schema.String),
  source_ref: Schema.NullOr(Schema.String),
});
export type AttachmentIR = Schema.Schema.Type<typeof AttachmentIRSchema>;

export const ReturnIrPersonSchema = Schema.Struct({
  person_id: Schema.NullOr(Schema.String),
  first_name: Schema.NullOr(Schema.String),
  last_name: Schema.NullOr(Schema.String),
  full_legal_name: Schema.NullOr(Schema.String),
});
export type ReturnIrPerson = Schema.Schema.Type<typeof ReturnIrPersonSchema>;

export const FederalReturnIrSignerSchema = Schema.Struct({
  person_id: Schema.String,
  signed_at: Schema.NullOr(Schema.String),
  prior_year_agi: Schema.NullOr(Schema.Number),
});
export type FederalReturnIrSigner = Schema.Schema.Type<typeof FederalReturnIrSignerSchema>;

export const FederalReturnIrRefundDirectDepositSchema = Schema.Struct({
  bank_name: Schema.NullOr(Schema.String),
  account_type: Schema.NullOr(Schema.String),
  last4_account_number: Schema.NullOr(Schema.String),
  last4_routing_number: Schema.NullOr(Schema.String),
});
export type FederalReturnIrRefundDirectDeposit = Schema.Schema.Type<
  typeof FederalReturnIrRefundDirectDepositSchema
>;

export const FederalReturnIrSignatureContextSchema = Schema.Struct({
  signature_method: Schema.NullOr(Schema.String),
  signers: Schema.Array(FederalReturnIrSignerSchema),
});
export type FederalReturnIrSignatureContext = Schema.Schema.Type<
  typeof FederalReturnIrSignatureContextSchema
>;

export const FederalReturnIrPaymentContextSchema = Schema.Struct({
  federal_withholding: Schema.Number,
  refund_direct_deposit: Schema.NullOr(FederalReturnIrRefundDirectDepositSchema),
  balance_due_direct_debit_requested: Schema.Boolean,
});
export type FederalReturnIrPaymentContext = Schema.Schema.Type<
  typeof FederalReturnIrPaymentContextSchema
>;

export const FederalReturnIRSchema = Schema.Struct({
  return_id: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  schema_version: Schema.String,
  xml_target_version: Schema.String,
  filing_status: Schema.NullOr(Schema.String),
  primary_taxpayer: ReturnIrPersonSchema,
  spouse: Schema.NullOr(ReturnIrPersonSchema),
  dependents: Schema.Array(ReturnIrPersonSchema),
  forms: Schema.Array(ReturnIrFormSchema),
  schedules: Schema.Array(ReturnIrFormSchema),
  worksheets: Schema.Array(ReturnIrFormSchema),
  attachments: Schema.Array(AttachmentIRSchema),
  summary: CoreEngineFederalSummarySchema,
  signature_context: FederalReturnIrSignatureContextSchema,
  payment_context: FederalReturnIrPaymentContextSchema,
  mapping_index: Schema.Array(ReturnIrMappingEntrySchema),
});
export type FederalReturnIR = Schema.Schema.Type<typeof FederalReturnIRSchema>;

export const StateReturnIrStartingPointSourceSchema = Schema.Struct({
  strategy: Schema.String,
  federal_graph_node_id: Schema.String,
  value: Schema.Number,
});
export type StateReturnIrStartingPointSource = Schema.Schema.Type<
  typeof StateReturnIrStartingPointSourceSchema
>;

export const StateLocalReturnIRSchema = Schema.Struct({
  jurisdiction_code: Schema.String,
  jurisdiction_name: Schema.String,
  resident_status: Schema.String,
  payment_total: Schema.Number,
});
export type StateLocalReturnIR = Schema.Schema.Type<typeof StateLocalReturnIRSchema>;

export const StateReturnIrResidencyContextSchema = Schema.Struct({
  return_kind: Schema.NullOr(StateReturnKindSchema),
  residency_period_count: Schema.Number,
  local_return_count: Schema.Number,
  determination_method: Schema.NullOr(Schema.String),
  domicile_state_code: Schema.NullOr(Schema.String),
  days_in_state: Schema.NullOr(Schema.Number),
  statutory_resident: Schema.NullOr(Schema.Boolean),
});
export type StateReturnIrResidencyContext = Schema.Schema.Type<
  typeof StateReturnIrResidencyContextSchema
>;

export const StateReturnIrAllocationContextSchema = Schema.Struct({
  starting_point_strategy: Schema.String,
  everywhere_income: Schema.NullOr(Schema.Number),
  resident_period_income: Schema.NullOr(Schema.Number),
  nonresident_source_income: Schema.NullOr(Schema.Number),
  state_source_income: Schema.NullOr(Schema.Number),
  apportionment_ratio: Schema.NullOr(Schema.Number),
  source_income_ratio: Schema.NullOr(Schema.Number),
  allocation_method: Schema.NullOr(Schema.String),
});
export type StateReturnIrAllocationContext = Schema.Schema.Type<
  typeof StateReturnIrAllocationContextSchema
>;

export const StateReturnIrPaymentContextSchema = Schema.Struct({
  total_state_payments: Schema.Number,
  total_local_payments: Schema.Number,
  state_payment_count: Schema.Number,
  local_payment_count: Schema.Number,
});
export type StateReturnIrPaymentContext = Schema.Schema.Type<
  typeof StateReturnIrPaymentContextSchema
>;

export const StateReturnIRSchema = Schema.Struct({
  state_code: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  plugin_manifest_id: Schema.String,
  xml_target_version: Schema.String,
  return_kind: Schema.NullOr(StateReturnKindSchema),
  starting_point_source: StateReturnIrStartingPointSourceSchema,
  residency_context: StateReturnIrResidencyContextSchema,
  allocation_context: StateReturnIrAllocationContextSchema,
  payment_context: StateReturnIrPaymentContextSchema,
  forms: Schema.Array(ReturnIrFormSchema),
  attachments: Schema.Array(AttachmentIRSchema),
  local_returns: Schema.Array(StateLocalReturnIRSchema),
  local_returns_count: Schema.Number,
  summary: CoreEngineStateSummarySchema,
  mapping_index: Schema.Array(ReturnIrMappingEntrySchema),
});
export type StateReturnIR = Schema.Schema.Type<typeof StateReturnIRSchema>;

export const SubmissionPackageSubmissionModeSchema = Schema.Literal(
  "federal_only",
  "state_only",
  "federal_and_state_bundle",
);
export type SubmissionPackageSubmissionMode = Schema.Schema.Type<
  typeof SubmissionPackageSubmissionModeSchema
>;

export const SubmissionPackagePartnerMetadataSchema = Schema.Struct({
  partner_name: Schema.NullOr(Schema.String),
  adapter_version: Schema.NullOr(Schema.String),
  environment: Schema.NullOr(Schema.String),
  requested_state_codes: Schema.Array(Schema.String),
});
export type SubmissionPackagePartnerMetadata = Schema.Schema.Type<
  typeof SubmissionPackagePartnerMetadataSchema
>;

export const SubmissionPackageIRSchema = Schema.Struct({
  package_id: Schema.String,
  federal_return_ref: Schema.String,
  state_return_refs: Schema.Array(Schema.String),
  submission_mode: SubmissionPackageSubmissionModeSchema,
  binary_artifacts: Schema.Array(AttachmentIRSchema),
  partner_metadata: SubmissionPackagePartnerMetadataSchema,
  idempotency_key: Schema.String,
});
export type SubmissionPackageIR = Schema.Schema.Type<typeof SubmissionPackageIRSchema>;

export const Ty2025ReturnIrBundleSchema = Schema.Struct({
  federal_return: FederalReturnIRSchema,
  state_returns: Schema.Array(StateReturnIRSchema),
  submission_package: SubmissionPackageIRSchema,
});
export type Ty2025ReturnIrBundle = Schema.Schema.Type<typeof Ty2025ReturnIrBundleSchema>;

export const Ty2025CoreEnginePipelineResultSchema = Schema.Struct({
  core_engine: CoreEngineResultSchema,
  return_ir: Ty2025ReturnIrBundleSchema,
});
export type Ty2025CoreEnginePipelineResult = Schema.Schema.Type<
  typeof Ty2025CoreEnginePipelineResultSchema
>;

export const decodeFederalReturnIR = Schema.decodeUnknownEither(FederalReturnIRSchema);
export const decodeStateReturnIR = Schema.decodeUnknownEither(StateReturnIRSchema);
export const decodeSubmissionPackageIR = Schema.decodeUnknownEither(SubmissionPackageIRSchema);
export const decodeTy2025ReturnIrBundle = Schema.decodeUnknownEither(Ty2025ReturnIrBundleSchema);

function fromDecodedEither<A, E, DomainError>(
  decoded: Either.Either<A, E>,
  onLeft: (error: E) => DomainError,
): Effect.Effect<A, DomainError> {
  if (Either.isRight(decoded)) {
    return Effect.succeed(decoded.right);
  }

  return Effect.fail(onLeft(decoded.left));
}

function parseCanonicalReturnEnvelopeEffect(
  input: unknown,
): Effect.Effect<CanonicalReturnEnvelope, InvalidCanonicalReturnError> {
  return fromDecodedEither(Schema.decodeUnknownEither(CanonicalReturnEnvelopeSchema)(input), (parseError) => {
    return new InvalidCanonicalReturnError({ parseError });
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function dedupeStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function sanitizeIrSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePerson(value: unknown): ReturnIrPerson {
  const person = asRecord(value);
  const name = asRecord(person?.name);

  return {
    person_id: asString(person?.person_id),
    first_name: asString(name?.first),
    last_name: asString(name?.last),
    full_legal_name: asString(name?.full_legal_name),
  };
}

function normalizeSigners(value: unknown): FederalReturnIrSigner[] {
  return asArray(value)
    .map((signer) => {
      const signerRecord = asRecord(signer);
      const personId = asString(signerRecord?.person_id);

      if (!personId) {
        return undefined;
      }

      return {
        person_id: personId,
        signed_at: asString(signerRecord?.signed_at),
        prior_year_agi: asNumber(signerRecord?.prior_year_agi),
      };
    })
    .filter((signer): signer is FederalReturnIrSigner => signer !== undefined);
}

function normalizeRefundDirectDeposit(value: unknown): FederalReturnIrRefundDirectDeposit | null {
  const deposit = asRecord(value);

  if (!deposit) {
    return null;
  }

  return {
    bank_name: asString(deposit.bank_name),
    account_type: asString(deposit.account_type),
    last4_account_number: asString(deposit.last4_account_number),
    last4_routing_number: asString(deposit.last4_routing_number),
  };
}

function readStateReturnKind(value: unknown): StateReturnKind | null {
  const decoded = Schema.decodeUnknownEither(StateReturnKindSchema)(value);
  return Either.isRight(decoded) ? decoded.right : null;
}

function buildSourcePointersByNode(
  nodes: ReadonlyArray<FormsGraphNode>,
  edges: ReadonlyArray<FormsGraphEdge>,
): ReadonlyMap<string, string[]> {
  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]));
  const parentNodeIdsByNodeId = new Map<string, string[]>();

  for (const edge of edges) {
    const existing = parentNodeIdsByNodeId.get(edge.to_node_id) ?? [];
    existing.push(edge.from_node_id);
    parentNodeIdsByNodeId.set(edge.to_node_id, existing);
  }

  const memo = new Map<string, string[]>();

  function resolveNodePointers(nodeId: string, visiting: Set<string>): string[] {
    const cached = memo.get(nodeId);

    if (cached) {
      return cached;
    }

    if (visiting.has(nodeId)) {
      return [];
    }

    visiting.add(nodeId);

    const node = nodeMap.get(nodeId);
    const ownPointers = node?.source_json_pointers ?? [];
    const upstreamPointers = (parentNodeIdsByNodeId.get(nodeId) ?? []).flatMap((parentNodeId) =>
      resolveNodePointers(parentNodeId, visiting),
    );
    const resolved = dedupeStrings([...ownPointers, ...upstreamPointers]);

    visiting.delete(nodeId);
    memo.set(nodeId, resolved);

    return resolved;
  }

  for (const node of nodes) {
    resolveNodePointers(node.node_id, new Set<string>());
  }

  return memo;
}

function buildEmittedTargetPath(node: FormsGraphNode): string {
  const jurisdictionPrefix =
    node.jurisdiction === "federal"
      ? "federal"
      : `state.${sanitizeIrSegment(node.jurisdiction)}`;
  const section =
    node.node_type === "summary"
      ? "summary"
      : node.node_type === "bridge"
        ? "bridge"
        : "targets";
  const formSegment = sanitizeIrSegment(node.form_code ?? node.module_id);
  const lineSegment = sanitizeIrSegment(node.line_code ?? node.node_id);

  return `${jurisdictionPrefix}.${section}.${formSegment}.${lineSegment}`;
}

function buildReturnIrField(
  node: FormsGraphNode,
  sourcePointersByNodeId: ReadonlyMap<string, string[]>,
): ReturnIrField {
  return {
    graph_node_id: node.node_id,
    line_code: node.line_code ?? null,
    label: node.label,
    data_type: node.data_type,
    value: node.value,
    formula_ref: node.formula_ref ?? null,
    source_json_pointers: sourcePointersByNodeId.get(node.node_id)!,
  };
}

function buildReturnIrForms(args: {
  readonly modules: ReadonlyArray<FormsGraphModule>;
  readonly nodes: ReadonlyArray<FormsGraphNode>;
  readonly sourcePointersByNodeId: ReadonlyMap<string, string[]>;
}): ReturnIrForm[] {
  const forms: ReturnIrForm[] = [];

  for (const module of args.modules) {
    const fields = args.nodes
      .filter((node) => node.module_id === module.module_id)
      .map((node) => buildReturnIrField(node, args.sourcePointersByNodeId));

    if (fields.length === 0) {
      continue;
    }

    forms.push({
      module_id: module.module_id,
      form_code: module.form_code ?? null,
      jurisdiction: module.jurisdiction,
      fields,
    });
  }

  return forms;
}

function buildMappingIndex(
  nodes: ReadonlyArray<FormsGraphNode>,
  sourcePointersByNodeId: ReadonlyMap<string, string[]>,
): ReturnIrMappingEntry[] {
  return nodes.map((node) => ({
    emitted_target_path: buildEmittedTargetPath(node),
    graph_node_id: node.node_id,
    canonical_json_pointers: sourcePointersByNodeId.get(node.node_id)!,
    human_label: node.label,
    jurisdiction: node.jurisdiction,
    form_code: node.form_code ?? null,
    line_code: node.line_code ?? null,
  }));
}

function deriveSubmissionMode(
  requestedJurisdictions: RequestedJurisdictions,
  stateReturns: ReadonlyArray<StateReturnIR>,
): SubmissionPackageSubmissionMode {
  if (requestedJurisdictions.federal && stateReturns.length > 0) {
    return "federal_and_state_bundle";
  }

  if (requestedJurisdictions.federal) {
    return "federal_only";
  }

  return "state_only";
}

function buildFederalReturnIr(
  canonicalReturn: CanonicalReturnEnvelope,
  coreEngineResult: CoreEngineResult,
  sourcePointersByNodeId: ReadonlyMap<string, string[]>,
): FederalReturnIR {
  const household = asRecord(canonicalReturn.household);
  const facts = asRecord(canonicalReturn.facts);
  const payments = asRecord(facts?.payments);
  const efile = asRecord(canonicalReturn.efile);
  const federalModules = coreEngineResult.graph.modules.filter(
    (module) => module.jurisdiction === "federal",
  );
  const federalNodes = coreEngineResult.graph.nodes.filter(
    (node) => node.jurisdiction === "federal" && node.node_type !== "input",
  );
  const formModules = federalModules.filter((module) => module.module_type === "form");
  const scheduleModules = federalModules.filter((module) => module.module_type === "schedule");
  const worksheetModules = federalModules.filter((module) => module.module_type === "worksheet");

  return {
    return_id: canonicalReturn.return_id,
    tax_year: canonicalReturn.tax_year,
    schema_version: canonicalReturn.schema_version,
    xml_target_version: `irs.ty${canonicalReturn.tax_year}.placeholder.v1`,
    filing_status: asString(household?.filing_status),
    primary_taxpayer: normalizePerson(household?.taxpayer),
    spouse: household?.spouse == null ? null : normalizePerson(household.spouse),
    dependents: asArray(household?.dependents).map(normalizePerson),
    forms: buildReturnIrForms({
      modules: formModules,
      nodes: federalNodes,
      sourcePointersByNodeId,
    }),
    schedules: buildReturnIrForms({
      modules: scheduleModules,
      nodes: federalNodes,
      sourcePointersByNodeId,
    }),
    worksheets: buildReturnIrForms({
      modules: worksheetModules,
      nodes: federalNodes,
      sourcePointersByNodeId,
    }),
    attachments: [],
    summary: coreEngineResult.federal_summary,
    signature_context: {
      signature_method: asString(efile?.signature_method),
      signers: normalizeSigners(efile?.signers),
    },
    payment_context: {
      federal_withholding: coreEngineResult.federal_summary.federal_withholding,
      refund_direct_deposit: normalizeRefundDirectDeposit(payments?.refund_direct_deposit),
      balance_due_direct_debit_requested: payments?.balance_due_direct_debit != null,
    },
    mapping_index: buildMappingIndex(federalNodes, sourcePointersByNodeId),
  };
}

function buildStateReturnIr(args: {
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly coreEngineResult: CoreEngineResult;
  readonly stateSummary: CoreEngineResult["state_summaries"][number];
  readonly sourcePointersByNodeId: ReadonlyMap<string, string[]>;
}): StateReturnIR {
  const rawStateReturn = args.canonicalReturn.state_returns[args.stateSummary.state_code];
  const stateReturn = asRecord(rawStateReturn);
  const stateModules = args.coreEngineResult.graph.modules.filter(
    (module) => module.jurisdiction === args.stateSummary.state_code,
  );
  const stateNodes = args.coreEngineResult.graph.nodes.filter(
    (node) => node.jurisdiction === args.stateSummary.state_code && node.node_type !== "input",
  );
  const stateFormNodes = stateNodes.filter((node) => node.node_type !== "bridge");
  const startingPointNode = stateNodes.find((node) => node.node_type === "bridge");
  const localReturns: StateLocalReturnIR[] = asArray(stateReturn?.local_returns).map((entry) => {
    const localReturn = asRecord(entry);

    return {
      jurisdiction_code: asString(localReturn?.jurisdiction_code) ?? "unknown",
      jurisdiction_name: asString(localReturn?.jurisdiction_name) ?? "Unknown local jurisdiction",
      resident_status: asString(localReturn?.resident_status) ?? "unknown",
      payment_total: asArray(localReturn?.payments).reduce<number>((total, payment) => {
        return total + (asNumber(asRecord(payment)?.amount) ?? 0);
      }, 0),
    };
  });
  const residencyDetermination = asRecord(stateReturn?.residency_determination);
  const allocationProfile = asRecord(stateReturn?.allocation_profile);
  const statePaymentCount = asArray(stateReturn?.state_payments).length;
  const localPaymentCount = localReturns.reduce<number>((total, localReturn) => {
    return total + (localReturn.payment_total !== 0 ? 1 : 0);
  }, 0);

  return {
    state_code: args.stateSummary.state_code,
    tax_year: args.canonicalReturn.tax_year,
    plugin_manifest_id: args.stateSummary.plugin_manifest_id,
    xml_target_version: `${args.stateSummary.plugin_manifest_id}.xml.placeholder`,
    return_kind: readStateReturnKind(stateReturn?.return_kind),
    starting_point_source: {
      strategy: asString(stateReturn?.starting_point_strategy) ?? "unknown",
      federal_graph_node_id: "1040.line11",
      value:
        typeof startingPointNode?.value === "number"
          ? startingPointNode.value
          : args.stateSummary.adjusted_gross_income_or_starting_point,
    },
    residency_context: {
      return_kind: readStateReturnKind(stateReturn?.return_kind),
      residency_period_count: asArray(stateReturn?.residency_periods).length,
      local_return_count: localReturns.length,
      determination_method: asString(residencyDetermination?.determination_method),
      domicile_state_code: asString(residencyDetermination?.domicile_state_code),
      days_in_state: asNumber(residencyDetermination?.days_in_state),
      statutory_resident: asBoolean(residencyDetermination?.statutory_resident),
    },
    allocation_context: {
      starting_point_strategy: asString(stateReturn?.starting_point_strategy) ?? "unknown",
      everywhere_income: asNumber(allocationProfile?.everywhere_income),
      resident_period_income: asNumber(allocationProfile?.resident_period_income),
      nonresident_source_income: asNumber(allocationProfile?.nonresident_source_income),
      state_source_income: asNumber(allocationProfile?.state_source_income),
      apportionment_ratio: asNumber(allocationProfile?.apportionment_ratio),
      source_income_ratio: asNumber(allocationProfile?.source_income_ratio),
      allocation_method: asString(allocationProfile?.allocation_method),
    },
    payment_context: {
      total_state_payments: args.stateSummary.total_payments,
      total_local_payments: localReturns.reduce<number>((total, localReturn) => {
        return total + localReturn.payment_total;
      }, 0),
      state_payment_count: statePaymentCount,
      local_payment_count: localPaymentCount,
    },
    forms: buildReturnIrForms({
      modules: stateModules,
      nodes: stateFormNodes,
      sourcePointersByNodeId: args.sourcePointersByNodeId,
    }),
    attachments: [],
    local_returns: localReturns,
    local_returns_count: localReturns.length,
    summary: args.stateSummary,
    mapping_index: buildMappingIndex(stateNodes, args.sourcePointersByNodeId),
  };
}

function buildSubmissionPackageIr(args: {
  readonly canonicalReturn: CanonicalReturnEnvelope;
  readonly coreEngineResult: CoreEngineResult;
  readonly federalReturn: FederalReturnIR;
  readonly stateReturns: ReadonlyArray<StateReturnIR>;
}): SubmissionPackageIR {
  const efile = asRecord(args.canonicalReturn.efile);
  const partner = asRecord(efile?.partner);
  const binaryArtifacts = [
    ...args.federalReturn.attachments,
    ...args.stateReturns.flatMap((stateReturn) => stateReturn.attachments),
  ];

  return {
    package_id: `package_${args.canonicalReturn.return_id}_${args.canonicalReturn.tax_year}`,
    federal_return_ref: `federal_return_${args.federalReturn.return_id}`,
    state_return_refs: args.stateReturns.map(
      (stateReturn) =>
        `state_return_${stateReturn.state_code.toLowerCase()}_${args.canonicalReturn.return_id}`,
    ),
    submission_mode: deriveSubmissionMode(
      args.canonicalReturn.requested_jurisdictions,
      args.stateReturns,
    ),
    binary_artifacts: binaryArtifacts,
    partner_metadata: {
      partner_name: asString(partner?.partner_name),
      adapter_version: asString(partner?.adapter_version),
      environment: asString(partner?.environment),
      requested_state_codes: args.canonicalReturn.requested_jurisdictions.states,
    },
    idempotency_key: `submission:${args.canonicalReturn.return_id}:${args.coreEngineResult.graph.graph_id}`,
  };
}

export function buildTy2025ReturnIr(
  canonicalReturn: CanonicalReturnEnvelope,
  coreEngineResult: CoreEngineResult,
): Ty2025ReturnIrBundle {
  const sourcePointersByNodeId = buildSourcePointersByNode(
    coreEngineResult.graph.nodes,
    coreEngineResult.graph.edges,
  );
  const federalReturn = buildFederalReturnIr(
    canonicalReturn,
    coreEngineResult,
    sourcePointersByNodeId,
  );
  const stateReturns = coreEngineResult.state_summaries.map((stateSummary) =>
    buildStateReturnIr({
      canonicalReturn,
      coreEngineResult,
      stateSummary,
      sourcePointersByNodeId,
    }),
  );

  return {
    federal_return: federalReturn,
    state_returns: stateReturns,
    submission_package: buildSubmissionPackageIr({
      canonicalReturn,
      coreEngineResult,
      federalReturn,
      stateReturns,
    }),
  };
}

export function evaluateTy2025CoreEnginePipelineFromEnvelope(
  canonicalReturn: CanonicalReturnEnvelope,
): Effect.Effect<Ty2025CoreEnginePipelineResult, TaxEngineCoreError> {
  return Effect.map(evaluateTy2025CoreEngineFromEnvelope(canonicalReturn), (coreEngineResult) => ({
    core_engine: coreEngineResult,
    return_ir: buildTy2025ReturnIr(canonicalReturn, coreEngineResult),
  }));
}

export function evaluateTy2025CoreEnginePipeline(
  input: unknown,
): Effect.Effect<Ty2025CoreEnginePipelineResult, TaxEngineCoreError> {
  return Effect.flatMap(parseCanonicalReturnEnvelopeEffect(input), evaluateTy2025CoreEnginePipelineFromEnvelope);
}

export {
  RequestedJurisdictionsSchema,
};
