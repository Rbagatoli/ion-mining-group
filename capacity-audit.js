/* ===== Which saved prospects hold a capacity figure nobody typed ==========================
 *
 * site-sources.js toSite() used to write usable_kw: cand.powerPotentialKw -- the GROSS resource
 * figure, before the gas cap and before parasitic load -- into a field named usable_kw. That is
 * fixed going forward, but every prospect saved before the fix still carries the inflated number,
 * and map-sourcing.js:301 prefers a saved usable_kw over the derived one. Those records go on
 * showing what they always showed, and a comparison between a saved site and an unsaved one is a
 * comparison between two different units.
 *
 * WHY THIS DETECTS RATHER THAN MIGRATES. usable_kw carries no provenance, and site-capacity.js:50
 * is explicit that a user-entered figure must beat the model -- a measurement beats a model. A
 * blind pass that recomputed every saved record would overwrite real measurements with modelled
 * ones, which is a worse failure than the one it fixes and an unrecoverable one.
 *
 * THE SIGNAL IS EXACT EQUALITY WITH THE CANDIDATE'S GROSS. A machine wrote powerPotentialKw
 * verbatim; a person typing a capacity by hand and landing exactly on 3,607 is implausible. So a
 * saved figure that equals the gross to the kW AND differs from what the gas supports is
 * machine-written with very high confidence. Anything else is left alone.
 *
 * THE FALSE-POSITIVE THAT IS NOT ONE. If a person genuinely typed the gross -- read it off the
 * card and copied it -- this flags it. That is the correct outcome: they typed a gross figure
 * into a usable field, which is the same error by hand.
 *
 * THE FALSE NEGATIVE IS DELIBERATE AND IT IS THE SAFE DIRECTION. Catalog rebuilds change gas
 * volumes, so a record saved correctly under older data may now match neither figure. It is
 * reported as `typed` and left untouched. Never guessing at a record that might hold a real
 * measurement is worth missing some that do not.
 */
var CapacityAudit = (function () {
    'use strict';

    /* Exact, not near. A tolerance would start absorbing typed figures that happen to land close,
       and "close to the gross" is not evidence of anything -- the whole argument for this
       detector is that landing on it EXACTLY is what a machine does. */
    function sameKw(a, b) { return a !== null && b !== null && Number(a) === Number(b); }

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /* One saved record against the candidate it came from. Returns a verdict object, never a
       bare boolean -- the caller has to show the reader why, and a boolean cannot be shown. */
    function classify(saved, candidate) {
        var have = num(saved && saved.usable_kw);
        if (have === null) {
            return { state: 'absent', reason: 'No capacity is recorded on this prospect.' };
        }
        if (!candidate) {
            /* map-sourcing.js:4191 says outright that prospect ids change when a catalog is
               rebuilt, so this is expected rather than exceptional and must be reported rather
               than counted as clean. A record whose candidate cannot be found cannot be judged. */
            return { state: 'unmatched', have: have,
                     reason: 'The candidate this was saved from is not in the loaded catalog, ' +
                             'so there is nothing to compare it against. Prospect ids change ' +
                             'when a catalog is rebuilt.' };
        }
        var gross = num(candidate.powerPotentialKw);
        var derived = (typeof SiteCapacity !== 'undefined' && SiteCapacity.usableKwFor)
            ? num(SiteCapacity.usableKwFor(candidate)) : null;
        if (derived === null) {
            return { state: 'unmatched', have: have, gross: gross,
                     reason: 'The capacity model cannot derive a usable figure for this ' +
                             'candidate, so the saved one cannot be judged.' };
        }
        if (sameKw(have, derived)) {
            return { state: 'current', have: have, derived: derived, gross: gross,
                     reason: 'Already the usable figure.' };
        }
        if (sameKw(have, gross)) {
            /* Gross and derived being equal is handled above by the `current` branch, so reaching
               here means they genuinely differ and the saved value sits on the gross. */
            return { state: 'suspect', have: have, derived: derived, gross: gross,
                     delta: derived - have,
                     delta_pct: Math.round((derived - have) / have * 1000) / 10,
                     reason: 'This is the candidate\'s gross figure to the kW. A person typing a ' +
                             'capacity does not land exactly on it, so it was almost certainly ' +
                             'written by the old save path.' };
        }
        return { state: 'typed', have: have, derived: derived, gross: gross,
                 delta: derived - have,
                 reason: 'This matches neither the gross nor the current derived figure, so it ' +
                         'is someone\'s own number — or it was saved against older catalog data. ' +
                         'Either way it is not touched.' };
    }

    /* THE WHOLE PICTURE, and every record lands in exactly one bucket so the counts add up to the
       number of saved prospects. A scan that quietly dropped the ones it could not judge would
       read as "nothing to do here". */
    function scan(opts) {
        var o = opts || {};
        var sites = o.sites || ((typeof SiteData !== 'undefined' && SiteData.list) ? SiteData.list() : []);
        var byId = {};
        var cands = o.candidates ||
            ((typeof ProspectStore !== 'undefined' && ProspectStore.all) ? ProspectStore.all() : []);
        for (var i = 0; i < cands.length; i++) {
            if (cands[i] && cands[i].id !== undefined) byId[String(cands[i].id)] = cands[i];
        }
        var out = { total: sites.length, suspect: [], typed: [], current: [], unmatched: [], absent: [] };
        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var v = classify(site, byId[String(site.id)] || null);
            v.id = site.id;
            v.name = site.name || site.id;
            out[v.state].push(v);
        }
        // Worst first: the biggest overstatement is the one most likely to have moved a decision.
        out.suspect.sort(function (a, b) { return (a.delta || 0) - (b.delta || 0); });
        out.overstated_kw = out.suspect.reduce(function (n, v) { return n + (v.have - v.derived); }, 0);
        return out;
    }

    /* ONE RECORD, AND ONLY ONE THAT WAS FLAGGED. Re-classified at the moment of writing rather
       than trusting a verdict computed when the panel was drawn: the catalog can reload and the
       saved record can be edited between the two, and correcting a figure on the strength of a
       stale judgement is the same class of error this module exists to find. */
    function recompute(siteId, candidate, opts) {
        if (typeof SiteData === 'undefined' || !SiteData.get) {
            return { ok: false, err: 'The prospect model is not loaded.' };
        }
        var site = SiteData.get(siteId);
        if (!site) return { ok: false, err: 'No such prospect.' };
        var v = classify(site, candidate || null);
        if (v.state !== 'suspect') {
            return { ok: false, err: 'This prospect is no longer flagged (' + v.state + '): ' +
                     v.reason + ' Nothing was changed.', verdict: v };
        }
        var res = SiteData.update(siteId, { usable_kw: v.derived });
        if (!res || (res._save && !res._save.ok)) {
            return { ok: false, err: 'The prospect could not be saved.' };
        }
        /* Logged, because this changes a capacity figure that prices a build, and a number that
           moves on its own has to be attributable without reading source. */
        if (typeof CrmLog !== 'undefined' && CrmLog.append) {
            CrmLog.append('note', String(siteId), {
                body: 'Usable capacity corrected from ' + v.have + ' kW to ' + v.derived +
                      ' kW. The saved figure was the candidate\'s gross resource number, written ' +
                      'by the old save path before parasitic load and the gas cap were applied.' +
                      ((opts && opts.by) ? ' Applied by ' + opts.by + '.' : '')
            });
        }
        return { ok: true, err: null, from: v.have, to: v.derived, site: res };
    }

    return {
        classify: classify,
        scan: scan,
        recompute: recompute,
        _sameKw: sameKw
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CapacityAudit;
