/**
 * Editor chrome over design-system tokens so the CodeMirror instance reads
 * like the other inputs: transparent ground, mono type, no gutters, the
 * focus ring drawn by the wrapping element rather than CodeMirror.
 */
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

export interface ThemeOptions {
  /** Visible rows used for the minimum height (ignored when `singleLine`). */
  rows?: number;
  singleLine?: boolean;
}

const LINE_HEIGHT_REM = 1.25;

export function expressionTheme({ rows = 3, singleLine = false }: ThemeOptions = {}): Extension {
  const minHeight = `${(singleLine ? 1 : Math.max(1, rows)) * LINE_HEIGHT_REM}rem`;
  return EditorView.theme({
    '&': {
      backgroundColor: 'transparent',
      color: 'inherit',
      fontFamily: 'var(--sg-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: 'var(--sg-text-sm, 0.875rem)',
      lineHeight: `${LINE_HEIGHT_REM}rem`,
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: 'inherit',
      overflow: singleLine ? 'hidden' : 'auto',
    },
    '.cm-content': {
      padding: '4px 0',
      minHeight,
      caretColor: 'var(--sg-foreground, currentColor)',
      whiteSpace: singleLine ? 'pre' : 'pre-wrap',
    },
    '.cm-line': { padding: '0 8px' },
    '.cm-gutters': { display: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--sg-foreground, currentColor)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
      { backgroundColor: 'var(--sg-state-selection, var(--sg-muted, Highlight))' },
    '.cm-placeholder': { color: 'var(--sg-muted-foreground, currentColor)', fontStyle: 'normal' },
    '.cm-matchingBracket': {
      outline: '1px solid var(--sg-ring, currentColor)',
      borderRadius: '2px',
      backgroundColor: 'transparent',
    },
    '.cm-nonmatchingBracket': { color: 'var(--sg-negative, currentColor)' },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--sg-negative, currentColor)',
      textUnderlineOffset: '2px',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--sg-warning, currentColor)',
      textUnderlineOffset: '2px',
    },
    '.cm-lintPoint': { display: 'none' },
    '.cm-tooltip': {
      backgroundColor: 'var(--sg-popover, Canvas)',
      color: 'var(--sg-popover-foreground, CanvasText)',
      border: '1px solid var(--sg-border, currentColor)',
      borderRadius: 'var(--sg-radius-md, 6px)',
      boxShadow: 'var(--sg-shadow-overlay, none)',
      fontFamily: 'var(--sg-font-sans, system-ui, sans-serif)',
      fontSize: 'var(--sg-text-xs, 0.75rem)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--sg-font-mono, ui-monospace, monospace)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--sg-accent, Highlight)',
      color: 'var(--sg-accent-foreground, HighlightText)',
    },
    '.cm-completionDetail': { marginLeft: '8px', color: 'var(--sg-muted-foreground, currentColor)' },
    '.cm-tooltip.cm-completionInfo': { padding: '6px 8px', maxWidth: '24rem' },
    '.cm-diagnostic': { padding: '4px 8px', borderLeft: '3px solid' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--sg-negative, currentColor)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--sg-warning, currentColor)' },
  });
}

/**
 * Single-line variant: Enter is swallowed (completions still accept on Enter
 * since their keymap has higher precedence) and pasted line breaks become
 * spaces so the document never grows a second line.
 */
export const singleLine: Extension = [
  Prec.high(
    keymap.of([
      { key: 'Enter', run: () => true },
      { key: 'Shift-Enter', run: () => true },
    ]),
  ),
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    let multiline = false;
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (inserted.lines > 1) multiline = true;
    });
    if (!multiline) return tr;
    const changes: { from: number; to: number; insert: string }[] = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ from: fromA, to: toA, insert: inserted.toString().replace(/[\r\n]/g, ' ') });
    });
    return {
      changes,
      selection: tr.selection,
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
    };
  }),
];
