/**
 * buildGrid: config document → AG Grid inputs, through the module pipeline.
 * Pure apart from binding runtime closures: no grid API calls. Every module
 * reads its slice of `config.modules`, contributes to the shared draft, and
 * may register runtime parts on the GridRuntime for live behaviour.
 */
import type { ColDef } from 'ag-grid-community';
import type { ColumnInfo, ModuleId } from '@smartgrid/schema';
import { createEnv, defaultPredicateRegistry, type Env } from '@smartgrid/expressions';
import { flattenDefs, restoreGroups } from './core/defs.js';
import type { BuildContext, BuildDraft, BuildInput, BuildOutput } from './core/types.js';
import { ENGINE_MODULES } from './modules/index.js';
import { GridRuntime } from './runtime/runtime.js';
import { buildStylesheet } from './styles.js';

export type { BuildInput, BuildOutput } from './core/types.js';

/** Environment whose QUERY('Name') resolves against the document's named queries. */
export function envForConfig(config: BuildInput['config'], base?: Env): Env {
  const queries = config.modules.queries?.data.namedQueries ?? [];
  const byName = new Map(queries.filter((q) => q.enabled).map((q) => [q.name.toLowerCase(), q.expression]));
  const env = base ?? createEnv();
  return { ...env, namedQuery: (name) => byName.get(name.toLowerCase()) ?? env.namedQuery?.(name) };
}

export function buildGrid(input: BuildInput): BuildOutput {
  const warnings: string[] = [];
  const warn = (m: string) => {
    warnings.push(m);
    input.onWarning?.(m);
  };
  const runtime = input.runtime ?? new GridRuntime();
  const columns: ColumnInfo[] = [...input.columns];
  runtime.reset(columns);

  const ctx: BuildContext = {
    config: input.config,
    columns,
    env: envForConfig(input.config, input.env),
    predicates: input.predicates ?? defaultPredicateRegistry,
    predicateContext: input.predicateContext ?? {},
    customFormatters: input.customFormatters,
    runtime,
    warn,
  };
  const draft: BuildDraft = {
    defs: flattenDefs(input.baseColumnDefs).map((d) => ({ ...d }) as ColDef),
    gridOptions: {},
    styleRules: [],
    extraCss: [],
    rowFilters: [],
  };

  const hasLayout = !!ctx.config.modules.layout?.data.layouts.some(
    (l) => l.id === ctx.config.modules.layout?.data.currentLayoutId,
  );

  for (const mod of [...ENGINE_MODULES].sort((a, b) => a.order - b.order)) {
    const slice = ctx.config.modules[mod.id as ModuleId];
    if (!slice) continue;
    try {
      mod.build(ctx, slice.data as never, draft);
    } catch (e) {
      warn(`Module ${mod.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (draft.rowFilters.length) {
    const filters = draft.rowFilters;
    const rowIdOf = runtime.host.rowIdOf;
    draft.gridOptions.isExternalFilterPresent = () => true;
    draft.gridOptions.doesExternalFilterPass = (node) => {
      const data = node.data as Record<string, unknown> | undefined;
      if (!data) return true;
      const id = rowIdOf(data);
      return filters.every((f) => f(data, id));
    };
  }

  const css = [buildStylesheet(draft.styleRules), ...draft.extraCss].filter(Boolean).join('\n');
  runtime.columns = columns;

  return {
    columnDefs: hasLayout ? draft.defs : restoreGroups(input.baseColumnDefs, draft.defs),
    gridOptions: draft.gridOptions,
    css,
    warnings,
    columns,
    runtime,
  };
}
