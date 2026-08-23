// ===== ION MINING GROUP — the portal, working with no backend =====
//
// A browser-side stand-in for worker-portal, so the whole producer experience can be clicked
// through with no server running, no account, and nothing deployed.
//
// WHY THIS EXISTS. Signing in needs a Firebase account that exists, linked to a seller record
// that exists, in a Worker that is deployed. None of that is true yet, so the portal could be
// looked at and not used — and a portal nobody can click is not reviewable.
//
//
// WHAT KEEPS IT HONEST. Four things, and they are not optional:
//
//   1. It is fenced on PORTAL_ENDPOINT being empty. The moment a real backend is configured this
//      file stops being reachable — not by a flag somebody has to remember to flip, but because
//      the condition that allows it is the same condition that means there is no real service.
//      There is a test.
//
//   2. It must be ASKED FOR. No page enters demo mode on its own; somebody clicks a button that
//      says what it is. A counterparty who was sent the real link and tries to sign in gets the
//      real refusal, not a lobby full of invented numbers.
//
//   3. Every screen carries a banner saying nothing on it is real, and the banner is not
//      dismissible. site/orders-demo.js learned this the hard way: stubbing below the surface
//      meant the page had no way to know it was pretending, and it showed a fake bitcoin address
//      while saying "waiting for payment".
//
//   4. The data is conspicuously not a real counterparty. The site is named SAMPLE, the figures
//      are round, and the legal entity says so.
//
//
// It is NOT restricted to localhost, unlike orders-demo.js, and that is a deliberate difference.
// The orders demo stands next to a real payment flow where a mistake moves money. This one shows
// read-only sample statements on a page that has no backend at all, and the whole point is that
// the portal can be reviewed at the URL it actually lives at. The fence is the endpoint, not the
// hostname.

var PortalDemo = (function() {
    'use strict';

    /* One token per portal, because there are two portals and a preview of one
       is not a preview of the other. The kind is IN the token rather than in a
       second localStorage key, so there is exactly one thing to clear on the way
       out and no way to end up previewing hosting with a producer flag. */
    var SESSIONS = { producer: 'demo-session-producer', hosting: 'demo-session-hosting' };
    var SESSION = SESSIONS.producer;

    function sessionFor(kind) { return SESSIONS[kind] || null; }
    function isSession(tok) {
        return tok === SESSIONS.producer || tok === SESSIONS.hosting;
    }
    function kindOf(tok) {
        if (tok === SESSIONS.producer) return 'producer';
        if (tok === SESSIONS.hosting) return 'hosting';
        return null;
    }

    // Three periods, chosen to show the behaviour that matters rather than three tidy months.
    // If every sample statement were clean, the parts of this system that exist to handle mess
    // would never be seen by anyone reviewing it.
    var SELLER = {
        seller_id: 'SEL-SAMPLE',
        kind: 'producer',
        legal_name: 'SAMPLE COUNTY AUTHORITY (demonstration data)',
        sites: ['SAMPLE-LANDFILL-1']
    };

    function base(period, over) {
        var st = {
            statement_id: 'ST-SAMPLE-' + period,
            site_id: 'SAMPLE-LANDFILL-1', version: 1, status: 'issued',
            issued_at: period + '-05T00:00:00Z',
            content_hash: 'demo0000' + period.replace('-', '') + '0000000000000000000000000000',
            period: { id: period },
            quantity: {
                billing_basis: 'energy_mmbtu',
                delivered_mcf: 12000, delivered_mmbtu: 6000,
                heating_value_applied: { value_btu_scf: 500, source: 'contract_deemed' },
                coverage: { period_hours: 720, covered_hours: 720, gap_hours: 0, coverage_pct: 100 },
                segments: [], gaps: []
            },
            charges: [{ code: 'gas_purchase', label: 'Gas delivered',
                        basis_text: '6000 MMBtu at 3.25 usd_per_mmbtu', amount_usd: 19500 }],
            adjustments: [],
            subtotal_usd: 19500, adjustments_usd: 0, total_usd: 19500,
            total_is_partial: false, take_or_pay: null,
            basis: { unbillable_segments: [], unresolved: [], disclosures: [],
                     readings_included_count: 720, engine_version: 'demo' },
            history: [{ status: 'issued', at: period + '-05T00:00:00Z' }]
        };
        for (var k in (over || {})) st[k] = over[k];
        return st;
    }

    // A clean month.
    var MAY = base('2026-05');

    // A month with a hole in the meter data. Shows a bounded gap (volume known, timing not) and
    // an unbounded one (volume genuinely unknown), and the disclosure that nothing was estimated.
    var JUN = base('2026-06', {
        quantity: {
            billing_basis: 'energy_mmbtu',
            delivered_mcf: 10420.5, delivered_mmbtu: 5210.25,
            heating_value_applied: { value_btu_scf: 500, source: 'contract_deemed' },
            coverage: { period_hours: 720, covered_hours: 664.5, gap_hours: 55.5, coverage_pct: 92.3 },
            segments: [],
            gaps: [
                { from: '2026-06-11T04:00:00Z', to: '2026-06-12T06:30:00Z', hours: 26.5,
                  kind: 'bounded', volume_mcf: 318.2, cause: 'no_telemetry',
                  resolution: 'unresolved', estimate: null },
                { from: '2026-06-24T09:00:00Z', to: '2026-06-25T14:00:00Z', hours: 29,
                  kind: 'unbounded', volume_mcf: null, cause: 'device_fault',
                  resolution: 'unresolved', estimate: null }
            ]
        },
        charges: [{ code: 'gas_purchase', label: 'Gas delivered',
                    basis_text: '5210.25 MMBtu at 3.25 usd_per_mmbtu', amount_usd: 16933.31 }],
        subtotal_usd: 16933.31, total_usd: 16933.31,
        basis: {
            unbillable_segments: [{ from: '2026-06-24T09:00:00Z', to: '2026-06-25T14:00:00Z',
                                    reason: 'suspect' }],
            unresolved: [], readings_included_count: 664, engine_version: 'demo',
            disclosures: ['Coverage was 92.3%. 55.5 hours of this period are unmeasured and are ' +
                          'listed as gaps. No volume has been estimated for them.']
        }
    });

    // A month where the total is INCOMPLETE, because a curtailment has not been attributed yet.
    // This is the case the whole design exists for, and the one most worth being able to show
    // somebody: the shortfall is left out rather than set to zero, and the page says so.
    var JUL = base('2026-07', {
        quantity: {
            billing_basis: 'energy_mmbtu',
            delivered_mcf: 8100, delivered_mmbtu: 4050,
            heating_value_applied: { value_btu_scf: 500, source: 'contract_deemed' },
            coverage: { period_hours: 744, covered_hours: 744, gap_hours: 0, coverage_pct: 100 },
            segments: [], gaps: []
        },
        charges: [{ code: 'gas_purchase', label: 'Gas delivered',
                    basis_text: '4050 MMBtu at 3.25 usd_per_mmbtu', amount_usd: 13162.50 }],
        adjustments: [{ code: 'prior_period', label: 'Prior period adjustment',
                        relates_to_period: '2026-06', reason: 'transcription_error',
                        amount_usd: 402.15, correction_refs: [] }],
        subtotal_usd: 13162.50, adjustments_usd: 402.15, total_usd: 13564.65,
        total_is_partial: true,
        take_or_pay: { minimum: 5000, excused: 0, adjusted_minimum: 5000, delivered: 4050,
                       ion_curtailed_available: 0, shortfall: null,
                       pending_attribution: true, delivered_is_firm: true },
        basis: {
            unbillable_segments: [], unresolved: ['take_or_pay_shortfall'],
            readings_included_count: 744, engine_version: 'demo',
            disclosures: ['A take-or-pay shortfall cannot be calculated until every curtailment ' +
                          'in this period has been attributed. The total below excludes it.']
        }
    });

    var STATEMENTS = { '2026-07': JUL, '2026-06': JUN, '2026-05': MAY };

    /* ---- the hosting side --------------------------------------------------

       A hosting client is the mirror of a producer: their machines sit on Ion's
       power, so they OWE for metered draw rather than being owed for delivered
       gas. site/hosting.html sets the content, not invention — "Monthly in
       arrears on metered draw" and "Statement includes per-machine kWh, uptime,
       and hashrate for the period".

       Chosen, like the gas samples, to show the awkward cases rather than three
       tidy months: a worker that stopped reporting mid-period has null uptime
       and null hashrate, NOT zero — a machine nobody heard from is not a machine
       that did no work, and the difference is the whole reason this portal
       renders absences out loud. */
    var HOST = {
        seller_id: 'ACC-SAMPLE-HOST',
        kind: 'hosting',
        legal_name: 'SAMPLE FLEET HOLDINGS LLC (demonstration data)',
        sites: ['SAMPLE-SITE-1']
    };

    function machine(w, kwh, up, th, seen) {
        return { worker: w, kwh: kwh, uptime_pct: up, hashrate_th: th, last_seen: seen };
    }

    function hostBase(period, over) {
        var st = {
            statement_id: 'HS-SAMPLE-' + period,
            site_id: 'SAMPLE-SITE-1', version: 1, status: 'issued',
            issued_at: period + '-05T00:00:00Z',
            content_hash: 'demo0000' + period.replace('-', '') + 'host0000000000000000000000',
            period: { id: period },
            draw: {
                kwh: 268400,
                coverage: { period_hours: 744, covered_hours: 744, gap_hours: 0, coverage_pct: 100 },
                gaps: []
            },
            machines: [
                machine('s21-01', 67100, 99.4, 197.2, period + '-31T23:50:00Z'),
                machine('s21-02', 66980, 99.1, 195.8, period + '-31T23:50:00Z'),
                machine('s21-03', 67210, 99.6, 198.0, period + '-31T23:50:00Z'),
                machine('s21-04', 67110, 99.2, 196.4, period + '-31T23:50:00Z')
            ],
            charges: [{ code: 'power', label: 'Metered power',
                        basis_text: '268,400 kWh at the contract rate',
                        amount_usd: 18788 }],
            adjustments: [],
            subtotal_usd: 18788, adjustments_usd: 0, total_usd: 18788,
            total_is_partial: false,
            basis: { unbillable_segments: [], unresolved: [], disclosures: [],
                     readings_included_count: 8928, engine_version: 'demo' }
        };
        for (var k in (over || {})) st[k] = over[k];
        return st;
    }

    var H_JUL = hostBase('2026-07', {
        // A meter link down for most of a day. The hours are a hole with a start
        // and an end; the kWh in it are not estimated, so the total says so.
        draw: {
            kwh: 259900,
            coverage: { period_hours: 744, covered_hours: 722, gap_hours: 22, coverage_pct: 97.0 },
            gaps: [{ from: '2026-07-18T02:00:00Z', to: '2026-07-19T00:00:00Z',
                     hours: 22, kind: 'unbounded', volume_kwh: null }]
        },
        machines: [
            machine('s21-01', 65100, 98.9, 196.1, '2026-07-31T23:50:00Z'),
            machine('s21-02', 64900, 98.5, 194.9, '2026-07-31T23:50:00Z'),
            // Stopped reporting on the 12th. Nobody knows what it did after that.
            machine('s21-03', null, null, null, '2026-07-12T06:31:00Z'),
            machine('s21-04', 64980, 98.7, 195.5, '2026-07-31T23:50:00Z')
        ],
        charges: [{ code: 'power', label: 'Metered power',
                    basis_text: '259,900 kWh measured over 722 of 744 hours',
                    amount_usd: 18193 }],
        subtotal_usd: 18193, total_usd: 18193, total_is_partial: true,
        basis: {
            unbillable_segments: [{ from: '2026-07-18T02:00:00Z', to: '2026-07-19T00:00:00Z',
                                    reason: 'no meter reading' }],
            unresolved: ['s21-03 stopped reporting on 2026-07-12 and has not been attributed'],
            disclosures: ['22 hours of the period are not covered by a meter reading. ' +
                          'No draw has been estimated for them.'],
            readings_included_count: 8664, engine_version: 'demo'
        }
    });
    var H_JUN = hostBase('2026-06');
    var H_MAY = hostBase('2026-05');

    var HOST_STATEMENTS = { '2026-07': H_JUL, '2026-06': H_JUN, '2026-05': H_MAY };

    function index(map) {
        return Object.keys(map).map(function(p) {
            var s = map[p];
            return { site_id: s.site_id, period: p, version: 1,
                     issued_at: s.issued_at, total_usd: s.total_usd,
                     total_is_partial: s.total_is_partial };
        });
    }

    // Answers the same paths the Worker does, with the same shapes, so the pages cannot tell the
    // difference except by the demo flag they are required to render.
    //
    // Which set answers depends on the session token, exactly as the real worker decides from the
    // account record — a producer preview cannot reach a hosting path and gets the same 404 the
    // worker gives, so the two previews are as separated as the two accounts are.
    function handle(path, tok) {
        var kind = kindOf(tok) || 'producer';
        var acct = kind === 'hosting' ? HOST : SELLER;
        var map = kind === 'hosting' ? HOST_STATEMENTS : STATEMENTS;
        var listPath = kind === 'hosting' ? '/portal/hosting/statements' : '/portal/statements';

        if (path === '/portal/me') return { ok: true, status: 200, body: withFlag(acct) };
        if (path === listPath) {
            return { ok: true, status: 200, body: withFlag({ statements: index(map) }) };
        }
        var m = path.match(new RegExp('^' + listPath + '/([^/]+)/([0-9]{4}-[0-9]{2})$'));
        if (m) {
            var st = map[m[2]];
            // Same refusal as the real worker, including for a site that is not this account's:
            // "does not exist" and "is not yours" are one answer.
            if (!st || decodeURIComponent(m[1]) !== acct.sites[0]) {
                return { ok: false, status: 404, body: { error: 'not found' } };
            }
            return { ok: true, status: 200, body: withFlag(st) };
        }
        return { ok: false, status: 404, body: { error: 'not found' } };
    }

    // Every response carries it, so a page that forgets to check has still been told.
    function withFlag(o) {
        var out = {};
        for (var k in o) out[k] = o[k];
        out.demo = true;
        return out;
    }

    return {
        SESSION: SESSION, SESSIONS: SESSIONS,
        sessionFor: sessionFor, isSession: isSession, kindOf: kindOf,
        handle: handle,
        seller: SELLER, statements: STATEMENTS,
        host: HOST, hostStatements: HOST_STATEMENTS
    };
})();
