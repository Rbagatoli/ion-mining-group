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

    // ---- The demo stand-in --------------------------------------------------------------------
    //
    // Fenced on PORTAL_ENDPOINT being empty. Not on a flag somebody has to remember to turn off,
    // and not on the hostname: the condition that allows it IS the condition that means there is
    // no real service to reach. Configure a backend and this becomes unreachable in the same
    // edit, which is the only kind of fence that survives being forgotten about. There is a test.
    function demoAvailable() {
        return !PORTAL_ENDPOINT && typeof PortalDemo !== 'undefined';
    }

    // In demo mode only when it was ASKED FOR. A counterparty who was sent the real link and
    // tries to sign in must get the real refusal, not a lobby full of invented numbers.
    //
    // The token carries WHICH portal is being previewed, because there are two of them and they
    // are not interchangeable. PortalDemo owns that shape; this only asks whether a token is one
    // of its own. Deliberately ONE demo module rather than one per portal: demoAvailable() is
    // coupled to the name PortalDemo, so a second module under a second name would answer false
    // here, demoBanner() would return at its first line, and sample data would render with
    // nothing on screen saying so.
    function inDemo() {
        return demoAvailable() && PortalDemo.isSession(session());
    }

    function demoKind() {
        return inDemo() ? PortalDemo.kindOf(session()) : null;
    }

    function startDemo(kind) {
        if (!demoAvailable()) return false;
        var tok = PortalDemo.sessionFor(kind);
        if (!tok) return false;
        setSession(tok);
        return true;
    }

    /* THE DATA ARMS THE BANNER, not just localStorage.
       Every demo response carries demo:true, and until now nothing read it — the
       comment in portal-demo.js claimed "a page that forgets to check has still
       been told" while no page could be told anything. It is read here, at the
       one chokepoint every response passes through, so a sample figure cannot
       reach a screen that is not admitting it is a sample: a stale token, a
       mis-fenced module or a mixed state all still raise the bar. */
    var sawDemoData = false;
    function noteDemo(r) {
        if (r && r.body && r.body.demo === true && !sawDemoData) {
            sawDemoData = true;
            if (typeof document !== 'undefined') demoBanner();
        }
        return r;
    }

    // Every call goes through here so there is one place that handles "not configured" and one
    // place that handles an expired session.
    async function api(path, opts) {
        opts = opts || {};
        var url = base() + path;

        if (inDemo()) return noteDemo(PortalDemo.handle(path, session()));

        if (!base()) {
            return { ok: false, notConfigured: true, demoAvailable: demoAvailable() };
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
        return noteDemo({ ok: res.ok, status: res.status, body: body });
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

    // Not dismissible, and drawn before anything else on the page.
    //
    // site/orders-demo.js learned this the hard way: stubbing below the surface meant the page
    // had no way to know it was pretending, so it showed a fake bitcoin address while saying
    // "waiting for the payment to arrive". A portal that might be showing invented numbers has to
    // say so on every screen that can show them, not once at the door.
    function demoBanner() {
        if (!inDemo() && !sawDemoData) return;
        if (document.getElementById('ptDemoBar')) return;
        var bar = document.createElement('div');
        bar.id = 'ptDemoBar';
        bar.className = 'pt-demobar';
        /* Accurate for BOTH portals. It used to say "no money is owed", which is
           only half true now: a producer is owed by Ion and a hosting client owes
           Ion, so the banner has to deny a debt in either direction. */
        bar.innerHTML = '<strong>Sample data.</strong> Nothing on this screen is real — ' +
            'no meter or machine reported these figures, and no money is owed or due. This is ' +
            'the portal running with no backend, so it can be looked at before there is ' +
            'anything in it. <button type="button" id="ptDemoExit">Leave preview</button>';
        document.body.insertBefore(bar, document.body.firstChild);
        var btn = document.getElementById('ptDemoExit');
        if (btn) btn.addEventListener('click', function() {
            setSession(null);
            location.href = './index.html';
        });
    }

    return {
        api: api, session: session, setSession: setSession, base: base,
        esc: esc, num: num, money: money, pct: pct, date: date,
        status: status, partialBanner: partialBanner,
        demoAvailable: demoAvailable, inDemo: inDemo, demoKind: demoKind, startDemo: startDemo,
        demoBanner: demoBanner,
        SESSION_KEY: SESSION_KEY, PORTAL_ENDPOINT: PORTAL_ENDPOINT
    };
})();
