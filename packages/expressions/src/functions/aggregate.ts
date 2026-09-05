/**
 * Aggregated-tier and observable-tier function *definitions*. These carry
 * metadata (signatures, kinds, arity) for validation and completions; the
 * implementations live in aggregate.ts / observable.ts, which lower the
 * calls before the closure compiler sees them.
 */
import type { FunctionDef } from '../types.js';

const agg = (
  name: string,
  description: string,
  signatures: string[],
  returnType: FunctionDef['returnType'] = 'number',
  examples: string[] = [],
): FunctionDef => ({
  name,
  category: 'aggregated',
  returnType,
  description,
  signatures,
  examples,
  kinds: ['aggregatedScalar', 'aggregatedBoolean'],
  arity: { min: 1, max: 3 },
});

const modifier = (name: string, description: string, signatures: string[]): FunctionDef => ({
  name,
  category: 'aggregated',
  returnType: 'any',
  description,
  signatures,
  kinds: ['aggregatedScalar', 'aggregatedBoolean', 'observable'],
  arity: { min: 1 },
  modifierOnly: true,
});

export const AGGREGATE_DEFS: FunctionDef[] = [
  agg('SUM', 'Sum of a column across rows.', ['SUM([col])', 'SUM([col], GROUP_BY([a], [b]))'], 'number', [
    "SUM([PnL]) > '5M'",
    'SUM([PnL], GROUP_BY([Currency], [Counterparty]))',
  ]),
  agg(
    'AVG',
    'Average across rows; WEIGHT([w]) makes it a weighted average.',
    ['AVG([col])', 'AVG([col], WEIGHT([w]))', 'AVG([col], GROUP_BY([a]))'],
    'number',
    ['AVG([Price], WEIGHT([Notional]))'],
  ),
  agg(
    'MIN',
    'Smallest value across rows (or of several values per row).',
    ['MIN([col])', 'MIN([col], GROUP_BY([a]))'],
    'number',
  ),
  agg(
    'MAX',
    'Largest value across rows (or of several values per row).',
    ['MAX([col])', 'MAX([col], GROUP_BY([a]))'],
    'number',
  ),
  agg('MEDIAN', 'Median across rows.', ['MEDIAN([col])'], 'number'),
  agg(
    'COUNT',
    'Number of rows with a value; COUNT() counts all rows.',
    ['COUNT()', 'COUNT([col])', 'COUNT([col], GROUP_BY([a]))'],
    'number',
  ),
  agg('MODE', 'Most frequent value across rows.', ['MODE([col])'], 'any'),
  agg('DISTINCT', 'Number of distinct values across rows.', ['DISTINCT([col])'], 'number'),
  agg('ONLY', 'The value when every row has the same one, else blank.', ['ONLY([col])'], 'any'),
  agg('STD_DEVIATION', 'Sample standard deviation across rows.', ['STD_DEVIATION([col])'], 'number'),
  agg(
    'PERCENTAGE',
    'Part as a percentage of a total (default: the column sum).',
    ['PERCENTAGE([col])', 'PERCENTAGE([part], SUM([total], GROUP_BY([g])))'],
    'number',
    ['PERCENTAGE([open_issues_count], SUM([closed_issues_count], GROUP_BY([language])))'],
  ),
  agg(
    'CUMUL',
    'Running aggregation in the order of OVER([col]).',
    ['CUMUL(SUM([col]), OVER([order]))'],
    'number',
    ['CUMUL(SUM([github_stars]), OVER([created_at]))'],
  ),
  agg(
    'QUANT',
    'Bucket (1..n) the row falls in when values are split into n quantiles.',
    ['QUANT([col], n)', 'QUANT([col], n, GROUP_BY([g]))'],
    'number',
    ['QUANT([value], 4, GROUP_BY([type]))'],
  ),
  agg('QUARTILE', 'Quartile (1..4) of the row value.', ['QUARTILE([col])'], 'number'),
  agg('PERCENTILE', 'Percentile (1..100) of the row value.', ['PERCENTILE([col])'], 'number'),
  modifier('GROUP_BY', 'Aggregate within groups sharing these column values.', ['GROUP_BY([a], [b])']),
  modifier('WEIGHT', 'Weight column for AVG.', ['WEIGHT([w])']),
  modifier('OVER', 'Ordering column for CUMUL.', ['OVER([date])']),
];

const observable = (
  name: string,
  description: string,
  signatures: string[],
  examples: string[] = [],
  arity = { min: 0, max: 2 },
): FunctionDef => ({
  name,
  category: 'observable',
  returnType: 'boolean',
  description,
  signatures,
  examples,
  kinds: ['observable'],
  arity,
});

const changeType = (name: string, description: string, signatures: string[]): FunctionDef => ({
  name,
  category: 'observable',
  returnType: 'any',
  description,
  signatures,
  kinds: ['observable'],
  arity: { min: 0, max: 2 },
  modifierOnly: true,
});

export const OBSERVABLE_DEFS: FunctionDef[] = [
  observable(
    'ROW_CHANGE',
    'Watch changes in a row over a time window.',
    [
      'ROW_CHANGE(COUNT([col], n), TIMEFRAME(t))',
      'ROW_CHANGE(MIN([col]), TIMEFRAME(t))',
      'ROW_CHANGE(NONE([col]), TIMEFRAME(t))',
    ],
    ["ROW_CHANGE(COUNT([ItemCount], 3), TIMEFRAME('5m'))"],
  ),
  observable(
    'GRID_CHANGE',
    'Watch changes anywhere in the grid over a time window.',
    ['GRID_CHANGE(NONE([col]), TIMEFRAME(t))', 'GRID_CHANGE(COUNT([col], n), TIMEFRAME(t))'],
    ["GRID_CHANGE(NONE([Price]), TIMEFRAME('30s'))"],
  ),
  observable(
    'ROW_ADDED',
    'Rows added, optionally n within a timeframe.',
    ['ROW_ADDED()', 'ROW_ADDED(n, TIMEFRAME(t))'],
    ["ROW_ADDED() WHERE [language] = 'TypeScript'"],
  ),
  observable(
    'ROW_REMOVED',
    'Rows removed, optionally n within a timeframe.',
    ['ROW_REMOVED()', 'ROW_REMOVED(n, TIMEFRAME(t))'],
    ["ROW_REMOVED(3, TIMEFRAME('5m'))"],
  ),
  changeType('COUNT', 'n changes to the column.', ['COUNT([col], n)']),
  changeType('NONE', 'No change to the column for the timeframe.', ['NONE([col])']),
  {
    ...changeType('TIMEFRAME', "Window such as '30s', '5m', '2h', '1d'.", ["TIMEFRAME('5m')"]),
    arity: { min: 1, max: 1 },
  },
];

/** Names that mean "aggregate" in aggregated kinds but are ordinary scalars elsewhere. */
export const DUAL_USE = new Set(['MIN', 'MAX', 'AVG', 'COUNT']);
