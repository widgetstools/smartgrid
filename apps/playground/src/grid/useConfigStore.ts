import { useEffect, useMemo, useState } from 'react';
import { parseGridConfig, type GridConfig, type TypedGridConfig } from '@smartgrid/schema';
import { ConfigStore, IndexedDbAdapter, type PatchEntry } from '@smartgrid/store';

export interface ConfigState {
  store: ConfigStore;
  config: TypedGridConfig | undefined;
  raw: GridConfig | undefined;
  lastEntry: PatchEntry | undefined;
  ready: boolean;
  error: string | undefined;
}

/**
 * Owns the ConfigStore for one grid instance: loads the persisted profile or
 * seeds it, and re-renders on every applied patch. Reloading the page brings
 * back exactly what was last applied.
 */
export function useConfigStore(gridId: string, seed: () => GridConfig, profile = 'default'): ConfigState {
  const store = useMemo(() => new ConfigStore({ adapter: new IndexedDbAdapter() }), []);
  const [raw, setRaw] = useState<GridConfig>();
  const [lastEntry, setLastEntry] = useState<PatchEntry>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = store.subscribe((c, entry) => {
      setRaw(c);
      setLastEntry(entry);
    });
    (async () => {
      try {
        const loaded = await store.load(gridId, profile);
        if (!loaded) await store.init(seed());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      void store.dispose();
    };
  }, [store, gridId, profile, seed]);

  const config = useMemo(() => {
    if (!raw) return undefined;
    const parsed = parseGridConfig(raw);
    return parsed.ok ? parsed.config : undefined;
  }, [raw]);

  return { store, config, raw, lastEntry, ready, error };
}
