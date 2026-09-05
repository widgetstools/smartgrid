import type { Border, BorderSide, FontStyle, Style, ThemeColor } from '@smartgrid/schema';

export type Theme = 'light' | 'dark';

const FONT_SIZES: Record<string, string> = { xs: '10px', sm: '11px', md: '13px', lg: '15px', xl: '18px' };
const FONT_WEIGHTS: Record<string, string> = { normal: '400', medium: '500', semibold: '600', bold: '700' };
const DECORATIONS: Record<string, string> = { none: 'none', underline: 'underline', overline: 'overline', lineThrough: 'line-through' };

export function resolveColor(c: ThemeColor | undefined, theme: Theme): string | undefined {
  if (!c) return undefined;
  return typeof c === 'string' ? c : c[theme];
}

function borderSide(s: BorderSide | undefined, theme: Theme): string | undefined {
  if (!s) return undefined;
  if (s.style === 'none' || s.width === 0) return 'none';
  return `${s.width}px ${s.style} ${resolveColor(s.color, theme) ?? 'currentColor'}`;
}

function borderDecls(b: Border, theme: Theme): string[] {
  const out: string[] = [];
  const t = borderSide(b.top, theme);
  const r = borderSide(b.right, theme);
  const bo = borderSide(b.bottom, theme);
  const l = borderSide(b.left, theme);
  if (t) out.push(`border-top:${t}`);
  if (r) out.push(`border-right:${r}`);
  if (bo) out.push(`border-bottom:${bo}`);
  if (l) out.push(`border-left:${l}`);
  if (b.radius !== undefined) out.push(`border-radius:${b.radius}px`);
  return out;
}

function fontDecls(f: FontStyle): string[] {
  const out: string[] = [];
  if (f.size !== undefined) out.push(`font-size:${typeof f.size === 'number' ? `${f.size}px` : FONT_SIZES[f.size]}`);
  if (f.weight) out.push(`font-weight:${FONT_WEIGHTS[f.weight]}`);
  if (f.italic !== undefined) out.push(`font-style:${f.italic ? 'italic' : 'normal'}`);
  if (f.decoration) out.push(`text-decoration:${DECORATIONS[f.decoration]}`);
  if (f.family) out.push(`font-family:var(--sg-font-${f.family})`);
  return out;
}

/** CSS declarations (no selector) for a Style in a given theme. */
export function styleToDeclarations(style: Style, theme: Theme): string[] {
  const out: string[] = [];
  const fore = resolveColor(style.foreColor, theme);
  const back = resolveColor(style.backColor, theme);
  if (fore) out.push(`color:${fore}`);
  if (back) out.push(`background-color:${back}`);
  if (style.border) out.push(...borderDecls(style.border, theme));
  if (style.font) out.push(...fontDecls(style.font));
  if (style.alignment?.horizontal) out.push(`text-align:${style.alignment.horizontal}`);
  if (style.alignment?.vertical) {
    const map = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
    out.push(`align-items:${map[style.alignment.vertical]}`);
  }
  if (style.padding !== undefined) out.push(`padding:0 ${style.padding}px`);
  if (style.opacity !== undefined) out.push(`opacity:${style.opacity}`);
  return out;
}

/** Whether a style differs between themes (so two rule blocks are needed). */
function isThemed(c: ThemeColor | undefined): boolean {
  return !!c && typeof c !== 'string';
}

export interface StyleRule {
  className: string;
  style: Style;
}

/**
 * Build a stylesheet for a set of class-name → Style rules. Theme-aware
 * colours emit a light block on `:root` and a dark block under
 * `[data-theme="dark"]`. Rules are emitted in array order so later rules win
 * on conflicting properties; callers order by precedence (lowest first).
 */
export function buildStylesheet(rules: StyleRule[], scope = '.ag-root-wrapper'): string {
  const parts: string[] = [];
  for (const { className, style } of rules) {
    const themed =
      isThemed(style.foreColor) ||
      isThemed(style.backColor) ||
      [style.border?.top, style.border?.right, style.border?.bottom, style.border?.left].some((s) => isThemed(s?.color));
    const light = styleToDeclarations(style, 'light');
    if (light.length) parts.push(`${scope} .${className}{${light.join(';')}}`);
    if (themed) {
      const dark = styleToDeclarations(style, 'dark');
      parts.push(`[data-theme="dark"] ${scope} .${className}{${dark.join(';')}}`);
    }
  }
  return parts.join('\n');
}
