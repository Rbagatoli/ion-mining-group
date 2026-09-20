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
    ['geothermal', 'Geothermal'],
    ['natural_gas', 'Natural gas generation'],
    ['biomass_biogas', 'Biomass / biogas'],
    ['waste_to_energy', 'Waste-to-energy'],
    ['marine', 'Marine / tidal / wave'],
    ['recovered_energy', 'Recovered energy / waste heat'],
    ['coal', 'Coal generation'],
    ['oil', 'Oil generation'],
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
    return `<section class="form-section" aria-labelledby="energy-source-heading"><h2 id="energy-source-heading">Energy sources</h2><p class="small muted" id="energy-source-help">We specialize in landfill and stranded gas sourcing. Choose every source you would consider for your United States search, or leave the source unrestricted. Other sources are researched around your requirements. Record excluded sources in your requirements. Storage and hybrid systems are supply arrangements; their underlying energy source still needs verification.</p><div class="form-grid" role="group" aria-labelledby="energy-source-heading" aria-describedby="energy-source-help"><label class="check"><input type="checkbox" name="anyEnergySource" value="any"${values.length ? '' : ' checked'}> Any energy source</label>${sources.map(([id, label]) => `<label class="check"><input type="checkbox" name="energySources" value="${esc(id)}"${values.includes(id) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div><p class="small muted" data-energy-research-note role="status" aria-live="polite">${esc(researchNote(brief))}</p></section>`;
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
    return `<div class="callout"><strong>${changed(brief) ? 'New source research required' : 'Current report coverage'}</strong><p>Your energy preference: ${esc(summary(brief))}.</p><p>The current four-site report covers landfills only. Selecting another source does not change those examples or establish available power.</p><ul class="note-list"><li>Our nationwide sourcing service specializes in landfill and stranded gas. Operating hydro and existing powered sites are considered where they fit your brief; nuclear, renewable and other plants remain options for a specific need or documented opportunity. A catalog record does not establish available power.</li><li>Every source requires owner qualification: net power available to your project, all-in delivered cost, operating windows, connection work, capital responsibilities and timing. Plant records, including nuclear records, need dedicated commercial qualification.</li><li>Coverage varies by source and record date. A search does not establish that every United States opportunity is known. Storage and hybrid arrangements need a confirmed charging source and usable delivery schedule.</li></ul><p class="small muted">Save your brief and review an unsent request to include your preferences. Research scope and delivery are agreed before work begins.</p></div>`;
  }
  window.ProtonEnergyPreferences = Object.freeze({ defaultSources, normalize, render, bind, read, summary, changed, draftLines, coverage });
}());
