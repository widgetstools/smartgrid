import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { ExpressionEditor } from './ExpressionEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('ExpressionEditor', () => {
  it('emits typed text and undefined when emptied', async () => {
    const onChange = vi.fn();
    wrap(<ExpressionEditor value={undefined} onChange={onChange} label="When" />);
    const ta = screen.getByRole('textbox', { name: 'When' });
    await userEvent.type(ta, '[[pnl] < 0');
    expect(onChange).toHaveBeenLastCalledWith('[pnl] < 0');
    await userEvent.clear(ta);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('inserts a column reference from the palette', async () => {
    const onChange = vi.fn();
    wrap(<ExpressionEditor value="" onChange={onChange} label="When" />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert column' }));
    await userEvent.click(await screen.findByText('Notional'));
    expect(onChange).toHaveBeenLastCalledWith('[notional]');
  });

  it('inserts a function from context', async () => {
    const onChange = vi.fn();
    wrap(<ExpressionEditor value="" onChange={onChange} label="When" />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert function' }));
    await userEvent.click(await screen.findByText('CONTAINS([col], text)'));
    expect(onChange).toHaveBeenLastCalledWith('CONTAINS(');
  });

  it('shows a positioned error caret', () => {
    wrap(
      <ExpressionEditor
        value="[pnl] <"
        onChange={() => {}}
        label="When"
        errors={[{ path: '', message: 'Unexpected end', start: 7 }]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected end');
    expect(screen.getByText(/\^ col 8/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'When' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('hides palettes when read-only', () => {
    wrap(<ExpressionEditor value="1" onChange={() => {}} label="When" readOnly />);
    expect(screen.queryByRole('button', { name: 'Insert column' })).not.toBeInTheDocument();
  });

  it('keeps inline mode on a single line: Enter inserts no newline', async () => {
    const onChange = vi.fn();
    wrap(<ExpressionEditor value="" onChange={onChange} label="When" mode="inline" />);
    const box = screen.getByRole('textbox', { name: 'When' });
    await userEvent.type(box, '[[a]{Enter} > 1');
    expect(onChange).toHaveBeenLastCalledWith('[a] > 1');
    expect(box.querySelectorAll('.cm-line')).toHaveLength(1);
    expect(box.textContent).not.toContain('\n');
  });

  it('allows newlines in panel mode and mirrors value changes from props', async () => {
    const onChange = vi.fn();
    const { rerender } = wrap(<ExpressionEditor value="" onChange={onChange} label="When" />);
    const box = screen.getByRole('textbox', { name: 'When' });
    await userEvent.type(box, '1{Enter}2');
    expect(onChange).toHaveBeenLastCalledWith('1\n2');
    onChange.mockClear();
    rerender(
      <EditorContextProvider value={FIXTURE_CONTEXT}>
        <ExpressionEditor value="[pnl] > 0" onChange={onChange} label="When" />
      </EditorContextProvider>,
    );
    expect(box).toHaveTextContent('[pnl] > 0');
    expect(onChange).not.toHaveBeenCalled();
  });
});
