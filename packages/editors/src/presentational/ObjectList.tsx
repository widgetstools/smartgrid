/**
 * ObjectList — the one list used for every config object collection
 * (format columns, calculated columns, alerts, layouts, …). Rows show a
 * host-provided summary; the list owns selection, enable toggles, reorder,
 * duplicate and remove. Editing the selected item is the host's job (a
 * generated form or a composite editor), so the list stays generic.
 */
import { useId } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Switch, cn } from '@smartgrid/ui';
import { uid } from '../lib/util.js';
import type { EditorMode } from '../types.js';

export interface ObjectSummary {
  title: string;
  subtitle?: string;
  badges?: readonly string[];
  /** Small leading element (a colour swatch, an icon). */
  leading?: React.ReactNode;
}

export interface ObjectListProps<T extends { id: string; enabled?: boolean }> {
  items: readonly T[];
  onChange: (items: T[]) => void;
  summarize: (item: T, index: number) => ObjectSummary;
  /** Creates a new item; return undefined to cancel. */
  create?: () => T | undefined;
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  mode?: EditorMode;
  readOnly?: boolean;
  /** Show the enabled switch (items must carry `enabled`). */
  toggleable?: boolean;
  reorderable?: boolean;
  addLabel?: string;
  emptyText?: string;
  className?: string;
  /** Ids of items that currently fail validation. */
  invalidIds?: readonly string[];
}

export function ObjectList<T extends { id: string; enabled?: boolean }>({
  items,
  onChange,
  summarize,
  create,
  selectedId,
  onSelect,
  mode = 'panel',
  readOnly,
  toggleable = true,
  reorderable = true,
  addLabel = 'Add',
  emptyText = 'Nothing here yet.',
  className,
  invalidIds,
}: ObjectListProps<T>) {
  const listId = useId();
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(j, 0, it as T);
    onChange(next);
  };
  const remove = (i: number) => {
    const it = items[i];
    onChange(items.filter((_, k) => k !== i));
    if (it && it.id === selectedId) onSelect?.(undefined);
  };
  const duplicate = (i: number) => {
    const it = items[i];
    if (!it) return;
    const copy = { ...it, id: uid() } as T;
    const next = [...items];
    next.splice(i + 1, 0, copy);
    onChange(next);
    onSelect?.(copy.id);
  };
  const add = () => {
    const it = create?.();
    if (!it) return;
    onChange([...items, it]);
    onSelect?.(it.id);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid="object-list">
      {items.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">{emptyText}</p>}
      <ul id={listId} role="listbox" aria-label="Items" className="flex flex-col gap-0.5">
        {items.map((it, i) => {
          const s = summarize(it, i);
          const selected = it.id === selectedId;
          const invalid = invalidIds?.includes(it.id);
          const disabled = toggleable && it.enabled === false;
          return (
            <li
              key={it.id}
              role="option"
              aria-selected={selected}
              data-id={it.id}
              tabIndex={0}
              onClick={() => onSelect?.(selected ? undefined : it.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(selected ? undefined : it.id);
                } else if (!readOnly && reorderable && e.altKey && e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, -1);
                } else if (!readOnly && reorderable && e.altKey && e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, 1);
                } else if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace')) {
                  e.preventDefault();
                  remove(i);
                }
              }}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm outline-hidden hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring',
                selected && 'border-border bg-accent',
                invalid && 'border-destructive/60',
                disabled && 'opacity-60',
                mode !== 'panel' && 'py-0.5 text-xs',
              )}
            >
              {toggleable && (
                <Switch
                  aria-label={`${s.title} enabled`}
                  checked={it.enabled !== false}
                  disabled={readOnly}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(on) =>
                    onChange(items.map((x, k) => (k === i ? { ...x, enabled: on } : x)))
                  }
                  className="scale-75"
                />
              )}
              {s.leading}
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className={cn('truncate font-medium', invalid && 'text-destructive')}>{s.title}</span>
                {s.subtitle && <span className="truncate text-2xs text-muted-foreground">{s.subtitle}</span>}
              </span>
              {s.badges?.map((b) => (
                <Badge key={b} variant="secondary" className="h-4 px-1 text-2xs font-normal">
                  {b}
                </Badge>
              ))}
              {!readOnly && (
                <span className="flex shrink-0 items-center gap-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  {reorderable && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={(e) => (e.stopPropagation(), move(i, -1))}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label="Move down"
                        disabled={i === items.length - 1}
                        onClick={(e) => (e.stopPropagation(), move(i, 1))}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Duplicate"
                    onClick={(e) => (e.stopPropagation(), duplicate(i))}
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive"
                    aria-label="Remove"
                    onClick={(e) => (e.stopPropagation(), remove(i))}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && create && (
        <Button type="button" variant="outline" size="sm" className="mt-1 w-fit gap-1 text-xs" onClick={add}>
          <Plus className="size-3.5" /> {addLabel}
        </Button>
      )}
    </div>
  );
}
