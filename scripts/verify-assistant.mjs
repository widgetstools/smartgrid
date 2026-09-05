#!/usr/bin/env node
/**
 * Drive the playground's Assistant tab in a headless browser against a live
 * model server: send the M3 demo prompt, wait for a proposal (or an error),
 * apply it and report what happened. Requires a running dev server
 * (`npm run dev`) and a Chromium for Playwright (`npx playwright install chromium`).
 *
 * Usage: node scripts/verify-assistant.mjs [model] [appUrl]
 *   model   model id to use (default: first id the server's /models returns)
 *   appUrl  playground URL (default http://localhost:5300)
 */
/* global document, localStorage -- used inside page.evaluate callbacks that run in the browser */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const modelArg = process.argv[2];
const appUrl = (process.argv[3] ?? 'http://localhost:5300').replace(/\/+$/, '');
const prompt = process.env.SMARTGRID_PROMPT ?? 'group by desk then book, pin notional right and sum it';
const outDir = 'scripts/out';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/AG Grid|license/i.test(m.text())) problems.push(`console: ${m.text()}`);
});
// Log the model traffic so a format mismatch is visible.
page.on('response', async (res) => {
  const url = res.url();
  if (!/\/llm\/v1\//.test(url)) return;
  console.log(`  http ${res.status()} ${res.request().method()} ${url.replace(appUrl, '')}`);
  if (res.status() >= 400) console.log(`    body: ${(await res.text().catch(() => '')).slice(0, 400)}`);
});

await page.goto(`${appUrl}/`);
const health = await page.evaluate(async () => {
  const r = await fetch('/llm/v1/models');
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ids: (body.data ?? []).map((m) => m.id) };
});
console.log('models via proxy:', health);
const model = modelArg ?? health.ids[0];
if (!model) {
  console.log('No model available; is the server on port 3000 up? Pass a model id as the first argument.');
  await browser.close();
  process.exit(1);
}
console.log('using model:', model);
await page.evaluate(
  (m) =>
    localStorage.setItem(
      'smartgrid.assistant.settings',
      JSON.stringify({ baseUrl: '/llm/v1', model: m, demo: false, stream: true }),
    ),
  model,
);

await page.goto(`${appUrl}/#/customizer`);
await page.waitForSelector('[data-testid="customizer"]');
await page.getByTitle('Pause ticking').click({ force: true });
await page.getByTitle('Reset to seed config').click({ force: true });
await page.waitForTimeout(300);
await page.getByRole('tab', { name: 'Assistant' }).click({ force: true });
await page.waitForSelector('[data-testid="assistant-pane"]');
await page.waitForFunction(
  () => document.querySelector('[data-testid="assistant-health"]')?.dataset.health !== 'checking',
  null,
  { timeout: 15000 },
);
console.log('health banner:', await page.getAttribute('[data-testid="assistant-health"]', 'data-health'));

console.log(`sending: "${prompt}"`);
await page.fill('[data-testid="assistant-composer"]', prompt);
await page.getByLabel('Send').click({ force: true });
const started = Date.now();
await page.waitForFunction(
  () => {
    const s = document.querySelector('[data-testid="assistant-pane"]')?.dataset.status;
    return s === 'awaiting-approval' || s === 'idle' || s === 'error';
  },
  null,
  { timeout: 120000 },
);
console.log(
  `turn finished in ${Date.now() - started} ms, status:`,
  await page.getAttribute('[data-testid="assistant-pane"]', 'data-status'),
);
console.log(
  'tool chips:',
  await page.locator('[data-testid="tool-chip"]').evaluateAll((els) => els.map((e) => e.dataset.tool)),
);
console.log(
  'assistant text:',
  (await page.locator('[data-role="assistant"] p').allInnerTexts()).join(' | ').slice(0, 600),
);
const alert = await page.locator('[role="alert"]').allInnerTexts();
if (alert.length) console.log('error shown:', alert.join(' | '));
await page.screenshot({ path: `${outDir}/assistant-turn.png` });

const cards = page.locator('[data-testid="patch-diff-card"]');
const n = await cards.count();
for (let i = 0; i < n; i++) {
  const card = cards.nth(i);
  console.log(
    `proposal ${i + 1}: status=${await card.getAttribute('data-status')} title="${await card.locator('header span').first().innerText()}"`,
  );
  console.log('  rows:', await card.locator('li').evaluateAll((els) => els.map((e) => e.dataset.path)));
  const errors = await card.locator('[data-testid="validation-summary"], .text-destructive').allInnerTexts();
  if (errors.length) console.log('  messages:', errors.join(' | ').slice(0, 600));
}

const proposed = page.locator('[data-testid="patch-diff-card"][data-status="proposed"]').first();
if (await proposed.count()) {
  await proposed.getByRole('button', { name: /apply/i }).click({ force: true });
  await page.waitForFunction(
    () => /rev \d+ · assistant/.test(document.querySelector('#root header')?.textContent ?? ''),
    null,
    {
      timeout: 10000,
    },
  );
  console.log(
    'applied:',
    (await page.locator('#root > div > header').first().innerText()).match(/rev \d+[^\n]*/)?.[0],
  );
  console.log('group rows in grid:', await page.locator('.ag-row-group').count());
  await page.screenshot({ path: `${outDir}/assistant-applied.png` });
} else {
  console.log('no valid proposal to apply');
}
console.log('problems:', problems);
console.log(`screenshots in ${outDir}/`);
await browser.close();
