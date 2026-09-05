// Origin: stern-bak packages/design-system/tests/adapters/agGrid.test.ts
// (snapshot assertion dropped; token references asserted instead).
import { describe, it, expect } from 'vitest';
import {
  agGridDarkParams,
  agGridLightParams,
  agGridComfortDarkParams,
  agGridComfortLightParams,
  agGridBlotterDarkParams,
  agGridBlotterLightParams,
  gridDensityStructuralParams,
  inferGridDensity,
  resolveGridDensity,
  applyGridDensityToTheme,
  sgGridTheme,
} from './agGrid';

describe('agGrid params', () => {
  it('defines backgroundColor from the --sg-card token', () => {
    expect(agGridDarkParams.backgroundColor).toBe('var(--sg-card)');
    expect(agGridLightParams.backgroundColor).toBe('var(--sg-card)');
  });

  it('dark and light differ in header chrome and browserColorScheme', () => {
    expect(agGridDarkParams.headerBackgroundColor).not.toBe(agGridLightParams.headerBackgroundColor);
    expect(agGridDarkParams.browserColorScheme).toBe('dark');
    expect(agGridLightParams.browserColorScheme).toBe('light');
  });

  it('blotter and comfort variants exist', () => {
    expect(agGridBlotterDarkParams).toBeDefined();
    expect(agGridBlotterLightParams).toBeDefined();
    expect(agGridComfortDarkParams).toBeDefined();
    expect(agGridComfortLightParams).toBeDefined();
  });

  it('grid density presets map to distinct row/header heights and spacing', () => {
    const ultra = gridDensityStructuralParams('ultra');
    const compact = gridDensityStructuralParams('compact');
    const comfort = gridDensityStructuralParams('comfort');
    expect(ultra.rowHeight).toBe(22);
    expect(compact.rowHeight).toBe(30);
    expect(comfort.rowHeight).toBe(40);
    expect(ultra.spacing).toBeLessThan(compact.spacing);
    expect(compact.spacing).toBeLessThan(comfort.spacing);
    expect(ultra.fontSize).toBeLessThan(compact.fontSize);
    expect(compact.fontSize).toBeLessThan(comfort.fontSize);
    expect(ultra.iconSize).toBeLessThan(compact.iconSize);
  });

  it('inferGridDensity resolves from persisted heights', () => {
    expect(inferGridDensity(22, 26)).toBe('ultra');
    expect(inferGridDensity(30, 32)).toBe('compact');
    expect(inferGridDensity(999, 999)).toBe('compact');
    expect(resolveGridDensity({ gridDensity: 'comfort' })).toBe('comfort');
    expect(resolveGridDensity({ rowHeight: 40, headerHeight: 42 })).toBe('comfort');
    expect(resolveGridDensity(null)).toBe('compact');
  });

  it('only references --sg-* custom properties (no legacy namespaces, no hex)', () => {
    const json = JSON.stringify({
      dark: agGridDarkParams,
      light: agGridLightParams,
      comfortDark: agGridComfortDarkParams,
      blotterLight: agGridBlotterLightParams,
    });
    expect(json).not.toMatch(/--(?:ds|st|bn|fi|p|ck)-/);
    expect(json).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(json).toContain('var(--sg-primary)');
  });

  it('applyGridDensityToTheme memoises per theme + density', () => {
    const a = applyGridDensityToTheme(sgGridTheme, 'comfort');
    const b = applyGridDensityToTheme(sgGridTheme, 'comfort');
    expect(a).toBe(b);
    expect(applyGridDensityToTheme(sgGridTheme, 'ultra')).not.toBe(a);
  });
});
