/**
 * ValidationSummary — lists validation errors and engine warnings for a
 * document, patch or object. Errors are clickable when the host can focus
 * the offending field.
 */
import { AlertTriangle, CircleX } from 'lucide-react';
import { cn } from '@smartgrid/ui';
import type { PositionedError } from '../types.js';

export interface ValidationSummaryProps {
  errors?: readonly PositionedError[];
  warnings?: readonly string[];
  onSelect?: (error: PositionedError) => void;
  /** Path prefix stripped from displayed pointers. */
  basePath?: string;
  className?: string;
  /** Collapse to a single line count (inline hosts). */
  compact?: boolean;
}

export function humanizePointer(path: string, basePath = ''): string {
  let p = path.startsWith(basePath) ? path.slice(basePath.length) : path;
  p = p.replace(/^\//, '').replace(/\//g, ' › ');
  return p || 'value';
}

export function ValidationSummary({
  errors = [],
  warnings = [],
  onSelect,
  basePath,
  className,
  compact,
}: ValidationSummaryProps) {
  if (errors.length === 0 && warnings.length === 0) return null;
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-2xs', className)} role="status">
        {errors.length > 0 && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <CircleX className="size-3" /> {errors.length} error{errors.length === 1 ? '' : 's'}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="size-3" /> {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn('flex flex-col gap-1 text-xs', className)}
      role="alert"
      data-testid="validation-summary"
    >
      {errors.map((e, i) => (
        <button
          key={`${e.path}-${i}`}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(e)}
          className={cn(
            'flex items-start gap-1.5 rounded-sm px-1 py-0.5 text-left text-destructive',
            onSelect && 'hover:bg-destructive/10',
          )}
        >
          <CircleX className="mt-0.5 size-3 shrink-0" />
          <span>
            <span className="font-medium">{humanizePointer(e.path, basePath)}</span>
            {': '}
            {e.message}
            {e.start !== undefined && (
              <span className="ml-1 font-mono text-2xs text-muted-foreground">@{e.start}</span>
            )}
          </span>
        </button>
      ))}
      {warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 px-1 py-0.5 text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>{w}</span>
        </p>
      ))}
    </div>
  );
}
