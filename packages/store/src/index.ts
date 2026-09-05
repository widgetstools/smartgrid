// @smartgrid/store — persistence for the SmartGrid config document.
export * from './types.js';
export { MemoryAdapter } from './memoryAdapter.js';
export { IndexedDbAdapter } from './indexedDbAdapter.js';
export { MigrationRegistry, type ModuleMigration } from './migrations.js';
export { ConfigStore, type ApplyOptions, type ConfigStoreOptions } from './configStore.js';
