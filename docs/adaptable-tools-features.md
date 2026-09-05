# AdapTable for AG Grid — Complete Feature Catalogue

> Research reference for SmartGrid. Compiled from a full read of https://www.adaptabletools.com/docs (≈300 pages, v23 docs, September 2026). This file is the single-page catalogue; each section links to a deep-dive under [`docs/adaptable/`](./adaptable/) that records every option, state shape, API method and event the docs expose.

**What AdapTable is.** A commercial, client-side extension for **AG Grid Enterprise v35** that turns the grid into a complete "data application" with 150+ features: persistent Layouts, rich filtering and an expression language, conditional formatting and styled cell renderers, alerts, calculated and free-text columns, editing tools, exports, team sharing and desktop interop. Ships for TypeScript, React, Angular and Vue. Requires a license key.

**Three concepts underpin everything:**

| Concept | Timing | Persisted |
|---|---|---|
| `AdaptableOptions` — design-time config, includes callbacks | design time | never |
| `InitialState` → **Adaptable State** — JSON objects users change at runtime | design + runtime | yes (localStorage by default, remote via `stateOptions`) |
| `AdaptableApi` — runtime API, one namespace per module | runtime | — |

Every feature below is a **module** with (a) an optional state section, (b) an options group, (c) an API namespace, (d) events, and (e) UI surfaces (Settings Panel section, wizard, toolbar, tool panel, status bar panel, menu items) gated by **entitlements** (`Full | ReadOnly | Hidden`). Almost every persisted object supports `IsSuspended` and `IsReadOnly`, and can be scoped to layouts via `Tags`.

Deep dives:
1. [Getting Started & Layouts](./adaptable/01-getting-started-and-layouts.md)
2. [UI Components & Theming](./adaptable/02-ui-components-and-theming.md)
3. [Core Features, Searching & Filtering](./adaptable/03-core-features-search-filter.md)
4. [Cell Rendering, Editing & Annotating](./adaptable/04-cell-rendering-editing-annotating.md)
5. [Grid Data, Advanced Features & Partners](./adaptable/05-grid-data-advanced-partners.md)
6. [Developer Guides, AdaptableQL & Technical Reference](./adaptable/06-developer-guides-adaptableql-reference.md)
7. [Prior-art survey of `stern-bak`](./adaptable/07-stern-bak-survey.md)

---

## 1. Layouts (grid structure)

A **Layout** is a named, persisted description of *which columns show and how*. AdapTable auto-saves the current Layout on every AG Grid change. Layout properties **override** the corresponding ColDef properties (`hide`, `pinned`, `sort`, `rowGroup`, `pivot`, `aggFunc`, `groupDisplayType`, `rowSelection`).

| Feature | What it does | Key shape |
|---|---|---|
| **Table Layouts** | Column order, visibility, sizing, pinning, sorting, per-layout headers, row groups, aggregations, row summaries, column filters, grid filter, row selection, open charts | `{ Name, TableColumns[], ColumnVisibility{}, ColumnSizing{}, ColumnPinning{}, ColumnSorts[], ColumnHeaders{}, RowGroupedColumns[], TableAggregationColumns[], RowSummaries[], ColumnFilters[], GridFilter, RowSelection, GrandTotalRow, OpenCharts[] }` |
| **Pivot Layouts** (distinct type since v23) | Pivot columns, grouped columns, aggregation columns, grand/column/aggregation totals, expand level, result-column order | `{ Name, PivotColumns[], PivotGroupedColumns[], PivotAggregationColumns[{ColumnId, AggFunc, Total}], PivotGrandTotal, PivotColumnTotal, PivotExpandLevel, PivotResultColumnsOrder }` |
| **Row Groups** | Single/multi/groupRows display; default expand/collapse with exceptions; formatting/filtering/sorting of group columns | `RowGroupDisplayType`, `RowGroupValues{ RowGroupDefaultBehavior, GroupKeys }` |
| **Aggregations** | Standard AG Grid funcs plus **weighted average** and **`only`**; grand total row; header suppression | `AggFunc: string \| true \| { type:'weightedAverage', weightedColumnId }` |
| **Column Groups** | Respects AG Grid groups; persists expand/collapse; format by group state | `ColumnGroupValues{}`, `ColumnGroupScope` |
| **Extended Layouts** | Scope Alerts, Format/Styled Columns, Shortcuts, etc. to specific layouts via Tags | `Tags[]`, `layoutTagOptions` |
| **Master Detail** | Plugin: each detail grid is a full AdapTable instance | `masterDetailAgGridPlugin({ detailAdaptableOptions, onDetailInit })` |
| **Tree Data** | Wraps AG Grid tree data; tree column filter UI | `_ag-Grid-AutoColumn_` |

Wizards: Table Layout (9 steps), Pivot Layout (8 steps). API `layoutApi` (~30 methods, `updateCurrentLayout(fn)` is the workhorse). Event `LayoutChanged` with 19 action names.

## 2. Searching & filtering

| Feature | What it does | Key shape |
|---|---|---|
| **Quick Search** | Grid-wide text search that highlights (wraps AG Grid Find); optional filter mode; next/prev cycling; three styles | `QuickSearch{ QuickSearchText, CellMatchStyle, TextMatchStyle, CurrentTextMatchStyle }` |
| **Column Filters** | Per-column predicate filters (AND/OR), stored **in the Layout**; Filter Form popup, Filter Bar (floating filter) with wildcards (`= > < : [ #`), `In` filter with tree/lazy values; 40 system predicates + custom | `ColumnFilter{ ColumnId, Predicates[{PredicateId, Inputs}], PredicatesOperator }` |
| **Grid Filter** | One grid-wide AdaptableQL boolean expression per Layout; inline editor, Query Builder or Expression Editor; save as Named Query | `GridFilter{ Expression }` |
| **Named Queries** | Saved boolean expressions reusable via `QUERY("name")` | `NamedQuery{ Name, BooleanExpression }` |
| **Data Sets** | Named data sources users switch between; optional parameter form | `dataSetOptions.dataSets[{ name, loadData, form }]` |
| **Custom Sorting** | Hard-coded value order or comparer function per column | `CustomSort{ ColumnId, Name, SortedValues[] }` |

## 3. Cell rendering & formatting

| Feature | What it does | Key shape |
|---|---|---|
| **Format Columns** | Conditional **Style** + **Display Format** for cells or headers, scoped by column/data type/type and row kind; array order = precedence; styles merge, formats don't | `FormatColumn{ Name, Scope, Style, DisplayFormat, Rule{Predicates \| BooleanExpression}, Target, RowScope, ColumnGroupScope }` |
| Display Formats | `NumberFormatter` (18 options, 15 presets like `Dollar`, `K`, `BasisPoints`), `StringFormatter` (case/trim/prefix/suffix/content), `DateFormatter` (TR35 pattern), **Template** (`[value]`, `[column]`, `[rowData.x]`), **Custom** (`customDisplayFormatters`) | `DisplayFormat{ Formatter, Options }` |
| **Styled Columns** (8 renderers) | Gradient, Percent Bar, Badge, Sparkline (AG Charts), Bullet Chart, Rating, Range Bar, Icon — one per column, data-driven ranges with `Col-Min/Max/Avg/Median` endpoints | `StyledColumn{ ColumnId, <XStyle>, RowScope }` |
| **Flashing Cells / Rows** | Up/Down/Neutral styles on data change, duration or `'always'`, cell or row target | `FlashingCellDefinition{ Scope, Rule, FlashTarget, FlashDuration, Up/Down/NeutralChangeStyle }` |
| **Edit-state styling** | `editableCellStyle`, `readOnlyCellStyle`, `editedCellStyle` | `userInterfaceOptions` |
| **Column headers** | Per-layout captions; `columnOptions.columnHeader(ctx)` for generated columns | `ColumnHeaders{}` |

`AdaptableStyle` = `{ ForeColor, BackColor, BorderColor, BorderRadius, FontWeight, FontStyle, FontSize, Alignment, TextDecoration, ClassName }`; colours may reference `var(--ab-color-*)`.

## 4. Special columns

| Feature | What it does | Key shape |
|---|---|---|
| **Calculated Columns** | Virtual columns from AdaptableQL: Standard (per-row), Aggregated (`SUM/AVG/…` with `GROUP_BY`), Cumulative (`CUMUL … OVER`), Quantile (`QUANT`); chainable; trigger flashes/alerts | `CalculatedColumn{ ColumnId, FriendlyName, Query{ ScalarExpression \| AggregatedScalarExpression }, CalculatedColumnSettings{ DataType, Width, Filterable, Sortable, Groupable, Pivotable, Aggregatable, … } }` |
| **Free Text Columns** | User-owned editable columns whose values live in Adaptable State keyed by primary key | `FreeTextColumn{ ColumnId, FriendlyName, DefaultValue, FreeTextStoredValues[], TextEditor, FreeTextColumnSettings }` |
| **Action Columns** | Design-time button/dropdown columns; commands `create/clone/edit/delete` open Row Forms | `actionColumnOptions.actionColumns[{ columnId, actionColumnButton, actionColumnSettings, rowScope }]` |
| **Hidden columns** | `type: 'hiddenColumn'` — usable in expressions, never shown | ColDef |

## 5. Alerts & notifications

| Feature | What it does | Key shape |
|---|---|---|
| **Alerts** (7 kinds) | Data Change (predicates/expression), Relative Change (`PERCENT_CHANGE`…), Row Change (`ROW_ADDED/REMOVED`), Aggregation (`SUM([x]) > '50M'`), Observable (Rx: `ROW_CHANGE(COUNT(…), TIMEFRAME('10m'))`), Scheduled (cron / one-off), Validation (`PreventEdit`) | `AlertDefinition{ Name, MessageType, MessageHeader, MessageText, Scope, Rule, AlertProperties{ DisplayNotification, HighlightCell/Row, JumpToCell/Row, PreventEdit, LogToConsole, ShowInDiv, NotificationDuration }, AlertForm, Schedule }` |
| Alert behaviours | Toast, system status, console, highlight, jump, custom container div, command buttons (`highlight-cell`, `undo`, `suspend`, custom `commandHandlers`), full **Alert Forms** | `alertOptions` |
| **System Status Messages** | Session-scoped Info/Success/Warning/Error messages in toolbar/tool panel/status bar/toasts | `systemStatusApi.set*SystemStatus()` |
| **Toast notifications** | Global position, duration, transition, max, progress bar | `notificationsOptions` |
| **Highlighting & Jumping** | Programmatic cell/row/column highlight with timeout; jump to row/column/cell | `gridApi.highlightCell/Row/Column`, `jumpTo*` |

## 6. Editing

| Feature | What it does | Key shape |
|---|---|---|
| **Smart Edit** | Add/Subtract/Multiply/Divide (+custom) across selected numeric cells in one column with preview and tri-state validation | `smartEditApi`, `editOptions.smartEditOptions` |
| **Bulk Update** | Set one value across selected cells of one column | `bulkUpdateApi` |
| **Plus/Minus nudges** | `+`/`-` (custom keys) increments by rule-scoped value | `PlusMinusNudge{ Scope, NudgeValue, Rule, IncrementKey, DecrementKey }` |
| **Shortcuts** | Letter key while editing applies operation (`K` × 1000) | `Shortcut{ Scope, ShortcutKey, ShortcutOperation, ShortcutValue }` |
| **Cell Editors** | Select (rich select from distinct/custom values), Numeric, Percentage, Date Picker (buttons, locale, format) | `editOptions.showSelectCellEditor`, `dateInputOptions` |
| **Data Validation** | Pre-edit (`isCellEditable`), client (Alert with `PreventEdit`), server (`validateOnServer` → accept/revert/substitute) | `editOptions` |
| **Data Change History** | Session log of every cell change with undo, monitor grid, custom buttons | `dataChangeHistoryOptions`, `dataChangeHistoryApi` |
| **Row Forms** | Create/Clone/Edit/Delete popup forms generated from columns; field overrides; auto-handle | `rowFormOptions`, `rowFormApi.display*RowForm()` |
| **Custom edit values** | Per-cell option lists for Select editor and Bulk Update, sync or async | `editOptions.customEditColumnValues` |

## 7. Annotating

| Feature | What it does | Key shape |
|---|---|---|
| **Notes** | Personal single-cell notes in Adaptable State; hover or menu | `Note{ PrimaryKeyValue, ColumnId, Text, Timestamp }` |
| **Comments** | Threaded collaborative cell comments; developer-provided persistence | `commentOptions.loadCommentThreads/persistCommentThreads` |

## 8. Working with grid data

| Feature | What it does | Key shape |
|---|---|---|
| **Exporting** | Reports (All Data / Current Layout / Selected / custom column+row scope) × Formats (Excel, **Visual Excel** WYSIWYG, CSV, JSON) × Destinations (Download, Clipboard, custom with form); scheduled reports (cron) | `Report{ Name, ReportColumnScope, ReportRowScope, Scope, Query }`, `ReportSchedule{ …, Schedule{ IsOneOff, CronExpression, RunAt } }`, `exportOptions` (14 options) |
| **Importing** | Wizard to load JSON/CSV/pasted text, map columns, validate, add/update rows | `dataImportOptions{ fileHandlers, textHandler, validate, handleImportedData }` |
| **Selecting** | Programmatic cell/row/column selection by index, key or query; selection events | `gridApi.selectCellRange/ByQuery/selectRows…`, `CellSelectionChanged`, `RowSelectionChanged` |
| **Cell Summaries** | Live Sum/Avg/Median/Mode/Distinct/Max/Min/Count/Weighted Avg/Only/StdDev of selected cells (+custom ops) | `cellSummaryOptions`, `cellSummaryApi` |
| **Row Summaries** | Pinned top/bottom aggregation rows per Table Layout | `Layout.RowSummaries[{ Position, ColumnsMap, IncludeOnlyFilteredRows }]` |
| **Transposing** | Rows-as-columns popup view | `gridApi.showTransposedView(config)` |
| **Charts** | Persist and reopen AG Grid integrated charts; external chart libraries; open with Layout | `Charting{ ChartDefinitions[{ Name, Model }] }`, `chartingOptions` |
| **Managing grid data** | `loadGridData`, `addGridData`, `updateGridData`, `deleteGridData`, `manageGridData`, `setCellValue(s)` with PK checks and events | `gridApi` (~120 methods) |

## 9. Grid chrome (UI components)

| Surface | What it does | Options / state |
|---|---|---|
| **Settings Panel** | Modal/window hub; 8 nav groups; collection sections (New/Edit/Clone/Delete/Share/Suspend) and configuration sections; custom panels | `settingsPanelOptions`, `settingsPanelApi` |
| **Dashboard** | Header (icon, title, quick search, module/custom buttons), tabs of **15 module toolbars**, pinned toolbars; docked/collapsed/floating/hidden modes; custom toolbars with buttons/forms/components | `Dashboard{ Tabs, PinnedToolbars, ModuleButtons, IsCollapsed, IsFloating, IsHidden }`, `dashboardOptions` |
| **Tool Panel** | AG Grid sidebar panel with **15 module panels** + custom panels + buttons | `ToolPanel{ ModuleButtons, ToolPanels }`, `toolPanelOptions` |
| **Status Bar** | Up to 3 AG Grid status panels hosting **10 module panels** | `StatusBar{ StatusBars[{ Key, StatusBarPanels }] }` |
| **Column Menu** | ~35 AdapTable items in 5 groups + AG Grid + custom; `customColumnMenu(ctx)` | `columnMenuOptions` |
| **Context Menu** | Export tree, actions (notes, comments, filters, flash, FDC3), editing, grid/column; `customContextMenu(ctx)` | `contextMenuOptions` |
| **Wizards** (14) | Multi-step (3–9) authoring for every object type; Ctrl+N step nav; Summary step; Tags step | `wizardOptions` |
| **Expression Editor** | Function palette, operator toolbar, live validation, column/named-query resources, row preview | `expressionOptions` |
| **Query Builder** | Dropdown condition builder with AND/OR groups (Grid Filter only) | `gridFilterOptions.availableFilterEditors` |
| **Popups** | Custom windows, loading screen, progress indicator | `userInterfaceApi` |
| **Shared primitives** | `AdaptableButton` (label/icon/tone/variant/hidden/disabled fns), `AdaptableForm` (13 field types, groups, validation), `AdaptableIcon` (150+ system icons), `AdaptableStyle` | — |
| **Theming** | `light`/`dark`/`os`; `--ab-*` CSS variable contract (colors, 12-swatch palette, 20 swatches, spacing, typography, `--ab-cmp-*`); coordinates AG Grid theme mode; Tailwind `twa:` prefix in `adaptable` layer | `Theme{ CurrentTheme, SystemThemes }`, `themeApi` |
| **Accessibility** | Full keyboard nav and ARIA on all AdapTable-owned UI | — |

## 10. Advanced

| Feature | What it does | Key shape |
|---|---|---|
| **Team Sharing** | Share objects between users via developer store; Snapshot / Active (revisioned, auto-sync) / Referenced (with dependencies) | `teamSharingOptions{ loadSharedEntities, persistSharedEntities, updateInterval, … }`, `SharedEntity` |
| **Permissions** | `defaultAccessLevel` + per-module entitlements (static or function); object-level `IsReadOnly` | `entitlementOptions` |
| **Adaptable State management** | `loadState/applyState/saveState/persistState/clearState`; `Revision` with `Override`/`KeepUserDefined` for post-deploy updates; migration helper; State Management module UI (clear/export/import) | `stateOptions`, `stateApi` |
| **No Code** | Plugin: build a grid from an uploaded JSON/Excel file via a 6-step wizard | `nocode()` |
| **FDC3 2.x** | Map columns to 14 standard contexts; raise 14 standard intents; broadcast/listen; auto action columns and context-menu items | `fdc3Options{ gridDataContextMapping, intents, contexts }` |
| **Scheduling** | Shared `Schedule{ IsOneOff, CronExpression, RunAt }` for reports and alerts | — |
| **Partners** | OpenFin (notifications, Live Excel), interop.io (notifications, FDC3), ipushpull (snapshot/live page push) | plugin options |
| **Server-Side Row Model** | Supported; filter/sort state exposed for server evaluation; aggregated calc columns server-side | `stateApi.getAdaptableFilterState()` |
| **Server evaluation of expressions** | `evaluateAdaptableQLExternally` + AST from events | `expressionOptions` |
| **Column management** | `cellDataType` (incl. array types), column types, scope, runtime ColDef updates, header context callback, `AdaptableColumn` model, Column Info panel | `columnOptions`, `columnApi` |
| **Support tooling** | Debug logging namespaces, perf profiling tracks, testing guidance, performance limits (~100k rows CSRM) | — |

## 11. AdaptableQL (expression language)

- **Expression kinds:** Standard (scalar/boolean per row), Aggregated (`SUM`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT`, `MODE`, `DISTINCT`, `ONLY`, `STD_DEVIATION`, `PERCENTAGE` with `GROUP_BY`, `WHERE`, `WEIGHT`), Cumulative (`CUMUL … OVER`), Quantile (`QUANT`, `QUARTILE`, `PERCENTILE`), Observable (`GRID_CHANGE`, `ROW_CHANGE`, `ROW_ADDED`, `ROW_REMOVED` with `TIMEFRAME`), Relative change (`ANY_CHANGE`, `PERCENT_CHANGE`, `ABSOLUTE_CHANGE`).
- **Syntax:** `[colId]`, `COL("id")`, `FIELD('path')`, `VAR("name")`, `QUERY("named")`, comparison/arithmetic/logical operators, ternary `? :`, `CASE WHEN … THEN … ELSE … END`, `K/M/B` suffixes.
- **Function catalogue:** ~20 boolean, ~35 scalar (numeric, date, string, misc), 12 aggregated, 3 relative-change, 4 observable, 5 advanced. Custom boolean/scalar/aggregated functions with per-module scoping; system function allow-lists; custom query variables; non-column fields.
- **Predicates:** ~45 system predicates by data type (`Blanks`, `In`, `GreaterThan`, `Between`, `Contains`, `Regex`, `Today`, `ThisQuarter`, `NextWorkDay`, `Holiday`, `True`…); custom predicates with inputs, handler, `toString`, `extends`; per-module system predicate lists.
- **Holiday calendars** drive work-day predicates and functions.

## 12. Complete inventory of persisted state sections

`Alert`, `Application`, `CalculatedColumn`, `Charting`, `CustomSort`, `Dashboard`, `Export` (Reports + ReportSchedules), `FlashingCell`, `FormatColumn`, `FreeTextColumn`, `Layout` (incl. ColumnFilters, GridFilter, RowSummaries, OpenCharts), `NamedQuery`, `Note`, `PlusMinus`, `QuickSearch`, `Shortcut`, `StatusBar`, `StyledColumn`, `Theme`, `ToolPanel`, `UserInterface`. Every section accepts `Revision`; every object carries `Uuid`, `Source`, `IsReadOnly`, `IsSuspended?`, `Tags?`, `Metadata?`.

## 13. Complete inventory of option groups (36)

`actionColumnOptions`, `alertOptions`, `calendarOptions`, `cellSummaryOptions`, `chartingOptions`, `columnMenuOptions`, `columnOptions`, `commentOptions`, `containerOptions`, `contextMenuOptions`, `customSortOptions`, `dashboardOptions`, `dataChangeHistoryOptions`, `dataImportOptions`, `dataSetOptions`, `editOptions`, `entitlementOptions`, `exportOptions`, `expressionOptions`, `fdc3Options`, `filterOptions`, `flashingCellOptions`, `formatColumnOptions`, `gridFilterOptions`, `layoutOptions`, `noteOptions`, `notificationsOptions`, `predicateOptions`, `quickSearchOptions`, `rowFormOptions`, `settingsPanelOptions`, `stateOptions`, `teamSharingOptions`, `toolPanelOptions`, `userInterfaceOptions`, `wizardOptions` — plus root `primaryKey`, `adaptableId`, `adaptableStateKey`, `licenseKey`, `userName`, `adaptableContext`, `plugins`, `initialState`.

## 14. Complete inventory of events (29)

`AdaptableReady`, `AdaptableStateChanged`, `AdaptableStateReloaded`, `BeforeAdaptableStateChanges`, `AlertFired`, `CalculatedColumnChanged`, `CellChanged`, `CellSelectionChanged`, `ChartChanged`, `ColumnFilterApplied`, `CommentChanged`, `CustomToolbarConfigured`, `DashboardChanged`, `DataImported`, `DataSetSelected`, `FDC3Message`, `FlashingCellDisplayed`, `GridFilterApplied`, `GridSorted`, `LayoutChanged`, `LiveDataChanged`, `ReportScheduleRan`, `RowChanged`, `RowFormSubmitted`, `RowSelectionChanged`, `SystemStatusMessageDisplayed`, `TeamSharingEntityChanged`, `ThemeSelected`. All carry `BaseContext { adaptableApi, adaptableContext, adaptableId, adaptableStateKey, clientTimestamp, userName }`.

## 15. Complete inventory of API namespaces (50)

`actionColumnApi`, `alertApi`, `applicationApi`, `bulkUpdateApi`, `calculatedColumnApi`, `calendarApi`, `cellSummaryApi`, `chartingApi`, `columnApi`, `columnMenuApi`, `columnScopeApi`, `commentApi`, `contextMenuApi`, `customSortApi`, `dashboardApi`, `dataChangeHistoryApi`, `dataImportApi`, `dataSetApi`, `entitlementApi`, `eventApi`, `exportApi`, `expressionApi`, `fdc3Api`, `filterApi` (`columnFilterApi`, `gridFilterApi`), `flashingCellApi`, `formatColumnApi`, `freeTextColumnApi`, `gridApi`, `layoutApi`, `namedQueryApi`, `noteApi`, `optionsApi`, `pluginsApi`, `plusMinusApi`, `predicateApi`, `quickSearchApi`, `scheduleApi`, `scopeApi`, `settingsPanelApi`, `shortcutApi`, `smartEditApi`, `stateApi`, `statusBarApi`, `styledColumnApi`, `systemStatusApi`, `teamSharingApi`, `themeApi`, `toolPanelApi`, `userInterfaceApi`, plus plugin APIs and raw `agGridApi`.

---

## 16. What this means for SmartGrid

Three observations fall directly out of the catalogue and are the foundation of the SmartGrid design (see [`smartgrid-vision.md`](./smartgrid-vision.md)):

1. **Every feature is a JSON object with a documented schema.** Format Columns, Alerts, Layouts, Styled Columns, Calculated Columns, Reports, Shortcuts — all are plain serialisable objects in a `Record<module, state>` store. The 14 wizards and ~40 settings-panel sections exist only to *produce those objects by hand*. A generative assistant that emits the same objects makes most of that UI optional.

2. **The chrome is four-fold redundant.** Dashboard, Tool Panel, Status Bar and Settings Panel all expose the same module actions, each with its own state slice, options object, API and configuration UI. The custom-extension contract (`{ name, title, buttons?, form?, render?, frameworkComponent? }`) is identical across them. One surface with one extension contract is enough.

3. **The expression language and predicate catalogue are the real moat**, not the forms. AdaptableQL (with AST access, validation, server evaluation) and ~45 typed predicates are what make rules, alerts, filters and calculated columns expressive. That layer is small, well-specified and exactly the vocabulary an LLM should target.
