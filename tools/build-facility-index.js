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
        https.get(url, { headers: { 'User-Agent': 'proton-mining/facility-index' } }, function (res) {
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
// Excel stored the ZIP column numerically, so 969 of 6,643 utility ZIPs (14.6%) arrive with the
// leading zero eaten — Rahway NJ reads 7065, Boston MA reads 2210. Left unpadded they are not
// merely ugly: a maps link to "Rahway, NJ 7065" does not resolve, and the number reads as data
// rather than as damage. Some rows carry ZIP+4, so the first five digits are what survives.
function zip5(v) {
    var s = str(v);
    if (s === null) return null;
    var d = s.replace(/[^0-9]/g, '');
    if (!d) return null;
    while (d.length < 5) d = '0' + d;
    return d.slice(0, 5);
}
// A column that must exist. An unresolved index makes str(r[-1]) return null for every row, so a
// renamed column would silently empty a field that the artifact then claims 100% coverage on.
function need(idx, what) {
    if (idx < 0) throw new Error('EIA-860: column "' + what + '" not found — the layout moved');
    return idx;
}

// ---- EIA-860 Schedule 1: who the operator IS, and where to write to them ------------------
//
// READ THIS BEFORE ASSUMING THIS IS THE BANNED NAME MATCHING.
//
// This project bans name-based joins, and rightly: build-permit-index.js records a spatial+name
// fallback that matched 4 of 5 wrong, every failure on a shared TOWN name (SAND POINT -> Trident
// Seafoods). Nothing here does that. Every join below is an EXACT INTEGER KEY join on the primary
// key of a SINGLE form — Plant Code across Schedules 2/3/4, Utility ID across Schedules 1/2. The
// SAND POINT failure was matching a LABEL across two agencies that never agreed on a key. There is
// no fuzziness available here and no threshold to tune.
//
// It is keyed by Utility ID and not by name for a measured reason: among the 9,765 catalogued
// plants there are 4,084 distinct Utility IDs behind only 4,080 names. Merck & Co (12311 Rahway NJ
// / 12320 Elkton VA), Boise White Paper, State Farm and Cascade Solar each appear twice with
// DIFFERENT addresses. A name key gives those plants a coin flip on the mailing address, and both
// answers look right.
//
// EIA-860 publishes no telephone number. That is a fact about the form, and the UI says so rather
// than filling the gap.
var ENTITY_TYPE_LABEL = {
    C: 'Cooperative', I: 'Investor-owned utility', M: 'Municipally owned',
    P: 'Political subdivision', F: 'Federally owned', S: 'State owned',
    // NOT "qualifying facility" — that is a different EIA field entirely, and it is already read
    // as fercSmallPowerProducer / fercCogen. Mislabelling this would put the wrong word on 6,391
    // of the 9,765 plants.
    Q: 'Independent power producer', IND: 'Industrial', COM: 'Commercial'
};

function loadUtilities(zipPath) {
    var rows = xlsx.read(memberBuf(zipPath, '1___utility')).sheet('Utility') || [];
    var hi = headerIndex(rows), col = colFinder(rows[hi] || []);
    var cId = need(col('utility id'), 'utility id'),
        cName = need(col('utility name'), 'utility name'),
        cAddr = need(col('street address'), 'street address'),
        cCity = need(col('city'), 'city'),
        cState = need(col('state'), 'state'),
        cZip = need(col('zip'), 'zip'),
        cType = col('entity type');
    var out = {};
    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i], id = num(r[cId]);
        if (id === null) continue;
        var t = str(r[cType]);
        out[String(id)] = {
            utilityId: String(id),
            name: str(r[cName]),
            address: str(r[cAddr]),
            city: str(r[cCity]),
            state: str(r[cState]),
            zip: zip5(r[cZip]),
            entityType: t,
            entityTypeLabel: t ? (ENTITY_TYPE_LABEL[t] || t) : null
        };
    }
    return out;
}

// ---- EIA-860 Schedule 4: who actually OWNS it ---------------------------------------------
// The acquisition-critical sheet, and the one nothing has ever read. The operator is not the
// seller: 1,294 of the catalogued plants are owned by a third party, and of the plants with a
// single owner filed, 1,307 of 1,313 name someone OTHER than the operator. New York Power
// Authority operates Neversink; the City of New York owns it.
//
// Owners repeat once per generator, so rows are deduplicated by Ownership ID and the generator
// ids they cover are kept — 18 plants have generators whose owner sets differ, and collapsing
// them would assert a single ownership structure that the filing does not.
function loadOwners(zipPath) {
    var rows = xlsx.read(memberBuf(zipPath, '4___owner')).sheet('Ownership') || [];
    var hi = headerIndex(rows), col = colFinder(rows[hi] || []);
    // FULL fragments throughout: colFinder is a PREFIX matcher, and this sheet carries both
    // "State"/"Zip" (the plant's) and "Owner State"/"Owner Zip". Asking for 'state' here would
    // silently bind the owner's address to the plant's state.
    var cCode = need(col('plant code'), 'plant code'),
        cGen = col('generator id'),
        cOwnName = need(col('owner name'), 'owner name'),
        cOwnAddr = need(col('owner street address'), 'owner street address'),
        cOwnCity = need(col('owner city'), 'owner city'),
        cOwnState = need(col('owner state'), 'owner state'),
        cOwnZip = need(col('owner zip'), 'owner zip'),
        cOwnId = need(col('ownership id'), 'ownership id'),
        cPct = need(col('percent owned'), 'percent owned');

    var byPlant = {};
    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i], code = num(r[cCode]);
        if (code === null) continue;
        var ownId = str(r[cOwnId]), name = str(r[cOwnName]);
        if (!ownId || !name) continue;
        var p = byPlant[code] || (byPlant[code] = { owners: {}, order: [] });
        var o = p.owners[ownId];
        if (!o) {
            // "Percent Owned" is a FRACTION: plant 51's four owners read 0.5 / 0.0586 / 0.039 /
            // 0.4024 and sum to 1.0. Rendered raw it says "1% owned" for a 100% owner — a 100x
            // error on the one number that decides who has to sign. Converted once, here, with
            // the unit in the field name so a caller cannot repeat the mistake.
            var pct = num(r[cPct]);
            o = p.owners[ownId] = {
                ownershipId: ownId,
                name: name,
                address: str(r[cOwnAddr]),
                city: str(r[cOwnCity]),
                state: str(r[cOwnState]),
                zip: zip5(r[cOwnZip]),
                sharePct: pct === null ? null : round(pct * 100, 4),
                generators: []
            };
            p.order.push(ownId);
        }
        var g = cGen >= 0 ? str(r[cGen]) : null;
        if (g && o.generators.indexOf(g) < 0) o.generators.push(g);
    }
    var out = {};
    Object.keys(byPlant).forEach(function (code) {
        var p = byPlant[code];
        out[code] = p.order.map(function (id) { return p.owners[id]; });
    });
    return out;
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
    // The counterparty columns. Required where coverage is ~100%, so a layout change fails loudly
    // instead of emptying a field the artifact still claims full coverage on.
    var cUtilId = need(col('utility id'), 'utility id'),
        cAddr = need(col('street address'), 'street address'),
        cCity = need(col('city'), 'city'),
        cZip = need(col('zip'), 'zip'),
        cKv = need(col('grid voltage (kv)'), 'grid voltage (kv)'),
        cTdo = need(col('transmission or distribution system owner'),
                    'transmission or distribution system owner');
    // Partial coverage — resolved but not required. Full fragments so the prefix matcher cannot
    // alias "...status" onto "...docket number".
    var cBaCode = col('balancing authority code'), cBaName = col('balancing authority name'),
        cReg = col('regulatory status'),
        cSppDkt = col('ferc small power producer docket number'),
        cCogenDkt = col('ferc cogeneration docket number'),
        cEwgDkt = col('ferc exempt wholesale generator docket number'),
        cLdc = col('natural gas ldc name'), cPipe = col('natural gas pipeline name 1');

    var out = {};
    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i], code = num(r[cCode]);
        if (code === null) continue;
        var uid = num(r[cUtilId]);
        out[code] = {
            code: code,
            name: str(r[cName]),
            utility: str(r[cUtil]),
            utilityId: uid === null ? null : String(uid),
            address: str(r[cAddr]),
            city: str(r[cCity]),
            zip: zip5(r[cZip]),
            lat: num(r[cLat]),
            lon: num(r[cLon]),
            state: str(r[cState]),
            county: str(r[cCounty]),
            sector: str(r[cSector]),
            // The voltage the plant actually sits on, and whose wires those are. Both are
            // counterparty facts: only 1,144 plants are on their own operator's system, so for
            // the rest the grid connection is a second conversation with a named third party.
            gridVoltageKv: num(r[cKv]),
            transmissionOwner: str(r[cTdo]),
            balancingAuthority: cBaCode >= 0 ? str(r[cBaCode]) : null,
            balancingAuthorityName: cBaName >= 0 ? str(r[cBaName]) : null,
            regulatoryStatus: cReg >= 0 ? str(r[cReg]) : null,
            // Kept verbatim. Observed formats in one column include 98-53-000, 04-78-000. (with a
            // trailing period), 16-1155 and QF16-134-000, so no URL template is right for a large
            // minority of them. The identifier is given and the lookup stays manual — the same
            // treatment PACER and the state UCC registries got.
            qfDocket: cSppDkt >= 0 ? str(r[cSppDkt]) : null,
            cogenDocket: cCogenDkt >= 0 ? str(r[cCogenDkt]) : null,
            ewgDocket: cEwgDkt >= 0 ? str(r[cEwgDkt]) : null,
            gasLdc: cLdc >= 0 ? str(r[cLdc]) : null,
            gasPipeline: cPipe >= 0 ? str(r[cPipe]) : null,
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
            cOpYear = col('operating year'), cRetYear = col('planned retirement year'),
            // Reference Table 3 of the layout sheet: S = single ownership by the respondent,
            // J = jointly owned with another entity, W = wholly owned by an entity OTHER than the
            // respondent. Present on all 9,765 catalogued plants.
            cOwn = col('ownership');
        if (cCode < 0 || cMW < 0) return;
        for (var i = hi + 1; i < rows.length; i++) {
            var r = rows[i], code = num(r[cCode]);
            if (code === null) continue;
            var mw = num(r[cMW]);
            if (mw === null) continue;
            var a = acc[code];
            if (!a) {
                a = acc[code] = { mw: 0, retiredMw: 0, units: 0, tech: {}, primeMover: {},
                                  status: {}, opYear: null, plannedRetirementYear: null,
                                  ownership: {} };
            }
            var st = str(r[cStatus]);
            if (retired) {
                a.retiredMw += mw;
                a.status.RE = (a.status.RE || 0) + 1;
            } else {
                a.mw += mw;
                a.units++;
                // Operable generators ONLY. A retired unit's ownership code must not decide what
                // a live plant's ownership is.
                var oc = cOwn >= 0 ? str(r[cOwn]) : null;
                if (oc) a.ownership[oc] = (a.ownership[oc] || 0) + 1;
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

// What the FILING says about who owns the plant, from the Schedule 3 ownership codes.
//
// The evidence for sole ownership is the S code — a positive assertion by the filer — NOT the
// absence of a Schedule 4 row. Those nearly coincide (8,253 of 8,264) and they are not the same
// claim: reasoning from an absent row would keep asserting sole ownership if EIA ever dropped the
// column, with nothing to signal that the basis had disappeared.
function ownershipStateOf(codes) {
    var ks = Object.keys(codes || {});
    if (!ks.length) return null;                       // no code filed: unknown, not sole
    var hasS = ks.indexOf('S') >= 0, hasJ = ks.indexOf('J') >= 0, hasW = ks.indexOf('W') >= 0;
    if (hasJ) return 'joint';                          // any jointly-held generator makes the deal joint
    if (hasS && hasW) return 'mixed';                  // never collapsed to whichever is commoner
    if (hasW) return 'third_party';
    if (hasS) return 'sole_operator';
    return null;
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
    var utilities = loadUtilities(eia860);
    var owners = loadOwners(eia860);
    log('  ' + Object.keys(plants).length.toLocaleString() + ' plants, ' +
        Object.keys(gens).length.toLocaleString() + ' with generators');
    log('  ' + Object.keys(utilities).length.toLocaleString() + ' utilities, ' +
        Object.keys(owners).length.toLocaleString() + ' plants with a filed owner');

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
    // Counterparty tallies. Every one of these is asserted in tests/facility-contact.test.js
    // against the artifact itself, so a silent coverage regression fails a build rather than
    // quietly emptying a field the metadata still claims 100% on.
    var cp = {
        companies: 0, operatorAddress: 0, siteAddress: 0, ownerRows: 0, multiOwner: 0,
        sole: 0, thirdParty: 0, joint: 0, mixed: 0, ownershipUnknown: 0,
        soleButOwnerRowExists: 0, generatorsDisagreeOnOwners: 0, thirdPartyOwnerIsOperator: 0,
        operatorOutOfState: 0, operatorPoBox: 0, gridVoltage: 0, qfDocket: 0,
        offtakeDisagreesWithRegulatoryStatus: 0
    };
    var usedUtilities = {};

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

        // ---- Counterparty -------------------------------------------------------------
        var u = p.utilityId ? utilities[p.utilityId] : null;
        if (u) usedUtilities[p.utilityId] = true;
        if (u && u.address) {
            cp.operatorAddress++;
            // Two caveats worth counting rather than asserting: half of these addresses are
            // nowhere near the plant, and one in fourteen is a post box. Both change what the
            // address is good for, and both go on screen.
            if (u.state && p.state && u.state !== p.state) cp.operatorOutOfState++;
            if (/^\s*p\.?\s*o\.?\s*box/i.test(u.address)) cp.operatorPoBox++;
        }
        if (p.address) cp.siteAddress++;
        if (p.gridVoltageKv !== null) cp.gridVoltage++;
        if (p.qfDocket || p.cogenDocket) cp.qfDocket++;

        var ownState = ownershipStateOf(g.ownership);
        var ownRows = owners[code] || null;
        if (ownState === 'sole_operator') cp.sole++;
        else if (ownState === 'third_party') cp.thirdParty++;
        else if (ownState === 'joint') cp.joint++;
        else if (ownState === 'mixed') cp.mixed++;
        else cp.ownershipUnknown++;
        if (ownRows && ownRows.length) {
            cp.ownerRows++;
            var names = {};
            ownRows.forEach(function (o) { names[o.name] = true; });
            if (Object.keys(names).length > 1) cp.multiOwner++;
            // Counted, never resolved by picking a winner. The filing disagrees with itself and
            // saying so is more useful than choosing.
            if (ownState === 'sole_operator') cp.soleButOwnerRowExists++;
            // The mirror contradiction: coded as wholly owned by ANOTHER entity, then naming the
            // operator as that entity. Bradford Solar is operated by Bradford Solar, LLC and owned
            // by Bradford Solar, LLC. Reported for the same reason.
            if (ownState === 'third_party' &&
                ownRows.some(function(o) { return o.name === p.utility; })) {
                cp.thirdPartyOwnerIsOperator++;
            }
            var gsets = {};
            ownRows.forEach(function (o) { gsets[o.generators.slice().sort().join(',')] = true; });
            if (Object.keys(gsets).length > 1) cp.generatorsDisagreeOnOwners++;
        }
        // Cross-check, not a field. EIA states the regulatory status outright; the adapter infers
        // an offtake state from the sector. Where the two disagree the inference is the weaker
        // claim, and the count belongs in the metadata so nobody has to re-measure it.
        if (p.regulatoryStatus && p.sector) {
            var regSaysRegulated = String(p.regulatoryStatus).toUpperCase().indexOf('RE') === 0;
            var sectorSaysRegulated = /electric utility/i.test(p.sector);
            if (regSaysRegulated !== sectorSaysRegulated) cp.offtakeDisagreesWithRegulatoryStatus++;
        }

        out.push({
            id: 'eia_' + code,
            plantCode: code,
            name: p.name,
            operator: p.utility,
            // The stable key for the counterparty. Grouping by the NAME mis-groups the four
            // duplicated names; see the note on loadUtilities.
            utilityId: p.utilityId,
            lat: round(p.lat, 5),
            lon: round(p.lon, 5),
            state: p.state,
            county: p.county,
            sector: p.sector,
            address: p.address,
            city: p.city,
            zip: p.zip,
            gridVoltageKv: p.gridVoltageKv,
            transmissionOwner: p.transmissionOwner,
            // Deliberately NOT shipped, though all four are read above: balancingAuthority,
            // regulatoryStatus, gasPipeline and gasLdc. Nothing renders them, and this artifact
            // is fetched before the prospects tab can draw anything -- 46 KB gzipped to carry
            // four fields on the chance they are wanted later is a cost paid on every load.
            // regulatoryStatus still earns its keep at build time as the cross-check below.
            qfDocket: p.qfDocket,
            cogenDocket: p.cogenDocket,
            ownership: ownState,
            // Emitted ONLY where the filing has rows. An empty array on the other 8,253 records
            // would cost real bytes on an artifact that loads before anything can be drawn, and
            // would read as "we looked and there are no owners" rather than "none was filed".
            owners: (ownRows && ownRows.length) ? ownRows : undefined,
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

    // ---- The companies map ---------------------------------------------------------------
    // One entry per utility that operates at least one KEPT facility — 4,084, not all 6,643.
    // Keyed by Utility ID as a string.
    //
    // The rollup is the commercial point of keying this separately rather than inlining six
    // fields on every facility: 3,408 of these operate exactly one catalogued plant, but one call
    // to the largest puts nearly 200 on the table. Inlining also measured 1,351 KB against 833 KB
    // for the map.
    var companies = {};
    Object.keys(usedUtilities).forEach(function (uid) {
        var u = utilities[uid];
        if (!u) return;
        companies[uid] = {
            utilityId: uid, name: u.name, address: u.address, city: u.city,
            state: u.state, zip: u.zip,
            entityType: u.entityType, entityTypeLabel: u.entityTypeLabel,
            plants: 0, totalKw: 0, states: {},
            // Deliberately NOT called sizeClass. That name already means "AER active well
            // licences" on the Alberta companies, and the Alberta-only "small operators" filter
            // reads it. Reusing the name would silently change what that control matches.
            portfolioBasis: 'EIA-860 plants under ' + MAX_MW + ' MW in this catalog — a ' +
                            'catalogued footprint, not company size',
            contactRegistry: 'US EIA Form 860 Schedule 1 (utility registry)'
        };
    });
    out.forEach(function (f) {
        var c = f.utilityId ? companies[f.utilityId] : null;
        if (!c) return;
        c.plants++;
        c.totalKw += Math.round((f.nameplateMw || 0) * 1000);
        if (f.state) c.states[f.state] = (c.states[f.state] || 0) + 1;
    });
    cp.companies = Object.keys(companies).length;

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
        ownerSource: 'US EIA Form 860 Schedule 1 (utility registry), Schedule 3 (generator ' +
                     'ownership code) and Schedule 4 (ownership). Joined on Utility ID and Plant ' +
                     'Code — the primary keys of the form itself, never on a name.',
        // Every one of these carries its own number, so a caveat cannot drift away from the data
        // it describes without a test noticing.
        ownershipNote: 'Who owns the plant comes from the Schedule 3 ownership code, present on ' +
                       'every facility here: ' + cp.sole + ' report single ownership by the ' +
                       'operator, ' + cp.thirdParty + ' are wholly owned by someone else, ' +
                       cp.joint + ' are jointly owned and ' + cp.mixed + ' are mixed across their ' +
                       'generators. An ABSENT Schedule 4 row is not the evidence for sole ' +
                       'ownership — the S code is. ' + cp.soleButOwnerRowExists + ' plants are ' +
                       'coded as solely owned yet carry an ownership row, and ' +
                       cp.thirdPartyOwnerIsOperator + ' are coded as owned by another entity ' +
                       'which then turns out to be the operator. Both contradictions are ' +
                       'reported, not resolved. Note that shares are filed PER GENERATOR, so a ' +
                       'plant with two wholly-owned generators legitimately sums to 200% and ' +
                       'must never be averaged into a single plant-level figure.',
        unitTrap: 'EIA Schedule 4 publishes "Percent Owned" as a FRACTION, not a percentage — ' +
                  'plant 51\'s four owners read 0.5, 0.0586, 0.039 and 0.4024, summing to 1.0. ' +
                  'This artifact emits sharePct already multiplied by 100. Rendering the raw ' +
                  'column would report a 100% owner as owning 1%.',
        contactNote: 'EIA-860 publishes a MAILING ADDRESS and an entity type. It publishes no ' +
                     'telephone number and no named individual, so unlike the Alberta operators ' +
                     'there is no number to call. ' + cp.operatorOutOfState + ' of ' +
                     cp.operatorAddress + ' operator addresses are in a different state from the ' +
                     'plant and ' + cp.operatorPoBox + ' are post boxes: this is the company\'s ' +
                     'filing address, not the site office.',
        addressNote: 'Plant street addresses are as filed. Some carry no house number ' +
                     '("Unnamed Road", a creek, a township), which is what the operator reported ' +
                     'rather than a gap in this artifact.',
        counts: {
            facilities: out.length,
            declining: declines,
            standby: standby,
            plannedRetirement: plannedRetire,
            droppedTooBig: dropped.tooBig,
            droppedNoCapacity: dropped.noCapacity,
            droppedNoLocation: dropped.noLocation,
            droppedNoGeneration: dropped.noGeneration,
            companies: cp.companies,
            operatorsWithMailingAddress: cp.operatorAddress,
            operatorAddressOutOfState: cp.operatorOutOfState,
            operatorAddressPoBox: cp.operatorPoBox,
            plantsWithSiteAddress: cp.siteAddress,
            plantsWithGridVoltage: cp.gridVoltage,
            plantsWithQfDocket: cp.qfDocket,
            ownershipSole: cp.sole,
            ownershipThirdParty: cp.thirdParty,
            ownershipJoint: cp.joint,
            ownershipMixed: cp.mixed,
            ownershipUnknown: cp.ownershipUnknown,
            plantsWithOwnerRows: cp.ownerRows,
            plantsWithMoreThanOneOwner: cp.multiOwner,
            ownershipCodeSaysSoleButSchedule4RowExists: cp.soleButOwnerRowExists,
            ownershipThirdPartyButOwnerIsOperator: cp.thirdPartyOwnerIsOperator,
            plantsWhereGeneratorsDisagreeOnOwners: cp.generatorsDisagreeOnOwners,
            offtakeDisagreesWithRegulatoryStatus: cp.offtakeDisagreesWithRegulatoryStatus
        },
        companies: companies,
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
