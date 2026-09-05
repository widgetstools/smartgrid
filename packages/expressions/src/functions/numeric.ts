/**
 * Numeric system functions. Every function coerces with values.toNumber (so
 * '5M' and '1,250' work) and returns undefined — never throws — when an
 * input is blank or not numeric.
 *
 * MIN / MAX / AVG are dual-use: with a single column argument or a modifier
 * (GROUP_BY, WEIGHT …) the aggregated tier lowers them before the closure
 * compiler runs, so the implementations here only see the per-row variadic
 * form. Their metadata covers both uses because the registry holds one
 * definition per name.
 */
import type { ExpressionKind } from '@smartgrid/schema';
import type { FunctionDef, Value } from '../types.js';
import { numbers, toNumber } from '../values.js';

const KINDS: ExpressionKind[] = ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean'];

type Spec = Pick<FunctionDef, 'description' | 'signatures' | 'arity' | 'impl'> &
  Partial<Pick<FunctionDef, 'examples' | 'kinds'>>;

const num = (name: string, spec: Spec): FunctionDef => ({
  name,
  category: 'numeric',
  returnType: 'number',
  kinds: KINDS,
  examples: [],
  ...spec,
});

const binary = (op: (a: number, b: number) => number | undefined) => (args: Value[]) => {
  const n = numbers(args[0], args[1]);
  return n ? op(n[0], n[1]) : undefined;
};

const unary = (op: (a: number) => number) => (args: Value[]) => {
  const n = toNumber(args[0]);
  return n === undefined ? undefined : op(n);
};

/** Numeric values of the arguments, blanks dropped. */
function numericArgs(args: Value[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    const n = toNumber(a);
    if (n !== undefined) out.push(n);
  }
  return out;
}

/** Round half away from zero at `digits` decimal places (negative = tens, hundreds …). */
export function roundHalfAwayFromZero(n: number, digits: number): number {
  const d = Math.trunc(digits);
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  // Shift via exponent notation so 1.005 → 100.5 exactly rather than 100.49999.
  let shifted = Number(`${abs}e${d}`);
  if (!Number.isFinite(shifted)) shifted = abs * Math.pow(10, d);
  const rounded = Math.round(shifted);
  let result = Number(`${rounded}e${-d}`);
  if (!Number.isFinite(result)) result = rounded / Math.pow(10, d);
  return sign * result;
}

export const NUMERIC_DEFS: FunctionDef[] = [
  num('ADD', {
    description: 'Adds two numbers.',
    signatures: ['ADD(a, b)'],
    examples: ['ADD([Bid], [Spread])'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => a + b),
  }),
  num('SUB', {
    description: 'Subtracts b from a.',
    signatures: ['SUB(a, b)'],
    examples: ['SUB([Ask], [Bid])'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => a - b),
  }),
  num('MUL', {
    description: 'Multiplies two numbers.',
    signatures: ['MUL(a, b)'],
    examples: ['MUL([Price], [Quantity])'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => a * b),
  }),
  num('DIV', {
    description: 'Divides a by b; blank when b is zero.',
    signatures: ['DIV(a, b)'],
    examples: ['DIV([Notional], [Quantity])'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => (b === 0 ? undefined : a / b)),
  }),
  num('MOD', {
    description: 'Remainder of a divided by b; blank when b is zero.',
    signatures: ['MOD(a, b)'],
    examples: ['MOD([Quantity], 100) = 0'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => (b === 0 ? undefined : a % b)),
  }),
  num('POW', {
    description: 'Raises a to the power b.',
    signatures: ['POW(a, b)'],
    examples: ['POW([Rate], 2)'],
    arity: { min: 2, max: 2 },
    impl: binary((a, b) => Math.pow(a, b)),
  }),
  num('MIN', {
    description: 'Smallest of several values per row, or of a column across rows in aggregated expressions.',
    signatures: ['MIN(a, b, ...)', 'MIN([col])', 'MIN([col], GROUP_BY([a]))'],
    examples: ['MIN([BloombergBid], [MarkitBid]) > 50', 'MIN([Price], GROUP_BY([Currency]))'],
    arity: { min: 1 },
    impl: (args) => {
      const ns = numericArgs(args);
      return ns.length ? Math.min(...ns) : undefined;
    },
  }),
  num('MAX', {
    description: 'Largest of several values per row, or of a column across rows in aggregated expressions.',
    signatures: ['MAX(a, b, ...)', 'MAX([col])', 'MAX([col], GROUP_BY([a]))'],
    examples: ['MAX([Bid], [Ask])', 'MAX([Price], GROUP_BY([Currency]))'],
    arity: { min: 1 },
    impl: (args) => {
      const ns = numericArgs(args);
      return ns.length ? Math.max(...ns) : undefined;
    },
  }),
  num('AVG', {
    description:
      'Mean of several values per row, or of a column across rows in aggregated expressions (WEIGHT([w]) weights it).',
    signatures: ['AVG(a, b, ...)', 'AVG([col])', 'AVG([col], WEIGHT([w]))', 'AVG([col], GROUP_BY([a]))'],
    examples: ['AVG([Bid], [Ask])', 'AVG([Price], WEIGHT([Notional]))'],
    arity: { min: 1 },
    impl: (args) => {
      const ns = numericArgs(args);
      return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : undefined;
    },
  }),
  num('ABS', {
    description: 'Absolute value.',
    signatures: ['ABS(number)'],
    examples: ['ABS([PnL]) > 1000'],
    arity: { min: 1, max: 1 },
    impl: unary(Math.abs),
  }),
  num('CEILING', {
    description: 'Rounds up to the nearest integer.',
    signatures: ['CEILING(number)'],
    examples: ['CEILING([Price])'],
    arity: { min: 1, max: 1 },
    impl: unary(Math.ceil),
  }),
  num('FLOOR', {
    description: 'Rounds down to the nearest integer.',
    signatures: ['FLOOR(number)'],
    examples: ['FLOOR([Price])'],
    arity: { min: 1, max: 1 },
    impl: unary(Math.floor),
  }),
  num('ROUND', {
    description:
      'Rounds half away from zero to the given number of decimal places (default 0; negative rounds tens, hundreds …).',
    signatures: ['ROUND(number)', 'ROUND(number, digits)'],
    examples: ['ROUND([Price], 2)', 'ROUND([Notional], -3)'],
    arity: { min: 1, max: 2 },
    impl: (args) => {
      const n = toNumber(args[0]);
      if (n === undefined) return undefined;
      const digits = args.length > 1 ? toNumber(args[1]) : 0;
      return roundHalfAwayFromZero(n, digits ?? 0);
    },
  }),
];
