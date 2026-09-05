import { useEffect, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import { mulberry32, tick, type Trade } from '../data/blotter.js';

/** Push simulated price updates into the grid via async transactions. */
export function useTicking(api: GridApi<Trade> | undefined, trades: Trade[], enabled: boolean, intervalMs = 250) {
  const rnd = useRef(mulberry32(7));
  useEffect(() => {
    if (!api || !enabled) return;
    const id = setInterval(() => {
      const changed = tick(trades, rnd.current, 25);
      for (const c of changed) {
        const idx = trades.findIndex((t) => t.tradeId === c.tradeId);
        if (idx >= 0) trades[idx] = c;
      }
      api.applyTransactionAsync({ update: changed });
    }, intervalMs);
    return () => clearInterval(id);
  }, [api, trades, enabled, intervalMs]);
}
