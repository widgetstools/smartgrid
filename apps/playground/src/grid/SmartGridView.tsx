import { useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import type { ColumnInfo, TypedGridConfig } from '@smartgrid/schema';
import { buildGrid } from '@smartgrid/engine';
import type { Trade } from '../data/blotter.js';

export interface SmartGridViewProps {
  config: TypedGridConfig;
  baseColumnDefs: ColDef<Trade>[];
  columns: ColumnInfo[];
  rowData: Trade[];
  theme: unknown;
  onGridReady?: (api: GridApi<Trade>) => void;
  onWarnings?: (warnings: string[]) => void;
}

/**
 * Renders AG Grid from the config document. Every change to the document
 * rebuilds columnDefs/gridOptions and re-injects the stylesheet; AG Grid
 * diffs column definitions by colId so the grid updates in place.
 */
export function SmartGridView({
  config,
  baseColumnDefs,
  columns,
  rowData,
  theme,
  onGridReady,
  onWarnings,
}: SmartGridViewProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const built = useMemo(
    () => buildGrid({ config, baseColumnDefs, columns }),
    [config, baseColumnDefs, columns],
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
  }, [built.warnings, onWarnings]);

  return (
    <div className="h-full w-full">
      <AgGridReact<Trade>
        theme={theme as never}
        columnDefs={built.columnDefs as ColDef<Trade>[]}
        rowData={rowData}
        getRowId={(p) => p.data.tradeId}
        defaultColDef={{ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }}
        cellSelection
        sideBar={{ toolPanels: ['columns', 'filters'], hiddenByDefault: true }}
        onGridReady={(e: GridReadyEvent<Trade>) => onGridReady?.(e.api)}
        {...built.gridOptions}
      />
    </div>
  );
}
