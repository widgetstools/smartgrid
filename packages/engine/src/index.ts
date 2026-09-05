// @smartgrid/engine — config document → AG Grid inputs + live runtime. Framework-agnostic.
export { buildGrid, envForConfig, type BuildInput, type BuildOutput } from './build.js';
export type {
  ActiveFlash,
  AlertEvent,
  BuildContext,
  BuildDraft,
  ColumnStats,
  EngineModule,
  FlashService,
  RuntimeEvent,
  StatsService,
} from './core/types.js';
export {
  compileRule,
  compileExpressionRule,
  rowContextFor,
  ALWAYS,
  type CompiledRule,
  type RuleChange,
  type RuleCompileOptions,
} from './core/rules.js';
export { colIdOf, flattenDefs, restoreGroups, kindOf, classFor, appendClass } from './core/defs.js';
export {
  GridRuntime,
  type CellChange,
  type RowChange,
  type RuntimeHost,
  type RuntimePart,
  type RuntimeListener,
} from './runtime/runtime.js';
export { ENGINE_MODULES } from './modules/index.js';
export { FC_CLASS } from './modules/formatting.js';
export {
  flashingModule,
  FLASH_CLASS,
  FLASH_DIRECTIONS,
  flashDirection,
  paramsRowId,
  rowStyleCss,
  type FlashDirection,
  type FlashingRuntimePart,
} from './modules/flashing.js';
export {
  alertsModule,
  ALERT_CLASS,
  ALERT_ROW_CLASS,
  DEFAULT_HIGHLIGHT_STYLE,
  type AlertsRuntimePart,
  type AlertTrigger,
} from './modules/alerts.js';
export { nextRun as nextCronRun, matches as cronMatches, parseCron, type CronSpec } from './core/cron.js';
export {
  styledColumnsModule,
  STYLED_COLUMN_RENDERER,
  SC_CLASS,
  type StyledColumnRendererParams,
} from './modules/styledColumns.js';
export {
  calculatedColumnsModule,
  CALCULATED_COLUMN_TYPE,
  type CalculatedColumnsRuntimePart,
} from './modules/calculatedColumns.js';
export {
  queriesModule,
  filtersSignature,
  QUICK_SEARCH_CLASS,
  type QueriesRuntimePart,
} from './modules/queries.js';
export { applyLayout, gridOptionsFromLayout, aggFuncFor, currentLayout } from './modules/layout.js';
export {
  buildValueFormatter,
  formatDatePattern,
  NUMBER_PRESET_OPTIONS,
  type FormatContext,
  type ValueFormatterFn,
} from './formatters.js';
export { buildStylesheet, styleToDeclarations, resolveColor, type StyleRule, type Theme } from './styles.js';
export { columnsInScope, rowKindAllowed, type RowKind } from './scope.js';
