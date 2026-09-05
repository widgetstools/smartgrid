/**
 * Style atoms:
 *  - BorderEditor      `x-editor: border`     per-side width/style/colour + radius
 *  - FontStyleEditor   `x-editor: fontStyle`  size, weight, italic, decoration, family
 *  - AlignmentPicker   `x-editor: alignment`  horizontal + vertical
 *  - StyleEditor       `x-editor: style`      the composite used by format columns,
 *                                             flashing, alerts and quick search
 */
import { useId, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  FoldVertical,
  Italic,
  Strikethrough,
  Underline,
} from 'lucide-react';
import type { Alignment, Border, BorderSide, FontStyle, Style, ThemeColor } from '@smartgrid/schema';
import { Button, ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { EnumSelect, NumberInput, TextInput } from '../lib/inputs.js';
import { setKey } from '../lib/util.js';
import type { EditorMode, EditorProps } from '../types.js';
import { ThemeColorPicker } from './ColorPicker.js';
import { PreviewCell } from '../presentational/PreviewCell.js';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
type Side = (typeof SIDES)[number];
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'] as const;

function pickerMode(mode: EditorMode): EditorMode {
  return mode === 'panel' ? 'popover' : mode;
}

export function BorderEditor({
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
}: EditorProps<Border>) {
  const [side, setSide] = useState<Side | 'all'>('all');
  const current: BorderSide | undefined =
    side === 'all' ? (value?.top ?? value?.bottom ?? value?.left ?? value?.right) : value?.[side];

  const apply = (patch: Partial<BorderSide> | undefined) => {
    const targets: Side[] = side === 'all' ? [...SIDES] : [side];
    let next: Border | undefined = value;
    for (const s of targets) {
      const merged =
        patch === undefined
          ? undefined
          : { width: 1, style: 'solid' as const, ...(next?.[s] ?? {}), ...patch };
      next = setKey(next, s, merged as BorderSide | undefined);
    }
    onChange(next);
  };

  const ro = readOnly || disabled;
  return (
    <Field id={id} label={label} description={description} mode={mode} errors={errors} className={className}>
      <div className={cn('flex flex-wrap items-center gap-1.5', mode === 'panel' && 'gap-2')}>
        <ToggleGroup
          type="single"
          size="sm"
          value={side}
          onValueChange={(v) => v && setSide(v as Side | 'all')}
          aria-label="Border side"
        >
          <ToggleGroupItem value="all" aria-label="All sides" className="px-2 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="top" aria-label="Top">
            <ArrowUpToLine className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="bottom" aria-label="Bottom">
            <ArrowDownToLine className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="left" aria-label="Left" className="px-2 text-xs">
            L
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Right" className="px-2 text-xs">
            R
          </ToggleGroupItem>
        </ToggleGroup>
        <NumberInput
          aria-label="Border width"
          value={current?.width}
          onChange={(w) => apply({ width: w ?? 1 })}
          min={0}
          max={8}
          integer
          mode={mode}
          disabled={ro}
          className="w-16"
          suffix="px"
        />
        <EnumSelect
          aria-label="Border style"
          value={current?.style}
          onChange={(s) => apply({ style: s ?? 'solid' })}
          options={BORDER_STYLES.map((s) => ({ value: s }))}
          mode={mode}
          disabled={ro}
          className="w-24"
        />
        <ThemeColorPicker
          value={current?.color}
          onChange={(c) => apply({ color: c })}
          mode={pickerMode(mode)}
          readOnly={ro}
          label="Border colour"
        />
        {mode !== 'inline' && (
          <NumberInput
            aria-label="Corner radius"
            value={value?.radius}
            onChange={(r) => onChange(setKey(value, 'radius', r))}
            min={0}
            max={32}
            integer
            mode={mode}
            disabled={ro}
            className="w-16"
            suffix="r"
          />
        )}
        {value && !ro && (
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
    </Field>
  );
}

const FONT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const FONT_WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;

export function FontStyleEditor({
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
}: EditorProps<FontStyle>) {
  const ro = readOnly || disabled;
  const set = <K extends keyof FontStyle>(k: K, v: FontStyle[K] | undefined) => onChange(setKey(value, k, v));
  const toggles: string[] = [];
  if (value?.weight === 'bold' || value?.weight === 'semibold') toggles.push('bold');
  if (value?.italic) toggles.push('italic');
  if (value?.decoration === 'underline') toggles.push('underline');
  if (value?.decoration === 'lineThrough') toggles.push('lineThrough');

  return (
    <Field id={id} label={label} description={description} mode={mode} errors={errors} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          type="multiple"
          size="sm"
          value={toggles}
          disabled={ro}
          aria-label="Font style"
          onValueChange={(next) => {
            const has = (t: string) => next.includes(t);
            let v = value;
            v = setKey(
              v,
              'weight',
              has('bold') ? (value?.weight === 'semibold' ? 'semibold' : 'bold') : undefined,
            );
            v = setKey(v, 'italic', has('italic') ? true : undefined);
            v = setKey(
              v,
              'decoration',
              has('lineThrough') && !toggles.includes('lineThrough')
                ? 'lineThrough'
                : has('underline') && !toggles.includes('underline')
                  ? 'underline'
                  : has('underline')
                    ? 'underline'
                    : has('lineThrough')
                      ? 'lineThrough'
                      : undefined,
            );
            onChange(v);
          }}
        >
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <Underline className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="lineThrough" aria-label="Strikethrough">
            <Strikethrough className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <EnumSelect
          aria-label="Font size"
          value={typeof value?.size === 'string' ? value.size : undefined}
          onChange={(s) => set('size', s)}
          options={FONT_SIZES.map((s) => ({ value: s }))}
          placeholder="Size"
          mode={mode}
          disabled={ro}
          allowClear
          className="w-20"
        />
        {mode === 'panel' && (
          <>
            <EnumSelect
              aria-label="Font weight"
              value={value?.weight}
              onChange={(w) => set('weight', w)}
              options={FONT_WEIGHTS.map((w) => ({ value: w }))}
              placeholder="Weight"
              mode={mode}
              disabled={ro}
              allowClear
              className="w-28"
            />
            <EnumSelect
              aria-label="Font family"
              value={value?.family}
              onChange={(f) => set('family', f)}
              options={[
                { value: 'sans', label: 'Sans' },
                { value: 'mono', label: 'Mono' },
              ]}
              placeholder="Family"
              mode={mode}
              disabled={ro}
              allowClear
              className="w-24"
            />
          </>
        )}
      </div>
    </Field>
  );
}

export function AlignmentPicker({
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
}: EditorProps<Alignment>) {
  const ro = readOnly || disabled;
  const showVertical = options?.['vertical'] !== false && mode !== 'inline';
  return (
    <Field id={id} label={label} description={description} mode={mode} errors={errors} className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={value?.horizontal ?? ''}
          disabled={ro}
          aria-label="Horizontal alignment"
          onValueChange={(h) =>
            onChange(setKey(value, 'horizontal', (h || undefined) as Alignment['horizontal']))
          }
        >
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">
            <AlignCenter className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">
            <AlignRight className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify">
            <AlignJustify className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        {showVertical && (
          <ToggleGroup
            type="single"
            size="sm"
            value={value?.vertical ?? ''}
            disabled={ro}
            aria-label="Vertical alignment"
            onValueChange={(v) =>
              onChange(setKey(value, 'vertical', (v || undefined) as Alignment['vertical']))
            }
          >
            <ToggleGroupItem value="top" aria-label="Align top">
              <ArrowUpToLine className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="middle" aria-label="Align middle">
              <FoldVertical className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="bottom" aria-label="Align bottom">
              <ArrowDownToLine className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </Field>
  );
}

/**
 * Full Style editor. `inline` shows a colour pair + font toggles + alignment in
 * one strip; `panel` adds border, class name, padding, opacity and a live
 * preview cell.
 */
export function StyleEditor({
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
}: EditorProps<Style>) {
  const ctx = useEditorContext();
  const ro = readOnly || disabled;
  const autoId = useId();
  const set = <K extends keyof Style>(k: K, v: Style[K] | undefined) => onChange(setKey(value, k, v));
  const sub = pickerMode(mode);
  const sample = (options?.['sample'] as unknown) ?? -1234.5;

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
        <div className="flex flex-wrap items-center gap-1.5">
          <ThemeColorPicker
            value={value?.foreColor}
            onChange={(c) => set('foreColor', c as ThemeColor | undefined)}
            mode={sub}
            readOnly={ro}
            label="Text"
          />
          <ThemeColorPicker
            value={value?.backColor}
            onChange={(c) => set('backColor', c as ThemeColor | undefined)}
            mode={sub}
            readOnly={ro}
            label="Fill"
          />
          <FontStyleEditor
            value={value?.font}
            onChange={(f) => set('font', f)}
            mode="inline"
            readOnly={ro}
            label="Font"
          />
          <AlignmentPicker
            value={value?.alignment}
            onChange={(a) => set('alignment', a)}
            mode="inline"
            readOnly={ro}
            label="Alignment"
          />
        </div>
        {mode !== 'inline' && (
          <>
            <BorderEditor
              value={value?.border}
              onChange={(b) => set('border', b)}
              mode={mode}
              readOnly={ro}
              label="Border"
            />
            <div className="flex flex-wrap items-end gap-2">
              <Field id={`${autoId}-padding`} label="Padding" mode={mode}>
                <NumberInput
                  id={`${autoId}-padding`}
                  value={value?.padding}
                  onChange={(p) => set('padding', p)}
                  min={0}
                  max={32}
                  integer
                  mode={mode}
                  disabled={ro}
                  className="w-20"
                  suffix="px"
                />
              </Field>
              <Field id={`${autoId}-opacity`} label="Opacity" mode={mode}>
                <NumberInput
                  id={`${autoId}-opacity`}
                  value={value?.opacity}
                  onChange={(o) => set('opacity', o)}
                  min={0}
                  max={1}
                  step={0.05}
                  mode={mode}
                  disabled={ro}
                  className="w-20"
                />
              </Field>
              {(ctx.styleClassNames?.length ?? 0) > 0 ? (
                <Field id={`${autoId}-class`} label="CSS class" mode={mode}>
                  <EnumSelect
                    id={`${autoId}-class`}
                    value={value?.className}
                    onChange={(c) => set('className', c)}
                    options={(ctx.styleClassNames ?? []).map((c) => ({ value: c }))}
                    mode={mode}
                    disabled={ro}
                    allowClear
                    className="w-40"
                  />
                </Field>
              ) : (
                <Field id={`${autoId}-class`} label="CSS class" mode={mode}>
                  <TextInput
                    id={`${autoId}-class`}
                    value={value?.className}
                    onChange={(c) => set('className', c)}
                    mode={mode}
                    readOnly={ro}
                    className="w-40"
                    commit="blur"
                    mono
                  />
                </Field>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xs text-muted-foreground">Preview</span>
              <PreviewCell style={value} value={sample} theme={ctx.theme} className="w-40" />
              {value && !ro && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => onChange(undefined)}
                >
                  Clear style
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Field>
  );
}
