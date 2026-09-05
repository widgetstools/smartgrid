import { z } from 'zod';
import { withEditor } from '../meta.js';
import { Duration, ObjectMeta, Schedule } from '../primitives/common.js';
import { AlertRule } from '../primitives/rule.js';
import { Scope } from '../primitives/scope.js';
import { Style } from '../primitives/style.js';

export const MessageType = z.enum(['info', 'success', 'warning', 'error']);
export type MessageType = z.infer<typeof MessageType>;

/**
 * What happens when an alert fires. Every alert is always raised as an
 * event and counted; these switch on the visible behaviours.
 */
export const AlertBehaviour = z.object({
  notify: z.boolean().default(true).describe('Show a toast'),
  notificationDuration: Duration.default(3000),
  statusMessage: z.boolean().default(false).describe('Show in the status bar / system status'),
  logToConsole: z.boolean().default(false),
  highlightCell: z.union([z.boolean(), Style]).default(false),
  highlightRow: z.union([z.boolean(), Style]).default(false),
  jumpToCell: z.boolean().default(false),
  jumpToRow: z.boolean().default(false),
  preventEdit: z.boolean().default(false).describe('Validation alerts: reject the edit that triggered it'),
});
export type AlertBehaviour = z.infer<typeof AlertBehaviour>;

/**
 * An alert definition. Rule-based alerts evaluate on data changes
 * (predicates, boolean expressions, relative change), across rows
 * (aggregated) or over time (observable); scheduled alerts fire on a
 * schedule. Message templates accept `[newValue]`, `[oldValue]`,
 * `[column]`, `[primaryKeyValue]`, `[rowData.x]`, `[timestamp]`, `[trigger]`.
 */
export const Alert = withEditor(
  ObjectMeta.extend({
    messageType: MessageType.default('info'),
    header: z.string().max(200).optional().describe('Template; defaults to the alert name'),
    text: z.string().max(2000).optional().describe('Template; auto-generated when omitted'),
    scope: Scope.prefault({ kind: 'all' }),
    rule: AlertRule.optional(),
    schedule: Schedule.optional(),
    behaviour: AlertBehaviour.prefault({}),
  }).refine((a) => a.rule !== undefined || a.schedule !== undefined, {
    message: 'An alert needs a condition or a schedule',
  }),
  { 'x-editor': 'alert', title: 'Alert' },
);
export type Alert = z.infer<typeof Alert>;

export const AlertsOptions = z.object({
  highlightDuration: Duration.default(2000),
  maxToasts: z.number().int().min(1).max(20).default(5),
});
export type AlertsOptions = z.infer<typeof AlertsOptions>;

export const AlertsModule = z.object({
  alerts: z.array(Alert).default([]),
  options: AlertsOptions.prefault({}),
});
export type AlertsModule = z.infer<typeof AlertsModule>;

export const ALERTS_MODULE_VERSION = 1;
