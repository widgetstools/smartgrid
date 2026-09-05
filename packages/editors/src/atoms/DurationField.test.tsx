import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { DurationField, formatDuration, guessDurationUnit } from './DurationField.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('DurationField helpers', () => {
  it('guesses the largest exact unit and formats', () => {
    expect(guessDurationUnit(1500)).toBe('ms');
    expect(guessDurationUnit(5000)).toBe('s');
    expect(guessDurationUnit(120000)).toBe('min');
    expect(formatDuration(120000)).toBe('2 min');
    expect(formatDuration('always')).toBe('Always');
    expect(formatDuration(undefined)).toBe('');
  });
});

describe('DurationField', () => {
  it('renders the value in the guessed unit and round-trips edits in ms', async () => {
    const onChange = vi.fn();
    wrap(<DurationField value={5000} onChange={onChange} label="Duration" />);
    const input = screen.getByLabelText('Duration');
    expect(input).toHaveValue(5);
    expect(screen.getByRole('combobox', { name: 'Duration unit' })).toHaveTextContent('s');

    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await userEvent.type(input, '2');
    expect(onChange).toHaveBeenLastCalledWith(2000);
  });

  it('toggles Always on and off', async () => {
    const onChange = vi.fn();
    wrap(<DurationField value={5000} onChange={onChange} label="Duration" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Always' }));
    expect(onChange).toHaveBeenLastCalledWith('always');
    cleanup();

    const back = vi.fn();
    wrap(<DurationField value="always" onChange={back} label="Duration" />);
    expect(screen.getByLabelText('Duration')).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Always' }));
    expect(back).toHaveBeenLastCalledWith(undefined);
  });

  it('renders inline without a label', () => {
    wrap(<DurationField value={250} onChange={() => {}} label="Duration" mode="inline" />);
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('250')).toBeInTheDocument();
  });
});
