import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnInfo } from '@smartgrid/schema';
import type { GridApi } from 'ag-grid-community';
import {
  Bell,
  Moon,
  Sun,
  Monitor,
  RotateCcw,
  Undo2,
  Redo2,
  Play,
  Pause,
  SlidersHorizontal,
} from 'lucide-react';
import { sgGridTheme } from '@smartgrid/design-system/ag-grid';
import { EditorContextProvider } from '@smartgrid/editors';
import { Button, ThemeProvider, Toaster, cn, useTheme } from '@smartgrid/ui';
import { BLOTTER_COLUMN_DEFS, describeColumns, generateTrades, type Trade } from './data/blotter.js';
import { GRID_ID, seedConfig } from './data/seedConfig.js';
import { useConfigStore } from './grid/useConfigStore.js';
import { useEditorContextValue } from './grid/editorContext.js';
import { useGridRuntime } from './grid/useGridRuntime.js';
import { SmartGridView } from './grid/SmartGridView.js';
import { useTicking } from './grid/useTicking.js';
import { Customizer } from './pages/Customizer.js';
import { GalleryPage } from './pages/GalleryPage.js';

type Route = 'grid' | 'customizer' | 'gallery';

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'gallery' ? 'gallery' : h === 'customizer' ? 'customizer' : 'grid';
}

function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(routeFromHash);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    window.location.hash = r === 'grid' ? '/' : `/${r}`;
  };
  return [route, go];
}

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Playground />
    </ThemeProvider>
  );
}

function Playground() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [route, go] = useHashRoute();
  const trades = useMemo(() => generateTrades(500), []);
  const columns = useMemo(() => describeColumns(BLOTTER_COLUMN_DEFS, trades), [trades]);
  const seed = useCallback(() => seedConfig(), []);
  const { store, config, ready, error, lastEntry } = useConfigStore(GRID_ID, seed);
  const [api, setApi] = useState<GridApi<Trade>>();
  const [ticking, setTicking] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [gridColumns, setGridColumns] = useState<ColumnInfo[]>(columns);
  const { runtime, alerts, clearAlerts } = useGridRuntime(
    api as GridApi<Record<string, unknown>> | undefined,
    trades as unknown as Record<string, unknown>[],
    (t) => String(t['tradeId']),
  );
  useTicking(api, trades, ticking && route !== 'gallery', runtime);
  const editorCtx = useEditorContextValue(gridColumns, trades, resolvedTheme === 'dark' ? 'dark' : 'light');

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

  const navButton = (r: Route, label: string) => (
    <Button size="sm" variant={route === r ? 'secondary' : 'ghost'} onClick={() => go(r)}>
      {label}
    </Button>
  );

  return (
    <EditorContextProvider value={editorCtx}>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-semibold">SmartGrid</span>
          <span className="text-muted-foreground text-xs">playground · M0.5</span>
          <nav className="ml-3 flex items-center gap-0.5">
            {navButton('grid', 'Grid')}
            {navButton('customizer', 'Customizer')}
            {navButton('gallery', 'Gallery')}
          </nav>
          {route !== 'gallery' && (
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
          )}
          <div className="ml-auto flex items-center gap-1">
            <span className="text-muted-foreground mr-2 text-xs">
              rev {config?.revision ?? '–'}
              {lastEntry ? ` · ${lastEntry.origin}` : ''}
            </span>
            <Button
              size="sm"
              variant="ghost"
              title={alerts.length ? `${alerts.length} alerts (click to clear)` : 'No alerts'}
              className="relative"
              onClick={clearAlerts}
            >
              <Bell className="size-4" />
              {alerts.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-destructive px-1 text-2xs leading-4 text-destructive-foreground">
                  {alerts.length}
                </span>
              )}
            </Button>
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
              variant={route === 'customizer' ? 'secondary' : 'ghost'}
              title="Customize"
              onClick={() => go(route === 'customizer' ? 'grid' : 'customizer')}
            >
              <SlidersHorizontal className="size-4" />
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
        {warnings.length > 0 && route !== 'gallery' && (
          <div className="bg-warning/10 text-warning px-3 py-1 text-xs">{warnings.join(' · ')}</div>
        )}
        <main className={cn('flex min-h-0 flex-1', route === 'gallery' && 'flex-col')}>
          {route === 'gallery' ? (
            <GalleryPage />
          ) : ready && config ? (
            <>
              <div className="min-h-0 min-w-0 flex-1">
                <SmartGridView
                  config={config}
                  baseColumnDefs={BLOTTER_COLUMN_DEFS}
                  columns={columns}
                  rowData={trades}
                  theme={sgGridTheme}
                  runtime={runtime}
                  onGridReady={setApi}
                  onWarnings={setWarnings}
                  onColumns={setGridColumns}
                />
              </div>
              {route === 'customizer' && (
                <Customizer store={store} config={config} onClose={() => go('grid')} />
              )}
            </>
          ) : (
            <div className="text-muted-foreground p-6 text-sm">Loading config…</div>
          )}
        </main>
        <Toaster />
      </div>
    </EditorContextProvider>
  );
}
