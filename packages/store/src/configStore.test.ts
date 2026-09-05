import { describe, expect, it } from 'vitest';
import { createGridConfig, defaultTableLayout, type GridConfig } from '@smartgrid/schema';
import { ConfigStore } from './configStore.js';
import { MemoryAdapter } from './memoryAdapter.js';
import { IndexedDbAdapter } from './indexedDbAdapter.js';
import { MigrationRegistry } from './migrations.js';
import { RevisionConflictError, type StorageAdapter } from './types.js';

function seed(gridId = 'g1'): GridConfig {
  const cfg = createGridConfig(gridId);
  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'a', layouts: [defaultTableLayout('a', 'A', ['x', 'y'])] } };
  return cfg as GridConfig;
}

let n = 0;
const makeStore = (adapter: StorageAdapter) =>
  new ConfigStore({ adapter, persistDebounceMs: 0, idGen: () => `p${++n}`, now: () => new Date('2026-09-05T10:00:00Z') });

const adapters: Array<[string, () => StorageAdapter]> = [
  ['MemoryAdapter', () => new MemoryAdapter()],
  ['IndexedDbAdapter', () => new IndexedDbAdapter(`test-${Math.random().toString(36).slice(2)}`)],
];

describe.each(adapters)('ConfigStore with %s', (_name, makeAdapter) => {
  it('init persists and load restores with modules typed', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    await store.flush();
    const store2 = makeStore(adapter);
    const loaded = await store2.load('g1');
    expect(loaded?.modules['layout']?.v).toBe(1);
    expect(loaded?.revision).toBe(0);
    await store.dispose();
  });

  it('apply bumps revision, records patch with inverse, and persists', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    const entry = await store.apply(
      [{ op: 'add', path: '/modules/layout/data/layouts/0/columnPinning/x', value: 'left' }],
      { origin: 'assistant', prompt: 'pin x left', model: 'test' },
    );
    expect(entry.revision).toBe(1);
    expect(entry.inverse).toEqual([{ op: 'remove', path: '/modules/layout/data/layouts/0/columnPinning/x' }]);
    await store.flush();
    const stored = await adapter.loadProfile('g1', 'default');
    expect(stored?.revision).toBe(1);
    expect((await adapter.listPatches('g1', 'default')).map((p) => p.prompt)).toEqual(['pin x left']);
    await store.dispose();
  });

  it('rejects patches that break the schema', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    await expect(
      store.apply([{ op: 'replace', path: '/modules/layout/data/currentLayoutId', value: 'nope' }], { origin: 'form' }),
    ).rejects.toThrow(/currentLayoutId/);
    expect(store.current?.revision).toBe(0);
    await store.dispose();
  });

  it('enforces expectedRevision', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    await store.apply([{ op: 'replace', path: '/profile', value: 'default' }], { origin: 'api' });
    await expect(
      store.apply([{ op: 'replace', path: '/profile', value: 'default' }], { origin: 'api', expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    await store.dispose();
  });

  it('undo and redo walk the patch log', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    await store.apply([{ op: 'add', path: '/modules/layout/data/layouts/0/columnHeaders/x', value: 'X!' }], {
      origin: 'form',
    });
    await store.apply([{ op: 'add', path: '/modules/layout/data/layouts/0/columnHeaders/y', value: 'Y!' }], {
      origin: 'form',
    });
    expect(store.current?.revision).toBe(2);

    const undone = await store.undo();
    expect(undone?.revision).toBe(2);
    expect(store.current?.revision).toBe(1);
    expect((store.current?.modules['layout']?.data as { layouts: { columnHeaders: Record<string, string> }[] }).layouts[0]?.columnHeaders).toEqual({ x: 'X!' });
    expect((await adapter.listPatches('g1', 'default')).length).toBe(1);

    const redone = await store.redo();
    expect(redone?.revision).toBe(2);
    expect(store.current?.revision).toBe(2);
    expect((await adapter.listPatches('g1', 'default')).length).toBe(2);

    // A new apply after undo discards the redo stack and truncates the log.
    await store.undo();
    await store.apply([{ op: 'add', path: '/modules/layout/data/layouts/0/columnHeaders/z', value: 'Z' }], { origin: 'form' });
    expect(await store.redo()).toBeUndefined();
    expect((await adapter.listPatches('g1', 'default')).map((p) => p.revision)).toEqual([1, 2]);
    await store.dispose();
  });

  it('setModule adds or replaces a module slice', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    await store.init(seed());
    await store.setModule('formatting', { v: 1, data: { formatColumns: [], editStateStyles: {} } }, { origin: 'api' });
    expect(store.current?.modules['formatting']?.v).toBe(1);
    await store.dispose();
  });

  it('notifies subscribers and grid-level data round-trips', async () => {
    const adapter = makeAdapter();
    const store = makeStore(adapter);
    const seen: number[] = [];
    store.subscribe((c) => seen.push(c.revision));
    await store.init(seed());
    await store.apply([{ op: 'replace', path: '/profile', value: 'default' }], { origin: 'api' });
    expect(seen).toEqual([0, 1]);
    await adapter.saveGridLevel('g1', { provider: 'live' });
    expect(await adapter.loadGridLevel('g1')).toEqual({ provider: 'live' });
    await store.dispose();
  });
});

describe('MigrationRegistry', () => {
  it('runs chained migrations up to the current version and throws on gaps', () => {
    const reg = new MigrationRegistry().register('formatting', 0, (d) => ({ ...(d as object), migrated: true }));
    const cfg = seed();
    cfg.modules['formatting'] = { v: 0, data: { formatColumns: [] } };
    const { config, migrated } = reg.migrate(cfg);
    expect(migrated).toEqual(['formatting']);
    expect(config.modules['formatting']).toEqual({ v: 1, data: { formatColumns: [], migrated: true } });

    const gap = seed();
    gap.modules['layout'] = { v: 0, data: {} };
    expect(() => new MigrationRegistry().migrate(gap)).toThrow(/No migration for module "layout"/);
  });

  it('load applies migrations and re-persists', async () => {
    const adapter = new MemoryAdapter();
    const cfg = seed();
    cfg.modules['formatting'] = { v: 0, data: { formatColumns: [] } };
    await adapter.saveProfile(cfg);
    const store = new ConfigStore({
      adapter,
      migrations: new MigrationRegistry().register('formatting', 0, () => ({ formatColumns: [], editStateStyles: {} })),
    });
    const loaded = await store.load('g1');
    expect(loaded?.modules['formatting']?.v).toBe(1);
    expect((await adapter.loadProfile('g1', 'default'))?.modules['formatting']?.v).toBe(1);
  });
});
