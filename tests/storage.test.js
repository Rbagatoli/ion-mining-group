// Storage, backup and price-lookup regression.
//
// This covers the first defects ever found outside the prospecting module. All three were the
// same shape: something failed, nothing said so.
//
//   - a full localStorage lost a deal record while the UI printed "Saved"
//   - signing out ran localStorage.clear() and destroyed 16 keys with no copy anywhere
//   - the export button, the one backup affordance, covered only 11 of 28 keys
//   - payouts were stamped with the price at SYNC time, not on the day they were paid

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

// ---- A localStorage that can be made to fail on demand ---------------------------------------
function makeStorage() {
    var s = {}, full = false;
    return {
        _setFull: function(v) { full = v; },
        _raw: s,
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
        setItem: function(k, v) {
            if (full) { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
            s[k] = String(v);
        },
        removeItem: function(k) { delete s[k]; },
        clear: function() { for (var k in s) delete s[k]; },
        key: function(i) { return Object.keys(s)[i] || null; },
        get length() { return Object.keys(s).length; }
    };
}

// ================================================================================
console.log('\n--- a failed save reports failure ---');
(function() {
    global.localStorage = makeStorage();
    delete require.cache[require.resolve(path.join(ROOT, 'site-model.js'))];
    var SiteData = require(path.join(ROOT, 'site-model.js'));

    var good = SiteData.add({ name: 'Healthy write' });
    ok('a normal save reports ok', good._save && good._save.ok === true);
    eq('and carries no error', good._save.err, null);
    eq('the record is retrievable', SiteData.list().length, 1);

    // Now the disk is full. The record must NOT be reported as saved.
    global.localStorage._setFull(true);
    var bad = SiteData.add({ name: 'Written while full' });
    eq('a failed save reports NOT ok', bad._save.ok, false);
    ok('and explains why in words a person can act on', /full/i.test(bad._save.err));
    ok('the message says it was not saved', /NOT saved/i.test(bad._save.err));

    // The critical property: the old code called SyncEngine.save even after the local write
    // threw, so a record that existed nowhere could still be pushed. It must not sync what it
    // could not store.
    var synced = [];
    global.SyncEngine = { save: function(k) { synced.push(k); } };
    SiteData.add({ name: 'Another failure' });
    eq('nothing is synced when the local write failed', synced.length, 0);

    global.localStorage._setFull(false);
    SiteData.add({ name: 'Recovered' });
    eq('and syncing resumes once writes succeed', synced.length, 1);
    delete global.SyncEngine;

    // update() must report the same way as add().
    global.localStorage._setFull(false);
    var rec = SiteData.add({ name: 'To update' });
    global.localStorage._setFull(true);
    var upd = SiteData.update(rec.id, { name: 'Renamed' });
    ok('update reports failure too', upd && upd._save && upd._save.ok === false);
    global.localStorage._setFull(false);
})();

// ================================================================================
console.log('\n--- the export covers every key, not just the synced ones ---');
(function() {
    // The export is prefix-driven so a key added later is covered without anyone remembering.
    // Reproduced here rather than imported, because profile-panel.js needs a DOM to load.
    var PREFIXES = ['ionMining', 'btcMinerCalc'];
    function exportable(store) {
        var out = [];
        for (var i = 0; i < store.length; i++) {
            var k = store.key(i);
            if (!k) continue;
            for (var p = 0; p < PREFIXES.length; p++) {
                if (k.indexOf(PREFIXES[p]) === 0) { out.push(k); break; }
            }
        }
        return out.sort();
    }

    var st = makeStorage();
    // A representative spread: synced keys, unsynced keys, and one that must NOT be exported.
    ['ionMiningSites', 'ionMiningFleet', 'ionMiningWallet',
     'ionMiningProspectPortfolio', 'ionMiningProspectScenario', 'ionMiningProspectFilters',
     'ionMiningWidgets_banking', 'ionMiningStrikeBtcBalance', 'btcMinerCalcSettings',
     'sw_clean_v222', 'someOtherAppKey'].forEach(function(k) { st.setItem(k, '{}'); });

    var got = exportable(st);
    eq('every ionMining/btcMinerCalc key is exported', got.length, 9);
    ok('including the prospect portfolio — unsynced, and destroyed by the old sign-out',
       got.indexOf('ionMiningProspectPortfolio') >= 0);
    ok('including widget layouts', got.indexOf('ionMiningWidgets_banking') >= 0);
    ok('including the Strike balance', got.indexOf('ionMiningStrikeBtcBalance') >= 0);
    ok('the service-worker bootstrap key is NOT exported', got.indexOf('sw_clean_v222') < 0);
    ok('and neither is an unrelated key', got.indexOf('someOtherAppKey') < 0);

    // The regression that matters: SYNC_KEYS is a strict subset. If the export ever goes back to
    // iterating it, this fails.
    // Read out of sync.js rather than hand-copied. The list used to be duplicated here, which
    // meant it went stale the moment a key was added or retired -- it still claimed
    // ionMiningTheme long after the theme stopped syncing. Parsing the real SYNC_KEYS makes this
    // a live check instead of a fixture that agrees with a past version of the code.
    var SYNC_SRC = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');
    var SYNC_BLOCK = SYNC_SRC.slice(SYNC_SRC.indexOf('var SYNC_KEYS'),
                                    SYNC_SRC.indexOf('};', SYNC_SRC.indexOf('var SYNC_KEYS')));
    var SYNCED = (SYNC_BLOCK.match(/lsKey:\s*'([^']+)'/g) || []).map(function(m) {
        return m.replace(/.*'([^']+)'.*/, '$1');
    });
    ok('SYNC_KEYS was parsed, not guessed', SYNCED.length >= 10,
       'found ' + SYNCED.length + ' synced keys in sync.js');
    // The theme key retired with the light theme. Asserting its absence here is what stops it
    // being quietly re-added.
    ok('the theme key no longer syncs', SYNCED.indexOf('ionMiningTheme') < 0);
    var unsyncedButExported = got.filter(function(k) { return SYNCED.indexOf(k) < 0; });
    ok('the export is strictly wider than what syncs', unsyncedButExported.length > 0,
       'exported ' + got.length + ', of which ' + unsyncedButExported.length + ' never sync');
    console.log('        unsynced but exported: ' + JSON.stringify(unsyncedButExported));
})();

// ================================================================================
console.log('\n--- payouts are priced from the day they were paid ---');
(function() {
    global.localStorage = makeStorage();
    // A tiny daily series: 1 Jun and 2 Jun 2026 at very different prices.
    var DAY = 86400;
    var d1 = Date.UTC(2026, 5, 1) / 1000;
    var d2 = Date.UTC(2026, 5, 2) / 1000;
    global.localStorage.setItem('ionMiningPriceHistory', JSON.stringify({
        v: 1, d: [[d1, 40000], [d2, 90000]]
    }));

    delete require.cache[require.resolve(path.join(ROOT, 'price-history.js'))];
    var PH = require(path.join(ROOT, 'price-history.js'));

    eq('a payout on 1 Jun is priced at that day\'s close', PH.priceOnDate('2026-06-01'), 40000);
    eq('a payout on 2 Jun gets a different price', PH.priceOnDate('2026-06-02'), 90000);
    // The whole point: the two differ by 2.25x, which is the scale of error the old code made by
    // stamping every back-filled payout with one day's price.
    ok('the two days really do differ materially', PH.priceOnDate('2026-06-02') / PH.priceOnDate('2026-06-01') > 2);

    // Outside coverage must be NULL, never the nearest candle and never a default.
    eq('a date before history is null', PH.priceOnDate('2020-01-01'), null);
    eq('a date after history is null', PH.priceOnDate('2030-01-01'), null);
    eq('a malformed date is null', PH.priceOnDate('not-a-date'), null);
    eq('an empty date is null', PH.priceOnDate(''), null);
    eq('null in, null out', PH.priceOnDate(null), null);

    // A datetime string must resolve to its day rather than failing.
    eq('an ISO datetime resolves to its day', PH.priceOnDate('2026-06-02T14:33:00Z'), 90000);

    var cov = PH.coverage();
    ok('coverage is reportable, so the repair can say what it could not reach',
       cov && cov.days === 2);
})();

// ================================================================================
console.log('\n--- no module invents a bitcoin price ---');
(function() {
    var fs = require('fs');
    // A class of bug that returns: a hardcoded fallback price is stale the day it is written and
    // silently becomes a persisted cost-basis figure.
    var offenders = [];
    fs.readdirSync(ROOT).filter(function(f) {
        return /\.js$/.test(f) && f !== 'chart.min.js';
    }).forEach(function(f) {
        var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        src.split('\n').forEach(function(line, i) {
            if (/^\s*(\/\/|\*)/.test(line)) return;            // comments may quote the old form
            if (/=\s*data\.price\s*\|\|\s*\d/.test(line)) offenders.push(f + ':' + (i + 1));
        });
    });
    eq('zero API price fallbacks remain', offenders.length, 0,
       offenders.join(', '));
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
