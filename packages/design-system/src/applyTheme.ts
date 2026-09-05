// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme>, <html data-variant> and
//  <html data-cvd> to match the user's preference and persist to
//  localStorage.
//  Origin: stern-bak packages/design-system/src/applyTheme.ts.
//
//  Apps call applyTheme(getTheme()) once at module scope before
//  ReactDOM.createRoot(...).render(...). This sets the right
//  attribute on <html> BEFORE first paint so there's no FOUC.
//
//  Storage keys:
//    `smartgrid:theme`   — `'dark'` | `'light'` | `'os'` (bare string).
//    `smartgrid:cvd`     — colour-vision-deficiency toggle, `'on'` or absent.
//    `smartgrid:variant` — light-only surface variant: `clinical` | `paper`.
//
//  `'os'` follows `prefers-color-scheme`: the resolved mode is written
//  to `<html data-theme>` (always `dark` | `light`) and re-applied when
//  the OS preference changes; the stored value stays `'os'`.
// ─────────────────────────────────────────────────────────────

/** Persistable mode. `'os'` tracks the operating-system colour scheme. */
export type Mode = 'dark' | 'light' | 'os';
/** What actually lands on `<html data-theme>`. */
export type ResolvedMode = 'dark' | 'light';
export type LightVariant = 'clinical' | 'paper';

export interface ThemeOptions {
  theme: Mode;
  cvd?: boolean;
  /** Light-mode surface variant. Ignored while the resolved mode is `dark`. Default: `clinical`. */
  variant?: LightVariant;
}

export const THEME_STORAGE_KEY = 'smartgrid:theme';
export const CVD_STORAGE_KEY = 'smartgrid:cvd';
export const VARIANT_STORAGE_KEY = 'smartgrid:variant';

const OS_DARK_QUERY = '(prefers-color-scheme: dark)';

function osMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(OS_DARK_QUERY);
  } catch {
    return null;
  }
}

/** Current OS colour scheme; `dark` when `matchMedia` is unavailable (the design-system default). */
export function getOsMode(): ResolvedMode {
  const mq = osMediaQuery();
  if (!mq) return 'dark';
  return mq.matches ? 'dark' : 'light';
}

/** Resolve a persistable mode to what `<html data-theme>` receives. */
export function resolveMode(mode: Mode): ResolvedMode {
  return mode === 'os' ? getOsMode() : mode;
}

function applyVariant(variant: LightVariant | undefined, resolved: ResolvedMode): void {
  if (resolved === 'dark') {
    document.documentElement.removeAttribute('data-variant');
    return;
  }
  document.documentElement.setAttribute('data-variant', variant ?? 'clinical');
}

function paint(resolved: ResolvedMode, opts: ThemeOptions): void {
  document.documentElement.setAttribute('data-theme', resolved);
  // AG Grid v33+ theme modes read `data-ag-theme-mode` (see adapters/agGrid.ts).
  document.documentElement.setAttribute('data-ag-theme-mode', resolved);
  applyVariant(opts.variant, resolved);
  if (opts.cvd) {
    document.documentElement.setAttribute('data-cvd', 'on');
  } else {
    document.documentElement.removeAttribute('data-cvd');
  }
}

let osSubscription: (() => void) | null = null;
let current: ThemeOptions | null = null;

function subscribeToOs(): void {
  if (osSubscription) return;
  const mq = osMediaQuery();
  if (!mq) return;
  const handler = () => {
    if (current?.theme === 'os') paint(getOsMode(), current);
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    osSubscription = () => mq.removeEventListener('change', handler);
  } else {
    const legacy = mq as MediaQueryList & {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(handler);
    osSubscription = () => legacy.removeListener?.(handler);
  }
}

function unsubscribeFromOs(): void {
  osSubscription?.();
  osSubscription = null;
}

export function applyTheme(opts: ThemeOptions): void {
  if (typeof document === 'undefined') return;
  current = { ...opts };
  const resolved = resolveMode(opts.theme);
  paint(resolved, opts);
  if (opts.theme === 'os') subscribeToOs();
  else unsubscribeFromOs();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, opts.theme);
      if (opts.cvd) {
        localStorage.setItem(CVD_STORAGE_KEY, 'on');
      } else {
        localStorage.removeItem(CVD_STORAGE_KEY);
      }
      if (opts.theme === 'dark') {
        localStorage.removeItem(VARIANT_STORAGE_KEY);
      } else {
        localStorage.setItem(VARIANT_STORAGE_KEY, opts.variant ?? 'clinical');
      }
    } catch {
      /* private mode / quota */
    }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') return { theme: 'dark' };
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    const cvd = localStorage.getItem(CVD_STORAGE_KEY) === 'on';
    const variantRaw = localStorage.getItem(VARIANT_STORAGE_KEY);
    const variant: LightVariant | undefined =
      variantRaw === 'paper' ? 'paper' : variantRaw === 'clinical' ? 'clinical' : undefined;

    if (theme === 'dark' || theme === 'light' || theme === 'os') {
      const base: ThemeOptions = cvd ? { theme, cvd: true } : { theme };
      if (theme !== 'dark') {
        return { ...base, variant: variant ?? 'clinical' };
      }
      return base;
    }
    return { theme: 'dark' };
  } catch {
    return { theme: 'dark' };
  }
}

/** The mode currently painted on `<html data-theme>` (falls back to resolving the persisted mode). */
export function getResolvedTheme(): ResolvedMode {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
  }
  return resolveMode(getTheme().theme);
}

/**
 * Subscribe to OS colour-scheme changes. The callback receives the new
 * resolved mode; returns a disposer. Independent of `applyTheme` so UI
 * layers (e.g. a ThemeProvider) can mirror the resolved mode in state.
 */
export function onOsThemeChange(cb: (mode: ResolvedMode) => void): () => void {
  const mq = osMediaQuery();
  if (!mq) return () => {};
  const handler = () => cb(getOsMode());
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  const legacy = mq as MediaQueryList & {
    addListener?: (cb: () => void) => void;
    removeListener?: (cb: () => void) => void;
  };
  legacy.addListener?.(handler);
  return () => legacy.removeListener?.(handler);
}
