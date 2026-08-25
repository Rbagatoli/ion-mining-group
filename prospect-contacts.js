/* ===== Contacts =====
 *
 * The people, rather than the sites. Everywhere else in the app a contact is
 * something attached to a prospect and read through it, which means three things
 * are true and invisible:
 *
 *   A CONTACT LINKED TO NOTHING EXISTS NOWHERE. It is in the store, it will never
 *   appear on a prospect page, and the only way to find it is to already know it
 *   is there. Somebody typed that person in for a reason.
 *
 *   A CONTACT LINKED TO A DELETED PROSPECT holds a link that goes nowhere. The
 *   store has no reason to know a prospect was removed, so the link survives it.
 *   Rendered without checking, it is a name that looks connected to a deal that
 *   is not there any more.
 *
 *   A NUMBER NOBODY HAS CHECKED IN TWO YEARS looks exactly like one checked this
 *   morning. The store already keeps last_verified for this reason; nothing has
 *   ever displayed it.
 *
 * So this screen leads with reachability and with what is wrong, because the
 * plain list of names is the part you could already get.
 *
 * REACHABILITY IS THE FIRST COLUMN because it is what the opportunity score
 * actually reads. contactTier ranks a prospect partly on whether there is a way
 * to reach anyone, so a contact with neither an email nor a phone number is not
 * a half-filled record -- it is a prospect scoring lower and no visible reason
 * why. This is the only screen where that is legible.
 */
var ProspectContacts = (function () {
    'use strict';

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

    function absent(what) { return '<span class="pc-absent">' + esc(what) + '</span>'; }

    function titleCase(v) {
        return String(v || '').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
    }

    var DAY = 86400000;

    /* How long a checked phone number stays believable. The number is a guess and
       is configurable BECAUSE it is a guess -- there is no evidence behind 365
       beyond "a year is a long time in a county office". It colours nothing on
       its own; it only decides which contacts this screen offers to re-check. */
    function verifyDays() {
        if (typeof CrmConfig !== 'undefined' && CrmConfig.setting) {
            var v = CrmConfig.setting('contactVerifyDays');
            if (typeof v === 'number' && isFinite(v) && v > 0) return v;
        }
        return 365;
    }

    function ageInDays(iso, nowMs) {
        if (!has(iso)) return null;
        var t = Date.parse(iso);
        if (isNaN(t)) return null;
        var now = (typeof nowMs === 'number') ? nowMs : Date.now();
        return Math.floor((now - t) / DAY);
    }

    /* Four states, not a boolean. "Email only" and "phone only" are different
       problems -- one is a message into a void, the other is the only thing that
       works for a county office that does not read email. */
    function reachOf(c) {
        var e = has(c.email), p = has(c.phone);
        if (e && p) return 'both';
        if (e) return 'email';
        if (p) return 'phone';
        return 'none';
    }

    var REACH_RANK = { both: 0, phone: 1, email: 2, none: 3 };

    function build(opts, nowMs) {
        opts = opts || {};
        var out = {
            rows: [],
            counts: { total: 0, orphans: 0, unreachable: 0, neverVerified: 0,
                      stale: 0, dangling: 0 },
            verifyDays: verifyDays()
        };
        if (typeof CrmContacts === 'undefined') return out;

        var all = CrmContacts.list() || [];
        var q = has(opts.q) ? String(opts.q).toLowerCase().trim() : null;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !c.id) continue;
            out.counts.total++;

            var links = [], dangling = 0;
            var ids = Array.isArray(c.linked_prospects) ? c.linked_prospects : [];
            for (var j = 0; j < ids.length; j++) {
                var rec = (typeof SiteData !== 'undefined' && SiteData.get)
                    ? SiteData.get(ids[j]) : null;
                if (rec) {
                    links.push({ id: ids[j], name: rec.name || ids[j], exists: true });
                } else {
                    /* Kept and counted rather than filtered out. A link to a
                       prospect that is gone is a fact about the record, and
                       hiding it means it can never be cleaned up. */
                    dangling++;
                    links.push({ id: ids[j], name: ids[j], exists: false });
                }
            }

            var reach = reachOf(c);
            var age = ageInDays(c.last_verified, nowMs);

            if (!ids.length) out.counts.orphans++;
            if (reach === 'none') out.counts.unreachable++;
            if (age === null) out.counts.neverVerified++;
            else if (age > out.verifyDays) out.counts.stale++;
            out.counts.dangling += dangling;

            /* Applied after the counts are taken, so the flag that says "3 with no
               way to reach them" still says 3 once you have clicked it. A count
               that changes when you filter by it is a count nobody trusts. */
            if (opts.filter === 'unreachable' && reach !== 'none') continue;
            if (opts.filter === 'orphans' && ids.length) continue;
            if (opts.filter === 'stale' && !(age !== null && age > out.verifyDays)) continue;
            if (opts.filter === 'dangling' && !dangling) continue;

            if (q) {
                var hay = [c.name, c.title, c.organization, c.email, c.phone, c.notes]
                    .concat(links.map(function (l) { return l.name; }))
                    .join(' ').toLowerCase();
                if (hay.indexOf(q) < 0) continue;
            }

            out.rows.push({
                contact: c,
                reach: reach,
                links: links,
                dangling: dangling,
                verifiedDays: age,
                /* Never verified is not stale -- it is unknown. Kept apart so the
                   screen can offer to check the ones that have decayed without
                   implying anything about the ones nobody ever checked. */
                stale: (age !== null && age > out.verifyDays)
            });
        }

        var sort = opts.sort || 'name';
        out.rows.sort(function (a, b) {
            if (sort === 'reach') {
                var d = REACH_RANK[a.reach] - REACH_RANK[b.reach];
                if (d) return d;
            } else if (sort === 'linked') {
                var dl = b.links.length - a.links.length;
                if (dl) return dl;
            } else if (sort === 'verified') {
                /* Stalest first, and never-verified above everything, because it
                   is the one you know least about. */
                var av = (a.verifiedDays === null) ? Infinity : a.verifiedDays;
                var bv = (b.verifiedDays === null) ? Infinity : b.verifiedDays;
                if (av !== bv) return bv - av;
            }
            var an = String(a.contact.name || '').toLowerCase();
            var bn = String(b.contact.name || '').toLowerCase();
            return an < bn ? -1 : (an > bn ? 1 : 0);
        });

        return out;
    }

    // ---- Rendering ----------------------------------------------------------
    function reachCell(r) {
        var c = r.contact;
        if (r.reach === 'none') {
            return '<span class="pc-reach t-none" title="No way to reach this person. ' +
                   'The opportunity score reads contactability, so this costs the ' +
                   'linked prospects real points.">unreachable</span>';
        }
        var bits = '';
        if (has(c.email)) {
            bits += '<a class="pc-mail" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>';
        }
        if (has(c.phone)) {
            bits += '<span class="pc-phone">' + esc(c.phone) + '</span>';
        }
        return bits;
    }

    function linkCell(r) {
        if (!r.links.length) {
            return '<span class="pc-orphan" title="Linked to no prospect, so this person ' +
                   'appears nowhere else in the app.">not linked</span>';
        }
        var html = '';
        for (var i = 0; i < r.links.length; i++) {
            var l = r.links[i];
            if (l.exists) {
                html += '<a class="pc-plink" href="./prospecting.html#p/' +
                        esc(encodeURIComponent(l.id)) + '">' + esc(l.name) + '</a>';
            } else {
                html += '<span class="pc-dead" title="This prospect is no longer in the ' +
                        'pipeline. The link stayed behind.">' + esc(l.name) + '</span>';
            }
        }
        return html;
    }

    function verifiedCell(r) {
        if (r.verifiedDays === null) return absent('never checked');
        if (r.verifiedDays === 0) return '<span class="pc-ver">today</span>';
        return '<span class="pc-ver' + (r.stale ? ' is-stale' : '') + '">' +
               r.verifiedDays + (r.verifiedDays === 1 ? ' day' : ' days') + '</span>';
    }

    function render(hostId, opts, nowMs) {
        var host = document.getElementById(hostId || 'pcontacts');
        if (!host) return null;
        var d = build(opts, nowMs);

        if (d.counts.total === 0) {
            host.innerHTML = '<div class="p-empty">' +
                '<h2>No contacts yet</h2>' +
                '<p>People are added from a prospect &mdash; open one and use the ' +
                'contacts block. One person can be linked to as many prospects as ' +
                'they actually cover, which is the point of keeping them here rather ' +
                'than as fields on a site.</p>' +
                '<p><a class="p-golink" href="./prospecting.html#board">' +
                'Go to the pipeline &rarr;</a></p>' +
            '</div>';
            return d;
        }

        /* The counts that are worth acting on, and only those. A row of totals
           where every figure is zero teaches people to stop reading it, so a
           clean book prints one line saying so. */
        var flags = '';
        function on(k) { return (opts && opts.filter === k) ? ' is-on' : ''; }
        if (d.counts.unreachable) {
            flags += '<button type="button" class="pc-flag t-neg' + on('unreachable') +
                '" data-filter="unreachable">' +
                d.counts.unreachable + ' with no way to reach them</button>';
        }
        if (d.counts.orphans) {
            flags += '<button type="button" class="pc-flag' + on('orphans') +
                '" data-filter="orphans">' +
                d.counts.orphans + ' linked to nothing</button>';
        }
        if (d.counts.stale) {
            flags += '<button type="button" class="pc-flag' + on('stale') +
                '" data-filter="stale">' +
                d.counts.stale + ' not checked in over ' + Math.round(d.verifyDays / 365 * 12) +
                ' months</button>';
        }
        if (d.counts.dangling) {
            flags += '<button type="button" class="pc-flag' + on('dangling') +
                '" data-filter="dangling">' +
                d.counts.dangling + ' link' + (d.counts.dangling === 1 ? '' : 's') +
                ' to a prospect that is gone</button>';
        }

        var html = '<div class="pc-top">' +
            '<span class="pc-total">' + d.counts.total +
                (d.counts.total === 1 ? ' contact' : ' contacts') + '</span>' +
            (flags || '<span class="pc-clean">Everyone is reachable, linked and checked.</span>') +
        '</div>';

        var rows = '';
        for (var i = 0; i < d.rows.length; i++) {
            var r = d.rows[i], c = r.contact;
            rows += '<tr data-id="' + esc(c.id) + '">' +
                '<td class="pc-name">' + (has(c.name) ? esc(c.name) : absent('unnamed')) +
                    (has(c.title) ? '<span class="pc-title">' + esc(c.title) + '</span>' : '') +
                '</td>' +
                '<td class="pc-org">' + (has(c.organization) ? esc(c.organization)
                                                             : absent('no organisation')) + '</td>' +
                '<td class="pc-role">' +
                    (c.role && c.role !== 'unknown' ? esc(titleCase(c.role)) : absent('role unknown')) +
                '</td>' +
                '<td class="pc-reachcell">' + reachCell(r) + '</td>' +
                '<td class="pc-links">' + linkCell(r) + '</td>' +
                '<td class="pc-verified">' + verifiedCell(r) +
                    '<button type="button" class="pc-check" data-cid="' + esc(c.id) + '" ' +
                    'title="Record that you have just confirmed these details">check</button>' +
                '</td>' +
            '</tr>';
        }

        html += '<table class="pc-table"><thead><tr>' +
            '<th>Name</th><th>Organisation</th><th>Role</th>' +
            '<th>How to reach them</th><th>Prospects</th><th>Checked</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';

        if (!d.rows.length) {
            html += '<p class="pc-none">Nothing matches that.</p>';
        }

        host.innerHTML = html;
        return d;
    }

    return { build: build, render: render, reachOf: reachOf };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProspectContacts;
