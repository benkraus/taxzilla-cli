# @taxzilla/cli

Bun-powered local-first terminal interface for the TaxZilla TY2025 federal tax engine.

## WARNING

- THIS PACKAGE HAS NOT BEEN REVIEWED, APPROVED, OR VETTED BY CPAS, EAS, TAX ATTORNEYS, OR OTHER TAX PROFESSIONALS.
- THIS PACKAGE IS EXPERIMENTAL.
- THIS PACKAGE IS NOT TAX ADVICE.
- THIS PACKAGE IS NOT LEGAL ADVICE.
- THIS PACKAGE IS NOT AN IRS PRODUCT.
- THIS PACKAGE IS NOT A CERTIFIED E-FILE SYSTEM.
- THIS PACKAGE DOES NOT SUBMIT RETURNS TO THE IRS OR ANY STATE AGENCY.
- USE THIS PACKAGE AT YOUR OWN RISK.
- REVIEW EVERY INPUT, EVERY OUTPUT, EVERY LINE, AND EVERY FILING DECISION YOURSELF.
- NO WARRANTY. NO GUARANTEE OF ACCURACY. NO GUARANTEE OF COMPLETENESS. NO GUARANTEE OF FITNESS FOR ANY PURPOSE.

## Runtime Requirement

- THIS PACKAGE REQUIRES `bun` ON YOUR PATH.
- The published `taxzilla` executable is `#!/usr/bin/env bun`.
- Installing from npm does not remove the Bun runtime requirement.

## Install And Run

```bash
bunx @taxzilla/cli help
bunx @taxzilla/cli init --session-dir ./.taxzilla/returns/demo
bunx @taxzilla/cli validate --input ./.taxzilla/returns/demo
bunx @taxzilla/cli run --input ./.taxzilla/returns/demo
bunx @taxzilla/cli export --input ./.taxzilla/returns/demo
```

Global install also works if `bun` is already installed:

```bash
npm install -g @taxzilla/cli
taxzilla help
```

## Local Storage And Data Handling

- Return data is stored locally on disk.
- By default, sessions live under `.taxzilla/returns/<returnId>/`.
- The source of truth is `canonical-return.json`.
- `run` and `export` write local artifacts next to the canonical return, including `federal-summary.json`, `federal-lines.csv`, `return-ir.json`, `submission-package.json`, and `export-manifest.json`.
- THIS PACKAGE DOES NOT PROVIDE CLOUD STORAGE, SYNC, BACKUP, OR ENCRYPTION FOR YOUR LOCAL FILES.
- DO NOT COMMIT REAL TAXPAYER DATA.

## Current Scope

- Federal only.
- TY2025 only.
- Supported commands: `tui`, `help`, `init`, `validate`, `run`, `export`.
- Supported filing statuses: `single`, `married_filing_jointly`, `married_filing_separately`, `head_of_household`, `qualifying_surviving_spouse`.
- The CLI rejects canonical returns that already contain state requests or state return payloads.
- There is no `submit`, `upload`, `efile`, or `transmit` command.

For the broader engine/library caveats and blueprint coverage, see the repo root README and `@taxzilla/tax-engine`.
