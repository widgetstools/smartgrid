/**
 * Recursive-descent parser for AdaptableQL.
 *
 * Precedence, lowest to highest:
 *   WHERE (top level only)  >  ?:  >  OR  >  AND  >  NOT  >  comparison
 *   >  + -  >  * / %  >  unary -  >  ^ (right assoc)  >  primary
 *
 * Column refs: `[Col Id]` or `COL("id")`; non-column data `FIELD('a.b')`.
 * `CASE [x] WHEN v THEN r ELSE r END` and `CASE WHEN cond THEN r END`.
 */
import { tokenize, type Token } from './tokenizer.js';
import { ParseError, type BinaryOp, type Node, type Span } from './types.js';

const COMPARISON = new Set(['=', '!=', '>', '>=', '<', '<=']);

export interface ParseOptions {
  /** Allow a trailing `WHERE cond` (aggregated and observable expressions). Default true. */
  allowWhere?: boolean;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly src: string,
    private readonly opts: ParseOptions,
  ) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }
  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.pos++;
    return t;
  }
  private is(type: Token['type'], value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  private accept(type: Token['type'], value?: string): Token | undefined {
    return this.is(type, value) ? this.next() : undefined;
  }
  private expect(type: Token['type'], value: string, what = value): Token {
    const t = this.peek();
    if (t.type === type && t.value === value) return this.next();
    throw this.unexpected(t, `Expected ${what}`);
  }
  private unexpected(t: Token, prefix?: string): ParseError {
    const found = t.type === 'eof' ? 'end of expression' : `"${t.raw}"`;
    return new ParseError(
      prefix ? `${prefix} but found ${found}` : `Unexpected ${found}`,
      t.start,
      Math.max(t.end, t.start + 1),
    );
  }

  parse(): Node {
    if (this.is('eof')) throw new ParseError('Expression is empty', 0, 0);
    let node = this.ternary();
    if (this.opts.allowWhere !== false && this.accept('keyword', 'WHERE')) {
      const cond = this.ternary();
      node = { type: 'where', expr: node, cond, span: span(node.span, cond.span) };
    }
    const t = this.peek();
    if (t.type !== 'eof') {
      if (t.type === 'keyword' && t.value === 'WHERE')
        throw new ParseError('WHERE is not allowed here', t.start, t.end);
      throw this.unexpected(t);
    }
    return node;
  }

  private ternary(): Node {
    const cond = this.or();
    if (this.accept('punct', '?')) {
      const then = this.ternary();
      this.expect('punct', ':', '":" for the else branch');
      const otherwise = this.ternary();
      return { type: 'ternary', cond, then, else: otherwise, span: span(cond.span, otherwise.span) };
    }
    return cond;
  }

  private or(): Node {
    let left = this.and();
    while (this.accept('keyword', 'OR')) {
      const right = this.and();
      left = bin('OR', left, right);
    }
    return left;
  }

  private and(): Node {
    let left = this.not();
    while (this.accept('keyword', 'AND')) {
      const right = this.not();
      left = bin('AND', left, right);
    }
    return left;
  }

  private not(): Node {
    const t = this.accept('keyword', 'NOT');
    if (t) {
      const arg = this.not();
      return { type: 'unary', op: 'NOT', arg, span: { start: t.start, end: arg.span.end } };
    }
    return this.comparison();
  }

  private comparison(): Node {
    const left = this.additive();
    const t = this.peek();
    if (t.type === 'op' && COMPARISON.has(t.value)) {
      this.next();
      const right = this.additive();
      const node = bin(t.value as BinaryOp, left, right);
      const again = this.peek();
      if (again.type === 'op' && COMPARISON.has(again.value)) {
        throw new ParseError('Comparisons cannot be chained; use AND', again.start, again.end);
      }
      return node;
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        left = bin(t.value, left, this.multiplicative());
      } else return left;
    }
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next();
        left = bin(t.value, left, this.unary());
      } else return left;
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t.type === 'op' && t.value === '-') {
      this.next();
      const arg = this.unary();
      if (arg.type === 'literal' && typeof arg.value === 'number') {
        return { type: 'literal', value: -arg.value, span: { start: t.start, end: arg.span.end } };
      }
      return { type: 'unary', op: '-', arg, span: { start: t.start, end: arg.span.end } };
    }
    if (t.type === 'op' && t.value === '+') {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    if (this.accept('op', '^')) {
      const exp = this.unary();
      return bin('^', base, exp);
    }
    return base;
  }

  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'number': {
        const v = Number(t.value);
        if (!Number.isFinite(v)) throw new ParseError(`Invalid number "${t.raw}"`, t.start, t.end);
        return { type: 'literal', value: v, span: t };
      }
      case 'string':
        return { type: 'literal', value: t.value, span: t };
      case 'column':
        return { type: 'column', id: t.value, span: t };
      case 'keyword':
        if (t.value === 'TRUE') return { type: 'literal', value: true, span: t };
        if (t.value === 'FALSE') return { type: 'literal', value: false, span: t };
        if (t.value === 'NULL') return { type: 'literal', value: null, span: t };
        if (t.value === 'CASE') return this.caseExpr(t);
        throw this.unexpected(t);
      case 'punct':
        if (t.value === '(') {
          const inner = this.ternary();
          const close = this.expect('punct', ')', 'closing )');
          return { ...inner, span: { start: t.start, end: close.end } };
        }
        throw this.unexpected(t);
      case 'ident':
        return this.call(t);
      case 'eof':
        throw new ParseError('Unexpected end of expression', t.start, t.end);
      default:
        throw this.unexpected(t);
    }
  }

  private call(nameTok: Token): Node {
    if (!this.is('punct', '(')) {
      throw new ParseError(
        `Unknown identifier "${nameTok.raw}". Column references use [brackets]; functions need ()`,
        nameTok.start,
        nameTok.end,
      );
    }
    this.next();
    const args: Node[] = [];
    if (!this.is('punct', ')')) {
      for (;;) {
        args.push(this.ternary());
        if (this.accept('punct', ',')) continue;
        break;
      }
    }
    const close = this.expect('punct', ')', 'closing )');
    const name = nameTok.value;
    const full: Span = { start: nameTok.start, end: close.end };
    // COL("id") is sugar for [id]
    if (
      name === 'COL' &&
      args.length === 1 &&
      args[0]!.type === 'literal' &&
      typeof args[0]!.value === 'string'
    ) {
      return { type: 'column', id: args[0]!.value, span: full };
    }
    if (
      name === 'FIELD' &&
      args.length === 1 &&
      args[0]!.type === 'literal' &&
      typeof args[0]!.value === 'string'
    ) {
      return { type: 'field', path: args[0]!.value, span: full };
    }
    if (name === 'NULL' && args.length === 0) return { type: 'literal', value: null, span: full };
    return { type: 'call', name, args, span: full, nameSpan: nameTok };
  }

  private caseExpr(start: Token): Node {
    const subject = this.is('keyword', 'WHEN') ? undefined : this.ternary();
    const whens: { when: Node; then: Node }[] = [];
    while (this.accept('keyword', 'WHEN')) {
      const when = this.ternary();
      this.expect('keyword', 'THEN');
      const then = this.ternary();
      whens.push({ when, then });
    }
    if (whens.length === 0) throw this.unexpected(this.peek(), 'Expected WHEN');
    const otherwise = this.accept('keyword', 'ELSE') ? this.ternary() : undefined;
    const end = this.expect('keyword', 'END');
    return { type: 'case', subject, whens, else: otherwise, span: { start: start.start, end: end.end } };
  }
}

function span(a: Span, b: Span): Span {
  return { start: a.start, end: b.end };
}

function bin(op: BinaryOp, left: Node, right: Node): Node {
  return { type: 'binary', op, left, right, span: span(left.span, right.span) };
}

const cache = new Map<string, Node>();
const CACHE_MAX = 500;

/** Parse to an AST. Results are cached by source text (LRU-ish, 500 entries). Throws ParseError. */
export function parse(src: string, opts: ParseOptions = {}): Node {
  const key = `${opts.allowWhere === false ? '0' : '1'}|${src}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const node = new Parser(tokenize(src), src, opts).parse();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, node);
  return node;
}

/** Parse without throwing. */
export function tryParse(
  src: string,
  opts?: ParseOptions,
): { ok: true; ast: Node } | { ok: false; error: ParseError } {
  try {
    return { ok: true, ast: parse(src, opts) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e };
    throw e;
  }
}

/** Depth-first visit. Return false from `fn` to skip children. */
export function walk(node: Node, fn: (n: Node, parent?: Node) => boolean | void, parent?: Node): void {
  if (fn(node, parent) === false) return;
  switch (node.type) {
    case 'unary':
      walk(node.arg, fn, node);
      break;
    case 'binary':
      walk(node.left, fn, node);
      walk(node.right, fn, node);
      break;
    case 'ternary':
      walk(node.cond, fn, node);
      walk(node.then, fn, node);
      walk(node.else, fn, node);
      break;
    case 'case':
      if (node.subject) walk(node.subject, fn, node);
      for (const w of node.whens) {
        walk(w.when, fn, node);
        walk(w.then, fn, node);
      }
      if (node.else) walk(node.else, fn, node);
      break;
    case 'call':
      for (const a of node.args) walk(a, fn, node);
      break;
    case 'where':
      walk(node.expr, fn, node);
      walk(node.cond, fn, node);
      break;
    default:
      break;
  }
}

/** Column ids referenced anywhere in the tree, in first-seen order. */
export function columnsOf(node: Node): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === 'column' && !out.includes(n.id)) out.push(n.id);
  });
  return out;
}

/** Function names referenced anywhere in the tree (upper-case). */
export function functionsOf(node: Node): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === 'call' && !out.includes(n.name)) out.push(n.name);
  });
  return out;
}

/** Print an AST back to canonical source (used to substitute friendly names and by tests). */
export function print(node: Node, columnName: (id: string) => string = (id) => id): string {
  const p = (n: Node): string => print(n, columnName);
  switch (node.type) {
    case 'literal':
      if (node.value === null) return 'NULL';
      if (typeof node.value === 'string') return `'${node.value.replace(/'/g, "''")}'`;
      return String(node.value);
    case 'column':
      return `[${columnName(node.id)}]`;
    case 'field':
      return `FIELD('${node.path}')`;
    case 'unary':
      return node.op === 'NOT' ? `NOT ${wrap(node.arg, p)}` : `-${wrap(node.arg, p)}`;
    case 'binary':
      return `${wrap(node.left, p)} ${node.op} ${wrap(node.right, p)}`;
    case 'ternary':
      return `${p(node.cond)} ? ${p(node.then)} : ${p(node.else)}`;
    case 'case':
      return `CASE${node.subject ? ` ${p(node.subject)}` : ''}${node.whens.map((w) => ` WHEN ${p(w.when)} THEN ${p(w.then)}`).join('')}${node.else ? ` ELSE ${p(node.else)}` : ''} END`;
    case 'call':
      return `${node.name}(${node.args.map(p).join(', ')})`;
    case 'where':
      return `${p(node.expr)} WHERE ${p(node.cond)}`;
  }
}

function wrap(n: Node, p: (n: Node) => string): string {
  return n.type === 'binary' || n.type === 'ternary' || n.type === 'where' ? `(${p(n)})` : p(n);
}
