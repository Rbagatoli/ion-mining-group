// ===== Site quality — distance to grid infrastructure =====
//
// site_quality carries 15% of the opportunity score and has been null for every one of the
// 27,798 prospects since it was written, because road, fiber and grid distances were only ever
// enterable by hand and nobody has surveyed 27,798 sites. That weight silently redistributed to
// the other components, so 15% of the model measured nothing.
//
// This fills the grid half from real data.
//
// WHY SUBSTATIONS RATHER THAN TRANSMISSION LINES. A transmission line passing overhead is not a
// connection — you interconnect at a substation. Substations are also points rather than
// polylines, which makes both the download and the distance maths an order of magnitude cheaper.
// Lines are available (94,619 records) if line-of-sight proximity ever matters.
//
// SOURCES, and why not the obvious ones:
//   - HIFLD Open was the standard free source for this and DHS shut it down. Its transmission
//     dataset survives on the Data Rescue Project portal but behind a Cloudflare challenge, and
//     its SUBSTATIONS dataset is absent from that 417-item catalogue entirely.
//   - NETL/DOE's Energy Transition Atlas served this openly until recently and now answers
//     "Token Required" (HTTP 499). Verified, not assumed.
//   - OpenStreetMap via Overpass is the right source for Canada, but NOT per prospect: 27,798
//     point queries would blow through its stated 10,000/day guideline in a single run and match
//     the "stitching bounding boxes to scrape the full data" pattern its usage policy explicitly
//     prohibits. One bbox per province is fine and is what this does.
//
// Usage:
//   node tools/build-site-quality.js [--out data/site-quality.json] [--skip-canada]
var https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache', 'grid');

var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
function flag(name) { return argv.indexOf('--' + name) >= 0; }
var OUT = path.resolve(ROOT, arg('out', 'data/site-quality.json'));

// A US nationwide substations layer. 47,358 records. Its dataLastEditDate is 2018, which is old
// but substations are long-lived infrastructure and it is the only working nationwide mirror
// found. The age ships in the artifact so nobody reads it as current.
var US_SUBSTATIONS =
    'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Electric_Substations/FeatureServer/0';
var PAGE = 2000;

// One bbox per province/territory rather than per prospect.
var CANADA_REGIONS = [
    { code: 'AB', s: 48.9,  w: -120.1, n: 60.1, e: -109.9 },
    { code: 'BC', s: 48.2,  w: -139.1, n: 60.1, e: -114.0 },
    { code: 'SK', s: 48.9,  w: -110.1, n: 60.1, e: -101.3 },
    { code: 'MB', s: 48.9,  w: -102.1, n: 60.1, e: -88.9 },
    { code: 'ON', s: 41.6,  w: -95.2,  n: 56.9, e: -74.3 },
    { code: 'QC', s: 44.9,  w: -79.8,  n: 62.6, e: -57.1 },
    { code: 'NB', s: 44.5,  w: -69.1,  n: 48.1, e: -63.7 },
    { code: 'NS', s: 43.3,  w: -66.4,  n: 47.1, e: -59.7 },
    { code: 'PE', s: 45.9,  w: -64.5,  n: 47.1, e: -61.9 },
    { code: 'NL', s: 46.6,  w: -59.5,  n: 60.4, e: -52.6 },
    { code: 'YT', s: 60.0,  w: -141.1, n: 69.7, e: -123.8 },
    { code: 'NT', s: 60.0,  w: -136.5, n: 70.0, e: -102.0 },
    { code: 'NU', s: 60.0,  w: -120.5, n: 73.0, e: -61.0 }
];

function log(s) { console.log(s); }
function progress(s) { if (process.stdout.isTTY) process.stdout.write('\r  ' + s + '          '); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function getText(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
        var req = https.get(url, { headers: { 'User-Agent': 'proton-mining/site-quality' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy();
                return resolve(getText(new URL(res.headers.location, url).href, opts));
            }
            var s = '';
            res.on('data', function (d) { s += d; });
            res.on('end', function () { resolve({ status: res.statusCode, body: s }); });
        });
        req.on('error', function (e) { resolve({ status: 0, body: '', error: e.code || e.message }); });
        req.setTimeout(opts.timeout || 120000, function () { req.destroy(); resolve({ status: -1, body: '', error: 'timeout' }); });
    });
}

function cacheFile(name) {
    fs.mkdirSync(CACHE, { recursive: true });
    return path.join(CACHE, name.replace(/[^A-Za-z0-9_.-]/g, '_'));
}

// ---- US substations, paginated -----------------------------------------------------------
async function usSubstations() {
    var cached = cacheFile('us_substations.json');
    if (fs.existsSync(cached)) {
        try { return JSON.parse(fs.readFileSync(cached, 'utf8')); } catch (e) {}
    }
    var countRes = await getText(US_SUBSTATIONS + '/query?where=1%3D1&returnCountOnly=true&f=json');
    var total = 0;
    try { total = JSON.parse(countRes.body).count || 0; } catch (e) {}
    if (!total) throw new Error('US substations: no count returned (' + countRes.body.slice(0, 120) + ')');

    var out = [], offset = 0, meta = { lastEdit: null };
    // Ask for the edit date once so the artifact can state how old this is.
    var infoRes = await getText(US_SUBSTATIONS + '?f=json');
    try {
        var info = JSON.parse(infoRes.body);
        if (info.editingInfo && info.editingInfo.dataLastEditDate) {
            meta.lastEdit = new Date(info.editingInfo.dataLastEditDate).toISOString().slice(0, 10);
        }
    } catch (e) {}

    while (offset < total) {
        progress('US substations ' + out.length + '/' + total);
        var url = US_SUBSTATIONS + '/query?where=1%3D1&outFields=NAME,STATE&returnGeometry=true' +
                  '&outSR=4326&f=json&resultOffset=' + offset + '&resultRecordCount=' + PAGE;
        var r = await getText(url);
        var feats = [];
        try { feats = (JSON.parse(r.body).features) || []; } catch (e) {}
        if (!feats.length) break;
        for (var i = 0; i < feats.length; i++) {
            var g = feats[i].geometry;
            if (!g || typeof g.x !== 'number' || typeof g.y !== 'number') continue;
            out.push([Math.round(g.y * 1e5) / 1e5, Math.round(g.x * 1e5) / 1e5]);
        }
        offset += PAGE;
        await sleep(120);
    }
    if (process.stdout.isTTY) process.stdout.write('\r');
    var payload = { points: out, source: 'US nationwide electric substations (ArcGIS mirror)', lastEdit: meta.lastEdit };
    fs.writeFileSync(cached, JSON.stringify(payload));
    return payload;
}

// ---- Canada substations via Overpass, one bbox per region --------------------------------
async function canadaSubstations() {
    var cached = cacheFile('ca_substations.json');
    if (fs.existsSync(cached)) {
        try { return JSON.parse(fs.readFileSync(cached, 'utf8')); } catch (e) {}
    }
    var out = [], failed = [];
    for (var i = 0; i < CANADA_REGIONS.length; i++) {
        var r = CANADA_REGIONS[i];
        progress('Canada ' + r.code + ' (' + (i + 1) + '/' + CANADA_REGIONS.length + ')');
        // `out center` returns one point per element rather than full geometry, which keeps a
        // whole province's substations to a few hundred KB.
        var q = '[out:json][timeout:180];(node["power"="substation"](' + r.s + ',' + r.w + ',' + r.n + ',' + r.e + ');' +
                'way["power"="substation"](' + r.s + ',' + r.w + ',' + r.n + ',' + r.e + '););out center;';
        var got = false;
        for (var attempt = 1; attempt <= 3 && !got; attempt++) {
            var res = await getText('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q),
                                    { timeout: 200000 });
            if (res.status === 200) {
                try {
                    var els = (JSON.parse(res.body).elements) || [];
                    for (var k = 0; k < els.length; k++) {
                        var e = els[k];
                        var lat = e.lat !== undefined ? e.lat : (e.center ? e.center.lat : null);
                        var lon = e.lon !== undefined ? e.lon : (e.center ? e.center.lon : null);
                        if (lat === null || lon === null) continue;
                        out.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
                    }
                    got = true;
                } catch (e2) {}
            }
            // Overpass returns 429 and 504 under light load; back off rather than hammering it.
            if (!got) await sleep(5000 * attempt);
        }
        if (!got) failed.push(r.code);
        await sleep(2500);   // well inside the fair-use guideline
    }
    if (process.stdout.isTTY) process.stdout.write('\r');
    var payload = { points: out, source: 'OpenStreetMap power=substation via Overpass', failed: failed };
    fs.writeFileSync(cached, JSON.stringify(payload));
    return payload;
}

// ---- Spatial index -----------------------------------------------------------------------
// 27,798 prospects against ~50,000 substations is 1.4 billion pair comparisons done naively.
// Bucketing by whole degree and searching only the neighbouring cells turns it into a few
// hundred comparisons each.
function buildIndex(points) {
    var cells = {};
    for (var i = 0; i < points.length; i++) {
        var k = Math.floor(points[i][0]) + ':' + Math.floor(points[i][1]);
        (cells[k] || (cells[k] = [])).push(points[i]);
    }
    return cells;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Expands the search ring until something is found or the radius exceeds what we would report.
// Beyond MAX_RING degrees the honest answer is "further than we searched", not a number.
var MAX_RING = 3;
function nearestKm(cells, lat, lon) {
    var bl = Math.floor(lat), bo = Math.floor(lon), best = null;
    for (var ring = 0; ring <= MAX_RING; ring++) {
        for (var dy = -ring; dy <= ring; dy++) {
            for (var dx = -ring; dx <= ring; dx++) {
                // Only the newly added shell each iteration.
                if (ring > 0 && Math.abs(dy) !== ring && Math.abs(dx) !== ring) continue;
                var bucket = cells[(bl + dy) + ':' + (bo + dx)];
                if (!bucket) continue;
                for (var i = 0; i < bucket.length; i++) {
                    var d = haversineKm(lat, lon, bucket[i][0], bucket[i][1]);
                    if (best === null || d < best) best = d;
                }
            }
        }
        // A hit inside ring N is guaranteed nearest only once ring N+1 has also been searched,
        // because a diagonal neighbour can be closer than a far corner of the current cell.
        if (best !== null && ring >= 1) break;
    }
    return best;
}

function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
        var out = {};
        Object.keys(v).sort().forEach(function (k) { out[k] = sortKeys(v[k]); });
        return out;
    }
    return v;
}

(async function main() {
    log('site quality — distance to grid infrastructure');
    log('  out  ' + path.relative(ROOT, OUT));
    log('');

    log('[1/4] US substations');
    var us = await usSubstations();
    log('  ' + us.points.length.toLocaleString() + ' points' + (us.lastEdit ? '  (data last edited ' + us.lastEdit + ')' : ''));

    var ca = { points: [], failed: [], source: 'skipped' };
    if (!flag('skip-canada')) {
        log('[2/4] Canada substations (OpenStreetMap, one query per province)');
        ca = await canadaSubstations();
        log('  ' + ca.points.length.toLocaleString() + ' points' +
            (ca.failed.length ? '  (' + ca.failed.length + ' regions failed: ' + ca.failed.join(', ') + ')' : ''));
    } else {
        log('[2/4] Canada skipped');
    }

    log('[3/4] reading prospects');
    var prospects = [];
    function ingest(file, key, idOf, latOf, lonOf, isoOf) {
        var p = path.join(ROOT, 'data', file);
        if (!fs.existsSync(p)) { log('  ' + file + ' absent — skipped'); return; }
        var d = JSON.parse(fs.readFileSync(p, 'utf8'));
        var rows = d[key] || [];
        for (var i = 0; i < rows.length; i++) {
            var lat = latOf(rows[i]), lon = lonOf(rows[i]);
            if (lat === null || lon === null || !isFinite(lat) || !isFinite(lon)) continue;
            prospects.push({ id: idOf(rows[i]), lat: lat, lon: lon, iso: isoOf(rows[i]) });
        }
        log('  ' + file + ': ' + rows.length.toLocaleString());
    }
    ingest('flare-catalog.json', 'sites',
        function (r) { return 'vnf_' + r[0].toFixed(4) + '_' + r[1].toFixed(4); },
        function (r) { return r[0]; }, function (r) { return r[1]; }, function (r) { return r[2]; });
    ingest('facilities.json', 'facilities',
        function (r) { return r.id; }, function (r) { return r.lat; }, function (r) { return r.lon; },
        function () { return 'USA'; });
    ingest('landfills.json', 'projects',
        function (r) { return r.id; }, function (r) { return r.lat; }, function (r) { return r.lon; },
        function () { return 'USA'; });

    log('[4/4] computing nearest substation');
    var usIdx = buildIndex(us.points);
    var caIdx = buildIndex(ca.points);
    var out = {}, hit = 0, miss = 0, outside = 0;
    for (var i = 0; i < prospects.length; i++) {
        if (i % 2000 === 0) progress(i + '/' + prospects.length);
        var p = prospects[i];
        var idx = p.iso === 'CAN' ? caIdx : (p.iso === 'USA' ? usIdx : null);
        if (!idx) { outside++; continue; }          // no coverage for this country: stays unknown
        var d = nearestKm(idx, p.lat, p.lon);
        if (d === null) { miss++; continue; }        // nothing within the searched radius
        out[p.id] = Math.round(d * 100) / 100;
        hit++;
    }
    if (process.stdout.isTTY) process.stdout.write('\r');

    var vals = Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return a - b; });
    var payload = sortKeys({
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        gridSources: {
            usa: { source: us.source, points: us.points.length, dataLastEdit: us.lastEdit || null },
            can: { source: ca.source, points: ca.points.length, failedRegions: ca.failed }
        },
        method: 'Straight-line distance to the nearest electrical SUBSTATION, which is where an ' +
                'interconnection is actually made — a transmission line passing overhead is not a ' +
                'connection point. Searched to a ' + MAX_RING + ' degree radius; beyond that the ' +
                'honest answer is "further than we looked", so no value is recorded.',
        coverageNote: 'Covers the US and Canada only. Prospects elsewhere carry no grid distance ' +
                      'and site quality stays unmeasured for them rather than being guessed.',
        staleness: us.lastEdit
            ? 'The US substation layer was last edited ' + us.lastEdit + '. HIFLD Open, which was ' +
              'the standard source, was shut down by DHS and its substations dataset is absent ' +
              'from the Data Rescue Project archive entirely. Substations are long-lived, but ' +
              'this is not a current feed.'
            : null,
        counts: {
            prospects: prospects.length,
            withGridDistance: hit,
            noneWithinSearchRadius: miss,
            outsideCoverage: outside,
            medianKm: vals.length ? vals[Math.floor(vals.length / 2)] : null,
            p90Km: vals.length ? vals[Math.floor(vals.length * 0.9)] : null
        },
        gridDistanceKm: out
    });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;

    log('');
    log('  prospects              ' + prospects.length.toLocaleString());
    log('  with a grid distance   ' + hit.toLocaleString());
    log('  none within ' + MAX_RING + ' degrees  ' + miss.toLocaleString());
    log('  outside coverage       ' + outside.toLocaleString());
    if (vals.length) log('  median ' + vals[Math.floor(vals.length / 2)] + ' km, p90 ' + vals[Math.floor(vals.length * 0.9)] + ' km');
    log('  size                   ' + Math.round(raw / 1024) + ' KB  (' + Math.round(gz / 1024) + ' KB gzipped)');
    log('');
    log('wrote ' + path.relative(ROOT, OUT));
})().catch(function (e) {
    console.error('\nFAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
