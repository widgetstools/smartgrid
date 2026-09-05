/**
 * Customizer drawer: the fallback UI. Format columns and layouts are edited
 * with the generated forms; every change becomes a JSON Patch applied to the
 * ConfigStore, so the grid updates live and the edit lands in the same
 * revision log the assistant writes to. The "Assistant" tab mocks a proposal
 * card to show the same editors inside a PatchDiffCard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { compare, type Operation } from 'fast-json-patch';
import type { FormatColumn, Layout, TypedGridConfig } from '@smartgrid/schema';
import type { ConfigStore } from '@smartgrid/store';
import {
  ObjectList,
  PatchDiffCard,
  ValidationSummary,
  defaultEditorRegistry,
  uid,
  useEditorContext,
  type EditorComponent,
  type PositionedError,
} from '@smartgrid/editors';
import {
  FormatColumnForm,
  LayoutForm,
  defaultFormatColumn,
  defaultLayout,
  type FormatColumnFormProps,
} from '@smartgrid/forms';
import { Button, ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@smartgrid/ui';

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

/**
 * Keeps a local draft of an object while the user types and commits one
 * JSON Patch per pause (default 400 ms) instead of one per keystroke. When
 * the store echoes our own commit the draft is kept (newer keystrokes may
 * already be pending); any other store change (undo, assistant, another
 * editor) discards the draft. Pending edits are flushed on unmount.
 */
function useDebouncedDraft<T>(current: T | undefined, commit: (prev: T, next: T) => void, delay = 400) {
  const [draft, setDraft] = useState<T | undefined>();
  const [seen, setSeen] = useState(current);
  const [committed, setCommitted] = useState<string | undefined>(undefined);
  const [hasPending, setHasPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ prev: T; next: T } | undefined>(undefined);
  if (current !== seen) {
    setSeen(current);
    const own = committed !== undefined && JSON.stringify(current) === committed;
    if (!own || !hasPending) setDraft(undefined);
    if (!own) setHasPending(false);
  }
  // Ref bookkeeping stays out of render: an external change cancels pending edits.
  useEffect(() => {
    if (hasPending) return;
    pending.current = undefined;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, [hasPending]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const p = pending.current;
    pending.current = undefined;
    setHasPending(false);
    if (p) {
      setCommitted(JSON.stringify(p.next));
      commit(p.prev, p.next);
    }
  };
  const update = (next: T) => {
    const base = pending.current?.prev ?? (draft !== undefined ? seen : current);
    if (base === undefined) return;
    setDraft(next);
    pending.current = { prev: base, next };
    setHasPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);
  return [draft ?? current, update, flush] as const;
}

export function Customizer({ store, config, onClose }: CustomizerProps) {
  const ctx = useEditorContext();
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
      <Tabs defaultValue="formats" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
          <TabsTrigger value="formats">Formats</TabsTrigger>
          <TabsTrigger value="layouts">Layouts</TabsTrigger>
          <TabsTrigger value="assistant">Assistant</TabsTrigger>
        </TabsList>

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

        <TabsContent value="assistant" className="m-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <AssistantMock store={store} config={config} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

const FormatColumnRow: EditorComponent<unknown> = (props) => (
  <div className="w-full min-w-0">
    <FormatColumnForm
      {...(props as FormatColumnFormProps)}
      mode="popover"
      hiddenKeys={['id', 'readOnly', 'source', 'metadata', 'tags', 'name']}
    />
  </div>
);

/** Stand-in for M3: a canned proposal rendered with the real PatchDiffCard and applied through the store. */
function AssistantMock({ store, config }: { store: ConfigStore; config: TypedGridConfig }) {
  const registry = defaultEditorRegistry();
  const formatColumns = config.modules.formatting?.data.formatColumns ?? [];
  const proposal = useMemo<Operation[]>(() => {
    const fresh: FormatColumn = {
      ...defaultFormatColumn('fc-big-notional', 'Large notional'),
      scope: { kind: 'columns', columnIds: ['notional'] },
      rule: {
        kind: 'predicates',
        predicates: [{ predicateId: 'GreaterThan', inputs: [50_000_000] }],
        operator: 'AND',
      },
      style: { backColor: { light: '#e6f4ff', dark: '#0b2a4a' }, font: { weight: 'bold' } },
      source: 'assistant',
    };
    return [{ op: 'add', path: `${FC_PATH}/-`, value: fresh }];
  }, []);
  const [patch, setPatch] = useState(proposal);
  const [status, setStatus] = useState<'proposed' | 'applied' | 'rejected'>(
    formatColumns.some((f) => f.id === 'fc-big-notional') ? 'applied' : 'proposed',
  );
  const prompt = 'Highlight trades with notional above 50m';
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">You</span>
        <p>{prompt}</p>
      </div>
      <PatchDiffCard
        patch={patch}
        before={config}
        title="Add format column “Large notional”"
        rationale="Adds a rule on Notional > 50,000,000 with a blue fill and bold text. Tweak the values inline before applying."
        status={status}
        registry={registry}
        describePath={(p) => (p.endsWith('/-') ? 'Formatting › format columns › new' : p)}
        resolveEditor={(path) =>
          path.endsWith('/-')
            ? { hint: 'formatColumn', mode: 'popover', component: FormatColumnRow }
            : undefined
        }
        onEdit={setPatch}
        onApply={() => {
          void store
            .apply(patch, { origin: 'assistant', prompt, model: 'mock', rationale: 'Demo proposal' })
            .then(() => setStatus('applied'));
        }}
        onReject={() => setStatus('rejected')}
        onUndo={() => void store.undo().then(() => setStatus('proposed'))}
      />
      <ValidationSummary
        warnings={[
          'This is a canned proposal; M3 wires the local LLM (OpenAI-compatible, port 3000) behind the same card.',
        ]}
      />
    </div>
  );
}
