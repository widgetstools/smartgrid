import { describe, expect, it } from 'vitest';
import { validatePatch, modulesTouched } from './validator.js';
import { COLUMNS, fixtureConfig } from './test/fixtures.js';

const meta = { enabled: true, readOnly: false, tags: [], source: 'assistant' };

describe('validatePatch', () => {
  it('accepts a valid layout change and returns the next document', () => {
    const cfg = fixtureConfig();
    const v = validatePatch(
      cfg,
      [
        { op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: ['desk', 'book'] },
        { op: 'add', path: '/modules/layout/data/layouts/0/columnPinning/notional', value: 'right' },
      ],
      COLUMNS,
    );
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.modules).toEqual(['layout']);
    expect(v.next?.modules.layout?.data.layouts[0]?.rowGroupColumns).toEqual(['desk', 'book']);
    // The input document is untouched.
    expect(cfg.modules.layout?.data.layouts[0]?.rowGroupColumns).toEqual([]);
  });

  it('rejects paths outside module data', () => {
    const v = validatePatch(fixtureConfig(), [{ op: 'replace', path: '/gridId', value: 'x' }], COLUMNS);
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.message).toMatch(/only change module data/);
  });

  it('rejects an empty patch', () => {
    expect(validatePatch(fixtureConfig(), [], COLUMNS).ok).toBe(false);
  });

  it('reports unresolvable paths with a hint', () => {
    const v = validatePatch(
      fixtureConfig(),
      [{ op: 'replace', path: '/modules/layout/data/layouts/7/rowGroupColumns', value: ['desk'] }],
      COLUMNS,
    );
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.message).toMatch(/does not exist/);
    expect(v.errors[0]?.path).toBe('/modules/layout/data/layouts/7/rowGroupColumns');
  });

  it('surfaces schema issues with a module pointer', () => {
    const v = validatePatch(
      fixtureConfig(),
      [{ op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: 'desk' }],
      COLUMNS,
    );
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.path).toBe('/modules/layout/data/layouts/0/rowGroupColumns');
  });

  it('flags unknown column ids and suggests the id when a header was used', () => {
    const v = validatePatch(
      fixtureConfig(),
      [{ op: 'replace', path: '/modules/layout/data/layouts/0/rowGroupColumns', value: ['Desk', 'trader'] }],
      COLUMNS,
    );
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/use the column id "desk"/),
      expect.stringMatching(/Unknown column "trader"/),
    ]);
    expect(v.errors[0]?.path).toBe('/modules/layout/data/layouts/0/rowGroupColumns/0');
  });

  it('runs the engine so invalid expressions become errors', () => {
    const v = validatePatch(
      fixtureConfig(),
      [
        {
          op: 'add',
          path: '/modules/formatting/data/formatColumns/-',
          value: {
            id: 'fc1',
            name: 'Bad rule',
            ...meta,
            scope: { kind: 'columns', columnIds: ['pnl'] },
            target: 'cell',
            columnGroupScope: 'both',
            rule: { kind: 'expression', expression: '[pnl] > ' },
            style: { foreColor: 'red' },
          },
        },
      ],
      COLUMNS,
    );
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.path).toBe('/modules/formatting/data/formatColumns/-');
  });

  it('accepts a valid format column with a predicate rule', () => {
    const v = validatePatch(
      fixtureConfig(),
      [
        {
          op: 'add',
          path: '/modules/formatting/data/formatColumns/-',
          value: {
            id: 'fc1',
            name: 'Negative PnL',
            ...meta,
            scope: { kind: 'columns', columnIds: ['pnl'] },
            target: 'cell',
            columnGroupScope: 'both',
            rule: {
              kind: 'predicates',
              predicates: [{ predicateId: 'Negative', inputs: [] }],
              operator: 'AND',
            },
            style: { foreColor: 'var(--sg-negative)' },
          },
        },
      ],
      COLUMNS,
    );
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
});

describe('modulesTouched', () => {
  it('lists the modules a patch addresses', () => {
    expect(
      modulesTouched([
        { op: 'add', path: '/modules/flashing/data/flashingCells/-', value: {} },
        { op: 'remove', path: '/modules/layout/data/layouts/1' },
        { op: 'remove', path: '/modules/nope/data' },
      ]),
    ).toEqual(['flashing', 'layout']);
  });
});
