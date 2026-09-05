import { describe, expect, it } from 'vitest';
import {
  FormatColumn,
  FormattingModule,
  Layout,
  LayoutModule,
  TableLayout,
  defaultTableLayout,
} from './index.js';

describe('Layout', () => {
  it('builds a default table layout with all defaults filled', () => {
    const l = defaultTableLayout('l1', 'Default', ['a', 'b']);
    expect(l).toMatchObject({
      kind: 'table',
      columns: ['a', 'b'],
      rowGroupDisplayType: 'single',
      grandTotalRow: 'none',
      rowSelection: { mode: 'none', groupSelectMode: 'self' },
      columnFilters: [],
    });
  });

  it('rejects width and flex together', () => {
    const r = TableLayout.safeParse({
      id: 'l',
      name: 'L',
      kind: 'table',
      columns: ['a'],
      columnSizing: { a: { width: 100, flex: 1 } },
    });
    expect(r.success).toBe(false);
  });

  it('parses a pivot layout with totals', () => {
    const p = Layout.parse({
      id: 'p',
      name: 'Pivot',
      kind: 'pivot',
      pivotColumns: ['ccy'],
      rowGroupColumns: ['desk'],
      aggregations: [
        { columnId: 'notional', aggFunc: 'sum', total: 'after' },
        { columnId: 'yield', aggFunc: { kind: 'weightedAverage', weightColumnId: 'notional' } },
      ],
      grandTotal: 'before',
    });
    expect(p.kind).toBe('pivot');
    if (p.kind === 'pivot') expect(p.expandLevel).toBe(-1);
  });

  it('accepts column filters with predicates and a grid filter', () => {
    const l = TableLayout.parse({
      id: 'l',
      name: 'L',
      kind: 'table',
      columns: ['ccy', 'px'],
      columnFilters: [{ columnId: 'ccy', predicates: [{ predicateId: 'In', inputs: ['USD', 'EUR'] }] }],
      gridFilter: { expression: "[px] > 100 AND [ccy] = 'USD'" },
    });
    expect(l.columnFilters[0]?.operator).toBe('AND');
    expect(l.gridFilter?.enabled).toBe(true);
  });
});

describe('LayoutModule', () => {
  it('requires currentLayoutId to exist and ids to be unique', () => {
    const a = defaultTableLayout('a', 'A', ['x']);
    expect(LayoutModule.safeParse({ currentLayoutId: 'zz', layouts: [a] }).success).toBe(false);
    expect(LayoutModule.safeParse({ currentLayoutId: 'a', layouts: [a, a] }).success).toBe(false);
    expect(LayoutModule.safeParse({ currentLayoutId: 'a', layouts: [a] }).success).toBe(true);
  });
});

describe('FormatColumn', () => {
  it('requires a style or a display format', () => {
    expect(FormatColumn.safeParse({ id: 'f', name: 'F', scope: { kind: 'all' } }).success).toBe(false);
  });
  it('parses a conditional style scoped by data type', () => {
    const fc = FormatColumn.parse({
      id: 'neg',
      name: 'Negative red',
      scope: { kind: 'dataTypes', dataTypes: ['number'] },
      rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative' }] },
      style: { foreColor: 'var(--sg-negative)' },
      rowScope: { excludeGroupRows: true },
    });
    expect(fc).toMatchObject({ target: 'cell', columnGroupScope: 'both', enabled: true });
  });
  it('module defaults to empty', () => {
    expect(FormattingModule.parse({})).toEqual({ formatColumns: [], editStateStyles: {} });
  });
});

describe('M2 modules', () => {
  it('parses empty module defaults and exposes them in MODULES', async () => {
    const { MODULES, MODULE_IDS, createGridConfig } = await import('../document.js');
    expect(MODULE_IDS).toEqual([
      'layout',
      'formatting',
      'calculatedColumns',
      'styledColumns',
      'flashing',
      'alerts',
      'queries',
    ]);
    const cfg = createGridConfig('g');
    expect(cfg.modules.calculatedColumns?.data.calculatedColumns).toEqual([]);
    expect(cfg.modules.flashing?.data.defaults.duration).toBe(500);
    expect(cfg.modules.alerts?.data.options.highlightDuration).toBe(2000);
    expect(cfg.modules.queries?.data.quickSearch.mode).toBe('highlight');
    for (const id of MODULE_IDS)
      expect(MODULES[id].schema.safeParse(id === 'layout' ? undefined : {}).success).toBe(id !== 'layout');
  });

  it('validates calculated, styled, flashing, alert and query objects', async () => {
    const {
      CalculatedColumn,
      StyledColumn,
      StyledColumnsModule,
      FlashingCell,
      Alert,
      NamedQuery,
      styledColumnKindsFor,
    } = await import('./index.js');
    const meta = { id: 'x', name: 'X' };
    expect(
      CalculatedColumn.safeParse({
        ...meta,
        columnId: 'pnlPct',
        expression: { kind: 'scalar', expression: '[pnl] / [notional]' },
      }).success,
    ).toBe(true);
    expect(
      CalculatedColumn.safeParse({
        ...meta,
        columnId: 'bad id',
        expression: { kind: 'scalar', expression: '1' },
      }).success,
    ).toBe(false);
    expect(
      StyledColumn.safeParse({
        ...meta,
        columnId: 'pnl',
        style: {
          kind: 'gradient',
          ranges: [
            { min: 'Col-Min', max: 0, color: 'red' },
            { min: 0, max: 'Col-Max', color: 'green' },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      StyledColumn.safeParse({ ...meta, columnId: 'r', style: { kind: 'rating', max: 5 } }).success,
    ).toBe(true);
    expect(
      StyledColumn.safeParse({
        ...meta,
        columnId: 'r',
        style: { kind: 'rangeBar', min: { columnId: 'lo' }, max: { columnId: 'hi' } },
      }).success,
    ).toBe(true);
    expect(
      StyledColumnsModule.safeParse({
        styledColumns: [
          { ...meta, columnId: 'a', style: { kind: 'rating' } },
          { ...meta, id: 'y', columnId: 'a', style: { kind: 'rating' } },
        ],
      }).success,
    ).toBe(false);
    expect(styledColumnKindsFor('number')).toContain('gradient');
    expect(styledColumnKindsFor('text')).toEqual(['badge', 'icon']);
    expect(FlashingCell.safeParse({ ...meta, scope: { kind: 'all' } }).success).toBe(true);
    expect(
      Alert.safeParse({ ...meta, rule: { kind: 'aggregated', expression: "SUM([pnl]) > '5M'" } }).success,
    ).toBe(true);
    expect(Alert.safeParse({ ...meta }).success).toBe(false);
    expect(Alert.safeParse({ ...meta, schedule: { kind: 'cron', cron: '0 9 * * 1-5' } }).success).toBe(true);
    expect(NamedQuery.safeParse({ ...meta, expression: '[pnl] < 0' }).success).toBe(true);
  });

  it('every new module fragment carries x-editor hints for its objects', async () => {
    const { moduleJsonSchema, collectEditorHints } = await import('../jsonSchema.js');
    const hints = (id: 'calculatedColumns' | 'styledColumns' | 'flashing' | 'alerts' | 'queries') =>
      collectEditorHints(moduleJsonSchema(id)).map((h) => h.editor);
    expect(hints('calculatedColumns')).toContain('calculatedColumn');
    expect(hints('styledColumns')).toContain('styledColumn');
    expect(hints('flashing')).toContain('flashing');
    expect(hints('alerts')).toContain('alert');
    expect(hints('queries')).toEqual(expect.arrayContaining(['namedQuery', 'quickSearch']));
  });
});
