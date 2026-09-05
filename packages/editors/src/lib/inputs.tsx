import { useState } from 'react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from '@smartgrid/ui';
import type { EditorMode } from '../types.js';

/** Height class per mode so every control lines up. */
export const controlSize = (mode: EditorMode | undefined) =>
  mode === 'panel' ? 'h-control' : 'h-control-sm text-sm';

/**
 * Keeps a local draft string in sync with an external value without an
 * effect: when the prop changes, the draft is reset during render.
 */
function useDraft(external: string): [string, (s: string) => void] {
  const [draft, setDraft] = useState(external);
  const [last, setLast] = useState(external);
  if (external !== last) {
    setLast(external);
    setDraft(external);
  }
  return [draft, setDraft];
}

export interface TextInputProps {
  id?: string;
  'aria-label'?: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  mode?: EditorMode;
  readOnly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  maxLength?: number;
  /** Commit on every keystroke (default) or only on blur/Enter. */
  commit?: 'change' | 'blur';
  mono?: boolean;
}

/** Text input that keeps a local draft so hosts may commit on blur. */
export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  mode,
  readOnly,
  disabled,
  autoFocus,
  className,
  maxLength,
  commit = 'change',
  mono,
  ...rest
}: TextInputProps) {
  const [draft, setDraft] = useDraft(value ?? '');
  const emit = (v: string) => onChange(v === '' ? undefined : v);
  return (
    <Input
      id={id}
      aria-label={rest['aria-label']}
      value={draft}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className={cn(controlSize(mode), mono && 'font-mono', className)}
      onChange={(e) => {
        setDraft(e.target.value);
        if (commit === 'change') emit(e.target.value);
      }}
      onBlur={() => commit === 'blur' && emit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && commit === 'blur') emit(draft);
      }}
    />
  );
}

export interface NumberInputProps {
  id?: string;
  'aria-label'?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  placeholder?: string;
  mode?: EditorMode;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  suffix?: string;
}

export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  integer,
  placeholder,
  mode,
  readOnly,
  disabled,
  className,
  suffix,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useDraft(value === undefined ? '' : String(value));
  const commit = (s: string) => {
    if (s.trim() === '') return onChange(undefined);
    let n = Number(s);
    if (!Number.isFinite(n)) return;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        aria-label={rest['aria-label']}
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step ?? (integer ? 1 : 'any')}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        className={cn(controlSize(mode), 'w-full font-mono', suffix && 'pr-8')}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

export interface EnumSelectProps<V extends string> {
  id?: string;
  'aria-label'?: string;
  value: V | undefined;
  onChange: (v: V | undefined) => void;
  options: readonly { value: V; label?: string }[];
  placeholder?: string;
  mode?: EditorMode;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}

const CLEAR = '__clear__';

export function EnumSelect<V extends string>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  mode,
  disabled,
  allowClear,
  className,
  ...rest
}: EnumSelectProps<V>) {
  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => onChange(v === CLEAR ? undefined : (v as V))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={rest['aria-label']}
        className={cn(controlSize(mode), 'min-w-24', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={CLEAR}>—</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label ?? o.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface BoolSwitchProps {
  id?: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function BoolSwitch({ id, value, onChange, disabled, label, className }: BoolSwitchProps) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <Switch id={id} checked={!!value} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
      {label && <span>{label}</span>}
    </label>
  );
}
