/* Sizing and economics shared by the mine builder UI and its tests.
   BTC production comes from CalcEngine, including pool fees, uptime,
   difficulty growth and projected halvings. Rendering never prices a mine. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./calc-engine.js'));
    else root.MineBuilderModel = factory(root.CalcEngine);
})(typeof self !== 'undefined' ? self : this, function (engine) {
    'use strict';

    var DEFAULTS = {
        sizing: 'power', source: 'gas', powerMW: 1, gasMcf: 240,
        gasBtu: 1000, heatRate: 10000, machineCount: 160,
        model: 'Antminer S21+ Hyd.', cooling: 'hydro',
        hashrate: 395, power: 5.925, capex: 2649,
        overhead: 5, elecCost: 0.07, uptime: 95, poolFee: 2,
        btcPrice: 96000, difficulty: 125.86, diffChange: 2, priceChange: 0,
        infrastructureCost: 0, slots: 240, containerMW: 1.5
    };
    var LIMITS = {
        powerMW: [0, 1000], gasMcf: [0, 1000000], gasBtu: [100, 3000], heatRate: [3000, 30000],
        machineCount: [0, 1000000], hashrate: [0.1, 100000], power: [0.01, 1000],
        capex: [0, 10000000], overhead: [0, 100], elecCost: [0, 10],
        uptime: [0, 100], poolFee: [0, 100], btcPrice: [1, 100000000],
        difficulty: [0.01, 10000000], diffChange: [-20, 100], priceChange: [-20, 100],
        infrastructureCost: [0, 10000000000], slots: [1, 1000], containerMW: [0.01, 100]
    };
    var LABELS = {
        powerMW: 'Available power', gasMcf: 'Gas flow', gasBtu: 'Gas heating value', heatRate: 'Generator heat rate',
        machineCount: 'Machine count', hashrate: 'Hashrate per machine', power: 'Power per machine', capex: 'Price per machine',
        overhead: 'Cooling and site overhead', elecCost: 'Electricity rate', uptime: 'Uptime', poolFee: 'Pool fee',
        btcPrice: 'BTC price', difficulty: 'Network difficulty', diffChange: 'Monthly difficulty change',
        priceChange: 'Monthly BTC price change', infrastructureCost: 'Infrastructure budget', slots: 'Slots per container',
        containerMW: 'IT capacity per container'
    };

    function normalise(input) {
        var s = Object.assign({}, DEFAULTS, input), errors = [];
        var skip = { powerMW: s.sizing !== 'power', machineCount: s.sizing !== 'machines',
            gasMcf: s.sizing !== 'gas', gasBtu: s.sizing !== 'gas', heatRate: s.sizing !== 'gas' };
        if (['power', 'gas', 'machines'].indexOf(s.sizing) < 0) errors.push({ field: 'sizing', message: 'Choose how to size your mine.' });
        if (['gas', 'grid'].indexOf(s.source) < 0) errors.push({ field: 'source', message: 'Choose a power source.' });
        if (['hydro', 'air', 'immersion'].indexOf(s.cooling) < 0) errors.push({ field: 'cooling', message: 'Choose a cooling type.' });
        Object.keys(LIMITS).forEach(function (key) {
            if (skip[key]) return;
            var n = s[key] === '' || s[key] === null ? NaN : Number(s[key]);
            var bounds = LIMITS[key];
            if (!isFinite(n) || n < bounds[0] || n > bounds[1]) {
                errors.push({ field: key, message: LABELS[key] + ': enter a number from ' + bounds[0] + ' to ' + bounds[1] + '.' });
            } else if ((key === 'slots' || key === 'machineCount') && Math.floor(n) !== n) {
                errors.push({ field: key, message: LABELS[key] + ' must be a whole number.' });
            } else s[key] = n;
        });
        if (s.sizing === 'gas') s.source = 'gas';
        return { settings: s, errors: errors };
    }

    function estimate(input, startDate) {
        var checked = normalise(input), s = checked.settings;
        if (checked.errors.length) return { valid: false, errors: checked.errors };
        var effectiveKW = s.power * (1 + s.overhead / 100);
        var availableKW = s.sizing === 'gas' ? s.gasMcf * 1000 * s.gasBtu / s.heatRate / 24
            : s.sizing === 'power' ? s.powerMW * 1000 : s.machineCount * effectiveKW;
        var count = s.sizing === 'machines' ? s.machineCount : Math.floor(availableKW / effectiveKW + 1e-10);
        var perContainer = Math.min(s.slots, Math.floor(s.containerMW * 1000 / s.power + 1e-10));
        if (perContainer < 1 && count > 0) return { valid: false, errors: [{ field: 'containerMW',
            message: 'Container IT capacity must support at least one of these machines.' }] };
        var siteKW = count * effectiveKW;
        var containers = count ? Math.ceil(count / perContainer) : 0;
        var settings = {
            machineCount: count, hashrate: s.hashrate, power: effectiveKW, capex: s.capex,
            infrastructureCost: s.infrastructureCost, elecCost: s.elecCost, uptime: s.uptime,
            poolFee: s.poolFee, btcPrice: s.btcPrice, difficulty: s.difficulty,
            diffChange: s.diffChange, priceChange: s.priceChange, periodLength: 'daily', investPeriod: 365,
            autoReplace: false, additionCapex: false, reinvest: false, replacementEnabled: false,
            minerLifespan: 36, salvageValue: 0, minerAdditions: 0, btcTreasury: 0,
            taxAdjustment: false, hodlRatio: 100, coverElec: false, startDate: startDate || new Date()
        };
        // CalcEngine normalises machineCount to >= 1. Never call it for an empty fleet.
        var projection = count ? engine.computeProjection(settings) : null;
        var rows = projection ? projection.tableRows : [];
        var dailyRevenue = projection ? projection.dailyRevenueDay1 : 0;
        var dailyEnergy = projection ? projection.dailyElecDay1 : 0;
        var btcDay = dailyRevenue / s.btcPrice;
        var btc30 = rows.slice(0, 30).reduce(function (sum, row) { return sum + row.pnlBtc; }, 0);
        var yearRevenue = rows.reduce(function (sum, row) { return sum + row.pnlBtc * row.btcPrice; }, 0);
        var yearEnergy = projection ? projection.cumulElecCost : 0;
        var kwhDay = siteKW * 24 * s.uptime / 100;
        return {
            valid: true, settings: s, calculatorSettings: settings, count: count,
            availableKW: availableKW, siteKW: siteKW, itKW: count * s.power,
            unusedKW: Math.max(0, availableKW - siteKW), hashrateTH: count * s.hashrate,
            containers: containers, perContainer: perContainer,
            generators: s.source === 'gas' && siteKW > 0 ? Math.ceil(siteKW / 1500) : 0,
            btcDay: btcDay, btc30: btc30, btcYear: projection ? projection.cumulBtcMined : 0,
            revenueDay: dailyRevenue, energyDay: dailyEnergy, marginDay: dailyRevenue - dailyEnergy,
            marginYear: yearRevenue - yearEnergy, kwhDay: kwhDay,
            energyPerBTC: btcDay > 0 ? dailyEnergy / btcDay : null,
            breakEvenRate: kwhDay > 0 ? dailyRevenue / kwhDay : null,
            hardwareCost: count * s.capex, totalCost: count * s.capex + s.infrastructureCost,
            efficiency: s.power * 1000 / s.hashrate,
            curve: [0].concat(rows.filter(function (r, i) { return (i + 1) % 30 === 0 || i === 364; })
                .map(function (r) { return r.btcHodlCumul; }))
        };
    }

    function calculatorURL(result) {
        if (!result.valid || result.count < 1) return null;
        var q = new URLSearchParams();
        q.set('minerModel', '__custom__');
        Object.keys(result.calculatorSettings).forEach(function (key) {
            if (key === 'startDate') return;
            var v = result.calculatorSettings[key];
            q.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
        });
        return './calculator.html?' + q.toString();
    }

    function coolingFor(model) {
        if (/Hyd\./.test(model)) return 'hydro';
        if (/M66|M56|A1566I/.test(model)) return 'immersion';
        return 'air';
    }
    return { defaults: DEFAULTS, limits: LIMITS, estimate: estimate, calculatorURL: calculatorURL, coolingFor: coolingFor };
});
