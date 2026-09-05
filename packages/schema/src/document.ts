import { z } from 'zod';
import { LayoutModule, LAYOUT_MODULE_VERSION } from './modules/layout.js';
import { FormattingModule, FORMATTING_MODULE_VERSION } from './modules/formatting.js';

/**
 * Registry of config modules. Each module owns one slice of the document,
 * versioned independently so a schema change in one module never forces a
 * migration of another. New modules register here; the engine, the assistant
 * tools and the forms all iterate this map.
 */
export const MODULES = {
  layout: { version: LAYOUT_MODULE_VERSION, schema: LayoutModule, title: 'Layout' },
  formatting: { version: FORMATTING_MODULE_VERSION, schema: FormattingModule, title: 'Formatting' },
} as const;

export type ModuleId = keyof typeof MODULES;
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];
export const ModuleId = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);

export type ModuleData<M extends ModuleId> = z.infer<(typeof MODULES)[M]['schema']>;

/** Versioned envelope around one module's data. Unknown data is kept opaque until migrated. */
export const ModuleEnvelope = z.object({
  v: z.number().int().min(1),
  data: z.unknown(),
});
export type ModuleEnvelope = z.infer<typeof ModuleEnvelope>;

/**
 * The config document. The only source of truth for how a grid instance is
 * configured; both the assistant and the forms emit JSON Patches against it.
 */
export const GridConfig = z.object({
  schemaVersion: z.literal(1),
  gridId: z.string().min(1),
  profile: z.string().min(1).default('default'),
  revision: z.number().int().min(0).default(0),
  updatedAt: z.iso.datetime({ offset: true }).optional(),
  modules: z.record(z.string(), ModuleEnvelope).default({}),
});
export type GridConfig = z.infer<typeof GridConfig>;

/** Strongly-typed view of a fully parsed document. */
export interface TypedGridConfig extends Omit<GridConfig, 'modules'> {
  modules: { [M in ModuleId]?: { v: number; data: ModuleData<M> } };
}

export interface ModuleIssue {
  moduleId: string;
  issues: z.core.$ZodIssue[];
}

export type ParseResult =
  | { ok: true; config: TypedGridConfig; unknownModules: string[] }
  | { ok: false; envelopeIssues?: z.core.$ZodIssue[]; moduleIssues: ModuleIssue[] };

/**
 * Parse a raw document: validates the envelope, then each known module's data
 * against its schema. Unknown module ids are preserved (reported, not
 * rejected) so a newer document can round-trip through an older build.
 * Version mismatches are the store's job (migrate before parse).
 */
export function parseGridConfig(raw: unknown): ParseResult {
  const envelope = GridConfig.safeParse(raw);
  if (!envelope.success) return { ok: false, envelopeIssues: envelope.error.issues, moduleIssues: [] };

  const moduleIssues: ModuleIssue[] = [];
  const unknownModules: string[] = [];
  const modules: TypedGridConfig['modules'] = {};

  for (const [id, env] of Object.entries(envelope.data.modules)) {
    if (!(id in MODULES)) {
      unknownModules.push(id);
      continue;
    }
    const def = MODULES[id as ModuleId];
    const parsed = def.schema.safeParse(env.data);
    if (!parsed.success) {
      moduleIssues.push({ moduleId: id, issues: parsed.error.issues });
      continue;
    }
    (modules as Record<string, unknown>)[id] = { v: env.v, data: parsed.data };
  }

  if (moduleIssues.length > 0) return { ok: false, moduleIssues };
  return { ok: true, config: { ...envelope.data, modules }, unknownModules };
}

/** Create an empty document with every known module at its current version and defaults. */
export function createGridConfig(gridId: string, profile = 'default'): TypedGridConfig {
  const modules: TypedGridConfig['modules'] = {};
  for (const id of MODULE_IDS) {
    const def = MODULES[id];
    // Layout requires at least one layout; leave it for the caller to seed.
    if (id === 'layout') continue;
    (modules as Record<string, unknown>)[id] = { v: def.version, data: def.schema.parse({}) };
  }
  return { schemaVersion: 1, gridId, profile, revision: 0, modules };
}
