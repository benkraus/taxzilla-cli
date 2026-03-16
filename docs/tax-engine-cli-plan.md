# Tax Engine CLI Plan

## Goal

Build a federal-only CLI for TY2025 household tax preparation that:

- collects household, document, and filing inputs,
- materializes or edits the canonical return record,
- runs the existing federal tax engine and Return IR pipeline,
- exports filing-oriented artifacts in machine-friendly formats,
- uses OpenTUI for the interactive terminal experience,
- keeps state filing entirely out of scope for the first release.

The CLI should treat the canonical return JSON as the source of truth and follow the existing engine pipeline:

`canonical return -> forms graph -> federal summary + Return IR -> export artifacts`

Do not let the CLI bypass the canonical return or map raw prompts straight to XML.

## Scope Boundary

### In scope for v1

- Federal only
- TY2025 only
- One household per run
- Interactive guided workflow with OpenTUI React
- Non-interactive command mode for automation and fixtures
- Outputs for:
  - tax summary
  - line-level tables
  - canonical return JSON
  - Return IR JSON
  - submission-package JSON

### Explicitly out of scope for v1

- State returns
- IRS XML serialization
- OCR / document parsing
- Partner transmission
- Multi-return portfolio management
- Remote persistence

The repo already has `evaluateTy2025CoreEnginePipeline(...)` and `buildTy2025ReturnIr(...)`, but not a real XML compiler yet. That means the first CLI should export the artifacts needed to feed a later XML layer, not pretend XML exists already.

## Product Shape

Use one executable with two entry styles:

1. Interactive TUI for humans
2. Non-interactive commands for scripts, CI, fixtures, and bulk testing

Both modes must share the same application services:

- canonical return loading and validation
- intake adapters for supported forms
- federal computation
- export formatters
- typed error handling

OpenTUI should only own rendering, keyboard flow, and screen state. Tax logic stays in reusable modules.

## Proposed Workspace Layout

Use a new runnable app at `apps/cli`.

Suggested shape:

```text
apps/cli/
  package.json
  tsconfig.json
  src/
    index.tsx
    cli/
      parse-argv.ts
      command-router.ts
    app/
      interactive-app.tsx
      screens/
      components/
    core/
      session-store.ts
      canonical-return.ts
      federal-intake.ts
      run-pipeline.ts
      exporters/
      errors.ts
      supported-forms.ts
```

The main rule is separation:

- `app/` renders OpenTUI screens
- `core/` is renderer-free and testable with Vitest
- `@taxzilla/tax-engine` remains the source of truth for calculation and Return IR

## Canonical Session Model

The CLI should work on a local session file, not hidden in-memory state.

Recommended primary artifact:

- `./.taxzilla/returns/<return-id>/canonical-return.json`

Optional derived artifacts in the same folder:

- `federal-summary.json`
- `federal-lines.csv`
- `return-ir.json`
- `submission-package.json`
- `export-manifest.json`

Benefits:

- interactive and non-interactive modes operate on the same file
- users can inspect and diff the source of truth
- fixtures are easy to version and test
- later XML generation can read the same directory

## Supported Input Layers

The CLI should support three ways to provide data.

### 1. Household facts

Collect and validate:

- tax year
- filing status
- taxpayer identity
- spouse identity when relevant
- dependents
- mailing / home address
- residency context needed for federal filing metadata
- e-file signature context
- refund / payment details

### 2. Federal document intake

The CLI should model forms as typed document entries that populate both:

- `source_documents`
- normalized `facts`

This keeps provenance intact and matches the canonical return design.

For the first implementation, prioritize the most practical federal forms already typed in the schema and exercised by the engine:

- W-2
- 1099-INT
- 1099-DIV
- 1099-B
- 1099-R
- 1099-G
- 1099-NEC
- 1099-MISC
- 1098
- 1098-E
- 1098-T
- 1095-A
- SSA-1099

Schedule C / Schedule E style entries can be supported as structured fact editors even when the user is not importing a literal IRS document.

### 3. Direct line / fact edits

Some values will not come from a neat form. The CLI should allow direct edits for:

- adjustments
- itemized deductions
- credits
- estimated payments
- extension payments
- prior-year carryovers or election-style fields

These edits should still land in canonical facts, not as opaque CLI-only overrides.

## Interactive TUI

Use OpenTUI React for the guided workflow. A good default is a two-pane layout:

- left: step navigator / document list
- right: editor, review table, or result view
- footer: keyboard shortcuts

Recommended top-level flow:

1. `Start`
2. `Household`
3. `Documents`
4. `Income`
5. `Adjustments`
6. `Deductions`
7. `Credits`
8. `Payments`
9. `E-file`
10. `Review`
11. `Calculate`
12. `Export`

### Screen behavior

`Start`
- create new return
- open existing session
- import canonical return JSON

`Household`
- filing status selector
- taxpayer / spouse / dependent editors
- validation for missing identity fields

`Documents`
- add a supported form type
- edit repeated forms
- delete or duplicate a form
- show document completeness status

`Income`, `Adjustments`, `Deductions`, `Credits`, `Payments`
- structured editors grouped by fact namespace
- summary totals visible while editing
- inline validation errors

`E-file`
- signer details
- prior-year AGI
- refund direct deposit
- direct debit intent

`Review`
- warnings and blocking validation items
- activated federal modules
- form/schedule preview
- trace from key 1040 lines back to source pointers

`Calculate`
- run the shared pipeline
- display refund / amount owed
- show major 1040 line totals
- surface typed errors without crashing the renderer

`Export`
- choose formats
- choose output directory
- write artifacts and show manifest

### OpenTUI interaction model

Use:

- `<select>` for step navigation and form-type selection
- `<input>` for scalar fields
- `<textarea>` for notes or raw JSON import
- `useKeyboard()` for global shortcuts

Recommended shortcuts:

- `tab` / `shift+tab`: next or previous field
- `j` / `k`: move within lists
- `n` / `p`: next or previous workflow step
- `c`: calculate
- `e`: export
- `?`: help
- `esc`: back / dismiss modal
- `ctrl+c`: clean exit through `renderer.destroy()`

## Non-Interactive Commands

The non-interactive mode should make the CLI useful in CI, fixtures, and scripted workflows.

Recommended command set:

### `taxzilla init`

Creates a starter canonical return file.

Example:

```bash
taxzilla init --tax-year 2025 --filing-status single --output ./return.json
```

### `taxzilla import`

Adds or replaces form/fact data inside a canonical return.

Example:

```bash
taxzilla import --input ./return.json --forms ./forms.json
```

`forms.json` should be a typed intake bundle, not arbitrary loose CSV columns.

### `taxzilla edit`

Applies direct JSON Pointer style updates for automation.

Example:

```bash
taxzilla edit \
  --input ./return.json \
  --set /facts/payments/prior_year_overpayment_applied_to_2025=250
```

### `taxzilla validate`

Validates canonical structure and CLI support coverage without computing taxes.

Example:

```bash
taxzilla validate --input ./return.json
```

### `taxzilla run`

Runs the federal engine pipeline and optionally writes artifacts.

Example:

```bash
taxzilla run \
  --input ./return.json \
  --output-dir ./out \
  --format summary-json \
  --format line-csv \
  --format return-ir-json
```

### `taxzilla export`

Reads an already computed canonical return or reruns compute, then writes selected artifacts.

Example:

```bash
taxzilla export \
  --input ./return.json \
  --output-dir ./out \
  --format canonical-json \
  --format return-ir-json \
  --format package-json
```

### `taxzilla tui`

Launches the OpenTUI workflow for the specified session.

Example:

```bash
taxzilla tui --input ./return.json
```

## Output Formats

The output contract should distinguish human-readable summaries from compiler-facing artifacts.

### `summary-json`

High-signal filing summary:

- filing status
- AGI
- taxable income
- total tax
- total payments
- refund amount
- amount owed
- activated schedules/forms

### `line-csv`

One row per computed federal line or node. Suggested columns:

- `jurisdiction`
- `module_id`
- `form_code`
- `line_code`
- `node_id`
- `label`
- `value`
- `data_type`
- `source_json_pointers`

This is the best CSV export for audits and spreadsheet workflows.

### `canonical-json`

The current canonical return record.

### `return-ir-json`

The filing-oriented intermediate representation created by the existing pipeline. This is the main machine artifact for the future XML compiler.

### `package-json`

Submission package metadata derived from Return IR.

### Future `irs-xml`

Do not include this in the first implementation. Add it only after there is a real typed XML layer instead of the current placeholder target versions.

## Shared Application Pipeline

Both TUI and non-interactive mode should call the same service:

1. Load canonical return JSON
2. Force federal-only scope for v1:
   - `requested_jurisdictions.federal = true`
   - `requested_jurisdictions.states = []`
   - reject state-return payloads as unsupported
3. Validate the canonical record
4. Run `evaluateTy2025CoreEnginePipeline(...)`
5. Materialize exporters from:
   - `core_engine`
   - `return_ir`
6. Write artifacts and a manifest

This makes interactive calculation and CI calculation identical.

## Error Model

Stay aligned with repo standards:

- keep transport and command errors typed
- do not throw untyped `Error` values at boundaries
- render actionable validation failures

Error classes should include:

- invalid canonical return
- unsupported form type
- unsupported state data in federal-only mode
- export format not available
- missing required household or e-file fields
- file IO failure

## Testing Strategy

Repo rules require Vitest for unit tests, so the CLI should use Vitest even though some OpenTUI examples use Bun’s test runner.

Recommended split:

- Vitest unit tests for:
  - argument parsing
  - canonical session mutations
  - intake adapters
  - federal-only guardrails
  - pipeline invocation
  - exporters
- Vitest renderer tests for key OpenTUI screens where practical
- Maestro end-to-end flows for:
  - open TUI
  - create simple single-filer return
  - enter W-2 and 1099-INT
  - calculate
  - export JSON / CSV artifacts

The main objective is to keep tax behavior and export behavior independently testable from terminal rendering.

## Recommended Implementation Order

### Phase 1: Commandable federal runner

- scaffold `apps/cli` with OpenTUI React
- add `taxzilla run`, `validate`, and `export`
- support canonical JSON input only
- emit `summary-json`, `line-csv`, and `return-ir-json`

### Phase 2: Local session model

- add `init`
- add local return directory structure
- add manifest writing
- add typed errors and better command UX

### Phase 3: Interactive TUI shell

- add step navigation
- add household editor
- add result and export screens
- support open/resume session

### Phase 4: Federal form intake editors

- W-2
- 1099-INT
- 1099-DIV
- 1099-R
- payments and e-file details

### Phase 5: Broader federal fact coverage

- capital gains
- education
- ACA / 1095-A
- Schedule C / Schedule E inputs

## Default UX Recommendation

Make `taxzilla` launch the TUI when a human runs it without subcommands, but keep all automation on explicit subcommands.

That means:

- `taxzilla` -> interactive workflow
- `taxzilla run ...` -> scriptable compute
- `taxzilla export ...` -> scriptable artifacts

This gives the product both a usable interactive face and a deterministic automation surface.

## Key Design Decision

The CLI is not an alternative tax engine. It is an operator surface over the existing canonical return, federal graph, and Return IR layers.

If a future web app and this CLI disagree, the canonical return and engine pipeline should still produce the same result.
