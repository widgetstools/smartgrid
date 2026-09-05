import { z } from 'zod';
import { withEditor } from '../meta.js';

/**
 * A colour: hex, rgb()/rgba(), hsl(), oklch(), a CSS named colour, or a design
 * token reference `var(--sg-…)`. Validation is syntactic; the editor offers the
 * token palette first.
 */
export const Color = withEditor(
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color)\(.+\)|var\(--[a-zA-Z0-9-]+\)|[a-zA-Z]+)$/, 'Not a colour'),
  { 'x-editor': 'color', title: 'Colour' },
);
export type Color = z.infer<typeof Color>;

/** A colour with an optional dark-theme override. Ported concept from stern-bak's ThemeAwareColor. */
export const ThemeColor = withEditor(
  z.union([Color, z.object({ light: Color, dark: Color })]),
  { 'x-editor': 'themeColor', title: 'Colour' },
);
export type ThemeColor = z.infer<typeof ThemeColor>;

export const BorderStyle = z.enum(['none', 'solid', 'dashed', 'dotted', 'double']);
export const BorderSide = z.object({
  width: z.number().min(0).max(8).default(1),
  style: BorderStyle.default('solid'),
  color: ThemeColor.optional(),
});
export type BorderSide = z.infer<typeof BorderSide>;

/** Per-side border. Missing sides are untouched. */
export const Border = withEditor(
  z.object({
    top: BorderSide.optional(),
    right: BorderSide.optional(),
    bottom: BorderSide.optional(),
    left: BorderSide.optional(),
    radius: z.number().min(0).max(32).optional(),
  }),
  { 'x-editor': 'border', title: 'Border' },
);
export type Border = z.infer<typeof Border>;

export const FontSize = z.union([z.enum(['xs', 'sm', 'md', 'lg', 'xl']), z.number().int().min(8).max(48)]);
export const FontWeight = z.enum(['normal', 'medium', 'semibold', 'bold']);
export const TextDecoration = z.enum(['none', 'underline', 'overline', 'lineThrough']);

export const FontStyle = withEditor(
  z.object({
    size: FontSize.optional(),
    weight: FontWeight.optional(),
    italic: z.boolean().optional(),
    decoration: TextDecoration.optional(),
    family: z.enum(['sans', 'mono']).optional(),
  }),
  { 'x-editor': 'fontStyle', title: 'Font' },
);
export type FontStyle = z.infer<typeof FontStyle>;

export const HorizontalAlignment = z.enum(['left', 'center', 'right', 'justify']);
export const VerticalAlignment = z.enum(['top', 'middle', 'bottom']);

export const Alignment = withEditor(
  z.object({
    horizontal: HorizontalAlignment.optional(),
    vertical: VerticalAlignment.optional(),
  }),
  { 'x-editor': 'alignment', title: 'Alignment' },
);
export type Alignment = z.infer<typeof Alignment>;

/**
 * Full cell/header style. Every property is optional so styles from several
 * rules can merge; the engine layers them by precedence.
 */
export const Style = withEditor(
  z.object({
    foreColor: ThemeColor.optional(),
    backColor: ThemeColor.optional(),
    border: Border.optional(),
    font: FontStyle.optional(),
    alignment: Alignment.optional(),
    className: z
      .string()
      .regex(/^[a-zA-Z_][\w-]*( [a-zA-Z_][\w-]*)*$/, 'CSS class names only')
      .optional()
      .describe('Host CSS class(es) to add; must be allow-listed by the host'),
    padding: z.number().min(0).max(32).optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
  { 'x-editor': 'style', title: 'Style' },
);
export type Style = z.infer<typeof Style>;
