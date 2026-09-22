/* Exercise the actual homepage preview without starting a browser or WebGL. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Element, parse} = require('./helpers/terrain-dom.js');
const html = fs.readFileSync(__dirname + '/../../site/index.html', 'utf8');
const script = new vm.Script(fs.readFileSync(__dirname + '/../../site/home-research-preview.js', 'utf8'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ok    ' + name); }

/* Supply standard DOM properties absent from the shared presentation fixture.
   These adapters stay local to this test process; the shared helper is unchanged. */
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
  tabIndex: {get() { return Number(this.getAttribute('tabindex') || 0); }, set(value) { this.setAttribute('tabindex', value); }},
  innerHTML: {set() { throw new Error('The preview must build text nodes, not parse HTML.'); }}
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

function fixture({loading = false, markup = html} = {}) {
  const document = parse(markup), events = [];
  document.readyState = loading ? 'loading' : 'complete';
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('#fragment');
  document.addEventListener('proton:discovery-source', event => events.push(event.detail.source));
  const sandbox = vm.createContext({document, CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }});
  const run = () => script.runInContext(sandbox);
  run();
  return {
    document, events, run,
    root: document.getElementById('home-research-preview'),
    panel: document.getElementById('research-content'),
    source: name => document.querySelector('[data-research-source="' + name + '"]'),
    tab: name => document.querySelector('[data-research-tab="' + name + '"]')
  };
}

function assertTabState(test, name) {
  const tabs = test.root.querySelectorAll('[data-research-tab]');
  assert.equal(tabs.filter(button => button.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(tabs.filter(button => button.tabIndex === 0).length, 1);
  assert.equal(test.tab(name).getAttribute('aria-selected'), 'true');
  assert.equal(test.panel.getAttribute('aria-labelledby'), test.tab(name).id);
  assert.equal(test.tab(name).getAttribute('aria-controls'), test.panel.id);
  assert.equal(test.panel.getAttribute('role'), 'tabpanel');
}

check('the authored homepage remains useful before JavaScript runs', () => {
  const document = parse(html), root = document.querySelector('#home-research-preview');
  assert.equal(root.querySelectorAll('.research-row').length, 4);
  assert.match(root.querySelector('#research-content').textContent, /Already in place[\s\S]*Remaining work[\s\S]*Energy access[\s\S]*Next conversation/);
  assert.equal(root.querySelector('#research-source-label').textContent, 'Illustrative example');
  assert.equal(root.querySelector('.research-cta').getAttribute('href'), './energy-sites.html#request');
  assert.equal(root.querySelector('.research-workspace-link').getAttribute('href'), './energy-sites.html#workspace');
  assert.match(html, /<script src="\.\/home-research-preview\.js(?:\?v=[a-f0-9]+)?" defer><\/script>/);
});

check('deferred initialization preserves the fallback until DOM readiness', () => {
  const test = fixture({loading: true});
  assert.equal(test.root.dataset.researchReady, undefined);
  assert.equal(test.panel.querySelectorAll('.research-row').length, 4);
  test.document.fire('DOMContentLoaded');
  assert.equal(test.root.dataset.researchReady, 'true');
  assert.equal(test.document.querySelectorAll('[data-research-source]').length, 3,
    'Only source controls may carry data-research-source.');
  assert.equal(test.document.querySelectorAll('[data-research-tab]').length, 4,
    'Only tab controls may carry data-research-tab.');
  assertTabState(test, 'overview');
  assert.deepEqual(test.events, [], 'Initialization must not act like a user source change.');
});

check('changing the source retains the selected tab and tells the globe once', () => {
  const test = fixture();
  test.tab('capital').fire('click');
  const landfillCapital = test.panel.textContent;
  test.source('powered').fire('click');
  assertTabState(test, 'capital');
  assert.equal(test.document.getElementById('research-site-title').textContent, 'Powered industrial site');
  assert.notEqual(test.panel.textContent, landfillCapital);
  assert.match(test.panel.textContent, /Unpriced — requires diligence/);
  assert.match(test.panel.textContent, /utility service/);
  assert.deepEqual(test.events, ['powered']);
  test.source('powered').fire('click');
  assert.deepEqual(test.events, ['powered'], 'Reselecting the same source must not replay globe movement.');
  assert.equal(test.root.querySelectorAll('[data-research-source]').filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
  assert.equal(test.source('powered').getAttribute('aria-pressed'), 'true');
});

check('all research routes keep their own content and illustrative boundaries', () => {
  const test = fixture(), overviews = new Set(), contactRoles = new Set();
  for (const source of ['landfill', 'powered', 'hydro']) {
    test.source(source).fire('click');
    for (const tab of ['overview', 'infrastructure', 'capital', 'contacts']) {
      test.tab(tab).fire('click');
      assertTabState(test, tab);
      assert.equal(test.panel.querySelectorAll('.research-row').length, 4);
      assert.equal(test.document.getElementById('research-source-label').textContent, 'Illustrative example');
      assert.doesNotMatch(test.panel.textContent, /\$|\b(?:MW|kWh)\b|@/);
      assert.equal(test.panel.querySelectorAll('a').length, 0, 'Example contact roles must not become invented contact links.');
      if (tab === 'capital') assert.match(test.panel.textContent, /Unpriced — requires diligence/);
      if (tab === 'overview') overviews.add(test.panel.textContent);
      if (tab === 'contacts') contactRoles.add(test.panel.querySelector('.research-row-label').textContent);
    }
  }
  assert.equal(overviews.size, 3);
  assert.equal(contactRoles.size, 3);
});

check('arrow keys wrap and Home/End move both focus and selected content', () => {
  const test = fixture();
  let current = 'overview';
  for (const [key, expected] of [
    ['ArrowRight', 'infrastructure'], ['End', 'contacts'], ['ArrowRight', 'overview'],
    ['ArrowLeft', 'contacts'], ['Home', 'overview']
  ]) {
    const event = test.tab(current).fire('keydown', {key});
    assert.equal(event.defaultPrevented, true);
    assertTabState(test, expected);
    assert.equal(test.document.activeElement, test.tab(expected));
    current = expected;
  }
  const before = test.panel.textContent;
  assert.equal(test.tab(current).fire('keydown', {key: 'Tab'}).defaultPrevented, undefined);
  assert.equal(test.panel.textContent, before);
  assert.deepEqual(test.events, [], 'Navigating research tabs must not change the globe source.');
});

check('reinitialization cannot duplicate source-change listeners', () => {
  const test = fixture();
  test.run();
  test.source('hydro').fire('click');
  assert.deepEqual(test.events, ['hydro']);
  assertTabState(test, 'overview');
  assert.match(test.panel.textContent, /seasonality, water rights and offtake terms/);
});

check('pages without the preview or with incomplete markup fail quietly', () => {
  assert.doesNotThrow(() => fixture({markup: '<main>Another page</main>'}));
  assert.doesNotThrow(() => fixture({markup: '<section id="home-research-preview"></section>'}));
});

console.log('\n' + passed + ' homepage research preview checks passed.');
