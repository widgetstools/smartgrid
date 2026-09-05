import { z } from 'zod';
import { withEditor } from '../meta.js';
import { ObjectMeta } from '../primitives/common.js';
import { BooleanExpression } from '../primitives/expression.js';
import { Predicate } from '../primitives/predicate.js';

// ---------------------------------------------------------------------------
// Column-level layout properties
// ---------------------------------------------------------------------------

export const ColumnSizing = z
  .object({
    width: z.number().int().min(10).max(4000).optional(),
    flex: z.number().min(0).max(100).optional(),
    minWidth: z.number().int().min(10).optional(),
    maxWidth: z.number().int().min(10).optional(),
    resizable: z.boolean().default(true),
  })
  .refine((s) => !(s.width !== undefined && s.flex !== undefined), { message: 'Use width or flex, not both' });
export type ColumnSizing = z.infer<typeof ColumnSizing>;

export const SortOrder = z.enum(['asc', 'desc']);
export const ColumnSort = z.object({ columnId: z.string().min(1), order: SortOrder });
export type ColumnSort = z.infer<typeof ColumnSort>;

export const Pin = z.enum(['left', 'right']);

/** Per-layout column filter. Stored in the layout, as in AdapTable. */
export const ColumnFilter = withEditor(
  z.object({
    columnId: z.string().min(1),
    predicates: z.array(Predicate).min(1),
    operator: z.enum(['AND', 'OR']).default('AND'),
    enabled: z.boolean().default(true),
  }),
  { 'x-editor': 'columnFilter', title: 'Column filter' },
);
export type ColumnFilter = z.infer<typeof ColumnFilter>;

/** Per-layout grid-wide boolean filter (keep-when-true). */
export const GridFilter = withEditor(
  z.object({
    expression: BooleanExpression,
    enabled: z.boolean().default(true),
  }),
  { 'x-editor': 'gridFilter', title: 'Grid filter' },
);
export type GridFilter = z.infer<typeof GridFilter>;

// ---------------------------------------------------------------------------
// Grouping, aggregation, summaries, selection
// ---------------------------------------------------------------------------

export const RowGroupDisplayType = z.enum(['single', 'multi', 'groupRows']);

export const RowGroupExpansion = z.object({
  defaultBehavior: z.enum(['alwaysExpanded', 'alwaysCollapsed', 'expanded', 'collapsed']).default('collapsed'),
  /** Group keys (one array per level) that invert the default. */
  exceptions: z.array(z.array(z.string())).default([]),
});
export type RowGroupExpansion = z.infer<typeof RowGroupExpansion>;

export const ColumnGroupExpansion = z.object({
  defaultBehavior: z.enum(['alwaysExpanded', 'alwaysCollapsed', 'expanded', 'collapsed']).default('expanded'),
  exceptionGroupIds: z.array(z.string()).default([]),
});
export type ColumnGroupExpansion = z.infer<typeof ColumnGroupExpansion>;

export const AggregationFunction = z.union([
  z.enum(['sum', 'avg', 'min', 'max', 'count', 'first', 'last', 'only']),
  z.object({ kind: z.literal('weightedAverage'), weightColumnId: z.string().min(1) }),
  z.object({ kind: z.literal('custom'), name: z.string().min(1) }).describe('Host-registered aggregation'),
]);
export type AggregationFunction = z.infer<typeof AggregationFunction>;

export const ColumnAggregation = z.object({ columnId: z.string().min(1), aggFunc: AggregationFunction });
export type ColumnAggregation = z.infer<typeof ColumnAggregation>;

export const SummaryFunction = z.enum([
  'sum',
  'avg',
  'median',
  'mode',
  'distinct',
  'max',
  'min',
  'count',
  'weightedAverage',
  'only',
  'stdDev',
]);

/** Pinned summary row (top or bottom) with per-column functions. */
export const RowSummary = z.object({
  id: z.string().min(1),
  position: z.enum(['top', 'bottom']),
  columns: z.record(z.string(), SummaryFunction),
  weightColumnId: z.string().optional().describe('Used by weightedAverage'),
  includeOnlyFilteredRows: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type RowSummary = z.infer<typeof RowSummary>;

export const GrandTotalRow = z.enum(['none', 'top', 'bottom', 'pinnedTop', 'pinnedBottom']).default('none');

export const RowSelection = z.object({
  mode: z.enum(['none', 'singleRow', 'multiRow']).default('none'),
  checkboxes: z.boolean().default(true),
  headerCheckbox: z.boolean().default(true),
  enableClickSelection: z.union([z.boolean(), z.enum(['enableSelection', 'enableDeselection'])]).default(false),
  checkboxInGroupColumn: z.boolean().default(false),
  groupSelectMode: z.enum(['self', 'descendants', 'filteredDescendants']).default('self'),
  selectAllMode: z.enum(['all', 'filtered', 'currentPage']).default('all'),
});
export type RowSelection = z.infer<typeof RowSelection>;

// ---------------------------------------------------------------------------
// Layout kinds
// ---------------------------------------------------------------------------

const LayoutBase = ObjectMeta.extend({
  autoSizeColumns: z.boolean().default(false).describe('Auto-size on first load'),
  columnSorts: z.array(ColumnSort).default([]),
  columnPinning: z.record(z.string(), Pin).default({}),
  columnSizing: z.record(z.string(), ColumnSizing).default({}),
  columnHeaders: z.record(z.string(), z.string()).default({}).describe('Per-layout header captions'),
  columnGroupExpansion: ColumnGroupExpansion.default({ defaultBehavior: 'expanded', exceptionGroupIds: [] }),
  rowGroupExpansion: RowGroupExpansion.default({ defaultBehavior: 'collapsed', exceptions: [] }),
  rowGroupDisplayType: RowGroupDisplayType.default('single'),
  grandTotalRow: GrandTotalRow,
  suppressAggFuncInHeader: z.boolean().default(true),
  rowSelection: RowSelection.default({
    mode: 'none',
    checkboxes: true,
    headerCheckbox: true,
    enableClickSelection: false,
    checkboxInGroupColumn: false,
    groupSelectMode: 'self',
    selectAllMode: 'all',
  }),
  columnFilters: z.array(ColumnFilter).default([]),
  gridFilter: GridFilter.optional(),
  openCharts: z.array(z.string()).default([]).describe('Chart ids to open with this layout'),
});

export const TableLayout = LayoutBase.extend({
  kind: z.literal('table'),
  columns: z.array(z.string().min(1)).describe('Column ids in display order; omitted columns are hidden'),
  hiddenColumns: z.array(z.string().min(1)).default([]).describe('Columns kept in order but not shown'),
  rowGroupColumns: z.array(z.string().min(1)).default([]),
  aggregations: z.array(ColumnAggregation).default([]),
  rowSummaries: z.array(RowSummary).default([]),
});
export type TableLayout = z.infer<typeof TableLayout>;

export const PivotTotalPosition = z.enum(['none', 'before', 'after']);

export const PivotAggregation = z.object({
  columnId: z.string().min(1),
  aggFunc: AggregationFunction,
  total: z.union([PivotTotalPosition, z.array(z.object({ pivotColumnId: z.string(), position: PivotTotalPosition }))]).optional(),
});

export const PivotLayout = LayoutBase.extend({
  kind: z.literal('pivot'),
  pivotColumns: z.array(z.string().min(1)).describe('Columns whose values become result column groups'),
  rowGroupColumns: z.array(z.string().min(1)).default([]),
  aggregations: z.array(PivotAggregation).default([]),
  grandTotal: PivotTotalPosition.default('none'),
  columnTotal: PivotTotalPosition.default('none'),
  expandLevel: z.number().int().min(-1).default(-1).describe('-1 all, 0 none, n levels'),
  resultColumnOrder: z.union([z.boolean(), z.array(z.string())]).default(false),
});
export type PivotLayout = z.infer<typeof PivotLayout>;

export const Layout = withEditor(z.discriminatedUnion('kind', [TableLayout, PivotLayout]), {
  'x-editor': 'layout',
  title: 'Layout',
});
export type Layout = z.infer<typeof Layout>;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export const LayoutModule = z
  .object({
    currentLayoutId: z.string().min(1),
    layouts: z.array(Layout).min(1),
  })
  .refine((m) => m.layouts.some((l) => l.id === m.currentLayoutId), {
    message: 'currentLayoutId must reference a layout',
    path: ['currentLayoutId'],
  })
  .refine((m) => new Set(m.layouts.map((l) => l.id)).size === m.layouts.length, {
    message: 'Layout ids must be unique',
    path: ['layouts'],
  });
export type LayoutModule = z.infer<typeof LayoutModule>;

export const LAYOUT_MODULE_VERSION = 1;

export function defaultTableLayout(id: string, name: string, columns: string[]): TableLayout {
  return TableLayout.parse({ id, name, kind: 'table', columns });
}
