/**
 * @smartgrid/design-system/react — the only React-dependent entry point.
 * `react` and `lucide-react` are optional peers needed solely for this subpath.
 *
 *   import { DynamicIcon } from '@smartgrid/design-system/react';
 *   <DynamicIcon icon="lucide:file-text" style={{ width: 14, height: 14 }} />
 *   <DynamicIcon icon="mkt:bond" />
 */
export { DynamicIcon, type DynamicIconProps } from './DynamicIcon';
export type { LucideIcon, LucideProps } from 'lucide-react';
export {
  StyledColumnRenderer,
  styledColumnComponents,
  type StyledColumnRendererProps,
} from './StyledColumnRenderer';
