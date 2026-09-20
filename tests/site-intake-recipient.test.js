'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mount, emailLines } = require('../site/site-intake.js');

// Exercise the mounted fallback handler without launching a mail client,
// connecting a provider or enabling the private intake endpoint.
function fallback(service, receipt = null, options = {}) {
  const events = {}, navigation = [], writes = [];
  const fields = { service, name: 'Example & Co.', email: 'client@example.test', region: 'Pennsylvania',
    site_details: 'Supplied site', energy_sources: 'Hydro', consent: 'on', website: '' };
  const submit = { disabled: true };
  const email = { addEventListener: (name, fn) => { events[name] = fn; } };
  const section = { querySelectorAll: () => [], append() {}, innerHTML: '' };
  const status = { textContent: '', after() {}, setAttribute() {}, classList: { toggle() {} } };
  const target = { required: false };
  const serviceControl = { value: service, addEventListener() {} };
  const form = {
    elements: { service: serviceControl },
    reportValidity() { return options.valid !== false; },
    querySelector: selector => selector === '[data-intake-submit]' ? submit : email,
    querySelectorAll: () => [], addEventListener() {}
  };
  const document = {
    referrer: '', querySelector: () => form, createElement: () => section, addEventListener() {},
    getElementById: id => id === 'intakeStatus' ? status : id === 'ss-site' ? target : { textContent: '' }
  };
  const location = { search: options.search || '', pathname: '/energy-sites.html', hostname: 'protonminingco.com' };
  Object.defineProperty(location, 'href', { set: value => navigation.push(value) });
  const w = {
    document, location, ProtonIntakeConfig: { endpoint: '' },
    FormData: class extends Map { constructor() { super(Object.entries(fields)); } getAll(key) { return this.has(key) ? [this.get(key)] : []; } },
    sessionStorage: { getItem: () => receipt && JSON.stringify(receipt), setItem: (...args) => writes.push(args), removeItem: key => writes.push(key) },
    fetch() { throw new Error('Email fallback must not contact a service'); }
  };
  mount(w);
  const before = status.textContent;
  assert.equal(navigation.length, 0, 'Mount does not open mail');
  events.click();
  assert.equal(navigation.length, options.valid === false ? 0 : 1);
  assert.equal(status.textContent, before, 'Opening a draft does not replace the receipt status');
  assert.equal(submit.disabled, true, 'Email does not enable private intake');
  assert.equal(submit.hidden, true, 'Disconnected private submission is not advertised as an available action');
  assert.deepEqual(writes, [], 'Email does not record a receipt or customer data');
  return navigation.length ? new URL(navigation[0]) : null;
}

test('all energy intake services open an encoded sales draft without sending or claiming receipt', () => {
  for (const [service, subject] of Object.entries({ custom_search: 'Find a site', site_review: 'Review a site I found', site_submission: 'Submit or refer a site' })) {
    const url = fallback(service);
    assert.equal(url.protocol, 'mailto:');
    assert.equal(url.pathname, 'sales@protonminingco.com');
    assert.equal(url.searchParams.get('subject'), subject + ' — Proton energy enquiry');
    assert.equal(url.searchParams.size, 2);
    const body = url.searchParams.get('body');
    assert.match(body, /Receipt not confirmed/);
    assert.match(body, /name: Example & Co\./);
    assert.match(body, /energy sources: Hydro/);
    assert.doesNotMatch(body, /(?:consent|website):/);
  }
});

test('sales fallback preserves an unconfirmed retry reference without upgrading it to a receipt', () => {
  const key = '11111111-1111-4111-8111-111111111111';
  const url = fallback('custom_search', { key, hash: 'a'.repeat(64) });
  assert.equal(url.pathname, 'sales@protonminingco.com');
  assert.match(url.searchParams.get('body'), new RegExp('Unconfirmed retry reference: ' + key));
  assert.doesNotMatch(url.searchParams.get('body'), /Received reference:/);
});

test('email fallback enforces native required-field validation before opening mail', () => {
  assert.equal(fallback('custom_search', null, { valid: false }), null);
  assert.equal(fallback('site_review', null, { valid: false }), null);
});

test('optional campaign parameters travel only in the user-prepared email, not storage or network', () => {
  const url = fallback('custom_search', null, { search: '?utm_source=guide&utm_medium=article&utm_campaign=site%20launch&secret=omit-me' });
  const body = url.searchParams.get('body');
  assert.match(body, /Campaign source: guide/); assert.match(body, /Campaign medium: article/);
  assert.match(body, /Campaign name: site launch/); assert.match(body, /Enquiry page: \/energy-sites.html/);
  assert.doesNotMatch(body, /omit-me|secret/);
});

test('email brief retains entered details, known exclusions and units without filling empty optional fields', () => {
  const lines = emailLines({ service: 'custom_search', name: 'Synthetic', email: 's@example.test', region: 'Texas', power_value: '1.5', power_unit: 'MW', existing_opportunities: 'Already rejected <site> & original source', energy_sources: [], cost_basis: 'delivered', power_cost_cents: '0', requirements: 'First line\nSecond line', company: '', timeline: 'unknown', website: 'honeypot', consent: 'on' }, null).join('\n');
  assert.match(lines, /power value: 1.5/); assert.match(lines, /power unit: MW/); assert.match(lines, /power cost cents: 0/); assert.match(lines, /cost basis: delivered/);
  assert.match(lines, /existing opportunities: Already rejected <site> & original source/); assert.match(lines, /requirements: First line\nSecond line/);
  assert.match(lines, /energy sources: Any energy source/); assert.doesNotMatch(lines, /company:|timeline:|honeypot|consent:/);
});
