// Module registry. Order decides build sequence: calculated columns first
// (they add defs and ColumnInfo), then layout (order/visibility), then the
// visual modules, then filters. Each module file owns one config slice.
import type { EngineModule } from '../core/types.js';
import { alertsModule } from './alerts.js';
import { calculatedColumnsModule } from './calculatedColumns.js';
import { flashingModule } from './flashing.js';
import { formattingModule } from './formatting.js';
import { layoutModule } from './layout.js';
import { queriesModule } from './queries.js';
import { styledColumnsModule } from './styledColumns.js';

export const ENGINE_MODULES: readonly EngineModule<never>[] = [
  calculatedColumnsModule as EngineModule<never>,
  layoutModule as EngineModule<never>,
  formattingModule as EngineModule<never>,
  styledColumnsModule as EngineModule<never>,
  flashingModule as EngineModule<never>,
  alertsModule as EngineModule<never>,
  queriesModule as EngineModule<never>,
];

export {
  layoutModule,
  formattingModule,
  calculatedColumnsModule,
  styledColumnsModule,
  flashingModule,
  alertsModule,
  queriesModule,
};
