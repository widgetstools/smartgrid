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
