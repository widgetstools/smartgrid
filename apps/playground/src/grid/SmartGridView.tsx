import { useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { CellValueChangedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import type { ColumnInfo, TypedGridConfig } from '@smartgrid/schema';
import { buildGrid, filtersSignature, type GridRuntime } from '@smartgrid/engine';
import { styledColumnComponents } from '@smartgrid/design-system/react';
import type { Trade } from '../data/blotter.js';

export interface SmartGridViewProps {
  config: TypedGridConfig;
  baseColumnDefs: ColDef<Trade>[];
  columns: ColumnInfo[];
  rowData: Trade[];
  theme: unknown;
  runtime: GridRuntime;
  onGridReady?: (api: GridApi<Trade>) => void;
  onWarnings?: (warnings: string[]) => void;
  /** Columns after calculated columns were appended; hosts feed these to editors and the assistant. */
  onColumns?: (columns: ColumnInfo[]) => void;
}

/**
 * Renders AG Grid from the config document. Every change to the document
 * rebuilds columnDefs/gridOptions and re-injects the stylesheet; AG Grid
 * diffs column definitions by colId so the grid updates in place. The
 * engine runtime is bound at build time and fed by the host (ticks, edits).
 */
export function SmartGridView({
  config,
  baseColumnDefs,
  columns,
  rowData,
  theme,
  runtime,
  onGridReady,
  onWarnings,
  onColumns,
}: SmartGridViewProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const apiRef = useRef<GridApi<Trade> | null>(null);
  const lastFilters = useRef<string>('');

  const built = useMemo(
    () => buildGrid({ config, baseColumnDefs, columns, runtime }),
    [config, baseColumnDefs, columns, runtime],
  );

  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.dataset['smartgrid'] = config.gridId;
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = built.css;
    return () => {
      styleRef.current?.remove();
      styleRef.current = null;
    };
  }, [built.css, config.gridId]);

  useEffect(() => {
    if (built.warnings.length) onWarnings?.(built.warnings);
    else onWarnings?.([]);
  }, [built.warnings, onWarnings]);

  useEffect(() => {
    onColumns?.(built.columns);
  }, [built.columns, onColumns]);

  // Re-run AG Grid's external filter when the config's filters change.
  useEffect(() => {
    const sig = filtersSignature(config);
    if (sig !== lastFilters.current) {
      lastFilters.current = sig;
      const api = apiRef.current;
      if (api && !api.isDestroyed()) api.onFilterChanged();
    }
  }, [config]);

  const onCellValueChanged = (e: CellValueChangedEvent<Trade>) => {
    if (!e.data || e.oldValue === e.newValue) return;
    runtime.cellsChanged([
      {
        rowId: e.data.tradeId,
        columnId: e.column.getColId(),
        oldValue: e.oldValue,
        newValue: e.newValue,
        data: e.data as unknown as Record<string, unknown>,
        at: Date.now(),
        trigger: 'edit',
      },
    ]);
  };

  return (
    <div className="h-full w-full">
      <AgGridReact<Trade>
        theme={theme as never}
        columnDefs={built.columnDefs as ColDef<Trade>[]}
        rowData={rowData}
        getRowId={(p) => p.data.tradeId}
        defaultColDef={{ sortable: true, filter: true, resizable: true }}
        cellSelection
        components={styledColumnComponents}
        sideBar={{ toolPanels: ['columns', 'filters'], hiddenByDefault: true }}
        onGridReady={(e: GridReadyEvent<Trade>) => {
          apiRef.current = e.api;
          onGridReady?.(e.api);
        }}
        onCellValueChanged={onCellValueChanged}
        {...built.gridOptions}
      />
    </div>
  );
}
