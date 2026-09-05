# Prior Art Survey — `widgetstools/stern-bak` (StarUI / MarketsGrid)

Read-only survey of the existing implementation at https://github.com/widgetstools/stern-bak (commit `5a248ad`), taken to understand what has already been built, which design system SmartGrid should reuse, and where the UI tooling is heaviest.

**Headline numbers:** 818 non-test `.ts/.tsx` files, **122,143 lines** of non-test source under `packages/`, plus ~91,000 lines of tests (315 test files). `apps/` adds ~21,900 lines across 7 demo apps.

Key orientation files: `CLAUDE.md`, `README.md`, `docs/current-features.md` (1,766-line feature inventory), `docs/latest/architecture.md`, `docs/EXPRESSION_DSL.md`, `docs/PROFILE_PERSISTENCE.md`.

---

## 1. Monorepo layout

```
packages/   7 workspace buckets (each bucket = one published npm package containing several "members")
apps/       separate npm install root
docs/
tools/      repo-internal checks (check-ds-tokens.ts, check-design-system-deps.ts)
scripts/
```

| Package | Path | Purpose | Non-test LOC |
|---|---|---|---|
| `@wellsfargo-starui/grid` | `packages/react-grid/` | MarketsGrid + customizer + config-browser + widgets | **58,816** |
| ↳ `grid` | `react-grid/grid` | AG Grid host + full customizer | 45,422 |
| ↳ `widgets-react` | `react-grid/widgets-react` | blotter container, provider editor, hosted widgets | 10,664 |
| ↳ `config-browser` | `react-grid/config-browser` | Dexie config-table browser UI | 2,730 |
| `@wellsfargo-starui/core` | `packages/core/` | vanilla-TS grid engine, host ports, Dexie config store, widget framework | **22,458** |
| ↳ `engine` | `core/engine` | GridPlatform, module logic, expression engine, profiles, persistence | 16,716 |
| ↳ `host-config` | `core/host-config` | `ConfigManager` + Dexie schema | 4,839 |
| `@wellsfargo-starui/data` | `packages/data/host-data` | SharedWorker data services, STOMP transport | **13,459** |
| `@wellsfargo-starui/openfin` | `packages/openfin/` | OpenFin workspace shell | **10,709** |
| `@wellsfargo-starui/react` | `packages/react-core/` | shadcn/Radix primitives, widget SDK, data hooks | **10,950** |
| ↳ `ui` | `react-core/ui` | 52 shadcn components + 3 custom | 5,143 |
| `@wellsfargo-starui/design-system` | `packages/design-system/` | tokens, themes, adapters, cell renderers, 113 SVG icons | **3,705** |
| `@wellsfargo-starui/types` | `packages/types/` | foundation contracts | **2,041** |

### Dependency stack
- **AG Grid Enterprise 35.1.0**, **React 19.2.5**, TypeScript ~5.9.3, Vite ~7.3.2, Vitest 4, Playwright 1.59.
- **UI:** 28 `@radix-ui/react-*` packages, `class-variance-authority`, `clsx`, `tailwind-merge`, `cmdk`, `vaul`, `sonner`, `recharts`, `react-day-picker`, `react-hook-form`, `@tanstack/react-virtual`. Tailwind **3.4.1**.
- **State:** Zustand ^5 (used in `createGridStore.ts` and `GridPlatform.ts` only). No MUI, no Redux.
- **Grid-specific:** `@codemirror/*` (expression editor), `@dnd-kit/*`, `lucide-react`.
- **Persistence:** `dexie ^4.4.2`. **Formatting:** `ssf` (Excel format strings).
- **Data:** `@stomp/stompjs`. **OpenFin:** `@openfin/core 43`, `@openfin/workspace 23`.

---

## 2. The design system (to be reused by SmartGrid)

**Owner package:** `@wellsfargo-starui/design-system` at `packages/design-system/` with two members: `design-system/` (tokens, themes, adapters, cell renderers) and `icons-svg/`. Foundation package: may import only from `@wellsfargo-starui/types`, enforced by `tools/scripts/check-design-system-deps.ts` and `check-ds-tokens.ts` (no-hardcoded-hex scan).

**Split:** tokens live in `design-system`; React components live in `packages/react-core/ui`.

### Token system (`packages/design-system/design-system/src/tokens/`)

| File | LOC | Contents |
|---|---|---|
| `primitives.ts` | 205 | Raw palette + scales ("Binance-inspired trading palette": `paper`, `ink`, `graphite`, `teal`, `rose`, `amber`, `brand`, `purple`, CVD-safe variants; typography, spacing, radius, opacity, transition, shadow) |
| `semantic.ts` | 257 | `ColorScheme` interface + `dark` / `light` / `lightPaper` schemes |
| `components.ts` | 175 | per-component theming overrides |
| `controls.ts` | 69 | `ControlSize` / `ControlTier` for form controls |
| `staruiHex.ts` | 266 | canonical hex pack + `buildShadcnFromStarui()` |
| `starui-tokens.css` | 164 | OKLCH custom properties |
| `tokens.json` | 59 | JSON mirror |

`ColorScheme` vocabulary is trading-specific: `primary`, `surface` (ground/sunken/primary/secondary/tertiary/quaternary/muted/popover), `text` (primary/secondary/muted/faint/disabled), `border`, `accent` (positive/negative/warning/info/highlight/purple), **`trade`** (flat / positiveStrip / negativeStrip / bidFill / askFill), **`action`** (buyBg/buyText/sellBg/sellText), `state`, `overlay`, `chart`, `sidebar`, CVD groups.

**CSS variable prefixes coexist:** `--st-*`, `--ds-*`, `--bn-*`, `--fi-*`, `--p-*` (PrimeNG), `--ck-*` (Cockpit settings-panel primitives). `src/adapters/compatCss.ts` (248 LOC) bridges OKLCH source tokens onto the aliases.

### Theming
`applyTheme({ theme, cvd?, variant? })` (`src/applyTheme.ts`) sets `data-theme="dark|light"`, `data-variant="clinical|paper"`, `data-cvd="on"` on `<html>` and persists to `localStorage` (`starui:theme` / `starui:cvd` / `starui:variant`). Theme files `src/themes/fi-dark.css`, `fi-light.css`, `scrollbars.css`. 100% dark/light parity is mandatory.

### Adapters (`src/adapters/`)
- `tailwind.ts` — Tailwind preset; `darkMode: ['selector', '[data-theme="dark"]']`, OKLCH with `<alpha-value>`.
- `shadcn.ts` — `generateShadcnCSS` / `getShadcnTokens`.
- `agGrid.ts` (199) — Quartz theme params, baked `agGridDarkTheme` / `agGridLightTheme` + variants, plus **`GridDensity`** presets (ultra/compact/comfortable).
- `primeng.ts` — Angular-only.

### Component library
`packages/react-core/ui/src/components/` — **52 shadcn/Radix components**: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip, use-toast — plus `CollapsibleToolbar`, `ToolbarContainer`, `VirtualizedList`. A second, older shadcn copy exists at `packages/react-grid/grid/src/customizer/ui/shadcn/**` (legacy).

**24 AG Grid cell renderers** as `ICellRendererComp` classes in `src/cellRenderers.ts` (1,238 LOC), catalogued in `src/cellRendererRegistry.ts`: 13 zero-config (`SideCellRenderer`, `StatusBadgeRenderer`, `ColoredValueRenderer`, `OasValueRenderer`, `SignedValueRenderer`, `TickerCellRenderer`, `RatingBadgeRenderer`, `PnlValueRenderer`, `FilledAmountRenderer`, `BookNameRenderer`, `ChangeValueRenderer`, `YtdValueRenderer`, `RfqStatusRenderer`) and 11 configurable (`Pill`, `Heatmap`, `PercentBar`, `TrendArrow`, `Sparkline`, `MultiLine`, `IconText`, `CountryFlag`, `RatingDelta`, `TimeSince`, `AllocationBar`).

### Icons
`packages/design-system/icons-svg/` — **113 flat SVGs** (`currentColor`, 24×24), generated barrel `allIcons.ts`, `react/DynamicIcon.tsx`. Runtime UI icons are `lucide-react`.

### Consumer import surface
```ts
import { dark, light, componentTokens, applyTheme } from '@wellsfargo-starui/design-system';
import '@wellsfargo-starui/design-system/styles.css';   // tokens + fonts + compiled utilities
import preset from '@wellsfargo-starui/design-system/tailwind';
import { Button } from '@wellsfargo-starui/react';
```
`./styles.css` bundles self-hosted Inter + JetBrains Mono woff2; no global reset (`./reset.css` opt-in). Subpaths: `./css`, `./tokens{,/primitives,/semantic,/components,/controls}`, `./shadcn`, `./adapters/ag-grid`, `./cell-renderers`, `./cell-renderers-registry`, `./icons{,/react,/all-icons,/svg/*}`.

---

## 3. Grid configuration & customization tooling

### Core abstraction: `Module` (`packages/core/engine/src/platform/types.ts`)

```ts
interface Module<S = unknown> {
  id; name; schemaVersion; dependencies?; priority;
  getInitialState(): S;
  serialize(state: S): unknown;
  deserialize(raw: unknown): S;
  migrate?(raw: unknown, fromVersion: number): S;
  activate?(platform: PlatformHandle<S>): () => void;
  transformColumnDefs?(defs, state, ctx): AnyColDef[];
  transformGridOptions?(opts, state, ctx): Partial<GridOptions>;
  SettingsPanel?: UIComponent<{ gridId }>;
  ListPane?:      UIComponent<{ gridId, selectedId, onSelect }>;
  EditorPane?:    UIComponent<{ gridId, selectedId }>;
}
```

Platform infrastructure: `GridPlatform.ts`, `PipelineRunner.ts`, `topoSort.ts`, `ApiHub.ts`, `EventBus.ts`, `RowChangeBus.ts` (rAF-coalesced row deltas), `CssInjector.ts`, `DirtyBus.ts`, `ResourceScope.ts`.

### 17 registered modules (`packages/react-grid/grid/src/widget/modules.ts`)
`generalSettings` → `columnTemplates` → `columnCustomization` → `calculatedColumns` → `columnGroups` → `conditionalStyling` → `visualExcel` → `smartEdit` → `bulkUpdate` → `plusMinus` → `shortcuts` → `dataChangeHistory` → `alerts` → `savedFilters` → `toolbarVisibility` → `toolbarDateSettings` → `gridState`.

- **General settings** — ~93 AG Grid option controls across bands.
- **Column customization** — 10 bands per column: Header, Layout, Templates, Cell Style, Header Style, Value Format, Filter, Row Grouping, Cell Editor, Cell Renderer.
- **Conditional styling** — themed dark/light rules; cell/row style, flash-on-match, indicator badge, formatter, animate-value; delivered via `cellClassRules` / `rowClassRules`.
- **Calculated columns** — virtual columns from DSL expressions.
- **Column groups / templates**, **Saved filters + stream-safe floating filters**, **Alerts** (dataChange / relativeChange / rowChange; toast + bell + OpenFin), **Editing family** (Smart Edit, Bulk Update, Plus/Minus, Shortcuts, Edit History sharing an `EditJournal`), **Visual Excel**, **Grid state / toolbar visibility / toolbar-date settings**.
- Non-module surfaces: Auto Format, Quick Search, Column Selector dialog, Profile management, Grid Density pill, Help panel, context menu.

### Expression DSL (`packages/core/engine/src/expression/`, 1,984 LOC)
Tokenizer, parser, evaluator, compiler; CSP-safe (no `eval`), single-expression, side-effect-free; `[field]` bracket refs. `docs/EXPRESSION_DSL.md` is written for an AI agent doing JS→DSL conversion.

### Config state & persistence
```ts
interface ProfileSnapshot { id; gridId; name; state: Record<string, SerializedState>; createdAt; updatedAt }
interface SerializedState { v: number; data: unknown }   // v = module schemaVersion
```
One slot per module, independently versioned with `migrate()`. `StorageAdapter` contract (`LocalStorageBundleAdapter`, `MemoryAdapter`), `ProfileManager` with export/import, Dexie/IndexedDB `ConfigManager` (1,633 LOC: seeding, optimistic locking, audit, ACL, REST sync).

### UI surfaces
| Surface | File | LOC |
|---|---|---|
| Settings drawer (vaul) | `grid/src/widget/SettingsSheet.tsx` | 534 |
| Module navigation menubar | `SettingsModuleMenubar.tsx` | 205 |
| Primary toolbar + overflow + ViewMenu | | 658 |
| Filters toolbar | `FiltersToolbar.tsx` | 446 |
| Formatting toolbar | `FormattingToolbar.tsx` + `widget/formatter/` | 3,444 |
| Profile selector | `ProfileSelector.tsx` | 541 |
| Template manager | `TemplateManager.tsx` | 613 |
| Column selector dialog | `widget/column-selector/` | 854 |
| Editing toolbar | `widget/editingToolbar/` | 534 |
| Help panel | `widget/help/` | 1,271 |

Settings-panel primitives in `grid/src/customizer/ui/SettingsPanel/` (17 files / 1,366 LOC): `PanelChrome`, `TabStrip`, `Band`, `SettingsRow`, `ItemCard`, `PillToggleGroup`, `Stepper`, `SummaryChip`, `CockpitList`, etc. Shared editors: `ui/ExpressionEditor/` (1,413, CodeMirror 6), `ui/FormatterPicker/` (1,863), `ui/StyleEditor/` (1,233), `ui/ColorPicker/` (393), `ui/format-editor/` (800), `ui/PopoutPortal.tsx` (664).

**No multi-step wizards exist.**

### Size: config UI vs core engine

| Layer | Path | LOC |
|---|---|---|
| Customizer UI (React) | `react-grid/grid/src/customizer/` | **28,108** |
| Grid chrome/toolbar/settings UI | `react-grid/grid/src/widget/` | **16,857** |
| CSS | `react-grid/**/*.css` | 4,033 |
| **Config UI total** | | **~49,000** |
| Core engine (all) | `core/engine/src/` | **16,716** |
| ↳ module logic only | `core/engine/src/customizer/` | **8,460** |
| ↳ expression engine | | 1,984 |

**The React config UI is ~3.3× the module logic it drives (28.1k vs 8.5k).** Per module: column-customization 4,428 UI / 1,868 logic; alerts 2,087 / 546; conditional-styling 3,244 / 1,910; general-settings 1,920 / 424; calculated-columns 677 / 225; toolbar-date-settings 1,338 / 0.

---

## 4. AI / LLM assistant integration

**None.** No LLM SDKs, API clients, chat UI, tool schemas, or agent runtime anywhere in `packages/`, `apps/` or `docs/`. Only agent-facing documentation exists (`CLAUDE.md`, `docs/EXPRESSION_DSL.md`).

**Implication:** the substrate is well-suited to an assistant. The `Module` contract gives typed, versioned, serializable state per feature; `ProfileSnapshot.state` is a `Record<moduleId, {v, data}>` JSON document; every module exposes `serialize`/`deserialize`/`migrate`; the CSP-safe expression compiler has `validate()` with positioned errors. A tool-calling surface over "read/patch module state + validate expression + apply" needs essentially no new engine work.

---

## 5. Where the UI tooling is heaviest and could get leaner

The engine layer is lean and well-factored. The weight is above it.

1. **The schema-driven-form pattern exists but is used exactly once.** `general-settings/fieldSchema.tsx` opens with: *"the v2-verbatim panel was 1400 LOC of hand-rolled JSX for ~80 controls. Every field is a `<Row label control={...}>` with the SAME row shape… Making fields data lets us collapse 1400 LOC → ~150 LOC of schema data + this renderer."* That refactor was done for one module and never applied elsewhere. `AlertsPanel.tsx` (924), `ConditionalStylingPanel.tsx` (763), `ColumnGroupsPanel.tsx` (661), `ColumnSettingsPanel.tsx` (652), `ToolbarDateSettingsPanel.tsx` (618), `CalculatedColumnsPanel.tsx` (409), `ShortcutsPanel.tsx` (350), `PlusMinusPanel.tsx` (319) are ~4,700 LOC of the same row shapes. Extending the schema with color swatch, expression field, column picker and list-of-rules controls would retire 3,000–4,000 LOC and collapse the test surface.

2. **Eleven near-identical per-renderer config editors** (`CellRendererEditors/`, 13 files / 1,228 LOC) even though `CellRendererConfig` is already a discriminated union. A field descriptor per registry entry rendered generically would delete ~1,000 LOC.

3. **`column-customization` is the heaviest module** (4,428 UI LOC / 34 files) with its own local `Row.tsx` and `TriStateToggle.tsx`; `FilterEditor` (465) and `CellEditorEditor` (544) are per-AG-Grid-kind switch forms that fit the schema approach.

4. **Three overlapping style/format editing surfaces** (~7,600 LOC across `StyleEditor`, `format-editor`, `FormatterPicker`, `ColorPicker`, `widget/formatter/`), with presentational forks carried in components rather than a layout prop.

5. **Chrome duplication in `widget/`**: a five-layer host stack (`MarketsGrid` / `MarketsGridHost` / `MarketsGridSurface` / `useMarketsGridController` / `useGridHost`); stream-safe floating filters are ~71 KB across five files sharing a partially-factored grammar.

6. **Two shadcn copies** plus a third tier of local wrappers (`ChromeButton`, `GhostIconButton`, `NativeOptionsSelect`, `PopoverCompat`, `Poppable`, `HoverTooltip`).

7. **Token prefix sprawl** across six CSS-variable namespaces with a 248-LOC compat bridge.

**Keep as-is:** the `Module` contract, the pipeline runner, `RowChangeBus`, the expression engine, and the versioned `SerializedState` envelope.

**Leaning-out budget:** schema-driven panels (~3,500), generic renderer-config forms (~1,000), unified style/format editor (~1,500–2,500), single shadcn tier (~500). Roughly **6,500–7,500 LOC (~15% of the grid package)** without removing a user-facing feature — and that is before an AI-first configuration path removes the need for most hand-built forms entirely.
