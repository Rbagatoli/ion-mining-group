/* Routes to a contact.
 *
 * The whole value of this list is that every link works and every description is
 * true. A route built from a field that was absent lands on a search page
 * pretending to be a facility report; a description that promises a phone number
 * is wrong the first time one is not there, and that is the last time any of
 * them get clicked. Both are tested here.
 */

var path = require('path');
var R = require(path.join(__dirname, '..', 'contact-routes.js'));

var pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { pass++; console.log('  ok    ' + label); return; }
    fail++;
    console.log('  FAIL  ' + label + (detail ? '   ' + detail : ''));
}
function eq(label, got, want) {
    ok(got === want, label, 'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}
function keys(rs) { return rs.map(function (r) { return r.key; }); }
function byKey(rs, k) {
    for (var i = 0; i < rs.length; i++) if (rs[i].key === k) return rs[i];
    return null;
}

var PUBLIC_LANDFILL = {
    name: 'Prince William County Sanitary Landfill',
    owner: 'Prince William County, Department of Public Works, VA',
    ownershipType: 'Public',
    counterpartyType: 'landfill_public',
    address: '14811 Dumfries Road', city: 'Manassas', state: 'VA', zip: '20112',
    county: 'Prince William',
    frsId: '110013945437',
    sourceKind: 'lmop-landfill'
};

// ---- A phone you already have needs no routes ----------------------------------
/* An Alberta flare whose operator is in the AER business registry. A page of
   routes to something already on screen is noise, and noise next to a real
   number makes the number look uncertain. */
eq('a site with a published phone gets no routes',
   R.routes({ name: 'Wellpad 7', operator: 'Whitecap Resources Inc.',
              operatorPhone: '(403) 266-0767' }).length, 0);
eq('and no note explaining an absence that is not there',
   R.absenceNote({ operatorPhone: '(403) 266-0767' }), null);

// ---- The public landfill, which is most of them ---------------------------------
var pub = R.routes(PUBLIC_LANDFILL);
ok(pub.length >= 4, 'a public landfill gets several routes', keys(pub).join(','));
/* The site's own listing first. A county landfill has a scalehouse with a number
   and hours, and whoever answers it knows the site — which a county switchboard
   frequently does not. */
eq('the facility listing leads', pub[0].key, 'maps');
ok(byKey(pub, 'owner'), 'the owning authority is searchable');
ok(byKey(pub, 'echo'), 'and the ECHO report is offered');
ok(byKey(pub, 'county'), 'with the county as the fallback');

/* Every URL has to survive being pasted into a browser. */
pub.forEach(function (r) {
    ok(/^https:\/\//.test(r.url), 'route ' + r.key + ' is an https url', r.url);
    ok(r.url.indexOf(' ') < 0, 'route ' + r.key + ' has no raw spaces', r.url);
    ok(!!r.label && !!r.why, 'route ' + r.key + ' says what it is and why');
});

/* The department is the half that gets you past a switchboard, so it is searched
   as a phrase. Unquoted, this returns the county and not the department. */
ok(decodeURIComponent(byKey(pub, 'owner').url).indexOf(
       '"Prince William County, Department of Public Works, VA"') >= 0,
   'the exact legal name is searched as a phrase',
   decodeURIComponent(byKey(pub, 'owner').url));

/* The FRS id is the join GHGRP provides. The link must carry it, not gesture at
   a search page. */
ok(byKey(pub, 'echo').url.indexOf('fid=110013945437') >= 0,
   'the ECHO link carries the facility id', byKey(pub, 'echo').url);
ok(byKey(pub, 'frs').url.indexOf('p_registry_id=110013945437') >= 0,
   'and so does the registry link');

// ---- Nothing is invented --------------------------------------------------------
/* No FRS id means no facility report. A link to ECHO's front page described as a
   facility report is worse than no link: it costs a click and teaches you the
   list is padded. */
var noFrs = R.routes(Object.assign({}, PUBLIC_LANDFILL, { frsId: null }));
ok(!byKey(noFrs, 'echo'), 'no FRS id, no ECHO link', keys(noFrs).join(','));
ok(!byKey(noFrs, 'frs'), 'and no registry link either');
ok(byKey(noFrs, 'maps'), 'the routes that still work are still there');

var bare = R.routes({ name: null, owner: null, sourceKind: 'lmop-landfill' });
eq('a record with nothing on it offers nothing', bare.length, 0);

var noAddr = R.routes({ name: 'Some Landfill', owner: 'Somebody', sourceKind: 'lmop-landfill' });
ok(!byKey(noAddr, 'maps'), 'no address and no city means no map link',
   'a map search on a name alone lands anywhere');
ok(byKey(noAddr, 'owner'), 'but the owner is still searchable');

// ---- Public and private are different problems ----------------------------------
/* For a Republic or WM site the facility address is a weighbridge, not an office.
   Leading somebody to it is leading them to a scale operator who cannot discuss
   a gas contract. */
var priv = R.routes({
    name: 'Apex Regional LF', owner: 'Republic Services, Inc.',
    ownershipType: 'Private', counterpartyType: 'landfill_private',
    address: '13550 N Sloan Ln', city: 'Las Vegas', state: 'NV', zip: '89115',
    county: 'Clark', frsId: '110070102030', sourceKind: 'lmop-landfill'
});
ok(/company/i.test(byKey(priv, 'owner').label),
   'a private owner is described as a company', byKey(priv, 'owner').label);
ok(/weighbridge|office/i.test(byKey(priv, 'owner').why),
   'and the reason says why the site address will not do', byKey(priv, 'owner').why);
ok(decodeURIComponent(byKey(priv, 'owner').url).indexOf('corporate office') >= 0,
   'the search asks for the head office');
/* The county route is for reaching a public authority that runs a site. It makes
   no sense for a private operator, so it is not offered. */
ok(!byKey(priv, 'county'), 'and no county desk is suggested for a private operator');

// ---- No route promises a number --------------------------------------------------
/* Descriptions name what the link opens. The first time "find their phone
   number" opens a page without one is the last time the list is trusted. */
pub.concat(priv).forEach(function (r) {
    ok(!/find (their|the) phone|get the number|will have/i.test(r.label + ' ' + r.why),
       'route ' + r.key + ' does not promise a number', r.label);
});

// ---- The absence is explained as a fact about the source --------------------------
var note = R.absenceNote({ sourceKind: 'lmop-landfill' });
ok(/EPA/.test(note) && /never a phone/i.test(note),
   'a landfill says EPA publishes none', note);
ok(/Alberta/.test(note), 'and says why Alberta is different');
ok(/EIA/.test(R.absenceNote({ sourceKind: 'eia-facility' })), 'a generator says EIA');
ok(!!R.absenceNote({ sourceKind: 'flare-viirs' }), 'and anything else still gets a sentence');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL PASS — ' + pass + ' assertions');
process.exit(fail ? 1 : 0);
