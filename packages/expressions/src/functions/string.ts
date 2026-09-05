/**
 * String system functions. Values are coerced with values.toText; a null or
 * undefined subject yields undefined (CONCAT treats blanks as '').
 */
import type { ExpressionKind } from '@smartgrid/schema';
import type { FunctionDef, Value, ValueType } from '../types.js';
import { isNil, toNumber, toText } from '../values.js';

const KINDS: ExpressionKind[] = ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean'];

type Spec = Pick<FunctionDef, 'description' | 'signatures' | 'arity' | 'impl'> &
  Partial<Pick<FunctionDef, 'examples'>>;

const str = (name: string, spec: Spec, returnType: ValueType = 'text'): FunctionDef => ({
  name,
  category: 'string',
  returnType,
  kinds: KINDS,
  examples: [],
  ...spec,
});

/** Text of the first argument, or undefined when it is null/undefined. */
const subject = (args: Value[]): string | undefined => (isNil(args[0]) ? undefined : toText(args[0]));

const withText = (fn: (text: string, args: Value[]) => Value) => (args: Value[]) => {
  const t = subject(args);
  return t === undefined ? undefined : fn(t, args);
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pad(args: Value[], atStart: boolean): Value {
  const t = subject(args);
  const length = toNumber(args[1]);
  if (t === undefined || length === undefined) return undefined;
  const fill = isNil(args[2]) ? ' ' : toText(args[2]);
  return atStart ? t.padStart(length, fill) : t.padEnd(length, fill);
}

export const STRING_DEFS: FunctionDef[] = [
  str('SUB_STRING', {
    description: 'Part of the text from a 0-based start index up to (not including) the end index.',
    signatures: ['SUB_STRING(text, start)', 'SUB_STRING(text, start, end)'],
    examples: ['SUB_STRING([Isin], 0, 2)'],
    arity: { min: 2, max: 3 },
    impl: withText((t, args) => {
      const start = toNumber(args[1]);
      if (start === undefined) return undefined;
      const end = args.length > 2 ? toNumber(args[2]) : undefined;
      return end === undefined ? t.slice(start) : t.slice(start, end);
    }),
  }),
  str('REPLACE', {
    description: 'Replaces every occurrence of the search text (case per the case-sensitivity setting).',
    signatures: ['REPLACE(text, search, replacement)'],
    examples: ["REPLACE([Name], 'Ltd', 'Limited')"],
    arity: { min: 3, max: 3 },
    impl: (args, ctx) => {
      const t = subject(args);
      if (t === undefined || isNil(args[1])) return undefined;
      const search = toText(args[1]);
      if (search === '') return t;
      const replacement = toText(args[2]);
      const re = new RegExp(escapeRegExp(search), ctx.env.caseSensitive ? 'g' : 'gi');
      return t.replace(re, () => replacement);
    },
  }),
  str(
    'LEN',
    {
      description: 'Number of characters in the text.',
      signatures: ['LEN(text)'],
      examples: ['LEN([Comments]) > 100'],
      arity: { min: 1, max: 1 },
      impl: withText((t) => t.length),
    },
    'number',
  ),
  str('UPPER', {
    description: 'Upper-cases the text.',
    signatures: ['UPPER(text)'],
    examples: ['UPPER([Currency])'],
    arity: { min: 1, max: 1 },
    impl: withText((t) => t.toUpperCase()),
  }),
  str('LOWER', {
    description: 'Lower-cases the text.',
    signatures: ['LOWER(text)'],
    examples: ['LOWER([Email])'],
    arity: { min: 1, max: 1 },
    impl: withText((t) => t.toLowerCase()),
  }),
  str('CONCAT', {
    description: 'Joins values into one text; blanks contribute nothing.',
    signatures: ['CONCAT(value1, value2, ...)'],
    examples: ["CONCAT([FirstName], ' ', [LastName])"],
    arity: { min: 1 },
    impl: (args) => args.map(toText).join(''),
  }),
  str('TRIM', {
    description: 'Removes leading and trailing whitespace.',
    signatures: ['TRIM(text)'],
    examples: ["TRIM([Name]) = ''"],
    arity: { min: 1, max: 1 },
    impl: withText((t) => t.trim()),
  }),
  str('PAD_START', {
    description: 'Pads the start of the text with the fill (default space) until it reaches the length.',
    signatures: ['PAD_START(text, length)', 'PAD_START(text, length, fill)'],
    examples: ["PAD_START([Id], 6, '0')"],
    arity: { min: 2, max: 3 },
    impl: (args) => pad(args, true),
  }),
  str('PAD_END', {
    description: 'Pads the end of the text with the fill (default space) until it reaches the length.',
    signatures: ['PAD_END(text, length)', 'PAD_END(text, length, fill)'],
    examples: ['PAD_END([Code], 8)'],
    arity: { min: 2, max: 3 },
    impl: (args) => pad(args, false),
  }),
  str('TO_STRING', {
    description: 'Converts any value to text (dates as ISO, arrays comma-separated).',
    signatures: ['TO_STRING(value)'],
    examples: ["TO_STRING([Quantity]) + ' units'"],
    arity: { min: 1, max: 1 },
    impl: withText((t) => t),
  }),
];
