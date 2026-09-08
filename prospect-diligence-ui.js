/* Four prospect diligence sections, backed by a component-level capital ledger. */
var ProspectDiligenceUi = (function () {
    'use strict';
    var D = typeof ProspectDiligence !== 'undefined' ? ProspectDiligence : require('./prospect-diligence');
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function usd(v) { return v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 'Unpriced' : (Number(v) < 0 ? '-$' : '$') + Math.round(Math.abs(Number(v))).toLocaleString('en-US'); }
    function kw(v) { return D.num(v) === null ? 'Not established' : Math.round(v).toLocaleString('en-US') + ' kW'; }
    function label(list, k) { var found = list.find(function (x) { return x[0] === k; }); return found ? found[1] : str(k); }
    function str(v) { return v == null ? '' : String(v); }
    function link(v, name) { return D.safeUrl(v) ? '<a href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>' : esc(name); }
    function row(k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>'; }
    function stat(k, v, detail) { return '<div class="dg-stat"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong><small>' + esc(detail || '') + '</small></div>'; }
    function select(name, title, opts) { return '<label>' + esc(title) + '<select name="' + name + '">' + opts.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></label>'; }
    function input(name, title, type) { return '<label>' + esc(title) + '<input name="' + name + '" type="' + (type || 'text') + '"' + (type === 'number' ? ' min="0" step="any"' : '') + '></label>'; }
    function proofFields() { return '<div class="dg-fields">' + input('source_url', 'Source link, if public', 'url') + input('checked_on', 'Date checked', 'date') + input('reviewer', 'Checked by') + '</div><label>Evidence / document reference and scope<textarea name="evidence_note" rows="3" required></textarea></label>'; }
    function section(title, content) { return '<section class="dg-section src-detail-wide" data-diligence-section><h3>' + esc(title) + '</h3>' + content + '</section>'; }
    function priorityFor(p, ctx) {
        if (typeof ProspectPriority === 'undefined') return null;
        return ctx.priority || ProspectPriority.evaluate(ctx.candidate || {}, { estimate: ProspectCapital.estimate(ctx.candidate || {}, ctx.saved, { profile: p, screened: ctx.screened }), saved: ctx.saved, now: ctx.now,
            market: ctx.metrics && ctx.metrics.market, config: ctx.metrics && ctx.metrics.config, availability: ctx.metrics && ctx.metrics.availability });
    }
    function operatingEditor() {
        return '<details class="dg-editor"><summary>Record operating costs and startup timing</summary><p class="dg-note">Use one consistent USD operating scope for this planning size. The delivered rate must include fuel, generation operation, auxiliary energy and variable charges. Other monthly costs cover labor, maintenance, lease / royalties, insurance and recurring costs outside that rate. Tax and financing are excluded from the comparison. Leave unknown amounts blank.</p><form data-dg-form="economics"><div class="dg-fields">' +
            select('cost_basis', 'Cost basis', [['allowance', 'Unconfirmed planning costs'], ['quote', 'Current scoped offer / cost review']]) +
            input('capacity_kw', 'Operating scope (net mining kW)', 'number') + input('all_in_power_usd_kwh', 'All-in energy cost (USD / mining kWh)', 'number') + input('minimum_monthly_power_usd', 'Minimum monthly energy payment (USD; 0 if none)', 'number') +
            input('fixed_monthly_usd', 'Other monthly operating costs (USD)', 'number') + input('uptime_pct', 'Expected full-load operating time (%)', 'number') + input('pool_fee_pct', 'Pool fee (%)', 'number') +
            input('term_months', 'Usable supply term from startup (months)', 'number') + input('months_to_operation', 'Months from review to operation', 'number') + input('quote_expires', 'Operating offer / review expires', 'date') +
            select('operating_scope_complete', 'All operating inputs and exclusions reviewed', [['no', 'Still incomplete'], ['yes', 'Complete in the cited scope']]) + '</div>' + proofFields() + '<button type="submit">Save operating review</button></form></details>';
    }
    function capacitySection(p, ctx) {
        var c = p.capacity, b = p.budget, screen = ctx.screened || {};
        var capital = typeof ProspectCapital !== 'undefined' ? ProspectCapital : typeof module !== 'undefined' && module.exports ? require('./prospect-capital') : null;
        var estimate = capital ? capital.estimate(ctx.candidate, ctx.saved, Object.assign({}, ctx, { profile: p })) : null;
        var html = '<p class="dg-intro">What is reported on site, what Proton can use, and the cash still required.</p><p class="dg-note">Source release / reporting period: <strong>' + esc(p.source.reportingPeriod || 'not established') + '</strong>' + (c.gasCollectedYear ? '; collected-gas measurements: <strong>' + esc(c.gasCollectedYear) + '</strong>' : '') + '. Current equipment condition and availability require owner evidence.</p><div class="dg-stats">' +
            stat('Reported electrical equipment', kw(c.installedReportedKw), 'Historical source capacity; current condition and access need verification.') +
            stat((ctx.candidate || {}).source === 'eia-facility' ? 'Nameplate basis for screening' : 'Screened net potential', kw(c.screenedKw), (ctx.candidate || {}).source === 'eia-facility' ? 'Historic net capacity factor is applied in economics. Net deliverable power needs owner verification.' : 'A modelled envelope, before contractual allocation and site-specific design.') +
            stat('Allocated to Proton', kw(c.contractedKw), c.allocationStale ? 'Saved allocation needs a current review.' : 'Requires a current documented allocation at the mining meter.') + '</div>' +
            '<div class="dg-budget-status ' + (b.complete ? 'is-complete' : '') + '"><strong>' + (b.complete ? 'All budget lines addressed' : 'Budget incomplete: ' + b.missing.length + ' lines unresolved') + '</strong><span>' + b.priced.length + ' of ' + D.COMPONENTS.length + ' lines priced, included in a package, funded by a partner or excluded with evidence.</span></div>' +
            '<div class="dg-stats">' + stat(b.complete ? 'Remaining Proton budget · base' : 'Priced subtotal still to spend', usd(b.base), b.complete ? 'USD; includes any recorded planning allowances.' : 'Unpriced work must be added. This subtotal is not the project total.') +
            stat('Recorded low–high range', b.low === null ? 'Unpriced' : usd(b.low) + ' – ' + usd(b.high), b.allowanceCount ? b.allowanceCount + ' budget lines use planning allowances.' : 'Only recorded costs; no assumed discount for old equipment.') +
            stat('Proton payments recorded', usd(b.paid), 'Paid-to-date entries, separate from any prior owner’s spending.') + '</div>';
        if (estimate) html = capital.summary(estimate, false) + capital.form(estimate) + capital.breakdown(estimate) + '<details class="pc-ledger"><summary>Reviewed budget & equipment evidence (' + b.priced.length + ' of ' + D.COMPONENTS.length + ' lines addressed)</summary>' + html;
        if (c.targetKw !== null) html += '<p class="dg-note">Planning target: <strong>' + esc(kw(c.targetKw)) + '</strong>. ' + (c.contractedKw === null ? 'No confirmed Proton allocation is recorded.' : c.targetKw > c.contractedKw ? 'This exceeds the documented allocation.' : 'Within the recorded allocation; confirm detailed engineering.') + '</p>';
        if (!c.hasReviewedTarget && c.legacySavedKw !== null && c.legacySavedKw !== c.screenedKw) html += '<p class="dg-note">Previously saved usable capacity: <strong>' + esc(kw(c.legacySavedKw)) + '</strong>. That value is retained in the saved record. Review its source and enter the current planning target below.</p>';
        if (c.placeholder) html += '<p class="dg-warning">The old catalogue used a nominal 100 kW placeholder here. It is excluded from sizing and economics.</p>';
        if (c.flowRatingConflict) html += '<p class="dg-warning">The reported collected flow is about ' + Math.round(c.gasCollectedMmscfd * 1000000 / 1440).toLocaleString() + ' scfm, above the recorded ' + esc(c.gccsCapacityCfm) + ' cfm collection-system rating. Reconcile the dates, units and equipment scope before sizing the project.</p>';
        html += '<details class="dg-editor"><summary>Set the planning target / record allocated capacity</summary><form data-dg-form="capacity"><div class="dg-fields">' + input('target_kw', 'Planning target at mining meter (net kW)', 'number') + input('contracted_kw', 'Documented allocation to Proton (net kW)', 'number') +
            select('rights_confirmed', 'Agreement allocates this net power to Proton', [['no', 'Not confirmed'], ['yes', 'Confirmed in cited agreement']]) + input('contract_expires', 'Agreement expiry, if applicable', 'date') + '</div>' + proofFields() + '<button type="submit">Save capacity evidence</button></form></details>';
        html += '<h4>Infrastructure and remaining work</h4><p class="dg-note">A source listing does not prove equipment still works or is included in a deal. Check every package’s boundaries to avoid counting the same work twice.</p><div class="dg-table-wrap"><table class="dg-assets"><thead><tr><th>Component</th><th>What is established</th><th>Use and funding</th><th>Proton remaining · base</th><th><span class="dg-sr">Edit</span></th></tr></thead><tbody>';
        p.inventory.forEach(function (a, i) {
            var cost = b.lines[i];
            html += '<tr><th scope="row">' + esc(a.label) + '<details><summary>Scope and source</summary><p>' + esc(a.scope) + '</p><p>' + esc(a.finding) + '</p><p>' + link(a.source_url, 'Source') + ' · ' + esc(a.reportingPeriod || 'date not recorded') + '</p></details></th>' +
                '<td><span class="dg-tag">' + esc(label(D.PRESENCE, a.presence)) + '</span>' + (a.stale ? '<small>Review out of date</small>' : '') + '<small>' + esc(a.userRecorded ? a.finding : a.finding) + '</small></td>' +
                '<td>' + esc(label(D.CONDITIONS, a.condition)) + '<small>' + esc(label(D.ACCESS, a.access)) + '</small><small>' + esc(label(D.PAYERS, a.payer || 'unknown')) + '</small></td>' +
                '<td><strong>' + (cost.included && cost.known ? 'In package' : cost.known ? esc(usd(cost.base)) : 'Unpriced') + '</strong><small>' + esc(cost.reason) + '</small></td>' +
                '<td><button type="button" data-dg-edit="' + esc(a.id) + '">Record</button></td></tr>';
        });
        html += '</tbody></table></div><details class="dg-editor" data-dg-asset-editor><summary>Record equipment, a quote or a funding agreement</summary><form data-dg-form="asset">' +
            select('component', 'Component', D.COMPONENTS.map(function (x) { return [x[0], x[1]]; })) + '<div class="dg-fields">' + select('presence', 'Evidence of equipment', D.PRESENCE) + select('condition', 'Condition for this design', D.CONDITIONS) + select('access', 'Proton’s use rights', D.ACCESS) + select('action', 'Remaining work', D.ACTIONS) + select('payer', 'Who funds the work', D.PAYERS) + input('proton_share_pct', 'Proton share for shared funding (%)', 'number') + input('capacity_kw', 'Quote / reusable scope (net kW served)', 'number') + '</div>' +
            '<details><summary>Cost, payments and package scope</summary><p class="dg-note">Enter total cost before subtracting payments. All amounts are USD. For a fixed quote, repeat the same cost in low, base and high. Convert other currencies before entry and record the exchange-rate source.</p><div class="dg-fields">' +
            select('cost_basis', 'Cost basis', [['allowance', 'Planning allowance'], ['quote', 'Supplier / contractor quote']]) + input('low_usd', 'Total cost · low (USD)', 'number') + input('base_usd', 'Total cost · base (USD)', 'number') + input('high_usd', 'Total cost · high (USD)', 'number') + input('paid_usd', 'Already paid by Proton (USD)', 'number') + input('quote_expires', 'Quote expires', 'date') + select('included_in', 'Covered by this budget line', [['', 'No covering package']].concat(D.COMPONENTS.map(function (x) { return [x[0], x[1]]; }))) + '</div></details>' + proofFields() + '<button type="submit">Save infrastructure & cost</button></form></details>';
        html += '<details class="dg-reference"><summary>Engineering assumptions and dated cost reference</summary><dl class="dg-facts">' + row('Net screening calculation', esc(screen.basis || 'No defensible capacity calculation available.')) + row('Auxiliary load assumption', esc(screen.parasiticPct == null ? 'Not recorded' : screen.parasiticPct + '%')) + '</dl>';
        if (screen.assumptions) html += '<p>Gas composition: <strong>' + esc(screen.assumptions.methanePct) + '% methane</strong> (' + esc(screen.assumptions.methaneBasis) + '). ' + link(screen.sourceUrl, 'EPA standard-engine assumptions') + ': 1,012 Btu/ft³ methane, 11,250 Btu/kWh gross and 7% auxiliary load. Current gas analysis and a selected engine replace the screening inputs.</p>';
        if (p.benchmark) html += p.benchmark.applicable ? '<p><strong>' + esc(usd(p.benchmark.usd2013)) + ' in 2013 USD</strong> for the standard-engine project reference at this planning size. ' + esc(p.benchmark.note) + ' ' + link(p.benchmark.source, 'EPA cost basis, p.33') + '</p><p>No automatic inflation factor or resale discount is applied. This reference is excluded from the quoted budget above.</p>' : '<p>' + esc(p.benchmark.note) + '</p>';
        return section('Capacity & capital', html + '</details>' + (estimate ? '</details>' : '') + operatingEditor());
    }
    function scoresSection(p, ctx) {
        var priority = priorityFor(p, ctx);
        var opp = ctx.opportunity || {}, acq = ctx.acquirability || {}, html = '<p class="dg-intro">Use scores to prioritize research. They are internal heuristics, not probabilities of securing gas or closing a deal.</p><div class="dg-stats">' +
            stat('Opportunity screening', opp.score == null ? 'Not scored' : opp.score + ' / 100', (opp.coverage == null ? '' : opp.coverage + '% of model inputs covered. ') + 'Unknown evidence remains unknown.') +
            stat('Acquisition signals', acq.score == null ? 'Not established' : acq.score + ' / 100', 'Historic shutdowns and reported changes are leads to investigate.') +
            stat('Confirmed power allocation', kw(p.capacity.contractedKw), 'A project status or public job title cannot establish availability.') + '</div><h4>What would make this deal actionable</h4><ol class="dg-actions">' + p.nextActions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>';
        html += '<details><summary>Score inputs and weighting</summary><dl class="dg-facts">';
        (opp.breakdown || []).filter(function (b) { return b.weight; }).forEach(function (b) { html += row(b.label + ' · ' + b.weight + '%', (b.value == null ? 'Not measured' : Math.round(b.value) + '/100') + '<small>' + esc(b.detail) + '</small>'); });
        (acq.breakdown || []).forEach(function (b) { html += row(str(b.type).replace(/_/g, ' '), (b.value == null ? 'Not recorded' : esc(b.value) + '/100') + '<small>' + esc(b.detail) + '</small>'); });
        return section('Why this site', (priority ? ProspectPriority.summary(priority) : '') + '<details><summary>Opportunity and acquisition signals</summary>' + html + '</dl></details><p class="dg-note">A shutdown does not prove a contract expired. An operating plant does not prove spare capacity. Procurement, gas rights and approval authority require their own evidence.</p></details>');
    }
    function economicsSection(p, ctx) {
        var m = ctx.metrics || {}, av = m.availability || {}, config = m.config || {}, market = m.market || {}, saved = ctx.saved || {};
        var hasQuote = D.num(saved.quoted_rate) !== null && !!saved.quoted_rate_units, fuelOnly = hasQuote && saved.quoted_rate_units !== 'usd_kwh';
        var omKnown = D.num(saved.om_hourly_rate) !== null, cap = p.capacity, budget = p.budget;
        var ready = budget.complete && budget.allowanceCount === 0 && cap.contractedKw !== null && cap.targetKw > 0 && cap.targetKw <= cap.contractedKw && hasQuote && omKnown;
        var payback = ready && m.monthly_net > 0 ? (budget.base + budget.paid) / m.monthly_net : null;
        var html = '<p class="dg-intro">Scenario economics at the displayed mining size. Historical generation and gas flow do not guarantee future delivery.</p><div class="dg-stats">' +
            stat('Energy utilization assumption', av.dutyPct == null ? 'Unknown' : av.dutyPct + '%', av.basis === 'measured' ? 'Historical net generation / nameplate energy; not hours of operation.' : 'Source or technology assumption; site delivery remains unverified.') +
            stat('Power / fuel component', D.num(m.power_rate_usd) === null ? 'Not priced' : '$' + Number(m.power_rate_usd).toFixed(4) + '/kWh', hasQuote ? fuelOnly ? 'Fuel conversion only; treatment, engine costs and delivery charges are additional.' : 'Saved delivered-power quote; confirm inclusions.' : 'Global scenario assumption; not a site quote.') +
            stat('Quoted-budget payback', payback === null ? 'Not established' : payback.toFixed(1) + ' months', ready ? 'Static operating scenario; no construction delay or future difficulty/price changes.' : 'Requires a complete quote ledger, allocated power, a power quote and O&M costs.') + '</div>';
        html += '<dl class="dg-facts">' + row('Historical utilization basis', esc(av.note || 'No site-specific operating history established.')) +
            row('Modeled monthly BTC', m.monthly_btc == null ? 'Needs market data' : Number(m.monthly_btc).toFixed(4)) + row('Modeled monthly revenue', esc(usd(m.monthly_revenue))) +
            row('Modeled monthly power / fuel bill', esc(usd(m.monthly_power_usd))) + row('Recorded O&M allowance', omKnown ? esc(usd(m.monthly_om_usd)) : 'Not recorded; the displayed margin is incomplete') +
            row('Margin after modeled costs', esc(usd(m.monthly_net)) + '<small>Before unrecorded O&M, lease/royalty, insurance, tax, financing, downtime and equipment replacement costs.</small>') +
            row('BTC price input', esc(usd(market.btcPriceUsd))) + row('Network hashrate input', market.networkHashratePh == null ? 'Unknown' : esc(Number(market.networkHashratePh).toLocaleString()) + ' PH/s') +
            row('Mining equipment input', esc(config.minerModel || 'Not recorded') + (config.minerTh ? ' · ' + esc(config.minerTh) + ' TH/s' : '')) + row('Miner unit cost input', esc(usd(config.minerUnitCostUsd))) + '</dl>';
        html += '<p class="dg-note">Market values above are the app’s current scenario inputs; refresh market data before using them. Capacity factor represents energy produced over a period, not the fraction of hours online and not a guaranteed floor or ceiling.</p>';
        var priority = priorityFor(p, ctx), comparison = priority && priority.comparison;
        var publicScenario = html, operating = priority && priority.operating, recorded = operating && operating.value || {};
        html = '<p class="dg-intro">Use the reviewed operating scope for the current planning phase. Missing costs remain unpriced.</p>';
        if (Object.keys(recorded).length) html += '<p><strong>' + (operating.current ? 'Current operating scope' : 'Operating review still needed') + '</strong> · ' + esc(operating.reason) + '</p><dl class="dg-facts">' +
            row('Operating scope', kw(D.num(recorded.capacity_kw))) + row('All-in energy cost', D.num(recorded.all_in_power_usd_kwh) === null ? 'Unpriced' : '$' + Number(recorded.all_in_power_usd_kwh).toFixed(4) + ' / mining kWh') +
            row('Minimum monthly energy payment', usd(D.num(recorded.minimum_monthly_power_usd))) + row('Other monthly operating costs', usd(D.num(recorded.fixed_monthly_usd))) +
            row('Full-load operating time', D.num(recorded.uptime_pct) === null ? 'Unknown' : esc(recorded.uptime_pct) + '%') +
            row('Pool fee', D.num(recorded.pool_fee_pct) === null ? 'Unknown' : esc(recorded.pool_fee_pct) + '%') +
            row('Supply term from startup', D.num(recorded.term_months) === null ? 'Unknown' : esc(recorded.term_months) + ' months') +
            row('Startup schedule', D.num(recorded.months_to_operation) === null ? 'Unknown' : esc(recorded.months_to_operation) + ' months from review on ' + esc(recorded.checked_on)) + '</dl>';
        else html += '<p class="dg-note">Record delivered energy, minimum payments, other operating costs and timing in Capacity &amp; capital.</p>';
        html += '<details><summary>Other scenario inputs</summary>' + publicScenario + '</details>';
        html += '<h4>Mining versus buying BTC</h4>' + (comparison ? '<dl class="dg-facts">' +
            row('BTC bought with the same initial capital', comparison.buyBtc.toFixed(3)) + row('Mining net BTC equivalent · flat difficulty', comparison.flatNetBtc.toFixed(3)) +
            row('Mining net BTC equivalent · difficulty +1% monthly', comparison.stressNetBtc.toFixed(3)) + '</dl><p class="dg-note">' + esc(comparison.note) + '</p>' +
            (comparison.operatingShortfallUsd > 0 ? '<p class="dg-warning">Operating shortfall: ' + esc(usd(comparison.operatingShortfallUsd)) + '. This cash requirement is deducted from mining in the comparison; it is not free outside funding.</p>' : '') :
            '<p class="dg-note">Needs a complete quoted capital budget, documented allocation, a current complete operating review and market data. Record operating costs and timing in Capacity &amp; capital. Unpriced costs do not become zero.</p>');
        return section('Availability & economics', html);
    }
    function evidenceSection(p, ctx) {
        var c = ctx.candidate || {}, sd = c.sourceDetail || {}, src = p.source, cap = p.capacity;
        var html = '<p class="dg-intro">Published observations, model assumptions and owner evidence stay separate.</p><dl class="dg-facts">' +
            row('Dataset', esc(src.dataset)) + row('Source reporting period / release', esc(src.reportingPeriod || 'Not established')) + row('Local import / generation date', esc(src.importedOn || 'Not recorded') + '<small>Importing a file does not refresh the observations inside it.</small>') +
            row('Original source', src.url ? link(src.url, 'Open source') : 'Not recorded') + row('Site / project identifiers', esc([c.id, sd.lfid ? 'LMOP landfill ' + sd.lfid : '', sd.ghgrpId ? 'GHGRP ' + sd.ghgrpId : '', sd.plantCode ? 'EIA plant ' + sd.plantCode : ''].filter(Boolean).join(' · '))) +
            row('Reported project status', esc(sd.projectStatus || sd.statusLabel || sd.status || 'Not recorded')) + row('Technology', esc(sd.projectType || sd.technology || sd.primeMover || 'Not recorded')) +
            row('Reported gas collected', cap.gasCollectedMmscfd == null ? 'Not reported' : esc(cap.gasCollectedMmscfd) + ' million standard ft³/day · ' + esc(cap.gasCollectedYear || 'measurement year unknown')) +
            row('Reported gas flared', cap.gasFlaredMmscfd == null ? 'Not reported' : esc(cap.gasFlaredMmscfd) + ' million standard ft³/day · ' + esc(cap.gasFlaredYear || 'measurement year unknown')) +
            row('Reported methane concentration', cap.methanePct == null ? 'Not reported; model default is explicit in Capacity & capital' : esc(cap.methanePct) + '% · sample date not published') +
            row('Collection-system rating', cap.gccsCapacityCfm == null ? 'Not reported' : esc(cap.gccsCapacityCfm) + ' cfm · rating date not published') +
            row('Reported well / flare inventory', (D.num(sd.wellCount) === null ? 'Well count unknown' : esc(sd.wellCount) + ' wells') + ' · ' + (D.num(sd.flareCount) === null ? 'Flare count unknown' : esc(sd.flareCount) + ' flares')) +
            row('Published landfill operator', esc(sd.landfillOperator || 'Not recorded')) +
            row('Reported gas sent to this project', cap.projectFlowMmscfd == null ? 'Not reported' : esc(cap.projectFlowMmscfd) + ' million standard ft³/day') +
            row('Original catalogue derivation', esc(cap.capacityBasis || 'Not recorded') + '<small>The current screening calculation is shown in Capacity & capital; the old catalogue conversion is not a measurement.</small>') + '</dl>';
        if (cap.collectionStatusConflict) html += '<p class="dg-warning">The project and landfill inventory files disagree about the collection-system status. Confirm it on site.</p>';
        if (c.energyType === 'landfill_gas') html += '<p class="dg-warning">Landfill-wide collected gas may serve several projects. Flaring can reflect outages or operational requirements. Neither value establishes uncommitted gas, and they must not be added together as separate resources.</p>';
        if (cap.sharedProject) html += '<p class="dg-warning">This project identifier appears at multiple landfills. Do not add its full project capacity once per landfill.</p>';
        if (c.source === 'eccc-landfill-ca') html += '<p class="dg-note">The Canadian source reports emissions. Emitted methane, destroyed methane, total generated methane and recoverable gas are different quantities. An inferred regulatory cohort does not establish an operator-funded collection project.</p>';
        html += '<details><summary>Recorded source observations</summary><dl class="dg-facts">' + (c.evidence || []).map(function (e) { return row(e.dataset || e.field || 'Source', esc([e.year, e.field, e.value].filter(function (v) { return v !== null && v !== undefined; }).join(' · '))); }).join('') + '</dl></details>';
        html += '<h4>Evidence to request next</h4><ul class="dg-actions"><li>Current equipment list, serial numbers, ratings, maintenance records and site photographs.</li><li>Recent gas-flow and gas-quality logs, allocation agreements and decline analysis.</li><li>Single-line diagram, interconnection/islanding studies and permit conditions.</li><li>Itemized vendor scopes, exclusions, funding responsibilities and amounts already paid.</li></ul><button type="button" data-dg-export>Export diligence and quote checklist</button>';
        return section('Evidence & provenance', html);
    }
    function renderBuckets(candidate, ctx) {
        ctx = Object.assign({}, ctx || {}, { candidate: candidate });
        var p = D.profile(candidate, ctx.saved, ctx);
        if (p.state.error) return { capacity: section('Capacity & capital', '<p class="dg-warning">' + esc(p.state.error) + '</p>'), scores: scoresSection(p, ctx), econ: economicsSection(p, ctx), evidence: evidenceSection(p, ctx) };
        return { capacity: capacitySection(p, ctx), scores: scoresSection(p, ctx), econ: economicsSection(p, ctx), evidence: evidenceSection(p, ctx) };
    }
    function values(form) { var v = {}; new FormData(form).forEach(function (value, key) { v[key] = value; }); return v; }
    function fill(form, value) {
        form.reset(); Object.keys(value || {}).forEach(function (k) { var el = form.elements.namedItem(k); if (el) el.value = typeof value[k] === 'boolean' ? value[k] ? 'yes' : 'no' : value[k] == null ? '' : value[k]; });
        var checked = form.elements.namedItem('checked_on'); if (checked && !checked.value) checked.value = D.today();
    }
    function commit(candidate, command, findSaved) {
        var site = findSaved ? findSaved(candidate.id) : SiteData.get(candidate.id), result = D.apply(site || { id: candidate.id }, command);
        if (!result.ok) return result;
        if (!site) { site = SiteData.fromCandidate(candidate); if (!site || !site._save || !site._save.ok) return { ok: false, err: site && site._save ? site._save.err : 'Could not save this prospect.' }; }
        var fields = Object.assign({}, site.custom_fields || {}); fields[D.KEY] = result.diligence;
        var saved = SiteData.update(site.id, { custom_fields: fields });
        if (!saved || !saved._save || !saved._save.ok) return { ok: false, err: saved && saved._save ? saved._save.err : 'Diligence was not saved.' };
        if (D.state(saved).revision !== result.diligence.revision) return { ok: false, err: 'The updated site did not retain the diligence record.' };
        return { ok: true, site: saved };
    }
    function bind(host, candidate, ctx) {
        ctx = ctx || {}; var forms = Array.from(host.querySelectorAll('[data-dg-form]')); if (!forms.length) return;
        var saved = ctx.saved || {}, initial = new Map(), revision = D.state(saved).revision;
        host.querySelectorAll('.dg-status,.dg-reload').forEach(function (el) { el.remove(); });
        var status = document.createElement('p'); status.className = 'dg-status'; status.setAttribute('role', 'status');
        var panel = host.querySelector('#dtab_capacity') || host; panel.appendChild(status);
        function remember(form) { initial.set(form, JSON.stringify(values(form))); }
        function dirty(form) { return initial.get(form) !== JSON.stringify(values(form)); }
        host._diligenceCandidate = candidate.id; host._diligenceHasDraft = function () { return forms.some(dirty); };
        host._diligenceStatus = status;
        var assetForm = forms.find(function (f) { return f.getAttribute('data-dg-form') === 'asset'; });
        function loadAsset(id) { var map = D.state(saved); fill(assetForm, map.assets[id] || {}); assetForm.elements.namedItem('component').value = id; remember(assetForm); }
        forms.forEach(function (form) { fill(form, form === assetForm ? {} : form.getAttribute('data-dg-form') === 'planning' ? D.state(saved).planning || {} : form.getAttribute('data-dg-form') === 'economics' ? D.state(saved).economics || {} : D.state(saved).capacity); remember(form); form.addEventListener('submit', function (event) {
            event.preventDefault(); var v = values(form), command = { revision: revision, type: form.getAttribute('data-dg-form'), id: v.component, value: v };
            var result = commit(candidate, command, ctx.findSaved);
            if (!result.ok) { status.textContent = result.err; return; }
            saved = result.site; revision = D.state(saved).revision; remember(form);
            status.textContent = 'Diligence saved. Existing contacts and relationship maps retained.';
            if (ctx.onSave) ctx.onSave();
        }); });
        if (assetForm) {
            loadAsset('collection');
            assetForm.elements.namedItem('component').addEventListener('change', function () {
                // The selector itself changes the form, so compare the rest before switching records.
                var prior = JSON.parse(initial.get(assetForm)), now = values(assetForm), id = now.component; now.component = prior.component;
                if (JSON.stringify(now) !== JSON.stringify(prior)) { this.value = prior.component; status.textContent = 'Save the current component or reload before choosing another.'; return; }
                loadAsset(id);
            });
        }
        host.querySelectorAll('[data-dg-edit]').forEach(function (button) { button.addEventListener('click', function () {
            if (dirty(assetForm)) { status.textContent = 'Save the open component or reload before opening another.'; return; }
            var ledger = host.querySelector('.pc-ledger'); if (ledger) ledger.open = true;
            loadAsset(this.getAttribute('data-dg-edit')); var editor = host.querySelector('[data-dg-asset-editor]'); editor.open = true; editor.scrollIntoView({ block: 'nearest' }); assetForm.elements.namedItem('component').focus();
        }); });
        var reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reload saved diligence and clear these forms'; reset.className = 'dg-reload';
        reset.addEventListener('click', function (event) { event.stopPropagation(); forms.forEach(remember); if (ctx.onSave) ctx.onSave(); }); panel.appendChild(reset);
        var exp = host.querySelector('[data-dg-export]'); if (exp) exp.addEventListener('click', function () {
            var latest = ctx.findSaved ? ctx.findSaved(candidate.id) : SiteData.get(candidate.id);
            var doc = { site_id: candidate.id, name: candidate.name, exported_on: D.today(), profile: D.profile(candidate, latest, ctx) };
            var url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'proton-diligence-' + String(candidate.id).replace(/[^a-z0-9_-]/gi, '_') + '.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
    }
    function openState(host) {
        return { ledger: !!(host && host.querySelector('.pc-ledger[open]')), forms: host ? Array.from(host.querySelectorAll('[data-dg-form]')).filter(function(f) { return f.closest('details').open; }).map(function(f) { return f.getAttribute('data-dg-form'); }) : [] };
    }
    function restoreOpen(host, state) {
        if (!host || !state) return;
        var ledger = host.querySelector('.pc-ledger'); if (ledger) ledger.open = state.ledger;
        host.querySelectorAll('[data-dg-form]').forEach(function(f) { if (state.forms.indexOf(f.getAttribute('data-dg-form')) >= 0) f.closest('details').open = true; });
    }
    function refresh(host, candidate, ctx) {
        var editors = openState(host);
        var rendered = renderBuckets(candidate, ctx);
        Object.keys(rendered).forEach(function (key) { var panel = host.querySelector('#dtab_' + (key === 'scores' ? 'scores' : key)); if (panel) { var content = panel.querySelector('.src-detailgrid'); if (content) content.innerHTML = rendered[key]; } });
        bind(host, candidate, ctx); restoreOpen(host, editors);
    }
    return { openState: openState, restoreOpen: restoreOpen, renderBuckets: renderBuckets, bind: bind, refresh: refresh, commit: commit, values: values, esc: esc };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectDiligenceUi;
