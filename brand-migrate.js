/* ===== PROTON MINING — carrying the old brand's storage forward =====
 *
 * The rebrand renamed every localStorage key from the ionMining, ionStrike and
 * ionPortal prefixes to protonMining, protonStrike and protonPortal. The code
 * moved; the data in everybody's browser did not. Without this file the app
 * comes up looking new and empty on the first load after the rename.
 *
 * (Those prefixes are written out rather than star-globbed because a "*" next to
 * a "/" ends this comment, which is exactly how the first draft of this file
 * failed to parse.)
 *
 * HOW BAD IT WOULD ACTUALLY BE, because the answer decides how much this file
 * needs to do. The thirteen keys in sync.js's SYNC_KEYS are safe on their own:
 * Firestore stores them under a LOGICAL name (users/{uid}/data/fleet), not under
 * the localStorage key, so pullAll() writes the cloud copy into whatever lsKey
 * the current build asks for. Fleet, wallet, payouts, sites, scenarios, the
 * prospect portfolio and saved searches all come back on the next signed-in
 * sync, and nothing here is needed for them.
 *
 * What does NOT come back is everything deliberately kept local:
 *
 *     ionStrikeUser / ionStrikeSession / ionStrikeOnchainAddr
 *         a live Strike authorisation. Losing it means re-authorising.
 *     ionMiningWidgets          the dashboard layout somebody arranged
 *     ionMiningOnboarded/Step   onboarding replays for an existing operator
 *     ionMiningProspect*View/Filters/Colour/Sources/Refine
 *         the prospecting view state sync.js explicitly refuses to sync
 *     ionMiningPrice/Difficulty/FeeHistory   cached series; they refill, slowly
 *     ionPortalSession          a signed-in counterparty gets logged out
 *
 * So: a copy, not a move.
 *
 * WHY IT COPIES AND NEVER DELETES. If this runs on a build that is later rolled
 * back, the old keys are still there and the old build still works. The cost is
 * a duplicate set of keys in storage until somebody clears them, which is
 * cheaper than either direction of data loss.
 *
 * WHY IT NEVER OVERWRITES. If a new-name key already holds something, that is
 * newer than anything under the old name — the user has used the new build. A
 * second visit, a second device, or a sync that already landed must not be
 * clobbered by a stale pre-rename copy.
 *
 * PREFIX-MAPPED, NOT A LIST OF KEYS. There were 37 at the time of writing and a
 * hand-kept list would miss the next one. Anything matching a known old prefix
 * moves; anything else is left exactly alone — which matters, because
 * btcMinerCalcSettings and the Firebase keys share this storage and are not ours
 * to touch.
 *
 * Load FIRST, before anything reads a key. No dependencies. */

(function () {
    'use strict';

    /* Longest prefix first: ionMining must be tested before ion, or a rule for
       the short form would claim keys belonging to the long one. */
    var MAP = [
        ['ionMining', 'protonMining'],
        ['ionStrike', 'protonStrike'],
        ['ionPortal', 'protonPortal'],
        ['ionFacility', 'protonFacility'],
        ['ionPrepay', 'protonPrepay'],
        ['ionSettings', 'protonSettings'],
        ['ionCenterText', 'protonCenterText'],
        ['ionMark', 'protonMark']
    ];

    var DONE = 'protonBrandMigrated';

    function newNameFor(key) {
        for (var i = 0; i < MAP.length; i++) {
            if (key.indexOf(MAP[i][0]) === 0) {
                return MAP[i][1] + key.slice(MAP[i][0].length);
            }
        }
        return null;
    }

    try {
        if (localStorage.getItem(DONE)) return;

        /* Snapshot the key list before writing. Mutating localStorage while
           iterating it by index is how you skip half the keys. */
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));

        var moved = 0;
        for (var k = 0; k < keys.length; k++) {
            var oldKey = keys[k];
            if (!oldKey) continue;
            var target = newNameFor(oldKey);
            if (!target) continue;
            if (localStorage.getItem(target) !== null) continue;  // never clobber
            var val = localStorage.getItem(oldKey);
            if (val === null) continue;
            localStorage.setItem(target, val);
            moved++;
        }

        localStorage.setItem(DONE, new Date().toISOString());
        if (moved && typeof console !== 'undefined' && console.info) {
            console.info('Proton Mining: carried ' + moved +
                         ' saved item(s) forward from the previous brand.');
        }
    } catch (e) {
        /* Private mode, a storage quota, a disabled storage API. The app works
           without this; it just starts empty. Never throw from a migration that
           runs before everything else. */
    }
})();
