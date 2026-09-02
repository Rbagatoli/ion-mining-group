// ===== Landfill gas index — EPA LMOP =====
//
// The Landfill Methane Outreach Program database, which tracks every landfill gas project in the
// US through its whole lifecycle. The lifecycle is the point: LMOP records not just candidate
// landfills but projects that were BUILT and later SHUT DOWN, and those are the most acquirable
// assets in this entire module.
//
// A shutdown LFG project means the waste is still decomposing and still producing gas, the gas
// collection system is already in the ground, the generator was installed, the interconnection
// was made and the air permit was issued — and then the project stopped, usually because the
// power offtake stopped being economic. For a buyer who wants continuous cheap power on site
// rather than an export contract, that is close to an ideal starting point.
//
// CORRECTION TO AN EARLIER ASSUMPTION recorded here deliberately: an earlier plan for this module
// focused on LMOP's 444 "Candidate" landfills and assumed they averaged 1-1.5 MW. The measured
// candidate file gives a median of 0.4 MW with only 23% inside a 1-3 MW band. The real prize is
// the 712 shutdown and 669 operational PROJECTS, which are far further along and better sized.
//
// Usage:
//   node tools/build-landfill-index.js [--out data/landfills.json]
var https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib');
var xlsx = require(path.join(__dirname, 'xlsx-lite.js'));

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache');

var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
var OUT = path.resolve(ROOT, arg('out', 'data/landfills.json'));

// EPA moves these files between quarterly releases; the landing page is scraped for the current
// link rather than the URL being hardcoded, because a stale hardcoded path returns a styled 404
// page with HTTP 200 rather than an error.
var LMOP_PAGE = 'https://www.epa.gov/lmop/landfill-technical-data';
var LMOP_FALLBACK = 'https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx';

// Landfill gas is roughly 50% methane at ~500 BTU/cf against ~1,000 BTU/cf for pipeline natural
// gas, so a given volume carries half the energy. At ~35% electrical efficiency in a
// reciprocating engine this works out to about 2.08 MW of continuous electrical output per
// million standard cubic feet per day. Used ONLY where EPA publishes no rated capacity.
var MW_PER_MMSCFD = 2.08;

// LMOP project status -> how far along the physical asset is.
//
// 'Shutdown' maps to `constructed`, NOT to a lower stage: the gas collection system, the
// generator, the interconnection and the permits were all built and mostly still exist. That is
// materially further along than a candidate landfill with nothing on site.
var STAGE_BY_STATUS = {
    'operational':      'operating',
    'construction':     'constructed',
    'shutdown':         'constructed',
    'planned':          'permitted',
    'candidate':        'raw_resource',
    'future potential': 'raw_resource',
    'low potential':    'raw_resource',
    // The landfill-inventory sweep below: a landfill with gas and no LMOP project row. Nothing
    // is on site beyond whatever collection the record itself reports, so it enters at the
    // bottom of the ladder like a candidate.
    'no project':       'raw_resource',
    'unknown':          null              // genuinely unknown, and scored as unknown
};

// Waste in place -> continuous electrical potential, used ONLY when EPA publishes no gas figure
// of any kind. ~0.78 MW per million tons is the first-order rule of thumb EPA's own LFGcost
// screening uses for a producing landfill; it is a SCREEN, not a forecast, and every record
// priced with it says so in capacityBasis. Before this fallback existed, any row without a
// measured gas figure was dropped outright -- 1,483 of the 2,641 landfills in EPA's inventory,
// including all 204 EPA-flagged Candidates, never entered the index at all.
var MW_PER_MILLION_TONS_WIP = 0.78;

function log(s) { console.log(s); }
function progress(s) { if (process.stdout.isTTY) process.stdout.write('\r  ' + s + '   '); }

function fetchText(url, redirects) {
    return new Promise(function (resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'proton-mining/landfill-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy();
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(fetchText(new URL(res.headers.location, url).href, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) { res.destroy(); return reject(new Error('HTTP ' + res.statusCode)); }
            var s = '';
            res.on('data', function (c) { s += c; });
            res.on('end', function () { resolve(s); });
        }).on('error', reject);
    });
}

function download(url, dest, redirects) {
    return new Promise(function (resolve, reject) {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return resolve(dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        var tmp = dest + '.part', file = fs.createWriteStream(tmp);
        https.get(url, { headers: { 'User-Agent': 'proton-mining/landfill-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(download(new URL(res.headers.location, url).href, dest, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) {
                file.close(); try { fs.unlinkSync(tmp); } catch (e) {}
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            }
            res.pipe(file);
            file.on('finish', function () { file.close(function () { fs.renameSync(tmp, dest); resolve(dest); }); });
        }).on('error', function (e) { try { fs.unlinkSync(tmp); } catch (e2) {} reject(e); });
    });
}

// An .xlsx is a zip. A 404 page is not. Same check the EIA pipeline needs, for the same reason.
function isZip(file) {
    var fd;
    try {
        fd = fs.openSync(file, 'r');
        var b = Buffer.alloc(2);
        return fs.readSync(fd, b, 0, 2, 0) === 2 && b[0] === 0x50 && b[1] === 0x4B;
    } catch (e) { return false; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch (e2) {} } }
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

// Excel stores dates as days since 1899-12-30 in the 1900 date system. LMOP exports them as bare
// serial numbers.
//
// The range guard is load-bearing, not defensive padding: this file contains at least one row
// whose shutdown "date" is the literal value 38, which would decode to 1900-02-07 and then be
// rendered as a real shutdown date almost 130 years old. Anything outside roughly 1970-2070 is
// treated as corrupt and dropped.
var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function excelDate(v) {
    var n = num(v);
    if (n === null) return null;
    if (n < 25569 || n > 62000) return null;      // 1970-01-01 .. ~2069
    var ms = EXCEL_EPOCH + Math.round(n) * 86400000;
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function headerIndex(rows) {
    for (var i = 0; i < Math.min(10, rows.length); i++) {
        if ((rows[i] || []).filter(function (c) { return c !== null && c !== ''; }).length > 8) return i;
    }
    return 0;
}
function colFinder(hdr) {
    var norm = hdr.map(function (h) {
        return String(h === null || h === undefined ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase();
    });
    return function (frag) {
        var f = String(frag).toLowerCase();
        for (var i = 0; i < norm.length; i++) if (norm[i].indexOf(f) === 0) return i;
        for (var j = 0; j < norm.length; j++) if (norm[j].indexOf(f) >= 0) return j;
        return -1;
    };
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
function round(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    var f = Math.pow(10, dp);
    return Math.round(v * f) / f;
}

(async function main() {
    log('landfill gas index — EPA LMOP');
    log('  out  ' + path.relative(ROOT, OUT));
    log('');

    log('[1/3] resolving the current LMOP download link');
    var url = LMOP_FALLBACK;
    try {
        var html = await fetchText(LMOP_PAGE);
        // The slash is REQUIRED. EPA publishes three files whose names all end in
        // "lmopdata.xlsx" — lmopdata.xlsx (projects, what this wants),
        // landfilllmopdata.xlsx (landfills) and candlfslmopdata.xlsx (candidates) — so a
        // pattern without the separator silently matches the wrong one. It did: the first run
        // downloaded the landfill table and only failed because its columns did not match.
        var re = /href="([^"]*\/lmopdata\.xlsx)"/i, m = re.exec(html);
        if (m) {
            url = new URL(m[1], LMOP_PAGE).href;
            log('  found ' + url);
        } else {
            log('  no link on the page — using the last known URL');
        }
    } catch (e) {
        log('  landing page unreachable (' + e.message + ') — using the last known URL');
    }

    /* THE CACHE IS KEYED TO THE RELEASE, NOT TO THE FILENAME. download() reuses any existing
       file, which was right until the day EPA shipped a new release: the scraper would resolve
       the new URL and download() would silently hand back the old workbook forever. The release
       date lives in EPA's URL path (/documents/2024-09/...), so it becomes part of the cache
       name and a new release misses the cache by construction. */
    function releaseTag(u) {
        var m = /\/(\d{4}-\d{2})\//.exec(u);
        return m ? m[1] : 'undated';
    }
    var dest = path.join(CACHE, 'lmop-projects-' + releaseTag(url) + '.xlsx');
    await download(url, dest);
    if (!isZip(dest)) {
        try { fs.unlinkSync(dest); } catch (e) {}
        throw new Error('downloaded file is not an xlsx — the URL probably returned an error page');
    }
    log('  ' + Math.round(fs.statSync(dest).size / 1024) + ' KB');

    /* THE OTHER WORKBOOK — the landfill INVENTORY, ~2,641 landfills, of which the projects file
       covers fewer than half. This is where the sites with gas and no project live: a landfill
       collecting and FLARING gas with no energy project is the most approachable prospect class
       there is (the owner is paying to destroy the resource), and every one of them is in this
       file and absent from the other. Resolved by the same scrape with the same slash rule, and
       the whole sweep degrades gracefully: if this workbook cannot be fetched the build still
       produces the project index and says what it could not add. */
    var lfUrl = url.replace(/\/lmopdata\.xlsx$/i, '/landfilllmopdata.xlsx');
    var lfDest = path.join(CACHE, 'lmop-landfills-' + releaseTag(lfUrl) + '.xlsx');
    var lfRows = null;
    try {
        await download(lfUrl, lfDest);
        if (!isZip(lfDest)) {
            try { fs.unlinkSync(lfDest); } catch (e2) {}
            throw new Error('not an xlsx');
        }
        lfRows = xlsx.read(fs.readFileSync(lfDest)).sheet('LMOP Database') || null;
        log('  landfill inventory: ' + (lfRows ? (lfRows.length - 1) + ' rows' : 'sheet not found'));
    } catch (e) {
        log('  landfill inventory unavailable (' + e.message + ') — sweep skipped this build');
    }

    /* The inventory, indexed by landfill id. Two consumers: coordinate recovery for project
       rows whose own lat/lon cells are blank (the project sits ON the landfill, and the
       inventory carries coordinates for nearly every landfill — this alone recovers shutdown
       projects that were dropped for a blank cell, including a 5.2 MW one), and the no-project
       sweep after the main loop. */
    var lfIndex = {};
    if (lfRows && lfRows.length > 1) {
        var lhi = headerIndex(lfRows), lcol = colFinder(lfRows[lhi] || []);
        var lc = {
            lfid: lcol('landfill id'), ghgrp: lcol('ghgrp id'), name: lcol('landfill name'),
            state: lcol('state'), address: lcol('physical address'), city: lcol('city'),
            county: lcol('county'), zip: lcol('zip'),
            lat: lcol('latitude'), lon: lcol('longitude'),
            ownership: lcol('ownership type'), owner: lcol('landfill owner'),
            operator: lcol('landfill operator'),
            opened: lcol('year landfill opened'), closure: lcol('landfill closure year'),
            lfStatus: lcol('current landfill status'),
            wip: lcol('waste in place'),
            generated: lcol('lfg generated'), collSystem: lcol('lfg collection system'),
            collected: lcol('lfg collected'), flared: lcol('lfg flared')
        };
        for (var li = lhi + 1; li < lfRows.length; li++) {
            var lr = lfRows[li];
            var lid = str(lr[lc.lfid]);
            if (lid) lfIndex[lid] = { r: lr, c: lc };
        }
    }

    log('[2/3] reading the project database');
    var rows = xlsx.read(fs.readFileSync(dest)).sheet('LMOP Database') || [];
    if (!rows.length) throw new Error('LMOP Database sheet not found');
    var hi = headerIndex(rows), col = colFinder(rows[hi] || []);

    var c = {
        ghgrp: col('ghgrp id'), lfid: col('landfill id'), name: col('landfill name'),
        state: col('state'), address: col('physical address'), city: col('city'),
        county: col('county'), zip: col('zip'),
        lat: col('latitude'), lon: col('longitude'),
        ownership: col('ownership type'), owner: col('landfill owner'),
        opened: col('year landfill opened'), closure: col('landfill closure year'),
        lfStatus: col('current landfill status'),
        wip: col('waste in place'), collSystem: col('lfg collection system'),
        collected: col('lfg collected'), flared: col('lfg flared'),
        projectId: col('project id'), status: col('current project status'),
        projectName: col('project name'),
        start: col('project start date'), shutdown: col('project shutdown date'),
        projType: col('lfg energy project type'),
        actualMw: col('actual mw generation'), ratedMw: col('rated mw capacity'),
        flowToProject: col('lfg flow to project')
    };
    if (c.name < 0 || c.status < 0) throw new Error('LMOP: expected columns not found');
    log('  ' + (rows.length - hi - 1) + ' project rows');

    log('[3/3] deriving capacity, stage and distress');
    var out = [], dropped = { noLocation: 0, noCapacity: 0 };
    /* Landfills whose PROJECT rows were dropped (no coordinates anywhere, or nothing to
       price). They had a project -- the sweep must not relabel them "No Project" and hang
       a gas-flared-with-no-project distress signal on a site that in fact built one. */
    var droppedLfid = {};
    /* Statuses that mean a project actually existed. The workbook also rows-out landfills
       that never had one (candidate, low potential, blank) -- a dropped row with one of
       THOSE statuses is not evidence of a project, and excluding on it swept nothing. */
    var REAL_PROJECT_STATUS = { shutdown: 1, operational: 1, construction: 1, planned: 1 };
    var byStage = {}, shutdownCount = 0, ratedCount = 0, derivedCount = 0, badDates = 0, wipDerivedCount = 0, recoveredLocation = 0;

    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i];
        var name = str(r[c.name]);
        if (!name) continue;

        var lat = num(r[c.lat]), lon = num(r[c.lon]);
        var locationBasis = null;
        if (lat === null || lon === null) {
            // The project row's own cells are blank, but the project sits ON a landfill and the
            // inventory workbook carries that landfill's coordinates. 29 project rows — 15 of
            // them SHUTDOWN, one rated 5.2 MW — used to be dropped here for a blank cell their
            // own landfill record could fill.
            var lfRec = lfIndex[str(r[c.lfid])];
            if (lfRec) {
                lat = num(lfRec.r[lfRec.c.lat]);
                lon = num(lfRec.r[lfRec.c.lon]);
                if (lat !== null && lon !== null) {
                    locationBasis = 'landfill inventory record';
                    recoveredLocation++;
                }
            }
            if (lat === null || lon === null) {
                dropped.noLocation++;
                if (str(r[c.lfid]) && REAL_PROJECT_STATUS[statusKey]) droppedLfid[str(r[c.lfid])] = 1;
                continue;
            }
        }

        var statusRaw = str(r[c.status]) || 'Unknown';
        var statusKey = statusRaw.toLowerCase();
        var stage = Object.prototype.hasOwnProperty.call(STAGE_BY_STATUS, statusKey)
            ? STAGE_BY_STATUS[statusKey] : null;

        // Capacity, in order of how directly it was measured.
        //
        // 1. EPA's own rated capacity, where the project generates electricity.
        // 2. Gas actually flowing to the project, converted.
        // 3. Gas collected at the landfill, converted — the loosest, because some of it may be
        //    committed elsewhere.
        //
        // Non-electric projects (direct thermal, boilers, vehicle fuel) legitimately have no MW
        // rating; their gas is still the resource, so they fall through to a conversion rather
        // than being dropped.
        var kw = null, basis = null;
        var rated = c.ratedMw >= 0 ? num(r[c.ratedMw]) : null;
        var actual = c.actualMw >= 0 ? num(r[c.actualMw]) : null;
        var flow = c.flowToProject >= 0 ? num(r[c.flowToProject]) : null;
        var collected = c.collected >= 0 ? num(r[c.collected]) : null;

        if (rated !== null && rated > 0) { kw = rated * 1000; basis = 'EPA rated MW capacity'; ratedCount++; }
        else if (flow !== null && flow > 0) { kw = flow * MW_PER_MMSCFD * 1000; basis = 'LFG flow to project at ' + MW_PER_MMSCFD + ' MW/mmscfd'; derivedCount++; }
        else if (collected !== null && collected > 0) { kw = collected * MW_PER_MMSCFD * 1000; basis = 'LFG collected at landfill at ' + MW_PER_MMSCFD + ' MW/mmscfd'; derivedCount++; }
        else {
            // No gas figure at all. This used to be an unconditional drop, and it discarded
            // 1,483 of the 2,641 landfills EPA tracks — including all 204 rows EPA itself had
            // flagged Candidate. Waste in place is the fourth basis: a screening figure, marked
            // as one, never silently ranked alongside a measured gas flow.
            var wipTons = c.wip >= 0 ? num(r[c.wip]) : null;
            if (wipTons !== null && wipTons > 0) {
                kw = (wipTons / 1e6) * MW_PER_MILLION_TONS_WIP * 1000;
                basis = 'screening estimate from waste in place at ' + MW_PER_MILLION_TONS_WIP +
                        ' MW per million tons';
                wipDerivedCount++;
            } else {
                dropped.noCapacity++;
                if (str(r[c.lfid]) && REAL_PROJECT_STATUS[statusKey]) droppedLfid[str(r[c.lfid])] = 1;
                continue;
            }
        }

        var shutdownDate = c.shutdown >= 0 ? excelDate(r[c.shutdown]) : null;
        var startDate = c.start >= 0 ? excelDate(r[c.start]) : null;
        if (c.shutdown >= 0 && num(r[c.shutdown]) !== null && shutdownDate === null) badDates++;

        var ownership = str(r[c.ownership]);
        var counterparty = null;
        if (ownership) {
            var o = ownership.toLowerCase();
            if (o.indexOf('public') >= 0) counterparty = 'landfill_public';
            else if (o.indexOf('private') >= 0) counterparty = 'landfill_private';
        }

        byStage[stage] = (byStage[stage] || 0) + 1;
        if (statusKey === 'shutdown') shutdownCount++;

        // A project id is not always present, so identity falls back to coordinates plus the
        // project name. Stable across releases, which is what keeps CRM notes attached.
        var pid = str(r[c.projectId]);
        var id = 'lmop_' + (pid ? pid.replace(/[^A-Za-z0-9-]/g, '') :
                 (lat.toFixed(4) + '_' + lon.toFixed(4) + '_' + (str(r[c.projectName]) || 'x').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)));

        out.push({
            id: id,
            // LMOP's landfill id, which is NOT what `id` above encodes. `id` is the PROJECT id,
            // and a Combination Project covers several landfills — so one id legitimately appears
            // on multiple rows sitting kilometres apart, each a real separate location sharing
            // one project's capacity. Without this field the only way to tell those apart is to
            // string-split the id, which cannot distinguish "same landfill twice" from "one
            // project, two landfills". Consumed by tools/build-site-links.js.
            lfid: str(r[c.lfid]),
            // Where the coordinates came from when the project row's own cells were blank.
            // Null for the ~99% whose row carried its own; consumers can badge the rest.
            locationBasis: locationBasis,
            name: name,
            projectName: str(r[c.projectName]),
            lat: round(lat, 5),
            lon: round(lon, 5),
            state: str(r[c.state]),
            county: str(r[c.county]),
            city: str(r[c.city]),
            address: str(r[c.address]),
            zip: str(r[c.zip]),
            owner: str(r[c.owner]),
            ownershipType: ownership,
            counterpartyType: counterparty,
            projectStatus: statusRaw,
            developmentStage: stage,
            projectType: str(r[c.projType]),
            powerPotentialKw: Math.round(kw),
            capacityBasis: basis,
            ratedMw: rated,
            actualMw: actual,
            lfgCollectedMmscfd: collected,
            lfgFlaredMmscfd: c.flared >= 0 ? num(r[c.flared]) : null,
            lfgFlowToProjectMmscfd: flow,
            wasteInPlaceTons: c.wip >= 0 ? num(r[c.wip]) : null,
            collectionSystem: c.collSystem >= 0 ? str(r[c.collSystem]) : null,
            landfillStatus: c.lfStatus >= 0 ? str(r[c.lfStatus]) : null,
            landfillOpenedYear: c.opened >= 0 ? num(r[c.opened]) : null,
            landfillClosureYear: c.closure >= 0 ? num(r[c.closure]) : null,
            projectStartDate: startDate,
            projectShutdownDate: shutdownDate,
            ghgrpId: c.ghgrp >= 0 ? str(r[c.ghgrp]) : null
        });
    }

    /* [2b/3] THE NO-PROJECT SWEEP — landfills in EPA's inventory with no project row at all.
       Measured before this existed: 1,483 of 2,641 landfills absent from the index entirely,
       219 of them at >=0.5 MW of potential, 120 with a collection system already in the ground,
       13 actively flaring collected gas with nothing using it. That last class is the single
       best prospect profile this business has — the owner is paying to run a flare — and none
       of them could ever appear on the map.

       INCLUSION IS A STATED CRITERION, NOT EVERYTHING: any measured gas figure, a collection
       system in place, or waste in place at or above one million tons (EPA's own candidate
       screening floor). What is excluded is counted and written into the artifact meta, so
       "nothing with potential is missed" is checkable rather than asserted. */
    var sweep = { added: 0, excludedNoSignal: 0, noCoords: 0, byBasis: {} };
    var seenLfid = {};
    for (var oi = 0; oi < out.length; oi++) { if (out[oi].lfid) seenLfid[out[oi].lfid] = 1; }
    var sweepSkippedDropped = 0;
    Object.keys(lfIndex).forEach(function (lid) {
        if (seenLfid[lid]) return;
        if (droppedLfid[lid]) { sweepSkippedDropped++; return; }
        var e = lfIndex[lid], lr = e.r, lc2 = e.c;
        var lat2 = num(lr[lc2.lat]), lon2 = num(lr[lc2.lon]);
        if (lat2 === null || lon2 === null) { sweep.noCoords++; return; }

        var collected2 = num(lr[lc2.collected]);
        var flared2 = num(lr[lc2.flared]);
        var generated2 = num(lr[lc2.generated]);
        var wip2 = num(lr[lc2.wip]);
        var collSys2 = str(lr[lc2.collSystem]);

        /* Basis order is how directly the number was measured: gas actually collected at the
           wellfield, then gas measured being flared, then EPA's modelled generation, then the
           waste-in-place screen. Flared before generated on purpose — a flare meter is a
           measurement, a decay model is not. */
        var kw2 = null, basis2 = null;
        if (collected2 !== null && collected2 > 0) {
            kw2 = collected2 * MW_PER_MMSCFD * 1000;
            basis2 = 'LFG collected at ' + MW_PER_MMSCFD + ' MW per mmscfd';
        } else if (flared2 !== null && flared2 > 0) {
            kw2 = flared2 * MW_PER_MMSCFD * 1000;
            basis2 = 'LFG flared at ' + MW_PER_MMSCFD + ' MW per mmscfd — gas currently ' +
                     'destroyed, no project using it';
        } else if (generated2 !== null && generated2 > 0) {
            kw2 = generated2 * MW_PER_MMSCFD * 1000;
            basis2 = 'EPA modelled LFG generation at ' + MW_PER_MMSCFD + ' MW per mmscfd';
        } else if (wip2 !== null && wip2 >= 1e6) {
            kw2 = (wip2 / 1e6) * MW_PER_MILLION_TONS_WIP * 1000;
            basis2 = 'screening estimate from waste in place at ' + MW_PER_MILLION_TONS_WIP +
                     ' MW per million tons';
        } else if (/^y/i.test(collSys2 || '')) {
            /* A collection system with no published volume: the infrastructure is a fact and
               the volume is not. Enters at a nominal figure so it ranks last rather than
               vanishing, and the basis says exactly how little is known. */
            kw2 = 100;
            basis2 = 'collection system in place, no published gas volume — nominal 100 kW ' +
                     'placeholder, verify on contact';
        } else {
            sweep.excludedNoSignal++;
            return;
        }

        var ownership2 = str(lr[lc2.ownership]);
        var counterparty2 = null;
        if (ownership2) {
            var o2 = ownership2.toLowerCase();
            if (o2.indexOf('public') >= 0) counterparty2 = 'landfill_public';
            else if (o2.indexOf('private') >= 0) counterparty2 = 'landfill_private';
        }

        sweep.added++;
        sweep.byBasis[basis2.split(' at ')[0]] = (sweep.byBasis[basis2.split(' at ')[0]] || 0) + 1;
        byStage['raw_resource'] = (byStage['raw_resource'] || 0) + 1;

        out.push({
            id: 'lmop_lf_' + String(lid).replace(/[^A-Za-z0-9-]/g, ''),
            lfid: lid,
            locationBasis: null,
            name: str(lr[lc2.name]),
            projectName: null,
            lat: round(lat2, 5),
            lon: round(lon2, 5),
            state: str(lr[lc2.state]),
            county: str(lr[lc2.county]),
            city: str(lr[lc2.city]),
            address: str(lr[lc2.address]),
            zip: str(lr[lc2.zip]),
            owner: str(lr[lc2.owner]),
            ownershipType: ownership2,
            counterpartyType: counterparty2,
            projectStatus: 'No Project',
            developmentStage: STAGE_BY_STATUS['no project'],
            projectType: null,
            powerPotentialKw: Math.round(kw2),
            capacityBasis: basis2,
            ratedMw: null,
            actualMw: null,
            lfgCollectedMmscfd: collected2,
            lfgFlaredMmscfd: flared2,
            lfgFlowToProjectMmscfd: null,
            wasteInPlaceTons: wip2,
            collectionSystem: collSys2,
            landfillStatus: str(lr[lc2.lfStatus]),
            landfillOpenedYear: num(lr[lc2.opened]),
            landfillClosureYear: num(lr[lc2.closure]),
            projectStartDate: null,
            projectShutdownDate: null,
            ghgrpId: str(lr[lc2.ghgrp])
        });
    });
    sweep.skippedProjectDropped = sweepSkippedDropped;
    log('  sweep: +' + sweep.added + ' no-project landfills (' +
        sweep.excludedNoSignal + ' excluded with no gas signal and <1M tons, ' +
        sweep.noCoords + ' without coordinates)');

    // Deterministic order.
    out.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });

    var payload = sortKeys({
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'US EPA Landfill Methane Outreach Program (LMOP) project database',
        sourceUrl: url,
        mwPerMmscfd: MW_PER_MMSCFD,
        capacityNote: 'Capacity is EPA\'s own rated MW where the project generates electricity. ' +
                      'Otherwise it is derived from landfill gas volume at ' + MW_PER_MMSCFD +
                      ' MW per mmscfd — landfill gas is roughly 50% methane at ~500 BTU/cf, half ' +
                      'the energy of pipeline gas, converted at about 35% electrical efficiency. ' +
                      'Every record carries capacityBasis saying which applied.',
        stageNote: 'Shutdown projects map to development_stage "constructed" rather than a lower ' +
                   'stage: the gas collection system, generator, interconnection and permits were ' +
                   'built and largely remain, which is materially further along than a candidate ' +
                   'landfill with nothing on site.',
        unitTrap: 'LMOP\'s "Projected Direct Reductions (MMTCO2e/yr) - MW" columns in the CANDIDATE ' +
                  'file are methane reductions, NOT megawatts, despite the header suffix. They are ' +
                  'not used here.',
        counts: {
            projects: out.length,
            byStage: byStage,
            shutdown: shutdownCount,
            capacityFromEpaRating: ratedCount,
            capacityDerivedFromGas: derivedCount,
            droppedNoLocation: dropped.noLocation,
            droppedNoCapacity: dropped.noCapacity,
            corruptShutdownDates: badDates,
            capacityFromWasteInPlace: wipDerivedCount,
            locationsRecoveredFromInventory: recoveredLocation,
            sweep: sweep
        },
        sweepNote: 'No-project landfills from the LMOP landfill inventory enter with ' +
                   'projectStatus "No Project" when they carry any measured gas figure, a ' +
                   'collection system, or >=1M tons waste in place (EPA\'s own candidate ' +
                   'screening floor). sweep.excludedNoSignal counts the landfills that met ' +
                   'none of those — the stated boundary of "no site with potential is missed".',
        projects: out
    });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;

    log('');
    log('  projects              ' + out.length.toLocaleString());
    Object.keys(byStage).sort().forEach(function (k) {
        log('    ' + String(k).padEnd(20) + byStage[k]);
    });
    log('  shutdown projects     ' + shutdownCount);
    log('  capacity from EPA MW  ' + ratedCount + ',  derived from gas ' + derivedCount);
    log('  dropped: no location ' + dropped.noLocation + ',  no capacity ' + dropped.noCapacity);
    if (badDates) log('  corrupt shutdown dates dropped: ' + badDates);
    log('  size                  ' + Math.round(raw / 1024) + ' KB  (' + Math.round(gz / 1024) + ' KB gzipped)');
    log('');
    log('wrote ' + path.relative(ROOT, OUT));
})().catch(function (e) {
    console.error('\nFAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
