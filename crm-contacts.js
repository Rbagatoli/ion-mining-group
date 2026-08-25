/* ===== Contacts as records rather than as five columns =====
 *
 * They were five flat fields on the site record — contact_name, contact_role,
 * contact_email, contact_phone, contact_notes — which cannot express the thing
 * that actually happens: one person covering several sites. A county waste
 * authority manager holds three landfills; an operator holds a dozen leases.
 * Under flat fields that person is typed in three times and goes stale in three
 * places independently.
 *
 * THE FLAT FIELDS ARE NOT DELETED, and that is deliberate:
 *
 *   1. normalize() keeps them regardless — they are on the template — so removing
 *      them from the record saves nothing.
 *   2. They are the fallback. If this store fails to load, contactTier reads the
 *      old fields and degrades to yesterday's answer instead of dropping every
 *      prospect to tier 4 "no operator identified", which would silently re-rank
 *      the entire pipeline.
 *   3. It stays reversible. Drop this file and the app still works.
 *
 * So the read order is: linked contacts first, flat fields second. The flat
 * fields are deprecated, not dead.
 *
 * WHAT THIS MUST NOT BREAK. site-opportunity.js scores contactability into the
 * opportunity score through contactTier(cand, ctx), and that function is PURE —
 * it reads ctx.manual and ctx.operator and touches no store. So it is not
 * changed here at all. What changes is what fills ctx.manual: contactCtx()
 * returns the record with the best linked contact overlaid on those three
 * fields, and the four call sites in map-sourcing.js ask for that instead of the
 * bare record. The tier ladder, its five assertions, and the score all stand.
 */
var CrmContacts = (function () {
    'use strict';

    var KEY = 'protonContacts';
    var VERSION = 1;

    /* Ordered best-first. Ranking is what makes "the best linked contact"
       decidable when three people are attached to one landfill. */
    var ROLES = ['decision_maker', 'operations', 'technical', 'gatekeeper', 'unknown'];

    var _cache = null;

    function empty() { return { _v: VERSION, seq: 0, contacts: [] }; }

    function read() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.contacts)) { _cache = parsed; return _cache; }
            }
        } catch (e) { /* fall through */ }
        _cache = empty();
        return _cache;
    }

    function write(data) {
        var res = { ok: true, err: null };
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            _cache = data;
        } catch (e) {
            res.ok = false;
            res.err = (e && (e.name === 'QuotaExceededError' || e.code === 22))
                ? 'Local storage is full — this contact was NOT saved.'
                : 'Could not save this contact.';
            return res;
        }
        if (typeof SyncEngine !== 'undefined' && SyncEngine.save) {
            try { SyncEngine.save('contacts'); } catch (e) { /* local write stands */ }
        }
        return res;
    }

    function newId(data) {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            var a = new Uint8Array(8), s = '';
            crypto.getRandomValues(a);
            for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
            return 'c_' + s;
        }
        data.seq = (data.seq || 0) + 1;
        return 'c_seq' + data.seq;
    }

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

    function blank() {
        return {
            id: null,
            name: '', title: '', organization: '',
            phone: '', email: '',
            role: 'unknown',
            source: '',            // how the contact was obtained
            /* Contacts decay. A number verified two years ago is a number you will
               find out is wrong at the worst possible moment, so the date it was
               last checked is a field rather than a note. */
            last_verified: null,
            notes: '',
            linked_prospects: [],
            created: null,
            updated: null
        };
    }

    function normalize(partial) {
        var c = blank();
        partial = partial || {};
        for (var k in c) {
            if (Object.prototype.hasOwnProperty.call(partial, k) && partial[k] !== undefined) c[k] = partial[k];
        }
        if (ROLES.indexOf(c.role) < 0) c.role = 'unknown';
        if (!Array.isArray(c.linked_prospects)) c.linked_prospects = [];
        /* Duplicates would double-count a contact against one prospect and make
           unlink() look like it had failed. */
        var seen = {}, out = [];
        for (var i = 0; i < c.linked_prospects.length; i++) {
            var p = String(c.linked_prospects[i]);
            if (!p || seen[p]) continue;
            seen[p] = true; out.push(p);
        }
        c.linked_prospects = out;
        c.name = String(c.name == null ? '' : c.name).slice(0, 120);
        return c;
    }

    function list() { return read().contacts; }

    function get(id) {
        var l = list();
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }

    function nowIso() { return new Date().toISOString(); }

    function add(partial) {
        var data = read();
        var c = normalize(partial);
        if (!c.id) c.id = newId(data);
        c.created = c.created || nowIso();
        c.updated = nowIso();
        data.contacts.push(c);
        var res = write(data);
        return res.ok ? c : null;
    }

    function update(id, patch) {
        var data = read();
        for (var i = 0; i < data.contacts.length; i++) {
            if (data.contacts[i].id !== id) continue;
            var merged = normalize(Object.assign({}, data.contacts[i], patch || {}));
            merged.id = id;
            merged.created = data.contacts[i].created;
            merged.updated = nowIso();
            data.contacts[i] = merged;
            return write(data).ok ? merged : null;
        }
        return null;
    }

    function remove(id) {
        var data = read();
        var before = data.contacts.length;
        data.contacts = data.contacts.filter(function (c) { return c.id !== id; });
        if (data.contacts.length === before) return false;
        return write(data).ok;
    }

    // ---- Links ---------------------------------------------------------------
    function link(contactId, prospectId) {
        var c = get(contactId);
        if (!c || !prospectId) return false;
        if (c.linked_prospects.indexOf(String(prospectId)) >= 0) return true;
        return !!update(contactId, { linked_prospects: c.linked_prospects.concat([String(prospectId)]) });
    }

    function unlink(contactId, prospectId) {
        var c = get(contactId);
        if (!c) return false;
        return !!update(contactId, {
            linked_prospects: c.linked_prospects.filter(function (p) { return p !== String(prospectId); })
        });
    }

    function forProspect(prospectId) {
        var id = String(prospectId);
        return list().filter(function (c) { return c.linked_prospects.indexOf(id) >= 0; });
    }

    // ---- Which contact is the best one --------------------------------------
    /* Ranked to match the ladder contactTier already implements, so promoting a
       contact into this store cannot move a prospect DOWN the opportunity score:
       a named human with a direct line beats a line with no name beats a name
       with no line. Role breaks ties, because between two reachable people the
       one who can say yes is the better contact. */
    function reachRank(c) {
        var named = has(c.name);
        var reachable = has(c.email) || has(c.phone);
        if (named && reachable) return 0;
        if (reachable) return 1;
        if (named) return 2;
        return 3;
    }

    function bestFor(prospectId) {
        var l = forProspect(prospectId);
        if (!l.length) return null;
        var best = null, bestKey = null;
        for (var i = 0; i < l.length; i++) {
            var roleIdx = ROLES.indexOf(l[i].role);
            if (roleIdx < 0) roleIdx = ROLES.length;
            var key = [reachRank(l[i]), roleIdx];
            if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
                best = l[i]; bestKey = key;
            }
        }
        return best;
    }

    /* THE MIGRATION SHIM, and the only thing site-opportunity.js needs to see.
       Returns the site record with the best linked contact overlaid on the three
       fields contactTier reads. Everything else on the record — operator above
       all — passes through untouched.

       A linked contact wins over the flat fields when it has anything to say; a
       linked contact with a name but no number does not erase a phone number
       somebody typed into the old fields, because that would lower the tier and
       silently re-rank the prospect. Best available, field by field. */
    function contactCtx(prospectId) {
        var rec = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(prospectId) : null;
        if (!rec) return null;
        var best = bestFor(prospectId);
        if (!best) return rec;
        var out = {};
        for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) out[k] = rec[k];
        if (has(best.name))  out.contact_name  = best.name;
        if (has(best.email)) out.contact_email = best.email;
        if (has(best.phone)) out.contact_phone = best.phone;
        if (has(best.role))  out.contact_role  = best.role;
        return out;
    }

    /* One-time promotion of the flat fields into real records. Idempotent by
       construction: a prospect that already has a linked contact is skipped, so
       running it twice cannot duplicate anybody. The flat fields are LEFT ALONE
       — see the header. */
    function backfill() {
        if (typeof SiteData === 'undefined' || !SiteData.list) return { created: 0, skipped: 0 };
        var sites = SiteData.list() || [];
        var created = 0, skipped = 0;
        for (var i = 0; i < sites.length; i++) {
            var s = sites[i];
            if (!s || !s.id) continue;
            if (forProspect(s.id).length) { skipped++; continue; }
            if (!has(s.contact_name) && !has(s.contact_email) && !has(s.contact_phone)) { skipped++; continue; }
            var c = add({
                name: has(s.contact_name) ? s.contact_name : '',
                email: has(s.contact_email) ? s.contact_email : '',
                phone: has(s.contact_phone) ? s.contact_phone : '',
                role: (s.contact_role && ROLES.indexOf(s.contact_role) >= 0) ? s.contact_role : 'unknown',
                organization: s.operator || '',
                notes: s.contact_notes || '',
                source: 'migrated from the prospect record',
                linked_prospects: [String(s.id)]
            });
            if (c) created++;
        }
        return { created: created, skipped: skipped };
    }

    function reset() { _cache = null; }

    return {
        KEY: KEY,
        ROLES: ROLES,
        blank: blank,
        normalize: normalize,
        list: list,
        get: get,
        add: add,
        update: update,
        remove: remove,
        link: link,
        unlink: unlink,
        forProspect: forProspect,
        bestFor: bestFor,
        contactCtx: contactCtx,
        backfill: backfill,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrmContacts;
