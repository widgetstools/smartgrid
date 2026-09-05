/**
 * PreviewCell — renders one grid-like cell with a Style and/or DisplayFormat
 * applied to a sample value, using the same engine helpers the grid uses, so
 * what the editor shows is what the grid will paint.
 */
import { useMemo } from 'react';
import type { DisplayFormat, Style } from '@smartgrid/schema';
import { buildValueFormatter, styleToDeclarations } from '@smartgrid/engine';
import { cn } from '@smartgrid/ui';

export interface PreviewCellProps {
  value: unknown;
  style?: Style;
  displayFormat?: DisplayFormat;
  theme: 'light' | 'dark';
  columnHeader?: string;
  rowData?: Record<string, unknown>;
  className?: string;
}

function declarationsToStyle(decls: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of decls) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const prop = d
      .slice(0, i)
      .trim()
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[prop] = d.slice(i + 1).trim();
  }
  return out;
}

export function PreviewCell({
  value,
  style,
  displayFormat,
  theme,
  columnHeader = 'Column',
  rowData,
  className,
}: PreviewCellProps) {
  const text = useMemo(() => {
    if (displayFormat) return buildValueFormatter(displayFormat)(value, { columnHeader, rowData });
    return value === null || value === undefined ? '' : String(value);
  }, [displayFormat, value, columnHeader, rowData]);
  const css = useMemo(
    () => (style ? declarationsToStyle(styleToDeclarations(style, theme)) : {}),
    [style, theme],
  );
  return (
    <div
      data-testid="preview-cell"
      className={cn(
        'flex h-7 items-center overflow-hidden rounded-sm border border-border bg-background px-2 text-sm',
        className,
      )}
      style={css}
    >
      <span className="truncate">{text}</span>
    </div>
  );
}
