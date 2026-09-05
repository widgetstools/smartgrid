/**
 * Generic customizer tab for any module whose data is a list of objects
 * (calculated columns, styled columns, flashing cells, alerts, named
 * queries). The form comes straight from the module's JSON Schema; the
 * only per-module code is a summary line and a factory for new items.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { compare, type Operation } from 'fast-json-patch';
import type { ModuleId, TypedGridConfig } from '@smartgrid/schema';
import { moduleJsonSchema, type z } from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import { ObjectList, type ObjectSummary, type PositionedError } from '@smartgrid/editors';
import { SchemaForm, itemsOf, propertiesOf, type SchemaNode } from '@smartgrid/forms';
import { useDebouncedDraft } from './useDebouncedDraft.js';

export interface ModuleObjectsTabProps<T extends { id: string; name: string; enabled?: boolean }> {
  store: ConfigStore;
  config: TypedGridConfig;
  moduleId: ModuleId;
  /** Property of the module data holding the list. */
  listKey: string;
  /** Zod schema of one item, for live validation. */
  itemSchema: z.ZodTypeAny;
  items: readonly T[];
  summarize: (item: T) => ObjectSummary;
  create: () => T;
  addLabel: string;
  emptyText?: string;
  /** Extra content above the list (e.g. quick search form). */
  header?: ReactNode;
}

function prefixed(base: string, ops: Operation[]): Operation[] {
  return ops.map(
    (op) => ({ ...op, path: base + op.path, ...('from' in op ? { from: base + op.from } : {}) }) as Operation,
  );
}

export function ModuleObjectsTab<T extends { id: string; name: string; enabled?: boolean }>({
  store,
  config,
  moduleId,
  listKey,
  itemSchema,
  items,
  summarize,
  create,
  addLabel,
  emptyText,
  header,
}: ModuleObjectsTabProps<T>) {
  const basePath = `/modules/${moduleId}/data/${listKey}`;
  const itemNode = useMemo<SchemaNode>(() => {
    const mod = moduleJsonSchema(moduleId);
    return itemsOf(propertiesOf(mod)[listKey] ?? {}) ?? {};
  }, [moduleId, listKey]);
  const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.id);
  const [errors, setErrors] = useState<PositionedError[]>([]);
  const applyList = (prev: unknown, next: unknown, path = basePath) => {
    const ops = prefixed(path, compare(prev as object, next as object));
    if (ops.length) void store.apply(ops, { origin: 'form' });
  };
  const stored = items.find((i) => i.id === selectedId);
  const [draft, update] = useDebouncedDraft<T>(stored, (prev, next) =>
    applyList(prev, next, `${basePath}/${items.indexOf(prev)}`),
  );
  void config;

  return (
    <div className="flex flex-col gap-3 p-3">
      {header}
      <ObjectList
        items={items}
        onChange={(next) => applyList(items, next)}
        summarize={summarize}
        selectedId={selectedId}
        onSelect={setSelectedId}
        create={create}
        addLabel={addLabel}
        emptyText={emptyText}
        invalidIds={errors.length && draft ? [draft.id] : []}
      />
      {draft && (
        <div className="rounded-md border border-border p-2" key={draft.id}>
          <SchemaForm<T>
            jsonSchema={itemNode}
            schema={itemSchema}
            value={draft}
            onChange={(next) => next && update(next)}
            onValidate={setErrors}
            label={draft.name}
            showSummary
          />
        </div>
      )}
    </div>
  );
}
