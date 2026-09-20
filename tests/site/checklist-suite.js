/* The free worksheet must retain the screening/evidence contract in HTML. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'site/site-screening-checklist.html'), 'utf8');
const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal((html.match(/scope="row"/g) || []).length, 12);
assert.equal((html.match(/scope="col"/g) || []).length, 6);
for (let n = 1; n <= 12; n++) {
    assert.ok(html.includes('role="rowheader"><strong>' + n + '. '), 'check ' + n + ' remains a row header');
}
for (const phrase of [
    'Find a new site', 'Review a site I found', 'original listing/referral',
    'Brief version / review date / reviewed by', 'Must-haves:', 'usable load + unit',
    'Delivered-power price ceiling + currency', 'project capital ceiling + currency',
    'Operating hours / interruption tolerance', 'other hard exclusions',
    'C — Confirmed', 'R — Reported', 'U — Unknown', 'X — Conflict', 'N/A',
    'A model remains an estimate.', 'original measurement or effective date', 'date checked',
    'Unused nameplate does not establish available supply.', 'unknown cost stays blank',
    'public contact alone proves no willingness', 'nearby infrastructure alone proves no connection capacity',
    'Keep research fees separate from project capital.', 'already known or rejected',
    'Proceed with the next check', 'further investigation only', 'Park', 'Exclude',
    'most important unresolved question', 'responsible person / effort limit', 'reopening trigger',
    'Custom Site Search', 'Existing Site Review', 'Scope and fees are agreed before research',
    'protonminingco.com/energy-sites.html#request', 'Version 1.0', '20 September 2026',
]) assert.ok(text.includes(phrase), 'worksheet preserves: ' + phrase);
assert.equal((html.match(/<input\b|<textarea\b|<select\b/g) || []).length, 0,
    'a print worksheet does not pretend to store or submit answers');
assert.ok(html.includes('data-print-checklist') && html.includes('Print or save as PDF'));
assert.ok(html.includes('href="./cheap-mining-power-quote.html"'), 'the resource links back to its cost-basis guide');
assert.ok(html.includes('href="./energy-sites.html#request"'), 'the service CTA uses the existing request route');
assert.ok(fs.readFileSync(path.join(root, 'site/energy-sites.html'), 'utf8').includes('id="request"'));
assert.ok(require(path.join(root, 'site/tools/launch.js')).isIndexablePage('site-screening-checklist.html'));
console.log('checklist-suite: ALL OK');
