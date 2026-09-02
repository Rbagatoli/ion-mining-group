// ===== PROTON MINING — Prospects mode on the Map page =====
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
    // The same drill-down, by the registry's own key where one exists. Matching on the NAME
    // alone merges the four US utility names that belong to two different companies -- the
    // Rahway Merck plant used to drag in the Elkton one -- which is this project's own banned
    // name-matching pattern turned inward.
    var _companyFilterId = null;

    var MINER_WATTS = SiteEngine.DEFAULT_CONFIG.minerWatts;

    // Assumptions used to price a prospect. NOT vendor quotes — nobody has quoted these sites —
    // so they are editable and labelled as assumptions wherever they feed a number. Defaults
    // come from Proton's own Alberta deals ($450/kW usable, ~$0.035/kWh).
    var _assume = { costPerKw: 450, powerRate: 0.035 };

    /* $1.2M / $840K, for a 250-row list where '$1,204,500' per row is noise. One decimal under
       ten of a unit, none above — '$12.0M' is false precision dressed as care. */
    function fmtUsdCompact(v) {
        if (v === null || v === undefined || !isFinite(v)) return '--';
        var a = Math.abs(v), sign = v < 0 ? '-' : '';
        if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
        if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'K';
        return sign + '$' + Math.round(a);
    }
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
    // Power prices need four decimals — the difference between $0.035 and $0.0347 is the whole
    // negotiation, and two decimals would render both as $0.03.
    function fmtRate(n) {
        if (n === null || n === undefined || !isFinite(n)) return '--';
        return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(4) + '/kWh';
    }
    function status(msg, color) {
        var el = document.getElementById('srcStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.style.color = color || 'var(--text-dim)';
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

    /* THE THUMBS NO LONGER CROSS.
     *
     * sizeBounds() reads the pair with Math.min/Math.max, so dragging the minimum
     * past the maximum did not error -- it silently swapped which input meant
     * which. On screen the thumb under your finger stopped moving and the other
     * one started, which is the single most disorienting thing a dual slider can
     * do. Pushing the other thumb along instead is what every well-behaved range
     * control does, and it keeps the invariant the rest of the code assumes.
     */
    function clampThumbs(movedId) {
        var lo = document.getElementById('fMinKw'), hi = document.getElementById('fMaxKw');
        if (!lo || !hi) return;
        var a = parseFloat(lo.value), b = parseFloat(hi.value);
        if (!isFinite(a) || !isFinite(b) || a <= b) return;
        if (movedId === 'fMinKw') hi.value = String(a);
        else lo.value = String(b);
    }

    /* WHICH THUMB IS ON TOP has to depend on where they are.
     *
     * Both inputs cover the whole track, so where the thumbs overlap the one
     * painted last takes every grab. Pinning the minimum above the maximum fixes
     * the overlap at the top of the range and creates a worse trap at the bottom:
     * with both parked at 0 you always grab the minimum, and clampThumbs drags
     * the maximum with it, so a range collapsed to zero can never be widened
     * again with a mouse. Pinning the maximum has the mirror problem at 5 MW.
     *
     * The minimum is lifted only once it is past the midpoint — i.e. once it is
     * in the half of the track where a grab is more likely to be meant for it.
     * At rest (0 and 5000) the maximum is on top and both are far apart, so it
     * costs nothing; collapsed at either end, the thumb that can still move is
     * the one you get.
     */
    function liftNearestThumb() {
        var lo = document.getElementById('fMinKw'), hi = document.getElementById('fMaxKw');
        if (!lo || !hi) return;
        var a = parseFloat(lo.value);
        var minOnTop = isFinite(a) && a >= SIZE_MAX_KW / 2;
        lo.style.zIndex = minOnTop ? '3' : '1';
        hi.style.zIndex = minOnTop ? '1' : '3';
    }

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
    var SCN_KEY = 'protonMiningProspectScenario';
    var _live = null;
    var _scn = {};              // sparse: only the fields actually overridden
    var _portfolio = {};        // id -> true
    var PF_KEY = 'protonMiningProspectPortfolio';

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
            ? saved.usable_kw : usableKwFor(c);
        var probe = SiteEngine.evaluate(SiteSources.toSite(c, {
            purchase_price_usd: 0, power_rate: rate, usable_kw: usable
        }), scenarioMarket());

        // THE MARKET REACHES THE ALL-IN, at last. stack() has accepted ctx.market since the
        // used-rate card shipped, and nothing here ever passed it -- so the used/new toggle
        // moved the avoided panel while every all-in figure quietly stayed priced new. The
        // resolved market is taken from capitalFor() rather than from _capMarket directly so
        // the two panels share ONE resolution, including the auto default that prices shutdown
        // equipment used: two views disagreeing about which market they are in is exactly the
        // seam this line closes.
        var capForMarket = capitalFor(c);
        var capex = (typeof SiteCapex !== 'undefined')
            ? SiteCapex.stack(Object.assign({}, c, saved), {
                capacityKw: usable,
                minerCapexUsd: probe.miner_capex_usd,
                acquisitionUsd: savedPrice,
                market: (capForMarket && capForMarket.market) || _capMarket || undefined,
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
                ? saved.usable_kw : usableKwFor(c),
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
    // True while nothing on screen is priced off a real, recorded term.
    //
    // This used to test only power_rate and purchase_price_usd — neither of which anything in
    // the app could write — so it returned true unconditionally and the scenario bar permanently
    // told the user to record terms through a UI that did not permit it. estimated_acquisition_cost
    // WAS writable the whole time and was not checked.
    function allTermsAssumed() {
        for (var i = 0; i < _filtered.length && i < 400; i++) {
            var s = findSavedSite(_filtered[i].candidate.id);
            if (!s) continue;
            if (s.power_rate || s.purchase_price_usd || s.estimated_acquisition_cost ||
                s.quoted_rate || s.generator_ownership) return false;
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
            var scn = { _v: 1, scn: _scn };
            var pf  = { _v: 1, ids: Object.keys(_portfolio) };
            localStorage.setItem(SCN_KEY, JSON.stringify(scn));
            localStorage.setItem(PF_KEY, JSON.stringify(pf));
            // Both keys were added to SYNC_KEYS earlier in the belief that registering them was
            // enough. It is not: SyncEngine.save is only ever called explicitly, so the shortlist
            // and the pricing assumptions have never actually left this machine.
            if (typeof SyncEngine !== 'undefined') {
                SyncEngine.save('prospectScenario', scn);
                SyncEngine.save('prospectPortfolio', pf);
            }
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
    var FILTER_KEY = 'protonMiningProspectFilters';
    // fRegion and fRadius are deliberately ABSENT. "I need power near Y" is a search you perform,
    // not a standing preference like your home country — and persisting it did real damage: a
    // region saved in one session overrode the country on the next load, the reconcile then saved
    // that country back, and the user's actual choice was silently overwritten for good. The
    // anchor starts at "Anywhere" every session, which makes that failure impossible rather than
    // merely unlikely.
    var FILTER_FIELDS = ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort', 'fSearch'];
    var SRC_FILTER_KEY = 'protonMiningProspectSources';
    // The four scope controls were removed from this list IN THE SAME CHANGE that removed the
    // markup, deliberately. searchKey() builds its key from FILTER_CHECKS on both sides: leave an
    // id here with no control and captureSearch() skips it, so the key part becomes fWorkable=0
    // while every stored search still carries fWorkable=1 -- and those chips never light up
    // again. Removing from both sides keeps old and new keys consistent.
    var FILTER_CHECKS = ['fActive', 'fOperator', 'fBurning', 'fAcquisition'];
    // Filters survived a reload but the rest of the view did not, so a refresh still landed you
    // on a differently-sorted table with the open site closed. Same reasoning as the filters:
    // local only, never synced.
    var VIEW_KEY = 'protonMiningProspectView';

    function saveView() {
        try {
            localStorage.setItem(VIEW_KEY, JSON.stringify({
                _v: 1, sort: _tableSort, sel: _selectedId
            }));
        } catch (e) { /* private mode / quota */ }
    }

    function saveFilters() {
        try {
            /* NOT A DOM CONTROL, so the loops below cannot see it and it used to be
               dropped on every reload. That silently turned "Landfill gas with the
               engine still standing" -- which is DEFINED by the engine still
               standing -- into "landfill gas in this size band", nearly double the
               rows, including every site with no generator on it. The saved-search
               path has always carried it as s.hasGen; the last-used path did not.
               Same field name, so the two agree. */
            var out = { _v: 1, company: _companyFilter, hasGen: !!_hasGenFilter,
                        /* Same reason as hasGen above: not a DOM control, so the field loops
                           below cannot see it and it would be dropped on every reload. */
                        collection: Object.keys(_collFilter) };
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
        /* undefined reads as off, which is right for a search saved before this
           was persisted -- the clause was not recorded, so it cannot be claimed. */
        _hasGenFilter = !!saved.hasGen;
        // Restored the same way, and defensively: an older saved blob has no
        // collection key at all, which must mean "no filter" rather than throwing.
        _collFilter = {};
        if (Array.isArray(saved.collection)) {
            saved.collection.forEach(function(k) { _collFilter[k] = true; });
        }
        return true;
    }

    // ---- filters --------------------------------------------------------------------
    // Which sources are selected. An EMPTY set means all of them, so the default behaviour is
    // unchanged for anyone who never touches this control, and a newly registered adapter is
    // included rather than silently excluded.
    var _srcFilter = {};

    /* Two of the three checkboxes are flare-only by nature: only VIIRS publishes a
       survey year, and only VIIRS gets checked against FIRMS. Ticking either one
       while looking at landfills is guaranteed to return nothing, and it used to
       do so silently — the labels carried a title attribute saying so, which is
       a tooltip nobody reads.
       The third, "only sites with a named operator", does apply to landfills: the
       LMOP owner is read as the operator. But 1,902 of 1,908 landfills have one,
       so it removes six rows and creates a false impression of having narrowed
       something. That is the same reasoning this file already applied when it
       deleted the collection-system filter.
       So all three hide when no flare source is in scope — unless one is TICKED,
       in which case it stays visible. Hiding a live filter is the one thing worse
       than showing an irrelevant one. */
    function flareInScope() {
        if (typeof ProspectStore === 'undefined') return true;
        var keys = Object.keys(_srcFilter || {});
        if (!keys.length) return true;              // empty means every source
        for (var i = 0; i < keys.length; i++) {
            if (String(keys[i]).indexOf('flare') >= 0) return true;
        }
        return false;
    }

    function renderFlareOnlyChecks() {
        var wrap = document.getElementById('srcFlareChecks');
        if (!wrap) return;
        var live = flareInScope();
        var ids = ['fOperator', 'fActive', 'fBurning'];
        var anyTicked = false;
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && el.checked) anyTicked = true;
        }
        wrap.hidden = !(live || anyTicked);
        var note = document.getElementById('srcFlareChecksNote');
        if (note) {
            note.textContent = (!live && anyTicked)
                ? 'These apply to flare-gas prospects only, and no flare source is selected.'
                : '';
        }
    }

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

    /* THE COLLECTION FACET. Same shape as the source picker above it: no selection means every
       value, and clicking toggles one on.

       LANDFILL ONLY, and hidden when no landfill source is in scope -- a flare has no wells and
       the control would filter the entire flare set to nothing if it were live. It follows the
       rule renderFlareOnlyChecks() already established for the flare-only checkboxes: hide when
       irrelevant, but NEVER hide while one of its buttons is active, because a live filter the
       user cannot see is worse than an irrelevant one. */
    var _collFilter = {};

    function landfillInScope() {
        if (typeof ProspectStore === 'undefined') return true;
        var keys = Object.keys(_srcFilter || {});
        if (!keys.length) return true;              // empty means every source
        for (var i = 0; i < keys.length; i++) {
            if (String(keys[i]).indexOf('landfill') >= 0) return true;
        }
        return false;
    }

    function renderCollectionFilter() {
        var el = document.getElementById('fCollection');
        if (!el) return;
        var active = Object.keys(_collFilter).length > 0;
        if (!landfillInScope() && !active) { el.hidden = true; el.innerHTML = ''; return; }

        // Counts come from the FULL landfill population rather than the current result set, so
        // the numbers do not move underneath the reader as other filters narrow.
        var all = (typeof ProspectStore !== 'undefined' && ProspectStore.loaded())
            ? ProspectStore.all() : [];
        var counts = { installed: 0, shutdown: 0, none: 0 };
        for (var i = 0; i < all.length; i++) {
            if (all[i].energyType !== 'landfill_gas') continue;
            var st = collectionStatusOf(all[i]);
            if (st && counts[st] !== undefined) counts[st]++;
        }
        if (!counts.installed && !counts.shutdown && !counts.none) {
            el.hidden = true; el.innerHTML = ''; return;
        }
        var order = ['shutdown', 'installed', 'none'];   // best capital position first
        var h = '<span class="src-collbtn-label"></span>';
        h = '';
        for (var k = 0; k < order.length; k++) {
            var key = order[k];
            if (!counts[key]) continue;
            h += '<button type="button" class="src-collbtn' + (_collFilter[key] ? ' on' : '') +
                 '" data-coll="' + key + '" title="Gas collection: ' + COLLECTION_LABEL[key] + '">' +
                 COLLECTION_LABEL[key] + '<span class="n">' + fmtInt(counts[key]) + '</span></button>';
        }
        el.hidden = false;
        el.innerHTML = h;
    }

    function wireCollectionFilter() {
        var el = document.getElementById('fCollection');
        if (!el) return;
        el.addEventListener('click', function(e) {
            var b = e.target.closest('.src-collbtn');
            if (!b) return;
            var key = b.getAttribute('data-coll');
            if (_collFilter[key]) delete _collFilter[key]; else _collFilter[key] = true;
            renderCollectionFilter();
            saveFilters();
            applyFilters('collection');
        });
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
            renderCollectionFilter();
            saveFiltersSources();
            applyFilters();
        });
    }

    // ---- Operating scope ------------------------------------------------------------------
    //
    // Proton operates in mainland USA and Canada. That is a business fact, not a search preference,
    // so it is a constant here rather than four checkboxes the user has to keep set correctly.
    //
    // Measured against the shipped artifacts, this is what the scope is worth:
    //     whole catalog                             30,361
    //     old shipped default (onshore + workable)  21,553
    //     mainland USA + Canada                     19,397
    // being 6,721 US onshore flares, 1,003 Canadian onshore flares, 9,765 EIA facilities and
    // 1,908 LMOP landfills.
    //
    // Three controls died with it rather than being hidden:
    //   - "Workable jurisdictions only" was MOOT. It existed because the flare catalog spans
    //     Russia, Iran and Venezuela; USA and CAN are both `preferred` tier, so inside this scope
    //     it excluded nothing. The tier constant stays below because prospect-store.js still
    //     reads it and jurisdictions.js is still what makes it true.
    //   - "Onshore only" is now part of the word MAINLAND. It removes 84 Gulf of Mexico flares.
    //   - "Small operators only (Alberta)" collapsed the catalog to 64 sites, all Alberta,
    //     deleting every landfill and every US facility. A 0.2% slice behind a checkbox.
    //
    // The data is NOT rebuilt. data/flare-catalog.json keeps all 18,688 rows and the 10,880
    // rest-of-world flares are excluded by this constant alone, so widening the scope later is a
    // one-line change rather than a pipeline run.
    var SCOPE_ISO3 = ['USA', 'CAN'];
    var SCOPE_TIERS = ['preferred', 'workable'];

    // "Generation already on site" survives as a filter without surviving as a control: the
    // `restart` and `landfill` starting points both depend on it and their labels would be lies
    // without it. setCheck() is null-safe, so had this stayed a DOM read the checkbox's removal
    // would have silently no-opped and left both starters returning a much larger, wholly
    // undifferentiated pool while still claiming a generator was standing.
    var _hasGenFilter = false;

    function currentFilters() {
        var meta = SiteCatalog.meta();
        var size = sizeBounds();
        var minYears = parseInt(document.getElementById('fYears').value, 10);
        /* The country, near and within controls were removed: the operating scope
           is mainland USA and Canada, both are always in it, and a radius from a
           province centroid is not a region — the control said so on its own
           label. Three inputs that between them narrowed almost nothing were
           three of the twelve that made the page feel like a control panel.
           Read defensively rather than deleted from the chain, because the scope
           filter and the saved-search restore both still speak this vocabulary
           and a future control could put it back. */
        var isoEl = document.getElementById('fCountry');
        var iso = (isoEl && isoEl.value) ? isoEl.value : null;
        var searchEl = document.getElementById('fSearch');
        return {
            /* Free text over name, operator, county, city, state and the record ids -- the
               store's haystack was extended to match what a person actually types. Null when
               blank so the facet costs nothing. */
            search: (searchEl && searchEl.value.trim()) ? searchEl.value.trim() : null,
            collection: Object.keys(_collFilter),
            iso3: iso,
            // Applied whenever no single country is chosen. With one chosen, iso3 already
            // narrows harder than the scope does and the two would be redundant.
            iso3In: iso ? null : SCOPE_ISO3,
            minKw: size.min,
            maxKw: size.max,
            minYearsSeen: minYears > 0 ? minYears : null,
            onshoreOnly: true,
            activeThrough: document.getElementById('fActive').checked && meta ? meta.dataThrough : null,
            tiers: SCOPE_TIERS,
            sources: Object.keys(_srcFilter).length ? Object.keys(_srcFilter) : null,
            hasOperator: document.getElementById('fOperator').checked,
            anchor: currentAnchor(),
            confirmedBurning: (function() {
                var el = document.getElementById('fBurning');
                return !!(el && el.checked);
            })(),
            acquisitionOnly: (function() {
                var el = document.getElementById('fAcquisition');
                return !!(el && el.checked);
            })(),
            hasGeneration: _hasGenFilter
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

    // ---- What is actually switched on ----------------------------------------------------
    //
    // An empty result used to print a fixed guess — "try a lower minimum size, or turn off the
    // jurisdiction / operator filters" — which named filters that were often not responsible and
    // never mentioned the ones that were. This enumerates the real state instead, so a screen
    // showing nothing can always be read.
    var FILTER_DEFAULTS = {
        fMinKw: '0', fMaxKw: '5000', fYears: '0',
        /* 'combined' -- the acquisition rank -- not 'persistence'. Persistence is a flare-survey
           metric that saturates on landfills: 1,273 of 1,908 tie at 100, so the shipped default
           opened on giant OPERATING landfills while only 60 of 683 shutdown projects -- the
           business's actual target class -- reached the visible top 250. The combined axis is
           the one whose own comment says it answers "what could I actually buy". */
        fSort: 'combined',
        fSearch: '',
        fRegion: '', fRadius: '250',
        fActive: false, fOperator: false, fBurning: false,
        fAcquisition: false
    };
    var FILTER_LABELS = {
        fMinKw: 'Minimum size', fMaxKw: 'Maximum size', fYears: 'Persistence',
        fSort: 'Ranked by', fRadius: 'Search radius',
        fSearch: 'Search',

        fActive: 'Flare seen in the latest survey',
        fOperator: 'Only sites with a named operator',
        fBurning: 'Flare confirmed burning recently',
        fAcquisition: 'Acquisition targets only'
    };

    // [{ key, label, clear }] for every filter not at its default.
    function activeFilters() {
        var out = [];
        function el(id) { return document.getElementById(id); }

        // Country is listed whenever it is set, even though CAN is the default: it is the most
        // consequential filter on the page and the one most likely to be hiding what is sought.
        var c = el('fCountry');
        if (c && c.value) {
            out.push({ key: 'fCountry', label: 'Country: ' + countryName(c.value),
                       clear: function() { c.value = ''; } });
        }

        var r = el('fRegion');
        if (r && r.value) {
            var a = currentAnchor();
            out.push({ key: 'fRegion',
                       label: 'Near: ' + (a ? a.name + ', within ' + fmtInt(a.km) + ' km' : r.value),
                       clear: function() { r.value = ''; } });
        }

        var sizeMin = el('fMinKw'), sizeMax = el('fMaxKw');
        if (sizeMin && sizeMin.value !== FILTER_DEFAULTS.fMinKw) {
            out.push({ key: 'fMinKw', label: 'Minimum size: ' + fmtKw(parseFloat(sizeMin.value)),
                       clear: function() { sizeMin.value = FILTER_DEFAULTS.fMinKw; paintSizeRange(); renderSizeHint(); } });
        }
        if (sizeMax && sizeMax.value !== FILTER_DEFAULTS.fMaxKw) {
            out.push({ key: 'fMaxKw', label: 'Maximum size: ' + fmtKw(parseFloat(sizeMax.value)),
                       clear: function() { sizeMax.value = FILTER_DEFAULTS.fMaxKw; paintSizeRange(); renderSizeHint(); } });
        }

        /* The search chip: of every control on the page this is the one most likely to be
           quietly hiding what is sought, which is the exact bar activeFilters sets for
           listing fCountry. */
        var se = el('fSearch');
        if (se && se.value.trim()) {
            out.push({ key: 'fSearch', label: 'Search: “' + se.value.trim() + '”',
                       clear: function() { se.value = ''; } });
        }

        // fSort is deliberately absent: a sort order hides nothing, so offering to clear it on an
        // empty screen would send the user after a control that cannot be the cause.
        // fRadius is absent too when no region is set — without an anchor it filters nothing.
        ['fYears', 'fRadius'].forEach(function(id) {
            var e = el(id);
            if (!e || String(e.value) === FILTER_DEFAULTS[id]) return;
            if (id === 'fRadius') return;        // already described inside the fRegion chip
            var shown = e.options && e.selectedIndex >= 0
                ? e.options[e.selectedIndex].text : e.value;
            out.push({ key: id, label: FILTER_LABELS[id] + ': ' + shown,
                       clear: function() { e.value = FILTER_DEFAULTS[id]; } });
        });

        // Listed when CHECKED, not when different from the default — every one of these six
        // excludes prospects when it is on and excludes nothing when it is off.
        //
        // Onshore and Workable are ON by default, so a "non-default" rule got this exactly
        // backwards: it stayed silent about the two filters most likely to be responsible and
        // instead offered to re-enable them. Measured on the real catalog, Russia returns zero
        // with nothing but the defaults set, purely because it is not a workable jurisdiction —
        // and the old empty state could not say so.
        //
        // fAcquisition joined this list when it stopped being a table tab. It removes more
        // prospects than anything else here and, as a tab, appeared in none of these reports.
        ['fActive', 'fOperator', 'fBurning', 'fAcquisition'].forEach(function(id) {
            var e = el(id);
            if (!e || !e.checked) return;
            out.push({ key: id, label: FILTER_LABELS[id],
                       clear: function() {
                           e.checked = false;
                           // Its sort default came with it, so clearing from the bar has to undo
                           // that too, or the table stays ranked on a combination nothing selects.
                           if (id === 'fAcquisition') {
                               _tableSort = { key: 'opportunity', dir: -1 };
                               paintTableHead();
                           }
                       } });
        });

        // These two live outside the form and were never mentioned by the old message at all.
        var srcIds = Object.keys(_srcFilter);
        if (srcIds.length) {
            out.push({ key: 'sources', label: 'Sources: ' + srcIds.length + ' of ' +
                           ProspectStore.sources().length + ' selected',
                       clear: function() { _srcFilter = {}; renderSourceFilter(); saveFiltersSources(); } });
        }
        if (_companyFilter) {
            out.push({ key: 'company', label: 'Operator: ' + _companyFilter,
                       clear: function() { _companyFilter = null; _companyFilterId = null; } });
        }
        return out;
    }

    function resetAllFilters() {
        var c = document.getElementById('fCountry');
        if (c) c.value = '';
        for (var id in FILTER_DEFAULTS) {
            var e = document.getElementById(id);
            if (!e) continue;
            if (typeof FILTER_DEFAULTS[id] === 'boolean') e.checked = FILTER_DEFAULTS[id];
            else e.value = FILTER_DEFAULTS[id];
        }
        _srcFilter = {};
        _companyFilter = null;
        _companyFilterId = null;
        // Not a DOM control any more, so resetFilterControls has to clear it explicitly or a
        // starting point's filter would outlive the starting point.
        _hasGenFilter = false;
        renderSourceFilter();
        renderCollectionFilter();
        paintSizeRange();
        renderSizeHint();
        saveFilters();
        saveFiltersSources();
        applyFilters();
    }

    // The always-on bar under the filters. Renders whether or not anything matched, because the
    // question "why am I not seeing what I expect" is asked far more often than the page is
    // literally empty — a 250 km circle around Texas and a country of USA both look like a
    // working app right up until you wonder where Alberta went.
    function renderActiveBar() {
        var el = document.getElementById('srcActiveBar');
        if (!el) return;
        var act = activeFilters();
        if (!act.length) { el.innerHTML = ''; return; }
        var h = '<span class="src-activelabel">Filtering by</span>';
        for (var i = 0; i < act.length; i++) {
            h += '<button type="button" class="src-fchip" data-fkey="' + esc(act[i].key) + '">' +
                 esc(act[i].label) + '<span class="x">&times;</span></button>';
        }
        h += '<button type="button" class="src-resetall" data-fkey="__all__">Clear all</button>';
        el.innerHTML = h;
    }

    // ---- Saved searches -------------------------------------------------------------------
    // A named filter combination you can get back to. Twelve controls across two panels is a
    // configuration, and rebuilding "Alberta flare gas, 1-3 MW, seen every year" by hand
    // every Monday is the kind of friction that stops a search being run at all.
    //
    // These DO sync: unlike the last-used filters — which are where you happen to be looking and
    // should not jump between devices — a saved search is a considered piece of work.
    var SEARCH_KEY = 'protonMiningProspectSearches';
    var MAX_SEARCHES = 40;
    var _searches = [];
    var _naming = false;              // the inline name field is open

    function loadSearches() {
        try {
            var raw = JSON.parse(localStorage.getItem(SEARCH_KEY) || 'null');
            if (!raw || raw._v !== 1 || !Array.isArray(raw.items)) return;
            _searches = raw.items.filter(function(s) {
                return s && typeof s.id === 'string' && typeof s.name === 'string' && s.f;
            });
        } catch (e) { _searches = []; }
    }

    function persistSearches() {
        try {
            var payload = { _v: 1, items: _searches };
            localStorage.setItem(SEARCH_KEY, JSON.stringify(payload));
            // Registering the key in SYNC_KEYS is not enough — SyncEngine.save is only ever called
            // explicitly, per key, and nothing else in this file calls it. Without this line the
            // comment above would be describing a sync that never happens, which under this
            // project's own rules is the defect, not a missing nicety.
            if (typeof SyncEngine !== 'undefined') SyncEngine.save('prospectSearches', payload);
            return true;
        } catch (e) {
            // Say so. A saved search that silently was not saved is worse than no feature: you
            // would rebuild the filters believing they were kept.
            status('Could not save — browser storage is full or unavailable.', 'var(--warn)');
            return false;
        }
    }

    // Everything that decides WHICH prospects match, and nothing that decides how they are shown.
    // The anchor IS included, unlike in the last-used filters: it was excluded there because it
    // restored itself silently at boot and overwrote a chosen country. Recalling a saved search
    // is an explicit act, so "power near Midland" can be a search you keep.
    // NOT captured: the operator drill-down (_companyFilter), which is a click-through from one
    // site rather than a search, and the table's sort and view, which are display state.
    function captureSearch() {
        var f = {};
        FILTER_FIELDS.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) f[id] = el.value;
        });
        FILTER_CHECKS.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) f[id] = !!el.checked;
        });
        var reg = document.getElementById('fRegion');
        var rad = document.getElementById('fRadius');
        return {
            f: f,
            // Carried on its own key because it is no longer a checkbox for FILTER_CHECKS to
            // walk. Without this a saved "landfill shortlist" would restore as every landfill
            // regardless of whether a generator is standing -- a clause dropped in silence,
            // which is exactly what the missing[] report exists to prevent.
            hasGen: !!_hasGenFilter,
            sources: Object.keys(_srcFilter).sort(),
            region: reg ? reg.value : '',
            radius: rad ? rad.value : ''
        };
    }

    // Built by walking FILTER_FIELDS/FILTER_CHECKS in order rather than stringifying the object,
    // so a stored search still compares equal after the field list is reordered in a later build.
    function searchKey(s) {
        var f = s.f || {};
        var parts = [];
        FILTER_FIELDS.forEach(function(id) { parts.push(id + '=' + (f[id] === undefined ? '' : f[id])); });
        FILTER_CHECKS.forEach(function(id) { parts.push(id + '=' + (f[id] ? '1' : '0')); });
        parts.push('gen=' + (s.hasGen ? '1' : '0'));
        parts.push('src=' + (s.sources || []).slice().sort().join(','));
        parts.push('region=' + (s.region || ''));
        // A radius with no region filters nothing, so it must not make two identical searches
        // compare as different — otherwise the chip fails to light up for an invisible reason.
        parts.push('radius=' + (s.region ? (s.radius || '') : ''));
        return parts.join('|');
    }

    function optionExists(el, val) {
        if (!el || el.tagName !== 'SELECT') return true;
        for (var i = 0; i < el.options.length; i++) if (el.options[i].value === val) return true;
        return false;
    }

    // Applies what it can and NAMES what it could not. A catalog rebuild can retire a country or
    // an adapter; silently falling back would leave the chip lit beside a result set that is not
    // the search it claims to be.
    function applySearch(s) {
        var missing = [];
        FILTER_FIELDS.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || s.f[id] === undefined) return;
            if (el.tagName === 'SELECT' && !optionExists(el, s.f[id])) {
                if (s.f[id] !== '') missing.push(el.id === 'fCountry' ? 'country "' + s.f[id] + '"' : id);
                el.value = '';                       // widen rather than keep an unrelated value
                return;
            }
            el.value = s.f[id];
        });
        FILTER_CHECKS.forEach(function(id) {
            var el = document.getElementById(id);
            if (el && s.f[id] !== undefined) el.checked = !!s.f[id];
        });

        var reg = document.getElementById('fRegion');
        if (reg) {
            if (s.region && !optionExists(reg, s.region)) { missing.push('region "' + s.region + '"'); reg.value = ''; }
            else reg.value = s.region || '';
        }
        var rad = document.getElementById('fRadius');
        if (rad && s.radius) rad.value = s.radius;

        // Only sources that still exist. All of them gone means "every source", which is what an
        // empty set already means — not an empty screen.
        var live = {};
        (ProspectStore.sources() || []).forEach(function(x) { live[x.id] = true; });
        var keep = (s.sources || []).filter(function(id) { return live[id]; });
        if ((s.sources || []).length && keep.length < s.sources.length) {
            missing.push((s.sources.length - keep.length) + ' source' +
                         (s.sources.length - keep.length === 1 ? '' : 's') + ' no longer in the catalog');
        }
        _srcFilter = {};
        keep.forEach(function(id) { _srcFilter[id] = true; });

        _companyFilter = null;
        _companyFilterId = null;
        // RESTORED from the saved search, not merely cleared: a search saved with the generation
        // clause on must come back with it on. A search saved before this key existed has it
        // undefined, which correctly reads as off.
        _hasGenFilter = !!s.hasGen;
        renderSourceFilter();
        renderCollectionFilter();
        paintSizeRange();
        renderSizeHint();
        saveFilters();
        saveFiltersSources();
        applyFilters();

        if (missing.length) {
            status('Applied "' + s.name + '" — but ' + missing.join(', ') + ' could not be restored.', 'var(--warn)');
        } else {
            status('Applied "' + s.name + '" — ' + fmtInt(_filtered.length) + ' prospects.', 'var(--plat-200)');
        }
    }

    function applySearchById(id) {
        for (var i = 0; i < _searches.length; i++) {
            if (_searches[i].id === id) { applySearch(_searches[i]); return; }
        }
    }

    function deleteSearch(id) {
        var idx = -1;
        for (var i = 0; i < _searches.length; i++) if (_searches[i].id === id) idx = i;
        if (idx < 0) return;
        // No undo, so ask. Rebuilding a twelve-control search from memory is exactly the work
        // this feature exists to avoid.
        if (!confirm('Delete the saved search "' + _searches[idx].name + '"?')) return;
        _searches.splice(idx, 1);
        persistSearches();
        renderSaved();
    }

    function commitSave() {
        var inp = document.getElementById('savedNameInput');
        var name = inp ? inp.value.trim().slice(0, 60) : '';
        if (!name) { status('Give the search a name first.', 'var(--warn)'); return; }
        var next = captureSearch();
        next.name = name;
        next.at = new Date().toISOString().slice(0, 10);

        // Saving under a name you already used UPDATES that search. Two chips with the same label
        // would be indistinguishable, and "update" is the operation you actually want after
        // tweaking a filter on a search you had already saved.
        var existing = -1;
        for (var i = 0; i < _searches.length; i++) {
            if (_searches[i].name.toLowerCase() === name.toLowerCase()) existing = i;
        }
        if (existing >= 0) {
            if (!confirm('Replace the saved search "' + _searches[existing].name +
                         '" with the filters currently in force?')) return;
            next.id = _searches[existing].id;
            _searches[existing] = next;
        } else {
            if (_searches.length >= MAX_SEARCHES) {
                status('That is ' + MAX_SEARCHES + ' saved searches — delete one first.', 'var(--warn)');
                return;
            }
            next.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            _searches.push(next);
        }
        _naming = false;
        if (persistSearches()) status('Saved "' + name + '".', 'var(--plat-200)');
        renderSaved();
    }

    // The landfill shortlist, as filters rather than as a magic list.
    //
    // NOTE what this does NOT do: reach 10-15 sites. Measured against the real artifact, the
    // tightest defensible combination -- shutdown project, generator already installed, landfill
    // open or closed within five years, still flaring gas, 1-3 MW -- returns 73. Every clause
    // beyond that starts excluding sites for reasons that are not really about quality.
    //
    // That is the honest shape: the shortlist is a RANKING problem, not a filter problem. Filter
    // to the ~70 that genuinely qualify, then read the top of the ranked table, which already
    // sorts by opportunity and caps at 250.
    //
    // One clause deliberately absent: collection system installed. It reads "Yes" on 1,871 of
    // 1,908 rows -- regulatory compliance means nearly every landfill of consequence collects --
    // so it removes 16 rows and creates a false impression of having narrowed anything.
    // ---- Starting points ------------------------------------------------------------------
    //
    // Every filter input REFINES. None of them answers "what am I looking for", which is the
    // only question someone opening this page cold actually has.
    //
    // These are the answer: a handful of goals in plain words, each setting every control at
    // once. They are not tutorials -- each one is a shortcut, and the whole set is meant to be
    // recognised at a glance months later rather than read.
    //
    // A starting point deliberately returns a POOL, not a shortlist. "A plant I can buy and
    // restart" matches thousands, because the fields that would cut it to fifteen are not filter
    // controls and making them into controls would exclude sites for reasons that are not about
    // quality. The RANKING shortlists -- which is why every one of these sets the sort too, and
    // why the landfill starting point below is the proof: same 336 sites, and the sort decides
    // whether the top twenty are running plants you cannot buy or idle ones you can.
    var STARTERS = [
        {
            id: 'restart',
            label: 'A plant I can buy and restart',
            // Says "1 MW and up", not "1-5 MW". The upper thumb at 5000 is the slider's OPEN top,
            // documented on the control in map.html -- it means no ceiling, not a 5 MW one. The
            // pool really does run to 18 MW, so the hint says so rather than describing a band
            // the filter is not applying.
            hint: '1 MW and up, ranked by how gettable it is',
            set: function() {
                _hasGenFilter = true;
                setCheck('fAcquisition', true);
                setSize(1000, 5000);
                setSort('combined');
            }
        },
        {
            id: 'landfill',
            label: 'Landfill gas with the engine still standing',
            hint: 'Shut-down projects, generator already on site',
            set: function() {
                _srcFilter = {}; _srcFilter['lmop-landfill'] = true;
                renderSourceFilter();
                renderCollectionFilter();
                _hasGenFilter = true;
                /* 5000 is the slider's documented open top ('no ceiling'), not a size. At
                   3000 this starter hid 178 of the 462 generator-standing shutdown sites --
                   the exact sites its label promises. */
                setSize(1000, 5000);
                /* Every LMOP record is American, so the country clause this used
                   to set narrowed nothing and only existed to light the control
                   that has since been removed. */
                setSort('combined');
            }
        },
        /* SOMEBODY ELSE ALREADY BUILT IT -- the card this whole reweight exists to produce.

           Ranked by capital avoided in DOLLARS. Modelled against this platform's own calculator,
           at 5 MW a $1M cut in infrastructure moves the BTC-accumulation crossover about three
           years, while a 2 cent/kWh cut in power cost moves it about two. The money somebody
           else already spent outranks the quality of the gas.

           Both landfill adapters, because the inheritance comes from two different directions:
           a US site where a gas plant was built and shut, and a Canadian one where the operator
           is legally obliged to build collection whether or not you show up.

           The 1 MW floor is commercial, not regulatory. Below it the fixed costs of a deal --
           diligence, legal, mobilisation -- do not amortise, whatever is standing on the site. */
        {
            id: 'lowest-capital',
            label: 'Somebody else already built it',
            hint: 'Collection and gensets already in the ground, richest first',
            set: function() {
                _srcFilter = {};
                _srcFilter['lmop-landfill'] = true;
                _srcFilter['eccc-landfill-ca'] = true;
                renderSourceFilter();
                renderCollectionFilter();
                setSize(1000, 5000);
                setSort('capital_avoided');
            }
        },
        /* CANADA. A different KIND of opportunity from the four around it, which is why it
           earns its own card rather than a country checkbox on one of them.

           Every other starter looks for an asset somebody wants to be rid of. This one looks
           for an operator legally obliged to spend money: Canada's Landfill Methane Regulations
           came into force on 12 December 2025, and the January 2029 cohort is over 1,000 t of
           methane a year with no gas recovery running when the rules landed. They must build
           gas destruction either way. A partner who funds the plant turns that cost into a
           revenue line, which is a better opening than asking whether they would consider
           selling.

           Ranked by acquisition rank, because that is the axis the obligation feeds --
           lmr_jan_2029 is an acquirability signal, not an opportunity one, so ranking by
           persistence would hide exactly the sites this card exists to surface.

           The floor is 1 MW, not the regulatory threshold. The threshold itself is a ~450 kW
           site: filtering at it returns a list too small to put a container on. */
        {
            id: 'canada-lmr',
            label: 'Canadian sites facing the methane deadline',
            hint: 'Obliged to destroy landfill methane, nothing built yet',
            set: function() {
                _srcFilter = {}; _srcFilter['eccc-landfill-ca'] = true;
                renderSourceFilter();
                renderCollectionFilter();
                setSize(1000, 5000);
                setSort('combined');
            }
        },
        {
            id: 'flare',
            label: 'Gas nobody is using yet',
            hint: 'Flares burning year after year, seen from orbit',
            set: function() {
                _srcFilter = {}; _srcFilter['flare-viirs'] = true;
                renderSourceFilter();
                renderCollectionFilter();
                setValue('fYears', '5');
                setSort('persistence');
            }
        },
        {
            id: 'alberta',
            label: 'Close to my Alberta operations',
            hint: 'Everything in Alberta, biggest first',
            set: function() {
                /* setValue no-ops on a missing control, so this stays correct
                   whether or not a country input exists. It is the one starting
                   point that genuinely means a country. */
                setValue('fCountry', 'CAN');
                setSort('power_potential');
            }
        },
        {
            id: 'biggest',
            label: 'The biggest sites anywhere',
            hint: 'Everything in scope, largest first',
            set: function() { setSort('power_potential'); }
        }
    ];

    function setCheck(id, on) { var e = document.getElementById(id); if (e) e.checked = !!on; }
    function setValue(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
    function setSort(v) { setValue('fSort', v); }
    function setSize(lo, hi) { setValue('fMinKw', String(lo)); setValue('fMaxKw', String(hi)); }

    function starterById(id) {
        for (var i = 0; i < STARTERS.length; i++) if (STARTERS[i].id === id) return STARTERS[i];
        return null;
    }

    function applyStarter(id) {
        var s = starterById(id);
        if (!s) return;
        _ignoreNextDocClick = true;
        resetFilterControls();
        _srcFilter = {};
        s.set();
        renderSourceFilter();
        renderCollectionFilter();
        paintSizeRange();
        renderSizeHint();
        saveFilters();
        saveFiltersSources();
        // Set BEFORE applyFilters, which repaints the cards, and guarded so the same repaint does
        // not immediately clear it again. Touching any control afterwards drops the highlight,
        // because the search on screen is then yours and not the starting point's.
        _activeStarter = id;
        _applyingStarter = true;
        try { applyFilters(); } finally { _applyingStarter = false; }
        renderStarters();
        renderSearchHead();
        status(s.label + ' — ' + fmtInt(_filtered.length) + ' prospects, best first. ' +
               'Adjust to narrow it.', 'var(--plat-200)');
        _starterStatus = true;
    }

    // How many each one returns, without applying it.
    //
    // Counted by writing the starting point's controls into the DOM, reading currentFilters()
    // back, then restoring every control exactly as it was. That looks roundabout next to
    // building the filter object directly, and it is deliberate: currentFilters() is the ONE
    // definition of what the controls mean, and a second copy of that mapping would drift from it
    // silently -- the count would stay plausible while describing a search the button no longer
    // performs. Nothing renders between the write and the restore, so none of it is observable.
    var _starterCounts = null, _activeStarter = null, _applyingStarter = false;
    var _starterStatus = false;

    function countStarters() {
        if (_starterCounts) return _starterCounts;
        if (typeof ProspectStore === 'undefined' || !ProspectStore.all || !ProspectStore.all().length) return null;
        var ids = FILTER_FIELDS.concat(['fOperator', 'fBurning', 'fActive', 'fAcquisition',
                                        'fRegion', 'fRadius']);
        var saved = {}, i;
        for (i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (!el) continue;
            saved[ids[i]] = (el.type === 'checkbox') ? el.checked : el.value;
        }
        // resetFilterControls() also clears the operator drill-down, which is NOT one of the ids
        // above and would otherwise be silently discarded by the act of counting.
        var savedSrc = _srcFilter, savedCo = _companyFilter, savedCoId = _companyFilterId;
        /* _hasGenFilter belongs on this list for exactly the reason the comment
           above gives for the drill-down: resetFilterControls() clears it, it is
           not one of the ids, and counting must not change the search. Without
           it, the last starter counted decided the clause -- and the last one
           does not set it, so merely DRAWING the cards switched "the engine is
           still standing" off. The count on screen stayed right, because matches
           are computed before the cards are drawn; every filter change after that
           silently returned a different search. */
        var savedGen = _hasGenFilter;
        var out = {};
        try {
            for (i = 0; i < STARTERS.length; i++) {
                resetFilterControls();
                _srcFilter = {};
                STARTERS[i].set();
                out[STARTERS[i].id] = matchesFor(currentFilters(), null, null, null).length;
            }
        } catch (e) {
            out = null;
        }
        // Restore, whatever happened above. A starting point that threw must not leave the user's
        // own search overwritten by the last one counted.
        for (i = 0; i < ids.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(saved, ids[i])) continue;
            var e2 = document.getElementById(ids[i]);
            if (!e2) continue;
            if (e2.type === 'checkbox') e2.checked = saved[ids[i]]; else e2.value = saved[ids[i]];
        }
        _srcFilter = savedSrc;
        _companyFilter = savedCo;
        _companyFilterId = savedCoId;
        _hasGenFilter = savedGen;
        renderSourceFilter();
        renderCollectionFilter();
        _starterCounts = out;
        return out;
    }

    /* ===== The search, stated in a sentence =====
     *
     * A wall of controls cannot tell you what it is currently doing. The five
     * starting points answer "what am I looking for", and the moment one is
     * chosen they have done their job — leaving them up means the question and
     * its answer compete for the same attention forever, and every later filter
     * change happens somewhere the eye no longer is.
     *
     * So a running search replaces the cards with one line: what it is, how many
     * it found, and the only two things you might want next. Change goes back to
     * the question. Adjust opens the drawer. Everything that is actually
     * excluding something is still named individually in the bar below, which is
     * what makes hiding the controls honest rather than merely tidier.
     */
    function renderSearchHead() {
        var el = document.getElementById('srcHead');
        if (!el) return;
        var st = _activeStarter ? starterById(_activeStarter) : null;
        /* A search nobody started from a card is still a search. It gets the same
           line, named as the user's own, so the cards are never the only way to
           be in a state worth describing. */
        var custom = !st && hasNonDefaultFilters();
        var picked = !!(st || custom);

        document.body.setAttribute('data-src-picked', picked ? '1' : '0');
        if (!picked) { el.innerHTML = ''; return; }

        var n = _filtered ? _filtered.length : 0;
        el.innerHTML =
            '<span class="src-head-eye">' + (st ? 'Looking for' : 'Your own search') + '</span>' +
            (st ? '<span class="src-head-what">' + esc(st.label) + '</span>'
                : '<span class="src-head-what">built from the filters below</span>') +
            '<span class="src-head-count">' + fmtInt(n) +
                (n === 1 ? ' site' : ' sites') + '</span>' +
            '<span class="src-head-acts">' +
                '<button type="button" class="src-head-btn" data-act="change">' +
                    (st ? 'Change' : 'Start over') + '</button>' +
                '<button type="button" class="src-head-btn" data-act="adjust">Adjust</button>' +
            '</span>';
    }

    function wireSearchHead() {
        var el = document.getElementById('srcHead');
        if (!el) return;
        el.addEventListener('click', function(e) {
            var b = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!b) return;
            if (b.getAttribute('data-act') === 'change') {
                _activeStarter = null;
                /* Back to a blank page, not back to the last thing before this
                   one. "Change" is asked by somebody who wants the question
                   again, and a half-cleared search would answer a question they
                   did not ask. */
                resetAllFilters();
                if (_refine) _refine.set(false);
                renderSearchHead();
                return;
            }
            if (_refine) _refine.set(true);
            var panel = document.getElementById('refinePanel');
            if (panel && panel.scrollIntoView) {
                panel.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    function renderStarters() {
        var wrap = document.getElementById('srcStarters');
        if (!wrap) return;
        var counts = countStarters();
        var html = '';
        for (var i = 0; i < STARTERS.length; i++) {
            var s = STARTERS[i];
            var n = counts && counts[s.id] !== undefined ? counts[s.id] : null;
            html += '<button type="button" class="src-starter' +
                (_activeStarter === s.id ? ' active' : '') + '" data-starter="' + esc(s.id) + '">' +
                '<span class="src-startlabel">' + esc(s.label) + '</span>' +
                '<span class="src-starthint">' + esc(s.hint) + '</span>' +
                // A count that could not be computed shows nothing rather than a zero, which
                // would read as "this search finds nothing" instead of "not counted yet".
                (n === null ? '' : '<span class="src-startcount">' + fmtInt(n) + ' sites</span>') +
                '</button>';
        }
        wrap.innerHTML = html;
    }

    // Every checkbox and select back to its default, without the side effects resetAllFilters
    // carries (it re-renders and re-applies). Used by the presets, which set their own state
    // immediately afterwards.
    function resetFilterControls() {
        var c = document.getElementById('fCountry');
        if (c) c.value = '';
        for (var id in FILTER_DEFAULTS) {
            var e = document.getElementById(id);
            if (!e) continue;
            if (typeof FILTER_DEFAULTS[id] === 'boolean') e.checked = FILTER_DEFAULTS[id];
            else e.value = FILTER_DEFAULTS[id];
        }
        _companyFilter = null;
        _companyFilterId = null;
        // Not a DOM control any more, so resetFilterControls has to clear it explicitly or a
        // starting point's filter would outlive the starting point.
        _hasGenFilter = false;
    }

    function renderSaved() {
        var el = document.getElementById('srcSaved');
        if (!el) return;
        // A repaint triggered by applyFilters must not eat what is being typed into the name box.
        var typed = null;
        var live = document.getElementById('savedNameInput');
        if (live) typed = live.value;

        var cur = searchKey(captureSearch());
        var h = '<span class="src-savedlabel">Saved searches</span>';
        if (!_searches.length) {
            h += '<span class="src-savedhint">none yet &mdash; set the filters you want, then save them</span>';
        }
        for (var i = 0; i < _searches.length; i++) {
            var on = searchKey(_searches[i]) === cur;
            h += '<span class="src-savedchip' + (on ? ' on' : '') + '" data-sid="' + esc(_searches[i].id) +
                 '" role="button" tabindex="0" title="' +
                 (on ? 'These are the filters currently in force' : 'Apply this search') + '">' +
                 esc(_searches[i].name) +
                 '<span class="x" data-del="' + esc(_searches[i].id) + '" title="Delete">&times;</span></span>';
        }
        if (_naming) {
            h += '<input type="text" class="src-savedname" id="savedNameInput" maxlength="60" ' +
                 'placeholder="Name this search" autocomplete="off">' +
                 '<button type="button" class="src-savedadd" id="savedConfirm">Save</button>' +
                 '<button type="button" class="src-savedadd" id="savedCancel">Cancel</button>';
        } else {
            h += '<button type="button" class="src-savedadd" id="savedAdd">+ Save current</button>';
            // The built-in "Landfill shortlist" chip that used to sit here is now a starting
            // point above, alongside the others. One mechanism, not two -- and its tooltip had
            // already gone stale, still promising "roughly 70 sites" for a filter that returns
            // 336, which is exactly how a second copy of the same thing decays.
        }
        el.innerHTML = h;
        if (_naming) {
            var inp = document.getElementById('savedNameInput');
            if (inp) { if (typed !== null) inp.value = typed; inp.focus(); }
        }
    }

    function wireSaved() {
        var el = document.getElementById('srcSaved');
        if (!el) return;
        el.addEventListener('click', function(e) {
            // Everything in this bar changes the page deliberately; none of it should also be
            // read as a click on the background that dismisses focus.
            _ignoreNextDocClick = true;
            var del = e.target.getAttribute && e.target.getAttribute('data-del');
            if (del) { deleteSearch(del); return; }
            if (e.target.id === 'savedAdd')     { _naming = true;  renderSaved(); return; }
            if (e.target.id === 'savedCancel')  { _naming = false; renderSaved(); return; }
            if (e.target.id === 'savedConfirm') { commitSave(); return; }
            var chip = e.target.closest && e.target.closest('.src-savedchip');
            if (chip) applySearchById(chip.getAttribute('data-sid'));
        });
        el.addEventListener('keydown', function(e) {
            if (e.target && e.target.id === 'savedNameInput') {
                if (e.key === 'Enter')       { e.preventDefault(); commitSave(); }
                else if (e.key === 'Escape') { _naming = false; renderSaved(); }
                return;
            }
            var chip = e.target.closest && e.target.closest('.src-savedchip');
            if (chip && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                applySearchById(chip.getAttribute('data-sid'));
            }
        });
    }

    // Shared by the list and the table so the two can never disagree about why the screen is
    // empty. Buttons carry the filter key; one delegated handler wires them where they render.
    // A combination that CANNOT match, as opposed to one that merely did not. Worth separating:
    // "no results" invites you to widen the search, whereas this needs one specific filter
    // dropped and no amount of widening will help.
    //
    // Both burning filters are flare-gas only — nothing else publishes a survey year or gets
    // checked against FIRMS — and every flare is a raw resource. So either of them combined with
    // a view or source selection that excludes flares is empty by construction, every time.
    function impossibleCombination() {
        var a = document.getElementById('fActive'), b = document.getElementById('fBurning');
        var which = (a && a.checked) ? 'Flare seen in the latest survey'
                  : (b && b.checked) ? 'Flare confirmed burning recently' : null;
        if (!which) return null;
        // Reads the filter directly now that it is one, rather than being told by whichever
        // surface happened to be rendering. Both callers used to have to pass it, and the side
        // list never did.
        var acq = document.getElementById('fAcquisition');
        if (acq && acq.checked) {
            return which + ' only ever matches flare gas, and Acquisition targets only shows ' +
                   'assets already built. Nothing can satisfy both.';
        }
        var ids = Object.keys(_srcFilter);
        if (ids.length && ids.indexOf('flare-viirs') < 0) {
            return which + ' only ever matches flare gas, which the source filter is currently ' +
                   'excluding. Nothing can satisfy both.';
        }
        return null;
    }

    function emptyStateHtml(lead) {
        var act = activeFilters();
        var clash = impossibleCombination();
        var h = '<div class="src-emptybox"><div class="src-emptylead">' + esc(lead) + '</div>';
        if (clash) h += '<div class="src-clash">' + esc(clash) + '</div>';
        if (!act.length) {
            h += '<div class="src-note">No filters are active — this source returned nothing.</div>';
        } else {
            h += '<div class="src-note">Active filters:</div><div class="src-activefilters">';
            for (var i = 0; i < act.length; i++) {
                h += '<button type="button" class="src-fchip" data-fkey="' + esc(act[i].key) + '">' +
                     esc(act[i].label) + '<span class="x">&times;</span></button>';
            }
            h += '</div><button type="button" class="src-resetall" data-fkey="__all__">Reset all filters</button>';
        }
        return h + '</div>';
    }

    // One delegated listener on document handles every chip rendered by either empty state.
    function wireEmptyState() {
        document.addEventListener('click', function(e) {
            var b = e.target.closest ? e.target.closest('.src-fchip, .src-resetall') : null;
            if (!b) return;
            _ignoreNextDocClick = true;
            var key = b.getAttribute('data-fkey');
            if (key === '__all__') { resetAllFilters(); return; }
            var act = activeFilters();
            for (var i = 0; i < act.length; i++) {
                if (act[i].key === key) { act[i].clear(); break; }
            }
            saveFilters();
            applyFilters();
        });
    }

    // Country and the "Near" region anchor are two ways of saying WHERE, and left independent
    // they contradict silently: the app opens on Canada as the home market, so a US region left
    // in the anchor makes the whole page look empty on every load with nothing on screen naming
    // the cause. Every region belongs to exactly one country, so the two are reconciled here in
    // both directions and can never disagree.
    //
    // Called at the top of applyFilters rather than from the control listeners, because the
    // generic change -> applyFilters loop would otherwise paint one frame of the contradiction
    // before any dedicated handler ran.
    function reconcileGeo(changed) {
        var regionEl = document.getElementById('fRegion');
        var countryEl = document.getElementById('fCountry');
        if (!regionEl || !countryEl || !regionEl.value) return false;

        var anchor = currentAnchor();
        if (!anchor || !anchor.iso3) return false;
        if (countryEl.value === anchor.iso3) return false;

        if (changed !== 'fRegion') {
            // Anything other than the user actively picking a region: the country wins and the
            // anchor yields. This includes BOOT, where `changed` is null — nobody chose anything
            // on a page load, so a leftover region must never drag the country with it. Getting
            // this backwards is what overwrote a saved country with the region's country and
            // pinned the app to the wrong place permanently.
            regionEl.value = '';
        } else {
            // A region was picked. It implies its country, and selecting it while the country
            // says otherwise is never what anyone means.
            var ok = false;
            for (var i = 0; i < countryEl.options.length; i++) {
                if (countryEl.options[i].value === anchor.iso3) { ok = true; break; }
            }
            if (ok) countryEl.value = anchor.iso3;
            else regionEl.value = '';    // no prospects in that country at all
        }
        return true;
    }

    // The whole match chain, as a pure function of a filter object. Extracted from applyFilters
    // so a starting point can COUNT what it would return without navigating to it -- previously
    // the only way to learn how many prospects a combination matched was to apply it, which is
    // exactly the thing a starting point exists to save you from.
    //
    // stats is an optional out-parameter rather than a return value, because every caller but one
    // wants the array and nothing else.
    function matchesFor(f, company, companyId, stats) {
        var matches = stampLiveness(ProspectStore.filter(f));
        if (f.hasOperator) {
            matches = matches.filter(function(c) { return !!operatorName(c); });
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
        // Generation already standing. A null is NOT a no: it means the source publishes nothing
        // about generation, which is true of every flare. Filtering on this therefore excludes
        // flares by construction, exactly as the flare-only filters exclude landfills — and the
        // label says so rather than leaving it to be discovered.
        /* Gas collection. NARROWS TO LANDFILLS BY CONSTRUCTION, and that is deliberate.

           The first version let flares and generating facilities pass through untouched, on the
           reasoning that their sources publish nothing about wells. It was consistent and it was
           useless: choosing Shutdown took 19,544 rows to 17,520 -- 31 landfills plus every
           untouched flare -- so the top of the list stayed entirely flares and not one collection
           value was visible on screen. A filter that appears to do nothing is worse than one that
           excludes something.

           So it behaves like every other source-specific filter here: hasGeneration excludes
           flares by construction, the flare-only checks exclude landfills, and this excludes
           both. The control is labelled Gas collection and sits under the landfill sources, so
           what it narrows to is stated rather than left to be discovered. */
        if (f.collection && f.collection.length) {
            matches = matches.filter(function(c) {
                if (c.energyType !== 'landfill_gas') return false;
                var st = collectionStatusOf(c);
                return st !== null && f.collection.indexOf(st) >= 0;
            });
        }
        if (f.hasGeneration) {
            matches = matches.filter(function(c) {
                return c.existingGenerationKw !== null && c.existingGenerationKw > 0;
            });
        }
        // Acquisition targets. Applied HERE, with the other filters, so the map, the list, the
        // table, the summary tiles and the portfolio all narrow together. While this lived inside
        // renderTable it narrowed the table alone, by thousands of rows, and said so nowhere.
        if (f.acquisitionOnly) {
            var beforeAcq = matches.length;
            matches = matches.filter(isAcquisitionCandidate);
            if (stats) stats.acqSuppressed = beforeAcq - matches.length;
        }
        if (company) {
            matches = matches.filter(function(c) {
                // Prefer the id on both sides. A candidate without one is not excluded by that
                // alone -- flares and landfills have no registry key at all -- so it falls back
                // to the name, exactly as an unmeasured field is treated everywhere else.
                if (companyId && c.operatorId) return c.operatorId === companyId;
                var o = operatorRecord(c);
                return o && o.operator === company;
            });
        }
        return matches;
    }

    function applyFilters(changed) {
        clearCapitalCache();
        if (reconcileGeo(typeof changed === 'string' ? changed : null)) saveFilters();
        var f = currentFilters();
        var stats = { acqSuppressed: 0 };
        var matches = matchesFor(f, _companyFilter, _companyFilterId, stats);
        _acqSuppressed = stats.acqSuppressed;
        var sortBy = document.getElementById('fSort').value;
        _filtered = SiteScoring.rank(matches, { jurisdictions: Jurisdictions }, sortBy);
        // 'combined' cannot live in SiteScoring: that module ranks a candidate on its published
        // fields alone, while the combined axis needs the acquirability score, which reads
        // SiteData for anything the user has recorded by hand. So it re-sorts here, where both
        // are in scope, and leaves rank()'s tie-break on volume intact underneath.
        //
        // This is the sort that answers "what could I actually buy?". Opportunity alone ranks an
        // OPERATING 2 MW plant top -- correctly, since it asks whether the energy is worth mining
        // against -- but its gas is under contract, so its acquirability is near zero and the
        // combined score collapses. Sorting here lifts the idle plants, which is the whole thesis
        // of site-acquirability.js and was until now reachable only from the table.
        /* AND 'score' FOR THE SAME REASON, which was a real bug rather than a
           nicety. This app has two scores: SiteScoring's, computed from a
           candidate's published fields, and SiteOpportunity's seven-component
           one — and the list has always DISPLAYED the second. SiteScoring.rank
           orders by the first, so choosing "Overall score" produced a list whose
           visible numbers read 55, 84, 84, 78, 79 and looked broken, because it
           was ordered by a number that is nowhere on screen.
           The one the reader can see is the one that has to do the ordering. */
        /* THE MONEY SORTS ASCEND. Every other axis ranks best-first as biggest-first; capital
           required and all-in $/kW rank best-first as SMALLEST-first -- the reader is looking
           for the cheapest way in. Nulls still last: unpriced is not cheap. */
        if (sortBy === 'capital_required' || sortBy === 'all_in_per_kw') {
            var moneyFor = (sortBy === 'capital_required')
                ? function(c) { var r = capitalFor(c); return r ? r.requiredUsd : null; }
                : function(c) {
                    var m = evaluateAt(c);
                    if (!m || !m.capex || m.capex.all_in_capital_usd === null ||
                        m.capex.all_in_capital_usd === undefined) return null;
                    var kw = usableKwFor(c);
                    return kw > 0 ? m.capex.all_in_capital_usd / kw : null;
                };
            _filtered.sort(function(a, b) {
                var av = moneyFor(a.candidate), bv = moneyFor(b.candidate);
                if (av === null && bv === null) return 0;
                if (av === null) return 1;
                if (bv === null) return -1;
                if (av !== bv) return av - bv;
                var ak = a.candidate.powerPotentialKw, bk = b.candidate.powerPotentialKw;
                return (bk === null || bk === undefined ? -1 : bk) -
                       (ak === null || ak === undefined ? -1 : ak);
            });
        }
        if (sortBy === 'combined' || sortBy === 'score' || sortBy === 'capital_avoided') {
            /* CAPITAL AVOIDED SORTS ON DOLLARS, NOT ON THE SCORE. The scorer uses the SHARE of
               the build avoided, so a 500 kW site inheriting everything outranks a 5 MW site
               inheriting most of it -- correct for ranking quality, wrong for ranking a
               shortlist you are going to spend money against. Here the reader is asking "where
               is the most capital already in the ground", and that is an absolute figure. */
            var valueFor = (sortBy === 'combined')
                ? combinedFor
                : (sortBy === 'capital_avoided')
                ? function(c) { var r = capitalFor(c); return r ? r.avoidedUsd : null; }
                : function(c) { return opportunityFor(c).scoreRaw; };
            _filtered.sort(function(a, b) {
                var av = valueFor(a.candidate), bv = valueFor(b.candidate);
                // Nulls last: a prospect missing an axis has not scored badly, it has not scored.
                if (av === null && bv === null) return 0;
                if (av === null) return 1;
                if (bv === null) return -1;
                if (bv !== av) return bv - av;
                var ak = a.candidate.powerPotentialKw, bk = b.candidate.powerPotentialKw;
                return (bk === null || bk === undefined ? -1 : bk) -
                       (ak === null || ak === undefined ? -1 : ak);
            });
        }
        saveFilters();
        renderPortfolio();
        paintSizeRange();
        renderSizeHint();
        renderFlareOnlyChecks();
        renderActiveBar();
        // Repainted on every filter change so the chip for the search you are actually looking at
        // lights up — and stops lighting up the moment you change one control.
        renderSaved();
        renderMoreFiltersCount();
        renderRefineCount();
        // Any filter change that did not come from a starting point means the search on screen is
        // the user's own, so the card stops claiming credit for it.
        if (!_applyingStarter) {
            _activeStarter = null;
            /* And the starting point's status line goes with it. It named a count
               -- "336 prospects, best first" -- which stayed on screen while the
               count beside the list said 124, so the page made two contradictory
               claims about the same search. */
            if (_starterStatus) { status(''); _starterStatus = false; }
        }
        renderStarters();
        renderSearchHead();
        renderSummary(matches);
        renderResults();
        renderResultsNote();
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
    // The side list that used to sit beside the map has been REMOVED. It mirrored the ranked
    // table below it — same prospects, same order, fewer columns — so the page showed one list
    // twice and the two could disagree about what was selected. The table is strictly richer
    // (sorting, the acquisition view, the cross-dataset link chips), so the list was the one to
    // go, and the map gained its 340 px.
    //
    // Its one unique control, the portfolio tick, moved into the table as a column rather than
    // being lost with it.

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
            hint.style.color = stale ? 'var(--neg)' : (aging ? 'var(--warn)' : 'var(--text-dim)');
        }
    }

    // Collapsed by default: it is reference material at the foot of the page, and expanding it
    // is one click. The choice is remembered so it does not have to be made twice.
    var PROV_KEY = 'protonMiningProvOpen';
    // ---- Disclosure --------------------------------------------------------------------
    //
    // One implementation for every collapsible section on this page: the provenance panel, the
    // secondary filters, and the four groups in the site detail. Generalised from the provenance
    // panel rather than reinvented, so the accessibility contract and the persistence behave the
    // same everywhere.
    //
    // `hidden` on the panel, NOT a class. Together with the [hidden]{display:none} pin in the
    // stylesheet that means a closed panel genuinely does not render — a real trap caught
    // earlier, when a test asserted `.hidden` (the attribute) and would have passed even while
    // the panel was still painted.
    //
    // Each disclosure remembers its own state, so the sections a person actually uses stay open
    // and the ones they do not stay shut.
    // onChange fires after every toggle. Needed because a canvas cannot be measured inside a
    // display:none container — Chart.js sizes it to 0 and draws nothing — so the trend chart has
    // to be (re)drawn at the moment its group is opened.
    function disclosure(btnId, panelId, storageKey, defaultOpen, onChange) {
        var btn = document.getElementById(btnId), panel = document.getElementById(panelId);
        if (!btn || !panel) return null;
        var open = !!defaultOpen;
        try {
            var saved = localStorage.getItem(storageKey);
            if (saved !== null) open = saved === '1';
        } catch (e) { /* private mode — the default stands */ }

        function apply(v) {
            open = v;
            panel.hidden = !v;
            btn.setAttribute('aria-expanded', v ? 'true' : 'false');
        }
        apply(open);
        if (open && typeof onChange === 'function') onChange(true);
        btn.addEventListener('click', function() {
            apply(!open);
            try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch (e) {}
            if (typeof onChange === 'function') onChange(open);
        });
        return { isOpen: function() { return open; }, set: apply };
    }

    function wireProvenance() {
        disclosure('provToggle', 'provCard', PROV_KEY, false);
    }

    // The secondary filter drawer. Its heading carries a count of how many hidden controls are
    // actually doing something, so a filter that is off-screen is never also out of mind. The
    // "Filtering by" bar underneath names them individually — this is the second of two
    // statements, not the only one.
    var MOREF_KEY = 'protonMiningProspectMoreFilters';
    function wireMoreFilters() {
        // The one drawer. Closed by default -- the starting points above are
        // meant to be enough on their own, and now say so when they have been.
        /* THE FOURTH GLITCH, and the one with no visible cause. paintSizeRange()
           positions the orange fill from the track's clientWidth, and a panel
           inside a closed disclosure measures ZERO -- so the paint that runs at
           boot returns early and nothing ever runs it again. Open the drawer and
           the fill was stuck at the far left regardless of where the thumbs were,
           until you happened to drag one and it snapped into place.
           disclosure() has always taken an onChange for exactly this reason; the
           trend chart uses it because a canvas cannot be measured inside
           display:none either. The slider needed it for the same reason and was
           never given it. */
        _refine = disclosure('refineToggle', 'refinePanel', REFINE_KEY, false, function(open) {
            if (!open) return;
            paintSizeRange();
            renderSizeHint();
        });
        renderRefineCount();
        wireSearchHead();

        var wrap = document.getElementById('srcStarters');
        if (wrap) {
            wrap.addEventListener('click', function(e) {
                var b = e.target.closest ? e.target.closest('[data-starter]') : null;
                if (b) applyStarter(b.getAttribute('data-starter'));
            });
        }
    }
    var REFINE_KEY = 'protonMiningProspectRefine';
    var _refine = null;

    // Open the drawer whenever something inside it is actually filtering. A collapsed panel is
    // only honest while it is empty; leaving a live filter behind a closed disclosure is how a
    // search silently returns fewer rows than the page appears to be asking for. The count in the
    // heading and the "Filtering by" bar both still say so, but neither shows you the control.
    // Non-DEFAULT, not merely active. What matters is whether the restored search differs from
    // the baseline -- that is the state whose controls need to be visible. (Before the scope
    // became a constant, fOnshore and fWorkable shipped ticked, so "any active filter" was true
    // on a completely fresh load and the drawer sprang open every time.)
    //
    // The country select and the source chips are not in FILTER_DEFAULTS, so they are checked
    // directly; both are genuinely a departure from the baseline when set.
    var BASELINE_IDS = ['fCountry', 'fMinKw', 'fMaxKw', 'fYears', 'fSort', 'fSearch', 'fRegion', 'fRadius',
                        'fActive', 'fOperator', 'fBurning', 'fAcquisition'];
    var _filterBaseline = null;

    function captureFilterBaseline() {
        var b = {};
        for (var i = 0; i < BASELINE_IDS.length; i++) {
            var el = document.getElementById(BASELINE_IDS[i]);
            if (!el) continue;
            b[BASELINE_IDS[i]] = (el.type === 'checkbox') ? el.checked : el.value;
        }
        _filterBaseline = b;
    }

    function hasNonDefaultFilters() {
        // No baseline means boot has not reached the snapshot yet. Reporting "nothing is
        // filtering" would be a guess, so report nothing and let a later call decide.
        if (!_filterBaseline) return false;
        for (var id in _filterBaseline) {
            if (!Object.prototype.hasOwnProperty.call(_filterBaseline, id)) continue;
            var el = document.getElementById(id);
            if (!el) continue;
            var now = (el.type === 'checkbox') ? el.checked : el.value;
            if (now !== _filterBaseline[id]) return true;
        }
        if (_srcFilter && Object.keys(_srcFilter).length) return true;
        return !!_companyFilter;
    }

    /* NO LONGER OPENS ITSELF. This used to spring the drawer open whenever any
       filter was non-default, on the reasoning that a live filter behind a closed
       panel is a search silently returning fewer rows than the page appears to
       ask for. That reasoning was sound when the page had nothing else to say —
       but it meant the screen got permanently denser the more it was used, and a
       returning user never saw the simple version again.
       Two things now carry that duty without unfolding anything: the header
       states the search and its count, and the "Filtering by" bar names every
       filter that is excluding something, each with its own remove button. Kept
       as a function because the boot sequence calls it and the honest answer to
       "reveal it?" is now "no". */
    function revealRefineIfFiltering() {
        renderSearchHead();
    }

    function renderRefineCount() {
        var el = document.getElementById('refineCount');
        if (!el) return;
        var n = activeFilters().length;
        el.textContent = n ? n + ' active' : '';
        el.style.color = n ? 'var(--btc-300)' : 'var(--text-dim)';
    }
    var HIDDEN_FILTER_IDS = ['fSources', 'fRegion', 'fRadius', 'fYears',
                             'fActive', 'fOperator', 'fBurning'];
    function renderMoreFiltersCount() {
        var el = document.getElementById('moreFiltersCount');
        if (!el) return;
        // Counted from activeFilters() rather than re-derived, so the drawer's count and the bar
        // below can never disagree about what is on.
        var act = activeFilters();
        var n = 0;
        for (var i = 0; i < act.length; i++) {
            if (HIDDEN_FILTER_IDS.indexOf(act[i].key) >= 0 || act[i].key === 'sources') n++;
        }
        el.textContent = n ? n + ' active' : '';
        el.style.color = n ? 'var(--btc-300)' : 'var(--text-dim)';
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
    // Outreach happens in a spreadsheet, and a mail merge needs somewhere to send the letter.
    // Until now this exported a counterparty name with no way to reach them, which is the same
    // gap the whole EIA Schedule 1/4 join exists to close.
    //
    // The address is resolved at export time from the companies map rather than copied onto the
    // saved record: it is SOURCED data with its own rebuild cadence, and a copy on the record
    // would silently go stale against the registry while looking authoritative.
    // A mailable address for the counterparty, and honestly labelled about where it came from.
    //
    // operatorCompany() resolves through an EIA utility id or the Alberta operator registry, and a
    // landfill has neither -- 0 of 1,908 carry an operatorId, and none of the 565 LMOP owner names
    // appears in a 482-row Alberta oil-and-gas list. So every landfill got nothing.
    //
    // data/site-links.json already links EIA landfill-gas plants to their LMOP landfill by 1 km
    // coordinate proximity, with no name matching of any kind, and the EIA side carries a filing
    // address. The bridge was built and tested and nothing ever crossed it.
    //
    // `via` is returned, not discarded: an address reached through a linked facility is a
    // different claim from one the prospect published itself, and the two must never be shown
    // with the same authority.
    function mailingFor(c) {
        if (!c) return { co: null, via: null };
        var co = operatorCompany(c);
        if (co) return { co: co, via: null };
        if (typeof SiteLinks === 'undefined' || !SiteLinks.aliasesOf) return { co: null, via: null };
        if (typeof FacilitySource === 'undefined' || !FacilitySource.companyFor) return { co: null, via: null };
        var alias = SiteLinks.aliasesOf(c.id) || [];
        for (var i = 0; i < alias.length; i++) {
            var other = (typeof ProspectStore !== 'undefined' && ProspectStore.get)
                ? ProspectStore.get(alias[i]) : null;
            if (!other || !other.operatorId) continue;
            var hit = FacilitySource.companyFor(other.operatorId);
            if (hit) return { co: hit, via: other };
        }
        return { co: null, via: null };
    }

    // ---- Draft enquiry ---------------------------------------------------------------------
    //
    // Composes an addressed letter for a prospect and copies it, so the step between "this is the
    // best target in the list" and "I have written to them" is not a blank page.
    //
    // COPY, not mailto:. site/site.js:161-207 uses mailto: with a Copy fallback and
    // site/hardware.html documents why: where no mail client is registered, nothing happens at
    // all. There is no email address for any landfill counterparty anywhere in this data, so a
    // mailto: here would open an empty To: field at best. What you actually do with this is post
    // it or paste it, so copying is the whole feature rather than the fallback.
    //
    // It composes and copies. It never sends anything.
    // navigator.clipboard is undefined on a plain-HTTP origin, which is exactly how this app is
    // served during local development -- so the execCommand path is not legacy cruft here, it is
    // the one that actually runs while you are testing.
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text)
                .then(function() { return true; })
                .catch(function() { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text));
    }
    function legacyCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    var NL = String.fromCharCode(10);

    function draftableFor(c) {
        if (!c) return null;
        var sd = c.sourceDetail || {};
        var gh = (typeof GhgrpContacts !== 'undefined') ? GhgrpContacts.forCandidate(c) : null;
        var to = gh && gh.parent ? gh.parent : (c.operator || null);
        var line = gh ? GhgrpContacts.addressLine(gh) : null;
        if (!line && sd.address) {
            line = [sd.address, sd.city, sd.state, sd.zip].filter(Boolean).join(', ');
        }
        if (!to || !line) return null;
        return { to: to, address: line };
    }

    function draftEnquiry(c) {
        var d = draftableFor(c);
        if (!d) return null;
        var sd = c.sourceDetail || {};
        var mw = c.powerPotentialKw ? (c.powerPotentialKw / 1000).toFixed(1) + ' MW' : null;
        var gen = c.existingGenerationKw ? (c.existingGenerationKw / 1000).toFixed(1) + ' MW' : null;
        var L = [];
        L.push(d.to);
        L.push(d.address);
        L.push('');
        L.push('Re: ' + (c.name || 'landfill gas project') +
               (sd.projectName ? ' — ' + sd.projectName : ''));
        L.push('');
        L.push('We are a bitcoin mining company that generates power on site from gas that would');
        L.push('otherwise be flared or vented, and we are interested in the landfill gas at this');
        L.push('site.');
        L.push('');
        // Every fact stated back to them is one EPA published. Nothing here is inferred, because
        // a letter that opens with a wrong number about their own site does not get a reply.
        var facts = [];
        if (sd.projectStatus) facts.push('EPA records the gas project as ' + String(sd.projectStatus).toLowerCase() +
            (sd.projectShutdownDate ? ' since ' + sd.projectShutdownDate : '') + '.');
        if (gen) facts.push('Generating equipment of about ' + gen + ' appears to remain on site.');
        if (mw) facts.push('Published gas volumes suggest roughly ' + mw + ' of continuous generation.');
        if (sd.lfgFlaredMmscfd) facts.push('EPA shows about ' + sd.lfgFlaredMmscfd +
            ' mmscfd currently being flared.');
        for (var i = 0; i < facts.length; i++) L.push('  - ' + facts[i]);
        if (facts.length) L.push('');
        L.push('We would take the gas as it is, on site, and we do not need a grid export');
        L.push('agreement or a power purchase contract. If the site is of interest we can discuss');
        L.push('terms, and we would cover the cost of gas treatment ourselves.');
        L.push('');
        L.push('Could you tell us who handles gas rights for this site?');
        L.push('');
        L.push('');
        L.push('---');
        L.push('Drafted from EPA LMOP' + (sd.lfid ? ' (LFID ' + sd.lfid + ')' : '') +
               (sd.ghgrpId ? ' and GHGRP facility ' + sd.ghgrpId : '') +
               '. Check every figure before sending.');
        return L.join(NL);
    }

    function worklistCsv() {
        var rows = worklistRows().map(function(r) {
            var out = {}, k;
            for (k in r) if (Object.prototype.hasOwnProperty.call(r, k)) out[k] = r[k];
            var co = (r.operator_id && typeof FacilitySource !== 'undefined' && FacilitySource.companyFor)
                ? FacilitySource.companyFor(r.operator_id) : null;
            if (!co && r.operator && typeof SiteCatalog !== 'undefined' && SiteCatalog.companyFor) {
                co = SiteCatalog.companyFor(r.operator);
            }
            var cand = (typeof ProspectStore !== 'undefined' && ProspectStore.get)
                ? ProspectStore.get(r.id) : null;
            var sd = (cand && cand.sourceDetail) || {};

            // A landfill has no operatorId and its owner is never in the Alberta registry, so both
            // lookups above miss and all five operator_* columns shipped blank on every landfill
            // row. But data/site-links.json ALREADY links 204 of 279 EIA landfill-gas plants to
            // their LMOP landfill by 1 km coordinate proximity -- no name matching -- and the EIA
            // side carries a mailing address. That bridge was built, tested, and never crossed.
            var via = null;
            if (!co && cand) {
                var m = mailingFor(cand);
                if (m.co) { co = m.co; via = m.via ? m.via.id : null; }
            }
            out.operator_address = co ? (co.address || '') : '';
            out.operator_city    = co ? (co.city || '') : '';
            out.operator_state   = co ? (co.state || '') : '';
            out.operator_zip     = co ? (co.zip || '') : '';
            out.operator_phone   = co ? (co.phone || '') : '';
            // Never present an address reached sideways as if the prospect published it itself.
            out.operator_address_via = via || '';

            // The counterparty who actually signs, where the filing distinguishes them from the
            // operator. Blank is not "the operator owns it" -- it is "no separate owner filed".
            //
            // Reads BOTH spellings. source-facility.js writes owners[] and ownership;
            // source-landfill.js writes owner and ownershipType. Reading only the facility
            // spelling is why these two columns were blank on all 1,908 landfills -- the data was
            // there the whole time under a different key.
            out.owner_name = (Array.isArray(sd.owners) && sd.owners.length)
                ? sd.owners.map(function(o) { return o.name; }).join(' | ')
                : (sd.owner || '');
            out.ownership  = sd.ownership || sd.ownershipType || '';
            out.site_address = [sd.address, sd.city, sd.state, sd.zip].filter(Boolean).join(', ');
            return out;
        });
        // `notes` was in this list and nothing anywhere writes site.notes, so the column shipped
        // empty on every row of every export. contact_notes is the one that is actually editable.
        var cols = ['name', 'stage', 'status', 'operator', 'contact_name', 'contact_role',
                    'contact_email', 'contact_phone', 'contact_notes',
                    'operator_address', 'operator_city', 'operator_state', 'operator_zip',
                    'operator_phone', 'operator_address_via', 'owner_name', 'ownership',
                    'site_address',
                    'jurisdiction', 'usable_kw',
                    'development_stage', 'latitude', 'longitude', 'updated'];
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
                if (!rows.length) { status('Nothing to export at this stage.', 'var(--warn)'); return; }
                // The BOM is what makes Excel read this as UTF-8 rather than the system
                // codepage; without it every accented company name arrives mangled.
                var blob = new Blob(['﻿' + worklistCsv()], { type: 'text/csv;charset=utf-8;' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'proton-prospects-' + (_wlStage === 'all' ? 'all' : _wlStage) + '.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
                status('Exported ' + rows.length + ' site' + (rows.length === 1 ? '' : 's') + ' to CSV.', 'var(--pos)');
            });
        }
        renderWorklist();
    }

    // ---- Results view: list beside the map, or the table below it -------------------------
    // These are two renderings of ONE result set. Showing both at once is what made the page feel
    // like the same data twice, so exactly one is painted at a time and the other is not in the
    // DOM's way. Each reads _filtered at the moment it paints, so a stale surface is impossible
    // rather than merely unlikely.
    var RESVIEW_KEY = 'protonMiningProspectResultsView';
    var _resView = 'list';
    // How many prospects the acquisition filter removed on the last pass, so the results bar can
    // report it. Set in applyFilters, which is the only place that filter is applied.
    var _acqSuppressed = 0;

    // ONE cap for one result set. The list used to stop at 300 and the table at 250, so switching
    // tabs silently changed how much of the same search you were looking at — the exact class of
    // disagreement these two surfaces are supposed to be incapable of.
    var RESULT_CAP = 250;

    // Survey persistence, shown ONLY where it means something. yearsSeen and yearsTotal come from
    // the VIIRS flare survey and only the flare adapter sets them; every EIA facility and every
    // LMOP landfill carries null. Printing "seen --/8 yr" against a 500 MW gas plant applies a
    // survey it was never part of and reads as eight consecutive misses.
    function yearsLabel(c) {
        if (c.yearsSeen === null || c.yearsSeen === undefined) return '';
        return 'seen ' + c.yearsSeen + '/' + (c.yearsTotal || '?') + ' yr';
    }

    // Miners the site can actually run, derated by duty cycle. The raw nameplate figure overstated
    // this badly wherever duty is low — a 50 MW plant running 30% of the time was advertised at
    // three times the miners it can keep powered, as a flat number with no basis attached.
    function minersLabel(c) {
        if (c.powerPotentialKw === null || c.powerPotentialKw === undefined) {
            return '<span class="src-gap">--</span>';
        }
        var duty = 100, note = '';
        if (typeof SiteAvailability !== 'undefined') {
            var a = SiteAvailability.evaluate(c);
            if (a.dutyPct === null) {
                note = 'at full output — duty cycle has never been measured at this site';
            } else {
                duty = a.dutyPct;
                if (a.basis === 'typical') note = 'duty assumed from technology class, not measured at this site';
            }
        }
        // Off USABLE, not gross. This is the number on the card that says "13,602 miners",
        // and sizing a fleet off a resource figure that ignores parasitic load and the gas
        // ceiling is how you order containers you cannot power.
        var usable = usableKwFor(c);
        if (usable === null) return null;
        var n = Math.floor(usable * 1000 * (duty / 100) / MINER_WATTS);
        return note
            ? '<span title="' + esc(note) + '">' + fmtInt(n) + ' miners*</span>'
            : fmtInt(n) + ' miners';
    }

    function renderResults() {
        /* One surface per view. All three are alternatives, and the detail pane
           sits beside whichever one is showing rather than below it. */
        if (_resView === 'table') renderTable();
        else if (_resView === 'owners') renderOwners();
        else renderList();
    }

    // The scan list. Deliberately NOT a narrow copy of the table: it carries the four things you
    // read while scrolling for something worth opening — who, how big, how sure we are it is real,
    // and how it scores — and leaves the other ten columns to the table.
    function renderList() {
        var listEl = document.getElementById('srcList');
        var countEl = document.getElementById('srcCount');
        if (!listEl) return;
        var shown = _filtered.slice(0, RESULT_CAP);

        if (countEl) {
            // Same basis line the table gives, for the same reason: a count beside a province
            // name would imply the province's border was searched, and it was a circle.
            var anch = currentAnchor();
            countEl.textContent = fmtInt(_filtered.length) + ' prospect' + (_filtered.length === 1 ? '' : 's') +
                (anch ? ' within ' + fmtInt(anch.km) + ' km of the centre of ' + anch.name : '') +
                (_filtered.length > shown.length ? ' — top ' + shown.length + ' shown' : '') +
                /* Said out loud, because "why is this one first" is the question a
                   ranked list gets asked most and the answer was only ever in a
                   dropdown three sections away. */
                ', ' + sortDescription();
        }
        // The way back out of focus mode, beside the count. The table has its own copy in its own
        // count row; only one of the two is ever on screen.
        var focusEl = document.getElementById('srcFocusOut');
        if (focusEl) {
            focusEl.innerHTML = _focused
                ? '<button type="button" class="src-unfocus" id="srcUnfocus">&larr; All prospects</button>'
                : '';
        }

        if (!_filtered.length) {
            listEl.innerHTML = emptyStateHtml('No prospects match.');
            return;
        }

        var html = '';
        for (var i = 0; i < shown.length; i++) {
            var c = shown[i].candidate;
            var op = operatorRecord(c);
            var opp = opportunityFor(c);
            html += '<div class="src-row' + (c.id === _selectedId ? ' sel' : '') + '" data-id="' + esc(c.id) + '">' +
                '<label class="pf-check" title="Include in portfolio"><input type="checkbox" data-pf="' + esc(c.id) + '"' +
                (_portfolio[c.id] ? ' checked' : '') + '></label>' +
                '<div><div class="t">' + esc(placeLabel(c)) + tierBadge(c.iso3) + '</div>' +
                '<div class="s">' + (op ? '<span class="src-op">' + esc(op.operator) + '</span>'
                                        : '<span class="src-gap">operator not identified</span>') + '</div>' +
                // Persistence where it exists, what the thing burns where it does not. A prospect
                // outside the flare survey gets a fact about itself rather than a blank slot.
                '<div class="s">' + (yearsLabel(c) || esc(energyLabel(c))) +
                (c.trend ? ' · ' + esc(c.trend) : '') + burningBadge(c) + '</div></div>' +
                '<div><div class="kw">' + fmtKw(usableKwFor(c)) + '</div>' +
                '<div class="yr">' + minersLabel(c) + '</div>' +
                /* Capital required, compact, on every row. The number the owner actually
                   decides on was computed for every candidate and visible only as a table
                   column -- triaging the ranked list meant opening each site to learn whether
                   it is a $200K inheritance or a $2M build. Blank when unpriced (flares):
                   absence of a figure, not a zero. */
                (function() {
                    var cr = capitalFor(c);
                    return (cr && cr.requiredUsd !== null && cr.requiredUsd !== undefined)
                        ? '<div class="cap" title="Still to spend at the capex model\'s rates">' +
                          fmtUsdCompact(cr.requiredUsd) + ' to spend</div>'
                        : '';
                })() +
                // The score, because the list is in ranked order and the reason a row is near the
                // top is otherwise invisible. Unscoreable stays blank rather than becoming a zero.
                // It shows whatever the list is CURRENTLY ordered by: a column of opportunity
                // scores beside a list sorted on acquisition rank is a list that looks wrong.
                '<div class="sc">' + sortedValueCell(c, opp) + '</div></div>' +
                '</div>';
        }
        listEl.innerHTML = html;
    }

    // ---- Owner rollup -------------------------------------------------------------------
    //
    // The same _filtered result set, grouped by who owns it. This is the third UNIT of the
    // results, not a third layout: the list and the table both answer "which site", and neither
    // answers "who do I call", which is the question that actually starts a deal.
    //
    // Measured on the shut-down landfill targets the acquisition preset surfaces: 20 owners hold
    // 61% of them, and Republic Services (31 sites, 64.3 MW) plus WM (29 sites, 56.8 MW) hold 60
    // of 189 between them. A third of the entire target pool is two phone calls. Working that as
    // 189 separate approaches is the wrong shape of effort.
    //
    // GROUPING IS BY THE EXACT PUBLISHED STRING, and deliberately so. This looks like the banned
    // name join and is not one: a name JOIN matches a name in one dataset against a name in a
    // DIFFERENT dataset and infers they are the same entity, which is what got SAND POINT matched
    // to Trident Seafoods. This is a group-by on one dataset's own field -- LMOP's own owner
    // string against itself. No inference, nothing merged.
    //
    // The consequence is that "WM" and "Waste Management, Inc." would sit in separate rows if
    // LMOP published both. That is left alone ON PURPOSE. Merging them would be exactly the
    // inference the ban exists to prevent, and a fragmented row is visibly wrong to a reader
    // while a wrongly merged one is invisible.
    function ownerGroups(rows) {
        // A plain object keyed by owner name would resolve 'constructor', 'toString' and
        // '__proto__' up Object.prototype, so a landfill owned by a company called Constructor
        // would land in a group whose .rows is a function. Object.create(null) has no prototype
        // to walk into. The same trap site-opportunity.js guards with hasOwnProperty.
        var byName = Object.create(null), order = [];
        // Prospects with no published owner are held aside rather than given a sentinel key --
        // any sentinel is a string a real owner could theoretically be called.
        var anon = null;
        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].candidate;
            var op = operatorRecord(c);
            var key = (op && op.operator) ? op.operator : null;
            var g;
            if (key === null) {
                if (!anon) anon = { name: null, rows: [], kw: 0, states: {}, best: null, type: null };
                g = anon;
            } else {
                if (!byName[key]) {
                    byName[key] = { name: key, rows: [], kw: 0, states: {}, best: null, type: null };
                    order.push(key);
                }
                g = byName[key];
            }
            g.rows.push(rows[i]);
            // null capacity is unmeasured, so it adds nothing rather than adding zero. The
            // count and the MW total are therefore different denominators, and the row says so.
            if (c.powerPotentialKw !== null && c.powerPotentialKw !== undefined) g.kw += c.powerPotentialKw;
            var st = (c.sourceDetail && c.sourceDetail.state) || c.iso3 || null;
            if (st) g.states[st] = 1;
            var comb = combinedFor(c);
            if (comb !== null && (g.best === null || comb > g.best)) g.best = comb;
            if (!g.type && c.counterpartyType) g.type = c.counterpartyType;
        }
        var out = [];
        var all = [];
        for (var n = 0; n < order.length; n++) all.push(byName[order[n]]);
        if (anon) all.push(anon);
        for (var j = 0; j < all.length; j++) {
            var v = all[j];
            v.stateCount = 0;
            for (var sKey in v.states) if (Object.prototype.hasOwnProperty.call(v.states, sKey)) v.stateCount++;
            v.measured = v.rows.filter(function(r) {
                return r.candidate.powerPotentialKw !== null && r.candidate.powerPotentialKw !== undefined;
            }).length;
            out.push(v);
        }
        // Ranked on total capacity, which is the quantity one conversation actually puts on the
        // table -- it weights how many sites AND how big they are, where a plain count does not.
        // Owners with no published name sort last regardless: they are not a counterparty, they
        // are a gap in the data, and putting them in the ranking would imply otherwise.
        out.sort(function(a, b) {
            if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
            if (b.kw !== a.kw) return b.kw - a.kw;
            return b.rows.length - a.rows.length;
        });
        return out;
    }

    function renderOwners() {
        var listEl = document.getElementById('srcList');
        var countEl = document.getElementById('srcCount');
        if (!listEl) return;

        // Grouped over the WHOLE filtered set, not the capped slice the list shows. A rollup that
        // silently covered only the top 250 would understate every large owner by exactly the
        // amount that makes them worth calling.
        var groups = ownerGroups(_filtered);
        var named = groups.filter(function(g) { return g.name !== null; });

        if (countEl) {
            countEl.textContent = fmtInt(named.length) + ' counterpart' + (named.length === 1 ? 'y' : 'ies') +
                ' across ' + fmtInt(_filtered.length) + ' prospect' + (_filtered.length === 1 ? '' : 's');
        }
        var focusEl = document.getElementById('srcFocusOut');
        if (focusEl) {
            focusEl.innerHTML = _focused
                ? '<button type="button" class="src-unfocus" id="srcUnfocus">&larr; All prospects</button>'
                : '';
        }
        if (!_filtered.length) {
            listEl.innerHTML = emptyStateHtml('No prospects match.');
            return;
        }

        var html = '';
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var anon = g.name === null;
            var meta = fmtInt(g.rows.length) + ' site' + (g.rows.length === 1 ? '' : 's') +
                       (g.stateCount ? ' &middot; ' + g.stateCount + ' state' + (g.stateCount === 1 ? '' : 's') : '') +
                       (g.best === null ? '' : ' &middot; best rank ' + Math.round(g.best));
            html += '<div class="src-ownerrow' + (anon ? ' dead' : '') + '"' +
                (anon ? '' : ' data-owner="' + esc(g.name) + '"') + '>' +
                '<div><div class="src-ownername">' +
                (anon ? '<span class="src-gap">owner not published</span>' : esc(g.name)) +
                '</div><div class="src-ownermeta">' + meta + '</div></div>' +
                '<div><div class="src-ownermw">' + fmtKw(g.kw || null) + '</div>' +
                // Says which denominator the MW figure came from whenever it is not all of them.
                '<div class="src-ownersites">' +
                (g.measured === g.rows.length ? 'total' : 'of ' + g.measured + ' measured') +
                '</div></div></div>';
        }
        listEl.innerHTML = html;
    }

    // Is the ranked table reachable at all? widget-settings.js writes style.display='none' INLINE
    // on a widget the user has hidden, and inline beats any stylesheet rule. Hide "Ranked
    // prospects" and then pick the Table tab and you would get a map with no results anywhere and
    // nothing saying why — a dead end created by giving the table a tab.
    function tableWidgetHidden() {
        var w = document.querySelector('[data-widget="prospect-table"]');
        return !!(w && w.style && w.style.display === 'none');
    }

    // One writer for #resNote. It carries two different facts — which surface you are on, and how
    // much the acquisition filter took out — and having setResultsView and renderTable each own
    // half of it meant whichever ran last erased the other.
    function renderResultsNote() {
        var note = document.getElementById('resNote');
        if (!note) return;
        var bits = [];
        if (_acqSuppressed) {
            bits.push(fmtInt(_acqSuppressed) + ' raw-resource or unrecorded prospects excluded');
        }
        if (_resView === 'table' && tableWidgetHidden()) {
            bits.push('Ranked prospects is hidden in widget settings — switch back to List, or ' +
                      're-enable the widget');
        } else {
            bits.push(_resView === 'table'
                ? 'every column, sortable'
                : _resView === 'owners'
                ? 'one row per counterparty — click an owner to see only their sites'
                : 'a quick scan beside the map — switch to Table for scores, cost and stage');
        }
        note.textContent = bits.join(' · ');
    }

    function setResultsView(v, skipRender) {
        _resView = (v === 'table' || v === 'owners') ? v : 'list';
        document.body.setAttribute('data-res-view', _resView);
        var bar = document.getElementById('resViews');
        if (bar) {
            var btns = bar.querySelectorAll('.src-view');
            for (var i = 0; i < btns.length; i++) {
                var on = btns[i].getAttribute('data-res') === _resView;
                btns[i].classList.toggle('active', on);
                btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        }
        renderResultsNote();
        try { localStorage.setItem(RESVIEW_KEY, _resView); } catch (e) { /* private mode */ }
        // Leaflet measured its container at the old width. Without this the tiles stay laid out
        // for a 340 px narrower map and the markers sit in the wrong place.
        var lm = (typeof MapBridge !== 'undefined' && MapBridge.leaflet) ? MapBridge.leaflet() : null;
        /* MapBridge.resize() rather than a bare invalidateSize: switching result
           view changes the grid's columns, and the globe has to be told as well as
           Leaflet. */
        if (lm) setTimeout(function() { try { MapBridge.resize(); } catch (e) {} }, 80);
        if (!skipRender) renderResults();
    }

    function wireResViews() {
        var bar = document.getElementById('resViews');
        if (!bar) return;
        bar.addEventListener('click', function(e) {
            var btn = e.target.closest('.src-view');
            if (!btn) return;
            var v = btn.getAttribute('data-res');
            if (v === _resView) return;
            _ignoreNextDocClick = true;
            setResultsView(v);
        });
    }

    // Both exit-focus buttons, wired ONCE. They are re-rendered on every paint, so the handler has
    // to be delegated — and it must be installed at boot, not from inside a render or a reset,
    // which would add another listener on every call.
    function wireUnfocus() {
        document.addEventListener('click', function(e) {
            if (e.target && (e.target.id === 'tblUnfocus' || e.target.id === 'srcUnfocus')) {
                _ignoreNextDocClick = true;
                exitFocus();
            }
        });
    }

    function wireList() {
        var listEl = document.getElementById('srcList');
        if (!listEl) return;
        listEl.addEventListener('click', function(e) {
            // The portfolio tick is its own control, exactly as in the table — without this the
            // click travels on and opens the site instead of ticking the box.
            if (e.target && e.target.dataset && e.target.dataset.pf) {
                _ignoreNextDocClick = true;
                togglePortfolio(e.target.dataset.pf, e.target.checked);
                return;
            }
            if (e.target.closest && e.target.closest('.pf-check')) return;
            // Owner rows render into this same container, so they are caught by this same
            // listener rather than a second one that would have to be re-bound on every paint.
            var owner = e.target.closest ? e.target.closest('.src-ownerrow[data-owner]') : null;
            if (owner) {
                drillIntoOwner(owner.getAttribute('data-owner'));
                return;
            }
            var row = e.target.closest('.src-row[data-id]');
            if (!row) return;
            select(row.getAttribute('data-id'));
        });
    }

    // Clicking a counterparty answers "show me everything they have" -- which is the whole point
    // of the rollup, and is already a supported state: _companyFilter drives the map, the list,
    // the table and the summary tiles at once, and announces itself in the Filtering by bar with
    // its own clear button.
    //
    // _companyFilterId is cleared rather than looked up. It is the exact-key path used where a
    // source publishes an operator id; LMOP publishes none, so leaving a stale id set would make
    // applyFilters match on that id and silently return nothing.
    //
    // The view switches to the list because the rollup's own answer is a list of sites, and
    // staying in Owners would leave you looking at a single-row rollup of the thing you just
    // clicked. skipRender avoids painting the list against the pre-filter result set first.
    function drillIntoOwner(name) {
        if (!name) return;
        _ignoreNextDocClick = true;
        _companyFilter = name;
        _companyFilterId = null;
        setResultsView('list', true);
        applyFilters();
        status('Showing every prospect owned by ' + name +
               ' — clear the Operator filter to go back to all counterparties.', 'var(--plat-200)');
    }

    // ---- Ranked table --------------------------------------------------------------------
    // The other rendering of the same result set. Richer — every column, sortable — and
    // correspondingly not something you want on screen while scanning.
    // Uses RESULT_CAP, shared with the list — see the note there.
    var _tableSort = { key: 'opportunity', dir: -1 };
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

    /* THE MANUAL RECORD, WITH THE BEST LINKED CONTACT ON IT.
     *
     * site-opportunity.js scores contactability through contactTier(cand, ctx),
     * which reads ctx.manual.contact_name / _email / _phone. Those used to be five
     * flat fields on the site record; they are contact records now, and one person
     * can cover several prospects. This is the whole of the join: the record, with
     * the best linked contact overlaid on the three fields the scorer reads.
     *
     * contactTier itself is UNCHANGED, and so are its assertions. It is a pure
     * function of the object handed to it, which is what made this a four-call-site
     * change rather than a rewrite of the scoring engine.
     *
     * Falls back to the bare record when the contacts module is absent, so a
     * half-loaded page scores the way it did yesterday instead of dropping every
     * prospect to "no operator identified" and silently re-ranking the table. */
    function manualFor(id) {
        if (typeof CrmContacts !== 'undefined' && CrmContacts.contactCtx) {
            return CrmContacts.contactCtx(id);
        }
        return (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(id) : null;
    }

    // Memoised per candidate. Scoring every row on every sort click would otherwise redo the
    // full seven-component calculation across the whole filtered set.
    function opportunityFor(c) {
        if (Object.prototype.hasOwnProperty.call(_oppCache, c.id)) return _oppCache[c.id];
        var ctx = opportunityCtx();
        var r = SiteOpportunity.score(c, {
            jurisdictions: ctx.jurisdictions,
            fleet: ctx.fleet,
            operator: operatorRecord(c),
            manual: manualFor(c.id)
        });
        _oppCache[c.id] = r;
        return r;
    }

    // Acquirability reads the candidate's structural state plus anything recorded by hand, so a
    // manually logged bankruptcy on a saved record counts alongside adapter-supplied state.
    function acquirabilityFor(c) {
        if (Object.prototype.hasOwnProperty.call(_acqCache, c.id)) return _acqCache[c.id];
        var manual = manualFor(c.id);
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
    /* Plain words for the active order, for the line above the list. */
    var SORT_WORDS = {
        persistence:     'most persistent first',
        score:           'best overall score first',
        combined:        'best acquisition rank first',
        power_potential: 'largest first',
        jurisdiction:    'friendliest jurisdiction first',
        capital_avoided: 'most capital already spent first',
        capital_required: 'least still to spend first',
        all_in_per_kw:   'cheapest all-in per kW first'
    };
    function sortDescription() {
        var el = document.getElementById('fSort');
        var by = el ? el.value : 'persistence';
        return SORT_WORDS[by] || 'ranked';
    }

    function combinedFor(c) {
        var o = opportunityFor(c), a = acquirabilityFor(c);
        return SiteAcquirability.combine(o.scoreRaw, a.scoreRaw);
    }

    /* CAPACITY MOVED TO site-capacity.js. It is the number that sizes a build -- miner count,
       container count, transformer, every per-kW cost -- and the execution workspace needs it
       too, so it stopped being private to this file. The move was verbatim and is pinned by a
       digest over all 30,517 candidates; see tests/site-capacity.test.js.

       These three names are kept as local aliases rather than rewritten at every call site,
       because a pure move should not also be a fifteen-site rename. */
    var PARASITIC = SiteCapacity.PARASITIC;
    var LFG_MW_PER_MMSCFD = SiteCapacity.LFG_MW_PER_MMSCFD;
    function gasSupportedKw(c) { return SiteCapacity.gasSupportedKw(c); }
    function usableCapacity(c) { return SiteCapacity.usableCapacity(c); }

    function usableKwFor(c) {
        var u = usableCapacity(c);
        return u.kw;
    }

    /* GAS COLLECTION, WHICH DECIDES WHO PAYS FOR THE WELLS.
     *
     * A collection system -- extraction wells, headers, condensate management, blower and flare
     * -- runs roughly $800K to $2.8M at 1-2 MW, often more than the generation equipment. Where
     * one already exists you rent the gas for a royalty of about 10% of revenue, which on this
     * app's own revenue model is about $91K a year at 1 MW. Where one does not, you fund it: at
     * $1.5M that is a 16.5-year payback on equipment with a 20-year life.
     *
     * So it is worth reading before anything else on a landfill, and until now it was ingested,
     * carried through sourceDetail, and displayed NOWHERE.
     *
     * FOUR STATES, and the two datasets say the same thing in different words:
     *
     *   installed  LMOP 'Yes'        / ECCC: the facility reports gas destruction
     *   shutdown   LMOP 'Shutdown'   / no ECCC equivalent
     *   none       LMOP 'No'         / ECCC: no destruction reported
     *   null       blank, or a source that publishes nothing about collection
     *
     * SHUTDOWN IS THE BEST STATE IN THE SET, not a middle one. The wells, headers and blower
     * are in the ground and idle: the capital is sunk, somebody else spent it, and nobody is
     * earning a royalty on it today. That is the lowest-capital entry point in the dataset, so
     * it is styled distinctly rather than blended into a generic flag.
     *
     * AND 'none' MEANS OPPOSITE THINGS IN THE TWO COUNTRIES, which is why this reports the fact
     * and takes no view. In the US nobody is obliged to install collection, so 'none' means the
     * bill is yours. In Canada the Landfill Methane Regulations oblige the operator to destroy
     * methane on a statutory date, so 'none' is precisely the January 2029 forced-buyer cohort
     * -- 30 sites, 28.2 MW, where the operator funds the collection and a partner funds the
     * plant. Read as a quality score, this column would delete the best Canadian prospects. */
    var COLLECTION_LABEL = { installed: 'Installed', shutdown: 'Shutdown', none: 'None' };

    function collectionStatusOf(c) {
        var sd = (c && c.sourceDetail) || {};
        var raw = sd.collectionSystem;
        if (raw !== null && raw !== undefined && raw !== '') {
            var v = String(raw).trim().toLowerCase();
            if (v === 'yes') return 'installed';
            if (v === 'shutdown') return 'shutdown';
            if (v === 'no') return 'none';
            return null;                       // an unrecognised word is not a guess
        }
        // ECCC publishes no such column. Gas destruction is the same fact by another route, and
        // source-landfill-ca.js has already resolved it from the emission-source categories.
        if (sd.hasExistingControls === true) return 'installed';
        if (sd.hasExistingControls === false) return 'none';
        return null;
    }

    // Where the status came from and when it was pulled. Both are stated because a stale
    // collection status is a different kind of wrong from an absent one, and LMOP republishes
    // only two or three times a year.
    function collectionSourceLabel(c) {
        var sd = (c && c.sourceDetail) || {};
        if (sd.collectionSystem !== null && sd.collectionSystem !== undefined && sd.collectionSystem !== '') {
            return 'EPA LMOP, LFG collection system';
        }
        if (sd.hasExistingControls !== null && sd.hasExistingControls !== undefined) {
            return 'ECCC GHGRP, derived from reported gas destruction';
        }
        return 'not published by this source';
    }

    function collectionAsOf(c) {
        var sd = (c && c.sourceDetail) || {};
        var m = null;
        if (sd.collectionSystem !== null && sd.collectionSystem !== undefined && sd.collectionSystem !== '') {
            m = (typeof LandfillSource !== 'undefined' && LandfillSource.meta) ? LandfillSource.meta() : null;
        } else {
            m = (typeof LandfillCaSource !== 'undefined' && LandfillCaSource.meta) ? LandfillCaSource.meta() : null;
        }
        return m && m.generated ? String(m.generated).slice(0, 10) : null;
    }

    function collectionCell(c) {
        var st = collectionStatusOf(c);
        if (st === null) return '<span class="src-gap">--</span>';
        return '<span class="src-coll s-' + st + '">' + COLLECTION_LABEL[st] + '</span>';
    }

    /* The rate band everything on this page is priced at. site-infrastructure.js supports low
       (0.7x) and high (1.4x) as a stress test, and this stays on mid because a shortlist wants
       one number rather than a range -- the range belongs in diligence, against a real quote.
       Global rather than per-site if it ever becomes a control, because the uncertainty is
       correlated: a site expensive for one reason is usually expensive for most of them. */
    var _capBand = 'mid';

    /* CAPITAL AVOIDED, memoised per render.
     *
     * capitalAvoided() walks five components and reads the capex rate table, and the table calls
     * it up to four times per row across the columns and the sort. At 250 rows that is a thousand
     * passes for a figure that cannot change between them. The cache is cleared whenever the
     * result set is rebuilt, for the same reason evaluateAt's is. */
    var _capCache = {};
    var _capMarket = null;          // null = let the model default from what is on the ground
    function clearCapitalCache() { _capCache = {}; }
    function setCapMarket(m) {
        _capMarket = (m === 'new' || m === 'used') ? m : null;
        clearCapitalCache();
        // The all-in memo prices through stack(ctx.market) now, so it is stale the moment the
        // market changes. Leaving it warm would show a used avoided-panel over a new all-in --
        // the exact disagreement threading the market was meant to end.
        _evalCache = {};
    }

    function capitalFor(c) {
        if (!c || c.energyType !== 'landfill_gas') return null;
        if (typeof SiteInfrastructure === 'undefined') return null;
        if (Object.prototype.hasOwnProperty.call(_capCache, c.id)) return _capCache[c.id];
        /* A SITE THE USER HAS INSPECTED IS PRICED AS INSPECTED. The flag lives on the saved
           record rather than on the candidate, because the candidate is rebuilt from the source
           artifact on every load and would forget it. */
        var saved = findSavedSite(c.id) || {};
        var probe = c;
        if (saved.infra_condition_verified === true) {
            probe = Object.assign({}, c, { sourceDetail:
                Object.assign({}, c.sourceDetail || {}, { infraConditionVerified: true }) });
        }
        /* PRICED ON USABLE kW, NOT THE HEADLINE RATING. Capital is sized to what you can put
           miners on -- the gross figure is a resource number and on a large minority of landfills
           it is roughly double what the site delivers. The SCORE is unaffected either way: it
           uses the share avoided, and both sides of that fraction scale linearly with kW. */
        var r = SiteInfrastructure.capitalAvoided(probe, {
            kw: usableKwFor(c),
            asOf: new Date().toISOString().slice(0, 10),
            band: _capBand,
            /* null lets the model default from what is on the ground -- used only where the
               generation is SHUT. The toggle overrides that; nothing is remembered across a
               reload, because it is a way of asking a question rather than a fact about the
               site. */
            market: _capMarket
        });
        _capCache[c.id] = r;
        return r;
    }

    /* A COMPACT INVENTORY, because a reader scanning 250 rows needs the shape at a glance and
       cannot read five state fields per row. C = collection, G = generation, and a lower-case
       letter means the thing is there but SHUT -- which is the best state in the set, so it is
       not hidden behind the same glyph as absent. */
    function infraSummary(c) {
        var r = capitalFor(c);
        if (!r) return '<span class="src-gap">--</span>';
        var inv = r.inventory, bits = [];
        if (inv.collection === 'present') bits.push('C');
        else if (inv.collection === 'shutdown') bits.push('c');
        else if (inv.collection === 'mandated') bits.push('<span class="s-mandated">M</span>');
        if (inv.generation === 'present') bits.push('G');
        else if (inv.generation === 'shutdown') bits.push('g');
        if (!bits.length) {
            /* "none" and "not published" are different answers and the column must not merge
               them. LMOP saying collectionSystem = No is an assertion worth acting on; LMOP
               saying nothing is an absence of evidence, and printing "none" for it would invent
               a fact the dataset never stated. */
            var stated = inv.collection !== 'unknown' || inv.generation !== 'unknown';
            return stated ? '<span class="src-gap">none</span>'
                          : '<span class="src-gap">--</span>';
        }
        return '<span class="src-infra" title="C collection, G generation; lower case = ' +
               'installed but shut down; M = mandated">' + bits.join('+') + '</span>';
    }

    function capitalCell(c, which) {
        var r = capitalFor(c);
        if (!r || r.avoidedUsd === null) return '<span class="src-gap">--</span>';
        var v = which === 'required' ? r.requiredUsd : r.avoidedUsd;
        var s = '$' + Math.round(v / 1000).toLocaleString() + 'K';
        if (which === 'required') return s;
        /* NEVER A BARE NUMBER. The whole thesis rests on this equipment being usable and the
           dataset cannot tell you that, so an unverified figure is marked wherever it appears. */
        return s + (r.conditionVerified
            ? ' <span class="src-verified" title="condition verified on site">&#10003;</span>'
            : ' <span class="src-unver" title="unverified estimate — condition not estab' +
              'lished; LMOP records that equipment was installed, never that it still works">~</span>');
    }

    function tableSortValue(row, key) {
        var c = row.candidate;
        switch (key) {
            case 'name':        return placeLabel(c).toLowerCase();
            case 'source':      return (c.source || '').toLowerCase();
            case 'iso3':        return (c.iso3 || '').toLowerCase();
            case 'kw':          var uk = usableKwFor(c); return uk === null ? -1 : uk;
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
            // Ordered by what it costs YOU, not alphabetically: shutdown first (sunk capital,
            // idle, no royalty), then installed (sunk, but somebody charges for it), then none
            // (you fund the wells), and unpublished sorts last with every other null.
            case 'collection':
                var cs = collectionStatusOf(c);
                return cs === null ? null
                     : (cs === 'shutdown' ? 0 : cs === 'installed' ? 1 : 2);
            // The primary working number, so it sorts on the real dollars rather than the
            // confidence-adjusted score the ranking uses.
            case 'capavoided':
                var ca = capitalFor(c); return ca && ca.avoidedUsd !== null ? ca.avoidedUsd : null;
            case 'caprequired':
                var cr = capitalFor(c); return cr && cr.requiredUsd !== null ? cr.requiredUsd : null;
            case 'infraverified':
                var cv = capitalFor(c); return cv ? (cv.conditionVerified ? 1 : 0) : null;
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
    // it through would fill the set with prospects nobody has established anything about.
    //
    // Reads a stage recorded BY HAND in preference to the sourced one, the way acquirabilityFor
    // already does. Without that, a site you personally established was built stays excluded from
    // the acquisition set by a catalog that has not caught up with you — and the whole point of
    // typing it in was to tell the app something it did not know.
    function isAcquisitionCandidate(c) {
        var manual = manualFor(c.id);
        var st = (manual && manual.development_stage) || SiteOpportunity.stageOf(c);
        if (!st) return false;
        return STAGE_ORDER.indexOf(st) >= STAGE_ORDER.indexOf('constructed');
    }

    // The truncation notice used to print the raw data-sort attribute, so a capped table
    // announced "showing the top 250 by allinkw", "by torevenue", "by iso3". The column heading
    // is the name that column actually goes by on screen.
    function sortKeyLabel(key) {
        var th = document.querySelector('#srcTableHead th[data-sort="' + key + '"]');
        var t = th && th.textContent ? th.textContent.trim() : '';
        return t || key;
    }

    function renderTable() {
        var body = document.getElementById('srcTableBody');
        if (!body) return;
        var countEl = document.getElementById('tblCount');
        var capEl = document.getElementById('tblCap');

        // No longer filters. Acquisition targets is applied in applyFilters with everything else,
        // so _filtered is already the answer and the table cannot hold a different one.
        var rows = _filtered.slice();
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

        var shown = rows.slice(0, RESULT_CAP);
        if (countEl) {
            // Say what was actually searched. A centroid-and-radius circle is not the region's
            // border, and a count presented beside a province name would imply it was.
            var anch = currentAnchor();
            countEl.textContent = fmtInt(rows.length) + ' prospect' + (rows.length === 1 ? '' : 's') +
                (anch ? ' within ' + fmtInt(anch.km) + ' km of the centre of ' + anch.name : '');
        }
        // The way back out of focus mode. It used to live in the side list's count row; with that
        // list gone this is the only exit besides clicking the page background, which is not
        // discoverable.
        var focusEl = document.getElementById('tblFocusOut');
        if (focusEl) {
            focusEl.innerHTML = _focused
                ? '<button type="button" class="src-unfocus" id="tblUnfocus">&larr; All prospects</button>'
                : '';
        }
        // Never truncate silently — a capped list that says nothing reads as "this is all of it".
        if (capEl) {
            capEl.textContent = rows.length > shown.length
                ? 'showing the top ' + shown.length + ' by ' + sortKeyLabel(key) +
                  ' — narrow the filters to see further down'
                : '';
        }

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="18" style="padding:6px 10px 14px;">' +
                emptyStateHtml('No prospects match.') + '</td></tr>';
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
                '<td class="pf-col"><label class="pf-check" title="Include in portfolio">' +
                    '<input type="checkbox" data-pf="' + esc(c.id) + '"' +
                    (_portfolio[c.id] ? ' checked' : '') + '></label></td>' +
                '<td class="name">' + esc(placeLabel(c)) + promotedBadge(c) + tierBadge(c.iso3) +
                    linkChip(c) + '</td>' +
                '<td><span class="src-srcchip">' + esc(energyLabel(c)) + '</span></td>' +
                '<td>' + esc(c.iso3 || '--') + '</td>' +
                '<td class="num kw">' + fmtKw(usableKwFor(c)) + '</td>' +
                // Via SiteAvailability rather than the raw field: normalize() turns an unmeasured
                // duty into 100, so reading cand.dutyCyclePct here printed a confident "100%" for
                // 340 plants that have never reported a single month of generation.
                '<td class="num">' + dutyCell(c) + '</td>' +
                '<td class="num">' + (c.yearsSeen === null ? '--' : c.yearsSeen + '/' + (c.yearsTotal || '?')) + '</td>' +
                '<td>' + stageCell(c) + '</td>' +
                '<td>' + collectionCell(c) + '</td>' +
                '<td>' + infraSummary(c) + '</td>' +
                '<td class="num">' + capitalCell(c, 'avoided') + '</td>' +
                '<td class="num">' + capitalCell(c, 'required') + '</td>' +
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

    // Acquisition targets. A filter now, so this only has to set the table's default sort and let
    // applyFilters do the rest — the same handler shape as any other checkbox in the bar.
    function wireAcquisition() {
        var el = document.getElementById('fAcquisition');
        if (!el) return;
        el.addEventListener('change', function() {
            _ignoreNextDocClick = true;
            // Narrowing to built assets exists in order to rank on both axes, so it brings its own
            // default sort. Unticking restores opportunity, the honest default while
            // acquirability is still thin.
            _tableSort = el.checked ? { key: 'combined', dir: -1 }
                                    : { key: 'opportunity', dir: -1 };
            paintTableHead();
            saveView();
            saveFilters();
            applyFilters();
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
                // The portfolio tick is its own control. Moved here with the column when the
                // duplicate side list was removed; without this the click bubbles on and opens
                // the site instead of ticking the box.
                if (e.target && e.target.dataset && e.target.dataset.pf) {
                    _ignoreNextDocClick = true;
                    togglePortfolio(e.target.dataset.pf, e.target.checked);
                    return;
                }
                if (e.target.closest && e.target.closest('.pf-check')) return;
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

    /* The number the list is ordered by, labelled. Sorts whose key is already
       visible on the row -- size is the big kW figure, jurisdiction is the tier
       badge -- keep showing the opportunity score, because repeating the sort key
       twice on one row tells the reader nothing they cannot already see. */
    function sortedValueCell(c, opp) {
        var el = document.getElementById('fSort');
        var by = el ? el.value : 'persistence';
        if (by === 'combined') {
            var v = combinedFor(c);
            return v === null ? '<span class="src-gap">--</span>' : 'rank ' + Math.round(v);
        }
        /* Persistence deliberately has no badge of its own. A landfill scores on
           persistence -- it emits continuously -- while having no VIIRS survey
           year at all, so a "8/8 yr" badge printed "--" beside correctly ranked
           rows and looked like missing data rather than a different kind of site.
           The row's third line already carries the survey history where one
           exists, which is the honest place for it. */
        return opp.score === null ? '<span class="src-gap">--</span>' : 'opp ' + opp.score;
    }

    function combinedCell(c) {
        var v = combinedFor(c);
        return v === null ? '<span class="src-gap">--</span>'
                          : '<span class="src-oppcell">' + Math.round(v) + '</span>';
    }

    /* PROMOTED, on the scanning surface. This table is how you decide what to look at next, so
       the one thing it has to say about a project is "you already started this one" -- otherwise
       a site under construction sits in the ranking looking like a fresh opportunity.

       The gate comes off ProjectData rather than being restated here: the board and this table
       are different screens, and a badge that disagreed between them would be worse than none. */
    var GATE_LABELS = {
        target_screen: 'target & screen', contact_loi: 'contact & LOI', diligence: 'diligence',
        agreements: 'agreements', permitting_complete: 'permitted', construction: 'construction',
        engineering_procurement: 'engineering & procurement', commissioning: 'commissioning',
        operating: 'operating'
    };

    function promotedBadge(c) {
        if (typeof ProjectData === 'undefined' || !ProjectData.liveFor) return '';
        var p = ProjectData.liveFor(c.id);
        if (!p) return '';
        return ' <span class="src-promoted" title="Project ' + esc(p.id) + ' — ' +
               esc(GATE_LABELS[p.gate] || p.gate) + '">building</span>';
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
    /* SIX-DIGIT HEX, NOT var(). Everything this returns is handed either to a
       Leaflet path option or to a globe.gl point colour, and on the way it goes
       through fade() -- which returns its input UNCHANGED when it is not six
       hex digits. So a var() here does not merely fail to resolve, it silently
       drops the alpha that dims every unfocused marker, and then fails to
       resolve. An earlier pass of this migration put one here; this is that
       corrected, and the ramp wired to --persist-1..4 rather than hardcoded.

       The top of the ramp used to be green, which said 'good' about a site
       that had merely been SEEN every year. Persistence is not a verdict, and
       the palette's answer for a scale is the orange ramp. */
    /* THE RAMP HAS TO MEAN SOMETHING FOR EVERY SOURCE, NOT JUST FLARES.
     *
     * This divided c.yearsSeen by the length of the VIIRS survey -- the flare catalogue's year
     * count -- and applied that to whatever candidate it was handed. For flares it was right.
     * For everything else it produced one flat colour:
     *
     *   LMOP landfills set no yearsSeen at all, so the ratio was undefined/8 = NaN, every
     *   comparison below was false, and all 1,908 fell through to P[0].
     *   Canadian landfills DO carry yearsSeen -- up to 15 years of filings -- divided by that
     *   same 8, so the ratio always exceeded 1 and every one of them took P[3].
     *
     * Both were uniform, which is what "the pins are all one colour on the landfill source" is.
     *
     * persistencePct already means "share of the time this source was active", it is on the
     * shared candidate shape for exactly this, and each adapter computes it in its own units
     * before it arrives. Prefer it; fall back to a year ratio only when an adapter supplies
     * years and no percentage; and colour an unmeasured site differently rather than painting
     * it the same shade as one measured at the bottom of the scale. */
    function colorFor(c) {
        if (_colourBy === 'margin') return marginColor(c);
        var P = ProtonTheme.persist;
        var r = null;
        if (c.persistencePct !== null && c.persistencePct !== undefined &&
            isFinite(c.persistencePct)) {
            r = c.persistencePct / 100;
        } else if (isFinite(c.yearsSeen) && isFinite(c.yearsTotal) && c.yearsTotal > 0) {
            r = c.yearsSeen / c.yearsTotal;
        } else if (isFinite(c.yearsSeen)) {
            var meta = SiteCatalog.meta();
            r = c.yearsSeen / (meta ? meta.years.length : 6);
        }
        if (r === null || !isFinite(r)) return ProtonTheme.textDim;   // unmeasured, not lowest
        if (r >= 0.99) return P[3];
        if (r >= 0.66) return P[2];
        if (r >= 0.33) return P[1];
        return P[0];
    }

    // Green healthy, amber thin, red below cash cost. Dragging BTC price down and watching the
    // map turn red is the whole point of the scenario bar.
    /* Same constraint as colorFor: hex, because fade() and Leaflet both need it.
       This one IS semantic -- a margin below cash cost is a loss -- so it takes
       the semantic tokens through their mirror rather than the orange ramp. */
    function marginColor(c) {
        var m = evaluateAt(c);
        if (m.monthly_revenue === null || m.monthly_net === null || m.monthly_revenue <= 0) {
            return ProtonTheme.textDim;          // not measurable, not a verdict
        }
        var margin = m.monthly_net / m.monthly_revenue;
        if (margin < 0) return ProtonTheme.neg;      // below cash cost
        if (margin < 0.30) return ProtonTheme.warn;  // thin
        return ProtonTheme.pos;                      // healthy
    }
    var _colourBy = 'persistence';
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

    /* SIZES IN PIXELS, BECAUSE PIXELS ARE WHAT THE COMPLAINT WAS ABOUT.
     *
     * globe.gl takes pointRadius in DEGREES OF ARC, which is a unit nobody can
     * hold a ruler against: you cannot look at 0.42 and know whether that is a
     * dot or a blob. Measured through the library's own projection, a 27 MW
     * prospect at the default framing was 2.5 PIXELS across and a median one
     * was 1.7. That is the defect. It was never really about zoom -- they were
     * hairs at every altitude, and no zoom law rescues a two-pixel target.
     *
     * WHAT THE ZOOM LAW ACTUALLY DOES. A marker sits on the surface and the
     * camera sits `altitude` above the surface, both in units of globe radius,
     * so the distance between them is R*altitude -- NOT R*(1 + altitude), which
     * is the distance to the globe's CENTRE. Screen size therefore goes as
     * theta/altitude, and the original theta ∝ altitude did hold constant screen
     * size correctly. I briefly replaced it with (1+alt)/(1+REF) on the strength
     * of a centre-distance derivation and measured the result: markers ballooned
     * from 2.5px to 27px between the default framing and altitude 0.06. Reverted.
     * The old law was right; it was holding constant at the wrong constant.
     *
     * So: state the size in pixels, convert to arc-degrees at draw time using
     * the fov and container height that are actually in effect, and keep ONE
     * deliberate knob for how much bigger a marker gets as you close in.
     * ZOOM_GROWTH = 0 would be exactly constant screen size; 0.45 lets targets
     * grow toward WCAG's 24px as you approach without becoming discs that
     * swallow their neighbours. MARK_CAP_PX is the ceiling, and it is now a
     * number in the same units as the complaint. */
    var GLOBE_R      = 100;                          // three-globe's GLOBE_RADIUS
    var DEG_UNIT     = 2 * Math.PI * GLOBE_R / 360;  // world units per degree of arc
    var REF_ALTITUDE = 2.2;                          // the framing the px figures describe
    var MARK_MIN_PX  = 2.0;                          // RADIUS at the 125 kW floor
    var MARK_MAX_PX  = 4.2;                          // RADIUS at 10 MW and above
    var MARK_CAP_PX  = 8;                            // ceiling after zoom growth
    var FOCUS_MULT   = 1.45;
    /* GROWTH IS MODEST BECAUSE THE CLICK TOLERANCE DOES THE HARD WORK.
       This was 0.45, set when a marker had to be physically big enough to hit. It does not need
       to be: globeNearest() selects the nearest prospect within 22px of the click, so a marker
       only has to be big enough to SEE. At 0.45 the largest reached about 19px across on
       approach, and 4,000 of them over the continental United States merged into one mass --
       legibility spent on a size that was buying nothing. 13px, and the tolerance still catches
       the click. */
    var ZOOM_GROWTH  = 0.25;                         // 0 = constant screen size

    var _zoomScale = 1;                              // composite, for the deadband
    var _zoomRaf = null;

    function currentAltitude() {
        var g = MapBridge.globe();
        if (!g) return REF_ALTITUDE;
        try {
            var pov = g.pointOfView();
            return pov && isFinite(pov.altitude) ? pov.altitude : REF_ALTITUDE;
        } catch (e) { return REF_ALTITUDE; }
    }

    // Marker radius in CSS pixels, from capacity. Same log curve as before, new units.
    function markPxFor(c) {
        var kw = Math.max(c.powerPotentialKw || 125, 125);
        var t = (Math.log(kw) - Math.log(125)) / (Math.log(10000) - Math.log(125));
        return MARK_MIN_PX + Math.max(0, Math.min(1, t)) * (MARK_MAX_PX - MARK_MIN_PX);
    }

    /* Arc-degrees that render as one CSS pixel, right now. The fov and the
       viewport height are READ rather than assumed: the globe container is 560px
       on desktop, 380px below 900px and 350px below 600px, and a hard-coded
       constant would silently bake one of the three in. */
    function degPerPx() {
        var g = MapBridge.globe(), h = 560, fov = 50;
        try {
            h = g.height() || 560;
            var cam = g.camera();
            if (cam && cam.fov) fov = cam.fov;
        } catch (e) { /* globe not ready */ }
        return 200 * Math.tan(fov * Math.PI / 360) * Math.max(currentAltitude(), 1e-4)
               / (DEG_UNIT * h);
    }

    function zoomGrowth() {
        return Math.pow(REF_ALTITUDE / Math.max(currentAltitude(), 1e-4), ZOOM_GROWTH);
    }

    function radiusDeg(d) {
        return Math.min((d.px || MARK_MIN_PX) * zoomGrowth(), MARK_CAP_PX) * degPerPx();
    }

    /* A MARKER IS A DISC, AT EVERY ZOOM, AND THAT IS THE WHOLE RULE.
     *
     * Height used to encode power potential on its own log curve, with an exponent that
     * flattened it on approach. Two things were wrong with that.
     *
     * It was REDUNDANT: the width and the height were both functions of powerPotentialKw and
     * nothing else, so a column's height said exactly what its width already said.
     *
     * And it only flattened CLOSE IN. Measured at the framing the globe actually opens on,
     * markers were 0.79-1.65 units in radius and 0.54-5.16 units TALL -- a height-to-radius
     * ratio of 3.13. Those are not discs, they are posts standing off the surface, and in a
     * dense basin where neighbours sit about a unit apart they physically INTERSECT each
     * other's side walls. That is what the torn edges and half-circles were: not z-fighting,
     * not a driver bug, just solid geometry passing through solid geometry.
     *
     * So altitude is now derived from the marker's own radius rather than from the data a
     * second time. Every marker is a quarter as tall as it is wide, everywhere, which keeps
     * the proportions constant through a zoom instead of morphing from post to wafer.
     *
     * The small remaining height is deliberate and does real work: it separates overlapping
     * markers in depth, so a bigger site sits fractionally proud of a smaller one and wins
     * the overlap. Coplanar discs at identical radii would z-fight for real. */
    var DISC_HEIGHT_RATIO = 0.25;

    function altitudeFor(d) {
        // radiusDeg is in degrees of arc; convert to world units, then to globe radii.
        var worldRadius = radiusDeg(d) * DEG_UNIT;
        // Floor low enough that it does not turn the disc back into a post at deep zoom,
        // high enough that a marker never collapses into a coplanar z-fighting wafer.
        return Math.max(0.0005, worldRadius / GLOBE_R * DISC_HEIGHT_RATIO);
    }

    // Re-applies the size accessors only. Cheap next to rebuilding pointsData, and coalesced to
    // one update per animation frame because OrbitControls fires 'change' continuously on drag.
    function applyZoomScale() {
        var g = MapBridge.globe();
        if (!g) return;
        // The deadband now watches the COMPOSITE pixels-to-degrees factor, since
        // that is what actually changes what gets drawn.
        var s = zoomGrowth() * degPerPx();
        // Ignore very small changes: re-assigning an accessor re-renders every point. 2% is
        // below the visible threshold but tight enough that a slow scroll still feels live.
        if (Math.abs(s - _zoomScale) / _zoomScale < 0.02) return;
        _zoomScale = s;
        try {
            g.pointRadius(radiusDeg)
             .pointAltitude(altitudeFor);
        } catch (e) { /* globe not ready */ }
    }

    /* POINT THE GLOBE AT THE DATA, AND STOP IT SPINNING.
     *
     * The globe inherits fleet mode's behaviour: it opens on whatever longitude
     * it happens to be at and idles at 0.3 deg/s. For a fleet overview that is a
     * hero animation. For prospecting it means the catalogue -- which is
     * overwhelmingly North American -- sits on the LIMB at the framing you
     * arrive on, edge-on, where radial columns pile into a slab hanging off the
     * planet, and then drifts while you are trying to click something.
     *
     * Framed once, on the first render only. Re-framing on every filter change
     * would yank the camera out from under someone who had just positioned it.
     *
     * The centroid is a VECTOR mean, not an arithmetic one. Averaging longitudes
     * puts the centre of a set straddling the antimeridian in the middle of
     * Africa; averaging unit vectors and converting back does not, and costs
     * three multiplies per site. */
    var _framed = false;

    function frameOnData(globe, cands) {
        if (_framed || !cands || !cands.length) return;
        var x = 0, y = 0, z = 0, n = 0;
        for (var i = 0; i < cands.length; i++) {
            var c = cands[i];
            if (c.lat === null || c.lng === null) continue;
            var la = c.lat * Math.PI / 180, lo = c.lng * Math.PI / 180;
            var cl = Math.cos(la);
            x += cl * Math.cos(lo); y += cl * Math.sin(lo); z += Math.sin(la);
            n++;
        }
        if (!n) return;
        _framed = true;
        x /= n; y /= n; z /= n;
        var hyp = Math.sqrt(x * x + y * y);
        // A set spread evenly over the planet averages to near the origin, where the
        // direction is meaningless. Leave the camera alone rather than aim it at noise.
        if (Math.sqrt(hyp * hyp + z * z) < 0.05) return;
        var lat = Math.atan2(z, hyp) * 180 / Math.PI;
        var lng = Math.atan2(y, x) * 180 / Math.PI;
        try {
            globe.controls().autoRotate = false;
            globe.pointOfView({ lat: lat, lng: lng, altitude: REF_ALTITUDE }, 900);
        } catch (e) { /* globe not ready */ }
    }

    function watchZoom() {
        var g = MapBridge.globe();
        if (!g || _zoomWatched) return;
        var ctrls;
        try { ctrls = g.controls(); } catch (e) { return; }
        if (!ctrls || !ctrls.addEventListener) return;
        _zoomWatched = true;
        var schedule = function() {
            if (_zoomRaf) return;
            _zoomRaf = requestAnimationFrame(function() { _zoomRaf = null; applyZoomScale(); });
        };
        ctrls.addEventListener('change', schedule);
        /* degPerPx() reads the container height, so a resize changes the marker
           size even though the camera has not moved -- and OrbitControls does not
           fire 'change' for a resize. Without this the markers keep the pixel
           size they had at the old viewport height until you next touch the globe. */
        window.addEventListener('resize', schedule);
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
                px: markPxFor(c) * (isFocus ? FOCUS_MULT : 1),
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
        var cands = _filtered.slice(0, MAP_DRAW_CAP).map(function(r) { return r.candidate; });
        var focusId = _focused ? _selectedId : null;

        var note = document.getElementById('srcMapNote');
        if (note) {
            note.textContent = _focused
                ? 'Focused on 1 of ' + fmtInt(cands.length) + '. Click anywhere to show them all again.'
                : (_filtered.length > MAP_DRAW_CAP
                    ? 'Showing the top 4,000 of ' + fmtInt(_filtered.length) + ' matches — narrow the filters to see the rest.'
                    : fmtInt(cands.length) + ' plotted. Green = burning in every survey year.');
        }

        var globe = MapBridge.globe();
        if (globe) {
            watchZoom();
            frameOnData(globe, cands);
            _zoomScale = zoomGrowth() * degPerPx();
            globe.pointsData(toGlobePoints(cands, focusId))
                .pointLat('lat').pointLng('lng')
                // Columns, not flat dots. Height carries power potential on a log scale so an
                // 11 MW site visibly towers over a 150 kW one without a 70x bar. Flattening this
                // to a constant made every prospect look identical from orbit.
                .pointAltitude(altitudeFor)
                .pointRadius(radiusDeg)
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
                /* Built by concatenation, which is why the literal census never
                   caught it: its pattern needs a closing paren with numbers in it,
                   and this string ended at the comma. The value it assembled was
                   the green this app used BEFORE the palette moved to the site's,
                   so the focus ring has been a colour that exists nowhere else
                   since pass 2. A concatenated colour is a blind spot in any regex
                   census; the answer is not a better regex, it is not building
                   colours out of string fragments. */
                .ringColor(function() {
                    return function(t) { return ProtonTheme.alpha(ProtonTheme.pos, 1 - t); };
                })
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
                (function(id) { m.on('click', function() { _markerTook = true; select(id, true); }); })(c.id);
                m.addTo(_leafletLayer);
            }
            wireNearestClick(lmap);
        }
    }

    /* CLICKING NEAR A MARKER IS CLICKING IT.
     *
     * The radius formula above floors at 3px, so the smallest sites render as a
     * six-pixel dot, and the median across a filtered set measures sixteen. WCAG
     * 2.5.8 asks for 24x24 as the minimum target. Growing the markers is not the
     * answer -- at four thousand of them the map becomes a solid sheet of orange,
     * and the size is carrying information -- so the target grows instead of the
     * mark: a click anywhere within TOLERANCE_PX of a marker's centre selects the
     * nearest one.
     *
     * Nearest by SCREEN distance, not by latitude and longitude. A degree of
     * longitude is 111km at the equator and 43km in northern Alberta, so a
     * geographic radius would quietly become a different-sized target depending
     * on where you are looking, and would stop matching what the eye sees the
     * moment the map is zoomed.
     */
    /* How many markers the map plots, which is a different number from how many
       rows the list shows. Named because the click tolerance below has to search
       exactly the set that was drawn. */
    var MAP_DRAW_CAP = 4000;
    var TOLERANCE_PX = 22;
    var _markerTook = false;
    var _nearestWired = null;

    function wireNearestClick(lmap) {
        if (_nearestWired === lmap) return;      // one handler per map, not per repaint
        _nearestWired = lmap;
        lmap.on('click', function(e) {
            /* The marker's own handler already ran and already selected the right
               prospect. Doing it again would repaint the whole surface for nothing. */
            if (_markerTook) { _markerTook = false; return; }
            var best = null, bestD = Infinity;
            var here = e.containerPoint;
            /* MAP_DRAW_CAP, not RESULT_CAP. The list shows the top 250 and the map
               plots the top 4,000, so searching the list's slice would leave every
               marker past the 250th unclickable -- a tolerance that works only on
               the rows you could already click in the list beside it. */
            for (var i = 0; i < _filtered.length && i < MAP_DRAW_CAP; i++) {
                var c = _filtered[i].candidate;
                if (c.lat === null || c.lng === null) continue;
                var p = lmap.latLngToContainerPoint([c.lat, c.lng]);
                var dx = p.x - here.x, dy = p.y - here.y;
                var d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = c; }
            }
            if (best && Math.sqrt(bestD) <= TOLERANCE_PX) select(best.id, true);
        });
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
        renderResults();

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
        /* Leaving focus is the deselect. _selectedId is deliberately NOT cleared —
           the table keeps its highlighted row and restoreView still knows what you
           were reading — but the pane stops taking a column, because you are
           looking at the whole map again. */
        document.body.removeAttribute('data-detail');
        renderMapLayer();
        renderResults();
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
        /* The detail pane is beside the results now, so it needs a way to not be
           there. Its markup carries a static "Select a prospect" placeholder, and
           a 420px column of placeholder parked permanently beside the list is the
           kind of furniture that teaches people to stop looking at that part of
           the screen. Set here, cleared in exitFocus, read by CSS. */
        document.body.setAttribute('data-detail', '1');
        // The click that caused this selection is still travelling up to document, where the
        // dismiss handler lives. Without this it would immediately undo the focus it just set.
        _ignoreNextDocClick = true;
        enterFocus(c);
        renderDetail();
        // Scroll the matching row into view on whichever surface is showing — a .src-row in the
        // list, a <tr> in the table. No longer skipped when the click came from the map: that is
        // precisely the case that needs it, since the row is usually hundreds down the list.
        // 'nearest' is a no-op when the row is already visible, so clicking a row still costs
        // nothing.
        var row = document.querySelector('.src-row.sel') ||
                  document.querySelector('#srcTableBody tr.sel');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
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
        // saved.view is deliberately ignored. Acquisition targets is a filter now and rides in
        // protonMiningProspectFilters with the rest; restoring it from here too would give one
        // control two sources of truth that can disagree after an update.
        if (saved.sort && typeof saved.sort.key === 'string' &&
            (saved.sort.dir === 1 || saved.sort.dir === -1)) _tableSort = saved.sort;
        // Only restore a selection that still exists. Prospect ids change when a catalog is
        // rebuilt, and a stale id would leave an empty panel claiming a site is open.
        if (saved.sel && ProspectStore.get(saved.sel)) _selectedId = saved.sel;

        paintTableHead();
    }

    // Click anywhere outside the prospect list to bring every prospect back. The detail panel
    // and its inputs are excluded — dropping focus mid-way through typing a phone number would
    // be hostile, and reading the numbers is not a signal you are done with the site.
    function installDismiss() {
        document.addEventListener('click', function(e) {
            if (!_focused) return;
            if (_ignoreNextDocClick) { _ignoreNextDocClick = false; return; }
            if (e.target.closest('#srcTableBody')) return;       // selecting another prospect
            /* THE WHOLE PANE, not just #dBody. The heading row holding #dTitle and
               #dScore sits outside #dBody, as does the card's own padding — so a
               click on the panel's own title used to exit focus, un-narrow the map
               and repaint the list. That was a rare misclick while the detail was
               five sections down the page. Docked beside the list it is a click
               you would make on purpose. #dBody stays in the selector so the guard
               still holds if the pane id is ever dropped. */
            if (e.target.closest('#srcDetailPane, #dBody')) return;
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
    // ---- Quoted terms --------------------------------------------------------------------
    //
    // Conversion to the $/kWh the engine prices in. The constants are the engine's own, so the
    // two can never drift: 1,000 BTU per cubic foot and 10,000 BTU per kWh, i.e. 1 Mcf ~ 100 kWh.
    //
    // A GJ or Mcf quote is FUEL ONLY. site-capex.js:219 is explicit that power_rate is an ALL-IN
    // power price, so converting a fuel quote straight across understates the bill by the whole
    // genset lease — which is exactly why the generator-ownership select ships beside this rather
    // than later. The UI says "fuel only" on those two options for the same reason.
    var GJ_PER_KWH = 0.0036;              // 1 kWh = 3.6 MJ = 0.0036 GJ
    var KWH_PER_MCF = 1000000 / 10000;    // 1 Mcf = 1e6 BTU / 10,000 BTU per kWh = 100 kWh

    function quotedRateInput() {
        var el = document.getElementById('crm_rate');
        if (!el || el.value === '') return null;
        var v = parseFloat(el.value);
        return isFinite(v) && v >= 0 ? v : null;
    }

    // The quote expressed in $/kWh, or null when nothing was quoted. Deliberately NOT clamped or
    // rounded — a conversion that quietly tidies the number would make the derived figure look
    // more authoritative than the quote it came from.
    function derivedPowerRate() {
        var v = quotedRateInput();
        if (v === null) return null;
        var el = document.getElementById('crm_rate_units');
        var units = el ? el.value : 'usd_kwh';
        if (units === 'usd_gj') return v * GJ_PER_KWH;
        if (units === 'usd_mcf') return v / KWH_PER_MCF;
        return v;
    }

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

    // The counterparty's company record, whichever registry published it. One function, so the
    // call sheet, the size class and the contact block can never read different records for the
    // same company.
    //
    // Keyed by ID where the source has one and by name only where it does not. That is not a
    // stylistic preference: among the 9,765 US plants there are 4,084 distinct Utility IDs behind
    // 4,080 names, so a name lookup hands eight plants a coin flip between two real addresses.
    // The AER publishes no id in the flare join, so Alberta stays name-keyed and says so.
    function operatorCompany(c) {
        if (c && c.operatorId && typeof FacilitySource !== 'undefined' && FacilitySource.companyFor) {
            var byId = FacilitySource.companyFor(c.operatorId);
            if (byId) return byId;
        }
        var rec = operatorRecord(c);
        if (!rec || !rec.operator) return null;
        return (typeof SiteCatalog !== 'undefined' && SiteCatalog.companyFor)
            ? SiteCatalog.companyFor(rec.operator) : null;
    }

    // Ownership, as the filing states it. Rendered as a separate ROLE from the operator, never
    // merged with it: 1,294 US plants are wholly owned by a third party and 1,307 of the 1,313
    // with a single owner filed name someone other than the operator. Buying from the operator is
    // buying from the wrong company.
    //
    // The evidence for sole ownership is the Schedule 3 code, not the absence of a Schedule 4
    // row. Those nearly coincide and are different claims -- reasoning from an absent row would
    // go on asserting sole ownership if the column ever disappeared.
    function ownershipHtml(sdc) {
        if (!sdc || !sdc.ownership) return '';
        var owners = Array.isArray(sdc.owners) ? sdc.owners : [];
        function line(o) {
            var where = [o.address, o.city, o.state, o.zip].filter(Boolean).join(', ');
            return '<div class="src-reg-row"><span class="src-reg-k">' +
                (o.sharePct === null || o.sharePct === undefined
                    ? '<span class="src-gap">share not filed</span>'
                    : esc(String(o.sharePct)) + '%') + '</span>' +
                '<span class="src-reg-v"><strong>' + esc(o.name) + '</strong>' +
                (where ? '<br><a target="_blank" rel="noopener" ' +
                    'href="https://www.google.com/maps/search/?api=1&query=' +
                    encodeURIComponent(where) + '">' + esc(where) + '</a>' : '') +
                '</span></div>';
        }
        if (sdc.ownership === 'sole_operator') {
            return '<p class="src-note">The operator reports <strong>single ownership</strong> of ' +
                   'this plant (EIA-860 Schedule 3). No separate owner is filed.' +
                   (owners.length ? ' <span class="src-disagree">Though an ownership row exists ' +
                        'for it, which contradicts that code — both are shown as filed.</span>' +
                        '<div class="src-registry">' + owners.map(line).join('') + '</div>' : '') +
                   '</p>';
        }
        var lead = sdc.ownership === 'third_party'
                ? (owners.length === 1
                    ? 'Owned by <strong>' + esc(owners[0].name) + '</strong> — the operator is not the owner.'
                    : 'Wholly owned by an entity other than the operator.')
              : sdc.ownership === 'joint'
                ? 'Jointly owned by <strong>' + fmtInt(owners.length) + '</strong> ' +
                  'part' + (owners.length === 1 ? 'y' : 'ies') + '. A sale needs all of them.'
              : 'Ownership is <strong>mixed</strong> across the generators of this plant — ' +
                'some are owned by the operator and some are not.';
        return '<p class="src-note src-disagree">' + lead + '</p>' +
               (owners.length ? '<div class="src-registry">' + owners.map(line).join('') + '</div>' : '') +
               '<p class="src-note">Owner of record, from EIA-860 Schedule 4. The signature on a ' +
               'sale belongs to the owner, not to the operator.</p>';
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
        if (c.operator) {
            var rec = { operator: c.operator, source: c.operatorSource || null, licence: null };
            /* THE PUBLISHED PERSON RIDES ALONG. ECCC's registry names a public contact — name,
               title, direct phone, email — for 93 Canadian landfills, and site-opportunity's
               contact tiers award "published contact" on exactly these fields of the operator
               record. Without this merge those 93 scored tier 3 ("operator named, no contact")
               while carrying a direct phone number in sourceDetail: the ranking called the
               system's ONLY real contacts unreachable. */
            var sd = c.sourceDetail || {};
            if (sd.contactName || sd.contactPhone || sd.contactEmail) {
                rec.contactName = sd.contactName || null;
                rec.contactTitle = sd.contactTitle || null;
                rec.phone = sd.contactPhone || null;
                rec.email = sd.contactEmail || null;
            }
            /* THE MAILABLE ADDRESS COUNTS. contactTier awards tier 2 on `op.phone || op.address`
               — "the regulator publishes a phone or address for the licensee" — and the GHGRP
               registry publishes a mailable street address for 1,730 US landfills. Without this
               merge every one of them scored tier 3, "Operator named, no contact", below an
               Alberta flare with the same information: the ranking systematically understated
               contactability for exactly the target class. The typeof guard is the same
               deliberate degradation manualFor documents — a page without the contacts module
               scores the way it did yesterday. */
            if (!rec.phone && !rec.address && typeof GhgrpContacts !== 'undefined') {
                var ghRec = GhgrpContacts.forCandidate(c);
                var ghLine = ghRec ? GhgrpContacts.addressLine(ghRec) : null;
                if (ghLine) {
                    rec.address = ghLine;
                    rec.addressSource = 'EPA GHGRP facility registry';
                }
            }
            return rec;
        }
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
        var manual = manualFor(c.id);
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

        // ---- Grouping -------------------------------------------------------------------
        //
        // This panel reached 14 stacked sections, all expanded, every time — you had to read
        // everything to find the one thing you opened it for. It is now a call sheet plus four
        // disclosures.
        //
        // Sections are not moved. Each one writes a boundary marker naming the group it belongs
        // to, and the assembler at the bottom splits on those markers and reassembles. That means
        // the ~550 lines of section code below are untouched, so nothing can be lost in a
        // reshuffle — and a section can change group later by editing one word.
        var GROUP_MARK = String.fromCharCode(60) + '!--G:';
        function mark(name) { html += GROUP_MARK + name + '-->'; }

        var html = '';
        mark('scores');

        // Opportunity breakdown. Shown component by component so the headline number can be
        // argued with rather than taken on faith, and so an unmeasured component reads as
        // "not surveyed" instead of silently dragging the score down.
        mark('scores');
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
                /* MARKED WHERE THE NUMBER MOVES ON ITS OWN. These two read development_stage,
                   so they change when a PROJECT closes a gate rather than when anything about
                   the site is learned -- site_quality infers road access from a built asset and
                   jumps a real landfill 44 to 51 at 'constructed'. A number that moves without
                   the site changing has to say so where it is read, or the only way to find out
                   is to read the scorer. The matching CrmLog entry carries the delta. */
                var stageDerived = (b.id === 'development_stage' || b.id === 'site_quality');
                html += row(b.label + ' <span class="src-sub2">' + b.weight + '%</span>' +
                    (stageDerived ? ' <span class="src-stagederived" title="Partly derived from ' +
                        'the development stage, so this moves when a project closes a gate rather ' +
                        'than when the site changes">stage</span>' : ''),
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
            mark('evidence');
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
            /* THE CHAIN, NOT JUST THE ANSWER. This is the number that decides the miner count
               and the container order, so every step it came through is on the card: what the
               source published, what the gas actually supports, and what the plant spends on
               itself. A single derated figure with no working shown is not more trustworthy
               than the gross figure it replaced. */
            var ucap = usableCapacity(c);
            if (ucap.kw !== null) {
                html += row('Usable capacity',
                    '<strong>' + fmtKw(ucap.kw) + '</strong>' +
                    '<div class="src-sub2">what you can actually put miners on. ' +
                    (ucap.gasCapped
                        ? 'Capped at ' + fmtKw(ucap.gasSupportedKw) + ' by the gas the field ' +
                          'collects, against a published ' + fmtKw(ucap.gross) + ' rating, '
                        : 'From ' + fmtKw(ucap.gross) + ' published, ') +
                    'less ' + ucap.parasiticPct + '% parasitic load — blower, gas treatment, ' +
                    'compression and cooling, which the plant spends on itself.</div>');
                if (ucap.gasSupportedKw !== null && !ucap.gasCapped &&
                    ucap.gasSupportedKw > ucap.gross * 1.1) {
                    // Upside, stated as upside rather than folded into the headline.
                    html += row('Gas beyond the rating',
                        fmtKw(ucap.gasSupportedKw - ucap.gross) +
                        '<div class="src-sub2">the field collects more gas than the installed ' +
                        'rating converts. Reaching it means buying generation for the ' +
                        'difference, so it is not counted in usable capacity above.</div>');
                }
            }
            if (fsd.capacityBasis) html += row('Capacity basis', '<span class="src-sub2">' + esc(fsd.capacityBasis) + '</span>');
            var collSt = collectionStatusOf(c);
            if (collSt !== null) {
                var collWhen = collectionAsOf(c);
                html += row('Gas collection', collectionCell(c) +
                    (collSt === 'shutdown'
                        ? '<div class="src-sub2">wells, headers and blower are in the ground and ' +
                          'idle — the collection capital is already spent</div>'
                        : collSt === 'none'
                        ? '<div class="src-sub2">no collection published. Installing one runs ' +
                          'roughly $800K–2.8M at 1–2 MW, against a royalty near 10% of revenue ' +
                          'where a system already exists</div>'
                        : '') +
                    '<div class="src-sub2">' + esc(collectionSourceLabel(c)) +
                    (collWhen ? ', retrieved ' + esc(collWhen) : '') + '</div>');
            }
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
            mark('evidence');
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

        mark('evidence');
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
        mark('capacity');
        html += '<div class="src-detail"><div class="section-label">Derived capacity</div><dl>' +
            row('Power potential', fmtKw(c.powerPotentialKw) + rangeNote) +
            row('Miners supported', fmtInt(m.max_miners)) +
            row('Hashrate', m.total_hashrate_ph === null ? '--' : m.total_hashrate_ph.toFixed(1) + ' PH/s') +
            row('Monthly BTC', m.monthly_btc === null ? gap('needs network data') : m.monthly_btc.toFixed(4)) +
            row('Location', c.offshore === true ? '<span style="color:var(--neg);">offshore — not viable</span>' : 'onshore') +
            row('Jurisdiction', esc(j.label || countryName(c.iso3)) + ' ' + tierBadge(c.iso3)) +
            '</dl></div>';

        /* ---- Infrastructure & capital ------------------------------------------------
           THE ARITHMETIC, NOT JUST THE ANSWER.

           A capital-avoided figure is a claim about equipment nobody on this side has seen, built
           from five inferences and a condition discount. Printing only the total would ask the
           reader to trust it. Printing the working lets them disagree with one line of it, which
           is the only way a number like this survives contact with a real site visit.

           It sits directly above Capital -- what YOU would spend -- because the two are the same
           ledger read from opposite ends. */
        var cap = capitalFor(c);
        if (cap && cap.avoidedUsd !== null) {
            mark('capacity');
            html += '<div class="src-detail src-detail-wide">' +
                '<div class="section-label">Infrastructure &amp; capital</div>';

            html += '<div class="src-capsum">' +
                '<div><span class="k">Capital avoided</span><span class="v pos">' +
                    fmtUsd(cap.avoidedUsd) + '</span></div>' +
                '<div><span class="k">Still to spend</span><span class="v">' +
                    fmtUsd(cap.requiredUsd) + '</span></div>' +
                /* GAS-SIDE, AND SAYS SO. This row used to be captioned "Full build", and on a
                   measured shutdown site it was 55% short of the all-in figure rendered lower
                   in the SAME panel -- it prices the gas-side stack only, no mining
                   infrastructure, no miners, no acquisition. A number that reads as a total
                   while omitting the largest components is the most expensive kind of wrong:
                   it gets quoted. */
                '<div><span class="k">Gas-side build</span><span class="v">' +
                    fmtUsd(cap.totalBuildUsd) + '</span></div>' +
                (cap.requiredSavingUsd
                    ? '<div><span class="k">Saved by buying used</span><span class="v pos">' +
                      fmtUsd(cap.requiredSavingUsd) + '</span></div>' : '') +
                '</div>';

            /* THE MARKET TOGGLE. The sentence under it is the point: somebody will read the
               saving shrinking on a better site as a bug, so the relationship is stated rather
               than left as two numbers to be compared. */
            html += '<div class="src-capmkt">' +
                '<span class="k">Equipment priced</span>' +
                '<button type="button" class="src-mktbtn' + (_capMarket === null ? ' is-on' : '') +
                    '" data-mkt="auto">auto</button>' +
                '<button type="button" class="src-mktbtn' + (_capMarket === 'new' ? ' is-on' : '') +
                    '" data-mkt="new">new</button>' +
                '<button type="button" class="src-mktbtn' + (_capMarket === 'used' ? ' is-on' : '') +
                    '" data-mkt="used">used</button>' +
                '<span class="src-mktnote">' +
                    (cap.market === 'used'
                        ? 'A used market exists for gensets, switchgear and treatment skids. It ' +
                          'does not for a wellfield or a pad: those show no saving because there ' +
                          'is nothing to buy second-hand, not because a rate is missing.'
                        : 'Auto prices a site used only where its generation is SHUT, because ' +
                          'there you are replacing or recommissioning units. At a running plant ' +
                          'you inherit the equipment rather than buying it, and the condition ' +
                          'discount already prices that.') +
                '</span></div>';

            /* THE CONDITION LINE COMES FIRST, because it governs every figure under it. LMOP
               records that equipment was INSTALLED and nothing whatever about whether it still
               works; a shut project's gensets may be serviceable, cannibalised or scrap, and
               only somebody standing on the pad can tell you which. */
            html += cap.conditionVerified
                ? '<div class="src-capverdict verified">Condition verified on site — components ' +
                  'valued in full, with no discount for doubt.</div>'
                : '<div class="src-capverdict">UNVERIFIED ESTIMATE. The dataset records that this ' +
                  'equipment was installed, not that it still works. Every figure below carries a ' +
                  'condition discount, and only an inspection lifts it.' +
                  '<button type="button" class="src-verifybtn" id="srcVerifyInfra">' +
                  'Mark verified after inspection</button></div>';

            html += '<table class="src-captable"><thead><tr><th>Component</th><th>On site</th>' +
                '<th>Market</th><th class="num">Full cost</th><th class="num">Kept</th>' +
                '<th class="num">Avoided</th></tr></thead><tbody>';
            for (var xi = 0; xi < cap.components.length; xi++) {
                var xc = cap.components[xi];
                /* "no market" rather than "new": they are different statements, one a choice
                   and the other the absence of one. A saving of zero against a wellfield reads
                   as a rate somebody forgot to fill in. */
                var mkt = xc.usedMarket
                    ? '<span class="src-mkt s-' + esc(xc.market) + '">' + esc(xc.market) + '</span>'
                    : '<span class="src-mkt s-none" title="Wells, concrete and services are not ' +
                      'resold; there is no secondary market to price in">no market</span>';
                html += '<tr><td>' + esc(xc.label) + '</td>' +
                    '<td><span class="src-coll s-' + esc(xc.state) + '">' + esc(xc.state) + '</span></td>' +
                    '<td>' + mkt + '</td>' +
                    '<td class="num">' + (xc.fullUsd ? fmtUsd(xc.fullUsd) : gap('--')) + '</td>' +
                    '<td class="num">' + (xc.discount ? Math.round(xc.discount * 100) + '%' : gap('--')) + '</td>' +
                    '<td class="num">' + (xc.avoidedUsd ? fmtUsd(xc.avoidedUsd) : gap('--')) + '</td></tr>';
            }
            html += '</tbody></table>';

            if (cap.mandateFactor !== null) {
                /* A mandate only helps if you arrive before the operator commits to a flare
                   design. Once that engineering is let, the collection being built is sized to
                   burn the gas, and adding generation afterwards is a second project on a
                   budget that has already closed. */
                html += '<div class="src-sub2">Mandated capital, timed: ' +
                    (cap.mandateMonths === null ? 'no deadline established'
                        : cap.mandateMonths + ' months to the deadline') +
                    ' — counted at ' + Math.round(cap.mandateFactor * 100) + '%. The operator ' +
                    'funds collection either way; the value is in arriving before the flare is ' +
                    'designed.</div>';
            }

            /* THE RESULT THAT READS AS A BUG. saving = (new - used) x kW x (1 - kept), so the
               better the condition the less there is left to buy, and the less buying it used
               saves. Measured on a 2,160 kW site: $488,160 at a three-year shutdown against
               $1,142,640 at the catalogue median. Two numbers with no sentence between them
               invite the reader to conclude the model is broken. */
            if (cap.market === 'used' && cap.requiredSavingUsd) {
                html += '<div class="src-sub2">Buying used saves ' +
                    fmtUsd(cap.requiredSavingUsd) + ' off what you still have to spend, and it ' +
                    'saves LESS the better the condition here: you only pay for what you do not ' +
                    'inherit, so good condition means less to buy and therefore less to save by ' +
                    'buying it cheaply. The two settings are not fighting each other.</div>';
            }

            html += '<div class="src-sub2">Priced at the capex model\'s ' + esc(cap.band) +
                ' band, the same rates the Capital section below charges you. Inventory ' +
                'confidence ' + esc(cap.confidence) + ', inferred from ' +
                cap.inventory.evidence.length + ' published field' +
                (cap.inventory.evidence.length === 1 ? '' : 's') +
                (cap.inventory.evidence.length
                    ? ': ' + esc(cap.inventory.evidence.map(function(ev) {
                          return ev.field + ' = ' + ev.value; }).join('; '))
                    : '') + '.</div>';
            html += '</div>';
        }

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
                mark('evidence');
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
            mark('econ');
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

        // ---- What you can pay -------------------------------------------------------
        // The negotiating numbers, above the rest of the economics because this is the block a
        // person reads with a producer on the phone. Everything else in this panel answers
        // "what must bitcoin do"; these answer "what can I agree to".
        // Read here rather than relying on the `saved` further down this function: that one is
        // declared ~165 lines below, and `var` hoists the declaration without the assignment, so
        // touching it here throws and silently kills the rest of the panel.
        var savedTerms = findSavedSite(c.id) || {};
        mark('pay');
        var quoted = (savedTerms.power_rate !== null && savedTerms.power_rate !== undefined)
            ? Number(savedTerms.power_rate) : null;
        if (m.max_power_rate_cash_usd !== null && m.max_power_rate_cash_usd !== undefined) {
            var cashR = m.max_power_rate_cash_usd, capR = m.max_power_rate_capital_usd;
            html += '<div class="src-detail"><div class="section-label">What you can pay for power</div><dl>' +
                row('Ceiling before losses', fmtRate(cashR) +
                    '<div class="src-sub2">below this the site still loses money every month. ' +
                    'Ignores capital entirely, so it flatters.</div>') +
                row('To return capital', (capR === null || capR === undefined) ? gap('capital not priced')
                    : (capR <= 0
                        ? '<span class="src-disagree">' + fmtRate(capR) + '</span>' +
                          '<div class="src-sub2">negative — this cannot return its capital in ' +
                          fmtInt(m.target_payback_months) + ' months even if the gas were free</div>'
                        : fmtRate(capR) +
                          '<div class="src-sub2">all-in capital back within ' +
                          fmtInt(m.target_payback_months) + ' months. This is the number to ' +
                          'negotiate against.</div>')) +
                (quoted !== null
                    ? row('They are asking', fmtRate(quoted) +
                        '<div class="src-sub2">' +
                        (capR !== null && capR > 0 && quoted <= capR
                            ? 'inside your capital line — ' + (capR / quoted).toFixed(1) + 'x headroom'
                            : quoted < cashR
                                ? 'above the capital line but below the cash ceiling: it pays its ' +
                                  'own power bill, not its capital'
                                : 'ABOVE the cash ceiling — this loses money monthly') +
                        '</div>')
                    : row('They are asking', gap('no quote recorded — enter it under Terms below'))) +
                '</dl></div>';
        }

        mark('econ');
        html += '<div class="src-detail"><div class="section-label">Economics <span class="src-assume">(your assumptions)</span></div><dl>' +
            row('Cash cost / BTC', m.cash_cost_per_btc === null ? gap('needs market data') : fmtUSD(m.cash_cost_per_btc)) +
            row('Break-even BTC', m.breakeven_btc_price === null ? gap('needs market data')
                : fmtUSD(m.breakeven_btc_price) +
                  // It reads as a safety margin sitting under "Runs 20% of hours". It is not:
                  // it is a cash ratio that ignores capital, and it is identical at every duty
                  // cycle because both sides of it scale with uptime.
                  '<div class="src-sub2">cash only — ignores capital, and does not move with the ' +
                  'duty cycle</div>') +
            row('Monthly net', m.monthly_net === null ? gap('needs market data') : fmtUSD(m.monthly_net)) +
            // Capital and payback deliberately live in the Capital block above, which prices the
            // full stack. Repeating a narrower total here produced two different capital figures
            // and two different paybacks on one panel.
            row('Payback once running', m.payback_months === null
                ? gap('does not pay back')
                : m.payback_months.toFixed(1) + ' months' +
                  '<div class="src-sub2">on mining capital alone — see Capital above for payback ' +
                  'from close, which includes the wait to switch on</div>') +
            '</dl></div>';
            // The "Power $/kWh" input that used to sit here has been REMOVED, not relabelled.
            // It looked like a per-site control and was not: its handler wrote _scn.powerRate,
            // the global scenario, so typing the rate a producer had just quoted you re-priced
            // every prospect in the catalog and then discarded the number when the panel
            // re-rendered from the global value. Measured: a quote entered on one Alberta site
            // moved an unrelated site's monthly net from $277,894 to $386,052.
            //
            // Global assumptions belong to the scenario bar, which already owns them. The quoted
            // rate for THIS deal belongs in the Terms block, which now stores it.

        // The `</div>` that used to sit here closed the single .src-detailgrid wrapper this
        // function opened at the top. Each group now provides its own wrapper, so leaving this
        // behind produced an unbalanced close: the browser reparented everything after it and the
        // panel silently rendered five lines instead of a hundred and eighty.

        // ---- Who to contact -----------------------------------------------------
        mark('contact');
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
            var coF = operatorCompany(c);
            html += '<div class="src-op-big">' + esc(op.operator) + '</div>';
            // "Operator of record" where the source distinguishes the two roles, "owner" only
            // where it genuinely publishes the owner. LMOP names the landfill owner; EIA-860
            // names the OPERATOR, and calling that the owner was wrong on 1,294 plants.
            html += '<p class="src-note">' +
                (sdc.ownership ? 'Operator of record' : 'Owner of record') +
                (op.source ? ', per ' + esc(op.source) : '') + '.' +
                (coF && coF.entityTypeLabel ? ' ' + esc(coF.entityTypeLabel) + '.' : '') +
                (sdc.ownershipType ? ' ' + esc(sdc.ownershipType) + ' ownership.' : '') + '</p>';

            // The operator's own filing address. This is the deliverable: before it, the app
            // could identify 9,765 US plants and 4,080 companies and reach none of them.
            //
            // Falls back to a linked facility's address for landfills, which have no registry key
            // of their own -- and says so on the row when it does, because an address reached
            // through a coordinate link is a weaker claim than one the source published, and the
            // whole point of separating sourced from inferred is that the reader can tell.
            var mf = (coF && coF.address) ? { co: coF, via: null } : mailingFor(c);
            var coM = mf.co;
            if (coM && coM.address) {
                var mail = [coM.address, coM.city, coM.state, coM.zip].filter(Boolean).join(', ');
                html += '<div class="src-registry"><div class="src-reg-row">' +
                    '<span class="src-reg-k">Mailing address</span>' +
                    '<a class="src-reg-v" target="_blank" rel="noopener" ' +
                    'href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mail) + '">' +
                    esc(mail) + '</a></div></div>';
                if (mf.via) {
                    html += '<p class="src-note">Not published for this landfill. Taken from ' +
                        esc(mf.via.name || 'a co-located power plant') + ', which EPA and EIA place ' +
                        'at the same coordinates &mdash; so confirm it before you post anything.</p>';
                }
            }
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
            // ---- The legal counterparty, from EPA GHGRP -------------------------------
            //
            // For a landfill this is the whole answer to "who do I write to". LMOP gives a
            // free-text owner string; GHGRP gives the legal entity WITH its ownership share, so a
            // jointly-held site shows as one, plus a complete address including the postcode that
            // LMOP's own record was silently dropping.
            //
            // Reached by an exact integer join on the GHGRP id LMOP already publishes. It covers
            // 1,754 of the 1,755 landfills that carry one, and 411 of the 462 shutdown projects
            // with a generator still standing.
            var gh = (typeof GhgrpContacts !== 'undefined') ? GhgrpContacts.forCandidate(c) : null;
            if (gh) {
                html += '<div class="src-registry">';
                if (gh.parent) {
                    html += '<div class="src-reg-row"><span class="src-reg-k">Legal owner</span>' +
                        '<span class="src-reg-v"><strong>' + esc(gh.parent) + '</strong></span></div>';
                }
                var gline = GhgrpContacts.addressLine(gh);
                if (gline) {
                    html += '<div class="src-reg-row"><span class="src-reg-k">Write to</span>' +
                        '<a class="src-reg-v" target="_blank" rel="noopener" ' +
                        'href="https://www.google.com/maps/search/?api=1&query=' +
                        encodeURIComponent(gline) + '">' + esc(gline) + '</a></div>';
                }
                if (gh.frsId) {
                    // The FRS id is the way into ECHO for permit and violation history -- the
                    // thing source-landfill.js permitFor() returns null for on every landfill.
                    html += '<div class="src-reg-row"><span class="src-reg-k">EPA record</span>' +
                        '<a class="src-reg-v" target="_blank" rel="noopener" ' +
                        'href="https://echo.epa.gov/detailed-facility-report?fid=' +
                        encodeURIComponent(gh.frsId) + '">ECHO facility report &rarr;</a></div>';
                }
                html += '</div>';
                // Say plainly what this address is, because the honest answer differs by
                // counterparty and getting it wrong wastes a letter.
                html += '<p class="src-note">Legal owner and address as filed with the EPA ' +
                    'greenhouse gas programme' + (gh.latestYear ? ' for ' + gh.latestYear : '') +
                    '. This is the <strong>site</strong> address, not a head office &mdash; ' +
                    'for a county or municipal authority a letter addressed to the named entity ' +
                    'here usually reaches someone, but for a site held by a national waste ' +
                    'company you need their corporate address instead. EPA publishes no phone ' +
                    'number, email or named individual for any landfill.</p>';
            }

            // Who actually owns it, as a separate role.
            html += ownershipHtml(sdc);

            // Whose wires. Only 1,144 of the 9,765 plants sit on their own operator's
            // system, so for the rest this names a SECOND counterparty you have to deal
            // with -- which is why it sits in the contact block and not among the
            // technical figures.
            if (sdc.gridVoltageKv !== null && sdc.gridVoltageKv !== undefined) {
                html += '<div class="src-registry"><div class="src-reg-row">' +
                    '<span class="src-reg-k">Grid connection</span><span class="src-reg-v">' +
                    esc(String(sdc.gridVoltageKv)) + ' kV' +
                    (sdc.transmissionOwner
                        ? ' &middot; wires owned by <strong>' + esc(sdc.transmissionOwner) + '</strong>'
                        : '') + '</span></div></div>';
            }

            // The QF docket, verbatim. Formats in this one column include 98-53-000,
            // 04-78-000. and QF16-134-000, so every URL template is wrong for a large
            // minority -- the identifier is given and the lookup stays manual, the same
            // treatment PACER and the state UCC registries got.
            var dkt = sdc.qfDocket || sdc.cogenDocket || null;
            if (dkt) {
                html += '<div class="src-registry"><div class="src-reg-row">' +
                    '<span class="src-reg-k">FERC QF docket</span><span class="src-reg-v">' +
                    esc(dkt) + '</span></div></div>' +
                    '<p class="src-note">Their qualifying-facility self-certification. Look ' +
                    'it up by hand in FERC eLibrary → the docket format varies too much ' +
                    'to link reliably.</p>';
            }

            html += '<p class="src-note">' +
                (coF && coF.address
                    ? 'That is the company filing address, not the site office, and no ' +
                      'phone or named individual is published. '
                    : 'No phone or named individual is published for this counterparty. ') +
                '<a href="https://duckduckgo.com/?q=' + oq + '" target="_blank" rel="noopener">' +
                'Search the web for ' + esc(op.operator) + ' →</a></p>';

            // One call can put several sites on the table. 3,408 of the 4,084 US operators
            // run exactly one plant in this catalog, which is what makes the ones that do
            // not worth surfacing.
            if (coF && coF.plants > 1) {
                html += '<div class="src-portfolio">' +
                    '<strong>' + esc(op.operator) + '</strong> operates <strong>' +
                    fmtInt(coF.plants) + '</strong> catalogued plants totalling <strong>' +
                    fmtKw(coF.totalKw) + '</strong>' +
                    (coF.states ? ' across ' + Object.keys(coF.states).sort().join(', ') : '') + '.' +
                    ' <button class="src-linkbtn" id="srcShowCompany" data-company="' +
                    esc(op.operator) + '" data-company-id="' + esc(coF.utilityId || '') + '">' +
                    'Show all their sites →</button></div>';
            }
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
                    // The basis comes off the record, not out of this file. A second registry
                    // with a different well-count basis would otherwise be described as the
                    // AER's, and the fix for that must never be an iso3 === 'CAN' branch.
                    '<p class="src-note">' + esc(szHint) +
                    (co.sizeBasis ? ' Counted from ' + esc(co.sizeBasis) + ';' : ' This is') +
                    ' their position in that registry, not their company size.</p>';
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
                    '<p class="src-note">Published in ' +
                    // Named by the record, so a second registry cannot be described as the AER's.
                    esc(co.contactRegistry || 'the AER ST104 business associate registry') +
                    '. This is the company\'s ' +
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

        /* THE PUBLISHED PERSON, ABOVE EVERYTHING ELSE IN THE BLOCK. ECCC's registry names a
           public contact — name, title, direct telephone, email — for 93 Canadian landfills.
           It is the only place in the whole system a real person is published, it shipped in
           the artifact unread for its entire life, and when present it belongs at the top:
           every route below it is a way of FINDING what this block already has. */
        var sdp = c.sourceDetail || {};
        if (sdp.contactName || sdp.contactPhone || sdp.contactEmail) {
            var telDigits = sdp.contactPhone ? String(sdp.contactPhone).replace(/[^0-9+]/g, '') : null;
            var telShown = telDigits && telDigits.length === 10
                ? '(' + telDigits.slice(0, 3) + ') ' + telDigits.slice(3, 6) + '-' + telDigits.slice(6)
                : sdp.contactPhone;
            html += '<div class="src-registry">' +
                (sdp.contactName ? '<div class="src-reg-row"><span class="src-reg-k">Named contact</span>' +
                    '<span class="src-reg-v"><strong>' + esc(sdp.contactName) + '</strong>' +
                    (sdp.contactTitle ? ' · ' + esc(sdp.contactTitle) : '') + '</span></div>' : '') +
                (sdp.contactPhone ? '<div class="src-reg-row"><span class="src-reg-k">Direct phone</span>' +
                    '<a class="src-reg-v" href="tel:' + esc(telDigits) + '">' + esc(telShown) + '</a></div>' : '') +
                (sdp.contactEmail ? '<div class="src-reg-row"><span class="src-reg-k">Email</span>' +
                    '<a class="src-reg-v" href="mailto:' + esc(sdp.contactEmail) + '">' +
                    esc(sdp.contactEmail) + '</a></div>' : '') +
                '</div>' +
                '<p class="src-note">Published by the facility itself in its ECCC GHGRP filing — ' +
                'the registry\'s public contact for exactly this kind of enquiry.</p>';
        }

        /* ROUTES TO A NUMBER, immediately above the boxes you would paste it
           into. For a US landfill there is nothing to display and nothing that
           could be — EPA publishes the owner, the ownership share and the
           facility address, and never a phone, an email or a person. So the
           block turns what IS published into the shortest path to what is not,
           and says out loud why the app has nothing of its own to show. */
        html += contactRoutesBlock(c, co);

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
            // ---- Terms, as quoted -------------------------------------------------------
            // What the producer actually said, on THIS site. Until now there was nowhere to put
            // it: the panel's old "Power $/kWh" box wrote the GLOBAL scenario, so a quoted rate
            // silently re-priced all 18,688 prospects and was then discarded.
            //
            // The as-quoted figure and its units are both stored. A derived $/kWh sits beside
            // them and never replaces them, because the conversion runs through the engine's
            // heat rate, which varies materially by genset and altitude.
            '<div class="src-field"><label for="crm_rate">Quoted gas / power price</label>' +
            '<input type="number" id="crm_rate" step="0.001" placeholder="what they asked for" value="' +
            (saved.quoted_rate === null || saved.quoted_rate === undefined ? '' : esc(saved.quoted_rate)) +
            '"></div>' +
            '<div class="src-field"><label for="crm_rate_units">Priced in</label>' +
            '<select id="crm_rate_units">' +
            [['usd_kwh', '$/kWh (all-in power)'], ['usd_gj', '$/GJ (fuel only)'],
             ['usd_mcf', '$/Mcf (fuel only)']].map(function(u) {
                return '<option value="' + u[0] + '"' +
                       ((saved.quoted_rate_units || 'usd_kwh') === u[0] ? ' selected' : '') +
                       '>' + u[1] + '</option>';
            }).join('') + '</select></div>' +
            '<div class="src-field"><label for="crm_rate_ccy">Currency</label>' +
            '<select id="crm_rate_ccy">' +
            ['USD', 'CAD'].map(function(cc) {
                return '<option value="' + cc + '"' +
                       ((saved.power_rate_currency || 'USD') === cc ? ' selected' : '') +
                       '>' + cc + '</option>';
            }).join('') + '</select></div>' +
            // Who owns the genset decides whether generation, interconnection and commissioning
            // are your capital or already in their price. Worth $1.11M on a 1 MW raw flare, and
            // until now it was silently assumed to be the producer.
            '<div class="src-field"><label for="crm_gen_own">Generator owned by</label>' +
            '<select id="crm_gen_own">' +
            [['', 'not established'], ['producer', 'the producer'], ['client', 'us'],
             ['operator', 'a third-party operator']].map(function(g) {
                return '<option value="' + g[0] + '"' +
                       ((saved.generator_ownership || '') === g[0] ? ' selected' : '') +
                       '>' + g[1] + '</option>';
            }).join('') + '</select></div>' +
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
            // Composes an addressed enquiry and puts it on the clipboard. Only offered where
            // there is somewhere to send it -- an enquiry with no address is a blank page.
            (draftableFor(c) ? '<button id="srcDraft" class="src-draftbtn">Draft enquiry</button>' : '') +
            '<span id="srcSaveMsg" class="src-note"></span></div>';
        html += '</div>';

        mark('evidence');
        html += '<div class="src-missing"><div class="section-label">Not knowable from orbit</div>' +
            '<p class="src-note">The satellite cannot supply these; they stay blank until someone establishes them on the ground:<br>' +
            '<span class="src-gap">' + SiteData.MANUAL_FIELDS.join(', ').replace(/_/g, ' ') + '</span></p></div>';

        mark('econ');
        html += '<div class="src-trendwrap"><div class="section-label">Power potential by survey year</div>' +
            '<div class="earnings-chart-container" style="height:150px;"><canvas id="dTrend"></canvas></div></div>';

        // ---- Assemble: call sheet, then four disclosures --------------------------------
        //
        // Split on the boundary markers and bucket the sections. Sections keep their order within
        // a group; groups are emitted in the order below regardless of where their sections
        // appeared in the code above.
        var buckets = { scores: '', capacity: '', econ: '', evidence: '', contact: '', pay: '' };
        var parts = html.split(GROUP_MARK);
        for (var pi = 1; pi < parts.length; pi++) {           // [0] is empty, before the first mark
            var close = parts[pi].indexOf('-->');
            if (close < 0) continue;                          // not a marker we wrote
            var gname = parts[pi].slice(0, close);
            if (buckets[gname] === undefined) buckets[gname] = '';
            buckets[gname] += parts[pi].slice(close + 3);
        }

        /* Assembled from the record, the LMOP detail and the GHGRP join — every field
       already on screen somewhere, gathered so the links can be built from them.
       Returns '' when a phone is already published, which is the Alberta case:
       a page of routes to something sitting three lines above is noise, and noise
       beside a real number makes the number look uncertain. */
    function contactRoutesBlock(c, co) {
        if (typeof ContactRoutes === 'undefined') return '';
        var sd = c.sourceDetail || {};
        var gh = (typeof GhgrpContacts !== 'undefined') ? GhgrpContacts.forCandidate(c) : null;
        var opts = {
            name: c.name || sd.name || null,
            owner: sd.owner || null,
            parent: gh ? gh.parent : null,
            operator: (operatorRecord(c) || {}).operator || null,
            operatorPhone: co ? co.phone : null,
            ownershipType: sd.ownershipType || null,
            counterpartyType: sd.counterpartyType || null,
            /* The GHGRP address is the one with a postcode on it; LMOP's is the
               street the landfill sits on. Either identifies the place to a map
               search, so whichever exists is used. */
            address: (gh && gh.address) || sd.address || null,
            city: (gh && gh.city) || sd.city || null,
            state: (gh && gh.state) || sd.state || null,
            zip: (gh && gh.zip) || sd.zip || null,
            county: sd.county || (gh && gh.county ? String(gh.county).replace(/ COUNTY$/i, '') : null),
            frsId: gh ? gh.frsId : null,
            sourceKind: c.source || null
        };
        var list = ContactRoutes.routes(opts);
        if (!list.length) return '';

        var note = ContactRoutes.absenceNote(opts);
        var html = '<div class="src-routes">' +
            '<div class="src-routes-head">How to reach them</div>' +
            (note ? '<p class="src-note src-gap">' + esc(note) + '</p>' : '') +
            '<ul class="src-routelist">';
        for (var i = 0; i < list.length; i++) {
            html += '<li><a class="src-route" href="' + esc(list[i].url) +
                '" target="_blank" rel="noopener noreferrer">' + esc(list[i].label) +
                ' <span class="src-route-out" aria-hidden="true">&#8599;</span></a>' +
                '<span class="src-route-why">' + esc(list[i].why) + '</span></li>';
        }
        return html + '</ul><p class="src-note">Whatever you find goes in the boxes below, ' +
               'and from there into Contacts &mdash; where one person can cover as many sites ' +
               'as they actually do.</p></div>';
    }

    // The call sheet: what you need with somebody on the phone, and nothing else. Built from
        // the group buffers rather than re-rendered, so these blocks cannot drift from the
        // versions inside the disclosures — there is only one of each.
        // Who to ring, on the sheet itself. The full contact block with its provenance and the
        // editable form stays in Terms & contact — this is the one line you need in hand.
        var co = operatorCompany(c);
        var callLine = '';
        if (op && op.operator) {
            var bits = [];
            if (co && co.phone) {
                bits.push('<a class="src-reg-v" href="tel:' +
                    esc(String(co.phone).replace(/[^0-9+]/g, '')) + '">' + esc(co.phone) + '</a>');
            }
            if (co && co.sizeClass) {
                bits.push(esc({ micro: 'Micro', small: 'Small', mid: 'Mid-size', major: 'Major' }[co.sizeClass]) +
                          ' · ' + fmtInt(co.wellsActive) + ' active AB wells');
            }
            // Where no phone is published, the filing address is the contact route, so it belongs
            // on the sheet rather than two clicks away inside Terms & contact. Town and state is
            // what identifies the company on a call; the full address stays in the group.
            if (!(co && co.phone) && co && co.address) {
                bits.push(esc([co.city, co.state].filter(Boolean).join(', ')));
            }
            callLine = '<div class="src-callop"><span class="src-op-big">' + esc(op.operator) + '</span>' +
                (bits.length ? '<span class="src-callmeta">' + bits.join(' · ') + '</span>' : '') +
                (co && co.phone ? '' : '<span class="src-gap">' +
                    (co && co.address ? 'no published phone — postal address only'
                                      : 'no published phone') + '</span>') +
                '</div>';
            // The one fact that decides whether this call is even with the right company. 1,294
            // US plants are owned by somebody other than the operator named above, and finding
            // that out two clicks into a collapsed panel is finding it out too late.
            var sdCall = c.sourceDetail || {};
            if (sdCall.ownership && sdCall.ownership !== 'sole_operator') {
                var ownNames = (Array.isArray(sdCall.owners) ? sdCall.owners : [])
                    .map(function(o) { return o.name; });
                callLine += '<div class="src-callown src-disagree">' +
                    (sdCall.ownership === 'joint'
                        ? 'Jointly owned — ' + (ownNames.length
                            ? esc(ownNames.join(', ')) : fmtInt(ownNames.length) + ' parties') +
                          '. A sale needs all of them.'
                        : sdCall.ownership === 'mixed'
                        ? 'Ownership is mixed across the generators — the operator owns some ' +
                          'of this plant and not the rest.'
                        : 'Owned by ' + (ownNames.length ? '<strong>' + esc(ownNames.join(', ')) +
                            '</strong>' : 'another entity') + ', not by the operator.') +
                    '</div>';
            }
        } else {
            callLine = '<div class="src-callop">' + gap('operator not identified') + '</div>';
        }

        var out = '<div class="src-callsheet">' + buckets.pay + callLine + '</div>';
        buckets.pay = '';

        function grp(id, key, label, open) {
            if (!buckets[key]) return '';
            return '<div class="dgroup">' +
                '<button type="button" class="prov-toggle" id="dg_' + id + '_btn" ' +
                    'aria-expanded="false" aria-controls="dg_' + id + '">' +
                    '<span class="prov-caret" aria-hidden="true">&#9656;</span>' +
                    '<span class="section-label">' + esc(label) + '</span>' +
                '</button>' +
                '<div class="dgroup-body" id="dg_' + id + '" hidden>' +
                    '<div class="src-detailgrid">' + buckets[key] + '</div>' +
                '</div></div>';
        }

        out += grp('terms',    'contact',  'Terms & contact');
        out += grp('scores',   'scores',   'Opportunity & acquirability');
        out += grp('capacity', 'capacity', 'Capacity & capital');
        out += grp('econ',     'econ',     'Availability & economics');
        out += grp('evidence', 'evidence', 'Evidence & provenance');

        body.innerHTML = out;

        // Each group remembers its own state, so the ones actually used stay open.
        ['terms', 'scores', 'capacity', 'econ', 'evidence'].forEach(function(g) {
            disclosure('dg_' + g + '_btn', 'dg_' + g, 'protonMiningDetailGroup_' + g, false,
                // The survey-year chart lives in the economics group. Chart.js measures its
                // container, so drawing it while that group is collapsed produces a 0x0 canvas.
                g === 'econ' ? function(isOpen) { if (isOpen) renderTrend(c); } : null);
        });

        wireDetail(c, op);
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
        // The aRate handler is gone with its input — see the comment where it was rendered. It
        // wrote the global scenario from a control that appeared to belong to one site.

        var showCo = document.getElementById('srcShowCompany');
        if (showCo) showCo.addEventListener('click', function() {
            _companyFilter = this.dataset.company;
            _companyFilterId = this.dataset.companyId || null;
            _ignoreNextDocClick = true;
            exitFocus(true);
            applyFilters();
        });

        // Wired BEFORE the early return below: srcSave is absent on some prospects, and an
        // `if (!save) return` above this would take the draft button with it.
        var draft = document.getElementById('srcDraft');
        if (draft) {
            draft.addEventListener('click', function() {
                var cand = _selectedId ? ProspectStore.get(_selectedId) : null;
                var text = cand ? draftEnquiry(cand) : null;
                if (!text) { status('Nothing to draft — no counterparty address for this site.', 'var(--warn)'); return; }
                copyText(text).then(function(ok) {
                    status(ok ? 'Enquiry copied — paste it into a letter or an email. Nothing was sent.'
                              : 'Could not reach the clipboard. The draft is in the console instead.',
                           ok ? 'var(--plat-200)' : 'var(--warn)');
                    if (!ok) console.log(text);
                });
            });
        }

        /* MARKING A SITE VERIFIED, which is an assertion about the world and is therefore
           WRITTEN DOWN rather than held in a variable. It changes the capital-avoided figure by
           millions on a large site, so it has to survive a reload and be visible beside the
           contact notes -- which means it belongs on the saved record, not on the candidate.

           SiteData.update() only mutates a record that already exists, so a prospect nobody has
           saved yet is promoted first. That is the right side effect: you do not inspect a site
           you are not tracking. */
        /* THE MARKET TOGGLE. Redraws the panel and the table, because the setting changes the
           all-in figure every row is sorted and ranked on -- leaving the list showing new-build
           numbers under a panel showing used ones is the disagreement these two surfaces exist
           to be incapable of. Not persisted: it is a way of asking a question, and a remembered
           answer would silently reprice a catalogue on a later visit. */
        var mktBtns = document.querySelectorAll('.src-mktbtn');
        for (var mb = 0; mb < mktBtns.length; mb++) {
            mktBtns[mb].addEventListener('click', function() {
                var m = this.getAttribute('data-mkt');
                setCapMarket(m === 'auto' ? null : m);
                renderDetail();
                applyFilters();
            });
        }

        var verify = document.getElementById('srcVerifyInfra');
        if (verify) verify.addEventListener('click', function() {
            var cand = _selectedId ? ProspectStore.get(_selectedId) : null;
            if (!cand) return;
            var rec = findSavedSite(cand.id);
            if (!rec) {
                try { rec = SiteData.fromCandidate(cand); }
                catch (e) { status('Could not save this site: ' + e.message, 'var(--neg)'); return; }
            }
            SiteData.update(rec.id, { infra_condition_verified: true });
            clearCapitalCache();
            status('Marked verified — capital avoided is now valued in full, and this site is ' +
                   'tracked under My sites.', 'var(--plat-200)');
            renderDetail();
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
                /* NO stage KEY HERE. It used to be in this object and go through
                   SiteData.update, which blindly merges -- no ledger entry, no dead-reason
                   gate, and a stale dropdown could silently REGRESS a stage the board had
                   advanced. Stage moves route through SiteData.setStage after the save,
                   below, like every other mover in the app. */
                // A real figure always beats the stage assumption in SiteCapex.
                estimated_acquisition_cost: (function() {
                    var el = document.getElementById('crm_acq');
                    if (!el || el.value === '') return null;
                    var v = parseFloat(el.value);
                    return isFinite(v) && v >= 0 ? v : null;
                })(),
                quoted_rate: quotedRateInput(),
                quoted_rate_units: (function() {
                    var el = document.getElementById('crm_rate_units');
                    return (el && quotedRateInput() !== null) ? el.value : null;
                })(),
                // The engine prices in $/kWh, so the quote is converted once here rather than at
                // every read. The as-quoted pair above survives alongside it — the derived figure
                // is an estimate and must never be mistaken for what was said.
                power_rate: derivedPowerRate(),
                power_rate_currency: (function() {
                    var el = document.getElementById('crm_rate_ccy');
                    return (el && derivedPowerRate() !== null) ? el.value : null;
                })(),
                generator_ownership: (function() {
                    var el = document.getElementById('crm_gen_own');
                    return (el && el.value) ? el.value : null;
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
            /* Operator identity is copied from the regulator index, never typed — keeping it
               apart from the contact fields is what stops a guess acquiring the authority of
               a filing. INCLUDED ONLY WHEN THE LOOKUP RETURNED SOMETHING: these keys used to
               be written unconditionally as null whenever `op` was absent at save time, so a
               record that had a counterparty on it lost it because a later save ran before a
               lookup finished. An absent lookup must leave stored identity untouched. */
            if (op) {
                changes.operator = op.operator;
                changes.operator_licence = op.licence || null;
                changes.operator_source = op.source;
                changes.operator_distance_m = op.distance_m;
            }
            var existing = findSavedSite(c.id);
            var written;
            if (existing) {
                written = SiteData.update(existing.id, changes);
            } else {
                var site = SiteSources.toSite(c, changes);
                site.id = c.id;                       // keep the flare id so it is re-findable
                site.name = placeLabel(c);
                site.discovery = site.discovery || {};
                site.discovery.flareId = c.id;
                written = SiteData.add(site);
            }

            /* THE STAGE MOVES THROUGH THE FRONT DOOR. setStage writes the ledger entry,
               enforces the dead-reason gate, and registers the sync push — everything the old
               blind merge skipped. Same prompts as the board's drop handler, because a deal
               dying on the map is the same event as a deal dying on the board and the reason
               is worth exactly as much. */
            (function() {
                var sel = document.getElementById('crm_stage');
                var savedRec = findSavedSite(c.id);
                if (!sel || !savedRec || sel.value === savedRec.stage) return;
                var opts = {};
                if (sel.value === 'dead' && typeof CrmConfig !== 'undefined') {
                    var reasons = CrmConfig.deadReasons();
                    var menu = reasons.map(function(r, i) { return (i + 1) + ') ' + r.label; }).join('\n');
                    var pick = window.prompt('Why did this die?\n\n' + menu + '\n\nEnter a number:');
                    if (pick === null) { sel.value = savedRec.stage; return; }   // cancelled: nothing moves
                    var idx = parseInt(pick, 10) - 1;
                    if (!(idx >= 0 && idx < reasons.length)) {
                        window.alert('That is not one of the reasons, so the stage was not changed.');
                        sel.value = savedRec.stage;
                        return;
                    }
                    opts.deadReason = reasons[idx].key;
                }
                var moved = SiteData.setStage(savedRec.id, sel.value, opts);
                if (moved && moved.ok === false) { window.alert(moved.err); sel.value = savedRec.stage; }
                else if (!moved) { window.alert('That stage is not on the pipeline.'); sel.value = savedRec.stage; }
            })();

            /* THE CALL REACHES THE CONTACT CLOCK. Recording "owner confirmed availability" here
               used to touch only distress_signals, so the Today view went on saying "never
               contacted" about a prospect whose owner was spoken to on a known date -- the loop
               from found-a-site to called-the-person to next-action-due broke at the map.
               Logged only when THIS save added or changed the outcome, not on every save of a
               record that already carried one. */
            (function() {
                if (typeof CrmInteractions === 'undefined') return;
                var sel = document.getElementById('crm_outcome');
                if (!sel || !sel.value) return;
                var prevEntry = contactOutcomeEntry(existing);
                var dEl = document.getElementById('crm_outcome_date');
                var when = (dEl && dEl.value) ? dEl.value : null;
                if (prevEntry && prevEntry.type === sel.value &&
                    (prevEntry.date || null) === when) return;    // unchanged: not a new call
                var savedRec2 = findSavedSite(c.id);
                if (!savedRec2) return;
                var OUTCOME_WORDS = {
                    owner_confirmed_available: 'Owner confirmed the site is available',
                    owner_confirmed_taken: 'Owner confirmed the site is taken',
                    owner_unresponsive: 'Owner unresponsive'
                };
                CrmInteractions.log(savedRec2.id, {
                    type: 'call',
                    occurred_at: when || undefined,
                    summary: (OUTCOME_WORDS[sel.value] || sel.value) + ' — recorded on the map.',
                    outcome: sel.value === 'owner_confirmed_available' ? 'positive'
                           : sel.value === 'owner_confirmed_taken' ? 'negative' : 'no_answer'
                });
            })();

            /* INTO THE CONTACT BOOK, not just onto this site. The flat fields are
               where a contact is typed, and leaving it there rebuilds the exact
               problem the contact store exists to solve: a county authority holds
               three landfills, and a number recorded against each of them is the
               same person going stale in three places.
               absorb() finds them if they are already known, links them to this
               prospect as well, and fills gaps without overwriting anything. It
               matches on email outright and on a phone only when the names agree,
               because a switchboard is shared by a whole department. */
            var absorbed = null;
            if (typeof CrmContacts !== 'undefined' && CrmContacts.absorb &&
                (changes.contact_name || changes.contact_email || changes.contact_phone)) {
                var savedNow = findSavedSite(c.id);
                var pid = savedNow ? savedNow.id : c.id;
                try {
                    absorbed = CrmContacts.absorb(pid, {
                        name: changes.contact_name,
                        email: changes.contact_email,
                        phone: changes.contact_phone,
                        role: changes.contact_role,
                        notes: changes.contact_notes,
                        organization: changes.operator || null,
                        source: 'recorded on the prospect'
                    });
                } catch (e) { absorbed = null; }
            }

            // Report what actually happened. This printed "Saved" unconditionally, including
            // when localStorage was full and the record had been silently dropped — the one
            // failure that loses a deal record was also the one the user could never see.
            var msg = document.getElementById('srcSaveMsg');
            var result = written && written._save;
            if (msg) {
                if (result && result.ok === false) {
                    msg.textContent = result.err || 'Not saved.';
                    msg.style.color = 'var(--neg)';
                } else {
                    /* Say which of the two happened, because "added to Contacts"
                       and "linked to somebody already there" mean different things
                       about how much of the book you have built. */
                    var extra = '';
                    if (absorbed && absorbed.ok) {
                        var n = absorbed.contact.linked_prospects.length;
                        extra = absorbed.created
                            ? ' ' + (absorbed.contact.name || 'Contact') + ' added to Contacts.'
                            : (absorbed.linked
                                ? ' Linked to ' + (absorbed.contact.name || 'a contact') +
                                  ' in Contacts — now on ' + n + ' sites.'
                                : '');
                    }
                    msg.textContent = 'Saved — syncs across your devices.' + extra;
                    msg.style.color = 'var(--pos)';
                }
            }
            if (result && result.ok === false) return;   // nothing was stored; do not re-render as if it were
            // Contact fields feed the actionability component, so a saved phone number changes
            // the opportunity score. Drop the memoised scores or the table would keep showing
            // the pre-edit ranking.
            invalidateOpportunity();
            renderWorklist();
            renderResults();
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
        _trendChart = new Chart(el, {
            type: 'bar',
            data: {
                labels: meta.years,
                datasets: [{
                    label: 'kW potential', data: series,
                    backgroundColor: ProtonTheme.alpha(ProtonTheme.btc, 0.5), borderColor: ProtonTheme.btc, borderWidth: 1
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
                    x: { grid: {}, ticks: {} },
                    y: { grid: {},
                         ticks: { callback: function(v) { return v >= 1000 ? (v / 1000) + ' MW' : v + ' kW'; } } }
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
            // Counterparty details for landfills. Deliberately OUTSIDE the try/catch's failure
            // path -- load() swallows its own errors and warns, because a missing contact index
            // must degrade to "no counterparty published" rather than taking down a page that
            // ranks 19,397 prospects perfectly well without it. Awaited so the detail panel never
            // renders a landfill before the lookup is available and silently shows nothing.
            if (typeof GhgrpContacts !== 'undefined') await GhgrpContacts.load();
        } catch (e) {
            status('Could not load prospects: ' + e.message, 'var(--neg)');
            var l = document.getElementById('srcTableBody');
            if (l) l.innerHTML = '<tr><td colspan="18" class="src-gap" style="padding:14px;">' +
                'Prospects unavailable. Run <code>node tools/build-flare-catalog.js</code>.</td></tr>';
            return;
        }
        var meta = SiteCatalog.meta();

        // A source that failed or dropped rows is reported, not swallowed.
        var errs = ProspectStore.errors();
        if (errs.length) {
            /* THE REASON, NOT JUST THE NAME. This listed four source ids and dropped e.error
               on the floor, so a page reporting every source broken said nothing whatever about
               WHY -- and the adapters are the one part of the load that cannot be diagnosed
               from the console, because each failure is caught and turned into a data row.
               A message that names a problem without naming its cause costs more time than no
               message, because it looks like it has already been investigated. */
            status(errs.length + ' source' + (errs.length > 1 ? 's' : '') + ' failed. ' +
                   errs.map(function(e) {
                       return e.source + ': ' + (e.error || 'no reason reported');
                   }).join(' | '), 'var(--neg)');
            /* And in full to the console, where a stack is readable and a long message is not
               truncated by a status bar. */
            if (window.console) console.error('[Sourcing] sources failed', errs);

            /* A RETRY, because the failure was CACHED. ProspectStore.load() memoises whatever
               it got -- including a partial result -- so a transient network failure on one
               source stuck until a full page reload, and the status line above read as a
               diagnosis when it was actually a dead end. The button resets the store and
               reboots the prospects mode; the three sources that worked reload from HTTP cache
               in milliseconds, so retrying everything costs less than machinery for retrying
               one. */
            var statusEl = document.getElementById('srcStatus');
            if (statusEl && !document.getElementById('srcRetrySources')) {
                var rb = document.createElement('button');
                rb.id = 'srcRetrySources';
                rb.className = 'src-linkbtn';
                rb.textContent = 'Retry failed sources →';
                rb.addEventListener('click', function() {
                    rb.disabled = true;
                    ProspectStore.reset();
                    _booted = false;
                    boot();
                });
                statusEl.appendChild(document.createTextNode(' '));
                statusEl.appendChild(rb);
            }
        }

        // Only the countries Proton operates in. The catalog still holds all 30,361 prospects and
        // ProspectStore.countries() still reports every one of them -- this narrows the CONTROL to
        // the scope, so the select is two entries rather than a list of eighty, most of which
        // return nothing because SCOPE_ISO3 excludes them anyway. A select offering choices that
        // silently yield zero results is worse than not offering them.
        var sel = document.getElementById('fCountry');
        if (sel) {
            var counts = {};
            (ProspectStore.countries() || []).forEach(function(x) { counts[x.iso3] = x.count; });
            SCOPE_ISO3.forEach(function(iso) {
                var o = document.createElement('option');
                o.value = iso;
                // The count is the scope's own count, so it cannot promise rows the scope excludes.
                o.textContent = countryName(iso) + (counts[iso] ? ' (' + fmtInt(counts[iso]) + ')' : '');
                sel.appendChild(o);
            });
            sel.value = '';                    // both countries; the scope is the default view
        }

        // The baseline, snapshotted at exactly this moment: after every shipped default is in
        // place and before any saved search is restored over the top. hasNonDefaultFilters()
        // compares against this rather than FILTER_DEFAULTS, which does not contain fCountry and
        // therefore could not know that CAN above is a default rather than a choice -- so the
        // Refine drawer sprang open on a completely fresh visit, which is the collapse not
        // happening at all. Snapshotting means this stays right if the shipped defaults change.
        captureFilterBaseline();

        /* fMinKw and fMaxKw are NOT in this list. A range input fires 'change' on
           every thumb release as well as streaming 'input' while dragging, so
           they were re-ranking 30,361 rows twice per drag: once from the debounce
           below, once from here the moment the mouse came up. The second one
           always landed on the same values as the first. */
        var searchTimer = null;
        var searchBox = document.getElementById('fSearch');
        if (searchBox) searchBox.addEventListener('input', function() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() { applyFilters('fSearch'); }, 220);
        });
        ['fCountry', 'fYears', 'fSort', 'fActive', 'fOperator', 'fBurning', 'fRegion', 'fRadius'].forEach(function(id) {
            var el = document.getElementById(id);
            // The id, not the Event — reconcileGeo has to know WHICH of the two geographic
            // controls the user just moved to decide which one yields.
            if (el) el.addEventListener('change', function() { applyFilters(id); });
        });
        // Dragging fires continuously, so the track repaints every frame for
        // responsiveness while the expensive re-rank is debounced.
        var sizeTimer = null;
        ['fMinKw', 'fMaxKw'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function() {
                clampThumbs(id);
                liftNearestThumb();
                paintSizeRange();
                renderSizeHint();
                clearTimeout(sizeTimer);
                sizeTimer = setTimeout(applyFilters, 160);
            });
        });
        /* The fill is positioned in pixels against the track's measured width, so
           anything that changes that width leaves it stale — and the width changes
           on every reflow of a responsive column, not just on a window resize.
           Observed rather than timed, for the same reason the map's renderers are. */
        if (typeof ResizeObserver !== 'undefined') {
            var sizeEl = document.getElementById('sizeRange');
            if (sizeEl) new ResizeObserver(function() { paintSizeRange(); }).observe(sizeEl);
        }

        paintSizeRange();
        liftNearestThumb();
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
                    /* The pane is hidden until body[data-detail] says otherwise, and that was
           only ever set inside select(). A selection restored from the last visit
           therefore rendered into a display:none column and showed nothing —
           which is precisely the case restoreView exists to serve, and its own
           comment says the site you were reading "comes back in the detail
           panel". Set it here so that stays true. */
        if (_selectedId) { document.body.setAttribute('data-detail', '1'); renderDetail(); }
                }, 250);
            });
        });
        var colourSel = document.getElementById('scnColour');
        if (colourSel) colourSel.addEventListener('change', function() {
            _colourBy = this.value;
            try { localStorage.setItem('protonMiningProspectColour', _colourBy); } catch (e) {}
            syncScenarioInputs();
            renderMapLayer();
        });
        try {
            var savedColour = localStorage.getItem('protonMiningProspectColour');
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
            renderResults();
            renderPortfolio();
        });

        renderAbout();
        installDismiss();
        wireTable();
        wireAcquisition();
        wireList();
        wireResViews();
        wireUnfocus();
        wireWorklist();
        wireSourceFilter();
        wireCollectionFilter();
        wireEmptyState();
        wireMoreFilters();
        loadSearches();
        wireSaved();
        renderProvenance();
        wireProvenance();
        try {
            var savedSrc = JSON.parse(localStorage.getItem(SRC_FILTER_KEY) || 'null');
            if (savedSrc && savedSrc.ids && savedSrc.ids.length) {
                for (var si = 0; si < savedSrc.ids.length; si++) _srcFilter[savedSrc.ids[si]] = true;
            }
        } catch (e) {}
        // The survey year, from the catalog rather than the markup. It moved from 2022 to 2024
        // with the refresh, which quietly changed what this filter means — a hardcoded label
        // would have kept saying the old thing.
        var yEl = document.getElementById('fActiveYear');
        /* Just the year. The parentheses and the leading space were doing the
           spacing before this became a chip; #fActiveYear now gets margin-left and
           the muted colour from CSS, exactly like .src-srcbtn .n, so writing them
           here as well renders "survey  (2024)" with two gaps and a bracket the
           other chips do not have. */
        if (yEl && meta && meta.dataThrough) yEl.textContent = meta.dataThrough;

        renderSourceFilter();
        renderCollectionFilter();
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
        // Which result surface was last open. Display state, so local only, and set BEFORE the
        // first applyFilters — otherwise the page paints the list and then visibly swaps.
        // NOTE what is deliberately NOT restored here: a saved search. Those are applied only by
        // clicking one. Auto-applying at boot is precisely how the region anchor destroyed a
        // chosen country, and a named search that reapplies itself would be the same bug wearing
        // a better name.
        var savedRes = null;
        try { savedRes = localStorage.getItem(RESVIEW_KEY); } catch (e) {}
        // Passed through rather than re-checked here. setResultsView is the one validator, so a
        // fourth view added later restores itself; the old two-way ternary here would have
        // silently dropped anything it did not already know about back to the list.
        setResultsView(savedRes, true);
        applyFilters();
        // Only at boot, and only if a restored filter is genuinely excluding something. Doing it
        // on every applyFilters would re-open the drawer the moment you closed it, which turns a
        // deliberate act into a fight; doing it never would restore a search whose controls are
        // out of sight.
        revealRefineIfFiltering();
        // The detail panel is painted from the restored selection. applyFilters had to run first
        // so the table exists for the row to be highlighted in.
        /* The pane is hidden until body[data-detail] says otherwise, and that was
           only ever set inside select(). A selection restored from the last visit
           therefore rendered into a display:none column and showed nothing —
           which is precisely the case restoreView exists to serve, and its own
           comment says the site you were reading "comes back in the detail
           panel". Set it here so that stays true. */
        if (_selectedId) { document.body.setAttribute('data-detail', '1'); renderDetail(); }

        var warn = [];
        if (!_market || !_market.btcPriceUsd) warn.push('BTC price');
        if (!_market || !_market.networkHashratePh) warn.push('network hashrate');

        if (warn.length) {
            status('Catalog loaded — ' + warn.join(' and ') + ' unavailable, economics incomplete', 'var(--warn)');
        } else if (restored) {
            // Say so explicitly: a restored search otherwise looks like the app ignored its own
            // defaults, and you cannot tell whether the filters are yours or stale.
            status('Restored your last search — ' + fmtInt(_filtered.length) + ' prospects of ' +
                   fmtInt(ProspectStore.all().length) + ' in catalog', 'var(--plat-200)');
        } else {
            // Sourced from the store, not the flare artifact — with a second adapter registered
            // this line would otherwise under-report the catalog and still call it "flare sites".
            var srcs = ProspectStore.sources().filter(function(s) { return s.count > 0; });
            status(fmtInt(ProspectStore.all().length) + ' prospects from ' + srcs.length + ' source' +
                   (srcs.length === 1 ? '' : 's') + ' · survey ' + meta.years[0] + '–' + meta.dataThrough +
                   ' · ' + fmtInt(SiteCatalog.operatorCount()) + ' with a named operator', 'var(--pos)');
        }
    }

    // Called by map.js when a flare marker on the shared globe is clicked.
    function selectFromMap(id) { if (id) select(id, true); }

    /* CLICKING NEAR A MARKER ON THE GLOBE IS CLICKING IT.
     *
     * The long note above wireNearestClick -- WCAG 2.5.8, why the target grows
     * instead of the mark -- was written for the flat map and then only ever
     * implemented there. The globe got nothing: globe.gl raycasts the cylinder
     * geometry itself, so you had to physically hit a marker that measured 2.5
     * pixels across. Sizing them in pixels fixed most of that; this is the rest.
     *
     * onGlobeClick fires only when the ray misses every marker, so this cannot
     * double-fire with onPointClick and needs no equivalent of the flat map's
     * _markerTook flag -- the two handlers are already mutually exclusive.
     *
     * THE FAR SIDE OF THE PLANET PROJECTS PERFECTLY HAPPILY. getScreenCoords is
     * a bare projection with no occlusion test, so a flare in Australia lands on
     * screen next to one in Texas and would win the nearest search from behind
     * the globe. A surface point P is visible from a camera at C exactly when
     * dot(P, C) >= R^2, which is one dot product per candidate. */
    function globeNearest(lat, lng) {
        var g = MapBridge.globe();
        if (!g || MapBridge.mode() !== 'prospects') return false;
        var here, cam;
        try {
            here = g.getScreenCoords(lat, lng, 0);
            cam = g.camera();
        } catch (e) { return false; }
        var cp = cam && cam.position;
        if (!here || !cp) return false;

        var R2 = GLOBE_R * GLOBE_R;
        var best = null, bestD = Infinity;
        for (var i = 0; i < _filtered.length && i < MAP_DRAW_CAP; i++) {
            var c = _filtered[i].candidate;
            if (c.lat === null || c.lng === null) continue;
            var w, sc;
            try {
                w = g.getCoords(c.lat, c.lng, 0);
                if (!w || (w.x * cp.x + w.y * cp.y + w.z * cp.z) < R2) continue;
                sc = g.getScreenCoords(c.lat, c.lng, 0);
            } catch (e) { continue; }
            if (!sc) continue;
            var dx = sc.x - here.x, dy = sc.y - here.y;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
        }
        if (best && Math.sqrt(bestD) <= TOLERANCE_PX) { select(best.id, true); return true; }
        return false;
    }

    return {
        boot: boot,
        selectFromMap: selectFromMap,
        globeNearest: globeNearest,
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
