#!/usr/bin/env node
// Build data/ghgrp-contacts.json — the counterparty behind each landfill.
//
// WHY THIS EXISTS
//
// LMOP names the landfill owner as a free-text string: "County of Monmouth", "WM",
// "Napa-Vallejo Waste Management Authority". That is who EPA thinks owns the dump. It is not
// necessarily the legal entity that would sign a deal, it carries no ownership share, and it has
// no postcode attached to it.
//
// EPA's Greenhouse Gas Reporting Program publishes, for every facility that reports under
// Subpart HH (municipal solid waste landfills):
//
//   parent_company   the legal owning entity, WITH its ownership percentage, and jointly-held
//                    sites listed as such -- "COUNTY OF MONMOUTH NEW JERSEY (100%)"
//   address1/2, city, state, zip   the facility's own address, complete, including the postcode
//   frs_id           the EPA Facility Registry Service key, which is the way into ECHO for
//                    permit and violation history -- the thing source-landfill.js permitFor()
//                    currently returns null for on every single landfill
//
// THE JOIN IS EXACT. GHGRP's `facility_id` is the same integer LMOP publishes as its GHGRP ID,
// which data/landfills.json already carries on 1,755 of 1,908 rows. No name matching is involved,
// which matters because name matching is banned in this repo for good reason -- a name join of
// SAND POINT to Trident Seafoods was wrong in four cases out of five.
//
// Measured when this was written:
//     landfills with a ghgrpId that join                1,754 / 1,755   (100%)
//     ...of those, with a street address                1,730           ( 99%)
//     ...with a parent_company                          1,754           (100%)
//     ...with an frs_id                                 1,754           (100%)
//     shutdown projects with a generator still standing   411 / 462     ( 89%)
//
// WHAT THIS IS NOT. It is not a phone number, an email address, or a named person. EPA publishes
// none of those for a landfill, and neither does FRS -- I checked frs_program_facility directly
// and it returns the facility location again, not a contact. It is also NOT the owner's head
// office: address1 is the FACILITY. For a county authority, mail addressed to the named parent
// entity at the site generally reaches someone; for a WM or Republic site it will not, and the
// UI must not pretend otherwise.
//
// LICENCE: a work of the US federal government, public domain. No API key, no registration, no
// terms to accept -- which is why this is buildable at all where VNF and Petrinex were not.
//
// USAGE:  node tools/build-ghgrp-contacts.js
//         node tools/build-ghgrp-contacts.js --offline   (re-read tools/.cache, no network)

'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');

var ROOT = path.join(__dirname, '..');
var CACHE_DIR = path.join(__dirname, '.cache');
var CACHE = path.join(CACHE_DIR, 'ghgrp-subpart-hh.json');
var OUT = path.join(ROOT, 'data', 'ghgrp-contacts.json');
var LANDFILLS = path.join(ROOT, 'data', 'landfills.json');

var BASE = 'https://data.epa.gov/efservice/pub_dim_facility/reported_subparts/CONTAINING/HH';
var PAGE = 5000;
// The table is one row per facility per REPORTING YEAR, so a full pull is ~16k rows for ~1,300
// facilities. Bounded so a change at EPA's end cannot spin this forever.
var MAX_PAGES = 12;

function get(url) {
    return new Promise(function(resolve, reject) {
        var req = https.get(url, { timeout: 120000 }, function(res) {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            }
            var buf = '';
            res.setEncoding('utf8');
            res.on('data', function(d) { buf += d; });
            res.on('end', function() {
                try { resolve(JSON.parse(buf)); }
                catch (e) { reject(new Error('not JSON from ' + url + ': ' + buf.slice(0, 200))); }
            });
        });
        req.on('timeout', function() { req.destroy(new Error('timeout: ' + url)); });
        req.on('error', reject);
    });
}

async function fetchAll() {
    var rows = [];
    for (var p = 0; p < MAX_PAGES; p++) {
        var lo = p * PAGE, hi = lo + PAGE - 1;
        var url = BASE + '/ROWS/' + lo + ':' + hi + '/JSON';
        process.stdout.write('  page ' + p + ' (' + lo + '-' + hi + ') ... ');
        var page = await get(url);
        console.log(page.length + ' rows');
        rows = rows.concat(page);
        if (page.length < PAGE) return rows;
    }
    // Hitting the cap means EPA returned more than expected. Say so rather than silently
    // shipping a truncated index that looks complete.
    throw new Error('MAX_PAGES reached with a full page still coming back — the Subpart HH ' +
                    'population has grown past ' + (MAX_PAGES * PAGE) + ' rows. Raise MAX_PAGES.');
}

function str(v) {
    if (v === null || v === undefined) return null;
    var t = String(v).trim();
    return t === '' ? null : t;
}

async function main() {
    var offline = process.argv.indexOf('--offline') >= 0;
    var rows;

    if (offline) {
        if (!fs.existsSync(CACHE)) throw new Error('--offline but no cache at ' + CACHE);
        rows = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
        console.log('offline: ' + rows.length + ' cached rows');
    } else {
        console.log('Fetching EPA GHGRP Subpart HH facilities...');
        rows = await fetchAll();
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(rows));
        console.log('cached ' + rows.length + ' rows');
    }

    // One row per facility per year. Keep the LATEST year that actually carries an address --
    // not simply the latest year, because a facility whose most recent filing has a null address1
    // would lose an address it published perfectly well two years earlier.
    var best = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var id = str(r.facility_id);
        if (!id) continue;
        var cur = best[id];
        var year = Number(r.year) || 0;
        if (!cur) { best[id] = r; continue; }
        var curHas = !!str(cur.address1), newHas = !!str(r.address1);
        if (newHas && !curHas) { best[id] = r; continue; }
        if (newHas === curHas && year > (Number(cur.year) || 0)) best[id] = r;
    }

    var facilities = {};
    var ids = Object.keys(best);
    for (var j = 0; j < ids.length; j++) {
        var f = best[ids[j]];
        facilities[ids[j]] = {
            name: str(f.facility_name),
            // parent_company is the reason this file exists. It carries the ownership share and
            // names joint holdings, neither of which LMOP's owner string can express.
            parent: str(f.parent_company),
            address: str(f.address1),
            address2: str(f.address2),
            city: str(f.city),
            state: str(f.state),
            zip: str(f.zip),
            county: str(f.county),
            frsId: str(f.frs_id),
            naics: str(f.naics_code),
            latestYear: Number(f.year) || null
        };
    }

    // Coverage, measured against the real landfill artifact rather than asserted. A number in the
    // header of this file that nobody recomputes is a number that goes stale.
    var cov = null;
    if (fs.existsSync(LANDFILLS)) {
        var lf = JSON.parse(fs.readFileSync(LANDFILLS, 'utf8')).projects || [];
        var withId = lf.filter(function(x) { return x.ghgrpId; });
        var joined = withId.filter(function(x) { return facilities[String(x.ghgrpId)]; });
        var addressed = joined.filter(function(x) { return facilities[String(x.ghgrpId)].address; });
        var targets = lf.filter(function(x) {
            return (x.ratedMw || x.actualMw) && /shutdown/i.test(String(x.projectStatus || ''));
        });
        var tJoined = targets.filter(function(x) { return x.ghgrpId && facilities[String(x.ghgrpId)]; });
        cov = {
            landfillRows: lf.length,
            withGhgrpId: withId.length,
            joined: joined.length,
            joinedWithAddress: addressed.length,
            shutdownWithGeneration: targets.length,
            shutdownWithGenerationJoined: tJoined.length
        };
    }

    var out = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        source: 'EPA Greenhouse Gas Reporting Program, Subpart HH (municipal solid waste landfills)',
        sourceUrl: 'https://data.epa.gov/efservice/pub_dim_facility',
        licence: 'US federal government work — public domain. No API key required.',
        joinKey: 'facility_id, which is the same integer LMOP publishes as its GHGRP ID. An ' +
                 'exact integer join; no name matching is involved anywhere in this file.',
        addressNote: 'address is the FACILITY address, not the owner head office. For a county ' +
                     'or municipal authority, mail addressed to the named parent entity at this ' +
                     'address generally reaches someone. For a site held by a national waste ' +
                     'company it will not — write to the parent instead.',
        contactNote: 'EPA publishes no telephone number, no email address and no named ' +
                     'individual for a landfill. FRS does not either — frs_program_facility ' +
                     'returns the facility location again. Reaching a person means the state ' +
                     'business registry, the authority website, or board minutes, and stays ' +
                     'manual by design.',
        counts: {
            facilities: ids.length,
            withParent: ids.filter(function(k) { return facilities[k].parent; }).length,
            withAddress: ids.filter(function(k) { return facilities[k].address; }).length,
            withFrsId: ids.filter(function(k) { return facilities[k].frsId; }).length,
            coverage: cov
        },
        facilities: facilities
    };

    fs.writeFileSync(OUT, JSON.stringify(out));
    var kb = Math.round(fs.statSync(OUT).size / 1024);

    console.log('');
    console.log('wrote ' + path.relative(ROOT, OUT) + '  (' + kb + ' KB)');
    console.log('  facilities   ' + out.counts.facilities);
    console.log('  with parent  ' + out.counts.withParent);
    console.log('  with address ' + out.counts.withAddress);
    console.log('  with FRS id  ' + out.counts.withFrsId);
    if (cov) {
        console.log('');
        console.log('  landfills carrying a ghgrpId : ' + cov.withGhgrpId + ' of ' + cov.landfillRows);
        console.log('  ...joining to GHGRP          : ' + cov.joined);
        console.log('  ...with a street address     : ' + cov.joinedWithAddress);
        console.log('  shutdown + generator standing: ' + cov.shutdownWithGenerationJoined +
                    ' of ' + cov.shutdownWithGeneration + ' reached');
    }
    console.log('');
    console.log('Remember: add data/ghgrp-contacts.json to the ASSETS list in sw.js, or an ' +
                'offline visit 404s on it.');
}

main().catch(function(e) {
    console.error('FAILED: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
