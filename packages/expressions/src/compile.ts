/**
 * Compile an AST to a closure. Operators are implemented here; named
 * functions come from the Env's registry. Aggregate, observable and
 * modifier calls are rejected at compile time — those tiers have their own
 * compilers that lower the tree before calling into this one.
 */
import { parse } from './parser.js';
import {
  EvaluationError,
  type Env,
  type FunctionDef,
  type Node,
  type RowContext,
  type Span,
  type Value,
} from './types.js';
import { compare, equals, isNil, numbers, toBoolean, toNumber } from './values.js';

export type Compiled = (row: RowContext) => Value;

export interface CompileOptions {
  /** Hook for tiers that lower special calls (aggregates) into closures. Return undefined to fall through. */
  lowerCall?: (
    node: Extract<Node, { type: 'call' }>,
    compileChild: (n: Node) => Compiled,
  ) => Compiled | undefined;
  /** Resolve `[name]` to a column id (friendly-name support). Default identity. */
  resolveColumn?: (name: string) => string;
}

class CompileError extends Error {
  constructor(
    message: string,
    public readonly span: Span,
  ) {
    super(message);
    this.name = 'CompileError';
  }
}

export { CompileError };

export function compile(node: Node, env: Env, opts: CompileOptions = {}): Compiled {
  const c = (n: Node): Compiled => compileNode(n, env, opts, c);
  return c(node);
}

/** Parse + compile, throwing ParseError / CompileError. */
export function compileSource(src: string, env: Env, opts: CompileOptions = {}): Compiled {
  return compile(parse(src), env, opts);
}

function compileNode(node: Node, env: Env, opts: CompileOptions, c: (n: Node) => Compiled): Compiled {
  switch (node.type) {
    case 'literal': {
      const v = node.value;
      return () => v;
    }
    case 'column': {
      const id = opts.resolveColumn ? opts.resolveColumn(node.id) : node.id;
      return (row) => row.get(id);
    }
    case 'field': {
      const path = node.path;
      return (row) => row.field?.(path);
    }
    case 'unary': {
      const arg = c(node.arg);
      if (node.op === 'NOT') return (row) => !toBoolean(arg(row));
      return (row) => {
        const n = toNumber(arg(row));
        return n === undefined ? undefined : -n;
      };
    }
    case 'binary':
      return compileBinary(node, c, env);
    case 'ternary': {
      const cond = c(node.cond);
      const then = c(node.then);
      const otherwise = c(node.else);
      return (row) => (toBoolean(cond(row)) ? then(row) : otherwise(row));
    }
    case 'case': {
      const subject = node.subject ? c(node.subject) : undefined;
      const whens = node.whens.map((w) => ({ when: c(w.when), then: c(w.then) }));
      const otherwise = node.else ? c(node.else) : undefined;
      const cs = env.caseSensitive;
      return (row) => {
        if (subject) {
          const s = subject(row);
          for (const w of whens) if (equals(s, w.when(row), cs)) return w.then(row);
        } else {
          for (const w of whens) if (toBoolean(w.when(row))) return w.then(row);
        }
        return otherwise ? otherwise(row) : undefined;
      };
    }
    case 'call':
      return compileCall(node, env, opts, c);
    case 'where':
      throw new CompileError('WHERE is only valid in aggregated and observable expressions', node.span);
  }
}

function compileBinary(
  node: Extract<Node, { type: 'binary' }>,
  c: (n: Node) => Compiled,
  env: Env,
): Compiled {
  const left = c(node.left);
  const right = c(node.right);
  const cs = env.caseSensitive;
  switch (node.op) {
    case 'AND':
      return (row) => toBoolean(left(row)) && toBoolean(right(row));
    case 'OR':
      return (row) => toBoolean(left(row)) || toBoolean(right(row));
    case '=':
      return (row) => equals(left(row), right(row), cs);
    case '!=':
      return (row) => !equals(left(row), right(row), cs);
    case '>':
      return (row) => cmp(left(row), right(row), cs, (d) => d > 0);
    case '>=':
      return (row) => cmp(left(row), right(row), cs, (d) => d >= 0);
    case '<':
      return (row) => cmp(left(row), right(row), cs, (d) => d < 0);
    case '<=':
      return (row) => cmp(left(row), right(row), cs, (d) => d <= 0);
    case '+':
      return (row) => {
        const a = left(row);
        const b = right(row);
        if (typeof a === 'string' || typeof b === 'string') {
          const n = numbers(a, b);
          if (n) return n[0] + n[1];
          if (isNil(a) || isNil(b)) return undefined;
          return String(a) + String(b);
        }
        const n = numbers(a, b);
        return n ? n[0] + n[1] : undefined;
      };
    case '-':
      return arith(left, right, (a, b) => a - b);
    case '*':
      return arith(left, right, (a, b) => a * b);
    case '/':
      return arith(left, right, (a, b) => (b === 0 ? undefined : a / b));
    case '%':
      return arith(left, right, (a, b) => (b === 0 ? undefined : a % b));
    case '^':
      return arith(left, right, (a, b) => Math.pow(a, b));
  }
}

function cmp(a: Value, b: Value, cs: boolean, test: (d: number) => boolean): boolean {
  const d = compare(a, b, cs);
  return d === undefined ? false : test(d);
}

function arith(left: Compiled, right: Compiled, op: (a: number, b: number) => number | undefined): Compiled {
  return (row) => {
    const n = numbers(left(row), right(row));
    return n ? op(n[0], n[1]) : undefined;
  };
}

function compileCall(
  node: Extract<Node, { type: 'call' }>,
  env: Env,
  opts: CompileOptions,
  c: (n: Node) => Compiled,
): Compiled {
  const lowered = opts.lowerCall?.(node, c);
  if (lowered) return lowered;
  const def = env.functions.get(node.name);
  if (!def) throw new CompileError(`Unknown function ${node.name}`, node.nameSpan);
  if (def.modifierOnly)
    throw new CompileError(
      `${def.name} can only be used inside an aggregation or observable function`,
      node.nameSpan,
    );
  if (!def.impl && !def.lazy)
    throw new CompileError(`${def.name} is not available in this context`, node.nameSpan);
  checkArity(def, node);
  const args = node.args.map(c);
  const span = node.span;
  if (def.lazy) {
    const lazy = def.lazy;
    return (row) => {
      try {
        return lazy(
          args.map((a) => () => a(row)),
          { row, env, span },
        );
      } catch (e) {
        throw withSpan(e, span);
      }
    };
  }
  const impl = def.impl!;
  return (row) => {
    try {
      return impl(
        args.map((a) => a(row)),
        { row, env, span },
      );
    } catch (e) {
      throw withSpan(e, span);
    }
  };
}

export function checkArity(def: FunctionDef, node: Extract<Node, { type: 'call' }>): void {
  const n = node.args.length;
  const { min, max } = def.arity;
  if (n < min || (max !== undefined && n > max)) {
    const expected = max === undefined ? `at least ${min}` : min === max ? `${min}` : `${min} to ${max}`;
    throw new CompileError(
      `${def.name} expects ${expected} argument${expected === '1' ? '' : 's'}, got ${n}`,
      node.span,
    );
  }
}

function withSpan(e: unknown, span: Span): unknown {
  if (e instanceof EvaluationError && e.start === undefined) {
    e.start = span.start;
    e.end = span.end;
  }
  return e;
}
