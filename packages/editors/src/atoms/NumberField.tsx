/**
 * NumberField / RangeField — `x-editor: 'number'` and `x-editor: 'range'`.
 *
 * `NumberField` edits a single number. Constraints come from
 * `options.min` / `max` / `step` / `integer` / `suffix` / `placeholder`
 * first and from the JSON Schema node (`minimum`, `maximum`,
 * `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `type: 'integer'`)
 * as a fallback, so the editor can never disagree with the schema.
 *
 * `RangeField` edits a `[min, max]` tuple with two inputs and enforces
 * `min <= max`: editing one end past the other drags the other end along.
 * The tuple is emitted only when both ends are set; clearing both emits
 * `undefined`.
 */
import { useId, useState } from 'react';
import { cn } from '@smartgrid/ui';
import { Field } from '../lib/Field.js';
import { NumberInput } from '../lib/inputs.js';
import type { EditorProps } from '../types.js';

export interface NumberConstraints {
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  suffix?: string;
  placeholder?: string;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Merge `x-editor-options` with the JSON Schema node into concrete input constraints. */
export function numberConstraints(
  options: Record<string, unknown> | undefined,
  jsonSchema: Record<string, unknown> | undefined,
): NumberConstraints {
  const integer = options?.integer === true || jsonSchema?.type === 'integer';
  const step = num(options?.step) ?? num(jsonSchema?.multipleOf);
  const exclusiveStep = step ?? (integer ? 1 : Number.EPSILON);
  const exMin = num(jsonSchema?.exclusiveMinimum);
  const exMax = num(jsonSchema?.exclusiveMaximum);
  const min =
    num(options?.min) ??
    num(jsonSchema?.minimum) ??
    (exMin !== undefined ? exMin + exclusiveStep : undefined);
  const max =
    num(options?.max) ??
    num(jsonSchema?.maximum) ??
    (exMax !== undefined ? exMax - exclusiveStep : undefined);
  const out: NumberConstraints = { integer };
  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  if (step !== undefined) out.step = step;
  if (typeof options?.suffix === 'string') out.suffix = options.suffix;
  if (typeof options?.placeholder === 'string') out.placeholder = options.placeholder;
  return out;
}

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

export type NumberFieldProps = EditorProps<number>;

export function NumberField(props: NumberFieldProps) {
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
  const c = numberConstraints(options, jsonSchema);
  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <NumberInput
        id={id}
        value={value}
        onChange={onChange}
        min={c.min}
        max={c.max}
        step={c.step}
        integer={c.integer}
        suffix={c.suffix}
        placeholder={c.placeholder}
        mode={mode}
        readOnly={readOnly}
        disabled={disabled}
        className={cn(mode === 'inline' ? 'w-24' : 'w-full')}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// RangeField
// ---------------------------------------------------------------------------

export type RangeFieldProps = EditorProps<[number, number]>;

export function RangeField(props: RangeFieldProps) {
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
  const c = numberConstraints(options, jsonSchema);
  const [lo, setLo] = useState<number | undefined>(value?.[0]);
  const [hi, setHi] = useState<number | undefined>(value?.[1]);
  const [seen, setSeen] = useState(value);
  if (value !== seen && (value?.[0] !== seen?.[0] || value?.[1] !== seen?.[1])) {
    setSeen(value);
    setLo(value?.[0]);
    setHi(value?.[1]);
  } else if (value !== seen) {
    setSeen(value);
  }

  const commit = (nextLo: number | undefined, nextHi: number | undefined) => {
    setLo(nextLo);
    setHi(nextHi);
    if (nextLo === undefined && nextHi === undefined) onChange(undefined);
    else if (nextLo !== undefined && nextHi !== undefined) onChange([nextLo, nextHi]);
  };
  const onLo = (n: number | undefined) => commit(n, n !== undefined && hi !== undefined && hi < n ? n : hi);
  const onHi = (n: number | undefined) => commit(n !== undefined && lo !== undefined && lo > n ? n : lo, n);

  const inputCls = mode === 'inline' ? 'w-20' : 'w-full';
  const shared = {
    min: c.min,
    max: c.max,
    step: c.step,
    integer: c.integer,
    suffix: c.suffix,
    mode,
    readOnly,
    disabled,
  } as const;

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div className="flex min-w-0 items-center gap-1" role="group" aria-label={label ?? 'Range'}>
        <div className={inputCls}>
          <NumberInput id={id} value={lo} onChange={onLo} placeholder="Min" {...shared} />
        </div>
        <span className="text-xs text-muted-foreground" aria-hidden>
          –
        </span>
        <div className={inputCls}>
          <NumberInput id={`${id}-max`} value={hi} onChange={onHi} placeholder="Max" {...shared} />
        </div>
      </div>
    </Field>
  );
}
