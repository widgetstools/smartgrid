import type { ColDef, ColGroupDef } from 'ag-grid-community';
import type { RowKind } from '../scope.js';

export function colIdOf(d: ColDef): string {
  return d.colId ?? d.field ?? '';
}

export function flattenDefs(defs: (ColDef | ColGroupDef)[]): ColDef[] {
  const out: ColDef[] = [];
  for (const d of defs) {
    if ('children' in d && Array.isArray(d.children)) out.push(...flattenDefs(d.children));
    else out.push(d as ColDef);
  }
  return out;
}

/** Without a layout, keep the host's group structure but with module output applied; unknown (calculated) defs are appended. */
export function restoreGroups(base: (ColDef | ColGroupDef)[], flat: ColDef[]): (ColDef | ColGroupDef)[] {
  const byId = new Map(flat.map((d) => [colIdOf(d), d]));
  const used = new Set<string>();
  const walk = (defs: (ColDef | ColGroupDef)[]): (ColDef | ColGroupDef)[] =>
    defs.map((d) => {
      if ('children' in d && Array.isArray(d.children)) return { ...d, children: walk(d.children) };
      const id = colIdOf(d as ColDef);
      used.add(id);
      return byId.get(id) ?? d;
    });
  const out = walk(base);
  for (const d of flat) if (!used.has(colIdOf(d))) out.push(d);
  return out;
}

/** Row kind from AG Grid cell/row params. */
export function kindOf(p: {
  node?: { group?: boolean; rowPinned?: string | null; footer?: boolean } | null;
}): RowKind {
  const node = p.node;
  return {
    isGroup: !!node?.group && !node?.footer,
    isSummary: !!node?.rowPinned && !node?.footer,
    isTotal: !!node?.footer,
  };
}

/** Stable CSS class for a config object id. */
export function classFor(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Append class names to a ColDef's cellClass / headerClass without clobbering host values. */
export function appendClass(existing: ColDef['headerClass'], ...names: string[]): string[] {
  const base = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  return [...base, ...names];
}
