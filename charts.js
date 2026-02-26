// ===== ION MINING GROUP — Charts Page =====

initNav('charts');

var statusEl = document.getElementById('chartsStatus');
var priceChartInstance = null;
var diffChartInstance = null;
var hashChartInstance = null;
var loading = false;

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

// ===== Range label maps =====

var priceDaysLabels = { '7': '7 Days', '30': '30 Days', '90': '90 Days', '180': '6 Months', '365': '1 Year', 'max': 'All Time' };
var miningTfLabels = { '3m': '3 Months', '6m': '6 Months', '1y': '1 Year', '3y': '3 Years', 'all': 'All Time' };

// ===== Button state helpers =====

function setButtonsDisabled(container, disabled) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = disabled;
}

function setActiveButton(container, btn) {
    var btns = container.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    btn.classList.add('active');
}

// ===== BTC Price Chart =====

async function loadPriceChart(days) {
    var priceRangeEl = document.getElementById('priceRange');
    setButtonsDisabled(priceRangeEl, true);
    statusEl.textContent = 'Loading price data...';
    statusEl.style.color = '#555';

    try {
        var url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=' + days;
        var res = await fetch(url);
        if (!res.ok) throw new Error('CoinGecko API error ' + res.status);

        var data = await res.json();
        var prices = data.prices || [];
        var priceLabels = [];
        var priceValues = [];

        // Adaptive sampling: ~120 points max for clean chart
        var maxPoints = 120;
        var step = Math.max(1, Math.floor(prices.length / maxPoints));
        for (var i = 0; i < prices.length; i += step) {
            // Use full date for longer ranges, short date for short ranges
            if (days === 'max' || days >= 365) {
                priceLabels.push(formatFullDate(prices[i][0]));
            } else {
                priceLabels.push(formatDate(prices[i][0]));
            }
            priceValues.push(Math.round(prices[i][1]));
        }

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
                        }
                    })
                })
            })
        });

        document.getElementById('priceTitle').textContent = 'BTC Price (' + priceDaysLabels[days] + ')';
        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#4ade80';

    } catch (e) {
        statusEl.textContent = 'Price load failed: ' + e.message;
        statusEl.style.color = '#f55';
    }

    setButtonsDisabled(priceRangeEl, false);
}

// ===== Difficulty + Hashrate Charts =====

async function loadMiningCharts(timeframe) {
    var miningRangeEl = document.getElementById('miningRange');
    setButtonsDisabled(miningRangeEl, true);
    statusEl.textContent = 'Loading mining data...';
    statusEl.style.color = '#555';

    try {
        var url = 'https://mempool.space/api/v1/mining/hashrate/' + timeframe;
        var res = await fetch(url);
        if (!res.ok) throw new Error('Mempool API error ' + res.status);

        var miningData = await res.json();

        // Difficulty
        var diffs = miningData.difficulty || [];
        var diffLabels = [];
        var diffValues = [];
        for (var d = 0; d < diffs.length; d++) {
            diffLabels.push(formatMonthYear(diffs[d].time));
            diffValues.push(parseFloat((diffs[d].difficulty / 1e12).toFixed(2)));
        }

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
                        }
                    })
                })
            })
        });

        // Hashrate
        var hashes = miningData.hashrates || [];
        var hashLabels = [];
        var hashValues = [];
        for (var h = 0; h < hashes.length; h++) {
            hashLabels.push(formatMonthYear(hashes[h].timestamp));
            hashValues.push(parseFloat((hashes[h].avgHashrate / 1e18).toFixed(1)));
        }

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
                        }
                    })
                })
            })
        });

        document.getElementById('diffTitle').textContent = 'Network Difficulty (' + miningTfLabels[timeframe] + ')';
        document.getElementById('hashTitle').textContent = 'Network Hashrate (' + miningTfLabels[timeframe] + ')';
        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#4ade80';

    } catch (e) {
        statusEl.textContent = 'Mining data load failed: ' + e.message;
        statusEl.style.color = '#f55';
    }

    setButtonsDisabled(miningRangeEl, false);
}

// ===== Button click handlers =====

document.getElementById('priceRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    setActiveButton(this, btn);
    loadPriceChart(btn.dataset.days);
});

document.getElementById('miningRange').addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    setActiveButton(this, btn);
    loadMiningCharts(btn.dataset.tf);
});

// ===== Initial load =====

loadPriceChart(90);
loadMiningCharts('1y');

// PWA Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=10').catch(function() {});
}
