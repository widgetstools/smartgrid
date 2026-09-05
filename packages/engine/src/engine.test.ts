import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef, ValueFormatterParams } from 'ag-grid-community';
import {
  createGridConfig,
  defaultTableLayout,
  type ColumnInfo,
  type TypedGridConfig,
} from '@smartgrid/schema';
import { buildGrid } from './build.js';
import { buildValueFormatter, formatDatePattern } from './formatters.js';
import { buildStylesheet } from './styles.js';

const columns: ColumnInfo[] = [
  {
    id: 'desk',
    header: 'Desk',
    dataType: 'text',
    columnTypes: [],
    sampleValues: [],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
  {
    id: 'pnl',
    header: 'PnL',
    dataType: 'number',
    columnTypes: [],
    sampleValues: [],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
  {
    id: 'notional',
    header: 'Notional',
    dataType: 'number',
    columnTypes: [],
    sampleValues: [],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
  {
    id: 'trade',
    header: 'Trade date',
    dataType: 'date',
    columnTypes: [],
    sampleValues: [],
    editable: false,
    isPrimaryKey: false,
    isSpecial: false,
  },
];
const baseDefs: ColDef[] = columns.map((c) => ({
  field: c.id,
  headerName: c.header,
  cellDataType: c.dataType,
}));

function config(): TypedGridConfig {
  const cfg = createGridConfig('g');
  const layout = defaultTableLayout('l', 'L', ['pnl', 'desk']);
  layout.columnPinning = { desk: 'left' };
  layout.columnSizing = { pnl: { width: 120, resizable: false } };
  layout.columnSorts = [{ columnId: 'pnl', order: 'desc' }];
  layout.columnHeaders = { pnl: 'P&L' };
  layout.rowGroupColumns = ['desk'];
  layout.aggregations = [
    { columnId: 'pnl', aggFunc: 'sum' },
    { columnId: 'notional', aggFunc: { kind: 'weightedAverage', weightColumnId: 'pnl' } },
  ];
  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'l', layouts: [layout] } };
  cfg.modules.formatting = {
    v: 1,
    data: {
      editStateStyles: {},
      formatColumns: [
        {
          id: 'neg',
          name: 'Negative red',
          enabled: true,
          readOnly: false,
          tags: [],
          source: 'user',
          scope: { kind: 'dataTypes', dataTypes: ['number'], columnIds: [] },
          target: 'cell',
          columnGroupScope: 'both',
          rule: {
            kind: 'predicates',
            predicates: [{ predicateId: 'Negative', inputs: [] }],
            operator: 'AND',
          },
          style: { foreColor: { light: '#b00', dark: '#f66' }, font: { weight: 'bold' } },
          rowScope: {
            excludeDataRows: false,
            excludeGroupRows: true,
            excludeSummaryRows: false,
            excludeTotalRows: false,
          },
        },
        {
          id: 'money',
          name: 'Money',
          enabled: true,
          readOnly: false,
          tags: [],
          source: 'user',
          scope: { kind: 'columns', columnIds: ['pnl'] },
          target: 'cell',
          columnGroupScope: 'both',
          displayFormat: { kind: 'number', preset: 'Dollar' },
        },
      ],
    },
  };
  return cfg;
}

describe('buildGrid layout', () => {
  it('orders, hides, pins, sizes, sorts, captions and groups per the layout', () => {
    const out = buildGrid({ config: config(), baseColumnDefs: baseDefs, columns });
    const defs = out.columnDefs as ColDef[];
    expect(defs.map((d) => d.field)).toEqual(['pnl', 'desk', 'notional', 'trade']);
    const pnl = defs[0]!;
    expect(pnl).toMatchObject({
      width: 120,
      resizable: false,
      sort: 'desc',
      sortIndex: 0,
      headerName: 'P&L',
      aggFunc: 'sum',
      hide: false,
    });
    const desk = defs[1]!;
    expect(desk).toMatchObject({ pinned: 'left', rowGroup: true, rowGroupIndex: 0, hide: true });
    expect(defs[2]!.hide).toBe(true);
    expect(typeof defs[2]!.aggFunc).toBe('function');
    expect(out.gridOptions).toMatchObject({
      groupDisplayType: 'singleColumn',
      suppressAggFuncInHeader: true,
      pivotMode: false,
    });
    expect(out.warnings).toEqual([]);
  });

  it('computes weighted average and only aggregations', () => {
    const out = buildGrid({ config: config(), baseColumnDefs: baseDefs, columns });
    const wavg = (out.columnDefs as ColDef[])[2]!.aggFunc as (p: unknown) => number | null;
    const params = {
      values: [],
      column: { getColId: () => 'notional' },
      rowNode: {
        allLeafChildren: [{ data: { notional: 100, pnl: 1 } }, { data: { notional: 200, pnl: 3 } }],
      },
    };
    expect(wavg(params)).toBeCloseTo(175);
  });
});

describe('buildGrid formatting', () => {
  it('adds cellClassRules that respect scope, predicate and row scope, and a stylesheet with dark overrides', () => {
    const out = buildGrid({ config: config(), baseColumnDefs: baseDefs, columns });
    const defs = out.columnDefs as ColDef[];
    const pnl = defs.find((d) => d.field === 'pnl')!;
    const desk = defs.find((d) => d.field === 'desk')!;
    expect(desk.cellClassRules).toBeUndefined();
    const rule = pnl.cellClassRules!['sg-fc-neg'] as (p: Partial<CellClassParams>) => boolean;
    expect(rule({ value: -5, data: {}, node: {} as never })).toBe(true);
    expect(rule({ value: 5, data: {}, node: {} as never })).toBe(false);
    expect(rule({ value: -5, data: {}, node: { group: true } as never })).toBe(false);
    expect(out.css).toContain('.ag-root-wrapper .sg-fc-neg{color:#b00;font-weight:700}');
    expect(out.css).toContain('[data-theme="dark"] .ag-root-wrapper .sg-fc-neg{color:#f66;font-weight:700}');
  });

  it('installs a value formatter that falls back to the host formatter', () => {
    const hostDefs = baseDefs.map((d) => (d.field === 'pnl' ? { ...d, valueFormatter: () => 'host' } : d));
    const out = buildGrid({ config: config(), baseColumnDefs: hostDefs, columns });
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    const vf = pnl.valueFormatter as (p: Partial<ValueFormatterParams>) => string;
    expect(vf({ value: -1234.5, data: {}, node: {} as never })).toBe('-$1,234.50');
    expect(vf({ value: null, data: {}, node: {} as never })).toBe('');
  });

  it('evaluates boolean expression rules against the row, resolving friendly names', () => {
    const cfg = config();
    cfg.modules.formatting!.data.formatColumns[0]!.rule = {
      kind: 'expression',
      expression: "[PnL] < 0 AND [Desk] = 'rates'",
    };
    const out = buildGrid({ config: cfg, baseColumnDefs: baseDefs, columns });
    expect(out.warnings).toEqual([]);
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    const rule = pnl.cellClassRules!['sg-fc-neg'] as (p: Partial<CellClassParams>) => boolean;
    expect(rule({ value: -5, data: { pnl: -5, desk: 'Rates' }, node: {} as never })).toBe(true);
    expect(rule({ value: -5, data: { pnl: -5, desk: 'Credit' }, node: {} as never })).toBe(false);
    expect(rule({ value: 5, data: { pnl: 5, desk: 'Rates' }, node: {} as never })).toBe(false);
  });

  it('warns and skips invalid expression rules', () => {
    const cfg = config();
    cfg.modules.formatting!.data.formatColumns[0]!.rule = { kind: 'expression', expression: '[nope] < ' };
    const out = buildGrid({ config: cfg, baseColumnDefs: baseDefs, columns });
    expect(out.warnings[0]).toMatch(/Unexpected end of expression; rule skipped/);
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    expect(pnl.cellClassRules?.['sg-fc-neg']).toBeUndefined();
  });
});

describe('formatters', () => {
  const ctx = { columnHeader: 'Px', rowData: { ccy: 'USD' } };
  it('number presets and options', () => {
    expect(buildValueFormatter({ kind: 'number', preset: 'Percentage' })(0.1234, ctx)).toBe('12.34%');
    expect(buildValueFormatter({ kind: 'number', preset: 'K' })(12500, ctx)).toBe('12.5K');
    expect(buildValueFormatter({ kind: 'number', preset: 'Accounting' })(-99.5, ctx)).toBe('(99.50)');
    expect(buildValueFormatter({ kind: 'number', preset: 'BasisPoints' })(0.0125, ctx)).toBe('125.0bp');
    expect(
      buildValueFormatter({ kind: 'number', fractionDigits: 0, integerSeparator: '.', zeroDisplay: '-' })(
        0,
        ctx,
      ),
    ).toBe('-');
    expect(
      buildValueFormatter({ kind: 'number', fractionDigits: 0, integerSeparator: '.' })(1234567, ctx),
    ).toBe('1.234.567');
    expect(buildValueFormatter({ kind: 'number', fractionDigits: 1, rounding: 'floor' })(1.99, ctx)).toBe(
      '1.9',
    );
    expect(buildValueFormatter({ kind: 'number', preset: 'Scientific' })(12345, ctx)).toBe('1.23e+4');
    expect(
      buildValueFormatter({ kind: 'number', fractionDigits: 2, content: '[value] [rowData.ccy]' })(3, ctx),
    ).toBe('3.00 USD');
  });
  it('string, date and template', () => {
    expect(buildValueFormatter({ kind: 'string', case: 'title', prefix: '» ' })('rates desk', ctx)).toBe(
      '» Rates Desk',
    );
    expect(
      buildValueFormatter({ kind: 'date', pattern: 'dd-MMM-yyyy HH:mm' })(new Date(2026, 8, 5, 9, 7), ctx),
    ).toBe('05-Sep-2026 09:07');
    expect(formatDatePattern(new Date(2026, 8, 3, 15, 4, 5), "EEEE, MMMM do yyyy 'at' h:mm a")).toBe(
      'Thursday, September 3rd 2026 at 3:04 PM',
    );
    expect(
      buildValueFormatter({ kind: 'template', template: '[column]: [value] ([rowData.ccy])' })(9, ctx),
    ).toBe('Px: 9 (USD)');
  });
});

describe('stylesheet', () => {
  it('emits borders, fonts and alignment', () => {
    const css = buildStylesheet([
      {
        className: 'x',
        style: {
          border: { bottom: { width: 2, style: 'dashed', color: 'red' }, radius: 4 },
          alignment: { horizontal: 'right' },
          font: { size: 'sm', italic: true },
        },
      },
    ]);
    expect(css).toBe(
      '.ag-root-wrapper .x{border-bottom:2px dashed red;border-radius:4px;font-size:11px;font-style:italic;text-align:right}',
    );
  });
});
