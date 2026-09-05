/**
 * GridRuntime: the live half of the engine. Hosts push data changes in;
 * registered parts (flashing, alerts, calculated columns) react and emit
 * events the host renders (refresh cells, toast, highlight). Pure and
 * clock-agnostic: timestamps come with the changes and `tick(now)` drives
 * expiry, so tests never need timers.
 */
import type { ColumnInfo } from '@smartgrid/schema';
import type { ColumnStats, FlashService, RuntimeEvent, StatsService } from '../core/types.js';

export interface CellChange {
  rowId: string;
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
  /** Row data after the change. */
  data: Record<string, unknown>;
  at: number;
  trigger?: 'edit' | 'tick' | 'undo' | 'load';
}

export interface RowChange {
  kind: 'added' | 'removed';
  rowId: string;
  data: Record<string, unknown>;
  at: number;
}

export interface RuntimeHost {
  /** Current rows (data objects) in the grid, for aggregated and statistical work. */
  getRows(): readonly Record<string, unknown>[];
  rowIdOf(data: Record<string, unknown>): string;
  now?: () => number;
}

/** A module's live behaviour. Registered during build; replaced on the next build. */
export interface RuntimePart {
  id: string;
  onCells?(changes: readonly CellChange[]): void;
  onRows?(changes: readonly RowChange[]): void;
  onTick?(now: number): void;
  dispose?(): void;
}

export type RuntimeListener = (event: RuntimeEvent) => void;

const DETACHED_HOST: RuntimeHost = { getRows: () => [], rowIdOf: (d) => String(d['id'] ?? '') };

export class GridRuntime {
  readonly host: RuntimeHost;
  private readonly parts = new Map<string, RuntimePart>();
  private readonly listeners = new Set<RuntimeListener>();
  private disposed = false;
  columns: ColumnInfo[] = [];
  /** Set by the flashing module; formatting-level cellClassRules read it. */
  flash?: FlashService;
  readonly stats: StatsService;

  constructor(host: RuntimeHost = DETACHED_HOST) {
    this.host = host;
    this.stats = createStats(this);
  }

  now(): number {
    return this.host.now ? this.host.now() : Date.now();
  }

  /** Called by buildGrid before modules run, so stale parts from the previous build are dropped. */
  reset(columns: ColumnInfo[]): void {
    for (const p of this.parts.values()) p.dispose?.();
    this.parts.clear();
    this.flash = undefined;
    this.columns = columns;
    this.stats.invalidate();
  }

  register(part: RuntimePart): void {
    this.parts.get(part.id)?.dispose?.();
    this.parts.set(part.id, part);
  }

  part<T extends RuntimePart>(id: string): T | undefined {
    return this.parts.get(id) as T | undefined;
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RuntimeEvent): void {
    if (this.disposed) return;
    for (const l of this.listeners) l(event);
  }

  /** Feed cell changes (edits, ticks). Invalidates stats for the touched columns first. */
  cellsChanged(changes: readonly CellChange[]): void {
    if (this.disposed || changes.length === 0) return;
    this.stats.invalidate([...new Set(changes.map((c) => c.columnId))]);
    for (const p of this.parts.values()) p.onCells?.(changes);
  }

  rowsChanged(changes: readonly RowChange[]): void {
    if (this.disposed || changes.length === 0) return;
    this.stats.invalidate();
    for (const p of this.parts.values()) p.onRows?.(changes);
  }

  /** Advance clocks: flash expiry, NONE observables, highlight timeouts. */
  tick(now = this.now()): void {
    if (this.disposed) return;
    for (const p of this.parts.values()) p.onTick?.(now);
  }

  dispose(): void {
    for (const p of this.parts.values()) p.dispose?.();
    this.parts.clear();
    this.listeners.clear();
    this.disposed = true;
  }
}

function createStats(runtime: GridRuntime): StatsService {
  const cache = new Map<string, ColumnStats | null>();
  return {
    statsFor(columnId) {
      const hit = cache.get(columnId);
      if (hit !== undefined) return hit ?? undefined;
      const values: number[] = [];
      for (const row of runtime.host.getRows()) {
        const v = row[columnId];
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
        if (Number.isFinite(n)) values.push(n);
      }
      if (values.length === 0) {
        cache.set(columnId, null);
        return undefined;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const stats: ColumnStats = {
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
        count: values.length,
      };
      cache.set(columnId, stats);
      return stats;
    },
    invalidate(columnIds) {
      if (!columnIds) cache.clear();
      else for (const id of columnIds) cache.delete(id);
    },
  };
}
