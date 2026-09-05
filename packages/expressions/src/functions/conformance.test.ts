/**
 * Conformance: every expression quoted in the AdaptableQL docs (section 7 of
 * the developer reference and the calculated-column / alert examples of the
 * search & filter guide) must parse; per-row ones must also validate and
 * evaluate against a plausible row without throwing.
 */
import { describe, expect, it } from 'vitest';
import { compileSource } from '../compile.js';
import { createEnv } from '../env.js';
import { parse } from '../parser.js';
import type { RowContext, Value } from '../types.js';
import { validate } from '../validate.js';

const NOW = new Date(2026, 8, 5, 12, 0);
const env = createEnv({
  now: () => NOW,
  variables: (name, arg) => (name === 'LIMIT' ? 1000 : name === 'NAME' ? `name:${String(arg)}` : undefined),
  namedQuery: (name) =>
    ({
      Big: '[Price] > 1000',
      'Big Orders': '[Price] > 1000 AND [Quantity] > 10',
      'Hottest JavaScript': "[language] = 'JavaScript' AND [stars] > 1000",
    })[name],
});

const data: Record<string, Value> = {
  BloombergBid: 52,
  MarkitBid: 49,
  Currency: 'USD',
  TradeDate: new Date(2026, 8, 20),
  Comments: 150,
  BirthDate: new Date(1990, 0, 15),
  Rating: 'AAA',
  Price: 90,
  Name: 'Alpha',
  a: null,
  b: 'fallback',
  Quantity: 20,
  language: 'JavaScript',
  stars: 5000,
  topics: ['javascript', 'grid'],
  closed_issues_count: 10,
  closed_pr_count: 5,
  pushed_at: '2026-09-01',
  updated_at: '2026-09-01',
  Notional: 5000,
  arg: 'x',
};
const row: RowContext = {
  get: (id) => data[id],
  field: (path) => (path === 'meta.rank' ? 3 : undefined),
  change: { columnId: 'Price', oldValue: 100, newValue: 90 },
};

type Kind = 'boolean' | 'scalar';
const PER_ROW: [string, Kind, Value?][] = [
  // 7.1 standard expressions
  ["MIN([BloombergBid],[MarkitBid]) > 50 OR [Currency] = 'USD'", 'boolean', true],
  ['ADD_DAYS(CURRENT_DAY(), 5) < [TradeDate]', 'boolean', true],
  ["[Comments] > 100 ? 'Big' : 'Small'", 'scalar', 'Big'],
  // 7.1 relative change
  ['ANY_CHANGE([Price])', 'boolean', true],
  ['ANY_CHANGE()', 'boolean', true],
  ["ABSOLUTE_CHANGE([Price], 'INCREASE') > 10", 'boolean', false],
  ["PERCENT_CHANGE([Price], 'DECREASE') = 10", 'boolean', true],
  ['ABSOLUTE_CHANGE([Price]) > 5', 'boolean', true],
  // 7.2 advanced
  ["QUERY('Big')", 'boolean', false],
  ['QUERY("Big Orders") AND [Price] > 1000', 'boolean', false],
  ['QUERY("Hottest JavaScript") AND CONTAINS([topics], "javascript")', 'boolean', true],
  ["VAR('LIMIT')", 'scalar', 1000],
  ['VAR("NAME", [arg])', 'scalar', 'name:x'],
  ["[Notional] > VAR('LIMIT')", 'boolean', true],
  ["FIELD('meta.rank') > 1", 'boolean', true],
  ['COL("Price") + FIELD(\'meta.rank\')', 'scalar', 93],
  ["IF([Comments] > 100, 'Big', 'Small')", 'scalar', 'Big'],
  ["CASE [Rating] WHEN 'AAA' THEN 1 ELSE 0 END", 'scalar', 1],
  // 7.3 catalogue examples used by the guides
  ['DIFF_YEARS(CURRENT_DAY(), [BirthDate])', 'scalar', 36],
  ['ADD_YEARS([BirthDate], 18) <= CURRENT_DAY()', 'boolean', true],
  ["IN([Currency], 'GBP', 'EUR')", 'boolean', false],
  ["REGEX([Name], '^A')", 'boolean', true],
  ['COALESCE([a], [b], 0)', 'scalar', 'fallback'],
  // 03 search & filter guide
  ['[closed_issues_count] > [closed_pr_count] AND [pushed_at] = [updated_at]', 'boolean', true],
];

const AGGREGATED: [string, 'aggregatedScalar' | 'aggregatedBoolean'][] = [
  ["SUM([PnL]) > '5M'", 'aggregatedBoolean'],
  ['AVG([Price], WEIGHT([index]))', 'aggregatedScalar'],
  ['SUM([PnL], GROUP_BY([Currency],[Counterparty]))', 'aggregatedScalar'],
  ["SUM([PnL]) > '5M' WHERE [Currency]='USD'", 'aggregatedBoolean'],
  ['CUMUL(SUM([PnL]), OVER([TradeDate]))', 'aggregatedScalar'],
  ['QUANT([PnL], 10)', 'aggregatedScalar'],
  ['QUARTILE([PnL])', 'aggregatedScalar'],
  ['PERCENTILE([Price])', 'aggregatedScalar'],
  ['PERCENTAGE([open_issues_count], SUM([closed_issues_count], GROUP_BY([language])))', 'aggregatedScalar'],
  ['CUMUL( SUM([github_stars]), OVER([created_at]) )', 'aggregatedScalar'],
  ['QUANT([value], 4)', 'aggregatedScalar'],
  ['QUANT([value], 4, GROUP_BY([type]))', 'aggregatedScalar'],
  ["SUM([PnL]) > '50M' WHERE [Currency] = 'USD'", 'aggregatedBoolean'],
  ['COUNT([language]) >= 3 WHERE [stars] > 100', 'aggregatedBoolean'],
  ['MIN([Price], GROUP_BY([Currency]))', 'aggregatedScalar'],
  ['MAX([Price]) - MIN([Price])', 'aggregatedScalar'],
];

const OBSERVABLE = [
  "ROW_CHANGE( COUNT([ItemCount], 3), TIMEFRAME('5m') )",
  "GRID_CHANGE( NONE([Price]), TIMEFRAME('30s') ) WHERE [Currency] = 'USD'",
  'ROW_ADDED()',
  "ROW_REMOVED(3, TIMEFRAME('5m'))",
  "ROW_ADDED() WHERE [language] = 'TypeScript'",
  "ROW_CHANGE(COUNT([c], 5), TIMEFRAME('10m'))",
  "GRID_CHANGE(NONE([c]), TIMEFRAME('2h'))",
  "ROW_CHANGE(MAX([c]), TIMEFRAME('1d')) WHERE [c] > 0",
];

describe('per-row doc examples', () => {
  for (const [src, kind, expected] of PER_ROW) {
    it(`${src}`, () => {
      expect(() => parse(src)).not.toThrow();
      const v = validate(src, { kind, env });
      expect(v.errors).toEqual([]);
      expect(v.ok).toBe(true);
      const value = compileSource(src, env)(row);
      if (expected !== undefined) expect(value).toEqual(expected);
    });
  }
});

describe('aggregated doc examples', () => {
  for (const [src, kind] of AGGREGATED) {
    it(`${src}`, () => {
      expect(() => parse(src)).not.toThrow();
      const v = validate(src, { kind, env });
      expect(v.errors).toEqual([]);
    });
  }
});

describe('observable doc examples', () => {
  for (const src of OBSERVABLE) {
    it(`${src}`, () => {
      expect(() => parse(src)).not.toThrow();
      // The docs' TIMEFRAME('1d') example needs the 24h hard maximum rather than the 8h default.
      const v = validate(src, { kind: 'observable', env, maxTimeframeMs: 24 * 3_600_000 });
      expect(v.errors).toEqual([]);
    });
  }
});
