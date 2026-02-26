// ===== ION MINING GROUP — Charts Page =====

initNav('charts');

var statusEl = document.getElementById('chartsStatus');

var chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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

function formatDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatMonthYear(ts) {
    var d = new Date(ts * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
}

(async function() {
    statusEl.textContent = 'Loading chart data...';

    try {
        var [priceRes, miningRes] = await Promise.all([
            fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90'),
            fetch('https://mempool.space/api/v1/mining/hashrate/1y')
        ]);

        // BTC Price Chart
        if (priceRes.ok) {
            var priceData = await priceRes.json();
            var prices = priceData.prices || [];
            var priceLabels = [];
            var priceValues = [];
            // Sample every ~6 hours to keep chart clean
            var step = Math.max(1, Math.floor(prices.length / 90));
            for (var i = 0; i < prices.length; i += step) {
                priceLabels.push(formatDate(prices[i][0]));
                priceValues.push(Math.round(prices[i][1]));
            }

            new Chart(document.getElementById('priceChart'), {
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
        }

        // Difficulty + Hashrate Charts
        if (miningRes.ok) {
            var miningData = await miningRes.json();

            // Difficulty
            var diffs = miningData.difficulty || [];
            var diffLabels = [];
            var diffValues = [];
            for (var d = 0; d < diffs.length; d++) {
                diffLabels.push(formatMonthYear(diffs[d].time));
                diffValues.push(parseFloat((diffs[d].difficulty / 1e12).toFixed(2)));
            }

            new Chart(document.getElementById('difficultyChart'), {
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

            new Chart(document.getElementById('hashrateChart'), {
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
        }

        statusEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#4ade80';

    } catch (e) {
        statusEl.textContent = 'Failed to load chart data: ' + e.message;
        statusEl.style.color = '#f55';
    }
})();

// PWA Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=10').catch(function() {});
}
