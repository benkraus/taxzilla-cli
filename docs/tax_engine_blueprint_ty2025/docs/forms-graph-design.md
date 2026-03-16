# Forms Graph Design for a TY2025 Consumer Tax Engine

## 1. Why use a forms graph

Treat the engine as a deterministic graph instead of a pile of procedural calculators.

A graph model gives you:

- explicit dependencies between facts, elections, worksheets, and final form lines,
- repeatable recomputation when a single fact changes,
- explainability for every number,
- easier reject remediation because you can map an XML field back to a graph node and then back to a user fact,
- clean handoff from calculation to XML compilation.

The graph should be **year-versioned** and **jurisdiction-aware**.

---

## 2. Core entities

### 2.1 Fact set
The canonical return record lives in `taxfacts-ty2025.schema.json`. The graph does not own source truth for household/document/fact data; it references it with JSON Pointers.

### 2.2 Module
A module is the smallest independently deployable calculation unit.

Examples:
- `federal.form1040.core`
- `federal.schedule_b`
- `federal.form8962`
- `ca.plugin.stub`

Each module owns:
- activation rules,
- node definitions,
- formulas,
- validation rules,
- output mapping hooks.

### 2.3 Node
Nodes are typed computation units.

Recommended node types:

- `input`: direct pointer to canonical facts
- `choice`: election or optimization fork
- `calculation`: internal derived value
- `line`: user-visible form line
- `validation`: rule outcome
- `summary`: jurisdiction totals
- `attachment`: binary/document dependency
- `bridge`: federal-to-state carryover node

### 2.4 Edge
Edges describe why one node depends on another.

Recommended edge types:

- `dependency`
- `condition`
- `derivation`
- `validation`
- `carryforward`

---

## 3. Naming conventions

Use stable names. Do not key logic off human labels.

Recommended convention:

`<jurisdiction>.<module>.<form_or_schedule>.<line_or_semantic_name>`

Examples:
- `federal.form1040.line11_agi`
- `federal.schedule_b.line2_taxable_interest`
- `federal.form8962.line24_ptc`
- `CA.starting_point.federal_agi`
- `CA.form540.line64_withholding`

Node IDs should never change just because a label changed.

---

## 4. Graph evaluation phases

### Phase 1: Activation
Decide which modules are active from facts and elections.

Examples:
- Activate Schedule B if interest or ordinary dividends exceed your threshold logic, or if the filer answers required foreign-account questions.
- Activate Form 8962 if one or more 1095-A policies exist.
- Activate Schedule C if the user has business activity or linked 1099-NEC / 1099-K facts.

### Phase 2: Input node materialization
Create input nodes from canonical facts. These are the only nodes that should point directly at the canonical return JSON.

### Phase 3: Election resolution
Resolve:
- standard vs itemized,
- credit choice conflicts,
- state-specific options,
- optimization forks that the engine is allowed to choose automatically.

Use explicit `choice` nodes for this. Never bury elections inside formulas.

### Phase 4: Deterministic computation
Topologically evaluate all calculation and line nodes.

### Phase 5: Validation
Run:
- fact completeness checks,
- internal consistency checks,
- pre-XML readiness checks,
- partner/transmission-precheck overlays.

### Phase 6: Materialization
Publish:
- summary nodes,
- form-line tables,
- XML IR objects,
- rendered PDFs,
- reject-mapping metadata.

---

## 5. Node contract

Every node should expose at least:

- `node_id`
- `node_type`
- `jurisdiction`
- `module_id`
- `form_code`
- `line_code`
- `data_type`
- `value`
- `formula_ref`
- `source_json_pointers`
- `trace_notes`

Recommended engine-side fields that do not need to be in the public snapshot but should exist internally:

- `version_hash`
- `recompute_cost`
- `cache_key`
- `depends_on_choice_node_ids`
- `line_order`
- `human_explanation_template`
- `xml_mapping_targets`

---

## 6. Formula strategy

Keep formulas outside code where practical.

Recommended pattern:
- formulas live in year-versioned module definitions,
- the evaluator resolves them against a stable expression runtime,
- code is reserved for complex helpers.

Examples of acceptable formula refs:
- `sum(facts.income.wages[*].wages_tips_other_compensation)`
- `max(0, federal.form1040.line11_agi - deduction.selected_amount)`
- `lookup_table(TY2025_tax_brackets, filing_status, taxable_income)`

Examples of logic that should stay in code helpers:
- Social Security taxable benefits worksheets
- Premium Tax Credit reconciliation
- multi-branch state resident/nonresident proration logic
- capital gain worksheet variants
- AMT/QBI special cases

---

## 7. Federal module strategy

Use a thin module catalog as the planner and a deeper implementation directory for formulas and validators.

Suggested initial module groups:

### Core launch modules
- Form 1040 core
- Schedule 1
- Schedule 3
- Schedule A
- Schedule B
- Schedule C
- Schedule D
- Schedule SE
- Form 2441
- Form 8812
- Form 8863
- Form 8889
- Form 8949
- Form 8962

### Phase 2 modules
- Schedule 2
- Schedule E
- Form 5695
- Form 8959
- Form 8960
- Form 8995

Use the catalog file to maintain support tiers without hardcoding them into the evaluator.

---

## 8. State integration pattern

Each state becomes its own module family.

Recommended minimum state module stack:

1. `STATE.starting_point`
2. `STATE.additions_and_subtractions`
3. `STATE.credits`
4. `STATE.payments_and_withholding`
5. `STATE.summary`
6. `STATE.xml_mapper`

Even if a state eventually uses worksheets and schedules, keep these six conceptual layers.

### Federal-to-state bridge nodes
Do not let state modules pull raw federal facts when the state actually starts from a computed federal line.

Instead, create explicit bridge nodes such as:
- `CA.starting_point.federal_agi <- federal.form1040.line11_agi`
- `NY.starting_point.federal_agi <- federal.form1040.line11_agi`

This makes state audits and cross-jurisdiction debugging much easier.

---

## 9. Validation architecture

Use three layers.

### 9.1 Structural validation
Examples:
- missing dependent DOB
- state return enabled but no residency period
- business exists but owner person missing

### 9.2 Computational validation
Examples:
- withholding totals do not reconcile to inputs
- negative values where not allowed
- total payments mismatch

### 9.3 Filing-readiness validation
Examples:
- missing signature context
- missing XML attachment ref
- unsupported state return kind for selected plugin
- partner capability mismatch

Validation nodes should be first-class graph outputs, not side effects.

---

## 10. Explainability

Every user-visible amount should be explainable with:

1. the final line value,
2. the direct parent nodes,
3. the source facts,
4. the source documents / confirmed fields.

An explanation chain for `Form 1040 line 11 AGI` should be reconstructible without rerunning the whole engine.

---

## 11. Recompute model

When a user edits one fact, recompute only the affected subgraph.

Implementation tips:
- keep a reverse-dependency index,
- cache stable module outputs by input hash,
- invalidate downstream state modules whenever a referenced federal bridge node changes.

---

## 12. Persistence model

Store graph snapshots as immutable artifacts.

Recommended write pattern:
- canonical facts mutate by version,
- each compute run produces a new graph snapshot,
- submission packages reference the exact graph snapshot used.

Never file from a graph that is not pinned by artifact ID.

---

## 13. Reject remediation loop

For a filing-only partner, reject handling becomes a graph problem.

Your reject mapper should be able to translate:

`partner reject -> XML path or rule -> graph node -> canonical fact pointer -> user fix screen`

That means every XML target should preserve:
- originating graph node ID,
- originating JSON Pointer(s),
- jurisdiction,
- form code,
- line code.

---

## 14. Directory layout suggestion

```text
engine/
  catalog/
    federal-module-catalog-ty2025.json
  modules/
    federal/
      2025/
        form1040/
        schedule1/
        scheduleA/
        scheduleB/
        scheduleC/
        scheduleD/
        scheduleSE/
        form2441/
        form8812/
        form8863/
        form8889/
        form8949/
        form8962/
    states/
      ca/
        2025/
      ny/
        2025/
      tx/
        2025/
  runtime/
    evaluator/
    dependency_index/
    validation/
    explainability/
  artifacts/
    graph_snapshots/
```

---

## 15. Practical rules

- Never let an LLM create or mutate graph nodes directly.
- Never let XML mapping bypass graph outputs.
- Never compute state returns from raw intake data if the state starts from a federal result.
- Keep every choice explicit.
- Keep every form-line mapping reversible.

---

## 16. What “done” looks like for a module

A module is not done when formulas exist. It is done when it has:

- activation rule
- input contract
- formulas / helper functions
- validation bundle
- explanation templates
- XML mapping targets
- snapshot tests
- reject mapping tests
- change log by tax year
