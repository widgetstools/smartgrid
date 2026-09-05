import { createGridConfig, defaultTableLayout, type FormatColumn, type GridConfig } from '@smartgrid/schema';

export const GRID_ID = 'playground-blotter';

/**
 * Seed document used the first time the playground runs (or after Reset).
 * Everything the user changes afterwards is a JSON Patch on top of this.
 */
export function seedConfig(): GridConfig {
  const cfg = createGridConfig(GRID_ID);

  const blotter = defaultTableLayout('blotter', 'Blotter', [
    'tradeId',
    'desk',
    'book',
    'instrument',
    'ccy',
    'side',
    'notional',
    'price',
    'yield',
    'pnl',
    'pnlPct',
    'rating',
    'status',
    'tradeDate',
  ]);
  blotter.columnPinning = { tradeId: 'left' };
  blotter.columnSizing = {
    instrument: { width: 180, resizable: true },
    notional: { width: 130, resizable: true },
  };
  blotter.columnSorts = [{ columnId: 'tradeDate', order: 'desc' }];
  blotter.rowSelection = { ...blotter.rowSelection, mode: 'multiRow' };

  const byDesk = defaultTableLayout('by-desk', 'By desk', [
    'desk',
    'book',
    'ccy',
    'notional',
    'pnl',
    'yield',
    'price',
  ]);
  byDesk.rowGroupColumns = ['desk', 'book'];
  byDesk.rowGroupExpansion = { defaultBehavior: 'expanded', exceptions: [] };
  byDesk.aggregations = [
    { columnId: 'notional', aggFunc: 'sum' },
    { columnId: 'pnl', aggFunc: 'sum' },
    { columnId: 'yield', aggFunc: { kind: 'weightedAverage', weightColumnId: 'notional' } },
    { columnId: 'ccy', aggFunc: 'only' },
  ];
  byDesk.grandTotalRow = 'pinnedBottom';
  byDesk.columnHeaders = { yield: 'Wtd yield' };

  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'blotter', layouts: [blotter, byDesk] } };

  const meta = (id: string, name: string) => ({
    id,
    name,
    enabled: true,
    readOnly: false,
    tags: [],
    source: 'seed' as const,
  });
  const formatColumns: FormatColumn[] = [
    {
      ...meta('fc-pnl-neg', 'Negative PnL red'),
      scope: { kind: 'columns', columnIds: ['pnl', 'pnlPct'] },
      target: 'cell',
      columnGroupScope: 'both',
      rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative', inputs: [] }], operator: 'AND' },
      style: { foreColor: 'var(--sg-negative)', font: { weight: 'semibold' } },
      rowScope: {
        excludeDataRows: false,
        excludeGroupRows: false,
        excludeSummaryRows: false,
        excludeTotalRows: false,
      },
    },
    {
      ...meta('fc-pnl-pos', 'Positive PnL green'),
      scope: { kind: 'columns', columnIds: ['pnl', 'pnlPct'] },
      target: 'cell',
      columnGroupScope: 'both',
      rule: { kind: 'predicates', predicates: [{ predicateId: 'Positive', inputs: [] }], operator: 'AND' },
      style: { foreColor: 'var(--sg-positive)' },
    },
    {
      ...meta('fc-money', 'Money columns'),
      scope: { kind: 'columns', columnIds: ['notional', 'pnl'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', preset: 'Integer' },
      style: { alignment: { horizontal: 'right' }, font: { family: 'mono' } },
    },
    {
      ...meta('fc-pct', 'Percent'),
      scope: { kind: 'columns', columnIds: ['pnlPct'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', preset: 'Percentage' },
    },
    {
      ...meta('fc-price', 'Price 4dp'),
      scope: { kind: 'columns', columnIds: ['price'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', preset: 'FXRate' },
      style: { font: { family: 'mono' } },
    },
    {
      ...meta('fc-yield', 'Yield 3dp'),
      scope: { kind: 'columns', columnIds: ['yield'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', fractionDigits: 3, suffix: '%' },
    },
    {
      ...meta('fc-dates', 'Dates'),
      scope: { kind: 'dataTypes', dataTypes: ['date'], columnIds: [] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'date', pattern: 'dd-MMM-yyyy' },
    },
    {
      ...meta('fc-junk', 'Sub-investment grade'),
      scope: { kind: 'columns', columnIds: ['rating'] },
      target: 'cell',
      columnGroupScope: 'both',
      rule: {
        kind: 'predicates',
        predicates: [{ predicateId: 'In', inputs: ['BB+', 'BB', 'B'] }],
        operator: 'AND',
      },
      style: {
        backColor: { light: '#fff3cd', dark: '#4a3b00' },
        foreColor: { light: '#7a5a00', dark: '#ffd666' },
      },
    },
    {
      ...meta('fc-cancelled', 'Cancelled rows'),
      scope: { kind: 'all' },
      target: 'cell',
      columnGroupScope: 'both',
      rule: {
        kind: 'predicates',
        predicates: [{ predicateId: 'Is', inputs: ['Cancelled'], columnId: 'status' }],
        operator: 'AND',
      },
      style: { opacity: 0.55, font: { decoration: 'lineThrough' } },
    },
  ];
  cfg.modules.formatting = { v: 1, data: { formatColumns, editStateStyles: {} } };

  return cfg as GridConfig;
}
