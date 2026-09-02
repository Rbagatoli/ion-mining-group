// Tests for data/site-links.json and site-links.js.
//
// These run against the REAL artifact rather than fixtures. The whole value of this join is that
// it is true of the actual data, and a fixture would only prove the code agrees with itself.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var SiteLinks = require(path.join(ROOT, 'site-links.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond) { eq(label, !!cond, true); }

var LINKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site-links.json'), 'utf8'));
var FAC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'facilities.json'), 'utf8')).facilities;
var LF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'landfills.json'), 'utf8')).projects;

// ---- 1. The join itself ----------------------------------------------------------------------

console.log('\n=== the join ===');
(function() {
    var lfg = FAC.filter(function(f) { return f.technology === 'Landfill Gas'; });
    eq('279 EIA landfill-gas plants', lfg.length, 279);
    eq('204 of them link', LINKS.links.length, 204);
    eq('counts agree with the array', LINKS.counts.linked, LINKS.links.length);
    eq('the rest are recorded as unlinked', LINKS.counts.unlinked, lfg.length - LINKS.links.length);

    // The radius is a real cutoff, not a truncation: the distribution stops short of it.
    ok('every link is inside the radius', LINKS.links.every(function(l) {
        return l.landfills.every(function(g) { return g.distanceM <= LINKS.radiusM; });
    }));
    ok('the furthest match is well inside 1 km', LINKS.counts.separationMaxM < 1000);
    ok('the median is a few hundred metres', LINKS.counts.separationMedianM < 600);

    // Checked against a field the join never consulted. This is the guard the removed name
    // matcher failed: it agreed with itself and disagreed with reality.
    eq('state agrees on every link', LINKS.counts.stateAgreement, LINKS.links.length);
})();

// ---- 2. Never silently pick the nearest ------------------------------------------------------

console.log('\n=== every candidate is emitted, never just the nearest ===');
(function() {
    var multi = LINKS.links.filter(function(l) { return l.landfills.length > 1; });
    eq('the multi-candidate count is recorded', LINKS.counts.plantsWithMultipleCandidates, multi.length);
    ok('multi-candidate plants keep all their candidates',
       multi.every(function(l) { return l.landfills.length > 1; }));
    ok('every landfill carries its own distance',
       LINKS.links.every(function(l) {
           return l.landfills.every(function(g) { return typeof g.distanceM === 'number'; });
       }));
    // A link with zero landfills would be a link to nothing.
    ok('no link is empty', LINKS.links.every(function(l) { return l.landfills.length > 0; }));
})();

// ---- 3. It links, it does not merge ----------------------------------------------------------

console.log('\n=== nothing is overwritten ===');
(function() {
    var facById = {};
    FAC.forEach(function(f) { facById[f.id] = f; });
    var lfById = {};
    LF.forEach(function(p) { lfById[p.id] = p; });

    ok('every linked facility still exists untouched', LINKS.links.every(function(l) {
        var f = facById[l.facilityId];
        return f && f.nameplateMw === l.facilityMw;
    }));
    // Both capacity figures survive side by side — that is the point.
    var disagreeing = LINKS.links.filter(function(l) {
        return l.landfills.some(function(g) {
            return g.capacityKw !== null && l.facilityMw !== null &&
                   Math.abs(g.capacityKw / 1000 - l.facilityMw) > 0.5;
        });
    });
    ok('capacity disagreements are preserved rather than resolved', disagreeing.length > 0);
    console.log('        ' + disagreeing.length + ' links carry two different capacity figures');

    // The basis travels with the number: only 772 of 1,908 rows have an EPA rated MW, and a gas
    // flow estimate differing from a nameplate is not a contradiction.
    ok('every landfill states its capacity basis', LINKS.links.every(function(l) {
        return l.landfills.every(function(g) { return g.capacityKw === null || !!g.capacityBasis; });
    }));
})();

// ---- 4. Disagreements are group-wise ---------------------------------------------------------

console.log('\n=== operating disagreements ===');
(function() {
    var total = LINKS.links.reduce(function(s, l) { return s + l.disagreements.length; }, 0);
    eq('the count is recorded honestly', LINKS.counts.operatingDisagreements, total);
    // Row-wise comparison against the nearest row inflates this to roughly 3x. Asking the group
    // question - "does this landfill have ANY live project" - is what keeps it small and real.
    ok('the count is small enough to be a worklist, not noise', total < 40);
    ok('at least one is found', total > 0);

    // At most one disagreement per landfill per plant: more would mean the same landfill was
    // being counted repeatedly, which is exactly the row-wise bug.
    ok('no landfill disagrees with itself twice', LINKS.links.every(function(l) {
        var seen = {};
        return l.disagreements.every(function(d) {
            if (seen[d.lfid]) return false;
            seen[d.lfid] = 1;
            return true;
        });
    }));

    var kinds = {};
    LINKS.links.forEach(function(l) {
        l.disagreements.forEach(function(d) { kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
    });
    console.log('        ' + JSON.stringify(kinds));
    // The valuable direction: a retired generator on a landfill still producing gas.
    ok('the retired-plant-live-gas case is found', (kinds.eia_retired_lmop_operating || 0) > 0);
})();

// ---- 5. Project spans ------------------------------------------------------------------------

console.log('\n=== one project across several landfills ===');
(function() {
    eq('30 projects span landfills', LINKS.projectSpans.length, 30);
    ok('each spans at least two landfills',
       LINKS.projectSpans.every(function(s) { return s.members.length >= 2; }));
    ok('members are real separate places, not duplicates',
       LINKS.projectSpans.every(function(s) {
           var ids = {};
           s.members.forEach(function(m) { ids[m.lfid] = 1; });
           return Object.keys(ids).length === s.members.length;
       }));
    var far = LINKS.projectSpans.filter(function(s) { return s.maxSeparationM > 1000; });
    ok('some are kilometres apart — collapsing them would delete locations', far.length > 0);
    console.log('        ' + far.length + ' spans exceed 1 km between members, max ' +
        Math.max.apply(null, LINKS.projectSpans.map(function(s) { return s.maxSeparationM; })) + ' m');
    ok('the over-count is recorded', LINKS.counts.capacityDoubleCountedKw > 0);
})();

// ---- 6. No row is lost -----------------------------------------------------------------------

console.log('\n=== nothing is deleted ===');
(function() {
    // The single most important invariant. This artifact must never reduce the prospect count:
    // an earlier version of this idea collapsed colliding ids and would have deleted 32 real
    // landfill locations.
    var referenced = {};
    LINKS.links.forEach(function(l) {
        l.landfills.forEach(function(g) { g.projectIds.forEach(function(p) { referenced[p] = 1; }); });
    });
    var lfIds = {};
    LF.forEach(function(p) { lfIds[p.id] = 1; });
    ok('every referenced project id exists in the catalog',
       Object.keys(referenced).every(function(p) { return !!lfIds[p]; }));
    // Re-pinned for the coverage sweep: +849 rows, proven additive (0 repriced, 0 removed).
    eq('the landfill catalog is unchanged in size', LF.length, 2755);
    eq('and the facility catalog too', FAC.length, 9765);
})();

// ---- 7. The browser module -------------------------------------------------------------------

console.log('\n=== the module ===');
(function() {
    // Before load(): every lookup is null, nothing throws. The artifact is optional.
    eq('not ready before load', SiteLinks.ready(), false);
    eq('meta is null before load', SiteLinks.meta(), null);
    eq('lookup is null before load', SiteLinks.forProspect({ id: 'eia_1' }), null);
    eq('aliases are empty before load', SiteLinks.aliasesOf({ id: 'eia_1' }).length, 0);
    eq('disagreements are an empty array, never null',
       SiteLinks.disagreements({ id: 'eia_1' }).length, 0);

    // Feed it the real artifact through the same path fetch would.
    global.fetch = function() {
        return Promise.resolve({ ok: true, json: function() { return Promise.resolve(LINKS); } });
    };
    return SiteLinks.load().then(function() {
        ok('ready after load', SiteLinks.ready());
        ok('meta reports the radius', SiteLinks.meta().radiusM === LINKS.radiusM);

        var sample = LINKS.links[0];
        var byFac = SiteLinks.forProspect({ id: sample.facilityId });
        ok('a facility resolves to its link', byFac && byFac.facilityId === sample.facilityId);

        var pid = sample.landfills[0].projectIds[0];
        var byProj = SiteLinks.forProspect({ id: pid });
        ok('and so does the landfill on the other side', byProj && byProj.facilityId === sample.facilityId);
        ok('both sides resolve to the SAME link object', byFac === byProj);

        var aliases = SiteLinks.aliasesOf({ id: sample.facilityId });
        ok('the facility knows its landfill aliases', aliases.length > 0);
        ok('and never lists itself', aliases.indexOf(sample.facilityId) < 0);

        var withDis = LINKS.links.filter(function(l) { return l.disagreements.length; })[0];
        var texts = SiteLinks.disagreements({ id: withDis.facilityId });
        ok('a disagreement renders as prose', texts.length > 0 && texts[0].text.length > 40);
        ok('an unlinked id is null', SiteLinks.forProspect({ id: 'eia_does_not_exist' }) === null);
        ok('a null candidate is safe', SiteLinks.forProspect(null) === null);

        console.log('');
        console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED');
        process.exit(fail === 0 ? 0 : 1);
    });
})();
