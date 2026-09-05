# AdapTable for AG Grid — Cell Rendering, Editing & Annotating

Source: https://www.adaptabletools.com/docs (62 pages in the Cell Rendering, Editing and Annotating sections).

---

## Cross-cutting concepts

**Scope (ColumnScope).** Nearly every definition carries a `Scope` object choosing *which columns* it applies to. Exactly one of:
- `{ All: true }` — every column (for Format Columns this means "whole row"; for Flashing it means row-level flashing)
- `{ DataTypes: ['number' | 'text' | 'date' | 'boolean' | ...] }`
- `{ ColumnIds: ['colA', 'colB'] }`
- `{ ColumnTypes: [...] }` — custom AG Grid column `type` groupings

Shortcut and PlusMinus use `ColumnScope<NumberScopeDataType>` (numeric only). Styled Columns bind to a single `ColumnId`.

**RowScope.** Format Columns and Styled Columns can restrict which *row kinds* render the style: `{ ExcludeDataRows?, ExcludeGroupRows?, ExcludeSummaryRows?, ExcludeTotalRows? }`.

**Rule.** Conditions are either `Predicates: [{ PredicateId, Inputs?, ColumnId? }]` (AND-ed) or `BooleanExpression: '<AdapTableQL>'`. When Scope is `All`, an Expression must be used.

**Common entity flags.** `IsSuspended: boolean`, `IsReadOnly: boolean`.

**Entitlements.** Every module: `Full` / `ReadOnly` / `Hidden`.

**UI pattern.** Settings Panel section (add/edit/share/suspend/delete), a multi-step Wizard (common trailing steps: Tags, Summary), Column Menu / Context Menu entries.

**API pattern.** `adaptableApi.<module>Api` with `add*/edit*/delete*`, `get*ByName/ById`, `getActive*/getSuspended*`, `suspend*/unSuspend*` (+ `All`), `get*State()`, `open*SettingsPanel()`.

---

## 1. Column Formatting (Format Column module)

**What it does.** Controls how cell values display (Display Format) and how cells look (Style), optionally only when a Condition is met. Non-destructive — underlying values unchanged; filters/sorts use raw values. Applies to all column types including Calculated and FreeText columns.

**State:** `FormatColumn.FormatColumns: FormatColumn[]` — **array order = evaluation precedence**.

### FormatColumn object

| Property | Type | Notes |
|---|---|---|
| `Name` | string | |
| `Scope` | ColumnScope | |
| `Style?` | AdaptableStyle | |
| `DisplayFormat?` | AdaptableFormat \| preset name string | e.g. `'Dollar'` |
| `Rule?` | `{ Predicates?: Predicate[]; BooleanExpression?: string }` | undefined → always applies |
| `Target?` | `'cell'` \| `'columnHeader'` | default `'cell'` |
| `RowScope?` | RowScope | |
| `ColumnGroupScope?` | `'Both'` \| `'Expanded'` \| `'Collapsed'` | default Both |
| `IsReadOnly?`, `IsSuspended?` | boolean | |

### AdaptableStyle

`ForeColor`, `BackColor`, `BorderColor`, `FontWeight: 'Bold'|'Normal'`, `FontStyle: 'Italic'|'Normal'`, `FontSize`, `Alignment: 'Left'|'Right'|'Center'`, `ClassName: string` (existing CSS class; not supported for Flashing Cells), `BorderRadius`.

### DisplayFormat = `{ Formatter, Options }`

**NumberFormatter** options: `Abs`, `Ceiling`, `Floor`, `Round`, `Truncate`, `Parentheses`, `Empty` (booleans); `FractionDigits`, `IntegerDigits`, `Multiplier`; `FractionSeparator`, `IntegerSeparator`, `Prefix`, `Suffix`, `ZeroDisplay`; `Notation: 'standard'|'scientific'`; `Content` (replaces value; template literals); `CustomDisplayFormats: string[]`.

**15 numeric presets** usable as `DisplayFormat: 'Dollar'`: Dollar, Sterling, Euro, Yen, Bitcoin, K, M, B, Integer, Decimal, Percentage, Scientific, Accounting, FXRate, BasisPoints.

**StringFormatter** options: `Case: 'Upper'|'Lower'|'Sentence'`, `Content`, `Empty`, `Prefix`, `Suffix`, `Trim`.

**DateFormatter** options: `Pattern: string` (Unicode TR35). Presets: `MM/dd/yyyy`, `dd-MM-yyyy`, `MMMM do yyyy, h:mm:ss a`, `EEEE`, `MMM do yyyy`, `yyyyMMdd`, `HH:mm:ss`.

**Template literals** (String & Number `Content`): `[column]`, `[value]`, `[rowData.x]`.

**Custom Display Formats** — `formatColumnOptions.customDisplayFormatters: [{ id, label, scope, handler: (ctx: { adaptableColumn, cellValue, rowNode, adaptableContext }) => string }]`, referenced via `Options.CustomDisplayFormats: ['id']`.

### Conditions
- **Predicates** — AND-ed; **referenced predicate** via `ColumnId` evaluates a different column than the one styled. Custom predicates in `predicateOptions.customPredicateDefs` with `moduleScope: ['formatColumn']`.
- **Expressions** — `Rule.BooleanExpression: '[language] = "TypeScript" AND [license] = "MIT License"'`. Required when `Scope: { All: true }`.

### Composition & precedence
Multiple Format Columns on one cell: **Style properties merge** (earlier wins on conflict); **Display Formats do not merge**. Cross-module style precedence: Flashing Cell > Quick Search > Format Column.

### Column headers
`Target: 'columnHeader'` — Styles and String Display Formats; no Conditions.

### UI
Settings Panel section; Column Menu "Create/Edit Format Column"; Dashboard module button `'FormatColumn'`. **Wizard:** Name & Row Scope → Column Scope → Target → Condition → Style → Display Format. Precedence up/down buttons.

### FormatColumnAPI
`addFormatColumn(s)`, `editFormatColumn`, `deleteFormatColumn`, `deleteAllFormatColumns`, `findFormatColumns(criteria)`, `getFormatColumns`, `getActiveFormatColumns`, `getSuspendedFormatColumns`, `getFormatColumnByName/ByUuId`, `getFormatColumnsForColumn(Id)`, `getDisplayFormatForColumn`, `hasCustomDisplayFormatter`, `incrementFormatColumnPrecedence`, `decrementFormatColumnPrecedence`, `suspend/unSuspend(All)FormatColumn`, `getFormatColumnState`, `openFormatColumnSettingsPanel`.

---

## 2. Styled Columns

**What it does.** Eight data-driven cell renderers. One Styled Column per column; binds by `ColumnId`. Styled Column slices override matching Format Column properties on the same column.

**State:** `StyledColumn.StyledColumns: [{ ColumnId, Name, <OneStyle>, RowScope?, IsSuspended?, IsReadOnly? }]`. Style keys: `GradientStyle`, `PercentBarStyle`, `BadgeStyle`, `SparklineStyle`, `BulletChartStyle`, `RatingStyle`, `RangeBarStyle`, `IconStyle`.

**Availability by data type:** Numeric → Gradient, Percent Bar, Bullet, Range Bar, Rating, Badge, Icon; String → Badge, Icon; String array → Badge; Number array → Badge, Sparkline.

**Default RowScope:** Badge = Data+Group+Summary+Total; Sparkline = Data only; others = Data+Summary+Total.

### Shared numeric types
- `NumericStyledColumn`: `RangeValueType: 'Number'|'Percentage'`, `CellRanges: CellColorRange[]`, `ColumnComparison: { MinValue, MaxValue: number|columnId, Color }`.
- `CellColorRange`: `{ Min, Max: number | 'Col-Min'|'Col-Max'|'Col-Avg'|'Col-Median', Color, ReverseGradient?, MinAlpha?, MaxAlpha? }`.
- `CellFontStyle`: `Alignment`, `FontSize: 'XSmall'..'XLarge'`, `FontStyle`, `FontWeight`, `ForeColor`, `TextDecoration`.
- `CellBoxStyle`: `BackColor`, `BorderColor`, `BorderRadius`.
- `BarStyleMarker`: `{ Shape: 'Line'|'Triangle'|'Dot'|'Diamond', Color, Size }`.
- `CellTextProperties.CellTextLayout.{CellValue, PercentValue}` with `{ Horizontal: 'Left'|'Center'|'Right', Vertical: 'Above'|'Below'|'Merged' }`.
- `ToolTipText: ('CellValue'|'PercentageValue')[]`.

### Gradient (numeric)
`GradientStyle`: one of `CellRanges` / `ZeroCentred: { NegativeColor, PositiveColor }` / `ColumnComparison`; `MinAlpha` (0.15), `MaxAlpha` (1), `AutoContrastText`, `Font`, `ToolTipText`.
```ts
GradientStyle: { RangeValueType: 'Number', CellRanges: [{ Min: 'Col-Min', Max: 1000, Color: 'Red' }, { Min: 1000, Max: 5000, Color: 'Orange' }, { Min: 5000, Max: 'Col-Max', Color: 'Green' }], MinAlpha: 0.15, MaxAlpha: 0.85 }
```

### Percent Bar (numeric)
`PercentBarStyle`: ranges; `Origin: 'Auto'|'Zero'|'Min'|number`; `BackColor`; `CellTextProperties`; `Font`; `ToolTipText`.

### Badge (numeric, string, textArray, numberArray)
`BadgeStyle`: `Badges: [{ Shape: 'Pill'|'Rounded'|'Square', PillStyle: { BackColor, ForeColor, BorderColor, FontWeight, FontStyle, TextDecoration }, Predicate?, Expression?, IconProperties?: { Icon, Position: 'Start'|'End', Gap?, IconOnly? } }]` (first match wins), `Density: 'Compact'|'Normal'|'Comfortable'`, `Spacing`, `Cell`, `Font`, `OverflowMode: 'Truncate'|'Wrap'|'Scroll'`.

### Sparkline (numberArray / tupleArray / objectArray)
Wraps AG Grid Sparklines (`SparklinesModule`). `SparklineStyle: { options: AgSparklineOptions, Cell?: CellBoxStyle }`. Data rows only. Pairs with Calculated Columns using `TO_ARRAY()`.

### Bullet Chart (numeric)
`BulletChartStyle`: ranges (bands); `TargetProperties: { Target: number|columnId|'Col-Avg'|'Col-Median'|[{Value, Marker?, Label?}], Marker }`; `Bar: { Color, Height }`; `Origin`; `Orientation: 'Horizontal'|'Vertical'`; `BackColor`; `CellTextProperties`; `Font`; `ToolTipText`.

### Rating (numeric)
`RatingStyle`: `Icon: 'Star'|'Heart'|'Circle'|'Thumb'`, `Max` (5), `Size` (14), `Gap` (2), `FilledColor`, `EmptyColor`, `AllowHalf` (true), `ShowValue`, `ToolTipText`, `Cell`.

### Range Bar (numeric)
`RangeBarStyle`: `Min`, `Max` (number | columnId | dynamic endpoint); `Reference?: { Value, Marker }`; `Marker`; `Track: { Color?, Height? }`; `CellRanges?`; `RangeValueType`; `Orientation`; `BackColor`; `CellTextProperties`; `ToolTipText`; `OutOfRange: { Mode: 'Clamp'|'Overflow'|'Hide', Color? }`.
```ts
RangeBarStyle: { Min: 'weekLow', Max: 'weekHigh', Reference: { Value: 'previousClose', Marker: { Shape: 'Line', Color: 'var(--ab-color-foreground)', Size: 2 } }, Marker: { Shape: 'Diamond', Color: 'var(--ab-color-accent)', Size: 8 }, Track: { Color: 'rgba(255,255,255,0.35)', Height: 4 }, OutOfRange: { Mode: 'Overflow', Color: '#ff6b6b' } }
```

### Icon (scalar columns)
`IconStyle`: `Preset: 'Flags'|'Currencies'|'Trend'|'Status'`, `Mappings: [{ Key, Icon: string | { name } | { src }, Description? }]`, `MatchMode: 'Exact'|'CaseInsensitive'`, `FallbackProperties: { Mode: 'Hide'|'ShowText'|'Icon', Icon? }`, `CellTextProperties: { CellText: ('CellValue'|'IconDescription')[], CellTextPosition: 'Before'|'After'|'Above'|'Below' }`, `ToolTipText`, `Size` (18), `Gap` (4), `Font`, `Cell`.

### StyledColumnAPI
`addStyledColumn`, `editStyledColumn`, `deleteStyledColumn`, `deleteAllStyledColumns`, `getStyledColumns`, `getActiveStyledColumns`, `getSuspendedStyledColumns`, `getStyledColumnById/ByName`, `getStyledColumnForColumnId`, `getActiveStyledColumnForColumn`, `hasGradientStyle/hasPercentBarStyle/hasBulletChartStyle/hasRatingStyle(columnId)`, `isSparklineStyleStyledColumn`, `canDisplaySparklines`, `renderSparkline(options)`, `suspend/unSuspend(All)StyledColumn`, `getStyledColumnState`, `openStyledColumnSettingsPanel`.

---

## 3. Flashing Cells & Rows

**What it does.** Temporarily (or permanently) styles a cell or its row when data changes satisfy a rule. Direction-aware for numeric/date (Up/Down), Neutral for text/boolean. Highest style precedence.

**State:** `FlashingCell.FlashingCellDefinitions: FlashingCellDefinition[]`

| Property | Type | Default |
|---|---|---|
| `Name` | string | |
| `Scope` | ColumnScope | |
| `Rule` | `{ Predicates? \| BooleanExpression }` — `ANY_CHANGE()` common | |
| `FlashTarget` | `'cell'` \| `'row'` | `'cell'` |
| `FlashDuration` | number (ms) \| `'always'` | 500 |
| `UpChangeStyle` / `DownChangeStyle` / `NeutralChangeStyle` | AdaptableStyle (no `ClassName`) | Green / Red / Gray |
| `IsReadOnly`, `IsSuspended` | boolean | |

**Options** `flashingCellOptions`: `defaultFlashTarget`, `defaultFlashDuration`, `defaultUpChangeStyle`, `defaultDownChangeStyle`, `defaultNeutralChangeStyle`.

**UI:** Settings Panel; 4-step Wizard (Name+Scope → Rule → Duration → styles); Column Menu "Add/Remove Flashing Cell"; Context Menu "Clear Flash".

**FlashingCellAPI:** `addFlashingCellDefinition(s)`, `editFlashingCellDefinition(s)`, `deleteFlashingCellDefinition`, `setFlashingCellDefinitions`, `getFlashingCellDefinitions/ByName/ById`, `getActive…/getSuspended…`, `findFlashingCellDefinitions`, `suspend/unSuspend(All)…`, `showFlashingCell(def)`, `clearAllFlashingCells()`, `isAnyFlashingCellActive()`, `getFlashingCellFlashTarget`, `getFlashingCellPredicateDefsForScope`, `getFlashingCellState()`.

**Event** `FlashingCellDisplayed` → `{ flashingCell: { cellDataChangedInfo, direction: 'up'|'down'|'neutral', flashColumnIds, flashingCellDefinition, flashTarget, rowPrimaryKey }, adaptableContext }`.

---

## 4. Data Entry / Editing

### EditOptions (`editOptions`)

| Property | Type | Default |
|---|---|---|
| `customEditColumnValues` | `(ctx) => { label, value }[] \| Promise` | distinct column values |
| `displayServerValidationMessages` | boolean | true |
| `isCellEditable` | `(ctx: CellEditableContext) => boolean` | — |
| `plusMinusOptions` | `{ incrementKey ('+'), decrementKey ('-') }` | |
| `showSelectCellEditor` | `(ctx: AdaptableColumnContext) => boolean` | none |
| `smartEditOptions` | `{ customOperations: [{ name, operation(ctx) }] }` | |
| `validateOnServer` | `(ctx) => Promise<ServerValidationResult>` | — |

**Event** `CellChanged` → `{ cellDataChange: CellDataChangedInfo, adaptableContext }`. `CellDataChangedInfo`: `changedAt`, `column`, `newValue`, `oldValue`, `preventEdit`, `primaryKeyValue`, `rowData`, `rowNode`, `trigger: 'edit'|'tick'|'undo'|'aggChange'|'calculatedColumnChange'`.

### Smart Edit
One arithmetic operation applied to many selected numeric cells **in a single column**. Operations: Add, Subtract, Multiply (default), Divide, plus custom. Flow: select → operation → value → preview → Apply. Tri-state validation (all valid / some invalid / all invalid). **UI:** Toolbar, Tool Panel, Context-menu popup. **API:** `getSmartEditCustomOperations`, `getSmartEditOperation`, `setSmartEditOperation`, `setCustomSmartEditOperation`, `getSmartEditValue`, `setSmartEditValue`, `openSmartEditSettingsPanel`.

### Bulk Update
Replaces all selected cells of one editable column with the same value (dropdown from distinct values or `customEditColumnValues`). **UI:** Toolbar, Tool Panel, Context-menu popup, Status Bar. **API:** `getBulkUpdateValue()`, `openBulkUpdateSettingsPanel()`.

### Plus Minus (Nudges)
`+`/`-` (or custom keys) in an editable numeric cell increments/decrements by a rule's value. Requires `CellSelectionModule`.
**State:** `PlusMinus.PlusMinusNudges: [{ Name, Scope, NudgeValue, Rule?: { BooleanExpression }, IncrementKey?, DecrementKey?, IsReadOnly?, IsSuspended? }]`. Key modifiers `ctrl+`, `shift+` etc.
**UI:** Settings Panel; Wizard: Name → Scope → NudgeValue → Always/Expression → keys. **API:** `addPlusMinusNudge`, `editPlusMinusNudge`, `deletePlusMinusNudge`, `getPlusMinusNudgeByName`, `getPlusMinusById`, `getAllPlusMinus`, `getAllActivePlusMinus`, `getAllSuspendedPlusMinus`, `runPlusMinusNudge`, `applyPlusMinus`, `suspend/unSuspendPlusMinusNudge`, `getPlusMinusState`, `openPlusMinusSettingsPanel`.

### Shortcuts
While editing a numeric cell, an alphabetic key applies an operation (e.g. `K` × 1000).
**State:** `Shortcut.Shortcuts: [{ Name, Scope, ShortcutKey (a–z), ShortcutOperation: 'Add'|'Subtract'|'Multiply'|'Divide', ShortcutValue, IsReadOnly?, IsSuspended? }]`.
**API:** `addShortcut`, `editShortcut`, `deleteShortcut`, `getShortcuts`, `getActiveShortcuts`, `getSuspendedShortcuts`, `getShortcutById/ByName`, `suspend/unSuspend(All)Shortcut`, `getShortcutState`, `openShortcutSettingsPanel`.

### Edit-state cell styling
`userInterfaceOptions.editableCellStyle`, `readOnlyCellStyle`, `editedCellStyle` (AdaptableStyle each). `editedCellStyle` requires Data Change History active.

### Custom edit column values
`editOptions.customEditColumnValues(ctx: { currentSearchValue, defaultValues, gridCell, adaptableContext })` → `{ label, value }[]`. Used by Select Editor and Bulk Update.

---

## 5. Data Validation

1. **Pre-edit** — `editOptions.isCellEditable(ctx: { defaultColDefEditableValue, gridCell, adaptableContext })`.
2. **Client (post-edit)** — Alert Definition with `AlertProperties.PreventEdit: true`; edit rolled back on breach.
3. **Server (post-edit)** — `editOptions.validateOnServer(ctx: { cellDataChangedInfo }) => Promise<{ newCellValue?, validationMessage?, validationHeader?, messageType? }>`. `{}` accept; `{ newCellValue: oldValue }` revert; other value substitutes.

---

## 6. Data Change History

Tracks every cell change during a session in a **Data Changes Monitor** grid, with undo. Modes: Off / Active / Suspended / Inactive. Configured via options only.

**`dataChangeHistoryOptions`:** `activeByDefault` (false), `showDataChange(info) => boolean`, `showLastDataChangeOnly` (true), `maxDataChangesInStore`, `changeHistoryButton: { action?: 'undo'|'clear', label, onClick?, buttonStyle }` (adds an Action Column).

**UI:** Dashboard toolbar, Tool Panel, Status Bar, Settings Panel — Suspend/Resume, Activate/Deactivate, Show.

**API:** `activateDataChangeHistory(forceReset)`, `suspendDataChangeHistory`, `deactivateDataChangeHistory`, `getDataChangeHistoryMode()`, `getDataChangeHistoryLog()`, `getDataChangeForGridCell`, `addDataChangeHistoryEntry`, `clearDataChangeHistoryEntry`, `undoDataChangeHistoryEntry`, `undoAllDataChangeHistoryEntries`, `openDataChangeHistorySettingsPanel`.

---

## 7. Cell Editors

| Editor | Columns | Enabled | Also used for filters |
|---|---|---|---|
| Select | any | `editOptions.showSelectCellEditor` | no |
| Numeric | number | default | yes |
| Date Picker | date | default | yes |
| Percentage | number | explicit `cellEditor: AdaptablePercentageEditor` | no |

- **Select** — wraps AG Grid Rich Select; distinct values or `customEditColumnValues`.
- **Numeric** — spinner, honours Shortcuts; `cellEditorParams: { showClearButton, emptyValue }`.
- **Percentage** — Excel-style (0.1234 ↔ 12.34%); pair with `NumberFormatter { FractionDigits: 2, Suffix: '%', Multiplier: 100 }`.
- **Date Picker** — `userInterfaceOptions.dateInputOptions`: `dateFormat` ('yyyy-MM-dd'), `datepickerButtons` (`['close','today']`, also `'yesterday'`, `'nextWorkday'`), `locale`, `showOutsideDays`, `showWeekNumber`, `useNativeInput`. CSS vars `--ab-cmp-datepicker__*`.

---

## 8. Notes

Personal single-cell annotations stored in **AdapTable State**. Unavailable with auto-generated Primary Keys.

**State:** `Note.Notes: [{ PrimaryKeyValue, ColumnId, Text, Timestamp?, IsReadOnly? }]`.
**`noteOptions`:** `isCellNotable(ctx)`, `showNoteAction: 'hover'|'menu'`, `dateFormat`, `showPopupCloseButton`.
**UI:** Context Menu "Add Note"; Settings Panel Notes page; triangle indicator (`--ab-CellNote-triangle-color`).
**API:** `addNote(text, pk, columnId)`, `editNote`, `updateNoteText`, `deleteNote`, `getAllNotes`, `getNoteByUuid`, `getNoteForCell`, `getNoteState`.

---

## 9. Comments

Collaborative threaded cell annotations, **not** stored in AdapTable State — persistence developer-provided. Requires `entitlementOptions.moduleEntitlements: [{ adaptableModule: 'Comment', accessLevel: 'Full' }]`, `loadCommentThreads`, `persistCommentThreads`.

**`commentOptions`:** `loadCommentThreads(ctx)`, `persistCommentThreads(threads)`, `isCellCommentable(ctx)`, `dateFormat`, `showCommentAction`, `showPopupCloseButton`.
**UI:** Context Menu "Add/Show Comment"; Settings Panel Comment page; blue triangle (`--ab-CellComment-triangle-color`).
**API:** `addCommentThread`, `addComment`, `editComment`, `deleteComment`, `deleteCommentThread`, `getCommentThreadForCell`, `getAllComments`, `setComments`, `clearComments`, `hideCommentsPopup`.
**Event** `CommentChanged` → `{ commentThreads, adaptableContext }`.

---

## 10. Free Text Columns

User-owned editable columns whose values live in **AdapTable State**. Created at runtime; added to end of current Layout. Requires stable Primary Key; cannot be suspended.

**State:** `FreeTextColumn.FreeTextColumns: [{ ColumnId, FriendlyName?, DefaultValue?, FreeTextStoredValues?: [{ PrimaryKey, FreeText }], TextEditor?: 'Inline'|'Large', IsReadOnly?, FreeTextColumnSettings: { DataType: 'text'|'number'|'boolean'|'date', Aggregatable?, Filterable?, Groupable?, Pivotable?, Resizable?, Sortable?, SuppressMenu?, SuppressMovable?, ColumnTypes?, HeaderToolTip?, Width? } }]`.

**UI:** Settings Panel → Layout section → Free Text Column; Column Menu "Edit Free Text Column". **Wizard (6 steps):** Column Id → Name → DataType → Default Value → Column Properties → Finish.

**API:** `addFreeTextColumn`, `editFreeTextColumn`, `deleteFreeTextColumn`, `getFreeTextColumns`, `getFreeTextColumnById`, `getFreeTextColumnForColumnId`, `getFreeTextColumnValueForRowNode`, `setStoredValue`, `setStoredValues(columnId, values, 'All'|'Conflicting'|'None')`, `getFreeTextColumnState`, `openFreeTextColumnSettingsPanel`.

---

## Noted inconsistencies across pages
- Flashing style names: `UpStyle` (overview) vs `UpChangeStyle` (tech ref) — tech ref authoritative.
- Smart Edit custom-ops key: `smartEditOptions.smartEditCustomOperations` vs `smartEditOptions.customOperations`.
- `RowScope` fourth flag: `ExcludeTotalRows` vs `ExcludeGrandTotalRows`.
- FreeText column settings defaults differ between overview (true) and tech ref (false).
