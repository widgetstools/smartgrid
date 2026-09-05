import { describe, expect, it } from 'vitest';
import { buildAgGridFromSgHex, buildShadcnFromSgHex, sgHex } from './staruiHex';

describe('sgHex', () => {
  it('exports dark palette', () => {
    expect(sgHex.dark.bg).toBe('#0b0d10');
    expect(sgHex.dark.accent).toBe('#22d3ee');
  });

  it('exports lightClinical palette', () => {
    expect(sgHex.lightClinical.bg).toBe('#f4f6f8');
    expect(sgHex.lightClinical.accent).toBe('#0891b2');
  });

  it('exports lightPaper palette', () => {
    expect(sgHex.lightPaper.bg).toBe('#efede9');
    expect(sgHex.lightPaper.accent).toBe('#0e7490');
  });
});

describe('buildShadcnFromSgHex', () => {
  it('builds shadcn palette from each hex pack', () => {
    for (const pack of [sgHex.dark, sgHex.lightClinical, sgHex.lightPaper]) {
      const result = buildShadcnFromSgHex(pack);
      expect(result.background).toBeDefined();
      expect(result.primary).toBeDefined();
      expect(result.chart5).toBeDefined();
    }
  });

  it('includes all required shadcn tokens for dark pack', () => {
    const result = buildShadcnFromSgHex(sgHex.dark);
    const requiredTokens = [
      'background',
      'foreground',
      'card',
      'cardForeground',
      'popover',
      'popoverForeground',
      'primary',
      'primaryForeground',
      'secondary',
      'secondaryForeground',
      'muted',
      'mutedForeground',
      'accent',
      'accentForeground',
      'destructive',
      'destructiveForeground',
      'border',
      'input',
      'ring',
      'sidebarBackground',
      'sidebarForeground',
      'sidebarPrimary',
      'sidebarPrimaryForeground',
      'sidebarAccent',
      'sidebarAccentForeground',
      'sidebarBorder',
      'sidebarRing',
      'chart1',
      'chart2',
      'chart3',
      'chart4',
      'chart5',
    ] as const;
    for (const token of requiredTokens) {
      expect(result[token]).toBeDefined();
    }
  });
});

describe('buildAgGridFromSgHex', () => {
  it('uses dark odd-row tint when mode is dark', () => {
    const result = buildAgGridFromSgHex(sgHex.dark, 'dark');
    expect(result.odd).toBe('rgba(255,255,255,0.012)');
    expect(result.bg).toBe(sgHex.dark.bg1);
    expect(result.fg).toBe(sgHex.dark.t0);
  });

  it('uses light odd-row tint when mode is light', () => {
    const result = buildAgGridFromSgHex(sgHex.lightClinical, 'light');
    expect(result.odd).toBe('rgba(0,0,0,0.014)');
    expect(result.bg).toBe(sgHex.lightClinical.bg1);
  });

  it('maps all ag-grid tokens for lightPaper in light mode', () => {
    const result = buildAgGridFromSgHex(sgHex.lightPaper, 'light');
    expect(result.inputBg).toBe(sgHex.lightPaper.bg);
    expect(result.tooltip).toBe(sgHex.lightPaper.bg3);
    expect(result.toggleOff).toBe(sgHex.lightPaper.bg3);
  });

  it('includes all required aggrid tokens', () => {
    const result = buildAgGridFromSgHex(sgHex.dark, 'dark');
    const requiredTokens = [
      'bg',
      'fg',
      'chrome',
      'header',
      'headerText',
      'odd',
      'hover',
      'sel',
      'border',
      'rowBorder',
      'accent',
      'accentSoft',
      'inputBg',
      'inputBorder',
      'inputFocus',
      'menu',
      'menuText',
      'menuBorder',
      'tooltip',
      'tooltipText',
      'toggleOff',
    ] as const;
    for (const token of requiredTokens) {
      expect(result[token]).toBeDefined();
    }
  });
});
