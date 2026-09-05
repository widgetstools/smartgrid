import type { CellClassParams, ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { StyledColumnRendererParams } from '@smartgrid/design-system';
import {
  styledColumnKindsFor,
  type RangeEndpoint,
  type RowScope,
  type StyledColumn,
  type StyledColumnsModule,
} from '@smartgrid/schema';
import { appendClass, classFor, colIdOf } from '../core/defs.js';
import { compileRule, type CompiledRule } from '../core/rules.js';
import type { EngineModule, StatsService } from '../core/types.js';

/** AG Grid component name the host registers the React renderer under. */
export const STYLED_COLUMN_RENDERER = 'sgStyledColumn';
export type { StyledColumnRendererParams } from '@smartgrid/design-system';

export const SC_CLASS = (id: string) => classFor('sg-sc', id);

const STAT_KEYS = { 'Col-Min': 'min', 'Col-Max': 'max', 'Col-Avg': 'avg', 'Col-Median': 'median' } as const;

/** AdapTable defaults: badges everywhere, sparklines on data rows only, the rest skip group rows. */
function defaultRowScope(kind: StyledColumn['style']['kind']): RowScope | undefined {
  if (kind === 'badge') return undefined;
  const sparkline = kind === 'sparkline';
  return {
    excludeDataRows: false,
    excludeGroupRows: true,
    excludeSummaryRows: sparkline,
    excludeTotalRows: sparkline,
  };
}

function endpointResolver(
  columnId: string,
  stats: StatsService,
): StyledColumnRendererParams['resolveEndpoint'] {
  return (endpoint: RangeEndpoint, rowData) => {
    if (typeof endpoint === 'number') return endpoint;
    if (typeof endpoint === 'string') return stats.statsFor(columnId)?.[STAT_KEYS[endpoint]];
    const v = rowData?.[endpoint.columnId];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
}

/**
 * Styled columns: one data-driven renderer per column. The module binds
 * `cellRenderer: 'sgStyledColumn'` with self-contained params (style, scope,
 * endpoint resolution over column stats, badge rule matching, formatting), so
 * the renderer never reaches back into the engine. Fonts are emitted as a
 * cell class so they apply at the cell level.
 */
export const styledColumnsModule: EngineModule<StyledColumnsModule> = {
  id: 'styledColumns',
  order: 40,
  build(ctx, data, draft) {
    for (const sc of data.styledColumns) {
      if (!sc.enabled) continue;
      const name = `Styled column "${sc.name}"`;
      const def = draft.defs.find((d) => colIdOf(d) === sc.columnId);
      if (!def) {
        ctx.warn(`${name}: column "${sc.columnId}" not found; skipped`);
        continue;
      }
      const info = ctx.columns.find((c) => c.id === sc.columnId);
      if (info && !styledColumnKindsFor(info.dataType).includes(sc.style.kind)) {
        ctx.warn(`${name}: ${sc.style.kind} is not available for ${info.dataType} columns; skipped`);
        continue;
      }

      let pickBadge: StyledColumnRendererParams['pickBadge'];
      if (sc.style.kind === 'badge') {
        const compiled: (CompiledRule | undefined)[] = sc.style.badges.map((b, i) =>
          compileRule(b.rule, {
            env: ctx.env,
            predicates: ctx.predicates,
            predicateContext: ctx.predicateContext,
            columns: ctx.columns,
            warn: ctx.warn,
            name: `${name} badge ${i + 1}`,
          }),
        );
        pickBadge = (value, rowData) => {
          const i = compiled.findIndex((c) => c?.test(value, rowData, undefined));
          return i < 0 ? undefined : i;
        };
      }

      const hostFormatter = typeof def.valueFormatter === 'function' ? def.valueFormatter : undefined;
      const formatValue: StyledColumnRendererParams['formatValue'] = (value, rowData) => {
        if (hostFormatter) {
          const p = { value, data: rowData, node: null, colDef: def } as unknown as ValueFormatterParams;
          return hostFormatter(p);
        }
        return value === null || value === undefined ? '' : String(value);
      };

      const styled: StyledColumnRendererParams = {
        columnId: sc.columnId,
        style: sc.style,
        rowScope: sc.rowScope ?? defaultRowScope(sc.style.kind),
        resolveEndpoint: endpointResolver(sc.columnId, ctx.runtime.stats),
        pickBadge,
        formatValue,
      };

      def.cellRenderer = STYLED_COLUMN_RENDERER;
      const existing = typeof def.cellRendererParams === 'object' ? def.cellRendererParams : {};
      def.cellRendererParams = { ...existing, styled };

      const font = 'font' in sc.style ? sc.style.font : undefined;
      if (font) {
        const cls = SC_CLASS(sc.id);
        draft.styleRules.push({ className: cls, style: { font } });
        const prior = def.cellClass;
        def.cellClass =
          typeof prior === 'function'
            ? (p: CellClassParams) => appendClass(prior(p) as ColDef['headerClass'], cls)
            : appendClass(prior, cls);
      }
    }
  },
};
