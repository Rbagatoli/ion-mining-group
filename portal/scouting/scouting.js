/* Client-facing frontend only. Public sample evidence and a separate local draft.
 * No operator storage, authentication, payments, CRM writes or simulated deliveries.
 * Replace the sample adapter only after server-side client authorization is implemented.
 */
(function () {
  'use strict';
  const data = window.ProtonScoutingSample;
  const main = document.getElementById('main');
  if (!data || !data.isSample) { main.innerHTML = '<section class="panel"><h1>Workspace unavailable</h1><p>Please reload, or contact sales@protonminingco.com.</p></section>'; return; }
  const profiles = [...data.profiles, ...data.exclusions.map(e => e.profile)];
  const KEY = 'proton:scouting:preview:v1';
  const defaults = { company: '', role: 'Hosting company', region: 'New Jersey, Pennsylvania, Delaware, Maryland', minMw: '0.5', maxMw: '2', budget: '', rate: '', infrastructure: 'Existing generation preferred', timing: 'Flexible', delivery: 'Not specified', operating: 'Not specified', known: '', notes: '' };
  const deliveryOptions = ['Not specified', 'Delivered electricity only', 'Fuel supply; generation can be added', 'Either fuel or delivered electricity'];
  const operatingOptions = ['Not specified', 'Mostly continuous power required', 'Interruptible operation acceptable', 'Seasonal operation acceptable'];
  const defaultBrief = () => ({ ...defaults, energySources: window.ProtonEnergyPreferences?.normalize(undefined) || ['landfill_gas'] });
  const feedbackOptions = ['', 'Interested', 'Already known', 'Not a fit'];
  const routes = { overview: 'Overview', brief: 'My brief', sites: 'Sites', updates: 'Updates' };
  const tabs = { access: 'Can I use the energy?', visuals: 'Site visuals', infrastructure: 'Infrastructure & capital', contact: 'Contacts & terms', evidence: 'Sources & evidence' };
  let state = { brief: defaultBrief(), feedback: {}, note: '', savedAt: null }, persistent = true;
  let selected = profiles[0].id, activeTab = 'access', compared = [], showCompare = false;
  let query = '', status = 'all', confirmedOnly = false, hideDismissed = false, noticeTimer;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : '#'; } catch (_) { return '#'; } };
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && saved.v === 1) {
        for (const k of Object.keys(defaults)) if (typeof saved.brief?.[k] === 'string') state.brief[k] = saved.brief[k].slice(0, 2000);
        state.brief.energySources = window.ProtonEnergyPreferences?.normalize(saved.brief?.energySources) || ['landfill_gas'];
        if (!deliveryOptions.includes(state.brief.delivery)) state.brief.delivery = defaults.delivery;
        if (!operatingOptions.includes(state.brief.operating)) state.brief.operating = defaults.operating;
        if (!(Number(state.brief.minMw) > 0 && Number(state.brief.maxMw) >= Number(state.brief.minMw))) { state.brief.minMw = defaults.minMw; state.brief.maxMw = defaults.maxMw; }
        if (saved.feedback && typeof saved.feedback === 'object') for (const p of profiles) if (feedbackOptions.includes(saved.feedback[p.id])) state.feedback[p.id] = saved.feedback[p.id];
        state.note = typeof saved.note === 'string' ? saved.note.slice(0, 2000) : '';
        state.savedAt = typeof saved.savedAt === 'string' && Number.isFinite(Date.parse(saved.savedAt)) ? saved.savedAt : null;
      }
    } catch (_) { persistent = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...state })); persistent = true; } catch (_) { persistent = false; }
    document.getElementById('saveState').textContent = persistent ? 'Draft saved in this browser · not sent' : 'Storage unavailable · changes last until this page closes';
  }
  function notify(text) { clearTimeout(noticeTimer); const n = document.getElementById('notice'); n.textContent = text; n.classList.add('visible'); noticeTimer = setTimeout(() => n.classList.remove('visible'), 5000); }
  function tag(p) { return `<span class="tag ${esc(p.status)}">${esc(p.dispositionLabel || p.status)}</span>`; }
  function money(value) { return Number(value) > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : 'Not set'; }
  function heading(eyebrow, title, subtitle, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
  const button = (label, route, primary = false) => `<a class="button ${primary ? 'primary' : 'secondary'}" href="#${route}">${label} <span aria-hidden="true">↗</span></a>`;
  function changed() { return Object.keys(defaults).filter(k => !['company', 'role', 'notes', 'known'].includes(k)).some(k => state.brief[k] !== defaults[k]) || !!window.ProtonEnergyPreferences?.changed(state.brief); }
  function mismatch() { return changed() ? '<div class="callout"><strong>Your brief has changed.</strong> These are the original Mid-Atlantic examples, not matching results for your new requirements. New research is needed before a site can be recommended.</div>' : ''; }
  function siteMinis() { return profiles.slice(0, 3).map((p, i) => `<a class="site-mini" href="#sites" data-open="${p.id}"><span class="site-number">0${i + 1}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.location)}</p></div>${tag(p)}</a>`).join(''); }
  function overview() {
    main.innerHTML = heading('YOUR NEXT CHAPTER', 'Good energy. A better starting point.', 'A place to turn possible sites into an informed next move.', button('Edit my brief', 'brief')) +
      `<div class="metrics"><div class="metric accent"><span class="label">Your target load</span><strong>${esc(state.brief.minMw)}–${esc(state.brief.maxMw)} <em>MW</em></strong><p>Search requirement</p></div><div class="metric"><span class="label">Site capital budget</span><strong>${money(state.brief.budget)}</strong><p>USD · excluding miners</p></div><div class="metric"><span class="label">Sites in sample report</span><strong>4 <em>reviewed</em></strong><p>2 unresolved · 1 hold · 1 excluded</p></div><div class="metric"><span class="label">Confirmed power offers</span><strong>0</strong><p>Owner verification still needed</p></div></div>${mismatch()}
      <div class="overview-grid"><section class="panel"><div class="section-heading"><h2>Your first look</h2><span class="tag neutral">SAMPLE REPORT</span></div><div class="report-hero"><div><span class="small muted">MID-ATLANTIC · SEP 19, 2026</span><h3>Start with what’s already there.</h3><p>Four researched landfill sites. Existing generation history, capital questions and the people to ask next.</p></div><div class="report-art" aria-hidden="true"><svg viewBox="0 0 150 150"><g fill="none" stroke="#777f69"><ellipse cx="75" cy="77" rx="57" ry="21" transform="rotate(-25 75 77)"/><ellipse cx="75" cy="77" rx="57" ry="21" transform="rotate(35 75 77)"/><ellipse cx="75" cy="77" rx="57" ry="21" transform="rotate(95 75 77)"/></g><circle cx="75" cy="77" r="10" fill="#cbd0c2"/><circle cx="122" cy="53" r="6" fill="#ffad47"/></svg></div></div>${siteMinis()}<div class="card-footer"><span class="small muted">Public research. No site secured.</span>${button('Explore sites', 'sites', true)}</div></section>
      <section class="panel"><div class="section-heading"><h2>The path to a decision</h2><span class="small muted">3 steps</span></div><ol class="step-list"><li><i>1</i><div><strong>Define a site that works for you</strong><p>Power, location, budget and the infrastructure you need.</p><a class="text-link" href="#brief">Review your brief →</a></div></li><li class="current"><i>2</i><div><strong>Review the evidence</strong><p>See what was reported, what’s still unknown and what could change the economics.</p></div></li><li><i>3</i><div><strong>Choose what to verify next</strong><p>Flag the sites you like. Ask for owner confirmation and a priced scope before committing.</p></div></li></ol><div class="callout"><strong>Capital comes first.</strong><br>Infrastructure only reduces your budget when its condition, capacity and use rights are confirmed.</div></section></div>
      ${window.ProtonEnergyPreferences?.coverage(state.brief) || ""}<div class="overview-bottom"><section class="panel compact-panel"><p class="eyebrow">BUILT AROUND YOUR BRIEF</p><h3>${esc(state.brief.region)}</h3><p>${esc(state.brief.infrastructure)} · ${esc(state.brief.timing)}</p><p>Energy sources: ${esc(window.ProtonEnergyPreferences?.summary(state.brief) || 'Landfill gas')}</p></section><section class="panel compact-panel"><p class="eyebrow">NEXT ACTION</p><h3>Which sites deserve a closer look?</h3><p>Save your feedback and prepare one clear request for Proton. <a class="text-link" href="#updates">Review updates →</a></p></section></div>`;
  }
  function field(name, label, type = 'text', attrs = '', hint = '') { return `<div class="field"><label for="brief-${name}">${label}</label><input id="brief-${name}" name="${name}" type="${type}" value="${esc(state.brief[name])}" ${attrs}>${hint ? `<p>${hint}</p>` : ''}</div>`; }
  function select(name, label, options) { return `<div class="field"><label for="brief-${name}">${label}</label><select name="${name}" id="brief-${name}">${options.map(v => `<option${state.brief[name] === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`; }
  function brief() {
    main.innerHTML = heading('01 / YOUR REQUIREMENTS', 'What makes a site work for you?', 'Start with the essentials. We’ll use the brief to agree the scope of your search.') +
      `<div class="brief-layout"><form class="panel" id="briefForm"><section class="form-section"><h2>Your operation</h2><div class="form-grid">${field('company', 'Company or project', 'text', 'maxlength="200" placeholder="Your company or project name"')}${select('role', 'I’m looking as a…', ['Hosting company', 'Mining company', 'Independent miner', 'Energy developer'])}<div class="field full"><label for="brief-region">Preferred locations</label><input name="region" id="brief-region" required maxlength="300" value="${esc(state.brief.region)}"><p>States, provinces, countries or a distance from your operation.</p></div></div></section>
      ${window.ProtonEnergyPreferences?.render(state.brief) || ""}<section class="form-section"><h2>Power &amp; capital</h2><div class="form-grid">${field('minMw', 'Minimum load · MW', 'number', 'min="0.001" step="any" max="10000" required')}${field('maxMw', 'Maximum load · MW', 'number', 'min="0.001" step="any" max="10000" required')}${field('budget', 'Site capital budget · USD', 'number', 'min="1" max="10000000000" step="any" placeholder="Optional"', 'Excluding miners. Leave blank if undecided.')}${field('rate', 'Energy-only target · US ¢/kWh', 'number', 'min="0.001" max="1000" step="any" placeholder="Optional"', 'A target, not a rate available from Proton.')}${select('infrastructure', 'Infrastructure preference', ['Existing generation preferred', 'Installation-ready only', 'Open to new construction'])}${select('timing', 'Target start', ['Flexible', 'Within 3 months', '3–6 months', '6–12 months', 'More than 12 months'])}${select('delivery', 'What should the site supply?', deliveryOptions)}${select('operating', 'Operating flexibility', operatingOptions)}</div></section>
      <section class="form-section"><h2>Avoid the wrong fit</h2><div class="form-grid"><div class="field full"><label for="brief-known">Sites you already know</label><textarea id="brief-known" name="known" maxlength="2000" placeholder="Names or locations we shouldn’t repeat">${esc(state.brief.known)}</textarea></div><div class="field full"><label for="brief-notes">Anything else that matters?</label><textarea id="brief-notes" name="notes" maxlength="2000" placeholder="Cooling, equipment, expansion plans or deal requirements">${esc(state.brief.notes)}</textarea></div></div></section><div class="form-foot"><div class="actions"><button class="button secondary" type="submit" value="save">Save draft</button><button class="button primary" type="submit" value="request">Review request <span aria-hidden="true">↗</span></button></div><p>Saved only in this browser. Reviewing a request prepares an email; it does not start a paid search.</p></div></form>
      <aside class="panel"><p class="eyebrow">WHAT YOU RECEIVE</p><h2>A shortlist with the right questions answered.</h2><ul class="scope-list"><li>Site location and public contact routes</li><li>Reported infrastructure and evidence dates</li><li>Available power and rate, when confirmed</li><li>Remaining work, responsibility and capital gaps</li><li>Reasons to pursue, pause or rule out a site</li></ul><div class="callout"><strong>Before work begins</strong><br>We agree your geography, research scope, delivery timing and fee. No payment is collected in this preview.</div><p class="small muted">The sample report covers four sites for a 0.5–2 MW Mid-Atlantic brief. Changing your brief requires new research.</p></aside></div>`;
    document.getElementById('briefForm').addEventListener('submit', e => {
      e.preventDefault(); const form = e.currentTarget; const input = form.elements.maxMw;
      input.setCustomValidity(Number(form.elements.maxMw.value) < Number(form.elements.minMw.value) ? 'Maximum MW must be at least the minimum MW.' : '');
      if (!form.reportValidity()) return;
      for (const k of Object.keys(defaults)) state.brief[k] = form.elements[k].value.trim();
      if (window.ProtonEnergyPreferences) state.brief.energySources = window.ProtonEnergyPreferences.read(form);
      state.savedAt = new Date().toISOString(); save();
      if (e.submitter?.value === 'request') openDraft('brief'); else notify(persistent ? 'Brief saved on this device. Nothing has been sent.' : 'Brief kept for this page only. Browser storage is unavailable.');
    });
    window.ProtonEnergyPreferences?.bind(document.getElementById('briefForm'));
    for (const name of ['minMw', 'maxMw']) document.getElementById('brief-' + name).addEventListener('input', () => document.getElementById('brief-maxMw').setCustomValidity(''));
  }
  function filtered() {
    return profiles.filter(p => (!query || `${p.name} ${p.location} ${p.operator}`.toLowerCase().includes(query.toLowerCase())) && (status === 'all' || p.status === status) && (!confirmedOnly || (p.availableMw != null && p.quotedEnergyPrice != null)) && (!hideDismissed || !['Already known', 'Not a fit'].includes(state.feedback[p.id])));
  }
  function sites() {
    main.innerHTML = heading('02 / SITE REVIEW', 'The possibilities. And the gaps.', 'Compare the infrastructure before you commit the capital.', `<button class="button secondary" data-action="draft-feedback">Review feedback <span aria-hidden="true">↗</span></button>`) + mismatch() +
      `<div class="search"><label><span class="sr-only">Search site, operator or location</span><input id="siteSearch" type="search" value="${esc(query)}" placeholder="Search site, operator or location"></label><label><span class="sr-only">Research status</span><select id="siteStatus"><option value="all">All research statuses</option><option value="unresolved">Needs verification</option><option value="hold">On hold</option><option value="excluded">Excluded</option></select></label><label class="check"><input type="checkbox" id="confirmedOnly"${confirmedOnly ? ' checked' : ''}>Confirmed power &amp; price only</label></div><div id="comparison"></div><div class="result-bar"><span id="resultCount" role="status"></span><label class="compare-check"><input type="checkbox" id="hideDismissed"${hideDismissed ? ' checked' : ''}>Hide known / not a fit</label><button id="compareButton" class="button small secondary" disabled>Compare (0)</button></div><div class="site-workspace"><div><div id="locator"></div><div id="siteList" class="site-list" aria-label="Researched sites"></div></div><section id="siteDetail" class="panel site-detail" aria-label="Selected site details" tabindex="-1"></section></div>`;
    document.getElementById('siteStatus').value = status;
    document.getElementById('siteSearch').addEventListener('input', e => { query = e.target.value; renderResults(); });
    document.getElementById('siteStatus').addEventListener('change', e => { status = e.target.value; renderResults(); });
    document.getElementById('confirmedOnly').addEventListener('change', e => { confirmedOnly = e.target.checked; renderResults(); });
    document.getElementById('hideDismissed').addEventListener('change', e => { hideDismissed = e.target.checked; renderResults(); });
    document.getElementById('compareButton').addEventListener('click', () => { showCompare = !showCompare; renderComparison(); if (showCompare) document.getElementById('comparison').scrollIntoView({ block: 'start', behavior: 'auto' }); });
    renderResults();
  }
  function locator(list) {
    // Coordinates only: intentionally not a parcel boundary, engineering plan or aerial.
    const x = lng => 40 + (lng + 77.4) / 3.0 * 245;
    const y = lat => 20 + (42.1 - lat) / 3.4 * 145;
    let grid = ''; for (let i = 0; i < 5; i++) { grid += `<path d="M${40 + i * 61} 15V172 M35 ${20 + i * 36}H292" stroke="#83916f" stroke-opacity=".17" stroke-width=".7"/>`; }
    const points = list.filter(p => p.id !== 'SIM-734' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && (!window.ProtonSiteVisuals || window.ProtonSiteVisuals.canPlot(p))).map(p => `<a href="#sites" data-open="${p.id}" aria-label="Open ${esc(p.name)}"><title>${esc(p.name)} · ${esc(p.location)}</title><circle class="${p.id === selected ? 'point-active' : 'point'}" cx="${x(p.lng).toFixed(1)}" cy="${y(p.lat).toFixed(1)}" r="${p.id === selected ? 7 : 4}"/><text x="${(x(p.lng) + 10).toFixed(1)}" y="${(y(p.lat) - 8).toFixed(1)}">${esc(p.name.split(' ')[0])}</text></a>`).join('');
    return `<div class="map-panel"><div class="map-foot"><strong>Site locator</strong><span>N ↑</span></div><svg viewBox="0 0 330 190" aria-label="Approximate catalog coordinates, with rejected locations omitted">${grid}<text x="3" y="23">42°N</text><text x="3" y="166">39°N</text><text x="35" y="185">77°W</text><text x="270" y="185">74°W</text>${points}</svg><p>Approximate catalog coordinates · not a property survey${list.some(p => p.id === 'SIM-734') ? '<br>Alpha Ridge omitted: catalog location rejected during image review.' : ''}</p></div>`;
  }
  function renderResults() {
    const list = filtered();
    if (!list.some(p => p.id === selected)) selected = list[0]?.id || null;
    document.getElementById('resultCount').textContent = `${list.length} of 4 researched examples · 0 confirmed offers`;
    document.getElementById('locator').innerHTML = list.length ? locator(list) : '';
    document.getElementById('siteList').innerHTML = list.length ? list.map(p => `<article class="site-card ${selected === p.id ? 'selected' : ''}"><button class="site-open" data-open="${p.id}" aria-expanded="${selected === p.id}" aria-controls="siteDetail">${tag(p)}<h3>${esc(p.name)}</h3><p>${esc(p.location)}</p><div class="infra-short">${esc(p.infrastructureSummary)}</div></button><div class="bottom-row"><label class="compare-check"><input type="checkbox" data-compare="${p.id}"${compared.includes(p.id) ? ' checked' : ''}>Compare</label><span>${esc(state.feedback[p.id] || 'Not reviewed by you')}</span></div></article>`).join('') : '<div class="empty"><h3>No sites meet these filters.</h3><p>The sample has no owner-confirmed power offers or prices.</p><button class="text-button" data-action="clear-filters">Clear filters</button></div>';
    renderDetail(); renderComparison();
  }
  function sourceLinks(p, ids) { return (ids || []).map(id => { const s = p.sources.find(s => s.id === id); return s ? `<a class="source-chip" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}${s.accessStatus ? ' · source unavailable during review' : ''}">${esc(id)} ↗</a>` : ''; }).join(''); }
  function evidenceRows(p, fields) { return fields.map(f => `<div class="evidence-row"><strong>${esc(f.label)}</strong><p>${esc(f.value)}</p>${sourceLinks(p, f.sourceIds)}${f.nextQuestion ? `<p><small>To confirm: ${esc(f.nextQuestion)}</small></p>` : ''}</div>`).join(''); }
  function renderDetail() {
    const root = document.getElementById('siteDetail'), p = profiles.find(p => p.id === selected);
    if (!p) { root.innerHTML = '<div class="empty"><h2>No site selected</h2><p>Adjust the filters to return to the sample research.</p></div>'; return; }
    const maps = window.ProtonSiteVisuals?.mapUrl(p) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.id === 'SIM-734' ? '2350 Marriottsville Road, Marriottsville, MD 21104' : Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p.lat + ',' + p.lng : p.name + ', ' + p.location)}`;
    root.innerHTML = `<div class="detail-heading"><div>${tag(p)}<h2>${esc(p.name)}</h2><p>${esc(p.location)} · Research checked Sep 19, 2026</p></div><a class="icon-button" style="display:grid;place-items:center" href="${esc(maps)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(p.name)} in Google Maps">↗</a></div><div class="detail-stats"><div><label>Available to you</label><strong>Unconfirmed</strong><small>Owner allocation needed</small></div><div><label>Delivered energy</label><strong>Not quoted</strong><small>All-in rate needed</small></div><div><label>Remaining capital</label><strong>Not priced</strong><small>Itemized scope needed</small></div></div>${window.ProtonSiteAccess?.badge(p, state.brief) || ''}<div class="tabbar" aria-label="Site information">${Object.entries(tabs).map(([id, label]) => `<button data-tab="${id}" aria-pressed="${activeTab === id}">${label}</button>`).join('')}</div><div class="detail-body" id="detailBody"></div><div class="detail-actions"><label for="siteFeedback">Your view</label><select id="siteFeedback" data-feedback="${p.id}">${feedbackOptions.map(v => `<option value="${v}"${state.feedback[p.id] === v ? ' selected' : ''}>${v || 'Not reviewed'}</option>`).join('')}</select><button class="button primary small" data-action="ask-site" data-site="${p.id}">Prepare questions ↗</button></div><p class="small muted" style="margin:10px 0 0">Feedback is saved on this device. It is not sent to Proton.</p>`;
    const body = document.getElementById('detailBody');
    if (activeTab === 'access' && window.ProtonSiteAccess) {
      body.innerHTML = window.ProtonSiteAccess.render(p, state.brief);
    } else if (activeTab === 'visuals') {
      body.innerHTML = window.ProtonSiteVisuals ? window.ProtonSiteVisuals.render(p) : '<div class="callout"><strong>Visual supplement unavailable.</strong><br>The site research remains available in the other tabs. Reload to try the visual supplement again.</div>';
      window.ProtonSiteVisuals?.bind(body, p);
    } else if (activeTab === 'infrastructure' && window.ProtonSiteDiligence) {
      body.innerHTML = window.ProtonSiteDiligence.renderInfrastructure(p);
    } else if (activeTab === 'infrastructure') {
      const infrastructure = p.facts.filter(f => /infrastructure|finding|rating/i.test(f.label));
      const infrastructurePreview = evidenceRows(p, infrastructure.filter(f => !/finding/i.test(f.label))) + `<details><summary>Project history &amp; equipment records</summary>${evidenceRows(p, infrastructure.filter(f => /finding/i.test(f.label)))}</details>`;
      body.innerHTML = `${window.ProtonSiteAccess?.capacityNotice(p) || ''}<p class="intro">${esc(p.recommendation)}</p><h3>What the records show</h3>${infrastructurePreview}<div class="callout"><strong>Reported does not mean reusable.</strong><br>Historical infrastructure needs a current condition check, use rights and capacity verification before any cost credit.</div><h3>What would you still need to fund?</h3><dl class="capital-rows"><dt>New-build benchmark</dt><dd>Not modeled</dd><dt>Verified reusable infrastructure credit</dt><dd>Not established</dd><dt>Repairs, electrical connection &amp; site work</dt><dd>Needs scope</dd><dt>Mining equipment &amp; cooling</dt><dd>Needs selection</dd><dt>Deposits, approvals &amp; contingency</dt><dd>Not quoted</dd><dt class="total">Remaining site capital</dt><dd class="total">Not priced</dd></dl><p class="small muted">${esc(p.capitalSummary)} No dollar savings are assumed.</p><h3>What could change the decision</h3><ul class="note-list">${p.concerns.map(c => `<li>${esc(c)}</li>`).join('')}</ul><div class="callout"><strong>Next step</strong><br>${esc(p.nextStep)}</div>`;
    } else if (activeTab === 'contact') {
      const c = p.contact;
      body.innerHTML = (window.ProtonSiteAccess ? window.ProtonSiteAccess.renderContacts(p) : `<h3>Start with the public contact route</h3><div class="evidence-row"><strong>${esc(c.name)}</strong><p>${esc(c.role)}</p><div class="actions">${c.phone ? `<a class="text-link" href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a>` : '<span class="muted">No public phone recorded</span>'}${c.email ? `<a class="text-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="small muted">No verified email recorded</span>'}<a class="source-chip" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">Official contact source ↗</a></div><p>${esc(c.note)}</p></div>`) + (window.ProtonSiteDiligence ? window.ProtonSiteDiligence.renderTerms(p) : `<p class="small muted">An office contact is not a confirmed decision maker or an agreement to host mining.</p><h3>Commercial terms to confirm</h3>${evidenceRows(p, p.checklist.filter(f => ['CT-02', 'CT-03', 'CM-01', 'CM-02', 'CM-03', 'CM-04'].includes(f.id)))}<details><summary>Questions for the next conversation · ${p.nextQuestions.length}</summary><ol class="question-list">${p.nextQuestions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></details>`);
    } else {
      body.innerHTML = `<p class="intro">Original sources, dated facts and open questions.</p><p class="small muted">Reviewed Sep 19, 2026. Source publication and measurement dates may be much older. This is a fixed research packet, not live monitoring.</p>${p.sources.map(s => `<article class="source-card"><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.id)} · ${esc(s.title)} ↗</a><p>Published: ${esc(s.publicationDate || 'Date not established')} · Reviewed: ${esc(s.accessedDate || data.researchDate)}</p><p>${esc(s.basis)}</p><p>${esc(s.scope)}</p>${s.locator ? `<p>${esc(s.locator)}</p>` : ''}${s.accessNote ? `<div class="callout">${esc(s.accessNote)}</div>` : ''}</article>`).join('')}<details><summary>Full evidence checklist · ${p.checklist.length} fields</summary>${p.checklist.map(f => `<div class="evidence-row"><span class="tag neutral">${esc(f.status)}</span><strong>${esc(f.label)}</strong><p>${esc(f.value)}</p>${sourceLinks(p, f.sourceIds)}<p><small>Next question: ${esc(f.nextQuestion || 'Review source and confirm current status.')}</small></p></div>`).join('')}</details><details><summary>How this report was researched</summary><p>229 catalog rows represented 125 landfill IDs. Four physical sites received deeper source review. The other regional sites were not fully investigated.</p><p>${esc(data.searchSummary.method)}</p><ul class="note-list">${data.searchSummary.limitations.map(v => `<li>${esc(v)}</li>`).join('')}</ul></details>`;
    }
  }
  function renderComparison() {
    const btn = document.getElementById('compareButton'); if (!btn) return;
    btn.disabled = compared.length < 2; btn.textContent = `${showCompare && compared.length >= 2 ? 'Hide comparison' : 'Compare'} (${compared.length})`;
    const box = document.getElementById('comparison');
    if (!showCompare || compared.length < 2) { box.innerHTML = ''; return; }
    const ps = compared.map(id => profiles.find(p => p.id === id));
    const rows = [['Research status', p => p.dispositionLabel], ['Location', p => p.location], ['Access outlook', p => window.ProtonSiteAccess?.outlook(p, state.brief).label || 'Not assessed'], ['Public contact routes', p => window.ProtonSiteAccess?.contacts(p).length || 0], ['Infrastructure reported', p => p.infrastructureSummary], ['Power available to you', () => 'Unconfirmed'], ['Delivered energy price', () => 'Not quoted'], ['Remaining site capital', () => 'Not priced'], ['Verified reuse credit', () => 'Not established'], ['Next step', p => p.nextStep], ['Your view', p => state.feedback[p.id] || 'Not reviewed']];
    box.innerHTML = `<section class="panel compare-panel"><div class="section-heading"><h2>Compare the evidence</h2><button class="text-button" data-action="close-compare">Close comparison</button></div><div class="table-scroll" tabindex="0" aria-label="Site comparison; scroll horizontally on small screens"><table><caption class="sr-only">Research examples, not confirmed power offers</caption><thead><tr><th scope="col">Decision factor</th>${ps.map(p => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${ps.map(p => `<td>${esc(fn(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }
  function updates() {
    const feedback = profiles.filter(p => state.feedback[p.id]);
    main.innerHTML = heading('03 / WHAT HAPPENS NEXT', 'Keep the search moving.', 'See what changed, record your feedback and decide what to ask for next.') +
      `<div class="updates-grid"><section class="panel"><div class="section-heading"><h2>Report history</h2><span class="tag neutral">EXAMPLE</span></div><div class="timeline-item"><span class="date">SEP 19, 2026 · BASELINE RESEARCH</span><h3>Mid-Atlantic infrastructure review</h3><p>Four sites reviewed: two unresolved, one on hold and one excluded. No available MW, delivered rate or remaining capital quote confirmed.</p>${button('Open sample report', 'sites', true)}</div><div class="timeline-item"><span class="date">NEXT REVIEW · NOT SCHEDULED</span><h3>Your feedback shapes the next search.</h3><p>Agree the scope with Proton before another review. A future report may contain no new qualifying sites; it should still explain what was checked and what changed.</p><button class="text-button" data-action="draft-feedback">Prepare a follow-up request →</button></div><div class="callout">No subscription, payment or recurring research is active in this preview. Fees and cadence are agreed with your search scope.</div></section>
      <section class="panel"><div class="section-heading"><h2>Your feedback draft</h2><span class="tag neutral">NOT SENT</span></div>${feedback.length ? `<ul class="feedback-list">${feedback.map(p => `<li>${esc(p.name)}<small>${esc(state.feedback[p.id])}</small></li>`).join('')}</ul>` : '<p class="small muted">Mark a site as interested, already known or not a fit. Your choices will appear here.</p>'}<div class="field" style="margin-top:20px"><label for="feedbackNote">What should we focus on next?</label><textarea id="feedbackNote" maxlength="2000" placeholder="For example: prioritize usable electrical connections and a smaller initial load.">${esc(state.note)}</textarea><p>Notes and site feedback stay in this browser until you send them.</p></div><div class="actions" style="margin-top:18px"><button class="button secondary" data-action="save-note">Save note</button><button class="button primary" data-action="draft-feedback">Review request ↗</button></div></section></div>`;
  }
  function briefText() {
    const b = state.brief;
    return ['Energy site search brief', `Company/project: ${b.company || 'Not supplied'}`, `Client type: ${b.role}`, `Location: ${b.region}`, `Load: ${b.minMw}–${b.maxMw} MW`, `Site capital budget (USD, excluding miners): ${money(b.budget)}`, `Energy-only target (US cents/kWh): ${b.rate || 'Not set'}`, `Infrastructure preference: ${b.infrastructure}`, ...(window.ProtonEnergyPreferences?.draftLines(b) || []), `Supply arrangement: ${b.delivery}`, `Operating flexibility: ${b.operating}`, `Timing: ${b.timing}`, `Already-known sites: ${b.known || 'None supplied'}`, `Other requirements: ${b.notes || 'None supplied'}`].join('\n');
  }
  function requestText(kind, p) {
    let text = `Hello Proton,\n\n${briefText()}\n\n`;
    if (kind === 'site' && p) text += `Please clarify ${p.name} (${p.location}).\nThese questions refer to the public sample dated ${data.researchDate}; this is not a confirmed available site.\n\n${p.nextQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
    else if (kind === 'feedback') text += `Feedback on the ${data.researchDate} public sample:\n${profiles.filter(p => state.feedback[p.id]).map(p => `${p.name}: ${state.feedback[p.id]}`).join('\n') || 'No sites marked yet.'}\n\nFocus for next review: ${state.note || 'Please discuss with me.'}\n\n`;
    text += 'Please confirm the research scope, delivery timing and fee before beginning work. I understand the examples do not establish available power, an energy quote or reusable infrastructure.\n';
    return text;
  }
  function updateMail() { const body = document.getElementById('draftText').value; document.getElementById('emailDraft').href = `mailto:sales@protonminingco.com?subject=${encodeURIComponent('Energy site search — scope and follow-up')}&body=${encodeURIComponent(body)}`; }
  function openDraft(kind, p) {
    const note = document.getElementById('feedbackNote'); if (note) { state.note = note.value.trim(); save(); }
    document.getElementById('draftText').value = requestText(kind, p); updateMail(); document.getElementById('draftDialog').showModal();
  }
  function render() {
    const route = Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    document.querySelectorAll('[data-route]').forEach(a => { if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.getElementById('pageLabel').textContent = routes[route];
    ({ overview, brief, sites, updates })[route]();
    document.title = `${routes[route]} · Proton energy sites`;
  }
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      selected = opener.dataset.open;
      if (location.hash === '#sites') {
        e.preventDefault(); renderResults();
        if (innerWidth <= 700) { document.getElementById('siteDetail').focus({ preventScroll: true }); document.getElementById('siteDetail').scrollIntoView({ block: 'start', behavior: 'auto' }); }
        else document.querySelector(`button[data-open="${selected}"]`)?.focus({ preventScroll: true });
      } else { query = ''; status = 'all'; confirmedOnly = false; hideDismissed = false; }
      return;
    }
    const tab = e.target.closest('[data-tab]'); if (tab) { activeTab = tab.dataset.tab; renderDetail(); document.querySelector(`.tabbar [data-tab="${activeTab}"]`).focus({ preventScroll: true }); return; }
    const action = e.target.closest('[data-action]'); if (!action) return;
    if (action.dataset.action === 'clear-filters') { query = ''; status = 'all'; confirmedOnly = false; hideDismissed = false; sites(); }
    if (action.dataset.action === 'close-compare') { showCompare = false; renderComparison(); document.getElementById('compareButton').focus({ preventScroll: true }); }
    if (action.dataset.action === 'draft-feedback') openDraft('feedback');
    if (action.dataset.action === 'ask-site') openDraft('site', profiles.find(p => p.id === action.dataset.site));
    if (action.dataset.action === 'save-note') { state.note = document.getElementById('feedbackNote').value.trim(); save(); notify(persistent ? 'Feedback note saved on this device. Not sent.' : 'Note kept for this page only. Storage is unavailable.'); }
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.compare) {
      const id = e.target.dataset.compare;
      if (e.target.checked && compared.length >= 3) { e.target.checked = false; notify('Compare up to three sites at a time.'); return; }
      compared = e.target.checked ? [...new Set([...compared, id])] : compared.filter(v => v !== id); renderComparison();
    }
    if (e.target.dataset.feedback) { state.feedback[e.target.dataset.feedback] = e.target.value; save(); renderResults(); document.getElementById('siteFeedback')?.focus({ preventScroll: true }); notify('Site feedback saved locally. Use Review feedback to prepare your request.'); }
  });
  document.getElementById('draftText').addEventListener('input', updateMail);
  document.getElementById('copyDraft').addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.getElementById('draftText').value); notify('Draft copied. Nothing has been sent.'); } catch (_) { document.getElementById('draftText').focus(); document.getElementById('draftText').select(); notify('Select and copy the draft text.'); } });
  document.getElementById('emailDraft').addEventListener('click', () => notify('Draft opened for review in your email app. No request recorded here.'));
  document.getElementById('resetPreview').addEventListener('click', () => {
    if (!window.confirm('Clear only this energy-search preview’s saved brief and feedback?')) return;
    try { localStorage.removeItem(KEY); } catch (_) { /* Other applications remain untouched. */ }
    state = { brief: defaultBrief(), feedback: {}, note: '', savedAt: null }; compared = []; showCompare = false; query = ''; status = 'all'; confirmedOnly = false; hideDismissed = false; selected = profiles[0].id; activeTab = 'access';
    window.ProtonSiteVisuals?.reset();
    document.getElementById('saveState').textContent = 'Drafts stay in this browser'; render(); notify('Preview reset. Other Proton data was not changed.');
  });
  window.addEventListener('hashchange', () => { render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); });
  document.querySelector('.pixel-field').innerHTML = Array.from({ length: 23 }, (_, i) => `<i style="left:${(i * 43) % 100}%;animation-delay:-${i * 1.7}s;animation-duration:${20 + i % 8 * 3}s;--rest:${i * 17 % 100}%"></i>`).join('');
  window.ProtonSiteAccess?.bind(main, profiles, () => state.brief);
  load(); if (!persistent) document.getElementById('saveState').textContent = 'Storage unavailable · changes last until this page closes'; else if (state.savedAt || Object.keys(state.feedback).length) document.getElementById('saveState').textContent = 'Draft saved in this browser · not sent';
  render();
})();
