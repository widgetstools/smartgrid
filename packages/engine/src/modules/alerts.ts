/**
 * Alerts: rule-based (predicates / boolean expression on cell changes,
 * aggregated over the row set, observable over time) and scheduled (once
 * or cron). Every firing is emitted as an `alert` runtime event carrying
 * the resolved message and behaviours; the host renders toasts, status
 * messages and jumps. Highlight behaviours are tracked here as timed
 * cell/row classes (`sg-alert-<id>` / `sg-alert-<id>-row`) that
 * cellClassRules and rowClassRules read at render time.
 */
import type { CellClassParams, ColDef, GridOptions } from 'ag-grid-community';
import type { Alert, AlertsModule, Rule, Style } from '@smartgrid/schema';
import {
  compileAggregatedSource,
  compileObservableSource,
  ObservableWatcher,
  toBoolean,
  toText,
  validate,
  type AggregatedProgram,
  type ObservableTrigger,
  type RowContext,
  type Value,
} from '@smartgrid/expressions';
import { nextRun, parseCron, type CronSpec } from '../core/cron.js';
import { classFor, colIdOf } from '../core/defs.js';
import { compileRule, rowContextFor, type CompiledRule, type RuleChange } from '../core/rules.js';
import type { AlertEvent, EngineModule } from '../core/types.js';
import type { CellChange, RowChange, RuntimePart } from '../runtime/runtime.js';
import { columnsInScope } from '../scope.js';
import { paramsRowId, rowStyleCss } from './flashing.js';

/** Cell highlight class for an alert id. */
export const ALERT_CLASS = (id: string): string => classFor('sg-alert', id);
/** Row highlight class for an alert id. */
export const ALERT_ROW_CLASS = (id: string): string => `${classFor('sg-alert', id)}-row`;

/** Used when `highlightCell` / `highlightRow` is `true` rather than a Style. */
export const DEFAULT_HIGHLIGHT_STYLE: Style = { backColor: { light: '#fde68a', dark: '#78350f' } };

/** Names substituted for `[trigger]` in message templates. */
export type AlertTrigger =
  | 'Edit'
  | 'Tick'
  | 'Undo'
  | 'Load'
  | 'Added'
  | 'Removed'
  | 'Aggregation'
  | 'Schedule'
  | 'Observable'
  | 'Manual';

const CHANGE_TRIGGERS: Record<NonNullable<CellChange['trigger']>, AlertTrigger> = {
  edit: 'Edit',
  tick: 'Tick',
  undo: 'Undo',
  load: 'Load',
};

export interface AlertsRuntimePart extends RuntimePart {
  /** Highlight class for a cell, while its alert highlight is active. */
  highlightClass(rowId: string, columnId: string): string | undefined;
  rowHighlightClass(rowId: string): string | undefined;
  /** Fire an alert on demand (the "test alert" button); returns the event or undefined for an unknown id. */
  fireAlertNow(alertId: string): AlertEvent | undefined;
  /** Drop every active highlight, emitting `highlightEnd`. */
  clearHighlights(): void;
}

/** Everything a firing needs to render its message and behaviours. */
interface FireContext {
  at: number;
  trigger: AlertTrigger;
  rowId?: string;
  columnId?: string;
  data?: Record<string, unknown>;
  /** Row access when only a RowContext is known (observable ticks). */
  row?: RowContext;
  oldValue?: unknown;
  newValue?: unknown;
  /** Message text when the definition has none. */
  autoText: string;
}

interface CompiledAlert {
  alert: Alert;
  /** Column ids whose changes this alert evaluates (undefined = every column). */
  columns?: Set<string>;
  rule?: CompiledRule;
  aggregated?: {
    program: AggregatedProgram;
    source: string;
    last: boolean;
    lastGroups: Map<string, boolean>;
  };
  observable?: { watcher: ObservableWatcher; columnId?: string; source: string };
  schedule?: { kind: 'once'; runAt: number; fired: boolean } | { kind: 'cron'; spec: CronSpec; next?: Date };
}

interface Highlight {
  rowId: string;
  className: string;
  until: number | 'always';
}

const TEMPLATE_RE = /\[(newValue|oldValue|column|primaryKeyValue|timestamp|trigger|rowData\.[^\]]+)\]/g;

const text = (v: unknown): string => toText(v as Value);

const cellKey = (rowId: string, columnId: string) => `${rowId} ${columnId}`;

/**
 * Alerts module (order 60): registers the `alerts` runtime part and, for
 * highlight behaviours, class rules plus style rules that win over
 * formatting and styled columns.
 */
export const alertsModule: EngineModule<AlertsModule> = {
  id: 'alerts',
  order: 60,
  build(ctx, data, draft) {
    const runtime = ctx.runtime;
    const headerOf = (columnId: string): string =>
      ctx.columns.find((c) => c.id === columnId)?.header ?? columnId;
    const fillTemplate = (template: string, f: FireContext): string =>
      template.replace(TEMPLATE_RE, (match, key: string) => {
        if (key.startsWith('rowData.')) {
          const field = key.slice('rowData.'.length);
          return text(f.data ? f.data[field] : f.row?.get(field));
        }
        switch (key) {
          case 'newValue':
            return text(f.newValue);
          case 'oldValue':
            return text(f.oldValue);
          case 'column':
            return f.columnId ? headerOf(f.columnId) : '';
          case 'primaryKeyValue':
            return f.rowId ?? '';
          case 'timestamp':
            return new Date(f.at).toISOString();
          case 'trigger':
            return f.trigger;
          default:
            return match;
        }
      });

    // --- compile -------------------------------------------------------
    const compiled: CompiledAlert[] = [];
    const startedAt = runtime.now();
    for (const alert of data.alerts) {
      if (!alert.enabled) continue;
      const entry: CompiledAlert = { alert };
      if (alert.scope.kind !== 'all') entry.columns = new Set(columnsInScope(alert.scope, ctx.columns));
      const name = `Alert "${alert.name}"`;
      const rule = alert.rule;
      let ok = true;
      if (rule?.kind === 'predicates' || rule?.kind === 'expression') {
        entry.rule = compileRule(rule as Rule, {
          env: ctx.env,
          predicates: ctx.predicates,
          predicateContext: ctx.predicateContext,
          columns: ctx.columns,
          kind: 'boolean',
          warn: ctx.warn,
          name,
        });
        ok = entry.rule !== undefined;
      } else if (rule?.kind === 'aggregated') {
        const v = validate(rule.expression, {
          kind: 'aggregatedBoolean',
          env: ctx.env,
          columns: ctx.columns,
        });
        if (!v.ok) {
          ctx.warn(`${name}: ${v.errors.map((e) => e.message).join('; ')}; alert skipped`);
          ok = false;
        } else {
          entry.aggregated = {
            program: compileAggregatedSource(rule.expression, ctx.env, { resolveColumn: v.resolveColumn }),
            source: rule.expression,
            last: false,
            lastGroups: new Map(),
          };
        }
      } else if (rule?.kind === 'observable') {
        const v = validate(rule.expression, { kind: 'observable', env: ctx.env, columns: ctx.columns });
        if (!v.ok) {
          ctx.warn(`${name}: ${v.errors.map((e) => e.message).join('; ')}; alert skipped`);
          ok = false;
        } else {
          const spec = compileObservableSource(rule.expression, ctx.env, { resolveColumn: v.resolveColumn });
          entry.observable = {
            watcher: new ObservableWatcher(spec, { startedAt }),
            columnId: spec.change?.columnId,
            source: rule.expression,
          };
        }
      }
      if (!ok) continue;

      const schedule = alert.schedule;
      if (schedule?.kind === 'once') {
        const runAt = Date.parse(schedule.runAt);
        if (Number.isNaN(runAt)) {
          ctx.warn(`${name}: invalid run time "${schedule.runAt}"; alert skipped`);
          continue;
        }
        entry.schedule = { kind: 'once', runAt, fired: false };
      } else if (schedule?.kind === 'cron') {
        const spec = parseCron(schedule.cron);
        if (!spec) {
          ctx.warn(`${name}: invalid cron expression "${schedule.cron}"; alert skipped`);
          continue;
        }
        entry.schedule = { kind: 'cron', spec, next: nextRun(spec, new Date(startedAt)) };
      }
      compiled.push(entry);
    }

    // --- highlight state -----------------------------------------------
    const cellHighlights = new Map<string, Highlight>();
    const rowHighlights = new Map<string, Highlight>();
    const highlightDuration = data.options.highlightDuration;

    const fire = (alert: Alert, f: FireContext): AlertEvent => {
      const b = alert.behaviour;
      const event: AlertEvent = {
        alertId: alert.id,
        name: alert.name,
        messageType: alert.messageType,
        header: fillTemplate(alert.header ?? alert.name, f),
        text: fillTemplate(alert.text ?? f.autoText, f),
        at: f.at,
        rowId: f.rowId,
        columnId: f.columnId,
        data: f.data,
        behaviour: {
          notify: b.notify,
          notificationDuration: b.notificationDuration,
          statusMessage: b.statusMessage,
          logToConsole: b.logToConsole,
          highlightCell: b.highlightCell === false ? undefined : b.highlightCell,
          highlightRow: b.highlightRow === false ? undefined : b.highlightRow,
          jumpToCell: b.jumpToCell,
          jumpToRow: b.jumpToRow,
          preventEdit: b.preventEdit,
        },
      };
      const until = highlightDuration === 'always' ? 'always' : f.at + highlightDuration;
      if (b.highlightCell !== false && f.rowId !== undefined && f.columnId !== undefined) {
        cellHighlights.set(cellKey(f.rowId, f.columnId), {
          rowId: f.rowId,
          className: ALERT_CLASS(alert.id),
          until,
        });
      }
      if (b.highlightRow !== false && f.rowId !== undefined) {
        rowHighlights.set(f.rowId, { rowId: f.rowId, className: ALERT_ROW_CLASS(alert.id), until });
      }
      runtime.emit({ type: 'alert', alert: event });
      return event;
    };

    const inScope = (c: CompiledAlert, columnId: string) => !c.columns || c.columns.has(columnId);

    const fireObservable = (
      c: CompiledAlert,
      triggers: ObservableTrigger[],
      data: Record<string, unknown> | undefined,
      trigger: AlertTrigger,
    ) => {
      const o = c.observable!;
      for (const t of triggers) {
        fire(c.alert, {
          at: t.at,
          trigger,
          rowId: t.rowId,
          columnId: o.columnId,
          data: t.rowId !== undefined ? data : undefined,
          row: t.row,
          newValue: t.value,
          autoText: `${o.source}: ${t.reason}`,
        });
      }
    };

    const evaluateAggregated = (c: CompiledAlert, at: number) => {
      const agg = c.aggregated!;
      const host = runtime.host;
      const rows = host.getRows().map((d) => rowContextFor(d, undefined, host.rowIdOf(d)));
      let result: ReturnType<AggregatedProgram['evaluate']>;
      try {
        result = agg.program.evaluate(rows);
      } catch {
        return;
      }
      if (result.groups) {
        const next = new Map<string, boolean>();
        for (const g of result.groups) {
          const on = toBoolean(g.value);
          next.set(g.key, on);
          if (on && !agg.lastGroups.get(g.key)) {
            const where = Object.entries(g.values)
              .map(([k, v]) => `${headerOf(k)} = ${text(v)}`)
              .join(', ');
            fire(c.alert, {
              at,
              trigger: 'Aggregation',
              data: g.values,
              autoText: `${agg.source} is true for ${where}`,
            });
          }
        }
        agg.lastGroups = next;
      } else {
        const on = toBoolean(result.value);
        if (on && !agg.last) fire(c.alert, { at, trigger: 'Aggregation', autoText: `${agg.source} is true` });
        agg.last = on;
      }
    };

    const expireHighlights = (now: number | undefined) => {
      const rowIds = new Set<string>();
      for (const [key, h] of cellHighlights) {
        if (now !== undefined && (h.until === 'always' || h.until > now)) continue;
        cellHighlights.delete(key);
        rowIds.add(h.rowId);
      }
      for (const [key, h] of rowHighlights) {
        if (now !== undefined && (h.until === 'always' || h.until > now)) continue;
        rowHighlights.delete(key);
        rowIds.add(h.rowId);
      }
      if (rowIds.size) runtime.emit({ type: 'highlightEnd', rowIds: [...rowIds] });
    };

    const part: AlertsRuntimePart = {
      id: 'alerts',
      highlightClass: (rowId, columnId) => cellHighlights.get(cellKey(rowId, columnId))?.className,
      rowHighlightClass: (rowId) => rowHighlights.get(rowId)?.className,
      clearHighlights: () => expireHighlights(undefined),
      fireAlertNow(alertId) {
        const alert =
          compiled.find((c) => c.alert.id === alertId)?.alert ?? data.alerts.find((a) => a.id === alertId);
        if (!alert) return undefined;
        return fire(alert, { at: runtime.now(), trigger: 'Manual', autoText: `Test alert "${alert.name}"` });
      },
      onCells(changes: readonly CellChange[]) {
        let lastAt = 0;
        for (const change of changes) lastAt = Math.max(lastAt, change.at);
        for (const c of compiled) {
          if (c.rule) {
            for (const change of changes) {
              if (!inScope(c, change.columnId)) continue;
              if (!c.rule.test(change.newValue, change.data, ruleChangeOf(change))) continue;
              fire(c.alert, {
                at: change.at,
                trigger: change.trigger ? CHANGE_TRIGGERS[change.trigger] : 'Edit',
                rowId: change.rowId,
                columnId: change.columnId,
                data: change.data,
                oldValue: change.oldValue,
                newValue: change.newValue,
                autoText: `${headerOf(change.columnId)} changed from ${text(change.oldValue)} to ${text(change.newValue)}`,
              });
            }
          }
          if (c.observable) {
            for (const change of changes) {
              if (!inScope(c, change.columnId)) continue;
              const triggers = c.observable.watcher.push({
                kind: 'change',
                rowId: change.rowId,
                columnId: change.columnId,
                oldValue: change.oldValue as Value,
                newValue: change.newValue as Value,
                row: rowContextFor(change.data, ruleChangeOf(change), change.rowId),
                at: change.at,
              });
              if (triggers.length)
                fireObservable(
                  c,
                  triggers,
                  change.data,
                  change.trigger ? CHANGE_TRIGGERS[change.trigger] : 'Observable',
                );
            }
          }
          if (c.aggregated) evaluateAggregated(c, lastAt);
        }
      },
      onRows(changes: readonly RowChange[]) {
        let lastAt = 0;
        for (const change of changes) lastAt = Math.max(lastAt, change.at);
        for (const c of compiled) {
          if (c.observable) {
            for (const change of changes) {
              const row = rowContextFor(change.data, undefined, change.rowId);
              if (change.kind === 'added') c.observable.watcher.track(change.rowId, row, change.at);
              const triggers = c.observable.watcher.push({
                kind: change.kind,
                rowId: change.rowId,
                row,
                at: change.at,
              });
              if (triggers.length)
                fireObservable(c, triggers, change.data, change.kind === 'added' ? 'Added' : 'Removed');
            }
          }
          if (c.aggregated) evaluateAggregated(c, lastAt);
        }
      },
      onTick(now: number) {
        for (const c of compiled) {
          if (c.observable) {
            const triggers = c.observable.watcher.tick(now);
            if (triggers.length) fireObservable(c, triggers, undefined, 'Observable');
          }
          const s = c.schedule;
          if (!s) continue;
          if (s.kind === 'once') {
            if (!s.fired && now >= s.runAt) {
              s.fired = true;
              fire(c.alert, { at: now, trigger: 'Schedule', autoText: `Scheduled: ${c.alert.name}` });
            }
          } else if (s.next && now >= s.next.getTime()) {
            fire(c.alert, { at: now, trigger: 'Schedule', autoText: `Scheduled: ${c.alert.name}` });
            s.next = nextRun(s.spec, new Date(now));
          }
        }
        expireHighlights(now);
      },
      dispose() {
        cellHighlights.clear();
        rowHighlights.clear();
      },
    };
    runtime.register(part);

    // --- highlight styles and class rules -------------------------------
    const cellRules = new Map<string, { cls: string; columns?: Set<string> }>();
    const rowClassRules: NonNullable<GridOptions['rowClassRules']> = {
      ...(draft.gridOptions.rowClassRules ?? {}),
    };
    let hasRowRules = false;
    for (const c of compiled) {
      const b = c.alert.behaviour;
      if (b.highlightCell !== false) {
        const cls = ALERT_CLASS(c.alert.id);
        draft.styleRules.push({
          className: cls,
          style: b.highlightCell === true ? DEFAULT_HIGHLIGHT_STYLE : b.highlightCell,
        });
        cellRules.set(cls, { cls, columns: c.columns });
      }
      if (b.highlightRow !== false) {
        const cls = ALERT_ROW_CLASS(c.alert.id);
        draft.extraCss.push(
          rowStyleCss(cls, b.highlightRow === true ? DEFAULT_HIGHLIGHT_STYLE : b.highlightRow),
        );
        rowClassRules[cls] = (p) =>
          runtime.part<AlertsRuntimePart>('alerts')?.rowHighlightClass(paramsRowId(p)) === cls;
        hasRowRules = true;
      }
    }
    if (hasRowRules) draft.gridOptions.rowClassRules = rowClassRules;
    if (cellRules.size) {
      for (const d of draft.defs) {
        const colId = colIdOf(d);
        const applicable = [...cellRules.values()].filter((r) => !r.columns || r.columns.has(colId));
        if (!applicable.length) continue;
        const cellClassRules: NonNullable<ColDef['cellClassRules']> = { ...(d.cellClassRules ?? {}) };
        for (const r of applicable) {
          cellClassRules[r.cls] = (p: CellClassParams) =>
            runtime.part<AlertsRuntimePart>('alerts')?.highlightClass(paramsRowId(p), colId) === r.cls;
        }
        d.cellClassRules = cellClassRules;
      }
    }
  },
};

function ruleChangeOf(change: CellChange): RuleChange {
  return { columnId: change.columnId, oldValue: change.oldValue, newValue: change.newValue };
}
