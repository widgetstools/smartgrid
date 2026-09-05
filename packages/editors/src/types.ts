import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { CellDataType, ColumnInfo, EditorHint, ExpressionKind } from '@smartgrid/schema';

/**
 * Where an editor is mounted. Behaviour is identical in every mode; only
 * density and chrome differ.
 *  - `inline`: chat diff cards, toolbar strips — compact, no labels of its own
 *  - `popover`: anchored panel opened from a trigger
 *  - `panel`: the customizer drawer — full labels, help text, generous spacing
 */
export type EditorMode = 'inline' | 'popover' | 'panel';

export interface PositionedError {
  /** JSON pointer into the edited value (`''` = whole value). */
  path: string;
  message: string;
  /** Character range inside a string value (expressions). */
  start?: number;
  end?: number;
}

export interface FunctionInfo {
  name: string;
  category: string;
  signature: string;
  description?: string;
  kinds: ExpressionKind[];
}

export interface PredicateInfo {
  id: string;
  label: string;
  arity: 0 | 1 | 2 | 'list';
  dataTypes?: CellDataType[];
}

export interface IconInfo {
  name: string;
  category: string;
  /** Inline SVG markup for previews. */
  svg?: string;
}

/**
 * Everything an editor may need from its host. Injected, never fetched.
 * The customizer fills it from the live grid; the assistant from the same
 * source; tests from fixtures.
 */
export interface EditorContext {
  columns: readonly ColumnInfo[];
  sampleRows: readonly Record<string, unknown>[];
  theme: 'light' | 'dark';
  functions: readonly FunctionInfo[];
  predicates: readonly PredicateInfo[];
  icons: readonly IconInfo[];
  /** Host CSS class names allowed in `Style.className`. */
  styleClassNames?: readonly string[];
  /** Colour tokens offered first in the palette, as `var(--sg-…)` references with labels. */
  colorTokens?: readonly { token: string; label: string }[];
}

/** Props every editor accepts. `T` is the schema fragment's inferred type. */
export interface EditorProps<T> {
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  /** The Zod fragment this editor edits; used for constraints and defaults. */
  schema?: z.ZodTypeAny;
  /** JSON Schema node for the fragment (from `moduleJsonSchema`), when the host has it. */
  jsonSchema?: Record<string, unknown>;
  mode?: EditorMode;
  readOnly?: boolean;
  disabled?: boolean;
  errors?: readonly PositionedError[];
  autoFocus?: boolean;
  /** Editor-specific options from `x-editor-options`. */
  options?: Record<string, unknown>;
  /** Label used by hosts that render labels themselves (inline mode omits). */
  label?: string;
  description?: string;
  id?: string;
  className?: string;
}

export type EditorComponent<T = unknown> = (props: EditorProps<T>) => ReactNode;

export interface EditorRegistration<T = unknown> {
  hint: EditorHint;
  component: EditorComponent<T>;
  /** Short human name for galleries and diff cards. */
  title: string;
  /** Whether the editor renders its own label/description chrome in panel mode. */
  ownsLabel?: boolean;
}
