/* Early screening estimates alongside, never in place of, the evidence-backed budget. */
var ProspectCapital = (function () {
    'use strict';
    var D = typeof ProspectDiligence !== 'undefined' ? ProspectDiligence : require('./prospect-diligence');
    var C = typeof SiteCapex !== 'undefined' ? SiteCapex : require('./site-capex');
    var E = typeof SiteEngine !== 'undefined' ? SiteEngine : require('./site-engine');
    var Q = typeof SiteCapacity !== 'undefined' ? SiteCapacity : require('./site-capacity');
    var RATE_KEYS = { collection: 'collectionPerKw', gas_treatment: 'gasTreatmentPerKw', generation: 'generationPerKw', electrical: 'interconnectionPerKw', civil: 'civilPerKw', mining_infrastructure: 'miningInfraPerKw', permits: 'permittingFlatUsd', commissioning: 'commissioningPerKw' };
    var WORK = { collection: 'Build or extend the collection system', gas_treatment: 'Install treatment and compression', generation: 'Buy and install generation', electrical: 'Install generation-side electrical protection', civil: 'Build engine foundations and access', mining_infrastructure: 'Install mining containers, cooling and distribution', miners: 'Buy mining hardware', permits: 'Engineering and permit work', commissioning: 'Start up and test the installation', reserves: 'Construction contingency' };
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function usd(v) { return v == null ? 'Needs sizing' : '$' + Math.round(v).toLocaleString('en-US'); }
    function kw(v) { return v == null ? 'Not sized' : Math.round(v).toLocaleString('en-US') + ' kW'; }
    function settings(site, candidate) {
        var s = D.state(site), v = s.error ? {} : s.planning || {};
        return { market: v.market || 'new', strategy: v.strategy || (candidate.energyType === 'grid_facility' ? 'power' : 'reuse'), contingency_pct: D.num(v.contingency_pct) == null ? 15 : Number(v.contingency_pct), target_kw: D.num(v.target_kw) };
    }
    function estimate(candidate, site, ctx) {
        var c = candidate || {}, sd = c.sourceDetail || {}; ctx = ctx || {};
        var screen = ctx.screened || Q.usableCapacity(c), p = ctx.profile || D.profile(c, site, Object.assign({}, ctx, { screened: screen }));
        var cfg = settings(site, c), target = p.capacity.targetKw, r = C.ratesFor(cfg.market), inv = p.inventory.map(function (a) {
            return a.id === 'collection' && !a.userRecorded && /^no$/i.test(sd.collectionSystem || '') ? Object.assign({}, a, { presence: 'absent' }) : a;
        });
        var gas = c.energyType === 'landfill_gas' || c.energyType === 'flare_gas', power = cfg.strategy === 'power';
        var out = { targetKw: target, settings: cfg, capacity: p.capacity, inventory: inv, budget: p.budget, lines: [], extras: [], low: null, base: null, high: null, infrastructureUsd: null, minersUsd: null, perKw: null, reuseSavingUsd: null, rebuildUsd: null, ready: false, estimated: !p.budget.complete, rates: r };
        if (p.state.error) { out.reason = p.state.error; return out; }
        if (!(target > 0)) { out.reason = 'Set a positive planning target to estimate a build. Missing or placeholder capacity is not a zero-cost project.'; return out; }
        if (!gas && !power) { out.reason = 'Use the buy-power scenario for this energy source, or record a project-specific budget.'; return out; }
        var fleet = E.evaluate({ nameplate_kw: target, usable_kw: target, purchase_price_usd: 0, power_rate: 0 }, {});
        out.fleet = { model: E.DEFAULT_CONFIG.minerModel, count: fleet.max_miners, unitCostUsd: E.DEFAULT_CONFIG.minerUnitCostUsd };
        var eligible = ['mining_infrastructure', 'miners', 'permits', 'commissioning'];
        if (gas && !power) eligible = eligible.concat(['gas_treatment', 'generation', 'electrical', 'civil']);
        if (c.energyType === 'landfill_gas' && !power) eligible.push('collection');
        var modeled = 0, modeledRebuild = 0;
        inv.forEach(function (a, i) {
            if (a.id === 'reserves') return;
            var quote = p.budget.lines[i], full = null, reuse = 0;
            if (eligible.indexOf(a.id) >= 0) full = a.id === 'miners' ? D.num(fleet.miner_capex_usd) : a.id === 'permits' ? r[RATE_KEYS[a.id]] : r[RATE_KEYS[a.id]] * target;
            var found = a.presence === 'present' || a.presence === 'reported' || a.presence === 'historical';
            // A collection-system "No", gas-destruction filing, or planned generator cannot earn a reuse allowance.
            if (a.id === 'collection' && !a.userRecorded) found = /^(yes|shutdown)$/i.test(sd.collectionSystem || '');
            if (a.id === 'generation' && !a.userRecorded) found = found && D.num(c.existingGenerationKw) > 0;
            if (full !== null && cfg.strategy === 'reuse' && found && !a.stale && a.access !== 'denied' && a.condition !== 'failed' && ['collection', 'gas_treatment', 'generation', 'electrical', 'civil'].indexOf(a.id) >= 0) {
                reuse = a.presence === 'historical' || a.condition === 'rework' ? 0.35 : 0.60;
                var scope = D.num(a.capacity_kw);
                if (a.id === 'generation' && scope === null) scope = D.num(c.existingGenerationKw) === null ? null : c.existingGenerationKw * 0.93;
                if (scope !== null) reuse *= Math.min(1, scope / target);
            }
            var line = { id: a.id, label: a.label, finding: a.finding, presence: a.presence, sourceUrl: a.source_url, work: WORK[a.id] || a.scope, estimated: !quote.known, low: null, base: null, high: null, reuse: reuse > 0, full: full };
            if (quote.known) {
                line.low = quote.included ? 0 : quote.low; line.base = quote.included ? 0 : quote.base; line.high = quote.included ? 0 : quote.high;
                line.work = quote.reason; line.reuse = false;
            } else if (full !== null) {
                line.base = full * (1 - reuse); line.low = line.base * 0.7; line.high = full * 1.4;
                if (reuse) line.work = 'Inspect, adapt and repair reported equipment; allowance assumes ' + Math.round(reuse * 100) + '% of replacement cost can be retained';
                modeled += line.base; modeledRebuild += full;
            } else if (power && ['collection', 'gas_treatment', 'generation', 'electrical', 'civil'].indexOf(a.id) >= 0) {
                line.low = line.base = line.high = 0;
                line.work = 'Energy supplier owns and funds this scope in the buy-power scenario; confirm in the power price';
            } else if (c.energyType === 'flare_gas' && a.id === 'collection') {
                line.low = line.base = line.high = 0; line.work = 'Upstream wellfield is outside this flare-gas purchase scenario; gas tie-in is still to price';
            } else out.extras.push(a.label);
            out.lines.push(line);
        });
        var reserves = p.budget.lines.find(function (a) { return a.id === 'reserves'; });
        var sum = function (key) { return out.lines.reduce(function (n, a) { return n + (a[key] || 0); }, 0); };
        var subtotal = { low: sum('low'), base: sum('base'), high: sum('high') };
        var reserve = { id: 'reserves', label: 'Contingency & startup cash', work: reserves.known ? reserves.reason : cfg.contingency_pct + '% construction contingency; startup operating cash still to price', estimated: !reserves.known, presence: 'unknown', finding: '' };
        ['low', 'base', 'high'].forEach(function (k) { reserve[k] = reserves.known ? reserves.included ? 0 : reserves[k] : subtotal[k] * cfg.contingency_pct / 100; out[k] = subtotal[k] + reserve[k]; });
        if (!reserves.known) out.extras.push('Startup operating cash');
        out.lines.push(reserve);
        var miner = out.lines.find(function (a) { return a.id === 'miners'; });
        out.minersUsd = miner.base; out.infrastructureUsd = out.lines.filter(function (a) { return a.id !== 'miners' && a.id !== 'reserves'; }).reduce(function (n, a) { return n + (a.base || 0); }, 0);
        out.reuseSavingUsd = (modeledRebuild - modeled) * (1 + (reserves.known ? 0 : cfg.contingency_pct / 100));
        out.rebuildUsd = out.base + out.reuseSavingUsd;
        out.perKw = out.base / target; out.ready = true;
        return out;
    }
    function summary(e, compact) {
        if (!e.ready) return '<section class="pc-summary"><h4>Build cost estimate</h4><p>' + esc(e.reason) + '</p></section>';
        var html = '<section class="pc-summary"><div class="pc-heading"><h4>' + (e.estimated ? 'Estimated cash still to build' : 'Recorded cash still to spend') + '</h4><span>' + esc(kw(e.targetKw)) + ' plan &middot; USD</span></div><div class="pc-stats"><div><span>' + (e.estimated ? 'Build + miners + contingency' : 'Remaining recorded budget') + '</span><strong>' + usd(e.base) + '</strong><small>' + usd(e.low) + ' &ndash; ' + usd(e.high) + '</small></div><div><span>Infrastructure & other priced work</span><strong>' + usd(e.infrastructureUsd) + '</strong><small>Mining hardware: ' + usd(e.minersUsd) + '</small></div><div><span>Estimated build cost / kW</span><strong>' + usd(e.perKw) + '</strong><small>' + (e.settings.strategy === 'power' ? 'Buy power; supplier funds generation' : e.settings.strategy === 'rebuild' ? 'New build; no assumed reuse' : 'Reuse reported equipment where feasible') + '</small></div></div>';
        html += '<p class="pc-basis">Screened potential: ' + esc(kw(e.capacity.screenedKw)) + '. Power allocated to Proton: ' + (e.capacity.contractedKw == null ? 'not confirmed' : esc(kw(e.capacity.contractedKw))) + '.</p>';
        if (e.capacity.contractedKw != null && e.targetKw > e.capacity.contractedKw) html += '<p class="pc-extras"><strong>Planning size exceeds the documented power allocation.</strong> Reduce the target or confirm additional power.</p>';
        if (e.capacity.flowRatingConflict) html += '<p class="pc-extras"><strong>Capacity needs review:</strong> reported gas flow exceeds the published collection-system rating. Reconcile the equipment scope and measurements before relying on this size.</p>';
        if (e.extras.length) html += '<p class="pc-extras"><strong>Add to this estimate:</strong> ' + esc(e.extras.join('; ')) + '. These costs are unpriced, not zero.</p>';
        if (e.estimated) html += '<p class="pc-basis">Screening estimate using Proton\'s existing internal rate card and miner assumptions, not current supplier quotes. ' + (e.reuseSavingUsd > 0 ? 'Rebuilding the same priced scope: ' + usd(e.rebuildUsd) + '. The reuse case depends on inspection, capacity and agreed access; an equipment purchase or lease price must be added.' : 'Unknown equipment is budgeted as new within the modeled scope.') + '</p>';
        if (compact) {
            var assets = e.inventory.filter(function (a) { return ['reported', 'present', 'historical', 'planned'].indexOf(a.presence) >= 0; });
            html += '<div class="pc-existing"><strong>Reported equipment & planned work</strong>' + (assets.length ? '<ul>' + assets.slice(0, 4).map(function (a) { return '<li>' + esc(a.label) + ': ' + esc(a.finding) + '</li>'; }).join('') + '</ul>' : '<p>No installed equipment is established yet. The estimate includes a build allowance.</p>') + '<button type="button" data-open-panel="capital">See existing assets & remaining work &rarr;</button></div>';
        }
        return html + '</section>';
    }
    function breakdown(e) {
        if (!e.ready) return '';
        return '<h4>What is built, and what you still fund</h4><div class="pc-work-list">' + e.lines.filter(function (a) { return a.base !== null; }).map(function (a) {
            var status = { reported: 'Reported on site', present: 'Inspected on site', historical: 'Historical / shutdown', planned: 'Planned; not installed', absent: 'Reported absent', unknown: 'Not established' }[a.presence] || 'Not established';
            var knownFinding = a.finding && a.presence !== 'unknown';
            return '<article class="pc-work"><div><h5>' + esc(a.label) + '</h5><span class="dg-tag">' + esc(status) + '</span>' + (knownFinding ? '<p><strong>Source finding:</strong> ' + esc(a.finding) + '</p>' : '') + '<p><strong>Remaining work:</strong> ' + esc(a.work) + '</p>' + (a.finding ? '<details><summary>Equipment evidence & source</summary>' + (!knownFinding ? '<p>' + esc(a.finding) + '</p>' : '') + (D.safeUrl(a.sourceUrl) ? '<a target="_blank" rel="noopener noreferrer" href="' + esc(a.sourceUrl) + '">View source</a>' : '<p>No public link recorded.</p>') + '</details>' : '') + '</div><div class="pc-cost"><strong>' + usd(a.base) + '</strong><small>' + (a.estimated ? 'Planning allowance' : 'Recorded remaining cost') + '</small></div></article>';
        }).join('') + '</div>';
    }
    function form(e) {
        function option(v, label, selected) { return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + label + '</option>'; }
        return '<details class="dg-editor"><summary>Adjust the build estimate</summary><p class="dg-note">This saves a planning scenario for this site. Documented power rights and supplier quotes stay in the evidence ledger below.</p><form data-dg-form="planning"><div class="dg-fields"><label>Planning size (net kW)<input name="target_kw" type="number" min="1" step="any" placeholder="Use screened potential" value="' + (e.settings.target_kw || '') + '"></label><label>Build approach<select name="strategy">' + option('reuse', 'Reuse reported equipment if suitable', e.settings.strategy) + option('rebuild', 'Build without assuming reuse', e.settings.strategy) + option('power', 'Buy power; supplier funds generation', e.settings.strategy) + '</select></label><label>Equipment market<select name="market">' + option('new', 'New equipment', e.settings.market) + option('used', 'Used equipment', e.settings.market) + '</select></label><label>Construction contingency (%)<input name="contingency_pct" type="number" min="0" max="100" step="any" value="' + e.settings.contingency_pct + '"></label></div><button type="submit">Save estimate assumptions</button></form><details><summary>Rate card and estimate basis</summary><p class="dg-note">Internal planning inputs, in USD. Not an inflation-adjusted cost study or a current quote. Installed rates exclude separately listed commissioning. Mining hardware uses ' + esc(e.fleet ? e.fleet.model : E.DEFAULT_CONFIG.minerModel) + ' at ' + usd(E.DEFAULT_CONFIG.minerUnitCostUsd) + ' each; freight, taxes and spares still need pricing. New-scope range: 70% to 140% of base. Reported reuse retains 60% of replacement cost (35% for shutdown / rework), limited by known equipment size; the high case allows full replacement. Unknown ancillary equipment receives no reuse credit.</p><dl class="dg-facts">' + Object.keys(RATE_KEYS).map(function (id) { var title = D.COMPONENTS.find(function (a) { return a[0] === id; })[1]; return '<div><dt>' + esc(title) + '</dt><dd>' + usd(e.rates[RATE_KEYS[id]]) + (id === 'permits' ? ' fixed' : ' / kW') + '</dd></div>'; }).join('') + '</dl></details></details>';
    }
    return { estimate: estimate, settings: settings, summary: summary, breakdown: breakdown, form: form };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectCapital;
