/**
 * Primitive editors — `x-editor: 'text'`, `'boolean'` and `'enum'`.
 *
 *  - `TextField`: single-line input, or a textarea when
 *    `options.multiline` is set. Honours `options.placeholder`,
 *    `options.maxLength` / `jsonSchema.maxLength`, `options.mono` and
 *    `options.commit` ('change' | 'blur').
 *  - `BooleanField`: a Switch; in panel mode the label sits beside it.
 *  - `EnumField`: options from `options.values` (`{ value, label? }[]`) or
 *    `jsonSchema.enum`; renders a segmented ToggleGroup when there are at
 *    most four options and a Select otherwise. Clearing emits `undefined`.
 */
import { useId, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@smartgrid/ui';
import { Field } from '../lib/Field.js';
import { TextInput, controlSize } from '../lib/inputs.js';
import { humanize } from '../lib/util.js';
import type { EditorProps } from '../types.js';

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------

export type TextFieldProps = EditorProps<string>;

function numberOpt(...candidates: unknown[]): number | undefined {
  for (const c of candidates) if (typeof c === 'number' && Number.isFinite(c)) return c;
  return undefined;
}

export function TextField(props: TextFieldProps) {
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
    jsonSchema,
    autoFocus,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const multiline = options?.multiline === true;
  const placeholder = typeof options?.placeholder === 'string' ? options.placeholder : undefined;
  const maxLength = numberOpt(options?.maxLength, jsonSchema?.maxLength);
  const commit = options?.commit === 'blur' ? 'blur' : 'change';
  const mono = options?.mono === true;

  const [draft, setDraft] = useState(value ?? '');
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value ?? '');
  }
  const emit = (v: string) => onChange(v === '' ? undefined : v);

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      {multiline ? (
        <Textarea
          id={id}
          value={draft}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          aria-label={label}
          rows={mode === 'panel' ? 4 : 2}
          className={cn('text-sm', mode === 'inline' && 'min-h-0', mono && 'font-mono')}
          onChange={(e) => {
            setDraft(e.target.value);
            if (commit === 'change') emit(e.target.value);
          }}
          onBlur={() => commit === 'blur' && emit(draft)}
        />
      ) : (
        <TextInput
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          mode={mode}
          readOnly={readOnly}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength}
          commit={commit}
          mono={mono}
        />
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------
// BooleanField
// ---------------------------------------------------------------------------

export type BooleanFieldProps = EditorProps<boolean>;

export function BooleanField(props: BooleanFieldProps) {
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
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <Field
      mode={mode}
      label={label}
      description={description}
      errors={errors}
      id={id}
      className={className}
      row={mode === 'panel'}
    >
      <Switch
        id={id}
        checked={!!value}
        disabled={disabled || readOnly}
        aria-label={label ?? 'Toggle'}
        onCheckedChange={(v) => onChange(v)}
        className={cn(
          mode === 'inline' && 'h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span[data-state=checked]]:translate-x-3',
        )}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// EnumField
// ---------------------------------------------------------------------------

export interface EnumOption {
  value: string;
  label?: string;
}

/** Resolve enum options from `options.values` or `jsonSchema.enum`. */
export function enumOptionsFrom(
  options: Record<string, unknown> | undefined,
  jsonSchema: Record<string, unknown> | undefined,
): EnumOption[] {
  const fromOptions = options?.values;
  if (Array.isArray(fromOptions)) {
    return fromOptions
      .map((o): EnumOption | undefined => {
        if (typeof o === 'string') return { value: o };
        if (o && typeof o === 'object' && typeof (o as EnumOption).value === 'string') {
          const { value, label } = o as EnumOption;
          return label === undefined ? { value } : { value, label };
        }
        return undefined;
      })
      .filter((o): o is EnumOption => o !== undefined);
  }
  const fromSchema = jsonSchema?.enum;
  if (Array.isArray(fromSchema))
    return fromSchema.filter((v): v is string => typeof v === 'string').map((value) => ({ value }));
  return [];
}

export type EnumFieldProps = EditorProps<string>;

/** Options up to this count render as a segmented toggle; more become a Select. */
export const ENUM_TOGGLE_MAX = 4;

const CLEAR = '__clear__';

export function EnumField(props: EnumFieldProps) {
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
    jsonSchema,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const locked = !!readOnly || !!disabled;
  const opts = enumOptionsFrom(options, jsonSchema);
  const labelOf = (o: EnumOption) => o.label ?? humanize(o.value);

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      {opts.length <= ENUM_TOGGLE_MAX ? (
        <ToggleGroup
          id={id}
          type="single"
          variant="outline"
          size={mode === 'panel' ? 'default' : 'sm'}
          value={value ?? ''}
          disabled={locked}
          aria-label={label ?? 'Options'}
          className="justify-start gap-0"
          onValueChange={(v) => onChange(v === '' ? undefined : v)}
        >
          {opts.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              aria-label={labelOf(o)}
              className="rounded-none first:rounded-l-md last:rounded-r-md -ml-px first:ml-0"
            >
              {labelOf(o)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Select
          value={value ?? ''}
          onValueChange={(v) => onChange(v === CLEAR || v === '' ? undefined : v)}
          disabled={locked}
        >
          <SelectTrigger
            id={id}
            aria-label={label ?? 'Options'}
            className={cn(controlSize(mode), 'min-w-24')}
          >
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {value !== undefined && <SelectItem value={CLEAR}>—</SelectItem>}
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {labelOf(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
