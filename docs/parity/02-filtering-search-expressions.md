# Parity audit — Search, Filtering, Predicates & Expression Language

stern-bak (`widgetstools/stern-bak` @ `5a248ad`) versus AdapTable for AG Grid v23. Every status was verified against source under `packages/`. Paths are relative to the stern-bak repo root.

**Architectural headline:** stern-bak has no AdapTable-style *predicate object model* and no *AdaptableQL-equivalent query language for filtering*. Filtering is AG Grid's native filter-model stack (`agTextColumnFilter` / `agNumberColumnFilter` / `agDateColumnFilter` / `agSetColumnFilter` / `agMultiColumnFilter`), wrapped by (a) three custom "stream-safe" floating filters with a rich typed mini-grammar and (b) a saved-filter *pill* toolbar that stores raw AG Grid `filterModel` JSON. The expression DSL is a separate, row-scoped calculation/predicate language used for calculated columns, conditional styling, alerts and one row-exclusion filter. It is **not** wired to column filters.

---

## 1. Quick Search

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Grid-wide quick search box | Dashboard header/toolbar/tool panel/status bar textbox | **Partial** | `packages/react-grid/grid/src/widget/QuickSearch.tsx`, mounted in `PrimaryToolbar.tsx` | One expand-on-hover field in the primary toolbar only |
| **Highlight mode** (default: highlight matching cells, don't hide rows) | Default; wraps AG Grid Find | **Missing** | `QuickSearch.tsx:56` — only `api.setGridOption('quickFilterText', next)` | stern-bak has *only* filter mode. No cell/text highlighting, no AG Grid Find integration |
| **Filter mode** (`filterGridAfterQuickSearch`) | Opt-in | **Different** | same line | Present but it is the *only* mode |
| Next / previous match cycling | `gotoNextMatch()` / `gotoPreviousMatch()` | **Missing** | no find/match-cursor symbols | — |
| Match styles (Cell / Text / CurrentText) | 3 configurable `AdaptableStyle`s | **Missing** | no style state | Nothing to style |
| Case sensitivity | Option | **Missing** | no option | AG Grid quick filter is case-insensitive |
| Custom searchable text (`getCellSearchText`) | Callback | **Missing** in product grid | AG Grid `getQuickFilterText` used only in `config-browser/src/components/DataGrid.tsx:101` | — |
| Exclude cells / columns (`isCellSearchable`) | Callback | **Missing** | closest: `includeHiddenColumnsInQuickFilter` (`general-settings/state.ts:88`) | Column-visibility scope only |
| Floating quick-search overlay | Yes | **Missing** | inline expanding input, ESC clears | — |
| Placeholder config | Option | **Missing** | hard-coded `'Search grid…'` | — |
| Clear on startup / persistence | Option; text persisted | **Partial** | quick-filter text captured into profile by `core/engine/src/customizer/modules/grid-state/helpers.ts` | No clear-on-startup |
| Debounce | 350 ms | **Full** | `QuickSearch.tsx:76` — 140 ms | — |
| API namespace (`quickSearchApi`) | 12 methods | **Missing** | component-local state only | — |

## 2. Column Filters

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Per-column filters | Predicate-based, replaces AG Grid filters | **Different** | `core/engine/src/customizer/modules/column-customization/transforms.ts:317-410` (`applyFilterConfigToColDef`); `FilterEditor.tsx` (`FILTER_KIND_OPTIONS`) | Native AG Grid filters; no `ColumnFilter { ColumnId, Predicates[], PredicatesOperator }` |
| Multiple predicates with AND/OR | `PredicatesOperator` | **Partial** | AG Grid compound models from floating filters (`streamSafeNumberFloatingFilter.ts:243-285`); merged in `core/engine/src/filters/filtersToolbarLogic.ts:375` `mergeFilterModels` | Typed grammar (`>0 and <50`, `=1 or =2`), not a UI operator toggle |
| Stored per layout | `Layout.ColumnFilters` | **Different** | live filter model per **profile** (`grid-state/helpers.ts`); saved pills via `saved-filters` module | Profile ≈ layout; no per-layout collection |
| Filter Form popup | AdapTable predicate form | **Partial** | AG Grid's own popup; `params.buttons`, `closeOnApply`, `debounceMs` in `transforms.ts:359-361` | — |
| Filter Bar / floating filter | Predicate dropdown + input | **Partial / Different** | `streamSafeFloatingFilter.ts`, `streamSafeNumberFloatingFilter.ts`, `streamSafeDateFloatingFilter.ts`, `streamSafeFloatingFilterBase.ts`, `buildStreamSafeComponents.ts` | **No predicate dropdown.** Typed grammar instead. Adds streaming-clobber defence and clear ✕ (beyond AdapTable) |
| Wildcards in filter bar | `= > < : [ #` | **Full (superset, different tokens)** | number: `= > >= < <= != <> 100-150 and or ,`; date: comparators + `to .. -` + relative words; text: comma = OR | No `[`/`#` In shortcut |
| `In` filter — distinct values | Yes | **Partial** | `agSetColumnFilter` tab 2 of multi filter; CSV → set model | — |
| `In` filter — date tree | Yes | **Missing** | — | — |
| `In` filter — lazy/custom values | `customInFilterValues` | **Missing** | — | — |
| "Filter on Cell Value(s)" context menu | Yes | **Missing** | `getContextMenuItems` only in OpenFin packages | — |
| Suspend / unsuspend | `IsSuspended` | **Partial** | pill `active` flag (`FiltersToolbar.tsx:241`, `saved-filters/index.ts:46`); `deactivateAll` | Saved-pill level only |
| Manual apply mode | Per-column | **Partial** | AG Grid `apply`/`reset` buttons | No per-column fn; doesn't disable floating filter |
| Default predicate per data type | 4 options + fn | **Different** | hard-coded: text → `contains`, number → `equals`, date → `equals` | Not configurable |
| Indicate filtered columns | Default true | **Missing** | — | AG Grid icon only |
| Filter on special columns | Option | **Partial** | calculated columns import `applyFilterConfigToColDef` | No toggle |
| `isRowFilterable` | Callback | **Missing** | — | nearest: row-exclusion expression |
| `ColumnFilterApplied` event | With filter defs | **Partial** | AG Grid `filterChanged` via ApiHub in `widget/useFilterModel.ts` | Internal only; no typed event/AST |
| `columnFilterApi` (~25 methods) | Yes | **Missing** | `useFilterModel` is "internal-only" | — |

## 3. Predicates

No predicate registry, no `PredicateId`/`Inputs` object, no `predicateOptions` anywhere in `packages`. Rows below are *equivalent capability* via AG Grid filter types or the floating-filter grammar.

| Data type | Full | Partial | Different | Missing |
|---|---|---|---|---|
| All | `In` | `Blanks`, `NonBlanks` (AG Grid `blank`/`notBlank`, not typeable in grammar) | `AnyChange` (alert trigger only) | `NotIn` |
| number | `Equals`, `NotEquals`, `GreaterThan`, `LessThan`, `Between` | — | `PercentChange` (alert only) | `Positive`, `Negative`, `Zero`, `NotBetween` |
| text | `Contains` | `Is`, `IsNot`, `NotContains`, `StartsWith`, `EndsWith` (popup only) | — | `Regex` (DSL `REGEX_MATCH` only) |
| date | `Today`, `Yesterday`, `Tomorrow`, `Before`, `After`, `On`, `NotOn`, `Range` | `ThisMonth`, `ThisQuarter`, `ThisYear` (absolute expansion, not "this"), `InPast`, `InFuture` | — | `ThisWeek`, `NextWorkDay`, `LastWorkDay`, `WorkDay`, `Holiday` |
| boolean | — | `True`, `False` (set filter values) | — | — |
| Extras | `>=`, `<=` comparators; `last N <unit>` trailing windows; epoch/locale date parsing | | | |

Custom predicates (`customPredicateDefs`, `systemFilterPredicates`, `caseSensitivePredicates`, `evaluateInPredicateUsingTime`, predicate API): **Missing**. `formatFilterModel()` / `doesValueMatchFilter()` in `filtersToolbarLogic.ts:104,155` are partial analogues over AG Grid models.

**Predicate score: 12 Full / 15 Partial / 3 Different / 12 Missing (of 42).**

## 4. Grid Filter

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Grid-wide boolean expression | `GridFilter.Expression`, keep-when-true | **Partial / Different** | `customizer/modules/toolbar-date-settings/rowExclusionFilter.ts` — AG Grid `isExternalFilterPresent`/`doesExternalFilterPass` | **Inverted semantics**: EXCLUDE-when-true. Fails open on parse error |
| Stored per layout | Yes | **Different** | `toolbar-date-settings` state per profile | Buried in Custom Settings panel |
| Inline toolbar editor with Run | Yes | **Missing** | Monaco/CodeMirror editor in settings panel, applied on Save | — |
| Expression editor | Yes | **Full** | `customizer/ui/ExpressionEditor/` | — |
| Query Builder | Yes | **Missing** | no source anywhere | — |
| Save as Named Query | Yes | **Missing** | — | — |
| Recent filters dropdown | Yes | **Partial (different)** | saved-filter pills with `generateLabel()` | Filter models, explicit saves |
| Suspend grid filter | Yes | **Missing** | — | — |
| Clear filters on startup | Option | **Missing** | — | — |
| `GridFilterApplied` event with AST | Yes | **Missing** | internal `api.onFilterChanged()` only | AST obtainable via `engine.parse` |
| `gridFilterApi` | 8 methods | **Missing** | — | — |

## 5. Named Queries / Saved Filters

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Saved reusable **expressions** | `NamedQuery { Name, BooleanExpression }` | **Missing** | `ExpressionEditor/types.ts:7` lists "named-queries" as a *planned* call site; `docs/archive/MARKETSGRID_VS_ADAPTABLE_GAP_ANALYSIS.md` scores it open | — |
| `QUERY("name")` function | Yes | **Missing** | not in `expression/functions.ts` | — |
| Nesting | Yes | **Missing** | — | — |
| Saved **filter models** | *no AdapTable equivalent* | **Extra** | `saved-filters/index.ts` (schemaVersion 2, migrate); `FiltersToolbar.tsx` (pills, rename, JSON editor, count badges); `filtersToolbarLogic.ts` (`mergeFilterModels`, `subtractFilterModel`, `isNewFilter`) | Multi-pill activation with column-level OR + cross-column AND, net-new-delta capture |
| Runtime "Save current filter" | Yes | **Full (for filter models)** | `FiltersToolbar.tsx:353` `addFromLive` | — |
| Edit a saved entry | Settings Panel | **Partial** | raw-JSON `FilterModelEditor` popover | Developer-grade UX |
| `namedQueryApi` | 9 methods | **Missing** | — | — |

## 6. Data Sets

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Named switchable data sources | `dataSetOptions.dataSets` | **Missing** | `types/shared-types/src/dataProvider.ts` is the provider abstraction, not a user-facing switcher | — |
| Form on selection | Yes | **Missing** | — | — |
| `loadData` / `onSelect` | Yes | **Partial analogue** | Data Provider section of Custom Settings (live/historical, as-of date; `toolbar-date-settings`) | Two-mode switch, not arbitrary datasets |
| UI surfaces | Toolbar/tool panel/status bar/settings | **Partial** | Custom Settings panel only | — |
| `dataSetApi` / `DataSetSelected` | Yes | **Missing** | — | — |

## 7. Expression language — AdaptableQL vs stern-bak DSL

### 7a. Constructs

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| `[ColumnId]` refs | Yes | **Full** | `expression/parser.ts`, `tokenizer.ts` | Superset: dotted null-safe paths `[a.b.c]` |
| `COL("id")` | Yes | **Missing** | — | — |
| `FIELD('name')` | Yes | **Missing** | `data`/`row`/`columns` identifiers give whole-row access | — |
| `VAR("NAME")` | Yes | **Missing** | — | — |
| Comparison operators | Yes | **Full** | `evaluator.ts` / `evalOps.ts` | `==` is strict, no coercion |
| Arithmetic `+ - * / ^` | Yes | **Partial** | `+ - * / %`; `^` not supported, use `POW` | — |
| `AND`/`OR`/`NOT`/parens | Yes | **Full** | also `&& || !` | — |
| Ternary `? :` | Yes | **Full** | `TernaryNode` | — |
| `CASE … WHEN … END` | Yes | **Full** | sugar folding into ternaries | Extras: `IFS`, `SWITCH`, JS-style `if{}else{}` |
| `IN` / `BETWEEN` | As functions | **Full (operators)** | `ArrayNode` | `IN` requires a literal array |
| `K/M/B` suffixes | Yes | **Missing** | — | — |

### 7b. Function catalogue (stern-bak: 44 builtins in `expression/functions.ts`)

| Family | Present (equivalent) | Missing |
|---|---|---|
| Boolean (21) | `AND OR NOT EQ NEQ GT LT GTE LTE BETWEEN IN` (operators), `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IS_BLANK`≈`ISEMPTY`, `IS_NOT_BLANK`≈`ISNOTNULL`, `REGEX`=`REGEX_MATCH`, `IS_WORKDAY`=`IS_WEEKDAY` (18) | `ANY_CONTAINS`, `IS_NUMERIC`, `IS_HOLIDAY` |
| Scalar numeric (13) | `MIN MAX AVG ABS FLOOR ROUND MOD POW`, `ADD/SUB/MUL/DIV` as operators, `CEILING`=`CEIL` | — (extras `SQRT LOG EXP`) |
| Scalar date (13) | `NOW DAY MONTH YEAR`, `ADD_DAYS/MONTHS/YEARS`=`DATE_ADD`, `DIFF_DAYS`=`DATE_DIFF` | `DATE`, `CURRENT_DAY` (`TODAY()` exists), `WEEK`, `ADD_WEEKS`, `DIFF_WEEKS/MONTHS/YEARS` |
| Scalar string/misc (10) | `SUB_STRING`=`SUBSTRING` (length arg), `REPLACE LEN UPPER LOWER CONCAT` (extra `TRIM`) | `COALESCE`, `TO_ARRAY`, `NULL` |
| Aggregated (22) | `SUM AVG MIN MAX MEDIAN COUNT`, `STD_DEVIATION`=`STDEV`, `DISTINCT`≈`DISTINCT_COUNT` (extra `VARIANCE`) | `PERCENTAGE MODE ONLY WEIGHT GROUP_BY WHERE CUMUL OVER QUANT QUARTILE PERCENTILE` |
| Relative change (3) | — | `ANY_CHANGE PERCENT_CHANGE ABSOLUTE_CHANGE` (exist only as alert trigger modes in `alerts/evaluator.ts:93-120`) |
| Observable (9) | — | `GRID_CHANGE ROW_CHANGE TIMEFRAME NONE …` (`ROW_ADDED`/`ROW_REMOVED` are alert trigger events only, no time window) |
| Advanced (5) | `IF`, `?:`, `CASE` (extras `IFS`, `SWITCH`) | `QUERY`, `VAR`, `FIELD` |

**Totals: ~48 of ~96 AdaptableQL names have an equivalent; ~48 missing.** Six present ones have a different name; ~18 are operators where AdapTable has functions. AdaptableQL source text is **not** portable to stern-bak.

### 7c. Platform capabilities

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Aggregated expressions across rows | `GROUP_BY`, `WHERE`, `WEIGHT` | **Partial** | `aggregateColumnRefs` flag expands `[col]` to whole column via `ctx.allRows`; `usesAggregates.ts` | Grid-wide only; no grouping/filtering/weighting |
| Cumulative / Quantile | Yes | **Missing** | — | — |
| Observable / time-window | Rx `TIMEFRAME` | **Missing** | — | Alerts fire per-event |
| Custom function registration | Options with returnType/category/signatures | **Partial** | `ExpressionEngine.registerFunction()` (`expression/index.ts:107`) | Runtime API only; no options plumbing, no custom aggregated reducers, no per-module scoping |
| Validation with positioned errors | Yes | **Full** | `ExpressionEngine.validate()` → `{valid, errors:[{message, position, length}]}`; `validateCalls.ts` | — |
| AST access | Yes | **Full** | `ExpressionEngine.parse()`, exported `tokenize`/`parse`; FIFO parse cache | — |
| `getColumnsFromExpression` | Yes | **Missing** | walkable via AST | — |
| Server-side evaluation hook | `evaluateAdaptableQLExternally` | **Missing** | `compiler.ts` `tryCompileToAgString` is a client-side AG Grid fast path that throws on column refs | `docs/current-features.md:377` "server-side expression" claim not borne out |
| Case sensitivity option | Yes | **Missing** | — | — |
| Friendly column names in expressions | Yes | **Missing** | editor stores `colId` | — |

### 7d. Editor UI

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Expression editor component | Yes | **Full (arguably better)** | `customizer/ui/ExpressionEditor/` — `ExpressionEditor.tsx` (lazy + `FallbackInput`), `ExpressionEditorInner.tsx` (CodeMirror), `cmSyntax.ts` | One component for 7 call sites |
| Function palette | Yes | **Full** | `Palette.tsx` (`Ctrl+Shift+F`) | — |
| Column resources | Yes | **Full** | Column palette (`Ctrl+Shift+C`), `completionCatalog.ts`, `cmCompletions.ts` | — |
| Live validation | Yes | **Full** | `cmDiagnostics.ts`, `warnDeprecated` | — |
| Row preview | Yes | **Partial** | `onChange` hook only; no preview panel | — |
| Help reference | Yes | **Full** | `HelpOverlay.tsx`, `widget/help/ExpressionsSection.tsx` | ⚠️ help lists functions that don't exist (`LEFT`, `RIGHT`, `MID`, `COALESCE`, `SIGN`, `PI`, `HOUR`) |
| Query Builder UI | Yes | **Missing** | — | Biggest end-user expression gap |

---

## Summary

| Status | Count (96 rows) |
|---|---|
| Full | 21 |
| Partial | 29 |
| Different | 8 |
| Missing | 38 |
| Extra (beyond AdapTable) | 6 |

Predicates (42): 12 Full · 15 Partial · 3 Different · 12 Missing. Functions (~96): ~48 equivalent · ~48 missing.

### Top 5 gaps

1. **No predicate model at all.** AdapTable's `{PredicateId, Inputs}` abstraction, shared by Column Filters, Alerts, Format Columns, Flashing Cells and Badge Styles, has no counterpart. Filtering is AG Grid filter-model JSON end to end. This blocks custom predicates, module scoping, predicate reuse, and the filter-bar predicate dropdown.
2. **Quick Search is filter-only.** No highlighting, cycling, styling, overlay, or searchable-text callbacks.
3. **No Named Queries and no `QUERY()`.** Nothing is saved-and-reusable at the expression level; saved pills are AG Grid filter models.
4. **The Grid Filter is an inverted, buried row-exclusion setting** with no toolbar, Run button, save, recents, suspend, or Query Builder.
5. **AdaptableQL's aggregation, relative-change and observable tiers are absent.** Aggregates are grid-wide only; change/observable semantics are hard-coded into alert kinds. `registerFunction` exists but is wired to nothing; no server-side evaluation hook.
