// ===== ION MINING GROUP — Charts Page =====

initNav('charts');

var statusEl = document.getElementById('chartsStatus');
var priceChartInstance = null;
var diffChartInstance = null;
var hashChartInstance = null;

// Live value display elements
var priceValueEl = document.getElementById('priceValue');
var diffValueEl = document.getElementById('diffValue');
var hashValueEl = document.getElementById('hashValue');

// Cached raw data — fetched once, filtered client-side
var allPriceData = null;
var allMiningData = null;

// Track latest values for reset on mouse leave
var latestPrice = null;
var latestDiff = null;
var latestHash = null;

var chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(10, 10, 10, 0.92)',
            borderColor: 'rgba(255, 255, 255, 0.10)',
            borderWidth: 1,
            titleColor: '#e8e8e8',
            bodyColor: '#e8e8e8',
            padding: 10
        }
    },
    scales: {
        x: {
            ticks: { color: '#888', font: { size: 11 }, maxTicksLimit: 12 },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y: {
            ticks: { color: '#888', font: { size: 11 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
        }
    }
};

// ===== Date formatters =====

function formatDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatMonthYear(ts) {
    var d = new Date(ts * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
}

function formatFullDate(ts) {
    var d = new Date(ts);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// ===== Value formatters =====

function formatPriceValue(v) {
    return '$' + Math.round(v).toLocaleString();
}
function formatDiffValue(v) {
    return v.toFixed(2) + ' T';
}
function formatHashValue(v) {
    return v.toFixed(1) + ' EH/s';
}

// ===== Label maps =====

var priceDaysLabels = { '7': '7 Days', '30': '30 Days', '90': '90 Days', '180': '6 Months', '365': '1 Year', 'max': 'All Time' };
var miningTfLabels = { '3m': '3 Months', '6m': '6 Months', '1y': '1 Year', '3y': '3 Years', 'all': 'All Time' };
var miningTfDays = { '3m': 90, '6m': 180, '1y': 365, '3y': 1095, 'all': Infinity };

// ===== Button helpers =====

function setActiveButton(container, btn) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    btn.classList.add('active');
}

// ===== Filter price data by days =====
// allPriceData format: [{time: unixSec, close: price}, ...]

function filterPriceData(prices, days) {
    if (days === 'max') return prices;
    var cutoff = (Date.now() / 1000) - (days * 24 * 60 * 60);
    return prices.filter(function(p) { return p.time >= cutoff; });
}

// ===== Filter mining data by timeframe =====

function filterMiningArray(arr, timeKey, tfDays) {
    if (tfDays === Infinity) return arr;
    var cutoff = (Date.now() / 1000) - (tfDays * 24 * 60 * 60);
    return arr.filter(function(item) { return item[timeKey] >= cutoff; });
}

// ===== Fetch BTC price from Binance (paginated) =====

async function fetchBinanceKlines(baseUrl) {
    var BINANCE_START = 1502928000000; // Aug 17 2017 00:00 UTC
    var LIMIT = 1000;
    var allKlines = [];
    var startTime = BINANCE_START;

    while (true) {
        var url = baseUrl + '/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=' + startTime + '&limit=' + LIMIT;
        var res = await fetch(url);
        if (!res.ok) throw new Error('Binance API error ' + res.status);
        var klines = await res.json();
        if (!klines.length) break;

        for (var i = 0; i < klines.length; i++) {
            allKlines.push({
                time: klines[i][0] / 1000,
                close: parseFloat(klines[i][4])
            });
        }

        if (klines.length < LIMIT) break;
        startTime = klines[klines.length - 1][0] + 86400000;
    }

    return allKlines;
}

async function fetchCryptoCompareFallback() {
    var res = await fetch('https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&allData=true');
    if (!res.ok) throw new Error('CryptoCompare API error ' + res.status);
    var json = await res.json();
    return (json.Data && json.Data.Data) || [];
}

async function fetchPriceData() {
    // Try Binance.com, then Binance.us, then CryptoCompare as fallback
    var endpoints = ['https://api.binance.com', 'https://api.binance.us'];
    for (var i = 0; i < endpoints.length; i++) {
        try {
            var data = await fetchBinanceKlines(endpoints[i]);
            if (data.length > 0) return data;
        } catch (e) { /* try next */ }
    }
    // Final fallback: CryptoCompare
    return fetchCryptoCompareFallback();
}

// ===== Render BTC Price Chart =====

function renderPriceChart(days) {
    if (!allPriceData) return;

    var filtered = filterPriceData(allPriceData, days);
    var priceLabels = [];
    var priceValues = [];

    var maxPoints = 120;
    var step = Math.max(1, Math.floor(filtered.length / maxPoints));
    for (var i = 0; i < filtered.length; i += step) {
        var tsMs = filtered[i].time * 1000;
        if (days === 'max' || days >= 365) {
            priceLabels.push(formatFullDate(tsMs));
        } else {
            priceLabels.push(formatDate(tsMs));
        }
        priceValues.push(Math.round(filtered[i].close));
    }

    // Set latest value
    latestPrice = priceValues[priceValues.length - 1];
    if (priceValueEl) priceValueEl.textContent = formatPriceValue(latestPrice);

    if (priceChartInstance) priceChartInstance.destroy();

    priceChartInstance = new Chart(document.getElementById('priceChart'), {
        type: 'line',
        data: {
            labels: priceLabels,
            datasets: [{
                label: 'BTC Price (USD)',
                data: priceValues,
                borderColor: '#f7931a',
                backgroundColor: 'rgba(247, 147, 26, 0.10)',
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: Object.assign({}, chartOptions, {
            scales: Object.assign({}, chartOptions.scales, {
                y: {
                    ticks: {
                        color: '#f7931a',
                        font: { size: 11 },
                        callback: function(v) {
                            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'k';
                            return '$' + v;
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                }
            }),
            plugins: Object.assign({}, chartOptions.plugins, {
                tooltip: Object.assign({}, chartOptions.plugins.tooltip, {
                    callbacks: {
                        label: function(ctx) { return '$' + ctx.parsed.y.toLocaleString(); }
                    },
                    external: function(context) {
                        var tooltip = context.tooltip;
                        if (tooltip.opacity === 0) {
                            if (priceValueEl && latestPrice != null) priceValueEl.textContent = formatPriceValue(latestPrice);
                            return;
                        }
                        if (tooltip.dataPoints && tooltip.dataPoints.length > 0) {
                            if (priceValueEl) priceValueEl.textContent = formatPriceValue(tooltip.dataPoints[0].parsed.y);
                        }
                    }
                })
            })
        }),
        plugins: [{
            id: 'priceMouseLeave',
            beforeEvent: function(chart, args) {
                if (args.event.type === 'mouseout' && priceValueEl && latestPrice != null) {
                    priceValueEl.textContent = formatPriceValue(latestPrice);
                }
            }
        }]
    });

    document.getElementById('priceTitle').textContent = 'BTC Price (' + priceDaysLabels[days] + ')';
}

// ===== Render Difficulty Chart =====

function renderDifficultyChart(timeframe) {
    if (!allMiningData) return;

    var tfDays = miningTfDays[timeframe];
    var diffs = filterMiningArray(allMiningData.difficulty || [], 'time', tfDays);
    var diffLabels = [];
    var diffValues = [];
    for (var d = 0; d < diffs.length; d++) {
        diffLabels.push(formatMonthYear(diffs[d].time));
        diffValues.push(parseFloat((diffs[d].difficulty / 1e12).toFixed(2)));
    }

    // Set latest value
    latestDiff = diffValues[diffValues.length - 1];
    if (diffValueEl) diffValueEl.textContent = formatDiffValue(latestDiff);

    if (diffChartInstance) diffChartInstance.destroy();

    diffChartInstance = new Chart(document.getElementById('difficultyChart'), {
        type: 'line',
        data: {
            labels: diffLabels,
            datasets: [{
                label: 'Difficulty (T)',
                data: diffValues,
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.10)',
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                stepped: 'after',
                tension: 0
            }]
        },
        options: Object.assign({}, chartOptions, {
            scales: Object.assign({}, chartOptions.scales, {
                y: {
                    ticks: {
                        color: '#4ade80',
                        font: { size: 11 },
                        callback: function(v) { return v.toFixed(0) + ' T'; }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                }
            }),
            plugins: Object.assign({}, chartOptions.plugins, {
                tooltip: Object.assign({}, chartOptions.plugins.tooltip, {
                    callbacks: {
                        label: function(ctx) { return ctx.parsed.y.toFixed(2) + ' T'; }
                    },
                    external: function(context) {
                        var tooltip = context.tooltip;
                        if (tooltip.opacity === 0) {
                            if (diffValueEl && latestDiff != null) diffValueEl.textContent = formatDiffValue(latestDiff);
                            return;
                        }
                        if (tooltip.dataPoints && tooltip.dataPoints.length > 0) {
                            if (diffValueEl) diffValueEl.textContent = formatDiffValue(tooltip.dataPoints[0].parsed.y);
                        }
                    }
                })
            })
        }),
        plugins: [{
            id: 'diffMouseLeave',
            beforeEvent: function(chart, args) {
                if (args.event.type === 'mouseout' && diffValueEl && latestDiff != null) {
                    diffValueEl.textContent = formatDiffValue(latestDiff);
                }
            }
        }]
    });

    document.getElementById('diffTitle').textContent = 'Network Difficulty (' + miningTfLabels[timeframe] + ')';
}

// ===== Render Hashrate Chart =====

function renderHashrateChart(timeframe) {
    if (!allMiningData) return;

    var tfDays = miningTfDays[timeframe];
    var hashes = filterMiningArray(allMiningData.hashrates || [], 'timestamp', tfDays);
    var hashLabels = [];
    var hashValues = [];
    for (var h = 0; h < hashes.length; h++) {
        hashLabels.push(formatMonthYear(hashes[h].timestamp));
        hashValues.push(parseFloat((hashes[h].avgHashrate / 1e18).toFixed(1)));
    }

    // Set latest value
    latestHash = hashValues[hashValues.length - 1];
    if (hashValueEl) hashValueEl.textContent = formatHashValue(latestHash);

    if (hashChartInstance) hashChartInstance.destroy();

    hashChartInstance = new Chart(document.getElementById('hashrateChart'), {
        type: 'line',
        data: {
            labels: hashLabels,
            datasets: [{
                label: 'Hashrate (EH/s)',
                data: hashValues,
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.10)',
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: Object.assign({}, chartOptions, {
            scales: Object.assign({}, chartOptions.scales, {
                y: {
                    ticks: {
                        color: '#60a5fa',
                        font: { size: 11 },
                        callback: function(v) { return v.toFixed(0) + ' EH/s'; }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                }
            }),
            plugins: Object.assign({}, chartOptions.plugins, {
                tooltip: Object.assign({}, chartOptions.plugins.tooltip, {
                    callbacks: {
                        label: function(ctx) { return ctx.parsed.y.toFixed(1) + ' EH/s'; }
                    },
                    external: function(context) {
                        var tooltip = context.tooltip;
                        if (tooltip.opacity === 0) {
                            if (hashValueEl && latestHash != null) hashValueEl.textContent = formatHashValue(latestHash);
                            return;
                        }
                        if (tooltip.dataPoints && tooltip.dataPoints.length > 0) {
                            if (hashValueEl) hashValueEl.textContent = formatHashValue(tooltip.dataPoints[0].parsed.y);
                        }
                    }
                })
            })
        }),
        plugins: [{
            id: 'hashMouseLeave',
            beforeEvent: function(chart, args) {
                if (args.event.type === 'mouseout' && hashValueEl && latestHash != null) {
                    hashValueEl.textContent = formatHashValue(latestHash);
                }
            }
        }]
    });

    document.getElementById('hashTitle').textContent = 'Network Hashrate (' + miningTfLabels[timeframe] + ')';
}

// ===== Button click handlers =====

document.getElementById('priceRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    setActiveButton(this, btn);
    var days = btn.dataset.days === 'max' ? 'max' : parseInt(btn.dataset.days);
    renderPriceChart(days);
});

document.getElementById('miningRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    setActiveButton(this, btn);
    renderDifficultyChart(btn.dataset.tf);
});

document.getElementById('hashRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    setActiveButton(this, btn);
    renderHashrateChart(btn.dataset.tf);
});

// ===== Initial data load — fetch once, render from cache =====

(async function() {
    statusEl.textContent = 'Loading chart data...';

    var priceOk = false;
    var miningOk = false;

    // Fetch price and mining data independently so one failure doesn't block the other
    try {
        var priceData = await fetchPriceData();
        if (priceData && priceData.length > 0) {
            allPriceData = priceData;
            renderPriceChart(90);
            priceOk = true;
        } else {
            statusEl.textContent = 'No price data received';
            statusEl.style.color = '#f55';
        }
    } catch (e) {
        statusEl.textContent = 'Price load failed: ' + e.message;
        statusEl.style.color = '#f55';
    }

    try {
        var miningRes = await fetch('https://mempool.space/api/v1/mining/hashrate/all');
        if (miningRes.ok) {
            allMiningData = await miningRes.json();
            renderDifficultyChart('1y');
            renderHashrateChart('1y');
            miningOk = true;
        } else {
            statusEl.textContent = 'Mining API error ' + miningRes.status;
            statusEl.style.color = '#f55';
        }
    } catch (e) {
        statusEl.textContent = 'Mining load failed: ' + e.message;
        statusEl.style.color = '#f55';
    }

    if (priceOk && miningOk) {
        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#4ade80';
    }
})();

// PWA Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=10').catch(function() {});
}
