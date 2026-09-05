/**
 * ColorPicker — `x-editor: color`. Edits a `Color` string: a design token
 * (`var(--sg-…)`), hex, rgb()/hsl()/oklch(), or a named colour. Tokens come
 * first so users pick semantic colours that follow the theme; hex is a click
 * away for the odd bespoke case.
 *
 * ThemeColorPicker — `x-editor: themeColor`. Edits `ThemeColor` = Color |
 * { light, dark }; a toggle switches between one colour for both themes and a
 * pair.
 */
import { useId, useState } from 'react';
import { Pipette, X } from 'lucide-react';
import type { Color, ThemeColor } from '@smartgrid/schema';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@smartgrid/ui';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { controlSize } from '../lib/inputs.js';
import type { EditorMode, EditorProps, PositionedError } from '../types.js';

const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color)\(.+\)|var\(--[a-zA-Z0-9-]+\)|[a-zA-Z]+)$/;

/** Grey / accent swatches offered after the semantic tokens. */
export const SWATCHES: readonly string[] = [
  '#000000',
  '#ffffff',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
];

export function ColorSwatch({
  color,
  className,
  title,
  decorative,
}: {
  color: string | undefined;
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (title ?? color ?? 'no colour')}
      title={title ?? color}
      className={cn(
        'inline-block size-4 shrink-0 rounded-sm border border-border',
        !color &&
          'bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--sg-border)_3px,var(--sg-border)_4px)]',
        className,
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

export function ColorPicker({
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
  autoFocus,
  options,
}: EditorProps<Color>) {
  const ctx = useEditorContext();
  const autoId = useId();
  const inputId = id ?? autoId;
  /** `bare`: no Field chrome (nested inside another editor); `prefix`: text shown before the value. */
  const bare = options?.['bare'] === true;
  const prefix = typeof options?.['prefix'] === 'string' ? options['prefix'] : undefined;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value ?? '');
  }
  const tokens = ctx.colorTokens ?? [];
  const tokenLabel = tokens.find((t) => t.token === value)?.label;
  const valid = draft === '' || COLOR_RE.test(draft);

  const pick = (c: string | undefined) => {
    onChange(c);
    setOpen(false);
  };

  const Wrapper = bare ? BareField : Field;
  return (
    <Wrapper
      id={inputId}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1">
          <PopoverTrigger asChild>
            <Button
              id={inputId}
              type="button"
              variant="outline"
              size={mode === 'panel' ? 'default' : 'sm'}
              disabled={disabled || readOnly}
              autoFocus={autoFocus}
              className={cn(
                'justify-start gap-2 font-normal',
                mode === 'inline' ? 'min-w-9 px-2' : 'min-w-36',
              )}
              aria-label={
                label
                  ? `${label}: ${tokenLabel ?? value ?? 'none'}`
                  : `Colour ${tokenLabel ?? value ?? 'none'}`
              }
            >
              <ColorSwatch color={value} decorative />
              {mode !== 'inline' && (
                <span className="truncate text-xs">
                  {prefix && <span className="text-muted-foreground">{prefix} · </span>}
                  {tokenLabel ?? value ?? 'None'}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          {value && !readOnly && mode !== 'inline' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Clear colour"
              onClick={() => onChange(undefined)}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        <PopoverContent className="w-64 p-2" align="start">
          <Tabs defaultValue={value && !value.startsWith('var(') ? 'custom' : 'tokens'}>
            <TabsList className="mb-2 grid w-full grid-cols-2">
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
            <TabsContent value="tokens" className="m-0">
              <div className="grid grid-cols-2 gap-1" role="listbox" aria-label="Colour tokens">
                {tokens.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    role="option"
                    aria-selected={value === t.token}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent',
                      value === t.token && 'bg-accent ring-1 ring-ring',
                    )}
                    onClick={() => pick(t.token)}
                  >
                    <ColorSwatch color={t.token} decorative />
                    <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-10 gap-1" role="listbox" aria-label="Swatches">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="option"
                    aria-selected={value === c}
                    aria-label={c}
                    className={cn(
                      'size-5 rounded-sm border border-border',
                      value === c && 'ring-2 ring-ring',
                    )}
                    style={{ background: c }}
                    onClick={() => pick(c)}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent value="custom" className="m-0 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick colour"
                  className="size-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : '#000000'}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    onChange(e.target.value);
                  }}
                />
                <Input
                  aria-label="Colour value"
                  className={cn(controlSize('popover'), 'font-mono', !valid && 'border-destructive')}
                  placeholder="#rrggbb, rgba(), oklch(), var(--sg-…)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => valid && onChange(draft === '' ? undefined : draft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && valid) pick(draft === '' ? undefined : draft);
                  }}
                />
              </div>
              {typeof window !== 'undefined' && 'EyeDropper' in window && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={async () => {
                    try {
                      const dropper = new (
                        window as unknown as {
                          EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
                        }
                      ).EyeDropper();
                      const r = await dropper.open();
                      pick(r.sRGBHex);
                    } catch {
                      /* cancelled */
                    }
                  }}
                >
                  <Pipette className="size-3.5" /> Eyedropper
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </Wrapper>
  );
}

/** Stand-in for Field when an editor is nested inside another editor's chrome. */
function BareField({
  children,
  className,
}: {
  id?: string;
  label?: string;
  description?: string;
  mode?: EditorMode;
  errors?: readonly PositionedError[];
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('flex min-w-0 items-center gap-1', className)}>{children}</div>;
}

export function ThemeColorPicker(props: EditorProps<ThemeColor>) {
  const {
    value,
    onChange,
    mode = 'panel',
    readOnly,
    disabled,
    label,
    description,
    errors,
    id,
    className,
    options,
  } = props;
  const paired = typeof value === 'object' && value !== null;
  const light = paired ? value.light : value;
  const dark = paired ? value.dark : value;
  const bare = options?.['bare'] === true;
  const sub = mode === 'panel' ? 'popover' : mode;
  const Wrapper = bare ? BareField : Field;

  const setPaired = (p: boolean) => {
    if (p) onChange({ light: light ?? '#000000', dark: dark ?? '#ffffff' });
    else onChange(light);
  };

  return (
    <Wrapper
      id={id}
      label={label}
      description={description}
      mode={mode}
      errors={errors}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!paired ? (
          <ColorPicker
            value={light}
            onChange={(c) => onChange(c)}
            mode={sub}
            readOnly={readOnly}
            disabled={disabled}
            label={label ?? 'Colour'}
            options={{ bare: true }}
          />
        ) : (
          <>
            <ColorPicker
              value={light}
              onChange={(c) => onChange({ light: c ?? '#000000', dark: dark ?? '#ffffff' })}
              mode={sub}
              readOnly={readOnly}
              disabled={disabled}
              label={`${label ?? 'Colour'} (light)`}
              options={{ bare: true, prefix: 'Light' }}
            />
            <ColorPicker
              value={dark}
              onChange={(c) => onChange({ light: light ?? '#000000', dark: c ?? '#ffffff' })}
              mode={sub}
              readOnly={readOnly}
              disabled={disabled}
              label={`${label ?? 'Colour'} (dark)`}
              options={{ bare: true, prefix: 'Dark' }}
            />
          </>
        )}
        {!readOnly && (
          <button
            type="button"
            className="text-2xs text-muted-foreground underline-offset-2 hover:underline"
            aria-pressed={paired}
            onClick={() => setPaired(!paired)}
          >
            {paired ? 'Same for both themes' : 'Per theme'}
          </button>
        )}
      </div>
    </Wrapper>
  );
}
