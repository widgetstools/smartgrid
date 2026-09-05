# @smartgrid/design-system

Framework-agnostic design system for SmartGrid: OKLCH tokens in a single `--sg-*` CSS
variable namespace, light / dark / OS-following themes (plus a light "paper" variant and a
colour-vision-deficiency mode), `applyTheme`, the AG Grid Quartz adapter with density
presets, 24 vanilla-TS cell renderers and 113 market icons.

Ported from `stern-bak/packages/design-system` (StarUI). The six legacy alias
layers (st, ds, bn, fi, p, ck prefixes), the Tailwind 3 preset, the PrimeNG preset and the
second shadcn copy were dropped.

## Entry points

| Import | Contents |
| --- | --- |
| `@smartgrid/design-system` | tokens (`primitives`, `dark`, `light`, `lightPaper`, `sgHex`, `componentTokens`, `controls`), `applyTheme` / `getTheme`, cell renderer classes + registry, icon names/metadata |
| `@smartgrid/design-system/css` | the stylesheet — import once (see below) |
| `@smartgrid/design-system/css/<layer>.css` | `tokens`, `shadcn`, `tailwind-theme`, `base`, `scrollbar`, `ag-grid` individually |
| `@smartgrid/design-system/ag-grid` | `sgGridTheme`, `agGrid*Params`, `GridDensity`, `applyGridDensityToTheme`, `resolveGridDensity` |
| `@smartgrid/design-system/cell-renderers` | renderer classes + `cellRendererComponents` / catalogue |
| `@smartgrid/design-system/icons` | every SVG as a string constant (`bondSvg`, …), the `icons` record, `svgToDataUrl`, `ICON_META` … |
| `@smartgrid/design-system/icons/svg/*.svg` | raw SVG files for bundler asset imports |
| `@smartgrid/design-system/react` | `<DynamicIcon>` — the only React-dependent entry (`react` + `lucide-react` are optional peers) |
| `@smartgrid/design-system/tokens.json` | design-token JSON (OKLCH components) for tooling |

## CSS

```css
/* app.css */
@import 'tailwindcss';                       /* optional — Tailwind 4 consumers */
@import '@smartgrid/design-system/css';      /* tokens → shadcn aliases → @theme → base → scrollbar → AG Grid */
```

Layer order inside `css/index.css`:

1. `tokens.css` — every source token as `--sg-*` on `:root` (light), `[data-theme="dark"]`,
   `[data-theme="light"][data-variant="paper"]` and `[data-cvd="on"]`, followed by the derived
   semantic aliases (`--sg-surface-*`, `--sg-text-*`, `--sg-accent-*`, `--sg-overlay-*`,
   `--sg-state-*`, `--sg-elevation-*`, `--sg-trade-*`, `--sg-control-*`). Colours are complete
   values (`oklch(...)`); use `color-mix(in oklch, var(--sg-primary) 12%, transparent)` for alpha.
2. `shadcn.css` — `--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--muted`,
   `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--chart-*`,
   `--sidebar-*`, each a `var(--sg-…)` alias.
3. `tailwind-theme.css` — a Tailwind 4 `@theme inline` block so `bg-background`,
   `text-muted-foreground`, `border-border`, `ring-ring`, `bg-buy`, `text-positive`, `rounded-md`,
   `font-mono`, `text-2xs`, `h-control`, `size-control-sm`, `shadow-card`, `shadow-overlay` all
   resolve; plus a `dark` variant keyed on `[data-theme="dark"]`. Harmless for non-Tailwind users.
4. `base.css` — border/outline defaults, html/body colours + fonts, form-control inheritance,
   `.sg-mono`.
5. `scrollbar.css` — theme-aware scrollbars everywhere except AG Grid, `.sg-scrollbar`,
   `.scrollbar-themed`, `.scrollbar-thin`.
6. `ag-grid.css` — header typography and floating-filter chrome.

Fonts are not bundled: load Inter and JetBrains Mono yourself.

## Theme

```ts
import { applyTheme, getTheme } from '@smartgrid/design-system';

applyTheme(getTheme());                          // before the first render — no FOUC
applyTheme({ theme: 'os' });                     // follow prefers-color-scheme, live
applyTheme({ theme: 'light', variant: 'paper' }); // warm light variant
applyTheme({ theme: 'dark', cvd: true });        // blue/orange buy-sell
```

`theme` is `'dark' | 'light' | 'os'`. The resolved mode is written to `<html data-theme>` and
`<html data-ag-theme-mode>`; `'os'` is persisted as-is and re-resolved on OS changes.
Storage keys: `smartgrid:theme`, `smartgrid:cvd`, `smartgrid:variant`.

## AG Grid

```ts
import { sgGridTheme, applyGridDensityToTheme, resolveGridDensity } from '@smartgrid/design-system/ag-grid';
import { cellRendererComponents } from '@smartgrid/design-system/cell-renderers';

<AgGridReact theme={applyGridDensityToTheme(sgGridTheme, resolveGridDensity(settings))}
             components={cellRendererComponents} />
```

The theme reads `--sg-*` variables live, so it repaints on theme flips without a rebuild.
Requires `ag-grid-community` ^36.1.0 (peer).

## Scripts

- `npm run build` — `rimraf dist && tsc -b && node scripts/copy-css.mjs`
- `npm run typecheck` — `tsc -p tsconfig.json --noEmit`
- `npm run test` — Vitest (jsdom)
- `npm run check:tokens` — fails on hard-coded hex outside `src/tokens/`, on
  legacy-prefix (st, ds, bn, fi, p, ck) references, and on any non-`--sg-` custom property
  defined in a stylesheet (except `shadcn.css` / `tailwind-theme.css`)
- `npm run generate:icons` / `check:icons` — regenerate / verify `src/icons/allIcons.ts` from `src/icons/svg/*.svg`
