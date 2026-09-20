/* Client contact routes and evidence are public research, never a power offer.
 * Exercise the shipped module with a VM; no owner is contacted by this suite. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DIR = path.join(__dirname, '../../portal/scouting');
const read = name => fs.readFileSync(path.join(DIR, name), 'utf8');
const source = read('site-access.js');
const context = { window: {}, URL };
for (const file of ['sample-data.js', 'energy-access-data.js', 'site-access.js']) {
  vm.runInNewContext(read(file), context, { timeout: 1000, filename: file });
}
const { ProtonScoutingSample: sample, ProtonEnergyAccessData: data, ProtonSiteAccess: api } = context.window;
const profiles = [...sample.profiles, ...sample.exclusions.map(x => x.profile)];
const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
const brief = { minMw: '0.5', maxMw: '2', company: 'Example Mining', timing: 'Within a year', infrastructure: 'Existing generation preferred', budget: '250000', rate: '4' };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('  ok    ' + name); }
function https(value, label) { const u = new URL(value); assert.equal(u.protocol, 'https:', label); assert.equal(u.username + u.password, '', label); }

check('all four sites have sourced business contact routes with separately stated verification limits', () => {
  assert.deepEqual(Array.from(data.sites, s => s.id).sort(), Object.keys(byId).sort());
  assert.match(data.checkedDate, /^\d{4}-\d{2}-\d{2}$/);
  for (const p of profiles) {
    const contacts = api.contacts(p);
    assert(contacts.length > 0, p.id + ': missing contact route');
    const original = api.packet(p).contacts;
    assert.deepEqual(Array.from(contacts, c => c.priority), Array.from(original, c => c.priority).sort((a, b) => a - b));
    for (const c of contacts) {
      const label = p.id + ': ' + c.name;
      assert(c.name && c.role && c.organization && c.ask, label);
      https(c.sourceUrl, label); assert(c.sourceTitle, label);
      assert.match(c.checkedDate, /^\d{4}-\d{2}-\d{2}$/, label);
      assert(c.phone || c.email || c.website, label + ': no route');
      if (c.website) https(c.website, label);
      if (c.email) assert.match(c.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, label);
      assert(c.verification, label + ': source checking must not imply confirmed authority');
      assert.doesNotMatch(c.verification, /(?:guessed|inferred) (?:email|address)/i, label);
    }
    const rendered = api.renderContacts(p);
    assert.match(rendered, /No outreach or response recorded/);
    assert.match(rendered, /Public listing does not establish signing authority/);
    assert.match(rendered, /checked/);
  }
});

check('new public capacity snapshots do not qualify power or overwrite historical research dispositions', () => {
  const before = JSON.stringify(sample);
  assert.deepEqual(profiles.map(p => [p.id, p.status]), [
    ['SIM-952', 'unresolved'], ['SIM-1273', 'unresolved'], ['SIM-734', 'hold'], ['SIM-1250', 'excluded']
  ]);
  const updates = data.sites.filter(s => s.capacityUpdate);
  assert(updates.length >= 2, 'Newer EIA snapshots should remain separately identified');
  assert(updates.some(s => Number(s.capacityUpdate.nameplateMw) === 0.9));
  assert(updates.some(s => Number(s.capacityUpdate.nameplateMw) === 1.6));
  for (const p of profiles) {
    for (const key of ['availableMw', 'quotedEnergyPrice', 'planningMw', 'remainingCapital', 'verifiedReuseCredit']) assert.equal(p[key], null, p.id + '/' + key);
    const packet = api.packet(p);
    assert.equal(packet.availableMw, null, p.id + ': supplemental research is not an allocation');
    assert.equal(packet.quotedEnergyPrice, null, p.id + ': supplemental research is not a quote');
    assert.equal(packet.ownerContacted, false, p.id + ': source review is not an owner response');
    assert.match(p.capacityBasis, /historical/i);
    const html = api.render(p, brief);
    assert.match(html, /Not owner-qualified/);
    assert.match(html, /No confirmed allocation, quote or agreement to host mining/);
    assert.equal((html.match(/class="ea-open">Unconfirmed/g) || []).length, 6);
    if (api.packet(p).capacityUpdate) {
      assert.match(html, /operating nameplate/); assert.match(html, /snapshot/);
      assert.match(html, /older figures below remain historical evidence/);
      assert.match(html, /not power available to a new client/);
      https(api.packet(p).capacityUpdate.sourceUrl, p.id + ' capacity source');
    }
  }
  assert.equal(api.outlook(byId['SIM-734']).tone, 'hold');
  assert.equal(api.outlook(byId['SIM-1250']).tone, 'excluded');
  assert.equal(api.outlook({ id: 'NOT_RESEARCHED', status: 'unresolved' }).label, 'Access not assessed');
  assert.equal(api.contacts({ id: 'NOT_RESEARCHED' }).length, 0);
  assert.equal(JSON.stringify(sample), before, 'Rendering must not mutate evidence');
});

check('load screening distinguishes a nameplate-level fit, a partial range and a minimum above the rating', () => {
  const before = JSON.stringify(data);
  for (const p of profiles.filter(p => api.packet(p).capacityUpdate)) {
    const rating = api.packet(p).capacityUpdate.nameplateMw;
    const below = { ...brief, minMw: String(rating / 4), maxMw: String(rating / 2) };
    const boundary = { ...brief, minMw: String(rating / 2), maxMw: String(rating) };
    const partial = { ...brief, minMw: String(rating / 2), maxMw: String(rating * 2) };
    const above = { ...brief, minMw: String(rating + 0.01), maxMw: String(rating * 2) };
    for (const b of [below, boundary]) {
      assert.match(api.assessment(p, b).technical[0], /Plausible at the nameplate level/, p.id);
      assert.doesNotMatch(api.outlook(p, b).label, /requested scale|smaller phase/i, p.id);
      assert.match(api.assessment(p, b).technical[1], /not a net-power match/i, p.id);
    }
    assert.match(api.assessment(p, partial).technical[0], /Smaller phase/, p.id);
    assert.match(api.assessment(p, partial).technical[1], /Net output and spare capacity may be lower/, p.id);
    assert.match(api.outlook(p, partial).label, /smaller phase/i, p.id);
    assert.match(api.assessment(p, above).technical[0], /Below your minimum load/, p.id);
    assert.match(api.outlook(p, above).label, /Weak fit at your requested scale/, p.id);
    assert.match(api.render(p, above), /minimum load exceeds the reported generator rating/, p.id);
    for (const b of [below, boundary, partial, above]) {
      assert.match(api.assessment(p, b).commercial[0], /unproven/i, p.id + ': a smaller load does not establish commercial access');
      assert.match(api.assessment(p, b).evidence[0], /weak on access/i, p.id);
      assert.equal(api.packet(p).availableMw, null);
    }
  }
  assert.equal(JSON.stringify(data), before, 'Changing the load must not mutate the research packet or create allocated MW');
});

check('missing or invalid load ranges never produce a capacity-fit judgment or crash the assessment', () => {
  const p = byId['SIM-952'];
  const invalid = [undefined, null, {}, { minMw: '', maxMw: '' }, { minMw: ' ', maxMw: ' ' },
    { minMw: 'no value', maxMw: '2' }, { minMw: '0.5', maxMw: 'not a number' },
    { minMw: '0', maxMw: '0.5' }, { minMw: '-1', maxMw: '0.5' },
    { minMw: '2', maxMw: '0.5' }, { minMw: Infinity, maxMw: Infinity }];
  for (const b of invalid) {
    const result = api.assessment(p, b);
    assert.doesNotMatch(result.technical[0], /Plausible|Below your minimum|Smaller phase/i, JSON.stringify(b));
    assert.doesNotMatch(api.outlook(p, b).label, /requested scale|smaller phase/i, JSON.stringify(b));
    const html = api.render(p, b);
    assert.doesNotMatch(html, /undefined|NaN|Infinity|Your minimum load exceeds/);
    assert.match(html, /No confirmed allocation/);
  }
});

check('load changes cannot erase project-direction constraints or manufacture an assessment for an unresearched site', () => {
  for (const b of [{ minMw: '0.01', maxMw: '0.02' }, { minMw: '50', maxMw: '60' }]) {
    assert.equal(api.outlook(byId['SIM-734'], b).tone, 'hold');
    assert.match(api.assessment(byId['SIM-734'], b).technical[0], /Retirement risk/);
    assert.equal(api.outlook(byId['SIM-1250'], b).tone, 'excluded');
    assert.match(api.assessment(byId['SIM-1250'], b).commercial[0], /Competing long-term gas use/);
  }
  const unknown = { id: 'NOT_RESEARCHED', status: 'unresolved' };
  assert.equal(api.assessment(unknown, brief).technical[0], 'Not assessed');
  assert.equal(api.assessment(unknown, brief).commercial[0], 'Not assessed');
  assert.equal(api.outlook(unknown, brief).label, 'Access not assessed');
});

check('each enquiry addresses the selected published contact and includes the client requirements', () => {
  for (const p of profiles) for (const [i, c] of api.contacts(p).entries()) {
    const d = api.draft(p, brief, i);
    assert.equal(d.to, c.email || ''); assert.equal(d.contactName, c.name);
    assert(d.subject.includes(p.name)); assert(d.body.startsWith('Hello ' + c.name + ','));
    for (const value of ['0.5–2 MW', brief.company, brief.timing, brief.infrastructure, brief.budget, brief.rate + ' US cents/kWh', c.ask]) assert(d.body.includes(value), p.id + ': missing ' + value);
    assert.match(d.body, /not assuming that spare power/);
    assert.match(d.body, /firm net MW/); assert.match(d.body, /existing sales or gas commitments/);
    assert.match(d.body, /remaining site work, deposits and who would pay/);
  }
  assert.equal(api.draft(profiles[0], brief, -1).to, '', 'An invalid contact selection must not send to a different recipient');
});

// A hostile fixture verifies the renderer and recipient handling independently
// of the fixed public packet. No fixture data is written to production files.
const hostile = '<img src=x onerror=alert(1)>';
const fixture = { id: 'UNTRUSTED', name: hostile, status: 'unresolved', recommendation: hostile, infrastructureSummary: hostile };
const fixtureData = { checkedDate: hostile, sites: [{ id: fixture.id, summary: hostile, nextStep: hostile,
  signals: [{ label: hostile, finding: hostile, state: 'unknown', sourceUrl: 'javascript:alert(1)', sourceTitle: hostile }],
  contacts: [{ priority: 1, name: hostile, role: hostile, organization: hostile, email: 'owner@example.com\r\nBcc:other@example.com', phone: '+1 (555) 123-4567 ext. 42', website: 'javascript:alert(1)', sourceUrl: 'data:text/html,bad', sourceTitle: hostile, ask: hostile, verification: hostile }]
}] };
const fixtureContext = { window: { ProtonEnergyAccessData: fixtureData }, URL };
vm.runInNewContext(source, fixtureContext, { timeout: 1000 });
const fixtureApi = fixtureContext.window.ProtonSiteAccess;

check('rendered contact and client text cannot become HTML or active unsafe links', () => {
  const html = fixtureApi.render(fixture, { minMw: hostile, maxMw: hostile }) + fixtureApi.renderContacts(fixture);
  assert.doesNotMatch(html, /<img|href="(?:javascript:|data:|mailto:)/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="tel:\+15551234567;ext=42"/);
  assert.equal(fixtureApi.draft(fixture, { ...brief, company: hostile }).to, '', 'Header injection is not a recipient');
  assert(fixtureApi.draft(fixture, { ...brief, company: hostile }).body.includes(hostile), 'Drafts preserve editable user text rather than HTML-encoding an email');
});

check('the draft dialog uses text fields, encodes edited email content and hides unsourced recipients', () => {
  const nodes = new Map(); let handler, appended = 0, copies = 0;
  function node() { return { value: '', textContent: '', hidden: false, href: '',
    addEventListener(type, fn) { this[type] = fn; }, setAttribute() {},
    removeAttribute(name) { delete this[name]; }, focus() {}, select() {} }; }
  const dialog = { ...node(), innerHTML: '', querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }, showModal() { this.open = true; } };
  const document = { getElementById() { return appended ? dialog : null; }, createElement() { return dialog; }, body: { appendChild() { appended++; } } };
  const vmContext = { window: { ProtonEnergyAccessData: data }, document, URL, navigator: { clipboard: { writeText() { copies++; return Promise.resolve(); } } } };
  vm.runInNewContext(source, vmContext, { timeout: 1000 });
  vmContext.window.ProtonSiteAccess.bind({ addEventListener(type, fn) { assert.equal(type, 'click'); handler = fn; } }, profiles, () => ({ ...brief, company: hostile }));
  function click(p, index) {
    const trigger = { dataset: { accessDraft: p.id, contactIndex: String(index) }, hasAttribute: () => true };
    handler({ target: { closest: () => trigger } });
  }
  const p = profiles.find(p => api.contacts(p).some(c => c.email));
  assert(p, 'At least one published business email is expected');
  const index = api.contacts(p).findIndex(c => c.email), c = api.contacts(p)[index];
  click(p, index);
  const text = nodes.get('textarea'), mail = nodes.get('#accessDraftMail');
  assert.equal(appended, 1); assert.equal(dialog.open, true); assert.equal(copies, 0);
  assert.equal(mail.hidden, false); assert(text.value.includes(hostile)); assert.doesNotMatch(dialog.innerHTML, /<img/);
  const edited = 'Reviewed & changed\n?subject=other#fragment <b>literal</b>';
  text.value = edited; text.oninput();
  const parsed = new URL(mail.href);
  assert.equal(parsed.protocol, 'mailto:'); assert.equal(decodeURIComponent(parsed.pathname), c.email);
  assert.equal(parsed.searchParams.get('body'), edited); assert.equal(parsed.searchParams.get('subject'), 'Energy-use enquiry — ' + p.name);
  click(p, -1);
  assert.equal(mail.hidden, true); assert.equal(mail.href, undefined);
  assert.match(nodes.get('#accessDraftRecipient').textContent, /no direct email published/);
  assert.equal(copies, 0); assert.equal(appended, 1);
});

check('contact enrichment adds no automatic outreach, account access or operator-storage coupling', () => {
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie/);
  assert.doesNotMatch(source, /\b(?:firebase|Firestore|Auth|ProtonSync|CRMStore|Stripe)\s*[.(]/);
  assert.doesNotMatch(source, /\b(?:import|require)\s*\(|location\.(?:href|assign|replace)\s*[=(]/);
  assert.match(source, /Unsent draft/);
  assert.match(source, /Nothing has been sent/);
});

console.log('\n' + checks + ' energy access checks passed.');
