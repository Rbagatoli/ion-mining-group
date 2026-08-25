// ===== PROTON MINING — Cycle Page =====
// Valuation and cycle-position indicators built on the shared price history.
//
// FRAMING RULE: nothing here predicts price. Every reading is phrased as historical context
// ("historically cheap", "rarely this stretched") — never as advice, a target, or a forecast.

initNav('cycle');

var statusEl = document.getElementById('cycleStatus');

// Module caches
var priceSeries = null;      // full daily series, ascending
var fngSeries = null;        // [{ time, value }]
var mayerAll = null;
var drawdownAll = null;
var puellAll = null;

// Chart instances
var valuationChart = null, mayerChart = null, drawdownChart = null;
var cyclesChart = null, fngChart = null, dcaChart = null;

// Current ranges
var currentValuationRange = 'max';
var currentMayerRange = 'max';
var currentFngRange = 365;

var CI = CycleIndicators;

// ===== SHARED CHART OPTIONS =====
// Built as a function so the palette re-derives on theme change (Chart.js bakes colours in).
function buildOpts() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
            }
        },
        scales: {
            x: {
                ticks: { maxTicksLimit: 10 },
                grid: {}
            },
            y: {
                ticks: {},
                grid: {}
            }
        }
    };
}
var opts = buildOpts();

function gridCol() { return isLightMode() ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; }
function tickCol() { return isLightMode() ? '#6b7280' : '#888'; }

// ===== HELPERS =====

function fmtDay(ts) {
    var d = new Date(ts * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCFullYear().toString().slice(2);
}

function fmtFullDay(ts) {
    var d = new Date(ts * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

// Downsample while always pinning the most recent point (the same fix applied on charts.js —
// stepping by N rarely lands on the final sample, which made headline readouts stale).
function sampleIdx(len, maxPoints) {
    var step = Math.max(1, Math.floor(len / maxPoints));
    var idxs = [];
    for (var i = 0; i < len; i += step) idxs.push(i);
    if (idxs.length && idxs[idxs.length - 1] !== len - 1) idxs.push(len - 1);
    return idxs;
}

function sliceByRange(series, range) {
    if (range === 'max') return series;
    return CI.isoDay ? series.slice(Math.max(0, series.length - range)) : series;
}

function setActive(container, btn) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    btn.classList.add('active');
}

// Colour a percentile bar: low percentile = green (historically cheap), high = orange/red.
function pctColor(pct, invert) {
    var p = invert ? 100 - pct : pct;
    if (p <= 25) return 'var(--pos)';
    if (p <= 60) return '#f7931a';
    return 'var(--neg)';
}

function setCard(ids, value, sub, readingText, pct, invert) {
    var v = document.getElementById(ids.value);
    if (v) v.textContent = value;
    if (ids.sub) {
        var s = document.getElementById(ids.sub);
        if (s) s.textContent = sub;
    }
    var r = document.getElementById(ids.reading);
    if (r) r.textContent = readingText;
    var bar = document.getElementById(ids.bar);
    if (bar && pct !== null && pct !== undefined) {
        bar.style.width = Math.max(2, Math.min(100, pct)).toFixed(0) + '%';
        bar.style.background = pctColor(pct, invert);
    }
}

function pctLabel(pct) {
    if (pct === null || pct === undefined) return '';
    return Math.round(pct) + 'th percentile of history';
}

// ===== "WHERE WE ARE" CARDS =====

function renderPositionCards() {
    if (!priceSeries || priceSeries.length < 400) return;

    // --- Drawdown from ATH ---
    var dd = CI.currentDrawdown(priceSeries);
    var ddVals = drawdownAll.map(function(d) { return d.value; });
    var ddPct = CI.percentileOf(ddVals, dd.pct);
    setCard(
        { value: 'ciDrawdown', sub: 'ciDrawdownSub', reading: 'ciDrawdownRead', bar: 'ciDrawdownBar' },
        dd.pct.toFixed(1) + '%',
        'ATH ' + fmtUSD(dd.athPrice) + ' · ' + dd.daysSince + 'd ago',
        dd.pct > -10
            ? 'Near the all-time high. Historically, sustained periods this close to the top have been uncommon.'
            : dd.pct < -70
                ? 'A drawdown this deep has only occurred at major cycle lows in this record.'
                : 'Well below the peak but not at the extremes seen in past bear markets.',
        ddPct, false
    );
    document.getElementById('ciDrawdown').className = 'value ' + (dd.pct > -20 ? 'positive' : 'negative');

    // --- Mayer Multiple ---
    var mNow = mayerAll[mayerAll.length - 1].value;
    var mVals = mayerAll.map(function(d) { return d.value; });
    var mPct = CI.percentileOf(mVals, mNow);
    setCard(
        { value: 'ciMayer', sub: 'ciMayerSub', reading: 'ciMayerRead', bar: 'ciMayerBar' },
        mNow.toFixed(2),
        'price ÷ 200-day average',
        mNow < 0.8 ? 'Below 0.8 — in this record that band has only appeared during heavy capitulation.'
            : mNow < 1 ? 'Below the 200-day average, which historically marks a discounted phase.'
            : mNow > 2.4 ? 'Above 2.4 — historically an overheated, rarely-sustained reading.'
            : 'Around or modestly above its long-run average.',
        mPct, false
    );
    document.getElementById('ciMayer').className = 'value ' + (mNow < 1 ? 'positive' : mNow > 2.4 ? 'negative' : 'neutral');

    // --- Price vs 200-week MA ---
    var ma1400 = CI.movingAverage(priceSeries, 1400);
    var last = priceSeries.length - 1;
    if (ma1400[last]) {
        var ratio = priceSeries[last].close / ma1400[last];
        var ratios = [];
        for (var i = 0; i < priceSeries.length; i++) {
            if (ma1400[i]) ratios.push(priceSeries[i].close / ma1400[i]);
        }
        var rPct = CI.percentileOf(ratios, ratio);
        setCard(
            { value: 'ciMa200w', sub: 'ciMa200wSub', reading: 'ciMa200wRead', bar: 'ciMa200wBar' },
            ratio.toFixed(2) + '×',
            '200w avg ' + fmtUSD(ma1400[last]),
            ratio < 1 ? 'Below the 200-week average. Price has spent very little of its history here.'
                : ratio < 1.3 ? 'Close to the 200-week average, a level that has often acted as a floor.'
                : 'Well above the 200-week average.',
            rPct, false
        );
        document.getElementById('ciMa200w').className = 'value ' + (ratio < 1.3 ? 'positive' : 'neutral');
    }

    // --- Puell Multiple ---
    if (puellAll && puellAll.length) {
        var pNow = puellAll[puellAll.length - 1].value;
        var pVals = puellAll.map(function(d) { return d.value; });
        var pPct = CI.percentileOf(pVals, pNow);
        setCard(
            { value: 'ciPuell', reading: 'ciPuellRead', bar: 'ciPuellBar' },
            pNow.toFixed(2), null,
            pNow < 0.5 ? 'Miner revenue far below its yearly norm — historically a stressed, late-bear condition.'
                : pNow > 4 ? 'Miner revenue far above its yearly norm — historically an overheated condition.'
                : 'Miner revenue near its own yearly average.',
            pPct, false
        );
        document.getElementById('ciPuell').className = 'value ' + (pNow < 1 ? 'positive' : pNow > 4 ? 'negative' : 'neutral');
    }

    // --- Volatility ---
    var vol = CI.volatility(priceSeries, 30);
    if (vol !== null) {
        var volHist = [];
        for (var v = 400; v < priceSeries.length; v++) {
            var w = CI.volatility(priceSeries.slice(0, v + 1), 30);
            if (w !== null) volHist.push(w);
        }
        var vPct = CI.percentileOf(volHist, vol);
        setCard(
            { value: 'ciVol', reading: 'ciVolRead', bar: 'ciVolBar' },
            vol.toFixed(1) + '%', null,
            vPct < 20 ? 'Unusually calm compared with Bitcoin’s own history.'
                : vPct > 80 ? 'Unusually turbulent compared with its own history.'
                : 'Typical for Bitcoin.',
            vPct, false
        );
        document.getElementById('ciVol').className = 'value neutral';
    }
}

function renderFngCard() {
    if (!fngSeries || !fngSeries.length) {
        setCard({ value: 'ciFng', sub: 'ciFngSub', reading: 'ciFngRead', bar: 'ciFngBar' },
            'N/A', 'unavailable', 'Sentiment data could not be loaded.', null, false);
        return;
    }
    var f = fngSeries[fngSeries.length - 1];
    var vals = fngSeries.map(function(d) { return d.value; });
    var fPct = CI.percentileOf(vals, f.value);
    var band = f.value <= 24 ? 'Extreme Fear' : f.value <= 44 ? 'Fear'
        : f.value <= 55 ? 'Neutral' : f.value <= 75 ? 'Greed' : 'Extreme Greed';
    setCard(
        { value: 'ciFng', sub: 'ciFngSub', reading: 'ciFngRead', bar: 'ciFngBar' },
        String(f.value), band,
        f.value <= 24 ? 'Crowd sentiment at an extreme low. Historically these readings clustered near lows.'
            : f.value >= 76 ? 'Crowd sentiment at an extreme high. Historically these clustered near highs.'
            : 'Sentiment is not at an extreme.',
        fPct, false
    );
    document.getElementById('ciFng').className = 'value ' + (f.value <= 44 ? 'positive' : f.value >= 76 ? 'negative' : 'neutral');
}

// ===== VALUATION CHART (price + 200DMA + 200WMA, log) =====

function renderValuationChart(range) {
    if (!priceSeries) return;
    var ma200 = CI.movingAverage(priceSeries, 200);
    var ma1400 = CI.movingAverage(priceSeries, 1400);

    var startIdx = (range === 'max') ? 0 : Math.max(0, priceSeries.length - range);
    var idxs = sampleIdx(priceSeries.length - startIdx, 500).map(function(i) { return i + startIdx; });

    var mult = getCurrencyMultiplier();
    var labels = [], px = [], m200 = [], m1400 = [];
    for (var k = 0; k < idxs.length; k++) {
        var i = idxs[k];
        labels.push(fmtDay(priceSeries[i].time));
        px.push(+(priceSeries[i].close * mult).toFixed(2));
        m200.push(ma200[i] ? +(ma200[i] * mult).toFixed(2) : null);
        m1400.push(ma1400[i] ? +(ma1400[i] * mult).toFixed(2) : null);
    }

    var el = document.getElementById('valuationValue');
    if (el) el.textContent = getCurrencySymbol() + Math.round(px[px.length - 1]).toLocaleString();
    document.getElementById('valuationTitle').textContent =
        'Price vs Moving Averages (' + (range === 'max' ? 'All Time' : range === 1095 ? '3 Years' : '1 Year') + ')';

    if (valuationChart) valuationChart.destroy();
    var o = buildOpts();
    o.plugins.legend = { display: true, position: 'top', labels: {} };
    o.scales.y = {
        type: 'logarithmic',
        ticks: {
            color: tickCol(), font: { size: 11 },
            callback: function(v) {
                var s = getCurrencySymbol();
                if (v >= 1e6) return s + (v / 1e6).toFixed(1) + 'M';
                if (v >= 1e3) return s + (v / 1e3).toFixed(0) + 'k';
                return s + v;
            }
        },
        grid: { color: gridCol() }
    };
    o.plugins.tooltip.callbacks = {
        label: function(ctx) {
            if (ctx.parsed.y === null) return null;
            return ctx.dataset.label + ': ' + getCurrencySymbol() + Math.round(ctx.parsed.y).toLocaleString();
        }
    };

    valuationChart = new Chart(document.getElementById('valuationChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Price', data: px, borderColor: '#f7931a', backgroundColor: 'rgba(247,147,26,0.08)', fill: true, borderWidth: 1.6, pointRadius: 0, tension: 0 },
                { label: '200-day avg', data: m200, borderColor: ProtonTheme.seriesAt(1), backgroundColor: 'transparent', fill: false, borderWidth: 1.6, pointRadius: 0, tension: 0, spanGaps: false },
                { label: '200-week avg', data: m1400, borderColor: ProtonTheme.pos, backgroundColor: 'transparent', fill: false, borderWidth: 2, pointRadius: 0, tension: 0, spanGaps: false }
            ]
        },
        options: o
    });
}

// ===== MAYER MULTIPLE CHART =====

function renderMayerChart(range) {
    if (!mayerAll) return;
    var series = (range === 'max') ? mayerAll : mayerAll.slice(Math.max(0, mayerAll.length - range));
    var idxs = sampleIdx(series.length, 500);
    var labels = [], vals = [];
    for (var k = 0; k < idxs.length; k++) {
        labels.push(fmtDay(series[idxs[k]].time));
        vals.push(+series[idxs[k]].value.toFixed(3));
    }

    var el = document.getElementById('mayerValue');
    if (el) el.textContent = vals[vals.length - 1].toFixed(2);
    document.getElementById('mayerTitle').textContent =
        'Mayer Multiple (' + (range === 'max' ? 'All Time' : range === 1095 ? '3 Years' : '1 Year') + ')';

    if (mayerChart) mayerChart.destroy();
    var o = buildOpts();
    o.scales.y = {
        ticks: { color: tickCol(), font: { size: 11 }, callback: function(v) { return v.toFixed(1) + '×'; } },
        grid: { color: gridCol() }
    };
    o.plugins.tooltip.callbacks = { label: function(ctx) { return 'Mayer ' + ctx.parsed.y.toFixed(2); } };

    // Reference bands at 1.0 (long-run average) and 2.4 (historically overheated)
    var bandPlugin = {
        id: 'mayerBands',
        beforeDatasetsDraw: function(chart) {
            var y = chart.scales.y, a = chart.chartArea, ctx = chart.ctx;
            if (!y || !a) return;
            [[1.0, 'rgba(96,165,250,0.35)'], [2.4, 'var(--neg-line)'], [0.8, 'var(--pos-line)']].forEach(function(b) {
                var py = y.getPixelForValue(b[0]);
                if (py < a.top || py > a.bottom) return;
                ctx.save();
                ctx.beginPath(); ctx.setLineDash([5, 4]); ctx.strokeStyle = b[1]; ctx.lineWidth = 1;
                ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
                ctx.fillStyle = b[1]; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
                ctx.fillText(b[0].toFixed(1) + '×', a.left + 4, py - 3);
                ctx.restore();
            });
        }
    };

    mayerChart = new Chart(document.getElementById('mayerChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Mayer Multiple', data: vals, borderColor: ProtonTheme.pos, backgroundColor: ProtonTheme.alpha(ProtonTheme.pos, 0.08), fill: true, borderWidth: 1.6, pointRadius: 0, tension: 0 }] },
        options: o,
        plugins: [bandPlugin]
    });
}

// ===== DRAWDOWN CHART =====

function renderDrawdownChart() {
    if (!drawdownAll) return;
    var idxs = sampleIdx(drawdownAll.length, 600);
    var labels = [], vals = [];
    for (var k = 0; k < idxs.length; k++) {
        labels.push(fmtDay(drawdownAll[idxs[k]].time));
        vals.push(+drawdownAll[idxs[k]].value.toFixed(2));
    }
    var el = document.getElementById('drawdownValue');
    if (el) el.textContent = vals[vals.length - 1].toFixed(1) + '%';

    if (drawdownChart) drawdownChart.destroy();
    var o = buildOpts();
    o.scales.y = {
        max: 0,
        ticks: { color: tickCol(), font: { size: 11 }, callback: function(v) { return v.toFixed(0) + '%'; } },
        grid: { color: gridCol() }
    };
    o.plugins.tooltip.callbacks = { label: function(ctx) { return ctx.parsed.y.toFixed(1) + '% from ATH'; } };

    drawdownChart = new Chart(document.getElementById('drawdownChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Drawdown', data: vals, borderColor: ProtonTheme.neg, backgroundColor: ProtonTheme.alpha(ProtonTheme.neg, 0.12), fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0 }] },
        options: o
    });
}

// ===== HALVING CYCLE OVERLAY =====

function renderCyclesChart() {
    if (!priceSeries) return;
    var tracks = CI.halvingCycles(priceSeries, PriceHistory.HALVING_DATES, 1400);
    if (!tracks.length) return;

    var maxLen = 0;
    tracks.forEach(function(t) { maxLen = Math.max(maxLen, t.points.length); });
    var idxs = sampleIdx(maxLen, 400);
    var labels = idxs.map(function(i) { return 'Day ' + i; });

    var colors = [ProtonTheme.seriesAt(1), ProtonTheme.seriesAt(2), ProtonTheme.seriesAt(0)];
    var datasets = tracks.map(function(t, n) {
        var data = idxs.map(function(i) { return t.points[i] ? +t.points[i].value.toFixed(2) : null; });
        var isCurrent = (n === tracks.length - 1);
        return {
            label: t.label,
            data: data,
            borderColor: colors[n % colors.length],
            backgroundColor: 'transparent',
            fill: false,
            borderWidth: isCurrent ? 2.4 : 1.5,
            pointRadius: 0,
            tension: 0,
            spanGaps: false
        };
    });

    var cur = tracks[tracks.length - 1];
    var el = document.getElementById('cyclesValue');
    if (el) el.textContent = 'Day ' + cur.points[cur.points.length - 1].day + ' of current cycle';

    if (cyclesChart) cyclesChart.destroy();
    var o = buildOpts();
    o.plugins.legend = { display: true, position: 'top', labels: {} };
    o.scales.y = {
        type: 'logarithmic',
        ticks: { color: tickCol(), font: { size: 11 }, callback: function(v) { return v + '%'; } },
        grid: { color: gridCol() }
    };
    o.plugins.tooltip.callbacks = {
        label: function(ctx) {
            if (ctx.parsed.y === null) return null;
            return ctx.dataset.label + ': ' + Math.round(ctx.parsed.y) + '% of halving-day price';
        }
    };

    cyclesChart = new Chart(document.getElementById('cyclesChart'), {
        type: 'line', data: { labels: labels, datasets: datasets }, options: o
    });
}

// ===== FEAR & GREED =====

async function loadFearGreed() {
    try {
        var res = await fetch('https://api.alternative.me/fng/?limit=0');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (!json || !Array.isArray(json.data)) throw new Error('bad payload');
        // API returns newest-first; normalise to ascending like every other series here
        fngSeries = json.data.map(function(d) {
            return { time: parseInt(d.timestamp, 10), value: parseInt(d.value, 10) };
        }).filter(function(d) {
            return isFinite(d.time) && isFinite(d.value);
        }).sort(function(a, b) { return a.time - b.time; });
        return true;
    } catch (e) {
        fngSeries = null;
        return false;
    }
}

function renderFngChart(range) {
    if (!fngSeries || !fngSeries.length || !priceSeries) return;
    var series = (range === 'max') ? fngSeries : fngSeries.slice(Math.max(0, fngSeries.length - range));
    var idxs = sampleIdx(series.length, 500);

    // Align price to the same days for the overlay
    var priceByDay = {};
    for (var p = 0; p < priceSeries.length; p++) {
        priceByDay[Math.floor(priceSeries[p].time / 86400)] = priceSeries[p].close;
    }
    var mult = getCurrencyMultiplier();

    var labels = [], fng = [], px = [];
    for (var k = 0; k < idxs.length; k++) {
        var e = series[idxs[k]];
        labels.push(fmtDay(e.time));
        fng.push(e.value);
        var pv = priceByDay[Math.floor(e.time / 86400)];
        px.push(pv ? +(pv * mult).toFixed(2) : null);
    }

    var el = document.getElementById('fngValue');
    if (el) el.textContent = fng[fng.length - 1];
    document.getElementById('fngTitle').textContent =
        'Fear & Greed vs Price (' + (range === 'max' ? 'All Time' : range === 1095 ? '3 Years' : '1 Year') + ')';

    if (fngChart) fngChart.destroy();
    var o = buildOpts();
    o.plugins.legend = { display: true, position: 'top', labels: {} };
    o.scales.y = {
        min: 0, max: 100, position: 'left',
        ticks: {},
        grid: { color: gridCol() }
    };
    o.scales.y1 = {
        type: 'logarithmic', position: 'right',
        ticks: {
            color: '#f7931a', font: { size: 11 },
            callback: function(v) {
                var s = getCurrencySymbol();
                if (v >= 1e3) return s + (v / 1e3).toFixed(0) + 'k';
                return s + v;
            }
        },
        grid: { display: false }
    };

    fngChart = new Chart(document.getElementById('fngChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Fear & Greed', data: fng, borderColor: ProtonTheme.seriesAt(2), backgroundColor: ProtonTheme.alpha(ProtonTheme.seriesAt(2), 0.10), fill: true, borderWidth: 1.5, pointRadius: 0, tension: 0, yAxisID: 'y' },
                { label: 'Price', data: px, borderColor: '#f7931a', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, pointRadius: 0, tension: 0, yAxisID: 'y1', spanGaps: true }
            ]
        },
        options: o
    });
}

// ===== DCA BACKTEST =====

function renderDca() {
    if (!priceSeries) return;
    var amount = parseFloat(document.getElementById('dcaAmount').value) || 100;
    var everyDays = parseInt(document.getElementById('dcaFrequency').value, 10) || 7;
    var startDate = document.getElementById('dcaStart').value || '2020-01-01';

    var r = CI.dcaBacktest(priceSeries, { amount: amount, everyDays: everyDays, startDate: startDate });
    var box = document.getElementById('dcaResults');
    if (!r) {
        box.innerHTML = '<div class="empty-state" style="padding:16px;"><p>No data for that start date</p></div>';
        if (dcaChart) { dcaChart.destroy(); dcaChart = null; }
        return;
    }

    var mult = getCurrencyMultiplier();
    var roiClass = r.roiPct >= 0 ? 'positive' : 'negative';
    box.innerHTML =
        card('Invested', fmtUSD(r.invested * mult), r.buys + ' buys since ' + r.startDate, 'neutral') +
        card('BTC Accumulated', fmtBTC(r.btc, 6), 'avg cost ' + fmtUSD(r.avgCost * mult), 'btc-orange') +
        card('Value Today', fmtUSD(r.value * mult), (r.roiPct >= 0 ? '+' : '') + r.roiPct.toFixed(0) + '%', roiClass) +
        card('Lump Sum Instead', fmtUSD(r.lumpSumValue * mult), 'all-in on day one: ' + (r.lumpSumRoiPct >= 0 ? '+' : '') + r.lumpSumRoiPct.toFixed(0) + '%', 'neutral');

    renderDcaChart(amount, everyDays, r.startDate, mult);
}

function card(label, value, sub, cls) {
    return '<div class="metric-card">' +
        '<div class="label">' + label + '</div>' +
        '<div class="value ' + cls + '">' + value + '</div>' +
        '<div class="sub">' + sub + '</div>' +
        '</div>';
}

function renderDcaChart(amount, everyDays, startDate, mult) {
    var startIdx = -1;
    for (var i = 0; i < priceSeries.length; i++) {
        if (CI.isoDay(priceSeries[i].time) >= startDate) { startIdx = i; break; }
    }
    if (startIdx < 0) return;

    // Walk forward accumulating, recording invested vs portfolio value at each step
    var btc = 0, invested = 0;
    var pts = [];
    for (var k = startIdx; k < priceSeries.length; k++) {
        if ((k - startIdx) % everyDays === 0) { btc += amount / priceSeries[k].close; invested += amount; }
        pts.push({ time: priceSeries[k].time, invested: invested, value: btc * priceSeries[k].close });
    }

    var idxs = sampleIdx(pts.length, 400);
    var labels = [], inv = [], val = [];
    for (var j = 0; j < idxs.length; j++) {
        labels.push(fmtDay(pts[idxs[j]].time));
        inv.push(+(pts[idxs[j]].invested * mult).toFixed(2));
        val.push(+(pts[idxs[j]].value * mult).toFixed(2));
    }

    if (dcaChart) dcaChart.destroy();
    var o = buildOpts();
    o.plugins.legend = { display: true, position: 'top', labels: {} };
    o.scales.y = {
        ticks: {
            color: tickCol(), font: { size: 11 },
            callback: function(v) {
                var s = getCurrencySymbol();
                if (v >= 1e6) return s + (v / 1e6).toFixed(1) + 'M';
                if (v >= 1e3) return s + (v / 1e3).toFixed(0) + 'k';
                return s + v;
            }
        },
        grid: { color: gridCol() }
    };
    o.plugins.tooltip.callbacks = {
        label: function(ctx) { return ctx.dataset.label + ': ' + fmtUSD(ctx.parsed.y); }
    };

    dcaChart = new Chart(document.getElementById('dcaChart'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Portfolio value', data: val, borderColor: '#f7931a', backgroundColor: 'rgba(247,147,26,0.10)', fill: true, borderWidth: 1.8, pointRadius: 0, tension: 0 },
                { label: 'Total invested', data: inv, borderColor: '#8c8c8c', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: [4, 4] }
            ]
        },
        options: o
    });
}

// ===== RANGE BUTTONS =====

document.getElementById('valuationRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button'); if (!btn) return;
    setActive(this, btn);
    currentValuationRange = btn.dataset.days === 'max' ? 'max' : parseInt(btn.dataset.days, 10);
    renderValuationChart(currentValuationRange);
});

document.getElementById('mayerRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button'); if (!btn) return;
    setActive(this, btn);
    currentMayerRange = btn.dataset.days === 'max' ? 'max' : parseInt(btn.dataset.days, 10);
    renderMayerChart(currentMayerRange);
});

document.getElementById('fngRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button'); if (!btn) return;
    setActive(this, btn);
    currentFngRange = btn.dataset.days === 'max' ? 'max' : parseInt(btn.dataset.days, 10);
    renderFngChart(currentFngRange);
});

['dcaAmount', 'dcaFrequency', 'dcaStart'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', renderDca);
});
document.getElementById('dcaAmount').addEventListener('input', renderDca);

// ===== THEME / CURRENCY =====


window.onCurrencyChange = function() {
    renderPositionCards();
    renderAllCharts();
};

function renderAllCharts() {
    if (!priceSeries) return;
    renderValuationChart(currentValuationRange);
    renderMayerChart(currentMayerRange);
    renderDrawdownChart();
    renderCyclesChart();
    renderFngChart(currentFngRange);
    renderDca();
}

// ===== INIT =====

(async function init() {
    statusEl.textContent = 'Loading price history…';
    try {
        priceSeries = await PriceHistory.fetchPriceHistory(function(page) {
            statusEl.textContent = 'Loading price history… (' + page + ')';
        });
    } catch (e) {
        statusEl.textContent = 'Could not load price history';
        statusEl.style.color = 'var(--neg)';
        return;
    }
    if (!priceSeries || priceSeries.length < 400) {
        statusEl.textContent = 'Not enough price history for these indicators';
        statusEl.style.color = '#f7931a';
        return;
    }

    // Precompute the derived series once — every card and chart reads from these
    mayerAll = CI.mayerSeries(priceSeries);
    drawdownAll = CI.drawdownSeries(priceSeries);
    puellAll = CI.puellSeries(priceSeries, PriceHistory.getBlockReward);

    renderPositionCards();
    renderValuationChart(currentValuationRange);
    renderMayerChart(currentMayerRange);
    renderDrawdownChart();
    renderCyclesChart();
    renderDca();

    var first = CI.isoDay(priceSeries[0].time);
    if (PriceHistory.isStale()) {
        statusEl.textContent = 'Cached · price data from ' + CI.isoDay(priceSeries[priceSeries.length - 1].time);
        statusEl.style.color = '#f7931a';
    } else {
        statusEl.textContent = priceSeries.length.toLocaleString() + ' days of history since ' + first;
        statusEl.style.color = 'var(--pos)';
    }

    // Sentiment is a separate host — load it after the core page is already usable
    var ok = await loadFearGreed();
    renderFngCard();
    if (ok) renderFngChart(currentFngRange);
})();
