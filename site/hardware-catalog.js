/* A hosting enquiry carries the exact catalogue variant, never a guessed legacy cart match. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.HardwareHosting = api; api.mount(document, root); }
}(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const coolingNames = {air: 'Air-cooled', hydro: 'Hydro-cooled', immersion: 'Immersion'};
  const ownershipNames = {owned: 'I already own these miners', needed: 'I need miners for hosting', undecided: 'Still deciding'};
  const format = value => new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(value);
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

  function planFor(selection, quantity, ownership, manualModel, facility) {
    const count = Number(quantity);
    const validQuantity = String(quantity).trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 100000;
    const variant = selection && selection.variant;
    const family = selection && selection.family;
    const manual = String(manualModel || '').trim().slice(0, 240);
    const model = manual || (variant && variant.name) || '';
    const hashrate = !manual && variant && positive(variant.hashrateTH) && validQuantity ? variant.hashrateTH * count : null;
    const kw = !manual && variant && positive(variant.powerW) && validQuantity ? variant.powerW * count / 1000 : null;
    const cooling = !manual && family ? coolingNames[family.cooling] || 'To confirm' : 'To confirm';
    const lines = [
      'Hosting enquiry',
      'Miner: ' + (model || 'Choose a model above or enter your own.'),
      ...(!manual && variant ? ['Catalogue variant: ' + variant.id] : []),
      'Quantity: ' + (validQuantity ? format(count) : 'Enter a whole number from 1 to 100,000.'),
      'Machines: ' + (ownershipNames[ownership] || ownershipNames.undecided),
      'Rated fleet hashrate: ' + (hashrate === null ? 'To confirm' : format(hashrate) + ' TH/s'),
      'Rated miner power: ' + (kw === null ? 'To confirm' : format(kw) + ' kW'),
      'Cooling: ' + cooling,
      ...(facility ? ['Preferred region: ' + facility.name + (facility.region ? ' (' + facility.region + ')' : '')] : []),
      'Site availability, cooling compatibility, electrical requirements and hosting terms need confirmation. Miner power excludes facility cooling and other overhead.'
    ];
    return {valid: Boolean(model) && validQuantity, model, count: validQuantity ? count : null, hashrateTH: hashrate, kw, cooling, text: lines.join('\n')};
  }

  function mount(doc, win) {
    const el = id => doc.getElementById(id);
    const form = el('hwHostingForm');
    if (!form) return null;
    const model = el('hwHostingModel'), quantity = el('hwHostingQuantity'), ownership = el('hwHostingOwnership');
    const manual = el('hwHostingManual'), other = el('hwHostingOtherModel'), otherWrap = el('hwHostingOther');
    let selection = null;
    let facility = null;
    try { facility = win.Facilities && win.Facilities.chosen(); } catch (_) { /* Region is optional. */ }

    function currentPlan() {
      return planFor(manual.checked ? null : selection, quantity.value, ownership.value, manual.checked ? other.value : '', facility);
    }
    function render() {
      otherWrap.hidden = !manual.checked;
      other.disabled = !manual.checked;
      other.required = manual.checked;
      model.disabled = manual.checked;
      model.value = manual.checked ? '' : selection ? selection.variant.name : '';
      const plan = currentPlan();
      el('hwHostingSummary').textContent = plan.text.split('\n').filter(line => !line.startsWith('Catalogue variant:')).join('\n');
      el('hwHostingConfiguration').value = plan.text;
      quantity.setCustomValidity(plan.count === null ? 'Enter a whole number from 1 to 100,000.' : '');
      const status = el('hwHostingCopyStatus'); if (status) status.textContent = '';
      return plan;
    }
    function choose(detail) {
      if (!detail || !detail.variant || !detail.family) return;
      selection = detail;
      manual.checked = false;
      render();
      /* Only an explicit catalogue CTA changes the enquiry; browsing alone cannot replace it. */
      quantity.focus({preventScroll: true});
    }
    win.addEventListener('hardware:choose-miner', event => choose(event.detail));
    const haveMiners = el('hwHaveMiners');
    if (haveMiners) haveMiners.addEventListener('click', () => {
      ownership.value = 'owned';
      manual.checked = true;
      render();
      other.focus({preventScroll: true});
    });
    [quantity, ownership, manual, other].forEach(input => input.addEventListener(input === quantity || input === other ? 'input' : 'change', render));
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const plan = render();
      if (!plan.valid) {
        if (!plan.model) {
          manual.checked = true;
          render();
          other.focus();
        }
        form.reportValidity();
        return;
      }
      if (!form.reportValidity()) return;
      const contact = contactLines();
      win.location.href = 'mailto:hosting@protonminingco.com?subject=' + encodeURIComponent('Hosting enquiry via protonminingco.com') +
        '&body=' + encodeURIComponent(plan.text + '\n\n' + contact.join('\n') + '\n\n— From protonminingco.com');
    }, true);
    const slot = el('hwHostingFacility');
    if (slot && win.Facilities) {
      win.Facilities.all().forEach(site => {
        const option = doc.createElement('option');
        option.value = site.id;
        option.textContent = site.name + ' · ' + site.region;
        slot.append(option);
      });
      slot.value = facility ? facility.id : '';
      slot.addEventListener('change', () => {
        facility = win.Facilities.byId(slot.value);
        render();
      });
    }
    const copy = el('hwHostingCopy');
    function contactLines() {
      return [...form.querySelectorAll('input[name],textarea[name]')]
        .filter(input => !input.disabled && ['name', 'email', 'company', 'notes'].includes(input.name) && input.value.trim())
        .map(input => input.name + ': ' + input.value.trim());
    }
    if (copy) copy.addEventListener('click', async () => {
      const plan = render(), status = el('hwHostingCopyStatus');
      if (!plan.valid) {
        if (status) status.textContent = 'Choose a miner and enter a valid quantity first.';
        return;
      }
      const contact = contactLines();
      try {
        await win.navigator.clipboard.writeText(plan.text + '\n\n' + contact.join('\n'));
        if (status) status.textContent = 'Enquiry copied. Email it to hosting@protonminingco.com.';
      } catch (_) {
        const range = doc.createRange(); range.selectNodeContents(el('hwHostingSummary'));
        const selected = win.getSelection(); selected.removeAllRanges(); selected.addRange(range);
        if (status) status.textContent = 'Copy the selected summary and email hosting@protonminingco.com.';
      }
    });
    render();
    const submit = el('hwHostingSubmit'); if (submit) submit.disabled = false;
    if (copy) copy.hidden = false;
    return {choose, currentPlan};
  }
  return {planFor, mount};
}));
