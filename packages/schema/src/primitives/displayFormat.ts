import { z } from 'zod';
import { withEditor } from '../meta.js';

/** Numeric presets matching AdapTable's names. */
export const NUMBER_PRESETS = [
  'Dollar',
  'Sterling',
  'Euro',
  'Yen',
  'Bitcoin',
  'K',
  'M',
  'B',
  'Integer',
  'Decimal',
  'Percentage',
  'Scientific',
  'Accounting',
  'FXRate',
  'BasisPoints',
] as const;
export const NumberPreset = z.enum(NUMBER_PRESETS);
export type NumberPreset = z.infer<typeof NumberPreset>;

export const NumberFormat = z.object({
  kind: z.literal('number'),
  preset: NumberPreset.optional().describe('Start from a preset; explicit options override it'),
  fractionDigits: z.number().int().min(0).max(20).optional(),
  integerDigits: z.number().int().min(0).max(20).optional(),
  multiplier: z.number().optional(),
  integerSeparator: z.string().max(1).optional(),
  fractionSeparator: z.string().max(1).optional(),
  prefix: z.string().max(16).optional(),
  suffix: z.string().max(16).optional(),
  zeroDisplay: z.string().max(16).optional(),
  notation: z.enum(['standard', 'scientific', 'compact']).optional(),
  parentheses: z.boolean().optional().describe('Negative numbers in parentheses'),
  abs: z.boolean().optional(),
  rounding: z.enum(['round', 'ceiling', 'floor', 'truncate']).optional(),
  empty: z.boolean().optional().describe('Render nothing for null/undefined'),
  content: z.string().max(200).optional().describe('Replace the value; supports [value], [column], [rowData.x]'),
});
export type NumberFormat = z.infer<typeof NumberFormat>;

export const StringFormat = z.object({
  kind: z.literal('string'),
  case: z.enum(['upper', 'lower', 'sentence', 'title']).optional(),
  trim: z.boolean().optional(),
  prefix: z.string().max(32).optional(),
  suffix: z.string().max(32).optional(),
  empty: z.boolean().optional(),
  content: z.string().max(200).optional(),
});
export type StringFormat = z.infer<typeof StringFormat>;

export const DATE_PATTERN_PRESETS = [
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  'yyyy-MM-dd',
  'dd MMM yyyy',
  'MMM do yyyy',
  'MMMM do yyyy, h:mm:ss a',
  'EEEE',
  'yyyyMMdd',
  'HH:mm:ss',
] as const;

export const DateFormat = z.object({
  kind: z.literal('date'),
  pattern: z.string().min(1).max(64).describe('Unicode TR35 pattern, e.g. dd-MMM-yyyy HH:mm'),
  timeZone: z.string().optional(),
});
export type DateFormat = z.infer<typeof DateFormat>;

export const TemplateFormat = z.object({
  kind: z.literal('template'),
  template: z.string().min(1).max(400).describe('Text with [value], [column], [rowData.x] placeholders'),
});
export type TemplateFormat = z.infer<typeof TemplateFormat>;

/** Excel-style format string (SSF), ported concept from stern-bak. */
export const ExcelFormat = z.object({
  kind: z.literal('excel'),
  format: z.string().min(1).max(200).describe('Excel number format string, e.g. #,##0.00;[Red](#,##0.00)'),
});
export type ExcelFormat = z.infer<typeof ExcelFormat>;

/** Fixed-income tick fractions (32nds, 64ths …), ported from stern-bak. */
export const TickFormat = z.object({
  kind: z.literal('tick'),
  denominator: z.enum(['32', '64', '128', '256']),
  showPlus: z.boolean().default(false),
});
export type TickFormat = z.infer<typeof TickFormat>;

/** Host-registered formatter referenced by id. */
export const CustomFormat = z.object({
  kind: z.literal('custom'),
  formatterId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});
export type CustomFormat = z.infer<typeof CustomFormat>;

export const DisplayFormat = withEditor(
  z.discriminatedUnion('kind', [NumberFormat, StringFormat, DateFormat, TemplateFormat, ExcelFormat, TickFormat, CustomFormat]),
  { 'x-editor': 'displayFormat', title: 'Display format' },
);
export type DisplayFormat = z.infer<typeof DisplayFormat>;
