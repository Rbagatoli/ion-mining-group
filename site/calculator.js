/* ===== ION MINING GROUP — Public mining calculator =====

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

   The gas conversion is Ion's own, lifted from site-engine.js: 1,000 BTU per
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
        'poolFee', 'uptime', 'hodlRatio', 'minerLifespan', 'salvageValue',
        'minerAdditions', 'btcTreasury', 'infrastructureCost',
        'miningIncomeTaxRate', 'capitalGainsTaxRate',
        'autoReplace', 'additionCapex', 'reinvest', 'savingsElec', 'taxAdjustment',
    ];

    /* Ion's gas->power constants, matching site-engine.js. Defaults only; the
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
        el.minerModel.value = 'Antminer S21 Hyd.';
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
        return { settings: s, derived: derived };
    }

    /* ---------- the chart ----------
       Straight SVG against a fixed viewBox. Nothing is measured; the browser
       scales the whole thing to whatever width the column happens to be. */

    var VB = { w: 1000, h: 330 };
    var PAD = { l: 74, r: 18, t: 18, b: 34 };

    function niceStep(range, targetTicks) {
        if (!(range > 0)) return 1;
        var raw = range / targetTicks;
        var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var norm = raw / mag;
        var step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
        return step * mag;
    }

    function drawChart(r) {
        var svg = $('calcChart');
        if (!svg) return;
        var value = r.series.usdValue;
        var bench = r.series.buyHold;
        var n = value.length;
        if (!n) { svg.innerHTML = ''; return; }

        var all = value.concat(bench).concat([0]);
        var lo = Math.min.apply(null, all);
        var hi = Math.max.apply(null, all);
        if (hi === lo) { hi = lo + 1; }
        var step = niceStep(hi - lo, 4);
        lo = Math.floor(lo / step) * step;
        hi = Math.ceil(hi / step) * step;

        var pw = VB.w - PAD.l - PAD.r;
        var ph = VB.h - PAD.t - PAD.b;
        function X(i) { return PAD.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); }
        function Y(v) { return PAD.t + ph - ((v - lo) / (hi - lo)) * ph; }

        var parts = [];

        // Horizontal gridlines and their money labels.
        for (var g = lo; g <= hi + step * 0.001; g += step) {
            var y = Y(g).toFixed(1);
            var isZero = Math.abs(g) < step * 1e-6;
            parts.push('<line x1="' + PAD.l + '" y1="' + y + '" x2="' + (VB.w - PAD.r) +
                       '" y2="' + y + '" class="' + (isZero ? 'ck-zero' : 'ck-grid') + '"/>');
            parts.push('<text x="' + (PAD.l - 10) + '" y="' + y + '" class="ck-ylab">' +
                       moneyShort(g) + '</text>');
        }

        // Period ticks, thinned so the axis never crowds.
        var everyX = Math.max(1, Math.ceil(n / 12));
        for (var i = 0; i < n; i++) {
            if (i % everyX !== 0 && i !== n - 1) continue;
            parts.push('<text x="' + X(i).toFixed(1) + '" y="' + (VB.h - 10) +
                       '" class="ck-xlab">' + (i + 1) + '</text>');
        }

        function path(arr) {
            var d = '';
            for (var i = 0; i < arr.length; i++) {
                d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(arr[i]).toFixed(1);
            }
            return d;
        }

        // Benchmark first so the mining line reads on top of it.
        parts.push('<path d="' + path(bench) + '" class="ck-bench"/>');
        parts.push('<path d="' + path(value) + '" class="ck-value"/>');

        // Break-even, where the position first crosses zero.
        if (r.breakEvenPeriod) {
            var bx = X(r.breakEvenPeriod - 1).toFixed(1);
            parts.push('<line x1="' + bx + '" y1="' + PAD.t + '" x2="' + bx + '" y2="' +
                       (PAD.t + ph) + '" class="ck-be"/>');
            parts.push('<text x="' + bx + '" y="' + (PAD.t - 5) + '" class="ck-belab">BREAK-EVEN</text>');
        }

        svg.innerHTML = parts.join('');
    }

    /* ---------- render ---------- */

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

        // Headline four.
        setSigned('outDailyProfit', money(r.dailyProfitDay1, 2), r.dailyProfitDay1);
        setText('outCostPerBtc', isFinite(r.costPerBTC) ? money(r.costPerBTC) : '—');
        setText('outBreakEven', r.breakEvenPeriod
            ? r.breakEvenPeriod + ' ' + (r.breakEvenPeriod === 1 ? unit1 : unit)
            : 'Not within ' + p.numPeriods + ' ' + unit);
        setSigned('outRoi', pct(r.roi), r.roi);

        // Day one.
        setText('outDailyRevenue', money(r.dailyRevenueDay1, 2));
        setText('outDailyPower', money(r.dailyElecDay1, 2));
        setText('outEfficiency', r.efficiency ? r.efficiency.toFixed(1) + ' J/TH' : '—');
        setText('outFleetHash', (p.hashrateTH * p.machineCount).toLocaleString('en-US',
            { maximumFractionDigits: 0 }) + ' TH/s');
        setText('outFleetPower', (p.powerKW * p.machineCount).toLocaleString('en-US',
            { maximumFractionDigits: 1 }) + ' kW');
        setText('outMachines', int(p.machineCount));

        // Over the horizon.
        setText('outHorizon', p.numPeriods + ' ' + (p.numPeriods === 1 ? unit1 : unit));
        setText('outInvestment', money(r.totalInitialInvestment));
        setText('outBtcMined', btc(r.cumulBtcMined) + ' BTC');
        setText('outPowerSpend', money(r.cumulElecCost));
        setSigned('outTotalPl', money(r.totalPL), r.totalPL);
        setText('outHeldBtc', btc(r.cumulBtcHeld) + ' BTC');
        setText('outHeldValue', money(r.heldBtcValue));
        setText('outFinalPrice', money(r.finalBtcPrice));

        // Benchmark. Not an Ion claim — just the obvious alternative use of the
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

        // Warn rather than silently projecting a fleet of nothing.
        var warn = $('calcWarn');
        if (warn) {
            var msgs = [];
            if (p.machineCount < 1) {
                msgs.push('That is not enough power for one machine of this model. ' +
                          'Raise the volume, or pick a smaller miner.');
            }
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
            if (b) setMode(b.dataset.mode);
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

        // The tax rates only mean anything with the toggle on.
        el.taxAdjustment.addEventListener('change', function () {
            document.querySelectorAll('[data-needs-tax]').forEach(function (n) {
                n.classList.toggle('is-off', !el.taxAdjustment.checked);
            });
        });

        var adv = $('advToggle');
        if (adv) {
            adv.addEventListener('click', function () {
                var open = adv.getAttribute('aria-expanded') === 'true';
                adv.setAttribute('aria-expanded', String(!open));
                $('advPanel').hidden = open;
            });
        }

        var reset = $('calcReset');
        if (reset) {
            reset.addEventListener('click', function () {
                document.querySelectorAll('[data-default]').forEach(function (n) {
                    if (n.type === 'checkbox') n.checked = n.dataset.default === 'true';
                    else n.value = n.dataset.default;
                });
                el.minerModel.value = 'Antminer S21 Hyd.';
                applyMinerModel();
                setMode('machines');
            });
        }

        setMode('machines');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
