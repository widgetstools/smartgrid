/**
 * IconPicker — `x-editor: 'icon'`.
 *
 * Edits the schema `Icon` union:
 *   `{ kind: 'system', name, size? } | { kind: 'image', src, size? } | { kind: 'emoji', value }`.
 *
 * The popover trigger shows the current icon (system icons render their
 * SVG from `context.icons`, images as <img>, emoji as text). The popover
 * has three tabs: System (searchable grid of `context.icons` grouped by
 * category), Emoji (curated finance/status list plus free text) and Image
 * (URL input, optional file upload converted to a data URI with a 64 KB
 * cap, preview). A size stepper (8–64 px) applies to system and image
 * icons. A clear button emits `undefined`.
 *
 * Also exports `IconPreview` for rendering an `Icon` anywhere.
 */
import { useId, useMemo, useRef, useState } from 'react';
import type { Icon } from '@smartgrid/schema';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@smartgrid/ui';
import { ChevronDown, Minus, Plus, Upload, X } from 'lucide-react';
import { useEditorContext } from '../context.js';
import { Field } from '../lib/Field.js';
import { TextInput } from '../lib/inputs.js';
import { humanize } from '../lib/util.js';
import type { EditorProps } from '../types.js';
import { IMAGE_MAX_BYTES, formatBytes, readImageAsDataUri } from './ImagePicker.js';

export const ICON_MIN_SIZE = 8;
export const ICON_MAX_SIZE = 64;
export const ICON_DEFAULT_SIZE = 16;

/** Curated emoji for trading / status use: trends, money, signals, time. */
export const CURATED_EMOJI: readonly string[] = [
  '📈',
  '📉',
  '📊',
  '💹',
  '💰',
  '💵',
  '💶',
  '💷',
  '💴',
  '💱',
  '💲',
  '🏦',
  '💳',
  '🧾',
  '🪙',
  '🐂',
  '🐻',
  '🚀',
  '🔥',
  '❄️',
  '⚡',
  '💡',
  '🎯',
  '🏁',
  '🚩',
  '⭐',
  '✨',
  '✅',
  '❌',
  '⛔',
  '🚫',
  '⚠️',
  '❗',
  '❓',
  '✔️',
  '✖️',
  '➕',
  '➖',
  '🔴',
  '🟠',
  '🟡',
  '🟢',
  '🔵',
  '🟣',
  '⚪',
  '⚫',
  '🟥',
  '🟧',
  '🟨',
  '🟩',
  '🟦',
  '🟪',
  '⬜',
  '⬛',
  '⬆️',
  '⬇️',
  '➡️',
  '⬅️',
  '↗️',
  '↘️',
  '🔺',
  '🔻',
  '▶️',
  '⏸️',
  '⏹️',
  '🔄',
  '🔁',
  '🔔',
  '🔕',
  '🔒',
  '🔓',
  '🔑',
  '⏰',
  '⏳',
  '⌛',
  '📅',
  '📆',
  '🕐',
  '📌',
  '📍',
  '🏷️',
  '📦',
  '✉️',
  '📣',
  '👍',
  '👎',
  '🧮',
  '📋',
];

// ---------------------------------------------------------------------------
// IconPreview
// ---------------------------------------------------------------------------

export interface IconPreviewProps {
  icon: Icon | undefined;
  /** Pixel size; defaults to the icon's own `size` or 16. */
  size?: number;
  className?: string;
}

/** Renders an `Icon` value at its size: system SVG from context, image, or emoji text. */
export function IconPreview({ icon, size, className }: IconPreviewProps) {
  const { icons } = useEditorContext();
  if (!icon) return null;
  const px = size ?? ('size' in icon && icon.size ? icon.size : ICON_DEFAULT_SIZE);
  const style = { width: px, height: px, fontSize: px * 0.85, lineHeight: `${px}px` };
  if (icon.kind === 'emoji') {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        style={style}
        aria-label={`Emoji ${icon.value}`}
        role="img"
      >
        {icon.value}
      </span>
    );
  }
  if (icon.kind === 'image') {
    return (
      <img src={icon.src} alt="" className={cn('inline-block object-contain', className)} style={style} />
    );
  }
  const svg = icons.find((i) => i.name === icon.name)?.svg;
  if (!svg) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-sm bg-muted font-mono text-2xs text-muted-foreground',
          className,
        )}
        style={style}
        title={icon.name}
        aria-label={`Icon ${icon.name}`}
        role="img"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center text-foreground [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-current [&>svg]:stroke-current',
        className,
      )}
      style={style}
      role="img"
      aria-label={`Icon ${icon.name}`}
      data-icon-name={icon.name}
      // Icon markup is host-provided (context.icons), not user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function iconLabel(icon: Icon | undefined): string {
  if (!icon) return '';
  if (icon.kind === 'system') return humanize(icon.name);
  if (icon.kind === 'emoji') return icon.value;
  return icon.src.startsWith('data:') ? 'Uploaded image' : icon.src.replace(/^https?:\/\//, '');
}

const clampSize = (n: number) => Math.min(ICON_MAX_SIZE, Math.max(ICON_MIN_SIZE, Math.round(n)));

// ---------------------------------------------------------------------------
// IconPicker
// ---------------------------------------------------------------------------

export type IconPickerProps = EditorProps<Icon>;

export function IconPicker(props: IconPickerProps) {
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
  const { icons } = useEditorContext();
  const locked = !!readOnly || !!disabled;
  const maxBytes = typeof options?.maxBytes === 'number' ? options.maxBytes : IMAGE_MAX_BYTES;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Icon['kind']>(value?.kind ?? 'system');
  const [query, setQuery] = useState('');
  const [imageError, setImageError] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);

  const size = value && 'size' in value ? value.size : undefined;
  const withSize = <T extends { kind: 'system' | 'image' }>(icon: T): T & { size?: number } =>
    size === undefined ? icon : { ...icon, size };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, typeof icons>();
    for (const i of icons) {
      if (q && !i.name.toLowerCase().includes(q) && !i.category.toLowerCase().includes(q)) continue;
      const list = map.get(i.category) ?? [];
      map.set(i.category, [...list, i]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [icons, query]);

  const setSize = (n: number) => {
    if (!value || value.kind === 'emoji') return;
    onChange({ ...value, size: clampSize(n) });
  };
  const currentSize = size ?? ICON_DEFAULT_SIZE;

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await readImageAsDataUri(file, maxBytes);
      setImageError(undefined);
      onChange(withSize({ kind: 'image', src }));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e));
    }
  };

  const gridBtn =
    'flex h-8 w-8 items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-accent';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div className="flex min-w-0 items-center gap-1">
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) setTab(value?.kind ?? 'system');
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              size={mode === 'panel' ? 'default' : 'sm'}
              aria-label={label ?? 'Icon'}
              aria-expanded={open}
              disabled={locked}
              className={cn('justify-between gap-2 font-normal', mode === 'inline' ? 'w-auto' : 'w-full')}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                {value ? (
                  <IconPreview icon={value} size={16} />
                ) : (
                  <span className="text-muted-foreground">No icon</span>
                )}
                {mode !== 'inline' && value && <span className="truncate text-sm">{iconLabel(value)}</span>}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="start">
            <Tabs value={tab} onValueChange={(t) => setTab(t as Icon['kind'])}>
              <TabsList className="w-full">
                <TabsTrigger value="system" className="flex-1">
                  System
                </TabsTrigger>
                <TabsTrigger value="emoji" className="flex-1">
                  Emoji
                </TabsTrigger>
                <TabsTrigger value="image" className="flex-1">
                  Image
                </TabsTrigger>
              </TabsList>

              <TabsContent value="system" className="flex flex-col gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search icons…"
                  aria-label="Search icons"
                  className="h-control-sm text-sm"
                />
                <ScrollArea className="h-48">
                  {groups.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">No matching icon</p>
                  )}
                  {groups.map(([category, list]) => (
                    <div key={category} className="mb-2">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {humanize(category)}
                      </p>
                      <div
                        className="flex flex-wrap gap-1"
                        role="group"
                        aria-label={`${humanize(category)} icons`}
                      >
                        {list.map((i) => (
                          <button
                            key={i.name}
                            type="button"
                            title={i.name}
                            aria-label={i.name}
                            aria-pressed={value?.kind === 'system' && value.name === i.name}
                            className={gridBtn}
                            onClick={() => {
                              onChange(withSize({ kind: 'system', name: i.name }));
                              setOpen(false);
                            }}
                          >
                            <IconPreview icon={{ kind: 'system', name: i.name }} size={16} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="emoji" className="flex flex-col gap-2">
                <ScrollArea className="h-40">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Emoji">
                    {CURATED_EMOJI.map((e) => (
                      <button
                        key={e}
                        type="button"
                        aria-label={`Emoji ${e}`}
                        aria-pressed={value?.kind === 'emoji' && value.value === e}
                        className={cn(gridBtn, 'text-base')}
                        onClick={() => {
                          onChange({ kind: 'emoji', value: e });
                          setOpen(false);
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                <TextInput
                  value={value?.kind === 'emoji' ? value.value : undefined}
                  onChange={(v) =>
                    onChange(v === undefined ? undefined : { kind: 'emoji', value: v.slice(0, 8) })
                  }
                  placeholder="Or type an emoji…"
                  mode="inline"
                  maxLength={8}
                />
              </TabsContent>

              <TabsContent value="image" className="flex flex-col gap-2">
                {imageError && (
                  <p className="text-2xs text-destructive" role="alert">
                    {imageError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                    {value?.kind === 'image' ? (
                      <IconPreview icon={value} size={32} />
                    ) : (
                      <span className="text-2xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <TextInput
                    value={value?.kind === 'image' ? value.src : undefined}
                    onChange={(v) =>
                      onChange(v === undefined ? undefined : withSize({ kind: 'image', src: v }))
                    }
                    placeholder="https://… or data:"
                    mode="inline"
                    mono
                    className="min-w-0 flex-1"
                  />
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Upload icon image"
                  onChange={(e) => {
                    void takeFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 self-start"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload (max {formatBytes(maxBytes)})
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <div className="flex items-center gap-1" role="group" aria-label="Icon size">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-control-sm w-control-sm px-0"
                  aria-label="Smaller"
                  disabled={!value || value.kind === 'emoji' || currentSize <= ICON_MIN_SIZE}
                  onClick={() => setSize(currentSize - 2)}
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <span className="w-10 text-center font-mono text-xs tabular-nums" aria-live="polite">
                  {value && value.kind !== 'emoji' ? `${currentSize}px` : '—'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-control-sm w-control-sm px-0"
                  aria-label="Larger"
                  disabled={!value || value.kind === 'emoji' || currentSize >= ICON_MAX_SIZE}
                  onClick={() => setSize(currentSize + 2)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!value}
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {value !== undefined && !locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-control-sm w-control-sm shrink-0 px-0"
            aria-label="Clear icon"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </Field>
  );
}
