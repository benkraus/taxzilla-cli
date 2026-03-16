import { Schema } from "effect";

import federalModuleCatalogTy2025Json from "../../../docs/tax_engine_blueprint_ty2025/catalog/federal-module-catalog-ty2025.json" with { type: "json" };
import sampleFormsGraphTy2025Json from "../../../docs/tax_engine_blueprint_ty2025/examples/sample-forms-graph-ty2025.json" with { type: "json" };
import sampleReturnTy2025Json from "../../../docs/tax_engine_blueprint_ty2025/examples/sample-return-ty2025.json" with { type: "json" };
import sampleStatePluginCaTy2025Json from "../../../docs/tax_engine_blueprint_ty2025/examples/sample-state-plugin-CA.stub.json" with { type: "json" };
import statesRegistryTy2025Json from "../../../docs/tax_engine_blueprint_ty2025/registry/states-registry-ty2025.json" with { type: "json" };
import formsGraphSnapshotTy2025JsonSchema from "../../../docs/tax_engine_blueprint_ty2025/schema/forms-graph.snapshot.schema.json" with { type: "json" };
import statePluginManifestTy2025JsonSchema from "../../../docs/tax_engine_blueprint_ty2025/schema/state-plugin-manifest.schema.json" with { type: "json" };
import taxfactsTy2025JsonSchema from "../../../docs/tax_engine_blueprint_ty2025/schema/taxfacts-ty2025.schema.json" with { type: "json" };

export const taxEngineBlueprintRootPath = "docs/tax_engine_blueprint_ty2025" as const;

export const taxEngineBlueprintPaths = {
  root: taxEngineBlueprintRootPath,
  readme: `${taxEngineBlueprintRootPath}/README.md`,
  schemas: {
    canonicalReturn: `${taxEngineBlueprintRootPath}/schema/taxfacts-ty2025.schema.json`,
    formsGraphSnapshot: `${taxEngineBlueprintRootPath}/schema/forms-graph.snapshot.schema.json`,
    statePluginManifest: `${taxEngineBlueprintRootPath}/schema/state-plugin-manifest.schema.json`,
  },
  docs: {
    formsGraphDesign: `${taxEngineBlueprintRootPath}/docs/forms-graph-design.md`,
    xmlCompilerArchitecture: `${taxEngineBlueprintRootPath}/docs/xml-compiler-architecture.md`,
    statePluginTemplate: `${taxEngineBlueprintRootPath}/docs/state-plugin-template.md`,
  },
  catalog: `${taxEngineBlueprintRootPath}/catalog/federal-module-catalog-ty2025.json`,
  registry: `${taxEngineBlueprintRootPath}/registry/states-registry-ty2025.json`,
  examples: {
    canonicalReturn: `${taxEngineBlueprintRootPath}/examples/sample-return-ty2025.json`,
    formsGraph: `${taxEngineBlueprintRootPath}/examples/sample-forms-graph-ty2025.json`,
    californiaPlugin: `${taxEngineBlueprintRootPath}/examples/sample-state-plugin-CA.stub.json`,
  },
  partnerAdapterOpenApi: `${taxEngineBlueprintRootPath}/api/partner-filing-adapter.openapi.yaml`,
} as const;

export const taxEngineBlueprintTy2025Stats = {
  federalModuleCount: federalModuleCatalogTy2025Json.length,
  stateRegistryCount: statesRegistryTy2025Json.length,
} as const;

export const BlueprintTaxYearSchema = Schema.Literal(2025);
export type BlueprintTaxYear = Schema.Schema.Type<typeof BlueprintTaxYearSchema>;

export const FederalModuleSupportTierSchema = Schema.Literal("core", "phase_2");
export type FederalModuleSupportTier = Schema.Schema.Type<typeof FederalModuleSupportTierSchema>;

export const FederalModuleCatalogEntrySchema = Schema.Struct({
  module_id: Schema.String,
  form_code: Schema.String,
  support_tier: FederalModuleSupportTierSchema,
  purpose: Schema.String,
  driven_by_fact_namespaces: Schema.Array(Schema.String),
  produces_lines: Schema.Array(Schema.String),
});
export type FederalModuleCatalogEntry = Schema.Schema.Type<typeof FederalModuleCatalogEntrySchema>;

export const FederalModuleCatalogSchema = Schema.Array(FederalModuleCatalogEntrySchema);
export type FederalModuleCatalog = Schema.Schema.Type<typeof FederalModuleCatalogSchema>;

export const StatePluginImplementationClassSchema = Schema.Literal(
  "income_tax_state_stub",
  "no_individual_income_tax",
  "extension_only",
  "informational_only",
);
export type StatePluginImplementationClass = Schema.Schema.Type<
  typeof StatePluginImplementationClassSchema
>;

export const StatePluginStatusSchema = Schema.Literal(
  "stub",
  "in_development",
  "ready_for_internal_test",
  "ats_ready",
  "production_candidate",
);
export type StatePluginStatus = Schema.Schema.Type<typeof StatePluginStatusSchema>;

export const StateReturnKindSchema = Schema.Literal(
  "resident",
  "part_year_resident",
  "nonresident",
  "extension_only",
  "no_return_required",
  "informational_only",
);
export type StateReturnKind = Schema.Schema.Type<typeof StateReturnKindSchema>;

export const StateStartingPointStrategySchema = Schema.Literal(
  "federal_agi",
  "federal_taxable_income",
  "none",
  "custom",
);
export type StateStartingPointStrategy = Schema.Schema.Type<
  typeof StateStartingPointStrategySchema
>;

export const StatePluginValidationPhaseSchema = Schema.Literal(
  "precompute",
  "postcompute",
  "prexml",
  "pretransmit",
  "postack",
);
export type StatePluginValidationPhase = Schema.Schema.Type<
  typeof StatePluginValidationPhaseSchema
>;

export const StatePluginValidationEngineSchema = Schema.Literal(
  "json_rules",
  "python",
  "sql",
  "partner_overlay",
  "manual_review_gate",
);
export type StatePluginValidationEngine = Schema.Schema.Type<
  typeof StatePluginValidationEngineSchema
>;

export const StateFormCatalogRoleSchema = Schema.Literal(
  "main_return",
  "schedule",
  "worksheet",
  "payment",
  "extension",
  "attachment_cover",
);
export type StateFormCatalogRole = Schema.Schema.Type<typeof StateFormCatalogRoleSchema>;

export const StateFormCatalogEntrySchema = Schema.Struct({
  form_code: Schema.String,
  role: StateFormCatalogRoleSchema,
  xml_root_hint: Schema.String,
  required: Schema.optional(Schema.Boolean),
});
export type StateFormCatalogEntry = Schema.Schema.Type<typeof StateFormCatalogEntrySchema>;

export const StateXmlPackageSchema = Schema.Struct({
  schema_bundle_id: Schema.String,
  serializer_module: Schema.String,
  attachment_naming_profile: Schema.String,
  partner_overrides_module: Schema.optional(Schema.String),
});
export type StateXmlPackage = Schema.Schema.Type<typeof StateXmlPackageSchema>;

export const StateValidationBundleSchema = Schema.Struct({
  bundle_id: Schema.String,
  phase: StatePluginValidationPhaseSchema,
  engine: StatePluginValidationEngineSchema,
  description: Schema.optional(Schema.String),
});
export type StateValidationBundle = Schema.Schema.Type<typeof StateValidationBundleSchema>;

export const StateAttachmentsPolicySchema = Schema.Struct({
  supports_binary_attachments: Schema.Boolean,
  supports_pdf_only: Schema.Boolean,
  paper_followup_possible: Schema.Boolean,
  notes: Schema.optional(Schema.String),
});
export type StateAttachmentsPolicy = Schema.Schema.Type<typeof StateAttachmentsPolicySchema>;

export const StateCapabilitiesSchema = Schema.Struct({
  supports_direct_file: Schema.Boolean,
  supports_joint_return: Schema.Boolean,
  supports_multi_state_credit: Schema.Boolean,
  supports_local_jurisdictions: Schema.Boolean,
});
export type StateCapabilities = Schema.Schema.Type<typeof StateCapabilitiesSchema>;

export const StatePluginManifestSchema = Schema.Struct({
  plugin_manifest_id: Schema.String,
  state_code: Schema.String,
  state_name: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  implementation_class: StatePluginImplementationClassSchema,
  version: Schema.String,
  status: StatePluginStatusSchema,
  requires_federal_return: Schema.Boolean,
  supports_return_kinds: Schema.Array(StateReturnKindSchema),
  starting_point_strategy: StateStartingPointStrategySchema,
  required_fact_namespaces: Schema.Array(Schema.String),
  form_catalog: Schema.Array(StateFormCatalogEntrySchema),
  xml_package: StateXmlPackageSchema,
  validation_bundles: Schema.Array(StateValidationBundleSchema),
  attachments_policy: StateAttachmentsPolicySchema,
  capabilities: StateCapabilitiesSchema,
  notes: Schema.Array(Schema.String),
});
export type StatePluginManifest = Schema.Schema.Type<typeof StatePluginManifestSchema>;

export const StatePluginRegistrySchema = Schema.Array(StatePluginManifestSchema);
export type StatePluginRegistry = Schema.Schema.Type<typeof StatePluginRegistrySchema>;

export const RequestedJurisdictionsSchema = Schema.Struct({
  federal: Schema.Literal(true),
  states: Schema.Array(Schema.String),
});
export type RequestedJurisdictions = Schema.Schema.Type<typeof RequestedJurisdictionsSchema>;

export const CanonicalReturnLifecycleStatusSchema = Schema.Literal(
  "intake",
  "in_review",
  "ready_to_compute",
  "computed",
  "ready_to_file",
  "filed",
  "accepted",
  "rejected",
  "amending",
  "archived",
);
export type CanonicalReturnLifecycleStatus = Schema.Schema.Type<
  typeof CanonicalReturnLifecycleStatusSchema
>;

export const CanonicalReturnLifecycleSchema = Schema.Struct({
  status: CanonicalReturnLifecycleStatusSchema,
  created_at: Schema.String,
  updated_at: Schema.String,
  locked_for_filing: Schema.Boolean,
  current_computation_run_id: Schema.optional(Schema.String),
});
export type CanonicalReturnLifecycle = Schema.Schema.Type<typeof CanonicalReturnLifecycleSchema>;

export const ProvenanceBoundingBoxSchema = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  page: Schema.Number,
});
export type ProvenanceBoundingBox = Schema.Schema.Type<typeof ProvenanceBoundingBoxSchema>;

export const ProvenanceEvidenceSchema = Schema.Struct({
  json_pointer: Schema.String,
  document_id: Schema.String,
  field_key: Schema.String,
  source_page: Schema.Number,
  bounding_box: ProvenanceBoundingBoxSchema,
  acquisition_method: Schema.String,
  confidence: Schema.Number,
  confirmed_by_user: Schema.Boolean,
  confirmed_at: Schema.String,
});
export type ProvenanceEvidence = Schema.Schema.Type<typeof ProvenanceEvidenceSchema>;

export const ProvenanceIndexSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Array(ProvenanceEvidenceSchema),
});
export type ProvenanceIndex = Schema.Schema.Type<typeof ProvenanceIndexSchema>;

// This intentionally models only the stable top-level envelope plus provenance details.
// The inner household, facts, and e-file structures remain `Unknown` until the domain package
// grows deeper coverage without pretending to implement the full canonical schema today.
export const CanonicalReturnEnvelopeSchema = Schema.Struct({
  schema_version: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  processing_year: Schema.Number,
  return_id: Schema.String,
  requested_jurisdictions: RequestedJurisdictionsSchema,
  lifecycle: CanonicalReturnLifecycleSchema,
  household: Schema.Unknown,
  residency_and_nexus: Schema.Unknown,
  source_documents: Schema.Array(Schema.Unknown),
  facts: Schema.Unknown,
  elections: Schema.Unknown,
  state_returns: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  }),
  efile: Schema.Unknown,
  artifacts: Schema.Unknown,
  provenance_index: ProvenanceIndexSchema,
  evidence_log: Schema.Array(Schema.Unknown),
  // The reference sample currently uses an empty array even though the raw JSON Schema describes
  // this as an open-ended object, so keep it broad until the canonical runtime settles.
  extensions: Schema.Unknown,
});
export type CanonicalReturnEnvelope = Schema.Schema.Type<typeof CanonicalReturnEnvelopeSchema>;

export const FormsGraphModuleTypeSchema = Schema.Literal(
  "form",
  "schedule",
  "worksheet",
  "credit",
  "state_plugin",
  "supporting",
);
export type FormsGraphModuleType = Schema.Schema.Type<typeof FormsGraphModuleTypeSchema>;

export const FormsGraphNodeTypeSchema = Schema.Literal(
  "input",
  "choice",
  "calculation",
  "line",
  "validation",
  "summary",
  "attachment",
  "bridge",
);
export type FormsGraphNodeType = Schema.Schema.Type<typeof FormsGraphNodeTypeSchema>;

export const FormsGraphEdgeTypeSchema = Schema.Literal(
  "dependency",
  "condition",
  "derivation",
  "validation",
  "carryforward",
);
export type FormsGraphEdgeType = Schema.Schema.Type<typeof FormsGraphEdgeTypeSchema>;

export const FormsGraphNodeDataTypeSchema = Schema.Literal(
  "money",
  "integer",
  "string",
  "boolean",
  "date",
  "enum",
  "object",
  "array",
  "null",
);
export type FormsGraphNodeDataType = Schema.Schema.Type<typeof FormsGraphNodeDataTypeSchema>;

export const FormsGraphModuleSchema = Schema.Struct({
  module_id: Schema.String,
  jurisdiction: Schema.String,
  module_type: FormsGraphModuleTypeSchema,
  form_code: Schema.optional(Schema.String),
  version: Schema.String,
  enabled: Schema.Boolean,
});
export type FormsGraphModule = Schema.Schema.Type<typeof FormsGraphModuleSchema>;

export const FormsGraphNodeSchema = Schema.Struct({
  node_id: Schema.String,
  node_type: FormsGraphNodeTypeSchema,
  jurisdiction: Schema.String,
  module_id: Schema.String,
  form_code: Schema.optional(Schema.String),
  line_code: Schema.optional(Schema.String),
  label: Schema.String,
  data_type: FormsGraphNodeDataTypeSchema,
  value: Schema.optional(Schema.Unknown),
  formula_ref: Schema.optional(Schema.String),
  source_json_pointers: Schema.optional(Schema.Array(Schema.String)),
  trace_notes: Schema.optional(Schema.String),
});
export type FormsGraphNode = Schema.Schema.Type<typeof FormsGraphNodeSchema>;

export const FormsGraphEdgeSchema = Schema.Struct({
  from_node_id: Schema.String,
  to_node_id: Schema.String,
  edge_type: FormsGraphEdgeTypeSchema,
  condition_ref: Schema.optional(Schema.String),
});
export type FormsGraphEdge = Schema.Schema.Type<typeof FormsGraphEdgeSchema>;

export const FormsGraphValidationSeveritySchema = Schema.Literal("error", "warning", "info");
export type FormsGraphValidationSeverity = Schema.Schema.Type<
  typeof FormsGraphValidationSeveritySchema
>;

export const FormsGraphValidationStatusSchema = Schema.Literal("pass", "fail", "skip");
export type FormsGraphValidationStatus = Schema.Schema.Type<
  typeof FormsGraphValidationStatusSchema
>;

export const FormsGraphValidationResultSchema = Schema.Struct({
  rule_id: Schema.String,
  severity: FormsGraphValidationSeveritySchema,
  status: FormsGraphValidationStatusSchema,
  message: Schema.String,
  node_ids: Schema.optional(Schema.Array(Schema.String)),
});
export type FormsGraphValidationResult = Schema.Schema.Type<
  typeof FormsGraphValidationResultSchema
>;

export const FormsGraphSnapshotSchema = Schema.Struct({
  graph_id: Schema.String,
  tax_year: BlueprintTaxYearSchema,
  created_at: Schema.String,
  jurisdictions: Schema.Array(Schema.String),
  modules: Schema.Array(FormsGraphModuleSchema),
  nodes: Schema.Array(FormsGraphNodeSchema),
  edges: Schema.Array(FormsGraphEdgeSchema),
  execution_order: Schema.Array(Schema.String),
  validation_results: Schema.Array(FormsGraphValidationResultSchema),
  materialized_outputs: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
  ),
});
export type FormsGraphSnapshot = Schema.Schema.Type<typeof FormsGraphSnapshotSchema>;

export const federalModuleCatalogTy2025 =
  federalModuleCatalogTy2025Json as unknown as FederalModuleCatalog;
export const statesRegistryTy2025 = statesRegistryTy2025Json as unknown as StatePluginRegistry;
export const sampleReturnTy2025 = sampleReturnTy2025Json as unknown as CanonicalReturnEnvelope;
export const sampleFormsGraphTy2025 = sampleFormsGraphTy2025Json as unknown as FormsGraphSnapshot;
export const sampleStatePluginCaTy2025 =
  sampleStatePluginCaTy2025Json as unknown as StatePluginManifest;

export {
  formsGraphSnapshotTy2025JsonSchema,
  statePluginManifestTy2025JsonSchema,
  taxfactsTy2025JsonSchema,
};

export const decodeFederalModuleCatalog = Schema.decodeUnknownEither(FederalModuleCatalogSchema);
export const decodeStatePluginRegistry = Schema.decodeUnknownEither(StatePluginRegistrySchema);
export const decodeStatePluginManifest = Schema.decodeUnknownEither(StatePluginManifestSchema);
export const decodeCanonicalReturnEnvelope = Schema.decodeUnknownEither(
  CanonicalReturnEnvelopeSchema,
);
export const decodeFormsGraphSnapshot = Schema.decodeUnknownEither(FormsGraphSnapshotSchema);
