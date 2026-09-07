/* Exercise the accepted research through the real adapters, lazy fetch and UI.
 * Repeated LMOP project IDs must not cross-link two physical landfills.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const L = require('../landfill-contacts.js');
global.SiteSources = require('../site-sources.js');
const US = require('../source-landfill.js');
const CA = require('../source-landfill-ca.js');
// Research reports are local source material, outside the runtime publish list.
// Compare them when available; the checked-in shards and inventory remain testable alone.
const reportPath = path.join(ROOT, 'reports/all-landfill-contacts-2026-09-06/landfill-contacts.json');
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
const usInventory = require('../data/landfills.json').projects;
const caInventory = require('../data/landfills-ca.json').prospects;
const manifest = require('../tools/app-assets.json');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const candidate = id => id.startsWith('us-lf-')
    ? { id: 'project', source: 'lmop-landfill', sourceDetail: { lfid: id.slice(6) } }
    : { id, source: 'eccc-landfill-ca', sourceDetail: { ghgrpId: id.slice(6) } };
const all = {};
let recordCount = 0;

for (const rel of manifest.filter(p => p.startsWith('data/landfill-contacts-'))) {
    const shard = JSON.parse(read(rel));
    assert.equal(shard.generated, L.edition);
    assert.ok(fs.statSync(path.join(ROOT, rel)).size < 300000, 'lazy payload stays small');
    for (const [id, site] of Object.entries(shard.sites)) {
        assert.equal(all[id], undefined, 'each physical site occurs once');
        assert.equal(L.assetFor(id), './' + rel);
        all[id] = site;
        recordCount += site.contacts.length;
    }
}
assert.equal(Object.keys(all).length, 2158);
assert.equal(recordCount, 9036);
assert.equal(Object.values(all).filter(s => s.contacts.length).length, 2121);

for (const site of report ? report.sites : Object.values(all)) {
    if (report) assert.deepEqual(all[site.siteId].contacts, site.contacts, 'every accepted field and alternate survives packaging');
    const html = L.renderRecord(all[site.siteId]);
    assert.equal((html.match(/<article /g) || []).length, site.contacts.length);
    for (const c of site.contacts) {
        if (c.phone) assert.ok(L.phoneHref(c.phone), 'clickable researched phone: ' + c.phone);
        if (c.email) assert.ok(L.emailHref(c.email), 'clickable researched email: ' + c.email);
    }
    if (!site.contacts.length) {
        assert.ok(all[site.siteId].researchNotes && all[site.siteId].nextAction);
        assert.match(html, /No public phone or email found/);
    }
}

for (const row of usInventory) {
    const c = SiteSources.normalize(US.adapter.normalize(row), US.adapter.id);
    assert.equal(L.siteIdFor(c), 'us-lf-' + row.lfid);
    assert.equal(all[L.siteIdFor(c)].siteId, 'us-lf-' + row.lfid);
}
for (const row of caInventory) {
    const c = SiteSources.normalize(CA.normalize(row), CA.adapter.id);
    assert.equal(L.siteIdFor(c), row.id);
    assert.ok(all[row.id]);
}
assert.equal(L.siteIdFor({ id: 'lmop_1', name: Object.values(all)[0].name, source: 'lmop-landfill' }), null);
assert.equal(L.siteIdFor({ source: 'eia-facility', sourceDetail: { lfid: '757' } }), null);
assert.equal(L.siteIdFor({ id: 'ca-lf-G12140', source: 'eccc-landfill-ca', sourceDetail: { ghgrpId: 'G10625' } }), null);
assert.equal(L.assetFor('__proto__'), null);
assert.equal(L.assetFor('us-lf-../../contacts'), null);
assert.match(JSON.stringify(all['us-lf-757'].contacts), /Kent County/i);
assert.match(JSON.stringify(all['us-lf-1345'].contacts), /Winbush/i);
assert.match(JSON.stringify(all['ca-lf-G12140'].contacts), /tire|parent/i);

assert.equal(L.phoneHref('403-342-8750 ext. 123'), 'tel:4033428750;ext=123');
assert.equal(L.emailHref('person@example.com?subject=injected'), null);
const unsafe = L.renderRecord({ contacts: [{ contactName: '<img src=x onerror=alert(1)>',
    phone: '123" onclick="evil()', email: 'evil@example.com?body=x', sourceUrl: 'javascript:alert(1)',
    additionalSourceUrl: 'data:text/html,evil', notes: '<script>evil()</script>' }] });
assert.ok(!/<img|<script|href="javascript:|href="data:|onclick="evil/.test(unsafe));
assert.match(unsafe, /&lt;img/);
assert.match(L.renderRecord(all['us-lf-351']), /Next step:/);

function fresh(fetch) {
    const context = vm.createContext({ fetch, Promise, console, module: { exports: {} } });
    vm.runInContext(read('landfill-contacts.js'), context);
    return context.module.exports;
}
function response(url) { return { ok: true, json: async () => JSON.parse(read(url.replace(/^\.\//, ''))) }; }
function widget(id) {
    const attrs = { 'data-landfill-contacts': id };
    const retry = { addEventListener: (_, fn) => { retry.click = fn; } };
    return { innerHTML: 'loading', isConnected: true, retry,
        setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k],
        removeAttribute: k => { delete attrs[k]; }, querySelector: () => retry };
}

async function main() {
    const c = candidate('us-lf-757');
    let requests = 0;
    const api = fresh(async url => { requests++; return response(url); });
    const [a, b] = await Promise.all([api.loadFor(c), api.loadFor(c)]);
    assert.equal(requests, 1, 'concurrent panels share one fetch');
    assert.equal(a.siteId, 'us-lf-757');
    assert.equal(a, b);
    await api.loadFor(c);
    assert.equal(requests, 1, 'reopening uses loaded research');
    await api.loadFor({ source: 'eia-facility' });
    assert.equal(requests, 1, 'other source types do not fetch landfill contacts');

    // A late response may fill its widget, but cannot replace the form or a new site's widget.
    let resolveFetch;
    const slow = fresh(url => new Promise(resolve => { resolveFetch = () => resolve(response(url)); }));
    let host = widget('us-lf-757');
    const oldHost = host;
    const root = { querySelector: () => host, innerHTML: 'saved contact and unsaved quoted terms' };
    const pending = slow.mount(root, c);
    host.isConnected = false;
    host = widget('us-lf-1345');
    resolveFetch();
    await pending;
    assert.equal(host.innerHTML, 'loading', 'the newly selected site gets no stale contact');
    assert.equal(oldHost.innerHTML, 'loading', 'detached widgets are left alone');
    assert.equal(root.innerHTML, 'saved contact and unsaved quoted terms');

    let attempts = 0;
    const flaky = fresh(async url => { if (++attempts === 1) throw Error('offline'); return response(url); });
    host = widget('us-lf-757');
    await flaky.mount(root, c);
    assert.match(host.innerHTML, /could not be loaded/);
    assert.doesNotMatch(host.innerHTML, /No public phone or email found/);
    host.retry.click();
    await host._landfillContactRequest;
    assert.equal(attempts, 2);
    assert.match(host.innerHTML, /Kent County/i);
    assert.equal(host.getAttribute('aria-busy'), undefined);
    assert.equal(root.innerHTML, 'saved contact and unsaved quoted terms');

    const malformed = fresh(async () => ({ ok: true, json: async () => ({ v: 1, generated: 'old', sites: {} }) }));
    await assert.rejects(malformed.loadFor(c), /format/);
    const missing = fresh(async () => ({ ok: false, status: 404 }));
    await assert.rejects(missing.loadFor(c), /404/);

    for (const [page, script] of [['map.html', 'map-sourcing.js'], ['prospecting.html', 'prospect-detail.js']]) {
        const html = read(page);
        assert.ok(html.indexOf('./landfill-contacts.js?') < html.indexOf('./' + script + '?'));
        assert.match(html, /href="\.\/landfill-contacts.css\?v=[0-9a-f]+"/);
        assert.match(read(script), /LandfillContacts\.placeholder\(c\)/);
        assert.match(read(script), /LandfillContacts\.mount\(/);
    }
    const map = read('map-sourcing.js');
    assert.match(map, /id === 'terms'.*LandfillContacts\.mount/);
    assert.match(map, /querySelector\('#dtab_terms'\).*hidden/);
    assert.match(map, /crmField\('contact_name'/);
    assert.match(map, /crm_contact_notes/);
    assert.ok(manifest.includes('landfill-contacts.js') && manifest.includes('landfill-contacts.css'));
    assert.match(read('sw.js'), /'\.\/landfill-contacts.js'/);
    assert.match(read('sw.js'), /'\.\/landfill-contacts.css'/);
    console.log('PASS: all 2,158 sites / 9,036 records, 2,755 US project mappings, 156 Canadian mappings, links, provenance, lazy loading, retry, stale responses and saved-form preservation.');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
