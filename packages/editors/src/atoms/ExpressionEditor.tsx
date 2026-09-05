/**
 * ExpressionEditor — `x-editor: expression`. A CodeMirror 6 editor for
 * AdaptableQL with syntax highlighting, column/function/keyword completions
 * and live diagnostics, plus a column-reference palette (inserts `[colId]`),
 * a function palette from context, and positioned error display. The
 * contract is unchanged from the textarea version: `EditorProps<string>`,
 * `options.kind` / `options.rows`, and errors rendered through `Field`.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Braces, Columns3 } from 'lucide-react';
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState, Annotation, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import type { ColumnInfo, ExpressionKind } from '@smartgrid/schema';
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
import {
  adaptableQL,
  adaptableQLLanguage,
  expressionCompletionSource,
  expressionLinter,
  expressionTheme,
  lintConfig,
  singleLine,
} from '../lib/codemirror/index.js';
import type { EditorProps, FunctionInfo, PositionedError } from '../types.js';

export {
  classify,
  diagnosticsFor,
  expressionCompletionSource,
  functionsForKind,
  keywordsForKind,
  mergedDiagnostics,
} from '../lib/codemirror/index.js';

export interface ExpressionEditorOptions {
  kind?: ExpressionKind;
  rows?: number;
}

export const KIND_HINT: Record<ExpressionKind, string> = {
  scalar: 'e.g. [price] * [qty]',
  boolean: "e.g. [pnl] < 0 AND [desk] = 'Rates'",
  aggregatedScalar: 'e.g. SUM([pnl], GROUP_BY([desk]))',
  aggregatedBoolean: "e.g. SUM([pnl]) > '50M' WHERE [ccy] = 'USD'",
  observable: "e.g. ROW_CHANGE(COUNT([px], 5), TIMEFRAME('10m'))",
};

/** Marks transactions that mirror the `value` prop so they are not echoed back through `onChange`. */
const External = Annotation.define<boolean>();

interface EditorConfig {
  kind: ExpressionKind;
  columns: readonly ColumnInfo[];
  functions: readonly FunctionInfo[];
  readOnly: boolean;
  ariaLabel: string;
  id: string;
  errors: readonly PositionedError[] | undefined;
}

/** Everything that changes without re-creating the view lives in one compartment. */
function configExtensions(c: EditorConfig): Extension {
  const invalid = !!c.errors && c.errors.length > 0;
  const attrs: Record<string, string> = { id: c.id, 'aria-label': c.ariaLabel, spellcheck: 'false' };
  if (invalid) attrs['aria-invalid'] = 'true';
  return [
    EditorView.contentAttributes.of(attrs),
    EditorState.readOnly.of(c.readOnly),
    EditorView.editable.of(!c.readOnly),
    placeholder(KIND_HINT[c.kind]),
    lintConfig.of({
      kind: c.kind,
      columns: c.columns,
      external: c.errors?.filter((e) => e.start !== undefined),
    }),
    adaptableQLLanguage.data.of({
      autocomplete: expressionCompletionSource({ kind: c.kind, columns: c.columns, functions: c.functions }),
    }),
  ];
}

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
  const ro = !!(readOnly || disabled);
  const autoId = useId();
  const inputId = id ?? autoId;
  const opts = (options ?? {}) as ExpressionEditorOptions;
  const kind = opts.kind ?? 'boolean';
  const inline = mode === 'inline';
  const rows = opts.rows ?? (mode === 'panel' ? 3 : 1);
  const ariaLabel = label ?? 'Expression';
  const invalid = !!errors && errors.length > 0;
  const invalidRange = errors?.find((e) => e.start !== undefined);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const emitted = useRef<string[]>([]);
  const [compartment] = useState(() => new Compartment());
  const config: EditorConfig = {
    kind,
    columns: ctx.columns,
    functions: ctx.functions,
    readOnly: ro,
    ariaLabel,
    id: inputId,
    errors,
  };
  // Latest props for the mount effect, which must not re-run on every change.
  const latest = useRef({ value, onChange, config, autoFocus });
  useEffect(() => {
    latest.current = { value, onChange, config, autoFocus };
  });

  // Create the view once per single-line/multi-line variant.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = latest.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.value ?? '',
        extensions: [
          history(),
          adaptableQL(),
          autocompletion({ activateOnTyping: true }),
          expressionLinter(),
          inline ? singleLine : EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          expressionTheme({ rows, singleLine: inline }),
          compartment.of(configExtensions(initial.config)),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.every((tr) => tr.annotation(External))) return;
            const text = update.state.doc.toString();
            emitted.current.push(text);
            if (emitted.current.length > 32) emitted.current.shift();
            latest.current.onChange(text === '' ? undefined : text);
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (initial.autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [inline, rows, compartment]);

  // Mirror the `value` prop into the document when it differs.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const next = value ?? '';
    if (next === current) return;
    // A host echoing an older emission (debounced store round-trips) must not
    // clobber what the user typed since; only genuinely new values are mirrored.
    if (view.hasFocus && emitted.current.includes(next)) return;
    emitted.current.length = 0;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      annotations: External.of(true),
    });
  }, [value, inline, rows]);

  // Reconfigure kind / columns / functions / read-only / errors in place — but only
  // when something meaningful changed: hosts re-render with fresh `errors` arrays on
  // every keystroke, and reconfiguring the language data would close completions.
  const external = errors?.filter((e) => e.start !== undefined) ?? [];
  const configKey = JSON.stringify([kind, ro, ariaLabel, inputId, external, inline, rows]);
  const lastKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (lastKey.current === configKey && view.state.facet(lintConfig).columns === ctx.columns) return;
    lastKey.current = configKey;
    view.dispatch({
      effects: compartment.reconfigure(
        configExtensions({
          kind,
          columns: ctx.columns,
          functions: ctx.functions,
          readOnly: ro,
          ariaLabel,
          id: inputId,
          errors,
        }),
      ),
    });
  }, [compartment, configKey, kind, ctx.columns, ctx.functions, ro, ariaLabel, inputId, errors]);

  const functions = ctx.functions.filter(
    (f) => f.kinds.includes(kind) || f.kinds.includes('scalar') || f.kinds.includes('boolean'),
  );

  const insert = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  };

  return (
    <Field
      id={inputId}
      label={label}
      description={description ?? (mode === 'panel' ? KIND_HINT[kind] : undefined)}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className={cn('flex gap-1', inline ? 'items-center' : 'items-start')}>
        <div
          ref={hostRef}
          data-testid="expression-editor"
          className={cn(
            'sg-expression-editor min-w-0 flex-1 rounded-md border border-input bg-background text-sm',
            'focus-within:ring-1 focus-within:ring-ring',
            !inline && 'resize-y overflow-auto',
            ro && 'opacity-70',
            invalid && 'border-destructive',
          )}
        />
        {!ro && (
          <div className={cn('flex shrink-0 gap-0.5', !inline && 'flex-col')}>
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
