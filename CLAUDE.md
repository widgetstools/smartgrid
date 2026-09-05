# SmartGrid — agent notes

Read `docs/smartgrid-plan.md` and `docs/ui-components-plan.md` before changing architecture.

## Non-negotiables

- The config document (`GridConfig` in `packages/schema`) is the only source of truth. The assistant and the forms both emit JSON Patches; neither touches AG Grid directly.
- Every schema fragment carries an `x-editor` hint. Every editor is a controlled component (`value`/`onChange`/`context`/`mode`) with no internal persistence or validation.
- `packages/engine`, `packages/expressions`, `packages/store` are framework-agnostic: no React imports (ESLint enforces).
- Expression evaluation is CSP-safe: no `eval`, no `new Function`.
- Dark/light parity on every surface; tokens only, no hard-coded colours.
- AG Grid Enterprise pinned at 36.x; React 19; Zod 4 (`z.toJSONSchema`, `.meta()`).

## Conventions

- Package names `@smartgrid/<name>`; each package builds with `rimraf dist && tsc -b`.
- Tests: Vitest, colocated `*.test.ts(x)`. Round-trip tests for editors and schemas.
- Commits: conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`).
- Ported code from `stern-bak` keeps its behaviour; note the origin in a header comment.
