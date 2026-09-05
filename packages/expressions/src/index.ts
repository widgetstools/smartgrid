// @smartgrid/expressions — AdaptableQL-compatible expression language.
//
//   parse(src)                        → AST with spans (cached)
//   validate(src, { kind, env, columns }) → positioned errors, columns, return type
//   compileSource(src, env)           → (row) => value        per-row scalar / boolean
//   compileAggregatedSource(src, env) → AggregatedProgram     SUM/AVG/…, GROUP_BY, WHERE, CUMUL, QUANT
//   compileObservableSource(src, env) → ObservableSpec + ObservableWatcher (time windows)
//   createEnv({ functions?, caseSensitive?, variables?, namedQuery? })
//   predicates: PredicateRegistry, SYSTEM_PREDICATES (AdapTable's 45 ids)
export * from './types.js';
export { tokenize, type Token, type TokenType, KEYWORDS } from './tokenizer.js';
export { parse, tryParse, walk, columnsOf, functionsOf, print, type ParseOptions } from './parser.js';
export * from './values.js';
export {
  compile,
  compileSource,
  checkArity,
  CompileError,
  type Compiled,
  type CompileOptions,
} from './compile.js';
export {
  compileAggregated,
  compileAggregatedSource,
  isAggregateCall,
  reduce,
  AGGREGATE_FUNCTIONS,
  MODIFIER_FUNCTIONS,
  type AggregatedProgram,
  type GroupResult,
} from './aggregate.js';
export {
  compileObservable,
  compileObservableSource,
  ObservableWatcher,
  OBSERVABLE_FUNCTIONS,
  CHANGE_TYPES,
  DEFAULT_MAX_TIMEFRAME_MS,
  HARD_MAX_TIMEFRAME_MS,
  type ObservableSpec,
  type ObservableTrigger,
  type RowEvent,
  type ChangeType,
} from './observable.js';
export { inferType } from './infer.js';
export {
  validate,
  columnResolver,
  suggest,
  type ValidateOptions,
  type ValidationResult,
  type ColumnLike,
} from './validate.js';
export { MapFunctionRegistry } from './registry.js';
export { createEnv, defaultFunctionRegistry, type EnvOptions } from './env.js';
export * from './functions/index.js';
export * from './predicates.js';
