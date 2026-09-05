# AdapTable for AG Grid — Getting Started, Key Concepts & Layouts

Source: https://www.adaptabletools.com/docs (61 pages in the Introduction, Getting Started and Layouts sections).

---

## Part 1 — Getting Started / Key Concepts

### 1.1 The Three Foundational Concepts

AdapTable is built on three pillars:

| Concept | Timing | Mutability | Persisted? |
|---|---|---|---|
| **Adaptable Options** (`AdaptableOptions`) | Design-time | Static after creation; includes JS callback functions | Never stored |
| **Initial Adaptable State** (`InitialState`) | Design-time | Objects that change at runtime | Merged with runtime changes and stored as *Adaptable State* |
| **Adaptable API** (`AdaptableApi`) | Runtime | — | Returned as a Promise from `Adaptable.init()` |

**Mandatory rule:** Initial State must contain **at least one Layout**. Everything else (Filters, Reports, Alerts, FormatColumn, etc.) is optional.

Initialisation (vanilla/TS):

```ts
const adaptableOptions: AdaptableOptions = {
  licenseKey: '<KEY>',
  primaryKey: 'tradeId',
  adaptableId: 'trading_app',
  filterOptions: { clearFiltersOnStartUp: true },
  initialState: {
    Dashboard: { Tabs: [{ Name: 'Grid', Toolbars: ['Layout', 'Pricing'] }] },
    Layout: {
      CurrentLayout: 'Cars',
      Layouts: [{ Name: 'Cars', TableColumns: ['Model','Price','Make'], RowGroupedColumns: ['Make'] }]
    }
  }
};
const agGridConfig: AgGridConfig = { gridOptions, agGridModules };
const adaptableApi: AdaptableApi = await Adaptable.init(adaptableOptions, agGridConfig);
```

### 1.2 Installation and packages

- Main package `@adaptabletools/adaptable` (ESM, recommended) or `@adaptabletools/adaptable-cjs`.
- Framework wrappers: `@adaptabletools/adaptable-react-aggrid`, Angular, Vue.
- Peer dependency: **AG Grid Enterprise v35**. AG Charts Enterprise optional (charts, sparklines).
- Plugins (separate packages, ESM + `-cjs`): `adaptable-plugin-master-detail-aggrid`, `adaptable-plugin-nocode-aggrid`, `adaptable-plugin-interopio`, `adaptable-plugin-openfin`, `adaptable-plugin-ipushpull`.
- Requires a `licenseKey`; absence renders a watermark.

### 1.3 React integration

Three components: `Adaptable.Provider` (state + orchestration), `Adaptable.UI` (dashboard/UI chrome), `Adaptable.AgGridReact` (AG Grid wrapper).

```tsx
import { Adaptable, AdaptableApi, type AdaptableOptions, type InitialState } from '@adaptabletools/adaptable-react-aggrid';
import '@adaptabletools/adaptable-react-aggrid/index.css';

<Adaptable.Provider
  gridOptions={gridOptions}
  modules={[AllEnterpriseModule]}
  adaptableOptions={adaptableOptions}
  adaptableReady={({ adaptableApi, agGridApi }) => { /* post-init */ }}>
  <Adaptable.UI />
  <div><Adaptable.AgGridReact /></div>
</Adaptable.Provider>
```

Rules: never pass `gridOptions` to `Adaptable.AgGridReact`; always set `cellDataType` on ColDefs; Layout properties override the corresponding ColDef settings. v23 added hooks `useAdaptableApi`, `useAdaptableState`, `useCurrentLayout`.

### 1.4 Integration details

- Two DOM containers required, default ids `"adaptable"` and `"grid"`; override via `containerOptions.adaptableContainer` / `containerOptions.agGridContainer` (string id or element ref; element refs required for Shadow DOM).
- **AG Grid Modules are mandatory (since v30)** — pass as `agGridModules` in `AgGridConfig` (`[AllEnterpriseModule]`, `[AllEnterpriseModule.with(AgChartsEnterpriseModule)]`, or a selective list).
- GridOptions notes: set `cellDataType` on every ColDef; `theme` (e.g. `themeQuartz`), `cellSelection`, `sideBar`, `suppressAggFuncInHeader`, `suppressMenuHide`. **Many ColDef properties are overridden by the Layout.**
- Other `AdaptableOptions`: `licenseKey`, `userName`, `plugins: [nocode()]`, `stateOptions.persistState` / `stateOptions.loadState`, `filterOptions.columnFilterOptions.manuallyApplyColumnFilter`, `loadingScreenOptions.showLoadingScreen`.
- TypeScript ≥ 5.4.5. Tailwind CSS layer order: `@layer theme, base, components, adaptable, utilities`.
- Teardown: `adaptableApi.destroy()`.

### 1.5 Identity properties

| Property | Type | Default | Notes |
|---|---|---|---|
| `adaptableId` | `string` | `"adaptable_id"` | Identifies the instance; default localStorage key; default `DashboardTitle`; used by Team Sharing; included in **Base Context** of all `xxxContext` / `xxxEventInfo` objects. |
| `adaptableStateKey` | `string` | falls back to `adaptableId` | localStorage persistence key for Adaptable State; distinguishes multiple states in remote storage. |
| `userName` | `string` | `"anonymous"` | Current user; in Base Context. |
| `primaryKey` | `string` | none (mandatory) | `colId`/`field` of a column with **unique, immutable** values; may be hidden. |
| `autogeneratePrimaryKey` | `boolean` | `false` | Last resort; disables Free Text Columns, Notes, Comments; data must be mutated only via `gridApi.loadGridData/addGridData/updateGridData/deleteGridData`. |
| `alertOptions.showMissingColumnsWarning` | `boolean` | `true` | Console warning when a referenced column is missing. |
| `alertOptions.showMissingPrimaryKeyAlert` | `boolean` | `false` | Alert if PK column missing/incorrect. |

### 1.6 AdaptableReady event

```ts
api.eventApi.on('AdaptableReady', (info: AdaptableReadyInfo) => { ... });
```
`AdaptableReadyInfo extends BaseContext` with `agGridApi: GridApi<TData>`, plus BaseContext fields `adaptableApi`, `adaptableContext`, `adaptableId`, `adaptableStateKey`, `clientTimestamp: Date`, `userName`.

### 1.7 Features Guide & What's New (v23)

- Features guide catalogues ~159 features across Filter & Search, Grid Layout (28), Styling, Alerts, Import/Export, Editing, UI Controls, Developer Support, Partners. UI element tags: Settings Panel, Dashboard Toolbar, Tool Panel, Status Bar, Column Menu, Context Menu, Wizards, Popup Windows.
- **v23:** UI refactor (ARIA, Tailwind, shadcn, CSS-variable theming); new Styled Columns (Bullet Chart, Rating, Icon, Range Bar); Scheduled Alerts with cron; Calculated Columns can trigger Flash/Alerts; **Pivot Layouts became a distinct Layout type**; React hooks.

### 1.8 Showcase demos (finance patterns)

Portfolio Risk Desk, Equity Watchlist, Trade Blotter & Corrections, Live Price Monitor, Exposure by Sector, Morning Corrections (finance); Sales Pipeline, Approved Supplier Registry (business). Common patterns: layout-driven role-based views (PM vs. risk), real-time data with alert-driven exception handling, styled columns (badges, gradients, sparklines, bullet charts), bulk editing with validation and history, exports/reports, comments, team sharing, charts linked to layouts.

---

## Part 2 — Layouts (general)

### 2.1 What a Layout is

A Layout is a named set of columns plus column-related information (order, visibility, sizing, pinning, sorting, headers, grouping, aggregation, filters, row selection). Users switch between Layouts; AdapTable **auto-updates the current Layout in response to AG Grid changes** (column move, resize, sort, group…). Layouts decide *which columns* show; Filters decide *which rows*.

Two kinds — **Table Layout** and **Pivot Layout**. Do **not** set `pivotMode: true` in GridOptions; define a Pivot Layout instead.

**State location:** `AdaptableState.Layout` →

```ts
interface LayoutState {
  CurrentLayout: string;               // Name of layout loaded at startup; if absent, first layout used
  Layouts: (TableLayout | PivotLayout)[];
}
```

**Runtime behaviours:** Clone → opens Layout Wizard with cloned contents; Suspend → not supported; Save → automatic on any AG Grid change; Share → via Team Sharing (includes referenced objects); Delete → prevented if it's the last Layout.

**Entitlements:** `Full`, `ReadOnly` (select only; manual grid changes not persisted), `Hidden`. Per-object `IsReadOnly: true` overrides a `Full` entitlement.

**UI surfaces:** Layout Toolbar (Dashboard), Settings Panel (Layout section), Tool Panel, Status Bar panel `'Layout'`, Column Menu, Context Menu, Dashboard ModuleButton `'Layout'`, Layout Wizard (Table & Pivot variants), `layoutApi.openLayoutSettingsPanel()`, `layoutApi.showLayoutEditor(name, type?, action?)`.

### 2.2 `LayoutBase` (shared by Table and Pivot)

| Property | Type | Description |
|---|---|---|
| `Name` | `string` | Required |
| `AutoSizeColumns` | `boolean` | Autosize on first load only (needs `ColumnAutoSizeModule`) |
| `ColumnFilters` | `ColumnFilter[]` | Column filters for this layout |
| `GridFilter` | `GridFilter` | Grid-wide AdaptableQL boolean expression |
| `ColumnSorts` | `ColumnSort[]` | `{ColumnId, SortOrder:'Asc'|'Desc'}` |
| `ColumnPinning` | `Record<colId,'left'|'right'>` | |
| `ColumnSizing` | `Record<colId, ColumnSizingDefinition>` | |
| `ColumnHeaders` | `Record<colId,string>` | Per-layout header captions |
| `ColumnGroupValues` | `ColumnGroupValues` | Column-group expand/collapse state |
| `RowGroupValues` | `RowGroupValues` | Row-group expand/collapse state |
| `RowGroupDisplayType` | `'single' \| 'multi' \| 'groupRows'` | default `'single'`; overrides AG Grid `groupDisplayType` |
| `GrandTotalRow` | `'top' \| 'bottom' \| 'pinnedTop' \| 'pinnedBottom' \| boolean` | `true` ≡ `pinnedTop` |
| `RowSelection` | `LayoutRowSelection \| false` | `undefined` → GridOptions; `false` → disabled |
| `SuppressAggFuncInHeader` | `boolean` | **replaces** GridOptions `suppressAggFuncInHeader` |
| `OpenCharts` | `LayoutOpenChart[]` | Charts to open with the layout |
| `IsReadOnly` | `boolean` | |
| `Tags` | `string[]` | Used by Extended Layouts |
| `MetaData` | `any` | Developer-defined info |

Supporting types:

```ts
interface ColumnSort { ColumnId: string; SortOrder: 'Asc' | 'Desc'; }
interface ColumnFilter { ColumnId: string; Predicates: ColumnFilterPredicate[]; PredicatesOperator?: 'AND'|'OR'; IsReadOnly?: boolean; IsSuspended?: boolean; }
interface ColumnFilterPredicate { PredicateId: string; Inputs: any[]; }
interface GridFilter { Expression: string; IsReadOnly?: boolean; IsSuspended?: boolean; }
interface ColumnSizingDefinition { Width?: number; Flex?: number; MinWidth?: number; MaxWidth?: number; Resizability?: boolean; }
```

### 2.3 `TableLayout extends LayoutBase`

| Property | Type | Notes |
|---|---|---|
| `TableColumns` | `string[]` | **Mandatory**; column ids in display order |
| `ColumnVisibility` | `Record<colId, boolean>` | `false` hides while keeping position |
| `RowGroupedColumns` | `string[]` | Order = grouping hierarchy |
| `TableAggregationColumns` | `{ColumnId, AggFunc}[]` | |
| `RowSummaries` | `RowSummary[]` | Pinned summary rows, e.g. `{Position:'Top'|'Bottom', ColumnsMap:{col:'WEIGHTED_AVERAGE'}}` |

### 2.4 `PivotLayout extends LayoutBase`

| Property | Type | Notes |
|---|---|---|
| `PivotColumns` | `string[]` | **Mandatory** (empty array for aggregation-only) |
| `PivotGroupedColumns` | `string[]` | Row grouping in pivot |
| `PivotAggregationColumns` | `{ColumnId, AggFunc: string \| true, Total?}[]` | |
| `PivotGrandTotal` | `'before' \| 'after' \| true \| false` | |
| `PivotColumnTotal` | same | Subtotal per Pivot Column Group |
| `PivotExpandLevel` | `number` | `-1` all (default), `0` none, `n` levels |
| `PivotResultColumnsOrder` | `string[] \| boolean` | `false` (default), `true` track order, array = initial order |

### 2.5 `LayoutOptions` (`adaptableOptions.layoutOptions`)

```ts
interface LayoutOptions {
  isRowSelectionCheckboxVisible?: (ctx: { data, layout, rowNode, adaptableContext }) => boolean;
  layoutCreationDefaultProperties?: { tableLayout?: Partial<TableLayout>; pivotLayout?: Partial<PivotLayout> }
      | ((ctx: { layoutType:'table'|'pivot', adaptableContext }) => Partial<Layout>);
  layoutTagOptions?: { autoCheckTagsForLayouts?: boolean;
                       autoGenerateTagsForLayouts?: boolean | ((ctx) => AdaptableObjectTag[]);
                       isObjectExtendedInLayout?: (ctx: { adaptableObject, layout }) => boolean; };
  layoutViewOptions?: { maxColumnsToDisplay?: number /* default 10 */ };
  pivotPreviewColumns?: string[] | ((ctx) => string[]);
}
```
Defaults apply to layouts created at runtime via UI **or API**; `Name` cannot be defaulted. `stateOptions.applyState` / `stateOptions.saveState` can inject/strip developer layouts so they don't pollute persisted state.

### 2.6 `LayoutApi` (`adaptableApi.layoutApi`)

```ts
getCurrentLayout(); getCurrentLayoutName(); getLayoutState(); getLayouts();
getLayoutByName(name); getLayoutById(id); doesLayoutExist(layout); isCurrentLayoutPivot();
getCurrentLayoutColumnSort(columnId); getCurrentRowGroupsColumnIds();
getCurrentVisibleColumnIdsForTableLayout(); getCurrentVisibleColumnIdsForPivotLayout();
getCurrentVisibleColumnIdsMapForTableLayout();
createLayout(l); createAndSetLayout(l); createOrUpdateLayout(l);
cloneLayout(l, name); cloneAndSetLayout(l, name);
setLayout(name); saveCurrentLayout();
updateCurrentLayout(fn: (layout) => Partial<Layout>);   // recommended partial update; layout arg is a deep clone
addColumnToCurrentLayout(columnId); removeColumnFromCurrentLayout(columnId); setColumnCaption(columnId, caption);
deleteLayout(l); deleteLayoutByName(name);
getExtendedLayoutByName(name); createOrUpdateExtendedLayout(el); cloneExtendedLayout(el, name); setExtendedLayout(el);
openLayoutSettingsPanel(); showLayoutEditor(layoutName, layoutType?, action?); showChangeColumnCaption(column);
```

### 2.7 Layout Changed event

```ts
api.eventApi.on('LayoutChanged', (info: { actionName: LayoutChangedAction; newLayoutState; oldLayoutState?; adaptableContext }) => {...});
```
`LayoutChangedAction`: `LAYOUT_READY, LAYOUT_ADD, LAYOUT_EDIT, LAYOUT_SAVE, LAYOUT_DELETE, LAYOUT_SELECT, LAYOUT_COLUMN_FILTER_ADD, LAYOUT_COLUMN_FILTER_EDIT, LAYOUT_COLUMN_FILTER_SET, LAYOUT_COLUMN_FILTER_CLEAR, LAYOUT_COLUMN_FILTER_CLEAR_ALL, LAYOUT_COLUMN_FILTER_SUSPEND, LAYOUT_COLUMN_FILTER_SUSPEND_ALL, LAYOUT_COLUMN_FILTER_UNSUSPEND, LAYOUT_COLUMN_FILTER_UNSUSPEND_ALL, LAYOUT_GRID_FILTER_SET, LAYOUT_GRID_FILTER_CLEAR, LAYOUT_GRID_FILTER_SUSPEND, LAYOUT_GRID_FILTER_UNSUSPEND`.

### 2.8 Manually saving layouts

Layouts auto-save on every change. To suppress: implement `stateOptions.persistState` so it writes a **snapshot of last-saved layouts** rather than the running Layout state. Pattern: custom Dashboard buttons *Persist ALL Layout Changes*, *Persist CURRENT Layout Changes*, *Undo Layout Changes* (restore via `createOrUpdateLayout`), *Reset Layout Changes* (`reloadInitialState`). Discarding unsaved changes on switch: listen for `LayoutChanged` with `actionName === 'LAYOUT_SELECT'` and restore from the snapshot.

### 2.9 Switching & synchronising

Keep separate Table and Pivot layouts rather than mutating one between modes. Synchronise shared properties (Column Filters, Grid Filter) in a `LayoutChanged` handler using `filterApi.columnFilterApi.clearAndSetColumnFilters()` and `filterApi.gridFilterApi.setGridFilterExpression()`.

### 2.10 Extending layouts with Object Tags

Objects whose `Tags` include a layout `Name` appear only in that layout when `layoutTagOptions.autoCheckTagsForLayouts: true`; `autoGenerateTagsForLayouts` creates a tag per layout automatically; `isObjectExtendedInLayout` gives per-object control. Extendable modules: Alerts, Custom Sort, Flashing Cell, Format Column, FreeText Column, Plus Minus, Shortcuts, Styled Columns. Wizards gain a **Tags step**.

```ts
interface ExtendedLayout { Layout: Layout; Extensions: { Module: string; Object: any }[]; }
```

---

## Part 3 — Table Layouts

### 3.1 Column order (`TableColumns`)
Mandatory string array in display order. Columns absent from it are not rendered but remain in the Columns Tool Panel. Special placeholders: `'ag-Grid-AutoColumn'` (single row-group column), `'ag-Grid-AutoColumn-<colId>'` (multi display), `'ag-Grid-SelectionColumn'`.

### 3.2 Column visibility (`ColumnVisibility`)
`{ [colId]: false }` hides a column that stays in `TableColumns`. Columns of type `hiddenColumn` are always hidden. **AG Grid ColDef `hide` is ignored.** Hidden columns remain usable in expressions.

### 3.3 Column sizing (`ColumnSizing`, `AutoSizeColumns`)
Precedence: Layout `ColumnSizing` → Layout `AutoSizeColumns` → ColDef `width/flex/minWidth/maxWidth/initialWidth`. Exactly one of `Width`/`Flex` per entry. `AutoSizeColumns` applies only on first load.

### 3.4 Column pinning (`ColumnPinning`)
`{ [colId]: 'left' | 'right' }`. **ColDef `pinned` is ignored.** Row-group and tree auto-columns can be pinned.

### 3.5 Column sorting (`ColumnSorts`)
Applied in array order; may sort by hidden columns; takes precedence over ColDef sort. Custom Sorts apply automatically. Wraps AG Grid header-click and shift-click multi-sort.

### 3.6 Column headers (`ColumnHeaders`)
`{ [colId]: 'Caption' }` — per-layout header text without altering `FriendlyName`.

### 3.7 Row selection (`RowSelection`)

```ts
interface LayoutRowSelection {
  Mode: 'singleRow' | 'multiRow';                     // mandatory
  Checkboxes?: boolean;                                // default true
  HeaderCheckbox?: boolean;                            // default true (multiRow only)
  EnableClickSelection?: boolean | 'enableSelection' | 'enableDeselection'; // default false
  CheckboxInGroupColumn?: boolean;                     // default false
  GroupSelectMode?: 'self' | 'descendants' | 'filteredDescendants'; // default 'self'
  SelectAllMode?: 'all' | 'filtered' | 'currentPage';  // default 'all'
}
```
Maps to AG Grid `rowSelection` object (`Mode→mode`, `Checkboxes→checkboxes`, `CheckboxInGroupColumn→checkboxLocation`, `GroupSelectMode→groupSelects`, `SelectAllMode→selectAll`, `EnableClickSelection→enableClickSelection`). Selection Column id `ag-Grid-SelectionColumn`; position/pin/size it via the Layout. `layoutOptions.isRowSelectionCheckboxVisible(ctx)` per row.

### 3.8 Table Layout Wizard (9 steps)
1. Layout Settings (Name; grid type Table). 2. Row Groups (display type, drag-order, expand behaviour). 3. Key Column Properties (visibility, order, custom header, width, pinning). 4. Aggregations (`enableValue` columns). 5. Row Summaries & Sorts. 6. Column Filters. 7. Grid Filter. 8. Row Selection. 9. Summary.

---

## Part 4 — Pivot Layouts

### 4.1 Concepts

| Layout property | AG Grid ColDef property | Draggable flag |
|---|---|---|
| `PivotAggregationColumns` | `aggFunc` | `enableValue` |
| `PivotColumns` | `pivot` | `enablePivot` |
| `PivotGroupedColumns` | `rowGroup` | `enableRowGroup` |

A Pivot Result Column is generated for each unique permutation of Pivot Column value & Aggregation Column. Aggregation-only pivot: `PivotColumns: []`. Context menu item **"Expand Aggregated Value"** shows underlying rows. Tool Panel sections: Values / Column Labels / Row Groups.

```ts
{ Name:'Pivot Layout', PivotColumns:['language'], PivotGroupedColumns:['license','has_wiki'],
  RowGroupValues:{RowGroupDefaultBehavior:'always-expanded'},
  PivotAggregationColumns:[{ColumnId:'github_watchers',AggFunc:'count'},{ColumnId:'github_stars',AggFunc:'sum'}],
  ColumnSizing:{github_watchers:{Width:475}, github_stars:{Width:200}} }
```

### 4.2 Pivot Result Columns
AG Grid id format `pivot_<pivotColumn>_<value>_<aggColumn>`. These ids can be used in `ColumnSorts`, `ColumnSizing`, `ColumnFilters`, Format Column scopes and `PivotResultColumnsOrder`.

### 4.3 Formatting, filtering, sorting, sizing pivot layouts
- Format on an Aggregation Column propagates to all its result columns; format a specific result column by its `pivot_…` id; pivot row-group column scope `ColumnIds: ['ag-Grid-AutoColumn']`; exclude group rows via `RowScope.ExcludeGroupRows`.
- `ColumnFilters` on pivot, grouped, aggregation (cascades) or `pivot_…` columns. `GridFilter.Expression` uses AdaptableQL.
- `ColumnSorts` on aggregation columns or individual result columns. Custom Sorts apply to aggregation columns only.
- Same `ColumnSizing` map keyed by aggregation or `pivot_…` ids.

### 4.4 Pivot Column Groups
One group per distinct pivot value (`pivotGroup_<value>`). Controls: `PivotExpandLevel` or `ColumnGroupValues { ColumnGroupDefaultBehavior: 'always-expanded'|'always-collapsed'|'expanded'|'collapsed', ExceptionGroupKeys?: string[] }`.

### 4.5 Pivot Total Columns

| Column | Purpose | Configured by |
|---|---|---|
| **Pivot Grand Total** | One total column per Aggregation Column | `PivotGrandTotal` |
| **Pivot Column Total** | Subtotal per Pivot Column Group (all aggregations same `AggFunc`) | `PivotColumnTotal` |
| **Pivot Aggregation Total** | Total per Pivot Result Column within each group | `PivotAggregationColumns[].Total` |

`PivotTotalPosition = 'before' | 'after' | true | false`. Column Totals cannot be combined with Aggregation Totals.

```ts
PivotAggregationColumns: [
  { ColumnId:'gold',   AggFunc:'sum', Total:'before' },
  { ColumnId:'silver', AggFunc:'sum', Total:[{PivotColumnId:'year', ShowTotal:true}] },
]
```
Styling via column types `'pivotGrandTotal'`, `'pivotColumnTotal'`, `'pivotAggregationTotal'`, `'pivotAnyTotal'` in `Scope: { ColumnTypes }`; headers via `columnOptions.columnHeader(ctx)`.

### 4.6 Pivot Layout Wizard (8 steps)
Layout Settings · Row Groups · Pivot Columns · Pivot Aggregations · Column Sorts · Filters · Row Selection · Summary.

---

## Part 5 — Row Grouping

- `RowGroupedColumns` (Table) / `PivotGroupedColumns` (Pivot); array order = hierarchy. `RowGroupDisplayType`: `'single'`, `'multi'`, `'groupRows'`.
- Expanded/collapsed: `RowGroupValues: { RowGroupDefaultBehavior: 'always-expanded'|'always-collapsed'|'expanded'|'collapsed'; GroupKeys?: [{ RowGroupedColumns: string[]; ExceptionGroupKeys: any[][] }] }`.
- Formatting grouped columns: target `Scope.ColumnIds: ['ag-Grid-AutoColumn']` or `['ag-Grid-AutoColumn-<id>']`; whole-row styling via `Scope:{All:true}` + expression.
- Filtering: `'single'` display stores filter under `ColumnId:'ag-Grid-AutoColumn'` with `In` predicate and array-of-arrays tree paths; requires `floatingFilter: true`.
- Sorting priority: Custom Sort → ColDef `comparator` → Layout `ColumnSorts` → AG Grid default.
- `RowScope { ExcludeGroupRows, ExcludeDataRows, ExcludeSummaryRows, ExcludeTotalRows }` on Format/Styled/Action columns controls group-row rendering. Badge renders in group rows by default; Gradient/PercentBar/Icon/Bullet/Rating/RangeBar excluded by default; Sparkline never.

---

## Part 6 — Aggregation

- `TableAggregationColumns: [{ ColumnId, AggFunc: string | true | {type:'weightedAverage', weightedColumnId} }]`. Standard AG Grid funcs plus AdapTable's `only` and weighted average. `SuppressAggFuncInHeader` on the Layout.
- **Grand Total Row:** `GrandTotalRow: 'top'|'bottom'|'pinnedTop'|'pinnedBottom'|true|false`; format via `RowScope`.
- **Weighted Average:** `AggFunc:{type:'weightedAverage', weightedColumnId:'attendance'}`; header shows `weightedAvg(Value-Weight)`; also Row Summaries `'WEIGHTED_AVERAGE'`, Cell Summary `'Weighted Avg'`, AdaptableQL `AVG([x], WEIGHT([w]), GROUP_BY([a]))`.
- **`only`:** returns the value if identical across the group, else `null`.
- **Formatting aggregations:** Format Columns with `Rule.Predicates` + `RowScope.ExcludeDataRows:true`.

---

## Part 7 — Column Groups

- Come from AG Grid ColDefs (`groupId`, `marryChildren`, `columnGroupShow`); **not stored in Layouts but respected**.
- Column options: `addColumnGroupToColumnFriendlyName`, `columnFriendlyName`, `columnType` (`'calculatedColumn'|'freeTextColumn'|'actionColumn'`).
- Expanded/collapsed: `ColumnGroupValues { ColumnGroupDefaultBehavior, ExceptionGroupKeys?: string[] }`.
- Format Column `ColumnGroupScope: 'Both'|'Expanded'|'Collapsed'`.

---

## Part 8 — Master Detail & Tree Data

### Master Detail
Plugin `@adaptabletools/adaptable-plugin-master-detail-aggrid`. Each detail grid is a full independent AdapTable instance.
```ts
plugins: [ masterDetailAgGridPlugin({ detailAdaptableOptions: AdaptableOptions, onDetailInit: (ctx: { data, primaryKeyValue, rowNode, adaptableContext, adaptableApi }) => void }) ]
```
Limits: one nesting level; export per grid.

### Tree Data
Wraps AG Grid Tree Data; no Row Grouping or Pivoting. Auto tree column id `_ag-Grid-AutoColumn_`; tree column defaults to an `In` filter with tree UI. Requires `primaryKey`.

---

## Cross-cutting notes

- Layout properties that **override/ignore AG Grid ColDef**: column order, `hide`, `pinned`, sort, `groupDisplayType`, `suppressAggFuncInHeader`, `rowSelection`. Sizing is the exception.
- Reserved column ids: `ag-Grid-AutoColumn`, `ag-Grid-AutoColumn-<colId>`, `_ag-Grid-AutoColumn_` (tree), `ag-Grid-SelectionColumn`, `pivot_<col>_<value>_<agg>`, `pivotGroup_<value>`.
- Required AG Grid ColDef flags for wizard visibility: `enableRowGroup`, `enableValue`, `enablePivot`; `cellDataType` for correct filtering.
