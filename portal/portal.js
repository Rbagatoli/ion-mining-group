// ===== ION MINING GROUP — client portal =====
//
// A landfill or flare site owner signs in and sees what was taken from their site and what they
// are owed. Read-only: nothing here moves money or changes a record.
//
// DELIBERATELY NOT LOADED: sync.js. Every other authenticated page in this app loads it, so this
// is the first auth-without-sync page in the repo — and that is the point. SYNC_KEYS covers
// fleet, wallet, payouts and banking, all of which are Ion's. A counterparty's browser has no
// business holding the operator's sync engine, and the surest way to guarantee it never does is
// not to ship it.
//
// Also not loaded: shared.js, which builds the operator nav and its six tabs. The portal is not a
// view of the app; it is a different application that happens to share a palette.
//
//
// THE ONE RENDERING RULE.
//
// null is not zero, and it must not LOOK like zero. A statement carrying "0 Mcf" when the truth
// is "the meter was down and nobody knows" is the failure this whole system is built to avoid,
// and it would be undone here by a template that prints an empty string. So every figure goes
// through num()/money(), which render an absent value as an explicit, visible "not measured".

var IonPortal = (function() {
    'use strict';

    // Empty in the repo, exactly as site/orders-api.js keeps ORDERS_ENDPOINT empty: the deployed
    // URL is not knowable here, and a key or an endpoint baked into a static page is a published
    // one. On localhost it falls back to a same-origin /api so there is no port to hardcode and
    // no CORS preflight in development.
    var PORTAL_ENDPOINT = '';

    var SESSION_KEY = 'ionPortalSession';

    function isLocal() {
        return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    }

    function base() {
        if (PORTAL_ENDPOINT) return PORTAL_ENDPOINT;
        if (isLocal()) return location.origin + '/api';
        return '';
    }

    function session() {
        try { return localStorage.getItem(SESSION_KEY) || null; } catch (e) { return null; }
    }
    function setSession(t) {
        try { if (t) localStorage.setItem(SESSION_KEY, t); else localStorage.removeItem(SESSION_KEY); }
        catch (e) { /* private mode: the session simply does not persist */ }
    }

    // Every call goes through here so there is one place that handles "not configured" and one
    // place that handles an expired session.
    async function api(path, opts) {
        opts = opts || {};
        var url = base() + path;
        if (!base()) {
            return { ok: false, notConfigured: true };
        }
        var headers = { 'Content-Type': 'application/json' };
        var tok = session();
        if (tok && !opts.noAuth) headers.Authorization = 'Bearer ' + tok;

        var res;
        try {
            res = await fetch(url, {
                method: opts.method || 'GET', headers: headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined
            });
        } catch (e) {
            return { ok: false, offline: true };
        }

        // A session that has expired or been revoked. Clear it rather than looping on 401s.
        if (res.status === 401 && !opts.noAuth) {
            setSession(null);
            return { ok: false, unauthorized: true };
        }
        var body = null;
        try { body = await res.json(); } catch (e) {}
        return { ok: res.ok, status: res.status, body: body };
    }

    // ---- Rendering ---------------------------------------------------------------------------
    //
    // The absent value is rendered, not skipped. "not measured" is a fact about the period and
    // the seller is entitled to see it — it is usually the most important thing on the page.
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function num(v, unit) {
        if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) {
            return '<span class="pt-absent">not measured</span>';
        }
        return esc(v.toLocaleString('en-US', { maximumFractionDigits: 3 })) +
               (unit ? ' <span class="pt-unit">' + esc(unit) + '</span>' : '');
    }

    function money(v) {
        if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) {
            return '<span class="pt-absent">not calculated</span>';
        }
        return '$' + esc(v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }

    function pct(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '<span class="pt-absent">unknown</span>';
        return esc(v.toFixed(1)) + '%';
    }

    function date(iso) {
        if (!iso) return '<span class="pt-absent">--</span>';
        var d = new Date(iso);
        if (!isFinite(d.getTime())) return '<span class="pt-absent">--</span>';
        return esc(d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }));
    }

    function status(msg, kind) {
        var el = document.getElementById('ptStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.className = 'pt-status' + (kind ? ' pt-' + kind : '');
        el.style.display = msg ? '' : 'none';
    }

    // The banner that must never be subtle. A partial total means a figure the seller may be owed
    // has been left out because Ion has not finished attributing a curtailment — so it is stated
    // at the top of the statement in its own box, not as a footnote.
    function partialBanner(st) {
        if (!st.total_is_partial) return '';
        return '<div class="pt-partial"><strong>This total is incomplete.</strong> ' +
            'One or more items could not be calculated yet and have been left out of the figure ' +
            'below rather than estimated. They are listed under Basis. The final amount will be ' +
            'higher than or equal to what is shown.</div>';
    }

    return {
        api: api, session: session, setSession: setSession, base: base,
        esc: esc, num: num, money: money, pct: pct, date: date,
        status: status, partialBanner: partialBanner,
        SESSION_KEY: SESSION_KEY, PORTAL_ENDPOINT: PORTAL_ENDPOINT
    };
})();
