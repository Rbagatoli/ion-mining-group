/* Animated sourcing previews: real-browser motion, accessibility and fallback checks.
 * Uses a read-only snapshot of the assembled public site; never submits a form.
 * Run after tools/build-pages.js: node tests/sourcing-preview-browser.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/rbaga/ion-mining-group/tools/.cache/hosting-terrain-browser/node_modules/playwright-core');

const root = path.resolve(process.env.SOURCING_PREVIEW_ROOT || path.join(__dirname, '../_site'));
const out = path.resolve(process.env.SOURCING_PREVIEW_REPORT || path.join(__dirname, '../reports/sourcing-no-controls-20260921'));
const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const captureArcsOnly = process.env.SOURCING_PREVIEW_CAPTURE_ONLY === 'arcs';
const report = {checks: [], pageErrors: [], missingAssets: [], blockedWrites: []};
const pages = [
  {file: 'index.html', scene: 'discovery', explorer: true, heading: '#home-search-scope', mobile: 'Landfill gas. New purpose.', desktop: 'Landfill gas. New purpose.'},
  {file: 'energy-sites.html', scene: 'capital', heading: '#brief-title', mobile: 'Look beyond power.', desktop: 'Power is only part of the picture.'}
];
const files = new Map();
function snapshot(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) snapshot(file);
    else files.set('/' + path.relative(root, file).replaceAll('\\', '/'), fs.readFileSync(file));
  }
}
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build _site before running the browser checks.');
snapshot(root);
fs.mkdirSync(out, {recursive: true});
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4'};
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  if (name.endsWith('/')) name += 'index.html';
  if (!files.has(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
  res.end(files.get(name));
});
let browser, origin;
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();
function pass(name, detail = {}) { report.checks.push({name, ...detail}); console.log('ok  ' + name); }

async function open(spec, width, reducedMotion = 'no-preference', webglUnavailable = false) {
  const context = await browser.newContext({viewport: {width, height: 844}, deviceScaleFactor: width < 641 ? 2 : 1, isMobile: width < 641, hasTouch: width < 641, reducedMotion, serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const request = route.request();
    if (request.method() !== 'GET') { report.blockedWrites.push(request.url()); return route.abort(); }
    return request.url().startsWith(origin + '/') ? route.continue() : route.abort();
  });
  // Observe actual renderer work, rather than depending on private scene state.
  await context.addInitScript(({webglUnavailable}) => {
    window.__sourcingRenderCounts = new WeakMap();
    const getContext = HTMLCanvasElement.prototype.getContext;
    const observed = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (webglUnavailable && /webgl/i.test(type)) return null;
      const gl = getContext.call(this, type, ...args);
      if (gl && /webgl/i.test(type) && !observed.has(gl)) {
        observed.add(gl);
        const canvas = this, clear = gl.clear;
        gl.clear = function(...clearArgs) {
          window.__sourcingRenderCounts.set(canvas, (window.__sourcingRenderCounts.get(canvas) || 0) + 1);
          return clear.apply(this, clearArgs);
        };
      }
      return gl;
    };
  }, {webglUnavailable});
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({page: spec.file, width, reducedMotion, message: error.message}));
  page.on('response', response => { if (response.url().startsWith(origin + '/') && response.status() >= 400) report.missingAssets.push({page: spec.file, asset: response.url().slice(origin.length), status: response.status()}); });
  await page.goto(origin + '/' + spec.file, {waitUntil: 'networkidle'});
  await page.addStyleTag({content: 'html{scroll-behavior:auto!important}.reveal{opacity:1!important;transform:none!important}'});
  const figure = page.locator('figure.sourcing-render[data-sourcing-scene="' + spec.scene + '"]');
  assert.equal(await figure.count(), 1, 'Expected one ' + spec.scene + ' preview.');
  if (spec.explorer) {
    const explorer = page.locator('#home-energy-explorer');
    await page.waitForFunction(() => document.querySelector('#home-energy-explorer')?.dataset.explorerReady === 'true' && document.querySelector('#home-research-preview')?.dataset.researchReady === 'true');
    assert.equal(await explorer.getAttribute('data-view'), 'globe', 'The homepage should start with the globe.');
    assert.equal(await page.locator(spec.heading).innerText(), 'A world of energy.');
    assert.equal(await page.locator('.home-hero [data-sourcing-scene]').count(), 0, 'Homepage facilities should live in the explorer, outside the hero.');
    assert.equal(await explorer.locator('[data-globe-back]').isVisible(), false, 'Back should remain hidden until a source is chosen.');
    assert.equal(await explorer.locator('.home-facility-layer').getAttribute('aria-hidden'), 'true');
    assert.equal(await figure.locator('canvas').count(), 0, 'A facility should mount only after a user choice.');
    assert.equal(await page.locator('[data-research-source][data-energy-site-select]').count(), 8, 'Eight shared source controls should drive facilities and research.');
    await page.locator('[data-energy-site-select="landfill"]').click();
    await explorer.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'}));
    await page.waitForFunction(() => document.querySelector('#home-energy-explorer')?.dataset.view === 'facility', {}, {timeout: 30000});
    // Let the reveal finish so later screenshot differences measure scene
    // animation, rather than the facility layer entering the explorer.
    await explorer.locator('.home-facility-layer').evaluate(async layer => {
      layer.getBoundingClientRect();
      await Promise.all(layer.getAnimations().map(animation => animation.finished.catch(() => {})));
    });
    assert.equal(await explorer.locator('.home-facility-layer').getAttribute('aria-hidden'), 'false');
    assert.equal(await explorer.getAttribute('aria-busy'), null);
    assert.equal(await explorer.locator('[data-globe-back]').isVisible(), true);
  }
  await figure.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'}));
  const img = figure.locator('img');
  await img.evaluate(image => image.decode());
  assert.ok(await figure.isVisible(), 'Preview should remain visible.');
  assert.ok(await img.evaluate(image => image.complete && image.naturalWidth > 0), 'Fallback must be decoded.');
  assert.equal(normalize(await page.locator(spec.heading).innerText()), width < 641 ? spec.mobile : spec.desktop, 'Responsive heading copy must remain unchanged.');
  const size = await figure.boundingBox();
  assert.ok(size && size.width > 200 && size.height > 70 && size.width <= width + 1, 'The preview should remain readable without overflowing the viewport.');
  if (!spec.explorer) assert.ok(size.height < 280, 'The capital preview should retain its compact section height.');
  if (spec.explorer) {
    const stage = await page.locator('.home-explorer-stage').boundingBox();
    // Desktop art can extend past the stage's horizontal edges while remaining
    // centered; the viewport overflow assertion below covers the page boundary.
    assert.ok(stage && Math.abs(size.x + size.width / 2 - stage.x - stage.width / 2) < 2 && size.y >= stage.y - 1 && size.y + size.height <= stage.y + stage.height + 1, 'The selected facility should be centered vertically inside the globe explorer stage.');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal overflow.');
  assert.equal(await figure.locator('button').count(), 0, 'Decorative previews should have no corner controls.');
  return {context, page, figure, img};
}

async function frame(canvas, filename) {
  // A fractional CSS boundary can include one pixel of the moving page backdrop.
  // Crop just inside the canvas so only its own rendered content is compared.
  const box = await canvas.boundingBox();
  const buffer = await canvas.page().screenshot({clip: {x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4}});
  if (filename) fs.writeFileSync(path.join(out, filename), buffer);
  return digest(buffer);
}
async function renderCount(canvas) { return canvas.evaluate(element => window.__sourcingRenderCounts.get(element) || 0); }

async function checkMotion(spec, width) {
  const {context, page, figure, img} = await open(spec, width);
  try {
    await page.waitForFunction(selector => document.querySelector(selector)?.dataset.renderState === 'ready', 'figure[data-sourcing-scene="' + spec.scene + '"]', {timeout: 30000});
    const canvas = figure.locator('canvas');
    assert.equal(await canvas.count(), 1, 'Only one rendering canvas should mount.');
    assert.ok(await canvas.isVisible());
    assert.equal(await canvas.evaluate(element => getComputedStyle(element).pointerEvents), 'none', 'Decorative canvas must allow page scrolling.');
    assert.equal(await figure.locator('button').count(), 0, 'Live previews should animate without corner controls.');
    // A solid underlay prevents unrelated moving background stars from affecting
    // canvas screenshots when testing whether the preview itself is moving.
    const testBackground = await page.addStyleTag({content: 'figure.sourcing-render{background:#101111!important}'});
    const prefix = spec.scene + '-' + width;
    const before = await frame(canvas, prefix + '-motion-before.png');
    await page.waitForTimeout(650);
    const after = await frame(canvas, prefix + '-motion-after.png');
    assert.notEqual(after, before, 'The live rendering must visibly animate.');
    // Move well below the widget. Reading draw counts does not scroll it back
    // into view, unlike taking a locator screenshot of an offscreen canvas.
    await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
    // Allow a queued observer/resize frame to finish before measuring steady
    // offscreen behavior. Continuous rendering never reaches this idle window.
    let offscreenCount = await renderCount(canvas), idleSamples = 0;
    for (let attempt = 0; attempt < 12 && idleSamples < 3; attempt++) {
      await page.waitForTimeout(200);
      const count = await renderCount(canvas);
      idleSamples = count === offscreenCount ? idleSamples + 1 : 0;
      offscreenCount = count;
    }
    assert.equal(idleSamples, 3, 'Offscreen rendering should settle after queued observer work.');
    await page.waitForTimeout(650);
    assert.equal(await renderCount(canvas), offscreenCount, 'Offscreen scenes must stop GPU rendering work.');
    await figure.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'}));
    await page.waitForTimeout(650);
    assert.ok(await renderCount(canvas) > offscreenCount, 'Visible scenes should resume rendering.');
    await testBackground.evaluate(element => element.remove());
    await figure.locator('..').screenshot({path: path.join(out, prefix + '-widget.png')});
    await page.screenshot({path: path.join(out, prefix + '-page.png')});
    if (spec.explorer) {
      assert.equal(await figure.getAttribute('data-energy-site'), 'landfill', 'Animation and scrolling must not change the user-selected facility.');
      assert.equal(await page.locator('#home-energy-explorer').getAttribute('data-view'), 'facility');
    }
    pass(prefix + ': scene animation, no corner controls, offscreen suspension, copy and layout', {width: Math.round((await figure.boundingBox()).width), poster: await img.getAttribute('src')});
    const contextLostSupported = await canvas.evaluate(element => {
      const gl = element.getContext('webgl2') || element.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext(); return true;
    });
    assert.ok(contextLostSupported, 'Test browser must support simulated context loss.');
    await page.waitForFunction(selector => document.querySelector(selector)?.dataset.renderState === 'fallback', 'figure[data-sourcing-scene="' + spec.scene + '"]');
    assert.ok(await img.isVisible(), 'Context loss must reveal the poster.');
    assert.ok(await img.evaluate(image => Number(getComputedStyle(image).opacity) > 0), 'Fallback poster must be opaque.');
    assert.equal(await figure.locator('button').count(), 0, 'Fallback previews should have no corner controls.');
    pass(prefix + ': context-loss poster fallback');
  } finally { await context.close(); }
}

async function checkStatic(spec, width, webglUnavailable = false) {
  const label = spec.scene + '-' + width + (webglUnavailable ? '-no-webgl' : '-reduced-motion');
  const {context, page, figure, img} = await open(spec, width, webglUnavailable ? 'no-preference' : 'reduce', webglUnavailable);
  try {
    if (webglUnavailable) await page.waitForFunction(selector => document.querySelector(selector)?.dataset.renderState === 'fallback', 'figure[data-sourcing-scene="' + spec.scene + '"]');
    else {
      await page.waitForTimeout(650);
      assert.equal(await figure.locator('canvas').count(), 0, 'Reduced motion must avoid mounting WebGL.');
    }
    assert.ok(await img.isVisible(), 'Static presentation must keep its image.');
    assert.ok(await img.evaluate(image => Number(getComputedStyle(image).opacity) > 0));
    assert.equal(await figure.locator('button').count(), 0, 'Static previews should have no corner controls.');
    await figure.locator('..').screenshot({path: path.join(out, label + '-widget.png')});
    pass(label + ': visible poster and preserved layout');
  } finally { await context.close(); }
}

async function captureArcs() {
  const {context, page, figure} = await open(pages[1], 390);
  try {
    await page.waitForFunction(() => document.querySelector('[data-sourcing-scene="capital"]')?.dataset.renderState === 'ready');
    const canvas = figure.locator('canvas');
    let best = null;
    report.arcFrames = [];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(450);
      const buffer = await canvas.screenshot();
      const score = await page.evaluate(async data => {
        const image = new Image(); image.src = data; await image.decode();
        const surface = document.createElement('canvas'); surface.width = image.width; surface.height = image.height;
        const context = surface.getContext('2d'); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
        let count = 0;
        // The transformer is left of the orange mining enclosure; score only
        // its area to choose a useful frame from the gently fading arc cycle.
        for (let y = Math.floor(surface.height * .20); y < surface.height * .76; y++) {
          for (let x = 0; x < surface.width * .53; x++) {
            const offset = (y * surface.width + x) * 4;
            if (pixels[offset] > 160 && pixels[offset] > pixels[offset + 1] * 1.2 && pixels[offset + 1] > pixels[offset + 2] * 1.7) count++;
          }
        }
        return count;
      }, 'data:image/png;base64,' + buffer.toString('base64'));
      report.arcFrames.push({frame: i, orangePixels: score});
      if (!best || score > best.score) best = {score, buffer};
    }
    fs.writeFileSync(path.join(out, 'capital-transformer-arcs.png'), best.buffer);
    pass('Captured the clearest transformer arc frame', {orangePixels: best.score});
  } finally { await context.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless: true, executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  if (captureArcsOnly) return captureArcs();
  for (const width of [390, 1440]) {
    for (const spec of pages) {
      await checkMotion(spec, width);
      await checkStatic(spec, width);
    }
  }
  for (const spec of pages) await checkStatic(spec, 390, true);
  assert.deepEqual(report.pageErrors, [], 'No uncaught page errors.');
  assert.deepEqual(report.missingAssets, [], 'No missing local assets.');
  assert.deepEqual(report.blockedWrites, [], 'The audit must not attempt submissions.');
  pass('No uncaught errors, missing assets or write requests');
})().catch(error => {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, captureArcsOnly ? 'arc-capture.json' : 'browser-audit.json'), JSON.stringify(report, null, 2) + '\n');
});
