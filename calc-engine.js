// ===== ION MINING GROUP — Mining Projection Engine =====
// Pure projection math, extracted from calculator.js so it can be:
//   1. called for scenarios that are NOT currently in the DOM (side-by-side comparison), and
//   2. regression-tested directly in node with no browser.
//
// No DOM, no network, no globals beyond the export. Every input is explicit — including
// `startDate`, so tests are deterministic.

var CalcEngine = (function() {

    var SECONDS_PER_DAY = 86400;
    var TWO_POW_32 = 4294967296;
    var CURRENT_BLOCK_REWARD = 3.125;

    var PERIOD_CONFIG = {
        daily:   { days: 1,     perMonth: 30.44, label: 'days',   labelSingular: 'day' },
        weekly:  { days: 7,     perMonth: 4.348, label: 'weeks',  labelSingular: 'week' },
        monthly: { days: 30.44, perMonth: 1,     label: 'months', labelSingular: 'month' }
    };

    // Projected halving dates. Runs to 2100 because the horizon allows up to 730 periods.
    var HALVINGS = [
        { ts: Date.parse('2028-04-17'), reward: 1.5625 },
        { ts: Date.parse('2032-04-17'), reward: 0.78125 },
        { ts: Date.parse('2036-04-17'), reward: 0.390625 },
        { ts: Date.parse('2040-04-17'), reward: 0.1953125 },
        { ts: Date.parse('2044-04-17'), reward: 0.09765625 },
        { ts: Date.parse('2048-04-17'), reward: 0.048828125 },
        { ts: Date.parse('2052-04-17'), reward: 0.0244140625 },
        { ts: Date.parse('2056-04-17'), reward: 0.01220703125 },
        { ts: Date.parse('2060-04-17'), reward: 0.006103515625 },
        { ts: Date.parse('2064-04-17'), reward: 0.0030517578125 },
        { ts: Date.parse('2068-04-17'), reward: 0.00152587890625 },
        { ts: Date.parse('2072-04-17'), reward: 0.000762939453125 },
        { ts: Date.parse('2076-04-17'), reward: 0.0003814697265625 },
        { ts: Date.parse('2080-04-17'), reward: 0.00019073486328125 },
        { ts: Date.parse('2084-04-17'), reward: 0.000095367431640625 },
        { ts: Date.parse('2088-04-17'), reward: 0.0000476837158203125 },
        { ts: Date.parse('2092-04-17'), reward: 0.00002384185791015625 },
        { ts: Date.parse('2096-04-17'), reward: 0.000011920928955078125 },
        { ts: Date.parse('2100-04-17'), reward: 0.0000059604644775390625 }
    ];

    // `when` is a Date or an epoch-ms number
    function getBlockReward(when) {
        var ts = (when instanceof Date) ? when.getTime() : when;
        var reward = CURRENT_BLOCK_REWARD;
        for (var i = 0; i < HALVINGS.length; i++) {
            if (ts >= HALVINGS[i].ts) reward = HALVINGS[i].reward;
        }
        return reward;
    }

    function num(v, fallback) {
        var n = parseFloat(v);
        return isFinite(n) ? n : fallback;
    }
    function int(v, fallback) {
        var n = parseInt(v, 10);
        return isFinite(n) ? n : fallback;
    }

    // Normalise a loose settings object (the same shape calculator.js persists) into the
    // fully-resolved numeric parameters the projection needs.
    //
    // NOTE: deliberately NOT using `parseFloat(x) || fallback`. That idiom treats a genuine
    // 0 as "missing" — setting Uptime to 0 silently became 100%, and a 0 hashrate became
    // 335 TH/s. num()/int() already substitute the fallback only for non-numeric input, so
    // 0 survives. Values that are used as divisors get an explicit positive floor instead,
    // and ratios are clamped so a 200% pool fee cannot invert revenue.
    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    function normalise(s) {
        s = s || {};
        var periodLength = PERIOD_CONFIG[s.periodLength] ? s.periodLength : 'monthly';
        return {
            btcPrice0: Math.max(1e-8, num(s.btcPrice, 96000)),        // divisor in buy & hold
            monthlyPriceChangePct: num(s.priceChange, 0) / 100,
            difficultyT: Math.max(1e-12, num(s.difficulty, 125.86)),  // divisor in the reward formula
            monthlyDiffChangePct: num(s.diffChange, 0) / 100,
            numPeriods: Math.max(1, int(s.investPeriod, 24)),
            hashrateTH: Math.max(0, num(s.hashrate, 335)),
            powerKW: Math.max(0, num(s.power, 5.36)),
            capex: Math.max(0, num(s.capex, 0)),
            machineCount: Math.max(1, int(s.machineCount, 1)),
            elecCost: Math.max(0, num(s.elecCost, 0)),
            poolFeePct: clamp(num(s.poolFee, 0) / 100, 0, 1),
            uptimePct: clamp(num(s.uptime, 100) / 100, 0, 1),
            hodlPct: clamp(num(s.hodlRatio, 0) / 100, 0, 1),
            btcTreasury: Math.max(0, num(s.btcTreasury, 0)),
            infrastructureCost: Math.max(0, num(s.infrastructureCost, 0)),
            lifespanMonths: Math.max(1, int(s.minerLifespan, 36)),
            salvagePct: clamp(num(s.salvageValue, 0) / 100, 0, 1),
            monthlyMinerAdditions: Math.max(0, int(s.minerAdditions, 0)),
            periodLength: periodLength,
            // Defaults must match the markup and loadSettings(): autoReplace and additionCapex
            // are `checked` in the HTML, so an absent key means ON. reinvest/savingsElec/
            // taxAdjustment start unchecked, so an absent key means OFF. Getting this wrong
            // makes a scenario missing the key compute differently from the same scenario
            // once loaded into the form.
            savingsElec: !!s.savingsElec,
            autoReplace: s.autoReplace !== false,
            reinvestMode: !!s.reinvest,
            deductAdditionCapex: s.additionCapex !== false,
            taxAdjustmentEnabled: !!s.taxAdjustment,
            miningIncomeTaxRate: s.taxAdjustment ? (num(s.miningIncomeTaxRate, 0) || 0) / 100 : 0,
            capitalGainsTaxRate: s.taxAdjustment ? (num(s.capitalGainsTaxRate, 0) || 0) / 100 : 0,
            startDate: s.startDate ? new Date(s.startDate) : new Date()
        };
    }

    function computeProjection(settings) {
        var p = normalise(settings);
        var pCfg = PERIOD_CONFIG[p.periodLength];
        var daysPerPeriod = pCfg.days;
        var difficulty0 = p.difficultyT * 1e12;

        var priceChangePerPeriod = Math.pow(1 + p.monthlyPriceChangePct, daysPerPeriod / 30.44) - 1;
        var diffChangePerPeriod = Math.pow(1 + p.monthlyDiffChangePct, daysPerPeriod / 30.44) - 1;
        var lifespanPeriods = Math.max(1, Math.round(p.lifespanMonths * (30.44 / daysPerPeriod)));
        var additionsPerPeriod = p.monthlyMinerAdditions * (daysPerPeriod / 30.44);

        var totalCapex = p.capex * p.machineCount;
        var totalInitialInvestment = totalCapex + p.infrastructureCost;
        var startMs = p.startDate.getTime();

        // Which periods cross a halving
        var halvingPeriodIdxs = [];
        for (var h = 0; h < p.numPeriods; h++) {
            var hDate = startMs + h * daysPerPeriod * 86400000;
            var prevDate = startMs + Math.max(0, h - 1) * daysPerPeriod * 86400000;
            var rewNow = getBlockReward(hDate);
            var rewPrev = h === 0 ? CURRENT_BLOCK_REWARD : getBlockReward(prevDate);
            if (rewNow < rewPrev) halvingPeriodIdxs.push({ idx: h, reward: rewNow });
        }

        var cumulBtcHeld = p.btcTreasury;
        var cumulBtcMined = 0;
        var cumulCashFlow = -totalCapex - p.infrastructureCost;
        var cumulElecCost = 0;
        var breakEvenPeriod = null;
        var minerBatches = [{ period: 0, count: p.machineCount }];
        var activeMachines = p.machineCount;
        var reinvestPool = 0;
        var totalMachinesBought = 0;
        var totalMinersRetired = 0;
        var cumulSalvageValue = 0;
        var additionAccum = 0;
        var totalScheduledAdded = 0;

        // Buy & hold: CGT applies to the GAIN on exit, never to the money put in.
        var buyHoldBtcAmount = totalInitialInvestment > 0 ? (totalInitialInvestment / p.btcPrice0) : 0;
        function buyHoldNetGain(price) {
            var gain = (buyHoldBtcAmount * price) - totalInitialInvestment;
            return (p.taxAdjustmentEnabled && gain > 0) ? gain * (1 - p.capitalGainsTaxRate) : gain;
        }
        // Mined coins are taxed as income at the price they were mined at, so that price
        // becomes their cost basis; gains above it are capital gains.
        var heldCostBasis = p.btcTreasury * p.btcPrice0;
        var overtakePeriod = null;

        var labels = [], pnlBtcData = [], btcHodlData = [], usdValueData = [],
            machinesData = [], buyHoldValueData = [], cumulMinedData = [], tableRows = [];

        for (var i = 0; i < p.numPeriods; i++) {
            var periodMs = startMs + i * daysPerPeriod * 86400000;
            var btcPrice = p.btcPrice0 * Math.pow(1 + priceChangePerPeriod, i);
            var difficulty = difficulty0 * Math.pow(1 + diffChangePerPeriod, i);
            var blockReward = getBlockReward(periodMs);

            var retiredThisPeriod = 0, salvageThisPeriod = 0;
            for (var b = 0; b < minerBatches.length; b++) {
                var batch = minerBatches[b];
                if (batch.count > 0 && (i - batch.period) >= lifespanPeriods) {
                    retiredThisPeriod += batch.count;
                    salvageThisPeriod += batch.count * p.capex * p.salvagePct;
                    activeMachines -= batch.count;
                    batch.count = 0;
                }
            }
            totalMinersRetired += retiredThisPeriod;
            cumulSalvageValue += salvageThisPeriod;

            var replacedThisPeriod = 0;
            if (p.autoReplace && retiredThisPeriod > 0) {
                replacedThisPeriod = retiredThisPeriod;
                activeMachines += replacedThisPeriod;
                minerBatches.push({ period: i, count: replacedThisPeriod });
                cumulCashFlow -= replacedThisPeriod * p.capex * (1 - p.salvagePct);
            }

            if (!p.autoReplace && salvageThisPeriod > 0) {
                if (p.reinvestMode) reinvestPool += salvageThisPeriod;
                else cumulCashFlow += salvageThisPeriod;
            }

            var scheduledThisPeriod = 0;
            if (p.monthlyMinerAdditions > 0 && i > 0) {
                additionAccum += additionsPerPeriod;
                scheduledThisPeriod = Math.floor(additionAccum);
                additionAccum -= scheduledThisPeriod;
                if (scheduledThisPeriod > 0) {
                    activeMachines += scheduledThisPeriod;
                    totalScheduledAdded += scheduledThisPeriod;
                    minerBatches.push({ period: i, count: scheduledThisPeriod });
                    if (p.deductAdditionCapex) cumulCashFlow -= scheduledThisPeriod * p.capex;
                }
            }

            var currentHashrateH = p.hashrateTH * activeMachines * 1e12;
            var currentPowerKW = p.powerKW * activeMachines;
            var dailyBTCGross = (currentHashrateH * SECONDS_PER_DAY * blockReward) / (difficulty * TWO_POW_32);
            var dailyBTCNet = dailyBTCGross * (1 - p.poolFeePct) * p.uptimePct;
            var periodBTCMined = dailyBTCNet * daysPerPeriod;
            var periodElecCost = currentPowerKW * 24 * daysPerPeriod * p.elecCost * p.uptimePct;

            // Mining income is taxed on ALL mined BTC at fair market value when mined
            var grossMiningRevenue = periodBTCMined * btcPrice;
            var taxOnMiningIncome = p.taxAdjustmentEnabled ? (grossMiningRevenue * p.miningIncomeTaxRate) : 0;

            var btcHeld = periodBTCMined * p.hodlPct;
            var btcSold = periodBTCMined * (1 - p.hodlPct);
            var cashFromSales = btcSold * btcPrice;
            var periodCashFlow = p.savingsElec
                ? cashFromSales - taxOnMiningIncome
                : cashFromSales - taxOnMiningIncome - periodElecCost;

            var machinesBoughtThisPeriod = 0, reinvestSpent = 0;
            if (p.reinvestMode && p.capex > 0 && periodCashFlow > 0) {
                reinvestPool += periodCashFlow;
                while (reinvestPool >= p.capex) {
                    reinvestPool -= p.capex;
                    activeMachines++;
                    totalMachinesBought++;
                    machinesBoughtThisPeriod++;
                    reinvestSpent += p.capex;
                }
                if (machinesBoughtThisPeriod > 0) minerBatches.push({ period: i, count: machinesBoughtThisPeriod });
            }

            cumulBtcMined += periodBTCMined;
            cumulBtcHeld += btcHeld;
            heldCostBasis += btcHeld * btcPrice;
            cumulElecCost += periodElecCost;
            if (p.reinvestMode && p.capex > 0 && periodCashFlow > 0) cumulCashFlow += periodCashFlow - reinvestSpent;
            else cumulCashFlow += periodCashFlow;

            // Value if liquidated now, net of capital gains on the held BTC
            var heldValueNow = cumulBtcHeld * btcPrice;
            var heldGainNow = heldValueNow - heldCostBasis;
            var cgtOnHeldNow = (p.taxAdjustmentEnabled && heldGainNow > 0) ? heldGainNow * p.capitalGainsTaxRate : 0;
            var totalEconomicValue = cumulCashFlow + reinvestPool + heldValueNow - cgtOnHeldNow;
            if (breakEvenPeriod === null && totalEconomicValue >= 0) breakEvenPeriod = i + 1;

            var buyHoldCurrentNet = buyHoldNetGain(btcPrice);
            if (overtakePeriod === null && totalEconomicValue > buyHoldCurrentNet) overtakePeriod = i + 1;

            labels.push(String(i + 1));
            pnlBtcData.push(periodBTCMined);
            cumulMinedData.push(cumulBtcMined);
            btcHodlData.push(cumulBtcHeld);
            usdValueData.push(totalEconomicValue);
            machinesData.push(activeMachines);
            buyHoldValueData.push(buyHoldCurrentNet);

            tableRows.push({
                period: i + 1, btcPrice: btcPrice, diffT: difficulty / 1e12, blockReward: blockReward,
                machines: activeMachines, machinesBought: machinesBoughtThisPeriod,
                scheduledAdded: scheduledThisPeriod, retiredThisPeriod: retiredThisPeriod,
                replacedThisPeriod: replacedThisPeriod, pnlBtc: periodBTCMined,
                btcHodlCumul: cumulBtcHeld, usdValue: cumulBtcHeld * btcPrice,
                elecCost: periodElecCost, netCashFlow: periodCashFlow, cumulPL: totalEconomicValue,
                isHalving: halvingPeriodIdxs.some(function(x) { return x.idx === i; })
            });
        }

        var finalBtcPrice = p.btcPrice0 * Math.pow(1 + priceChangePerPeriod, p.numPeriods);
        var heldBtcValue = cumulBtcHeld * finalBtcPrice;
        var heldGainFinal = heldBtcValue - heldCostBasis;
        var cgtOnHeld = (p.taxAdjustmentEnabled && heldGainFinal > 0) ? heldGainFinal * p.capitalGainsTaxRate : 0;
        var totalPL = cumulCashFlow + heldBtcValue - cgtOnHeld;
        var roi = totalInitialInvestment > 0 ? ((totalPL / totalInitialInvestment) * 100) : 0;

        var buyHoldFinalNet = buyHoldNetGain(finalBtcPrice);
        var buyHoldFinalValue = totalInitialInvestment + buyHoldFinalNet;
        var miningAdvantage = totalPL - buyHoldFinalNet;

        // Day-1 snapshot
        var initHashrateH = p.hashrateTH * p.machineCount * 1e12;
        var initPowerKW = p.powerKW * p.machineCount;
        var dailyBTCDay1 = (initHashrateH * SECONDS_PER_DAY * getBlockReward(startMs)) / (difficulty0 * TWO_POW_32);
        var dailyBTCDay1Net = dailyBTCDay1 * (1 - p.poolFeePct) * p.uptimePct;
        var dailyRevenueDay1 = dailyBTCDay1Net * p.btcPrice0;
        var dailyElecDay1 = initPowerKW * 24 * p.elecCost * p.uptimePct;
        var dailyProfitDay1 = dailyRevenueDay1 - dailyElecDay1;
        var dailyTaxDay1 = p.taxAdjustmentEnabled ? (dailyRevenueDay1 * p.miningIncomeTaxRate) : 0;

        return {
            params: p,
            periodConfig: pCfg,
            halvingPeriodIdxs: halvingPeriodIdxs,

            dailyRevenueDay1: dailyRevenueDay1,
            dailyElecDay1: dailyElecDay1,
            dailyProfitDay1: dailyProfitDay1,
            dailyAfterTaxProfitDay1: dailyProfitDay1 - dailyTaxDay1,
            costPerBTC: dailyBTCDay1Net > 0 ? (dailyElecDay1 / dailyBTCDay1Net) : Infinity,
            efficiency: p.hashrateTH > 0 ? ((p.powerKW * 1000) / p.hashrateTH) : 0,

            totalInitialInvestment: totalInitialInvestment,
            cumulBtcMined: cumulBtcMined,
            cumulBtcHeld: cumulBtcHeld,
            cumulElecCost: cumulElecCost,
            cumulSalvageValue: cumulSalvageValue,
            finalBtcPrice: finalBtcPrice,
            heldBtcValue: heldBtcValue,
            totalPL: totalPL,
            roi: roi,
            grossValue: totalPL + totalInitialInvestment,
            breakEvenPeriod: breakEvenPeriod,

            buyHoldBtcAmount: buyHoldBtcAmount,
            buyHoldFinalValue: buyHoldFinalValue,
            buyHoldFinalNet: buyHoldFinalNet,
            miningAdvantage: miningAdvantage,
            isMiningBetter: miningAdvantage > 0,
            overtakePeriod: overtakePeriod,

            activeMachines: activeMachines,
            totalMachinesBought: totalMachinesBought,
            totalScheduledAdded: totalScheduledAdded,
            totalMinersRetired: totalMinersRetired,
            hasGrowth: totalMachinesBought > 0 || totalScheduledAdded > 0 || totalMinersRetired > 0,

            series: {
                labels: labels, pnlBtc: pnlBtcData, cumulMined: cumulMinedData,
                btcHodl: btcHodlData, usdValue: usdValueData,
                machines: machinesData, buyHold: buyHoldValueData
            },
            tableRows: tableRows
        };
    }

    return {
        computeProjection: computeProjection,
        getBlockReward: getBlockReward,
        normalise: normalise,
        PERIOD_CONFIG: PERIOD_CONFIG,
        HALVINGS: HALVINGS,
        CURRENT_BLOCK_REWARD: CURRENT_BLOCK_REWARD
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CalcEngine;
