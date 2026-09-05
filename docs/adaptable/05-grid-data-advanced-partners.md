# AdapTable for AG Grid — Working with Grid Data, Advanced Features, Partners

Source: https://www.adaptabletools.com/docs (62 pages). `/docs/handbook-fdc3-custom` is a placeholder ("coming soon").

---

## 1. Exporting

### What it does
Exports grid data through three composable parts: **Report** (what data), **Report Format Type** (Excel / VisualExcel / CSV / JSON), and **Export Destination** (Download, Clipboard, or a developer Custom Destination). Exports are snapshots (live reports only via OpenFin/ipushpull plugins). ~300,000 cells max for Excel. Wraps AG Grid export (`ExcelExportModule`; `ExcelExportParams`/`CsvExportParams` passed through).

### Reports
**System Reports:** `'All Data'`, `'Current Layout'` (visible rows/cols), `'Selected Data'`.

**Custom Reports** (`Report` object, stored in State):
```ts
Report {
  Name: string;
  ReportColumnScope: 'AllColumns' | 'VisibleColumns' | 'SelectedColumns' | 'ScopeColumns';
  ReportRowScope: 'AllRows' | 'VisibleRows' | 'SelectedRows' | 'ExpressionRows';
  Scope?: ColumnScope;                 // when ScopeColumns
  Query?: { BooleanExpression: string };  // when ExpressionRows
  IsReadOnly?: boolean;
}
```

### Format Types
| Format | File | Clipboard | Notes |
|---|---|---|---|
| Excel | yes | no | per-column Excel types via `cellClass: ['numberExcelType' | 'stringExcelType' | 'dateExcelType' | 'booleanExcelType']` |
| VisualExcel | yes | no | WYSIWYG: value formatters, Format Column styles, Row Groups, AG Grid Excel Styles. Only **Gradient** Styled Columns export. |
| CSV | yes | yes | `csvSeparator` |
| JSON | yes | yes | |

### Destinations
System: `'Download'`, `'Clipboard'` (CSV/JSON). **Custom Destination:**
```ts
CustomDestination { name: string; onExport?: (ctx: ReportContext) => void; form?: AdaptableForm<ExportFormContext> }
ReportContext { reportData: ExportResultData; exportDestination; report; reportFormat; reportName; adaptableContext }
ReportData { columns: ReportColumn[]; groupColumnIds; pivotColumnIds; rows: Record<string,any>[] }
ExportResultData = { type:'csv'; data:string } | { type:'json'; data:ReportData } | { type:'excel'; data: Blob|string }
```

### ExportOptions (`exportOptions`)
| Option | Type | Default |
|---|---|---|
| `appendFileTimestamp` | boolean | false |
| `csvSeparator` | string \| fn | `','` |
| `customDestinations` | `CustomDestination[]` \| fn | — |
| `excelSheetName` | string \| fn | `'Sheet 1'` |
| `exportDataFormat` | `'rawValue' \| 'formattedValue' \| {date?,number?,text?} \| fn` | `'rawValue'` |
| `exportDateFormat` | string | — |
| `getDetailRows` | fn (master-detail) | — |
| `isColumnExportable` | `(ctx) => boolean` | true |
| `processExport` | `(ctx) => Promise<ExportResultData \| boolean>` | — |
| `reportFilename` | `(ctx) => string` | — |
| `skipColumnHeaders` | boolean \| fn | false |
| `systemExportDestinations` | list \| fn | `['Download','Clipboard']` |
| `systemReportFormats` | list \| fn | all four |
| `systemReportNames` | list \| fn | all three |

### Scheduling (Export)
```ts
ReportSchedule { Name; ReportName; ReportFormat; ExportDestination; Schedule: { IsOneOff: boolean; CronExpression?: string; RunAt?: string }; IsReadOnly?; IsSuspended? }
```
Stored at `Export.ReportSchedules`. Wizard: Settings → Export → Schedules.

### State
```ts
Export: { CurrentReport?; CurrentFormat?; Reports: Report[]; ReportSchedules: ReportSchedule[] }
```

### UI
Export Toolbar, Tool Panel, Status Bar panel, Settings Panel (incl. Schedules), Export Wizard (Name → column scope → row scope), Context Menu "Export Selected Cells", progress indicator.

### Export API (`exportApi`)
`exportReport(name, format, destination?, config?)`, `getReportData(name, format, config)`, `selectReport/selectFormat/clearReport/clearFormat`, `updateReport(s)`, `getReportByName/ById/getAllReports/getCustomReports/getCurrentReport/getCurrentReportName/getCurrentReportFormat/getExportState`; schedules: `addScheduledReport, editScheduledReport, deleteScheduledReport, applyScheduledReport, getScheduledReports, getActiveScheduledReports, getScheduledReportById, suspend/unSuspendScheduledReport`; `getAllFormats, canExportToExcel, canExportToCsv, getAllExportDestinations, getAvailableSystemDestinations, getAvailableCustomDestinations, getSupportedExportDestinations(format), getDestinationByName, isExportDestinationSystem, getExportDestinationForm`; `openExportSettingsPanel()`, `isColumnExportable(column)`.

### Events
`ReportScheduleRan` → `{ RanAt, reportSchedule, adaptableContext }`. `LiveDataChanged` (OpenFin/ipushpull).

---

## 2. Importing (Data Import)

Runtime users load JSON/CSV files or paste text to **update existing rows**, **add new rows**, or **populate an empty grid**. Import Data Wizard matches source columns by `columnId`, then `friendlyName`, else manual mapping; validates; applies via AG Grid transactions.

### DataImportOptions (`dataImportOptions`)
| Property | Type |
|---|---|
| `fileHandlers` | `[{ fileExtension: string; handleFile: (file: File) => Promise<T[]> }]` |
| `handleImportedData` | `(ctx) => Promise<void \| HandleImportedDataResolution>` |
| `textHandler` | `(text: string) => T[] \| Promise<T[]>` |
| `validate` | `(ctx: { rowData, adaptableContext }) => { columnId, error }[] \| undefined` |
| `_getPrimaryKeyValue` | `(ctx) => string \| number` |
| `_preprocessRowData` | `(ctx) => Record<string,any>` |

UI: Import Data Wizard, Dashboard module button `'DataImport'`. API: `openImportWizard()`. Event `'DataImported'` → `{ addedRows, updatedRows, importData, adaptableContext }`.

---

## 3. Custom Sorting

Non-standard sort orders (e.g. ratings AAA, AA+, …). One Custom Sort per column; comparers take precedence over lists.

1. **Hard-coded list** (state):
```ts
CustomSort { ColumnId; Name; SortedValues: (string|number)[]; IsReadOnly?; IsSuspended? }
// State: CustomSort: { CustomSorts: CustomSort[] }
```
2. **Comparer function** (`customSortOptions.customSortComparers: [{ name, scope: ColumnScope, comparer(a, b, nodeA, nodeB) => number }]`, design-time only).

UI: Settings Panel; Wizard (name → column → drag distinct values). API (`customSortApi`): `addCustomSort, createCustomSort, deleteCustomSort, editCustomSort, editCustomSortValues, getCustomSorts, getActiveCustomSorts, getSuspendedCustomSorts, getCustomSortById/ByName, getCustomSortForColumn, getCustomSortState, getLiveCustomSorts, getLiveCustomSortComparers, suspend/unSuspend(All)CustomSort, openCustomSortSettingsPanel`. Event `'GridSorted'` → `{ adaptableSortState: { columnSorts, customSortComparers, customSorts }, adaptableContext }`.

---

## 4. Selecting

Wraps AG Grid cell/row selection (`CellSelectionModule` + `cellSelection`). Row selection per Layout (`Layout.RowSelection`).

### Grid API selection methods
```ts
GridCellRange { columnIds: string[]; rowIndexStart?; rowIndexEnd?; primaryKeyValueStart?; primaryKeyValueEnd? }
selectCellRange(range); selectCellRangeByQuery(query, range?);
selectColumn(columnId) / selectColumns(columnIds); columnApi.addColumnToSelection(columnId);
selectRow(pk) / selectRows(pks, replace?); selectNode(rowNode, replace?) / selectNodes(rowNodes);
selectAll() / deselectAll();
```

### Events
`'CellSelectionChanged'` → `{ selectedCellInfo: { columns, gridCells: GridCell[] }, adaptableContext }`.
`GridCell { column; displayValue; rawValue; normalisedValue; primaryKeyValue; rowNode; isPivotCell; isRowGroupCell; visible }`.
`'RowSelectionChanged'` → `{ selectedRowInfo: { gridRows: GridRow[] }, adaptableContext }`.
`GridRow { primaryKeyValue; rowData; rowNode; rowInfo: { isDisplayed; isExpanded; isGroup; isMaster; isSelected; rowGroupLevel } }`.

---

## 5. Summarising

### Cell Summaries
Summary of selected cells in a **single numeric column**. Operations: Sum, Average, Median, Mode, Distinct, Max, Min, Count, Weighted Avg, Only, Std Deviation. UI: Toolbar, Tool Panel, Status Bar panel with operation dropdown. Dashboard module button `'CellSummary'`.

`cellSummaryOptions`: `customCellSummaryOperations: [{ operationName, operationFunction(ctx: { selectedCellInfo, selectedColumn, adaptableContext }) }]`, `numericDisplayFormat: NumberFormatterOptions | fn`.

API (`cellSummaryApi`): `getCellSummaryOperationValue(op)`, `getCurrentCellSummaryOperation()`, `getCurrentCellSummaryOperationValue()`, `getCustomCellSummaryOperations()`, `setCurrentCellSummaryOperation(op)`, `openCellSummaryPopupSettingsPanel()`.

### Row Summaries
Pinned top/bottom rows with per-column aggregations; stored **per Table Layout**:
```ts
Layout.RowSummaries: [{ Position: 'Top' | 'Bottom'; ColumnsMap: Record<columnId, 'SUM'|'AVG'|'COUNT'|'MIN'|'MAX'|'MEDIAN'|'MODE'|'DISTINCT'|'ONLY'|'WEIGHTED_AVERAGE'|'STD_DEV'>; IncludeOnlyFilteredRows?: boolean; IsReadOnly?; IsSuspended? }]
```

---

## 6. Transposing
`gridApi.showTransposedView(config)` shows rows-as-columns in a popup or in `containerOptions.transposedViewContainer`. Not saveable to Layouts.
```ts
TransposeConfig { transposedColumnId?; hideTransposedColumn?; columnsToTranspose?: string[] | fn; rowsToTranspose?: 'All' | 'VisibleOnly' | Expression }
```

---

## 7. Highlighting & Jumping (Grid API)
`highlightCell({ columnId, primaryKeyValue, highlightStyle: AdaptableStyle, timeout? })`, `unHighlightCell`, `unHighlightAllCells`, `highlightRow({ primaryKeyValue, highlightStyle, timeout? })`, `highlightRows`, `unHighlightRow(s)`, `unHighlightAllRows`, `highlightColumn(columnId)`, `unHighlightColumn`, `unHighlightAllColumns`. Jump: `jumpToRow(pk)`, `jumpToColumn(columnId)`, `jumpToCell(pk, columnId)`.

---

## 8. Scheduling
Available in **Scheduled Reports** (`Export.ReportSchedules`) and **Scheduled Alerts**. Both share `Schedule { IsOneOff; CronExpression; RunAt }`.

---

## 9. Team Sharing

Run-time sharing of Adaptable Objects between users via a developer-supplied remote store. Modes: **Snapshot** (one-off), **Active** (linked, auto-sync, optimistic concurrency via `Revision`), **Referenced** (dependencies uploaded together). Requires `enableTeamSharing: true` and `TeamSharing` entitlement.

### TeamSharingOptions
| Property | Type | Default |
|---|---|---|
| `enableTeamSharing` | boolean | false |
| `loadSharedEntities` | `(ctx) => Promise<SharedEntity[]>` | required |
| `persistSharedEntities` | `(entities, ctx) => Promise<void>` | required |
| `applySharedEntities` / `saveSharedEntities` | transforms | — |
| `handleCustomSharedEntityImport` | `(entity) => void` | — |
| `updateInterval` | minutes | 0 |
| `updateNotification` | `'Alert' \| 'AlertWithNotification' \| 'SystemStatus'` | null |
| `showUpdateNotificationOncePerUpdate` | boolean | false |
| `suppressOverrideConfigWarning` | boolean | false |

```ts
SharedEntity { Uuid; Name; Description; Entity; EntityType: 'adaptableEntity' | custom; Module; Type: 'Snapshot' | 'Active'; Revision; Timestamp; ChangedAt; ChangedBy; UserName; EntityDependencyIds; IsReadOnly? }
```

UI: "Share" button on every Settings Panel screen; Team Sharing screen; Status Bar module. API (`teamSharingApi`): `shareAdaptableEntity`, `shareCustomEntity`, `importSharedEntry`, `unshareEntity`, `loadSharedEntities`, `persistSharedEntities`, `refreshTeamSharing`, `checkForUpdates`, `getLoadedSharedEntities`, `getLoadedAdaptableSharedEntities`, `getLoadedCustomSharedEntities`, `hasTeamSharingFullRights`, `isTeamSharingAvailable`, `openTeamSharingSettingsPanel`. Event `'TeamSharingEntityChanged'`.

---

## 10. Row Form

Popup forms for row CRUD: **Create**, **Clone**, **Edit**, **Delete**. Opened via API or Action Column commands. Inputs map from column data type.

### RowFormOptions (`rowFormOptions`)
| Property | Type | Default |
|---|---|---|
| `autoHandle` | boolean | true |
| `disableInlineEditing` | boolean | false |
| `includeColumnInRowForm` | `(ctx) => boolean` | — |
| `onRowFormSubmit` | `(info) => void` | — |
| `rowFormButtons` | `AdaptableButton[]` | [Save, Cancel] |
| `rowFormTitle` / `rowFormDescription` | string \| fn | — |
| `rowFormFieldLabel` | fn | — |
| `rowFormField` | `(ctx) => Partial<AdaptableFormField>` (`required, pattern, helpText, fieldType, hidden, disabled, rows, placeholder, options, label`) | — |
| `setPrimaryKeyValue` | `(ctx) => any` | — |

API (`rowFormApi`): `displayCreateRowForm()`, `displayEditRowForm(pk)`, `displayCloneRowForm(pk)`, `displayDeleteRowForm(pk)`. Event `'RowFormSubmitted'` → `{ type: 'rowCreated'|'rowEdited'|'rowDeleted', formData?, rowNode, adaptableContext }`.

---

## 11. No Code

Plugin `@adaptabletools/adaptable-plugin-nocode-aggrid` — `plugins: [nocode()]`. Builds a full AdapTable+AG Grid instance from an uploaded JSON or Excel file, auto-detecting column names/types.

**Wizard (6 steps):** Data load → Columns (include/exclude, primary key, type, flags) → Adaptable config → GridOptions subset → UI (Tool Panel, Status Bar) → Entitlements.

Component `AdaptableOptionsWizardView` props: `skipToWizard`, `ddEnabled`, `adaptableOptions`, `onInit(adaptableOptions, rowData)`, `startSections: [{ title, isValid, render(adaptableOptions, onChange, selectColumns) }]`.

---

## 12. FDC3

Declarative FDC3 2.x support. Grid columns mapped to FDC3 Context types; AdapTable can **raise Intents**, **broadcast Contexts**, and **listen** for both, via Context Menu items and FDC3 Action Columns.

### Fdc3Options (`fdc3Options`)
| Property | Type |
|---|---|
| `gridDataContextMapping` | `{ '<fdc3.type>': { name: '_colId.x' \| '_field.y'; id: Record<string, DataMapping> } }` |
| `intents` | `{ raises: RaiseIntentConfiguration; listensFor: Intent[]; handleIntent(ctx); handleIntentResolution(ctx) }` |
| `contexts` | `{ broadcasts: BroadcastConfiguration; listensFor: ContextType[]; handleContext(ctx) }` |
| `actionColumnDefaultConfiguration` | `{ columnId, headerName, width, movable, resizable, rowScope }` |
| `uiControlsDefaultConfiguration` | default icons/labels |
| `resolveContextData` | fn |
| `enableLogging` | boolean |

Supported standard contexts (14): Chart, ChatInitSettings, Contact, ContactList, Country, Currency, Email, Instrument, InstrumentList, Organization, Portfolio, Position, TimeRange, Valuation. Standard intents (14): StartCall, StartChat, StartEmail, ViewAnalysis, ViewChart, ViewContact, ViewHoldings, ViewInstrument, ViewInteractions, ViewNews, ViewOrders, ViewProfile, ViewQuote, ViewResearch.

API (`fdc3Api`): `broadcastFromPrimaryKey`, `broadcastFromRow`, `buildContextDataForPrimaryKey`, `buildContextDataFromRow`, `raiseIntentFromPrimaryKey`, `raiseIntentFromRow`, `raiseIntentForContextFromPrimaryKey`, `raiseIntentForContextFromRow`, `getDesktopAgent`, `getContextLabel`, `isStandardContextType`, `isStandardIntentType`. Event `'Fdc3Message'` (sent/received).

---

## 13. System Status Message

Session-scoped runtime notifications typed `'Info' | 'Success' | 'Warning' | 'Error'`. Displayed in System Status Toolbar, Tool Panel, Status Bar, Dashboard module button, optional Toasts, Settings Panel history. **Not persisted.**

Options (`notificationOptions`): `maxSystemMessagesInStore` (100), `showSystemStatusMessageNotifications` (false).
API (`systemStatusApi`): `setInfoSystemStatus`, `setSuccessSystemStatus`, `setWarningSystemStatus`, `setErrorSystemStatus`, `setSystemStatus(msg, type, furtherInfo?)`, `getCurrentSystemStatusMessageInfo`, `deleteAllSystemStatusMessages`, `openSystemStatusSettingsPanel`. Event `'SystemStatusMessageDisplayed'`.

---

## 14. Partners / Integrations

### OpenFin (`@adaptabletools/adaptable-plugin-openfin`)
Alerts as OpenFin Notifications; **Live Excel** bidirectional sync of a Report with an Excel workbook; FDC3 via OpenFin's agent. `OpenFinPluginOptions`: `notificationTimeout`, `showAdaptableAlertsAsNotifications`, `showAppIconInNotifications`, `onNotificationAction`, `onShowNotification`, `onValidationFailureInExcel: 'override' | 'show-notification' | 'show-undo-notification'`, `throttleTime`. API: `startLiveData(report)`, `stopLiveData()`, `showNotification`, `showNotificationForAlert`, `isOpenFinAvailable`, `isOpenFinRunning`, etc.

### interop.io (`@adaptabletools/adaptable-plugin-interopio`)
Replaced Finsemble and Glue42 plugins (v18). Converts popup Alerts to interop.io Notifications; FDC3 with `@interopio/fdc3`. `InteropioPluginOptions`: `showAdaptableAlertsAsNotifications`.

### ipushpull (`@adaptabletools/adaptable-plugin-ipushpull`)
One-way push of Reports to ipushpull pages (Symphony, Bloomberg) as **Snapshot** or **Live**. Toolbar: Reports/Folders/Pages dropdowns, Send Snapshot, Run Live Report, New Page, Logout. `IPushPullPluginOptions`: `username`, `password`, `autoLogin`, `throttleTime`, `includeSystemReports`, `cellStyles`, `ippConfig`.

---

## Cross-cutting notes
- Every options callback receives `adaptableContext`.
- Most stateful objects carry `IsReadOnly` and, where applicable, `IsSuspended`.
- Event subscription is uniformly `adaptableApi.eventApi.on('<EventName>', (info) => …)`.
- Features with no Initial State: Data Import, Transposing, Highlighting/Jumping, System Status, ipushpull, interop.io, FDC3.
