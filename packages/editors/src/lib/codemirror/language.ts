/**
 * AdaptableQL language support for CodeMirror 6: a stream tokenizer that
 * mirrors `@smartgrid/expressions`' tokenizer classes, a highlight style that
 * maps those classes onto design-system tokens, and bracket matching /
 * auto-closing for `( ) [ ] ' "`.
 */
import { closeBrackets } from '@codemirror/autocomplete';
import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  StringStream,
  bracketMatching,
  syntaxHighlighting,
  type StreamParser,
} from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { KEYWORDS } from '@smartgrid/expressions';

/** Token classes produced by the stream tokenizer. */
export type TokenClass =
  | 'keyword'
  | 'column'
  | 'string'
  | 'number'
  | 'function'
  | 'variableName'
  | 'operator'
  | 'paren'
  | 'squareBracket'
  | 'punctuation'
  | 'invalid';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const OPERATOR = /^(?:>=|<=|!=|<>|[=<>+\-*/%^])/;

/** Classify the next token on `stream`; `null` for whitespace. */
export function scanToken(stream: StringStream): TokenClass | null {
  if (stream.eatSpace()) return null;
  const c = stream.peek();
  if (c === '[') {
    if (stream.match(/^\[[^\]]*\]/)) return 'column';
    stream.skipToEnd();
    return 'invalid';
  }
  if (c === "'" || c === '"') {
    const re = c === "'" ? /^'(?:[^'\\]|\\.|'')*'/ : /^"(?:[^"\\]|\\.|"")*"/;
    if (stream.match(re)) return 'string';
    stream.skipToEnd();
    return 'invalid';
  }
  if (stream.match(NUMBER)) {
    if (stream.match(IDENT)) return 'invalid';
    return 'number';
  }
  const ident = stream.match(IDENT) as RegExpMatchArray | null;
  if (ident) {
    if (KEYWORDS.has(ident[0].toUpperCase())) return 'keyword';
    if (stream.match(/^\s*\(/, false)) return 'function';
    return 'variableName';
  }
  if (stream.match(OPERATOR)) return 'operator';
  if (c === '(' || c === ')') {
    stream.next();
    return 'paren';
  }
  if (c === ',' || c === '?' || c === ':') {
    stream.next();
    return 'punctuation';
  }
  if (c === ']') {
    stream.next();
    return 'squareBracket';
  }
  stream.next();
  return 'invalid';
}

const parser: StreamParser<Record<string, never>> = {
  name: 'adaptableql',
  token: scanToken,
  tokenTable: {
    column: t.special(t.variableName),
    function: t.function(t.variableName),
  },
  languageData: {
    closeBrackets: { brackets: ['(', '[', "'", '"'] },
  },
};

/** The StreamLanguage instance; `adaptableQLLanguage.data` accepts completion sources. */
export const adaptableQLLanguage = StreamLanguage.define(parser);

/** Pure tokenizer over a single line, for tests and the gallery. */
export function classify(text: string): { from: number; to: number; type: TokenClass }[] {
  const out: { from: number; to: number; type: TokenClass }[] = [];
  const stream = new StringStream(text, 4, 2);
  while (!stream.eol()) {
    stream.start = stream.pos;
    const type = scanToken(stream);
    if (stream.pos === stream.start) {
      stream.next();
      continue;
    }
    if (type) out.push({ from: stream.start, to: stream.pos, type });
  }
  return out;
}

/** Highlight style over design-system tokens; every colour falls back to `currentColor`. */
export const adaptableQLHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--sg-primary, currentColor)', fontWeight: '600' },
  { tag: t.special(t.variableName), color: 'var(--sg-info, currentColor)' },
  { tag: t.string, color: 'var(--sg-positive, currentColor)' },
  { tag: t.number, color: 'var(--sg-accent-warning, currentColor)' },
  { tag: t.function(t.variableName), color: 'var(--sg-purple, currentColor)' },
  { tag: t.operator, color: 'var(--sg-muted-foreground, currentColor)' },
  { tag: t.invalid, textDecoration: 'underline wavy var(--sg-negative, currentColor)' },
]);

/** Language, highlighting, bracket matching and auto-closing in one extension. */
export function adaptableQL(): Extension {
  return new LanguageSupport(adaptableQLLanguage, [
    syntaxHighlighting(adaptableQLHighlightStyle, { fallback: true }),
    bracketMatching({ brackets: '()[]' }),
    closeBrackets(),
  ]);
}
