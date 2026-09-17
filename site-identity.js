/* Physical identity is independent of a catalogue project and of a CRM record.
 * Only exact authority IDs or an operator's explicit shared identifier join records.
 * Coordinates, names and SiteLinks proximity suggestions never join them here. */
var SiteIdentity = (function () {
    'use strict';
    function text(v) { return String(v == null ? '' : v).trim(); }
    function clean(v) { return text(v).toLowerCase(); }
    function unique(a) { return Array.from(new Set(a.filter(Boolean))).sort(); }
    function sourceKeys(candidate) {
        var c = candidate || {}, d = c.sourceDetail || {}, source = c.source;
        if ((source === 'lmop-landfill' || (!source && d.lfid)) && text(d.lfid)) return ['landfill:us:' + clean(d.lfid)];
        if (source === 'eccc-landfill-ca' && text(d.ghgrpId)) return ['landfill:ca:ghgrp:' + clean(d.ghgrpId)];
        if (source === 'eia-facility' && text(d.plantCode)) return ['plant:us:eia:' + clean(d.plantCode)];
        return [];
    }
    function keys(site) {
        var s = site || {}, d = s.discovery || {}, a = s.acquisition || {}, out = [];
        (Array.isArray(d.identityKeys) ? d.identityKeys : []).forEach(function(k) {
            if (/^(landfill:us:|landfill:ca:ghgrp:|plant:us:eia:)[a-z0-9-]+$/i.test(k)) out.push(clean(k));
        });
        // Only legacy IDs that actually encode a physical authority ID are recoverable.
        // lmop_<project> does not encode a landfill ID and is deliberately not decoded.
        var id = text(d.sourceRecordId || s.id), match;
        if ((!d.sourceId || d.sourceId === 'eia-facility') && (match = /^eia_(\d+)$/.exec(id))) out.push('plant:us:eia:' + match[1]);
        if ((!d.sourceId || d.sourceId === 'eccc-landfill-ca') && (match = /^ca-lf-(G\d+)$/i.exec(id))) out.push('landfill:ca:ghgrp:' + clean(match[1]));
        if ((!d.sourceId || d.sourceId === 'lmop-landfill') && (match = /^lmop_lf_(\d+)$/.exec(id))) out.push('landfill:us:' + match[1]);
        if (text(a.physical_site_id)) {
            var manual = clean(a.physical_site_id);
            out.push(/^(landfill:us:|landfill:ca:ghgrp:|plant:us:eia:)/.test(manual) ? manual : 'manual:' + manual);
        }
        return unique(out);
    }
    function sourceId(site) {
        var s = site || {}, d = s.discovery || {}, id = text(d.sourceRecordId || s.id);
        if (d.sourceId) return d.sourceId;
        if (/^lmop_/.test(id)) return 'lmop-landfill';
        if (/^ca-lf-/.test(id)) return 'eccc-landfill-ca';
        if (/^eia_/.test(id)) return 'eia-facility';
        return s.source === 'flare_detection' ? 'flare-viirs' : 'unrecorded';
    }
    function matchesSource(site, candidate) {
        var s = site || {}, c = candidate || {}, d = s.discovery || {};
        if (d.sourceId && d.sourceId !== c.source) return false;
        if (d.stableSourceRecordId && c.stableSourceRecordId) return d.stableSourceRecordId === c.stableSourceRecordId;
        if (s.id === c.id || d.sourceRecordId === c.id || d.flareId === c.id) return true;
        // Old ambiguous project IDs require a recorded physical ID before they can be
        // associated with one of the project's landfills. Never choose by row order.
        var legacy = c.sourceDetail && c.sourceDetail.legacyRecordId;
        return !!legacy && (legacy === s.id || legacy === d.sourceRecordId) && sourceKeys(c).some(function(k) { return keys(s).indexOf(k) >= 0; });
    }
    function savedForCandidate(sites, candidate) {
        var matches = (sites || []).filter(function(s) { return matchesSource(s, candidate); });
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) {
            var group = forSite(sites, matches[0].id);
            if (group && group.reviewed && matches.some(function(s) { return s.id === group.primaryId; }) &&
                matches.every(function(s) { return group.members.some(function(m) { return m.id === s.id; }); })) return group.primary;
        }
        return null;
    }
    function groups(sites) {
        var list = (sites || []).filter(function(s) { return s && s.id; });
        var parents = list.map(function(_, i) { return i; }), owner = Object.create(null), identity = list.map(keys);
        function root(i) { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; }
        list.forEach(function(s, i) {
            identity[i].concat(['record:' + s.id]).forEach(function(k) {
                if (owner[k] !== undefined) parents[root(i)] = root(owner[k]); else owner[k] = i;
            });
        });
        var buckets = Object.create(null);
        list.forEach(function(s, i) { (buckets[root(i)] = buckets[root(i)] || []).push(s); });
        return Object.keys(buckets).map(function(k) {
            var members = buckets[k].sort(function(a, b) { return String(a.id).localeCompare(String(b.id)); });
            var allKeys = unique([].concat.apply([], members.map(keys))), ids = members.map(function(s) { return s.id; });
            var signature = JSON.stringify(members.map(function(s) { return [s.id, keys(s)]; }));
            var reviews = members.map(function(s) { return (s.acquisition || {}).identity_review || null; });
            var duplicateIds = unique(ids).length !== ids.length;
            var review = reviews[0];
            var reviewed = !duplicateIds && !!review && review.members_signature === signature &&
                ids.indexOf(review.primary_id) >= 0 && reviews.every(function(r) { return JSON.stringify(r) === JSON.stringify(review); });
            var primaryId = members.length === 1 && !duplicateIds ? members[0].id : (reviewed ? review.primary_id : null);
            return { id: allKeys[0] || 'record:' + ids[0], keys: allKeys, members: members, signature: signature,
                token: JSON.stringify([signature, reviews]), identified: allKeys.length > 0, duplicateIds: duplicateIds,
                reviewed: reviewed, review: reviewed ? review : null, primaryId: primaryId,
                primary: primaryId === null ? null : members.filter(function(s) { return s.id === primaryId; })[0] };
        }).sort(function(a, b) { return a.id.localeCompare(b.id); });
    }
    function forSite(sites, id) { return groups(sites).filter(function(g) { return g.members.some(function(s) { return s.id === id; }); })[0] || null; }
    function review(sites, id, command, nowMs) {
        var group = forSite(sites, id), c = command || {}, now = new Date(nowMs === undefined ? Date.now() : nowMs).toISOString();
        function fail(err) { return { ok: false, err: err }; }
        if (!group) return fail('This prospect no longer exists.');
        if (group.token !== c.token) return fail('These site identities or their review changed. Reload this panel and review the current group.');
        if (group.duplicateIds) return fail('Two saved records have the same record ID. Resolve the imported record IDs before selecting a primary.');
        if (!group.members.some(function(s) { return s.id === c.primary_id; })) return fail('Choose a primary record from this group.');
        if (c.confirmed !== true || !text(c.by) || !text(c.evidence)) return fail('Confirm the shared site and enter your name and the identity / capacity basis.');
        var record = { primary_id: c.primary_id, members_signature: group.signature, by: text(c.by).slice(0, 160),
            evidence: text(c.evidence).slice(0, 4000), at: now };
        var updated = JSON.parse(JSON.stringify(sites));
        updated.forEach(function(s) {
            if (!group.members.some(function(m) { return m.id === s.id; })) return;
            s.acquisition = s.acquisition || {};
            s.acquisition.identity_review = record;
            s.acquisition.identity_history = (s.acquisition.identity_history || []).concat([record]);
            s.updated = now;
        });
        return { ok: true, sites: updated };
    }
    return { keys: keys, sourceKeys: sourceKeys, sourceId: sourceId, matchesSource: matchesSource, savedForCandidate: savedForCandidate, groups: groups, forSite: forSite, review: review };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SiteIdentity;
