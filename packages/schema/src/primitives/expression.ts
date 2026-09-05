import { z } from 'zod';
import { withEditor } from '../meta.js';

/**
 * Expression kinds in the AdaptableQL-compatible language. The kind tells the
 * editor which functions to offer and the validator which return type to expect.
 */
export const ExpressionKind = z.enum(['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean', 'observable']);
export type ExpressionKind = z.infer<typeof ExpressionKind>;

function expression(kind: ExpressionKind, title: string) {
  return withEditor(z.string().min(1).max(4000), {
    'x-editor': 'expression',
    title,
    'x-editor-options': { kind },
  });
}

/** Per-row expression returning any value, e.g. `[price] * [qty]`. */
export const ScalarExpression = expression('scalar', 'Expression');
/** Per-row expression returning true/false, e.g. `[pnl] < 0 AND [desk] = 'Rates'`. */
export const BooleanExpression = expression('boolean', 'Condition');
/** Multi-row expression returning a value, e.g. `SUM([pnl], GROUP_BY([desk]))`. */
export const AggregatedScalarExpression = expression('aggregatedScalar', 'Aggregated expression');
/** Multi-row expression returning true/false, e.g. `SUM([pnl]) > '50M' WHERE [ccy] = 'USD'`. */
export const AggregatedBooleanExpression = expression('aggregatedBoolean', 'Aggregated condition');
/** Time-window expression, e.g. `ROW_CHANGE(COUNT([px], 5), TIMEFRAME('10m'))`. */
export const ObservableExpression = expression('observable', 'Observable condition');

export type ScalarExpression = z.infer<typeof ScalarExpression>;
export type BooleanExpression = z.infer<typeof BooleanExpression>;
