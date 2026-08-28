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
    function pullAll(callback) {
        if (!ProtonAuth.isSignedIn()) return;
        var db = getDb();
        if (!db) return;
        var user = ProtonAuth.getUser();
        if (!user) return;

        var ref = db.collection('users').doc(user.uid).collection('data');
        ref.get().then(function(snapshot) {
            _syncing = true;
            var pulled = 0;

            snapshot.forEach(function(doc) {
                var key = doc.id;
                if (SYNC_KEYS[key] && doc.data() && doc.data().data) {
                    var lsKey = SYNC_KEYS[key].lsKey;
                    var remoteData = doc.data().data;

                    if (key === 'currency') {
                        localStorage.setItem(lsKey, remoteData);
                    } else {
                        localStorage.setItem(lsKey, JSON.stringify(remoteData));
                    }
                    pulled++;
                }
            });

            setTimeout(function() { _syncing = false; }, 100);

            if (typeof callback === 'function') callback(pulled);
        }).catch(function(err) {
            console.warn('[Sync] Pull all failed:', err.message);
            if (typeof callback === 'function') callback(0);
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
        isSyncing: function() { return _syncing; }
    };

})();
