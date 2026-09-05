// @smartgrid/engine — config document → AG Grid inputs. Framework-agnostic.
export { buildGrid, type BuildInput, type BuildOutput } from './build.js';
export {
  buildValueFormatter,
  formatDatePattern,
  NUMBER_PRESET_OPTIONS,
  type FormatContext,
  type ValueFormatterFn,
} from './formatters.js';
export { buildStylesheet, styleToDeclarations, resolveColor, type StyleRule, type Theme } from './styles.js';
export { columnsInScope, rowKindAllowed } from './scope.js';
