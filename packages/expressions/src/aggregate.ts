/**
 * Aggregated tier: expressions whose leaves aggregate over many rows.
 *
 *   SUM([PnL]) > '5M' WHERE [Currency] = 'USD'
 *   AVG([Price], WEIGHT([Notional]))
 *   SUM([PnL], GROUP_BY([Desk], [Book]))
 *   PERCENTAGE([Open], SUM([Closed], GROUP_BY([Language])))
 *   CUMUL(SUM([Stars]), OVER([CreatedAt]))
 *   QUANT([Value], 4, GROUP_BY([Type]))   QUARTILE([x])   PERCENTILE([x])
 *
 * Aggregate calls are lowered to closures that read an evaluation session
 * (the row set, the WHERE filter, per-call caches). `evaluateRow` serves
 * calculated columns; `evaluate` serves alerts (per group when GROUP_BY is
 * present).
 */
import { compile, CompileError, type Compiled } from './compile.js';
import { parse } from './parser.js';
import type { Env, Node, RowContext, Value } from './types.js';
import { isNil, toBoolean, toNumber } from './values.js';

type CallNode = Extract<Node, { type: 'call' }>;

export const AGGREGATE_FUNCTIONS = new Set([
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'MEDIAN',
  'COUNT',
  'MODE',
  'DISTINCT',
  'ONLY',
  'STD_DEVIATION',
  'PERCENTAGE',
  'CUMUL',
  'QUANT',
  'QUARTILE',
  'PERCENTILE',
]);
export const MODIFIER_FUNCTIONS = new Set(['GROUP_BY', 'WHERE', 'WEIGHT', 'OVER']);

/** MIN/MAX/AVG double as scalar functions; they aggregate with one argument or any modifier argument. */
export function isAggregateCall(node: CallNode): boolean {
  if (!AGGREGATE_FUNCTIONS.has(node.name)) return false;
  if (node.name === 'MIN' || node.name === 'MAX' || node.name === 'AVG') {
    return (
      node.args.length <= 1 || node.args.some((a) => a.type === 'call' && MODIFIER_FUNCTIONS.has(a.name))
    );
  }
  return true;
}

export interface GroupResult {
  key: string;
  values: Record<string, Value>;
  value: Value;
}

export interface AggregatedProgram {
  /** Value for one row (calculated column); GROUP_BY groups relative to that row. */
  evaluateRow(target: RowContext, rows: readonly RowContext[]): Value;
  /** Grid-level value, or one per group when GROUP_BY is present. */
  evaluate(rows: readonly RowContext[]): { value: Value; groups?: GroupResult[] };
  /** Columns read anywhere in the expression. */
  columns: string[];
  groupBy: string[];
}

interface Session {
  rows: readonly RowContext[];
  filtered?: readonly RowContext[];
  cache: Map<string, Value>;
  sorted: Map<string, RowContext[]>;
}

interface AggSpec {
  id: number;
  name: string;
  value?: Compiled;
  arg2?: Compiled;
  n?: number;
  groupBy: string[];
  weight?: Compiled;
  over?: Compiled;
  /** For CUMUL: the inner aggregate. */
  inner?: AggSpec;
}

const EMPTY_ROW: RowContext = { get: () => undefined };

export function compileAggregated(
  node: Node,
  env: Env,
  opts: { resolveColumn?: (name: string) => string } = {},
): AggregatedProgram {
  let where: Compiled | undefined;
  let expr = node;
  if (node.type === 'where') {
    expr = node.expr;
    where = compile(node.cond, env, opts);
  }
  let session: Session | undefined;
  let nextId = 0;
  const groupBys: string[][] = [];
  const columns = new Set<string>();

  const resolve = (name: string) => (opts.resolveColumn ? opts.resolveColumn(name) : name);

  const modifierColumns = (arg: Node, what: string): string[] => {
    if (arg.type !== 'call') throw new CompileError(`${what} expects column references`, arg.span);
    return arg.args.map((a) => {
      if (a.type !== 'column')
        throw new CompileError(`${what} expects column references like [Column]`, a.span);
      columns.add(resolve(a.id));
      return resolve(a.id);
    });
  };

  const buildSpec = (call: CallNode, compileChild: (n: Node) => Compiled): AggSpec => {
    const spec: AggSpec = { id: nextId++, name: call.name, groupBy: [] };
    const plain: Node[] = [];
    for (const a of call.args) {
      if (a.type === 'call' && a.name === 'GROUP_BY') spec.groupBy = modifierColumns(a, 'GROUP_BY');
      else if (a.type === 'call' && a.name === 'WEIGHT') {
        if (a.args.length !== 1) throw new CompileError('WEIGHT expects one argument', a.span);
        spec.weight = compileChild(a.args[0]!);
      } else if (a.type === 'call' && a.name === 'OVER') {
        if (a.args.length !== 1) throw new CompileError('OVER expects one argument', a.span);
        spec.over = compileChild(a.args[0]!);
      } else if (a.type === 'call' && a.name === 'WHERE') {
        throw new CompileError('WHERE belongs at the end of the expression: expr WHERE condition', a.span);
      } else plain.push(a);
    }
    if (spec.groupBy.length) groupBys.push(spec.groupBy);

    switch (call.name) {
      case 'CUMUL': {
        const inner = plain[0];
        if (!inner || inner.type !== 'call' || !isAggregateCall(inner)) {
          throw new CompileError(
            'CUMUL expects an aggregation, e.g. CUMUL(SUM([x]), OVER([date]))',
            call.span,
          );
        }
        if (!spec.over)
          throw new CompileError('CUMUL needs OVER([column]) to define the running order', call.span);
        spec.inner = buildSpec(inner, compileChild);
        break;
      }
      case 'QUANT': {
        if (plain.length < 1 || plain.length > 2)
          throw new CompileError('QUANT expects QUANT([value], buckets)', call.span);
        spec.value = compileChild(plain[0]!);
        const n = plain[1];
        if (n) {
          if (n.type !== 'literal' || typeof n.value !== 'number')
            throw new CompileError('QUANT bucket count must be a number', n.span);
          spec.n = n.value;
        } else spec.n = 4;
        break;
      }
      case 'QUARTILE':
      case 'PERCENTILE':
        if (plain.length !== 1) throw new CompileError(`${call.name} expects one argument`, call.span);
        spec.value = compileChild(plain[0]!);
        spec.n = call.name === 'QUARTILE' ? 4 : 100;
        break;
      case 'PERCENTAGE':
        if (plain.length < 1 || plain.length > 2)
          throw new CompileError('PERCENTAGE expects PERCENTAGE([part], total?)', call.span);
        spec.value = compileChild(plain[0]!);
        if (plain[1]) spec.arg2 = compileChild(plain[1]!);
        break;
      case 'COUNT':
        if (plain.length > 1) throw new CompileError('COUNT expects at most one argument', call.span);
        if (plain[0]) spec.value = compileChild(plain[0]!);
        break;
      default:
        if (plain.length !== 1) throw new CompileError(`${call.name} expects one value argument`, call.span);
        spec.value = compileChild(plain[0]!);
    }
    return spec;
  };

  const compiled = compile(expr, env, {
    resolveColumn: opts.resolveColumn,
    lowerCall: (call, compileChild) => {
      if (!isAggregateCall(call)) return undefined;
      const spec = buildSpec(call, compileChild);
      return (target) => {
        if (!session) throw new Error('Aggregated expression evaluated outside a session');
        return aggregate(spec, target, session, env);
      };
    },
  });

  // Column bookkeeping for hosts (dependency tracking)
  collectColumns(expr, resolve, columns);
  if (node.type === 'where') collectColumns(node.cond, resolve, columns);

  const run = <T>(rows: readonly RowContext[], fn: () => T): T => {
    session = { rows, cache: new Map(), sorted: new Map() };
    if (where) session.filtered = rows.filter((r) => toBoolean(where!(r)));
    try {
      return fn();
    } finally {
      session = undefined;
    }
  };

  const groupBy = groupBys[0] ?? [];

  return {
    columns: [...columns],
    groupBy,
    evaluateRow: (target, rows) => run(rows, () => compiled(target)),
    evaluate: (rows) =>
      run(rows, () => {
        const base = session!.filtered ?? session!.rows;
        if (groupBy.length === 0) return { value: compiled(base[0] ?? EMPTY_ROW) };
        const groups: GroupResult[] = [];
        const seen = new Set<string>();
        for (const r of base) {
          const key = groupKey(groupBy, r);
          if (seen.has(key)) continue;
          seen.add(key);
          const values: Record<string, Value> = {};
          for (const c of groupBy) values[c] = r.get(c);
          groups.push({ key, values, value: compiled(r) });
        }
        return { value: groups.some((g) => toBoolean(g.value)), groups };
      }),
  };
}

/** Parse + compile an aggregated expression. */
export function compileAggregatedSource(
  src: string,
  env: Env,
  opts?: { resolveColumn?: (name: string) => string },
): AggregatedProgram {
  return compileAggregated(parse(src), env, opts);
}

function collectColumns(node: Node, resolve: (n: string) => string, out: Set<string>): void {
  const visit = (n: Node) => {
    switch (n.type) {
      case 'column':
        out.add(resolve(n.id));
        break;
      case 'unary':
        visit(n.arg);
        break;
      case 'binary':
        visit(n.left);
        visit(n.right);
        break;
      case 'ternary':
        visit(n.cond);
        visit(n.then);
        visit(n.else);
        break;
      case 'case':
        if (n.subject) visit(n.subject);
        for (const w of n.whens) {
          visit(w.when);
          visit(w.then);
        }
        if (n.else) visit(n.else);
        break;
      case 'call':
        n.args.forEach(visit);
        break;
      case 'where':
        visit(n.expr);
        visit(n.cond);
        break;
      default:
        break;
    }
  };
  visit(node);
}

function groupKey(cols: readonly string[], row: RowContext): string {
  return cols.map((c) => keyPart(row.get(c))).join('');
}

function keyPart(v: Value): string {
  if (isNil(v)) return '';
  if (v instanceof Date) return `d:${v.getTime()}`;
  return typeof v === 'object' ? JSON.stringify(v) : `${typeof v}:${String(v)}`;
}

function rowsFor(spec: AggSpec, target: RowContext, session: Session): readonly RowContext[] {
  const base = session.filtered ?? session.rows;
  if (spec.groupBy.length === 0) return base;
  const key = groupKey(spec.groupBy, target);
  const cacheKey = `g:${spec.groupBy.join(',')}:${key}`;
  let rows = session.sorted.get(cacheKey);
  if (!rows) {
    rows = base.filter((r) => groupKey(spec.groupBy, r) === key);
    session.sorted.set(cacheKey, rows);
  }
  return rows;
}

function aggregate(spec: AggSpec, target: RowContext, session: Session, env: Env): Value {
  const rows = rowsFor(spec, target, session);
  switch (spec.name) {
    case 'CUMUL':
      return cumulative(spec, target, rows, session, env);
    case 'QUANT':
    case 'QUARTILE':
    case 'PERCENTILE':
      return quantile(spec, target, rows);
    case 'PERCENTAGE': {
      const part = toNumber(spec.value!(target));
      const total = spec.arg2
        ? toNumber(spec.arg2(target))
        : toNumber(cached(spec, target, rows, session, () => reduce('SUM', values(spec, rows))));
      if (part === undefined || total === undefined || total === 0) return undefined;
      return (part / total) * 100;
    }
    default:
      return cached(spec, target, rows, session, () => {
        if (spec.name === 'AVG' && spec.weight) {
          let num = 0;
          let den = 0;
          for (const r of rows) {
            const v = toNumber(spec.value!(r));
            const w = toNumber(spec.weight!(r));
            if (v === undefined || w === undefined) continue;
            num += v * w;
            den += w;
          }
          return den === 0 ? undefined : num / den;
        }
        if (spec.name === 'COUNT' && !spec.value) return rows.length;
        return reduce(spec.name, values(spec, rows));
      });
  }
}

function cached(
  spec: AggSpec,
  target: RowContext,
  rows: readonly RowContext[],
  session: Session,
  fn: () => Value,
): Value {
  const key = `${spec.id}:${spec.groupBy.length ? groupKey(spec.groupBy, target) : ''}`;
  if (session.cache.has(key)) return session.cache.get(key);
  const v = fn();
  session.cache.set(key, v);
  return v;
}

function values(spec: AggSpec, rows: readonly RowContext[]): Value[] {
  const out: Value[] = [];
  for (const r of rows) {
    const v = spec.value!(r);
    if (!isNil(v) && !(typeof v === 'string' && v.trim() === '')) out.push(v);
  }
  return out;
}

const nums = (vals: Value[]): number[] => vals.map(toNumber).filter((n): n is number => n !== undefined);

/** Reduce a list with a named aggregate. Exported for hosts (row summaries, group aggregations). */
export function reduce(name: string, vals: Value[]): Value {
  switch (name) {
    case 'SUM': {
      const n = nums(vals);
      return n.length ? n.reduce((a, b) => a + b, 0) : undefined;
    }
    case 'AVG': {
      const n = nums(vals);
      return n.length ? n.reduce((a, b) => a + b, 0) / n.length : undefined;
    }
    case 'MIN': {
      const n = nums(vals);
      return n.length ? Math.min(...n) : undefined;
    }
    case 'MAX': {
      const n = nums(vals);
      return n.length ? Math.max(...n) : undefined;
    }
    case 'MEDIAN': {
      const n = nums(vals).sort((a, b) => a - b);
      if (!n.length) return undefined;
      const mid = Math.floor(n.length / 2);
      return n.length % 2 ? n[mid] : (n[mid - 1]! + n[mid]!) / 2;
    }
    case 'COUNT':
      return vals.length;
    case 'MODE': {
      if (!vals.length) return undefined;
      const counts = new Map<string, { v: Value; n: number }>();
      for (const v of vals) {
        const k = keyPart(v);
        const e = counts.get(k);
        if (e) e.n++;
        else counts.set(k, { v, n: 1 });
      }
      let best: { v: Value; n: number } | undefined;
      for (const e of counts.values()) if (!best || e.n > best.n) best = e;
      return best?.v;
    }
    case 'DISTINCT': {
      const seen = new Map<string, Value>();
      for (const v of vals) if (!seen.has(keyPart(v))) seen.set(keyPart(v), v);
      return seen.size;
    }
    case 'ONLY': {
      if (!vals.length) return undefined;
      const first = keyPart(vals[0]!);
      return vals.every((v) => keyPart(v) === first) ? vals[0] : undefined;
    }
    case 'STD_DEVIATION': {
      const n = nums(vals);
      if (n.length < 2) return undefined;
      const mean = n.reduce((a, b) => a + b, 0) / n.length;
      const variance = n.reduce((a, b) => a + (b - mean) ** 2, 0) / (n.length - 1);
      return Math.sqrt(variance);
    }
    default:
      throw new Error(`Unknown aggregate ${name}`);
  }
}

function cumulative(
  spec: AggSpec,
  target: RowContext,
  rows: readonly RowContext[],
  session: Session,
  env: Env,
): Value {
  const inner = spec.inner!;
  const key = `s:${spec.id}:${spec.groupBy.length ? groupKey(spec.groupBy, target) : ''}`;
  let sorted = session.sorted.get(key);
  if (!sorted) {
    sorted = [...rows].sort((a, b) => {
      const x = toNumber(spec.over!(a)) ?? Number.POSITIVE_INFINITY;
      const y = toNumber(spec.over!(b)) ?? Number.POSITIVE_INFINITY;
      return x - y;
    });
    session.sorted.set(key, sorted);
  }
  const idx = sorted.indexOf(target);
  const upTo = idx >= 0 ? sorted.slice(0, idx + 1) : sorted;
  void env;
  if (inner.name === 'AVG' && inner.weight) {
    let num = 0;
    let den = 0;
    for (const r of upTo) {
      const v = toNumber(inner.value!(r));
      const w = toNumber(inner.weight(r));
      if (v === undefined || w === undefined) continue;
      num += v * w;
      den += w;
    }
    return den === 0 ? undefined : num / den;
  }
  if (inner.name === 'COUNT' && !inner.value) return upTo.length;
  return reduce(inner.name, values(inner, upTo));
}

function quantile(spec: AggSpec, target: RowContext, rows: readonly RowContext[]): Value {
  const v = toNumber(spec.value!(target));
  if (v === undefined) return undefined;
  const all = nums(values(spec, rows)).sort((a, b) => a - b);
  if (!all.length) return undefined;
  // rank = number of values <= v (1-based position of the last equal value)
  let rank = 0;
  for (const x of all) if (x <= v) rank++;
  const n = spec.n ?? 4;
  return Math.max(1, Math.ceil((rank / all.length) * n));
}
