import { z } from 'zod';
import { withEditor } from '../meta.js';
import type { CellDataType } from './column.js';

/**
 * System predicate catalogue, matching AdapTable's ids so LLM prompts and
 * documentation examples transfer directly.
 */
export const PREDICATES = {
  any: ['Blanks', 'NonBlanks', 'In', 'NotIn', 'AnyChange'],
  number: [
    'Equals',
    'NotEquals',
    'GreaterThan',
    'GreaterThanOrEqual',
    'LessThan',
    'LessThanOrEqual',
    'Positive',
    'Negative',
    'Zero',
    'Between',
    'NotBetween',
    'PercentChange',
  ],
  text: ['Is', 'IsNot', 'Contains', 'NotContains', 'StartsWith', 'EndsWith', 'Regex'],
  date: [
    'Today',
    'Yesterday',
    'Tomorrow',
    'ThisWeek',
    'ThisMonth',
    'ThisQuarter',
    'ThisYear',
    'InPast',
    'InFuture',
    'Before',
    'After',
    'On',
    'NotOn',
    'NextWorkDay',
    'LastWorkDay',
    'WorkDay',
    'Holiday',
    'Range',
  ],
  boolean: ['True', 'False'],
} as const;

export const PREDICATE_IDS = [
  ...PREDICATES.any,
  ...PREDICATES.number,
  ...PREDICATES.text,
  ...PREDICATES.date,
  ...PREDICATES.boolean,
] as const;

export const PredicateId = z.enum(PREDICATE_IDS);
export type PredicateId = z.infer<typeof PredicateId>;

/** Number of inputs each predicate takes. `In`/`NotIn` take a list. */
export const PREDICATE_ARITY: Record<PredicateId, 0 | 1 | 2 | 'list'> = {
  Blanks: 0,
  NonBlanks: 0,
  In: 'list',
  NotIn: 'list',
  AnyChange: 0,
  Equals: 1,
  NotEquals: 1,
  GreaterThan: 1,
  GreaterThanOrEqual: 1,
  LessThan: 1,
  LessThanOrEqual: 1,
  Positive: 0,
  Negative: 0,
  Zero: 0,
  Between: 2,
  NotBetween: 2,
  PercentChange: 1,
  Is: 1,
  IsNot: 1,
  Contains: 1,
  NotContains: 1,
  StartsWith: 1,
  EndsWith: 1,
  Regex: 1,
  Today: 0,
  Yesterday: 0,
  Tomorrow: 0,
  ThisWeek: 0,
  ThisMonth: 0,
  ThisQuarter: 0,
  ThisYear: 0,
  InPast: 0,
  InFuture: 0,
  Before: 1,
  After: 1,
  On: 1,
  NotOn: 1,
  NextWorkDay: 0,
  LastWorkDay: 0,
  WorkDay: 0,
  Holiday: 0,
  Range: 2,
  True: 0,
  False: 0,
};

/** Which predicates apply to a data type (used by editors and the validator). */
export function predicatesForDataType(dataType: CellDataType): readonly PredicateId[] {
  switch (dataType) {
    case 'number':
      return [...PREDICATES.any, ...PREDICATES.number];
    case 'text':
    case 'textArray':
      return [...PREDICATES.any, ...PREDICATES.text];
    case 'date':
    case 'dateString':
      return [...PREDICATES.any, ...PREDICATES.date];
    case 'boolean':
      return [...PREDICATES.any, ...PREDICATES.boolean];
    default:
      return PREDICATES.any;
  }
}

/**
 * A predicate applied to a column value. `columnId` lets a rule evaluate a
 * different column from the one it styles (AdapTable's referenced predicate).
 * Custom predicate ids (registered by the host) are allowed as plain strings.
 */
export const Predicate = withEditor(
  z.object({
    predicateId: z.union([PredicateId, z.string().min(1)]),
    inputs: z.array(z.unknown()).default([]),
    columnId: z
      .string()
      .min(1)
      .optional()
      .describe('Evaluate against this column instead of the scoped column'),
  }),
  { 'x-editor': 'predicate', title: 'Condition' },
);
export type Predicate = z.infer<typeof Predicate>;
