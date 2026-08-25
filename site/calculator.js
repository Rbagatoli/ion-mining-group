/* ===== PROTON MINING — Public mining calculator =====

   The arithmetic is NOT reimplemented here. calc-engine.js is a byte-for-byte
   copy of the engine the internal software runs, so a number a prospect sees on
   this page is the same number the desk would quote them. Everything below is
   the form around it: read the controls, hand the engine a settings object in
   exactly the shape it expects, and draw the result.

   Two ways in:
     machines — you already know the fleet. Pick a model and a count.
     energy   — you have gas or spare power and want to know what it supports.
                Volume converts to kW and then to a machine count, and from
                there it is the same projection.

   The gas conversion is Proton's own, lifted from site-engine.js: 1,000 BTU per
   cubic foot, 10,000 BTU per kWh, i.e. 1 Mcf ~ 100 kWh and 1 MMcf/day ~ 4 MW.
   Both constants are exposed as inputs because the internal engine exposes
   them too — heat rate moves materially with genset model and altitude.

   Nothing here measures the page. The chart is an SVG with a viewBox, so it
   scales without anyone asking the layout how wide it is. */

(function () {
    'use strict';

    var el = {};
    var IDS = [
        'mode', 'minerModel', 'machineCount', 'hashrate', 'power', 'capex',
        'energyBasis', 'energyValue', 'gasBtuPerCf', 'heatRate',
        'elecCost', 'btcPrice', 'priceChange', 'difficulty', 'diffChange',
        'periodLength', 'investPeriod',
        'poolFee', 'uptime', 'hodlRatio', 'hodlSlider', 'minerLifespan', 'salvageValue',
        'minerAdditions', 'btcTreasury', 'infrastructureCost',
        'miningIncomeTaxRate', 'capitalGainsTaxRate',
        'autoReplace', 'additionCapex', 'reinvest', 'savingsElec', 'taxAdjustment',
    ];

    /* Proton's gas->power constants, matching site-engine.js. Defaults only; the
       two inputs above override them. */
    var GAS_BTU_PER_CF = 1000;
    var HEAT_RATE_BTU_PER_KWH = 10000;

    /* ---------- small helpers ---------- */

    function $(id) { return document.getElementById(id); }
    function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }

    function money(v, dp) {
        if (!isFinite(v)) return '—';
        var neg = v < 0;
        var s = Math.abs(v).toLocaleString('en-US', {
            minimumFractionDigits: dp === undefined ? 0 : dp,
            maximumFractionDigits: dp === undefined ? 0 : dp,
        });
        return (neg ? '-$' : '$') + s;
    }

    /* Compact form for axis ticks and big totals, where four digits of precision
       is noise: $1.2M reads faster than $1,238,411. */
    function moneyShort(v) {
        if (!isFinite(v)) return '—';
        var a = Math.abs(v), sign = v < 0 ? '-' : '';
        if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
        if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
        if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
        return sign + '$' + a.toFixed(0);
    }

    function btc(v, dp) {
        if (!isFinite(v)) return '—';
        return v.toLocaleString('en-US', {
            minimumFractionDigits: dp === undefined ? 4 : dp,
            maximumFractionDigits: dp === undefined ? 4 : dp,
        });
    }

    function int(v) {
        if (!isFinite(v)) return '—';
        return Math.round(v).toLocaleString('en-US');
    }

    function pct(v, dp) {
        if (!isFinite(v)) return '—';
        return v.toFixed(dp === undefined ? 1 : dp) + '%';
    }

    function setText(id, text) {
        var n = $(id);
        if (n) n.textContent = text;
    }

    /* Colours the value by sign, so a loss is legible at a glance without
       reading the digits. Neutral when it is neither. */
    function setSigned(id, text, v) {
        var n = $(id);
        if (!n) return;
        n.textContent = text;
        n.classList.toggle('is-up', v > 0);
        n.classList.toggle('is-down', v < 0);
    }

    /* ---------- the miner picker ---------- */

    var CUSTOM = '__custom__';

    /* The model the page opens on. Chosen on cost per terahash, not on brand:
       several prices in miner-db.js have gone stale at different rates, so the
       list now spans $6/TH to $36/TH for machines of similar vintage, and
       whichever one this page opens on decides whether a first-time visitor
       sees a business or a write-off. This one sits mid-range at ~$11/TH and
       is current-generation air-cooled, so the opening numbers are neither an
       outlier bargain nor an outlier price. */
    var DEFAULT_MODEL = 'Antminer S21 XP';

    function fillMinerModels() {
        if (typeof MinerDB === 'undefined') return;
        var list = MinerDB.getAll().slice().sort(function (a, b) {
            return b.hashrate - a.hashrate;
        });
        var frag = document.createDocumentFragment();
        list.forEach(function (m) {
            var o = document.createElement('option');
            o.value = m.model;
            o.textContent = m.model + ' — ' + m.hashrate + ' TH, ' + m.power.toFixed(2) + ' kW';
            frag.appendChild(o);
        });
        var c = document.createElement('option');
        c.value = CUSTOM;
        c.textContent = 'Custom — enter your own specs';
        frag.appendChild(c);
        el.minerModel.appendChild(frag);
        el.minerModel.value = DEFAULT_MODEL;
        applyMinerModel();
    }

    /* Picking a model fills the three spec fields. They stay editable — a real
       fleet is rarely at book spec, and an underclocked machine is a different
       machine. Editing one flips the picker to Custom so the label stops
       claiming to be something it no longer is. */
    function applyMinerModel() {
        var v = el.minerModel.value;
        if (v === CUSTOM) return;
        if (typeof MinerDB === 'undefined') return;
        var m = MinerDB.findByModel(v);
        if (!m) return;
        el.hashrate.value = m.hashrate;
        el.power.value = m.power;
        el.capex.value = m.cost;
    }

    function markCustom() {
        el.minerModel.value = CUSTOM;
    }

    /* ---------- energy mode ---------- */

    /* Mcf/day -> kW, exactly as site-engine.js does it:
         Mcf x 1000 cf x BTU/cf / (BTU/kWh) / 24 h                       */
    function gasMcfDayToKw(mcfPerDay, btuPerCf, heatRate) {
        if (!(mcfPerDay >= 0) || !(heatRate > 0)) return 0;
        return (mcfPerDay * 1000 * btuPerCf) / heatRate / 24;
    }

    /* How much power the prospect actually has, whichever way they described
       it, and how many of the chosen machine that runs. */
    function energyDerivation() {
        var basis = el.energyBasis.value;
        var v = Math.max(0, num(el.energyValue.value, 0));
        var btuPerCf = Math.max(1, num(el.gasBtuPerCf.value, GAS_BTU_PER_CF));
        var heatRate = Math.max(1, num(el.heatRate.value, HEAT_RATE_BTU_PER_KWH));
        var kw;
        if (basis === 'mcfd') kw = gasMcfDayToKw(v, btuPerCf, heatRate);
        else if (basis === 'mw') kw = v * 1000;
        else kw = v;                                   // already kW

        var perMachineKw = Math.max(1e-9, num(el.power.value, 5.36));
        /* floor(usable kW / machine kW), the same honest floor the internal
           engine uses for max_miners. */
        var machines = Math.floor(kw / perMachineKw);
        return { kw: kw, machines: Math.max(0, machines), basis: basis, raw: v };
    }

    function isEnergyMode() {
        return el.mode.querySelector('[aria-pressed="true"]').dataset.mode === 'energy';
    }

    /* ---------- gather ---------- */

    function collect() {
        var machineCount;
        var derived = null;
        if (isEnergyMode()) {
            derived = energyDerivation();
            machineCount = derived.machines;
        } else {
            machineCount = Math.max(0, Math.round(num(el.machineCount.value, 1)));
        }

        var s = {
            btcPrice: num(el.btcPrice.value, 96000),
            priceChange: num(el.priceChange.value, 0),
            difficulty: num(el.difficulty.value, 125.86),
            diffChange: num(el.diffChange.value, 0),
            periodLength: el.periodLength.value,
            investPeriod: Math.round(num(el.investPeriod.value, 24)),
            hashrate: num(el.hashrate.value, 335),
            power: num(el.power.value, 5.36),
            capex: num(el.capex.value, 0),
            machineCount: machineCount,
            elecCost: num(el.elecCost.value, 0),
            poolFee: num(el.poolFee.value, 0),
            uptime: num(el.uptime.value, 100),
            hodlRatio: num(el.hodlRatio.value, 0),
            minerLifespan: Math.round(num(el.minerLifespan.value, 36)),
            salvageValue: num(el.salvageValue.value, 0),
            minerAdditions: Math.round(num(el.minerAdditions.value, 0)),
            btcTreasury: num(el.btcTreasury.value, 0),
            infrastructureCost: num(el.infrastructureCost.value, 0),
            /* The engine reads absent as ON for these two, so pass real
               booleans rather than letting an unchecked box go missing. */
            autoReplace: !!el.autoReplace.checked,
            additionCapex: !!el.additionCapex.checked,
            reinvest: !!el.reinvest.checked,
            savingsElec: !!el.savingsElec.checked,
            taxAdjustment: !!el.taxAdjustment.checked,
            miningIncomeTaxRate: num(el.miningIncomeTaxRate.value, 0),
            capitalGainsTaxRate: num(el.capitalGainsTaxRate.value, 0),
        };
        /* machineCount is handed back separately because the engine floors it at
           1 — it is used as a divisor downstream, so normalise() will not accept
           a zero. That floor is right for the engine and wrong for this page: a
           volume too small to run one machine must not come back as a
           one-machine projection. Everything user-facing reads `requested`. */
        return { settings: s, derived: derived, requested: machineCount };
    }

    /* Monotone cubic interpolation (Fritsch–Carlson).

       A straight polyline through 60 monthly points looks like a saw. The usual
       fix is Catmull-Rom, which is smooth but overshoots — it will draw the
       curve dipping below zero between two points that are both above it, and on
       a profit chart that is a lie with a nice curve on it. Monotone cubic is
       smooth and cannot overshoot: between any two samples the curve stays
       within their range. */
    function monotoneTangents(xs, ys) {
        var n = xs.length, d = [], m = [];
        for (var i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
        m.push(d[0] || 0);
        for (var k = 1; k < n - 1; k++) {
            if (d[k - 1] * d[k] <= 0) { m.push(0); continue; }
            m.push((d[k - 1] + d[k]) / 2);
        }
        m.push(d[n - 2] || 0);
        /* Clamp so no segment can bulge past its own endpoints. */
        for (var j = 0; j < n - 1; j++) {
            if (d[j] === 0) { m[j] = 0; m[j + 1] = 0; continue; }
            var a = m[j] / d[j], b = m[j + 1] / d[j];
            var s = a * a + b * b;
            if (s > 9) {
                var t = 3 / Math.sqrt(s);
                m[j] = t * a * d[j];
                m[j + 1] = t * b * d[j];
            }
        }
        return m;
    }

    function smoothPath(xs, ys) {
        var n = xs.length;
        if (n < 2) return n ? 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1) : '';
        var m = monotoneTangents(xs, ys);
        var d = 'M' + xs[0].toFixed(1) + ' ' + ys[0].toFixed(1);
        for (var i = 0; i < n - 1; i++) {
            var h = (xs[i + 1] - xs[i]) / 3;
            d += 'C' + (xs[i] + h).toFixed(1) + ' ' + (ys[i] + m[i] * h).toFixed(1) +
                 ' ' + (xs[i + 1] - h).toFixed(1) + ' ' + (ys[i + 1] - m[i + 1] * h).toFixed(1) +
                 ' ' + xs[i + 1].toFixed(1) + ' ' + ys[i + 1].toFixed(1);
        }
        return d;
    }

    var VB = { w: 1000, h: 360 };
    var PAD = { l: 78, r: 96, t: 30, b: 42 };

    var SERIES = [
        { key: 'machines', label: 'Miners Owned',               kind: 'line', axis: 'count', on: false },
        { key: 'mining',   label: 'Mining Net Value (USD)',     kind: 'line', axis: 'usd',   on: true },
        { key: 'hold',     label: 'Buy & Hold Net Value (USD)', kind: 'line', axis: 'usd',   on: true },
        { key: 'mined',    label: 'BTC Mined (cumulative)',     kind: 'bar',  axis: 'btc',   on: true },
        { key: 'held',     label: 'BTC Held (cumulative)',      kind: 'bar',  axis: 'btc',   on: true },
    ];
    var seriesOn = {};
    SERIES.forEach(function (s) { seriesOn[s.key] = s.on; });

    var lastFrame = null;

    function niceStep(range, targetTicks) {
        if (!(range > 0)) return 1;
        var raw = range / targetTicks;
        var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var norm = raw / mag;
        var step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
        return step * mag;
    }

    function scaleOver(lo, hi, divs) {
        if (!(hi > lo)) hi = lo + 1;
        var step = niceStep(hi - lo, divs);
        for (var guard = 0; guard < 12; guard++) {
            var l = Math.floor(lo / step) * step;
            var h = l + step * divs;
            if (h >= hi - 1e-9) return { lo: l, hi: h, step: step };
            step = niceStep(step * divs * 1.5, divs);
        }
        return { lo: lo, hi: hi, step: (hi - lo) / divs };
    }

    var DIVS = 6;

    /* The site's own material language, in SVG. The README is explicit that
       platinum and orange are gradients rather than flat fills — everything else
       on the page catches light that way, and the chart was the one surface
       still sitting flat. */
    /* The site's own metal, in SVG.

       styles.css defines platinum and orange as multi-stop gradients rather
       than flat fills, and every other surface on the site catches light that
       way. These are those exact ramps, re-expressed as SVG gradients because
       a CSS gradient cannot paint a stroke.

       The line gradients run HORIZONTALLY — along the curve rather than across
       it. A 2.6px stroke is not tall enough to show a vertical ramp; swept
       along its length instead, the light travels down the line the way it does
       across a brushed edge.

       Which ramp each element gets is a legibility decision, not a taste one.
       --metal-btc-flat and --metal-plat-flat carry the full flip and bottom out
       at 4.04:1 and 3.02:1 against this panel — fine on a thick solid line or a
       filled bar. The benchmark line is 1.7px and dashed, and dark bands on a
       thin dashed line read as a broken line rather than as metal, so it takes
       --metal-plat-soft, which is the variant styles.css already keeps for
       exactly this problem at small sizes. */
    var CHART_DEFS =
        '<defs>' +
          /* --metal-btc-flat, swept along the line. */
          '<linearGradient id="ckMetalBtc" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0%" stop-color="#a85a06"/>' +
            '<stop offset="20%" stop-color="#f7931a"/>' +
            '<stop offset="40%" stop-color="#ffc978"/>' +
            '<stop offset="56%" stop-color="#f7931a"/>' +
            '<stop offset="76%" stop-color="#c86f0a"/>' +
            '<stop offset="100%" stop-color="#ffb347"/>' +
          '</linearGradient>' +
          /* --metal-plat-soft: floored, because this line is thin and dashed. */
          '<linearGradient id="ckMetalPlat" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0%" stop-color="#ffffff"/>' +
            '<stop offset="40%" stop-color="#e4e3e1"/>' +
            '<stop offset="74%" stop-color="#b3b2af"/>' +
            '<stop offset="100%" stop-color="#d6d5d3"/>' +
          '</linearGradient>' +
          /* Bars are tall enough for the ramp to run down them, so these keep
             the vertical sweep and the full flip. */
          '<linearGradient id="ckBarMined" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#ffc46b" stop-opacity="0.82"/>' +
            '<stop offset="20%" stop-color="#f7931a" stop-opacity="0.66"/>' +
            '<stop offset="48%" stop-color="#ffc978" stop-opacity="0.52"/>' +
            '<stop offset="76%" stop-color="#c86f0a" stop-opacity="0.38"/>' +
            '<stop offset="100%" stop-color="#a85a06" stop-opacity="0.24"/>' +
          '</linearGradient>' +
          '<linearGradient id="ckBarHeld" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.46"/>' +
            '<stop offset="25%" stop-color="#d0cfcd" stop-opacity="0.36"/>' +
            '<stop offset="50%" stop-color="#83827f" stop-opacity="0.28"/>' +
            '<stop offset="76%" stop-color="#e8e7e5" stop-opacity="0.22"/>' +
            '<stop offset="100%" stop-color="#6b6a67" stop-opacity="0.14"/>' +
          '</linearGradient>' +
          /* Areas stay simple fades. Metal wants an edge to travel along; a
             large soft wash with bands in it just looks like banding. */
          '<linearGradient id="ckAreaMining" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#f7931a" stop-opacity="0.34"/>' +
            '<stop offset="55%" stop-color="#f7931a" stop-opacity="0.09"/>' +
            '<stop offset="100%" stop-color="#f7931a" stop-opacity="0"/>' +
          '</linearGradient>' +
          '<linearGradient id="ckAreaHold" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#e5e4e2" stop-opacity="0.13"/>' +
            '<stop offset="100%" stop-color="#e5e4e2" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>';
    function drawChart(r) {
        var svg = $('calcChart');
        if (!svg) return;
        var s = r.series;
        var n = s.labels.length;
        if (!n) { svg.innerHTML = ''; lastFrame = null; return; }

        var data = {
            mining: s.usdValue, hold: s.buyHold,
            mined: s.cumulMined, held: s.btcHodl,
            machines: s.machines,
        };

        function spread(keys) {
            var lo = Infinity, hi = -Infinity, any = false;
            keys.forEach(function (k) {
                if (!seriesOn[k]) return;
                any = true;
                data[k].forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
            });
            return any ? { lo: lo, hi: hi } : null;
        }
        var btcS = spread(['mined', 'held']);
        var usdS = spread(['mining', 'hold']);
        var cntS = spread(['machines']);

        var btcAx = btcS ? scaleOver(0, btcS.hi, DIVS) : null;
        var usd = usdS ? scaleOver(Math.min(0, usdS.lo), Math.max(0, usdS.hi), DIVS) : null;
        var cnt = cntS ? scaleOver(0, cntS.hi, DIVS) : null;

        var pw = VB.w - PAD.l - PAD.r;
        var ph = VB.h - PAD.t - PAD.b;
        function X(i) { return PAD.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); }
        function Yof(sc, v) { return PAD.t + ph - ((v - sc.lo) / (sc.hi - sc.lo)) * ph; }
        function axisOf(a) { return a === 'usd' ? usd : a === 'btc' ? btcAx : cnt; }

        var p = [CHART_DEFS];

        for (var g = 0; g <= DIVS; g++) {
            var y = PAD.t + ph - (g / DIVS) * ph;
            p.push('<line x1="' + PAD.l + '" y1="' + y.toFixed(1) + '" x2="' + (VB.w - PAD.r) +
                   '" y2="' + y.toFixed(1) + '" class="ck-grid"/>');
            if (btcAx) {
                p.push('<text x="' + (PAD.l - 10) + '" y="' + y.toFixed(1) + '" class="ck-ylab">' +
                       (btcAx.lo + g * btcAx.step).toFixed(4) + '</text>');
            }
            if (usd) {
                p.push('<text x="' + (VB.w - PAD.r + 10) + '" y="' + y.toFixed(1) +
                       '" class="ck-ylab ck-ylab--r">' + moneyShort(usd.lo + g * usd.step) + '</text>');
            }
        }
        if (usd && usd.lo < 0 && usd.hi > 0) {
            p.push('<line x1="' + PAD.l + '" y1="' + Yof(usd, 0).toFixed(1) + '" x2="' + (VB.w - PAD.r) +
                   '" y2="' + Yof(usd, 0).toFixed(1) + '" class="ck-zero"/>');
        }
        if (btcAx) p.push('<text transform="translate(16,' + (PAD.t + ph / 2) + ') rotate(-90)" class="ck-axis">BTC (cumulative)</text>');
        if (usd) p.push('<text transform="translate(' + (VB.w - 12) + ',' + (PAD.t + ph / 2) + ') rotate(-90)" class="ck-axis">Net value (USD)</text>');

        /* Halvings, drawn as a small flag rather than floating text. */
        (r.halvingPeriodIdxs || []).forEach(function (h) {
            if (h.idx >= n) return;
            var hx = X(h.idx);
            p.push('<line x1="' + hx.toFixed(1) + '" y1="' + PAD.t + '" x2="' + hx.toFixed(1) +
                   '" y2="' + (PAD.t + ph) + '" class="ck-halving"/>');
            p.push('<rect class="ck-halvingflag" x="' + (hx - 52).toFixed(1) + '" y="' + (PAD.t - 22) +
                   '" width="104" height="15"/>');
            p.push('<text x="' + hx.toFixed(1) + '" y="' + (PAD.t - 11) +
                   '" class="ck-halvinglab">HALVING &#8594; ' + h.reward + '</text>');
        });

        /* Cumulative BTC, bucketed.

           One pair of bars per period put 120 shapes in the plot at the default
           60-month horizon — more than the gridlines, both curves, both areas
           and the halving marker together. Width was never the problem; each
           bar was still 5.7px. The problem is that both series only ever rise,
           so every bar is its neighbour one step taller and the run of them
           reads as a solid ramp with stripes cut into it. Past a halving the
           step drops below a pixel and stretches of it genuinely are one block.

           Capping the count near 24 keeps a bar wide enough to be a bar at any
           horizon, and leaves anything at or below 24 periods exactly as it was.

           Each bar carries the running total at the LAST period in its bucket.
           Not a sum — these are already cumulative and summing them would count
           the same coins repeatedly — and not a mean, which would understate
           where the series had actually got to. That distinction is the one way
           this could draw a convincing picture of the wrong quantity, so it has
           its own assertion rather than a comment. */
        var BAR_TARGET = 24;
        var bucket = Math.max(1, Math.ceil(n / BAR_TARGET));
        var bucketEnds = [];
        for (var be = bucket - 1; be < n; be += bucket) bucketEnds.push(be);
        /* A partial final bucket still ends at the last period, so the last bar
           is always the series total rather than whatever the last whole bucket
           happened to reach. */
        if (bucketEnds[bucketEnds.length - 1] !== n - 1) bucketEnds.push(n - 1);

        var barGroup = (pw / Math.max(1, bucketEnds.length)) * 0.72;
        var barW = Math.max(1.1, barGroup / 2);
        if (btcAx) {
            ['mined', 'held'].forEach(function (key, ki) {
                if (!seriesOn[key]) return;
                var grad = key === 'mined' ? 'ckBarMined' : 'ckBarHeld';
                var d = '';
                bucketEnds.forEach(function (idx) {
                    var v = data[key][idx];
                    if (!(v > 0)) return;
                    var bx = X(idx) - barGroup / 2 + ki * barW;
                    var by = Yof(btcAx, v);
                    d += 'M' + bx.toFixed(1) + ' ' + by.toFixed(1) + 'h' + barW.toFixed(1) +
                         'V' + (PAD.t + ph).toFixed(1) + 'h' + (-barW).toFixed(1) + 'Z';
                });
                if (d) p.push('<path d="' + d + '" fill="url(#' + grad + ')" stroke="none"/>');
            });
        }
        /* Curves, each with its own area beneath so the shape reads as mass
           rather than as a hairline. */
        var coords = {};
        function curve(key, lineCls, areaFill) {
            if (!seriesOn[key]) return;
            var sc = axisOf(SERIES.filter(function (x) { return x.key === key; })[0].axis);
            if (!sc) return;
            var xs = [], ys = [];
            for (var i = 0; i < n; i++) { xs.push(X(i)); ys.push(Yof(sc, data[key][i])); }
            coords[key] = { xs: xs, ys: ys };
            var line = smoothPath(xs, ys);
            if (areaFill) {
                var base = sc === usd && usd.lo < 0 && usd.hi > 0 ? Yof(usd, 0) : PAD.t + ph;
                p.push('<path d="' + line + 'L' + xs[n - 1].toFixed(1) + ' ' + base.toFixed(1) +
                       'L' + xs[0].toFixed(1) + ' ' + base.toFixed(1) + 'Z" fill="url(#' + areaFill +
                       ')" stroke="none"/>');
            }
            p.push('<path d="' + line + '" class="' + lineCls + '"/>');
        }
        curve('machines', 'ck-machines', null);
        curve('hold', 'ck-bench', 'ckAreaHold');
        curve('mining', 'ck-value', 'ckAreaMining');

        if (r.breakEvenPeriod && seriesOn.mining) {
            var bx = X(r.breakEvenPeriod - 1).toFixed(1);
            p.push('<line x1="' + bx + '" y1="' + PAD.t + '" x2="' + bx + '" y2="' +
                   (PAD.t + ph) + '" class="ck-be"/>');
        }

        /* Where each curve ends up, stated at the end of it. Saves reading a
           value off an axis for the one period anyone cares most about. */
        [['mining', 'ck-end-value'], ['hold', 'ck-end-bench']].forEach(function (pair) {
            var c = coords[pair[0]];
            if (!c) return;
            var ex = c.xs[n - 1], ey = c.ys[n - 1];
            p.push('<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="3.5" class="' + pair[1] + '"/>');
            p.push('<text x="' + (ex + 8).toFixed(1) + '" y="' + ey.toFixed(1) +
                   '" class="ck-endlab ' + pair[1] + '-lab">' +
                   moneyShort(data[pair[0]][n - 1]) + '</text>');
        });

        var everyX = Math.max(1, Math.ceil(n / 14));
        for (var t = 0; t < n; t++) {
            if (t % everyX !== 0 && t !== n - 1) continue;
            p.push('<text x="' + X(t).toFixed(1) + '" y="' + (VB.h - 16) + '" class="ck-xlab">' + (t + 1) + '</text>');
        }

        var colW = pw / Math.max(1, n - 1 || 1);
        for (var k = 0; k < n; k++) {
            p.push('<rect class="ck-hit" data-i="' + k + '" x="' + (X(k) - colW / 2).toFixed(1) +
                   '" y="' + PAD.t + '" width="' + colW.toFixed(1) + '" height="' + ph + '"/>');
        }
        p.push('<line id="ckCross" class="ck-cross" x1="0" y1="' + PAD.t + '" x2="0" y2="' +
               (PAD.t + ph) + '" style="display:none"/>');
        /* One dot per line series, parked until a period is hovered. */
        ['mining', 'hold', 'machines'].forEach(function (key) {
            p.push('<circle id="ckDot-' + key + '" class="ck-dot ck-dot--' + key +
                   '" r="4.5" cx="0" cy="0" style="display:none"/>');
        });

        svg.innerHTML = p.join('');
        lastFrame = { r: r, data: data, n: n, X: X, coords: coords, unit: r.periodConfig.labelSingular };
        drawLegend();
        hideTip();
    }
    /* ---------- legend ---------- */

    function drawLegend() {
        var box = $('calcLegend');
        if (!box) return;
        box.innerHTML = SERIES.map(function (sr) {
            return '<button type="button" class="cl-item' + (seriesOn[sr.key] ? '' : ' is-off') +
                   '" data-series="' + sr.key + '" aria-pressed="' + seriesOn[sr.key] + '">' +
                   '<span class="cl-key cl-key--' + sr.key + '"></span>' + esc(sr.label) + '</button>';
        }).join('');
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ---------- the readout ---------- */

    /* The readout is a strip under the plot, not a tooltip over it, so it is
       always on screen and never occludes the curve it describes. With nothing
       hovered it says how to use it rather than going blank, which would make
       the whole row appear and disappear as the pointer crosses the chart. */
    var READOUT_IDLE = '<span class="ct-idle">Hover the chart, or focus it and use the arrow keys, to read any period exactly.</span>';

    function hideTip() {
        var tip = $('calcTip');
        if (tip) tip.innerHTML = READOUT_IDLE;
        var cross = $('ckCross');
        if (cross) cross.style.display = 'none';
        ['mining', 'hold', 'machines'].forEach(function (key) {
            var dot = $('ckDot-' + key);
            if (dot) dot.style.display = 'none';
        });
    }

    function showTip(i) {
        var tip = $('calcTip');
        if (!tip || !lastFrame || i < 0 || i >= lastFrame.n) return;
        var f = lastFrame;
        var rows = SERIES.filter(function (sr) { return seriesOn[sr.key]; }).map(function (sr) {
            var v = f.data[sr.key][i];
            /* "(USD)" is redundant beside a value that already carries a
               dollar sign, and dropping it is what keeps all five readings on
               one row at the larger size. The legend still spells it out. */
            var label = sr.label.split(' (USD)').join('');
            var txt;
            if (sr.axis === 'usd') txt = money(v, 2);
            else if (sr.axis === 'btc') txt = btc(v, 8) + ' BTC';
            else txt = int(v);
            /* Label over value, the way the result tiles above are built. Side
               by side, a bigger number would push the labels apart until the
               row wrapped; stacked, each reading stays one column wide. */
            return '<span class="ct-item"><span class="cl-key cl-key--' + sr.key + '"></span>' +
                   '<span class="ct-body">' +
                   '<span class="ct-name">' + esc(label) + '</span>' +
                   '<span class="ct-num">' + txt + '</span></span></span>';
        }).join('');
        tip.innerHTML = '<span class="ct-head">' +
            f.unit.charAt(0).toUpperCase() + f.unit.slice(1) + ' ' + (i + 1) + '</span>' + rows;

        var cross = $('ckCross');
        if (cross) {
            cross.setAttribute('x1', f.X(i).toFixed(1));
            cross.setAttribute('x2', f.X(i).toFixed(1));
            cross.style.display = '';
        }
        /* A dot on each curve at the hovered period. The crosshair says which
           period; the dots say where each line actually is at it. */
        ['mining', 'hold', 'machines'].forEach(function (key) {
            var dot = $('ckDot-' + key);
            if (!dot) return;
            var c = f.coords && f.coords[key];
            if (!c || !seriesOn[key]) { dot.style.display = 'none'; return; }
            dot.setAttribute('cx', c.xs[i].toFixed(1));
            dot.setAttribute('cy', c.ys[i].toFixed(1));
            dot.style.display = '';
        });
    }

    /* ---------- render ---------- */

    /* Every figure the projection would have filled, emptied. Used when there is
       no fleet to project — better a row of dashes than a confident number
       describing a machine the reader does not have. */
    var OUT_IDS = [
        'outDailyProfit', 'outCostPerBtc', 'outBreakEven', 'outRoi',
        'outDailyRevenue', 'outDailyPower', 'outEfficiency', 'outFleetHash',
        'outFleetPower', 'outMachines', 'outHorizon', 'outInvestment',
        'outBtcMined', 'outPowerSpend', 'outTotalPl', 'outHeldBtc',
        'outHeldValue', 'outFinalPrice', 'outBenchmark', 'outAdvantage',
        'outOvertake', 'outVerdict',
    ];

    function blankResults() {
        OUT_IDS.forEach(function (id) {
            var n = $(id);
            if (!n) return;
            n.textContent = '—';
            n.classList.remove('is-up');
            n.classList.remove('is-down');
        });
        setText('outMachines', '0');
        var c = $('calcChart'); if (c) c.innerHTML = '';
        var t = $('calcTableBody'); if (t) t.innerHTML = '';
        setText('calcTableNote', '—');
        setText('chartCaption', '—');
    }

    function render() {
        if (typeof CalcEngine === 'undefined') return;
        var got = collect();
        var r = CalcEngine.computeProjection(got.settings);
        var p = r.params;
        var unit = r.periodConfig.label;
        var unit1 = r.periodConfig.labelSingular;

        // Energy mode shows its working: volume -> kW -> machines.
        var box = $('energyDerived');
        if (box) {
            if (got.derived) {
                var d = got.derived;
                setText('edKw', int(d.kw) + ' kW');
                setText('edMw', (d.kw / 1000).toFixed(2) + ' MW');
                setText('edMachines', int(d.machines));
                setText('edModel', el.minerModel.value === CUSTOM ? 'machines' : el.minerModel.value);
                if (d.basis !== 'mcfd') {
                    setText('edGas', '—');
                } else {
                    setText('edGas', int(d.raw) + ' Mcf/d');
                }
                box.hidden = false;
            } else {
                box.hidden = true;
            }
        }

        /* No fleet, no projection. The engine would happily return one machine's
           worth of revenue here; printing that would be answering a question
           nobody asked. */
        if (got.requested < 1) {
            blankResults();
            var w0 = $('calcWarn');
            if (w0) {
                w0.textContent = got.derived
                    ? 'That is not enough energy to run one ' +
                      (el.minerModel.value === CUSTOM ? 'machine' : el.minerModel.value) +
                      '. Raise the volume, or pick a machine that draws less.'
                    : 'Enter at least one machine.';
                w0.hidden = false;
            }
            return;
        }

        // Headline four.
        setSigned('outDailyProfit', money(r.dailyProfitDay1, 2), r.dailyProfitDay1);
        setText('outCostPerBtc', isFinite(r.costPerBTC) ? money(r.costPerBTC) : '—');
        /* Break-even has no magnitude to colour by, only a yes or no: paying
           back inside the horizon is the good outcome, never doing so is not. */
        setSigned('outBreakEven', r.breakEvenPeriod
            ? r.breakEvenPeriod + ' ' + (r.breakEvenPeriod === 1 ? unit1 : unit)
            : 'Not within ' + p.numPeriods + ' ' + unit,
            r.breakEvenPeriod ? 1 : -1);
        setSigned('outRoi', pct(r.roi), r.roi);
        /* "+445%" alone is meaningless without the window it was earned over —
           the same number across 60 months and across 6 is two different
           businesses. The tile therefore reads "+445%" over "over 60 months". */
        setText('outRoiSub', 'over ' + p.numPeriods + ' ' +
            (p.numPeriods === 1 ? unit1 : unit));

        // Day one.
        setText('outDailyRevenue', money(r.dailyRevenueDay1, 2));
        setText('outDailyPower', money(r.dailyElecDay1, 2));
        setText('outEfficiency', r.efficiency ? r.efficiency.toFixed(1) + ' J/TH' : '—');
        setText('outFleetHash', (p.hashrateTH * p.machineCount).toLocaleString('en-US',
            { maximumFractionDigits: 0 }) + ' TH/s');
        setText('outFleetPower', (p.powerKW * p.machineCount).toLocaleString('en-US',
            { maximumFractionDigits: 1 }) + ' kW');
        setText('outMachines', int(got.requested));

        // Over the horizon.
        setText('outHorizon', p.numPeriods + ' ' + (p.numPeriods === 1 ? unit1 : unit));
        setText('outInvestment', money(r.totalInitialInvestment));
        setText('outBtcMined', btc(r.cumulBtcMined) + ' BTC');
        setText('outPowerSpend', money(r.cumulElecCost));
        setSigned('outTotalPl', money(r.totalPL), r.totalPL);
        setText('outHeldBtc', btc(r.cumulBtcHeld) + ' BTC');
        setText('outHeldValue', money(r.heldBtcValue));
        setText('outFinalPrice', money(r.finalBtcPrice));

        // Benchmark. Not a Proton claim — just the obvious alternative use of the
        // same money, which the engine already computes.
        setSigned('outBenchmark', money(r.buyHoldFinalNet), r.buyHoldFinalNet);
        setSigned('outAdvantage', money(r.miningAdvantage), r.miningAdvantage);
        setText('outOvertake', r.overtakePeriod
            ? r.overtakePeriod + ' ' + (r.overtakePeriod === 1 ? unit1 : unit)
            : 'Not within ' + p.numPeriods + ' ' + unit);
        var verdict = $('outVerdict');
        if (verdict) {
            verdict.textContent = r.isMiningBetter
                ? 'Mining ahead of buying the same dollar of BTC'
                : 'Buying the same dollar of BTC ahead of mining';
            verdict.classList.toggle('is-up', r.isMiningBetter);
            verdict.classList.toggle('is-down', !r.isMiningBetter);
        }

        var warn = $('calcWarn');
        if (warn) {
            var msgs = [];
            if (p.elecCost === 0) {
                msgs.push('Power is set to $0.00/kWh, so nothing is being charged for electricity.');
            }
            warn.textContent = msgs.join(' ');
            warn.hidden = msgs.length === 0;
        }

        setText('chartCaption', 'Position after each ' + unit1 +
            ', against buying $' + int(r.totalInitialInvestment) + ' of BTC on day one.');

        drawChart(r);
        renderTable(r);
    }

    /* A compact period table, thinned to about 16 rows so a 730-period run does
       not emit 730 <tr>s. Halvings are always kept — that is the one row where
       the reward column changes and the reason the curve bends. */
    function renderTable(r) {
        var body = $('calcTableBody');
        if (!body) return;
        var rows = r.tableRows;
        var every = Math.max(1, Math.ceil(rows.length / 16));
        var out = [];
        rows.forEach(function (row, i) {
            var keep = (i % every === 0) || i === rows.length - 1 || row.isHalving;
            if (!keep) return;
            out.push('<tr' + (row.isHalving ? ' class="is-halving"' : '') + '>' +
                '<td>' + row.period + (row.isHalving ? ' <span class="tag">HALVING</span>' : '') + '</td>' +
                '<td>' + money(row.btcPrice) + '</td>' +
                '<td>' + row.diffT.toFixed(1) + ' T</td>' +
                '<td>' + int(row.machines) + '</td>' +
                '<td>' + btc(row.pnlBtc, 4) + '</td>' +
                '<td>' + money(row.elecCost) + '</td>' +
                '<td class="' + (row.netCashFlow >= 0 ? 'is-up' : 'is-down') + '">' +
                    money(row.netCashFlow) + '</td>' +
                '<td class="' + (row.cumulPL >= 0 ? 'is-up' : 'is-down') + '">' +
                    money(row.cumulPL) + '</td>' +
                '</tr>');
        });
        body.innerHTML = out.join('');
        setText('calcTableNote', rows.length > out.length
            ? 'Showing ' + out.length + ' of ' + rows.length + ' periods, plus every halving.'
            : 'All ' + rows.length + ' periods.');
    }

    /* ---------- live market data ----------

       The two market figures are fetched on load so the page opens on today's
       numbers rather than on whatever was true the day it was written. Both
       endpoints are public, keyless and CORS-open; nothing is sent but the
       request itself.

       This is the ONE outbound request the site makes, and it is a departure
       from the no-external-requests rule the rest of the site keeps — see the
       note in README.md. It is also the only thing here that can fail, so every
       path falls back to the seeded value silently: no error state, no empty
       field, just the figure the page shipped with. A calculator that refuses to
       open because an API is down would be worse than a slightly stale one. */

    var MARKET = {
        price: {
            url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
            read: function (body) {
                var j = JSON.parse(body);
                return j && j.data ? parseFloat(j.data.amount) : NaN;
            },
            field: 'btcPrice',
            format: function (v) { return String(Math.round(v)); },
        },
        difficulty: {
            /* Returns a bare number in absolute terms; the field is in trillions. */
            url: 'https://blockchain.info/q/getdifficulty',
            read: function (body) { return parseFloat(body) / 1e12; },
            field: 'difficulty',
            format: function (v) { return v.toFixed(2); },
        },
    };

    var marketLive = { price: false, difficulty: false };

    function noteMarket() {
        var note = $('marketNote');
        if (!note) return;
        if (marketLive.price && marketLive.difficulty) {
            note.innerHTML = '<strong>Live.</strong> BTC price and network difficulty were ' +
                'fetched when this page loaded. Everything else is an assumption you set.';
            note.classList.add('is-live');
        }
    }

    function fetchMarket() {
        if (typeof fetch !== 'function') return;
        Object.keys(MARKET).forEach(function (key) {
            var spec = MARKET[key];
            var node = el[spec.field];
            if (!node) return;
            /* Never stomp something the visitor has already typed. If the field
               no longer holds the value it shipped with, they have touched it. */
            /* A field carried in from a shared link was pinned on purpose:
               the sender meant that price, not today's. Diff-encoding already
               means a pinned value differs from its default, but relying on
               that coincidence would break the moment the encoding changes. */
            var untouched = !pinned[spec.field] &&
                node.value === node.getAttribute('data-default');
            fetch(spec.url, { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.text() : null; })
                .then(function (body) {
                    if (body === null) return;
                    var v = spec.read(body);
                    if (!isFinite(v) || v <= 0) return;
                    marketLive[key] = true;
                    if (untouched && node.value === node.getAttribute('data-default')) {
                        node.value = spec.format(v);
                        render();
                    }
                    noteMarket();
                })
                .catch(function () { /* seeded value stands */ });
        });
    }

    /* ---------- the scenario lives in the URL ----------

       Someone can spend real time tuning thirty-odd inputs here. Without this
       they cannot keep the result, send it to a colleague, or be sent one — and
       a reload throws it away. Encoding the state into the address makes the
       page shareable and reloadable at no cost to anyone who never uses it.

       Only what DIFFERS from the shipped defaults is written, so a page nobody
       has touched has a clean bare URL and a tweaked one stays short. The diff
       basis is the same `data-default` attribute the Reset button reads, rather
       than a second table of defaults that would drift away from the markup.

       Keys are the element ids. Longer than short codes, but there is no
       mapping to keep in sync and the URL is legible when something is wrong. */

    /* hodlSlider mirrors hodlRatio, so writing both would be writing the same
       number twice; it is restored from its partner instead. */
    var SCENARIO_SKIP = { mode: 1, hodlSlider: 1 };

    /* Fields restored from a link. fetchMarket must not overwrite these: the
       sender pinned a price on purpose, and today's price is not what they
       meant to send. */
    var pinned = {};

    function scenarioIds() {
        return IDS.filter(function (id) { return !SCENARIO_SKIP[id]; });
    }

    function encodeScenario() {
        var parts = [];
        if (isEnergyMode()) parts.push('mode=energy');

        /* A named model already implies its three spec fields, so they are only
           written when they no longer match it — which is exactly when someone
           has hand-edited them into a Custom machine. */
        var model = el.minerModel ? el.minerModel.value : null;
        var spec = (model && model !== CUSTOM && typeof MinerDB !== 'undefined')
            ? MinerDB.findByModel(model) : null;
        if (model && model !== DEFAULT_MODEL) {
            parts.push('minerModel=' + encodeURIComponent(model));
        }

        scenarioIds().forEach(function (id) {
            var n = el[id];
            if (!n || id === 'minerModel') return;
            var def = n.getAttribute('data-default');
            if (def === null) return;
            if (n.type === 'checkbox') {
                if (!!n.checked !== (def === 'true')) parts.push(id + '=' + (n.checked ? '1' : '0'));
                return;
            }
            if (spec) {
                if (id === 'hashrate' && Number(n.value) === spec.hashrate) return;
                if (id === 'power' && Number(n.value) === spec.power) return;
                if (id === 'capex' && Number(n.value) === spec.cost) return;
            }
            if (String(n.value) !== String(def)) {
                parts.push(id + '=' + encodeURIComponent(n.value));
            }
        });
        return parts.join('&');
    }

    /* Forgiving on the way in: an unknown key is ignored rather than thrown on,
       so a link made by an older version of this page still opens. Values go
       through the same num() guards everything else does. */
    function applyScenario() {
        if (typeof location === 'undefined') return 'machines';
        var q = String(location.search || '');
        if (q.charAt(0) === '?') q = q.slice(1);
        if (!q) return 'machines';

        var params = {};
        q.split('&').forEach(function (kv) {
            if (!kv) return;
            var i = kv.indexOf('=');
            var k = i < 0 ? kv : kv.slice(0, i);
            var raw = i < 0 ? '' : kv.slice(i + 1);
            try { params[k] = decodeURIComponent(raw.split('+').join(' ')); }
            catch (e) { params[k] = raw; }
        });

        /* The model goes first because selecting one rewrites the three spec
           fields. Anything explicit in the link is applied after, so a
           hand-edited machine wins over the model it started from. */
        if (params.minerModel && el.minerModel) {
            el.minerModel.value = params.minerModel;
            if (el.minerModel.value === params.minerModel) applyMinerModel();
            pinned.minerModel = true;
        }

        scenarioIds().forEach(function (id) {
            if (!(id in params)) return;
            var n = el[id];
            if (!n || id === 'minerModel') return;
            if (n.type === 'checkbox') n.checked = params[id] === '1';
            else n.value = params[id];
            pinned[id] = true;
        });

        if (el.hodlSlider && el.hodlRatio) {
            el.hodlSlider.value = String(Math.min(100, Math.max(0, num(el.hodlRatio.value, 0))));
        }
        return params.mode === 'energy' ? 'energy' : 'machines';
    }

    /* The address bar tracks the scenario so copying from it is always correct,
       and replaceState rather than pushState so the back button is not filled
       with one entry per keystroke. Debounced for the same reason. */
    var urlTimer = null;
    function syncUrl() {
        if (typeof history === 'undefined' || !history.replaceState) return;
        if (urlTimer) clearTimeout(urlTimer);
        urlTimer = setTimeout(function () {
            var q = encodeScenario();
            try {
                history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
            } catch (e) { /* file:// refuses; the copy button still works */ }
        }, 400);
    }

    function scenarioUrl() {
        var q = encodeScenario();
        var base = String(location.href).split('?')[0].split('#')[0];
        return base + (q ? '?' + q : '');
    }

    function wireCopy() {
        var btn = $('calcCopy');
        if (!btn) return;
        var label = btn.textContent;
        var revert = null;
        function say(msg) {
            btn.textContent = msg;
            if (revert) clearTimeout(revert);
            revert = setTimeout(function () { btn.textContent = label; }, 2600);
        }
        btn.addEventListener('click', function () {
            var url = scenarioUrl();
            /* navigator.clipboard needs a secure context — https or localhost.
               Anywhere else it is absent or rejects, and the honest fallback is
               to say so rather than to claim a copy that did not happen. */
            var clip = (typeof navigator !== 'undefined') && navigator.clipboard;
            if (!clip || !clip.writeText) { say('Copy it from the address bar'); return; }
            clip.writeText(url).then(function () { say('Link copied'); },
                                     function () { say('Copy it from the address bar'); });
        });
    }
    /* ---------- chart interaction ---------- */

    function wireChart() {
        var svg = $('calcChart');
        var legend = $('calcLegend');
        var plot = $('calcPlot');
        if (!svg) return;
        var at = -1;

        /* The pointer lands on a hit column that already knows its own index, so
           there is nothing to convert and nothing to measure. */
        svg.addEventListener('mouseover', function (e) {
            var hit = e.target.closest && e.target.closest('.ck-hit');
            if (!hit) return;
            at = parseInt(hit.getAttribute('data-i'), 10);
            showTip(at);
        });
        if (plot) {
            plot.addEventListener('mouseleave', function () { at = -1; hideTip(); });
        }

        /* Same readout by keyboard. A chart that only answers a mouse is a chart
           half the people who need the number cannot use. */
        svg.addEventListener('focus', function () {
            if (lastFrame && at < 0) { at = 0; showTip(0); }
        });
        svg.addEventListener('blur', hideTip);
        svg.addEventListener('keydown', function (e) {
            if (!lastFrame) return;
            var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (e.key === 'Home') at = 0;
            else if (e.key === 'End') at = lastFrame.n - 1;
            else if (step) at = Math.min(lastFrame.n - 1, Math.max(0, (at < 0 ? 0 : at) + step));
            else if (e.key === 'Escape') { at = -1; hideTip(); return; }
            else return;
            e.preventDefault();
            showTip(at);
        });

        /* Legend entries toggle their series, as the desk tool's do. Toggling
           re-renders because the hidden series must also stop setting the
           scale — otherwise turning one off leaves the axis stretched around
           something nobody can see. */
        if (legend) {
            legend.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('[data-series]');
                if (!b) return;
                seriesOn[b.getAttribute('data-series')] = !seriesOn[b.getAttribute('data-series')];
                render();
            });
        }
    }

    /* ---------- mode switch ---------- */

    function setMode(mode) {
        var btns = el.mode.querySelectorAll('[data-mode]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].setAttribute('aria-pressed', String(btns[i].dataset.mode === mode));
        }
        document.querySelectorAll('[data-when]').forEach(function (n) {
            n.hidden = n.dataset.when !== mode;
        });
        render();
    }

    /* ---------- wiring ---------- */

    function init() {
        IDS.forEach(function (id) { el[id] = $(id); });
        if (!el.mode || typeof CalcEngine === 'undefined') return;

        fillMinerModels();

        el.minerModel.addEventListener('change', function () {
            applyMinerModel();
            render();
        });
        [el.hashrate, el.power, el.capex].forEach(function (n) {
            n.addEventListener('input', markCustom);
        });

        el.mode.addEventListener('click', function (e) {
            var b = e.target.closest('[data-mode]');
            if (b) { setMode(b.dataset.mode); syncUrl(); }
        });

        // Every control re-runs the projection. It is a few hundred
        // multiplications over at most 730 periods — cheap enough to do on
        // each keystroke rather than behind a Calculate button.
        IDS.forEach(function (id) {
            var n = el[id];
            if (!n || id === 'mode') return;
            n.addEventListener('input', render);
            n.addEventListener('change', render);
        });

        /* Slider and number box are two views of one value. Each writes the
           other; render() then reads hodlRatio as it always did, so the engine
           never learns there are two controls. */
        el.hodlSlider.addEventListener('input', function () {
            el.hodlRatio.value = el.hodlSlider.value;
        });
        el.hodlRatio.addEventListener('input', function () {
            var v = num(el.hodlRatio.value, 0);
            el.hodlSlider.value = String(Math.min(100, Math.max(0, v)));
        });

        /* Tax rates are meaningless with the toggle off, so they are removed
           rather than greyed — the same reveal the desk tool does. */
        function syncTax() {
            document.querySelectorAll('[data-needs-tax]').forEach(function (n) {
                n.hidden = !el.taxAdjustment.checked;
            });
        }
        el.taxAdjustment.addEventListener('change', syncTax);
        syncTax();

        /* "Number of Periods" is counted in whatever the period is, so the unit
           beside it has to follow the selector. Left as a literal "months" it
           reads as a flat lie the moment anyone picks Daily. */
        function syncPeriodUnit() {
            var cfg = CalcEngine.PERIOD_CONFIG[el.periodLength.value];
            document.querySelectorAll('[data-period-unit]').forEach(function (n) {
                n.textContent = cfg ? cfg.label : 'periods';
            });
        }
        el.periodLength.addEventListener('change', syncPeriodUnit);
        syncPeriodUnit();

        var reset = $('calcReset');
        if (reset) {
            reset.addEventListener('click', function () {
                document.querySelectorAll('[data-default]').forEach(function (n) {
                    if (n.type === 'checkbox') n.checked = n.dataset.default === 'true';
                    else n.value = n.dataset.default;
                });
                el.minerModel.value = DEFAULT_MODEL;
                applyMinerModel();
                /* Reset means reset: drop the pins so live data resumes, and
                   clear the query so the address stops describing a scenario
                   that no longer exists. */
                pinned = {};
                setMode('machines');
                syncUrl();
            });
        }

        /* Wired once. Doing this anywhere that runs more than once stacks a
           second set of listeners on the same nodes every time. */
        wireChart();
        wireCopy();

        /* A shared link is applied before the first render, so the page never
           paints the defaults and then jumps to the scenario. */
        var startMode = applyScenario();
        IDS.forEach(function (id) {
            var node = el[id];
            if (!node || id === 'mode') return;
            node.addEventListener('input', syncUrl);
            node.addEventListener('change', syncUrl);
        });
        setMode(startMode);
        fetchMarket();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();