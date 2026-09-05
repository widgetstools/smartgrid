import { useMemo } from 'react';
import type { ColumnInfo } from '@smartgrid/schema';
import type { EditorContext, FunctionInfo } from '@smartgrid/editors';
import type { Trade } from '../data/blotter.js';

/** A small function catalogue for the expression palette until M1 ships the real one. */
export const SAMPLE_FUNCTIONS: FunctionInfo[] = [
  { name: 'ABS', category: 'math', signature: 'ABS(number)', kinds: ['scalar'] },
  { name: 'ROUND', category: 'math', signature: 'ROUND(number, digits)', kinds: ['scalar'] },
  { name: 'CONTAINS', category: 'text', signature: 'CONTAINS(text, search)', kinds: ['boolean'] },
  { name: 'STARTS_WITH', category: 'text', signature: 'STARTS_WITH(text, prefix)', kinds: ['boolean'] },
  { name: 'IF', category: 'logic', signature: 'IF(condition, then, else)', kinds: ['scalar'] },
  {
    name: 'SUM',
    category: 'aggregated',
    signature: 'SUM([col], GROUP_BY([col]))',
    kinds: ['aggregatedScalar'],
  },
  { name: 'AVG', category: 'aggregated', signature: 'AVG([col])', kinds: ['aggregatedScalar'] },
  { name: 'COUNT', category: 'observable', signature: 'COUNT([col], n)', kinds: ['observable'] },
];

export function useEditorContextValue(
  columns: ColumnInfo[],
  trades: Trade[],
  theme: 'light' | 'dark',
): Partial<EditorContext> {
  return useMemo(
    () => ({
      columns,
      sampleRows: trades.slice(0, 5) as unknown as Record<string, unknown>[],
      theme,
      functions: SAMPLE_FUNCTIONS,
      styleClassNames: ['sg-cell-hot', 'sg-cell-muted'],
    }),
    [columns, trades, theme],
  );
}
