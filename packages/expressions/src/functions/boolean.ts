/**
 * Boolean system functions: comparisons, logic, membership, text tests and
 * calendar tests. Blank inputs never throw — a comparison with a blank side
 * is false, mirroring the operators in compile.ts.
 */
import type { ExpressionKind } from '@smartgrid/schema';
import { EvaluationError, type FunctionContext, type FunctionDef, type Value } from '../types.js';
import { compare, equals, isBlank, isNil, normText, toBoolean, toDate, toNumber, toText } from '../values.js';

const KINDS: ExpressionKind[] = ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean'];

type Spec = Pick<FunctionDef, 'description' | 'signatures' | 'arity'> &
  Partial<Pick<FunctionDef, 'examples' | 'impl' | 'lazy'>>;

const bool = (name: string, spec: Spec): FunctionDef => ({
  name,
  category: 'boolean',
  returnType: 'boolean',
  kinds: KINDS,
  examples: [],
  ...spec,
});

const cmp =
  (test: (d: number) => boolean) =>
  (args: Value[], ctx: FunctionContext): boolean => {
    const d = compare(args[0], args[1], ctx.env.caseSensitive);
    return d === undefined ? false : test(d);
  };

/** Text of a value for CONTAINS-style tests; arrays are handled by the caller. */
function textPair(a: Value, b: Value, cs: boolean): [string, string] | undefined {
  if (isNil(a) || isNil(b)) return undefined;
  return [normText(toText(a), cs), normText(toText(b), cs)];
}

function textTest(test: (text: string, search: string) => boolean) {
  return (args: Value[], ctx: FunctionContext): boolean => {
    const [subject, search] = args;
    const cs = ctx.env.caseSensitive;
    if (Array.isArray(subject)) {
      return subject.some((el) => {
        const p = textPair(el, search, cs);
        return p !== undefined && test(p[0], p[1]);
      });
    }
    const p = textPair(subject, search, cs);
    return p !== undefined && test(p[0], p[1]);
  };
}

const regexCache = new Map<string, RegExp>();

function regex(pattern: string, flags: string): RegExp {
  const key = `${flags}/${pattern}`;
  let re = regexCache.get(key);
  if (!re) {
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      throw new EvaluationError(
        `Invalid regular expression ${JSON.stringify(pattern)}: ${(e as Error).message}`,
      );
    }
    regexCache.set(key, re);
  }
  re.lastIndex = 0;
  return re;
}

function dateArg(args: Value[], ctx: FunctionContext): Date | undefined {
  return args.length === 0 ? ctx.env.now() : toDate(args[0]);
}

const isHoliday = (d: Date, ctx: FunctionContext): boolean => ctx.env.isHoliday?.(d) ?? false;

export const BOOLEAN_DEFS: FunctionDef[] = [
  bool('EQ', {
    description: 'True when both values are equal (text compares per the case-sensitivity setting).',
    signatures: ['EQ(a, b)'],
    examples: ["EQ([Currency], 'USD')"],
    arity: { min: 2, max: 2 },
    impl: (args, ctx) => equals(args[0], args[1], ctx.env.caseSensitive),
  }),
  bool('NEQ', {
    description: 'True when the values differ.',
    signatures: ['NEQ(a, b)'],
    examples: ["NEQ([Status], 'Closed')"],
    arity: { min: 2, max: 2 },
    impl: (args, ctx) => !equals(args[0], args[1], ctx.env.caseSensitive),
  }),
  bool('GT', {
    description: 'True when a is greater than b.',
    signatures: ['GT(a, b)'],
    examples: ['GT([Price], 100)'],
    arity: { min: 2, max: 2 },
    impl: cmp((d) => d > 0),
  }),
  bool('LT', {
    description: 'True when a is less than b.',
    signatures: ['LT(a, b)'],
    examples: ['LT([Price], 100)'],
    arity: { min: 2, max: 2 },
    impl: cmp((d) => d < 0),
  }),
  bool('GTE', {
    description: 'True when a is greater than or equal to b.',
    signatures: ['GTE(a, b)'],
    examples: ['GTE([Quantity], 1000)'],
    arity: { min: 2, max: 2 },
    impl: cmp((d) => d >= 0),
  }),
  bool('LTE', {
    description: 'True when a is less than or equal to b.',
    signatures: ['LTE(a, b)'],
    examples: ['LTE([Quantity], 1000)'],
    arity: { min: 2, max: 2 },
    impl: cmp((d) => d <= 0),
  }),
  bool('AND', {
    description: 'True when every condition is true; stops evaluating at the first false one.',
    signatures: ['AND(cond1, cond2, ...)'],
    examples: ["[Price] > 100 AND [Currency] = 'USD'"],
    arity: { min: 2 },
    lazy: (args) => args.every((a) => toBoolean(a())),
  }),
  bool('OR', {
    description: 'True when any condition is true; stops evaluating at the first true one.',
    signatures: ['OR(cond1, cond2, ...)'],
    examples: ["[Currency] = 'USD' OR [Currency] = 'GBP'"],
    arity: { min: 2 },
    lazy: (args) => args.some((a) => toBoolean(a())),
  }),
  bool('NOT', {
    description: 'Negates a condition.',
    signatures: ['NOT(cond)'],
    examples: ['NOT(IS_BLANK([Comments]))'],
    arity: { min: 1, max: 1 },
    impl: (args) => !toBoolean(args[0]),
  }),
  bool('BETWEEN', {
    description: 'True when the value lies between low and high, inclusive.',
    signatures: ['BETWEEN(value, low, high)'],
    examples: ['BETWEEN([Price], 90, 110)'],
    arity: { min: 3, max: 3 },
    impl: (args, ctx) => {
      const cs = ctx.env.caseSensitive;
      const lo = compare(args[0], args[1], cs);
      const hi = compare(args[0], args[2], cs);
      return lo !== undefined && hi !== undefined && lo >= 0 && hi <= 0;
    },
  }),
  bool('IN', {
    description: 'True when the value equals any of the options (or any element of an array option).',
    signatures: ['IN(value, option1, option2, ...)', 'IN(value, array)'],
    examples: ["IN([Currency], 'GBP', 'EUR')"],
    arity: { min: 2 },
    impl: (args, ctx) => {
      const [value, ...rest] = args;
      const second = rest[0];
      const options = rest.length === 1 && Array.isArray(second) ? second : rest;
      return options.some((o) => equals(value, o, ctx.env.caseSensitive));
    },
  }),
  bool('CONTAINS', {
    description: 'True when the text contains the search text (or any array element does).',
    signatures: ['CONTAINS(text, search)'],
    examples: ["CONTAINS([Name], 'bank')"],
    arity: { min: 2, max: 2 },
    impl: textTest((t, s) => t.includes(s)),
  }),
  bool('STARTS_WITH', {
    description: 'True when the text starts with the search text.',
    signatures: ['STARTS_WITH(text, search)'],
    examples: ["STARTS_WITH([Isin], 'US')"],
    arity: { min: 2, max: 2 },
    impl: textTest((t, s) => t.startsWith(s)),
  }),
  bool('ENDS_WITH', {
    description: 'True when the text ends with the search text.',
    signatures: ['ENDS_WITH(text, search)'],
    examples: ["ENDS_WITH([Email], '.com')"],
    arity: { min: 2, max: 2 },
    impl: textTest((t, s) => t.endsWith(s)),
  }),
  bool('ANY_CONTAINS', {
    description: 'True when any element of an array (or the text itself) contains the search text.',
    signatures: ['ANY_CONTAINS(arrayOrText, search)'],
    examples: ["ANY_CONTAINS([Topics], 'javascript')"],
    arity: { min: 2, max: 2 },
    impl: textTest((t, s) => t.includes(s)),
  }),
  bool('IS_BLANK', {
    description: 'True when the value is null, undefined, empty text or an empty array.',
    signatures: ['IS_BLANK(value)'],
    examples: ['IS_BLANK([Comments])'],
    arity: { min: 1, max: 1 },
    impl: (args) => isBlank(args[0]),
  }),
  bool('IS_NOT_BLANK', {
    description: 'True when the value has content.',
    signatures: ['IS_NOT_BLANK(value)'],
    examples: ['IS_NOT_BLANK([Counterparty])'],
    arity: { min: 1, max: 1 },
    impl: (args) => !isBlank(args[0]),
  }),
  bool('IS_NUMERIC', {
    description: "True when the value is a number or numeric text such as '1,250' or '5M'.",
    signatures: ['IS_NUMERIC(value)'],
    examples: ['IS_NUMERIC([Reference])'],
    arity: { min: 1, max: 1 },
    impl: (args) => {
      const v = args[0];
      if (typeof v === 'boolean' || v instanceof Date) return false;
      return toNumber(v) !== undefined;
    },
  }),
  bool('REGEX', {
    description:
      'True when the text matches the regular expression (case-insensitive unless flags are given).',
    signatures: ['REGEX(text, pattern)', 'REGEX(text, pattern, flags)'],
    examples: ["REGEX([Name], '^A')", "REGEX([Isin], '^[A-Z]{2}', 'i')"],
    arity: { min: 2, max: 3 },
    impl: (args, ctx) => {
      const [text, pattern, flags] = args;
      if (isNil(text) || isNil(pattern)) return false;
      const f = isNil(flags) ? (ctx.env.caseSensitive ? '' : 'i') : toText(flags);
      return regex(toText(pattern), f).test(toText(text));
    },
  }),
  bool('IS_HOLIDAY', {
    description: 'True when the date (default today) is a holiday in the configured calendar.',
    signatures: ['IS_HOLIDAY()', 'IS_HOLIDAY(date)'],
    examples: ['IS_HOLIDAY([SettlementDate])'],
    arity: { min: 0, max: 1 },
    impl: (args, ctx) => {
      const d = dateArg(args, ctx);
      return d === undefined ? false : isHoliday(d, ctx);
    },
  }),
  bool('IS_WORKDAY', {
    description: 'True when the date (default today) is a working day and not a holiday.',
    signatures: ['IS_WORKDAY()', 'IS_WORKDAY(date)'],
    examples: ['IS_WORKDAY([SettlementDate])'],
    arity: { min: 0, max: 1 },
    impl: (args, ctx) => {
      const d = dateArg(args, ctx);
      if (d === undefined) return false;
      const workDays = ctx.env.workDays ?? [1, 2, 3, 4, 5];
      return workDays.includes(d.getDay()) && !isHoliday(d, ctx);
    },
  }),
];
