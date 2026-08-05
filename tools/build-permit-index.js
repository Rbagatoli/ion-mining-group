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
        var req = https.get(url, { headers: { 'User-Agent': 'ion-mining-group/permit-index' } }, function (res) {
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

// ---- ECHO: permits and violations, queried by state ---------------------------------------
// All air facilities per state, paged 500 at a time, rather than ~10,000 per-facility calls.
// Roughly 2,000 facilities per state, so about 250 requests for the whole country.
//
// The obvious optimisation — restricting to NAICS 2211, electric power generation — is
// DELIBERATELY NOT USED. Measured on a 60-plant sample it dropped 5 of 14 combustion plants,
// because a generator can be classified under the NAICS of its host site: a landfill genset under
// waste management, a campus plant under education. The join itself is on RegistryID and is
// therefore exact, so casting a wider net costs bandwidth and cannot introduce a false match.
// Filtering the query would have silently lost real permits.
// Column ids from air_rest_services.metadata. The DEFAULT column set contains none of the
// permit or violation fields — a query without qcolumns returns names and addresses and looks
// perfectly successful while carrying nothing this pipeline needs.
//   1 AIRName · 8 RegistryID · 22 AIRNAICS · 25 AIRPrograms · 27 AIRStatus
//   29 AIRClassification · 35 AIRIDs · 44 AIRComplStatus · 45 AIRHpvStatus
//   48 AIRQtrsWithViol · 50 AIRRecentViolCnt · 51 AIRLastViolDate · 108 ViolFlag
// 23 FacLat and 24 FacLong are REQUIRED for the spatial fallback. Omitting them does not fail —
// ECHO returned FacLat anyway as part of its default set but not FacLong, so every distance
// computed to NaN and the fallback silently matched nothing. The self-check is what exposed it:
// 11 of 11 known-correct plants came back "no candidate".
var ECHO_COLUMNS = '1,8,22,23,24,25,27,29,35,44,45,48,50,51,108';

// responseset must be set on the INITIAL get_facilities call: it fixes the page size for the
// whole QueryID, and passing it only to get_qid silently returns ONE row per page. That is how
// a first run reported 8 facilities across 8 states while ECHO held 259 for California alone.
var ECHO_PAGE = 500;

function echoQueryUrl(state) {
    return 'https://echodata.epa.gov/echo/air_rest_services.get_facilities?output=JSON' +
           '&p_st=' + encodeURIComponent(state) +
           '&responseset=' + ECHO_PAGE + '&qcolumns=' + ECHO_COLUMNS;
}
function echoPageUrl(qid, pageno) {
    return 'https://echodata.epa.gov/echo/air_rest_services.get_qid?output=JSON&qid=' +
           encodeURIComponent(qid) + '&pageno=' + pageno +
           '&responseset=' + ECHO_PAGE + '&qcolumns=' + ECHO_COLUMNS;
}

async function fetchStateFacilities(state) {
    var cached = readCache(ECHO_CACHE, state);
    if (cached) return cached;

    var q = await getJson(echoQueryUrl(state));
    if (!q.ok) {
        // Deliberately NOT cached. A cached failure is permanent, because the cache is checked
        // before the request is made — which is exactly how 42 throttled states would have
        // stayed broken across every future run.
        return { ok: false, error: q.body || ('HTTP ' + q.status), facilities: [] };
    }
    var res = (q.json && (q.json.Results || q.json.results)) || {};
    var qid = res.QueryID || res.queryID || null;
    var total = Number(res.QueryRows || res.queryRows || 0);
    if (!qid || !total) {
        var empty = { ok: true, facilities: [], total: 0 };
        writeCache(ECHO_CACHE, state, empty);
        return empty;
    }

    var out = [], pages = Math.ceil(total / 500);
    for (var p = 1; p <= pages; p++) {
        await sleep(ECHO_PACE_MS);
        var pr = await getJson(echoPageUrl(qid, p));
        if (!pr.ok) break;
        var rows = (pr.json && pr.json.Results && (pr.json.Results.Facilities || pr.json.Results.facilities)) || [];
        for (var i = 0; i < rows.length; i++) out.push(rows[i]);
    }
    var result = { ok: true, facilities: out, total: total };
    // Only cache a state that actually returned rows.
    if (out.length) writeCache(ECHO_CACHE, state, result);
    return result;
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

    log('[2/3] pulling ECHO air permits and violations by state');
    var states = {};
    facilities.forEach(function (f) { if (f.state) states[f.state] = 1; });
    var stateList = Object.keys(states).sort();
    var byRegistry = {}, echoErrors = [];
    for (var s = 0; s < stateList.length; s++) {
        progress('state ' + (s + 1) + '/' + stateList.length + '  ' + stateList[s]);
        var r2 = await fetchStateFacilities(stateList[s]);
        if (!r2.ok) { echoErrors.push({ state: stateList[s], error: r2.error }); continue; }
        for (var k = 0; k < r2.facilities.length; k++) {
            var ef = r2.facilities[k];
            var rid = String(ef.RegistryID || ef.RegistryId || '').trim();
            if (rid) byRegistry[rid] = ef;
        }
        await sleep(ECHO_PACE_MS);
    }
    if (process.stdout.isTTY) process.stdout.write('\r');
    log('  ' + Object.keys(byRegistry).length.toLocaleString() + ' ECHO air facilities across ' +
        stateList.length + ' states' + (echoErrors.length ? '  (' + echoErrors.length + ' states failed)' : ''));


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
        source: 'EPA Facility Registry Service (EIA-860 cross-reference) joined to EPA ECHO air services',
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
