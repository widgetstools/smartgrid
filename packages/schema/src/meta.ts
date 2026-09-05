import type { z } from 'zod';

/**
 * Editor hints. Every schema fragment that a user can edit carries one of these
 * as `x-editor` metadata. `packages/forms` and the assistant's tool UIs resolve
 * the hint through the `EditorRegistry` in `packages/editors`, so this list is
 * the single contract between schemas and components.
 *
 * Keep in sync with docs/ui-components-plan.md §2.
 */
export const EDITOR_HINTS = [
  // value editors
  'color',
  'themeColor',
  'border',
  'fontStyle',
  'alignment',
  'style',
  'displayFormat',
  'expression',
  'predicate',
  'rule',
  'scope',
  'rowScope',
  'column',
  'columns',
  'columnType',
  'icon',
  'image',
  'number',
  'range',
  'schedule',
  'keys',
  'duration',
  'values',
  'density',
  'text',
  'boolean',
  'enum',
  // composites
  'formatColumn',
  'styledColumn',
  'flashing',
  'calculatedColumn',
  'alert',
  'columnFilter',
  'gridFilter',
  'layout',
  'report',
  'nudge',
  'shortcut',
  'cellRendererConfig',
  'namedQuery',
  'quickSearch',
  // structural
  'list',
  'object',
] as const;

export type EditorHint = (typeof EDITOR_HINTS)[number];

export interface EditorMeta {
  /** Which editor renders this fragment. */
  'x-editor': EditorHint;
  /** Short label for forms and diff cards. */
  title?: string;
  /** Longer help text; also sent to the LLM as the property description. */
  description?: string;
  /** Extra, editor-specific options (e.g. `{ dataTypes: ['number'] }` for a column picker). */
  'x-editor-options'?: Record<string, unknown>;
  /** Group name for form layout; editors with the same group render together. */
  'x-group'?: string;
  /** Ordering weight inside a group. */
  'x-order'?: number;
}

/**
 * Attach editor metadata to a schema. Thin wrapper over Zod 4's `.meta()` so
 * call sites stay short and the hint is type-checked.
 */
export function withEditor<T extends z.ZodTypeAny>(schema: T, meta: EditorMeta): T {
  return schema.meta(meta as unknown as Record<string, unknown>) as T;
}
