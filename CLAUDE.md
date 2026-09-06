# SmartGrid — agent notes

Read `docs/smartgrid-plan.md` (plan, milestone status) and `docs/ui-components-plan.md` before changing architecture; `docs/expressions.md` for the expression language.

## Non-negotiables

- The config document (`GridConfig` in `packages/schema`) is the only source of truth. The assistant and the forms both emit JSON Patches; neither touches AG Grid directly.
- Every schema fragment carries an `x-editor` hint. Every editor is a controlled component (`value`/`onChange`/`context`/`mode`) with no internal persistence or validation.
- `packages/engine`, `packages/expressions`, `packages/store`, `packages/assistant` are framework-agnostic: no React imports (ESLint enforces the whole layering below).
- Expression evaluation is CSP-safe: no `eval`, no `new Function`.
- Dark/light parity on every surface; tokens only, no hard-coded colours.
- AG Grid Enterprise pinned at 36.x; React 19; Zod 4 (`z.toJSONSchema`, `.meta()`).
- No references to cqserver anywhere.

## Layout and layering

```
packages/schema        Zod per module → JSON Schema with x-editor hints (foundation)
packages/design-system tokens, themes, AG Grid theme, styled-column renderer (foundation)
packages/ui            shadcn primitives (foundation)
packages/expressions   AdaptableQL-compatible language
packages/store         ConfigStore: apply(patch, {origin, prompt, model, rationale}), undo/redo, IndexedDB/memory
packages/engine        buildGrid(config) → columnDefs/gridOptions/css; GridRuntime for flashing/alerts/calculated; only `import type` from ag-grid
packages/editors       editor atoms + EditorRegistry + PatchDiffCard/ObjectList (React)
packages/forms         SchemaForm renderer over module JSON Schema (React)
packages/assistant     ModelProvider (OpenAI-compatible + mock), validator, tools, AssistantSession
packages/react         useAssistant, AssistantPane, schema-driven proposal editors
apps/playground        Vite + React demo: blotter, customizer drawer, Assistant tab, editor gallery
scripts/               probe-llm.mjs (LLM wire-format probe), verify-assistant.mjs (headless run against a live server)
```

## Commands

```
npm install
npm run build                       # tsc -b per package; workspace packages resolve from dist/, so rebuild after editing a package
npx turbo run build test typecheck  # everything (32 tasks, all green as of M3)
npx eslint . --max-warnings 0
npx prettier --check packages apps scripts   # markdown outside packages is not prettier-formatted; do not reformat docs/
npm run dev                         # playground on http://localhost:5300; proxies /llm/* → http://localhost:3000/* (SMARTGRID_LLM_URL overrides)
node scripts/probe-llm.mjs [baseUrl] [model]
node scripts/verify-assistant.mjs [model] [appUrl]   # needs `npm run dev` running and `npx playwright install chromium`
```

Turbo `test`/`typecheck` depend on `^build`; when a downstream package cannot resolve a new export, build the upstream first (`npx turbo run build --filter=@smartgrid/<pkg>`).

## Conventions

- Package names `@smartgrid/<name>`; each package builds with `rimraf dist && tsc -b`.
- TypeScript 5.9 strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`; ESM with `.js` import suffixes; inline `type` imports.
- Zod 4: object defaults use `.prefault({})` (`.default({})` returns the raw `{}` without parsing).
- React 19 with the react-hooks compiler lint: no setState in effects, no ref reads during render, never mutate a value returned by a hook. For "latest callback" holders use a plain object created in `useState(() => …)` with a `set()` method updated in an effect (see `packages/react/src/useAssistant.ts`, `apps/playground/src/grid/useGridRuntime.ts`).
- Tailwind 4: the playground scans package sources through `@source` lines in `apps/playground/src/styles.css`; add one when a new package renders UI.
- Tests: Vitest, colocated `*.test.ts(x)`; jsdom + `src/test/setup.ts` for React packages, `afterEach(cleanup)` in React test files; helpers under `src/test/` are excluded from `tsc -b`. Round-trip tests for editors and schemas.
- Commits: one-line subject plus a bullet body saying what and why; no model identifiers in commits or code.
- Ported code from `stern-bak` keeps its behaviour; note the origin in a header comment.

## Assistant specifics

- Provider contract and loop: `packages/assistant/README.md`. Tools are hand-written JSON Schema in `src/tools.ts`; module shapes come from `moduleJsonSchema`. The system prompt is `src/prompt.ts`.
- `validatePatch` = pointer policy → apply on a clone → Zod parse per module → column-id checks (suggests the id when a header was used) → engine dry run. Never loosen the validator to make a model pass; improve the prompt or the tool descriptions instead.
- Proposals are editable inline: `packages/react/src/proposalEditors.ts` resolves the editor for a pointer from the module JSON Schema.
- Demo mode (`MockProvider` + `demoScript`) runs the whole loop offline; the headless tests use it.

## Current status and open work

- M0–M3 done and verified headless in demo mode (plan §6). The assistant has **not yet been exercised against the real local Copilot API server on port 3000**; that server is only reachable from the machine where it runs.
- Next, on such a machine: `node scripts/probe-llm.mjs`, then `npm run dev` + `node scripts/verify-assistant.mjs`; adapt `packages/assistant/src/providers/openaiCompatible.ts` if the wire format differs (add a fake-fetch test in `openaiCompatible.test.ts`); iterate on `prompt.ts`/`tools.ts` if the model's proposals fail validation repeatedly. Then M4 (plan §6): composite editors where generated forms need care, and the round-trip test assistant patch → form → identical document.
