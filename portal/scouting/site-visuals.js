/* Native visual evidence panel for the client scouting workspace.
 * Public sample only. No requests, messages or stored customer records.
 * Source photographs load only on explicit internal-preview action.
 */
(function () {
  'use strict';
  const notes = Object.create(null);
  const bound = new WeakSet();
  const noteTypes = ['Observation', 'Inference', 'Owner-reported'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => Array.isArray(value) ? value : [];
  function safeUrl(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function imageUrl(value, aerial) {
    const url = safeUrl(value); if (!url) return '';
    const parsed = new URL(url);
    const allowed = aerial ? ['imagery.nationalmap.gov'] : ['wrallp.com', 'www.wrallp.com', 'images.squarespace-cdn.com'];
    return parsed.protocol === 'https:' && allowed.includes(parsed.hostname) ? url : '';
  }
  function site(profile) { return list(window.PROTON_VISUAL_DATA?.sites).find(item => item.id === profile.id); }
  function withheld(aerial) {
    const match = typeof aerial?.locationMatch === 'object' ? aerial.locationMatch.status : aerial?.locationMatch;
    return aerial?.buyerDisplayAllowed === false || /mismatch|withheld|unresolved|unverified/i.test(String(match || ''));
  }
  function canPlot(profile) {
    const visual = site(profile);
    return profile.id !== 'SIM-734' && visual?.coordinates?.displayAllowed !== false && !withheld(visual?.aerial);
  }
  function mapUrl(profile) {
    const visual = site(profile);
    if (safeUrl(visual?.mapUrl)) return safeUrl(visual.mapUrl);
    const query = profile.id === 'SIM-734' ? '2350 Marriottsville Road, Marriottsville, MD 21104' : canPlot(profile) && Number.isFinite(profile.lat) && Number.isFinite(profile.lng) ? `${profile.lat},${profile.lng}` : `${profile.name}, ${profile.location}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  function link(url, label, classes = 'sv-link') {
    const value = safeUrl(url);
    return value ? `<a class="${esc(classes)}" href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  }
  function items(values) { return list(values).map(value => `<li>${esc(typeof value === 'object' ? value.text || value.label || '' : value)}</li>`).join(''); }
  function metadata(entries) { return `<dl class="sv-meta">${entries.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || 'Not verified')}</dd></div>`).join('')}</dl>`; }
  function marker(visual) {
    const a = visual.aerial, c = visual.coordinates;
    if (!a || withheld(a) || c?.displayAllowed === false || !Number.isFinite(c?.lat) || !Number.isFinite(c?.lng) || Math.abs(c.lat) >= 85 || Math.abs(c.lng) > 180 || !Array.isArray(a.bbox) || a.bbox.length !== 4) return '';
    const [xmin, ymin, xmax, ymax] = a.bbox.map(Number);
    let x = c.lng, y = c.lat;
    if (/3857|102100/.test(String(a.crs))) { x = 6378137 * x * Math.PI / 180; y = 6378137 * Math.log(Math.tan(Math.PI / 4 + y * Math.PI / 360)); }
    else if (!/4326|WGS\s*84/i.test(String(a.crs))) return '';
    if (![xmin, ymin, xmax, ymax, x, y].every(Number.isFinite) || xmax <= xmin || ymax <= ymin || x < xmin || x > xmax || y < ymin || y > ymax) return '';
    return `<span class="sv-map-marker" hidden style="left:${((x - xmin) / (xmax - xmin) * 100).toFixed(3)}%;top:${((ymax - y) / (ymax - ymin) * 100).toFixed(3)}%" role="img" aria-label="Approximate catalog point; not equipment or usable pad"></span>`;
  }
  function renderAerial(visual) {
    const a = visual.aerial, rejected = withheld(a), url = imageUrl(a?.imageUrl, true);
    if (rejected || !url) {
      return `<div class="sv-empty sv-warning"><span class="sv-kicker">${rejected ? 'LOCATION CHECK' : 'AERIAL EVIDENCE'}</span><h3>${rejected ? 'Aerial withheld pending location verification' : 'No verified aerial in this brief'}</h3><p>${esc(a?.locationMatch?.note || a?.locationMatch?.reason || 'The source packet does not include a verified aerial view for this site.')}</p>${visual.coordinates?.displayAllowed === false ? `<p><strong>The catalog coordinate was rejected.</strong> It is omitted from the site locator. The map opens the official address search; it does not locate current equipment.</p>${link(visual.officialAddress?.sourceUrl, 'Official address source')}` : ''}${rejected && a?.metadataUrl ? `<details><summary>Rejected image record</summary><p>This metadata belongs to the rejected catalog location, not a verified facility view. Rejected image acquisition: ${esc(a.captureDate || 'Unknown')}.</p>${link(a.metadataUrl, 'Rejected-location metadata')}</details>` : ''}</div>`;
    }
    const point = marker(visual), date = a.captureDateLabel || a.captureDate || 'Unknown';
    return `<figure class="sv-aerial"><div class="sv-image-frame"><img class="sv-aerial-image" src="${esc(url)}" alt="Historical aerial around ${esc(visual.name)}. Approximate catalog context, not a surveyed property or equipment plan." loading="eager" referrerpolicy="no-referrer" width="${Number(a.width) || 1200}" height="${Number(a.height) || 800}">${point}<div class="sv-image-status" role="status">Loading dated aerial…</div></div><figcaption class="sv-caption"><div><strong>Acquired ${esc(date)}</strong><span>${esc(a.attribution || a.publisher)}</span></div><div>${link(a.sourceUrl, 'Imagery source')}${link(a.metadataUrl, 'Acquisition metadata')}</div></figcaption></figure><p>${esc(a.caption)}</p>${point ? '<p class="sv-photo-note">Orange marker: approximate catalog point, not an equipment location or usable pad. No property boundary is marked.</p>' : ''}${metadata([['Image acquisition', date], ['Source checked', a.checkedDate || window.PROTON_VISUAL_DATA?.preparedDate], ['Publisher', a.publisher], ['Reuse basis', typeof a.rights === 'string' ? a.rights : 'Consult source rights']])}<p class="sv-photo-note">${esc(visual.coordinates?.basis)}</p>${list(a.observations).length ? `<div class="sv-section"><h4>Visible features · observations only</h4><ul class="sv-list">${items(a.observations)}</ul></div>` : ''}`;
  }
  function renderPhotos(visual) {
    const photos = list(visual.photos);
    return `<section class="sv-section"><div class="sv-heading"><h3>Infrastructure photographs</h3><span class="sv-kicker">${photos.length} SOURCE${photos.length === 1 ? '' : 'S'}</span></div>${photos.length ? `<div class="sv-photo-grid">${photos.map((photo, index) => `<article class="sv-photo-card"><h4>${esc(photo.title || 'Published project photograph')}</h4><p>${esc(photo.caption)}</p>${metadata([['Photo captured', photo.captureDateLabel || photo.captureDate || 'Unknown'], ['Source published', photo.publicationDate || 'Unknown'], ['Source checked', photo.checkedDate || window.PROTON_VISUAL_DATA?.preparedDate]])}<p class="sv-photo-note">Publication and review dates do not establish when the photo was taken. Current condition and availability remain unconfirmed.</p>${link(photo.sourceUrl, 'View publisher’s project page')}<p class="sv-photo-note">${esc(photo.publisher)} · Customer brief: source link only. Reproduction permission is not documented; photographs are excluded from print.</p>${photo.claimBasis ? `<details><summary>Caption evidence</summary><p>${esc(photo.claimBasis)}</p></details>` : ''}${imageUrl(photo.imageUrl, false) ? `<details class="sv-internal"><summary>Internal source preview</summary><p>Research preview only. This does not clear the photograph for customer distribution.</p><button type="button" class="button secondary small" data-sv-preview="${index}" aria-expanded="false" aria-controls="sv-photo-${index}">Preview published photo</button><figure class="sv-photo-preview" id="sv-photo-${index}" hidden></figure></details>` : ''}</article>`).join('')}</div>` : '<div class="sv-empty"><h4>No verified infrastructure photos in this brief</h4><p>Use the owner-photo checklist below to fill the gap. Aerial shapes cannot establish equipment identity or condition.</p></div>'}</section>`;
  }
  function notesMarkup(id) {
    return list(notes[id]).map((note, index) => `<article class="sv-review-note"><div><strong>${esc(note.type)} · your note</strong><button class="text-button" type="button" data-sv-remove="${index}" aria-label="Remove visual note ${index + 1}">Remove</button></div><p>${esc(note.text)}</p></article>`).join('');
  }
  function render(profile) {
    const visual = site(profile);
    if (!visual) return '<div class="sv-empty"><h3>Visual supplement unavailable</h3><p>The research fields and sources remain available in the other tabs. No imagery has been substituted from another site.</p></div>';
    const satellite = canPlot(profile) && safeUrl(visual.satelliteUrl);
    return `<div class="sv-workspace"><div class="sv-heading"><div><span class="sv-kicker">VISUAL SITE BRIEF</span><h3>See the site. Trace the evidence.</h3></div><button type="button" class="button secondary small" data-sv-print>Print site brief</button></div><p>Dated imagery and source photographs support the same site record you are reviewing. They do not confirm available power or infrastructure you can reuse.</p><div class="sv-toolbar">${link(mapUrl(profile), visual.coordinates?.displayAllowed === false ? 'Open official address' : 'Open map', 'button secondary small')}${satellite ? link(satellite, 'Explore satellite map', 'button secondary small') : ''}</div>${renderAerial(visual)}${renderPhotos(visual)}<section class="sv-section"><h3>What we still need to see</h3><ul class="sv-list">${items(visual.photoRequest)}</ul><details><summary>Still unconfirmed</summary><ul class="sv-list">${items(visual.unknowns)}</ul></details></section><details class="sv-concept"><summary>Proposed layout · measured inputs needed</summary><p>A site-specific layout is not available yet. A useful concept needs measured geometry and confirmed connection points before equipment can be placed accurately.</p><ul class="sv-list">${items(visual.concept?.requirements)}</ul><p>Any future proposed layout will be labeled as a concept, separate from existing infrastructure.</p></details><section class="sv-section sv-note-section"><h3>Your visual review notes</h3><p class="sv-photo-note">Notes stay in this page session and are not sent. They are your observations, not new verified evidence.</p><div class="sv-notes" aria-live="polite">${notesMarkup(profile.id)}</div><form class="sv-note-form"><div class="field"><label for="sv-note-kind">Note type</label><select id="sv-note-kind" name="kind">${noteTypes.map(kind => `<option>${kind}</option>`).join('')}</select></div><div class="field"><label for="sv-note-text">Visual note</label><textarea id="sv-note-text" name="text" maxlength="2000" required placeholder="What should be checked or clarified?"></textarea></div><button class="button secondary small" type="submit">Add note</button><p class="sv-note-status small muted" role="status"></p></form></section></div>`;
  }
  function wireImage(img) {
    const frame = img.closest('.sv-image-frame') || img.closest('.sv-photo-preview');
    const status = frame?.querySelector('.sv-image-status');
    const point = frame?.querySelector('.sv-map-marker');
    const loaded = () => { if (status) status.hidden = true; if (point) point.hidden = false; };
    const failed = () => { img.hidden = true; if (point) point.hidden = true; if (status) { status.textContent = 'Image unavailable from the source right now. Its source link and dated evidence remain available below.'; status.hidden = false; } };
    img.addEventListener('load', loaded, { once: true }); img.addEventListener('error', failed, { once: true });
    if (img.complete) { if (img.naturalWidth) loaded(); else failed(); }
  }
  function bind(container, profile) {
    if (bound.has(container)) return;
    bound.add(container);
    container.querySelectorAll('img').forEach(wireImage);
    container.addEventListener('click', event => {
      const preview = event.target.closest('[data-sv-preview]');
      if (preview) {
        const photo = list(site(profile)?.photos)[Number(preview.dataset.svPreview)];
        const target = container.querySelector(`#sv-photo-${Number(preview.dataset.svPreview)}`);
        if (!photo || !target) return;
        const opening = target.hidden;
        if (opening && !target.querySelector('img')) {
          const url = imageUrl(photo.imageUrl, false); if (!url) return;
          target.innerHTML = `<img src="${esc(url)}" alt="${esc(photo.title)}. Internal source preview; photo capture date ${esc(photo.captureDate || 'unknown')}." referrerpolicy="no-referrer"><div class="sv-image-status" role="status">Loading source preview…</div><figcaption>${esc(photo.attribution || photo.publisher)} · Internal preview; reuse not cleared.</figcaption>`;
          wireImage(target.querySelector('img'));
        }
        target.hidden = !opening; preview.setAttribute('aria-expanded', String(opening)); preview.textContent = opening ? 'Close source preview' : 'Preview published photo';
      }
      const remove = event.target.closest('[data-sv-remove]');
      if (remove) { notes[profile.id]?.splice(Number(remove.dataset.svRemove), 1); container.querySelector('.sv-notes').innerHTML = notesMarkup(profile.id); container.querySelector('.sv-note-status').textContent = 'Visual note removed.'; }
      if (event.target.closest('[data-sv-print]')) window.print();
    });
    container.querySelector('.sv-note-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget, text = form.elements.text.value.trim(), type = form.elements.kind.value;
      if (!text || !noteTypes.includes(type)) return;
      (notes[profile.id] ||= []).push({ type, text: text.slice(0, 2000) });
      container.querySelector('.sv-notes').innerHTML = notesMarkup(profile.id);
      form.elements.text.value = ''; container.querySelector('.sv-note-status').textContent = 'Visual note added for this session. Nothing was sent.';
    });
  }
  window.ProtonSiteVisuals = Object.freeze({ render, bind, mapUrl, canPlot, reset() { for (const key of Object.keys(notes)) delete notes[key]; } });
})();
