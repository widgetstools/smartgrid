import { describe, expect, it } from 'vitest';
import { PREDICATE_IDS } from '@smartgrid/schema';
import { PredicateRegistry, SYSTEM_PREDICATES } from './predicates.js';

const reg = new PredicateRegistry();
const now = () => new Date(2026, 8, 3, 12); // Thursday 3 Sep 2026
const ev = (predicateId: string, value: unknown, inputs: unknown[] = [], ctx = {}) =>
  reg.evaluate({ predicateId, inputs }, value, { now, ...ctx });

describe('system predicates', () => {
  it('implements every id in the schema catalogue', () => {
    for (const id of PREDICATE_IDS) expect(typeof SYSTEM_PREDICATES[id]).toBe('function');
  });

  it('blanks and lists', () => {
    expect(ev('Blanks', null)).toBe(true);
    expect(ev('Blanks', '')).toBe(true);
    expect(ev('Blanks', 0)).toBe(false);
    expect(ev('NonBlanks', 'x')).toBe(true);
    expect(ev('In', 'usd', ['USD', 'EUR'])).toBe(true);
    expect(ev('In', 'usd', ['USD'], { caseSensitive: true })).toBe(false);
    expect(ev('In', ['a', 'z'], ['z'])).toBe(true);
    expect(ev('NotIn', 3, [1, 2])).toBe(true);
  });

  it('numbers', () => {
    expect(ev('GreaterThan', 5, [3])).toBe(true);
    expect(ev('GreaterThan', '5', ['3'])).toBe(true);
    expect(ev('GreaterThan', 'abc', [3])).toBe(false);
    expect(ev('Between', 5, [10, 1])).toBe(true);
    expect(ev('NotBetween', 5, [1, 10])).toBe(false);
    expect(ev('Negative', -0.01)).toBe(true);
    expect(ev('Zero', 0)).toBe(true);
    expect(ev('PercentChange', 110, [5], { previousValue: 100 })).toBe(true);
    expect(ev('PercentChange', 102, [5], { previousValue: 100 })).toBe(false);
    expect(ev('AnyChange', 1, [], { previousValue: 2 })).toBe(true);
    expect(ev('AnyChange', 1, [], { previousValue: 1 })).toBe(false);
  });

  it('text', () => {
    expect(ev('Contains', 'Rates Desk', ['desk'])).toBe(true);
    expect(ev('Contains', 'Rates Desk', ['desk'], { caseSensitive: true })).toBe(false);
    expect(ev('StartsWith', 'USD.CASH', ['usd'])).toBe(true);
    expect(ev('Regex', 'AB123', ['^[A-Z]{2}\\d+$'])).toBe(true);
    expect(ev('Regex', 'x', ['['])).toBe(false);
  });

  it('dates', () => {
    expect(ev('Today', new Date(2026, 8, 3, 9))).toBe(true);
    expect(ev('Yesterday', '2026-09-02T10:00:00')).toBe(true);
    expect(ev('ThisWeek', new Date(2026, 7, 31))).toBe(true); // Monday of that week
    expect(ev('ThisWeek', new Date(2026, 8, 7))).toBe(false); // next Monday
    expect(ev('ThisQuarter', new Date(2026, 6, 1))).toBe(true);
    expect(ev('Before', new Date(2026, 0, 1), ['2026-06-01'])).toBe(true);
    expect(ev('Range', new Date(2026, 5, 15), ['2026-06-01', '2026-06-30'])).toBe(true);
    expect(ev('NextWorkDay', new Date(2026, 8, 4))).toBe(true); // Friday
    expect(ev('LastWorkDay', new Date(2026, 8, 2))).toBe(true);
    expect(ev('WorkDay', new Date(2026, 8, 5))).toBe(false); // Saturday
    const holidays = new Set(['2026-09-04']);
    expect(ev('Holiday', new Date(2026, 8, 4), [], { holidays })).toBe(true);
    expect(ev('NextWorkDay', new Date(2026, 8, 7), [], { holidays })).toBe(true); // skips Fri holiday + weekend
  });

  it('booleans', () => {
    expect(ev('True', true)).toBe(true);
    expect(ev('True', 'true')).toBe(true);
    expect(ev('False', 0)).toBe(true);
  });
});

describe('PredicateRegistry', () => {
  it('validates arity and unknown ids', () => {
    expect(reg.validate({ predicateId: 'Between', inputs: [1] })).toMatch(/expects 2/);
    expect(reg.validate({ predicateId: 'In', inputs: [] })).toMatch(/at least one/);
    expect(reg.validate({ predicateId: 'Nope', inputs: [] })).toMatch(/Unknown/);
    expect(reg.validate({ predicateId: 'Positive', inputs: [] })).toBeUndefined();
  });

  it('supports custom predicates', () => {
    const r = new PredicateRegistry().register({
      id: 'LongText',
      label: 'Long text',
      arity: 1,
      handler: (v, [n]) => String(v ?? '').length > Number(n),
    });
    expect(r.evaluate({ predicateId: 'LongText', inputs: [3] }, 'abcd')).toBe(true);
    expect(r.validate({ predicateId: 'LongText', inputs: [3] })).toBeUndefined();
  });
});
