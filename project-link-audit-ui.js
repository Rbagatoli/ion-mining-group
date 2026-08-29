/* ===== The link audit, on screen ==========================================================
 *
 * ON THE TODAY VIEW, NOT ON A PROSPECT. This is the whole placement argument and it is forced:
 * the finding is that a project's prospect is GONE, so there is no prospect page to draw it on.
 * A per-prospect panel can only ever show the projects whose links are fine. Today is the
 * workspace's "what needs attention" screen and it is the only project-wide surface that exists.
 *
 * IT DRAWS NOTHING WHEN THERE IS NOTHING TO SAY. A clean workspace, and any workspace after
 * every flagged project has been acknowledged, sees no block at all -- a permanent "0 problems"
 * banner teaches people to stop reading banners. Copied from capacity-audit-ui.js, including its
 * one exception: a state that means THIS DEVICE COULD NOT CHECK is something to say, because
 * silence about it reads as a clean bill of health.
 *
 * SEPARATE FROM prospect-today.js on purpose, the way capacity-audit-ui.js is separate from
 * map-sourcing.js: a diagnostic panel must not be able to break the screen it sits on.
 *
 * NOTHING HERE OFFERS TO REPAIR. There is no relink control and there is no delete. The only
 * action is Acknowledge, which records that a person looked and decided to leave it -- see the
 * detector's header for why re-pointing a project at a rediscovered prospect would be a guess.
 */
var ProjectLinkAuditUi = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* One sentence per state, never one total. 'repointed' and 'missing' are different problems
       with different next moves -- one is a record that now names somewhere else, the other is a
       record that is not there -- and a combined count would name neither. */
    var HEAD = {
        repointed: function (n) {
            return n + (n === 1 ? ' project points' : ' projects point') +
                   ' at a saved prospect that is somewhere else entirely.';
        },
        ambiguous: function (n) {
            return n + (n === 1 ? ' project resolves' : ' projects resolve') +
                   ' to more than one saved prospect, so which one it came from cannot be told.';
        },
        missing: function (n) {
            return n + (n === 1 ? ' project has' : ' projects have') +
                   ' a prospect that is not on this device.';
        },
        unlinked: function (n) {
            return n + (n === 1 ? ' project records' : ' projects record') +
                   ' no prospect id at all.';
        }
    };

    function row(v) {
        var link = v.link || {};
        var ack = link.acknowledged_at
            ? '<span class="pla-ack">left as it is' +
              (link.acknowledged_by ? ' — ' + esc(link.acknowledged_by) : '') +
              (link.acknowledged_note ? ': ' + esc(link.acknowledged_note) : '') + '</span>'
            : '<button type="button" class="pla-ack-btn" data-pid="' + esc(v.project_id) +
              '">Leave as it is</button>';
        return '<li class="pla-row">' +
            '<span class="pla-what">' + esc(v.project_name || v.project_id) +
                '<span class="pla-state">' + esc(v.state.replace(/_/g, ' ')) + '</span></span>' +
            '<span class="pla-why">' + esc(v.reason) +
                (link.unresolved_since
                    ? '<span class="pla-since">first seen ' +
                      esc(String(link.unresolved_since).slice(0, 10)) + '</span>' : '') +
            '</span>' +
            '<span class="pla-do">' + ack + '</span>' +
        '</li>';
    }

    function render(hostId) {
        var host = document.getElementById(hostId || 'plaudit');
        if (!host) return null;
        if (typeof ProjectLinkAudit === 'undefined') { host.innerHTML = ''; return null; }
        var res = ProjectLinkAudit.scan();

        /* THE EXCEPTION TO DRAWING NOTHING. "This device has no prospect list" is not a clean
           result, it is the check declining to run — and saying nothing about it would read as
           though every link had been verified. Said once, never once per project. */
        if (res.state !== 'ready') {
            if (res.state === 'no_project_model' || res.state === 'no_site_model') {
                host.innerHTML = ''; return res;
            }
            host.innerHTML = '<div class="pla-block"><p class="pla-head pla-warn">' +
                'Project links were not checked. ' + esc(res.reason) + '</p></div>';
            return res;
        }

        var rows = ProjectLinkAudit.actionable(res);
        if (!rows.length) { host.innerHTML = ''; return res; }

        var lines = [];
        ProjectLinkAudit.ACTIONABLE.forEach(function (s) {
            var n = (res[s] || []).length;
            if (n && HEAD[s]) lines.push('<span class="pla-warn">' + HEAD[s](n) + '</span>');
        });
        /* Named rather than folded in: a project nobody can measure is not a project that is
           fine, and 'retired' is not a fault at all — it is the tidy-up working. */
        var quiet = [];
        if (res.linked_unverified.length) {
            quiet.push(res.linked_unverified.length + ' could not be confirmed either way.');
        }
        if (res.retired.length) {
            quiet.push(res.retired.length + ' cancelled ' +
                (res.retired.length === 1 ? 'project has' : 'projects have') +
                ' had their prospect tidied up, which is intended and is not counted above.');
        }

        var list = '';
        for (var i = 0; i < rows.length; i++) list += row(rows[i]);
        host.innerHTML =
            '<div class="pla-block">' +
                '<p class="pla-head">' + lines.join(' ') + '</p>' +
                (quiet.length ? '<p class="pla-quiet">' + quiet.join(' ') + '</p>' : '') +
                '<ul class="pla-list">' + list + '</ul>' +
                '<p class="pla-quiet">Nothing here is repaired automatically. A prospect can go ' +
                'missing four different ways and deleting one leaves nothing behind, so ' +
                're-pointing a project would be a guess about which happened. The snapshot each ' +
                'project carries is what it was promoted against and stays untouched.</p>' +
            '</div>';
        wire(res);
        return res;
    }

    /* Private, and called from inside render(), so there is no second wiring owner and no
       handler can be bound twice. Same shape as capacity-audit-ui.js. */
    function wire(res) {
        var btns = document.querySelectorAll('.pla-ack-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var pid = this.getAttribute('data-pid');
                var by = window.prompt('Who is leaving this as it is?');
                if (!by) return;
                var note = window.prompt('Why? This is the only record that anybody looked.');
                if (!note) return;
                var r = ProjectLinkAudit.acknowledge(pid, { by: by, note: note });
                if (!r.ok) { window.alert(r.err); return; }
                render();
            });
        }
    }

    return { render: render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectLinkAuditUi;
