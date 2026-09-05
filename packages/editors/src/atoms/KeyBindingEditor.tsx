/**
 * KeyBindingEditor — `x-editor: 'keys'`.
 *
 * Edits the schema `KeyBinding` (`{ key, ctrl, shift, alt, meta }`). A
 * "Press keys" capture button records the next keydown (pure modifier
 * presses are ignored; Escape cancels capture), modifier chips toggle each
 * flag on an existing binding, and the binding is shown as a readable
 * label such as "Shift+K". A clear button emits `undefined`.
 *
 * Exports `formatKeyBinding(kb)` and `normaliseKey(key)`.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import type { KeyBinding } from '@smartgrid/schema';
import { Button, ToggleGroup, ToggleGroupItem, cn } from '@smartgrid/ui';
import { Keyboard, X } from 'lucide-react';
import { Field } from '../lib/Field.js';
import type { EditorProps } from '../types.js';

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'Hyper',
  'Super',
  'OS',
]);

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Enter: 'Enter',
  Tab: 'Tab',
};

type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta';
const MODIFIERS: readonly { id: Modifier; label: string }[] = [
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt' },
  { id: 'shift', label: 'Shift' },
  { id: 'meta', label: 'Meta' },
];

/** Canonical stored form of a `KeyboardEvent.key`: single letters upper-cased, everything else verbatim. */
export function normaliseKey(key: string): string {
  return key.length === 1 && /[a-z]/i.test(key) ? key.toUpperCase() : key;
}

/** "Ctrl+Alt+Shift+Meta+Key" in a fixed modifier order; returns '' for `undefined`. */
export function formatKeyBinding(kb: KeyBinding | undefined): string {
  if (!kb) return '';
  const parts: string[] = [];
  if (kb.ctrl) parts.push('Ctrl');
  if (kb.alt) parts.push('Alt');
  if (kb.shift) parts.push('Shift');
  if (kb.meta) parts.push('Meta');
  parts.push(KEY_LABELS[kb.key] ?? normaliseKey(kb.key));
  return parts.join('+');
}

export type KeyBindingEditorProps = EditorProps<KeyBinding>;

export function KeyBindingEditor(props: KeyBindingEditorProps) {
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
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const locked = !!readOnly || !!disabled;
  const [capturing, setCapturing] = useState(false);

  const onCaptureKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (MODIFIER_KEYS.has(e.key)) return;
    if (e.key === 'Escape') {
      setCapturing(false);
      return;
    }
    onChange({
      key: normaliseKey(e.key),
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    });
    setCapturing(false);
  };

  const activeModifiers = value ? MODIFIERS.filter((m) => value[m.id]).map((m) => m.id) : [];
  const setModifiers = (ids: string[]) => {
    if (!value) return;
    const set = new Set(ids);
    onChange({
      ...value,
      ctrl: set.has('ctrl'),
      alt: set.has('alt'),
      shift: set.has('shift'),
      meta: set.has('meta'),
    });
  };

  const inline = mode === 'inline';

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div
        className={cn('flex min-w-0 gap-1', inline ? 'flex-row flex-wrap items-center' : 'flex-col gap-2')}
      >
        <div className="flex min-w-0 items-center gap-1">
          <Button
            id={id}
            type="button"
            variant="outline"
            size={mode === 'panel' ? 'default' : 'sm'}
            aria-label={capturing ? 'Press a key combination' : (label ?? 'Key binding')}
            aria-pressed={capturing}
            disabled={locked}
            className={cn(
              'justify-start gap-2 font-normal',
              capturing && 'ring-1 ring-ring',
              inline ? 'w-auto min-w-24' : 'w-full',
            )}
            onClick={() => setCapturing((c) => !c)}
            onKeyDown={onCaptureKeyDown}
            onBlur={() => setCapturing(false)}
          >
            <Keyboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {capturing ? (
              <span className="text-muted-foreground">Press keys…</span>
            ) : value ? (
              <kbd className="rounded-sm border border-border bg-muted px-1.5 font-mono text-xs">
                {formatKeyBinding(value)}
              </kbd>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </Button>
          {value !== undefined && !locked && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-control-sm w-control-sm shrink-0 px-0"
              aria-label="Clear key binding"
              onClick={() => onChange(undefined)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={activeModifiers}
          onValueChange={setModifiers}
          disabled={locked || !value}
          aria-label="Modifiers"
          className="justify-start gap-1"
        >
          {MODIFIERS.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} aria-label={m.label} className="h-6 px-2 text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </Field>
  );
}
