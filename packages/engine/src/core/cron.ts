/**
 * Minimal 5-field cron (minute hour day-of-month month day-of-week) for
 * scheduled alerts and reports. Supports `*`, values, lists, ranges and
 * steps (`*\/5`, `1-10/2`), month and weekday names, and `7` as Sunday.
 * Standard semantics: when both day fields are restricted a date matches
 * if either does. Evaluated in local time; time zones are the host's job.
 */

export interface CronSpec {
  minute: ReadonlySet<number>;
  hour: ReadonlySet<number>;
  dayOfMonth: ReadonlySet<number>;
  month: ReadonlySet<number>;
  dayOfWeek: ReadonlySet<number>;
  /** Whether the day fields were `*` (decides OR-vs-AND between them). */
  anyDayOfMonth: boolean;
  anyDayOfWeek: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface FieldDef {
  min: number;
  max: number;
  names?: string[];
  /** Name index → value offset (months are 1-based). */
  nameBase?: number;
}

const FIELDS: FieldDef[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: MONTHS, nameBase: 1 },
  { min: 0, max: 7, names: DAYS, nameBase: 0 },
];

function parseValue(token: string, def: FieldDef): number | undefined {
  const t = token.toLowerCase();
  if (def.names) {
    const idx = def.names.indexOf(t.slice(0, 3));
    if (idx >= 0 && t.length <= 3) return idx + (def.nameBase ?? 0);
  }
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= def.min && n <= def.max ? n : undefined;
}

function parseField(field: string, def: FieldDef): Set<number> | undefined {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '') return undefined;
    const [rangeText, stepText, extra] = part.split('/');
    if (extra !== undefined || rangeText === undefined) return undefined;
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) return undefined;
      step = Number(stepText);
    }
    let lo: number;
    let hi: number;
    if (rangeText === '*') {
      lo = def.min;
      hi = def.max;
    } else if (rangeText.includes('-')) {
      const [a, b, more] = rangeText.split('-');
      if (more !== undefined || a === undefined || b === undefined) return undefined;
      const x = parseValue(a, def);
      const y = parseValue(b, def);
      if (x === undefined || y === undefined || x > y) return undefined;
      lo = x;
      hi = y;
    } else {
      const v = parseValue(rangeText, def);
      if (v === undefined) return undefined;
      lo = v;
      hi = stepText !== undefined ? def.max : v;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a cron expression; undefined when malformed. */
export function parseCron(expression: string): CronSpec | undefined {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return undefined;
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const s = parseField(fields[i]!, FIELDS[i]!);
    if (!s) return undefined;
    sets.push(s);
  }
  const dow = sets[4]!;
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }
  return {
    minute: sets[0]!,
    hour: sets[1]!,
    dayOfMonth: sets[2]!,
    month: sets[3]!,
    dayOfWeek: dow,
    anyDayOfMonth: fields[2] === '*' || fields[2]!.startsWith('*/'),
    anyDayOfWeek: fields[4] === '*' || fields[4]!.startsWith('*/'),
  };
}

function toSpec(cron: string | CronSpec): CronSpec | undefined {
  return typeof cron === 'string' ? parseCron(cron) : cron;
}

function dayMatches(spec: CronSpec, d: Date): boolean {
  const dom = spec.dayOfMonth.has(d.getDate());
  const dow = spec.dayOfWeek.has(d.getDay());
  if (spec.anyDayOfMonth && spec.anyDayOfWeek) return true;
  if (spec.anyDayOfMonth) return dow;
  if (spec.anyDayOfWeek) return dom;
  return dom || dow;
}

/** Whether the minute containing `date` matches the expression (seconds ignored). */
export function matches(cron: string | CronSpec, date: Date): boolean {
  const spec = toSpec(cron);
  if (!spec) return false;
  return (
    spec.month.has(date.getMonth() + 1) &&
    dayMatches(spec, date) &&
    spec.hour.has(date.getHours()) &&
    spec.minute.has(date.getMinutes())
  );
}

/** Upper bound on scan steps: enough to cross several years by day-skips. */
const MAX_STEPS = 200_000;

/** First matching minute strictly after `after`; undefined when the expression is invalid or never matches. */
export function nextRun(cron: string | CronSpec, after: Date): Date | undefined {
  const spec = toSpec(cron);
  if (!spec) return undefined;
  const d = new Date(after.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < MAX_STEPS; i++) {
    if (!spec.month.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(spec, d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!spec.hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!spec.minute.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d;
  }
  return undefined;
}
