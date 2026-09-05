import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { ColumnTypePicker, cellDataTypeLabel } from './ColumnTypePicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('ColumnTypePicker', () => {
  it('labels types readably', () => {
    expect(cellDataTypeLabel('dateString')).toBe('Date string');
    expect(cellDataTypeLabel('numberArray')).toBe('Number array');
  });

  it('renders the value and round-trips a grouped selection', async () => {
    const onChange = vi.fn();
    wrap(<ColumnTypePicker value="number" onChange={onChange} label="Type" />);
    const trigger = screen.getByRole('combobox', { name: 'Type' });
    expect(trigger).toHaveTextContent('Number');

    await userEvent.click(trigger);
    expect(screen.getByText('Scalar')).toBeInTheDocument();
    expect(screen.getByText('Array')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Number array' }));
    expect(onChange).toHaveBeenCalledWith('numberArray');
  });

  it('clears via the leading item', async () => {
    const onChange = vi.fn();
    wrap(<ColumnTypePicker value="text" onChange={onChange} label="Type" />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(screen.getByRole('option', { name: '—' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('renders inline without a label', () => {
    wrap(<ColumnTypePicker value="text" onChange={() => {}} label="Type" mode="inline" />);
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
  });
});
