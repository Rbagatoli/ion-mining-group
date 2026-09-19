/* The 3D catalogue replaces the model table; the existing order and checkout stay in charge. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.HardwareCatalogOrder = api; api.mount(document, root); }
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function validQuantity(value) {
    const count = Number(value);
    return String(value).trim() !== '' && Number.isInteger(count) && count > 0 && count <= 100000 ? count : null;
  }
  function mount(doc, win) {
    const el = id => doc.getElementById(id);
    const quantity = el('hwCatalogQuantity'), button = el('brCatalogRequest');
    if (!quantity || !button || !win.Cart || !win.HardwareOrderCatalog) return null;
    let selected = win.BrokerageCatalogSelection;
    function priceNote() {
      const target = el('hwCatalogPriceNote');
      if (!target || !selected) return;
      const key = win.HardwareOrderCatalog.keyForVariant(selected.variant.id);
      const price = key && !key.startsWith('catalogue:') && win.PriceList ? win.PriceList.priceFor(key) : null;
      target.textContent = price === null
        ? 'Add this exact configuration to review hosting and energy costs at checkout. Hardware price needs a confirmed quote.'
        : 'Order estimate: ' + new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(price) +
          ' / machine · indicative as of ' + win.PriceList.ASOF + '. The public market reference above is separate; your final price is confirmed on quote.';
    }
    function syncCheckout() {
      const chosen = win.Facilities && win.Facilities.chosen();
      const href = './cart.html' + (chosen ? '?site=' + encodeURIComponent(chosen.id) : '');
      ['hwCheckout', 'hwCatalogCheckout'].forEach(id => {
        const link = el(id); if (link) { link.href = href; link.hidden = win.Cart.isEmpty(); }
      });
    }
    win.addEventListener('brokerage:model', event => { selected = event.detail; priceNote(); });
    win.addEventListener('hardware:choose-miner', event => {
      const detail = event.detail;
      const count = validQuantity(quantity.value);
      quantity.setCustomValidity(count === null ? 'Enter a whole number from 1 to 100,000.' : '');
      if (!quantity.reportValidity() || count === null || !detail || !detail.variant) return;
      const key = win.HardwareOrderCatalog.keyForVariant(detail.variant.id);
      if (!key) return;
      win.Cart.add(key, count);
      const status = el('hwCatalogAdded');
      if (status) status.textContent = 'Added ' + count.toLocaleString('en-US') + ' × ' + detail.variant.name + '. Your order is ready to review at checkout.';
      syncCheckout();
    });
    quantity.addEventListener('input', () => quantity.setCustomValidity(''));
    const siteChoice = el('hwSiteChoice');
    if (siteChoice && win.Facilities) {
      win.Facilities.all().forEach(site => {
        const option = doc.createElement('option'); option.value = site.id;
        option.textContent = site.name + ' · ' + site.region;
        siteChoice.append(option);
      });
      const chosen = win.Facilities.chosen(); siteChoice.value = chosen ? chosen.id : '';
      siteChoice.addEventListener('change', () => {
        const site = win.Facilities.byId(siteChoice.value);
        // The URL takes precedence in Facilities.chosen; keep it aligned with this explicit choice.
        const url = new URL(win.location.href);
        if (site) url.searchParams.set('site', site.id); else url.searchParams.delete('site');
        win.history.replaceState(null, '', url.pathname + url.search + url.hash);
        win.Facilities.choose(site ? site.id : null);
        win.dispatchEvent(new win.CustomEvent('hardware:site-change'));
        syncCheckout();
      });
    }
    win.Cart.onChange(syncCheckout);
    priceNote(); syncCheckout();
    return {syncCheckout};
  }
  return {validQuantity, mount};
}));
