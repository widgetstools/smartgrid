import type { ColDef, GridOptions, IAggFuncParams } from 'ag-grid-community';
import type { AggregationFunction, Layout, LayoutModule, PivotLayout, TableLayout } from '@smartgrid/schema';
import { colIdOf } from '../core/defs.js';
import type { BuildContext, BuildDraft, EngineModule } from '../core/types.js';

/**
 * Layout: column order, visibility, pinning, sizing, captions, sorts,
 * row groups, aggregations, pivot and selection. Layout properties override
 * host ColDef properties exactly as AdapTable does; sizing falls back to the
 * host ColDef only when the layout has no entry.
 */
export const layoutModule: EngineModule<LayoutModule> = {
  id: 'layout',
  order: 20,
  build(ctx, data, draft) {
    const layout = data.layouts.find((l) => l.id === data.currentLayoutId);
    if (!layout) {
      ctx.warn(`Layout "${data.currentLayoutId}" not found`);
      return;
    }
    draft.defs = applyLayout(draft.defs, layout);
    Object.assign(draft.gridOptions, gridOptionsFromLayout(layout));
    (draft as BuildDraft & { hasLayout?: boolean }).hasLayout = true;
  },
};

export function currentLayout(ctx: BuildContext): Layout | undefined {
  const m = ctx.config.modules.layout?.data;
  return m?.layouts.find((l) => l.id === m.currentLayoutId);
}

export function aggFuncFor(agg: AggregationFunction): ColDef['aggFunc'] {
  if (typeof agg === 'string') {
    if (agg === 'only') return onlyAggFunc;
    return agg;
  }
  if (agg.kind === 'weightedAverage') return weightedAverageAggFunc(agg.weightColumnId);
  return agg.name;
}

function onlyAggFunc(params: IAggFuncParams): unknown {
  const values = params.values.filter((v: unknown) => v !== null && v !== undefined);
  if (values.length === 0 || values.length !== params.values.length) return null;
  return values.every((v: unknown) => v === values[0]) ? values[0] : null;
}

function weightedAverageAggFunc(weightColumnId: string) {
  return (params: IAggFuncParams): number | null => {
    let num = 0;
    let den = 0;
    for (const node of params.rowNode.allLeafChildren ?? []) {
      const v = Number(node.data?.[params.column.getColId()]);
      const w = Number(node.data?.[weightColumnId]);
      if (!Number.isFinite(v) || !Number.isFinite(w)) continue;
      num += v * w;
      den += w;
    }
    return den === 0 ? null : num / den;
  };
}

export function applyLayout(defs: ColDef[], layout: Layout): ColDef[] {
  const byId = new Map(defs.map((d) => [colIdOf(d), d]));
  const ordered: ColDef[] = [];
  const seen = new Set<string>();

  const orderList =
    layout.kind === 'table'
      ? layout.columns
      : [...layout.rowGroupColumns, ...layout.pivotColumns, ...layout.aggregations.map((a) => a.columnId)];
  for (const id of orderList) {
    const d = byId.get(id);
    if (d && !seen.has(id)) {
      ordered.push(d);
      seen.add(id);
    }
  }
  // Columns not named in the layout stay available but hidden.
  for (const d of defs) {
    const id = colIdOf(d);
    if (!seen.has(id)) {
      ordered.push({ ...d, hide: true });
      seen.add(id);
    }
  }

  const sortIndex = new Map(layout.columnSorts.map((s, i) => [s.columnId, { order: s.order, index: i }]));
  const hidden = new Set(layout.kind === 'table' ? layout.hiddenColumns : []);
  const rowGroups = layout.rowGroupColumns;
  const aggs = new Map(layout.aggregations.map((a) => [a.columnId, a.aggFunc]));
  const pivots = new Set(layout.kind === 'pivot' ? layout.pivotColumns : []);

  return ordered.map((d) => {
    const id = colIdOf(d);
    const out: ColDef = { ...d };
    if (hidden.has(id)) out.hide = true;
    else if (!out.hide) out.hide = false;

    out.pinned = layout.columnPinning[id] ?? null;

    const sizing = layout.columnSizing[id];
    if (sizing) {
      if (sizing.width !== undefined) {
        out.width = sizing.width;
        out.flex = undefined;
      }
      if (sizing.flex !== undefined) out.flex = sizing.flex;
      if (sizing.minWidth !== undefined) out.minWidth = sizing.minWidth;
      if (sizing.maxWidth !== undefined) out.maxWidth = sizing.maxWidth;
      out.resizable = sizing.resizable;
    }

    const caption = layout.columnHeaders[id];
    if (caption !== undefined) out.headerName = caption;

    const s = sortIndex.get(id);
    out.sort = s ? s.order : null;
    out.sortIndex = s ? s.index : null;

    const rg = rowGroups.indexOf(id);
    out.rowGroup = rg >= 0;
    out.rowGroupIndex = rg >= 0 ? rg : null;
    if (rg >= 0) out.hide = true;

    const agg = aggs.get(id);
    out.aggFunc = agg ? aggFuncFor(agg) : null;

    if (layout.kind === 'pivot') {
      out.pivot = pivots.has(id);
      out.pivotIndex = pivots.has(id) ? layout.pivotColumns.indexOf(id) : null;
    } else {
      out.pivot = false;
    }
    return out;
  });
}

export function gridOptionsFromLayout(layout: Layout): GridOptions {
  const sel = layout.rowSelection;
  const opts: GridOptions = {
    groupDisplayType:
      layout.rowGroupDisplayType === 'single'
        ? 'singleColumn'
        : layout.rowGroupDisplayType === 'multi'
          ? 'multipleColumns'
          : 'groupRows',
    suppressAggFuncInHeader: layout.suppressAggFuncInHeader,
    groupDefaultExpanded:
      layout.rowGroupExpansion.defaultBehavior === 'expanded' ||
      layout.rowGroupExpansion.defaultBehavior === 'alwaysExpanded'
        ? -1
        : 0,
    grandTotalRow: layout.grandTotalRow === 'none' ? undefined : layout.grandTotalRow,
    pivotMode: layout.kind === 'pivot',
    rowSelection:
      sel.mode === 'none'
        ? undefined
        : sel.mode === 'singleRow'
          ? { mode: 'singleRow', checkboxes: sel.checkboxes, enableClickSelection: sel.enableClickSelection }
          : {
              mode: 'multiRow',
              checkboxes: sel.checkboxes,
              headerCheckbox: sel.headerCheckbox,
              enableClickSelection: sel.enableClickSelection,
              groupSelects: sel.groupSelectMode,
              selectAll: sel.selectAllMode,
            },
  };
  if (layout.kind === 'pivot') {
    const p: PivotLayout = layout;
    opts.pivotDefaultExpanded = p.expandLevel;
    opts.pivotRowTotals = p.grandTotal === 'none' ? undefined : p.grandTotal;
    opts.pivotColumnGroupTotals = p.columnTotal === 'none' ? undefined : p.columnTotal;
  }
  if (layout.kind === 'table') {
    const t: TableLayout = layout;
    if (t.autoSizeColumns) opts.autoSizeStrategy = { type: 'fitCellContents' };
  }
  return opts;
}
