/* A public product preview built from the same research and locator as the
 * client workspace. No invented listings, account state or automatic outreach. */
(function () {
  'use strict';
  const root = document.getElementById('energyWorkspacePreview');
  const sample = window.ProtonScoutingSample, access = window.ProtonEnergyAccessData, locator = window.ProtonSiteLocator;
  if (!root || !sample?.profiles?.length || !access || !locator) return;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const profiles = sample.profiles, sources = window.ProtonEnergySourceGuide?.sources || [];
  let mode = sources.length ? 'sources' : 'research', sourceId = sources.find(s => s.id === 'landfill_gas')?.id || sources[0]?.id;
  let selected = profiles[0].id, activeTab = 'energy';
  const tabs = [['energy', 'Energy access'], ['capital', 'Infrastructure & capital'], ['contacts', 'Contacts']];
  root.innerHTML = `<div class="ep-toolbar"><div><span class="ep-logo" aria-hidden="true">P</span><strong>Proton <span>Energy Sites</span></strong></div><span class="ep-preview-label">Interactive preview</span></div><div class="ep-modes" aria-label="Preview views"><button type="button" data-preview-mode="sources" aria-pressed="true">Explore energy sources</button><button type="button" data-preview-mode="research" aria-pressed="false">Researched landfill examples</button></div><div class="ep-brief"><span>EXAMPLE SEARCH</span><strong>0.5–2 MW · Mid-Atlantic US</strong><span>Existing generation preferred</span></div><div class="ep-body"><div class="ep-discover"><div class="ep-source-explorer"></div><div class="ep-research"><div id="locator"></div><div class="ep-site-list" aria-label="Sample sites">${profiles.map((p, i) => `<button type="button" data-preview-site="${esc(p.id)}" aria-pressed="false"><span class="ep-number">${i + 1}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.location)}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div></div></div><section class="ep-detail" id="siteDetail" tabindex="-1" aria-label="Selected sample site"><div class="ep-detail-heading"></div><div class="ep-tabs" role="tablist" aria-label="Site research">${tabs.map(([id, title], i) => `<button type="button" id="ep-tab-${id}" role="tab" aria-controls="ep-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-preview-tab="${id}">${title}</button>`).join('')}</div><div class="ep-panel" id="ep-panel" role="tabpanel" tabindex="0" aria-labelledby="ep-tab-energy"></div><a class="ep-workspace-link" href="../portal/scouting/#sites">Explore the full client workspace <span aria-hidden="true">↗</span></a></section></div><div class="ep-footer"><span class="ep-status-dot" aria-hidden="true"></span>Public research · ${esc(sample.researchDate)} · No confirmed power offers</div>`;
  function sourceLink(url, label) { return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`; }
  function phoneHref(value) {
    const parts = String(value).split(/\s+ext\.?\s*/i);
    return 'tel:' + parts[0].replace(/[^+0-9]/g, '') + (parts[1] ? ';ext=' + parts[1].replace(/\D/g, '') : '');
  }
  function panel(p, a) {
    if (activeTab === 'capital') return `<div class="ep-panel-intro"><span class="ep-kicker">Spend where it is needed</span><h4>What is built. What remains.</h4></div><div class="ep-evidence"><span class="ep-badge">Reported infrastructure</span><p>${esc(p.infrastructureSummary)}</p></div><div class="ep-capital"><div><small>Remaining build cost</small><strong>Not yet priced</strong></div><div><small>Verified reuse savings</small><strong>Not established</strong></div></div><p class="ep-copy">${esc(p.capitalSummary)}</p><div class="ep-next"><strong>Before counting a saving</strong><p>Confirm equipment ownership, condition, spare capacity and permission to use it. Then price the connection, upgrades and missing works.</p></div>${sourceLink('../portal/scouting/#sites', 'Open the full sample report')}`;
    if (activeTab === 'contacts') return `<div class="ep-panel-intro"><span class="ep-kicker">The next conversation</span><h4>People. Roles. Contact routes.</h4><p>Published business details; owner interest has not been confirmed.</p></div><div class="ep-contacts">${(a?.contacts || []).slice(0,2).map(c => `<article><strong>${esc(c.name)}</strong><span>${esc(c.role)} · ${esc(c.organization)}</span><div>${c.phone ? `<a href="${esc(phoneHref(c.phone))}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</div><small>${esc(c.verification)}</small>${sourceLink(c.sourceUrl, 'Published source')}</article>`).join('')}</div><p class="ep-copy">The full workspace includes further contact routes, questions to ask and evidence behind each lead.</p>`;
    const cap = a?.capacityUpdate;
    return `<div class="ep-panel-intro"><span class="ep-kicker">Can you actually use the power?</span><h4>Start with the evidence.</h4></div><div class="ep-energy-metrics"><div><small>Reported operating nameplate</small><strong>${cap ? `${esc(cap.nameplateMw)} <em>MW</em>` : 'Unconfirmed'}</strong><span>${cap ? `EIA ${esc(cap.reportYear)} annual inventory` : 'Current generation needs review'}</span></div><div><small>Power offered to you</small><strong>Unconfirmed</strong><span>No owner allocation or price</span></div></div><p class="ep-copy">${cap ? 'A generator rating is not spare power. Contracts, site loads and owner willingness still determine whether any of it can serve your mine.' : esc(p.capitalSummary)}</p><div class="ep-next"><strong>Next step: owner qualification</strong><p>${esc(p.status === 'unresolved' ? 'Confirm who controls the energy, whether a new buyer is welcome, and the net MW and terms they could offer.' : p.nextStep)}</p></div>${cap ? sourceLink(cap.sourceUrl, 'EIA source · reported capacity') : sourceLink('../portal/scouting/#sites', 'Open the full sample report')}`;
  }
  root.querySelector('[data-preview-mode="sources"]').disabled = !sources.length;
  const contactPaths = {
    hydro: ['Plant owner / commercial power team', 'Supply rights, seasonal allocations and existing buyers', 'Grid or interconnection team', 'Delivery point, available connection capacity and required works'],
    nuclear: ['Generator commercial team / authorized supplier', 'Who can offer an allocation and how electricity would be delivered', 'Utility / site development team', 'Connection route, location permissions and outage coverage'],
    geothermal: ['Plant owner / commercial team', 'Net electricity after plant loads and existing sales', 'Plant engineer / interconnection team', 'Resource performance, delivery point and connection works'],
    wind: ['Project owner / offtake team', 'Uncommitted output, curtailment and hourly supply profile', 'Grid / electrical engineering team', 'Connection rights, metering and any firming supply'],
    solar: ['Project owner / offtake team', 'Daytime output, existing contracts and any export constraints', 'Grid / electrical engineering team', 'Connection rights and cost of backup or storage if needed'],
    marine: ['Project developer / commercial team', 'Operational status, output pattern and supply rights', 'Connection / project engineering team', 'Delivery infrastructure, access and maintenance constraints'],
    natural_gas: ['Generator owner / commercial team', 'Fuel-linked pricing, net available MW and existing contracts', 'Plant / electrical engineering team', 'Connection work, uptime and any plant upgrades'],
    coal: ['Generator owner / commercial team', 'Operating plan, supply terms and existing power sales', 'Plant / electrical engineering team', 'Connection scope, permitted operation and outage plans'],
    oil: ['Generator owner / commercial team', 'Fuel cost, operating hours and net power they can offer', 'Plant / electrical engineering team', 'Equipment condition, connection work and supply constraints'],
    landfill_gas: ['Landfill owner / gas-rights holder', 'Gas ownership, existing offtake and interest in a new buyer', 'Energy-project operator / site engineer', 'Collection, treatment, generation and reuse permissions'],
    flare_gas: ['Producer / gas-rights holder', 'Resource control, volume, fuel quality and expected supply life', 'Field operations / generation team', 'Gathering, treatment, power conversion and site access'],
    biomass_biogas: ['Resource owner / energy-project operator', 'Fuel availability, competing uses and supply rights', 'Conversion / electrical engineering team', 'Treatment, generation and usable electrical output'],
    waste_to_energy: ['Facility owner / energy sales team', 'Existing energy commitments and net output available', 'Plant / electrical engineering team', 'Operating windows, connection work and equipment access'],
    recovered_energy: ['Industrial owner / energy manager', 'Recoverable energy profile and competing process uses', 'Process / conversion engineer', 'Conversion equipment, net output and missing works'],
    industrial_surplus: ['Site owner / energy manager', 'Spare capacity, operating windows and authority to supply', 'Utility / electrical engineer', 'Tariff restrictions, resale rights and connection scope'],
    grid_supply: ['Utility economic development / large-load team', 'Service capacity, tariff options and energization timeline', 'Interconnection / distribution engineering team', 'Studies, upgrades, deposits and who funds each item']
  };
  const quickSources = ['landfill_gas','flare_gas','hydro','grid_supply','wind','solar','natural_gas','nuclear'];
  const sourceRoot = root.querySelector('.ep-source-explorer');
  sourceRoot.innerHTML = '<label class="ep-source-select" for="ep-source">Choose an energy source<select id="ep-source">' + sources.map(s => '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>').join('') + '</select></label><div class="ep-source-grid" aria-label="Energy source options">' + quickSources.map(id => { const s = sources.find(s => s.id === id); return s ? '<button type="button" data-preview-source="' + id + '" aria-pressed="false">' + esc(s.label) + '</button>' : ''; }).join('') + '</div><div class="ep-source-route"></div><p class="ep-source-note">Landfill and stranded gas are our specialty. Other routes receive focused research when your brief or a site-specific opportunity calls for it.</p>';
  function sourcePanel(s) {
    if (activeTab === 'capital') return '<div class="ep-panel-intro"><span class="ep-kicker">Protect the upfront budget</span><h4>Start with reusable infrastructure.</h4></div><div class="ep-evidence"><span class="ep-badge">What to investigate</span><p>' + esc(s.assets) + '</p></div><div class="ep-capital"><div><small>Existing assets</small><strong>Verify before crediting</strong></div><div><small>Remaining capital</small><strong>Scope site by site</strong></div></div><div class="ep-next"><strong>What goes into the remaining budget</strong><p>Connection and metering, equipment upgrades, cooling and mining fitout, site works, and any missing generation or storage. Separate your share from owner-funded work.</p></div><p class="ep-copy">The site comparison identifies evidence, estimates and unpriced items. Savings depend on usable capacity, condition, ownership and access.</p>';
    if (activeTab === 'contacts') {
      const c = contactPaths[s.id];
      return '<div class="ep-panel-intro"><span class="ep-kicker">Qualify the opportunity</span><h4>Reach the people who control access.</h4><p>For each researched site, we look for relevant individuals, published business phones and emails, and the sources behind them.</p></div><div class="ep-contact-path">' + [0,2].map((i,n) => '<article><span>' + (n+1) + '</span><div><strong>' + esc(c[i]) + '</strong><p>' + esc(c[i+1]) + '</p></div></article>').join('') + '</div><div class="ep-next"><strong>The first conversation</strong><p>Is the owner open to a mining load? What net MW, delivery point, operating hours and price could they offer—and who can approve the arrangement?</p></div><p class="ep-copy">These are roles to research. Named contacts and owner responses belong to a specific site report.</p>';
    }
    return '<div class="ep-panel-intro"><span class="ep-kicker">Could this source fit your mine?</span><h4>' + esc(s.label) + '</h4><p>' + esc(s.intro.replace('you can actually offer', 'a supplier can actually offer')) + '</p></div><ul class="ep-source-checks">' + s.checks.map((t,i) => '<li><span>0' + (i+1) + '</span>' + esc(t) + '</li>').join('') + '</ul><div class="ep-next"><strong>Compare on usable power and total cost</strong><p>Screen the MW available to your load, delivered energy cost, operating flexibility and capital still needed to connect.</p></div><p class="ep-copy">Storage and hybrid arrangements are considered with their underlying supply, charging costs and delivery schedule.</p>';
  }
  function renderSource() {
    const s = sources.find(item => item.id === sourceId);
    root.querySelector('#ep-source').value = sourceId;
    root.querySelectorAll('[data-preview-source]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.previewSource === sourceId)));
    root.querySelector('.ep-source-route').innerHTML = '<span class="ep-kicker">The route to your mine</span><div><strong>' + esc(s.label) + '</strong><span aria-hidden="true">↓</span><strong>' + esc(s.route) + '</strong><span aria-hidden="true">↓</span><strong>Agreed supply for your load</strong></div>';
    const specialty = ['landfill_gas', 'flare_gas'].includes(s.id);
    root.querySelector('.ep-brief').innerHTML = '<span>YOUR SEARCH</span><strong>Nationwide · Matched to your requirements</strong><span>' + (specialty ? 'Our specialty · Existing infrastructure prioritized' : 'Selective research · Scoped around your brief') + '</span>';
    root.querySelector('.ep-detail-heading').innerHTML = '<span class="ep-kicker">' + esc(s.route) + ' · ' + (specialty ? 'Our sourcing specialty' : 'Selective research') + '</span><h3>' + esc(s.label) + '</h3><span class="ep-badge">Source guide · site availability to be researched</span>';
    renderPanel(null, null, s);
    const link = root.querySelector('.ep-workspace-link'); link.href = '#request'; link.dataset.previewAdd = s.id; link.innerHTML = 'Include ' + esc(s.label) + ' in my search <span aria-hidden="true">↗</span>';
    root.querySelector('.ep-footer').innerHTML = '<span class="ep-status-dot" aria-hidden="true"></span>Research routes · Power, pricing and access confirmed site by site';
  }
  function render() {
    root.querySelector('#siteDetail').setAttribute('aria-label', mode === 'sources' ? 'Selected energy source' : 'Selected sample site');
    root.querySelectorAll('[data-preview-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.previewMode === mode)));
    sourceRoot.hidden = mode !== 'sources'; root.querySelector('.ep-research').hidden = mode !== 'research';
    if (mode === 'sources') { renderSource(); return; }
    root.querySelector('.ep-brief').innerHTML = '<span>EXAMPLE SEARCH</span><strong>0.5–2 MW · Mid-Atlantic US</strong><span>Existing generation preferred</span>';
    const link = root.querySelector('.ep-workspace-link'); delete link.dataset.previewAdd; link.href = '../portal/scouting/#sites'; link.innerHTML = 'Explore the full client workspace <span aria-hidden="true">↗</span>';
    root.querySelector('.ep-footer').innerHTML = '<span class="ep-status-dot" aria-hidden="true"></span>Public research · ' + esc(sample.researchDate) + ' · No confirmed power offers';
    const p = profiles.find(item => item.id === selected), a = access.sites.find(item => item.id === selected);
    root.querySelector('#locator').innerHTML = locator.render(profiles, selected);
    root.querySelectorAll('[data-preview-site]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.previewSite === selected)));
    root.querySelector('.ep-detail-heading').innerHTML = `<span class="ep-kicker">${esc(p.location)} · Landfill gas</span><h3>${esc(p.name)}</h3><span class="ep-badge">${esc(p.dispositionLabel)}</span>`;
    renderPanel(p, a);
  }
  function renderPanel(p, a, source) {
    root.querySelectorAll('[data-preview-tab]').forEach(b => { const on = b.dataset.previewTab === activeTab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const el = root.querySelector('#ep-panel'); el.setAttribute('aria-labelledby', 'ep-tab-' + activeTab); el.innerHTML = source ? sourcePanel(source) : panel(p, a);
  }
  function setTab(id) { activeTab = id; if (mode === 'sources') { renderSource(); return; } const p = profiles.find(item => item.id === selected); renderPanel(p, access.sites.find(item => item.id === selected)); }
  root.querySelector('#ep-source').addEventListener('change', e => { sourceId = e.target.value; render(); });
  root.addEventListener('click', e => {
    const view = e.target.closest('[data-preview-mode]'); if (view) { mode = view.dataset.previewMode; render(); }
    const source = e.target.closest('[data-preview-source]'); if (source) { sourceId = source.dataset.previewSource; render(); }
    const add = e.target.closest('[data-preview-add]');
    if (add) {
      const s = sources.find(s => s.id === add.dataset.previewAdd);
      const field = [...document.querySelectorAll('#siteSearchForm [name="energy_sources"]')].find(f => f.value === s.label);
      if (field) {
        field.checked = true;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        // Show the selected preference when the phone form has it folded away.
        const disclosure = field.closest('details[data-mobile-details]');
        if (disclosure) disclosure.open = true;
        document.querySelector('#ss-name')?.focus({ preventScroll: true });
      }
    }
    const site = e.target.closest('[data-preview-site]'); if (site) { selected = site.dataset.previewSite; render(); }
    const tab = e.target.closest('[data-preview-tab]'); if (tab) setTab(tab.dataset.previewTab);
  });
  root.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    const i = tabs.findIndex(([id]) => id === activeTab); let next;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next == null) return; e.preventDefault(); setTab(tabs[next][0]); root.querySelector('#ep-tab-' + activeTab).focus();
  });
  locator.bind(root, () => ({ sites: profiles, selected }), id => { selected = id; render(); }, profiles);
  render();
}());
