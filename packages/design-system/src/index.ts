// ─────────────────────────────────────────────────────────────
//  @smartgrid/design-system — Public API (framework-agnostic; no React)
//  Origin: stern-bak packages/design-system (StarUI), trimmed to one
//  CSS-variable namespace (`--sg-*`).
//
//  Subpath imports:
//    @smartgrid/design-system/css             → bundled stylesheet
//    @smartgrid/design-system/css/<file>.css  → individual layers
//    @smartgrid/design-system/ag-grid         → Quartz theme + density presets
//    @smartgrid/design-system/cell-renderers  → renderer classes + registry
//    @smartgrid/design-system/icons           → SVG strings + metadata
//    @smartgrid/design-system/react           → <DynamicIcon> (React peer)
//
//  Root import for tokens + helpers:
//    import { dark, light, componentTokens, applyTheme } from '@smartgrid/design-system';
// ─────────────────────────────────────────────────────────────

export * from './tokens';

export {
  applyTheme,
  getTheme,
  getResolvedTheme,
  getOsMode,
  resolveMode,
  onOsThemeChange,
  THEME_STORAGE_KEY,
  CVD_STORAGE_KEY,
  VARIANT_STORAGE_KEY,
  type ThemeOptions,
  type LightVariant,
  type Mode,
  type ResolvedMode,
} from './applyTheme';

export {
  // Zero-config renderers
  SideCellRenderer,
  StatusBadgeRenderer,
  ColoredValueRenderer,
  OasValueRenderer,
  SignedValueRenderer,
  TickerCellRenderer,
  RatingBadgeRenderer,
  PnlValueRenderer,
  FilledAmountRenderer,
  BookNameRenderer,
  ChangeValueRenderer,
  YtdValueRenderer,
  RfqStatusRenderer,
  // Configurable renderers
  PillCellRenderer,
  HeatmapCellRenderer,
  PercentBarCellRenderer,
  TrendArrowCellRenderer,
  SparklineCellRenderer,
  MultiLineCellRenderer,
  IconTextCellRenderer,
  CountryFlagCellRenderer,
  RatingDeltaCellRenderer,
  TimeSinceCellRenderer,
  AllocationBarCellRenderer,
} from './cellRenderers';

export {
  cellRendererComponents,
  cellRendererCatalogue,
  cellRendererCatalogueByCategory,
  CONFIGURABLE_RENDERER_IDS,
  getCellRendererEntry,
  type CellRendererId,
  type CellRendererConfig,
  type CellRendererCategory,
  type CellRendererCatalogueEntry,
  type ThemeAwareColor,
  type PillRendererConfig,
  type HeatmapRendererConfig,
  type PercentBarRendererConfig,
  type TrendArrowRendererConfig,
  type SparklineRendererConfig,
  type MultiLineRendererConfig,
  type IconTextRendererConfig,
  type CountryFlagRendererConfig,
  type RatingDeltaRendererConfig,
  type TimeSinceRendererConfig,
  type AllocationBarRendererConfig,
} from './cellRendererRegistry';

// Icon names + metadata only — the SVG strings live behind `./icons` so the
// root bundle stays small.
export {
  ICON_PATHS,
  ICON_META,
  ICON_NAMES,
  ICON_CATEGORY_NAMES,
  ICON_CATEGORIES,
  getIconsByCategory,
  type MarketIconName,
  type IconCategory,
  type IconMeta,
} from './icons/index';
