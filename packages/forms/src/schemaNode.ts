/**
 * Pure helpers over JSON Schema nodes (draft 2020-12 as emitted by
 * `z.toJSONSchema`). The renderer asks these three questions of every node:
 * what is it (kind), what does it look like empty (defaults), and how is it
 * labelled.
 */
import type { EditorHint, JsonSchema } from '@smartgrid/schema';

export type SchemaNode = JsonSchema;

export const HIDDEN_KEYS: readonly string[] = ['id', 'readOnly', 'source', 'metadata'];

export function resolveRef(node: SchemaNode, root: SchemaNode): SchemaNode {
  const ref = node['$ref'];
  if (typeof ref !== 'string') return node;
  if (!ref.startsWith('#/')) return node;
  let cur: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!cur || typeof cur !== 'object') return node;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (!cur || typeof cur !== 'object') return node;
  // Keep sibling annotations (title, description, x-editor) from the referring node.
  const { $ref: _ref, ...siblings } = node;
  return { ...(cur as SchemaNode), ...siblings };
}

export function hintOf(node: SchemaNode): EditorHint | undefined {
  const h = node['x-editor'];
  return typeof h === 'string' ? (h as EditorHint) : undefined;
}

export function typeOf(node: SchemaNode): string | undefined {
  const t = node['type'];
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.find((x) => x !== 'null') as string | undefined;
  if (node['properties'] || node['additionalProperties']) return 'object';
  if (node['items']) return 'array';
  if (node['enum']) return 'string';
  return undefined;
}

export function propertiesOf(node: SchemaNode): Record<string, SchemaNode> {
  const p = node['properties'];
  return p && typeof p === 'object' ? (p as Record<string, SchemaNode>) : {};
}

export function requiredOf(node: SchemaNode): readonly string[] {
  const r = node['required'];
  return Array.isArray(r) ? (r as string[]) : [];
}

export function itemsOf(node: SchemaNode): SchemaNode | undefined {
  const it = node['items'];
  return it && typeof it === 'object' && !Array.isArray(it) ? (it as SchemaNode) : undefined;
}

export function additionalOf(node: SchemaNode): SchemaNode | undefined {
  const a = node['additionalProperties'];
  return a && typeof a === 'object' ? (a as SchemaNode) : undefined;
}

export function enumOf(node: SchemaNode): unknown[] | undefined {
  if (Array.isArray(node['enum'])) return node['enum'] as unknown[];
  if ('const' in node) return [node['const']];
  return undefined;
}

export function branchesOf(node: SchemaNode): SchemaNode[] | undefined {
  for (const key of ['oneOf', 'anyOf'] as const) {
    const arr = node[key];
    if (Array.isArray(arr) && arr.length > 0) return arr as SchemaNode[];
  }
  return undefined;
}

export interface Discriminated {
  key: string;
  branches: { value: string; node: SchemaNode; label: string }[];
}

/** A oneOf/anyOf whose object branches all carry one `const` property on the same key. */
export function discriminatedOf(node: SchemaNode, root: SchemaNode): Discriminated | undefined {
  const branches = branchesOf(node)?.map((b) => resolveRef(b, root));
  if (!branches || branches.length < 2) return undefined;
  let key: string | undefined;
  const out: Discriminated['branches'] = [];
  for (const b of branches) {
    const props = propertiesOf(b);
    const constKeys = Object.entries(props).filter(([, p]) => 'const' in p && typeof p['const'] === 'string');
    const found = constKeys.find(([k]) => key === undefined || k === key);
    if (!found) return undefined;
    key = found[0];
    const value = found[1]['const'] as string;
    out.push({ value, node: b, label: typeof b['title'] === 'string' ? b['title'] : humanize(value) });
  }
  return key ? { key, branches: out } : undefined;
}

export type NodeKind =
  | 'editor'
  | 'discriminated'
  | 'union'
  | 'object'
  | 'record'
  | 'array'
  | 'enum'
  | 'string'
  | 'number'
  | 'boolean'
  | 'const'
  | 'unknown';

export function kindOf(
  node: SchemaNode,
  root: SchemaNode,
  hasEditor: (hint: EditorHint) => boolean,
): NodeKind {
  const hint = hintOf(node);
  if (hint && hasEditor(hint)) return 'editor';
  if ('const' in node) return 'const';
  if (discriminatedOf(node, root)) return 'discriminated';
  if (branchesOf(node)) return 'union';
  if (node['enum']) return 'enum';
  switch (typeOf(node)) {
    case 'object':
      return Object.keys(propertiesOf(node)).length === 0 && additionalOf(node) ? 'record' : 'object';
    case 'array':
      return 'array';
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'unknown';
  }
}

export function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function labelOf(node: SchemaNode, key: string | undefined): string | undefined {
  if (typeof node['title'] === 'string') return node['title'];
  return key === undefined ? undefined : humanize(key);
}

export function descriptionOf(node: SchemaNode): string | undefined {
  return typeof node['description'] === 'string' ? node['description'] : undefined;
}

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/**
 * The value a fresh instance of `node` should start with: explicit defaults,
 * consts, required children recursively, and optional children that declare
 * a default. Optional children without defaults stay absent.
 */
export function defaultsFor(node: SchemaNode, root: SchemaNode): unknown {
  node = resolveRef(node, root);
  if ('default' in node) return clone(node['default']);
  if ('const' in node) return node['const'];
  const disc = discriminatedOf(node, root);
  if (disc) return defaultsFor(disc.branches[0]!.node, root);
  const branches = branchesOf(node);
  if (branches) return defaultsFor(branches[0]!, root);
  switch (typeOf(node)) {
    case 'object': {
      const out: Record<string, unknown> = {};
      const required = requiredOf(node);
      for (const [k, p] of Object.entries(propertiesOf(node))) {
        const resolved = resolveRef(p, root);
        if (required.includes(k) || 'default' in resolved) {
          const v = defaultsFor(resolved, root);
          if (v !== undefined) out[k] = v;
        }
      }
      return out;
    }
    case 'array':
      return [];
    case 'string': {
      const e = enumOf(node);
      return e ? e[0] : '';
    }
    case 'number':
    case 'integer':
      return typeof node['minimum'] === 'number' ? node['minimum'] : 0;
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}

/** Pick the branch of a non-discriminated union that best matches `value`. */
export function matchBranch(branches: readonly SchemaNode[], value: unknown, root: SchemaNode): number {
  if (value === undefined) return 0;
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  let best = -1;
  branches.forEach((b, i) => {
    const r = resolveRef(b, root);
    const bt = typeOf(r) === 'integer' ? 'number' : typeOf(r);
    if (bt !== t) return;
    if (best === -1) best = i;
    const e = enumOf(r);
    if (e && e.includes(value)) best = i;
    if (t === 'object' && value && typeof value === 'object') {
      const props = propertiesOf(r);
      const consts = Object.entries(props).filter(([, p]) => 'const' in p);
      if (consts.length && consts.every(([k, p]) => (value as Record<string, unknown>)[k] === p['const']))
        best = i;
    }
  });
  return best === -1 ? 0 : best;
}

export function branchLabel(node: SchemaNode, i: number): string {
  if (typeof node['title'] === 'string') return node['title'];
  const e = enumOf(node);
  if (e && e.length === 1) return String(e[0]);
  if (e) return 'Choice';
  const t = typeOf(node);
  return t ? humanize(t) : `Option ${i + 1}`;
}
