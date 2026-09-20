'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('../site/site-intake.js');

// Exercise the mounted fallback handler without launching a mail client,
// connecting a provider or enabling the private intake endpoint.
function fallback(service, receipt = null) {
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
    querySelector: selector => selector === '[data-intake-submit]' ? submit : email,
    querySelectorAll: () => [], addEventListener() {}
  };
  const document = {
    referrer: '', querySelector: () => form, createElement: () => section, addEventListener() {},
    getElementById: id => id === 'intakeStatus' ? status : id === 'ss-site' ? target : { textContent: '' }
  };
  const location = { search: '', pathname: '/energy-sites.html', hostname: 'protonminingco.com' };
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
  assert.equal(navigation.length, 1);
  assert.equal(status.textContent, before, 'Opening a draft does not replace the receipt status');
  assert.equal(submit.disabled, true, 'Email does not enable private intake');
  assert.deepEqual(writes, [], 'Email does not record a receipt or customer data');
  return new URL(navigation[0]);
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
