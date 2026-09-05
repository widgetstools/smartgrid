/**
 * ThemeProvider — React binding over `applyTheme` from @smartgrid/design-system.
 * Origin: stern-bak packages/react-core/ui/src/providers/ThemeProvider.tsx,
 * which wrapped `next-themes`; rewritten so the design system owns the
 * `<html data-theme>` attribute, persistence and OS tracking.
 *
 * Modes: `'light' | 'dark' | 'os'` (`'os'` follows `prefers-color-scheme`
 * and is persisted as-is). `resolvedTheme` is always `'light' | 'dark'`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  getTheme,
  onOsThemeChange,
  resolveMode,
  type LightVariant,
  type ResolvedMode,
  type ThemeOptions,
} from '@smartgrid/design-system';

export type Theme = 'light' | 'dark' | 'os';

export interface ThemeContextValue {
  /** Persistable mode. */
  theme: Theme;
  /** What is painted on `<html data-theme>`. */
  resolvedTheme: ResolvedMode;
  cvd: boolean;
  variant: LightVariant;
  setTheme: (theme: Theme) => void;
  setCvd: (cvd: boolean) => void;
  setVariant: (variant: LightVariant) => void;
  /** Cycle light → dark → os → light. */
  toggleTheme: () => void;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Used when nothing is persisted yet. Default `'dark'`. */
  defaultTheme?: Theme;
  defaultCvd?: boolean;
  defaultVariant?: LightVariant;
  /**
   * Ignore persisted preferences and always start from the defaults
   * (useful for embedded / preview surfaces). Default `false`.
   */
  ignorePersisted?: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_ORDER: Theme[] = ['light', 'dark', 'os'];

function initialOptions(props: ThemeProviderProps): ThemeOptions {
  const fallback: ThemeOptions = {
    theme: props.defaultTheme ?? 'dark',
    cvd: props.defaultCvd ?? false,
    variant: props.defaultVariant ?? 'clinical',
  };
  if (props.ignorePersisted || typeof localStorage === 'undefined') return fallback;
  try {
    if (localStorage.getItem('smartgrid:theme') === null) return fallback;
  } catch {
    return fallback;
  }
  const persisted = getTheme();
  return {
    theme: persisted.theme,
    cvd: persisted.cvd ?? false,
    variant: persisted.variant ?? fallback.variant,
  };
}

export function ThemeProvider(props: ThemeProviderProps) {
  const { children } = props;
  const [opts, setOpts] = useState<ThemeOptions>(() => initialOptions(props));
  // OS preference, tracked only so `resolvedTheme` re-derives while in `os` mode.
  const [osMode, setOsMode] = useState<ResolvedMode>(() => resolveMode('os'));
  const resolvedTheme: ResolvedMode = opts.theme === 'os' ? osMode : resolveMode(opts.theme);

  // Paint + persist whenever the options change.
  useEffect(() => {
    applyTheme(opts);
  }, [opts]);

  // Mirror OS changes into state while in `os` mode (applyTheme repaints on its own).
  useEffect(() => {
    if (opts.theme !== 'os') return;
    return onOsThemeChange((mode) => setOsMode(mode));
  }, [opts.theme]);

  const setTheme = useCallback((theme: Theme) => setOpts((o) => ({ ...o, theme })), []);
  const setCvd = useCallback((cvd: boolean) => setOpts((o) => ({ ...o, cvd })), []);
  const setVariant = useCallback((variant: LightVariant) => setOpts((o) => ({ ...o, variant })), []);
  const toggleTheme = useCallback(
    () =>
      setOpts((o) => {
        const idx = THEME_ORDER.indexOf(o.theme);
        return { ...o, theme: THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? 'light' };
      }),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: opts.theme,
      resolvedTheme,
      cvd: opts.cvd ?? false,
      variant: opts.variant ?? 'clinical',
      setTheme,
      setCvd,
      setVariant,
      toggleTheme,
    }),
    [opts, resolvedTheme, setTheme, setCvd, setVariant, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const noop = () => {};

/**
 * Read the active theme. Outside a <ThemeProvider> this returns a read-only
 * view of whatever `applyTheme` last painted, so leaf components (e.g. the
 * Sonner toaster) still get a sensible mode.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  const persisted = getTheme();
  return {
    theme: persisted.theme,
    resolvedTheme: resolveMode(persisted.theme),
    cvd: persisted.cvd ?? false,
    variant: persisted.variant ?? 'clinical',
    setTheme: noop,
    setCvd: noop,
    setVariant: noop,
    toggleTheme: noop,
  };
}
