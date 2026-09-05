import { describe, expect, it } from 'vitest';
import { compileSource } from '../compile.js';
import { createEnv } from '../env.js';
import { EvaluationError, type Env, type FunctionContext, type RowContext, type Value } from '../types.js';
import { BOOLEAN_DEFS } from './boolean.js';
import { DATE_DEFS } from './date.js';
import { SYSTEM_FUNCTIONS } from './index.js';
import { MISC_DEFS } from './misc.js';
import { NUMERIC_DEFS } from './numeric.js';
import { STRING_DEFS } from './string.js';

// Saturday 5 September 2026, noon.
const NOW = new Date(2026, 8, 5, 12, 0);
const env = createEnv({ now: () => NOW });
const csEnv = createEnv({ now: () => NOW, caseSensitive: true });

const row = (data: Record<string, Value>, extra: Partial<RowContext> = {}): RowContext => ({
  get: (id) => data[id],
  ...extra,
});
const ev = (src: string, data: Record<string, Value> = {}, e: Env = env, extra?: Partial<RowContext>) =>
  compileSource(src, e)(row(data, extra));
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('catalogue metadata', () => {
  const perRow = [...BOOLEAN_DEFS, ...NUMERIC_DEFS, ...DATE_DEFS, ...STRING_DEFS, ...MISC_DEFS];
  it('every per-row definition is complete and registered', () => {
    for (const d of perRow) {
      expect(d.name, d.name).toBe(d.name.toUpperCase());
      expect(d.description.length, d.name).toBeGreaterThan(0);
      expect(d.signatures.length, d.name).toBeGreaterThan(0);
      expect(d.examples?.length, d.name).toBeGreaterThan(0);
      expect(d.kinds.length, d.name).toBeGreaterThan(0);
      expect(d.impl !== undefined || d.lazy !== undefined, d.name).toBe(true);
      expect(env.functions.get(d.name)?.name, d.name).toBe(d.name);
    }
    expect(new Set(perRow.map((d) => d.name)).size).toBe(perRow.length);
  });
  it('keeps the dual-use MIN/MAX/AVG usable in both tiers and the aggregate-only names intact', () => {
    for (const name of ['MIN', 'MAX', 'AVG']) {
      const d = env.functions.get(name)!;
      expect(d.impl).toBeDefined();
      expect(d.kinds).toEqual(['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean']);
      expect(d.signatures.some((s) => s.includes('GROUP_BY'))).toBe(true);
    }
    expect(env.functions.get('SUM')?.category).toBe('aggregated');
    expect(env.functions.get('GROUP_BY')?.modifierOnly).toBe(true);
    expect(env.functions.get('ROW_CHANGE')?.category).toBe('observable');
    expect(SYSTEM_FUNCTIONS.filter((d) => d.name === 'MIN')).toHaveLength(1);
  });
});

describe('boolean functions', () => {
  it('EQ / NEQ follow the case-sensitivity setting and treat blanks as unequal to values', () => {
    expect(ev("EQ([desk], 'rates')", { desk: 'Rates' })).toBe(true);
    expect(ev("EQ([desk], 'rates')", { desk: 'Rates' }, csEnv)).toBe(false);
    expect(ev("NEQ([desk], 'rates')", { desk: 'Rates' })).toBe(false);
    expect(ev('EQ([x], 1)', { x: undefined })).toBe(false);
    expect(ev('EQ([x], NULL)', { x: null })).toBe(true);
    expect(ev("EQ([pnl], '1K')", { pnl: 1000 })).toBe(true);
  });
  it('GT / LT / GTE / LTE compare numerically, by date or text; blank sides are false', () => {
    expect(ev("GT([pnl], '1K')", { pnl: 1500 })).toBe(true);
    expect(ev('LT([pnl], 100)', { pnl: 1500 })).toBe(false);
    expect(ev('GTE(5, 5)')).toBe(true);
    expect(ev('LTE(5, 4)')).toBe(false);
    expect(ev("GT([d], '2026-01-01')", { d: local(2026, 6, 1) })).toBe(true);
    expect(ev("LT([s], 'b')", { s: 'A' })).toBe(true);
    expect(ev('GT([x], 1)', { x: null })).toBe(false);
    expect(ev('LTE([x], 1)', { x: '' })).toBe(false);
  });
  it('AND / OR are variadic and short-circuit', () => {
    const ctx: FunctionContext = { row: row({}), env, span: { start: 0, end: 0 } };
    const and = env.functions.get('AND')!.lazy!;
    const or = env.functions.get('OR')!.lazy!;
    const boom = () => {
      throw new Error('should not be evaluated');
    };
    expect(and([() => true, () => 1, () => 'yes'], ctx)).toBe(true);
    expect(and([() => true, () => false, boom], ctx)).toBe(false);
    expect(and([() => null, boom], ctx)).toBe(false);
    expect(or([() => false, () => 0, () => 'x'], ctx)).toBe(true);
    expect(or([() => true, boom], ctx)).toBe(true);
    expect(or([() => undefined, () => ''], ctx)).toBe(false);
  });
  it('NOT negates with boolean coercion', () => {
    expect(ev('NOT([flag])', { flag: false })).toBe(true);
    expect(ev('NOT([flag])', { flag: 'yes' })).toBe(false);
    expect(ev('NOT([flag])', { flag: null })).toBe(true);
  });
  it('BETWEEN is inclusive and false for blanks', () => {
    expect(ev('BETWEEN([p], 5, 10)', { p: 5 })).toBe(true);
    expect(ev('BETWEEN([p], 5, 10)', { p: 10 })).toBe(true);
    expect(ev('BETWEEN([p], 5, 10)', { p: 11 })).toBe(false);
    expect(ev("BETWEEN([d], '2026-01-01', '2026-12-31')", { d: local(2026, 6, 1) })).toBe(true);
    expect(ev('BETWEEN([p], 5, 10)', { p: null })).toBe(false);
  });
  it('IN accepts variadic options or an array', () => {
    expect(ev("IN([ccy], 'GBP', 'EUR')", { ccy: 'eur' })).toBe(true);
    expect(ev("IN([ccy], 'GBP', 'EUR')", { ccy: 'eur' }, csEnv)).toBe(false);
    expect(ev("IN([ccy], 'GBP', 'EUR')", { ccy: 'USD' })).toBe(false);
    expect(ev("IN([ccy], TO_ARRAY('USD', 'GBP'))", { ccy: 'USD' })).toBe(true);
    expect(ev('IN([n], 1, 2, 3)', { n: '2' })).toBe(true);
    expect(ev("IN([ccy], 'GBP')", { ccy: null })).toBe(false);
  });
  it('CONTAINS / STARTS_WITH / ENDS_WITH / ANY_CONTAINS test text (and array elements)', () => {
    expect(ev("CONTAINS([name], 'BANK')", { name: 'Deutsche Bank' })).toBe(true);
    expect(ev("CONTAINS([name], 'BANK')", { name: 'Deutsche Bank' }, csEnv)).toBe(false);
    expect(ev("CONTAINS([topics], 'script')", { topics: ['java', 'typescript'] })).toBe(true);
    expect(ev("CONTAINS([name], 'x')", { name: null })).toBe(false);
    expect(ev('CONTAINS([name], [s])', { name: 'abc', s: undefined })).toBe(false);
    expect(ev("STARTS_WITH([isin], 'us')", { isin: 'US1234' })).toBe(true);
    expect(ev("STARTS_WITH([isin], 'GB')", { isin: 'US1234' })).toBe(false);
    expect(ev("ENDS_WITH([mail], '.COM')", { mail: 'a@b.com' })).toBe(true);
    expect(ev("ENDS_WITH([mail], '.com')", { mail: '' })).toBe(false);
    expect(ev("ANY_CONTAINS([topics], 'JAVA')", { topics: ['python', 'javascript'] })).toBe(true);
    expect(ev("ANY_CONTAINS([topics], 'rust')", { topics: ['python', 'javascript'] })).toBe(false);
    expect(ev("ANY_CONTAINS([topics], 'rust')", { topics: 'rustlang' })).toBe(true);
    expect(ev("ANY_CONTAINS([topics], 'rust')", { topics: [] })).toBe(false);
  });
  it('IS_BLANK / IS_NOT_BLANK / IS_NUMERIC', () => {
    expect(ev('IS_BLANK([c])', { c: null })).toBe(true);
    expect(ev('IS_BLANK([c])', { c: '  ' })).toBe(true);
    expect(ev('IS_BLANK([c])', { c: [] })).toBe(true);
    expect(ev('IS_BLANK([c])', { c: 0 })).toBe(false);
    expect(ev('IS_NOT_BLANK([c])', { c: 'x' })).toBe(true);
    expect(ev('IS_NOT_BLANK([c])', { c: undefined })).toBe(false);
    expect(ev('IS_NUMERIC([c])', { c: '1,250.5' })).toBe(true);
    expect(ev('IS_NUMERIC([c])', { c: '5M' })).toBe(true);
    expect(ev('IS_NUMERIC([c])', { c: 42 })).toBe(true);
    expect(ev('IS_NUMERIC([c])', { c: 'abc' })).toBe(false);
    expect(ev('IS_NUMERIC([c])', { c: null })).toBe(false);
    expect(ev('IS_NUMERIC([c])', { c: true })).toBe(false);
  });
  it('REGEX caches patterns, honours case setting and flags, rejects bad patterns', () => {
    expect(ev("REGEX([name], '^a')", { name: 'Alpha' })).toBe(true);
    expect(ev("REGEX([name], '^a')", { name: 'Alpha' }, csEnv)).toBe(false);
    expect(ev("REGEX([name], '^a', 'i')", { name: 'Alpha' }, csEnv)).toBe(true);
    expect(ev("REGEX([name], '^a', '')", { name: 'Alpha' })).toBe(false);
    expect(ev("REGEX([name], '[0-9]{3}$')", { name: 'ab123' })).toBe(true);
    expect(ev("REGEX([name], '^a')", { name: null })).toBe(false);
    expect(() => ev("REGEX([name], '(')", { name: 'x' })).toThrow(EvaluationError);
    try {
      ev("REGEX([name], '(')", { name: 'x' });
    } catch (e) {
      expect(e).toBeInstanceOf(EvaluationError);
      expect((e as EvaluationError).start).toBe(0);
      expect((e as EvaluationError).message).toMatch(/Invalid regular expression/);
    }
  });
  it('IS_HOLIDAY / IS_WORKDAY use the env calendar and default to today', () => {
    const cal = createEnv({ now: () => NOW, isHoliday: (d) => d.getMonth() === 8 && d.getDate() === 7 });
    expect(ev('IS_HOLIDAY()', {}, cal)).toBe(false);
    expect(ev("IS_HOLIDAY(DATE('2026-09-07'))", {}, cal)).toBe(true);
    expect(ev('IS_HOLIDAY([d])', { d: local(2026, 9, 7) }, env)).toBe(false); // no calendar configured
    expect(ev('IS_WORKDAY()', {}, cal)).toBe(false); // Saturday
    expect(ev("IS_WORKDAY(DATE('2026-09-07'))", {}, cal)).toBe(false); // holiday
    expect(ev("IS_WORKDAY(DATE('2026-09-08'))", {}, cal)).toBe(true);
    expect(ev('IS_WORKDAY(ADD_DAYS(CURRENT_DAY(), 2))', {}, env)).toBe(true);
    const sunWork = createEnv({ now: () => NOW, workDays: [0, 6] });
    expect(ev('IS_WORKDAY()', {}, sunWork)).toBe(true);
    expect(ev('IS_WORKDAY([d])', { d: '' })).toBe(false);
    expect(ev('IS_HOLIDAY([d])', { d: 'not a date' }, cal)).toBe(false);
  });
});

describe('numeric functions', () => {
  it('ADD / SUB / MUL / DIV / MOD / POW coerce and propagate blanks', () => {
    expect(ev('ADD([a], [b])', { a: 1, b: '2' })).toBe(3);
    expect(ev("ADD([a], '1K')", { a: 1 })).toBe(1001);
    expect(ev('SUB([a], [b])', { a: 5, b: 7 })).toBe(-2);
    expect(ev('MUL([a], [b])', { a: 2.5, b: 4 })).toBe(10);
    expect(ev('DIV([a], [b])', { a: 9, b: 3 })).toBe(3);
    expect(ev('DIV([a], 0)', { a: 9 })).toBeUndefined();
    expect(ev('MOD(10, 3)')).toBe(1);
    expect(ev('MOD(10, 0)')).toBeUndefined();
    expect(ev('POW(2, 10)')).toBe(1024);
    expect(ev('ADD([a], 1)', { a: null })).toBeUndefined();
    expect(ev('MUL([a], 1)', { a: 'abc' })).toBeUndefined();
  });
  it('MIN / MAX / AVG are variadic per row and ignore blanks', () => {
    expect(ev('MIN([a], [b], [c])', { a: 3, b: '1', c: 2 })).toBe(1);
    expect(ev('MAX([a], [b], [c])', { a: 3, b: '1', c: 2 })).toBe(3);
    expect(ev('MIN([a], [b])', { a: undefined, b: 4 })).toBe(4);
    expect(ev('MAX([a], [b])', { a: null, b: '' })).toBeUndefined();
    expect(ev('MIN([BloombergBid],[MarkitBid]) > 50', { BloombergBid: 60, MarkitBid: 55 })).toBe(true);
    expect(ev('AVG([a], [b], [c])', { a: 1, b: 2, c: '' })).toBe(1.5);
    expect(ev('AVG([a], 3)', { a: 1 })).toBe(2);
    expect(ev('AVG([a], [b])', { a: null, b: null })).toBeUndefined();
  });
  it('ABS / CEILING / FLOOR / ROUND', () => {
    expect(ev('ABS([a])', { a: -2.5 })).toBe(2.5);
    expect(ev('CEILING([a])', { a: 1.2 })).toBe(2);
    expect(ev('FLOOR([a])', { a: -1.2 })).toBe(-2);
    expect(ev('ROUND([a])', { a: 2.5 })).toBe(3);
    expect(ev('ROUND([a])', { a: -2.5 })).toBe(-3);
    expect(ev('ROUND([a], 2)', { a: 1.005 })).toBe(1.01);
    expect(ev('ROUND([a], 1)', { a: 2.45 })).toBe(2.5);
    expect(ev('ROUND([a], -2)', { a: 1250 })).toBe(1300);
    expect(ev('ROUND([a], -3)', { a: 1234 })).toBe(1000);
    expect(ev('ROUND([a], 2)', { a: '3.14159' })).toBe(3.14);
    expect(ev('ROUND([a], 2)', { a: null })).toBeUndefined();
    expect(ev('ABS([a])', { a: 'x' })).toBeUndefined();
    expect(ev('FLOOR([a])', { a: '' })).toBeUndefined();
  });
});

describe('date functions', () => {
  it('DATE parses text, numbers and (year, month, day)', () => {
    expect(ev("DATE('2026-01-15')")).toEqual(local(2026, 1, 15));
    expect(ev('DATE(2026, 9, 5)')).toEqual(local(2026, 9, 5));
    expect(ev('DATE(2026, 9)')).toEqual(local(2026, 9, 1));
    expect(ev('DATE([t])', { t: local(2026, 3, 1).getTime() })).toEqual(local(2026, 3, 1));
    expect(ev('DATE([d])', { d: '' })).toBeUndefined();
    expect(ev('DATE([d])', { d: 'nope' })).toBeUndefined();
    expect(ev('DATE([y], 1, 1)', { y: null })).toBeUndefined();
  });
  it('NOW / CURRENT_DAY come from env.now()', () => {
    expect(ev('NOW()')).toEqual(NOW);
    expect(ev('CURRENT_DAY()')).toEqual(local(2026, 9, 5));
    expect(ev('NOW() > CURRENT_DAY()')).toBe(true);
  });
  it('DAY / WEEK / MONTH / YEAR', () => {
    expect(ev('DAY(NOW())')).toBe(5);
    expect(ev('MONTH(NOW())')).toBe(9);
    expect(ev('YEAR(NOW())')).toBe(2026);
    expect(ev('WEEK(NOW())')).toBe(36);
    expect(ev("WEEK(DATE('2026-01-01'))")).toBe(1);
    expect(ev("WEEK(DATE('2024-12-30'))")).toBe(1); // Monday of ISO week 1 of 2025
    expect(ev("WEEK(DATE('2021-01-03'))")).toBe(53); // still ISO week 53 of 2020
    expect(ev('MONTH([d])', { d: '2026-12-25' })).toBe(12);
    expect(ev('YEAR([d])', { d: null })).toBeUndefined();
    expect(ev('DAY([d])', { d: 'x' })).toBeUndefined();
  });
  it('ADD_DAYS / ADD_WEEKS / ADD_MONTHS / ADD_YEARS (month arithmetic clamps)', () => {
    expect(ev('ADD_DAYS(CURRENT_DAY(), 5)')).toEqual(local(2026, 9, 10));
    expect(ev('ADD_DAYS(CURRENT_DAY(), -5)')).toEqual(local(2026, 8, 31));
    expect(ev('ADD_WEEKS(CURRENT_DAY(), 2)')).toEqual(local(2026, 9, 19));
    expect(ev("ADD_MONTHS(DATE('2026-01-31'), 1)")).toEqual(local(2026, 2, 28));
    expect(ev("ADD_MONTHS(DATE('2026-01-31'), -2)")).toEqual(local(2025, 11, 30));
    expect(ev("ADD_MONTHS(DATE('2026-11-15'), 3)")).toEqual(local(2027, 2, 15));
    expect(ev("ADD_YEARS(DATE('2024-02-29'), 1)")).toEqual(local(2025, 2, 28));
    expect(ev('ADD_YEARS([d], 18) <= CURRENT_DAY()', { d: local(2008, 9, 5) })).toBe(true);
    expect(ev('ADD_YEARS([d], 18) <= CURRENT_DAY()', { d: local(2008, 9, 6) })).toBe(false);
    expect(ev('ADD_DAYS(NOW(), 1)')).toEqual(local(2026, 9, 6, 12, 0));
    expect(ev('ADD_DAYS([d], 1)', { d: null })).toBeUndefined();
    expect(ev('ADD_DAYS(NOW(), [n])', { n: '' })).toBeUndefined();
  });
  it('DIFF_DAYS / DIFF_WEEKS / DIFF_MONTHS / DIFF_YEARS are a − b in whole units', () => {
    expect(ev("DIFF_DAYS(DATE('2026-09-10'), CURRENT_DAY())")).toBe(5);
    expect(ev("DIFF_DAYS(CURRENT_DAY(), DATE('2026-09-10'))")).toBe(-5);
    expect(ev('DIFF_DAYS(NOW(), CURRENT_DAY())')).toBe(0); // time of day ignored
    expect(ev('DIFF_DAYS([a], [b])', { a: local(2026, 9, 6, 0, 1), b: local(2026, 9, 5, 23, 59) })).toBe(1);
    expect(ev('DIFF_WEEKS(ADD_DAYS(CURRENT_DAY(), 15), CURRENT_DAY())')).toBe(2);
    expect(ev("DIFF_MONTHS(CURRENT_DAY(), DATE('2026-03-06'))")).toBe(5);
    expect(ev("DIFF_MONTHS(CURRENT_DAY(), DATE('2026-03-05'))")).toBe(6);
    expect(ev("DIFF_MONTHS(DATE('2026-03-06'), CURRENT_DAY())")).toBe(-5);
    expect(ev('DIFF_YEARS(CURRENT_DAY(), [BirthDate])', { BirthDate: '1990-09-06' })).toBe(35);
    expect(ev('DIFF_YEARS(CURRENT_DAY(), [BirthDate])', { BirthDate: '1990-09-05' })).toBe(36);
    expect(ev('DIFF_YEARS(CURRENT_DAY(), [BirthDate])', { BirthDate: null })).toBeUndefined();
    expect(ev('DIFF_DAYS([a], [b])', { a: 'x', b: local(2026, 1, 1) })).toBeUndefined();
  });
});

describe('string functions', () => {
  it('SUB_STRING is 0-based with an exclusive end', () => {
    expect(ev('SUB_STRING([s], 1, 3)', { s: 'hello' })).toBe('el');
    expect(ev('SUB_STRING([s], 2)', { s: 'hello' })).toBe('llo');
    expect(ev('SUB_STRING([s], 0, 2)', { s: 12345 })).toBe('12');
    expect(ev('SUB_STRING([s], 0, 2)', { s: null })).toBeUndefined();
    expect(ev('SUB_STRING([s], [n])', { s: 'abc', n: '' })).toBeUndefined();
  });
  it('REPLACE replaces every occurrence per the case setting', () => {
    expect(ev("REPLACE([s], 'foo', 'bar')", { s: 'Foo foo' })).toBe('bar bar');
    expect(ev("REPLACE([s], 'foo', 'bar')", { s: 'Foo foo' }, csEnv)).toBe('Foo bar');
    expect(ev("REPLACE([s], '.', '-')", { s: 'a.b.c' })).toBe('a-b-c');
    expect(ev("REPLACE([s], 'a', '$&$&')", { s: 'a' })).toBe('$&$&');
    expect(ev("REPLACE([s], '', 'x')", { s: 'abc' })).toBe('abc');
    expect(ev("REPLACE([s], 'a', 'b')", { s: undefined })).toBeUndefined();
  });
  it('LEN / UPPER / LOWER / TRIM / TO_STRING', () => {
    expect(ev('LEN([s])', { s: 'hello' })).toBe(5);
    expect(ev('LEN([s])', { s: '' })).toBe(0);
    expect(ev('LEN([s])', { s: null })).toBeUndefined();
    expect(ev('UPPER([s])', { s: 'usd' })).toBe('USD');
    expect(ev('LOWER([s])', { s: 'USD' })).toBe('usd');
    expect(ev('UPPER([s])', { s: undefined })).toBeUndefined();
    expect(ev('TRIM([s])', { s: '  a b  ' })).toBe('a b');
    expect(ev("TRIM([s]) = ''", { s: '   ' })).toBe(true);
    expect(ev('TO_STRING([n])', { n: 12.5 })).toBe('12.5');
    expect(ev('TO_STRING([n])', { n: [1, 'a'] })).toBe('1, a');
    expect(ev('TO_STRING([n])', { n: null })).toBeUndefined();
  });
  it('CONCAT joins values, treating blanks as empty text', () => {
    expect(ev("CONCAT([a], ' ', [b])", { a: 'John', b: 'Smith' })).toBe('John Smith');
    expect(ev("CONCAT([a], '-', [b])", { a: 'x', b: null })).toBe('x-');
    expect(ev('CONCAT([a], [b])', { a: 1, b: 2 })).toBe('12');
    expect(ev('CONCAT([a])', { a: undefined })).toBe('');
  });
  it('PAD_START / PAD_END', () => {
    expect(ev("PAD_START([s], 5, '0')", { s: '42' })).toBe('00042');
    expect(ev('PAD_START([s], 4)', { s: 'ab' })).toBe('  ab');
    expect(ev("PAD_END([s], 5, '.')", { s: 'ab' })).toBe('ab...');
    expect(ev('PAD_END([s], 1)', { s: 'abc' })).toBe('abc');
    expect(ev('PAD_START([s], 3)', { s: null })).toBeUndefined();
    expect(ev('PAD_END([s], [n])', { s: 'a', n: null })).toBeUndefined();
  });
});

describe('misc functions', () => {
  it('COALESCE returns the first non-blank value without evaluating the rest', () => {
    expect(ev('COALESCE([a], [b], 0)', { a: null, b: '' })).toBe(0);
    expect(ev('COALESCE([a], [b], 0)', { a: undefined, b: 'x' })).toBe('x');
    expect(ev('COALESCE([a], [b])', { a: null, b: null })).toBeUndefined();
    expect(ev("COALESCE([a], VAR('missing'))", { a: 1 })).toBe(1);
  });
  it('TO_ARRAY / NULL / IF / TYPE_OF', () => {
    expect(ev('TO_ARRAY([a], 2, [b])', { a: 1, b: 'x' })).toEqual([1, 2, 'x']);
    expect(ev('TO_ARRAY()')).toEqual([]);
    // NULL is a keyword the parser folds to a literal; the registry entry exists for palettes and hosts.
    expect(
      env.functions.get('NULL')!.impl!([], { row: row({}), env, span: { start: 0, end: 0 } }),
    ).toBeNull();
    expect(ev('[a] = NULL', { a: undefined })).toBe(true);
    expect(ev("IF([n] > 100, 'Big', 'Small')", { n: 101 })).toBe('Big');
    expect(ev("IF([n] > 100, 'Big', 'Small')", { n: 5 })).toBe('Small');
    expect(ev("IF([n] > 100, 'Big')", { n: 5 })).toBeUndefined();
    expect(ev("IF([n] > 100, 'Big', VAR('missing'))", { n: 101 })).toBe('Big');
    expect(ev('IF([n], 1, 2)', { n: null })).toBe(2);
    expect(ev('TYPE_OF([v])', { v: 1 })).toBe('number');
    expect(ev('TYPE_OF([v])', { v: 'a' })).toBe('text');
    expect(ev('TYPE_OF([v])', { v: true })).toBe('boolean');
    expect(ev('TYPE_OF([v])', { v: NOW })).toBe('date');
    expect(ev('TYPE_OF([v])', { v: [1] })).toBe('array');
    expect(ev('TYPE_OF([v])', { v: { a: 1 } })).toBe('object');
    expect(ev('TYPE_OF([v])', { v: null })).toBe('null');
  });
});

describe('relative-change functions', () => {
  const changed = (oldValue: Value, newValue: Value, columnId = 'price'): Partial<RowContext> => ({
    change: { columnId, oldValue, newValue },
  });
  const data = { price: 90, qty: 5, other: 90 };
  it('ANY_CHANGE detects a change for the referenced column, or any column', () => {
    expect(ev('ANY_CHANGE([price])', data, env, changed(100, 90))).toBe(true);
    expect(ev('ANY_CHANGE([qty])', data, env, changed(100, 90))).toBe(false);
    expect(ev('ANY_CHANGE()', data, env, changed(100, 90))).toBe(true);
    expect(ev('ANY_CHANGE()', data, env, changed(90, 90))).toBe(false);
    expect(ev('ANY_CHANGE([price])', data, env, changed('90', 90))).toBe(false);
    expect(ev('ANY_CHANGE([price])', data)).toBe(false);
    expect(ev('ANY_CHANGE([price])', data, env, changed(null, 90))).toBe(true);
    expect(ev('ANY_CHANGE([price])', data, env, changed(undefined, null, 'price'))).toBe(false);
  });
  it('ABSOLUTE_CHANGE honours direction and is blank without a change', () => {
    expect(ev('ABSOLUTE_CHANGE([price])', data, env, changed(100, 90))).toBe(10);
    expect(ev("ABSOLUTE_CHANGE([price], 'DECREASE')", data, env, changed(100, 90))).toBe(10);
    expect(ev("ABSOLUTE_CHANGE([price], 'INCREASE')", data, env, changed(100, 90))).toBeUndefined();
    expect(ev("ABSOLUTE_CHANGE([price], 'increase')", data, env, changed(80, 90))).toBe(10);
    expect(ev("ABSOLUTE_CHANGE([price], 'INCREASE') > 10", data, env, changed(70, 90))).toBe(true);
    expect(ev("ABSOLUTE_CHANGE([price], 'INCREASE') > 10", data, env, changed(85, 90))).toBe(false);
    expect(ev('ABSOLUTE_CHANGE([qty])', data, env, changed(100, 90))).toBeUndefined();
    expect(ev('ABSOLUTE_CHANGE()', data, env, changed('5', '7.5'))).toBe(2.5);
    expect(ev("ABSOLUTE_CHANGE('DECREASE')", data, env, changed(100, 90))).toBe(10);
    expect(ev('ABSOLUTE_CHANGE([price])', data)).toBeUndefined();
    expect(ev('ABSOLUTE_CHANGE([price])', data, env, changed('abc', 90))).toBeUndefined();
    expect(ev('ABSOLUTE_CHANGE([price])', data, env, changed(null, 90))).toBeUndefined();
  });
  it('PERCENT_CHANGE is relative to the old value and blank when the old value is zero', () => {
    expect(ev('PERCENT_CHANGE([price])', data, env, changed(100, 90))).toBe(10);
    expect(ev("PERCENT_CHANGE([price], 'DECREASE') = 10", data, env, changed(100, 90))).toBe(true);
    expect(ev("PERCENT_CHANGE([price], 'INCREASE')", data, env, changed(100, 90))).toBeUndefined();
    expect(ev("PERCENT_CHANGE([price], 'INCREASE')", data, env, changed(60, 90))).toBe(50);
    expect(ev('PERCENT_CHANGE([price])', data, env, changed(-100, 90))).toBe(190);
    expect(ev('PERCENT_CHANGE([price])', data, env, changed(0, 90))).toBeUndefined();
    expect(ev('PERCENT_CHANGE([price])', data)).toBeUndefined();
    expect(ev('PERCENT_CHANGE([qty])', data, env, changed(100, 90))).toBeUndefined();
  });
});

describe('advanced functions', () => {
  const vars: Record<string, Value> = { LIMIT: 1000, EMPTY: null };
  const queries: Record<string, string> = {
    Big: '[price] > 1000',
    'Big Orders': "QUERY('Big') AND [qty] > 10",
    Self: "QUERY('Self')",
    A: "QUERY('B')",
    B: "[price] > 0 OR QUERY('A')",
    Broken: '[price] >',
    Aggregated: 'SUM([price]) > 1',
  };
  const adv = createEnv({
    now: () => NOW,
    variables: (name, arg) => (name === 'THRESHOLD' ? (arg === 'USD' ? 100 : 200) : vars[name]),
    namedQuery: (name) => queries[name],
  });
  it('VAR reads host variables and rejects unknown ones', () => {
    expect(ev("VAR('LIMIT')", {}, adv)).toBe(1000);
    expect(ev("[n] > VAR('LIMIT')", { n: 1500 }, adv)).toBe(true);
    expect(ev("VAR('THRESHOLD', [ccy])", { ccy: 'USD' }, adv)).toBe(100);
    expect(ev("VAR('THRESHOLD', [ccy])", { ccy: 'GBP' }, adv)).toBe(200);
    expect(ev("VAR('EMPTY')", {}, adv)).toBeNull();
    expect(() => ev("VAR('NOPE')", {}, adv)).toThrow(/Unknown variable NOPE/);
    expect(() => ev("VAR('LIMIT')", {}, env)).toThrow(EvaluationError);
  });
  it('QUERY evaluates named queries against the row, nests, caches and guards recursion', () => {
    expect(ev("QUERY('Big')", { price: 1500 }, adv)).toBe(true);
    expect(ev("QUERY('Big')", { price: 5 }, adv)).toBe(false);
    expect(ev("QUERY('Big Orders') AND [ccy] = 'usd'", { price: 1500, qty: 11, ccy: 'USD' }, adv)).toBe(true);
    expect(ev("QUERY('Big Orders')", { price: 1500, qty: 1 }, adv)).toBe(false);
    expect(() => ev("QUERY('Self')", {}, adv)).toThrow(/Named query Self references itself/);
    expect(ev("QUERY('A')", { price: 1 }, adv)).toBe(true); // B short-circuits before recursing
    expect(() => ev("QUERY('A')", { price: -1 }, adv)).toThrow(/Named query A references itself/);
    expect(() => ev("QUERY('Nope')", {}, adv)).toThrow(/Unknown named query Nope/);
    expect(() => ev("QUERY('Broken')", {}, adv)).toThrow(EvaluationError);
    expect(() => ev("QUERY('Aggregated')", {}, adv)).toThrow(/Named query Aggregated/);
    expect(() => ev("QUERY('Big')", {}, env)).toThrow(EvaluationError);
    // the recursion guard unwinds after a failure
    expect(ev("QUERY('Big')", { price: 1500 }, adv)).toBe(true);
  });
});
