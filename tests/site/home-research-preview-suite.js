/* Exercise the actual homepage preview without starting a browser or WebGL. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Element, parse} = require('./helpers/terrain-dom.js');
const html = fs.readFileSync(__dirname + '/../../site/index.html', 'utf8');
const script = new vm.Script(fs.readFileSync(__dirname + '/../../site/home-research-preview.js', 'utf8'));
const sources = ['landfill', 'flare', 'hydro', 'nuclear', 'wind', 'solar', 'industrial', 'grid'];
const sourceTitles = {
  landfill: 'Landfill gas', flare: 'Flare gas', hydro: 'Operating hydro', nuclear: 'Nuclear power',
  wind: 'Wind power', solar: 'Solar power', industrial: 'Industrial surplus', grid: 'Grid supply'
};
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

function fixture({loading = false, compact = false, markup = html} = {}) {
  const document = parse(markup), events = [], eventViews = [];
  const timers = new Map(); let timerID = 0;
  const windows = new Element('window'), hover = new Element('media'), mobile = new Element('media');
  hover.matches = true;
  mobile.matches = compact;
  document.readyState = loading ? 'loading' : 'complete';
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('#fragment');
  document.addEventListener('proton:discovery-source', event => {
    events.push(event.detail.source);
    eventViews.push({
      source: document.getElementById('home-research-preview').dataset.researchActiveSource,
      title: document.getElementById('research-site-title').textContent,
      selected: document.querySelector('[data-research-source="' + event.detail.source + '"]').getAttribute('aria-pressed')
    });
  });
  const sandbox = vm.createContext({document, window:windows, matchMedia:query => query === '(max-width: 900px)' ? mobile : hover,
    setTimeout: handler => { timers.set(++timerID, handler); return timerID; },
    clearTimeout: id => timers.delete(id), CustomEvent: class {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }});
  const run = () => script.runInContext(sandbox);
  run();
  return {
    document, events, eventViews, run, mobile,
    flushHover: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(handler => handler()); },
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
  const choices = root.querySelectorAll('[data-research-source]');
  assert.deepEqual(choices.map(button => button.dataset.researchSource), sources);
  assert.equal(document.querySelectorAll('[data-energy-site-select]').length, sources.length,
    'One set of source controls should serve both research and globe selection.');
  for (const button of choices) {
    assert.equal(button.tagName, 'button');
    assert.equal(button.dataset.energySiteSelect, button.dataset.researchSource);
  }
});

check('native research disclosure keeps its tabs together and leaves both service links available', () => {
  const document = parse(html), root = document.querySelector('#home-research-preview');
  const details = root.querySelector('.research-details');
  assert.equal(details.tagName, 'details');
  assert.equal(details.children[0].tagName, 'summary');
  assert.match(details.children[0].textContent.replace(/&amp;/g, '&'), /Infrastructure, capital & contacts/);
  assert.equal(details.getAttribute('open'), null);
  assert.ok(details.contains(root.querySelector('[role="tablist"]')));
  assert.ok(details.contains(root.querySelector('#research-content')));
  assert.equal(details.contains(root.querySelector('.research-cta')), false);
  assert.equal(details.contains(root.querySelector('.research-workspace-link')), false);
});

check('compact layouts expose research immediately without a source-change event', () => {
  const test = fixture({compact: true});
  assert.ok(test.root.querySelector('.research-details').hasAttribute('open'));
  assert.deepEqual(test.events, []);
  const desktop = fixture();
  assert.equal(desktop.root.querySelector('.research-details').hasAttribute('open'), false);
  desktop.mobile.matches = true;
  desktop.mobile.fire('change');
  assert.ok(desktop.root.querySelector('.research-details').hasAttribute('open'));
  assert.deepEqual(desktop.events, []);
});

check('deferred initialization preserves the fallback until DOM readiness', () => {
  const test = fixture({loading: true});
  assert.equal(test.root.dataset.researchReady, undefined);
  assert.equal(test.panel.querySelectorAll('.research-row').length, 4);
  test.document.fire('DOMContentLoaded');
  assert.equal(test.root.dataset.researchReady, 'true');
  assert.equal(test.document.querySelectorAll('[data-research-source]').length, sources.length,
    'Only source controls may carry data-research-source.');
  assert.equal(test.document.querySelectorAll('[data-research-tab]').length, 4,
    'Only tab controls may carry data-research-tab.');
  assertTabState(test, 'overview');
  assert.deepEqual(test.events, [], 'Initialization must not act like a user source change.');
});

check('source symbols have a decorative landfill fallback and stay aligned with the research', () => {
  const authored = parse(html).querySelectorAll('[data-research-symbol]');
  assert.deepEqual(authored.map(symbol => symbol.getAttribute('data-research-symbol')), sources);
  assert.deepEqual(authored.filter(symbol => !symbol.hasAttribute('hidden')).map(symbol => symbol.getAttribute('data-research-symbol')), ['landfill']);
  for (const symbol of authored) {
    assert.equal(symbol.tagName, 'svg');
    assert.equal(symbol.getAttribute('aria-hidden'), 'true');
    assert.equal(symbol.getAttribute('focusable'), 'false');
  }
  const test = fixture();
  test.tab('contacts').fire('click');
  for (const source of sources) {
    test.source(source).fire('click');
    const visible = test.root.querySelectorAll('[data-research-symbol]').filter(symbol => !symbol.hasAttribute('hidden'));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].dataset.researchSymbol, source);
    assert.equal(test.document.getElementById('research-site-title').textContent, sourceTitles[source]);
    assertTabState(test, 'contacts');
  }
});

check('hover and keyboard focus synchronize the symbol before showing that source research', () => {
  const test = fixture();
  const visibleSymbol = () => test.root.querySelectorAll('[data-research-symbol]').find(symbol => !symbol.hasAttribute('hidden')).dataset.researchSymbol;
  test.source('nuclear').fire('pointerover', {pointerType:'mouse'});
  assert.equal(visibleSymbol(), 'landfill', 'Hover intent must not update only the symbol early.');
  test.flushHover();
  assert.equal(visibleSymbol(), 'nuclear');
  assert.equal(test.document.getElementById('research-site-title').textContent, 'Nuclear power');
  assert.ok(test.root.querySelector('.research-details').hasAttribute('open'));
  test.source('hydro').focus();
  assert.equal(visibleSymbol(), 'hydro');
  assert.equal(test.document.getElementById('research-site-title').textContent, 'Operating hydro');
  assert.deepEqual(test.events, ['nuclear', 'hydro']);
});

check('even the initial selected source updates its research on every click', () => {
  const test = fixture(), initialContent = test.panel.textContent;
  test.source('landfill').fire('click');
  test.source('landfill').fire('click');
  assert.deepEqual(test.events, ['landfill', 'landfill']);
  assert.equal(test.panel.textContent, initialContent, 'Reselecting a source must preserve its current research.');
  assertTabState(test, 'overview');
});

check('changing the source retains the tab and updates research before the globe event', () => {
  const test = fixture();
  test.tab('capital').fire('click');
  const landfillCapital = test.panel.textContent;
  test.source('industrial').fire('click');
  assertTabState(test, 'capital');
  assert.equal(test.document.getElementById('research-site-title').textContent, 'Industrial surplus');
  assert.notEqual(test.panel.textContent, landfillCapital);
  assert.match(test.panel.textContent, /Unpriced — requires diligence/);
  assert.match(test.panel.textContent, /spare capacity/);
  assert.deepEqual(test.events, ['industrial']);
  assert.deepEqual(test.eventViews, [{source: 'industrial', title: 'Industrial surplus', selected: 'true'}]);
  test.source('industrial').fire('click');
  assert.deepEqual(test.events, ['industrial', 'industrial'], 'Each explicit choice must be able to select its research again.');
  assert.equal(test.root.querySelectorAll('[data-research-source]').filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
  assert.equal(test.source('industrial').getAttribute('aria-pressed'), 'true');
});

check('all research routes keep their own content and illustrative boundaries', () => {
  const test = fixture();
  const views = Object.fromEntries(['overview', 'infrastructure', 'capital', 'contacts'].map(name => [name, new Set()]));
  const energyQuestions = {
    landfill: /gas rights/, flare: /flow variability/, hydro: /water rights/, nuclear: /outage plans/,
    wind: /wind profile/, solar: /generation timing/, industrial: /surplus timing/, grid: /curtailment conditions/
  };
  for (const source of sources) {
    test.source(source).fire('click');
    assert.equal(test.document.getElementById('research-site-title').textContent, sourceTitles[source]);
    for (const tab of ['overview', 'infrastructure', 'capital', 'contacts']) {
      test.tab(tab).fire('click');
      assertTabState(test, tab);
      assert.equal(test.panel.querySelectorAll('.research-row').length, 4);
      assert.equal(test.document.getElementById('research-source-label').textContent, 'Illustrative example');
      assert.doesNotMatch(test.panel.textContent, /\$|\b(?:MW|kWh)\b|@/);
      assert.equal(test.panel.querySelectorAll('a').length, 0, 'Example contact roles must not become invented contact links.');
      if (tab === 'capital') assert.match(test.panel.textContent, /Unpriced — requires diligence/);
      if (tab === 'overview') assert.match(test.panel.textContent, energyQuestions[source]);
      views[tab].add(test.panel.textContent);
    }
  }
  for (const [tab, content] of Object.entries(views)) {
    assert.equal(content.size, sources.length, 'Every source needs its own ' + tab + ' research.');
  }
  assert.deepEqual(test.events, sources, 'All eight selections, including initial landfill, reach the facility controller.');
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

check('modified navigation keys preserve browser shortcuts and the selected tab', () => {
  const test = fixture();
  test.tab('capital').fire('click');
  test.tab('capital').focus();
  const content = test.panel.textContent;
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    for (const key of ['Home', 'End', 'ArrowLeft', 'ArrowRight']) {
      const event = test.tab('capital').fire('keydown', {key, [modifier]:true});
      assert.equal(event.defaultPrevented, undefined, modifier + '+' + key + ' must reach the browser.');
      assertTabState(test, 'capital');
      assert.equal(test.document.activeElement, test.tab('capital'));
      assert.equal(test.panel.textContent, content);
    }
  }
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
