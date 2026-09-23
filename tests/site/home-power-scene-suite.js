/* Real Proton hero controller; module timing and renderer lifecycle are observed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Element, parse} = require('./helpers/terrain-dom.js');
const site = path.resolve(__dirname, '../../site');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(site, 'home-power-scene.js'), 'utf8');
const script = new vm.Script(source.replace('import(source)', 'testImport(source)'));
const settle = () => new Promise(resolve => setImmediate(resolve));
const dataAttribute = key => 'data-' + String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
Object.defineProperty(Element.prototype, 'dataset', {get() {
  if (!this._dataset) this._dataset = new Proxy({}, {
    get: (_, key) => this.getAttribute(dataAttribute(key)) ?? undefined,
    set: (_, key, value) => { this.setAttribute(dataAttribute(key), value); return true; }
  });
  return this._dataset;
}});
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
}

function fixture(options = {}) {
  const document = parse(options.markup ?? html), media = new Element('media'), windows = new Element('window');
  const observers = [], stages = [], imports = [], importGate = deferred(), mountGate = deferred();
  const tag = html.match(/<script\b[^>]*src="\.\/home-power-scene\.js[^>]*>/)?.[0];
  assert.ok(tag, 'The homepage must load the new hero controller.');
  const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1],match[2]]));
  document.currentScript = new Element('script', attrs);
  document.currentScript.src = new URL(attrs.src, 'https://preview.test/').href;
  document.hidden = !!options.hidden; media.matches = !!options.reduced;
  const host = document.querySelector('.home-power-scene');
  const renderer = {async mountHomePowerScene(actualHost, {onError}) {
    assert.equal(actualHost, host);
    const stage = {
      active:false, moving:true, disposals:0,
      setActive(value) { this.active = value; },
      setMotion(value) { this.moving = value; },
      dispose() { this.disposals++; this.active = false; },
      fail() { onError(); }
    };
    stages.push(stage);
    if (options.failDuringMount) onError();
    if (options.holdMount) await mountGate.promise;
    return stage;
  }};
  const sandbox = {
    document, URL, matchMedia: () => media,
    addEventListener: (...args) => windows.addEventListener(...args),
    removeEventListener: (...args) => windows.removeEventListener(...args),
    testImport(url) {
      imports.push(url);
      if (options.failImport) return Promise.reject(new Error('Renderer unavailable'));
      return options.holdImport ? importGate.promise : Promise.resolve(renderer);
    }
  };
  if (!options.noObserver) sandbox.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  sandbox.window = sandbox; vm.createContext(sandbox);
  const run = () => script.runInContext(sandbox); run();
  return {
    document, host, media, windows, observers, stages, imports, run,
    visible(value) { observers.forEach(observer => observer.callback([{isIntersecting:value}])); },
    hidden(value) { document.hidden = value; document.fire('visibilitychange'); },
    motion(value) { media.matches = value; media.fire('change'); },
    page(type, persisted) { windows.fire(type, {persisted}); },
    releaseImport() { importGate.resolve(renderer); },
    releaseMount() { mountGate.resolve(); }
  };
}

let passed = 0;
async function check(name, run) { await run(); passed++; console.log('  ok    ' + name); }
(async () => {
  await check('authored hero retains a decorative fallback and loads no freight video', () => {
    const document = parse(html), host = document.querySelector('.home-power-scene');
    assert.ok(host);
    assert.equal(host.getAttribute('aria-hidden'), 'true');
    assert.ok(host.querySelector('.home-power-fallback'));
    assert.equal(document.querySelectorAll('video').length, 0);
    assert.doesNotMatch(html, /alliance-hero(?:-poster)?\.(?:mp4|webp)|home-hero-video\.js/);
    assert.match(html, /<script\b[^>]*src="\.\/home-power-scene\.js(?:\?v=[a-f0-9]+)?"[^>]*\bdefer(?:\s|>)/);
  });

  await check('initial reduced motion renders a still scene without starting animation', async () => {
    const test = fixture({reduced:true}); await settle();
    assert.equal(test.host.dataset.renderState, 'ready');
    assert.equal(test.stages.length, 1);
    assert.equal(test.stages[0].moving, false);
    assert.equal(test.stages[0].active, false, 'Offscreen rendering must wait for the visibility callback.');
    test.visible(true); assert.equal(test.stages[0].active, true); assert.equal(test.stages[0].moving, false);
    test.motion(false); assert.equal(test.stages[0].moving, true);
    test.motion(true); assert.equal(test.stages[0].moving, false);
  });

  await check('offscreen and hidden pages pause the stage without allocating another renderer', async () => {
    const test = fixture(); await settle();
    assert.equal(test.observers[0].target, test.host);
    test.visible(true); assert.equal(test.stages[0].active, true);
    test.visible(false); assert.equal(test.stages[0].active, false);
    test.hidden(true); test.visible(true); assert.equal(test.stages[0].active, false);
    test.hidden(false); assert.equal(test.stages[0].active, true);
    test.run(); await settle();
    assert.equal(test.stages.length, 1); assert.equal(test.imports.length, 1);
  });

  await check('cached navigation suspends and resumes while final navigation disposes once', async () => {
    const test = fixture(); await settle(); test.visible(true); const stage = test.stages[0];
    test.page('pagehide', true); assert.equal(stage.active, false); assert.equal(stage.disposals, 0);
    test.visible(true); assert.equal(stage.active, false);
    test.page('pageshow', true); assert.equal(stage.active, true);
    test.page('pagehide', false); assert.equal(stage.active, false); assert.equal(stage.disposals, 1);
    assert.equal(test.observers[0].disconnected, true);
    for (const [target, event] of [[test.media,'change'],[test.document,'visibilitychange'],[test.windows,'pagehide'],[test.windows,'pageshow']]) {
      assert.equal((target.listeners[event] || []).length, 0);
    }
    test.page('pageshow', true); test.visible(true); test.motion(false);
    assert.equal(stage.active, false); assert.equal(stage.disposals, 1);
  });

  await check('late imports do not mount after navigation and late stage instances are disposed', async () => {
    const importing = fixture({holdImport:true}); importing.page('pagehide', false);
    importing.releaseImport(); await settle(); assert.equal(importing.stages.length, 0);
    const mounting = fixture({holdMount:true}); await settle();
    assert.equal(mounting.stages.length, 1);
    mounting.page('pagehide', false); mounting.releaseMount(); await settle();
    assert.equal(mounting.stages[0].disposals, 1);
    assert.equal(mounting.stages[0].active, false);
    assert.notEqual(mounting.host.dataset.renderState, 'ready');
  });

  await check('module and renderer failures retain the authored fallback and release any stage', async () => {
    for (const options of [{failImport:true},{failDuringMount:true}]) {
      const test = fixture(options); await settle();
      assert.equal(test.host.dataset.renderState, 'fallback');
      assert.ok(test.host.querySelector('.home-power-fallback'));
      if (test.stages.length) assert.equal(test.stages[0].disposals, 1);
    }
    const test = fixture(); await settle(); test.visible(true);
    test.stages[0].fail(); test.stages[0].fail();
    assert.equal(test.host.dataset.renderState, 'fallback');
    assert.equal(test.stages[0].disposals, 1); assert.equal(test.stages[0].active, false);
    test.motion(false); test.visible(true); test.page('pagehide', false);
    assert.equal(test.stages[0].disposals, 1);
  });

  await check('missing visibility observers still respect hidden pages and reduced motion', async () => {
    const test = fixture({noObserver:true,hidden:true,reduced:true}); await settle();
    assert.equal(test.stages[0].active, false); assert.equal(test.stages[0].moving, false);
    test.hidden(false); assert.equal(test.stages[0].active, true); assert.equal(test.stages[0].moving, false);
  });

  await check('unrelated pages do not request a renderer or register lifecycle listeners', () => {
    const test = fixture({markup:'<main>Another page</main>'});
    assert.equal(test.imports.length, 0); assert.equal(test.observers.length, 0);
    assert.equal(Object.keys(test.windows.listeners).length, 0);
  });

  console.log('\n' + passed + ' Proton hero animation checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
