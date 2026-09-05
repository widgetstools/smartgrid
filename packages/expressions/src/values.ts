/**
 * Value semantics shared by operators, functions and predicates: null
 * handling, numeric coercion (including AdapTable's 'K'/'M'/'B' magnitude
 * strings), date coercion, and case-insensitive text comparison.
 */
import type { Value } from './types.js';

export const isNil = (v: Value): v is null | undefined => v === null || v === undefined;

export function isBlank(v: Value): boolean {
  if (isNil(v)) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'number') return Number.isNaN(v);
  return false;
}

const MAGNITUDE: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** Number from a value; '5M' → 5_000_000; '1,234.5' → 1234.5; blank → undefined. */
export function toNumber(v: Value): number | undefined {
  if (typeof v === 'number') return Number.isNaN(v) ? undefined : v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return undefined;
    const m = /^([-+]?\d+(?:\.\d+)?)\s*([KMB])$/i.exec(s);
    if (m) return Number(m[1]) * MAGNITUDE[m[2]!.toUpperCase()]!;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function toDate(v: Value): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return undefined;
    // yyyy-MM-dd without time is parsed as local midnight, not UTC.
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : new Date(t);
  }
  return undefined;
}

export function toText(v: Value): string {
  if (isNil(v)) return '';
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toText).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function toBoolean(v: Value): boolean {
  if (isNil(v)) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s !== '' && s !== 'false' && s !== '0' && s !== 'no';
  }
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function normText(s: string, caseSensitive: boolean): string {
  return caseSensitive ? s : s.toLowerCase();
}

/**
 * Three-way compare with AdapTable semantics: numbers (and magnitude
 * strings) numerically, dates by time, otherwise as text. Returns undefined
 * when either side is blank or the values are incomparable.
 */
export function compare(a: Value, b: Value, caseSensitive: boolean): number | undefined {
  if (isNil(a) || isNil(b)) return undefined;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = toNumber(a);
    const y = toNumber(b);
    if (x === undefined || y === undefined) return undefined;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a instanceof Date || b instanceof Date) {
    const x = toDate(a);
    const y = toDate(b);
    if (x === undefined || y === undefined) return undefined;
    const d = x.getTime() - y.getTime();
    return d < 0 ? -1 : d > 0 ? 1 : 0;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = toBoolean(a);
    const y = toBoolean(b);
    return x === y ? 0 : x ? 1 : -1;
  }
  const x = normText(toText(a), caseSensitive);
  const y = normText(toText(b), caseSensitive);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Equality with the same coercions as `compare`; blank = blank is true. */
export function equals(a: Value, b: Value, caseSensitive: boolean): boolean {
  if (isNil(a) && isNil(b)) return true;
  if (isNil(a) || isNil(b)) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => equals(v, b[i], caseSensitive));
  }
  return compare(a, b, caseSensitive) === 0;
}

/** Arithmetic helper: both operands numeric, else undefined (propagates blanks). */
export function numbers(a: Value, b: Value): [number, number] | undefined {
  const x = toNumber(a);
  const y = toNumber(b);
  return x === undefined || y === undefined ? undefined : [x, y];
}

/** Parse a TIMEFRAME string: '30s', '5m', '2h', '1d' or milliseconds. */
export function parseDuration(v: Value): number | undefined {
  if (typeof v === 'number') return v >= 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/i.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  switch ((m[2] ?? 'ms').toLowerCase()) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    default:
      return undefined;
  }
}
