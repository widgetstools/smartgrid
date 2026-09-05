import { z } from 'zod';
import { withEditor } from '../meta.js';
import { Duration, ObjectMeta } from '../primitives/common.js';
import { Rule } from '../primitives/rule.js';
import { ColumnGroupScope, Scope } from '../primitives/scope.js';
import { Style } from '../primitives/style.js';

/**
 * Flashing cells: a temporary (or permanent) style applied to a cell or its
 * row when a data change satisfies the rule. Numeric and date columns flash
 * up or down by direction; other types use the neutral style. Flash styles
 * have the highest precedence of all styles.
 */
export const FlashingCell = withEditor(
  ObjectMeta.extend({
    scope: Scope,
    rule: Rule.optional().describe('Omit to flash on any change'),
    target: z.enum(['cell', 'row']).default('cell'),
    duration: Duration.default(500),
    upStyle: Style.optional(),
    downStyle: Style.optional(),
    neutralStyle: Style.optional(),
    columnGroupScope: ColumnGroupScope,
  }),
  { 'x-editor': 'flashing', title: 'Flashing cell' },
);
export type FlashingCell = z.infer<typeof FlashingCell>;

export const FlashingDefaults = z.object({
  duration: Duration.default(500),
  upStyle: Style.prefault({ backColor: { light: '#d1fae5', dark: '#064e3b' } }),
  downStyle: Style.prefault({ backColor: { light: '#fee2e2', dark: '#7f1d1d' } }),
  neutralStyle: Style.prefault({ backColor: { light: '#e5e7eb', dark: '#374151' } }),
});
export type FlashingDefaults = z.infer<typeof FlashingDefaults>;

export const FlashingModule = z.object({
  flashingCells: z.array(FlashingCell).default([]),
  defaults: FlashingDefaults.prefault({}),
});
export type FlashingModule = z.infer<typeof FlashingModule>;

export const FLASHING_MODULE_VERSION = 1;
