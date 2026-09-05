/**
 * Observable tier: change-over-time conditions used by alerts.
 *
 *   ROW_CHANGE(COUNT([Price], 3), TIMEFRAME('5m'))            three changes to Price in a row within 5 min
 *   ROW_CHANGE(MIN([Price]), TIMEFRAME('1h'))                 a row's Price hits a new 1-hour low
 *   GRID_CHANGE(NONE([Price]), TIMEFRAME('30s')) WHERE …      no Price change anywhere for 30 s
 *   ROW_ADDED()   ROW_ADDED(5, TIMEFRAME('1m'))   ROW_REMOVED(3, TIMEFRAME('5m'))
 *
 * `compileObservable` turns the AST into a spec; `ObservableWatcher` is the
 * sliding-window runtime the engine feeds row events into. It is pure and
 * clock-agnostic: events carry timestamps and `tick(now)` drives NONE.
 */
import { compile, CompileError, type Compiled } from './compile.js';
import { parse } from './parser.js';
import type { Env, Node, RowContext, Value } from './types.js';
import { parseDuration, toBoolean, toNumber } from './values.js';

export const OBSERVABLE_FUNCTIONS = new Set(['ROW_CHANGE', 'GRID_CHANGE', 'ROW_ADDED', 'ROW_REMOVED']);
export const CHANGE_TYPES = new Set(['COUNT', 'MIN', 'MAX', 'NONE']);

export type ChangeType = 'COUNT' | 'MIN' | 'MAX' | 'NONE';

export interface ObservableSpec {
  source: 'ROW_CHANGE' | 'GRID_CHANGE' | 'ROW_ADDED' | 'ROW_REMOVED';
  /** Which changes to watch (ROW_CHANGE / GRID_CHANGE). `columnId` undefined = any column. */
  change?: { type: ChangeType; columnId?: string; count: number };
  /** Threshold for ROW_ADDED / ROW_REMOVED; undefined fires on every event. */
  count?: number;
  timeframeMs?: number;
  where?: Compiled;
  columns: string[];
}

export const DEFAULT_MAX_TIMEFRAME_MS = 8 * 3_600_000;
export const HARD_MAX_TIMEFRAME_MS = 24 * 3_600_000;

export function compileObservable(
  node: Node,
  env: Env,
  opts: { maxTimeframeMs?: number; resolveColumn?: (n: string) => string } = {},
): ObservableSpec {
  let where: Compiled | undefined;
  let expr = node;
  if (node.type === 'where') {
    expr = node.expr;
    where = compile(node.cond, env, { resolveColumn: opts.resolveColumn });
  }
  if (expr.type !== 'call' || !OBSERVABLE_FUNCTIONS.has(expr.name)) {
    throw new CompileError(
      'An observable expression must start with ROW_CHANGE, GRID_CHANGE, ROW_ADDED or ROW_REMOVED',
      expr.span,
    );
  }
  const resolve = (n: string) => (opts.resolveColumn ? opts.resolveColumn(n) : n);
  const columns = new Set<string>();
  if (node.type === 'where') {
    const walkCols = (n: Node): void => {
      switch (n.type) {
        case 'column':
          columns.add(resolve(n.id));
          break;
        case 'unary':
          walkCols(n.arg);
          break;
        case 'binary':
          walkCols(n.left);
          walkCols(n.right);
          break;
        case 'ternary':
          walkCols(n.cond);
          walkCols(n.then);
          walkCols(n.else);
          break;
        case 'call':
          n.args.forEach(walkCols);
          break;
        case 'case':
          if (n.subject) walkCols(n.subject);
          for (const w of n.whens) {
            walkCols(w.when);
            walkCols(w.then);
          }
          if (n.else) walkCols(n.else);
          break;
        default:
          break;
      }
    };
    walkCols(node.cond);
  }
  const max = Math.min(opts.maxTimeframeMs ?? DEFAULT_MAX_TIMEFRAME_MS, HARD_MAX_TIMEFRAME_MS);
  let timeframeMs: number | undefined;
  const plain: Node[] = [];
  for (const a of expr.args) {
    if (a.type === 'call' && a.name === 'TIMEFRAME') {
      const arg = a.args[0];
      if (a.args.length !== 1 || !arg || arg.type !== 'literal')
        throw new CompileError("TIMEFRAME expects one value like '5m'", a.span);
      const ms = parseDuration(arg.value as Value);
      if (ms === undefined)
        throw new CompileError(`Invalid timeframe "${String(arg.value)}"; use 30s, 5m, 2h or 1d`, arg.span);
      if (ms > max)
        throw new CompileError(`Timeframe exceeds the maximum of ${Math.round(max / 3_600_000)}h`, arg.span);
      timeframeMs = ms;
    } else plain.push(a);
  }

  const spec: ObservableSpec = {
    source: expr.name as ObservableSpec['source'],
    timeframeMs,
    where,
    columns: [...columns],
  };

  if (spec.source === 'ROW_ADDED' || spec.source === 'ROW_REMOVED') {
    if (plain.length > 1)
      throw new CompileError(`${spec.source} expects an optional count and TIMEFRAME`, expr.span);
    const n = plain[0];
    if (n) {
      if (n.type !== 'literal' || typeof n.value !== 'number')
        throw new CompileError('Count must be a number', n.span);
      spec.count = n.value;
      if (timeframeMs === undefined)
        throw new CompileError(`${spec.source} with a count needs TIMEFRAME(...)`, expr.span);
    }
    return spec;
  }

  const ch = plain[0];
  if (plain.length !== 1 || !ch || ch.type !== 'call' || !CHANGE_TYPES.has(ch.name)) {
    throw new CompileError(
      `${spec.source} expects a change type: COUNT([col], n), MIN([col]), MAX([col]) or NONE([col])`,
      expr.span,
    );
  }
  if (timeframeMs === undefined) throw new CompileError(`${spec.source} needs TIMEFRAME(...)`, expr.span);
  const colArg = ch.args[0];
  let columnId: string | undefined;
  if (colArg) {
    if (colArg.type !== 'column')
      throw new CompileError(`${ch.name} expects a column reference`, colArg.span);
    columnId = resolve(colArg.id);
    columns.add(columnId);
  }
  let count = 1;
  if (ch.name === 'COUNT') {
    const n = ch.args[1];
    if (n) {
      if (n.type !== 'literal' || typeof n.value !== 'number' || n.value < 1)
        throw new CompileError('COUNT threshold must be a positive number', n.span);
      count = n.value;
    }
    if (ch.args.length > 2) throw new CompileError('COUNT expects COUNT([col], n)', ch.span);
  } else if (ch.args.length > 1) throw new CompileError(`${ch.name} expects one column`, ch.span);
  if ((ch.name === 'MIN' || ch.name === 'MAX') && !columnId)
    throw new CompileError(`${ch.name} needs a column`, ch.span);
  spec.change = { type: ch.name as ChangeType, columnId, count };
  spec.columns = [...columns];
  return spec;
}

export function compileObservableSource(
  src: string,
  env: Env,
  opts?: Parameters<typeof compileObservable>[2],
): ObservableSpec {
  return compileObservable(parse(src), env, opts);
}

export type RowEvent =
  | {
      kind: 'change';
      rowId: string;
      columnId: string;
      oldValue: Value;
      newValue: Value;
      row: RowContext;
      at: number;
    }
  | { kind: 'added' | 'removed'; rowId: string; row: RowContext; at: number };

export interface ObservableTrigger {
  at: number;
  /** Row that satisfied the condition; undefined for grid-level triggers. */
  rowId?: string;
  row?: RowContext;
  reason: string;
  value?: Value;
}

interface Window {
  times: number[];
  values: number[];
  lastAt?: number;
  /** For NONE: time we last fired, so a silent row triggers once per silence. */
  firedAt?: number;
  lastRow?: RowContext;
}

/** Sliding-window runtime for one observable spec. Feed events in time order. */
export class ObservableWatcher {
  private readonly windows = new Map<string, Window>();
  private readonly startedAt: number;

  constructor(
    readonly spec: ObservableSpec,
    opts: { startedAt?: number } = {},
  ) {
    this.startedAt = opts.startedAt ?? 0;
  }

  reset(): void {
    this.windows.clear();
  }

  private key(rowId: string): string {
    return this.spec.source === 'GRID_CHANGE' ? '*' : rowId;
  }

  private window(key: string): Window {
    let w = this.windows.get(key);
    if (!w) {
      w = { times: [], values: [] };
      this.windows.set(key, w);
    }
    return w;
  }

  private prune(w: Window, now: number): void {
    const tf = this.spec.timeframeMs;
    if (tf === undefined) return;
    const cutoff = now - tf;
    let i = 0;
    while (i < w.times.length && w.times[i]! < cutoff) i++;
    if (i > 0) {
      w.times.splice(0, i);
      w.values.splice(0, i);
    }
  }

  push(event: RowEvent): ObservableTrigger[] {
    const { spec } = this;
    if (spec.where && !toBoolean(spec.where(event.row))) return [];
    const now = event.at;

    if (spec.source === 'ROW_ADDED' || spec.source === 'ROW_REMOVED') {
      const want = spec.source === 'ROW_ADDED' ? 'added' : 'removed';
      if (event.kind !== want) return [];
      if (spec.count === undefined)
        return [{ at: now, rowId: event.rowId, row: event.row, reason: `row ${want}` }];
      const w = this.window('*');
      this.prune(w, now);
      w.times.push(now);
      w.values.push(0);
      if (w.times.length >= spec.count) {
        const n = w.times.length;
        w.times.length = 0;
        w.values.length = 0;
        return [
          {
            at: now,
            rowId: event.rowId,
            row: event.row,
            reason: `${n} rows ${want} within timeframe`,
            value: n,
          },
        ];
      }
      return [];
    }

    if (event.kind !== 'change') {
      if (event.kind === 'removed') this.windows.delete(this.key(event.rowId));
      return [];
    }
    const ch = spec.change!;
    if (ch.columnId && event.columnId !== ch.columnId) return [];
    const w = this.window(this.key(event.rowId));
    this.prune(w, now);
    const rowId = spec.source === 'GRID_CHANGE' ? undefined : event.rowId;
    const num = toNumber(event.newValue);
    w.lastAt = now;
    w.lastRow = event.row;
    w.firedAt = undefined;

    switch (ch.type) {
      case 'COUNT': {
        w.times.push(now);
        w.values.push(num ?? 0);
        if (w.times.length >= ch.count) {
          const n = w.times.length;
          w.times.length = 0;
          w.values.length = 0;
          return [
            {
              at: now,
              rowId,
              row: event.row,
              reason: `${n} changes${ch.columnId ? ` to ${ch.columnId}` : ''} within timeframe`,
              value: n,
            },
          ];
        }
        return [];
      }
      case 'MIN':
      case 'MAX': {
        if (num === undefined) return [];
        const prev = w.values;
        const extreme = ch.type === 'MIN' ? Math.min(...prev) : Math.max(...prev);
        const isNew = prev.length > 0 && (ch.type === 'MIN' ? num < extreme : num > extreme);
        w.times.push(now);
        w.values.push(num);
        return isNew
          ? [
              {
                at: now,
                rowId,
                row: event.row,
                reason: `new ${ch.type === 'MIN' ? 'low' : 'high'} for ${ch.columnId}`,
                value: num,
              },
            ]
          : [];
      }
      case 'NONE':
        // Any change resets the silence clock; triggers come from tick().
        w.times.push(now);
        w.values.push(num ?? 0);
        return [];
    }
  }

  /** Advance the clock: fires NONE conditions for rows silent for the whole timeframe. */
  tick(now: number): ObservableTrigger[] {
    const { spec } = this;
    if (spec.change?.type !== 'NONE' || spec.timeframeMs === undefined) return [];
    const out: ObservableTrigger[] = [];
    const tf = spec.timeframeMs;
    if (spec.source === 'GRID_CHANGE') {
      const w = this.window('*');
      const last = w.lastAt ?? this.startedAt;
      if (now - last >= tf && (w.firedAt === undefined || w.firedAt < last)) {
        w.firedAt = now;
        out.push({
          at: now,
          reason: `no change${spec.change.columnId ? ` to ${spec.change.columnId}` : ''} for the timeframe`,
        });
      }
      return out;
    }
    for (const [rowId, w] of this.windows) {
      const last = w.lastAt ?? this.startedAt;
      if (now - last >= tf && (w.firedAt === undefined || w.firedAt < last)) {
        w.firedAt = now;
        out.push({
          at: now,
          rowId,
          row: w.lastRow,
          reason: `no change${spec.change.columnId ? ` to ${spec.change.columnId}` : ''} for the timeframe`,
        });
      }
    }
    return out;
  }

  /** Register a row so NONE can fire for rows that never change. */
  track(rowId: string, row: RowContext, at: number): void {
    const w = this.window(this.key(rowId));
    w.lastAt ??= at;
    w.lastRow ??= row;
  }
}
