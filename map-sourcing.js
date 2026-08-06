// ===== ION MINING GROUP — Prospects mode on the Map page =====
// Renders the global flare catalog into the SAME globe and Leaflet map the fleet view uses.
// map.js keeps ownership of those objects; everything here goes through MapBridge.
//
// Reads only the common candidate shape from site-sources.js, never a flare-specific structure,
// so a second energy source appears here with no changes beyond the source label.

var MapSourcing = (function() {

    var _market = null;
    var _filtered = [];              // ranked matches for the current filters
    var _selectedId = null;
    var _focused = false;            // true when one prospect is isolated
    var _trendChart = null;
    var _leafletLayer = null;
    var _booted = false;
    var _prevPOV = null;             // camera to restore when leaving focus
    var _ignoreNextDocClick = false; // set by select(); see installDismiss()
    var _companyFilter = null;       // when set, show only this operator's sites

    var MINER_WATTS = SiteEngine.DEFAULT_CONFIG.minerWatts;

    // Assumptions used to price a prospect. NOT vendor quotes — nobody has quoted these sites —
    // so they are editable and labelled as assumptions wherever they feed a number. Defaults
    // come from Ion's own Alberta deals ($450/kW usable, ~$0.035/kWh).
    var _assume = { costPerKw: 450, powerRate: 0.035 };

    function fmtUsd(v) {
        if (v === null || v === undefined || !isFinite(v)) return '--';
        var n = Math.round(v);
        return '$' + n.toLocaleString('en-US');
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function fmtKw(kw) {
        if (kw === null || kw === undefined) return '--';
        if (kw < 1000) return Math.round(kw) + ' kW';
        // Trim a dead decimal: "5.0 MW" reads as false precision next to "1.5 MW".
        return (kw / 1000).toFixed(kw >= 10000 ? 0 : 1).replace(/\.0$/, '') + ' MW';
    }
    function fmtInt(n) { return n === null || n === undefined ? '--' : Math.round(n).toLocaleString('en-US'); }
    function status(msg, color) {
        var el = document.getElementById('srcStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = color || '#777';
    }

    var ISO3_TO_A2 = {
        USA:'US', CAN:'CA', RUS:'RU', CHN:'CN', IRN:'IR', IRQ:'IQ', SAU:'SA', DZA:'DZ', VEN:'VE',
        NGA:'NG', MEX:'MX', IDN:'ID', ARG:'AR', OMN:'OM', EGY:'EG', KAZ:'KZ', BRA:'BR', IND:'IN',
        LBY:'LY', ECU:'EC', GBR:'GB', NOR:'NO', AUS:'AU', ARE:'AE', KWT:'KW', QAT:'QA', COL:'CO',
        MYS:'MY', THA:'TH', VNM:'VN', AGO:'AO', COG:'CG', GAB:'GA', CMR:'CM', TCD:'TD', SSD:'SS',
        SDN:'SD', YEM:'YE', TKM:'TM', UZB:'UZ', AZE:'AZ', TUR:'TR', ROU:'RO', ITA:'IT', NLD:'NL',
        DEU:'DE', ESP:'ES', POL:'PL', UKR:'UA', BOL:'BO', PER:'PE', TTO:'TT', BRN:'BN', PNG:'PG',
        ZAF:'ZA', GHA:'GH', TUN:'TN', PAK:'PK', BGD:'BD', MMR:'MM', SYR:'SY', BLR:'BY', CUB:'CU',
        NZL:'NZ', DNK:'DK', HRV:'HR', CHL:'CL', BWA:'BW', PRK:'KP'
    };
    function iso3ToA2(i) { return ISO3_TO_A2[i] || null; }
    function countryName(iso3) {
        var a2 = iso3ToA2(iso3);
        if (a2 && typeof GEO_DATA !== 'undefined' && GEO_DATA.getCountryName) {
            return GEO_DATA.getCountryName(a2) || iso3;
        }
        return iso3 || '—';
    }
    // Prefer the source's own name. A flare has none — a VIIRS detection is identified purely by
    // position — so it falls back to country and coordinates, which is what it has always shown.
    function placeLabel(c) {
        if (c.name) return c.name;
        return countryName(c.iso3) + ' · ' + c.lat.toFixed(3) + ', ' + c.lng.toFixed(3);
    }
    function tierBadge(iso3) {
        var j = Jurisdictions.get(iso3);
        return '<span class="src-badge t-' + j.tier + '">' + j.tier + '</span>';
    }

    // ---- market ---------------------------------------------------------------------
    async function loadMarket() {
        var btc = (window.liveBtcPrices && window.liveBtcPrices.usd) || null;
        if (!btc) {
            try { var live = await fetchLiveMarketData(); btc = live && live.price ? live.price : null; } catch (e) {}
        }
        var hashPh = null;
        try { hashPh = await NetworkHistory.currentHashratePh(); } catch (e) {}
        var fx = {};
        if (window.liveBtcPrices && window.liveBtcPrices.usd && window.liveBtcPrices.cad) {
            fx.CAD = window.liveBtcPrices.usd / window.liveBtcPrices.cad;
        }
        _market = {
            btcPriceUsd: btc,
            networkHashratePh: hashPh,
            blockRewardBtc: typeof CalcEngine !== 'undefined' ? CalcEngine.CURRENT_BLOCK_REWARD : 3.125,
            fx: fx
        };
        _live = _market;            // scenario overrides are measured against this
        return _market;
    }

    // Top of the slider scale. Landing the upper thumb here means NO MAXIMUM rather than a
    // literal 5 MW ceiling — the catalog runs to 478 MW and 2,515 sites sit above 5 MW, so a
    // hard cap would silently hide them just because the control ran out of travel.
    // 5 MW is the top of the *useful* range (~1,400 miners); everything beyond is "and up".
    var SIZE_MAX_KW = 5000;

    function sizeBounds() {
        var lo = document.getElementById('fMinKw'), hi = document.getElementById('fMaxKw');
        if (!lo || !hi) return { min: null, max: null, rawMin: 0, rawMax: SIZE_MAX_KW };
        var a = parseFloat(lo.value), b = parseFloat(hi.value);
        if (!isFinite(a)) a = 0;
        if (!isFinite(b)) b = SIZE_MAX_KW;
        // Thumbs can cross; read them as an ordered pair rather than trusting which is which.
        var min = Math.min(a, b), max = Math.max(a, b);
        return {
            min: min > 0 ? min : null,
            max: max >= SIZE_MAX_KW ? null : max,
            rawMin: min,
            rawMax: max
        };
    }

    // Paints the selected band and the end labels.
    //
    // The fill is positioned in PIXELS, not percent. A range thumb does not travel the full
    // width of its track — it is inset by half a thumb at each end — so a percentage-positioned
    // bar drifts away from the thumbs, worst at the extremes. Mirroring the browser's own
    // geometry keeps the fill locked to the handles.
    var THUMB_PX = 16;                  // must match the thumb width in map.html

    function paintSizeRange() {
        var fill = document.getElementById('sizeFill');
        var wrap = document.getElementById('sizeRange');
        if (!fill || !wrap) return;
        var b = sizeBounds();
        var w = wrap.clientWidth;
        if (!w) return;
        var travel = w - THUMB_PX;
        function px(v) { return (v / SIZE_MAX_KW) * travel + THUMB_PX / 2; }
        var l = px(b.rawMin), r = px(b.rawMax);
        fill.style.left = l + 'px';
        fill.style.width = Math.max(0, r - l) + 'px';

        // Live readout of the actual bounds at each end of the track.
        var lo = document.getElementById('sizeMinLabel');
        var hi = document.getElementById('sizeMaxLabel');
        if (lo) lo.textContent = b.rawMin > 0 ? fmtKw(b.rawMin) : '0';
        if (hi) hi.textContent = b.rawMax >= SIZE_MAX_KW ? fmtKw(SIZE_MAX_KW) + '+' : fmtKw(b.rawMax);
    }

    // ---- scenario -------------------------------------------------------------------
    // Global inputs that re-price every site at once: drag BTC price down and watch the map
    // turn red. The point is to make portfolio fragility visible geographically instead of
    // buried in a spreadsheet.
    //
    // `_live` holds the real market; `_scn` holds whatever the user has overridden. Keeping
    // them apart is what lets "Reset to live" work and lets the UI say honestly whether the
    // numbers on screen are current or hypothetical.
    var SCN_KEY = 'ionMiningProspectScenario';
    var _live = null;
    var _scn = {};              // sparse: only the fields actually overridden
    var _portfolio = {};        // id -> true
    var PF_KEY = 'ionMiningProspectPortfolio';

    var SCN_FIELDS = [
        { id: 'scnBtc',   key: 'btcPriceUsd',       live: function() { return _live.btcPriceUsd; } },
        { id: 'scnHash',  key: 'networkHashrateEh', live: function() { return _live.networkHashratePh / 1000; } },
        { id: 'scnRate',  key: 'powerRate',         live: function() { return _assume.powerRate; } },
        { id: 'scnCapex', key: 'costPerKw',         live: function() { return _assume.costPerKw; } },
        { id: 'scnTop',   key: 'takeOrPayPct',      live: function() { return 0; } }
    ];

    function num(v) {
        if (v === null || v === undefined) return NaN;
        var n = parseFloat(String(v).replace(/,/g, '').trim());
        return isFinite(n) ? n : NaN;
    }

    // Effective value: the override when present and valid, otherwise live.
    function scnVal(key) {
        var f = null;
        for (var i = 0; i < SCN_FIELDS.length; i++) if (SCN_FIELDS[i].key === key) f = SCN_FIELDS[i];
        if (!f) return null;
        var v = _scn[key];
        return (v === undefined || v === null || !isFinite(v)) ? f.live() : v;
    }

    function scnIsDirty() {
        for (var i = 0; i < SCN_FIELDS.length; i++) {
            var f = SCN_FIELDS[i];
            var v = _scn[f.key];
            if (v === undefined || v === null || !isFinite(v)) continue;
            if (Math.abs(v - f.live()) > 1e-9) return true;
        }
        return false;
    }

    // The market object handed to SiteEngine, reflecting the scenario rather than live values.
    function scenarioMarket() {
        return {
            btcPriceUsd: scnVal('btcPriceUsd'),
            networkHashratePh: scnVal('networkHashrateEh') * 1000,
            blockRewardBtc: _live ? _live.blockRewardBtc : 3.125,
            fx: _live ? _live.fx : {}
        };
    }

    // Runs one candidate through the SAME engine the vendor-offer path uses, under the current
    // scenario.
    //
    // REAL TERMS WIN. If you have saved this site with a quoted rate or price, that is used and
    // only the gaps fall back to the scenario. This matters more than it looks: under uniform
    // assumed terms revenue and cash cost both scale linearly with site size, so every prospect
    // has an IDENTICAL margin and the map can only ever go all-green or all-red together. It is
    // the moment real quotes start landing that margin colouring begins separating sites.
    // evaluateAt now runs the engine twice (once to learn the miner count, once with the capex
    // stack) plus a SiteCapex.stack. The two new table columns call it per row per render, and
    // sorting calls it again for every row, so an unmemoised version would do thousands of
    // passes on every header click. Invalidated with the opportunity cache, since both depend on
    // the same scenario assumptions and saved records.
    var _evalCache = {};
    function evaluateAt(c) {
        if (Object.prototype.hasOwnProperty.call(_evalCache, c.id)) return _evalCache[c.id];
        var r = evaluateAtUncached(c);
        _evalCache[c.id] = r;
        return r;
    }
    function evaluateAtUncached(c) {
        var saved = findSavedSite(c.id) || {};
        var rate = (saved.power_rate !== null && saved.power_rate !== undefined && saved.power_rate !== '')
            ? saved.power_rate : scnVal('powerRate');
        // The acquisition price. A saved quote always wins; otherwise SiteCapex derives a
        // stage-appropriate default, which for a raw flare is $0 because buying flared gas is a
        // gas purchase agreement rather than an asset purchase. The old code applied a flat
        // "Build $/kW" here identically to a flare and to a running plant.
        var savedPrice = (saved.purchase_price_usd !== null && saved.purchase_price_usd !== undefined && saved.purchase_price_usd !== '')
            ? Number(saved.purchase_price_usd) : null;
        if (savedPrice === null && saved.estimated_acquisition_cost) savedPrice = Number(saved.estimated_acquisition_cost);
        var top = (saved.take_or_pay_pct !== null && saved.take_or_pay_pct !== undefined && saved.take_or_pay_pct !== '')
            ? saved.take_or_pay_pct : (scnVal('takeOrPayPct') > 0 ? scnVal('takeOrPayPct') : null);

        // Miner capex has to be known before the stack can price it, and the engine derives the
        // miner count from usable kW — so the engine runs once without a stack to learn the
        // count, then again with one. Cheap: evaluate() is pure arithmetic.
        var usable = (saved.usable_kw !== null && saved.usable_kw !== undefined && saved.usable_kw !== '')
            ? saved.usable_kw : c.powerPotentialKw;
        var probe = SiteEngine.evaluate(SiteSources.toSite(c, {
            purchase_price_usd: 0, power_rate: rate, usable_kw: usable
        }), scenarioMarket());

        var capex = (typeof SiteCapex !== 'undefined')
            ? SiteCapex.stack(Object.assign({}, c, saved), {
                capacityKw: usable,
                minerCapexUsd: probe.miner_capex_usd,
                acquisitionUsd: savedPrice,
                asOf: null
            })
            : null;
        var price = savedPrice !== null ? savedPrice
                  : (capex && capex.acquisition_usd !== null && capex.acquisition_usd !== undefined
                     ? capex.acquisition_usd
                     : Math.round((c.powerPotentialKw || 0) * scnVal('costPerKw')));

        var site = SiteSources.toSite(c, {
            purchase_price_usd: price,
            power_rate: rate,
            power_rate_currency: saved.power_rate_currency || 'USD',
            usable_kw: (saved.usable_kw !== null && saved.usable_kw !== undefined && saved.usable_kw !== '')
                ? saved.usable_kw : c.powerPotentialKw,
            take_or_pay_pct: top
        });
        // How many hours this asset actually runs, and whether that is solid enough to price.
        // A measured capacity factor derates both the power bill and the hashing; a duty read off
        // a technology lookup, or none at all, leaves the engine at its 100% default so no dollar
        // figure inherits confidence the evidence does not support.
        var avail = (typeof SiteAvailability !== 'undefined')
            ? SiteAvailability.evaluate(c) : null;
        var cfg = (avail && avail.priceable && avail.uptimePct !== 100)
            ? { uptimePct: avail.uptimePct } : null;

        var m = SiteEngine.evaluate(site, scenarioMarket(), cfg, capex);
        m.capex = capex;
        m.availability = avail;
        return m;
    }

    // True when nothing in view carries real quoted terms, i.e. every site is being priced off
    // the same assumptions and therefore shares one margin.
    function allTermsAssumed() {
        for (var i = 0; i < _filtered.length && i < 400; i++) {
            var s = findSavedSite(_filtered[i].candidate.id);
            if (s && (s.power_rate || s.purchase_price_usd)) return false;
        }
        return true;
    }

    function syncScenarioInputs() {
        if (!_live) return;
        for (var i = 0; i < SCN_FIELDS.length; i++) {
            var f = SCN_FIELDS[i];
            var el = document.getElementById(f.id);
            if (!el) continue;
            if (document.activeElement === el) continue;      // never fight the user mid-type
            var v = scnVal(f.key);
            el.value = (f.key === 'btcPriceUsd') ? Math.round(v)
                     : (f.key === 'networkHashrateEh') ? (Math.round(v * 10) / 10)
                     : v;
        }
        var st = document.getElementById('scnState');
        if (st) {
            var base = scnIsDirty()
                ? '<span class="scn-dirty">Hypothetical — these are not live market values.</span>'
                : 'Live market values.';
            // Without this the uniform colouring reads as a bug rather than as the correct
            // consequence of pricing every site off one set of assumptions.
            if (_colourBy === 'margin' && allTermsAssumed()) {
                base += ' <span class="src-gap">Every site here is priced off the same assumed terms, ' +
                        'so they all share one margin and flip colour together — the map shows the price ' +
                        'at which the whole set goes under. Save a site with its real quoted rate and it ' +
                        'starts colouring on its own numbers.</span>';
            }
            st.innerHTML = base;
        }
    }

    function readScenarioInputs() {
        for (var i = 0; i < SCN_FIELDS.length; i++) {
            var f = SCN_FIELDS[i];
            var el = document.getElementById(f.id);
            if (!el) continue;
            var v = num(el.value);
            // Blank or unparseable falls back to live rather than to zero — a zero BTC price
            // would silently paint the whole map red.
            if (!isFinite(v) || v < 0) delete _scn[f.key];
            else _scn[f.key] = v;
        }
        saveScenario();
    }

    function resetScenario() {
        _scn = {};
        saveScenario();
        syncScenarioInputs();
        applyFilters();
    }

    function saveFiltersSources() {
        try {
            localStorage.setItem(SRC_FILTER_KEY, JSON.stringify({ _v: 1, ids: Object.keys(_srcFilter) }));
        } catch (e) {}
    }

    function saveScenario() {
        // Every scenario change alters pricing, so the memoised evaluations and scores must go.
        // This is the single choke point for scenario edits, which is why the invalidation lives
        // here rather than in each of the handlers that can trigger one.
        invalidateOpportunity();
        try {
            localStorage.setItem(SCN_KEY, JSON.stringify({ _v: 1, scn: _scn }));
            localStorage.setItem(PF_KEY, JSON.stringify({ _v: 1, ids: Object.keys(_portfolio) }));
        } catch (e) {}
    }

    function loadScenario() {
        try {
            var a = JSON.parse(localStorage.getItem(SCN_KEY) || 'null');
            if (a && a._v === 1 && a.scn) _scn = a.scn;
            var b = JSON.parse(localStorage.getItem(PF_KEY) || 'null');
            if (b && b._v === 1 && Array.isArray(b.ids)) {
                _portfolio = {};
                for (var i = 0; i < b.ids.length; i++) _portfolio[b.ids[i]] = true;
            }
        } catch (e) {}
    }

    // ---- portfolio ------------------------------------------------------------------
    function portfolioIds() { return Object.keys(_portfolio); }

    function renderPortfolio() {
        var ids = portfolioIds();
        var empty = document.getElementById('pfEmpty');
        var body = document.getElementById('pfBody');
        if (!empty || !body) return;
        if (!ids.length) { empty.style.display = ''; body.style.display = 'none'; return; }
        empty.style.display = 'none'; body.style.display = '';

        var sites = 0, hashPh = 0, btc = 0, capital = 0, cash = 0, floor = 0;
        var missingFloor = 0;
        for (var i = 0; i < ids.length; i++) {
            var c = ProspectStore.get(ids[i]);
            if (!c) continue;
            var m = evaluateAt(c);
            sites++;
            if (m.total_hashrate_ph !== null) hashPh += m.total_hashrate_ph;
            if (m.monthly_btc !== null) btc += m.monthly_btc;
            if (m.total_capital !== null) capital += m.total_capital;
            if (m.monthly_cash_usd !== null) cash += m.monthly_cash_usd;
            if (m.take_or_pay_floor !== null) floor += m.take_or_pay_floor; else missingFloor++;
        }

        document.getElementById('pfSites').textContent = fmtInt(sites);
        document.getElementById('pfSitesSub').textContent = 'of ' + fmtInt(_filtered.length) + ' shown';
        document.getElementById('pfHash').textContent = hashPh ? hashPh.toFixed(0) : '--';
        document.getElementById('pfBtc').textContent = btc ? btc.toFixed(3) : '--';
        document.getElementById('pfCapital').textContent = capital ? fmtUSD(capital) : '--';
        document.getElementById('pfCapitalSub').textContent = 'at ' + fmtUSD(scnVal('costPerKw')) + '/kW + miners';

        var blended = btc > 0 ? cash / btc : null;
        document.getElementById('pfCashCost').textContent = blended === null ? '--' : fmtUSD(blended);
        // Portfolio break-even is the blended cash cost by definition: the BTC price at which
        // combined revenue equals combined cash opex.
        document.getElementById('pfBreakeven').textContent = blended === null ? '--' : fmtUSD(blended);

        var topEl = document.getElementById('pfTakeOrPay');
        var topSub = document.getElementById('pfTakeOrPaySub');
        if (scnVal('takeOrPayPct') > 0) {
            topEl.textContent = fmtUSD(floor) + ' / mo';
            topSub.textContent = 'owed at zero utilization · ' + scnVal('takeOrPayPct') + '% of ' +
                fmtInt(sites) + ' site' + (sites === 1 ? '' : 's') +
                (missingFloor ? ' · ' + missingFloor + ' without terms' : '');
        } else {
            topEl.textContent = 'not modelled';
            topSub.innerHTML = '<span class="src-gap">Set a take-or-pay % in the scenario bar to see the ' +
                'obligation you would owe with every miner switched off.</span>';
        }

        var margin = (btc > 0 && _live) ? (btc * scnVal('btcPriceUsd') - cash) : null;
        document.getElementById('pfNote').innerHTML =
            'Monthly net across the selection: <strong>' + (margin === null ? '--' : fmtUSD(margin)) + '</strong> at ' +
            fmtUSD(scnVal('btcPriceUsd')) + '/BTC. ' +
            'Commercial terms are your assumptions from the scenario bar — none of these sites has been quoted.';
    }

    function togglePortfolio(id, on) {
        if (on) _portfolio[id] = true; else delete _portfolio[id];
        saveScenario();
        renderPortfolio();
    }

    // ---- filter persistence ---------------------------------------------------------
    // The service worker reloads the page whenever it picks up a new build (shared.js
    // controllerchange -> location.reload). That is deliberate — it is how fresh assets land —
    // but it was throwing away the whole search: mode, country, size band, sort, everything.
    // Mid-hunt that is worse than the stale assets it fixes, so the view state is saved and
    // restored. Local only, never synced: this is where YOU are looking right now, not data,
    // and having it jump on another device would be its own bug.
    var FILTER_KEY = 'ionMiningProspectFilters';
    var FILTER_FIELDS = ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort', 'fRegion', 'fRadius'];
    var SRC_FILTER_KEY = 'ionMiningProspectSources';
    var FILTER_CHECKS = ['fOnshore', 'fWorkable', 'fActive', 'fOperator', 'fBurning', 'fSmallOp'];
    // Filters survived a reload but the rest of the view did not, so a refresh still landed you
    // on a differently-sorted table with the open site closed. Same reasoning as the filters:
    // local only, never synced.
    var VIEW_KEY = 'ionMiningProspectView';

    function saveView() {
        try {
            localStorage.setItem(VIEW_KEY, JSON.stringify({
                _v: 1, view: _tableView, sort: _tableSort, sel: _selectedId
            }));
        } catch (e) { /* private mode / quota */ }
    }

    function saveFilters() {
        try {
            var out = { _v: 1, company: _companyFilter };
            FILTER_FIELDS.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) out[id] = el.value;
            });
            FILTER_CHECKS.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) out[id] = !!el.checked;
            });
            localStorage.setItem(FILTER_KEY, JSON.stringify(out));
        } catch (e) { /* private mode / quota — filters simply will not persist */ }
    }

    function restoreFilters() {
        var saved;
        try {
            saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
        } catch (e) { return false; }
        if (!saved || saved._v !== 1) return false;
        FILTER_FIELDS.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || saved[id] === undefined) return;
            // A saved country that no longer exists in the catalog must not blank the control.
            if (el.tagName === 'SELECT') {
                for (var i = 0; i < el.options.length; i++) {
                    if (el.options[i].value === saved[id]) { el.value = saved[id]; return; }
                }
                return;
            }
            el.value = saved[id];
        });
        FILTER_CHECKS.forEach(function(id) {
            var el = document.getElementById(id);
            if (el && saved[id] !== undefined) el.checked = !!saved[id];
        });
        _companyFilter = saved.company || null;
        return true;
    }

    // ---- filters --------------------------------------------------------------------
    // Which sources are selected. An EMPTY set means all of them, so the default behaviour is
    // unchanged for anyone who never touches this control, and a newly registered adapter is
    // included rather than silently excluded.
    var _srcFilter = {};

    function renderSourceFilter() {
        var el = document.getElementById('fSources');
        if (!el || typeof ProspectStore === 'undefined' || !ProspectStore.loaded()) return;
        var srcs = ProspectStore.sources().filter(function(s) { return s.count > 0; });
        // With only one source the control is noise.
        if (srcs.length < 2) { el.innerHTML = ''; return; }
        var any = Object.keys(_srcFilter).length > 0;
        var h = '';
        for (var i = 0; i < srcs.length; i++) {
            var on = !any || _srcFilter[srcs[i].id];
            h += '<button type="button" class="src-srcbtn' + (on ? ' on' : '') +
                 '" data-src="' + esc(srcs[i].id) + '">' + esc(srcs[i].label) +
                 '<span class="n">' + fmtInt(srcs[i].count) + '</span></button>';
        }
        el.innerHTML = h;
    }

    function wireSourceFilter() {
        var el = document.getElementById('fSources');
        if (!el) return;
        el.addEventListener('click', function(e) {
            var b = e.target.closest('.src-srcbtn');
            if (!b) return;
            var id = b.getAttribute('data-src');
            var srcs = ProspectStore.sources().filter(function(s) { return s.count > 0; });
            // First click on an "all selected" state isolates the one clicked, which is what
            // someone reaching for this control almost always wants.
            if (!Object.keys(_srcFilter).length) {
                _srcFilter = {};
                _srcFilter[id] = true;
            } else if (_srcFilter[id]) {
                delete _srcFilter[id];
                // Deselecting the last one returns to showing everything rather than nothing —
                // an empty list here would read as a bug.
                if (!Object.keys(_srcFilter).length) _srcFilter = {};
            } else {
                _srcFilter[id] = true;
                // All selected is the same as none selected; normalise so the state is
                // unambiguous.
                if (Object.keys(_srcFilter).length === srcs.length) _srcFilter = {};
            }
            renderSourceFilter();
            saveFiltersSources();
            applyFilters();
        });
    }

    function currentFilters() {
        var meta = SiteCatalog.meta();
        var size = sizeBounds();
        var minYears = parseInt(document.getElementById('fYears').value, 10);
        return {
            iso3: document.getElementById('fCountry').value || null,
            minKw: size.min,
            maxKw: size.max,
            minYearsSeen: minYears > 0 ? minYears : null,
            onshoreOnly: document.getElementById('fOnshore').checked,
            activeThrough: document.getElementById('fActive').checked && meta ? meta.dataThrough : null,
            tiers: document.getElementById('fWorkable').checked ? ['preferred', 'workable'] : null,
            sources: Object.keys(_srcFilter).length ? Object.keys(_srcFilter) : null,
            hasOperator: document.getElementById('fOperator').checked,
            smallOperatorsOnly: (function() {
                var el = document.getElementById('fSmallOp');
                return !!(el && el.checked);
            })(),
            anchor: currentAnchor(),
            confirmedBurning: (function() {
                var el = document.getElementById('fBurning');
                return !!(el && el.checked);
            })()
        };
    }

    // Stamp liveness onto each candidate so SiteScoring's `recency` criterion and the list
    // renderer both read it from the common shape rather than querying the catalog themselves.
    function stampLiveness(list) {
        for (var i = 0; i < list.length; i++) {
            var l = SiteCatalog.livenessFor(list[i].id);
            list[i].lastActive = l ? l.lastSeen : null;
            list[i].daysSinceActive = l ? SiteCatalog.daysSinceActive(list[i].id) : null;
            list[i].activeNights = l ? l.nights : null;
        }
        return list;
    }

    function applyFilters() {
        var f = currentFilters();
        var matches = stampLiveness(ProspectStore.filter(f));
        if (f.hasOperator) {
            matches = matches.filter(function(c) { return !!operatorName(c); });
        }
        // Small operators only. Flaring is a real annoyance to a company with a few dozen wells
        // and nobody whose job is to field proposals; at a major it is a rounding error and you
        // do not get past the switchboard.
        //
        // Filters OUT prospects with no size class rather than keeping them: the class only
        // exists for Alberta, so keeping unknowns would leave the control looking broken
        // everywhere else. The label says Alberta explicitly for the same reason.
        if (f.smallOperatorsOnly) {
            matches = matches.filter(function(c) {
                var sc = operatorSizeClass(c);
                return sc === 'micro' || sc === 'small';
            });
        }
        // Geographic anchor: everything within N km of a state or province centroid.
        //
        // A circle from a centroid is NOT the region's boundary. Texas is 1,200 km across, so a
        // 250 km circle centred on it reaches neither the Permian nor the Eagle Ford. The control
        // is labelled "within N km of" for that reason, and the anchor is reported alongside the
        // result count so the shape of what was searched is never implied to be a border.
        if (f.anchor) {
            matches = matches.filter(function(c) {
                if (c.lat === null || c.lng === null) return false;
                return SiteCatalog.haversineKm(f.anchor.lat, f.anchor.lng, c.lat, c.lng) <= f.anchor.km;
            });
        }
        if (f.confirmedBurning) {
            matches = matches.filter(function(c) { return c.daysSinceActive !== null; });
        }
        if (_companyFilter) {
            matches = matches.filter(function(c) {
                var o = operatorRecord(c);
                return o && o.operator === _companyFilter;
            });
        }
        var sortBy = document.getElementById('fSort').value;
        _filtered = SiteScoring.rank(matches, { jurisdictions: Jurisdictions }, sortBy);
        saveFilters();
        renderPortfolio();
        paintSizeRange();
        renderSizeHint();
        renderSummary(matches);
        renderList();
        renderTable();
        if (_focused) exitFocus(true);
        else renderMapLayer();
    }

    function renderSizeHint() {
        var el = document.getElementById('srcSizeHint');
        if (!el) return;
        var f = currentFilters();
        function miners(kw) { return fmtInt(Math.floor(kw * 1000 / MINER_WATTS)); }
        if (f.minKw === null && f.maxKw === null) {
            el.textContent = 'Any size — catalog floor is ' +
                Math.round(SiteEngine.gasMcfDayToKw(SiteCatalog.meta().floorMcfd)) + ' kW, largest is ' +
                fmtKw(Math.max.apply(null, ProspectStore.all().map(function(c){ return c.powerPotentialKw || 0; }))) + '.';
        } else if (f.minKw !== null && f.maxKw !== null) {
            el.textContent = fmtKw(f.minKw) + ' to ' + fmtKw(f.maxKw) +
                '  ·  ' + miners(f.minKw) + '–' + miners(f.maxKw) + ' miners per site';
        } else if (f.minKw !== null) {
            el.textContent = fmtKw(f.minKw) + ' and up (no maximum)  ·  ' + miners(f.minKw) + '+ miners per site';
        } else {
            el.textContent = 'Up to ' + fmtKw(f.maxKw) + '  ·  ' + miners(f.maxKw) + ' miners or fewer per site';
        }
    }

    // ---- summary --------------------------------------------------------------------
    function renderSummary(matches) {
        var meta = SiteCatalog.meta();
        var years = meta ? meta.years.length : 0;
        var totalKw = 0, persistent = 0, withOperator = 0;
        for (var i = 0; i < matches.length; i++) {
            totalKw += matches[i].powerPotentialKw || 0;
            if (matches[i].yearsSeen === years) persistent++;
            if (operatorName(matches[i])) withOperator++;
        }
        document.getElementById('sumMatching').textContent = fmtInt(matches.length);
        document.getElementById('sumMatchingSub').textContent = 'of ' + fmtInt(ProspectStore.all().length) + ' in catalog';
        document.getElementById('sumPower').textContent = (totalKw / 1000).toFixed(totalKw >= 100000 ? 0 : 1);
        document.getElementById('sumMiners').textContent = fmtInt(Math.floor(totalKw * 1000 / MINER_WATTS));
        document.getElementById('sumPersistent').textContent = fmtInt(persistent);
        document.getElementById('sumPersistentSub').textContent = 'seen in all ' + years + ' survey years';
        document.getElementById('sumOperator').textContent = fmtInt(withOperator);
        document.getElementById('sumOperatorSub').textContent = matches.length
            ? Math.round(100 * withOperator / matches.length) + '% of matches' : 'company identified';
    }

    // ---- list -----------------------------------------------------------------------
    function renderList() {
        var listEl = document.getElementById('srcList');
        var countEl = document.getElementById('srcCount');
        var meta = SiteCatalog.meta();
        var shown = _filtered.slice(0, 300);

        countEl.innerHTML = fmtInt(_filtered.length) + ' prospect' + (_filtered.length === 1 ? '' : 's') +
            (_filtered.length > shown.length ? ' — top ' + shown.length + ' shown' : '') +
            (_companyFilter ? ' <button class="src-unfocus" id="srcClearCompany">× ' + esc(_companyFilter) + '</button>' : '') +
            (_focused ? ' <button class="src-unfocus" id="srcUnfocus">← All prospects</button>' : '');

        if (!_filtered.length) {
            listEl.innerHTML = '<div class="src-empty">No sites match these filters.<br>' +
                'Try a lower minimum size, or turn off the jurisdiction / operator filters.</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < shown.length; i++) {
            var c = shown[i].candidate;
            var op = operatorRecord(c);
            html += '<div class="src-row' + (c.id === _selectedId ? ' sel' : '') + '" data-id="' + esc(c.id) + '">' +
                '<label class="pf-check" title="Include in portfolio"><input type="checkbox" data-pf="' + esc(c.id) + '"' +
                (_portfolio[c.id] ? ' checked' : '') + '></label>' +
                '<div><div class="t">' + esc(placeLabel(c)) + tierBadge(c.iso3) + '</div>' +
                '<div class="s">' + (op ? '<span class="src-op">' + esc(op.operator) + '</span>'
                                        : '<span class="src-gap">operator not identified</span>') + '</div>' +
                '<div class="s">seen ' + c.yearsSeen + '/' + (meta ? meta.years.length : '?') + ' yr' +
                (c.trend ? ' · ' + esc(c.trend) : '') + burningBadge(c) + '</div></div>' +
                '<div><div class="kw">' + fmtKw(c.powerPotentialKw) + '</div>' +
                '<div class="yr">' + fmtInt(Math.floor(c.powerPotentialKw * 1000 / MINER_WATTS)) + ' miners</div></div>' +
                '</div>';
        }
        listEl.innerHTML = html;
    }

    // ---- Data provenance ---------------------------------------------------------------
    // Each artifact already carries its own generated date and its own caveats, written when the
    // pipeline was built. They were invisible inside JSON. A capacity factor a year old and one
    // from last month look identical in the UI unless something says otherwise.
    //
    // Age bands are about DECISION RISK, not tidiness: a satellite survey published annually is
    // fine at eight months old, while a compliance record is not.
    function ageBand(dateStr, staleAfterDays) {
        if (!dateStr) return { cls: '', label: 'date unknown', days: null };
        var t = Date.parse(dateStr);
        if (isNaN(t)) return { cls: '', label: 'date unknown', days: null };
        var days = Math.floor((Date.now() - t) / 86400000);
        var stale = staleAfterDays || 400;
        var cls = days <= stale * 0.35 ? 'fresh' : (days <= stale ? 'aging' : 'stale');
        var label = days < 1 ? 'today'
                  : days < 60 ? days + ' days old'
                  : days < 730 ? Math.round(days / 30) + ' months old'
                  : (days / 365).toFixed(1) + ' years old';
        return { cls: cls, label: label, days: days };
    }

    function renderProvenance() {
        var el = document.getElementById('provBody');
        if (!el) return;
        var items = [];

        function add(name, meta, opts) {
            if (!meta) return;
            opts = opts || {};
            var band = ageBand(opts.date || meta.generated, opts.staleAfterDays);
            var caveats = [];
            // Ordered by DECISION RISK, not alphabetically. Only the first is shown, so the
            // order decides what the user actually reads. "This figure is a year old" changes a
            // decision; "plants under 1 MW are absent" changes what you go looking for, which
            // matters less at the moment you are reading one prospect's number.
            ['lagNote', 'staleness', 'matchNote', 'coverageNote', 'unitTrap', 'capacityNote',
             'declineMethod', 'method', 'stageNote', 'joinNote', 'permitNote', 'note']
                .forEach(function(k) { if (meta[k]) caveats.push(meta[k]); });
            items.push({
                name: name,
                cls: band.cls,
                age: band.label,
                meta: opts.detail || '',
                // The FIRST caveat only. All of them is a wall of text nobody reads; the one the
                // pipeline author put first is the one that matters most.
                caveat: caveats.length ? caveats[0] : null
            });
        }

        var cm = (typeof SiteCatalog !== 'undefined' && SiteCatalog.meta) ? SiteCatalog.meta() : null;
        if (cm) {
            add('Flare survey (VIIRS)', cm, {
                // The survey YEAR matters far more than when the file was downloaded.
                date: cm.dataThrough ? (cm.dataThrough + '-12-31') : cm.generated,
                staleAfterDays: 900,
                detail: (cm.counts ? fmtInt(cm.counts.sites) + ' sites · ' : '') +
                        'survey years ' + (cm.years ? cm.years[0] + '–' + cm.dataThrough : '?')
            });
        }
        var om = (typeof SiteCatalog !== 'undefined' && SiteCatalog.operatorsMeta) ? SiteCatalog.operatorsMeta() : null;
        if (om) add('Operator index (AER + US)', om, { detail: 'matched within ' + (om.maxMatchM || '?') + ' m of a licensed well' });

        var lm = (typeof SiteCatalog !== 'undefined' && SiteCatalog.livenessMeta) ? SiteCatalog.livenessMeta() : null;
        if (lm) {
            add('Satellite liveness (FIRMS)', lm, {
                staleAfterDays: 120,
                detail: (lm.windowDays ? lm.windowDays + '-day window · ' : '') +
                        (lm.confirmed !== undefined ? fmtInt(lm.confirmed) + ' confirmed burning' : '')
            });
        }
        var fm = (typeof FacilitySource !== 'undefined' && FacilitySource.meta) ? FacilitySource.meta() : null;
        if (fm) {
            add('US facilities (EIA-860/923)', fm, {
                staleAfterDays: 500,
                detail: (fm.counts ? fmtInt(fm.counts.facilities) + ' plants · ' : '') +
                        'EIA-860 ' + (fm.eia860Year || '?') +
                        (fm.generationYears ? ' · generation ' + fm.generationYears[0] + '–' +
                            fm.generationYears[fm.generationYears.length - 1] : '')
            });
        }
        var lfm = (typeof LandfillSource !== 'undefined' && LandfillSource.meta) ? LandfillSource.meta() : null;
        if (lfm) {
            add('Landfill gas (EPA LMOP)', lfm, {
                staleAfterDays: 260,
                detail: lfm.counts ? fmtInt(lfm.counts.projects) + ' projects · ' +
                                     fmtInt(lfm.counts.shutdown) + ' shut down' : ''
            });
        }
        var pm = (typeof PermitIndex !== 'undefined' && PermitIndex.meta) ? PermitIndex.meta() : null;
        if (pm) {
            add('Air permits (EPA ECHO)', pm, {
                staleAfterDays: 200,
                detail: pm.counts ? fmtInt(pm.counts.joined) + ' verified of ' +
                                    fmtInt(pm.counts.facilitiesConsidered) + ' plants' : ''
            });
        } else {
            items.push({
                name: 'Air permits (EPA ECHO)', cls: '', age: 'not built',
                meta: 'permit status shows as unverified everywhere',
                caveat: 'Run tools/build-permit-index.js to populate it. Unverified means not ' +
                        'checked, never that a site is unpermitted.'
            });
        }
        var gm = (typeof ProspectStore !== 'undefined' && ProspectStore.gridMeta) ? ProspectStore.gridMeta() : null;
        if (gm) {
            var us = gm.gridSources && gm.gridSources.usa ? gm.gridSources.usa : null;
            add('Grid distance (substations)', gm, {
                // Dated to the underlying SURVEY, not to when this file was written — the whole
                // point is that the source data is old even though the artifact is new.
                date: us && us.dataLastEdit ? us.dataLastEdit : gm.generated,
                staleAfterDays: 1100,
                detail: gm.counts ? fmtInt(gm.counts.withGridDistance) + ' prospects measured' : ''
            });
        }

        if (!items.length) { el.innerHTML = '<span class="src-gap">No dataset metadata available.</span>'; return; }
        var html = '';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            html += '<div class="prov-item ' + it.cls + '">' +
                '<div><span class="prov-name">' + esc(it.name) + '</span>' +
                '<span class="prov-age">' + esc(it.age) + '</span></div>' +
                (it.meta ? '<div class="prov-meta">' + esc(it.meta) + '</div>' : '') +
                (it.caveat ? '<div class="prov-caveat">' + esc(it.caveat) + '</div>' : '') +
                '</div>';
        }
        el.innerHTML = html;

        // Summarise what is inside while it is shut. Collapsing the panel must not quietly hide
        // that a dataset is out of date — that was the whole reason it was built.
        var hint = document.getElementById('provHint');
        if (hint) {
            var stale = items.filter(function(i) { return i.cls === 'stale'; }).length;
            var aging = items.filter(function(i) { return i.cls === 'aging'; }).length;
            hint.textContent = items.length + ' dataset' + (items.length === 1 ? '' : 's') +
                (stale ? ' · ' + stale + ' out of date' : (aging ? ' · ' + aging + ' ageing' : ''));
            hint.style.color = stale ? '#e66' : (aging ? '#db2' : '#777');
        }
    }

    // Collapsed by default: it is reference material at the foot of the page, and expanding it
    // is one click. The choice is remembered so it does not have to be made twice.
    var PROV_KEY = 'ionMiningProvOpen';
    function wireProvenance() {
        var btn = document.getElementById('provToggle'), card = document.getElementById('provCard');
        if (!btn || !card) return;
        function apply(open) {
            card.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        var open = false;
        try { open = localStorage.getItem(PROV_KEY) === '1'; } catch (e) {}
        apply(open);
        btn.addEventListener('click', function() {
            open = !open;
            apply(open);
            try { localStorage.setItem(PROV_KEY, open ? '1' : '0'); } catch (e) {}
        });
    }

    // ---- Outreach worklist -----------------------------------------------------------------
    // The saved-sites view the CRM never had. Reads SiteData directly rather than the prospect
    // store, because a saved site is a decision the user made and must persist even if the
    // underlying prospect drops out of the current filter — or out of the catalog entirely on a
    // re-ingest.
    var _wlStage = 'all';

    function worklistRows() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return [];
        var all = SiteData.list() || [];
        return _wlStage === 'all' ? all : all.filter(function(r) { return r.stage === _wlStage; });
    }

    function renderWorklist() {
        var body = document.getElementById('wlBody');
        if (!body) return;
        var all = (typeof SiteData !== 'undefined' && SiteData.list) ? (SiteData.list() || []) : [];

        // Stage chips carry their counts, so the shape of the pipeline reads at a glance.
        var bar = document.getElementById('wlStages');
        if (bar) {
            var counts = { all: all.length };
            for (var i = 0; i < all.length; i++) counts[all[i].stage] = (counts[all[i].stage] || 0) + 1;
            var chips = ['all'].concat(SiteData.STAGES);
            var h = '';
            for (var s2 = 0; s2 < chips.length; s2++) {
                var k = chips[s2], n = counts[k] || 0;
                h += '<button type="button" class="wl-stage' + (k === _wlStage ? ' active' : '') +
                     '" data-stage="' + esc(k) + '">' + esc(k === 'all' ? 'All' : k) +
                     '<span class="n">' + n + '</span></button>';
            }
            bar.innerHTML = h;
        }

        var rows = worklistRows();
        var countEl = document.getElementById('wlCount');
        if (countEl) {
            countEl.textContent = all.length
                ? fmtInt(rows.length) + ' of ' + fmtInt(all.length) + ' saved'
                : 'nothing saved yet';
        }

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="6" class="wl-empty">' +
                (all.length
                    ? 'Nothing at this stage.'
                    : 'No sites saved yet. Open a prospect and use <strong>Save to my sites</strong> ' +
                      'to start working it — this is where it will appear, with whatever contact ' +
                      'details you record.') +
                '</td></tr>';
            return;
        }

        // Most recently touched first: a worklist is about what to do next, not about ranking.
        rows = rows.slice().sort(function(a, b) {
            return String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || ''));
        });

        var html = '';
        for (var r = 0; r < rows.length; r++) {
            var w = rows[r];
            var contact = w.contact_name || w.contact_email || w.contact_phone;
            html += '<tr data-id="' + esc(w.id) + '">' +
                '<td class="name">' + esc(w.name || w.id) + '</td>' +
                '<td><span class="wl-pill s-' + esc(w.stage || 'unreviewed') + '">' +
                    esc(w.stage || 'unreviewed') + '</span></td>' +
                '<td>' + (w.operator ? esc(w.operator) : '<span class="src-gap">--</span>') + '</td>' +
                '<td>' + (contact ? esc(contact) : '<span class="src-gap">none recorded</span>') + '</td>' +
                '<td class="num kw">' + (w.usable_kw ? fmtKw(w.usable_kw) : '--') + '</td>' +
                '<td>' + esc(String(w.updated || w.created || '').slice(0, 10)) + '</td>' +
                '</tr>';
        }
        body.innerHTML = html;
    }

    // CSV of whatever the worklist is currently showing. Outreach happens in a spreadsheet, a
    // phone and an inbox — not in this app — so the export carries the fields someone actually
    // needs to make contact, not the scoring internals.
    function worklistCsv() {
        var rows = worklistRows();
        var cols = ['name', 'stage', 'status', 'operator', 'contact_name', 'contact_role',
                    'contact_email', 'contact_phone', 'jurisdiction', 'usable_kw',
                    'development_stage', 'latitude', 'longitude', 'notes', 'updated'];
        function cell(v) {
            if (v === null || v === undefined) return '';
            var t = String(v);
            // Quote anything that could break a CSV, and double any embedded quote.
            return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        }
        var out = [cols.join(',')];
        for (var i = 0; i < rows.length; i++) {
            var line = [];
            for (var c = 0; c < cols.length; c++) line.push(cell(rows[i][cols[c]]));
            out.push(line.join(','));
        }
        return out.join('\r\n');
    }

    function wireWorklist() {
        var bar = document.getElementById('wlStages');
        if (bar) {
            bar.addEventListener('click', function(e) {
                var b = e.target.closest('.wl-stage');
                if (!b) return;
                _wlStage = b.getAttribute('data-stage');
                renderWorklist();
            });
        }
        var body = document.getElementById('wlBody');
        if (body) {
            body.addEventListener('click', function(e) {
                var tr = e.target.closest('tr[data-id]');
                if (!tr) return;
                // Saved sites keep the prospect id, so this reopens the full prospect view.
                select(tr.getAttribute('data-id'));
            });
        }
        var ex = document.getElementById('wlExport');
        if (ex) {
            ex.addEventListener('click', function() {
                var rows = worklistRows();
                if (!rows.length) { status('Nothing to export at this stage.', '#c85'); return; }
                var blob = new Blob([worklistCsv()], { type: 'text/csv;charset=utf-8;' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'ion-prospects-' + (_wlStage === 'all' ? 'all' : _wlStage) + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
                status('Exported ' + rows.length + ' site' + (rows.length === 1 ? '' : 's') + ' to CSV.', '#3ecf8e');
            });
        }
        renderWorklist();
    }

    // ---- Ranked table --------------------------------------------------------------------
    // The primary view. Reads the SAME _filtered result the map and the side list read, so the
    // three can never disagree about what matched.
    var TABLE_CAP = 250;
    var _tableSort = { key: 'opportunity', dir: -1 };
    // 'all' shows every match. 'acquisition' narrows to assets that physically EXIST — anything
    // constructed or beyond — and ranks on the two axes combined, which is the view for deciding
    // who to contact rather than for exploring the resource base.
    var _tableView = 'all';
    var STAGE_ORDER = ['raw_resource', 'permitted', 'constructed', 'energized', 'operating'];
    var _oppCache = {};
    var _acqCache = {};
    var _oppCtx = null;

    // Scoring context is built ONCE per render pass. existingOperations() reads localStorage and
    // JSON.parses it, so calling it per candidate would do that 16,125 times and freeze the page.
    function opportunityCtx() {
        if (!_oppCtx) {
            _oppCtx = { jurisdictions: Jurisdictions, fleet: existingOperations() };
        }
        return _oppCtx;
    }
    function invalidateOpportunity() { _oppCache = {}; _acqCache = {}; _evalCache = {}; _oppCtx = null; }

    // Memoised per candidate. Scoring every row on every sort click would otherwise redo the
    // full seven-component calculation across the whole filtered set.
    function opportunityFor(c) {
        if (Object.prototype.hasOwnProperty.call(_oppCache, c.id)) return _oppCache[c.id];
        var ctx = opportunityCtx();
        var r = SiteOpportunity.score(c, {
            jurisdictions: ctx.jurisdictions,
            fleet: ctx.fleet,
            operator: operatorRecord(c),
            manual: (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(c.id) : null
        });
        _oppCache[c.id] = r;
        return r;
    }

    // Acquirability reads the candidate's structural state plus anything recorded by hand, so a
    // manually logged bankruptcy on a saved record counts alongside adapter-supplied state.
    function acquirabilityFor(c) {
        if (Object.prototype.hasOwnProperty.call(_acqCache, c.id)) return _acqCache[c.id];
        var manual = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(c.id) : null;
        var merged = {
            development_stage: (manual && manual.development_stage) || c.developmentStage || null,
            offtake_state: (manual && manual.offtake_state) || c.offtakeState || null,
            permit_state: (manual && manual.permit_state) || c.permitState || null,
            distress_signals: (manual && Array.isArray(manual.distress_signals) && manual.distress_signals.length)
                ? manual.distress_signals
                : (Array.isArray(c.distressSignals) ? c.distressSignals : [])
        };
        var r = SiteAcquirability.score(merged);
        _acqCache[c.id] = r;
        return r;
    }

    // Combined rank, on unrounded inputs so the sort key is not quantised into false ties.
    function combinedFor(c) {
        var o = opportunityFor(c), a = acquirabilityFor(c);
        return SiteAcquirability.combine(o.scoreRaw, a.scoreRaw);
    }

    function tableSortValue(row, key) {
        var c = row.candidate;
        switch (key) {
            case 'name':        return placeLabel(c).toLowerCase();
            case 'source':      return (c.source || '').toLowerCase();
            case 'iso3':        return (c.iso3 || '').toLowerCase();
            case 'kw':          return c.powerPotentialKw === null ? -1 : c.powerPotentialKw;
            case 'duty':        return c.dutyCyclePct === null ? -1 : c.dutyCyclePct;
            case 'years':       return c.yearsSeen === null ? -1 : c.yearsSeen;
            case 'operator':    var op = operatorRecord(c);
                                return op && op.operator ? op.operator.toLowerCase() : '￿';
            case 'allinkw':
                var mm = evaluateAt(c);
                return mm && mm.all_in_cost_per_usable_kw !== null && mm.all_in_cost_per_usable_kw !== undefined
                    ? mm.all_in_cost_per_usable_kw : null;
            case 'torevenue':
                var mt = evaluateAt(c);
                return mt && mt.months_to_revenue ? mt.months_to_revenue.min : null;
            case 'acquirability': var a = acquirabilityFor(c).scoreRaw; return a === null ? null : a;
            case 'combined':      return combinedFor(c);
            case 'stage':
                var st = SiteOpportunity.stageOf(c);
                return st === null ? null : SiteOpportunity.STAGE_SCORES[st];
            case 'opportunity':
            default:
                var s = opportunityFor(c).score;
                // Unscoreable prospects sort LAST in either direction rather than as a zero they
                // did not earn. -Infinity would put them top on an ascending sort.
                return s === null ? null : s;
        }
    }

    // A prospect qualifies as an acquisition target when the physical asset exists. Deliberately
    // excludes anything with NO recorded stage: an unrecorded stage is missing data, and letting
    // it through would fill the view with prospects nobody has established anything about.
    function isAcquisitionTarget(row) {
        var st = SiteOpportunity.stageOf(row.candidate);
        if (st === null) return false;
        return STAGE_ORDER.indexOf(st) >= STAGE_ORDER.indexOf('constructed');
    }

    function renderTable() {
        var body = document.getElementById('srcTableBody');
        if (!body) return;
        var countEl = document.getElementById('tblCount');
        var capEl = document.getElementById('tblCap');
        var noteEl = document.getElementById('viewNote');

        var rows = _filtered.slice();
        var suppressed = 0;
        if (_tableView === 'acquisition') {
            var before = rows.length;
            rows = rows.filter(isAcquisitionTarget);
            suppressed = before - rows.length;
        }
        if (noteEl) {
            noteEl.textContent = _tableView === 'acquisition'
                ? 'constructed or later, ranked on opportunity x acquirability — ' +
                  fmtInt(suppressed) + ' raw-resource or unrecorded prospects hidden'
                : '';
        }
        var key = _tableSort.key, dir = _tableSort.dir;
        rows.sort(function(a, b) {
            var va = tableSortValue(a, key), vb = tableSortValue(b, key);
            if (va === null && vb === null) return 0;
            if (va === null) return 1;              // nulls last, always
            if (vb === null) return -1;
            if (va < vb) return -dir;
            if (va > vb) return dir;
            return 0;
        });

        var shown = rows.slice(0, TABLE_CAP);
        if (countEl) {
            // Say what was actually searched. A centroid-and-radius circle is not the region's
            // border, and a count presented beside a province name would imply it was.
            var anch = currentAnchor();
            countEl.textContent = fmtInt(rows.length) + ' prospect' + (rows.length === 1 ? '' : 's') +
                (anch ? ' within ' + fmtInt(anch.km) + ' km of the centre of ' + anch.name : '');
        }
        // Never truncate silently — a capped list that says nothing reads as "this is all of it".
        if (capEl) {
            capEl.textContent = rows.length > shown.length
                ? 'showing the top ' + shown.length + ' by ' + key + ' — narrow the filters to see further down'
                : '';
        }

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="13" class="src-gap" style="padding:14px;">' +
                (_tableView === 'acquisition'
                    ? 'No built assets match these filters. The acquisition view shows only ' +
                      'prospects at the constructed stage or later — try widening the country ' +
                      'or size filters, or switch back to all prospects.'
                    : 'No prospects match these filters.') + '</td></tr>';
            return;
        }

        // Duty, showing what it rests on. A measured percentage is plain; one inferred from a
        // technology table is dimmed and marked; an unmeasured one is a gap, not a 100.
        function dutyCell(c) {
            if (typeof SiteAvailability === 'undefined') {
                return c.dutyCyclePct === null ? '--' : c.dutyCyclePct + '%';
            }
            var a = SiteAvailability.evaluate(c);
            if (a.dutyPct === null) return '<span class="src-gap">--</span>';
            if (a.basis === 'typical') {
                return '<span class="src-gap" title="assumed from technology class, not measured ' +
                       'at this site">' + a.dutyPct + '%*</span>';
            }
            return a.dutyPct + '%';
        }

        // A quiet marker that this row is also present in another dataset, so a duplicate is
        // visible without opening every prospect. An amber dot means the two records disagree
        // about whether the asset is running, which is the interesting case.
        function linkChip(c) {
            if (typeof SiteLinks === 'undefined' || !SiteLinks.ready()) return '';
            var l = SiteLinks.forProspect(c);
            if (!l) return '';
            var disagrees = l.disagreements && l.disagreements.length;
            return ' <span class="src-linkchip' + (disagrees ? ' warn' : '') + '" title="' +
                   (disagrees ? 'EIA and LMOP disagree about whether this is running'
                              : 'Also appears in the other dataset — same physical asset') +
                   '">&#8646;</span>';
        }

        var html = '';
        for (var i = 0; i < shown.length; i++) {
            var c = shown[i].candidate;
            var op = operatorRecord(c);
            var opp = opportunityFor(c);
            html += '<tr' + (c.id === _selectedId ? ' class="sel"' : '') + ' data-id="' + esc(c.id) + '">' +
                '<td class="name">' + esc(placeLabel(c)) + tierBadge(c.iso3) + linkChip(c) + '</td>' +
                '<td><span class="src-srcchip">' + esc(energyLabel(c)) + '</span></td>' +
                '<td>' + esc(c.iso3 || '--') + '</td>' +
                '<td class="num kw">' + fmtKw(c.powerPotentialKw) + '</td>' +
                // Via SiteAvailability rather than the raw field: normalize() turns an unmeasured
                // duty into 100, so reading cand.dutyCyclePct here printed a confident "100%" for
                // 340 plants that have never reported a single month of generation.
                '<td class="num">' + dutyCell(c) + '</td>' +
                '<td class="num">' + (c.yearsSeen === null ? '--' : c.yearsSeen + '/' + (c.yearsTotal || '?')) + '</td>' +
                '<td>' + stageCell(c) + '</td>' +
                '<td class="num">' + (opp.score === null
                    ? '<span class="src-gap">--</span>'
                    : '<span class="src-oppcell">' + opp.score + '</span>' +
                      (opp.coverage < 100 ? ' <span class="src-covwarn">' + opp.coverage + '%</span>' : '')) + '</td>' +
                '<td class="num">' + acqCell(c) + '</td>' +
                '<td class="num">' + combinedCell(c) + '</td>' +
                '<td class="num">' + allInCell(c) + '</td>' +
                '<td class="num">' + toRevenueCell(c) + '</td>' +
                '<td>' + (op && op.operator ? esc(op.operator)
                                            : '<span class="src-gap">not identified</span>') + '</td>' +
                '</tr>';
        }
        body.innerHTML = html;
    }

    function wireViews() {
        // By id, not by class. The worklist reuses .src-views for its stage chips, and a class
        // selector silently bound this handler to whichever bar sits first in the DOM.
        var bar = document.getElementById('tblViews');
        if (!bar) return;
        bar.addEventListener('click', function(e) {
            var btn = e.target.closest('.src-view');
            if (!btn) return;
            var v = btn.getAttribute('data-view');
            if (v === _tableView) return;
            _tableView = v;
            var all = bar.querySelectorAll('.src-view');
            for (var i = 0; i < all.length; i++) all[i].classList.toggle('active', all[i] === btn);
            // The acquisition view exists to rank on both axes, so it brings its own default
            // sort. Switching back restores opportunity, which is the honest default while
            // acquirability is still thin.
            _tableSort = v === 'acquisition' ? { key: 'combined', dir: -1 }
                                             : { key: 'opportunity', dir: -1 };
            paintTableHead();
            renderTable();
            saveView();
        });
    }

    function wireTable() {
        var head = document.getElementById('srcTableHead');
        if (head) {
            head.addEventListener('click', function(e) {
                var th = e.target.closest('th[data-sort]');
                if (!th) return;
                var k = th.getAttribute('data-sort');
                // Re-clicking the active column flips direction; a new column starts descending,
                // except the text columns where A-Z is the natural first read.
                if (_tableSort.key === k) _tableSort.dir = -_tableSort.dir;
                else _tableSort = { key: k, dir: (k === 'name' || k === 'source' || k === 'iso3' || k === 'operator') ? 1 : -1 };
                paintTableHead();
                renderTable();
                saveView();
            });
        }
        var body = document.getElementById('srcTableBody');
        if (body) {
            body.addEventListener('click', function(e) {
                var tr = e.target.closest('tr[data-id]');
                if (!tr) return;
                select(tr.getAttribute('data-id'));
            });
        }
        paintTableHead();
    }

    function paintTableHead() {
        var head = document.getElementById('srcTableHead');
        if (!head) return;
        var ths = head.querySelectorAll('th[data-sort]');
        for (var i = 0; i < ths.length; i++) {
            var k = ths[i].getAttribute('data-sort');
            ths[i].classList.toggle('sorted', k === _tableSort.key);
            ths[i].classList.toggle('asc', k === _tableSort.key && _tableSort.dir === 1);
        }
    }

    function stageCell(c) {
        var st = SiteOpportunity.stageOf(c);
        if (st === null) return '<span class="src-gap">--</span>';
        return '<span class="src-stage s-' + st + '">' + st.replace(/_/g, ' ') + '</span>';
    }
    function acqCell(c) {
        var a = acquirabilityFor(c);
        if (a.score === null) return '<span class="src-gap">--</span>';
        // A count of zero is shown deliberately: it is the difference between "structurally
        // available" and "something has actually gone wrong here".
        return '<span class="src-oppcell">' + a.score + '</span>' +
               (a.signalCount ? ' <span class="src-signals">' + a.signalCount + '⚠</span>' : '');
    }
    function allInCell(c) {
        var mm = evaluateAt(c);
        if (!mm || mm.all_in_cost_per_usable_kw === null || mm.all_in_cost_per_usable_kw === undefined) {
            return '<span class="src-gap">--</span>';
        }
        return '<span class="src-oppcell">$' + Math.round(mm.all_in_cost_per_usable_kw).toLocaleString('en-US') + '</span>';
    }
    function toRevenueCell(c) {
        var mm = evaluateAt(c);
        if (!mm || !mm.months_to_revenue) return '<span class="src-gap">--</span>';
        return mm.months_to_revenue.min + '\u2013' + mm.months_to_revenue.max + ' mo';
    }

    function combinedCell(c) {
        var v = combinedFor(c);
        return v === null ? '<span class="src-gap">--</span>'
                          : '<span class="src-oppcell">' + Math.round(v) + '</span>';
    }

    // Energy type reads better than an adapter id in a narrow column.
    function energyLabel(c) {
        if (c.energyType && c.energyType !== 'unknown') return String(c.energyType).replace(/_/g, ' ');
        return c.source || 'unknown';
    }

    // A confirmation is only shown when one exists. Nothing is rendered for unconfirmed sites in
    // the list — claiming "not burning" from an absent detection would be a fabrication.
    function burningBadge(c) {
        if (c.daysSinceActive === null || c.daysSinceActive === undefined) return '';
        var d = c.daysSinceActive;
        var label = d <= 1 ? 'today' : d + 'd ago';
        return ' · <span class="src-burning">burning ' + label + '</span>';
    }

    // ---- map layer ------------------------------------------------------------------
    function colorFor(c) {
        if (_colourBy === 'margin') return marginColor(c);
        var meta = SiteCatalog.meta();
        var total = meta ? meta.years.length : 6;
        var r = c.yearsSeen / total;
        if (r >= 0.99) return '#3ecf8e';
        if (r >= 0.66) return '#f7931a';
        if (r >= 0.33) return '#d8863a';
        return '#8a6a4a';
    }

    // Green healthy, amber thin, red below cash cost. Dragging BTC price down and watching the
    // map turn red is the whole point of the scenario bar.
    function marginColor(c) {
        var m = evaluateAt(c);
        if (m.monthly_revenue === null || m.monthly_net === null || m.monthly_revenue <= 0) return '#666';
        var margin = m.monthly_net / m.monthly_revenue;
        if (margin < 0) return '#e05555';        // below cash cost
        if (margin < 0.30) return '#e0a92e';     // thin
        return '#3ecf8e';                        // healthy
    }
    var _colourBy = 'persistence';
    function sizeFor(c) {
        return Math.max(0.09, Math.min(0.9, Math.log(Math.max(c.powerPotentialKw || 30, 30)) / 12));
    }
    // Column height. Log-scaled between the 30 Mcf/day floor (~125 kW) and 10 MW so the whole
    // usable range is legible; a linear scale would flatten everything under 1 MW to nothing.
    function altFor(c) {
        var kw = Math.max(c.powerPotentialKw || 125, 125);
        var t = (Math.log(kw) - Math.log(125)) / (Math.log(10000) - Math.log(125));
        return 0.015 + Math.max(0, Math.min(1, t)) * 0.16;
    }

    // ---- zoom-dependent point size -------------------------------------------------
    // globe.gl sizes points in DEGREES, so they scale with the globe: zooming in magnifies the
    // markers along with the terrain and a dense basin stays an unreadable blob no matter how
    // far you push in. Leaflet's circleMarkers are sized in SCREEN PIXELS, which is why zooming
    // there separates them.
    //
    // Shrinking the angular radius in proportion to camera altitude reproduces that: the marker
    // holds roughly constant on screen while the ground beneath it spreads out, so neighbouring
    // flares pull apart as you descend.
    var REF_ALTITUDE = 2.2;             // the default framing; scale is 1.0 here
    var _zoomScale = 1;
    var _zoomRaf = null;

    function currentAltitude() {
        var g = MapBridge.globe();
        if (!g) return REF_ALTITUDE;
        try {
            var pov = g.pointOfView();
            return pov && isFinite(pov.altitude) ? pov.altitude : REF_ALTITUDE;
        } catch (e) { return REF_ALTITUDE; }
    }

    function zoomScale() {
        // The clamps used to be 0.06 and 1.25. The upper one bit almost immediately — it caps
        // at altitude 2.75, barely past the default 2.2 — so markers visibly stopped growing
        // as soon as you pulled back, which reads as "zooming out doesn't resize them".
        // Widened so the proportional response holds across the whole usable range; these are
        // now genuine safety rails rather than working limits.
        return Math.max(0.02, Math.min(2.0, currentAltitude() / REF_ALTITUDE));
    }

    // Re-applies the size accessors only. Cheap next to rebuilding pointsData, and coalesced to
    // one update per animation frame because OrbitControls fires 'change' continuously on drag.
    function applyZoomScale() {
        var g = MapBridge.globe();
        if (!g) return;
        var s = zoomScale();
        // Ignore very small changes: re-assigning an accessor re-renders every point. 2% is
        // below the visible threshold but tight enough that a slow scroll still feels live.
        if (Math.abs(s - _zoomScale) / _zoomScale < 0.02) return;
        _zoomScale = s;
        try {
            g.pointRadius(function(d) { return d.size * s; })
             // Height scales with zoom exactly like radius. A floor here (it was 0.35)
             // leaves columns 35% of full length while the camera is 200 km up, which
             // renders as spikes streaking off the horizon. The small absolute floor
             // just stops them collapsing to nothing.
             .pointAltitude(function(d) { return Math.max(0.004, d.alt * s); });
        } catch (e) { /* globe not ready */ }
    }

    function watchZoom() {
        var g = MapBridge.globe();
        if (!g || _zoomWatched) return;
        var ctrls;
        try { ctrls = g.controls(); } catch (e) { return; }
        if (!ctrls || !ctrls.addEventListener) return;
        _zoomWatched = true;
        ctrls.addEventListener('change', function() {
            if (_zoomRaf) return;
            _zoomRaf = requestAnimationFrame(function() { _zoomRaf = null; applyZoomScale(); });
        });
    }
    var _zoomWatched = false;

    // Globe view is the default, which leaves #fleetMap at 0x0. Leaflet cannot unproject a
    // zero-size container, so flyTo() and marker placement produce "Invalid LatLng object:
    // (NaN, NaN)" and throw — which aborted focus() before the detail panel ever rendered.
    // Only touch Leaflet once it has actually been laid out.
    function leafletIfVisible() {
        var lmap = MapBridge.leaflet();
        if (!lmap) return null;
        var el = lmap.getContainer && lmap.getContainer();
        if (!el || !el.clientWidth || !el.clientHeight) return null;
        return lmap;
    }

    // '#rrggbb' -> 'rgba(r,g,b,a)'. Used to fade the unselected prospects rather than deleting
    // them: keeping them on screen preserves the shape of the basin around the one in focus.
    // How solid a marker is drawn, by how far along the asset is. Colour already carries score
    // and column height carries capacity, so opacity is the one channel left — and it maps
    // naturally onto how REAL the thing is: a satellite detection of a flame is faint, a running
    // plant is solid. globe.gl points have no stroke, so a hollow-to-filled treatment is not
    // available; opacity is its analogue.
    // The floor is deliberately high. A first pass used 0.45 for raw resource, which reads fine
    // beside a solid plant but washes out the whole globe when the 16,125 flares are the only
    // thing on screen — and they are the majority of the catalog. 0.62 still reads as clearly
    // less solid side by side without dimming the primary dataset.
    var STAGE_SOLIDITY = {
        raw_resource: 0.62,
        permitted:    0.72,
        constructed:  0.82,
        energized:    0.91,
        operating:    1.00
    };
    function solidityFor(c) {
        var st = (typeof SiteOpportunity !== 'undefined' && SiteOpportunity.stageOf)
            ? SiteOpportunity.stageOf(c) : null;
        // An unrecorded stage draws at full solidity rather than faint. Fading it would read as
        // "this is barely a prospect" when the truth is only that nobody has recorded its stage.
        if (st === null) return 1;
        return Object.prototype.hasOwnProperty.call(STAGE_SOLIDITY, st) ? STAGE_SOLIDITY[st] : 1;
    }

    function fade(hex, alpha) {
        var h = String(hex).replace('#', '');
        if (h.length !== 6) return hex;
        return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' +
               parseInt(h.slice(4, 6), 16) + ',' + alpha + ')';
    }

    function toGlobePoints(cands, focusId) {
        return cands.map(function(c) {
            var isFocus = focusId && c.id === focusId;
            var dim = focusId && !isFocus;
            return {
                kind: 'flare',                 // read by the guard in map.js onPointClick
                id: c.id,
                lat: c.lat, lng: c.lng,
                // The focused column stands slightly proud and the rest recede, so the eye lands
                // on it without the surrounding field disappearing.
                size: sizeFor(c) * (isFocus ? 0.62 : 0.42),
                alt: altFor(c) * (dim ? 0.35 : 1),
                color: dim ? fade(colorFor(c), 0.18) : fade(colorFor(c), solidityFor(c)),
                label: placeLabel(c),
                kw: c.powerPotentialKw,
                dim: !!dim,
                candidate: c
            };
        });
    }

    // Always renders the full match set. Focusing dims the others rather than removing them, so
    // the surrounding field stays visible for context.
    function renderMapLayer() {
        var cands = _filtered.slice(0, 4000).map(function(r) { return r.candidate; });
        var focusId = _focused ? _selectedId : null;

        var note = document.getElementById('srcMapNote');
        if (note) {
            note.textContent = _focused
                ? 'Focused on 1 of ' + fmtInt(cands.length) + '. Click anywhere to show them all again.'
                : (_filtered.length > 4000
                    ? 'Showing the top 4,000 of ' + fmtInt(_filtered.length) + ' matches — narrow the filters to see the rest.'
                    : fmtInt(cands.length) + ' plotted. Green = burning in every survey year.');
        }

        var globe = MapBridge.globe();
        if (globe) {
            watchZoom();
            _zoomScale = zoomScale();
            globe.pointsData(toGlobePoints(cands, focusId))
                .pointLat('lat').pointLng('lng')
                // Columns, not flat dots. Height carries power potential on a log scale so an
                // 11 MW site visibly towers over a 150 kW one without a 70x bar. Flattening this
                // to a constant made every prospect look identical from orbit.
                .pointAltitude(function(d) { return Math.max(0.004, d.alt * _zoomScale); })
                .pointRadius(function(d) { return d.size * _zoomScale; })
                .pointColor('color')
                .pointLabel(function(d) {
                    var op = operatorRecord(d);
                    return '<div class="globe-tooltip">' + esc(d.label) + '<br>' + fmtKw(d.kw) +
                        (op ? '<br>' + esc(op.operator) : '') + '</div>';
                });
            // A ring marks the focused prospect. ringsData is a free layer, so it never
            // competes with pointsData for the same accessor.
            var focusCand = focusId ? ProspectStore.get(focusId) : null;
            globe.ringsData(focusCand ? [{ lat: focusCand.lat, lng: focusCand.lng }] : [])
                .ringLat('lat').ringLng('lng')
                .ringColor(function() { return function(t) { return 'rgba(62,207,142,' + (1 - t) + ')'; }; })
                .ringMaxRadius(3.5).ringPropagationSpeed(1.4).ringRepeatPeriod(700);
        }

        var lmap = leafletIfVisible();
        if (lmap) {
            if (!_leafletLayer) _leafletLayer = L.layerGroup().addTo(lmap);
            _leafletLayer.clearLayers();
            for (var i = 0; i < cands.length; i++) {
                var c = cands[i];
                var isFocus = focusId && c.id === focusId;
                var dimmed = focusId && !isFocus;
                var base = Math.max(3, Math.min(10, Math.log(Math.max(c.powerPotentialKw, 30)) * 1.1));
                var m = L.circleMarker([c.lat, c.lng], {
                    radius: isFocus ? 12 : base,
                    color: colorFor(c),
                    weight: isFocus ? 3 : 1,
                    opacity: dimmed ? 0.22 : 1,
                    fillColor: colorFor(c),
                    fillOpacity: isFocus ? 0.85 : (dimmed ? 0.10 : 0.45 * solidityFor(c))
                });
                var opx = operatorRecord(c);
                m.bindTooltip(placeLabel(c) + ' — ' + fmtKw(c.powerPotentialKw) + (opx ? ' — ' + opx.operator : ''));
                (function(id) { m.on('click', function() { select(id, true); }); })(c.id);
                m.addTo(_leafletLayer);
            }
        }
    }

    function clearMapLayer() {
        var globe = MapBridge.globe();
        if (globe) globe.ringsData([]).pointsData(MapBridge.fleetPoints());
        if (_leafletLayer) _leafletLayer.clearLayers();
    }

    // ---- focus ----------------------------------------------------------------------
    // Isolate one prospect: every other marker disappears and the camera travels to it.
    function enterFocus(c) {
        var globe = MapBridge.globe();
        if (globe && !_prevPOV) {
            try { _prevPOV = globe.pointOfView(); } catch (e) { _prevPOV = null; }
        }
        _focused = true;
        renderMapLayer();
        renderList();
        renderTable();

        if (globe) {
            // Stop the idle spin, otherwise the globe drifts straight back off the target.
            try { globe.controls().autoRotate = false; } catch (e) {}
            // Never zoom OUT to reach a site. Flying to a fixed altitude yanked the camera back
            // to 0.6 whenever the user was already closer in, undoing their zoom on every click.
            // Move in if they are far away, otherwise just rotate at the altitude they chose.
            var alt = Math.min(currentAltitude(), 0.6);
            globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: alt }, 1200);
        }
        var lmap = leafletIfVisible();
        if (lmap) lmap.flyTo([c.lat, c.lng], Math.max(lmap.getZoom(), 9), { duration: 1.2 });
    }

    // Keeps _selectedId: dismissing restores the full map but the detail panel stays put, so
    // you do not lose the site you were reading.
    function exitFocus(skipCamera) {
        _focused = false;
        renderMapLayer();
        renderList();
        renderTable();
        var globe = MapBridge.globe();
        if (globe && !skipCamera) {
            if (_prevPOV) globe.pointOfView(_prevPOV, 900);
            else globe.pointOfView({ lat: 30, lng: -60, altitude: 2.2 }, 900);
        }
        _prevPOV = null;
        var lmap = leafletIfVisible();
        if (lmap && !skipCamera) lmap.flyTo([30, -60], 2, { duration: 1.0 });
    }

    function select(id, fromMap) {
        var c = ProspectStore.get(id);
        if (!c) return;
        _selectedId = id;
        // The click that caused this selection is still travelling up to document, where the
        // dismiss handler lives. Without this it would immediately undo the focus it just set.
        _ignoreNextDocClick = true;
        enterFocus(c);
        renderDetail();
        if (!fromMap) {
            var row = document.querySelector('.src-row.sel');
            if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
        }
        saveView();
    }

    // Restores what was on screen before the last reload. Deliberately does NOT re-enter focus
    // mode: focus narrows the map to a single point, and a map that opens showing one dot reads
    // as broken data rather than as a restored selection. The site you were reading comes back
    // in the detail panel and stays highlighted in the table; the map opens whole.
    function restoreView() {
        var saved;
        try { saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch (e) { return; }
        if (!saved || saved._v !== 1) return;
        if (saved.view === 'all' || saved.view === 'acquisition') _tableView = saved.view;
        if (saved.sort && typeof saved.sort.key === 'string' &&
            (saved.sort.dir === 1 || saved.sort.dir === -1)) _tableSort = saved.sort;
        // Only restore a selection that still exists. Prospect ids change when a catalog is
        // rebuilt, and a stale id would leave an empty panel claiming a site is open.
        if (saved.sel && ProspectStore.get(saved.sel)) _selectedId = saved.sel;

        // The view toggle is markup, so it has to be told which button is active.
        var bar = document.getElementById('tblViews');
        if (bar) {
            var btns = bar.querySelectorAll('.src-view');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === _tableView);
            }
        }
        // The acquisition view carries a different column set, so the head has to be rebuilt
        // before the first paint, not just re-arrowed.
        paintTableHead();
    }

    // Click anywhere outside the prospect list to bring every prospect back. The detail panel
    // and its inputs are excluded — dropping focus mid-way through typing a phone number would
    // be hostile, and reading the numbers is not a signal you are done with the site.
    function installDismiss() {
        document.addEventListener('click', function(e) {
            if (!_focused) return;
            if (_ignoreNextDocClick) { _ignoreNextDocClick = false; return; }
            if (e.target.closest('#srcList')) return;            // selecting another prospect
            if (e.target.closest('#dBody')) return;               // reading / filling the detail
            if (e.target.closest('.src-filters, .src-checks')) return;
            exitFocus();
        });
    }

    // ---- detail ---------------------------------------------------------------------
    // Sites already owned or under evaluation, used as the reference points for the proximity
    // component. Deliberately NOT the miner fleet: miners are recorded by country and state with
    // no coordinates, so distances from them would be invented. Tracked sites carry real lat/lng.
    // With nothing tracked yet this returns [], and proximity scores null rather than penalising
    // every prospect identically.
    function existingOperations() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return [];
        var out = [];
        var all = SiteData.list() || [];
        for (var i = 0; i < all.length; i++) {
            var s = all[i];
            if (s.status !== 'owned' && s.status !== 'evaluating') continue;
            var lat = Number(s.latitude), lng = Number(s.longitude);
            if (!isFinite(lat) || !isFinite(lng)) continue;
            out.push({ lat: lat, lng: lng });
        }
        return out;
    }

    // Operator identity for ANY source.
    //
    // Reads the candidate's own field first, then falls back to the flare operator index, which
    // carries the richer per-company record (licence, distance, and via companyFor a phone and
    // address). Every consumer goes through this, so a source that publishes an owner can never
    // again be reported as unidentified because it is not a flare.
    // ---- Contact outcome -----------------------------------------------------------------
    // The three first-hand answers, kept in one place so the save handler, the form and the
    // dedupe all agree on what counts as a contact outcome rather than an inferred signal.
    var CONTACT_OUTCOMES = {
        owner_confirmed_available: 1,
        owner_confirmed_taken: 1,
        owner_unresponsive: 1
    };
    function contactOutcomeEntry(saved) {
        var list = (saved && saved.distress_signals) || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && CONTACT_OUTCOMES[String(list[i].type || '').toLowerCase()]) return list[i];
        }
        return null;
    }
    function contactOutcomeOf(saved) {
        var e = contactOutcomeEntry(saved);
        return e ? e.type : '';
    }
    function contactOutcomeDateOf(saved) {
        var e = contactOutcomeEntry(saved);
        return e && e.date ? e.date : '';
    }

    // ---- Geographic anchor -------------------------------------------------------------
    // Region centroids come from GEO_DATA.states, which already carries 51 US states and 13
    // Canadian provinces with coordinates. Nothing is geocoded and nothing is fetched.
    var ANCHOR_ISO = { US: 'USA', CA: 'CAN' };

    function anchorOptions() {
        var out = [];
        if (typeof GEO_DATA === 'undefined' || !GEO_DATA.states) return out;
        ['CA', 'US'].forEach(function(cc) {
            (GEO_DATA.states[cc] || []).forEach(function(s) {
                out.push({ cc: cc, iso3: ANCHOR_ISO[cc], name: s.name, lat: s.lat, lng: s.lng });
            });
        });
        return out;
    }

    function currentAnchor() {
        var sel = document.getElementById('fRegion');
        var rad = document.getElementById('fRadius');
        if (!sel || !sel.value) return null;
        var parts = sel.value.split('|');           // "CA|Alberta"
        var list = anchorOptions();
        for (var i = 0; i < list.length; i++) {
            if (list[i].cc === parts[0] && list[i].name === parts[1]) {
                var km = rad ? parseFloat(rad.value) : NaN;
                if (!isFinite(km) || km <= 0) km = 250;
                return { lat: list[i].lat, lng: list[i].lng, km: km,
                         name: list[i].name, iso3: list[i].iso3 };
            }
        }
        return null;
    }

    function renderAnchorOptions() {
        var sel = document.getElementById('fRegion');
        if (!sel || sel.options.length > 1) return;
        var list = anchorOptions();
        var groups = { CA: 'Canada', US: 'United States' };
        ['CA', 'US'].forEach(function(cc) {
            var members = list.filter(function(x) { return x.cc === cc; });
            if (!members.length) return;
            var og = document.createElement('optgroup');
            og.label = groups[cc];
            members.forEach(function(x) {
                var o = document.createElement('option');
                o.value = cc + '|' + x.name;
                o.textContent = x.name;
                og.appendChild(o);
            });
            sel.appendChild(og);
        });
    }

    // The licensee's company record, where one exists. Carries the ST104 address and phone and,
    // for Alberta, the well counts behind the size class.
    function operatorCompany(c) {
        var rec = operatorRecord(c);
        if (!rec || !rec.operator) return null;
        return (typeof SiteCatalog !== 'undefined' && SiteCatalog.companyFor)
            ? SiteCatalog.companyFor(rec.operator) : null;
    }
    function operatorSizeClass(c) {
        var co = operatorCompany(c);
        return co && co.sizeClass ? co.sizeClass : null;
    }

    function operatorRecord(c) {
        if (!c) return null;
        var flare = (typeof SiteCatalog !== 'undefined' && SiteCatalog.operatorFor)
            ? SiteCatalog.operatorFor(c.id) : null;
        if (flare) return flare;
        if (c.operator) return { operator: c.operator, source: c.operatorSource || null, licence: null };
        return null;
    }
    function operatorName(c) {
        var r = operatorRecord(c);
        return r && r.operator ? r.operator : null;
    }

    // Human label for where a prospect came from, taken from the adapter registry so a new
    // source names itself rather than needing a case added here.
    function sourceLabel(c) {
        if (!c) return 'Source';
        if (typeof SiteSources !== 'undefined' && SiteSources.list) {
            var l = SiteSources.list();
            for (var i = 0; i < l.length; i++) if (l[i].id === c.source) return l[i].label;
        }
        return c.energyType ? String(c.energyType).replace(/_/g, ' ') : 'Source';
    }

    function renderDetail() {
        var c = ProspectStore.get(_selectedId);
        var body = document.getElementById('dBody');
        if (!c || !body) return;
        var meta = SiteCatalog.meta();

        var j = Jurisdictions.get(c.iso3);
        var op = operatorRecord(c);
        var scored = SiteScoring.score(c, { jurisdictions: Jurisdictions });

        // The unified 0-100 opportunity score. Ranks across every energy source, so this is what
        // the ranked table sorts on; SiteScoring stays as the flare-specific criteria breakdown.
        var manual = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(c.id) : null;
        var opp = SiteOpportunity.score(c, {
            jurisdictions: Jurisdictions,
            operator: op,
            manual: manual,
            fleet: existingOperations()
        });

        var acq = acquirabilityFor(c);
        var combined = SiteAcquirability.combine(opp.scoreRaw, acq.scoreRaw);

        document.getElementById('dTitle').textContent = placeLabel(c);
        document.getElementById('dScore').textContent = opp.score === null ? ''
            : 'opportunity ' + opp.score + '/100' +
              (acq.score === null ? '' : ' · acquirable ' + acq.score + '/100');

        // Priced at the CURRENT SCENARIO so the panel and the map can never disagree.
        var m = evaluateAt(c);
        var mcfd = SiteEngine.kwToGasMcfDay(c.powerPotentialKw);

        function row(dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; }
        function gap(t) { return '<span class="src-gap">' + t + '</span>'; }

        var html = '<div class="src-detailgrid">';

        // Opportunity breakdown. Shown component by component so the headline number can be
        // argued with rather than taken on faith, and so an unmeasured component reads as
        // "not surveyed" instead of silently dragging the score down.
        html += '<div class="src-detail"><div class="section-label">Opportunity</div><dl>';
        if (opp.score === null) {
            html += row('Score', gap('nothing measurable for this prospect'));
        } else {
            html += row('Score', '<strong>' + opp.score + ' / 100</strong>');
            html += row('Based on', opp.coverage + '% of the model' +
                (opp.coverage < 100 ? ' ' + gap('the rest is unmeasured') : ''));
            for (var bi = 0; bi < opp.breakdown.length; bi++) {
                var b = opp.breakdown[bi];
                if (!b.weight) continue;
                html += row(b.label + ' <span class="src-sub2">' + b.weight + '%</span>',
                    (b.value === null ? gap('not measured') : Math.round(b.value) + '/100') +
                    '<div class="src-sub2">' + escapeHtml(b.detail) + '</div>');
            }
        }
        html += '</dl></div>';

        // Acquirability — the second axis. Kept visually separate from opportunity because the
        // whole point is that they are independent: a high score here on a low-opportunity site
        // is a cheap asset nobody wants, and the reverse is a good asset that is not for sale.
        html += '<div class="src-detail"><div class="section-label">Acquirability</div><dl>';
        if (acq.score === null) {
            html += row('Score', gap('nothing recorded about contract, permit or distress'));
        } else {
            html += row('Score', '<strong>' + acq.score + ' / 100</strong>');
            html += row('Combined rank', combined === null ? gap('needs both axes')
                : '<strong>' + Math.round(combined) + '</strong> <span class="src-sub2">' +
                  'opportunity x acquirability</span>');
            html += row('Distress signals', acq.signalCount === 0
                ? gap('none detected — this is the normal state, not a clean bill of health')
                : '<span class="src-signals">' + acq.signalCount + ' active</span>');
            for (var ai = 0; ai < acq.breakdown.length; ai++) {
                var ab = acq.breakdown[ai];
                var alabel = String(ab.type).replace(/_/g, ' ');
                html += row(alabel.charAt(0).toUpperCase() + alabel.slice(1),
                    (ab.value === null ? gap('not recorded') : ab.value + '/100') +
                    '<div class="src-sub2">' + esc(ab.detail) + '</div>');
            }
            if (acq.unknownSignals.length) {
                html += row('Unrecognised', gap(esc(acq.unknownSignals.join(', '))));
            }
        }
        html += '</dl></div>';

        // ---- Facility -------------------------------------------------------------------
        // What an acquisition would actually inherit. Rendered only for prospects that ARE a
        // facility — a raw flare has no generator, no permit and no interconnection, so an empty
        // Facility panel on one would imply those things are merely unrecorded.
        var fsd = c.sourceDetail || {};
        var stageNow = SiteOpportunity.stageOf(c);
        var isFacility = stageNow && stageNow !== 'raw_resource';
        if (isFacility) {
            html += '<div class="src-detail"><div class="section-label">Facility</div><dl>';
            html += row('Development stage', stageCell(c));
            if (fsd.technology || fsd.projectType) {
                html += row('Technology', esc(String(fsd.technology || fsd.projectType)));
            }
            if (fsd.primeMover) html += row('Prime mover', esc(String(fsd.primeMover)));
            var installedMw = fsd.ratedMw !== undefined && fsd.ratedMw !== null ? fsd.ratedMw
                            : (c.powerPotentialKw === null ? null : c.powerPotentialKw / 1000);
            html += row('Installed capacity', installedMw === null ? gap('not published')
                : (Math.round(installedMw * 100) / 100) + ' MW');
            if (fsd.capacityBasis) html += row('Capacity basis', '<span class="src-sub2">' + esc(fsd.capacityBasis) + '</span>');
            var inSvc = fsd.inServiceYear || fsd.landfillOpenedYear || null;
            html += row('In service', inSvc ? esc(String(inSvc)) : gap('not published'));
            if (fsd.projectShutdownDate) html += row('Shut down', esc(fsd.projectShutdownDate));
            if (fsd.plannedRetirementYear) html += row('Planned retirement', esc(String(fsd.plannedRetirementYear)));
            // Verified and unverified permit state are visually distinct on purpose. An exact
            // EPA registry match reaches only a minority of plants, and "we could not check" must
            // never read like "there is no permit".
            // ECHO verification is claimed ONLY where the permit index actually matched this
            // plant. A flare adapter declares permitState 'none_required' for all 16,125 flares
            // — true, and nothing to do with ECHO. Citing an evidence source for a value that
            // source never supplied is the same class of error as inventing the value itself.
            if (c.permitState && fsd.permitVerified) {
                html += row('Permit status',
                    '<span class="src-verified">' + esc(String(c.permitState).replace(/_/g, ' ')) + '</span>' +
                    (fsd.airPermitClass && fsd.airPermitClass !== 'unknown'
                        ? ' <span class="src-sub2">' + esc(String(fsd.airPermitClass).replace(/_/g, ' ')) + ' source</span>' : '') +
                    '<div class="src-sub2">verified against the EPA ECHO air permit record' +
                    (fsd.epaRegistryId ? ', registry ' + esc(fsd.epaRegistryId) : '') + '</div>');
                if (fsd.airPrograms) html += row('Air programs', esc(String(fsd.airPrograms)));
                if (fsd.permitIds && fsd.permitIds.length) {
                    html += row('Permit ids', esc(fsd.permitIds.slice(0, 4).join(', ')));
                }
                if (fsd.airOperatingStatus) html += row('EPA facility status', esc(String(fsd.airOperatingStatus)));
            } else if (c.permitState) {
                // Declared by the source rather than checked against a permit register.
                html += row('Permit status', esc(String(c.permitState).replace(/_/g, ' ')) +
                    '<div class="src-sub2">stated by the source, not checked against a permit ' +
                    'register</div>');
            } else {
                html += row('Permit status', gap('not verified') +
                    '<div class="src-sub2">The air permit is the 3-9 month item an acquisition ' +
                    'inherits. EPA holds more than one registry id for many sites, so this could ' +
                    'not be matched exactly — it does NOT mean the site is unpermitted.</div>');
            }
            html += row('Offtake', c.offtakeState
                ? esc(String(c.offtakeState).replace(/_/g, ' '))
                : gap('not published'));
            if (fsd.sector) html += row('Sector', esc(String(fsd.sector)));
            if (fsd.ownershipType) html += row('Ownership', esc(String(fsd.ownershipType)));
            if (fsd.owner) html += row('Owner', esc(String(fsd.owner)));
            if (fsd.fercSmallPowerProducer) html += row('FERC status', 'Small Power Producer (qualifying facility)');
            if (fsd.capacityFactorCurrent !== undefined && fsd.capacityFactorCurrent !== null) {
                html += row('Capacity factor',
                    Math.round(fsd.capacityFactorCurrent * 100) + '%' +
                    (fsd.capacityFactorBaseline ? ' <span class="src-sub2">against a ' +
                        Math.round(fsd.capacityFactorBaseline * 100) + '% 3-year normal</span>' : '') +
                    (fsd.lastDataMonth ? '<div class="src-sub2">as of ' + esc(fsd.lastDataMonth) +
                        ' — most small plants report annually, so this lags</div>' : ''));
            }
            if (fsd.requiresGasTreatment) {
                html += row('Gas treatment', '<span class="src-signals">required</span>' +
                    '<div class="src-sub2">siloxanes destroy engine components; treatment capex is mandatory</div>');
            }
            html += '</dl></div>';
        }

        // ---- Distress timeline ----------------------------------------------------------
        // Chronological, newest first, with the dataset each claim came from. This is the section
        // read before deciding whether to make contact, so it has to read as a narrative: what
        // changed, when, and how confident the signal is.
        var signals = (c.distressSignals || []).slice().filter(function(s) { return s && s.type; });
        if (signals.length) {
            signals.sort(function(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
            html += '<div class="src-detail src-detail-wide"><div class="section-label">Distress timeline</div>';
            html += '<ul class="src-timeline">';
            for (var si = 0; si < signals.length; si++) {
                var sg = signals[si];
                var w = SiteAcquirability.signals()[sg.type];
                var sev = w === undefined ? 'unscored' : (w >= 75 ? 'high' : (w >= 50 ? 'medium' : 'low'));
                var age = sg.date ? ' <span class="src-sub2">' + esc(sg.date) + '</span>'
                                  : ' <span class="src-gap">date not published</span>';
                html += '<li class="sev-' + sev + '">' +
                    '<span class="src-sigtype">' + esc(String(sg.type).replace(/_/g, ' ')) + '</span>' + age +
                    (w === undefined ? '' : ' <span class="src-sub2">weight ' + w + '</span>') +
                    '<div class="src-sub2">' + esc(sg.detail || '') +
                    (sg.source ? ' <em>— ' + esc(sg.source) + '</em>' : '') + '</div></li>';
            }
            html += '</ul></div>';
        }

        // Source-specific evidence. `sourceDetail` is the only place source-specific data is
        // allowed to live on the shared candidate shape, so this section reads from there and
        // renders whatever the adapter chose to publish. A non-flare prospect gets the shared
        // observation rows and simply omits the flare-only ones.
        var sd = c.sourceDetail || {};
        var obs = (sd.firstYear !== undefined && sd.firstYear !== null)
            ? sd.firstYear + ' – ' + sd.lastYear
            : (c.firstSeen && c.lastSeen ? esc(c.firstSeen) + ' – ' + esc(c.lastSeen) : gap('not recorded'));

        html += '<div class="src-detail"><div class="section-label">' + esc(sourceLabel(c)) + '</div><dl>' +
            row('Coordinates', c.lat.toFixed(4) + ', ' + c.lng.toFixed(4)) +
            row('Observed', obs) +
            row('Years detected', c.yearsSeen === null ? gap('no survey history')
                                 : c.yearsSeen + ' of ' + (c.yearsTotal || meta.years.length)) +
            (mcfd === null ? '' : row('Est. gas volume', Math.round(mcfd).toLocaleString('en-US') + ' Mcf/day')) +
            row('Detection frequency', c.persistencePct === null ? gap('not published') : c.persistencePct + '%') +
            (sd.flareTempK === undefined ? ''
                : row('Flare temperature', sd.flareTempK === null ? gap('not published') : sd.flareTempK + ' K')) +
            row('Volume trend', c.trend ? esc(c.trend) : gap('too few years')) +
            row('Still burning?', liveRow(c)) +
            '</dl></div>';

        // The headline figure is one survey year's reading. Where the source publishes enough
        // history to show a spread, say so beside it — 28% of flare sites moved by more than half
        // between the 2022 and 2024 editions, so a bare number reads as far more settled than the
        // measurement behind it.
        var rangeNote = '';
        if (c.powerLoKw !== null && c.powerLoKw !== undefined &&
            c.powerHiKw !== null && c.powerHiKw !== undefined && c.powerHiKw > c.powerLoKw) {
            var spread = c.powerLoKw > 0 ? c.powerHiKw / c.powerLoKw : null;
            rangeNote = '<div class="src-sub2">Last three surveys read ' + fmtKw(c.powerLoKw) +
                ' to ' + fmtKw(c.powerHiKw) +
                (spread && spread >= 2 ? ' — a ' + spread.toFixed(1) + 'x spread, so treat the ' +
                                         'figure above as an estimate rather than a rating' : '') +
                '</div>';
        }
        html += '<div class="src-detail"><div class="section-label">Derived capacity</div><dl>' +
            row('Power potential', fmtKw(c.powerPotentialKw) + rangeNote) +
            row('Miners supported', fmtInt(m.max_miners)) +
            row('Hashrate', m.total_hashrate_ph === null ? '--' : m.total_hashrate_ph.toFixed(1) + ' PH/s') +
            row('Monthly BTC', m.monthly_btc === null ? gap('needs network data') : m.monthly_btc.toFixed(4)) +
            row('Location', c.offshore === true ? '<span style="color:#e66;">offshore — not viable</span>' : 'onshore') +
            row('Jurisdiction', esc(j.label || countryName(c.iso3)) + ' ' + tierBadge(c.iso3)) +
            '</dl></div>';

        // ---- Capital ---------------------------------------------------------------
        var cx = m.capex;
        if (cx && cx.incurred_usd !== null) {
            html += '<div class="src-detail src-detail-wide"><div class="section-label">Capital</div>' +
                '<div class="src-sub2" style="margin:-4px 0 8px;">your assumed rates · priced on ' +
                cx.coverage + '% of components</div><dl>';
            for (var ci = 0; ci < cx.components.length; ci++) {
                var cc = cx.components[ci];
                var val;
                if (cc.state === 'unknown') {
                    val = gap('--');
                } else if (cc.state === 'avoided') {
                    // The rate that WOULD have applied, struck through, next to the $0.
                    val = '<span class="src-verified">$0</span>' +
                          (cc.avoided_usd ? ' <span class="src-struck">' + fmtUsd(cc.avoided_usd) + '</span>' : '');
                } else {
                    val = fmtUsd(cc.usd) + (cc.assumed ? ' <span class="src-assume">assumed</span>' : '');
                }
                html += row(esc(cc.label), val +
                    '<div class="src-sub2">' + esc(cc.reason || cc.basis || '') + '</div>');
            }
            html += '</dl><dl class="src-capsum">';
            html += row('<strong>All-in capital</strong>',
                '<strong>' + fmtUsd(m.all_in_capital_usd === null ? cx.incurred_usd : m.all_in_capital_usd) + '</strong>' +
                (m.all_in_cost_per_usable_kw ? ' <span class="src-sub2">$' +
                    Math.round(m.all_in_cost_per_usable_kw) + '/kW</span>' : ''));
            if (cx.avoided_usd > 0) {
                // "Avoided by acquiring" is only true when the asset itself carries the saving.
                // On a raw flare the saving comes from the PRODUCER owning the generation, not
                // from acquiring anything, and calling that an acquisition benefit would credit
                // the wrong thing.
                var inherited = cx.avoided_components.indexOf('permitting_development') >= 0;
                html += row(inherited ? 'Avoided by acquiring' : 'Avoided',
                    '<span class="src-verified">' + fmtUsd(cx.avoided_usd) + '</span>' +
                    '<div class="src-sub2">' +
                    (inherited
                        ? 'what building this yourself would have cost at your rates'
                        : 'the counterparty owns the generation, so its cost sits in the $/kWh rather than in your capital') +
                    ' — not a valuation of anyone\'s asset</div>');
            }
            if (m.months_to_revenue) {
                html += row('Months to first revenue',
                    m.months_to_revenue.min + ' – ' + m.months_to_revenue.max +
                    '<div class="src-sub2">from close, for a ' + esc(m.months_to_revenue.basis) + ' asset</div>');
            }
            if (m.months_to_payback_from_close) {
                html += row('Payback from close',
                    Math.round(m.months_to_payback_from_close.min) + ' – ' +
                    Math.round(m.months_to_payback_from_close.max) + ' mo' +
                    '<div class="src-sub2">' + (m.payback_months_all_in ? Math.round(m.payback_months_all_in) +
                    ' mo of mining plus the wait to switch on' : '') + '</div>');
            }
            if (cx.unknown_ids.length) {
                html += row('Not priced', gap(esc(cx.unknown_ids.join(', ').replace(/_/g, ' '))));
            }
            html += '</dl></div>';
        }

        // The same physical asset seen by another dataset. Placed high because it changes what
        // the rest of the panel means: if EIA calls this plant retired while the landfill it sits
        // on still has live gas collection, that is the whole thesis in one row.
        if (typeof SiteLinks !== 'undefined' && SiteLinks.ready()) {
            var link = SiteLinks.forProspect(c);
            var dis = SiteLinks.disagreements(c);
            var sibs = SiteLinks.siblings(c);
            var spanRec = SiteLinks.span(c);
            if (link || sibs || spanRec) {
                html += '<div class="src-detail"><div class="section-label">Same physical asset</div><dl>';
                if (link) {
                    var isFac = link.facilityId === c.id;
                    html += row(isFac ? 'Also in EPA LMOP' : 'Also in EIA-860',
                        isFac
                            ? link.landfills.map(function(g) {
                                  return esc(g.name) + ' <span class="src-sub2">' + g.distanceM + ' m' +
                                         (g.capacityKw ? ' · ' + fmtInt(g.capacityKw) + ' kW' : '') + '</span>';
                              }).join('<br>')
                            : esc(link.facilityName) + ' <span class="src-sub2">' +
                              (link.facilityMw === null ? '' : link.facilityMw + ' MW · ') +
                              esc(String(link.facilityStatus || '')) + '</span>');
                    // Both figures, never one silently overwriting the other.
                    html += row('Matched on', 'Coordinates only, within ' +
                        fmtInt(SiteLinks.meta().radiusM) + ' m' +
                        '<div class="src-sub2">No name matching — the two records are linked, ' +
                        'not merged, so neither dataset\'s numbers are overwritten</div>');
                }
                if (spanRec) {
                    html += row('Shared project', esc(spanRec.projectName || spanRec.projectId) +
                        '<div class="src-sub2">Covers ' + spanRec.members.length + ' landfills up to ' +
                        fmtInt(spanRec.maxSeparationM) + ' m apart. The ' +
                        (spanRec.capacityKw ? fmtInt(spanRec.capacityKw) + ' kW' : 'capacity') +
                        ' belongs to the project as a whole — counting it once per landfill ' +
                        'over-states the fleet.</div>');
                }
                if (sibs) {
                    html += row('Other projects here', sibs.projectIds.length + ' at this landfill' +
                        (sibs.statuses.length ? '<div class="src-sub2">' +
                            esc(sibs.statuses.join(', ')) + '</div>' : ''));
                }
                for (var di = 0; di < dis.length; di++) {
                    html += row('Records disagree',
                        '<span class="src-disagree">' + esc(dis[di].text) + '</span>');
                }
                html += '</dl></div>';
            }
        }

        // Availability. Stated BEFORE the economics that depend on it, because "runs 20% of the
        // time" changes how every figure below should be read, and because the capped/dispatch
        // distinction is the difference between a reason to walk away and a reason to call.
        var av = m.availability;
        if (av && av.dutyPct !== null) {
            var capLabel = av.capacityType === 'physically_capped' ? 'Physical ceiling'
                         : av.capacityType === 'dispatch_limited' ? 'Dispatch limited'
                         : null;
            html += '<div class="src-detail"><div class="section-label">Availability</div><dl>' +
                row('Runs', av.dutyPct + '% of hours' +
                    '<div class="src-sub2">' + esc(av.note) + '</div>') +
                (capLabel ? row('Type', esc(capLabel)) : '') +
                row('Hours / month', av.hoursPerMonth === null ? gap('unmeasured')
                                                               : fmtInt(av.hoursPerMonth) + ' of 720') +
                (av.priceable
                    ? ''
                    : row('Used in pricing', gap('no — evidence too thin, figures below assume ' +
                                                 'continuous running'))) +
                '</dl></div>';
        }

        html += '<div class="src-detail"><div class="section-label">Economics <span class="src-assume">(your assumptions)</span></div><dl>' +
            row('Cash cost / BTC', m.cash_cost_per_btc === null ? gap('needs market data') : fmtUSD(m.cash_cost_per_btc)) +
            row('Break-even BTC', m.breakeven_btc_price === null ? gap('needs market data') : fmtUSD(m.breakeven_btc_price)) +
            row('Monthly net', m.monthly_net === null ? gap('needs market data') : fmtUSD(m.monthly_net)) +
            // Capital and payback deliberately live in the Capital block above, which prices the
            // full stack. Repeating a narrower total here produced two different capital figures
            // and two different paybacks on one panel.
            row('Payback once running', m.payback_months === null
                ? gap('does not pay back')
                : m.payback_months.toFixed(1) + ' months' +
                  '<div class="src-sub2">on mining capital alone — see Capital above for payback ' +
                  'from close, which includes the wait to switch on</div>') +
            '</dl><div class="src-assumerow">' +
            // "Build $/kW" was removed rather than relabelled: SiteCapex now supplies the
            // acquisition price per stage, so that input only fed a fallback that fires when
            // SiteCapex is absent. An input that silently does nothing is worse than no input.
            '<div class="src-field"><label for="aRate">Power $/kWh</label><input type="number" id="aRate" value="' + _assume.powerRate + '" step="0.005"></div>' +
            '</div></div>';

        html += '</div>';

        // ---- Who to contact -----------------------------------------------------
        html += '<div class="src-contact"><div class="section-label">Who to contact</div>';
        // Non-flare sources: the owner is published directly by EIA-860 or LMOP, with a postal
        // address in the landfill case. Their record has no distance_m, because there is no
        // nearby well licence involved — the operator IS the site's owner.
        if (op && op.distance_m === undefined) {
            var sdc = c.sourceDetail || {};
            // Require a STREET address. Facilities publish only state and county, and
            // [state] alone passed a naive truthy filter and rendered as "Site address: AK" —
            // a state is not somewhere you can send a letter or identify a site from.
            var addrParts = sdc.address
                ? [sdc.address, sdc.city, sdc.state, sdc.zip].filter(Boolean) : [];
            var oq = encodeURIComponent(op.operator + ' contact');
            html += '<div class="src-op-big">' + esc(op.operator) + '</div>';
            html += '<p class="src-note">Owner of record' +
                (op.source ? ', per ' + esc(op.source) : '') + '.' +
                (sdc.ownershipType ? ' ' + esc(sdc.ownershipType) + ' ownership.' : '') + '</p>';
            if (addrParts.length) {
                var addr = addrParts.join(', ');
                html += '<div class="src-registry"><div class="src-reg-row">' +
                    '<span class="src-reg-k">Site address</span>' +
                    '<a class="src-reg-v" target="_blank" rel="noopener" ' +
                    'href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '">' +
                    esc(addr) + '</a></div></div>' +
                    '<p class="src-note">The site\'s own postal address, not the owner\'s head office. ' +
                    'Useful for identifying the operating company and the local contact.</p>';
            }
            html += '<p class="src-note">No phone or named individual is published for this owner. ' +
                '<a href="https://duckduckgo.com/?q=' + oq + '" target="_blank" rel="noopener">' +
                'Search the web for ' + esc(op.operator) + ' →</a></p>';
        } else if (op) {
            var co = SiteCatalog.companyFor(op.operator);
            var q = encodeURIComponent(op.operator + (co && co.ticker ? '' : ' oil gas company') + ' contact');
            html += '<div class="src-op-big">' + esc(op.operator) +
                (co && co.ticker ? '<span class="src-ticker">' + esc(co.ticker) + '</span>' : '') +
                (co && co.ownership === 'private' ? '<span class="src-ticker priv">private</span>' : '') +
                '</div>' +
                '<p class="src-note">Licensed operator of the nearest well, <strong>' + op.distance_m + ' m</strong> from the flare' +
                (op.licence ? ', licence <strong>' + esc(op.licence) + '</strong>' : '') +
                '. Source: ' + esc(op.source) + (op.as_of ? ', as of ' + esc(op.as_of) : '') + '.</p>';

            // How big this operator is in Alberta, which decides how the call goes. Stated as an
            // ALBERTA footprint, never as company size: BP Canada holds 19 active Alberta
            // licences and is obviously not a small company. What the number predicts is whether
            // there is a development team between you and somebody who cares about a flare.
            if (co && co.sizeClass) {
                var szLabel = { micro: 'Micro operator', small: 'Small operator',
                                mid: 'Mid-size operator', major: 'Major operator' }[co.sizeClass];
                var szHint = (co.sizeClass === 'micro' || co.sizeClass === 'small')
                    ? 'Worth a direct call — an operator this size has no development team fielding proposals.'
                    : 'Expect a switchboard and a process. Flaring at this scale is a rounding error.';
                html += '<div class="src-registry"><div class="src-reg-row">' +
                    '<span class="src-reg-k">Alberta footprint</span>' +
                    '<span class="src-reg-v">' + esc(szLabel) + ' · ' + fmtInt(co.wellsActive) +
                    ' active well licences' +
                    (co.wellsLicensed && co.wellsLicensed > co.wellsActive
                        ? ' of ' + fmtInt(co.wellsLicensed) + ' ever issued' : '') +
                    '</span></div></div>' +
                    '<p class="src-note">' + esc(szHint) + ' Counted from the AER ST37 licence ' +
                    'list; this is their Alberta position, not their company size.</p>';
            }

            // Registry contact details, where the regulator publishes them.
            if (co && (co.phone || co.address)) {
                html += '<div class="src-registry">' +
                    (co.phone ? '<div class="src-reg-row"><span class="src-reg-k">Phone</span>' +
                        '<a class="src-reg-v" href="tel:' + esc(String(co.phone).replace(/[^0-9+]/g, '')) + '">' + esc(co.phone) + '</a></div>' : '') +
                    (co.address ? '<div class="src-reg-row"><span class="src-reg-k">Registered office</span>' +
                        '<a class="src-reg-v" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' +
                        encodeURIComponent(co.address) + '">' + esc(co.address) + '</a></div>' : '') +
                    (co.baCode ? '<div class="src-reg-row"><span class="src-reg-k">AER BA code</span><span class="src-reg-v">' +
                        esc(co.baCode) + (co.eligibility ? ' · ' + esc(co.eligibility) + ' licence eligibility' : '') + '</span></div>' : '') +
                    '</div>' +
                    '<p class="src-note">Published in the AER ST104 business associate registry. This is the company\'s ' +
                    'switchboard and registered office — not a named individual, and not a direct line.</p>';
            }

            // Portfolio rollup. The reason to look at a company rather than a coordinate: one
            // conversation can put several sites on the table at once.
            if (co && co.sites > 1) {
                html += '<div class="src-portfolio">' +
                    '<strong>' + esc(op.operator) + '</strong> operates <strong>' + fmtInt(co.sites) +
                    '</strong> catalogued flares totalling <strong>' + fmtKw(co.totalKw) + '</strong>' +
                    (co.regions ? ' across ' + Object.keys(co.regions).join(', ') : '') + '.' +
                    ' <button class="src-linkbtn" id="srcShowCompany" data-company="' + esc(op.operator) + '">' +
                    'Show all their sites →</button></div>';
            }

            html += '<p class="src-note">' +
                (co && co.phone ? 'Ask for land or business development. ' : '') +
                'Who to ask for, an email or a mobile are not published anywhere — record them below as you learn them. ' +
                '<a href="https://duckduckgo.com/?q=' + q + '" target="_blank" rel="noopener">Search the web for ' + esc(op.operator) + ' →</a></p>';
        } else {
            if (c.source !== 'flare-viirs') {
                html += '<p class="src-note src-gap">No owner is published for this record.</p>';
            } else
            html += '<p class="src-note src-gap">No licensed operator matched within ' +
                (SiteCatalog.operatorsMeta() ? SiteCatalog.operatorsMeta().maxMatchM : 2000) + ' m.</p>' +
                '<p class="src-note">Operator matching currently covers <strong>Alberta</strong> (AER well licences) and the ' +
                '<strong>US</strong> (ND, TX, NM, CO). Elsewhere no public dataset links a flare to a company, so this stays ' +
                'blank rather than naming whoever happens to be nearest.</p>';
        }

        var saved = findSavedSite(c.id) || {};
        html += '<div class="src-crm">' +
            crmField('contact_name', 'Contact name', saved) +
            crmField('contact_role', 'Role', saved) +
            crmField('contact_email', 'Email', saved) +
            crmField('contact_phone', 'Phone', saved) +
            '</div>' +
            '<div class="src-crm-wide">' +
            '<div class="src-field"><label for="crm_contact_notes">Notes</label>' +
            '<textarea id="crm_contact_notes" rows="2">' + esc(saved.contact_notes || '') + '</textarea></div>' +
            '<div class="src-field"><label for="crm_acq">Acquisition price (USD)</label>' +
            '<input type="number" id="crm_acq" step="25000" placeholder="assumed from stage" value="' +
            (saved.estimated_acquisition_cost === null || saved.estimated_acquisition_cost === undefined
                ? '' : esc(saved.estimated_acquisition_cost)) + '"></div>' +
            '<div class="src-field"><label for="crm_stage">Pipeline stage</label><select id="crm_stage">' +
            SiteData.STAGES.map(function(s) {
                return '<option value="' + s + '"' + ((saved.stage || 'unreviewed') === s ? ' selected' : '') + '>' + s + '</option>';
            }).join('') + '</select></div>' +
            // What you were actually told. This is the only input in the app that beats a public
            // record: everything else on the acquirability axis is an inference from a filing,
            // and this is a person answering the phone. It is also the only thing here a
            // competitor cannot rebuild from open data.
            '<div class="src-field"><label for="crm_outcome">What the owner said</label>' +
            '<select id="crm_outcome">' +
            [['', 'Not asked yet'],
             ['owner_confirmed_available', 'Available — they would deal'],
             ['owner_confirmed_taken', 'Taken — already committed'],
             ['owner_unresponsive', 'No response yet']].map(function(o) {
                return '<option value="' + o[0] + '"' +
                       (contactOutcomeOf(saved) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') + '</select></div>' +
            '<div class="src-field"><label for="crm_outcome_date">Date told</label>' +
            '<input type="date" id="crm_outcome_date" value="' +
            esc(contactOutcomeDateOf(saved) || '') + '"></div>' +
            '</div>' +
            '<div class="src-saverow"><button id="srcSave" class="src-savebtn">Save to my sites</button>' +
            '<span id="srcSaveMsg" class="src-note"></span></div>';
        html += '</div>';

        html += '<div class="src-missing"><div class="section-label">Not knowable from orbit</div>' +
            '<p class="src-note">The satellite cannot supply these; they stay blank until someone establishes them on the ground:<br>' +
            '<span class="src-gap">' + SiteData.MANUAL_FIELDS.join(', ').replace(/_/g, ' ') + '</span></p></div>';

        html += '<div class="src-trendwrap"><div class="section-label">Power potential by survey year</div>' +
            '<div class="earnings-chart-container" style="height:150px;"><canvas id="dTrend"></canvas></div></div>';

        body.innerHTML = html;
        wireDetail(c, op);
        renderTrend(c);
    }

    // The three states are genuinely different and the panel says which one applies:
    // confirmed / looked for and not seen / never looked.
    function liveRow(c) {
        // Own gap(): renderDetail declares a local one, and this function sits outside it, so
        // borrowing that name threw a ReferenceError that took the whole detail panel down.
        function gap(t) { return '<span class="src-gap">' + t + '</span>'; }
        if (!SiteCatalog.livenessLoaded()) {
            return gap('not checked — run tools/build-firms-liveness.js');
        }
        var l = SiteCatalog.livenessFor(c.id);
        if (!l) {
            var m = SiteCatalog.livenessMeta();
            return gap('not confirmed in the last ' + (m ? m.windowDays : 90) + ' days');
        }
        var d = SiteCatalog.daysSinceActive(c.id);
        return '<span class="src-burning">confirmed ' + (d <= 1 ? 'today' : d + ' days ago') + '</span>' +
               '<span class="src-sub2"> · ' + l.nights + ' nights, ' + esc(l.lastSeen) + '</span>';
    }

    function crmField(id, label, saved) {
        return '<div class="src-field"><label for="crm_' + id + '">' + label + '</label>' +
            '<input type="text" id="crm_' + id + '" value="' + esc(saved[id] || '') + '"></div>';
    }

    // A prospect becomes a tracked site the moment you save contact details against it. Match
    // on the discovery id so re-selecting the same flare finds what you already wrote.
    function findSavedSite(flareId) {
        var all = SiteData.list();
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === flareId || (all[i].discovery && all[i].discovery.flareId === flareId)) return all[i];
        }
        return null;
    }

    function wireDetail(c, op) {
        var rate = document.getElementById('aRate');
        // These edit the same values as the scenario bar; keeping one source of truth stops the
        // detail panel and the map colouring drifting apart.
        if (rate) rate.addEventListener('change', function() {
            var v = parseFloat(this.value);
            if (isFinite(v) && v >= 0) { _scn.powerRate = v; saveScenario(); syncScenarioInputs(); applyFilters(); renderDetail(); }
        });

        var showCo = document.getElementById('srcShowCompany');
        if (showCo) showCo.addEventListener('click', function() {
            _companyFilter = this.dataset.company;
            _ignoreNextDocClick = true;
            exitFocus(true);
            applyFilters();
        });

        var save = document.getElementById('srcSave');
        if (!save) return;
        save.addEventListener('click', function() {
            var changes = {
                contact_name:  document.getElementById('crm_contact_name').value.trim() || null,
                contact_role:  document.getElementById('crm_contact_role').value.trim() || null,
                contact_email: document.getElementById('crm_contact_email').value.trim() || null,
                contact_phone: document.getElementById('crm_contact_phone').value.trim() || null,
                contact_notes: document.getElementById('crm_contact_notes').value.trim() || null,
                stage: document.getElementById('crm_stage').value,
                // Operator identity is copied from the regulator index, never typed — keeping it
                // apart from the contact fields is what stops a guess acquiring the authority of
                // a filing.
                operator: op ? op.operator : null,
                operator_licence: op ? (op.licence || null) : null,
                operator_source: op ? op.source : null,
                operator_distance_m: op ? op.distance_m : null,
                // A real figure always beats the stage assumption in SiteCapex.
                estimated_acquisition_cost: (function() {
                    var el = document.getElementById('crm_acq');
                    if (!el || el.value === '') return null;
                    var v = parseFloat(el.value);
                    return isFinite(v) && v >= 0 ? v : null;
                })(),
                // The contact outcome lives in distress_signals alongside the inferred ones, so
                // one formula scores everything and the evidence panel explains it the same way.
                // Replaces any previous outcome rather than appending: asking twice and getting
                // a different answer is a correction, not two pieces of evidence.
                distress_signals: (function() {
                    var prev = (findSavedSite(c.id) || {}).distress_signals || [];
                    var kept = prev.filter(function(d) {
                        return d && !CONTACT_OUTCOMES[String(d.type || '').toLowerCase()];
                    });
                    var sel = document.getElementById('crm_outcome');
                    if (!sel || !sel.value) return kept;
                    var dEl = document.getElementById('crm_outcome_date');
                    kept.push({
                        type: sel.value,
                        date: (dEl && dEl.value) ? dEl.value : null,
                        source: 'told directly by the owner'
                    });
                    return kept;
                })()};
            var existing = findSavedSite(c.id);
            if (existing) {
                SiteData.update(existing.id, changes);
            } else {
                var site = SiteSources.toSite(c, changes);
                site.id = c.id;                       // keep the flare id so it is re-findable
                site.name = placeLabel(c);
                site.discovery = site.discovery || {};
                site.discovery.flareId = c.id;
                SiteData.add(site);
            }
            var msg = document.getElementById('srcSaveMsg');
            if (msg) { msg.textContent = 'Saved — syncs across your devices.'; msg.style.color = '#3ecf8e'; }
            // Contact fields feed the actionability component, so a saved phone number changes
            // the opportunity score. Drop the memoised scores or the table would keep showing
            // the pre-edit ranking.
            invalidateOpportunity();
            renderWorklist();
            renderList();
            renderTable();
        });
    }

    function renderTrend(c) {
        var el = document.getElementById('dTrend');
        if (!el || typeof Chart === 'undefined') return;
        if (_trendChart) { _trendChart.destroy(); _trendChart = null; }
        var meta = SiteCatalog.meta();
        // Per-year capacity history is source-specific, so it comes from sourceDetail. A source
        // that publishes none gets no chart rather than an empty axis implying zero output.
        var series = (c.sourceDetail && c.sourceDetail.kwByYear) || null;
        if (!series) { el.style.display = 'none'; return; }
        el.style.display = '';
        var light = isLightMode();
        _trendChart = new Chart(el, {
            type: 'bar',
            data: {
                labels: meta.years,
                datasets: [{
                    label: 'kW potential', data: series,
                    backgroundColor: 'rgba(247,147,26,0.5)', borderColor: '#f7931a', borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx) {
                        return ctx.raw === null ? 'not detected that year' : fmtKw(ctx.raw);
                    } } }
                },
                scales: {
                    x: { grid: { color: light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)' }, ticks: { color: light ? '#666' : '#888' } },
                    y: { grid: { color: light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)' },
                         ticks: { color: light ? '#666' : '#888',
                                  callback: function(v) { return v >= 1000 ? (v / 1000) + ' MW' : v + ' kW'; } } }
                }
            }
        });
    }

    function renderAbout() {
        var meta = SiteCatalog.meta();
        var om = SiteCatalog.operatorsMeta();
        var el = document.getElementById('srcAbout');
        if (!el) return;
        el.innerHTML =
            'Flare locations, volumes and detection frequencies come from the <strong>' + esc(meta.source) +
            '</strong> (' + meta.years[0] + '–' + meta.dataThrough + '), which is open and needs no account. ' +
            'Volumes convert to electrical potential at ' + meta.heatRateBtuPerKwh.toLocaleString('en-US') +
            ' BTU/kWh and ' + meta.gasBtuPerCf.toLocaleString('en-US') + ' BTU/cf — roughly 1 MMcf/day ≈ 4 MW. ' +
            'Sites below ' + meta.floorMcfd + ' Mcf/day are excluded; observations within ' + meta.epsilonM +
            ' m across years are treated as the same site.<br><br>' +
            '<strong>Ranking uses years-detected, not the satellite\'s detection frequency.</strong> ' +
            'Detection frequency tracks flare size far more than persistence — in this catalog onshore sites above ' +
            '2 MW average 51% detection frequency while those under 500 kW average 5.6%. Ranking on it would surface ' +
            'the biggest flares rather than the small persistent ones worth pursuing.<br><br>' +
            (om ? '<strong>Operators</strong> come from ' + esc(om.sources.AB) + ' and ' + esc(om.sources.US) +
                  ', matched to the nearest licensed well within ' + om.maxMatchM + ' m (' +
                  fmtInt(om.counts.matched) + ' of ' + fmtInt(om.counts.total) + ' sites). ' +
                  'Regulators publish the licensed company only — never a phone number or a person — so contact ' +
                  'details are yours to record.<br><br>'
                : '<strong>Operator index not loaded.</strong> Run <code>node tools/build-operator-index.js</code>.<br><br>') +
            '<strong>Volumes are dated ' + meta.dataThrough + '.</strong> ' +
            'A site burning through ' + meta.dataThrough + ' is very likely still burning, but this catalog cannot ' +
            'confirm today\'s activity, and no figure here is a vendor quote.';
    }

    // ---- boot ------------------------------------------------------------------------
    async function boot() {
        if (_booted) return;
        _booted = true;
        status('loading satellite catalog…');
        try {
            // Enrichment artifacts load first: the flare adapter's normalize() reads the operator
            // and liveness joins while building each candidate, so they must be in memory before
            // discovery runs or every candidate comes back unenriched.
            await SiteCatalog.loadOperators();
            await SiteCatalog.loadLiveness();
            // Discovery now goes through the adapter registry rather than straight to the flare
            // artifact, so every registered source contributes prospects to the same store.
            await ProspectStore.load();
            await loadMarket();
        } catch (e) {
            status('Could not load prospects: ' + e.message, '#f55');
            var l = document.getElementById('srcList');
            if (l) l.innerHTML = '<div class="src-empty">Prospects unavailable.<br>Run <code>node tools/build-flare-catalog.js</code>.</div>';
            return;
        }
        var meta = SiteCatalog.meta();

        // A source that failed or dropped rows is reported, not swallowed.
        var errs = ProspectStore.errors();
        if (errs.length) {
            status(errs.length + ' source' + (errs.length > 1 ? 's' : '') + ' failed: ' +
                   errs.map(function(e) { return e.source; }).join(', '), '#f55');
        }

        var sel = document.getElementById('fCountry');
        var list = ProspectStore.countries();
        for (var i = 0; i < list.length; i++) {
            var o = document.createElement('option');
            o.value = list[i].iso3;
            o.textContent = countryName(list[i].iso3) + ' (' + list[i].count + ')';
            sel.appendChild(o);
        }
        sel.value = 'CAN';                     // home market unless a previous search is restored

        ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort', 'fOnshore', 'fWorkable', 'fActive', 'fOperator', 'fBurning', 'fSmallOp', 'fRegion', 'fRadius'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', applyFilters);
        });
        // Dragging fires continuously, so the track repaints every frame for responsiveness
        // while the expensive re-rank is debounced.
        var sizeTimer = null;
        ['fMinKw', 'fMaxKw'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function() {
                paintSizeRange();
                renderSizeHint();
                clearTimeout(sizeTimer);
                sizeTimer = setTimeout(applyFilters, 160);
            });
        });
        paintSizeRange();
        document.getElementById('srcList').addEventListener('click', function(e) {
            // The portfolio tick is inside the row; treat it as its own control rather than
            // letting the click bubble on and focus the site.
            if (e.target && e.target.dataset && e.target.dataset.pf) {
                _ignoreNextDocClick = true;
                togglePortfolio(e.target.dataset.pf, e.target.checked);
                return;
            }
            if (e.target.closest('.pf-check')) return;
            var row = e.target.closest('.src-row');
            if (row) select(row.dataset.id);
        });
        document.getElementById('srcCount').addEventListener('click', function(e) {
            if (!e.target) return;
            if (e.target.id === 'srcUnfocus') exitFocus();
            if (e.target.id === 'srcClearCompany') { _companyFilter = null; applyFilters(); }
        });

        loadScenario();
        syncScenarioInputs();

        var scnTimer = null;
        ['scnBtc', 'scnHash', 'scnRate', 'scnCapex', 'scnTop'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function() {
                clearTimeout(scnTimer);
                scnTimer = setTimeout(function() {
                    readScenarioInputs();
                    syncScenarioInputs();
                    applyFilters();
                    if (_selectedId) renderDetail();
                }, 250);
            });
        });
        var colourSel = document.getElementById('scnColour');
        if (colourSel) colourSel.addEventListener('change', function() {
            _colourBy = this.value;
            try { localStorage.setItem('ionMiningProspectColour', _colourBy); } catch (e) {}
            syncScenarioInputs();
            renderMapLayer();
        });
        try {
            var savedColour = localStorage.getItem('ionMiningProspectColour');
            if (savedColour === 'margin' || savedColour === 'persistence') {
                _colourBy = savedColour;
                if (colourSel) colourSel.value = savedColour;
            }
        } catch (e) {}
        var resetBtn = document.getElementById('scnReset');
        if (resetBtn) resetBtn.addEventListener('click', function() { _ignoreNextDocClick = true; resetScenario(); });
        var clearBtn = document.getElementById('pfClear');
        if (clearBtn) clearBtn.addEventListener('click', function() {
            _ignoreNextDocClick = true;
            _portfolio = {};
            saveScenario();
            renderList();
            renderTable();
            renderPortfolio();
        });

        renderAbout();
        installDismiss();
        wireTable();
        wireViews();
        wireWorklist();
        wireSourceFilter();
        renderProvenance();
        wireProvenance();
        try {
            var savedSrc = JSON.parse(localStorage.getItem(SRC_FILTER_KEY) || 'null');
            if (savedSrc && savedSrc.ids && savedSrc.ids.length) {
                for (var si = 0; si < savedSrc.ids.length; si++) _srcFilter[savedSrc.ids[si]] = true;
            }
        } catch (e) {}
        renderSourceFilter();
        // Must run BEFORE restoreFilters: a <select> silently rejects a value that has no
        // matching option, so restoring "CA|Alberta" into an unpopulated list would leave the
        // control empty and the saved anchor would vanish on every reload.
        renderAnchorOptions();
        // Restore the previous search AFTER the country list is populated, so a saved country
        // can actually be matched against real options.
        var restored = restoreFilters();
        // Before applyFilters, which does the first renderTable — otherwise the table paints in
        // the default view and sort and then visibly rewrites itself.
        restoreView();
        applyFilters();
        // The detail panel is painted from the restored selection. applyFilters had to run first
        // so the table exists for the row to be highlighted in.
        if (_selectedId) renderDetail();

        var warn = [];
        if (!_market || !_market.btcPriceUsd) warn.push('BTC price');
        if (!_market || !_market.networkHashratePh) warn.push('network hashrate');

        if (warn.length) {
            status('Catalog loaded — ' + warn.join(' and ') + ' unavailable, economics incomplete', '#c85');
        } else if (restored) {
            // Say so explicitly: a restored search otherwise looks like the app ignored its own
            // defaults, and you cannot tell whether the filters are yours or stale.
            status('Restored your last search — ' + fmtInt(_filtered.length) + ' prospects of ' +
                   fmtInt(ProspectStore.all().length) + ' in catalog', '#8ac');
        } else {
            // Sourced from the store, not the flare artifact — with a second adapter registered
            // this line would otherwise under-report the catalog and still call it "flare sites".
            var srcs = ProspectStore.sources().filter(function(s) { return s.count > 0; });
            status(fmtInt(ProspectStore.all().length) + ' prospects from ' + srcs.length + ' source' +
                   (srcs.length === 1 ? '' : 's') + ' · survey ' + meta.years[0] + '–' + meta.dataThrough +
                   ' · ' + fmtInt(SiteCatalog.operatorCount()) + ' with a named operator', '#3ecf8e');
        }
    }

    // Called by map.js when a flare marker on the shared globe is clicked.
    function selectFromMap(id) { if (id) select(id, true); }

    return {
        boot: boot,
        selectFromMap: selectFromMap,
        applyFilters: applyFilters,
        exitFocus: exitFocus,
        clearMapLayer: clearMapLayer,
        renderMapLayer: renderMapLayer,
        isFocused: function() { return _focused; },
        // Exposed so tests exercise the real generator rather than a reimplementation of it —
        // a test that rebuilds the logic it is checking proves only that two copies agree.
        worklistCsv: worklistCsv,
        solidityFor: solidityFor,
        renderWorklist: renderWorklist,
        // Same reasoning as worklistCsv: a test that reimplements the scenario plumbing proves
        // only that two copies agree. This is the memoised evaluation the panel itself reads.
        evaluateAt: evaluateAt,
        select: select,
        filtered: function() { return _filtered; }
    };
})();
