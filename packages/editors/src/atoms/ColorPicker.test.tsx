import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { ColorPicker, ThemeColorPicker } from './ColorPicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('ColorPicker', () => {
  it('picks a design token from the palette', async () => {
    const onChange = vi.fn();
    wrap(<ColorPicker value={undefined} onChange={onChange} label="Fill" />);
    await userEvent.click(screen.getByRole('button', { name: /Fill: none/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Negative' }));
    expect(onChange).toHaveBeenCalledWith('var(--sg-negative)');
  });

  it('accepts a typed custom colour and rejects garbage', async () => {
    const onChange = vi.fn();
    wrap(<ColorPicker value="#ff0000" onChange={onChange} label="Fill" />);
    await userEvent.click(screen.getByRole('button', { name: /Fill: #ff0000/ }));
    const input = await screen.findByLabelText('Colour value');
    await userEvent.clear(input);
    await userEvent.type(input, 'not a colour!{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, 'oklch(0.7 0.2 30){Enter}');
    expect(onChange).toHaveBeenLastCalledWith('oklch(0.7 0.2 30)');
  });

  it('clears the colour', async () => {
    const onChange = vi.fn();
    wrap(<ColorPicker value="#ff0000" onChange={onChange} label="Fill" />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear colour' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows errors in panel mode', () => {
    wrap(
      <ColorPicker
        value="zzz"
        onChange={() => {}}
        label="Fill"
        errors={[{ path: '', message: 'Unknown colour' }]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown colour');
  });
});

describe('ThemeColorPicker', () => {
  it('switches between a single colour and a light/dark pair', async () => {
    const onChange = vi.fn();
    wrap(<ThemeColorPicker value="#111111" onChange={onChange} label="Text" />);
    await userEvent.click(screen.getByRole('button', { name: 'Per theme', pressed: false }));
    expect(onChange).toHaveBeenCalledWith({ light: '#111111', dark: '#111111' });
  });

  it('collapses a pair back to a single colour', async () => {
    const onChange = vi.fn();
    wrap(<ThemeColorPicker value={{ light: '#111111', dark: '#eeeeee' }} onChange={onChange} label="Text" />);
    await userEvent.click(screen.getByRole('button', { name: 'Same for both themes', pressed: true }));
    expect(onChange).toHaveBeenCalledWith('#111111');
  });
});
