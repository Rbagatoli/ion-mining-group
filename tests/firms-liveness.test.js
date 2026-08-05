// ===== FIRMS liveness pipeline tests =====
//   node tests/firms-liveness.test.js
//
// No network and no MAP_KEY required: every function under test is pure. These cover the parts
// that can be wrong WITHOUT ANYONE NOTICING — a wildfire quietly marking a dead site as burning
// is worse than no liveness data at all, because it would be believed.

var path = require('path');
var F = require(path.join(__dirname, '..', 'tools', 'build-firms-liveness.js'));

var pass = 0, fail = 0;
function section(n) { console.log('\n=== ' + n + ' ==='); }
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail === undefined ? '' : '   -> ' + detail)); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

// A known Alberta flare to test against.
var SITE = { id: 'vnf_53.1784_-115.7501', lat: 53.1784, lon: -115.7501 };
var SITES = [SITE, { id: 'vnf_56.1433_-120.6662', lat: 56.1433, lon: -120.6662 }];

function det(lat, lon, date, type) {
    return { lat: lat, lon: lon, date: date, confidence: 'n', frp: 5, type: type === undefined ? null : type };
}

// ====================================================================================
section('Wildfire rejection — the failure that would be believed');

// One hot night on top of a known flare. A grass fire does exactly this. Without a recurrence
// requirement it would mark the site "still burning" with full confidence.
var oneNight = F.groupDetections([det(53.1784, -115.7501, '2026-07-01')], 3);
eq('a single night at a known flare is NOT a static source', oneNight.length, 0);

// Two nights is still not enough.
var twoNights = F.groupDetections([
    det(53.1784, -115.7501, '2026-07-01'),
    det(53.1785, -115.7502, '2026-07-02')
], 3);
eq('two nights is still rejected at min-nights 3', twoNights.length, 0);

// Three separate nights at the same pixel is the flare signature.
var threeNights = F.groupDetections([
    det(53.1784, -115.7501, '2026-07-01'),
    det(53.1785, -115.7502, '2026-07-03'),
    det(53.1783, -115.7500, '2026-07-06')
], 3);
eq('three distinct nights at one point IS a static source', threeNights.length, 1);
eq('night count recorded', threeNights[0].nights, 3);

// Many detections on ONE night must not pass — a big fire front produces exactly this.
var burst = [];
for (var i = 0; i < 40; i++) burst.push(det(53.1784 + i * 0.0001, -115.7501, '2026-07-01'));
eq('40 detections on a single night are still rejected', F.groupDetections(burst, 3).length, 0);

// A fire that MOVES does not re-light the same pixel, so each spot has one night.
var moving = [];
for (var d = 1; d <= 6; d++) moving.push(det(53.1784 + d * 0.05, -115.7501, '2026-07-0' + d));
eq('a fire front moving across the landscape is rejected', F.groupDetections(moving, 3).length, 0);

// When the archive DOES carry the type field it is authoritative and needs no recurrence.
var typed = F.groupDetections([det(53.1784, -115.7501, '2026-07-01', 2)], 3);
eq('an explicitly typed static source passes on one night', typed.length, 1);
eq('and is flagged as typed', typed[0].typed, true);
var vegFire = F.groupDetections([
    det(53.1784, -115.7501, '2026-07-01', 0),
    det(53.1784, -115.7501, '2026-07-02', 0),
    det(53.1784, -115.7501, '2026-07-03', 0)
], 3);
eq('a typed VEGETATION fire is rejected even with recurrence', vegFire.length, 0);

// ====================================================================================
section('Spatial matching');

function staticAt(lat, lon) { return { lat: lat, lon: lon, nights: 4, detections: 9, lastDate: '2026-07-10', typed: false }; }

var near = F.matchToSites(SITES, [staticAt(53.1790, -115.7505)], 1000);
ok('a detection ~70 m away matches the site', !!near[SITE.id], JSON.stringify(near));
ok('match distance recorded', near[SITE.id] && near[SITE.id].distance_m < 1000, near[SITE.id] && near[SITE.id].distance_m);

var far = F.matchToSites(SITES, [staticAt(53.2100, -115.7501)], 1000);
eq('a detection 3.5 km away does NOT match', Object.keys(far).length, 0);

var edgeIn = F.matchToSites(SITES, [staticAt(53.1784 + 0.008, -115.7501)], 1000);
ok('~890 m still matches (inside the 1 km radius)', !!edgeIn[SITE.id]);

var unmatched = F.matchToSites(SITES, [staticAt(10, 10)], 1000);
eq('a source with no catalogued flare nearby is discarded', Object.keys(unmatched).length, 0);

// Latest sighting wins, and evidence accumulates.
var two = F.matchToSites(SITES, [
    { lat: 53.1784, lon: -115.7501, nights: 3, detections: 5, lastDate: '2026-06-01', typed: false },
    { lat: 53.1786, lon: -115.7503, nights: 5, detections: 7, lastDate: '2026-07-20', typed: false }
], 1000);
eq('most recent sighting is kept', two[SITE.id].lastSeen, '2026-07-20');
eq('night counts take the strongest evidence', two[SITE.id].nights, 5);
eq('detections accumulate', two[SITE.id].detections, 12);

// ====================================================================================
section('CSV parsing');

var csv = 'country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n' +
          'CAN,53.1784,-115.7501,335.2,0.4,0.36,2026-07-01,0812,N,VIIRS,n,2.0NRT,290.1,12.4,N\n' +
          'CAN,56.1433,-120.6662,310.0,0.5,0.40,2026-07-02,0820,N,VIIRS,l,2.0NRT,280.0,3.1,N\n';
var p = F.parseCsv(csv);
eq('parses both rows', p.rows.length, 2);
eq('NRT correctly reports no type column', p.hasType, false);
eq('latitude read by header name', p.rows[0].lat, 53.1784);
eq('acquisition date read', p.rows[0].date, '2026-07-01');
eq('confidence read', p.rows[1].confidence, 'l');

var typedCsv = 'latitude,longitude,acq_date,confidence,frp,type\n53.1784,-115.7501,2026-07-01,h,20.0,2\n';
var tp = F.parseCsv(typedCsv);
eq('archive CSV reports the type column', tp.hasType, true);
eq('type parsed', tp.rows[0].type, 2);

// Column ORDER changing upstream must not silently shift fields.
var reordered = F.parseCsv('acq_date,longitude,latitude,confidence\n2026-07-05,-115.7501,53.1784,h\n');
eq('reordered columns still parse by name (lat)', reordered.rows[0].lat, 53.1784);
eq('reordered columns still parse by name (lon)', reordered.rows[0].lon, -115.7501);

eq('empty input is handled', F.parseCsv('').rows.length, 0);
eq('header-only input is handled', F.parseCsv('latitude,longitude,acq_date\n').rows.length, 0);
eq('a malformed short row is skipped', F.parseCsv('latitude,longitude,acq_date\n53.1,\n').rows.length, 0);

// ====================================================================================
section('Query boxes');

var boxes = F.deriveBoxes([
    { lat: 53.1, lon: -115.7 }, { lat: 53.9, lon: -114.2 },   // same 2-degree cell region
    { lat: 31.9, lon: -102.3 },                                // Permian
    { lat: 61.0, lon: 74.0 }                                   // Siberia
], 2);
ok('boxes derived only where sites exist', boxes.length >= 2 && boxes.length <= 4, boxes.length);
ok('every site falls inside some box', [
    { lat: 53.1, lon: -115.7 }, { lat: 53.9, lon: -114.2 }, { lat: 31.9, lon: -102.3 }, { lat: 61.0, lon: 74.0 }
].every(function(s) {
    return boxes.some(function(b) { return s.lat >= b.south && s.lat < b.north && s.lon >= b.west && s.lon < b.east; });
}), JSON.stringify(boxes));
ok('boxes are well formed', boxes.every(function(b) { return b.east > b.west && b.north > b.south; }));

// Adjacent cells merge into one wider request rather than many narrow ones.
var run = F.deriveBoxes([
    { lat: 53.1, lon: -115.5 }, { lat: 53.1, lon: -113.5 }, { lat: 53.1, lon: -111.5 }
], 2);
eq('three adjacent cells merge into one box', run.length, 1);
ok('merged box spans all three', run[0].east - run[0].west >= 6, JSON.stringify(run[0]));

// ====================================================================================
section('Determinism');

var rowsA = [
    det(53.1784, -115.7501, '2026-07-01'), det(53.1785, -115.7502, '2026-07-03'),
    det(53.1783, -115.7500, '2026-07-06'), det(56.1433, -120.6662, '2026-07-02'),
    det(56.1434, -120.6663, '2026-07-04'), det(56.1432, -120.6661, '2026-07-08')
];
var rowsB = rowsA.slice().reverse();
// The emitted artifact is committed, so it must be byte-stable: identical data has to
// serialise identically regardless of the order detections arrived in, or every re-run
// produces a phantom git diff.
var outA = JSON.stringify(F.sortKeys(F.matchToSites(SITES, F.groupDetections(rowsA, 3), 1000)));
var outB = JSON.stringify(F.sortKeys(F.matchToSites(SITES, F.groupDetections(rowsB, 3), 1000)));
eq('input order does not change the serialised output', outA, outB);
eq('re-running the same input is byte-identical', outA,
   JSON.stringify(F.sortKeys(F.matchToSites(SITES, F.groupDetections(rowsA, 3), 1000))));
ok('both sites confirmed in the fixture', Object.keys(JSON.parse(outA)).length === 2, outA);

console.log('\n' + (fail === 0 ? 'ALL PASS — ' + pass + ' assertions' : pass + ' passed, ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
