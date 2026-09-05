import type { CalculatedColumnsModule } from '@smartgrid/schema';
import type { EngineModule } from '../core/types.js';

/** Placeholder until the module is implemented; a build with this slice does nothing. */
export const calculatedColumnsModule: EngineModule<CalculatedColumnsModule> = {
  id: 'calculatedColumns',
  order: 10,
  build() {
    /* implemented in M2 */
  },
};
