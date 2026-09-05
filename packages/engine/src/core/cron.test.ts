import { describe, expect, it } from 'vitest';
import { matches, nextRun, parseCron } from './cron.js';

// 2026-09-05 is a Saturday.
const sat = (h: number, m: number) => new Date(2026, 8, 5, h, m);

describe('cron parsing', () => {
  it('parses stars, values, lists, ranges, steps and names', () => {
    const spec = parseCron('*/15 9-17 1,15 jan-mar mon-fri')!;
    expect([...spec.minute]).toEqual([0, 15, 30, 45]);
    expect([...spec.hour]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...spec.dayOfMonth]).toEqual([1, 15]);
    expect([...spec.month]).toEqual([1, 2, 3]);
    expect([...spec.dayOfWeek]).toEqual([1, 2, 3, 4, 5]);
    expect(spec.anyDayOfMonth).toBe(false);
    expect(spec.anyDayOfWeek).toBe(false);
  });

  it('treats 7 as Sunday and value/step as a range to the max', () => {
    const spec = parseCron('0 0 * * 7')!;
    expect([...spec.dayOfWeek]).toEqual([0]);
    expect([...parseCron('5/20 * * * *')!.minute]).toEqual([5, 25, 45]);
  });

  it('rejects malformed expressions', () => {
    for (const bad of [
      '* * * *',
      '60 * * * *',
      '* 24 * * *',
      'a * * * *',
      '1-0 * * * *',
      '*/0 * * * *',
      ',1 * * * *',
    ])
      expect(parseCron(bad), bad).toBeUndefined();
    expect(nextRun('nope', new Date())).toBeUndefined();
    expect(matches('nope', new Date())).toBe(false);
  });
});

describe('cron matching', () => {
  it('matches the minute, ignoring seconds', () => {
    const d = new Date(2026, 8, 7, 9, 30, 45); // Monday
    expect(matches('30 9 * * 1-5', d)).toBe(true);
    expect(matches('31 9 * * 1-5', d)).toBe(false);
    expect(matches('30 9 * * 6,0', d)).toBe(false);
  });

  it('ORs day-of-month and day-of-week when both are restricted', () => {
    // Saturday the 5th: dom matches, dow does not.
    expect(matches('0 0 5 * 1', sat(0, 0))).toBe(true);
    expect(matches('0 0 6 * 1', sat(0, 0))).toBe(false);
    expect(matches('0 0 6 * 6', sat(0, 0))).toBe(true);
    // Only one restricted: it must match.
    expect(matches('0 0 * * 1', sat(0, 0))).toBe(false);
    expect(matches('0 0 5 * *', sat(0, 0))).toBe(true);
  });
});

describe('nextRun', () => {
  it('finds the next minute strictly after the given time', () => {
    expect(nextRun('*/5 * * * *', sat(9, 0))).toEqual(sat(9, 5));
    expect(nextRun('*/5 * * * *', sat(9, 4))).toEqual(sat(9, 5));
    expect(nextRun('*/5 * * * *', new Date(2026, 8, 5, 9, 5, 30))).toEqual(sat(9, 10));
  });

  it('skips to the next matching day, month and year', () => {
    expect(nextRun('30 9 * * 1-5', sat(9, 29))).toEqual(new Date(2026, 8, 7, 9, 30));
    expect(nextRun('0 0 1 1 *', sat(9, 29))).toEqual(new Date(2027, 0, 1, 0, 0));
    expect(nextRun('15 14 29 2 *', sat(0, 0))).toEqual(new Date(2028, 1, 29, 14, 15));
  });

  it('returns undefined when no date can ever match', () => {
    expect(nextRun('0 0 31 2 *', sat(0, 0))).toBeUndefined();
  });
});
