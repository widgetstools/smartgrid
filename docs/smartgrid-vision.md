# SmartGrid — Product Vision & Design Principles

> Captured from the project brief (September 2026). This is the north star for everything in `apps/` and `packages/`. Feature reference: [`adaptable-tools-features.md`](./adaptable-tools-features.md). Prior art: [`adaptable/07-stern-bak-survey.md`](./adaptable/07-stern-bak-survey.md).

## The one-line brief

**World-class AI tooling that makes configuring even the most complex AG Grid a breeze** — an AI assistant configures the grid from natural language using generative AI, and a very lean UI tooling layer is the fallback when the LLM server is unavailable. Feature parity with AdapTable and with the existing `stern-bak` implementation, at a fraction of the code.

## Non-negotiables

1. **AI first, UI second.** The primary way a user configures the grid is by talking to the assistant ("colour negative PnL red and flash it when it moves more than 2%", "group by desk then book, pin notional right, sum it"). The assistant produces the same config objects the UI would.
2. **UI tooling is a fallback, not a second product.** When the LLM endpoint is unreachable (or the user prefers it), the same config objects are editable through generic, schema-driven forms. No feature may exist only in the AI path or only in the UI path.
3. **Lean and mean without losing features.** Every AdapTable feature category in the catalogue is in scope. The bet is that the *tooling* to configure them can be radically smaller than AdapTable's four chrome surfaces and 14 wizards, and smaller than stern-bak's ~49k lines of config UI. The stern-bak survey shows the config UI is 3.3× the engine it drives; SmartGrid inverts that ratio.
4. **Reuse the existing design system.** Tokens, themes, cell renderers, icons and shadcn primitives come from `stern-bak`'s `@wellsfargo-starui/design-system` and `@wellsfargo-starui/react` packages (or their extracted equivalents). We do not design a new visual language.
5. **Trading-grade.** React + TypeScript, AG Grid Enterprise 36, dark/light parity, keyboard-first, high-frequency ticking data, CSP-safe expression evaluation, no `eval`.

## Architecture in one paragraph

A **single JSON config document** (`Record<moduleId, { v, data }>`, versioned per module, exactly like stern-bak's `ProfileSnapshot`) is the only source of truth. A small **engine** turns that document into AG Grid `columnDefs` + `gridOptions` + runtime behaviours (flash, alerts, calculated columns, formats). Two **producers** write the document: the **AI assistant** (LLM with tool-calling over a typed schema: read config, propose patch, validate, apply, explain) and the **schema-driven UI** (one generic form renderer fed by the same JSON Schema / Zod definitions, plus a handful of bespoke controls: expression editor, colour picker, column picker, rule list). Both producers share one **validator** (schema + expression compiler + column existence + entitlements) so a bad patch is rejected identically regardless of origin.

```
natural language ──► AI assistant (tools: get_config, propose_patch, validate, apply, explain)
                                         │
                                         ▼
                         ┌──── config document (JSON, versioned per module) ────┐
                         │                       ▲                               │
   schema-driven UI ─────┘                       │ validate (schema + AdaptableQL-like DSL + columns)
   (fallback / manual)                           │
                                                 ▼
                                 engine ──► AG Grid colDefs / gridOptions / runtime
```

## Why this can be leaner

| AdapTable / stern-bak today | SmartGrid |
|---|---|
| 4 chrome surfaces (Dashboard, Tool Panel, Status Bar, Settings Panel) with separate state, options, APIs and config UI | 1 surface: an assistant panel with a config tree; toolbars are a *view* of config, not a separate module |
| 14 multi-step wizards, one per object type | 0 wizards; the assistant produces the object, the fallback is one generic form per schema |
| ~40 hand-written settings panels (stern-bak: 28k LOC customizer + 17k widget chrome) | 1 schema-driven form renderer + ~6 bespoke controls |
| 11 near-identical cell-renderer config editors | field descriptors on the renderer registry, rendered generically |
| 3 overlapping style/format editors | 1 style editor component used everywhere |
| 2 shadcn copies + wrapper tier | 1 shared primitive set from the design system |
| Expression Editor + Query Builder | Expression editor with LLM autocompletion; Query Builder replaced by natural language |

## What the assistant must be able to do (capability list)

Derived one-to-one from the feature catalogue. Each is a tool or tool family with a typed schema.

- **Layouts:** create/clone/switch; set column order, visibility, width, pin, sort, caption; row groups and display type; aggregations (incl. weighted average, only); pivot layouts with totals; row summaries; row selection.
- **Filtering:** column predicate filters (all ~45 predicate ids), grid filter expressions, named queries, quick search, custom sorts, data set selection.
- **Formatting:** format columns (style + number/string/date/template display formats, conditional rules, header target, row scope); styled columns (gradient, percent bar, badge, sparkline, bullet, rating, range bar, icon); flashing cells/rows; edit-state styles.
- **Columns:** calculated columns (standard, aggregated, cumulative, quantile), free-text columns, action columns, hidden columns, column types.
- **Alerts:** all 7 alert kinds, behaviours, forms and command buttons; system status messages.
- **Editing:** smart edit ops, bulk update, plus/minus nudges, shortcuts, cell editors, validation rules, change history settings, row form settings.
- **Data:** reports (scopes, formats, destinations, schedules), import mapping, selection queries, cell/row summaries, transposition, charts.
- **Chrome:** theme, toolbar/panel visibility, entitlements (describe, not bypass).
- **Meta:** explain current config in plain language; diff two profiles; undo the last assistant change; "why does this cell look like this?" (trace styles/formats/flashes applied to a cell).

## Fallback behaviour (LLM unavailable)

- Health check on the LLM endpoint; on failure the assistant panel shows the config tree with the schema-driven editors and a banner. No functionality is lost; only the natural-language entry point.
- Everything the assistant can produce is round-trippable through the forms, because both are generated from the same schemas.
- Offline expression validation and autocomplete still work (local compiler, function catalogue).

## Decisions (resolved, see [smartgrid-plan.md](./smartgrid-plan.md))

- **Expression language:** AdaptableQL-compatible grammar and function catalogue, including the aggregation, relative-change and observable tiers.
- **LLM access:** local Copilot API server on `localhost:3000` through an OpenAI-compatible provider adapter; providers are swappable.
- **Persistence:** `StorageAdapter` interface with IndexedDB default and a memory adapter; REST adapter later.
- **Design system:** extracted from `stern-bak` into `packages/design-system` and `packages/ui`, trimmed to one token namespace and one shadcn tier.
