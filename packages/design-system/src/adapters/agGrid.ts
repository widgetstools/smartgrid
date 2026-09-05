// ─────────────────────────────────────────────────────────────
//  AG Grid Theme — Quartz (ag-grid-community v36 Theming API)
//  Origin: stern-bak packages/design-system/src/adapters/agGrid.ts.
//  Colours are read live from the `--sg-*` CSS tokens so the grid
//  repaints on `<html data-theme>` flips; light/dark theme modes are
//  selected via `data-ag-theme-mode` (set by `applyTheme`).
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzLight, themeQuartz, type Theme } from 'ag-grid-community';

/** AG Grid Quartz compactness preset — maps to `theme.withParams` structural knobs. */
export type GridDensity = 'ultra' | 'compact' | 'comfort';

export const GRID_DENSITY_ORDER: readonly GridDensity[] = ['ultra', 'compact', 'comfort'];

export const GRID_DENSITY_LABELS: Record<GridDensity, string> = {
  ultra: 'Ultra',
  compact: 'Compact',
  comfort: 'Comfortable',
};

const AG_GRID_INTER_FONT = { googleFont: 'Inter' } as const;
const AG_GRID_MONO_FONT = { googleFont: 'JetBrains Mono' } as const;

/**
 * Structural theme params per density — aligned with AG Grid compactness guidance.
 * @see https://www.ag-grid.com/javascript-data-grid/theming-compactness/
 */
export function gridDensityStructuralParams(density: GridDensity) {
  const rowH = density === 'ultra' ? 22 : density === 'comfort' ? 40 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 42 : 32;
  const fontPx = density === 'ultra' ? 10 : density === 'comfort' ? 14 : 12;
  const headerFontPx = density === 'ultra' ? 10 : density === 'comfort' ? 13 : 11;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;
  const iconPx = density === 'ultra' ? 12 : density === 'comfort' ? 16 : 14;

  return {
    fontFamily: AG_GRID_INTER_FONT,
    fontSize: fontPx,
    headerFontFamily: AG_GRID_MONO_FONT,
    headerFontSize: headerFontPx,
    iconSize: iconPx,
    borderRadius: 2,
    wrapperBorderRadius: 2,
    cellHorizontalPaddingScale: 1,
    rowVerticalPaddingScale: 1,
    columnBorder: true as const,
    rowHeight: rowH,
    headerHeight: headerH,
    spacing,
    cellHorizontalPadding: 12,
  };
}

/** Infer the closest preset from persisted row/header heights (settings panel edits). */
export function inferGridDensity(rowHeight?: number, headerHeight?: number): GridDensity {
  for (const density of GRID_DENSITY_ORDER) {
    const p = gridDensityStructuralParams(density);
    if (p.rowHeight === rowHeight && p.headerHeight === headerHeight) return density;
  }
  return 'compact';
}

const densityThemeCache = new WeakMap<Theme, Map<GridDensity, Theme>>();

/** Apply a density preset on top of any Quartz theme (colors unchanged). */
export function applyGridDensityToTheme(theme: Theme, density: GridDensity): Theme {
  if (typeof theme?.withParams !== 'function') return theme;
  let byDensity = densityThemeCache.get(theme);
  if (!byDensity) {
    byDensity = new Map();
    densityThemeCache.set(theme, byDensity);
  }
  const cached = byDensity.get(density);
  if (cached) return cached;
  const next = theme.withParams(gridDensityStructuralParams(density));
  byDensity.set(density, next);
  return next;
}

export interface GridDensitySettingsSlice {
  gridDensity?: GridDensity;
  rowHeight?: number;
  headerHeight?: number;
}

/** Resolve active density from module state — explicit field wins, else height inference. */
export function resolveGridDensity(settings?: GridDensitySettingsSlice | null): GridDensity {
  if (settings?.gridDensity) return settings.gridDensity;
  return inferGridDensity(settings?.rowHeight, settings?.headerHeight);
}

/** `--sg-*` tokens are full colours, so alpha variants go through color-mix. */
const alpha = (token: string, pct: number) => `color-mix(in oklch, var(${token}) ${pct}%, transparent)`;

/** Shared colour params — read live `--sg-*` tokens from the page. */
function sharedColorParams() {
  return {
    backgroundColor: 'var(--sg-card)',
    foregroundColor: 'var(--sg-foreground)',
    borderColor: 'var(--sg-grid-border)',
    oddRowBackgroundColor: alpha('--sg-primary', 2.2),
    rowHoverColor: alpha('--sg-primary', 7),
    selectedRowBackgroundColor: alpha('--sg-primary', 12),
    rangeSelectionBackgroundColor: alpha('--sg-primary', 14),
    rangeSelectionBorderColor: alpha('--sg-primary', 50),
    accentColor: 'var(--sg-primary)',
    checkboxCheckedBackgroundColor: 'var(--sg-primary)',
    checkboxCheckedBorderColor: 'var(--sg-primary)',
    checkboxUncheckedBackgroundColor: 'var(--sg-card)',
    checkboxUncheckedBorderColor: 'var(--sg-border)',
    toggleButtonOnBackgroundColor: 'var(--sg-primary)',
    toggleButtonOffBackgroundColor: 'var(--sg-muted)',
    menuBackgroundColor: 'var(--sg-popover)',
    menuTextColor: 'var(--sg-popover-foreground)',
    menuBorder: { style: 'solid' as const, width: 1, color: 'var(--sg-border)' },
    tooltipBackgroundColor: 'var(--sg-foreground)',
    tooltipTextColor: 'var(--sg-background)',
    inputBackgroundColor: 'var(--sg-card)',
    inputBorder: { style: 'solid' as const, width: 1, color: 'var(--sg-border)' },
    inputFocusBorder: { style: 'solid' as const, width: 1, color: 'var(--sg-primary)' },
    focusShadow: 'var(--sg-elevation-glow)',
    rowBorder: { style: 'solid' as const, width: 1, color: 'var(--sg-grid-border)' },
    headerRowBorder: true,
    columnBorder: { style: 'solid' as const, width: 1, color: alpha('--sg-grid-border', 60) },
    headerColumnBorder: { style: 'solid' as const, width: 1, color: alpha('--sg-grid-border', 70) },
    headerColumnResizeHandleHeight: '0%',
    wrapperBorder: true,
    sidePanelBorder: true,
    headerFontWeight: 600,
    cellFontFamily: AG_GRID_MONO_FONT,
    cellTextColor: 'var(--sg-foreground)',
    invalidColor: 'var(--sg-destructive)',
  };
}

const LIGHT_CHROME = {
  chromeBackgroundColor:
    'color-mix(in oklch, color-mix(in oklch, var(--sg-card) 97%, var(--sg-primary)) 92%, white)',
  headerBackgroundColor: 'color-mix(in oklch, var(--sg-muted) 56%, white)',
  headerTextColor: 'var(--sg-muted-foreground)',
};

const DARK_CHROME = {
  chromeBackgroundColor: 'var(--sg-popover)',
  headerBackgroundColor: 'var(--sg-muted)',
  headerTextColor: 'var(--sg-secondary-foreground)',
  columnBorder: { style: 'solid' as const, width: 1, color: alpha('--sg-grid-border', 55) },
  headerColumnBorder: { style: 'solid' as const, width: 1, color: alpha('--sg-grid-border', 60) },
  // Dark-mode selected-row tint (overrides the shared `--sg-primary`-based value).
  selectedRowBackgroundColor: alpha('--sg-primary', 15),
};

function gridParams(mode: 'dark' | 'light', density: GridDensity = 'compact') {
  const chrome = mode === 'dark' ? DARK_CHROME : LIGHT_CHROME;
  return {
    browserColorScheme: mode,
    ...gridDensityStructuralParams(density),
    ...sharedColorParams(),
    ...chrome,
  };
}

export const agGridDarkParams = gridParams('dark', 'compact');
export const agGridLightParams = gridParams('light', 'compact');
export const agGridComfortDarkParams = gridParams('dark', 'comfort');
export const agGridComfortLightParams = gridParams('light', 'comfort');
export const agGridBlotterDarkParams = gridParams('dark', 'ultra');
export const agGridBlotterLightParams = gridParams('light', 'ultra');

/** Canonical SmartGrid theme — light + dark modes; toggle via `data-ag-theme-mode` on `<html>`. */
function bakeGridTheme(density: GridDensity = 'compact'): Theme {
  const structural = gridDensityStructuralParams(density);
  const shared = sharedColorParams();
  return themeQuartz
    .withPart(iconSetQuartzLight)
    .withParams(
      {
        browserColorScheme: 'light',
        ...structural,
        ...shared,
        ...LIGHT_CHROME,
      },
      'light',
    )
    .withParams(
      {
        browserColorScheme: 'dark',
        // Mode-specific params don't inherit across modes (AG Grid Theming
        // API), so the structural + shared colour params MUST be repeated in
        // the dark block — otherwise the cell body falls back to Quartz's
        // default grey instead of the design-system `var(--sg-card)`.
        ...structural,
        ...shared,
        ...DARK_CHROME,
      },
      'dark',
    );
}

export const sgGridTheme = bakeGridTheme('compact');

/** @deprecated Use `sgGridTheme` + `data-ag-theme-mode` on `<html>` (set by `applyTheme`). */
export const agGridLightTheme = sgGridTheme;

/** @deprecated Use `sgGridTheme` + `data-ag-theme-mode` on `<html>` (set by `applyTheme`). */
export const agGridDarkTheme = sgGridTheme;

export const agGridComfortDarkTheme = applyGridDensityToTheme(sgGridTheme, 'comfort');
export const agGridComfortLightTheme = applyGridDensityToTheme(sgGridTheme, 'comfort');
export const agGridBlotterDarkTheme = applyGridDensityToTheme(sgGridTheme, 'ultra');
export const agGridBlotterLightTheme = applyGridDensityToTheme(sgGridTheme, 'ultra');
