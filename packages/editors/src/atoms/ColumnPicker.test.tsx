import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { ColumnChip, ColumnPicker, ColumnsPicker } from './ColumnPicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('ColumnChip', () => {
  it('renders the header for a known column and the raw id otherwise', () => {
    wrap(
      <>
        <ColumnChip columnId="pnl" />
        <ColumnChip columnId="ghost" />
      </>,
    );
    expect(screen.getByText('PnL')).toBeInTheDocument();
    expect(screen.getByText('ghost')).toHaveClass('font-mono');
  });
});

describe('ColumnPicker', () => {
  it('renders the selected column and round-trips a pick', async () => {
    const onChange = vi.fn();
    wrap(<ColumnPicker value="pnl" onChange={onChange} label="Column" />);
    const trigger = screen.getByRole('combobox', { name: 'Column' });
    expect(trigger).toHaveTextContent('PnL');

    await userEvent.click(trigger);
    await userEvent.type(screen.getByPlaceholderText('Search columns…'), 'des');
    await userEvent.click(screen.getByRole('option', { name: /Desk/ }));
    expect(onChange).toHaveBeenCalledWith('desk');
  });

  it('clears to undefined', async () => {
    const onChange = vi.fn();
    wrap(<ColumnPicker value="pnl" onChange={onChange} label="Column" />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear column' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('filters by options.dataTypes', async () => {
    wrap(
      <ColumnPicker
        value={undefined}
        onChange={() => {}}
        label="Column"
        options={{ dataTypes: ['number'] }}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Column' }));
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names.join(' ')).toContain('Notional');
    expect(names.join(' ')).not.toContain('Desk');
  });

  it('renders inline without a label and honours readOnly', () => {
    wrap(<ColumnPicker value="pnl" onChange={() => {}} label="Column" mode="inline" readOnly />);
    expect(screen.queryByText('Column')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Column' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear column' })).not.toBeInTheDocument();
  });
});

describe('ColumnsPicker', () => {
  it('renders the ordered list and appends via the add combobox', async () => {
    const onChange = vi.fn();
    wrap(<ColumnsPicker value={['pnl', 'desk']} onChange={onChange} label="Columns" />);
    const list = screen.getByRole('list', { name: 'Columns (selected)' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('PnL');
    expect(rows[1]).toHaveTextContent('Desk');

    await userEvent.click(screen.getByRole('combobox', { name: 'Add column' }));
    expect(screen.queryByRole('option', { name: /PnL/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Ccy/ }));
    expect(onChange).toHaveBeenCalledWith(['pnl', 'desk', 'ccy']);
  });

  it('reorders with buttons and Alt+Arrow keys, removes, and empties to undefined', async () => {
    const onChange = vi.fn();
    wrap(<ColumnsPicker value={['pnl', 'desk', 'ccy']} onChange={onChange} label="Columns" />);
    await userEvent.click(screen.getByRole('button', { name: 'Move desk up' }));
    expect(onChange).toHaveBeenLastCalledWith(['desk', 'pnl', 'ccy']);

    const firstRow = screen.getAllByRole('listitem')[0] as HTMLElement;
    firstRow.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onChange).toHaveBeenLastCalledWith(['desk', 'pnl', 'ccy']);

    await userEvent.click(screen.getByRole('button', { name: 'Remove ccy' }));
    expect(onChange).toHaveBeenLastCalledWith(['pnl', 'desk']);

    cleanup();
    const single = vi.fn();
    wrap(<ColumnsPicker value={['pnl']} onChange={single} label="Columns" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove pnl' }));
    expect(single).toHaveBeenCalledWith(undefined);
  });

  it('disables adding at options.max', () => {
    wrap(<ColumnsPicker value={['pnl', 'desk']} onChange={() => {}} label="Columns" options={{ max: 2 }} />);
    expect(screen.getByRole('combobox', { name: 'Add column' })).toBeDisabled();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('renders inline without a label', () => {
    wrap(<ColumnsPicker value={['pnl']} onChange={() => {}} label="Columns" mode="inline" />);
    expect(screen.queryByText('Columns')).not.toBeInTheDocument();
    expect(screen.getByText('PnL')).toBeInTheDocument();
  });
});
