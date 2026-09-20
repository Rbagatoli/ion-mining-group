/* Client brief preferences only. Broader selections request research; they never
 * manufacture matching sites or turn public records into available power. */
(function () {
  'use strict';
  const sources = Object.freeze([
    ['landfill_gas', 'Landfill gas'],
    ['flare_gas', 'Flare gas'],
    ['hydro', 'Hydro'],
    ['nuclear', 'Nuclear'],
    ['wind', 'Wind'],
    ['solar', 'Solar'],
    ['industrial_surplus', 'Industrial surplus'],
    ['grid_supply', 'Grid supply']
  ].map(source => Object.freeze(source)));
  const defaultSources = Object.freeze(['landfill_gas']);
  const boundForms = new WeakSet();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function normalize(value) {
    if (!Array.isArray(value)) return [...defaultSources];
    if (!value.length) return [];
    const selected = sources.filter(([id]) => value.includes(id)).map(([id]) => id);
    return selected.length ? selected : [...defaultSources];
  }
  function selected(brief) { return normalize(brief && brief.energySources); }
  function summary(brief) {
    const values = selected(brief);
    return values.length ? sources.filter(([id]) => values.includes(id)).map(([, label]) => label).join(', ') : 'Any energy source';
  }
  function changed(brief) {
    const values = selected(brief);
    return values.length !== 1 || values[0] !== defaultSources[0];
  }
  function researchNote(brief) {
    return changed(brief)
      ? 'New research required. These preferences do not add matching sites to the current landfill sample report.'
      : 'The current sample report covers four landfill sites. Available energy and commercial terms still need owner confirmation.';
  }
  function render(brief) {
    const values = selected(brief);
    return `<section class="form-section" aria-labelledby="energy-source-heading"><h2 id="energy-source-heading">Energy sources</h2><p class="small muted" id="energy-source-help">Choose every source you would consider, or leave the source unrestricted. Your choice becomes part of your research request.</p><div class="form-grid" role="group" aria-labelledby="energy-source-heading" aria-describedby="energy-source-help"><label class="check"><input type="checkbox" name="anyEnergySource" value="any"${values.length ? '' : ' checked'}> Any energy source</label>${sources.map(([id, label]) => `<label class="check"><input type="checkbox" name="energySources" value="${esc(id)}"${values.includes(id) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div><p class="small muted" data-energy-research-note role="status" aria-live="polite">${esc(researchNote(brief))}</p></section>`;
  }
  function inputs(form) {
    return Array.from(form.querySelectorAll('input[name="energySources"]')).filter(input => sources.some(([id]) => id === input.value));
  }
  function read(form) {
    if (!form || typeof form.querySelector !== 'function') return [...defaultSources];
    const any = form.querySelector('input[name="anyEnergySource"]');
    if (any && any.checked) return [];
    const values = inputs(form).filter(input => input.checked).map(input => input.value);
    return normalize(values);
  }
  function bind(form) {
    if (!form || typeof form.querySelector !== 'function' || boundForms.has(form)) return;
    const any = form.querySelector('input[name="anyEnergySource"]');
    const choices = inputs(form);
    if (!any || !choices.length) return;
    boundForms.add(form);
    const update = () => {
      const note = form.querySelector('[data-energy-research-note]');
      if (note) note.textContent = researchNote({ energySources: read(form) });
    };
    any.addEventListener('change', () => {
      if (any.checked) choices.forEach(input => { input.checked = false; });
      else if (!choices.some(input => input.checked)) choices.forEach(input => { input.checked = defaultSources.includes(input.value); });
      update();
    });
    choices.forEach(input => input.addEventListener('change', () => {
      any.checked = !choices.some(choice => choice.checked);
      update();
    }));
    update();
  }
  function draftLines(brief) {
    return [
      'Energy sources: ' + summary(brief),
      changed(brief)
        ? 'Please research these energy preferences. I understand the current four-site landfill sample does not establish matches or available power for this request.'
        : 'Please verify landfill energy availability and commercial terms; the sample report is not a confirmed power offer.'
    ];
  }
  function coverage(brief) {
    return `<div class="callout"><strong>${changed(brief) ? 'New source research required' : 'Current report coverage'}</strong><p>Your energy preference: ${esc(summary(brief))}.</p><p>The current four-site report covers landfills only. Selecting another source does not change those examples or establish available power.</p><ul class="note-list"><li>Flare gas and hydro can be included in discovery. Those leads still need owner qualification, usable power confirmation and commercial terms.</li><li>Nuclear requires dedicated research. We do not currently have nuclear generating sites in this search inventory.</li></ul><p class="small muted">Save your brief and review an unsent request to include your preferences. Research scope and delivery are agreed before work begins.</p></div>`;
  }
  window.ProtonEnergyPreferences = Object.freeze({ defaultSources, normalize, render, bind, read, summary, changed, draftLines, coverage });
}());
