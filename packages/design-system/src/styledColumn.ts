/**
 * Styled-column helpers shared by the engine (which builds the renderer
 * params at grid-build time) and the React renderer (which draws the eight
 * kinds). Pure and framework-agnostic: no React, no AG Grid, no DOM.
 *
 * Colours may be hex, rgb()/hsl()/oklch() or design tokens (`var(--sg-…)`),
 * so alpha effects use CSS `color-mix()` rather than string maths.
 */
import type {
  Badge,
  CellColorRange,
  FontStyle,
  Icon,
  RangeEndpoint,
  RowScope,
  Style,
  StyledColumnStyle,
  ThemeColor,
} from '@smartgrid/schema';

export type StyledColumnTheme = 'light' | 'dark';

/** Everything the renderer needs, closed over at build time; never calls back into the engine. */
export interface StyledColumnRendererParams {
  columnId: string;
  style: StyledColumnStyle;
  rowScope?: RowScope;
  /** Numbers pass through; `Col-*` read column statistics; `{ columnId }` reads the row. */
  resolveEndpoint(endpoint: RangeEndpoint, rowData?: Record<string, unknown>): number | undefined;
  /** Index of the first badge whose rule matches (badges without a rule always match). */
  pickBadge?(value: unknown, rowData?: Record<string, unknown>): number | undefined;
  /** The column's display format (the host or format-column formatter), else `String`. */
  formatValue?(value: unknown, rowData?: Record<string, unknown>): string;
}

export type IconStyle = Extract<StyledColumnStyle, { kind: 'icon' }>;

export type EndpointResolver = (endpoint: RangeEndpoint) => number | undefined;

/** Inline style declarations as a plain object (camelCase keys; cast to React's CSSProperties). */
export type InlineStyle = Record<string, string | number>;

// ── Theme + scope ────────────────────────────────────────────

export function resolveThemeColor(c: ThemeColor | undefined, theme: StyledColumnTheme): string | undefined {
  if (!c) return undefined;
  return typeof c === 'string' ? c : c[theme];
}

export interface RowKind {
  isGroup: boolean;
  isSummary: boolean;
  isTotal: boolean;
}

/** Mirrors the engine's scope helper (design-system cannot import the engine). */
export function rowKindAllowed(rowScope: RowScope | undefined, kind: RowKind): boolean {
  if (!rowScope) return true;
  if (kind.isTotal) return !rowScope.excludeTotalRows;
  if (kind.isSummary) return !rowScope.excludeSummaryRows;
  if (kind.isGroup) return !rowScope.excludeGroupRows;
  return !rowScope.excludeDataRows;
}

/** Row kind from AG Grid-like cell params. */
export function rowKindOf(
  node: { group?: boolean; rowPinned?: string | null; footer?: boolean } | null | undefined,
): RowKind {
  return {
    isGroup: !!node?.group && !node?.footer,
    isSummary: !!node?.rowPinned && !node?.footer,
    isTotal: !!node?.footer,
  };
}

// ── Numbers ──────────────────────────────────────────────────

export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Fraction (0..1, clamped) of `value` between `min` and `max`; 0 when the span is empty. */
export function percentOf(value: number, min: number, max: number): number {
  const span = max - min;
  if (span === 0) return 0;
  return clamp((value - min) / span, 0, 1);
}

export type BarOrigin = 'auto' | 'zero' | 'min' | number;

/** Where a bar starts: `auto` is zero when the range crosses it, else the minimum. */
export function resolveOrigin(origin: BarOrigin, min: number, max: number): number {
  if (typeof origin === 'number') return clamp(origin, min, max);
  if (origin === 'min') return min;
  if (origin === 'zero') return clamp(0, min, max);
  return min < 0 && max > 0 ? 0 : min;
}

/** Bar extent as fractions of the track, from the origin to the value (ordered). */
export function barSpan(
  value: number,
  min: number,
  max: number,
  origin: BarOrigin,
): { from: number; to: number } {
  const o = percentOf(resolveOrigin(origin, min, max), min, max);
  const v = percentOf(value, min, max);
  return { from: Math.min(o, v), to: Math.max(o, v) };
}

// ── Colours ──────────────────────────────────────────────────

/** A colour at an alpha; `color-mix()` so tokens and literals both work. */
export function withAlpha(color: string, alpha: number): string {
  const a = clamp(alpha, 0, 1);
  if (a >= 1) return color;
  return `color-mix(in srgb, ${color} ${round(a * 100)}%, transparent)`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ResolvedRange {
  min: number;
  max: number;
  color: string;
  reverseGradient?: boolean;
  minAlpha?: number;
  maxAlpha?: number;
}

/** Resolve a CellColorRange's endpoints and colour; undefined when an endpoint cannot be resolved. */
export function resolveRange(
  range: CellColorRange,
  resolve: EndpointResolver,
  theme: StyledColumnTheme,
  rangeValueType: 'number' | 'percentage' = 'number',
): ResolvedRange | undefined {
  const min = resolveScaled(range.min, resolve, rangeValueType);
  const max = resolveScaled(range.max, resolve, rangeValueType);
  const color = resolveThemeColor(range.color, theme);
  if (min === undefined || max === undefined || !color) return undefined;
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    color,
    reverseGradient: range.reverseGradient,
    minAlpha: range.minAlpha,
    maxAlpha: range.maxAlpha,
  };
}

/** In percentage mode literal numbers are percentages of the column's [Col-Min, Col-Max] span. */
export function resolveScaled(
  endpoint: RangeEndpoint,
  resolve: EndpointResolver,
  rangeValueType: 'number' | 'percentage',
): number | undefined {
  if (rangeValueType === 'percentage' && typeof endpoint === 'number') {
    const lo = resolve('Col-Min');
    const hi = resolve('Col-Max');
    if (lo === undefined || hi === undefined) return undefined;
    return lo + (endpoint / 100) * (hi - lo);
  }
  return resolve(endpoint);
}

export function resolveRanges(
  ranges: readonly CellColorRange[],
  resolve: EndpointResolver,
  theme: StyledColumnTheme,
  rangeValueType: 'number' | 'percentage' = 'number',
): ResolvedRange[] {
  return ranges
    .map((r) => resolveRange(r, resolve, theme, rangeValueType))
    .filter((r): r is ResolvedRange => !!r);
}

/** First range containing the value (inclusive); values outside every range pick the nearest end. */
export function rangeFor(value: number, ranges: readonly ResolvedRange[]): ResolvedRange | undefined {
  const hit = ranges.find((r) => value >= r.min && value <= r.max);
  if (hit || ranges.length === 0) return hit;
  const lo = ranges.reduce((a, r) => (r.min < a.min ? r : a));
  const hi = ranges.reduce((a, r) => (r.max > a.max ? r : a));
  return value < lo.min ? lo : hi;
}

/** Overall [min, max] covered by a set of ranges. */
export function rangeBounds(ranges: readonly ResolvedRange[]): { min: number; max: number } | undefined {
  if (ranges.length === 0) return undefined;
  return {
    min: Math.min(...ranges.map((r) => r.min)),
    max: Math.max(...ranges.map((r) => r.max)),
  };
}

/**
 * Gradient background for a value: the containing range's colour with alpha
 * interpolated from minAlpha (at min) to maxAlpha (at max), or reversed.
 */
export function gradientColor(
  value: number,
  ranges: readonly ResolvedRange[],
  minAlpha = 0.15,
  maxAlpha = 1,
): string | undefined {
  const r = ranges.find((x) => value >= x.min && value <= x.max);
  if (!r) return undefined;
  let t = r.max === r.min ? 1 : (value - r.min) / (r.max - r.min);
  if (r.reverseGradient) t = 1 - t;
  const lo = r.minAlpha ?? minAlpha;
  const hi = r.maxAlpha ?? maxAlpha;
  return withAlpha(r.color, lo + (hi - lo) * t);
}

/** Zero-centred gradient: sign picks the colour, magnitude (relative to the column's extreme) the alpha. */
export function zeroCentredColor(
  value: number,
  negativeColor: string,
  positiveColor: string,
  absMax: number,
  minAlpha = 0.15,
  maxAlpha = 1,
): string | undefined {
  if (value === 0) return undefined;
  const t = absMax > 0 ? clamp(Math.abs(value) / absMax, 0, 1) : 1;
  return withAlpha(value < 0 ? negativeColor : positiveColor, minAlpha + (maxAlpha - minAlpha) * t);
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse hex, rgb()/rgba() and `color-mix(in srgb, <c> <p>%, transparent)`; undefined otherwise. */
export function parseColor(input: string): Rgba | undefined {
  const s = input.trim();
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(s);
  if (mix) {
    const base = parseColor(mix[1]!);
    return base ? { ...base, a: base.a * (Number(mix[2]) / 100) } : undefined;
  }
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const hex = (i: number, w: number) => parseInt(w === 1 ? h[i]! + h[i]! : h.slice(i, i + 2), 16);
    if (h.length === 3 || h.length === 4)
      return { r: hex(0, 1), g: hex(1, 1), b: hex(2, 1), a: h.length === 4 ? hex(3, 1) / 255 : 1 };
    if (h.length === 6 || h.length === 8)
      return { r: hex(0, 2), g: hex(2, 2), b: hex(4, 2), a: h.length === 8 ? hex(6, 2) / 255 : 1 };
    return undefined;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (rgb) {
    const alpha =
      rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
  }
  return undefined;
}

/**
 * Text colour that contrasts with a background (WCAG relative luminance).
 * Undefined when the colour cannot be parsed (tokens, oklch) or is too
 * translucent for the underlying cell background to be known.
 */
export function contrastText(background: string | undefined): 'black' | 'white' | undefined {
  if (!background) return undefined;
  const c = parseColor(background);
  if (!c || c.a < 0.5) return undefined;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return l > 0.4 ? 'black' : 'white';
}

// ── Inline styles from schema Style ──────────────────────────

const FONT_SIZES: Record<string, string> = { xs: '10px', sm: '11px', md: '13px', lg: '15px', xl: '18px' };
const FONT_WEIGHTS: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const DECORATIONS: Record<string, string> = {
  none: 'none',
  underline: 'underline',
  overline: 'overline',
  lineThrough: 'line-through',
};

export function fontToInline(font: FontStyle | undefined): InlineStyle {
  const out: InlineStyle = {};
  if (!font) return out;
  if (font.size !== undefined)
    out['fontSize'] = typeof font.size === 'number' ? `${font.size}px` : (FONT_SIZES[font.size] ?? '13px');
  if (font.weight) out['fontWeight'] = FONT_WEIGHTS[font.weight] ?? 400;
  if (font.italic !== undefined) out['fontStyle'] = font.italic ? 'italic' : 'normal';
  if (font.decoration) out['textDecoration'] = DECORATIONS[font.decoration] ?? 'none';
  if (font.family) out['fontFamily'] = `var(--sg-font-${font.family})`;
  return out;
}

/** Inline equivalent of the engine's styleToDeclarations, for elements styled at render time. */
export function styleToInline(style: Style | undefined, theme: StyledColumnTheme): InlineStyle {
  const out: InlineStyle = {};
  if (!style) return out;
  const fore = resolveThemeColor(style.foreColor, theme);
  const back = resolveThemeColor(style.backColor, theme);
  if (fore) out['color'] = fore;
  if (back) out['backgroundColor'] = back;
  const b = style.border;
  if (b) {
    const side = (s: typeof b.top) =>
      !s
        ? undefined
        : s.style === 'none' || s.width === 0
          ? 'none'
          : `${s.width}px ${s.style} ${resolveThemeColor(s.color, theme) ?? 'currentColor'}`;
    const t = side(b.top);
    const r = side(b.right);
    const bo = side(b.bottom);
    const l = side(b.left);
    if (t) out['borderTop'] = t;
    if (r) out['borderRight'] = r;
    if (bo) out['borderBottom'] = bo;
    if (l) out['borderLeft'] = l;
    if (b.radius !== undefined) out['borderRadius'] = `${b.radius}px`;
  }
  Object.assign(out, fontToInline(style.font));
  if (style.alignment?.horizontal) out['textAlign'] = style.alignment.horizontal;
  if (style.padding !== undefined) out['padding'] = `0 ${style.padding}px`;
  if (style.opacity !== undefined) out['opacity'] = style.opacity;
  return out;
}

// ── Badges ───────────────────────────────────────────────────

export const BADGE_RADIUS: Record<Badge['shape'], string> = { pill: '9999px', rounded: '4px', square: '0' };
export const BADGE_PADDING: Record<'compact' | 'normal' | 'comfortable', string> = {
  compact: '0 4px',
  normal: '1px 6px',
  comfortable: '2px 10px',
};

/** Badge text: the label template (`[value]`) or the formatted value. */
export function badgeText(badge: Badge, formatted: string): string {
  return badge.label === undefined ? formatted : badge.label.replace(/\[value\]/g, formatted);
}

// ── Rating ───────────────────────────────────────────────────

/** Clamp to [0, max] and round to halves (or whole icons). */
export function quantizeRating(value: number, max: number, allowHalf: boolean): number {
  const step = allowHalf ? 0.5 : 1;
  return clamp(Math.round(value / step) * step, 0, max);
}

/** 24×24 glyph paths for rating icons. */
export const RATING_PATHS: Record<'star' | 'heart' | 'circle' | 'thumb', string> = {
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
  heart:
    'M12 21s-7.5-4.6-9.5-9.2C1 7.8 3.4 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.4 0 5.8 3.3 4.3 7.3C19.5 16.4 12 21 12 21z',
  circle: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
  thumb:
    'M7 22H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h3v12zm2 0V10l4-8a2 2 0 0 1 2 2v5h5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 22H9z',
};

// ── Markers ──────────────────────────────────────────────────

export type MarkerShape = 'line' | 'circle' | 'diamond' | 'triangle' | 'square';

/** SVG path for a marker centred on (0,0) and `size` across; `line` is a vertical stroke of length `size`. */
export function markerPath(shape: MarkerShape, size: number): string {
  const h = size / 2;
  switch (shape) {
    case 'circle':
      return `M${-h},0a${h},${h} 0 1,0 ${size},0a${h},${h} 0 1,0 ${-size},0`;
    case 'diamond':
      return `M0,${-h}L${h},0L0,${h}L${-h},0Z`;
    case 'triangle':
      return `M0,${-h}L${h},${h}L${-h},${h}Z`;
    case 'square':
      return `M${-h},${-h}h${size}v${size}h${-size}Z`;
    case 'line':
      return `M0,${-h}L0,${h}`;
  }
}

// ── Sparklines ───────────────────────────────────────────────

/** Accepts number[], [x, y][] tuples or { y } / { x, y } objects; drops non-finite entries. */
export function normaliseSeries(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) {
    const n = Array.isArray(v)
      ? toNumber(v[1] ?? v[0])
      : v && typeof v === 'object'
        ? toNumber((v as Record<string, unknown>)['y'] ?? (v as Record<string, unknown>)['value'])
        : toNumber(v);
    if (n !== undefined) out.push(n);
  }
  return out;
}

export interface SparklineLayout {
  points: { x: number; y: number }[];
  min: number;
  max: number;
  /** Y of zero when the series crosses it, else undefined. */
  zeroY?: number;
  /** Baseline for bars and areas: zero when in range, else the bottom edge. */
  baseY: number;
}

export function sparklineLayout(values: readonly number[], width: number, height: number): SparklineLayout {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => height - ((v - min) / span) * height;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => ({ x: round(i * step), y: round(y(v)) }));
  const zeroY = min < 0 && max > 0 ? round(y(0)) : undefined;
  const baseY = min <= 0 && max >= 0 ? round(y(0)) : min > 0 ? height : 0;
  return { points, min, max, zeroY, baseY };
}

export type SparklineType = 'line' | 'area' | 'bar' | 'column';

/** SVG path data for a series: an open polyline, a closed area, or one rectangle sub-path per bar. */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
  type: SparklineType,
): string {
  if (values.length === 0) return '';
  const { points, baseY } = sparklineLayout(values, width, height);
  if (type === 'bar' || type === 'column') {
    const slot = width / values.length;
    const w = round(slot * 0.7);
    return points
      .map((p, i) => {
        const x = round(i * slot + (slot - w) / 2);
        const top = Math.min(p.y, baseY);
        const h = round(Math.abs(baseY - p.y));
        return `M${x},${top}h${w}v${h}h${-w}Z`;
      })
      .join('');
  }
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('');
  if (type === 'area') {
    const last = points[points.length - 1]!;
    return `${line}L${last.x},${baseY}L${points[0]!.x},${baseY}Z`;
  }
  return line;
}

// ── Icon presets ─────────────────────────────────────────────

export type ResolvedIcon = Icon | { kind: 'dot'; color: string };

export interface IconMatch {
  icon: ResolvedIcon;
  color?: string;
  description?: string;
}

const FLAG_COUNTRIES: Record<string, string> = {
  USD: 'US',
  EUR: 'EU',
  GBP: 'GB',
  JPY: 'JP',
  CHF: 'CH',
  CAD: 'CA',
  AUD: 'AU',
  NZD: 'NZ',
  HKD: 'HK',
  SGD: 'SG',
  CNY: 'CN',
  INR: 'IN',
  KRW: 'KR',
  BRL: 'BR',
  MXN: 'MX',
  ZAR: 'ZA',
  SEK: 'SE',
  NOK: 'NO',
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CHF: 'CHF',
  CAD: 'C$',
  AUD: 'A$',
  NZD: 'NZ$',
  HKD: 'HK$',
  SGD: 'S$',
  CNY: '¥',
  INR: '₹',
  KRW: '₩',
  BRL: 'R$',
  MXN: 'MX$',
  ZAR: 'R',
  SEK: 'kr',
  NOK: 'kr',
  ILS: '₪',
  TRY: '₺',
  RUB: '₽',
};

const STATUS_COLORS: Record<string, string> = {
  live: 'var(--sg-positive)',
  active: 'var(--sg-positive)',
  open: 'var(--sg-positive)',
  filled: 'var(--sg-positive)',
  done: 'var(--sg-positive)',
  complete: 'var(--sg-positive)',
  completed: 'var(--sg-positive)',
  success: 'var(--sg-positive)',
  approved: 'var(--sg-positive)',
  pending: 'var(--sg-warning)',
  working: 'var(--sg-warning)',
  partial: 'var(--sg-warning)',
  new: 'var(--sg-info)',
  submitted: 'var(--sg-info)',
  cancelled: 'var(--sg-negative)',
  canceled: 'var(--sg-negative)',
  rejected: 'var(--sg-negative)',
  failed: 'var(--sg-negative)',
  error: 'var(--sg-negative)',
  expired: 'var(--sg-negative)',
  closed: 'var(--sg-muted-foreground)',
  inactive: 'var(--sg-muted-foreground)',
};

/** ISO-3166 alpha-2 (or a common currency code) → regional-indicator flag emoji. */
export function flagEmoji(code: string): string | undefined {
  const raw = code.trim().toUpperCase();
  const cc = /^[A-Z]{2}$/.test(raw) ? raw : FLAG_COUNTRIES[raw];
  if (!cc) return undefined;
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

function presetIcon(preset: NonNullable<IconStyle['preset']>, value: unknown): IconMatch | undefined {
  const text = value === null || value === undefined ? '' : String(value).trim();
  switch (preset) {
    case 'flags': {
      const flag = flagEmoji(text);
      return flag ? { icon: { kind: 'emoji', value: flag }, description: text.toUpperCase() } : undefined;
    }
    case 'currencies': {
      const symbol = CURRENCY_SYMBOLS[text.toUpperCase()];
      return symbol ? { icon: { kind: 'emoji', value: symbol }, description: text.toUpperCase() } : undefined;
    }
    case 'trend': {
      const n = toNumber(value);
      const dir =
        n !== undefined
          ? n > 0
            ? 'up'
            : n < 0
              ? 'down'
              : 'flat'
          : (text.toLowerCase() as 'up' | 'down' | 'flat');
      if (dir === 'up')
        return { icon: { kind: 'system', name: 'lucide:trending-up' }, color: 'var(--sg-positive)' };
      if (dir === 'down')
        return { icon: { kind: 'system', name: 'lucide:trending-down' }, color: 'var(--sg-negative)' };
      if (dir === 'flat')
        return { icon: { kind: 'system', name: 'lucide:minus' }, color: 'var(--sg-muted-foreground)' };
      return undefined;
    }
    case 'status': {
      const color = STATUS_COLORS[text.toLowerCase()];
      return color ? { icon: { kind: 'dot', color }, color } : undefined;
    }
  }
}

/** Explicit mappings first (exact or case-insensitive), then the preset; undefined when nothing matches. */
export function resolveIcon(style: IconStyle, value: unknown): IconMatch | undefined {
  const text = value === null || value === undefined ? '' : String(value);
  const eq = (a: string, b: string) =>
    style.matchMode === 'exact' ? a === b : a.toLowerCase() === b.toLowerCase();
  const m = style.mappings.find((x) => eq(x.key, text));
  if (m) return { icon: m.icon, description: m.description };
  return style.preset ? presetIcon(style.preset, value) : undefined;
}
