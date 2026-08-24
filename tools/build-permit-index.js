// ===== Permit and compliance index — EPA FRS + ECHO =====
//
// Attaches air-permit status and compliance history to the facilities already indexed from
// EIA-860/923, so `permit_state` stops being null. The air permit is the single most valuable
// thing an acquisition inherits — permitting alone runs 3 to 9 months of the 12-24 month
// development timeline — so knowing whether one exists and is active is what separates a real
// acquisition target from a hopeful one.
//
// THE JOIN, and why it is not fuzzy.
//
// EIA plant codes and EPA facility identifiers share no key, and matching ~10,000 power plants by
// name and coordinates is exactly the kind of join that fails silently: an earlier join in this
// codebase matched 1,980 sites to a BLANK operator because a recent unattributed record beat a
// named older one. So no fuzzy matching is used at all.
//
// EPA's Facility Registry Service indexes every facility by the identifiers OTHER programs use
// for it, including EIA-860. Querying FRS with pgm_sys_acrnm=EIA-860 and pgm_sys_id=<plant code>
// resolves an EIA plant code to an EPA Registry ID with a 100% hit rate, measured on a stratified
// sample of 36 plants from 1.1 MW upward.
//
// BUT THAT 100% MEASURES THE WRONG THING, and it is worth being explicit about why, because the
// number is seductive. It establishes "FRS knows this EIA plant", NOT "that registry id appears
// in ECHO's air database". EPA frequently holds MORE THAN ONE registry id for one physical site:
// one minted from the EIA-860 record and a different one used by the air program, unreconciled.
//
// Verified case — EIA plant 1, Sand Point, Alaska:
//   FRS via EIA-860 -> 110070871777  "SAND POINT"
//   ECHO air        -> 110015714716  "SAND POINT GENERATING, LLC / SAND POINT POWER PLANT"
//                                     (FESOP, SIP, TVP — the actual permitted plant)
// Same site, same address, two ids. Joining on the FRS id alone reached ECHO for only 11 of 60
// sampled plants (18%).
//
// The join is therefore EXACT REGISTRY ID ONLY, and its coverage is partial and stated as such.
//
// A spatial fallback was built, measured and REJECTED. It matched an FRS coordinate to an ECHO
// air facility within 1.5 km that also shared a "significant" name token, with generic industry
// words (POWER, PLANT, STATION, ENERGY...) excluded. On the first real sample it produced five
// matches, of which FOUR were wrong:
//
//   SAND POINT            -> TRIDENT SEAFOODS / SAND POINT FACILITY        (fish processor)
//   KETCHIKAN POWER PLANT -> SILVER BAY SEAFOODS, LLC / KETCHIKAN          (fish processor)
//   SEWARD POWER PLANT    -> ALASKA RAILROAD CORPORATION / SEWARD          (railroad)
//   PIGGOTT POWER PLANT   -> LA DARLING COMPANY - PIGGOTT PLANT            (furniture maker)
//   OSCEOLA (AR)          -> ELECTRICAL POWER GENERATOR - OSCEOLA          (correct)
//
// The shared token was a TOWN NAME every time. Excluding industry words does not help, because
// what remains in a small-town facility name is the town. For Sand Point the correct ECHO record
// (SAND POINT GENERATING, LLC) was present and the rule picked the seafood plant instead.
//
// Why the self-check did not catch it, which is the part worth remembering: the check validated
// the fallback on plants that ALREADY had an exact match, where it agreed 10 of 11. But those
// two populations differ systematically. A plant with an ECHO air record is one that HAS an air
// permit; a plant without one usually has no air permit at all, so any spatial candidate for it
// is spurious by construction. Validating on the population where the answer is known says
// nothing about the population where it is not.
//
// Inventing a permit is far worse than reporting none: the air permit is the 3-9 month item, and
// a fabricated one would make an unpermitted site look acquisition-ready.
//
// Rejected alternative, recorded so it is not re-attempted: the USEPA/camd-eia-crosswalk file is
// authoritative and downloads cleanly (6,935 rows, 33 columns, verified byte-for-byte), and it
// establishes the useful fact that CAMD_PLANT_ID equals EIA_PLANT_ID 98.4% of the time. But it
// covers only 102 of our 9,765 facilities — 1.0%. CAMD tracks emissions-monitored plants, whose
// median size is 39.5 MW against 3.9 MW for the ones it misses. Wrong crosswalk for a small-plant
// universe.
//
// Also rejected: the FRS bulk download (FRS_Interests_Download.zip) carries the same mapping but
// is 1.9 GB, which is a poor trade against ~10,000 cached REST calls that run once a quarter.
//
// Usage:
//   node tools/build-permit-index.js [--limit N] [--out data/permits.json]
var https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache', 'frs');
var ECHO_CACHE = path.join(__dirname, '.cache', 'echo');

var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
var OUT = path.resolve(ROOT, arg('out', 'data/permits.json'));
var LIMIT = parseInt(arg('limit', '0'), 10);        // 0 = all
var PACE_MS = parseInt(arg('pace', '300'), 10);     // politeness delay between requests

// EPA publishes no rate limit for these services and returns no rate-limit headers. Absent a
// documented budget the pipeline self-throttles: one request at a time with a delay, which is
// well under any reasonable threshold and takes about an hour for the full run. It caches every
// response, so a re-run costs nothing.
var MAX_RETRIES = 3;
// ECHO's real budget is 300 requests/hour and 1,500/day. It is published nowhere in the response
// headers — see getJson — so the only safe approach is to stay well inside it by pacing. At 500
// rows per page and roughly 2,000 air facilities per state, a national run is about 250 requests,
// so 13 seconds between them fits the whole run inside one hour's allowance.
var ECHO_PACE_MS = parseInt(arg('echo-pace', '13000'), 10);
// A throttle needs minutes, not milliseconds. Retrying after 800ms just burns what is left of
// the allowance faster.
var THROTTLE_WAIT_MS = 12 * 60 * 1000;

function log(s) { console.log(s); }
function progress(s) { if (process.stdout.isTTY) process.stdout.write('\r  ' + s + '          '); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function getJson(url, attempt) {
    attempt = attempt || 1;
    return new Promise(function (resolve) {
        var req = https.get(url, { headers: { 'User-Agent': 'proton-mining/permit-index' } }, function (res) {
            var s = '';
            res.on('data', function (d) { s += d; });
            res.on('end', function () {
                if (res.statusCode !== 200) return resolve({ ok: false, status: res.statusCode, body: s.slice(0, 300) });
                // EPA services answer some failures with an HTML page carrying HTTP 200, so the
                // body is checked rather than the status code.
                var t = s.replace(/^﻿/, '').trimStart();
                if (t.charAt(0) !== '{' && t.charAt(0) !== '[') {
                    return resolve({ ok: false, status: 200, body: 'not JSON: ' + t.slice(0, 120) });
                }
                var parsed;
                try { parsed = JSON.parse(t); }
                catch (e) { return resolve({ ok: false, status: 200, body: 'bad JSON: ' + e.message }); }
                // ECHO enforces 300 requests/hour and reports it in the BODY of a 200 response,
                // with no Retry-After and no X-RateLimit header. A probe that inspects status
                // codes and headers sees a perfectly healthy service. A first national run lost
                // 42 of 51 states to this while every request "succeeded".
                var errMsg = (parsed && parsed.Results && parsed.Results.Error)
                    ? String(parsed.Results.Error.ErrorMessage || '') : '';
                if (/throttle|exceed .*per hour|too many request/i.test(errMsg)) {
                    return resolve({ ok: false, status: 429, throttled: true, body: errMsg.slice(0, 200) });
                }
                if (errMsg) return resolve({ ok: false, status: 200, body: errMsg.slice(0, 200) });
                resolve({ ok: true, status: 200, json: parsed });
            });
        });
        req.on('error', function (e) { resolve({ ok: false, status: 0, body: e.code || e.message }); });
        req.setTimeout(60000, function () { req.destroy(); resolve({ ok: false, status: -1, body: 'timeout' }); });
    }).then(function (r) {
        if (r.ok || attempt >= MAX_RETRIES) return r;
        // Transient failures get a backoff. A definitive 404 does not.
        if (r.status === 404) return r;
        var wait = r.throttled ? THROTTLE_WAIT_MS * attempt : 800 * attempt;
        if (r.throttled) log('\n  ECHO throttled — waiting ' + Math.round(wait / 60000) + ' min');
        return sleep(wait).then(function () { return getJson(url, attempt + 1); });
    });
}

function cachePath(dir, key) {
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, String(key).replace(/[^A-Za-z0-9_-]/g, '_') + '.json');
}
function readCache(dir, key) {
    var p = cachePath(dir, key);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
function writeCache(dir, key, val) {
    try { fs.writeFileSync(cachePath(dir, key), JSON.stringify(val)); } catch (e) {}
}

// ---- FRS: EIA plant code -> EPA registry id ---------------------------------------------
function frsUrl(plantCode) {
    return 'https://ordspub.epa.gov/ords/frs_public2/frs_rest_services.get_facilities' +
           '?pgm_sys_acrnm=EIA-860&pgm_sys_id=' + encodeURIComponent(plantCode) + '&output=JSON';
}

async function resolveRegistryId(plantCode) {
    var cached = readCache(CACHE, plantCode);
    if (cached) return cached;
    var r = await getJson(frsUrl(plantCode));
    var out;
    if (!r.ok) {
        out = { ok: false, error: r.body || ('HTTP ' + r.status) };
    } else {
        var list = (r.json && r.json.Results && r.json.Results.FRSFacility) || [];
        if (!list.length) out = { ok: true, found: false };
        else {
            var f = list[0];
            out = {
                ok: true, found: true,
                registryId: String(f.RegistryId || ''),
                frsName: f.FacilityName || null,
                frsLat: f.Latitude83 !== undefined ? Number(f.Latitude83) : null,
                frsLon: f.Longitude83 !== undefined ? Number(f.Longitude83) : null,
                // More than one FRS record for one plant code is worth knowing about rather than
                // silently taking the first.
                multiple: list.length > 1 ? list.length : 0
            };
        }
    }
    writeCache(CACHE, plantCode, out);
    return out;
}

// ---- ECHO: the national bulk export -------------------------------------------------------
// The per-state REST API cannot complete a national run. ECHO allows 300 requests/hour and
// 1,500/day, reports the throttle in the BODY of a 200 response, and a national pass needs ~255
// requests. Two attempts got 9 of 51 states and then 24 of 51 before exhausting the DAILY
// budget. EPA's own throttle message points at the answer: "ECHO has exports of bulk data
// available for download."
//
// ICIS-AIR_downloads.zip is 68 MB and carries every field the API was being asked for -
// REGISTRY_ID (the exact key EIA plant codes already resolve to), air pollutant class, operating
// status and current HPV - for the whole country, with no rate limit at all. One download
// replaces 255 throttled calls and covers 51 states instead of 24.
var ICIS_AIR_URL = 'https://echo.epa.gov/files/echodownloads/ICIS-AIR_downloads.zip';

function zipMember(buf, name) {
    var i = buf.length - 22;
    while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
    if (i < 0) return null;
    var n = buf.readUInt16LE(i + 10), p = buf.readUInt32LE(i + 16);
    for (var k = 0; k < n; k++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        var nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
        var nm = buf.slice(p + 46, p + 46 + nl).toString();
        if (nm === name) {
            var lho = buf.readUInt32LE(p + 42), meth = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20);
            var lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
            var raw = buf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + cs);
            return meth === 0 ? raw : zlib.inflateRawSync(raw);
        }
        p += 46 + nl + el + cl;
    }
    return null;
}

// Streaming CSV reader. These members reach 200 MB inflated, so rows are yielded one at a time
// rather than the whole file being split into an array of strings.
function eachCsvRow(buf, onRow) {
    var text = buf.toString('utf8');
    var i = 0, n = text.length, field = '', row = [], inQ = false, first = true, header = null;
    while (i <= n) {
        var ch = i < n ? text[i] : '\n';
        if (inQ) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQ = false;
            } else field += ch;
        } else if (ch === '"') { inQ = true; }
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') {
                if (first) { header = row; first = false; }
                else if (onRow(row, header) === false) return;
            }
            row = [];
        } else field += ch;
        i++;
    }
}

function downloadBinary(url, dest) {
    return new Promise(function (resolve, reject) {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) return resolve(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        var tmp = dest + '.part', file = fs.createWriteStream(tmp);
        https.get(url, { headers: { 'User-Agent': 'proton-mining/permit-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                return resolve(downloadBinary(new URL(res.headers.location, url).href, dest));
            }
            if (res.statusCode !== 200) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                return reject(new Error('HTTP ' + res.statusCode));
            }
            var total = parseInt(res.headers['content-length'] || '0', 10), got = 0;
            res.on('data', function (c) {
                got += c.length;
                if (total) progress('ICIS-AIR bulk ' + Math.round(100 * got / total) + '%');
            });
            res.pipe(file);
            file.on('finish', function () { file.close(function () { fs.renameSync(tmp, dest); resolve(dest); }); });
        }).on('error', function (e) { try { fs.unlinkSync(tmp); } catch (e2) {} reject(e); });
    });
}

// Returns { registryId -> facility } for the whole country.
async function loadEchoBulk() {
    var dest = path.join(__dirname, '.cache', 'ICIS-AIR_downloads.zip');
    await downloadBinary(ICIS_AIR_URL, dest);
    if (process.stdout.isTTY) process.stdout.write('\r');
    var buf = fs.readFileSync(dest);
    if (buf[0] !== 0x50 || buf[1] !== 0x4B) throw new Error('ICIS-AIR download is not a zip');

    var facBuf = zipMember(buf, 'ICIS-AIR_FACILITIES.csv');
    if (!facBuf) throw new Error('ICIS-AIR_FACILITIES.csv not found in the archive');

    var byRegistry = {}, rows = 0;
    eachCsvRow(facBuf, function (r, h) {
        rows++;
        if (!h) return;
        // Resolve columns by NAME. Positions in EPA exports move between releases.
        if (!eachCsvRow.idx) {
            eachCsvRow.idx = {};
            for (var c = 0; c < h.length; c++) eachCsvRow.idx[h[c].replace(/"/g, '').trim().toUpperCase()] = c;
        }
        var I = eachCsvRow.idx;
        var rid = String(r[I.REGISTRY_ID] || '').trim();
        if (!rid) return;
        // A registry id can appear more than once (multiple air permits at one site). Keep the
        // record with an operating status over one without, so a live permit is not shadowed by
        // a stale row for the same place.
        var existing = byRegistry[rid];
        var status = String(r[I.AIR_OPERATING_STATUS_DESC] || '').trim();
        if (existing && existing.AIRStatus && !status) return;
        byRegistry[rid] = {
            AIRName: r[I.FACILITY_NAME] || null,
            RegistryID: rid,
            AIRIDs: r[I.PGM_SYS_ID] || null,
            AIRClassification: r[I.AIR_POLLUTANT_CLASS_DESC] || null,
            AIRStatus: status || null,
            AIRHpvStatus: r[I.CURRENT_HPV] || null,
            AIRNAICS: r[I.NAICS_CODES] || null,
            // The bulk facilities table carries no program list, so Title V is filled from the
            // programs member below rather than being guessed from the class.
            AIRPrograms: null,
            AIRComplStatus: r[I.CURRENT_HPV] || null,
            AIRQtrsWithViol: null,
            AIRRecentViolCnt: null,
            AIRLastViolDate: null
        };
    });
    eachCsvRow.idx = null;

    // Title V status, which is what separates 'active' from 'active_long_dated'.
    var progBuf = zipMember(buf, 'ICIS-AIR_PROGRAMS.csv');
    var titleV = 0;
    if (progBuf) {
        var pidx = null;
        eachCsvRow(progBuf, function (r, h) {
            if (!pidx) {
                pidx = {};
                for (var c = 0; c < h.length; c++) pidx[h[c].replace(/"/g, '').trim().toUpperCase()] = c;
            }
            var pid = String(r[pidx.PGM_SYS_ID] || '').trim();
            var code = String(r[pidx.PROGRAM_CODE] || r[pidx.AIR_PROGRAM_CODE] || '').trim().toUpperCase();
            if (!pid || !code) return;
            // Programs key on PGM_SYS_ID, so build a lookup from that back to the registry row.
            if (!loadEchoBulk.byPgm) {
                loadEchoBulk.byPgm = {};
                for (var k in byRegistry) {
                    if (byRegistry[k].AIRIDs) loadEchoBulk.byPgm[byRegistry[k].AIRIDs] = byRegistry[k];
                }
            }
            var f = loadEchoBulk.byPgm[pid];
            if (!f) return;
            f.AIRPrograms = f.AIRPrograms ? (f.AIRPrograms + ', ' + code) : code;
            if (code === 'TVP' || code === 'TV') titleV++;
        });
    }
    loadEchoBulk.byPgm = null;
    return { byRegistry: byRegistry, rows: rows, titleV: titleV };
}

// ---- Interpreting ECHO's air fields -------------------------------------------------------
// Mapped ONLY from values actually observed in responses. Where the data cannot distinguish a
// case, the result is null and the reason is recorded — a fabricated permit status would put a
// confident number on the most valuable thing an acquisition inherits.
//
// AIRClassification: 'MAJOR' | 'SM' (synthetic minor) | 'MINOR' | 'UNKNOWN'
// AIRPrograms: comma-separated program codes, e.g. "SIP, TVP" (Title V Permit)
// AIROperatingStatus / AIRComplStatus / AIRHpvStatus: compliance and operating state
function permitClassOf(f) {
    // Observed in a live response: "Major Emissions", "Minor Emissions",
    // "Synthetic Minor Emissions", "80% Synthetic Minor Emissions", "No Classification In ICIS".
    // Not the MAJOR/SM/MINOR codes the documentation implies.
    var c = String(f.AIRClassification || '').toLowerCase();
    if (c.indexOf('synthetic minor') >= 0) return 'synthetic_minor';   // tested before 'minor'
    if (c.indexOf('major') >= 0) return 'major';
    if (c.indexOf('minor') >= 0) return 'minor';
    return 'unknown';
}

function permitStateOf(f) {
    // Observed AIRStatus values: "Operating", "Permanently Closed", "Temporarily Closed",
    // "Planned Facility", "No Operating Status In ICIS".
    var status = String(f.AIRStatus || '').toLowerCase();
    var programs = String(f.AIRPrograms || '').toUpperCase();
    var hasTitleV = programs.indexOf('TVP') >= 0;

    // A permanently closed facility holds no current operating permit. NULL, not a stale
    // 'active' — this field says whether the 3-9 month permitting item is already done, and an
    // optimistic error here is the expensive one.
    if (status.indexOf('permanently closed') >= 0) return null;
    // Built and permitted, not currently running. The permit record stands.
    if (status.indexOf('temporarily closed') >= 0) return programs ? 'active' : null;
    // Not yet built, so there is nothing to inherit.
    if (status.indexOf('planned') >= 0) return null;
    if (status.indexOf('operating') >= 0) {
        // Title V permits run five years and are actively renewed, so a Title V source is
        // long-dated in the sense that matters: the permit exists and is being maintained.
        return hasTitleV ? 'active_long_dated' : (programs ? 'active' : 'none_required');
    }
    // ECHO knows the facility but publishes no operating status for it.
    if (!programs) return 'none_required';
    return null;
}

function violationsOf(f) {
    var out = [];
    var hpv = String(f.AIRHpvStatus || '').trim();
    var qtrs = Number(f.AIRQtrsWithViol || 0);
    var recent = Number(f.AIRRecentViolCnt || 0);
    var last = String(f.AIRLastViolDate || '').trim() || null;
    var hpvBad = hpv && !(/^(no violation|na|n\/a)/i).test(hpv);

    if (hpvBad) {
        out.push({ severity: 'high', detail: 'High priority violation: ' + hpv, last: last });
    } else if (qtrs > 0) {
        out.push({ severity: 'normal',
                   detail: qtrs + ' of the last 12 quarters with a violation' +
                           (recent ? ', ' + recent + ' recent' : ''),
                   last: last });
    }
    return out;
}

// A facility EPA lists as closed is not producing, whatever EIA's generator status says.
// Reported separately from violations because it is a different kind of finding: a closed plant
// is AVAILABLE, not merely troubled.
function closureSignalOf(f) {
    var status = String(f.AIRStatus || '').toLowerCase();
    if (status.indexOf('permanently closed') >= 0) {
        return { closed: 'permanent', detail: 'EPA ECHO reports this facility permanently closed' };
    }
    if (status.indexOf('temporarily closed') >= 0) {
        return { closed: 'temporary', detail: 'EPA ECHO reports this facility temporarily closed' };
    }
    return null;
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
    log('permit index — EPA FRS + ECHO');
    log('  out   ' + path.relative(ROOT, OUT));
    log('');

    var facPath = path.join(ROOT, 'data', 'facilities.json');
    if (!fs.existsSync(facPath)) throw new Error('run tools/build-facility-index.js first');
    var facilities = JSON.parse(fs.readFileSync(facPath, 'utf8')).facilities;
    if (LIMIT > 0) facilities = facilities.slice(0, LIMIT);
    log('[1/3] resolving ' + facilities.length.toLocaleString() + ' EIA plant codes to EPA registry ids');

    var registry = {}, frsHit = 0, frsMiss = 0, frsErr = 0, frsMulti = 0, fromCache = 0;
    for (var i = 0; i < facilities.length; i++) {
        var f = facilities[i];
        var had = readCache(CACHE, f.plantCode) !== null;
        var r = await resolveRegistryId(f.plantCode);
        if (had) fromCache++; else await sleep(PACE_MS);
        if (!r.ok) frsErr++;
        else if (!r.found) frsMiss++;
        else {
            frsHit++;
            if (r.multiple) frsMulti++;
            registry[f.plantCode] = r;
        }
        if (i % 25 === 0) {
            progress((i + 1) + '/' + facilities.length + '  matched ' + frsHit +
                     '  missed ' + frsMiss + '  errors ' + frsErr + '  (cached ' + fromCache + ')');
        }
    }
    if (process.stdout.isTTY) process.stdout.write('\r');
    log('  matched ' + frsHit.toLocaleString() + '  missed ' + frsMiss.toLocaleString() +
        '  errors ' + frsErr.toLocaleString() + '  multiple-record ' + frsMulti);

    log('[2/3] loading the ECHO national air bulk export');
    var bulk = await loadEchoBulk();
    var byRegistry = bulk.byRegistry, echoErrors = [];
    log('  ' + Object.keys(byRegistry).length.toLocaleString() + ' air facilities nationwide from ' +
        bulk.rows.toLocaleString() + ' rows' +
        (bulk.titleV ? '  (' + bulk.titleV.toLocaleString() + ' Title V programs)' : ''));


    log('[3/3] joining and deriving permit state');
    var out = [], joined = 0, noEcho = 0, permitCounts = {}, classCounts = {}, viol = 0, closed = 0;
    facilities.forEach(function (f) {
        var reg = registry[f.plantCode];
        if (!reg) return;

        // Exact registry id only. See the header for the rejected spatial fallback.
        var ef = byRegistry[reg.registryId];
        if (!ef) { noEcho++; return; }
        joined++;
        var pstate = permitStateOf(ef);
        var pclass = permitClassOf(ef);
        var vs = violationsOf(ef);
        var closure = closureSignalOf(ef);
        permitCounts[pstate] = (permitCounts[pstate] || 0) + 1;
        classCounts[pclass] = (classCounts[pclass] || 0) + 1;
        if (vs.length) viol++;
        if (closure) closed++;
        out.push({
            id: 'eia_' + f.plantCode,
            plantCode: f.plantCode,
            registryId: reg.registryId,
            echoRegistryId: String(ef.RegistryID || ef.RegistryId || '') || null,
            // Always 'registry'. Kept as an explicit field so any future inferred match can never
            // be mistaken for a verified one.
            matchTier: 'registry',
            frsName: reg.frsName,
            echoName: ef.AIRName || null,
            permitState: pstate,
            airPermitClass: pclass,
            airPrograms: ef.AIRPrograms || null,
            permitIds: String(ef.AIRIDs || '').split(/[,;]\s*/).filter(Boolean),
            operatingStatus: ef.AIRStatus || null,
            complianceStatus: ef.AIRComplStatus || null,
            hpvStatus: ef.AIRHpvStatus || null,
            quartersWithViolations: ef.AIRQtrsWithViol === undefined ? null : Number(ef.AIRQtrsWithViol),
            lastViolationDate: ef.AIRLastViolDate || null,
            violations: vs,
            closure: closure
        });
    });
    out.sort(function (a, b) { return a.plantCode - b.plantCode; });

    var payload = sortKeys({
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'EPA Facility Registry Service (EIA-860 cross-reference) joined to the EPA ECHO ' +
                'ICIS-AIR national bulk export',
        joinNote: 'EIA plant codes are resolved to EPA registry ids through FRS, which indexes ' +
                  'facilities by the identifiers other programs use for them. This is an ' +
                  'authoritative lookup published by EPA, NOT a name or distance match. Measured ' +
                  'on a stratified sample of 36 plants from 1.1 MW upward: 36 matched, 0 missed.',
        permitNote: 'permitState is derived only from field values actually observed in ECHO ' +
                    'responses. A facility ECHO knows but reports no air program for is ' +
                    'none_required, which for a small generator is a real finding. A permanently ' +
                    'closed facility yields null rather than a stale permit status.',
        counts: {
            facilitiesConsidered: facilities.length,
            registryMatched: frsHit,
            registryMissed: frsMiss,
            registryErrors: frsErr,
            multipleFrsRecords: frsMulti,
            echoFacilities: Object.keys(byRegistry).length,
            joined: joined,
            matchedButNotInEcho: noEcho,
            withViolations: viol,
            reportedClosed: closed,
            byPermitState: permitCounts,
            byPermitClass: classCounts,
            echoStateErrors: echoErrors.length
        },
        matchNote: 'Every match is an EXACT EPA RegistryID equality. EPA holds more than one ' +
                   'registry id for many physical sites - one minted from the EIA-860 record and ' +
                   'another used by the air program - so this reaches a minority of plants and ' +
                   'the rest correctly report permit state as unknown. A spatial-plus-name ' +
                   'fallback was built and rejected: it matched 4 of 5 plants to unrelated ' +
                   'businesses that merely shared a town name. Unmatched here does NOT mean ' +
                   'unpermitted; it means not verified.',
        echoErrors: echoErrors,
        permits: out
    });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;

    log('');
    log('  joined                ' + joined.toLocaleString() + ' of ' + facilities.length.toLocaleString());
    log('  registry matched      ' + frsHit.toLocaleString() + '  (' + (100 * frsHit / facilities.length).toFixed(1) + '%)');
    log('  matched, not in ECHO  ' + noEcho.toLocaleString());
    log('  with violations       ' + viol.toLocaleString());
    log('  EPA reports closed    ' + closed.toLocaleString());
    Object.keys(permitCounts).sort().forEach(function (k) {
        log('    permit ' + String(k).padEnd(20) + permitCounts[k]);
    });
    log('  size                  ' + Math.round(raw / 1024) + ' KB  (' + Math.round(gz / 1024) + ' KB gzipped)');
    log('');
    log('wrote ' + path.relative(ROOT, OUT));
})().catch(function (e) {
    console.error('\nFAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
