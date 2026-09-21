/* Browsing and quote comparison stay local. The catalogue is sourced by brokerage-catalog-data.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BrokerageCatalogUI = api; api.mount(document, root.BrokerageCatalog, root); }
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const coolingNames = {air: 'Air-cooled', hydro: 'Hydro-cooled', immersion: 'Immersion'};
  const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(Number(value)) : '—';
  const money = value => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: Number(value) % 1 ? 2 : 0}).format(Number(value));
  const normalized = value => String(value || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  function matches(text, query) {
    const haystack = normalized(text), tokens = normalized(query).split(' ').filter(Boolean);
    return tokens.every(token => haystack.includes(token));
  }
  function filterFamilies(families, query, cooling) {
    return families.filter(family => cooling === 'all' || !cooling || family.cooling === cooling).map(family => {
      const common = [family.name, family.maker, family.cooling, coolingNames[family.cooling]].join(' ');
      const variants = family.variants.filter(variant => matches(common + ' ' + variant.name + ' ' + variant.hashrateTH + ' TH/s', query));
      return {family, variants};
    }).filter(item => item.variants.length);
  }
  function safeURL(value) {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch (_) { return null; }
  }
  function comparisonText(result) {
    const label = 'Hardware price difference / machine';
    if (result && result.status === 'current' && Number.isFinite(result.usd)) {
      if (result.usd > 0) return {label, value: money(result.usd) + ' lower', detail: 'Than the comparable public asking-price reference. Hardware only.'};
      if (result.usd < 0) return {label, value: money(Math.abs(result.usd)) + ' higher', detail: 'Than the comparable public asking-price reference. Hardware only.'};
      return {label, value: '$0', detail: 'Matches the comparable public asking-price reference. Hardware only.'};
    }
    if (result && result.status === 'stale') return {label, value: 'Refresh price first', detail: 'The market reference needs a fresh check.'};
    if (result && result.status === 'not-comparable') return {label, value: 'No matched comparison', detail: 'Variant, condition and pricing scope must match.'};
    return {label, value: 'Quote required', detail: 'Calculated when a comparable Proton quote is available.'};
  }
  function availabilityText(variant, purpose) {
    if (variant.availability === 'preorder') return 'SHA-256 · Bitcoin · Future batch · availability to confirm';
    if (variant.availability === 'sold-out') return 'SHA-256 · Bitcoin · Listed sold out · availability to confirm';
    return variant.hashrateTH == null ? 'SHA-256 · Bitcoin · Exact hashrate bin to confirm' : purpose === 'hosting' ? 'SHA-256 · Bitcoin' : 'SHA-256 · Bitcoin · New & used sourcing';
  }
  function hostingRequirements(family, variant) {
    const requirements = {
      air: 'Confirm intake airflow, exhaust capacity and site electrical compatibility.',
      hydro: 'Confirm coolant requirements, flow, heat rejection and site electrical compatibility.',
      immersion: 'Confirm an approved immersion fluid, compatible tank and heat rejection system, and site electrical compatibility.'
    };
    const power = variant.powerW != null && Number.isFinite(Number(variant.powerW)) && Number(variant.powerW) > 0
      ? number(variant.powerW) + ' W at the miner; facility cooling and other site loads are additional.'
      : 'Miner power requires confirmation; facility cooling and other site loads are additional.';
    return {label: 'Hosting requirements', value: coolingNames[family.cooling] || 'Compatibility check', detail: (requirements[family.cooling] || 'Confirm site electrical and cooling compatibility for the exact unit.') + ' ' + power};
  }
  function evidenceReferences(variant, market) {
    const result = [], seen = new Set();
    function add(raw, kind) {
      if (!raw) return;
      const source = typeof raw === 'string' ? {url: raw} : raw, href = safeURL(source.url);
      if (!href) return;
      // A specification and its same-URL market listing have different evidence roles.
      // Keep changed price/date/availability/terms observations too, even at the same URL.
      const key = JSON.stringify([kind, href, source.label, source.seller, source.usd, source.condition, source.checkedOn, source.availability, source.note]);
      if (seen.has(key)) return; seen.add(key); result.push({kind, source, href});
    }
    (variant.sources || []).forEach(source => add(source, 'specification'));
    const observations = variant.market && variant.market.observations;
    (observations && observations.length ? observations : market && market.sources || []).forEach(source => add(source, 'listing'));
    return result;
  }
  function mount(doc, catalog, win) {
    const el = id => doc.getElementById(id);
    const section = el('brCatalog');
    if (!section || !catalog || !Array.isArray(catalog.families) || !catalog.families.length) return null;
    const hosting = section.dataset.catalogPurpose === 'hosting';
    const families = catalog.families.filter(family => Array.isArray(family.variants) && family.variants.length);
    if (!families.length) return null;
    const search = el('brCatalogSearch'), cooling = el('brCatalogCooling'), rail = el('brCatalogRail');
    const variants = el('brCatalogVariants'), product = el('brCatalogProduct');
    const prev = el('brCatalogPrev'), next = el('brCatalogNext'), quote = el('brCatalogQuote'), quoteMatch = el('brCatalogQuoteMatch'), quoteCondition = el('brCatalogCondition');
    let filtered = filterFamilies(families, '', 'all');
    let selectedFamily = families.find(family => family.modelKey === 's21-pro' || family.variants.some(variant => variant.id === 's21-pro')) || families[0];
    let selectedVariant = selectedFamily.variants.find(variant => variant.modelKey === 's21-pro' || variant.id === 's21-pro') || selectedFamily.variants[0];
    let touchStart = null;
    function node(tag, text, className) { const item = doc.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; }
    function link(label, url) { const href = safeURL(url); if (!href) return null; const item = node('a', label + ' ↗'); item.href = href; item.target = '_blank'; item.rel = 'noopener noreferrer'; return item; }
    function revealChoice(container, button) {
      win.requestAnimationFrame(() => {
        if (!button.isConnected) return;
        const itemBounds = button.getBoundingClientRect(), bounds = container.getBoundingClientRect();
        if (container.dataset.orientation === 'vertical') {
          if (itemBounds.top < bounds.top) container.scrollTop -= bounds.top - itemBounds.top;
          else if (itemBounds.bottom > bounds.bottom) container.scrollTop += itemBounds.bottom - bounds.bottom;
        } else {
          if (itemBounds.left < bounds.left) container.scrollLeft -= bounds.left - itemBounds.left;
          else if (itemBounds.right > bounds.right) container.scrollLeft += itemBounds.right - bounds.right;
        }
      });
    }
    function resetQuote() { if (quote) quote.value = ''; if (quoteMatch) quoteMatch.checked = false; if (quoteCondition) quoteCondition.value = 'new'; if (el('brCatalogQuoteResult')) el('brCatalogQuoteResult').textContent = ''; }
    function renderSavings() {
      const target = el('brCatalogSavings');
      if (!target) return;
      if (hosting) {
        const presentation = hostingRequirements(selectedFamily, selectedVariant);
        target.replaceChildren(node('p', presentation.label, 'br-catalog-label'), node('p', presentation.value, 'br-catalog-saving'));
        return;
      }
      let result = typeof catalog.savingsFor === 'function' ? catalog.savingsFor(selectedVariant) : {status: 'quote-required'};
      const raw = quote ? quote.value.trim() : '', quoteResult = el('brCatalogQuoteResult');
      if (raw && quoteMatch && quoteMatch.checked && typeof catalog.compareQuote === 'function') {
        const usd = Number(raw);
        if (Number.isFinite(usd) && usd > 0 && usd <= 1000000) {
          result = catalog.compareQuote(selectedVariant, {usd, currency: 'USD', condition: quoteCondition ? quoteCondition.value : 'new', hashrateTH: selectedVariant.hashrateTH, scope: 'hardware-only'});
          if (quoteResult) quoteResult.textContent = result.note || comparisonText(result).detail;
        } else {
          result = {status: 'quote-required'};
          if (quoteResult) quoteResult.textContent = 'Enter a positive per-machine price of up to $1,000,000.';
        }
      } else if (quoteResult) quoteResult.textContent = raw ? 'Confirm the exact variant and hashrate to compare this quote.' : '';
      const presentation = comparisonText(result);
      target.replaceChildren(node('p', presentation.label, 'br-catalog-label'), node('p', presentation.value, 'br-catalog-saving'), node('p', presentation.detail, 'br-catalog-fine'));
    }
    function renderEvidence(market, referenceNote) {
      const target = el('brCatalogEvidence'), list = node('ul');
      target.replaceChildren();
      target.append(node('p', hosting ? 'Published specifications for the selected variant. Confirm the exact unit, electrical requirements and cooling compatibility with the hosting site. Listed miner power excludes facility cooling and other site loads.' : 'Manufacturer-rated specifications for the selected variant. Actual performance depends on operating conditions; confirm exact batch, electrical and cooling requirements before purchase.'));
      if (selectedVariant.specNote) target.append(node('p', selectedVariant.specNote));
      if (selectedFamily.renderNote) target.append(node('p', selectedFamily.renderNote));
      if (selectedVariant.dimensionsMM && selectedVariant.dimensionsMM.length === 3) target.append(node('p', 'Machine dimensions (L × W × H): ' + selectedVariant.dimensionsMM.map(number).join(' × ') + ' mm.'));
      evidenceReferences(selectedVariant, market).forEach(({kind, source, href}) => {
        const fallback = kind === 'specification' ? 'Manufacturer information' : 'Public asking price';
        const label = (kind === 'specification' ? 'Specification · ' : 'Market listing · ') + (source.label || source.seller || source.name || fallback);
        const item = node('li'), anchor = link(label, href);
        if (!anchor) return; item.append(anchor);
        const extras = [source.usd != null ? money(source.usd) : '', source.condition, source.checkedOn ? 'checked ' + source.checkedOn : '', source.availability && source.availability !== 'listed' ? source.availability : ''].filter(Boolean);
        if (extras.length) item.append(node('span', ' · ' + extras.join(' · '), 'br-source-meta'));
        if (source.note) item.append(node('span', ' — ' + source.note, 'br-source-meta'));
        list.append(item);
      });
      if (list.childNodes.length) target.append(list);
      if (hosting) {
        target.append(node('p', hostingRequirements(selectedFamily, selectedVariant).detail));
        target.append(node('p', 'Public hardware reference: ' + referenceNote));
        const count = Number(market.count);
        target.append(node('p', count === 1 ? 'One observed hardware asking-price reference, not a market average or Proton offer.' : count > 1 ? 'The reference uses ' + number(count) + ' observed hardware asking-price listings, not the whole market or a Proton offer.' : 'Public hardware asking prices are reference points, not Proton offers. Confirm the exact variant, condition and current listing.'));
        target.append(node('p', 'Hardware references exclude shipping, taxes, duties and hosting costs. A listing does not confirm stock or compatibility with a hosting site.'));
      } else {
        target.append(node('p', market.note || 'Public asking prices are reference points, not Proton offers. Compare the same variant, condition and pricing scope.'));
        target.append(node('p', 'Market references cover hardware only and exclude shipping, taxes, duties, inspection and sourcing fees. An advertised listing does not confirm available stock. No savings are guaranteed.'));
      }
      target.append(node('p', '3D previews follow public manufacturer references. They are not manufacturer CAD files; exact batch details may vary.'));
    }
    function renderMarket() {
      const market = typeof catalog.marketFor === 'function' ? catalog.marketFor(selectedVariant) : {status: 'unavailable'};
      let value = hosting ? 'Reference unavailable' : 'Quote required', note = 'No current comparable public price confirmed.';
      if (market.status === 'current' && Number.isFinite(market.low) && Number.isFinite(market.high)) {
        value = market.low === market.high ? money(market.low) : money(market.low) + '–' + money(market.high);
        note = 'USD / machine · new hardware' + (market.checkedOn ? ' · checked ' + market.checkedOn : '');
      } else if (market.status === 'stale') { value = 'Price needs refresh'; note = market.checkedOn ? 'Last reference checked ' + market.checkedOn + '.' : hosting ? 'A fresh matching listing needs to be checked.' : 'A fresh matching quote is needed.'; }
      const reference = [node('p', hosting ? 'Public hardware reference · USD / machine' : 'Public market reference', 'br-catalog-label'), node('p', value, 'br-catalog-price')];
      if (!hosting) reference.push(node('p', note, 'br-catalog-fine'));
      el('brCatalogMarket').replaceChildren(...reference);
      renderEvidence(market, note); renderSavings();
    }
    function renderVariants() {
      variants.replaceChildren();
      selectedFamily.variants.forEach(variant => {
        const button = node('button', variant.name + (selectedFamily.variants.filter(item => item.name === variant.name).length > 1 ? ' · ' + number(variant.hashrateTH) + ' TH/s' : ''));
        button.type = 'button'; button.dataset.brCatalogVariant = variant.id; button.setAttribute('aria-pressed', String(variant.id === selectedVariant.id));
        variants.append(button);
        if (variant.id === selectedVariant.id) revealChoice(variants, button);
      });
    }
    function renderNavigation(scrollCurrent) {
      const index = filtered.findIndex(item => item.family.id === selectedFamily.id), total = filtered.length;
      el('brCatalogPosition').textContent = String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
      el('brCatalogPosition').setAttribute('aria-label', selectedFamily.name + ', ' + (index + 1) + ' of ' + total);
      prev.disabled = total < 2; next.disabled = total < 2;
      if (rail) {
        const scrollTop = rail.scrollTop, scrollLeft = rail.scrollLeft;
        rail.replaceChildren();
        filtered.forEach(({family}, position) => {
          const button = node('button', family.name); button.type = 'button'; button.dataset.brCatalogFamily = family.id;
          button.setAttribute('aria-pressed', String(position === index)); button.append(node('span', family.maker + ' · ' + (coolingNames[family.cooling] || family.cooling)));
          rail.append(button);
          if (position === index && scrollCurrent) revealChoice(rail, button);
        });
        // Removing every child can clamp the native scroll offset to zero.
        // Variant-only changes must not jump the family list back to its start.
        rail.scrollTop = scrollTop; rail.scrollLeft = scrollLeft;
      }
    }
    function renderSelection(scrollCurrent) {
      el('brCatalogName').textContent = selectedVariant.name.split(' · ')[0];
      el('brCatalogShown').textContent = 'Shown: ' + selectedFamily.name;
      el('brCatalogMaker').replaceChildren(doc.createTextNode(selectedFamily.maker + ' '), node('span', coolingNames[selectedFamily.cooling] || selectedFamily.cooling));
      el('brCatalogSubtitle').textContent = availabilityText(selectedVariant, hosting ? 'hosting' : 'brokerage');
      const specs = el('brCatalogSpecs'); specs.replaceChildren();
      [['Hashrate', selectedVariant.hashrateTH, 'TH/s'], ['Power', selectedVariant.powerW, 'W'], ['Efficiency', selectedVariant.efficiency, 'J/TH']].forEach(([label, value, unit]) => {
        const known = value != null && value !== '' && Number.isFinite(Number(value));
        const row = node('div'), dd = node('dd', known ? number(value) + ' ' : 'To confirm', known ? '' : 'br-spec-unconfirmed');
        if (known) dd.append(node('small', unit)); row.append(node('dt', label), dd); specs.append(row);
      });
      renderVariants(); renderMarket(); renderNavigation(scrollCurrent);
      const detail = {modelKey: selectedVariant.modelKey || selectedFamily.modelKey, variant: selectedVariant, family: selectedFamily};
      win.BrokerageCatalogSelection = detail;
      win.dispatchEvent(new win.CustomEvent('brokerage:model', {detail}));
    }
    function selectFamily(index, scrollCurrent = true) {
      const target = filtered[index]; if (!target) return;
      selectedFamily = target.family; selectedVariant = target.variants[0]; resetQuote(); renderSelection(scrollCurrent);
      el('brCatalogResults').textContent = filtered.length + ' model ' + (filtered.length === 1 ? 'family' : 'families');
    }
    function applyFilters() {
      filtered = filterFamilies(families, search.value, cooling.value);
      const empty = !filtered.length; el('brCatalogEmpty').hidden = !empty; product.hidden = empty; el('brCatalogNavigation').hidden = empty;
      el('brCatalogResults').textContent = empty ? 'No matching miners' : filtered.length + ' model ' + (filtered.length === 1 ? 'family' : 'families');
      if (empty) {
        if (rail) rail.replaceChildren(); prev.disabled = true; next.disabled = true;
        el('brCatalogPosition').textContent = '00 / 00'; el('brCatalogPosition').setAttribute('aria-label', 'No matching miner families');
        return;
      }
      const current = filtered.find(item => item.family.id === selectedFamily.id);
      if (current) { if (!current.variants.some(variant => variant.id === selectedVariant.id)) { selectedVariant = current.variants[0]; resetQuote(); } renderSelection(true); }
      else selectFamily(0, true);
    }
    function step(direction) {
      if (filtered.length < 2) return;
      const index = filtered.findIndex(item => item.family.id === selectedFamily.id);
      selectFamily((index + direction + filtered.length) % filtered.length);
    }
    search.addEventListener('input', applyFilters); cooling.addEventListener('change', applyFilters);
    el('brCatalogClear').addEventListener('click', () => { search.value = ''; cooling.value = 'all'; applyFilters(); search.focus({preventScroll: true}); });
    prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
    if (rail) {
      rail.addEventListener('click', event => {
        const button = event.target.closest('[data-br-catalog-family]'); if (!button) return;
        selectFamily(filtered.findIndex(item => item.family.id === button.dataset.brCatalogFamily));
        const selectedButton = rail.querySelector('[aria-pressed="true"]'); if (selectedButton) selectedButton.focus({preventScroll: true});
      });
      rail.addEventListener('keydown', event => {
        const button = event.target.closest('[data-br-catalog-family]');
        if (event.altKey || event.ctrlKey || event.metaKey || !button) return;
        const backward = rail.dataset.orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
        const forward = rail.dataset.orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        if (![backward, forward, 'Home', 'End'].includes(event.key) || !filtered.length) return;
        event.preventDefault();
        if (event.key === 'Home') selectFamily(0);
        else if (event.key === 'End') selectFamily(filtered.length - 1);
        else {
          const focused = filtered.findIndex(item => item.family.id === button.dataset?.brCatalogFamily);
          const index = focused < 0 ? filtered.findIndex(item => item.family.id === selectedFamily.id) : focused;
          selectFamily((index + (event.key === forward ? 1 : -1) + filtered.length) % filtered.length);
        }
        const selectedButton = rail.querySelector('[aria-pressed="true"]'); if (selectedButton) selectedButton.focus({preventScroll: true});
      });
    }
    variants.addEventListener('click', event => {
      const button = event.target.closest('[data-br-catalog-variant]'); if (!button) return;
      const variant = selectedFamily.variants.find(item => item.id === button.dataset.brCatalogVariant); if (!variant) return;
      selectedVariant = variant; resetQuote(); renderSelection(false);
      const selectedButton = variants.querySelector('[aria-pressed="true"]'); if (selectedButton) selectedButton.focus({preventScroll: true});
      el('brCatalogResults').textContent = filtered.length + ' model ' + (filtered.length === 1 ? 'family' : 'families');
    });
    /* The model keeps drag-to-rotate. A short horizontal swipe over its details browses families. */
    const info = section.querySelector('.br-catalog-info');
    info.addEventListener('touchstart', event => { touchStart = event.touches.length === 1 && !event.target.closest('button,a,input,select,details') ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null; }, {passive: true});
    info.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x, dy = event.changedTouches[0].clientY - touchStart.y; touchStart = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.7) step(dx < 0 ? 1 : -1);
    }, {passive: true});
    info.addEventListener('touchcancel', () => { touchStart = null; }, {passive: true});
    if (!hosting) [quote, quoteCondition, quoteMatch].filter(Boolean).forEach(input => input.addEventListener(input === quote ? 'input' : 'change', renderSavings));
    el('brCatalogRequest').addEventListener('click', () => {
      if (hosting) {
        win.dispatchEvent(new win.CustomEvent('hardware:choose-miner', {detail: {family: selectedFamily, variant: selectedVariant}}));
        return;
      }
      const form = el('brBriefForm'); if (!form) return;
      const buy = form.querySelector('[name="mode"][value="buy"]'); if (buy) { buy.checked = true; buy.dispatchEvent(new win.Event('change', {bubbles: true})); }
      el('brModel').value = selectedVariant.name;
      el('brVariant').value = selectedVariant.name + ' · ' + number(selectedVariant.hashrateTH) + ' TH/s · ' + (coolingNames[selectedFamily.cooling] || selectedFamily.cooling);
      el('brModel').dispatchEvent(new win.Event('input', {bubbles: true}));
    });
    el('brCatalogTools').hidden = false; el('brCatalogNavigation').hidden = false; if (el('brCatalogCompare')) el('brCatalogCompare').hidden = hosting || typeof catalog.compareQuote !== 'function';
    renderSelection(false); el('brCatalogResults').textContent = filtered.length + ' model ' + (filtered.length === 1 ? 'family' : 'families');
    return {applyFilters, selectFamily, getSelection: () => ({family: selectedFamily, variant: selectedVariant})};
  }
  return {filterFamilies, safeURL, comparisonText, availabilityText, hostingRequirements, evidenceReferences, mount};
}));
