/**
 * ExpressionEditor — `x-editor: expression`. M0.5 version: a monospace
 * textarea with a column-reference palette (inserts `[colId]`), a function
 * palette from context, and positioned error display. The CodeMirror
 * editor with completions and diagnostics replaces the textarea in M1
 * behind the same props.
 */
import { useId, useRef, useState } from 'react';
import { Braces, Columns3 } from 'lucide-react';
import type { ExpressionKind } from '@smartgrid/schema';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@smartgrid/ui';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import type { EditorProps } from '../types.js';

export interface ExpressionEditorOptions {
  kind?: ExpressionKind;
  rows?: number;
}

const KIND_HINT: Record<ExpressionKind, string> = {
  scalar: 'e.g. [price] * [qty]',
  boolean: "e.g. [pnl] < 0 AND [desk] = 'Rates'",
  aggregatedScalar: 'e.g. SUM([pnl], GROUP_BY([desk]))',
  aggregatedBoolean: "e.g. SUM([pnl]) > '50M' WHERE [ccy] = 'USD'",
  observable: "e.g. ROW_CHANGE(COUNT([px], 5), TIMEFRAME('10m'))",
};

export function ExpressionEditor({
  value,
  onChange,
  mode = 'panel',
  readOnly,
  disabled,
  errors,
  label,
  description,
  id,
  className,
  options,
  autoFocus,
}: EditorProps<string>) {
  const ctx = useEditorContext();
  const ro = readOnly || disabled;
  const autoId = useId();
  const inputId = id ?? autoId;
  const opts = (options ?? {}) as ExpressionEditorOptions;
  const kind = opts.kind ?? 'boolean';
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value ?? '');
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? '');
  }
  const functions = ctx.functions.filter(
    (f) => f.kinds.includes(kind) || f.kinds.includes('scalar') || f.kinds.includes('boolean'),
  );
  const invalidRange = errors?.find((e) => e.start !== undefined);

  const insert = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    onChange(next === '' ? undefined : next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const rows = opts.rows ?? (mode === 'panel' ? 3 : 1);

  return (
    <Field
      id={inputId}
      label={label}
      description={description ?? (mode === 'panel' ? KIND_HINT[kind] : undefined)}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className={cn('flex gap-1', mode === 'inline' ? 'items-center' : 'items-start')}>
        <textarea
          id={inputId}
          ref={ref}
          rows={rows}
          value={draft}
          readOnly={ro}
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={mode === 'inline' ? KIND_HINT[kind] : undefined}
          aria-label={label ?? 'Expression'}
          aria-invalid={errors && errors.length > 0 ? true : undefined}
          className={cn(
            'min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-2 py-1 font-mono text-sm leading-5 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
            mode === 'inline' && 'resize-none',
            errors && errors.length > 0 && 'border-destructive',
          )}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value === '' ? undefined : e.target.value);
          }}
          onKeyDown={(e) => {
            if (mode === 'inline' && e.key === 'Enter' && !e.shiftKey) e.preventDefault();
          }}
        />
        {!ro && (
          <div className={cn('flex shrink-0 gap-0.5', mode !== 'inline' && 'flex-col')}>
            <Palette
              icon={<Columns3 className="size-3.5" />}
              label="Insert column"
              items={ctx.columns.map((c) => ({
                key: c.id,
                label: c.header,
                detail: `${c.id} · ${c.dataType}`,
                insert: `[${c.id}]`,
              }))}
              onPick={insert}
            />
            <Palette
              icon={<Braces className="size-3.5" />}
              label="Insert function"
              items={functions.map((f) => ({
                key: f.name,
                label: f.signature,
                detail: f.description ?? f.category,
                insert: `${f.name}(`,
              }))}
              onPick={insert}
            />
          </div>
        )}
      </div>
      {invalidRange && mode === 'panel' && (
        <p className="mt-1 font-mono text-2xs text-destructive">
          {' '.repeat(Math.max(0, invalidRange.start ?? 0))}^ col {(invalidRange.start ?? 0) + 1}
        </p>
      )}
    </Field>
  );
}

function Palette({
  icon,
  label,
  items,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  items: { key: string; label: string; detail?: string; insert: string }[];
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={label} title={label}>
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder={`${label}…`} />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.key}
                  value={`${it.label} ${it.detail ?? ''}`}
                  onSelect={() => {
                    onPick(it.insert);
                    setOpen(false);
                  }}
                >
                  <span className="truncate font-mono text-xs">{it.label}</span>
                  {it.detail && (
                    <span className="ml-auto truncate pl-2 text-2xs text-muted-foreground">{it.detail}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
