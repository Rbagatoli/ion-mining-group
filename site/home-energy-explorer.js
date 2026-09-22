/* One journey from a regional globe to an illustrative, animated facility.
   The geography and models explain energy routes, not available inventory. */
(function () {
  'use strict';
  const script = document.currentScript;
  const root = document.getElementById('home-energy-explorer');
  if (!script || !root || root.dataset.explorerReady) return;
  const host = root.querySelector('[data-energy-site]');
  const globeHost = root.querySelector('#home-discovery-globe');
  const layer = root.querySelector('.home-facility-layer');
  const image = host?.querySelector('img');
  const heading = root.querySelector('#home-search-scope');
  const status = root.querySelector('.home-explorer-status');
  const back = root.querySelector('[data-globe-back]');
  if (!host || !globeHost || !layer || !image || !heading || !status || !back) return;
  root.dataset.explorerReady = 'true';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const sources = script.dataset, modules = new Map();
  const sites = {
    landfill: ['gas','buildLandfillScene','Landfill gas: collection wells, a moving refuse truck, gas treatment, generator and transformer.','Landfill gas. New purpose.'],
    flare: ['gas','buildFlareScene','Flare gas: a wellhead, separator, burning flare, generator and transformer.','Flare gas. More potential.'],
    hydro: ['water','buildHydroScene','Hydro: a dam and reservoir feed flowing spillways and a spinning turbine beside the powerhouse.','Hydro. Power in motion.'],
    nuclear: ['water','buildNuclearScene','Nuclear: a containment dome, cooling tower with water vapour, turbine hall and transformer.','Nuclear. Power at scale.'],
    wind: ['renewables','buildWindScene','Wind: three rotating turbines send power through collection cables to a transformer.','Wind. Catch the current.'],
    solar: ['renewables','buildSolarScene','Solar: tracking panel banks connect through inverters and collection cables to a transformer.','Solar. Follow the sun.'],
    industrial: ['industry','buildIndustrialScene','Industrial surplus: a factory, energy recovery equipment, rotating fans and a power branch to a transformer.','Industry. Find the surplus.'],
    grid: ['industry','buildGridScene','Grid supply: a transmission tower connects to a substation with busbars, switchgear and transformers.','Grid. Find your connection.']
  };
  let selected = 'landfill', revision = 0, stage = null, rendered = null;
  let globe = null, disposed = false, suspended = false, visible = false, failed = false;
  let preparation = Promise.resolve(), observer;
  function load(url) {
    if (!modules.has(url)) modules.set(url, import(url));
    return modules.get(url);
  }
  const globeReady = load(sources.globeSrc).then(module => {
    if (disposed) return null;
    globe = module.mountHomeDiscoveryGlobe(globeHost);
    return globe;
  }).catch(() => { globeHost.dataset.renderState = 'fallback'; return null; });
  function current(token) { return !disposed && revision === token; }
  function active() { return visible && !document.hidden && !suspended && !disposed; }
  function syncMotion() {
    stage?.setMotion(!preference.matches);
    stage?.setActive(active() && root.dataset.view === 'facility');
    globe?.setActive(active() && root.dataset.view !== 'facility');
  }
  function view(value) {
    root.dataset.view = value;
    layer.setAttribute('aria-hidden', String(value !== 'facility'));
    syncMotion();
  }
  function fallback() {
    failed = true; stage?.dispose(); stage = null; rendered = null;
    host.dataset.renderState = 'fallback';
  }
  async function prepare(id, token) {
    if (!current(token)) return;
    const item = sites[id], poster = new Image();
    const src = new URL('./assets/visuals/energy-site-' + id + '-960.webp', script.src).href;
    const srcset = src + ' 960w, ' + new URL('./assets/visuals/energy-site-' + id + '-1920.webp', script.src).href + ' 1920w';
    poster.sizes = image.sizes; poster.srcset = srcset; poster.src = src;
    try { await poster.decode(); } catch { /* The descriptive alternative remains useful if the poster fails. */ }
    if (!current(token)) return;
    image.srcset = srcset; image.src = src; image.alt = 'Illustrative miniature. ' + item[2];
    host.dataset.energySite = id;
    if (preference.matches || failed || !window.ResizeObserver) {
      host.dataset.renderState = preference.matches ? 'reduced' : 'fallback';
      return;
    }
    try {
      const [runtime, kit, family] = await Promise.all([
        load(sources.moduleSrc), load(sources.kitSrc), load(sources[item[0] + 'Src'])
      ]);
      if (!current(token)) return;
      host.dataset.renderState = 'loading'; stage?.setActive(false);
      const builder = T => family[item[1]](T, kit.createSiteKit(T));
      if (rendered !== id) {
        if (stage) await stage.setScene(builder, 'discovery');
        else stage = await runtime.mountSourcingScene(host, builder, {kind:'discovery', onError:fallback});
        if (disposed) { stage?.dispose(); stage = null; return; }
        rendered = id;
      }
      if (current(token)) host.dataset.renderState = preference.matches ? 'reduced' : failed ? 'fallback' : 'ready';
    } catch { if (current(token)) fallback(); }
  }
  async function choose(id) {
    if (!Object.hasOwn(sites, id) || disposed) return;
    if (root.dataset.view === 'facility' && selected === id) return;
    const token = ++revision, returning = root.dataset.view !== 'globe';
    selected = id; back.hidden = false;
    heading.textContent = sites[id][3];
    status.textContent = 'Exploring ' + sites[id][3].split('.')[0] + '…';
    root.setAttribute('aria-busy', 'true');
    view('travel');
    // Scene installation is serialized; late downloads can never replace a
    // newer choice or create a second facility WebGL context.
    preparation = preparation.catch(() => {}).then(() => prepare(id, token));
    const journey = (async () => {
      const map = await globeReady;
      if (!current(token) || !map) return;
      map.setActive(active());
      if (returning) await map.reset();
      if (current(token)) await map.flyTo(id);
    })();
    await Promise.allSettled([preparation, journey]);
    if (!current(token)) return;
    root.removeAttribute('aria-busy');
    status.textContent = 'Illustrative facility';
    view('facility');
  }
  async function returnToGlobe() {
    if (disposed) return;
    const token = ++revision;
    root.removeAttribute('aria-busy');
    heading.textContent = 'A world of energy.';
    status.textContent = 'Choose an energy source to step inside.';
    // Return focus to the source, rather than hiding the focused Back button.
    document.querySelector('[data-energy-site-select="' + selected + '"]')?.focus({preventScroll:true});
    back.hidden = true; view('return');
    const map = await globeReady;
    if (!current(token)) return;
    map?.setActive(active());
    await map?.reset();
    if (current(token)) view('globe');
  }
  function sourceChanged(event) { choose(event.detail?.source); }
  function motionChanged() {
    syncMotion();
    if (root.dataset.view !== 'facility') return;
    const token = revision;
    preparation = preparation.catch(() => {}).then(() => prepare(selected, token)).then(() => {
      if (current(token)) syncMotion();
    });
  }
  function pageHide(event) {
    suspended = true; syncMotion();
    if (event.persisted) return;
    disposed = true; ++revision; observer?.disconnect(); stage?.dispose(); globe?.dispose();
    document.removeEventListener('proton:discovery-source', sourceChanged);
    document.removeEventListener('visibilitychange', syncMotion);
    preference.removeEventListener('change', motionChanged);
    back.removeEventListener('click', returnToGlobe);
    window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
  }
  function pageShow() { suspended = false; syncMotion(); }
  document.addEventListener('proton:discovery-source', sourceChanged);
  document.addEventListener('visibilitychange', syncMotion);
  preference.addEventListener('change', motionChanged);
  back.addEventListener('click', returnToGlobe);
  window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
  if (window.IntersectionObserver) {
    observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); syncMotion(); });
    observer.observe(root);
  } else { visible = true; }
})();
