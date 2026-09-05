import type { ColDef } from 'ag-grid-community';
import type { ColumnInfo } from '@smartgrid/schema';

export interface Trade {
  tradeId: string;
  desk: string;
  book: string;
  trader: string;
  instrument: string;
  ccy: string;
  side: 'Buy' | 'Sell';
  notional: number;
  price: number;
  yield: number;
  pnl: number;
  pnlPct: number;
  rating: string;
  status: 'New' | 'Filled' | 'Partial' | 'Cancelled';
  tradeDate: Date;
  settleDate: Date;
  updatedAt: Date;
}

const DESKS = ['Rates', 'Credit', 'FX', 'EM'];
const BOOKS: Record<string, string[]> = {
  Rates: ['UST', 'Bund', 'Gilt', 'Swaps'],
  Credit: ['IG', 'HY', 'CDS'],
  FX: ['G10', 'EMFX'],
  EM: ['LatAm', 'CEEMEA', 'Asia'],
};
const TRADERS = ['A. Chen', 'M. Okafor', 'S. Patel', 'J. Müller', 'L. Rossi', 'K. Tanaka'];
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'BRL', 'MXN'];
const RATINGS = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BB+', 'BB', 'B'];
const STATUSES: Trade['status'][] = ['New', 'Filled', 'Filled', 'Partial', 'Cancelled'];

/** Deterministic PRNG so demos and screenshots are stable. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;

export function generateTrades(count = 500, seed = 42): Trade[] {
  const rnd = mulberry32(seed);
  const today = new Date();
  const out: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const desk = pick(rnd, DESKS);
    const notional = Math.round((rnd() * 49 + 1) * 1_000_000);
    const price = Math.round((90 + rnd() * 20) * 10000) / 10000;
    const pnl = Math.round((rnd() - 0.45) * 500_000);
    const daysAgo = Math.floor(rnd() * 30);
    const tradeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
    out.push({
      tradeId: `T${String(100000 + i)}`,
      desk,
      book: pick(rnd, BOOKS[desk]!),
      trader: pick(rnd, TRADERS),
      instrument: `${pick(rnd, ['UST', 'DBR', 'UKT', 'JGB', 'BRAZIL', 'MEX'])} ${(2 + Math.floor(rnd() * 5)).toFixed(3)}% ${2027 + Math.floor(rnd() * 20)}`,
      ccy: pick(rnd, CCYS),
      side: rnd() > 0.5 ? 'Buy' : 'Sell',
      notional,
      price,
      yield: Math.round((1.5 + rnd() * 6) * 1000) / 1000,
      pnl,
      pnlPct: pnl / notional,
      rating: pick(rnd, RATINGS),
      status: pick(rnd, STATUSES),
      tradeDate,
      settleDate: new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate() + 2),
      updatedAt: new Date(),
    });
  }
  return out;
}

/** Mutate a random subset of trades to simulate ticking prices. Returns the changed rows. */
export function tick(trades: Trade[], rnd: () => number, count = 20): Trade[] {
  const changed: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const t = trades[Math.floor(rnd() * trades.length)]!;
    const move = (rnd() - 0.5) * 0.2;
    const next: Trade = {
      ...t,
      price: Math.round((t.price + move) * 10000) / 10000,
      pnl: Math.round(t.pnl + move * t.notional * 0.01),
      updatedAt: new Date(),
    };
    next.pnlPct = next.pnl / next.notional;
    changed.push(next);
  }
  return changed;
}

export const BLOTTER_COLUMN_DEFS: ColDef<Trade>[] = [
  { field: 'tradeId', headerName: 'Trade', cellDataType: 'text', width: 110 },
  { field: 'desk', headerName: 'Desk', cellDataType: 'text', enableRowGroup: true },
  { field: 'book', headerName: 'Book', cellDataType: 'text', enableRowGroup: true },
  { field: 'trader', headerName: 'Trader', cellDataType: 'text', enableRowGroup: true },
  { field: 'instrument', headerName: 'Instrument', cellDataType: 'text', width: 170 },
  { field: 'ccy', headerName: 'Ccy', cellDataType: 'text', width: 80, enableRowGroup: true, enablePivot: true },
  { field: 'side', headerName: 'Side', cellDataType: 'text', width: 80, enablePivot: true },
  { field: 'notional', headerName: 'Notional', cellDataType: 'number', enableValue: true },
  { field: 'price', headerName: 'Price', cellDataType: 'number', enableValue: true, editable: true },
  { field: 'yield', headerName: 'Yield', cellDataType: 'number', enableValue: true },
  { field: 'pnl', headerName: 'PnL', cellDataType: 'number', enableValue: true },
  { field: 'pnlPct', headerName: 'PnL %', cellDataType: 'number', enableValue: true },
  { field: 'rating', headerName: 'Rating', cellDataType: 'text', width: 90 },
  { field: 'status', headerName: 'Status', cellDataType: 'text', width: 100, enableRowGroup: true },
  { field: 'tradeDate', headerName: 'Trade date', cellDataType: 'date' },
  { field: 'settleDate', headerName: 'Settle date', cellDataType: 'date' },
  { field: 'updatedAt', headerName: 'Updated', cellDataType: 'date' },
];

/** Column metadata for editors and the assistant, derived from the defs and a data sample. */
export function describeColumns(defs: ColDef<Trade>[], sample: Trade[]): ColumnInfo[] {
  return defs.map((d) => {
    const id = (d.colId ?? d.field)!;
    const values = sample.slice(0, 50).map((r) => (r as Record<string, unknown>)[id]);
    return {
      id,
      field: d.field,
      header: d.headerName ?? id,
      dataType: (typeof d.cellDataType === 'string' ? d.cellDataType : 'text') as ColumnInfo['dataType'],
      columnTypes: Array.isArray(d.type) ? d.type : d.type ? [d.type] : [],
      sampleValues: [...new Set(values)].slice(0, 8),
      distinctCount: new Set(sample.map((r) => (r as Record<string, unknown>)[id])).size,
      editable: d.editable === true,
      isPrimaryKey: id === 'tradeId',
      isSpecial: false,
    };
  });
}
