/**
 * DisplayFormatEditor — `x-editor: displayFormat`. Edits the DisplayFormat
 * union: number (with the 15 AdapTable presets), string, date (TR35 pattern
 * with presets), template, excel, tick, custom. Kind tabs; each kind shows
 * only its options; a live PreviewCell shows the result on a sample value.
 */
import { useId } from 'react';
import {
  DATE_PATTERN_PRESETS,
  NUMBER_PRESETS,
  type DisplayFormat,
  type NumberFormat,
} from '@smartgrid/schema';
import { NUMBER_PRESET_OPTIONS } from '@smartgrid/engine';
import { Button, ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { BoolSwitch, EnumSelect, NumberInput, TextInput } from '../lib/inputs.js';
import { setKey } from '../lib/util.js';
import type { EditorProps } from '../types.js';
import { PreviewCell } from '../presentational/PreviewCell.js';

const KINDS: { value: DisplayFormat['kind']; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'string', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'template', label: 'Template' },
  { value: 'excel', label: 'Excel' },
  { value: 'tick', label: 'Tick' },
  { value: 'custom', label: 'Custom' },
];

function defaultFor(kind: DisplayFormat['kind']): DisplayFormat {
  switch (kind) {
    case 'number':
      return { kind: 'number', preset: 'Decimal' };
    case 'string':
      return { kind: 'string' };
    case 'date':
      return { kind: 'date', pattern: 'dd-MMM-yyyy' };
    case 'template':
      return { kind: 'template', template: '[value]' };
    case 'excel':
      return { kind: 'excel', format: '#,##0.00' };
    case 'tick':
      return { kind: 'tick', denominator: '32', showPlus: false };
    case 'custom':
      return { kind: 'custom', formatterId: '' };
  }
}

function sampleFor(kind: DisplayFormat['kind'] | undefined, override: unknown): unknown {
  if (override !== undefined) return override;
  switch (kind) {
    case 'date':
      return new Date(2026, 8, 5, 14, 30);
    case 'string':
      return 'rates desk';
    default:
      return -1234567.891;
  }
}

export function DisplayFormatEditor({
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
}: EditorProps<DisplayFormat>) {
  const ctx = useEditorContext();
  const ro = readOnly || disabled;
  const autoId = useId();
  const kind = value?.kind;
  const sample = sampleFor(kind, options?.['sample']);
  const allowedKinds =
    (options?.['kinds'] as DisplayFormat['kind'][] | undefined) ?? KINDS.map((k) => k.value);

  return (
    <Field
      id={id ?? autoId}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div
        className={cn('flex flex-col gap-2', mode === 'inline' && 'flex-row flex-wrap items-center gap-1.5')}
      >
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'inline' ? (
            <EnumSelect
              aria-label="Format kind"
              value={kind}
              onChange={(k) => onChange(k ? defaultFor(k) : undefined)}
              options={KINDS.filter((k) => allowedKinds.includes(k.value))}
              placeholder="Format"
              mode={mode}
              disabled={ro}
              allowClear
              className="w-28"
            />
          ) : (
            <ToggleGroup
              type="single"
              size="sm"
              value={kind ?? ''}
              disabled={ro}
              aria-label="Format kind"
              onValueChange={(k) => onChange(k ? defaultFor(k as DisplayFormat['kind']) : undefined)}
            >
              {KINDS.filter((k) => allowedKinds.includes(k.value)).map((k) => (
                <ToggleGroupItem key={k.value} value={k.value} className="px-2 text-xs">
                  {k.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {value && !ro && mode !== 'inline' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => onChange(undefined)}
            >
              Clear
            </Button>
          )}
        </div>

        {value?.kind === 'number' && <NumberOptions value={value} onChange={onChange} mode={mode} ro={ro} />}
        {value?.kind === 'string' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <EnumSelect
              aria-label="Case"
              value={value.case}
              onChange={(c) => onChange(setKey(value, 'case', c))}
              options={[
                { value: 'upper', label: 'UPPER' },
                { value: 'lower', label: 'lower' },
                { value: 'sentence', label: 'Sentence' },
                { value: 'title', label: 'Title' },
              ]}
              placeholder="Case"
              mode={mode}
              disabled={ro}
              allowClear
              className="w-28"
            />
            <BoolSwitch
              value={value.trim}
              onChange={(t) => onChange(setKey(value, 'trim', t || undefined))}
              disabled={ro}
              label="Trim"
            />
            {mode !== 'inline' && (
              <>
                <TextInput
                  aria-label="Prefix"
                  value={value.prefix}
                  onChange={(p) => onChange(setKey(value, 'prefix', p))}
                  placeholder="Prefix"
                  mode={mode}
                  readOnly={ro}
                  className="w-24"
                  commit="blur"
                />
                <TextInput
                  aria-label="Suffix"
                  value={value.suffix}
                  onChange={(s) => onChange(setKey(value, 'suffix', s))}
                  placeholder="Suffix"
                  mode={mode}
                  readOnly={ro}
                  className="w-24"
                  commit="blur"
                />
                <TextInput
                  aria-label="Content template"
                  value={value.content}
                  onChange={(c) => onChange(setKey(value, 'content', c))}
                  placeholder="[value] ([rowData.x])"
                  mode={mode}
                  readOnly={ro}
                  className="w-48"
                  commit="blur"
                  mono
                />
              </>
            )}
          </div>
        )}
        {value?.kind === 'date' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <EnumSelect
              aria-label="Date pattern preset"
              value={DATE_PATTERN_PRESETS.includes(value.pattern as never) ? value.pattern : undefined}
              onChange={(p) => p && onChange({ ...value, pattern: p })}
              options={DATE_PATTERN_PRESETS.map((p) => ({ value: p }))}
              placeholder="Preset"
              mode={mode}
              disabled={ro}
              className="w-44"
            />
            <TextInput
              aria-label="Date pattern"
              value={value.pattern}
              onChange={(p) => onChange({ ...value, pattern: p ?? 'yyyy-MM-dd' })}
              mode={mode}
              readOnly={ro}
              className="w-44"
              commit="blur"
              mono
            />
          </div>
        )}
        {value?.kind === 'template' && (
          <TextInput
            aria-label="Template"
            value={value.template}
            onChange={(t) => onChange({ ...value, template: t ?? '[value]' })}
            placeholder="[column]: [value] ([rowData.ccy])"
            mode={mode}
            readOnly={ro}
            className="w-64"
            commit="blur"
            mono
          />
        )}
        {value?.kind === 'excel' && (
          <TextInput
            aria-label="Excel format"
            value={value.format}
            onChange={(f) => onChange({ ...value, format: f ?? '#,##0.00' })}
            placeholder="#,##0.00;[Red](#,##0.00)"
            mode={mode}
            readOnly={ro}
            className="w-64"
            commit="blur"
            mono
          />
        )}
        {value?.kind === 'tick' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <EnumSelect
              aria-label="Denominator"
              value={value.denominator}
              onChange={(d) => d && onChange({ ...value, denominator: d })}
              options={(['32', '64', '128', '256'] as const).map((d) => ({ value: d, label: `${d}nds` }))}
              mode={mode}
              disabled={ro}
              className="w-24"
            />
            <BoolSwitch
              value={value.showPlus}
              onChange={(p) => onChange({ ...value, showPlus: p })}
              disabled={ro}
              label="Show +"
            />
          </div>
        )}
        {value?.kind === 'custom' && (
          <TextInput
            aria-label="Formatter id"
            value={value.formatterId}
            onChange={(f) => onChange({ ...value, formatterId: f ?? '' })}
            placeholder="host formatter id"
            mode={mode}
            readOnly={ro}
            className="w-48"
            commit="blur"
            mono
          />
        )}

        {value && mode !== 'inline' && (
          <div className="flex items-center gap-3">
            <span className="text-2xs text-muted-foreground">Preview</span>
            <PreviewCell
              value={sample}
              displayFormat={value}
              theme={ctx.theme}
              className="w-44"
              columnHeader="Column"
              rowData={ctx.sampleRows[0]}
            />
          </div>
        )}
      </div>
    </Field>
  );
}

function NumberOptions({
  value,
  onChange,
  mode,
  ro,
}: {
  value: NumberFormat;
  onChange: (v: DisplayFormat | undefined) => void;
  mode: 'inline' | 'popover' | 'panel';
  ro: boolean | undefined;
}) {
  const set = <K extends keyof NumberFormat>(k: K, v: NumberFormat[K] | undefined) =>
    onChange(setKey(value, k, v) as DisplayFormat);
  const presetDefaults = value.preset ? NUMBER_PRESET_OPTIONS[value.preset] : {};
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <EnumSelect
          aria-label="Number preset"
          value={value.preset}
          onChange={(p) => set('preset', p)}
          options={NUMBER_PRESETS.map((p) => ({ value: p }))}
          placeholder="Preset"
          mode={mode}
          disabled={ro}
          allowClear
          className="w-32"
        />
        <NumberInput
          aria-label="Fraction digits"
          value={value.fractionDigits}
          onChange={(d) => set('fractionDigits', d)}
          min={0}
          max={20}
          integer
          placeholder={String(presetDefaults.fractionDigits ?? 2)}
          mode={mode}
          disabled={ro}
          className="w-16"
          suffix="dp"
        />
        <TextInput
          aria-label="Prefix"
          value={value.prefix}
          onChange={(p) => set('prefix', p)}
          placeholder={presetDefaults.prefix ?? 'Prefix'}
          mode={mode}
          readOnly={ro}
          className="w-20"
          commit="blur"
        />
        <TextInput
          aria-label="Suffix"
          value={value.suffix}
          onChange={(s) => set('suffix', s)}
          placeholder={presetDefaults.suffix ?? 'Suffix'}
          mode={mode}
          readOnly={ro}
          className="w-20"
          commit="blur"
        />
      </div>
      {mode !== 'inline' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <NumberInput
            aria-label="Multiplier"
            value={value.multiplier}
            onChange={(m) => set('multiplier', m)}
            placeholder={String(presetDefaults.multiplier ?? 1)}
            mode={mode}
            disabled={ro}
            className="w-24"
            suffix="×"
          />
          <EnumSelect
            aria-label="Notation"
            value={value.notation}
            onChange={(n) => set('notation', n)}
            options={[{ value: 'standard' }, { value: 'scientific' }, { value: 'compact' }]}
            placeholder="Notation"
            mode={mode}
            disabled={ro}
            allowClear
            className="w-28"
          />
          <EnumSelect
            aria-label="Rounding"
            value={value.rounding}
            onChange={(r) => set('rounding', r)}
            options={[{ value: 'round' }, { value: 'ceiling' }, { value: 'floor' }, { value: 'truncate' }]}
            placeholder="Rounding"
            mode={mode}
            disabled={ro}
            allowClear
            className="w-28"
          />
          <TextInput
            aria-label="Zero display"
            value={value.zeroDisplay}
            onChange={(z) => set('zeroDisplay', z)}
            placeholder="Zero as"
            mode={mode}
            readOnly={ro}
            className="w-20"
            commit="blur"
          />
          <TextInput
            aria-label="Thousands separator"
            value={value.integerSeparator}
            onChange={(s) => set('integerSeparator', s)}
            placeholder={presetDefaults.integerSeparator ?? ','}
            mode={mode}
            readOnly={ro}
            className="w-12"
            maxLength={1}
            commit="blur"
          />
          <BoolSwitch
            value={value.parentheses}
            onChange={(p) => set('parentheses', p || undefined)}
            disabled={ro}
            label="( ) negatives"
          />
          <BoolSwitch
            value={value.abs}
            onChange={(a) => set('abs', a || undefined)}
            disabled={ro}
            label="Absolute"
          />
        </div>
      )}
    </div>
  );
}
