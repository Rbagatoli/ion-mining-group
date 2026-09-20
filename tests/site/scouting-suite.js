/* Public client preview contract: evidence cannot quietly become an offer, and a
   customer draft cannot share the operator application's data or write endpoints. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '../..');
const DIR = path.join(ROOT, 'portal/scouting');
const read = file => fs.readFileSync(path.join(DIR, file), 'utf8');
const html = read('index.html'), source = read('scouting.js'), sample = read('sample-data.js');
const visualSource = read('site-visuals.js'), visualSample = read('visual-data.js'), styles = read('scouting.css');
const context = { window: {}, URL };
vm.runInNewContext(sample, context, { timeout: 1000 });
vm.runInNewContext(visualSample, context, { timeout: 1000 });
vm.runInNewContext(visualSource, context, { timeout: 1000 });
const data = context.window.ProtonScoutingSample;
const visualData = context.window.PROTON_VISUAL_DATA, visualUI = context.window.ProtonSiteVisuals;
const profiles = [...data.profiles, ...data.exclusions.map(x => x.profile)];
let checks = 0;
function check(name, run) { run(); checks++; console.log('  ok    ' + name); }
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { visit(key, child); walk(child, visit); }
}
function publicUrl(value, label) { const u = new URL(value); assert.equal(u.protocol, 'https:', label); assert.equal(u.username + u.password, '', label); }

check('public research has a fixed date, bounded scope and no inventory claim', () => {
  assert.equal(data.isSample, true);
  assert.equal(data.inventoryStatus, 'research-example-only');
  assert.equal(data.researchDate, '2026-09-19');
  assert.equal(data.version, 'PM-ENERGY-SIM-001-DATA-v1');
  assert.match(data.presentationVersion, /^PM-SCOUTING-PUBLIC-/);
  assert.equal(data.searchSummary.recordsScreened, 229);
  assert.equal(data.searchSummary.distinctSites, 125);
  assert.equal(data.searchSummary.deepReviewedPhysicalSites, 4);
  assert.equal(data.searchSummary.confirmedAvailableSites, 0);
  assert.match(data.sampleLabel, /example/i);
  assert.match(data.assumptions.join(' '), /[Cc]hanging.*brief.*does not.*research/);
});
check('all four physical sites retain their unresolved, hold or exclusion dispositions', () => {
  assert.equal(profiles.length, 4);
  assert.deepEqual(profiles.map(p => [p.id, p.status]), [
    ['SIM-952', 'unresolved'], ['SIM-1273', 'unresolved'], ['SIM-734', 'hold'], ['SIM-1250', 'excluded']
  ]);
  assert.equal(new Set(profiles.map(p => p.id)).size, 4);
  assert.equal(data.searchSummary.unresolvedCandidates, 2);
  assert.equal(data.searchSummary.holds, 1);
  assert.equal(data.searchSummary.exclusions, 1);
});
check('104 checklist answers retain evidence, explicit unknowns and next questions', () => {
  const expected = ['ID-01', 'ID-02', 'CT-01', 'CT-02', 'CT-03',
    'EN-01', 'EN-02', 'EN-03', 'EN-04', 'EN-05', 'EN-06', 'EN-07',
    'IF-01', 'IF-02', 'IF-03', 'IF-04', 'IF-05', 'IF-06',
    'CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05', 'CM-06', 'EV-01', 'FT-01'];
  let count = 0;
  for (const p of profiles) {
    assert.deepEqual(Array.from(p.checklist, f => f.id), expected, p.id);
    for (const f of p.checklist) {
      const label = p.id + '/' + f.id;
      assert(['unknown', 'partial'].includes(f.status), label + ': no confirmation was received');
      assert.equal(typeof f.value, 'string', label); assert(f.value.trim(), label);
      assert.equal(typeof f.nextQuestion, 'string', label); assert(f.nextQuestion.trim(), label);
      assert(Array.isArray(f.sourceIds), label);
      if (f.status === 'partial') assert(f.sourceIds.length, label + ': partial evidence needs a citation');
      count++;
    }
  }
  assert.equal(count, 104);
});
check('every profile citation resolves to its own sources and the public source register', () => {
  const register = new Map(data.sourceRegister.map(s => [s.id, s]));
  assert.equal(register.size, data.sourceRegister.length);
  for (const s of register.values()) { publicUrl(s.url, s.id); assert(s.title && s.basis && s.scope, s.id); assert.equal(s.accessedDate, data.researchDate); }
  for (const p of profiles) {
    const local = new Map(p.sources.map(s => [s.id, s]));
    assert.equal(local.size, p.sources.length, p.id);
    for (const s of local.values()) { assert(register.has(s.id), s.id); assert.equal(s.url, register.get(s.id).url, s.id); }
    walk(p, (key, ids) => { if (key === 'sourceIds') for (const id of ids) assert(local.has(id), p.id + ': missing ' + id); });
    publicUrl(p.contact.url, p.id + ' public contact');
    assert.match(p.contact.note, /[Uu]nconfirmed|[Nn]o.*contact|not.*contact/);
  }
});
check('historical capacity cannot become available power, quoted price or capital savings', () => {
  for (const p of profiles) {
    for (const key of ['availableMw', 'quotedEnergyPrice', 'planningMw', 'remainingCapital', 'verifiedReuseCredit']) {
      assert.equal(p[key], null, p.id + '/' + key + ': unknown must remain null, not zero');
    }
    assert.equal(p.infrastructureStatus, 'historical-records-current-condition-unverified', p.id);
    assert.match(p.capacityBasis, /[Hh]istorical/); assert.match(p.capacityBasis, /not/i);
    assert.match(p.capitalSummary, /not priced/i);
    assert(p.unknowns.length && p.concerns.length && p.nextQuestions.length, p.id);
  }
  assert.equal(profiles.filter(p => p.availableMw != null && p.quotedEnergyPrice != null).length, 0);
});
check('capacity and location conflicts, conditional decommissioning and the unavailable source survive publication', () => {
  const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
  const penn = JSON.stringify(byId['SIM-952']);
  assert.match(penn, /1\.85/); assert.match(penn, /2\.8/); assert.match(penn, /conflict|discrep|reconcil/i);
  const bradford = JSON.stringify(byId['SIM-1273']);
  assert.match(bradford, /Brady/); assert.match(bradford, /Lycoming/); assert.match(bradford, /LOCATION CONFLICT/);
  const alpha = byId['SIM-734'].sources.find(s => s.id === 'A-D');
  assert.match(alpha.scope, /decommissioning/); assert.match(alpha.scope, /subject to MDE approval/);
  assert.match(alpha.scope, /not proof.*already occurred/); assert.match(alpha.locator, /88/);
  const seccra = byId['SIM-1250'];
  for (const s of [seccra.sources.find(s => s.id === 'S-W'), data.sourceRegister.find(s => s.id === 'S-W')]) {
    assert.equal(s.accessStatus, 'unavailable-404'); assert.match(s.accessNote, /404/);
    assert.match(s.accessNote, /[Cc]ommissioning.*unconfirmed/);
  }
  assert.match(JSON.stringify(seccra), /20.year/);
});
check('public packet contains no private account, payment, agent-instruction or raw catalog payload', () => {
  const prohibitedKeys = /^(?:apiKey|token|accessToken|refreshToken|password|secret|customerId|clientId|accountId|privateNotes|internalNotes|systemPrompt|agentPrompt|taskPackets|rawCatalog|paymentIntent|subscriptionId)$/i;
  walk(data, key => assert(!prohibitedKeys.test(key), 'Private payload key: ' + key));
  assert.doesNotMatch(sample, /(?:C:\\Users\\|C:\/Users\/|Bearer\s+[A-Za-z0-9]|sk_live_|sk_test_|AIza[0-9A-Za-z_-]{20})/);
  assert.doesNotMatch(JSON.stringify(data), /\$1,000|1000\/month/);
});
check('unified workspace loads visual dependencies in order and exposes honest preview/draft boundaries', () => {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), m => m[1].split('?')[0]);
  const styles = Array.from(html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g), m => m[1].split('?')[0]);
  assert.deepEqual(scripts, ['./sample-data.js', './visual-data.js', './site-visuals.js', './energy-access-data.js', './site-access.js', './scouting.js']);
  assert.deepEqual(styles, ['./scouting.css', './site-access.css']);
  assert.doesNotMatch(html, /<iframe\b|<form\b[^>]*\baction=|<script\b[^>]*>(?!\s*<\/script>)[\s\S]+?<\/script>/i);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /Workspace preview/); assert.match(html, /unsent draft/);
  assert.match(html, /sales@protonminingco\.com/);
  assert.match(source, /Changing your brief requires new research/);
  assert.match(source, /No subscription, payment or recurring research is active/);
  assert.match(source, /Reported does not mean reusable/);
  assert.match(source, /visuals: 'Site visuals'/);
  assert.doesNotMatch(source, /<iframe\b/);
});
check('all four visual records join the same research profiles without changing their dispositions', () => {
  assert.equal(visualData.researchVersion, data.version);
  assert.equal(visualData.preparedDate, data.researchDate);
  assert.equal(new Set(visualData.sites.map(p => p.id)).size, 4);
  assert.deepEqual(Array.from(visualData.sites, p => p.id).sort(), profiles.map(p => p.id).sort());
  for (const p of profiles) {
    const visual = visualData.sites.find(v => v.id === p.id);
    assert.equal(visual.profileId, p.id); assert.equal(visual.status, p.status);
    assert.equal(visual.aerial.profileId, p.id);
    assert.equal(visual.aerial.profileVersion, visual.profileVersion);
    assert.equal(visual.aerial.captionRecord.parentAssetVersion, visual.aerial.assetVersion);
    for (const photo of visual.photos) { assert.equal(photo.profileId, p.id); assert.equal(photo.profileVersion, visual.profileVersion); }
    const markup = visualUI.render(p);
    assert.match(markup, /VISUAL SITE BRIEF/); assert.match(markup, /measured inputs needed/);
    assert.match(markup, /Notes stay in this page session and are not sent/);
    assert.doesNotMatch(markup, /<iframe\b/);
  }
});
check('historical aerials preserve acquisition evidence while the rejected Alpha location stays withheld', () => {
  for (const p of profiles) {
    const visual = visualData.sites.find(v => v.id === p.id), markup = visualUI.render(p);
    const images = Array.from(markup.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g), m => m[1]);
    if (p.id === 'SIM-734') {
      assert.equal(visualUI.canPlot(p), false); assert.equal(visual.coordinates.displayAllowed, false);
      assert.equal(visual.aerial.buyerDisplayAllowed, false); assert.equal(visual.aerial.imageUrl, null);
      assert.equal(images.length, 0); assert.doesNotMatch(markup, /class="sv-map-marker"/);
      assert.match(markup, /catalog coordinate was rejected/); assert.match(markup, /Rejected image record/);
      const map = new URL(visualUI.mapUrl(p));
      assert.match(map.searchParams.get('query'), /2350.*Marriottsville/i);
      assert.doesNotMatch(map.searchParams.get('query'), /39\.30578|-76\.8988/);
    } else {
      assert.equal(visualUI.canPlot(p), true); assert.equal(images.length, 1, p.id);
      assert.equal(new URL(images[0]).hostname, 'imagery.nationalmap.gov');
      assert.match(markup, new RegExp('Acquired ' + visual.aerial.captureDate));
      assert(markup.includes(visual.aerial.metadataUrl.replace(/&/g, '&amp;')), p.id + ' acquisition source');
      assert.match(markup, /not an equipment location or usable pad/);
    }
  }
});
check('publisher photographs stay opt-in source previews and cannot enter the printed client brief', () => {
  assert.equal(visualData.sites.reduce((count, p) => count + p.photos.length, 0), 3);
  for (const p of profiles) {
    const visual = visualData.sites.find(v => v.id === p.id), markup = visualUI.render(p);
    for (const photo of visual.photos) {
      assert.equal(photo.rightsStatus, 'source_link_only');
      assert(!markup.includes('src="' + photo.imageUrl + '"'), p.id + ' should not load a publisher image by default');
      assert(markup.includes(photo.sourceUrl.replace(/&/g, '&amp;')), p.id + ' publisher source link');
    }
    if (visual.photos.length) {
      assert.match(markup, /Internal source preview/); assert.match(markup, /Preview published photo/);
      assert.match(markup, /Photo captured/); assert.match(markup, /Source published/);
      assert.match(markup, /Publication and review dates do not establish when the photo was taken/);
      assert.match(markup, /photographs are excluded from print/);
    }
  }
  assert.match(styles, /@media print\s*\{[^}]*\.sv-internal[^}]*\.sv-photo-preview[^}]*display:none!important/);
});
check('visual module has no application network, authentication, storage or automatic message coupling', () => {
  assert.doesNotMatch(visualSource, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/);
  assert.doesNotMatch(visualSource, /\b(?:firebase|Firestore|Auth|ProtonSync|CRMStore|Stripe)\s*[.(]/);
  assert.doesNotMatch(visualSource, /\b(?:localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie|\b(?:import|require)\s*\(/);
  assert.doesNotMatch(visualSource, /(?:mailto:|\/api\/|\.submit\s*\()/);
  assert.match(visualSource, /allowed\.includes\(parsed\.hostname\)/);
});
check('login has one unified client workspace entry and the legacy visuals route redirects into it', () => {
  const login = fs.readFileSync(path.join(ROOT, 'portal/index.html'), 'utf8');
  const legacy = fs.readFileSync(path.join(ROOT, 'portal/energy-scouting/index.html'), 'utf8');
  const workspaceEntries = Array.from(login.matchAll(/<a\b[^>]*href="([^\"]*(?:scouting|site-sourc)[^\"]*)"[^>]*>/g), m => m[1]);
  assert.deepEqual(workspaceEntries, ['./scouting/']);
  assert.equal((login.match(/id="ptDemoScouting"/g) || []).length, 1);
  assert.doesNotMatch(login, /href="[^\"]*energy-scouting\//);
  assert.match(login, /search brief, site research and visual evidence/);
  assert.match(legacy, /http-equiv="refresh" content="0;url=\.\.\/scouting\/#sites"/);
  assert.match(legacy, /href="\.\.\/scouting\/#sites"/);
  assert.doesNotMatch(legacy, /<script\b|<iframe\b|visual-brief\.js/);
});
check('runtime has no CRM sync, auth, network, payment or shared-storage coupling', () => {
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(/);
  assert.doesNotMatch(source, /\b(?:firebase|Firestore|Auth|ProtonSync|CRMStore|Stripe)\s*[.(]/);
  assert.doesNotMatch(source, /\b(?:import|require)\s*\(|\b(?:sessionStorage|indexedDB|caches)\b|document\.cookie/);
  assert.doesNotMatch(source, /localStorage\s*\.\s*(?:clear|key)\s*\(/);
  for (const m of source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)) assert.equal(m[1], 'KEY');
  assert.match(source, /const KEY = 'proton:scouting:preview:v1'/);
});

// Execute the actual startup and reset handlers against a small DOM. Storage
// includes unrelated account data so a broad read, overwrite or clear fails.
function boot(saved, storageBlocked = false, options = {}) {
  const key = 'proton:scouting:preview:v1', sentinel = 'operator:private:test';
  const stored = new Map([[sentinel, 'must remain untouched']]);
  if (saved !== undefined) stored.set(key, JSON.stringify(saved));
  const touched = [], elements = new Map(), listeners = {};
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', dataset: {},
      classList: { add() {}, remove() {} }, addEventListener(type, fn) { this[type] = fn; },
      focus() {}, select() {}, showModal() {}, scrollIntoView() {}, querySelectorAll() { return []; }, querySelector() { return null; } });
    return elements.get(id);
  };
  const storage = {};
  for (const method of ['getItem', 'setItem', 'removeItem']) storage[method] = (k, value) => {
    touched.push([method, k]); assert.equal(k, key, 'Only the customer-preview key may be accessed');
    if (storageBlocked) throw new Error('Storage blocked');
    if (method === 'getItem') return stored.get(k) ?? null;
    if (method === 'setItem') stored.set(k, value); else if (method === 'removeItem') stored.delete(k);
  };
  const document = { getElementById: element, querySelector: element, querySelectorAll: () => [],
    addEventListener(type, fn) { listeners[type] = fn; } };
  const window = { ProtonScoutingSample: data, confirm: () => true, addEventListener() {}, scrollTo() {} };
  if (options.visuals) {
    window.PROTON_VISUAL_DATA = visualData;
    vm.runInNewContext(visualSource, { window, URL }, { timeout: 1000 });
  }
  vm.runInNewContext(source, { window, document, localStorage: storage, location: { hash: options.hash || '#overview' },
    URL, Intl, setTimeout: () => 1, clearTimeout() {}, innerWidth: 1440 }, { timeout: 1000 });
  return { stored, touched, element, listeners, key, sentinel };
}
check('startup and reset access only the preview key and preserve unrelated operator data', () => {
  const h = boot({ v: 1, brief: { company: 'Example client', minMw: '0.5', maxMw: '2' }, feedback: { 'SIM-952': 'Interested' } });
  assert.match(h.element('saveState').textContent, /not sent/);
  h.element('resetPreview').click();
  assert.equal(h.stored.get(h.sentinel), 'must remain untouched'); assert.equal(h.stored.has(h.key), false);
  assert.deepEqual(h.touched.map(x => x[0]), ['getItem', 'removeItem']);
});
check('untrusted local drafts render as text and invalid load ranges recover without touching other storage', () => {
  const h = boot({ v: 1, brief: { region: '<img src=x onerror=alert(1)>', minMw: '-4', maxMw: '0' }, feedback: { 'SIM-952': '<script>bad</script>' } });
  const markup = h.element('main').innerHTML;
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<img src=x|<script>bad/);
  assert.match(markup, /0\.5–2/); assert.match(markup, /New research is needed/);
  assert.equal(h.stored.get(h.sentinel), 'must remain untouched');
});
check('blocked storage still opens the read-only preview and explains its memory-only draft limit', () => {
  const h = boot(undefined, true);
  assert.match(h.element('main').innerHTML, /sample report/i);
  assert.match(h.element('saveState').textContent, /Storage unavailable/);
  assert.equal(h.stored.get(h.sentinel), 'must remain untouched');
});
check('actual site route omits Alpha from the locator and uses its official address even without the visual module', () => {
  for (const visuals of [false, true]) {
    const h = boot(undefined, false, { hash: '#sites', visuals });
    assert.match(h.element('locator').innerHTML, /Alpha Ridge omitted/);
    assert.doesNotMatch(h.element('locator').innerHTML, /data-open="SIM-734"/);
    assert.match(h.element('siteList').innerHTML, /data-open="SIM-734"/);
    h.listeners.click({ preventDefault() {}, target: { closest(selector) { return selector === '[data-open]' ? { dataset: { open: 'SIM-734' } } : null; } } });
    const detail = h.element('siteDetail').innerHTML;
    const url = detail.match(/href="([^\"]+)"[^>]*target="_blank"/);
    assert(url, 'Selected Alpha profile needs an official-address map');
    assert.match(new URL(url[1].replace(/&amp;/g, '&')).searchParams.get('query'), /2350.*Marriottsville/i);
    assert.doesNotMatch(detail, /39\.30578|-76\.8988/);
    h.listeners.click({ target: { closest(selector) { return selector === '[data-tab]' ? { dataset: { tab: 'visuals' } } : null; } } });
    assert.match(h.element('detailBody').innerHTML, visuals ? /catalog coordinate was rejected/ : /Visual supplement unavailable/);
    assert.equal(h.stored.get(h.sentinel), 'must remain untouched');
  }
});
check('nested workspace assets participate in cache stamping and are mandatory publish outputs', () => {
  const stamping = require(path.join(ROOT, 'tools/build-asset-stamp.js'));
  const area = stamping.AREAS.find(a => a.name === 'scouting');
  assert(area, 'The nested scouting directory needs its own stamp area');
  assert.equal(area.dir, 'portal/scouting');
  assert.deepEqual(stamping.pagesOf(area.dir), ['index.html']);
  assert.deepEqual(stamping.expected(area).assets, ['./energy-access-data.js', './sample-data.js', './scouting.css', './scouting.js', './site-access.css', './site-access.js', './site-visuals.js', './visual-data.js']);
  const build = fs.readFileSync(path.join(ROOT, 'tools/build-pages.js'), 'utf8');
  const required = build.match(/const MUST_EXIST\s*=\s*\[([\s\S]*?)\];/);
  assert(required, 'Published output contract missing');
  for (const file of ['index.html', 'sample-data.js', 'scouting.css', 'scouting.js', 'visual-data.js', 'site-visuals.js', 'energy-access-data.js', 'site-access.css', 'site-access.js']) assert(required[1].includes("'portal/scouting/" + file + "'"), file + ' must be verified in the output');
});
console.log('\n' + checks + ' scouting contract checks passed.');
