/**
 * Static validation: parse, resolve columns (by id or friendly name),
 * check functions (existence, arity, allowed kinds, modifier placement),
 * enforce the shape each expression kind requires, and infer the return
 * type. Errors carry spans for the editor; the assistant feeds the same
 * messages back to the model for self-correction.
 */
import type { CellDataType, ExpressionKind } from '@smartgrid/schema';
import { AGGREGATE_FUNCTIONS, MODIFIER_FUNCTIONS, compileAggregated, isAggregateCall } from './aggregate.js';
import { compile, CompileError } from './compile.js';
import { inferType } from './infer.js';
import { CHANGE_TYPES, OBSERVABLE_FUNCTIONS, compileObservable } from './observable.js';
import { columnsOf, functionsOf, parse, walk } from './parser.js';
import {
  ParseError,
  valueTypeOf,
  type Env,
  type ExpressionError,
  type Node,
  type ValueType,
} from './types.js';

export interface ColumnLike {
  id: string;
  header?: string;
  dataType?: CellDataType;
}

export interface ValidateOptions {
  kind: ExpressionKind;
  env: Env;
  /** Known columns; omit to skip column checks. */
  columns?: readonly ColumnLike[];
  /** Accept `[name]` references that match no column (default false when `columns` given). */
  allowUnknownColumns?: boolean;
  maxTimeframeMs?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: ExpressionError[];
  warnings: ExpressionError[];
  ast?: Node;
  /** Resolved column ids. */
  columns: string[];
  functions: string[];
  returnType: ValueType;
  /** Maps `[name]` as written to the resolved column id (friendly names). */
  resolveColumn: (name: string) => string;
}

const BOOLEAN_KINDS: ExpressionKind[] = ['boolean', 'aggregatedBoolean'];

export function columnResolver(columns: readonly ColumnLike[] | undefined): (name: string) => string {
  if (!columns) return (n) => n;
  const byId = new Map(columns.map((c) => [c.id, c.id]));
  const byLower = new Map<string, string>();
  for (const c of columns) {
    byLower.set(c.id.toLowerCase(), c.id);
    if (c.header) byLower.set(c.header.toLowerCase(), c.id);
  }
  return (name) => byId.get(name) ?? byLower.get(name.toLowerCase()) ?? name;
}

export function validate(src: string, opts: ValidateOptions): ValidationResult {
  const errors: ExpressionError[] = [];
  const warnings: ExpressionError[] = [];
  const resolveColumn = columnResolver(opts.columns);
  const fail = (): ValidationResult => ({
    ok: false,
    errors,
    warnings,
    columns: [],
    functions: [],
    returnType: 'any',
    resolveColumn,
  });

  const allowWhere =
    opts.kind === 'aggregatedScalar' || opts.kind === 'aggregatedBoolean' || opts.kind === 'observable';
  let ast: Node;
  try {
    ast = parse(src, { allowWhere });
  } catch (e) {
    if (e instanceof ParseError) {
      errors.push(e.toError());
      return fail();
    }
    throw e;
  }

  // Columns
  const known = opts.columns ? new Map(opts.columns.map((c) => [c.id, c])) : undefined;
  walk(ast, (n) => {
    if (n.type !== 'column') return;
    const id = resolveColumn(n.id);
    if (known && !known.has(id) && !opts.allowUnknownColumns) {
      errors.push({ message: `Unknown column [${n.id}]`, start: n.span.start, end: n.span.end });
    }
  });

  // Functions
  const { functions } = opts.env;
  walk(ast, (n, parent) => {
    if (n.type !== 'call') return;
    const def = functions.get(n.name);
    const span = n.nameSpan;
    if (!def) {
      const hint = suggest(
        n.name,
        functions.list().map((d) => d.name),
      );
      errors.push({
        message: `Unknown function ${n.name}${hint ? `; did you mean ${hint}?` : ''}`,
        start: span.start,
        end: span.end,
      });
      return;
    }
    if (MODIFIER_FUNCTIONS.has(n.name) && n.name !== 'WHERE') {
      const okParent =
        parent?.type === 'call' &&
        (AGGREGATE_FUNCTIONS.has(parent.name) || OBSERVABLE_FUNCTIONS.has(parent.name));
      if (!okParent)
        errors.push({
          message: `${n.name} can only appear inside an aggregation function`,
          start: span.start,
          end: span.end,
        });
      return;
    }
    if (n.name === 'TIMEFRAME' || CHANGE_TYPES.has(n.name)) {
      const okParent = parent?.type === 'call' && OBSERVABLE_FUNCTIONS.has(parent.name);
      if (n.name === 'TIMEFRAME' && !okParent)
        errors.push({
          message: 'TIMEFRAME can only appear inside ROW_CHANGE, GRID_CHANGE, ROW_ADDED or ROW_REMOVED',
          start: span.start,
          end: span.end,
        });
      if (n.name === 'NONE' && !okParent)
        errors.push({
          message: 'NONE can only appear inside ROW_CHANGE or GRID_CHANGE',
          start: span.start,
          end: span.end,
        });
      if (CHANGE_TYPES.has(n.name) && okParent) return;
    }
    const aggregate = isAggregateCall(n);
    const effectiveKinds = aggregate ? def.kinds : (functions.get(n.name)?.kinds ?? []);
    if (
      !effectiveKinds.includes(opts.kind) &&
      !(n.name === 'MIN' || n.name === 'MAX' || n.name === 'AVG') &&
      !aggregate
    ) {
      errors.push({
        message: `${n.name} is not available in ${describeKind(opts.kind)}`,
        start: span.start,
        end: span.end,
      });
    } else if (aggregate && opts.kind !== 'aggregatedScalar' && opts.kind !== 'aggregatedBoolean') {
      errors.push({
        message: `${n.name} aggregates over rows and needs an aggregated expression`,
        start: span.start,
        end: span.end,
      });
    } else if (OBSERVABLE_FUNCTIONS.has(n.name) && opts.kind !== 'observable') {
      errors.push({
        message: `${n.name} is only valid in observable expressions`,
        start: span.start,
        end: span.end,
      });
    }
    if (!aggregate && !OBSERVABLE_FUNCTIONS.has(n.name) && !CHANGE_TYPES.has(n.name)) {
      const k = n.args.length;
      const { min, max } = def.arity;
      if (k < min || (max !== undefined && k > max)) {
        const expected = max === undefined ? `at least ${min}` : min === max ? `${min}` : `${min} to ${max}`;
        errors.push({
          message: `${def.name} expects ${expected} argument${expected === '1' ? '' : 's'}, got ${k}`,
          start: n.span.start,
          end: n.span.end,
        });
      }
    }
  });

  // Shape per kind
  if (opts.kind === 'observable') {
    const top = ast.type === 'where' ? ast.expr : ast;
    if (top.type !== 'call' || !OBSERVABLE_FUNCTIONS.has(top.name)) {
      errors.push({
        message: 'Observable expressions must start with ROW_CHANGE, GRID_CHANGE, ROW_ADDED or ROW_REMOVED',
        start: top.span.start,
        end: top.span.end,
      });
    }
  } else if (ast.type === 'where' && !allowWhere) {
    errors.push({
      message: 'WHERE is only valid in aggregated and observable expressions',
      start: ast.cond.span.start,
      end: ast.cond.span.end,
    });
  }
  if ((opts.kind === 'aggregatedScalar' || opts.kind === 'aggregatedBoolean') && errors.length === 0) {
    let hasAgg = false;
    walk(ast, (n) => {
      if (n.type === 'call' && isAggregateCall(n)) hasAgg = true;
    });
    if (!hasAgg)
      warnings.push({
        message: 'No aggregation function used; this evaluates like a per-row expression',
        start: ast.span.start,
        end: ast.span.end,
      });
  }

  // Return type
  const columnType = (name: string): ValueType => {
    const c = known?.get(resolveColumn(name));
    return c?.dataType ? valueTypeOf(c.dataType) : 'any';
  };
  const returnType = opts.kind === 'observable' ? 'boolean' : inferType(ast, columnType, functions);
  if (
    BOOLEAN_KINDS.includes(opts.kind) &&
    returnType !== 'boolean' &&
    returnType !== 'any' &&
    errors.length === 0
  ) {
    errors.push({
      message: `Condition must return true/false, but this returns ${returnType}`,
      start: ast.span.start,
      end: ast.span.end,
    });
  }

  // Compile to catch structural problems the walker cannot see
  if (errors.length === 0) {
    try {
      if (opts.kind === 'observable')
        compileObservable(ast, opts.env, { maxTimeframeMs: opts.maxTimeframeMs, resolveColumn });
      else if (opts.kind === 'aggregatedScalar' || opts.kind === 'aggregatedBoolean')
        compileAggregated(ast, opts.env, { resolveColumn });
      else compile(ast, opts.env, { resolveColumn });
    } catch (e) {
      if (e instanceof CompileError)
        errors.push({ message: e.message, start: e.span.start, end: e.span.end });
      else throw e;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ast,
    columns: columnsOf(ast).map(resolveColumn),
    functions: functionsOf(ast),
    returnType,
    resolveColumn,
  };
}

function describeKind(kind: ExpressionKind): string {
  switch (kind) {
    case 'scalar':
      return 'a per-row expression';
    case 'boolean':
      return 'a per-row condition';
    case 'aggregatedScalar':
      return 'an aggregated expression';
    case 'aggregatedBoolean':
      return 'an aggregated condition';
    case 'observable':
      return 'an observable expression';
  }
}

/** Closest name by edit distance when within 2 edits (typo help). */
export function suggest(name: string, candidates: readonly string[]): string | undefined {
  let best: { n: string; d: number } | undefined;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d <= 2 && (!best || d < best.d)) best = { n: c, d };
  }
  return best?.n;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
