/**
 * ColumnTypePicker — `x-editor: 'columnType'`.
 *
 * Select over the `CellDataType` enum from `@smartgrid/schema`, grouped
 * into Scalar (text, number, boolean, date, dateString) and Array
 * (textArray, numberArray, tupleArray, objectArray) with a data-type glyph
 * per entry. A leading "—" item clears the value.
 *
 * Options: `allowClear?: boolean` (default true).
 */
import { useId } from 'react';
import { ARRAY_DATA_TYPES, SCALAR_DATA_TYPES, type CellDataType } from '@smartgrid/schema';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from '@smartgrid/ui';
import { Field } from '../lib/Field.js';
import { controlSize } from '../lib/inputs.js';
import { humanize } from '../lib/util.js';
import type { EditorProps } from '../types.js';
import { DataTypeGlyph } from './ColumnPicker.js';

const CLEAR = '__clear__';

/** Human label for a cell data type ("dateString" → "Date string"). */
export function cellDataTypeLabel(t: CellDataType): string {
  const s = humanize(t);
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export type ColumnTypePickerProps = EditorProps<CellDataType>;

const OBJECT_TYPES: readonly CellDataType[] = ['object'];

export function ColumnTypePicker(props: ColumnTypePickerProps) {
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
  const allowClear = options?.allowClear !== false;

  const item = (t: CellDataType) => (
    <SelectItem key={t} value={t}>
      <span className="inline-flex items-center gap-2">
        <DataTypeGlyph dataType={t} />
        {cellDataTypeLabel(t)}
      </span>
    </SelectItem>
  );

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v === CLEAR || v === '' ? undefined : (v as CellDataType))}
        disabled={locked}
      >
        <SelectTrigger
          id={id}
          aria-label={label ?? 'Column type'}
          className={cn(controlSize(mode), 'min-w-32')}
        >
          <SelectValue placeholder="Select type…" />
        </SelectTrigger>
        <SelectContent>
          {allowClear && value !== undefined && <SelectItem value={CLEAR}>—</SelectItem>}
          <SelectGroup>
            <SelectLabel>Scalar</SelectLabel>
            {SCALAR_DATA_TYPES.map(item)}
            {OBJECT_TYPES.map(item)}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Array</SelectLabel>
            {ARRAY_DATA_TYPES.map(item)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
