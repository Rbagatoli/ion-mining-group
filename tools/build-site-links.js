// ===== Site links — one physical asset, one row =====
//
// The same physical site currently appears as several independent prospects and nothing in the
// app knows it. Three distinct duplications, each with a different cause:
//
//   1. ONE PROJECT, SEVERAL LANDFILLS. `id` in landfills.json is the LMOP *project* id, and a
//      Combination Project collects gas from more than one landfill. 30 project ids sit on 62
//      rows — real separate locations, each stamped with the whole project's capacity. Summing
//      the column double-counts; collapsing the rows deletes real places. Neither is right.
//
//   2. ONE LANDFILL, SEVERAL PROJECTS. A landfill can host an energy project and a flare project
//      and a shut-down predecessor. Different rows, one site, one owner to call.
//
//   3. THE SAME PLANT IN TWO DATASETS. 204 of 279 EIA landfill-gas plants sit within 1 km of an
//      LMOP landfill, and the two disagree about capacity and about whether the thing is running.
//      They are separate prospects in the ranked table today.
//
// THIS LINKS, IT DOES NOT MERGE. A wrong link stays visible and arguable; a wrong merge silently
// overwrites one dataset's number with another's and nobody ever sees the one that lost.
//
// WHY THIS IS NOT THE NAME MATCHING THAT WAS REMOVED. An earlier attempt matched EIA plants to
// operators by name and got 4 of 5 wrong, every failure on a shared TOWN name (SAND POINT ->
// Trident Seafoods). This uses no names at all — only coordinates, a hard 1 km radius, and a fuel
// filter. Names are used afterwards to CHECK the result, never to produce it.
//
// Usage:
//   node tools/build-site-links.js [--out data/site-links.json] [--radius-m 1000]
var fs = require('fs'), path = require('path'), zlib = require('zlib');

var ROOT = path.join(__dirname, '..');
var argv = process.argv.slice(2);
function arg(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
}
var OUT = path.resolve(ROOT, arg('out', 'data/site-links.json'));

// 1 km. Measured: of the 279 EIA landfill-gas plants, 204 have an LMOP landfill inside this
// radius with a separation median of 419 m and a maximum of 990 m — the distribution stops well
// short of the cutoff rather than being truncated by it, which is what a real signal looks like.
// Widening admits more multi-candidate groups without adding confident matches.
var RADIUS_M = parseFloat(arg('radius-m', '1000'));

// Landfill Gas ONLY. Municipal Solid Waste is a different asset: MSW adds three links, one of
// them a 50 MW incinerator matched to a 2.3 MW landfill next door. A near-coincidence in space
// is not identity when the two things burn different fuel.
var EIA_FUEL = 'Landfill Gas';

function log(s) { process.stdout.write(s + '\n'); }
function round(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }

// ---- Distance ------------------------------------------------------------------------------
var R_M = 6371000;
function rad(d) { return d * Math.PI / 180; }
function distM(aLat, aLon, bLat, bLon) {
    var dLa = rad(bLat - aLat), dLo = rad(bLon - aLon);
    var s = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---- Operating state -------------------------------------------------------------------------
// Deliberately coarse. The question is "is this thing producing power right now", and both
// datasets answer it in their own vocabulary.
function eiaRunning(f) {
    var s = String(f.status || '').toUpperCase();
    if (s === 'OP') return true;
    if (s === 'RE' || s === 'OA' || s === 'OS' || s === 'IP') return false;
    return null;    // SB (standby), planned, or anything unrecognised: not a claim either way
}
function lmopRunning(p) {
    var s = String(p.projectStatus || '').toLowerCase();
    if (s.indexOf('operational') >= 0) return true;
    if (s.indexOf('shutdown') >= 0 || s.indexOf('shut down') >= 0) return false;
    return null;    // planned, construction, candidate
}

function main() {
    log('');
    log('=== Site links ===');

    var facPath = path.join(ROOT, 'data', 'facilities.json');
    var lfPath  = path.join(ROOT, 'data', 'landfills.json');
    if (!fs.existsSync(facPath)) throw new Error('data/facilities.json missing — run build-facility-index.js');
    if (!fs.existsSync(lfPath))  throw new Error('data/landfills.json missing — run build-landfill-index.js');

    var facDoc = JSON.parse(fs.readFileSync(facPath, 'utf8'));
    var lfDoc  = JSON.parse(fs.readFileSync(lfPath, 'utf8'));
    var facilities = facDoc.facilities || [];
    var projects   = lfDoc.projects || [];

    if (!projects.length || projects[0].lfid === undefined) {
        throw new Error('landfills.json carries no lfid — rebuild with the current ' +
                        'build-landfill-index.js, which emits it');
    }

    log('[1/4] grouping LMOP rows by physical landfill');

    // ---- Landfill groups: one entry per PHYSICAL landfill --------------------------------
    var byLfid = {};
    var noLfid = 0;
    projects.forEach(function (p) {
        if (!p.lfid) { noLfid++; return; }
        (byLfid[p.lfid] || (byLfid[p.lfid] = [])).push(p);
    });
    var lfids = Object.keys(byLfid).sort();
    var multiProject = lfids.filter(function (k) { return byLfid[k].length > 1; });

    // Sharing a landfill is NOT by itself double counting. 381 of the 407 multi-project landfills
    // report a different capacity per project, which is what genuinely separate projects on one
    // site look like. Only where every project reports the IDENTICAL figure is the same gas
    // resource being counted more than once — 26 landfills, 98 MW. Recorded because an earlier
    // estimate treated all 407 as duplicates and put the over-count an order of magnitude high.
    var sameCapKw = 0, sameCapLandfills = 0;
    multiProject.forEach(function (k) {
        var kws = byLfid[k].map(function (r) { return r.powerPotentialKw; })
                           .filter(function (v) { return v !== null && v !== undefined; });
        if (kws.length < 2) return;
        var uniq = {};
        kws.forEach(function (v) { uniq[v] = 1; });
        if (Object.keys(uniq).length === 1) { sameCapLandfills++; sameCapKw += kws[0] * (kws.length - 1); }
    });
    log('  ' + projects.length.toLocaleString() + ' project rows across ' +
        lfids.length.toLocaleString() + ' landfills' +
        (noLfid ? '  (' + noLfid + ' with no landfill id)' : ''));
    log('  landfills hosting more than one project  ' + multiProject.length.toLocaleString() +
        '  (' + sameCapLandfills + ' repeat one capacity across their projects)');

    // ---- Project spans: one PROJECT across several landfills ------------------------------
    // The capacity trap. Every row of a Combination Project carries the whole project's kW, so
    // any total that sums rows over-counts. Recorded rather than repaired: the rows are all real
    // places and deleting them loses locations the map should show.
    log('[2/4] finding projects that span several landfills');
    var byProject = {};
    projects.forEach(function (p) { (byProject[p.id] || (byProject[p.id] = [])).push(p); });
    var spans = Object.keys(byProject).filter(function (k) {
        var rows = byProject[k];
        if (rows.length < 2) return false;
        var s = {};
        rows.forEach(function (r) { if (r.lfid) s[r.lfid] = 1; });
        return Object.keys(s).length > 1;
    }).sort();

    var spanRecords = spans.map(function (pid) {
        var rows = byProject[pid];
        var maxSep = 0;
        for (var i = 0; i < rows.length; i++) {
            for (var j = i + 1; j < rows.length; j++) {
                maxSep = Math.max(maxSep, distM(rows[i].lat, rows[i].lon, rows[j].lat, rows[j].lon));
            }
        }
        return {
            projectId: pid,
            projectName: rows[0].projectName || null,
            // Every landfill, in id order. All of them are real.
            members: rows.map(function (r) {
                return { lfid: r.lfid, name: r.name, lat: r.lat, lon: r.lon };
            }).sort(function (a, b) { return String(a.lfid) < String(b.lfid) ? -1 : 1; }),
            // The capacity to count ONCE for the whole project, not once per row.
            capacityKw: rows[0].powerPotentialKw === undefined ? null : rows[0].powerPotentialKw,
            capacityBasis: rows[0].capacityBasis || null,
            rowCount: rows.length,
            maxSeparationM: Math.round(maxSep)
        };
    });
    var overCountedKw = spanRecords.reduce(function (s, r) {
        return s + (r.capacityKw ? r.capacityKw * (r.rowCount - 1) : 0);
    }, 0);
    log('  ' + spanRecords.length + ' projects span ' +
        spanRecords.reduce(function (s, r) { return s + r.rowCount; }, 0) + ' rows');
    log('  capacity double-counted by summing rows  ' +
        Math.round(overCountedKw / 1000).toLocaleString() + ' MW');

    // ---- EIA <-> LMOP ---------------------------------------------------------------------
    log('[3/4] linking EIA landfill-gas plants to LMOP landfills');
    var lfg = facilities.filter(function (f) { return f.technology === EIA_FUEL; });

    // Bucket the landfills by whole degree so this is not 279 x 1,908 with trigonometry.
    var grid = {};
    projects.forEach(function (p) {
        if (p.lat === null || p.lon === null) return;
        var k = Math.floor(p.lat) + ':' + Math.floor(p.lon);
        (grid[k] || (grid[k] = [])).push(p);
    });

    var links = [], seps = [], multiCandidate = 0;
    lfg.forEach(function (f) {
        var near = [];
        var la = Math.floor(f.lat), lo = Math.floor(f.lon);
        for (var dLa = -1; dLa <= 1; dLa++) {
            for (var dLo = -1; dLo <= 1; dLo++) {
                var cell = grid[(la + dLa) + ':' + (lo + dLo)];
                if (!cell) continue;
                cell.forEach(function (p) {
                    var d = distM(f.lat, f.lon, p.lat, p.lon);
                    if (d <= RADIUS_M) near.push({ p: p, d: d });
                });
            }
        }
        if (!near.length) return;
        near.sort(function (a, b) { return a.d - b.d; });
        seps.push(near[0].d);

        // EVERY landfill group inside the radius, never just the nearest. 121 of these plants
        // have more than one candidate; silently picking the closest is what turned 16 genuine
        // operating disagreements into 49 manufactured ones.
        var groups = {};
        near.forEach(function (n) {
            var key = n.p.lfid || n.p.id;
            if (!groups[key]) groups[key] = { lfid: n.p.lfid || null, name: n.p.name, rows: [], nearestM: n.d };
            groups[key].rows.push(n.p);
            groups[key].nearestM = Math.min(groups[key].nearestM, n.d);
        });
        var groupKeys = Object.keys(groups).sort();
        if (groupKeys.length > 1) multiCandidate++;

        // The operating question asked GROUP-WISE: does this landfill have ANY live project?
        // Row-wise comparison against the nearest row answers a different, wrong question.
        var eiaOn = eiaRunning(f);
        var disagreements = [];
        groupKeys.forEach(function (k) {
            var g = groups[k];
            var anyLive = g.rows.some(function (r) { return lmopRunning(r) === true; });
            var anyKnown = g.rows.some(function (r) { return lmopRunning(r) !== null; });
            if (eiaOn === null || !anyKnown) return;
            if (eiaOn === false && anyLive) {
                disagreements.push({ lfid: g.lfid, kind: 'eia_retired_lmop_operating' });
            } else if (eiaOn === true && !anyLive) {
                disagreements.push({ lfid: g.lfid, kind: 'eia_operating_lmop_shutdown' });
            }
        });

        links.push({
            facilityId: f.id,
            facilityName: f.name,
            facilityMw: f.nameplateMw,
            facilityStatus: f.statusLabel || f.status || null,
            state: f.state,
            landfills: groupKeys.map(function (k) {
                var g = groups[k];
                return {
                    lfid: g.lfid,
                    name: g.name,
                    projectIds: g.rows.map(function (r) { return r.id; }).sort(),
                    distanceM: Math.round(g.nearestM),
                    // Only 772 of 1,908 LMOP rows carry a rated MW; the rest are estimated from
                    // gas flow. A resource estimate differing from a generator nameplate is not
                    // a contradiction, so the basis travels with the number.
                    capacityKw: g.rows[0].powerPotentialKw === undefined ? null : g.rows[0].powerPotentialKw,
                    capacityBasis: g.rows[0].capacityBasis || null,
                    ratedMw: g.rows[0].ratedMw === undefined ? null : g.rows[0].ratedMw,
                    projectStatus: g.rows.map(function (r) { return r.projectStatus; })
                                         .filter(Boolean).sort().join(' / ') || null
                };
            }),
            disagreements: disagreements
        });
    });
    links.sort(function (a, b) { return a.facilityId < b.facilityId ? -1 : 1; });

    seps.sort(function (a, b) { return a - b; });
    var disagreeCount = links.reduce(function (s, l) { return s + l.disagreements.length; }, 0);
    var withDisagreement = links.filter(function (l) { return l.disagreements.length; }).length;
    log('  ' + lfg.length + ' EIA landfill-gas plants, ' + links.length + ' linked (' +
        Math.round(100 * links.length / lfg.length) + '%)');
    log('  separation  median ' + Math.round(seps[Math.floor(seps.length / 2)]) + ' m, max ' +
        Math.round(seps[seps.length - 1]) + ' m');
    log('  plants with more than one candidate landfill  ' + multiCandidate);
    log('  operating disagreements  ' + disagreeCount + ' across ' + withDisagreement + ' plants');

    // ---- Sanity: names are used to CHECK, never to match ------------------------------------
    var stateAgree = links.filter(function (l) {
        return l.landfills.some(function (g) {
            var rows = byLfid[g.lfid] || [];
            return rows.length && rows[0].state === l.state;
        });
    }).length;
    log('[4/4] checking the join against fields it never used');
    log('  state agrees on  ' + stateAgree + ' of ' + links.length +
        ' (' + Math.round(100 * stateAgree / links.length) + '%)');

    var payload = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'EIA-860/923 landfill-gas plants joined to EPA LMOP landfills by coordinate proximity',
        method: 'Coordinate proximity only, ' + RADIUS_M + ' m, restricted to EIA technology "' +
                EIA_FUEL + '". No name matching of any kind — an earlier name-based join in this ' +
                'project matched 4 of 5 wrong on shared town names. Every landfill inside the ' +
                'radius is emitted; the nearest is never silently chosen.',
        joinNote: 'These are LINKS, not merges. Neither dataset\'s figures are overwritten, and ' +
                  'where the two disagree both numbers are carried so the disagreement is visible.',
        capacityNote: 'Only 772 of 1,908 LMOP rows carry an EPA rated MW; the rest are derived ' +
                      'from measured gas flow. capacityBasis states which, per landfill. A ' +
                      'resource estimate differing from a generator nameplate is not a conflict.',
        radiusM: RADIUS_M,
        counts: {
            eiaLandfillGasPlants: lfg.length,
            linked: links.length,
            unlinked: lfg.length - links.length,
            plantsWithMultipleCandidates: multiCandidate,
            operatingDisagreements: disagreeCount,
            plantsWithDisagreement: withDisagreement,
            landfills: lfids.length,
            projectRows: projects.length,
            landfillsWithMultipleProjects: multiProject.length,
            landfillsRepeatingOneCapacity: sameCapLandfills,
            sharedResourceDoubleCountedKw: Math.round(sameCapKw),
            projectsSpanningLandfills: spanRecords.length,
            capacityDoubleCountedKw: Math.round(overCountedKw),
            separationMedianM: seps.length ? Math.round(seps[Math.floor(seps.length / 2)]) : null,
            separationMaxM: seps.length ? Math.round(seps[seps.length - 1]) : null,
            stateAgreement: stateAgree
        },
        links: links,
        projectSpans: spanRecords,
        // One entry per landfill hosting more than one project row, so the UI can show "3 projects
        // at this landfill" instead of three unrelated-looking prospects.
        multiProjectLandfills: multiProject.sort().map(function (k) {
            var rows = byLfid[k];
            return {
                lfid: k,
                name: rows[0].name,
                projectIds: rows.map(function (r) { return r.id; }).sort(),
                statuses: rows.map(function (r) { return r.projectStatus; }).filter(Boolean).sort()
            };
        })
    };

    fs.writeFileSync(OUT, JSON.stringify(payload));
    var raw = fs.statSync(OUT).size;
    var gz = zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length;
    log('');
    log('  size  ' + Math.round(raw / 1024) + ' KB  (' + Math.round(gz / 1024) + ' KB gzipped)');
    log('');
    log('wrote ' + path.relative(ROOT, OUT));
}

try { main(); }
catch (e) { log('\nFAILED: ' + e.message); process.exit(1); }
