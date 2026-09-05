import { z } from 'zod';
import { withEditor } from '../meta.js';
import { Predicate } from './predicate.js';
import { BooleanExpression, AggregatedBooleanExpression, ObservableExpression } from './expression.js';

/**
 * A condition: either a list of predicates combined with AND/OR, or a boolean
 * expression. This is the "condition step" of every AdapTable wizard as one
 * value. When the owning object's scope is `all`, only the expression form is
 * meaningful (there is no single column for a predicate to read).
 */
export const Rule = withEditor(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('predicates'),
      predicates: z.array(Predicate).min(1),
      operator: z.enum(['AND', 'OR']).default('AND'),
    }),
    z.object({ kind: z.literal('expression'), expression: BooleanExpression }),
  ]),
  { 'x-editor': 'rule', title: 'Condition' },
);
export type Rule = z.infer<typeof Rule>;

/** Rule variants that alerts can use in addition to the standard Rule. */
export const AlertRule = withEditor(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('predicates'),
      predicates: z.array(Predicate).min(1),
      operator: z.enum(['AND', 'OR']).default('AND'),
    }),
    z.object({ kind: z.literal('expression'), expression: BooleanExpression }),
    z.object({ kind: z.literal('aggregated'), expression: AggregatedBooleanExpression }),
    z.object({ kind: z.literal('observable'), expression: ObservableExpression }),
  ]),
  {
    'x-editor': 'rule',
    title: 'Condition',
    'x-editor-options': { allowAggregated: true, allowObservable: true },
  },
);
export type AlertRule = z.infer<typeof AlertRule>;
