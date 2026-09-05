/**
 * Live validation for AdaptableQL through `@codemirror/lint`. The linter
 * runs `validate()` from `@smartgrid/expressions` (debounced) and merges in
 * any externally supplied errors (the assistant's validator output) so both
 * share one rendering.
 */
import { linter, type Diagnostic } from '@codemirror/lint';
import { Facet, type Extension } from '@codemirror/state';
import type { ExpressionKind } from '@smartgrid/schema';
import { createEnv, validate, type ColumnLike, type ExpressionError } from '@smartgrid/expressions';

export interface ExternalError {
  message: string;
  start?: number;
  end?: number;
}

export interface LintConfig {
  kind: ExpressionKind;
  columns: readonly ColumnLike[];
  /** Errors supplied by the host (e.g. the assistant's validator). */
  external?: readonly ExternalError[];
}

const DEFAULT_LINT_CONFIG: LintConfig = { kind: 'boolean', columns: [] };

/** Facet carrying the current lint configuration; reconfigure it through a Compartment. */
export const lintConfig = Facet.define<LintConfig, LintConfig>({
  combine: (values) => values[0] ?? DEFAULT_LINT_CONFIG,
});

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

function toDiagnostic(
  e: { message: string; start?: number; end?: number },
  severity: Diagnostic['severity'],
  length: number,
): Diagnostic {
  const from = clamp(e.start ?? 0, length);
  const to = clamp(e.end ?? from, length);
  return { from, to: Math.max(from, to), severity, message: e.message, source: 'AdaptableQL' };
}

/** Pure validation → diagnostics, for tests and hosts that render their own errors. */
export function diagnosticsFor(
  text: string,
  kind: ExpressionKind,
  columns: readonly ColumnLike[],
): Diagnostic[] {
  if (text.trim() === '') return [];
  const result = validate(text, { kind, env: createEnv(), columns });
  const errors = result.errors.map((e: ExpressionError) => toDiagnostic(e, 'error', text.length));
  const warnings = result.warnings.map((w: ExpressionError) => toDiagnostic(w, 'warning', text.length));
  return [...errors, ...warnings];
}

/** Diagnostics from the live validator plus external errors, de-duplicated on span and message. */
export function mergedDiagnostics(text: string, config: LintConfig): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  const push = (d: Diagnostic) => {
    const key = `${d.from}:${d.to}:${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };
  for (const d of diagnosticsFor(text, config.kind, config.columns)) push(d);
  for (const e of config.external ?? []) push(toDiagnostic(e, 'error', text.length));
  return out.sort((a, b) => a.from - b.from);
}

/** The lint extension; reads `lintConfig` from the state and re-runs when it changes. */
export function expressionLinter(delay = 250): Extension {
  return linter((view) => mergedDiagnostics(view.state.doc.toString(), view.state.facet(lintConfig)), {
    delay,
    needsRefresh: (update) => update.startState.facet(lintConfig) !== update.state.facet(lintConfig),
  });
}
