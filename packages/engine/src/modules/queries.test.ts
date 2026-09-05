import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef, IRowNode } from 'ag-grid-community';
import {
  createGridConfig,
  defaultTableLayout,
  type CellDataType,
  type ColumnFilter,
  type ColumnInfo,
  type GridFilter,
  type QuickSearch,
  type TypedGridConfig,
} from '@smartgrid/schema';
import { buildGrid } from '../build.js';
import type { BuildOutput } from '../core/types.js';
import { FC_CLASS } from './formatting.js';
import { filtersSignature, QUICK_SEARCH_CLASS, type QueriesRuntimePart } from './queries.js';

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

const pnlOver100: ColumnFilter = {
  columnId: 'pnl',
  predicates: [{ predicateId: 'GreaterThan', inputs: [100] }],
  operator: 'AND',
  enabled: true,
};
const ratesOnly: GridFilter = { expression: "[desk] = 'rates'", enabled: true };

function config(
  opts: {
    columnFilters?: ColumnFilter[];
    gridFilter?: GridFilter;
    quickSearch?: Partial<QuickSearch>;
    namedQueries?: { name: string; expression: string; enabled?: boolean }[];
  } = {},
): TypedGridConfig {
  const cfg = createGridConfig('g');
  const layout = defaultTableLayout('l', 'L', ['desk', 'pnl', 'qty']);
  layout.columnFilters = opts.columnFilters ?? [];
  layout.gridFilter = opts.gridFilter;
  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'l', layouts: [layout] } };
  const queries = cfg.modules.queries!.data;
  queries.quickSearch = { ...queries.quickSearch, ...opts.quickSearch };
  queries.namedQueries = (opts.namedQueries ?? []).map((q) => ({
    id: q.name,
    name: q.name,
    expression: q.expression,
    enabled: q.enabled ?? true,
    readOnly: false,
    tags: [],
    source: 'user',
  }));
  return cfg;
}

const build = (cfg: TypedGridConfig) => buildGrid({ config: cfg, baseColumnDefs: baseDefs, columns });

function passes(out: BuildOutput, data: Record<string, unknown> | undefined): boolean {
  return out.gridOptions.doesExternalFilterPass!({ data } as IRowNode);
}

const classRule = (def: ColDef, cls: string) =>
  def.cellClassRules?.[cls] as (p: Partial<CellClassParams>) => boolean;

describe('queries: column and grid filters', () => {
  it('combines column filters and the grid filter with AND through the external filter', () => {
    const out = build(config({ columnFilters: [pnlOver100], gridFilter: ratesOnly }));
    expect(out.warnings).toEqual([]);
    expect(out.gridOptions.isExternalFilterPresent!({} as never)).toBe(true);
    expect(passes(out, { desk: 'Rates', pnl: 150 })).toBe(true);
    expect(passes(out, { desk: 'Rates', pnl: 50 })).toBe(false);
    expect(passes(out, { desk: 'Credit', pnl: 150 })).toBe(false);
    // Group rows have no data and always pass.
    expect(passes(out, undefined)).toBe(true);
    const part = out.runtime.part<QueriesRuntimePart>('queries')!;
    expect(part.matches({ desk: 'rates', pnl: 101 })).toBe(true);
    expect(part.matches({ desk: 'rates', pnl: 100 })).toBe(false);
  });

  it('honours OR operators, disabled filters and referenced-column predicates', () => {
    const out = build(
      config({
        columnFilters: [
          {
            columnId: 'pnl',
            predicates: [
              { predicateId: 'Negative', inputs: [] },
              { predicateId: 'Contains', inputs: ['rat'], columnId: 'desk' },
            ],
            operator: 'OR',
            enabled: true,
          },
          { ...pnlOver100, enabled: false },
        ],
        gridFilter: { ...ratesOnly, enabled: false },
      }),
    );
    expect(passes(out, { desk: 'credit', pnl: -1 })).toBe(true);
    expect(passes(out, { desk: 'rates', pnl: 5 })).toBe(true);
    expect(passes(out, { desk: 'credit', pnl: 5 })).toBe(false);
  });

  it('installs no external filter when nothing filters', () => {
    const out = build(config());
    expect(out.gridOptions.isExternalFilterPresent).toBeUndefined();
    expect(out.gridOptions.doesExternalFilterPass).toBeUndefined();
    expect(out.runtime.part<QueriesRuntimePart>('queries')!.matches({})).toBe(true);
  });

  it('warns on an invalid grid filter or unknown filter column and keeps the rest', () => {
    const out = build(
      config({
        columnFilters: [{ ...pnlOver100, columnId: 'nope' }, pnlOver100],
        gridFilter: { expression: '[desk] = ', enabled: true },
      }),
    );
    expect(out.warnings).toHaveLength(2);
    expect(out.warnings[0]).toMatch(/Column filter on "nope": unknown column/);
    expect(out.warnings[1]).toMatch(/^Grid filter: .*rule skipped$/);
    expect(passes(out, { desk: 'credit', pnl: 150 })).toBe(true);
    expect(passes(out, { desk: 'credit', pnl: 50 })).toBe(false);
  });

  it('filters on calculated column values', () => {
    const cfg = config({
      columnFilters: [{ ...pnlOver100, columnId: 'notional' }],
    });
    cfg.modules.calculatedColumns!.data.calculatedColumns = [
      {
        id: 'n',
        name: 'notional',
        columnId: 'notional',
        expression: { kind: 'scalar', expression: '[pnl] * [qty]' },
        dataType: 'number',
        enabled: true,
        readOnly: false,
        tags: [],
        source: 'user',
        settings: {
          filterable: true,
          sortable: true,
          groupable: false,
          pivotable: false,
          aggregatable: false,
          resizable: true,
          suppressMenu: false,
          suppressMovable: false,
          columnTypes: [],
          showExpressionTooltip: false,
        },
      },
    ];
    const out = build(cfg);
    expect(out.warnings).toEqual([]);
    expect(passes(out, { pnl: 30, qty: 4 })).toBe(true);
    expect(passes(out, { pnl: 30, qty: 3 })).toBe(false);
  });
});

describe('queries: quick search', () => {
  it('highlight mode adds a class rule to every column and a style rule, without filtering rows', () => {
    const out = build(config({ quickSearch: { text: 'rat', mode: 'highlight' } }));
    const defs = out.columnDefs as ColDef[];
    expect(defs).toHaveLength(3);
    for (const d of defs) {
      const rule = classRule(d, QUICK_SEARCH_CLASS);
      expect(rule({ value: 'Rates' })).toBe(true);
      expect(rule({ value: 'Credit' })).toBe(false);
      expect(rule({ value: null })).toBe(false);
    }
    expect(classRule(defs[1]!, QUICK_SEARCH_CLASS)({ value: 1.5 })).toBe(false);
    expect(out.css).toContain(`.ag-root-wrapper .${QUICK_SEARCH_CLASS}{background-color:#fef08a}`);
    expect(out.css).toContain(
      `[data-theme="dark"] .ag-root-wrapper .${QUICK_SEARCH_CLASS}{background-color:#713f12}`,
    );
    expect(out.gridOptions.isExternalFilterPresent).toBeUndefined();
  });

  it('respects caseSensitive', () => {
    const out = build(config({ quickSearch: { text: 'rat', mode: 'highlight', caseSensitive: true } }));
    const rule = classRule((out.columnDefs as ColDef[])[0]!, QUICK_SEARCH_CLASS);
    expect(rule({ value: 'Rates' })).toBe(false);
    expect(rule({ value: 'rates' })).toBe(true);
  });

  it('filter mode keeps rows where any column contains the text', () => {
    const out = build(config({ quickSearch: { text: '15', mode: 'filter' } }));
    expect((out.columnDefs as ColDef[]).every((d) => !d.cellClassRules)).toBe(true);
    expect(passes(out, { desk: 'rates', pnl: 150, qty: 1 })).toBe(true);
    expect(passes(out, { desk: 'desk15', pnl: 1, qty: 1 })).toBe(true);
    expect(passes(out, { desk: 'rates', pnl: 20, qty: 1 })).toBe(false);
  });

  it('both mode highlights and filters, additively with other filters', () => {
    const out = build(config({ quickSearch: { text: 'rates', mode: 'both' }, columnFilters: [pnlOver100] }));
    expect(classRule((out.columnDefs as ColDef[])[0]!, QUICK_SEARCH_CLASS)({ value: 'Rates' })).toBe(true);
    expect(passes(out, { desk: 'rates', pnl: 150 })).toBe(true);
    expect(passes(out, { desk: 'rates', pnl: 50 })).toBe(false);
    expect(passes(out, { desk: 'credit', pnl: 150 })).toBe(false);
  });

  it('does nothing for blank text', () => {
    const out = build(config({ quickSearch: { text: '   ', mode: 'both' } }));
    expect((out.columnDefs as ColDef[]).every((d) => !d.cellClassRules)).toBe(true);
    expect(out.gridOptions.isExternalFilterPresent).toBeUndefined();
    expect(out.css).not.toContain(QUICK_SEARCH_CLASS);
  });
});

describe('queries: named queries', () => {
  const big = { name: 'Big', expression: '[pnl] > 100' };

  it('resolves QUERY() from a format column rule and from the grid filter', () => {
    const cfg = config({
      namedQueries: [big, { name: 'Big rates', expression: "QUERY('big') AND [desk] = 'rates'" }],
      gridFilter: { expression: "QUERY('Big rates')", enabled: true },
    });
    cfg.modules.formatting!.data.formatColumns = [
      {
        id: 'fc',
        name: 'Big',
        enabled: true,
        readOnly: false,
        tags: [],
        source: 'user',
        scope: { kind: 'columns', columnIds: ['pnl'] },
        target: 'cell',
        columnGroupScope: 'both',
        rule: { kind: 'expression', expression: "QUERY('Big')" },
        style: { font: { weight: 'bold' } },
        rowScope: {
          excludeDataRows: false,
          excludeGroupRows: false,
          excludeSummaryRows: false,
          excludeTotalRows: false,
        },
      },
    ];
    const out = build(cfg);
    expect(out.warnings).toEqual([]);
    const pnl = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    const rule = classRule(pnl, FC_CLASS('fc'));
    expect(rule({ value: 150, data: { pnl: 150 }, node: {} as never })).toBe(true);
    expect(rule({ value: 50, data: { pnl: 50 }, node: {} as never })).toBe(false);
    expect(passes(out, { desk: 'Rates', pnl: 150 })).toBe(true);
    expect(passes(out, { desk: 'Credit', pnl: 150 })).toBe(false);
    expect(passes(out, { desk: 'Rates', pnl: 5 })).toBe(false);
  });

  it('warns on invalid named queries and treats a missing query as false', () => {
    const out = build(
      config({
        namedQueries: [
          { name: 'Broken', expression: '[pnl] >' },
          { ...big, enabled: false },
        ],
        gridFilter: { expression: "QUERY('Big')", enabled: true },
      }),
    );
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/^Named query "Broken": /);
    expect(passes(out, { desk: 'rates', pnl: 150 })).toBe(false);
  });
});

describe('filtersSignature', () => {
  it('changes only when something that filters rows changes', () => {
    const base = filtersSignature(config({ columnFilters: [pnlOver100] }));
    expect(filtersSignature(config({ columnFilters: [pnlOver100] }))).toBe(base);
    expect(filtersSignature(config({ columnFilters: [{ ...pnlOver100, enabled: false }] }))).not.toBe(base);
    expect(
      filtersSignature(
        config({
          columnFilters: [{ ...pnlOver100, predicates: [{ predicateId: 'GreaterThan', inputs: [1] }] }],
        }),
      ),
    ).not.toBe(base);
    expect(filtersSignature(config({ columnFilters: [pnlOver100], gridFilter: ratesOnly }))).not.toBe(base);
    expect(
      filtersSignature(config({ columnFilters: [pnlOver100], quickSearch: { text: 'x', mode: 'filter' } })),
    ).not.toBe(base);
    // Highlight-only quick search does not change which rows show.
    expect(
      filtersSignature(
        config({ columnFilters: [pnlOver100], quickSearch: { text: 'x', mode: 'highlight' } }),
      ),
    ).toBe(base);
    // Named queries feed QUERY() in filters, so they are part of the signature.
    expect(
      filtersSignature(
        config({ columnFilters: [pnlOver100], namedQueries: [{ name: 'Big', expression: '[pnl] > 1' }] }),
      ),
    ).not.toBe(base);
    // Layout cosmetics do not.
    const cosmetic = config({ columnFilters: [pnlOver100] });
    cosmetic.modules.layout!.data.layouts[0]!.columnPinning = { desk: 'left' };
    expect(filtersSignature(cosmetic)).toBe(base);
    expect(filtersSignature(createGridConfig('g'))).not.toBe(base);
  });
});
