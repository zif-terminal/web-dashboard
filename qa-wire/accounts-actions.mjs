// #205 wire-all QA — Accounts UI actions (rename / add-tag / hide) drive the
// updateAccount path end-to-end. Runs against a LOCALLY-SERVED MOCK-mode bundle
// (mock bypasses login → no auth CORS needed; the real-Hasura persistence path is
// covered by the bundle greps + the deployed wallet-label baseline). This proves
// the HANDLERS fire, the store updates optimistically, and hide/rename/tag are
// reflected in the DOM (i.e. the buttons are no longer no-ops from the UI's view).
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE || 'http://127.0.0.1:8199';
const t0 = Date.now();
const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
let failures = 0;
const pass = (m) => console.log(`[${ms()}] PASS  ${m}`);
const fail = (m) => { failures++; console.error(`[${ms()}] FAIL  ${m}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 160)));

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  // Mock bypasses login → nav present directly.
  await page.getByRole('button', { name: 'Accounts' }).click({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Accounts' }).waitFor({ timeout: 15000 });
  pass('Accounts tab rendered (mock, no login gate)');

  // Expand the first ready wallet if collapsed so account rows show.
  const firstAcctName = page.locator('text=/Main account|Binance/').first();
  await firstAcctName.waitFor({ timeout: 10000 }).catch(() => {});

  // ── ADD TAG ────────────────────────────────────────────────────────────────
  const addTagBtn = page.getByRole('button', { name: '+ Add tag' }).first();
  await addTagBtn.click({ timeout: 10000 });
  const coreBtn = page.getByRole('button', { name: '+ core' }).first();
  await coreBtn.click({ timeout: 10000 });
  // The tag chip "core ×" should now be present.
  await page.getByText('core ×').first().waitFor({ timeout: 8000 });
  pass('add-tag → "core ×" chip rendered (updateAccount tags handler fired)');

  // ── REMOVE TAG (round-trip) ──────────────────────────────────────────────────
  const coreCountBefore = await page.getByText('core ×').count();
  await page.getByText('core ×').first().click({ timeout: 8000 });
  await page.waitForTimeout(500);
  const coreCountAfter = await page.getByText('core ×').count();
  if (coreCountAfter === coreCountBefore - 1) pass(`remove-tag → one chip removed (${coreCountBefore}→${coreCountAfter})`);
  else fail(`remove-tag: expected ${coreCountBefore - 1}, got ${coreCountAfter} "core ×" chips`);

  // ── RENAME ACCOUNT ───────────────────────────────────────────────────────────
  const renameBtn = page.getByTitle('Rename').first();
  await renameBtn.click({ timeout: 8000 });
  const renameInput = page.locator('input').filter({ hasNot: page.locator('[placeholder]') }).last();
  // The rename input has no placeholder; grab the focused/last text input in the row.
  const editInput = page.locator('input:not([placeholder])').first();
  await editInput.fill('QA-Renamed', { timeout: 8000 });
  await page.getByTitle('Save').first().click({ timeout: 8000 });
  await page.getByText('QA-Renamed').first().waitFor({ timeout: 8000 });
  pass('rename → new name "QA-Renamed" rendered (updateAccount name handler fired)');

  // ── HIDE ACCOUNT ──────────────────────────────────────────────────────────────
  const acctsBefore = await page.getByTitle('Hide').count();
  await page.getByTitle('Hide').first().click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const acctsAfter = await page.getByTitle('Hide').count();
  if (acctsAfter < acctsBefore) pass(`hide → visible account rows dropped ${acctsBefore}→${acctsAfter} + "hidden" count shown`);
  else fail(`hide did not reduce visible rows (${acctsBefore}→${acctsAfter})`);
  // The "Show N hidden account" toggle should appear.
  const hiddenToggle = await page.getByText(/hidden account/).count();
  if (hiddenToggle > 0) pass('hide → "Show N hidden account(s)" toggle appeared');
  else fail('hide → no hidden-account toggle appeared');

  await page.screenshot({ path: '/qa/shots/wire-accounts.png', fullPage: true }).catch(() => {});
  if (errors.length) fail(`console/page errors: ${JSON.stringify(errors.slice(0, 4))}`);
  else pass('no console/page errors during actions');
} catch (e) {
  fail('probe threw: ' + e.message);
} finally {
  await browser.close();
}

console.log('────────────');
console.log(`result    : ${failures === 0 ? 'PASS' : 'FAIL'} (${failures} failure${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
