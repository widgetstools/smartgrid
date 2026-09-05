/**
 * The tool set. Each tool has a JSON Schema for its arguments (sent to the
 * model) and a local `execute`. Read tools are quiet; propose_patch and
 * undo show in the transcript.
 */
import type { Operation } from 'fast-json-patch';
import {
  MODULE_IDS,
  PREDICATE_ARITY,
  PREDICATE_IDS,
  moduleJsonSchema,
  predicatesForDataType,
  type ColumnInfo,
  type GridConfig,
  type ModuleId,
} from '@smartgrid/schema';
import { defaultFunctionRegistry, validate as validateExpression, createEnv } from '@smartgrid/expressions';
import { envForConfig } from '@smartgrid/engine';
import type { ToolDefinition } from './types.js';

const MODULE_ENUM = { type: 'string', enum: MODULE_IDS };

const OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['add', 'replace', 'remove', 'move', 'copy'] },
    path: { type: 'string', description: 'JSON pointer starting with /modules/<module>/data' },
    value: { description: 'New value for add/replace' },
    from: { type: 'string', description: 'Source pointer for move/copy' },
  },
  required: ['op', 'path'],
  additionalProperties: false,
};

export const TOOLS: ToolDefinition[] = [
  {
    name: 'get_columns',
    description: 'List the grid columns: id, header, data type, sample values and whether calculated.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    quiet: true,
    execute: (_args, ctx) =>
      ctx.getColumns().map((c) => ({
        id: c.id,
        header: c.header,
        dataType: c.dataType,
        sampleValues: c.sampleValues.slice(0, 5),
        calculated: c.isSpecial,
        editable: c.editable,
      })),
  },
  {
    name: 'get_config',
    description:
      'Return one module of the config document (its data with array indexes), or the list of module ids and object counts when no module is given.',
    parameters: {
      type: 'object',
      properties: { module: { ...MODULE_ENUM, description: 'Module id; omit for an overview' } },
      additionalProperties: false,
    },
    quiet: true,
    execute: (args, ctx) => {
      const cfg = ctx.getConfig();
      const module = args['module'] as ModuleId | undefined;
      if (!module) {
        return Object.fromEntries(
          Object.entries(cfg.modules).map(([id, env]) => [id, summarize((env as { data: unknown }).data)]),
        );
      }
      const slice = cfg.modules[module];
      if (!slice)
        return {
          error: `Module ${module} is not present; add it with an add operation on /modules/${module}`,
        };
      return { module, revision: cfg.revision, data: slice.data };
    },
  },
  {
    name: 'get_module_schema',
    description: 'JSON Schema for a module (property names, enums, required fields, x-editor hints).',
    parameters: {
      type: 'object',
      properties: { module: MODULE_ENUM },
      required: ['module'],
      additionalProperties: false,
    },
    quiet: true,
    execute: (args) => moduleJsonSchema(args['module'] as ModuleId),
  },
  {
    name: 'list_functions',
    description: 'AdaptableQL functions available in expressions, optionally filtered by expression kind.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean', 'observable'],
        },
      },
      additionalProperties: false,
    },
    quiet: true,
    execute: (args) =>
      defaultFunctionRegistry()
        .list(args['kind'] as never)
        .map((f) => ({
          name: f.name,
          signature: f.signatures[0],
          description: f.description,
          category: f.category,
        })),
  },
  {
    name: 'list_predicates',
    description:
      'Predicate ids usable in rules and filters, optionally for one column data type, with their input arity.',
    parameters: {
      type: 'object',
      properties: {
        dataType: { type: 'string', enum: ['text', 'number', 'boolean', 'date', 'dateString'] },
      },
      additionalProperties: false,
    },
    quiet: true,
    execute: (args) => {
      const dt = args['dataType'] as 'text' | 'number' | 'boolean' | 'date' | 'dateString' | undefined;
      const ids = dt ? predicatesForDataType(dt) : PREDICATE_IDS;
      return ids.map((id) => ({ id, inputs: PREDICATE_ARITY[id] }));
    },
  },
  {
    name: 'validate_expression',
    description: 'Check an AdaptableQL expression for a kind before using it; returns errors with positions.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        kind: {
          type: 'string',
          enum: ['scalar', 'boolean', 'aggregatedScalar', 'aggregatedBoolean', 'observable'],
        },
      },
      required: ['expression', 'kind'],
      additionalProperties: false,
    },
    quiet: true,
    execute: (args, ctx) => {
      const r = validateExpression(String(args['expression'] ?? ''), {
        kind: args['kind'] as never,
        env: envForConfig(ctx.getConfig(), createEnv()),
        columns: ctx.getColumns(),
      });
      return {
        ok: r.ok,
        errors: r.errors,
        warnings: r.warnings,
        columns: r.columns,
        returnType: r.returnType,
      };
    },
  },
  {
    name: 'propose_patch',
    description:
      'Propose a JSON Patch on the config document. It is validated against the schemas, column ids and expressions; the user then reviews and applies it. Returns { ok, errors[], warnings[], proposalId }.',
    parameters: {
      type: 'object',
      properties: {
        module: { ...MODULE_ENUM, description: 'Main module the change targets' },
        title: { type: 'string', description: 'Short title for the change, e.g. "Group by desk"' },
        rationale: { type: 'string', description: 'One sentence on what the change does and why' },
        ops: { type: 'array', items: OPERATION_SCHEMA, minItems: 1 },
      },
      required: ['ops', 'rationale'],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const ops = args['ops'] as Operation[];
      const proposal = ctx.session.propose({
        module: args['module'] as ModuleId | undefined,
        ops,
        rationale: String(args['rationale'] ?? ''),
        title: typeof args['title'] === 'string' ? args['title'] : undefined,
      });
      const v = proposal.validation;
      return {
        ok: v.ok,
        proposalId: proposal.id,
        errors: v.errors.map((e) => ({ path: e.path, message: e.message })),
        warnings: v.warnings.map((w) => w.message),
        status: v.ok
          ? ctx.session.policy.autoApply
            ? 'applied automatically'
            : 'shown to the user for approval; stop and summarise in one sentence'
          : 'invalid; fix the errors and propose again',
      };
    },
  },
  {
    name: 'undo',
    description: 'Undo the most recently applied change (any origin). Returns the new revision.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: (_args, ctx) => ctx.session.undo(),
  },
  {
    name: 'explain',
    description:
      'Explain which configuration objects affect a column (format columns, styled column, flashing, alerts, calculated expression).',
    parameters: {
      type: 'object',
      properties: { columnId: { type: 'string' } },
      required: ['columnId'],
      additionalProperties: false,
    },
    quiet: true,
    execute: (args, ctx) => explainColumn(String(args['columnId']), ctx.getConfig(), ctx.getColumns()),
  },
];

export function toolSchemas(tools: readonly ToolDefinition[] = TOOLS) {
  return tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

function summarize(data: unknown): Record<string, number | string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.length;
    else if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function explainColumn(
  columnId: string,
  config: GridConfig,
  columns: readonly ColumnInfo[],
): Record<string, unknown> {
  const col = columns.find((c) => c.id === columnId);
  if (!col) return { error: `Unknown column ${columnId}` };
  const m = config.modules as Record<string, { data: Record<string, unknown> } | undefined>;
  const inScope = (scope: {
    kind: string;
    columnIds?: string[];
    dataTypes?: string[];
    columnTypes?: string[];
  }) =>
    scope.kind === 'all' ||
    (scope.kind === 'columns' && scope.columnIds?.includes(columnId)) ||
    (scope.kind === 'dataTypes' &&
      (scope.dataTypes?.includes(col.dataType) || scope.columnIds?.includes(columnId))) ||
    (scope.kind === 'columnTypes' && col.columnTypes.some((t) => scope.columnTypes?.includes(t)));
  const list = <T>(mod: string, key: string): T[] =>
    ((m[mod]?.data[key] as T[] | undefined) ?? []).filter(
      (o) => (o as { enabled?: boolean }).enabled !== false,
    );
  return {
    column: { id: col.id, header: col.header, dataType: col.dataType },
    formatColumns: list<{
      id: string;
      name: string;
      scope: never;
      rule?: unknown;
      style?: unknown;
      displayFormat?: unknown;
    }>('formatting', 'formatColumns')
      .filter((fc) => inScope(fc.scope))
      .map((fc) => ({
        id: fc.id,
        name: fc.name,
        rule: fc.rule ?? 'always',
        style: !!fc.style,
        displayFormat: !!fc.displayFormat,
      })),
    styledColumn: list<{ id: string; name: string; columnId: string; style: { kind: string } }>(
      'styledColumns',
      'styledColumns',
    )
      .filter((s) => s.columnId === columnId)
      .map((s) => ({ id: s.id, name: s.name, kind: s.style.kind })),
    flashing: list<{ id: string; name: string; scope: never }>('flashing', 'flashingCells')
      .filter((f) => inScope(f.scope))
      .map((f) => ({ id: f.id, name: f.name })),
    alerts: list<{ id: string; name: string; scope: never; rule?: { kind: string } }>('alerts', 'alerts')
      .filter((a) => inScope(a.scope))
      .map((a) => ({ id: a.id, name: a.name, rule: a.rule?.kind })),
    calculated: list<{ columnId: string; expression: { kind: string; expression: string } }>(
      'calculatedColumns',
      'calculatedColumns',
    )
      .filter((c) => c.columnId === columnId)
      .map((c) => c.expression),
  };
}
