/* Real browser checks against the assembled deployment tree. No real mail or remote writes. */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const OUT = process.env.SCOUTING_REPORT || path.join(ROOT, 'reports', 'client-scouting');
fs.mkdirSync(OUT, { recursive: true });
const report = { checks: [], errors: [], failedAssets: [], writes: [], external: [] };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const base = path.join(ROOT, '_site');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const file = path.resolve(base, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
let browser, origin;
async function check(name, fn) { try { await fn(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (e) { report.checks.push({ name, pass: false, error: e.message }); throw e; } }
async function context(viewport, options = {}) {
  const c = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
  await c.route('**/*', async route => {
    const r = route.request();
    if (r.method() !== 'GET') { report.writes.push(r.url()); return route.abort(); }
    if (!r.url().startsWith(origin)) { report.external.push(r.url()); return route.abort(); }
    return route.continue();
  });
  await c.addInitScript(() => { document.addEventListener('click', e => { const a = e.target.closest('a[href^="mailto:"]'); if (a) { e.preventDefault(); window.__mail = a.href; } }, true); });
  const page = await c.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(origin) && r.status() >= 400) report.failedAssets.push(r.url()); });
  return { c, page };
}
async function fit(page) { const sizes = await page.evaluate(() => ({ w: innerWidth, s: document.documentElement.scrollWidth })); assert(sizes.s <= sizes.w + 1, 'Horizontal overflow ' + JSON.stringify(sizes)); }
async function tab(page, route) { await page.locator(`[data-route="${route}"]`).click(); await page.waitForURL('**/#' + route); await page.waitForFunction(r => document.querySelector(`[data-route="${r}"]`).getAttribute('aria-current') === 'page', route); }
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const { c, page } = await context({ width: 1440, height: 1000 });
  await page.goto(origin + '/portal/scouting/');
  await check('Overview labels the example and unknown financial values', async () => { assert.match(await page.locator('h1').innerText(), /Good energy/); assert.match(await page.locator('.preview-banner').innerText(), /No available power confirmed/); assert.match(await page.locator('.metrics').innerText(), /Not set/); await fit(page); await page.screenshot({ path: path.join(OUT, 'desktop-overview.png'), fullPage: true }); });
  await tab(page, 'brief');
  await check('Brief validates capacity bounds and stores scoped draft without a submission', async () => {
    await page.evaluate(() => localStorage.setItem('unrelated-test-record', 'preserve'));
    await page.locator('#brief-minMw').fill('2'); await page.locator('#brief-maxMw').fill('1'); await page.getByRole('button', { name: 'Save draft', exact: true }).click(); assert.equal(await page.locator('#brief-maxMw').evaluate(el => el.validity.customError), true);
    await page.locator('#brief-maxMw').fill('3'); await page.locator('#brief-budget').fill('250000'); await page.locator('#brief-company').fill('Example <img src=x onerror="alert(1)">'); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('proton:scouting:preview:v1'))); assert.equal(saved.brief.maxMw, '3'); assert.equal(saved.brief.budget, '250000'); assert.match(await page.locator('#saveState').innerText(), /not sent/);
    await page.reload(); assert.equal(await page.locator('#brief-maxMw').inputValue(), '3'); assert.equal(await page.locator('main img').count(), 0);
    await page.getByRole('button', { name: 'Review request', exact: false }).click(); assert(await page.locator('#draftDialog').isVisible()); assert.match(await page.locator('#draftText').inputValue(), /2–3 MW/);
    await page.locator('#emailDraft').click(); const mail = new URL(await page.evaluate(() => window.__mail)); assert.equal(mail.pathname, 'sales@protonminingco.com'); assert.match(mail.searchParams.get('body'), /USD, excluding miners.*\$250,000/); assert.equal(mail.searchParams.size, 2); await page.keyboard.press('Escape');
  });
  await tab(page, 'sites');
  await check('Changed brief never relabels old research as a matching result', async () => { assert.match(await page.locator('main').innerText(), /not matching results/); assert.equal(await page.locator('.site-card').count(), 4); });
  await check('Search, confirmed-only and status filters show honest empty and excluded states', async () => {
    await page.locator('#siteSearch').fill('Pennsauken'); assert.equal(await page.locator('.site-card').count(), 1); await page.locator('#siteSearch').fill('');
    await page.locator('#confirmedOnly').check(); assert.equal(await page.locator('.site-card').count(), 0); assert.match(await page.locator('#siteDetail').innerText(), /No site selected/); await page.locator('#confirmedOnly').uncheck();
    await page.locator('#siteStatus').selectOption('excluded'); assert.equal(await page.locator('.site-card').count(), 1); assert.match(await page.locator('#siteDetail').innerText(), /SECCRA/); await page.locator('[data-tab="evidence"]').click(); assert.match(await page.locator('#detailBody').innerText(), /404/);
    await page.locator('#siteStatus').selectOption('all');
  });
  await check('All profiles expose 26 evidence fields and preserved conflicts', async () => {
    for (const id of ['SIM-952', 'SIM-1273', 'SIM-734', 'SIM-1250']) { await page.locator(`button[data-open="${id}"]`).click(); await page.locator('[data-tab="evidence"]').click(); const details = page.locator('#detailBody details').filter({ hasText: 'Full evidence checklist' }); await details.locator('summary').click(); assert.equal(await details.locator('.evidence-row').count(), 26); }
    await page.locator('button[data-open="SIM-952"]').click(); await page.locator('[data-tab="infrastructure"]').click(); assert.match(await page.locator('#detailBody').innerText(), /1.85 MW.*2.8 MW/s); assert.match(await page.locator('.capital-rows').innerText(), /Not established/); assert.match(await page.locator('.capital-rows').innerText(), /Not priced/);
    const map = await page.locator('.detail-heading a').getAttribute('href'); assert.equal(new URL(map).searchParams.get('query'), '39.991,-75.0342');
  });
  await check('Compare up to three sites with unknown costs kept explicit', async () => {
    for (const id of ['SIM-952', 'SIM-1273', 'SIM-734']) await page.locator(`[data-compare="${id}"]`).check();
    await page.locator('[data-compare="SIM-1250"]').click(); assert.equal(await page.locator('[data-compare="SIM-1250"]').isChecked(), false);
    await page.locator('#compareButton').click(); assert.equal(await page.locator('#comparison thead th').count(), 4); assert.match(await page.locator('#comparison').innerText(), /Not priced/); await fit(page); await page.locator('[data-action="close-compare"]').click();
  });
  await check('Site feedback persists and hiding dismissed sites changes visible results', async () => {
    await page.locator('#siteFeedback').selectOption('Already known'); await page.locator('#hideDismissed').check(); assert.equal(await page.locator('.site-card').count(), 3); await page.locator('#hideDismissed').uncheck();
    await page.locator('button[data-open="SIM-1273"]').click(); await page.locator('#siteFeedback').selectOption('Interested'); await page.reload();
    await tab(page, 'updates'); assert.match(await page.locator('.feedback-list').innerText(), /Already known/); assert.match(await page.locator('.feedback-list').innerText(), /Interested/);
    await page.locator('#feedbackNote').fill('Please price electrical connection work before proceeding.'); await page.locator('[data-action="save-note"]').click(); await page.locator('.updates-grid button.button.primary').click(); assert.match(await page.locator('#draftText').inputValue(), /price electrical connection/); assert.match(await page.locator('#draftText').inputValue(), /Interested/); await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(OUT, 'desktop-updates.png'), fullPage: true });
  });
  await tab(page, 'sites'); await page.locator('[data-tab="contact"]').click();
  await check('Contacts contain public phone and unknown decision authority', async () => { assert(await page.locator('#detailBody a[href^="tel:"]').count()); assert.match(await page.locator('#detailBody').innerText(), /not a confirmed decision maker/); await page.locator('[data-action="ask-site"]').click(); assert.match(await page.locator('#draftText').inputValue(), /Please clarify/); await page.keyboard.press('Escape'); });
  await page.locator('[data-tab="infrastructure"]').click(); await page.screenshot({ path: path.join(OUT, 'desktop-sites.png'), fullPage: true });
  await check('Reset only clears the scouting preview storage', async () => { page.once('dialog', d => d.accept()); await page.locator('#resetPreview').click(); assert.equal(await page.evaluate(() => localStorage.getItem('proton:scouting:preview:v1')), null); assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-test-record')), 'preserve'); });
  await check('Explicit site links clear stale filters and keep keyboard focus in the review', async () => {
    await page.locator('#siteStatus').selectOption('excluded'); await tab(page, 'overview'); await page.locator('.site-mini[data-open="SIM-952"]').click();
    await page.waitForSelector('#siteDetail'); assert.match(await page.locator('#siteDetail h2').innerText(), /Pennsauken/);
    await page.locator('button[data-open="SIM-1273"]').focus(); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.activeElement.dataset.open), 'SIM-1273');
    await page.locator('#siteFeedback').selectOption('Interested'); assert.equal(await page.evaluate(() => document.activeElement.id), 'siteFeedback');
  });
  await check('Unexpected hash names fall back to overview without executing inherited properties', async () => {
    for (const hash of ['__proto__', 'toString']) { await page.goto(origin + '/portal/scouting/#' + hash); await page.waitForFunction(() => document.getElementById('pageLabel').textContent === 'Overview'); assert.match(await page.locator('h1').innerText(), /Good energy/); }
  });
  await c.close();
  for (const width of [1366, 768, 390, 320]) {
    const { c: mobile, page: p } = await context({ width, height: width < 700 ? 844 : 1000 }, { isMobile: width < 700, hasTouch: width < 700 });
    await p.goto(origin + '/portal/scouting/');
    await check(width + 'px overview, brief, site detail, evidence and comparison fit', async () => {
      await fit(p); await p.screenshot({ path: path.join(OUT, width + '-overview.png'), fullPage: true });
      await tab(p, 'brief'); await fit(p); await tab(p, 'sites'); await p.locator('button[data-open="SIM-734"]').click(); await fit(p);
      await p.screenshot({ path: path.join(OUT, width + '-sites.png'), fullPage: true });
      await p.locator('[data-tab="evidence"]').click(); await fit(p); await p.locator('#detailBody details').first().locator('summary').click(); await fit(p);
      await p.locator('[data-compare="SIM-952"]').check(); await p.locator('[data-compare="SIM-734"]').check(); await p.locator('#compareButton').click(); await fit(p); await tab(p, 'updates'); await fit(p);
    }); await mobile.close();
  }
  const { c: blocked, page: b } = await context({ width: 390, height: 844 });
  await blocked.addInitScript(() => { Storage.prototype.getItem = function () { throw new Error('unavailable'); }; Storage.prototype.setItem = function () { throw new Error('unavailable'); }; });
  await b.goto(origin + '/portal/scouting/#brief');
  await check('Blocked browser storage keeps an honest memory-only draft', async () => { await b.getByRole('button', { name: 'Save draft', exact: true }).click(); assert.match(await b.locator('#saveState').innerText(), /Storage unavailable/); await tab(b, 'sites'); assert.equal(await b.locator('.site-card').count(), 4); }); await blocked.close();
  const { c: nojs, page: n } = await context({ width: 320, height: 844 }, { javaScriptEnabled: false }); await n.goto(origin + '/portal/scouting/');
  await check('No-script fallback gives a direct contact route', async () => { assert.match(await n.locator('noscript').innerText(), /sales@protonminingco.com/); await fit(n); }); await nojs.close();
  await check('No runtime errors, missing local assets, external loads or HTTP writes', async () => { assert.deepEqual(report.errors, []); assert.deepEqual(report.failedAssets, []); assert.deepEqual(report.writes, []); assert.deepEqual(report.external, []); });
})().catch(e => { report.failure = e.stack; process.exitCode = 1; console.error(e); }).finally(async () => { if (browser) await browser.close(); server.close(); fs.writeFileSync(path.join(OUT, 'browser-report.json'), JSON.stringify(report, null, 2)); console.log(OUT); });
