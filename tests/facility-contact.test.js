// Tests for the US counterparty data in data/facilities.json — EIA-860 Schedules 1, 3 and 4.
//
// These run against the REAL artifact rather than fixtures, for the same reason site-links does:
// the value of this join is that it is true of the actual 9,765 plants, and a fixture would only
// prove the code agrees with itself.
//
// The counts here are deliberately EXACT rather than ">= some floor". A silent coverage
// regression — a renamed EIA column emptying a field the metadata still claims 100% on — is the
// specific failure this file exists to catch, and a floor would sail straight past it.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond) { eq(label, !!cond, true); }

var A = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'facilities.json'), 'utf8'));
var F = A.facilities, C = A.companies, N = A.counts;

// ---- 1. The join is by key, not by name ------------------------------------------------------
// This section is the guard against someone "simplifying" the companies map back to a name key.

console.log('\n=== keyed by Utility ID, never by name ===');
(function() {
    var ids = {}, names = {};
    F.forEach(function(f) { if (f.utilityId) ids[f.utilityId] = true; });
    Object.keys(C).forEach(function(k) { if (C[k].name) names[C[k].name] = true; });
    eq('every facility carries a utilityId', F.filter(function(f) { return !f.utilityId; }).length, 0);
    eq('4,084 distinct operators', Object.keys(ids).length, 4084);
    eq('the companies map has one entry each', Object.keys(C).length, 4084);
    eq('counts agree with the map', N.companies, Object.keys(C).length);
    // The whole argument for the id key in one assertion: four names are held by two companies.
    eq('but only 4,080 distinct NAMES', Object.keys(names).length, 4080);

    var byName = {};
    Object.keys(C).forEach(function(k) {
        var n = C[k].name;
        (byName[n] = byName[n] || []).push(C[k]);
    });
    var collided = Object.keys(byName).filter(function(n) { return byName[n].length > 1; }).sort();
    eq('exactly four names collide', collided.length, 4);
    collided.forEach(function(n) {
        var addrs = {};
        byName[n].forEach(function(c) { addrs[[c.address, c.city, c.state].join('|')] = true; });
        // If these ever shared an address the name key would be harmless. They do not.
        ok('"' + n + '" resolves to distinct addresses', Object.keys(addrs).length === byName[n].length);
    });

    eq('no facility resolves to a missing company',
       F.filter(function(f) { return f.utilityId && !C[f.utilityId]; }).length, 0);
})();

// ---- 2. Coverage, as exact counts -------------------------------------------------------------

console.log('\n=== coverage ===');
(function() {
    eq('9,765 facilities', F.length, 9765);
    eq('counts agree', N.facilities, F.length);

    var withMail = F.filter(function(f) { return C[f.utilityId] && C[f.utilityId].address; }).length;
    eq('9,764 have an operator mailing address', withMail, 9764);
    eq('counts agree', N.operatorsWithMailingAddress, withMail);

    var withSite = F.filter(function(f) { return !!f.address; }).length;
    eq('9,761 have a plant street address', withSite, 9761);
    eq('counts agree', N.plantsWithSiteAddress, withSite);

    var withKv = F.filter(function(f) { return f.gridVoltageKv !== null && f.gridVoltageKv !== undefined; }).length;
    eq('every plant has a grid voltage', withKv, 9765);
    eq('counts agree', N.plantsWithGridVoltage, withKv);
})();

// ---- 3. Ownership is a positive assertion, not an absence -------------------------------------

console.log('\n=== who owns it ===');
(function() {
    var h = { sole_operator: 0, third_party: 0, joint: 0, mixed: 0 }, none = 0;
    F.forEach(function(f) { if (f.ownership) h[f.ownership]++; else none++; });
    eq('8,264 report single ownership by the operator', h.sole_operator, 8264);
    eq('1,294 are wholly owned by a third party', h.third_party, 1294);
    eq('188 are jointly owned', h.joint, 188);
    eq('19 are mixed across their generators', h.mixed, 19);
    // The load-bearing one: the code is present on EVERY plant, which is what lets sole ownership
    // be read as a statement rather than inferred from a missing Schedule 4 row.
    eq('and NONE is unknown', none, 0);
    eq('the four states sum to the catalog',
       h.sole_operator + h.third_party + h.joint + h.mixed, F.length);
    eq('counts agree', N.ownershipSole, h.sole_operator);
    eq('counts agree', N.ownershipThirdParty, h.third_party);

    var withRows = F.filter(function(f) { return f.owners && f.owners.length; });
    eq('1,512 carry Schedule 4 owner rows', withRows.length, 1512);
    eq('counts agree', N.plantsWithOwnerRows, withRows.length);

    var multi = withRows.filter(function(f) {
        var n = {}; f.owners.forEach(function(o) { n[o.name] = true; });
        return Object.keys(n).length > 1;
    }).length;
    eq('199 have more than one distinct owner', multi, 199);

    // The contradiction is REPORTED, not resolved by picking a winner.
    var contra = withRows.filter(function(f) { return f.ownership === 'sole_operator'; }).length;
    eq('11 are coded sole yet carry an owner row', contra, 11);
    eq('counts agree', N.ownershipCodeSaysSoleButSchedule4RowExists, contra);

    // Honesty guard: a third-party plant with no owner row would assert someone else owns it
    // while being unable to say who.
    eq('no third_party plant lacks an owner row',
       F.filter(function(f) { return f.ownership === 'third_party' && !(f.owners && f.owners.length); }).length, 0);

    // The reason the whole build exists.
    var sole = withRows.filter(function(f) { return f.owners.length === 1; });
    eq('1,313 plants have exactly one filed owner', sole.length, 1313);
    eq('1,307 of them name someone OTHER than the operator',
       sole.filter(function(f) { return f.owners[0].name !== f.operator; }).length, 1307);

    // No empty arrays: 8,253 records would each carry one for nothing on an artifact fetched
    // before the prospects tab can draw.
    eq('owners is never an empty array',
       F.filter(function(f) { return Array.isArray(f.owners) && f.owners.length === 0; }).length, 0);
})();

// ---- 4. The unit trap -------------------------------------------------------------------------
// EIA publishes Percent Owned as a FRACTION. Rendered raw, a 100% owner reads as owning 1%.

console.log('\n=== percent owned is a fraction in the source ===');
(function() {
    var all = [];
    F.forEach(function(f) { if (f.owners) f.owners.forEach(function(o) { all.push(o); }); });
    ok('every share is in (0, 100]', all.every(function(o) {
        return o.sharePct === null || (o.sharePct > 0 && o.sharePct <= 100);
    }));
    var full = all.filter(function(o) { return o.sharePct === 100; }).length;
    ok('at least 1,300 owners hold exactly 100%', full >= 1300);

    // The direct regression. Before the conversion every one of these read 1.
    var sole = F.filter(function(f) { return f.owners && f.owners.length === 1; });
    eq('no sole owner reads as 1% or less',
       sole.filter(function(f) { return f.owners[0].sharePct !== null && f.owners[0].sharePct <= 1; }).length, 0);

    // PER GENERATOR, not per plant. Shares are filed against a generator id, so a plant with two
    // wholly-owned generators legitimately sums to 200% -- 17 plants here do. Summing at plant
    // level and expecting 100 was this test being wrong about the data, and it is precisely why
    // the build must never average generator shares into one plant figure.
    var badGen = 0, checked = 0;
    F.forEach(function(f) {
        if (!f.owners || f.owners.length < 2) return;
        var perGen = {};
        f.owners.forEach(function(o) {
            if (o.sharePct === null) return;
            o.generators.forEach(function(g) { perGen[g] = (perGen[g] || 0) + o.sharePct; });
        });
        Object.keys(perGen).forEach(function(g) {
            checked++;
            if (Math.abs(perGen[g] - 100) > 0.5) badGen++;
        });
    });
    ok('several hundred generators were checked', checked > 300);
    eq('every generator has shares summing to 100', badGen, 0);
    ok('and 17 plants legitimately exceed 100 at plant level', F.filter(function(f) {
        if (!f.owners || f.owners.length < 2) return false;
        var s = 0; f.owners.forEach(function(o) { s += o.sharePct || 0; });
        return s > 100.5;
    }).length === 17);
})();

// ---- 5. Zero-padded ZIPs ----------------------------------------------------------------------
// Excel stored these numerically. Unpadded, a maps link to "Rahway, NJ 7065" does not resolve.

console.log('\n=== zip codes survived Excel ===');
(function() {
    var z = Object.keys(C).map(function(k) { return C[k].zip; }).filter(Boolean);
    eq('every company zip is five digits',
       z.filter(function(x) { return !/^[0-9]{5}$/.test(x); }).length, 0);
    ok('and hundreds of them needed the pad',
       z.filter(function(x) { return x[0] === '0'; }).length > 500);
    eq('Merck Rahway kept its leading zero', C['12311'] ? C['12311'].zip : null, '07065');

    var oz = [];
    F.forEach(function(f) { if (f.owners) f.owners.forEach(function(o) { if (o.zip) oz.push(o.zip); }); });
    eq('owner zips too', oz.filter(function(x) { return !/^[0-9]{5}$/.test(x); }).length, 0);
})();

// ---- 6. Roles are never conflated -------------------------------------------------------------

console.log('\n=== the operator is not the owner ===');
(function() {
    // Six plants are coded "wholly owned by another entity" and then name the operator as that
    // entity -- Bradford Solar is operated and owned by Bradford Solar, LLC. That is the filing
    // contradicting itself, not this code conflating the roles, so it is counted and surfaced
    // rather than asserted away or silently corrected.
    var selfOwned = F.filter(function(f) {
        if (!f.owners || f.ownership !== 'third_party') return false;
        return f.owners.some(function(o) { return o.name === f.operator; });
    }).length;
    eq('6 third-party plants name their own operator as the owner', selfOwned, 6);
    eq('and the artifact reports that', N.ownershipThirdPartyButOwnerIsOperator, selfOwned);
    ok('ownershipNote states it too', A.ownershipNote.indexOf(String(selfOwned)) >= 0);
    ok('and warns against averaging shares', /PER GENERATOR/.test(A.ownershipNote));

    var nev = F.filter(function(f) { return /Neversink/i.test(f.name || ''); })[0];
    ok('Neversink is in the catalog', !!nev);
    if (nev) {
        eq('  operated by NYPA', nev.operator, 'New York Power Authority');
        eq('  owned by someone else', nev.ownership, 'third_party');
        eq('  namely the City of New York', nev.owners[0].name, 'City of New York');
        ok('  with an address to write to', !!nev.owners[0].address);
    }
})();

// ---- 7. Caveats carry their own numbers -------------------------------------------------------
// A caveat that drifts away from the data it describes is worse than no caveat, because it still
// reads as measured.

console.log('\n=== the metadata cannot drift ===');
(function() {
    ok('ownershipNote states the sole count',
       A.ownershipNote.indexOf(String(N.ownershipSole)) >= 0);
    ok('ownershipNote states the third-party count',
       A.ownershipNote.indexOf(String(N.ownershipThirdParty)) >= 0);
    ok('ownershipNote refuses the absent-row inference',
       /ABSENT Schedule 4 row is not the evidence/i.test(A.ownershipNote));
    ok('contactNote states the out-of-state count',
       A.contactNote.indexOf(String(N.operatorAddressOutOfState)) >= 0);
    ok('contactNote says no phone is published', /no telephone number/i.test(A.contactNote));
    ok('unitTrap warns about the fraction', /FRACTION/.test(A.unitTrap));
    ok('and works the example through', A.unitTrap.indexOf('0.4024') >= 0);
    ok('ownerSource names the keys, not a name match', /Utility ID and Plant\s+Code/.test(A.ownerSource));

    // The four fields read at build time but deliberately not shipped.
    ['balancingAuthority', 'regulatoryStatus', 'gasPipeline', 'gasLdc'].forEach(function(k) {
        eq('"' + k + '" is not shipped on the records',
           F.filter(function(f) { return f[k] !== undefined; }).length, 0);
    });
    ok('but the regulatory cross-check was still run',
       typeof N.offtakeDisagreesWithRegulatoryStatus === 'number');
})();

// ---- 8. The adapter reaches all of it ---------------------------------------------------------

console.log('\n=== the adapter surfaces it ===');
(function() {
    global.SiteSources = { register: function() {}, unregister: function() {} };
    var FacilitySource = require(path.join(ROOT, 'source-facility.js'));
    // load() fetches; the module keeps its data in a closure, so drive normalize through the
    // adapter after priming it the way prospect-store does.
    var primed = false;
    try { primed = !!FacilitySource.load; } catch (e) {}
    ok('the adapter exposes companyFor', typeof FacilitySource.companyFor === 'function');
    // Without loaded data it must answer null rather than throw — the panel renders before the
    // artifact is guaranteed present.
    eq('companyFor is null-safe before load', FacilitySource.companyFor('12311'), null);
    eq('and refuses a name passed by mistake', FacilitySource.companyFor('Merck & Co Inc'), null);
    eq('and a null id', FacilitySource.companyFor(null), null);
    ok('load exists', primed);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
