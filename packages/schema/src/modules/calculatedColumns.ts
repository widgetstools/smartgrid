import { z } from 'zod';
import { withEditor } from '../meta.js';
import { CellDataType } from '../primitives/column.js';
import { ObjectMeta } from '../primitives/common.js';
import { AggregatedScalarExpression, ScalarExpression } from '../primitives/expression.js';

/**
 * A calculated column: a virtual column whose values come from an
 * expression. Standard (per-row) expressions reference other cells in the
 * same row; aggregated expressions (`SUM(…, GROUP_BY(…))`, `CUMUL`, `QUANT`)
 * are evaluated across the row set and refreshed when data changes.
 * Calculated columns may reference other calculated columns; the engine
 * orders them by dependency.
 */
export const CalculatedColumnExpression = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scalar'), expression: ScalarExpression }),
  z.object({ kind: z.literal('aggregated'), expression: AggregatedScalarExpression }),
]);
export type CalculatedColumnExpression = z.infer<typeof CalculatedColumnExpression>;

export const CalculatedColumnSettings = z.object({
  width: z.number().int().min(10).max(4000).optional(),
  filterable: z.boolean().default(true),
  sortable: z.boolean().default(true),
  groupable: z.boolean().default(false),
  pivotable: z.boolean().default(false),
  aggregatable: z.boolean().default(false),
  resizable: z.boolean().default(true),
  suppressMenu: z.boolean().default(false),
  suppressMovable: z.boolean().default(false),
  columnTypes: z.array(z.string()).default([]).describe('Custom AG Grid column types'),
  headerTooltip: z.string().optional(),
  showExpressionTooltip: z.boolean().default(false).describe('Show the expression as the cell tooltip'),
});
export type CalculatedColumnSettings = z.infer<typeof CalculatedColumnSettings>;

export const CalculatedColumn = withEditor(
  ObjectMeta.extend({
    columnId: z
      .string()
      .regex(/^[A-Za-z_][\w-]*$/, 'Column id: letters, digits, _ and -')
      .describe('Unique id; also the AG Grid colId'),
    header: z.string().min(1).max(120).optional().describe('Header caption; defaults to the name'),
    expression: CalculatedColumnExpression,
    dataType: CellDataType.default('number'),
    settings: CalculatedColumnSettings.prefault({}),
  }),
  { 'x-editor': 'calculatedColumn', title: 'Calculated column' },
);
export type CalculatedColumn = z.infer<typeof CalculatedColumn>;

export const CalculatedColumnsModule = z
  .object({
    calculatedColumns: z.array(CalculatedColumn).default([]),
  })
  .refine((m) => new Set(m.calculatedColumns.map((c) => c.columnId)).size === m.calculatedColumns.length, {
    message: 'Calculated column ids must be unique',
    path: ['calculatedColumns'],
  });
export type CalculatedColumnsModule = z.infer<typeof CalculatedColumnsModule>;

export const CALCULATED_COLUMNS_MODULE_VERSION = 1;
