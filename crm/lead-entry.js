/* Prepared lead JSON validation only. Applying fields and saving remain separate UI actions. */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ProtonCrmLeadEntry = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var own = Function.call.bind(Object.prototype.hasOwnProperty);
  // Keep these limits aligned with AgentControlModel.leadValid and the lead form.
  var fields = {
    company: { label: 'Company', max: 180 },
    website: { label: 'Company website', max: 1800 },
    offer: { label: 'Service', choices: 'offers' },
    stage: { label: 'Lead stage', choices: 'stages' },
    signal: { label: 'Buying signal', max: 2000 },
    source: { label: 'Signal source URL', max: 1800 },
    checked: { label: 'Evidence checked on', date: true },
    buyer: { label: 'Buyer role', max: 180 },
    contact: { label: 'Business contact route', max: 300 },
    channel: { label: 'Lead source', choices: 'channels' },
    serviceFit: { label: 'Service fit', max: 2000 },
    nextAction: { label: 'Next action', max: 1000 },
    due: { label: 'Next action due', date: true },
    lastTouch: { label: 'Contact / outcome date', date: true },
    lastNote: { label: 'Contact / outcome note', max: 2000 },
    notes: { label: 'Lead notes', max: 4000 }
  };

  function fail(message) { throw new Error(message); }

  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    var leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    // HTML date inputs cannot represent year zero; reject it before filling fields.
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
  }

  function checkUrl(value, label) {
    var parsed;
    if (!/^https?:\/\//i.test(value) || /\s|[\u0000-\u001f\u007f\\]/.test(value)) {
      fail(label + ' must be a full HTTP or HTTPS URL without credentials.');
    }
    try { parsed = new URL(value); } catch (error) {
      fail(label + ' must be a full HTTP or HTTPS URL without credentials.');
    }
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      fail(label + ' must be a full HTTP or HTTPS URL without credentials.');
    }
  }

  function parse(text, options) {
    if (typeof text !== 'string') fail('Paste one lead as a JSON object.');
    if (text.length > 30000) fail('Prepared lead JSON must be 30,000 characters or fewer.');
    if (!text.trim()) fail('Paste one lead as a JSON object.');
    if (!options || (options.mode !== 'new' && options.mode !== 'update')) fail('Choose a new lead or an existing lead before applying prepared JSON.');
    var payload;
    try { payload = JSON.parse(text); } catch (error) {
      fail('Use valid JSON containing one lead object, without Markdown fences or extra text.');
    }
    if (!payload || Array.isArray(payload) || typeof payload !== 'object' || Object.getPrototypeOf(payload) !== Object.prototype) {
      fail('Prepared lead JSON must contain one object, not an array or another value.');
    }
    var keys = Object.keys(payload);
    if (!keys.length) fail('Prepared lead JSON must contain at least one lead field.');
    var result = {};
    keys.forEach(function (key) {
      if (!own(fields, key)) fail('Unknown lead field: ' + key + '. Use only the fields shown in the lead form.');
      var spec = fields[key], value = payload[key];
      if (typeof value !== 'string') fail(spec.label + ' must be a string. Use an empty string to clear an optional field.');
      value = value.trim();
      if (spec.max && value.length > spec.max) fail(spec.label + ' must be ' + spec.max.toLocaleString('en-US') + ' characters or fewer.');
      if ((key === 'company' || key === 'website') && !value) fail(spec.label + ' cannot be empty.');
      if (spec.choices) {
        var choices = options[spec.choices];
        if (!choices || typeof choices !== 'object' || Array.isArray(choices) || !own(choices, value)) {
          fail('Choose a valid ' + spec.label.toLowerCase() + ' using its exact field value.');
        }
      }
      if ((key === 'website' || key === 'source') && value) checkUrl(value, spec.label);
      if (spec.date && value && !calendarDate(value)) fail(spec.label + ' must be a real calendar date in YYYY-MM-DD format.');
      if ((key === 'checked' || key === 'lastTouch') && value) {
        if (!calendarDate(options.today)) fail('The current date is unavailable. Reopen the lead form and try again.');
        if (value > options.today) fail(spec.label + ' cannot be in the future. Put planned work in the next action.');
      }
      result[key] = value;
    });
    if (options.mode === 'new') {
      ['company', 'website', 'offer'].forEach(function (key) {
        if (!own(result, key) || !result[key]) fail('A new prepared lead requires an explicit ' + fields[key].label.toLowerCase() + ' field.');
      });
    }
    return result;
  }

  return { parse: parse };
}));
