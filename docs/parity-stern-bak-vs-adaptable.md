# Parity check — `stern-bak` vis-à-vis AdapTable for AG Grid

> Feature-by-feature audit of the existing implementation (`widgetstools/stern-bak` @ `5a248ad`, September 2026) against the AdapTable v23 catalogue in [`adaptable-tools-features.md`](./adaptable-tools-features.md). Every status was verified in stern-bak source, not from its docs. The four detailed tables with file-level evidence are under [`parity/`](./parity/).

**Status legend.** *Full* = implementation found. *Partial* = a usable subset, gap noted. *Different* = same outcome by another mechanism. *Missing* = no source implementation. *Extra* = stern-bak has it and AdapTable does not.

## Headline

| Slice | Rows | Full | Partial | Different | Missing |
|---|---|---|---|---|---|
| [1. Layouts, columns, grid data](./parity/01-layouts-columns-grid-data.md) | 61 | 21 | 17 | 5 | 18 |
| [2. Filtering, search, predicates, expressions](./parity/02-filtering-search-expressions.md) | 96 | 21 | 29 | 8 | 38 |
| [3. Formatting, styled columns, flashing, calc columns, alerts, theming](./parity/03-formatting-styling-alerts-theming.md) | 127 | 46 | 22 | 21 | 37 |
| [4. Editing, annotating, data, advanced, chrome](./parity/04-editing-data-advanced-chrome.md) | 69 | 15 | 22 | 8 | 24 |
| **Total** | **353** | **103 (29%)** | **90 (25%)** | **42 (12%)** | **117 (33%)** |

Read as: about 41% of AdapTable's feature surface is at or above parity (Full + Different), a further 25% exists as a subset, and a third has no implementation. The engine-level foundations (module pipeline, versioned state, expression compiler, theming) are strong. The gaps cluster in five structural places, not in dozens of scattered features.

## Per-area scorecard

| Area | Verdict | One-line reason |
|---|---|---|
| Theming | **At or above parity** | Light/dark, tokens, AG Grid Quartz pairing; plus CVD mode, density presets, cross-window sync that AdapTable lacks. Only `os` mode is a fallback rather than a pinnable choice. |
| Layouts (table) | **Near parity, different model** | Profiles cover order/visibility/width/pin/sort/captions/grouping. Explicit-save instead of auto-save. No weighted average, `only`, row summaries, group expand exceptions. |
| Column management | **Near parity** | Runtime ColDef pipeline, templates (extra), column info strip. No array cell types, no `DataTypes`/`ColumnTypes` scope, no header callback. |
| Conditional styling / format columns | **Parity on styles, gaps on scope** | Rich per-theme styles, borders, indicators, animation (extras). Scope is column-ids-only; no row scope, no conditional header styling, no border radius or CSS class. Presets miss K/M/B/Accounting/FXRate. |
| Flashing | **Parity by other means** | CSS-keyframe flash incl. header flash (extra). No automatic up/down/neutral; two rules needed. No clear-flash, no event. |
| Calculated columns | **Half parity** | Per-row and grid-wide aggregates work. No `GROUP_BY`, cumulative, quantile; cannot reference other calc columns. |
| Filtering | **Different model, wide gaps** | AG Grid filter models + strong typed floating-filter grammar + saved pills (extra). No predicate model, no Named Queries, inverted Grid Filter, no Query Builder, filter-only Quick Search. |
| Expression language | **Half the catalogue** | ~48 of ~96 AdaptableQL functions present, 6 under different names. Missing aggregation-with-`GROUP_BY`/`WHERE`, relative-change, observable, `QUERY`/`VAR`/`FIELD`. Editor UI is better than AdapTable's. |
| Alerts | **Notify-only** | 3 of 7 kinds; toast/badge/OpenFin channels; rate limiting (extra). No highlight/jump/prevent-edit/forms/buttons, no Aggregation/Observable/Scheduled/Validation kinds. |
| Styled columns | **Weak** | 24 renderers, 13 of them trading-specific extras. But 5 of 8 AdapTable styled columns missing; Badge is exact-match only; Gradient has no dynamic endpoints. |
| Editing | **Parity on tools, zero on validation** | Smart Edit, Bulk Update, Plus/Minus, Shortcuts, Change History (with Redo, extra). No validation of any kind; Shortcuts trigger is inverted; no Row Forms or Action Columns. |
| Annotating | **Absent** | No Notes, Comments, or Free Text Columns. |
| Export / import | **One feature** | Visual Excel is excellent. No Reports, JSON, destinations, scheduling, or data import. |
| State & persistence | **Parity, better factored** | Storage adapter, per-module `migrate`, cross-tab invalidation (extra). No `Revision`/redeploy merge; coarse events. |
| Permissions / sharing | **Different, coarser** | Config-row roles and whole-profile export. No per-module entitlements, no per-entity sharing. |
| Interop | **Partial** | OpenFin notifications full; FDC3 is user-channel broadcast only with no intents; no Live Excel, ipushpull. |
| UI chrome | **Half the surfaces** | Settings drawer with popout (extra), quick search, context menu. No Tool Panel, Status Bar, column-menu hook, toolbar tabs, custom toolbars, wizards. |

## The ten structural gaps

Ordered by how much they block everything else.

1. **No predicate model.** AdapTable's `{ PredicateId, Inputs }` is shared by Column Filters, Alerts, Format Columns, Flashing and Badges. stern-bak has AG Grid filter-model JSON for filters and free-form expressions everywhere else. Without it there are no custom predicates, no `In`/`NotIn`/`Positive`/`Regex`/`Holiday` style catalogue, no predicate dropdown in the filter bar, and no reuse across modules.
2. **No cross-module scope object.** `RuleScope` is `{ columns[] } | { row }`. AdapTable's `{ All | DataTypes | ColumnIds | ColumnTypes }` plus `RowScope` is what lets one rule say "every numeric column, data rows only". Every styling, flashing, alert and nudge rule inherits this limitation.
3. **No validation layer.** Static `editable` boolean; no row-level editability callback; no `PreventEdit`; no server hook. The preview's tri-state UI is wired to a validator that always returns valid.
4. **Expression language lacks the aggregation, relative-change and observable tiers** and calculated columns cannot reference each other. This blocks Aggregation and Observable alerts, grouped/cumulative/quantile calc columns, and `ANY_CHANGE()` style flash rules.
5. **Alerts cannot act on the grid.** No highlight, jump, prevent-edit, command buttons, forms; four of seven kinds absent.
6. **No Named Queries and no `QUERY()`**, so nothing is define-once-reference-everywhere at the expression level.
7. **Pivot is a boolean on the same profile**, not a distinct layout type; pivot totals, expand level and result-column order are absent; weighted average and row summaries are missing.
8. **No Export module and no data import.** Reports, JSON, destinations, scheduling are all absent.
9. **No annotation family** and no per-primary-key user-value store to build Free Text Columns on.
10. **No `Revision` merge for saved profiles**, and only three coarse chrome surfaces with no column-menu or context-menu extension hook.

## Where stern-bak is ahead

Worth preserving in SmartGrid rather than rebuilding:

- Composite and nested-path primary keys with a null-on-partial-key guard.
- Coalesced `RowChangeBus` deltas so rules evaluate only changed rows per frame.
- Per-theme (dark/light) style slots on every rule; indicator badges; value animations; timed style windows; `[col.old]`/`[col.new]` diff refs.
- Header flash; per-rule GPU keyframes; per-grid scoped native flash colour.
- Stream-safe floating filters with a typed grammar richer than AdapTable's wildcards; saved-filter pills with merge and delta capture.
- Column templates; custom DSL aggregations; auto-format catalogue; tick (32nds…256ths) formatters; Visual Excel with style round-trip.
- Alerts: per-rule debounce, global token bucket, evaluation modes, `direction` on relative change.
- Editing: Redo; per-source change-history recording; asymmetric nudge steps; K/M/B suffix parsing.
- Persistence: storage adapter interface, per-module `migrate()`, cross-tab invalidation, profile JSON export/import.
- Chrome: real second-window popout; CVD theme mode; density presets; cross-window theme sync.
- Expression editor: CodeMirror with palettes, inline completions, positioned diagnostics, lazy fallback.
- 13 trading-specific zero-config renderers (Side, PnL, Ticker, RFQ status, …) and TrendArrow, MultiLine, RatingDelta, TimeSince, AllocationBar.

## Doc-versus-code discrepancies found

- `cellRendererRegistry.ts:92` documents an `aggValueDomain` heatmap parameter that has no implementation; heatmaps default to `[0,100]`.
- `docs/current-features.md:377` describes the filters toolbar as "server-side expression"; `compiler.ts` is a client-side AG Grid string fast path that rejects column refs.
- The in-app Help panel lists `LEFT`, `RIGHT`, `MID`, `COALESCE`, `SIGN`, `PI`, `HOUR`, none of which exist in `expression/functions.ts` (also flagged in stern-bak's own `EXPRESSION_DSL.md`).
- `RatingBadgeRenderer` / `RatingDeltaCellRenderer` are credit-rating widgets, not the star-rating styled column the name suggests.

## What this means for SmartGrid

The five structural gaps at the top of the list (predicates, scope, validation, expression tiers, actionable alerts) are all **schema and engine** work, not UI work. Closing them in a new config document first, and generating both the AI tools and the fallback forms from that schema, fixes them once for every module. The remaining gaps (export reports, annotations, pivot layouts, chrome surfaces) are then additional modules over the same document. Nothing in the "ahead" list needs to be given up to get there.
