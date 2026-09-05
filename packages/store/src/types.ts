import type { GridConfig } from '@smartgrid/schema';
import type { Operation } from 'fast-json-patch';

export type JsonPatch = Operation[];

/** A profile is one saved config document for a grid instance. */
export interface ProfileMeta {
  gridId: string;
  profile: string;
  revision: number;
  updatedAt: string;
  isDefault?: boolean;
}

/** One applied change, kept for undo, audit and replay. */
export interface PatchEntry {
  id: string;
  gridId: string;
  profile: string;
  /** Revision the patch was applied on top of. */
  baseRevision: number;
  /** Revision after applying. */
  revision: number;
  patch: JsonPatch;
  /** Inverse patch that restores `baseRevision`. */
  inverse: JsonPatch;
  origin: 'assistant' | 'form' | 'api' | 'migration';
  /** The natural-language prompt that produced the patch, when the origin is the assistant. */
  prompt?: string;
  /** Model identifier when the origin is the assistant. */
  model?: string;
  rationale?: string;
  createdAt: string;
}

/** Data shared by all profiles of a grid (e.g. data-provider selection). */
export type GridLevelData = Record<string, unknown>;

export interface StorageChange {
  gridId: string;
  profile?: string;
  kind: 'profile' | 'gridLevel' | 'patchLog';
}

/**
 * Persistence contract. Every persistence concern (config documents, patch
 * log, grid-level data) goes through one adapter so IndexedDB, memory and a
 * future REST backend are interchangeable.
 */
export interface StorageAdapter {
  listProfiles(gridId: string): Promise<ProfileMeta[]>;
  loadProfile(gridId: string, profile: string): Promise<GridConfig | undefined>;
  saveProfile(config: GridConfig): Promise<void>;
  deleteProfile(gridId: string, profile: string): Promise<void>;

  appendPatch(entry: PatchEntry): Promise<void>;
  listPatches(gridId: string, profile: string, limit?: number): Promise<PatchEntry[]>;
  deletePatchesFrom(gridId: string, profile: string, revision: number): Promise<void>;
  clearPatches(gridId: string, profile: string): Promise<void>;

  loadGridLevel(gridId: string): Promise<GridLevelData | undefined>;
  saveGridLevel(gridId: string, data: GridLevelData): Promise<void>;

  /** Optional cross-tab / cross-client change notifications. */
  subscribe?(listener: (change: StorageChange) => void): () => void;

  /** Release resources (close DB handles). */
  close?(): Promise<void>;
}

export class RevisionConflictError extends Error {
  constructor(
    public readonly gridId: string,
    public readonly profile: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`Revision conflict on ${gridId}/${profile}: expected ${expected}, stored ${actual}`);
    this.name = 'RevisionConflictError';
  }
}
