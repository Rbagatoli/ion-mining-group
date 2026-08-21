// ===== ION MINING GROUP — Calculator Engine =====

// One-time migration: clear old settings so new defaults take effect
try {
    var _raw = localStorage.getItem('btcMinerCalcSettings');
    if (_raw) {
        var _s = JSON.parse(_raw);
        if (!_s._v || _s._v < 3) {
            localStorage.removeItem('btcMinerCalcSettings');
        }
    }
} catch(e) {}

// ===== CONSTANTS =====
const SECONDS_PER_DAY = 86400;
const TWO_POW_32 = 4294967296;
const CURRENT_BLOCK_REWARD = 3.125;

const PERIOD_CONFIG = {
    daily:   { days: 1,     perMonth: 30.44, label: 'days',   labelSingular: 'day' },
    weekly:  { days: 7,     perMonth: 4.348, label: 'weeks',  labelSingular: 'week' },
    monthly: { days: 30.44, perMonth: 1,     label: 'months', labelSingular: 'month' }
};

// Halving schedule and the projection math live in calc-engine.js — a single source of
// truth shared by the live projection and by scenario comparison. Delegating rather than
// keeping a second copy here so the two can never drift apart.
function getBlockReward(date) {
    return CalcEngine.getBlockReward(date);
}

// ===== DOM REFS =====
const inputIds = [
    'btcPrice', 'priceChange', 'difficulty', 'diffChange', 'investPeriod',
    'hashrate', 'power', 'capex', 'machineCount', 'minerAdditions', 'minerLifespan', 'salvageValue', 'btcTreasury', 'infrastructureCost', 'elecCost', 'poolFee', 'uptime', 'hodlRatio'
];
const el = {};
inputIds.forEach(id => el[id] = document.getElementById(id));
const hodlSlider = document.getElementById('hodlSlider');
const periodLengthSel = document.getElementById('periodLength');
const reinvestToggle = document.getElementById('reinvestToggle');
const reinvestRow = document.getElementById('reinvestRow');
const additionCapexToggle = document.getElementById('additionCapexToggle');
const additionCapexRow = document.getElementById('additionCapexRow');
const savingsElecToggle = document.getElementById('savingsElecToggle');
const savingsElecRow = document.getElementById('savingsElecRow');
const autoReplaceToggle = document.getElementById('autoReplaceToggle');
const autoReplaceRow = document.getElementById('autoReplaceRow');
const taxAdjustmentToggle = document.getElementById('taxAdjustmentToggle');
const taxAdjustmentRow = document.getElementById('taxAdjustmentRow');
const taxRateInputs = document.getElementById('taxRateInputs');
const miningIncomeTaxRateInput = document.getElementById('miningIncomeTaxRate');
const capitalGainsTaxRateInput = document.getElementById('capitalGainsTaxRate');

// ===== WALLET BALANCE INTEGRATION =====
function getWalletTotalBTC() {
    try {
        var totalBTC = 0;

        // 1. Get cold wallet balances from localStorage
        var walletData = localStorage.getItem('ionMiningWallet');
        if (walletData) {
            var parsed = JSON.parse(walletData);
            if (parsed && parsed.addresses && Array.isArray(parsed.addresses)) {
                for (var i = 0; i < parsed.addresses.length; i++) {
                    totalBTC += (parsed.addresses[i].lastBalance || 0);
                }
            }
        }

        // 2. Add Strike BTC balance if available
        var strikeBalance = localStorage.getItem('ionMiningStrikeBtcBalance');
        if (strikeBalance) {
            totalBTC += parseFloat(strikeBalance) || 0;
        }

        return totalBTC;
    } catch(e) {
        console.warn('[Calculator] Error loading wallet balance:', e);
        return 0;
    }
}

// ===== FLEET DATA TOGGLE =====
const useFleetToggle = document.getElementById('useFleetToggle');
const fleetToggleRow = document.getElementById('fleetToggleRow');
function applyFleetData() {
    var summary = FleetData.getFleetSummary();
    if (summary.totalMachines === 0) return;

    // Pre-fill inputs from fleet — user can still adjust freely
    var avgHashrate = summary.totalMachines > 0 ? summary.totalHashrate / summary.totalMachines : 0;
    var avgPower = summary.totalMachines > 0 ? summary.totalPower / summary.totalMachines : 0;

    // Compute average cost from fleet miners
    var fleet = FleetData.getFleet();
    var totalCost = 0;
    for (var i = 0; i < fleet.miners.length; i++) {
        totalCost += (fleet.miners[i].cost || 0) * fleet.miners[i].quantity;
    }
    var avgCost = summary.totalMachines > 0 ? totalCost / summary.totalMachines : 0;

    el.hashrate.value = avgHashrate.toFixed(1);
    el.power.value = avgPower.toFixed(2);
    el.capex.value = Math.round(avgCost);
    el.machineCount.value = summary.totalMachines;
    el.elecCost.value = parseFloat(summary.avgElecCost.toFixed(4));
    el.poolFee.value = summary.defaults.poolFee;
    el.uptime.value = summary.defaults.uptime;

    // Auto-fill BTC Treasury with actual wallet balance
    var walletBalance = getWalletTotalBTC();
    if (walletBalance > 0) {
        el.btcTreasury.value = walletBalance.toFixed(8);
    }

    fleetToggleRow.classList.add('active');
    recalculate();
}

function removeFleetData() {
    fleetToggleRow.classList.remove('active');
    recalculate();
}

useFleetToggle.addEventListener('change', function() {
    var settings = FleetData.getSettings();
    settings.useFleetData = useFleetToggle.checked;
    FleetData.saveSettings(settings);
    if (useFleetToggle.checked) {
        applyFleetData();
    } else {
        removeFleetData();
    }
});

// ===== LOCALSTORAGE PERSISTENCE =====
const STORAGE_KEY = 'btcMinerCalcSettings';

function saveSettings() {
    const settings = {};
    inputIds.forEach(id => { settings[id] = el[id].value; });
    settings.periodLength = periodLengthSel.value;
    settings.reinvest = reinvestToggle.checked;
    settings.additionCapex = additionCapexToggle.checked;
    settings.savingsElec = savingsElecToggle.checked;
    settings.autoReplace = autoReplaceToggle.checked;
    settings.taxAdjustment = taxAdjustmentToggle.checked;
    settings.miningIncomeTaxRate = miningIncomeTaxRateInput.value;
    settings.capitalGainsTaxRate = capitalGainsTaxRateInput.value;
    settings._v = 3;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(e) {}
    if (typeof SyncEngine !== 'undefined') SyncEngine.save('calculator', settings);
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        inputIds.forEach(id => { if (s[id] !== undefined) el[id].value = s[id]; });
        if (s.periodLength) periodLengthSel.value = s.periodLength;
        if (s.reinvest) {
            reinvestToggle.checked = true;
            reinvestRow.classList.add('active');
        }
        if (s.additionCapex === false) {
            additionCapexToggle.checked = false;
        } else {
            additionCapexToggle.checked = true;
            additionCapexRow.classList.add('active');
        }
        if (s.savingsElec) {
            savingsElecToggle.checked = true;
            savingsElecRow.classList.add('active');
        }
        // Defaults to on (matches the checked attribute in the markup)
        if (s.autoReplace === false) {
            autoReplaceToggle.checked = false;
            autoReplaceRow.classList.remove('active');
        } else {
            autoReplaceToggle.checked = true;
            autoReplaceRow.classList.add('active');
        }
        if (s.taxAdjustment) {
            taxAdjustmentToggle.checked = true;
            taxAdjustmentRow.classList.add('active');
            taxRateInputs.style.display = '';
        }
        if (s.miningIncomeTaxRate !== undefined) miningIncomeTaxRateInput.value = s.miningIncomeTaxRate;
        if (s.capitalGainsTaxRate !== undefined) capitalGainsTaxRateInput.value = s.capitalGainsTaxRate;
        hodlSlider.value = el.hodlRatio.value;
    } catch(e) {}
}

// ===== LIVE DATA FETCH =====
async function fetchLiveData() {
    const status = document.getElementById('liveStatus');
    var data = await fetchLiveMarketData();
    if (data.price || data.difficulty) {
        if (data.price) el.btcPrice.value = data.price;
        if (data.difficulty) el.difficulty.value = data.difficulty;
        status.textContent = 'Live data loaded';
        status.className = 'live-status live';
    } else {
        status.textContent = 'Using saved values (offline)';
        status.className = 'live-status offline';
    }
    setTimeout(() => { status.style.opacity = '0'; }, 3000);
}

// ===== CHART =====
let comboChart;
let halvingPeriodIdxs = [];
let lastResult = null;   // most recent CalcEngine result, reused by scenario comparison

const halvingPlugin = {
    id: 'halvingLine',
    afterDraw(chart) {
        if (halvingPeriodIdxs.length === 0) return;
        const xScale = chart.scales.x;
        const dataLen = chart.data.labels.length;
        const ctx = chart.ctx;
        ctx.save();
        for (const h of halvingPeriodIdxs) {
            if (h.idx >= dataLen) continue;
            const x = xScale.getPixelForValue(h.idx);
            if (x < chart.chartArea.left || x > chart.chartArea.right) continue;
            ctx.beginPath();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = '#f7931a';
            ctx.lineWidth = 2;
            ctx.moveTo(x, chart.chartArea.top);
            ctx.lineTo(x, chart.chartArea.bottom);
            ctx.stroke();
            ctx.fillStyle = '#f7931a';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('HALVING \u2192 ' + h.reward + ' BTC', x, chart.chartArea.top - 6);
        }
        ctx.restore();
    }
};

// NOTE: these must be read lazily. This module is evaluated before initNav() applies the
// saved theme, so resolving them at load time always yielded the dark palette — which made
// the grid lines invisible against a light background.
function gridColor() { return isLightMode() ? 'rgba(0,0,0,0.06)' : 'rgba(255, 255, 255, 0.06)'; }
function mutedColor() { return isLightMode() ? '#6b7280' : '#888'; }

function createGlossGradient(ctx, chartArea, r, g, b, alpha) {
    const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha + 0.25) + ')');
    grad.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')');
    grad.addColorStop(0.65, 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha - 0.12) + ')');
    grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha + 0.05) + ')');
    return grad;
}

const glossPlugin = {
    id: 'glossBars',
    beforeDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const area = chart.chartArea;
        if (!area) return;
        chart.data.datasets[0].backgroundColor = createGlossGradient(ctx, area, 247, 147, 26, 0.55);
        chart.data.datasets[1].backgroundColor = createGlossGradient(ctx, area, 140, 140, 140, 0.40);
    }
};

function initChart() {
    comboChart = new Chart(document.getElementById('comboChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    // Was per-period BTC mined, plotted against a CUMULATIVE HODL series on the
                    // same axis — so it was squashed to invisibility. Both are cumulative now,
                    // which also makes the pair meaningful: total mined vs the part you kept.
                    type: 'bar',
                    label: 'BTC Mined (cumulative)',
                    data: [],
                    backgroundColor: 'rgba(247, 147, 26, 0.60)',
                    borderColor: '#f7931a',
                    borderRadius: 3,
                    yAxisID: 'yBTC',
                    order: 2
                },
                {
                    type: 'bar',
                    label: 'BTC Held (cumulative)',
                    data: [],
                    backgroundColor: 'rgba(140, 140, 140, 0.45)',
                    borderColor: '#999',
                    borderRadius: 3,
                    yAxisID: 'yBTC',
                    order: 3
                },
                {
                    type: 'line',
                    label: 'Mining Net Value (USD)',
                    data: [],
                    borderColor: '#f7931a',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#f7931a',
                    tension: 0.3,
                    yAxisID: 'yUSD',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Miners Owned',
                    data: [],
                    borderColor: isLightMode() ? '#1a1a1a' : '#ffffff',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: isLightMode() ? '#1a1a1a' : '#ffffff',
                    stepped: 'after',
                    fill: true,
                    yAxisID: 'yMachines',
                    order: 0,
                    hidden: true
                },
                {
                    type: 'line',
                    label: 'Buy & Hold Net Value (USD)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: '#10b981',
                    tension: 0.3,
                    yAxisID: 'yUSD',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {}
                },
                tooltip: {
                    padding: 12,
                    bodySpacing: 6,
                    callbacks: {
                        title: function(items) { return 'Period ' + items[0].label; },
                        label: function(ctx) {
                            const ds = ctx.dataset;
                            if (ds.yAxisID === 'yMachines') return ds.label + ': ' + ctx.parsed.y;
                            else if (ds.yAxisID === 'yUSD') return ds.label + ': ' + fmtUSDFull(ctx.parsed.y);
                            else return ds.label + ': ' + fmtBTC(ctx.parsed.y, 8) + ' BTC';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: mutedColor(), maxRotation: 0, autoSkipPadding: 8, font: { size: 11 } },
                    grid: { color: gridColor() }
                },
                yBTC: {
                    type: 'linear', position: 'left', beginAtZero: true,
                    title: { display: true, text: 'BTC (cumulative)', color: mutedColor(), font: { size: 12 } },
                    ticks: {
                        color: mutedColor(), font: { size: 11 },
                        callback: function(v) {
                            if (v >= 1) return v.toFixed(2);
                            if (v >= 0.01) return v.toFixed(3);
                            return v.toFixed(4);
                        }
                    },
                    grid: { color: gridColor() }
                },
                yUSD: {
                    type: 'linear', position: 'right', beginAtZero: true,
                    title: { display: true, text: 'Net Value vs. Buy & Hold (USD)', color: mutedColor(), font: { size: 12 } },
                    ticks: {
                        color: '#f7931a', font: { size: 11 },
                        callback: function(v) {
                            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
                            return '$' + v.toFixed(0);
                        }
                    },
                    grid: { drawOnChartArea: false }
                },
                yMachines: {
                    type: 'linear', position: 'right', beginAtZero: true, display: false,
                    title: { display: true, text: 'Miners', color: '#ffffff', font: { size: 12 } },
                    ticks: {
                        color: '#ffffff', font: { size: 11 }, stepSize: 1,
                        callback: function(v) { return Number.isInteger(v) ? v : ''; }
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        },
        plugins: [halvingPlugin, glossPlugin]
    });
}

// ===== MAIN CALCULATION =====
// Snapshot the current inputs in the same shape saveSettings() persists, so a scenario
// saved from here round-trips straight back into the engine.
function currentSettings() {
    const s = {};
    inputIds.forEach(id => { s[id] = el[id].value; });
    s.periodLength = periodLengthSel.value;
    s.reinvest = reinvestToggle.checked;
    s.additionCapex = additionCapexToggle.checked;
    s.savingsElec = savingsElecToggle.checked;
    s.autoReplace = autoReplaceToggle.checked;
    s.taxAdjustment = taxAdjustmentToggle.checked;
    s.miningIncomeTaxRate = miningIncomeTaxRateInput.value;
    s.capitalGainsTaxRate = capitalGainsTaxRateInput.value;
    s._v = 3;
    return s;
}

function recalculate() {
    const settings = currentSettings();
    const r = CalcEngine.computeProjection(settings);
    lastResult = r;
    halvingPeriodIdxs = r.halvingPeriodIdxs;   // read by the chart's halving-line plugin

    renderProjection(r);

    // Contextual input hints
    additionCapexRow.style.display = r.params.monthlyMinerAdditions > 0 ? '' : 'none';
    const reinvestHint = document.getElementById('reinvestHint');
    if (r.params.reinvestMode && r.params.hodlPct >= 1) reinvestHint.textContent = 'HODL is 100% \u2014 no fiat to reinvest';
    else if (r.params.reinvestMode && r.params.capex <= 0) reinvestHint.textContent = 'Set Machine CAPEX > $0 for reinvest';
    else reinvestHint.textContent = '';

    renderHeatmap(r.params.btcPrice0, r.params.elecCost, r.params.hashrateTH, r.params.powerKW,
                  r.params.machineCount, r.params.poolFeePct, r.params.uptimePct, r.params.difficultyT * 1e12);
    renderComparison();
    scheduleBacktest();          // machine params feed the backtest too
    renderScenarioComparison();  // keep any open comparison in sync with "Current"

    // Persist (only if not using fleet data for locked fields)
    if (!useFleetToggle.checked) saveSettings();
}

function renderProjection(r) {
    const pCfg = r.periodConfig;
    document.getElementById('periodLabel').textContent = r.params.numPeriods + ' ' + pCfg.label;
    document.getElementById('periodSuffix').textContent = pCfg.label;
    document.getElementById('metBreakEvenUnit').textContent = pCfg.labelSingular;

    document.getElementById('metDailyRev').textContent = fmtUSD(r.dailyRevenueDay1);
    document.getElementById('metDailyElec').textContent = fmtUSD(r.dailyElecDay1);

    const profitEl = document.getElementById('metDailyProfit');
    const displayProfit = r.params.taxAdjustmentEnabled ? r.dailyAfterTaxProfitDay1 : r.dailyProfitDay1;
    profitEl.textContent = fmtUSD(displayProfit);
    profitEl.className = 'value ' + (displayProfit >= 0 ? 'positive' : 'negative');

    const costBTCEl = document.getElementById('metCostPerBTC');
    costBTCEl.textContent = fmtUSD(r.costPerBTC);
    costBTCEl.className = 'value ' + (r.costPerBTC <= r.params.btcPrice0 ? 'positive' : 'negative');

    document.getElementById('metEfficiency').textContent = r.efficiency.toFixed(1);
    document.getElementById('metTotalMined').textContent = fmtBTC(r.cumulBtcMined);
    document.getElementById('metFinalBtcPrice').textContent = 'BTC @ ' + fmtUSD(r.finalBtcPrice);

    const heldValEl = document.getElementById('metHeldValue');
    heldValEl.textContent = fmtUSD(r.grossValue);
    heldValEl.className = 'value btc-orange';
    document.getElementById('metFinalPrice').textContent =
        fmtUSD(r.totalPL) + ' P/L + ' + fmtUSD(r.totalInitialInvestment) + ' cost';

    const plEl = document.getElementById('metTotalPL');
    plEl.textContent = fmtUSD(r.totalPL);
    plEl.className = 'value ' + (r.totalPL >= 0 ? 'positive' : 'negative');
    document.getElementById('metROI').textContent =
        r.totalInitialInvestment > 0 ? (r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '% ROI' : '';

    const beEl = document.getElementById('metBreakEven');
    beEl.textContent = r.breakEvenPeriod !== null ? r.breakEvenPeriod : 'Never';
    beEl.className = 'value ' + (r.breakEvenPeriod !== null ? 'positive' : 'negative');

    document.getElementById('metBuyHoldValue').textContent = fmtUSD(r.buyHoldFinalValue);
    document.getElementById('metBuyHoldSub').textContent = r.params.taxAdjustmentEnabled
        ? fmtBTC(r.buyHoldBtcAmount, 8) + ' BTC @ ' + fmtUSD(r.finalBtcPrice) + ' (after ' + (r.params.capitalGainsTaxRate * 100).toFixed(0) + '% CGT on gains)'
        : fmtBTC(r.buyHoldBtcAmount, 8) + ' BTC @ ' + fmtUSD(r.finalBtcPrice);

    const advEl = document.getElementById('metMiningAdvantage');
    advEl.textContent = fmtUSD(Math.abs(r.miningAdvantage));
    advEl.className = 'value ' + (r.isMiningBetter ? 'positive' : 'negative');
    document.getElementById('metOvertakePeriod').textContent = r.overtakePeriod !== null
        ? 'Mining overtakes in period ' + r.overtakePeriod
        : 'Mining never overtakes';

    const machinesCard = document.getElementById('metMachinesCard');
    if (r.hasGrowth) {
        machinesCard.style.display = '';
        document.getElementById('metTotalMachines').textContent = r.activeMachines;
        const parts = [];
        if (r.totalMachinesBought > 0) parts.push('+' + r.totalMachinesBought + ' reinvest');
        if (r.totalScheduledAdded > 0) parts.push('+' + r.totalScheduledAdded + ' scheduled');
        if (r.totalMinersRetired > 0 && r.params.autoReplace) parts.push(r.totalMinersRetired + ' replaced');
        else if (r.totalMinersRetired > 0) parts.push('-' + r.totalMinersRetired + ' retired');
        document.getElementById('metMachinesSub').textContent = parts.join(', ');
    } else {
        machinesCard.style.display = 'none';
    }

    // ===== CHART =====
    comboChart.data.labels = r.series.labels;
    comboChart.data.datasets[0].data = r.series.cumulMined;
    comboChart.data.datasets[1].data = r.series.btcHodl;
    comboChart.data.datasets[2].data = r.series.usdValue;
    comboChart.data.datasets[3].data = r.series.machines;
    comboChart.data.datasets[4].data = r.series.buyHold;
    comboChart.data.datasets[3].hidden = !r.hasGrowth;
    comboChart.options.scales.yMachines.display = r.hasGrowth;
    comboChart.update();

    // ===== TABLE =====
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    for (const row of r.tableRows) {
        const tr = document.createElement('tr');
        if (row.isHalving) tr.classList.add('halving-row');
        tr.innerHTML =
            '<td>' + row.period + (row.isHalving ? ' <span style="color:#f7931a">&#x26A0; Halving</span>' : '') + '</td>' +
            '<td>' + fmtUSDFull(row.btcPrice) + '</td>' +
            '<td>' + row.diffT.toFixed(2) + '</td>' +
            '<td>' + row.blockReward + ' BTC</td>' +
            '<td>' + row.machines + (row.retiredThisPeriod > 0 && row.replacedThisPeriod > 0 ? ' <span style="color:#fb923c">(' + row.retiredThisPeriod + ' replaced)</span>' : row.retiredThisPeriod > 0 ? ' <span style="color:#ef4444">(-' + row.retiredThisPeriod + ' retired)</span>' : '') + (row.machinesBought > 0 ? ' <span style="color:#4ade80">(+' + row.machinesBought + ')</span>' : '') + (row.scheduledAdded > 0 ? ' <span style="color:#f59e0b">(+' + row.scheduledAdded + ' sched)</span>' : '') + '</td>' +
            '<td>' + row.pnlBtc.toFixed(8) + '</td>' +
            '<td>' + row.btcHodlCumul.toFixed(6) + '</td>' +
            '<td>' + fmtUSDFull(row.usdValue) + '</td>' +
            '<td style="color:#ef4444">' + fmtUSDFull(row.elecCost) + '</td>' +
            '<td style="color:' + (row.netCashFlow >= 0 ? '#4ade80' : '#ef4444') + '">' + fmtUSDFull(row.netCashFlow) + '</td>' +
            '<td style="color:' + (row.cumulPL >= 0 ? '#4ade80' : '#ef4444') + '">' + fmtUSDFull(row.cumulPL) + '</td>';
        tbody.appendChild(tr);
    }
}


// ===== EVENT LISTENERS =====
inputIds.forEach(id => { document.getElementById(id).addEventListener('input', recalculate); });
periodLengthSel.addEventListener('change', recalculate);

additionCapexToggle.addEventListener('change', () => {
    additionCapexRow.classList.toggle('active', additionCapexToggle.checked);
    recalculate();
});
reinvestToggle.addEventListener('change', () => {
    reinvestRow.classList.toggle('active', reinvestToggle.checked);
    recalculate();
});
savingsElecToggle.addEventListener('change', () => {
    savingsElecRow.classList.toggle('active', savingsElecToggle.checked);
    recalculate();
});
autoReplaceToggle.addEventListener('change', () => {
    autoReplaceRow.classList.toggle('active', autoReplaceToggle.checked);
    recalculate();
});
taxAdjustmentToggle.addEventListener('change', () => {
    taxAdjustmentRow.classList.toggle('active', taxAdjustmentToggle.checked);
    taxRateInputs.style.display = taxAdjustmentToggle.checked ? '' : 'none';
    recalculate();
});
miningIncomeTaxRateInput.addEventListener('input', recalculate);
capitalGainsTaxRateInput.addEventListener('input', recalculate);
hodlSlider.addEventListener('input', () => {
    el.hodlRatio.value = hodlSlider.value;
    recalculate();
});
el.hodlRatio.addEventListener('input', () => { hodlSlider.value = el.hodlRatio.value; });

document.getElementById('toggleTable').addEventListener('click', function() {
    const tc = document.getElementById('tableContainer');
    const showing = tc.style.display !== 'none';
    tc.style.display = showing ? 'none' : 'block';
    this.textContent = showing ? 'Show Period Breakdown' : 'Hide Period Breakdown';
});

document.getElementById('resetDefaults').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
});

// ===== PROFITABILITY HEATMAP =====
function renderHeatmap(btcPrice0, elecCost, hashrateTH, powerKW, machineCount, poolFeePct, uptimePct, difficulty0) {
    var container = document.getElementById('heatmapContainer');
    if (!container) return;

    var blockReward = getBlockReward(new Date());
    var hashrateH = hashrateTH * 1e12;
    var dailyBTCNet = (hashrateH * SECONDS_PER_DAY * blockReward) / (difficulty0 * TWO_POW_32) * (1 - poolFeePct) * uptimePct * machineCount;

    // Build price columns: 60% to 140% of current price in ~10 steps
    var pMin = Math.floor(btcPrice0 * 0.6 / 5000) * 5000;
    var pMax = Math.ceil(btcPrice0 * 1.4 / 5000) * 5000;
    if (pMin < 5000) pMin = 5000;
    var prices = [];
    for (var p = pMin; p <= pMax; p += 5000) prices.push(p);

    // Build electricity rows: $0.02 to $0.15
    var elecRates = [];
    for (var e = 0.02; e <= 0.151; e += 0.01) elecRates.push(Math.round(e * 100) / 100);

    var sym = getCurrencySymbol();
    var html = '<table class="heatmap-table"><thead><tr><th>' + sym + '/kWh</th>';
    for (var c = 0; c < prices.length; c++) {
        html += '<th>' + sym + (prices[c] / 1000).toFixed(0) + 'k</th>';
    }
    html += '</tr></thead><tbody>';

    for (var r = 0; r < elecRates.length; r++) {
        html += '<tr><td class="heatmap-label">' + sym + elecRates[r].toFixed(2) + '</td>';
        for (var j = 0; j < prices.length; j++) {
            var dailyRev = dailyBTCNet * prices[j];
            var dailyElec = powerKW * 24 * elecRates[r] * uptimePct * machineCount;
            var profit = dailyRev - dailyElec;
            var isCurrentPos = Math.abs(prices[j] - btcPrice0) < 2500 && Math.abs(elecRates[r] - elecCost) < 0.005;
            var cls = profit > 0 ? (profit > dailyElec ? 'hm-strong-profit' : 'hm-profit') : (profit < -dailyElec * 0.5 ? 'hm-strong-loss' : 'hm-loss');
            if (Math.abs(profit) < dailyElec * 0.1) cls = 'hm-breakeven';
            html += '<td class="hm-cell ' + cls + (isCurrentPos ? ' hm-current' : '') + '">' + fmtUSD(profit) + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ===== MINER COMPARISON TOOL =====
var compareAMiner = null;
var compareBMiner = null;

function initMinerComparison() {
    var inputA = document.getElementById('compareA');
    var inputB = document.getElementById('compareB');
    var dropA = document.getElementById('compareADropdown');
    var dropB = document.getElementById('compareBDropdown');
    if (!inputA || !inputB) return;

    function setupDropdown(input, dropdown, setter) {
        input.addEventListener('input', function() {
            var query = this.value.trim();
            if (query.length < 1) { dropdown.style.display = 'none'; return; }
            var results = MinerDB.search(query).slice(0, 8);
            if (results.length === 0) { dropdown.style.display = 'none'; return; }
            var html = '';
            for (var i = 0; i < results.length; i++) {
                html += '<div class="miner-dropdown-item" data-idx="' + i + '">' + results[i].model + ' <span style="color:#888; font-size:11px;">' + results[i].hashrate + ' TH/s | ' + results[i].power + ' kW</span></div>';
            }
            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
            var items = dropdown.querySelectorAll('.miner-dropdown-item');
            for (var j = 0; j < items.length; j++) {
                (function(item, idx) {
                    item.addEventListener('click', function() {
                        var miner = results[idx];
                        input.value = miner.model;
                        setter(miner);
                        dropdown.style.display = 'none';
                        renderComparison();
                    });
                })(items[j], j);
            }
        });
        input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 200); });
    }

    setupDropdown(inputA, dropA, function(m) { compareAMiner = m; });
    setupDropdown(inputB, dropB, function(m) { compareBMiner = m; });
}

function renderComparison() {
    var container = document.getElementById('comparisonResults');
    if (!container || (!compareAMiner && !compareBMiner)) { if (container) container.innerHTML = ''; return; }

    var btcPrice = parseFloat(el.btcPrice.value) || 96000;
    var elecCost = parseFloat(el.elecCost.value) || 0.07;
    var poolFee = (parseFloat(el.poolFee.value) || 0) / 100;
    // Read through the engine's normaliser so a 0 uptime means 0 here too. `|| 100` treated a
    // legitimate 0 as "missing" and silently ran this panel at full uptime while the projection
    // above correctly showed zero production.
    var uptime = CalcEngine.normalise(currentSettings()).uptimePct;
    var diff = (parseFloat(el.difficulty.value) || 125.86) * 1e12;
    var blockReward = getBlockReward(new Date());

    function calcMiner(m) {
        if (!m) return null;
        var hH = m.hashrate * 1e12;
        var dailyBTC = (hH * SECONDS_PER_DAY * blockReward) / (diff * TWO_POW_32) * (1 - poolFee) * uptime;
        var dailyRev = dailyBTC * btcPrice;
        var dailyElec = m.power * 24 * elecCost * uptime;
        var dailyProfit = dailyRev - dailyElec;
        var breakeven = dailyProfit > 0 ? Math.ceil(m.cost / dailyProfit) : Infinity;
        var roi12m = m.cost > 0 ? ((dailyProfit * 365 - m.cost) / m.cost * 100) : 0;
        return { model: m.model, hashrate: m.hashrate, power: m.power, cost: m.cost, efficiency: m.efficiency, dailyBTC: dailyBTC, dailyRev: dailyRev, dailyElec: dailyElec, dailyProfit: dailyProfit, breakeven: breakeven, roi12m: roi12m };
    }

    var a = calcMiner(compareAMiner);
    var b = calcMiner(compareBMiner);

    function row(label, valA, valB, higherBetter) {
        var aWin = '', bWin = '';
        if (a && b) {
            if (higherBetter) { if (valA > valB) aWin = ' style="color:#4ade80"'; else if (valB > valA) bWin = ' style="color:#4ade80"'; }
            else { if (valA < valB) aWin = ' style="color:#4ade80"'; else if (valB < valA) bWin = ' style="color:#4ade80"'; }
        }
        return '<tr><td style="color:#888;">' + label + '</td>' +
            '<td' + aWin + '>' + (a ? formatVal(label, valA) : '--') + '</td>' +
            '<td' + bWin + '>' + (b ? formatVal(label, valB) : '--') + '</td></tr>';
    }

    function formatVal(label, v) {
        if (label === 'Hashrate') return v + ' TH/s';
        if (label === 'Power') return v + ' kW';
        if (label === 'Cost') return fmtUSD(v);
        if (label === 'Efficiency') return v + ' J/TH';
        if (label === 'Daily BTC') return fmtBTC(v, 8);
        if (label === 'Daily Revenue') return fmtUSD(v);
        if (label === 'Daily Elec.') return fmtUSD(v);
        if (label === 'Daily Profit') return fmtUSD(v);
        if (label === 'Breakeven') return v === Infinity ? 'Never' : v + ' days';
        if (label === '12-Mo ROI') return v.toFixed(1) + '%';
        return v;
    }

    var html = '<div class="table-scroll"><table><thead><tr><th>Metric</th><th>' + (a ? a.model : 'Miner A') + '</th><th>' + (b ? b.model : 'Miner B') + '</th></tr></thead><tbody>' +
        row('Hashrate', a ? a.hashrate : 0, b ? b.hashrate : 0, true) +
        row('Power', a ? a.power : 0, b ? b.power : 0, false) +
        row('Cost', a ? a.cost : 0, b ? b.cost : 0, false) +
        row('Efficiency', a ? a.efficiency : 0, b ? b.efficiency : 0, false) +
        row('Daily BTC', a ? a.dailyBTC : 0, b ? b.dailyBTC : 0, true) +
        row('Daily Revenue', a ? a.dailyRev : 0, b ? b.dailyRev : 0, true) +
        row('Daily Elec.', a ? a.dailyElec : 0, b ? b.dailyElec : 0, false) +
        row('Daily Profit', a ? a.dailyProfit : 0, b ? b.dailyProfit : 0, true) +
        row('Breakeven', a ? a.breakeven : Infinity, b ? b.breakeven : Infinity, false) +
        row('12-Mo ROI', a ? a.roi12m : 0, b ? b.roi12m : 0, true) +
        '</tbody></table></div>';
    container.innerHTML = html;
}
// ===== SCENARIOS =====
// Save a full set of inputs under a name and compare saved scenarios side by side against
// the live one. Comparison runs each scenario through CalcEngine without touching the DOM,
// which is why the projection math had to be extracted from recalculate() first.

var ScenarioData = (function() {
    var KEY = 'ionMiningScenarios';

    function defaultData() { return { _v: 1, scenarios: [] }; }

    function getData() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return defaultData();
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.scenarios)) return defaultData();
            return parsed;
        } catch (e) { return defaultData(); }
    }

    function saveData(data) {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
        if (typeof SyncEngine !== 'undefined') SyncEngine.save('scenarios', data);
    }

    function add(name, settings) {
        var data = getData();
        var entry = {
            id: 'scn_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: String(name || 'Untitled').slice(0, 60),
            created: new Date().toISOString(),
            settings: JSON.parse(JSON.stringify(settings))
        };
        data.scenarios.push(entry);
        saveData(data);
        return entry;
    }

    function remove(id) {
        var data = getData();
        data.scenarios = data.scenarios.filter(function(s) { return s.id !== id; });
        saveData(data);
    }

    function rename(id, name) {
        var data = getData();
        for (var i = 0; i < data.scenarios.length; i++) {
            if (data.scenarios[i].id === id) { data.scenarios[i].name = String(name).slice(0, 60); break; }
        }
        saveData(data);
    }

    function get(id) {
        var data = getData();
        for (var i = 0; i < data.scenarios.length; i++) if (data.scenarios[i].id === id) return data.scenarios[i];
        return null;
    }

    return { getData: getData, add: add, remove: remove, rename: rename, get: get };
})();

var selectedScenarioIds = [];   // ids currently ticked for comparison

function escapeHtmlCalc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderScenarioList() {
    var listEl = document.getElementById('scenarioList');
    if (!listEl) return;
    var data = ScenarioData.getData();

    if (!data.scenarios.length) {
        listEl.innerHTML = '<div class="scenario-empty">No saved scenarios yet. Set up your inputs, ' +
            'then use <strong>Save Current</strong> above to keep them for comparison.</div>';
        renderScenarioComparison();
        return;
    }

    var html = '';
    for (var i = 0; i < data.scenarios.length; i++) {
        var s = data.scenarios[i];
        var checked = selectedScenarioIds.indexOf(s.id) >= 0 ? ' checked' : '';
        var when = String(s.created || '').slice(0, 10);
        html += '<div class="scenario-chip">' +
            '<label class="scenario-chip-main">' +
                '<input type="checkbox" data-scn-compare="' + escapeHtmlCalc(s.id) + '"' + checked + '>' +
                '<span class="scenario-name">' + escapeHtmlCalc(s.name) + '</span>' +
                '<span class="scenario-date">' + escapeHtmlCalc(when) + '</span>' +
            '</label>' +
            '<button class="scenario-btn" data-scn-load="' + escapeHtmlCalc(s.id) + '" title="Load into the calculator">Load</button>' +
            '<button class="scenario-btn" data-scn-rename="' + escapeHtmlCalc(s.id) + '" title="Rename">Rename</button>' +
            '<button class="scenario-btn scenario-btn-danger" data-scn-delete="' + escapeHtmlCalc(s.id) + '" title="Delete">&times;</button>' +
        '</div>';
    }
    listEl.innerHTML = html;
    renderScenarioComparison();
}

// Break-even expressed in months, so scenarios on different period lengths are comparable
function breakEvenMonths(r) {
    if (r.breakEvenPeriod === null) return Infinity;
    return r.breakEvenPeriod * (r.periodConfig.days / 30.44);
}

// Rows shown in the comparison table. `fmt` receives the CalcEngine result.
var SCENARIO_ROWS = [
    { label: 'BTC price', fmt: function(r) { return fmtUSD(r.params.btcPrice0); } },
    { label: 'Price change / mo', fmt: function(r) { return (r.params.monthlyPriceChangePct * 100).toFixed(2) + '%'; } },
    { label: 'Difficulty change / mo', fmt: function(r) { return (r.params.monthlyDiffChangePct * 100).toFixed(2) + '%'; } },
    { label: 'Machines', fmt: function(r) { return String(r.params.machineCount); } },
    { label: 'Hashrate each', fmt: function(r) { return r.params.hashrateTH + ' TH/s'; } },
    { label: 'Electricity', fmt: function(r) { return getCurrencySymbol() + r.params.elecCost.toFixed(4) + '/kWh'; } },
    { label: 'HODL ratio', fmt: function(r) { return (r.params.hodlPct * 100).toFixed(0) + '%'; } },
    { label: 'Horizon', fmt: function(r) { return r.params.numPeriods + ' ' + r.periodConfig.label; } },
    { label: 'Up-front cost', fmt: function(r) { return fmtUSD(r.totalInitialInvestment); }, divider: true },
    { label: 'Daily profit (day 1)', fmt: function(r) { return fmtUSD(r.params.taxAdjustmentEnabled ? r.dailyAfterTaxProfitDay1 : r.dailyProfitDay1); }, sign: function(r) { return (r.params.taxAdjustmentEnabled ? r.dailyAfterTaxProfitDay1 : r.dailyProfitDay1); } },
    { label: 'Cost / 1 BTC', fmt: function(r) { return fmtUSD(r.costPerBTC); }, best: 'low', val: function(r) { return r.costPerBTC; } },
    { label: 'Total BTC mined', fmt: function(r) { return fmtBTC(r.cumulBtcMined, 6); }, best: 'high', val: function(r) { return r.cumulBtcMined; } },
    { label: 'Total P/L', fmt: function(r) { return fmtUSD(r.totalPL); }, best: 'high', val: function(r) { return r.totalPL; }, sign: function(r) { return r.totalPL; } },
    { label: 'ROI', fmt: function(r) { return r.totalInitialInvestment > 0 ? (r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '%' : '—'; }, best: 'high', val: function(r) { return r.roi; }, sign: function(r) { return r.roi; } },
    // Break-even is a raw period index, and two scenarios can use different period lengths —
    // ranking 359 "days" against 13 "months" would pick the wrong winner. Normalise to months
    // for both the ranking and the display.
    { label: 'Break-even', best: 'low',
      val: function(r) { return r.breakEvenPeriod === null ? Infinity : breakEvenMonths(r); },
      fmt: function(r) {
          if (r.breakEvenPeriod === null) return 'Never';
          var m = breakEvenMonths(r);
          var native = r.breakEvenPeriod + ' ' + r.periodConfig.label;
          // Only add the months translation when the scenario is not already in months
          return r.periodConfig.label === 'months' ? native : native + ' (' + m.toFixed(1) + ' mo)';
      } },
    { label: 'vs Buy & Hold', fmt: function(r) { return (r.isMiningBetter ? '+' : '') + fmtUSD(r.miningAdvantage); }, best: 'high', val: function(r) { return r.miningAdvantage; }, sign: function(r) { return r.miningAdvantage; } }
];

function renderScenarioComparison() {
    var box = document.getElementById('scenarioCompare');
    if (!box) return;

    var cols = [];
    if (lastResult) cols.push({ name: 'Current', result: lastResult, isCurrent: true });
    for (var i = 0; i < selectedScenarioIds.length; i++) {
        var s = ScenarioData.get(selectedScenarioIds[i]);
        if (!s) continue;
        try {
            cols.push({ name: s.name, result: CalcEngine.computeProjection(s.settings) });
        } catch (e) { /* a corrupt scenario must not take the page down */ }
    }

    if (cols.length < 2) {
        box.innerHTML = '<div class="scenario-empty">Tick two or more saved scenarios to compare them ' +
            'against your current inputs.</div>';
        return;
    }

    var html = '<div class="table-scroll"><table class="scenario-table"><thead><tr><th>Metric</th>';
    for (var c = 0; c < cols.length; c++) {
        html += '<th' + (cols[c].isCurrent ? ' class="scn-current"' : '') + '>' + escapeHtmlCalc(cols[c].name) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var rI = 0; rI < SCENARIO_ROWS.length; rI++) {
        var row = SCENARIO_ROWS[rI];
        // Which column wins this row (only for rows that declare a direction)
        var bestIdx = -1;
        if (row.best && row.val) {
            var bestVal = null;
            for (var k = 0; k < cols.length; k++) {
                var v = row.val(cols[k].result);
                if (!isFinite(v)) continue;
                if (bestVal === null || (row.best === 'high' ? v > bestVal : v < bestVal)) { bestVal = v; bestIdx = k; }
            }
        }
        html += '<tr' + (row.divider ? ' class="scn-divider"' : '') + '><td class="scn-metric">' + row.label + '</td>';
        for (var j = 0; j < cols.length; j++) {
            var cls = [];
            if (j === bestIdx) cls.push('scn-best');
            if (row.sign) cls.push(row.sign(cols[j].result) >= 0 ? 'positive' : 'negative');
            html += '<td class="' + cls.join(' ') + '">' + row.fmt(cols[j].result) + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>' +
        '<div class="scenario-note">Highlighted cells are the best value in that row. ' +
        'Every column is computed with the same engine as the live projection.</div>';
    box.innerHTML = html;
}

(function wireScenarios() {
    var saveBtn = document.getElementById('btnSaveScenario');
    var nameInput = document.getElementById('scenarioName');
    if (saveBtn && nameInput) {
        saveBtn.addEventListener('click', function() {
            var name = nameInput.value.trim();
            if (!name) {
                var pCfg = CalcEngine.PERIOD_CONFIG[periodLengthSel.value] || CalcEngine.PERIOD_CONFIG.monthly;
                name = el.machineCount.value + '× ' + el.hashrate.value + 'TH @ ' +
                       getCurrencySymbol() + el.elecCost.value + ' · ' + el.investPeriod.value + ' ' + pCfg.label;
            }
            var entry = ScenarioData.add(name, currentSettings());
            nameInput.value = '';
            if (selectedScenarioIds.length < 3) selectedScenarioIds.push(entry.id);
            renderScenarioList();
        });
        nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveBtn.click(); });
    }

    var listEl = document.getElementById('scenarioList');
    if (listEl) {
        listEl.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            var loadId = btn.getAttribute('data-scn-load');
            var delId = btn.getAttribute('data-scn-delete');
            var renId = btn.getAttribute('data-scn-rename');
            if (loadId) { loadScenario(loadId); return; }
            if (delId) {
                var s = ScenarioData.get(delId);
                if (s && confirm('Delete scenario "' + s.name + '"?')) {
                    ScenarioData.remove(delId);
                    selectedScenarioIds = selectedScenarioIds.filter(function(x) { return x !== delId; });
                    renderScenarioList();
                }
                return;
            }
            if (renId) {
                var cur = ScenarioData.get(renId);
                var next = prompt('Rename scenario', cur ? cur.name : '');
                if (next && next.trim()) { ScenarioData.rename(renId, next.trim()); renderScenarioList(); }
            }
        });
        listEl.addEventListener('change', function(e) {
            var cb = e.target.closest('[data-scn-compare]');
            if (!cb) return;
            var id = cb.getAttribute('data-scn-compare');
            if (cb.checked) {
                if (selectedScenarioIds.indexOf(id) < 0) selectedScenarioIds.push(id);
            } else {
                selectedScenarioIds = selectedScenarioIds.filter(function(x) { return x !== id; });
            }
            renderScenarioComparison();
        });
    }
})();

// Push a saved scenario back into the inputs, then recalculate
function loadScenario(id) {
    var s = ScenarioData.get(id);
    if (!s) return;
    var v = s.settings || {};
    inputIds.forEach(function(k) { if (v[k] !== undefined) el[k].value = v[k]; });
    if (v.periodLength) periodLengthSel.value = v.periodLength;
    reinvestToggle.checked = !!v.reinvest;
    additionCapexToggle.checked = v.additionCapex !== false;
    savingsElecToggle.checked = !!v.savingsElec;
    autoReplaceToggle.checked = v.autoReplace !== false;
    taxAdjustmentToggle.checked = !!v.taxAdjustment;
    if (v.miningIncomeTaxRate !== undefined) miningIncomeTaxRateInput.value = v.miningIncomeTaxRate;
    if (v.capitalGainsTaxRate !== undefined) capitalGainsTaxRateInput.value = v.capitalGainsTaxRate;

    // Keep the toggle rows' visual state in step with the restored values
    reinvestRow.classList.toggle('active', reinvestToggle.checked);
    additionCapexRow.classList.toggle('active', additionCapexToggle.checked);
    savingsElecRow.classList.toggle('active', savingsElecToggle.checked);
    autoReplaceRow.classList.toggle('active', autoReplaceToggle.checked);
    taxAdjustmentRow.classList.toggle('active', taxAdjustmentToggle.checked);
    taxRateInputs.style.display = taxAdjustmentToggle.checked ? '' : 'none';
    hodlSlider.value = el.hodlRatio.value;

    recalculate();
}

// ===== HISTORICAL GROUNDING =====
// Two features that replace guesses with what actually happened:
//   1. Trailing-rate presets for the price/difficulty growth assumptions.
//   2. A backtest that replays the rig against real daily price and real difficulty.
// Both read from the same cached history the Data and Cycle pages already use.

var histPrice = null;        // [{ time, close }] daily
var histDifficulty = null;   // [{ time, difficulty }] per retarget
var btChart = null;
var currentBtDays = 365;

// recalculate() runs on every keystroke; a full replay + chart rebuild there would feel laggy,
// so the backtest is debounced behind it.
var _btTimer = null;
function scheduleBacktest() {
    if (_btTimer) clearTimeout(_btTimer);
    _btTimer = setTimeout(renderBacktest, 250);
}

function ratePct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

// --- Backtest ---
function renderBacktest() {
    var cardsEl = document.getElementById('btCards');
    var realityEl = document.getElementById('btReality');
    if (!cardsEl) return;

    if (!histPrice || !histDifficulty) {
        cardsEl.innerHTML = '<div class="empty-state" style="padding:16px;"><p>Historical data unavailable</p>' +
            '<div class="hint">Needs the price and difficulty history APIs</div></div>';
        if (realityEl) realityEl.textContent = '';
        return;
    }

    var machines = Math.max(1, parseInt(el.machineCount.value) || 1);
    var bt = NetworkHistory.runBacktest({
        priceSeries: histPrice,
        difficultySeries: histDifficulty,
        getBlockReward: PriceHistory.getBlockReward,
        days: currentBtDays,
        hashrateTH: parseFloat(el.hashrate.value) || 0,
        powerKW: parseFloat(el.power.value) || 0,
        machineCount: machines,
        elecCost: parseFloat(el.elecCost.value) || 0,
        poolFeePct: (parseFloat(el.poolFee.value) || 0) / 100,
        uptimePct: CalcEngine.normalise(currentSettings()).uptimePct,   // honours a 0 uptime
        capex: parseFloat(el.capex.value) || 0,
        infrastructureCost: parseFloat(el.infrastructureCost.value) || 0
    });
    if (!bt) { cardsEl.innerHTML = ''; return; }

    var mult = getCurrencyMultiplier();
    var profitCls = bt.profitUSD >= 0 ? 'positive' : 'negative';
    var netCls = bt.netAfterCapex >= 0 ? 'positive' : 'negative';

    function c(label, value, sub, cls) {
        return '<div class="metric-card"><div class="label">' + label + '</div>' +
            '<div class="value ' + cls + '">' + value + '</div>' +
            '<div class="sub">' + sub + '</div></div>';
    }
    var months = bt.days / 30.44;
    cardsEl.innerHTML =
        c('BTC Mined', fmtBTC(bt.btcMined, 6), 'over ' + bt.days + ' days', 'btc-orange') +
        c('Revenue', fmtUSD(bt.revenueUSD * mult), 'at each day’s real price', 'btc-orange') +
        // fmtUSD rounds to 2dp, which turns a 0.055 rate into "$0.06" — show 4dp like the
        // electricity figures on the Banking page do.
        c('Electricity', fmtUSD(bt.elecUSD * mult),
          'at ' + getCurrencySymbol() + ((parseFloat(el.elecCost.value) || 0) * mult).toFixed(4) + '/kWh', 'negative') +
        c('Gross Profit', fmtUSD(bt.profitUSD * mult), 'revenue − power', profitCls) +
        c('After Hardware', fmtUSD(bt.netAfterCapex * mult), 'incl. ' + fmtUSD(bt.capexUSD * mult) + ' capex', netCls) +
        c('If Held To Today', fmtUSD(bt.heldValueUSD * mult), 'all mined BTC, unsold', 'neutral');

    var headline = document.getElementById('btHeadline');
    if (headline) headline.textContent = fmtBTC(bt.btcMined, 6) + ' BTC';
    var title = document.getElementById('btTitle');
    if (title) {
        var lbl = currentBtDays === 180 ? '6 Months' : currentBtDays === 365 ? '1 Year'
            : currentBtDays === 730 ? '2 Years' : '3 Years';
        title.textContent = 'What This Rig Would Have Earned (Last ' + lbl + ')';
    }

    // Reality check: compare the user's forward assumptions against what this window actually did
    if (realityEl) {
        var assumedDiff = parseFloat(el.diffChange.value) || 0;
        var assumedPrice = parseFloat(el.priceChange.value) || 0;
        var actualDiff = bt.difficultyRatePctPerMonth;
        var actualPrice = bt.priceRatePctPerMonth;
        var msg = 'Over this window difficulty actually moved <strong>' + ratePct(actualDiff) +
            '/mo</strong> and price <strong>' + ratePct(actualPrice) + '/mo</strong>. ' +
            'Your projection assumes ' + ratePct(assumedDiff) + '/mo and ' + ratePct(assumedPrice) + '/mo.';
        var warns = [];
        if (assumedDiff < actualDiff - 0.5) warns.push('your difficulty assumption is gentler than this window');
        if (assumedPrice > actualPrice + 0.5) warns.push('your price assumption is more optimistic than this window');
        if (warns.length) msg += ' <span class="bt-warn">Note: ' + warns.join(', ') + '.</span>';
        realityEl.innerHTML = msg;
    }

    renderBacktestChart(bt, mult);
}

function renderBacktestChart(bt, mult) {
    var canvas = document.getElementById('btChart');
    if (!canvas) return;

    // Downsample but always keep the final point
    var n = bt.series.length;
    var step = Math.max(1, Math.floor(n / 400));
    var idxs = [];
    for (var i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);

    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var labels = [], profit = [], revenue = [], elec = [];
    for (var k = 0; k < idxs.length; k++) {
        var s = bt.series[idxs[k]];
        var d = new Date(s.time * 1000);
        labels.push(months[d.getUTCMonth()] + ' ' + d.getUTCFullYear().toString().slice(2));
        revenue.push(+(s.cumulRevenue * mult).toFixed(2));
        elec.push(+(s.cumulElec * mult).toFixed(2));
        profit.push(+(s.cumulProfit * mult).toFixed(2));
    }

    if (btChart) btChart.destroy();
    btChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Cumulative revenue', data: revenue, borderColor: '#f7931a', backgroundColor: 'rgba(247,147,26,0.10)', fill: true, borderWidth: 1.8, pointRadius: 0, tension: 0 },
                { label: 'Cumulative power cost', data: elec, borderColor: '#ef4444', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, pointRadius: 0, tension: 0 },
                { label: 'Cumulative profit', data: profit, borderColor: '#4ade80', backgroundColor: 'transparent', fill: false, borderWidth: 2, pointRadius: 0, tension: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: {} },
                tooltip: {
                    borderColor: 'rgba(255,255,255,0.10)', borderWidth: 1, padding: 10,
                    callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtUSD(ctx.parsed.y); } }
                }
            },
            scales: {
                x: { ticks: { color: mutedColor(), font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: gridColor() } },
                y: {
                    ticks: {
                        color: mutedColor(), font: { size: 11 },
                        callback: function(v) {
                            var s = getCurrencySymbol();
                            // Rounding to whole thousands collides on a narrow range and the
                            // axis reads "$5k, $5k, $4k, $4k…" — show the real number instead.
                            if (Math.abs(v) >= 1e6) return s + (v / 1e6).toFixed(2) + 'M';
                            return s + Math.round(v).toLocaleString();
                        }
                    },
                    grid: { color: gridColor() }
                }
            }
        }
    });
}

(function wireBacktestRange() {
    var box = document.getElementById('btRange');
    if (!box) return;
    box.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var btns = box.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        btn.classList.add('active');
        currentBtDays = parseInt(btn.dataset.days, 10) || 365;
        renderBacktest();
    });
})();

async function loadHistoricalData() {
    // Independent so one failing source does not blank the other feature
    try { histPrice = await PriceHistory.fetchPriceHistory(); } catch (e) { histPrice = null; }
    try { histDifficulty = await NetworkHistory.fetchDifficultyHistory(); } catch (e) { histDifficulty = null; }
    renderBacktest();
}

// ===== INIT =====
initNav('calculator');
initChart();
loadSettings();
initMinerComparison();

window.onCurrencyChange = function() {
    // fmtUSD() switches symbol immediately, so the BTC price input has to be re-denominated
    // too — otherwise the page renders USD figures labelled with the new currency's symbol.
    var newPrice = window.liveBtcPrices && window.liveBtcPrices[window.selectedCurrency];
    if (newPrice) el.btcPrice.value = newPrice;
    recalculate();
    renderBacktest();
};

// Chart colours are baked in at construction time, so rebuild on theme change.

// Restore fleet toggle state
var ionSettings = FleetData.getSettings();
if (ionSettings.useFleetData) {
    useFleetToggle.checked = true;
    applyFleetData();
}

// Paint any previously saved scenarios. Without this the list only ever rendered as a side
// effect of save/delete/rename, so scenarios saved in an earlier session were invisible after
// a reload — present in localStorage but with no UI to load, rename, delete or compare them.
renderScenarioList();

recalculate();
fetchLiveData().then(() => recalculate());

// Historical grounding loads after the page is already usable — the projection does not
// depend on it, and a slow/failed fetch must not block the calculator.
loadHistoricalData();
