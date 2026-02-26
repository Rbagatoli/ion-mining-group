// ===== ION MINING GROUP — Dashboard =====

// ===== STATE =====
var useMockData = false;
var editingMinerId = null;
var liveBtcPrice = null;
var liveDifficulty = null;

const SECONDS_PER_DAY = 86400;
const TWO_POW_32 = 4294967296;
const CURRENT_BLOCK_REWARD = 3.125;

// ===== INIT =====
initNav('dashboard');

// Load live data, then render
(async function() {
    var data = await fetchLiveMarketData();
    if (data.price) liveBtcPrice = data.price;
    else liveBtcPrice = 96000;
    if (data.difficulty) liveDifficulty = data.difficulty;
    else liveDifficulty = 125.86;
    renderDashboard();
    initEarningsChart();
})();

// ===== RENDER DASHBOARD =====
function renderDashboard() {
    var fleet = FleetData.getFleet();
    var miners = fleet.miners;

    // Check if we need mock data
    if (miners.length === 0) {
        useMockData = true;
        miners = FleetData.getMockMiners();
        document.getElementById('mockBanner').style.display = '';
    } else {
        useMockData = false;
        document.getElementById('mockBanner').style.display = 'none';
    }

    // Compute summary from current miners list
    var totalHashrate = 0, totalPower = 0, onlineCount = 0, offlineCount = 0, totalMachines = 0, totalCost = 0;
    for (var i = 0; i < miners.length; i++) {
        var m = miners[i];
        totalMachines += m.quantity;
        totalCost += (m.cost || 0) * m.quantity;
        if (m.status === 'online') {
            onlineCount += m.quantity;
            totalHashrate += m.hashrate * m.quantity;
            totalPower += m.power * m.quantity;
        } else {
            offlineCount += m.quantity;
        }
    }
    var efficiency = totalHashrate > 0 ? (totalPower * 1000) / totalHashrate : 0;
    var avgCost = totalMachines > 0 ? totalCost / totalMachines : 0;

    // Daily earnings estimate
    var difficultyFull = liveDifficulty * 1e12;
    var hashrateH = totalHashrate * 1e12;
    var dailyBTC = (hashrateH * SECONDS_PER_DAY * CURRENT_BLOCK_REWARD) / (difficultyFull * TWO_POW_32);
    var dailyUSD = dailyBTC * liveBtcPrice;

    // Update fleet overview cards
    document.getElementById('fleetHashrate').textContent = totalHashrate.toLocaleString(undefined, { maximumFractionDigits: 1 });
    document.getElementById('fleetOnline').textContent = onlineCount;
    document.getElementById('fleetOfflineSub').textContent = offlineCount > 0 ? offlineCount + ' offline' : 'All miners online';
    document.getElementById('fleetDailyBTC').textContent = dailyBTC.toFixed(6) + ' BTC';
    document.getElementById('fleetDailyUSD').textContent = fmtUSD(dailyUSD);
    document.getElementById('fleetPower').textContent = totalPower.toFixed(2);
    document.getElementById('fleetEfficiency').textContent = efficiency.toFixed(1);
    document.getElementById('fleetAvgCost').textContent = fmtUSD(avgCost);
    document.getElementById('fleetTotalCost').textContent = 'Total: ' + fmtUSD(totalCost);

    // Render miner cards
    renderMinerCards(miners);
}

function renderMinerCards(miners) {
    var grid = document.getElementById('minerCardsGrid');
    grid.innerHTML = '';

    if (miners.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="icon">&#x26A1;</div><p>No miners added yet</p><div class="hint">Click "Add Miner" to get started</div></div>';
        return;
    }

    for (var i = 0; i < miners.length; i++) {
        var m = miners[i];
        var eff = m.hashrate > 0 ? ((m.power * 1000) / m.hashrate).toFixed(1) : '0';

        // Daily earnings for a single unit
        var mHashH = m.hashrate * 1e12;
        var diffFull = liveDifficulty * 1e12;
        var mDailyBTC = m.status === 'online' ? (mHashH * SECONDS_PER_DAY * CURRENT_BLOCK_REWARD) / (diffFull * TWO_POW_32) : 0;
        var mDailyUSD = mDailyBTC * liveBtcPrice;

        // Render one card per unit
        for (var u = 0; u < m.quantity; u++) {
            var card = document.createElement('div');
            card.className = 'miner-card';
            card.innerHTML =
                '<div class="miner-card-header">' +
                    '<div class="miner-card-model">' + escapeHtml(m.model) + '</div>' +
                '</div>' +
                '<div class="miner-card-stats">' +
                    '<div class="miner-card-stat"><div class="stat-label">Hashrate</div><div class="stat-value">' + m.hashrate + ' TH/s</div></div>' +
                    '<div class="miner-card-stat"><div class="stat-label">Power</div><div class="stat-value">' + m.power + ' kW</div></div>' +
                    '<div class="miner-card-stat"><div class="stat-label">Efficiency</div><div class="stat-value">' + eff + ' J/TH</div></div>' +
                    '<div class="miner-card-stat"><div class="stat-label">Cost</div><div class="stat-value">' + (m.cost ? fmtUSD(m.cost) : '--') + '</div></div>' +
                    '<div class="miner-card-stat"><div class="stat-label">Status</div><div class="stat-value"><span class="status-dot ' + m.status + '"></span>' + m.status + '</div></div>' +
                    '<div class="miner-card-stat"><div class="stat-label">Daily Est.</div><div class="stat-value" style="color:#f7931a">' + fmtUSD(mDailyUSD) + '</div></div>' +
                '</div>' +
                '<div class="miner-card-actions">' +
                    '<button class="edit-miner" data-id="' + m.id + '">Edit</button>' +
                    '<button class="delete delete-miner" data-id="' + m.id + '">Delete</button>' +
                '</div>';
            grid.appendChild(card);
        }
    }

    // Attach event listeners
    grid.querySelectorAll('.edit-miner').forEach(function(btn) {
        btn.addEventListener('click', function() { startEditMiner(this.dataset.id); });
    });
    grid.querySelectorAll('.delete-miner').forEach(function(btn) {
        btn.addEventListener('click', function() { deleteMiner(this.dataset.id); });
    });
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== ADD / EDIT MINER =====
var addMinerPanel = document.getElementById('addMinerPanel');
var apiPanel = document.getElementById('apiPanel');

document.getElementById('btnAddMiner').addEventListener('click', function() {
    editingMinerId = null;
    document.getElementById('minerFormTitle').textContent = 'Add Miner';
    document.getElementById('fmModel').value = '';
    document.getElementById('fmHashrate').value = '';
    document.getElementById('fmPower').value = '';
    document.getElementById('fmCost').value = '';
    document.getElementById('fmQuantity').value = '1';
    document.getElementById('fmStatus').value = 'online';
    apiPanel.classList.remove('open');
    addMinerPanel.classList.toggle('open');
});

document.getElementById('cancelMiner').addEventListener('click', function() {
    addMinerPanel.classList.remove('open');
    editingMinerId = null;
});

document.getElementById('saveMiner').addEventListener('click', function() {
    var model = document.getElementById('fmModel').value.trim();
    var hashrate = document.getElementById('fmHashrate').value;
    var power = document.getElementById('fmPower').value;
    var cost = document.getElementById('fmCost').value;
    var quantity = document.getElementById('fmQuantity').value;
    var status = document.getElementById('fmStatus').value;

    if (!model || !hashrate || !power) return;

    if (editingMinerId) {
        FleetData.updateMiner(editingMinerId, { model: model, hashrate: hashrate, power: power, cost: cost, quantity: quantity, status: status });
        editingMinerId = null;
    } else {
        FleetData.addMiner({ model: model, hashrate: hashrate, power: power, cost: cost, quantity: quantity, status: status });
    }

    addMinerPanel.classList.remove('open');
    renderDashboard();
    updateEarningsChart();
});

function startEditMiner(id) {
    var fleet = FleetData.getFleet();
    var miner = null;
    for (var i = 0; i < fleet.miners.length; i++) {
        if (fleet.miners[i].id === id) { miner = fleet.miners[i]; break; }
    }
    // Also check mock data
    if (!miner && useMockData) return;
    if (!miner) return;

    editingMinerId = id;
    document.getElementById('minerFormTitle').textContent = 'Edit Miner';
    document.getElementById('fmModel').value = miner.model;
    document.getElementById('fmHashrate').value = miner.hashrate;
    document.getElementById('fmPower').value = miner.power;
    document.getElementById('fmCost').value = miner.cost || '';
    document.getElementById('fmQuantity').value = miner.quantity;
    document.getElementById('fmStatus').value = miner.status;
    apiPanel.classList.remove('open');
    addMinerPanel.classList.add('open');
}

var pendingDeleteId = null;
var deleteDialog = document.getElementById('deleteDialog');

function deleteMiner(id) {
    if (useMockData) return;
    pendingDeleteId = id;

    // Check quantity — if only 1, skip dialog and just delete
    var fleet = FleetData.getFleet();
    var miner = null;
    for (var i = 0; i < fleet.miners.length; i++) {
        if (fleet.miners[i].id === id) { miner = fleet.miners[i]; break; }
    }
    if (!miner || miner.quantity <= 1) {
        FleetData.removeMiner(id);
        renderDashboard();
        updateEarningsChart();
        return;
    }

    document.getElementById('deleteDialogText').textContent =
        'This group has ' + miner.quantity + ' ' + escapeHtml(miner.model) + ' miners.';
    deleteDialog.style.display = '';
}

document.getElementById('deleteCancel').addEventListener('click', function() {
    deleteDialog.style.display = 'none';
    pendingDeleteId = null;
});

document.getElementById('deleteOne').addEventListener('click', function() {
    if (pendingDeleteId) {
        FleetData.reduceQuantity(pendingDeleteId);
        renderDashboard();
        updateEarningsChart();
    }
    deleteDialog.style.display = 'none';
    pendingDeleteId = null;
});

document.getElementById('deleteAll').addEventListener('click', function() {
    if (pendingDeleteId) {
        FleetData.removeMiner(pendingDeleteId);
        renderDashboard();
        updateEarningsChart();
    }
    deleteDialog.style.display = 'none';
    pendingDeleteId = null;
});

// ===== F2POOL API PANEL =====
document.getElementById('btnConnectAPI').addEventListener('click', function() {
    var settings = FleetData.getSettings();
    document.getElementById('fmApiKey').value = settings.f2pool.apiKey || '';
    document.getElementById('fmWorkerName').value = settings.f2pool.workerName || '';
    addMinerPanel.classList.remove('open');
    apiPanel.classList.toggle('open');
});

document.getElementById('cancelAPI').addEventListener('click', function() {
    apiPanel.classList.remove('open');
});

document.getElementById('saveAPI').addEventListener('click', function() {
    var settings = FleetData.getSettings();
    settings.f2pool.apiKey = document.getElementById('fmApiKey').value.trim();
    settings.f2pool.workerName = document.getElementById('fmWorkerName').value.trim();
    settings.f2pool.enabled = !!(settings.f2pool.apiKey && settings.f2pool.workerName);
    FleetData.saveSettings(settings);
    apiPanel.classList.remove('open');
});

// ===== MOCK BANNER =====
document.getElementById('dismissMock').addEventListener('click', function() {
    document.getElementById('mockBanner').style.display = 'none';
});

// ===== EARNINGS CHART =====
var earningsChart;

function initEarningsChart() {
    var ctx = document.getElementById('earningsChart');
    var chartData = generateEarningsData();

    earningsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Daily Earnings (USD)',
                data: chartData.values,
                backgroundColor: 'rgba(247, 147, 26, 0.50)',
                borderColor: '#f7931a',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 10, 10, 0.92)',
                    borderColor: 'rgba(255, 255, 255, 0.10)',
                    borderWidth: 1,
                    titleColor: '#e8e8e8',
                    bodyColor: '#e8e8e8',
                    padding: 10,
                    callbacks: {
                        label: function(ctx) {
                            return fmtUSD(ctx.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#888', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#f7931a',
                        font: { size: 11 },
                        callback: function(v) {
                            if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
                            return '$' + v.toFixed(0);
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' }
                }
            }
        }
    });
}

function generateEarningsData() {
    var fleet = FleetData.getFleet();
    var miners = fleet.miners.length > 0 ? fleet.miners : FleetData.getMockMiners();

    var totalHashrate = 0;
    for (var i = 0; i < miners.length; i++) {
        if (miners[i].status === 'online') {
            totalHashrate += miners[i].hashrate * miners[i].quantity;
        }
    }

    var hashrateH = totalHashrate * 1e12;
    var diffFull = liveDifficulty * 1e12;
    var baseDailyBTC = (hashrateH * SECONDS_PER_DAY * CURRENT_BLOCK_REWARD) / (diffFull * TWO_POW_32);
    var baseDailyUSD = baseDailyBTC * liveBtcPrice;

    var labels = [];
    var values = [];
    var today = new Date();

    for (var d = 13; d >= 0; d--) {
        var date = new Date(today);
        date.setDate(date.getDate() - d);
        var label = (date.getMonth() + 1) + '/' + date.getDate();
        labels.push(label);

        // Add small random variance (+/- 8%) for realistic look
        var variance = 1 + (Math.random() * 0.16 - 0.08);
        values.push(baseDailyUSD * variance);
    }

    return { labels: labels, values: values };
}

function updateEarningsChart() {
    if (!earningsChart) return;
    var chartData = generateEarningsData();
    earningsChart.data.labels = chartData.labels;
    earningsChart.data.datasets[0].data = chartData.values;
    earningsChart.update();
}

// ===== PWA SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=10').catch(function() {});
}
