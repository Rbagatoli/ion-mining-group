/* Real controllers and authored markup; module loading and GPU work are controlled. */
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
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function fixture(options = {}) {
  const document = parse(html), windows = new Element('window');
  const motion = new Element('media'), hover = new Element('media');
  motion.matches = !!options.reduced; hover.matches = !options.coarse;
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
  const host = root.querySelector('[data-facility-monument]'), back = root.querySelector('[data-globe-back]');
  assert.ok(host, 'The authored page must contain the new sculpture host.');
  const details = document.querySelector('.research-details');
  const observers = [], imports = [], stages = [], pendingModules = new Map(), timers = new Map();
  const mountGate = options.holdMount ? deferred() : null;
  const swapGates = new Map((options.holdSwaps || []).map(id => [id, deferred()]));
  let clock = 0, timerID = 0;
  const globe = {
    active:true, disposed:false, selections:[],
    select(id) { this.selections.push(id); },
    setActive(value) { this.active = value; },
    flyTo() { assert.fail('Source choices must never start a globe flight.'); },
    reset() { assert.fail('Back must not zoom or rotate the globe.'); },
    dispose() { this.disposed = true; this.active = false; }
  };
  const modules = {
    globeSrc: {mountHomeDiscoveryGlobe() { return globe; }},
    monumentSrc: {async mountFacilityMonument(_host, callbacks) {
      assert.equal(callbacks.modelsUrl, document.currentScript.dataset.monumentModelsSrc);
      let version = 0;
      const stage = {
        model:callbacks.source, requests:[], active:false, disposed:false, disposals:0,
        setActive(value) { this.active = value; },
        setMotion(value) { this.moving = value; },
        async setSource(id) {
          const token = ++version; this.requests.push(id);
          if (swapGates.has(id)) await swapGates.get(id).promise;
          if (this.disposed || token !== version) return false;
          this.model = id; host.dataset.monumentSource = id; host.dataset.renderState = 'ready';
          return true;
        },
        dispose() { this.disposed = true; this.disposals++; this.active = false; version++; },
        fail() { callbacks.onError(); }
      };
      stages.push(stage);
      if (mountGate) await mountGate.promise;
      host.dataset.monumentSource = callbacks.source; host.dataset.renderState = 'ready';
      return stage;
    }}
  };
  const sandbox = {
    document, URL, console,
    CustomEvent: class { constructor(type, values) { this.type = type; this.detail = values.detail; } },
    matchMedia: query => query.includes('reduced-motion') ? motion : hover,
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
      const key = Object.keys(modules).find(name => document.currentScript.dataset[name] === url);
      assert.ok(key, 'Unexpected module request: ' + url); imports.push(key);
      if ((options.failModules || []).includes(key)) return Promise.reject(new Error('module unavailable'));
      if ((options.holdModules || []).includes(key)) {
        const request = deferred(); pendingModules.set(key, request); return request.promise;
      }
      return Promise.resolve(modules[key]);
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(researchSource).runInContext(sandbox);
  new vm.Script(explorerSource.replace('import(url)', 'testImport(url)')).runInContext(sandbox);
  const button = id => document.querySelector('[data-research-source="' + id + '"]');
  return {
    document, root, host, back, details, globe, stages, imports, observers, button,
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
    resolveModule(key) { pendingModules.get(key).resolve(modules[key]); },
    releaseMount() { mountGate.resolve(); },
    releaseSwap(id) { swapGates.get(id).resolve(); },
    rejectSwap(id) { swapGates.get(id).reject(new Error('old swap failed')); }
  };
}

let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log('  ok    ' + name); }
  catch (error) { failed++; console.error('  FAIL  ' + name + '\n' + error.stack); }
}
function assertFacility(test, id, state = 'ready') {
  assert.equal(test.root.dataset.view, 'facility');
  assert.equal(test.host.dataset.monumentSource, id);
  assert.equal(test.host.dataset.renderState, state);
  assert.equal(test.root.getAttribute('aria-busy'), null);
  assert.equal(test.host.hasAttribute('data-selection-pending'), false);
  assert.equal(test.root.querySelector('.home-facility-layer').getAttribute('aria-hidden'), 'false');
  assert.equal(test.details.hasAttribute('open'), true);
  assert.equal(test.document.getElementById('home-research-preview').dataset.researchActiveSource, id);
}

(async () => {
  await check('hover intent opens research and switches immediately without a globe flight or old poster', async () => {
    const test = fixture({holdModules:['monumentSrc']}); await settle(); test.visible(true);
    assert.equal(test.root.dataset.view, 'globe'); assert.equal(test.stages.length, 0);
    assert.equal(test.host.querySelector('img'), null);
    assert.deepEqual(test.imports, ['globeSrc']);
    test.hover('nuclear'); test.tick(119);
    assert.equal(test.root.dataset.view, 'globe');
    test.tick(1);
    assert.equal(test.root.dataset.view, 'facility');
    assert.equal(test.host.dataset.selectionPending, 'true');
    assert.equal(test.root.getAttribute('aria-busy'), 'true');
    assert.equal(test.details.hasAttribute('open'), true);
    assert.equal(test.document.getElementById('research-site-title').textContent, 'Nuclear power');
    assert.equal(test.document.activeElement, undefined, 'Hover must not move keyboard focus.');
    assert.equal(test.globe.active, false);
    test.resolveModule('monumentSrc'); await settle(); assertFacility(test, 'nuclear');
    test.leave('nuclear'); test.tick(1000);
    assertFacility(test, 'nuclear');
  });
  await check('passing hover cancels, coarse pointers wait for click, and keyboard focus selects', async () => {
    const passing = fixture(); await settle(); passing.hover('solar'); passing.tick(119); passing.leave('solar'); passing.tick(500);
    assert.equal(passing.root.dataset.view, 'globe'); assert.equal(passing.stages.length, 0);
    const touch = fixture({coarse:true}); await settle();
    touch.hover('nuclear', 'touch'); touch.tick(500);
    touch.button('nuclear').fire('pointerdown', {pointerType:'touch'}); touch.button('nuclear').focus();
    assert.equal(touch.root.dataset.view, 'globe', 'Touch focus must not reveal before activation.');
    touch.button('nuclear').fire('pointerup'); touch.choose('nuclear'); await settle(); assertFacility(touch, 'nuclear');
    touch.button('wind').focus(); await settle(); assertFacility(touch, 'wind');
    assert.equal(touch.document.activeElement, touch.button('wind'));
  });
  await check('all eight sources preserve the research tab and use one renderer', async () => {
    const test = fixture(); await settle(); test.visible(true);
    test.document.querySelector('[data-research-tab="capital"]').fire('click');
    for (const id of sourceNames) {
      test.choose(id); await settle(); assertFacility(test, id);
      assert.equal(test.stages.length, 1); assert.equal(test.stages[0].model, id);
      assert.equal(test.document.querySelector('[data-research-tab="capital"]').getAttribute('aria-selected'), 'true');
    }
    assert.deepEqual(test.imports, ['globeSrc', 'monumentSrc']);
  });
  await check('late-created globe labels share source intent and leave keyboard focus on a visible control', async () => {
    const test = fixture(); await settle();
    const label = new Element('button', {'data-globe-source':'nuclear'});
    test.root.querySelector('#home-discovery-globe').appendChild(label);
    label.fire('pointerover', {pointerType:'mouse'}); test.tick(120); await settle();
    assertFacility(test, 'nuclear'); assert.equal(test.document.activeElement, undefined);
    test.back.fire('click'); label.focus(); await settle();
    assertFacility(test, 'nuclear'); assert.equal(test.document.activeElement, test.button('nuclear'));
  });
  await check('Back collapses research and restores focus without hover or focus reopening it', async () => {
    const test = fixture(); await settle(); test.visible(true); test.choose('nuclear'); await settle();
    test.back.focus(); test.back.fire('click'); await settle();
    assert.equal(test.root.dataset.view, 'globe'); assert.equal(test.details.hasAttribute('open'), false);
    assert.equal(test.document.activeElement, test.button('nuclear')); assert.equal(test.back.hidden, true);
    assert.equal(test.stages[0].active, false); assert.equal(test.globe.active, true);
    test.hover('nuclear'); test.tick(120); await settle(); assertFacility(test, 'nuclear');
    // A keyboard Back can leave the pointer resting over the old source.
    test.back.fire('click'); test.hover('nuclear'); test.tick(500); assert.equal(test.root.dataset.view, 'globe');
    test.leave('nuclear'); test.hover('nuclear'); test.tick(120); await settle(); assertFacility(test, 'nuclear');
    test.back.fire('click'); test.choose('nuclear'); await settle(); assertFacility(test, 'nuclear');
    assert.equal(test.stages.length, 1);
  });
  await check('rapid source choices during download mount only the latest selection', async () => {
    const test = fixture({holdModules:['monumentSrc']}); await settle();
    test.choose('landfill'); test.choose('hydro'); test.choose('wind');
    test.resolveModule('monumentSrc'); await settle();
    assertFacility(test, 'wind'); assert.equal(test.stages.length, 1); assert.equal(test.stages[0].model, 'wind');
  });
  await check('a slow initial mount is reused and cannot expose the superseded source', async () => {
    const test = fixture({holdMount:true}); await settle(); test.visible(true);
    test.choose('landfill'); await settle(); test.choose('solar'); await settle();
    assert.equal(test.stages.length, 1); assert.equal(test.host.dataset.selectionPending, 'true');
    test.releaseMount(); await settle(); assertFacility(test, 'solar');
    assert.equal(test.stages[0].model, 'solar'); assert.equal(test.stages[0].active, true);
  });
  await check('returning to the already rendered source cancels an intervening asynchronous swap', async () => {
    const test = fixture({holdSwaps:['solar']}); await settle(); test.choose('nuclear'); await settle();
    test.choose('solar'); await settle(); test.choose('nuclear'); await settle(); assertFacility(test, 'nuclear');
    test.releaseSwap('solar'); await settle(); assertFacility(test, 'nuclear');
    assert.equal(test.stages[0].model, 'nuclear');
  });
  await check('a failed old swap cannot disable the newer selected sculpture', async () => {
    const test = fixture({holdSwaps:['solar']}); await settle(); test.choose('nuclear'); await settle();
    test.choose('solar'); await settle(); test.choose('grid'); await settle();
    test.rejectSwap('solar'); await settle(); assertFacility(test, 'grid');
    assert.equal(test.stages[0].disposed, false);
  });
  await check('Back during download or model installation ignores late work', async () => {
    const loading = fixture({holdModules:['monumentSrc']}); await settle(); loading.choose('hydro'); loading.back.fire('click');
    loading.resolveModule('monumentSrc'); await settle();
    assert.equal(loading.root.dataset.view, 'globe'); assert.equal(loading.stages.length, 0);
    const mounting = fixture({holdMount:true}); await settle(); mounting.choose('hydro'); await settle(); mounting.back.fire('click');
    mounting.releaseMount(); await settle();
    assert.equal(mounting.root.dataset.view, 'globe'); assert.equal(mounting.stages[0].active, false);
    assert.equal(mounting.details.hasAttribute('open'), false);
  });
  await check('reduced motion renders the same sculpture as a still and responds to preference changes', async () => {
    const test = fixture({reduced:true}); await settle(); test.visible(true); test.choose('nuclear'); await settle();
    assertFacility(test, 'nuclear'); assert.equal(test.stages.length, 1); assert.equal(test.stages[0].moving, false);
    test.motion(false); assert.equal(test.stages[0].moving, true);
    test.motion(true); assert.equal(test.stages[0].moving, false); assert.equal(test.stages.length, 1);
  });
  await check('offscreen, hidden and cached pages pause without losing selection and cancel pending hover', async () => {
    const test = fixture(); await settle(); test.visible(true); test.choose('flare'); await settle(); const stage = test.stages[0];
    assert.equal(stage.active, true); test.visible(false); assert.equal(stage.active, false);
    test.visible(true); test.hidden(true); assert.equal(stage.active, false); test.hidden(false); assert.equal(stage.active, true);
    test.hover('solar'); test.page('pagehide', true); test.tick(500); await settle();
    assert.equal(stage.active, false); assert.equal(stage.disposed, false); assertFacility(test, 'flare');
    test.page('pageshow', true); assert.equal(stage.active, true);
    test.page('pagehide', false); assert.equal(stage.disposed, true); assert.equal(test.globe.disposed, true);
    assert.equal(test.observers[0].disconnected, true);
    test.choose('grid'); test.button('wind').focus(); await settle(); assert.equal(test.host.dataset.monumentSource, 'flare');
  });
  await check('a missing renderer preserves research and descriptive fallback without miniature posters', async () => {
    const test = fixture({failModules:['monumentSrc']}); await settle(); test.choose('nuclear'); await settle();
    assertFacility(test, 'nuclear', 'fallback'); assert.equal(test.host.querySelector('img'), null);
    assert.match(test.host.querySelector('[data-monument-fallback]').textContent, /preview unavailable/);
    assert.match(test.host.getAttribute('aria-label'), /nuclear/);
    test.choose('grid'); await settle(); assertFacility(test, 'grid', 'fallback');
    test.back.fire('click'); assert.equal(test.root.dataset.view, 'globe');
  });
  await check('globe failure does not block sculptures and a lost sculpture context is released once', async () => {
    const test = fixture({failModules:['globeSrc']}); await settle(); test.choose('nuclear'); await settle();
    assertFacility(test, 'nuclear'); assert.equal(test.root.querySelector('#home-discovery-globe').dataset.renderState, 'fallback');
    const stage = test.stages[0]; stage.fail(); assertFacility(test, 'nuclear', 'fallback');
    assert.equal(stage.disposals, 1); stage.fail(); assert.equal(stage.disposals, 1);
    test.choose('solar'); await settle(); assertFacility(test, 'solar', 'fallback'); assert.equal(test.stages.length, 1);
  });
  await check('late mount completion after final navigation is disposed without reactivating', async () => {
    const test = fixture({holdMount:true}); await settle(); test.choose('nuclear'); await settle();
    test.page('pagehide', false); test.releaseMount(); await settle();
    assert.equal(test.stages[0].disposed, true); assert.equal(test.stages[0].disposals, 1); assert.equal(test.stages[0].active, false);
  });
  console.log('\n' + passed + ' homepage explorer checks passed' + (failed ? '; ' + failed + ' failed.' : '.'));
  if (failed) process.exitCode = 1;
})();
