// ===== Global flare catalog build pipeline =====
//
//   node tools/build-flare-catalog.js [--out data/flare-catalog.json] [--floor 30] [--eps 500]
//
// Runs OFFLINE, not in the browser, because none of these hosts send an
// Access-Control-Allow-Origin header — a page on rbagatoli.github.io cannot fetch any of them.
// The output is a small committed artifact the static site loads.
//
// Source: Earth Observation Group (Colorado School of Mines), "Global Gas Flaring Observed from
// Space". https://eogdata.mines.edu/download_global_flare.html — open, no login. This is a
// DIFFERENT path from the nightly VNF product, which is OAuth-gated and, as of 1 June 2026,
// paid for programmatic access. Nothing here depends on that.
//
// Resumable: downloads are cached under tools/.cache and skipped if already present, so an
// interrupted run picks up where it left off.

var fs = require('fs');
var path = require('path');
var https = require('https');
var zlib = require('zlib');
var XLSX = require('./xlsx-lite.js');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache');

// ---- Conversion constants, with the reasoning ---------------------------------------
// 1 BCM/yr of gas spread over a year, expressed as Mcf/day:
//   1 BCM = 35.3147e9 cubic feet;  / 365 days;  / 1000 cf per Mcf
var MCFD_PER_BCM = 35.3147e9 / 365 / 1000;          // = 96,753 Mcf/day

// Gas -> electrical power. ~1,000 BTU per cubic foot of pipeline gas, and a reciprocating
// genset burns ~10,000 BTU/kWh. That is 10 cf/kWh, i.e. 1 Mcf ~ 100 kWh — the same figures
// site-engine.js uses, and the spec's "1 MMcf/day ~ 4 MW".
var GAS_BTU_PER_CF = 1000;
var HEAT_RATE_BTU_PER_KWH = 10000;

// Spatial merge tolerance. The EOG workbooks carry a per-year row id that is NOT stable across
// years, and the `Catalog ID` column exists only in some years — so sites must be matched
// spatially instead.
//
// 500 m chosen from the measured data, not from theory: nearest-neighbour distances between the
// 2017 and 2022 flare sets cluster tightly below ~500 m (p10 = 32 m, p25 = 73 m, p50 = 385 m)
// and then jump to a long tail (p75 = 2.3 km, p90 = 4.3 km) which is the distance to a
// DIFFERENT flare rather than the same one. 500 m also sits just above the 375 m VIIRS pixel,
// so it absorbs geolocation jitter without merging neighbouring wellpads.
var DEFAULT_EPSILON_M = 500;

// Volume FLOOR, not a threshold. Sangudo is 160 kW ~ 38 Mcf/day, so the target is deliberately
// the small persistent flares that MW-scale operators ignore. 30 Mcf/day ~ 125 kW ~ 35 miners.
var DEFAULT_FLOOR_MCFD = 30;

var YEARS = [
    { year: 2017, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2017_web_v1.xlsx' },
    { year: 2018, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2018_web.xlsx' },
    { year: 2019, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2019_web_v20201114.xlsx' },
    { year: 2020, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2020_web_v1.xlsx' },
    { year: 2021, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2021_web.xlsx' },
    { year: 2022, file: 'VIIRS_Global_flaring_d.7_slope_0.029353_2022_web.xlsx' }
];
var EOG_BASE = 'https://eogdata.mines.edu/global_flare_data/';
var LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

// ---- args ---------------------------------------------------------------------------
var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
var OUT = path.resolve(ROOT, arg('out', 'data/flare-catalog.json'));
var FLOOR_MCFD = parseFloat(arg('floor', DEFAULT_FLOOR_MCFD));
var EPSILON_M = parseFloat(arg('eps', DEFAULT_EPSILON_M));

function log(msg) { process.stdout.write(msg + '\n'); }
function progress(msg) {
    if (process.stdout.isTTY) process.stdout.write('\r  ' + msg + '          ');
    else process.stdout.write('  ' + msg + '\n');
}

// ---- download with cache -------------------------------------------------------------
function download(url, dest, redirects) {
    return new Promise(function(resolve, reject) {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return resolve(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        var tmp = dest + '.part';
        var file = fs.createWriteStream(tmp);
        https.get(url, { headers: { 'User-Agent': 'ion-mining-group/flare-catalog' } }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                try { fs.unlinkSync(tmp); } catch (e) {}
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(download(res.headers.location, dest, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) {
                file.close();
                try { fs.unlinkSync(tmp); } catch (e) {}
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            }
            var total = parseInt(res.headers['content-length'] || '0', 10), got = 0;
            res.on('data', function(c) {
                got += c.length;
                if (total) progress(path.basename(dest) + '  ' + Math.round(100 * got / total) + '%');
            });
            res.pipe(file);
            file.on('finish', function() {
                file.close(function() {
                    fs.renameSync(tmp, dest);
                    if (process.stdout.isTTY) process.stdout.write('\r');
                    resolve(dest);
                });
            });
        }).on('error', function(e) {
            try { fs.unlinkSync(tmp); } catch (e2) {}
            reject(e);
        });
    });
}

// ---- sheet + column resolution -------------------------------------------------------
// The schema is NOT stable across years. Observed:
//   2017  flares_upstream        id_key_2017 | Latitude | Longitude | Detection_frequency_2017 | BCM_2017
//   2022  flare upstream         Country | ISO Code | ID 2022 | Latitude | Longitude | BCM 2022 | ...
//   2018  has BOTH "countries upstream" (totals, no coords) and "flares upstream" (per-flare)
//   2019  ships an "all flares" sheet plus per-stream sheets
// so neither sheet index nor a name substring is reliable. Selecting the sheet by whether it
// actually HAS coordinate columns is — a country-totals sheet never does.
function findCol(header) {
    var terms = [].slice.call(arguments, 1);
    for (var i = 0; i < header.length; i++) {
        var h = String(header[i]).toLowerCase().replace(/[_.,]/g, ' ');
        var all = true;
        for (var t = 0; t < terms.length; t++) if (h.indexOf(terms[t]) < 0) { all = false; break; }
        if (all) return i;
    }
    return -1;
}

function pickFlareSheet(wb) {
    var candidates = [];
    for (var i = 0; i < wb.sheetNames.length; i++) {
        var name = wb.sheetNames[i];
        var rows = wb.sheet(i);
        if (!rows || rows.length < 2) continue;
        var hdr = rows[0];
        var lat = findCol(hdr, 'latitude'), lon = findCol(hdr, 'longitude');
        if (lat < 0 || lon < 0) continue;                    // country summaries have no coords
        candidates.push({ name: name, rows: rows, lat: lat, lon: lon });
    }
    if (!candidates.length) return null;
    // Prefer upstream (wellsite flaring) over downstream (refineries/LNG) — upstream is what a
    // behind-the-meter generator can actually tap.
    for (var c = 0; c < candidates.length; c++) {
        if (/upstream/i.test(candidates[c].name) && !/countr/i.test(candidates[c].name)) return candidates[c];
    }
    for (var d = 0; d < candidates.length; d++) if (/all flares/i.test(candidates[d].name)) return candidates[d];
    return candidates[0];
}

function parseYear(buf, year) {
    var wb = XLSX.read(buf);
    var picked = pickFlareSheet(wb);
    if (!picked) throw new Error(year + ': no sheet with coordinates');
    var rows = picked.rows, hdr = rows[0];

    var iLat = picked.lat, iLon = picked.lon;
    var iBcm  = findCol(hdr, 'bcm');
    var iFreq = findCol(hdr, 'detection', 'frequency');
    var iIso  = findCol(hdr, 'iso');
    var iCty  = findCol(hdr, 'country');
    var iTemp = findCol(hdr, 'temp');
    if (iBcm < 0) throw new Error(year + ': no BCM column in "' + picked.name + '"');

    var out = [];
    for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        var lat = parseFloat(row[iLat]), lon = parseFloat(row[iLon]), bcm = parseFloat(row[iBcm]);
        if (!isFinite(lat) || !isFinite(lon) || !isFinite(bcm)) continue;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
        var freq = iFreq >= 0 ? parseFloat(row[iFreq]) : NaN;
        out.push({
            lat: lat, lon: lon, bcm: bcm,
            freq: isFinite(freq) ? freq : null,
            iso: iIso >= 0 ? String(row[iIso] || '').trim() : '',
            country: iCty >= 0 ? String(row[iCty] || '').trim() : '',
            tempK: iTemp >= 0 && isFinite(parseFloat(row[iTemp])) ? parseFloat(row[iTemp]) : null
        });
    }

    // Detection frequency units are INCONSISTENT between editions: 2017 and 2022 publish a
    // 0-1 fraction, 2020 and 2021 publish 0-100. Left unnormalised, a 2021 site would score
    // 100 against a 2022 site's 0.95 on the same axis and the ranking would be meaningless.
    // Detect from the observed maximum rather than hardcoding a per-year rule.
    var maxFreq = 0;
    for (var i = 0; i < out.length; i++) if (out[i].freq !== null && out[i].freq > maxFreq) maxFreq = out[i].freq;
    var asPercent = maxFreq > 1.5;
    for (var j = 0; j < out.length; j++) {
        if (out[j].freq !== null) out[j].freqPct = asPercent ? out[j].freq : out[j].freq * 100;
        else out[j].freqPct = null;
    }
    return { rows: out, sheet: picked.name, freqUnits: asPercent ? 'percent' : 'fraction' };
}

// ---- land mask (onshore/offshore) ----------------------------------------------------
// Offshore flares are oil platforms — unusable, and they outrank everything on volume
// (Canada's two largest are on the Grand Banks). Classified by point-in-polygon against
// world-atlas countries-50m, the same dataset map.js already renders.
function buildLandMask(topo) {
    var tr = topo.transform, sx = tr.scale[0], sy = tr.scale[1], tx = tr.translate[0], ty = tr.translate[1];
    var arcs = topo.arcs.map(function(arc) {
        var x = 0, y = 0, pts = [];
        for (var i = 0; i < arc.length; i++) { x += arc[i][0]; y += arc[i][1]; pts.push([x * sx + tx, y * sy + ty]); }
        return pts;
    });
    function ring(idxs) {
        var out = [];
        for (var i = 0; i < idxs.length; i++) {
            var k = idxs[i];
            var a = k < 0 ? arcs[~k].slice().reverse() : arcs[k];
            if (!out.length) out = out.concat(a); else out = out.concat(a.slice(1));
        }
        return out;
    }
    var polys = [];
    var geoms = topo.objects.countries.geometries;
    for (var g = 0; g < geoms.length; g++) {
        var geo = geoms[g];
        if (!geo.arcs) continue;
        if (geo.type === 'Polygon') polys.push(geo.arcs.map(ring));
        else if (geo.type === 'MultiPolygon') for (var p = 0; p < geo.arcs.length; p++) polys.push(geo.arcs[p].map(ring));
    }
    var bb = polys.map(function(rings) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = 0; i < rings[0].length; i++) {
            var q = rings[0][i];
            if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
            if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
        }
        return [x0, y0, x1, y1];
    });
    var grid = {};
    for (var i2 = 0; i2 < bb.length; i2++) {
        for (var gx = Math.floor(bb[i2][0] / 10); gx <= Math.floor(bb[i2][2] / 10); gx++) {
            for (var gy = Math.floor(bb[i2][1] / 10); gy <= Math.floor(bb[i2][3] / 10); gy++) {
                var k = gx + ',' + gy;
                (grid[k] || (grid[k] = [])).push(i2);
            }
        }
    }
    function pip(x, y, r) {
        var inside = false, n = r.length, j = n - 1;
        for (var i = 0; i < n; i++) {
            var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-18) + xi) inside = !inside;
            j = i;
        }
        return inside;
    }
    return function onshore(lat, lon) {
        var cell = grid[Math.floor(lon / 10) + ',' + Math.floor(lat / 10)];
        if (!cell) return false;
        for (var i = 0; i < cell.length; i++) {
            var idx = cell[i], b = bb[idx];
            if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
            var rings = polys[idx];
            if (!pip(lon, lat, rings[0])) continue;
            var inHole = false;
            for (var h = 1; h < rings.length; h++) if (pip(lon, lat, rings[h])) { inHole = true; break; }
            if (!inHole) return true;
        }
        return false;
    };
}

// ---- spatial merge -------------------------------------------------------------------
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
}

function mergeYears(perYear, epsilonM) {
    // Grid cell sized to the tolerance so only the 3x3 neighbourhood needs checking.
    var CELL = Math.max(epsilonM / 111320, 0.002);
    var grid = {};
    var sites = [];

    function cellKey(lat, lon) { return Math.floor(lat / CELL) + ',' + Math.floor(lon / CELL); }

    // Newest year first: a site's canonical coordinates and country should come from the most
    // recent observation of it, not the oldest.
    var years = perYear.slice().sort(function(a, b) { return b.year - a.year; });

    for (var y = 0; y < years.length; y++) {
        var yr = years[y].year, rows = years[y].rows;
        for (var r = 0; r < rows.length; r++) {
            var f = rows[r];
            var gi = Math.floor(f.lat / CELL), gj = Math.floor(f.lon / CELL);
            var best = null, bestD = Infinity;
            for (var di = -1; di <= 1; di++) {
                for (var dj = -1; dj <= 1; dj++) {
                    var bucket = grid[(gi + di) + ',' + (gj + dj)];
                    if (!bucket) continue;
                    for (var b = 0; b < bucket.length; b++) {
                        var s = sites[bucket[b]];
                        if (s.obs[yr] !== undefined) continue;      // one observation per site per year
                        var d = haversine(f.lat, f.lon, s.lat, s.lon);
                        if (d <= epsilonM && d < bestD) { bestD = d; best = s; }
                    }
                }
            }
            if (best) {
                best.obs[yr] = { bcm: f.bcm, freqPct: f.freqPct, tempK: f.tempK };
                if (!best.iso && f.iso) best.iso = f.iso;
                if (!best.country && f.country) best.country = f.country;
            } else {
                var site = {
                    lat: f.lat, lon: f.lon, iso: f.iso, country: f.country,
                    obs: {}
                };
                site.obs[yr] = { bcm: f.bcm, freqPct: f.freqPct, tempK: f.tempK };
                sites.push(site);
                var key = cellKey(f.lat, f.lon);
                (grid[key] || (grid[key] = [])).push(sites.length - 1);
            }
        }
        progress('merged ' + yr + ' — ' + sites.length + ' distinct sites so far');
    }
    if (process.stdout.isTTY) process.stdout.write('\n');
    return sites;
}

// ---- trend ---------------------------------------------------------------------------
// Least-squares slope of volume against year, expressed as % change per year relative to the
// mean. A flare being eliminated is a shrinking opportunity even if large today; one growing
// is a producer with a worsening problem.
function trendOf(years, values) {
    var n = years.length;
    if (n < 3) return null;
    var mx = 0, my = 0;
    for (var i = 0; i < n; i++) { mx += years[i]; my += values[i]; }
    mx /= n; my /= n;
    if (my <= 0) return null;
    var num = 0, den = 0;
    for (var j = 0; j < n; j++) { num += (years[j] - mx) * (values[j] - my); den += (years[j] - mx) * (years[j] - mx); }
    if (den === 0) return null;
    return (num / den) / my * 100;
}
function trendLabel(pctPerYear) {
    if (pctPerYear === null) return null;
    if (pctPerYear > 10) return 'rising';
    if (pctPerYear < -10) return 'declining';
    return 'flat';
}

// ---- main ----------------------------------------------------------------------------
(async function main() {
    log('Global flare catalog build');
    log('  floor   ' + FLOOR_MCFD + ' Mcf/day   (~' + Math.round(FLOOR_MCFD * 1000 * GAS_BTU_PER_CF / HEAT_RATE_BTU_PER_KWH / 24) + ' kW)');
    log('  epsilon ' + EPSILON_M + ' m');
    log('  out     ' + path.relative(ROOT, OUT));

    log('\n[1/5] downloading source workbooks (cached in tools/.cache)');
    var perYear = [];
    for (var i = 0; i < YEARS.length; i++) {
        var y = YEARS[i];
        var dest = path.join(CACHE, y.file);
        try {
            await download(EOG_BASE + y.file, dest);
        } catch (e) {
            log('  !! ' + y.year + ' download failed: ' + e.message + '  (skipping this year)');
            continue;
        }
        var parsed;
        try {
            parsed = parseYear(fs.readFileSync(dest), y.year);
        } catch (e2) {
            log('  !! ' + y.year + ' parse failed: ' + e2.message + '  (skipping this year)');
            continue;
        }
        perYear.push({ year: y.year, rows: parsed.rows });
        log('  ' + y.year + '  ' + String(parsed.rows.length).padStart(6) + ' flares   sheet="' + parsed.sheet +
            '"   detection freq published as ' + parsed.freqUnits);
    }
    if (!perYear.length) throw new Error('no source years could be read');

    log('\n[2/5] land mask');
    var landPath = path.join(CACHE, 'countries-50m.json');
    await download(LAND_URL, landPath);
    var onshore = buildLandMask(JSON.parse(fs.readFileSync(landPath, 'utf8')));
    log('  countries-50m loaded');

    log('\n[3/5] merging years into persistent sites (' + EPSILON_M + ' m)');
    var sites = mergeYears(perYear, EPSILON_M);
    log('  ' + sites.length + ' distinct sites across ' + perYear.length + ' years');

    log('\n[4/5] deriving metrics, classifying, filtering');
    var allYears = perYear.map(function(p) { return p.year; }).sort();
    var kept = [], belowFloor = 0, offshore = 0;

    for (var s = 0; s < sites.length; s++) {
        var site = sites[s];
        var obsYears = Object.keys(site.obs).map(Number).sort();

        // Volume for sizing comes from the most recent year the site was actually seen.
        var lastYear = obsYears[obsYears.length - 1];
        var lastBcm = site.obs[lastYear].bcm;
        var mcfd = lastBcm * MCFD_PER_BCM;
        if (mcfd < FLOOR_MCFD) { belowFloor++; continue; }

        var on = onshore(site.lat, site.lon);
        if (!on) offshore++;

        var kw = mcfd * 1000 * GAS_BTU_PER_CF / HEAT_RATE_BTU_PER_KWH / 24;

        // Persistence: mean published detection frequency across observed years. Falls back to
        // null (never 0) when no year published one, so scoring drops it rather than punishing.
        var fsum = 0, fn = 0;
        for (var k = 0; k < obsYears.length; k++) {
            var o = site.obs[obsYears[k]];
            if (o.freqPct !== null && o.freqPct !== undefined) { fsum += o.freqPct; fn++; }
        }
        var persist = fn ? fsum / fn : null;

        var tYears = [], tVals = [];
        for (var t = 0; t < obsYears.length; t++) { tYears.push(obsYears[t]); tVals.push(site.obs[obsYears[t]].bcm); }
        var slope = trendOf(tYears, tVals);

        // Per-year kW aligned to allYears, null where unobserved — drives the trend chart.
        var series = allYears.map(function(yy) {
            var o = site.obs[yy];
            if (!o) return null;
            return Math.round(o.bcm * MCFD_PER_BCM * 1000 * GAS_BTU_PER_CF / HEAT_RATE_BTU_PER_KWH / 24);
        });

        var tempSum = 0, tempN = 0;
        for (var tk = 0; tk < obsYears.length; tk++) {
            var ob = site.obs[obsYears[tk]];
            if (ob.tempK) { tempSum += ob.tempK; tempN++; }
        }

        kept.push([
            Math.round(site.lat * 10000) / 10000,
            Math.round(site.lon * 10000) / 10000,
            site.iso || '',
            Math.round(kw),
            persist === null ? null : Math.round(persist),
            on ? 1 : 0,
            obsYears.length,
            obsYears[0],
            lastYear,
            trendLabel(slope),
            series,
            tempN ? Math.round(tempSum / tempN) : null
        ]);
    }

    // Persistence first — the spec's primary sort. A very bright flare may be a two-week well
    // test; a modest one burning most nights for six years is a business.
    kept.sort(function(a, b) {
        var pa = a[4] === null ? -1 : a[4], pb = b[4] === null ? -1 : b[4];
        if (pb !== pa) return pb - pa;
        if (b[6] !== a[6]) return b[6] - a[6];
        return b[3] - a[3];
    });

    var byCountry = {};
    for (var c = 0; c < kept.length; c++) {
        if (!kept[c][5]) continue;
        byCountry[kept[c][2]] = (byCountry[kept[c][2]] || 0) + 1;
    }

    var payload = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'Earth Observation Group, Colorado School of Mines — Global Gas Flaring Observed from Space',
        sourceUrl: 'https://eogdata.mines.edu/download_global_flare.html',
        years: allYears,
        dataThrough: allYears[allYears.length - 1],
        floorMcfd: FLOOR_MCFD,
        epsilonM: EPSILON_M,
        heatRateBtuPerKwh: HEAT_RATE_BTU_PER_KWH,
        gasBtuPerCf: GAS_BTU_PER_CF,
        fields: ['lat', 'lon', 'iso3', 'kw', 'persistPct', 'onshore', 'yearsSeen', 'firstYear', 'lastYear', 'trend', 'kwByYear', 'tempK'],
        counts: {
            sites: kept.length,
            onshore: kept.length - offshore,
            offshore: offshore,
            droppedBelowFloor: belowFloor
        },
        sites: kept
    };

    log('\n[5/5] writing');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;

    log('');
    log('  sites kept          ' + kept.length);
    log('    onshore           ' + (kept.length - offshore));
    log('    offshore (tagged) ' + offshore);
    log('  dropped below floor ' + belowFloor);
    log('  years               ' + allYears.join(', '));
    log('  size                ' + (raw / 1024).toFixed(0) + ' KB raw / ' + (gz / 1024).toFixed(0) + ' KB gzipped');
    var top = Object.keys(byCountry).sort(function(a, b) { return byCountry[b] - byCountry[a]; }).slice(0, 8);
    log('  top onshore         ' + top.map(function(k) { return k + '=' + byCountry[k]; }).join('  '));
    log('\nwrote ' + path.relative(ROOT, OUT));
})().catch(function(e) {
    console.error('\nBUILD FAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
