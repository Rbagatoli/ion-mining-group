/* ===== The contacts page =====
 *
 * A list, a search, and an editor. The one piece of judgement in here is what
 * "check" does: it stamps last_verified with now and nothing else. It is
 * deliberately not a form, because a button you press after a call that
 * confirmed the number still works has to cost one click or it never gets
 * pressed, and a last_verified nobody maintains is worse than none at all --
 * it makes stale details look freshly confirmed.
 */
(function () {
    'use strict';

    var NEWLINE = String.fromCharCode(10);

    initNav('prospecting');
    if (typeof CrmConfig !== 'undefined') {
        try { CrmConfig.publish(); }
        catch (e) { if (window.console) console.warn('CRM config not applied:', e); }
    }
    ProspectNav.render('contacts');

    var host = document.getElementById('pcontacts');
    var editorHost = document.getElementById('pcEditor');
    var search = document.getElementById('pcSearch');
    var sortSel = document.getElementById('pcSort');

    /* The whole view state, so a redraw after an edit puts you back where you
       were rather than at the top of an unfiltered list. */
    var view = { q: '', sort: 'name', filter: null };
    var editing = null;          // contact id, or '' for a new one, or null

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    // ---- The list ------------------------------------------------------------
    function draw() {
        ProspectContacts.render('pcontacts', view);
        wireList();
        drawEditor();
    }

    function wireList() {
        var flags = host.querySelectorAll('.pc-flag');
        for (var f = 0; f < flags.length; f++) {
            flags[f].addEventListener('click', function () {
                var key = this.getAttribute('data-filter');
                /* Clicking the lit one clears it. A filter you can only turn on is
                   a filter that traps you. */
                view.filter = (view.filter === key) ? null : key;
                draw();
            });
        }
        var names = host.querySelectorAll('.pc-name');
        for (var n = 0; n < names.length; n++) {
            names[n].addEventListener('click', function () {
                var row = this.parentNode;
                editing = row.getAttribute('data-id');
                draw();
            });
        }
        var checks = host.querySelectorAll('.pc-check');
        for (var c = 0; c < checks.length; c++) {
            checks[c].addEventListener('click', function (e) {
                e.stopPropagation();
                var id = this.getAttribute('data-cid');
                CrmContacts.update(id, { last_verified: new Date().toISOString() });
                draw();
            });
        }
        if (editing) {
            var open = host.querySelector('tr[data-id="' + editing + '"]');
            if (open) open.classList.add('is-open');
        }
    }

    // ---- The editor ----------------------------------------------------------
    function prospectOptions(selectedIds) {
        var recs = (typeof SiteData !== 'undefined' && SiteData.list) ? (SiteData.list() || []) : [];
        var taken = {};
        for (var t = 0; t < selectedIds.length; t++) taken[selectedIds[t]] = true;
        var html = '<option value="">Link to a prospect…</option>';
        var any = false;
        for (var i = 0; i < recs.length; i++) {
            if (!recs[i] || !recs[i].id || taken[recs[i].id]) continue;
            any = true;
            html += '<option value="' + esc(recs[i].id) + '">' +
                    esc(recs[i].name || recs[i].id) + '</option>';
        }
        return any ? html : '<option value="">Nothing left to link to</option>';
    }

    function roleOptions(current) {
        var html = '';
        var roles = CrmContacts.ROLES;
        for (var i = 0; i < roles.length; i++) {
            html += '<option value="' + esc(roles[i]) + '"' +
                    (roles[i] === current ? ' selected' : '') + '>' +
                    esc(roles[i].replace(/_/g, ' ')) + '</option>';
        }
        return html;
    }

    function drawEditor() {
        if (editing === null) { editorHost.innerHTML = ''; return; }
        var isNew = (editing === '');
        var c = isNew ? CrmContacts.blank() : CrmContacts.get(editing);
        if (!c) { editing = null; editorHost.innerHTML = ''; return; }

        var linked = Array.isArray(c.linked_prospects) ? c.linked_prospects : [];
        var chips = '';
        for (var i = 0; i < linked.length; i++) {
            var rec = (typeof SiteData !== 'undefined' && SiteData.get) ? SiteData.get(linked[i]) : null;
            chips += '<li>' + (rec ? esc(rec.name || linked[i])
                                   : '<s>' + esc(linked[i]) + '</s>') +
                '<button type="button" class="pc-unlink" data-pid="' + esc(linked[i]) +
                '" title="Unlink">&times;</button></li>';
        }

        editorHost.innerHTML =
        '<section class="pc-edit">' +
            '<h2>' + (isNew ? 'New contact' : 'Edit contact') + '</h2>' +
            '<div class="pc-frow">' +
                '<label class="pc-grow">Name<input type="text" id="pcName" value="' +
                    esc(c.name) + '"></label>' +
                '<label class="pc-grow">Title<input type="text" id="pcTitle" value="' +
                    esc(c.title) + '" placeholder="Landfill supervisor"></label>' +
                '<label>Role<select id="pcRole">' + roleOptions(c.role) + '</select></label>' +
            '</div>' +
            '<div class="pc-frow">' +
                '<label class="pc-grow">Organisation<input type="text" id="pcOrg" value="' +
                    esc(c.organization) + '"></label>' +
                '<label class="pc-grow">Email<input type="text" id="pcEmail" value="' +
                    esc(c.email) + '"></label>' +
                '<label class="pc-grow">Phone<input type="text" id="pcPhone" value="' +
                    esc(c.phone) + '"></label>' +
            '</div>' +
            '<div class="pc-frow">' +
                /* Where the details came from. A number off a permit filing and a
                   number somebody read out on a call decay differently, and after
                   six months the source is the only way to tell which you have. */
                '<label class="pc-grow">Where these came from<input type="text" id="pcSource" ' +
                    'value="' + esc(c.source) + '" placeholder="AER licence filing, Nov"></label>' +
                '<label>Last checked<input type="date" id="pcVerified" value="' +
                    esc(c.last_verified ? String(c.last_verified).slice(0, 10) : '') + '"></label>' +
            '</div>' +
            '<div class="pc-frow">' +
                '<label class="pc-grow">Notes<input type="text" id="pcNotes" value="' +
                    esc(c.notes) + '"></label>' +
            '</div>' +
            (isNew ? '' :
                '<ul class="pc-links-edit">' + (chips || '<li>Linked to nothing</li>') + '</ul>' +
                '<div class="pc-frow">' +
                    '<label class="pc-grow">Prospects<select id="pcLink">' +
                        prospectOptions(linked) + '</select></label>' +
                '</div>') +
            '<div class="pc-actions">' +
                '<button type="button" class="pc-btn pc-btn--go" id="pcSave">Save</button>' +
                '<button type="button" class="pc-btn" id="pcCancel">Cancel</button>' +
                (isNew ? '' : '<button type="button" class="pc-btn pc-btn--rm" id="pcDelete">' +
                              'Delete</button>') +
            '</div>' +
            '<p class="pc-hint" id="pcHint">A contact with no email and no phone number ' +
                'lowers the opportunity score of every prospect it is linked to.</p>' +
        '</section>';

        wireEditor(isNew);
    }

    function wireEditor(isNew) {
        var hint = document.getElementById('pcHint');

        document.getElementById('pcSave').addEventListener('click', function () {
            var when = val('pcVerified');
            var patch = {
                name: val('pcName').trim(),
                title: val('pcTitle').trim(),
                organization: val('pcOrg').trim(),
                email: val('pcEmail').trim(),
                phone: val('pcPhone').trim(),
                role: val('pcRole'),
                source: val('pcSource').trim(),
                notes: val('pcNotes').trim(),
                /* Midday UTC, like the interaction form: the field asks which DAY
                   it was checked, and inventing an hour would be inventing
                   precision the answer does not have. */
                last_verified: when ? (when + 'T12:00:00.000Z') : null
            };
            if (!patch.name) {
                hint.textContent = 'A contact needs a name.';
                hint.className = 'pc-hint is-err';
                return;
            }
            /* add() and update() return the RECORD, or null when the write
               failed -- not the { ok, err } the rest of the CRM stores use. A
               null read as success is a form that clears itself having saved
               nothing, so it is checked for what it actually returns. */
            var res = isNew ? CrmContacts.add(patch) : CrmContacts.update(editing, patch);
            if (!res) {
                hint.textContent = 'Could not save. Local storage may be full — ' +
                                   'nothing was written.';
                hint.className = 'pc-hint is-err';
                return;
            }
            /* A new contact stays open so it can be linked to something straight
               away -- it has no links yet, and the link control only exists on a
               saved record. */
            editing = isNew ? res.id : editing;
            draw();
        });

        document.getElementById('pcCancel').addEventListener('click', function () {
            editing = null;
            draw();
        });

        var del = document.getElementById('pcDelete');
        if (del) {
            del.addEventListener('click', function () {
                var c = CrmContacts.get(editing);
                if (!c) return;
                var n = (c.linked_prospects || []).length;
                if (!window.confirm('Delete ' + (c.name || 'this contact') + '?' +
                        NEWLINE + NEWLINE +
                        (n ? 'They are linked to ' + n + ' prospect' + (n === 1 ? '' : 's') +
                             ', which will lose them as a way in.'
                           : 'They are linked to nothing.'))) return;
                CrmContacts.remove(editing);
                editing = null;
                draw();
            });
        }

        var linkSel = document.getElementById('pcLink');
        if (linkSel) {
            linkSel.addEventListener('change', function () {
                if (!this.value) return;
                CrmContacts.link(editing, this.value);
                draw();
            });
        }

        var unlinks = editorHost.querySelectorAll('.pc-unlink');
        for (var u = 0; u < unlinks.length; u++) {
            unlinks[u].addEventListener('click', function () {
                CrmContacts.unlink(editing, this.getAttribute('data-pid'));
                draw();
            });
        }
    }

    // ---- Controls --------------------------------------------------------------
    if (search) {
        search.addEventListener('input', function () {
            view.q = this.value;
            draw();
            /* Redrawing replaces the list, not the search box, so focus survives —
               but the caret does not on every engine, so it is restored. */
            var el = document.getElementById('pcSearch');
            if (el && document.activeElement !== el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        });
    }
    if (sortSel) {
        sortSel.addEventListener('change', function () { view.sort = this.value; draw(); });
    }
    var addBtn = document.getElementById('pcNew');
    if (addBtn) {
        addBtn.addEventListener('click', function () { editing = ''; draw(); });
    }

    draw();

    /* Contacts edited on another device should not need a reload. Prospects
       matter too: a prospect deleted elsewhere turns a link into a dangling one,
       and this is the only screen that reports those. */
    window.addEventListener('storage', function (e) {
        if (!e || !e.key) return;
        if (e.key === 'protonContacts' || e.key === 'protonMiningSites' ||
            e.key === 'protonCrmConfig') {
            if (typeof CrmConfig !== 'undefined') { CrmConfig.reset(); CrmConfig.publish(); }
            if (typeof CrmContacts !== 'undefined') CrmContacts.reset();
            draw();
        }
    });
})();
