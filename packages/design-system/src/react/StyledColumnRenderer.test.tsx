import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StyledColumnStyle, type RangeEndpoint } from '@smartgrid/schema';
import { StyledColumnRenderer, styledColumnComponents } from './StyledColumnRenderer';
import type { StyledColumnRendererParams } from '../styledColumn';

afterEach(cleanup);

const stats: Record<string, number> = { 'Col-Min': -100, 'Col-Max': 100, 'Col-Avg': 0, 'Col-Median': 0 };

function params(style: unknown, over: Partial<StyledColumnRendererParams> = {}): StyledColumnRendererParams {
  return {
    columnId: 'pnl',
    style: StyledColumnStyle.parse(style),
    resolveEndpoint: (e: RangeEndpoint, row) =>
      typeof e === 'number' ? e : typeof e === 'string' ? stats[e] : Number(row?.[e.columnId]),
    ...over,
  };
}

const draw = (value: unknown, style: unknown, over: Partial<StyledColumnRendererParams> = {}, extra = {}) =>
  render(
    <StyledColumnRenderer value={value} styled={params(style, over)} resolvedTheme="light" {...extra} />,
  );

describe('StyledColumnRenderer', () => {
  it('exposes the AG Grid component map', () => {
    expect(styledColumnComponents.sgStyledColumn).toBe(StyledColumnRenderer);
  });

  it('falls back to formatted text without params or for excluded row kinds', () => {
    expect(render(<StyledColumnRenderer value={3} valueFormatted="3.00" />).container.textContent).toBe(
      '3.00',
    );
    const { container } = render(
      <StyledColumnRenderer
        value={3}
        node={{ group: true }}
        styled={params(
          { kind: 'rating' },
          {
            rowScope: {
              excludeDataRows: false,
              excludeGroupRows: true,
              excludeSummaryRows: false,
              excludeTotalRows: false,
            },
          },
        )}
      />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('3');
  });

  it('gradient: paints a cell-filling background with contrasting text', () => {
    const { container } = draw(
      50,
      { kind: 'gradient', ranges: [{ min: 'Col-Min', max: 'Col-Max', color: '#000000' }], minAlpha: 1 },
      { formatValue: (v) => `${v}!` },
    );
    const bg = container.querySelector('[data-sc-bg]') as HTMLElement;
    expect(bg.style.background).toBe('rgb(0, 0, 0)');
    expect((container.querySelector('span') as HTMLElement).style.color).toBe('white');
    expect(container.textContent).toBe('50!');
    // Non-numeric values render as plain text.
    expect(draw('n/a', { kind: 'gradient' }).container.querySelector('[data-sc-bg]')).toBeNull();
  });

  it('gradient: zero-centred picks the colour by sign', () => {
    const { container } = draw(-50, {
      kind: 'gradient',
      zeroCentred: { negativeColor: 'red', positiveColor: 'green' },
    });
    expect((container.querySelector('[data-sc-bg]') as HTMLElement).style.background).toContain('red');
  });

  it('percentBar: fills from the origin to the value with the range colour and text after', () => {
    const { container } = draw(25, {
      kind: 'percentBar',
      ranges: [
        { min: 0, max: 50, color: 'orange' },
        { min: 50, max: 100, color: 'green' },
      ],
      text: { show: 'percentage', position: 'after' },
    });
    const bar = container.querySelector('[data-sc-bar]') as HTMLElement;
    expect(bar.style.left).toBe('0%');
    expect(bar.style.width).toBe('25%');
    expect(bar.style.background).toBe('orange');
    expect(container.querySelector('[data-sc-text]')?.textContent).toBe('25%');
  });

  it('badge: renders one chip per array element using the picked badge', () => {
    const { container } = draw(
      ['A', 'B'],
      {
        kind: 'badge',
        density: 'compact',
        badges: [
          { shape: 'square', style: { backColor: 'red', foreColor: 'white' }, label: '<[value]>' },
          {
            shape: 'pill',
            style: { backColor: 'blue' },
            icon: { kind: 'emoji', value: '★' },
            iconPosition: 'end',
          },
        ],
      },
      { pickBadge: (v) => (v === 'A' ? 0 : 1) },
    );
    const chips = container.querySelectorAll('[data-sc-badge]');
    expect(chips).toHaveLength(2);
    const a = chips[0] as HTMLElement;
    expect(a.textContent).toBe('<A>');
    expect(a.style.backgroundColor).toBe('red');
    expect(a.style.borderRadius).toBe('0px');
    expect(a.style.padding).toBe('0px 4px');
    const b = chips[1] as HTMLElement;
    expect(b.textContent).toBe('B★');
    expect(b.style.borderRadius).toBe('9999px');
  });

  it('badge: unmatched values render as plain text', () => {
    const { container } = draw('x', { kind: 'badge', badges: [{}] }, { pickBadge: () => undefined });
    expect(container.querySelector('[data-sc-badge]')).toBeNull();
    expect(container.textContent).toBe('x');
  });

  it('sparkline: draws line, area and column variants with markers and a zero line', () => {
    const line = draw([1, -2, 3], { kind: 'sparkline', showMarkers: true, showZeroLine: true }).container;
    expect(line.querySelector('[data-sc-sparkline="line"]')).not.toBeNull();
    expect(line.querySelectorAll('circle')).toHaveLength(3);
    expect(line.querySelector('line')).not.toBeNull();
    const area = draw([1, 2, 3], { kind: 'sparkline', type: 'area', fill: 'pink' }).container;
    expect(area.querySelectorAll('path')).toHaveLength(2);
    expect(area.querySelector('path')?.getAttribute('fill')).toBe('pink');
    const cols = draw(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      { kind: 'sparkline', type: 'column', color: 'teal' },
    ).container;
    expect(cols.querySelector('path')?.getAttribute('fill')).toBe('teal');
    expect(draw([1], { kind: 'sparkline' }).container.firstChild).toBeNull();
    expect(draw('nope', { kind: 'sparkline' }).container.firstChild).toBeNull();
  });

  it('bulletChart: draws bands, the value bar and a target marker in both orientations', () => {
    const style = {
      kind: 'bulletChart',
      ranges: [
        { min: 0, max: 50, color: 'red' },
        { min: 50, max: 100, color: 'green' },
      ],
      target: { columnId: 'limit' },
      targetMarker: { shape: 'diamond', size: 8 },
    };
    const h = render(
      <StyledColumnRenderer value={30} data={{ limit: 80 }} styled={params(style)} resolvedTheme="light" />,
    ).container;
    expect(h.querySelectorAll('[data-sc-band]')).toHaveLength(2);
    expect((h.querySelector('[data-sc-bar]') as HTMLElement).style.width).toBe('30%');
    const target = h.querySelector('[data-sc-target]') as HTMLElement;
    expect(target.style.left).toBe('80%');
    expect(target.querySelector('[data-marker="diamond"]')).not.toBeNull();
    const v = render(
      <StyledColumnRenderer
        value={30}
        data={{ limit: 80 }}
        styled={params({ ...style, orientation: 'vertical' })}
      />,
    ).container;
    expect((v.querySelector('[data-sc-bar]') as HTMLElement).style.height).toBe('30%');
    expect((v.querySelector('[data-sc-target]') as HTMLElement).style.bottom).toBe('80%');
  });

  it('rating: fills whole and half icons and shows the value', () => {
    const { container } = draw(3.5, { kind: 'rating', icon: 'heart', showValue: true, filledColor: 'gold' });
    expect(container.querySelectorAll('svg')).toHaveLength(5);
    const filled = container.querySelectorAll('[data-sc-filled]');
    expect(filled).toHaveLength(4);
    expect(filled[3]?.getAttribute('data-sc-filled')).toBe('0.5');
    expect(filled[0]?.getAttribute('fill')).toBe('gold');
    expect(container.textContent).toBe('3.5');
    const whole = draw(2.4, { kind: 'rating', allowHalf: false }).container;
    expect(whole.querySelectorAll('[data-sc-filled]')).toHaveLength(2);
  });

  it('rangeBar: positions the marker, reference and bands; handles out-of-range modes', () => {
    const style = {
      kind: 'rangeBar',
      min: 'Col-Min',
      max: 'Col-Max',
      reference: { value: 0, marker: { shape: 'line', size: 2 } },
      marker: { shape: 'circle', size: 8, color: 'blue' },
      ranges: [{ min: -100, max: 0, color: 'pink' }],
      outOfRange: { mode: 'clamp', color: 'red' },
    };
    const c = draw(50, style).container;
    expect((c.querySelector('[data-sc-marker]') as HTMLElement).style.left).toBe('75%');
    expect((c.querySelector('[data-sc-reference]') as HTMLElement).style.left).toBe('50%');
    expect(c.querySelector('[data-marker="line"]')).not.toBeNull();
    expect((c.querySelector('[data-sc-band]') as HTMLElement).style.width).toBe('50%');
    expect(c.querySelector('[data-marker="circle"] path')?.getAttribute('fill')).toBe('blue');
    const clamped = draw(500, style).container;
    expect((clamped.querySelector('[data-sc-marker]') as HTMLElement).style.left).toBe('100%');
    expect(clamped.querySelector('[data-marker="circle"] path')?.getAttribute('fill')).toBe('red');
    const over = draw(500, { ...style, outOfRange: { mode: 'overflow' } }).container;
    expect((over.querySelector('[data-sc-marker]') as HTMLElement).style.left).toBe('110%');
    expect(draw(500, { ...style, outOfRange: { mode: 'hide' } }).container.firstChild).toBeNull();
    const v = draw(-100, { ...style, orientation: 'vertical' }).container;
    expect((v.querySelector('[data-sc-marker]') as HTMLElement).style.bottom).toBe('0%');
  });

  it('icon: maps values through mappings and presets with text placement and fallbacks', () => {
    const mapped = draw('EUR', { kind: 'icon', preset: 'flags', text: 'before' }).container;
    expect(mapped.querySelector('[data-sc-icon]')?.textContent).toBe('EUR🇪🇺');
    const trend = draw('up', { kind: 'icon', preset: 'trend', text: 'none' }).container;
    expect(trend.querySelector('svg')).not.toBeNull();
    expect(trend.textContent).toBe('');
    const status = draw('Live', { kind: 'icon', preset: 'status' }).container;
    expect((status.querySelector('[data-sc-dot]') as HTMLElement).style.background).toBe(
      'var(--sg-positive)',
    );
    const img = draw('x', {
      kind: 'icon',
      mappings: [{ key: 'X', icon: { kind: 'image', src: 'data:,' } }],
    }).container;
    expect(img.querySelector('img')?.getAttribute('src')).toBe('data:,');
    expect(draw('zzz', { kind: 'icon', fallback: { mode: 'hide' } }).container.firstChild).toBeNull();
    expect(draw('zzz', { kind: 'icon' }).container.textContent).toBe('zzz');
    const fb = draw('zzz', {
      kind: 'icon',
      fallback: { mode: 'icon', icon: { kind: 'emoji', value: '?' } },
    }).container;
    expect(fb.textContent).toBe('?zzz');
  });

  it('reads the theme from <html data-theme> when no override is given', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      const { container } = render(
        <StyledColumnRenderer
          value={1}
          styled={params({
            kind: 'badge',
            badges: [{ style: { backColor: { light: 'white', dark: 'black' } } }],
          })}
        />,
      );
      expect((container.querySelector('[data-sc-badge]') as HTMLElement).style.backgroundColor).toBe('black');
    } finally {
      document.documentElement.removeAttribute('data-theme');
    }
  });
});
