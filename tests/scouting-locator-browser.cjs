/* Exercise the local, expanded map without remote tiles, geolocation or HTTP writes. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const root = path.resolve(__dirname, '../_site'), out = process.env.SCOUTING_REPORT || path.resolve(__dirname, '../reports/site-locator');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], external: [], writes: [], assetFailures: [] };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost'), rel = decodeURIComponent(u.pathname) + (u.pathname.endsWith('/') ? 'index.html' : '');
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
let browser;
async function check(name, fn) { await fn(); report.checks.push(name); console.log('PASS ' + name); }
async function fit(page) { const s = await page.evaluate(() => ({ w: innerWidth, document: document.documentElement.scrollWidth, dialog: document.querySelector('#siteLocatorDialog') && { client: document.querySelector('#siteLocatorDialog').clientWidth, scroll: document.querySelector('#siteLocatorDialog').scrollWidth } })); assert(s.document <= s.w + 1, JSON.stringify(s)); if (s.dialog) assert(s.dialog.scroll <= s.dialog.client + 1, JSON.stringify(s)); }
async function wheelCheck(page, selector) {
  const marker = page.locator(selector + ' [data-locator-select="SIM-952"] .sl-dot');
  await marker.scrollIntoViewIfNeeded();
  const before = await page.locator(selector + ' .sl-state-PA').getAttribute('d'), box = await marker.boundingBox();
  const scroll = await page.evaluate(() => ({ page: scrollY, dialog: document.querySelector('#siteLocatorDialog')?.scrollTop || 0 }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -120);
  await page.waitForFunction(({ selector, before }) => document.querySelector(selector + ' .sl-state-PA').getAttribute('d') !== before, { selector, before });
  const after = await marker.boundingBox();
  assert(Math.abs(after.x + after.width / 2 - box.x - box.width / 2) < 1, 'Wheel zoom must hold the cursor longitude, including SVG letterboxing');
  assert(Math.abs(after.y + after.height / 2 - box.y - box.height / 2) < 1, 'Wheel zoom must hold the cursor latitude, including SVG letterboxing');
  assert.deepEqual(await page.evaluate(() => ({ page: scrollY, dialog: document.querySelector('#siteLocatorDialog')?.scrollTop || 0 })), scroll, 'Map wheel must not scroll the page or dialog');
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(({ selector, before }) => document.querySelector(selector + ' .sl-state-PA').getAttribute('d') === before, { selector, before });
  await page.mouse.wheel(0, 300);
  assert.equal(await page.locator(selector + ' .sl-state-PA').getAttribute('d'), before, 'Zoom-out stays at the regional minimum');
  assert.deepEqual(await page.evaluate(() => ({ page: scrollY, dialog: document.querySelector('#siteLocatorDialog')?.scrollTop || 0 })), scroll);
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = process.env.SCOUTING_ORIGIN || 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, isMobile: width < 700, hasTouch: width < 700, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const r = route.request();
      if (r.method() !== 'GET') { report.writes.push(r.url()); return route.abort(); }
      if (!r.url().startsWith(origin + '/')) { report.external.push(r.url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message)); page.on('response', r => { if (r.status() >= 400) report.assetFailures.push(r.url()); });
    await page.goto(origin + '/portal/scouting/?release=site-locator#sites', { waitUntil: 'networkidle' });
    await check(width + 'px compact locator has regional context and only accepted points', async () => {
      assert(await page.locator('.sl-widget').isVisible()); assert.equal(await page.locator('.sl-widget .sl-pin').count(), 3); assert.equal(await page.locator('.sl-widget .sl-state').count(), 12);
      assert.match(await page.locator('.sl-widget').innerText(), /Philadelphia/); assert.match(await page.locator('.sl-widget').innerText(), /Mid-Atlantic/);
      assert.equal(await page.locator('.sl-widget [data-locator-select="SIM-734"]').count(), 0); await fit(page);
      await page.locator('.sl-widget').screenshot({ path: path.join(out, width + '-locator.png') });
      await page.locator('.sl-widget [data-locator-select="SIM-1273"]').focus(); await page.keyboard.press('Enter');
      assert.match(await page.locator('#siteDetail h2').innerText(), /Bradford/); assert.match(await page.locator('.sl-widget-bottom').innerText(), /Elmira/);
      await page.locator('.sl-widget [data-locator-select="SIM-952"]').click();
    });
    if (width >= 700) await check(width + 'px compact wheel zoom follows the cursor and page scrolling remains available elsewhere', async () => {
      await wheelCheck(page, '.sl-widget');
      await page.evaluate(() => window.scrollTo(0, 0)); const heading = await page.locator('h1').boundingBox();
      await page.mouse.move(heading.x + 30, heading.y + 10); await page.mouse.wheel(0, 180);
      await page.waitForFunction(() => scrollY > 0);
    });
    await page.locator('[data-locator-expand]').click();
    await check(width + 'px expanded map fits and retains state/city context with all site choices', async () => {
      assert(await page.locator('#siteLocatorDialog').isVisible()); assert.equal(await page.locator('.sl-choice').count(), 4); assert.equal(await page.locator('.sl-dialog .sl-pin').count(), 3);
      assert.match(await page.locator('.sl-map-stage').innerText(), /Scranton|Harrisburg/); assert.match(await page.locator('#sl-count').innerText(), /3 mapped.*1 location pending/);
      await fit(page); await page.screenshot({ path: path.join(out, width + '-expanded.png') });
      await page.locator('.sl-map-stage [data-locator-select="SIM-1250"]').click(); assert.match(await page.locator('.sl-selected-site').innerText(), /SECCRA/); assert(await page.locator('#siteLocatorDialog').isVisible());
      await page.locator('.sl-choice[data-locator-select="SIM-952"]').click();
    });
    if (width >= 700) await check(width + 'px expanded wheel zoom follows the cursor without scrolling the dialog', async () => {
      await wheelCheck(page, '.sl-map-stage');
      await page.locator('[data-locator-reset]').click();
    });
    await check(width + 'px zoom, pan and reset change the map without losing selection', async () => {
      const before = await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d');
      await page.locator('[data-locator-zoom="in"]').click(); const zoomed = await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'); assert.notEqual(before, zoomed);
      await page.locator('.sl-map-stage svg').focus(); await page.keyboard.press('ArrowRight'); assert.notEqual(await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'), zoomed);
      await page.locator('[data-locator-reset]').click(); assert.equal(await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'), before);
      assert.equal(await page.locator('.sl-choice[aria-pressed="true"]').getAttribute('data-locator-select'), 'SIM-952');
      if (width === 1440) {
        const stage = await page.locator('.sl-map-stage').boundingBox(), x = stage.x + stage.width * .72, y = stage.y + stage.height * .8;
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 70, y - 30, { steps: 6 }); await page.mouse.up();
        assert.notEqual(await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'), before); await page.locator('[data-locator-reset]').click();
      }
      if (width === 390) {
        const stage = await page.locator('.sl-map-stage').boundingBox(), x = stage.x + stage.width * .8, y = stage.y + stage.height * .75;
        const touch = await context.newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 4; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 12, y: y + i * 4 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(d => document.querySelector('.sl-map-stage .sl-state-PA').getAttribute('d') !== d, before);
        await touch.detach(); await page.locator('[data-locator-reset]').click();
      }
    });
    await check(width + 'px site selection stays in the expanded map and withheld pins stay withheld', async () => {
      await page.locator('.sl-choice[data-locator-select="SIM-1273"]').click(); assert.match(await page.locator('.sl-selected-site').innerText(), /Bradford/); assert.match(await page.locator('.sl-selected-site').innerText(), /Elmira.*straight-line/);
      assert(await page.locator('#siteLocatorDialog').isVisible()); assert.match(await page.locator('#siteDetail h2').innerText(), /Bradford/);
      await page.locator('.sl-choice[data-locator-select="SIM-734"]').click(); assert.match(await page.locator('.sl-selected-site').innerText(), /Pin withheld/); assert.match(await page.locator('.sl-selected-site a').getAttribute('href'), /2350.*Marriottsville/);
      assert.equal(await page.locator('.sl-map-stage [data-locator-select="SIM-734"]').count(), 0);
      await page.locator('.sl-choice[data-locator-select="SIM-952"]').click(); await page.locator('[data-locator-review]').click(); assert(await page.locator('#siteLocatorDialog').isHidden()); assert.equal(await page.evaluate(() => document.activeElement.id), 'siteDetail');
    });
    await check(width + 'px Escape returns focus and filtered maps respect results', async () => {
      await page.locator('[data-locator-expand]').click(); await page.keyboard.press('Escape'); assert(await page.locator('#siteLocatorDialog').isHidden()); assert(await page.locator('[data-locator-expand]').evaluate(el => el === document.activeElement));
      await page.locator('#siteSearch').fill('Bradford'); assert.equal(await page.locator('.sl-widget .sl-pin').count(), 1); await page.locator('[data-locator-expand]').click(); assert.equal(await page.locator('.sl-choice').count(), 1); assert.match(await page.locator('#sl-count').innerText(), /^1 mapped$/); await page.locator('[data-locator-close]').click(); await fit(page);
    });
    if (width === 1440) await check('Missing geography keeps an explicit fallback and usable site choices in both views', async () => {
      await page.evaluate(() => { window.ProtonLocatorGeography = undefined; });
      await page.locator('#siteSearch').fill(''); assert.match(await page.locator('.sl-widget').innerText(), /Regional map unavailable/);
      await page.locator('[data-locator-expand]').click(); assert.match(await page.locator('.sl-map-stage').innerText(), /Regional map unavailable/); assert.equal(await page.locator('.sl-choice').count(), 4);
      assert(await page.locator('[data-locator-zoom="in"]').isDisabled()); await page.locator('.sl-choice[data-locator-select="SIM-734"]').click(); assert.match(await page.locator('.sl-selected-site a').getAttribute('href'), /2350.*Marriottsville/); await page.locator('[data-locator-close]').click();
    });
    await context.close();
  }
  await check('No browser runtime errors, external loads, HTTP writes or failed assets', async () => { for (const key of ['errors', 'external', 'writes', 'assetFailures']) assert.deepEqual(report[key], [], key); });
})().catch(e => { report.failure = e.stack; console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.close(); fs.writeFileSync(path.join(out, 'locator-browser-report.json'), JSON.stringify(report, null, 2)); });
