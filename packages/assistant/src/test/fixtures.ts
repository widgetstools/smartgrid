/** Shared fixtures for the assistant tests (excluded from the build). */
import { ColumnInfo, createGridConfig, defaultTableLayout, type GridConfig } from '@smartgrid/schema';
import { ConfigStore, MemoryAdapter } from '@smartgrid/store';

export const COLUMNS: ColumnInfo[] = (
  [
    ['tradeId', 'Trade', 'text'],
    ['desk', 'Desk', 'text'],
    ['book', 'Book', 'text'],
    ['notional', 'Notional', 'number'],
    ['pnl', 'PnL', 'number'],
    ['pnlPct', 'PnL %', 'number'],
    ['tradeDate', 'Trade date', 'date'],
  ] as const
).map(([id, header, dataType]) =>
  ColumnInfo.parse({ id, header, dataType, sampleValues: dataType === 'number' ? [1, 2] : ['a', 'b'] }),
);

export function fixtureConfig(): GridConfig {
  const cfg = createGridConfig('test-grid');
  const blotter = defaultTableLayout(
    'blotter',
    'Blotter',
    COLUMNS.map((c) => c.id),
  );
  cfg.modules.layout = { v: 1, data: { currentLayoutId: 'blotter', layouts: [blotter] } };
  return cfg;
}

export async function fixtureStore(): Promise<ConfigStore> {
  const store = new ConfigStore({ adapter: new MemoryAdapter(), persistDebounceMs: 0 });
  await store.init(fixtureConfig());
  return store;
}
