/* Public research presentation. No price model, owner acceptance or reuse credit is inferred. */
(function () {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => Array.isArray(value) ? value : [];
  function safeUrl(value) { try { const u = new URL(value); return /^(https?:)$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function packet(profile) { return list(window.ProtonEnergyAccessData?.sites).find(site => site.id === profile.id); }
  function citation(source, fallbackDate) {
    const href = safeUrl(source.url || source.sourceUrl);
    const title = source.title || source.sourceTitle || source.id || 'Public record';
    return `<div class="sd-citation">${href ? `<a class="source-chip" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>` : `<span>${esc(title)}</span>`}<span class="sd-date">Published: ${esc(source.publicationDate || 'date not stated')} · checked: ${esc(source.checkedDate || source.accessedDate || fallbackDate || 'date not recorded')}</span>${source.accessNote ? `<span class="sd-date">${esc(source.accessNote)}</span>` : ''}</div>`;
  }
  function factSources(profile, fact) {
    const sources = list(profile.sources);
    return list(fact.sourceIds).map(id => sources.find(source => source.id === id)).filter(Boolean).map(source => citation(source, window.ProtonScoutingSample?.researchDate)).join('');
  }
  function signalCard(signal) {
    return `<article class="sd-record"><span class="sd-kicker">${signal.state === 'obstacle' ? 'Documented constraint' : signal.state === 'unknown' ? 'Open question' : 'Public record'}</span><h4>${esc(signal.label)}</h4><p>${esc(signal.finding)}</p>${citation(signal, window.ProtonEnergyAccessData?.checkedDate)}${list(signal.additionalSources).map(source => citation(source, signal.checkedDate)).join('')}</article>`;
  }
  const physicalLabels = new Set([
    'Retired units reduce the historical picture',
    'Gas collection expansion is documented as a procurement',
    'Current site-specific energy permit entity',
    'Air permit and historical project contacts',
    'Historical generation and export infrastructure',
    'Planned retirement creates a major hurdle',
    'Electricity system is intended to be replaced',
    'Latest developer listing: under construction'
  ]);
  const arrangementLabels = new Set([
    'A private direct-sale route existed',
    'Existing offtake must be checked',
    'Existing offtake is a diligence item',
    'Current site-specific energy permit entity',
    'Owner and power-access permission remain separate',
    'Planned retirement creates a major hurdle',
    'Gas already has an announced long-term use',
    'Electricity system is intended to be replaced',
    'Latest developer listing: under construction',
    'Previously unavailable source retrieved for this update'
  ]);
  const scopeItems = [
    ['Energy equipment & condition', 'Establish which source, generation and treatment equipment can serve the proposed load; inspect it and price any repair or replacement.', 'Current equipment operator and a qualified equipment contractor'],
    ['Electrical delivery', 'Confirm net MW, delivery voltage, connection point and protection; price transformers, switchgear, cables and metering required by the design.', 'Electrical engineer, connection owner and electrical contractor'],
    ['Usable space & site works', 'Confirm the footprint, legal access, drainage, foundations, security and delivery access; quote only the work the agreed layout requires.', 'Land rights holder, civil engineer and site contractor'],
    ['Mining plant, cooling & communications', 'Select the mining equipment and enclosure; establish cooling, noise and communications requirements before obtaining a package quote.', 'Client, mining/cooling suppliers and connectivity provider'],
    ['Approvals & commissioning', 'Identify applicable approvals, studies, testing, lead times and commissioning tasks for this specific use.', 'Site authority, relevant permitting bodies and project engineer'],
    ['Upfront commercial costs', 'Request deposits, connection charges, lease or access fees and payment timing; budget contingency only after the scope and risks are defined.', 'Energy seller, land rights holder, connection owner and client']
  ];
  function scopeMatrix() {
    return `<div class="sd-scope-list">${scopeItems.map(([title, scope, provider]) => `<article class="sd-scope"><h4>${title}</h4><p>${scope}</p><dl><div><dt>Scope / quote needed from</dt><dd>${provider}</dd></div><div><dt>Price</dt><dd>Not quoted</dd></div><div><dt>Who pays</dt><dd>Unassigned — agree with the counterparty</dd></div></dl></article>`).join('')}</div>`;
  }
  function verification(profile) {
    const fields = list(profile.checklist).filter(field => /^IF-/.test(field.id));
    return fields.length ? `<div class="sd-questions">${fields.map(field => `<article><h4>${esc(field.label)}</h4><p>${esc(field.nextQuestion || 'Obtain current records and confirm condition, rights and suitability for this load.')}</p><span class="sd-date">${field.status === 'partial' ? 'Some public evidence; client use remains unverified.' : 'Not established by the reviewed research.'}</span></article>`).join('')}</div>` : '<p class="muted">An equipment inventory, condition review, usable-space assessment, electrical design and approval review are needed for this site.</p>';
  }
  function renderInfrastructure(profile = {}) {
    const facts = list(profile.facts);
    const signals = list(packet(profile)?.signals).filter(signal => physicalLabels.has(signal.label));
    const capacity = window.ProtonSiteAccess?.capacityNotice ? window.ProtonSiteAccess.capacityNotice(profile) : '';
    return `<section class="sd-workspace">${capacity}<div class="sd-intro"><span class="sd-kicker">Infrastructure research</span><h3>What is documented on site</h3><p>Equipment records explain the physical starting point. Their dates and limits matter: reported equipment is not a promise that you can use it.</p></div><div class="sd-records">${facts.map(fact => `<article class="sd-record"><span class="sd-kicker">${esc(fact.basis || 'Dated public research')}</span><h4>${esc(fact.label)}</h4><p>${esc(fact.value)}</p>${factSources(profile, fact)}</article>`).join('') || '<p class="muted">No equipment records are included in this research packet. Request a current inventory and supporting documents.</p>'}</div>${signals.length ? `<h3>Additional equipment and project records</h3><div class="sd-records">${signals.map(signalCard).join('')}</div>` : ''}<div class="callout"><strong>No reuse value has been credited.</strong><br>Condition, ownership, net capacity and permission to use the equipment must be established before it can reduce a construction budget.</div><h3>What needs a site or engineering check?</h3>${verification(profile)}<h3>Build the remaining capital scope</h3><p class="muted">These are work packages to investigate, not a priced bill of works. An item may be unnecessary after review; an existing asset may still require repair or a new agreement.</p>${scopeMatrix()}<div class="sd-total"><div><span>Remaining site capital</span><strong>Not priced</strong></div><p>${esc(profile.capitalSummary || 'No itemized scope, contractor quotes or allocation of costs has been confirmed.')}</p><p>Mining hardware should be quoted separately from the site capital budget. No savings, free infrastructure or owner-funded construction are assumed.</p></div>${list(profile.concerns).length ? `<h3>Site-specific decision points</h3><ul class="note-list">${list(profile.concerns).map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${profile.nextStep ? `<div class="callout"><strong>Next step</strong><br>${esc(profile.nextStep)}</div>` : ''}</section>`;
  }
  const proposedTerms = [
    ['Authority & willingness', 'Who can authorize this use and sign for the energy and land rights? Will that party consider the proposed mining load?', 'Rights-holder introduction and a dated response'],
    ['Power allocation & reliability', 'What net MW can be committed after plant use and other customers? What availability, outages and curtailment rights apply?', 'Recent operating logs and a proposed supply allocation'],
    ['Delivered price', 'What are the energy price, losses, generation/O&M charges, fixed fees, minimums, escalation and taxes?', 'A dated itemized quote, with units and validity period'],
    ['Term, start date & existing commitments', 'When can supply start, how long is it available, and do existing offtake or fuel agreements restrict it?', 'Current contract constraints and proposed commercial term'],
    ['Land, equipment & connection rights', 'Which space and equipment may the client use, under whose agreement, and at what connection point?', 'Rights documents, an agreed layout and connection scope'],
    ['Construction, payer & exit terms', 'Who funds and owns each work package, what deposits are required, and what happens on delay, termination or relocation?', 'Itemized scope, responsibility matrix and proposed agreement']
  ];
  function renderTerms(profile = {}) {
    const supplemental = packet(profile);
    const signals = list(supplemental?.signals).filter(signal => arrangementLabels.has(signal.label));
    const fallback = list(profile.checklist).filter(field => /^CM-/.test(field.id) && field.status !== 'unknown' && field.value);
    const recorded = signals.length ? signals.map(signalCard).join('') : fallback.map(field => `<article class="sd-record"><h4>${esc(field.label)}</h4><p>${esc(field.value)}</p>${factSources(profile, field)}</article>`).join('');
    return `<section class="sd-workspace sd-terms"><h3>Existing arrangements and constraints</h3><p class="muted">These records describe existing projects, past sales or published plans. They do not set the terms of a new mining agreement.</p><div class="sd-records">${recorded || '<p class="muted">The reviewed research does not establish existing commercial arrangements. Request the current rights-holder and offtake position before discussing a new supply agreement.</p>'}</div><h3>Your proposed mining arrangement</h3><div class="sd-term-status"><div><span>Owner response</span><strong>${supplemental?.ownerContacted === false ? 'No outreach recorded' : 'Not confirmed in this packet'}</strong></div><div><span>Allocated power</span><strong>Not confirmed</strong></div><div><span>Price & contract</span><strong>Not quoted / agreed</strong></div></div><p class="muted">Public contact details identify a route to ask. They do not establish decision-making authority, acceptance or an offer.</p><div class="sd-questions">${proposedTerms.map(([title, question, evidence]) => `<article><h4>${title}</h4><p>${question}</p><span class="sd-date">Request: ${evidence}.</span></article>`).join('')}</div><div class="callout"><strong>Next conversation</strong><br>Ask the first contact above to identify the energy and land rights holders. Establish willingness, available power and existing restrictions before commissioning a priced engineering scope.</div></section>`;
  }
  window.ProtonSiteDiligence = Object.freeze({ renderInfrastructure, renderTerms });
})();
