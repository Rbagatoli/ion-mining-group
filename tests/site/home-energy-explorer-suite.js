/* Exercise real source/research controllers with authored markup and a controlled
   globe lifecycle. No WebGL renderer is needed for these interaction checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Element, parse} = require('./helpers/terrain-dom.js');
const html = fs.readFileSync(__dirname + '/../../site/index.html', 'utf8');
const explorerSource = fs.readFileSync(__dirname + '/../../site/home-energy-explorer.js', 'utf8');
const researchSource = fs.readFileSync(__dirname + '/../../site/home-research-preview.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const sourceNames = ['landfill', 'flare', 'hydro', 'nuclear', 'wind', 'solar', 'industrial', 'grid'];

const dataAttribute = key => 'data-' + String(key).replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
Object.defineProperties(Element.prototype, {
  dataset: {get() {
    if (!this._dataset) this._dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(dataAttribute(key)) ?? undefined,
      set: (_, key, value) => { this.setAttribute(dataAttribute(key), value); return true; }
    });
    return this._dataset;
  }},
  id: {get() { return this.getAttribute('id') || ''; }, set(value) { this.setAttribute('id', value); }},
  tabIndex: {get() { return Number(this.getAttribute('tabindex') || 0); }, set(value) { this.setAttribute('tabindex', value); }}
});
Element.prototype.hasAttribute = function (name) { return this.getAttribute(name) !== null; };
Element.prototype.contains = function (other) {
  for (let node = other; node; node = node.parentElement) if (node === this) return true;
  return false;
};
Element.prototype.append = function (...nodes) {
  for (const node of nodes) {
    if (node.tagName === '#fragment') {
      for (const child of [...node.children]) this.appendChild(child);
      node.children = [];
    } else this.appendChild(node);
  }
};
Element.prototype.replaceChildren = function (...nodes) {
  for (const child of this.children) child.parentElement = null;
  this.children = []; this._text = ''; this.append(...nodes);
};
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
}

function fixture(options = {}) {
  const document = parse(html), windows = new Element('window');
  const motion = new Element('media'), hover = new Element('media'), compact = new Element('media');
  motion.matches = !!options.reduced; hover.matches = !options.coarse; compact.matches = !!options.compact;
  document.readyState = 'complete'; document.hidden = false;
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('#fragment');
  const tag = html.match(/<script\b[^>]*src="\.\/home-energy-explorer\.js[^>]*>/)?.[0];
  assert.ok(tag, 'The homepage must load the explorer controller.');
  const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  document.currentScript = new Element('script', attrs);
  document.currentScript.src = new URL(attrs.src, 'https://preview.test/').href;
  const root = document.getElementById('home-energy-explorer');
  const globeHost = root.querySelector('#home-discovery-globe');
  const details = document.querySelector('.research-details');
  const observers = [], imports = [], timers = new Map();
  const moduleGate = options.holdModule ? deferred() : null;
  let clock = 0, timerID = 0, mounts = 0;
  const globe = {
    active:true, disposed:false, selections:[], disposals:0,
    select(id) { this.selections.push(id); },
    setActive(value) { this.active = value; },
    flyTo() { assert.fail('Source choices must never start a globe flight.'); },
    reset() { assert.fail('Source choices must never reset the camera.'); },
    dispose() { this.disposed = true; this.active = false; this.disposals++; }
  };
  const globeModule = {mountHomeDiscoveryGlobe(host) { assert.equal(host, globeHost); mounts++; return globe; }};
  const sandbox = {
    document, URL, console,
    CustomEvent: class { constructor(type, values) { this.type = type; this.detail = values.detail; } },
    matchMedia: query => query.includes('reduced-motion') ? motion : query.includes('max-width') ? compact : hover,
    setTimeout(fn, delay) { const id = ++timerID; timers.set(id, {fn, at:clock + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    },
    addEventListener: (...args) => windows.addEventListener(...args),
    removeEventListener: (...args) => windows.removeEventListener(...args),
    testImport(url) {
      assert.equal(url, document.currentScript.dataset.globeSrc, 'Source choices must not download a facility renderer.');
      imports.push(url);
      if (options.failModule) return Promise.reject(new Error('module unavailable'));
      return moduleGate ? moduleGate.promise : Promise.resolve(globeModule);
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(researchSource).runInContext(sandbox);
  new vm.Script(explorerSource.replace('import(url)', 'testImport(url)')).runInContext(sandbox);
  const button = id => document.querySelector('[data-research-source="' + id + '"]');
  return {
    document, root, globeHost, details, globe, imports, observers, button,
    mounts: () => mounts,
    choose(id) { button(id).fire('click'); },
    hover(id, pointerType = 'mouse') { button(id).fire('pointerover', {pointerType}); },
    leave(id) { button(id).fire('pointerout', {relatedTarget:details}); },
    tick(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); }
    },
    visible(value) { observers.forEach(observer => observer.callback([{isIntersecting:value}])); },
    hidden(value) { document.hidden = value; document.fire('visibilitychange'); },
    motion(value) { motion.matches = value; motion.fire('change'); },
    page(type, persisted) { windows.fire(type, {persisted}); },
    resolveModule() { moduleGate.resolve(globeModule); }
  };
}

let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log('  ok    ' + name); }
  catch (error) { failed++; console.error('  FAIL  ' + name + '\n' + error.stack); }
}
function assertResearch(test, id) {
  assert.equal(test.root.dataset.view, 'globe', 'Research must leave the globe visible.');
  assert.equal(test.details.hasAttribute('open'), true);
  assert.equal(test.document.getElementById('home-research-preview').dataset.researchActiveSource, id);
  assert.equal(test.button(id).getAttribute('aria-pressed'), 'true');
  if (test.mounts()) assert.equal(test.globe.selections.at(-1), id);
}

(async () => {
  await check('hover intent reveals research while the globe stays visible and active', async () => {
    const test = fixture(); await settle(); test.visible(true);
    test.hover('nuclear'); test.tick(119);
    assert.equal(test.details.hasAttribute('open'), false);
    test.tick(1); assertResearch(test, 'nuclear');
    assert.equal(test.document.getElementById('research-site-title').textContent, 'Nuclear power');
    assert.match(test.document.getElementById('home-search-scope').textContent, /Nuclear/);
    assert.equal(test.document.activeElement, undefined, 'Hover must not move keyboard focus.');
    assert.equal(test.globe.active, true);
    assert.equal(test.root.getAttribute('aria-busy'), null);
    test.leave('nuclear'); test.tick(1000); assertResearch(test, 'nuclear');
    assert.equal(test.imports.length, 1);
  });
  await check('passing hover cancels, coarse pointers wait for activation, and keyboard focus selects', async () => {
    const passing = fixture(); await settle(); passing.hover('solar'); passing.tick(119); passing.leave('solar'); passing.tick(500);
    assert.equal(passing.details.hasAttribute('open'), false);
    const touch = fixture({coarse:true}); await settle();
    touch.hover('nuclear', 'touch'); touch.tick(500);
    touch.button('nuclear').fire('pointerdown', {pointerType:'touch'}); touch.button('nuclear').focus();
    assert.equal(touch.details.hasAttribute('open'), false, 'Touch focus must wait for activation.');
    touch.button('nuclear').fire('pointerup'); touch.choose('nuclear'); assertResearch(touch, 'nuclear');
    touch.button('wind').focus(); assertResearch(touch, 'wind');
    assert.equal(touch.document.activeElement, touch.button('wind'));
  });
  await check('all eight sources preserve the chosen research tab without starting another renderer', async () => {
    const test = fixture(); await settle(); test.visible(true);
    test.document.querySelector('[data-research-tab="capital"]').fire('click');
    for (const id of sourceNames) {
      test.choose(id); assertResearch(test, id);
      assert.equal(test.globe.active, true);
      assert.equal(test.document.querySelector('[data-research-tab="capital"]').getAttribute('aria-selected'), 'true');
    }
    assert.equal(test.imports.length, 1); assert.equal(test.mounts(), 1);
  });
  await check('compact layouts keep research available as taps select different sources', async () => {
    const test = fixture({compact:true, coarse:true}); await settle(); test.visible(true);
    assert.equal(test.details.hasAttribute('open'), true);
    for (const id of ['nuclear', 'hydro', 'grid']) {
      test.button(id).fire('pointerdown', {pointerType:'touch'});
      test.button(id).focus(); test.button(id).fire('pointerup'); test.choose(id);
      assertResearch(test, id); assert.equal(test.globe.active, true);
    }
    assert.equal(test.imports.length, 1);
  });
  await check('late-created globe labels share hover and keyboard source selection', async () => {
    const test = fixture(); await settle();
    const label = new Element('button', {'data-globe-source':'nuclear'});
    test.globeHost.appendChild(label);
    label.fire('pointerover', {pointerType:'mouse'}); test.tick(120); assertResearch(test, 'nuclear');
    assert.equal(test.document.activeElement, undefined);
    test.choose('hydro'); label.focus(); assertResearch(test, 'nuclear');
  });
  await check('research works during globe download and the latest selection is highlighted on mount', async () => {
    const test = fixture({holdModule:true}); test.visible(true);
    test.choose('landfill'); test.choose('hydro'); test.choose('wind'); assertResearch(test, 'wind');
    assert.equal(test.mounts(), 0);
    test.resolveModule(); await settle(); assertResearch(test, 'wind');
    assert.equal(test.mounts(), 1); assert.equal(test.globe.active, true);
    assert.deepEqual(test.globe.selections, ['wind']);
  });
  await check('reduced-motion users keep the same source controls and globe lifecycle', async () => {
    const test = fixture({reduced:true}); await settle(); test.visible(true); test.choose('nuclear'); assertResearch(test, 'nuclear');
    test.motion(false); test.choose('solar'); assertResearch(test, 'solar');
    test.motion(true); test.choose('hydro'); assertResearch(test, 'hydro');
    assert.equal(test.imports.length, 1); assert.equal(test.mounts(), 1);
  });
  await check('offscreen, hidden and cached pages pause the globe and cancel pending hover', async () => {
    const test = fixture(); await settle(); test.visible(true); test.choose('flare');
    assert.equal(test.globe.active, true); test.visible(false); assert.equal(test.globe.active, false);
    test.visible(true); test.hidden(true); assert.equal(test.globe.active, false); test.hidden(false); assert.equal(test.globe.active, true);
    test.hover('solar'); test.page('pagehide', true); test.tick(500);
    assert.equal(test.globe.active, false); assert.equal(test.globe.disposed, false); assertResearch(test, 'flare');
    test.page('pageshow', true); assert.equal(test.globe.active, true);
    test.page('pagehide', false); assert.equal(test.globe.disposed, true);
    assert.equal(test.observers[0].disconnected, true);
    test.choose('grid'); test.button('wind').focus();
    assert.equal(test.document.getElementById('home-research-preview').dataset.researchActiveSource, 'flare');
    assert.equal(test.globe.selections.at(-1), 'flare');
  });
  await check('a globe download failure leaves all source research available', async () => {
    const test = fixture({failModule:true}); await settle(); test.choose('nuclear'); assertResearch(test, 'nuclear');
    assert.equal(test.globeHost.dataset.renderState, 'fallback');
    test.choose('grid'); assertResearch(test, 'grid');
    assert.equal(test.mounts(), 0); assert.equal(test.imports.length, 1);
  });
  await check('late globe completion after final navigation is disposed instead of reactivated', async () => {
    const test = fixture({holdModule:true}); test.visible(true); test.choose('nuclear');
    test.page('pagehide', false); test.resolveModule(); await settle();
    assert.equal(test.globe.disposed, true); assert.equal(test.globe.disposals, 1);
    assert.equal(test.globe.active, false); assert.deepEqual(test.globe.selections, []);
  });
  console.log('\n' + passed + ' homepage explorer checks passed' + (failed ? '; ' + failed + ' failed.' : '.'));
  if (failed) process.exitCode = 1;
})();
