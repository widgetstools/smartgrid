import type { ReactNode } from 'react';
import { Label, cn } from '@smartgrid/ui';
import type { EditorMode, PositionedError } from '../types.js';

export interface FieldProps {
  id?: string;
  label?: string;
  description?: string;
  mode?: EditorMode;
  errors?: readonly PositionedError[];
  /** Only errors whose path equals this (or '' ) are shown here. */
  path?: string;
  className?: string;
  children: ReactNode;
  /** Render label beside the control instead of above (panel mode only). */
  row?: boolean;
}

export function errorsAt(errors: readonly PositionedError[] | undefined, path = ''): PositionedError[] {
  if (!errors) return [];
  return errors.filter((e) => e.path === path || (path === '' && e.path === '/'));
}

/**
 * Uniform label / control / help / error chrome. In `inline` mode the label
 * collapses to a tooltip-friendly `aria-label` and errors show as a ring so
 * the editor fits a diff-card row.
 */
export function Field({
  id,
  label,
  description,
  mode = 'panel',
  errors,
  path = '',
  className,
  children,
  row,
}: FieldProps) {
  const errs = errorsAt(errors, path);
  const invalid = errs.length > 0;
  if (mode === 'inline') {
    return (
      <div
        className={cn(
          'sg-field sg-field-inline flex min-w-0 items-center gap-1',
          invalid && 'ring-1 ring-destructive rounded-md',
          className,
        )}
        data-invalid={invalid || undefined}
        aria-label={label}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'sg-field flex min-w-0 gap-1',
        row ? 'flex-row items-center justify-between' : 'flex-col',
        className,
      )}
      data-invalid={invalid || undefined}
    >
      {label && (
        <Label htmlFor={id} className={cn('text-xs text-muted-foreground', row && 'shrink-0 pr-3')}>
          {label}
        </Label>
      )}
      <div className={cn('min-w-0', row && 'flex-1')}>{children}</div>
      {description && mode === 'panel' && !invalid && (
        <p className="text-2xs text-muted-foreground">{description}</p>
      )}
      {invalid && (
        <p className="text-2xs text-destructive" role="alert">
          {errs.map((e) => e.message).join(' · ')}
        </p>
      )}
    </div>
  );
}
