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
    var active = false, firstOpen = true, scene = null, scenePromise = null;
    var result = null, sceneTimer = null, announceTimer = null, sceneFailed = false;
    var powered = true, inspecting = false, xray = false;
    var market = { btcPrice: 'example', difficulty: 'example' };
    var revisions = { btcPrice: 0, difficulty: 0 }, requestSequence = 0;
    var chart = $('chart'), original = document.querySelector('#inside .dg-wrap--site');
    var originalList = document.querySelector('#inside .dg-list--site');
    var tabs = [$('tab-ours'), $('tab-build')];

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

    function settings() {
        var out = {};
        Object.keys(fields).forEach(function (key) { out[key] = fields[key].value; });
        return out;
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

    function viewControls() {
        var valid = result && result.valid, populated = valid && result.count > 0;
        var available = scene && !sceneFailed;
        ['energize', 'inspect', 'xray'].forEach(function (id) { $(id).disabled = !available || !populated; });
        ['zoom-in', 'zoom-out', 'reset-view'].forEach(function (id) { $(id).disabled = !available || !valid; });
        $('energize').setAttribute('aria-pressed', String(powered && populated));
        $('energize').innerHTML = '<span aria-hidden="true">◉</span> ' + (powered ? 'Power down' : 'Energize mine');
        $('inspect').setAttribute('aria-pressed', String(inspecting));
        $('xray').setAttribute('aria-pressed', String(xray));
        text('xray', xray ? 'X-ray on' : 'X-ray off');
        text('inspect', inspecting ? 'Return to site' : 'Inside a container');
        text('view-label', inspecting ? 'Container view' : xray ? 'X-ray view' : 'Site view');
        text('cooling-note', !valid ? '' : result.settings.cooling === 'hydro' ?
            'Hydro cooling · sealed, fanless miners on a closed water loop. Roof fans cool the water through a dry cooler. Step inside to see the manifolds and coolant distribution unit.' :
            result.settings.cooling === 'immersion' ? 'Immersion cooling · miners sit in liquid tanks, with an external heat rejection loop.' :
            'Air cooling · filtered air enters at one end, passes through the miners, and leaves through the exhaust fans.');
        text('power-status', !valid ? 'Check inputs' : !populated ? 'No machines' : (powered ? 'Preview · energized' : 'Preview · standby'));
        $('power-status').classList.toggle('is-on', powered && populated);
    }

    async function loadScene() {
        if (scene || scenePromise || sceneFailed) return;
        scenePromise = import(panel.getAttribute('data-module-src'));
        try {
            var module = await scenePromise;
            scene = module.mountMineScene($('canvas-host'), {
                interactionSurface: $('stage'),
                onInspect: function (value) { inspecting = value; viewControls(); },
                onXray: function (value) { xray = value; viewControls(); },
                onError: function () {
                    sceneFailed = true; inspecting = false;
                    text('scene-message', '3D is unavailable on this device. Your configured mining estimates remain available below.');
                    text('scene-caption', 'Reference layout · configured totals below'); $('scene-fallback').hidden = false; viewControls();
                },
                onRestore: function () { sceneFailed = false; $('scene-fallback').hidden = true; render(); }
            });
            $('scene-fallback').hidden = true;
            if (result && result.valid) scene.setConfig(result);
            scene.energize(powered && result && result.valid && result.count > 0);
            scene.setActive(active && result && result.valid);
            viewControls();
        } catch (error) {
            sceneFailed = true;
            text('scene-message', '3D is unavailable on this device. Your configured mining estimates remain available below.');
            text('scene-caption', 'Reference layout · configured totals below');
            $('scene-fallback').hidden = false;
        }
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
            if (scene) { scene.energize(false); scene.setActive(false); }
            viewControls(); return;
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
        text('scene-caption', sceneFailed ? 'Reference layout · configured totals below' :
            (r.containers > 12 ? '12 visual groups represent ' + number(r.containers, 0) + ' containers' : 'Illustrative layout · representative rack detail'));
        drawChart(r);
        var url = M.calculatorURL(r);
        if (url) { $('calculator').href = url; $('calculator').removeAttribute('aria-disabled'); }
        else { $('calculator').removeAttribute('href'); $('calculator').setAttribute('aria-disabled', 'true'); }
        if (!r.count) inspecting = false;
        if (scene) {
            scene.setActive(active);
            sceneTimer = setTimeout(function () { scene.setConfig(result); scene.energize(powered && result.count > 0); }, 100);
        }
        viewControls();
        if (active) announceTimer = setTimeout(function () { text('announcement', number(r.count, 0) + ' machines. Estimated ' + btc(r.btc30) + ' BTC over the next 30 days.'); }, 700);
    }
    function selectTab(build, focus) {
        active = build; panel.hidden = !build; original.hidden = build; if (originalList) originalList.hidden = build;
        tabs.forEach(function (tab, i) { var selected = i === (build ? 1 : 0); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
        if (focus) tabs[build ? 1 : 0].focus();
        if (scene) scene.setActive(build && result && result.valid);
        if (build) {
            render(); loadScene();
            if (firstOpen) { firstOpen = false; fetchMarket(); }
        }
    }
    tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { selectTab(i === 1, false); });
        tab.addEventListener('keydown', function (event) {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
            event.preventDefault(); selectTab(event.key === 'Home' ? false : event.key === 'End' ? true : i === 0, true);
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
        $('power-slider').value = M.defaults.powerMW; applyModel(); powered = true; inspecting = false;
        if (scene) { scene.reset(); scene.energize(true); }
        render();
    });
    $('energize').addEventListener('click', function () { if (!scene) return; powered = !powered; scene.energize(powered); viewControls(); });
    $('inspect').addEventListener('click', function () { if (scene) scene.inspect(!inspecting); });
    $('xray').addEventListener('click', function () { if (scene) scene.setXray(!xray); });
    $('reset-view').addEventListener('click', function () { if (scene) scene.reset(); });
    $('zoom-in').addEventListener('click', function () { if (scene) scene.zoom(0.8); });
    $('zoom-out').addEventListener('click', function () { if (scene) scene.zoom(1.25); });
    $('calculator').addEventListener('click', function (event) { if (this.getAttribute('aria-disabled') === 'true') event.preventDefault(); });
    tabs[1].hidden = false;
    syncMode(); render(); noteMarket();
})();
