/**
 * Patch validation: apply to a clone, parse every module against its Zod
 * schema, check column references, then dry-run the engine so invalid
 * expressions and unknown columns inside rules surface as errors with JSON
 * pointers. The same result feeds the diff card and the model's
 * self-correction loop.
 */
import { applyPatch, type Operation } from 'fast-json-patch';
import {
  MODULE_IDS,
  parseGridConfig,
  type ColumnInfo,
  type GridConfig,
  type ModuleId,
} from '@smartgrid/schema';
import { buildGrid } from '@smartgrid/engine';
import type { PatchIssue, PatchValidation } from './types.js';

type BaseColumnDefs = Parameters<typeof buildGrid>[0]['baseColumnDefs'];

const COLUMN_KEYS = new Set([
  'columnId',
  'columnIds',
  'weightColumnId',
  'columns',
  'hiddenColumns',
  'rowGroupColumns',
  'pivotColumns',
]);
const COLUMN_RECORD_KEYS = new Set(['columnPinning', 'columnSizing', 'columnHeaders']);

export function modulesTouched(patch: readonly Operation[]): ModuleId[] {
  const out = new Set<ModuleId>();
  for (const op of patch) {
    const m = /^\/modules\/([^/]+)/.exec(op.path)?.[1];
    if (m && (MODULE_IDS as string[]).includes(m)) out.add(m as ModuleId);
  }
  return [...out];
}

export function validatePatch(
  config: GridConfig,
  patch: readonly Operation[],
  columns: readonly ColumnInfo[],
): PatchValidation {
  const errors: PatchIssue[] = [];
  const warnings: PatchIssue[] = [];
  const modules = modulesTouched(patch);

  if (patch.length === 0) {
    errors.push({ path: '', message: 'The patch is empty' });
    return { ok: false, errors, warnings, modules };
  }
  for (const [i, op] of patch.entries()) {
    if (!op || typeof op.path !== 'string' || !op.path.startsWith('/')) {
      errors.push({ path: `/${i}`, message: `Operation ${i} has no valid JSON pointer path` });
    } else if (!/^\/modules\/[^/]+\/data(\/|$)/.test(op.path) && op.path !== '/modules') {
      errors.push({
        path: op.path,
        message: 'Patches may only change module data under /modules/<module>/data',
      });
    }
  }
  if (errors.length) return { ok: false, errors, warnings, modules };

  let next: GridConfig;
  try {
    next = applyPatch(structuredClone(config), patch as Operation[], true, false).newDocument;
  } catch (e) {
    const err = e as { name?: string; operation?: Operation; index?: number; message?: string };
    const op = typeof err.index === 'number' ? patch[err.index] : undefined;
    errors.push({
      path: op?.path ?? '',
      message: describeApplyError(err),
    });
    return { ok: false, errors, warnings, modules };
  }

  const parsed = parseGridConfig(next);
  if (!parsed.ok) {
    for (const issue of parsed.envelopeIssues ?? []) {
      errors.push({ path: pointer(issue.path), message: issue.message });
    }
    for (const mi of parsed.moduleIssues) {
      for (const issue of mi.issues) {
        errors.push({ path: `/modules/${mi.moduleId}/data${pointer(issue.path)}`, message: issue.message });
      }
    }
    return { ok: false, errors, warnings, modules, next };
  }

  // Column references anywhere in the patched values.
  const known = new Set(columns.map((c) => c.id));
  for (const cc of parsed.config.modules.calculatedColumns?.data.calculatedColumns ?? [])
    known.add(cc.columnId);
  const headers = new Map(columns.map((c) => [c.header.toLowerCase(), c.id]));
  const report = (path: string, ref: string) => {
    if (known.has(ref)) return;
    const byHeader = headers.get(ref.toLowerCase());
    errors.push({
      path,
      message: byHeader
        ? `Unknown column "${ref}"; use the column id "${byHeader}"`
        : `Unknown column "${ref}"; call get_columns for the available ids`,
    });
  };
  for (const op of patch) {
    if (!('value' in op)) continue;
    // The pointer itself may end in a column-bearing key (…/rowGroupColumns) or a
    // column id under a record (…/columnPinning/notional).
    const segments = op.path.split('/');
    const last = segments.at(-1) ?? '';
    const parent = segments.at(-2) ?? '';
    if (COLUMN_KEYS.has(last)) {
      if (typeof op.value === 'string') report(op.path, op.value);
      else if (Array.isArray(op.value))
        op.value.forEach((x, i) => typeof x === 'string' && report(`${op.path}/${i}`, x));
    } else if (COLUMN_RECORD_KEYS.has(parent)) {
      report(op.path, last);
    } else if (COLUMN_KEYS.has(parent) && /^\d+$|^-$/.test(last) && typeof op.value === 'string') {
      report(op.path, op.value);
    } else {
      walkColumnRefs(op.value, op.path, report);
    }
  }
  if (errors.length) return { ok: false, errors, warnings, modules, next };

  // Engine dry run: invalid expressions and skipped objects become errors.
  const baseColumnDefs: BaseColumnDefs = columns.map((c) => ({
    colId: c.id,
    field: c.field ?? c.id,
    headerName: c.header,
    cellDataType: c.dataType,
  }));
  const built = buildGrid({ config: parsed.config, baseColumnDefs, columns });
  for (const w of built.warnings) {
    const issue: PatchIssue = { path: pathForWarning(w, patch), message: w };
    if (/skipped|Unknown|not found|expects|cannot|cycle/i.test(w)) errors.push(issue);
    else warnings.push(issue);
  }
  return { ok: errors.length === 0, errors, warnings, modules, next };
}

function describeApplyError(err: { name?: string; message?: string; operation?: Operation }): string {
  const name = err.name ?? '';
  if (name === 'OPERATION_PATH_UNRESOLVABLE')
    return 'Path does not exist in the document; use add for new objects and check indexes with get_config';
  if (name === 'OPERATION_PATH_ILLEGAL') return 'Illegal path';
  if (name === 'OPERATION_VALUE_REQUIRED') return 'This operation needs a value';
  if (name === 'OPERATION_OP_INVALID') return 'Unknown op; use add, replace, remove, move or copy';
  return err.message ?? name ?? 'Patch could not be applied';
}

function pointer(path: readonly PropertyKey[]): string {
  return path.length
    ? `/${path.map((p) => String(typeof p === 'symbol' ? p.description : p)).join('/')}`
    : '';
}

function walkColumnRefs(value: unknown, path: string, report: (path: string, ref: string) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkColumnRefs(v, `${path}/${i}`, report));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = `${path}/${k}`;
    if (COLUMN_KEYS.has(k)) {
      if (typeof v === 'string') report(p, v);
      else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' && report(`${p}/${i}`, x));
      continue;
    }
    // Scope.kind === 'columns' has columnIds handled above; records keyed by column id:
    if (COLUMN_RECORD_KEYS.has(k) && v && typeof v === 'object') {
      for (const key of Object.keys(v as object)) report(`${p}/${key}`, key);
      continue;
    }
    walkColumnRefs(v, p, report);
  }
}

/** Best-effort pointer for an engine warning: the patched object whose name the warning quotes. */
function pathForWarning(warning: string, patch: readonly Operation[]): string {
  const quoted = /"([^"]+)"/.exec(warning)?.[1];
  if (quoted) {
    for (const op of patch) {
      if (
        'value' in op &&
        op.value &&
        typeof op.value === 'object' &&
        (op.value as { name?: string }).name === quoted
      )
        return op.path;
    }
  }
  return patch[0]?.path ?? '';
}
