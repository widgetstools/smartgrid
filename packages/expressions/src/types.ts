/**
 * AdaptableQL-compatible expression language: shared types.
 *
 * Positions are character offsets into the source string (half-open ranges)
 * so editors can underline exactly the failing token.
 */
import type { CellDataType, ExpressionKind } from '@smartgrid/schema';

export interface Span {
  start: number;
  end: number;
}

/** Runtime value. Arrays come from TO_ARRAY / array columns; objects from FIELD paths. */
export type Value = number | string | boolean | Date | null | undefined | Value[] | { [k: string]: Value };

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '>' | '>=' | '<' | '<=' | 'AND' | 'OR';

export type UnaryOp = '-' | 'NOT';

export type Node =
  | { type: 'literal'; value: number | string | boolean | null; span: Span }
  | { type: 'column'; id: string; span: Span }
  | { type: 'field'; path: string; span: Span }
  | { type: 'unary'; op: UnaryOp; arg: Node; span: Span }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node; span: Span }
  | { type: 'ternary'; cond: Node; then: Node; else: Node; span: Span }
  | { type: 'case'; subject?: Node; whens: { when: Node; then: Node }[]; else?: Node; span: Span }
  | { type: 'call'; name: string; args: Node[]; span: Span; nameSpan: Span }
  | { type: 'where'; expr: Node; cond: Node; span: Span };

export type NodeType = Node['type'];

export interface ExpressionError {
  message: string;
  start: number;
  end: number;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly start: number,
    public readonly end: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
  toError(): ExpressionError {
    return { message: this.message, start: this.start, end: this.end };
  }
}

/** Raised by a function at evaluation time; carries the call span when re-thrown by the compiler. */
export class EvaluationError extends Error {
  start?: number;
  end?: number;
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationError';
  }
}

/** Value type as inferred statically or reported by a function. */
export type ValueType = 'number' | 'text' | 'boolean' | 'date' | 'array' | 'any';

/** Column type → value type used by inference and by the editor's completions. */
export function valueTypeOf(dataType: CellDataType): ValueType {
  switch (dataType) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'dateString':
      return 'date';
    case 'text':
      return 'text';
    case 'textArray':
    case 'numberArray':
    case 'tupleArray':
    case 'objectArray':
      return 'array';
    default:
      return 'any';
  }
}

/** Per-row data access. Hosts adapt AG Grid row nodes to this. */
export interface RowContext {
  /** Cell value for a column id (raw, not display). */
  get(columnId: string): Value;
  /** Non-column data by dotted path, for FIELD('a.b'). */
  field?(path: string): Value;
  rowId?: string;
  /** Present while evaluating a data-change event; used by relative-change functions. */
  change?: { columnId: string; oldValue: Value; newValue: Value };
  /** Group values when evaluating a group row. */
  groupValues?: Record<string, Value>;
}

export interface FunctionContext {
  row: RowContext;
  env: Env;
  /** Call span, for error reporting. */
  span: Span;
}

/** Evaluated argument list; `lazy` functions receive thunks instead. */
export type FunctionImpl = (args: Value[], ctx: FunctionContext) => Value;
export type LazyFunctionImpl = (args: (() => Value)[], ctx: FunctionContext) => Value;

export type FunctionCategory =
  | 'boolean'
  | 'numeric'
  | 'date'
  | 'string'
  | 'misc'
  | 'aggregated'
  | 'relativeChange'
  | 'observable'
  | 'advanced';

export interface FunctionDef {
  name: string;
  category: FunctionCategory;
  returnType: ValueType;
  description: string;
  /** Human signatures for completions, e.g. `SUB_STRING(text, start, end?)`. */
  signatures: string[];
  examples?: string[];
  /** Expression kinds where the function may appear. */
  kinds: ExpressionKind[];
  /** Inclusive argument count bounds; `max` undefined = variadic. */
  arity: { min: number; max?: number };
  /** Modifier functions (GROUP_BY, WHERE …) are only valid as arguments of other functions. */
  modifierOnly?: boolean;
  impl?: FunctionImpl;
  lazy?: LazyFunctionImpl;
  /** Hide from palettes (deprecated aliases). */
  hidden?: boolean;
}

/** Everything evaluation may need beyond the row. Hosts build one per grid. */
export interface Env {
  functions: FunctionRegistry;
  now: () => Date;
  /** String comparisons and CONTAINS etc. Default false (AdapTable default). */
  caseSensitive: boolean;
  /** VAR("NAME") / VAR("NAME", arg). */
  variables?: (name: string, arg?: Value) => Value;
  /** QUERY("Name") → expression source. */
  namedQuery?: (name: string) => string | undefined;
  /** Holiday calendar for IS_HOLIDAY / IS_WORKDAY. */
  isHoliday?: (d: Date) => boolean;
  /** 0 = Sunday … 6 = Saturday. Default Mon–Fri. */
  workDays?: readonly number[];
}

export interface FunctionRegistry {
  get(name: string): FunctionDef | undefined;
  has(name: string): boolean;
  list(kind?: ExpressionKind): readonly FunctionDef[];
  register(def: FunctionDef): void;
}

export type { CellDataType, ExpressionKind };
