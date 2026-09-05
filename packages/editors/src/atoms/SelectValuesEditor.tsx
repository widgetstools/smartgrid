/**
 * SelectValuesEditor — `x-editor: 'values'`.
 *
 * Edits a static list of string values (select-editor choices, `In`
 * filter values) as a chip list. The input adds a value on Enter or comma,
 * pasted text is split on commas / newlines / tabs, Backspace on an empty
 * input removes the last chip, and each chip has a remove button. A
 * "From column" picker (inline `ColumnPicker`) appends the distinct
 * `sampleValues` of the chosen column. Values are trimmed and de-duplicated;
 * an empty list emits `undefined`.
 *
 * Options: `dataTypes?: CellDataType[]` (passed to the column picker),
 * `max?: number`, `placeholder?: string`.
 */
import { useId, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Button, Input, cn } from '@smartgrid/ui';
import { X } from 'lucide-react';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { controlSize } from '../lib/inputs.js';
import type { EditorProps } from '../types.js';
import { ColumnPicker } from './ColumnPicker.js';

/** Split free text into candidate values on commas, newlines and tabs. */
export function splitValues(text: string): string[] {
  return text
    .split(/[,\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Render a sample value as a select option string; `null`/`undefined` are dropped by the caller. */
export function sampleToString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export type SelectValuesEditorProps = EditorProps<string[]>;

export function SelectValuesEditor(props: SelectValuesEditorProps) {
  const {
    value,
    onChange,
    mode = 'panel',
    readOnly,
    disabled,
    errors,
    label,
    description,
    className,
    options,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const { columns } = useEditorContext();
  const locked = !!readOnly || !!disabled;
  const values = value ?? [];
  const max = typeof options?.max === 'number' ? options.max : undefined;
  const placeholder = typeof options?.placeholder === 'string' ? options.placeholder : 'Add value…';
  const [draft, setDraft] = useState('');

  const emit = (next: string[]) => onChange(next.length === 0 ? undefined : next);
  const append = (incoming: string[]) => {
    const seen = new Set(values);
    const next = [...values];
    for (const v of incoming) {
      if (seen.has(v)) continue;
      if (max !== undefined && next.length >= max) break;
      seen.add(v);
      next.push(v);
    }
    if (next.length !== values.length) emit(next);
  };
  const commitDraft = () => {
    const parts = splitValues(draft);
    if (parts.length > 0) append(parts);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      e.preventDefault();
      emit(values.slice(0, -1));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parts = splitValues(text);
    if (parts.length > 1) {
      e.preventDefault();
      append([...splitValues(draft), ...parts]);
      setDraft('');
    }
  };

  const fillFromColumn = (colId: string | undefined) => {
    if (!colId) return;
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    append(col.sampleValues.map(sampleToString).filter((s): s is string => s !== undefined));
  };

  const atMax = max !== undefined && values.length >= max;
  const inline = mode === 'inline';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1 rounded-md',
          !inline && 'border border-input bg-background p-1',
        )}
        role="group"
        aria-label={label ?? 'Values'}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md border border-border bg-muted pl-2 pr-0.5 text-xs"
          >
            <span className="truncate">{v}</span>
            {!locked && (
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove ${v}`}
                onClick={() => emit(values.filter((x) => x !== v))}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
        {!locked && (
          <Input
            id={id}
            value={draft}
            placeholder={atMax ? `Max ${max}` : placeholder}
            disabled={atMax}
            aria-label={label ? `Add ${label}` : 'Add value'}
            className={cn(
              controlSize('inline'),
              'min-w-24 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0',
              !inline && 'px-1',
            )}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
          />
        )}
        {!locked && columns.length > 0 && (
          <div className="shrink-0">
            <ColumnPicker
              value={undefined}
              onChange={fillFromColumn}
              mode="inline"
              label="From column"
              options={{ ...(options ?? {}), placeholder: 'From column…' }}
            />
          </div>
        )}
        {locked && values.length === 0 && (
          <span className="px-1 text-sm text-muted-foreground">No values</span>
        )}
        {!locked && values.length > 0 && !inline && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onChange(undefined)}
          >
            Clear all
          </Button>
        )}
      </div>
    </Field>
  );
}
