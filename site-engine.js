// ===== PROTON MINING — Site Evaluation Engine =====
// Pure evaluation math for a single site — a sourced energy prospect or a vendor's offer.
// Same downstream math either way; only the origin of `usable_kw` differs.
//
// No DOM, no network, no globals beyond the export. `market` and `config` are explicit
// parameters rather than reads off window.* so that:
//   1. every number is traceable — you can hand-check any output against your own calculator,
//   2. the whole engine is node-testable with no browser.
//
// MISSING DATA IS NEVER GUESSED. An absent input yields null for anything derived from it and
// the field name is recorded in result.missing[]. A site with no purchase price reports "no
// cost_per_usable_kw", not a zero that quietly ranks it best.

var SiteEngine = (function() {

    // THE FLEET UNIT IS PRICED FROM MinerDB, NOT FROM A LITERAL HERE.
    //
    // It used to be a literal, and the literal was wrong: $2,400 is the Antminer S19j Pro+
    // price, left behind when the default fleet unit was upgraded to the S21 Pro ($4,260 in
    // miner-db.js). Every all-in capital figure in prospects mode was built on it — miners are
    // usually the single largest all-in component, so each figure understated by roughly a
    // fifth, invisibly, while the hardware page showed the right price for the same machine.
    //
    // The failure was the seam: two files each declared the price of one machine. So the seam
    // is removed rather than reconciled — this engine now reads the unit it names from the one
    // price list, and THROWS if it cannot. A throw, not a fallback: a silent default here is
    // precisely how the $2,400 survived. map.html learned to load miner-db.js first the loud
    // way. tests/site-engine.test.js pins DEFAULT_CONFIG to the MinerDB row so the two can
    // never diverge again, whichever way prices move.
    // The S21+ Hyd., owner's choice (2026-09): 395 TH at 5,925 W, quoted $2,500. The price
    // lives in miner-db.js -- changing it THERE moves every figure; changing it here is the
    // seam this block exists to prevent.
    var FLEET_UNIT_MODEL = 'Antminer S21+ Hyd.';
    var _minerDb = (typeof MinerDB !== 'undefined') ? MinerDB
        : (typeof require === 'function' ? require('./miner-db.js') : null);
    if (!_minerDb) {
        throw new Error('SiteEngine requires miner-db.js to be loaded first — ' +
                        'the fleet unit (' + FLEET_UNIT_MODEL + ') is priced from it');
    }
    var _fleetUnit = _minerDb.findByModel(FLEET_UNIT_MODEL);
    if (!_fleetUnit) {
        throw new Error('SiteEngine fleet unit "' + FLEET_UNIT_MODEL + '" is not in MinerDB — ' +
                        'if the model was renamed there, rename it here in the same commit');
    }

    // ---- Constants, with the reasoning that picked them -------------------------------

    // Bitcoin targets one block per 10 minutes => 144/day. Same constant charts.js uses for
    // hash price, kept identical so the two surfaces cannot disagree.
    var BLOCKS_PER_DAY = 144;

    // The spec's monthly_btc formula bills a month as a flat 30 days (not 30.44). Keeping 30
    // here is deliberate: it reproduces the vendor-comparison numbers exactly. CalcEngine uses
    // 30.44 for multi-year projections where the drift compounds; a one-month snapshot does not
    // care, and matching the spec matters more.
    var DAYS_PER_MONTH = 30;

    // 720 = 24 h x 30 d. Power is billed on wall-clock hours, so this is independent of the
    // 30 vs 30.44 question above.
    var HOURS_PER_MONTH = 720;

    var DEFAULT_CONFIG = {
        // The default fleet unit, resolved from MinerDB above. minerWatts arrives as kW there
        // and as watts here — the x1000 is a unit conversion, not a scale factor.
        minerModel: FLEET_UNIT_MODEL,
        minerWatts: Math.round(_fleetUnit.power * 1000),
        minerTh: _fleetUnit.hashrate,
        minerUnitCostUsd: _fleetUnit.cost,
        minerAlgorithm: 'SHA-256',

        hoursPerMonth: HOURS_PER_MONTH,
        blocksPerDay: BLOCKS_PER_DAY,
        daysPerMonth: DAYS_PER_MONTH,

        // Flag rule 1 fires when a claim is within this % of the raw ceiling. No real site runs
        // at 100% of nameplate — service loads, transformer derate and ambient headroom all eat
        // into it — so "exactly at capacity" is as much a red flag as "over capacity".
        // This affects the FLAG ONLY; max_miners below stays the honest floor(usable/watts) so
        // it remains checkable by hand.
        headroomPct: 10,

        // Gas -> power. ~1,000 BTU per cubic foot of pipeline gas, and a reciprocating genset
        // burns ~10,000 BTU per kWh. That is 10 cf/kWh, i.e. 1 Mcf ~ 100 kWh, i.e. the spec's
        // "1 MMcf/day ~ 4 MW" (1e6 cf/d / 10 cf/kWh / 24 h = 4,167 kW). Both configurable
        // because heat rate varies materially by genset model and altitude.
        heatRateBtuPerKwh: 10000,
        gasBtuPerCf: 1000,

        // Applied to mined BTC. Default to the spec's formula exactly (no derate) so the
        // validation numbers reproduce; override when modelling a real operation.
        uptimePct: 100,
        poolFeePct: 0,

        // The window the walk-away rate has to return capital inside. A negotiating stance
        // rather than a fact, which is why it is configurable and is stated in the label
        // wherever the derived rate is shown.
        targetPaybackMonths: 36,

        // Rule 7: anything claiming to beat this is claiming better-than-best-in-class silicon.
        bestInClassJoulesPerTh: 13,
        maxPlausibleUpliftPct: 15,
        // Rule 6: used ASIC warranties beyond this are not credible.
        maxPlausibleWarrantyMonths: 24
    };

    // ---- Small helpers ----------------------------------------------------------------

    // Returns a finite number or null. Unlike parseFloat(x) || d this preserves a genuine 0 —
    // the same bug class that CalcEngine documents at calc-engine.js:64.
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(n) ? n : null;
    }

    function positiveOrNull(v) {
        var n = numOrNull(v);
        return (n === null || n <= 0) ? null : n;
    }

    // Divide that refuses to invent a number. Any null operand, or a zero divisor, yields null.
    function div(a, b) {
        if (a === null || b === null || b === 0) return null;
        var r = a / b;
        return isFinite(r) ? r : null;
    }

    function mul() {
        var out = 1;
        for (var i = 0; i < arguments.length; i++) {
            if (arguments[i] === null) return null;
            out *= arguments[i];
        }
        return isFinite(out) ? out : null;
    }

    function resolveConfig(config) {
        var c = {};
        for (var k in DEFAULT_CONFIG) if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k)) c[k] = DEFAULT_CONFIG[k];
        if (config) {
            for (var k2 in config) {
                if (Object.prototype.hasOwnProperty.call(config, k2) && config[k2] !== undefined && config[k2] !== null) {
                    c[k2] = config[k2];
                }
            }
        }
        return c;
    }

    // ---- FX ---------------------------------------------------------------------------
    // market.fx maps a currency code to USD PER ONE UNIT of it, e.g. { CAD: 0.73 }.
    // Derive from the app's existing data with:  fx.CAD = liveBtcPrices.usd / liveBtcPrices.cad
    // (BTC priced in both numeraires gives the cross rate directly — the same trick
    // getCurrencyMultiplier() in shared.js already relies on, just inverted.)
    //
    // Returns { value, rate, missing } — never a silent 1.0 for an unknown currency, because
    // treating 1 CAD as 1 USD would make a site look ~37% cheaper than it is.
    function toUsd(amount, currency, market) {
        if (amount === null) return { value: null, rate: null, missing: null };
        var code = (currency || '').toUpperCase();
        if (!code || code === 'USD') return { value: amount, rate: 1, missing: null };
        var fx = market && market.fx ? market.fx : null;
        var rate = fx ? numOrNull(fx[code]) : null;
        if (rate === null || rate <= 0) return { value: null, rate: null, missing: 'fx.' + code };
        return { value: amount * rate, rate: rate, missing: null };
    }

    // ---- Energy -> capacity ------------------------------------------------------------
    // Exposed because Phase 2 source adapters convert their own units into kW before the
    // engine ever sees them. Flare gas is only the first such source.
    //   Mcf/day -> kW:  Mcf x 1000 cf x BTU/cf / (BTU/kWh) / 24 h
    function gasMcfDayToKw(mcfPerDay, config) {
        var c = resolveConfig(config);
        var v = numOrNull(mcfPerDay);
        if (v === null || v < 0) return null;
        return (v * 1000 * c.gasBtuPerCf) / c.heatRateBtuPerKwh / 24;
    }

    function kwToGasMcfDay(kw, config) {
        var c = resolveConfig(config);
        var v = numOrNull(kw);
        if (v === null || v < 0) return null;
        return (v * 24 * c.heatRateBtuPerKwh) / c.gasBtuPerCf / 1000;
    }

    // ---- Main evaluation ---------------------------------------------------------------
    //
    // site   — the input record (see site-model.js for the field list)
    // market — { btcPriceUsd, networkHashratePh, blockRewardBtc, fx: { CAD: <usd per cad> } }
    // config — miner spec and conversion constants; see DEFAULT_CONFIG
    //
    // Returns every metric the spec names PLUS the intermediates each was built from, so any
    // figure can be reproduced by hand.
    // `capex` is an OPTIONAL fourth argument: a pre-computed capital stack from the caller.
    // The engine does not know or care what its components mean — it adds up whatever it is
    // handed. All domain knowledge about which stage inherits what lives outside this file,
    // which is what keeps the assertions that this engine mentions no energy source at all true.
    // Omitting it leaves every derived field null and every existing field byte-identical.
    function evaluate(site, market, config, capex) {
        site = site || {};
        market = market || {};
        var c = resolveConfig(config);
        var missing = [];
        function need(name, value) { if (value === null) missing.push(name); return value; }

        // --- Inputs -----------------------------------------------------------------
        var nameplateKw = need('nameplate_kw', positiveOrNull(site.nameplate_kw));
        var usableKw    = need('usable_kw',    positiveOrNull(site.usable_kw));
        var purchaseUsd = need('purchase_price_usd', numOrNull(site.purchase_price_usd));

        var rateRaw      = numOrNull(site.power_rate);
        var rateCurrency = site.power_rate_currency || '';
        if (rateRaw === null) missing.push('power_rate');
        if (rateRaw !== null && !rateCurrency) missing.push('power_rate_currency');

        var rateFx = toUsd(rateRaw, rateCurrency || 'USD', market);
        if (rateFx.missing) missing.push(rateFx.missing);
        var powerRateUsd = rateFx.value;

        var takeOrPayPct   = numOrNull(site.take_or_pay_pct);
        var contractYears  = numOrNull(site.contract_term_years);
        var omHourlyRate   = numOrNull(site.om_hourly_rate);

        // --- Market -----------------------------------------------------------------
        var btcPriceUsd      = need('market.btcPriceUsd',      positiveOrNull(market.btcPriceUsd));
        var networkHashPh    = need('market.networkHashratePh', positiveOrNull(market.networkHashratePh));
        var blockRewardBtc   = need('market.blockRewardBtc',    positiveOrNull(market.blockRewardBtc));

        // --- Capital efficiency -----------------------------------------------------
        var costPerUsableKw = div(purchaseUsd, usableKw);
        var usableRatio     = div(usableKw, nameplateKw);

        // --- Fleet capacity ---------------------------------------------------------
        // Raw (fractional) ceiling is kept alongside the floored count: rule 1 needs to know
        // how close a claim sits to the true limit, which flooring destroys.
        var minerCapacityRaw = div(usableKw === null ? null : usableKw * 1000, c.minerWatts);
        var maxMiners        = minerCapacityRaw === null ? null : Math.floor(minerCapacityRaw);
        var totalHashratePh  = maxMiners === null ? null : (maxMiners * c.minerTh) / 1000;

        // --- Power cost -------------------------------------------------------------
        var monthlyPowerFull = mul(usableKw, c.hoursPerMonth, powerRateUsd);
        var takeOrPayFloor   = (takeOrPayPct === null)
            ? null
            : mul(usableKw, takeOrPayPct / 100, c.hoursPerMonth, powerRateUsd);

        // Power actually consumed. uptimePct derates production below, and billing the full 720
        // hours against derated output was a real asymmetry: CalcEngine applies uptime to BOTH
        // sides (calc-engine.js:213 and :215) and the header of this file says the two engines
        // must not diverge. It stayed invisible only because uptimePct defaults to 100 and
        // nothing set it — the moment a measured duty cycle arrives, a 20%-duty plant would be
        // charged 720 hours of power against 144 hours of hashing, driving monthly_net negative
        // across most of the catalog and nulling payback by the rule below.
        //
        // The semantics this encodes: you own the plant, so you burn fuel only when generating.
        var monthlyPowerUsed = mul(monthlyPowerFull, c.uptimePct / 100);

        // ...but never less than a contracted minimum. take_or_pay_pct is the obligation you owe
        // whether or not you run, so it is a FLOOR on the bill rather than a separate downside
        // case. It is null on every prospect today, which leaves this inert until a real contract
        // is entered — at which point a low-duty site correctly stops paying back.
        var monthlyPowerUsd = monthlyPowerUsed;
        if (monthlyPowerUsd !== null && takeOrPayFloor !== null && takeOrPayFloor > monthlyPowerUsd) {
            monthlyPowerUsd = takeOrPayFloor;
        }

        // O&M, when a model is supplied. om_hourly_rate is a $/hour site charge, billed on
        // wall-clock hours: a site under contract is staffed and maintained whether or not the
        // miners are hashing.
        var monthlyOmUsd = omHourlyRate === null ? null : omHourlyRate * c.hoursPerMonth;

        var monthlyCashUsd = monthlyPowerUsd;
        if (monthlyCashUsd !== null && monthlyOmUsd !== null) monthlyCashUsd += monthlyOmUsd;

        // --- Production -------------------------------------------------------------
        // monthly_btc = share of network hashrate x daily network issuance x days
        var dailyNetworkBtc = blockRewardBtc === null ? null : blockRewardBtc * c.blocksPerDay;
        var hashShare       = div(totalHashratePh, networkHashPh);
        var monthlyBtcGross = mul(hashShare, dailyNetworkBtc, c.daysPerMonth);
        // Defaults (100% uptime, 0% pool fee) leave this identical to the gross figure, so the
        // spec's formula reproduces exactly unless you deliberately derate it.
        var monthlyBtc      = mul(monthlyBtcGross, c.uptimePct / 100, 1 - (c.poolFeePct / 100));

        var monthlyRevenue  = mul(monthlyBtc, btcPriceUsd);
        var monthlyNet      = (monthlyRevenue === null || monthlyCashUsd === null)
            ? null : monthlyRevenue - monthlyCashUsd;

        // --- Unit economics ---------------------------------------------------------
        var cashCostPerBtc = div(monthlyCashUsd, monthlyBtc);
        // Break-even price is the price at which monthlyNet == 0, which is cash cost per BTC by
        // definition. Computed independently rather than aliased so the identity stays a
        // verifiable property of the engine instead of an assumption baked into it.
        var breakevenBtcPrice = div(monthlyCashUsd, monthlyBtc);
        // $/TH/day at which daily revenue covers daily cash cost.
        var totalTh = maxMiners === null ? null : maxMiners * c.minerTh;
        var breakevenHashprice = div(
            monthlyCashUsd === null ? null : monthlyCashUsd / c.daysPerMonth,
            totalTh
        );

        // --- The walk-away rate -------------------------------------------------------
        //
        // Every break-even above answers "what must BITCOIN do". In a gas negotiation nobody is
        // negotiating the bitcoin price — they are negotiating the power price, and the engine
        // never said what the most you can pay is. This does.
        //
        // TWO numbers, deliberately, because they are 3-4x apart and mean different things:
        //
        //   cash    — the rate where monthly_net reaches zero. Below it you are still losing
        //             money every month. This is the true walk-away, and it flatters: it ignores
        //             the capital entirely.
        //   capital — the rate that still returns the invested capital inside the target payback
        //             window. This is the number to actually negotiate against.
        //
        // Both are closed form from values already computed above; there is no solver.
        //
        // NOTE the hours are UNDERATED on purpose. Revenue already carries the uptime derate via
        // monthlyBtc, and the power bill carries it too, so the factor cancels out of the ratio —
        // the walk-away rate is genuinely identical at 100%, 50% and 20% duty. That is the same
        // property that makes cash_cost_per_btc duty-invariant, and it is asserted in the tests
        // because if the derate ever gets applied to one side only, this is where it shows.
        var billedKwh = (usableKw === null) ? null : usableKw * c.hoursPerMonth * (c.uptimePct / 100);
        var maxPowerRateCash = div(monthlyRevenue, billedKwh);

        // Capital recovered over the target window. Uses all-in capital where a capex stack was
        // supplied and the narrower total otherwise, so the answer is never more optimistic than
        // the capital figure the panel is showing beside it.
        var targetMonths = c.targetPaybackMonths;
        var maxPowerRateCapital = null;

        // --- Capital & payback ------------------------------------------------------
        var minerCapexUsd = maxMiners === null ? null : maxMiners * c.minerUnitCostUsd;
        var totalCapital  = (purchaseUsd === null || minerCapexUsd === null)
            ? null : purchaseUsd + minerCapexUsd;
        // Null rather than Infinity when the site does not clear its power bill — "never pays
        // back" is a different statement from "pays back in a very long time", and the UI must
        // be able to tell them apart.
        var paybackMonths = (monthlyNet !== null && monthlyNet > 0)
            ? div(totalCapital, monthlyNet) : null;

        // --- All-in capital, when a capex stack was supplied -------------------------
        // Deliberately NOT folded into total_capital: that field, cost_per_usable_kw and the
        // flag rule that reads it are all pinned by existing assertions, and site-flags.js rule 5
        // would stop firing SILENTLY if cost_per_usable_kw changed meaning. New facts get new
        // names.
        var developmentCapexUsd = (capex && typeof capex.additional_usd === 'number')
            ? capex.additional_usd : null;
        var allInCapitalUsd = (totalCapital === null || developmentCapexUsd === null)
            ? null : totalCapital + developmentCapexUsd;
        var allInCostPerUsableKw = div(allInCapitalUsd, usableKw);
        var paybackMonthsAllIn = (monthlyNet !== null && monthlyNet > 0)
            ? div(allInCapitalUsd, monthlyNet) : null;

        // The rate that still returns the capital inside the target window (declared above,
        // assigned here because the capital figures do not exist until now).
        //
        //   revenue - capital/N = usableKw x hours x rate     ->   rate = (revenue - capital/N) / kWh
        //
        // Prefers all-in capital when a capex stack was supplied, so this can never be more
        // optimistic than the capital number rendered beside it. Goes NEGATIVE, not null, when
        // the capital cannot be recovered at any price — a negative ceiling is the honest way to
        // say "this does not work even if the gas is free", and clamping it to zero would hide
        // exactly that.
        var recoverCapital = allInCapitalUsd !== null ? allInCapitalUsd : totalCapital;
        if (monthlyRevenue !== null && billedKwh !== null && billedKwh > 0 &&
            recoverCapital !== null && targetMonths > 0) {
            maxPowerRateCapital = (monthlyRevenue - recoverCapital / targetMonths) / billedKwh;
        }
        var monthsToRevenue = (capex && capex.months_to_revenue) ? capex.months_to_revenue : null;
        // Payback measured from CLOSING rather than from first power. On these numbers the wait
        // is the same order of magnitude as the payback itself, so a static snapshot that omits
        // it is not merely incomplete — it is wrong by roughly a factor of two on the decision
        // it is being used to make.
        var monthsToPaybackFromClose = (paybackMonthsAllIn === null || monthsToRevenue === null)
            ? null
            : { min: monthsToRevenue.min + paybackMonthsAllIn, max: monthsToRevenue.max + paybackMonthsAllIn };

        // Downside: the obligation that survives at zero utilization.
        var takeOrPayShareOfRevenue = div(takeOrPayFloor, monthlyRevenue);

        return {
            // capital efficiency
            cost_per_usable_kw: costPerUsableKw,
            usable_ratio: usableRatio,

            // capacity
            max_miners: maxMiners,
            miner_capacity_raw: minerCapacityRaw,
            total_hashrate_ph: totalHashratePh,
            total_hashrate_th: totalTh,

            // power
            power_rate_usd: powerRateUsd,
            power_rate_fx: rateFx.rate,
            monthly_power_full: monthlyPowerFull,
            // What is actually billed: the full figure derated by uptime, floored by any
            // take-or-pay obligation. Equal to monthly_power_full at the default 100% uptime,
            // which is why every existing assertion still holds.
            monthly_power_usd: monthlyPowerUsd,
            monthly_om_usd: monthlyOmUsd,
            monthly_cash_usd: monthlyCashUsd,
            take_or_pay_floor: takeOrPayFloor,
            take_or_pay_share_of_revenue: takeOrPayShareOfRevenue,

            // production & economics
            hash_share: hashShare,
            daily_network_btc: dailyNetworkBtc,
            monthly_btc: monthlyBtc,
            monthly_revenue: monthlyRevenue,
            monthly_net: monthlyNet,
            cash_cost_per_btc: cashCostPerBtc,
            breakeven_btc_price: breakevenBtcPrice,
            breakeven_hashprice: breakevenHashprice,
            // The most you can pay for power — the only figure actually on the table in a gas
            // negotiation, and the one the engine never produced. cash = monthly net reaches
            // zero; capital = still returns the invested capital inside target_payback_months.
            // Both null without market data, and neither moves any pre-existing output.
            max_power_rate_cash_usd: maxPowerRateCash,
            max_power_rate_capital_usd: maxPowerRateCapital,
            target_payback_months: targetMonths,

            // capital
            miner_capex_usd: minerCapexUsd,
            total_capital: totalCapital,
            // All null unless a capex stack was supplied.
            development_capex_usd: developmentCapexUsd,
            all_in_capital_usd: allInCapitalUsd,
            all_in_cost_per_usable_kw: allInCostPerUsableKw,
            payback_months_all_in: paybackMonthsAllIn,
            months_to_revenue: monthsToRevenue,
            months_to_payback_from_close: monthsToPaybackFromClose,
            avoided_capex_usd: (capex && typeof capex.avoided_usd === 'number') ? capex.avoided_usd : null,
            capex_coverage: (capex && typeof capex.coverage === 'number') ? capex.coverage : null,
            payback_months: paybackMonths,

            // contract passthrough (flags read these)
            take_or_pay_pct: takeOrPayPct,
            contract_term_years: contractYears,

            // provenance
            config: c,
            market: {
                btcPriceUsd: btcPriceUsd,
                networkHashratePh: networkHashPh,
                blockRewardBtc: blockRewardBtc
            },
            missing: missing
        };
    }

    return {
        evaluate: evaluate,
        gasMcfDayToKw: gasMcfDayToKw,
        kwToGasMcfDay: kwToGasMcfDay,
        DEFAULT_CONFIG: DEFAULT_CONFIG,
        BLOCKS_PER_DAY: BLOCKS_PER_DAY,
        HOURS_PER_MONTH: HOURS_PER_MONTH,
        DAYS_PER_MONTH: DAYS_PER_MONTH,
        // exported for tests and for source adapters that need the same null-safe semantics
        _numOrNull: numOrNull,
        _toUsd: toUsd
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteEngine;
