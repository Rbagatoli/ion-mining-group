'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mail = require('../site/site.js');

function harness(clipboard = true) {
  const nodes = [], navigation = [], copies = [];
  function element(tag) {
    const el = { tag, children: [], events: {}, attributes: {}, textContent: '', value: '', hidden: false,
      append(...children) { this.children.push(...children); },
      addEventListener(name, fn) { this.events[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { this.focused = true; }, select() { this.selected = true; } };
    nodes.push(el); return el;
  }
  const location = {};
  Object.defineProperty(location, 'href', { set(value) { navigation.push(value); } });
  const w = { document: { createElement: element }, location,
    navigator: clipboard ? { clipboard: { async writeText(value) { copies.push(value); } } } : {},
    fetch() { assert.fail('Draft preparation must not send a request'); },
    localStorage: { setItem() { assert.fail('Do not store customer drafts'); } },
    sessionStorage: { setItem() { assert.fail('Do not store customer drafts'); } } };
  return { w, form: element('form'), nodes, navigation, copies };
}

test('ordinary draft uses an encoded sales mailto with complete entered characters', () => {
  const body = 'Name: Test & Company\nRequest: 1.5 MW / Montréal ⚡\nDetails: a?bcc=wrong@example.test#fragment';
  const draft = Mail.compose('sales@protonminingco.com', 'Site enquiry — test', body);
  const url = new URL(draft.href);
  assert.equal(draft.long, false); assert.equal(url.pathname, 'sales@protonminingco.com');
  assert.equal(url.searchParams.get('body'), body); assert.equal(url.searchParams.get('subject'), 'Site enquiry — test');
  assert.equal(url.searchParams.size, 2); assert.equal(url.hash, '');
  const h = harness(); const result = Mail.open(h.w, h.form, draft.to, draft.subject, body);
  assert.equal(result.opened, true); assert.deepEqual(h.navigation, [draft.href]); assert.deepEqual(h.copies, []);
});

test('long enquiries retain every character without launching a potentially truncated draft', async () => {
  const body = 'Complete original source & referral terms\n' + 'Unique details: infrastructure, capacity, timing ⚡\n'.repeat(250) + 'FINAL REQUIRED DETAIL';
  assert.ok(body.length > 10000);
  const h = harness(); const result = Mail.open(h.w, h.form, 'sales@protonminingco.com', 'Find a site', body);
  assert.equal(result.opened, false); assert.equal(result.long, true); assert.deepEqual(h.navigation, []); assert.deepEqual(h.copies, []);
  const textarea = h.nodes.find(n => n.tag === 'textarea');
  assert.equal(textarea.value, body); assert.equal(textarea.readOnly, true); assert.equal(textarea.focused, true);
  assert.equal(h.form.children.length, 1);
  const link = h.nodes.find(n => n.tag === 'a'), url = new URL(link.href);
  assert.ok(link.href.length < 1800); assert.equal(url.pathname, 'sales@protonminingco.com');
  assert.match(url.searchParams.get('body'), /Paste the complete enquiry/);
  assert.doesNotMatch(url.searchParams.get('body'), /FINAL REQUIRED DETAIL/);
  const copy = h.nodes.find(n => n.tag === 'button'); await copy.events.click();
  assert.deepEqual(h.copies, [body]); assert.match(h.nodes.find(n => n.attributes.role === 'status').textContent, /Complete enquiry copied/);
  assert.deepEqual(h.navigation, [], 'Copying never opens or sends mail');
});

test('clipboard failure offers manual selection and never falsely announces a copy', async () => {
  const h = harness(false), body = 'A long source record. '.repeat(180);
  Mail.open(h.w, h.form, 'sales@protonminingco.com', 'Review a site', body);
  await h.nodes.find(n => n.tag === 'button').events.click();
  const textarea = h.nodes.find(n => n.tag === 'textarea'), status = h.nodes.find(n => n.attributes.role === 'status');
  assert.equal(textarea.value, body); assert.equal(textarea.selected, true); assert.match(status.textContent, /Select and copy/); assert.doesNotMatch(status.textContent, /copied/);
});

test('preparing an edited enquiry updates one copy area and a short replacement hides stale text', async () => {
  const h = harness(), first = 'First original request. '.repeat(120), second = 'Revised exact request. '.repeat(140);
  Mail.open(h.w, h.form, 'sales@protonminingco.com', 'Find a site', first);
  Mail.open(h.w, h.form, 'sales@protonminingco.com', 'Review a site', second);
  assert.equal(h.form.children.length, 1); assert.equal(h.nodes.filter(n => n.tag === 'textarea').length, 1);
  await h.nodes.find(n => n.tag === 'button').events.click(); assert.deepEqual(h.copies, [second]);
  assert.equal(new URL(h.nodes.find(n => n.tag === 'a').href).searchParams.get('subject'), 'Review a site');
  Mail.open(h.w, h.form, 'sales@protonminingco.com', 'Short enquiry', 'A 1 MW site in Texas.');
  assert.equal(h.form.children[0].hidden, true); assert.equal(h.navigation.length, 1);
});

test('campaign context only includes bounded explicit UTM fields and pathname', () => {
  const result = Mail.campaign({ search: '?utm_source=guide%0ASpoof&utm_medium=article&utm_campaign=' + 'a'.repeat(500) + '&email=private@example.test&token=secret', pathname: '/energy-sites.html' }).join('\n');
  assert.match(result, /Campaign source: guide Spoof/); assert.match(result, /Campaign name: a{180}\n/);
  assert.doesNotMatch(result, /secret|private@example|token|email=/);
  assert.deepEqual(Mail.campaign({ search: '?unrelated=value', pathname: '/contact.html' }), []);
});

test('recipient validation rejects header syntax and encodes reserved mailbox characters', () => {
  assert.throws(() => Mail.compose('sales@protonminingco.com\nbcc:other@example.test', 'Subject', 'Body'));
  const url = new URL(Mail.compose('sales+test@protonminingco.com', 'Subject', 'Body').href);
  assert.equal(decodeURIComponent(url.pathname), 'sales+test@protonminingco.com'); assert.equal(url.searchParams.size, 2);
});
