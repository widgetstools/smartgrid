/**
 * ColumnPicker / ColumnsPicker — `x-editor: 'column'` and `x-editor: 'columns'`.
 *
 * `ColumnPicker` edits a single column id as a searchable combobox
 * (Popover + Command) over `context.columns`. `ColumnsPicker` edits an
 * ordered list of column ids: an "Add column" combobox plus the selected
 * list with remove and up/down reorder buttons (keyboard: Alt+ArrowUp /
 * Alt+ArrowDown on a focused row, Delete/Backspace removes).
 *
 * Options (`x-editor-options`):
 *  - `dataTypes?: CellDataType[]` — only offer columns of these types
 *  - `max?: number` — cap on the number of selected columns (ColumnsPicker)
 *  - `placeholder?: string` — trigger text when nothing is selected
 *
 * Also exports `ColumnChip` (header + data-type glyph, resolved from context)
 * and `DataTypeGlyph`, the shared rendering of a column reference.
 */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { CellDataType, ColumnInfo } from '@smartgrid/schema';
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
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Brackets,
  Calendar,
  Check,
  ChevronsUpDown,
  Hash,
  Plus,
  ToggleLeft,
  Type,
  X,
} from 'lucide-react';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import type { EditorProps } from '../types.js';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export interface DataTypeGlyphProps {
  dataType: CellDataType | undefined;
  className?: string;
}

/** Small icon standing for a cell data type; array types get a bracket glyph. */
export function DataTypeGlyph({ dataType, className }: DataTypeGlyphProps) {
  const cls = cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', className);
  switch (dataType) {
    case 'number':
      return <Hash className={cls} aria-hidden />;
    case 'boolean':
      return <ToggleLeft className={cls} aria-hidden />;
    case 'date':
    case 'dateString':
      return <Calendar className={cls} aria-hidden />;
    case 'object':
      return <Braces className={cls} aria-hidden />;
    case 'textArray':
    case 'numberArray':
    case 'tupleArray':
    case 'objectArray':
      return <Brackets className={cls} aria-hidden />;
    case 'text':
    default:
      return <Type className={cls} aria-hidden />;
  }
}

export interface ColumnChipProps {
  columnId: string;
  /** Show the raw id next to the header. */
  showId?: boolean;
  className?: string;
}

/** Header + data-type glyph for a column id, resolved from the editor context. Unknown ids render as mono text. */
export function ColumnChip({ columnId, showId, className }: ColumnChipProps) {
  const { columns } = useEditorContext();
  const col = columns.find((c) => c.id === columnId);
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1.5', className)}
      title={col ? `${col.header} (${col.id})` : columnId}
      data-column-id={columnId}
    >
      <DataTypeGlyph dataType={col?.dataType} />
      <span className={cn('truncate', !col && 'font-mono text-muted-foreground')}>
        {col?.header ?? columnId}
      </span>
      {showId && col && <span className="truncate font-mono text-2xs text-muted-foreground">{col.id}</span>}
    </span>
  );
}

function readDataTypes(options: Record<string, unknown> | undefined): CellDataType[] | undefined {
  const dt = options?.dataTypes;
  return Array.isArray(dt) && dt.length > 0 ? (dt as CellDataType[]) : undefined;
}

/** Columns from context filtered by `options.dataTypes`, when given. */
export function useFilteredColumns(options: Record<string, unknown> | undefined): readonly ColumnInfo[] {
  const { columns } = useEditorContext();
  const dataTypes = readDataTypes(options);
  const dataTypesKey = dataTypes?.join('|');
  return useMemo(() => {
    const types = dataTypesKey?.split('|');
    return types ? columns.filter((c) => types.includes(c.dataType)) : columns;
  }, [columns, dataTypesKey]);
}

interface ColumnComboboxProps {
  id?: string;
  columns: readonly ColumnInfo[];
  value: string | undefined;
  onSelect: (id: string) => void;
  placeholder: string;
  ariaLabel: string;
  mode: EditorProps<unknown>['mode'];
  disabled?: boolean;
  /** Render the trigger as an icon-only "add" button. */
  compactAdd?: boolean;
  className?: string;
}

/** Popover + Command combobox shared by both pickers. */
function ColumnCombobox({
  id,
  columns,
  value,
  onSelect,
  placeholder,
  ariaLabel,
  mode,
  disabled,
  compactAdd,
  className,
}: ColumnComboboxProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size={mode === 'panel' ? 'default' : 'sm'}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'justify-between font-normal',
            compactAdd ? 'w-auto gap-1' : 'w-full min-w-0',
            className,
          )}
        >
          {compactAdd ? (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {mode !== 'inline' && <span>{placeholder}</span>}
            </>
          ) : value ? (
            <ColumnChip columnId={value} className="min-w-0 flex-1 text-left" />
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          {!compactAdd && <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search columns…" aria-label="Search columns" className="h-control-sm" />
          <CommandList>
            <CommandEmpty>No matching column</CommandEmpty>
            <CommandGroup>
              {columns.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  keywords={[c.header]}
                  onSelect={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <DataTypeGlyph dataType={c.dataType} />
                  <span className="truncate">{c.header}</span>
                  <span className="ml-auto truncate font-mono text-2xs text-muted-foreground">{c.id}</span>
                  {value === c.id && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// ColumnPicker — single column id
// ---------------------------------------------------------------------------

export type ColumnPickerProps = EditorProps<string>;

export function ColumnPicker(props: ColumnPickerProps) {
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
  const columns = useFilteredColumns(options);
  const locked = !!readOnly || !!disabled;
  const placeholder = typeof options?.placeholder === 'string' ? options.placeholder : 'Select column…';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div className="flex min-w-0 items-center gap-1">
        <ColumnCombobox
          id={id}
          columns={columns}
          value={value}
          onSelect={onChange}
          placeholder={placeholder}
          ariaLabel={label ?? 'Column'}
          mode={mode}
          disabled={locked}
        />
        {value !== undefined && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-control-sm w-control-sm shrink-0 px-0"
            aria-label="Clear column"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// ColumnsPicker — ordered list of column ids
// ---------------------------------------------------------------------------

export type ColumnsPickerProps = EditorProps<string[]>;

function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function ColumnsPicker(props: ColumnsPickerProps) {
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
  const columns = useFilteredColumns(options);
  const locked = !!readOnly || !!disabled;
  const selected = value ?? [];
  const max = typeof options?.max === 'number' ? options.max : undefined;
  const atMax = max !== undefined && selected.length >= max;
  const available = columns.filter((c) => !selected.includes(c.id));

  const emit = (next: string[]) => onChange(next.length === 0 ? undefined : next);
  const add = (colId: string) => {
    if (selected.includes(colId) || atMax) return;
    emit([...selected, colId]);
  };
  const remove = (index: number) => emit(selected.filter((_, i) => i !== index));
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= selected.length) return;
    emit(move(selected, from, to));
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (locked) return;
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      reorder(index, index - 1);
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      reorder(index, index + 1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(index);
    }
  };

  const btn = 'h-control-sm w-control-sm shrink-0 px-0';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div
        className={cn(
          'flex min-w-0 gap-1',
          mode === 'inline' ? 'flex-row flex-wrap items-center' : 'flex-col',
        )}
      >
        {selected.length > 0 && (
          <ul
            className={cn('flex min-w-0 gap-1', mode === 'inline' ? 'flex-row flex-wrap' : 'flex-col')}
            aria-label={label ? `${label} (selected)` : 'Selected columns'}
          >
            {selected.map((colId, i) => (
              <li
                key={colId}
                tabIndex={locked ? -1 : 0}
                aria-label={`${columns.find((c) => c.id === colId)?.header ?? colId}, position ${i + 1} of ${selected.length}`}
                onKeyDown={(e) => onRowKeyDown(e, i)}
                className={cn(
                  'flex items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-0.5 text-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
                  mode === 'inline' ? 'h-control-sm' : 'h-control',
                )}
              >
                <ColumnChip columnId={colId} className="min-w-0 flex-1" />
                {!locked && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={btn}
                      aria-label={`Move ${colId} up`}
                      disabled={i === 0}
                      onClick={() => reorder(i, i - 1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={btn}
                      aria-label={`Move ${colId} down`}
                      disabled={i === selected.length - 1}
                      onClick={() => reorder(i, i + 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={btn}
                      aria-label={`Remove ${colId}`}
                      onClick={() => remove(i)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!locked && (
          <div className="flex items-center gap-1">
            <ColumnCombobox
              id={id}
              columns={available}
              value={undefined}
              onSelect={add}
              placeholder="Add column"
              ariaLabel="Add column"
              mode={mode}
              disabled={atMax || available.length === 0}
              compactAdd
            />
            {max !== undefined && mode !== 'inline' && (
              <span className="text-2xs text-muted-foreground">
                {selected.length}/{max}
              </span>
            )}
          </div>
        )}
        {locked && selected.length === 0 && <span className="text-sm text-muted-foreground">No columns</span>}
      </div>
    </Field>
  );
}
