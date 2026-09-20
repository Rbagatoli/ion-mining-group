/* Public-source screening, not engineering approval or an owner power offer.
 * This module cannot advance a site to confirmed from browser feedback.
 */
(function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const array = v => Array.isArray(v) ? v : [];
  function url(v) { try { const u = new URL(v); return /^(https?:)$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function email(v) { return typeof v === 'string' && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v) ? v : ''; }
  function phone(v) { const raw = String(v || ''), ext = raw.match(/(?:ext\.?|x)\s*(\d+)/i), number = raw.replace(/(?:ext\.?|x)\s*\d+.*$/i, '').replace(/[^+\d]/g, ''); return number ? number + (ext ? ';ext=' + ext[1] : '') : ''; }
  function packet(p) { return array(window.ProtonEnergyAccessData?.sites).find(s => s.id === p.id); }
  function contacts(p) { return array(packet(p)?.contacts).slice().sort((a, b) => a.priority - b.priority); }
  function validLoad(brief) { return brief && Number.isFinite(Number(brief.minMw)) && Number.isFinite(Number(brief.maxMw)) && Number(brief.minMw) > 0 && Number(brief.maxMw) >= Number(brief.minMw); }
  function outlook(p, brief) {
    if (Array.isArray(brief?.energySources) && brief.energySources.length && !brief.energySources.includes('landfill_gas')) return { label: 'Outside your selected energy sources', tone: 'hold', title: 'This landfill example does not match your energy preferences.', next: 'Request new research for your chosen energy sources. This report still contains the four original landfill examples.' };
    if (!packet(p)) return { label: 'Access not assessed', tone: 'neutral', title: 'Further research is needed.', next: 'Identify the owner and energy rights holder before assessing access.' };
    if (p.status === 'excluded') return { label: 'Low fit for a power-first search', tone: 'excluded', title: 'A competing gas use is the main obstacle.', next: 'Check whether any gas or power is outside the RNG arrangement before commissioning technical work.' };
    if (p.status === 'hold') return { label: 'Hold for a status check', tone: 'hold', title: 'Clarify the generator plan first.', next: 'Ask whether the generator is still operating and whether the county will consider a new energy user.' };
    const rating = packet(p)?.capacityUpdate?.nameplateMw;
    if (!validLoad(brief)) return { label: 'Set your load to assess fit', tone: 'neutral', title: 'A valid MW range is needed for a capacity comparison.', next: 'Enter your minimum and maximum MW in your brief. Rights, spare output and owner interest still need confirmation.' };
    if (Number.isFinite(rating) && Number(brief.minMw) > rating) return { label: 'Weak fit at your requested scale', tone: 'hold', title: 'The disclosed generator is smaller than your minimum load.', next: 'Confirm additional capacity or consider a smaller first phase before commissioning technical work.' };
    if (Number.isFinite(rating) && Number(brief.maxMw) > rating) return { label: 'A smaller phase may be possible', tone: 'research', title: 'There is a technical starting point for part of your load range.', next: 'Confirm net uncommitted output and willingness to supply a smaller initial load.' };
    return { label: 'Worth an exploratory call', tone: 'research', title: 'There is a reason to investigate, not an available power offer.', next: 'Ask the rights holder whether a mining load is welcome and any firm net power is uncommitted.' };
  }
  function assessment(p, brief = {}) {
    const s = packet(p), rating = s?.capacityUpdate?.nameplateMw;
    if (!s) return { technical: ['Not assessed', 'No supplemental research is available.'], commercial: ['Not assessed', 'Rights and existing commitments need research.'], evidence: ['Insufficient', 'No screening judgment can be made.'] };
    let technical = ['Physical route needs checking', 'Historical gas and generation equipment does not establish current operability.'];
    if (!validLoad(brief)) technical = ['Load range needed', 'Enter a valid minimum and maximum MW in your brief before comparing capacity.'];
    if (Number.isFinite(rating) && validLoad(brief)) {
      if (Number(brief.minMw) > rating) technical = ['Below your minimum load', `Your ${brief.minMw} MW minimum exceeds the ${rating} MW operating nameplate reported for ${s.capacityUpdate.reportYear}. More capacity or a smaller load would be required.`];
      else if (Number(brief.maxMw) > rating) technical = ['Smaller phase worth exploring', `The ${rating} MW reported generator rating falls within your requested range, but below its ${brief.maxMw} MW upper end. Net output and spare capacity may be lower.`];
      else technical = ['Plausible at the nameplate level', `Your requested range is below or equal to the ${rating} MW reported rating. This is a physical screening result, not a net-power match.`];
    }
    let commercial = ['Access remains unproven', 'A third-party energy project or past power sale shows a commercial route existed. It can also mean the energy is already committed. No spare allocation or owner interest is confirmed.'];
    if (p.status === 'hold') { technical = ['Retirement risk', 'The county plans generator decommissioning subject to approval. Present operation and any replacement route must be established.']; commercial = ['Weak near-term reuse case', 'The published direction is to change the energy system. Owner support for a different use would be needed.']; }
    if (p.status === 'excluded') { technical = ['Electricity route being replaced', 'The owner describes an RNG replacement for aging generation. Historical generators should not be assumed available for reuse.']; commercial = ['Competing long-term gas use', 'The announced 20-year RNG project makes a separate electricity deal less promising. Any uncommitted rights or exception must be confirmed.']; }
    return { technical, commercial, evidence: [Number.isFinite(rating) ? 'Stronger on equipment; weak on access' : 'Stronger on project direction; weak on access', 'Official records support the configuration or planned use. They do not establish current spare output, commercial openness or a mining tariff.'] };
  }
  function badge(p, brief) { const o = outlook(p, brief); return `<div class="ea-summary"><div><span class="ea-label">ENERGY ACCESS</span><strong>${esc(o.label)}</strong><small>Public-source screening · owner acceptance unconfirmed</small></div><button class="text-button" data-tab="access">See why →</button></div>`; }
  function source(s) { const href = url(s.sourceUrl); return `${href ? `<a class="source-chip" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(s.sourceTitle || 'Public source')} ↗</a>` : ''}<span class="ea-date">Published ${esc(s.publicationDate || 'date not stated')} · checked ${esc(s.checkedDate || 'date not recorded')}</span>${array(s.additionalSources).map(a => `<div class="ea-additional-source"><a class="source-chip" href="${esc(url(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a><span class="ea-date">Published ${esc(a.publicationDate || 'date not stated')} · checked ${esc(a.checkedDate || s.checkedDate)}</span></div>`).join('')}`; }
  function capacityNotice(p) { const c = packet(p)?.capacityUpdate; return c ? `<div class="callout ea-capacity-update"><strong>Newer public record: ${esc(c.nameplateMw)} MW operating nameplate (${esc(c.reportYear)} snapshot).</strong><br>${esc(c.scope)}<br>${source(c)}<p>The older figures below remain historical evidence. This rating is not power available to a new client.</p></div>` : ''; }
  function render(p, brief = {}) {
    const s = packet(p), o = outlook(p, brief), first = contacts(p)[0], a = assessment(p, brief);
    const rating = s?.capacityUpdate?.nameplateMw;
    const briefLoad = validLoad(brief) ? `${esc(brief.minMw)}–${esc(brief.maxMw)} MW` : 'Set a valid MW range in your brief';
    const loadGap = validLoad(brief) && Number.isFinite(rating) && Number(brief.minMw) > rating ? `<div class="callout"><strong>Your minimum load exceeds the reported generator rating.</strong><br>${esc(brief.minMw)} MW requested versus ${esc(rating)} MW operating nameplate in the ${esc(s.capacityUpdate.reportYear)} snapshot. That reported configuration cannot supply your full minimum load. A smaller phase or additional verified capacity would be needed; current output and allocation are still unconfirmed.</div>` : '';
    const gates = [
      ['Owner interest', 'Would the decision maker allow this mining use?', 'Written expression of interest from the relevant authority.'],
      ['Energy & use rights', 'Who can commit gas, electricity and space?', 'Rights-holder identity, signing authority and existing offtake restrictions.'],
      ['Spare net power', 'How much power can your load actually receive?', 'Dated generation logs and a proposed net MW allocation after plant load and commitments.'],
      ['Physical connection', 'Can the site deliver power to a usable mining location?', 'Connection point, voltage, usable space, equipment condition, cooling and access.'],
      ['Price & remaining capital', 'Can it fit your upfront budget and operating target?', 'Itemized delivered rate, remaining works, who pays and dated quotes.'],
      ['Approvals & timing', 'Can that arrangement be put in place when you need it?', 'Permit pathway, term, lead times and owner-agreed start conditions.']
    ];
    return `<section class="ea-workspace"><div class="ea-verdict ${o.tone}"><span class="tag ${o.tone}">${esc(o.label)}</span><h3>${esc(o.title)}</h3><p>${esc(s?.summary || p.recommendation)}</p><div class="ea-boundary">Not owner-qualified. No confirmed allocation, quote or agreement to host mining.</div></div>
      <h3>How promising is it before you call?</h3><p class="small muted">Research judgment for your load range. These are evidence-based screening categories, not measured probabilities.</p><div class="ea-assessment">${[['Technical possibility', a.technical], ['Commercial-access outlook', a.commercial], ['Evidence strength', a.evidence]].map(([label, item]) => `<article><span class="ea-label">${label}</span><h4>${esc(item[0])}</h4><p>${esc(item[1])}</p></article>`).join('')}</div><div class="ea-stage"><strong>Public research</strong><span aria-hidden="true">→</span><span>Owner qualification</span><span aria-hidden="true">→</span><span>Technical &amp; commercial review</span></div>
      ${loadGap}<h3>What makes it possible—or difficult?</h3>${capacityNotice(p)}<div class="ea-signals">${array(s?.signals).map(f => `<article class="ea-signal"><span class="tag ${f.state === 'obstacle' ? 'hold' : 'neutral'}">${f.state === 'obstacle' ? 'Constraint' : f.state === 'unknown' ? 'Open question' : 'Public evidence'}</span><h4>${esc(f.label)}</h4><p>${esc(f.finding)}</p>${source(f)}</article>`).join('') || `<p class="muted">${esc(p.infrastructureSummary)}</p>`}</div>
      <h3>Six answers needed before calling it an opportunity</h3><p class="small muted">Your brief: ${briefLoad}. None of these requirements is confirmed for this client by the sample report.</p><div class="ea-gates">${gates.map(([name, question, proof], i) => `<details><summary><span class="ea-gate-number">${i + 1}</span><strong>${name}</strong><span class="ea-open">Unconfirmed</span></summary><p>${question}</p><p class="muted">Needed: ${proof}</p></details>`).join('')}</div>
      <div class="callout"><strong>Best next move</strong><br>${esc(s?.nextStep || o.next)}${first ? `<br><span class="ea-next-contact">Start with ${esc(first.name)} · ${esc(first.role)}</span>` : ''}</div><div class="actions"><button class="button primary small" data-tab="contact">Who to contact →</button><button class="button secondary small" data-access-draft="${esc(p.id)}">Build call / email brief</button></div>
      <details class="ea-method"><summary>How to read this assessment</summary><p>The load comparison uses your current brief against the dated sample evidence. This is a research judgment, not a probability of closing or an engineering finding. A generator can exist while its output is committed elsewhere. Gas collection alone does not establish usable electricity.</p><p>An owner-qualified opportunity needs a dated response from an authorized party on interest, net MW, rights and commercial terms. Technical due diligence still follows. Your feedback does not change that status.</p><a class="source-chip" href="https://www.epa.gov/lmop/landfill-gas-energy-project-development-handbook" target="_blank" rel="noopener noreferrer">EPA project-development guidance ↗</a></details></section>`;
  }
  function contactCard(c, i, p) {
    const mail = email(c.email), telephone = phone(c.phone), website = url(c.website || c.sourceUrl);
    return `<article class="ea-contact"><div class="ea-contact-top"><span class="ea-contact-number">${String(i + 1).padStart(2, '0')}</span><div><h4>${esc(c.name)}</h4><p>${esc(c.role)}</p><p>${esc(c.organization)}</p></div><span class="tag neutral">${i === 0 ? 'Start here' : /historical|dated|202[0-5]/i.test(c.role) ? 'Dated listing' : 'Public route'}</span></div><div class="ea-contact-links">${telephone ? `<a href="tel:${esc(telephone)}">${esc(c.phone)}</a>` : ''}${mail ? `<a href="mailto:${esc(encodeURIComponent(mail))}">${esc(mail)}</a>` : '<span>No published direct email</span>'}${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Official page ↗</a>` : ''}</div><p class="ea-ask"><strong>Ask about:</strong> ${esc(c.ask)}</p><p class="ea-verification">${esc(c.relationship || "")}<br>${esc(c.verification || 'Publicly listed business contact. Deliverability and authority not confirmed.')}</p><details class="ea-contact-source"><summary>Source &amp; contact status</summary>${source(c)}<p>No outreach or response recorded by this workspace. Public listing does not establish signing authority.</p></details><button class="text-button" data-access-draft="${esc(p.id)}" data-contact-index="${i}">Prepare an enquiry for ${esc(c.name)} →</button></article>`;
  }
  function renderContacts(p) {
    const list = contacts(p);
    const cards = list.slice(0, 3).map((c, i) => contactCard(c, i, p)).join('') + (list.length > 3 ? `<details class="ea-more-contacts"><summary>More contacts &amp; referrals · ${list.length - 3}</summary>${list.slice(3).map((c, i) => contactCard(c, i + 3, p)).join('')}</details>` : '');
    return `<section class="ea-contacts"><div class="section-heading"><div><h3>People who can move this forward</h3><p class="small muted">${list.length} public business contact routes · checked ${esc(window.ProtonEnergyAccessData?.checkedDate || 'date not recorded')}</p></div></div><p class="ea-contact-intro">Start with the site or authority contact, then confirm who controls gas, power and land. Technical and commercial referrals have different roles.</p>${cards || '<p class="muted">Additional contacts have not been researched for this location.</p>'}<div class="callout"><strong>Still to identify:</strong> the authorized gas/power rights holder, the person who can approve the mining use, and the engineer responsible for the connection. A published contact name does not close these gaps.</div></section>`;
  }
  function draft(p, brief, index) {
    const contact = contacts(p)[Number.isInteger(index) ? index : 0];
    const body = [
      `Hello ${contact?.name || 'site team'},`, '',
      `I am researching a ${brief.minMw}–${brief.maxMw} MW mining load${brief.company ? ' for ' + brief.company : ''} and would like to understand whether there could be an opportunity at ${p.name}.`,
      'I have seen public project records, but I am not assuming that spare power, equipment or space is available.', '',
      contact?.ask ? 'I am contacting you about: ' + contact.ask : '',
      '1. Are you the appropriate person to discuss a new onsite energy user? If not, who controls gas/power sales and land use?',
      '2. Would the relevant rights holder consider this type of mining load?',
      '3. What firm net MW, if any, could be allocated after plant loads and existing sales or gas commitments?',
      '4. Which generators, gas treatment, transformers, switchgear and connection points remain usable, and who owns them?',
      '5. What space, access, cooling and permit constraints would apply? Is there a feasible start date and supply term?',
      '6. Could you share an indicative delivered-power rate with all charges, and outline remaining site work, deposits and who would pay?', '',
      `Target start: ${brief.timing}. Infrastructure preference: ${brief.infrastructure}.`,
      ...(window.ProtonEnergyPreferences?.draftLines(brief) || []),
      brief.delivery ? `Supply arrangement: ${brief.delivery}.` : '',
      brief.operating ? `Operating flexibility: ${brief.operating}.` : '',
      brief.budget ? `Site capital budget, excluding miners: USD ${brief.budget}.` : '',
      brief.rate ? `Energy-only target: ${brief.rate} US cents/kWh (before other charges).` : '', '',
      'Please flag any records we have misunderstood or that are no longer current. No commitment is being made by this enquiry.'
    ].filter(v => v !== undefined).join('\n');
    return { to: email(contact?.email), contactName: contact?.name || 'Site team', subject: `Energy-use enquiry — ${p.name}`, body };
  }
  function bind(root, profiles, getBrief) {
    root.addEventListener('click', event => {
      const trigger = event.target.closest('[data-access-draft]'); if (!trigger) return;
      const p = profiles.find(p => p.id === trigger.dataset.accessDraft); if (!p) return;
      let dialog = document.getElementById('accessDraftDialog');
      if (!dialog) {
        dialog = document.createElement('dialog'); dialog.id = 'accessDraftDialog'; dialog.className = 'ea-owner-dialog'; dialog.setAttribute('aria-labelledby', 'accessDraftTitle');
        dialog.innerHTML = '<form method="dialog"><div class="section-heading"><h2 id="accessDraftTitle">Prepare your first conversation</h2><button class="icon-button" aria-label="Close enquiry">×</button></div></form><p id="accessDraftRecipient"></p><p class="small muted">Unsent draft. Review the recipient and wording before contacting the site. You are not making a commitment.</p><label for="accessDraftText">Call notes / email text</label><textarea id="accessDraftText" rows="12"></textarea><div class="actions"><button type="button" class="button secondary" id="accessDraftCopy">Copy text</button><a class="button primary" id="accessDraftMail">Open email draft ↗</a></div><p id="accessDraftStatus" class="ea-draft-status" role="status" aria-live="polite"></p>';
        document.body.appendChild(dialog);
        dialog.querySelector('#accessDraftCopy').addEventListener('click', async () => { const text = dialog.querySelector('textarea'); try { await navigator.clipboard.writeText(text.value); dialog.querySelector('#accessDraftStatus').textContent = 'Copied. Nothing has been sent.'; } catch (_) { text.focus(); text.select(); dialog.querySelector('#accessDraftStatus').textContent = 'Select and copy this text. Nothing has been sent.'; } });
      }
      const d = draft(p, getBrief(), trigger.hasAttribute('data-contact-index') ? Number(trigger.dataset.contactIndex) : undefined);
      const text = dialog.querySelector('textarea'), mail = dialog.querySelector('#accessDraftMail');
      text.value = d.body; dialog.querySelector('#accessDraftRecipient').textContent = `${d.contactName}${d.to ? ' · ' + d.to : ' · no direct email published; use the phone or official contact page'}`;
      mail.hidden = !d.to; dialog.querySelector('#accessDraftStatus').textContent = '';
      function refreshLink() { if (d.to) mail.href = `mailto:${encodeURIComponent(d.to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(text.value)}`; else mail.removeAttribute('href'); }
      text.oninput = refreshLink; refreshLink(); dialog.showModal();
    });
  }
  window.ProtonSiteAccess = Object.freeze({ packet, contacts, outlook, assessment, badge, capacityNotice, render, renderContacts, draft, bind });
})();
