/**
 * DensityPicker — `x-editor: 'density'`.
 *
 * Segmented toggle over the grid row density: `ultra` / `compact` /
 * `comfort`, each with a label and a rows glyph. Clicking the active
 * segment keeps it selected unless `options.allowClear` is true, in which
 * case the value is cleared (`undefined`).
 */
import { useId } from 'react';
import { ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { Rows2, Rows3, Rows4 } from 'lucide-react';
import { Field } from '../lib/Field.js';
import type { EditorProps } from '../types.js';

export type Density = 'ultra' | 'compact' | 'comfort';

export const DENSITY_OPTIONS: readonly { value: Density; label: string; description: string }[] = [
  { value: 'ultra', label: 'Ultra', description: 'Tightest rows for dense blotters' },
  { value: 'compact', label: 'Compact', description: 'Standard trading density' },
  { value: 'comfort', label: 'Comfort', description: 'Relaxed rows for reading' },
];

const GLYPH = { ultra: Rows4, compact: Rows3, comfort: Rows2 } as const;

export type DensityPickerProps = EditorProps<Density>;

export function DensityPicker(props: DensityPickerProps) {
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
  const allowClear = options?.allowClear === true;

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        size={mode === 'panel' ? 'default' : 'sm'}
        value={value ?? ''}
        disabled={locked}
        aria-label={label ?? 'Density'}
        className="justify-start gap-0 rounded-md"
        onValueChange={(v) => {
          if (v === '') {
            if (allowClear) onChange(undefined);
            return;
          }
          onChange(v as Density);
        }}
      >
        {DENSITY_OPTIONS.map((o) => {
          const Glyph = GLYPH[o.value];
          return (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              aria-label={o.label}
              title={o.description}
              className={cn(
                'gap-1.5 rounded-none first:rounded-l-md last:rounded-r-md -ml-px first:ml-0',
                mode === 'inline' && 'px-2',
              )}
            >
              <Glyph className="h-3.5 w-3.5" aria-hidden />
              {mode !== 'inline' && <span>{o.label}</span>}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </Field>
  );
}
