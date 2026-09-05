/**
 * Host adapter for the engine runtime: owns one GridRuntime per grid,
 * mirrors its events onto the AG Grid API (cell refreshes for flashes,
 * highlights and calculated columns) and onto the UI (toasts for alerts),
 * and drives its clock.
 */
import { useEffect, useState } from 'react';
import type { GridApi, IRowNode } from 'ag-grid-community';
import { GridRuntime, type AlertEvent, type CellChange, type RuntimeEvent } from '@smartgrid/engine';
import { toast } from '@smartgrid/ui';

export interface RuntimeState {
  runtime: GridRuntime;
  alerts: AlertEvent[];
  clearAlerts(): void;
}

/** Mutable host holder living outside React state so the runtime reads the latest rows lazily. */
function createHost<T extends Record<string, unknown>>() {
  const state = { rows: [] as readonly T[], rowIdOf: (_d: T) => '' };
  return {
    host: { getRows: () => state.rows, rowIdOf: (d: Record<string, unknown>) => state.rowIdOf(d as T) },
    set(rows: readonly T[], rowIdOf: (d: T) => string) {
      state.rows = rows;
      state.rowIdOf = rowIdOf;
    },
  };
}

export function useGridRuntime<T extends Record<string, unknown>>(
  api: GridApi<T> | undefined,
  rows: T[],
  rowIdOf: (row: T) => string,
  opts: { tickMs?: number; maxAlerts?: number } = {},
): RuntimeState {
  const [host] = useState(() => createHost<T>());
  useEffect(() => {
    host.set(rows, rowIdOf);
  });
  const [runtime] = useState(() => new GridRuntime(host.host));
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const maxAlerts = opts.maxAlerts ?? 50;

  useEffect(() => {
    const refresh = (rowIds: string[], columnIds?: string[]) => {
      if (!api || api.isDestroyed()) return;
      const rowNodes = rowIds.map((id) => api.getRowNode(id)).filter((n): n is IRowNode<T> => !!n);
      if (rowIds.length && rowNodes.length === 0) return;
      api.refreshCells({ rowNodes: rowIds.length ? rowNodes : undefined, columns: columnIds, force: true });
    };
    const onEvent = (e: RuntimeEvent) => {
      switch (e.type) {
        case 'flash':
        case 'flashEnd':
          refresh(e.refresh.rowIds, e.refresh.columnIds);
          break;
        case 'highlightEnd':
          refresh(e.rowIds);
          break;
        case 'calculatedColumnsChanged':
          refresh(e.rowIds ?? [], e.columnIds);
          break;
        case 'alert': {
          const a = e.alert;
          setAlerts((prev) => [a, ...prev].slice(0, maxAlerts));
          if (a.behaviour.logToConsole) console.info(`[alert] ${a.header}: ${a.text}`, a);
          if (a.behaviour.notify) {
            toast({
              title: a.header,
              description: a.text,
              variant: a.messageType === 'error' ? 'destructive' : 'default',
              duration:
                a.behaviour.notificationDuration === 'always' ? 1_000_000 : a.behaviour.notificationDuration,
            });
          }
          if (a.rowId) refresh([a.rowId]);
          if (api && !api.isDestroyed() && (a.behaviour.jumpToRow || a.behaviour.jumpToCell) && a.rowId) {
            const node = api.getRowNode(a.rowId);
            if (node?.rowIndex !== null && node?.rowIndex !== undefined) {
              api.ensureIndexVisible(node.rowIndex, 'middle');
              if (a.behaviour.jumpToCell && a.columnId) api.ensureColumnVisible(a.columnId);
            }
          }
          break;
        }
        default:
          break;
      }
    };
    const unsubscribe = runtime.subscribe(onEvent);
    const id = setInterval(() => runtime.tick(), opts.tickMs ?? 100);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, [api, runtime, maxAlerts, opts.tickMs]);

  useEffect(() => () => runtime.dispose(), [runtime]);

  return { runtime, alerts, clearAlerts: () => setAlerts([]) };
}

/** Diff two row snapshots into cell changes for the runtime. */
export function diffRow<T extends Record<string, unknown>>(
  rowId: string,
  before: T,
  after: T,
  at: number,
  trigger: CellChange['trigger'] = 'tick',
): CellChange[] {
  const out: CellChange[] = [];
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const same =
      a === b ||
      (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()) ||
      (Number.isNaN(a) && Number.isNaN(b));
    if (!same) out.push({ rowId, columnId: key, oldValue: a, newValue: b, data: after, at, trigger });
  }
  return out;
}
