/* Exercise the real projection and event handlers with a controllable clock.
   This is a DOM simulation, not a substitute for browser/device visual review. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.resolve(__dirname, '../../site');
const scenes = [
    ['site', 'SiteDiagram', 'site'], ['hosting', 'ContainerDiagram', 'hosting'],
    ['asic', 'AsicDiagram', 'asic'], ['pad-now', 'PadNowDiagram', 'padnow'],
    ['pad-ion', 'PadIonDiagram', 'padion'], ['landfill-now', 'LandfillNowDiagram', 'landfillnow'],
    ['landfill-ion', 'LandfillIonDiagram', 'landfillion']
];
const plain = value => JSON.parse(JSON.stringify(value));
let fits = 0;
for (const [file] of scenes) {
    const d = require(path.join(site, 'scene-' + file + '.js'));
    const overview = d.frame(0, null);
    for (const box of [{ left: 270, right: 1010, top: 32, bottom: 428 },
                       { left: 333, right: 947, top: 92, bottom: 428 }]) {
        for (const yaw of [0, 0.7, 2.8]) for (const c of d.CALLOUTS) {
            d.resetView();
            const original = d.getView(), to = d.focusView(c.id, yaw, box);
            assert.deepEqual(d.getView(), original, 'Fitting must not alter the live view');
            assert.ok(to && to.zoom >= d.ZOOM_MIN && to.zoom <= d.ZOOM_MAX);
            d.setView(to);
            for (const b of d.focusBoxes(c.id)) for (const p of d.boxCorners(b)) {
                const q = d.project(p, yaw);
                assert.ok(q.every(Number.isFinite));
                assert.ok(q[0] >= box.left - 0.01 && q[0] <= box.right + 0.01 &&
                          q[1] >= box.top - 0.01 && q[1] <= box.bottom + 0.01,
                          file + '/' + c.id + ' must fit the available crop');
            }
            for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                const v = d.interpolateView(original, to, t);
                assert.ok(v.zoom >= Math.min(original.zoom, to.zoom) - 1e-9 &&
                          v.zoom <= Math.max(original.zoom, to.zoom) + 1e-9, 'No zoom overshoot');
                assert.ok(v.target.every(Number.isFinite));
            }
            d.setView({ zoom: 1.5, pitch: 0.6 });
            const centre = d.project(to.target, yaw + 0.4);
            assert.ok(centre.every((v, i) => Math.abs(v - to.screen[i]) < 1e-6), 'Manual orbit and zoom keep the inspected target centred');
            fits++;
        }
    }
    d.resetView();
    assert.deepEqual(d.frame(0, null), overview, 'Reset must restore the original overview exactly');
    assert.equal(d.focusView('not-a-region', 0), null);
}
console.log('  ok    ' + fits + ' target/crop/angle combinations fit and preserve overview geometry');

function harness(configs, options = {}) {
    let now = 0, sequence = 0, writes = 0;
    const raf = new Map(), timers = new Map(), nodes = new Map(), wrappers = new Map(), queries = new Map();
    const observers = [], scrolls = [], windowEvents = new Map();
    const make = id => {
        const attrs = {}, classes = new Set(), events = new Map();
        return { id, tagName: options.legacy ? 'DIV' : 'BUTTON', events,
            setAttribute(k, v) { assert.ok(!/NaN|Infinity|undefined/.test(String(v)), id + ': finite attributes'); attrs[k] = String(v); writes++; },
            getAttribute: k => attrs[k] ?? null,
            classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
            addEventListener(event, fn) { if (!events.has(event)) events.set(event, []); events.get(event).push(fn); },
            contains(n) { return n === this; }, closest: () => null,
            getBoundingClientRect: () => ({ left: 0, right: 1280, top: options.mobile ? -600 : 100, bottom: options.mobile ? -130 : 570, width: 1280, height: 470 }),
            setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false
        };
    };
    const get = id => { if (!nodes.has(id)) nodes.set(id, make(id)); return nodes.get(id); };
    configs.forEach((config, i) => {
        const w = get('wrap-' + config[2]), prefix = 't' + i + '-';
        w.setAttribute('data-prefix', prefix);
        if (configs.length > 1) w.setAttribute('data-link', 'test-pair');
        w.querySelector = selector => {
            const match = /data-region="([a-z]+)"/.exec(selector);
            return match ? get(prefix + 'b-' + match[1]) : null;
        };
        wrappers.set(config[2], { wrap: w, prefix });
    });
    const doc = make('document');
    Object.assign(doc, { hidden: false, readyState: 'loading', getElementById: get,
        querySelector(selector) { const match = /data-scene="([a-z]+)"/.exec(selector); return match ? wrappers.get(match[1]).wrap : null; }
    });
    const win = { innerHeight: 844, scrollY: 900,
        scrollTo: o => scrolls.push(o),
        addEventListener(event, fn) { windowEvents.set(event, fn); },
        matchMedia(query) {
            if (!queries.has(query)) queries.set(query, { matches: query.includes('reduced') ? !!options.reduced : !!options.mobile,
                addEventListener(event, fn) { this.change = fn; } });
            return queries.get(query);
        },
        IntersectionObserver: function (fn) { this.observe = el => observers.push({ fn, el }); }
    };
    const context = vm.createContext({ console, document: doc, window: win, IntersectionObserver: win.IntersectionObserver,
        requestAnimationFrame(fn) { raf.set(++sequence, fn); return sequence; },
        cancelAnimationFrame(id) { raf.delete(id); },
        setTimeout(fn, ms) { timers.set(++sequence, { fn, due: now + ms }); return sequence; },
        clearTimeout(id) { timers.delete(id); }
    });
    context.self = context;
    for (const file of ['diagram-engine', 'site-kit', 'pad-geometry', 'landfill-geometry'].concat(configs.map(c => 'scene-' + c[0]))) {
        vm.runInContext(fs.readFileSync(path.join(site, file + '.js'), 'utf8'), context, { filename: file + '.js' });
    }
    const views = configs.map(config => {
        const { wrap, prefix } = wrappers.get(config[2]), d = context[config[1]];
        d.mount({ scene: config[2] });
        return { d, wrap, svg: get(prefix + 'siteDiagram'), button: id => get(prefix + 'b-' + id),
            reset: get(prefix + 'dg-reset'), prefix };
    });
    const emit = (node, event, values = {}) => (node.events.get(event) || []).forEach(fn => fn(Object.assign({ target: node, preventDefault() {} }, values)));
    function advance(ms) {
        now += ms;
        for (const [id, timer] of Array.from(timers)) if (timer.due <= now) { timers.delete(id); timer.fn(); }
        const callbacks = Array.from(raf.values()); raf.clear(); callbacks.forEach(fn => fn(now));
    }
    return { views, emit, advance, doc, queries, observers, scrolls, timers, windowEvents, writes: () => writes,
        finish() { advance(16); advance(300); advance(300); } };
}

let activated = 0;
for (const config of scenes) {
    const h = harness([config]), v = h.views[0];
    for (const callout of v.d.CALLOUTS) {
        h.emit(v.reset, 'click');
        const target = plain(v.d.focusView(callout.id, 0));
        h.emit(v.button(callout.id), 'click'); h.advance(16);
        h.advance(300);
        const middle = v.d.getView();
        assert.ok(middle.target && middle.target.some((n, i) => Math.abs(n - target.target[i]) > 1e-8), 'The camera must animate rather than jump');
        h.advance(300);
        assert.deepEqual(plain(v.d.getView()), target);
        h.emit(v.button(callout.id), 'blur'); h.emit(v.button(callout.id), 'pointerleave', { pointerType: 'mouse' });
        assert.equal(v.button(callout.id).getAttribute('aria-pressed'), 'true');
        assert.ok(v.button(callout.id).classList.contains('is-hot'));
        const atRest = h.writes(); h.advance(11000);
        assert.equal(h.writes(), atRest, 'Selected scenes must remain still instead of resuming idle work');
        h.emit(v.button(callout.id), 'click'); h.finish();
        assert.deepEqual(plain(v.d.getView()), target, 'Repeated activation must not compound zoom');
        activated++;
    }
    const a = v.d.CALLOUTS[0].id, b = v.d.CALLOUTS[1].id;
    h.emit(v.reset, 'click'); h.emit(v.button(a), 'click'); h.advance(16); h.advance(180);
    h.emit(v.wrap, 'wheel', { deltaY: -100 });
    const manual = plain(v.d.getView()); h.advance(1500);
    assert.deepEqual(plain(v.d.getView()), manual, 'Manual zoom cancels the tween without snapping back');
    h.emit(v.button(a), 'click'); h.advance(16); h.advance(160); h.emit(v.button(b), 'click'); h.finish();
    assert.deepEqual(plain(v.d.getView()), plain(v.d.focusView(b, 0)), 'A newer activation supersedes the old destination');
    h.emit(v.reset, 'click'); h.emit(v.button(a), 'click'); h.advance(16); h.advance(100); h.emit(v.reset, 'click');
    assert.equal(v.d.getView().target, null); assert.equal(v.d.getView().zoom, 1);
    assert.equal(h.timers.size, 0, 'Reset clears pending resume timers');
    h.advance(1200); assert.equal(v.d.getView().target, null, 'Cancelled animations cannot revive after reset');
}
console.log('  ok    all ' + activated + ' activations animate, hold, reset and survive interruption');

for (const config of scenes) {
    const h = harness([config], { mobile: true, reduced: true, legacy: true }), v = h.views[0], id = v.d.CALLOUTS[0].id;
    h.emit(v.button(id), 'keydown', { key: 'Enter' });
    assert.ok(v.d.getView().target, 'Reduced motion immediately applies the close-up');
    assert.equal(h.scrolls.length, 1, 'An offscreen phone drawing comes into view');
    assert.equal(h.scrolls[0].behavior, 'instant');
    const end = plain(v.d.getView()); h.advance(700); assert.deepEqual(plain(v.d.getView()), end);
    h.emit(v.wrap, 'keydown', { key: 'Escape' }); assert.equal(v.d.getView().target, null);
    h.emit(v.button(id), 'keydown', { key: ' ' }); assert.ok(v.d.getView().target, 'Legacy markup also supports Space');
}
console.log('  ok    reduced motion, phone reveal, Escape and cached keyboard controls');

for (const config of scenes) {
    const h = harness([config]), v = h.views[0], id = v.d.CALLOUTS[0].id;
    const begin = () => { h.emit(v.reset, 'click'); h.emit(v.button(id), 'click'); h.advance(16); h.advance(180); };
    begin();
    h.emit(v.wrap, 'pointerdown', { target: v.svg, pointerType: 'mouse', pointerId: 1, button: 0, clientX: 640, clientY: 220 });
    h.emit(v.wrap, 'pointermove', { target: v.svg, pointerId: 1, clientX: 680, clientY: 240 });
    h.emit(v.wrap, 'pointerup', { target: v.svg, pointerId: 1 });
    const dragged = plain(v.d.getView()); h.advance(1200);
    assert.deepEqual(plain(v.d.getView()), dragged, 'Dragging takes over from the animation');
    assert.ok(v.button(id).classList.contains('is-hot'));

    begin();
    const destination = plain(v.d.focusView(id, 0));
    h.doc.hidden = true; h.emit(h.doc, 'visibilitychange');
    assert.deepEqual(plain(v.d.getView()), destination, 'A hidden tab settles the camera without a background tween');
    h.advance(1000);
    const hiddenWrites = h.writes(); h.advance(1000);
    assert.equal(h.writes(), hiddenWrites);
    h.doc.hidden = false; h.emit(h.doc, 'visibilitychange'); h.advance(16);
    assert.deepEqual(plain(v.d.getView()), destination);

    begin(); h.observers[0].fn([{ isIntersecting: false }]);
    assert.deepEqual(plain(v.d.getView()), destination, 'An offscreen drawing settles instead of leaving a partial close-up');
    h.advance(1000);
    const offscreenWrites = h.writes(); h.advance(1000);
    assert.equal(h.writes(), offscreenWrites);
    h.observers[0].fn([{ isIntersecting: true }]); h.advance(16);
    assert.deepEqual(plain(v.d.getView()), destination);

    begin();
    const preference = h.queries.get('(prefers-reduced-motion: reduce)');
    preference.matches = true; preference.change(); h.advance(16);
    assert.deepEqual(plain(v.d.getView()), destination, 'Enabling reduced motion cancels the remaining animation');

    const mobile = h.queries.get('(max-width: 900px), (pointer: coarse)');
    mobile.matches = true; mobile.change();
    v.svg.getBoundingClientRect = () => ({ left: -199, right: 591, top: 88, bottom: 378, width: 790, height: 290 });
    v.wrap.getBoundingClientRect = () => ({ left: 0, right: 390, width: 390 });
    h.windowEvents.get('resize')(); h.advance(16);
    const cropped = plain(v.d.focusView(id, 0, {
        left: 199 / 790 * 1280 + 20, right: 589 / 790 * 1280 - 20, top: 92, bottom: 428
    }));
    assert.deepEqual(plain(v.d.getView()), cropped, 'Resize fits the real visible phone crop');
    h.emit(v.reset, 'click'); h.windowEvents.get('resize')(); h.advance(16);
    assert.equal(v.d.getView().target, null, 'A pending resize cannot revive a reset selection');
}
console.log('  ok    drag, visibility, live motion preference and resized phone crop');

for (const pair of [[scenes[1], scenes[2]], [scenes[3], scenes[4]], [scenes[5], scenes[6]]]) {
    const h = harness(pair), [a, b] = h.views;
    h.emit(b.wrap, 'wheel', { deltaY: -100 }); // Leave a resume timer on the future peer.
    const peer = plain(b.d.getView());
    h.emit(a.button(a.d.CALLOUTS[0].id), 'click'); h.finish();
    assert.deepEqual(plain(b.d.getView()), peer, 'Close-up framing must not leak into the linked scene');
    const atRest = h.writes(); h.advance(11000); assert.equal(h.writes(), atRest, 'A peer cannot restart a selected scene');
    h.emit(b.button(b.d.CALLOUTS[0].id), 'click'); h.finish();
    assert.equal(a.d.getView().target, null); assert.ok(b.d.getView().target);
    h.emit(b.reset, 'click');
    assert.equal(a.d.getView().zoom, 1); assert.equal(b.d.getView().zoom, 1);
    assert.equal(a.d.getView().target, null); assert.equal(b.d.getView().target, null);
}
console.log('  ok    all three comparison pairs keep independent close-ups and synchronized reset');

for (const page of ['index.html', 'hosting.html', 'energy.html']) {
    const html = fs.readFileSync(path.join(site, page), 'utf8');
    const cards = html.match(/<button type="button" class="dg-callout[^>]+>/g) || [];
    assert.equal(cards.length, page === 'index.html' ? 8 : page === 'hosting.html' ? 14 : 24);
    assert.ok(cards.every(card => card.includes('aria-pressed="false"')));
}
console.log('  ok    every generated callout is a native keyboard-operable button');
