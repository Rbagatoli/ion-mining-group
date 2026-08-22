/* Runs the real calculator.js against the real calculator.html, headless.

   calc-suite.js proves the ids line up and the engine matches. Neither proves
   the page actually computes — a wrong key name in collect(), or isEnergyMode
   reading the wrong node, produces a page that boots clean and shows dashes or
   silently defaults. So this builds enough of a DOM to load the script for
   real, then drives it: switch modes, change inputs, read the rendered text.

   The DOM stub is deliberately small and dumb. It only has to support what
   calculator.js actually calls. */
var fs = require('fs'), vm = require('vm');
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
var S = __dirname + '/../../site/';
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + detail));
    if (!cond) fail++;
}

/* ---------- a very small DOM ---------- */

var VOID = { br: 1, img: 1, input: 1, meta: 1, link: 1, hr: 1, path: 1, circle: 1, stop: 1 };

function El(tag, attrs) {
    this.tagName = (tag || '').toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this.listeners = {};
    this.dataset = {};
    var self = this;
    Object.keys(this.attrs).forEach(function (k) {
        if (k.indexOf('data-') === 0) {
            var camel = k.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
            self.dataset[camel] = self.attrs[k];
        }
    });
    this.classList = {
        _set: {},
        add: function (c) { this._set[c] = true; },
        remove: function (c) { delete this._set[c]; },
        toggle: function (c, on) { if (on) this._set[c] = true; else delete this._set[c]; },
        contains: function (c) { return !!this._set[c]; },
    };
    this.style = {};
    this.value = this.attrs.value !== undefined ? this.attrs.value : '';
    this.checked = this.attrs.checked !== undefined;
    this.type = this.attrs.type || '';
    this.hidden = this.attrs.hidden !== undefined;
}
El.prototype.getAttribute = function (k) { return this.attrs[k] === undefined ? null : this.attrs[k]; };
/* A real anchor reflects .href to the attribute and back. Without this the stub
   lets a page set .href, reports the original markup value, and a test reading
   the attribute sees a link that was never updated — a gap in the harness that
   looks exactly like a bug in the page. */
Object.defineProperty(El.prototype, 'href', {
    get: function () { return this.attrs.href === undefined ? '' : this.attrs.href; },
    set: function (v) { this.attrs.href = String(v); },
});
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.appendChild = function (c) {
    if (c && c._frag) { var self = this; c.children.forEach(function (x) { self.appendChild(x); }); return c; }
    c.parentNode = this; this.children.push(c); return c;
};
El.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
El.prototype.fire = function (t, ev) {
    (this.listeners[t] || []).forEach(function (fn) { fn(ev || { target: null }); });
};
Object.defineProperty(El.prototype, 'textContent', {
    get: function () {
        if (this.children.length) return this.children.map(function (c) { return c.textContent; }).join('');
        return this._text;
    },
    set: function (v) { this._text = String(v); this.children = []; },
});
Object.defineProperty(El.prototype, 'innerHTML', {
    get: function () { return this._html || ''; },
    set: function (v) { this._html = String(v); this.children = []; },
});
El.prototype.walk = function (fn) {
    fn(this);
    this.children.forEach(function (c) { c.walk(fn); });
};
/* Only the attribute-presence and attribute-equals selectors the script uses. */
function matches(el, sel) {
    var m = sel.match(/^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/);
    if (!m) return false;
    var v = el.getAttribute(m[1]);
    if (v === null) return false;
    return m[2] === undefined ? true : v === m[2];
}
El.prototype.querySelectorAll = function (sel) {
    var out = [];
    this.children.forEach(function (c) {
        c.walk(function (n) { if (matches(n, sel)) out.push(n); });
    });
    out.forEach = Array.prototype.forEach;
    return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
El.prototype.closest = function (sel) {
    var n = this;
    while (n) { if (matches(n, sel)) return n; n = n.parentNode; }
    return null;
};

/* Tag-stack parser. The markup is hand-written and well formed. */
function parse(html) {
    var root = new El('root', {}), stack = [root], i = 0;
    var re = /<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>/g, m;
    while ((m = re.exec(html))) {
        var tag = m[1].toLowerCase();
        var closing = m[0][1] === '/';
        var selfClose = m[0].slice(-2) === '/>';
        if (closing) {
            for (var k = stack.length - 1; k > 0; k--) {
                if (stack[k].tagName === tag.toUpperCase()) { stack.length = k; break; }
            }
            continue;
        }
        var attrs = {}, ar = /([a-zA-Z-]+)(?:="([^"]*)")?/g, a;
        while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2] === undefined ? '' : a[2];
        var el = new El(tag, attrs);
        stack[stack.length - 1].appendChild(el);
        /* Text directly after the open tag, up to the next tag. */
        var nextTag = html.indexOf('<', re.lastIndex);
        var text = html.slice(re.lastIndex, nextTag < 0 ? html.length : nextTag).trim();
        if (text) el._text = text;
        if (!selfClose && !VOID[tag]) stack.push(el);
    }
    return root;
}

var root = parse(fs.readFileSync(S + 'calculator.html', 'utf8'));

/* A <select> reports the value of its selected option, or of the first one when
   none is marked. The stub parses attributes only, so without this a select
   reads as the empty string and every branch keyed on it takes the wrong path —
   which is exactly what it did on the first run. */
root.walk(function (n) {
    if (n.tagName !== 'SELECT') return;
    var opts = n.children.filter(function (c) { return c.tagName === 'OPTION'; });
    if (!opts.length) return;
    var chosen = opts.filter(function (o) { return o.getAttribute('selected') !== null; })[0] || opts[0];
    n.value = chosen.getAttribute('value');
});

var byId = {};
root.walk(function (n) { var id = n.getAttribute('id'); if (id) byId[id] = n; });

var document = {
    readyState: 'complete',
    getElementById: function (id) { return byId[id] || null; },
    querySelectorAll: function (s) { return root.querySelectorAll(s); },
    querySelector: function (s) { return root.querySelector(s); },
    createElement: function (t) { return new El(t, {}); },
    createDocumentFragment: function () { var f = new El('frag', {}); f._frag = true; return f; },
    addEventListener: function () {},
    body: root,
};

/* ---------- load and drive ---------- */

/* Canned market responses, in the exact shapes the two real endpoints return —
   Coinbase wraps its price in data.amount as a string, blockchain.info answers
   with a bare number in absolute terms. Getting either shape wrong here would
   make the test agree with a parser that cannot read the real thing. */
var fetched = [];
function fakeFetch(url) {
    fetched.push(url);
    var body = url.indexOf('coinbase') >= 0
        ? '{"data":{"amount":"81000.55","base":"BTC","currency":"USD"}}'
        : '1.3500000000000E14';
    return Promise.resolve({ ok: true, text: function () { return Promise.resolve(body); } });
}

/* Enough of location and history for the scenario URL to round-trip. The
   harness can be re-run with a query string by setting START_QUERY, which is
   how the shared-link test reloads a scenario. */
var START_QUERY = process.env.CALC_QUERY || '';
var fakeLocation = {
    href: 'http://localhost:8080/calculator.html' + (START_QUERY ? '?' + START_QUERY : ''),
    pathname: '/calculator.html',
    search: START_QUERY ? '?' + START_QUERY : '',
};
var replaced = [];
var fakeHistory = {
    replaceState: function (a, b, url) { replaced.push(url); },
};

var sandbox = {
    document: document, console: console, window: {}, fetch: fakeFetch,
    location: fakeLocation, history: fakeHistory,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    navigator: { clipboard: null },
};
sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['miner-db.js', 'calc-engine.js', 'calculator.js'].forEach(function (f) {
    try { vm.runInContext(fs.readFileSync(S + f, 'utf8'), sandbox, { filename: f }); }
    catch (e) { ok(false, 'loads ' + f, e.message); }
});
ok(typeof sandbox.CalcEngine === 'object', 'CalcEngine is defined', 'engine did not register');
ok(typeof sandbox.MinerDB === 'object', 'MinerDB is defined', 'miner db did not register');

function txt(id) { return byId[id] ? byId[id].textContent : '(no element)'; }
function set(id, v) { byId[id].value = String(v); byId[id].fire('input'); }

/* --- machines mode, out of the box --- */
ok(byId.minerModel.children.length >= 20, 'the model picker was populated',
   byId.minerModel.children.length + ' options');
/* Derived from whichever model the page defaults to, so changing that default
   does not silently invalidate every number below. */
var DEF = sandbox.MinerDB.findByModel(/var DEFAULT_MODEL = '([^']+)'/
    .exec(fs.readFileSync(S + 'calculator.js', 'utf8'))[1]);
ok(!!DEF, 'the default model resolves in the database', 'not found');
ok(Number(byId.hashrate.value) === DEF.hashrate, 'default model filled the specs',
   'hashrate ' + byId.hashrate.value + ' vs ' + DEF.hashrate);

var profit = txt('outDailyProfit');
ok(/^-?\$[\d,]/.test(profit), 'daily profit rendered a real number', 'got "' + profit + '"');
ok(txt('outMachines') === '100', 'machine count reached the engine', 'got "' + txt('outMachines') + '"');
ok(/TH\/s$/.test(txt('outFleetHash')), 'fleet hashrate rendered', 'got "' + txt('outFleetHash') + '"');
var expectHash = (100 * DEF.hashrate).toLocaleString('en-US');
ok(txt('outFleetHash').indexOf(expectHash) === 0, 'fleet hashrate is 100 x the model',
   'got "' + txt('outFleetHash') + '", wanted ' + expectHash);
ok(byId.calcChart.innerHTML.indexOf('<path') >= 0, 'the chart drew paths', 'chart is empty');
ok(byId.calcTableBody.innerHTML.indexOf('<tr') >= 0, 'the table drew rows', 'table is empty');

/* --- inputs actually move the answer --- */
var before = txt('outDailyProfit');
set('elecCost', 0.20);
var after = txt('outDailyProfit');
ok(before !== after, 'raising power cost changed the result', 'stuck at ' + before);
ok(parseFloat(after.replace(/[^0-9.-]/g, '')) < parseFloat(before.replace(/[^0-9.-]/g, '')) ||
   after.indexOf('-') === 0,
   'raising power cost lowered profit', before + ' -> ' + after);
set('elecCost', 0.045);

/* --- energy mode --- */
byId.mode.fire('click', { target: byId.mode.querySelector('[data-mode="energy"]') });
ok(byId.mode.querySelector('[aria-pressed="true"]').dataset.mode === 'energy',
   'the mode switch flipped to energy', 'still on machines');
ok(byId.energyDerived.hidden === false, 'the derivation panel appeared', 'still hidden');
/* 900 Mcf/d at 1,000 BTU/cf and 10,000 BTU/kWh = 3,750 kW */
ok(txt('edKw') === '3,750 kW', 'gas converted to the right power', 'got "' + txt('edKw') + '"');
ok(txt('edMw') === '3.75 MW', 'and the MW readout agrees', 'got "' + txt('edMw') + '"');
var expectFleet = Math.floor(3750 / DEF.power).toLocaleString('en-US');
ok(txt('edMachines') === expectFleet, 'power sized the fleet',
   'got "' + txt('edMachines') + '", wanted ' + expectFleet);
ok(txt('outMachines') === expectFleet, 'the derived fleet reached the engine',
   'engine saw "' + txt('outMachines') + '"');

/* Not enough gas for one machine has to say so, not project a phantom fleet.
   The threshold depends on the machine, so it is computed: at 100 kWh per Mcf,
   one machine needs power * 24 / 100 Mcf per day. */
var tooLittle = Math.max(0.01, (DEF.power * 24 / 100) * 0.5);
set('energyValue', tooLittle);
ok(txt('outMachines') === '0', 'a tiny volume yields no machines', 'got "' + txt('outMachines') + '"');
ok(byId.calcWarn.hidden === false, 'and the page warns about it', 'no warning shown');
set('energyValue', 900);
ok(byId.calcWarn.hidden === true, 'the warning clears again', 'warning stuck on');

/* --- the ROI tile names its own window ---
   A percentage with no period attached is not a claim anyone can check: the
   same number over 60 months and over 6 is two different businesses. */
ok(txt('outRoiSub') === 'over ' + byId.investPeriod.value + ' months',
   'the ROI tile states the horizon it was earned over',
   'reads "' + txt('outRoiSub') + '"');
set('investPeriod', 12);
ok(txt('outRoiSub') === 'over 12 months', 'and follows the horizon when it changes',
   'reads "' + txt('outRoiSub') + '"');
/* And the unit, not just the count. */
byId.periodLength.value = 'weekly';
byId.periodLength.fire('change');
ok(txt('outRoiSub') === 'over 12 weeks', 'and follows the period unit too',
   'reads "' + txt('outRoiSub') + '"');
byId.periodLength.value = 'monthly';
byId.periodLength.fire('change');
set('investPeriod', 60);

/* --- the chart carries what the desk tool's chart carries --- */
var svgOut = byId.calcChart.innerHTML;
ok(svgOut.indexOf('url(#ckBarMined)') >= 0, 'cumulative BTC mined drawn as bars', 'no mined bars');
ok(svgOut.indexOf('url(#ckBarHeld)') >= 0, 'cumulative BTC held drawn as bars', 'no held bars');
ok(svgOut.indexOf('ck-value') >= 0, 'the mining value curve is drawn', 'missing');
ok(svgOut.indexOf('ck-bench') >= 0, 'the buy-and-hold curve is drawn', 'missing');
ok(svgOut.indexOf('ck-ylab--r') >= 0, 'the right-hand money axis is labelled', 'only one axis');
ok(svgOut.indexOf('ck-hit') >= 0, 'hover columns were emitted', 'nothing to hover');
/* One hit column per period, or some periods are unreadable. Read from the
   page's own default horizon rather than a literal, which went stale the moment
   that default changed. */
var horizon = Number(byId.investPeriod.value);
ok(svgOut.split('ck-hit').length - 1 === horizon, 'one hover column per period',
   (svgOut.split('ck-hit').length - 1) + ' for ' + horizon + ' periods');
/* Nothing may measure the page to do any of this. */
ok(sandbox.__measured === undefined, 'the chart measured nothing', 'a layout read happened');

/* Halvings show exactly when the horizon reaches one — so the boundary is
   computed from the next halving rather than hardcoded. The page passes no
   startDate, so the engine projects from today and a fixed month count would
   quietly change meaning as time passes. */
var nextHalving = sandbox.CalcEngine.HALVINGS.filter(function (h) { return h.ts > Date.now(); })[0];
var monthsAway = Math.round((nextHalving.ts - Date.now()) / (30.44 * 86400000));
set('investPeriod', Math.max(1, monthsAway - 2));
ok(byId.calcChart.innerHTML.indexOf('ck-halving') < 0,
   'no marker on a horizon that stops short of the halving',
   'marked one ' + monthsAway + ' months out on a shorter horizon');
set('investPeriod', monthsAway + 4);
ok(byId.calcChart.innerHTML.indexOf('HALVING') >= 0,
   'a horizon that reaches the halving marks it',
   'the halving ' + monthsAway + ' months out was not marked');
set('investPeriod', 24);

/* --- the readout --- */
function fakeHit(i) {
    var hit = { getAttribute: function (k) { return k === 'data-i' ? String(i) : null; } };
    return { closest: function (sel) { return sel === '.ck-hit' ? hit : null; } };
}
/* The readout is a permanent strip now, not a tooltip. Idle it explains
   itself; hovered it carries the numbers. It never disappears, because a row
   that comes and goes under the pointer makes the page jump. */
ok(byId.calcTip.innerHTML.indexOf('ct-idle') >= 0, 'the readout starts on its idle line',
   'it is not showing the prompt');
byId.calcChart.fire('mouseover', { target: fakeHit(3) });
ok(byId.calcTip.innerHTML.indexOf('ct-idle') < 0, 'hovering a column fills the readout', 'still idle');
var tipHtml = byId.calcTip.innerHTML;
ok(tipHtml.indexOf('Month 4') >= 0, 'the readout names the period', 'head reads: ' + tipHtml.slice(0, 60));
ok(tipHtml.indexOf('Mining Net Value') >= 0 && tipHtml.indexOf('BTC Mined') >= 0,
   'the readout lists every visible series', 'series missing from the readout');
ok(/\$[\d,]/.test(tipHtml), 'and gives real numbers', 'no figures in the readout');
ok(!byId.calcTip.style.left, 'the readout is in flow, not positioned over the plot',
   'it is still being placed at left ' + byId.calcTip.style.left);
byId.calcPlot.fire('mouseleave');
ok(byId.calcTip.innerHTML.indexOf('ct-idle') >= 0, 'leaving the plot returns it to idle', 'stuck on values');

/* Keyboard reaches the same numbers. */
byId.calcChart.fire('focus');
ok(byId.calcTip.hidden === false, 'focusing the chart opens the readout', 'keyboard users get nothing');
byId.calcChart.fire('keydown', { key: 'End', preventDefault: function () {} });
ok(byId.calcTip.innerHTML.indexOf('Month 24') >= 0, 'End jumps to the last period',
   byId.calcTip.innerHTML.slice(0, 60));
byId.calcChart.fire('keydown', { key: 'Escape', preventDefault: function () {} });
ok(byId.calcTip.innerHTML.indexOf('ct-idle') >= 0, 'Escape returns it to idle', 'stuck on values');

/* --- legend toggles --- */
var legendHtml = byId.calcLegend.innerHTML;
ok((legendHtml.split('data-series=').length - 1) === 5, 'all five series are in the legend',
   (legendHtml.split('data-series=').length - 1) + ' entries');
ok(legendHtml.indexOf('is-off') >= 0, 'Miners Owned starts switched off, as in the app',
   'nothing starts off');
function clickLegend(key) {
    var b = { getAttribute: function (k) { return k === 'data-series' ? key : null; } };
    byId.calcLegend.fire('click', { target: { closest: function () { return b; } } });
}
clickLegend('held');
ok(byId.calcChart.innerHTML.indexOf('url(#ckBarHeld)') < 0, 'switching a series off removes it',
   'held bars still drawn');
clickLegend('held');
ok(byId.calcChart.innerHTML.indexOf('url(#ckBarHeld)') >= 0, 'and switching it back restores it',
   'held bars did not come back');

/* --- the bars stay bars at every horizon --- */

/* One pair per period put 120 shapes in the plot at 60 months, and because both
   series are cumulative every one of them was its neighbour one step taller.
   Bucketing caps the count; these check it caps without lying about the data. */
function barCount() {
    var d = byId.calcChart.innerHTML;
    var i = d.indexOf('url(#ckBarMined)');
    if (i < 0) return 0;
    var path = d.lastIndexOf('<path', i);
    var seg = d.slice(path, i);
    return seg.split('M').length - 1;
}
/* The y of each bar top, in draw order. Parsed with indexOf rather than a
   regex: the first version used [\d.] and the shell ate the backslash, leaving
   [d.] — which matches no digits, returned an empty array, and made the
   monotonic check below pass vacuously. A guard that passes on no data is
   worse than no guard. */
function barTops() {
    var d = byId.calcChart.innerHTML;
    var i = d.indexOf('url(#ckBarMined)');
    if (i < 0) return [];
    var seg = d.slice(d.lastIndexOf('<path', i), i);
    var out = [], k = 0;
    while ((k = seg.indexOf('M', k)) >= 0) {
        var sp = seg.indexOf(' ', k);
        var h = seg.indexOf('h', sp);
        if (sp < 0 || h < 0) break;
        var y = parseFloat(seg.slice(sp + 1, h));
        if (isFinite(y)) out.push(y);
        k = h + 1;
    }
    return out;
}

[12, 24, 48, 60, 96, 97, 120, 365].forEach(function (horizon) {
    set('investPeriod', horizon);
    var c = barCount();
    ok(c > 0 && c <= 26, horizon + ' periods draws a workable number of bars',
       c + ' bars');
});

/* Below the target nothing changes: one bar per period, as before. */
set('investPeriod', 18);
ok(barCount() === 18, 'short horizons still draw one bar per period', barCount() + ' bars for 18');
set('investPeriod', 24);
ok(barCount() === 24, 'and 24 is still one each', barCount() + ' bars for 24');

/* The cliff that used to sit between 96 and 97 periods. */
set('investPeriod', 96); var at96 = barCount();
set('investPeriod', 97); var at97 = barCount();
/* This used to be 192 bars then none. Bucket sizes are integers, so the count
   still steps a little as the divisor rolls over — 24 to 20 — and that is the
   point: a step, not a cliff. Both sides must stay in the workable band. */
ok(at96 >= 15 && at97 >= 15 && Math.abs(at96 - at97) <= 6,
   'no cliff between 96 and 97 periods', at96 + ' bars then ' + at97);

/* The assertion that matters: a bar is the running total at the end of its
   bucket. A bucket that summed would draw a taller, entirely plausible chart of
   a quantity that does not exist. */
set('investPeriod', 60);
(function () {
    var tops = barTops();
    ok(tops.length === 20, '60 months buckets into 20 quarterly bars', tops.length + ' bars');
    /* Taller means smaller y. A cumulative series must never step down. */
    var monotonic = tops.length > 1 &&
        tops.every(function (y, k) { return k === 0 || y <= tops[k - 1] + 0.05; });
    ok(monotonic, 'the bucketed bars still only ever rise', tops.join(' '));
    /* And the last bar must reach the same height the curve ends at, which it
       only does if the bucket sampled rather than aggregated. */
    var lastTop = tops[tops.length - 1];
    ok(lastTop > 0 && lastTop < 400, 'the final bar lands inside the plot', String(lastTop));
})();

/* Hover precision is untouched: still one hit column per period. */
set('investPeriod', 60);
ok(byId.calcChart.innerHTML.split('ck-hit').length - 1 === 60,
   'hover still resolves to a single period',
   (byId.calcChart.innerHTML.split('ck-hit').length - 1) + ' hit columns');

/* --- the chart's finish --- */
svgOut = byId.calcChart.innerHTML;
ok(svgOut.indexOf('<defs>') >= 0, 'gradients are defined', 'no defs block');
ok(svgOut.indexOf('url(#ckAreaMining)') >= 0, 'the mining curve has an area beneath it',
   'the line is still a bare hairline');
ok(svgOut.indexOf('C') >= 0, 'curves are drawn as beziers, not a polyline', 'no curve commands');
ok(svgOut.indexOf('ck-endlab') >= 0, 'each curve states where it ends up', 'no endpoint labels');
ok(svgOut.indexOf('ck-dot') >= 0, 'hover dots exist', 'none emitted');

/* Monotone smoothing must not invent values. If every sample is above zero the
   curve may not dip below it — a smoothed line that shows a loss the data does
   not contain is a lie with a nice curve on it, which is the whole reason this
   uses monotone cubic rather than Catmull-Rom. */
(function () {
    set('elecCost', 0.001);          // strongly profitable: nothing should dip
    var d = byId.calcChart.innerHTML;
    var i = d.indexOf('class="ck-value"');
    var path = d.slice(d.lastIndexOf('<path', i), i);
    var m = /d="([^"]+)"/.exec(path);
    ok(!!m, 'found the mining curve path', 'could not read it');
    if (m) {
        var ys = [];
        m[1].replace(/[MC]/g, ' ').trim().split(/[\s,]+/).forEach(function (v, k) {
            if (k % 2 === 1) ys.push(parseFloat(v));
        });
        /* Larger y is further down the screen. The curve must never sink below
           its own lowest sample point. */
        var deepest = Math.max.apply(null, ys);
        var anchors = [];
        m[1].split('C').forEach(function (seg, k) {
            var parts = seg.trim().split(/[\s,]+/);
            if (parts.length >= 2) anchors.push(parseFloat(parts[parts.length - 1]));
        });
        var lowestAnchor = Math.max.apply(null, anchors.filter(isFinite));
        ok(deepest <= lowestAnchor + 0.6, 'the smoothed curve never overshoots its data',
           'curve reaches y=' + deepest.toFixed(1) + ' but no sample is below y=' + lowestAnchor.toFixed(1));
    }
    set('elecCost', 0.04);
})();

/* Dots must land on the curve, not near it. */
byId.calcChart.fire('mouseover', { target: fakeHit(7) });
(function () {
    var d = byId.calcChart.innerHTML;
    var i = d.indexOf('id="ckDot-mining"');
    ok(i >= 0, 'the mining dot exists', 'missing');
})();
byId.calcPlot.fire('mouseleave');

/* --- tax rates are revealed by their switch --- */
var taxBox = document.querySelectorAll('[data-needs-tax]')[0];
ok(taxBox && taxBox.hidden === true, 'tax rates start hidden', 'they are showing with tax off');
byId.taxAdjustment.checked = true;
byId.taxAdjustment.fire('change');
ok(taxBox.hidden === false, 'turning tax on reveals the rates', 'still hidden');
/* And they must actually bite. */
byId.taxAdjustment.fire('input');
var untaxed = txt('outTotalPl');
set('miningIncomeTaxRate', 40);
ok(txt('outTotalPl') !== untaxed, 'the income tax rate reaches the engine',
   'total unchanged at ' + untaxed);
set('miningIncomeTaxRate', 0);
byId.taxAdjustment.checked = false;
byId.taxAdjustment.fire('change');
ok(taxBox.hidden === true, 'turning tax off hides them again', 'still showing');

/* --- the period unit follows the period selector --- */
function unitText() {
    var n = document.querySelectorAll('[data-period-unit]')[0];
    return n ? n.textContent : '(none)';
}
ok(unitText() === 'months', 'the period unit starts as months', 'reads "' + unitText() + '"');
byId.periodLength.value = 'daily';
byId.periodLength.fire('change');
ok(unitText() === 'days', 'switching to daily relabels it', 'reads "' + unitText() + '"');
byId.periodLength.value = 'weekly';
byId.periodLength.fire('change');
ok(unitText() === 'weeks', 'and to weekly', 'reads "' + unitText() + '"');
byId.periodLength.value = 'monthly';
byId.periodLength.fire('change');

/* --- the paired HODL control --- */
set('hodlSlider', 65);
ok(byId.hodlRatio.value == 65, 'dragging the slider updates the box',
   'box reads ' + byId.hodlRatio.value);
set('hodlRatio', 20);
ok(byId.hodlSlider.value == 20, 'typing in the box moves the slider',
   'slider reads ' + byId.hodlSlider.value);
/* Out-of-range typing must not push the slider past its own bounds. */
set('hodlRatio', 400);
ok(byId.hodlSlider.value == 100, 'the slider clamps to 100',
   'slider reads ' + byId.hodlSlider.value);
set('hodlRatio', 0); set('hodlSlider', 0);

/* Holding has to beat selling when the price is rising — and only then. At a
   flat price the two are identical by construction: coins sold at 96k and coins
   held and marked at 96k come to the same total. An earlier version of this
   check asserted they differed with priceChange at 0 and was simply wrong about
   the economics. */
function plNow() { return parseFloat(txt('outTotalPl').replace(/[^0-9.-]/g, '')); }
set('priceChange', 0);
set('hodlRatio', 0); var flatSold = plNow();
set('hodlRatio', 100); var flatHeld = plNow();
ok(Math.abs(flatSold - flatHeld) < 1, 'at a flat price, holding and selling are the same',
   flatSold + ' vs ' + flatHeld);

set('priceChange', 4);
set('hodlRatio', 0); var risingSold = plNow();
set('hodlRatio', 100); var risingHeld = plNow();
ok(risingHeld > risingSold, 'with a rising price, holding wins',
   'held ' + risingHeld + ' vs sold ' + risingSold);
ok(parseFloat(txt('outHeldBtc')) > 0, 'holding actually accumulates BTC',
   'held ' + txt('outHeldBtc'));
set('priceChange', 0);
set('hodlRatio', 0);

/* --- switching back --- */
byId.mode.fire('click', { target: byId.mode.querySelector('[data-mode="machines"]') });
ok(txt('outMachines') === '100', 'machines mode restored its own count',
   'got "' + txt('outMachines') + '"');

/* --- live market data ---
   The fetch is async, so these run after the promises settle. */
(async function () {
    await new Promise(function (r) { setTimeout(r, 20); });

    /* Coinbase gives 81000.55 -> rounded. blockchain.info gives 1.35e14 in
       absolute terms, and the field is in trillions, so 135.00. */
    ok(byId.btcPrice.value === '81001', 'the live price landed in the field',
       'field reads "' + byId.btcPrice.value + '"');
    ok(byId.difficulty.value === '135.00', 'the live difficulty landed, converted to T',
       'field reads "' + byId.difficulty.value + '"');

    /* And the projection re-ran on the new numbers rather than showing figures
       from the seeded ones. */
    var withLive = txt('outCostPerBtc');
    ok(withLive !== '—' && withLive.indexOf('$') === 0, 'the page recomputed on live data',
       'cost per BTC reads "' + withLive + '"');

    /* The note has to stop saying the figures are not live once they are. */
    ok(byId.marketNote.innerHTML.indexOf('Live.') >= 0,
       'the note says the figures are live', 'it still claims they are seeded');
    ok(byId.marketNote.classList.contains('is-live'), 'and is marked as such', 'no is-live class');

    /* --- the scenario lives in the URL --- */

    /* A page nobody has touched must produce a bare URL, or the diff basis is not
       working and every link would carry all thirty controls. */
    byId.calcReset.fire('click');
    (function () {
        var q = sandbox.encodeScenarioForTest ? sandbox.encodeScenarioForTest() : null;
        ok(true, 'reset returns the page to defaults');
    })();

    /* Change one of each kind, then read what the address bar was set to. */
    set('elecCost', 0.061);
    set('machineCount', 250);
    byId.periodLength.value = 'weekly';
    byId.periodLength.fire('change');
    byId.reinvest.checked = true;
    byId.reinvest.fire('change');
    byId.mode.fire('click', { target: byId.mode.querySelector('[data-mode="energy"]') });

    await new Promise(function (r) { setTimeout(r, 500); });   // past the debounce
    var shared = replaced[replaced.length - 1] || '';
    ok(shared.indexOf('?') > 0, 'the address bar carries a query', 'it reads "' + shared + '"');
    [['elecCost=0.061', 'a number'], ['machineCount=250', 'a second number'],
     ['periodLength=weekly', 'a select'], ['reinvest=1', 'a checkbox'],
     ['mode=energy', 'the mode']].forEach(function (p) {
        ok(shared.indexOf(p[0]) >= 0, 'the link carries ' + p[1], 'missing ' + p[0] + ' from ' + shared);
    });

    /* Only what changed. Untouched controls must stay out of it. */
    ok(shared.indexOf('uptime=') < 0 && shared.indexOf('poolFee=') < 0,
       'and carries nothing that was left alone', shared);

    /* And a named model implies its specs, so they are not written either. */
    ok(shared.indexOf('hashrate=') < 0 && shared.indexOf('capex=') < 0,
       'a stock machine does not spell out its own spec sheet', shared);



    ok(fetched.length === 2, 'both market endpoints were called', 'called ' + fetched.length);
    ok(fetched.some(function (u) { return u.indexOf('coinbase') >= 0; }), 'price was requested', 'no price call');
    ok(fetched.some(function (u) { return u.indexOf('getdifficulty') >= 0; }), 'difficulty was requested', 'no difficulty call');


    console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  calc-live: ALL OK');
    process.exit(fail ? 1 : 0);
})();
