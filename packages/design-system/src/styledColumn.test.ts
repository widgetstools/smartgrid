import { describe, expect, it } from 'vitest';
import {
  barSpan,
  contrastText,
  flagEmoji,
  gradientColor,
  markerPath,
  normaliseSeries,
  percentOf,
  quantizeRating,
  rangeFor,
  resolveIcon,
  resolveOrigin,
  resolveRanges,
  resolveThemeColor,
  rowKindAllowed,
  sparklineLayout,
  sparklinePath,
  styleToInline,
  withAlpha,
  zeroCentredColor,
  type IconStyle,
  type ResolvedRange,
} from './styledColumn';

const range = (
  min: number,
  max: number,
  color = 'red',
  extra: Partial<ResolvedRange> = {},
): ResolvedRange => ({
  min,
  max,
  color,
  ...extra,
});

describe('theme + scope', () => {
  it('resolves plain and themed colours', () => {
    expect(resolveThemeColor('red', 'dark')).toBe('red');
    expect(resolveThemeColor({ light: 'a', dark: 'b' }, 'dark')).toBe('b');
    expect(resolveThemeColor(undefined, 'light')).toBeUndefined();
  });

  it('applies row scope exclusions by kind', () => {
    const scope = {
      excludeDataRows: false,
      excludeGroupRows: true,
      excludeSummaryRows: false,
      excludeTotalRows: true,
    };
    expect(rowKindAllowed(undefined, { isGroup: true, isSummary: false, isTotal: false })).toBe(true);
    expect(rowKindAllowed(scope, { isGroup: true, isSummary: false, isTotal: false })).toBe(false);
    expect(rowKindAllowed(scope, { isGroup: false, isSummary: true, isTotal: false })).toBe(true);
    expect(rowKindAllowed(scope, { isGroup: false, isSummary: false, isTotal: true })).toBe(false);
    expect(rowKindAllowed(scope, { isGroup: false, isSummary: false, isTotal: false })).toBe(true);
  });
});

describe('percentOf / origins', () => {
  it('clamps to the range', () => {
    expect(percentOf(50, 0, 100)).toBe(0.5);
    expect(percentOf(-10, 0, 100)).toBe(0);
    expect(percentOf(500, 0, 100)).toBe(1);
    expect(percentOf(5, 5, 5)).toBe(0);
  });

  it('resolves origins', () => {
    expect(resolveOrigin('auto', -50, 50)).toBe(0);
    expect(resolveOrigin('auto', 10, 50)).toBe(10);
    expect(resolveOrigin('zero', 10, 50)).toBe(10);
    expect(resolveOrigin('min', -50, 50)).toBe(-50);
    expect(resolveOrigin(25, 0, 50)).toBe(25);
  });

  it('spans from the origin to the value in either direction', () => {
    expect(barSpan(25, -50, 50, 'auto')).toEqual({ from: 0.5, to: 0.75 });
    expect(barSpan(-25, -50, 50, 'auto')).toEqual({ from: 0.25, to: 0.5 });
    expect(barSpan(25, 0, 100, 'min')).toEqual({ from: 0, to: 0.25 });
  });
});

describe('gradient colours', () => {
  it('interpolates alpha across the containing range', () => {
    const ranges = [range(0, 100, 'var(--sg-positive)')];
    expect(gradientColor(0, ranges, 0.2, 1)).toBe('color-mix(in srgb, var(--sg-positive) 20%, transparent)');
    expect(gradientColor(50, ranges, 0.2, 1)).toBe('color-mix(in srgb, var(--sg-positive) 60%, transparent)');
    expect(gradientColor(100, ranges, 0.2, 1)).toBe('var(--sg-positive)');
    expect(gradientColor(101, ranges)).toBeUndefined();
  });

  it('reverses and honours per-range alpha', () => {
    const ranges = [range(0, 100, 'blue', { reverseGradient: true, minAlpha: 0.5, maxAlpha: 0.9 })];
    expect(gradientColor(0, ranges)).toBe('color-mix(in srgb, blue 90%, transparent)');
    expect(gradientColor(100, ranges)).toBe('color-mix(in srgb, blue 50%, transparent)');
  });

  it('picks colour by sign and alpha by magnitude when zero-centred', () => {
    expect(zeroCentredColor(-50, 'neg', 'pos', 100, 0, 1)).toBe('color-mix(in srgb, neg 50%, transparent)');
    expect(zeroCentredColor(100, 'neg', 'pos', 100, 0, 1)).toBe('pos');
    expect(zeroCentredColor(0, 'neg', 'pos', 100)).toBeUndefined();
  });

  it('resolves ranges through endpoints, including percentage mode', () => {
    const resolve = (e: unknown) =>
      e === 'Col-Min' ? 0 : e === 'Col-Max' ? 200 : typeof e === 'number' ? e : undefined;
    const resolved = resolveRanges(
      [
        { min: 'Col-Min', max: 50, color: { light: 'l', dark: 'd' }, reverseGradient: false },
        { min: 50, max: 'Col-Max', color: 'c', reverseGradient: false },
        { min: { columnId: 'x' }, max: 1, color: 'c', reverseGradient: false },
      ],
      resolve as never,
      'dark',
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ min: 0, max: 50, color: 'd' });
    const pct = resolveRanges(
      [{ min: 25, max: 75, color: 'c', reverseGradient: false }],
      resolve as never,
      'light',
      'percentage',
    );
    expect(pct[0]).toMatchObject({ min: 50, max: 150 });
    expect(rangeFor(300, resolved)?.max).toBe(200);
    expect(rangeFor(-1, resolved)?.min).toBe(0);
  });

  it('withAlpha passes full-alpha colours through', () => {
    expect(withAlpha('red', 1)).toBe('red');
    expect(withAlpha('red', 0.333)).toBe('color-mix(in srgb, red 33.3%, transparent)');
  });
});

describe('contrastText', () => {
  it('reads hex, rgb and color-mix backgrounds', () => {
    expect(contrastText('#000')).toBe('white');
    expect(contrastText('#ffffff')).toBe('black');
    expect(contrastText('rgb(255, 255, 0)')).toBe('black');
    expect(contrastText('rgba(0, 0, 128, 0.9)')).toBe('white');
    expect(contrastText('color-mix(in srgb, #000000 80%, transparent)')).toBe('white');
  });

  it('gives up on tokens and translucent colours', () => {
    expect(contrastText('var(--sg-positive)')).toBeUndefined();
    expect(contrastText('color-mix(in srgb, #000 20%, transparent)')).toBeUndefined();
    expect(contrastText(undefined)).toBeUndefined();
  });
});

describe('rating + markers', () => {
  it('quantizes to halves or wholes within range', () => {
    expect(quantizeRating(3.3, 5, true)).toBe(3.5);
    expect(quantizeRating(3.3, 5, false)).toBe(3);
    expect(quantizeRating(9, 5, true)).toBe(5);
    expect(quantizeRating(-1, 5, true)).toBe(0);
  });

  it('builds centred marker paths', () => {
    expect(markerPath('diamond', 8)).toBe('M0,-4L4,0L0,4L-4,0Z');
    expect(markerPath('square', 4)).toBe('M-2,-2h4v4h-4Z');
    expect(markerPath('line', 10)).toBe('M0,-5L0,5');
    expect(markerPath('circle', 6)).toContain('a3,3');
    expect(markerPath('triangle', 6)).toBe('M0,-3L3,3L-3,3Z');
  });
});

describe('sparklines', () => {
  it('normalises numbers, tuples and objects', () => {
    expect(normaliseSeries([1, '2', null, 'x', 3])).toEqual([1, 2, 3]);
    expect(
      normaliseSeries([
        [0, 5],
        [1, 7],
      ]),
    ).toEqual([5, 7]);
    expect(normaliseSeries([{ x: 0, y: 5 }, { y: 6 }, { value: 7 }])).toEqual([5, 6, 7]);
    expect(normaliseSeries('nope')).toEqual([]);
  });

  it('lays out points top-to-bottom with a zero line when the series crosses zero', () => {
    const l = sparklineLayout([-10, 0, 10], 100, 20);
    expect(l.points).toEqual([
      { x: 0, y: 20 },
      { x: 50, y: 10 },
      { x: 100, y: 0 },
    ]);
    expect(l.zeroY).toBe(10);
    expect(sparklineLayout([1, 2], 100, 20).zeroY).toBeUndefined();
  });

  it('emits line, area and bar path shapes', () => {
    expect(sparklinePath([1, 3, 2], 100, 20, 'line')).toBe('M0,20L50,0L100,10');
    const area = sparklinePath([1, 3, 2], 100, 20, 'area');
    expect(area.startsWith('M0,20L50,0L100,10L100,20L0,20Z')).toBe(true);
    const bars = sparklinePath([1, 3], 100, 20, 'bar');
    expect(bars.match(/M/g)).toHaveLength(2);
    expect(bars.endsWith('Z')).toBe(true);
    expect(sparklinePath([], 100, 20, 'line')).toBe('');
  });
});

describe('styles + icons', () => {
  it('converts a schema Style to inline declarations', () => {
    const inline = styleToInline(
      {
        foreColor: { light: 'black', dark: 'white' },
        backColor: 'var(--sg-accent)',
        border: {
          top: { width: 1, style: 'solid', color: 'red' },
          left: { width: 0, style: 'solid' },
          radius: 3,
        },
        font: { size: 'sm', weight: 'bold', italic: true, decoration: 'underline', family: 'mono' },
        padding: 4,
        opacity: 0.5,
      },
      'dark',
    );
    expect(inline).toEqual({
      color: 'white',
      backgroundColor: 'var(--sg-accent)',
      borderTop: '1px solid red',
      borderLeft: 'none',
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontFamily: 'var(--sg-font-mono)',
      padding: '0 4px',
      opacity: 0.5,
    });
  });

  const iconStyle = (over: Partial<IconStyle>): IconStyle => ({
    kind: 'icon',
    mappings: [],
    matchMode: 'caseInsensitive',
    fallback: { mode: 'showText' },
    text: 'after',
    size: 18,
    gap: 4,
    ...over,
  });

  it('matches mappings before presets, honouring the match mode', () => {
    const s = iconStyle({
      preset: 'trend',
      mappings: [{ key: 'Up', icon: { kind: 'emoji', value: '🚀' }, description: 'Rocket' }],
    });
    expect(resolveIcon(s, 'up')).toMatchObject({
      icon: { kind: 'emoji', value: '🚀' },
      description: 'Rocket',
    });
    expect(resolveIcon({ ...s, matchMode: 'exact' }, 'up')).toMatchObject({
      icon: { kind: 'system', name: 'lucide:trending-up' },
    });
    expect(resolveIcon(iconStyle({ preset: 'trend' }), -3)).toMatchObject({ color: 'var(--sg-negative)' });
    expect(resolveIcon(iconStyle({ preset: 'trend' }), 'sideways')).toBeUndefined();
  });

  it('maps status, flags and currencies', () => {
    expect(resolveIcon(iconStyle({ preset: 'status' }), 'Cancelled')).toMatchObject({
      icon: { kind: 'dot', color: 'var(--sg-negative)' },
    });
    expect(resolveIcon(iconStyle({ preset: 'flags' }), 'usd')).toMatchObject({
      icon: { kind: 'emoji', value: '🇺🇸' },
    });
    expect(flagEmoji('gb')).toBe('🇬🇧');
    expect(flagEmoji('XAU')).toBeUndefined();
    expect(resolveIcon(iconStyle({ preset: 'currencies' }), 'EUR')).toMatchObject({
      icon: { kind: 'emoji', value: '€' },
    });
    expect(resolveIcon(iconStyle({ preset: 'currencies' }), 'ZZZ')).toBeUndefined();
  });
});
