![TaxZilla logo](./logo.jpeg)

# TaxZilla CLI

Local-first terminal interface and public workspace for the TaxZilla TY2025 tax engine.

## Important

- This project has not been reviewed, approved, or vetted by CPAs, EAs, tax attorneys, or other tax professionals.
- Treat it as experimental software and use it at your own risk.
- It is not tax advice, legal advice, or an IRS product.
- The CLI does not submit returns and does not connect to IRS or state e-file systems.
- A passing test suite does not mean a real return is correct or ready to file.

If you use this with real taxpayer data or for a real filing decision, you are responsible for reviewing every input and every output yourself.

## Local Data And Storage

- Session data is stored locally on disk.
- By default, sessions live under `.taxzilla/returns/<return-id>/`.
- `canonical-return.json` is the source of truth.
- The TUI edits in memory and writes back to `canonical-return.json` on save.
- `run` and `export` write local artifacts next to the canonical return.
- This repo does not provide cloud sync, hosted storage, encryption, secret management, or remote backups for your local files.
- Do not commit real taxpayer data.

## Quick Start

```bash
bun install
bun run dev
bun run cli -- help
```

Common commands:

```bash
bun run cli -- init --session-dir ./.taxzilla/returns/demo --state CA
bun run cli -- validate --input ./.taxzilla/returns/demo
bun run cli -- run --input ./.taxzilla/returns/demo
bun run cli -- export --input ./.taxzilla/returns/demo
```

## How It Works

The runtime pipeline is:

```text
canonical-return.json -> core engine graph -> return IR -> local artifacts
```

### 1. Canonical return

The CLI starts from a canonical JSON envelope. That file holds the household, source documents, requested jurisdictions, elections, payments, e-file context, and any state return payloads.

The TUI does not keep a separate database. It loads `canonical-return.json` into draft objects, lets you edit those drafts, and writes the canonical JSON back to disk when you save.

### 2. Core engine graph

The tax engine evaluates the canonical return into a deterministic forms graph.

- Modules are the smallest calculation units, such as federal Form 1040, schedules, credits, and state plugin layers.
- Nodes are typed values in the graph, including input nodes, calculation nodes, line nodes, summary nodes, bridge nodes, and validation results.
- Edges describe why one node depends on another.

In practice, the engine does three important things:

1. Activates the right federal modules and state plugins for the current return.
2. Materializes input nodes that point back to the canonical return through JSON pointers.
3. Computes derived values, final line values, summaries, and validation messages as graph outputs.

That graph-first approach makes the output easier to explain and inspect. `tax-lines.csv` is essentially a flattened view of graph nodes, including jurisdiction, module, form code, line code, node ID, and source JSON pointers.

### 3. Federal and state layering

Federal logic and state logic are year-scoped and jurisdiction-aware.

- Federal TY2025 logic lives under `packages/tax-engine/src/core-engine/federal/ty2025`.
- State logic lives under `packages/tax-engine/src/core-engine/states/<state>/ty2025`.
- State returns are built from explicit state modules, with federal-to-state bridge nodes where a state starts from a computed federal line instead of raw facts.

The engine currently includes state artifact builders for all 50 U.S. states. District of Columbia and U.S. territories are not included in that list.

### 4. Return IR and artifacts

After graph evaluation, the engine builds a return-oriented intermediate representation.

- `return-ir.json` contains filing-shaped data for federal and state returns.
- `submission-package.json` contains a local submission package artifact derived from that IR.
- The public CLI generates these as local files only. It does not transmit them anywhere.

## Files On Disk

Typical session layout:

```text
.taxzilla/
  returns/
    <return-id>/
      canonical-return.json
      tax-summary.json
      tax-lines.csv
      return-ir.json
      submission-package.json
      export-manifest.json
```

Notes:

- `canonical-return.json` exists as soon as you run `init` or create a session in the TUI.
- `tax-summary.json`, `tax-lines.csv`, `return-ir.json`, and `export-manifest.json` are written by `run` or `export`.
- `submission-package.json` is written by `export`, or by `run` if that format is included in the requested export set.
- If you pass a standalone canonical JSON file instead of a session directory, `run` and `export` can write to a separate `--output-dir`.

## What This Repo Contains

- `apps/cli`: the Bun + OpenTUI terminal application.
- `packages/tax-engine`: the TY2025 graph-based tax engine library.
- `packages/tax-engine/docs/tax_engine_blueprint_ty2025`: package-local blueprint docs, schemas, and examples that describe the engine contracts.
- `docs/tax-engine-cli-plan.md`: CLI planning notes.

## Current Scope

- TY2025 only.
- Commands: `tui`, `help`, `init`, `validate`, `run`, `export`.
- Filing statuses: `single`, `married_filing_jointly`, `married_filing_separately`, `head_of_household`, `qualifying_surviving_spouse`.
- `init` accepts repeated or comma-separated `--state` USPS codes.
- `validate` reports requested states and state return payload counts.
- `run` and `export` include state-aware summaries and graph artifacts when state returns are present.

Current CLI document editors include:

- W-2
- 1099-INT
- 1099-DIV
- 1099-R
- 1099-B
- 1099-G
- SSA-1099
- 1098
- 1098-E
- 1098-T
- 1095-A
- 1099-NEC
- 1099-MISC

The engine also covers a broader TY2025 federal module set, including Form 1040, Schedules 1/2/3/A/B/C/D/E/SE, Forms 2441, 5695, 8812, 8863, 8889, 8949, 8959, 8960, 8962, and 8995.

## What This Repo Does Not Promise

- No professional tax review.
- No legal review.
- No guarantee of accuracy, completeness, or filing readiness.
- No guarantee of IRS or state acceptance.
- No electronic filing transmission.
- No hosted API or cloud storage.
- No OCR or document-ingestion pipeline in the public CLI.

## Recommended Usage

- Start with scrubbed or synthetic data.
- Read `canonical-return.json` directly if you want to inspect the source of truth.
- Review `tax-summary.json`, `tax-lines.csv`, and `return-ir.json` before trusting any result.
- Treat validation failures and warnings as blockers.
- Plan on independent review before relying on output for a real person or a real filing.

## Development

```bash
bun run build
bun run typecheck
bun run lint
bun run test
bun run test:coverage
```

## Publishing

- `packages/tax-engine` publishes as `@taxzilla/tax-engine`.
- `apps/cli` publishes as `@taxzilla/cli`.
- Bump package versions in both workspace package manifests before a release.
- Push `main`, then run `.github/workflows/publish.yml` from GitHub Actions.
- npm trusted publishing is configured for this repo.
