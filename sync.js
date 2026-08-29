// ===== PROTON MINING — Cross-Device Sync Engine =====

var SyncEngine = (function() {

    var _debounceTimers = {};
    var _listeners = {};
    var _syncing = false;
    var _recentSaves = {};

    // Firestore collection/doc mapping
    // Each key maps to: users/{uid}/data/{key}
    var SYNC_KEYS = {
        fleet:       { lsKey: 'protonMiningFleet' },
        wallet:      { lsKey: 'protonMiningWallet' },
        payouts:     { lsKey: 'protonMiningPayouts' },
        electricity: { lsKey: 'protonMiningElectricity' },
        calculator:  { lsKey: 'btcMinerCalcSettings' },
        settings:    { lsKey: 'protonMiningSettings' },
        alerts:      { lsKey: 'protonMiningAlerts' },
        currency:    { lsKey: 'protonMiningCurrency' },
        // theme: RETIRED. The app is dark only. The Firestore document is deliberately left
        // in place rather than deleted -- a user still on the old build who synced afterwards
        // would read null, fall back to 'dark', and have their theme change under them.
        scenarios:   { lsKey: 'protonMiningScenarios' },
        sites:       { lsKey: 'protonMiningSites' },
        // Deal state, not view state — a shortlisted portfolio and a saved pricing scenario are
        // work, and work belongs on every device. Deliberately NOT added: the filter selection,
        // table view and panel open/closed state. Where you happen to be looking should not
        // follow you between machines. Those are still covered by the export, which now walks
        // every protonMining* key rather than this list.
        prospectPortfolio: { lsKey: 'protonMiningProspectPortfolio' },
        prospectScenario:  { lsKey: 'protonMiningProspectScenario' },
        // A named search is on the work side of that line, not the view side: it is a
        // deliberately composed set of criteria, and having to rebuild it on the laptop after
        // composing it on the desktop is the friction the feature exists to remove. The
        // last-used filters above stay local for exactly the opposite reason.
        prospectSearches:  { lsKey: 'protonMiningProspectSearches' },
        // The CRM. Both belong on every device for the same reason `sites` does:
        // a pipeline stage set on the laptop and an interaction logged on the
        // phone are the same deal, and a record of a call that exists on one
        // machine is a record you will look for on the other and not find.
        crmConfig:         { lsKey: 'protonCrmConfig' },
        crmLog:            { lsKey: 'protonCrmLog' },
        crmFollowups:      { lsKey: 'protonCrmFollowups' },
        contacts:          { lsKey: 'protonContacts' },
        crmEnrichment:     { lsKey: 'protonCrmEnrichment' },
        crmDocuments:      { lsKey: 'protonCrmDocuments' },
        /* The execution workspace. Registered here at the same time the store is created
           rather than afterwards: an unregistered store is a single-browser store, and this one
           holds budget commitments and payment applications. */
        projects:          { lsKey: 'protonMiningProjects' }
    };

    function getDb() {
        if (typeof firebase === 'undefined') return null;
        return firebase.firestore();
    }

    function getUserDocRef(key) {
        var db = getDb();
        if (!db) return null;
        var user = ProtonAuth.getUser();
        if (!user) return null;
        return db.collection('users').doc(user.uid).collection('data').doc(key);
    }

    // Save data to Firestore (debounced)
    /* THE MISSING SECOND ARGUMENT, WHICH SILENTLY DISABLED SYNC FOR SIX STORES.
     *
     * Every CRM module called save('crmLog') with no data. JSON.parse(JSON.stringify(undefined))
     * is JSON.parse("undefined"), a SyntaxError -- thrown inside the debounce timer, long after
     * the caller's try/catch has returned. So ref.set was never reached (nothing ever uploaded)
     * AND neither .then nor .catch ran, so the _recentSaves flag set on the line above was never
     * cleared. There is no other path that clears it: grep gives exactly four references, and
     * stopAll() clears _listeners, not this. The key was therefore poisoned for the life of the
     * page and the listener at :118 dropped every inbound change for it.
     *
     * The instance is fixed at the six call sites. The CLASS is fixed here, because the reason
     * this survived is that it was invisible:
     *   - a missing payload is refused BEFORE _recentSaves is set, so a bad call can no longer
     *     deafen the listener as a side effect
     *   - it says so on the console rather than failing mutely
     *   - the debounce body is wrapped, and the flag is cleared in a finally, so no future throw
     *     anywhere in that block can leave a key permanently suppressed again
     *
     * tests/sync-coverage.test.js asserts every SyncEngine.save() call in the repo passes data. */
    function save(key, data) {
        if (!ProtonAuth.isSignedIn()) return;
        if (!SYNC_KEYS[key]) return;
        if (arguments.length < 2 || data === undefined) {
            console.error('[Sync] save("' + key + '") called with no data — nothing was uploaded. ' +
                          'This is a bug in the caller: pass the object you just wrote.');
            return;
        }

        // Mark as recently saved so listener ignores our own writes
        _recentSaves[key] = true;

        // Debounce: wait 500ms after last call before writing
        if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
        _debounceTimers[key] = setTimeout(function() {
            var ref = getUserDocRef(key);
            if (!ref) { delete _recentSaves[key]; return; }

            var payload;
            try {
                payload = {
                    data: JSON.parse(JSON.stringify(data)),
                    // Written and, today, read by nothing. Left in place deliberately: if a
                    // conflict tiebreak is ever wanted, the field is already being recorded on
                    // every write and the history will be there to use.
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
            } catch (e) {
                delete _recentSaves[key];
                console.error('[Sync] ' + key + ' could not be encoded, nothing was uploaded:',
                              e && e.message);
                return;
            }

            ref.set(payload, { merge: true }).then(function() {
                setTimeout(function() { delete _recentSaves[key]; }, 3000);
            }).catch(function(err) {
                delete _recentSaves[key];
                console.warn('[Sync] Write failed for ' + key + ':', err.message);
            });
        }, 500);
    }

    // Listen for remote changes on a key
    function listen(key, callback) {
        if (!ProtonAuth.isSignedIn()) return;
        if (!SYNC_KEYS[key]) return;

        // Unsubscribe previous listener if any
        if (_listeners[key]) {
            _listeners[key]();
        }

        var ref = getUserDocRef(key);
        if (!ref) return;

        var warmup = true;
        setTimeout(function() { warmup = false; }, 2000);

        _listeners[key] = ref.onSnapshot(function(doc) {
            // Skip all snapshots during 2-second warmup (handles page changes)
            if (warmup) return;

            // Skip local writes — only react to server-confirmed remote changes
            if (doc.metadata.hasPendingWrites) return;

            // Skip if this change came from our own save (avoid loops)
            if (_syncing) return;

            // Skip if we recently wrote this key from this device
            if (_recentSaves[key]) return;

            if (doc.exists) {
                var remote = doc.data();
                if (remote && remote.data) {
                    // Compare with current localStorage — skip if identical
                    var lsKey = SYNC_KEYS[key].lsKey;
                    var current = localStorage.getItem(lsKey);
                    var remoteStr = (key === 'currency') ? remote.data : JSON.stringify(remote.data);
                    if (current === remoteStr) return;

                    _syncing = true;

                    // Update localStorage
                    if (key === 'currency') {
                        localStorage.setItem(lsKey, remote.data);
                    } else {
                        localStorage.setItem(lsKey, JSON.stringify(remote.data));
                    }

                    // Call the page callback to re-render
                    if (typeof callback === 'function') {
                        try { callback(remote.data); } catch(e) {}
                    }

                    setTimeout(function() { _syncing = false; }, 100);
                }
            }
        }, function(err) {
            console.warn('[Sync] Listen failed for ' + key + ':', err.message);
        });
    }

    // Stop all listeners
    function stopAll() {
        Object.keys(_listeners).forEach(function(key) {
            if (_listeners[key]) {
                _listeners[key]();
                delete _listeners[key];
            }
        });
    }

    // Pull all data from Firestore on sign-in
    /* ===== A PULL MUST NOT LOSE RECORDS THIS DEVICE ALREADY HAS =====
     *
     * pullAll() used to write every remote document straight into localStorage with no
     * comparison of any kind -- no version, no timestamp, no record count. On sign-in that is a
     * silent overwrite: a device holding twelve projects, signing into an account whose cloud
     * copy has three, ends up with three and reloads the page to show you so. Firestore
     * persistence is never enabled (firebase-config.js does not call enablePersistence), so
     * anything written while offline lives only in memory and is exactly what a pull destroys.
     *
     * THE GUARD IS A SET COMPARISON, NOT A COUNT. "Fewer records" would miss the case that
     * matters most: a remote copy with the same number of records but a DIFFERENT one missing --
     * two devices each adding a project offline, then one signing in. Comparing ids catches
     * that; comparing lengths does not.
     *
     * IT REFUSES RATHER THAN MERGING, deliberately. Merging means deciding which copy of a
     * record present in BOTH wins, and nothing in this repo can answer that yet: sync.js:79
     * writes updatedAt on every save and nothing reads it. That tiebreak is separately filed.
     * Refusing keeps both copies intact -- local stays, remote stays -- and the next ordinary
     * save pushes local up under merge:true, which set-unions the maps. Losing nothing and
     * saying so beats resolving it wrongly and silently.
     *
     * A KEY WITH NO DECLARED CONTAINER IS PULLED UNGUARDED, AND SAID SO. Guessing at a shape
     * would produce a guard that quietly passes on stores it cannot actually read, which is the
     * decorative-guard failure this codebase keeps finding. The verdict names them instead. */
    var RECORD_CONTAINER = {
        projects:          'byProject',      // map keyed by id
        sites:             'sites',          // array of records
        crmLog:            'entries',
        crmFollowups:      'items',
        contacts:          'contacts',
        crmDocuments:      'items',
        crmEnrichment:     'byProspect',     // map keyed by prospect id
        fleet:             'miners',
        prospectSearches:  'items'
    };

    /* Ids of the records in a parsed store, or NULL when the shape is not one this can read.
       Null is not an empty set: an empty set would say "this store has nothing to lose", which
       is the reassuring answer and would clear every pull. */
    function idsIn(parsed, container) {
        if (!container || !parsed || typeof parsed !== 'object') return null;
        var box = parsed[container];
        if (!box || typeof box !== 'object') return null;
        var out = [], i;
        if (Array.isArray(box)) {
            for (i = 0; i < box.length; i++) {
                if (!box[i] || typeof box[i] !== 'object' ||
                    box[i].id === undefined || box[i].id === null) return null;
                out.push(String(box[i].id));
            }
            return out;
        }
        for (var k in box) if (Object.prototype.hasOwnProperty.call(box, k)) out.push(String(k));
        return out;
    }

    /* The whole decision, as a pure function of the two copies, so it can be tested without
       firebase, without a signed-in user and without a network. */
    function pullVerdict(key, localRaw, remoteData) {
        var container = RECORD_CONTAINER[key];
        var v = { key: key, write: true, guarded: false, missing: [],
                  localCount: null, remoteCount: null, reason: null };
        if (!container) { v.reason = 'no record container declared for this store'; return v; }
        if (localRaw === null || localRaw === undefined || localRaw === '') {
            v.guarded = true;
            v.reason = 'nothing stored on this device yet, so the pull cannot lose anything';
            return v;
        }
        var localParsed;
        try { localParsed = JSON.parse(localRaw); } catch (e) { localParsed = null; }
        var localIds = idsIn(localParsed, container);
        var remoteIds = idsIn(remoteData, container);
        if (localIds === null) {
            /* Nothing readable here to lose. A store this cannot parse is one the module's own
               read() will reject and replace anyway, so the remote copy can only be an
               improvement. */
            v.reason = 'the local copy is not in a shape this can compare';
            return v;
        }
        if (remoteIds === null) {
            /* THE OTHER DIRECTION IS NOT SYMMETRIC, and treating it as such was a bug in the
               first version of this function. An unreadable REMOTE written over readable local
               records destroys them twice over: the bytes replace real data, and then the
               store's own read() rejects the shape and falls back to empty. Refused whenever
               there is actually something here to lose. */
            v.localCount = localIds.length;
            if (localIds.length) {
                v.guarded = true;
                v.write = false;
                v.reason = 'the cloud copy is not in a shape this can read, and this device has ' +
                           localIds.length + ' record' + (localIds.length === 1 ? '' : 's') +
                           ' that overwriting it would destroy';
                return v;
            }
            v.reason = 'the cloud copy is not in a shape this can compare, and this device has ' +
                       'no records to lose';
            return v;
        }
        v.guarded = true;
        v.localCount = localIds.length;
        v.remoteCount = remoteIds.length;
        var have = {};
        for (var i = 0; i < remoteIds.length; i++) have[remoteIds[i]] = true;
        for (var j = 0; j < localIds.length; j++) {
            if (!have[localIds[j]]) v.missing.push(localIds[j]);
        }
        if (v.missing.length) {
            v.write = false;
            v.reason = 'the cloud copy is missing ' + v.missing.length + ' record' +
                       (v.missing.length === 1 ? '' : 's') + ' this device already has';
        }
        return v;
    }

    function pullAll(callback) {
        if (!ProtonAuth.isSignedIn()) return;
        var db = getDb();
        if (!db) return;
        var user = ProtonAuth.getUser();
        if (!user) return;

        var ref = db.collection('users').doc(user.uid).collection('data');
        ref.get().then(function(snapshot) {
            _syncing = true;
            var pulled = 0, held = [], unguarded = [];

            snapshot.forEach(function(doc) {
                var key = doc.id;
                if (SYNC_KEYS[key] && doc.data() && doc.data().data) {
                    var lsKey = SYNC_KEYS[key].lsKey;
                    var remoteData = doc.data().data;

                    /* currency is a bare string, not a record store, and has no container --
                       pullVerdict returns write:true unguarded for it, which is correct. */
                    var v = pullVerdict(key, localStorage.getItem(lsKey), remoteData);
                    v.lsKey = lsKey;
                    if (!v.write) { held.push(v); return; }
                    if (!v.guarded) unguarded.push(key);

                    if (key === 'currency') {
                        localStorage.setItem(lsKey, remoteData);
                    } else {
                        localStorage.setItem(lsKey, JSON.stringify(remoteData));
                    }
                    pulled++;
                }
            });

            setTimeout(function() { _syncing = false; }, 100);

            if (held.length) {
                console.warn('[Sync] Held back ' + held.length + ' store(s) whose cloud copy ' +
                             'is missing records this device has:',
                             held.map(function (h) { return h.key + ' (' + h.missing.length + ')'; }).join(', '));
            }
            if (typeof callback === 'function') callback(pulled, held, unguarded);
        }).catch(function(err) {
            console.warn('[Sync] Pull all failed:', err.message);
            if (typeof callback === 'function') callback(0, [], []);
        });
    }

    // Push all local data to Firestore (on first sign-in when cloud is empty)
    function pushAll() {
        if (!ProtonAuth.isSignedIn()) return;

        Object.keys(SYNC_KEYS).forEach(function(key) {
            var lsKey = SYNC_KEYS[key].lsKey;
            var raw = localStorage.getItem(lsKey);
            if (!raw) return;

            var data;
            if (key === 'currency') {
                data = raw;
            } else {
                try { data = JSON.parse(raw); } catch(e) { return; }
            }

            save(key, data);
        });
    }

    return {
        save: save,
        listen: listen,
        stopAll: stopAll,
        pullAll: pullAll,
        pushAll: pushAll,
        SYNC_KEYS: SYNC_KEYS,
        RECORD_CONTAINER: RECORD_CONTAINER,
        // Exported so the pull guard can be tested as a pure function: no firebase, no signed-in
        // user, no network. The rest of pullAll is transport around this decision.
        pullVerdict: pullVerdict,
        idsIn: idsIn,
        isSyncing: function() { return _syncing; }
    };

})();

/* Every other module in this repo ends with this and sync.js did not, which is why the pull
   path had never had a unit test of any kind. */
if (typeof module !== 'undefined' && module.exports) module.exports = SyncEngine;
