import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import type { CalculatedColumn, CalculatedColumnsModule, CellDataType, ColumnInfo } from '@smartgrid/schema';
import {
  columnResolver,
  columnsOf,
  compile,
  compileAggregated,
  tryParse,
  validate,
  type AggregatedProgram,
  type Compiled,
  type RowContext,
  type Value,
} from '@smartgrid/expressions';
import { colIdOf } from '../core/defs.js';
import type { BuildContext, EngineModule } from '../core/types.js';
import type { CellChange, RuntimePart } from '../runtime/runtime.js';

export const CALCULATED_COLUMN_TYPE = 'calculatedColumn';

/**
 * Live half of the calculated-columns module, registered on the runtime as
 * `runtime.part('calculatedColumns')`. Aggregated columns are cached per row
 * and recomputed lazily after a dependency changes; scalar columns compute
 * in their valueGetter.
 */
export interface CalculatedColumnsRuntimePart extends RuntimePart {
  id: 'calculatedColumns';
  /** Built calculated column ids, dependencies first. */
  order: string[];
  /** Columns the expression reads, transitively through other calculated columns. */
  dependenciesOf(columnId: string): string[];
  /** Calculated columns to refresh when `columnId` changes. */
  dependantsOf(columnId: string): string[];
  /** Value of a calculated column for a row (scalar: computed; aggregated: from the cache). */
  valueOf(columnId: string, data: Record<string, unknown>, rowId?: string): Value;
  /** Recompute every aggregated column now, from `runtime.host.getRows()`. */
  recomputeAll(): void;
}

interface BuiltColumn {
  column: CalculatedColumn;
  kind: 'scalar' | 'aggregated';
  /** Direct dependencies (resolved column ids), calculated or host. */
  deps: string[];
  scalar?: Compiled;
  program?: AggregatedProgram;
}

/**
 * Calculated columns: virtual read-only columns whose values come from an
 * expression. Runs before layout so layouts can order and hide them. Columns
 * are validated in dependency order (so chains work) and cyclic references
 * are skipped with a warning.
 */
export const calculatedColumnsModule: EngineModule<CalculatedColumnsModule> = {
  id: 'calculatedColumns',
  order: 10,
  build(ctx, data, draft) {
    const enabled = data.calculatedColumns.filter((c) => c.enabled);
    const byId = new Map(enabled.map((c) => [c.columnId, c]));
    const { order: candidates, cyclic } = orderByDependencies(enabled, ctx.columns);

    for (const id of cyclic) {
      ctx.warn(
        `Calculated column "${byId.get(id)!.name}": circular reference involving ${[...cyclic].join(', ')}; column skipped`,
      );
    }

    const { part, add } = createRuntimePart(ctx);

    for (const id of candidates) {
      const column = byId.get(id)!;
      const b = compileColumn(column, ctx);
      if (!b) continue;
      add(id, b);
      const def = buildDef(column, part, ctx);
      // A host may pre-declare the column (to nest it in a group); wire it up in place.
      const existing = draft.defs.find((d) => colIdOf(d) === id);
      if (existing) Object.assign(existing, def);
      else draft.defs.push(def);
      const info = columnInfoFor(column);
      const at = ctx.columns.findIndex((c) => c.id === id);
      if (at >= 0) ctx.columns[at] = info;
      else ctx.columns.push(info);
    }

    ctx.runtime.register(part);
  },
};

/** Column ids referenced by an expression (parse only; unknown columns are reported at validation). */
function referencedColumns(column: CalculatedColumn, resolve: (name: string) => string): string[] {
  const parsed = tryParse(column.expression.expression, {
    allowWhere: column.expression.kind === 'aggregated',
  });
  return parsed.ok ? columnsOf(parsed.ast).map(resolve) : [];
}

/**
 * Topological order over the calculated columns (dependencies first). Columns
 * on a cycle are returned in `cyclic` and excluded from `order`.
 */
function orderByDependencies(
  columns: readonly CalculatedColumn[],
  hostColumns: readonly ColumnInfo[],
): { order: string[]; cyclic: Set<string> } {
  const resolve = columnResolver([
    ...hostColumns,
    ...columns.map((c) => ({ id: c.columnId, header: c.header ?? c.name })),
  ]);
  const ids = new Set(columns.map((c) => c.columnId));
  const deps = new Map<string, string[]>();
  for (const c of columns) {
    deps.set(
      c.columnId,
      referencedColumns(c, resolve).filter((d) => ids.has(d)),
    );
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const cyclic = new Set<string>();
  const order: string[] = [];
  const visit = (id: string): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      for (const x of stack.slice(stack.indexOf(id))) cyclic.add(x);
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const d of deps.get(id) ?? []) visit(d);
    stack.pop();
    state.set(id, 'done');
    order.push(id);
  };
  for (const c of columns) visit(c.columnId);
  return { order: order.filter((id) => !cyclic.has(id)), cyclic };
}

function compileColumn(column: CalculatedColumn, ctx: BuildContext): BuiltColumn | undefined {
  const kind = column.expression.kind;
  const v = validate(column.expression.expression, {
    kind: kind === 'scalar' ? 'scalar' : 'aggregatedScalar',
    env: ctx.env,
    columns: ctx.columns,
  });
  if (!v.ok) {
    ctx.warn(
      `Calculated column "${column.name}": ${v.errors.map((e) => e.message).join('; ')}; column skipped`,
    );
    return undefined;
  }
  const opts = { resolveColumn: v.resolveColumn };
  if (kind === 'scalar') {
    return { column, kind, deps: [...new Set(v.columns)], scalar: compile(v.ast!, ctx.env, opts) };
  }
  const program = compileAggregated(v.ast!, ctx.env, opts);
  return { column, kind, deps: [...new Set([...v.columns, ...program.columns])], program };
}

function cellDataTypeFor(dataType: CellDataType): ColDef['cellDataType'] {
  switch (dataType) {
    case 'number':
    case 'text':
    case 'boolean':
    case 'date':
    case 'dateString':
    case 'object':
      return dataType;
    default:
      return 'object';
  }
}

function buildDef(column: CalculatedColumn, part: CalculatedColumnsRuntimePart, ctx: BuildContext): ColDef {
  const s = column.settings;
  const id = column.columnId;
  const expression = column.expression.expression;
  const rowIdOf = ctx.runtime.host.rowIdOf;
  const def: ColDef = {
    colId: id,
    field: undefined,
    headerName: column.header ?? column.name,
    cellDataType: cellDataTypeFor(column.dataType),
    type: [CALCULATED_COLUMN_TYPE, ...s.columnTypes],
    sortable: s.sortable,
    resizable: s.resizable,
    filter: s.filterable,
    enableRowGroup: s.groupable,
    enablePivot: s.pivotable,
    enableValue: s.aggregatable,
    suppressHeaderMenuButton: s.suppressMenu,
    suppressMovable: s.suppressMovable,
    editable: false,
    valueGetter: (p: ValueGetterParams) => {
      const data = p.data as Record<string, unknown> | undefined;
      if (!data) return undefined;
      return part.valueOf(id, data, rowIdOf(data) || p.node?.id);
    },
  };
  if (s.width !== undefined) def.width = s.width;
  if (s.headerTooltip !== undefined) def.headerTooltip = s.headerTooltip;
  if (s.showExpressionTooltip) def.tooltipValueGetter = () => expression;
  return def;
}

function columnInfoFor(column: CalculatedColumn): ColumnInfo {
  return {
    id: column.columnId,
    field: undefined,
    header: column.header ?? column.name,
    dataType: column.dataType,
    columnTypes: [CALCULATED_COLUMN_TYPE, ...column.settings.columnTypes],
    sampleValues: [],
    editable: false,
    isPrimaryKey: false,
    isSpecial: true,
  };
}

function createRuntimePart(ctx: BuildContext): {
  part: CalculatedColumnsRuntimePart;
  add(id: string, built: BuiltColumn): void;
} {
  const runtime = ctx.runtime;
  const built = new Map<string, BuiltColumn>();
  /** Aggregated column id → rowId → value. */
  const caches = new Map<string, Map<string, Value>>();
  /** Aggregated columns awaiting recompute (all of them until first read). */
  const dirty = new Set<string>();
  const transitive = new Map<string, string[]>();

  /** RowContext whose column reads fall through to calculated columns, so chains compose. */
  const contextFor = (data: Record<string, unknown>, rowId: string | undefined): RowContext => ({
    get: (columnId) => (built.has(columnId) ? valueOf(columnId, data, rowId) : (data[columnId] as Value)),
    rowId,
  });

  const isAggregated = (id: string) => built.get(id)?.kind === 'aggregated';

  const dependenciesOf = (columnId: string): string[] => {
    const hit = transitive.get(columnId);
    if (hit) return hit;
    const out: string[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
      for (const d of built.get(id)?.deps ?? []) {
        if (seen.has(d)) continue;
        seen.add(d);
        out.push(d);
        if (built.has(d)) walk(d);
      }
    };
    walk(columnId);
    if (built.has(columnId)) transitive.set(columnId, out);
    return out;
  };

  const markDirty = (ids: readonly string[]) => {
    for (const id of ids) if (isAggregated(id)) dirty.add(id);
  };

  const part: CalculatedColumnsRuntimePart = {
    id: 'calculatedColumns',
    order: [],
    dependenciesOf,
    dependantsOf: (columnId) => part.order.filter((id) => dependenciesOf(id).includes(columnId)),
    valueOf: (columnId, data, rowId) => valueOf(columnId, data, rowId),
    recomputeAll: () => {
      markDirty(part.order);
      recomputeDirty();
    },
    onCells: (changes: readonly CellChange[]) => {
      const affected = new Set<string>();
      for (const c of new Set(changes.map((c) => c.columnId))) {
        for (const d of part.dependantsOf(c)) affected.add(d);
      }
      if (affected.size === 0) return;
      const columnIds = part.order.filter((id) => affected.has(id));
      const aggregated = columnIds.some(isAggregated);
      markDirty(columnIds);
      runtime.emit({
        type: 'calculatedColumnsChanged',
        columnIds,
        rowIds: aggregated ? undefined : [...new Set(changes.map((c) => c.rowId))],
      });
    },
    onRows: () => {
      const aggregated = part.order.filter(isAggregated);
      if (aggregated.length === 0) return;
      markDirty(aggregated);
      runtime.emit({ type: 'calculatedColumnsChanged', columnIds: aggregated });
    },
    dispose: () => {
      caches.clear();
      dirty.clear();
    },
  };

  function valueOf(columnId: string, data: Record<string, unknown>, rowId: string | undefined): Value {
    const b = built.get(columnId);
    if (!b) return undefined;
    if (b.kind === 'scalar') {
      try {
        return b.scalar!(contextFor(data, rowId));
      } catch {
        return undefined;
      }
    }
    if (dirty.size) recomputeDirty();
    return caches.get(columnId)?.get(rowId ?? runtime.host.rowIdOf(data));
  }

  function recomputeDirty(): void {
    const todo = part.order.filter((id) => dirty.has(id));
    // Clear before computing so reads of a chained aggregated column do not recurse.
    for (const id of todo) dirty.delete(id);
    if (todo.length === 0) return;
    const rows = runtime.host.getRows().map((data) => contextFor(data, runtime.host.rowIdOf(data)));
    for (const id of todo) {
      const program = built.get(id)!.program!;
      const cache = new Map<string, Value>();
      caches.set(id, cache);
      let values: Value[];
      try {
        values = program.evaluateRows(rows);
      } catch {
        values = rows.map(() => undefined);
      }
      rows.forEach((row, i) => cache.set(row.rowId!, values[i]));
    }
  }

  return {
    part,
    add: (id, b) => {
      built.set(id, b);
      part.order.push(id);
      // Aggregated columns compute on first read.
      if (b.kind === 'aggregated') dirty.add(id);
    },
  };
}
