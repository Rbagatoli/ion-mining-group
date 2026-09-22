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
  const document = parse(html), windows = new Element('window'), media = new Element('media');
  document.readyState = 'complete'; document.hidden = false;
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('#fragment');
  const tag = html.match(/<script\b[^>]*src="\.\/home-energy-explorer\.js[^>]*>/)?.[0];
  assert.ok(tag, 'The actual homepage must load the explorer controller.');
  const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  document.currentScript = new Element('script', attrs);
  document.currentScript.src = new URL(attrs.src, 'https://preview.test/').href;
  const root = document.getElementById('home-energy-explorer');
  const host = root.querySelector('[data-energy-site]'), image = host.querySelector('img');
  const back = root.querySelector('[data-globe-back]');
  const observers = [], imports = [], stages = [], flights = [], resets = [], posters = [];
  const pendingModules = new Map(), mountGate = options.holdMount ? deferred() : null;
  const posterGates = new Map((options.holdPosters || []).map(id => [id, deferred()]));
  const globe = {
    active: true, disposed: false,
    setActive(value) { this.active = value; },
    flyTo(source) {
      const request = {source, ...deferred()}; flights.push(request);
      if (!options.holdFlights) request.resolve(true);
      return request.promise;
    },
    reset() { resets.push(true); return Promise.resolve(true); },
    dispose() { this.disposed = true; this.active = false; }
  };
  const modules = {
    globeSrc: {mountHomeDiscoveryGlobe() { return globe; }},
    kitSrc: {createSiteKit() { return {}; }},
    moduleSrc: {async mountSourcingScene(_host, builder, callbacks) {
      const stage = {
        context: stages.length + 1, model: builder({}).id, installs: [], active: false, disposed: false,
        setActive(value) { this.active = value; },
        setMotion(value) { this.moving = value; },
        async setScene(nextBuilder) { this.model = nextBuilder({}).id; this.installs.push(this.model); },
        dispose() { this.disposed = true; this.active = false; },
        fail() { callbacks.onError(); }
      };
      stages.push(stage);
      if (mountGate) await mountGate.promise;
      return stage;
    }},
    gasSrc: {buildLandfillScene: () => ({id:'landfill'}), buildFlareScene: () => ({id:'flare'})},
    waterSrc: {buildHydroScene: () => ({id:'hydro'}), buildNuclearScene: () => ({id:'nuclear'})},
    renewablesSrc: {buildWindScene: () => ({id:'wind'}), buildSolarScene: () => ({id:'solar'})},
    industrySrc: {buildIndustrialScene: () => ({id:'industrial'}), buildGridScene: () => ({id:'grid'})}
  };
  media.matches = !!options.reduced;
  const sandbox = {
    document, URL, console,
    CustomEvent: class { constructor(type, values) { this.type = type; this.detail = values.detail; } },
    matchMedia: () => media,
    Image: class {
      decode() {
        const id = this.src.match(/energy-site-([a-z]+)-960\.webp/)[1]; posters.push(id);
        return posterGates.get(id)?.promise || Promise.resolve();
      }
    },
    ResizeObserver: options.noResizeObserver ? undefined : class {},
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
  return {
    document, root, host, image, back, globe, stages, flights, resets, posters, imports, observers, media,
    choose(id) { document.querySelector('[data-research-source="' + id + '"]').fire('click'); },
    visible(value) { observers.forEach(observer => observer.callback([{isIntersecting:value}])); },
    hidden(value) { document.hidden = value; document.fire('visibilitychange'); },
    motion(value) { media.matches = value; media.fire('change'); },
    page(type, persisted) { windows.fire(type, {persisted}); },
    resolveModule(key) { pendingModules.get(key).resolve(modules[key]); },
    rejectModule(key) { pendingModules.get(key).reject(new Error('late module failure')); },
    resolvePoster(id) { posterGates.get(id).resolve(); },
    releaseMount() { mountGate.resolve(); }
  };
}

let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log('  ok    ' + name); }
  catch (error) { failed++; console.error('  FAIL  ' + name + '\n' + error.stack); }
}
function assertFacility(test, id) {
  assert.equal(test.root.dataset.view, 'facility');
  assert.equal(test.host.dataset.energySite, id);
  assert.equal(test.root.getAttribute('aria-busy'), null);
  assert.equal(test.root.querySelector('.home-facility-layer').getAttribute('aria-hidden'), 'false');
  assert.match(test.image.src, new RegExp('energy-site-' + id + '-960\\.webp$'));
  assert.match(test.image.alt, /^Illustrative miniature\./);
}

(async () => {
  await check('the globe waits for a source choice before creating any facility stage', async () => {
    const test = fixture(); await settle(); test.visible(true);
    assert.equal(test.root.dataset.view, 'globe');
    assert.equal(test.back.hidden, true);
    assert.deepEqual(test.imports, ['globeSrc']);
    assert.equal(test.stages.length, 0);
    test.choose('landfill'); await settle();
    assertFacility(test, 'landfill');
    assert.equal(test.stages.length, 1);
    assert.equal(test.stages[0].active, true);
    assert.equal(test.globe.active, false);
  });

  await check('a newer choice wins while an older poster is still decoding', async () => {
    const test = fixture({holdPosters:['landfill']}); await settle(); test.visible(true);
    test.choose('landfill'); await settle();
    test.choose('wind'); await settle();
    assert.equal(test.root.dataset.view, 'travel');
    test.resolvePoster('landfill'); await settle();
    assertFacility(test, 'wind');
    assert.deepEqual(test.stages.map(stage => stage.model), ['wind']);
    assert.equal(test.document.getElementById('research-site-title').textContent, 'Wind power');
  });

  await check('rapid choices during stage creation reuse one context and install the latest source', async () => {
    const test = fixture({holdMount:true}); await settle(); test.visible(true);
    test.choose('landfill'); await settle();
    assert.equal(test.stages.length, 1);
    test.choose('hydro'); test.choose('solar'); await settle();
    test.releaseMount(); await settle();
    assertFacility(test, 'solar');
    assert.equal(test.stages.length, 1);
    assert.equal(test.stages[0].model, 'solar');
    assert.deepEqual(test.stages[0].installs, ['solar']);
    assert.equal(test.stages[0].active, true);
  });

  await check('Back cancels pending selection, restores source focus and ignores a late flight', async () => {
    const test = fixture({holdPosters:['hydro'],holdFlights:true}); await settle(); test.visible(true);
    test.choose('hydro'); await settle();
    test.back.focus(); test.back.fire('click'); await settle();
    assert.equal(test.root.dataset.view, 'globe');
    assert.equal(test.back.hidden, true);
    assert.equal(test.root.getAttribute('aria-busy'), null);
    assert.equal(test.document.activeElement.dataset.researchSource, 'hydro');
    test.resolvePoster('hydro'); test.flights.forEach(flight => flight.resolve(true)); await settle();
    assert.equal(test.root.dataset.view, 'globe');
    assert.equal(test.stages.length, 0);
    assert.equal(test.root.querySelector('.home-facility-layer').getAttribute('aria-hidden'), 'true');
    assert.equal(test.root.querySelector('#home-search-scope').textContent, 'A world of energy.');
  });

  await check('all eight choices keep one facility context and returning permits the same source again', async () => {
    const test = fixture(); await settle(); test.visible(true);
    for (const id of sourceNames) {
      test.choose(id); await settle(); assertFacility(test, id);
      assert.equal(test.stages.length, 1); assert.equal(test.stages[0].model, id);
    }
    assert.equal(new Set(test.imports).size, test.imports.length, 'Cached modules should not be requested again.');
    const flights = test.flights.length;
    test.back.fire('click'); await settle();
    assert.equal(test.stages[0].active, false);
    test.choose('grid'); await settle(); assertFacility(test, 'grid');
    assert.equal(test.flights.length, flights + 1);
    assert.equal(test.stages.length, 1);
  });

  await check('reduced motion keeps selected posters usable and can later enable the same facility', async () => {
    const test = fixture({reduced:true}); await settle(); test.visible(true);
    for (const id of ['landfill','nuclear','industrial']) {
      test.choose(id); await settle(); assertFacility(test, id);
      assert.equal(test.host.dataset.renderState, 'reduced');
      assert.equal(test.stages.length, 0);
    }
    assert.deepEqual(test.imports, ['globeSrc']);
    test.motion(false); await settle();
    assert.equal(test.host.dataset.renderState, 'ready');
    assert.equal(test.stages[0].model, 'industrial');
    assert.equal(test.stages[0].moving, true);
    test.motion(true); await settle();
    assert.equal(test.host.dataset.renderState, 'reduced');
    assert.equal(test.stages[0].moving, false);
  });

  await check('motion changes and Back during stage creation cannot leave an unwanted active scene', async () => {
    const reduced = fixture({holdMount:true}); await settle(); reduced.visible(true);
    reduced.choose('wind'); await settle(); reduced.motion(true);
    reduced.releaseMount(); await settle();
    assertFacility(reduced, 'wind');
    assert.equal(reduced.host.dataset.renderState, 'reduced');
    assert.equal(reduced.stages[0].moving, false);

    const returning = fixture({holdMount:true}); await settle(); returning.visible(true);
    returning.choose('hydro'); await settle(); returning.back.fire('click'); await settle();
    returning.releaseMount(); await settle();
    assert.equal(returning.root.dataset.view, 'globe');
    assert.equal(returning.stages[0].active, false);
    assert.equal(returning.root.querySelector('.home-facility-layer').getAttribute('aria-hidden'), 'true');
  });

  await check('offscreen, hidden and cached-page states pause motion without losing the choice', async () => {
    const test = fixture(); await settle(); test.visible(true);
    test.choose('flare'); await settle(); const stage = test.stages[0];
    assert.equal(stage.active, true);
    test.visible(false); assert.equal(stage.active, false);
    test.visible(true); assert.equal(stage.active, true);
    test.hidden(true); assert.equal(stage.active, false);
    test.hidden(false); assert.equal(stage.active, true);
    test.page('pagehide', true); assert.equal(stage.active, false); assert.equal(stage.disposed, false);
    test.page('pageshow', true); assert.equal(stage.active, true);
    assertFacility(test, 'flare');
    test.page('pagehide', false);
    assert.equal(stage.disposed, true); assert.equal(test.globe.disposed, true);
    assert.equal(test.observers[0].disconnected, true);
    test.choose('solar'); await settle();
    assert.equal(test.stages.length, 1);
    assert.equal(test.host.dataset.energySite, 'flare');
  });

  await check('missing modules or ResizeObserver retain posters, accessible descriptions and Back', async () => {
    for (const options of [{failModules:['moduleSrc']},{noResizeObserver:true}]) {
      const test = fixture(options); await settle(); test.visible(true);
      test.choose('hydro'); await settle(); assertFacility(test, 'hydro');
      assert.equal(test.host.dataset.renderState, 'fallback');
      test.choose('grid'); await settle(); assertFacility(test, 'grid');
      assert.equal(test.host.dataset.renderState, 'fallback');
      test.back.fire('click'); await settle(); assert.equal(test.root.dataset.view, 'globe');
    }
  });

  await check('globe download failure cannot block facility selection or leave the explorer busy', async () => {
    const test = fixture({failModules:['globeSrc']}); await settle(); test.visible(true);
    assert.equal(test.root.querySelector('#home-discovery-globe').dataset.renderState, 'fallback');
    test.choose('nuclear'); await settle(); assertFacility(test, 'nuclear');
    assert.equal(test.stages[0].model, 'nuclear');
    test.back.fire('click'); await settle();
    assert.equal(test.root.dataset.view, 'globe');
    assert.equal(test.back.hidden, true);
  });

  await check('a lost facility context is disposed and later choices retain their own posters', async () => {
    const test = fixture(); await settle(); test.visible(true);
    test.choose('hydro'); await settle();
    test.stages[0].fail();
    assert.equal(test.stages[0].disposed, true);
    assert.equal(test.host.dataset.renderState, 'fallback');
    test.choose('solar'); await settle(); assertFacility(test, 'solar');
    assert.equal(test.host.dataset.renderState, 'fallback');
    assert.equal(test.stages.length, 1, 'A context loss must not create successive replacement contexts.');
  });

  await check('a failed old family download cannot disable a newer healthy choice', async () => {
    const test = fixture({holdModules:['gasSrc']}); await settle(); test.visible(true);
    test.choose('landfill'); await settle();
    test.choose('wind'); await settle();
    test.rejectModule('gasSrc'); await settle();
    assertFacility(test, 'wind');
    assert.equal(test.host.dataset.renderState, 'ready');
    assert.equal(test.stages.length, 1);
    assert.equal(test.stages[0].model, 'wind');
  });

  await check('late stage creation is disposed after final navigation', async () => {
    const test = fixture({holdMount:true}); await settle(); test.visible(true);
    test.choose('solar'); await settle();
    test.page('pagehide', false); test.releaseMount(); await settle();
    assert.equal(test.stages.length, 1);
    assert.equal(test.stages[0].disposed, true);
    assert.equal(test.stages[0].active, false);
    assert.notEqual(test.root.dataset.view, 'facility');
  });

  console.log('\n' + passed + ' homepage explorer checks passed' + (failed ? '; ' + failed + ' failed.' : '.'));
  if (failed) process.exitCode = 1;
})();
