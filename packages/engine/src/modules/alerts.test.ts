import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef, RowClassParams } from 'ag-grid-community';
import { createGridConfig, type Alert, type ColumnInfo, type TypedGridConfig } from '@smartgrid/schema';
import { buildGrid } from '../build.js';
import type { AlertEvent, RuntimeEvent } from '../core/types.js';
import { GridRuntime, type CellChange } from '../runtime/runtime.js';
import type { AlertsRuntimePart } from './alerts.js';

const column = (id: string, header: string, dataType: ColumnInfo['dataType']): ColumnInfo => ({
  id,
  header,
  dataType,
  columnTypes: [],
  sampleValues: [],
  editable: false,
  isPrimaryKey: false,
  isSpecial: false,
});
const columns: ColumnInfo[] = [column('desk', 'Desk', 'text'), column('pnl', 'PnL', 'number')];
const baseDefs: ColDef[] = columns.map((c) => ({ field: c.id, cellDataType: c.dataType }));

function alert(over: Partial<Alert> & { id: string }): Alert {
  return {
    name: over.id,
    enabled: true,
    readOnly: false,
    tags: [],
    source: 'user',
    messageType: 'info',
    scope: { kind: 'all' },
    behaviour: {
      notify: true,
      notificationDuration: 3000,
      statusMessage: false,
      logToConsole: false,
      highlightCell: false,
      highlightRow: false,
      jumpToCell: false,
      jumpToRow: false,
      preventEdit: false,
    },
    ...over,
  };
}

function config(alerts: Alert[], highlightDuration: number | 'always' = 2000): TypedGridConfig {
  const cfg = createGridConfig('g');
  cfg.modules.alerts!.data.alerts = alerts;
  cfg.modules.alerts!.data.options.highlightDuration = highlightDuration;
  return cfg;
}

const T0 = new Date(2026, 8, 7, 9, 0).getTime(); // Monday 09:00 local
const MIN = 60_000;

function setup(
  alerts: Alert[],
  opts: { rows?: Record<string, unknown>[]; highlightDuration?: number | 'always' } = {},
) {
  const rows = opts.rows ?? [];
  let now = T0;
  const runtime = new GridRuntime({ getRows: () => rows, rowIdOf: (d) => String(d['id']), now: () => now });
  const events: RuntimeEvent[] = [];
  runtime.subscribe((e) => events.push(e));
  const out = buildGrid({
    config: config(alerts, opts.highlightDuration),
    baseColumnDefs: baseDefs,
    columns,
    runtime,
  });
  const fired = () =>
    events
      .filter((e): e is Extract<RuntimeEvent, { type: 'alert' }> => e.type === 'alert')
      .map((e) => e.alert);
  const change = (over: Partial<CellChange>): CellChange => ({
    rowId: 'r1',
    columnId: 'pnl',
    oldValue: 5,
    newValue: -3,
    data: { id: 'r1', desk: 'Rates', pnl: -3 },
    at: now,
    trigger: 'tick',
    ...over,
  });
  const part = runtime.part<AlertsRuntimePart>('alerts')!;
  return { runtime, events, out, rows, fired, change, part, setNow: (t: number) => (now = t) };
}

describe('alerts: cell-change rules', () => {
  it('fires predicate alerts on scoped columns with an auto message and full behaviour', () => {
    const { runtime, fired, change, out } = setup([
      alert({
        id: 'neg',
        name: 'Negative PnL',
        messageType: 'warning',
        scope: { kind: 'columns', columnIds: ['pnl'] },
        rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative', inputs: [] }], operator: 'AND' },
        behaviour: { ...alert({ id: 'x' }).behaviour, preventEdit: true, jumpToCell: true },
      }),
    ]);
    expect(out.warnings).toEqual([]);
    runtime.cellsChanged([
      change({}),
      change({ rowId: 'r2', newValue: 4 }),
      change({ rowId: 'r3', columnId: 'desk', oldValue: 'a', newValue: '-1' }),
    ]);
    const events = fired();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual<AlertEvent>({
      alertId: 'neg',
      name: 'Negative PnL',
      messageType: 'warning',
      header: 'Negative PnL',
      text: 'PnL changed from 5 to -3',
      at: T0,
      rowId: 'r1',
      columnId: 'pnl',
      data: { id: 'r1', desk: 'Rates', pnl: -3 },
      behaviour: {
        notify: true,
        notificationDuration: 3000,
        statusMessage: false,
        logToConsole: false,
        highlightCell: undefined,
        highlightRow: undefined,
        jumpToCell: true,
        jumpToRow: false,
        preventEdit: true,
      },
    });
  });

  it('evaluates expression rules with change context (ANY_CHANGE / PERCENT_CHANGE) across all columns', () => {
    const { runtime, fired, change } = setup([
      alert({
        id: 'drop',
        rule: { kind: 'expression', expression: "PERCENT_CHANGE([PnL], 'DECREASE') > 50" },
      }),
      alert({ id: 'desk', rule: { kind: 'expression', expression: 'ANY_CHANGE([desk])' } }),
    ]);
    runtime.cellsChanged([
      change({ oldValue: 100, newValue: 40, data: { pnl: 40 } }),
      change({ oldValue: 100, newValue: 60, data: { pnl: 60 } }),
      change({ columnId: 'desk', oldValue: 'a', newValue: 'b', data: { desk: 'b' } }),
    ]);
    expect(fired().map((a) => [a.alertId, a.text])).toEqual([
      ['drop', 'PnL changed from 100 to 40'],
      ['desk', 'Desk changed from a to b'],
    ]);
  });

  it('substitutes message templates', () => {
    const { runtime, fired, change } = setup([
      alert({
        id: 't',
        header: '[column] on [primaryKeyValue]',
        text: '[oldValue] -> [newValue] in [rowData.desk] via [trigger] at [timestamp] [unknown]',
        rule: { kind: 'expression', expression: 'ANY_CHANGE()' },
      }),
    ]);
    runtime.cellsChanged([change({ trigger: 'edit' })]);
    expect(fired()[0]).toMatchObject({
      header: 'PnL on r1',
      text: `5 -> -3 in Rates via Edit at ${new Date(T0).toISOString()} [unknown]`,
    });
  });

  it('warns and skips alerts with invalid expressions, cron or run times', () => {
    const { out, runtime, fired, change } = setup([
      alert({ id: 'bad1', rule: { kind: 'expression', expression: '[pnl] >' } }),
      alert({ id: 'bad2', rule: { kind: 'aggregated', expression: 'SUM([nope]) > 1' } }),
      alert({ id: 'bad3', rule: { kind: 'observable', expression: 'ROW_CHANGE(COUNT([pnl], 3))' } }),
      alert({ id: 'bad4', schedule: { kind: 'cron', cron: '99 * * * *' } }),
      alert({ id: 'bad5', schedule: { kind: 'once', runAt: 'never' } }),
      alert({ id: 'off', enabled: false, rule: { kind: 'expression', expression: 'ANY_CHANGE()' } }),
    ]);
    expect(out.warnings.map((w) => w.slice(0, 12))).toEqual([
      'Alert "bad1"',
      'Alert "bad2"',
      'Alert "bad3"',
      'Alert "bad4"',
      'Alert "bad5"',
    ]);
    runtime.cellsChanged([change({})]);
    runtime.tick(T0 + 10 * MIN);
    expect(fired()).toEqual([]);
  });
});

describe('alerts: aggregated', () => {
  it('fires once when the condition transitions to true and again after it resets', () => {
    const rows = [
      { id: 'a', pnl: 2 },
      { id: 'b', pnl: 3 },
    ];
    const { runtime, fired, change } = setup(
      [alert({ id: 'sum', rule: { kind: 'aggregated', expression: 'SUM([PnL]) > 10' } })],
      {
        rows,
      },
    );
    runtime.cellsChanged([change({ rowId: 'a', oldValue: 1, newValue: 2 })]);
    expect(fired()).toHaveLength(0);
    rows[0]!.pnl = 20;
    runtime.cellsChanged([change({ rowId: 'a', oldValue: 2, newValue: 20 }), change({ rowId: 'b' })]);
    expect(fired()).toHaveLength(1);
    expect(fired()[0]).toMatchObject({ alertId: 'sum', text: 'SUM([PnL]) > 10 is true', rowId: undefined });
    rows[1]!.pnl = 4;
    runtime.cellsChanged([change({ rowId: 'b', oldValue: 3, newValue: 4 })]);
    expect(fired()).toHaveLength(1);
    rows[0]!.pnl = 1;
    runtime.rowsChanged([{ kind: 'removed', rowId: 'b', data: rows[1]!, at: T0 }]);
    expect(fired()).toHaveLength(1);
    rows[0]!.pnl = 30;
    runtime.cellsChanged([change({ rowId: 'a', oldValue: 1, newValue: 30 })]);
    expect(fired()).toHaveLength(2);
  });

  it('fires per group key with GROUP_BY', () => {
    const rows = [
      { id: 'a', desk: 'Rates', pnl: 2 },
      { id: 'b', desk: 'Credit', pnl: 30 },
    ];
    const { runtime, fired, change } = setup(
      [alert({ id: 'g', rule: { kind: 'aggregated', expression: 'SUM([pnl], GROUP_BY([desk])) > 10' } })],
      { rows },
    );
    runtime.cellsChanged([change({ rowId: 'b' })]);
    expect(fired().map((a) => [a.text, a.data])).toEqual([
      ['SUM([pnl], GROUP_BY([desk])) > 10 is true for Desk = Credit', { desk: 'Credit' }],
    ]);
    rows[0]!.pnl = 50;
    runtime.cellsChanged([change({ rowId: 'a' })]);
    expect(fired()).toHaveLength(2);
    expect(fired()[1]!.data).toEqual({ desk: 'Rates' });
    runtime.cellsChanged([change({ rowId: 'a' })]);
    expect(fired()).toHaveLength(2);
  });
});

describe('alerts: observable', () => {
  it('fires when COUNT reaches its threshold inside the timeframe', () => {
    const { runtime, fired, change } = setup([
      alert({
        id: 'busy',
        text: '[column] on [primaryKeyValue] ticked [newValue] times',
        rule: { kind: 'observable', expression: "ROW_CHANGE(COUNT([pnl], 3), TIMEFRAME('5m'))" },
      }),
    ]);
    runtime.cellsChanged([change({ at: T0 }), change({ at: T0 + MIN })]);
    runtime.cellsChanged([change({ rowId: 'r2', at: T0 + MIN }), change({ columnId: 'desk', at: T0 + MIN })]);
    expect(fired()).toHaveLength(0);
    runtime.cellsChanged([change({ at: T0 + 2 * MIN })]);
    expect(fired()).toHaveLength(1);
    expect(fired()[0]).toMatchObject({
      alertId: 'busy',
      rowId: 'r1',
      columnId: 'pnl',
      text: 'PnL on r1 ticked 3 times',
      at: T0 + 2 * MIN,
    });
    // The window resets after firing; two more changes are not enough.
    runtime.cellsChanged([change({ at: T0 + 3 * MIN }), change({ at: T0 + 4 * MIN })]);
    expect(fired()).toHaveLength(1);
  });

  it('fires on row events and NONE ticks', () => {
    const { runtime, fired } = setup([
      alert({ id: 'added', rule: { kind: 'observable', expression: "ROW_ADDED() WHERE [desk] = 'Rates'" } }),
      alert({
        id: 'quiet',
        rule: { kind: 'observable', expression: "GRID_CHANGE(NONE([pnl]), TIMEFRAME('10m'))" },
      }),
    ]);
    runtime.rowsChanged([
      { kind: 'added', rowId: 'n1', data: { id: 'n1', desk: 'Rates' }, at: T0 },
      { kind: 'added', rowId: 'n2', data: { id: 'n2', desk: 'Credit' }, at: T0 },
    ]);
    expect(fired().map((a) => [a.alertId, a.rowId, a.text])).toEqual([
      ['added', 'n1', "ROW_ADDED() WHERE [desk] = 'Rates': row added"],
    ]);
    runtime.tick(T0 + 9 * MIN);
    expect(fired()).toHaveLength(1);
    runtime.tick(T0 + 10 * MIN);
    expect(fired()).toHaveLength(2);
    expect(fired()[1]).toMatchObject({ alertId: 'quiet', rowId: undefined });
    runtime.tick(T0 + 11 * MIN);
    expect(fired()).toHaveLength(2);
  });
});

describe('alerts: scheduled', () => {
  it('fires cron alerts once per matching minute boundary', () => {
    const { runtime, fired } = setup([
      alert({ id: 'cron', name: 'Every 5', schedule: { kind: 'cron', cron: '*/5 * * * *' } }),
    ]);
    runtime.tick(T0 + 4 * MIN + 59_000);
    expect(fired()).toHaveLength(0);
    runtime.tick(T0 + 5 * MIN);
    expect(fired()).toHaveLength(1);
    expect(fired()[0]).toMatchObject({
      alertId: 'cron',
      header: 'Every 5',
      text: 'Scheduled: Every 5',
      at: T0 + 5 * MIN,
    });
    runtime.tick(T0 + 5 * MIN + 30_000);
    expect(fired()).toHaveLength(1);
    // A late tick fires once, not once per missed slot.
    runtime.tick(T0 + 25 * MIN);
    expect(fired()).toHaveLength(2);
    runtime.tick(T0 + 30 * MIN);
    expect(fired()).toHaveLength(3);
  });

  it('fires once alerts a single time when their run time passes', () => {
    const runAt = new Date(T0 + 2 * MIN).toISOString();
    const { runtime, fired } = setup([alert({ id: 'once', schedule: { kind: 'once', runAt } })]);
    runtime.tick(T0 + MIN);
    expect(fired()).toHaveLength(0);
    runtime.tick(T0 + 2 * MIN);
    expect(fired()).toHaveLength(1);
    expect(fired()[0]!.text).toBe('Scheduled: once');
    runtime.tick(T0 + 3 * MIN);
    expect(fired()).toHaveLength(1);
  });
});

describe('alerts: highlights and manual firing', () => {
  it('tracks cell and row highlight classes, emits styles and expires them', () => {
    const { runtime, events, out, part, change } = setup(
      [
        alert({
          id: 'hl',
          scope: { kind: 'columns', columnIds: ['pnl'] },
          rule: { kind: 'expression', expression: 'ANY_CHANGE()' },
          behaviour: {
            ...alert({ id: 'x' }).behaviour,
            highlightCell: true,
            highlightRow: { backColor: 'purple', foreColor: 'white' },
          },
        }),
      ],
      { highlightDuration: 1000 },
    );
    expect(out.css).toContain('.ag-root-wrapper .sg-alert-hl{background-color:#fde68a}');
    expect(out.css).toContain('[data-theme="dark"] .ag-root-wrapper .sg-alert-hl{background-color:#78350f}');
    expect(out.css).toContain(
      '.ag-root-wrapper .ag-row.sg-alert-hl-row .ag-cell{color:white;background-color:purple}',
    );
    const defs = out.columnDefs as ColDef[];
    expect(defs.find((d) => d.field === 'desk')!.cellClassRules).toBeUndefined();
    const cellRule = defs.find((d) => d.field === 'pnl')!.cellClassRules!['sg-alert-hl'] as (
      p: Partial<CellClassParams>,
    ) => boolean;
    const rowRule = out.gridOptions.rowClassRules!['sg-alert-hl-row'] as (
      p: Partial<RowClassParams>,
    ) => boolean;

    runtime.cellsChanged([change({})]);
    const ev = events[0]!;
    if (ev.type !== 'alert') throw new Error('expected alert');
    expect(ev.alert.behaviour.highlightCell).toBe(true);
    expect(ev.alert.behaviour.highlightRow).toEqual({ backColor: 'purple', foreColor: 'white' });
    expect(part.highlightClass('r1', 'pnl')).toBe('sg-alert-hl');
    expect(part.highlightClass('r1', 'desk')).toBeUndefined();
    expect(part.rowHighlightClass('r1')).toBe('sg-alert-hl-row');
    expect(cellRule({ node: { id: 'r1' } as never })).toBe(true);
    expect(cellRule({ node: { id: 'r2' } as never })).toBe(false);
    expect(rowRule({ node: { id: 'r1' } as never })).toBe(true);

    runtime.tick(T0 + 999);
    expect(events).toHaveLength(1);
    runtime.tick(T0 + 1000);
    expect(events[1]).toEqual({ type: 'highlightEnd', rowIds: ['r1'] });
    expect(part.highlightClass('r1', 'pnl')).toBeUndefined();
    expect(part.rowHighlightClass('r1')).toBeUndefined();
  });

  it('keeps "always" highlights until cleared', () => {
    const { runtime, events, part, change } = setup(
      [
        alert({
          id: 'hl',
          rule: { kind: 'expression', expression: 'ANY_CHANGE()' },
          behaviour: { ...alert({ id: 'x' }).behaviour, highlightCell: true },
        }),
      ],
      { highlightDuration: 'always' },
    );
    runtime.cellsChanged([change({})]);
    runtime.tick(T0 + 1_000_000);
    expect(part.highlightClass('r1', 'pnl')).toBe('sg-alert-hl');
    part.clearHighlights();
    expect(part.highlightClass('r1', 'pnl')).toBeUndefined();
    expect(events.at(-1)).toEqual({ type: 'highlightEnd', rowIds: ['r1'] });
  });

  it('fireAlertNow fires any alert by id, including disabled ones', () => {
    const { part, fired } = setup([
      alert({ id: 'on', rule: { kind: 'expression', expression: 'ANY_CHANGE()' } }),
      alert({
        id: 'off',
        enabled: false,
        text: 'hi [trigger]',
        schedule: { kind: 'cron', cron: '0 9 * * *' },
      }),
    ]);
    expect(part.fireAlertNow('on')).toMatchObject({ alertId: 'on', text: 'Test alert "on"', at: T0 });
    expect(part.fireAlertNow('off')).toMatchObject({ alertId: 'off', text: 'hi Manual' });
    expect(part.fireAlertNow('nope')).toBeUndefined();
    expect(fired()).toHaveLength(2);
  });
});
