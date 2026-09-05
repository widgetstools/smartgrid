import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { DisplayFormatEditor } from './DisplayFormatEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('DisplayFormatEditor', () => {
  it('starts a number format from the kind toggle', async () => {
    const onChange = vi.fn();
    wrap(<DisplayFormatEditor value={undefined} onChange={onChange} label="Format" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Number' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'number', preset: 'Decimal' });
  });

  it('edits number options and previews with the engine formatter', async () => {
    const onChange = vi.fn();
    wrap(
      <DisplayFormatEditor
        value={{ kind: 'number', preset: 'Decimal', fractionDigits: 1 }}
        onChange={onChange}
        label="Format"
      />,
    );
    expect(screen.getByTestId('preview-cell')).toHaveTextContent('-1,234,567.9');
    await userEvent.type(screen.getByLabelText('Suffix'), ' bp');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'number',
      preset: 'Decimal',
      fractionDigits: 1,
      suffix: ' bp',
    });
  });

  it('switches to a date pattern and keeps the preview in sync', async () => {
    const onChange = vi.fn();
    const { rerender } = wrap(<DisplayFormatEditor value={undefined} onChange={onChange} label="Format" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Date' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'date', pattern: 'dd-MMM-yyyy' });
    rerender(
      <EditorContextProvider value={FIXTURE_CONTEXT}>
        <DisplayFormatEditor
          value={{ kind: 'date', pattern: 'yyyy-MM-dd' }}
          onChange={onChange}
          label="Format"
        />
      </EditorContextProvider>,
    );
    expect(screen.getByTestId('preview-cell')).toHaveTextContent('2026-09-05');
  });

  it('honours options.kinds and clears', async () => {
    const onChange = vi.fn();
    wrap(
      <DisplayFormatEditor
        value={{ kind: 'excel', format: '0.00' }}
        onChange={onChange}
        label="Format"
        options={{ kinds: ['number', 'excel'] }}
      />,
    );
    expect(screen.queryByRole('radio', { name: 'Tick' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
