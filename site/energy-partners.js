/* Source-specific discussion guide; illustrations never assert a power offer. */
(function () {
  'use strict';
  const groups = {
    hydro: { icon:'hydro', route:'Electricity', intro:'Match a flexible mining load to the output you can actually offer.', checks:['Seasonal generation and existing customer commitments','Net MW at the proposed connection point','Water, land and electricity-sale rights'], assets:'Generation, switchgear, transformers and access may already exist. Confirm condition, spare capacity and permission to connect.' },
    nuclear: { icon:'nuclear', route:'Electricity', intro:'Start with the commercial supply route and an appropriate location for the load.', checks:['Who can offer power and under what arrangement','Existing allocations, outages and backup requirements','Permitted connection, site access and security boundaries'], assets:'Existing generation does not create a right to connect. The delivery point, electrical works and permitted site footprint need separate agreement.' },
    geothermal: { icon:'geothermal', route:'Electricity', intro:'Confirm electrical output and the supply arrangement around the existing plant.', checks:['Net electrical output after plant loads and existing sales','Resource performance, maintenance and expected operating hours','Supply rights, approved connection and any plant upgrades'], assets:'An existing geothermal plant may provide generation and electrical infrastructure. A heat resource alone still needs a feasible, funded conversion route.' },
    renewable: { icon:'renewable', route:'Electricity', intro:'Design around the output profile and the hours when flexible demand adds value.', checks:['Hourly and seasonal generation, including curtailment','Minimum operating needs and acceptable shutdowns','Delivery rights, connection costs and any backup supply'], assets:'Existing generation and electrical equipment may help. Storage or firming adds separate cost and is only included if agreed.' },
    thermal: { icon:'thermal', route:'Electricity', intro:'Compare a potential power allocation with the plant’s obligations and operating costs.', checks:['Net deliverable MW after site loads and existing sales','Operating schedule, fuel costs and outage plans','Supply terms, permitted operation and connection scope'], assets:'Assess the electrical connection and any plant upgrades. A generator rating alone is not spare power or evidence of a low delivered price.' },
    fuel: { icon:'fuel', route:'Fuel + conversion', intro:'Scope the fuel-to-power route before sizing the mining load.', checks:['Resource volume, composition and expected supply life','Existing fuel commitments and authority to sell','Treatment, conversion equipment and permitting needs'], assets:'Collection or handling equipment may be present. Treatment, generation and electrical distribution must be assessed separately; they are not assumed free.' },
    recovered: { icon:'recovered', route:'Conversion + power', intro:'Establish usable electrical output and what conversion equipment is actually in place.', checks:['Waste or recovered-energy profile and competing uses','Existing conversion equipment and net electrical output','Input contracts, operating windows and missing works'], assets:'Waste heat or a waste stream is not ready-to-use electricity. Confirm conversion feasibility and price any additional equipment before crediting infrastructure.' },
    industrial: { icon:'industrial', route:'Electricity', intro:'Use the headroom that the owner can make available without disrupting the main operation.', checks:['Site load profile and unused capacity over time','Tariff, resale or supply restrictions and owner approval','Electrical condition, metering, access and noise limits'], assets:'Buildings, pads and electrical infrastructure can be useful starting points. Check usable capacity and connection rights before assuming savings.' },
    grid: { icon:'grid', route:'Delivered electricity', intro:'Assess the full cost and conditions of serving a new mining load.', checks:['Utility or supplier confirmation of service capacity','Energy, demand, connection and other applicable charges','Studies, upgrades, curtailment terms and energization timing'], assets:'An existing grid connection is a lead, not a capacity reservation. Confirm the approved load, upgrade scope and responsibility for the bill.' }
  };
  const sources = [
    ['landfill_gas','Landfill gas','fuel'],['flare_gas','Flare gas','fuel'],['hydro','Hydro','hydro'],['grid_supply','Grid supply','grid'],
    ['nuclear','Nuclear','nuclear'],['wind','Wind','renewable'],['solar','Solar','renewable'],['geothermal','Geothermal','geothermal'],['natural_gas','Natural gas generation','thermal'],
    ['biomass_biogas','Biomass / biogas','fuel'],['waste_to_energy','Waste-to-energy','recovered'],['marine','Marine / tidal / wave','renewable'],
    ['recovered_energy','Recovered energy / waste heat','recovered'],['coal','Coal generation','thermal'],['oil','Oil generation','thermal'],
    ['industrial_surplus','Industrial surplus','industrial']
  ].map(([id,label,group])=>({id,label,...groups[group],icon:({solar:'solar',marine:'marine',geothermal:'geothermal'})[id] || groups[group].icon}));
  if (typeof module !== 'undefined' && module.exports) module.exports = { sources };
  if (typeof window !== 'undefined') window.ProtonEnergySourceGuide = { sources };
  if (typeof document === 'undefined') return;
  const root = document.getElementById('partnerExplorer'), select = document.getElementById('partnerSource'), field = document.getElementById('s-type');
  if (!root || !select || !field) return;
  const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = {
    hydro:'<path d="M23 68V30h19l12 38M30 43h15M32 54h17M65 26v30m-8-8 8 8 8-8M18 77q10-7 20 0t20 0t20 0"/>',
    nuclear:'<ellipse cx="50" cy="50" rx="35" ry="13"/><ellipse cx="50" cy="50" rx="35" ry="13" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="35" ry="13" transform="rotate(120 50 50)"/><circle cx="50" cy="50" r="5"/>',
    renewable:'<path d="M50 40v41M50 40l-5-28 9 2-4 26M50 40l27 11-6 7-21-18M50 40 29 60l-4-8 25-12M32 82h36"/><circle cx="50" cy="40" r="5"/>',
    solar:'<path d="m24 46-9 28h66l-9-28ZM40 46l-3 28m22-28 3 28M20 60h57M42 74v10m16-10v10M33 84h34M65 12v6m0 20v5M48 28h5m24 0h6M53 16l4 4m16 16 4 4m0-24-4 4"/><circle cx="65" cy="28" r="10"/>',
    marine:'<path d="M15 37q9-10 18 0t18 0t18 0t18 0M15 54q9-10 18 0t18 0t18 0t18 0M15 71q9-10 18 0t18 0t18 0t18 0"/>',
    geothermal:'<path d="M16 67h68M26 80h48M50 67V37m-9 9 9-9 9 9M26 56c-12-11 12-16 0-29M73 56c-12-11 12-16 0-29M50 26c-9-9 9-12 0-22"/>',
    thermal:'<path d="M20 77h62V43H57V31H29v46M65 43V23h8v20M36 44h12m-12 12h12m-12 12h12M63 56h10m-10 12h10"/>',
    fuel:'<path d="M50 14c4 19 22 23 22 43 0 14-10 24-23 24S26 72 26 58c0-12 7-19 13-27 0 10 1 15 6 19 6-9 8-21 5-36Z"/><path d="M50 58c10 12 10 23 0 23s-11-10 0-23Z"/>',
    recovered:'<path d="M25 41a28 28 0 0 1 46-12l6 7M77 20v16H61M75 60a28 28 0 0 1-46 12l-6-7M23 81V65h16M53 32 41 53h15L47 70"/>',
    industrial:'<path d="M17 78V45l23-12v12l24-12v20h18v25ZM72 53V23h8v30M29 58v8m12-8v8m12-8v8m13-8v8"/>',
    grid:'<path d="m50 13-19 69m19-69 19 69M36 33h28M30 47h40M24 60h52M42 42l19 28M58 42 39 70M23 33h54M16 47h68"/>'
  };
  function paint() {
    const source = sources.find(s=>s.id===select.value) || sources[0];
    select.value = source.id;
    root.querySelectorAll('[data-partner-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.partnerSource===source.id)));
    root.querySelector('#partnerRoute').innerHTML = `<div class="partner-route-source"><svg viewBox="0 0 100 100" aria-hidden="true">${icons[source.icon]}</svg><span>${esc(source.label)}</span></div><span class="partner-flow" aria-hidden="true"></span><div class="partner-route-step"><span class="partner-step-symbol" aria-hidden="true">↯</span><strong>${source.route.includes('conversion') || source.route.includes('Conversion') ? 'Conversion & connection' : 'Agreed connection'}</strong><small>Metering · protection · distribution</small></div><span class="partner-flow" aria-hidden="true"></span><div class="partner-route-step"><span class="partner-step-symbol partner-bitcoin" aria-hidden="true">₿</span><strong>Flexible mining load</strong><small>Size and operating hours agreed</small></div>`;
    root.querySelector('#partnerSourceTitle').textContent = source.label + ', with a route to demand.';
    root.querySelector('#partnerIntro').textContent = source.intro;
    root.querySelector('#partnerChecks').innerHTML = source.checks.map(text=>`<li>${esc(text)}</li>`).join('');
    root.querySelector('#partnerAssets').textContent = source.assets;
    root.querySelector('#partnerRouteLabel').textContent = source.route;
  }
  select.addEventListener('change',paint);
  root.addEventListener('click',e=>{const b=e.target.closest('[data-partner-source]');if(b){select.value=b.dataset.partnerSource;paint();}});
  root.querySelector('[data-partner-discuss]').addEventListener('click',()=>{field.value=select.value;field.dispatchEvent(new Event('change',{bubbles:true}));});
  select.disabled = false;
  root.querySelectorAll('[data-partner-source]').forEach(button=>{button.disabled = false;});
  paint();
}());
