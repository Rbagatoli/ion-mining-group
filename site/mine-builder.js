/* DOM adapter. The model supplies every number; the lazy scene only illustrates it. */
(function () {
    'use strict';
    var M = window.MineBuilderModel;
    var panel = document.getElementById('mb-builder');
    if (!panel || !M || !window.MinerDB || !window.PriceList) return;
    var form = document.getElementById('mb-form');
    var fields = {};
    form.querySelectorAll('[name]').forEach(function (el) { fields[el.name] = el; });
    function $(id) { return document.getElementById('mb-' + id); }
    function text(id, value) { $(id).textContent = value; }
    function number(value, digits) { return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
    function money(value) { return (value < 0 ? '−' : '') + '$' + number(Math.abs(value), Math.abs(value) >= 1000 ? 0 : 2); }
    function btc(value) { return number(value, value >= 100 ? 4 : 6); }
    var active = false, firstOpen = true;
    var result = null, sceneTimer = null, announceTimer = null;
    var market = { btcPrice: 'example', difficulty: 'example' };
    var revisions = { btcPrice: 0, difficulty: 0 }, requestSequence = 0;
    var chart = $('chart'), original = $('site-preview');
    var fuel = document.getElementById('dgFuel');
    if (!original || !fuel) return;
    var picks = fuel.querySelectorAll('[data-fuel]');
    var panes = original.querySelectorAll('.dg-fuel-pane');
    var selectedSite = 'landfill', savedSites = {};
    var sites = {
        landfill: { title: 'Landfill gas',
            note: 'Your capped cell, extraction wells, collection pipes, blower and enclosed flare stay in place. Your mining equipment sits on the working area alongside them.' },
        flare: { title: 'Flared gas',
            note: 'Your wellhead, separator, tanks and flare stay in place. Your mining equipment sits on the open working area of the pad.' }
    };
    picks.forEach(function (pick) { if (pick.getAttribute('aria-pressed') === 'true') selectedSite = pick.getAttribute('data-fuel'); });

    fields.model.textContent = '';
    MinerDB.getAll().sort(function (a, b) { return b.hashrate - a.hashrate; }).forEach(function (m) {
        var option = document.createElement('option');
        option.value = m.model; option.textContent = m.model;
        fields.model.appendChild(option);
    });
    var custom = document.createElement('option'); custom.value = '__custom__'; custom.textContent = 'Custom machine'; fields.model.appendChild(custom);
    fields.model.value = M.defaults.model;
    text('price-note', 'Indicative hardware prices dated ' + PriceList.ASOF + '. Enter your quoted price and infrastructure budget.');

    function applyModel() {
        var m = MinerDB.findByModel(fields.model.value);
        if (!m) return;
        fields.hashrate.value = m.hashrate; fields.power.value = m.power;
        var cost = PriceList.priceFor(m.model);
        fields.capex.value = cost === null ? '' : cost;
        fields.cooling.value = M.coolingFor(m.model);
    }
    applyModel();
    var initialSettings = settings();

    function settings() {
        var out = {};
        Object.keys(fields).forEach(function (key) { out[key] = fields[key].value; });
        return out;
    }
    function publishConfig(reset) {
        clearTimeout(sceneTimer);
        var view = window.ProtonSiteViews && window.ProtonSiteViews[selectedSite];
        if (view) view.configure(result, {reset:reset === true});
    }
    function siteContext() {
        var site = sites[selectedSite];
        text('heading', 'Build your mine · ' + site.title);
        text('context-note', site.note);
        panel.querySelector('.mb-jump').href = '#dgViews-' + selectedSite;
    }
    function syncMode() {
        panel.querySelectorAll('[data-mb-when]').forEach(function (el) {
            el.hidden = el.getAttribute('data-mb-when') !== fields.sizing.value;
            el.querySelectorAll('input').forEach(function (input) { input.disabled = el.hidden; });
        });
        fields.source.disabled = fields.sizing.value === 'gas';
        if (fields.sizing.value === 'gas') fields.source.value = 'gas';
    }
    function noteMarket() {
        text('market-note', 'BTC price: ' + market.btcPrice + ' · Difficulty: ' + market.difficulty + '.');
    }
    async function fetchMarket() {
        var seq = ++requestSequence;
        var startRevisions = Object.assign({}, revisions);
        $('refresh-market').disabled = true;
        var specs = {
            btcPrice: { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot', read: function (body) { return Number(JSON.parse(body).data.amount); } },
            difficulty: { url: 'https://blockchain.info/q/getdifficulty', read: function (body) { return Number(body) / 1e12; } }
        };
        await Promise.all(Object.keys(specs).map(async function (key) {
            var abort = new AbortController(), timer = setTimeout(function () { abort.abort(); }, 8000);
            try {
                var response = await fetch(specs[key].url, { cache: 'no-store', signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
                if (!response.ok) throw new Error('Market request failed');
                var value = specs[key].read(await response.text()), bounds = M.limits[key];
                if (!isFinite(value) || value < bounds[0] || value > bounds[1]) throw new Error('Invalid market data');
                if (seq !== requestSequence || revisions[key] !== startRevisions[key]) return;
                fields[key].value = value.toFixed(key === 'btcPrice' ? 2 : 4);
                market[key] = 'fetched ' + new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                render();
            } catch (e) {
                if (seq === requestSequence && revisions[key] === startRevisions[key]) {
                    market[key] = market[key] === 'example' || market[key].indexOf('unavailable') >= 0
                        ? 'example · live feed unavailable' : market[key] + ' · refresh unavailable';
                }
            } finally { clearTimeout(timer); if (seq === requestSequence) noteMarket(); }
        }));
        if (seq === requestSequence) $('refresh-market').disabled = false;
    }

    function drawChart(r) {
        var values = r.curve.length > 1 ? r.curve : [0, 0];
        var max = Math.max.apply(null, values) || 1;
        // Samples are 30-day steps followed by day 365, not equally spaced months.
        var path = values.map(function (value, i) {
            var day = i === values.length - 1 ? 365 : i * 30;
            return (i ? 'L' : 'M') + (day / 365 * 600).toFixed(2) + ' ' + (80 - value / max * 68).toFixed(2);
        }).join('');
        $('chart-line').setAttribute('d', path);
        $('chart-area').setAttribute('d', path + 'L600 80L0 80Z');
        chart.setAttribute('aria-label', 'Estimated cumulative bitcoin: ' + btc(r.btc30) + ' BTC over 30 days and ' + btc(r.btcYear) + ' BTC over 365 days.');
    }
    function render() {
        syncMode();
        result = M.estimate(settings());
        Object.keys(fields).forEach(function (key) { fields[key].removeAttribute('aria-invalid'); });
        $('error').hidden = result.valid;
        clearTimeout(sceneTimer); clearTimeout(announceTimer);
        if (!result.valid) {
            result.errors.forEach(function (error) {
                if (fields[error.field]) {
                    fields[error.field].setAttribute('aria-invalid', 'true');
                    if (fields[error.field].closest('details')) $('assumptions').open = true;
                }
            });
            text('error', result.errors.map(function (e) { return e.message; }).join(' '));
            panel.querySelectorAll('[id^="mb-out-"]').forEach(function (el) { el.textContent = '—'; el.classList.remove('is-negative', 'is-positive'); });
            $('chart-line').setAttribute('d', ''); $('chart-area').setAttribute('d', '');
            chart.setAttribute('aria-label', 'Complete the inputs to see estimated bitcoin production.');
            text('growth-note', '');
            text('sizing-note', 'Complete the inputs to size your mine.');
            text('assumption-note', 'Estimates update once the highlighted inputs are valid.');
            $('calculator').removeAttribute('href'); $('calculator').setAttribute('aria-disabled', 'true');
            publishConfig(); return;
        }
        var r = result;
        text('out-count', number(r.count, 0)); text('out-hashrate', number(r.hashrateTH / 1000, 2));
        text('out-load', number(r.siteKW / 1000, 3)); text('out-containers', number(r.containers, 0));
        ['btcDay', 'btc30', 'btcYear'].forEach(function (key) { text('out-' + key, btc(r[key])); });
        ['revenueDay', 'energyDay', 'marginDay', 'hardwareCost'].forEach(function (key) { text('out-' + key, money(r[key])); });
        text('out-energyPerBTC', r.energyPerBTC === null ? '—' : money(r.energyPerBTC));
        text('out-breakEvenRate', r.breakEvenRate === null ? '—' : '$' + number(r.breakEvenRate, 4) + '/kWh');
        $('out-marginDay').classList.toggle('is-negative', r.marginDay < 0);
        $('out-marginDay').classList.toggle('is-positive', r.marginDay > 0);
        text('sizing-note', r.count ? number(r.itKW, 1) + ' kW of miners + ' + number(r.siteKW - r.itKW, 1) + ' kW of site overhead. ' +
            (r.settings.sizing === 'machines' ? 'Required supply: ' + number(r.siteKW / 1000, 3) + ' MW.' : number(r.unusedKW, 1) + ' kW unused; only whole machines are counted.')
            : 'This configuration cannot power a machine yet. Increase your available supply or enter a machine count.');
        text('growth-note', (r.settings.diffChange >= 0 ? '+' : '') + number(r.settings.diffChange, 1) + '% difficulty / month');
        text('assumption-note', number(r.settings.uptime, 1) + '% uptime · ' + number(r.settings.poolFee, 1) + '% pool fee · ' + number(r.efficiency, 1) + ' J/TH at the machine. ' +
            '365-day margin after electricity: ' + money(r.marginYear) + '. ' +
            (r.settings.infrastructureCost > 0 ? 'Hardware + your infrastructure budget: ' + money(r.totalCost) + '.' : 'Infrastructure budget is not included; enter it in build assumptions.') +
            ' Electricity is charged during uptime; standby power is not modeled.');
        drawChart(r);
        var url = M.calculatorURL(r);
        if (url) { $('calculator').href = url; $('calculator').removeAttribute('aria-disabled'); }
        else { $('calculator').removeAttribute('href'); $('calculator').setAttribute('aria-disabled', 'true'); }
        sceneTimer = setTimeout(publishConfig, 100);
        if (active) announceTimer = setTimeout(function () { text('announcement', number(r.count, 0) + ' machines. Estimated ' + btc(r.btc30) + ' BTC over the next 30 days.'); }, 700);
    }
    function selectBuild(build) {
        active = build; panel.hidden = !build;
        // The existing canvas and callouts stay mounted in both modes.
        // Only the form and estimates below it open or close.
        panes.forEach(function (pane) {
            pane.querySelector('[data-mb-end="hi"]').setAttribute('aria-expanded', String(build && pane.getAttribute('data-fuel') === selectedSite));
        });
        siteContext();
        if (build) {
            render(); publishConfig();
            if (firstOpen) { firstOpen = false; fetchMarket(); }
        }
    }
    function setScale(pane, value) {
        var scale = pane.querySelector('.dg-scale-input');
        scale.value = String(value); scale.dispatchEvent(new Event('input', { bubbles: true }));
    }
    panes.forEach(function (pane) {
        var scale = pane.querySelector('.dg-scale-input');
        pane.querySelectorAll('[data-mb-end]').forEach(function (button) {
            button.disabled = false;
            button.addEventListener('click', function () {
                var build = button.getAttribute('data-mb-end') === 'hi';
                selectBuild(build);
            });
        });
        scale.addEventListener('input', function () {
            if (active && pane.getAttribute('data-fuel') === selectedSite && Number(scale.value) < 100) selectBuild(false);
        });
        scale.addEventListener('change', function () {
            if (active && pane.getAttribute('data-fuel') === selectedSite && Number(scale.value) < 100) selectBuild(false);
        });
    });
    picks.forEach(function (pick) {
        pick.addEventListener('click', function () {
            var next = pick.getAttribute('data-fuel');
            if (next === selectedSite || !sites[next]) return;
            savedSites[selectedSite] = settings(); publishConfig(); selectedSite = next;
            var saved = savedSites[next] || initialSettings;
            Object.keys(saved).forEach(function (key) {
                if (key !== 'btcPrice' && key !== 'difficulty') fields[key].value = saved[key];
            });
            $('power-slider').value = Math.min(20, Number(fields.powerMW.value) || 0);
            siteContext();
            if (active) {
                panes.forEach(function (pane) { if (pane.getAttribute('data-fuel') === next) setScale(pane, 100); });
                selectBuild(true);
            } else { render(); publishConfig(); }
        });
    });
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    form.addEventListener('input', function (event) {
        var name = event.target.name;
        if (name === 'model') applyModel();
        if (['hashrate', 'power', 'capex', 'cooling'].indexOf(name) >= 0) fields.model.value = '__custom__';
        if (name === 'btcPrice' || name === 'difficulty') { revisions[name]++; market[name] = 'your input'; noteMarket(); }
        if (name === 'powerMW') $('power-slider').value = Math.min(20, Number(fields.powerMW.value) || 0);
        render();
    });
    $('power-slider').addEventListener('input', function () { fields.powerMW.value = this.value; render(); });
    $('refresh-market').addEventListener('click', fetchMarket);
    $('reset-inputs').addEventListener('click', function () {
        // Keep fetched/edited market prices. Resetting a build must not silently restore sample market data.
        Object.keys(M.defaults).forEach(function (key) { if (fields[key] && key !== 'btcPrice' && key !== 'difficulty') fields[key].value = M.defaults[key]; });
        $('power-slider').value = M.defaults.powerMW; applyModel();
        render(); publishConfig(true);
    });
    $('calculator').addEventListener('click', function (event) { if (this.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
    // Cache each site's initial fleet before the lazy renderer paints Today.
    // The same geometry, ground, lens and camera then serve both toggle choices.
    Object.keys(sites).forEach(function (key) {
        var view = window.ProtonSiteViews && window.ProtonSiteViews[key];
        if (view) view.configure(M.estimate(initialSettings));
    });
    siteContext(); syncMode(); render(); noteMarket();
})();
