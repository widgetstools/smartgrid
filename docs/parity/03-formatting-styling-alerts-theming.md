# Parity audit — Format Columns, Styled Columns, Flashing, Calculated Columns, Alerts, Notifications & Theming

stern-bak (`widgetstools/stern-bak` @ `5a248ad`) versus AdapTable for AG Grid v23. Every status was verified against source. Paths are relative to the stern-bak repo root.

Key files: `core/engine/src/customizer/modules/conditional-styling/{state,transforms,styleBridge,indicatorIcons}.ts`, `column-customization/{state,transforms,formattingActions}.ts`, `calculated-columns/{state,virtualColumn}.ts`, `alerts/{state,evaluator,dispatch}.ts`, `core/engine/src/colDef/{types,adapters/*,fieldFormatCatalog/*}.ts`, `core/engine/src/expression/functions.ts`, `react-grid/grid/src/customizer/ui/FormatterPicker/{presetsForDataType,formatCategories}.ts`, `design-system/design-system/src/{cellRenderers,cellRendererRegistry,applyTheme}.ts`, `adapters/agGrid.ts`.

---

## 1. Format Columns / Conditional Styling

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Fore colour | `ForeColor` | **Full** | `types/common.ts` `CellStyleProperties.color`; `conditional-styling/transforms.ts:395 styleToCSS` | — |
| Back colour | `BackColor` | **Full** | same | `backgroundAlpha` exists but is hard-coded to 100 on read |
| Border colour | single `BorderColor` | **Different (richer)** | `colDef/types.ts BorderSpec`; `transforms.ts:419 borderOverlayCSS` | Per-side width/style/colour on a `::after` overlay |
| Bold / Italic | Yes | **Full** | `styleBridge.ts:93-94` | Weights 400/500/600/700 |
| Font size | named scale | **Different** | `styleBridge.ts:101` px integers | — |
| Alignment | Yes | **Full** | `styleBridge.ts:100` (incl. justify) | — |
| Text decoration | Yes | **Full** | `styleBridge.ts:95-99` | underline / line-through only |
| Border radius | Yes | **Missing** | no `borderRadius` in any style model | — |
| CSS class name | `ClassName` + `styleClassNames` | **Missing** | no field on `ConditionalRule.style` | User cannot reference an app CSS class |
| NumberFormatter: FractionDigits / IntegerDigits | Yes | **Different** | Excel format strings (`presetsForDataType.ts:43-48`), `{decimals}` preset option | — |
| Multiplier | Yes | **Missing** | percent preset only (implicit ×100) | Only via `kind:'expression'`, CSP-blocked in strict mode |
| Separators | Yes | **Partial** | `thousands` boolean | No custom separator chars |
| Prefix / Suffix | Yes | **Full** | Excel literals | — |
| ZeroDisplay | Yes | **Different** | Excel 3rd section supported by SSF | Not surfaced as an option |
| Notation (scientific) | Yes | **Full** | `num-scientific` `0.00E+00` | — |
| Parentheses | Yes | **Full** | `num-neg-parens`, `cur-usd-parens` | — |
| Abs | Yes | **Full** | "no sign" preset family | — |
| Ceiling / Floor / Round / Truncate | Yes | **Missing** | display layer has no rounding-mode option | — |
| Empty (blank for null) | Yes | **Full** | every preset returns `''` for null | Hard-coded |
| Content (replace value) | Yes | **Different** | Excel conditional sections `[=1]"🔄";[=2]"✅"` | — |
| 15 numeric presets | Dollar…BasisPoints | **Partial** | Integer, 2dp/4dp, Scientific, Percent, Basis points, USD, EUR, GBP, JPY, INR | **Missing: Bitcoin, K, M, B, Accounting, FXRate** (K/M exist only in auto-format catalogue). Extras: 5 tick presets, "Negatives & P&L", "Conditional" |
| StringFormatter: Case | Upper/Lower/Sentence | **Full** | UPPERCASE, lowercase, Title Case, camelCase, Capitalize | Superset |
| StringFormatter: Trim | Yes | **Full** | `str-trim` | — |
| StringFormatter: Prefix/Suffix/Content/Empty | Yes | **Partial** | fixed demo presets | Not parameterised except via Custom Excel tab |
| DateFormatter | TR35 pattern | **Different** | Excel date tokens + Intl presets (`valueFormatterFromTemplate.ts:88-108`) | Intl presets pinned to UTC |
| Template format `[value] [column] [rowData.x]` | Yes | **Different** | `kind:'expression'` compiled via `new Function('x','data')` | JS not template; **disabled under strict CSP**; no `[column]` |
| Custom display formatters | `customDisplayFormatters` | **Missing** | union closed at `preset\|expression\|excelFormat\|tick` (`colDef/types.ts:89`) | — |
| Conditions via predicates (AND-ed) | Yes | **Different** | `ConditionalRule.expression` free-form only (`state.ts:175`); `tryCompileToAgString` optimisation | No predicate library or AND-composition UI |
| Referenced column in condition | `Predicate.ColumnId` | **Full** | expression reads whole row; `extractTriggerColumns` (`transforms.ts:636`) re-paints when a referenced column ticks | Designed for it |
| Conditions via expression | Yes | **Full** | `editor/ExpressionBand.tsx` | — |
| Scope: All | Yes | **Missing** | `RuleScope = {type:'cell'; columns[]} \| {type:'row'}` (`state.ts:25`) | Must enumerate columns |
| Scope: DataTypes | Yes | **Missing** | same | — |
| Scope: ColumnIds | Yes | **Full** | `scope.columns` (`transforms.ts:882`) | — |
| Scope: ColumnTypes | Yes | **Missing** | same | — |
| Row scope (exclude data/group/summary/total) | Yes | **Missing** | `buildRowClassPredicate` (`transforms.ts:792`) has no node-kind test | Group rows skipped only because they lack `data` |
| Column-group scope | Yes | **Missing** | recurses children but no expanded/collapsed condition | — |
| Header target styling | `Target:'columnHeader'` | **Partial** | conditional: only flash + indicator badge reach headers (`runtime/headerPainter.ts`); static `headerStyleOverrides` | No conditional header colour/font/format |
| Precedence ordering | array order, earlier wins, ± buttons | **Different** | numeric `priority` (`state.ts:172`); CSS cascade so **later/higher wins** (inverse) | No up/down buttons |
| Style merging | styles merge, formats don't | **Different** | CSS cascade; formatters "highest priority wins" (`transforms.ts:898-925`) | Merge direction inverted |
| Suspend | `IsSuspended` | **Full** | `ConditionalRule.enabled`; UI toggle | No `IsReadOnly` |
| Per-theme (dark/light) styles | not in AdapTable | **Extra** | `ThemeAwareStyle {light, dark}`; `buildCssText` emits both blocks | stern-bak advantage |
| Auto format catalogue | not in AdapTable | **Extra** | `fieldFormatCatalog.ts` (317 lines), `matchFieldToCatalog.ts`, `buildAutoFormatPlan.ts` | Native formatters only, user-overridable |
| Other extras | — | **Extra** | indicator badge (6 anchors), value-glyph animation (spin/pulse), timed style window `activeDurationMs`, `[col.old]`/`[col.new]` diff refs, tick (32nds…256ths) formatters, Visual Excel export of styles | — |

## 2. Styled Columns → stern-bak cell renderers

Registry: `design-system/src/cellRendererRegistry.ts` (24 ids: 11 configurable + 13 zero-config), implementations in `cellRenderers.ts`, vanilla `ICellRendererComp` with `ThemeAwareColor` slots.

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Gradient — multi-band CellRanges | Yes | **Partial** | `HeatmapRendererConfig.colorScale {min, mid?, max}`; `lerpHex` | 2–3 stops only |
| Gradient — zero-centred | Yes | **Different** | `domain:{min:-x,max:x}` + mid colour | Midpoint at t=0.5, not value 0 |
| Gradient — column comparison | Yes | **Missing** | `domain` is numeric only | — |
| Gradient — Min/Max alpha | Yes | **Missing** | — | — |
| Gradient — dynamic `Col-Min/Max/Avg/Median` | Yes | **Missing** | `cellRenderers.ts:479-481` defaults `[0,100]`; registry comment promises `aggValueDomain` but **no implementation exists** | Stale doc comment |
| Gradient — auto-contrast text | Yes | **Missing** | static `textColor` only | — |
| Percent Bar — bar | Yes | **Full** | `PercentBarCellRenderer`; `max` literal or `{fromField}` | `fromField` is an extra |
| Percent Bar — Origin | Yes | **Missing** | always zero-origin, negatives clamp to 0 | — |
| Percent Bar — colour ranges | Yes | **Missing** | single `barColor` | — |
| Percent Bar — text placement | Yes | **Partial** | `showPercent`/`showValue`, centred | No layout options; not both |
| Badge — multi rules, first match | Yes | **Full** | `PillRendererConfig.rules[]` + `fallback` | — |
| Badge — per-badge Predicate/Expression | Yes | **Missing** | `rules[].value: string` **exact match only** | Biggest badge gap |
| Badge — shapes | Pill/Rounded/Square | **Partial** | `'pill' \| 'square'` | — |
| Badge — icons | Yes | **Missing** | — | — |
| Badge — density/spacing/font/overflow | Yes | **Missing** | — | — |
| Badge — array columns | Yes | **Missing** | one badge per cell | — |
| Sparkline | AG Grid Sparklines | **Different** | hand-drawn inline SVG; `line\|area\|bar` | Zero chart dependency; missing `column`, axes/markers/tooltips, tuple/object inputs |
| Bullet Chart | Yes | **Missing** | — | — |
| Rating (star) | Yes | **Missing** | `RatingDelta`/`RatingBadge` are **credit-rating** widgets, not stars | Name collision |
| Range Bar | Yes | **Missing** | — | — |
| Icon — Flags preset | Yes | **Full** | `CountryFlagCellRenderer` | — |
| Icon — Currencies preset | Yes | **Full** | same (ISO-4217 → flag) | — |
| Icon — Trend preset | Yes | **Different** | `TrendArrowCellRenderer` (numeric arrow + delta + dead-band) | — |
| Icon — Status preset | Yes | **Different** | zero-config `StatusBadge`/`RfqStatus` | Hard-coded sets |
| Icon — Mappings / MatchMode / Fallback / text position | Yes | **Missing** | `IconTextRendererConfig` is a single icon | — |
| One styled column per column | Yes | **Full** | `ColumnAssignment.cellRendererId` + config | Band 10 |
| Renderer RowScope | Yes | **Missing** | — | — |
| Suspend a styled column | Yes | **Missing** | — | — |
| ToolTipText | Yes | **Missing** | — | — |

**stern-bak renderers with no AdapTable equivalent:** `TrendArrow`, `MultiLine` (value + sibling secondary line), `RatingDelta` (credit rating ± vs previous), `TimeSince` (self-refreshing), `AllocationBar` (stacked bar + legend), plus zero-config `Side`, `Oas`, `Pnl`, `Signed`, `Change`, `Ytd`, `ColoredValue`, `FilledAmount`, `Ticker`, `BookName`.

## 3. Flashing

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Cell flash on change | Yes | **Different** | `FlashConfig.target:'cells'`; CSS keyframes `ds-flash-<ruleId>` (`transforms.ts:508-522`), explicitly not `api.flashCells()` | GPU-driven, zero per-cell JS |
| Row flash | Yes | **Full** | `target:'row'` | — |
| Header flash | not in AdapTable | **Extra** | `target:'headers'`/`'cells+headers'`; `headerPainter.ts` | — |
| Up / Down / Neutral styles | automatic | **Different** | no direction concept; author two rules with `[price.new] > [price.old]` diff refs; `FLASH_PALETTE` | Twice the authoring; no auto direction; no Neutral |
| Duration | 500 ms | **Full** | `durationMs` default 700 | — |
| `'always'` | Yes | **Different** | `FlashMode:'pulse'` infinite | — |
| Rule `ANY_CHANGE()` | Yes | **Different** | `[col.old] != [col.new]`; `extractTriggerColumns` | No function |
| Rule predicates | Yes | **Missing** | expression only | — |
| Rule expression | Yes | **Full** | — | — |
| Scope | ColumnScope | **Partial** | `RuleScope` | Same gaps as §1 |
| Option defaults | `flashingCellOptions` | **Missing** | module constants (`transforms.ts:318-320`) | Not host-configurable |
| Clear flash | Yes | **Missing** | — | — |
| `FlashingCellDisplayed` event | Yes | **Missing** | not in event catalogue | — |
| AG Grid native cell-change flash config | not exposed by AdapTable | **Extra** | `gridOptionsSchema.tsx:330,36-37,338`; `cellChangeFlashCss.ts` scoped per `[data-grid-id]` | Global, single colour |
| Two flashing rules on one cell | highest precedence wins | **Full** | per-rule keyframe + scoped colour var | Deliberate |

## 4. Calculated Columns

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Standard per-row expression | Yes | **Full** | `VirtualColumnDef.expression`; `buildVirtualColDef` parses once (`virtualColumn.ts:96-161`) | — |
| Aggregated `SUM/AVG/MIN/MAX/COUNT` | Yes | **Partial** | `SUM AVG MIN MAX MEDIAN STDEV VARIANCE COUNT DISTINCT_COUNT`; per-GridApi snapshot cache (`virtualColumn.ts:46-89`) | Whole-grid only |
| `GROUP_BY` | Yes | **Missing** | — | — |
| `PERCENTAGE`, `AVG(…WEIGHT…)` | Yes | **Missing** | — | — |
| Cumulative `CUMUL/OVER` | Yes | **Missing** | — | — |
| Quantile `QUANT` | Yes | **Missing** | — | — |
| Referencing other calculated columns | unlimited | **Missing** | `virtualColumn.ts:141` evaluates against raw `params.data` which never contains other virtual columns | A calc column cannot read another |
| Chained change events | `calculatedColumnChange` | **Missing** | — | — |
| DataType | mandatory | **Full** | 7 values incl. `currency`/`percent` | Superset |
| Width | Yes | **Full** | `initialWidth` | — |
| Filterable / Sortable | default false | **Different** | hard-coded `true` (`virtualColumn.ts:119-120`) | — |
| Groupable / Pivotable / Aggregatable | Yes | **Missing** | no `enableRowGroup`/`enablePivot`/`enableValue` | — |
| Resizable / SuppressMenu / SuppressMovable / ColumnTypes | Yes | **Missing** | — | — |
| HeaderToolTip | Yes | **Different** | via layered `ColumnAssignment.headerTooltip` | — |
| ShowToolTip (expression as tooltip) | Yes | **Missing** | no `tooltipValueGetter` | — |
| Read-only cells | Yes | **Full** | `editable: false` | — |
| Group-row aggregates | Yes | **Partial** | `valueGetter` reads `node.aggData[colId]` | Not declared groupable |
| Value formatter | via Format Column | **Full** | `valueFormatterTemplate`; Excel colour tags → `cellStyle` | — |
| Definition-only persistence | Yes | **Full** | — | — |
| Position / hide / pin | Yes | **Full** | — | — |
| `CalculatedColumnChanged` event | Yes | **Missing** | — | — |
| Robustness | — | **Extra** | parse errors → all-null column; runtime errors swallowed | — |

## 5. Alerts

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Data Change kind | predicates or expression | **Partial** | `{kind:'dataChange'; expression; column?}` (`alerts/state.ts:41-46`) | Expression only; single column not ColumnScope |
| Relative Change kind | Yes | **Full** | `{kind:'relativeChange'; column; mode; threshold?; direction?}`; `computeRelativeChange` | **Superset**: `direction: up\|down\|both` |
| Row Change kind | with `WHERE` | **Partial** | `{kind:'rowChange'; event}`; `detectRowChanges` | **No `WHERE`** |
| Aggregation kind | Yes | **Missing** | `KNOWN_TRIGGER_KINDS` closed at 3 (`state.ts:154`) | — |
| Observable kind | Yes | **Missing** | same | — |
| Scheduled kind | Yes | **Missing** | same | — |
| Validation kind (`PreventEdit`) | Yes | **Missing** | evaluation is post-commit on `cellValueChanged` | separate `editing-core/validation.ts` not wired |
| Message types | 4 | **Full** | `info\|success\|warning\|critical` | — |
| Header + text | separate | **Partial** | single `message` | — |
| Template literals | 9 tokens | **Partial** | `{value} {prev} {rowId} {column} {rule}` (`evaluator.ts:183-200`) | Missing `[rowData.x]`, `[timestamp]`, `[trigger]`, `[numberOfRows]`, `[context.x]` |
| Auto-generated message | Yes | **Different** | defaults to rule name | — |
| Host message callbacks | Yes | **Missing** | — | — |
| Toast | Yes | **Full** | `channels:['toast']`; `useAlertsToastBridge.ts` | — |
| System status message | Yes | **Missing** | no module | — |
| Log to console | Yes | **Missing** | — | — |
| Highlight cell / row | Yes | **Missing** | `dispatch.ts:110-128` only appends to history | — |
| Jump to cell / row / column | Yes | **Missing** | — | — |
| Show in div | Yes | **Missing** | — | — |
| Prevent edit | Yes | **Missing** | — | — |
| Notification duration | Yes | **Missing** | `use-toast.tsx:6` `TOAST_REMOVE_DELAY = 1000000` | Effectively sticky |
| OpenFin notifications | Yes | **Full** | `channels:['openfin']`; `useAlertsOpenFinBridge.ts` dynamic import | — |
| Command buttons | Yes | **Missing** | — | — |
| Alert forms | Yes | **Missing** | — | — |
| Toolbar / tool panel / status bar count | 3 surfaces | **Partial** | `AlertsBadge.tsx` bell + count + history popover | One surface |
| Suspend / resume | Yes | **Partial** | `AlertRule.enabled`; global `settings.enabled`, `evaluationMode:'paused'` | No bulk suspend preserving flags |
| Max alerts in store | 20 | **Full** | `historyLimit` 500 | — |
| `AlertFired` event | Yes | **Missing** | not in catalogue | — |
| Detection policy raw vs formatted | Yes | **Missing** | raw only | — |
| History not persisted | Yes | **Full** | `deserializeAlertsState` → `history: []` | — |
| Rate limiting / debounce | not in AdapTable | **Extra** | per-(rule,row) debounce + global token bucket (`dispatch.ts:72-97`) | — |
| Evaluation modes | not in AdapTable | **Extra** | `realtime\|throttled\|paused` | — |

## 6. System Status Messages & Toasts

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| System Status module | Yes | **Missing** | grep only hits AG Grid status bar in config-browser | Nearest: `StaleDataBanner`, alerts history |
| `systemStatusApi` | Yes | **Missing** | — | — |
| `SystemStatusMessageDisplayed` | Yes | **Missing** | — | — |
| Toast position | 6 positions | **Missing** | fixed `<ToastViewport>` | sonner supports it; nothing passes it |
| Toast duration | 3000 / always | **Missing** | hard-coded near-infinite | — |
| Toast transition | 4 | **Missing** | Radix default | — |
| Max notifications | 3 | **Different** | `TOAST_LIMIT = 1` | Stricter, non-configurable |
| Progress bar | Yes | **Missing** | — | — |
| Click/hover/drag options | Yes | **Partial** | Radix defaults, non-configurable | — |
| Application icon | Yes | **Missing** | — | — |
| Theme-aware | Yes | **Full** | `sonner.tsx` `useTheme()` | — |

## 7. Theming

| Feature | AdapTable | stern-bak status | Evidence | Gap notes |
|---|---|---|---|---|
| Light / dark | Yes | **Full** | `applyTheme.ts:60-64`; `fi-dark.css`, `fi-light.css` | — |
| `os` (follow OS) | Yes | **Partial** | `host-browser/src/BrowserRuntime.ts:145,172` reads and subscribes to `prefers-color-scheme` as a **fallback**; `Mode = 'dark' \| 'light'` only | User cannot pin "follow OS" |
| Light variant | not in AdapTable | **Extra** | `clinical \| paper` | — |
| CVD mode | not in AdapTable | **Extra** | `data-cvd="on"`; CVD-safe palettes | Accessibility advantage |
| Root contract | `:root.ab--theme-*` | **Different** | `[data-theme]` + `.dark` both matched | — |
| CSS variable contract | `--ab-*` | **Different** | OKLCH `starui-tokens.css`; compat bridge `--ds-*`, `--bn-*`, `--p-*` | Alpha composition possible with OKLCH |
| Palette / swatches for picker | 12 + 20 | **Partial** | `FLASH_PALETTE` 8; `ColorPicker` | No formal token contract |
| AG Grid theme coordination | 4 themes + `AgThemeMode` | **Partial** | `adapters/agGrid.ts` Quartz `withParams`; `data-ag-theme-mode` | Quartz only |
| Runtime switch UI | 4 surfaces | **Partial** | `PrimaryToolbarOverflowMenu.tsx` `ThemeToggleMenuItem`; `HostWrapper.tsx` | One item |
| Persistence | Yes | **Full** | `starui:theme`, `starui:cvd`, `starui:variant` + legacy migration | — |
| Cross-window sync | none | **Extra** | `OpenFinRuntime.ts:292` | — |
| Density presets | none | **Extra** | `GridDensity = ultra\|compact\|comfort`; structural params; `WeakMap` cache | — |
| `ThemeSelected` event | Yes | **Different** | `runtime.onThemeChanged(cb)` | — |
| Themed scrollbars with AG Grid exemption | none | **Extra** | `styles/scrollbar.css` | — |

---

## Summary

| Status | Count (127 rows) | % |
|---|---|---|
| Full | 46 | 36% |
| Partial | 22 | 17% |
| Different | 21 | 17% |
| Missing | 37 | 29% |
| N/A | 1 | 1% |

| Area | Full | Partial | Different | Missing |
|---|---|---|---|---|
| Format Columns / Conditional Styling (34) | 13 | 3 | 9 | 9 |
| Styled Columns (23) | 5 | 4 | 3 | 11 |
| Flashing (14) | 5 | 1 | 4 | 4 |
| Calculated Columns (22) | 7 | 2 | 3 | 10 |
| Alerts (28) | 6 | 5 | 2 | 15 |
| System Status / Toasts (13) | 1 | 2 | 1 | 9 |
| Theming (16) | 9 | 5 | 3 | 0 |

Two claim corrections: `cellRendererRegistry.ts:92` documents an `aggValueDomain` heatmap param that does not exist, so heatmaps silently fall back to `[0,100]`; and `RatingBadgeRenderer`/`RatingDeltaCellRenderer` are credit-rating widgets, not the star-Rating styled column.

### Top 5 gaps

1. **Alert behaviours beyond notification are absent.** Highlight, jump, prevent-edit, show-in-div, command buttons and forms all return zero hits. An AdapTable alert can *act on the grid*; a stern-bak alert can only tell you about it. Validation Alerts have no substitute because evaluation is post-commit.
2. **Four of seven alert kinds don't exist**: no Aggregation, Observable, Scheduled, or Validation; Row Change lacks `WHERE`.
3. **Calculated columns cannot reference each other, and have no grouped/cumulative/quantile aggregation.** No `GROUP_BY`, `CUMUL`/`OVER`, `QUANT`, `PERCENTAGE`, weighted `AVG`.
4. **Styled Columns: five of eight missing, and Badge conditions are exact-string-only.** No Bullet, Rating, Range Bar; Gradient lacks dynamic endpoints; Percent Bar lacks Origin; Icon lacks a mapping table.
5. **Scope is column-ids-only**, with no `All`/`DataTypes`/`ColumnTypes`, no row scope, no conditional header styling, no border radius, no CSS class hook.
