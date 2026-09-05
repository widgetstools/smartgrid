// System function catalogue. Each file exports an array of FunctionDef; the
// order matters only for palette grouping. Scalar/boolean/date/string/misc
// files are the per-row tier; aggregate.ts holds metadata for the
// aggregated and observable tiers whose implementations live outside the
// closure compiler.
//
// The registry keeps one definition per name (last wins). MIN / MAX / AVG
// exist in both the per-row and aggregated tiers, so the numeric definitions
// carry the merged metadata and the impl-less aggregate entries for those
// names are skipped here.
import type { FunctionDef } from '../types.js';
import { AGGREGATE_DEFS, OBSERVABLE_DEFS } from './aggregate.js';
import { BOOLEAN_DEFS } from './boolean.js';
import { DATE_DEFS } from './date.js';
import { MISC_DEFS } from './misc.js';
import { NUMERIC_DEFS } from './numeric.js';
import { STRING_DEFS } from './string.js';

const PER_ROW_DEFS: FunctionDef[] = [
  ...BOOLEAN_DEFS,
  ...NUMERIC_DEFS,
  ...DATE_DEFS,
  ...STRING_DEFS,
  ...MISC_DEFS,
];
const perRowNames = new Set(PER_ROW_DEFS.map((d) => d.name));

export const SYSTEM_FUNCTIONS: FunctionDef[] = [
  ...PER_ROW_DEFS,
  ...AGGREGATE_DEFS.filter((d) => !perRowNames.has(d.name)),
  ...OBSERVABLE_DEFS,
];

export { AGGREGATE_DEFS, OBSERVABLE_DEFS, BOOLEAN_DEFS, NUMERIC_DEFS, DATE_DEFS, STRING_DEFS, MISC_DEFS };
