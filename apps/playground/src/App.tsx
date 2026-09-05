import { useCallback, useMemo, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { Moon, Sun, Monitor, RotateCcw, Undo2, Redo2, Play, Pause } from 'lucide-react';
import { sgGridTheme } from '@smartgrid/design-system/ag-grid';
import { Button, ThemeProvider, useTheme } from '@smartgrid/ui';
import { BLOTTER_COLUMN_DEFS, describeColumns, generateTrades, type Trade } from './data/blotter.js';
import { GRID_ID, seedConfig } from './data/seedConfig.js';
import { useConfigStore } from './grid/useConfigStore.js';
import { SmartGridView } from './grid/SmartGridView.js';
import { useTicking } from './grid/useTicking.js';

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Playground />
    </ThemeProvider>
  );
}

function Playground() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const trades = useMemo(() => generateTrades(500), []);
  const columns = useMemo(() => describeColumns(BLOTTER_COLUMN_DEFS, trades), [trades]);
  const seed = useCallback(() => seedConfig(), []);
  const { store, config, ready, error, lastEntry } = useConfigStore(GRID_ID, seed);
  const [api, setApi] = useState<GridApi<Trade>>();
  const [ticking, setTicking] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  useTicking(api, trades, ticking);

  const layouts = config?.modules.layout?.data.layouts ?? [];
  const currentLayoutId = config?.modules.layout?.data.currentLayoutId;

  const switchLayout = (id: string) =>
    store.apply([{ op: 'replace', path: '/modules/layout/data/currentLayoutId', value: id }], {
      origin: 'form',
    });

  const reset = async () => {
    await store.init(seedConfig());
    await store.adapter.clearPatches(GRID_ID, 'default');
  };

  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'os' : 'light';
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-semibold">SmartGrid</span>
        <span className="text-muted-foreground text-xs">playground · M0</span>
        <div className="mx-4 flex items-center gap-1">
          {layouts.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant={l.id === currentLayoutId ? 'default' : 'outline'}
              onClick={() => switchLayout(l.id)}
            >
              {l.name}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-muted-foreground mr-2 text-xs">
            rev {config?.revision ?? '–'}
            {lastEntry ? ` · ${lastEntry.origin}` : ''}
          </span>
          <Button size="sm" variant="ghost" title="Undo" onClick={() => void store.undo()}>
            <Undo2 className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" title="Redo" onClick={() => void store.redo()}>
            <Redo2 className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title={ticking ? 'Pause ticking' : 'Resume ticking'}
            onClick={() => setTicking((t) => !t)}
          >
            {ticking ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="sm" variant="ghost" title="Reset to seed config" onClick={() => void reset()}>
            <RotateCcw className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title={`Theme: ${theme} (${resolvedTheme})`}
            onClick={() => setTheme(nextTheme)}
          >
            <ThemeIcon className="size-4" />
          </Button>
        </div>
      </header>
      {error && <div className="bg-destructive/10 text-destructive px-3 py-1 text-sm">{error}</div>}
      {warnings.length > 0 && (
        <div className="bg-warning/10 text-warning px-3 py-1 text-xs">{warnings.join(' · ')}</div>
      )}
      <main className="min-h-0 flex-1">
        {ready && config ? (
          <SmartGridView
            config={config}
            baseColumnDefs={BLOTTER_COLUMN_DEFS}
            columns={columns}
            rowData={trades}
            theme={sgGridTheme}
            onGridReady={setApi}
            onWarnings={setWarnings}
          />
        ) : (
          <div className="text-muted-foreground p-6 text-sm">Loading config…</div>
        )}
      </main>
    </div>
  );
}
