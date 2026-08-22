// GHGRP counterparty lookup — who legally owns a landfill, and where to write to.
//
// NOT a SourceAdapter. It contributes no prospects; it decorates the ones LMOP already supplies.
// That is why it is a plain lookup with an explicit load() rather than something registered with
// SiteSources: nothing here should ever appear in a result count.
//
// The join is EXACT — GHGRP's facility_id is the same integer LMOP publishes as its GHGRP ID,
// carried on data/landfills.json as `ghgrpId` and through to sourceDetail. No name matching is
// involved, which is the only reason this is allowed at all: this repo bans name joins outright
// after one matched SAND POINT to Trident Seafoods and was wrong four times in five.
//
// Built by tools/build-ghgrp-contacts.js. See that file for the licence and coverage.
//
// WHAT IT GIVES YOU, and what it does not. It gives the legal owning entity with its ownership
// share, a complete facility address including the postcode, and an FRS id. It gives NO phone
// number, NO email and NO named person, because EPA publishes none for a landfill. The address is
// the FACILITY, not the owner's head office — fine for a county authority, useless for a WM site,
// and every caller must say which it is showing rather than implying a head office.
var GhgrpContacts = (function() {
    'use strict';

    var URL = './data/ghgrp-contacts.json';
    var _data = null, _loading = null, _failed = false;

    function load() {
        if (_data) return Promise.resolve(_data);
        if (_loading) return _loading;
        _loading = fetch(URL).then(function(res) {
            if (!res.ok) throw new Error('ghgrp-contacts HTTP ' + res.status);
            return res.json();
        }).then(function(d) {
            if (!d || !d.facilities) throw new Error('malformed ghgrp-contacts index');
            _data = d;
            return d;
        }).catch(function(e) {
            // A failure here must never take the page down: every landfill prospect still ranks,
            // scores and renders without it. It degrades to "no counterparty published", which is
            // exactly what the app said before this file existed.
            _loading = null;
            _failed = true;
            console.warn('[ghgrp-contacts] ' + (e && e.message ? e.message : e) +
                         ' — landfill counterparty details will be unavailable.');
            return null;
        });
        return _loading;
    }

    function meta() { return _data; }
    function failed() { return _failed; }

    // hasOwnProperty against a null-prototype object would still be the safe form, but the
    // artifact is a plain JSON object, so an id of 'constructor' or '__proto__' would otherwise
    // resolve up the prototype chain to a function and be returned as if it were a record.
    function get(ghgrpId) {
        if (!_data || ghgrpId === null || ghgrpId === undefined) return null;
        var k = String(ghgrpId).trim();
        if (!/^[0-9]+$/.test(k)) return null;   // the key is an integer; a name never reaches here
        return Object.prototype.hasOwnProperty.call(_data.facilities, k)
            ? _data.facilities[k] : null;
    }

    // The counterparty for a candidate, or null. Reads the id out of sourceDetail, which is where
    // the shared-shape whitelist forces source-specific fields to live.
    function forCandidate(c) {
        if (!c) return null;
        var sd = c.sourceDetail || {};
        return get(sd.ghgrpId);
    }

    // A single mailable line, or null if there is no street address. Deliberately requires
    // `address`: a city and state alone is not somewhere you can send a letter, and joining what
    // is present would produce "Tucson, AZ" and present it as an address.
    function addressLine(rec) {
        if (!rec || !rec.address) return null;
        return [rec.address, rec.address2, rec.city, rec.state, rec.zip]
            .filter(Boolean).join(', ');
    }

    return {
        load: load,
        meta: meta,
        failed: failed,
        get: get,
        forCandidate: forCandidate,
        addressLine: addressLine
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GhgrpContacts;
