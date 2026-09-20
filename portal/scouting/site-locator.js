/* Local geographic reference map. Public catalog points are not surveyed sites.
 * No tile service, geolocation, account access or persistent map state. */
(function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = v => Array.isArray(v) ? v : [];
  const rad = Math.PI / 180;
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2)) / rad;
  const bounds = [-78.4, 38.4, -73.4, 42.55];
  let getState, selectSite, ids = [], dialog, returnFocus, zoom = 1, pan = { x: 0, y: 0 }, drag, frame, ignoreClick = false;
  const geography = () => window.ProtonLocatorGeography || { states: [], cities: [], sources: [] };
  function canPlot(p) { return p.id !== 'SIM-734' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) < 85 && Math.abs(p.lng) <= 180 && (!window.ProtonSiteVisuals || window.ProtonSiteVisuals.canPlot(p)); }
  function number(p, list) { const i = ids.indexOf(p.id); return (i < 0 ? list.indexOf(p) : i) + 1; }
  function reference(p) {
    if (!canPlot(p)) return p.id === 'SIM-734' ? 'Location pending verification · use the official address' : 'Location pending verification';
    const cities = arr(geography().cities).map(c => {
      const a = Math.sin((c.lat - p.lat) * rad / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(c.lat * rad) * Math.sin((c.lng - p.lng) * rad / 2) ** 2;
      return { ...c, miles: 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) };
    }).sort((a, b) => a.miles - b.miles);
    if (!cities.length) return p.location;
    const c = cities[0], y = Math.sin((p.lng - c.lng) * rad) * Math.cos(p.lat * rad), x = Math.cos(c.lat * rad) * Math.sin(p.lat * rad) - Math.sin(c.lat * rad) * Math.cos(p.lat * rad) * Math.cos((p.lng - c.lng) * rad);
    const direction = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((Math.atan2(y, x) / rad + 360) / 45) % 8];
    return `About ${Math.max(1, Math.round(c.miles))} mi ${direction} of ${c.name} · straight-line`;
  }
  function projection(width, height, expanded) {
    const cx = (bounds[0] + bounds[2]) / 2, cy = (merc(bounds[1]) + merc(bounds[3])) / 2;
    const scale = Math.min((width - 42) / (bounds[2] - bounds[0]), (height - 44) / (merc(bounds[3]) - merc(bounds[1]))) * (expanded ? zoom : 1);
    return { scale, point(lng, lat) { return [width / 2 + (lng - cx) * scale + (expanded ? pan.x : 0), height / 2 - (merc(lat) - cy) * scale + (expanded ? pan.y : 0)]; } };
  }
  function svg(list, selected, expanded) {
    const width = expanded ? (window.innerWidth < 700 ? 480 : 1000) : 400, height = expanded ? (window.innerWidth < 700 ? 460 : 660) : 330;
    const { point, scale } = projection(width, height, expanded), geo = geography();
    const xy = (lng, lat) => point(lng, lat).map(n => n.toFixed(2)).join(',');
    const finish = expanded ? 'expanded' : 'compact';
    // One shared light across the land, matching the platinum globe palette.
    // These gradients are a decorative material finish, not terrain or site data.
    const material = `<defs><linearGradient id="sl-platinum-${finish}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}"><stop offset="0" stop-color="#777e82"/><stop offset=".28" stop-color="#dedfdb"/><stop offset=".46" stop-color="#c4c7c6"/><stop offset=".68" stop-color="#a2a7a8"/><stop offset=".87" stop-color="#c3c6c6"/><stop offset="1" stop-color="#777f85"/></linearGradient><radialGradient id="sl-graphite-${finish}" gradientUnits="userSpaceOnUse" cx="${width * .27}" cy="${height * .16}" r="${width * .95}"><stop offset="0" stop-color="#343a40"/><stop offset=".5" stop-color="#191e24"/><stop offset="1" stop-color="#080d12"/></radialGradient></defs>`;
    const states = arr(geo.states).map(s => `<path class="sl-state sl-state-${esc(s.id)}" fill="url(#sl-platinum-${finish})" d="${arr(s.coordinates).map(poly => arr(poly).map(ring => arr(ring).map(([lng, lat], i) => `${i ? 'L' : 'M'}${xy(lng, lat)}`).join('') + 'Z').join('')).join('')}" fill-rule="evenodd"/>`).join('');
    const visible = ([x, y], margin = 12) => x > margin && x < width - margin && y > margin && y < height - margin;
    const occupied = list.filter(canPlot).map(p => { const [x, y] = point(p.lng, p.lat); return { x: x - 23, y: y - 23, w: 46, h: 46 }; });
    function placeLabel(x, y, text, font, preferredLeft) {
      const w = text.length * font * .57, h = font + 3;
      const options = preferredLeft ? [[-10,-13,'end'],[-10,23,'end'],[12,-13,'start'],[12,23,'start'],[-10,40,'end'],[12,40,'start'],[0,-33,'middle']] : [[10,22,'start'],[10,-13,'start'],[-10,22,'end'],[-10,-13,'end'],[10,40,'start'],[-10,40,'end'],[0,-33,'middle']];
      for (const [dx, dy, anchor] of options) {
        const lx = x + dx, ly = y + dy, box = { x: lx - (anchor === 'end' ? w : anchor === 'middle' ? w / 2 : 0), y: ly - font, w, h };
        if (box.x < 8 || box.x + w > width - 8 || box.y < 12 || box.y + h > height - 35 || occupied.some(b => box.x < b.x + b.w + 4 && box.x + w + 4 > b.x && box.y < b.y + b.h + 4 && box.y + h + 4 > b.y)) continue;
        occupied.push(box); return { x: lx, y: ly, anchor, leader: Math.abs(dy) > 25 };
      }
      return null;
    }
    const selectedProfile = list.find(p => p.id === selected), nearest = selectedProfile ? reference(selectedProfile) : '';
    const nearestCity = c => nearest.includes(` of ${c.name} ·`);
    const cities = arr(geo.cities).filter(c => visible(point(c.lng, c.lat), 25) && (expanded || c.priority <= 1 || nearestCity(c))).sort((a, b) => Number(nearestCity(b)) - Number(nearestCity(a))).map(c => {
      const [x, y] = point(c.lng, c.lat), left = /Philadelphia|Baltimore|New York|Washington/.test(c.name), label = !expanded && c.name === 'New York City' ? 'New York' : c.name;
      const placed = placeLabel(x, y, label, expanded ? 15 : 12, left);
      return `<g class="sl-city"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>${placed ? `${placed.leader ? `<path class="sl-label-leader" d="M${x.toFixed(1)},${y.toFixed(1)}L${placed.x.toFixed(1)},${(placed.y-7).toFixed(1)}"/>` : ''}<text text-anchor="${placed.anchor}" x="${placed.x.toFixed(1)}" y="${placed.y.toFixed(1)}">${esc(label)}</text>` : `<title>${esc(label)}</title>`}</g>`;
    }).join('');
    // Text anchors are cartographic label positions, never alternate site points.
    const anchors = { NY: { lng: -75.1, lat: 42.24 }, NJ: { lng: -74.45, lat: 39.7 }, DE: { lng: -75.49, lat: 38.7 }, MD: { lng: -76.6, lat: 39.0 } };
    const stateLabels = arr(geo.states).filter(s => s.label && s.id !== 'DC').map(s => {
      const anchor = anchors[s.id] || s.label, [x, y] = point(anchor.lng, anchor.lat); if (!visible([x, y], 25)) return '';
      const label = expanded && ['PA','NY'].includes(s.id) ? s.name : s.id, w = label.length * (expanded ? 10 : 9), box = { x: x-w/2, y: y-18, w, h: 22 };
      if (occupied.some(b => box.x < b.x+b.w+3 && box.x+w+3 > b.x && box.y < b.y+b.h+3 && box.y+box.h+3 > b.y)) return '';
      return `<text class="sl-state-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}"><title>${esc(s.name)}</title>${esc(label)}</text>`;
    }).join('');
    const points = list.filter(canPlot).map(p => { const [x, y] = point(p.lng, p.lat), active = p.id === selected; return `<a href="#sites" data-locator-select="${esc(p.id)}" aria-label="Select ${esc(p.name)}, ${esc(p.location)}" class="sl-pin${active ? ' selected' : ''}"><title>${esc(p.name)} · ${esc(p.location)}</title><circle class="sl-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="23"/><circle class="sl-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="19"/><circle class="sl-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12"/><text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}">${number(p, list)}</text></a>`; }).join('');
    const miles = expanded && zoom > 2 ? 20 : 50, bar = miles / (69.172 * Math.cos(40.5 * rad)) * scale;
    return `<svg class="sl-map" viewBox="0 0 ${width} ${height}" role="group" aria-label="Site locator: Mid-Atlantic United States, with state boundaries and reference cities"${expanded ? ' tabindex="0" aria-describedby="sl-map-help"' : ''}>${material}<rect class="sl-water" fill="url(#sl-graphite-${finish})" width="${width}" height="${height}"/>${states}${stateLabels}${cities}${points}<g class="sl-compass" transform="translate(${width - 24} 22)"><text text-anchor="middle" y="0">N</text><path d="M0 9V30 M-4 15L0 9 4 15"/></g><g class="sl-scale" transform="translate(20 ${height - 23})"><path d="M0 -5V0H${bar.toFixed(1)}V-5"/><text y="15">${miles} mi · approximate</text></g></svg>`;
  }
  function mapUrl(p) {
    if (window.ProtonSiteVisuals) return window.ProtonSiteVisuals.mapUrl(p);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.id === 'SIM-734' ? '2350 Marriottsville Road, Marriottsville, MD 21104' : canPlot(p) ? p.lat + ',' + p.lng : p.name + ', ' + p.location)}`;
  }
  function count(list) { const mapped = list.filter(canPlot).length; return `${mapped} mapped${mapped < list.length ? ` · ${list.length - mapped} location pending` : ''}`; }
  function caption(list) { return `Approximate catalog points · not property boundaries.${list.some(p => p.id === 'SIM-734') ? ' Alpha Ridge omitted: catalog location rejected during image review.' : ''}`; }
  function render(list, selected) {
    const p = list.find(p => p.id === selected), ready = arr(geography().states).length;
    return `<section class="sl-widget" aria-label="Site locator"><div class="sl-widget-head"><div><strong>Site locator</strong><small>Mid-Atlantic · United States</small></div><button type="button" class="sl-expand" data-locator-expand aria-haspopup="dialog" aria-controls="siteLocatorDialog" aria-label="Expand site locator"><span aria-hidden="true">⛶</span> Expand</button></div>${ready ? svg(list, selected, false) : '<p class="sl-unavailable">Regional map unavailable. Site locations and address links remain below.</p>'}<div class="sl-widget-bottom">${p ? `<strong><span class="sl-number">${number(p, list)}</span> ${esc(p.location)}</strong><p>${esc(reference(p))}</p>` : ''}<small>${count(list)}</small><details><summary>Map accuracy</summary><p>${esc(caption(list))}</p></details></div></section>`;
  }
  function refreshMap() {
    if (!dialog?.open) return;
    const state = getState(), ready = arr(geography().states).length;
    dialog.querySelector('.sl-map-stage').innerHTML = ready ? svg(state.sites, state.selected, true) : '<div class="sl-unavailable"><h3>Regional map unavailable</h3><p>Use the site list and address links while geographic data is unavailable.</p></div>';
    dialog.querySelector('[data-locator-zoom="in"]').disabled = !ready || zoom >= 6;
    dialog.querySelector('[data-locator-zoom="out"]').disabled = !ready || zoom <= 1;
    dialog.querySelector('[data-locator-reset]').disabled = !ready;
  }
  function paintSelection() {
    const { sites, selected } = getState(), p = sites.find(p => p.id === selected);
    dialog.querySelector('#sl-count').textContent = count(sites);
    dialog.querySelector('.sl-site-choices').innerHTML = sites.map(p => `<button type="button" class="sl-choice${p.id === selected ? ' selected' : ''}" data-locator-select="${esc(p.id)}" aria-pressed="${p.id === selected}"><span class="sl-number${canPlot(p) ? '' : ' pending'}">${number(p, sites)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.location)}${canPlot(p) ? '' : ' · location pending'}</small></span></button>`).join('');
    dialog.querySelector('.sl-selected-site').innerHTML = p ? `<span class="sl-eyebrow">SELECTED SITE</span><h3>${esc(p.name)}</h3><p>${esc(p.location)}</p><p class="sl-reference">${esc(reference(p))}</p>${!canPlot(p) ? '<p class="sl-pending-note">Pin withheld until its location is verified.</p>' : ''}<button type="button" class="button primary small" data-locator-review="${esc(p.id)}">View site details →</button><a class="sl-external" href="${esc(mapUrl(p))}" target="_blank" rel="noopener noreferrer">${canPlot(p) ? 'Open in Google Maps' : p.id === 'SIM-734' ? 'Open official address' : 'Search location'} ↗</a>` : '';
    dialog.querySelector('.sl-accuracy').textContent = caption(sites);
    refreshMap();
  }
  function close(review) {
    if (!dialog?.open) return;
    dialog.close(); document.body.classList.remove('sl-map-open');
    if (review) { document.getElementById('siteDetail')?.focus({ preventScroll: true }); document.getElementById('siteDetail')?.scrollIntoView({ block: 'start', behavior: 'auto' }); }
    else (document.querySelector('[data-locator-expand]') || returnFocus)?.focus({ preventScroll: true });
  }
  function changeZoom(next) { zoom = Math.max(1, Math.min(6, next)); if (zoom === 1) pan = { x: 0, y: 0 }; refreshMap(); }
  function open(button) {
    returnFocus = button; zoom = 1; pan = { x: 0, y: 0 };
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'siteLocatorDialog'; dialog.className = 'sl-dialog'; dialog.setAttribute('aria-labelledby', 'sl-title');
      dialog.innerHTML = `<header class="sl-dialog-head"><div><span class="sl-eyebrow">MID-ATLANTIC · UNITED STATES</span><h2 id="sl-title">Site locator <span id="sl-count"></span></h2></div><button type="button" class="icon-button" data-locator-close aria-label="Close expanded site locator">×</button></header><div class="sl-layout"><div class="sl-map-area"><div class="sl-map-controls" aria-label="Map controls"><button type="button" data-locator-zoom="in" aria-label="Zoom in">+</button><button type="button" data-locator-zoom="out" aria-label="Zoom out">−</button><button type="button" data-locator-reset>Reset view</button></div><div class="sl-map-stage"></div><p id="sl-map-help">Drag to pan · use + / − to zoom · arrow keys move the map</p></div><aside class="sl-map-sidebar"><div class="sl-site-choices" aria-label="Sites on the map"></div><div class="sl-selected-site" aria-live="polite"></div></aside></div><footer class="sl-dialog-foot"><p class="sl-accuracy"></p><span>U.S. Census Bureau: <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html" target="_blank" rel="noopener noreferrer">State boundaries ↗</a> · <a href="https://tigerweb.geo.census.gov/tigerweb/" target="_blank" rel="noopener noreferrer">City reference points ↗</a></span></footer>`;
      document.body.appendChild(dialog);
      dialog.addEventListener('cancel', e => { e.preventDefault(); close(false); });
      dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(false); } });
      const stage = dialog.querySelector('.sl-map-stage');
      stage.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('[data-locator-select]')) return;
        const el = stage.querySelector('svg'); if (!el) return;
        const r = el.getBoundingClientRect(); drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, factor: Math.max(el.viewBox.baseVal.width / r.width, el.viewBox.baseVal.height / r.height) };
        stage.setPointerCapture(e.pointerId); stage.classList.add('is-dragging');
      });
      stage.addEventListener('pointermove', e => {
        if (!drag || drag.pointer !== e.pointerId) return;
        pan.x += (e.clientX - drag.x) * drag.factor; pan.y += (e.clientY - drag.y) * drag.factor; drag.x = e.clientX; drag.y = e.clientY;
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) ignoreClick = true;
        if (!frame) frame = requestAnimationFrame(() => { frame = null; refreshMap(); });
      });
      const stop = () => { drag = null; stage.classList.remove('is-dragging'); setTimeout(() => { ignoreClick = false; }, 0); };
      stage.addEventListener('pointerup', stop); stage.addEventListener('pointercancel', stop); stage.addEventListener('lostpointercapture', stop);
      stage.addEventListener('keydown', e => {
        if (e.target.closest('[data-locator-select]')) return;
        if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) {
          e.preventDefault();
          if (e.key === '+' || e.key === '=') changeZoom(zoom * 1.4);
          else if (e.key === '-') changeZoom(zoom / 1.4);
          else if (e.key === 'Home') { pan = { x: 0, y: 0 }; changeZoom(1); }
          else { pan.x += e.key === 'ArrowLeft' ? 60 : e.key === 'ArrowRight' ? -60 : 0; pan.y += e.key === 'ArrowUp' ? 60 : e.key === 'ArrowDown' ? -60 : 0; refreshMap(); }
          stage.querySelector('svg')?.focus({ preventScroll: true });
        }
      });
      window.addEventListener('resize', () => { if (dialog.open) { pan = { x: 0, y: 0 }; refreshMap(); } });
    }
    dialog.showModal(); document.body.classList.add('sl-map-open'); paintSelection();
  }
  function bind(root, state, select, profiles) {
    getState = state; selectSite = select; ids = profiles.map(p => p.id);
    document.addEventListener('click', event => {
      const expand = event.target.closest('[data-locator-expand]'); if (expand) { open(expand); return; }
      const pin = event.target.closest('[data-locator-select]');
      if (pin) { event.preventDefault(); if (ignoreClick) return; const id = pin.dataset.locatorSelect; if (!getState().sites.some(p => p.id === id)) return; selectSite(id); if (dialog?.open) { paintSelection(); dialog.querySelector(`.sl-choice[data-locator-select="${id}"]`)?.focus({ preventScroll: true }); } else document.querySelector(`#locator [data-locator-select="${id}"]`)?.focus({ preventScroll: true }); return; }
      if (event.target.closest('[data-locator-close]')) { close(false); return; }
      const review = event.target.closest('[data-locator-review]'); if (review) { close(true); return; }
      const z = event.target.closest('[data-locator-zoom]'); if (z) { changeZoom(zoom * (z.dataset.locatorZoom === 'in' ? 1.4 : 1 / 1.4)); return; }
      if (event.target.closest('[data-locator-reset]')) { pan = { x: 0, y: 0 }; changeZoom(1); }
    });
  }
  window.ProtonSiteLocator = Object.freeze({ render, bind, canPlot, reference });
})();
