import type { AlertsModule } from '@smartgrid/schema';
import type { EngineModule } from '../core/types.js';

/** Placeholder until the module is implemented; a build with this slice does nothing. */
export const alertsModule: EngineModule<AlertsModule> = {
  id: 'alerts',
  order: 60,
  build() {
    /* implemented in M2 */
  },
};
