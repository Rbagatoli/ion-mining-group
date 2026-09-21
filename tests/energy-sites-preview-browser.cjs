/* Public source explorer smoke test. Serve the already-built _site tree locally;
 * never contact public services, open mail drafts or mutate customer records. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const { sources } = require('../site/energy-partners.js');
const root = path.resolve(__dirname, '../_site');
const out = path.resolve(process.env.ENERGY_PREVIEW_REPORT || path.join(__dirname, '../reports/energy-sites-preview'));
const report = { checks: [], errors: [], external: [], writes: [], missingAssets: [] };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + rel + (rel.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
let browser, page;
async function check(name, run) { await run(); report.checks.push(name); console.log('PASS ' + name); }
async function fit(p) {
  const dimensions = await p.evaluate(() => {
    const el = document.querySelector('#energyWorkspacePreview'), dialog = document.querySelector('#siteLocatorDialog[open]');
    return { width: innerWidth, page: document.documentElement.scrollWidth, preview: { client: el.clientWidth, scroll: el.scrollWidth }, dialog: dialog && { client: dialog.clientWidth, scroll: dialog.scrollWidth } };
  });
  assert(dimensions.page <= dimensions.width + 1, 'Page overflow: ' + JSON.stringify(dimensions));
  assert(dimensions.preview.scroll <= dimensions.preview.client + 1, 'Clipped preview: ' + JSON.stringify(dimensions));
  if (dimensions.dialog) assert(dimensions.dialog.scroll <= dimensions.dialog.client + 1, 'Dialog overflow: ' + JSON.stringify(dimensions));
}
async function chooseSource(id) { await page.locator('#ep-source').selectOption(id); }
async function tab(id) { await page.locator('[data-preview-tab="' + id + '"]').click(); }
async function storageSnapshot() {
  return page.evaluate(() => ({ local: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])), session: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])) }));
}
(async () => {
  assert(fs.existsSync(path.join(root, 'energy-sites.html')), 'Build _site first with node tools/build-pages.js');
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) { report.writes.push(request.url()); return route.abort(); }
    if (!request.url().startsWith(origin + '/')) { report.external.push(request.url()); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(origin + '/') && response.status() >= 400) report.missingAssets.push(response.url()); });
  await page.goto(origin + '/energy-sites.html#workspace', { waitUntil: 'networkidle' });
  await page.locator('#ep-source').waitFor();
  await page.evaluate(() => {
    localStorage.setItem('energy-preview-test:sentinel', 'Unrelated local record');
    sessionStorage.setItem('energy-preview-test:sentinel', 'Unrelated session record');
    window.__previewWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) { window.__previewWrites.push({ method, key: args[0] }); return original.apply(this, args); };
    }
  });
  const beforeStorage = await storageSnapshot();
  const beforeResearch = await page.evaluate(() => JSON.stringify({ sample: window.ProtonScoutingSample, access: window.ProtonEnergyAccessData }));

  await check('Source exploration leads with the gas specialty and exposes all 16 source choices without invented listings', async () => {
    assert.equal(await page.locator('[data-preview-mode="sources"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-preview-mode="research"]').getAttribute('aria-pressed'), 'false');
    const values = await page.locator('#ep-source option').evaluateAll(options => options.map(o => o.value));
    assert.deepEqual(values.sort(), sources.map(s => s.id).sort());
    assert.equal(await page.locator('#ep-source').inputValue(), 'landfill_gas');
    assert.equal(await page.locator('[data-preview-source="landfill_gas"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-preview-source="flare_gas"]').count(), 1);
    assert.match(await page.locator('.ep-detail-heading').innerText(), /Landfill gas/);
    assert.equal(await page.locator('[data-preview-site]:visible').count(), 0);
    assert.equal(await page.locator('#locator .sl-pin:visible').count(), 0);
    assert.match(await page.locator('#energyWorkspacePreview').innerText(), /research|qualification|search/i);
    await fit(page);
  });
  await check('Every energy choice shows its own supply checks, existing-asset questions and contact roles', async () => {
    const contactPanels = new Set();
    for (const source of sources) {
      await chooseSource(source.id);
      assert((await page.locator('.ep-detail-heading').innerText()).includes(source.label), source.id + ' heading');
      await tab('energy');
      const energy = await page.locator('#ep-panel').innerText();
      assert(energy.includes(source.checks[0]), source.id + ' supply checks');
      assert.doesNotMatch(energy, /reported operating nameplate|EIA \d{4} annual inventory/i, source.id + ' must not reuse landfill capacity');
      await tab('capital');
      const capital = await page.locator('#ep-panel').innerText();
      assert(capital.includes(source.assets), source.id + ' infrastructure guide');
      assert.doesNotMatch(capital, /\$[\d,]+|\b\d+(?:\.\d+)?\s*MW\b/, source.id + ' must not invent capital or available capacity');
      await tab('contacts');
      const contacts = await page.locator('#ep-panel').innerText();
      assert(contacts.length > 80, source.id + ' useful contact guidance');
      assert.equal(await page.locator('#ep-panel a[href^="tel:"], #ep-panel a[href^="mailto:"]').count(), 0, source.id + ' no copied landfill contacts');
      contactPanels.add(contacts);
    }
    assert(contactPanels.size >= 5, 'Contact guidance must vary by energy route');
  });
  await check('Quick source buttons and accessible tabs switch the visible guide by keyboard', async () => {
    const quick = page.locator('[data-preview-source]').first();
    const id = await quick.getAttribute('data-preview-source');
    await quick.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ep-source').inputValue(), id);
    await tab('energy');
    await page.locator('[data-preview-tab="energy"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-preview-tab="capital"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-preview-tab="capital"]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('End'); assert.equal(await page.locator('[data-preview-tab="contacts"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home'); assert.equal(await page.locator('[data-preview-tab="energy"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#ep-panel').getAttribute('aria-labelledby'), await page.locator('[data-preview-tab="energy"]').getAttribute('id'));
    assert.equal(await page.locator('[data-preview-tab][tabindex="0"]').count(), 1);
  });
  await check('Adding a source preserves the user’s name, MW and existing energy choices without submitting', async () => {
    await page.locator('#ss-name').fill('Synthetic preview visitor');
    await page.locator('#ss-power').fill('2.5');
    await page.locator('#ss-source-nuclear').check();
    await chooseSource('hydro'); await page.locator('[data-preview-add]').click();
    assert.equal(await page.locator('#ss-source-hydro').isChecked(), true);
    assert.equal(await page.locator('#ss-source-nuclear').isChecked(), true);
    assert.equal(await page.locator('#ss-name').inputValue(), 'Synthetic preview visitor');
    assert.equal(await page.locator('#ss-power').inputValue(), '2.5');
    assert.deepEqual(await page.locator('input[name="energy_sources"]:checked').evaluateAll(inputs => inputs.map(i => i.value).sort()), ['Hydro', 'Nuclear']);
    await page.locator('[data-preview-add]').click();
    assert.equal(await page.locator('input[name="energy_sources"]:checked').count(), 2, 'Repeated add stays idempotent');
    assert(page.url().startsWith(origin + '/energy-sites.html'), 'No outbound navigation');
  });
  await check('Real research retains the three original embedded sites, two validated pins and unpriced capital', async () => {
    await page.locator('[data-preview-mode="research"]').click();
    assert.equal(await page.locator('[data-preview-mode="research"]').getAttribute('aria-pressed'), 'true');
    const ids = await page.locator('[data-preview-site]').evaluateAll(buttons => buttons.map(b => b.dataset.previewSite));
    assert.deepEqual(ids, await page.evaluate(() => window.ProtonScoutingSample.profiles.map(p => p.id)));
    assert.equal(ids.length, 3); assert.equal(await page.locator('#locator .sl-pin').count(), 2);
    assert.equal(await page.locator('#locator [data-locator-select="SIM-734"]').count(), 0, 'Disputed location remains unpinned');
    for (const id of ids) {
      await page.locator('[data-preview-site="' + id + '"]').click();
      const name = await page.evaluate(id => window.ProtonScoutingSample.profiles.find(p => p.id === id).name, id);
      assert((await page.locator('.ep-detail-heading').innerText()).includes(name));
      await tab('capital'); assert.match(await page.locator('#ep-panel').innerText(), /Not yet priced/);
      await tab('contacts'); assert(await page.locator('#ep-panel a[href^="tel:"], #ep-panel a[href^="mailto:"]').count() > 0, id + ' published contacts remain');
    }
    await tab('energy');
    assert.match(await page.locator('#energyWorkspacePreview').innerText(), /No confirmed power offers/);
  });
  await check('Expanded research locator selects sites and zooms without inventing source-category map points', async () => {
    await page.locator('[data-locator-expand]').click();
    assert(await page.locator('#siteLocatorDialog').isVisible());
    assert.equal(await page.locator('.sl-choice').count(), 3);
    assert.equal(await page.locator('.sl-map-stage .sl-pin').count(), 2);
    await page.locator('.sl-choice[data-locator-select="SIM-1273"]').click();
    assert.match(await page.locator('.ep-detail-heading').innerText(), /Bradford/);
    const before = await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d');
    await page.locator('[data-locator-zoom="in"]').click();
    assert.notEqual(await page.locator('.sl-map-stage .sl-state-PA').getAttribute('d'), before);
    await fit(page); await page.keyboard.press('Escape');
    assert(await page.locator('#siteLocatorDialog').isHidden());
    await page.locator('[data-preview-mode="sources"]').click();
    assert.equal(await page.locator('#ep-source').inputValue(), 'hydro');
    assert.equal(await page.locator('#locator .sl-pin:visible').count(), 0);
  });
  await check('Desktop, tablet and narrow mobile retain all controls without horizontal clipping', async () => {
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
      for (const mode of ['sources', 'research']) {
        await page.locator('[data-preview-mode="' + mode + '"]').click();
        await fit(page);
        if (mode === 'sources') {
          await chooseSource('recovered_energy'); await tab('capital'); await fit(page);
          assert(await page.locator('#ep-source').isVisible());
        } else {
          await page.locator('[data-locator-expand]').click(); await fit(page);
          await page.locator('[data-locator-close]').click();
        }
        if ([1440, 390].includes(width)) {
          await page.locator('#energyWorkspacePreview').screenshot({ path: path.join(out, width + '-' + mode + '.png'), style: '.nav { visibility: hidden !important; }' });
        }
      }
    }
  });
  await check('Preview interactions preserve research and storage and make no HTTP writes or runtime errors', async () => {
    assert.deepEqual(await storageSnapshot(), beforeStorage);
    assert.deepEqual(await page.evaluate(() => window.__previewWrites), []);
    assert.equal(await page.evaluate(() => JSON.stringify({ sample: window.ProtonScoutingSample, access: window.ProtonEnergyAccessData })), beforeResearch);
    assert.deepEqual(report.writes, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.missingAssets, []);
  });
})().catch(async error => {
  report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
}).finally(async () => {
  if (fs.existsSync(out)) fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  await browser?.close(); server.close();
});
