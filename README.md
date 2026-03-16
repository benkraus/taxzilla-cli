# TaxZilla CLI

Local-first terminal interface and public workspace for the TaxZilla TY2025 tax engine.

## WARNING. READ THIS FIRST.

- THIS SOFTWARE HAS NOT BEEN REVIEWED, APPROVED, OR VETTED BY CPAS, EAS, TAX ATTORNEYS, OR ANY OTHER TAX PROFESSIONALS.
- THIS SOFTWARE IS EXPERIMENTAL.
- THIS SOFTWARE IS NOT TAX ADVICE.
- THIS SOFTWARE IS NOT LEGAL ADVICE.
- THIS SOFTWARE IS NOT AN IRS PRODUCT.
- THIS SOFTWARE IS NOT A CERTIFIED E-FILE SYSTEM.
- THIS SOFTWARE IS NOT AUTHORIZED TO SUBMIT RETURNS ON YOUR BEHALF.
- USE THIS SOFTWARE AT YOUR OWN RISK.
- YOU ARE RESPONSIBLE FOR REVIEWING EVERY INPUT, EVERY OUTPUT, EVERY LINE, EVERY FORM, EVERY CREDIT, EVERY PAYMENT, EVERY ELECTION, AND EVERY FILING DECISION.
- DO NOT ASSUME A PASSING TEST SUITE MEANS A REAL RETURN IS CORRECT.
- DO NOT ASSUME A GENERATED NUMBER IS CORRECT JUST BECAUSE THE ENGINE PRODUCED IT.
- DO NOT USE THIS REPOSITORY AS A SUBSTITUTE FOR PROFESSIONAL TAX REVIEW.
- NO WARRANTY. NO GUARANTEE OF ACCURACY. NO GUARANTEE OF COMPLETENESS. NO GUARANTEE OF FITNESS FOR ANY PURPOSE. NO GUARANTEE OF COMPLIANCE WITH FEDERAL, STATE, OR LOCAL TAX LAW.

If you use this repository with real taxpayer data or for a real filing decision, that is your responsibility.

## LOCAL DATA, PRIVACY, AND OPERATIONAL RISK

- THIS CLI STORES RETURN DATA LOCALLY.
- By default, sessions live under `.taxzilla/returns/<returnId>/`.
- The source of truth is `canonical-return.json`.
- The TUI rewrites that file on save.
- `run` and `export` can also write or overwrite local artifacts in the session directory.
- Generated artifacts can include tax return data, line-by-line values, payment context, signer context, and local paths to generated files.
- If you enter names, dates of birth, email addresses, phone numbers, tax ID tokens, last-4 values, bank information, signature information, or prior-year AGI, those values are stored in local JSON files on your machine.
- THIS CLI DOES NOT PROVIDE CLOUD SYNC.
- THIS CLI DOES NOT PROVIDE HOSTED STORAGE.
- THIS CLI DOES NOT PROVIDE ENCRYPTION OR SECRET MANAGEMENT FOR YOUR LOCAL FILES.
- THIS CLI DOES NOT PROVIDE A REMOTE BACKUP SERVICE.
- If your machine, shell history, backups, synced folders, screenshots, logs, or repo checkout are compromised, your tax data may be exposed.
- DO NOT COMMIT REAL TAXPAYER DATA.
- DO NOT DROP REAL TAXPAYER DATA INTO A SHARED REPO, SHARED FOLDER, OR CLOUD-SYNCED WORKSPACE UNLESS YOU FULLY UNDERSTAND THE CONSEQUENCES.
- The TUI is not autosave-on-every-keystroke. `Ctrl+S` saves, and `Ctrl+R` / `Ctrl+E` save before compute or export, but `Esc` or `Ctrl+C` exits without a save prompt.

## What This Repo Contains

- `apps/cli`: the Bun/OpenTUI terminal application.
- `packages/tax-engine`: the TY2025 tax engine library.
- `packages/tax-engine/docs/tax_engine_blueprint_ty2025`: the package-local blueprint bundle, schemas, examples, and reference docs that the engine imports and publishes with.
- `docs/tax-engine-cli-plan.md`: CLI planning notes.

## Quick Start

```bash
bun install
bun run dev
bun run cli -- help
```

Common examples:

```bash
bun run cli -- init --session-dir ./.taxzilla/returns/demo
bun run cli -- validate --input ./.taxzilla/returns/demo
bun run cli -- run --input ./.taxzilla/returns/demo
bun run cli -- export --input ./.taxzilla/returns/demo
```

## CLI Surface

Supported commands:

- `tui`
- `help`
- `init`
- `validate`
- `run`
- `export`

Important command behavior:

- `init` creates a starter TY2025 federal canonical return.
- `init` accepts either `--session-dir` or `--output`, not both.
- `validate --input <path>` accepts either a canonical JSON file or a session directory.
- `run --input <path>` evaluates the local engine and writes `summary-json`, `line-csv`, and `return-ir-json` by default.
- `export --input <path>` writes `canonical-json`, `summary-json`, `line-csv`, `return-ir-json`, and `package-json` by default.
- If your input is a standalone canonical JSON file instead of a session directory, `run` and `export` need `--output-dir` when multiple formats are requested.
- `export` defaults include `canonical-json`, so exporting into a session directory rewrites `canonical-return.json`.

CLI export artifacts:

- `federal-summary.json`
- `federal-lines.csv`
- `canonical-return.json`
- `return-ir.json`
- `submission-package.json`
- `export-manifest.json`

`submission-package.json` is a locally generated JSON artifact. It is NOT a network submission. The CLI does not transmit it anywhere.

## HARD BOUNDARIES OF THE CURRENT CLI

- FEDERAL ONLY.
- TY2025 ONLY.
- The CLI explicitly rejects canonical returns that already contain state requests or state return payloads.
- There is no `submit`, `upload`, `efile`, or `transmit` command.
- There is no outbound HTTP or cloud transport path in the CLI execution path.
- There is no PDF OCR or scan ingestion command in the public CLI.
- This is a local computation and artifact-generation tool, not a hosted tax platform.

Supported federal filing statuses in the CLI:

- `single`
- `married_filing_jointly`
- `married_filing_separately`
- `head_of_household`
- `qualifying_surviving_spouse`

## What The Tax Engine Currently Covers

### Tax year

- TY2025 only.

### Federal modules in the current codebase

Core-labeled modules in the TY2025 federal module catalog:

- Form 1040
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

Phase-2-labeled modules that are also present in the current codebase:

- Schedule 2
- Schedule E
- Form 5695
- Form 8959
- Form 8960
- Form 8995

The engine also exposes:

- a forms graph snapshot,
- a federal summary object,
- state summary objects when used as a library with state returns enabled,
- a return IR bundle,
- a local submission-package IR artifact.

### Federal calculations visible in the current summary surface

The federal summary type currently includes logic and outputs for:

- wages,
- taxable interest,
- tax-exempt interest,
- ordinary dividends,
- qualified dividends,
- IRA distributions,
- pension and annuity distributions,
- Social Security benefits,
- capital gain or loss,
- other income,
- total income,
- adjustments,
- AGI,
- standard deduction vs itemized deduction selection,
- taxable income,
- regular income tax,
- other taxes,
- total tax,
- federal withholding,
- estimated and extension payments,
- earned income credit,
- child tax credit / credit for other dependents,
- additional child tax credit,
- child and dependent care credit,
- education credits,
- premium tax credit reconciliation,
- self-employment tax,
- self-employment tax deduction,
- Additional Medicare Tax,
- Net Investment Income Tax,
- Schedule D special-rate gain handling,
- refund amount,
- amount owed.

### Input forms and document types in the current CLI path

Dedicated editors in the public CLI:

- W-2
- 1099-INT
- 1099-DIV
- 1099-R

Supplemental editors in the public CLI:

- 1099-B
- 1099-G
- SSA-1099
- 1098
- 1098-E
- 1098-T
- 1095-A
- 1099-NEC
- 1099-MISC

The supplemental JSON path also supports:

- household supplement editing,
- additional source document records,
- supplemental income facts,
- supplemental federal withholding rows,
- adjustments,
- itemized deductions,
- credits,
- health coverage data,
- federal override bags,
- election data.

### State support in the engine library

The engine library contains state artifact builders for all 50 states:

- `AL`, `AK`, `AZ`, `AR`, `CA`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `ID`, `IL`, `IN`, `IA`, `KS`, `KY`, `LA`, `ME`, `MD`, `MA`, `MI`, `MN`, `MS`, `MO`, `MT`, `NE`, `NV`, `NH`, `NJ`, `NM`, `NY`, `NC`, `ND`, `OH`, `OK`, `OR`, `PA`, `RI`, `SC`, `SD`, `TN`, `TX`, `UT`, `VT`, `VA`, `WA`, `WV`, `WI`, `WY`

Important caveat:

- THE PUBLIC CLI DOES NOT EXPOSE STATE PREPARATION. IT REJECTS STATE DATA AND FORCES FEDERAL-ONLY INPUTS.
- The presence of state builders in the library is NOT a representation of professional review, legal sign-off, production readiness, or filing readiness.
- District of Columbia and U.S. territories are not part of that state builder list.

## What Is Present In Schemas Or Blueprint Docs But NOT Claimed As End-To-End CLI Support

The blueprint bundle and canonical schema reference additional federal document types such as:

- W-2G
- 1099-K
- 1099-SA
- 5498-SA
- 1099-Q
- Schedule K-1
- `OTHER_FEDERAL_DOCUMENT`

This README does NOT claim that those are all wired through the public CLI as polished, end-to-end, production-safe workflows. Some are typed in schema or design docs without a corresponding public CLI editing or export story.

## Known Sharp Edges And Explicit Non-Guarantees

- Some 1099-MISC categories still need explicit classification overrides or future dedicated modules. When they are unsupported, the engine can exclude them from Schedule 1 and Schedule C outputs.
- Some 1099-MISC rents and royalties need a unique Schedule E match or explicit overrides before you should trust Schedule E totals.
- Some 1099-NEC rows may be inferred onto a sole Schedule C business when an explicit link is missing.
- Some unlinked 1099-NEC rows can be routed to Schedule 1 line 8j instead of Schedule C.
- Some retirement distributions can fall back to treating gross amounts as taxable when an explicit taxable amount is missing.
- Some Schedule E losses require explicit limitation overrides before you should rely on the result.
- Some Schedule D special cases require explicit extension values before you should rely on the output.
- The blueprint bundle itself says it is a strong starting point, NOT a production certification package.
- Tests exercise a lot of behavior, but tests are not legal review, compliance review, or tax professional sign-off.

## Publishing

- `packages/tax-engine` publishes as `@taxzilla/tax-engine`.
- `apps/cli` publishes as `@taxzilla/cli`.
- Bump package versions in both workspace `package.json` files before a release.
- Push `main`, then run `.github/workflows/publish.yml` from GitHub Actions.
- Configure npm trusted publishing for this repo and this exact workflow file, or add an `NPM_TOKEN` GitHub Actions secret as a fallback.

## What This Repo Does NOT Promise

- NO TAX PROFESSIONAL REVIEW.
- NO LEGAL REVIEW.
- NO CPA SIGN-OFF.
- NO EA SIGN-OFF.
- NO GUARANTEE OF IRS ACCEPTANCE.
- NO GUARANTEE OF STATE ACCEPTANCE.
- NO GUARANTEE THAT A GENERATED RETURN IS READY TO FILE.
- NO GUARANTEE THAT EVERY EDGE CASE, EXCEPTION, OR JURISDICTION RULE IS HANDLED.
- NO GUARANTEE THAT THE CLI COVERS EVERY FORM NAMED IN THE BLUEPRINT.
- NO GUARANTEE THAT THE LIBRARY'S STATE CODE SHOULD BE USED FOR A LIVE FILING WORKFLOW WITHOUT INDEPENDENT REVIEW.
- NO ELECTRONIC FILING TRANSMISSION.
- NO HOSTED API.
- NO CLOUD STORAGE.
- NO MULTI-USER SAFETY MODEL.

## Recommended Safe Usage

- Use scrubbed or synthetic data first.
- Keep this checkout on a machine and disk you trust.
- Read `canonical-return.json` directly.
- Review `federal-summary.json`, `federal-lines.csv`, and `return-ir.json` before trusting anything.
- Treat warnings and failed validation messages as blockers, not decoration.
- Assume you need independent review before relying on any output for a real person or a real filing.

## Dev Commands

```bash
bun run build
bun run typecheck
bun run lint
bun run test
bun run test:coverage
```
