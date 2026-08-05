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
    function evaluateAt(c) {
        var saved = findSavedSite(c.id) || {};
        var rate = (saved.power_rate !== null && saved.power_rate !== undefined && saved.power_rate !== '')
            ? saved.power_rate : scnVal('powerRate');
        var price = (saved.purchase_price_usd !== null && saved.purchase_price_usd !== undefined && saved.purchase_price_usd !== '')
            ? saved.purchase_price_usd : Math.round((c.powerPotentialKw || 0) * scnVal('costPerKw'));
        var top = (saved.take_or_pay_pct !== null && saved.take_or_pay_pct !== undefined && saved.take_or_pay_pct !== '')
            ? saved.take_or_pay_pct : (scnVal('takeOrPayPct') > 0 ? scnVal('takeOrPayPct') : null);

        var site = SiteSources.toSite(c, {
            purchase_price_usd: price,
            power_rate: rate,
            power_rate_currency: saved.power_rate_currency || 'USD',
            usable_kw: (saved.usable_kw !== null && saved.usable_kw !== undefined && saved.usable_kw !== '')
                ? saved.usable_kw : c.powerPotentialKw,
            take_or_pay_pct: top
        });
        return SiteEngine.evaluate(site, scenarioMarket());
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

    function saveScenario() {
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
    var FILTER_FIELDS = ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort'];
    var FILTER_CHECKS = ['fOnshore', 'fWorkable', 'fActive', 'fOperator', 'fBurning'];

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
            hasOperator: document.getElementById('fOperator').checked,
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
    function invalidateOpportunity() { _oppCache = {}; _acqCache = {}; _oppCtx = null; }

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
            countEl.textContent = fmtInt(rows.length) + ' prospect' + (rows.length === 1 ? '' : 's');
        }
        // Never truncate silently — a capped list that says nothing reads as "this is all of it".
        if (capEl) {
            capEl.textContent = rows.length > shown.length
                ? 'showing the top ' + shown.length + ' by ' + key + ' — narrow the filters to see further down'
                : '';
        }

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="11" class="src-gap" style="padding:14px;">' +
                (_tableView === 'acquisition'
                    ? 'No built assets match these filters. The acquisition view shows only ' +
                      'prospects at the constructed stage or later — try widening the country ' +
                      'or size filters, or switch back to all prospects.'
                    : 'No prospects match these filters.') + '</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < shown.length; i++) {
            var c = shown[i].candidate;
            var op = operatorRecord(c);
            var opp = opportunityFor(c);
            html += '<tr' + (c.id === _selectedId ? ' class="sel"' : '') + ' data-id="' + esc(c.id) + '">' +
                '<td class="name">' + esc(placeLabel(c)) + tierBadge(c.iso3) + '</td>' +
                '<td><span class="src-srcchip">' + esc(energyLabel(c)) + '</span></td>' +
                '<td>' + esc(c.iso3 || '--') + '</td>' +
                '<td class="num kw">' + fmtKw(c.powerPotentialKw) + '</td>' +
                '<td class="num">' + (c.dutyCyclePct === null ? '--' : c.dutyCyclePct + '%') + '</td>' +
                '<td class="num">' + (c.yearsSeen === null ? '--' : c.yearsSeen + '/' + (c.yearsTotal || '?')) + '</td>' +
                '<td>' + stageCell(c) + '</td>' +
                '<td class="num">' + (opp.score === null
                    ? '<span class="src-gap">--</span>'
                    : '<span class="src-oppcell">' + opp.score + '</span>' +
                      (opp.coverage < 100 ? ' <span class="src-covwarn">' + opp.coverage + '%</span>' : '')) + '</td>' +
                '<td class="num">' + acqCell(c) + '</td>' +
                '<td class="num">' + combinedCell(c) + '</td>' +
                '<td>' + (op && op.operator ? esc(op.operator)
                                            : '<span class="src-gap">not identified</span>') + '</td>' +
                '</tr>';
        }
        body.innerHTML = html;
    }

    function wireViews() {
        var bar = document.querySelector('.src-views');
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
                color: dim ? fade(colorFor(c), 0.18) : colorFor(c),
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
                    fillOpacity: isFocus ? 0.85 : (dimmed ? 0.10 : 0.45)
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
            if (c.permitState) {
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

        html += '<div class="src-detail"><div class="section-label">Derived capacity</div><dl>' +
            row('Power potential', fmtKw(c.powerPotentialKw)) +
            row('Miners supported', fmtInt(m.max_miners)) +
            row('Hashrate', m.total_hashrate_ph === null ? '--' : m.total_hashrate_ph.toFixed(1) + ' PH/s') +
            row('Monthly BTC', m.monthly_btc === null ? gap('needs network data') : m.monthly_btc.toFixed(4)) +
            row('Location', c.offshore === true ? '<span style="color:#e66;">offshore — not viable</span>' : 'onshore') +
            row('Jurisdiction', esc(j.label || countryName(c.iso3)) + ' ' + tierBadge(c.iso3)) +
            '</dl></div>';

        html += '<div class="src-detail"><div class="section-label">Economics <span class="src-assume">(your assumptions)</span></div><dl>' +
            row('Cash cost / BTC', m.cash_cost_per_btc === null ? gap('needs market data') : fmtUSD(m.cash_cost_per_btc)) +
            row('Break-even BTC', m.breakeven_btc_price === null ? gap('needs market data') : fmtUSD(m.breakeven_btc_price)) +
            row('Monthly net', m.monthly_net === null ? gap('needs market data') : fmtUSD(m.monthly_net)) +
            row('Total capital', m.total_capital === null ? '--' : fmtUSD(m.total_capital)) +
            row('Payback', m.payback_months === null ? gap('does not pay back') : m.payback_months.toFixed(1) + ' months') +
            '</dl><div class="src-assumerow">' +
            '<div class="src-field"><label for="aKw">Build $/kW</label><input type="number" id="aKw" value="' + _assume.costPerKw + '" step="25"></div>' +
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
            '<div class="src-field"><label for="crm_stage">Pipeline stage</label><select id="crm_stage">' +
            SiteData.STAGES.map(function(s) {
                return '<option value="' + s + '"' + ((saved.stage || 'unreviewed') === s ? ' selected' : '') + '>' + s + '</option>';
            }).join('') + '</select></div>' +
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
        var kw = document.getElementById('aKw'), rate = document.getElementById('aRate');
        // These edit the same values as the scenario bar; keeping one source of truth stops the
        // detail panel and the map colouring drifting apart.
        if (kw) kw.addEventListener('change', function() {
            var v = parseFloat(this.value);
            if (isFinite(v) && v >= 0) { _scn.costPerKw = v; saveScenario(); syncScenarioInputs(); applyFilters(); renderDetail(); }
        });
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
                operator_distance_m: op ? op.distance_m : null
            };
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

        ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort', 'fOnshore', 'fWorkable', 'fActive', 'fOperator', 'fBurning'].forEach(function(id) {
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
        // Restore the previous search AFTER the country list is populated, so a saved country
        // can actually be matched against real options.
        var restored = restoreFilters();
        applyFilters();

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
        filtered: function() { return _filtered; }
    };
})();
