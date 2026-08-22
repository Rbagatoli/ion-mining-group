// ===== ION MINING GROUP — meter authentication =====
//
// A METER IS NOT A USER. It gets no Firebase token, no session, and no path to any seller or ops
// route. It has exactly one thing it may do: append readings for the meters it is bound to.
//
// The signature scheme is deliberately the same shape as the Stripe webhook verifier already in
// worker-orders/stripe.js:88-146, down to the header format and the tolerance. One idiom in the
// repo, one thing to get right, one place to audit. constantEquals, hex and parseSignature below
// are that code, restated here because a Worker cannot import across directories.
//
//     X-Ion-Signature: t=<unix-seconds>,kid=<key-id>,v1=<hex hmac-sha256>
//     MAC input:       t + "." + device_id + "." + rawBody
//
// THE device_id IS INSIDE THE MAC INPUT, and that is not decoration. Without it, a body captured
// from device X could be replayed as device Y's the moment a key is ever shared or a kid reused.
// With it, cross-device confusion is arithmetically impossible.
//
// MULTIPLE v1 VALUES ARE ACCEPTED, for the reason stripe.js gives: during a key rotation both the
// old and the new signature are legitimate, and rejecting either makes rotation a flag day.
//
// A FIVE-MINUTE WINDOW DOES NOT STOP REPLAY INSIDE THE WINDOW, and that is acceptable here for
// exactly the reason it is acceptable for Stripe: the payload is idempotent. A replayed reading
// carries the same (meter, epoch, seq), so re-delivering it is a no-op rather than a double
// count. This is written down because otherwise somebody will "fix" it later with a nonce store
// that has to be expired, and gain nothing.
//
//
// THE SECRET IS DERIVED, NOT STORED.
//
//     secret = HMAC-SHA256(DEVICE_ROOT_KEY, device_id + ':' + kid)
//
// KV holds only the kid and its state. There is no secret at rest to leak from a KV dump, no
// encryption-at-rest scheme to get wrong, and no per-device secret to back up or lose. Rotation
// is simply a new kid. Enrolment hands the derived secret to the installer once, out of band, and
// it is never displayed again.
//
// The trade-off, stated honestly rather than buried: compromise of DEVICE_ROOT_KEY compromises
// every device. It is a Worker secret with the same blast radius OPS_SECRET already has, and a
// forged device still cannot reach a site it is not bound to in KV -- but it is a single point of
// failure and whoever operates this should know that.

(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.PortalDevice = factory();
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    // Five minutes, matching worker-orders/stripe.js. A device that cannot hold its clock to five
    // minutes is broken and needs fixing, not accommodating.
    var TOLERANCE_SEC = 300;

    // Forward only, one step at a time, and revoked is terminal -- the same discipline as the
    // order status machine. `retiring` still verifies: it exists so a rotation has a bounded
    // overlap rather than a moment where every device in the field stops at once.
    var KEY_STATES = ['pending', 'active', 'retiring', 'revoked'];
    var VERIFYING_STATES = { active: true, retiring: true };

    function constantEquals(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
        var diff = 0;
        for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }

    function hex(buf) {
        var out = '', view = new Uint8Array(buf);
        for (var i = 0; i < view.length; i++) out += ('0' + view[i].toString(16)).slice(-2);
        return out;
    }

    function parseSignature(header) {
        var out = { t: null, kid: null, v1: [] };
        String(header || '').split(',').forEach(function(part) {
            var eq = part.indexOf('=');
            if (eq < 0) return;
            var k = part.slice(0, eq).trim(), v = part.slice(eq + 1).trim();
            if (k === 't') out.t = v;
            else if (k === 'kid') out.kid = v;
            else if (k === 'v1') out.v1.push(v);
        });
        return out;
    }

    async function hmac(keyBytes, message) {
        var key = await crypto.subtle.importKey(
            'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    }

    // The per-device, per-kid secret. Callers never persist the result.
    async function deriveSecret(rootKey, deviceId, kid) {
        var mac = await hmac(new TextEncoder().encode(rootKey), deviceId + ':' + kid);
        return hex(mac);
    }

    // Verify a signed request.
    //
    // Returns { ok: true } or { ok: false, why: '...' }. THE `why` IS FOR LOGS ONLY. Every caller
    // must collapse it into one identical rejection, because an endpoint that explains which part
    // of a signature failed is an endpoint that helps forge the next attempt. worker-orders makes
    // the same point about its Stripe webhook, which refuses to say why.
    async function verify(opts) {
        var rawBody = opts.rawBody;
        var sig = parseSignature(opts.signatureHeader);
        var nowMs = opts.nowMs;

        if (!opts.rootKey) return { ok: false, why: 'no device root key configured' };
        if (!opts.deviceId) return { ok: false, why: 'no device id' };
        if (!sig.t || !sig.kid || !sig.v1.length) return { ok: false, why: 'malformed signature' };

        var t = parseInt(sig.t, 10);
        if (!isFinite(t)) return { ok: false, why: 'bad timestamp' };
        if (Math.abs(Math.floor(nowMs / 1000) - t) > TOLERANCE_SEC) {
            return { ok: false, why: 'timestamp outside tolerance' };
        }

        // The key record decides whether this kid may still sign. A revoked kid stops here, before
        // any comparison, so a leaked key is dead the moment it is marked rather than at the next
        // rotation.
        var state = opts.keyState;
        if (!state || !VERIFYING_STATES[state]) return { ok: false, why: 'key not in a signing state' };

        var secret = await deriveSecret(opts.rootKey, opts.deviceId, sig.kid);
        var mac = await hmac(new TextEncoder().encode(secret),
                             sig.t + '.' + opts.deviceId + '.' + rawBody);
        var expected = hex(mac);

        var matched = sig.v1.some(function(given) { return constantEquals(given, expected); });
        if (!matched) return { ok: false, why: 'signature does not match' };

        return { ok: true, kid: sig.kid, t: t };
    }

    return {
        verify: verify,
        deriveSecret: deriveSecret,
        parseSignature: parseSignature,
        constantEquals: constantEquals,
        hex: hex,
        TOLERANCE_SEC: TOLERANCE_SEC,
        KEY_STATES: KEY_STATES,
        VERIFYING_STATES: VERIFYING_STATES
    };
});
