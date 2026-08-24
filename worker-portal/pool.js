// Reading a hosting client's own pool account, so the portal can show them their own numbers.
//
// WHAT THIS IS FOR. Proton meters the cage, so kWh is Proton's to report. Everything else a hosting
// client wants to see -- hashrate, uptime, which worker is down, and how much bitcoin they made --
// belongs to their pool account, not to Proton. portal/index.html already refuses to state
// "est. daily earnings" on the grounds that a hosting client's payouts go from the pool straight
// to their own wallet and Proton has no business asserting a figure for them. That refusal stands.
// Reading a number out of the client's own account, with a key they gave us, and showing it back
// to them is a different act from estimating it, and it is the only version of "how much bitcoin
// did I make" that is honest.
//
// READ-ONLY, AND THAT IS NOT A CONVENTION. The key a client supplies must be a read-only one.
// Several pools issue keys that can change the payout address, and a key that can move a
// counterparty's money has no business in Proton's infrastructure at any level of care. There is no
// way to verify a key's scope from the outside, so the client is told plainly what to issue and
// nothing here ever calls a mutating endpoint.
//
// THE KEY IS NEVER STORED IN THE CLEAR. It is wrapped with AES-GCM under a key derived from the
// POOL_KEY_WRAP Worker secret, so a KV dump on its own leaks nothing -- the same standard
// device.js already holds for meter secrets ("no per-device secret is ever stored and a KV dump
// leaks nothing"). The trade-off is the same one too, and worth stating rather than discovering:
// compromise of POOL_KEY_WRAP compromises every stored pool key at once. It is rotated by
// re-wrapping, which needs every client's key to still be readable at the moment of rotation.

(function () {
    'use strict';

    var enc = new TextEncoder();
    var dec = new TextDecoder();

    // ---- key wrapping ------------------------------------------------------------------------

    async function aesKey(secret) {
        if (typeof secret !== 'string' || secret.length < 16) {
            throw new Error('POOL_KEY_WRAP missing or too short');
        }
        var material = await crypto.subtle.digest('SHA-256', enc.encode('poolwrap:v1:' + secret));
        return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false,
                                       ['encrypt', 'decrypt']);
    }

    function b64(bytes) {
        var s = '';
        var a = new Uint8Array(bytes);
        for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
        return btoa(s);
    }
    function unb64(s) {
        var bin = atob(s), a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
    }

    /* A FRESH IV EVERY TIME. AES-GCM with a repeated IV under the same key is catastrophic rather
       than merely weak, and the tempting optimisation -- deriving the IV from the site id so it is
       reproducible -- is exactly the way to repeat one. It is random, and it is stored alongside
       the ciphertext because it is not a secret. */
    async function wrapKey(secret, plaintext) {
        var key = await aesKey(secret);
        var iv = crypto.getRandomValues(new Uint8Array(12));
        var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key,
                                             enc.encode(String(plaintext)));
        return 'v1.' + b64(iv) + '.' + b64(ct);
    }

    async function unwrapKey(secret, blob) {
        if (typeof blob !== 'string' || blob.indexOf('v1.') !== 0) throw new Error('bad wrapper');
        var parts = blob.split('.');
        if (parts.length !== 3) throw new Error('bad wrapper');
        var key = await aesKey(secret);
        /* GCM authenticates as well as encrypts, so a tampered blob throws here rather than
           decrypting to rubbish that then gets sent to a pool as a credential. */
        var pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]));
        return dec.decode(pt);
    }

    // ---- normalising a pool's answer ---------------------------------------------------------

    /* THE COMMON SHAPE, which is all worker-portal/series.js ever sees:
     *
     *     { at, workers: [{ worker, hashrate_th, reported }], btc_cumulative }
     *
     * It is deliberately the same ceiling portal-demo.js already documents: every pool proxy in
     * this repo normalises a worker to name, hashrate and status, because a pool observes share
     * submissions and not sensors. Board temperature and fan speed are not missing features here,
     * they are unobtainable, and an adapter that appears to supply them is reporting something it
     * inferred.
     *
     * A WORKER WITH NO HASHRATE IS NOT A WORKER AT ZERO. `reported` and `hashrate_th` are separate
     * because they answer different questions -- "did the pool hear from it" and "how fast was it
     * going" -- and collapsing them is how a machine nobody has heard from becomes a machine
     * doing 0 TH/s on a chart.
     */
    function normaliseWorkers(list, opts) {
        var o = opts || {};
        var out = [];
        if (!list || typeof list.length !== 'number') return out;
        for (var i = 0; i < list.length; i++) {
            var w = list[i] || {};
            var name = w[o.nameField || 'worker'];
            if (typeof name !== 'string' || !name) continue;

            var raw = w[o.hashField || 'hashrate'];
            var hr = typeof raw === 'number' && isFinite(raw) ? raw * (o.toTh || 1) : null;

            /* Whether the pool heard from it is decided by the pool's own flag when there is one,
               and otherwise by whether a hashrate came back at all. It is NOT decided by the
               hashrate being above zero: two of the pool proxies in this repo mark a worker online
               while its decaying hourly average is merely non-zero, which is why portal.js has
               rigState() and does not trust this field alone. */
            var reported;
            if (o.reportedField && w[o.reportedField] !== undefined) {
                reported = o.reportedTrue ? w[o.reportedField] === o.reportedTrue
                                          : !!w[o.reportedField];
            } else {
                reported = hr !== null;
            }
            out.push({ worker: name, hashrate_th: reported ? hr : null, reported: reported });
        }
        return out;
    }

    /* One poll, ready for series.rollupDay(). `btc_cumulative` is the account's running total as
       the pool reports it -- NOT the day's earnings. series.js differences consecutive samples,
       because summing a running total multiplies a day's income by how often we happened to poll,
       and the result does not look like a bug. It looks like a good month. */
    function sample(atIso, workers, btcCumulative) {
        return {
            at: atIso,
            workers: workers || [],
            btc_cumulative: typeof btcCumulative === 'number' && isFinite(btcCumulative)
                ? btcCumulative : null
        };
    }

    // ---- providers ---------------------------------------------------------------------------

    /* DELIBERATELY EMPTY, AND THE EMPTINESS IS THE POINT.
     *
     * Wiring a provider means knowing its base URL, its auth header, its worker-list field names,
     * its hashrate UNIT, and how it reports a running payout total. Every one of those is a fact
     * about somebody else's API, and none of them can be checked from in here. Writing a plausible
     * Foundry or Luxor adapter from memory would produce code that reviews well, ships, and then
     * silently reports a client's hashrate in the wrong unit or their earnings as a daily figure
     * that is really a lifetime total.
     *
     * A wrong number on this chart is worse than a missing one: the client believes it.
     *
     * So a provider is registered only when its shape has been checked against that pool's live
     * response, and pull() refuses a provider it does not have rather than guessing. To add one,
     * fill in the descriptor below from the pool's own documentation and add a fixture of a REAL
     * response to tests/portal-pool.test.js -- the fixture is what makes the mapping a fact
     * rather than a hope.
     *
     *   PROVIDERS['luxor'] = {
     *       label:    'Luxor',
     *       url:      function (acct) { return 'https://...' + acct; },
     *       headers:  function (key) { return { 'Authorization': '...' + key }; },
     *       workers:  function (body) { return body.<path to the array>; },
     *       fields:   { nameField: '...', hashField: '...', toTh: <multiplier to TH/s>,
     *                   reportedField: '...' },
     *       btc:      function (body) { return body.<running payout total, BTC>; }
     *   };
     */
    var PROVIDERS = {};

    function providers() { return Object.keys(PROVIDERS); }

    function describe(id) {
        var p = PROVIDERS[id];
        return p ? { id: id, label: p.label } : null;
    }

    /* Fetch one poll from a provider. `doFetch` is injected so the tests exercise the real mapping
       against a captured response rather than mocking the module that does the mapping. */
    async function pull(providerId, account, apiKey, atIso, doFetch) {
        var p = PROVIDERS[providerId];
        if (!p) {
            var err = new Error('unknown pool provider: ' + providerId);
            err.code = 'unknown_provider';
            throw err;
        }
        var f = doFetch || fetch;
        var res = await f(p.url(account), { headers: p.headers(apiKey), method: 'GET' });
        if (!res || !res.ok) {
            var e2 = new Error('pool refused: ' + (res ? res.status : 'no response'));
            e2.code = 'pool_error';
            throw e2;
        }
        var body = await res.json();
        return sample(atIso, normaliseWorkers(p.workers(body), p.fields), p.btc(body));
    }

    var api = {
        wrapKey: wrapKey,
        unwrapKey: unwrapKey,
        normaliseWorkers: normaliseWorkers,
        sample: sample,
        PROVIDERS: PROVIDERS,
        providers: providers,
        describe: describe,
        pull: pull
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof globalThis !== 'undefined') globalThis.PortalPool = api;
})();
