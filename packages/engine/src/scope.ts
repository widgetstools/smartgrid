import type { ColumnInfo, RowScope, Scope } from '@smartgrid/schema';

/** Column ids matched by a scope, in the order of the supplied column list. */
export function columnsInScope(scope: Scope, columns: readonly ColumnInfo[]): string[] {
  switch (scope.kind) {
    case 'all':
      return columns.map((c) => c.id);
    case 'columns':
      return columns.filter((c) => scope.columnIds.includes(c.id)).map((c) => c.id);
    case 'dataTypes':
      return columns
        .filter((c) => scope.dataTypes.includes(c.dataType) || scope.columnIds.includes(c.id))
        .map((c) => c.id);
    case 'columnTypes':
      return columns.filter((c) => c.columnTypes.some((t) => scope.columnTypes.includes(t))).map((c) => c.id);
  }
}

export interface RowKind {
  isGroup: boolean;
  isSummary: boolean;
  isTotal: boolean;
}

export function rowKindAllowed(rowScope: RowScope | undefined, kind: RowKind): boolean {
  if (!rowScope) return true;
  if (kind.isTotal) return !rowScope.excludeTotalRows;
  if (kind.isSummary) return !rowScope.excludeSummaryRows;
  if (kind.isGroup) return !rowScope.excludeGroupRows;
  return !rowScope.excludeDataRows;
}
