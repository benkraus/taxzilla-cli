# XML Compiler Architecture for TY2025 Federal + State Filing

## 1. Goal

Convert deterministic graph outputs into transmission-ready filing artifacts for a **filing-only partner**.

The compiler pipeline should take this shape:

`Canonical facts -> Forms graph -> Return IR -> Typed XML objects -> Serialized XML -> Submission package -> Partner adapter`

Do not compile XML directly from raw facts.

---

## 2. Layered architecture

## Layer A: Canonical return record
Source of truth for:
- household,
- documents,
- normalized facts,
- elections,
- evidence,
- e-file context.

Schema file:
- `schema/taxfacts-ty2025.schema.json`

## Layer B: Forms graph
Deterministic line-by-line calculation graph:
- federal modules,
- state plugins,
- validation nodes,
- bridge nodes.

Schema file:
- `schema/forms-graph.snapshot.schema.json`

## Layer C: Return IR
An engine-owned intermediate representation shaped for filing output but not tied 1:1 to the IRS XML class model.

Recommended IR objects:
- `FederalReturnIR`
- `StateReturnIR`
- `AttachmentIR`
- `SubmissionPackageIR`

IR is where you:
- flatten graph outputs,
- resolve line aliases,
- choose attachment semantics,
- preserve reverse mappings for rejects.

## Layer D: Typed XML object model
Generated from official XSDs when practical.

Recommended strategy:
- generate code from IRS TY2025 XSDs for each released production version you need,
- generate separate packages per state schema bundle,
- wrap generated types behind your own mapper layer.

Do not let generated classes leak throughout the application.

## Layer E: Serializer
Turns typed XML objects into:
- federal XML,
- state XML,
- manifests,
- attachment references.

## Layer F: Package composer
Builds the final payload expected by your filing-only partner.

For MeF-style composition, preserve explicit artifact IDs for:
- return XML,
- attachment bundles,
- manifests,
- rendered PDFs,
- validation reports.

## Layer G: Partner adapter
Handles:
- capability negotiation,
- validation request,
- submission request,
- acknowledgement polling/webhooks,
- reject normalization,
- resubmission.

---

## 3. Why you need a Return IR

If you map graph nodes straight into XSD-generated classes, you will create brittle code.

Use Return IR to:
- normalize multiple graph nodes into one filing concept,
- keep line-level provenance,
- encode partner-specific overlays without polluting the graph,
- survive IRS/state schema version changes with minimal blast radius.

### Example

The graph may contain:
- `federal.form1040.line11_agi`
- `federal.schedule_b.line2_taxable_interest`
- `federal.form8962.line24_ptc`

The `FederalReturnIR` should express:
- summary totals,
- required schedules,
- binary attachment references,
- signature context,
- mapping metadata.

---

## 4. IR object recommendations

## 4.1 FederalReturnIR
Suggested fields:

- `return_id`
- `tax_year`
- `schema_version`
- `xml_target_version`
- `filing_status`
- `primary_taxpayer`
- `spouse`
- `dependents`
- `forms`
- `schedules`
- `worksheets`
- `attachments`
- `signature_context`
- `payment_context`
- `mapping_index`

### `mapping_index`
This is the most important field operationally.

It should map each emitted XML target back to:
- graph node ID,
- canonical JSON Pointer(s),
- human label,
- jurisdiction,
- form code,
- line code.

Without this, reject remediation will be painful.

## 4.2 StateReturnIR
Suggested fields:

- `state_code`
- `tax_year`
- `plugin_manifest_id`
- `xml_target_version`
- `return_kind`
- `starting_point_source`
- `forms`
- `attachments`
- `local_returns`
- `mapping_index`

## 4.3 SubmissionPackageIR
Suggested fields:

- `package_id`
- `federal_return_ref`
- `state_return_refs`
- `submission_mode` (`federal_only`, `state_only`, `federal_and_state_bundle`)
- `binary_artifacts`
- `partner_metadata`
- `idempotency_key`

---

## 5. Versioning strategy

Version at four layers, not one:

1. tax year version
2. jurisdiction schema package version
3. engine mapper version
4. partner overlay version

Recommended directory layout:

```text
compiler/
  schemas/
    irs/
      ty2025/
        v5_0/
        v5_1/
        v5_2/
    states/
      ca/
        ty2025/
          v1/
      ny/
        ty2025/
          v1/
  generated/
    irs/
      ty2025/
        v5_2/
    states/
      ca/
        ty2025/
          v1/
  mappers/
    federal/
      ty2025/
        form1040/
        scheduleB/
        form8962/
    states/
      ca/
        ty2025/
      ny/
        ty2025/
  serializer/
  packaging/
  reject_mapping/
```

---

## 6. Code generation guidance

Generated XSD classes are useful, but they should be isolated.

Recommended rules:
- commit generated code only if reproducibility is painful,
- pin the codegen tool version,
- namespace packages by jurisdiction and schema version,
- wrap generated types with thin adapters so business code never depends on raw generated shapes.

---

## 7. XML mapping pattern

Each mapper should do only one job:

`Graph nodes -> IR field set -> XSD object`

Avoid this anti-pattern:

`Canonical facts -> XSD object`

### Recommended mapper contract

```python
class Federal1040Mapper:
    def map(self, graph_snapshot, canonical_return, target_version) -> FederalReturnIR:
        ...
```

Then:

```python
class FederalXmlEmitter:
    def emit(self, federal_ir, target_version) -> XmlArtifact:
        ...
```

This separation makes it easier to:
- diff IR across versions,
- unit test line logic separately from XML layout,
- inspect output before transmission.

---

## 8. Validation pipeline

Use four gates.

## Gate 1: Canonical schema validation
Validate the JSON instance against:
- `taxfacts-ty2025.schema.json`

## Gate 2: Graph validation
Confirm:
- no dangling dependencies,
- no disabled module output referenced by an enabled node,
- no unresolved choice node,
- no required validation node in fail status.

## Gate 3: IR validation
Confirm:
- all required forms present,
- all required attachment refs present,
- signature context available,
- partner capability overlap exists.

## Gate 4: XML validation
Confirm:
- XSD validation,
- package composition rules,
- engine precheck business rules,
- partner preflight overlays.

Only then produce a submission-ready package.

---

## 9. Package composer design

Even if your partner accepts a simpler API than raw MeF packaging, build your internal package composer as if filing artifacts are first-class.

Recommended package contents:
- one federal XML artifact
- zero or more state XML artifacts
- binary attachment refs
- manifest metadata
- summary metadata
- signing metadata
- reverse mapping index ref

### Composition output should be immutable
Every package should be addressed by:
- `package_id`
- hash
- created timestamp
- graph snapshot ID
- mapper version
- schema package versions

---

## 10. Reject mapping

Your adapter will eventually receive one or more of:
- partner validation errors,
- IRS reject codes,
- state reject codes,
- transmission/package errors.

Normalize them into one internal shape with:
- `code`
- `message`
- `jurisdiction`
- `state_code`
- `field_pointer`
- `xml_path`
- `business_rule_id`
- `severity`
- `fix_hint`

Then use the `mapping_index` to walk backward:
1. XML path -> graph node
2. graph node -> canonical fact pointer
3. canonical fact pointer -> UI widget / question / document field

---

## 11. Attachment strategy

Treat attachments as artifacts, not blobs passed around ad hoc.

Recommended attachment metadata:
- attachment ID
- related jurisdiction
- related form/schedule
- content type
- naming profile
- source document IDs
- storage URI
- hash
- inclusion rule
- paper-followup flag

This matters because federal and states often diverge on attachment expectations.

---

## 12. Signing context

Keep signing context out of line-calculation code.

Recommended signature context fields:
- signature method
- signer person IDs
- PIN tokens / secure refs
- prior-year AGI refs
- signed timestamp
- filing consent artifact ref
- payment authorization artifact ref

This makes it easy to support both:
- self-select PIN, and
- later ERO/practitioner flows if needed.

---

## 13. Testing strategy

## 13.1 Mapper tests
For each supported module:
- canonical facts + graph snapshot in,
- IR out,
- expected field mapping asserted.

## 13.2 XML snapshot tests
For each schema version:
- stable canonical case,
- emitted XML compared to approved snapshot.

## 13.3 XSD validation tests
Run emitted XML against the exact target XSD bundle.

## 13.4 Package composition tests
Confirm:
- manifest completeness,
- attachment ordering,
- state bundling logic,
- hash consistency.

## 13.5 Reject round-trip tests
Inject synthetic rejects and confirm the system maps them back to:
- graph node,
- canonical fact,
- user fix flow.

---

## 14. Operational rules

- Never discard older XML versions mid-season; some jurisdictions overlap.
- Never overwrite a package after submission.
- Never reuse a package ID on resubmission.
- Always log the exact mapper and schema versions used.
- Always persist the reverse mapping index.

---

## 15. Minimum production checklist

Before shipping a jurisdiction/version pair, require:

- schema bundle checked in or otherwise reproducibly pinned
- codegen completed
- mapper coverage
- XML snapshot tests
- validator bundle
- partner validation pass
- reject round-trip test
- change log entry

That is the minimum bar for a filing system you can trust.
