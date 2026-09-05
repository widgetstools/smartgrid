/**
 * Engine contracts. A module turns its slice of the config document into
 * AG Grid inputs at build time (pure), and may register runtime parts that
 * react to data changes (flashing, alerts, calculated-column refresh).
 */
import type { ColDef, ColGroupDef, GridOptions } from 'ag-grid-community';
import type { ColumnInfo, ModuleId, Style, TypedGridConfig } from '@smartgrid/schema';
import type { Env, PredicateContext, PredicateRegistry } from '@smartgrid/expressions';
import type { FormatContext } from '../formatters.js';
import type { StyleRule } from '../styles.js';
import type { GridRuntime } from '../runtime/runtime.js';

export interface BuildContext {
  config: TypedGridConfig;
  /** Host columns plus calculated columns (appended by that module before layout runs). */
  columns: ColumnInfo[];
  env: Env;
  predicates: PredicateRegistry;
  predicateContext: PredicateContext;
  customFormatters?: FormatContext['customFormatters'];
  runtime: GridRuntime;
  warn(message: string): void;
}

/** Mutable working set every module contributes to, in module order. */
export interface BuildDraft {
  /** Flat column definitions; modules may append (calculated columns) or mutate in place. */
  defs: ColDef[];
  gridOptions: GridOptions;
  /**
   * Style rules in ascending precedence: later entries win in the cascade.
   * Formatting pushes format columns (reversed, so the first wins); styled
   * columns, flashing and alert highlights push after so they override.
   */
  styleRules: StyleRule[];
  /** Raw CSS appended after the generated stylesheet. */
  extraCss: string[];
  /** External row filter predicates combined with AND (column filters, grid filter, quick search). */
  rowFilters: ((data: Record<string, unknown>, rowId: string) => boolean)[];
}

export interface EngineModule<D = unknown> {
  id: ModuleId;
  /** Lower runs first. Calculated columns 10, layout 20, formatting 30, styled 40, flashing 50, alerts 60, queries/filters 70. */
  order: number;
  build(ctx: BuildContext, data: D, draft: BuildDraft): void;
}

export interface BuildInput {
  config: TypedGridConfig;
  /** Host column definitions: field, colId, cellDataType, editable, custom types. */
  baseColumnDefs: (ColDef | ColGroupDef)[];
  columns: readonly ColumnInfo[];
  predicates?: PredicateRegistry;
  predicateContext?: PredicateContext;
  customFormatters?: FormatContext['customFormatters'];
  /** Expression environment (functions, variables, named queries). Defaults to the system catalogue plus this document's named queries. */
  env?: Env;
  /** Runtime to bind closures to; a detached runtime is created when omitted (pure builds, tests). */
  runtime?: GridRuntime;
  /** Emitted for objects the engine cannot apply (invalid expressions, unknown columns). */
  onWarning?: (message: string) => void;
}

export interface BuildOutput {
  columnDefs: (ColDef | ColGroupDef)[];
  gridOptions: GridOptions;
  /** Stylesheet to inject once per grid instance. */
  css: string;
  warnings: string[];
  /** Columns after calculated columns were appended (for hosts, editors and the assistant). */
  columns: ColumnInfo[];
  runtime: GridRuntime;
}

/** A flash currently showing on a cell or row. */
export interface ActiveFlash {
  rowId: string;
  columnId?: string;
  direction: 'up' | 'down' | 'neutral';
  className: string;
  until: number | 'always';
}

/** Registered by the flashing module; read by cellClassRules at render time. */
export interface FlashService {
  /** Class name for a cell (or undefined when not flashing). */
  cellClass(rowId: string, columnId: string): string | undefined;
  rowClass(rowId: string): string | undefined;
  active(): ActiveFlash[];
  clear(): void;
}

/** Column statistics over the current row set, cached until data changes. */
export interface ColumnStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  count: number;
}

export interface StatsService {
  statsFor(columnId: string): ColumnStats | undefined;
  invalidate(columnIds?: readonly string[]): void;
}

export interface AlertEvent {
  alertId: string;
  name: string;
  messageType: 'info' | 'success' | 'warning' | 'error';
  header: string;
  text: string;
  at: number;
  rowId?: string;
  columnId?: string;
  data?: Record<string, unknown>;
  /** Resolved behaviours for the host: toast, status, highlight, jump. */
  behaviour: {
    notify: boolean;
    notificationDuration: number | 'always';
    statusMessage: boolean;
    logToConsole: boolean;
    highlightCell?: Style | true;
    highlightRow?: Style | true;
    jumpToCell: boolean;
    jumpToRow: boolean;
    preventEdit: boolean;
  };
}

export type RuntimeEvent =
  | { type: 'flash'; flashes: ActiveFlash[]; refresh: { rowIds: string[]; columnIds?: string[] } }
  | { type: 'flashEnd'; refresh: { rowIds: string[]; columnIds?: string[] } }
  | { type: 'alert'; alert: AlertEvent }
  | { type: 'highlightEnd'; rowIds: string[] }
  | { type: 'calculatedColumnsChanged'; columnIds: string[]; rowIds?: string[] }
  | { type: 'filtersChanged' };
