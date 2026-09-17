/* Evidence for acquiring energy. Readiness is a checklist score, never a probability of close.
   Source catalogue estimates remain separate from energy the counterparty can commit. */
var DealQualification = (function () {
    'use strict';
    var CONDITIONS = [
        { key: 'rights', label: 'Gas / energy rights confirmed' },
        { key: 'surface', label: 'Site access and surface agreement' },
        { key: 'approvals', label: 'Required owner / municipal approvals' },
        { key: 'permits', label: 'Permit path reviewed' },
        { key: 'engineering', label: 'Gas quality, generation and connection reviewed' },
        { key: 'commercial', label: 'Commercial terms and responsibilities agreed' }
    ];
    function number(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }
    function text(v) { return v === null || v === undefined ? '' : String(v).trim(); }
    function day(v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
        var d = new Date(v + 'T00:00:00Z');
        return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }
    function evidence(ref, date, now, maxDays) {
        if (!text(ref) || !day(date)) return false;
        var age = (now - Date.parse(date + 'T00:00:00Z')) / 86400000;
        return age >= 0 && age <= maxDays;
    }
    function evaluate(site, nowMs) {
        site = site || {};
        var a = site.acquisition || {}, now = typeof nowMs === 'number' ? nowMs : Date.now();
        var today = new Date(now).toISOString().slice(0, 10);
        var available = number(a.available_kw), contracted = number(a.contracted_kw), checks = [];
        function check(key, label, ok, action, weight) { checks.push({ key: key, label: label, ok: !!ok, action: action, weight: weight }); }
        check('authority', 'Decision and rights owners identified', text(a.rights_owner) && text(a.surface_owner) && text(a.decision_maker),
            'Identify the gas or energy rights holder, surface owner and person authorized to approve a deal.', 15);
        check('availability', 'Current written confirmation of uncommitted energy', a.rights_status === 'available' && evidence(a.rights_evidence, a.rights_verified_on, now, 180),
            'Request written confirmation of available rights, existing offtake obligations and expiry dates.', 20);
        check('capacity', 'Net available capacity supported by current evidence', available > 0 && evidence(a.capacity_evidence, a.capacity_verified_on, now, 180),
            'Obtain flow / methane or meter records, parasitic loads and existing commitments; confirm net kW available to mining.', 20);
        check('economics', 'Delivered energy terms recorded', number(a.delivered_rate_usd_kwh) !== null && number(a.delivered_rate_usd_kwh) >= 0 &&
            evidence(a.quote_evidence, a.quote_verified_on, now, 90) && text(a.cost_responsibility),
            'Confirm a delivered power quote and who pays for generation, gas treatment, O&M and site work.', 15);
        var conditions = a.conditions || {};
        CONDITIONS.forEach(function(c) {
            var item = conditions[c.key] || {};
            check(c.key + '_condition', c.label, item.status === 'complete' && text(item.evidence) && day(item.completed_on) && item.completed_on <= today,
                'Resolve: ' + c.label.toLowerCase() + (item.owner ? ' with ' + item.owner : '') + '.', 3);
        });
        check('agreement', 'Executed agreement and contracted capacity', text(a.agreement_ref) && day(a.signed_on) && a.signed_on <= today &&
            day(a.term_end) && a.term_end > today && contracted > 0 && available > 0 && contracted <= available,
            'Register the executed agreement, signing date, term end and contracted kW within verified available capacity.', 12);
        var score = checks.reduce(function(n, c) { return n + (c.ok ? c.weight : 0); }, 0);
        var blockers = checks.filter(function(c) { return !c.ok; });
        return { score: score, checks: checks, blockers: blockers, canClose: blockers.length === 0,
            nextAction: blockers.length ? blockers[0].action : 'Confirm mobilization dates and transfer the agreement into project delivery.',
            availableKw: checks[2].ok && checks[1].ok ? available : null,
            contractedKw: blockers.length ? null : contracted,
            sourceEstimateKw: number(site.usable_kw),
            evidencePolicy: 'Rights and capacity: 180 days; quotes: 90 days. This is an internal review policy.' };
    }
    function validate(a) {
        a = a || {};
        var errors = [];
        ['available_kw', 'contracted_kw', 'delivered_rate_usd_kwh', 'diligence_spend_usd'].forEach(function(k) {
            if (text(a[k]) && (number(a[k]) === null || number(a[k]) < 0)) errors.push(k.replace(/_/g, ' ') + ' must be a non-negative number.');
        });
        ['rights_verified_on', 'capacity_verified_on', 'quote_verified_on', 'signed_on', 'term_end', 'offtake_expiry', 'next_review', 'diligence_spend_as_of'].forEach(function(k) {
            if (text(a[k]) && !day(a[k])) errors.push(k.replace(/_/g, ' ') + ' must be a valid date.');
        });
        if (number(a.contracted_kw) > number(a.available_kw) && number(a.available_kw) !== null) errors.push('Contracted capacity cannot exceed net available capacity.');
        if (day(a.signed_on) && day(a.term_end) && a.term_end <= a.signed_on) errors.push('Agreement end must follow its signing date.');
        return { ok: errors.length === 0, errors: errors };
    }
    // Comparable monthly offer economics in USD. These are user assumptions, not offers sent.
    function compareOffers(input) {
        input = input || {};
        var names = ['kw', 'uptime_pct', 'revenue_usd', 'other_cost_usd', 'fixed_rate', 'gas_rate', 'generation_cost_usd', 'revenue_share_pct', 'minimum_usd', 'rent_usd'];
        if (names.some(function(k) { return number(input[k]) === null || number(input[k]) < 0; }) ||
            input.kw <= 0 || input.uptime_pct <= 0 || input.uptime_pct > 100 || input.revenue_share_pct > 100) return null;
        var kwh = input.kw * 720 * input.uptime_pct / 100;
        function offer(name, payment, extra, detail) {
            var total = payment + extra + Number(input.other_cost_usd);
            return { name: name, ownerMonthlyUsd: payment, ownerAnnualUsd: payment * 12,
                energyCostUsdKwh: (payment + extra) / kwh, operatorNetMonthlyUsd: input.revenue_usd - total,
                detail: detail };
        }
        return [
            offer('Delivered power purchase', kwh * input.fixed_rate + Number(input.rent_usd), 0, 'Assumes the owner funds generation and treatment; fixed rent added.'),
            offer('Gas lease + our generation', kwh * input.gas_rate + Number(input.rent_usd), Number(input.generation_cost_usd), 'Fuel-equivalent rate plus monthly generation / treatment / capital recovery allowance.'),
            offer('Revenue share with minimum', Math.max(input.revenue_usd * input.revenue_share_pct / 100, Number(input.minimum_usd)) + Number(input.rent_usd), Number(input.generation_cost_usd), 'Share of gross mining revenue, with a monthly minimum; generation allowance added.')
        ];
    }
    return { CONDITIONS: CONDITIONS, evaluate: evaluate, validate: validate, compareOffers: compareOffers, validDay: day };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DealQualification;
