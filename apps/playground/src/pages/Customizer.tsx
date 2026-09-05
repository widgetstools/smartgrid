/**
 * Customizer drawer: the fallback UI. Format columns and layouts are edited
 * with the generated forms; every change becomes a JSON Patch applied to the
 * ConfigStore, so the grid updates live and the edit lands in the same
 * revision log the assistant writes to. The "Assistant" tab hosts the real
 * AssistantPane, whose proposals render with the same editors.
 */
import { useMemo, useState } from 'react';
import { compare, type Operation } from 'fast-json-patch';
import {
  Alert,
  CalculatedColumn,
  FlashingCell,
  NamedQuery,
  QuickSearch,
  StyledColumn,
  moduleJsonSchema,
  type FormatColumn,
  type Layout,
  type TypedGridConfig,
} from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import { ObjectList, uid, useEditorContext, type PositionedError } from '@smartgrid/editors';
import {
  FormatColumnForm,
  LayoutForm,
  defaultFormatColumn,
  defaultLayout,
  SchemaForm,
  propertiesOf,
} from '@smartgrid/forms';
import { Button, ScrollArea, Tabs, TabsContent } from '@smartgrid/ui';
import { AssistantTab } from './AssistantTab.js';
import { ModuleObjectsTab } from './ModuleObjectsTab.js';
import { useDebouncedDraft } from './useDebouncedDraft.js';

export interface CustomizerProps {
  store: ConfigStore;
  config: TypedGridConfig;
  onClose?: () => void;
}

const FC_PATH = '/modules/formatting/data/formatColumns';
const LAYOUTS_PATH = '/modules/layout/data/layouts';

function prefixed(base: string, ops: Operation[]): Operation[] {
  return ops.map(
    (op) => ({ ...op, path: base + op.path, ...('from' in op ? { from: base + op.from } : {}) }) as Operation,
  );
}

function describeScope(fc: FormatColumn, headerOf: (id: string) => string): string {
  switch (fc.scope.kind) {
    case 'all':
      return 'All columns';
    case 'columns':
      return fc.scope.columnIds.map(headerOf).join(', ');
    case 'dataTypes':
      return `${fc.scope.dataTypes.join(', ')} columns`;
    case 'columnTypes':
      return `type ${fc.scope.columnTypes.join(', ')}`;
  }
}

const TABS = [
  ['formats', 'Formats'],
  ['layouts', 'Layouts'],
  ['calculated', 'Calculated'],
  ['styled', 'Styled'],
  ['flashing', 'Flashing'],
  ['alerts', 'Alerts'],
  ['queries', 'Queries'],
  ['assistant', 'Assistant'],
] as const;

export function Customizer({ store, config, onClose }: CustomizerProps) {
  const ctx = useEditorContext();
  const [tab, setTab] = useState<string>('formats');
  const headerOf = (id: string) => ctx.columns.find((c) => c.id === id)?.header ?? id;
  const formatColumns = config.modules.formatting?.data.formatColumns ?? [];
  const layouts = config.modules.layout?.data.layouts ?? [];

  const [selectedFc, setSelectedFc] = useState<string | undefined>(formatColumns[0]?.id);
  const [selectedLayout, setSelectedLayout] = useState<string | undefined>(
    config.modules.layout?.data.currentLayoutId,
  );
  const [fcErrors, setFcErrors] = useState<PositionedError[]>([]);

  const applyList = (base: string, prev: unknown, next: unknown) => {
    const ops = prefixed(base, compare(prev as object, next as object));
    if (ops.length) void store.apply(ops, { origin: 'form' });
  };

  const storedFc = formatColumns.find((f) => f.id === selectedFc);
  const storedLayout = layouts.find((l) => l.id === selectedLayout);
  const [fc, updateFc] = useDebouncedDraft<FormatColumn>(storedFc, (prev, next) =>
    applyList(`${FC_PATH}/${formatColumns.indexOf(prev)}`, prev, next),
  );
  const [layout, updateLayout] = useDebouncedDraft<Layout>(storedLayout, (prev, next) =>
    applyList(`${LAYOUTS_PATH}/${layouts.indexOf(prev)}`, prev, next),
  );

  return (
    <aside
      className="flex h-full w-[30rem] shrink-0 flex-col border-l border-border bg-card text-card-foreground"
      data-testid="customizer"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Customize</span>
        <span className="text-2xs text-muted-foreground">forms → JSON Patch → store</span>
        {onClose && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mx-3 mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Modules">
          {TABS.map(([id, label]) => (
            <Button
              key={id}
              role="tab"
              aria-selected={tab === id}
              size="sm"
              variant={tab === id ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <TabsContent value="formats" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-3">
              <ObjectList
                items={formatColumns}
                onChange={(next) => applyList(FC_PATH, formatColumns, next)}
                summarize={(f) => ({
                  title: f.name,
                  subtitle: describeScope(f, headerOf),
                  badges: [
                    f.style ? 'style' : '',
                    f.displayFormat ? 'format' : '',
                    f.rule ? 'rule' : '',
                  ].filter(Boolean),
                })}
                selectedId={selectedFc}
                onSelect={setSelectedFc}
                create={() => defaultFormatColumn(uid('fc'))}
                addLabel="Add format column"
                invalidIds={fcErrors.length && fc ? [fc.id] : []}
              />
              {fc && (
                <div className="rounded-md border border-border p-2" key={fc.id}>
                  <FormatColumnForm
                    value={fc}
                    onChange={(next) => next && updateFc(next)}
                    onValidate={setFcErrors}
                    label={fc.name}
                    showSummary
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="layouts" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-3">
              <ObjectList
                items={layouts}
                onChange={(next) => applyList(LAYOUTS_PATH, layouts, next)}
                summarize={(l) => ({
                  title: l.name,
                  subtitle:
                    l.kind === 'table'
                      ? `${l.columns.length} columns`
                      : `${l.pivotColumns.length} pivot columns`,
                  badges: [
                    l.kind,
                    l.id === config.modules.layout?.data.currentLayoutId ? 'current' : '',
                  ].filter(Boolean),
                })}
                selectedId={selectedLayout}
                onSelect={setSelectedLayout}
                create={() =>
                  defaultLayout(
                    uid('layout'),
                    'New layout',
                    ctx.columns.slice(0, 6).map((c) => c.id),
                  )
                }
                toggleable={false}
                addLabel="Add layout"
              />
              {layout && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-2" key={layout.id}>
                  {layout.id !== config.modules.layout?.data.currentLayoutId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      onClick={() =>
                        void store.apply(
                          [{ op: 'replace', path: '/modules/layout/data/currentLayoutId', value: layout.id }],
                          { origin: 'form' },
                        )
                      }
                    >
                      Make current
                    </Button>
                  )}
                  <LayoutForm
                    value={layout}
                    onChange={(next) => next && updateLayout(next as Layout)}
                    label={layout.name}
                    showSummary
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="calculated" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <ModuleObjectsTab
              store={store}
              config={config}
              moduleId="calculatedColumns"
              listKey="calculatedColumns"
              itemSchema={CalculatedColumn}
              items={config.modules.calculatedColumns?.data.calculatedColumns ?? []}
              summarize={(c) => ({
                title: c.name,
                subtitle: c.expression.expression,
                badges: [c.expression.kind, c.dataType],
              })}
              create={() =>
                CalculatedColumn.parse({
                  id: uid('cc'),
                  name: 'New column',
                  columnId: `calc_${Date.now().toString(36)}`,
                  expression: { kind: 'scalar', expression: '[pnl] * 2' },
                })
              }
              addLabel="Add calculated column"
              emptyText="No calculated columns."
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="styled" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <ModuleObjectsTab
              store={store}
              config={config}
              moduleId="styledColumns"
              listKey="styledColumns"
              itemSchema={StyledColumn}
              items={config.modules.styledColumns?.data.styledColumns ?? []}
              summarize={(sc) => ({
                title: sc.name,
                subtitle: headerOf(sc.columnId),
                badges: [sc.style.kind],
              })}
              create={() =>
                StyledColumn.parse({
                  id: uid('sc'),
                  name: 'New styled column',
                  columnId:
                    ctx.columns.find((c) => c.dataType === 'number')?.id ?? ctx.columns[0]?.id ?? 'pnl',
                  style: { kind: 'rating', max: 5 },
                })
              }
              addLabel="Add styled column"
              emptyText="No styled columns."
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="flashing" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <ModuleObjectsTab
              store={store}
              config={config}
              moduleId="flashing"
              listKey="flashingCells"
              itemSchema={FlashingCell}
              items={config.modules.flashing?.data.flashingCells ?? []}
              summarize={(f) => ({
                title: f.name,
                subtitle: describeScope(f as unknown as FormatColumn, headerOf),
                badges: [f.target, String(f.duration)],
              })}
              create={() =>
                FlashingCell.parse({
                  id: uid('flash'),
                  name: 'New flash',
                  scope: { kind: 'all' },
                  duration: 500,
                })
              }
              addLabel="Add flashing cell"
              emptyText="No flashing cells."
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="alerts" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <ModuleObjectsTab
              store={store}
              config={config}
              moduleId="alerts"
              listKey="alerts"
              itemSchema={Alert}
              items={config.modules.alerts?.data.alerts ?? []}
              summarize={(a) => ({
                title: a.name,
                subtitle: a.rule
                  ? a.rule.kind === 'predicates'
                    ? 'conditions'
                    : a.rule.expression
                  : 'scheduled',
                badges: [a.messageType, a.rule?.kind ?? 'schedule'],
              })}
              create={() =>
                Alert.parse({
                  id: uid('alert'),
                  name: 'New alert',
                  scope: { kind: 'all' },
                  rule: { kind: 'expression', expression: 'ANY_CHANGE([pnl])' },
                })
              }
              addLabel="Add alert"
              emptyText="No alerts."
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="queries" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <ModuleObjectsTab
              store={store}
              config={config}
              moduleId="queries"
              listKey="namedQueries"
              itemSchema={NamedQuery}
              items={config.modules.queries?.data.namedQueries ?? []}
              summarize={(q) => ({ title: q.name, subtitle: q.expression, badges: ['QUERY'] })}
              create={() =>
                NamedQuery.parse({
                  id: uid('nq'),
                  name: `Query${Date.now().toString(36)}`,
                  expression: '[pnl] > 0',
                })
              }
              addLabel="Add named query"
              emptyText="No named queries."
              header={<QuickSearchForm store={store} config={config} />}
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="assistant" className="m-0 flex min-h-0 flex-1 flex-col">
          <AssistantTab store={store} config={config} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function QuickSearchForm({ store, config }: { store: ConfigStore; config: TypedGridConfig }) {
  const node = useMemo(() => propertiesOf(moduleJsonSchema('queries'))['quickSearch'] ?? {}, []);
  const stored = config.modules.queries?.data.quickSearch;
  const [draft, update] = useDebouncedDraft<QuickSearch>(stored, (prev, next) => {
    const ops = prefixed('/modules/queries/data/quickSearch', compare(prev, next));
    if (ops.length) void store.apply(ops, { origin: 'form' });
  });
  if (!draft) return null;
  return (
    <div className="rounded-md border border-border p-2">
      <SchemaForm<QuickSearch>
        jsonSchema={node}
        schema={QuickSearch}
        value={draft}
        onChange={(next) => next && update(next)}
        label="Quick search"
      />
    </div>
  );
}
