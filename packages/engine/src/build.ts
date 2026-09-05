import type {
  CellClassParams,
  ColDef,
  ColGroupDef,
  GridOptions,
  IAggFuncParams,
  ValueFormatterParams,
} from 'ag-grid-community';
import type {
  AggregationFunction,
  ColumnInfo,
  FormatColumn,
  FormattingModule,
  Layout,
  PivotLayout,
  Rule,
  TableLayout,
  TypedGridConfig,
} from '@smartgrid/schema';
import { defaultPredicateRegistry, type PredicateContext, type PredicateRegistry } from '@smartgrid/expressions';
import { buildValueFormatter, type FormatContext, type ValueFormatterFn } from './formatters.js';
import { buildStylesheet, type StyleRule } from './styles.js';
import { columnsInScope, rowKindAllowed } from './scope.js';

export interface BuildInput {
  config: TypedGridConfig;
  /** Host column definitions: field, colId, cellDataType, editable, custom types. */
  baseColumnDefs: (ColDef | ColGroupDef)[];
  columns: readonly ColumnInfo[];
  predicates?: PredicateRegistry;
  predicateContext?: PredicateContext;
  customFormatters?: FormatContext['customFormatters'];
  /** Emitted for rules the engine cannot evaluate yet (expressions before M1). */
  onWarning?: (message: string) => void;
}

export interface BuildOutput {
  columnDefs: (ColDef | ColGroupDef)[];
  gridOptions: GridOptions;
  /** Stylesheet to inject once per grid instance. */
  css: string;
  warnings: string[];
}

const FC_CLASS = (id: string) => `sg-fc-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/**
 * Build AG Grid inputs from the config document. Pure: no grid API calls.
 * Layout properties override host ColDef properties (hide, pinned, sort,
 * rowGroup, aggFunc, width) exactly as AdapTable does; sizing falls back to the
 * host ColDef only when the layout has no entry.
 */
export function buildGrid(input: BuildInput): BuildOutput {
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    input.onWarning?.(m);
  };
  const layoutModule = input.config.modules.layout?.data;
  const layout = layoutModule?.layouts.find((l) => l.id === layoutModule.currentLayoutId);
  const formatting = input.config.modules.formatting?.data;

  const flat = flattenDefs(input.baseColumnDefs);
  let defs: ColDef[] = flat.map((d) => ({ ...d }));

  if (layout) defs = applyLayout(defs, layout);
  const css = formatting ? applyFormatting(defs, formatting, input, warn) : '';

  return {
    columnDefs: layout ? defs : restoreGroups(input.baseColumnDefs, defs),
    gridOptions: layout ? gridOptionsFromLayout(layout) : {},
    css,
    warnings,
  };
}

function colIdOf(d: ColDef): string {
  return d.colId ?? d.field ?? '';
}

function flattenDefs(defs: (ColDef | ColGroupDef)[]): ColDef[] {
  const out: ColDef[] = [];
  for (const d of defs) {
    if ('children' in d && Array.isArray(d.children)) out.push(...flattenDefs(d.children));
    else out.push(d as ColDef);
  }
  return out;
}

/** Without a layout, keep the host's group structure but with formatting applied. */
function restoreGroups(base: (ColDef | ColGroupDef)[], flat: ColDef[]): (ColDef | ColGroupDef)[] {
  const byId = new Map(flat.map((d) => [colIdOf(d), d]));
  const walk = (defs: (ColDef | ColGroupDef)[]): (ColDef | ColGroupDef)[] =>
    defs.map((d) => ('children' in d && Array.isArray(d.children) ? { ...d, children: walk(d.children) } : byId.get(colIdOf(d as ColDef)) ?? d));
  return walk(base);
}

function aggFuncFor(agg: AggregationFunction): ColDef['aggFunc'] {
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

function applyLayout(defs: ColDef[], layout: Layout): ColDef[] {
  const byId = new Map(defs.map((d) => [colIdOf(d), d]));
  const ordered: ColDef[] = [];
  const seen = new Set<string>();

  const orderList = layout.kind === 'table' ? layout.columns : [...layout.rowGroupColumns, ...layout.pivotColumns, ...layout.aggregations.map((a) => a.columnId)];
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

function gridOptionsFromLayout(layout: Layout): GridOptions {
  const sel = layout.rowSelection;
  const opts: GridOptions = {
    groupDisplayType: layout.rowGroupDisplayType === 'single' ? 'singleColumn' : layout.rowGroupDisplayType === 'multi' ? 'multipleColumns' : 'groupRows',
    suppressAggFuncInHeader: layout.suppressAggFuncInHeader,
    grandTotalRow: layout.grandTotalRow === 'none' ? undefined : layout.grandTotalRow,
    groupDefaultExpanded:
      layout.rowGroupExpansion.defaultBehavior === 'alwaysExpanded' || layout.rowGroupExpansion.defaultBehavior === 'expanded' ? -1 : 0,
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

interface CompiledRule {
  test: (value: unknown, rowData: Record<string, unknown> | undefined, previousValue: unknown) => boolean;
}

function compileRule(
  rule: Rule | undefined,
  registry: PredicateRegistry,
  ctx: PredicateContext,
  warn: (m: string) => void,
  name: string,
): CompiledRule | undefined {
  if (!rule) return { test: () => true };
  if (rule.kind === 'expression') {
    warn(`Format column "${name}": expression rules are evaluated from M1; rule skipped`);
    return undefined;
  }
  const preds = rule.predicates;
  const op = rule.operator;
  return {
    test: (value, rowData, previousValue) => {
      const results = preds.map((p) => {
        const v = p.columnId ? rowData?.[p.columnId] : value;
        return registry.evaluate(p, v, { ...ctx, previousValue });
      });
      return op === 'AND' ? results.every(Boolean) : results.some(Boolean);
    },
  };
}

function applyFormatting(defs: ColDef[], formatting: FormattingModule, input: BuildInput, warn: (m: string) => void): string {
  const registry = input.predicates ?? defaultPredicateRegistry;
  const ctx = input.predicateContext ?? {};
  const active = formatting.formatColumns.filter((fc) => fc.enabled);

  // Precedence: earlier in the array wins. CSS cascade makes later rules win,
  // so emit the stylesheet in reverse order.
  const styleRules: StyleRule[] = [];
  const perColumn = new Map<string, { fc: FormatColumn; compiled: CompiledRule; formatter?: ValueFormatterFn }[]>();

  for (const fc of active) {
    const compiled = compileRule(fc.rule, registry, ctx, warn, fc.name);
    if (!compiled) continue;
    const formatter = fc.displayFormat ? buildValueFormatter(fc.displayFormat) : undefined;
    if (fc.style) styleRules.push({ className: FC_CLASS(fc.id), style: fc.style });
    for (const colId of columnsInScope(fc.scope, input.columns)) {
      const list = perColumn.get(colId) ?? [];
      list.push({ fc, compiled, formatter });
      perColumn.set(colId, list);
    }
  }

  for (const d of defs) {
    const entries = perColumn.get(colIdOf(d));
    if (!entries?.length) continue;
    const info = input.columns.find((c) => c.id === colIdOf(d));
    const header = info?.header ?? d.headerName ?? colIdOf(d);

    const cellClassRules: NonNullable<ColDef['cellClassRules']> = { ...(d.cellClassRules ?? {}) };
    const headerRules = entries.filter((e) => e.fc.target === 'header' && e.fc.style);
    const cellEntries = entries.filter((e) => e.fc.target === 'cell');

    for (const e of cellEntries) {
      if (!e.fc.style) continue;
      cellClassRules[FC_CLASS(e.fc.id)] = (p: CellClassParams) =>
        rowKindAllowed(e.fc.rowScope, kindOf(p)) && e.compiled.test(p.value, p.data, undefined);
    }
    if (Object.keys(cellClassRules).length) d.cellClassRules = cellClassRules;

    if (headerRules.length) {
      d.headerClass = [...(Array.isArray(d.headerClass) ? d.headerClass : d.headerClass ? [String(d.headerClass)] : []), ...headerRules.map((e) => FC_CLASS(e.fc.id))];
    }

    const formatted = cellEntries.filter((e) => e.formatter);
    if (formatted.length) {
      const hostFormatter = typeof d.valueFormatter === 'function' ? d.valueFormatter : undefined;
      d.valueFormatter = (p: ValueFormatterParams) => {
        const fctx: FormatContext = { columnHeader: header, rowData: p.data, customFormatters: input.customFormatters };
        for (const e of formatted) {
          if (rowKindAllowed(e.fc.rowScope, kindOf(p)) && e.compiled.test(p.value, p.data, undefined)) return e.formatter!(p.value, fctx);
        }
        return hostFormatter ? hostFormatter(p) : p.value === null || p.value === undefined ? '' : String(p.value);
      };
    }
  }

  return buildStylesheet([...styleRules].reverse());
}

function kindOf(p: { node?: { group?: boolean; rowPinned?: string | null; footer?: boolean } | null }) {
  const node = p.node;
  return {
    isGroup: !!node?.group && !node?.footer,
    isSummary: !!node?.rowPinned && !node?.footer,
    isTotal: !!node?.footer,
  };
}
