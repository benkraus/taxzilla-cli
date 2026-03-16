# TaxZilla CLI

Federal-only TY2025 command-line entrypoint for the tax engine.

## Commands

```bash
bun run --cwd apps/cli dev
bun run --cwd apps/cli src/index.tsx help
bun run --cwd apps/cli src/index.tsx init --session-dir ./.taxzilla/returns/demo
bun run --cwd apps/cli src/index.tsx validate --input ./.taxzilla/returns/demo
bun run --cwd apps/cli src/index.tsx run --input ./.taxzilla/returns/demo
bun run --cwd apps/cli src/index.tsx export --input ./.taxzilla/returns/demo
```

## Notes

- Interactive OpenTUI shell is available through `taxzilla` with no arguments or `taxzilla tui`.
- Session directories use `canonical-return.json` as the source of truth.
- `run` and `export` write `export-manifest.json` alongside generated artifacts.
