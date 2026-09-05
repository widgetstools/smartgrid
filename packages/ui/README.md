# @smartgrid/ui

The SmartGrid React component kit: 52 shadcn/Radix components (single copy), a
`ThemeProvider` bound to `@smartgrid/design-system`'s `applyTheme` (`light | dark | os`), the
`PortalContainerProvider` for popped-out windows, and the trading chrome components
`CollapsibleToolbar`, `ToolbarContainer` and `VirtualizedList`.

Ported from `stern-bak/packages/react-core/ui` (`@wellsfargo-starui/react`). Tailwind CSS 4
(CSS-first `@theme`, no `tailwind.config.js`) with `tw-animate-css` replacing
`tailwindcss-animate`; `next-themes` is gone.

## Setup

```css
/* src/app.css */
@import '@smartgrid/ui/styles.css';          /* tailwindcss + design-system css + tw-animate-css */
@source '../node_modules/@smartgrid/ui';      /* let Tailwind scan the component classes */
```

`@smartgrid/ui/styles.css` is just:

```css
@import 'tailwindcss';
@import '@smartgrid/design-system/css';
@import 'tw-animate-css';
```

so if the app already imports Tailwind, import the two other files instead. No `@source`
directives ship in the package — add the one above (path relative to your CSS file) in the
consuming app. Peer requirements: `react` / `react-dom` ^19.2, `tailwindcss` ^4.3,
`tw-animate-css` ^1.4 (optional if you don't need enter/exit animations), `recharts` ^3.10 only
for `@smartgrid/ui/chart`.

```tsx
import { ThemeProvider, Button, Dialog } from '@smartgrid/ui';
import { ChartContainer } from '@smartgrid/ui/chart'; // recharts — kept out of the main barrel

<ThemeProvider defaultTheme="os">
  <App />
</ThemeProvider>;
```

`useTheme()` returns `{ theme, resolvedTheme, cvd, variant, setTheme, setCvd, setVariant,
toggleTheme }`. Preferences persist under `smartgrid:theme|cvd|variant`; pass
`ignorePersisted` to always start from the defaults.

## Animations

`tailwindcss-animate` class names carry over unchanged to `tw-animate-css` (`animate-in`,
`animate-out`, `fade-in-0`, `zoom-in-95`, `slide-in-from-top-2`, `slide-out-to-right-full`,
`animate-accordion-down`, `animate-caret-blink`, `duration-*`, `fill-mode-*`). The only
requirement is the `@import 'tw-animate-css';` above.

## Scripts

- `npm run build` — `rimraf dist && tsc -b`
- `npm run typecheck` — `tsc -p tsconfig.json --noEmit`
- `npm run test` — Vitest + jsdom + Testing Library (setup in `src/test/setup.ts`)
- `npm run check:tokens` — design-system token policy over `src/` (chart.tsx's recharts
  `[stroke='#ccc']` selectors are allow-listed)
