/* ===== The prospecting section's own navigation =====
 *
 * Prospecting outgrew a tab. It is a search tool, a pipeline, a contact history
 * and a daily worklist, and those want sub-navigation rather than one page that
 * does all of it.
 *
 * THE MAP HERE IS THE SOURCING MAP, and it is not the one on the Map tab. That
 * tab is the fleet: where our own operations are. This one is flares nobody has
 * spoken to, scored. They are two questions that happen to be drawn on the same
 * component, and they were behind one in-page toggle with a sticky preference —
 * so a single tab showed whichever of the two you last looked at, and neither
 * could be linked to.
 *
 * map.html now takes its mode from the URL: ?mode=prospects is this one. Same
 * file, same scoring engine, same adapters — nothing about the module changed,
 * only which of its two faces a link asks for.
 *
 * The 'Table' entry that used to sit beside it is gone for a different reason:
 * nothing in map.js or map-sourcing.js has ever read location.hash, so
 * './map.html#table' only ever loaded the map in whatever view it was last left
 * in. The ranked table has its own in-page toggle and always did.
 *
 * THE WORKING SET IS SHARED THROUGH STORAGE, not through a parent component.
 * map-sourcing.js already persists its filters to protonMiningProspectFilters —
 * it did so long before this existed, for its own reasons — so the board reads
 * the same key and gets the same set without either page knowing about the other.
 * Nothing new had to be built for it and nothing had to be moved.
 */
var ProspectNav = (function () {
    'use strict';

    /* Sources of truth for the section. Adding a view is a line here plus a page;
       the order is the order somebody works in — what to do today, then the
       pipeline, then the search that feeds it. */
    var VIEWS = [
        { key: 'today',     label: 'Today',     href: './prospecting.html' },
        { key: 'board',     label: 'Board',     href: './prospecting.html#board' },
        /* The sourcing map, which is a different map from the fleet one on the
           Map tab. Same file, opened in the mode this section means. */
        { key: 'map',       label: 'Map',       href: './map.html?mode=prospects' },
        { key: 'contacts',  label: 'Contacts',  href: './contacts.html' },
        { key: 'analytics', label: 'Analytics', href: './prospecting.html#analytics' }
    ];

    /* Views whose page does not exist yet render disabled rather than as a link
       to a 404. A dead nav item is worse than a greyed one: it teaches people the
       section is broken. */
    var BUILT = { today: true, board: true, map: true, contacts: true, analytics: true };

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function render(activeKey, hostId) {
        var host = document.getElementById(hostId || 'prospectNav');
        if (!host) return null;
        var html = '<nav class="psec-nav" aria-label="Prospecting">';
        for (var i = 0; i < VIEWS.length; i++) {
            var v = VIEWS[i];
            var on = (v.key === activeKey);
            if (BUILT[v.key]) {
                html += '<a class="psec-tab' + (on ? ' is-on' : '') + '" href="' + esc(v.href) + '"' +
                        (on ? ' aria-current="page"' : '') + '>' + esc(v.label) + '</a>';
            } else {
                html += '<span class="psec-tab is-soon" aria-disabled="true" ' +
                        'title="Not built yet">' + esc(v.label) + '</span>';
            }
        }
        html += '</nav>';
        host.innerHTML = html;
        return host;
    }

    /* The filter set both the map and the board work from. Read-only here — the
       map owns writing it, and a second writer would mean two pages racing to
       define one working set. */
    var FILTER_KEY = 'protonMiningProspectFilters';

    function sharedFilters() {
        try {
            var raw = localStorage.getItem(FILTER_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (e) { return null; }
    }

    return {
        VIEWS: VIEWS,
        BUILT: BUILT,
        FILTER_KEY: FILTER_KEY,
        render: render,
        sharedFilters: sharedFilters
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectNav;
