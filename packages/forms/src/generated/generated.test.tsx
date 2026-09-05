import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormatColumn, Layout, type ColumnInfo } from '@smartgrid/schema';
import { EditorContextProvider, EMPTY_EDITOR_CONTEXT } from '@smartgrid/editors';
import {
  FormatColumnForm,
  LayoutForm,
  defaultFormatColumn,
  defaultLayout,
  scopeEditorOptions,
} from './index.js';

afterEach(cleanup);

const col = (id: string, header: string, dataType: ColumnInfo['dataType']): ColumnInfo => ({
  id,
  header,
  dataType,
  columnTypes: [],
  sampleValues: [],
  editable: false,
  isPrimaryKey: false,
  isSpecial: false,
});
const columns = [
  col('pnl', 'PnL', 'number'),
  col('notional', 'Notional', 'number'),
  col('desk', 'Desk', 'text'),
  col('tradeDate', 'Trade date', 'date'),
];
const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={{ ...EMPTY_EDITOR_CONTEXT, columns }}>{ui}</EditorContextProvider>);

describe('generated forms', () => {
  it('defaultFormatColumn parses against the Zod schema once given a style', () => {
    const fc = defaultFormatColumn('fc1');
    expect(FormatColumn.safeParse({ ...fc, style: { foreColor: '#fff' } }).success).toBe(true);
    expect(fc.enabled).toBe(true);
    expect(fc.target).toBe('cell');
  });

  it('defaultLayout is a valid table layout', () => {
    const l = defaultLayout('l1', 'Layout', ['pnl']);
    expect(Layout.safeParse(l).success).toBe(true);
    expect(l.kind).toBe('table');
  });

  it('derives rule editor options from the scope', () => {
    expect(scopeEditorOptions({ kind: 'columns', columnIds: ['pnl'] }, columns)).toEqual({
      columnId: 'pnl',
      dataType: 'number',
    });
    expect(scopeEditorOptions({ kind: 'columns', columnIds: ['pnl', 'notional'] }, columns)).toEqual({
      dataType: 'number',
    });
    expect(scopeEditorOptions({ kind: 'columns', columnIds: ['pnl', 'desk'] }, columns)).toEqual({});
    expect(scopeEditorOptions({ kind: 'dataTypes', dataTypes: ['date'], columnIds: [] }, columns)).toEqual({
      dataType: 'date',
    });
    expect(scopeEditorOptions({ kind: 'all' }, columns)).toEqual({});
  });

  it('FormatColumnForm renders the composite editors and validates the style/format refinement', async () => {
    const onChange = vi.fn();
    const onValidate = vi.fn();
    const fc = {
      ...defaultFormatColumn('fc1', 'Neg red'),
      scope: { kind: 'columns' as const, columnIds: ['pnl'] },
      style: undefined,
    };
    wrap(<FormatColumnForm value={fc as FormatColumn} onChange={onChange} onValidate={onValidate} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Neg red');
    expect(screen.getByRole('radio', { name: 'Columns' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByText('PnL')).toBeInTheDocument();
    // Refinement error surfaces at the root
    const errs = onValidate.mock.calls.at(-1)?.[0] as { path: string; message: string }[];
    expect(errs.some((e) => e.message.includes('needs a style'))).toBe(true);
    // Condition kind selector comes from the rule editor, scoped to number predicates
    await userEvent.click(screen.getByRole('radio', { name: 'Conditions' }));
    const last = onChange.mock.calls.at(-1)?.[0] as FormatColumn;
    expect(last.rule).toEqual({
      kind: 'predicates',
      predicates: [{ predicateId: '', inputs: [] }],
      operator: 'AND',
    });
  });

  it('LayoutForm switches between table and pivot and uses column pickers', async () => {
    const onChange = vi.fn();
    const layout = defaultLayout('l1', 'Blotter', ['pnl', 'desk']);
    wrap(<LayoutForm value={layout} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Table' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('list', { name: 'Columns (selected)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Pivot' }));
    const next = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(next['kind']).toBe('pivot');
    expect(next['name']).toBe('Blotter');
    expect(next['pivotColumns']).toEqual([]);
  });
});
