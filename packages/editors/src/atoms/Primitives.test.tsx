import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { BooleanField, EnumField, TextField, enumOptionsFrom } from './Primitives.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('TextField', () => {
  it('renders the value and round-trips edits, clearing to undefined', async () => {
    const onChange = vi.fn();
    wrap(<TextField value="abc" onChange={onChange} label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveValue('abc');
    await userEvent.type(input, 'd');
    expect(onChange).toHaveBeenLastCalledWith('abcd');
    await userEvent.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('honours multiline, placeholder and jsonSchema maxLength', () => {
    wrap(
      <TextField
        value={undefined}
        onChange={() => {}}
        label="Notes"
        options={{ multiline: true, placeholder: 'Type…' }}
        jsonSchema={{ type: 'string', maxLength: 12 }}
      />,
    );
    const area = screen.getByPlaceholderText('Type…');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('maxlength', '12');
  });

  it('renders inline without a label', () => {
    wrap(<TextField value="x" onChange={() => {}} label="Name" mode="inline" />);
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('x')).toBeInTheDocument();
  });
});

describe('BooleanField', () => {
  it('round-trips a toggle', async () => {
    const onChange = vi.fn();
    wrap(<BooleanField value={false} onChange={onChange} label="Enabled" />);
    const sw = screen.getByRole('switch', { name: 'Enabled' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders inline without a label and honours disabled', () => {
    wrap(<BooleanField value onChange={() => {}} label="Enabled" mode="inline" disabled />);
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeDisabled();
  });
});

describe('EnumField', () => {
  it('resolves options from x-editor-options or jsonSchema.enum', () => {
    expect(enumOptionsFrom({ values: [{ value: 'a', label: 'A' }, 'b'] }, undefined)).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b' },
    ]);
    expect(enumOptionsFrom(undefined, { enum: ['x', 'y', 3] })).toEqual([{ value: 'x' }, { value: 'y' }]);
  });

  it('renders a toggle group for up to four options and clears on deselect', async () => {
    const onChange = vi.fn();
    wrap(
      <EnumField
        value="left"
        onChange={onChange}
        label="Align"
        jsonSchema={{ enum: ['left', 'center', 'right'] }}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByRole('radio', { name: 'Right' }));
    expect(onChange).toHaveBeenCalledWith('right');
    await userEvent.click(screen.getByRole('radio', { name: 'Left' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders a select for more than four options', async () => {
    const onChange = vi.fn();
    const values = ['a', 'b', 'c', 'd', 'e'].map((v) => ({ value: v, label: v.toUpperCase() }));
    wrap(<EnumField value="a" onChange={onChange} label="Letter" options={{ values }} />);
    const trigger = screen.getByRole('combobox', { name: 'Letter' });
    expect(trigger).toHaveTextContent('A');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: 'E' }));
    expect(onChange).toHaveBeenCalledWith('e');
  });

  it('renders inline without a label', () => {
    wrap(
      <EnumField
        value="a"
        onChange={() => {}}
        label="Letter"
        mode="inline"
        jsonSchema={{ enum: ['a', 'b'] }}
      />,
    );
    expect(screen.queryByText('Letter')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A' })).toBeInTheDocument();
  });
});
