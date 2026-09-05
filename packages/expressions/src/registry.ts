import type { ExpressionKind } from '@smartgrid/schema';
import type { FunctionDef, FunctionRegistry } from './types.js';

/** Case-insensitive function registry. Later registrations override earlier ones (host overrides system). */
export class MapFunctionRegistry implements FunctionRegistry {
  private readonly map = new Map<string, FunctionDef>();

  constructor(defs: readonly FunctionDef[] = []) {
    for (const d of defs) this.register(d);
  }

  register(def: FunctionDef): void {
    this.map.set(def.name.toUpperCase(), { ...def, name: def.name.toUpperCase() });
  }

  get(name: string): FunctionDef | undefined {
    return this.map.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.map.has(name.toUpperCase());
  }

  list(kind?: ExpressionKind): readonly FunctionDef[] {
    const all = [...this.map.values()].filter((d) => !d.hidden);
    return kind ? all.filter((d) => d.kinds.includes(kind)) : all;
  }

  /** New registry with these definitions layered on top. */
  extend(defs: readonly FunctionDef[]): MapFunctionRegistry {
    return new MapFunctionRegistry([...this.map.values(), ...defs]);
  }
}
