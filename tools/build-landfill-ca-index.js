#!/usr/bin/env node
// Build data/landfills-ca.json — Canadian landfill gas prospects from ECCC's GHGRP.
//
// WHY THIS IS NOT A COPY OF build-landfill-index.js
//
// The US adapter reads EPA's LMOP, which is a pre-screened CANDIDATE LIST: EPA has already
// decided which landfills are worth a project, published a rated capacity for the ones that were
// built, and — the part that adapter is really about — recorded which projects SHUT DOWN with the
// generator still standing.
//
// Canada has no LMOP. The closest thing is an EMISSIONS REGISTER: every facility over 10 kt CO2e
// reports what it emitted. That difference runs all the way through this file.
//
//   No economic screen      every reporting landfill is here, not a curated subset
//   No project lifecycle    nothing says candidate/constructed/shutdown
//   No published capacity   there is no rated MW to read; it has to be derived from methane
//   No shutdown seam        the single most valuable signal in the US dataset has no analogue
//
// What Canada has instead is the Landfill Methane Regulations, in force 12 December 2025, which
// manufacture a population of operators legally required to destroy their methane by a fixed
// date. That is the Canadian equivalent of the shutdown seam, and lmr.js is where it lives.
//
// THE THRESHOLD RELATIONSHIP IS INVERTED FROM THE US, which is worth stating because assuming
// symmetry would be wrong in the direction of under-collecting. GHGRP's 10 kt CO2e floor is about
// 357 t of methane at GWP 28 — BELOW both LMR thresholds. So GHGRP catches essentially every
// LMR-regulated landfill plus a tail of smaller ones. In the US, LMOP's candidate screen is
// NARROWER than GHGRP reporting.
//
// SOURCE. ECCC publishes the GHGRP as bulk .csv/.xlsx on the Open Data Portal, and also serves it
// through the JSON API behind the public facility-emissions search. This uses the API: it is the
// same data, it is filterable server-side by NAICS and year, and it does not require parsing a
// spreadsheet whose column layout changes between vintages.
//
//   https://pollution-waste.canada.ca/sradapi/v2/ghg/Search
//     ?naicsCode=562210&fromYear=&toYear=&start=&length=&language=en
//
// Licence: Open Government Licence – Canada. Commercial use permitted.

var https = require('https'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var LMR = require(path.join(ROOT, 'lmr.js'));

var API = 'https://pollution-waste.canada.ca/sradapi/v2/ghg/Search';

// 562210 "Waste treatment and disposal" is the landfill code. The neighbouring waste codes are
// deliberately NOT included: 562110 is waste COLLECTION (trucks and transfer stations, no gas),
// 562910 is remediation, 562920 is material recovery, 562990 is a catch-all. Including them to
// "be thorough" would put haulage depots in a list of gas prospects.
var NAICS_LANDFILL = 562210;

// Emissions history. The brief wants a trend, and a trend needs enough points to be one: a
// landfill with rising reported methane is actively generating, and a falling trend on an open
// site is a question worth asking — either collection went in, or the reporting method changed.
var FIRST_YEAR = 2010;

// The reporting year the cohort is computed from. Read from the API rather than hard-coded, so
// this does not silently keep modelling 2024 after 2025 publishes.
var YEARS_URL = 'https://pollution-waste.canada.ca/sradapi/v2/ghg/Data/ReportYears';

function getJson(url, redirects) {
    return new Promise(function (resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'proton-mining/landfill-ca-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(getJson(new URL(res.headers.location, url).href, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            var body = '';
            res.setEncoding('utf8');
            res.on('data', function (d) { body += d; });
            res.on('end', function () {
                // THE SPA TRAP, RECORDED SO NOBODY REPEATS IT. ECCC's data mart returns HTTP 200
                // with an HTML shell for paths that do not exist, so a status check reports
                // success while handing you 2 kB of markup. Anything that fetches from an ECCC
                // host must check the CONTENT, not the code.
                var head = body.slice(0, 200).trim();
                if (head.charAt(0) === '<') {
                    return reject(new Error('expected JSON, got HTML from ' + url +
                                            ' — the host served a page, not data'));
                }
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('unparseable JSON from ' + url + ': ' + e.message)); }
            });
        }).on('error', reject);
    });
}

/* THE BY-EMISSION-SOURCE FILE, AND HOW TO ACTUALLY GET IT.
 *
 * The JSON API above is the by-GAS view: one row per facility-year, no source breakdown, no
 * coordinates, no contacts. The by-SOURCE file has all three, and getting to it has two traps
 * that both return HTTP 200 while handing you the wrong thing:
 *
 *   1. THE PATH HAS NO "/data" SEGMENT. The obvious-looking
 *        https://data-donnees.az.ec.gc.ca/data/substances/monitor/.../PDGES-...csv
 *      returns 200 with a 2,200-byte SPA shell. The real path starts /substances/monitor/...
 *      and must go through the api/file endpoint.
 *   2. api/file 302s to a time-limited Azure Blob SAS URL. Without redirect-following you get a
 *      302 and a zero-byte file; the SAS target expires in about half an hour, so it must never
 *      be cached -- always re-hit api/file.
 *
 * Which is why getFile() below checks the CONTENT and not the status code.
 */
var SOURCE_FILE =
    'https://data-donnees.az.ec.gc.ca/api/file?path=' +
    encodeURIComponent('/substances/monitor/greenhouse-gas-reporting-program-ghgrp-facility-' +
                       'greenhouse-gas-ghg-data/PDGES-GHGRP-GHGEmissionsSourcesGES-2022-Present.csv');

/* The literal category strings, read out of the file rather than guessed. For NAICS 562210 in
 * 2024 the whole vocabulary is: EC_WasteEmissions (141 facilities), EC_OnSiteTransportation (104),
 * EC_CO2BiomassCombustion (95), EC_GeneralStationaryCombustion (75), EC_FlaringEmissions (18),
 * EC_FugitiveEmissions (6), EC_VentingEmissions (2), EC_WastewaterEmissions (1).
 *
 * CONTROLS ARE COMBUSTION, NOT FLARING. s.5(2)(a)(i) turns on whether a landfill gas RECOVERY
 * SYSTEM was operating, and a site running an engine has recovery while reporting its exhaust as
 * biomass combustion rather than as flaring. Keying on EC_FlaringEmissions alone would find 18
 * sites and miss the 95 -- it would move most of the country's controlled landfills into the
 * forced-buyer cohort, which is the single most flattering error available here. */
var CAT_FLARING = 'EC_FlaringEmissions';
var CAT_BIOMASS = 'EC_CO2BiomassCombustion';
var CAT_LANDFILL = 'EC_WasteEmissions';

function getFile(url, redirects) {
    return new Promise(function (resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'proton-mining/landfill-ca-index' } }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(getFile(new URL(res.headers.location, url).href, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            var body = '';
            res.setEncoding('utf8');
            res.on('data', function (d) { body += d; });
            res.on('end', function () {
                var head = body.replace(/^\uFEFF/, '').slice(0, 40).trim();
                if (head.charAt(0) === '<') {
                    return reject(new Error('got the SPA shell, not the file — check the path has ' +
                                            'no /data segment and goes through api/file'));
                }
                resolve(body);
            });
        }).on('error', reject);
    });
}

// Quote-aware, because company names contain commas and a naive split silently shifts every
// column after the first one that does.
function parseCsvLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
            if (q && line[i + 1] === '"') { cur += '"'; i++; }
            else q = !q;
        } else if (ch === ',' && !q) { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
}

/* THE IDENTITY KEY, AND IT IS NOT THE ONE THAT LOOKS LIKE ONE.
 *
 * `facilityId` reads like a primary key and is not stable across reporting years: the same
 * landfill filing every year from 2010 to 2024 carries a DIFFERENT facilityId in most of those
 * filings. Measured on the real feed: 1,333 facility-years yield 972 distinct facilityIds and
 * only 156 distinct ghgrpIds, and 149 of those 156 span more than one year. G10026, for
 * instance, runs continuously from 2010 to 2024 under one ghgrpId and many facilityIds.
 *
 * Keying on facilityId therefore turns 156 landfills into 972 prospects, each holding a single
 * year of history, no computable trend, and a cohort derived from whichever year that slice
 * happened to be. The list would have looked six times richer than the country actually is.
 *
 * So: ghgrpId, with facility+province as the fallback for the handful of rows that carry no
 * ghgrpId. Identity has to be stable across ingests anyway — CRM notes hang off it. */
function keyFor(r) {
    var g = String(r.ghgrpId || '').trim();
    if (g) return g;
    return 'name:' + String(r.facility || '').trim().toLowerCase() +
           '|' + String((r.province && r.province.en) || '').trim().toLowerCase();
}
function idFor(r) { return 'ca-lf-' + keyFor(r).replace(/[^a-zA-Z0-9]+/g, '-'); }

// 'rising' | 'flat' | 'declining' | null, over whatever years the facility actually reported.
// Least-squares slope on tonnes/year, expressed as a fraction of the mean so a big landfill and a
// small one are judged on the same scale.
function trendOf(series) {
    var pts = series.filter(function (p) { return p.ch4 !== null; });
    if (pts.length < 3) return null;
    var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    pts.forEach(function (p) { sx += p.year; sy += p.ch4; sxy += p.year * p.ch4; sxx += p.year * p.year; });
    var denom = n * sxx - sx * sx;
    if (denom === 0) return null;
    var slope = (n * sxy - sx * sy) / denom;
    var mean = sy / n;
    if (mean <= 0) return null;
    var rel = slope / mean;                 // fraction of the mean per year
    if (rel > 0.02) return 'rising';
    if (rel < -0.02) return 'declining';
    return 'flat';
}

async function main() {
    var years = await getJson(YEARS_URL);
    var latest = Math.max.apply(null, years.map(function (y) { return y.id; }));
    console.log('ECCC GHGRP: latest reporting year ' + latest);

    var url = API + '?naicsCode=' + NAICS_LANDFILL +
              '&fromYear=' + FIRST_YEAR + '&toYear=' + latest +
              '&start=0&length=20000&language=en';
    var res = await getJson(url);
    var rows = res.data || [];
    console.log('NAICS ' + NAICS_LANDFILL + ', ' + FIRST_YEAR + '-' + latest + ': ' +
                rows.length + ' facility-years');

    // One record per FACILITY, carrying its own history.
    var byFacility = {};
    rows.forEach(function (r) {
        var k = keyFor(r);
        if (!byFacility[k]) byFacility[k] = { rows: [], latest: null };
        byFacility[k].rows.push(r);
        if (!byFacility[k].latest || r.reportYear > byFacility[k].latest.reportYear) {
            byFacility[k].latest = r;
        }
    });

    var out = [], counts = { total: 0, current: 0, stale: 0, cohorts: {}, noCh4: 0 };
    Object.keys(byFacility).forEach(function (k) {
        var f = byFacility[k], r = f.latest;
        var series = f.rows.map(function (x) {
            return { year: x.reportYear, ch4: num(x.CH4), co2e: num(x.normEmissions) };
        }).sort(function (a, b) { return a.year - b.year; });

        var ch4 = num(r.CH4);
        if (ch4 === null) counts.noCh4++;

        /* STALE REPORTERS ARE NOT CURRENT PROSPECTS.
         *
         * A facility's most recent report is not necessarily a RECENT report. Pulling 2010
         * onward for the trend series means this set also contains landfills that last
         * reported in 2012 and have said nothing since — because they closed, dropped under
         * the 10 kt threshold, or were absorbed into another facility record. Computing a
         * 2028 cohort from 2012 emissions would be inventing a prospect out of a number
         * that stopped being true a decade ago.
         *
         * The history is KEPT, because a landfill that reported for eight years and then went
         * quiet is a question worth asking. It just does not get a cohort. One year of lag is
         * allowed: ECCC publishes well after the reporting year and a facility can legitimately
         * be a filing behind. */
        var current = (latest - r.reportYear) <= 1;
        if (!current) counts.stale++;

        // WHAT WE CANNOT ESTABLISH FROM THIS FEED, AND THEREFORE DO NOT CLAIM.
        //
        // The 2028/2029 split turns on whether a landfill gas recovery system was already
        // operating when the Regulations came into force. That is visible in the GHGRP's
        // BY-EMISSION-SOURCE file, which separates landfilling from landfill gas FLARING — a
        // facility reporting flaring necessarily has collection. This API serves the by-gas
        // view only and carries no source breakdown, so hasExistingControls is genuinely
        // unknown here and lmr.js returns 'unknown' for the split rather than guessing.
        //
        // enrichWithSources() below is where that lands when the by-source file is wired in.
        // MEASURED, not assumed. Burning methane makes biogenic CO2 at 2.744 t per t, so a
        // landfill's biogenic CO2 line is close to a direct reading of how much gas it destroys
        // — which gives both the collection efficiency and, with emissions, the generation.
        // See captureFromBiogenicCo2() in lmr.js for the derivation and its two limits.
        var cap = LMR.captureFromBiogenicCo2(num(r.CO2biomass), ch4);
        var hasControls = cap.hasControls;

        var genTonnes, genBasis;
        if (cap.generatedTonnes !== null) {
            genTonnes = cap.generatedTonnes;
            genBasis = cap.basis;
        } else {
            // No biogenic CO2 reported. Fall back to the CONSERVATIVE read: treat reported
            // emissions as generation. That understates any site that does collect, so it can
            // only move a site DOWN the cohort ladder, never up.
            var gen = LMR.generationFromReported(ch4, hasControls);
            genTonnes = gen.tonnes !== null ? gen.tonnes : ch4;
            genBasis = gen.tonnes !== null ? gen.basis
                : 'no biogenic CO2 reported; reported CH4 taken as generation, which is a floor';
        }

        var cohort = current
            ? LMR.cohort({ methaneGenerationTonnes: genTonnes, hasExistingControls: hasControls })
            : { cohort: 'unknown', deadline: null,
                basis: 'last reported ' + r.reportYear + '; too old to place in a cohort' };
        counts.cohorts[cohort.cohort] = (counts.cohorts[cohort.cohort] || 0) + 1;

        // Where capture was measured, size the plant on what a collection system actually
        // delivers at THIS site rather than at an assumed fleet average.
        var kw = LMR.methaneTonnesToKw(genTonnes,
            cap.capture !== null ? { captureEfficiency: Math.max(cap.capture, 0.05) } : undefined);

        out.push({
            id: idFor(r),
            facilityId: r.facilityId,
            ghgrpId: String(r.ghgrpId || '').trim() || null,
            npriId: r.npriId || null,          // the join to coordinates — see the note below
            name: r.facility || null,
            company: r.company || null,
            city: r.city || null,
            province: (r.province && r.province.en) || null,
            naics: (r.naics && r.naics.id) || null,
            reportingYear: r.reportYear,
            current: current,
            ch4Tonnes: ch4,
            co2eTonnes: num(r.normEmissions),
            methaneGenerationTonnes: genTonnes === null ? null : Math.round(genTonnes),
            methaneGenerationBasis: genBasis,
            powerPotentialKw: kw === null ? null : Math.round(kw),
            lmrCohort: cohort.cohort,
            lmrDeadline: cohort.deadline,
            lmrBasis: cohort.basis,
            hasExistingControls: hasControls,
            captureEfficiency: cap.capture === null ? null : Math.round(cap.capture * 1000) / 1000,
            methaneDestroyedTonnes: cap.destroyedTonnes === null ? null : Math.round(cap.destroyedTonnes),
            captureBasis: cap.basis,
            // hasFlaring is what the by-emission-source file would state outright. Until that is
            // wired in, measured destruction stands in for it: a site destroying a material share
            // of its gas is a site with a collection system, whatever the category strings say.
            hasFlaring: hasControls,
            hasLandfillingEmissions: ch4 !== null && ch4 > 0,
            emissionsTrend: trendOf(series),
            series: series,
            // NOT PUBLISHED BY THIS FEED. Deliberately null rather than absent, so a consumer
            // can tell "no coordinates" from "field forgotten". npriId is the documented route:
            // the National Pollutant Release Inventory publishes coordinates and shares the
            // facility identity.
            lat: null,
            lng: null
        });
        counts.total++;
        if (current) counts.current++;
    });

    // ---- Enrich from the by-source file ------------------------------------------------
    var enriched = 0, geocoded = 0, contacted = 0;
    try {
        var csv = await getFile(SOURCE_FILE);
        var lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
        var H = parseCsvLine(lines[0]);
        function col(re) { return H.findIndex(function (h) { return re.test(h); }); }
        var iId = col(/^GHGRP ID No\./), iYear = col(/Reference Year/),
            iNaics = col(/Facility NAICS Code \//), iSrc = col(/^Emission Source/),
            iLat = col(/^Latitude/), iLng = col(/^Longitude/),
            iName = col(/Public Contact Name/), iPos = col(/Public Contact Position/),
            iTel = col(/Public Contact Telephone/), iMail = col(/Public Contact Email/);

        var byId = {};
        for (var li = 1; li < lines.length; li++) {
            if (!lines[li]) continue;
            var row = parseCsvLine(lines[li]);
            if (row[iNaics] !== String(NAICS_LANDFILL)) continue;
            var gid = String(row[iId] || '').trim();
            if (!gid) continue;
            var e = byId[gid] || (byId[gid] = { cats: {}, lat: null, lng: null, contact: null, year: null });
            var yr = Number(row[iYear]);
            // Latest year wins for attributes; categories accumulate for that year only.
            if (e.year === null || yr > e.year) { e.year = yr; e.cats = {}; e.lat = null; e.lng = null; }
            if (yr < e.year) continue;
            e.cats[row[iSrc]] = true;
            var la = Number(row[iLat]), ln = Number(row[iLng]);
            if (isFinite(la) && isFinite(ln) && la !== 0 && ln !== 0) { e.lat = la; e.lng = ln; }
            if (!e.contact && String(row[iName] || '').trim()) {
                e.contact = {
                    name: String(row[iName] || '').trim() || null,
                    position: String(row[iPos] || '').trim() || null,
                    telephone: String(row[iTel] || '').trim() || null,
                    email: String(row[iMail] || '').trim() || null
                };
            }
        }

        out.forEach(function (p) {
            var e = p.ghgrpId && byId[p.ghgrpId];
            if (!e) return;
            enriched++;
            if (e.lat !== null) { p.lat = e.lat; p.lng = e.lng; geocoded++; }
            if (e.contact) { p.publicContact = e.contact; contacted++; }
            p.emissionSources = Object.keys(e.cats);
            p.hasFlaring = !!(e.cats[CAT_FLARING] || e.cats[CAT_BIOMASS]);
            p.reportsFlaringCategory = !!e.cats[CAT_FLARING];
            p.hasLandfillingEmissions = !!e.cats[CAT_LANDFILL];
            // The published category outranks the derivation: EC_ categories are what the
            // operator declared, the biogenic-CO2 arithmetic is what we inferred from a total.
            if (p.current) {
                p.hasExistingControls = p.hasFlaring;
                var c2 = LMR.cohort({
                    methaneGenerationTonnes: p.methaneGenerationTonnes,
                    hasExistingControls: p.hasExistingControls,
                    hasFlaring: p.hasFlaring,
                    hasLandfillingEmissions: p.hasLandfillingEmissions
                });
                p.lmrCohort = c2.cohort;
                p.lmrDeadline = c2.deadline;
                p.lmrBasis = c2.basis;
            }
        });
        counts.enriched = enriched;
        counts.withCoordinates = geocoded;
        counts.withPublicContact = contacted;
        counts.cohorts = {};
        out.forEach(function (p) { counts.cohorts[p.lmrCohort] = (counts.cohorts[p.lmrCohort] || 0) + 1; });
        console.log('enriched ' + enriched + ' facilities from the by-source file  (' +
                    geocoded + ' with coordinates, ' + contacted + ' with a public contact)');
    } catch (err) {
        // The adapter is designed to work without this. Degrade loudly, not silently.
        console.warn('by-source enrichment SKIPPED: ' + err.message);
        counts.enriched = 0;
    }

    out.sort(function (a, b) { return (b.powerPotentialKw || 0) - (a.powerPotentialKw || 0); });

    var artifact = {
        v: 1,
        generated: new Date().toISOString(),
        source: 'Environment and Climate Change Canada — Greenhouse Gas Reporting Program',
        sourceUrl: 'https://open.canada.ca/data/en/dataset/a8ba14b7-7f23-462a-bdbb-83b0ef629823',
        licence: 'Open Government Licence – Canada',
        reportingYear: latest,
        naics: NAICS_LANDFILL,
        counts: counts,
        capacityNote:
            'Capacity is DERIVED, never published. ECCC reports methane emitted; there is no ' +
            'rated MW anywhere in this dataset, unlike EPA LMOP. Every kW here is reported CH4 ' +
            'converted at ' + LMR.CH4_BTU_PER_CF + ' BTU/cf and ' + LMR.GENSET_BTU_PER_KWH +
            ' BTU/kWh with ' + Math.round(LMR.DEFAULT_CAPTURE * 100) + '% collection assumed.',
        cohortNote:
            'Cohort is computed from REPORTED emissions, which is not the same quantity the ' +
            'Regulations tier on. s.5 tiers on methane GENERATED; a site with a working flare ' +
            'destroys most of what it generates and therefore reports a small number. Until the ' +
            'by-emission-source file is wired in, every cohort here is a floor.',
        coverageNote:
            'The Canadian pool is structurally smaller than the US one and that is not a defect ' +
            'in this layer. Canada has about an eighth of the US population, proportionally ' +
            'fewer very large landfills, and meaningful existing LFG capture. Counting Canadian ' +
            'and US landfill prospects side by side compares two different kinds of list: LMOP ' +
            'is a screened candidate register, this is everyone over an emissions threshold.',
        prospects: out
    };

    var dest = path.join(ROOT, 'data', 'landfills-ca.json');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(artifact));
    console.log('wrote ' + dest + '  (' + out.length + ' facilities)');
    console.log('cohorts: ' + JSON.stringify(counts.cohorts));
}

main().catch(function (e) { console.error('FAILED: ' + e.message); process.exit(1); });
