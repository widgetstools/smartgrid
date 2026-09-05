import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import {
  CRON_PRESETS,
  ScheduleEditor,
  describeCron,
  isoToLocalInput,
  localInputToIso,
  validateCron,
} from './ScheduleEditor.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('describeCron', () => {
  it('summarises common shapes', () => {
    expect(describeCron('30 9 * * 1-5')).toBe('Every weekday at 09:30');
    expect(describeCron('0 * * * *')).toBe('Every hour');
    expect(describeCron('15 * * * *')).toBe('Hourly at :15');
    expect(describeCron('0 17 * * *')).toBe('Daily at 17:00');
    expect(describeCron('0 8 * * 1')).toBe('Every Monday at 08:00');
    expect(describeCron('0 8 * * MON,WED')).toBe('Every Monday and Wednesday at 08:00');
    expect(describeCron('0 6 1 * *')).toBe('Monthly on the 1st at 06:00');
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
    expect(describeCron('0 */4 * * *')).toBe('Every 4 hours');
    expect(describeCron('* * * * *')).toBe('Every minute');
    expect(describeCron('0 9 * * 0,6')).toBe('Every weekend day at 09:00');
  });

  it('composes ranges, lists and names generically', () => {
    expect(describeCron('0 9 1,15 * *')).toBe('At 09:00 on the 1st and 15th of the month');
    expect(describeCron('0 9 * jan-mar *')).toBe('At 09:00 in January through March');
    expect(describeCron('0,30 9-17 * * 1-5')).toBe('At minute 0 and 30 past hour 9 through 17 on weekdays');
    expect(describeCron('*/10 9 * * *')).toBe('At minute every 10 minutes past hour 9');
  });

  it('validates the five fields', () => {
    expect(describeCron('bad')).toBe('Invalid cron expression');
    expect(validateCron('0 9 * *')).toMatch(/Expected 5 fields/);
    expect(validateCron('60 9 * * *')).toMatch(/Invalid minute/);
    expect(validateCron('0 9 * * 7')).toBeUndefined();
    expect(validateCron('0 9 * * 8')).toMatch(/day-of-week/);
    expect(validateCron('0 9 * * *')).toBeUndefined();
    for (const p of CRON_PRESETS) expect(validateCron(p.cron)).toBeUndefined();
  });
});

describe('date helpers', () => {
  it('round-trips local input through ISO with offset', () => {
    const iso = localInputToIso('2026-09-10T09:30');
    expect(iso).toMatch(/^2026-09-10T09:30:00[+-]\d{2}:\d{2}$/);
    expect(isoToLocalInput(iso)).toBe('2026-09-10T09:30');
    expect(localInputToIso('nope')).toBeUndefined();
  });
});

describe('ScheduleEditor', () => {
  it('renders a cron value with its summary and applies a preset', async () => {
    const onChange = vi.fn();
    wrap(
      <ScheduleEditor value={{ kind: 'cron', cron: '0 17 * * *' }} onChange={onChange} label="Schedule" />,
    );
    expect(screen.getByRole('radio', { name: 'Recurring' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('status')).toHaveTextContent('Daily at 17:00');

    await userEvent.click(screen.getByRole('combobox', { name: 'Cron preset' }));
    await userEvent.click(screen.getByRole('option', { name: 'Every weekday at 09:30' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'cron', cron: '30 9 * * 1-5' });
  });

  it('flags an invalid cron and keeps the timezone', async () => {
    const onChange = vi.fn();
    wrap(
      <ScheduleEditor
        value={{ kind: 'cron', cron: '0 9 * *', timezone: 'Europe/London' }}
        onChange={onChange}
        label="Schedule"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Expected 5 fields/);
    await userEvent.type(screen.getByPlaceholderText('min hour dom month dow'), ' 1');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'cron', cron: '0 9 * * 1', timezone: 'Europe/London' });
  });

  it('switches kind and edits the one-off time', async () => {
    const onChange = vi.fn();
    wrap(
      <ScheduleEditor value={{ kind: 'cron', cron: '0 17 * * *' }} onChange={onChange} label="Schedule" />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Run once' }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'once',
      runAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00[+-]\d{2}:\d{2}$/),
    });
    cleanup();

    const edit = vi.fn();
    wrap(
      <ScheduleEditor
        value={{ kind: 'once', runAt: '2026-09-10T09:30:00+00:00' }}
        onChange={edit}
        label="Schedule"
      />,
    );
    fireEvent.change(screen.getByLabelText('Run at'), { target: { value: '2026-12-01T08:15' } });
    expect(edit).toHaveBeenLastCalledWith({
      kind: 'once',
      runAt: expect.stringMatching(/^2026-12-01T08:15:00[+-]\d{2}:\d{2}$/),
    });
  });

  it('renders inline without a label', () => {
    wrap(
      <ScheduleEditor
        value={{ kind: 'cron', cron: '0 17 * * *' }}
        onChange={() => {}}
        label="Schedule"
        mode="inline"
      />,
    );
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Recurring' })).toBeInTheDocument();
  });
});
