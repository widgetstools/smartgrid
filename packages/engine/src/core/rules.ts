/**
 * Rule compilation shared by formatting, flashing, alerts, badges and
 * filters: predicates read one column (or a referenced one), expressions
 * read the whole row. Relative-change functions see the change through
 * `RowContext.change`.
 */
import type { ColumnInfo, Rule } from '@smartgrid/schema';
import {
  compile,
  toBoolean,
  validate,
  type Env,
  type ExpressionKind,
  type PredicateContext,
  type PredicateRegistry,
  type RowContext,
  type Value,
} from '@smartgrid/expressions';

export interface RuleChange {
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface CompiledRule {
  /**
   * @param value   the scoped cell's value (predicates without columnId read this)
   * @param rowData the row (expressions and referenced-column predicates read this)
   * @param change  the data change being evaluated, if any
   */
  test(value: unknown, rowData: Record<string, unknown> | undefined, change?: RuleChange): boolean;
  /** Columns the rule reads, when known (expressions); predicates report their referenced columns. */
  columns: string[];
}

export const ALWAYS: CompiledRule = { test: () => true, columns: [] };

export function rowContextFor(
  rowData: Record<string, unknown> | undefined,
  change?: RuleChange,
  rowId?: string,
): RowContext {
  return {
    get: (id) => rowData?.[id] as Value,
    rowId,
    change: change
      ? { columnId: change.columnId, oldValue: change.oldValue as Value, newValue: change.newValue as Value }
      : undefined,
  };
}

export interface RuleCompileOptions {
  env: Env;
  predicates: PredicateRegistry;
  predicateContext: PredicateContext;
  columns: readonly ColumnInfo[];
  /** Expression kind for expression rules; boolean by default. */
  kind?: ExpressionKind;
  /** Called with a human message when the rule cannot be compiled; the rule is then skipped (returns undefined). */
  warn: (message: string) => void;
  /** Name used in warnings. */
  name: string;
}

/** Compile a Rule; `undefined` rule = always true; invalid expression = warn and return undefined. */
export function compileRule(rule: Rule | undefined, opts: RuleCompileOptions): CompiledRule | undefined {
  if (!rule) return ALWAYS;
  if (rule.kind === 'expression') return compileExpressionRule(rule.expression, opts);
  const preds = rule.predicates;
  const op = rule.operator;
  const { predicates, predicateContext } = opts;
  return {
    columns: preds.map((p) => p.columnId).filter((c): c is string => !!c),
    test: (value, rowData, change) => {
      const results = preds.map((p) => {
        const v = p.columnId ? rowData?.[p.columnId] : value;
        const previousValue =
          change && (!p.columnId || p.columnId === change.columnId) ? change.oldValue : undefined;
        return predicates.evaluate(p, v, { ...predicateContext, previousValue });
      });
      return op === 'AND' ? results.every(Boolean) : results.some(Boolean);
    },
  };
}

export function compileExpressionRule(
  expression: string,
  opts: RuleCompileOptions,
): CompiledRule | undefined {
  const v = validate(expression, { kind: opts.kind ?? 'boolean', env: opts.env, columns: opts.columns });
  if (!v.ok) {
    opts.warn(`${opts.name}: ${v.errors.map((e) => e.message).join('; ')}; rule skipped`);
    return undefined;
  }
  const fn = compile(v.ast!, opts.env, { resolveColumn: v.resolveColumn });
  return {
    columns: v.columns,
    test: (_value, rowData, change) => {
      try {
        return toBoolean(fn(rowContextFor(rowData, change)));
      } catch {
        return false;
      }
    },
  };
}
