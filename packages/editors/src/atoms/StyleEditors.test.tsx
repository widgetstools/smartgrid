import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { AlignmentPicker, BorderEditor, FontStyleEditor, StyleEditor } from './StyleEditors.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('AlignmentPicker', () => {
  it('sets horizontal and vertical alignment and clears on re-click', async () => {
    const onChange = vi.fn();
    wrap(<AlignmentPicker value={{ horizontal: 'left' }} onChange={onChange} label="Align" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Align right' }));
    expect(onChange).toHaveBeenLastCalledWith({ horizontal: 'right' });
    await userEvent.click(screen.getByRole('radio', { name: 'Align middle' }));
    expect(onChange).toHaveBeenLastCalledWith({ horizontal: 'left', vertical: 'middle' });
    await userEvent.click(screen.getByRole('radio', { name: 'Align left' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('hides vertical alignment inline', () => {
    wrap(<AlignmentPicker value={undefined} onChange={() => {}} label="Align" mode="inline" />);
    expect(screen.queryByRole('radio', { name: 'Align top' })).not.toBeInTheDocument();
  });
});

describe('FontStyleEditor', () => {
  it('toggles bold and italic', async () => {
    const onChange = vi.fn();
    wrap(<FontStyleEditor value={undefined} onChange={onChange} label="Font" />);
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onChange).toHaveBeenLastCalledWith({ weight: 'bold' });
  });

  it('drops the value entirely when every toggle is off', async () => {
    const onChange = vi.fn();
    wrap(<FontStyleEditor value={{ italic: true }} onChange={onChange} label="Font" />);
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('BorderEditor', () => {
  it('applies width to all sides by default', async () => {
    const onChange = vi.fn();
    wrap(<BorderEditor value={undefined} onChange={onChange} label="Border" />);
    await userEvent.type(screen.getByLabelText('Border width'), '2');
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual({
      top: { width: 2, style: 'solid' },
      right: { width: 2, style: 'solid' },
      bottom: { width: 2, style: 'solid' },
      left: { width: 2, style: 'solid' },
    });
  });

  it('edits a single side when selected', async () => {
    const onChange = vi.fn();
    wrap(<BorderEditor value={undefined} onChange={onChange} label="Border" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Bottom' }));
    await userEvent.type(screen.getByLabelText('Border width'), '3');
    expect(onChange).toHaveBeenLastCalledWith({ bottom: { width: 3, style: 'solid' } });
  });
});

describe('StyleEditor', () => {
  it('renders a preview with the style applied and clears', async () => {
    const onChange = vi.fn();
    wrap(
      <StyleEditor
        value={{ backColor: '#ff0000', font: { weight: 'bold' } }}
        onChange={onChange}
        label="Style"
      />,
    );
    const cell = screen.getByTestId('preview-cell');
    expect(cell.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(cell.style.fontWeight).toBe('700');
    await userEvent.click(screen.getByRole('button', { name: 'Clear style' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('sets padding through the number field', async () => {
    const onChange = vi.fn();
    wrap(<StyleEditor value={undefined} onChange={onChange} label="Style" />);
    await userEvent.type(screen.getByLabelText('Padding'), '4');
    expect(onChange).toHaveBeenLastCalledWith({ padding: 4 });
  });

  it('inline mode has no border editor or preview', () => {
    wrap(<StyleEditor value={undefined} onChange={() => {}} label="Style" mode="inline" />);
    expect(screen.queryByLabelText('Border width')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-cell')).not.toBeInTheDocument();
  });
});
