// ===== Operator index build — who owns the gas =====
//
//   node tools/build-operator-index.js              # all regions
//   node tools/build-operator-index.js --region AB  # Alberta only
//   node tools/build-operator-index.js --region US  # US only
//
// A flare with no operator is a coordinate, not a lead. This joins each catalogued flare to the
// company that holds the well licence, so there is somebody to call.
//
// WHAT THIS CAN AND CANNOT PRODUCE
// Everything emitted here is a published filing, never an inference. For Alberta that includes
// the licensee's REGISTERED ADDRESS AND PHONE, because the AER publishes them in ST104 — a real
// switchboard and mailing address for the company, though never a named individual or a direct
// line. Elsewhere only the company name is available. Anything narrower than that (who to ask
// for, a mobile, an email) stays in the user-editable CRM fields on each site, so a typed guess
// can never be mistaken for sourced data.
//
// Sources
//   AB  AER ST37 surface-hole well list — Licensee + SH_Actual_Latitude/Longitude.
//       Coordinate-bearing, so no Alberta Township System conversion is needed. The published
//       zip is 177 MB; only the 32 MB ST37_SH.xlsx member is fetched, via HTTP range requests.
//       AER ST104 business associate registry — address, phone, BA code, licence eligibility.
//   US  flaringmonitor/viirs-flare-data processed observations — company_name already joined to
//       flare coordinates for ND/TX/NM/CO. Reused rather than re-derived. The name carries a
//       stock ticker or "(Private)", which is extracted as an ownership signal.

var fs = require('fs');
var path = require('path');
var https = require('https');
var zlib = require('zlib');
var XLSX = require('./xlsx-lite.js');

var ROOT = path.join(__dirname, '..');
var CACHE = path.join(__dirname, '.cache');
var CATALOG = path.join(ROOT, 'data', 'flare-catalog.json');
var OUT = path.join(ROOT, 'data', 'operators.json');

// A well further than this from the flare is a different pad. VIIRS geolocation is ~375 m and
// a wellpad's flare stack sits within a few hundred metres of the wellhead, so 2 km is generous
// without being credulous. Beyond it the answer is null, never a nearest-anything guess.
var MAX_MATCH_M = 2000;

// ST37 licence statuses that mean the well is finished with. Everything else — Issued,
// Suspension, Amended, Re-Entered — is a licence the company still holds. Measured across the
// full 539,006-row file: Issued 26%, RecCertified 21%, Abandoned 18%, Suspension 12%,
// Cancelled 10%, RecExempt 7%, Amended 6%, Re-Entered 1%.
var TERMINAL_STATUS = {
    'Abandoned': 1, 'RecCertified': 1, 'RecExempt': 1, 'Cancelled': 1
};

var AER_ZIP = 'https://static.aer.ca/prd/documents/sts/st37/ST_37_Excel.zip';
var AER_MEMBER = 'ST37_SH.xlsx';
// ST104 Business Associate list — the licensee registry. Carries the registered ADDRESS and
// PHONE for each company, which is what turns an operator name into something you can act on.
// ~944 KB, refreshed monthly.
var AER_BA = 'https://www.aer.ca/data/codes/BusinessAssociate_Codes.xlsx';
var FM_CSV = 'https://raw.githubusercontent.com/flaringmonitor/viirs-flare-data/main/processed/flaring_monitor_detailed_observations.csv';

function log(m) { process.stdout.write(m + '\n'); }
function progress(m) {
    if (process.stdout.isTTY) process.stdout.write('\r  ' + m + '                    ');
    else process.stdout.write('  ' + m + '\n');
}

// ---- http ----------------------------------------------------------------------------
function request(url, opts, redirects) {
    return new Promise(function(resolve, reject) {
        https.get(url, Object.assign({ headers: { 'User-Agent': 'ion-mining-group/operator-index' } }, opts || {}), function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(request(res.headers.location, opts, (redirects || 0) + 1));
            }
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            }
            var chunks = [], got = 0;
            var total = parseInt(res.headers['content-length'] || '0', 10);
            res.on('data', function(c) {
                chunks.push(c); got += c.length;
                if (total > 2e6) progress('downloading ' + Math.round(100 * got / total) + '%  (' + (got / 1e6).toFixed(0) + ' MB)');
            });
            res.on('end', function() {
                if (process.stdout.isTTY) process.stdout.write('\r');
                resolve({ body: Buffer.concat(chunks), headers: res.headers });
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function head(url, redirects) {
    return new Promise(function(resolve, reject) {
        https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'ion-mining-group/operator-index' } }, function(res) {
            res.resume();
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if ((redirects || 0) > 5) return reject(new Error('too many redirects'));
                return resolve(head(res.headers.location, (redirects || 0) + 1));
            }
            resolve({ status: res.statusCode, headers: res.headers, url: url });
        }).on('error', reject).end();
    });
}

// Pull ONE member out of a remote zip using range requests. The AER publication is 177 MB and
// only its 32 MB surface-hole workbook is wanted; the central directory is read from the tail
// so member offsets are discovered rather than hardcoded (they shift on every republication).
async function fetchZipMember(url, memberSuffix) {
    var h = await head(url);
    var len = parseInt(h.headers['content-length'] || '0', 10);
    if (!len) throw new Error('no content-length; cannot range-request');
    if ((h.headers['accept-ranges'] || '').indexOf('bytes') < 0) {
        log('  server does not advertise range support — falling back to full download');
        var full = await request(url);
        var files = XLSX.unzip(full.body);
        for (var k in files) if (k.indexOf(memberSuffix) >= 0) return files[k];
        throw new Error('member not found: ' + memberSuffix);
    }

    var tailLen = Math.min(len, 300000);
    var tail = (await request(h.url, { headers: { Range: 'bytes=' + (len - tailLen) + '-' } })).body;

    var found = null, i = 0;
    for (;;) {
        i = tail.indexOf('PK', i, 'latin1');
        if (i < 0) break;
        var nlen = tail.readUInt16LE(i + 28);
        if (nlen > 0 && nlen < 300 && i + 46 + nlen <= tail.length) {
            var name = tail.toString('utf8', i + 46, i + 46 + nlen);
            if (name.indexOf(memberSuffix) >= 0) {
                found = { name: name, comp: tail.readUInt32LE(i + 20), offset: tail.readUInt32LE(i + 42) };
                break;
            }
        }
        i += 4;
    }
    if (!found) throw new Error('member not found in central directory: ' + memberSuffix);
    log('  member ' + found.name + '  ' + (found.comp / 1e6).toFixed(0) + ' MB of ' + (len / 1e6).toFixed(0) + ' MB');

    // Local header length varies from the central directory's, so fetch a little extra and read it.
    var slack = 4096;
    var raw = (await request(h.url, {
        headers: { Range: 'bytes=' + found.offset + '-' + (found.offset + found.comp + slack) }
    })).body;
    if (raw.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
    var lnlen = raw.readUInt16LE(26), lelen = raw.readUInt16LE(28);
    var method = raw.readUInt16LE(8);
    var start = 30 + lnlen + lelen;
    var data = raw.slice(start, start + found.comp);
    return method === 0 ? data : zlib.inflateRawSync(data);
}

// ---- geo -----------------------------------------------------------------------------
function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = p2 - p1, dl = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Index the FLARES (16k) and stream candidates past them, rather than holding 539k wells in
// memory. Cell size is the match radius so only the 3x3 neighbourhood needs testing.
function buildFlareGrid(flares) {
    var CELL = MAX_MATCH_M / 111320;
    var grid = {};
    for (var i = 0; i < flares.length; i++) {
        var k = Math.floor(flares[i].lat / CELL) + ',' + Math.floor(flares[i].lon / CELL);
        (grid[k] || (grid[k] = [])).push(i);
    }
    return {
        cell: CELL,
        near: function(lat, lon) {
            var gi = Math.floor(lat / CELL), gj = Math.floor(lon / CELL), out = [];
            for (var di = -1; di <= 1; di++) {
                for (var dj = -1; dj <= 1; dj++) {
                    var b = grid[(gi + di) + ',' + (gj + dj)];
                    if (b) out.push.apply(out, b);
                }
            }
            return out;
        }
    };
}

// ---- Alberta --------------------------------------------------------------------------
async function joinAlberta(flares, grid, matches) {
    log('\n[AB] AER ST37 surface-hole well list');
    var cached = path.join(CACHE, 'ST37_SH.xlsx');
    var buf;
    if (fs.existsSync(cached) && fs.statSync(cached).size > 1e6) {
        log('  using cached ' + path.relative(ROOT, cached));
        buf = fs.readFileSync(cached);
    } else {
        buf = await fetchZipMember(AER_ZIP, AER_MEMBER);
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cached, buf);
    }

    var iLic = -1, iName = -1, iLat = -1, iLon = -1, iStatus = -1, iStatusDate = -1;
    var wells = 0, hits = 0;
    var wellsByLicensee = {};

    XLSX.eachRow(buf, null, function(c, i) {
        if (i === 0) {
            for (var k = 0; k < c.length; k++) {
                var h = String(c[k]).toLowerCase();
                if (h.indexOf('licence_number') >= 0) iLic = k;
                else if (h === 'licensee') iName = k;
                // EXACT match. ST37 carries both Licence_Status and Licence_Status_Date, and
                // 'licence_status_date'.indexOf('licence_status') === 0 is true — so a prefix
                // test matched the status column and was then overwritten by the date column.
                // Every operator record shipped a date in its `status` field as a result.
                else if (h === 'licence_status') iStatus = k;
                else if (h === 'licence_status_date') iStatusDate = k;
                else if (h.indexOf('latitude') >= 0) iLat = k;
                else if (h.indexOf('longitude') >= 0) iLon = k;
            }
            if (iName < 0 || iLat < 0 || iLon < 0) throw new Error('ST37 columns not recognised: ' + JSON.stringify(c));
            return;
        }
        var lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]);
        if (!isFinite(lat) || !isFinite(lon) || lat === 0) return;
        wells++;

        // Well count per licensee, counted in the pass that is already happening. This is the
        // only size signal available anywhere in this project, and it is what separates a major
        // from the small producer actually worth calling: flaring is a genuine annoyance to an
        // operator with a dozen wells and no corporate development team, and a rounding error to
        // one with fifteen thousand.
        //
        // The join is EXACT on the licensee string, deliberately: both this count and the flare
        // match read the same ST37 column, so there is nothing to fuzzy-match. Name matching is
        // banned in this project for good reason — it produced 4 wrong matches out of 5.
        //
        // Counted TWICE. ST37 is a licence history, not a current asset list: across 539,006
        // rows only 26% are Issued, while 21% are RecCertified, 18% Abandoned and 10% Cancelled.
        // Lifetime count answers "how big has this company ever been", active count answers "how
        // big is it now" — and the second is what decides whether flaring is somebody's annoyance
        // or their rounding error. Both are emitted so the basis is never in doubt.
        var lic = iName >= 0 ? String(c[iName] || '').trim() : '';
        if (lic) {
            var e = wellsByLicensee[lic] || (wellsByLicensee[lic] = { total: 0, active: 0 });
            e.total++;
            var st = iStatus >= 0 ? String(c[iStatus] || '').trim() : '';
            if (!TERMINAL_STATUS[st]) e.active++;
        }
        if (wells % 50000 === 0) progress('scanned ' + wells.toLocaleString() + ' wells, ' + hits + ' flares matched');

        var near = grid.near(lat, lon);
        for (var n = 0; n < near.length; n++) {
            var f = flares[near[n]];
            var d = haversine(lat, lon, f.lat, f.lon);
            if (d > MAX_MATCH_M) continue;
            var prev = matches[f.id];
            if (prev && prev.distance_m <= d) continue;
            if (!prev) hits++;
            matches[f.id] = {
                operator: String(c[iName] || '').trim(),
                licence: String(c[iLic] || '').trim() || null,
                status: iStatus >= 0 ? String(c[iStatus] || '').trim() || null : null,
                distance_m: Math.round(d),
                source: 'AER ST37',
                region: 'AB'
            };
        }
    });
    if (process.stdout.isTTY) process.stdout.write('\n');
    log('  ' + wells.toLocaleString() + ' wells scanned, ' + hits.toLocaleString() + ' flares matched to a licensee');
    var licensees = Object.keys(wellsByLicensee).length;
    log('  ' + licensees.toLocaleString() + ' distinct licensees, well counts recorded for size class');
    // Hung off the function rather than returned, because the caller already ignores the return
    // value and threading a new one through would touch every call site for one number.
    joinAlberta.wellsByLicensee = wellsByLicensee;
    return hits;
}

// ---- ST104: registered address + phone per licensee --------------------------------------
// This is the piece that makes a match actionable. Publicly filed head-office details for the
// licensed company — not a named individual and not a direct line, but a real switchboard and
// mailing address, published by the regulator and refreshed monthly.
async function loadBusinessAssociates() {
    log('\n[AB] AER ST104 business associate registry');
    var cached = path.join(CACHE, 'BusinessAssociate_Codes.xlsx');
    var buf;
    if (fs.existsSync(cached) && fs.statSync(cached).size > 100000) {
        log('  using cached ' + path.relative(ROOT, cached));
        buf = fs.readFileSync(cached);
    } else {
        buf = (await request(AER_BA)).body;
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cached, buf);
    }
    var rows = XLSX.read(buf).sheet(0);
    // The sheet opens with a title block, so the header is found rather than assumed.
    var h = -1;
    for (var i = 0; i < 12 && i < rows.length; i++) {
        if ((rows[i] || []).indexOf('Company Name') >= 0) { h = i; break; }
    }
    if (h < 0) throw new Error('ST104 header row not found');
    var hdr = rows[h];
    var iCode = hdr.indexOf('BA Code'), iName = hdr.indexOf('Company Name'),
        iAddr = hdr.indexOf('Address'), iPhone = hdr.indexOf('Phone'),
        iElig = hdr.indexOf('Licence Eligibility Type');

    var byName = {}, n = 0;
    for (var r = h + 1; r < rows.length; r++) {
        var c = rows[r];
        if (!c || !c[iName]) continue;
        var name = String(c[iName]).trim();
        byName[name.toLowerCase()] = {
            baCode: iCode >= 0 ? String(c[iCode] || '').trim() || null : null,
            address: iAddr >= 0 ? String(c[iAddr] || '').trim() || null : null,
            phone: iPhone >= 0 ? String(c[iPhone] || '').trim() || null : null,
            eligibility: iElig >= 0 ? String(c[iElig] || '').trim() || null : null
        };
        n++;
    }
    log('  ' + n.toLocaleString() + ' registered companies');
    return byName;
}

// ---- United States ---------------------------------------------------------------------
async function joinUS(flares, grid, matches) {
    log('\n[US] flaringmonitor observations (ND / TX / NM / CO)');
    var cached = path.join(CACHE, 'flaring_monitor_detailed_observations.csv');
    var buf;
    if (fs.existsSync(cached) && fs.statSync(cached).size > 1e6) {
        log('  using cached ' + path.relative(ROOT, cached));
        buf = fs.readFileSync(cached);
    } else {
        buf = (await request(FM_CSV)).body;
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(cached, buf);
    }

    var text = buf.toString('utf8');
    var nl = text.indexOf('\n');
    var header = text.slice(0, nl).trim().split(',');
    var iCo = header.indexOf('company_name'), iLat = header.indexOf('latitude'),
        iLon = header.indexOf('longitude'), iState = header.indexOf('state'),
        iMonth = header.indexOf('month'), iWells = header.indexOf('wells');
    if (iCo < 0 || iLat < 0 || iLon < 0) throw new Error('flaringmonitor columns not recognised');

    // The file is monthly observations, so one physical flare appears many times. Keep the
    // most RECENT company per coordinate — operators change hands and the current one is who
    // you would actually call.
    var best = {};
    var pos = nl + 1, rows = 0;
    while (pos < text.length) {
        var end = text.indexOf('\n', pos);
        if (end < 0) end = text.length;
        var line = text.slice(pos, end);
        pos = end + 1;
        if (!line) continue;
        rows++;
        // company_name contains commas inside parentheses but never quotes in this file;
        // split on commas and re-join the surplus into the company field by position.
        var f = line.split(',');
        if (f.length < header.length) continue;
        var extra = f.length - header.length;
        var co = extra > 0 ? f.slice(iCo, iCo + 1 + extra).join(',') : f[iCo];
        var la = parseFloat(f[iLat + extra]), lo = parseFloat(f[iLon + extra]);
        if (!isFinite(la) || !isFinite(lo)) continue;
        var key = la.toFixed(4) + ',' + lo.toFixed(4);
        var month = f[iMonth] || '';
        co = (co || '').replace(/^"|"$/g, '').trim();

        // The source genuinely carries unattributed flares (type "wfc" rows have no company).
        // A named observation must therefore beat a blank one REGARDLESS of date — otherwise a
        // recent unattributed sighting silently erases the operator we already knew, which is
        // how 1,980 sites ended up with an empty company name.
        var prev = best[key];
        if (!prev) {
            best[key] = { co: co, lat: la, lon: lo, month: month,
                          state: f[iState] || null, wells: iWells >= 0 ? f[iWells + extra] : null };
        } else {
            var prevNamed = !!prev.co, nowNamed = !!co;
            if ((nowNamed && !prevNamed) || (nowNamed === prevNamed && month > prev.month)) {
                best[key] = { co: co, lat: la, lon: lo, month: month,
                              state: f[iState] || null, wells: iWells >= 0 ? f[iWells + extra] : null };
            }
        }
        if (rows % 50000 === 0) progress('read ' + rows.toLocaleString() + ' observations');
    }
    if (process.stdout.isTTY) process.stdout.write('\n');
    log('  ' + rows.toLocaleString() + ' observations -> ' + Object.keys(best).length.toLocaleString() + ' distinct flare locations');

    var hits = 0, unattributed = 0;
    for (var k in best) {
        var b = best[k];
        // An entry with an empty company is worse than no entry: the panel would print
        // "Operator: " instead of the honest "not identified". Drop it.
        if (!b.co) { unattributed++; continue; }
        var near = grid.near(b.lat, b.lon);
        for (var n = 0; n < near.length; n++) {
            var fl = flares[near[n]];
            var d = haversine(b.lat, b.lon, fl.lat, fl.lon);
            if (d > MAX_MATCH_M) continue;
            var prev = matches[fl.id];
            if (prev && prev.distance_m <= d) continue;
            if (!prev) hits++;
            matches[fl.id] = {
                operator: b.co,
                licence: null,
                wells: b.wells ? parseInt(b.wells, 10) || null : null,
                as_of: b.month || null,
                distance_m: Math.round(d),
                source: 'flaringmonitor',
                region: b.state || 'US'
            };
        }
    }
    log('  ' + hits.toLocaleString() + ' flares matched to a named operator' +
        (unattributed ? '   (' + unattributed.toLocaleString() + ' source locations carry no company and were skipped)' : ''));
    return hits;
}

// ---- main ------------------------------------------------------------------------------
(async function main() {
    var argv = process.argv.slice(2);
    var ri = argv.indexOf('--region');
    var region = ri >= 0 && argv[ri + 1] ? argv[ri + 1].toUpperCase() : 'ALL';

    if (!fs.existsSync(CATALOG)) throw new Error('run tools/build-flare-catalog.js first — ' + CATALOG + ' not found');
    var cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

    // Rebuild the same ids site-catalog.js derives, so the two artifacts join in the browser.
    var flares = cat.sites.map(function(s) {
        return { id: 'vnf_' + s[0].toFixed(4) + '_' + s[1].toFixed(4), lat: s[0], lon: s[1], iso: s[2] };
    });
    log('Operator index build');
    log('  catalog     ' + flares.length.toLocaleString() + ' flare sites');
    log('  match cap   ' + MAX_MATCH_M + ' m');
    log('  region      ' + region);

    var grid = buildFlareGrid(flares);
    var matches = {};

    if (region === 'ALL' || region === 'AB' || region === 'CA') {
        try { await joinAlberta(flares, grid, matches); }
        catch (e) { log('  !! Alberta join failed: ' + e.message); }
    }
    if (region === 'ALL' || region === 'US') {
        try { await joinUS(flares, grid, matches); }
        catch (e) { log('  !! US join failed: ' + e.message); }
    }

    // ---- enrich: registry details, ticker, and a per-company portfolio rollup ----------
    var ba = {};
    if (region === 'ALL' || region === 'AB' || region === 'CA') {
        try { ba = await loadBusinessAssociates(); }
        catch (e) { log('  !! ST104 lookup failed: ' + e.message + '  (operators will have no phone/address)'); }
    }

    // kW per flare id, so a company's total opportunity can be summed.
    var kwById = {};
    for (var s = 0; s < cat.sites.length; s++) {
        kwById['vnf_' + cat.sites[s][0].toFixed(4) + '_' + cat.sites[s][1].toFixed(4)] = cat.sites[s][3];
    }

    var companies = {}, baHits = 0;
    for (var mid in matches) {
        var mt = matches[mid];
        var name = mt.operator;
        if (!companies[name]) {
            companies[name] = { name: name, sites: 0, totalKw: 0, regions: {} };
            // Well count and size class, Alberta only.
            //
            // Deliberately NOT extended to the US. The only size-adjacent signal available there
            // is flaringmonitor's "(Private)" suffix, and the data refutes it as a proxy: the
            // largest private US producers by flare count are among the largest producers in the
            // country, full stop. Applying the small-operator rule to that field would top-rank
            // exactly the counterparties it exists to avoid. A null size class outside Alberta
            // is the honest answer, and it is why this is a FILTER rather than a scored
            // component — a component would score one country and abstain everywhere else.
            var wc = (joinAlberta.wellsByLicensee || {})[name];
            if (wc !== undefined) {
                companies[name].wellsLicensed = wc.total;
                companies[name].wellsActive = wc.active;
                // Classified on ACTIVE licences — what the company runs today, not what it has
                // ever run. The bands are about who answers the phone: an operator with a few
                // dozen wells has no corporate development team to route you through.
                companies[name].sizeClass = wc.active <= 25 ? 'micro'
                                          : wc.active <= 150 ? 'small'
                                          : wc.active <= 1000 ? 'mid' : 'major';
                companies[name].sizeBasis = 'AER ST37 active well licences';
            }
            var rec = ba[name.toLowerCase()];
            if (rec) {
                baHits++;
                companies[name].baCode = rec.baCode;
                companies[name].address = rec.address;
                companies[name].phone = rec.phone;
                companies[name].eligibility = rec.eligibility;
            }
            // flaringmonitor suffixes the ticker: "Devon Energy Corp (DVN)" / "(Private)".
            // Extracting it separates listed companies (public filings, investor relations, a
            // switchboard that answers) from private ones where the search starts colder.
            var tick = /\(([^)]+)\)\s*$/.exec(name);
            if (tick) {
                var t = tick[1].trim();
                if (/^private$/i.test(t)) companies[name].ownership = 'private';
                else if (/^[A-Z.]{1,6}$/.test(t)) { companies[name].ticker = t; companies[name].ownership = 'public'; }
            }
        }
        companies[name].sites++;
        companies[name].totalKw += kwById[mid] || 0;
        companies[name].regions[mt.region] = (companies[name].regions[mt.region] || 0) + 1;
    }
    for (var cn in companies) companies[cn].totalKw = Math.round(companies[cn].totalKw);

    var byRegion = {}, operators = {};
    for (var id in matches) {
        byRegion[matches[id].region] = (byRegion[matches[id].region] || 0) + 1;
        operators[matches[id].operator] = (operators[matches[id].operator] || 0) + 1;
    }
    var payload = {
        v: 1,
        generated: new Date().toISOString().slice(0, 10),
        maxMatchM: MAX_MATCH_M,
        note: 'Operating company from public regulator filings. Regulators do not publish per-site ' +
              'phone numbers or contacts; those are user-entered on each site.',
        sources: {
            AB: 'Alberta Energy Regulator ST37 well list (surface-hole coordinates + licensee) ' +
                'and ST104 business associate registry (address + phone)',
            US: 'flaringmonitor/viirs-flare-data processed observations (company_name, ticker)'
        },
        counts: {
            matched: Object.keys(matches).length, total: flares.length, byRegion: byRegion,
            companies: Object.keys(companies).length, withContact: baHits
        },
        // Per-company rollup: registry contact details plus how much of the catalog each one
        // controls. One call to a company holding twelve flares is worth twelve cold starts.
        companies: companies,
        operators: matches
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload));

    var top = Object.keys(operators).sort(function(a, b) { return operators[b] - operators[a]; }).slice(0, 10);
    log('');
    log('  matched ' + Object.keys(matches).length.toLocaleString() + ' of ' + flares.length.toLocaleString() + ' flares');
    for (var r in byRegion) log('    ' + r + ': ' + byRegion[r].toLocaleString());
    log('  distinct operators  ' + Object.keys(operators).length.toLocaleString() +
        '   (' + baHits.toLocaleString() + ' with registry address/phone)');
    log('  most flares:');
    top.forEach(function(k) { log('    ' + String(operators[k]).padStart(5) + '  ' + k); });
    log('  size ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB raw / ' +
        (zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }).length / 1024).toFixed(0) + ' KB gzipped');
    log('\nwrote ' + path.relative(ROOT, OUT));
})().catch(function(e) {
    console.error('\nBUILD FAILED: ' + e.message);
    console.error(e.stack);
    process.exit(1);
});
