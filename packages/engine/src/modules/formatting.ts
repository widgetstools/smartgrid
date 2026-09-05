import type { CellClassParams, ColDef, ValueFormatterParams } from 'ag-grid-community';
import type { FormatColumn, FormattingModule } from '@smartgrid/schema';
import { appendClass, classFor, colIdOf, kindOf } from '../core/defs.js';
import { compileRule, type CompiledRule } from '../core/rules.js';
import type { EngineModule } from '../core/types.js';
import { buildValueFormatter, type FormatContext, type ValueFormatterFn } from '../formatters.js';
import { columnsInScope, rowKindAllowed } from '../scope.js';

export const FC_CLASS = (id: string) => classFor('sg-fc', id);

/**
 * Format columns: conditional styles and display formats scoped by column,
 * data type or column type and by row kind. Array order is precedence:
 * earlier wins on conflicting style properties; the first matching display
 * format wins outright. Edit-state styles are emitted as static classes.
 */
export const formattingModule: EngineModule<FormattingModule> = {
  id: 'formatting',
  order: 30,
  build(ctx, data, draft) {
    const active = data.formatColumns.filter((fc) => fc.enabled);
    const perColumn = new Map<
      string,
      { fc: FormatColumn; compiled: CompiledRule; formatter?: ValueFormatterFn }[]
    >();
    // CSS cascade makes later rules win, so emit format columns in reverse.
    const ordered: FormatColumn[] = [];

    for (const fc of active) {
      const compiled = compileRule(fc.rule, {
        env: ctx.env,
        predicates: ctx.predicates,
        predicateContext: ctx.predicateContext,
        columns: ctx.columns,
        warn: ctx.warn,
        name: `Format column "${fc.name}"`,
      });
      if (!compiled) continue;
      const formatter = fc.displayFormat ? buildValueFormatter(fc.displayFormat) : undefined;
      if (fc.style) ordered.push(fc);
      for (const colId of columnsInScope(fc.scope, ctx.columns)) {
        const list = perColumn.get(colId) ?? [];
        list.push({ fc, compiled, formatter });
        perColumn.set(colId, list);
      }
    }
    for (const fc of [...ordered].reverse())
      draft.styleRules.push({ className: FC_CLASS(fc.id), style: fc.style! });

    const edit = data.editStateStyles;
    if (edit.editable) draft.styleRules.push({ className: 'sg-edit-editable', style: edit.editable });
    if (edit.readOnly) draft.styleRules.push({ className: 'sg-edit-readonly', style: edit.readOnly });
    if (edit.edited) draft.styleRules.push({ className: 'sg-edit-edited', style: edit.edited });

    for (const d of draft.defs) {
      const entries = perColumn.get(colIdOf(d));
      if (!entries?.length) continue;
      const info = ctx.columns.find((c) => c.id === colIdOf(d));
      const header = info?.header ?? d.headerName ?? colIdOf(d);

      const cellClassRules: NonNullable<ColDef['cellClassRules']> = { ...(d.cellClassRules ?? {}) };
      const headerRules = entries.filter((e) => e.fc.target === 'header' && e.fc.style);
      const cellEntries = entries.filter((e) => e.fc.target === 'cell');

      for (const e of cellEntries) {
        if (!e.fc.style) continue;
        cellClassRules[FC_CLASS(e.fc.id)] = (p: CellClassParams) =>
          rowKindAllowed(e.fc.rowScope, kindOf(p)) && e.compiled.test(p.value, p.data, undefined);
      }
      if (Object.keys(cellClassRules).length) d.cellClassRules = cellClassRules;
      if (headerRules.length)
        d.headerClass = appendClass(d.headerClass, ...headerRules.map((e) => FC_CLASS(e.fc.id)));

      const formatted = cellEntries.filter((e) => e.formatter);
      if (formatted.length) {
        const hostFormatter = typeof d.valueFormatter === 'function' ? d.valueFormatter : undefined;
        const customFormatters = ctx.customFormatters;
        d.valueFormatter = (p: ValueFormatterParams) => {
          const fctx: FormatContext = { columnHeader: header, rowData: p.data, customFormatters };
          for (const e of formatted) {
            if (rowKindAllowed(e.fc.rowScope, kindOf(p)) && e.compiled.test(p.value, p.data, undefined))
              return e.formatter!(p.value, fctx);
          }
          return hostFormatter
            ? hostFormatter(p)
            : p.value === null || p.value === undefined
              ? ''
              : String(p.value);
        };
      }
    }
  },
};
