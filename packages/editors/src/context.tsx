import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PREDICATE_ARITY, PREDICATE_IDS, predicatesForDataType, type CellDataType } from '@smartgrid/schema';
import type { EditorContext, PredicateInfo } from './types.js';

const Ctx = createContext<EditorContext | null>(null);

/** Default colour tokens offered by pickers, in palette order. */
export const DEFAULT_COLOR_TOKENS: readonly { token: string; label: string }[] = [
  { token: 'var(--sg-positive)', label: 'Positive' },
  { token: 'var(--sg-negative)', label: 'Negative' },
  { token: 'var(--sg-accent-warning)', label: 'Warning' },
  { token: 'var(--sg-info)', label: 'Info' },
  { token: 'var(--sg-primary)', label: 'Primary' },
  { token: 'var(--sg-accent-highlight)', label: 'Highlight' },
  { token: 'var(--sg-purple)', label: 'Purple' },
  { token: 'var(--sg-buy)', label: 'Buy' },
  { token: 'var(--sg-sell)', label: 'Sell' },
  { token: 'var(--sg-muted)', label: 'Muted' },
  { token: 'var(--sg-foreground)', label: 'Foreground' },
  { token: 'var(--sg-background)', label: 'Background' },
];

/** System predicate catalogue as PredicateInfo, for hosts without a custom list. */
export const SYSTEM_PREDICATE_INFO: readonly PredicateInfo[] = PREDICATE_IDS.map((id) => ({
  id,
  label: id.replace(/([a-z])([A-Z])/g, '$1 $2'),
  arity: PREDICATE_ARITY[id],
}));

export function predicatesFor(dataType: CellDataType, all: readonly PredicateInfo[]): PredicateInfo[] {
  const allowed = new Set<string>(predicatesForDataType(dataType));
  return all.filter((p) => (p.dataTypes ? p.dataTypes.includes(dataType) : allowed.has(p.id)));
}

export const EMPTY_EDITOR_CONTEXT: EditorContext = {
  columns: [],
  sampleRows: [],
  theme: 'light',
  functions: [],
  predicates: SYSTEM_PREDICATE_INFO,
  icons: [],
  colorTokens: DEFAULT_COLOR_TOKENS,
};

export function EditorContextProvider({
  value,
  children,
}: {
  value: Partial<EditorContext>;
  children: ReactNode;
}) {
  const merged = useMemo<EditorContext>(() => ({ ...EMPTY_EDITOR_CONTEXT, ...value }), [value]);
  return <Ctx.Provider value={merged}>{children}</Ctx.Provider>;
}

export function useEditorContext(): EditorContext {
  return useContext(Ctx) ?? EMPTY_EDITOR_CONTEXT;
}
