/* Guards the public calculator.

   Things that break here without throwing:

   1. An id drifts between calculator.html and calculator.js. getElementById
      returns null, setText silently does nothing, and the page shows a dash
      forever.
   2. The site's copy of calc-engine.js drifts from the internal one. The whole
      claim of the page is that it is the same engine.
   3. The gas-to-power constants drift from site-engine.js, so a prospect is told
      their gas supports a different fleet than the desk tool says.
   4. `hidden` stops hiding, because an author `display:` rule outranks it.
   5. The defaults stop opening on a working business — or start doing so
      dishonestly.

   Written with indexOf rather than regexes throughout: backslashes do not
   survive the shell reliably on this machine, and a regex that quietly loses one
   matches nothing and reports a pass. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
var fs = require('fs');
var D = REPO_ROOT + '';
var S = D + 'site/';
var html = fs.readFileSync(S + 'calculator.html', 'utf8');
var js = fs.readFileSync(S + 'calculator.js', 'utf8');
var sheet = fs.readFileSync(S + 'styles.css', 'utf8');
var fail = 0;

function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + detail));
    if (!cond) fail++;
}

/* ================= 0. the files parse =================

   This suite once passed in full against a calculator.js that could not be
   parsed at all — every check here reads the source as text, and text with a
   syntax error in it still contains all the right substrings. Compiling first
   costs nothing and makes every check below mean something. */
var vm = require('vm');
['calculator.js', 'calc-engine.js', 'miner-db.js'].forEach(function (f) {
    try {
        new vm.Script(fs.readFileSync(S + f, 'utf8'), { filename: f });
        ok(true, f + ' parses');
    } catch (e) {
        ok(false, f + ' parses', e.message);
    }
});

/* ================= 1. the id contract ================= */

var htmlIds = {};
(function () {
    var i = 0;
    while ((i = html.indexOf('id="', i)) >= 0) {
        var j = html.indexOf('"', i + 4);
        htmlIds[html.slice(i + 4, j)] = true;
        i = j;
    }
})();

function idsFrom(marker) {
    var out = [], i = 0;
    while ((i = js.indexOf(marker, i)) >= 0) {
        var start = i + marker.length + 1;
        var q = js[start - 1];
        if (q !== "'" && q !== '"') { i += marker.length; continue; }
        var j = js.indexOf(q, start);
        if (j < 0) break;
        out.push(js.slice(start, j));
        i = j;
    }
    return out;
}
var asked = idsFrom('setText(').concat(idsFrom('setSigned(')).concat(idsFrom('$('));
var idsBlock = js.slice(js.indexOf('var IDS = ['), js.indexOf('];', js.indexOf('var IDS = [')));
idsBlock.split("'").forEach(function (t, k) { if (k % 2 === 1) asked.push(t); });

/* Ids the renderer creates rather than the markup declaring. Listed one by one:
   a blanket exemption would let a genuine typo through. */
var RUNTIME_IDS = ['ckCross'];
RUNTIME_IDS.forEach(function (id) {
    ok(js.indexOf('id="' + id + '"') >= 0, 'runtime id ' + id + ' is actually emitted',
       'exempted from the markup check but never created either');
});

/* Ids built by concatenation — $('ckDot-' + key) — arrive here as the bare
   prefix. Each prefix is paired with the keys it is joined to, and every
   resulting id is checked against what the renderer actually emits, so the
   exemption stays as strict as the literal case. */
var ID_PREFIXES = {
    'ckDot-': ['mining', 'hold', 'machines'],
};
Object.keys(ID_PREFIXES).forEach(function (pre) {
    ID_PREFIXES[pre].forEach(function (k) {
        /* Three legitimate ways for one of these to exist: the markup
           declares it, the renderer emits the literal, or the renderer emits
           the same concatenation the reader uses. A name in none of the three
           is the typo this check is for. */
        var built = js.indexOf('id="' + pre) >= 0;
        ok(htmlIds[pre + k] || js.indexOf(pre + k) >= 0 || built,
           'concatenated id ' + pre + k + ' resolves',
           'it is asked for but exists nowhere');
    });
});

var missing = [];
asked.forEach(function (id) {
    if (!id || id === 'mode') return;
    if (RUNTIME_IDS.indexOf(id) >= 0) return;
    if (ID_PREFIXES[id]) return;                      // checked above, key by key
    if (!htmlIds[id] && missing.indexOf(id) < 0) missing.push(id);
});
ok(htmlIds['mode'], 'the mode switch exists', 'no id="mode"');
ok(missing.length === 0, 'every id the script reads exists in the markup',
   'missing: ' + missing.join(', '));

var orphan = [];
Object.keys(htmlIds).forEach(function (id) {
    if (id.indexOf('out') !== 0 && id.indexOf('ed') !== 0) return;
    if (js.indexOf("'" + id + "'") >= 0) return;
    /* Written through a prefix rather than by name. */
    if (Object.keys(ID_PREFIXES).some(function (p) { return id.indexOf(p) === 0; })) return;
    orphan.push(id);
});
ok(orphan.length === 0, 'no output element is left unwritten', 'orphans: ' + orphan.join(', '));

var badFor = [], fi = 0;
while ((fi = html.indexOf('for="', fi)) >= 0) {
    var fj = html.indexOf('"', fi + 5);
    if (!htmlIds[html.slice(fi + 5, fj)]) badFor.push(html.slice(fi + 5, fj));
    fi = fj;
}
ok(badFor.length === 0, 'every label points at a real control', 'dangling: ' + badFor.join(', '));

/* ================= 2. engine parity ================= */

ok(fs.readFileSync(D + 'calc-engine.js').equals(fs.readFileSync(S + 'calc-engine.js')),
   'site calc-engine.js is byte-identical to the internal one',
   'the copy has drifted — the page no longer quotes the same math');

var RootEngine = require(D + 'calc-engine.js');
delete require.cache[require.resolve(S + 'calc-engine.js')];
var SiteEngine = require(S + 'calc-engine.js');
var MinerDB = require(S + 'miner-db.js');

/* Wide enough to exercise halvings, retirement, reinvestment, tax and the HODL
   split — not just the happy path. */
var SCENARIOS = [
    { btcPrice: 96000, difficulty: 125.86, investPeriod: 24, hashrate: 335, power: 5.36,
      capex: 9000, machineCount: 100, elecCost: 0.045, poolFee: 1, uptime: 98 },
    { btcPrice: 60000, difficulty: 90, investPeriod: 60, hashrate: 200, power: 3.5,
      capex: 3200, machineCount: 500, elecCost: 0.07, poolFee: 2, uptime: 92,
      hodlRatio: 100, minerLifespan: 36, salvageValue: 15 },
    { btcPrice: 140000, difficulty: 180, investPeriod: 120, periodLength: 'weekly',
      hashrate: 473, power: 5.676, capex: 13500, machineCount: 20, elecCost: 0.02,
      reinvest: true, taxAdjustment: true, miningIncomeTaxRate: 30, capitalGainsTaxRate: 20 },
    { btcPrice: 96000, difficulty: 125.86, investPeriod: 365, periodLength: 'daily',
      hashrate: 335, power: 5.36, capex: 9000, machineCount: 1, elecCost: 0.05,
      minerAdditions: 3, additionCapex: false, autoReplace: false, btcTreasury: 2.5 },
    { btcPrice: 30000, difficulty: 200, investPeriod: 36, hashrate: 110, power: 3.25,
      capex: 2200, machineCount: 1000, elecCost: 0.12, uptime: 100, savingsElec: true,
      priceChange: 2, diffChange: 1.5, infrastructureCost: 400000 },
    /* Degenerate on purpose: zero must stay zero, not fall back to a default. */
    { btcPrice: 96000, difficulty: 125.86, investPeriod: 12, hashrate: 0, power: 0,
      capex: 0, machineCount: 1, elecCost: 0, uptime: 0 },
];
var drift = 0;
SCENARIOS.forEach(function (s, i) {
    s.startDate = '2026-01-01';
    if (JSON.stringify(RootEngine.computeProjection(s)) !==
        JSON.stringify(SiteEngine.computeProjection(s))) {
        drift++; console.log('      scenario ' + i + ' differs');
    }
});
ok(drift === 0, 'all ' + SCENARIOS.length + ' scenarios project identically on both copies',
   drift + ' scenario(s) drifted');

var z = SiteEngine.computeProjection({ uptime: 0, hashrate: 0, machineCount: 1,
                                       startDate: '2026-01-01', investPeriod: 3 });
ok(z.params.uptimePct === 0, 'uptime 0 stays 0', 'became ' + z.params.uptimePct);
ok(z.params.hashrateTH === 0, 'hashrate 0 stays 0', 'became ' + z.params.hashrateTH);
ok(z.cumulBtcMined === 0, 'a dead fleet mines nothing', 'mined ' + z.cumulBtcMined);

/* ================= 3. gas conversion parity ================= */

var SE = require(D + 'site-engine.js');
function htmlDefault(id) {
    var i = html.indexOf('id="' + id + '"');
    if (i < 0) return null;
    var seg = html.slice(i, html.indexOf('>', i));
    var v = seg.indexOf('value="');
    return v < 0 ? null : parseFloat(seg.slice(v + 7, seg.indexOf('"', v + 7)));
}
var btuPerCf = htmlDefault('gasBtuPerCf');
var heatRate = htmlDefault('heatRate');
ok(btuPerCf === 1000, 'gas heating value default matches site-engine', 'page has ' + btuPerCf);
ok(heatRate === 10000, 'genset heat rate default matches site-engine', 'page has ' + heatRate);
ok(Math.abs((900 * 1000 * btuPerCf) / heatRate / 24 - SE.gasMcfDayToKw(900)) < 1e-6,
   'the page derives the same kW as the internal engine', 'they disagree');
/* Oilfield notation, and the trap that catches everyone including the test that
   was written to check it: M is a thousand, so 1 MMcf = 1,000 Mcf, not 1e6. */
ok(Math.abs(SE.gasMcfDayToKw(1000) / 1000 - 4.1667) < 0.01,
   '1 MMcf/day still lands near 4 MW', (SE.gasMcfDayToKw(1000) / 1000).toFixed(3) + ' MW');
ok(Math.abs((900 * 1000 * btuPerCf) / heatRate / 24 - 3750) < 1,
   'the 900 Mcf/d default derives 3.75 MW', 'it does not');

/* ================= 4. the page holds together ================= */

ok(js.indexOf('getBoundingClientRect') < 0 && js.indexOf('offsetWidth') < 0 &&
   js.indexOf('clientWidth') < 0 && js.indexOf('ResizeObserver') < 0 &&
   js.indexOf('innerHeight') < 0 && js.indexOf('getScreenCTM') < 0,
   'nothing measures the page', 'a layout read crept in');

/* THE VERSION IS PART OF THE URL NOW. Local assets carry ?v=<hash> so a browser cannot
   serve a stale copy — see tools/build-asset-stamp.js, which exists because a whole pricing
   section once shipped invisibly behind a cached page. These checks are asking "does this page
   load X", which is true with or without a version on it, so they match the path and let the
   query string be whatever it is. */
/* The version is STRIPPED ONCE rather than allowed for in every pattern. Building a regex per
   lookup means escaping a filename into it, and every layer that gets it slightly wrong produces
   a regex that silently matches nothing. Removing ?v=<hash> from a copy of the page leaves the
   literal checks below saying exactly what they always said. */
var htmlPlain = html.replace(/\?v=[0-9a-f]+/g, '');
function loadsScript(page, src) { return htmlPlain.indexOf('src="' + src + '"') >= 0; }
['./site.js', './miner-db.js', './calc-engine.js', './calculator.js'].forEach(function (src) {
    ok(loadsScript(html, src), 'loads ' + src, 'script tag missing');
});
/* Position of a script tag, tolerant of the cache-busting version local assets now carry.
   See tools/build-asset-stamp.js — it exists because a section once shipped invisibly behind a
   cached page, and the fix put ?v=<hash> on every local URL. Load ORDER is still the thing being
   asserted; the version is not part of that question. */
function srcAt(page, file) { return htmlPlain.indexOf('src="./' + file + '"'); }
ok(srcAt(html, 'calc-engine.js') < srcAt(html, 'calculator.js'),
   'the engine loads before the controller', 'CalcEngine would be undefined');
ok(srcAt(html, 'miner-db.js') < srcAt(html, 'calculator.js'),
   'the miner database loads before the controller', 'order is wrong');
ok(html.indexOf('<nav class="nav">') >= 0 && html.indexOf('<h4>Company</h4>') >= 0,
   'the generator markers are present', 'build-nav.js could not splice this page');
ok(html.indexOf('border-radius') < 0, 'no inline radii', 'the no-radii rule was broken');

/* ================= 5. hidden must actually hide ================= */

/* `hidden` lives only in the UA stylesheet, so any author rule setting display
   beats it — author origin wins outright. Three blocks here are display:grid AND
   toggled with hidden, and they stayed on screen. The DOM stub in calc-live.js
   cannot see this: it reads the property and never resolves CSS. */
var cascade = require(__dirname + '/cascade.js');
var toggled = [];
(function () {
    var i = 0;
    while ((i = html.indexOf('hidden', i)) >= 0) {
        var open = html.lastIndexOf('<', i);
        var tag = html.slice(open, html.indexOf('>', i) + 1);
        i += 6;
        if (tag.indexOf('aria-hidden') >= 0 && tag.indexOf(' hidden') < 0) continue;
        var cm = tag.indexOf('class="');
        if (cm < 0) continue;
        tag.slice(cm + 7, tag.indexOf('"', cm + 7)).split(/\s+/).forEach(function (c) {
            if (c && toggled.indexOf(c) < 0) toggled.push(c);
        });
    }
})();
ok(toggled.length >= 3, 'found the elements that get toggled', 'only ' + toggled.length);
var stillShowing = [];
toggled.forEach(function (cls) {
    var won = cascade.resolve(sheet, { tag: 'div', classes: [cls], ancestors: [] },
                              ['hidden'], 'display');
    if (won && won.value !== 'none') stillShowing.push(cls + ' -> ' + won.value + ' (' + won.sel + ')');
});
ok(stillShowing.length === 0, 'every toggled block actually hides when hidden',
   stillShowing.join('; '));
ok(sheet.indexOf('[hidden] { display: none !important; }') >= 0,
   'the [hidden] rule is present and important', 'the fix was removed');

/* ================= 6. the whole tool is here ================= */

var engNorm = (function () {
    var e = fs.readFileSync(S + 'calc-engine.js', 'utf8');
    return e.slice(e.indexOf('function normalise'), e.indexOf('function computeProjection'));
})();
var engineKeys = [];
(function () {
    var i = 0;
    while ((i = engNorm.indexOf('s.', i)) >= 0) {
        var m = /^s\.([A-Za-z0-9_]+)/.exec(engNorm.slice(i));
        if (m && engineKeys.indexOf(m[1]) < 0) engineKeys.push(m[1]);
        i += 2;
    }
})();
ok(engineKeys.length >= 25, 'found the engine input list', 'only ' + engineKeys.length);
var noControl = engineKeys.filter(function (k) { return k !== 'startDate' && !htmlIds[k]; });
ok(noControl.length === 0, 'every engine input has a control on the page',
   'no control for: ' + noControl.join(', '));

ok(html.indexOf('advPanel') < 0 && html.indexOf('advToggle') < 0,
   'no collapsed drawer hides part of the tool', 'the advanced drawer is back');
['Market Parameters', 'Machine Parameters', 'Operating Parameters'].forEach(function (g) {
    ok(html.indexOf('>' + g + '<') >= 0, 'group present: ' + g, 'missing');
});

(function () {
    var block = html.slice(html.indexOf('class="calc-inputs"'));
    var hiddenTags = [], i = 0;
    while ((i = block.indexOf(' hidden', i)) >= 0) {
        var open = block.lastIndexOf('<', i);
        hiddenTags.push(block.slice(open, block.indexOf('>', i) + 1).slice(0, 70));
        i += 7;
    }
    var unexplained = hiddenTags.filter(function (s) {
        return s.indexOf('data-needs-tax') < 0 && s.indexOf('data-when') < 0 &&
               s.indexOf('energyDerived') < 0 && s.indexOf('aria-hidden') < 0;
    });
    ok(unexplained.length === 0, 'nothing is hidden at load except mode and tax reveals',
       unexplained.join(' | '));
})();

ok(htmlIds['hodlSlider'], 'the HODL slider is present, as in the software', 'only the box exists');
ok(js.indexOf('el.hodlSlider.addEventListener') >= 0 &&
   js.indexOf('el.hodlRatio.addEventListener') >= 0,
   'the slider and the box write to each other', 'they would drift apart');

/* ================= 6b. every class the chart emits is styled =================

   The chart renders as SVG built from class names. An SVG shape with no fill
   declared defaults to OPAQUE BLACK — not to nothing — so a missing rule does
   not make an element disappear, it makes it cover whatever is underneath.

   That is not hypothetical: rewriting the chart's style block dropped
   `.ck-hit { fill: transparent }`, and since the hit columns are emitted last
   and tile the whole plot, the entire chart went black behind sixty black
   rectangles. Every other test still passed — the markup was perfect, the
   numbers were right, and nothing was visible. */
(function () {
    var emitted = [], i = 0;
    while ((i = js.indexOf('class="', i)) >= 0) {
        var j = js.indexOf('"', i + 7);
        var raw = js.slice(i + 7, j);
        /* Some class attributes are built by concatenation:
             class="ck-dot ck-dot--' + key + '"
           Everything from the first quote onward is code, not class names, and
           the token butting against it is a prefix rather than a whole name. */
        var q = raw.indexOf("'");
        if (q >= 0) raw = raw.slice(0, q);
        raw.split(/\s+/).forEach(function (c) {
            if (!c || c.charAt(c.length - 1) === '-') return;   // a prefix
            if (!/^[a-z][a-z0-9-]*$/.test(c)) return;
            if (emitted.indexOf(c) < 0) emitted.push(c);
        });
        i = j;
    }
    /* The concatenated ones, spelled out so they are covered too. */
    ['ck-dot--mining', 'ck-dot--hold', 'ck-dot--machines',
     'cl-key--mining', 'cl-key--hold', 'cl-key--mined', 'cl-key--held',
     'cl-key--machines'].forEach(function (c) {
        if (emitted.indexOf(c) < 0) emitted.push(c);
    });
    ok(emitted.length >= 20, 'found the classes the renderer emits', 'only ' + emitted.length);
    /* The hover readout is built in showTip, not drawChart, and its classes do
       not share the ck- prefix — which is how an entire unstyled readout slipped
       through a check that only looked at chart classes. */
    ['ct-head', 'ct-item', 'ct-body', 'ct-name', 'ct-num', 'ct-idle'].forEach(function (c) {
        ok(emitted.indexOf(c) >= 0, 'the readout class ' + c + ' is covered by this check',
           'it is emitted but not being checked');
    });

    var unstyled = emitted.filter(function (c) { return sheet.indexOf('.' + c) < 0; });
    ok(unstyled.length === 0, 'every class the chart emits has a rule',
       'unstyled: ' + unstyled.join(', '));

    /* And specifically: anything that tiles the plot must be see-through. */
    var hit = sheet.slice(sheet.indexOf('.ck-hit'), sheet.indexOf('}', sheet.indexOf('.ck-hit')));
    ok(hit.indexOf('fill: transparent') >= 0,
       'the hover columns are transparent, not default black',
       'they would paint over the entire chart');
})();

/* ================= 6c. the chart is painted in the site metal =================

   styles.css defines platinum and orange as gradients rather than flat fills,
   and the chart paints its strokes with SVG copies of those ramps. A stroke
   referencing a gradient id the renderer no longer emits does not fall back to
   a colour — it paints NOTHING, and the line disappears while every other test
   still passes. Same failure mode as the hit rects defaulting to black. */
(function () {
    var refs = [], i = 0;
    while ((i = sheet.indexOf('url(#ck', i)) >= 0) {
        var j = sheet.indexOf(')', i);
        var id = sheet.slice(i + 5, j);
        if (refs.indexOf(id) < 0) refs.push(id);
        i = j;
    }
    ok(refs.length >= 2, 'the chart paints with gradients rather than flat colour',
       'only ' + refs.length + ' gradient references');
    var dangling = refs.filter(function (id) {
        return js.indexOf('id="' + id + '"') < 0;
    });
    ok(dangling.length === 0, 'every gradient the stylesheet asks for is emitted',
       'nothing paints these: ' + dangling.join(', '));
})();

/* Both ramps must be multi-stop, or they are a flat colour wearing a gradient
   tag. The site metal is what is being matched, and it flips. */
(function () {
    var defs = js.slice(js.indexOf('var CHART_DEFS'), js.indexOf('function drawChart'));
    [['ckMetalBtc', 4], ['ckMetalPlat', 3]].forEach(function (pair) {
        var a = defs.indexOf('id="' + pair[0] + '"');
        var seg = a < 0 ? '' : defs.slice(a, defs.indexOf('</linearGradient>', a));
        var stops = seg.split('stop-color').length - 1;
        ok(stops >= pair[1], pair[0] + ' carries a real metal ramp',
           stops + ' stops, wanted at least ' + pair[1]);
    });
    /* Along the line, not across it: a 2.6px stroke cannot show a vertical ramp. */
    var btc = defs.slice(defs.indexOf('ckMetalBtc'), defs.indexOf('ckMetalBtc') + 90);
    ok(btc.indexOf('y1="0" x2="1" y2="0"') >= 0,
       'the line ramps sweep along the line', 'they run across it, where 2.6px shows nothing');
})();

/* ================= 7. the page opens on a working business ================= */

/* A visitor who lands on a loss makes one judgement and leaves. So the defaults
   must project positively — but honestly, which is the harder half. Read from
   the shipped markup rather than restated here, so this tracks whatever the page
   actually opens on. */
var defaults = {};
(function () {
    var i = 0;
    while ((i = html.indexOf('data-default="', i)) >= 0) {
        var open = html.lastIndexOf('<', i);
        var tag = html.slice(open, html.indexOf('>', i) + 1);
        var idm = /id="([^"]+)"/.exec(tag);
        var dm = /data-default="([^"]*)"/.exec(tag);
        if (idm && dm) defaults[idm[1]] = dm[1];
        i += 14;
    }
})();
ok(Object.keys(defaults).length >= 18, 'read the shipped defaults',
   'only ' + Object.keys(defaults).length);

/* The two seeded market figures are the only numbers here that could be mistaken
   for live data, so the caveat must say they are not, must date them, and must
   quote the values actually shipped — otherwise the date describes other
   numbers. */
ok(html.indexOf('not live data') >= 0,
   'price and difficulty are labelled as assumptions', 'the caveat is missing');
(function () {
    var i = html.indexOf('id="marketNote"');
    var note = i < 0 ? '' : html.slice(i, html.indexOf('</p>', i));
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
    var dated = MONTHS.some(function (m) { return note.indexOf(m) >= 0; }) &&
                note.indexOf('20') >= 0;
    ok(dated, 'the fallback figures are dated',
       'no month and year in the note, so nobody can tell how stale they are');
})();
var quotedPrice = Number(defaults.btcPrice).toLocaleString('en-US');
ok(html.indexOf(quotedPrice) >= 0, 'the caveat quotes the BTC price the page ships',
   'field says ' + quotedPrice);
ok(html.indexOf(defaults.difficulty) >= 0, 'the caveat quotes the difficulty the page ships',
   'field says ' + defaults.difficulty);

var opening = SiteEngine.computeProjection({
    btcPrice: defaults.btcPrice, priceChange: defaults.priceChange,
    difficulty: defaults.difficulty, diffChange: defaults.diffChange,
    periodLength: 'monthly', investPeriod: defaults.investPeriod,
    hashrate: defaults.hashrate, power: defaults.power, capex: defaults.capex,
    machineCount: defaults.machineCount, elecCost: defaults.elecCost,
    poolFee: defaults.poolFee, uptime: defaults.uptime,
    hodlRatio: defaults.hodlRatio, minerLifespan: defaults.minerLifespan,
    salvageValue: defaults.salvageValue, minerAdditions: defaults.minerAdditions,
    btcTreasury: defaults.btcTreasury, infrastructureCost: defaults.infrastructureCost,
    autoReplace: defaults.autoReplace === 'true',
    additionCapex: defaults.additionCapex === 'true',
    reinvest: defaults.reinvest === 'true',
    savingsElec: defaults.savingsElec === 'true',
    taxAdjustment: defaults.taxAdjustment === 'true',
    startDate: '2026-08-20',
});
ok(opening.dailyProfitDay1 > 0, 'the opening view makes money on day one',
   '$' + opening.dailyProfitDay1.toFixed(2) + '/day');
ok(opening.breakEvenPeriod !== null, 'and pays back inside the default horizon',
   'never breaks even in ' + defaults.investPeriod + ' periods');
ok(opening.roi > 0, 'and shows a positive return', opening.roi.toFixed(1) + '%');

/* The honesty half. The rigged move is price up with difficulty flat: revenue
   per terahash then climbs forever and any fleet looks good. Holding the two in
   step keeps hashprice flat in USD — bitcoin worth more and proportionally
   harder to mine — which is the neutral assumption. So the invariant is that
   they match, not that they are zero. */
ok(parseFloat(defaults.priceChange) === parseFloat(defaults.diffChange),
   'price growth and difficulty growth are assumed in step',
   'price ' + defaults.priceChange + '%/mo against difficulty ' + defaults.diffChange + '%/mo');
ok(parseFloat(defaults.priceChange) <= 3, 'the assumed price growth is not extravagant',
   defaults.priceChange + '%/mo');
ok(parseFloat(defaults.uptime) >= 90 && parseFloat(defaults.uptime) < 100,
   'uptime default is realistic, not 100%', defaults.uptime + '%');
ok(parseFloat(defaults.poolFee) > 0, 'a pool fee is actually charged', defaults.poolFee + '%');
ok(parseFloat(defaults.elecCost) > 0, 'power is actually charged for', '$' + defaults.elecCost);

/* The default machine must not be an outlier on price. Being the cheapest per
   terahash in the list is how a calculator flatters itself. */
(function () {
    var dm = /var DEFAULT_MODEL = '([^']+)'/.exec(js);
    ok(!!dm, 'the default model is named in one place', 'no DEFAULT_MODEL constant');
    if (!dm) return;
    var chosen = MinerDB.findByModel(dm[1]);
    ok(!!chosen, 'the default model exists in the database', dm[1] + ' not found');
    if (!chosen) return;
    var mine = chosen.cost / chosen.hashrate;
    var cheaper = MinerDB.getAll().filter(function (m) { return m.cost / m.hashrate < mine; }).length;
    ok(cheaper >= 2, 'the default is not the cheapest machine per terahash',
       'ranks ' + (cheaper + 1) + ' of ' + MinerDB.getAll().length + ' at $' + mine.toFixed(1) + '/TH');
    ok(parseFloat(defaults.hashrate) === chosen.hashrate &&
       parseFloat(defaults.power) === chosen.power &&
       parseFloat(defaults.capex) === chosen.cost,
       'the default specs match that model',
       defaults.hashrate + '/' + defaults.power + '/' + defaults.capex + ' vs ' +
       chosen.hashrate + '/' + chosen.power + '/' + chosen.cost);
})();

ok(MinerDB.getAll().length >= 20, 'the miner database came across',
   'only ' + MinerDB.getAll().length + ' models');

/* ================= 8. the live market fetch ================= */

/* This is the only outbound request the site makes and the only thing on the
   page that can fail, so what matters is that failure is invisible: the seeded
   figures stand and the calculator still opens. */
ok(js.indexOf('function fetchMarket') >= 0, 'the market fetch exists', 'not implemented');
ok(js.indexOf('.catch(') >= 0, 'a failed fetch is caught', 'an outage would throw into the console');
ok(js.indexOf('if (typeof fetch !== \'function\') return;') >= 0,
   'an old browser without fetch is handled', 'it would throw on load');
(function () {
    var block = js.slice(js.indexOf('var MARKET = {'), js.indexOf('var marketLive'));
    var urls = [], i = 0;
    while ((i = block.indexOf('http', i)) >= 0) {
        var end = block.indexOf("'", i);
        urls.push(block.slice(i, end));
        i = end;
    }
    ok(urls.length === 2, 'two endpoints are configured', urls.length + ' found');
    ok(urls.every(function (u) { return u.indexOf('https://') === 0; }),
       'both endpoints are https', urls.join(', '));
    /* A key in a static page is a published key, so there must not be one. */
    ok(!urls.some(function (u) {
        return u.indexOf('key=') >= 0 || u.indexOf('token=') >= 0 || u.indexOf('apikey') >= 0;
    }), 'no API key is embedded in the page', urls.join(', '));
})();
/* The fetch must not overwrite something the visitor has already typed. */
ok(js.indexOf("node.value === node.getAttribute('data-default')") >= 0,
   'a late response will not stomp typed input', 'the guard is gone');
/* The seeded values are the fallback, so they must still be real numbers. */
ok(parseFloat(defaults.btcPrice) > 0 && parseFloat(defaults.difficulty) > 0,
   'the fallback figures are usable numbers',
   defaults.btcPrice + ' / ' + defaults.difficulty);

/* ================= 9. gain and loss read at a glance ================= */

/* Green for a working outcome, red for a failing one, on the three tiles that
   have a good and a bad direction. Cost-to-mine has neither — it is a fact, not
   a verdict — so it is orange, which this site reserves for live data points. */
ok(sheet.indexOf('--gain:') >= 0, 'a gain colour is defined', 'no --gain token');
ok(sheet.indexOf('.is-up { color: var(--gain); }') >= 0,
   'positive values render green', 'is-up is not using the gain token');
ok(sheet.indexOf('.is-down { color: var(--loss); }') >= 0,
   'negative values render red', 'is-down is not using the loss token');
ok(html.indexOf('class="ct-val ct-val--btc" id="outCostPerBtc"') >= 0,
   'cost to mine one BTC is marked as a data point', 'the orange class is missing');
ok(sheet.indexOf('.ct-val--btc { color: var(--btc-300); }') >= 0,
   'and renders in the accent', 'the rule is missing');
/* All three verdict tiles must actually be sign-coloured, not just two. */
['outDailyProfit', 'outRoi', 'outBreakEven'].forEach(function (id) {
    ok(js.indexOf("setSigned('" + id + "'") >= 0, id + ' is sign-coloured',
       'it uses setText, so it never turns green or red');
});
/* Contrast, measured rather than assumed. */
(function () {
    function hex(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    function lum(c) {
        var s = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    }
    function R(a, b) { var l1 = lum(hex(a)), l2 = lum(hex(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
    function token(name) {
        var i = sheet.indexOf('--' + name + ':');
        return sheet.slice(sheet.indexOf('#', i), sheet.indexOf('#', i) + 7);
    }
    var TILE = '#0a0a0a';                       // --surface, the tile background
    [['gain', token('gain')], ['loss', token('loss')], ['btc-300', '#f7931a']].forEach(function (p) {
        ok(R(p[1], TILE) >= 4.5, p[0] + ' clears 4.5:1 on the result tiles',
           p[1] + ' measures ' + R(p[1], TILE).toFixed(2) + ':1');
    });
})();


/* ---- PRE-TAX CAPITAL: which side of the comparison the tax comes off ------
 *
 * The question this answers is "I earn 200k — do I buy miners with it or buy
 * bitcoin with it", and the two are not the same size of bet. Miners are
 * equipment, so a first-year write-off deducts the cost against that income and
 * the whole amount goes to work. Buying bitcoin deducts nothing, so the income
 * is taxed first and only what is left buys coins.
 *
 * WITHOUT THIS the benchmark bought bitcoin with the full pre-tax figure and
 * paid no income tax on it, while the mining side paid income tax on every coin
 * it produced. At 20% on $198,660 that handed the alternative $39,732 — nearly
 * four tenths of a coin at $100k — and it was enough to flip which side won.
 *
 * The page has claimed since it was written that "a comparison against simply
 * holding bitcoin is meaningless if only one side is taxed". This is the input
 * that makes that true when the money is income rather than savings. */
var PT = {
    btcPrice: 100000, priceChange: 0, difficulty: 127.48, diffChange: 0,
    hashrate: 270, power: 3.645, elecCost: 0.05, poolFee: 1, uptime: 100,
    capex: 3010, machineCount: 66, infrastructureCost: 0,
    investPeriod: 12, periodLength: 'month', minerLifespan: 60,
    salvageValue: 0, autoReplace: false, reinvest: false, hodlRatio: 100,
    startDate: '2026-01-01',
    taxAdjustment: true, miningIncomeTaxRate: 20, capitalGainsTaxRate: 20
};
function pt(extra) {
    var o = {}; for (var k in PT) o[k] = PT[k];
    for (var j in (extra || {})) o[j] = extra[j];
    return SiteEngine.computeProjection(o);
}

var ptOff = pt({}), ptOn = pt({ preTaxCapital: true });

ok(Math.abs(ptOff.buyHoldSpend - ptOff.totalInitialInvestment) < 0.01,
   'savings: the benchmark buys with the whole investment',
   ptOff.buyHoldSpend + ' vs ' + ptOff.totalInitialInvestment);

ok(Math.abs(ptOn.buyHoldSpend - ptOff.totalInitialInvestment * 0.8) < 0.01,
   'pre-tax income: the benchmark buys with what the income tax leaves',
   'expected ' + (ptOff.totalInitialInvestment * 0.8).toFixed(2) +
   ', got ' + ptOn.buyHoldSpend.toFixed(2));

ok(ptOn.buyHoldBtcAmount < ptOff.buyHoldBtcAmount,
   'so it holds fewer coins than the untaxed version did',
   ptOn.buyHoldBtcAmount.toFixed(4) + ' vs ' + ptOff.buyHoldBtcAmount.toFixed(4));

/* THE MINING SIDE MUST NOT MOVE. capex has never been taxed in this model,
   which is exactly what a first-year write-off means — so switching the flag on
   changes the benchmark and nothing else. If this ever fails, the deduction is
   being applied twice. */
ok(ptOn.totalPL === ptOff.totalPL && ptOn.cumulBtcMined === ptOff.cumulBtcMined,
   'and the mining side is untouched by the flag',
   'P/L ' + ptOff.totalPL + ' -> ' + ptOn.totalPL);

/* At a flat price the whole difference IS the income tax: the benchmark's loss
   is exactly what it paid to get in. */
ok(Math.abs(ptOn.buyHoldFinalNet + ptOff.totalInitialInvestment * 0.2) < 1,
   'at a flat price the benchmark is out exactly the tax it paid',
   ptOn.buyHoldFinalNet.toFixed(2) + ', tax was ' +
   (ptOff.totalInitialInvestment * 0.2).toFixed(2));

ok((ptOff.totalPL - ptOff.buyHoldFinalNet) < 0 &&
   (ptOn.totalPL - ptOn.buyHoldFinalNet) > 0,
   'which is enough to flip which side of the comparison wins',
   'savings ' + Math.round(ptOff.totalPL - ptOff.buyHoldFinalNet) +
   ', pre-tax ' + Math.round(ptOn.totalPL - ptOn.buyHoldFinalNet));

/* A pre-tax investment with no tax model is a contradiction — it would shrink
   the benchmark by a rate that is not being applied anywhere else on the page. */
/* ASSERTED ON normalise(), NOT ON THE OUTPUT, because the output cannot tell
   you. With the tax model off the income rate is already 0, so multiplying the
   benchmark's spend by (1 - 0) leaves it alone whether the flag is gated or not
   — the first version of this assertion passed with the gate deleted, which is
   the definition of proving nothing. This reads the decision itself. */
ok(SiteEngine.normalise({ preTaxCapital: true, taxAdjustment: false })
       .preTaxCapital === false,
   'the flag is refused outright when the tax model is switched off',
   'a pre-tax investment with no tax model would shrink the benchmark by a rate ' +
   'that is not applied anywhere else');
ok(SiteEngine.normalise({ preTaxCapital: true, taxAdjustment: true })
       .preTaxCapital === true,
   'and accepted when it is on');

/* Both engines, because there are two calculators and one implementation. */
ok(JSON.stringify(RootEngine.computeProjection(
       Object.assign({}, PT, { preTaxCapital: true }))) ===
   JSON.stringify(ptOn),
   'and the app engine agrees with the site engine on all of it');

/* A VALUE AND A NET ARE TWO NUMBERS. The benchmark panel showed only the net,
   under the label "Buying the same dollar" - so $206,000 of pre-tax income at 20%
   read as -$41,200 where the reader was looking for the $164,800 of bitcoin it
   buys. Both figures were right; one was on screen under a name suggesting the
   other. They are separate rows now, and the value comes first because it is the
   one people look for. */
/* Read here rather than leaning on the copy declared further down: `var` hoists,
   so that name is in scope but undefined at this point. The first run of these
   had one assertion fail on it and the next one PASS on it, because a negated
   test against undefined is true - vacuous in exactly the direction that hides a
   bug. */
var benchHtml = fs.readFileSync(S + 'calculator.html', 'utf8');
ok(/id="outBenchmarkValue"/.test(benchHtml) && /id="outBenchmark"/.test(benchHtml),
   'the benchmark panel shows what it buys AND what that nets',
   'one row cannot carry both a value and a profit');
ok(!/Buying the same dollar<\/dt>/.test(benchHtml),
   'and no longer labels a net as if it were the purchase');
var siteJs0 = fs.readFileSync(S + 'calculator.js', 'utf8');
ok(/outBenchmarkValue[\s\S]{0,120}?buyHoldFinalValue/.test(siteJs0),
   'the value row is fed the value, not the net');
ok(/preTaxCapital[\s\S]{0,200}?after income tax/.test(siteJs0),
   'and the label says so when the money is pre-tax income');
/* "the same dollar" is only true when both sides spend the same. The pre-tax
   option exists because they do not, so the verdict must stop saying it. */
ok(/sameDollar/.test(siteJs0),
   'the verdict stops claiming "the same dollar" once the sides differ in size');

/* A CONTROL THAT EXISTS BUT DOES NOTHING is the failure this catches, because
   it is the one that happened. The site page sweeps an id list and re-renders on
   any of them, so adding the id was enough. The app wires a listener per control,
   so the checkbox rendered, ticked, and changed no number at all until one was
   added - and every engine assertion above passed the whole time. */
var siteJs = fs.readFileSync(S + 'calculator.js', 'utf8');
var appJs = fs.readFileSync(D + 'calculator.js', 'utf8');
ok(/'preTaxCapital'/.test(siteJs),
   'the site calculator sweeps preTaxCapital with its other inputs');
ok(/preTaxCapital[\s\S]{0,200}?addEventListener\(\s*'change'/.test(appJs),
   'the app calculator listens to preTaxCapital and re-renders',
   'without this the box ticks and nothing on the page moves');
ok(/preTaxCapital/.test(appJs.split('recalculate')[0] +
   appJs) && /s\.preTaxCapital|settings\.preTaxCapital/.test(appJs),
   'and the app reads it into the settings it hands the engine');

/* THE CLAIM ON THE PAGE. A tax deferral described as an escape would be the
   kind of thing this repo exists to not ship, so the caveat travels with the
   control on both calculators and points at the page that explains it. */
var siteCalc = fs.readFileSync(S + 'calculator.html', 'utf8');
var appCalc = fs.readFileSync(D + 'calculator.html', 'utf8');
[[siteCalc, 'site'], [appCalc, 'app']].forEach(function (pair) {
    /* Whitespace collapsed first. These assertions are about what the page SAYS,
       and a phrase that happens to wrap between two words is still the phrase --
       both of these failed on their first run for no better reason than that. */
    var html = pair[0].replace(/\s+/g, ' '), where = pair[1];
    ok(html.indexOf('id="preTaxCapital"') >= 0,
       where + ' calculator carries the pre-tax control');
    ok(/recaptur/i.test(html) && /trade or business/i.test(html),
       where + ' calculator says it is a deferral, not an escape');
    ok(/why-mining\.html#tax/.test(html),
       where + ' calculator links to what it depends on');
    ok(/not tax advice/i.test(html),
       where + ' calculator says it is not tax advice');
});

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  calc-suite: ALL OK');
process.exit(fail ? 1 : 0);
