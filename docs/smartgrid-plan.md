# SmartGrid — Implementation Plan

> Working plan for building SmartGrid: an AI-first configuration layer for AG Grid Enterprise with a lean schema-driven fallback UI. Inputs: [vision](./smartgrid-vision.md), [AdapTable catalogue](./adaptable-tools-features.md), [parity audit](./parity-stern-bak-vs-adaptable.md), [stern-bak survey](./adaptable/07-stern-bak-survey.md).

## 1. Decisions (resolved)

| Decision | Choice | Consequence |
|---|---|---|
| Expression language | **AdaptableQL-compatible** grammar and function names, including aggregation (`GROUP_BY`, `WHERE`, `WEIGHT`, `CUMUL`, `QUANT`), relative-change (`ANY_CHANGE`, `PERCENT_CHANGE`, `ABSOLUTE_CHANGE`) and observable (`ROW_CHANGE`, `GRID_CHANGE`, `TIMEFRAME`) tiers, plus `QUERY`, `VAR`, `FIELD`, `CASE` | New tokenizer/parser/evaluator in `packages/expressions`, CSP-safe, positioned errors, AST export. Reuse stern-bak's architecture (parse cache, compile-to-closure, `aggregateColumnRefs` pattern), not its grammar |
| LLM access | **Local Copilot API server on `localhost:3000`**, assumed OpenAI-compatible chat-completions with tool calling | `packages/assistant` talks to a `LlmProvider` interface; first implementation is `OpenAiCompatibleProvider` (base URL configurable), second is `AnthropicProvider`. Health check drives the UI fallback |
| Persistence | **`StorageAdapter` interface with IndexedDB default**; memory adapter for tests; REST adapter later | Config document, patch log and profiles all go through one adapter |
| Design system | **Extract into `packages/design-system` and `packages/ui`**, trimmed to one CSS-variable namespace and one shadcn tier | Copy from stern-bak: tokens, themes, `applyTheme`, AG Grid Quartz adapter + density, cell renderers, 113 icons, 52 shadcn components. Drop `--st/--ds/--bn/--fi/--p/--ck` aliases and the second shadcn copy |
| Editing components | **Host-agnostic editor library (`packages/editors`) designed first**, one registry used by both the customizer forms and the assistant's generative UI | See [ui-components-plan.md](./ui-components-plan.md): every editor is a controlled component over a schema fragment with `inline`/`popover`/`panel` modes, resolved through an `x-editor` hint |
| Assistant framework | **assistant-ui** for the chat host + **Vercel AI SDK core** (`@ai-sdk/openai-compatible`) as the model layer + **our own** propose/validate/apply loop. Not CopilotKit for now; the editor contract keeps that swap bounded | Rationale and comparison in [ui-components-plan.md §4](./ui-components-plan.md) |

Open item to confirm when the first call is made: the exact request shape of the local Copilot server (chat-completions path, streaming, tool-call format). The provider adapter isolates this.

## 2. Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
                 │  apps/playground  (React, Vite)                          │
                 │  ┌──────────────┐   ┌──────────────────────────────────┐ │
                 │  │ AssistantPane│   │ SmartGrid <AgGridReact>          │ │
                 │  │ chat + diff  │   │ toolbar · context menu · popouts │ │
                 │  └──────┬───────┘   └───────────────▲──────────────────┘ │
                 └─────────┼───────────────────────────┼────────────────────┘
                           │ tool calls                │ colDefs/gridOptions/runtime
                 ┌─────────▼───────────┐     ┌─────────┴──────────────┐
                 │ packages/assistant  │     │ packages/engine        │
                 │ LlmProvider         │     │ modules · pipeline     │
                 │ tools: get_columns  │     │ RowChangeBus · flash   │
                 │  get_config         │     │ alerts · calc columns  │
                 │  propose_patch ─────┼──►  │ validate() (shared)    │
                 │  validate · apply   │     └─────────▲──────────────┘
                 │  explain · undo     │               │
                 └─────────┬───────────┘     ┌─────────┴──────────────┐
                           │                 │ packages/schema        │
                 ┌─────────▼───────────┐     │ Zod per module → JSON  │
                 │ packages/forms      │◄────┤ Schema + UI hints      │
                 │ schema-driven forms │     │ AdaptableQL-like types │
                 │ (fallback UI)       │     └─────────▲──────────────┘
                 └─────────────────────┘               │
                                             ┌─────────┴──────────────┐
                                             │ packages/expressions   │
                                             │ tokenizer·parser·eval  │
                                             │ functions · predicates │
                                             └────────────────────────┘
                 ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐
                 │ packages/store     │  │ packages/design-sys│  │ packages/ui   │
                 │ StorageAdapter     │  │ tokens·themes·     │  │ shadcn set +  │
                 │ IndexedDB·memory   │  │ ag adapter·        │  │ grid chrome   │
                 │ patch log·profiles │  │ renderers·icons    │  │ primitives    │
                 └────────────────────┘  └────────────────────┘  └───────────────┘
```

**One document, two producers, one validator.** The config document is the only source of truth. The assistant and the fallback forms both emit JSON Patches against it. `packages/schema` owns the Zod definitions; `packages/engine` owns the validator that both producers call; the same schema generates the LLM tool definitions and the forms.

## 3. Monorepo layout

```
smartgrid/
  apps/
    playground/            Vite + React 19 demo: trading blotter with ticking data, assistant pane
    gateway/               (optional, later) Node service for key custody, audit log, REST persistence
  packages/
    schema/                Zod schemas per module, JSON Schema export, UI hints, type exports
    expressions/           AdaptableQL-compatible language: tokenizer, parser, evaluator, functions, predicates
    engine/                Module contract, GridPlatform, pipeline, RowChangeBus, validator, runtime behaviours
    store/                 StorageAdapter, IndexedDB + memory adapters, patch log, profiles, migrations
    editors/               Host-agnostic editing components + EditorRegistry (colour, style, format, expression, predicate, rule, scope, column, icon, schedule …), PatchDiffCard, PreviewCell
    assistant/             Model layer (AI SDK core + OpenAI-compatible provider), tool set, agent loop, assistant-ui tool UIs mounting editors
    forms/                 Schema-driven form renderer that resolves editors from the registry (fallback customizer)
    design-system/         Extracted tokens, themes, applyTheme, AG Grid adapter, cell renderers, icons
    ui/                    shadcn primitives (one copy) + grid chrome components
    react/                 <SmartGrid>, <AssistantPane>, hooks (useSmartGrid, useConfig, useAssistant)
  docs/
```

Tooling: npm workspaces + Turborepo, TypeScript 5.9, Vite 8, Vitest 5, Playwright, ESLint flat config, AG Grid Enterprise 36 pinned. Same conventions as stern-bak so contributors move freely.

## 4. The config document

```ts
interface GridConfig {
  gridId: string;
  profile: string;
  revision: number;                       // optimistic concurrency
  modules: Record<ModuleId, { v: number; data: unknown }>;
}
```

Module ids and what they own, mapped to the AdapTable catalogue so parity is trackable:

| Module | Owns | Closes parity gap |
|---|---|---|
| `layout` | column order/visibility/sizing/pinning/sorts/captions, row groups + expand rules, aggregations (incl. weighted average, `only`), grand total, row summaries, row selection (7 options), pivot as a **distinct layout kind** with totals/expand/result order | Slice 1 gaps 1, 2, 5 |
| `filters` | column filters as `{ columnId, predicates[], operator }`, grid filter expression (keep-when-true), named queries, quick search state | Slice 2 gaps 1, 3, 4 |
| `formatting` | format columns with `Scope { All | DataTypes | ColumnIds | ColumnTypes }`, `RowScope`, display formats (number/string/date/template), styles incl. per-theme, precedence | Slice 3 gap 5 |
| `styledColumns` | gradient, percent bar, badge (predicate/expression rules), sparkline, bullet, rating, range bar, icon | Slice 3 gap 4 |
| `flashing` | rule, scope, target, duration, up/down/neutral | — |
| `calculatedColumns` | standard, aggregated, cumulative, quantile; dependency graph for chaining | Slice 3 gap 3 |
| `freeTextColumns` | definitions + per-PK stored values | Slice 4 gap 3 |
| `alerts` | 7 kinds, behaviours (highlight, jump, prevent edit, toast, status), command buttons, schedule | Slice 3 gaps 1, 2 |
| `editing` | smart edit, bulk update, nudges (keys), shortcuts, editors, validation rules, change history settings | Slice 4 gap 1 |
| `export` | reports (scopes), formats, destinations, schedules | Slice 4 gap 2 |
| `annotations` | notes; comments via external persistence hooks | — |
| `chrome` | toolbar items, theme, density, visibility | — |

Cross-cutting primitives in `packages/schema`: `Scope`, `RowScope`, `Predicate`, `Rule`, `Style`, `DisplayFormat`, `Schedule`, `ObjectMeta { id, name, enabled, readOnly, tags }`. These are the shared vocabulary that stern-bak lacked, and they are what make one form renderer and one tool schema cover every module.

## 5. The assistant

**Provider contract** (`packages/assistant/src/provider.ts`):
```ts
interface LlmProvider {
  health(): Promise<{ ok: boolean; model?: string; latencyMs?: number }>;
  chat(req: { system: string; messages: Msg[]; tools: ToolDef[]; stream?: boolean }): AsyncIterable<ChatEvent>;
}
```
`OpenAiCompatibleProvider({ baseUrl: 'http://localhost:3000', model, apiKey? })` first; `AnthropicProvider` second.

**Tools** (all `strict` JSON Schema, generated from Zod):

| Tool | Purpose |
|---|---|
| `get_columns` | column ids, headers, `cellDataType`, sample values, distinct counts. Cached; sent once per session |
| `get_config(module?)` | current slice of the document |
| `propose_patch(module, ops, rationale)` | returns a patch id and a human-readable diff; **does not apply** |
| `validate(patchId)` | schema + column existence + expression compile + entitlements; returns positioned errors |
| `apply(patchId)` | commits, bumps revision, appends to patch log |
| `undo(n?)` | reverts last n applied patches |
| `explain(target)` | "why does this cell look like this" — traces styles/formats/flashes/alerts for a cell, or summarises a module |
| `list_functions` / `list_predicates` | catalogue with signatures and examples, for self-correction |

**Loop**: user message → model proposes → validator runs → if errors, feed them back (max 3 self-corrections) → show diff card → user approves (or auto-apply for low-risk modules per setting) → apply. Every applied patch stores `{ patch, prompt, model, timestamp }`.

**Context discipline**: system prompt (stable) + column schema (cached) + only the module slices the request mentions. Never the whole document.

**Fallback**: `health()` polled; on failure the pane switches to the config tree with schema-driven forms and a banner. Expression validation and autocomplete remain local.

## 6. Milestones

Each milestone ends with a demo in `apps/playground` and green CI.

### M0 — Foundations (week 1–2) — **done**
- Monorepo scaffold, tooling, CI, AG Grid 36 + React 19 pinned.
- Extract design system + ui from stern-bak; one token namespace; dark/light parity check.
- `packages/schema`: cross-cutting primitives + `layout` and `formatting` modules in Zod with JSON Schema export and `x-editor` hints.
- `packages/store`: `StorageAdapter`, IndexedDB + memory, profile CRUD, patch log.
- **Demo:** blotter renders from a persisted config document; reload restores it.

### M0.5 — Editors (week 2–3) — **done**
- `packages/editors`: `EditorProps`/`EditorContext` contract, `EditorRegistry`, `registerDefaultEditors` covering every leaf `x-editor` hint (27 atoms: colour, theme colour, border, font, alignment, style, display format, expression, predicate, rule, scope, row scope, column(s), column type, icon, image, number, range, schedule, keys, duration, values, density, text, boolean, enum). Presentational: `PreviewCell` (uses the engine's formatter and style helpers), `PatchDiffCard` (per-op inline editors, apply/reject/undo), `ObjectList`, `ValidationSummary`. 115 tests.
- `packages/forms`: `SchemaForm` renders any JSON Schema node — `x-editor` → registry, objects → fieldsets, discriminated unions → kind selector + branch, string arrays → chips, object arrays → `ObjectList` + detail, records → key/value rows, Zod validation routed to fields by JSON pointer. Generated `FormatColumnForm` and `LayoutForm` (rule/display-format options follow the scope). Composite hints (`formatColumn`, `layout`, …) are structural: rendered by the form, never by an atom.
- Playground: `#/gallery` (every editor × three modes, light/dark split), `#/customizer` (drawer: format columns and layouts edited through the generated forms; each change is a `fast-json-patch` diff applied to the `ConfigStore`, so the grid restyles live and the change survives reload), and an Assistant tab with a canned proposal rendered by the real `PatchDiffCard` and applied through the same store.
- Verified headless: gallery renders all 27 hints; renaming and recolouring a format column bumps the revision, rewrites the injected stylesheet, and persists across reload; the mock proposal applies as origin `assistant`.

### M1 — Expression language (week 3–4) — **done**
- `packages/expressions`: tokenizer, recursive-descent parser with spans and a parse cache, AST printer, value semantics shared with predicates (blank propagation, `'5M'` magnitude strings, dates, case-insensitive text), closure compiler, `MapFunctionRegistry`, `createEnv`. Reference: [docs/expressions.md](expressions.md).
- Function catalogue (70 system functions): boolean, numeric, date, string, misc, relative change (`ANY_CHANGE`, `ABSOLUTE_CHANGE`, `PERCENT_CHANGE`), advanced (`VAR`, `QUERY`, `IF`), aggregated metadata, observable metadata.
- Aggregated tier: `SUM AVG MIN MAX MEDIAN COUNT MODE DISTINCT ONLY STD_DEVIATION PERCENTAGE` with `GROUP_BY`, `WEIGHT`, trailing `WHERE`; `CUMUL(…, OVER([col]))`; `QUANT`/`QUARTILE`/`PERCENTILE`; per-row (`evaluateRow`) and per-group (`evaluate`) entry points with per-session caches.
- Observable tier: `ROW_CHANGE`/`GRID_CHANGE` with `COUNT`/`MIN`/`MAX`/`NONE`, `ROW_ADDED`/`ROW_REMOVED`, `TIMEFRAME` (8h default cap, 24h hard cap), `WHERE`; `ObservableWatcher` is a clock-agnostic sliding-window runtime (`push(event)`, `tick(now)`).
- `validate(src, { kind, env, columns })`: friendly-name resolution, unknown column/function (with did-you-mean), arity, kind rules (aggregates only in aggregated kinds, observable shape), return-type inference, positioned errors. 115 tests including a conformance suite over the AdapTable doc examples.
- Editor: `ExpressionEditor` is CodeMirror 6 behind the unchanged props — syntax highlighting on design tokens, column/function/keyword completions filtered by kind, live lint from `validate`, host errors merged as diagnostics, single-line inline mode. `EditorContext.functions` defaults to the system catalogue.
- Engine: boolean expression rules compile to closures in `cellClassRules`; invalid expressions warn and are skipped. Playground seed carries an expression-driven format column.
- Not done: relative-change functions only see a change when the host sets `RowContext.change` (engine wiring lands with flashing/alerts in M2); infix `[col] IN ('a','b')` is not parsed (use `IN([col], 'a', 'b')`).

### M2 — Engine core (week 4–6) — **done**
- Schema: five new modules — `calculatedColumns`, `styledColumns` (gradient, percent bar, badge, sparkline, bullet chart, rating, range bar, icon), `flashing`, `alerts`, `queries` (named queries + quick search) — all with `x-editor` hints, so the generic form renderer and the assistant's tool schemas cover them with no bespoke UI.
- Engine: `EngineModule` contract over a shared `BuildDraft` (defs, grid options, style rules in precedence order, row filters); modules run in order calculated → layout → formatting → styled → flashing → alerts → queries. `GridRuntime` is the live half: hosts push `cellsChanged`/`rowsChanged` and drive `tick(now)`; modules register parts and emit `flash`, `alert`, `highlightEnd`, `calculatedColumnsChanged` events; column stats are cached per build.
- Calculated columns: scalar `valueGetter`s, aggregated columns recomputed from the host row set when a dependency changes, dependency graph with cycle detection and topological validation of chains.
- Styled columns: framework-agnostic renderer params (endpoint resolution against column stats, badge rule matching) consumed by one React renderer in `design-system/react` covering all eight kinds without ag-charts.
- Flashing: direction-aware cell/row flashes with per-definition or default styles and durations (or `always`), driven through `cellClassRules` and refresh events.
- Alerts: data-change (predicates/expressions/relative change), aggregated (fires on false→true transitions, per group), observable (time windows via `ObservableWatcher`), scheduled (5-field cron + one-off); message templates; toast/status/console/highlight/jump behaviours resolved into one `AlertEvent`.
- Queries: column filters and the grid filter from the current layout plus quick search combine into AG Grid's external filter; quick search highlight class; `QUERY('Name')` resolves against the document's named queries.
- Playground: host adapter (`useGridRuntime`) mirrors runtime events onto the grid API and toasts; the customizer has a generic tab per module driven only by the module's JSON Schema; the seed carries calculated, styled, flashing, alert and query objects.

### M3 — Assistant (week 6–8)
- `packages/assistant`: AI SDK core + `createOpenAICompatible({ baseURL: 'http://localhost:3000/v1' })` against the local Copilot server, tool set (incl. `request_input` for pickers), agent loop with validator-driven self-correction, patch log, health check.
- `packages/react`: `<AssistantPane>` on assistant-ui (`LocalRuntime` adapter), tool UIs that mount PatchDiffCard and pickers from the editor registry, approve/undo.
- **Demo:** "group by desk then book, pin notional right, sum it, flash PnL red when it drops more than 2%" produces and applies a valid multi-module patch; reload restores it.

### M4 — Fallback UI completion (week 8–9)
- Generated forms for every remaining module; composite editors where generated layout needs care (StyledColumnEditor, AlertEditor, LayoutEditor).
- Every module editable without the LLM; round-trip test: assistant patch → form → identical document.
- **Demo:** kill the LLM server; configure the same blotter through forms.

### M5 — Parity closure (week 9–12)
- `alerts` (7 kinds, actionable behaviours, prevent-edit), `editing` (validation layer, editors, nudges with keys, shortcuts, change history), `export` (reports, JSON, destinations, schedules), `freeTextColumns`, `annotations`, chrome (context/column menu hooks, toolbar config).
- Entitlements per module; `Revision` merge for redeploys.
- **Demo:** re-run the parity audit against SmartGrid; target ≥ 90% Full or Different.

Later: REST adapter + gateway, team sharing, FDC3 intents, interop plugins, server-side row model.

## 7. Working agreements

- **Schema first.** No module lands without its Zod schema, JSON Schema export, and a validator test.
- **Both producers or neither.** A feature that the assistant can set must be settable in the fallback forms, and vice versa; the round-trip test enforces it.
- **Keep what stern-bak does better.** The "ahead" list in the parity report is carried over, not rewritten: composite keys, `RowChangeBus`, per-theme styles, header flash, stream-safe floating filters, saved-filter pills, column templates, Visual Excel, alert rate limiting, Redo, per-module `migrate`, popout, CVD, density.
- **Measure leanness.** Track config-UI LOC versus engine LOC per milestone; the target ratio is below 1:1, against stern-bak's 3.3:1.
- **Trading-grade.** Dark/light parity, keyboard-first, 100k rows with 400 updates/s in the playground, no `eval`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Local Copilot server's tool-calling format differs from OpenAI's | Provider adapter isolates it; fall back to JSON-in-text with a strict parser if native tool calls are unavailable |
| Observable/time-window expressions are the hardest tier | Ship M1 without it, land it in M2 behind a feature flag |
| Extracting the design system drags in six token namespaces | Extract only OKLCH source tokens + one generated alias set; `check:ds-tokens` script from stern-bak enforces it |
| Pivot as a distinct layout kind is a large schema | Model it in M0 schema, implement in M2, wizard-free thanks to forms |
| LLM proposes valid-but-wrong config | Diff card before apply, undo, explain tool, patch log with prompt |

## 9. Immediate next steps

1. ~~Scaffold the monorepo (M0 tooling) and push.~~ done
2. ~~Extract design system + ui packages from stern-bak.~~ done
3. ~~Write `packages/schema` primitives + `layout` + `formatting` schemas with `x-editor` hints and tests.~~ done
4. ~~Build `packages/editors` atoms + registry + gallery page (M0.5).~~ done, with `packages/forms` and the customizer drawer
5. Probe the local Copilot server: confirm endpoint path, streaming, and tool-call format, and record it in `packages/assistant/README.md`.
6. ~~M1: tokenizer/parser/evaluator for AdaptableQL in `packages/expressions`; swap the `ExpressionEditor` textarea for CodeMirror with completions and positioned diagnostics (same props).~~ done
7. ~~M2: expression rules in the engine, flashing, calculated columns, alerts.~~ done
