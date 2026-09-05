import type { CellClassParams, ColDef } from 'ag-grid-community';
import type { QueriesModule, QuickSearch, TypedGridConfig } from '@smartgrid/schema';
import { validate } from '@smartgrid/expressions';
import { compileExpressionRule, compileRule } from '../core/rules.js';
import type { BuildContext, BuildDraft, EngineModule } from '../core/types.js';
import type { RuntimePart } from '../runtime/runtime.js';
import type { CalculatedColumnsRuntimePart } from './calculatedColumns.js';
import { currentLayout } from './layout.js';

/** Class applied to cells matching the quick search text (highlight and both modes). */
export const QUICK_SEARCH_CLASS = 'sg-quick-search';

type RowFilter = BuildDraft['rowFilters'][number];

/** Registered as `runtime.part('queries')`: the active row filters, for hosts filtering outside AG Grid. */
export interface QueriesRuntimePart extends RuntimePart {
  id: 'queries';
  /** True when the row passes every active column filter, grid filter and quick-search filter. */
  matches(data: Record<string, unknown>): boolean;
}

/**
 * Queries: row filtering and quick search. Column filters and the grid
 * filter live in the current layout; quick search and named queries in this
 * module's slice. Named queries need no build-time work (the expression
 * environment resolves `QUERY('Name')`), but are validated so broken ones
 * surface as warnings.
 */
export const queriesModule: EngineModule<QueriesModule> = {
  id: 'queries',
  order: 70,
  build(ctx, data, draft) {
    const filters: RowFilter[] = [];
    const layout = currentLayout(ctx);
    const ruleOpts = {
      env: ctx.env,
      predicates: ctx.predicates,
      predicateContext: ctx.predicateContext,
      columns: ctx.columns,
      warn: ctx.warn,
    };

    for (const cf of layout?.columnFilters ?? []) {
      if (!cf.enabled) continue;
      const name = `Column filter on "${cf.columnId}"`;
      if (!ctx.columns.some((c) => c.id === cf.columnId)) {
        ctx.warn(`${name}: unknown column; filter skipped`);
        continue;
      }
      const compiled = compileRule(
        { kind: 'predicates', predicates: cf.predicates, operator: cf.operator },
        { ...ruleOpts, name },
      );
      if (!compiled) continue;
      const columnId = cf.columnId;
      filters.push((data) => compiled.test(valueOf(ctx, columnId, data), data));
    }

    if (layout?.gridFilter?.enabled) {
      const compiled = compileExpressionRule(layout.gridFilter.expression, {
        ...ruleOpts,
        name: 'Grid filter',
      });
      if (compiled) filters.push((data) => compiled.test(undefined, data));
    }

    for (const q of data.namedQueries) {
      if (!q.enabled) continue;
      const v = validate(q.expression, { kind: 'boolean', env: ctx.env, columns: ctx.columns });
      if (!v.ok) ctx.warn(`Named query "${q.name}": ${v.errors.map((e) => e.message).join('; ')}`);
    }

    const qs = data.quickSearch;
    const text = qs.text.trim();
    if (text) {
      const matches = textMatcher(qs, text);
      if (qs.mode === 'filter' || qs.mode === 'both') {
        const ids = ctx.columns.map((c) => c.id);
        filters.push((data) => ids.some((id) => matches(valueOf(ctx, id, data))));
      }
      if (qs.mode === 'highlight' || qs.mode === 'both') {
        for (const d of draft.defs) {
          const rules: NonNullable<ColDef['cellClassRules']> = { ...(d.cellClassRules ?? {}) };
          rules[QUICK_SEARCH_CLASS] = (p: CellClassParams) => matches(p.value);
          d.cellClassRules = rules;
        }
        draft.styleRules.push({ className: QUICK_SEARCH_CLASS, style: qs.style });
      }
    }

    draft.rowFilters.push(...filters);
    const rowIdOf = ctx.runtime.host.rowIdOf;
    const part: QueriesRuntimePart = {
      id: 'queries',
      matches: (data) => {
        const id = rowIdOf(data);
        return filters.every((f) => f(data, id));
      },
    };
    ctx.runtime.register(part);
  },
};

/** Raw cell value for filtering; calculated columns are read through their runtime part. */
function valueOf(ctx: BuildContext, columnId: string, data: Record<string, unknown>): unknown {
  if (columnId in data) return data[columnId];
  const calc = ctx.runtime.part<CalculatedColumnsRuntimePart>('calculatedColumns');
  return calc?.order.includes(columnId) ? calc.valueOf(columnId, data) : undefined;
}

function textMatcher(qs: QuickSearch, text: string): (value: unknown) => boolean {
  const needle = qs.caseSensitive ? text : text.toLowerCase();
  return (value) => {
    if (value === null || value === undefined) return false;
    const s = String(value);
    return (qs.caseSensitive ? s : s.toLowerCase()).includes(needle);
  };
}

/**
 * Signature of everything that affects row filtering: active column filters,
 * grid filter, quick search and named queries. Hosts compare it across builds
 * to decide whether to call `api.onFilterChanged()`.
 */
export function filtersSignature(config: TypedGridConfig): string {
  const layoutModule = config.modules.layout?.data;
  const layout = layoutModule?.layouts.find((l) => l.id === layoutModule.currentLayoutId);
  const queries = config.modules.queries?.data;
  const qs = queries?.quickSearch;
  return JSON.stringify({
    columnFilters: (layout?.columnFilters ?? [])
      .filter((f) => f.enabled)
      .map((f) => ({ c: f.columnId, p: f.predicates, o: f.operator })),
    gridFilter: layout?.gridFilter?.enabled ? layout.gridFilter.expression : null,
    quickSearch:
      qs && qs.text.trim() && qs.mode !== 'highlight'
        ? { t: qs.text.trim(), m: qs.mode, cs: qs.caseSensitive }
        : null,
    namedQueries: (queries?.namedQueries ?? [])
      .filter((q) => q.enabled)
      .map((q) => [q.name.toLowerCase(), q.expression]),
  });
}
