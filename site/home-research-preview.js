/* User-controlled examples of the questions a site research brief can answer. */
(function () {
  'use strict';

  const examples = {
    landfill: {
      title: 'Landfill gas',
      overview: [
        ['Already in place', 'Gas collection and an operating site.'],
        ['Remaining work', 'Confirm gas quality, treatment and generation.'],
        ['Energy access', 'Verify usable flow, uptime and gas rights.'],
        ['Next conversation', 'Site operator, gas-rights holder and developer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review collection wells, headers and site access.'],
        ['Work to scope', 'Gas treatment, generators and electrical works.'],
        ['Evidence needed', 'Flow records, gas assays and equipment condition.'],
        ['Reuse potential', 'Confirm ownership, capacity and permission to use.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Gas cleanup, generation, connection and civil works.'],
        ['Commercial terms', 'Gas rights, operating duties and equipment ownership.'],
        ['Before investing', 'Validate gas supply and obtain project quotes.']
      ],
      contacts: [
        ['Site operator', 'Confirm access, site records and operating limits.'],
        ['Gas-rights holder', 'Establish who can sell or use the gas.'],
        ['Technical partners', 'Scope gas treatment, generation and connection.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    flare: {
      title: 'Flare gas',
      overview: [
        ['Already in place', 'An oilfield gas stream and flare system.'],
        ['Remaining work', 'Check gas treatment, generation and site access.'],
        ['Energy access', 'Verify gas rights, flow variability and field life.'],
        ['Next conversation', 'Field operator, gas-rights holder and developer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review gas gathering, flare equipment and access.'],
        ['Work to scope', 'Gas conditioning, engines and electrical works.'],
        ['Evidence needed', 'Gas assays, flow history and production forecasts.'],
        ['Reuse potential', 'Confirm gas routing and equipment ownership.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Gas conditioning, generation and connection works.'],
        ['Commercial terms', 'Gas purchase, operating duties and relocation rights.'],
        ['Before investing', 'Validate supply duration and obtain project quotes.']
      ],
      contacts: [
        ['Field operator', 'Check production plans, access and site constraints.'],
        ['Gas-rights holder', 'Establish control of the gas and supply terms.'],
        ['Technical partners', 'Scope conditioning, generation and gas routing.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    industrial: {
      title: 'Industrial surplus',
      overview: [
        ['Already in place', 'An industrial operation and electrical infrastructure.'],
        ['Remaining work', 'Check spare capacity, service rights and usable space.'],
        ['Energy access', 'Verify surplus timing, tariff terms and load priority.'],
        ['Next conversation', 'Industrial operator, utility and electrical engineer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review transformers, switchgear and the building.'],
        ['Work to scope', 'Electrical fit-out, cooling and site preparation.'],
        ['Evidence needed', 'Service records, drawings and equipment inspections.'],
        ['Reuse potential', 'Confirm spare capacity and rights to the equipment.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Electrical upgrades, fit-out, cooling and civil works.'],
        ['Commercial terms', 'Power allocation, curtailment and upgrade costs.'],
        ['Before investing', 'Confirm spare capacity and obtain upgrade quotes.']
      ],
      contacts: [
        ['Industrial operator', 'Confirm surplus capacity, access and load priority.'],
        ['Utility contact', 'Check service capacity, tariff and upgrade process.'],
        ['Electrical engineer', 'Assess equipment condition and connection work.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    hydro: {
      title: 'Operating hydro',
      overview: [
        ['Already in place', 'An operating hydro asset and site connection.'],
        ['Remaining work', 'Assess output history, spare capacity and added load.'],
        ['Energy access', 'Review seasonality, water rights and offtake terms.'],
        ['Next conversation', 'Asset owner, plant operator and grid counterparty.']
      ],
      infrastructure: [
        ['Existing assets', 'Review turbines, generators and the site connection.'],
        ['Work to scope', 'Load connection, protection and site preparation.'],
        ['Evidence needed', 'Generation history, maintenance and connection records.'],
        ['Reuse potential', 'Confirm equipment condition and capacity for a load.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Load connection, protection, fit-out and civil works.'],
        ['Commercial terms', 'Power allocation, existing offtake and operating duties.'],
        ['Before investing', 'Model seasonal supply and obtain connection quotes.']
      ],
      contacts: [
        ['Asset owner', 'Establish power allocation and commercial interest.'],
        ['Plant operator', 'Review output, maintenance and operating constraints.'],
        ['Grid counterparty', 'Check connection rights and new-load requirements.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    nuclear: {
      title: 'Nuclear power',
      overview: [
        ['Already in place', 'An operating plant and established grid connection.'],
        ['Remaining work', 'Qualify the supply route and permitted connection.'],
        ['Energy access', 'Check power allocation, outage plans and supply terms.'],
        ['Next conversation', 'Power seller, plant owner and network operator.']
      ],
      infrastructure: [
        ['Existing assets', 'Review the plant connection and nearby network.'],
        ['Work to scope', 'Load connection, metering and electrical protection.'],
        ['Evidence needed', 'Connection studies, site limits and outage schedules.'],
        ['Reuse potential', 'Confirm access and approval for the proposed load.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Connection upgrades, metering and load-side works.'],
        ['Commercial terms', 'Supply contract, outage cover and network charges.'],
        ['Before investing', 'Confirm the supply arrangement and connection costs.']
      ],
      contacts: [
        ['Power seller', 'Establish whether a supply arrangement is available.'],
        ['Plant owner', 'Clarify site access and plant operating constraints.'],
        ['Network operator', 'Check the connection route and study requirements.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    wind: {
      title: 'Wind power',
      overview: [
        ['Already in place', 'Wind turbines and a collection network.'],
        ['Remaining work', 'Assess variable output and load connection needs.'],
        ['Energy access', 'Review wind profile, offtake and backup options.'],
        ['Next conversation', 'Wind asset owner, operator and power buyer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review turbines, collection cables and substation.'],
        ['Work to scope', 'Load connection, controls and any balancing equipment.'],
        ['Evidence needed', 'Output history, curtailment records and site plans.'],
        ['Reuse potential', 'Confirm spare connection capacity and access rights.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Connection, load controls and any balancing option.'],
        ['Commercial terms', 'Output allocation, curtailment and backup supply.'],
        ['Before investing', 'Model variable output and price the connection.']
      ],
      contacts: [
        ['Wind asset owner', 'Establish power allocation and commercial interest.'],
        ['Plant operator', 'Review output variability, outages and access.'],
        ['Power buyer', 'Check existing offtake commitments and flexibility.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    solar: {
      title: 'Solar power',
      overview: [
        ['Already in place', 'Solar panels, inverters and a site connection.'],
        ['Remaining work', 'Assess daytime output and load connection needs.'],
        ['Energy access', 'Review generation timing, offtake and storage options.'],
        ['Next conversation', 'Solar asset owner, operator and power buyer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review panels, inverters and electrical connection.'],
        ['Work to scope', 'Load connection, controls and any storage system.'],
        ['Evidence needed', 'Hourly generation, equipment records and site plans.'],
        ['Reuse potential', 'Confirm connection capacity and available site space.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Connection, load controls and any storage option.'],
        ['Commercial terms', 'Daytime allocation, charging rights and backup supply.'],
        ['Before investing', 'Model operating hours and price the chosen supply mix.']
      ],
      contacts: [
        ['Solar asset owner', 'Confirm output allocation and space for a load.'],
        ['Plant operator', 'Review generation patterns and equipment condition.'],
        ['Power buyer', 'Check existing contracts and uncommitted output.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    },
    grid: {
      title: 'Grid supply',
      overview: [
        ['Already in place', 'A grid-served area and nearby network assets.'],
        ['Remaining work', 'Confirm service feasibility and required upgrades.'],
        ['Energy access', 'Review tariff, capacity and curtailment conditions.'],
        ['Next conversation', 'Utility, property owner and electrical engineer.']
      ],
      infrastructure: [
        ['Existing assets', 'Review nearby lines, substation and site service.'],
        ['Work to scope', 'Utility upgrades, metering and on-site distribution.'],
        ['Evidence needed', 'Service study, site drawings and utility requirements.'],
        ['Reuse potential', 'Confirm network capacity and equipment suitability.']
      ],
      capital: [
        ['Cost status', 'Unpriced — requires diligence.'],
        ['Scope to price', 'Service upgrades, connection and site electrical works.'],
        ['Commercial terms', 'Tariff, demand charges, deposits and curtailment.'],
        ['Before investing', 'Obtain utility terms and a service-cost estimate.']
      ],
      contacts: [
        ['Utility contact', 'Check service capacity, tariff and connection process.'],
        ['Property owner', 'Confirm site control, access and easement requirements.'],
        ['Electrical engineer', 'Scope on-site distribution and load protection.'],
        ['Research output', 'Find business contact routes and questions to ask.']
      ]
    }
  };
  const tabNames = ['overview', 'infrastructure', 'capital', 'contacts'];

  function initialize() {
    const root = document.getElementById('home-research-preview');
    if (!root || root.dataset.researchReady === 'true') return;

    const title = root.querySelector('#research-site-title');
    const label = root.querySelector('#research-source-label');
    const panel = root.querySelector('#research-content');
    const sourceButtons = Array.from(root.querySelectorAll('[data-research-source]'))
      .filter(button => Object.prototype.hasOwnProperty.call(examples, button.dataset.researchSource));
    const tabs = Array.from(root.querySelectorAll('[data-research-tab]'))
      .filter(button => tabNames.includes(button.dataset.researchTab));
    if (!title || !label || !panel || !sourceButtons.length || !tabs.length) return;

    const initialSource = sourceButtons.find(button => button.getAttribute('aria-pressed') === 'true') || sourceButtons[0];
    const initialTab = tabs.find(button => button.getAttribute('aria-selected') === 'true') || tabs[0];
    let source = initialSource.dataset.researchSource;
    let activeTab = initialTab.dataset.researchTab;
    const details = root.querySelector('.research-details');
    const hoverPreference = matchMedia('(hover: hover) and (pointer: fine)');
    const compactLayout = matchMedia('(max-width: 900px)');
    const listeners = [];
    let hoverTimer = 0, hoverButton = null, pointerFocus = null, suspended = false;
    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    }

    const tablist = tabs[0].closest('[role="tablist"]') || tabs[0].parentElement;
    if (tablist && tablist !== root && tabs.every(button => tablist.contains(button))) {
      tablist.setAttribute('role', 'tablist');
      if (!tablist.hasAttribute('aria-label') && !tablist.hasAttribute('aria-labelledby')) {
        tablist.setAttribute('aria-label', 'Site research');
      }
      tablist.setAttribute('aria-orientation', 'horizontal');
    }
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    tabs.forEach(button => {
      button.type = 'button';
      if (!button.id) button.id = 'research-tab-' + button.dataset.researchTab;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panel.id);
    });
    sourceButtons.forEach(button => { button.type = 'button'; });

    function render() {
      const example = examples[source];
      const fragment = document.createDocumentFragment();
      example[activeTab].forEach(([rowLabel, rowValue]) => {
        const row = document.createElement('div');
        row.className = 'research-row';
        const heading = document.createElement('span');
        heading.className = 'research-row-label';
        heading.textContent = rowLabel;
        const value = document.createElement('p');
        value.className = 'research-row-value';
        value.textContent = rowValue;
        row.append(heading, value);
        fragment.append(row);
      });

      title.textContent = example.title;
      label.textContent = 'Illustrative example';
      root.dataset.researchActiveSource = source;
      root.dataset.researchActiveTab = activeTab;
      sourceButtons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.researchSource === source));
      });
      tabs.forEach(button => {
        const selected = button.dataset.researchTab === activeTab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected) panel.setAttribute('aria-labelledby', button.id);
      });
      panel.replaceChildren(fragment);
    }

    function cancelHover() {
      clearTimeout(hoverTimer); hoverTimer = 0; hoverButton = null;
    }
    function sourceButton(target) {
      const button = target?.closest?.('[data-research-source]') || target?.closest?.('[data-globe-source]');
      return button && root.contains(button) ? button : null;
    }
    function sourceID(button) { return button?.dataset.researchSource || button?.dataset.globeSource; }
    // Mobile uses a fixed, readable research area instead of an expanding drawer.
    function syncCompactLayout() {
      if (compactLayout.matches) details?.setAttribute('open', '');
    }
    function activate(button) {
      const nextSource = sourceID(button);
      if (suspended || !Object.hasOwn(examples, nextSource)) return;
      cancelHover();
      if (nextSource !== source) { source = nextSource; render(); }
      details?.setAttribute('open', '');
      document.dispatchEvent(new CustomEvent('proton:discovery-source', {detail:{source}}));
    }
    function pointerOver(event) {
      const button = sourceButton(event.target);
      if (!button || button.contains(event.relatedTarget) || !hoverPreference.matches || event.pointerType === 'touch') return;
      cancelHover();
      hoverButton = button;
      hoverTimer = setTimeout(() => {
        if (hoverButton === button && hoverPreference.matches && !document.hidden) activate(button);
      }, 120);
    }
    function pointerOut(event) {
      const button = sourceButton(event.target);
      if (!button || button.contains(event.relatedTarget)) return;
      if (hoverButton === button) cancelHover();
    }
    listen(root, 'pointerover', pointerOver);
    listen(root, 'pointerout', pointerOut);
    listen(root, 'pointercancel', () => { cancelHover(); pointerFocus = null; });
    listen(root, 'pointerdown', event => { pointerFocus = sourceButton(event.target); cancelHover(); });
    listen(document, 'pointerup', () => { pointerFocus = null; });
    listen(document, 'keydown', () => { pointerFocus = null; }, true);
    listen(root, 'focus', event => {
      const button = sourceButton(event.target);
      if (!button || pointerFocus === button) return;
      activate(button);
    }, true);
    listen(root, 'click', event => {
      const button = sourceButton(event.target);
      if (button) activate(button);
    });
    listen(document, 'visibilitychange', () => { if (document.hidden) cancelHover(); });
    listen(hoverPreference, 'change', cancelHover);
    listen(compactLayout, 'change', syncCompactLayout);
    listen(window, 'pagehide', event => {
      suspended = true; cancelHover();
      if (!event.persisted) listeners.splice(0).forEach(remove => remove());
    });
    listen(window, 'pageshow', () => { suspended = false; });

    tabs.forEach((button, index) => {
      listen(button, 'click', () => {
        activeTab = button.dataset.researchTab;
        render();
      });
      listen(button, 'keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let nextIndex;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        activeTab = tabs[nextIndex].dataset.researchTab;
        render();
        tabs[nextIndex].focus();
      });
    });

    render();
    syncCompactLayout();
    root.dataset.researchReady = 'true';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}());
