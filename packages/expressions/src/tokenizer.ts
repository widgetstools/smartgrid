import { ParseError, type Span } from './types.js';

export type TokenType = 'number' | 'string' | 'column' | 'ident' | 'keyword' | 'op' | 'punct' | 'eof';

export interface Token extends Span {
  type: TokenType;
  /** Normalised text: keywords/identifiers upper-cased, strings unescaped, column ids trimmed. */
  value: string;
  /** Source text as written. */
  raw: string;
}

export const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'TRUE',
  'FALSE',
  'NULL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WHERE',
]);

const OPERATORS = ['>=', '<=', '!=', '<>', '=', '>', '<', '+', '-', '*', '/', '%', '^'] as const;
const PUNCT = new Set(['(', ')', ',', '?', ':']);

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * Split an expression into tokens. Throws ParseError with the offending span
 * on unterminated strings/column refs or unexpected characters.
 */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;

    // Column reference [Column Id]
    if (c === '[') {
      const close = src.indexOf(']', i + 1);
      if (close < 0) throw new ParseError('Unterminated column reference: missing ]', start, n);
      const raw = src.slice(start, close + 1);
      const id = src.slice(i + 1, close).trim();
      if (!id) throw new ParseError('Empty column reference', start, close + 1);
      out.push({ type: 'column', value: id, raw, start, end: close + 1 });
      i = close + 1;
      continue;
    }

    // String literal, single or double quoted, backslash and doubled-quote escapes
    if (c === "'" || c === '"') {
      let j = i + 1;
      let text = '';
      let closed = false;
      while (j < n) {
        const d = src[j]!;
        if (d === '\\' && j + 1 < n) {
          text += src[j + 1];
          j += 2;
          continue;
        }
        if (d === c) {
          if (src[j + 1] === c) {
            text += c;
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        text += d;
        j++;
      }
      if (!closed) throw new ParseError(`Unterminated string: missing closing ${c}`, start, n);
      out.push({ type: 'string', value: text, raw: src.slice(start, j), start, end: j });
      i = j;
      continue;
    }

    // Number: 12, 1.5, .5, 1e3, 1.5E-2
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      while (j < n && isDigit(src[j]!)) j++;
      if (src[j] === '.' && isDigit(src[j + 1] ?? '')) {
        j++;
        while (j < n && isDigit(src[j]!)) j++;
      } else if (src[j] === '.' && !isIdentStart(src[j + 1] ?? '')) {
        j++;
      }
      if (
        (src[j] === 'e' || src[j] === 'E') &&
        (isDigit(src[j + 1] ?? '') ||
          ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2] ?? '')))
      ) {
        j += 2;
        while (j < n && isDigit(src[j]!)) j++;
      }
      const raw = src.slice(start, j);
      if (isIdentPart(src[j] ?? '')) throw new ParseError(`Invalid number "${raw}${src[j]}"`, start, j + 1);
      out.push({ type: 'number', value: raw, raw, start, end: j });
      i = j;
      continue;
    }

    // Identifier or keyword
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j]!)) j++;
      const raw = src.slice(start, j);
      const upper = raw.toUpperCase();
      out.push({ type: KEYWORDS.has(upper) ? 'keyword' : 'ident', value: upper, raw, start, end: j });
      i = j;
      continue;
    }

    // Operators (longest first)
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ type: 'op', value: op === '<>' ? '!=' : op, raw: op, start, end: i + op.length });
      i += op.length;
      continue;
    }

    if (PUNCT.has(c)) {
      out.push({ type: 'punct', value: c, raw: c, start, end: i + 1 });
      i++;
      continue;
    }

    if (c === ']') throw new ParseError('Unexpected ] without a matching [', start, start + 1);
    throw new ParseError(`Unexpected character "${c}"`, start, start + 1);
  }
  out.push({ type: 'eof', value: '', raw: '', start: n, end: n });
  return out;
}
