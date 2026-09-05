import { z } from 'zod';
import { withEditor } from '../meta.js';

/** Stable identifier for any user-created object. UUID or short id. */
export const ObjectId = z.string().min(1).max(64);
export type ObjectId = z.infer<typeof ObjectId>;

/**
 * Metadata shared by every persisted object (format column, alert, layout …).
 * Mirrors AdapTable's AdaptableObject: id, name, enabled/suspended, read-only,
 * tags for scoping to layouts, and a free-form metadata bag.
 */
export const ObjectMeta = z.object({
  id: ObjectId.describe('Stable identifier; never edited by users'),
  name: withEditor(z.string().min(1).max(120), { 'x-editor': 'text', title: 'Name' }),
  enabled: withEditor(z.boolean().default(true), {
    'x-editor': 'boolean',
    title: 'Enabled',
    description: 'Disabled objects are kept but not applied',
  }),
  readOnly: z.boolean().default(false).describe('Locked by the deployer; users cannot edit or delete'),
  tags: z
    .array(z.string())
    .default([])
    .describe('Layout names this object is scoped to; empty = all layouts'),
  source: z.enum(['seed', 'user', 'assistant']).default('user').describe('Who created the object'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ObjectMeta = z.infer<typeof ObjectMeta>;

/** Duration in milliseconds, or 'always' for permanent effects (flash, notification). */
export const Duration = withEditor(z.union([z.number().int().min(0), z.literal('always')]), {
  'x-editor': 'duration',
  title: 'Duration',
});
export type Duration = z.infer<typeof Duration>;

/**
 * Icon reference. System icons come from the design-system icon set, custom
 * icons from a URL or data URI, emoji as literal text.
 */
export const Icon = withEditor(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('system'),
      name: z.string().min(1),
      size: z.number().int().min(8).max(64).optional(),
    }),
    z.object({
      kind: z.literal('image'),
      src: z.string().min(1),
      size: z.number().int().min(8).max(64).optional(),
    }),
    z.object({ kind: z.literal('emoji'), value: z.string().min(1).max(8) }),
  ]),
  { 'x-editor': 'icon', title: 'Icon' },
);
export type Icon = z.infer<typeof Icon>;

/** Keyboard binding such as "shift+K" or "+". */
export const KeyBinding = withEditor(
  z.object({
    key: z.string().min(1).max(16),
    ctrl: z.boolean().default(false),
    shift: z.boolean().default(false),
    alt: z.boolean().default(false),
    meta: z.boolean().default(false),
  }),
  { 'x-editor': 'keys', title: 'Key' },
);
export type KeyBinding = z.infer<typeof KeyBinding>;

/** One-off or recurring schedule shared by scheduled alerts and scheduled reports. */
export const Schedule = withEditor(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('once'), runAt: z.iso.datetime({ offset: true }) }),
    z.object({
      kind: z.literal('cron'),
      cron: z
        .string()
        .regex(/^(\S+\s+){4}\S+$/, 'Expected a 5-field cron expression')
        .describe('5-field cron: minute hour day-of-month month day-of-week'),
      timezone: z.string().optional(),
    }),
  ]),
  { 'x-editor': 'schedule', title: 'Schedule' },
);
export type Schedule = z.infer<typeof Schedule>;
