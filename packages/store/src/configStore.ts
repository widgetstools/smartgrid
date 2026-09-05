import { applyPatch, compare, type Operation } from 'fast-json-patch';
import { parseGridConfig, type GridConfig, type ModuleId, type TypedGridConfig } from '@smartgrid/schema';
import { MigrationRegistry } from './migrations.js';
import { RevisionConflictError, type JsonPatch, type PatchEntry, type StorageAdapter } from './types.js';

export interface ApplyOptions {
  origin: PatchEntry['origin'];
  prompt?: string;
  model?: string;
  rationale?: string;
  /** Reject if the stored revision differs (optimistic concurrency). */
  expectedRevision?: number;
}

export interface ConfigStoreOptions {
  adapter: StorageAdapter;
  migrations?: MigrationRegistry;
  /** Debounce persistence of the document (ms). Patch log entries are written immediately. */
  persistDebounceMs?: number;
  now?: () => Date;
  idGen?: () => string;
  /** Called when a background persist fails; defaults to console.error. */
  onPersistError?: (error: unknown) => void;
}

type Listener = (config: GridConfig, entry?: PatchEntry) => void;

/**
 * The config document's lifecycle: load (with migration), apply JSON patches
 * with revision bumps and an inverse for undo, persist (debounced), undo/redo
 * against the patch log, and change notification.
 *
 * Both producers (assistant and forms) call `apply`; neither writes the
 * document directly. Validation happens before `apply` in `packages/engine`;
 * this store only guards structure (the document must still parse).
 */
export class ConfigStore {
  private config: GridConfig | undefined;
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private redoStack: PatchEntry[] = [];
  private disposed = false;
  private readonly now: () => Date;
  private readonly idGen: () => string;
  private readonly migrations: MigrationRegistry;
  private readonly persistDebounceMs: number;

  constructor(private readonly opts: ConfigStoreOptions) {
    this.now = opts.now ?? (() => new Date());
    this.idGen = opts.idGen ?? (() => crypto.randomUUID());
    this.migrations = opts.migrations ?? new MigrationRegistry();
    this.persistDebounceMs = opts.persistDebounceMs ?? 300;
  }

  get adapter(): StorageAdapter {
    return this.opts.adapter;
  }

  /** Current document, or undefined before `load`/`init`. */
  get current(): GridConfig | undefined {
    return this.config;
  }

  /** Load a stored profile, migrating if needed; returns undefined if none exists. */
  async load(gridId: string, profile = 'default'): Promise<GridConfig | undefined> {
    const stored = await this.opts.adapter.loadProfile(gridId, profile);
    if (!stored) return undefined;
    const { config, migrated } = this.migrations.migrate(stored);
    this.config = config;
    this.redoStack = [];
    if (migrated.length > 0) await this.opts.adapter.saveProfile(config);
    this.emit();
    return config;
  }

  /** Adopt a document (e.g. a freshly created one) and persist it. */
  async init(config: GridConfig): Promise<void> {
    const parsed = parseGridConfig(config);
    if (!parsed.ok) throw new Error(`Invalid config document: ${describe(parsed)}`);
    this.config = structuredClone(config);
    this.redoStack = [];
    await this.opts.adapter.saveProfile(this.config);
    this.emit();
  }

  /**
   * Apply a JSON Patch. Bumps the revision, records the entry with an inverse,
   * schedules persistence and notifies listeners. Throws `RevisionConflictError`
   * when `expectedRevision` is stale, and a plain Error when the result no
   * longer parses.
   */
  async apply(patch: JsonPatch, options: ApplyOptions): Promise<PatchEntry> {
    const base = this.requireConfig();
    if (options.expectedRevision !== undefined && options.expectedRevision !== base.revision) {
      throw new RevisionConflictError(base.gridId, base.profile, options.expectedRevision, base.revision);
    }
    const next = applyPatch(structuredClone(base), patch, true, false).newDocument;
    next.revision = base.revision + 1;
    next.updatedAt = this.now().toISOString();

    const parsed = parseGridConfig(next);
    if (!parsed.ok) throw new Error(`Patch produces an invalid document: ${describe(parsed)}`);

    const entry: PatchEntry = {
      id: this.idGen(),
      gridId: base.gridId,
      profile: base.profile,
      baseRevision: base.revision,
      revision: next.revision,
      patch,
      inverse: inverseOf(base, next),
      origin: options.origin,
      prompt: options.prompt,
      model: options.model,
      rationale: options.rationale,
      createdAt: next.updatedAt,
    };

    this.config = next;
    this.redoStack = [];
    await this.opts.adapter.deletePatchesFrom(base.gridId, base.profile, next.revision);
    await this.opts.adapter.appendPatch(entry);
    this.schedulePersist();
    this.emit(entry);
    return entry;
  }

  /** Replace one module's data wholesale (convenience over `apply`). */
  async setModule<M extends ModuleId>(
    moduleId: M,
    data: TypedGridConfig['modules'][M],
    options: ApplyOptions,
  ) {
    const base = this.requireConfig();
    const op: Operation = base.modules[moduleId]
      ? { op: 'replace', path: `/modules/${moduleId}`, value: data }
      : { op: 'add', path: `/modules/${moduleId}`, value: data };
    return this.apply([op], options);
  }

  /** Revert the last applied patch. Returns the reverted entry, or undefined if nothing to undo. */
  async undo(): Promise<PatchEntry | undefined> {
    const base = this.requireConfig();
    const log = await this.opts.adapter.listPatches(base.gridId, base.profile);
    const last = log.at(-1);
    if (!last || last.revision !== base.revision) return undefined;
    const prev = applyPatch(structuredClone(base), last.inverse, true, false).newDocument;
    prev.revision = last.baseRevision;
    this.config = prev;
    await this.opts.adapter.deletePatchesFrom(base.gridId, base.profile, last.revision);
    this.redoStack.push(last);
    this.schedulePersist();
    this.emit();
    return last;
  }

  /** Re-apply the most recently undone patch. */
  async redo(): Promise<PatchEntry | undefined> {
    const entry = this.redoStack.pop();
    if (!entry) return undefined;
    const base = this.requireConfig();
    const next = applyPatch(structuredClone(base), entry.patch, true, false).newDocument;
    next.revision = entry.revision;
    this.config = next;
    await this.opts.adapter.appendPatch(entry);
    this.schedulePersist();
    this.emit(entry);
    return entry;
  }

  /** Persist immediately (cancels any pending debounce). */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    if (this.config && !this.disposed) await this.opts.adapter.saveProfile(this.config);
  }

  /** Flush pending writes, stop background persistence and close the adapter. */
  async dispose(): Promise<void> {
    await this.flush();
    this.disposed = true;
    this.listeners.clear();
    await this.opts.adapter.close?.();
  }

  async history(limit?: number): Promise<PatchEntry[]> {
    const c = this.requireConfig();
    return this.opts.adapter.listPatches(c.gridId, c.profile, limit);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requireConfig(): GridConfig {
    if (!this.config) throw new Error('ConfigStore has no document; call load() or init() first');
    return this.config;
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.flush().catch((err) => (this.opts.onPersistError ?? console.error)(err));
    }, this.persistDebounceMs);
  }

  private emit(entry?: PatchEntry) {
    if (!this.config) return;
    for (const l of this.listeners) l(this.config, entry);
  }
}

function inverseOf(base: GridConfig, next: GridConfig): JsonPatch {
  // Compare everything except bookkeeping fields, which apply/undo manage.
  const strip = (c: GridConfig) => ({ ...c, revision: 0, updatedAt: undefined });
  return compare(strip(next), strip(base));
}

function describe(r: ReturnType<typeof parseGridConfig>): string {
  if (r.ok) return '';
  const parts: string[] = [];
  if (r.envelopeIssues) parts.push(...r.envelopeIssues.map((i) => `${i.path.join('.')}: ${i.message}`));
  for (const m of r.moduleIssues)
    parts.push(...m.issues.map((i) => `${m.moduleId}.${i.path.join('.')}: ${i.message}`));
  return parts.join('; ');
}
