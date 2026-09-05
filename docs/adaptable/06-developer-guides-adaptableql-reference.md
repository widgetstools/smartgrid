# AdapTable for AG Grid — Developer Guides, AdaptableQL & Technical Reference

Source: https://www.adaptabletools.com/docs (88 pages in the Developer Guides, AdapTable Query Language and Technical Reference sections, v23).

---

## 1. Adaptable State

### 1.1 Concepts
- Adaptable State = **Initial Adaptable State** (design-time JSON) + **User State** (runtime changes). Excludes AG Grid row data.
- Internally managed by **Redux**.
- Lifecycle: `initialState` → first load merges → subsequent loads use persisted User State (`loadState`).
- Default persistence: browser **localStorage** keyed by `adaptableStateKey` (falls back to `adaptableId`). Production uses remote storage via `stateOptions` functions.
- Shipped defaults: Dashboard `ModuleButtons` (SettingsPanel), Quick Search highlight style, Theme `light`, ToolPanel SettingsPanel button.
- `AdaptableStateChanged` fires on every state modification. Breaking state changes only in major versions; auto-migration on by default.

### 1.2 InitialState sections

| Key | Type | Purpose |
|---|---|---|
| `Alert` | `AlertState` | AlertDefinitions |
| `Application` | `ApplicationState` | Developer key/value data (`ApplicationDataEntries: { Key, Value }[]`) |
| `CalculatedColumn` | `CalculatedColumnState` | `CalculatedColumns[]` |
| `Charting` | `ChartingState` | Named charts wrapping AG Grid chart models |
| `CustomSort` | `CustomSortState` | `CustomSorts[]` |
| `Dashboard` | `DashboardState` | Dashboard look/feel |
| `Export` | `ExportState` | `Reports[]`, `ReportSchedules[]`, current report |
| `FlashingCell` | `FlashingCellState` | Flashing definitions |
| `FormatColumn` | `FormatColumnState` | `FormatColumns[]` |
| `FreeTextColumn` | `FreeTextColumnState` | User-owned columns and values |
| `Layout` | `LayoutState` | `CurrentLayout`, `Layouts[]` |
| `NamedQuery` | `NamedQueryState` | Saved Boolean Expressions |
| `Note` | `NoteState` | Cell notes |
| `PlusMinus` | `PlusMinusState` | Nudge rules |
| `QuickSearch` | `QuickSearchState` | Search text + styles |
| `Shortcut` | `ShortcutState` | Data-entry shortcuts |
| `StatusBar` | `StatusBarState` | Status bar panels |
| `StyledColumn` | `StyledColumnState` | Badges, Gradients, Percent Bars, Sparklines, Bullet, Rating, Range Bar, Icon |
| `Theme` | `ThemeState` | `CurrentTheme`, system themes |
| `ToolPanel` | `ToolPanelState` | Tool Panel order/visibility |
| `UserInterface` | `UserInterfaceState` | `HideAdaptableUI` |

Transient/internal sections (returned by `stateApi.getAllState()` but not in initial state): Comments, DataSet, DataImport, Schedule, TeamSharing, SystemStatus; Grid/Column Filters live inside Layout.

### 1.3 BaseState and AdaptableObject
```ts
// on every state section
Revision?: number | { Key: number; UpdateStrategy: 'Override' | 'KeepUserDefined' };

// every Adaptable Object
interface AdaptableObject {
  Uuid: TypeUuid;                 // auto-generated
  AdaptableVersion: AdaptableVersion;
  Source: 'InitialState' | 'User';
  IsReadOnly?: boolean;           // overrides Module 'Full' entitlement
  IsSuspended?: boolean;          // SuspendableObject only
  Metadata?: any;
  Tags?: AdaptableObjectTag[];    // scope objects to layouts
}
```
Suspendable: Format Columns, Grid/Column Filters, Custom Sorts, Alerts, Flashing Cells, Styled Columns, Shortcuts, Plus Minus, Reports schedules. Not suspendable: Layouts, Calculated Columns, Free Text Columns.

### 1.4 Updating Initial State after deployment (Revision)
Per section; triggers only when the new `Revision` Key > stored value. `'Override'` replaces the section (user objects removed); `'KeepUserDefined'` replaces `Source === 'InitialState'` items and keeps `Source === 'User'`.
```ts
CustomSort: { Revision: { Key: 5, UpdateStrategy: 'KeepUserDefined' }, CustomSorts: [...] }
```
Runtime: `stateApi.applyInitialState(newInitialState)`, `stateApi.remergePersistedState()`, `stateApi.reloadInitialState(newInitialState?)`.

### 1.5 StateOptions (persistence)
Flow: `loadState()` → `applyState(state)` → ready → user change → `saveState(state)` → `persistState(state)` (debounced).

| Property | Type | Default |
|---|---|---|
| `loadState` | `(config) => Promise<any>` | localStorage |
| `applyState` | `(state) => any` | identity |
| `saveState` | `(state, config) => any` | — |
| `persistState` | `(state, config) => any` | localStorage |
| `clearState` | `(config) => Promise<any>` | — |
| `debounceStateDelay` | `number` ms | `400` (max 1000) |
| `autoMigrateState` | `boolean` | `true` |

`AdaptableStateFunctionConfig = { actionName, adaptableApi, adaptableContext, adaptableId, adaptableStateKey, previousState, userName }`. Multi-user pattern: key by `${adaptableStateKey}/${userName}`.

### 1.6 Migration
`stateOptions.autoMigrateState: false` then in `applyState`: `AdaptableUpgradeHelper.migrateAdaptableState(state, { fromVersion, toVersion?, logger? })`.

### 1.7 State Management Module
Settings Panel "Manage State", Dashboard toolbar `'StateManagement'`, Tool Panel. Operations: Clear User State, Load Initial State from JSON, Export Adaptable State / Initial State (clipboard, console, file).

### 1.8 State API
`applyInitialState`, `copyAllStateToClipboard`, `copyUserStateToClipboard`, `dispatchStateReadyAction`, `getAdaptableFilterState(): { columnFilterDefs, columnFilters, gridFilter, gridFilterAST }`, `getAdaptableSortState`, `getAllState`, `getInitialState`, `getPersistentState`, `getUserStateByStateKey`, `incrementUserStateRevision`, `loadUserState` (replaces), `persistAdaptableState`, `reloadInitialState`, `remergePersistedState`, `setAdaptableStateKey`, `getDescriptionForModule`, `getHelpPageForModule`, and per-section getters `getAlertState`, `getApplicationState`, `getCalculatedColumnState`, `getChartingState`, `getCustomSortState`, `getDashboardState`, `getExportState`, `getFlashingCellState`, `getFormatColumnState`, `getFreeTextColumnState`, `getLayoutState`, `getNamedQueryState`, `getNoteState`, `getPlusMinusState`, `getQuickSearchState`, `getShortcutState`, `getStatusBarState`, `getStyledColumnState`, `getThemeState`, `getToolPanelState`.

Application API: `addApplicationDataEntry`, `createApplicationDataEntry`, `deleteApplicationDataEntry`, `editApplicationDataEntry`, `getApplicationDataEntries`, `getApplicationDataEntriesByValue`, `getApplicationDataEntryByKey`, `getApplicationState`.

### 1.9 State events
- `BeforeAdaptableStateChanges` → `{ action, actionName, state }` (cannot cancel).
- `AdaptableStateChanged` → `{ action, actionName, newState, oldState }`.
- `AdaptableStateReloaded` → `{ newState, oldState }`.

Documented `actionName` values: `ALERT_DEFINITION_ADD/DELETE/EDIT/SUSPEND/UNSUSPEND`, `ALERT_READY`, `BULK_UPDATE_APPLY`, `CALCULATED_COLUMN_ADD/DELETE/EDIT`, `CHARTING_ADD_CHART/DELETE_CHART/EDIT_CHART`, `COMMENT_ADD/DELETE/EDIT`, `CUSTOM_SORT_ADD/DELETE/EDIT/SUSPEND/UNSUSPEND`, `DASHBOARD_ACTIVE_TAB_INDEX_CHANGE`, `DASHBOARD_CLOSE_TOOLBAR`, `DASHBOARD_SET_FLOATING_POSITION`, `FORMAT_COLUMN_ADD/DELETE/EDIT`, `FREE_TEXT_COLUMN_ADD_EDIT_STORED_VALUE`, `GRID_DATA_CHANGED`, `GRID_DATA_EDITED`, `LAYOUT_ADD/DELETE/EDIT/SELECT`, `LAYOUT_COLUMN_FILTER_ADD/CLEAR/CLEAR_ALL/EDIT/SET/SUSPEND/UNSUSPEND`, `LAYOUT_GRID_FILTER_CLEAR/SET`, `NOTE_ADD/DELETE/EDIT`, `QUICK_SEARCH_RUN`, `QUICK_SEARCH_SET_TEXT_MATCHING_STYLE`, `REPORT_ADD/DELETE/EDIT`, `SHORTCUT_ADD/DELETE/EDIT`, `STYLED_COLUMN_ADD/DELETE/EDIT`, `THEME_SELECT`, `USER_INTERFACE_SET_HIDE_ADAPTABLE_UI`.

---

## 2. Permissions (Entitlements)

`AccessLevel = 'Full' | 'ReadOnly' | 'Hidden'`. Entitlements are **UI constructs only** — Initial State objects and API calls bypass them.

```ts
entitlementOptions: {
  defaultAccessLevel: 'Hidden',   // or (ctx: BaseContext) => AccessLevel
  moduleEntitlements: [           // or (ctx: { adaptableModule, defaultAccessLevel, adaptableContext }) => AccessLevel | undefined
    { adaptableModule: 'FormatColumn', accessLevel: 'ReadOnly' },
    { adaptableModule: 'SettingsPanel', accessLevel: 'Full' },
  ],
}
```
Object-level `IsReadOnly: true` overrides a module `Full` entitlement (one-way). API: `getEntitlementAccessLevelForModule`, `isModuleFullEntitlement`, `isModuleHiddenEntitlement`, `isModuleReadOnlyEntitlement`, `isObjectReadonly`.

---

## 3. Managing Grid Data (Grid API)

| Function | AG Grid call | Trigger |
|---|---|---|
| `loadGridData(data)` | `setRowData` | `Load` |
| `addGridData(rows, config?)` | `applyTransaction add` | `Add` |
| `updateGridData(rows, config?)` | `applyTransaction update` | `Update` |
| `deleteGridData(rows, config?)` | `applyTransaction remove` | `Delete` |
| `addOrUpdateGridData(rows, config?)` | — | returns `{addedRows, updatedRows}` |
| `manageGridData({ addRows?, updateRows?, deleteRows? }, { runAsync?, flushAsync?, addIndex?, callback? })` | transaction[Async] | |
| `setCellValue(req)` / `setCellValues([...])` | `rowNode.setDataValue` | `CellChanged` |

Events: `RowChanged` → `{ rowDataChange: { changedAt, dataRows, rowNodes, rowTrigger: 'Load'|'Add'|'Update'|'Delete' } }`. `CellChanged` → `{ cellDataChange: { changedAt, column, newValue, oldValue, preventEdit, primaryKeyValue, rowData, rowNode, trigger } }`.

Full Grid API surface — cell value/display: `getCellDisplayValue`, `getCellRawValue`, `getCellNormalisedValue`, `getDisplayValueFromRawValue`, `getDisplayValueFromRowNode`, `getRawValueFromRowNode`, `getGridCellFromRowNode`, `getGridCellsForRawValue`, `getGridCellsForDisplayValue`, `isCellEditable`, `isCellEdited`, `refreshCell(s)`, `undoCellEdit`; columns: `getColumnCount`, `getVisibleColumnCount`, `getColumnData`, `getFilteredColumnData`, `getVisibleColumnData`, `getColumnSorts`, `setAdaptableSorting`, `clearAdaptableSorting`, `addAgGridColumnDefinition`, `removeAgGridColumnDefinition`, `updateAgGridColumnDefinition(s)`, `updateAgGridColumnState(s)`, `setAgGridColumnDefinitions`, `getAllAgGridColumns`, `selectColumn(s)`, `refreshColumn(s)`, `refreshGridHeader`, `jumpToColumn`, `highlightColumn`; rows: `getRowCount`, `getVisibleRowCount`, `getRowNodeForIndex`, `getRowNodeForPrimaryKey(s)`, `getAllRowNodes`, `getVisibleRowNodes`, `getGroupRowNodes`, `getPrimaryKeyValueForRowNode(s)`, `isGroupRowNode`, `isGrandTotalRowNode`, `isSummaryNode`, `selectRow(s)`, `selectNode(s)`, `deSelectRow(s)`, `refreshRowNode(s)`, `jumpToRow`, `highlightRow(s)`; data: `getGridData`, `getFilteredData`, `getVisibleData`; selection: `selectAll`, `deselectAll`, `selectCellRange`, `selectCellRangeByQuery`, `getSelectedRowInfo`, `getSelectedCellInfo`, `getCellSummaryInfo`; grouping: `setRowGroupColumns`, `clearRowGroupColumns`, `expandAllRowGroups`, `collapseAllRowGroups`, `expandRowGroupsForValues`; misc: `jumpToCell`, `showTransposedView`, `closeTransposedView`, `applyFiltering`, `clearFiltering`, `refreshAllCells`, `redrawGrid`, `isGridGroupable`, `isGridPivotable`, `isGridInPivotMode`, `isMasterDetailGrid`, `isTreeDataGrid`, `getAgGridRowModelType`, `getVariant()`.

---

## 4. Row Models

**Server-Side Row Model**: supported; AG Grid delegates filtering/grouping/sorting/pivoting to the server. `filterModel`/`sortModel` contain only native state — supplement with `stateApi.getAdaptableFilterState()` and `stateApi.getAdaptableSortState()`. Aggregated/Cumulative/Quantile Calculated Columns must be evaluated server-side. Formatting, Styled Columns and standard Calculated Columns work automatically. Quick Search highlight works; Quick-Search-as-Filter needs custom implementation.

**Viewport Row Model**: no filtering, grouping, pivoting, aggregations or transactions; discouraged.

---

## 5. Columns

### 5.1 Cell data types (`cellDataType`)
`'text'`, `'number'`, `'date'` / `'dateString'`, `'boolean'`, `'object'`, array types `'numberArray'`, `'tupleArray'`, `'objectArray'`, `'textArray'`. If omitted, AdapTable infers from first-row data (risky). Deprecated `type` prefixes (`abColDefString` etc.) replaced in v20.

### 5.2 Column types (`AdaptableColumnType`)
`actionColumn`, `calculatedColumn`, `freeTextColumn`, `hiddenColumn`, `pivotGrandTotal`, `pivotColumnTotal`, `pivotAggregationTotal`, `pivotAnyTotal`, `fdc3Column`. `columnOptions.columnTypes` controls which custom types appear in wizards.

### 5.3 Column Scope
```ts
Scope: { All: true }
Scope: { ColumnIds: ['ItemCost','OrderCost'] }
Scope: { DataTypes: ['number'] }
Scope: { ColumnTypes: ['price','calculatedColumn'] }
Scope: { DataTypes: ['date'], ColumnIds: ['country'] }  // combinable
```
Scope API: `getColumnIdsInScope`, `getColumnsInScope`, `getScopeDescription`, `isColumnInScope`, `isSingleColumnScope`, `scopeIsAll`, `scopeIsEmpty`, etc.

### 5.4 Runtime ColDef management
Stateful props (`width`, `hide`, `sort`, `pinned`): `updateAgGridColumnState(s)`. Non-stateful (`headerName`, `editable`, `type`, `cellDataType`, renderers/editors): `updateAgGridColumnDefinition(s)`. `addAgGridColumnDefinition`, `removeAgGridColumnDefinition`, `setAgGridColumnDefinitions`. Keep Layout in sync with `layoutApi.updateCurrentLayout`.

### 5.5 Design-time ColDef handling
**Ignored (use Layout):** `pivot*`, `rowGroup*`, `aggFunc`, `initialAggFunc`, `pinned`, `initialPinned`, `lockPinned`, `sort*`, `sortingOrder`, `hide`, `initialHide`, `initialWidth`, `initialFlex`.
**Leveraged:** `field`, `colId`, `type`, `cellDataType`, `enablePivot`, `enableRowGroup`, `enableValue`, `defaultAggFunc`, `allowedAggFuncs`, `sortable`, `resizable`, `suppressMovable`.
**Fallback only if AdapTable equivalent absent:** `valueFormatter` (→ Display Formats), `comparator` (→ Custom Sort), `editable` (→ `isCellEditable`), `flex/width/minWidth/maxWidth` (→ `ColumnSizing`).
GridOptions ignored: `grandTotalRow`, `suppressAggFuncInHeader`, `rowSelection` (fallback). Prefer Display Formats over `valueFormatter`, Styled Columns over cell components, Calculated Columns over `valueGetter`.

### 5.6 Column headers
Priority: Layout `ColumnHeaders` > `columnOptions.columnHeader(ctx)`. Contexts discriminated by `columnType`: `tableColumn`, `tableColumnGroup`, `autoGroupColumn`, `rowGroupColumn`, `pivotColumnGroup`, `pivotResultColumn`, `pivotGrandTotal`, `pivotColumnTotal`, `pivotAggregationTotal`.

### 5.7 AdaptableColumn & columnOptions
`AdaptableColumn`: `columnId`, `field`, `friendlyName`, `dataType`, `columnTypes[]`, capability flags (`sortable, filterable, groupable, pivotable, aggregatable, queryable, exportable, moveable, hideable, readOnly, resizable`), kind flags (`isCalculatedColumn, isFreeTextColumn, isActionColumn, isPivotTotalColumn, isGeneratedRowGroupColumn, isGeneratedSelectionColumn, isGeneratedPivotResultColumn, isSparkline, isUIHiddenColumn, isPrimaryKey, isTreeColumn`), live state (`visible, pinned, width, flex, isGrouped, isFixed`), `columnGroup`, `aggregationFunction`, `availableAggregationFunctions`.

```ts
columnOptions?: { addColumnGroupToColumnFriendlyName?; columnFriendlyName?(ctx); columnHeader?(ctx); columnTypes?; showMissingColumnsWarning? }
```
Column API: `getColumns`, `getColumnWithColumnId`, `getColumnWithFriendlyName`, `getVisibleColumns`, `getNumericColumns`, `getTextColumns`, `getDateColumns`, `getBooleanColumns`, `getArrayColumns`, `getColumnsWithDataType`, `getFilterableColumns`, `getSortableColumns`, `getGroupableColumns`, `getAggregatableColumns`, `getPivotableColumns`, `getQueryableColumns`, `getExportableColumns`, `getRowGroupedColumns`, `getColumnsByColumnType`, `getPrimaryKeyColumn`, `doesColumnExist`, `isCalculatedColumn`, `isFreeTextColumn`, `isSpecialColumn`, `getFriendlyNameForColumnId`, `getAGGridColDefForColumnId`, `showColumn`, `hideColumn`, `autosizeColumn(s)`, `autosizeAllColumns`, `setColumnCaption`, `openColumnInfoSettingsPanel`.

---

## 6. Tutorials & Support

- **Cell editability**: `editOptions.isCellEditable(ctx)` evaluated first; return `ctx.defaultColDefEditableValue` to defer.
- **Holiday calendars**: `calendarOptions.holidays: string[] | fn`; drives `NextWorkDay`, `LastWorkDay`, `WorkDay`, `Holiday` predicates and `IS_HOLIDAY`, `IS_WORKDAY` functions. Calendar API: `getNextWorkingDay`, `getPreviousWorkingDay`, `isHoliday`, `isWorkingDay`, etc.
- **adaptableContext**: root option injected into every callback context and event info.
- **Hotkeys**: no built-in binding; use Mousetrap/`keydown` to call API popups.
- **Logging**: `localStorage.debug = 'Adaptable:<id>:<error|warn|success|info|perf>'`, wildcards.
- **Profiling**: `'Adaptable:*:perf'` and `localStorage.adaptableProfileTracks = 'true'` for DevTools tracks.
- **Testing**: wait for `AdaptableReady`; drive via API; stub `stateOptions`; unique `adaptableId` per test; assert via `AdaptableStateChanged`.
- **Performance**: CSRM fine to ~100k rows (demo: 100k × 20 cols, 400 updates/s); avoid Badge styles on rapidly flashing cells; styles applied only to visible cells.

---

## 7. AdaptableQL

### 7.1 Expression types & syntax
- **Standard** — per-row; Scalar or Boolean. Used by Alerts, Calculated Column, Export, Flashing Cell, Format Column, Grid Filter, Plus Minus.
- **Aggregated** — multi-row; Aggregated Scalar (Calculated Columns), Aggregated Boolean (Alerts), Cumulative, Quantile.
- **Observable** — Rx-based change watching; Alerts only.
- Column refs: `[ColumnId]`, `COL("ColumnId")`, non-column data `FIELD('name')`.
- Comparison `= != > >= < <=`; arithmetic `+ - * / ^`; logical `AND`, `OR`, parentheses; string literals quoted.
- Examples: `MIN([BloombergBid],[MarkitBid]) > 50 OR [Currency] = 'USD'`; `ADD_DAYS(CURRENT_DAY(), 5) < [TradeDate]`; `[Comments] > 100 ? 'Big' : 'Small'`.
- Aggregation: `SUM([PnL]) > '5M'` (`K`/`M`/`B` suffixes), `AVG([Price], WEIGHT([index]))`, `SUM([PnL], GROUP_BY([Currency],[Counterparty]))`, `... WHERE [Currency]='USD'`.
- Cumulative: `CUMUL(SUM([PnL]), OVER([TradeDate]))`. Quantile: `QUANT([PnL], 10)`, `QUARTILE([PnL])`, `PERCENTILE([Price])`.
- Observable: `ROW_CHANGE( COUNT([ItemCount], 3), TIMEFRAME('5m') )`, `GRID_CHANGE( NONE([Price]), TIMEFRAME('30s') ) WHERE …`, `ROW_ADDED()`, `ROW_REMOVED(3, TIMEFRAME('5m'))`. `expressionOptions.maxTimeframeSize` default 8h, max 24h.
- Relative change: `ANY_CHANGE([Price])`, `ABSOLUTE_CHANGE([Price], 'INCREASE') > 10`, `PERCENT_CHANGE([Price], 'DECREASE') = 10`.

### 7.2 Advanced functions
- `QUERY("QueryName")` — Named Query reference.
- `VAR("NAME")` / `VAR("NAME", [arg])` — reads `expressionOptions.customQueryVariables`.
- `FIELD('name')` / `FIELD('parent.child')` — non-column row data declared in `expressionOptions.fields: [{ name, label?, dataType }]`.
- `IF` = ternary `cond ? a : b`. `CASE [value] WHEN v THEN r [ELSE r] END`.

### 7.3 Function catalogue
**Boolean:** `EQ`, `NEQ`, `GT`, `LT`, `GTE`, `LTE`, `AND`, `OR`, `NOT`, `BETWEEN`, `IN`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `ANY_CONTAINS`, `IS_BLANK`, `IS_NOT_BLANK`, `IS_NUMERIC`, `REGEX`, `IS_HOLIDAY`, `IS_WORKDAY`.
**Scalar:** numeric `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `POW`, `MIN`, `MAX`, `AVG`, `ABS`, `CEILING`, `FLOOR`, `ROUND`; date `DATE`, `NOW`, `CURRENT_DAY`, `DAY`, `WEEK`, `MONTH`, `YEAR`, `ADD_DAYS/WEEKS/MONTHS/YEARS`, `DIFF_DAYS/WEEKS/MONTHS/YEARS`; string `SUB_STRING`, `REPLACE`, `LEN`, `UPPER`, `LOWER`, `CONCAT`; misc `COALESCE`, `TO_ARRAY`, `NULL`.
**Aggregated:** `SUM`, `PERCENTAGE`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT`, `MODE`, `DISTINCT`, `ONLY`, `STD_DEVIATION`, `WEIGHT`; keywords `GROUP_BY`, `WHERE`; `CUMUL`, `OVER`; `QUANT`, `QUARTILE`, `PERCENTILE`.
**Relative change:** `ANY_CHANGE`, `PERCENT_CHANGE`, `ABSOLUTE_CHANGE`.
**Observable:** `GRID_CHANGE`, `ROW_CHANGE`, `ROW_ADDED`, `ROW_REMOVED`; change types `MIN`, `MAX`, `NONE`, `COUNT`; `TIMEFRAME`, `WHERE`.
**Advanced:** `QUERY`, `VAR`, `FIELD`, `IF`/`?:`, `CASE`.

### 7.4 Custom Expression Functions
```ts
expressionOptions: {
  customBooleanFunctions: { THIS_BUSINESS_YEAR: { handler(args, ctx) {...}, returnType: 'boolean', description, signatures, examples, category } },
  customScalarFunctions:  { USD_CONVERT: { handler(args, ctx) {...}, returnType: 'number' } },
  customAggregatedFunctions: { PRODUCT: { initialValue, reducer(ctx), processAggregatedValue?, prepareRowValue?, filterRow? } },
}
```
`ExpressionFunction` props: `handler` (mandatory), `returnType`, `category`, `description`, `examples`, `signatures`, `inputs`, `hasEagerEvaluation`, `isHiddenFromMenu`. `ExpressionContext`: `node`, `columnScope`, `dataChangedEvent`, `evaluateCustomQueryVariable`, `getRowNodes()`, `namedQueryCallStack`, `adaptableContext`. Async not supported. Scope via `moduleExpressionFunctions` (per-module map).

### 7.5 Reducing complexity
`systemBooleanFunctions`, `systemScalarFunctions`, `systemObservableFunctions`, `systemAggregatedBooleanFunctions`, `systemAggregatedScalarFunctions` — each list or fn. `moduleExpressionFunctions` per module. `isColumnQueryable(ctx)`.

### 7.6 Expression technical reference
`expressionOptions`: `caseSensitiveExpressions` (false), `customAggregatedFunctions`, `customBooleanFunctions`, `customQueryVariables`, `customScalarFunctions`, `displayColumnFriendlyNamesForExpressions` (true), `evaluateAdaptableQLExternally`, `fields`, `isColumnQueryable`, `maxTimeframeSize`, `moduleExpressionFunctions`, `performExpressionValidation` (true), `system*Functions`.

`expressionApi`: `getAdaptableQueryExpression`, `getAdaptableQueryExpressionWithColumnFriendlyNames`, `getASTForExpression`, `getColumnsFromExpression`, `isColumnQueryable`, `isValidAggregatedBooleanExpression`, `isValidAggregatedScalarExpression`, `isValidBooleanExpression`, `isValidObservableExpression`, `useCaseSensitivity`.

### 7.7 Server (external) evaluation
`expressionOptions.evaluateAdaptableQLExternally: (ctx: { expression, module: 'Alert'|'CalculatedColumn'|'ColumnFilter'|'GridFilter', object, predicates, referencedColumns }) => boolean`. Listen to `GridFilterApplied` (`gridFilterExpressionAST`), `ColumnFilterApplied`, `CalculatedColumnChanged` (`calculatedColumnExpressionAST`); evaluate server-side; push results via `gridApi.loadGridData()`. Set `performExpressionValidation: false` to avoid client validation conflicts.

---

## 8. Predicates

`AdaptablePredicate = { PredicateId; Inputs?: any[] }` — e.g. `{ PredicateId: 'GreaterThan', Inputs: [15] }`, `{ PredicateId: 'Between', Inputs: [18, 65] }`, `{ PredicateId: 'In', Inputs: ['GBP','EUR'] }`. Used by Alerts, Column Filters, Format Columns, Flashing Cells, Badge Styled Columns.

### System predicate ids by data type
- **All:** `Blanks`, `NonBlanks`, `In`, `NotIn`, `AnyChange`.
- **number:** `Equals`, `NotEquals`, `GreaterThan`, `LessThan`, `Positive`, `Negative`, `Zero`, `Between`, `NotBetween`, `PercentChange`.
- **text:** `Is`, `IsNot`, `Contains`, `NotContains`, `StartsWith`, `EndsWith`, `Regex`.
- **date:** `Today`, `Yesterday`, `Tomorrow`, `ThisWeek`, `ThisMonth`, `ThisQuarter`, `ThisYear`, `InPast`, `InFuture`, `Before`, `After`, `On`, `NotOn`, `NextWorkDay`, `LastWorkDay`, `WorkDay`, `Holiday`, `Range`.
- **boolean:** `True`, `False`.

### Custom predicates
```ts
predicateOptions.customPredicateDefs: [{
  id: 'long_string', label: 'Long String', columnScope: { DataTypes: ['text'] }, moduleScope: ['columnFilter'],
  inputs: [{ type: 'number' }],
  handler(ctx: { value, rawValue, displayValue, oldValue, inputs, column, node, groupValues, predicatesOperator, adaptableContext }) { ... },
  toString: ({ inputs }) => `cell length > ${inputs[0]}`, icon?, shortcuts?
}, { id: 'GreaterThan', extends: 'GreaterThan', label: 'More' }]
```
`moduleScope` values: `'columnFilter'`, `'alert'`, `'flashingCell'`, `'formatColumn'`, `'badgeStyle'`.

`predicateOptions`: `caseSensitivePredicates`, `customPredicateDefs`, `evaluateInPredicateUsingTime`, `systemAlertPredicates`, `systemBadgeStylePredicates`, `systemFilterPredicates`, `systemFlashingCellPredicates`, `systemFormatColumnPredicates`. Predicate API: `getPredicateDefs`, `getPredicateDefById`, `getPredicateDefsByModuleScope`, `handlePredicate(s)`, `isValidPredicate`, `predicatesToString`, `predicateToString`, `useCaseSensitivity`.

---

## 9. Technical Reference

### 9.1 AdaptableOptions
Base: `primaryKey` (mandatory), `autogeneratePrimaryKey`, `initialState` (mandatory), `adaptableId`, `adaptableStateKey`, `licenseKey`, `userName`, `adaptableContext`, `plugins`.
Option groups (36): `actionColumnOptions`, `alertOptions`, `calendarOptions`, `cellSummaryOptions`, `chartingOptions`, `columnMenuOptions`, `columnOptions`, `commentOptions`, `containerOptions`, `contextMenuOptions`, `customSortOptions`, `dashboardOptions`, `dataChangeHistoryOptions`, `dataImportOptions`, `dataSetOptions`, `editOptions`, `entitlementOptions`, `exportOptions`, `expressionOptions`, `fdc3Options`, `filterOptions`, `flashingCellOptions`, `formatColumnOptions`, `gridFilterOptions`, `layoutOptions`, `noteOptions`, `notificationsOptions`, `predicateOptions`, `quickSearchOptions`, `rowFormOptions`, `settingsPanelOptions`, `stateOptions`, `teamSharingOptions`, `toolPanelOptions`, `userInterfaceOptions`, `wizardOptions`.

### 9.2 AdaptableApi namespaces
`actionColumnApi`, `alertApi`, `applicationApi`, `bulkUpdateApi`, `calculatedColumnApi`, `calendarApi`, `cellSummaryApi`, `chartingApi`, `columnApi`, `columnMenuApi`, `columnScopeApi`, `commentApi`, `contextMenuApi`, `customSortApi`, `dashboardApi`, `dataChangeHistoryApi`, `dataImportApi`, `dataSetApi`, `entitlementApi`, `eventApi`, `exportApi`, `expressionApi`, `fdc3Api`, `filterApi` (`columnFilterApi`, `gridFilterApi`), `flashingCellApi`, `formatColumnApi`, `freeTextColumnApi`, `gridApi`, `layoutApi`, `namedQueryApi`, `noteApi`, `optionsApi`, `pluginsApi`, `plusMinusApi`, `predicateApi`, `quickSearchApi`, `scheduleApi`, `scopeApi`, `settingsPanelApi`, `shortcutApi`, `smartEditApi`, `stateApi`, `statusBarApi`, `styledColumnApi`, `systemStatusApi`, `teamSharingApi`, `themeApi`, `toolPanelApi`, `userInterfaceApi`. Plugin APIs: `interopApi`, `ipushpullApi`, `openfinApi`. Top-level: `agGridApi`, `destroy()`.

### 9.3 Adaptable Events
`AdaptableReady`, `AdaptableStateChanged`, `AdaptableStateReloaded`, `BeforeAdaptableStateChanges`, `AlertFired`, `CalculatedColumnChanged`, `CellChanged`, `CellSelectionChanged`, `ChartChanged`, `ColumnFilterApplied`, `CommentChanged`, `CustomToolbarConfigured`, `DashboardChanged`, `DataImported`, `DataSetSelected`, `FDC3Message`, `FlashingCellDisplayed`, `GridFilterApplied`, `GridSorted`, `LayoutChanged`, `LiveDataChanged`, `ReportScheduleRan`, `RowChanged`, `RowFormSubmitted`, `RowSelectionChanged`, `SystemStatusMessageDisplayed`, `TeamSharingEntityChanged`, `ThemeSelected`. All info objects extend `BaseContext { adaptableApi, adaptableContext, adaptableId, adaptableStateKey, clientTimestamp, userName }`. `eventApi.on` returns an unsubscribe.

### 9.4 Plugins
Current: No Code, Master Detail, OpenFin, interop.io, ipushpull. Deprecated: Charts (v11), Finance (v16), Finsemble/Glue (v18). `pluginsApi`: `getInteropioPluginApi`, `getipushpullPluginApi`, `getOpenFinPluginApi`, `getPluginsState`, `getPluginState`, `setPluginState`.

### 9.5 AdaptableModule ids
`Alert`, `BulkUpdate`, `CalculatedColumn`, `CellSummary`, `Charts`, `ColumnFilter`, `ColumnInfo`, `Comments`, `CustomSort`, `Dashboard`, `DataChangeHistory`, `DataImport`, `DataSet`, `Export`, `FDC3`, `FlashingCells`, `FormatColumn`, `FreeTextColumn`, `GridFilter`, `GridInfo`, `ipushpull`, `Layout`, `NamedQuery`, `Notes`, `OpenFin`, `PlusMinus`, `QuickSearch`, `SettingsPanel`, `Shortcuts`, `SmartEdit`, `StateManagement`, `StatusBar`, `StyledColumn`, `SystemStatus`, `TeamSharing`, `Theme`, `ToolPanel`. Modules without persisted state: Dashboard, GridInfo, SettingsPanel, StateManagement.
