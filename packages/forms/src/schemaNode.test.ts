import { describe, expect, it } from 'vitest';
import {
  defaultsFor,
  discriminatedOf,
  hintOf,
  kindOf,
  matchBranch,
  propertiesOf,
  resolveRef,
} from './schemaNode.js';
import { formatColumnJsonSchema, layoutJsonSchema } from './generated/index.js';

const has = () => true;

describe('schemaNode', () => {
  it('resolves $ref keeping sibling annotations', () => {
    const root = { $defs: { A: { type: 'string', title: 'From def' } } };
    expect(resolveRef({ $ref: '#/$defs/A', description: 'here' }, root)).toEqual({
      type: 'string',
      title: 'From def',
      description: 'here',
    });
  });

  it('classifies the format column schema', () => {
    const fc = formatColumnJsonSchema();
    const props = propertiesOf(fc);
    expect(hintOf(fc)).toBe('formatColumn');
    expect(kindOf(props['scope']!, fc, has)).toBe('editor');
    expect(kindOf(props['target']!, fc, has)).toBe('enum');
    expect(kindOf(props['tags']!, fc, has)).toBe('array');
    expect(kindOf(props['metadata']!, fc, has)).toBe('record');
    expect(kindOf(props['rule']!, fc, () => false)).toBe('discriminated');
  });

  it('finds the discriminator of the layout union', () => {
    const layout = layoutJsonSchema();
    const disc = discriminatedOf(layout, layout);
    expect(disc?.key).toBe('kind');
    expect(disc?.branches.map((b) => b.value)).toEqual(['table', 'pivot']);
  });

  it('builds defaults from required keys and declared defaults', () => {
    const fc = formatColumnJsonSchema();
    const d = defaultsFor(fc, fc) as Record<string, unknown>;
    expect(d['enabled']).toBe(true);
    expect(d['target']).toBe('cell');
    expect(d['tags']).toEqual([]);
    expect(d['scope']).toEqual({ kind: 'all' });
    expect(d['rule']).toBeUndefined();
    expect(d['style']).toBeUndefined();
  });

  it('layout defaults include nested defaults', () => {
    const layout = layoutJsonSchema();
    const d = defaultsFor(layout, layout) as Record<string, unknown>;
    expect(d['kind']).toBe('table');
    expect(d['rowSelection']).toMatchObject({ mode: 'none' });
    expect(d['columns']).toEqual([]);
  });

  it('matches union branches by value shape', () => {
    const layout = layoutJsonSchema();
    const table = propertiesOf(discriminatedOf(layout, layout)!.branches[0]!.node);
    const aggFunc = propertiesOf(table['aggregations']!['items'] as Record<string, unknown>)['aggFunc']!;
    const branches = aggFunc['anyOf'] as Record<string, unknown>[];
    expect(matchBranch(branches, 'sum', aggFunc)).toBe(0);
    expect(matchBranch(branches, { kind: 'weightedAverage', weightColumnId: 'x' }, aggFunc)).toBe(1);
    expect(matchBranch(branches, { kind: 'custom', name: 'x' }, aggFunc)).toBe(2);
  });
});
