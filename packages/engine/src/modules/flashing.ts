import type { FlashingModule } from '@smartgrid/schema';
import type { EngineModule } from '../core/types.js';

/** Placeholder until the module is implemented; a build with this slice does nothing. */
export const flashingModule: EngineModule<FlashingModule> = {
  id: 'flashing',
  order: 50,
  build() {
    /* implemented in M2 */
  },
};
