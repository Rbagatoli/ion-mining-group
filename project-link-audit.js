/* ===== Does each project still point at the prospect it was promoted from? ================
 *
 * Backlog items 1 and 2, which share one mechanism.
 *
 * A ProjectData record snapshots {prospect_id, name, lat, lng, source, development_stage} at
 * promotion and deliberately outlives its prospect -- a ledger should not evaporate because a
 * research record was tidied up. Nothing surfaced a dangling reference, so a project whose
 * prospect_id resolves to nothing looked exactly like one whose prospect is sitting there.
 *
 * WHAT THIS ACTUALLY CATCHES, AND THE BACKLOG WAS WRONG ABOUT IT.
 *
 * The backlog says a catalogue rebuild churns prospect ids and can silently point one at a
 * different landfill. A rebuild does not touch protonMiningSites at all -- it replaces
 * ProspectStore CANDIDATES. A saved prospect keeps its id, name, latitude and longitude
 * forever: every SiteData.update() call site in the product was checked, and not one writes
 * those four fields (capacity-audit.js writes usable_kw, map-sourcing.js writes verification,
 * contacts, stage, operator, rates and distress signals, project-gates.js writes
 * development_stage). So a snapshot can only disagree with SiteData when the sites ARRAY was
 * replaced wholesale: a sync pull, a backup restore, an import. That is what `repointed` and
 * `ambiguous` are, and this module claims nothing more.
 *
 * THE REAL CHURN HAZARD IS A SEPARATE, LIVE BUG THIS SITS ON TOP OF AND DOES NOT FIX.
 * map-sourcing.js findSavedSite(c.id) matches a REBUILT candidate onto the OLD saved record by
 * id and merges a different landfill's contacts, stage, operator and rates onto it, leaving id,
 * name and coordinates untouched. The record becomes a hybrid of two places, and this detector
 * calls it `linked`, correctly, because every field it can see still agrees. Filed separately.
 *
 * IT FLAGS AND NEVER REPAIRS. A missing prospect has four causes -- deleted here, deleted on
 * another device whose list replaced this one, an id that changed, or this device simply holding
 * an older copy -- and SiteData.remove() is a hard filter with no tombstone, so nothing can tell
 * them apart. Re-pointing a project at a rediscovered prospect would rewrite a frozen snapshot
 * on an inference, which is the guess the backlog forbids one level up.
 *
 * "THIS DEVICE COULD NOT CHECK" IS SAID ONCE, NOT N TIMES. If the prospect list was never
 * pulled, every project would otherwise report as missing, which is an alarm about the sync
 * state wearing the costume of an alarm about the ledger. SiteData.storeState() exists so this
 * can tell an empty list from an unread one and refuse to classify at all.
 */
var ProjectLinkAudit = (function () {
    'use strict';

    /* THE LOWER BOUND IS A COORDINATE-ROUNDING TOLERANCE, NOT AN IDENTITY RADIUS, and it is
       measured from this catalogue rather than borrowed. data/landfills.json: 407 LMOP landfill
       ids carry more than one project row, giving 1,382 pairs that are the same physical
       landfill -- maximum separation 0.0000 km and zero name differences. Observed same-place
       variance here is exactly zero, so this only has to absorb rounding: a coordinate rendered
       at three decimals moves at most ~110 m.

       THE UPPER BOUND IS REASONED, NOT MEASURED. 5 km is outside the largest landfill footprint
       plus any gate-to-centroid revision. It is not an identity radius and must not be read as
       one: 83 rows in this catalogue have a genuinely DIFFERENT landfill within 1 km, and 263
       have one within 5 km. That is exactly why anything between the two bounds is unknown and
       says so -- a 3 km shift is implausible for a revision and is not proof of a swap. */
    var SAME_KM = 0.15;
    var DIFFERENT_KM = 5.0;

    /* Worst first, and `retired` last because it is not a fault. Bucket keys ARE the state
       strings, so a state with no bucket throws rather than being silently dropped. */
    var STATES = ['repointed', 'ambiguous', 'missing', 'unlinked', 'linked_unverified',
                  'retired', 'linked'];
    /* The ones that are a problem somebody has to look at. `linked_unverified` is NOT here: it
       says the check could not conclude, and offering to clear it would invite clearing
       something that was never established. */
    var ACTIONABLE = ['repointed', 'ambiguous', 'missing', 'unlinked'];

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function text(v, max) {
        if (v === null || v === undefined) return null;
        var s = String(v).trim();
        if (!s) return null;
        return max ? s.slice(0, max) : s;
    }
    function nowIso() { return new Date().toISOString(); }

    function kmApart(a1, o1, a2, o2) {
        if (typeof SiteOpportunity === 'undefined' || !SiteOpportunity.haversineKm) return null;
        return SiteOpportunity.haversineKm(a1, o1, a2, o2);
    }

    /* A name that was generated FROM the coordinates cannot corroborate them. map-sourcing.js
       labels a nameless flare as "Country · lat, lng", and the two save paths disagree about
       what to write, so a name mismatch on a flare can be entirely an artefact of which path
       created the record. */
    function nameIsDerived(rec) {
        if (!rec) return false;
        if (String(rec.source || '') === 'flare_detection') return true;
        if (/^vnf_/.test(String(rec.id || ''))) return true;
        return /·\s*-?\d+\.\d+,\s*-?\d+\.\d+\s*$/.test(String(rec.name || ''));
    }
    function sameName(a, b) {
        function norm(s) {
            return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        }
        var x = norm(a), y = norm(b);
        return !x || !y ? null : x === y;
    }

    /* An index of the saved prospects by id, built once per scan. An ARRAY per id, because
       data/landfills.json carries duplicated ids and a restore can put two records under one --
       collapsing them to the first would make `ambiguous` invisible. */
    function indexOf(sites) {
        var ix = {};
        for (var i = 0; i < (sites || []).length; i++) {
            var s = sites[i];
            if (!s || s.id === undefined || s.id === null) continue;
            var k = String(s.id);
            (ix[k] = ix[k] || []).push(s);
        }
        return ix;
    }

    /* One project against the index. Returns a verdict object, never a bare boolean: the caller
       has to show a reader WHY, and a boolean cannot be shown. */
    function classify(project, ix) {
        var snap = (project && project.prospect) || {};
        var pid = text(snap.prospect_id);
        var cancelled = project && project.gate === 'cancelled';

        if (!pid) {
            return { state: 'unlinked', reason:
                'This project records no prospect id at all. promote() refuses that, so the ' +
                'record was imported or hand-edited rather than created here.' };
        }
        var hits = (ix && ix[pid]) || [];
        if (!hits.length) {
            /* CANCELLED IS NOT A FAULT. site-model.js deliberately lets a cancelled project's
               prospect be deleted so the prospect is reclaimable, and project-model's own tests
               pin that sequence as working on purpose. Without this branch every correctly
               tidied-up project lands in `missing` with the same sentence as a live project
               whose id now names a different landfill. */
            if (cancelled) {
                return { state: 'retired', prospect_id: pid, reason:
                    'The prospect is gone and this project is cancelled, which is the tidy-up ' +
                    'working as intended rather than a broken link.' };
            }
            return { state: 'missing', prospect_id: pid, reason:
                'Any of four things: the prospect was deleted on this device, it was deleted ' +
                'elsewhere and that device\'s whole list replaced this one, the id changed, or ' +
                'this device is holding an older copy of the list. Deleting leaves nothing ' +
                'behind, so these cannot be told apart — which is why nothing is repaired.' };
        }
        if (hits.length > 1) {
            return { state: 'ambiguous', prospect_id: pid, count: hits.length, reason:
                hits.length + ' saved prospects carry this id, so which one this project was ' +
                'promoted from cannot be established. Open each and keep the one that is real.' };
        }

        var rec = hits[0];
        var v = { state: 'linked', prospect_id: pid, site: rec, reason: null };
        var slat = num(snap.lat), slng = num(snap.lng);
        var rlat = num(rec.latitude), rlng = num(rec.longitude);
        var named = sameName(snap.name, rec.name);
        var derived = nameIsDerived(rec) || nameIsDerived({ id: pid, name: snap.name,
                                                            source: snap.source });

        if (slat === null || slng === null || rlat === null || rlng === null) {
            /* NO repointed BRANCH HERE. Awarding the strongest verdict on strictly less evidence
               than the branch that refuses it is promoting unknown to a finding. */
            v.state = 'linked_unverified';
            v.reason = 'One of the two records has no coordinates, so nothing available can ' +
                       'confirm this is the same place' +
                       (named === false ? ', and the names do not agree either.' : '.');
            return v;
        }
        var km = kmApart(slat, slng, rlat, rlng);
        if (km === null) {
            v.state = 'linked_unverified';
            v.reason = 'The distance model is not loaded, so the coordinates could not be ' +
                       'compared.';
            return v;
        }
        v.km = km;
        if (km >= DIFFERENT_KM) {
            v.state = 'repointed';
            v.reason = 'The saved prospect under this id sits ' + km.toFixed(1) + ' km from ' +
                       'where this project recorded it — "' + (rec.name || rec.id) +
                       '" against "' + (snap.name || pid) + '". That is a different place.';
            return v;
        }
        if (km > SAME_KM) {
            v.state = 'linked_unverified';
            v.reason = 'The saved prospect sits ' + km.toFixed(2) + ' km from where this ' +
                       'project recorded it — further than re-rounding a coordinate can move ' +
                       'it, and not far enough to call it a different site.';
            return v;
        }
        if (derived) {
            v.reason = 'The coordinates match. The name on one of these records is derived ' +
                       'from its coordinates, so it cannot corroborate them.';
            return v;
        }
        if (named === false) {
            /* NEVER repointed: a repoint means a different physical place, and the coordinates
               say it is not one. */
            v.state = 'linked_unverified';
            v.reason = 'The coordinates match but the name does not — "' + (rec.name || rec.id) +
                       '" against "' + (snap.name || pid) + '". The record may have been ' +
                       're-sourced under the same id.';
            return v;
        }
        v.reason = 'Resolves, and the saved record agrees with what was recorded at promotion.';
        return v;
    }

    /* THE WHOLE PICTURE, and every project lands in exactly one bucket so the counts add up.
       A scan that quietly dropped what it could not judge would read as a clean bill of health.

       opts lets a test inject stores rather than reaching for localStorage. */
    function scan(opts) {
        var o = opts || {};
        var out = { state: 'ready', reason: null, projects_seen: null, classified: 0,
                    acknowledged: 0, seen_prospects: null };
        for (var s = 0; s < STATES.length; s++) out[STATES[s]] = [];

        var store = o.storeState ||
            ((typeof SiteData !== 'undefined' && SiteData.storeState) ? SiteData.storeState()
                                                                     : null);
        if (!store) {
            out.state = 'no_site_model';
            out.reason = 'The prospect model is not loaded, so nothing can be checked.';
            return out;
        }
        var projects = o.projects ||
            ((typeof ProjectData !== 'undefined' && ProjectData.list) ? ProjectData.list() : null);
        if (!projects) {
            out.state = 'no_project_model';
            out.reason = 'The project model is not loaded, so nothing can be checked.';
            return out;
        }
        out.projects_seen = projects.length;

        /* SAID ONCE, NOT N TIMES. Classifying against a list this device has never pulled would
           report every project as missing -- an alarm about the sync state dressed as an alarm
           about the ledger. */
        if (store.state === 'absent' || store.state === 'unreadable') {
            out.state = store.state === 'absent' ? 'no_prospects_here' : 'prospects_unreadable';
            out.reason = store.reason + ' Every project would read as broken against it, so ' +
                         'nothing is classified until this device has a prospect list.';
            return out;
        }
        out.seen_prospects = store.count;

        var sites = o.sites ||
            ((typeof SiteData !== 'undefined' && SiteData.list) ? SiteData.list() : []);
        var ix = indexOf(sites);
        for (var i = 0; i < projects.length; i++) {
            var p = projects[i];
            var v = classify(p, ix);
            v.project_id = p.id;
            v.project_name = p.name;
            v.gate = p.gate;
            v.link = p.prospect_link || null;
            if (v.link && v.link.acknowledged_at && !v.link.cleared_at) out.acknowledged++;
            if (!out[v.state]) throw new Error('unbucketed state: ' + v.state);
            out[v.state].push(v);
            out.classified++;
        }
        for (var b = 0; b < STATES.length; b++) {
            out[STATES[b]].sort(function (x, y) {
                var xa = (x.link && x.link.unresolved_since) || '';
                var ya = (y.link && y.link.unresolved_since) || '';
                if (xa !== ya) return xa.localeCompare(ya);
                return String(x.project_id).localeCompare(String(y.project_id));
            });
        }
        return out;
    }

    function actionable(result) {
        var out = [];
        for (var i = 0; i < ACTIONABLE.length; i++) {
            out = out.concat(result[ACTIONABLE[i]] || []);
        }
        return out;
    }

    // ---- writes: the observation, never a repair ---------------------------------------

    function needModel() {
        return (typeof ProjectData === 'undefined' || !ProjectData.mutate)
            ? { ok: false, err: 'The project model is not loaded.' } : null;
    }

    /* Stamps when a reference was FIRST seen to fail, and clears the stamp when it resolves
       again. Nothing here is derived: the state is recomputed on every read, and only the date
       and the evidence behind it are kept. Refuses outright unless the scan actually classified
       something, so a device that could not see the prospect list cannot stamp every project. */
    function record(result) {
        var bad = needModel(); if (bad) return bad;
        if (!result || result.state !== 'ready') {
            return { ok: false, err: 'Nothing was classified, so nothing is recorded.' };
        }
        var stamped = 0, cleared = 0, errs = [];
        var flagged = {}, now = nowIso();
        actionable(result).forEach(function (v) { flagged[v.project_id] = true; });

        result.classified && [].concat(actionable(result),
                                       result.linked, result.linked_unverified, result.retired)
            .forEach(function (v) {
                var isBad = !!flagged[v.project_id];
                var link = v.link;
                if (isBad && link && link.unresolved_since && !link.cleared_at) return;
                if (!isBad && !(link && link.unresolved_since && !link.cleared_at)) return;
                var res = ProjectData.mutate(v.project_id, function (p) {
                    var m = p.prospect_link || {};
                    if (isBad) {
                        p.prospect_link = {
                            unresolved_since: now,
                            unresolved_seen_prospects: result.seen_prospects,
                            acknowledged_at: null, acknowledged_by: null, acknowledged_note: null,
                            cleared_at: null, cleared_seen_prospects: null
                        };
                    } else {
                        /* Cleared as a value, not a removed key: merge cannot express a
                           removal, and cleared_at:null is what lets a fresh failure re-stamp. */
                        m.cleared_at = now;
                        m.cleared_seen_prospects = result.seen_prospects;
                        p.prospect_link = m;
                    }
                });
                if (!res.ok) errs.push(v.project_id + ': ' + res.err);
                else if (isBad) stamped++; else cleared++;
            });
        return { ok: true, err: null, stamped: stamped, cleared: cleared, errs: errs };
    }

    /* A person looked at it and decided to leave it. Requires a note, because "acknowledged"
       with no reason is indistinguishable from a mis-click a year later, and this is the only
       record that anybody ever considered it. */
    function acknowledge(projectId, opts) {
        var bad = needModel(); if (bad) return bad;
        var o = opts || {};
        var note = text(o.note, 300);
        if (!note) return { ok: false, err: 'Leaving a broken link needs a note saying why.' };
        var by = text(o.by, 120);
        if (!by) return { ok: false, err: 'Acknowledging needs a name against it.' };
        return ProjectData.mutate(projectId, function (p) {
            var m = p.prospect_link || {};
            if (!m.unresolved_since) throw new Error('this project has no unresolved link recorded');
            m.acknowledged_at = nowIso();
            m.acknowledged_by = by;
            m.acknowledged_note = note;
            p.prospect_link = m;
        });
    }

    return {
        SAME_KM: SAME_KM,
        DIFFERENT_KM: DIFFERENT_KM,
        STATES: STATES,
        ACTIONABLE: ACTIONABLE,
        indexOf: indexOf,
        classify: classify,
        scan: scan,
        actionable: actionable,
        record: record,
        acknowledge: acknowledge
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectLinkAudit;
