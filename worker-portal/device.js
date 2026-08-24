// ===== PROTON MINING — meter authentication =====
//
// A METER IS NOT A USER. It gets no Firebase token, no session, and no path to any seller or ops
// route. It has exactly one thing it may do: append readings for the meters it is bound to.
//
// The signature scheme is deliberately the same shape as the Stripe webhook verifier already in
// worker-orders/stripe.js:88-146, down to the header format and the tolerance. One idiom in the
// repo, one thing to get right, one place to audit. constantEquals, hex and parseSignature below
// are that code, restated here because a Worker cannot import across directories.
//
//     X-Proton-Signature: t=<unix-seconds>,kid=<key-id>,v1=<hex hmac-sha256>
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
//     secret = HMAC-SHA256(DEVICE_ROOT_KEY, len(device_id) + ':' + device_id + ':' + kid)
//
// The length prefix is not decoration -- plain concatenation is NOT injective, so device 'A:B'
// with kid 'C' and device 'A' with kid 'B:C' would derive the SAME secret and each device could
// sign as the other. See deriveSecret.
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

// Set on BOTH module.exports and the global, unconditionally.
//
// The Worker has no `module`, so it needs the global. Node has one, so the test suites can
// require() this directly. And when node imports it from an ESM file BOTH are defined -- an
// either/or wrapper takes the module.exports branch there and leaves the global undefined, which
// is a failure that only appears in the Worker entry point and not in any test.
(function(root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PortalDevice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
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

    // Device ids and key ids are restricted to a charset with no delimiter in it. Both are used
    // to build KV keys AND the derivation input below, and a colon inside either would make both
    // ambiguous -- see the note on injectivity in deriveSecret.
    var ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
    function validId(s) { return typeof s === 'string' && ID_SHAPE.test(s); }

    // The per-device, per-kid secret. Callers never persist the result.
    //
    // THE INPUT MUST BE INJECTIVE, and naive concatenation is not.
    //
    //     deviceId 'A:B', kid 'C'   ->  'A:B:C'
    //     deviceId 'A',   kid 'B:C' ->  'A:B:C'
    //
    // Same string, same derived secret. Two separately enrolled devices would share a key and
    // each could sign as the other, which defeats the entire point of putting device_id inside
    // the MAC. Two defences, because one of them is a validation that a future caller might skip:
    //
    //   1. Both ids are validated against a charset that excludes the delimiter.
    //   2. The device id is LENGTH-PREFIXED, so the boundary is unambiguous even if a caller
    //      somehow gets an unvalidated value through.
    async function deriveSecret(rootKey, deviceId, kid) {
        if (!validId(deviceId) || !validId(kid)) return null;
        var material = deviceId.length + ':' + deviceId + ':' + kid;
        var mac = await hmac(new TextEncoder().encode(rootKey), material);
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
        if (!validId(opts.deviceId)) return { ok: false, why: 'no device id' };
        if (!sig.t || !sig.kid || !sig.v1.length) return { ok: false, why: 'malformed signature' };
        if (!validId(sig.kid)) return { ok: false, why: 'bad kid' };

        var t = parseInt(sig.t, 10);
        if (!isFinite(t)) return { ok: false, why: 'bad timestamp' };

        // nowMs must be a real number BEFORE it reaches the comparison. Math.floor(undefined/1000)
        // is NaN, and `Math.abs(NaN - t) > TOLERANCE_SEC` is FALSE -- so a caller that forgot to
        // pass a clock would not get a tolerance failure, it would get an unbounded replay window
        // and every captured request valid forever. Fail closed instead.
        if (typeof nowMs !== 'number' || !isFinite(nowMs)) {
            return { ok: false, why: 'no clock' };
        }
        if (Math.abs(Math.floor(nowMs / 1000) - t) > TOLERANCE_SEC) {
            return { ok: false, why: 'timestamp outside tolerance' };
        }

        // The key record decides whether this kid may still sign. A revoked kid stops here, before
        // any comparison, so a leaked key is dead the moment it is marked rather than at the next
        // rotation.
        //
        // hasOwnProperty, NOT `VERIFYING_STATES[state]`. A state of 'constructor', 'toString' or
        // '__proto__' resolves up Object.prototype to a FUNCTION, which is truthy -- so a plain
        // lookup would fail OPEN on exactly the strings an attacker would try. site-opportunity.js
        // documents this same trap for counterparty types; it applies here with far more at stake.
        var state = opts.keyState;
        if (typeof state !== 'string' ||
            !Object.prototype.hasOwnProperty.call(VERIFYING_STATES, state) ||
            VERIFYING_STATES[state] !== true) {
            return { ok: false, why: 'key not in a signing state' };
        }

        var secret = await deriveSecret(opts.rootKey, opts.deviceId, sig.kid);
        if (!secret) return { ok: false, why: 'cannot derive' };
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
        validId: validId,
        parseSignature: parseSignature,
        constantEquals: constantEquals,
        hex: hex,
        TOLERANCE_SEC: TOLERANCE_SEC,
        KEY_STATES: KEY_STATES,
        VERIFYING_STATES: VERIFYING_STATES
    };
});
