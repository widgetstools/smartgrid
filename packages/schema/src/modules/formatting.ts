import { z } from 'zod';
import { withEditor } from '../meta.js';
import { ObjectMeta } from '../primitives/common.js';
import { Scope, RowScope, ColumnGroupScope } from '../primitives/scope.js';
import { Rule } from '../primitives/rule.js';
import { Style } from '../primitives/style.js';
import { DisplayFormat } from '../primitives/displayFormat.js';

/**
 * A format column: conditional style and/or display format applied to cells or
 * headers in a scope. Order in the module array is precedence (earlier wins on
 * conflicting style properties; the highest-precedence display format wins
 * outright).
 */
export const FormatColumn = withEditor(
  ObjectMeta.extend({
    scope: Scope,
    target: z.enum(['cell', 'header']).default('cell'),
    rule: Rule.optional().describe('Omit to always apply'),
    style: Style.optional(),
    displayFormat: DisplayFormat.optional(),
    rowScope: RowScope.optional(),
    columnGroupScope: ColumnGroupScope,
  }).refine((fc) => fc.style !== undefined || fc.displayFormat !== undefined, {
    message: 'A format column needs a style or a display format',
  }),
  { 'x-editor': 'formatColumn', title: 'Format column' },
);
export type FormatColumn = z.infer<typeof FormatColumn>;

/** Edit-state styles applied by the engine when a cell is editable, read-only, or edited. */
export const EditStateStyles = z.object({
  editable: Style.optional(),
  readOnly: Style.optional(),
  edited: Style.optional(),
});

export const FormattingModule = z.object({
  formatColumns: z.array(FormatColumn).default([]),
  editStateStyles: EditStateStyles.default({}),
});
export type FormattingModule = z.infer<typeof FormattingModule>;

export const FORMATTING_MODULE_VERSION = 1;
