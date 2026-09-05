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
      scope: { kind: 'columns', columnIds: ['notional', 'pnl', 'deskPnl'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', preset: 'Integer' },
      style: { alignment: { horizontal: 'right' }, font: { family: 'mono' } },
    },
    {
      ...meta('fc-bps', 'Basis points'),
      scope: { kind: 'columns', columnIds: ['pnlBps'] },
      target: 'cell',
      columnGroupScope: 'both',
      displayFormat: { kind: 'number', fractionDigits: 1, suffix: ' bp' },
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
      ...meta('fc-big-loss', 'Big Rates losses (expression)'),
      scope: { kind: 'columns', columnIds: ['pnl', 'instrument'] },
      target: 'cell',
      columnGroupScope: 'both',
      rule: {
        kind: 'expression',
        expression: "[pnl] < -100000 AND [desk] = 'Rates'",
      },
      style: {
        backColor: { light: '#ffe4e6', dark: '#4c0519' },
        font: { weight: 'bold' },
        border: { left: { width: 3, style: 'solid', color: 'var(--sg-negative)' } },
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

  // Calculated columns: a per-row scalar and an aggregated one (per desk).
  cfg.modules.calculatedColumns = {
    v: 1,
    data: {
      calculatedColumns: [
        {
          ...meta('cc-pnl-bps', 'PnL (bps)'),
          columnId: 'pnlBps',
          header: 'PnL bps',
          expression: { kind: 'scalar', expression: '[pnl] / [notional] * 10000' },
          dataType: 'number',
          settings: {
            width: 100,
            filterable: true,
            sortable: true,
            groupable: false,
            pivotable: false,
            aggregatable: true,
            resizable: true,
            suppressMenu: false,
            suppressMovable: false,
            columnTypes: [],
            showExpressionTooltip: true,
          },
        },
        {
          ...meta('cc-desk-pnl', 'Desk PnL'),
          columnId: 'deskPnl',
          header: 'Desk PnL',
          expression: { kind: 'aggregated', expression: 'SUM([pnl], GROUP_BY([desk]))' },
          dataType: 'number',
          settings: {
            width: 120,
            filterable: false,
            sortable: true,
            groupable: false,
            pivotable: false,
            aggregatable: false,
            resizable: true,
            suppressMenu: false,
            suppressMovable: false,
            columnTypes: [],
            showExpressionTooltip: true,
          },
        },
      ],
    },
  };
  blotter.columns.splice(blotter.columns.indexOf('pnlPct') + 1, 0, 'pnlBps', 'deskPnl');
  blotter.columnSizing['pnlBps'] = { width: 100, resizable: true };

  // Styled columns: one renderer per column.
  cfg.modules.styledColumns = {
    v: 1,
    data: {
      styledColumns: [
        {
          ...meta('sc-pnlpct', 'PnL % gradient'),
          columnId: 'pnlPct',
          style: {
            kind: 'gradient',
            rangeValueType: 'number',
            ranges: [],
            zeroCentred: { negativeColor: 'var(--sg-negative)', positiveColor: 'var(--sg-positive)' },
            minAlpha: 0.1,
            maxAlpha: 0.7,
            autoContrastText: true,
          },
        },
        {
          ...meta('sc-yield', 'Yield bar'),
          columnId: 'yield',
          style: {
            kind: 'percentBar',
            rangeValueType: 'number',
            ranges: [{ min: 'Col-Min', max: 'Col-Max', color: 'var(--sg-info)', reverseGradient: false }],
            origin: 'min',
            text: { show: 'value', position: 'inside' },
          },
        },
        {
          ...meta('sc-rating', 'Rating badges'),
          columnId: 'rating',
          style: {
            kind: 'badge',
            badges: [
              {
                shape: 'pill',
                style: {
                  backColor: { light: '#dcfce7', dark: '#14532d' },
                  foreColor: { light: '#166534', dark: '#bbf7d0' },
                },
                rule: {
                  kind: 'predicates',
                  predicates: [{ predicateId: 'StartsWith', inputs: ['A'] }],
                  operator: 'AND',
                },
                iconPosition: 'start',
                iconOnly: false,
              },
              {
                shape: 'pill',
                style: {
                  backColor: { light: '#fef9c3', dark: '#713f12' },
                  foreColor: { light: '#854d0e', dark: '#fef08a' },
                },
                rule: {
                  kind: 'predicates',
                  predicates: [{ predicateId: 'StartsWith', inputs: ['BBB'] }],
                  operator: 'AND',
                },
                iconPosition: 'start',
                iconOnly: false,
              },
              {
                shape: 'pill',
                style: {
                  backColor: { light: '#fee2e2', dark: '#7f1d1d' },
                  foreColor: { light: '#991b1b', dark: '#fecaca' },
                },
                iconPosition: 'start',
                iconOnly: false,
              },
            ],
            density: 'compact',
            overflow: 'truncate',
          },
        },
        {
          ...meta('sc-status', 'Status icons'),
          columnId: 'status',
          style: {
            kind: 'icon',
            preset: 'status',
            mappings: [],
            matchMode: 'caseInsensitive',
            fallback: { mode: 'showText' },
            text: 'after',
            size: 14,
            gap: 6,
          },
        },
      ],
    },
  };

  // Flashing on ticking prices and PnL.
  cfg.modules.flashing = {
    v: 1,
    data: {
      flashingCells: [
        {
          ...meta('flash-ticks', 'Price & PnL ticks'),
          scope: { kind: 'columns', columnIds: ['price', 'pnl', 'pnlPct'] },
          target: 'cell',
          duration: 600,
          columnGroupScope: 'both',
        },
      ],
      defaults: {
        duration: 500,
        upStyle: { backColor: { light: '#d1fae5', dark: '#064e3b' } },
        downStyle: { backColor: { light: '#fee2e2', dark: '#7f1d1d' } },
        neutralStyle: { backColor: { light: '#e5e7eb', dark: '#374151' } },
      },
    },
  };

  // Alerts: a data-change alert with highlight, an aggregated one and an observable one.
  cfg.modules.alerts = {
    v: 1,
    data: {
      alerts: [
        {
          ...meta('alert-big-loss', 'Big loss'),
          messageType: 'warning',
          header: 'Big loss on [primaryKeyValue]',
          text: '[column] moved from [oldValue] to [newValue] ([rowData.desk])',
          scope: { kind: 'columns', columnIds: ['pnl'] },
          rule: {
            kind: 'predicates',
            predicates: [{ predicateId: 'LessThan', inputs: [-220000] }],
            operator: 'AND',
          },
          behaviour: {
            notify: true,
            notificationDuration: 4000,
            statusMessage: false,
            logToConsole: false,
            highlightRow: true,
            highlightCell: false,
            jumpToCell: false,
            jumpToRow: false,
            preventEdit: false,
          },
        },
        {
          ...meta('alert-rates-exposure', 'Rates desk PnL'),
          messageType: 'error',
          text: 'Rates desk PnL has dropped below -1.5m',
          scope: { kind: 'all' },
          rule: { kind: 'aggregated', expression: "SUM([pnl]) < '-1.5M' WHERE [desk] = 'Rates'" },
          behaviour: {
            notify: true,
            notificationDuration: 5000,
            statusMessage: true,
            logToConsole: true,
            highlightRow: false,
            highlightCell: false,
            jumpToCell: false,
            jumpToRow: false,
            preventEdit: false,
          },
        },
        {
          ...meta('alert-busy-row', 'Busy row'),
          messageType: 'info',
          text: 'Price on [primaryKeyValue] changed 12 times in 30 seconds',
          scope: { kind: 'all' },
          rule: { kind: 'observable', expression: "ROW_CHANGE(COUNT([price], 12), TIMEFRAME('30s'))" },
          behaviour: {
            notify: true,
            notificationDuration: 3000,
            statusMessage: false,
            logToConsole: false,
            highlightRow: false,
            highlightCell: true,
            jumpToCell: false,
            jumpToRow: false,
            preventEdit: false,
          },
        },
      ],
      options: { highlightDuration: 2000, maxToasts: 5 },
    },
  };

  // Named queries usable through QUERY('…'); quick search off by default.
  cfg.modules.queries = {
    v: 1,
    data: {
      namedQueries: [
        { ...meta('nq-big', 'BigTrades'), expression: '[notional] > 40000000' },
        { ...meta('nq-live-rates', 'LiveRates'), expression: "[desk] = 'Rates' AND [status] = 'Live'" },
      ],
      quickSearch: {
        text: '',
        mode: 'highlight',
        style: { backColor: { light: '#fef08a', dark: '#713f12' } },
        caseSensitive: false,
      },
    },
  };

  return cfg as GridConfig;
}
