#!/usr/bin/env node
'use strict';

/* Rebuild the static exterior previews from the same geometry used by the website.
 * Requires an existing Playwright installation and Chromium/Chrome; installs nothing.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const siteRoot = path.resolve(__dirname, '../site');
const mimeTypes = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const harness = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:transparent}#host{width:1000px;height:800px}canvas{display:block;width:100%;height:100%}
</style></head><body><div id="host"></div><script type="module">
import {mountMinerStage} from '/brokerage-stage.js';
import {buildMiner,disposeMiner,MODEL_DEFINITIONS} from '/brokerage-models.js';
window.modelReady=false;window.modelError=null;window.models=MODEL_DEFINITIONS;
window.stage=mountMinerStage(document.getElementById('host'),{buildMiner,disposeMiner,
  onReady(){window.modelReady=true;},onError(error){window.modelError=String(error&&error.message||error||'The renderer could not initialize.');}});
window.stage.setMotion(false);
window.selectModel=key=>{window.modelReady=false;window.modelError=null;window.stage.setModel(key,{});};
window.selectModel(Object.keys(MODEL_DEFINITIONS)[0]);
</script></body></html>`;

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function createServer() {
  const publicRoot = fs.realpathSync(siteRoot);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {'Allow': 'GET, HEAD'}); res.end('Method not allowed'); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (_) { res.writeHead(400); res.end('Invalid path'); return; }
    if (pathname === '/__models__') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : harness); return;
    }
    const requested = path.resolve(publicRoot, '.' + pathname);
    try {
      if (!inside(publicRoot, requested)) throw Error('Outside public site');
      const actual = fs.realpathSync(requested);
      if (!inside(publicRoot, actual) || !fs.statSync(actual).isFile()) throw Error('Not a public file');
      res.writeHead(200, {'Content-Type': mimeTypes[path.extname(actual)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(actual);
      stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch (_) { res.writeHead(404); res.end('Not found'); }
  });
}

function resolvePlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  const candidates = explicit ? [explicit] : ['playwright', 'playwright-core', path.join(__dirname, '.cache/hosting-terrain-browser/node_modules/playwright-core')];
  for (const candidate of candidates) {
    try {
      const api = require(candidate);
      if (api.chromium && typeof api.chromium.launch === 'function') return api;
    } catch (_) { /* Report one actionable dependency message below. */ }
  }
  throw Error(explicit
    ? 'Could not load Chromium from PLAYWRIGHT_MODULE=' + explicit + '. Point it to an existing playwright or playwright-core package.'
    : 'Playwright is unavailable. Provide an existing playwright/playwright-core installation, set PLAYWRIGHT_MODULE to its module path, or use tools/.cache/hosting-terrain-browser/node_modules/playwright-core. No dependencies were installed.');
}

function resolveBrowser(chromium) {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) throw Error('CHROME_PATH does not exist: ' + process.env.CHROME_PATH);
    return process.env.CHROME_PATH;
  }
  const candidates = [];
  try { candidates.push(chromium.executablePath()); } catch (_) { /* The core package may have no downloaded browser. */ }
  if (process.platform === 'win32') {
    candidates.push(path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'));
    if (process.env['PROGRAMFILES(X86)']) candidates.push(path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'));
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'));
  } else if (process.platform === 'darwin') candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  else candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!executable) throw Error('No existing Chromium/Chrome executable was found. Set CHROME_PATH to its absolute path. No browser was downloaded.');
  return executable;
}

async function renderPosters() {
  const {chromium} = resolvePlaywright(), executablePath = resolveBrowser(chromium);
  const server = createServer();
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    const context = await browser.newContext({viewport: {width: 1000, height: 800}, deviceScaleFactor: 1, reducedMotion: 'reduce'});
    await context.route('**/*', route => {
      let local = false;
      try { local = new URL(route.request().url()).origin === origin; } catch (_) { /* Deny malformed and non-network destinations. */ }
      return local ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/__models__', {waitUntil: 'load', timeout: 30000});
    async function ready() {
      await page.waitForFunction(() => window.modelReady || window.modelError, null, {timeout: 30000});
      const modelError = await page.evaluate(() => window.modelError);
      if (modelError || errors.length) throw Error(modelError || errors.join('\n'));
    }
    await ready();
    const keys = await page.evaluate(() => Object.keys(window.models));
    if (!keys.length || keys.some(key => !/^[a-z0-9][a-z0-9-]*$/.test(key))) throw Error('Model definitions contain missing or invalid output keys.');
    const output = path.join(siteRoot, 'miner-models');
    fs.mkdirSync(output, {recursive: true});
    if (!inside(fs.realpathSync(siteRoot), fs.realpathSync(output))) throw Error('Poster directory resolves outside the public site.');
    for (const key of keys) {
      const filename = path.join(output, key + '.png');
      if (fs.existsSync(filename) && !inside(fs.realpathSync(output), fs.realpathSync(filename))) throw Error('Poster target resolves outside the output directory: ' + key);
      await page.evaluate(modelKey => window.selectModel(modelKey), key);
      await ready();
      await page.locator('#host').screenshot({path: filename, omitBackground: true});
      console.log('Rendered ' + key + '.png');
    }
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Rendered ' + keys.length + ' transparent 1000 × 800 posters in ' + output + '.');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server.listening) await new Promise(resolve => {
      server.close(resolve);
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
  }
}

if (require.main === module) renderPosters().catch(error => {
  console.error('Brokerage poster render failed: ' + error.message);
  process.exitCode = 1;
});
