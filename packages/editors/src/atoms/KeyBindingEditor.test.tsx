import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { KeyBindingEditor, formatKeyBinding } from './KeyBindingEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('formatKeyBinding', () => {
  it('orders modifiers and prettifies keys', () => {
    expect(formatKeyBinding({ key: 'k', ctrl: false, shift: true, alt: false, meta: false })).toBe('Shift+K');
    expect(formatKeyBinding({ key: 'ArrowUp', ctrl: true, shift: false, alt: true, meta: true })).toBe(
      'Ctrl+Alt+Meta+↑',
    );
    expect(formatKeyBinding({ key: ' ', ctrl: false, shift: false, alt: false, meta: false })).toBe('Space');
    expect(formatKeyBinding(undefined)).toBe('');
  });
});

describe('KeyBindingEditor', () => {
  it('renders the label and captures the next key press', async () => {
    const onChange = vi.fn();
    wrap(
      <KeyBindingEditor
        value={{ key: '+', ctrl: false, shift: false, alt: false, meta: false }}
        onChange={onChange}
        label="Key"
      />,
    );
    const button = screen.getByRole('button', { name: 'Key' });
    expect(button).toHaveTextContent('+');

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Press a key combination' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.keyboard('{Shift>}k{/Shift}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ key: 'K', ctrl: false, shift: true, alt: false, meta: false });
  });

  it('cancels capture on Escape and toggles modifiers on an existing binding', async () => {
    const onChange = vi.fn();
    wrap(
      <KeyBindingEditor
        value={{ key: 'K', ctrl: false, shift: true, alt: false, meta: false }}
        onChange={onChange}
        label="Key"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Key' }));
    await userEvent.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Key' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Ctrl' }));
    expect(onChange).toHaveBeenLastCalledWith({ key: 'K', ctrl: true, shift: true, alt: false, meta: false });
    await userEvent.click(screen.getByRole('button', { name: 'Clear key binding' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders inline without a label and disables modifiers when empty', () => {
    wrap(<KeyBindingEditor value={undefined} onChange={() => {}} label="Key" mode="inline" />);
    expect(screen.queryByText('Key')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shift' })).toBeDisabled();
  });
});
