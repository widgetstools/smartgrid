// Origin: stern-bak packages/design-system/tests/applyTheme.test.ts
// (storage keys renamed, legacy-blob migration dropped, `'os'` mode added).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getResolvedTheme, getTheme, onOsThemeChange, resolveMode } from './applyTheme';

type Listener = () => void;

function installMatchMedia(matchesDark: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: matchesDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_type: string, cb: Listener) => listeners.delete(cb),
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => false,
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mql),
  });
  return {
    flip(toDark: boolean) {
      mql.matches = toDark;
      for (const cb of listeners) cb();
    },
    listenerCount: () => listeners.size,
  };
}

const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute('data-theme');
  html().removeAttribute('data-variant');
  html().removeAttribute('data-cvd');
  html().removeAttribute('data-ag-theme-mode');
});

afterEach(() => {
  // Leave the module in a non-OS state so subscriptions never leak across tests.
  applyTheme({ theme: 'dark' });
});

describe('applyTheme', () => {
  it('sets data-theme="dark" on <html>', () => {
    applyTheme({ theme: 'dark' });
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().getAttribute('data-ag-theme-mode')).toBe('dark');
  });

  it('sets data-theme="light" on <html>', () => {
    applyTheme({ theme: 'light' });
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-ag-theme-mode')).toBe('light');
  });

  it('sets data-cvd="on" when cvd: true and removes it when false', () => {
    applyTheme({ theme: 'dark', cvd: true });
    expect(html().getAttribute('data-cvd')).toBe('on');
    applyTheme({ theme: 'dark', cvd: false });
    expect(html().hasAttribute('data-cvd')).toBe(false);
  });

  it('persists theme under "smartgrid:theme" as a bare string and cvd under "smartgrid:cvd"', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem('smartgrid:theme')).toBe('light');
    expect(localStorage.getItem('smartgrid:cvd')).toBe('on');
  });

  it('clears "smartgrid:cvd" when cvd is false', () => {
    applyTheme({ theme: 'light', cvd: true });
    applyTheme({ theme: 'light', cvd: false });
    expect(localStorage.getItem('smartgrid:cvd')).toBeNull();
  });

  it('getTheme reads back theme + cvd from canonical keys', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(getTheme()).toEqual({ theme: 'light', cvd: true, variant: 'clinical' });
  });

  it('getTheme omits cvd when not persisted', () => {
    applyTheme({ theme: 'light', cvd: false });
    expect(getTheme()).toEqual({ theme: 'light', variant: 'clinical' });
  });

  it('sets data-variant="clinical" on light by default', () => {
    applyTheme({ theme: 'light' });
    expect(html().getAttribute('data-variant')).toBe('clinical');
  });

  it('sets data-variant="paper" when variant: paper', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    expect(html().getAttribute('data-variant')).toBe('paper');
    expect(localStorage.getItem('smartgrid:variant')).toBe('paper');
  });

  it('removes data-variant on dark theme', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    applyTheme({ theme: 'dark' });
    expect(html().hasAttribute('data-variant')).toBe(false);
    expect(localStorage.getItem('smartgrid:variant')).toBeNull();
  });

  it('getTheme reads back variant for light', () => {
    applyTheme({ theme: 'light', variant: 'paper' });
    expect(getTheme()).toEqual({ theme: 'light', variant: 'paper' });
  });

  it('getTheme returns dark default when nothing persisted', () => {
    expect(getTheme()).toEqual({ theme: 'dark' });
  });

  it('ignores legacy storage keys entirely', () => {
    localStorage.setItem('legacy:theme', 'light');
    localStorage.setItem('@legacy/theme', JSON.stringify({ theme: 'light' }));
    expect(getTheme()).toEqual({ theme: 'dark' });
  });
});

describe("applyTheme({ theme: 'os' })", () => {
  it('resolves to the OS scheme on <html> but persists "os"', () => {
    installMatchMedia(false);
    applyTheme({ theme: 'os' });
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-variant')).toBe('clinical');
    expect(localStorage.getItem('smartgrid:theme')).toBe('os');
    expect(getTheme()).toEqual({ theme: 'os', variant: 'clinical' });
  });

  it('follows prefers-color-scheme changes while in os mode', () => {
    const mm = installMatchMedia(false);
    applyTheme({ theme: 'os', variant: 'paper' });
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-variant')).toBe('paper');

    mm.flip(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(html().getAttribute('data-ag-theme-mode')).toBe('dark');
    expect(html().hasAttribute('data-variant')).toBe(false);

    mm.flip(false);
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-variant')).toBe('paper');
  });

  it('stops following the OS once an explicit mode is applied', () => {
    const mm = installMatchMedia(true);
    applyTheme({ theme: 'os' });
    expect(mm.listenerCount()).toBe(1);
    applyTheme({ theme: 'light' });
    expect(mm.listenerCount()).toBe(0);
    mm.flip(true);
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('resolveMode / getResolvedTheme report the painted mode', () => {
    installMatchMedia(true);
    expect(resolveMode('os')).toBe('dark');
    expect(resolveMode('light')).toBe('light');
    applyTheme({ theme: 'os' });
    expect(getResolvedTheme()).toBe('dark');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
    applyTheme({ theme: 'os' });
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('onOsThemeChange notifies subscribers and disposes cleanly', () => {
    const mm = installMatchMedia(false);
    const seen: string[] = [];
    const off = onOsThemeChange((m) => seen.push(m));
    mm.flip(true);
    mm.flip(false);
    off();
    mm.flip(true);
    expect(seen).toEqual(['dark', 'light']);
  });
});
