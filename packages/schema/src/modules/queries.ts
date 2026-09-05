import { z } from 'zod';
import { withEditor } from '../meta.js';
import { ObjectMeta } from '../primitives/common.js';
import { BooleanExpression } from '../primitives/expression.js';
import { Style } from '../primitives/style.js';

/**
 * Named queries: saved boolean expressions reusable anywhere an expression
 * is accepted through `QUERY('Name')` (grid filters, format column rules,
 * alerts). Names are the reference key, so they must be unique.
 */
export const NamedQuery = withEditor(
  ObjectMeta.extend({
    expression: BooleanExpression,
  }),
  { 'x-editor': 'namedQuery', title: 'Named query' },
);
export type NamedQuery = z.infer<typeof NamedQuery>;

/**
 * Quick search: a text searched across every visible column. `highlight`
 * styles matching cells, `filter` hides non-matching rows, `both` does both.
 */
export const QuickSearch = withEditor(
  z.object({
    text: z.string().max(200).default(''),
    mode: z.enum(['highlight', 'filter', 'both']).default('highlight'),
    style: Style.prefault({ backColor: { light: '#fef08a', dark: '#713f12' } }),
    caseSensitive: z.boolean().default(false),
  }),
  { 'x-editor': 'quickSearch', title: 'Quick search' },
);
export type QuickSearch = z.infer<typeof QuickSearch>;

export const QueriesModule = z
  .object({
    namedQueries: z.array(NamedQuery).default([]),
    quickSearch: QuickSearch.prefault({}),
  })
  .refine((m) => new Set(m.namedQueries.map((q) => q.name.toLowerCase())).size === m.namedQueries.length, {
    message: 'Named query names must be unique',
    path: ['namedQueries'],
  });
export type QueriesModule = z.infer<typeof QueriesModule>;

export const QUERIES_MODULE_VERSION = 1;
