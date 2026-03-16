# TaxZilla Open

Public monorepo for the TaxZilla tax engine and CLI.

## Workspace Layout

- `packages/tax-engine`: TY2025 tax engine library and tests
- `apps/cli`: Bun/OpenTUI command-line interface for running the engine locally
- `docs/tax_engine_blueprint_ty2025`: tax engine design and reference docs
- `docs/tax-engine-cli-plan.md`: CLI design notes

## Commands

```bash
bun install
bun run dev
bun run cli -- help
bun run build
bun run typecheck
bun run lint
bun run test
```

`bun run dev` starts the CLI in watch mode from `apps/cli`.

`bun run cli -- <args>` forwards arguments to the CLI entrypoint. Example:

```bash
bun run cli -- init --session-dir ./.taxzilla/returns/demo
bun run cli -- validate --input ./.taxzilla/returns/demo
bun run cli -- run --input ./.taxzilla/returns/demo
bun run cli -- export --input ./.taxzilla/returns/demo
```

## Testing

- Unit and integration tests use `Vitest`.
- The tax engine coverage command lives in `packages/tax-engine`.

## Notes

- The CLI stores local working data under `.taxzilla/`.
- `apps/cli/README.md` contains CLI-specific usage notes.
