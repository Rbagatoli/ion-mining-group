/* ===== The capacity audit, on screen ======================================================
 *
 * Separate from map-sourcing.js on purpose. This reads ProspectStore and SiteData and writes
 * through CapacityAudit; it needs none of the 6,000 lines next to it, and keeping it out means a
 * diagnostic panel cannot break the map.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING TO SAY. A clean install, and any install after every
 * flagged record has been corrected, sees no panel at all -- a permanent "0 problems" banner
 * teaches people to stop reading banners. The exception is unmatched records, which ARE
 * something to say: they were not checked, and silence about them would read as a clean bill.
 *
 * ONE AT A TIME, NEVER IN BULK. Each correction overwrites a capacity figure that prices a
 * build. The reader sees both numbers and presses the button for that row, and the verdict is
 * re-taken at the moment of writing rather than trusted from when the panel was drawn.
 */
var CapacityAuditUi = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function kw(n) {
        if (n === null || n === undefined) return '—';
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' kW';
    }

    function candidatesById() {
        var out = {};
        if (typeof ProspectStore === 'undefined' || !ProspectStore.all) return out;
        var all = ProspectStore.all();
        for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].id !== undefined) out[String(all[i].id)] = all[i];
        }
        return out;
    }

    function render(hostId) {
        var host = document.getElementById(hostId || 'capAudit');
        if (!host) return null;
        if (typeof CapacityAudit === 'undefined') { host.innerHTML = ''; return null; }
        var scan = CapacityAudit.scan();

        if (!scan.suspect.length && !scan.unmatched.length) { host.innerHTML = ''; return scan; }

        var rows = scan.suspect.map(function (v) {
            return '<li class="capa-row" data-id="' + esc(v.id) + '">' +
                '<span class="capa-name">' + esc(v.name) + '</span>' +
                '<span class="capa-nums"><span class="capa-was">' + esc(kw(v.have)) + '</span>' +
                    ' &rarr; <span class="capa-now">' + esc(kw(v.derived)) + '</span>' +
                    ' <span class="capa-delta">' + esc(String(v.delta_pct)) + '%</span></span>' +
                '<button type="button" class="capa-fix" data-id="' + esc(v.id) + '">Correct</button>' +
            '</li>';
        }).join('');

        var head = scan.suspect.length
            ? scan.suspect.length + ' saved ' +
              (scan.suspect.length === 1 ? 'prospect holds' : 'prospects hold') +
              ' a capacity figure nobody typed'
            : 'Saved capacity figures could not all be checked';

        host.innerHTML =
        '<div class="src-morerow">' +
            '<button type="button" class="prov-toggle" id="capaToggle" aria-expanded="false" ' +
                    'aria-controls="capaPanel">' +
                '<span class="prov-caret" aria-hidden="true">&#9656;</span>' +
                '<span class="section-label">' + esc(head) + '</span>' +
            '</button>' +
        '</div>' +
        '<div id="capaPanel" hidden>' +
            (scan.suspect.length
                ? '<p class="capa-why">These were saved when the app wrote the site\'s GROSS ' +
                  'resource figure into its usable-capacity field — before the gas cap and before ' +
                  'parasitic load. Each one holds its candidate\'s gross number to the kW, which ' +
                  'is what a machine writes and not what a person types. Correcting them is ' +
                  'one at a time and on purpose: this number prices a build.' +
                  (scan.overstated_kw
                    ? ' Across all of them the overstatement is ' + esc(kw(scan.overstated_kw)) + '.'
                    : '') + '</p>' +
                  '<ul class="capa-list">' + rows + '</ul>'
                : '') +
            (scan.unmatched.length
                ? '<p class="capa-note">' + esc(String(scan.unmatched.length)) + ' saved ' +
                  (scan.unmatched.length === 1 ? 'prospect' : 'prospects') +
                  ' could not be checked at all, because the candidate each was saved from is not ' +
                  'in the loaded catalog. Prospect ids change when a catalog is rebuilt, so this ' +
                  'is expected rather than a fault — but it means those figures are unverified ' +
                  'rather than confirmed.</p>'
                : '') +
            '<p class="capa-note">' + esc(String(scan.typed.length)) + ' hold a figure that ' +
            'matches neither, so somebody entered them and they are left alone. ' +
            esc(String(scan.current.length)) + ' are already correct.</p>' +
        '</div>';

        wire(host);
        return scan;
    }

    function wire(host) {
        var toggle = host.querySelector('#capaToggle');
        var panel = host.querySelector('#capaPanel');
        if (toggle && panel) {
            toggle.addEventListener('click', function () {
                var open = panel.hasAttribute('hidden');
                if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }
        var buttons = host.querySelectorAll('.capa-fix');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var cands = candidatesById();
                var res = CapacityAudit.recompute(id, cands[String(id)] || null);
                if (!res.ok) { window.alert(res.err); render(host.id); return; }
                /* Redrawn rather than the row removed, because the scan is the source of truth
                   and a corrected record should disappear because it is no longer flagged, not
                   because the DOM was edited to hide it. */
                render(host.id);
            });
        }
    }

    return { render: render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CapacityAuditUi;
