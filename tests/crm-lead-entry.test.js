'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../agent-control-model.js');
const Entry = require('../crm/lead-entry.js');

const options = { mode: 'new', offers: A.OFFERS, stages: A.LEAD_STAGES, channels: A.CHANNELS, today: '2026-09-22' };
const lead = { company: 'Example Mining', website: 'https://example.com', offer: 'sourcing' };
const parse = (value, extra) => Entry.parse(JSON.stringify(value), { ...options, ...extra });
const update = value => parse(value, { mode: 'update' });

test('new prepared leads require an explicit service, company and website', () => {
  assert.deepEqual(parse(lead), lead);
  for (const [key, label] of [['company', 'company'], ['website', 'website'], ['offer', 'service']]) {
    const missing = { ...lead };
    delete missing[key];
    assert.throws(() => parse(missing), new RegExp(label, 'i'));
    assert.throws(() => parse({ ...lead, [key]: '  ' }), new RegExp(label, 'i'));
  }
});

test('partial updates return only supplied fields and permit intentional optional clearing', () => {
  const existing = { ...lead, stage: 'qualified', channel: 'referral', contact: 'buyer@example.com', notes: 'Keep this', checked: '2026-09-20' };
  const result = update({ nextAction: '  Check availability  ', due: '2026-10-01', serviceFit: '' });
  assert.deepEqual(result, { nextAction: 'Check availability', due: '2026-10-01', serviceFit: '' });
  const applied = { ...existing, ...result };
  for (const key of Object.keys(existing)) assert.equal(applied[key], existing[key]);
  assert.deepEqual(update({ notes: '', source: '', checked: '', lastTouch: '' }), { notes: '', source: '', checked: '', lastTouch: '' });
  assert.throws(() => update({ company: '' }), /company.*empty/i);
  assert.throws(() => update({ website: '' }), /website.*empty/i);
});

test('trim only edge whitespace while preserving internal spacing and newlines', () => {
  const result = parse({ ...lead, company: '  Example  Mining  ', signal: '\nPublic announcement\n\n  Evidence remains indented.\n', notes: '\tLine one\r\n  Line two  \n' });
  assert.equal(result.company, 'Example  Mining');
  assert.equal(result.signal, 'Public announcement\n\n  Evidence remains indented.');
  assert.equal(result.notes, 'Line one\r\n  Line two');
});

test('reject malformed, empty and non-object JSON with readable errors', () => {
  for (const text of ['', ' ', '{', '{}', '[]', '[{}]', 'null', 'true', '1', '"lead"', '```json\n{}\n```']) {
    assert.throws(() => Entry.parse(text, options), error => error instanceof Error && error.message.length > 15, text);
  }
  for (const input of [null, undefined, 123, lead]) assert.throws(() => Entry.parse(input, options), /JSON object/);
});

test('reject unknown and prototype-related fields without changing global objects', () => {
  for (const key of ['id', '__proto__', 'constructor', 'prototype', 'toString', 'updatedAt', 'permission']) {
    assert.throws(() => Entry.parse('{"' + key + '":"unsafe"}', { ...options, mode: 'update' }), /Unknown lead field/);
  }
  assert.equal({}.unsafe, undefined);
});

test('strings are required; nested objects, arrays, booleans and numbers are never coerced', () => {
  for (const value of [null, 10, false, [], {}, ['text']]) {
    assert.throws(() => update({ notes: value }), /notes must be a string/i);
  }
  assert.throws(() => parse({ ...lead, company: 123 }), /company must be a string/i);
});

test('enum validation uses supplied dictionary own keys without defaults or inherited choices', () => {
  for (const [field, dictionary] of [['offer', 'offers'], ['stage', 'stages'], ['channel', 'channels']]) {
    for (const value of Object.keys(options[dictionary])) assert.equal(update({ [field]: value })[field], value);
    for (const value of ['', 'made_up', 'toString', '__proto__']) assert.throws(() => update({ [field]: value }), /Choose a valid/);
    const inherited = Object.create({ inherited: 'Do not accept' });
    inherited.allowed = 'Accept';
    assert.throws(() => parse({ [field]: 'inherited' }, { mode: 'update', [dictionary]: inherited }), /Choose a valid/);
    assert.deepEqual(parse({ [field]: 'allowed' }, { mode: 'update', [dictionary]: inherited }), { [field]: 'allowed' });
    assert.throws(() => parse({ [field]: 'allowed' }, { mode: 'update', [dictionary]: undefined }), /Choose a valid/);
  }
});

test('website and source require absolute HTTP(S) URLs without embedded credentials', () => {
  for (const key of ['website', 'source']) {
    for (const value of ['https://example.com/a?b=1#c', 'http://example.com']) assert.equal(update({ [key]: value })[key], value);
    for (const value of ['example.com', '/relative', '//example.com', 'https:example.com', 'https://', 'javascript:alert(1)', 'data:text/plain,x', 'ftp://example.com', 'https://user:pass@example.com', 'https://user@example.com', 'https://exa\nmple.com', 'https:\\example.com', 'https://example.com/a b']) {
      assert.throws(() => update({ [key]: value }), /HTTP or HTTPS URL/, key + ': ' + JSON.stringify(value));
    }
  }
});

test('date fields validate the calendar rather than allowing JavaScript date rollover', () => {
  for (const key of ['checked', 'due', 'lastTouch']) {
    for (const value of ['2024-02-29', '2000-02-29', '2026-09-22']) assert.equal(update({ [key]: value })[key], value);
    for (const value of ['0000-01-01', '2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-01-32', '2026-9-2', '2026-09-22T00:00:00Z', 'not-a-date']) {
      assert.throws(() => update({ [key]: value }), /real calendar date/, key + ': ' + value);
    }
  }
  assert.deepEqual(update({ due: '2028-02-29' }), { due: '2028-02-29' });
  for (const key of ['checked', 'lastTouch']) {
    assert.throws(() => update({ [key]: '2026-09-23' }), /cannot be in the future/);
    assert.throws(() => parse({ [key]: '2026-09-22' }, { mode: 'update', today: undefined }), /current date is unavailable/);
    assert.throws(() => parse({ [key]: '2026-09-22' }, { mode: 'update', today: '2026-02-30' }), /current date is unavailable/);
  }
});

test('enforce every existing lead string length limit at the boundary', () => {
  const limits = { company: 180, website: 1800, signal: 2000, source: 1800, buyer: 180, contact: 300, serviceFit: 2000, nextAction: 1000, lastNote: 2000, notes: 4000 };
  for (const [key, max] of Object.entries(limits)) {
    const prefix = key === 'website' || key === 'source' ? 'https://example.com/' : '';
    const atLimit = prefix + 'x'.repeat(max - prefix.length);
    assert.equal(update({ [key]: atLimit })[key], atLimit, key);
    assert.throws(() => update({ [key]: atLimit + 'x' }), /characters or fewer/, key);
  }
});

test('input limit counts the complete pasted text including whitespace', () => {
  const text = JSON.stringify(lead);
  assert.deepEqual(Entry.parse(text.padEnd(30000, ' '), options), lead);
  assert.throws(() => Entry.parse(text.padEnd(30001, ' '), options), /30,000 characters/);
});

test('parser leaves options and model dictionaries unchanged and exports to the browser without DOM access', () => {
  const snapshot = JSON.stringify(options);
  parse({ ...lead, stage: 'discovered', channel: 'direct' });
  assert.equal(JSON.stringify(options), snapshot);
  assert.throws(() => Entry.parse(JSON.stringify(lead), { ...options, mode: 'import' }), /new lead or an existing lead/);
  const context = { window: {}, URL };
  vm.runInNewContext(fs.readFileSync(require.resolve('../crm/lead-entry.js'), 'utf8'), context);
  assert.equal(typeof context.window.ProtonCrmLeadEntry.parse, 'function');
  assert.equal(context.window.ProtonCrmLeadEntry.parse(JSON.stringify(lead), options).company, lead.company);
  assert.deepEqual(Object.keys(context.window), ['ProtonCrmLeadEntry']);
});
