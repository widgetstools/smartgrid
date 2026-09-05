import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { NumberField, RangeField, numberConstraints } from './NumberField.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('numberConstraints', () => {
  it('prefers options over jsonSchema and derives integer/exclusive bounds', () => {
    expect(numberConstraints({ min: 1, suffix: 'px' }, { minimum: 0, maximum: 10, type: 'integer' })).toEqual(
      { integer: true, min: 1, max: 10, suffix: 'px' },
    );
    expect(numberConstraints(undefined, { exclusiveMinimum: 0, type: 'integer' })).toEqual({
      integer: true,
      min: 1,
    });
  });
});

describe('NumberField', () => {
  it('renders the value, round-trips edits and clears to undefined', async () => {
    const onChange = vi.fn();
    wrap(<NumberField value={5} onChange={onChange} label="Width" />);
    const input = screen.getByLabelText('Width');
    expect(input).toHaveValue(5);
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await userEvent.type(input, '7');
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('clamps to jsonSchema bounds and shows the suffix', async () => {
    const onChange = vi.fn();
    wrap(
      <NumberField
        value={undefined}
        onChange={onChange}
        label="Width"
        jsonSchema={{ minimum: 0, maximum: 10 }}
        options={{ suffix: 'px' }}
      />,
    );
    await userEvent.type(screen.getByLabelText('Width'), '50');
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(screen.getByText('px')).toBeInTheDocument();
  });

  it('renders inline without a label', () => {
    wrap(<NumberField value={1} onChange={() => {}} label="Width" mode="inline" />);
    expect(screen.queryByText('Width')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
  });
});

describe('RangeField', () => {
  it('renders both ends and enforces min <= max', async () => {
    const onChange = vi.fn();
    wrap(<RangeField value={[1, 10]} onChange={onChange} label="Range" />);
    const min = screen.getByPlaceholderText('Min');
    const max = screen.getByPlaceholderText('Max');
    expect(min).toHaveValue(1);
    expect(max).toHaveValue(10);

    await userEvent.clear(min);
    await userEvent.type(min, '20');
    expect(onChange).toHaveBeenLastCalledWith([20, 20]);
  });

  it('emits undefined only when both ends are cleared', async () => {
    const onChange = vi.fn();
    wrap(<RangeField value={[1, 10]} onChange={onChange} label="Range" />);
    await userEvent.clear(screen.getByPlaceholderText('Min'));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByPlaceholderText('Max'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders inline without a label', () => {
    wrap(<RangeField value={[1, 2]} onChange={() => {}} label="Range" mode="inline" />);
    expect(screen.queryByText('Range')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Range' })).toBeInTheDocument();
  });
});
