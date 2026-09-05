import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { SelectValuesEditor, sampleToString, splitValues } from './SelectValuesEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('helpers', () => {
  it('splits and stringifies', () => {
    expect(splitValues(' a, b\nc\t d ,,')).toEqual(['a', 'b', 'c', 'd']);
    expect(sampleToString(null)).toBeUndefined();
    expect(sampleToString(12)).toBe('12');
    expect(sampleToString(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('SelectValuesEditor', () => {
  it('renders chips and adds on Enter, comma and paste', async () => {
    const onChange = vi.fn();
    wrap(<SelectValuesEditor value={['a', 'b']} onChange={onChange} label="Values" />);
    expect(screen.getByText('a')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Add Values' });

    await userEvent.type(input, 'c{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    await userEvent.type(input, 'd,');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'd']);
    await userEvent.click(input);
    await userEvent.paste('x, y\nz');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'x', 'y', 'z']);
  });

  it('removes chips, pops the last on Backspace and empties to undefined', async () => {
    const onChange = vi.fn();
    wrap(<SelectValuesEditor value={['a', 'b']} onChange={onChange} label="Values" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(onChange).toHaveBeenLastCalledWith(['b']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Add Values' }), '{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['a']);
    cleanup();

    const single = vi.fn();
    wrap(<SelectValuesEditor value={['a']} onChange={single} label="Values" />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(single).toHaveBeenLastCalledWith(undefined);
  });

  it('fills from a column via the inline column picker', async () => {
    const onChange = vi.fn();
    wrap(<SelectValuesEditor value={['Rates']} onChange={onChange} label="Values" />);
    await userEvent.click(screen.getByRole('combobox', { name: 'From column' }));
    await userEvent.click(screen.getByRole('option', { name: /Desk/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Rates', 'Credit', 'FX']);
  });

  it('renders inline without a label', () => {
    wrap(<SelectValuesEditor value={['a']} onChange={() => {}} label="Values" mode="inline" />);
    expect(screen.queryByText('Values')).not.toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
  });
});
