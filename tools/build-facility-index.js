// ===== Facility index — EIA-860 + EIA-923 =====
//
// Builds the universe of small US generating facilities that ALREADY produce and sell power,
// plus a monthly capacity-factor history for each, and derives the distress signals that history
// implies. One ingestion serves three consumers:
//
//   1. the facility universe        (development_stage: operating / energized)
//   2. capacity-factor distress     (output falling against the plant's OWN history)
//   3. curtailment                  (output far below the regional norm for its resource class)
//
// (2) and (3) are the same time series read two different ways, which is why they are computed
// together rather than in two pipelines that could drift.
//
// Why EIA-860 rather than FERC Form 556: Form 556 is the formal Qualifying Facility registry, but
// data.ferc.gov requires an API key and www.ferc.gov/qf is behind a bot challenge. EIA-860 is
// open, needs no credentials, and carries nameplate capacity, coordinates, prime mover, fuel,
// operating status and planned retirement — most of what 556 offers. It also reports FERC Small
// Power Producer and Cogeneration status per plant, which recovers part of the QF signal.
//
// KNOWN COVERAGE GAP, stated rather than papered over: EIA-860 covers plants of 1 MW and above.
// Facilities below 1 MW are not required to report and are largely absent. Form 556 has the same
// 1 MW threshold, so this is a limit of the public data, not of this choice of source.
//
// Usage:
//   node tools/build-facility-index.js [--max-mw 50] [--years 5] [--out data/facilities.json]
var https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib');
var xlsx = require(path.join(__dirname, 'xlsx-lite.js'));

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache');

var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
function flag(name) { return argv.indexOf('--' + name) >= 0; }

// Above this the asset is a different business with a different counterparty. Everything larger
// is DROPPED, and the count of what was dropped is reported — a filtered universe that says
// nothing about its own filter reads as though it were complete.
var MAX_MW = parseFloat(arg('max-mw', '50'));
var YEARS = parseInt(arg('years', '5'), 10);
var OUT = path.resolve(ROOT, arg('out', 'data/facilities.json'));

// The most recent EIA-860 annual release. EIA-923 years are resolved below; note that finalised
// years live under archive/xls/ while the current early-release year does not — guessing the
// wrong one yields a 301 to a generic landing page rather than an error, which is the trap that
// makes this worth writing down.
var EIA860_YEAR = parseInt(arg('eia860-year', '2024'), 10);
var EIA860_URL = 'https://www.eia.gov/electricity/data/eia860/xls/eia860' + EIA860_YEAR + '.zip';

// Months of capacity-factor history kept per facility for the detail chart. The trend ANALYSIS
// reaches further back (up to four years) but runs at build time, so only what the chart draws
// needs to ship.
var SERIES_MONTHS = 24;

// Minimum historical capacity factor for a decline to be scoreable. Below this the plant is a
// backup or standby unit whose output is noise around zero.
var MIN_BASELINE_CF = 0.05;

var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
var DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function log(s) { console.log(s); }
function progress(s) { if (process.stdout.isTTY) process.stdout.write('\r  ' + s + '   '); }

// ---- Download ---------------------------------------------------------------------------
function download(url, dest, redirects) {
    return new Promise(function (resolve, reject) {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return resolve(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        var tmp = dest + '.part', file = fs.createWriteStream(tmp);
        https.get(url, { headers: { 'User-Agent': 'ion-mining-group/facility-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(download(new URL(res.headers.location, url).href, dest, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            }
            var total = parseInt(res.headers['content-length'] || '0', 10), got = 0;
            res.on('data', function (c) {
                got += c.length;
                if (total) progress(path.basename(dest) + '  ' + Math.round(100 * got / total) + '%');
            });
            res.pipe(file);
            file.on('finish', function () {
                file.close(function () {
                    fs.renameSync(tmp, dest);
                    if (process.stdout.isTTY) process.stdout.write('\r');
                    resolve(dest);
                });
            });
        }).on('error', function (e) { try { fs.unlinkSync(tmp); } catch (e2) {} reject(e); });
    });
}

// ---- Zip ------------------------------------------------------------------------------
// Reads only the first two bytes. A redirect to a landing page returns HTML with a 200, so size
// alone does not distinguish a real archive from an error page.
function isZip(file) {
    var fd;
    try {
        fd = fs.openSync(file, 'r');
        var b = Buffer.alloc(2);
        var n = fs.readSync(fd, b, 0, 2, 0);
        return n === 2 && b[0] === 0x50 && b[1] === 0x4B;   // 'PK'
    } catch (e) {
        return false;
    } finally {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch (e2) {} }
    }
}

function zipMembers(buf) {
    var out = [], i = buf.length - 22;
    while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
    if (i < 0) return null;
    var n = buf.readUInt16LE(i + 10), p = buf.readUInt32LE(i + 16);
    for (var k = 0; k < n; k++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        var nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
        out.push({ name: buf.slice(p + 46, p + 46 + nl).toString(), lho: buf.readUInt32LE(p + 42),
                   method: buf.readUInt16LE(p + 10), csize: buf.readUInt32LE(p + 20) });
        p += 46 + nl + el + cl;
    }
    return out;
}
function inflateMember(buf, m) {
    var nl = buf.readUInt16LE(m.lho + 26), el = buf.readUInt16LE(m.lho + 28);
    var raw = buf.slice(m.lho + 30 + nl + el, m.lho + 30 + nl + el + m.csize);
    return m.method === 0 ? raw : zlib.inflateRawSync(raw);
}
function memberBuf(zipPath, nameFrag) {
    var buf = fs.readFileSync(zipPath);
    var ms = zipMembers(buf);
    if (!ms) throw new Error('not a zip: ' + zipPath);
    var m = ms.filter(function (x) { return x.name.toLowerCase().indexOf(nameFrag) >= 0; })[0];
    if (!m) throw new Error('member "' + nameFrag + '" not in ' + path.basename(zipPath));
    return inflateMember(buf, m);
}

// ---- Sheet helpers ----------------------------------------------------------------------
// EIA puts a title block above the real header and moves it between years, so the header row is
// found by content rather than assumed to be row 0.
function headerIndex(rows) {
    for (var i = 0; i < Math.min(10, rows.length); i++) {
        if ((rows[i] || []).filter(function (c) { return c !== null && c !== ''; }).length > 8) return i;
    }
    return 0;
}
// Columns are resolved BY NAME every year. Their positions shift between releases, and a
// hardcoded index silently reads the wrong column rather than failing.
function colFinder(hdr) {
    var norm = hdr.map(function (h) { return String(h === null || h === undefined ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase(); });
    return function (frag, exact) {
        var f = String(frag).toLowerCase();
        for (var i = 0; i < norm.length; i++) {
            if (exact ? norm[i] === f : norm[i].indexOf(f) === 0) return i;
        }
        return -1;
    };
}
function num(v) {
    if (v === null || v === undefined || v === '' || v === '.') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
}
function str(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s === '' || s === '.' ? null : s;
}

// ---- EIA-860: the universe ---------------------------------------------------------------
function loadPlants(zipPath) {
    var rows = xlsx.read(memberBuf(zipPath, '2___plant')).sheet('Plant') || [];
    var hi = headerIndex(rows), col = colFinder(rows[hi] || []);
    var cCode = col('plant code'), cName = col('plant name'), cUtil = col('utility name'),
        cLat = col('latitude'), cLon = col('longitude'), cState = col('state'),
        cCounty = col('county'), cSector = col('sector name'),
        cSPP = col('ferc small power producer status'), cCogen = col('ferc cogeneration status');
    if (cCode < 0 || cLat < 0) throw new Error('EIA-860 Plant: expected columns not found');

    var out = {};
    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i], code = num(r[cCode]);
        if (code === null) continue;
        out[code] = {
            code: code,
            name: str(r[cName]),
            utility: str(r[cUtil]),
            lat: num(r[cLat]),
            lon: num(r[cLon]),
            state: str(r[cState]),
            county: str(r[cCounty]),
            sector: str(r[cSector]),
            // The QF signal EIA-860 recovers without a FERC key.
            fercSmallPowerProducer: str(r[cSPP]) === 'Y',
            fercCogen: str(r[cCogen]) === 'Y'
        };
    }
    return out;
}

// Generator status codes, per the EIA-860 layout sheet.
var STATUS_LABEL = {
    OP: 'operating', SB: 'standby', OS: 'out of service', OA: 'out of service (short term)',
    RE: 'retired', CN: 'cancelled', TS: 'construction complete but not in commercial operation'
};

function loadGenerators(zipPath) {
    var wb = xlsx.read(memberBuf(zipPath, '3_1_generator'));
    var acc = {};

    function ingest(sheetName, retired) {
        var rows = wb.sheet(sheetName) || [];
        if (!rows.length) return;
        var hi = headerIndex(rows), col = colFinder(rows[hi] || []);
        var cCode = col('plant code'), cMW = col('nameplate capacity'),
            cTech = col('technology'), cPM = col('prime mover'), cStatus = col('status'),
            cOpYear = col('operating year'), cRetYear = col('planned retirement year');
        if (cCode < 0 || cMW < 0) return;
        for (var i = hi + 1; i < rows.length; i++) {
            var r = rows[i], code = num(r[cCode]);
            if (code === null) continue;
            var mw = num(r[cMW]);
            if (mw === null) continue;
            var a = acc[code];
            if (!a) {
                a = acc[code] = { mw: 0, retiredMw: 0, units: 0, tech: {}, primeMover: {},
                                  status: {}, opYear: null, plannedRetirementYear: null };
            }
            var st = str(r[cStatus]);
            if (retired) {
                a.retiredMw += mw;
                a.status.RE = (a.status.RE || 0) + 1;
            } else {
                a.mw += mw;
                a.units++;
                if (st) a.status[st] = (a.status[st] || 0) + 1;
                if (cTech >= 0 && str(r[cTech])) a.tech[str(r[cTech])] = (a.tech[str(r[cTech])] || 0) + mw;
                if (cPM >= 0 && str(r[cPM])) a.primeMover[str(r[cPM])] = (a.primeMover[str(r[cPM])] || 0) + mw;
                var oy = cOpYear >= 0 ? num(r[cOpYear]) : null;
                if (oy !== null && (a.opYear === null || oy < a.opYear)) a.opYear = oy;
                var ry = cRetYear >= 0 ? num(r[cRetYear]) : null;
                if (ry !== null && (a.plannedRetirementYear === null || ry < a.plannedRetirementYear)) {
                    a.plannedRetirementYear = ry;
                }
            }
        }
    }
    ingest('Operable', false);
    ingest('Retired and Canceled', true);
    return acc;
}

// ---- EIA-923: monthly net generation -----------------------------------------------------
// Returns { plantCode: { 'YYYY-MM': netGenMWh } }. Rows are per plant/prime-mover/fuel, so a
// plant with two fuels contributes several rows per month and they are SUMMED — taking one row
// would silently report a fraction of the plant's output as its whole output.
function loadGeneration(zipPath, year, into) {
    var rows = xlsx.read(memberBuf(zipPath, 'schedules_2_3_4_5')).sheet('Page 1 Generation and Fuel Data') || [];
    if (!rows.length) throw new Error('EIA-923 ' + year + ': Page 1 sheet not found');
    var hi = headerIndex(rows), hdr = rows[hi] || [], col = colFinder(hdr);
    var cId = col('plant id');
    if (cId < 0) throw new Error('EIA-923 ' + year + ': plant id column not found');

    var netCols = [];
    for (var m = 0; m < 12; m++) {
        var c = col('netgen ' + MONTHS[m].toLowerCase());
        if (c < 0) c = col('netgen\n' + MONTHS[m].toLowerCase());
        netCols.push(c);
    }
    if (netCols.filter(function (c) { return c >= 0; }).length < 12) {
        throw new Error('EIA-923 ' + year + ': found only ' +
                        netCols.filter(function (c) { return c >= 0; }).length + ' of 12 netgen columns');
    }

    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i], code = num(r[cId]);
        if (code === null) continue;
        var series = into[code] || (into[code] = {});
        for (var mm = 0; mm < 12; mm++) {
            var v = num(r[netCols[mm]]);
            if (v === null) continue;
            var key = year + '-' + (mm < 9 ? '0' : '') + (mm + 1);
            series[key] = (series[key] || 0) + v;
        }
    }
}

// ---- Capacity factor + trend -------------------------------------------------------------
// CF = generation / (nameplate x hours). Negative net generation is real — a plant drawing more
// station service than it produces — and is clamped to 0 for CF while the raw value stays in the
// series, because a negative capacity factor is not meaningful but the fact is.
function capacityFactors(series, mw) {
    var out = {};
    if (!mw || mw <= 0) return out;
    Object.keys(series).forEach(function (k) {
        var y = parseInt(k.slice(0, 4), 10), m = parseInt(k.slice(5, 7), 10);
        var days = DAYS_IN_MONTH[m - 1];
        if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) days = 29;
        var hours = days * 24;
        var cf = series[k] / (mw * hours);
        out[k] = cf < 0 ? 0 : cf;
    });
    return out;
}

// THE analysis that decides whether this module is useful or noise.
//
// A plant's output varies enormously within a year for entirely healthy reasons — solar peaks in
// summer, hydro follows snowmelt, peakers run only when prices spike. Comparing recent months to
// adjacent months would flag every seasonal plant in the country as failing.
//
// So decline is measured YEAR OVER YEAR, SAME MONTH: August against last August. Seasonality
// cancels because the comparison holds the season fixed, and only a genuine change in the plant's
// operation survives. A decline is reported only when it is BROAD (most months down, not one bad
// outage) and DEEP (well below the plant's own multi-year normal for those months).
function analyseTrend(cf, opts) {
    opts = opts || {};
    var keys = Object.keys(cf).sort();
    if (keys.length < 24) return { enough: false, reason: 'fewer than 24 months of data' };

    var last = keys[keys.length - 1];
    var endY = parseInt(last.slice(0, 4), 10), endM = parseInt(last.slice(5, 7), 10);

    function windowKeys(yearsBack) {
        var out = [];
        for (var i = 0; i < 12; i++) {
            var m = endM - i, y = endY;
            while (m <= 0) { m += 12; y -= 1; }
            y -= yearsBack;
            out.push(y + '-' + (m < 10 ? '0' : '') + m);
        }
        return out;
    }
    function mean(arr) {
        var v = arr.filter(function (x) { return x !== null && x !== undefined; });
        if (!v.length) return null;
        return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
    }

    var recentKeys = windowKeys(0);
    var recent = mean(recentKeys.map(function (k) { return cf[k]; }));
    if (recent === null) return { enough: false, reason: 'no recent 12 months' };

    // The plant's own normal for the SAME calendar months, over the preceding years.
    var priorVals = [];
    for (var yb = 1; yb <= 3; yb++) {
        var w = windowKeys(yb).map(function (k) { return cf[k]; }).filter(function (v) { return v !== undefined; });
        if (w.length >= 6) priorVals.push(mean(w));
    }
    var baseline = mean(priorVals);
    if (baseline === null) return { enough: false, reason: 'no usable baseline' };

    // A plant must actually have RUN for a decline to mean anything. Standby and backup units sit
    // at capacity factors of a few tenths of a percent for years; when one drops from 0.4% to 0%
    // that is a 100% "decline" by arithmetic and says nothing about the owner's position.
    // Measured on the first build: 118 of 380 flagged declines (31%) had a baseline under 5%,
    // including two of the ten steepest. They are now reported as unscoreable, not as distress.
    if (baseline < MIN_BASELINE_CF) {
        return { enough: false, cfCurrent: recent, cfBaseline: baseline,
                 reason: 'plant averaged only ' + (100 * baseline).toFixed(1) +
                         '% capacity factor historically - too idle for a decline to be meaningful' };
    }

    // Month-by-month YoY, which is what makes this seasonality-proof.
    var down = 0, compared = 0;
    for (var i = 0; i < 12; i++) {
        var nowK = recentKeys[i], agoK = windowKeys(1)[i];
        if (cf[nowK] === undefined || cf[agoK] === undefined) continue;
        compared++;
        if (cf[nowK] < cf[agoK] * 0.9) down++;      // 10% tolerance for ordinary variation
    }

    var declinePct = 1 - (recent / baseline);
    // Both conditions must hold. Depth alone catches a single-month outage; breadth alone
    // catches a plant drifting down 5% a year, which is ageing rather than distress.
    var isDecline = declinePct > (opts.declineThreshold || 0.5) &&
                    compared >= 6 && (down / compared) >= 0.6;

    return {
        enough: true,
        cfCurrent: recent,
        cfBaseline: baseline,
        declinePct: declinePct,
        monthsCompared: compared,
        monthsDown: down,
        isDecline: isDecline,
        lastMonth: last
    };
}

// ---- Deterministic output ----------------------------------------------------------------
// Byte-stable artifacts. V8 preserves insertion order for string keys, so sorting before
// stringify is what makes two runs of the same inputs produce identical files.
function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
        var out = {};
        Object.keys(v).sort().forEach(function (k) { out[k] = sortKeys(v[k]); });
        return out;
    }
    return v;
}
function round(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    var f = Math.pow(10, dp);
    return Math.round(v * f) / f;
}

// ---- Main ---------------------------------------------------------------------------------
(async function main() {
    log('facility index — EIA-860 + EIA-923');
    log('  max plant capacity  ' + MAX_MW + ' MW');
    log('  generation years    ' + YEARS);
    log('  out                 ' + path.relative(ROOT, OUT));
    log('');

    log('[1/5] downloading EIA-860 ' + EIA860_YEAR);
    var eia860 = path.join(CACHE, 'eia860_' + EIA860_YEAR + '.zip');
    await download(EIA860_URL, eia860);

    log('[2/5] downloading EIA-923 (' + YEARS + ' years)');
    // Finalised years live under archive/xls/; the early-release year does not. Both are tried,
    // because which is which moves as the calendar rolls over.
    var genYears = [];
    for (var y = EIA860_YEAR - YEARS + 1; y <= EIA860_YEAR + 1; y++) genYears.push(y);
    var have = [];
    for (var gi = 0; gi < genYears.length; gi++) {
        var gy = genYears[gi];
        var dest = path.join(CACHE, 'eia923_' + gy + '.zip');
        var urls = [
            'https://www.eia.gov/electricity/data/eia923/archive/xls/f923_' + gy + '.zip',
            'https://www.eia.gov/electricity/data/eia923/xls/f923_' + gy + '.zip',
            'https://www.eia.gov/electricity/data/eia923/xls/f923_' + gy + 'er.zip'
        ];
        var got = false;
        for (var ui = 0; ui < urls.length && !got; ui++) {
            try { await download(urls[ui], dest); } catch (e) { /* try the next URL */ }
            // EIA answers a wrong path with a styled 404 PAGE carrying HTTP 200 and a
            // Content-Type of application/x-zip-compressed, so neither the status code nor the
            // content type distinguishes it from a real archive. Only the magic bytes do.
            //
            // The file MUST be deleted when it fails validation. download() short-circuits on
            // any existing file, so a cached error page would otherwise be re-read forever and
            // every subsequent URL and every future run would fail against the same 67 KB of
            // HTML — which is exactly what happened.
            got = fs.existsSync(dest) && fs.statSync(dest).size > 1000000 && isZip(dest);
            if (!got && fs.existsSync(dest)) { try { fs.unlinkSync(dest); } catch (e2) {} }
        }
        if (got) { have.push(gy); log('  ' + gy + '  ok'); }
        else log('  ' + gy + '  not available — skipped');
    }
    if (!have.length) throw new Error('no EIA-923 years could be downloaded');

    log('[3/5] reading the generator inventory');
    var plants = loadPlants(eia860);
    var gens = loadGenerators(eia860);
    log('  ' + Object.keys(plants).length.toLocaleString() + ' plants, ' +
        Object.keys(gens).length.toLocaleString() + ' with generators');

    log('[4/5] reading monthly generation');
    var series = {};
    for (var hi2 = 0; hi2 < have.length; hi2++) {
        progress('EIA-923 ' + have[hi2]);
        loadGeneration(path.join(CACHE, 'eia923_' + have[hi2] + '.zip'), have[hi2], series);
    }
    if (process.stdout.isTTY) process.stdout.write('\r');
    log('  ' + Object.keys(series).length.toLocaleString() + ' plants reported generation');

    log('[5/5] computing capacity factors and trends');
    var out = [], dropped = { tooBig: 0, noCapacity: 0, noLocation: 0, noGeneration: 0 };
    var declines = 0, standby = 0, plannedRetire = 0;

    Object.keys(gens).forEach(function (code) {
        var g = gens[code], p = plants[code];
        if (!p) return;
        if (!g.mw || g.mw <= 0) { dropped.noCapacity++; return; }
        if (g.mw > MAX_MW) { dropped.tooBig++; return; }
        if (p.lat === null || p.lon === null) { dropped.noLocation++; return; }

        var s = series[code];
        if (!s || !Object.keys(s).length) { dropped.noGeneration++; return; }

        var cf = capacityFactors(s, g.mw);
        var keysAll = Object.keys(cf).sort();
        var trend = analyseTrend(cf);

        function topKey(o) {
            var ks = Object.keys(o);
            if (!ks.length) return null;
            return ks.sort(function (a, b) { return o[b] - o[a]; })[0];
        }
        var statusCode = topKey(g.status) || null;

        // Trailing series for the detail chart, stored as a FLAT ARRAY with a start month
        // rather than an object keyed by date. The keys ("2024-01") cost more bytes than the
        // values they label: the object form produced a 10.6 MB artifact, the array form 2.5 MB
        // for identical information. Months are contiguous, so position carries the date.
        // 3 decimal places is 0.1% of a capacity factor — far finer than the data's own accuracy.
        var keys = Object.keys(cf).sort().slice(-SERIES_MONTHS);
        var seriesStart = keys.length ? keys[0] : null;
        var cfArr = [];
        if (seriesStart) {
            // Walk month by month from the start so a gap in reporting becomes an explicit null
            // rather than silently shifting every later month one position earlier.
            var sy = parseInt(seriesStart.slice(0, 4), 10), sm = parseInt(seriesStart.slice(5, 7), 10);
            var endKey = keys[keys.length - 1];
            var cy = sy, cm = sm;
            while (true) {
                var kk = cy + '-' + (cm < 10 ? '0' : '') + cm;
                cfArr.push(cf[kk] === undefined ? null : round(cf[kk], 3));
                if (kk === endKey) break;
                cm++; if (cm > 12) { cm = 1; cy++; }
                if (cfArr.length > SERIES_MONTHS + 6) break;   // guard against a malformed key
            }
        }

        if (trend.isDecline) declines++;
        if (statusCode === 'SB') standby++;
        if (g.plannedRetirementYear !== null) plannedRetire++;

        out.push({
            id: 'eia_' + code,
            plantCode: code,
            name: p.name,
            operator: p.utility,
            lat: round(p.lat, 5),
            lon: round(p.lon, 5),
            state: p.state,
            county: p.county,
            sector: p.sector,
            nameplateMw: round(g.mw, 3),
            retiredMw: g.retiredMw > 0 ? round(g.retiredMw, 3) : null,
            units: g.units,
            technology: topKey(g.tech),
            primeMover: topKey(g.primeMover),
            status: statusCode,
            statusLabel: statusCode ? (STATUS_LABEL[statusCode] || statusCode) : null,
            inServiceYear: g.opYear,
            plannedRetirementYear: g.plannedRetirementYear,
            fercSmallPowerProducer: p.fercSmallPowerProducer,
            fercCogen: p.fercCogen,
            cfCurrent: round(trend.cfCurrent, 4),
            cfBaseline: round(trend.cfBaseline, 4),
            declinePct: round(trend.declinePct, 4),
            monthsCompared: trend.monthsCompared === undefined ? null : trend.monthsCompared,
            monthsDown: trend.monthsDown === undefined ? null : trend.monthsDown,
            isDecline: !!trend.isDecline,
            trendNote: trend.enough ? null : trend.reason,
            // EIA-923 has monthly and ANNUAL respondents. Small plants mostly file annually, so
            // their latest data lags the monthly filers by roughly a year. Recorded per facility
            // so the UI can date the number instead of implying it is current.
            lastDataMonth: keysAll.length ? keysAll[keysAll.length - 1] : null,
            cfStart: seriesStart,
            cfSeries: cfArr
        });
    });

    // Deterministic order: by plant code, which is stable across releases.
    out.sort(function (a, b) { return a.plantCode - b.plantCode; });

    var payload = sortKeys({
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'US EIA Form 860 (generator inventory) and Form 923 (monthly generation)',
        sourceUrl: 'https://www.eia.gov/electricity/data/eia860/ and /eia923/',
        eia860Year: EIA860_YEAR,
        generationYears: have,
        maxMw: MAX_MW,
        // Stated in the artifact itself so a consumer cannot mistake a filtered universe for a
        // complete one.
        coverageNote: 'EIA-860 covers generating plants of 1 MW and above. Facilities below 1 MW ' +
                      'are not required to report and are largely absent. Plants above ' + MAX_MW +
                      ' MW were deliberately excluded from this artifact.',
        declineMethod: 'Capacity factor compared year-over-year for the SAME calendar months, so ' +
                       'seasonality cancels. Flagged only when the trailing 12 months are more ' +
                       'than 50% below the plant\'s own 3-year normal AND at least 60% of ' +
                       'compared months are down more than 10%, and the plant historically ran ' +
                       'at a capacity factor of at least ' + (100 * MIN_BASELINE_CF) + '% - below ' +
                       'that it is a standby unit whose output is noise around zero.',
        lagNote: 'EIA-923 has monthly and annual respondents. Most small plants file annually, so ' +
                 'their most recent figures lag the monthly filers by about a year. Every facility ' +
                 'carries lastDataMonth; a capacity factor should not be read as current without it.',
        counts: {
            facilities: out.length,
            declining: declines,
            standby: standby,
            plannedRetirement: plannedRetire,
            droppedTooBig: dropped.tooBig,
            droppedNoCapacity: dropped.noCapacity,
            droppedNoLocation: dropped.noLocation,
            droppedNoGeneration: dropped.noGeneration
        },
        facilities: out
    });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;

    log('');
    log('  facilities            ' + out.length.toLocaleString());
    log('  declining output      ' + declines.toLocaleString());
    log('  standby               ' + standby.toLocaleString());
    log('  planned retirement    ' + plannedRetire.toLocaleString());
    log('  dropped: >' + MAX_MW + ' MW    ' + dropped.tooBig.toLocaleString() +
        ',  no generation ' + dropped.noGeneration.toLocaleString() +
        ',  no location ' + dropped.noLocation.toLocaleString());
    log('  size                  ' + Math.round(raw / 1024) + ' KB  (' + Math.round(gz / 1024) + ' KB gzipped)');
    log('');
    log('wrote ' + path.relative(ROOT, OUT));
})().catch(function (e) {
    console.error('\nFAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
