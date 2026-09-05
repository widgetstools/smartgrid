import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { DensityPicker } from './DensityPicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('DensityPicker', () => {
  it('shows the current density and round-trips a change', async () => {
    const onChange = vi.fn();
    wrap(<DensityPicker value="compact" onChange={onChange} label="Density" />);
    expect(screen.getByRole('radio', { name: 'Compact' })).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByRole('radio', { name: 'Comfort' }));
    expect(onChange).toHaveBeenCalledWith('comfort');
  });

  it('keeps the value when the active segment is clicked unless allowClear', async () => {
    const keep = vi.fn();
    wrap(<DensityPicker value="ultra" onChange={keep} label="Density" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ultra' }));
    expect(keep).not.toHaveBeenCalled();
    cleanup();

    const clear = vi.fn();
    wrap(<DensityPicker value="ultra" onChange={clear} label="Density" options={{ allowClear: true }} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ultra' }));
    expect(clear).toHaveBeenCalledWith(undefined);
  });

  it('renders inline without labels', () => {
    wrap(<DensityPicker value="ultra" onChange={() => {}} label="Density" mode="inline" />);
    expect(screen.queryByText('Density')).not.toBeInTheDocument();
    expect(screen.queryByText('Ultra')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Ultra' })).toBeInTheDocument();
  });
});
