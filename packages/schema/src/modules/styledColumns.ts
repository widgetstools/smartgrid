import { z } from 'zod';
import { withEditor } from '../meta.js';
import { ColumnId } from '../primitives/column.js';
import { Icon, ObjectMeta } from '../primitives/common.js';
import { Rule } from '../primitives/rule.js';
import { RowScope } from '../primitives/scope.js';
import { FontStyle, Style, ThemeColor } from '../primitives/style.js';

/**
 * Styled columns: data-driven cell renderers bound to one column each.
 * Eight kinds, as in AdapTable: gradient, percent bar, badge, sparkline,
 * bullet chart, rating, range bar and icon. Numeric endpoints may be
 * literal numbers, column statistics (`Col-Min` …) or another column's
 * value in the same row.
 */

export const ColumnStat = z.enum(['Col-Min', 'Col-Max', 'Col-Avg', 'Col-Median']);
export type ColumnStat = z.infer<typeof ColumnStat>;

export const RangeEndpoint = z.union([
  z.number(),
  ColumnStat,
  z.object({ columnId: ColumnId }).describe('Value of another column in the same row'),
]);
export type RangeEndpoint = z.infer<typeof RangeEndpoint>;

export const CellColorRange = z.object({
  min: RangeEndpoint,
  max: RangeEndpoint,
  color: ThemeColor,
  reverseGradient: z.boolean().default(false),
  minAlpha: z.number().min(0).max(1).optional(),
  maxAlpha: z.number().min(0).max(1).optional(),
});
export type CellColorRange = z.infer<typeof CellColorRange>;

export const RangeValueType = z.enum(['number', 'percentage']).default('number');

export const MarkerShape = z.enum(['line', 'circle', 'diamond', 'triangle', 'square']);
export const Marker = z.object({
  shape: MarkerShape.default('line'),
  color: ThemeColor.optional(),
  size: z.number().min(1).max(32).default(2),
});
export type Marker = z.infer<typeof Marker>;

const CellText = z.object({
  show: z.enum(['none', 'value', 'percentage']).default('value'),
  position: z.enum(['inside', 'after', 'before']).default('inside'),
  color: ThemeColor.optional(),
});

export const GradientStyle = z.object({
  kind: z.literal('gradient'),
  rangeValueType: RangeValueType,
  ranges: z.array(CellColorRange).default([]),
  zeroCentred: z.object({ negativeColor: ThemeColor, positiveColor: ThemeColor }).optional(),
  columnComparison: z.object({ min: RangeEndpoint, max: RangeEndpoint, color: ThemeColor }).optional(),
  minAlpha: z.number().min(0).max(1).default(0.15),
  maxAlpha: z.number().min(0).max(1).default(1),
  autoContrastText: z.boolean().default(true),
  font: FontStyle.optional(),
  tooltip: z.string().optional(),
});

export const PercentBarStyle = z.object({
  kind: z.literal('percentBar'),
  rangeValueType: RangeValueType,
  ranges: z.array(CellColorRange).min(1),
  origin: z.union([z.enum(['auto', 'zero', 'min']), z.number()]).default('auto'),
  backColor: ThemeColor.optional(),
  text: CellText.prefault({}),
  font: FontStyle.optional(),
  tooltip: z.string().optional(),
});

export const BadgeShape = z.enum(['pill', 'rounded', 'square']);
export const Badge = z.object({
  shape: BadgeShape.default('pill'),
  style: Style.prefault({}),
  /** First badge whose rule matches wins; a badge without a rule always matches. */
  rule: Rule.optional(),
  icon: Icon.optional(),
  iconPosition: z.enum(['start', 'end']).default('start'),
  iconOnly: z.boolean().default(false),
  /** Text shown instead of the value (templates: [value]). */
  label: z.string().optional(),
});
export type Badge = z.infer<typeof Badge>;

export const BadgeStyle = z.object({
  kind: z.literal('badge'),
  badges: z.array(Badge).min(1),
  density: z.enum(['compact', 'normal', 'comfortable']).default('normal'),
  overflow: z.enum(['truncate', 'wrap', 'scroll']).default('truncate'),
  font: FontStyle.optional(),
});

export const SparklineStyle = z.object({
  kind: z.literal('sparkline'),
  type: z.enum(['line', 'area', 'bar', 'column']).default('line'),
  color: ThemeColor.optional(),
  fill: ThemeColor.optional(),
  showMarkers: z.boolean().default(false),
  showZeroLine: z.boolean().default(false),
  /** Passed through to the host sparkline renderer. */
  options: z.record(z.string(), z.unknown()).optional(),
});

export const BulletChartStyle = z.object({
  kind: z.literal('bulletChart'),
  rangeValueType: RangeValueType,
  ranges: z.array(CellColorRange).default([]),
  target: RangeEndpoint.optional(),
  targetMarker: Marker.prefault({ shape: 'line', size: 2 }),
  bar: z
    .object({ color: ThemeColor.optional(), height: z.number().min(1).max(100).default(50) })
    .prefault({}),
  origin: z.union([z.enum(['auto', 'zero', 'min']), z.number()]).default('zero'),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  backColor: ThemeColor.optional(),
  text: CellText.prefault({ show: 'none' }),
  tooltip: z.string().optional(),
});

export const RatingStyle = z.object({
  kind: z.literal('rating'),
  icon: z.enum(['star', 'heart', 'circle', 'thumb']).default('star'),
  max: z.number().int().min(1).max(20).default(5),
  size: z.number().int().min(8).max(48).default(14),
  gap: z.number().int().min(0).max(16).default(2),
  filledColor: ThemeColor.optional(),
  emptyColor: ThemeColor.optional(),
  allowHalf: z.boolean().default(true),
  showValue: z.boolean().default(false),
  tooltip: z.string().optional(),
});

export const RangeBarStyle = z.object({
  kind: z.literal('rangeBar'),
  min: RangeEndpoint,
  max: RangeEndpoint,
  reference: z.object({ value: RangeEndpoint, marker: Marker.prefault({}) }).optional(),
  marker: Marker.prefault({ shape: 'circle', size: 8 }),
  track: z
    .object({ color: ThemeColor.optional(), height: z.number().min(1).max(32).default(4) })
    .prefault({}),
  ranges: z.array(CellColorRange).default([]),
  rangeValueType: RangeValueType,
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  backColor: ThemeColor.optional(),
  text: CellText.prefault({ show: 'none' }),
  outOfRange: z
    .object({ mode: z.enum(['clamp', 'overflow', 'hide']).default('clamp'), color: ThemeColor.optional() })
    .prefault({}),
  tooltip: z.string().optional(),
});

export const IconMapping = z.object({
  key: z.string().describe('Cell value to match'),
  icon: Icon,
  description: z.string().optional(),
});

export const IconStyle = z.object({
  kind: z.literal('icon'),
  preset: z.enum(['flags', 'currencies', 'trend', 'status']).optional(),
  mappings: z.array(IconMapping).default([]),
  matchMode: z.enum(['exact', 'caseInsensitive']).default('caseInsensitive'),
  fallback: z
    .object({ mode: z.enum(['hide', 'showText', 'icon']).default('showText'), icon: Icon.optional() })
    .prefault({}),
  text: z
    .enum(['none', 'before', 'after'])
    .default('after')
    .describe('Where the cell value shows relative to the icon'),
  size: z.number().int().min(8).max(64).default(18),
  gap: z.number().int().min(0).max(24).default(4),
  font: FontStyle.optional(),
});

export const StyledColumnStyle = z.discriminatedUnion('kind', [
  GradientStyle,
  PercentBarStyle,
  BadgeStyle,
  SparklineStyle,
  BulletChartStyle,
  RatingStyle,
  RangeBarStyle,
  IconStyle,
]);
export type StyledColumnStyle = z.infer<typeof StyledColumnStyle>;
export type StyledColumnKind = StyledColumnStyle['kind'];

export const STYLED_COLUMN_KINDS = [
  'gradient',
  'percentBar',
  'badge',
  'sparkline',
  'bulletChart',
  'rating',
  'rangeBar',
  'icon',
] as const;

/** Which kinds a column data type supports (mirrors AdapTable's availability matrix). */
export function styledColumnKindsFor(dataType: string): readonly StyledColumnKind[] {
  switch (dataType) {
    case 'number':
      return ['gradient', 'percentBar', 'bulletChart', 'rangeBar', 'rating', 'badge', 'icon'];
    case 'text':
    case 'boolean':
    case 'date':
    case 'dateString':
      return ['badge', 'icon'];
    case 'textArray':
      return ['badge'];
    case 'numberArray':
    case 'tupleArray':
    case 'objectArray':
      return ['badge', 'sparkline'];
    default:
      return [];
  }
}

export const StyledColumn = withEditor(
  ObjectMeta.extend({
    columnId: ColumnId,
    style: StyledColumnStyle,
    rowScope: RowScope.optional(),
  }),
  { 'x-editor': 'styledColumn', title: 'Styled column' },
);
export type StyledColumn = z.infer<typeof StyledColumn>;

export const StyledColumnsModule = z
  .object({
    styledColumns: z.array(StyledColumn).default([]),
  })
  .refine(
    (m) => {
      const active = m.styledColumns.filter((s) => s.enabled).map((s) => s.columnId);
      return new Set(active).size === active.length;
    },
    { message: 'Only one enabled styled column per column', path: ['styledColumns'] },
  );
export type StyledColumnsModule = z.infer<typeof StyledColumnsModule>;

export const STYLED_COLUMNS_MODULE_VERSION = 1;
