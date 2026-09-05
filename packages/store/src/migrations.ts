import { MODULES, type ModuleId, type GridConfig } from '@smartgrid/schema';

/** Migrates one module's data from `fromVersion` to `fromVersion + 1`. */
export type ModuleMigration = (data: unknown) => unknown;

/**
 * Registry of per-module migrations keyed by the version they upgrade *from*.
 * A module at version n with a stored envelope at version m < n runs
 * migrations m, m+1, …, n-1 in order. Missing steps throw, so a forgotten
 * migration is loud rather than silently corrupting state.
 */
export class MigrationRegistry {
  private steps = new Map<string, Map<number, ModuleMigration>>();

  register(moduleId: ModuleId, fromVersion: number, migrate: ModuleMigration): this {
    const forModule = this.steps.get(moduleId) ?? new Map<number, ModuleMigration>();
    forModule.set(fromVersion, migrate);
    this.steps.set(moduleId, forModule);
    return this;
  }

  /**
   * Upgrade every known module in the document to its current version.
   * Unknown modules and modules already current pass through untouched.
   */
  migrate(config: GridConfig): { config: GridConfig; migrated: ModuleId[] } {
    const migrated: ModuleId[] = [];
    const modules: GridConfig['modules'] = { ...config.modules };
    for (const [id, env] of Object.entries(modules)) {
      if (!(id in MODULES)) continue;
      const target = MODULES[id as ModuleId].version;
      if (env.v >= target) continue;
      let data = env.data;
      for (let v = env.v; v < target; v++) {
        const step = this.steps.get(id)?.get(v);
        if (!step) throw new Error(`No migration for module "${id}" from v${v} to v${v + 1}`);
        data = step(data);
      }
      modules[id] = { v: target, data };
      migrated.push(id as ModuleId);
    }
    return { config: { ...config, modules }, migrated };
  }
}
