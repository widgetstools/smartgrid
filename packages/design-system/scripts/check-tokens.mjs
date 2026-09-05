#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  check-tokens — fails when the token policy is violated.
//  Origin: stern-bak tools/scripts/check-ds-tokens.ts, adapted to
//  the single `--sg-*` namespace.
//
//  Rules
//    no-hardcoded-hex     #rgb / #rrggbb / #rrggbbaa literals in .ts/.tsx/
//                         .js/.mjs/.css outside src/tokens/ (the canonical
//                         hex packs), test files, and generated icon data.
//    no-legacy-css-var    any --st-/--ds-/--bn-/--fi-/--p-/--ck-/--mdl-/--gc-
//                         reference.
//    non-sg-custom-prop   a custom property DEFINITION whose name does not
//                         start with `--sg-` in a .css file. The shadcn alias
//                         sheet and the Tailwind `@theme` sheet are the two
//                         sanctioned exceptions.
//
//  Usage
//    node scripts/check-tokens.mjs [dir ...] [--allow=<relative-prefix> ...]
//    Defaults to this package's src/. Directories are resolved from cwd;
//    allow prefixes are matched against paths relative to each scanned dir.
// ─────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const LEGACY_VAR_RE = /--(?:st|ds|bn|fi|p|ck|mdl|gc)-[a-zA-Z0-9-]+/g;
const CUSTOM_PROP_DEF_RE = /(?:^|[\s;{])(--[a-zA-Z_][\w-]*)\s*:/g;

const STYLE_EXTS = new Set(['.css']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', '__snapshots__', 'svg']);

/** Paths (relative to the scanned dir) where hex literals are legitimate data. */
const DEFAULT_HEX_ALLOW = ['tokens/', 'icons/allIcons.ts'];
/** Stylesheets that define non-`--sg-` custom properties on purpose. */
const DEFAULT_PROP_ALLOW = ['css/shadcn.css', 'css/tailwind-theme.css'];

const args = process.argv.slice(2);
const extraAllow = args.filter((a) => a.startsWith('--allow=')).map((a) => a.slice('--allow='.length));
const dirs = args.filter((a) => !a.startsWith('--'));
const pkgSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const roots = dirs.length > 0 ? dirs.map((d) => resolve(process.cwd(), d)) : [pkgSrc];

const isTest = (rel) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
const startsWithAny = (rel, prefixes) => prefixes.some((p) => rel.startsWith(p));

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
}

function lintFile(root, path) {
  const ext = extname(path);
  if (!STYLE_EXTS.has(ext) && !CODE_EXTS.has(ext)) return [];
  const rel = relative(root, path).replace(/\\/g, '/');
  if (isTest(rel)) return [];
  const hexAllowed = startsWithAny(rel, [...DEFAULT_HEX_ALLOW, ...extraAllow]);
  const propAllowed = startsWithAny(rel, DEFAULT_PROP_ALLOW);
  const src = readFileSync(path, 'utf8');
  const issues = [];
  src.split('\n').forEach((line, i) => {
    const ln = i + 1;
    if (!hexAllowed) {
      const hex = line.match(HEX_RE);
      if (hex) issues.push({ rel, line: ln, rule: 'no-hardcoded-hex', excerpt: hex.join(', ') });
    }
    const legacy = line.match(LEGACY_VAR_RE);
    if (legacy) issues.push({ rel, line: ln, rule: 'no-legacy-css-var', excerpt: legacy.join(', ') });
    if (STYLE_EXTS.has(ext) && !propAllowed) {
      for (const m of line.matchAll(CUSTOM_PROP_DEF_RE)) {
        const name = m[1];
        if (!name.startsWith('--sg-')) {
          issues.push({ rel, line: ln, rule: 'non-sg-custom-prop', excerpt: name });
        }
      }
    }
  });
  return issues;
}

let total = 0;
for (const root of roots) {
  const files = [];
  walk(root, files);
  for (const f of files) {
    for (const issue of lintFile(root, f)) {
      total += 1;
      console.error(`${relative(process.cwd(), f)}:${issue.line}  [${issue.rule}]  ${issue.excerpt}`);
    }
  }
}

if (total > 0) {
  console.error(`\n${total} issue(s) — design-system token policy violations.`);
  process.exit(1);
}
console.log(`check-tokens: clean (${roots.map((r) => relative(process.cwd(), r) || '.').join(', ')}).`);
