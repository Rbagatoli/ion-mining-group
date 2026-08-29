// ===== PROTON MINING — Mining Projection Engine =====
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
            /* TRANSACTION FEES, which the engine used to leave out entirely.

               A block pays the subsidy PLUS the fees in it, and this modelled only the
               subsidy -- so every projection understated revenue by whatever fees were
               running. It matters most exactly where this model is weakest: after a halving
               the subsidy drops but fee income does not, so fees become a larger share of
               what a miner earns at the same moment the rest of the projection turns down.

               Clamped to a sane band rather than 0..1. A negative fee is not a thing, and a
               figure above 100% of the subsidy has happened for individual blocks but never
               for a sustained average -- letting one be typed would quietly double a
               five-year projection. */
            txFeePct: clamp(num(s.txFee, 2) / 100, 0, 1),
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
            /* WHERE THE MONEY CAME FROM, which the comparison was silently
               assuming an answer to.

               Off (the old behaviour, and still the default): the investment is
               capital you already hold. Both sides start from the same figure,
               which is right - tax on how you earned it was paid long ago and is
               not part of this decision.

               On: the investment is income you have not been taxed on yet. Then
               the two sides are NOT the same size. Miners are equipment, so a
               first-year write-off deducts the cost against that income and the
               whole figure goes to work. Buying bitcoin deducts nothing, so the
               income is taxed first and only what is left buys coins.

               Gated on taxAdjustmentEnabled, because a pre-tax investment with no
               tax model is a contradiction: it would shrink the benchmark using a
               rate that is not being applied anywhere else. */
            preTaxCapital: !!(s.taxAdjustment && s.preTaxCapital),
            // These were the only two ratios in this function still using `|| 0` -- the exact
            // idiom the NOTE above warns against -- and the only two left unclamped. Typing 350
            // produced a 350% tax and turned a profitable site into a $7.7M loss; typing -40
            // produced a subsidy. They also defaulted to 0 when absent, so a scenario saved
            // before the tax fields existed rendered UNTAXED inside a comparison table that
            // claimed it was taxed. Defaults now match the markup: 35 and 15.
            miningIncomeTaxRate: s.taxAdjustment ? clamp(num(s.miningIncomeTaxRate, 35), 0, 100) / 100 : 0,
            capitalGainsTaxRate: s.taxAdjustment ? clamp(num(s.capitalGainsTaxRate, 15), 0, 100) / 100 : 0,
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
        var cumulBtcSold = 0;
        var cumulCashFlow = -totalCapex - p.infrastructureCost;
        /* The deepest the PURE CASH position ever goes, i.e. how much money has to come
           from outside before the treasury is sold. cumulCashFlow + reinvestPool is that
           position exactly: every capex, salvage and settlement line lands in one of the
           two, and nothing unrealised is in either. totalPL cannot answer this -- it adds
           heldBtcValue, so a plan funded entirely out of pocket still reports a profit
           while its bank account is empty. */
        var minCashPosition = cumulCashFlow;
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

        /* WHAT THE FLEET IS STILL WORTH, which the projection used to say was nothing.

           totalPL counted the BTC you hold at the end and every dollar you spent, but not
           the MACHINES you own at the end -- so a horizon that stops partway through a
           fleet's life wrote off whatever was left of it. At the shipped 60-month default
           against a 48-month lifespan that is a fleet 11 months old, bought for $270,900 at
           month 49 and carried at zero: $238,919 of kit, expensed in full.

           It is worst exactly where nobody looks for it. Extending the horizon from 48 to 49
           months made Total P/L FALL by $249,588, because month 49 buys a replacement fleet
           and the model books it as a pure loss. That one-month cliff is what flipped the
           buy-and-hold verdict at the default, and it made mining look worse than buying in
           most scenarios -- which is not what a real operator sees, because a real operator
           still owns the machines.

           IT IS ALSO WHAT MADE THE COMPARISON UNFAIR. buyHoldNetGain is a NET GAIN: buy-and-
           hold starts at zero because the money became an asset it still holds. Mining
           started at minus the whole capex because the money became an asset valued at zero.
           The two lines were never measuring the same thing.

           Straight-line from capex down to the salvage percentage over the machine's life,
           which is the only depreciation curve this model already implies: a machine that
           reaches lifespanMonths yields exactly capex x salvagePct on retirement, and this
           returns exactly that at age == lifespan. No double count -- a retired batch has
           count 0 and is skipped, and its salvage has already been credited to cash. */
        function fleetValueAt(periodIdx) {
            var v = 0;
            for (var fb = 0; fb < minerBatches.length; fb++) {
                var fBatch = minerBatches[fb];
                if (fBatch.count <= 0) continue;
                var lifeLeft = (lifespanPeriods - (periodIdx - fBatch.period)) / lifespanPeriods;
                lifeLeft = Math.min(1, Math.max(0, lifeLeft));
                v += fBatch.count * p.capex * (p.salvagePct + (1 - p.salvagePct) * lifeLeft);
            }
            return v;
        }

        /* Buy & hold: CGT applies to the GAIN on exit, never to the money put in.

           WHAT IT HAS TO SPEND is the part that used to be assumed. On pre-tax
           income, buying bitcoin is not deductible, so the income tax comes off
           first and the alternative starts smaller - at 20% on $198,660 that is
           $158,928, which is 1.5893 BTC at $100k instead of 1.9866. Nearly four
           tenths of a coin, and it was being handed to the alternative for free.

           The mining side needs no matching adjustment: capex has never been
           taxed in this model, which is exactly what a first-year write-off
           means. The asymmetry was only ever on this side. */
        var buyHoldSpend = p.preTaxCapital
            ? totalInitialInvestment * (1 - p.miningIncomeTaxRate)
            : totalInitialInvestment;
        var buyHoldBtcAmount = buyHoldSpend > 0 ? (buyHoldSpend / p.btcPrice0) : 0;
        function buyHoldNetGain(price) {
            /* Measured against the PRE-TAX figure, so the income tax paid to get
               into bitcoin shows up as the cost it is. Netting it against the
               smaller number would quietly forgive it. */
            var gain = (buyHoldBtcAmount * price) - totalInitialInvestment;
            var appreciation = (buyHoldBtcAmount * price) - buyHoldSpend;
            if (!p.taxAdjustmentEnabled || appreciation <= 0) return gain;
            return gain - (appreciation * p.capitalGainsTaxRate);
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
            /* Subsidy plus fees. The fee share is expressed against the subsidy, so it
               scales with the halving the same way a real block does. */
            var dailyBTCGross = (currentHashrateH * SECONDS_PER_DAY * blockReward *
                                 (1 + p.txFeePct)) / (difficulty * TWO_POW_32);
            var dailyBTCNet = dailyBTCGross * (1 - p.poolFeePct) * p.uptimePct;
            var periodBTCMined = dailyBTCNet * daysPerPeriod;
            var periodElecCost = currentPowerKW * 24 * daysPerPeriod * p.elecCost * p.uptimePct;

            // Mining income is taxed on ALL mined BTC at fair market value when mined -- held or
            // sold, the income event is the mining, not the sale.
            //
            // But it is taxed on NET income. Electricity is the single largest deductible expense
            // a miner has, and this line used to apply the rate to gross revenue with nothing
            // subtracted. At the calculator's own defaults that turned a 35% field into a 63.6%
            // effective rate on real profit, and on a 200-machine site it charged an identical
            // $959,928 whether power cost $0.02/kWh or $0.12 -- a business losing $1.67M was
            // billed as though it had earned. The single input a gas-site operator cares about
            // most had no effect on the tax line at all.
            //
            // Math.max(0, ...) rather than a negative tax: a loss reduces the bill to zero, it
            // does not generate a refund. Carrying that loss forward against later periods is a
            // separate, real improvement and is NOT done here.
            var grossMiningRevenue = periodBTCMined * btcPrice;
            var taxableMiningIncome = Math.max(0, grossMiningRevenue - periodElecCost);
            var taxOnMiningIncome = p.taxAdjustmentEnabled ? (taxableMiningIncome * p.miningIncomeTaxRate) : 0;

            /* WHO PAYS THE POWER -- the HODL slider decides how much is sold, and the bill
               is charged as a cash cost whatever that comes to.

               THIS WAS BRIEFLY CHANGED to sell the minimum needed to cover the bill, on the
               grounds that at HODL 100 nothing is sold and the power is therefore funded from
               outside. That description is accurate and the conclusion drawn from it was
               wrong, so the reasoning is worth keeping where the next person can find it.

               Forcing a cover-sale makes the projection take a TREASURY DECISION on the
               operator's behalf, and it takes the worst available one. On a site that is
               under water on power it sells every coin it mines, at the price of the month it
               mined them, to chase a bill it can never meet: at $0.12/kWh that emptied a
               10.09 BTC treasury and turned a $90,653 loss into $1,086,017. Nobody runs a
               mine that way. They curtail, or they fund opex from elsewhere and keep the
               coins -- which is exactly what this branch already models.

               What this measures is the FLEET: what it produced, minus what it cost to run.
               The treasury policy sits on top of that as the HODL ratio, which is the
               operator's to set. Keeping the two separate is why the model works at all;
               entangling them is what broke it.

               The honest caveat the switch was reaching for is real and is reported instead
               of modelled: peakCashDeficit says how much cash the plan needs from outside,
               and at HODL 100 that is capex plus every power bill in the horizon. */
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
            cumulBtcSold += btcSold;
            cumulBtcHeld += btcHeld;
            heldCostBasis += btcHeld * btcPrice;
            cumulElecCost += periodElecCost;
            // In reinvest mode the cash lives in reinvestPool and NOWHERE ELSE. It used to be
            // added here as well, so totalEconomicValue -- which adds reinvestPool on top --
            // counted every uninvested dollar twice, inflating the chart, the table and the
            // break-even period while the headline totalPL (which omitted the pool) disagreed
            // with the last row of its own table.
            //
            // NOT `cumulCashFlow -= reinvestSpent`: the while loop above has already drained the
            // pool by exactly that amount, so subtracting it again double-counts in the other
            // direction. That was a proposed fix and it is wrong.
            if (!(p.reinvestMode && p.capex > 0 && periodCashFlow > 0)) cumulCashFlow += periodCashFlow;

            // Sampled AFTER every cash movement of the period, so a month that both pays a
            // bill and buys a replacement fleet is measured at its true low point.
            var cashPosition = cumulCashFlow + reinvestPool;
            if (cashPosition < minCashPosition) minCashPosition = cashPosition;

            // Value if liquidated now, net of capital gains on the held BTC
            var heldValueNow = cumulBtcHeld * btcPrice;
            var heldGainNow = heldValueNow - heldCostBasis;
            var cgtOnHeldNow = (p.taxAdjustmentEnabled && heldGainNow > 0) ? heldGainNow * p.capitalGainsTaxRate : 0;
            /* TWO MEASURES, because they answer two questions and one of them was being
               asked to do both.

               liquidValue is cash plus coin: what you could realise without selling a
               machine. That is what BREAK-EVEN means to an operator -- when the outlay has
               come back -- so it stays on this measure. Folding the fleet's book value in
               would make every scenario break even in period 1, since day one you have spent
               the capex and own exactly the capex in machines. True, and useless.

               totalEconomicValue adds what the fleet is still worth, and that is the one the
               chart, the table and the headline use, because it is the only one comparable
               to buy-and-hold's net gain. */
            var liquidValue = cumulCashFlow + reinvestPool + heldValueNow - cgtOnHeldNow;
            var totalEconomicValue = liquidValue + fleetValueAt(i);
            if (breakEvenPeriod === null && liquidValue >= 0) breakEvenPeriod = i + 1;

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
                btcSold: btcSold, btcHeld: btcHeld,
                btcHodlCumul: cumulBtcHeld, usdValue: cumulBtcHeld * btcPrice,
                elecCost: periodElecCost, netCashFlow: periodCashFlow, cumulPL: totalEconomicValue,
                isHalving: halvingPeriodIdxs.some(function(x) { return x.idx === i; })
            });
        }

        // numPeriods - 1, not numPeriods. The loop runs i = 0..numPeriods-1 and prices period i
        // at btcPrice0 * (1+g)^i, so the last period modelled is (1+g)^(numPeriods-1). Using
        // numPeriods here priced an extra month that no row of the table represents, which is why
        // the Total P/L card disagreed with the bottom of its own table by $70,422 on a
        // 36-month run -- and by exactly $0 at a flat price, which is the tell that it was a
        // phantom period rather than a rounding difference.
        var finalBtcPrice = p.btcPrice0 * Math.pow(1 + priceChangePerPeriod, p.numPeriods - 1);
        var heldBtcValue = cumulBtcHeld * finalBtcPrice;
        var heldGainFinal = heldBtcValue - heldCostBasis;
        var cgtOnHeld = (p.taxAdjustmentEnabled && heldGainFinal > 0) ? heldGainFinal * p.capitalGainsTaxRate : 0;
        // reinvestPool included. Without it, cash the pool never spent -- and salvage from
        // retired miners, which is paid into the pool -- simply disappeared from the headline,
        // so switching reinvest ON while it bought nothing made Total P/L $135,000 WORSE.
        // This is also what makes the last table row equal the card.
        // The fleet you still own, on the same terms as the last row of the table -- this is
        // what keeps the card and the bottom of its own table equal.
        var residualFleetValue = fleetValueAt(p.numPeriods - 1);
        var totalPL = cumulCashFlow + reinvestPool + heldBtcValue - cgtOnHeld + residualFleetValue;
        var roi = totalInitialInvestment > 0 ? ((totalPL / totalInitialInvestment) * 100) : 0;

        var buyHoldFinalNet = buyHoldNetGain(finalBtcPrice);
        var buyHoldFinalValue = totalInitialInvestment + buyHoldFinalNet;
        var miningAdvantage = totalPL - buyHoldFinalNet;

        // Day-1 snapshot
        var initHashrateH = p.hashrateTH * p.machineCount * 1e12;
        var initPowerKW = p.powerKW * p.machineCount;
        var dailyBTCDay1 = (initHashrateH * SECONDS_PER_DAY * getBlockReward(startMs) *
                            (1 + p.txFeePct)) / (difficulty0 * TWO_POW_32);
        var dailyBTCDay1Net = dailyBTCDay1 * (1 - p.poolFeePct) * p.uptimePct;
        var dailyRevenueDay1 = dailyBTCDay1Net * p.btcPrice0;
        var dailyElecDay1 = initPowerKW * 24 * p.elecCost * p.uptimePct;
        var dailyProfitDay1 = dailyRevenueDay1 - dailyElecDay1;
        // Same correction as the loop: the rate applies to profit, not revenue. This card used
        // to print a NEGATIVE daily profit for a rig that was genuinely earning money.
        var dailyTaxDay1 = p.taxAdjustmentEnabled
            ? (Math.max(0, dailyRevenueDay1 - dailyElecDay1) * p.miningIncomeTaxRate) : 0;

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
            cumulBtcSold: cumulBtcSold,
            cumulBtcHeld: cumulBtcHeld,
            cumulElecCost: cumulElecCost,
            /* Total cash that must come from outside before anything is liquidated. Always
               at least the day-one investment, and MORE whenever opex or replacement capex
               is not settled out of production -- which at the shipped defaults is every
               month of the horizon. */
            peakCashDeficit: Math.max(0, -minCashPosition),
            externalOpexFunded: Math.max(0, (Math.max(0, -minCashPosition)) - totalInitialInvestment),
            cumulSalvageValue: cumulSalvageValue,
            residualFleetValue: residualFleetValue,
            finalBtcPrice: finalBtcPrice,
            heldBtcValue: heldBtcValue,
            totalPL: totalPL,
            roi: roi,
            grossValue: totalPL + totalInitialInvestment,
            breakEvenPeriod: breakEvenPeriod,

            buyHoldBtcAmount: buyHoldBtcAmount,
            buyHoldSpend: buyHoldSpend,
            preTaxCapital: p.preTaxCapital,
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
