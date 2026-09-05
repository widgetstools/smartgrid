# AdapTable for AG Grid — UI Components, Theming & UI Guides

Source: https://www.adaptabletools.com/docs (58 pages in the AdapTable UI section, v23+). This section matters most for SmartGrid because it is the surface we intend to replace with a much leaner, AI-first design.

---

## 1. UI Architecture Overview

AdapTable ships **six grid-integrated UI components**, two expression-authoring components, a wizard system, and three standalone windows.

| Surface | Where | Role |
|---|---|---|
| Settings Panel | Modal/window popup | Central hub for managing all Adaptable Objects & module config |
| Dashboard | Above grid (docked), floating overlay, collapsed, or hidden | Tabs, toolbars, buttons, Quick Search |
| Tool Panel | AG Grid sidebar (`AdaptableToolPanel`) | Alternative to Dashboard; module panels + buttons + custom panels |
| Status Bar | AG Grid status bar (`AdaptableStatusPanel`) | Module status panels, left/center/right |
| Column Menu | AG Grid column header menu | AG Grid + AdapTable + custom items |
| Context Menu | AG Grid right-click menu | AG Grid + AdapTable + custom items |
| Expression Editor | Inside wizards/panels | AdapTableQL authoring |
| Query Builder | Grid Filter only (currently) | Dropdown-driven boolean expression builder |
| Wizards | Popup (modal/window) | Step-by-step object creation/editing |
| Loading Screen, Custom Popup Window, Progress Indicator | Standalone | Programmatic windows |

**Foundation stack:**
- Layer 1: **Base UI** headless primitives (roles, focus management, keyboard nav)
- Layer 2: **shadcn/ui** assembly conventions
- Layer 3: **Tailwind CSS** utilities + CSS variables. All utilities prefixed **`twa:`**; all styles in a CSS layer named **`adaptable`** (recommended order `@layer reset, adaptable, app, theme`). Consumers should use `--ab-*` variables, not `twa:` classes.
- Every surface takes custom content via `render(context: CustomRenderContext)` (vanilla, returns HTML string) or `frameworkComponent: AdaptableFrameworkComponent` (React/Angular/Vue).
- All surfaces are gated by **Entitlements** (`Full | ReadOnly | Hidden` per module).

**Common `CustomRenderContext`:**
```ts
{ phase: 'onMount' | 'onDestroy'; element: HTMLDivElement; adaptableApi: AdaptableApi; adaptableContext?: any }
```

---

## 2. Settings Panel

### Purpose & placement
Central hub for AdapTable + all Adaptable Objects. Opens as **modal** or **window** (draggable, resizable). Left sidebar navigation grouped into sections; one section per module. Launch points: Dashboard module button (the only default Dashboard button is `SettingsPanel`), Tool Panel button, Status Bar, Column Menu, Context Menu.

### Section types
1. **Collection sections** — list Adaptable Objects with New/Edit/Clone/Delete/Share per entitlement; suspended objects shown inactive.
2. **Configuration sections** — form inputs (Quick Search, State Management, Dashboard, ToolPanel, StatusBar, Theme, GridInfo, ColumnInfo).
Each section has an "Info" button linking to docs (`userInterfaceOptions.showDocumentationLinks: false` to disable).

### Default navigation groups (v23)
- **Grid & UI:** GridInfo, ColumnInfo, Dashboard, ToolPanel, StatusBar, Theme
- **Layout:** Layout, CalculatedColumn, FreeTextColumn, CustomSort, Charting
- **Formatting:** FormatColumn, StyledColumn, FlashingCell
- **Filtering & Search:** QuickSearch, GridFilter, ColumnFilter, DataSet, NamedQuery
- **Notes & Annotations:** Alert, Note, Comment, SystemStatus
- **Export & Import:** Export, DataImport
- **Editing:** PlusMinus, Shortcut, DataChangeHistory
- **Administration:** TeamSharing, StateManagement

### `settingsPanelOptions`
| Property | Type | Default |
|---|---|---|
| `popupType` | `'modal' \| 'window'` | `'modal'` |
| `position` | `{x,y}` (window only) | screen center |
| `size` | `{width,height}` (window only) | computed |
| `title` | `string` | `'Settings Panel'` |
| `icon` | `'ConfigurationIcon' \| 'ApplicationIcon' \| AdaptableIcon` | `'ConfigurationIcon'` |
| `showModuleIcons` | `boolean` | `true` |
| `alwaysShowInDashboard` / `alwaysShowInToolPanel` | `boolean` | `false` |
| `gridInfoTabs` | `GridInfoTabs` | `['Grid Options','Grid Summary','Grid State']` |
| `navigation` | `(context, defaultNavigation) => { groups: { label, items: string[] }[] }` | default groups |
| `customSettingsPanels` | `CustomSettingsPanel[]` | — |

### Custom Settings Panels
```ts
interface CustomSettingsPanel { name: string; icon?: AdaptableIcon; render?: (ctx) => string | null; frameworkComponent?: AdaptableFrameworkComponent }
```

### API
`openSettingsPanel(moduleName?)`, `openCustomSettingsPanel(name)`, `closeSettingsPanel()`, plus per-module `xxxApi.openXxxSettingsPanel()`.

---

## 3. Dashboard

### Layout
**Header** (application icon + title, Quick Search input, Module/Custom buttons), **Tab strip**, **Toolbar area** (toolbars of active tab), plus **Pinned Toolbars** rendered above grid outside tabs. No default tab is created if none provided.

### Modes
| Mode | State flag | Behavior |
|---|---|---|
| Default (docked) | all false | Full header + tabs + toolbars |
| Collapsed | `IsCollapsed` | Header only; click tab name to reveal |
| Floating | `IsFloating` (+ `FloatingPosition`) | Narrow draggable header overlays grid; double-click title toggles; `dashboardOptions.canFloat: false` disables |
| Hidden | `IsHidden` | Not rendered; re-showable via menus/Tool Panel/Settings Panel |

### `dashboardOptions`
| Property | Type | Default |
|---|---|---|
| `showQuickSearchInHeader` | `boolean` | `true` |
| `buttonsLocation` | `'left' \| 'right'` | `'right'` |
| `canFloat` | `boolean` | `true` |
| `customDashboardButtons` | `AdaptableButton<DashboardButtonContext>[]` | `[]` |
| `customToolbars` | `CustomToolbar[]` | `[]` |

### `initialState.Dashboard` (`DashboardState`)
| Property | Type | Default |
|---|---|---|
| `Tabs` | `{ Name: string; Toolbars: string[] }[]` | `[]` |
| `PinnedToolbars` | `string[]` | — |
| `ModuleButtons` | module name strings | `['SettingsPanel']` |
| `ActiveTabIndex` | `number` | `0` |
| `DashboardTitle` | `string` | `adaptableId` |
| `IsCollapsed` / `IsFloating` / `IsHidden` | `boolean` | `false` |
| `FloatingPosition` | `{x,y}` | — |

Rules: each toolbar in only one tab; users can create/edit/delete tabs, drag toolbars between tabs, pin, reorder buttons; custom buttons/toolbars cannot be created or hidden at runtime.

### Module Toolbars (15 + plugins)
Alert, BulkUpdate, CellSummary, DataChangeHistory, Charting, DataSet, Export, ColumnFilter, GridFilter, Layout, QuickSearch, SmartEdit, StateManagement, SystemStatus, Theme (+ OpenFin, ipushpull). Each has module controls, name label, **Configure** button, **Close** button.

### Custom Toolbars
```ts
interface CustomToolbar {
  name: string; title: string;
  toolbarButtons?: AdaptableButton<CustomToolbarButtonContext>[];
  toolbarForm?: AdaptableForm<CustomToolbarFormContext>;
  onToolbarFormChange?: (formData, ctx) => void;
  render?: (ctx: CustomRenderContext) => string | null;
  frameworkComponent?: AdaptableFrameworkComponent;
  toolbarActions?: ToolbarActions;
}
```

### Dashboard Buttons
Module Buttons (one per module; open the module's Settings Panel section) and Custom Buttons (`AdaptableButton<DashboardButtonContext>` with `ctx.dashboardState`).

### Dashboard API
`collapseDashboard`, `expandDashboard`, `floatDashboard`, `dockDashboard`, `hideDashboard`, `showDashboard`; `isDashboardCollapsed/Expanded/Floating/Docked/Hidden/Visible`, `isToolbarVisible`; `getDashboardState`, `getActiveTab`, `getActiveTabIndex`, `getTabs`, `getTabByName`, `getCurrentToolbars`, `getPinnedToolbars`, `getCustomToolbars`, `getCustomToolbarByName`, `getCustomDashboardButtons`, `getCustomDashboardButtonByLabel`, `getModuleButtons`; `setActiveTab`, `setActiveTabIndex`, `setTabs`, `setPinnedToolbars`, `setDashboardTitle`, `setModuleButtons`; `getCustomToolbarHTMLElement`, `setCustomToolbarHTMLContent`, `resetCustomToolbarFormData`; `refreshDashboard`, `openDashboardSettingsPanel`.

### Events
`DashboardChanged` → `{ actionName, newDashboardState, oldDashboardState, isToolbarStateChangedToVisible(name), isToolbarStateChangedToHidden(name) }`; `CustomToolbarConfigured` → `{ customToolbar }`.

### CSS
`--ab-dashboard-wrap`, `--ab-dashboard-gap-size` (2px), `--ab-cmp-dashboardpanel_header__background`, `--ab-dashboard-header__background`, `.ab-Dashboard__title`.

---

## 4. Tool Panel

Lives in the AG Grid **sideBar** as tool panel `id: 'adaptable'`, `toolPanel: 'AdaptableToolPanel'`. Contents: **Tool Panel Buttons**, **Tool Panels dropdown** (checkbox list), then stacked **Module Tool Panels** and **Custom Tool Panels**, each collapsible.

### Registration
`sideBar: true` (auto-appended) · `sideBar: ['adaptable', 'filters']` · full object `{ toolPanels: [{ id:'adaptable', toolPanel:'AdaptableToolPanel', labelDefault:'AdapTable', iconKey:'menu', width:200 }], defaultToolPanel:'adaptable', position:'left'|'right' }`. CSS width `--ab-cmp-toolpanel__width`.

### `toolPanelOptions`
| Property | Type | Default |
|---|---|---|
| `showToolPanelsDropdown` | `boolean` | `true` |
| `customButtons` | `AdaptableButton<ToolPanelButtonContext>[]` | — |
| `customToolPanels` | `CustomToolPanel[]` | — |

### `initialState.ToolPanel`
| Property | Type | Default |
|---|---|---|
| `ModuleButtons` | module names | `[]` |
| `ToolPanels` | `{ Name: string; VisibilityMode?: 'expanded' \| 'collapsed' }[]` | all entitled modules, alphabetical, collapsed |

### Module Tool Panels (15)
Alert, BulkUpdate, CellSummary, Charting, ColumnFilter, Dashboard, DataChangeHistory, Export, GridFilter, Layout, QuickSearch, SmartEdit, StateManagement, SystemStatus, Theme.

### Custom Tool Panels
```ts
interface CustomToolPanel { name: string; title?: string; buttons?: AdaptableButton[]; render?; frameworkComponent? }
```

### API
`openAdapTableToolPanel`, `closeAdapTableToolPanel`, `getToolPanelState`, `getCustomToolPanels`, `getCustomToolPanelByName`, `getCustomToolPanelButtons`, `getModuleButtons`, `setModuleButtons`, `setAdaptableToolPanelVisibilityMode`, `setCustomToolPanelVisibilityMode`, `showToolPanelPopup`.

---

## 5. Status Bar

Puts AdapTable module panels into AG Grid's status bar. Up to **3 AdapTable status panels** (left/center/right), each hosting module panels; coexists with AG Grid native panels.

```ts
// GridOptions
statusBar: { statusPanels: [{ key:'Left Panel', statusPanel:'AdaptableStatusPanel', align:'left' }] }
// initialState
StatusBar: { StatusBars: [{ Key:'Left Panel', StatusBarPanels:['CellSummary','ColumnFilter'] }] }
```

**Module Status Panels (10):** Alert, CellSummary, Charting, ColumnFilter, DataSet, Export, GridFilter, Layout, QuickSearch, Theme. Rich in-place panels: Export, Layout, GridFilter, QuickSearch, Theme.

Users can drag panels between bars, toggle, reorder in Settings Panel. **No custom status panel content supported.** API: `getAdaptableStatusBars()`, `getAgGridStatusPanels()`, `setStatusBarPanels(panels)`.

---

## 6. Column Menu

AG Grid column header menu with three item sources: AG Grid items, AdapTable items (`name` + module + `category`), Custom (`User`) items.

### `columnMenuOptions.customColumnMenu: (ctx: CustomColumnMenuContext) => CustomColumnMenuItem[]`
Context: `defaultAdaptableMenuItems`, `defaultAdaptableMenuStructure`, `defaultAgGridMenuItems`, `defaultAgGridMenuStructure`, `adaptableColumn`, `agGridColumn`, `isRowGroupColumn`, `adaptableApi`, `adaptableContext`.

```ts
type CustomColumnMenuItem =
  | { menuType:'AgGrid'; name: AgGridColumnMenuItemType }
  | { menuType:'Adaptable'; name; label; icon; category; isVisible; onClick; subItems }
  | { menuType:'User'; label: string | fn; onClick(ctx); icon?; hidden?; disabled?; subMenuItems?; frameworkComponent?; menuItemParams? }
  | '-'
  | { menuType:'Group'; label; subMenuItems; disabled?; icon? };
```

### Default structure (AdapTable items precede AG Grid items)
1. **Calculated Column:** `calculated-column-edit`.
2. **UI Components:** `settings-panel-open`; `dashboard-group` → `dashboard-configure/-expand/-collapse/-dock/-float/-hide/-show`; `column-filter-group` → `column-filter-clear/-suspend/-unsuspend`.
3. **Styling group:** `format-column-add/-edit`; Styled Column by dataType (`styled-column-gradient/percent-bar/bullet/range-bar/rating/badge/icon/sparkline-add/edit`); `flashing-cell-add/-delete`.
4. **Grid group:** `layout-edit`, `column-filter-bar-show/-hide`, `select-group` → `layout-grid-select`, `layout-column-select(-preserve/-reset)`; `cell-summary-show`, `chart-show`, `data-import`, `system-status-show`, `grid-info-show`.
5. **Column group:** `layout-column-caption-change`, `layout-column-hide`, `free-text-column-edit`, `custom-sort-add/-edit`, `plus-minus-add`, `column-info-show`.

### API
`showColumnMenu(columnKey)`, `hideColumnMenu()`, `createDefaultMenuStructure(ctx)`, `createGroupMenu(label, items, disabled?, icon?)`, `getColumnMenuItemByName/ByLabel`, `getColumnMenuItemsByNames/ByLabels/ByCategory/ByCategories`, `removeAdaptableColumnMenuItemByName(s)`.

---

## 7. Context Menu

AG Grid right-click cell menu. AdapTable groups Copy/Paste under one parent and **hides AG Grid Export** (replaced by AdapTable export).

### `contextMenuOptions.customContextMenu: (ctx: CustomContextMenuContext) => CustomContextMenuItem[]`
Same item union as column menu. Context adds `gridCell`, `rowNode`, `primaryKeyValue`, `isGroupedNode`, `isRowGroupColumn`, `isSelectedCell`, `isSelectedRow`, `isSingleSelectedCell`, `isSingleSelectedColumn`, `selectedCellInfo`, `selectedRowInfo`.

### Default structure (5 sections)
1. **Export:** system reports → formats → destinations (`export-{report}-{format}-{destination}`).
2. **Actions:** `calculated-column-edit`; `note-add/remove/show`; `comment-add/remove/show`; `column-filter-on-cell-value`, `column-filter-clear/suspend`; `flashing-cell-clear`/`flashing-row-clear`; `alert-clear`; `fdc3-broadcast`/`fdc3-raise-intent`.
3. **UI Components:** `settings-panel-open`; `dashboard-group`.
4. **Editing:** `smart-edit-apply`, `bulk-update-apply`.
5. **Grid & Column:** `grid-group` → `layout-clear-selection`, `layout-select-all`, `layout-auto-size`, `layout-edit`, `layout-aggregated-view`, `cell-summary-show`, `data-import`, `system-status-show`, `grid-info-show`; `column-info-show`.

### API
`hideContextMenu()`, `createDefaultMenuStructure`, `createGroupMenu`, `getContextMenuItemByName/ByLabel`, `getContextMenuItemsByNames/ByLabels/ByCategory/ByCategories`, `removeAdaptableContextMenuItemByName(s)`.

---

## 8. Wizards

Modules with wizards (14): Alerts, Calculated Column, Charts, Custom Sort, Data Import, Export, Flashing Cells, Format Column, FreeText Column, Layouts (Table & Pivot), Named Query, Plus Minus, Shortcuts, Styled Column (8 variants). Launched from Settings Panel New/Edit or column/context menu.

Standard wizard UI: vertical numbered step menu; info icons flag steps needing input; disabled Finish button explains missing data; final **Summary** step with per-section edit buttons; context-sensitive help. Keyboard: **Ctrl+number** jumps to step; **Ctrl+/‑** cycles. Each wizard remembers its drag/resize.

Known step sequences (see other sections for the rest):
- **Table Layout (9):** Settings → Row Groups → Column Properties → Aggregations → Row Summaries & Sorts → Column Filters → Grid Filter → Row Selection → Summary.
- **Pivot Layout (8):** Settings → Row Groups → Pivot Columns → Pivot Aggregations → Column Sorts → Filters → Row Selection → Summary.
- **Format Column (6):** Name & Row Scope → Column Scope → Target → Condition → Style → Display Format.
- **Calculated Column (6):** type → id/name/tooltip → expression → DataType/Width → column settings → finish.
- **Flashing Cell (4):** Name+Scope → Rule → Duration → Up/Down/Neutral styles.
- **Scheduled Alert (7):** Name → Type → Schedule → Message → Notification → Behaviour → Tags.
- **Styled Column:** Settings → Scope → (Ranges | Badges | Mappings | Style) → Style/Display → Tags → Summary.
- **Free Text Column (6):** Column Id → Name → DataType → Default Value → Column Properties → Finish.
- **Custom Sort (3):** name → column → drag values.
- **Export:** Name → column scope → row scope.
- **Shared Style step:** back/fore/border color pickers with opacity, border radius, Bold/Italic, text decoration, font size, alignment, CSS class.

### `wizardOptions`
| Property | Type | Default |
|---|---|---|
| `popupType` | `'modal' \| 'window'` | inherits `settingsPanelOptions.popupType` |
| `position` | `WindowPosition` | centered |
| `size` | `WindowSize` | 90% viewport, width capped 1200px |

---

## 9. Standalone Windows

- **Custom Popup Windows** (`userInterfaceApi`): `openCustomWindowPopup({ id, title, icon?, position?, size?, render?, frameworkComponent?, onFrameworkComponentDestroyed? }): { close }`, `closeCustomWindowPopup(id)`. Movable/resizable; last size/position persists per id.
- **Loading Screen** (`userInterfaceOptions.loadingScreenOptions`): `showLoadingScreen` (true), `loadingScreenDelay` (200 ms), `loadingScreenTitle`, `loadingScreenText`.
- **Progress Indicator** (`userInterfaceApi`): `showProgressIndicator({ text, delay?, render?, frameworkComponent?, renderMode?: 'content' | 'dialog' }): { close }`, `hideProgressIndicator()`.

---

## 10. Shared UI Primitives

### `AdaptableButton<CONTEXT>`
| Property | Type | Default |
|---|---|---|
| `label` | `string \| (button, ctx) => string` | — |
| `onClick` | `(button, ctx) => void` | — |
| `icon` | `AdaptableIcon \| fn` | — |
| `iconPosition` | `'start' \| 'end'` | `'start'` |
| `tooltip` | `string \| fn` | — |
| `buttonStyle` | `{ variant: 'text'|'outlined'|'raised'; tone: 'success'|'error'|'neutral'|'none'|'warning'|'info'|'accent'; className? }` | — |
| `hidden` / `disabled` | `(button, ctx) => boolean` | — |

Used in 8 surfaces: Dashboard, Custom Toolbars, Tool Panel, Action Columns, Alert Forms, Export Forms, DataSet Forms, Custom Tool Panels.

### `AdaptableForm<T>`
`{ title?, description?, fields: (Field | Field[] /* row */ | { kind:'group', title, hidden?, fields })[], layout?: 'rows' | 'inline', buttons?: AdaptableButton[], onSubmit?(formData, ctx) }`.
Field properties: `name`, `label`, `fieldType`, `defaultValue`, `placeholder`, `helpText`, `tooltip`, `required`, `disabled`, `hidden`, `min`, `max`, `minLength`, `maxLength`, `step`, `pattern`, `rows`, `multi`, `clearToDefault`, `options: Option[] | fn | Promise`, `validate(value, formData, ctx) => string | null`, `onValueChange`, `render(params)` (custom).
Field types (13): `text`, `textarea`, `number`, `slider`, `date`, `time`, `datetime`, `color`, `select`, `radio`, `checkbox`, `textOutput`, `custom`.
Validation order: `required` → bounds/length/pattern → custom `validate`. Helpers: `getDefaultAdaptableFormData`, `flattenAdaptableFormFields`, `validateAdaptableForm`, `isAdaptableFormFieldGroup`. Built-in ARIA labelling.

### `AdaptableIcon`
**System** `{ name: AdaptableSystemIconName; size? }` (150+ names), **Custom** `{ src; name? }`, **Element** `{ element }`. Register reusable icons via `userInterfaceOptions.customIcons`. Classes `.ab-Icon`, `.ab-Icon--NAME`.

### `AdaptableStyle`
`CellFontStyle` (`Alignment`, `FontSize: 'XSmall'..'XLarge'`, `FontStyle`, `FontWeight`, `ForeColor`, `TextDecoration`) + `CellBoxStyle` (`BackColor`, `BorderColor`, `BorderRadius`) + `ClassName` (must be listed in `userInterfaceOptions.styleClassNames`). Colors: hex, named, rgb/rgba, or `var(--ab-color-*)`.

### Toast Notifications (`notificationsOptions`)
`position` (`BottomRight`), `duration` (3000 | `'always'`), `transition: 'Bounce'|'Slide'|'Zoom'|'Flip'`, `maxNotifications` (3), `maxSystemMessagesInStore` (100), `closeWhenClicked`, `pauseWhenHovering`, `isDraggable`, `showProgressBar`, `showApplicationIcon`, `showSystemStatusMessageNotifications`.

---

## 11. `userInterfaceOptions` & UserInterface API

| Property | Type | Default |
|---|---|---|
| `applicationIcon` | `AdaptableIcon` | null |
| `customIcons` | `CustomIcon[] \| fn` | — |
| `alternativeModuleNames` | `AlternativeModuleName[]` | null |
| `objectTags` | `AdaptableObjectTag[] \| fn` | — |
| `styleClassNames` | `string[]` | `[]` |
| `editableCellStyle` / `editedCellStyle` / `readOnlyCellStyle` | `AdaptableStyle` | — |
| `disableDeleteConfirmation` | `boolean` | false |
| `englishVariant` | `'GB' \| 'US'` | `'GB'` |
| `loadingScreenOptions` | see §9 | — |
| `dateInputOptions` | `{ dateFormat, datepickerButtons, locale, showOutsideDays, showWeekNumber, useNativeInput }` | — |
| `showDocumentationLinks` | `boolean` | true |
| `showAdapTableVersion` / `showAgGridVersion` | `boolean` | true |
| `useCustomMacLikeScrollbars` | `boolean` | false |

`UserInterfaceState { HideAdaptableUI: boolean }`. API: `hideAdaptableUI()`, `showAdaptableUI()`, `isAdaptableUIVisible()`, `getUserInterfaceState()`, `getColorPalette()`, `getCustomIcons()`, `getStyleClassNames()`, `getEditableCellStyle()`, `getEditedCellStyle()`, `getReadOnlyCellStyle()`, `getAdaptableObjectTags()`, `getAdaptableObjectsWithTag(tag, module)`, `openCustomWindowPopup`, `closeCustomWindowPopup`, `showProgressIndicator`, `hideProgressIndicator`.

---

## 12. Theming

### Model
- Import `@adaptabletools/adaptable/index.css` (one file; dark included). System themes: `light`, `dark`, `os`. Root classes `:root.ab--theme-light` / `:root.ab--theme-dark`.
- `ThemeState { CurrentTheme: SystemThemeName; SystemThemes?: (SystemThemeName | { Name; AgThemeMode? })[] }`. `UserThemes` **deprecated** — customise via CSS variable overrides.
- AG Grid coordination: auto light/dark switching for Quartz, Alpine, Balham, Material (Theming API v33+); custom AG Grid modes pair via `SystemThemes[].AgThemeMode`.
- Runtime switch: Theme toolbar, Tool Panel, Status Bar, Settings Panel. Last theme persists.
- **Theme API:** `getCurrentTheme`, `getCurrentThemeObject`, `getThemes`, `getSystemThemes`, `getThemeByName`, `getThemeState`, `loadTheme`, `loadLightTheme`, `loadDarkTheme`, `applyCurrentTheme`, `editTheme`, `setSystemThemes`, `openThemeSettingsPanel`.
- **Event:** `ThemeSelected` → `{ theme: 'light'|'dark'|'os' }`.

### Key CSS variables
Theme-dependent: `--ab-color-accent` (#07c), `--ab-color-accent-foreground`, `--ab-color-background`, `--ab-color-foreground`, `--ab-color-primary`, `--ab-color-primary-foreground`, `--ab-color-primarylight`, `--ab-color-primarydark`, `--ab-color-card`, `--ab-color-card-foreground`, `--ab-color-secondary(-foreground)`, `--ab-color-border`, `--ab-color-destructive(-foreground)`, `--ab-color-shadow`.
Static: `--ab-color-accentlight`, `--ab-color-ring`, `--ab-color-warn` (#eb9316), `--ab-color-info` (#17a2b8), `--ab-color-success` (#419641) + `-foreground`; action colors `--ab-color-action-edit/-share/-delete/-clone` + `-foreground`.
Palette: `--ab-color-palette-1..12` (six bg/fg pairs). Swatches: `--ab-color-swatch-1..20`. The colour picker shows exactly these groups.
Spacing: `--ab-base-space` (4px). Typography: `--ab-base-font-size`, `--ab-font-size-0..7`, `--ab__font-family`.
Component vars: `--ab-cmp-*` (e.g. `--ab-cmp-dashboardpanel_header__background`, `--ab-cmp-toolpanel__width`); classes `.ab-Dashboard__title`, `.ab-OnePageWizard__section-title`, `.ab-Dialog__close-button`, `.ab-Icon`.

---

## 13. Expression Editor & Query Builder

**Expression Editor** (used wherever AdapTableQL is entered). Layout: left **Functions** panel with categorical dropdowns (Special, Logical, Comparison, String, Math, Date; tooltips; click inserts); center **editor** with operator toolbar, drag-drop target, live validation warnings, return-type highlighting, optional **WHERE** textarea, editable first-row data preview; right **Resources** panel with searchable Columns list and Named Queries. Functions filtered by expression context; custom functions appear in dropdowns.

**Query Builder**: dropdown-driven Boolean builder; **Conditions** (column → operator → value) inside **AND/OR groups**. Only common functions; no complex nesting. Grid Filter only (Alerts/Conditional Formats planned). Enable via `filterOptions.gridFilterOptions.availableFilterEditors: ['QueryBuilder']`. Output e.g. `[language] IN ("JavaScript","HTML") AND ([github_watchers] > 2000 OR [github_stars] > 14500)`.

---

## 14. Accessibility & Keyboard

Universal: Arrow keys (menus/selects), Home/End, type-ahead, Escape (close + return focus), Tab/Shift+Tab (modal focus trap), Enter/Space. Wizards add Ctrl+number / Ctrl+/‑. ARIA roles/states handled automatically for AdapTable-owned UI only.

---

## 15. Observations relevant to a leaner redesign

1. **Four overlapping "chrome" surfaces** (Dashboard, Tool Panel, Status Bar, Settings Panel) all expose the same module functionality; each has its own state slice, options object, API, and runtime configuration UI.
2. **Module buttons duplicate** across Dashboard and Tool Panel; both default to opening Settings Panel sections.
3. **Custom extension is uniform**: `{ name, title, buttons?, form?, render?, frameworkComponent? }` recurs for toolbars, tool panels, settings panels, popups — a single "custom panel" abstraction could cover all.
4. **Menus** share one item union and near-identical APIs; item visibility rules are deeply conditional.
5. **Theming is already token-based** (`--ab-*` vars, `adaptable` layer, Base UI/shadcn) — a lean rebuild can keep a variable contract for compatibility.
6. Deprecated/legacy still carried: `LegacyFlatSettingsPanelNavigation`, `UserThemes`, `colorPalette`, `ThemeChanged` event.
7. **14 wizards with 3–9 steps each** are the primary authoring path. Every wizard is a form over a JSON object with a known schema; that is exactly what a generative assistant can produce directly.
