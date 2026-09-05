import { z } from 'zod';
import { MODULES, type ModuleId } from './document.js';
import type { EditorHint } from './meta.js';

export type JsonSchema = Record<string, unknown>;

const JSON_SCHEMA_OPTIONS = {
  target: 'draft-2020-12' as const,
  unrepresentable: 'any' as const,
  io: 'input' as const,
};

/**
 * JSON Schema for a module, with `x-editor` hints preserved. Used to build LLM
 * tool definitions and to drive the form renderer. `io: 'input'` keeps defaults
 * optional so the LLM and the forms may omit them.
 */
export function moduleJsonSchema(moduleId: ModuleId): JsonSchema {
  return z.toJSONSchema(MODULES[moduleId].schema, JSON_SCHEMA_OPTIONS) as JsonSchema;
}

/** JSON Schema for any fragment (a primitive or an object schema). */
export function fragmentJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  return z.toJSONSchema(schema, JSON_SCHEMA_OPTIONS) as JsonSchema;
}

/** All module schemas keyed by id, for the assistant's `list_modules` tool. */
export function allModuleJsonSchemas(): Record<ModuleId, JsonSchema> {
  const out = {} as Record<ModuleId, JsonSchema>;
  for (const id of Object.keys(MODULES) as ModuleId[]) out[id] = moduleJsonSchema(id);
  return out;
}

/**
 * Walk a JSON Schema and collect every `x-editor` hint with its JSON pointer.
 * Handy for the forms renderer and for tests asserting that every editable
 * fragment has a hint.
 */
export function collectEditorHints(
  schema: JsonSchema,
  pointer = '',
): Array<{ pointer: string; editor: EditorHint }> {
  const out: Array<{ pointer: string; editor: EditorHint }> = [];
  const visit = (node: unknown, ptr: string) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n['x-editor'] === 'string') out.push({ pointer: ptr, editor: n['x-editor'] as EditorHint });
    if (n['properties'] && typeof n['properties'] === 'object') {
      for (const [k, v] of Object.entries(n['properties'] as Record<string, unknown>))
        visit(v, `${ptr}/${k}`);
    }
    if (n['items']) visit(n['items'], `${ptr}/items`);
    for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
      const arr = n[key];
      if (Array.isArray(arr)) arr.forEach((v, i) => visit(v, `${ptr}/${key}/${i}`));
    }
    if (n['additionalProperties'] && typeof n['additionalProperties'] === 'object') {
      visit(n['additionalProperties'], `${ptr}/additionalProperties`);
    }
    if (n['$defs'] && typeof n['$defs'] === 'object') {
      for (const [k, v] of Object.entries(n['$defs'] as Record<string, unknown>))
        visit(v, `${ptr}/$defs/${k}`);
    }
  };
  visit(schema, pointer);
  return out;
}
