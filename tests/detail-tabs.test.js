// The detail panel's five sections became tabs. map-sourcing.js is a browser IIFE with no
// exports, so — like capital-ui.test.js — this pins the CONTRACT at source level: the renderer
// emits the strip and the panels, the strip is wired, the choice persists, the chart redraws
// when its tab opens, and the page actually styles what the renderer emits. The map page is too
// heavy for a headless screenshot (the globe plus a 15MB catalogue), so this census is the
// regression net; the CSS was verified by reading the cascade.

'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, got) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (got === undefined ? '' : '   got ' + JSON.stringify(got))); }
}

var SRC = fs.readFileSync(path.join(ROOT, 'map-sourcing.js'), 'utf8');
var HTML = fs.readFileSync(path.join(ROOT, 'map.html'), 'utf8');

console.log('\n=== the renderer emits the tabs ===');

['terms', 'scores', 'capacity', 'econ', 'evidence'].forEach(function (id) {
    ok('tab "' + id + '" is defined', SRC.indexOf("id: '" + id + "'") >= 0);
});
ok('the strip renders as a tablist', SRC.indexOf('class="dtabs" role="tablist"') >= 0);
ok('each panel renders as a tabpanel', SRC.indexOf('class="dtab-panel" role="tabpanel"') >= 0);
ok('an empty bucket renders no tab (buckets filter)',
   /TAB_DEFS\.filter\(function\(t\) \{ return !!buckets\[t\.key\]; \}\)/.test(SRC));

console.log('\n=== the strip is wired and the choice persists ===');

ok('the strip has a click handler', /querySelector\('\.dtabs'\)/.test(SRC) &&
   /strip\.addEventListener\('click'/.test(SRC));
ok('the chosen tab is remembered across prospects and reloads',
   SRC.indexOf("DETAIL_TAB_KEY = 'protonMiningDetailTab'") >= 0 &&
   /localStorage\.setItem\(DETAIL_TAB_KEY/.test(SRC) &&
   /localStorage\.getItem\(DETAIL_TAB_KEY\)/.test(SRC));
ok('a remembered tab absent for this prospect falls back to the first real one',
   /if \(!tabs\.some\(function\(t\) \{ return t\.id === active; \}\)\) active = tabs\[0\]\.id;/.test(SRC));

console.log('\n=== the chart survives the tab ===');

// Chart.js measures its container; a canvas drawn while hidden is 0x0. The old accordion
// redrew on open for exactly this reason, and the tabs must too — on switch AND on first
// paint when economics is the remembered tab.
ok('switching to economics redraws the trend chart',
   /if \(id === 'econ'\) renderTrend\(c\);/.test(SRC));
ok('first paint redraws it when economics is already active',
   /#dtab_econ'\)\.hidden\) \{[\s\S]{0,40}renderTrend\(c\);/.test(SRC.replace(/\r/g, '')));

console.log('\n=== the chart block is conditional, not merely hidden ===');

// kwByYear is the VIIRS flare survey series; a landfill never has one. renderTrend() hid only
// the canvas for the no-series case, leaving the heading over an empty rounded box — invisible
// inside the collapsed accordion, front-and-centre as a tab. The block must not be EMITTED
// without a series; the canvas-hiding line stays as the second line of defence.
ok('the trend block is emitted only when the source publishes a series',
   /if \(c\.sourceDetail && c\.sourceDetail\.kwByYear\) \{[\s\S]{0,220}Power potential by survey year/
       .test(SRC.replace(/\r/g, '')));
ok('renderTrend still refuses a missing canvas',
   /getElementById\('dTrend'\);[\s\S]{0,80}if \(!el/.test(SRC.replace(/\r/g, '')));

console.log('\n=== the old accordion is gone from this panel ===');

ok('no dgroup disclosures are emitted for the detail sections',
   SRC.indexOf("'dg_' + g + '_btn'") < 0 && SRC.indexOf('dg_terms') < 0);
ok('disclosure() itself survives for its other users (refine, provenance)',
   /disclosure\('provToggle'/.test(SRC) && /disclosure\('refineToggle'/.test(SRC));

console.log('\n=== the page styles what the renderer emits ===');

['.dtabs', '.dtab', '.dtab.is-on', '.dtab:focus-visible'].forEach(function (sel) {
    ok(sel + ' has a style rule', HTML.indexOf(sel + ' {') >= 0 || HTML.indexOf(sel + ',') >= 0);
});
// display:grid ignores column-width, so a multicol declaration on the grid would be a rule
// that looks like it does something. The grid IS the columns.
ok('#dBody carries no multicolumn rule for grid to ignore',
   !/\#dBody \{ column-width/.test(HTML));
ok('.src-detailgrid is still the grid that makes the columns',
   /\.src-detailgrid \{ display:grid/.test(HTML));

console.log('\n' + (fail ? 'FAILED — ' + fail + ' of ' + (pass + fail) : 'ALL PASS — ' + pass + ' assertions'));
if (fail) process.exit(1);
