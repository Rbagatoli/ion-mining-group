// ===== PROTON MINING — the portal, working with no backend =====
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

       A hosting client is the mirror of a producer: their machines sit on Proton's
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
        /* TWO SITES, DIFFERENT SIZES, ON PURPOSE.

           The single-site sample hid a real bug for as long as it existed: both hosting read
           paths took sites[0] and ignored the rest, while the statements list walked all of
           them. Nothing in the preview could show that, because the preview only ever had one
           site — and a sample that cannot reach a bug is a sample that certifies it.

           The second site is deliberately much smaller. A 104/30 split is what catches ratio
           arithmetic done wrong: averaging the two uptimes weights thirty machines the same as a
           hundred and four, and the error is small enough to look plausible. */
        sites: ['SAMPLE-SITE-1', 'SAMPLE-SITE-2']
    };

    function machine(w, kwh, up, th, seen) {
        return { worker: w, kwh: kwh, uptime_pct: up, hashrate_th: th, last_seen: seen };
    }

    /* The statement's per-machine rows, for the same fleet the dashboard shows.
       `dark` names a machine that stopped reporting: its kWh, uptime and hashrate
       are null rather than zero, because nobody knows what it did. */
    function statementFleet(period, dark) {
        var out = [];
        for (var i = 1; i <= 104; i++) {
            var name = 's21-' + (i < 10 ? '00' : (i < 100 ? '0' : '')) + i;
            if (i === dark) {
                out.push(machine(name, null, null, null, period + '-12T06:31:00Z'));
            } else {
                out.push(machine(name, 2604 + ((i * 13) % 40) - 20,
                                 99 + ((i * 3) % 9) / 10,
                                 193 + ((i * 7) % 9), period + '-28T23:50:00Z'));
            }
        }
        return out;
    }

    function hostBase(period, over) {
        var st = {
            statement_id: 'HS-SAMPLE-' + period,
            site_id: 'SAMPLE-SITE-1', version: 1, status: 'issued',
            issued_at: period + '-05T00:00:00Z',
            content_hash: 'demo0000' + period.replace('-', '') + 'host0000000000000000000000',
            period: { id: period },
            draw: {
                kwh: 290160,
                coverage: { period_hours: 744, covered_hours: 744, gap_hours: 0, coverage_pct: 100 },
                gaps: []
            },
            machines: statementFleet(period, null),
            charges: [{ code: 'power', label: 'Metered power',
                        basis_text: '290,160 kWh at the contract rate',
                        amount_usd: 20311.20 }],
            adjustments: [],
            subtotal_usd: 20311.20, adjustments_usd: 0, total_usd: 20311.20,
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
            kwh: 281600,
            coverage: { period_hours: 744, covered_hours: 722, gap_hours: 22, coverage_pct: 97.0 },
            gaps: [{ from: '2026-07-18T02:00:00Z', to: '2026-07-19T00:00:00Z',
                     hours: 22, kind: 'unbounded', volume_kwh: null }]
        },
        // s21-033 stopped reporting on the 12th. Nobody knows what it did after that.
        machines: statementFleet('2026-07', 33),
        charges: [{ code: 'power', label: 'Metered power',
                    basis_text: '281,600 kWh measured over 722 of 744 hours',
                    amount_usd: 19712 }],
        subtotal_usd: 19712, total_usd: 19712, total_is_partial: true,
        basis: {
            unbillable_segments: [{ from: '2026-07-18T02:00:00Z', to: '2026-07-19T00:00:00Z',
                                    reason: 'no meter reading' }],
            unresolved: ['s21-033 stopped reporting on 2026-07-12 and has not been attributed'],
            disclosures: ['22 hours of the period are not covered by a meter reading. ' +
                          'No draw has been estimated for them.'],
            readings_included_count: 8664, engine_version: 'demo'
        }
    });
    var H_JUN = hostBase('2026-06');
    var H_MAY = hostBase('2026-05');

    var HOST_STATEMENTS = { '2026-07': H_JUL, '2026-06': H_JUN, '2026-05': H_MAY };

    /* ---- the live fleet view -----------------------------------------------

       What a hosting client sees FIRST: are my machines running. Modelled on the
       operator's Fleet Dashboard, but summary-first, because a customer wants
       "is my stuff up" before a card per rig.

       ONLY WHAT A POOL CAN ACTUALLY TELL US. Every pool proxy in this repo
       normalises a worker to {worker_name, hashrate, status} — that is the hard
       ceiling. Board temperature, fan speed and per-machine power draw are not
       missing features, they are unobtainable from a pool by construction: a
       pool observes share submissions, not sensors. So they are not here, and
       the provenance line on the page says where each figure does come from.

       Power is site-level because it is METERED at the rack. Dividing it by
       machine count would be an allocation dressed up as a measurement, which
       worker-portal/statement.js refuses to do for revenue and this refuses to
       do for kilowatts.

       The sample fleet carries all three states on purpose, including the one
       the operator dashboard cannot express: s21-03 is reporting nothing, and
       its hashrate is null rather than 0. */
    function rig(w, hr, hr24, seen, reported) {
        return { worker: w, hashrate_th: hr, hashrate_24h_th: hr24,
                 last_seen: seen, reported: reported };
    }

    /* A HUNDRED AND FOUR MACHINES, not four.

       Four made a tidy sample and a misleading one: a hosting customer with a
       container has a hundred-odd machines, and any design that only works for
       four is a design nobody found the problem with. This is the size that
       forces the dashboard to answer "which of my machines is broken" instead of
       "here are all of your machines".

       Generated rather than written out, and DETERMINISTIC -- no Math.random --
       so two reviewers looking at the preview are looking at the same fleet and
       can talk about s21-033 meaning the same thing. */
    function fleetOf(now, count, prefix) {
        count = count || 104;
        prefix = prefix || 's21-';
        var mins = function(n) { return new Date(now - n * 60000).toISOString(); };
        var rigs = [], hashSum = 0, live = 0;
        for (var i = 1; i <= count; i++) {
            var name = prefix + (i < 10 ? '00' : (i < 100 ? '0' : '')) + i;
            var hr = 193 + ((i * 7) % 9);          // 193-201 TH/s, no randomness
            if (i === 33) {
                // Confirmed down: the pool says so too.
                rigs.push(rig(name, null, hr, mins(1440), 'offline'));
            } else if (i === 17 || i === 58 || i === 91) {
                /* The awkward case, three times over: the pool still calls these
                   online because its hourly average has not decayed yet, and
                   nobody has actually heard from them in hours. */
                rigs.push(rig(name, null, hr, mins(180 + i), 'online'));
            } else {
                rigs.push(rig(name, hr, hr - 0.6, mins(1 + (i % 4)), 'online'));
                hashSum += hr;
                live++;
            }
        }
        return { rigs: rigs, hashrate_th: Math.round(hashSum * 10) / 10, live: live };
    }

    /* One site's live fleet. SAMPLE-SITE-2 is the second facility: a third the size, bought
       later, and running slightly worse — which is what makes the combined figures worth
       checking rather than decorative. */
    function hostSite(nowIso, siteId, count, prefix, drawKw, uptime30, kwhToDate) {
        var f = fleetOf(Date.parse(nowIso), count, prefix);
        return {
            site_id: siteId,
            as_of: nowIso,
            summary: {
                machines: f.rigs.length,
                online: f.live,
                hashrate_th: f.hashrate_th,
                /* Metered at the rack for the whole cage, not per machine, and ALL-IN: the same
                   meter carries the cooling. Four S21s are ~14 kW of machine, so ~15.4 kW all-in
                   is about a 10% overhead, and the efficiency card derived from it lands near
                   26 J/TH against a 17.5 J/TH nameplate. Those numbers have to hang together or
                   the preview teaches a reviewer to distrust it. */
                draw_kw: drawKw,
                uptime_pct_30d: uptime30,
                /* Period to date: what the next statement is being built from. hours_covered is
                   what the meter actually saw, not what the calendar elapsed. */
                period: { id: '2026-08', kwh_to_date: kwhToDate, hours_covered: 468,
                          hours_elapsed: 470 }
            },
            rigs: f.rigs
        };
    }

    /* The same combining the Worker does, and it has to STAY the same — which is why
       tests/portal-chart.test.js runs both against one input and compares. Sums add; the one
       ratio is weighted by machine count, because the mean of 99.1% over 104 machines and 98.4%
       over 30 is not the fleet's uptime. */
    function hostCombined(views) {
        var withS = views.filter(function (v) { return v && v.summary; });
        if (!withS.length) return null;
        var out = { machines: 0, online: 0, hashrate_th: 0, draw_kw: 0, uptime_pct_30d: null,
                    sites: views.length, sites_reporting: withS.length, period: null };
        var upW = 0, upM = 0;
        withS.forEach(function (v) {
            var m = v.summary;
            out.machines += m.machines;
            out.online += m.online;
            out.hashrate_th += m.hashrate_th;
            out.draw_kw += m.draw_kw;
            upW += m.uptime_pct_30d * m.machines;
            upM += m.machines;
        });
        out.hashrate_th = Math.round(out.hashrate_th * 10) / 10;
        out.draw_kw = Math.round(out.draw_kw * 10) / 10;
        if (upM > 0) out.uptime_pct_30d = Math.round(upW / upM * 100) / 100;

        /* Energy adds; coverage is the ratio of the totals. Leaving the period null rendered
           "not measured" over the energy card, which is false — it is measured at two meters
           rather than one. */
        var pids = withS.map(function (v) { return v.summary.period && v.summary.period.id; });
        if (pids.length && pids.every(function (x) { return x && x === pids[0]; })) {
            var kwh = 0, cov = 0, ela = 0;
            withS.forEach(function (v) {
                var pd = v.summary.period;
                kwh += pd.kwh_to_date; cov += pd.hours_covered; ela += pd.hours_elapsed;
            });
            out.period = { id: pids[0], kwh_to_date: kwh, hours_covered: cov, hours_elapsed: ela };
        }
        return out;
    }

    function hostRigs(nowIso) {
        var views = [
            hostSite(nowIso, 'SAMPLE-SITE-1', 104, 's21-', 390, 99.1, 182520),
            hostSite(nowIso, 'SAMPLE-SITE-2', 30, 's21b-', 113, 98.4, 52640)
        ];
        return { sites: views, summary: hostCombined(views) };
    }

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

    /* ---- daily history -----------------------------------------------------

       What GET /portal/hosting/series answers, so the chart works with no
       backend. The shape is worker-portal/series.js's, field for field, and
       tests/portal-series.test.js asserts the two agree rather than trusting
       that they do.

       DETERMINISTIC, like the fleet above: no Math.random anywhere. Two people
       looking at the preview are looking at the same history and can talk about
       the dip in it meaning the same thing. The generator is a small integer
       hash of the day index, which gives variation that is stable rather than
       variation that is fresh on every reload.

       THE AWKWARD DAYS ARE THE POINT. A smooth 400-day curve would demonstrate
       the chart and hide every question worth asking of it, so this history
       contains, deliberately:

         — a three-day stretch where the pool did not answer at all. Hashrate,
           uptime and BTC are null; the meter kept working, so kWh is not. This
           is the case that separates "drawn as a gap" from "drawn at zero", and
           a chart that gets it wrong tells a client their fleet died.
         — a day the meter only covered 18 hours. Energy is lower and
           efficiency must NOT improve, because the divisor moves with it.
         — a day the pool's cumulative counter went backwards. BTC is null for
           that day rather than negative.
         — a fleet that grows from 60 machines to 104 partway through, so the
           per-machine and whole-fleet readings visibly diverge.
         — per-TH earnings that decay across the year, because difficulty
           rises. A client's hashrate can be flat while their income falls, and
           that is exactly the thing this chart exists to make visible. */

    var SERIES_DAYS = 400;

    /* A stable 0..1 from an integer. Not random, not sequential — just mixed
       enough that neighbouring days do not march in lockstep. */
    function jitter(n, salt) {
        var x = (n * 2654435761 + (salt || 0) * 40503) % 2147483647;
        if (x < 0) x += 2147483647;
        return (x % 10000) / 10000;
    }

    function dayStr(ms) { return new Date(ms).toISOString().slice(0, 10); }

    /* EVERYTHING BELOW IS EXPRESSED IN t, NOT IN age.

       `age` is days-ago, so it runs backwards: age 399 is the oldest day and
       age 0 is today. Writing trends against it inverts every one of them, and
       the inversion is invisible in the code — the first version of this
       generator had a fleet that shrank from 104 machines to 60, efficiency
       that improved as the hardware got older, and per-TH earnings that rose as
       difficulty rose. Each line looked right on its own.

       t runs 0 at the oldest day to 1 today, so a trend reads in the direction
       it actually happens. */
    function seriesPoint(age, dateStr) {
        var t = (SERIES_DAYS - 1 - age) / (SERIES_DAYS - 1);

        /* A real hosting client does not arrive with their final fleet. This one
           adds a second container about 250 days in. */
        var machines = t >= 0.625 ? 104 : 60;

        /* The pool went quiet for three days. Nobody knows what the fleet did;
           the meter, which is Proton's and on a different path entirely, does. */
        var poolDark = (age >= 118 && age <= 120);

        /* Per-machine hashrate drifts a little day to day and does not trend. */
        var perTh = 193 + jitter(age, 1) * 8;
        var reporting = machines;

        /* Two bad patches: a handful of machines drop out for a week each. */
        if (age >= 60 && age < 67) reporting = machines - Math.round(6 + jitter(age, 2) * 4);
        if (age >= 300 && age < 305) reporting = machines - Math.round(11 + jitter(age, 3) * 6);

        var hashrate = poolDark ? null : Math.round(reporting * perTh * 10) / 10;
        var uptime = poolDark ? null : Math.round(reporting / machines * 10000) / 100;

        /* Efficiency drifts from about 25.5 to about 27 J/TH as the fleet ages
           and summer inlet temperatures rise. The ENERGY is generated from it,
           not the other way round, because the meter is the thing that exists
           and efficiency is the thing derived from it. */
        var effTarget = 25.5 + t * 1.5 + jitter(age, 4) * 0.4;

        /* 18 hours of meter coverage on one day. The energy falls with it and
           the efficiency must not move, which is the assertion in the test. */
        var hours = (age === 200) ? 18 : 24;

        /* Energy is metered for the whole cage, so it does not stop when the
           pool stops answering, and it does not fall when a machine stops
           hashing — a machine that is powered and not hashing still draws. */
        var drawTh = machines * perTh;
        var kwh = Math.round(drawTh * effTarget * hours / 1000 * 1000) / 1000;

        /* BTC per TH per day, decaying as difficulty rises across the year.
           Flat hashrate with falling income is the shape this chart is for. */
        var btcPerThDay = 0.0000061 * (1 - 0.28 * t);
        var btc = (poolDark || hashrate === null)
            ? null
            : Math.round(hashrate * btcPerThDay * (1 + (jitter(age, 5) - 0.5) * 0.16) * 1e8) / 1e8;

        /* The pool reset its cumulative counter here. A difference across a
           reset is meaningless, so the day reports null rather than a negative
           or a clamped zero. */
        if (age === 340) btc = null;

        return {
            date: dateStr,
            hashrate_th: hashrate,
            uptime_pct: uptime,
            workers_reporting: poolDark ? null : reporting,
            workers_total: poolDark ? null : machines,
            btc: btc,
            kwh: kwh,
            hours_covered: hours,
            efficiency_j_th: (hashrate === null || !hashrate)
                ? null
                : Math.round(kwh * 1000 / hours / hashrate * 100) / 100
        };
    }

    /* The whole history, newest day last. Anchored on today so the chart always
       has a present, the same way hostRigs() is anchored on now. */
    function seriesAll(nowMs) {
        var todayMs = Date.parse(dayStr(nowMs) + 'T00:00:00Z');
        var out = [];
        for (var age = SERIES_DAYS - 1; age >= 0; age--) {
            out.push(seriesPoint(age, dayStr(todayMs - age * 86400000)));
        }
        return out;
    }

    /* from/to are inclusive and are CLAMPED to what exists rather than refused.
       A chart asking for a year on an account three months old should show three
       months, not an error. */
    /* THE SECOND SITE STARTS LATER, 150 days in, because that is what actually happens: a
       client buys a second batch for a different facility and it has no history before it
       existed. Combining has to cope with sites whose series do not line up — dropping days
       that are not common to both would silently shorten the whole chart to the newest site. */
    var SITE2_AGE = 150;

    function seriesForSite(nowMs, siteId, from, to) {
        var all = seriesAll(nowMs);
        if (siteId === 'SAMPLE-SITE-2') {
            /* A third the machines, so a third the work and a third the energy. Kept as a scale
               of the same shape rather than a second generator: two sites drifting for reasons
               nobody chose would make the combined figures impossible to reason about. */
            all = all.slice(all.length - SITE2_AGE).map(function (p) {
                function part(v, dp) {
                    if (typeof v !== 'number') return v;
                    var m = Math.pow(10, dp);
                    return Math.round(v * 0.2885 * m) / m;
                }
                return {
                    date: p.date,
                    hashrate_th: part(p.hashrate_th, 1),
                    /* Slightly worse, and its own number rather than the first site's. */
                    uptime_pct: p.uptime_pct === null ? null
                        : Math.round((p.uptime_pct - 0.7) * 100) / 100,
                    workers_reporting: p.workers_reporting === null ? null
                        : Math.round(p.workers_reporting * 0.2885),
                    workers_total: p.workers_total === null ? null : 30,
                    btc: part(p.btc, 8),
                    kwh: part(p.kwh, 3),
                    hours_covered: p.hours_covered,
                    efficiency_j_th: p.efficiency_j_th === null ? null
                        : Math.round((p.efficiency_j_th + 1.4) * 100) / 100
                };
            });
        }
        return all.filter(function (p) {
            return (!from || p.date >= from) && (!to || p.date <= to);
        });
    }

    /* Mirrors worker-portal/series.js combine(). Ratios are recomputed, never averaged: uptime
       is the ratio of the totals and efficiency is summed as WATTS, because each site's watts
       are its own energy over its own coverage hours. */
    function seriesCombine(bySite) {
        var ids = Object.keys(bySite);
        var days = {};
        ids.forEach(function (id) { bySite[id].forEach(function (p) { days[p.date] = true; }); });
        return Object.keys(days).sort().map(function (date) {
            var hr = 0, hrS = false, kwh = 0, kwhS = false, w = 0, wS = false;
            var btc = 0, btcS = false, rep = 0, tot = 0, repS = false, present = 0;
            ids.forEach(function (id) {
                var p = bySite[id].filter(function (x) { return x.date === date; })[0];
                if (!p) return;
                /* Contributed, not merely present in the array — see series.js. */
                if (typeof p.hashrate_th === 'number' || typeof p.kwh === 'number' ||
                    typeof p.btc === 'number' || typeof p.workers_total === 'number') present++;
                if (typeof p.hashrate_th === 'number') { hr += p.hashrate_th; hrS = true; }
                if (typeof p.btc === 'number') { btc += p.btc; btcS = true; }
                if (typeof p.kwh === 'number') {
                    kwh += p.kwh; kwhS = true;
                    if (typeof p.hours_covered === 'number' && p.hours_covered > 0) {
                        w += p.kwh * 1000 / p.hours_covered; wS = true;
                    }
                }
                if (typeof p.workers_reporting === 'number' && typeof p.workers_total === 'number') {
                    rep += p.workers_reporting; tot += p.workers_total; repS = true;
                }
            });
            return {
                date: date,
                hashrate_th: hrS ? Math.round(hr * 100) / 100 : null,
                uptime_pct: (repS && tot > 0) ? Math.round(rep / tot * 10000) / 100 : null,
                workers_reporting: repS ? rep : null,
                workers_total: repS ? tot : null,
                btc: btcS ? Math.round(btc * 1e8) / 1e8 : null,
                kwh: kwhS ? Math.round(kwh * 1000) / 1000 : null,
                hours_covered: null,
                efficiency_j_th: (wS && hrS && hr > 0) ? Math.round(w / hr * 100) / 100 : null,
                sites_reporting: present,
                sites_total: ids.length
            };
        });
    }

    function seriesFor(nowMs, from, to) {
        var bySite = {};
        HOST.sites.forEach(function (id) { bySite[id] = seriesForSite(nowMs, id, from, to); });
        var combined = HOST.sites.length > 1 ? seriesCombine(bySite) : bySite[HOST.sites[0]];

        var src = { days: combined.length, pool_days: 0, meter_days: 0, btc_days: 0 };
        combined.forEach(function (p) {
            if (p.hashrate_th !== null) src.pool_days++;
            if (p.kwh !== null) src.meter_days++;
            if (p.btc !== null) src.btc_days++;
        });
        return {
            bucket: 'day',
            sites: HOST.sites.map(function (id) { return { site_id: id, points: bySite[id] }; }),
            combined: combined,
            sources: src
        };
    }

    /* ---- a producer's daily history ----

       What GET /portal/series answers. Same 400 days and the same deterministic generator as the
       hosting side, and the same rule about awkward days: this history contains a week where the
       meter link was down, a stretch of falling heating value, and a seasonal swing in volume,
       because a chart that only ever demonstrates a tidy line teaches nobody how to read a
       bad one.

       LANDFILL GAS IS SEASONAL AND IT DECLINES. Generation falls in cold weather as the cells
       cool, and a closed cell's output decays year on year. Both are visible here on purpose:
       they are the two things a producer is actually watching for. */
    function gasPoint(age, dateStr) {
        var t = (SERIES_DAYS - 1 - age) / (SERIES_DAYS - 1);

        /* The meter link was down for six days. Nobody knows what flowed; the gas did not stop,
           but nothing metered it, so nothing is billed for it. */
        var meterDark = (age >= 214 && age <= 219);
        if (meterDark) {
            return { date: dateStr, mcf: null, mmbtu: null, btu_scf: null,
                     hours_covered: 0, coverage_pct: 0, usd: null };
        }

        /* A day the link dropped for part of a shift. The volume falls with the coverage, which
           is the point: an unmetered hour is an unbilled hour. */
        var hours = (age === 96) ? 15 : 24;

        /* Seasonal: a slow annual swing, lowest in winter. Plus a gentle decline as the cell
           ages. jitter() keeps day-to-day variation stable rather than fresh on every reload. */
        var season = 1 + 0.13 * Math.sin((age / 365) * 2 * Math.PI + 1.1);
        var decline = 1 - 0.09 * t;
        var mcf = 405 * season * decline * (0.97 + jitter(age, 11) * 0.06) * (hours / 24);

        /* Heating value drifts with air intrusion and cell age. It is a property of the gas, so
           it does NOT scale with the hours metered. */
        var btu = 505 - 14 * t + (jitter(age, 12) - 0.5) * 9;

        var mmbtu = mcf * btu / 1000;
        var RATE = 3.25;                       // usd per MMBtu, the contract rate

        return {
            date: dateStr,
            mcf: Math.round(mcf * 10) / 10,
            mmbtu: Math.round(mmbtu * 10) / 10,
            btu_scf: Math.round(btu),
            hours_covered: hours,
            coverage_pct: Math.round(hours / 24 * 10000) / 100,
            usd: Math.round(mmbtu * RATE * 100) / 100
        };
    }

    function gasAll(nowMs) {
        var todayMs = Date.parse(dayStr(nowMs) + 'T00:00:00Z');
        var out = [];
        for (var age = SERIES_DAYS - 1; age >= 0; age--) {
            out.push(gasPoint(age, dayStr(todayMs - age * 86400000)));
        }
        return out;
    }

    function gasSeriesFor(nowMs, from, to) {
        var pts = gasAll(nowMs).filter(function (p) {
            return (!from || p.date >= from) && (!to || p.date <= to);
        });
        var src = { days: pts.length, meter_days: 0, priced_days: 0 };
        pts.forEach(function (p) {
            if (p.mcf !== null) src.meter_days++;
            if (p.usd !== null) src.priced_days++;
        });
        return {
            bucket: 'day',
            sites: [{ site_id: SELLER.sites[0], points: pts }],
            combined: pts,
            sources: src
        };
    }

    /* ONE VALIDATOR FOR BOTH SERIES ROUTES. It was written inline in the hosting route, and the
       moment a producer route wanted the same rules the choice was to copy it or to lift it. A
       copied validator is two validators, and the one that gets fixed is whichever one somebody
       is looking at.

       THE SHAPE IS NOT THE CHECK. /^\d{4}-\d{2}-\d{2}$/ happily accepts 2026-13-99, and
       Date.parse then rolls a nearly-valid one like 2026-02-31 forward into March — so a
       client asking for a date that does not exist would silently be served a different range
       than the one they asked for. worker-portal/series.js rejects both by parsing and checking
       the value comes back unchanged, and this has to refuse exactly what that refuses or the
       preview teaches a contract the real thing does not honour. */
    function parseRange(path) {
        var q = {};
        var qs = path.indexOf('?') >= 0 ? path.slice(path.indexOf('?') + 1) : '';
        qs.split('&').forEach(function (kv) {
            if (!kv) return;
            var i = kv.indexOf('=');
            if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
        });
        var bad = function (v) {
            if (!v) return false;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
            var ms = Date.parse(v + 'T00:00:00Z');
            return !isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== v;
        };
        if (bad(q.from) || bad(q.to)) return { error: true };
        return { from: q.from, to: q.to };
    }

    // Which set answers depends on the session token, exactly as the real worker decides from the
    // account record — a producer preview cannot reach a hosting path and gets the same 404 the
    // worker gives, so the two previews are as separated as the two accounts are.
    function handle(path, tok) {
        var kind = kindOf(tok) || 'producer';
        var acct = kind === 'hosting' ? HOST : SELLER;
        var map = kind === 'hosting' ? HOST_STATEMENTS : STATEMENTS;
        var listPath = kind === 'hosting' ? '/portal/hosting/statements' : '/portal/statements';

        if (path === '/portal/me') return { ok: true, status: 200, body: withFlag(acct) };
        if (kind === 'producer' && path.indexOf('/portal/series') === 0) {
            var pq = parseRange(path);
            if (pq.error) return { ok: false, status: 400, body: { error: 'bad range' } };
            return { ok: true, status: 200,
                     body: withFlag(gasSeriesFor(Date.now(), pq.from, pq.to)) };
        }
        if (kind === 'hosting' && path.indexOf('/portal/hosting/series') === 0) {
            var hq = parseRange(path);
            if (hq.error) return { ok: false, status: 400, body: { error: 'bad range' } };
            return { ok: true, status: 200,
                     body: withFlag(seriesFor(Date.now(), hq.from, hq.to)) };
        }
        if (kind === 'hosting' && path === '/portal/hosting/rigs') {
            return { ok: true, status: 200,
                     body: withFlag(hostRigs(new Date().toISOString())) };
        }
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
        host: HOST, hostStatements: HOST_STATEMENTS, hostRigs: hostRigs
    };
})();
