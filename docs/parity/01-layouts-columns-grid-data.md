# Parity audit — Layouts, Column Management & Grid Data

stern-bak (`widgetstools/stern-bak` @ `5a248ad`) versus AdapTable for AG Grid v23. Every status was verified against source. Paths are relative to the stern-bak repo root.

**Terminology:** stern-bak has no "Layout" object. Its equivalent is a **Profile** (`ProfileManager` + per-module serialized state: general-settings, column-customization, column-groups, calculated-columns, saved-filters, conditional-styling, grid-state blob, …). Where that achieves the same outcome by a different route the status is **Different**; where it only partly covers the AdapTable behaviour, **Partial**.

---

## Layouts

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Named layouts: create / clone / switch / delete | `layoutApi.*`; delete blocked on last layout | **Full (Different)** | `core/engine/src/profiles/ProfileManager.ts` — `create()`, `clone()`, `load()`, `remove()`, `rename()`, `export()`, `import()`; `widget/ProfileSelector.tsx` | Profiles, not layouts. Adds rename + JSON export/import. `RESERVED_DEFAULT_PROFILE_ID` is the delete fallback |
| Auto-save on grid change | Layout auto-updates on every AG Grid change | **Different (deliberately not auto)** | `store/autosave.ts`; `ProfileManager.ts` L236-247 (`disableAutoSave` is production default); `widget/useMarketsGridController.ts` L385-408 `handleSaveAll` — `captureGridStateInto` runs **only** on explicit Save | Opposite default: grid-derived state captured on Save button only, with dirty tracker + `UnsavedSwitchDialog` |
| Column order | `TableColumns[]` | **Full (Different)** | `grid-state/helpers.ts` L173-274 (`applyColumnState({applyOrder:true})`); `widget/column-selector/` (dnd-kit) | Native `GridState` blob, not declarative array; no `ag-Grid-AutoColumn` placeholder concept |
| Column visibility | `ColumnVisibility{}`; ColDef `hide` ignored | **Full (Different)** | native `columnVisibility` slice; `gridContextMenu.ts` L70 "Remove from Grid"; per-column `initialHide` (`colDef/types.ts` L120) | `initialHide` is a mount-only hint, not an override |
| Column width | `ColumnSizing.Width` | **Full** | `grid-state/helpers.ts` L185-199, L243-247; `initialWidth` in `LayoutBand.tsx` | — |
| Column flex | `ColumnSizing.Flex` | **Partial** | native `savedFlex`; global `defaultFlex` (`general-settings/state.ts` L151) | No per-column flex authoring; `ColumnAssignment` has no `flex` |
| Column min/max width | `MinWidth`/`MaxWidth` | **Partial** | global `defaultMinWidth: 80`, `defaultMaxWidth` | Global only |
| Resizability | `Resizability` | **Full** | `ColumnAssignment.resizable`; `LayoutBand.tsx` tri-state | — |
| Autosize columns | `AutoSizeColumns` (first load) | **Partial** | `widget/MarketsGrid.tsx` L70,176-187 `sizeColumnsToFitOnReady` (host prop); `suppressSizeToFit`/`suppressAutoSize` | Host prop, not per-profile; `sizeColumnsToFit` not `autoSizeAllColumns` |
| Column pinning | `ColumnPinning{}` | **Full** | `grid-state/helpers.ts` L175-178, L228-236 (incl. selection-column fix L155-172); `initialPinned` | Hardened for selection column |
| Multi-sort | `ColumnSorts[]` in order | **Full (Different)** | `general-settings/state.ts` L88-97 `multiSortMode`; native `sort` slice | Not a declarative ordered array; no hidden-column sort guarantee; no Custom Sort integration |
| Per-layout header captions | `ColumnHeaders{}` | **Full (Different)** | `ColumnAssignment.headerName`; `transforms.ts` L734; `HeaderBand.tsx` | Plus global `headerCaseUppercase` |
| Row grouping display type | `RowGroupedColumns[]` + `RowGroupDisplayType` | **Full (Different)** | `general-settings/state.ts` L42 `groupDisplayType` (+`'custom'`); per-column `rowGroup`/`rowGroupIndex` → `applyRowGroupingConfigToColDef` (`transforms.ts` L434-458); `RowGroupingEditor.tsx` | Per-column flags + native slice, not an ordered layout array |
| Expand/collapse defaults with exceptions | `RowGroupValues{ RowGroupDefaultBehavior, GroupKeys }` | **Partial** | `groupDefaultExpanded` (0 / -1 / N) only | No `isGroupOpenByDefault`, no per-key exceptions, no `always-*` semantics |
| Aggregations per column | `TableAggregationColumns[]` | **Full (Different)** | `column-customization/state.ts` L89-121 `AggFuncName` (`sum\|min\|max\|count\|avg\|first\|last\|custom`); `transforms.ts` L447-457; `defaultAggFunc` | `custom` compiles a DSL expression to `aggFunc` (`buildCustomAggFn` L465-492) — AdapTable lacks this |
| Weighted average | `{type:'weightedAverage', weightedColumnId}` | **Missing** | zero grep hits; `buildCustomAggFn` only exposes `params.values` | Custom-agg cannot reach sibling columns, so a weight column is unreachable by construction |
| `only` aggregation | value if identical else null | **Missing** | not in `AggFuncName` | — |
| Header suppression | `SuppressAggFuncInHeader` | **Full (Different)** | `general-settings/state.ts` L51 (default true) | Per-profile grid option |
| Grand total row | `GrandTotalRow` | **Full** | `general-settings/state.ts` L48 (same union), plus `groupTotalRow` | — |
| Row summaries (pinned) | `RowSummaries[]` | **Missing** | zero hits for `pinnedTopRowData\|pinnedBottomRowData` | No user-authored summary rows |
| Column filters per layout | `Layout.ColumnFilters[]` | **Different** | `grid-state/helpers.ts` L29-70 persists AG Grid `filterModel` per profile; saved-filter pills | Native filter model, no predicate catalogue |
| Grid filter per layout | `GridFilter{ Expression }` | **Different** | `toolbar-date-settings/rowExclusionFilter.ts`; `activate.ts` L27-46 | Inverted semantics (exclude-when-true); lives in toolbar-date module |
| Row selection mode | `Mode` | **Full** | `general-settings/state.ts` L28; `buildRowSelectionOptions()` (`general-settings/index.ts` L48-67) | — |
| Checkboxes / HeaderCheckbox | independent booleans | **Partial** | single `checkboxSelection` boolean drives both | Cannot separate; `enableClickSelection` implicit |
| GroupSelectMode / SelectAllMode / CheckboxInGroupColumn | 3 options | **Missing** | no `groupSelects`, `selectAll`, `checkboxLocation` | — |
| Selection column position/pin | via Layout | **Partial** | `selectionColumnDef: { pinned:'left' }`; re-apply in `grid-state/helpers.ts` L155-172 | Hard-coded left |
| `isRowSelectionCheckboxVisible` | per-row callback | **Missing** | — | — |
| Open charts with layout | `OpenCharts[]`, `Charting` | **Missing** | no `createRangeChart`/`getChartModels`; `react-core/ui/.../chart.tsx` is Recharts, unrelated | No integrated-chart persistence |
| Extended layouts via tags | `Tags[]`, `layoutTagOptions` | **Missing** | `ProfileMeta` has no tags | Scoping is implicit (everything per profile); cannot share an object across a subset of profiles |
| Layout creation defaults | `layoutCreationDefaultProperties` | **Partial** | `ProfileManager.create()` L404-415 → `platform.resetAll()` → `getInitialState()` constants; host `modules?` prop | Requires replacing a module to override; no declarative option |
| `LayoutChanged` event (19 actions, old/new state) | Yes | **Partial** | `events/marketsGridEventCatalog.ts` — `profile:loaded`/`saved`/`deleted` with `{gridId, profileId}` | 3 coarse actions, no state payload; snapshot-and-restore-on-switch cannot be built from the event |
| Pivot layouts as distinct type | `PivotLayout` | **Different** | `general-settings/state.ts` L46-47 `pivotMode`; per-column `pivot`/`pivotIndex` (`transforms.ts` L442-443) | Exactly what AdapTable warns against: a `pivotMode` flag on the same profile |
| Pivot columns / grouped / aggregation | declarative arrays | **Partial** | per-column flags + native blob | Nothing declarative or named |
| Pivot totals (grand / column / aggregation) | `PivotGrandTotal`, `PivotColumnTotal`, `Total` | **Missing** | only row-wise `grandTotalRow`/`groupTotalRow` | Pivot column totals entirely absent |
| Pivot expand level | `PivotExpandLevel` | **Missing** | — | — |
| Pivot result column order | `PivotResultColumnsOrder` | **Missing** | no `pivot_` id handling | Result columns not addressable in scopes |
| Column groups: respect ColDef groups | respected, not stored | **Partial** | `column-groups/composeGroups.ts` L124-147: host groups pass through only while no user groups exist; then host `ColGroupDef`s are flattened | `marryChildren`, `columnGroupShow` supported on authored groups |
| Column groups: persist expand/collapse | `ColumnGroupValues` | **Full (Different)** | `column-groups/state.ts` L110-118 `openGroupIds` → `openByDefault` | Records actual ids; no `always-*` semantics, no `ColumnGroupScope` for formatting |
| Master detail | plugin | **Missing** | zero hits | — |
| Tree data | wrapped | **Missing** | zero hits for `treeData\|getDataPath` | — |

## Column management

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| `cellDataType` handling | mandatory, drives everything | **Partial** | `types/shared-types/src/dataProvider.ts` L79 (`text\|number\|boolean\|date\|dateString\|object`); consumed by `buildColumnDefs.ts` L160-200, `fieldFormatCatalog/matchFieldToCatalog.ts`, `FormatterPicker/formatCategories.ts` | Load-bearing but not mandatory |
| Array cell data types | `textArray`, `numberArray`, … | **Missing** | allow-lists stop at `'object'` | — |
| Scope `All` | Yes | **Full (Different)** | `ScopeKind = 'selected' \| 'all'` (`formattingActions.ts` L54) → `globalCellStyle` | — |
| Scope `DataTypes` | Yes | **Partial** | `globalCellNumberFormatter`, `globalCellDateFormatter` only (`column-customization/state.ts` L197-212) | Two hard-coded buckets, formatters only |
| Scope `ColumnIds` | Yes | **Full** | `RuleScope` (`conditional-styling/state.ts` L23-25); `assignments[colId]` | — |
| Scope `ColumnTypes` | named column types | **Missing** | no `columnType` concept | — |
| Hidden columns in expressions | Yes | **Full (Different)** | `calculated-columns/virtualColumn.ts` L114-140 evaluates against raw row object | Stronger (non-column fields work); no column-existence validation |
| Runtime ColDef add/remove/update | `columnApi` | **Full (Different)** | `buildVirtualColDef`; transform pipeline (`PipelineRunner`); reactive `columnDefs` prop; provider-editor `ColumnsTab.tsx` | No single imperative call on `MarketsGridHandle` |
| Header context callback | `columnOptions.columnHeader(ctx)` | **Missing** | static `headerName` + `headerCaseUppercase` only | — |
| Column info panel | Yes | **Full (Different)** | `editors/ColumnMetaStrip.tsx` (TYPE · DIRTY · OVERRIDES · TEMPLATES · PINNED · HIDDEN · FILTER); `ColumnEditorHeader.tsx` | In-editor strip; surfaces override/template counts AdapTable lacks |
| Column templates | *no AdapTable equivalent* | **Extra** | `column-templates/state.ts`, `resolveTemplates.ts`, `snapshotTemplate.ts`; `ColumnAssignment.templateIds[]`; `TemplatesBand.tsx`, `TemplateManager` | Chain fold, per-field style merge |

## Grid data

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Load/add/update/delete with PK checks | `gridApi.*GridData`, `setCellValue(s)` | **Partial** | raw AG Grid `gridApi` on `MarketsGridHandle`; `widgets-react/.../applyProviderToGrid.ts` L128-275 (`composeRowId` → `applyTransactionAsync`); `editing-core/applyPatches.ts`, `buildRowUpdates.ts` | No branded API, **no delete path**, no PK-mismatch alert. `EditJournal` has no AdapTable equivalent |
| Row / cell changed events | Yes | **Full (Different)** | `platform/types.ts` L94-111 `ApiEventName`; `marketsGridEventCatalog.ts`; `platform/RowChangeBus.ts` (coalesced added/updated/removed/full) | `RowChangeBus` is better for streaming; payloads are AG Grid events |
| Selection by index | Yes | **Partial** | raw `gridApi`; read helpers `smart-edit/collectTargetCells.ts`, `bulk-update/collectBulkUpdateTargets.ts` | No setter wrapper |
| Selection by key | Yes | **Partial** | `widgets-react/src/hosted/gridContextLink.ts` L113-170 | Only inside OpenFin grid-linking |
| Selection by query | `selectCellRangeByQuery` | **Missing** | — | — |
| `CellSelectionChanged` | Yes | **Full** | `'cellSelectionChanged'` in `ApiEventName`; consumers in smart-edit, bulk-update, formatting toolbar | — |
| `RowSelectionChanged` | Yes | **Partial** | not in `ApiEventName` or catalog; `useGridContextLink.ts` L236 uses raw `gridApi.addEventListener('selectionChanged')` | Modules must bypass platform bus |
| Cell summaries: Sum/Avg/Min/Max/Count | Yes | **Partial (Different)** | `statusBarShowAggregation` → `agAggregationComponent` (`general-settings/index.ts` L173) | AG Grid stock panel, off by default |
| Cell summaries: Median/Mode/Distinct/WeightedAvg/Only/StdDev/custom | 11 ops + custom | **Missing** | zero hits | Not extensible |
| Transposing | `showTransposedView` | **Missing** | zero hits | — |
| Highlight & jump with timeout | Yes | **Missing** | `ensureIndexVisible` only in `grid-state/helpers.ts` L286-301 for viewport restore; flash is change-driven only | No addressable highlight API |
| Custom sort: value list | `CustomSort{ SortedValues }` | **Missing** | zero hits | — |
| Custom sort: comparer | per column | **Partial** | `colDef/nestedField.ts` L43-64 `comparator`, `defaultNullSafeComparator` | Host-only at ColDef time; not authorable/persisted |
| Data sets | `dataSetOptions.dataSets` | **Different** | `providerGridHost` prop; `MarketsGridContainer.tsx`, `useProviderDataWiring.ts`; `gridLevelState.ts` `{liveProviderId, historicalProviderId, mode}`; `DatePicker.tsx` as-of | Richer (transports, config service, streaming); grid-level not profile-level; fixed date form |
| Primary key | `primaryKey` | **Full (Different)** | `GridPlatform.ts` L31,63-76 `rowIdField: string \| string[]`; `composeRowId` (composite `-`-joined, nested dot-paths, null on partial key) | Stronger: composite + nested. Weaker: null id degrades to `''` silently |
| Autogenerate primary key | `autogeneratePrimaryKey` | **Missing** | `getRowIdFn` maps null → `''` | Colliding empty ids instead of generated ones |

---

## Summary

| Status | Count (61 rows) |
|---|---|
| Full (incl. Full-Different) | 21 |
| Partial | 17 |
| Different | 5 |
| Missing | 18 |

Layouts (32): 11 Full · 8 Partial · 4 Different · 9 Missing. Column management (11): 5 Full · 4 Partial · 2 Missing. Grid data (18): 5 Full · 5 Partial · 1 Different · 7 Missing.

### Top 5 gaps

1. **Pivot is not a first-class layout type, and pivot totals/expand/result-order are absent.** `pivotMode: boolean` on the same profile as table config is exactly what AdapTable warns against. `PivotGrandTotal`, `PivotColumnTotal`, per-aggregation `Total`, `PivotExpandLevel`, `PivotResultColumnsOrder` have no counterpart; `pivot_<col>_<value>_<agg>` ids are not addressable.
2. **Weighted average, `only`, and row summaries are missing, and the custom-agg escape hatch cannot close the gap** because `buildCustomAggFn` only receives the aggregated column's values. For a trading blotter, weighted-average yield/spread and pinned summary rows are table stakes.
3. **Grid state is explicit-save-only, and the layout event carries no state.** `disableAutoSave` is the production default, the inverse of AdapTable. `profile:*` events carry `{gridId, profileId}` only, so snapshot-and-restore and cross-layout filter sync cannot be built from events.
4. **Cell summaries, transposing, highlight-and-jump, and custom sorting are absent.** The only cell summary is AG Grid's fixed panel, off by default.
5. **Row-selection configuration is coarse, and `RowSelectionChanged` is not on the platform bus.** Seven AdapTable options collapse into `mode` + one boolean.

### Where stern-bak exceeds AdapTable

Composite + nested-path primary keys (`composeRowId` with null-on-partial-key guard); the coalesced `RowChangeBus` delta signal; column templates; custom DSL-expression aggregations; profile JSON export/import.
