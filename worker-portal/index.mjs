// ===== PROTON MINING — the energy-seller portal =====
//
// A landfill or flare site owner logs in and sees how much gas was taken from their site and what
// they are owed. Read-only: this worker shows money and never moves it.
//
//
// WHY A WORKER AND NOT FIRESTORE.
//
// The rest of this app syncs through Firestore at users/{uid}/data/{key}, built in the browser
// from the signed-in uid. That is a naming convention, not isolation -- the client asks for its
// own data and is trusted. For one operator that was tolerable, because the only data at risk was
// his own. With a second party it is not.
//
// So the portal's data lives here instead, where every authorization decision is code in this
// repo that can be reviewed and tested, rather than rules in a console that cannot.
//
//
// THREE TIERS, MUTUALLY EXCLUSIVE, DEFAULT DENY.
//
//   DEVICE   a field meter. HMAC-signed. May append readings for its own bound meters and
//            nothing else. Holds no Firebase token and has no path to any other route.
//   SELLER   a counterparty. Firebase -> session -> exactly ONE seller_id, resolved server-side.
//            Cannot express which seller it wants, so it cannot ask for another one.
//   OPS      Proton. Bearer OPS_SECRET, constant-time, and CLOSED when the secret is unset.
//
// Not nested: a device token can never reach a seller route, a seller session can never reach
// ingest, and neither can reach ops. Anything unmatched is refused.
//
//
// TWO RULES ABOUT WHAT THE PORTAL SAYS BACK.
//
// 1. EVERY auth failure returns the same status and the same body. An endpoint that explains
//    which part of a signature failed is an endpoint that helps forge the next attempt.
//    worker-orders makes the same point about its Stripe webhook, which refuses to say why.
//
// 2. "Does not exist" and "is not yours" are the SAME response. Otherwise the portal is an oracle
//    for which sites and periods exist, and a seller can enumerate the others.
//
//
// OPS-ONLY DATA LIVES IN A DIFFERENT KEY, NOT A FILTERED FIELD.
//
// worker-orders' publicView() works because one person maintains one function. A portal grows
// endpoints, and a field that is merely omitted from a view function WILL leak through the next
// one somebody writes. So internal notes, actor identities and curtailment rationale live under
// `stops:`, which no seller-tier route reads -- and that is asserted in tests rather than
// remembered.

// Imported for SIDE EFFECT, then read off globalThis — not `import X from`.
//
// The four modules below are UMD: in node they set module.exports so the test suites can
// require() them, and in a Worker (where `module` is undefined) they attach to `self`. They carry
// no `export default`, so a default import would silently bind undefined and every call would
// fail at runtime rather than at load.
//
// The alternative was ESM modules plus .mjs test files, which is what worker-orders does. This
// way round was chosen so the ledger maths can be tested by the same plain `node tests/*.test.js`
// loop as everything else in this repo — the maths is the part most worth testing, and it should
// not need a different runner.
import './ledger.js';
import './device.js';
import './statement.js';
import './identity.js';

var Ledger = globalThis.PortalLedger;
var Device = globalThis.PortalDevice;
var Statement = globalThis.PortalStatement;
var Identity = globalThis.PortalIdentity;

var ALLOWED_ORIGINS = [
    'https://protonminingco.com',
    'https://www.protonminingco.com',
    'https://rbagatoli.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8080'
];

var MAX_FIELD = 400;
var MAX_READINGS_PER_POST = 64;   // a week of hourly backfill is 168; two posts, not 168
var RATE_PER_HOUR = 120;

// Control characters become spaces rather than vanishing: they arrive inside pasted text as
// newlines and tabs, and deleting them outright joins two words into one. Same reasoning as
// worker-orders.
//
// Written as a charCode comparison rather than a regex character class. The class form needs
// unicode escapes, and an escape is something a tool can interpret -- an earlier draft of this
// file ended up with a literal NUL byte in the source, which turned it binary to grep.
function text(v, max) {
    if (typeof v !== 'string') return '';
    var out = '';
    for (var i = 0; i < v.length; i++) {
        var c = v.charCodeAt(i);
        out += (c < 32 || c === 127) ? ' ' : v.charAt(i);
    }
    return out.replace(/\s+/g, ' ').trim().slice(0, max || MAX_FIELD);
}

function isAllowedOrigin(origin) {
    return !!origin && ALLOWED_ORIGINS.indexOf(origin) >= 0;
}

function corsHeaders(origin) {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Proton-Device, X-Proton-Signature',
        'Cache-Control': 'no-store'
    };
}

function json(body, status, origin) {
    return new Response(JSON.stringify(body), { status: status, headers: corsHeaders(origin) });
}

// The only two failure responses this worker ever gives to an unauthenticated or unauthorized
// caller. Identical bodies, on purpose.
function denied(origin) { return json({ error: 'not authorized' }, 401, origin); }
function absent(origin) { return json({ error: 'not found' }, 404, origin); }

function constantEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// No secret configured means the owner routes are SHUT, not open. The `!!env.OPS_SECRET` is the
// important half of this function.
function isOwner(request, env) {
    var h = request.headers.get('Authorization') || '';
    var t = h.startsWith('Bearer ') ? h.slice(7) : '';
    return !!env.OPS_SECRET && constantEquals(t, env.OPS_SECRET);
}

// The hash that makes a statement frozen. Over the CANONICAL form, so two runs with the same
// figures hash the same regardless of property order — a hash over raw JSON.stringify would
// change when a field was reordered and prove nothing.
async function sha256(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    var view = new Uint8Array(buf), out = '';
    for (var i = 0; i < view.length; i++) out += ('0' + view[i].toString(16)).slice(-2);
    return out;
}

// ---- KV keys ---------------------------------------------------------------------------------
// Padded so lexicographic order equals numeric order, and ISO-8601 UTC sorts correctly.
function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

/* Both are dual-mode modules (module.exports and a global), the same shape ledger.js uses, so
   they are testable under Node and importable here. */
import './series.js';
import './pool.js';
var Series = globalThis.PortalSeries;
var Pool = globalThis.PortalPool;

var K = {
    seller:   function(id) { return 'seller:' + id; },
    site:     function(siteId) { return 'site:' + siteId; },
    meter:    function(meterId) { return 'mtr:' + meterId; },
    device:   function(devId) { return 'dev:' + devId; },
    devKey:   function(devId, kid) { return 'devkid:' + devId + ':' + kid; },
    reading:  function(meterId, epoch, seq) {
        return 'rd:' + meterId + ':' + pad(epoch, 4) + ':' + pad(seq, 12);
    },
    readingIdx: function(siteId, meterId, ts, epoch, seq) {
        return 'rdx:' + siteId + ':' + meterId + ':' + ts + ':' + pad(epoch, 4) + ':' + pad(seq, 12);
    },
    contract: function(siteId, cid, v) { return 'ct:' + siteId + ':' + cid + ':' + pad(v, 3); },
    statement: function(siteId, period, v) { return 'st:' + siteId + ':' + period + ':' + pad(v, 3); },
    // The hosting side of the house, in its own key family. See FAMILIES below
    // for why these are separate keys rather than a field on one record.
    hostStatement: function(siteId, period, v) { return 'hst:' + siteId + ':' + period + ':' + pad(v, 3); },
    hostIssued: function(siteId, period) { return 'htx:' + siteId + ':' + period; },
    // The live fleet view for a hosting site. Last writer wins; it is a snapshot
    // of what the pool last said, not a ledger.
    rigs: function(siteId) { return 'rigs:' + siteId; },

    /* ---- daily history ----
       BUCKETED BY MONTH, NOT BY DAY, and that is a decision about read cost rather than tidiness.
       A key per day means the 12-month view does 365 reads for the pool series and 365 more for
       energy before it can answer, which is both slow and billed. One key per site per month is
       fourteen reads for the same range.

       The trade is a read-modify-write on the current month every time a poll lands. That is safe
       here because there is exactly ONE writer — the scheduled pull — and it is not safe the
       moment anything else writes these keys, because KV has no compare-and-swap. If a second
       writer ever appears this becomes a Durable Object; saying so now is cheaper than working it
       out from a month of quietly lost samples later. */
    hostDaily:   function(siteId, ym) { return 'hsr:' + siteId + ':' + ym; },
    hostKwh:     function(siteId, ym) { return 'hkw:' + siteId + ':' + ym; },
    // The producer side of the same idea: a month of daily gas, one key.
    gasDaily:    function(siteId, ym) { return 'gas:' + siteId + ':' + ym; },
    // The raw polls for one day, kept so a day can be recomputed if the rollup changes.
    poolSamples: function(siteId, day) { return 'hps:' + siteId + ':' + day; },
    // Which pool a site's machines report to, and the wrapped read-only key.
    poolLink:    function(siteId) { return 'pool:' + siteId; },
    // Seller-visible index. Written ONLY at issue, which is what makes "the seller sees nothing
    // until a person decides they should" a property of the data rather than of a filter.
    issued:   function(siteId, period) { return 'stx:' + siteId + ':' + period; },
    // OPS ONLY. No seller-tier route may read a key with this prefix.
    opsSide:  function(siteId, period) { return 'stops:' + siteId + ':' + period; },
    invite:   function(tok) { return 'invite:' + tok; },
    session:  function(tok) { return 'session:' + tok; },
    userSeller: function(uid) { return 'user:' + uid; },
    rate:     function(identity, hour) { return 'rate:' + identity + ':' + hour; }
};

var OPS_PREFIX = 'stops:';

/* ---- Account kind -----------------------------------------------------------------------------

   Two kinds of counterparty sign in at the same door: a PRODUCER sells Proton gas
   or power and is owed money for it; a HOSTING client has machines on Proton's
   power and owes money for it. They see different portals.

   WHICH ONE IS A PROPERTY OF THE ACCOUNT, decided here and never asked of the
   browser. The client is told its kind by /portal/me so it knows what to
   render; it cannot assert one. A request carrying kind=producer from a hosting
   account changes nothing, because nothing reads it.

   THERE IS NO DEFAULT. An account whose kind is missing or unrecognised gets no
   portal at all, rather than falling back to producer. A silent default is how
   a misconfigured hosting account ends up looking at gas statements, and this
   is the repo where an absent value is never quietly a value. */
var ACCOUNT_KINDS = ['producer', 'hosting'];

/* Structurally identical documents, deliberately in SEPARATE key families
   rather than one family with a kind field.

   The reason is the enumeration rule the read path already keeps: "not yours"
   and "does not exist" have to be the same answer. If a hosting statement lived
   under the producer prefix, a producer asking for it would be refused by a
   different branch than one asking for a period that never existed — and a
   difference in which refusal you get is an oracle for what exists. With
   separate families a cross-kind request cannot even name a key. */
var FAMILIES = {
    producer: { prefix: 'stx:', issued: K.issued,     doc: K.statement,     view: sellerView },
    hosting:  { prefix: 'htx:', issued: K.hostIssued, doc: K.hostStatement, view: hostingView }
};

async function rateOk(env, identity, nowMs) {
    var hour = Math.floor(nowMs / 3600000);
    var key = K.rate(identity, hour);
    var n = parseInt(await env.PORTAL.get(key), 10) || 0;
    if (n >= RATE_PER_HOUR) return false;
    // Two hours, so a counter written at :59 still expires after its window closes.
    await env.PORTAL.put(key, String(n + 1), { expirationTtl: 7200 });
    return true;
}

// ---- DEVICE tier -----------------------------------------------------------------------------

async function ingestReadings(request, env, origin, nowMs) {
    var deviceId = text(request.headers.get('X-Proton-Device'), 64);
    var rawBody = await request.text();

    // Everything below returns the SAME denied() — unknown device, revoked key, bad signature,
    // stale timestamp, meter not bound. A caller learns only that it failed.
    if (!deviceId) return denied(origin);
    if (!(await rateOk(env, 'dev:' + deviceId, nowMs))) return denied(origin);

    var dev = await env.PORTAL.get(K.device(deviceId), 'json');
    if (!dev || dev.disabled) return denied(origin);

    var sig = Device.parseSignature(request.headers.get('X-Proton-Signature'));
    if (!sig.kid) return denied(origin);
    var keyRec = await env.PORTAL.get(K.devKey(deviceId, sig.kid), 'json');

    var v = await Device.verify({
        rootKey: env.DEVICE_ROOT_KEY, deviceId: deviceId,
        signatureHeader: request.headers.get('X-Proton-Signature'),
        rawBody: rawBody, nowMs: nowMs,
        keyState: keyRec ? keyRec.state : null
    });
    if (!v.ok) return denied(origin);

    var body;
    try { body = JSON.parse(rawBody); } catch (e) { return json({ error: 'bad request' }, 400, origin); }

    var meterId = text(body.meter_id, 64);
    // A device may only post for meters bound to it. Not a 403 — that would confirm the meter
    // exists.
    if (!meterId || (dev.meters || []).indexOf(meterId) < 0) return denied(origin);

    var meter = await env.PORTAL.get(K.meter(meterId), 'json');
    if (!meter) return denied(origin);

    var list = Array.isArray(body.readings) ? body.readings.slice(0, MAX_READINGS_PER_POST) : [];
    var accepted = [], duplicate = [], conflict = [], rejected = [];

    for (var i = 0; i < list.length; i++) {
        var r = list[i] || {};

        // The epoch is resolved BEFORE validation, not after.
        //
        // It is normally carried once on the envelope rather than repeated on every reading, so
        // validating the reading on its own saw epoch: undefined and refused all of them. The
        // unit tests passed throughout, because they call checkReading with a complete reading;
        // only an end-to-end post through the real route exposed it.
        var epoch = Number(body.epoch != null ? body.epoch : r.epoch);
        var candidate = {
            seq: r.seq, epoch: epoch, index_corrected: r.index_corrected, device_ts: r.device_ts
        };
        var why = Ledger.checkReading(candidate, nowMs);
        if (why) { rejected.push({ seq: r.seq, why: 'invalid' }); continue; }
        var key = K.reading(meterId, epoch, r.seq);
        var existing = await env.PORTAL.get(key, 'json');

        var record = {
            reading_id: 'RD-' + meterId + '-' + pad(epoch, 4) + '-' + pad(r.seq, 12),
            meter_id: meterId, site_id: meter.site_id,
            source: 'device', signed_by_kid: v.kid, authored_by: null,
            epoch: epoch, boot: Number(body.boot) || null, seq: Number(r.seq),
            index_corrected: Number(r.index_corrected),
            index_raw: r.index_raw == null ? null : Number(r.index_raw),
            correction_basis: text(r.correction_basis, 32) || 'evc_onboard',
            device_ts: r.device_ts,
            received_at: new Date(nowMs).toISOString(),
            effective_ts: r.device_ts,
            device_state: {
                flow_status: text(r.flow_status, 16) || 'flowing',
                alarm: !!r.alarm
            },
            // A device may NEVER write a correction. Only a human supersedes; devices append.
            supersedes: null, superseded: false
        };

        if (existing) {
            // Same key, same content: the device is retrying and should stop. Same key, different
            // content: a bug or an attack, and the original stands. Silently overwriting would
            // let a meter rewrite its own history.
            if (existing.index_corrected === record.index_corrected &&
                existing.device_ts === record.device_ts) {
                duplicate.push(r.seq);
            } else {
                conflict.push({ seq: r.seq });
            }
            continue;
        }

        await env.PORTAL.put(key, JSON.stringify(record));
        await env.PORTAL.put(K.readingIdx(meter.site_id, meterId, record.effective_ts, epoch, r.seq),
                             record.reading_id, { metadata: { idx: record.index_corrected } });
        accepted.push(r.seq);
    }

    return json({
        accepted: accepted, duplicate: duplicate, conflict: conflict, rejected: rejected,
        // So a cold device can discipline its clock before its first signed request.
        server_time: new Date(nowMs).toISOString()
    }, 200, origin);
}

// ---- SELLER tier -----------------------------------------------------------------------------

async function sellerFor(request, env, nowMs) {
    var h = request.headers.get('Authorization') || '';
    var tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!Identity.SESSION_SHAPE.test(tok)) return null;
    var sess = await env.PORTAL.get(K.session(tok), 'json');
    return Identity.checkSession(sess, nowMs);
}

// Exchange a Firebase ID token for a portal session. This is the ONLY route that reads a Firebase
// token; everything else uses the session.
async function login(request, env, origin, nowMs) {
    var body;
    try { body = await request.json(); } catch (e) { return denied(origin); }

    var payload;
    try {
        payload = await Identity.verifyIdToken(body.idToken, env.FIREBASE_PROJECT_ID, nowMs);
    } catch (e) { return denied(origin); }

    // The uid -> seller binding is created at invite redemption and never inferred. No binding
    // means no portal account, whatever Firebase says about who they are.
    var link = await env.PORTAL.get(K.userSeller(payload.sub), 'json');
    if (!link || !link.seller_id || link.disabled) return denied(origin);

    var tok = Identity.newSessionToken();
    await env.PORTAL.put(K.session(tok), JSON.stringify({
        uid: payload.sub, seller_id: link.seller_id,
        created_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + Identity.SESSION_TTL_SEC * 1000).toISOString()
    }), { expirationTtl: Identity.SESSION_TTL_SEC });

    return json({ session: tok, seller_id: link.seller_id }, 200, origin);
}

async function redeem(request, env, origin, nowMs) {
    var body;
    try { body = await request.json(); } catch (e) { return denied(origin); }

    var tok = text(body.invite, 40);
    if (!Identity.INVITE_SHAPE.test(tok)) return denied(origin);

    var payload;
    try {
        payload = await Identity.verifyIdToken(body.idToken, env.FIREBASE_PROJECT_ID, nowMs);
    } catch (e) { return denied(origin); }

    var invite = await env.PORTAL.get(K.invite(tok), 'json');
    var check = Identity.checkRedemption(invite, payload, nowMs);
    if (!check.ok) return denied(origin);

    // Single use. Marked before the link is written, so a double-submit cannot bind twice.
    invite.redeemed_at = new Date(nowMs).toISOString();
    invite.redeemed_by = payload.sub;
    await env.PORTAL.put(K.invite(tok), JSON.stringify(invite));
    await env.PORTAL.put(K.userSeller(payload.sub), JSON.stringify({
        seller_id: check.seller_id, linked_at: invite.redeemed_at, disabled: false
    }));

    return json({ ok: true, seller_id: check.seller_id }, 200, origin);
}

// A seller's issued statements. Scoped to their own sites, server-side, from the session.
async function listStatements(env, sellerId, fam, origin) {
    var seller = await env.PORTAL.get(K.seller(sellerId), 'json');
    if (!seller) return absent(origin);

    var out = [];
    var sites = seller.sites || [];
    for (var i = 0; i < sites.length; i++) {
        // The index prefix is written only at issue, so listing it cannot reveal a draft.
        var list = await env.PORTAL.list({ prefix: fam.prefix + sites[i] + ':' });
        for (var j = 0; j < list.keys.length; j++) {
            var ref = await env.PORTAL.get(list.keys[j].name, 'json');
            if (ref) out.push(ref);
        }
    }
    return json({ statements: out }, 200, origin);
}

async function getStatement(env, sellerId, siteId, period, fam, origin) {
    var seller = await env.PORTAL.get(K.seller(sellerId), 'json');
    // "Not yours" and "does not exist" are the same answer, or this is an enumeration oracle.
    if (!seller || (seller.sites || []).indexOf(siteId) < 0) return absent(origin);

    var ref = await env.PORTAL.get(fam.issued(siteId, period), 'json');
    if (!ref) return absent(origin);

    var st = await env.PORTAL.get(fam.doc(siteId, period, ref.version), 'json');
    if (!st || st.status !== 'issued' && st.status !== 'settled') return absent(origin);
    return json(fam.view(st), 200, origin);
}

// What a seller may see of their own statement. history[] carries status and time only -- the
// named ops staff who moved it live in stops:, which no route here reads.
function sellerView(st) {
    return {
        statement_id: st.statement_id, site_id: st.site_id, version: st.version,
        status: st.status, issued_at: st.issued_at, content_hash: st.content_hash,
        period: st.period, quantity: st.quantity,
        charges: st.charges, adjustments: st.adjustments,
        subtotal_usd: st.subtotal_usd, adjustments_usd: st.adjustments_usd,
        total_usd: st.total_usd, total_is_partial: st.total_is_partial,
        take_or_pay: st.take_or_pay,
        basis: st.basis ? {
            unbillable_segments: st.basis.unbillable_segments,
            unresolved: st.basis.unresolved,
            disclosures: st.basis.disclosures,
            readings_included_count: st.basis.readings_included_count,
            engine_version: st.basis.engine_version
        } : null,
        history: (st.history || []).map(function(h) { return { status: h.status, at: h.at }; })
    };
}

/* The live fleet a hosting client may see. A whitelist again, and a tighter one
   than the statement's: this is the only route that publishes anything about an
   individual machine outside a billing document.

   NO SERIAL, NO IP, NO POOL CREDENTIAL, and no field a pool cannot actually
   supply. Every pool proxy in this repo normalises a worker to {worker_name,
   hashrate, status}; board temperature, fan speed and per-machine power draw are
   not obtainable from a pool at all, because a pool observes share submissions
   rather than sensors. They are therefore absent here rather than published as
   permanent nulls.

   `reported` is deliberately named that rather than `status`: it is what the
   pool CLAIMS, and the portal decides what to show from it together with
   last_seen. Two of the pool proxies mark a worker online when its decaying
   hourly hashrate is merely non-zero, so a machine dead fifty minutes still
   reports up — see rigState() in portal/portal.js. */
/* GET /portal/hosting/series?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Two independent sources joined on the day: the client's pool for hashrate, uptime, workers and
 * bitcoin, and Proton's meter for energy. series.js does the joining and owns every rule about what
 * a missing day means; this function's whole job is to fetch the right buckets and hand them over.
 *
 * DEFAULTS TO 90 DAYS rather than to everything. An unbounded default is the kind of thing that
 * looks fine against a demo account with four hundred days in it and turns into a slow endpoint
 * the first time somebody has three years.
 */
async function hostingSeries(env, siteIds, url, origin) {
    var to = url.searchParams.get('to') || Series.dayOf(Date.now());
    var from = url.searchParams.get('from');
    if (!from) {
        var toMs = Series.parseDay(to);
        if (toMs === null) return json({ error: 'bad range' }, 400, origin);
        from = Series.dayOf(toMs - 89 * 86400000);
    }

    var days = Series.daysBetween(from, to);
    /* daysBetween returns [] for a backwards range, a date that does not exist, and a range over
       the cap. All three are the caller asking for something impossible, so all three are a 400
       rather than an empty chart that looks like an account with no history. */
    if (!days.length) return json({ error: 'bad range' }, 400, origin);

    var months = {};
    for (var i = 0; i < days.length; i++) months[days[i].slice(0, 7)] = true;
    var yms = Object.keys(months).sort();

    /* Per site, then combined. THE COMBINING IS DONE HERE rather than in the browser, because
       it is the ratio arithmetic — uptime is the ratio of the totals, efficiency is summed as
       watts — and that is not something to have a second implementation of on the client where
       it cannot be tested against the first. The browser gets both and chooses which to draw. */
    var bySite = {};
    for (var i = 0; i < siteIds.length; i++) {
        var siteId = siteIds[i];
        var pool = {}, energy = {};
        await Promise.all(yms.map(async function (ym) {
            var a = await env.PORTAL.get(K.hostDaily(siteId, ym), 'json');
            var b = await env.PORTAL.get(K.hostKwh(siteId, ym), 'json');
            var d;
            for (d in (a || {})) pool[d] = a[d];
            for (d in (b || {})) energy[d] = b[d];
        }));
        bySite[siteId] = Series.build(days, pool, energy);
    }

    var combined = siteIds.length > 1 ? Series.combine(bySite) : bySite[siteIds[0]];
    return json({
        bucket: 'day',
        sites: siteIds.map(function (id) { return { site_id: id, points: bySite[id] }; }),
        combined: combined,
        sources: Series.sourcesOf(combined)
    }, 200, origin);
}

/* GET /portal/series?from=&to=  — a gas producer's daily history.
 *
 * Deliberately the same shape as the hosting one: per site, plus a combined series when the
 * account has more than one. A producer with two landfills has exactly the question a hosting
 * client with two facilities has.
 *
 * Combining is a plain sum for the quantities and a coverage-weighted figure for heating value,
 * which is the same rule as everywhere else in this file: quantities add, rates do not.
 */
async function producerSeries(env, siteIds, url, origin) {
    var to = url.searchParams.get('to') || Series.dayOf(Date.now());
    var from = url.searchParams.get('from');
    if (!from) {
        var toMs = Series.parseDay(to);
        if (toMs === null) return json({ error: 'bad range' }, 400, origin);
        from = Series.dayOf(toMs - 89 * 86400000);
    }
    var days = Series.daysBetween(from, to);
    if (!days.length) return json({ error: 'bad range' }, 400, origin);

    var months = {};
    for (var i = 0; i < days.length; i++) months[days[i].slice(0, 7)] = true;
    var yms = Object.keys(months).sort();

    var bySite = {};
    for (var j = 0; j < siteIds.length; j++) {
        var siteId = siteIds[j];
        var gas = {};
        await Promise.all(yms.map(async function (ym) {
            var g = await env.PORTAL.get(K.gasDaily(siteId, ym), 'json');
            for (var d in (g || {})) gas[d] = g[d];
        }));
        bySite[siteId] = Series.buildGas(days, gas);
    }

    var combined = siteIds.length > 1 ? combineGas(bySite) : bySite[siteIds[0]];
    return json({
        bucket: 'day',
        sites: siteIds.map(function (id) { return { site_id: id, points: bySite[id] }; }),
        combined: combined,
        sources: Series.gasSourcesOf(combined)
    }, 200, origin);
}

/* Two landfills added together. Volumes and money add. HEATING VALUE DOES NOT — it is a
   property of the gas, so it is weighted by the volume it describes, and a site delivering a
   tenth of the gas must not pull the average a tenth of the way to its own figure.
   Coverage is weighted the same way, by hours rather than by site. */
function combineGas(bySite) {
    var ids = Object.keys(bySite);
    var days = {};
    ids.forEach(function (id) {
        (bySite[id] || []).forEach(function (p) { days[p.date] = true; });
    });
    return Object.keys(days).sort().map(function (date) {
        var mcf = 0, mcfSeen = false, mmbtu = 0, mmbtuSeen = false;
        var usd = 0, usdSeen = false, cov = 0, covSeen = false, sites = 0;
        var btuW = 0, btuV = 0;
        ids.forEach(function (id) {
            var p = (bySite[id] || []).filter(function (x) { return x.date === date; })[0];
            if (!p) return;
            var contributed = false;
            if (typeof p.mcf === 'number') { mcf += p.mcf; mcfSeen = true; contributed = true; }
            if (typeof p.mmbtu === 'number') { mmbtu += p.mmbtu; mmbtuSeen = true; contributed = true; }
            if (typeof p.usd === 'number') { usd += p.usd; usdSeen = true; contributed = true; }
            if (typeof p.hours_covered === 'number') { cov += p.hours_covered; covSeen = true; contributed = true; }
            if (typeof p.btu_scf === 'number' && typeof p.mcf === 'number') {
                btuW += p.btu_scf * p.mcf; btuV += p.mcf;
            }
            if (contributed) sites++;
        });
        return {
            date: date,
            mcf: mcfSeen ? Math.round(mcf * 1000) / 1000 : null,
            mmbtu: mmbtuSeen ? Math.round(mmbtu * 1000) / 1000 : null,
            btu_scf: btuV > 0 ? Math.round(btuW / btuV) : null,
            hours_covered: covSeen ? cov : null,
            coverage_pct: covSeen && sites > 0
                ? Math.round(Math.min(cov / (sites * 24), 1) * 10000) / 100 : null,
            usd: usdSeen ? Math.round(usd * 100) / 100 : null,
            sites_reporting: sites,
            sites_total: ids.length
        };
    });
}

/* One poll, recorded. Appends to the day's raw samples, recomputes that day from ALL of them, and
 * writes the result into the month bucket.
 *
 * RECOMPUTED FROM THE WHOLE DAY, not merged into yesterday's answer. The day's bitcoin is the
 * difference between the first and last cumulative reading, so it cannot be updated incrementally
 * without keeping the running state somewhere — and the version of this that tried would have
 * added each poll's total to the day, which turns a running balance into an income statement and
 * multiplies the client's earnings by the number of polls.
 */
async function recordPoll(env, siteId, sample) {
    var day = sample.at.slice(0, 10);
    var ym = day.slice(0, 7);

    var raw = (await env.PORTAL.get(K.poolSamples(siteId, day), 'json')) || [];
    raw.push(sample);
    /* A bounded list. At one poll every ten minutes a day holds 144; the cap is generous enough
       to never bite in normal running and low enough that a stuck retry loop cannot grow a value
       past what KV will store. */
    if (raw.length > 400) raw = raw.slice(raw.length - 400);
    await env.PORTAL.put(K.poolSamples(siteId, day), JSON.stringify(raw),
                         { expirationTtl: 60 * 60 * 24 * 40 });

    var month = (await env.PORTAL.get(K.hostDaily(siteId, ym), 'json')) || {};
    month[day] = Series.rollupDay(raw);
    await env.PORTAL.put(K.hostDaily(siteId, ym), JSON.stringify(month));
    return month[day];
}

/* The scheduled pull. One tick asks every linked site's pool for its current state and records it.
 *
 * A SITE THAT FAILS MUST NOT STOP THE OTHERS, so each is caught on its own. A failed pull records
 * NOTHING rather than an empty sample: an empty workers array means "the pool answered and no
 * machine reported", which is a site-wide outage, and a network error is not evidence of one.
 */
async function pullAllPools(env, nowMs) {
    if (!env.POOL_KEY_WRAP) return { skipped: 'no POOL_KEY_WRAP' };
    var at = new Date(nowMs).toISOString();
    var list = await env.PORTAL.list({ prefix: 'pool:' });
    var done = 0, failed = 0;

    for (var i = 0; i < list.keys.length; i++) {
        var siteId = list.keys[i].name.slice('pool:'.length);
        try {
            var link = await env.PORTAL.get(K.poolLink(siteId), 'json');
            if (!link || !link.provider || !link.key_wrapped) continue;
            var key = await Pool.unwrapKey(env.POOL_KEY_WRAP, link.key_wrapped);
            var sample = await Pool.pull(link.provider, link.account, key, at);
            await recordPoll(env, siteId, sample);
            done++;
        } catch (e) {
            /* Nothing about the failure is written anywhere a counterparty can read, and the key
               is never in the message. */
            failed++;
        }
    }
    return { polled: done, failed: failed };
}

/* One fleet summary across every site the client has.
 *
 * SUMS ARE SUMMED; THE ONE RATIO IS WEIGHTED. machines, online, hashrate and draw all add up.
 * uptime_pct_30d does not: it is a percentage, and the mean of two percentages weights a
 * four-machine site the same as a hundred-machine one. It is weighted by machine count, which is
 * the closest honest thing to the ratio of the totals when the underlying counts are not stored.
 *
 * `period` is NOT combined. Two sites bill on their own meters with their own coverage, and a
 * single "hours covered" spanning both would describe neither — it stays on the per-site
 * entries, which is where a client can act on it.
 */
function combinedSummary(views) {
    var withSummary = views.filter(function (v) { return v && v.summary; });
    if (!withSummary.length) return null;

    var out = { machines: 0, online: 0, hashrate_th: 0, draw_kw: 0, uptime_pct_30d: null,
                sites: views.length, sites_reporting: withSummary.length, period: null };
    var upWeighted = 0, upMachines = 0;

    withSummary.forEach(function (v) {
        var m = v.summary;
        if (typeof m.machines === 'number') out.machines += m.machines;
        if (typeof m.online === 'number') out.online += m.online;
        if (typeof m.hashrate_th === 'number') out.hashrate_th += m.hashrate_th;
        if (typeof m.draw_kw === 'number') out.draw_kw += m.draw_kw;
        if (typeof m.uptime_pct_30d === 'number' && typeof m.machines === 'number') {
            upWeighted += m.uptime_pct_30d * m.machines;
            upMachines += m.machines;
        }
    });

    out.hashrate_th = Math.round(out.hashrate_th * 10) / 10;
    out.draw_kw = Math.round(out.draw_kw * 10) / 10;
    if (upMachines > 0) out.uptime_pct_30d = Math.round(upWeighted / upMachines * 100) / 100;

    /* THE PERIOD IS COMBINED, and it has to be, because leaving it null rendered "not measured"
       over the energy card — which is false. The energy is measured; it is measured twice, at
       two meters. kWh adds. Coverage is a ratio and is taken as the ratio of the TOTALS, the
       same rule as uptime above, not the mean of two percentages.

       Only when the sites are billing the same period. Two meters on different months cannot be
       added into one figure, and a client with that arrangement is better served by the per-site
       cards than by a number spanning both. */
    var pids = withSummary.map(function (v) { return v.summary.period && v.summary.period.id; });
    var samePeriod = pids.length && pids.every(function (p) { return p && p === pids[0]; });
    if (samePeriod) {
        var kwh = 0, cov = 0, ela = 0;
        withSummary.forEach(function (v) {
            var pd = v.summary.period;
            if (typeof pd.kwh_to_date === 'number') kwh += pd.kwh_to_date;
            if (typeof pd.hours_covered === 'number') cov += pd.hours_covered;
            if (typeof pd.hours_elapsed === 'number') ela += pd.hours_elapsed;
        });
        out.period = { id: pids[0], kwh_to_date: kwh,
                       hours_covered: cov, hours_elapsed: ela };
    }

    return out;
}

function rigsView(doc) {
    return {
        site_id: doc.site_id,
        as_of: doc.as_of,
        summary: doc.summary ? {
            machines: doc.summary.machines,
            online: doc.summary.online,
            hashrate_th: doc.summary.hashrate_th,
            // Metered for the cage, never divided by machine count.
            draw_kw: doc.summary.draw_kw,
            uptime_pct_30d: doc.summary.uptime_pct_30d,
            // What the next statement is being built from, so far.
            period: doc.summary.period ? {
                id: doc.summary.period.id,
                kwh_to_date: doc.summary.period.kwh_to_date,
                hours_covered: doc.summary.period.hours_covered,
                hours_elapsed: doc.summary.period.hours_elapsed
            } : null
        } : null,
        rigs: (doc.rigs || []).map(function(r) {
            return { worker: r.worker, hashrate_th: r.hashrate_th,
                     hashrate_24h_th: r.hashrate_24h_th,
                     last_seen: r.last_seen, reported: r.reported };
        })
    };
}

/* What a HOSTING client may see of their own statement. Same discipline as
   sellerView: a whitelist, so a field added to the stored document upstream is
   not published to a counterparty by accident.

   The shape follows what site/hosting.html already promises rather than what
   would be convenient — "Monthly in arrears on metered draw" and "Statement
   includes per-machine kWh, uptime, and hashrate for the period". So draw is
   the billable quantity and carries the same coverage/gaps structure the gas
   ledger uses, because metered power has exactly the same problem: a link drops
   and the honest answer is a hole with a start and an end, not an estimate.

   machines[] is per-machine and therefore the one place a hosting statement can
   leak more than it should — it is mapped field by field for that reason, and
   carries no serial, no IP and no pool credential. */
function hostingView(st) {
    return {
        statement_id: st.statement_id, site_id: st.site_id, version: st.version,
        status: st.status, issued_at: st.issued_at, content_hash: st.content_hash,
        period: st.period, draw: st.draw,
        machines: (st.machines || []).map(function(m) {
            return { worker: m.worker, kwh: m.kwh, uptime_pct: m.uptime_pct,
                     hashrate_th: m.hashrate_th, last_seen: m.last_seen };
        }),
        charges: st.charges, adjustments: st.adjustments,
        subtotal_usd: st.subtotal_usd, adjustments_usd: st.adjustments_usd,
        total_usd: st.total_usd, total_is_partial: st.total_is_partial,
        basis: st.basis ? {
            unbillable_segments: st.basis.unbillable_segments,
            unresolved: st.basis.unresolved,
            disclosures: st.basis.disclosures,
            readings_included_count: st.basis.readings_included_count,
            engine_version: st.basis.engine_version
        } : null,
        history: (st.history || []).map(function(h) { return { status: h.status, at: h.at }; })
    };
}

// ---- Routing ---------------------------------------------------------------------------------

export default {
    async fetch(request, env) {
        var url = new URL(request.url);
        var origin = request.headers.get('Origin');
        var p = url.pathname;
        var nowMs = Date.now();

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        try {
            // --- open ---
            if (p === '/ping') return json({ ok: true, worker: 'proton-portal' }, 200, origin);
            // So a device with a dead clock can discipline before signing anything.
            if (p === '/time') return json({ server_time: new Date(nowMs).toISOString() }, 200, origin);

            // --- device ---
            if (p === '/telemetry/readings' && request.method === 'POST') {
                return await ingestReadings(request, env, origin, nowMs);
            }

            // --- seller ---
            if (p === '/portal/login' && request.method === 'POST') {
                return await login(request, env, origin, nowMs);
            }
            if (p === '/portal/redeem' && request.method === 'POST') {
                return await redeem(request, env, origin, nowMs);
            }

            if (p.indexOf('/portal/') === 0) {
                var sellerId = await sellerFor(request, env, nowMs);
                if (!sellerId) return denied(origin);

                /* The account record is read once, here, and its kind gates
                   everything below. Nothing in the request contributes to this
                   decision — not a header, not a query string, not a body. */
                var s = await env.PORTAL.get(K.seller(sellerId), 'json');
                if (!s) return absent(origin);
                var kind = ACCOUNT_KINDS.indexOf(s.kind) >= 0 ? s.kind : null;
                if (!kind) return denied(origin);   // no kind, no portal
                var fam = FAMILIES[kind];

                if (p === '/portal/me') {
                    return json({ seller_id: sellerId, kind: kind, legal_name: s.legal_name,
                                  sites: s.sites || [] }, 200, origin);
                }

                /* Each kind's routes are only reachable from that kind, and the
                   refusal for the other kind's path is the SAME 404 as for a
                   path that does not exist at all — so the shape of the other
                   portal cannot be mapped from this one. */
                if (kind === 'producer') {
                    /* The same daily history the hosting portal has, for a gas site. A producer
                       was given a list of frozen monthly statements and nothing in between —
                       no way to see a bad week while it was still a bad week. */
                    if (p === '/portal/series') {
                        var psites = s.sites || [];
                        if (!psites.length) return absent(origin);
                        return await producerSeries(env, psites, url, origin);
                    }
                    if (p === '/portal/statements') {
                        return await listStatements(env, sellerId, fam, origin);
                    }
                    var m = p.match(/^\/portal\/statements\/([A-Za-z0-9_-]{1,64})\/([0-9]{4}-[0-9]{2})$/);
                    if (m) return await getStatement(env, sellerId, m[1], m[2], fam, origin);
                }

                if (kind === 'hosting') {
                    /* The live fleet, scoped the same way a statement is: the
                       account's sites, and nothing outside them. */
                    if (p === '/portal/hosting/rigs') {
                        var sites = s.sites || [];
                        if (!sites.length) return absent(origin);
                        /* EVERY SITE, not sites[0]. A client can hold machines at more than one
                           facility — the account record has always been a list, listStatements
                           has always walked all of it, and this route quietly read the first
                           entry. The effect was a dashboard showing 104 machines beside
                           statements charging for 134, with nothing on the page admitting the
                           other site existed. */
                        var docs = [];
                        for (var si = 0; si < sites.length; si++) {
                            var d = await env.PORTAL.get(K.rigs(sites[si]), 'json');
                            /* A site with no fleet document yet is named with nothing in it,
                               rather than dropped. "We have not heard from Blue Nile" and "you
                               have no Blue Nile" are different facts. */
                            docs.push(d ? rigsView(d) : { site_id: sites[si], as_of: null,
                                                          summary: null, rigs: [] });
                        }
                        return json({ sites: docs, summary: combinedSummary(docs) }, 200, origin);
                    }
                    /* The daily history behind the chart. Read-only, scoped to this
                       account's own site exactly as the rigs route is. */
                    if (p === '/portal/hosting/series') {
                        var hsites = s.sites || [];
                        if (!hsites.length) return absent(origin);
                        return await hostingSeries(env, hsites, url, origin);
                    }
                    if (p === '/portal/hosting/statements') {
                        return await listStatements(env, sellerId, fam, origin);
                    }
                    var hm = p.match(/^\/portal\/hosting\/statements\/([A-Za-z0-9_-]{1,64})\/([0-9]{4}-[0-9]{2})$/);
                    if (hm) return await getStatement(env, sellerId, hm[1], hm[2], fam, origin);
                }

                return absent(origin);
            }

            // --- ops ---
            if (p.indexOf('/admin/') === 0) {
                if (!isOwner(request, env)) return denied(origin);
                return await admin(request, env, origin, nowMs, p);
            }
        } catch (e) {
            // No stack traces and no messages to the caller. worker-strike returns e.message on
            // its 502 and that is the one thing from it not worth copying.
            return json({ error: 'request failed' }, 500, origin);
        }

        // Default deny. Anything not named above is refused rather than falling through.
        return json({ error: 'blocked' }, 404, origin);
    },

    /* The pool pull, on a cron. See wrangler.toml for the schedule.
     *
     * WHY A CRON AND NOT A PULL ON PAGE LOAD. Uptime is the share of polls in which a machine
     * reported, so the sampling has to be regular and independent of whether anyone is looking:
     * a series gathered when the client happens to open the page would show its best uptime on
     * the days they cared enough to check. It also keeps a counterparty's page load off the
     * critical path of somebody else's API.
     *
     * ctx.waitUntil is not needed here — unlike a fetch handler, a scheduled handler is allowed
     * to await its work, and the runtime keeps the invocation alive until the promise settles. */
    async scheduled(event, env, ctx) {
        await pullAllPools(env, Date.now());
    }
};

// ---- OPS tier --------------------------------------------------------------------------------
// Deliberately thin. Creating sellers, contracts and invites is rare, and an ops UI is a second
// authenticated surface to secure — so for now it is curl with OPS_SECRET.
async function admin(request, env, origin, nowMs, p) {
    if (p === '/admin/seller' && request.method === 'POST') {
        var b = await request.json();
        /* kind is REQUIRED and has no default. Creating an account is a
           deliberate act by a person with the ops secret, and which portal that
           counterparty sees is part of the act — not something to be inferred
           later from what data happens to show up under their site id. An
           account minted without it would be refused at every portal route
           anyway (see the routing block), so refusing here turns a puzzling
           silent lockout into an immediate 400. */
        var kind = text(b.kind, 16);
        if (ACCOUNT_KINDS.indexOf(kind) < 0) return json({ error: 'bad request' }, 400, origin);
        var id = Identity.newSellerId();
        await env.PORTAL.put(K.seller(id), JSON.stringify({
            seller_id: id, kind: kind, legal_name: text(b.legal_name, 200),
            sites: (b.sites || []).slice(0, 50).map(function(s) { return text(s, 64); }),
            created_at: new Date(nowMs).toISOString()
        }));
        return json({ seller_id: id, kind: kind }, 200, origin);
    }

    // Register a meter. index_digits and max_rate_per_hour come off the datasheet and are the
    // ONLY things that may explain a rollover or refuse an implausible jump -- so a meter without
    // them is accepted but will bill nothing the ledger cannot verify, which is the correct
    // failure. They are never inferred from the readings the meter itself produces.
    if (p === '/admin/meter' && request.method === 'POST') {
        var m = await request.json();
        var mid = text(m.meter_id, 64), msite = text(m.site_id, 64);
        if (!Device.validId(mid) || !msite) return json({ error: 'bad request' }, 400, origin);
        await env.PORTAL.put(K.meter(mid), JSON.stringify({
            meter_id: mid, site_id: msite,
            index_digits: isFinite(Number(m.index_digits)) ? Number(m.index_digits) : null,
            max_rate_per_hour: isFinite(Number(m.max_rate_per_hour)) ? Number(m.max_rate_per_hour) : null,
            units: text(m.units, 16) || 'mcf',
            installed_at: new Date(nowMs).toISOString()
        }));
        return json({ ok: true, meter_id: mid }, 200, origin);
    }

    // Enrol a device and mint its first key.
    //
    // The derived secret is returned ONCE and never stored -- KV holds only the kid and its
    // state, so there is nothing at rest to leak. Whoever installs the meter writes it into the
    // device and it is not displayed again.
    if (p === '/admin/device' && request.method === 'POST') {
        var dv = await request.json();
        var did = text(dv.device_id, 64), kid = text(dv.kid, 64) || 'k1';
        if (!Device.validId(did) || !Device.validId(kid)) return json({ error: 'bad request' }, 400, origin);
        var meters = (dv.meters || []).slice(0, 20).map(function(x) { return text(x, 64); })
                        .filter(function(x) { return Device.validId(x); });
        await env.PORTAL.put(K.device(did), JSON.stringify({
            device_id: did, meters: meters, disabled: false,
            enrolled_at: new Date(nowMs).toISOString()
        }));
        await env.PORTAL.put(K.devKey(did, kid), JSON.stringify({
            device_id: did, kid: kid, state: 'active',
            created_at: new Date(nowMs).toISOString()
        }));
        var secret = await Device.deriveSecret(env.DEVICE_ROOT_KEY, did, kid);
        if (!secret) return json({ error: 'cannot derive' }, 500, origin);
        return json({ ok: true, device_id: did, kid: kid, secret: secret,
                      note: 'This secret is shown once. It is not stored and cannot be shown again.' },
                    200, origin);
    }

    // Store a contract version. Immutable: an amendment is a NEW version, never an edit, so a
    // statement can always name the version it was computed under and that version still says
    // what it said. Refuses to overwrite.
    if (p === '/admin/contract' && request.method === 'POST') {
        var c = await request.json();
        var siteId = text(c.site_id, 64), cid = text(c.contract_id, 64);
        var ver = Number(c.version);
        if (!siteId || !cid || !isFinite(ver) || ver < 1) return json({ error: 'bad request' }, 400, origin);
        var ckey = K.contract(siteId, cid, ver);
        if (await env.PORTAL.get(ckey)) return json({ error: 'version exists' }, 409, origin);
        await env.PORTAL.put(ckey, JSON.stringify({
            contract_id: cid, site_id: siteId, version: ver,
            status: text(c.status, 20) || 'draft',
            structure: text(c.structure, 32),
            effective_from: text(c.effective_from, 40) || null,
            measurement: c.measurement || null,
            terms: c.terms || null,
            document_sha256: text(c.document_sha256, 80) || null,
            created_at: new Date(nowMs).toISOString()
        }));
        return json({ ok: true, version: ver }, 200, origin);
    }

    // Close a period: compute the statement from the ledger and FREEZE it with a content hash.
    //
    // Fails closed at every missing input. No executed contract, no close. No heating value where
    // the basis needs one, no charge -- and the statement says so rather than inventing a rate.
    if (p === '/admin/close' && request.method === 'POST') {
        var q = await request.json();
        var sid = text(q.site_id, 64), period = text(q.period, 10);
        if (!sid || !/^[0-9]{4}-[0-9]{2}$/.test(period)) return json({ error: 'bad request' }, 400, origin);

        var contract = await env.PORTAL.get(
            K.contract(sid, text(q.contract_id, 64), Number(q.contract_version)), 'json');
        if (!contract || contract.status !== 'executed') {
            return json({ error: 'no executed contract in force' }, 409, origin);
        }

        var meter = await env.PORTAL.get(K.meter(text(q.meter_id, 64)), 'json');
        if (!meter || meter.site_id !== sid) return absent(origin);

        // The window comes from the request because the gas day is a contract term and resolving
        // a timezone here would need a database the Worker does not have. Frozen onto the
        // statement so it is reproducible without one.
        var startUtc = text(q.start_utc, 40), endUtc = text(q.end_utc, 40);
        if (!Date.parse(startUtc) || !Date.parse(endUtc)) return json({ error: 'bad window' }, 400, origin);

        var readings = [];
        var idx = await env.PORTAL.list({ prefix: 'rdx:' + sid + ':' + meter.meter_id + ':' });
        for (var ri = 0; ri < idx.keys.length; ri++) {
            var rid = await env.PORTAL.get(idx.keys[ri].name);
            if (!rid) continue;
            var parts = idx.keys[ri].name.split(':');
            var rec = await env.PORTAL.get(
                K.reading(meter.meter_id, Number(parts[parts.length - 2]),
                          Number(parts[parts.length - 1])), 'json');
            if (rec) readings.push(rec);
        }

        var b = Ledger.build(readings, meter, startUtc, endUtc);
        var st = Statement.compute({
            site_id: sid, contract: contract, built: b,
            coverage: Ledger.coverage(b),
            curtailments: q.curtailments || [],
            adjustments: q.adjustments || [],
            period: { id: period, start_utc: startUtc, end_utc: endUtc },
            computed_at: new Date(nowMs).toISOString()
        });

        st.statement_id = 'ST-' + sid + '-' + period;
        st.content_hash = await sha256(Statement.canonical(st));
        st.history = [{ status: 'closed', at: new Date(nowMs).toISOString() }];

        var v = Number(q.version) || 1;
        await env.PORTAL.put(K.statement(sid, period, v), JSON.stringify(st));
        return json({ ok: true, version: v, total_usd: st.total_usd,
                      total_is_partial: st.total_is_partial,
                      content_hash: st.content_hash }, 200, origin);
    }

    // Issue it. A HUMAN act, exactly as `quoted` is in the order flow: the seller sees nothing
    // until a person decides they should. Writing stx: is what makes it visible, so visibility is
    // a property of the data rather than of a filter somebody might forget.
    if (p === '/admin/issue' && request.method === 'POST') {
        var g = await request.json();
        var gsid = text(g.site_id, 64), gper = text(g.period, 10), gver = Number(g.version) || 1;
        var stRec = await env.PORTAL.get(K.statement(gsid, gper, gver), 'json');
        if (!stRec) return absent(origin);
        if (!Statement.canAdvance(stRec.status, 'issued')) {
            return json({ error: 'cannot advance from ' + stRec.status }, 409, origin);
        }
        stRec.status = 'issued';
        stRec.issued_at = new Date(nowMs).toISOString();
        stRec.history.push({ status: 'issued', at: stRec.issued_at });
        await env.PORTAL.put(K.statement(gsid, gper, gver), JSON.stringify(stRec));
        await env.PORTAL.put(K.issued(gsid, gper), JSON.stringify({
            site_id: gsid, period: gper, version: gver,
            issued_at: stRec.issued_at, total_usd: stRec.total_usd,
            total_is_partial: stRec.total_is_partial
        }));
        return json({ ok: true, issued_at: stRec.issued_at }, 200, origin);
    }

    /* Link a site to its client's pool account.
     *
     * OPS-ONLY, AND ON PURPOSE. The obvious design is a field in the portal where the client pastes
     * their own key, and it is the wrong one for now: it puts a credential-shaped input box on a
     * page reached by a shared invite link, with no way to tell the client what scope the key needs
     * beyond text nobody reads. Ops taking the key through the same channel that already sets up a
     * site keeps one fewer credential surface on the public internet. The key is wrapped before it
     * is written, so it is not in the clear even here.
     */
    if (p === '/admin/pool' && request.method === 'POST') {
        if (!env.POOL_KEY_WRAP) return json({ error: 'not configured' }, 503, origin);
        var pb = await request.json();
        if (!pb || !pb.site_id || !pb.provider || !pb.api_key) {
            return json({ error: 'bad request' }, 400, origin);
        }
        if (Pool.providers().indexOf(pb.provider) < 0) {
            /* Refusing an unwired provider here rather than at pull time means the failure lands
               on the person who can fix it, at the moment they are doing the thing, instead of
               silently producing a site that never gathers any history. */
            return json({ error: 'unknown provider', known: Pool.providers() }, 400, origin);
        }
        await env.PORTAL.put(K.poolLink(pb.site_id), JSON.stringify({
            provider: pb.provider,
            account: String(pb.account || ''),
            key_wrapped: await Pool.wrapKey(env.POOL_KEY_WRAP, pb.api_key),
            linked_at: new Date(nowMs).toISOString()
        }));
        // The key is never echoed, not even truncated.
        return json({ ok: true, site_id: pb.site_id, provider: pb.provider }, 200, origin);
    }

    if (p === '/admin/invite' && request.method === 'POST') {
        var i = await request.json();
        var sellerId = text(i.seller_id, 64);
        if (!(await env.PORTAL.get(K.seller(sellerId)))) return absent(origin);
        var tok = Identity.newInviteToken();
        await env.PORTAL.put(K.invite(tok), JSON.stringify({
            seller_id: sellerId, email: text(i.email, 200).toLowerCase(),
            created_at: new Date(nowMs).toISOString(),
            expires_at: new Date(nowMs + Identity.INVITE_TTL_SEC * 1000).toISOString(),
            redeemed_at: null
        }), { expirationTtl: Identity.INVITE_TTL_SEC });
        // Returned once. Proton sends it; it is never displayed again.
        return json({ invite: tok }, 200, origin);
    }

    return json({ error: 'blocked' }, 404, origin);
}

export { text, isOwner, constantEquals, sellerView, K, OPS_PREFIX, ALLOWED_ORIGINS };
