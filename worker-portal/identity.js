// ===== ION MINING GROUP — portal identity =====
//
// Firebase ID token -> verified uid -> portal session -> ONE seller.
//
// The RS256 verification below is lifted from worker-strike/index.js:206-251, which is the only
// correctly-implemented authorization boundary that existed in this repo before the portal. It is
// restated here rather than imported because a Worker cannot import across directories, and it is
// restated FAITHFULLY -- issuer, audience, expiry, issued-at skew, subject presence, and an
// actual signature check against Google's published keys. A JWT that is merely decoded and
// trusted is not authentication; it is a suggestion from the browser.
//
//
// INVITE-ONLY, AND WHAT THAT BUYS.
//
// There is no self-serve signup. An account exists only because Ion minted an invite bound to a
// specific seller, so:
//   - there is no signup surface to attack and no rate limiting to get right on one
//   - there are no unverified or orphaned accounts to reconcile
//   - the uid -> seller binding is created by us, once, and never inferred from anything the
//     user sends
//
// Email verification IS enforced here, at redemption. It is deliberately NOT enforced in
// firestore.rules, because nothing in this app has ever checked it and requiring it there would
// lock out existing accounts -- possibly including the operator's. At redemption there is no
// existing account to break, and failing with an explanation is easy.
//
//
// ONE SESSION SEES EXACTLY ONE SELLER.
//
// The session record carries the seller_id. Every seller-tier route scopes to it SERVER-SIDE and
// none of them ever reads a seller id from the request. That is the difference between this and
// the Firestore path convention it replaces: there, the client asked for its own data and was
// trusted; here, the client cannot express which seller it wants.

// Set on BOTH module.exports and the global, unconditionally.
//
// The Worker has no `module`, so it needs the global. Node has one, so the test suites can
// require() this directly. And when node imports it from an ESM file BOTH are defined -- an
// either/or wrapper takes the module.exports branch there and leaves the global undefined, which
// is a failure that only appears in the Worker entry point and not in any test.
(function(root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PortalIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var GOOGLE_JWKS_URL =
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

    var SESSION_TTL_SEC = 30 * 24 * 3600;
    var INVITE_TTL_SEC = 14 * 24 * 3600;

    var _jwks = null, _jwksExpiry = 0;

    async function getJwks(fetchImpl, nowMs) {
        if (_jwks && nowMs < _jwksExpiry) return _jwks;
        var res = await (fetchImpl || fetch)(GOOGLE_JWKS_URL);
        if (!res.ok) throw new Error('jwks unavailable');
        var cc = res.headers.get('Cache-Control') || '';
        var m = cc.match(/max-age=(\d+)/);
        var maxAge = m ? parseInt(m[1], 10) * 1000 : 3600000;
        var data = await res.json();
        var map = {};
        for (var i = 0; i < data.keys.length; i++) map[data.keys[i].kid] = data.keys[i];
        _jwks = map;
        _jwksExpiry = nowMs + maxAge;
        return map;
    }

    function b64u(str) {
        str = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        var bin = atob(str), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    async function verifyIdToken(idToken, projectId, nowMs, fetchImpl) {
        var parts = String(idToken || '').split('.');
        if (parts.length !== 3) throw new Error('token format');

        var header = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
        var payload = JSON.parse(new TextDecoder().decode(b64u(parts[1])));

        if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('iss');
        if (payload.aud !== projectId) throw new Error('aud');
        var now = Math.floor(nowMs / 1000);
        if (payload.exp < now) throw new Error('expired');
        if (payload.iat > now + 300) throw new Error('iat');
        if (!payload.sub || typeof payload.sub !== 'string') throw new Error('sub');

        var jwks = await getJwks(fetchImpl, nowMs);
        var jwk = jwks[header.kid];
        if (!jwk) throw new Error('kid');

        var key = await crypto.subtle.importKey('jwk', jwk,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        var valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key,
            b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
        if (!valid) throw new Error('signature');

        return payload;
    }

    // ---- Identifiers -------------------------------------------------------------------------
    //
    // Crockford base32 from crypto.getRandomValues, the same generator and the same alphabet as
    // worker-orders. NOT site-model.js's newId(), which is a timestamp plus five random
    // characters -- partially enumerable, and fine for a local research record but not for
    // anything that reaches a URL. worker-strike learned this the other way round: its public
    // share ids use Math.random(), and that id is the entire access control on a public endpoint.
    var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // no I, L, O, U

    function token(bytes) {
        var b = new Uint8Array(bytes || 20);
        crypto.getRandomValues(b);
        var out = '';
        for (var i = 0; i < b.length; i++) out += ALPHABET[b[i] % 32];
        return out;
    }

    function newInviteToken() { return 'INV-' + token(20); }
    function newSessionToken() { return 'ses_' + token(24); }
    function newSellerId() { return 'SEL-' + token(12); }

    var INVITE_SHAPE = /^INV-[0-9A-HJKMNP-TV-Z]{20}$/;
    var SESSION_SHAPE = /^ses_[0-9A-HJKMNP-TV-Z]{24}$/;

    // ---- Redemption --------------------------------------------------------------------------
    //
    // Pure decision function, so it is testable without KV. The caller does the reads and the
    // single-use delete.
    //
    // Returns { ok: true, seller_id } or { ok: false, why }. As everywhere else in this worker,
    // `why` is for the log and never for the response body.
    function checkRedemption(invite, payload, nowMs) {
        if (!invite) return { ok: false, why: 'unknown invite' };
        if (invite.redeemed_at) return { ok: false, why: 'already redeemed' };
        if (invite.expires_at && Date.parse(invite.expires_at) < nowMs) {
            return { ok: false, why: 'expired' };
        }
        if (!invite.seller_id) return { ok: false, why: 'invite has no seller' };

        // Enforced HERE rather than in firestore.rules -- see the header. An unverified address
        // means we cannot prove the person holding this invite is the person we sent it to.
        if (payload.email_verified !== true) return { ok: false, why: 'email not verified' };

        // If the invite named an address, the redeemer must be that address. Without this, a
        // forwarded invite link is a working account for whoever received it.
        if (invite.email) {
            var a = String(invite.email).trim().toLowerCase();
            var b = String(payload.email || '').trim().toLowerCase();
            if (!a || a !== b) return { ok: false, why: 'invite is for a different address' };
        }
        return { ok: true, seller_id: invite.seller_id };
    }

    // Is this session still good, and which seller is it for?
    function checkSession(session, nowMs) {
        if (!session || !session.seller_id) return null;
        if (session.expires_at && Date.parse(session.expires_at) < nowMs) return null;
        if (session.revoked) return null;
        return session.seller_id;
    }

    return {
        verifyIdToken: verifyIdToken,
        checkRedemption: checkRedemption,
        checkSession: checkSession,
        newInviteToken: newInviteToken,
        newSessionToken: newSessionToken,
        newSellerId: newSellerId,
        token: token,
        INVITE_SHAPE: INVITE_SHAPE,
        SESSION_SHAPE: SESSION_SHAPE,
        SESSION_TTL_SEC: SESSION_TTL_SEC,
        INVITE_TTL_SEC: INVITE_TTL_SEC,
        GOOGLE_JWKS_URL: GOOGLE_JWKS_URL
    };
});
