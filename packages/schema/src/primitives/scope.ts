import { z } from 'zod';
import { withEditor } from '../meta.js';
import { CellDataType } from './column.js';

/**
 * Column scope: which columns an object applies to. Exactly one form.
 * Mirrors AdapTable's ColumnScope (All | DataTypes | ColumnIds | ColumnTypes).
 * `dataTypes` and `columnIds` may be combined, as AdapTable allows.
 */
export const Scope = withEditor(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }),
    z.object({
      kind: z.literal('columns'),
      columnIds: z.array(z.string().min(1)).min(1),
    }),
    z.object({
      kind: z.literal('dataTypes'),
      dataTypes: z.array(CellDataType).min(1),
      columnIds: z.array(z.string().min(1)).default([]).describe('Extra columns included regardless of type'),
    }),
    z.object({
      kind: z.literal('columnTypes'),
      columnTypes: z.array(z.string().min(1)).min(1),
    }),
  ]),
  {
    'x-editor': 'scope',
    title: 'Applies to',
    description: 'All columns, specific columns, all columns of a data type, or columns of a type',
  },
);
export type Scope = z.infer<typeof Scope>;

export const scopeAll = (): Scope => ({ kind: 'all' });
export const scopeColumns = (...columnIds: string[]): Scope => ({ kind: 'columns', columnIds });
export const scopeDataTypes = (...dataTypes: CellDataType[]): Scope => ({ kind: 'dataTypes', dataTypes, columnIds: [] });

/**
 * Row scope: which row kinds render the object. All included by default.
 * Mirrors AdapTable's RowScope exclusions.
 */
export const RowScope = withEditor(
  z.object({
    excludeDataRows: z.boolean().default(false),
    excludeGroupRows: z.boolean().default(false),
    excludeSummaryRows: z.boolean().default(false).describe('Pinned row summaries'),
    excludeTotalRows: z.boolean().default(false).describe('Grand total rows'),
  }),
  { 'x-editor': 'rowScope', title: 'Row kinds' },
);
export type RowScope = z.infer<typeof RowScope>;

/** Column-group state an object applies in. */
export const ColumnGroupScope = z.enum(['both', 'expanded', 'collapsed']).default('both');
export type ColumnGroupScope = z.infer<typeof ColumnGroupScope>;
