import { useMemo } from 'react';
import type { z } from '@smartgrid/schema';
import type { PositionedError } from '@smartgrid/editors';

/** Zod issues → positioned errors with JSON-pointer paths relative to the parsed value. */
export function issuesToErrors(issues: readonly z.core.$ZodIssue[]): PositionedError[] {
  return issues.map((i) => ({
    path: i.path.length
      ? `/${i.path.map((p) => String(typeof p === 'symbol' ? p.description : p)).join('/')}`
      : '',
    message: i.message,
  }));
}

export function validate(schema: z.ZodTypeAny, value: unknown): PositionedError[] {
  const r = schema.safeParse(value);
  return r.success ? [] : issuesToErrors(r.error.issues);
}

/** Memoised validation; returns an empty list when `schema` is absent. */
export function useValidation(schema: z.ZodTypeAny | undefined, value: unknown): PositionedError[] {
  return useMemo(() => (schema ? validate(schema, value) : []), [schema, value]);
}

/** Errors at or below `path`, re-based so `path` becomes ''. */
export function errorsUnder(errors: readonly PositionedError[] | undefined, path: string): PositionedError[] {
  if (!errors || errors.length === 0) return [];
  if (path === '') return [...errors];
  const out: PositionedError[] = [];
  for (const e of errors) {
    if (e.path === path) out.push({ ...e, path: '' });
    else if (e.path.startsWith(`${path}/`)) out.push({ ...e, path: e.path.slice(path.length) });
  }
  return out;
}
