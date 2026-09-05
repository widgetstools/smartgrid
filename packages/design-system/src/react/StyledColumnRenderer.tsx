/**
 * StyledColumnRenderer — one AG Grid cell renderer for the eight styled
 * column kinds (gradient, percent bar, badge, sparkline, bullet chart,
 * rating, range bar, icon). Driven entirely by the schema style carried in
 * `params.styled` (built by the engine); never calls back into the engine.
 *
 * Register with AG Grid: `components={{ ...styledColumnComponents }}`.
 */
import { useId, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { Marker, StyledColumnStyle } from '@smartgrid/schema';
import { DynamicIcon } from './DynamicIcon';
import {
  BADGE_PADDING,
  BADGE_RADIUS,
  badgeText,
  barSpan,
  contrastText,
  gradientColor,
  markerPath,
  normaliseSeries,
  percentOf,
  quantizeRating,
  rangeBounds,
  rangeFor,
  RATING_PATHS,
  resolveIcon,
  resolveRanges,
  resolveThemeColor,
  rowKindAllowed,
  rowKindOf,
  sparklineLayout,
  sparklinePath,
  styleToInline,
  toNumber,
  withAlpha,
  zeroCentredColor,
  type EndpointResolver,
  type ResolvedIcon,
  type StyledColumnRendererParams,
  type StyledColumnTheme,
} from '../styledColumn';

type Of<K extends StyledColumnStyle['kind']> = Extract<StyledColumnStyle, { kind: K }>;
type GradientStyle = Of<'gradient'>;
type PercentBarStyle = Of<'percentBar'>;
type BadgeStyle = Of<'badge'>;
type SparklineStyle = Of<'sparkline'>;
type BulletChartStyle = Of<'bulletChart'>;
type RatingStyle = Of<'rating'>;
type RangeBarStyle = Of<'rangeBar'>;
type IconStyle = Of<'icon'>;

/** Structural subset of AG Grid's ICellRendererParams plus the engine's `styled` param. */
export interface StyledColumnRendererProps {
  value: unknown;
  valueFormatted?: string | null;
  data?: Record<string, unknown>;
  node?: { group?: boolean; rowPinned?: string | null; footer?: boolean } | null;
  styled?: StyledColumnRendererParams;
  /** Host override for the theme; otherwise read from `<html data-theme>` / OS preference. */
  resolvedTheme?: StyledColumnTheme;
}

// ── Theme ────────────────────────────────────────────────────

function readTheme(): StyledColumnTheme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function subscribeTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
  mq?.addEventListener?.('change', onChange);
  return () => {
    observer.disconnect();
    mq?.removeEventListener?.('change', onChange);
  };
}

function useTheme(override?: StyledColumnTheme): StyledColumnTheme {
  const live = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const);
  return override ?? live;
}

// ── Shared ───────────────────────────────────────────────────

interface Ctx {
  theme: StyledColumnTheme;
  data?: Record<string, unknown>;
  resolve: EndpointResolver;
  format(v: unknown): string;
}

const css = (s: Record<string, string | number>) => s as CSSProperties;
const FILL: CSSProperties = { display: 'flex', alignItems: 'center', width: '100%', height: '100%' };
const ROW: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  width: '100%',
  minWidth: 0,
};

type CellText = PercentBarStyle['text'];

/** Bar/track chart with optional text before, after or inside. */
function WithText({
  text,
  value,
  pct,
  ctx,
  children,
}: {
  text: CellText;
  value: number;
  pct: number;
  ctx: Ctx;
  children: ReactNode;
}) {
  if (text.show === 'none') return <div style={FILL}>{children}</div>;
  const label = text.show === 'percentage' ? `${Math.round(pct * 100)}%` : ctx.format(value);
  const color = resolveThemeColor(text.color, ctx.theme);
  const span = (
    <span style={{ flex: '0 0 auto', color, fontVariantNumeric: 'tabular-nums' }} data-sc-text="">
      {label}
    </span>
  );
  if (text.position === 'inside')
    return (
      <div style={{ ...FILL, position: 'relative' }}>
        {children}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 4,
            color,
          }}
        >
          {label}
        </span>
      </div>
    );
  return (
    <div style={{ ...FILL, gap: 6 }}>
      {text.position === 'before' && span}
      <div style={{ flex: '1 1 auto', minWidth: 0, height: '100%', display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
      {text.position === 'after' && span}
    </div>
  );
}

function MarkerGlyph({
  marker,
  theme,
  along,
  length,
  color,
}: {
  marker: Marker;
  theme: StyledColumnTheme;
  along: 'x' | 'y';
  length: number;
  color?: string;
}) {
  const fill = color ?? resolveThemeColor(marker.color, theme) ?? 'var(--sg-foreground)';
  if (marker.shape === 'line') {
    const style: CSSProperties =
      along === 'x' ? { width: marker.size, height: length } : { height: marker.size, width: length };
    return <div data-marker="line" style={{ ...style, background: fill, flex: 'none' }} />;
  }
  const s = marker.size;
  return (
    <svg
      data-marker={marker.shape}
      width={s}
      height={s}
      viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`}
      style={{ display: 'block', flex: 'none' }}
    >
      <path d={markerPath(marker.shape, s)} fill={fill} />
    </svg>
  );
}

/** Percent string without floating-point tails (`1.1` → `110%`). */
const pc = (fraction: number) => `${Math.round(fraction * 10000) / 100}%`;

/** Absolute position of a marker at fraction `pct` along a horizontal or vertical track. */
function markerPos(pct: number, orientation: 'horizontal' | 'vertical'): CSSProperties {
  return orientation === 'horizontal'
    ? { position: 'absolute', left: pc(pct), top: '50%', transform: 'translate(-50%, -50%)' }
    : { position: 'absolute', bottom: pc(pct), left: '50%', transform: 'translate(-50%, 50%)' };
}

/** Absolute band from `from` to `to` (fractions) along a track. */
function bandPos(
  from: number,
  to: number,
  orientation: 'horizontal' | 'vertical',
  across = '100%',
): CSSProperties {
  const size = pc(Math.max(0, to - from));
  return orientation === 'horizontal'
    ? { position: 'absolute', left: pc(from), width: size, top: 0, height: across }
    : { position: 'absolute', bottom: pc(from), height: size, left: 0, width: across };
}

// ── Kinds ────────────────────────────────────────────────────

function Gradient({ style, value, ctx }: { style: GradientStyle; value: unknown; ctx: Ctx }) {
  const n = toNumber(value);
  const text = ctx.format(value);
  if (n === undefined) return <span>{text}</span>;
  let bg: string | undefined;
  if (style.ranges.length) {
    bg = gradientColor(
      n,
      resolveRanges(style.ranges, ctx.resolve, ctx.theme, style.rangeValueType),
      style.minAlpha,
      style.maxAlpha,
    );
  } else if (style.zeroCentred) {
    const lo = ctx.resolve('Col-Min') ?? 0;
    const hi = ctx.resolve('Col-Max') ?? 0;
    const neg = resolveThemeColor(style.zeroCentred.negativeColor, ctx.theme)!;
    const pos = resolveThemeColor(style.zeroCentred.positiveColor, ctx.theme)!;
    bg = zeroCentredColor(
      n,
      neg,
      pos,
      Math.max(Math.abs(lo), Math.abs(hi), Math.abs(n)),
      style.minAlpha,
      style.maxAlpha,
    );
  } else if (style.columnComparison) {
    const c = style.columnComparison;
    const ranges = resolveRanges(
      [{ min: c.min, max: c.max, color: c.color, reverseGradient: false }],
      ctx.resolve,
      ctx.theme,
    );
    bg = gradientColor(n, ranges, style.minAlpha, style.maxAlpha);
  }
  const color = style.autoContrastText ? contrastText(bg) : undefined;
  return (
    <div style={{ ...FILL, position: 'relative' }} title={style.tooltip}>
      {bg && <div data-sc-bg="" style={{ position: 'absolute', inset: 0, background: bg }} />}
      <span style={{ position: 'relative', color }}>{text}</span>
    </div>
  );
}

function PercentBar({ style, value, ctx }: { style: PercentBarStyle; value: unknown; ctx: Ctx }) {
  const n = toNumber(value);
  if (n === undefined) return <span>{ctx.format(value)}</span>;
  const ranges = resolveRanges(style.ranges, ctx.resolve, ctx.theme, style.rangeValueType);
  const bounds = rangeBounds(ranges);
  if (!bounds) return <span>{ctx.format(value)}</span>;
  const { from, to } = barSpan(n, bounds.min, bounds.max, style.origin);
  const pct = percentOf(n, bounds.min, bounds.max);
  const color = rangeFor(n, ranges)?.color ?? 'var(--sg-primary)';
  const back = resolveThemeColor(style.backColor, ctx.theme);
  return (
    <WithText text={style.text} value={n} pct={pct} ctx={ctx}>
      <div
        title={style.tooltip}
        style={{
          position: 'relative',
          width: '100%',
          height: '70%',
          background: back,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div data-sc-bar="" style={{ ...bandPos(from, to, 'horizontal'), background: color }} />
      </div>
    </WithText>
  );
}

function IconGlyph({ icon, size, color }: { icon: ResolvedIcon; size: number; color?: string }) {
  switch (icon.kind) {
    case 'system':
      return (
        <DynamicIcon
          icon={icon.name}
          style={{ width: icon.size ?? size, height: icon.size ?? size, color }}
        />
      );
    case 'image':
      return (
        <img
          src={icon.src}
          alt=""
          width={icon.size ?? size}
          height={icon.size ?? size}
          style={{ flex: 'none' }}
        />
      );
    case 'emoji':
      return <span style={{ fontSize: size * 0.85, lineHeight: 1, color }}>{icon.value}</span>;
    case 'dot':
      return (
        <span
          data-sc-dot=""
          style={{
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: '50%',
            background: icon.color,
            flex: 'none',
          }}
        />
      );
  }
}

function Badges({
  style,
  value,
  ctx,
  pick,
}: {
  style: BadgeStyle;
  value: unknown;
  ctx: Ctx;
  pick: StyledColumnRendererParams['pickBadge'];
}) {
  const items = Array.isArray(value)
    ? value
    : value === null || value === undefined || value === ''
      ? []
      : [value];
  const overflow: CSSProperties =
    style.overflow === 'wrap'
      ? { flexWrap: 'wrap' }
      : style.overflow === 'scroll'
        ? { overflowX: 'auto', whiteSpace: 'nowrap' }
        : { overflow: 'hidden', whiteSpace: 'nowrap' };
  return (
    <div style={{ ...ROW, ...overflow }}>
      {items.map((v, i) => {
        const idx = pick ? pick(v, ctx.data) : 0;
        const badge = idx === undefined ? undefined : style.badges[idx];
        const text = ctx.format(v);
        if (!badge) return <span key={i}>{text}</span>;
        const inline = styleToInline(badge.style, ctx.theme);
        const icon = badge.icon ? (
          <IconGlyph icon={badge.icon} size={14} color={inline['color'] as string | undefined} />
        ) : null;
        return (
          <span
            key={i}
            data-sc-badge={idx}
            style={css({
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              lineHeight: 1.4,
              backgroundColor: 'var(--sg-accent)',
              borderRadius: BADGE_RADIUS[badge.shape],
              padding: BADGE_PADDING[style.density],
              ...(style.overflow === 'truncate'
                ? { overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }
                : {}),
              ...inline,
            })}
          >
            {badge.iconPosition === 'start' && icon}
            {!badge.iconOnly && <span>{badgeText(badge, text)}</span>}
            {badge.iconPosition === 'end' && icon}
          </span>
        );
      })}
    </div>
  );
}

const SPARK_W = 100;
const SPARK_H = 24;

function Sparkline({ style, value, ctx }: { style: SparklineStyle; value: unknown; ctx: Ctx }) {
  const series = normaliseSeries(value);
  if (series.length < 2) return null;
  const color = resolveThemeColor(style.color, ctx.theme) ?? 'var(--sg-primary)';
  const fill = resolveThemeColor(style.fill, ctx.theme) ?? withAlpha(color, 0.25);
  const { points, zeroY } = sparklineLayout(series, SPARK_W, SPARK_H);
  const d = sparklinePath(series, SPARK_W, SPARK_H, style.type);
  const isBars = style.type === 'bar' || style.type === 'column';
  return (
    <svg
      data-sc-sparkline={style.type}
      viewBox={`0 -1 ${SPARK_W} ${SPARK_H + 2}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: SPARK_H, display: 'block' }}
    >
      {style.showZeroLine && zeroY !== undefined && (
        <line
          x1={0}
          x2={SPARK_W}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--sg-border-strong)"
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {style.type === 'area' && <path d={d} fill={fill} stroke="none" />}
      {isBars ? (
        <path d={d} fill={color} />
      ) : (
        <path
          d={sparklinePath(series, SPARK_W, SPARK_H, 'line')}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      )}
      {style.showMarkers &&
        !isBars &&
        points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={color} />)}
    </svg>
  );
}

function BulletChart({ style, value, ctx }: { style: BulletChartStyle; value: unknown; ctx: Ctx }) {
  const n = toNumber(value);
  if (n === undefined) return <span>{ctx.format(value)}</span>;
  const ranges = resolveRanges(style.ranges, ctx.resolve, ctx.theme, style.rangeValueType);
  const target = style.target === undefined ? undefined : ctx.resolve(style.target);
  const bounds = rangeBounds(ranges) ?? {
    min: Math.min(0, ctx.resolve('Col-Min') ?? n, n),
    max: Math.max(ctx.resolve('Col-Max') ?? n, n, target ?? n),
  };
  const o = style.orientation;
  const { from, to } = barSpan(n, bounds.min, bounds.max, style.origin);
  const bar = resolveThemeColor(style.bar.color, ctx.theme) ?? 'var(--sg-foreground)';
  const back = resolveThemeColor(style.backColor, ctx.theme);
  const inset = `${(100 - style.bar.height) / 2}%`;
  const barStyle: CSSProperties =
    o === 'horizontal'
      ? { ...bandPos(from, to, o), top: inset, height: `${style.bar.height}%` }
      : { ...bandPos(from, to, o), left: inset, width: `${style.bar.height}%` };
  return (
    <WithText text={style.text} value={n} pct={percentOf(n, bounds.min, bounds.max)} ctx={ctx}>
      <div
        title={style.tooltip}
        data-sc-bullet={o}
        style={{
          position: 'relative',
          width: '100%',
          height: o === 'horizontal' ? '80%' : '100%',
          background: back,
        }}
      >
        {ranges.map((r, i) => (
          <div
            key={i}
            data-sc-band=""
            style={{
              ...bandPos(
                percentOf(r.min, bounds.min, bounds.max),
                percentOf(r.max, bounds.min, bounds.max),
                o,
              ),
              background: withAlpha(r.color, r.minAlpha ?? 0.35),
            }}
          />
        ))}
        <div data-sc-bar="" style={{ ...barStyle, background: bar }} />
        {target !== undefined && (
          <div data-sc-target="" style={markerPos(percentOf(target, bounds.min, bounds.max), o)}>
            <MarkerGlyph
              marker={style.targetMarker}
              theme={ctx.theme}
              along={o === 'horizontal' ? 'x' : 'y'}
              length={o === 'horizontal' ? 16 : 12}
            />
          </div>
        )}
      </div>
    </WithText>
  );
}

function Rating({ style, value, ctx }: { style: RatingStyle; value: unknown; ctx: Ctx }) {
  const n = toNumber(value);
  const id = useId();
  if (n === undefined) return <span>{ctx.format(value)}</span>;
  const q = quantizeRating(n, style.max, style.allowHalf);
  const filled = resolveThemeColor(style.filledColor, ctx.theme) ?? 'var(--sg-warning)';
  const empty = resolveThemeColor(style.emptyColor, ctx.theme) ?? 'var(--sg-border-strong)';
  const path = RATING_PATHS[style.icon];
  return (
    <span data-sc-rating={q} title={style.tooltip} style={{ ...ROW, gap: style.gap, width: 'auto' }}>
      {Array.from({ length: style.max }, (_, i) => {
        const frac = Math.max(0, Math.min(1, q - i));
        const clip = `${id}-${i}`;
        return (
          <svg
            key={i}
            width={style.size}
            height={style.size}
            viewBox="0 0 24 24"
            style={{ display: 'block', flex: 'none' }}
          >
            <path d={path} fill={empty} />
            {frac > 0 && (
              <>
                <clipPath id={clip}>
                  <rect x={0} y={0} width={24 * frac} height={24} />
                </clipPath>
                <path d={path} fill={filled} clipPath={`url(#${clip})`} data-sc-filled={frac} />
              </>
            )}
          </svg>
        );
      })}
      {style.showValue && <span style={{ marginLeft: 2 }}>{ctx.format(value)}</span>}
    </span>
  );
}

function RangeBar({ style, value, ctx }: { style: RangeBarStyle; value: unknown; ctx: Ctx }) {
  const n = toNumber(value);
  if (n === undefined) return <span>{ctx.format(value)}</span>;
  const min = ctx.resolve(style.min);
  const max = ctx.resolve(style.max);
  if (min === undefined || max === undefined || max <= min) return <span>{ctx.format(value)}</span>;
  const outside = n < min || n > max;
  if (outside && style.outOfRange.mode === 'hide') return null;
  const o = style.orientation;
  const raw = (n - min) / (max - min);
  const pct =
    style.outOfRange.mode === 'overflow' ? Math.max(-0.1, Math.min(1.1, raw)) : percentOf(n, min, max);
  const markerColor = outside ? resolveThemeColor(style.outOfRange.color, ctx.theme) : undefined;
  const ranges = resolveRanges(style.ranges, ctx.resolve, ctx.theme, style.rangeValueType);
  const ref = style.reference ? ctx.resolve(style.reference.value) : undefined;
  const track = resolveThemeColor(style.track.color, ctx.theme) ?? 'var(--sg-border)';
  const back = resolveThemeColor(style.backColor, ctx.theme);
  const along = o === 'horizontal' ? 'x' : 'y';
  const trackStyle: CSSProperties =
    o === 'horizontal'
      ? {
          position: 'relative',
          width: '100%',
          height: style.track.height,
          background: track,
          borderRadius: style.track.height / 2,
        }
      : {
          position: 'relative',
          height: '100%',
          width: style.track.height,
          background: track,
          borderRadius: style.track.height / 2,
        };
  return (
    <WithText text={style.text} value={n} pct={percentOf(n, min, max)} ctx={ctx}>
      <div
        title={style.tooltip}
        data-sc-rangebar={o}
        style={{ ...FILL, justifyContent: 'center', background: back, overflow: 'visible' }}
      >
        <div style={trackStyle}>
          {ranges.map((r, i) => (
            <div
              key={i}
              data-sc-band=""
              style={{
                ...bandPos(percentOf(r.min, min, max), percentOf(r.max, min, max), o),
                background: r.color,
                borderRadius: 'inherit',
              }}
            />
          ))}
          {ref !== undefined && style.reference && (
            <div data-sc-reference="" style={markerPos(percentOf(ref, min, max), o)}>
              <MarkerGlyph
                marker={style.reference.marker}
                theme={ctx.theme}
                along={along}
                length={style.track.height * 3}
              />
            </div>
          )}
          <div data-sc-marker="" style={markerPos(pct, o)}>
            <MarkerGlyph
              marker={style.marker}
              theme={ctx.theme}
              along={along}
              length={style.track.height * 3}
              color={markerColor}
            />
          </div>
        </div>
      </div>
    </WithText>
  );
}

function IconCell({ style, value, ctx }: { style: IconStyle; value: unknown; ctx: Ctx }) {
  const text = ctx.format(value);
  const match = resolveIcon(style, value);
  let icon: ResolvedIcon;
  if (match) icon = match.icon;
  else {
    if (style.fallback.mode === 'hide') return null;
    if (style.fallback.mode === 'showText' || !style.fallback.icon) return <span>{text}</span>;
    icon = style.fallback.icon;
  }
  const glyph = <IconGlyph icon={icon} size={style.size} color={match?.color} />;
  const label = style.text === 'none' ? null : <span title={match?.description}>{text}</span>;
  return (
    <span data-sc-icon="" style={{ ...ROW, gap: style.gap, width: 'auto' }}>
      {style.text === 'before' && label}
      {glyph}
      {style.text === 'after' && label}
    </span>
  );
}

// ── Entry ────────────────────────────────────────────────────

export function StyledColumnRenderer(props: StyledColumnRendererProps) {
  const theme = useTheme(props.resolvedTheme);
  const p = props.styled;
  const fallback = (v: unknown) =>
    p?.formatValue ? p.formatValue(v, props.data) : v === null || v === undefined ? '' : String(v);
  const plain = typeof props.valueFormatted === 'string' ? props.valueFormatted : fallback(props.value);
  if (!p || !rowKindAllowed(p.rowScope, rowKindOf(props.node))) return <span>{plain}</span>;
  const ctx: Ctx = {
    theme,
    data: props.data,
    resolve: (e) => p.resolveEndpoint(e, props.data),
    format: (v) =>
      v === props.value && typeof props.valueFormatted === 'string' ? props.valueFormatted : fallback(v),
  };
  const s = p.style;
  switch (s.kind) {
    case 'gradient':
      return <Gradient style={s} value={props.value} ctx={ctx} />;
    case 'percentBar':
      return <PercentBar style={s} value={props.value} ctx={ctx} />;
    case 'badge':
      return <Badges style={s} value={props.value} ctx={ctx} pick={p.pickBadge} />;
    case 'sparkline':
      return <Sparkline style={s} value={props.value} ctx={ctx} />;
    case 'bulletChart':
      return <BulletChart style={s} value={props.value} ctx={ctx} />;
    case 'rating':
      return <Rating style={s} value={props.value} ctx={ctx} />;
    case 'rangeBar':
      return <RangeBar style={s} value={props.value} ctx={ctx} />;
    case 'icon':
      return <IconCell style={s} value={props.value} ctx={ctx} />;
  }
}

/** Spread into AG Grid's `components` so `cellRenderer: 'sgStyledColumn'` resolves. */
export const styledColumnComponents = { sgStyledColumn: StyledColumnRenderer } as const;
