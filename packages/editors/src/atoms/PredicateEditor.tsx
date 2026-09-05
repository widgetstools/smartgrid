/**
 * PredicateEditor — `x-editor: predicate`. Edits `{ predicateId, inputs[],
 * columnId? }`. The predicate list is filtered by the data type of the
 * column the predicate reads: `options.dataType` when the host knows it, or
 * the referenced `columnId`'s type from context, else every predicate.
 * Inputs render per arity (0, 1, 2, or a value list) and per data type
 * (number, text, date, boolean).
 */
import { useId } from 'react';
import { Link2 } from 'lucide-react';
import type { CellDataType, Predicate } from '@smartgrid/schema';
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@smartgrid/ui';
import { predicatesFor, useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { EnumSelect, NumberInput, TextInput, controlSize } from '../lib/inputs.js';
import type { EditorProps, PredicateInfo } from '../types.js';
import { ColumnPicker } from './ColumnPicker.js';
import { SelectValuesEditor } from './SelectValuesEditor.js';

export interface PredicateEditorOptions {
  dataType?: CellDataType;
  /** Column whose values the predicate reads when `columnId` is not set (for value suggestions). */
  columnId?: string;
  /** Hide the "reference another column" affordance. */
  noReference?: boolean;
}

function InputFor({
  dataType,
  value,
  onChange,
  mode,
  ro,
  label,
}: {
  dataType: CellDataType | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
  mode: 'inline' | 'popover' | 'panel';
  ro: boolean | undefined;
  label: string;
}) {
  if (dataType === 'number') {
    return (
      <NumberInput
        aria-label={label}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
        mode={mode}
        disabled={ro}
        className="w-24"
      />
    );
  }
  if (dataType === 'date' || dataType === 'dateString') {
    return (
      <input
        aria-label={label}
        type="date"
        className={cn('rounded-md border border-input bg-background px-2 text-sm', controlSize(mode))}
        value={typeof value === 'string' ? value.slice(0, 10) : ''}
        disabled={ro}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }
  return (
    <TextInput
      aria-label={label}
      value={value === undefined || value === null ? undefined : String(value)}
      onChange={onChange}
      mode={mode}
      readOnly={ro}
      className="w-28"
      commit="blur"
    />
  );
}

export function PredicateEditor({
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
}: EditorProps<Predicate>) {
  const ctx = useEditorContext();
  const ro = readOnly || disabled;
  const autoId = useId();
  const opts = (options ?? {}) as PredicateEditorOptions;
  const refColumn = value?.columnId ? ctx.columns.find((c) => c.id === value.columnId) : undefined;
  const scopedColumn = opts.columnId ? ctx.columns.find((c) => c.id === opts.columnId) : undefined;
  const dataType: CellDataType | undefined = refColumn?.dataType ?? opts.dataType ?? scopedColumn?.dataType;
  const list: PredicateInfo[] = dataType ? predicatesFor(dataType, ctx.predicates) : [...ctx.predicates];
  const info =
    list.find((p) => p.id === value?.predicateId) ?? ctx.predicates.find((p) => p.id === value?.predicateId);
  const arity = info?.arity ?? 0;
  const suggestions = (refColumn ?? scopedColumn)?.sampleValues.map((v) => String(v)) ?? [];

  const setPredicate = (predicateId: string | undefined) => {
    if (!predicateId) return onChange(undefined);
    onChange({ predicateId, inputs: [], columnId: value?.columnId });
  };
  const setInput = (i: number, v: unknown) => {
    const inputs = [...(value?.inputs ?? [])];
    inputs[i] = v;
    onChange({ ...(value ?? { predicateId: '' }), inputs });
  };

  return (
    <Field
      id={id ?? autoId}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {!opts.noReference && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={value?.columnId ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7 shrink-0"
                aria-label={
                  value?.columnId
                    ? `Reads column ${refColumn?.header ?? value.columnId}`
                    : 'Read a different column'
                }
                disabled={ro}
              >
                <Link2 className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <p className="mb-1 text-2xs text-muted-foreground">Evaluate against another column</p>
              <ColumnPicker
                value={value?.columnId}
                onChange={(c) => onChange({ ...(value ?? { predicateId: '', inputs: [] }), columnId: c })}
                mode="popover"
                label="Column"
              />
            </PopoverContent>
          </Popover>
        )}
        <EnumSelect
          aria-label="Predicate"
          value={value?.predicateId}
          onChange={setPredicate}
          options={list.map((p) => ({ value: p.id, label: p.label }))}
          placeholder="Condition"
          mode={mode}
          disabled={ro}
          allowClear
          className="w-40"
        />
        {arity === 1 && (
          <InputFor
            dataType={dataType}
            value={value?.inputs?.[0]}
            onChange={(v) => setInput(0, v)}
            mode={mode}
            ro={ro}
            label="Value"
          />
        )}
        {arity === 2 && (
          <>
            <InputFor
              dataType={dataType}
              value={value?.inputs?.[0]}
              onChange={(v) => setInput(0, v)}
              mode={mode}
              ro={ro}
              label="From"
            />
            <span className="text-xs text-muted-foreground">and</span>
            <InputFor
              dataType={dataType}
              value={value?.inputs?.[1]}
              onChange={(v) => setInput(1, v)}
              mode={mode}
              ro={ro}
              label="To"
            />
          </>
        )}
        {arity === 'list' && (
          <SelectValuesEditor
            value={(value?.inputs ?? []).map((v) => String(v))}
            onChange={(vals) => onChange({ ...(value ?? { predicateId: '' }), inputs: vals ?? [] })}
            mode={mode === 'panel' ? 'popover' : mode}
            readOnly={ro}
            label="Values"
            options={{ suggestions, columnId: value?.columnId ?? opts.columnId }}
          />
        )}
      </div>
    </Field>
  );
}
