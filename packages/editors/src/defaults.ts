/**
 * Default registrations: every leaf `x-editor` hint maps to an atom here.
 * Structural and composite hints (`list`, `object`, `formatColumn`, …) are
 * rendered by the forms package from the JSON Schema, so they are listed in
 * `STRUCTURAL_HINTS` and deliberately absent from the registry; a test
 * guards that the two sets partition `EDITOR_HINTS`.
 */
import type { EditorHint } from '@smartgrid/schema';
import { EditorRegistry } from './registry.js';
import type { EditorComponent, EditorRegistration } from './types.js';
import {
  AlignmentPicker,
  BooleanField,
  BorderEditor,
  ColorPicker,
  ColumnPicker,
  ColumnTypePicker,
  ColumnsPicker,
  DensityPicker,
  DisplayFormatEditor,
  DurationField,
  EnumField,
  ExpressionEditor,
  FontStyleEditor,
  IconPicker,
  ImagePicker,
  KeyBindingEditor,
  NumberField,
  PredicateEditor,
  RangeField,
  RowScopePicker,
  RuleEditor,
  ScheduleEditor,
  ScopePicker,
  SelectValuesEditor,
  StyleEditor,
  TextField,
  ThemeColorPicker,
} from './atoms/index.js';

/** Hints the forms renderer handles structurally (no leaf editor). */
export const STRUCTURAL_HINTS: readonly EditorHint[] = [
  'list',
  'object',
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
];

function entry<T>(hint: EditorHint, component: EditorComponent<T>, title: string): EditorRegistration {
  return { hint, component: component as EditorComponent, title };
}

const DEFAULTS: EditorRegistration[] = [
  entry('color', ColorPicker, 'Colour'),
  entry('themeColor', ThemeColorPicker, 'Theme colour'),
  entry('border', BorderEditor, 'Border'),
  entry('fontStyle', FontStyleEditor, 'Font'),
  entry('alignment', AlignmentPicker, 'Alignment'),
  entry('style', StyleEditor, 'Style'),
  entry('displayFormat', DisplayFormatEditor, 'Display format'),
  entry('expression', ExpressionEditor, 'Expression'),
  entry('predicate', PredicateEditor, 'Condition'),
  entry('rule', RuleEditor, 'Rule'),
  entry('scope', ScopePicker, 'Scope'),
  entry('rowScope', RowScopePicker, 'Row scope'),
  entry('column', ColumnPicker, 'Column'),
  entry('columns', ColumnsPicker, 'Columns'),
  entry('columnType', ColumnTypePicker, 'Column type'),
  entry('icon', IconPicker, 'Icon'),
  entry('image', ImagePicker, 'Image'),
  entry('number', NumberField, 'Number'),
  entry('range', RangeField, 'Range'),
  entry('schedule', ScheduleEditor, 'Schedule'),
  entry('keys', KeyBindingEditor, 'Key binding'),
  entry('duration', DurationField, 'Duration'),
  entry('values', SelectValuesEditor, 'Values'),
  entry('density', DensityPicker, 'Density'),
  entry('text', TextField, 'Text'),
  entry('boolean', BooleanField, 'Switch'),
  entry('enum', EnumField, 'Choice'),
];

/** Register every default atom on `registry` (a new one when omitted). */
export function registerDefaultEditors(registry = new EditorRegistry()): EditorRegistry {
  for (const reg of DEFAULTS) registry.register(reg);
  return registry;
}

let shared: EditorRegistry | undefined;

/** Lazily created registry with the defaults, for hosts that need only one. */
export function defaultEditorRegistry(): EditorRegistry {
  shared ??= registerDefaultEditors();
  return shared;
}
