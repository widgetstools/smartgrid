/**
 * Completion source for AdaptableQL: columns inside `[…]`, functions for the
 * current expression kind, and keywords. Explicit activation (Ctrl+Space)
 * always answers; implicit activation answers after `[` or two identifier
 * characters.
 */
import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import type { ExpressionKind } from '@smartgrid/schema';
import { defaultFunctionRegistry } from '@smartgrid/expressions';
import type { FunctionInfo } from '../../types.js';

export interface CompletionColumn {
  id: string;
  header?: string;
  dataType?: string;
}

export interface CompletionOptions {
  kind: ExpressionKind;
  columns: readonly CompletionColumn[];
  /** Extra host functions merged with the system registry (registry wins on name clashes). */
  functions?: readonly FunctionInfo[];
}

const KEYWORD_COMPLETIONS = ['AND', 'OR', 'NOT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'] as const;
const WHERE_KINDS: readonly ExpressionKind[] = ['aggregatedScalar', 'aggregatedBoolean', 'observable'];

/** Functions available to `kind`: the system catalogue plus host extras, sorted by name. */
export function functionsForKind(kind: ExpressionKind, extra: readonly FunctionInfo[] = []): FunctionInfo[] {
  const byName = new Map<string, FunctionInfo>();
  for (const f of extra) {
    if (f.kinds.includes(kind)) byName.set(f.name.toUpperCase(), f);
  }
  for (const d of defaultFunctionRegistry().list(kind)) {
    byName.set(d.name.toUpperCase(), {
      name: d.name,
      category: d.category,
      signature: d.signatures[0] ?? `${d.name}()`,
      description: d.description,
      kinds: d.kinds,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Keywords offered for `kind` (WHERE only where the grammar allows it). */
export function keywordsForKind(kind: ExpressionKind): string[] {
  return WHERE_KINDS.includes(kind) ? [...KEYWORD_COMPLETIONS, 'WHERE'] : [...KEYWORD_COMPLETIONS];
}

function columnCompletions(
  ctx: CompletionContext,
  open: { from: number; text: string },
  columns: readonly CompletionColumn[],
): CompletionResult | null {
  const query = open.text.slice(1).trim().toLowerCase();
  const closes = ctx.state.sliceDoc(ctx.pos, ctx.pos + 1) === ']';
  const to = closes ? ctx.pos + 1 : ctx.pos;
  const ranked = columns
    .map((c) => {
      const id = c.id.toLowerCase();
      const header = (c.header ?? '').toLowerCase();
      let rank = -1;
      if (!query) rank = 0;
      else if (id.startsWith(query) || header.startsWith(query)) rank = 0;
      else if (id.includes(query) || header.includes(query)) rank = 1;
      return { c, rank };
    })
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.c.id.localeCompare(b.c.id));
  if (ranked.length === 0) return null;
  const options: Completion[] = ranked.map(({ c }) => ({
    label: c.id,
    displayLabel: c.header && c.header !== c.id ? `${c.header}` : c.id,
    detail: c.dataType,
    info: c.header && c.header !== c.id ? `[${c.id}]` : undefined,
    type: 'variable',
    apply: `[${c.id}]`,
  }));
  return { from: open.from, to, options, filter: false };
}

/** Build the completion source for a kind / column set / function catalogue. */
export function expressionCompletionSource(opts: CompletionOptions): CompletionSource {
  const functions = functionsForKind(opts.kind, opts.functions);
  const functionOptions: Completion[] = functions.map((f) => ({
    label: f.name,
    detail: f.signature,
    info: f.description,
    type: 'function',
    apply: `${f.name}(`,
    boost: 1,
  }));
  const keywordOptions: Completion[] = keywordsForKind(opts.kind).map((k) => ({
    label: k,
    type: 'keyword',
    apply: `${k} `,
  }));
  const options = [...functionOptions, ...keywordOptions];

  return (ctx) => {
    const open = ctx.matchBefore(/\[[^\]]*$/);
    if (open) return columnCompletions(ctx, open, opts.columns);
    const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*$/);
    if (!word && !ctx.explicit) return null;
    if (word && !ctx.explicit && word.text.length < 2) return null;
    const from = word ? word.from : ctx.pos;
    return { from, options, validFor: /^[A-Za-z_][A-Za-z0-9_]*$/ };
  };
}
