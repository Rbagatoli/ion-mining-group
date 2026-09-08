/* Capital-constrained research priority. Scores are heuristics, never deal probabilities. */
var ProspectPriority = (function () {
    'use strict';
    var D = typeof ProspectDiligence !== 'undefined' ? ProspectDiligence : require('./prospect-diligence');
    var WEIGHTS = { capital: 35, economics: 25, availability: 15, infrastructure: 10, closing: 10, timing: 5 };
    var HORIZON_MONTHS = 24, DIFFICULTY_MONTHLY = 0.01;
    function number(v) { return D.num(v); }
    function clamp(v) { return Math.max(0, Math.min(1, v)); }
    function day(v) { var n = Date.parse(String(v) + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === v; }
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function usd(v) { return v == null ? 'Unpriced' : '$' + Math.round(v).toLocaleString('en-US'); }
    function timeline(r, now) {
        var elapsed = (Date.parse(D.today(now)) - Date.parse(r.checked_on)) / (30 * 86400000);
        var start = Number(r.months_to_operation) - elapsed;
        return { start: start, remaining: Math.max(0, start + Number(r.term_months)) };
    }
    function review(site, now) {
        var state = D.state(site), r = state.error ? null : state.economics;
        var fields = ['capacity_kw', 'all_in_power_usd_kwh', 'minimum_monthly_power_usd', 'fixed_monthly_usd', 'uptime_pct', 'term_months', 'months_to_operation', 'pool_fee_pct'];
        var valid = !!(r && r.cost_basis === 'quote' && r.operating_scope_complete && r.evidence_note && r.reviewer && D.current(r.checked_on, now) &&
            (!r.quote_expires || r.quote_expires >= D.today(now)) && fields.every(function (k) { return number(r[k]) !== null; }) &&
            r.capacity_kw > 0 && r.uptime_pct <= 100 && r.pool_fee_pct <= 100 && r.term_months > 0 && r.term_months <= 600 && r.months_to_operation <= 120 && (!r.quote_expires || day(r.quote_expires)));
        return { value: r || {}, current: valid, reason: !r ? 'Record delivered energy, other operating costs and timing.' : valid ? 'Operating scope reviewed on ' + r.checked_on + '.' : 'Operating review is incomplete, expired or needs a current check.' };
    }
    // A fixed-price BTC comparison over 24 thirty-day months. Power and overhead are paid
    // from production; an operating shortfall is charged against mining, never free funding.
    // No terminal equipment/contract value or tax/financing benefit is invented.
    function comparison(estimate, operating, market, config, now) {
        var e = estimate || {}, r = operating || {}, b = e.budget || {}, cap = e.capacity || {};
        var btc = number(market && market.btcPriceUsd), network = number(market && market.networkHashratePh);
        var C = typeof CalcEngine !== 'undefined' ? CalcEngine : typeof require === 'function' ? require('./calc-engine') : null;
        var cfg = config || {}, minerTh = number(cfg.minerTh), minerWatts = number(cfg.minerWatts);
        if (!C || !b.complete || b.allowanceCount !== 0 || !(btc > 0 && network > 0 && minerTh > 0 && minerWatts > 0) ||
            !(cap.contractedKw >= e.targetKw && e.targetKw > 0) || !(b.base >= 0)) return null;
        var initial = b.base + (b.paid || 0), start = Date.parse(D.today(now) + 'T00:00:00Z');
        if (!(initial > 0)) return null;
        var count = Math.min(e.fleet.count, Math.floor(e.targetKw * 1000 / minerWatts));
        var hashPh = count * minerTh / 1000, flat = 0, rising = 0, power = 0, other = 0;
        var shortfall = 0, months = 0, delay = timeline(r, now).start, term = Number(r.term_months);
        for (var i = 0; i < HORIZON_MONTHS; i++) {
            // Fractional commissioning/term boundaries apply to production and variable power.
            var active = Math.max(0, Math.min(i + 1, delay + term) - Math.max(i, delay));
            if (!active) continue;
            var date = start + (i + 0.5) * 30 * 86400000, reward = C.getBlockReward(date);
            var coins = hashPh / network * reward * 144 * 30 * active * r.uptime_pct / 100 * (1 - r.pool_fee_pct / 100);
            var energy = Math.max(e.targetKw * 720 * r.uptime_pct / 100 * r.all_in_power_usd_kwh, r.minimum_monthly_power_usd) * active;
            var overhead = r.fixed_monthly_usd * active;
            var costBtc = (energy + overhead) / btc, decliningCoins = coins / Math.pow(1 + DIFFICULTY_MONTHLY, i);
            flat += coins - costBtc; rising += decliningCoins - costBtc;
            shortfall += Math.max(0, energy + overhead - decliningCoins * btc);
            power += energy; other += overhead; months += active;
        }
        return { horizonMonths: HORIZON_MONTHS, productionMonths: months, initialUsd: initial, btcPriceUsd: btc,
            buyBtc: initial / btc, flatNetBtc: flat, stressNetBtc: rising, stressDifferenceBtc: rising - initial / btc,
            powerUsd: power, overheadUsd: other, operatingShortfallUsd: shortfall, difficultyMonthlyPct: 1,
            note: '24 months from today; flat BTC price; flat or +1% monthly network difficulty; projected subsidy halvings. Power and recorded overhead paid from mining. Includes construction delay and the recorded supply term. Before tax, financing, pre-operation overhead and terminal asset value; no automatic equipment replacement.' };
    }
    function evaluate(candidate, ctx) {
        var c = candidate || {}; ctx = ctx || {};
        var e = ctx.estimate || {}, saved = ctx.saved || {}, cap = e.capacity || {}, b = e.budget || {}, inv = e.inventory || [];
        var operating = review(saved, ctx.now), r = operating.value, cashLimit = number(ctx.cashLimitUsd);
        var complete = !!b.complete, quoted = complete && b.allowanceCount === 0;
        var cash = complete ? number(b.base) : e.ready ? number(e.base) : null;
        var target = number(e.targetKw), perKw = cash !== null && target > 0 ? cash / target : null;
        if (operating.current && Number(r.capacity_kw) !== target) { operating.current = false; operating.reason = 'Review operating costs for the current planning size; the saved offer covers a different phase.'; }
        var allocation = target > 0 && cap.contractedKw !== null && cap.contractedKw >= target;
        var av = ctx.availability || {}, parts = [], reasons = [], gaps = [], blockers = [];
        function part(id, label, fraction, basis) { parts.push({ id: id, label: label, weight: WEIGHTS[id], points: WEIGHTS[id] * clamp(fraction || 0), basis: basis }); }
        var scale = cashLimit > 0 ? cashLimit : 1000000;
        // Cash and cost/kW both matter. Small, unquoted plans receive limited credit because
        // a per-kW allowance does not capture minimum package sizes and other fixed costs.
        var confidence = quoted ? 1 : complete ? 0.75 : 0.45;
        var sizeFit = quoted ? 1 : target > 0 ? Math.min(1, target / 500) : 0;
        var capital = cash === null ? 0 : (0.6 / (1 + cash / scale) + 0.4 / (1 + perKw / 1000)) * confidence * sizeFit;
        part('capital', 'Cash still to fund', capital, cash === null ? 'No usable budget.' : usd(cash) + (complete ? ' scoped remaining budget' : ' priced subtotal; unpriced work remains') + ' at ' + Math.round(target).toLocaleString() + ' planning kW.');
        if (cash !== null) reasons.push(usd(cash) + (complete ? ' remaining in the scoped budget.' : ' priced upfront subtotal; add unpriced work.'));
        if (!complete) gaps.push('Price the remaining scope and agree who funds each package.');
        else if (!quoted) gaps.push('Replace planning allowances with current scoped quotes.');
        if (!(cashLimit > 0)) gaps.push('Set a cash ceiling to check fit with the available budget.');
        if (!allocation) gaps.push('Confirm the net power allocation and delivery point for this planning size.');
        var cmp = operating.current && quoted && allocation ? comparison(e, r, ctx.market, ctx.config, ctx.now) : null;
        var economics = operating.current ? 0.45 / (1 + r.all_in_power_usd_kwh / 0.05) : 0;
        if (cmp) economics = clamp(cmp.stressNetBtc / cmp.buyBtc / 2);
        part('economics', 'Operating economics', economics, cmp ? '24-month scenario: ' + cmp.stressNetBtc.toFixed(2) + ' net BTC equivalent versus ' + cmp.buyBtc.toFixed(2) + ' BTC bought.' : operating.reason);
        if (!operating.current) gaps.push(operating.reason);
        var duty = operating.current ? r.uptime_pct : number(av.dutyPct);
        var deliveryConfidence = operating.current ? allocation ? 1 : 0.5 : av.basis === 'measured' ? 0.35 : 0.15;
        var schedule = operating.current ? timeline(r, ctx.now) : null;
        var duration = operating.current ? Math.min(1, schedule.remaining / HORIZON_MONTHS) : 0.5;
        part('availability', 'Dependable usable power', duty === null ? 0 : duty / 100 * deliveryConfidence * duration,
            operating.current ? r.uptime_pct + '% reviewed delivery assumption for ' + r.term_months + ' months.' : 'Public generation/utilization is a research clue; no supply commitment established.');
        var relevant = inv.filter(function (a) { return ['collection', 'gas_treatment', 'generation', 'electrical', 'mining_infrastructure'].indexOf(a.id) >= 0 && !(e.powerPurchase && a.id !== 'mining_infrastructure'); });
        var verified = relevant.filter(function (a) { return !a.stale && a.presence === 'present' && a.condition === 'working' && a.access === 'agreed'; }).length;
        var reported = relevant.filter(function (a) { return !a.stale && a.presence === 'reported' && a.condition !== 'failed' && a.access !== 'denied'; }).length;
        part('infrastructure', 'Usable existing equipment', relevant.length ? (verified + reported * 0.15) / relevant.length : 0,
            verified ? verified + ' relevant component(s) inspected with agreed access.' : 'Historical/shutdown equipment earns no condition or access credit.');
        if (verified) reasons.push(verified + ' equipment package(s) inspected with use agreed.');
        if (e.powerPurchase) reasons.push('Power-purchase scenario: supplier plant funding still needs agreement.');
        var signals = Array.isArray(saved.distress_signals) && saved.distress_signals.length ? saved.distress_signals : c.distressSignals || [];
        var available = signals.some(function (s) { return s && s.type === 'owner_confirmed_available' && D.current(s.date, ctx.now, 180); });
        // A saved refusal is not silently cleared by age or outvoted by distress signals.
        var denied = signals.some(function (s) { return s && ['owner_confirmed_taken', 'owner_confirmed_unavailable'].indexOf(s.type) >= 0; });
        // A generating plant's nameplate is not a surplus-power offer. Waste-energy
        // resources establish a sourcing thesis only; their usable surplus still needs proof.
        var wasteResource = /^(landfill_gas|flare_gas)$/.test(c.energyType || '') || /landfill|other waste biomass|municipal solid waste/i.test(String((c.sourceDetail || {}).technology || ''));
        var sourcing = saved.custom_fields && saved.custom_fields._proton_sourcing_v1;
        var reviewedOpening = !!(sourcing && Array.isArray(sourcing.signals) && sourcing.signals.some(function (s) {
            var last = s && Array.isArray(s.reviews) && s.reviews[s.reviews.length - 1];
            return s && s.status === 'reviewed' && last && last.decision === 'reviewed' && D.current(last.checked_on, ctx.now, 90) &&
                (!s.event_on || s.event_on >= D.today(ctx.now)) && ['flared_surplus', 'idle_generation', 'interim_energy', 'procurement', 'other_energy', 'ppa_expiry'].indexOf(s.play) >= 0;
        }));
        var opening = allocation || available || operating.current || wasteResource || reviewedOpening;
        if (!opening) gaps.unshift('Confirm that the operator has surplus energy to offer; plant capacity alone is not an opportunity.');
        var manual = ctx.manual || saved;
        var direct = !!(manual.contact_name && (manual.contact_phone || manual.contact_email));
        var owner = !!(ctx.operator && ctx.operator.operator || saved.operator || c.operatorId);
        part('closing', 'Ability to reach agreement', available ? 1 : direct ? 0.4 : owner ? 0.2 : 0,
            available ? 'Dated owner availability recorded; signing authority and terms still need agreement.' : direct ? 'Named contact with a phone or email.' : 'Confirm the owner, signing authority and approval process.');
        if (available) reasons.push('Recent owner availability is recorded.');
        part('timing', 'Time to operation', operating.current ? 1 / (1 + Math.max(0, schedule.start) / 3) : 0,
            operating.current ? Math.max(0, schedule.start).toFixed(1) + ' months to operation in the reviewed plan.' : 'No reviewed startup schedule.');
        if (cap.contractedKw !== null && target > cap.contractedKw) blockers.push('Planning size exceeds the documented allocation.');
        if (cap.flowRatingConflict || cap.collectionStatusConflict) blockers.push('Resolve conflicting capacity or collection evidence.');
        if (cashLimit > 0 && cash !== null && cash > cashLimit) blockers.push((complete ? 'Scoped remaining budget' : 'Priced subtotal alone') + ' exceeds the cash ceiling.');
        if (operating.current && r.uptime_pct === 0) blockers.push('Reviewed delivery assumption provides no operating hours.');
        if (schedule && schedule.remaining <= 0) blockers.push('The reviewed usable supply term has ended.');
        if (cmp && cmp.stressDifferenceBtc <= 0) blockers.push('The 24-month +1% difficulty scenario trails buying BTC before terminal asset value.');
        if (denied) blockers.push('Owner availability is recorded as declined.');
        var closed = ['dead', 'closed_won'].indexOf(saved.stage) >= 0;
        var tier = closed || denied ? 5 : blockers.length ? 4 : cash === null || !(target > 0) ? 3 : quoted && allocation && operating.current ? 0 : opening ? 1 : 2;
        var labels = ['Review terms', 'Research fit', 'Confirm surplus', 'Needs sizing / costs', 'Revise the plan', 'Not an open lead'];
        var score = parts.reduce(function (sum, x) { return sum + x.points; }, 0);
        return { tier: tier, label: labels[tier], sortValue: (5 - tier) * 1000 + score, score: score,
            cashUsd: cash, perKw: perKw, targetKw: target, completeBudget: complete, quotedBudget: quoted,
            cashLimitUsd: cashLimit > 0 ? cashLimit : null, allocationConfirmed: allocation, operating: operating,
            comparison: cmp, parts: parts, reasons: reasons, gaps: gaps, blockers: blockers,
            nextAction: blockers[0] || (gaps.filter(function (g) { return !/^Set a cash ceiling/.test(g); })[0]) || 'Review the commercial agreement, approval route and downside assumptions.' };
    }
    function summary(p) {
        return '<div class="priority-summary"><strong>' + esc(p.label) + '</strong><p>' + esc(p.nextAction) + '</p>' +
            '<dl class="dg-facts"><div><dt>Cash still to fund</dt><dd>' + esc(usd(p.cashUsd)) + (p.cashUsd !== null ? p.completeBudget ? ' scoped budget' : ' + unpriced work' : '') + '</dd></div>' +
            '<div><dt>Cash per planning kW</dt><dd>' + esc(usd(p.perKw)) + '</dd></div></dl>' +
            '<p class="dg-note">' + (p.cashLimitUsd === null ? 'No cash ceiling set. ' : 'Cash ceiling: ' + esc(usd(p.cashLimitUsd)) + '. ') + 'Research priority does not establish that a deal is available or profitable.</p>' +
            '<details><summary>Why this priority</summary><ul>' + p.reasons.concat(p.blockers).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul><dl class="dg-facts">' +
            p.parts.map(function (x) { return '<div><dt>' + esc(x.label) + ' · ' + x.weight + '%</dt><dd>' + esc(x.basis) + '</dd></div>'; }).join('') + '</dl><p class="dg-note">Missing evidence receives no positive credit. Incomplete budgets receive limited credit; unknown costs are never treated as zero. Shutdown and distress do not earn a financial advantage. Priority weights are screening choices, not measured closing probabilities.</p></details></div>';
    }
    return { WEIGHTS: WEIGHTS, HORIZON_MONTHS: HORIZON_MONTHS, review: review, comparison: comparison, evaluate: evaluate, summary: summary };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectPriority;
