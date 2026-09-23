/* The actual hero-video controller, with playback and lifecycle events observed. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Element, parse} = require('./helpers/terrain-dom.js');
const site = path.resolve(__dirname, '../../site');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const script = new vm.Script(fs.readFileSync(path.join(site, 'home-hero-video.js'), 'utf8'));
const settle = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
async function check(name, run) { await run(); passed++; console.log('  ok    ' + name); }

function fixture({reduced = false, hidden = false, noObserver = false, rejectedPlay = false, markup = html} = {}) {
  const document = parse(markup), media = new Element('media'), windows = new Element('window');
  const video = document.querySelector('.home-hero-video'), observers = [], plays = [];
  document.hidden = hidden; media.matches = reduced;
  if (video) {
    video.paused = true;
    video.play = () => {
      plays.push({muted:video.muted});
      if (rejectedPlay) return Promise.reject(new Error('Browser blocked playback'));
      video.paused = false; return Promise.resolve();
    };
    video.pause = () => { video.paused = true; };
  }
  const sandbox = {
    document, matchMedia: () => media,
    addEventListener: (...args) => windows.addEventListener(...args),
    removeEventListener: (...args) => windows.removeEventListener(...args),
    IntersectionObserver: noObserver ? undefined : class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    }
  };
  sandbox.window = sandbox; vm.createContext(sandbox); script.runInContext(sandbox);
  return {
    document, video, media, windows, observers, plays,
    visible(value) { observers.forEach(observer => observer.callback([{isIntersecting:value}])); },
    hidden(value) { document.hidden = value; document.fire('visibilitychange'); },
    motion(value) { media.matches = value; media.fire('change'); },
    page(type, persisted) { windows.fire(type, {persisted}); }
  };
}

(async () => {
  await check('authored footage is decorative and has a local poster before playback', () => {
    const document = parse(html), video = document.querySelector('.home-hero-video');
    assert.ok(video);
    assert.equal(video.getAttribute('aria-hidden'), 'true');
    assert.equal(video.getAttribute('tabindex'), '-1');
    assert.equal(video.getAttribute('autoplay'), null, 'Declarative autoplay would bypass reduced-motion initialization.');
    assert.notEqual(video.getAttribute('muted'), null);
    assert.notEqual(video.getAttribute('playsinline'), null);
    assert.equal(video.getAttribute('controls'), null);
    const source = video.querySelector('source').getAttribute('src');
    const poster = video.getAttribute('poster');
    assert.match(source, /^\.\/assets\/video\/[^/]+\.mp4$/);
    assert.match(poster, /^\.\/assets\/video\/[^/]+\.webp$/);
    for (const asset of [source, poster]) assert.ok(fs.statSync(path.resolve(site, asset)).size > 0);
    assert.match(html, /<script src="\.\/home-hero-video\.js(?:\?v=[a-f0-9]+)?" defer><\/script>/);
  });

  await check('initial reduced motion preserves the poster and a preference change enables muted playback', () => {
    const test = fixture({reduced:true});
    test.visible(true);
    assert.equal(test.plays.length, 0); assert.equal(test.video.paused, true);
    test.motion(false);
    assert.equal(test.plays.length, 1); assert.equal(test.plays[0].muted, true);
    assert.equal(test.video.paused, false);
    test.motion(true);
    assert.equal(test.video.paused, true); assert.equal(test.plays.length, 1);
  });

  await check('offscreen and hidden pages pause footage and resume only while both are visible', () => {
    const test = fixture();
    assert.equal(test.plays.length, 0, 'Playback must wait for an intersection result.');
    assert.equal(test.observers[0].target, test.video);
    test.visible(true); assert.equal(test.video.paused, false);
    test.visible(false); assert.equal(test.video.paused, true);
    test.hidden(true); test.visible(true); assert.equal(test.video.paused, true);
    test.hidden(false); assert.equal(test.video.paused, false);
    assert.ok(test.plays.every(call => call.muted), 'Every playback request must be muted.');
  });

  await check('cached navigation pauses and restores playback while final navigation removes listeners', () => {
    const test = fixture(); test.visible(true);
    test.page('pagehide', true); assert.equal(test.video.paused, true);
    test.visible(true); assert.equal(test.video.paused, true, 'An observer callback cannot restart a suspended page.');
    test.page('pageshow', true); assert.equal(test.video.paused, false);
    test.page('pagehide', false); assert.equal(test.video.paused, true);
    assert.equal(test.observers[0].disconnected, true);
    for (const [target, event] of [[test.media,'change'],[test.document,'visibilitychange'],[test.windows,'pagehide'],[test.windows,'pageshow']]) {
      assert.equal((target.listeners[event] || []).length, 0);
    }
    const plays = test.plays.length;
    test.page('pageshow', false); test.motion(false); test.hidden(false); test.visible(true);
    assert.equal(test.plays.length, plays, 'Late events must not revive a disposed video controller.');
  });

  await check('missing IntersectionObserver still respects reduced motion and initial page visibility', () => {
    for (const options of [{reduced:true}, {hidden:true}]) {
      const test = fixture({...options, noObserver:true});
      assert.equal(test.plays.length, 0); assert.equal(test.video.paused, true);
    }
    const test = fixture({noObserver:true});
    assert.equal(test.plays.length, 1); assert.equal(test.video.paused, false);
  });

  await check('blocked playback is handled and pages without a video remain unchanged', async () => {
    const test = fixture({rejectedPlay:true}); test.visible(true); await settle();
    assert.equal(test.video.paused, true);
    assert.ok(test.video.getAttribute('poster'));
    test.visible(false); assert.equal(test.video.paused, true);
    const absent = fixture({markup:'<main>Another page</main>'});
    assert.equal(absent.video, null); assert.equal(absent.observers.length, 0);
    assert.equal(Object.keys(absent.windows.listeners).length, 0);
  });

  console.log('\n' + passed + ' hero video checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
