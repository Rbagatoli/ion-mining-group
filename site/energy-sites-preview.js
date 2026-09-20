/* A public product preview built from the same research and locator as the
 * client workspace. No invented listings, account state or automatic outreach. */
(function () {
  'use strict';
  const root = document.getElementById('energyWorkspacePreview');
  const sample = window.ProtonScoutingSample, access = window.ProtonEnergyAccessData, locator = window.ProtonSiteLocator;
  if (!root || !sample?.profiles?.length || !access || !locator) return;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const profiles = sample.profiles;
  let selected = profiles[0].id, activeTab = 'energy';
  const tabs = [['energy', 'Energy access'], ['capital', 'Infrastructure & capital'], ['contacts', 'Contacts']];
  root.innerHTML = `<div class="ep-toolbar"><div><span class="ep-logo" aria-hidden="true">P</span><strong>Proton <span>Energy Sites</span></strong></div><span class="ep-preview-label">Interactive preview</span></div><div class="ep-brief"><span>EXAMPLE SEARCH</span><strong>0.5–2 MW · Mid-Atlantic US</strong><span>Existing generation preferred</span></div><div class="ep-body"><div class="ep-discover"><div id="locator"></div><div class="ep-site-list" aria-label="Sample sites">${profiles.map((p, i) => `<button type="button" data-preview-site="${esc(p.id)}" aria-pressed="false"><span class="ep-number">${i + 1}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.location)}</small></span><span aria-hidden="true">↗</span></button>`).join('')}</div></div><section class="ep-detail" id="siteDetail" tabindex="-1" aria-label="Selected sample site"><div class="ep-detail-heading"></div><div class="ep-tabs" role="tablist" aria-label="Site research">${tabs.map(([id, title], i) => `<button type="button" id="ep-tab-${id}" role="tab" aria-controls="ep-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-preview-tab="${id}">${title}</button>`).join('')}</div><div class="ep-panel" id="ep-panel" role="tabpanel" tabindex="0" aria-labelledby="ep-tab-energy"></div><a class="ep-workspace-link" href="../portal/scouting/#sites">Explore the full client workspace <span aria-hidden="true">↗</span></a></section></div><div class="ep-footer"><span class="ep-status-dot" aria-hidden="true"></span>Public research · ${esc(sample.researchDate)} · No confirmed power offers</div>`;
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
  function render() {
    const p = profiles.find(item => item.id === selected), a = access.sites.find(item => item.id === selected);
    root.querySelector('#locator').innerHTML = locator.render(profiles, selected);
    root.querySelectorAll('[data-preview-site]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.previewSite === selected)));
    root.querySelector('.ep-detail-heading').innerHTML = `<span class="ep-kicker">${esc(p.location)} · Landfill gas</span><h3>${esc(p.name)}</h3><span class="ep-badge">${esc(p.dispositionLabel)}</span>`;
    renderPanel(p, a);
  }
  function renderPanel(p, a) {
    root.querySelectorAll('[data-preview-tab]').forEach(b => { const on = b.dataset.previewTab === activeTab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const el = root.querySelector('#ep-panel'); el.setAttribute('aria-labelledby', 'ep-tab-' + activeTab); el.innerHTML = panel(p, a);
  }
  function setTab(id) { activeTab = id; const p = profiles.find(item => item.id === selected); renderPanel(p, access.sites.find(item => item.id === selected)); }
  root.addEventListener('click', e => {
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
