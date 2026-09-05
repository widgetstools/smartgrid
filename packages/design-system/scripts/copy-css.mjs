#!/usr/bin/env node
// Post-`tsc -b` step: copies the hand-written stylesheets and tokens.json
// into dist so the `./css`, `./css/*` and `./tokens.json` exports resolve.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const cssSrc = resolve(pkgRoot, 'src/css');
const cssOut = resolve(pkgRoot, 'dist/css');
mkdirSync(cssOut, { recursive: true });
const cssFiles = readdirSync(cssSrc).filter((f) => f.endsWith('.css'));
for (const file of cssFiles) copyFileSync(resolve(cssSrc, file), resolve(cssOut, file));

const tokensOut = resolve(pkgRoot, 'dist/tokens');
mkdirSync(tokensOut, { recursive: true });
copyFileSync(resolve(pkgRoot, 'src/tokens/tokens.json'), resolve(tokensOut, 'tokens.json'));

console.log(`[copy-css] copied ${cssFiles.length} stylesheet(s) + tokens.json to dist/`);
