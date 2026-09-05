import { describe, expect, it } from 'vitest';
import {
  Color,
  DisplayFormat,
  Icon,
  ObjectMeta,
  PREDICATE_ARITY,
  PREDICATE_IDS,
  Predicate,
  Rule,
  Schedule,
  Scope,
  Style,
  predicatesForDataType,
  scopeColumns,
  scopeDataTypes,
} from './index.js';

describe('ObjectMeta', () => {
  it('fills defaults', () => {
    const m = ObjectMeta.parse({ id: 'a', name: 'A' });
    expect(m).toMatchObject({ enabled: true, readOnly: false, tags: [], source: 'user' });
  });
  it('rejects empty names', () => {
    expect(ObjectMeta.safeParse({ id: 'a', name: '' }).success).toBe(false);
  });
});

describe('Scope', () => {
  it('accepts all four kinds', () => {
    expect(Scope.parse({ kind: 'all' })).toEqual({ kind: 'all' });
    expect(Scope.parse(scopeColumns('a', 'b'))).toEqual({ kind: 'columns', columnIds: ['a', 'b'] });
    expect(Scope.parse(scopeDataTypes('number'))).toEqual({
      kind: 'dataTypes',
      dataTypes: ['number'],
      columnIds: [],
    });
    expect(Scope.parse({ kind: 'columnTypes', columnTypes: ['calculatedColumn'] }).kind).toBe('columnTypes');
  });
  it('requires at least one column id', () => {
    expect(Scope.safeParse({ kind: 'columns', columnIds: [] }).success).toBe(false);
  });
});

describe('Predicate', () => {
  it('has an arity for every system predicate', () => {
    for (const id of PREDICATE_IDS) expect(PREDICATE_ARITY[id]).toBeDefined();
  });
  it('filters predicates by data type', () => {
    expect(predicatesForDataType('number')).toContain('GreaterThan');
    expect(predicatesForDataType('number')).not.toContain('Contains');
    expect(predicatesForDataType('date')).toContain('ThisQuarter');
    expect(predicatesForDataType('boolean')).toEqual([
      'Blanks',
      'NonBlanks',
      'In',
      'NotIn',
      'AnyChange',
      'True',
      'False',
    ]);
  });
  it('accepts custom predicate ids and a referenced column', () => {
    const p = Predicate.parse({ predicateId: 'my_custom', inputs: [3], columnId: 'other' });
    expect(p.columnId).toBe('other');
  });
});

describe('Rule', () => {
  it('accepts predicates with a default AND operator', () => {
    const r = Rule.parse({ kind: 'predicates', predicates: [{ predicateId: 'Positive' }] });
    expect(r).toMatchObject({ kind: 'predicates', operator: 'AND' });
  });
  it('accepts an expression', () => {
    expect(Rule.parse({ kind: 'expression', expression: '[pnl] < 0' }).kind).toBe('expression');
  });
  it('rejects an empty predicate list', () => {
    expect(Rule.safeParse({ kind: 'predicates', predicates: [] }).success).toBe(false);
  });
});

describe('Style and Color', () => {
  it('accepts hex, rgba, oklch, tokens and named colours', () => {
    for (const c of [
      '#fff',
      '#12345678',
      'rgba(1,2,3,.5)',
      'oklch(0.7 0.1 200)',
      'var(--sg-accent)',
      'red',
    ]) {
      expect(Color.safeParse(c).success, c).toBe(true);
    }
    expect(Color.safeParse('not a colour!').success).toBe(false);
  });
  it('accepts theme-aware colours and merges optional parts', () => {
    const s = Style.parse({
      foreColor: { light: '#000', dark: '#fff' },
      border: { bottom: { width: 2 }, radius: 4 },
      font: { weight: 'bold', size: 'sm' },
      alignment: { horizontal: 'right' },
    });
    expect(s.border?.bottom).toEqual({ width: 2, style: 'solid' });
  });
  it('rejects unsafe class names', () => {
    expect(Style.safeParse({ className: 'a b; drop' }).success).toBe(false);
  });
});

describe('DisplayFormat', () => {
  it('parses each kind', () => {
    expect(DisplayFormat.parse({ kind: 'number', preset: 'Dollar', fractionDigits: 2 }).kind).toBe('number');
    expect(DisplayFormat.parse({ kind: 'string', case: 'upper' }).kind).toBe('string');
    expect(DisplayFormat.parse({ kind: 'date', pattern: 'dd-MMM-yyyy' }).kind).toBe('date');
    expect(DisplayFormat.parse({ kind: 'template', template: '[value] ([rowData.ccy])' }).kind).toBe(
      'template',
    );
    expect(DisplayFormat.parse({ kind: 'excel', format: '#,##0.00' }).kind).toBe('excel');
    expect(DisplayFormat.parse({ kind: 'tick', denominator: '32' })).toMatchObject({ showPlus: false });
    expect(DisplayFormat.parse({ kind: 'custom', formatterId: 'x' }).kind).toBe('custom');
  });
});

describe('Icon and Schedule', () => {
  it('parses icon variants', () => {
    expect(Icon.parse({ kind: 'system', name: 'alert' }).kind).toBe('system');
    expect(Icon.parse({ kind: 'emoji', value: '🔥' }).kind).toBe('emoji');
  });
  it('validates cron shape', () => {
    expect(Schedule.safeParse({ kind: 'cron', cron: '30 9 * * 1-5' }).success).toBe(true);
    expect(Schedule.safeParse({ kind: 'cron', cron: 'every day' }).success).toBe(false);
    expect(Schedule.safeParse({ kind: 'once', runAt: '2026-10-01T09:30:00Z' }).success).toBe(true);
  });
});
