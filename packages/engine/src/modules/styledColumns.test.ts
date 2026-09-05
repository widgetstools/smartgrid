import { describe, expect, it } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { createGridConfig, StyledColumn, type ColumnInfo, type TypedGridConfig } from '@smartgrid/schema';
import { buildGrid } from '../build.js';
import { GridRuntime } from '../runtime/runtime.js';
import { SC_CLASS, STYLED_COLUMN_RENDERER, type StyledColumnRendererParams } from './styledColumns.js';

const col = (id: string, dataType: ColumnInfo['dataType']): ColumnInfo => ({
  id,
  header: id,
  dataType,
  columnTypes: [],
  sampleValues: [],
  editable: false,
  isPrimaryKey: false,
  isSpecial: false,
});
const columns: ColumnInfo[] = [col('desk', 'text'), col('pnl', 'number'), col('limit', 'number')];
const baseDefs: ColDef[] = columns.map((c) => ({ field: c.id, cellDataType: c.dataType }));
const rows = [
  { id: 'a', desk: 'FX', pnl: 10, limit: 50 },
  { id: 'b', desk: 'Rates', pnl: -20, limit: 100 },
  { id: 'c', desk: 'Credit', pnl: 40, limit: 80 },
];

function config(styled: unknown[], withFormat = false): TypedGridConfig {
  const cfg = createGridConfig('g');
  cfg.modules.styledColumns = {
    v: 1,
    data: { styledColumns: styled.map((s) => StyledColumn.parse(s)) },
  };
  if (withFormat)
    cfg.modules.formatting = {
      v: 1,
      data: {
        editStateStyles: {},
        formatColumns: [
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

function paramsOf(out: ReturnType<typeof buildGrid>, id: string): StyledColumnRendererParams {
  const def = (out.columnDefs as ColDef[]).find((d) => d.field === id)!;
  expect(def.cellRenderer).toBe(STYLED_COLUMN_RENDERER);
  return (def.cellRendererParams as { styled: StyledColumnRendererParams }).styled;
}

describe('styledColumns module', () => {
  it('binds the renderer with self-contained params and resolves endpoints', () => {
    const runtime = new GridRuntime({ getRows: () => rows, rowIdOf: (d) => String(d['id']) });
    const out = buildGrid({
      config: config([
        {
          id: 'g1',
          name: 'PnL gradient',
          columnId: 'pnl',
          style: {
            kind: 'gradient',
            ranges: [{ min: 'Col-Min', max: 'Col-Max', color: 'var(--sg-positive)' }],
            font: { weight: 'bold' },
          },
        },
      ]),
      baseColumnDefs: baseDefs,
      columns,
      runtime,
    });
    expect(out.warnings).toEqual([]);
    const p = paramsOf(out, 'pnl');
    expect(p.columnId).toBe('pnl');
    expect(p.style.kind).toBe('gradient');
    expect(p.resolveEndpoint(7)).toBe(7);
    expect(p.resolveEndpoint('Col-Max')).toBe(40);
    expect(p.resolveEndpoint('Col-Min')).toBe(-20);
    expect(p.resolveEndpoint('Col-Avg')).toBe(10);
    expect(p.resolveEndpoint('Col-Median')).toBe(10);
    expect(p.resolveEndpoint({ columnId: 'limit' }, rows[0])).toBe(50);
    expect(p.resolveEndpoint({ columnId: 'limit' }, undefined)).toBeUndefined();
    // Default row scope for non-badge kinds excludes group rows.
    expect(p.rowScope).toMatchObject({ excludeGroupRows: true, excludeDataRows: false });
    // Font emitted as a cell-level class and stylesheet rule.
    const def = (out.columnDefs as ColDef[]).find((d) => d.field === 'pnl')!;
    expect(def.cellClass).toEqual([SC_CLASS('g1')]);
    expect(out.css).toContain(`.${SC_CLASS('g1')}{font-weight:700}`);
  });

  it('Col-* endpoints follow stats invalidation after data changes', () => {
    let data = rows;
    const runtime = new GridRuntime({ getRows: () => data, rowIdOf: (d) => String(d['id']) });
    const out = buildGrid({
      config: config([
        {
          id: 'r',
          name: 'Range',
          columnId: 'pnl',
          style: { kind: 'rangeBar', min: 'Col-Min', max: 'Col-Max' },
        },
      ]),
      baseColumnDefs: baseDefs,
      columns,
      runtime,
    });
    const p = paramsOf(out, 'pnl');
    expect(p.resolveEndpoint('Col-Max')).toBe(40);
    data = [...rows, { id: 'd', desk: 'FX', pnl: 99, limit: 1 }];
    runtime.rowsChanged([{ kind: 'added', rowId: 'd', data: data[3]!, at: 1 }]);
    expect(p.resolveEndpoint('Col-Max')).toBe(99);
  });

  it('picks the first matching badge and skips badges with invalid rules', () => {
    const out = buildGrid({
      config: config([
        {
          id: 'b',
          name: 'Sign badge',
          columnId: 'pnl',
          style: {
            kind: 'badge',
            badges: [
              { rule: { kind: 'expression', expression: '[pnl] >' }, style: { backColor: 'red' } },
              {
                rule: {
                  kind: 'predicates',
                  predicates: [{ predicateId: 'Negative', inputs: [] }],
                  operator: 'AND',
                },
                style: { backColor: 'var(--sg-negative)' },
              },
              {
                rule: { kind: 'expression', expression: '[pnl] > 30' },
                style: { backColor: 'var(--sg-positive)' },
              },
              { style: { backColor: 'var(--sg-muted)' } },
            ],
          },
        },
      ]),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain('badge 1');
    const p = paramsOf(out, 'pnl');
    expect(p.rowScope).toBeUndefined();
    expect(p.pickBadge!(-5, { pnl: -5 })).toBe(1);
    expect(p.pickBadge!(40, { pnl: 40 })).toBe(2);
    expect(p.pickBadge!(5, { pnl: 5 })).toBe(3);
  });

  it('formats through the column formatter and warns on missing columns or wrong kinds', () => {
    const out = buildGrid({
      config: config(
        [
          {
            id: 'p',
            name: 'Bar',
            columnId: 'pnl',
            style: { kind: 'percentBar', ranges: [{ min: 0, max: 100, color: 'blue' }] },
          },
          { id: 'x', name: 'Missing', columnId: 'nope', style: { kind: 'rating' } },
          { id: 'y', name: 'Wrong kind', columnId: 'desk', style: { kind: 'sparkline' } },
          { id: 'z', name: 'Disabled', columnId: 'limit', enabled: false, style: { kind: 'rating' } },
        ],
        true,
      ),
      baseColumnDefs: baseDefs,
      columns,
    });
    expect(out.warnings).toHaveLength(2);
    expect(out.warnings[0]).toContain('"nope" not found');
    expect(out.warnings[1]).toContain('sparkline is not available for text');
    const p = paramsOf(out, 'pnl');
    expect(p.formatValue!(1234.5)).toBe('$1,234.50');
    expect(p.formatValue!(null)).toBe('');
    const limit = (out.columnDefs as ColDef[]).find((d) => d.field === 'limit')!;
    expect(limit.cellRenderer).toBeUndefined();
  });
});
