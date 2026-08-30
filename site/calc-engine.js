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

    /* Section 461(l), the excess business loss limitation: business losses offsetting
       non-business income are capped at roughly this per year for a single filer, and the
       excess becomes an NOL carryforward -- still valuable, but realised over years rather
       than at once.

       NOT MODELLED AS A COMPUTATION, deliberately. It depends on filing status, other income
       and prior-year NOLs, none of which this calculator knows, and a confidently wrong number
       is worse than a note. It is used only to decide when to SAY something. One constant in
       one place, so it can be moved when the figure indexes. */
    var EXCESS_BUSINESS_LOSS_THRESHOLD = 330000;

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

    /* HASHPRICE -- revenue per TH/s per day, in USD, for the NETWORK.
       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
       The 1e12 cancels: BTC/day per TH is (1e12 x 86400 x reward) / (difficulty x 2^32),
       and difficulty is diffT x 1e12, so the expression reduces to the form below.

       IT IS GROSS, AND THAT IS DELIBERATE. Pool fee and uptime are NOT applied, even though
       the production path applies both. Hashprice is a property of the network, not of your
       site: two operators running the same machine at different uptimes with different pools
       must see the same market price for hardware, because they are bidding in the same
       market. This will look like an inconsistency with dailyBTCNet to anyone comparing the
       two, and it is not -- do not "fix" it by applying poolFeePct and uptimePct here.

       NO CIRCULARITY, and it is worth stating because the replacement feature depends on it:
       hashprice is a function of btcPrice, difficulty and blockReward ONLY, all three of
       which are exogenous inputs. The fleet's own hashrate never feeds network difficulty in
       this model, so this series can be computed before the fleet is simulated -- which is
       what makes a replacement price derivable from it at all. If difficulty ever becomes
       endogenous, that assumption breaks and this comment is where to start. */
    function hashpricePerTHDay(btcPrice, difficulty, blockReward) {
        if (!(difficulty > 0)) return 0;
        return (1e12 * SECONDS_PER_DAY * blockReward * btcPrice) / (difficulty * TWO_POW_32);
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

    /* How a replacement fleet is sized. same_count is the historical behaviour and the
       default. same_power is the right one for a power-capped site, where the constraint
       is kilowatts and a more efficient machine means MORE machines on the same bill.
       same_capital sizes from what the retiring fleet is worth. */
    var REPLACEMENT_SIZINGS = { same_count: 1, same_power: 1, same_capital: 1 };

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
            // are `checked` in the HTML, so an absent key means ON. reinvest/coverElec/
            // taxAdjustment start unchecked, so an absent key means OFF. Getting this wrong
            // makes a scenario missing the key compute differently from the same scenario
            // once loaded into the form.
            /* REPLACES savingsElec, which is gone.

               savingsElec meant "the power is paid from income or savings", and it implemented
               that by removing the cost from the projection ENTIRELY -- the return came out as
               though the electricity were free. That is the least defensible setting the page
               had: a five-year bill of $1.5M simply left the arithmetic.

               This is the opposite and honest version of the same idea. Instead of deleting
               the cost, it names where the money comes from: the mined BTC. Each period sells
               the minimum needed to pay that period's power, and the HODL ratio then governs
               what is left. A scenario that carries the old savingsElec key gets nothing --
               absent means off, and off is the behaviour that key used to sit next to. */
            coverElec: !!s.coverElec,
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
            /* DEFAULTS ON when the tax model is on. Absent means ON, explicit false means
               OFF -- the same convention autoReplace and additionCapex already use, so a
               scenario that deliberately turned this off keeps it off.

               The default moved because leaving it off makes the tax toggle actively
               misleading: on the same scenario, turning tax on took mining's advantage from
               -$90,883 to -$372,492, because the mining side was charged income tax while the
               benchmark was handed the full pre-tax sum to buy coins with and charged nothing
               for the privilege. With this on it goes to +$492,766. The verdict flips on which
               toggle is set, which is not a thing a default should be quietly deciding. */
            preTaxCapital: !!(s.taxAdjustment && s.preTaxCapital !== false),
            /* WHAT FRACTION OF INFRASTRUCTURE IS DEPRECIABLE EQUIPMENT. Miners are equipment
               and fully eligible; infrastructure is the line that mixes transformers and
               containers with land and soft development costs, which are not. Applying a
               blended percentage across both would understate the miners to compensate for
               the infrastructure -- the wrong shape even where the total lands close. */
            infraDepreciationEligiblePct: clamp(num(s.infraDepreciationEligiblePct, 90), 0, 100) / 100,
            // These were the only two ratios in this function still using `|| 0` -- the exact
            // idiom the NOTE above warns against -- and the only two left unclamped. Typing 350
            // produced a 350% tax and turned a profitable site into a $7.7M loss; typing -40
            // produced a subsidy. They also defaulted to 0 when absent, so a scenario saved
            // before the tax fields existed rendered UNTAXED inside a comparison table that
            // claimed it was taxed. Defaults now match the markup: 35 and 15.
            miningIncomeTaxRate: s.taxAdjustment ? clamp(num(s.miningIncomeTaxRate, 35), 0, 100) / 100 : 0,
            capitalGainsTaxRate: s.taxAdjustment ? clamp(num(s.capitalGainsTaxRate, 15), 0, 100) / 100 : 0,
            startDate: s.startDate ? new Date(s.startDate) : new Date(),

            /* ---- REPLACEMENT HARDWARE ----------------------------------------------
               All inert while replacementEnabled is false, which is the default. The
               specs fall back to the ORIGINAL machine, so a scenario that enables the
               feature without filling them in replaces like for like rather than with a
               zero-hashrate machine.

               Resolved against the raw inputs rather than the normalised ones because
               this object is still being built; num() applies the same guards either
               way, and a blank field means "same as original" rather than zero. */
            replacementEnabled: !!s.replacementEnabled,
            replacementHashrateTH: Math.max(0, num(s.replacementHashrate, num(s.hashrate, 335))),
            replacementPowerKW: Math.max(0, num(s.replacementPower, num(s.power, 5.36))),
            replacementCapex: Math.max(0, num(s.replacementCapex, num(s.capex, 0))),
            replacementSizing: REPLACEMENT_SIZINGS[s.replacementSizing] ? s.replacementSizing : 'same_count',
            /* Zero is the honest default for same_capital: it answers "what can I
               re-equip with using only what the old fleet is worth", which is the
               constrained question and the one that matches how this is actually
               funded. Injecting capital should require typing a number. */
            additionalReplacementCapital: Math.max(0, num(s.additionalReplacementCapital, 0)),
            /* 0 means "no ceiling". Set from the site's available kW in energy mode so a
               replacement cannot silently overdraw the site. */
            siteKw: Math.max(0, num(s.siteKw, 0))
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
        /* COHORTS CARRY THEIR OWN SPEC.

           A batch used to be {period, count} and nothing else, so the fleet had cohorts for
           AGE but not for SPEC: production was p.hashrateTH * activeMachines, one scalar
           machine times one scalar count. That is correct only while every machine on site is
           identical, which is exactly the assumption a replacement-hardware model has to break.

           This commit is the move and nothing else. Every batch is populated from the same
           scalars the old code multiplied by, so the sums below are arithmetically the same
           expression regrouped, and the projection is byte-identical. The replacement feature
           lands on top of this. */
        var ORIGINAL_SPEC = { hashrateTH: p.hashrateTH, powerKW: p.powerKW, capex: p.capex };
        /* Falls back to the SAME OBJECT when the feature is off, so every downstream read
           is literally the original spec and no path can diverge by rounding. */
        var REPLACEMENT_SPEC = p.replacementEnabled
            ? { hashrateTH: p.replacementHashrateTH, powerKW: p.replacementPowerKW,
                capex: p.replacementCapex }
            : ORIGINAL_SPEC;

        function makeBatch(period, count, spec) {
            spec = spec || ORIGINAL_SPEC;
            return { period: period, count: count,
                     hashrateTH: spec.hashrateTH, powerKW: spec.powerKW, capex: spec.capex };
        }

        /* THE GENERATION BOUNDARY for reinvest purchases. Buying the replacement spec in
           month 6 means purchasing 2030 hardware in 2026; buying the original spec in
           month 50 means the opposite. Both are wrong at one end. The first replacement
           event is the defensible line: before it the market still sells the old machine,
           after it the operator has demonstrably moved generation. */
        var firstReplacementPeriod = null;
        var minerBatches = [makeBatch(0, p.machineCount)];
        var activeMachines = p.machineCount;
        var reinvestPool = 0;
        var totalMachinesBought = 0;
        var totalMinersRetired = 0;
        var cumulSalvageValue = 0;
        var additionAccum = 0;
        var totalScheduledAdded = 0;

        /* Buy & hold: CGT applies to the GAIN on exit, never to the money put in.

           WHAT IT HAS TO SPEND is the part that used to be assumed. On pre-tax
           income, buying bitcoin is not deductible, so the income tax comes off
           first and the alternative starts smaller - at 20% on $198,660 that is
           $158,928, which is 1.5893 BTC at $100k instead of 1.9866. Nearly four
           tenths of a coin, and it was being handed to the alternative for free.

           The mining side needs no matching adjustment: capex has never been
           taxed in this model, which is exactly what a first-year write-off
           means. The asymmetry was only ever on this side. */
        /* THE DEPLOYMENT BASIS, which is the largest tax advantage mining has and was
           invisible until it was modelled.

           Mining equipment takes 100% bonus depreciation -- permanently restored under OBBBA
           for property acquired after 19 January 2025. Bitcoin does not: buying it is a
           capital asset purchase with no deduction. So a dollar of pre-tax income buys a
           FULL dollar of miners but only a post-tax dollar of coins.

           Eligibility applies to the INFRASTRUCTURE line only. The machines are equipment;
           the site line is what mixes depreciable kit with land and soft costs.

           WHAT THIS DELIBERATELY DOES NOT DO. Section 461(l) caps business losses against
           non-business income at ~$330k/yr for a single filer, above which the excess is an
           NOL carried forward. Material participation under 469 is required or the losses are
           passive. Property used predominantly outside the US is forced onto ADS by 168(g) --
           straight-line, no bonus -- so a Canadian site gets none of this. And the shield is
           worth nothing beyond income in the SAME year, which makes incremental hardware
           purchases efficient and does not fund a lump-sum build. None of that is computed
           here; all of it is said on screen. */
        var deductibleBasis = totalCapex + (p.infrastructureCost * p.infraDepreciationEligiblePct);
        var taxShieldValue = p.preTaxCapital ? deductibleBasis * p.miningIncomeTaxRate : 0;
        var buyHoldSpend = totalInitialInvestment - taxShieldValue;
        var deploymentRatio = buyHoldSpend > 0 ? totalInitialInvestment / buyHoldSpend : 0;
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

            var retiredThisPeriod = 0, salvageThisPeriod = 0, retiredPowerKW = 0;
            for (var b = 0; b < minerBatches.length; b++) {
                var batch = minerBatches[b];
                if (batch.count > 0 && (i - batch.period) >= lifespanPeriods) {
                    retiredThisPeriod += batch.count;
                    /* batch.capex, not p.capex: salvage is a percentage of what the RETIRING
                       machine cost, not of whatever is in the capex box now. Identical while
                       the fleet is uniform -- makeBatch copies p.capex -- and load-bearing
                       the moment a replacement carries its own price. */
                    salvageThisPeriod += batch.count * batch.capex * p.salvagePct;
                    retiredPowerKW += batch.count * batch.powerKW;
                    activeMachines -= batch.count;
                    batch.count = 0;
                }
            }
            totalMinersRetired += retiredThisPeriod;
            cumulSalvageValue += salvageThisPeriod;

            var replacedThisPeriod = 0, replacementSpend = 0, replacementClamped = false;
            if (p.autoReplace && retiredThisPeriod > 0) {
                if (!p.replacementEnabled) {
                    /* THE ORIGINAL PATH, LEFT LITERALLY ALONE. The general form below is
                       algebraically the same thing when the specs match -- spend minus
                       salvage equals count x capex x (1 - salvagePct) -- but not bit for
                       bit: a*c - a*c*s and a*c*(1-s) round differently, and the whole
                       regression gate for this feature is that the disabled path does not
                       move. Deriving this from the general form would break it. */
                    replacedThisPeriod = retiredThisPeriod;
                    activeMachines += replacedThisPeriod;
                    minerBatches.push(makeBatch(i, replacedThisPeriod));
                    cumulCashFlow -= replacedThisPeriod * p.capex * (1 - p.salvagePct);
                    replacementSpend = replacedThisPeriod * p.capex;
                } else {
                    var want;
                    if (p.replacementSizing === 'same_power') {
                        /* The constraint at a fixed site is kilowatts, not machine count:
                           45 machines at 3.51 kW is 158 kW, and 5.925 kW replacements fill
                           it 26 deep, not 27 -- 27 would draw 160.0 kW against a 158.0
                           target. floor(), never round(). */
                        want = REPLACEMENT_SPEC.powerKW > 0
                            ? Math.floor(retiredPowerKW / REPLACEMENT_SPEC.powerKW) : 0;
                    } else if (p.replacementSizing === 'same_capital') {
                        var budget = salvageThisPeriod + p.additionalReplacementCapital;
                        want = REPLACEMENT_SPEC.capex > 0
                            ? Math.floor(budget / REPLACEMENT_SPEC.capex) : 0;
                    } else {
                        want = retiredThisPeriod;
                    }

                    /* THE SITE CEILING. Never silently exceed the available kW: measure what
                       the survivors already draw and only fill the room that is left. */
                    if (p.siteKw > 0 && REPLACEMENT_SPEC.powerKW > 0) {
                        var survivingKw = 0;
                        for (var sb = 0; sb < minerBatches.length; sb++) {
                            if (minerBatches[sb].count > 0) {
                                survivingKw += minerBatches[sb].count * minerBatches[sb].powerKW;
                            }
                        }
                        var room = Math.floor(Math.max(0, p.siteKw - survivingKw) /
                                              REPLACEMENT_SPEC.powerKW);
                        if (want > room) { want = room; replacementClamped = true; }
                    }

                    replacedThisPeriod = Math.max(0, want);
                    if (replacedThisPeriod > 0) {
                        activeMachines += replacedThisPeriod;
                        minerBatches.push(makeBatch(i, replacedThisPeriod, REPLACEMENT_SPEC));
                    }
                    /* Gross spend on the NEW machines, less the gross salvage of the OLD
                       ones. Two different prices and, under same_power or same_capital, two
                       different counts -- which is exactly why the old single-capex
                       expression could not be reused. */
                    replacementSpend = replacedThisPeriod * REPLACEMENT_SPEC.capex;
                    cumulCashFlow -= (replacementSpend - salvageThisPeriod);
                }
                if (firstReplacementPeriod === null) firstReplacementPeriod = i;
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
                    minerBatches.push(makeBatch(i, scheduledThisPeriod));
                    if (p.deductAdditionCapex) cumulCashFlow -= scheduledThisPeriod * p.capex;
                }
            }

            /* Aggregated over cohorts rather than multiplied by a scalar count. This is the
               seam the replacement feature needs, and it is behaviour-free today because every
               cohort holds the same spec.

               COUNTS ARE SUMMED BEFORE THEY ARE MULTIPLIED, and that is not a style choice.
               The naive form -- adding count x spec per cohort -- is the same expression
               regrouped, and floating point does not regroup for free: a 100-machine fleet
               split across cohorts of 45, 26 and 29 gave an electricity line of
               349.78003199999995 where the scalar gave 349.780032, and that ULP propagated
               into cumulElecCost, cumulBtcMined and every table row downstream. Eight of
               fourteen regression scenarios diverged on it.

               Grouping by spec first reduces to exactly one multiply per distinct machine,
               which is bit-for-bit the arithmetic the scalar version did while the fleet is
               uniform -- and stays correct once it is not. Counts are integers, so summing
               them is exact.

               Placed exactly where the scalar version was, which matters: reinvest purchases
               are pushed LATER in this same period, so they are correctly excluded here and
               first produce in the period after they are bought. Moving this line up would
               silently change that. */
            var specGroups = [];
            for (var hb = 0; hb < minerBatches.length; hb++) {
                var hBatch = minerBatches[hb];
                if (hBatch.count <= 0) continue;
                var grp = null;
                for (var gi = 0; gi < specGroups.length; gi++) {
                    if (specGroups[gi].hashrateTH === hBatch.hashrateTH &&
                        specGroups[gi].powerKW === hBatch.powerKW) { grp = specGroups[gi]; break; }
                }
                if (!grp) {
                    grp = { hashrateTH: hBatch.hashrateTH, powerKW: hBatch.powerKW, count: 0 };
                    specGroups.push(grp);
                }
                grp.count += hBatch.count;
            }
            var fleetHashrateTH = 0, currentPowerKW = 0;
            for (var gj = 0; gj < specGroups.length; gj++) {
                fleetHashrateTH += specGroups[gj].count * specGroups[gj].hashrateTH;
                currentPowerKW += specGroups[gj].count * specGroups[gj].powerKW;
            }
            var currentHashrateH = fleetHashrateTH * 1e12;
            var dailyBTCGross = (currentHashrateH * SECONDS_PER_DAY * blockReward) / (difficulty * TWO_POW_32);
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

            /* WHO PAYS THE POWER.

               OFF, and this is the default: the HODL ratio alone decides what is sold, and the
               bill is charged as a cash cost whatever that comes to. At HODL 100 nothing is
               sold, so the electricity is funded from outside the business -- see
               peakCashDeficit, which reports exactly how much that is.

               ON: the bill comes off the top of each period's production and the slider splits
               what remains, so HODL 100 means "hold everything after the power is paid". This
               is what an operator running a treasury actually means by holding everything.

               CAPPED AT periodBTCMined, and the cap matters. A site whose production is worth
               less than its power bill cannot pay it out of production no matter what this
               says. It then sells everything it mines and the remainder stays visible as
               negative cash rather than being quietly borrowed against next month. Do not read
               that case as a recommendation: an operator facing it curtails or funds the bill
               from elsewhere, and the second of those is what leaving this OFF models.

               Electricity only. Mining income tax is a cash bill in the same period and is NOT
               covered here -- with the tax model on, cash flow still goes negative by the tax,
               which is correct: this switch is about the power bill and says so. */
            var btcHeld, btcSold;
            if (p.coverElec && btcPrice > 0) {
                var btcToCover = Math.min(periodBTCMined, periodElecCost / btcPrice);
                var btcAfterPower = periodBTCMined - btcToCover;
                btcHeld = btcAfterPower * p.hodlPct;
                btcSold = btcToCover + btcAfterPower * (1 - p.hodlPct);
            } else {
                btcHeld = periodBTCMined * p.hodlPct;
                btcSold = periodBTCMined * (1 - p.hodlPct);
            }
            var cashFromSales = btcSold * btcPrice;
            /* The power is ALWAYS charged. It was only ever conditional because savingsElec
               deleted it, and that setting is gone. */
            var periodCashFlow = cashFromSales - taxOnMiningIncome - periodElecCost;

            /* Which generation a reinvest purchase buys. Resolves to ORIGINAL_SPEC -- the
               same object, so p.capex exactly -- whenever the feature is off or no
               replacement has happened yet, which keeps the disabled path bit-identical. */
            var buySpec = (p.replacementEnabled && firstReplacementPeriod !== null &&
                           i >= firstReplacementPeriod) ? REPLACEMENT_SPEC : ORIGINAL_SPEC;
            var buySpecIsReplacement = (buySpec !== ORIGINAL_SPEC);
            var machinesBoughtThisPeriod = 0, reinvestSpent = 0;
            if (p.reinvestMode && buySpec.capex > 0 && periodCashFlow > 0) {
                reinvestPool += periodCashFlow;
                while (reinvestPool >= buySpec.capex) {
                    reinvestPool -= buySpec.capex;
                    activeMachines++;
                    totalMachinesBought++;
                    machinesBoughtThisPeriod++;
                    reinvestSpent += buySpec.capex;
                }
                if (machinesBoughtThisPeriod > 0) minerBatches.push(makeBatch(i, machinesBoughtThisPeriod, buySpec));
            }

            cumulBtcMined += periodBTCMined;
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
                hashpricePerTHDay: hashpricePerTHDay(btcPrice, difficulty, blockReward),
                machines: activeMachines, machinesBought: machinesBoughtThisPeriod,
                scheduledAdded: scheduledThisPeriod, retiredThisPeriod: retiredThisPeriod,
                replacedThisPeriod: replacedThisPeriod, pnlBtc: periodBTCMined,
                /* THE REPLACEMENT MARKER. salvageCredited and replacementNetOutlay are both
                   reported because they answer different questions: gross is what the old
                   machines were worth, net is what left the account. Collapsing them into one
                   "salvage" line makes the cash column unreadable at exactly the moment it
                   starts mattering -- when the price AND the count both change. */
                salvageCredited: salvageThisPeriod,
                replacementSpend: replacementSpend,
                replacementNetOutlay: replacementSpend - salvageThisPeriod,
                replacementClamped: replacementClamped,
                fleetHashrateTH: fleetHashrateTH,
                fleetPowerKW: currentPowerKW,
                boughtReplacementSpec: buySpecIsReplacement,
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
        var totalPL = cumulCashFlow + reinvestPool + heldBtcValue - cgtOnHeld;
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
        // Same correction as the loop: the rate applies to profit, not revenue. This card used
        // to print a NEGATIVE daily profit for a rig that was genuinely earning money.
        var dailyTaxDay1 = p.taxAdjustmentEnabled
            ? (Math.max(0, dailyRevenueDay1 - dailyElecDay1) * p.miningIncomeTaxRate) : 0;

        /* ---- GUARD RAILS -------------------------------------------------------------
           Both rules exist because efficiency improvement and difficulty growth are the SAME
           phenomenon seen from two sides. When the network moves from 15 J/TH to 10 J/TH the
           same megawatts produce 50% more hashrate, and that IS difficulty growth. A model
           that grants an efficiency bonus on top of a difficulty assumption is counting one
           industry trend twice.

           Upgrading is not a gain. It is the cost of staying level: a miner who re-equips on
           schedule roughly holds their share of the network, and one who replaces like for
           like loses share. These warn rather than block -- a distressed purchase or a
           forward batch at a discount is a real thing -- but they must be visible. */
        var origJTH = p.hashrateTH > 0 ? (p.powerKW * 1000) / p.hashrateTH : 0;
        var replJTH = p.replacementHashrateTH > 0
            ? (p.replacementPowerKW * 1000) / p.replacementHashrateTH : 0;
        var origUsdPerTH = p.hashrateTH > 0 ? p.capex / p.hashrateTH : 0;
        var replUsdPerTH = p.replacementHashrateTH > 0
            ? p.replacementCapex / p.replacementHashrateTH : 0;

        /* RULE 1 -- efficiency is never free. Every observed generation of hardware charges a
           premium for it: S21 Pro 15 J/TH at ~$10/TH, S21 XP Hyd 12 J/TH at ~$15/TH, S23
           Hydro 9.5 J/TH at ~$22/TH. $/TH rises steeply as J/TH falls. A replacement that is
           more efficient at the same or lower $/TH contradicts every price observed. */
        var rule1Violated = !!(p.replacementEnabled && origJTH > 0 && replJTH > 0 &&
                               replJTH < origJTH && replUsdPerTH <= origUsdPerTH);

        /* RULE 2 -- difficulty rises BECAUSE the fleet upgrades. Annualise the implied
           efficiency gain over the machine's life and compare it to annualised difficulty
           growth. Efficiency improving faster than difficulty asserts that the rest of the
           network stands still while you re-equip. */
        var lifeYears = p.lifespanMonths / 12;
        var effAnnualPct = (p.replacementEnabled && origJTH > 0 && replJTH > 0 && lifeYears > 0)
            ? (1 - Math.pow(replJTH / origJTH, 1 / lifeYears)) * 100 : 0;
        var diffAnnualPct = (Math.pow(1 + p.monthlyDiffChangePct, 12) - 1) * 100;
        var rule2Violated = !!(p.replacementEnabled && effAnnualPct > diffAnnualPct);

        var replacementWasClamped = tableRows.some(function (t) { return t.replacementClamped; });

        return {
            params: p,
            replacementOriginalJTH: origJTH,
            replacementNewJTH: replJTH,
            replacementOriginalUsdPerTH: origUsdPerTH,
            replacementNewUsdPerTH: replUsdPerTH,
            replacementEfficiencyAnnualPct: effAnnualPct,
            difficultyAnnualPct: diffAnnualPct,
            rule1Violated: rule1Violated,
            rule2Violated: rule2Violated,
            replacementWasClamped: replacementWasClamped,
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
            buyHoldSpend: buyHoldSpend,
            preTaxCapital: p.preTaxCapital,
            deductibleBasis: deductibleBasis,
            taxShieldValue: taxShieldValue,
            deploymentRatio: deploymentRatio,
            /* Only whether to SAY something, never a computed limitation. */
            exceedsExcessBusinessLoss: taxShieldValue > EXCESS_BUSINESS_LOSS_THRESHOLD,
            excessBusinessLossThreshold: EXCESS_BUSINESS_LOSS_THRESHOLD,
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

    /* Hashprice at any period index, including one BEYOND the modelled horizon. A machine
       that retires in month 48 of a 36-month projection still has a price, and the field
       describing it should not go blank just because the table stops earlier. Uses exactly
       the same growth arithmetic computeProjection does. */
    function hashpriceAtPeriod(settings, periodIndex) {
        var p = normalise(settings);
        var cfg = PERIOD_CONFIG[p.periodLength];
        var days = cfg.days;
        var priceStep = Math.pow(1 + p.monthlyPriceChangePct, days / 30.44) - 1;
        var diffStep = Math.pow(1 + p.monthlyDiffChangePct, days / 30.44) - 1;
        var i = Math.max(0, periodIndex);
        var price = p.btcPrice0 * Math.pow(1 + priceStep, i);
        var diff = (p.difficultyT * 1e12) * Math.pow(1 + diffStep, i);
        var reward = getBlockReward(p.startDate.getTime() + i * days * 86400000);
        return hashpricePerTHDay(price, diff, reward);
    }

    /* THE REPLACEMENT PRICE, derived rather than assumed.
       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
       $/TH tracks HASHPRICE, not efficiency. That is the whole model, and it is the opposite
       of the intuition. Over six years efficiency roughly doubled while $/TH fell about three
       quarters: hashprice went ~$112 -> ~$35/PH/day (-69%) and S19 Pro -> S21+ Hyd went
       ~$24.50 -> ~$6.58/TH (-73%). December 2025 is the clean demonstration -- Bitmain cut to
       $3-4/TH because hashprice fell to ~$35/PH/day, not because the machines changed. ASICs
       are priced off expected earnings.

       The efficiency premium visible on any given day is a NEW-GENERATION premium that decays
       as a generation matures, which this calculator's own machine list shows: S21 Pro and
       S21+ Hyd are both 15 J/TH at $10.26 and $6.58/TH. Same efficiency, different points on
       the age curve. A replacement four years out is mature hardware from a newer generation,
       not that year's flagship -- so pricing it at today's flagship premium would be wrong.

       IT IS NOT A FORECAST. It is today's price per terahash scaled by the user's own
       projection of hashprice, and the copy on screen says exactly that. The $/TH-to-hashprice
       relationship is inferred from a handful of observations over six years: directionally
       sound, better than assuming a fixed premium, not precise. */
    function deriveReplacement(opts) {
        var o = opts || {};
        var origHashrateTH = Math.max(0, num(o.hashrateTH, 0));
        var origPowerKW = Math.max(0, num(o.powerKW, 0));
        var origCapex = Math.max(0, num(o.capex, 0));
        var jth = Math.max(1e-9, num(o.replacementJTH, 0));
        var ratio = Math.max(0, num(o.hashpriceRatio, 1));

        var origWatts = origPowerKW * 1000;
        var currentPerTH = origHashrateTH > 0 ? origCapex / origHashrateTH : 0;
        var newPerTH = currentPerTH * ratio;
        var newHashrateTH = origWatts / jth;
        return {
            hashrateTH: newHashrateTH,
            powerKW: origPowerKW,          // same power envelope unless the user says otherwise
            capex: newHashrateTH * newPerTH,
            currentPerTH: currentPerTH,
            perTH: newPerTH,
            ratio: ratio
        };
    }

    return {
        computeProjection: computeProjection,
        hashpricePerTHDay: hashpricePerTHDay,
        hashpriceAtPeriod: hashpriceAtPeriod,
        deriveReplacement: deriveReplacement,
        getBlockReward: getBlockReward,
        normalise: normalise,
        PERIOD_CONFIG: PERIOD_CONFIG,
        HALVINGS: HALVINGS,
        CURRENT_BLOCK_REWARD: CURRENT_BLOCK_REWARD
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CalcEngine;
