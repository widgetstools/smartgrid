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

Tooling: npm workspaces + Turborepo, TypeScript 5.9, Vite 7, Vitest, Playwright, ESLint flat config, AG Grid Enterprise 35 pinned. Same conventions as stern-bak so contributors move freely.

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

### M0 — Foundations (week 1–2)
- Monorepo scaffold, tooling, CI, AG Grid 35 + React 19 pinned.
- Extract design system + ui from stern-bak; one token namespace; dark/light parity check.
- `packages/schema`: cross-cutting primitives + `layout` and `formatting` modules in Zod with JSON Schema export and `x-editor` hints.
- `packages/store`: `StorageAdapter`, IndexedDB + memory, profile CRUD, patch log.
- **Demo:** blotter renders from a persisted config document; reload restores it.

### M0.5 — Editors (week 2–3)
- `packages/editors`: registry + atoms (ColorPicker, BorderEditor, FontStyleEditor, AlignmentPicker, StyleEditor, DisplayFormatEditor, ColumnPicker, ScopePicker, RowScopePicker, PredicateEditor, RuleEditor, IconPicker, ImagePicker, ScheduleEditor, KeyBindingEditor, DurationField) + PatchDiffCard + PreviewCell + ObjectList.
- `packages/forms`: JSON-Schema-driven renderer resolving editors from the registry; generated FormatColumn and Layout forms.
- Editor gallery page in the playground showing every editor in `inline`, `popover` and `panel` modes, dark and light.
- **Demo:** configure a format column through the generated form; the same editors appear inside a mock PatchDiffCard.

### M1 — Expression language (week 3–4)
- `packages/expressions`: AdaptableQL grammar, scalar + boolean functions (full catalogue), predicates (all 45), positioned diagnostics, AST, compile-to-closure, parse cache.
- Aggregation tier with `GROUP_BY`/`WHERE`/`WEIGHT`; relative-change tier; observable tier on a time-window engine.
- Conformance suite: every example in the AdapTable docs parses and evaluates.
- **Demo:** expression editor with palettes, diagnostics, row preview.

### M2 — Engine core (week 4–6)
- `packages/engine`: `Module` contract (from stern-bak, kept), pipeline, `RowChangeBus`, validator.
- Modules: `layout` (table + pivot kinds, weighted avg, `only`, row summaries, selection), `filters` (predicate filters, grid filter, named queries, quick search highlight), `formatting`, `styledColumns` (8), `flashing`, `calculatedColumns` (with dependency graph).
- **Demo:** the config document drives every visual on the grid; conditional styles scoped by data type; badges with predicate rules.

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

1. Scaffold the monorepo (M0 tooling) and push.
2. Extract design system + ui packages from stern-bak.
3. Write `packages/schema` primitives + `layout` + `formatting` schemas with `x-editor` hints and tests.
4. Build `packages/editors` atoms + registry + gallery page (M0.5).
5. Probe the local Copilot server: confirm endpoint path, streaming, and tool-call format, and record it in `packages/assistant/README.md`.
