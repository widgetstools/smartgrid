import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef, RowClassParams } from 'ag-grid-community';
import {
  createGridConfig,
  type ColumnInfo,
  type FlashingCell,
  type TypedGridConfig,
} from '@smartgrid/schema';
import { buildGrid } from '../build.js';
import type { RuntimeEvent } from '../core/types.js';
import { GridRuntime, type CellChange } from '../runtime/runtime.js';
import { FLASH_CLASS, flashDirection } from './flashing.js';

const column = (id: string, dataType: ColumnInfo['dataType']): ColumnInfo => ({
  id,
  header: id[0]!.toUpperCase() + id.slice(1),
  dataType,
  columnTypes: [],
  sampleValues: [],
  editable: false,
  isPrimaryKey: false,
  isSpecial: false,
});
const columns: ColumnInfo[] = [column('desk', 'text'), column('pnl', 'number'), column('trade', 'date')];
const baseDefs: ColDef[] = columns.map((c) => ({ field: c.id, cellDataType: c.dataType }));

function flash(over: Partial<FlashingCell> & { id: string }): FlashingCell {
  return {
    name: over.id,
    enabled: true,
    readOnly: false,
    tags: [],
    source: 'user',
    scope: { kind: 'all' },
    target: 'cell',
    duration: 500,
    columnGroupScope: 'both',
    ...over,
  };
}

function config(...cells: FlashingCell[]): TypedGridConfig {
  const cfg = createGridConfig('g');
  cfg.modules.flashing!.data.flashingCells = cells;
  return cfg;
}

function setup(...cells: FlashingCell[]) {
  const rows: Record<string, unknown>[] = [];
  let now = 1_000;
  const runtime = new GridRuntime({ getRows: () => rows, rowIdOf: (d) => String(d['id']), now: () => now });
  const events: RuntimeEvent[] = [];
  runtime.subscribe((e) => events.push(e));
  const out = buildGrid({ config: config(...cells), baseColumnDefs: baseDefs, columns, runtime });
  const change = (over: Partial<CellChange>): CellChange => ({
    rowId: 'r1',
    columnId: 'pnl',
    oldValue: 1,
    newValue: 2,
    data: { id: 'r1', pnl: 2 },
    at: now,
    ...over,
  });
  return { runtime, events, out, change, setNow: (t: number) => (now = t) };
}

describe('flashDirection', () => {
  it('compares numbers and dates, neutral for equal or non-ordered values', () => {
    expect(flashDirection(1, 2)).toBe('up');
    expect(flashDirection(2, 1)).toBe('down');
    expect(flashDirection(2, 2)).toBe('neutral');
    expect(flashDirection(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe('up');
    expect(flashDirection('a', 'b')).toBe('neutral');
    expect(flashDirection('1', '2')).toBe('neutral');
    expect(flashDirection('1', '2', columns[1])).toBe('up');
    expect(flashDirection(null, 2)).toBe('neutral');
  });
});

describe('flashing module', () => {
  it('installs the flash service, class rules and style rules that follow formatting', () => {
    const { runtime, out } = setup(flash({ id: 'f1', upStyle: { backColor: 'lime' } }));
    expect(runtime.flash).toBeDefined();
    expect(runtime.part('flashing')).toBe(runtime.flash);
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    expect(Object.keys(pnl.cellClassRules!)).toEqual([
      'sg-flash-f1-up',
      'sg-flash-f1-down',
      'sg-flash-f1-neutral',
    ]);
    expect(out.css).toContain('.ag-root-wrapper .sg-flash-f1-up{background-color:lime}');
    // Module defaults fill in the missing directions.
    expect(out.css).toContain('.ag-root-wrapper .sg-flash-f1-down{background-color:#fee2e2}');
    expect(out.css).toContain(
      '[data-theme="dark"] .ag-root-wrapper .sg-flash-f1-down{background-color:#7f1d1d}',
    );
  });

  it('flashes up, down and neutral, and the class rule reads the live state', () => {
    const { runtime, events, out, change } = setup(flash({ id: 'f1' }));
    runtime.cellsChanged([
      change({ rowId: 'r1', oldValue: 1, newValue: 5 }),
      change({ rowId: 'r2', oldValue: 5, newValue: 1 }),
      change({ rowId: 'r3', columnId: 'desk', oldValue: 'a', newValue: 'b' }),
    ]);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('flash');
    if (ev.type !== 'flash') return;
    expect(ev.flashes.map((f) => f.direction)).toEqual(['up', 'down', 'neutral']);
    expect(ev.flashes[0]).toEqual({
      rowId: 'r1',
      columnId: 'pnl',
      direction: 'up',
      className: FLASH_CLASS('f1', 'up'),
      until: 1_500,
    });
    expect(ev.refresh).toEqual({ rowIds: ['r1', 'r2', 'r3'], columnIds: ['pnl', 'desk'] });
    expect(runtime.flash!.cellClass('r1', 'pnl')).toBe('sg-flash-f1-up');
    expect(runtime.flash!.cellClass('r2', 'pnl')).toBe('sg-flash-f1-down');
    expect(runtime.flash!.cellClass('r1', 'desk')).toBeUndefined();
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    const up = pnl.cellClassRules!['sg-flash-f1-up'] as (p: Partial<CellClassParams>) => boolean;
    const down = pnl.cellClassRules!['sg-flash-f1-down'] as (p: Partial<CellClassParams>) => boolean;
    expect(up({ node: { id: 'r1' } as never })).toBe(true);
    expect(down({ node: { id: 'r1' } as never })).toBe(false);
    expect(down({ node: { id: 'r2' } as never })).toBe(true);
    expect(runtime.flash!.active()).toHaveLength(3);
  });

  it('expires flashes on tick and keeps "always" flashes', () => {
    const { runtime, events, change } = setup(
      flash({ id: 'short', scope: { kind: 'columns', columnIds: ['pnl'] }, duration: 200 }),
      flash({ id: 'forever', scope: { kind: 'columns', columnIds: ['desk'] }, duration: 'always' }),
    );
    runtime.cellsChanged([change({}), change({ columnId: 'desk', oldValue: 'a', newValue: 'b' })]);
    runtime.tick(1_199);
    expect(events).toHaveLength(1);
    runtime.tick(1_200);
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'flashEnd', refresh: { rowIds: ['r1'], columnIds: ['pnl'] } });
    expect(runtime.flash!.cellClass('r1', 'pnl')).toBeUndefined();
    expect(runtime.flash!.cellClass('r1', 'desk')).toBe('sg-flash-forever-neutral');
    runtime.tick(1_000_000);
    expect(events).toHaveLength(2);
    runtime.flash!.clear();
    expect(events[2]).toEqual({ type: 'flashEnd', refresh: { rowIds: ['r1'] } });
    expect(runtime.flash!.active()).toEqual([]);
    runtime.flash!.clear();
    expect(events).toHaveLength(3);
  });

  it('a newer flash on the same cell replaces the older one', () => {
    const { runtime, change, setNow } = setup(flash({ id: 'f1', duration: 500 }));
    runtime.cellsChanged([change({ oldValue: 1, newValue: 2 })]);
    setNow(1_300);
    runtime.cellsChanged([change({ oldValue: 2, newValue: 1, at: 1_300 })]);
    expect(runtime.flash!.active()).toEqual([
      { rowId: 'r1', columnId: 'pnl', direction: 'down', className: 'sg-flash-f1-down', until: 1_800 },
    ]);
    runtime.tick(1_500);
    expect(runtime.flash!.cellClass('r1', 'pnl')).toBe('sg-flash-f1-down');
  });

  it('flashes rows: rowClassRules, row-scoped CSS and whole-row refresh', () => {
    const { runtime, events, out, change } = setup(
      flash({
        id: 'row',
        target: 'row',
        scope: { kind: 'columns', columnIds: ['pnl'] },
        upStyle: { backColor: { light: '#eee', dark: '#111' }, font: { weight: 'bold' } },
      }),
    );
    expect(out.css).toContain(
      '.ag-root-wrapper .ag-row.sg-flash-row-up .ag-cell{background-color:#eee;font-weight:700}',
    );
    expect(out.css).toContain(
      '[data-theme="dark"] .ag-root-wrapper .ag-row.sg-flash-row-up .ag-cell{background-color:#111;font-weight:700}',
    );
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    expect(pnl.cellClassRules).toBeUndefined();
    const rules = out.gridOptions.rowClassRules!;
    expect(Object.keys(rules)).toEqual(['sg-flash-row-up', 'sg-flash-row-down', 'sg-flash-row-neutral']);

    runtime.cellsChanged([change({ oldValue: 1, newValue: 3 })]);
    expect(events[0]).toEqual({
      type: 'flash',
      flashes: [
        { rowId: 'r1', columnId: undefined, direction: 'up', className: 'sg-flash-row-up', until: 1_500 },
      ],
      refresh: { rowIds: ['r1'] },
    });
    expect(runtime.flash!.rowClass('r1')).toBe('sg-flash-row-up');
    expect(runtime.flash!.cellClass('r1', 'pnl')).toBeUndefined();
    const up = rules['sg-flash-row-up'] as (p: Partial<RowClassParams>) => boolean;
    expect(up({ node: { id: 'r1' } as never })).toBe(true);
    expect(up({ node: { id: 'r2' } as never })).toBe(false);
    runtime.tick(1_500);
    expect(events[1]).toEqual({ type: 'flashEnd', refresh: { rowIds: ['r1'] } });
    expect(runtime.flash!.rowClass('r1')).toBeUndefined();
  });

  it('filters by rule (predicates with change context and expressions) and skips invalid rules', () => {
    const { runtime, events, out, change } = setup(
      flash({
        id: 'neg',
        scope: { kind: 'columns', columnIds: ['pnl'] },
        rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative', inputs: [] }], operator: 'AND' },
      }),
      flash({
        id: 'big',
        scope: { kind: 'columns', columnIds: ['desk'] },
        rule: { kind: 'expression', expression: "ANY_CHANGE([desk]) AND [desk] = 'rates'" },
      }),
      flash({ id: 'bad', rule: { kind: 'expression', expression: '[pnl] >' } }),
      flash({ id: 'off', enabled: false }),
    );
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/Flashing cell "bad"/);
    runtime.cellsChanged([
      change({ oldValue: 1, newValue: 2 }),
      change({ oldValue: 1, newValue: -2 }),
      change({ columnId: 'desk', oldValue: 'credit', newValue: 'Rates', data: { desk: 'Rates' } }),
      change({ columnId: 'desk', oldValue: 'Rates', newValue: 'Rates', data: { desk: 'Rates' } }),
    ]);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    if (ev.type !== 'flash') throw new Error('expected flash');
    expect(ev.flashes.map((f) => f.className)).toEqual(['sg-flash-neg-down', 'sg-flash-big-neutral']);
  });

  it('the first matching definition wins per cell', () => {
    const { runtime, events, change } = setup(
      flash({ id: 'first', scope: { kind: 'columns', columnIds: ['pnl'] }, duration: 100 }),
      flash({ id: 'second', duration: 900 }),
      flash({ id: 'rowwise', target: 'row', duration: 300 }),
    );
    runtime.cellsChanged([change({}), change({ columnId: 'desk', oldValue: 'a', newValue: 'b' })]);
    const ev = events[0]!;
    if (ev.type !== 'flash') throw new Error('expected flash');
    expect(ev.flashes.map((f) => [f.className, f.until])).toEqual([
      ['sg-flash-first-up', 1_100],
      ['sg-flash-rowwise-up', 1_300],
      ['sg-flash-second-neutral', 1_900],
      ['sg-flash-rowwise-neutral', 1_300],
    ]);
    expect(runtime.flash!.rowClass('r1')).toBe('sg-flash-rowwise-neutral');
  });
});
