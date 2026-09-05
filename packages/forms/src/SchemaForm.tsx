/**
 * SchemaForm — renders an editor tree for any JSON Schema node. Leaves with
 * an `x-editor` hint resolve to the registered editor; everything else falls
 * back by type (object → fieldset, array of objects → ObjectList + detail,
 * discriminated union → kind selector + branch, enum → choice, and so on).
 *
 * The form is controlled and emits the whole value on every change; hosts
 * turn that into a JSON Patch (see the playground customizer). Validation
 * errors arrive as JSON-pointer `PositionedError`s and are routed to the
 * field they belong to.
 */
import { createContext, createElement, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { EditorHint, JsonSchema } from '@smartgrid/schema';
import type { z } from '@smartgrid/schema';
import {
  BooleanField,
  type EditorRegistry,
  EnumField,
  Field,
  NumberField,
  ObjectList,
  SelectValuesEditor,
  TextField,
  TextInput,
  ValidationSummary,
  defaultEditorRegistry,
  errorsAt,
  uid,
  type EditorMode,
  type PositionedError,
} from '@smartgrid/editors';
import { Button, cn } from '@smartgrid/ui';
import {
  HIDDEN_KEYS,
  additionalOf,
  branchLabel,
  branchesOf,
  defaultsFor,
  descriptionOf,
  discriminatedOf,
  enumOf,
  hintOf,
  humanize,
  itemsOf,
  kindOf,
  labelOf,
  matchBranch,
  propertiesOf,
  requiredOf,
  resolveRef,
  type SchemaNode,
} from './schemaNode.js';
import { errorsUnder, useValidation } from './validate.js';

export interface SchemaFormProps<T = unknown> {
  /** Node to render. */
  jsonSchema: JsonSchema;
  /** Root document for `$ref` resolution; defaults to `jsonSchema`. */
  root?: JsonSchema;
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  /** Zod schema for live validation. When given, errors are computed here. */
  schema?: z.ZodTypeAny;
  /** Externally computed errors (JSON pointers relative to `value`). Merged with `schema` errors. */
  errors?: readonly PositionedError[];
  onValidate?: (errors: PositionedError[]) => void;
  registry?: EditorRegistry;
  mode?: EditorMode;
  readOnly?: boolean;
  /** Property keys never rendered. Defaults to id/readOnly/source/metadata. */
  hiddenKeys?: readonly string[];
  /** Per-path editor options, merged over the node's `x-editor-options`. */
  editorOptions?: (path: string, node: SchemaNode, rootValue: unknown) => Record<string, unknown> | undefined;
  /** Override or supply the editor hint for a path. */
  hintFor?: (path: string, node: SchemaNode) => EditorHint | undefined;
  /** Summary for list rows when items are objects. */
  summarize?: (
    item: unknown,
    index: number,
    path: string,
  ) => { title: string; subtitle?: string; badges?: string[] };
  label?: string;
  description?: string;
  className?: string;
  /** Show a validation summary at the bottom (panel mode). */
  showSummary?: boolean;
}

interface FormCtx {
  root: SchemaNode;
  rootValue: unknown;
  registry: EditorRegistry;
  mode: EditorMode;
  readOnly: boolean;
  hiddenKeys: readonly string[];
  errors: readonly PositionedError[];
  editorOptions?: SchemaFormProps['editorOptions'];
  hintFor?: SchemaFormProps['hintFor'];
  summarize?: SchemaFormProps['summarize'];
}

const Ctx = createContext<FormCtx | null>(null);
const useForm = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SchemaNode rendered outside SchemaForm');
  return c;
};

export function SchemaForm<T = unknown>({
  jsonSchema,
  root,
  value,
  onChange,
  schema,
  errors: externalErrors,
  onValidate,
  registry,
  mode = 'panel',
  readOnly = false,
  hiddenKeys = HIDDEN_KEYS,
  editorOptions,
  hintFor,
  summarize,
  label,
  description,
  className,
  showSummary,
}: SchemaFormProps<T>) {
  const reg = registry ?? defaultEditorRegistry();
  const zodErrors = useValidation(schema, value);
  const errors = useMemo(() => [...zodErrors, ...(externalErrors ?? [])], [zodErrors, externalErrors]);
  const [reported, setReported] = useState<readonly PositionedError[]>();
  if (onValidate && reported !== errors) {
    setReported(errors);
    onValidate(errors);
  }
  const ctx = useMemo<FormCtx>(
    () => ({
      root: root ?? jsonSchema,
      rootValue: value,
      registry: reg,
      mode,
      readOnly,
      hiddenKeys,
      errors,
      editorOptions,
      hintFor,
      summarize,
    }),
    [root, jsonSchema, value, reg, mode, readOnly, hiddenKeys, errors, editorOptions, hintFor, summarize],
  );
  return (
    <Ctx.Provider value={ctx}>
      <div
        className={cn('sg-form flex flex-col gap-3', mode !== 'panel' && 'gap-2', className)}
        data-testid="schema-form"
      >
        <Node
          node={jsonSchema}
          value={value}
          onChange={onChange as (v: unknown) => void}
          path=""
          label={label}
          description={description}
          depth={0}
        />
        {showSummary && mode === 'panel' && <ValidationSummary errors={errors} />}
      </div>
    </Ctx.Provider>
  );
}

interface NodeProps {
  node: SchemaNode;
  value: unknown;
  onChange: (v: unknown) => void;
  path: string;
  label?: string;
  description?: string;
  required?: boolean;
  depth: number;
  /** Property keys to hide in this object (discriminant keys). */
  hide?: readonly string[];
}

export function Node(props: NodeProps) {
  const ctx = useForm();
  const node = resolveRef(props.node, ctx.root);
  const hint = ctx.hintFor?.(props.path, node) ?? hintOf(node);
  const kind = hint && ctx.registry.has(hint) ? 'editor' : kindOf(node, ctx.root, (h) => ctx.registry.has(h));
  const label = props.label ?? labelOf(node, undefined);
  const description = props.description ?? descriptionOf(node);
  const errors = errorsUnder(ctx.errors, props.path);
  const common = {
    mode: ctx.mode,
    readOnly: ctx.readOnly,
    errors,
    label,
    description,
    id: undefined as string | undefined,
  };

  switch (kind) {
    case 'editor': {
      const editor = ctx.registry.component(hint!)!;
      const options = {
        ...((node['x-editor-options'] as Record<string, unknown> | undefined) ?? {}),
        ...(ctx.editorOptions?.(props.path, node, ctx.rootValue) ?? {}),
      };
      return createElement(editor, {
        value: props.value,
        onChange: props.onChange,
        jsonSchema: node,
        options,
        ...common,
      });
    }
    case 'const':
      return null;
    case 'discriminated':
      return <DiscriminatedNode {...props} node={node} label={label} description={description} />;
    case 'union':
      return <UnionNode {...props} node={node} label={label} description={description} />;
    case 'object':
      return <ObjectNode {...props} node={node} label={label} description={description} />;
    case 'record':
      return <RecordNode {...props} node={node} label={label} description={description} />;
    case 'array':
      return <ArrayNode {...props} node={node} label={label} description={description} />;
    case 'enum': {
      const values = (enumOf(node) ?? []).map((v) => ({ value: String(v), label: humanize(String(v)) }));
      return (
        <EnumField
          value={props.value === undefined ? undefined : String(props.value)}
          onChange={props.onChange}
          options={{ values }}
          jsonSchema={node}
          {...common}
        />
      );
    }
    case 'string':
      return (
        <TextField
          value={typeof props.value === 'string' ? props.value : undefined}
          onChange={props.onChange}
          jsonSchema={node}
          options={{
            placeholder: node['format'] === 'date-time' ? 'YYYY-MM-DDTHH:mm:ssZ' : undefined,
            commit: 'blur',
          }}
          {...common}
        />
      );
    case 'number':
      return (
        <NumberField
          value={typeof props.value === 'number' ? props.value : undefined}
          onChange={props.onChange}
          jsonSchema={node}
          {...common}
        />
      );
    case 'boolean':
      return (
        <BooleanField
          value={typeof props.value === 'boolean' ? props.value : undefined}
          onChange={props.onChange}
          jsonSchema={node}
          {...common}
        />
      );
    default:
      return <JsonNode value={props.value} onChange={props.onChange} {...common} />;
  }
}

function Group({
  label,
  description,
  depth,
  children,
  errors,
  path,
  className,
}: {
  label?: string;
  description?: string;
  depth: number;
  children: ReactNode;
  errors: readonly PositionedError[];
  path: string;
  className?: string;
}) {
  const ctx = useForm();
  const own = errorsAt(errors, '');
  if (depth === 0 || !label) {
    return (
      <div className={cn('flex flex-col gap-3', ctx.mode !== 'panel' && 'gap-2', className)} data-path={path}>
        {children}
        {own.length > 0 && (
          <p className="text-2xs text-destructive" role="alert">
            {own.map((e) => e.message).join(' · ')}
          </p>
        )}
      </div>
    );
  }
  return (
    <fieldset
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-border p-2',
        ctx.mode !== 'panel' && 'gap-1.5 p-1.5',
        className,
      )}
      data-path={path}
    >
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      {description && ctx.mode === 'panel' && (
        <p className="-mt-1 text-2xs text-muted-foreground">{description}</p>
      )}
      {children}
      {own.length > 0 && (
        <p className="text-2xs text-destructive" role="alert">
          {own.map((e) => e.message).join(' · ')}
        </p>
      )}
    </fieldset>
  );
}

function ObjectNode({
  node,
  value,
  onChange,
  path,
  label,
  description,
  depth,
  hide,
  required: _required,
}: NodeProps) {
  const ctx = useForm();
  const obj = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >;
  const props = propertiesOf(node);
  const required = requiredOf(node);
  const hidden = new Set([...ctx.hiddenKeys, ...(hide ?? [])]);
  const entries = Object.entries(props)
    .filter(([k, p]) => !hidden.has(k) && !('const' in p))
    .map(([k, p], i) => ({ k, p: resolveRef(p, ctx.root), i }))
    .sort((a, b) => (num(a.p['x-order']) ?? a.i) - (num(b.p['x-order']) ?? b.i));
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const g = typeof e.p['x-group'] === 'string' ? e.p['x-group'] : '';
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  const setProp = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    // keep discriminant / const keys
    for (const [ck, cp] of Object.entries(props))
      if ('const' in cp && next[ck] === undefined) next[ck] = cp['const'];
    onChange(Object.keys(next).length === 0 && !_required && depth > 0 ? undefined : next);
  };
  const errors = errorsUnder(ctx.errors, path);
  return (
    <Group label={label} description={description} depth={depth} errors={errors} path={path}>
      {[...groups.entries()].map(([g, list]) => (
        <div
          key={g}
          className={cn('flex flex-col gap-3', ctx.mode !== 'panel' && 'gap-2')}
          data-group={g || undefined}
        >
          {g && (
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {humanize(g)}
            </p>
          )}
          {list.map(({ k, p }) => (
            <Node
              key={k}
              node={p}
              value={obj[k]}
              onChange={(v) => setProp(k, v)}
              path={`${path}/${k}`}
              label={labelOf(p, k)}
              required={required.includes(k)}
              depth={depth + 1}
            />
          ))}
        </div>
      ))}
    </Group>
  );
}

function DiscriminatedNode({ node, value, onChange, path, label, description, depth, required }: NodeProps) {
  const ctx = useForm();
  const disc = discriminatedOf(node, ctx.root)!;
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  const current = typeof obj?.[disc.key] === 'string' ? (obj[disc.key] as string) : undefined;
  const branch = disc.branches.find((b) => b.value === current);
  const errors = errorsUnder(ctx.errors, path);
  const switchTo = (v: string | undefined) => {
    if (v === undefined) return onChange(required ? undefined : undefined);
    const b = disc.branches.find((x) => x.value === v);
    if (!b) return;
    const fresh = defaultsFor(b.node, ctx.root) as Record<string, unknown>;
    // carry over compatible keys
    const props = propertiesOf(b.node);
    const carried: Record<string, unknown> = {};
    for (const k of Object.keys(props))
      if (obj && k in obj && k !== disc.key && !('const' in props[k]!)) carried[k] = obj[k];
    onChange({ ...fresh, ...carried, [disc.key]: v });
  };
  return (
    <Group label={label} description={description} depth={depth} errors={errors} path={path}>
      <EnumField
        value={current}
        onChange={(v) => switchTo(v)}
        options={{
          values: disc.branches.map((b) => ({ value: b.value, label: b.label })),
          allowClear: !required,
        }}
        mode={ctx.mode}
        readOnly={ctx.readOnly}
        label={humanize(disc.key)}
        errors={errorsUnder(errors, `/${disc.key}`)}
      />
      {branch && (
        <ObjectNode
          node={branch.node}
          value={value}
          onChange={onChange}
          path={path}
          depth={depth}
          hide={[disc.key]}
          required={required}
        />
      )}
    </Group>
  );
}

function UnionNode({ node, value, onChange, path, label, description, depth, required }: NodeProps) {
  const ctx = useForm();
  const branches = branchesOf(node)!.map((b) => resolveRef(b, ctx.root));
  const matched = matchBranch(branches, value, ctx.root);
  const [chosen, setChosen] = useState<number | undefined>();
  const idx = chosen ?? matched;
  const branch = branches[idx]!;
  const errors = errorsUnder(ctx.errors, path);
  // Collapse "enum | free string" unions into one text field with suggestions.
  const allStrings = branches.every((b) => (b['type'] === 'string' || b['enum']) && !b['properties']);
  if (allStrings) {
    const suggestions = branches.flatMap((b) => (enumOf(b) ?? []).map(String));
    return (
      <TextField
        value={typeof value === 'string' ? value : undefined}
        onChange={onChange}
        jsonSchema={{ ...node, type: 'string' }}
        options={{ suggestions, commit: 'blur' }}
        mode={ctx.mode}
        readOnly={ctx.readOnly}
        errors={errors}
        label={label}
        description={description}
      />
    );
  }
  const distinct = branches.map((b, i) => branchLabel(b, i));
  return (
    <Group label={label} description={description} depth={depth} errors={errors} path={path}>
      <EnumField
        value={String(idx)}
        onChange={(v) => {
          if (v === undefined) return;
          const i = Number(v);
          setChosen(i);
          onChange(defaultsFor(branches[i]!, ctx.root));
        }}
        options={{ values: distinct.map((l, i) => ({ value: String(i), label: l })) }}
        mode={ctx.mode}
        readOnly={ctx.readOnly}
        label="Kind"
      />
      <Node
        node={branch}
        value={value}
        onChange={onChange}
        path={path}
        depth={depth + 1}
        required={required}
      />
    </Group>
  );
}

function RecordNode({ node, value, onChange, path, label, description, depth }: NodeProps) {
  const ctx = useForm();
  const valueNode = additionalOf(node) ?? {};
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const keys = Object.keys(obj);
  const [draftKey, setDraftKey] = useState('');
  const errors = errorsUnder(ctx.errors, path);
  const set = (k: string, v: unknown) => {
    const next = { ...obj };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const keyEditor =
    ctx.hintFor?.(`${path}/*key`, node) ??
    (node['x-editor-options'] as Record<string, unknown> | undefined)?.['keys'];
  const keyComponent = keyEditor === 'column' ? ctx.registry.component<string>('column') : undefined;
  return (
    <Group label={label} description={description} depth={depth} errors={errors} path={path}>
      {keys.length === 0 && <p className="text-2xs text-muted-foreground">None</p>}
      {keys.map((k) => (
        <div key={k} className="flex items-start gap-2" data-key={k}>
          <code className="mt-1.5 shrink-0 rounded-sm bg-muted px-1 font-mono text-xs">{k}</code>
          <div className="min-w-0 flex-1">
            <Node
              node={valueNode}
              value={obj[k]}
              onChange={(v) => set(k, v)}
              path={`${path}/${k}`}
              label={k}
              depth={depth + 1}
            />
          </div>
          {!ctx.readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Remove ${k}`}
              onClick={() => set(k, undefined)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!ctx.readOnly && (
        <div className="flex items-center gap-1">
          {keyComponent ? (
            createElement(keyComponent, {
              value: draftKey || undefined,
              onChange: (v) => setDraftKey(typeof v === 'string' ? v : ''),
              mode: 'inline',
              label: 'New key',
            })
          ) : (
            <TextInput
              aria-label="New key"
              value={draftKey || undefined}
              onChange={(v) => setDraftKey(v ?? '')}
              placeholder="key"
              mode={ctx.mode}
              className="w-40"
              mono
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            disabled={!draftKey || draftKey in obj}
            onClick={() => {
              set(draftKey, defaultsFor(valueNode, ctx.root) ?? '');
              setDraftKey('');
            }}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      )}
    </Group>
  );
}

function ArrayNode({ node, value, onChange, path, label, description, depth, required }: NodeProps) {
  const ctx = useForm();
  const items = resolveRef(itemsOf(node) ?? {}, ctx.root);
  const arr = Array.isArray(value) ? (value as unknown[]) : [];
  const errors = errorsUnder(ctx.errors, path);
  const emit = (next: unknown[]) => onChange(next.length === 0 && !required ? undefined : next);
  const itemKind = kindOf(items, ctx.root, (h) => ctx.registry.has(h));

  // Primitive string items → chips
  if (
    itemKind === 'string' ||
    itemKind === 'enum' ||
    (itemKind === 'union' && branchesOf(items)!.every((b) => b['type'] === 'string' || b['enum']))
  ) {
    const suggestions = (enumOf(items) ?? branchesOf(items)?.flatMap((b) => enumOf(b) ?? []) ?? []).map(
      String,
    );
    return (
      <SelectValuesEditor
        value={arr.length ? arr.map(String) : undefined}
        onChange={(v) => emit(v ?? [])}
        options={{ suggestions, max: num(node['maxItems']) }}
        mode={ctx.mode}
        readOnly={ctx.readOnly}
        errors={errors}
        label={label}
        description={description}
      />
    );
  }

  return (
    <ObjectArrayNode
      items={items}
      arr={arr}
      emit={emit}
      path={path}
      label={label}
      description={description}
      depth={depth}
      errors={errors}
    />
  );
}

function ObjectArrayNode({
  items,
  arr,
  emit,
  path,
  label,
  description,
  depth,
  errors,
}: {
  items: SchemaNode;
  arr: unknown[];
  emit: (next: unknown[]) => void;
  path: string;
  label?: string;
  description?: string;
  depth: number;
  errors: readonly PositionedError[];
}) {
  const ctx = useForm();
  const listId = useId();
  const hasId =
    'id' in propertiesOf(items) ||
    Boolean(discriminatedOf(items, ctx.root)?.branches.every((b) => 'id' in propertiesOf(b.node)));
  // Rows need stable ids; synthesise from index when the schema has none.
  const rows = arr.map((it, i) => ({
    id:
      hasId && it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string'
        ? ((it as { id: string }).id as string)
        : `${listId}-${i}`,
    item: it,
    index: i,
    enabled:
      it && typeof it === 'object' && 'enabled' in (it as object)
        ? Boolean((it as { enabled?: boolean }).enabled ?? true)
        : undefined,
  }));
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selected = rows.find((r) => r.id === selectedId);
  const invalidIds = rows
    .filter((r) => errors.some((e) => e.path === `/${r.index}` || e.path.startsWith(`/${r.index}/`)))
    .map((r) => r.id);
  const summarize = (r: (typeof rows)[number]) => {
    const custom = ctx.summarize?.(r.item, r.index, path);
    if (custom) return custom;
    const o = (r.item && typeof r.item === 'object' ? r.item : {}) as Record<string, unknown>;
    const disc = discriminatedOf(items, ctx.root);
    const title =
      typeof o['name'] === 'string'
        ? o['name']
        : typeof o['columnId'] === 'string'
          ? o['columnId']
          : typeof o['id'] === 'string'
            ? o['id']
            : `${label ?? 'Item'} ${r.index + 1}`;
    const badges = disc && typeof o[disc.key] === 'string' ? [String(o[disc.key])] : undefined;
    return { title, badges };
  };
  const toggleable = rows.some((r) => r.enabled !== undefined) || 'enabled' in propertiesOf(items);
  return (
    <Group label={label} description={description} depth={depth} errors={errors} path={path}>
      <ObjectList
        items={rows.map((r) => ({ id: r.id, enabled: r.enabled, row: r }))}
        onChange={(next) =>
          emit(
            next.map((n) =>
              toggleable && n.row.item && typeof n.row.item === 'object'
                ? { ...(n.row.item as object), enabled: n.enabled }
                : n.row.item,
            ),
          )
        }
        summarize={(it) => summarize(it.row)}
        selectedId={selectedId}
        onSelect={setSelectedId}
        create={
          ctx.readOnly
            ? undefined
            : () => {
                const fresh = defaultsFor(items, ctx.root) as Record<string, unknown> | undefined;
                const id = uid();
                const item =
                  fresh && typeof fresh === 'object' ? { ...fresh, ...(hasId ? { id } : {}) } : fresh;
                return {
                  id: hasId ? id : `${listId}-${arr.length}`,
                  enabled: toggleable ? true : undefined,
                  row: { id, item, index: arr.length, enabled: toggleable ? true : undefined },
                };
              }
        }
        mode={ctx.mode}
        readOnly={ctx.readOnly}
        toggleable={toggleable}
        addLabel={`Add ${(label ?? 'item').replace(/s$/, '').toLowerCase()}`}
        invalidIds={invalidIds}
        emptyText={`No ${(label ?? 'items').toLowerCase()} yet.`}
      />
      {selected && (
        <div className="rounded-md border border-border bg-muted/30 p-2" data-testid="list-detail">
          <Node
            node={items}
            value={selected.item}
            onChange={(v) => emit(arr.map((it, i) => (i === selected.index ? v : it)))}
            path={`${path}/${selected.index}`}
            label={summarize(selected).title}
            depth={depth + 1}
            required
          />
        </div>
      )}
    </Group>
  );
}

/** Last-resort editor for schemas the renderer cannot type: raw JSON. */
function JsonNode({
  value,
  onChange,
  mode,
  readOnly,
  errors,
  label,
  description,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  mode: EditorMode;
  readOnly: boolean;
  errors: readonly PositionedError[];
  label?: string;
  description?: string;
  id?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === undefined ? '' : JSON.stringify(value, null, 2));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value === undefined ? '' : JSON.stringify(value, null, 2));
  }
  const [parseError, setParseError] = useState<string>();
  const commit = () => {
    if (draft.trim() === '') {
      setParseError(undefined);
      return onChange(undefined);
    }
    try {
      onChange(JSON.parse(draft));
      setParseError(undefined);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Field
      id={id}
      label={label}
      description={description ?? 'JSON'}
      mode={mode}
      errors={parseError ? [...errors, { path: '', message: parseError }] : errors}
    >
      <textarea
        id={id}
        aria-label={label ?? 'JSON'}
        className="min-h-16 w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
        value={draft}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </Field>
  );
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
