import { MapFunctionRegistry } from './registry.js';
import { SYSTEM_FUNCTIONS } from './functions/index.js';
import type { Env, FunctionDef } from './types.js';

let shared: MapFunctionRegistry | undefined;

/** Registry with every system function (scalar, boolean, aggregated, observable). */
export function defaultFunctionRegistry(): MapFunctionRegistry {
  shared ??= new MapFunctionRegistry(SYSTEM_FUNCTIONS);
  return shared;
}

export interface EnvOptions extends Partial<Omit<Env, 'functions'>> {
  /** Extra or overriding functions (custom scalar/boolean functions). */
  functions?: readonly FunctionDef[];
}

/** Build an evaluation environment; defaults mirror AdapTable (case-insensitive text, Mon–Fri work days). */
export function createEnv(opts: EnvOptions = {}): Env {
  const functions = opts.functions?.length
    ? defaultFunctionRegistry().extend(opts.functions)
    : defaultFunctionRegistry();
  return {
    functions,
    now: opts.now ?? (() => new Date()),
    caseSensitive: opts.caseSensitive ?? false,
    variables: opts.variables,
    namedQuery: opts.namedQuery,
    isHoliday: opts.isHoliday,
    workDays: opts.workDays ?? [1, 2, 3, 4, 5],
  };
}
