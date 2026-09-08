/* Reachable people first: saved contacts, relationship research, and published site directories. */
var ProspectPeople = (function () {
    'use strict';
    var L = typeof LandfillContacts !== 'undefined' ? LandfillContacts : require('./landfill-contacts');
    var R = typeof DealRelationships !== 'undefined' ? DealRelationships : require('./deal-relationships');
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function contacts(c, saved, directory, research, crm) {
        var rows = [], sd = c.sourceDetail || {};
        if (saved && (saved.contact_name || saved.contact_phone || saved.contact_email)) rows.push({ name: saved.contact_name || 'Saved site contact', phone: saved.contact_phone, email: saved.contact_email, source: 'Saved site terms', notes: saved.contact_notes, person: !!saved.contact_name });
        (crm || []).forEach(function (n) { rows.push({ name: n.name, title: n.title, organization: n.organization, phone: n.phone, email: n.email, source: 'Saved contact', sourceDate: n.last_verified, notes: n.notes, person: !!n.name }); });
        var state = R.state(saved);
        (state.nodes || []).concat(research && research.nodes || []).filter(function (n) { return !n.archived; }).forEach(function (n) {
            rows.push({ name: n.name, title: n.title, organization: n.organization, phone: n.phone, email: n.email, source: 'Relationship map', sourceUrl: n.source_url, sourceDate: n.checked_on, notes: n.evidence_note, person: n.kind === 'person' });
        });
        (directory && directory.contacts || []).forEach(function (n) { rows.push({ name: n.contactName || n.organization, title: n.title, organization: n.organization, phone: n.phone, email: n.email, source: n.source || 'Public directory', sourceUrl: n.sourceUrl, sourceDate: n.sourceDate, notes: [n.scope, n.notes, n.verification].filter(Boolean).join(' '), person: !!n.contactName && n.contactName !== n.organization && !/office|department|switchboard|general inquiries/i.test(n.contactName) }); });
        if (sd.contactName || sd.contactPhone || sd.contactEmail) rows.push({ name: sd.contactName || 'Published site contact', phone: sd.contactPhone, email: sd.contactEmail, source: 'Site source record', sourceUrl: sd.contactSourceUrl || sd.sourceUrl, person: !!sd.contactName });
        // A shared switchboard must not merge two different people into one identity.
        var result = [], seen = Object.create(null);
        rows.forEach(function (n) {
            if (!n.name && !n.phone && !n.email) return;
            var key = [String(n.name || '').trim().toLowerCase(), String(n.organization || '').trim().toLowerCase(), String(n.email || '').toLowerCase(), String(n.phone || '').replace(/[^0-9]/g, '')].join('|');
            if (!seen[key]) { seen[key] = true; result.push(n); }
        });
        return result.sort(function (a, b) { var rank = function (n) { return (n.person ? 4 : 0) + (L.emailHref(n.email) || L.phoneHref(n.phone) ? 2 : 0) + (n.source === 'Saved contact' ? 1 : 0); }; return rank(b) - rank(a); });
    }
    function card(n) {
        var tel = L.phoneHref(n.phone), email = L.emailHref(n.email);
        return '<article class="pp-card"><span class="pp-kind">' + (n.person ? 'Named contact' : 'Office / organization') + '</span><h4>' + esc(n.name || n.organization || 'Contact') + '</h4><p>' + esc([n.title, n.organization !== n.name ? n.organization : ''].filter(Boolean).join(' · ')) + '</p><div class="pp-ways">' +
            (n.phone ? tel ? '<a href="' + esc(tel) + '">' + esc(n.phone) + '</a>' : '<span>' + esc(n.phone) + '</span>' : '<span>Phone not published</span>') +
            (n.email ? email ? '<a href="' + esc(email) + '">' + esc(n.email) + '</a>' : '<span>' + esc(n.email) + '</span>' : '<span>Email not published</span>') + '</div><details><summary>Source & role verification</summary><p>' + (R.safeUrl(n.sourceUrl) ? '<a href="' + esc(n.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(n.source) + '</a>' : esc(n.source)) + ' · ' + esc(n.sourceDate || 'Date not recorded') + '</p><p>' + esc(n.notes) + '</p><p>Confirm the current role, contact details and authority over energy terms.</p></details></article>';
    }
    function render(c, saved, directory, research, crm) {
        var all = contacts(c, saved, directory, research, crm), people = all.filter(function (n) { return n.person; }), offices = all.filter(function (n) { return !n.person; });
        var html = '<div class="pp-heading"><h3>People to contact</h3>' + (saved && saved.id ? '<a href="./contacts.html?for=' + esc(encodeURIComponent(saved.id)) + '&amp;new=1">Add contact</a>' : '') + '</div>';
        if (!all.length) return html + '<p>No named person or direct line is recorded yet. Use the owner contact route below to ask for the landfill manager or energy development lead.</p>';
        html += people.length ? '<div class="pp-grid">' + people.slice(0, 3).map(card).join('') + '</div>' + (people.length > 3 ? '<details class="pp-offices"><summary>More named contacts (' + (people.length - 3) + ')</summary><div class="pp-grid">' + people.slice(3).map(card).join('') + '</div></details>' : '') : '<p>A named individual is still to identify. Start with the published office below.</p>';
        if (offices.length) html += people.length ? '<details class="pp-offices"><summary>Office contacts & introduction routes (' + offices.length + ')</summary><div class="pp-grid">' + offices.map(card).join('') + '</div></details>' : '<div class="pp-grid">' + offices.map(card).join('') + '</div>';
        return html;
    }
    function savedContacts(saved) { return saved && typeof CrmContacts !== 'undefined' ? CrmContacts.forProspect(saved.id) : []; }
    function placeholder(c, saved) { return '<section class="pp-people" data-prospect-people="' + esc(c.id) + '">' + render(c, saved, L.get(c), null, savedContacts(saved)) + '<p class="pp-loading" role="status">Checking published contacts…</p></section>'; }
    function mount(root, c, saved) {
        var host = root && root.querySelector('[data-prospect-people]');
        if (!host || host.getAttribute('data-prospect-people') !== c.id) return Promise.resolve(null);
        if (host._peopleRequest) return host._peopleRequest;
        host._peopleRequest = Promise.allSettled([L.loadFor(c), R.loadResearch(c)]).then(function (results) {
            if (host.isConnected === false || host.getAttribute('data-prospect-people') !== c.id) return;
            host.innerHTML = render(c, saved, results[0].status === 'fulfilled' ? results[0].value : L.get(c), results[1].status === 'fulfilled' ? results[1].value : null, savedContacts(saved));
            if (results.some(function (r) { return r.status === 'rejected'; })) {
                host.insertAdjacentHTML('beforeend', '<p role="status">Some published contacts could not load. Saved contacts are shown. <button type="button" data-people-retry>Retry contacts</button></p>');
                host.querySelector('[data-people-retry]').onclick = function () { host._peopleRequest = null; mount(root, c, saved); };
            }
        });
        return host._peopleRequest;
    }
    return { contacts: contacts, render: render, placeholder: placeholder, mount: mount };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProspectPeople;
