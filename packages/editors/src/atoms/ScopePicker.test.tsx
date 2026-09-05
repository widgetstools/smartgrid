import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { RowScopePicker, ScopePicker } from './ScopePicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('ScopePicker', () => {
  it('defaults to all columns and switches kinds keeping column ids where sensible', async () => {
    const onChange = vi.fn();
    wrap(<ScopePicker value={{ kind: 'columns', columnIds: ['pnl'] }} onChange={onChange} label="Scope" />);
    expect(screen.getByRole('radio', { name: 'Columns' })).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByRole('radio', { name: 'Data types' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'dataTypes', dataTypes: ['number'], columnIds: ['pnl'] });
    await userEvent.click(screen.getByRole('radio', { name: 'All columns' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'all' });
  });

  it('toggles data types', async () => {
    const onChange = vi.fn();
    wrap(
      <ScopePicker
        value={{ kind: 'dataTypes', dataTypes: ['number'], columnIds: [] }}
        onChange={onChange}
        label="Scope"
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'date' }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'dataTypes',
      dataTypes: ['number', 'date'],
      columnIds: [],
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'number' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'dataTypes', dataTypes: [], columnIds: [] });
  });

  it('shows selected columns for a columns scope', () => {
    wrap(
      <ScopePicker
        value={{ kind: 'columns', columnIds: ['pnl', 'desk'] }}
        onChange={() => {}}
        label="Scope"
      />,
    );
    expect(screen.getByText('PnL')).toBeInTheDocument();
    expect(screen.getByText('Desk')).toBeInTheDocument();
  });
});

describe('RowScopePicker', () => {
  it('stores exclusions as the inverse of the checkboxes', async () => {
    const onChange = vi.fn();
    wrap(<RowScopePicker value={undefined} onChange={onChange} label="Rows" />);
    expect(screen.getByRole('checkbox', { name: 'Group rows' })).toHaveAttribute('data-state', 'checked');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Group rows' }));
    expect(onChange).toHaveBeenLastCalledWith({ excludeGroupRows: true });
  });

  it('re-including the only excluded kind clears the value', async () => {
    const onChange = vi.fn();
    wrap(<RowScopePicker value={{ excludeTotalRows: true }} onChange={onChange} label="Rows" />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Total rows' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
