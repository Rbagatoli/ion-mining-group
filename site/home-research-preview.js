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
    powered: {
      title: 'Powered industrial site',
      overview: [
        ['Already in place', 'An industrial site and electrical infrastructure.'],
        ['Remaining work', 'Check service rights, equipment and usable space.'],
        ['Energy access', 'Verify capacity, tariff terms and upgrade needs.'],
        ['Next conversation', 'Property owner, utility and electrical engineer.']
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
        ['Commercial terms', 'Property control, supply terms and network charges.'],
        ['Before investing', 'Confirm utility service and obtain upgrade quotes.']
      ],
      contacts: [
        ['Property owner', 'Confirm site control, access and permitted uses.'],
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

    sourceButtons.forEach(button => {
      button.addEventListener('click', () => {
        const nextSource = button.dataset.researchSource;
        if (nextSource === source) return;
        source = nextSource;
        render();
        document.dispatchEvent(new CustomEvent('proton:discovery-source', { detail: { source } }));
      });
    });

    tabs.forEach((button, index) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.researchTab;
        render();
      });
      button.addEventListener('keydown', event => {
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
    root.dataset.researchReady = 'true';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}());
