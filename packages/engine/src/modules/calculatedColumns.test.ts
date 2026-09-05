import { describe, expect, it } from 'vitest';
import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import {
  CalculatedColumn,
  createGridConfig,
  defaultTableLayout,
  type CellDataType,
  type ColumnInfo,
  type TypedGridConfig,
} from '@smartgrid/schema';
import { buildGrid } from '../build.js';
import type { BuildOutput, RuntimeEvent } from '../core/types.js';
import { GridRuntime } from '../runtime/runtime.js';
import type { CalculatedColumnsRuntimePart } from './calculatedColumns.js';

const col = (id: string, header: string, dataType: CellDataType): ColumnInfo => ({
  id,
  header,
  dataType,
  columnTypes: [],
  sampleValues: [],
  editable: false,
  isPrimaryKey: false,
  isSpecial: false,
});
const columns: ColumnInfo[] = [
  col('desk', 'Desk', 'text'),
  col('pnl', 'PnL', 'number'),
  col('qty', 'Qty', 'number'),
];
const baseDefs: ColDef[] = columns.map((c) => ({
  field: c.id,
  headerName: c.header,
  cellDataType: c.dataType,
}));

function calc(
  columnId: string,
  expression: string,
  kind: 'scalar' | 'aggregated' = 'scalar',
  extra: Record<string, unknown> = {},
): CalculatedColumn {
  return CalculatedColumn.parse({
    id: columnId,
    name: columnId,
    columnId,
    expression: { kind, expression },
    ...extra,
  });
}

function config(...calculatedColumns: CalculatedColumn[]): TypedGridConfig {
  const cfg = createGridConfig('g');
  cfg.modules.calculatedColumns = { v: 1, data: { calculatedColumns } };
  return cfg;
}

const defOf = (out: BuildOutput, id: string) => (out.columnDefs as ColDef[]).find((d) => d.colId === id);

function valueOf(def: ColDef, data: Record<string, unknown> | undefined, rowId?: string): unknown {
  const getter = def.valueGetter as (p: ValueGetterParams) => unknown;
  return getter({ data, node: rowId ? { id: rowId } : null } as unknown as ValueGetterParams);
}

const partOf = (out: BuildOutput) => out.runtime.part<CalculatedColumnsRuntimePart>('calculatedColumns')!;

describe('calculated columns: scalar', () => {
  it('adds a read-only column whose valueGetter evaluates the expression against the row', () => {
    const out = buildGrid({
      config: config(calc('notional', '[pnl] * [qty]', 'scalar', { header: 'Notional' })),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings).toEqual([]);
    const def = defOf(out, 'notional')!;
    expect(def).toMatchObject({
      colId: 'notional',
      headerName: 'Notional',
      cellDataType: 'number',
      type: ['calculatedColumn'],
      editable: false,
      sortable: true,
      resizable: true,
      filter: true,
      enableRowGroup: false,
      enablePivot: false,
      enableValue: false,
      suppressHeaderMenuButton: false,
      suppressMovable: false,
    });
    expect(def.field).toBeUndefined();
    expect(valueOf(def, { pnl: 2.5, qty: 4 })).toBe(10);
    expect(valueOf(def, undefined)).toBeUndefined();
    expect(out.columns.find((c) => c.id === 'notional')).toMatchObject({
      header: 'Notional',
      dataType: 'number',
      columnTypes: ['calculatedColumn'],
      isSpecial: true,
      editable: false,
    });
    expect(partOf(out).order).toEqual(['notional']);
  });

  it('maps settings onto the ColDef', () => {
    const out = buildGrid({
      config: config(
        calc('flag', "[pnl] > 0 ? 'up' : 'down'", 'scalar', {
          dataType: 'text',
          settings: {
            width: 90,
            groupable: true,
            pivotable: true,
            aggregatable: true,
            suppressMenu: true,
            suppressMovable: true,
            columnTypes: ['custom'],
            headerTooltip: 'Direction',
            showExpressionTooltip: true,
          },
        }),
      ),
      baseColumnDefs: baseDefs,
      columns,
    });
    const def = defOf(out, 'flag')!;
    expect(def).toMatchObject({
      width: 90,
      cellDataType: 'text',
      type: ['calculatedColumn', 'custom'],
      enableRowGroup: true,
      enablePivot: true,
      enableValue: true,
      suppressHeaderMenuButton: true,
      suppressMovable: true,
      headerTooltip: 'Direction',
    });
    expect((def.tooltipValueGetter as () => string)()).toBe("[pnl] > 0 ? 'up' : 'down'");
    expect(valueOf(def, { pnl: -1 })).toBe('down');
  });

  it('returns undefined rather than throwing when evaluation fails', () => {
    const out = buildGrid({
      config: config(calc('bad', "DIFF_DAYS([desk], 'x')", 'scalar')),
      baseColumnDefs: baseDefs,
      columns,
    });
    const def = defOf(out, 'bad');
    if (def) expect(valueOf(def, { desk: 'not a date' })).toBeUndefined();
  });

  it('warns and skips a column whose expression is invalid', () => {
    const out = buildGrid({
      config: config(calc('bad', '[nope] +'), calc('ok', '[pnl] * 2')),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/^Calculated column "bad": .*column skipped$/);
    expect(defOf(out, 'bad')).toBeUndefined();
    expect(defOf(out, 'ok')).toBeDefined();
    expect(partOf(out).order).toEqual(['ok']);
  });

  it('skips disabled columns', () => {
    const out = buildGrid({
      config: config(calc('off', '[pnl] * 2', 'scalar', { enabled: false })),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(defOf(out, 'off')).toBeUndefined();
    expect(out.columns.map((c) => c.id)).toEqual(['desk', 'pnl', 'qty']);
  });

  it('wires up a host-declared ColDef with the same colId instead of duplicating it', () => {
    const out = buildGrid({
      config: config(calc('notional', '[pnl] * [qty]')),
      baseColumnDefs: [...baseDefs, { colId: 'notional', type: 'calculatedColumn', pinned: 'right' }],
      columns,
    });
    const defs = (out.columnDefs as ColDef[]).filter((d) => d.colId === 'notional');
    expect(defs).toHaveLength(1);
    expect(defs[0]!.pinned).toBe('right');
    expect(valueOf(defs[0]!, { pnl: 3, qty: 3 })).toBe(9);
  });
});

describe('calculated columns: dependencies', () => {
  it('validates and orders chained columns regardless of array order, resolving friendly names', () => {
    const out = buildGrid({
      config: config(
        calc('double', '[Notional] * 2'),
        calc('notional', '[PnL] * [qty]', 'scalar', { header: 'Notional' }),
      ),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings).toEqual([]);
    const part = partOf(out);
    expect(part.order).toEqual(['notional', 'double']);
    expect(valueOf(defOf(out, 'double')!, { pnl: 2, qty: 5 })).toBe(20);
    expect(part.dependenciesOf('double')).toEqual(['notional', 'pnl', 'qty']);
    expect(part.dependenciesOf('notional')).toEqual(['pnl', 'qty']);
    expect(part.dependantsOf('pnl')).toEqual(['notional', 'double']);
    expect(part.dependantsOf('notional')).toEqual(['double']);
    expect(part.dependantsOf('desk')).toEqual([]);
    // Defs keep dependency order too, so a layout-less grid shows them sensibly.
    expect((out.columnDefs as ColDef[]).map((d) => d.colId ?? d.field)).toEqual([
      'desk',
      'pnl',
      'qty',
      'notional',
      'double',
    ]);
  });

  it('warns about and skips cyclic columns while keeping the rest', () => {
    const out = buildGrid({
      config: config(
        calc('a', '[b] + 1'),
        calc('b', '[a] + 1'),
        calc('c', '[pnl] * 2'),
        calc('d', '[a] * 2'),
      ),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings.filter((w) => /circular reference involving a, b/.test(w))).toHaveLength(2);
    // d depends on a cyclic column, so it fails column resolution.
    expect(out.warnings.some((w) => /Calculated column "d": Unknown column \[a\]/.test(w))).toBe(true);
    expect(defOf(out, 'a')).toBeUndefined();
    expect(defOf(out, 'b')).toBeUndefined();
    expect(defOf(out, 'd')).toBeUndefined();
    expect(defOf(out, 'c')).toBeDefined();
    expect(partOf(out).order).toEqual(['c']);
  });

  it('emits calculatedColumnsChanged with row ids when a scalar dependency changes', () => {
    const runtime = new GridRuntime({ getRows: () => [], rowIdOf: (d) => String(d['id']) });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((e) => events.push(e));
    buildGrid({ config: config(calc('double', '[pnl] * 2')), baseColumnDefs: baseDefs, columns, runtime });
    runtime.cellsChanged([{ rowId: 'r1', columnId: 'qty', oldValue: 1, newValue: 2, data: {}, at: 0 }]);
    expect(events).toEqual([]);
    runtime.cellsChanged([
      { rowId: 'r1', columnId: 'pnl', oldValue: 1, newValue: 2, data: {}, at: 0 },
      { rowId: 'r2', columnId: 'pnl', oldValue: 1, newValue: 3, data: {}, at: 0 },
    ]);
    expect(events).toEqual([
      { type: 'calculatedColumnsChanged', columnIds: ['double'], rowIds: ['r1', 'r2'] },
    ]);
  });
});

describe('calculated columns: aggregated', () => {
  const rows = () => [
    { id: '1', desk: 'rates', pnl: 10, qty: 1 },
    { id: '2', desk: 'rates', pnl: 5, qty: 2 },
    { id: '3', desk: 'credit', pnl: 7, qty: 3 },
  ];

  function setup(...extra: CalculatedColumn[]) {
    const data = rows();
    const runtime = new GridRuntime({ getRows: () => data, rowIdOf: (d) => String(d['id']) });
    const events: RuntimeEvent[] = [];
    runtime.subscribe((e) => events.push(e));
    const out = buildGrid({
      config: config(calc('deskTotal', 'SUM([pnl], GROUP_BY([desk]))', 'aggregated'), ...extra),
      baseColumnDefs: baseDefs,
      columns,
      runtime,
    });
    return { data, runtime, events, out, def: defOf(out, 'deskTotal')! };
  }

  it('computes per-row group aggregates from the host rows', () => {
    const { out, def, data } = setup();
    expect(out.warnings).toEqual([]);
    expect(valueOf(def, data[0], '1')).toBe(15);
    expect(valueOf(def, data[1], '2')).toBe(15);
    expect(valueOf(def, data[2], '3')).toBe(7);
    expect(valueOf(def, undefined)).toBeUndefined();
    expect(partOf(out).dependenciesOf('deskTotal').sort()).toEqual(['desk', 'pnl']);
    expect(partOf(out).dependantsOf('desk')).toEqual(['deskTotal']);
  });

  it('recomputes after a dependency changes and emits calculatedColumnsChanged once', () => {
    const { runtime, events, def, data } = setup();
    expect(valueOf(def, data[0], '1')).toBe(15);
    data[0]!.pnl = 20;
    runtime.cellsChanged([
      { rowId: '1', columnId: 'pnl', oldValue: 10, newValue: 20, data: data[0]!, at: 0 },
    ]);
    expect(events).toEqual([
      { type: 'calculatedColumnsChanged', columnIds: ['deskTotal'], rowIds: undefined },
    ]);
    expect(valueOf(def, data[0], '1')).toBe(25);
    expect(valueOf(def, data[1], '2')).toBe(25);
    // Reading again does not emit.
    expect(events).toHaveLength(1);
    // Unrelated columns do not trigger a recompute.
    runtime.cellsChanged([{ rowId: '1', columnId: 'qty', oldValue: 1, newValue: 9, data: data[0]!, at: 0 }]);
    expect(events).toHaveLength(1);
  });

  it('recomputes when rows are added or removed', () => {
    const { runtime, events, def, data } = setup();
    expect(valueOf(def, data[2], '3')).toBe(7);
    data.push({ id: '4', desk: 'credit', pnl: 3, qty: 1 });
    runtime.rowsChanged([{ kind: 'added', rowId: '4', data: data[3]!, at: 0 }]);
    expect(events).toEqual([{ type: 'calculatedColumnsChanged', columnIds: ['deskTotal'] }]);
    expect(valueOf(def, data[2], '3')).toBe(10);
    expect(valueOf(def, data[3], '4')).toBe(10);
  });

  it('recomputeAll refreshes the cache without emitting', () => {
    const { runtime, events, def, data, out } = setup();
    expect(valueOf(def, data[0], '1')).toBe(15);
    data[1]!.pnl = 100;
    partOf(out).recomputeAll();
    expect(valueOf(def, data[0], '1')).toBe(110);
    expect(events).toEqual([]);
    expect(runtime.part('calculatedColumns')).toBe(partOf(out));
  });

  it('lets scalar columns read aggregated ones and aggregated columns read scalar ones', () => {
    const { out, data } = setup(
      calc('share', '[pnl] / [deskTotal] * 100'),
      calc('weighted', 'SUM([notional], GROUP_BY([desk]))', 'aggregated'),
      calc('notional', '[pnl] * [qty]'),
    );
    expect(out.warnings).toEqual([]);
    expect(partOf(out).order).toEqual(['deskTotal', 'share', 'notional', 'weighted']);
    expect(valueOf(defOf(out, 'share')!, data[0], '1')).toBeCloseTo((10 / 15) * 100);
    expect(valueOf(defOf(out, 'weighted')!, data[0], '1')).toBe(10 * 1 + 5 * 2);
    expect(partOf(out).dependantsOf('qty')).toEqual(['notional', 'weighted']);
  });
});

describe('calculated columns: layout', () => {
  it('lets the layout order and hide calculated columns', () => {
    const cfg = config(calc('notional', '[pnl] * [qty]'), calc('double', '[notional] * 2'));
    cfg.modules.layout = {
      v: 1,
      data: { currentLayoutId: 'l', layouts: [defaultTableLayout('l', 'L', ['notional', 'pnl'])] },
    };
    const out = buildGrid({ config: cfg, baseColumnDefs: baseDefs, columns });
    const defs = out.columnDefs as ColDef[];
    expect(defs.map((d) => d.colId ?? d.field)).toEqual(['notional', 'pnl', 'desk', 'qty', 'double']);
    expect(defs.map((d) => d.hide)).toEqual([false, false, true, true, true]);
    expect(valueOf(defs[0]!, { pnl: 2, qty: 3 })).toBe(6);
  });
});
