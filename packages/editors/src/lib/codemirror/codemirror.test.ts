import { describe, expect, it } from 'vitest';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type { ExpressionKind } from '@smartgrid/schema';
import { FIXTURE_COLUMNS, FIXTURE_CONTEXT } from '../../test/fixtures.js';
import { classify } from './language.js';
import { expressionCompletionSource, functionsForKind, keywordsForKind } from './completions.js';
import { diagnosticsFor, mergedDiagnostics } from './lint.js';

/** A host-provided function the system registry can never contain. */
const HOST_FUNCTION = {
  name: 'HOST_ONLY',
  category: 'custom',
  signature: 'HOST_ONLY([col])',
  description: 'Host function',
  kinds: ['boolean' as const],
};

const complete = async (doc: string, kind: ExpressionKind, explicit = false, pos = doc.length) => {
  const source = expressionCompletionSource({
    kind,
    columns: FIXTURE_COLUMNS,
    functions: [...FIXTURE_CONTEXT.functions, HOST_FUNCTION],
  });
  const state = EditorState.create({ doc });
  return (await source(new CompletionContext(state, pos, explicit))) as CompletionResult | null;
};
const labels = (r: CompletionResult | null) => (r?.options ?? []).map((o) => o.label);

describe('AdaptableQL tokenizer', () => {
  it('classifies every token class', () => {
    const src = "SUM([pnl]) > 'x' AND 1.5e3 <> foo, TRUE";
    expect(classify(src)).toEqual([
      { from: 0, to: 3, type: 'function' },
      { from: 3, to: 4, type: 'paren' },
      { from: 4, to: 9, type: 'column' },
      { from: 9, to: 10, type: 'paren' },
      { from: 11, to: 12, type: 'operator' },
      { from: 13, to: 16, type: 'string' },
      { from: 17, to: 20, type: 'keyword' },
      { from: 21, to: 26, type: 'number' },
      { from: 27, to: 29, type: 'operator' },
      { from: 30, to: 33, type: 'variableName' },
      { from: 33, to: 34, type: 'punctuation' },
      { from: 35, to: 39, type: 'keyword' },
    ]);
  });

  it('is case-insensitive for keywords and tolerates unterminated tokens', () => {
    expect(classify('and or Not case')).toEqual(
      ['and', 'or', 'Not', 'case'].map((w, i, all) => {
        const from = all.slice(0, i).join(' ').length + (i ? 1 : 0);
        return { from, to: from + w.length, type: 'keyword' };
      }),
    );
    expect(classify('[pnl')).toEqual([{ from: 0, to: 4, type: 'invalid' }]);
    expect(classify("'abc")).toEqual([{ from: 0, to: 4, type: 'invalid' }]);
    expect(classify('"a""b"')).toEqual([{ from: 0, to: 6, type: 'string' }]);
    expect(classify('x ]')).toEqual([
      { from: 0, to: 1, type: 'variableName' },
      { from: 2, to: 3, type: 'squareBracket' },
    ]);
  });
});

describe('completions', () => {
  it('offers columns inside [ matching on id and header', async () => {
    const r = await complete('[no', 'boolean');
    expect(labels(r)).toEqual(['notional']);
    expect(r?.options[0]).toMatchObject({ apply: '[notional]', detail: 'number' });
    expect(r?.from).toBe(0);
    expect(labels(await complete('[trade d', 'boolean'))).toEqual(['tradeDate']);
    expect(labels(await complete('1 + [', 'scalar'))).toHaveLength(FIXTURE_COLUMNS.length);
  });

  it('replaces the auto-closed bracket when completing inside []', async () => {
    const r = await complete('[pn]', 'boolean', false, 3);
    expect(labels(r)).toEqual(['pnl']);
    expect(r?.to).toBe(4);
  });

  it('filters functions by kind and merges context functions', async () => {
    const agg = labels(await complete('SU', 'aggregatedScalar'));
    expect(agg).toContain('SUM');
    expect(agg).not.toContain('HOST_ONLY');
    const bool = labels(await complete('SU', 'boolean'));
    expect(bool).not.toContain('SUM');
    expect(bool).toContain('HOST_ONLY');
    const host = (await complete('HO', 'boolean'))?.options.find((o) => o.label === 'HOST_ONLY');
    expect(host).toMatchObject({
      apply: 'HOST_ONLY(',
      detail: 'HOST_ONLY([col])',
      info: 'Host function',
      type: 'function',
    });
    const sum = functionsForKind('aggregatedBoolean').find((f) => f.name === 'SUM');
    expect(sum?.signature).toBe('SUM([col])');
    expect(sum?.description).toBeTruthy();
  });

  it('offers WHERE only for aggregated and observable kinds', async () => {
    expect(labels(await complete('WH', 'aggregatedScalar'))).toContain('WHERE');
    expect(labels(await complete('WH', 'aggregatedBoolean'))).toContain('WHERE');
    expect(labels(await complete('WH', 'observable'))).toContain('WHERE');
    expect(labels(await complete('WH', 'boolean'))).not.toContain('WHERE');
    expect(labels(await complete('WH', 'scalar'))).not.toContain('WHERE');
    expect(keywordsForKind('boolean')).toEqual(['AND', 'OR', 'NOT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END']);
    expect(labels(await complete('AN', 'boolean'))).toContain('AND');
  });

  it('activates implicitly after two identifier characters, explicitly always', async () => {
    expect(await complete('S', 'boolean')).toBeNull();
    expect(await complete('[pnl] > 1 ', 'boolean')).toBeNull();
    expect(labels(await complete('S', 'aggregatedScalar', true))).toContain('SUM');
    expect(labels(await complete('', 'aggregatedScalar', true))).toContain('SUM');
    expect((await complete('SU', 'aggregatedScalar'))?.from).toBe(0);
    expect((await complete('1 + SU', 'aggregatedScalar'))?.from).toBe(4);
  });
});

describe('diagnosticsFor', () => {
  it('reports unknown columns with their span', () => {
    const d = diagnosticsFor('[foo] > 1', 'boolean', FIXTURE_COLUMNS);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ from: 0, to: 5, severity: 'error' });
    expect(d[0]?.message).toMatch(/Unknown column \[foo\]/);
  });

  it('rejects aggregates in a per-row condition', () => {
    const d = diagnosticsFor('SUM([pnl]) > 1', 'boolean', FIXTURE_COLUMNS);
    expect(d.some((x) => x.severity === 'error' && /SUM/.test(x.message))).toBe(true);
    expect(d[0]).toMatchObject({ from: 0, to: 3 });
  });

  it('returns nothing for valid or empty text', () => {
    expect(diagnosticsFor('[pnl] < 0', 'boolean', FIXTURE_COLUMNS)).toEqual([]);
    expect(diagnosticsFor("[desk] = 'Rates' AND [notional] > 1e6", 'boolean', FIXTURE_COLUMNS)).toEqual([]);
    expect(diagnosticsFor('', 'boolean', FIXTURE_COLUMNS)).toEqual([]);
    expect(diagnosticsFor('   ', 'boolean', FIXTURE_COLUMNS)).toEqual([]);
  });

  it('maps warnings and clamps spans to the text', () => {
    const warn = diagnosticsFor('[pnl] * 2', 'aggregatedScalar', FIXTURE_COLUMNS);
    expect(warn.map((d) => d.severity)).toEqual(['warning']);
    const parse = diagnosticsFor('[pnl', 'boolean', FIXTURE_COLUMNS);
    expect(parse[0]).toMatchObject({ from: 0, to: 4, severity: 'error' });
    const merged = mergedDiagnostics('[pnl] <', {
      kind: 'boolean',
      columns: FIXTURE_COLUMNS,
      external: [
        { message: 'Unexpected end', start: 7, end: 99 },
        { message: 'Far away', start: 40 },
      ],
    });
    expect(merged.every((d) => d.from <= 7 && d.to <= 7)).toBe(true);
    expect(merged.map((d) => d.message)).toContain('Far away');
    expect(merged.filter((d) => d.message === 'Unexpected end')).toHaveLength(1);
  });
});
