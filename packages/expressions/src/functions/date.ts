/**
 * Date system functions. Dates are local-time JavaScript Dates; text and
 * numbers are coerced with values.toDate. "Now" always comes from env.now()
 * so hosts (and tests) control the clock. Blank or unparseable inputs return
 * undefined.
 */
import type { ExpressionKind } from '@smartgrid/schema';
import type { FunctionDef, Value, ValueType } from '../types.js';
import { toDate, toNumber } from '../values.js';

const KINDS: ExpressionKind[] = ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean'];

type Spec = Pick<FunctionDef, 'description' | 'signatures' | 'arity' | 'impl'> &
  Partial<Pick<FunctionDef, 'examples'>>;

const date = (name: string, returnType: ValueType, spec: Spec): FunctionDef => ({
  name,
  category: 'date',
  returnType,
  kinds: KINDS,
  examples: [],
  ...spec,
});

const MS_PER_DAY = 86_400_000;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

/** Add whole months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: Date, n: number): Date {
  const total = d.getMonth() + n;
  const year = d.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(d.getDate(), daysInMonth(year, month));
  return new Date(year, month, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

/** ISO-8601 week number (1–53). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / MS_PER_DAY + 1) / 7);
}

/** Calendar days from b to a, ignoring time of day (and DST shifts). */
export function diffDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / MS_PER_DAY);
}

/** Whole calendar months from b to a (a − b), truncated toward zero. */
export function diffMonths(a: Date, b: Date): number {
  let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (m > 0 && a.getDate() < b.getDate()) m -= 1;
  else if (m < 0 && a.getDate() > b.getDate()) m += 1;
  return m;
}

const part = (get: (d: Date) => number) => (args: Value[]) => {
  const d = toDate(args[0]);
  return d === undefined ? undefined : get(d);
};

const shift = (apply: (d: Date, n: number) => Date) => (args: Value[]) => {
  const d = toDate(args[0]);
  const n = toNumber(args[1]);
  return d === undefined || n === undefined ? undefined : apply(d, n);
};

const diff = (fn: (a: Date, b: Date) => number) => (args: Value[]) => {
  const a = toDate(args[0]);
  const b = toDate(args[1]);
  return a === undefined || b === undefined ? undefined : fn(a, b);
};

export const DATE_DEFS: FunctionDef[] = [
  date('DATE', 'date', {
    description:
      "Converts text or a number to a date ('2026-09-05' is local midnight), or builds one from year, month (1–12) and day.",
    signatures: ['DATE(value)', 'DATE(year, month, day)'],
    examples: ["[TradeDate] > DATE('2026-01-01')", 'DATE(2026, 9, 5)'],
    arity: { min: 1, max: 3 },
    impl: (args) => {
      if (args.length === 1) return toDate(args[0]);
      const y = toNumber(args[0]);
      const m = toNumber(args[1]);
      const d = args.length > 2 ? toNumber(args[2]) : 1;
      if (y === undefined || m === undefined || d === undefined) return undefined;
      return new Date(y, m - 1, d);
    },
  }),
  date('NOW', 'date', {
    description: 'The current date and time.',
    signatures: ['NOW()'],
    examples: ['[Expiry] < NOW()'],
    arity: { min: 0, max: 0 },
    impl: (_args, ctx) => ctx.env.now(),
  }),
  date('CURRENT_DAY', 'date', {
    description: 'Today at midnight (no time component).',
    signatures: ['CURRENT_DAY()'],
    examples: ['ADD_DAYS(CURRENT_DAY(), 5) < [TradeDate]'],
    arity: { min: 0, max: 0 },
    impl: (_args, ctx) => startOfDay(ctx.env.now()),
  }),
  date('DAY', 'number', {
    description: 'Day of the month (1–31).',
    signatures: ['DAY(date)'],
    examples: ['DAY([TradeDate]) = 1'],
    arity: { min: 1, max: 1 },
    impl: part((d) => d.getDate()),
  }),
  date('WEEK', 'number', {
    description: 'ISO week number of the year (1–53).',
    signatures: ['WEEK(date)'],
    examples: ['WEEK([TradeDate]) = WEEK(CURRENT_DAY())'],
    arity: { min: 1, max: 1 },
    impl: part(isoWeek),
  }),
  date('MONTH', 'number', {
    description: 'Month of the year (1–12).',
    signatures: ['MONTH(date)'],
    examples: ['MONTH([TradeDate]) = 12'],
    arity: { min: 1, max: 1 },
    impl: part((d) => d.getMonth() + 1),
  }),
  date('YEAR', 'number', {
    description: 'Four-digit year.',
    signatures: ['YEAR(date)'],
    examples: ['YEAR([TradeDate]) = 2026'],
    arity: { min: 1, max: 1 },
    impl: part((d) => d.getFullYear()),
  }),
  date('ADD_DAYS', 'date', {
    description: 'Adds n days (negative subtracts).',
    signatures: ['ADD_DAYS(date, n)'],
    examples: ['ADD_DAYS(CURRENT_DAY(), 5) < [TradeDate]'],
    arity: { min: 2, max: 2 },
    impl: shift(addDays),
  }),
  date('ADD_WEEKS', 'date', {
    description: 'Adds n weeks (negative subtracts).',
    signatures: ['ADD_WEEKS(date, n)'],
    examples: ['ADD_WEEKS([TradeDate], 2)'],
    arity: { min: 2, max: 2 },
    impl: shift((d, n) => addDays(d, n * 7)),
  }),
  date('ADD_MONTHS', 'date', {
    description: 'Adds n months, clamping to the last day of the target month.',
    signatures: ['ADD_MONTHS(date, n)'],
    examples: ['ADD_MONTHS([TradeDate], 3)'],
    arity: { min: 2, max: 2 },
    impl: shift(addMonths),
  }),
  date('ADD_YEARS', 'date', {
    description: 'Adds n years (29 Feb clamps to 28 Feb in non-leap years).',
    signatures: ['ADD_YEARS(date, n)'],
    examples: ['ADD_YEARS([BirthDate], 18) <= CURRENT_DAY()'],
    arity: { min: 2, max: 2 },
    impl: shift((d, n) => addMonths(d, n * 12)),
  }),
  date('DIFF_DAYS', 'number', {
    description: 'Calendar days from b to a (a − b), ignoring the time of day.',
    signatures: ['DIFF_DAYS(a, b)'],
    examples: ['DIFF_DAYS([SettlementDate], [TradeDate])'],
    arity: { min: 2, max: 2 },
    impl: diff(diffDays),
  }),
  date('DIFF_WEEKS', 'number', {
    description: 'Whole weeks from b to a (a − b).',
    signatures: ['DIFF_WEEKS(a, b)'],
    examples: ['DIFF_WEEKS(CURRENT_DAY(), [TradeDate])'],
    arity: { min: 2, max: 2 },
    impl: diff((a, b) => Math.trunc(diffDays(a, b) / 7)),
  }),
  date('DIFF_MONTHS', 'number', {
    description: 'Whole calendar months from b to a (a − b).',
    signatures: ['DIFF_MONTHS(a, b)'],
    examples: ['DIFF_MONTHS([Maturity], CURRENT_DAY())'],
    arity: { min: 2, max: 2 },
    impl: diff(diffMonths),
  }),
  date('DIFF_YEARS', 'number', {
    description: 'Whole years from b to a (a − b), e.g. an age from a birth date.',
    signatures: ['DIFF_YEARS(a, b)'],
    examples: ['DIFF_YEARS(CURRENT_DAY(), [BirthDate])'],
    arity: { min: 2, max: 2 },
    impl: diff((a, b) => Math.trunc(diffMonths(a, b) / 12)),
  }),
];
