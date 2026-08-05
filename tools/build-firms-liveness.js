// ===== FIRMS liveness — is each catalogued flare still burning? =====
//
//   node tools/build-firms-liveness.js [--days 90] [--min-nights 3] [--eps 1000]
//
// The flare catalog ends at 2022, because that is where the open EOG survey ends. NASA FIRMS
// publishes VIIRS thermal detections globally within ~3 hours, free. It cannot measure volume —
// it will never update a site's size — but it can answer the one thing the catalog cannot:
// is this flare still burning?
//
// WILDFIRES ARE THE WHOLE PROBLEM
// FIRMS reports every thermal anomaly on earth and the overwhelming majority are vegetation
// fires. The obvious filter is the VIIRS `type` field (2 = other static land source = flare),
// but that field is NOT PRESENT in the near-real-time product — NASA states the download tool
// "does not attribute the static sources/inferred hotspot type". It exists only in standard
// processing, which lags months and so cannot answer a recency question.
//
// Two properties are used instead, and both are required:
//
//   1. RECURRENCE AT A FIXED POINT. A flare is a static source that reappears at the same pixel
//      night after night. A wildfire moves across the landscape and does not re-light the same
//      375 m pixel repeatedly. Detections are grouped to ~500 m and a location must appear on
//      >= MIN_NIGHTS distinct nights to count as static.
//   2. A KNOWN FLARE IS ALREADY THERE. These coordinates are not being discovered. EOG already
//      classified them as persistent gas flares across 2017-2022, so confirmation is only ever
//      tested against that existing set.
//
// Either alone is weak — a single hot night beside a known flare could be a grass fire, and
// recurrence somewhere with no flare history is irrelevant. Together they are a strong signal.
// The night count is kept per site so the UI can show how firm each confirmation actually is.
//
// The key is read from FIRMS_MAP_KEY or tools/.firms-key and NEVER written into the output.

var fs = require('fs');
var path = require('path');
var https = require('https');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache', 'firms');
var CATALOG = path.join(ROOT, 'data', 'flare-catalog.json');
var OUT = path.join(ROOT, 'data', 'liveness.json');

// FIRMS caps a single request at 5 days.
var WINDOW_DAYS = 5;
// Detections this close together are treated as the same physical source. VIIRS pixels are
// ~375 m, so 500 m groups repeat looks at one flare without merging neighbouring pads.
var GROUP_DEG = 0.005;
// A confirmed detection must be within this of the catalogued flare. Tighter than the 2 km
// operator join: both points come from the same sensor, so a loose radius would let one flare
// vouch for its neighbour.
var DEFAULT_EPS_M = 1000;
var DEFAULT_DAYS = 90;
var DEFAULT_MIN_NIGHTS = 3;

// NRT only. The _SP variants carry `type` but lag months behind, which defeats the purpose.
// NOAA21 is included because it reaches back furthest by a wide margin (years, where SNPP holds
// roughly 3 months and NOAA20 about 2) — more nights of evidence for the same request budget.
var SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
var BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/';
var AVAIL = 'https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/';

function log(m) { process.stdout.write(m + '\n'); }
function progress(m) {
    if (process.stdout.isTTY) process.stdout.write('\r  ' + m + '                    ');
    else process.stdout.write('  ' + m + '\n');
}

// ---- key ------------------------------------------------------------------------------
function readKey() {
    if (process.env.FIRMS_MAP_KEY) return process.env.FIRMS_MAP_KEY.trim();
    var f = path.join(__dirname, '.firms-key');
    if (fs.existsSync(f)) {
        var k = fs.readFileSync(f, 'utf8').trim();
        if (k) return k;
    }
    return null;
}

// ---- geo ------------------------------------------------------------------------------
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Query boxes are derived from where the catalog actually has sites, rather than sweeping the
// globe. Sites cluster hard into basins, so a handful of cells covers everything and keeps the
// payload from including every wildfire on earth.
function deriveBoxes(sites, cellDeg) {
    cellDeg = cellDeg || 2;
    var cells = {};
    for (var i = 0; i < sites.length; i++) {
        var gx = Math.floor(sites[i].lon / cellDeg);
        var gy = Math.floor(sites[i].lat / cellDeg);
        cells[gx + ',' + gy] = true;
    }
    // Merge horizontally adjacent cells into runs — fewer, wider requests for the same coverage.
    var byRow = {};
    Object.keys(cells).forEach(function(k) {
        var p = k.split(',');
        var gx = parseInt(p[0], 10), gy = parseInt(p[1], 10);
        (byRow[gy] || (byRow[gy] = [])).push(gx);
    });
    var boxes = [];
    Object.keys(byRow).forEach(function(gy) {
        var xs = byRow[gy].sort(function(a, b) { return a - b; });
        var start = xs[0], prev = xs[0];
        for (var i = 1; i <= xs.length; i++) {
            if (i < xs.length && xs[i] === prev + 1) { prev = xs[i]; continue; }
            boxes.push({
                west: start * cellDeg,
                south: parseInt(gy, 10) * cellDeg,
                east: (prev + 1) * cellDeg,
                north: (parseInt(gy, 10) + 1) * cellDeg
            });
            if (i < xs.length) { start = xs[i]; prev = xs[i]; }
        }
    });
    return boxes;
}

// ---- csv ------------------------------------------------------------------------------
// Header-driven so a column order change upstream cannot silently shift every field.
function parseCsv(text) {
    if (!text) return { rows: [], hasType: false };
    var lines = text.split('\n');
    var header = null, rows = [], hasType = false;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        var f = line.split(',');
        if (!header) {
            header = f.map(function(h) { return h.trim().toLowerCase(); });
            hasType = header.indexOf('type') >= 0;
            continue;
        }
        if (f.length < header.length) continue;
        var o = {};
        for (var c = 0; c < header.length; c++) o[header[c]] = f[c];
        var lat = parseFloat(o.latitude), lon = parseFloat(o.longitude);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        rows.push({
            lat: lat, lon: lon,
            date: (o.acq_date || '').trim(),
            confidence: (o.confidence || '').trim(),
            frp: parseFloat(o.frp),
            type: hasType ? parseInt(o.type, 10) : null
        });
    }
    return { rows: rows, hasType: hasType };
}

// Collapse raw detections into candidate static sources.
// A location qualifies only if it recurs on enough separate nights — the property that
// distinguishes a fixed flare stack from a fire front moving through.
function groupDetections(rows, minNights) {
    var byCell = {};
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        // A typed row is authoritative when present (archive data); otherwise recurrence decides.
        if (r.type !== null && r.type !== undefined && r.type !== 2) continue;
        var key = Math.round(r.lat / GROUP_DEG) + ',' + Math.round(r.lon / GROUP_DEG);
        var g = byCell[key] || (byCell[key] = { lat: 0, lon: 0, n: 0, nights: {}, lastDate: '', typed: false });
        g.lat += r.lat; g.lon += r.lon; g.n++;
        if (r.date) {
            g.nights[r.date] = true;
            if (r.date > g.lastDate) g.lastDate = r.date;
        }
        if (r.type === 2) g.typed = true;
    }
    var out = [];
    Object.keys(byCell).forEach(function(k) {
        var g = byCell[k];
        var nights = Object.keys(g.nights).length;
        // A row explicitly typed as a static land source needs no recurrence proof.
        if (!g.typed && nights < minNights) return;
        out.push({
            lat: g.lat / g.n, lon: g.lon / g.n,
            nights: nights, detections: g.n, lastDate: g.lastDate, typed: g.typed
        });
    });
    return out;
}

// Attach confirmations to catalogued flares. Anything unmatched is discarded: this build
// confirms known sites, it does not discover new ones.
function matchToSites(sites, sources, epsM) {
    var CELL = Math.max(epsM / 111320, 0.002);
    var grid = {};
    for (var i = 0; i < sites.length; i++) {
        var k = Math.floor(sites[i].lat / CELL) + ',' + Math.floor(sites[i].lon / CELL);
        (grid[k] || (grid[k] = [])).push(i);
    }
    var out = {};
    for (var s = 0; s < sources.length; s++) {
        var src = sources[s];
        var gi = Math.floor(src.lat / CELL), gj = Math.floor(src.lon / CELL);
        var best = null, bestD = Infinity;
        for (var di = -1; di <= 1; di++) {
            for (var dj = -1; dj <= 1; dj++) {
                var bucket = grid[(gi + di) + ',' + (gj + dj)];
                if (!bucket) continue;
                for (var b = 0; b < bucket.length; b++) {
                    var site = sites[bucket[b]];
                    var d = haversine(src.lat, src.lon, site.lat, site.lon);
                    if (d <= epsM && d < bestD) { bestD = d; best = site; }
                }
            }
        }
        if (!best) continue;
        var prev = out[best.id];
        if (!prev || src.lastDate > prev.lastSeen) {
            out[best.id] = {
                lastSeen: src.lastDate,
                nights: Math.max(src.nights, prev ? prev.nights : 0),
                detections: (prev ? prev.detections : 0) + src.detections,
                distance_m: Math.round(bestD),
                typed: src.typed || (prev ? prev.typed : false)
            };
        } else {
            prev.nights = Math.max(prev.nights, src.nights);
            prev.detections += src.detections;
        }
    }
    return out;
}

// Byte-stable serialisation for the committed artifact.
function sortKeys(obj) {
    var out = {};
    Object.keys(obj).sort().forEach(function(k) { out[k] = obj[k]; });
    return out;
}

// ---- http -----------------------------------------------------------------------------
function fetchText(url) {
    return new Promise(function(resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'ion-mining-group/firms-liveness' } }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                var body = Buffer.concat(chunks).toString('utf8');
                // The limit message comes back as a 400 with a plain-text body, not a 429, so it
                // has to be detected by content or it looks like a permanent failure.
                if (/exceed\w*\s+allowed\s+transaction/i.test(body)) {
                    var e = new Error('rate limited');
                    e.rateLimited = true;
                    return reject(e);
                }
                if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 120)));
                if (/invalid map_?key/i.test(body)) return reject(new Error('FIRMS rejected the MAP_KEY'));
                resolve(body);
            });
        }).on('error', reject);
    });
}

var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

// FIRMS bills per DAY requested, not per request: a 5-day query costs about five transactions
// against the 5,000-per-10-minute allowance. An unpaced run of ~2,400 five-day queries is
// roughly 12,000 transactions and gets refused within the first minute — which is exactly what
// happened on the first attempt, losing 71% of requests.
//
// A rolling-window budget keeps the run inside the allowance, and anything refused anyway is
// retried with backoff rather than silently dropped.
// FIRMS publishes the live transaction count for a key, so the budget does not have to be
// guessed. Estimating it locally went wrong in both directions on the first run — the client
// thought it was at the ceiling while the server reported 560/5000 — so the server's own number
// is the one used.
var STATUS = 'https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=';
var RESERVE = 400;                    // stop this far short of the ceiling
var _remaining = null;                // last known headroom, decremented optimistically

async function refreshBudget(key) {
    try {
        var body = await fetchText(STATUS + key);
        var j = JSON.parse(body);
        var limit = j.transaction_limit || 5000;
        var used = j.current_transactions || 0;
        _remaining = limit - used;
        return _remaining;
    } catch (e) {
        _remaining = null;            // unknown: fall back to pacing conservatively
        return null;
    }
}

async function spendBudget(key, cost) {
    for (var guard = 0; guard < 60; guard++) {
        if (_remaining === null || _remaining - cost < RESERVE) {
            var left = await refreshBudget(key);
            if (left === null) { await sleep(2000); return; }        // status unavailable; proceed slowly
            if (left - cost < RESERVE) {
                progress('budget low (' + left + ' left) — waiting 60s for the window to roll');
                await sleep(60000);
                continue;
            }
        }
        _remaining -= cost;
        return;
    }
}

async function fetchWithRetry(key, url, cost, tries) {
    tries = tries || 5;
    for (var attempt = 1; attempt <= tries; attempt++) {
        await spendBudget(key, cost);
        try {
            return await fetchText(url);
        } catch (e) {
            // "Invalid MAP_KEY" comes back spuriously under load — the same key answers 200 a
            // moment later. Treating it as fatal killed a 40-minute run at 43% complete, so it
            // is retried like any other transient failure once the key has proven itself.
            var transient = e.rateLimited || /invalid map_?key/i.test(e.message) || /HTTP 5\d\d/.test(e.message);
            if (!transient || attempt === tries) throw e;
            var backoff = Math.min(120000, 8000 * Math.pow(2, attempt - 1));
            progress('transient failure (' + e.message.slice(0, 40) + ') — retry ' + attempt + '/' + tries +
                     ' in ' + Math.round(backoff / 1000) + 's');
            await sleep(backoff);
            _remaining = null;        // force a fresh reading of the real budget
        }
    }
}

function iso(d) { return d.toISOString().slice(0, 10); }

// Each NRT feed holds a different rolling window and NASA moves them. Asking a source for dates
// it does not have wastes requests against the rate limit and returns nothing useful, so the
// real window is read at runtime and each source is clamped to it.
async function fetchAvailability(key) {
    var out = {};
    try {
        var text = await fetchText(AVAIL + key + '/ALL');
        var lines = text.split('\n');
        for (var i = 1; i < lines.length; i++) {
            var f = lines[i].trim().split(',');
            if (f.length < 3) continue;
            out[f[0].trim()] = { min: f[1].trim(), max: f[2].trim() };
        }
    } catch (e) { /* fall back to querying everything */ }
    return out;
}

// ---- main -----------------------------------------------------------------------------
async function main() {
    var argv = process.argv.slice(2);
    function arg(name, dflt) {
        var i = argv.indexOf('--' + name);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
    }
    var DAYS = parseInt(arg('days', DEFAULT_DAYS), 10);
    var MIN_NIGHTS = parseInt(arg('min-nights', DEFAULT_MIN_NIGHTS), 10);
    var EPS_M = parseFloat(arg('eps', DEFAULT_EPS_M));
    var CELL_DEG = parseFloat(arg('cell', 10));

    var key = readKey();
    if (!key) {
        log('No FIRMS MAP_KEY found.');
        log('');
        log('  Get one free (instant, by email) at:');
        log('    https://firms.modaps.eosdis.nasa.gov/api/map_key/');
        log('');
        log('  Then either:');
        log('    set FIRMS_MAP_KEY=<key>              (environment)');
        log('    echo <key> > tools/.firms-key        (gitignored file)');
        log('');
        log('The app works without this — every site simply reads "not confirmed".');
        process.exit(2);
    }

    if (!fs.existsSync(CATALOG)) throw new Error('run tools/build-flare-catalog.js first');
    var cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    // Scoping to the jurisdictions actually in play cuts this from 2,376 requests to 378 — one
    // budget window instead of an hour of rate-limited stalling — while still covering every
    // site that has a named operator. Liveness for a flare in a jurisdiction that will never be
    // pursued is dead weight.
    //
    // The scope is recorded in the output so the UI can distinguish "checked and not seen" from
    // "never checked". Those must not look the same.
    var isoArg = arg('iso', 'CAN,USA');
    var isoFilter = isoArg === 'ALL' ? null
        : isoArg.toUpperCase().split(',').map(function(x) { return x.trim(); }).filter(Boolean);

    var sites = cat.sites
        .filter(function(s) { return !isoFilter || isoFilter.indexOf(s[2]) >= 0; })
        .map(function(s) {
            return { id: 'vnf_' + s[0].toFixed(4) + '_' + s[1].toFixed(4), lat: s[0], lon: s[1] };
        });
    if (!sites.length) throw new Error('no sites matched --iso ' + isoArg);

    var boxes = deriveBoxes(sites, CELL_DEG);
    var windows = Math.ceil(DAYS / WINDOW_DAYS);
    log('FIRMS liveness build');
    log('  scope        ' + (isoFilter ? isoFilter.join(', ') : 'global'));
    log('  catalog      ' + sites.length.toLocaleString() + ' sites in scope of ' +
        cat.sites.length.toLocaleString() + ' total');
    log('  window       last ' + DAYS + ' days  (' + windows + ' x ' + WINDOW_DAYS + '-day requests)');
    log('  boxes        ' + boxes.length + '  derived from where sites actually are');
    log('  sources      ' + SOURCES.join(', '));
    log('  min nights   ' + MIN_NIGHTS + '   (recurrence test — NRT has no `type` field)');
    log('  match radius ' + EPS_M + ' m');
    log('  requests     ~' + (boxes.length * windows * SOURCES.length).toLocaleString());

    var availability = await fetchAvailability(key);
    if (Object.keys(availability).length) {
        SOURCES.forEach(function(sr) {
            var a = availability[sr];
            log('  ' + sr.padEnd(18) + (a ? a.min + ' .. ' + a.max : 'availability unknown'));
        });
    }

    fs.mkdirSync(CACHE, { recursive: true });
    var sawType = false, failures = 0, done = 0, skipped = 0, rawSeen = 0;
    var matched = {};
    var total = boxes.length * windows * SOURCES.length;

    for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        var area = [box.west, box.south, box.east, box.north].join(',');
        // Rows are collected, grouped and matched PER BOX, then dropped. A degree-scale box in
        // fire season can return tens of thousands of rows, and holding every one globally
        // before processing would run into hundreds of megabytes for no benefit.
        var boxRows = [];
        var boxSites = sites.filter(function(s) {
            return s.lat >= box.south && s.lat < box.north && s.lon >= box.west && s.lon < box.east;
        });
        for (var w = 0; w < windows; w++) {
            var end = new Date(Date.now() - w * WINDOW_DAYS * 86400000);
            var dateStr = iso(end);
            for (var s = 0; s < SOURCES.length; s++) {
                var src = SOURCES[s];
                // Skip windows this feed simply does not hold.
                var av = availability[src];
                if (av && (dateStr > av.max || dateStr < av.min)) { skipped++; done++; continue; }
                var cacheFile = path.join(CACHE, [src, area.replace(/[,.]/g, '_'), dateStr].join('__') + '.csv');
                var text = null;
                if (fs.existsSync(cacheFile)) {
                    text = fs.readFileSync(cacheFile, 'utf8');
                } else {
                    var url = BASE + key + '/' + src + '/' + area + '/' + WINDOW_DAYS + '/' + dateStr;
                    try {
                        // Billed per day requested, so that is the cost passed to the budget.
                        text = await fetchWithRetry(key, url, WINDOW_DAYS);
                        fs.writeFileSync(cacheFile, text);
                    } catch (e) {
                        failures++;
                        if (/MAP_KEY/i.test(e.message)) {
                            log('\n' + e.message + ' — check the key and re-run.');
                            process.exit(3);
                        }
                        text = '';
                    }
                }
                var parsed = parseCsv(text);
                if (parsed.hasType) sawType = true;
                boxRows = boxRows.concat(parsed.rows);
                rawSeen += parsed.rows.length;
                done++;
                progress(done + '/' + total + ' requests · box ' + (b + 1) + '/' + boxes.length +
                         ' · ' + rawSeen.toLocaleString() + ' detections · ' +
                         Object.keys(matched).length + ' confirmed');
            }
        }

        // Reduce this box now and release its rows.
        if (boxRows.length && boxSites.length) {
            var boxStatics = groupDetections(boxRows, MIN_NIGHTS);
            var boxMatched = matchToSites(boxSites, boxStatics, EPS_M);
            for (var id in boxMatched) {
                var prev = matched[id];
                if (!prev || boxMatched[id].lastSeen > prev.lastSeen) matched[id] = boxMatched[id];
                else {
                    prev.nights = Math.max(prev.nights, boxMatched[id].nights);
                    prev.detections += boxMatched[id].detections;
                }
            }
        }
        boxRows = null;
    }
    if (process.stdout.isTTY) process.stdout.write('\n');

    log('\n  ' + rawSeen.toLocaleString() + ' raw detections' +
        (sawType ? '  (type field present — used directly)' : '  (no type field — recurrence test applied)'));

    var ids = Object.keys(matched);
    log('  ' + ids.length.toLocaleString() + ' catalogued flares confirmed still burning');

    var nightsHist = {};
    ids.forEach(function(id) {
        var n = Math.min(matched[id].nights, 10);
        nightsHist[n] = (nightsHist[n] || 0) + 1;
    });

    var payload = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        windowDays: DAYS,
        minNights: MIN_NIGHTS,
        matchRadiusM: EPS_M,
        sources: SOURCES,
        typeFieldAvailable: sawType,
        // Which jurisdictions were actually queried. A site outside this list was NEVER LOOKED
        // AT, which is a different statement from "looked for and not found" — the UI keys off
        // this so it never implies a flare went dark when nobody checked.
        scopeIso: isoFilter,
        scopedSites: sites.length,
        method: sawType
            ? 'VIIRS type field (2 = static land source)'
            : 'recurrence: >= ' + MIN_NIGHTS + ' distinct nights at one location, matched to a known flare',
        note: 'Confirms PRESENCE only. FIRMS cannot measure gas volume, so site sizes remain ' +
              'dated to their EOG survey year. Absence means the satellite did not see it — ' +
              'cloud, a flare below the detection floor, or genuinely dark — not proof it stopped.',
        counts: { confirmed: ids.length, catalog: sites.length, rawDetections: rawSeen, requestFailures: failures },
        // Key order follows whatever order detections happened to arrive in, which would make
        // every re-run produce a spurious git diff on a committed artifact. Sorting makes the
        // file byte-stable: it changes only when the DATA changes.
        sites: sortKeys(matched)
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    log('  size         ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
    if (failures) log('  !! ' + failures + ' requests failed — re-run to fill the gaps (responses are cached)');
    log('\nwrote ' + path.relative(ROOT, OUT));
}

// Only run when invoked as a script. Without this guard, requiring the module for tests would
// execute the whole build — and exit on a missing key before a single assertion ran.
if (require.main === module) {
    main().catch(function(e) {
        console.error('\nBUILD FAILED: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });
}

// Exported for tests — these are the parts that can be wrong without anyone noticing.
module.exports = { deriveBoxes: deriveBoxes, parseCsv: parseCsv, groupDetections: groupDetections,
                   matchToSites: matchToSites, haversine: haversine, sortKeys: sortKeys };
