# @smartgrid/store

Persistence for the SmartGrid config document.

- `StorageAdapter` — the contract: profiles, patch log, grid-level data, optional change subscription.
- `MemoryAdapter` — tests and ephemeral sessions.
- `IndexedDbAdapter` — browser default, one database per name, cross-tab notifications via `BroadcastChannel`.
- `ConfigStore` — load (with migration), `apply(patch, { origin, prompt, model })` with revision bump and inverse patch, `undo`/`redo`, debounced persistence, subscribers.
- `MigrationRegistry` — per-module version steps; a missing step throws.

```ts
import { ConfigStore, IndexedDbAdapter } from '@smartgrid/store';
import { createGridConfig } from '@smartgrid/schema';

const store = new ConfigStore({ adapter: new IndexedDbAdapter() });
(await store.load('blotter')) ?? (await store.init(createGridConfig('blotter')));
await store.apply([{ op: 'add', path: '/modules/layout/data/layouts/0/columnPinning/notional', value: 'right' }], {
  origin: 'assistant',
  prompt: 'pin notional right',
});
```

A REST adapter implements the same interface later; nothing above it changes.
