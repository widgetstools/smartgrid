/**
 * Resolve an inline editor for a proposal row from the module JSON schema:
 * walk the pointer through properties / items / additionalProperties, then
 * use the node's `x-editor` hint when the registry has it, or a generated
 * SchemaForm (popover) for whole objects. This is what makes every
 * assistant proposal editable with the same editors the customizer uses.
 */
import { createElement } from 'react';
import {
  MODULE_IDS,
  moduleJsonSchema,
  type EditorHint,
  type JsonSchema,
  type ModuleId,
} from '@smartgrid/schema';
import type { EditorComponent, EditorRegistry, ResolvedEditor } from '@smartgrid/editors';
import {
  SchemaForm,
  additionalOf,
  branchesOf,
  humanize,
  itemsOf,
  hintOf,
  propertiesOf,
  resolveRef,
  typeOf,
} from '@smartgrid/forms';

const schemaCache = new Map<ModuleId, JsonSchema>();

function moduleSchema(id: ModuleId): JsonSchema {
  let s = schemaCache.get(id);
  if (!s) {
    s = moduleJsonSchema(id);
    schemaCache.set(id, s);
  }
  return s;
}

export interface SchemaLocation {
  module: ModuleId;
  root: JsonSchema;
  node: JsonSchema;
  /** Path segments after /modules/<m>/data. */
  segments: string[];
}

/** Locate the schema node for a config pointer, or undefined when the path leaves the schema. */
export function schemaNodeAt(path: string): SchemaLocation | undefined {
  const m = /^\/modules\/([^/]+)\/data(?:\/(.*))?$/.exec(path);
  if (!m || !(MODULE_IDS as readonly string[]).includes(m[1]!)) return undefined;
  const module = m[1] as ModuleId;
  const root = moduleSchema(module);
  const segments = m[2] ? m[2].split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~')) : [];
  let node: JsonSchema = root;
  for (const seg of segments) {
    node = resolveRef(node, root);
    const props = propertiesOf(node);
    let next: JsonSchema | undefined;
    if (typeOf(node) === 'array') next = itemsOf(node);
    else if (props[seg]) next = props[seg];
    else if (additionalOf(node) && Object.keys(props).length === 0) next = additionalOf(node);
    else {
      // Union of objects: pick the first branch that knows the key.
      for (const b of branchesOf(node) ?? []) {
        const bp = propertiesOf(resolveRef(b, root));
        if (bp[seg]) {
          next = bp[seg];
          break;
        }
      }
    }
    if (!next) return undefined;
    node = next;
  }
  return { module, root, node: resolveRef(node, root), segments };
}

export interface ProposalEditorOptions {
  registry: EditorRegistry;
  /** Hints never rendered inline (structural editors are heavy). */
  exclude?: readonly EditorHint[];
}

/** `resolveEditor` for PatchDiffCard: registry editors for hinted values, SchemaForm popovers for objects. */
export function resolveProposalEditor(
  path: string,
  _value: unknown,
  { registry, exclude = ['list', 'object'] }: ProposalEditorOptions,
): ResolvedEditor | undefined {
  const loc = schemaNodeAt(path);
  if (!loc) return undefined;
  const { node, root, segments } = loc;
  const hint = hintOf(node);
  const label = humanize(segments.at(-1) ?? loc.module);
  if (hint && !exclude.includes(hint) && registry.has(hint)) {
    return {
      hint,
      options: node['x-editor-options'] as Record<string, unknown> | undefined,
      jsonSchema: node,
      label,
      mode: 'inline',
    };
  }
  const isObject =
    typeOf(node) === 'object' || !!branchesOf(node)?.length || Object.keys(propertiesOf(node)).length > 0;
  if (isObject) {
    const component: EditorComponent<unknown> = (props) =>
      createElement(
        'div',
        { className: 'w-full min-w-0' },
        createElement(SchemaForm, {
          jsonSchema: node,
          root,
          value: props.value,
          onChange: props.onChange,
          errors: props.errors,
          registry,
          mode: 'popover',
          hiddenKeys: ['id', 'readOnly', 'source', 'metadata'],
          label,
        }),
      );
    return { hint: hint ?? 'object', component, mode: 'popover', jsonSchema: node, label };
  }
  return undefined;
}

/** Friendlier pointer labels: "formatting › format columns › new" instead of raw JSON pointers. */
export function describeConfigPath(
  path: string,
  config?: { modules?: Record<string, { data?: unknown }> },
): string {
  const m = /^\/modules\/([^/]+)\/data(?:\/(.*))?$/.exec(path);
  if (!m) return path;
  const module = m[1]!;
  const segs = m[2] ? m[2].split('/') : [];
  const out: string[] = [humanize(module)];
  let cur: unknown = config?.modules?.[module]?.data;
  for (const seg of segs) {
    if (seg === '-') {
      out.push('new');
      cur = undefined;
    } else if (/^\d+$/.test(seg)) {
      const item = Array.isArray(cur)
        ? (cur[Number(seg)] as { name?: string; id?: string } | undefined)
        : undefined;
      const name = item?.name ?? item?.id;
      // "Layout › Blotter › …" reads better than "Layout › layouts › Blotter › …".
      if (name && out.length > 1) out.pop();
      out.push(name ?? `#${seg}`);
      cur = item;
    } else {
      out.push(humanize(seg).toLowerCase());
      cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined;
    }
  }
  return out.join(' › ');
}
