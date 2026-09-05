/**
 * Editor gallery: every registered editor rendered in inline, popover and
 * panel modes with a representative value, plus the presentational pieces
 * (PreviewCell, PatchDiffCard, ObjectList, ValidationSummary). Use the
 * header theme toggle to check light and dark; "Split" shows both at once.
 */
import { createElement, useState } from 'react';
import type { Operation } from 'fast-json-patch';
import type { EditorHint } from '@smartgrid/schema';
import {
  ObjectList,
  PatchDiffCard,
  PreviewCell,
  ValidationSummary,
  defaultEditorRegistry,
  useEditorContext,
  type EditorMode,
  type PositionedError,
} from '@smartgrid/editors';
import { Button, cn } from '@smartgrid/ui';

const SAMPLES: Partial<Record<EditorHint, unknown>> = {
  color: 'var(--sg-negative)',
  themeColor: { light: '#fff3cd', dark: '#4a3b00' },
  border: { bottom: { width: 2, style: 'solid', color: 'var(--sg-primary)' } },
  fontStyle: { weight: 'bold', italic: true, family: 'mono' },
  alignment: { horizontal: 'right' },
  style: {
    foreColor: 'var(--sg-negative)',
    font: { weight: 'semibold' },
    alignment: { horizontal: 'right' },
  },
  displayFormat: { kind: 'number', preset: 'Dollar', fractionDigits: 2 },
  expression: "[pnl] < 0 AND [desk] = 'Rates'",
  predicate: { predicateId: 'Between', inputs: [100, 500] },
  rule: { kind: 'predicates', predicates: [{ predicateId: 'Negative', inputs: [] }], operator: 'AND' },
  scope: { kind: 'columns', columnIds: ['pnl', 'notional'] },
  rowScope: { excludeGroupRows: true },
  column: 'pnl',
  columns: ['desk', 'pnl'],
  columnType: 'number',
  icon: { kind: 'emoji', value: '🔥' },
  image: undefined,
  number: 42,
  range: [10, 90],
  schedule: { kind: 'cron', cron: '0 9 * * 1-5' },
  keys: { key: 'K', ctrl: true, shift: false, alt: false, meta: false },
  duration: 1500,
  values: ['Rates', 'Credit'],
  density: 'compact',
  text: 'Negative PnL',
  boolean: true,
  enum: 'cell',
};

const OPTIONS: Partial<Record<EditorHint, Record<string, unknown>>> = {
  predicate: { dataType: 'number', columnId: 'pnl' },
  rule: { dataType: 'number', columnId: 'pnl', allowAggregated: true, allowObservable: true },
  enum: {
    values: [
      { value: 'cell', label: 'Cell' },
      { value: 'header', label: 'Header' },
    ],
  },
  number: { min: 0, max: 100, suffix: '%' },
  range: { min: 0, max: 100 },
};

const MODES: EditorMode[] = ['inline', 'popover', 'panel'];

function EditorCell({ hint, mode }: { hint: EditorHint; mode: EditorMode }) {
  const registry = defaultEditorRegistry();
  const editor = registry.component(hint)!;
  const [value, setValue] = useState<unknown>(SAMPLES[hint]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {createElement(editor, {
        value: value,
        onChange: setValue,
        mode: mode,
        label: registry.get(hint)?.title ?? hint,
        options: OPTIONS[hint],
        description: mode === 'panel' ? `x-editor: ${hint}` : undefined,
      })}
      <pre className="max-h-16 overflow-auto rounded-sm bg-muted/60 px-1.5 py-1 font-mono text-2xs text-muted-foreground">
        {value === undefined ? 'undefined' : JSON.stringify(value)}
      </pre>
    </div>
  );
}

function GalleryBody() {
  const registry = defaultEditorRegistry();
  const ctx = useEditorContext();
  const [filter, setFilter] = useState('');
  const hints = registry.hints().filter((h) => !filter || h.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="flex flex-col gap-4 p-3">
      <input
        aria-label="Filter editors"
        className="h-control-sm w-64 rounded-md border border-input bg-background px-2 text-sm"
        placeholder="Filter editors…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="grid grid-cols-[10rem_1fr_1fr_1fr] gap-x-4 gap-y-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>Editor</span>
        {MODES.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      {hints.map((hint) => (
        <section
          key={hint}
          className="grid grid-cols-[10rem_1fr_1fr_1fr] items-start gap-x-4 gap-y-2 border-t border-border pt-3"
          data-hint={hint}
        >
          <div className="pt-1">
            <div className="text-sm font-medium">{registry.get(hint)?.title}</div>
            <code className="font-mono text-2xs text-muted-foreground">{hint}</code>
          </div>
          {MODES.map((mode) => (
            <EditorCell key={`${hint}-${mode}`} hint={hint} mode={mode} />
          ))}
        </section>
      ))}

      <h2 className="mt-4 border-t border-border pt-3 text-sm font-semibold">Presentational</h2>
      <div className="grid grid-cols-2 gap-4">
        <PreviewDemo theme={ctx.theme} />
        <PatchDemo />
        <ListDemo />
        <ValidationSummary
          errors={[
            { path: '/style/backColor', message: 'Not a colour' },
            { path: '/rule/expression', message: 'Unexpected token', start: 7 },
          ]}
          warnings={['Expression rules are skipped until M1']}
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}

function PreviewDemo({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">PreviewCell</span>
      <div className="flex gap-2">
        <PreviewCell
          value={-1234567.891}
          displayFormat={{ kind: 'number', preset: 'Dollar' }}
          style={{ foreColor: 'var(--sg-negative)', font: { weight: 'semibold' } }}
          theme={theme}
          className="w-40"
        />
        <PreviewCell
          value={0.0423}
          displayFormat={{ kind: 'number', preset: 'Percentage' }}
          style={{ backColor: { light: '#fff3cd', dark: '#4a3b00' }, alignment: { horizontal: 'center' } }}
          theme={theme}
          className="w-32"
        />
        <PreviewCell
          value={new Date()}
          displayFormat={{ kind: 'date', pattern: 'dd-MMM-yyyy' }}
          style={{ font: { family: 'mono' } }}
          theme={theme}
          className="w-32"
        />
      </div>
    </div>
  );
}

function PatchDemo() {
  const registry = defaultEditorRegistry();
  const before = {
    modules: {
      formatting: {
        data: {
          formatColumns: [
            { id: 'fc-pnl-neg', name: 'Negative PnL red', style: { foreColor: 'var(--sg-negative)' } },
          ],
        },
      },
    },
  };
  const [patch, setPatch] = useState<Operation[]>([
    { op: 'replace', path: '/modules/formatting/data/formatColumns/0/style/foreColor', value: '#ff4d4f' },
    { op: 'add', path: '/modules/formatting/data/formatColumns/0/style/font', value: { weight: 'bold' } },
    {
      op: 'add',
      path: '/modules/formatting/data/formatColumns/0/rule',
      value: { kind: 'expression', expression: '[pnl] < -1000' },
    },
  ]);
  const [status, setStatus] = useState<'proposed' | 'applied' | 'rejected'>('proposed');
  const errors: PositionedError[] = [];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">PatchDiffCard (inline editors resolved by path)</span>
      <PatchDiffCard
        patch={patch}
        before={before}
        title="Make large losses stand out"
        rationale="Bold red for PnL below -1,000; the existing red rule stays for smaller losses."
        status={status}
        errors={errors}
        registry={registry}
        resolveEditor={(path) =>
          path.endsWith('/foreColor')
            ? { hint: 'color', label: 'Text colour' }
            : path.endsWith('/font')
              ? { hint: 'fontStyle', label: 'Font' }
              : path.endsWith('/rule')
                ? { hint: 'rule', label: 'Condition', options: { dataType: 'number', columnId: 'pnl' } }
                : undefined
        }
        onEdit={setPatch}
        onApply={() => setStatus('applied')}
        onReject={() => setStatus('rejected')}
        onUndo={() => setStatus('proposed')}
      />
    </div>
  );
}

function ListDemo() {
  const [items, setItems] = useState([
    { id: 'a', name: 'Negative PnL red', enabled: true, scope: 'pnl, pnlPct' },
    { id: 'b', name: 'Money columns', enabled: true, scope: 'notional, pnl' },
    { id: 'c', name: 'Cancelled rows', enabled: false, scope: 'all' },
  ]);
  const [selected, setSelected] = useState<string | undefined>('a');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">ObjectList</span>
      <ObjectList
        items={items}
        onChange={setItems}
        selectedId={selected}
        onSelect={setSelected}
        summarize={(it) => ({ title: it.name, subtitle: it.scope, badges: ['style'] })}
        create={() => ({ id: `n${items.length}`, name: 'New format', enabled: true, scope: 'all' })}
        addLabel="Add format"
      />
    </div>
  );
}

export function GalleryPage() {
  const [split, setSplit] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>Every registered editor × three modes. Toggle the theme in the header, or</span>
        <Button size="sm" variant={split ? 'default' : 'outline'} onClick={() => setSplit((s) => !s)}>
          {split ? 'Single theme' : 'Split light / dark'}
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-auto', split && 'grid grid-cols-2')}>
        {split ? (
          <>
            <div data-theme="light" className="bg-background text-foreground">
              <GalleryBody />
            </div>
            <div data-theme="dark" className="bg-background text-foreground">
              <GalleryBody />
            </div>
          </>
        ) : (
          <GalleryBody />
        )}
      </div>
    </div>
  );
}
