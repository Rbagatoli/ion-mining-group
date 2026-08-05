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
    'unknown':          null              // genuinely unknown, and scored as unknown
};

function log(s) { console.log(s); }
function progress(s) { if (process.stdout.isTTY) process.stdout.write('\r  ' + s + '   '); }

function fetchText(url, redirects) {
    return new Promise(function (resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'ion-mining-group/landfill-index' } }, function (res) {
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
        https.get(url, { headers: { 'User-Agent': 'ion-mining-group/landfill-index' } }, function (res) {
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

    var dest = path.join(CACHE, 'lmop-projects.xlsx');
    await download(url, dest);
    if (!isZip(dest)) {
        try { fs.unlinkSync(dest); } catch (e) {}
        throw new Error('downloaded file is not an xlsx — the URL probably returned an error page');
    }
    log('  ' + Math.round(fs.statSync(dest).size / 1024) + ' KB');

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
    var byStage = {}, shutdownCount = 0, ratedCount = 0, derivedCount = 0, badDates = 0;

    for (var i = hi + 1; i < rows.length; i++) {
        var r = rows[i];
        var name = str(r[c.name]);
        if (!name) continue;

        var lat = num(r[c.lat]), lon = num(r[c.lon]);
        if (lat === null || lon === null) { dropped.noLocation++; continue; }

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
        else { dropped.noCapacity++; continue; }

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
            corruptShutdownDates: badDates
        },
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
