import type { QueriesModule } from '@smartgrid/schema';
import type { EngineModule } from '../core/types.js';

/** Placeholder until the module is implemented; a build with this slice does nothing. */
export const queriesModule: EngineModule<QueriesModule> = {
  id: 'queries',
  order: 70,
  build() {
    /* implemented in M2 */
  },
};
