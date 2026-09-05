import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GridConfig } from '@smartgrid/schema';
import type { GridLevelData, PatchEntry, ProfileMeta, StorageAdapter, StorageChange } from './types.js';

interface SmartGridDb extends DBSchema {
  profiles: {
    key: [string, string];
    value: GridConfig;
    indexes: { byGrid: string };
  };
  patches: {
    key: string;
    value: PatchEntry;
    indexes: { byProfile: [string, string, number] };
  };
  gridLevel: {
    key: string;
    value: { gridId: string; data: GridLevelData };
  };
}

const DB_VERSION = 1;

/**
 * IndexedDB adapter (default in the browser). One database per `dbName`;
 * profiles keyed by `[gridId, profile]`, patches indexed by
 * `[gridId, profile, revision]`. Cross-tab notifications use `BroadcastChannel`
 * when available.
 */
export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise: Promise<IDBPDatabase<SmartGridDb>>;
  private channel: BroadcastChannel | undefined;
  private listeners = new Set<(c: StorageChange) => void>();

  constructor(private readonly dbName = 'smartgrid') {
    this.dbPromise = openDB<SmartGridDb>(dbName, DB_VERSION, {
      upgrade(db) {
        const profiles = db.createObjectStore('profiles', { keyPath: ['gridId', 'profile'] });
        profiles.createIndex('byGrid', 'gridId');
        const patches = db.createObjectStore('patches', { keyPath: 'id' });
        patches.createIndex('byProfile', ['gridId', 'profile', 'revision']);
        db.createObjectStore('gridLevel', { keyPath: 'gridId' });
      },
    });
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`${dbName}:changes`);
      this.channel.onmessage = (ev: MessageEvent<StorageChange>) => {
        for (const l of this.listeners) l(ev.data);
      };
    }
  }

  async listProfiles(gridId: string): Promise<ProfileMeta[]> {
    const db = await this.dbPromise;
    const all = await db.getAllFromIndex('profiles', 'byGrid', gridId);
    return all.map((p) => ({ gridId: p.gridId, profile: p.profile, revision: p.revision, updatedAt: p.updatedAt ?? '' }));
  }

  async loadProfile(gridId: string, profile: string): Promise<GridConfig | undefined> {
    const db = await this.dbPromise;
    return db.get('profiles', [gridId, profile]);
  }

  async saveProfile(config: GridConfig): Promise<void> {
    const db = await this.dbPromise;
    await db.put('profiles', config);
    this.emit({ gridId: config.gridId, profile: config.profile, kind: 'profile' });
  }

  async deleteProfile(gridId: string, profile: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('profiles', [gridId, profile]);
    await this.clearPatches(gridId, profile);
    this.emit({ gridId, profile, kind: 'profile' });
  }

  async appendPatch(entry: PatchEntry): Promise<void> {
    const db = await this.dbPromise;
    await db.put('patches', entry);
    this.emit({ gridId: entry.gridId, profile: entry.profile, kind: 'patchLog' });
  }

  async listPatches(gridId: string, profile: string, limit?: number): Promise<PatchEntry[]> {
    const db = await this.dbPromise;
    const range = IDBKeyRange.bound([gridId, profile, 0], [gridId, profile, Number.MAX_SAFE_INTEGER]);
    const all = await db.getAllFromIndex('patches', 'byProfile', range);
    return limit === undefined ? all : all.slice(-limit);
  }

  async deletePatchesFrom(gridId: string, profile: string, revision: number): Promise<void> {
    const db = await this.dbPromise;
    const range = IDBKeyRange.bound([gridId, profile, revision], [gridId, profile, Number.MAX_SAFE_INTEGER]);
    const tx = db.transaction('patches', 'readwrite');
    let cursor = await tx.store.index('byProfile').openCursor(range);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async clearPatches(gridId: string, profile: string): Promise<void> {
    await this.deletePatchesFrom(gridId, profile, 0);
  }

  async loadGridLevel(gridId: string): Promise<GridLevelData | undefined> {
    const db = await this.dbPromise;
    return (await db.get('gridLevel', gridId))?.data;
  }

  async saveGridLevel(gridId: string, data: GridLevelData): Promise<void> {
    const db = await this.dbPromise;
    await db.put('gridLevel', { gridId, data });
    this.emit({ gridId, kind: 'gridLevel' });
  }

  subscribe(listener: (change: StorageChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    (await this.dbPromise).close();
    this.channel?.close();
  }

  private emit(change: StorageChange) {
    for (const l of this.listeners) l(change);
    this.channel?.postMessage(change);
  }
}
