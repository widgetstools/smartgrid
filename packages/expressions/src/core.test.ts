import { describe, expect, it } from 'vitest';
import { compileAggregatedSource } from './aggregate.js';
import { compileSource, CompileError } from './compile.js';
import { createEnv } from './env.js';
import { ObservableWatcher, compileObservableSource } from './observable.js';
import { columnsOf, parse, print, tryParse } from './parser.js';
import { tokenize } from './tokenizer.js';
import { ParseError, type RowContext, type Value } from './types.js';
import { validate } from './validate.js';

const env = createEnv({ now: () => new Date(2026, 8, 5, 12, 0, 0) });
const row = (data: Record<string, Value>, extra: Partial<RowContext> = {}): RowContext => ({
  get: (id) => data[id],
  rowId: String(data['id'] ?? ''),
  ...extra,
});
const ev = (src: string, data: Record<string, Value>) => compileSource(src, env)(row(data));

describe('tokenizer', () => {
  it('tokenises literals, columns, keywords and operators', () => {
    const t = tokenize("[PnL] >= -1.5e3 AND [desk] <> 'Rates' OR NOT [x]").map((x) => `${x.type}:${x.value}`);
    expect(t).toEqual([
      'column:PnL',
      'op:>=',
      'op:-',
      'number:1.5e3',
      'keyword:AND',
      'column:desk',
      'op:!=',
      'string:Rates',
      'keyword:OR',
      'keyword:NOT',
      'column:x',
      'eof:',
    ]);
  });
  it('reports unterminated strings and columns with spans', () => {
    expect(() => tokenize("[a] = 'oops")).toThrow(ParseError);
    try {
      tokenize('[abc');
    } catch (e) {
      expect((e as ParseError).start).toBe(0);
    }
  });
  it('handles doubled and escaped quotes', () => {
    expect(tokenize("'it''s'")[0]!.value).toBe("it's");
    expect(tokenize('"a\\"b"')[0]!.value).toBe('a"b');
  });
});

describe('parser', () => {
  it('respects precedence', () => {
    expect(print(parse('1 + 2 * 3 ^ 2 > 10 AND NOT [a] = 1 OR [b]'))).toBe(
      '(((1 + (2 * (3 ^ 2))) > 10) AND NOT ([a] = 1)) OR [b]',
    );
    expect(print(parse('-2 ^ 2'))).toBe('-(2 ^ 2)');
  });
  it('parses ternary, CASE, COL, FIELD and WHERE', () => {
    expect(print(parse("[Comments] > 100 ? 'Big' : 'Small'"))).toBe("[Comments] > 100 ? 'Big' : 'Small'");
    expect(print(parse("CASE [x] WHEN 1 THEN 'one' ELSE 'other' END"))).toBe(
      "CASE [x] WHEN 1 THEN 'one' ELSE 'other' END",
    );
    expect(print(parse('COL("Price") + FIELD(\'meta.rank\')'))).toBe("[Price] + FIELD('meta.rank')");
    expect(parse("SUM([PnL]) > '5M' WHERE [ccy] = 'USD'").type).toBe('where');
  });
  it('gives positioned errors', () => {
    const r = tryParse('[a] > ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Unexpected end/);
    const bare = tryParse('price > 1');
    if (!bare.ok) expect(bare.error.message).toMatch(/Unknown identifier "price"/);
    const chained = tryParse('1 < [a] < 3');
    if (!chained.ok) expect(chained.error.message).toMatch(/chained/);
    expect(tryParse('[a] WHERE [b]', { allowWhere: false }).ok).toBe(false);
  });
  it('collects columns', () => {
    expect(columnsOf(parse('[a] + [b] * [a]'))).toEqual(['a', 'b']);
  });
});

describe('scalar / boolean evaluation', () => {
  it('does arithmetic and comparison with coercion', () => {
    expect(ev('[price] * [qty]', { price: 2.5, qty: 4 })).toBe(10);
    expect(ev("[pnl] > '1K'", { pnl: 1500 })).toBe(true);
    expect(ev("[pnl] > '5M'", { pnl: 1500 })).toBe(false);
    expect(ev('[a] / 0', { a: 1 })).toBeUndefined();
    expect(ev('[a] + 1', { a: undefined })).toBeUndefined();
    expect(ev("[s] + '!'", { s: 'hi' })).toBe('hi!');
    expect(ev('10 % 3 + 2 ^ 3', {})).toBe(9);
  });
  it('compares text case-insensitively by default', () => {
    expect(ev("[desk] = 'rates'", { desk: 'Rates' })).toBe(true);
    expect(
      compileSource("[desk] = 'rates'", createEnv({ caseSensitive: true }))(row({ desk: 'Rates' })),
    ).toBe(false);
  });
  it('compares dates', () => {
    expect(ev("[d] > '2026-01-01'", { d: new Date(2026, 5, 1) })).toBe(true);
    expect(ev("[d] = '2026-06-01'", { d: new Date(2026, 5, 1) })).toBe(true);
  });
  it('evaluates ternary and CASE', () => {
    expect(ev("[n] > 100 ? 'Big' : 'Small'", { n: 101 })).toBe('Big');
    expect(ev("CASE [s] WHEN 'a' THEN 1 WHEN 'b' THEN 2 ELSE 0 END", { s: 'B' })).toBe(2);
    expect(ev("CASE WHEN [n] < 0 THEN 'neg' WHEN [n] = 0 THEN 'zero' END", { n: 5 })).toBeUndefined();
  });
  it('NULL and blanks', () => {
    expect(ev('[a] = NULL', { a: null })).toBe(true);
    expect(ev('[a] = NULL', { a: 0 })).toBe(false);
    expect(ev('NOT [flag]', { flag: false })).toBe(true);
  });
  it('rejects WHERE and unknown functions at compile time', () => {
    expect(() => compileSource('[a] WHERE [b]', env)).toThrow(CompileError);
    expect(() => compileSource('NOPE([a])', env)).toThrow(/Unknown function NOPE/);
    expect(() => compileSource('GROUP_BY([a])', env)).toThrow(/inside an aggregation/);
  });
});

describe('aggregated evaluation', () => {
  const rows = [
    row({ id: 1, desk: 'Rates', ccy: 'USD', pnl: 100, notional: 1_000_000, price: 99, date: 3 }),
    row({ id: 2, desk: 'Rates', ccy: 'EUR', pnl: -50, notional: 3_000_000, price: 101, date: 1 }),
    row({ id: 3, desk: 'Credit', ccy: 'USD', pnl: 200, notional: 2_000_000, price: 100, date: 2 }),
    row({ id: 4, desk: 'Credit', ccy: 'USD', pnl: null, notional: 500_000, price: 98, date: 4 }),
  ];
  it('SUM / AVG / COUNT / MIN / MAX / MEDIAN across rows', () => {
    const p = compileAggregatedSource('SUM([pnl])', env);
    expect(p.evaluate(rows).value).toBe(250);
    expect(compileAggregatedSource('AVG([pnl])', env).evaluate(rows).value).toBeCloseTo(83.333, 2);
    expect(compileAggregatedSource('COUNT([pnl])', env).evaluate(rows).value).toBe(3);
    expect(compileAggregatedSource('COUNT()', env).evaluate(rows).value).toBe(4);
    expect(compileAggregatedSource('MAX([price]) - MIN([price])', env).evaluate(rows).value).toBe(3);
    expect(compileAggregatedSource('MEDIAN([price])', env).evaluate(rows).value).toBe(99.5);
    expect(compileAggregatedSource('DISTINCT([ccy])', env).evaluate(rows).value).toBe(2);
    expect(compileAggregatedSource('ONLY([ccy])', env).evaluate(rows).value).toBeUndefined();
    expect(compileAggregatedSource('MODE([ccy])', env).evaluate(rows).value).toBe('USD');
  });
  it('WHERE filters, magnitude strings compare, GROUP_BY groups', () => {
    const p = compileAggregatedSource("SUM([pnl]) > '250' WHERE [ccy] = 'USD'", env);
    expect(p.evaluate(rows).value).toBe(true);
    const g = compileAggregatedSource('SUM([pnl], GROUP_BY([desk]))', env);
    expect(g.groupBy).toEqual(['desk']);
    expect(g.evaluateRow(rows[0]!, rows)).toBe(50);
    expect(g.evaluateRow(rows[2]!, rows)).toBe(200);
    const res = g.evaluate(rows);
    expect(res.groups?.map((x) => [x.values['desk'], x.value])).toEqual([
      ['Rates', 50],
      ['Credit', 200],
    ]);
    expect(p.columns.sort()).toEqual(['ccy', 'pnl']);
  });
  it('weighted average and percentage', () => {
    const w = compileAggregatedSource('AVG([price], WEIGHT([notional]))', env);
    const expected = (99 * 1e6 + 101 * 3e6 + 100 * 2e6 + 98 * 0.5e6) / 6.5e6;
    expect(w.evaluate(rows).value).toBeCloseTo(expected, 6);
    const pct = compileAggregatedSource('PERCENTAGE([pnl])', env);
    expect(pct.evaluateRow(rows[0]!, rows)).toBeCloseTo(40, 6);
    const pct2 = compileAggregatedSource('PERCENTAGE([pnl], SUM([pnl], GROUP_BY([desk])))', env);
    expect(pct2.evaluateRow(rows[0]!, rows)).toBeCloseTo(200, 6);
  });
  it('CUMUL with OVER and QUANT', () => {
    const c = compileAggregatedSource('CUMUL(SUM([pnl]), OVER([date]))', env);
    expect(c.evaluateRow(rows[1]!, rows)).toBe(-50); // date 1
    expect(c.evaluateRow(rows[2]!, rows)).toBe(150); // date 2
    expect(c.evaluateRow(rows[0]!, rows)).toBe(250); // date 3
    expect(c.evaluateRows(rows)).toEqual([250, -50, 150, 250]);
    const q = compileAggregatedSource('QUANT([price], 4)', env);
    expect(rows.map((r) => q.evaluateRow(r, rows))).toEqual([2, 4, 3, 1]);
    expect(compileAggregatedSource('QUARTILE([price])', env).evaluateRow(rows[1]!, rows)).toBe(4);
    expect(compileAggregatedSource('PERCENTILE([price])', env).evaluateRow(rows[1]!, rows)).toBe(100);
  });
  it('rejects malformed modifiers', () => {
    expect(() => compileAggregatedSource('CUMUL(SUM([pnl]))', env)).toThrow(/OVER/);
    expect(() => compileAggregatedSource('SUM([pnl], WHERE([x]))', env)).toThrow(/Unexpected "WHERE"/);
    expect(() => compileAggregatedSource('SUM([pnl], GROUP_BY(1))', env)).toThrow(/column references/);
  });
});

describe('observable', () => {
  const r = row({ id: 'r1', price: 10 });
  const change = (rowId: string, columnId: string, oldValue: Value, newValue: Value, at: number) => ({
    kind: 'change' as const,
    rowId,
    columnId,
    oldValue,
    newValue,
    row: row({ id: rowId, price: newValue }),
    at,
  });
  it('COUNT within a timeframe per row', () => {
    const spec = compileObservableSource("ROW_CHANGE(COUNT([price], 3), TIMEFRAME('5m'))", env);
    expect(spec).toMatchObject({
      source: 'ROW_CHANGE',
      change: { type: 'COUNT', columnId: 'price', count: 3 },
      timeframeMs: 300_000,
    });
    const w = new ObservableWatcher(spec);
    expect(w.push(change('r1', 'price', 1, 2, 0))).toEqual([]);
    expect(w.push(change('r1', 'qty', 1, 2, 1000))).toEqual([]); // other column ignored
    expect(w.push(change('r1', 'price', 2, 3, 60_000))).toEqual([]);
    expect(w.push(change('r2', 'price', 2, 3, 61_000))).toEqual([]); // other row
    const t = w.push(change('r1', 'price', 3, 4, 120_000));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ rowId: 'r1', value: 3 });
    // window slides: changes older than 5m drop out
    expect(w.push(change('r1', 'price', 4, 5, 500_000))).toEqual([]);
  });
  it('MIN fires on a new low; WHERE filters events', () => {
    const spec = compileObservableSource("ROW_CHANGE(MIN([price]), TIMEFRAME('1h')) WHERE [price] > 0", env);
    const w = new ObservableWatcher(spec);
    expect(w.push(change('r1', 'price', 10, 9, 0))).toEqual([]); // first value, no baseline
    expect(w.push(change('r1', 'price', 9, 8, 1))).toHaveLength(1);
    expect(w.push(change('r1', 'price', 8, 12, 2))).toEqual([]);
    expect(w.push(change('r1', 'price', 12, -1, 3))).toEqual([]); // filtered by WHERE
  });
  it('NONE fires from tick after silence; GRID_CHANGE uses one window', () => {
    const spec = compileObservableSource("GRID_CHANGE(NONE([price]), TIMEFRAME('30s'))", env);
    const w = new ObservableWatcher(spec, { startedAt: 0 });
    expect(w.tick(10_000)).toEqual([]);
    expect(w.tick(30_000)).toHaveLength(1);
    expect(w.tick(40_000)).toEqual([]); // fired once
    w.push(change('r1', 'price', 1, 2, 45_000));
    expect(w.tick(60_000)).toEqual([]);
    expect(w.tick(75_000)).toHaveLength(1);
  });
  it('ROW_ADDED / ROW_REMOVED with and without counts', () => {
    const every = new ObservableWatcher(compileObservableSource('ROW_ADDED() WHERE [price] > 5', env));
    expect(every.push({ kind: 'added', rowId: 'r1', row: r, at: 0 })).toHaveLength(1);
    expect(every.push({ kind: 'added', rowId: 'r2', row: row({ price: 1 }), at: 0 })).toEqual([]);
    const three = new ObservableWatcher(compileObservableSource("ROW_REMOVED(3, TIMEFRAME('5m'))", env));
    expect(three.push({ kind: 'removed', rowId: 'a', row: r, at: 0 })).toEqual([]);
    expect(three.push({ kind: 'removed', rowId: 'b', row: r, at: 1 })).toEqual([]);
    expect(three.push({ kind: 'removed', rowId: 'c', row: r, at: 2 })).toHaveLength(1);
  });
  it('rejects bad shapes', () => {
    expect(() => compileObservableSource('[a] > 1', env)).toThrow(/must start with/);
    expect(() => compileObservableSource('ROW_CHANGE(COUNT([a], 2))', env)).toThrow(/TIMEFRAME/);
    expect(() => compileObservableSource("ROW_CHANGE(COUNT([a], 2), TIMEFRAME('2d'))", env)).toThrow(
      /maximum/,
    );
    expect(() => compileObservableSource("ROW_CHANGE(COUNT([a], 2), TIMEFRAME('soon'))", env)).toThrow(
      /Invalid timeframe/,
    );
  });
});

describe('validate', () => {
  const columns = [
    { id: 'pnl', header: 'PnL', dataType: 'number' as const },
    { id: 'desk', header: 'Desk', dataType: 'text' as const },
    { id: 'tradeDate', header: 'Trade Date', dataType: 'date' as const },
  ];
  it('accepts a boolean expression and resolves friendly names', () => {
    const r = validate("[PnL] < 0 AND [Desk] = 'Rates'", { kind: 'boolean', env, columns });
    expect(r.ok).toBe(true);
    expect(r.columns).toEqual(['pnl', 'desk']);
    expect(r.returnType).toBe('boolean');
  });
  it('flags unknown columns and functions with spans', () => {
    const r = validate('[Nope] > 1 AND SUMM([pnl]) > 2', { kind: 'boolean', env, columns });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.message)).toEqual([
      'Unknown column [Nope]',
      'Unknown function SUMM; did you mean SUM?',
    ]);
    expect(r.errors[0]).toMatchObject({ start: 0, end: 6 });
  });
  it('enforces kinds', () => {
    expect(validate('SUM([pnl]) > 1', { kind: 'boolean', env, columns }).errors[0]?.message).toMatch(
      /aggregated expression/,
    );
    expect(validate('[pnl] * 2', { kind: 'boolean', env, columns }).errors[0]?.message).toMatch(
      /must return true\/false/,
    );
    expect(
      validate("SUM([pnl]) > '5M' WHERE [desk] = 'Rates'", { kind: 'aggregatedBoolean', env, columns }).ok,
    ).toBe(true);
    expect(validate('[pnl] > 1 WHERE [desk] = 1', { kind: 'boolean', env, columns }).ok).toBe(false);
    expect(
      validate("ROW_CHANGE(COUNT([pnl], 3), TIMEFRAME('5m'))", { kind: 'observable', env, columns }).ok,
    ).toBe(true);
    expect(validate('[pnl] > 1', { kind: 'observable', env, columns }).ok).toBe(false);
    expect(validate('ROW_ADDED()', { kind: 'boolean', env, columns }).ok).toBe(false);
    const w = validate('[pnl] * 2', { kind: 'aggregatedScalar', env, columns });
    expect(w.ok).toBe(true);
    expect(w.warnings[0]?.message).toMatch(/No aggregation/);
  });
  it('passes scalar expressions of any type', () => {
    expect(validate('[pnl] * 2', { kind: 'scalar', env, columns }).returnType).toBe('number');
    expect(validate("[desk] + '!'", { kind: 'scalar', env, columns }).returnType).toBe('text');
  });
});
