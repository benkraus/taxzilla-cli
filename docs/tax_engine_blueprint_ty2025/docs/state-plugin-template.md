# State Plugin Template

Use this template to convert each entry in `registry/states-registry-ty2025.json` into a real implementation.

The plugin boundary should be narrow and stable. A state plugin is responsible for:

1. declaring what extra facts it needs,
2. computing state-specific forms/worksheets from the federal bridge nodes and canonical facts,
3. validating filing readiness,
4. mapping state outputs into the state XML package,
5. translating state rejects back into canonical facts and UI fixes.

---

## 1. Recommended plugin structure

```text
states/<state_code_lower>/2025/
  manifest.json
  fact_requirements.py
  activation.py
  calculations/
    starting_point.py
    additions.py
    subtractions.py
    deductions.py
    credits.py
    payments.py
    local.py
    summary.py
  validations/
    precompute.py
    prexml.py
    postack.py
  xml/
    mapper.py
    serializer.py
    attachment_rules.py
  reject_mapping.py
  tests/
```

---

## 2. Manifest responsibilities

The manifest is the contract between:
- the orchestration layer,
- the forms graph runtime,
- the XML compiler,
- the partner adapter.

Fields you must fill in for a real plugin:

- `plugin_manifest_id`
- `state_code`
- `state_name`
- `implementation_class`
- `version`
- `status`
- `requires_federal_return`
- `supports_return_kinds`
- `starting_point_strategy`
- `required_fact_namespaces`
- `form_catalog`
- `xml_package`
- `validation_bundles`
- `attachments_policy`
- `capabilities`

For the JSON format, see:
- `schema/state-plugin-manifest.schema.json`

---

## 3. Runtime interface

Recommended runtime interface:

```python
class StatePlugin:
    manifest: StatePluginManifest

    def collect_required_facts(self, canonical_return) -> list[str]:
        ...

    def activate_modules(self, canonical_return, federal_graph) -> list[str]:
        ...

    def compute(self, canonical_return, federal_graph) -> dict:
        """Return state graph nodes / summaries / worksheet values."""
        ...

    def validate_prexml(self, canonical_return, state_graph) -> list[ValidationResult]:
        ...

    def build_ir(self, canonical_return, federal_graph, state_graph) -> StateReturnIR:
        ...

    def emit_xml(self, state_ir, target_version) -> XmlArtifact:
        ...

    def map_reject(self, reject_payload, mapping_index) -> RejectFix:
        ...
```

---

## 4. Fact collection pattern

Every state plugin should explicitly declare the namespaces it needs.

Examples:
- residency periods
- county/city/locality codes
- state-specific additions and subtractions
- credits tied to state definitions
- taxpayer county of residence and county of employment
- state extension payment references

Do not let the state plugin scrape arbitrary facts from the canonical model at runtime. Declare them first.

---

## 5. Starting point pattern

States generally fall into one of four starting-point models:

- `federal_agi`
- `federal_taxable_income`
- `none`
- `custom`

Your plugin should always create a bridge node first, even if the state uses `none` and starts from state-only data.

Example:
- `CA.starting_point.federal_agi`
- `NY.starting_point.federal_agi`
- `PA.starting_point.custom_income_classes`

---

## 6. State calculation layers

Implement each layer separately.

### 6.1 Starting point
Pull the federal carryover line or establish the independent base.

### 6.2 Additions and subtractions
Map state-specific modifications as named items with:
- code
- description
- amount
- source refs

### 6.3 Deductions / exemptions
States vary widely here. Keep deduction logic isolated from additions/subtractions.

### 6.4 Credits
Separate refundable and nonrefundable credits in your internal representation even if the state form merges them later.

### 6.5 Payments / withholding
Keep state withholding and estimated payments in their own module. They are frequent reject sources.

### 6.6 Local jurisdictions
Do not jam local logic into the main state summary. Use a dedicated `local` module layer.

### 6.7 Summary
Produce:
- total tax
- total payments
- refund
- amount owed
- XML-ready summary values

---

## 7. Validation bundles

Use at least three validation phases.

### Precompute
Examples:
- unsupported residency type
- required locality code missing
- county mismatch
- return kind not supported by current plugin version

### Pre-XML
Examples:
- required state form not materialized
- missing attachment
- missing bridge node
- state-specific fact bag incomplete

### Post-ack
Examples:
- reject code normalization
- required user correction path missing
- partner returned an unknown state rule code

---

## 8. XML mapper rules

A state plugin should never serialize directly from the canonical return.

The only acceptable path is:

`canonical facts -> federal bridge -> state graph -> StateReturnIR -> state XML`

This keeps state filing logic aligned with the federal calculation snapshot used for filing.

---

## 9. Reject mapping rules

Each state plugin should maintain a reject map that can answer:

- what state rule/code failed,
- what XML element failed,
- what graph node produced that element,
- what canonical fact should be edited,
- what user message should appear.

Recommended internal reject shape:

```json
{
  "code": "STATE_RULE_X",
  "message": "Human-readable explanation",
  "xml_path": "/Return/ResidentCountyCode",
  "graph_node_id": "CA.local.county_code",
  "canonical_pointer": "/state_returns/CA/plugin_fact_bag/county_code",
  "fix_ui_hint": "ask_county_of_residence"
}
```

---

## 10. No-income-tax states

For states without a broad individual income tax, keep a lightweight plugin instead of deleting the state.

Typical responsibilities may still include:
- resident profile tracking,
- extension/payment exceptions,
- local jurisdiction handling,
- informational filing logic.

That is why the registry includes explicit stub entries instead of omitting those states.

---

## 11. Minimum test matrix per state

Before marking a plugin `ready_for_internal_test`, require at least:

- resident return
- part-year return
- nonresident return (if supported)
- joint return (if supported)
- state withholding only
- estimated payment case
- extension payment case
- reject round-trip case
- local jurisdiction case (if supported)

---

## 12. Promotion criteria

Recommended promotion ladder:

- `stub`
- `in_development`
- `ready_for_internal_test`
- `ats_ready`
- `production_candidate`

Do not promote a plugin just because calculations look right. Promotion requires:
- XML emission,
- validation bundles,
- reject mapping,
- snapshot tests,
- partner validation pass.

---

## 13. Implementation note

`plugin_fact_bag` is the sanctioned escape hatch.

Use namespaced keys:
- `CA.schedule_ca.additions`
- `NY.it201.allocations`
- `PA.class_income_interest`
- `OH.school_district.code`

This lets you keep the canonical schema stable while still supporting state nuance.
