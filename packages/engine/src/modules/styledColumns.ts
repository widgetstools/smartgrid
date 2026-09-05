import type { StyledColumnsModule } from '@smartgrid/schema';
import type { EngineModule } from '../core/types.js';

/** Placeholder until the module is implemented; a build with this slice does nothing. */
export const styledColumnsModule: EngineModule<StyledColumnsModule> = {
  id: 'styledColumns',
  order: 40,
  build() {
    /* implemented in M2 */
  },
};
