// Tests for the capital-avoided UI surfaces in map-sourcing.js.
//
// map-sourcing.js is a browser IIFE with no exports, so these test the CONTRACT the UI depends
// on rather than the render itself: that every field the detail section and the table read is
// actually produced, that the saved record can hold the verification flag, and that the sort the
// starter card selects orders by the thing it claims to.
//
// The assertions worth having here are the ones that catch a rename. A detail section reading
// `cap.mandateMonths` when the model emits `monthsToDeadline` renders "undefined months to the
// deadline" and nothing throws — the page just quietly lies. Every field read is pinned below.

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
global.SiteSources = require(path.join(ROOT, 'site-sources.js'));
global.SiteCapex = require(path.join(ROOT, 'site-capex.js'));
var SS = global.SiteSources;
var LS = require(path.join(ROOT, 'source-landfill.js'));
var CA = require(path.join(ROOT, 'source-landfill-ca.js'));
var SI = require(path.join(ROOT, 'site-infrastructure.js'));

var pass = 0, fail = 0;
function ok(label, cond, got) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (got === undefined ? '' : '   got ' + JSON.stringify(got))); }
}
var NOW = '2026-08-26';

var SRC = fs.readFileSync(path.join(ROOT, 'map-sourcing.js'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');

console.log('\n=== every field the detail section reads is actually emitted ===');
/* A rename in site-infrastructure.js cannot break the render loudly — it renders "undefined" and
   the page keeps working. So each read is pinned against a real result. */
var lf = SS.normalize(LS.adapter.normalize(
    require(path.join(ROOT, 'data', 'landfills.json')).projects
        .filter(function (p) { return p.collectionSystem === 'Shutdown' && p.powerPotentialKw > 900; })[0]),
    'lmop-landfill');
var r = SI.capitalAvoided(lf, { asOf: NOW, band: 'mid' });

['avoidedUsd', 'requiredUsd', 'totalBuildUsd', 'conditionVerified', 'confidence',
 'band', 'components', 'inventory', 'mandateMonths', 'mandateFactor'].forEach(function (k) {
    ok('capitalAvoided emits ' + k, Object.prototype.hasOwnProperty.call(r, k));
});
ok('components carry label, state, fullUsd, discount, avoidedUsd — the five table columns',
   r.components.length > 0 && r.components.every(function (x) {
       return typeof x.label === 'string' && typeof x.state === 'string' &&
              typeof x.fullUsd === 'number' && typeof x.discount === 'number' &&
              typeof x.avoidedUsd === 'number';
   }));
ok('inventory.evidence is an array of {field, value} — the provenance line joins on both',
   Array.isArray(r.inventory.evidence) && r.inventory.evidence.every(function (e) {
       return typeof e.field === 'string' && e.value !== undefined;
   }));

console.log('\n=== every inventory state the glyph and the table can render has a style ===');
/* The collection COLUMN's vocabulary is shutdown/installed/none. The inventory's is
   present/shutdown/mandated/absent/unknown. They overlap by one word, so a missing rule here
   renders a state in the inherited body colour and it reads as unremarkable — which is exactly
   wrong for `absent`, the one that costs money. */
var STATES = {};
require(path.join(ROOT, 'data', 'landfills.json')).projects.slice(0, 400).forEach(function (p) {
    var inv = SI.inventory(SS.normalize(LS.adapter.normalize(p), 'lmop-landfill'));
    ['collection', 'generation', 'gasTreatment', 'electrical', 'civil'].forEach(function (k) {
        STATES[inv[k]] = true;
    });
});
require(path.join(ROOT, 'data', 'landfills-ca.json')).prospects.slice(0, 200).forEach(function (p) {
    var inv = SI.inventory(SS.normalize(CA.adapter.normalize(p), 'eccc-landfill-ca'));
    ['collection', 'generation'].forEach(function (k) { STATES[inv[k]] = true; });
});
var unstyled = Object.keys(STATES).filter(function (s) {
    return HTML.indexOf('.src-coll.s-' + s) < 0;
});
ok('every state the real data produces has a CSS rule', unstyled.length === 0, unstyled);

console.log('\n=== the sort option the starter card selects exists in both places ===');
/* setSort() writes a value into the select. If the option is not there the browser silently
   keeps the previous selection, so the card appears to work and orders by something else. */
ok('capital_avoided is an option on #fSort', /<option value="capital_avoided"/.test(HTML));
ok('...and applyFilters re-sorts on it rather than leaving it to SiteScoring',
   /sortBy === 'capital_avoided'/.test(SRC));
ok('...and it has a label, so the list header does not read "ranked"',
   /capital_avoided:\s*'/.test(SRC));
ok('the starter card selects it', /setSort\('capital_avoided'\)/.test(SRC));

console.log('\n=== the three new columns line up with their headers ===');
var headers = (HTML.match(/<th data-sort="[a-z_]+"[^>]*>/g) || []);
['infraverified', 'capavoided', 'caprequired'].forEach(function (k) {
    ok('header exists for ' + k, headers.some(function (h) { return h.indexOf('"' + k + '"') >= 0; }));
    ok('...and tableSortValue handles it', SRC.indexOf("case '" + k + "':") >= 0);
});
/* The empty-state row spans the table, and adding a column without touching it leaves a ragged
   gap where "no results" should sit — which reads as a broken table rather than an empty one.
   Counted from map.html rather than hard-coded, so this stays true through the next column too.
   Scoped to the PROSPECT table: the watchlist beside it has six columns of its own. */
var thead = HTML.slice(0, HTML.indexOf('srcTableBody'));
thead = thead.slice(thead.lastIndexOf('<thead'));
var thCount = (thead.match(/<th\b/g) || []).length;
var bodyRows = (SRC.match(/srcTableBody[\s\S]{0,400}?colspan="(\d+)"/g) || [])
    .concat(SRC.match(/colspan="(\d+)"[^>]*style="padding:6px 10px 14px;"/g) || []);
var spans = bodyRows.map(function (m) { return Number(m.match(/colspan="(\d+)"/)[1]); });
ok('the prospect table has ' + thCount + ' columns and its empty row spans all of them',
   thCount === 18 && spans.length > 0 && spans.every(function (n) { return n === thCount; }),
   thCount + ' headers, spans ' + JSON.stringify(spans));

console.log('\n=== the verification flag survives a save ===');
/* site-model normalize() copies only keys present on blankSite() and silently DROPS the rest.
   A field missing from the template would let the button appear to work, write nothing, and
   revert on reload. */
var SD = require(path.join(ROOT, 'site-model.js'));
var blank = SD.blankSite();
ok('infra_condition_verified is on the record template',
   Object.prototype.hasOwnProperty.call(blank, 'infra_condition_verified'));
ok('...and defaults to NULL, not false — "not looked at" is not "looked at and it is scrap"',
   blank.infra_condition_verified === null);
ok('...and normalize() carries it through',
   SD.normalize({ infra_condition_verified: true }).infra_condition_verified === true);

console.log('\n=== verifying a site is worth showing a number for ===');
var unver = SI.capitalAvoided(lf, { asOf: NOW });
var ver = SI.capitalAvoided(
    Object.assign({}, lf, { sourceDetail: Object.assign({}, lf.sourceDetail,
        { infraConditionVerified: true }) }), { asOf: NOW });
ok('the button changes the figure it sits under', ver.avoidedUsd > unver.avoidedUsd,
   unver.avoidedUsd + ' -> ' + ver.avoidedUsd);
ok('and the verdict banner flips with it',
   unver.conditionVerified === false && ver.conditionVerified === true);

console.log('\n=== the sort ranks dollars, and the score ranks share ===');
/* These are deliberately different axes and the difference is easy to erase by accident. The
   list sorts on absolute avoided capital, because a shortlist is spent against in dollars; the
   SCORER uses the share, so a 500 kW site is comparable to a 5 MW one. */
function shut(kw) {
    return { id: 'x' + kw, energyType: 'landfill_gas', powerPotentialKw: kw,
             existingGenerationKw: kw,
             sourceDetail: { collectionSystem: 'Shutdown', projectStatus: 'Shutdown' } };
}
var small = shut(500), big = shut(5000);
ok('ten times the site carries roughly ten times the avoided DOLLARS',
   Math.abs(SI.capitalAvoided(big, { asOf: NOW }).avoidedUsd /
            SI.capitalAvoided(small, { asOf: NOW }).avoidedUsd - 10) < 0.01);
ok('...while the SHARE is identical — which is the whole reason the two axes are kept apart',
   SI.avoidedScore(small, { asOf: NOW }) === SI.avoidedScore(big, { asOf: NOW }),
   SI.avoidedScore(small, { asOf: NOW }) + ' vs ' + SI.avoidedScore(big, { asOf: NOW }));
/* AND THE SHARE IS HIGHER FOR A RUNNING PLANT THAN A SHUT ONE, which looks backwards against
   the thesis and is not. Share measures how much of the build is there AND CREDIBLE: a running
   plant's equipment is discounted at 0.60 for condition doubt, a shut one's at 0.35, because
   nobody knows what happened to a shut plant between the last kWh and today. What makes the shut
   site the better BUY is that its gas is not under contract — and that is acquirability's job,
   scored separately and combined afterwards. Conflating the two would let condition doubt read
   as an argument for buying, which it never is. */
var running = { id: 'r', energyType: 'landfill_gas', powerPotentialKw: 500,
                existingGenerationKw: 500,
                sourceDetail: { collectionSystem: 'Yes', projectStatus: 'Operational' } };
ok('a running plant scores HIGHER on capital avoided than an identical shut one',
   SI.avoidedScore(running, { asOf: NOW }) > SI.avoidedScore(small, { asOf: NOW }),
   SI.avoidedScore(running, { asOf: NOW }) + ' vs ' + SI.avoidedScore(small, { asOf: NOW }));
ok('...and verifying the shut one on site closes the whole gap',
   SI.avoidedScore(Object.assign({}, small, { sourceDetail:
       Object.assign({}, small.sourceDetail, { infraConditionVerified: true }) }),
       { asOf: NOW }) > SI.avoidedScore(running, { asOf: NOW }));

console.log('\n=== nothing renders a bare capital figure ===');
/* The single rule the brief is most emphatic about: the whole thesis rests on equipment being
   usable, and the dataset cannot establish that. Wherever an unverified figure appears it is
   marked. */
ok('the table cell marks unverified figures', /src-unver/.test(SRC));
ok('the detail section leads with the condition verdict', /src-capverdict/.test(SRC));
ok('the word UNVERIFIED appears in the detail copy, not just a symbol',
   /UNVERIFIED ESTIMATE/.test(SRC));

console.log('\n=== the verify control writes through to storage ===');
ok('it promotes an untracked prospect before updating it',
   /SiteData\.fromCandidate\(cand\)/.test(SRC) &&
   /infra_condition_verified: true/.test(SRC));
ok('...and clears the memo, or the figure on screen would not move',
   /clearCapitalCache\(\);[\s\S]{0,400}infra_condition_verified: true|infra_condition_verified: true[\s\S]{0,200}clearCapitalCache\(\)/.test(SRC));

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                               : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
