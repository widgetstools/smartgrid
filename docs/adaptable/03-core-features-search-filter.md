# AdapTable for AG Grid — Core Features & Searching/Filtering Reference

Source: https://www.adaptabletools.com/docs (handbook pages). No pages failed to fetch.

---

## 1. Calculated Columns

### What it does
Special columns whose cell values are computed from an AdapTableQL expression rather than sourced from the row data. They update dynamically when referenced cells change, behave as normal AG Grid columns (sort/filter/group/pivot/aggregate/resize), and can be referenced by other Calculated Columns, Alerts, Flashing Cells, Charts, Conditional Styles and Reports. Cells are read-only (only the expression can be edited). AdapTable stores only the *definition* in state, never computed values.

### Four types (by expression kind)
| Type | Query property | Notes |
|---|---|---|
| Standard | `Query.ScalarExpression` | Per-row; references cells in the same row via `[colId]`. Supports math operators, ternary (`? :`), `CASE WHEN … THEN … ELSE … END`, date functions (`DIFF_YEARS`, `ADD_YEARS`, `CURRENT_DAY()`), custom Expression Functions. |
| Aggregated | `Query.AggregatedScalarExpression` | Across many rows: `SUM`, `AVG` (supports `WEIGHT`), `MIN`, `MAX`, `PERCENTAGE`, `COUNT`, optional `GROUP_BY([col])`. Not supported with Server-Side Row Model. Can nest scalar expressions. Example: `PERCENTAGE([open_issues_count], SUM([closed_issues_count], GROUP_BY([language])))`. |
| Cumulative | `Query.AggregatedScalarExpression` | Running aggregation in a given order: `CUMUL( SUM([github_stars]), OVER([created_at]) )`. |
| Quantile | `Query.AggregatedScalarExpression` | Bucketing: `QUANT([value], 4)` or `QUANT([value], 4, GROUP_BY([type]))` (quartile/quintile/decile/percentile). |

### Object shape (`CalculatedColumn`)
```ts
{
  ColumnId: string;                      // required, unique
  FriendlyName?: string;                 // defaults to ColumnId
  Query: { ScalarExpression?: string; AggregatedScalarExpression?: string }; // AdaptableCalculatedColumnQuery
  CalculatedColumnSettings: {
    DataType: AdaptableColumnDataType;   // mandatory: 'number'|'text'|'date'|'boolean'...
    Width?: number;                      // px; auto if unset
    Filterable?: boolean;                // default false
    Sortable?: boolean;                  // default false
    Groupable?: boolean;                 // default false
    Pivotable?: boolean;                 // default false
    Aggregatable?: boolean;              // default false
    Resizable?: boolean;                 // default false
    SuppressMenu?: boolean;              // default false
    SuppressMovable?: boolean;           // default false
    ColumnTypes?: string[];              // custom AG Grid column types
    HeaderToolTip?: string;
    ShowToolTip?: boolean;               // shows expression as cell tooltip, default false
  };
  IsReadOnly?: boolean;                  // blocks edit even with Full entitlement
}
```

### State
`initialState.CalculatedColumn.CalculatedColumns: CalculatedColumn[]` (`CalculatedColumnState`).

### Row-grouping integration
Aggregated Calculated Columns can be wired to AG Grid group-row summaries via the Layout's `TableAggregationColumns: [{ ColumnId, AggFunc: 'sum'|'avg'|'min'|'max' }]` alongside `RowGroupedColumns`. Calculated Columns can be row-group, pivot, or aggregation columns in Pivot Layouts.

### AG Grid integration
- Optionally pre-declare in ColDefs with `type: 'calculatedColumn'` and `colId` matching `ColumnId` (lets you nest inside column groups / add `columnGroupShow`); AdapTable wires the valueGetter.
- Value getters run on every access; the docs recommend AG Grid `valueCache: true` for sort performance.
- Referencing chains (A → calc B → calc C) are unlimited but can affect performance; dependent columns emit synthetic `calculatedColumnChange` cell-change events, which drive Flashing Cells (`Rule: { BooleanExpression: 'ANY_CHANGE()' }`) and Data Change Alerts.

### UI
- Settings Panel → Calculated Column section: list with Edit/Delete/Share, Add button.
- Calculated Column Wizard (6 steps): type → ColumnId/FriendlyName/HeaderToolTip → expression (Expression Editor) → DataType/Width → column settings → finish (auto-added to current Layout).
- Column Menu: "Edit Calculated Column". Dashboard module button `'CalculatedColumn'`; Status Bar panel `'CalculatedColumn'`.
- Entitlements: Full / ReadOnly / Hidden. Cannot be suspended; cannot flash (yet).

### API (`calculatedColumnApi`)
`addCalculatedColumn(cc)`, `editCalculatedColumn(cc)`, `deleteCalculatedColumn(columnId)`, `getCalculatedColumns()`, `getCalculatedColumnById(id)`, `getCalculatedColumnForColumnId(columnId)`, `getCalculatedColumnState()`, `getAggregatedCalculatedColumns()`, `refreshAggregatedCalculatedColumn(columnId)`, `refreshAggregatedCalculatedColumns()`, `openCalculatedColumnSettingsPanel()`.

### Event
`CalculatedColumnChanged` — `{ actionName: 'CALCULATED_COLUMN_ADD'|'CALCULATED_COLUMN_EDIT'|'CALCULATED_COLUMN_DELETE', calculatedColumn, calculatedColumnExpressionAST, adaptableContext }`. Subscribe: `api.eventApi.on('CalculatedColumnChanged', cb)`. Useful for server-side expression evaluation.

---

## 2. Alerts

### What it does
Alerts fire when the `Rule` in an `AlertDefinition` is met (or a `Schedule` fires). AdapTable always (a) shows the alert in the Alert Toolbar / Tool Panel / Status Bar with a running count and (b) raises `AlertFired`; additional behaviours are configurable. Alerts can be suspended/resumed, and definitions persist in state.

### Alert kinds
| Kind | Rule property | Scope | Notes |
|---|---|---|---|
| Data Change | `Rule.Predicates[]` or `Rule.BooleanExpression` | ColumnIds / DataTypes / All | Most common. Multiple predicates combine (v14+). Triggered by edits or ticking data. |
| Relative Change | `Rule.BooleanExpression` | columns | `ANY_CHANGE([c])`, `PERCENT_CHANGE([c], "INCREASE"\|"DECREASE") > n`, `ABSOLUTE_CHANGE([c]) > n`. |
| Row Change | `Rule.ObservableExpression` | `{ All: true }` (required) | `ROW_ADDED()` / `ROW_REMOVED()` with optional `WHERE [language] = 'TypeScript'`. Must use `gridApi.addGridData()` not AG Grid `applyTransaction` for detection. |
| Aggregation | `Rule.AggregatedBooleanExpression` | `{ All: true }` | `SUM([PnL]) > '50M' WHERE [Currency] = 'USD'`, `COUNT([language]) >= 3 WHERE …`; functions SUM/MIN/MAX/AVG/COUNT. |
| Observable | `Rule.ObservableExpression` | `{ All: true }` | Rx-based: `ROW_CHANGE(COUNT([c], 5), TIMEFRAME('10m'))`, `GRID_CHANGE(NONE([c]), TIMEFRAME('2h'))`, `ROW_CHANGE(MAX([c]), TIMEFRAME('1d')) WHERE …`. Suspending removes the Rx subscription; counts restart on resume. |
| Scheduled | `Schedule` | n/a | `{ IsOneOff: boolean; CronExpression?: '30 9 * * 1-5'; RunAt?: ISOString }`. No highlight/jump/undo behaviours. One-offs don't auto-suspend after firing. |
| Validation | `Rule.Predicates`/expression + `AlertProperties.PreventEdit: true` | columns | Evaluates the *proposed* value before commit; rejects and reverts. Alternative: undo alert (commit then revert). |

### `AlertDefinition` shape (`AlertState.AlertDefinitions: AlertDefinition[]`)
Two concrete types: `RuleBasedAlertDefinition` and `ScheduledAlertDefinition`, sharing `AlertDefinitionBase`:
```ts
{
  Name: string;
  MessageType: 'Info'|'Success'|'Warning'|'Error';   // AdaptableMessageType
  MessageHeader?: string;   // template literals allowed
  MessageText?: string;     // auto-generated if absent
  IsSuspended?: boolean;
  IsReadOnly?: boolean;
  // presentation (both types)
  AlertProperties: {
    DisplayNotification?: boolean;           // toast
    DisplaySystemStatusMessage?: boolean;
    LogToConsole?: boolean;
    NotificationDuration?: number | 'always';  // NotificationsOptions['duration'], default 3000
    ShowInDiv?: boolean;                     // render into alertContainer div
    // RuleAlertProperties only:
    HighlightCell?: boolean | AdaptableStyle;
    HighlightRow?: boolean | AdaptableStyle;  // e.g. { BackColor:'Purple', ForeColor:'White' }
    JumpToCell?: boolean;
    JumpToRow?: boolean;
    PreventEdit?: boolean;                   // default false (Validation Alerts)
    // ScheduledAlertProperties only:
    IncludeSuspendButton?: boolean;
  };
  // Rule-based only
  Scope?: { ColumnIds?: string[]; DataTypes?: string[]; All?: boolean };  // ColumnScope
  Rule?: { Predicates?: {PredicateId: string; Inputs?: any[]}[]; BooleanExpression?: string;
           ObservableExpression?: string; AggregatedBooleanExpression?: string };  // AlertRule
  AlertForm?: string | AlertButtonForm;   // name of form in alertOptions.alertForms, or inline buttons
  // Scheduled only
  Schedule?: { IsOneOff: boolean; CronExpression?: string; RunAt?: string };
}
```
Message template literals (Definition properties only): `[newValue]`, `[oldValue]`, `[column]`, `[primaryKeyValue]`, `[rowData.x]`, `[context.x]`, `[timestamp]`, `[trigger]` (Edit/Tick/Undo/AggChange); row-change: `[numberOfRows]`, `[trigger]` (Added/Edited/Deleted/Loaded). Priority: `alertOptions.alertMessageHeader/Text` functions > Definition `MessageHeader/Text` > auto-generated.

### `alertOptions` (AdaptableOptions)
| Property | Type | Default |
|---|---|---|
| `alertForms` | `AlertForm<TData>[]` — `{ name, form: { fields: FormField[]; buttons: FormButton[] } }` | — |
| `commandHandlers` | `CommandHandler[]` — `{ name: string; handler: (button: AlertButton, context: AlertFormContext) => void }` | — |
| `alertMessageHeader` / `alertMessageText` | `(ctx: AlertMessageContext) => string \| undefined`; ctx = `{ alertDefinition, cellDataChangedInfo, rowDataChangedInfo }` | — |
| `cellHighlightDuration` | number ms | 2000 |
| `rowHighlightDuration` | number ms | 4000 |
| `statusbarHighlightDuration` | number ms | 2000 |
| `dataChangeDetectionPolicy` | `'rawValue' \| 'formattedValue'` | `'rawValue'` |
| `maxAlertsInStore` | number | 20 |
| `showMissingPrimaryKeyAlert` | boolean | false |

Highlight colour defaults to the MessageType colour (`--ab-color-info/success/warn/destructive`) unless an `AdaptableStyle` is given.

### Notifications, buttons and forms
- `DisplayNotification: true` shows a toast (position via `notificationsOptions.position: 'TopCenter'|'BottomCenter'`).
- **Alert Command Buttons**: `{ Label, Command: string[], ButtonStyle: {tone, variant}, Actions }`. System commands: `highlight-cell`, `highlight-row`, `jump-to-cell`, `jump-to-row`, `jump-to-column`, `suspend`, `undo`. Custom commands map to `commandHandlers`. End-users can add command buttons at runtime; full forms are design-time only.
- **Alert Forms**: Adaptable Form with fields (`fieldType`, `label`, `name`) and buttons (`label`, `disabled`, `onClick`, `buttonStyle`); handler receives `AlertFormContext = { formData, alert, adaptableApi }`. `context.alert.alertType == 'cellChanged'` → `AdaptableCellChangedAlert.cellDataChangedInfo`. Typical actions: `gridApi.setCellValue({ columnId, newValue, primaryKeyValue, rowNode })`, `systemStatusApi.setWarningSystemStatus()`.
- Behaviours fire on alert; Commands fire on button click.

### UI
Settings Panel → Alert section (create/edit/delete/suspend/resume). Alert Wizard (Scheduled: Name → Type → Schedule → Message → Notification → Behaviour → Tags). Dashboard module button `'Alert'`, Alert Toolbar, Tool Panel, Status Bar panel `'Alert'`, toast notifications, System Status panel, custom container div. Entitlements: Full / ReadOnly (alerts still fire; user can clear) / Hidden.

### API (`alertApi`)
Retrieval: `getAlertDefinitions(config?)`, `getActiveAlertDefinitions()`, `getSuspendedAlertDefinitions()`, `getAlertDefinitionByName(name)`, `getAlertDefinitionById(id)`, `findAlertDefinitions(criteria)`, `getAlertState()`.
Management: `addAlertDefinition`, `editAlertDefinition`, `deleteAlertDefinition`, `suspendAlertDefinition`, `suspendAllAlertDefinition()`, `unSuspendAlertDefinition`, `unSuspendAllAlertDefinition()`.
Display: `displayAdaptableAlert(alert)`, `displayAdaptableAlertNotification(alert)`, `showAlert(header, text, type, props)`, `showAlertInfo/Success/Warning/Error(header, text)`.
Evaluation: `evaluateAlertDefinitions(defs)`, `applyScheduledAlertDefinition(def)`. UI: `openAlertSettingsPanel()`.

### Event: `AlertFired`
`AlertFiredInfo = { alert: AdaptableAlert; adaptableContext }`.
- `AdaptableCellChangedAlert.cellDataChangedInfo`: `{ changedAt: number; column: AdaptableColumn; newValue; oldValue; preventEdit: boolean; primaryKeyValue; rowData; rowNode: IRowNode; trigger: 'edit'|'tick'|'undo'|'aggChange'|'calculatedColumnChange' }`.
- `AdaptableRowChangedAlert.rowDataChangedInfo`: `{ changedAt; dataRows: TData[]; rowNodes: IRowNode[]; rowTrigger: 'Load'|'Add'|'Update'|'Delete' }`.
Subscribe: `api.eventApi.on('AlertFired', cb)`.

---

## 3. Action Columns

### What it does
Design-time-only special columns containing AdapTable Buttons (or a dropdown menu of them) for row-based actions. Not in the AG Grid datasource; persisted in AdapTable State (so they can be positioned/pinned/hidden in Layouts) but cannot be created/edited/deleted via UI.

### Configuration (`adaptableOptions.actionColumnOptions.actionColumns: ActionColumn<TData>[]`)
```ts
{
  columnId: string;                                // required; header if no friendlyName
  friendlyName?: string;
  actionColumnButton: ActionColumnButton | ActionColumnButton[];
  actionColumnSettings?: {
    displayMode?: 'buttons' | 'dropdown';          // default 'buttons'
    dropdownLabel?: string;                        // default 'Actions'
    autoWidth?: boolean;                           // default false; estimates from static labels/icons
    width?: number;  minWidth?: number;
    resizable?: boolean;                           // default true
    suppressMenu?: boolean;  suppressMovable?: boolean;   // default false
  };
  rowScope?: { ExcludeGroupRows?: boolean; ExcludeSummaryRows?: boolean };  // RowScope
}
```
`ActionColumnButton extends AdaptableButton<ActionColumnContext>`:
```ts
{
  label?: string | (button, context) => string;
  tooltip?: string | fn;
  icon?: { name?: string; src?: string; style?: CSSProperties } | fn;   // AdaptableIcon
  iconPosition?: 'start' | 'end';                 // default 'start'
  buttonStyle?: { variant?: 'raised'|'outlined'|'text'; tone?: 'accent'|'success'|'info'|'warning'|'danger'|'neutral' } | fn;
  onClick?: (button, context: ActionColumnContext) => void;
  hidden?: boolean | fn;   disabled?: boolean | fn;
  command?: 'create' | 'clone' | 'edit' | 'delete';   // ActionButtonCommand → Row Forms
  adaptableContext?: any;
}
```
`ActionColumnContext = { data: TData; primaryKeyValue; rowNode: IRowNode<TData>; actionColumn; adaptableApi; adaptableContext }`.

Width rules: `width` (fixed) overrides everything; `autoWidth` ignores function-valued props (set `width` explicitly when label/icon/hidden/disabled are functions); `minWidth` is the base. In dropdown mode per-button `buttonStyle`/`iconPosition` are ignored (trigger is outlined/neutral; menu items show icon + label).

### Commands
`command: 'create'|'clone'|'edit'|'delete'` launch the corresponding Row Form (delete form is non-visible) without an `onClick`; default icons supplied. Typically paired with `rowFormOptions: { autoHandle: true, disableInlineEditing: true, setPrimaryKeyValue: ctx => … }`.

### AG Grid integration
Optionally declare a ColDef with `type: 'actionColumn'` and matching `colId` to add header names, tooltips, or column-group placement. Pin via Layout `ColumnPinning`. Used by FDC3 integration (auto-generated intent/context columns) and Data Change History.

### Typical handler
```ts
onClick: (b, ctx) => ctx.adaptableApi.gridApi.setCellValue({
  columnId: 'github_stars', newValue: ctx.rowNode.data.github_stars + 1,
  primaryKeyValue: ctx.primaryKeyValue, rowNode: ctx.rowNode })
```
Also `rowFormApi.displayCreateRowForm()`, `gridApi.deleteGridData([row])`.

### API (`actionColumnApi`)
`getActionColumns()`, `getActionColumnForColumnId(columnId)`.

---

## 4. Charts

### What it does
Wraps AG Grid Integrated Charts: persists user-created chart models in AdapTable State, re-opens them, and can host them in developer-defined DOM containers (multi-window). Also supports external charting libraries (e.g. Highcharts) via callbacks. Grid filters update charts; chart selection does not yet filter the grid. Non-contiguous ranges not supported.

### `chartingOptions`
| Property | Type | Default |
|---|---|---|
| `saveChartBehaviour` | `'auto' \| 'manual' \| 'none'` (auto = save every created chart; manual = prompt user to name/save) | `'none'` |
| `chartContainers` | `ChartContainer[]` = `{ name: string; element: HTMLElement \| string (CSS selector); chartsDisplay?: 'single' \| 'multiple' }` (default `'single'`; `'multiple'` appends — give the container a fixed height/flex) | — |
| `agGridContainerName` | string — display name of AG Grid's own chart window | `'AG Grid Window'` |
| `restoreChartsOnReady` | `boolean \| 'all' \| string[]` — open persisted charts on startup | undefined |
| `externalChartingOptions` | `{ isChartOpened(ctx) => boolean; onShowChart(ctx); onHideChart(ctx); onDeleteChart(ctx); onPreviewChart(ctx) => ExternalChartDefinition }` (ctx: `ExternalChartingContext`) | — |

`chartContainers` does not override AG Grid's `createChartContainer`.

### State (`Charting`)
```ts
Charting: {
  ChartDefinitions: [{ Uuid, Name: string /* unique */, IsReadOnly?: boolean,
     Model: ChartModel /* AG Grid: modelType:'range', chartId, chartType, chartThemeName, chartOptions, cellRange, suppressChartRanges, unlinkChart */ }],
  ExternalChartDefinitions: [{ Name, Uuid, Data: any /* library-specific */ }]
}
```
Layouts can auto-open charts: `Layout.Layouts[].OpenCharts: [{ ChartName: string; ContainerName?: string }]` (ContainerName defaults to AG Grid window).

### UI
Dashboard `Toolbars: ['Charting']` (dropdown of saved charts, Open/Close, container picker), Charting Tool Panel, Status Bar panel `'Charting'`, Settings Panel → Charts (Edit via wizard, Delete, preview). Save prompt toast in manual mode. External charts: context menu items (`menuType: 'User'`, sub-items pie/line/bar), eye icon show/hide. Entitlements: Full / ReadOnly (view & create but no save) / Hidden. Read-only charts: `IsReadOnly: true` or API.

### API (`chartingApi`)
`addChartDefinition`, `editChartDefinition`, `closeChartDefinition`, `getChartDefinitions()`, `getChartDefinitionByName/ByUuid`, `showChartDefinition(def, container) => ChartRef`, `showChartDefinitionOnce(def, container)`, `showPersistedCharts()`, `getPersistedCharts()`, `getCurrentChartModels()`, `saveCurrentCharts()`, `getChartRef(chartId)`, `getChartingOpenState()`, `getOpenChartContainer(def)`, `isChartingEnabled()`, `setChartReadOnly(def)`, `setChartEditable(def)`; external: `addExternalChartDefinition(def, options)`, `editExternalChartDefinition`, `deleteExternalChartDefinition`, `getExternalChartDefinitions()`, `getExternalChartDefinitionByName(name)`. Selection helper: `gridApi.getSelectedCellInfo()`.

### Event
`ChartChanged` — `{ chartingOpenState: ChartingOpenState; adaptableContext }`.

---

## 5. Quick Search

### What it does
Grid-wide text search that highlights (rather than hides) matching cells across all data columns, dynamic columns (row-group, tree) and special columns (calculated, free text), on leaf and group rows. Runs on the cell **display value** by default, debounced 350 ms, re-evaluated on data/column-visibility changes. Client-Side Row Model wraps AG Grid's **Find** feature (text-level highlighting + next/previous cycling); Server-Side Row Model uses a bespoke AdapTable implementation (whole-cell highlight only).

### State (`QuickSearch`)
```ts
QuickSearch: {
  QuickSearchText?: string;              // last search; re-applied at startup
  CellMatchStyle?: AdaptableStyle;       // whole cell (default swatch 10); only option on SSRM
  TextMatchStyle?: AdaptableStyle;       // matched text only (default swatch 9)
  CurrentTextMatchStyle?: AdaptableStyle;// active match while cycling (default swatch 20+1)
}
// AdaptableStyle: { ForeColor?, BackColor?, BorderColor?, FontStyle?: 'Italic', FontWeight?: 'Bold', FontSize?: 'XSmall'|'Small'|'Medium'|'Large'|'XLarge' }
```

### `quickSearchOptions`
| Property | Type | Default |
|---|---|---|
| `quickSearchPlaceholder` | string | `'Search'` |
| `isQuickSearchCaseSensitive` | boolean | false |
| `clearQuickSearchOnStartUp` | boolean | false |
| `filterGridAfterQuickSearch` | boolean — show only matching leaf rows; uses AG Grid native Quick Filter (not AdapTableQL), ignores `isCellSearchable`, incompatible with custom `getCellSearchText`, needs custom impl for SSRM; docs warn it is expensive (consider AG Grid Quick Filter Cache, `agGridApi.setGridOption('quickFilterParser', …)`) and recommend Column/Grid Filters instead | false |
| `getCellSearchText` | `(ctx: QuickSearchContext) => string` — custom search text (e.g. raw value, comma-separated multi-term). Loses arrow navigation and partial-text styling | — |
| `isCellSearchable` | `(ctx: QuickSearchContext) => boolean` — exclude cells/columns | — |
`QuickSearchContext = { gridCell: GridCell (column.columnId, column.dataType, rawValue, displayValue); quickSearchValue: string; adaptableContext }`.
Also `showQuickSearchInHeader` (dashboard option) toggles the header search box; a Settings Panel checkbox "Filter Quick Search Results" toggles filter mode at runtime.

### UI
Dashboard header textbox (expanded/collapsed/floating dashboard), Quick Search Toolbar, Tool Panel, Status Bar panel, Settings Panel (run search + style tabs "Text Match", "Current Match", "Cell Match"; SSRM shows only "Cell Matching Style"), Floating Quick Search overlay (top-right, ESC to close). Entitlement Hidden/ReadOnly removes panels/toolbars but header input stays unless `showQuickSearchInHeader: false`.

### API (`quickSearchApi`)
`runQuickSearch(text)`, `clearQuickSearch()`, `getQuickSearchValue()`, `gotoNextMatch()`, `gotoPreviousMatch()`, `getQuickSearchState()`, `set/getQuickSearchTextMatchStyle`, `set/getQuickSearchCurrentTextMatchStyle`, `set/getQuickSearchCellMatchStyle`, `showFloatingQuickSearch()`, `hideFloatingQuickSearch()`, `openQuickSearchSettingsPanel()`.

---

## 6. Column Filters

### What it does
Rich per-column filtering replacing AG Grid's column filters (when `useAdaptableFiltering: true`, the default): multiple predicates per column joined by AND/OR, system + custom predicates, evaluated by AdapTableQL on the **raw** cell value. Works on row-grouped columns, pivot result columns and tree-grid key columns. Filters are stored **in the Layout** (Table or Pivot), re-applied when the Layout loads, and are additive with Grid Filter and Quick Search. By default filters re-run on user edits but not on background ticks (configurable).

### Object shape (in `Layout.Layouts[].ColumnFilters`)
```ts
ColumnFilter: {
  ColumnId: string;
  Predicates: { PredicateId: string; Inputs?: any[] }[];
  PredicatesOperator?: 'AND' | 'OR';   // default 'AND'; multi-predicate only in Filter Form
  IsSuspended?: boolean;               // via suspend API/UI
}
```
Example: `{ ColumnId: 'currency', Predicates: [{ PredicateId: 'In', Inputs: ['USD','EUR'] }] }`.

### System predicates (by data type)
- All: `Blanks`, `NonBlanks`, `In`, `NotIn`
- Numeric: `Equals`, `NotEquals`, `GreaterThan`, `LessThan`, `Positive`, `Negative`, `Zero`, `Between`, `NotBetween`
- Text: `Is`, `IsNot`, `Contains`, `NotContains`, `StartsWith`, `EndsWith`, `Regex`
- Date: `Today`, `Yesterday`, `Tomorrow`, `ThisWeek`, `ThisMonth`, `ThisQuarter`, `ThisYear`, `InPast`, `InFuture`, `Before`, `After`, `On`, `NotOn`, `NextWorkDay`, `LastWorkDay`, `WorkDay`, `Holiday`, `Range`
- Boolean: `True`, `False`

### Custom predicates (`predicateOptions.customPredicateDefs[]`)
```ts
{ id: string; label: string;
  columnScope: { ColumnIds?: string[]; DataTypes?: string[]; All?: boolean };
  moduleScope: ('columnFilter'|'alert'|'formatColumn'|…)[];   // must include 'columnFilter'
  handler(params: PredicateDefHandlerContext /* value, inputs, node (node.data = row) */): boolean;
  inputs?: [{ type: 'number'|'text'|… }];
  toString?: ({inputs}) => string;   // label in toolbar/status
  icon?; extends?: string }
```
A custom def with a system `id` overrides that system predicate (keeps icon/position). `predicateOptions.systemFilterPredicates: string[] | (ctx: SystemPredicatesContext) => string[]` limits/orders predicates (ctx: `columnScope`, `moduleScope`, `systemPredicateDefs`, `adaptableContext`, `adaptableApi`). `predicateOptions.caseSensitivePredicates` (default false), `evaluateInPredicateUsingTime(ctx)`.

### Filter components (UI)
- **Filter Form** — popup from Column Menu filter button or in the Filters Tool Panel (AG Grid sidebar). Predicate list per data type, distinct values for `In`, "Add Condition", "Clear Filters", "Apply Filter" (manual mode). Requires ColDef `filter: true`.
- **Filter Bar** (Quick Filter Bar) — between header and first row; predicate dropdown + type-specific input (text box / date picker / numeric; none for `Today`, two for `Between`). Requires AG Grid `floatingFilter: true` on ≥1 column. Wildcards typed into the input select predicates: `=` Equals, `>` GreaterThan, `<` LessThan, `:` Between, `[` and `#` In.
- Also: Dashboard Filter Toolbar, Tool Panel, Status Bar panel, Settings Panel (view/clear/suspend/edit), column-header styling for filtered columns, context menu "Filter on Cell Value(s)" (Equals / In).

### `filterOptions` / `filterOptions.columnFilterOptions`
| Property | Type | Default |
|---|---|---|
| `useAdaptableFiltering` | boolean — false hides AdapTable filter UI and uses AG Grid filters (API still works) | true |
| `clearFiltersOnStartUp` | boolean (Column + Grid Filters) | false |
| `showDatePicker` | boolean | true |
| `customInFilterValues` | `(ctx: CustomInFilterValuesContext) => InFilterValueResult \| Promise` | — |
| columnFilterOptions.`defaultTextColumnFilter` | `Is\|IsNot\|Contains\|NotContains\|StartsWith\|EndsWith\|In\|Regex` or fn(DefaultPredicateFilterContext) | `Contains` |
| .`defaultNumericColumnFilter` | `GreaterThan\|LessThan\|Equals\|NotEquals\|In` | `Equals` |
| .`defaultDateColumnFilter` | `After\|Before\|On\|NotOn\|In` | `On` |
| .`defaultArrayColumnFilter` | `In\|NotIn\|Blanks\|NonBlanks` | `In` |
| .`indicateFilteredColumns` | boolean | true |
| .`enableFilterOnSpecialColumns` | boolean (Calculated/FreeText columns) | true |
| .`isRowFilterable` | `(ctx: {data, rowNode, adaptableContext}) => boolean` | all true |
| .`manuallyApplyColumnFilter` | `boolean \| (ctx: AdaptableColumnContext) => boolean` — disables Filter Bar for the column; Filter Form shows Apply Filter / Reset Filter (reset = previous applied state); good for SSRM and `In` | false |
| .`showQuickFilter` | boolean (runtime toggles not persisted) | true |
| .`hideQuickFilterDropdown` | `(ctx: ColumnFilterContext) => boolean` | — |
| .`quickFilterDebounce` | number ms | 250 |
| .`quickFilterHeight` | number px | AG Grid default |
| .`quickFilterWildcards` | `Record<PredicateId, string[]>` | 6 built-ins |
`DefaultPredicateFilterContext = { filterComponent: 'FilterBar'|'FilterForm'; column }`.

### The `In` filter
Checkbox list of distinct values (tree of year→month→date for dates; each array item separately for array columns). `customInFilterValues` context: `{ currentSearchValue, defaultValues, orderedValues, sortedValues, selectedValues, limit (1000), offset, adaptableContext }` with `InFilterValueInfo = { value, label, count, visible, visibleCount, children, leafChildrenCount, isSelected }` (visible/visibleCount/orderedValues are lazy but expensive). Return `InFilterValueResult = { values: InFilterValue[] ({value,label,tooltip,level,children}), hasMore (lazy paging; offset increments on scroll, resets on search), skipDefaultSearch, renderInputValues(params) => string }`. Can inject system (`Blanks`, `Positive`…) or custom predicates into the list.

### API (`columnFilterApi`)
Query: `getColumnFilters()`, `getActiveColumnFilters()`, `getColumnFilterForColumn(columnId)`, `getColumnFiltersForLayout(layoutName)`, `getFilterPredicateDefsForColumn(column)`, `isColumnFilterActive(cf)`, `isColumnFilterActiveForColumn(columnId)`.
Mutate: `setColumnFilters(cfs)`, `clearAndSetColumnFilters(cfs)`, `setColumnFilterForColumn(columnId, predicate)`, `clearColumnFilters()`, `clearColumnFilter(cf)`, `clearColumnFilterForColumn(columnId)`, `clearColumnFiltersForColumns(cols)`.
Suspend: `suspendColumnFilter`, `suspendAllColumnFilters`, `unSuspendColumnFilter`, `unSuspendAllColumnFilters`.
UI: `hideColumnFilterMenu()`, `showQuickFilterBar()`, `hideQuickFilterBar()`, `isQuickFilterAvailable()`, `isQuickFilterVisible()`.
Utility: `columnFilterToString(cf)`, `columnFiltersToString(cfs)`, `addBlanksToInFilterValues(values)`, `refreshFilterValues(columnId)`, `refreshAllFilterValues()`, `resetFilterValues(columnId)`, `resetAllFilterValues()`.

### Event
`ColumnFilterApplied` — `{ columnFilters: ColumnFilter[] | undefined; adaptableContext }`; intended for server-side evaluation.

---

## 7. Grid Filter

### What it does
A single grid-wide Boolean Expression (AdapTableQL) evaluated against every row; only passing rows are shown. Can compare columns (`[closed_issues_count] > [closed_pr_count] AND [pushed_at] = [updated_at]`), combine with `QUERY("Named Query")`. Only one active Grid Filter at a time; additive with Column Filters and Quick Search. Stored per-Layout. Server-side evaluation possible via `expressionOptions.evaluateAdaptableQLExternally` (and `performExpressionValidation` can be disabled for that).

### State (no dedicated section)
```ts
Layout.Layouts[]: { Name, TableColumns | PivotColumns…, GridFilter: { Expression: string } }
```

### `filterOptions.gridFilterOptions`
| Property | Type | Default |
|---|---|---|
| `availableFilterEditors` | `('ExpressionEditor' \| 'QueryBuilder')[]` (`GridFilterEditors`) | both |
Plus `filterOptions.clearFiltersOnStartUp` (default false).

### UI
Grid Filter Toolbar (Dashboard; `PinnedToolbars: ['GridFilter']`) with inline expression editor, Run button (enabled only on valid syntax), expand button opening Query Builder (standard) or Expression Editor (complex), Clear Grid Filter, Save (as Named Query), dropdown of saved Named Queries and session-recent unsaved filters (auto-named e.g. 'Grid Filter at 5:38:33 PM'). Tool Panel; Status Bar panel `'GridFilter'`. Editing a Named Query creates a new Grid Filter. Entitlements: Full / ReadOnly (run but not save as Named Query) / Hidden.

### API (`gridFilterApi`)
`setGridFilterExpression(expr)`, `setGridFilterExpressionUsingNamedQuery(nq)`, `getCurrentGridFilter()`, `getCurrentGridFilterExpression()`, `clearGridFilter()`, `reApplyGridFilter()`, `suspendGridFilter()`, `unSuspendGridFilter()`, `openUIEditorForGridFilter(expr)`.

### Event
`GridFilterApplied` — `{ gridFilter: GridFilter | undefined; gridFilterExpressionAST: any; adaptableContext }`.

---

## 8. Data Sets

### What it does
Lets developers offer several named data sources the user switches between at runtime, keeping the Client-Side Row Model while avoiding one huge payload. All DataSets must share the column schema (no non-overlapping fields). AdapTable does nothing on selection itself — the app loads data via `loadData` or by handling the event and calling `gridApi.loadGridData(rows)`.

### `dataSetOptions.dataSets: DataSet[]`
```ts
{
  name: string;  description?: string;
  info?: Record<string, string|number|boolean|Date>;
  loadData?: (info: DataSetSelectedInfo) => TData[] | Promise<TData[]>;
  onSelect?: (info: DataSetSelectedInfo) => void | Promise<void>;     // no form
  onFormSubmit?: (ctx: DataSetFormContext) => void | Promise<void>;
  form?: AdaptableForm<DataSetFormContext>;   // { title?, description?, fields: [{ name, label, fieldType: 'text'|'number'|'checkbox'|'select'|'date', defaultValue?, options?: [{label,value}] }], buttons: [{ label, onClick(button, ctx) }], layout?: 'rows', onSubmit? }
  IsReadOnly?: boolean;
}
```
Form DataSets: form pops up on selection; an OK button is auto-added if none defined; the button `onClick` must load data (`ctx.adaptableApi.gridApi.loadGridData(filtered)`); `DataSetSelected` is **not** fired for form DataSets. `DataSetFormContext = { dataSet, formData, adaptableApi, adaptableContext }`.

### UI
Data Set selector dropdown in Dashboard Toolbar, Tool Panel, Status Bar; Settings Panel section. Entitlements: Full / ReadOnly (same as Full) / Hidden.

### API (`dataSetApi`)
`setDataSet(name)`, `getCurrentDataSet()`, `getDataSetByName(name)`, `getDataSets()`, `clearCurrentDataSet()`, `openDataSetSettingsPanel()`.

### Event
`DataSetSelected` — `DataSetSelectedInfo = { dataSet, adaptableContext }`.

---

## 9. Named Queries

### What it does
Saved, named Boolean Expressions reusable anywhere an expression is accepted (Grid Filter, Format Column rules, Alerts, Reports…) via the `QUERY("name")` function; Named Queries may reference other Named Queries. Created at design time in state or at runtime (Save button in Grid Filter toolbar). For server evaluation, `expressionOptions` (`systemBooleanFunctions`, `systemObservableFunctions`, `isColumnQueryable`) can limit expression complexity.

### State
```ts
NamedQuery: { NamedQueries: [{ Name: string; BooleanExpression: string; IsReadOnly?: boolean }] }
```
Examples: `"[cpty] IN ('BAML','Citi') AND [bid] > 3"`; nested `"QUERY('Big Orders') AND [price] > 1000"`; in a Layout `GridFilter.Expression: 'QUERY("Hottest JavaScript") AND CONTAINS([topics], "javascript")'`.

### UI
Grid Filter Toolbar dropdown (load/apply), Settings Panel → Query section, Status Bar panels, custom dashboard buttons calling the API.

### API (`namedQueryApi`)
`getNamedQueries()`, `getNamedQueryByName(name)`, `getNamedQueryState()`, `addNamedQuery(nq)`, `addNamedQueries(nqs)`, `runNamedQuery(nq)`, `runQueryByName(name)`, `isValidNamedQuery(nq) => NamedQueryValidationResult`, `openNamedQuerySettingsPanel()`.

---

## Cross-cutting notes
- **Entitlements** (Full / ReadOnly / Hidden) apply per module; `IsReadOnly` on an entity overrides a Full entitlement.
- **Filtering stack vs AG Grid**: Column Filters + Grid Filter replace AG Grid column filtering when `useAdaptableFiltering` is true (the Filter Bar still relies on AG Grid `floatingFilter`); Quick Search wraps AG Grid Find (CSRM) or, in filter mode, AG Grid Quick Filter; Charts wrap AG Grid Integrated Charts `ChartModel`; Calculated/Action Columns are injected as AG Grid columns with `type: 'calculatedColumn'` / `'actionColumn'`.
- **Layout is the persistence home** for Column Filters, Grid Filter, and OpenCharts; Calculated Columns, Alerts, Charting definitions, Named Queries and Quick Search each have their own state section; Action Columns and Data Sets are defined in Options only.
