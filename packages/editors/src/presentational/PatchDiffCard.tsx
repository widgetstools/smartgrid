/**
 * PatchDiffCard — renders a JSON Patch against the config document as a
 * reviewable card: one row per operation with the path, the previous value
 * and the proposed value. When the host resolves an `x-editor` hint for a
 * path, the proposed value is rendered with the registered editor in
 * `inline` mode so the user can tweak the proposal before applying it.
 * This is the assistant's primary surface; the same card doubles as an
 * undo-history entry in the customizer.
 */
import { useMemo } from 'react';
import { Check, Minus, Pencil, Plus, Replace, Undo2, X } from 'lucide-react';
import type { Operation } from 'fast-json-patch';
import type { EditorHint } from '@smartgrid/schema';
import { Badge, Button, cn } from '@smartgrid/ui';
import type { EditorRegistry } from '../registry.js';
import type { EditorComponent, EditorMode, PositionedError } from '../types.js';
import { ValidationSummary } from './ValidationSummary.js';

export type PatchStatus = 'proposed' | 'applied' | 'rejected' | 'invalid';

export interface ResolvedEditor {
  hint: EditorHint;
  options?: Record<string, unknown>;
  jsonSchema?: Record<string, unknown>;
  label?: string;
  /** Explicit component (e.g. a generated form) instead of the registry lookup. */
  component?: EditorComponent<unknown>;
  /** Mode for the row editor; defaults to inline. */
  mode?: EditorMode;
}

export interface PatchDiffCardProps {
  patch: readonly Operation[];
  /** The document the patch targets, to show "before" values. */
  before?: unknown;
  status?: PatchStatus;
  title?: string;
  rationale?: string;
  errors?: readonly PositionedError[];
  warnings?: readonly string[];
  /** Resolve the editor for a pointer. Return undefined for a read-only row. */
  resolveEditor?: (path: string, value: unknown) => ResolvedEditor | undefined;
  registry?: EditorRegistry;
  /** Called with the edited patch when the user changes a proposed value. */
  onEdit?: (patch: Operation[]) => void;
  onApply?: () => void;
  onReject?: () => void;
  onUndo?: () => void;
  /** Turn a pointer into a friendlier label (e.g. `/modules/formatting/data/formatColumns/0/style` → "Formatting › PnL colour › style"). */
  describePath?: (path: string) => string;
  className?: string;
  compact?: boolean;
}

/** Read a JSON pointer from a document. */
export function getAtPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '') return doc;
  let cur: unknown = doc;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function defaultDescribePath(path: string): string {
  return path
    .replace(/^\/modules\//, '')
    .replace(/\/data\//, ' › ')
    .replace(/^\//, '')
    .replace(/\//g, ' › ');
}

const OP_META: Record<Operation['op'], { label: string; icon: React.ReactNode; tone: string }> = {
  add: { label: 'add', icon: <Plus className="size-3" />, tone: 'text-positive' },
  replace: { label: 'set', icon: <Replace className="size-3" />, tone: 'text-info' },
  remove: { label: 'remove', icon: <Minus className="size-3" />, tone: 'text-destructive' },
  move: { label: 'move', icon: <Replace className="size-3" />, tone: 'text-muted-foreground' },
  copy: { label: 'copy', icon: <Plus className="size-3" />, tone: 'text-muted-foreground' },
  test: { label: 'test', icon: <Check className="size-3" />, tone: 'text-muted-foreground' },
  _get: { label: 'get', icon: <Check className="size-3" />, tone: 'text-muted-foreground' },
};

function ValueText({ value }: { value: unknown }) {
  if (value === undefined) return <span className="italic text-muted-foreground">—</span>;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <code className="max-w-full truncate rounded-sm bg-muted px-1 py-0.5 font-mono text-2xs" title={text}>
      {text.length > 80 ? `${text.slice(0, 77)}…` : text}
    </code>
  );
}

const STATUS_LABEL: Record<PatchStatus, string> = {
  proposed: 'Proposed',
  applied: 'Applied',
  rejected: 'Rejected',
  invalid: 'Invalid',
};

export function PatchDiffCard({
  patch,
  before,
  status = 'proposed',
  title,
  rationale,
  errors,
  warnings,
  resolveEditor,
  registry,
  onEdit,
  onApply,
  onReject,
  onUndo,
  describePath = defaultDescribePath,
  className,
  compact,
}: PatchDiffCardProps) {
  const editable = status === 'proposed' && !!onEdit;
  const rows = useMemo(
    () =>
      patch.map((op, i) => {
        const prev = before === undefined ? undefined : getAtPointer(before, op.path);
        const next = 'value' in op ? op.value : undefined;
        const resolved =
          editable && resolveEditor && (op.op === 'add' || op.op === 'replace')
            ? resolveEditor(op.path, next)
            : undefined;
        const rowErrors =
          errors
            ?.filter((e) => e.path === op.path || e.path.startsWith(`${op.path}/`))
            .map((e) => ({ ...e, path: e.path.slice(op.path.length) })) ?? [];
        return { op, i, prev, next, resolved, rowErrors };
      }),
    [patch, before, editable, resolveEditor, errors],
  );

  const setValue = (i: number, value: unknown) => {
    if (!onEdit) return;
    const next = patch.map((op, k) =>
      k === i && (op.op === 'add' || op.op === 'replace') ? { ...op, value } : op,
    ) as Operation[];
    onEdit(next);
  };

  return (
    <section
      data-testid="patch-diff-card"
      data-status={status}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-card p-2 text-sm text-card-foreground',
        status === 'invalid' && 'border-destructive/60',
        status === 'rejected' && 'opacity-60',
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          {title ?? `${patch.length} change${patch.length === 1 ? '' : 's'}`}
        </span>
        <Badge
          variant={status === 'invalid' ? 'destructive' : status === 'applied' ? 'default' : 'secondary'}
          className="h-4 px-1.5 text-2xs"
        >
          {STATUS_LABEL[status]}
        </Badge>
      </header>
      {rationale && !compact && <p className="text-xs text-muted-foreground">{rationale}</p>}

      <ul className="flex flex-col gap-1">
        {rows.map(({ op, i, prev, next, resolved, rowErrors }) => {
          const meta = OP_META[op.op];
          const Editor = resolved && (resolved.component ?? registry?.component(resolved.hint));
          return (
            <li
              key={i}
              className={cn(
                'grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 rounded-md px-1 py-0.5',
                rowErrors.length > 0 && 'bg-destructive/5',
              )}
              data-path={op.path}
            >
              <span
                className={cn(
                  'mt-0.5 inline-flex items-center gap-1 text-2xs font-medium uppercase',
                  meta.tone,
                )}
                title={op.op}
              >
                {meta.icon}
                {meta.label}
              </span>
              <span className="min-w-0 truncate text-xs" title={op.path}>
                {describePath(op.path)}
              </span>
              <span />
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {op.op !== 'add' && op.op !== 'move' && op.op !== 'copy' && (
                  <>
                    <ValueText value={prev} />
                    {op.op !== 'remove' && <span className="text-muted-foreground">→</span>}
                  </>
                )}
                {(op.op === 'move' || op.op === 'copy') && (
                  <code className="font-mono text-2xs text-muted-foreground">from {op.from}</code>
                )}
                {op.op !== 'remove' &&
                  op.op !== 'move' &&
                  op.op !== 'copy' &&
                  (Editor && resolved ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Editor
                        value={next}
                        onChange={(v) => setValue(i, v)}
                        mode={resolved.mode ?? 'inline'}
                        options={resolved.options}
                        jsonSchema={resolved.jsonSchema}
                        errors={rowErrors}
                        label={resolved.label ?? describePath(op.path)}
                      />
                      <Pencil className="size-3 text-muted-foreground" aria-hidden />
                    </span>
                  ) : (
                    <ValueText value={next} />
                  ))}
                {rowErrors.length > 0 && !Editor && <ValidationSummary errors={rowErrors} compact />}
              </div>
            </li>
          );
        })}
      </ul>

      {(errors?.some((e) => !patch.some((op) => e.path === op.path || e.path.startsWith(`${op.path}/`))) ||
        (warnings && warnings.length > 0)) && (
        <ValidationSummary
          errors={errors?.filter(
            (e) => !patch.some((op) => e.path === op.path || e.path.startsWith(`${op.path}/`)),
          )}
          warnings={warnings}
        />
      )}

      {(onApply || onReject || onUndo) && (
        <footer className="flex items-center justify-end gap-1">
          {(status === 'proposed' || status === 'invalid') && onReject && (
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={onReject}>
              <X className="size-3.5" /> Reject
            </Button>
          )}
          {(status === 'proposed' || status === 'invalid') && onApply && (
            <Button
              type="button"
              size="sm"
              className="gap-1 text-xs"
              onClick={onApply}
              disabled={status === 'invalid' || (errors && errors.length > 0)}
            >
              <Check className="size-3.5" /> Apply
            </Button>
          )}
          {status === 'applied' && onUndo && (
            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={onUndo}>
              <Undo2 className="size-3.5" /> Undo
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}
