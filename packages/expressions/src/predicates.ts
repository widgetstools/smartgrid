import { PREDICATE_ARITY, type CellDataType, type Predicate, type PredicateId } from '@smartgrid/schema';

/**
 * Evaluation context shared by predicates and (later) expressions.
 * Hosts supply `holidays` for work-day predicates and `now` for tests.
 */
export interface PredicateContext {
  now?: () => Date;
  /** ISO dates (yyyy-mm-dd) that are not working days. */
  holidays?: ReadonlySet<string>;
  caseSensitive?: boolean;
  /** Previous value of the cell, for change-based predicates. */
  previousValue?: unknown;
}

export type PredicateHandler = (value: unknown, inputs: readonly unknown[], ctx: PredicateContext) => boolean;

export interface CustomPredicateDef {
  id: string;
  label: string;
  dataTypes?: CellDataType[];
  arity: 0 | 1 | 2 | 'list';
  handler: PredicateHandler;
}

const isBlank = (v: unknown) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function toText(v: unknown, ctx: PredicateContext): string {
  const s = v === null || v === undefined ? '' : String(v);
  return ctx.caseSensitive ? s : s.toLowerCase();
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function isWorkDay(d: Date, ctx: PredicateContext): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !(ctx.holidays?.has(isoDay(d)) ?? false);
}

function nextWorkDay(from: Date, ctx: PredicateContext): Date {
  let d = addDays(from, 1);
  while (!isWorkDay(d, ctx)) d = addDays(d, 1);
  return d;
}

function lastWorkDay(from: Date, ctx: PredicateContext): Date {
  let d = addDays(from, -1);
  while (!isWorkDay(d, ctx)) d = addDays(d, -1);
  return d;
}

function inList(value: unknown, inputs: readonly unknown[], ctx: PredicateContext): boolean {
  // Array cells match if any element is in the list.
  const values = Array.isArray(value) ? value : [value];
  const wanted = inputs.map((i) => normalise(i, ctx));
  return values.some((v) => wanted.includes(normalise(v, ctx)));
}

function normalise(v: unknown, ctx: PredicateContext): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  return ctx.caseSensitive ? String(v) : String(v).toLowerCase();
}

const num = (handler: (n: number, inputs: number[]) => boolean): PredicateHandler => {
  return (value, inputs) => {
    const n = toNumber(value);
    if (n === undefined) return false;
    const ins = inputs.map(toNumber);
    if (ins.some((i) => i === undefined)) return false;
    return handler(n, ins as number[]);
  };
};

const date = (
  handler: (d: Date, inputs: Date[], ctx: PredicateContext, now: Date) => boolean,
): PredicateHandler => {
  return (value, inputs, ctx) => {
    const d = toDate(value);
    if (!d) return false;
    const ins = inputs.map(toDate);
    if (ins.some((i) => i === undefined)) return false;
    return handler(d, ins as Date[], ctx, (ctx.now ?? (() => new Date()))());
  };
};

/** System predicate implementations, keyed by AdapTable-compatible id. */
export const SYSTEM_PREDICATES: Record<PredicateId, PredicateHandler> = {
  Blanks: (v) => isBlank(v),
  NonBlanks: (v) => !isBlank(v),
  In: (v, inputs, ctx) => inList(v, inputs, ctx),
  NotIn: (v, inputs, ctx) => !inList(v, inputs, ctx),
  AnyChange: (v, _i, ctx) =>
    ctx.previousValue !== undefined && normalise(v, ctx) !== normalise(ctx.previousValue, ctx),

  Equals: num((n, [a]) => n === a),
  NotEquals: num((n, [a]) => n !== a),
  GreaterThan: num((n, [a]) => n > a!),
  GreaterThanOrEqual: num((n, [a]) => n >= a!),
  LessThan: num((n, [a]) => n < a!),
  LessThanOrEqual: num((n, [a]) => n <= a!),
  Positive: num((n) => n > 0),
  Negative: num((n) => n < 0),
  Zero: num((n) => n === 0),
  Between: num((n, [a, b]) => n >= Math.min(a!, b!) && n <= Math.max(a!, b!)),
  NotBetween: num((n, [a, b]) => n < Math.min(a!, b!) || n > Math.max(a!, b!)),
  PercentChange: (v, inputs, ctx) => {
    const n = toNumber(v);
    const p = toNumber(ctx.previousValue);
    const threshold = toNumber(inputs[0]);
    if (n === undefined || p === undefined || threshold === undefined || p === 0) return false;
    return Math.abs(((n - p) / Math.abs(p)) * 100) >= threshold;
  },

  Is: (v, [a], ctx) => toText(v, ctx) === toText(a, ctx),
  IsNot: (v, [a], ctx) => toText(v, ctx) !== toText(a, ctx),
  Contains: (v, [a], ctx) => toText(v, ctx).includes(toText(a, ctx)),
  NotContains: (v, [a], ctx) => !toText(v, ctx).includes(toText(a, ctx)),
  StartsWith: (v, [a], ctx) => toText(v, ctx).startsWith(toText(a, ctx)),
  EndsWith: (v, [a], ctx) => toText(v, ctx).endsWith(toText(a, ctx)),
  Regex: (v, [a], ctx) => {
    try {
      return new RegExp(String(a), ctx.caseSensitive ? '' : 'i').test(
        v === null || v === undefined ? '' : String(v),
      );
    } catch {
      return false;
    }
  },

  Today: date((d, _i, _c, now) => sameDay(d, now)),
  Yesterday: date((d, _i, _c, now) => sameDay(d, addDays(now, -1))),
  Tomorrow: date((d, _i, _c, now) => sameDay(d, addDays(now, 1))),
  ThisWeek: date((d, _i, _c, now) => {
    const start = addDays(startOfDay(now), -((now.getDay() + 6) % 7)); // Monday
    const end = addDays(start, 7);
    return d >= start && d < end;
  }),
  ThisMonth: date(
    (d, _i, _c, now) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(),
  ),
  ThisQuarter: date(
    (d, _i, _c, now) =>
      d.getFullYear() === now.getFullYear() &&
      Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3),
  ),
  ThisYear: date((d, _i, _c, now) => d.getFullYear() === now.getFullYear()),
  InPast: date((d, _i, _c, now) => d < now),
  InFuture: date((d, _i, _c, now) => d > now),
  Before: date((d, [a]) => d < a!),
  After: date((d, [a]) => d > a!),
  On: date((d, [a]) => sameDay(d, a!)),
  NotOn: date((d, [a]) => !sameDay(d, a!)),
  NextWorkDay: date((d, _i, ctx, now) => sameDay(d, nextWorkDay(now, ctx))),
  LastWorkDay: date((d, _i, ctx, now) => sameDay(d, lastWorkDay(now, ctx))),
  WorkDay: date((d, _i, ctx) => isWorkDay(d, ctx)),
  Holiday: date((d, _i, ctx) => ctx.holidays?.has(isoDay(d)) ?? false),
  Range: date((d, [a, b]) => d >= a! && d <= b!),

  True: (v) => v === true || v === 'true' || v === 1,
  False: (v) => v === false || v === 'false' || v === 0,
};

export class PredicateRegistry {
  private custom = new Map<string, CustomPredicateDef>();

  register(def: CustomPredicateDef): this {
    this.custom.set(def.id, def);
    return this;
  }

  has(id: string): boolean {
    return id in SYSTEM_PREDICATES || this.custom.has(id);
  }

  arity(id: string): 0 | 1 | 2 | 'list' | undefined {
    if (id in SYSTEM_PREDICATES) return PREDICATE_ARITY[id as PredicateId];
    return this.custom.get(id)?.arity;
  }

  /** Evaluate one predicate against a value. Unknown ids evaluate to false. */
  evaluate(predicate: Predicate, value: unknown, ctx: PredicateContext = {}): boolean {
    const handler =
      SYSTEM_PREDICATES[predicate.predicateId as PredicateId] ??
      this.custom.get(predicate.predicateId)?.handler;
    if (!handler) return false;
    return handler(value, predicate.inputs ?? [], ctx);
  }

  /** Validate a predicate's shape: known id and matching input count. */
  validate(predicate: Predicate): string | undefined {
    const arity = this.arity(predicate.predicateId);
    if (arity === undefined) return `Unknown predicate "${predicate.predicateId}"`;
    const n = predicate.inputs?.length ?? 0;
    if (arity === 'list')
      return n === 0 ? `Predicate "${predicate.predicateId}" needs at least one value` : undefined;
    if (n !== arity) return `Predicate "${predicate.predicateId}" expects ${arity} input(s), got ${n}`;
    return undefined;
  }
}

export const defaultPredicateRegistry = new PredicateRegistry();
