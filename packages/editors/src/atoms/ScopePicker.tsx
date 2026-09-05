/**
 * ScopePicker — `x-editor: scope`. Edits Scope: all columns, specific
 * columns, all columns of given data types (plus extra columns), or columns
 * of a given column type.
 *
 * RowScopePicker — `x-editor: rowScope`. Four exclusion toggles.
 */
import { useId } from 'react';
import { BUILT_IN_COLUMN_TYPES, CellDataType, type RowScope, type Scope } from '@smartgrid/schema';
import { Checkbox, ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { setKey } from '../lib/util.js';
import type { EditorProps } from '../types.js';
import { ColumnsPicker } from './ColumnPicker.js';
import { SelectValuesEditor } from './SelectValuesEditor.js';

const DATA_TYPES = CellDataType.options;

export function ScopePicker({
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
}: EditorProps<Scope>) {
  const ctx = useEditorContext();
  const ro = readOnly || disabled;
  const autoId = useId();
  const kind = value?.kind ?? 'all';
  const columnTypes = [...new Set([...BUILT_IN_COLUMN_TYPES, ...ctx.columns.flatMap((c) => c.columnTypes)])];

  const switchKind = (k: string) => {
    switch (k as Scope['kind']) {
      case 'all':
        return onChange({ kind: 'all' });
      case 'columns':
        return onChange({ kind: 'columns', columnIds: value?.kind === 'dataTypes' ? value.columnIds : [] });
      case 'dataTypes':
        return onChange({
          kind: 'dataTypes',
          dataTypes: ['number'],
          columnIds: value?.kind === 'columns' ? value.columnIds : [],
        });
      case 'columnTypes':
        return onChange({ kind: 'columnTypes', columnTypes: [] });
      default:
        return;
    }
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
      <div
        className={cn('flex flex-col gap-2', mode === 'inline' && 'flex-row flex-wrap items-center gap-1.5')}
      >
        <ToggleGroup
          type="single"
          size="sm"
          value={kind}
          disabled={ro}
          aria-label="Scope kind"
          onValueChange={(k) => k && switchKind(k)}
        >
          <ToggleGroupItem value="all" className="px-2 text-xs">
            All columns
          </ToggleGroupItem>
          <ToggleGroupItem value="columns" className="px-2 text-xs">
            Columns
          </ToggleGroupItem>
          <ToggleGroupItem value="dataTypes" className="px-2 text-xs">
            Data types
          </ToggleGroupItem>
          {columnTypes.length > 0 && (
            <ToggleGroupItem value="columnTypes" className="px-2 text-xs">
              Column types
            </ToggleGroupItem>
          )}
        </ToggleGroup>

        {value?.kind === 'columns' && (
          <ColumnsPicker
            value={value.columnIds}
            onChange={(ids) => onChange({ kind: 'columns', columnIds: ids ?? [] })}
            mode={mode === 'panel' ? 'popover' : mode}
            readOnly={ro}
            label="Columns"
            errors={errors?.filter((e) => e.path.startsWith('/columnIds')).map((e) => ({ ...e, path: '' }))}
          />
        )}
        {value?.kind === 'dataTypes' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Data types">
              {DATA_TYPES.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={value.dataTypes.includes(t)}
                    disabled={ro}
                    onCheckedChange={(on) => {
                      const dataTypes = on ? [...value.dataTypes, t] : value.dataTypes.filter((d) => d !== t);
                      onChange({ ...value, dataTypes });
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
            {mode !== 'inline' && (
              <ColumnsPicker
                value={value.columnIds}
                onChange={(ids) => onChange({ ...value, columnIds: ids ?? [] })}
                mode="popover"
                readOnly={ro}
                label="Also include columns"
              />
            )}
          </div>
        )}
        {value?.kind === 'columnTypes' && (
          <SelectValuesEditor
            value={value.columnTypes}
            onChange={(types) => onChange({ kind: 'columnTypes', columnTypes: types ?? [] })}
            mode={mode === 'panel' ? 'popover' : mode}
            readOnly={ro}
            label="Column types"
            options={{ suggestions: columnTypes }}
          />
        )}
      </div>
    </Field>
  );
}

const ROW_KINDS: { key: keyof RowScope; label: string }[] = [
  { key: 'excludeDataRows', label: 'Data rows' },
  { key: 'excludeGroupRows', label: 'Group rows' },
  { key: 'excludeSummaryRows', label: 'Summary rows' },
  { key: 'excludeTotalRows', label: 'Total rows' },
];

/** Shown as "applies to" checkboxes; the stored value is the inverse (exclusions). */
export function RowScopePicker({
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
}: EditorProps<RowScope>) {
  const ro = readOnly || disabled;
  const autoId = useId();
  return (
    <Field
      id={id ?? autoId}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className="flex flex-wrap gap-3" role="group" aria-label={label ?? 'Row kinds'}>
        {ROW_KINDS.map((k) => (
          <label key={k.key} className="inline-flex items-center gap-1 text-xs">
            <Checkbox
              checked={!value?.[k.key]}
              disabled={ro}
              onCheckedChange={(on) => onChange(setKey(value, k.key, on ? undefined : true))}
            />
            {k.label}
          </label>
        ))}
      </div>
    </Field>
  );
}
