/* Regional reference geometry must not turn rejected or unknown locations into
 * usable site pins. Execute the shipped data and rendering module offline. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DIR = path.join(__dirname, '../../portal/scouting');
const read = name => fs.readFileSync(path.join(DIR, name), 'utf8');
const source = read('site-locator.js');
function boot({ geography = true, visuals = true } = {}) {
  const context = { window: { innerWidth: 1440 }, URL };
  for (const file of ['sample-data.js', ...(geography ? ['locator-geography.js'] : []), ...(visuals ? ['visual-data.js', 'site-visuals.js'] : []), 'site-locator.js']) {
    vm.runInNewContext(read(file), context, { timeout: 1000, filename: file });
  }
  return { window: context.window, api: context.window.ProtonSiteLocator, geo: context.window.ProtonLocatorGeography,
    sample: context.window.ProtonScoutingSample };
}
const h = boot(), profiles = [...h.sample.profiles, ...h.sample.exclusions.map(e => e.profile)];
const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('  ok    ' + name); }
function inRing(point, ring) {
  const [x,y] = point; let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi] = ring[i], [xj,yj] = ring[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function inState(point, state) { return state.coordinates.some(polygon => inRing(point,polygon[0]) && !polygon.slice(1).some(ring=>inRing(point,ring))); }

check('static context retains primary Census provenance and real closed geographic boundaries', () => {
  assert.equal(h.geo.geometry, 'MultiPolygon'); assert.equal(h.geo.coordinateOrder, 'longitude,latitude');
  assert.equal(h.geo.vintage, '2025'); assert.match(h.geo.referenceVintage, /^2026-/); assert.match(h.geo.checkedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(h.geo.attribution, /U.S. Census Bureau/);
  assert.match(h.geo.limitations, /not detailed coastlines, roads, parcels or navigation data/);
  assert(h.geo.sources.some(s => new URL(s.url).hostname === 'tigerweb.geo.census.gov'));
  assert(h.geo.sources.some(s => new URL(s.url).pathname.endsWith('/cb_2025_us_state_20m.zip')));
  for (const id of ['PA','NJ','NY','DE','MD','VA','WV','DC']) assert(h.geo.states.some(s=>s.id===id), 'Missing regional state ' + id);
  assert.equal(new Set(h.geo.states.map(s=>s.id)).size, h.geo.states.length);
  for (const state of h.geo.states) {
    assert(state.name && state.coordinates.length, state.id);
    for (const polygon of state.coordinates) {
      assert(polygon.length > 0, state.id + ': empty polygon');
      for (const ring of polygon) {
        assert(ring.length >= 4, state.id + ': insufficient ring points');
        assert.deepEqual(ring[0], ring.at(-1), state.id + ': open ring');
        for (const point of ring) assert(point.length === 2 && point.every(Number.isFinite) && point[0]>=-90 && point[0]<=-65 && point[1]>=30 && point[1]<=48, state.id + ': invalid geographic point');
      }
    }
  }
  for (const name of ['Philadelphia','New York City','Baltimore','Washington, DC','Harrisburg','Scranton','Elmira']) {
    const city = h.geo.cities.find(c=>c.name===name); assert(city, name);
    assert(Number.isFinite(city.lat) && Number.isFinite(city.lng), name + ': missing source point');
    assert.match(city.geoid, /^\d{7}$/); assert(city.priority > 0);
  }
});

check('known catalog points align with the sourced states and all polygons render without invalid path values', () => {
  for (const [id, state] of [['SIM-952','NJ'],['SIM-1273','PA'],['SIM-1250','PA']]) {
    const p = byId[id]; assert(inState([p.lng,p.lat],h.geo.states.find(s=>s.id===state)), id + ' must fall in ' + state);
  }
  const markup = h.api.render(profiles, 'SIM-952');
  const paths = Array.from(markup.matchAll(/<path class="sl-state [^"]+"[^>]*\bd="([^"]+)"/g), m=>m[1]);
  assert.equal(paths.length,h.geo.states.length);
  for (const d of paths) { assert.match(d,/^M/); assert.match(d,/Z$/); assert.doesNotMatch(d,/NaN|Infinity|undefined/); }
  assert.match(markup,/fill-rule="evenodd"/);
  assert.match(markup,/Philadelphia/); assert.match(markup,/Baltimore/); assert.match(markup,/New York/);
  assert.match(markup,/data-locator-expand[^>]*aria-haspopup="dialog"/);
});

check('rejected Alpha location stays unpinned with or without the visual supplement', () => {
  const before = JSON.stringify(h.sample);
  for (const visuals of [true,false]) {
    const t = boot({visuals}), p = byId['SIM-734'];
    assert.equal(t.api.canPlot(p),false);
    const markup = t.api.render(profiles,p.id);
    assert.doesNotMatch(markup,/data-locator-select="SIM-734"/);
    assert.match(markup,/Alpha Ridge omitted/); assert.match(markup,/3 mapped.*1 location pending/);
    assert.match(t.api.reference(p),/pending verification/);
  }
  assert.equal(JSON.stringify(h.sample),before,'Rendering must not mutate evidence');
});

check('unknown, missing, nonnumeric and out-of-range coordinates never produce map pins', () => {
  const bad = [
    {lat:null,lng:null},{lat:undefined,lng:-75},{lat:40,lng:undefined},
    {lat:'40',lng:'-75'},{lat:NaN,lng:-75},{lat:Infinity,lng:-75},
    {lat:90,lng:-75},{lat:-90,lng:-75},{lat:40,lng:181},{lat:40,lng:-181}
  ].map((coords,i)=>({id:'UNKNOWN-'+i,name:'Coordinate pending',location:'Location unknown',...coords}));
  for (const p of bad) { assert.equal(h.api.canPlot(p),false,p.id); assert.match(h.api.reference(p),/pending verification/); }
  const markup = h.api.render(bad,bad[0].id);
  assert.doesNotMatch(markup,/data-locator-select=/); assert.match(markup,/0 mapped.*10 location pending/);
  assert.doesNotMatch(markup,/\b(?:NaN|Infinity|undefined)\b/);
});

check('regional distance is a straight-line reference, with no driving-time claim', () => {
  const t = boot({visuals:false});
  t.window.ProtonLocatorGeography = {states:[],cities:[{name:'Reference City',lat:0,lng:0,priority:1}]};
  const east = {id:'DISTANCE-CHECK',name:'Test location',location:'Test region',lat:0,lng:1};
  assert.match(t.api.reference(east),/About 69 mi E of Reference City · straight-line/);
  const penn = h.api.reference(byId['SIM-952']);
  assert.match(penn,/About \d+ mi [NSEW]+ of Philadelphia · straight-line/);
  assert.doesNotMatch(penn,/driv|travel time|minutes|hours/i);
});

check('site and geography display text cannot inject markup or attributes', () => {
  const t = boot({visuals:false});
  const dangerous = '<img src=x onerror="alert(1)">';
  const p = {...byId['SIM-952'],id:'malicious" autofocus="true',name:dangerous,location:'<script>alert(2)</script>'};
  t.window.ProtonLocatorGeography.cities = [{name:dangerous,lat:p.lat,lng:p.lng,priority:1}];
  t.window.ProtonLocatorGeography.states[0].id = 'PA" onload="alert(3)';
  const markup = t.api.render([p],p.id);
  assert.match(markup,/&lt;img/); assert.match(markup,/&lt;script&gt;/); assert.match(markup,/malicious&amp;quot;|malicious&quot;/);
  assert.doesNotMatch(markup,/<img|<script|\sautofocus="|\sonload="/);
});

check('missing geography degrades to explicit text without inventing boundaries or losing selected location', () => {
  const t = boot({geography:false});
  const p = byId['SIM-952'], markup = t.api.render(profiles,p.id);
  assert.match(markup,/Regional map unavailable/); assert(markup.includes(p.location));
  assert.match(markup,/3 mapped.*1 location pending/); assert.doesNotMatch(markup,/<svg/);
  assert.equal(t.api.reference(p),p.location);
});

check('map module has no network, location permission, authentication or persistent-storage coupling', () => {
  for (const file of ['site-locator.js','locator-geography.js']) {
    const code = read(file);
    assert.doesNotMatch(code,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/);
    assert.doesNotMatch(code,/\b(?:localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie|navigator\.geolocation|\b(?:import|require)\s*\(/);
    assert.doesNotMatch(code,/\b(?:firebase|Firestore|Auth|ProtonSync|CRMStore|Stripe)\s*[.(]/);
  }
});

console.log('\n' + checks + ' site locator checks passed.');
