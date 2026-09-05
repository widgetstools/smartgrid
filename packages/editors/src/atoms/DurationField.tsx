/**
 * DurationField — `x-editor: 'duration'`.
 *
 * Edits the schema `Duration`: a non-negative integer number of
 * milliseconds, or the literal `'always'` for permanent effects. Renders a
 * number input with a unit select (ms / s / min) and an "Always" switch.
 * The value is always stored in milliseconds regardless of the unit shown;
 * the unit is display-only state, initialised from the value's divisibility.
 *
 * Options: `max?: number` (in ms), `allowAlways?: boolean` (default true).
 */
import { useId, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, cn } from '@smartgrid/ui';
import { Field } from '../lib/Field.js';
import { NumberInput, controlSize } from '../lib/inputs.js';
import type { EditorProps } from '../types.js';

export type DurationUnit = 'ms' | 's' | 'min';

export const DURATION_UNITS: readonly { value: DurationUnit; label: string; factor: number }[] = [
  { value: 'ms', label: 'ms', factor: 1 },
  { value: 's', label: 's', factor: 1000 },
  { value: 'min', label: 'min', factor: 60_000 },
];

const factorOf = (u: DurationUnit) => DURATION_UNITS.find((d) => d.value === u)?.factor ?? 1;

/** Largest unit that divides `ms` exactly (falls back to ms). */
export function guessDurationUnit(ms: number | undefined): DurationUnit {
  if (ms === undefined || ms === 0) return 'ms';
  if (ms % 60_000 === 0) return 'min';
  if (ms % 1000 === 0) return 's';
  return 'ms';
}

/** Human summary of a duration value, e.g. "1.5 s", "2 min", "Always". */
export function formatDuration(value: number | 'always' | undefined): string {
  if (value === undefined) return '';
  if (value === 'always') return 'Always';
  const unit = guessDurationUnit(value);
  const n = value / factorOf(unit);
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;
}

export type DurationFieldProps = EditorProps<number | 'always'>;

export function DurationField(props: DurationFieldProps) {
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
  const locked = !!readOnly || !!disabled;
  const always = value === 'always';
  const ms = typeof value === 'number' ? value : undefined;
  const allowAlways = options?.allowAlways !== false;
  const maxMs = typeof options?.max === 'number' ? options.max : undefined;

  const [unit, setUnit] = useState<DurationUnit>(() => guessDurationUnit(ms));
  // Remember the last numeric value so switching "Always" off restores it.
  const [lastMs, setLastMs] = useState<number | undefined>(ms);
  // Sync derived state during render (no effect): re-derive the unit only when
  // the incoming value stops fitting the current one, and track the last number.
  const [seenMs, setSeenMs] = useState(ms);
  if (ms !== seenMs) {
    setSeenMs(ms);
    if (ms !== undefined) {
      setLastMs(ms);
      if (ms % factorOf(unit) !== 0) setUnit(guessDurationUnit(ms));
    }
  }

  const factor = factorOf(unit);
  const shown = ms === undefined ? undefined : ms / factor;
  const onNumber = (n: number | undefined) =>
    onChange(n === undefined ? undefined : Math.max(0, Math.round(n * factor)));

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div className="flex min-w-0 items-center gap-1">
        <div className={cn(mode === 'inline' ? 'w-20' : 'w-28')}>
          <NumberInput
            id={id}
            value={shown}
            onChange={onNumber}
            min={0}
            max={maxMs !== undefined ? maxMs / factor : undefined}
            placeholder={always ? '∞' : '0'}
            mode={mode}
            readOnly={readOnly}
            disabled={disabled || always}
          />
        </div>
        <Select value={unit} onValueChange={(u) => setUnit(u as DurationUnit)} disabled={locked || always}>
          <SelectTrigger
            aria-label="Duration unit"
            className={cn(controlSize(mode), 'w-auto min-w-16 gap-1')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allowAlways && (
          <label
            className={cn(
              'ml-1 inline-flex items-center gap-1.5 text-muted-foreground',
              mode === 'panel' ? 'text-sm' : 'text-xs',
            )}
          >
            <Switch
              checked={always}
              disabled={locked}
              aria-label="Always"
              onCheckedChange={(on) => onChange(on ? 'always' : lastMs)}
            />
            <span>Always</span>
          </label>
        )}
      </div>
    </Field>
  );
}
