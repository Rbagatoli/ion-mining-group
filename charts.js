// ===== ION MINING GROUP — Charts Page =====

initNav('charts');

var statusEl = document.getElementById('chartsStatus');
var diffChartInstance = null;
var hashChartInstance = null;

// Live value display elements
var priceValueEl = document.getElementById('priceValue');
var diffValueEl = document.getElementById('diffValue');
var hashValueEl = document.getElementById('hashValue');

// Cached mining data — fetched once, filtered client-side
var allMiningData = null;

// Track latest values for reset on mouse leave
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

function formatMonthYear(ts) {
    var d = new Date(ts * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
}

// ===== Value formatters =====

function formatDiffValue(v) {
    return v.toFixed(2) + ' T';
}
function formatHashValue(v) {
    return v.toFixed(1) + ' EH/s';
}

// ===== Label maps =====

var miningTfLabels = { '3m': '3 Months', '6m': '6 Months', '1y': '1 Year', '3y': '3 Years', 'all': 'All Time' };
var miningTfDays = { '3m': 90, '6m': 180, '1y': 365, '3y': 1095, 'all': Infinity };

// ===== Button helpers =====

function setActiveButton(container, btn) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    btn.classList.add('active');
}

// ===== Filter mining data by timeframe =====

function filterMiningArray(arr, timeKey, tfDays) {
    if (tfDays === Infinity) return arr;
    var cutoff = (Date.now() / 1000) - (tfDays * 24 * 60 * 60);
    return arr.filter(function(item) { return item[timeKey] >= cutoff; });
}

// ===== Fetch current BTC price for title display =====

async function fetchCurrentPrice() {
    // Try CoinGecko simple price (single value, no history needed)
    try {
        var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        if (res.ok) {
            var json = await res.json();
            return json.bitcoin.usd;
        }
    } catch (e) { /* try next */ }

    // Fallback: CryptoCompare
    try {
        var res2 = await fetch('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD');
        if (res2.ok) {
            var json2 = await res2.json();
            return json2.USD;
        }
    } catch (e) { /* give up */ }

    return null;
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

// ===== Initial data load =====

(async function() {
    statusEl.textContent = 'Loading chart data...';

    var priceOk = false;
    var miningOk = false;

    // Fetch current BTC price for title display (TradingView widget handles the chart)
    try {
        var price = await fetchCurrentPrice();
        if (price) {
            if (priceValueEl) priceValueEl.textContent = '$' + Math.round(price).toLocaleString();
            priceOk = true;
        }
    } catch (e) { /* non-critical */ }

    // Fetch mining data for difficulty and hashrate charts
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

    if (miningOk) {
        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#4ade80';
    }
})();

// PWA Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=10').catch(function() {});
}
