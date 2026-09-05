import type { ColumnInfo } from '@smartgrid/schema';
import type { EditorContext } from '../types.js';
import { EMPTY_EDITOR_CONTEXT } from '../context.js';

const col = (
  id: string,
  header: string,
  dataType: ColumnInfo['dataType'],
  sampleValues: unknown[] = [],
): ColumnInfo => ({
  id,
  header,
  dataType,
  columnTypes: [],
  sampleValues,
  editable: false,
  isPrimaryKey: id === 'tradeId',
  isSpecial: false,
});

export const FIXTURE_COLUMNS: ColumnInfo[] = [
  col('tradeId', 'Trade', 'text', ['T1', 'T2']),
  col('desk', 'Desk', 'text', ['Rates', 'Credit', 'FX']),
  col('ccy', 'Ccy', 'text', ['USD', 'EUR', 'GBP']),
  col('notional', 'Notional', 'number', [1000000, 2500000]),
  col('pnl', 'PnL', 'number', [-1200, 3400]),
  col('price', 'Price', 'number', [99.5, 101.25]),
  col('tradeDate', 'Trade date', 'date', [new Date('2026-09-01')]),
  col('active', 'Active', 'boolean', [true, false]),
];

export const FIXTURE_ROWS: Record<string, unknown>[] = [
  {
    tradeId: 'T1',
    desk: 'Rates',
    ccy: 'USD',
    notional: 1000000,
    pnl: -1200,
    price: 99.5,
    tradeDate: new Date('2026-09-01'),
    active: true,
  },
  {
    tradeId: 'T2',
    desk: 'Credit',
    ccy: 'EUR',
    notional: 2500000,
    pnl: 3400,
    price: 101.25,
    tradeDate: new Date('2026-09-02'),
    active: false,
  },
];

export const FIXTURE_CONTEXT: EditorContext = {
  ...EMPTY_EDITOR_CONTEXT,
  columns: FIXTURE_COLUMNS,
  sampleRows: FIXTURE_ROWS,
  icons: [
    {
      name: 'alert',
      category: 'system',
      svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    },
    { name: 'buy', category: 'trading', svg: '<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>' },
  ],
  functions: [
    { name: 'SUM', category: 'aggregated', signature: 'SUM([col])', kinds: ['aggregatedScalar'] },
    { name: 'CONTAINS', category: 'text', signature: 'CONTAINS([col], text)', kinds: ['boolean'] },
  ],
};
