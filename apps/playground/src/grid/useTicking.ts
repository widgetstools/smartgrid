import { useEffect, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { GridRuntime } from '@smartgrid/engine';
import { mulberry32, tick, type Trade } from '../data/blotter.js';
import { diffRow } from './useGridRuntime.js';

/** Push simulated price updates into the grid via async transactions and into the engine runtime as cell changes. */
export function useTicking(
  api: GridApi<Trade> | undefined,
  trades: Trade[],
  enabled: boolean,
  runtime?: GridRuntime,
  intervalMs = 250,
) {
  const rnd = useRef(mulberry32(7));
  useEffect(() => {
    if (!api || !enabled) return;
    const id = setInterval(() => {
      const changed = tick(trades, rnd.current, 25);
      const at = Date.now();
      const changes = changed.flatMap((c) => {
        const idx = trades.findIndex((t) => t.tradeId === c.tradeId);
        if (idx < 0) return [];
        const before = trades[idx]!;
        trades[idx] = c;
        return diffRow(
          c.tradeId,
          before as unknown as Record<string, unknown>,
          c as unknown as Record<string, unknown>,
          at,
        );
      });
      api.applyTransactionAsync({ update: changed }, () => runtime?.cellsChanged(changes));
    }, intervalMs);
    return () => clearInterval(id);
  }, [api, trades, enabled, intervalMs, runtime]);
}
