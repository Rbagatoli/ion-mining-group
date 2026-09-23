/* Source choices reveal a facility sculpture beside its research. Geography and
   models illustrate energy routes, not available inventory. */
(function () {
  'use strict';
  const script = document.currentScript;
  const root = document.getElementById('home-energy-explorer');
  if (!script || !root || root.dataset.explorerReady) return;
  const host = root.querySelector('[data-facility-monument]');
  const globeHost = root.querySelector('#home-discovery-globe');
  const layer = root.querySelector('.home-facility-layer');
  const heading = root.querySelector('#home-search-scope');
  const status = root.querySelector('.home-explorer-status');
  const back = root.querySelector('[data-globe-back]');
  const placeholder = host?.querySelector('[data-monument-fallback]');
  if (!host || !globeHost || !layer || !heading || !status || !back) return;
  root.dataset.explorerReady = 'true';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const sources = script.dataset, modules = new Map();
  const sites = {
    landfill: ['Landfill gas', 'Landfill gas. New purpose.'],
    flare: ['Flare gas', 'Flare gas. More potential.'],
    hydro: ['Hydro', 'Hydro. Power in motion.'],
    nuclear: ['Nuclear', 'Nuclear. Power at scale.'],
    wind: ['Wind', 'Wind. Catch the current.'],
    solar: ['Solar', 'Solar. Follow the sun.'],
    industrial: ['Industrial surplus', 'Industry. Find the surplus.'],
    grid: ['Grid supply', 'Grid. Find your connection.']
  };
  let selected = 'landfill', revision = 0, stage = null, mounting = null;
  let globe = null, disposed = false, suspended = false, visible = false, failed = false;
  let generation = 0, observer;
  function load(url) {
    if (!modules.has(url)) modules.set(url, import(url));
    return modules.get(url);
  }
  function current(token) { return !disposed && revision === token; }
  function active() { return visible && !document.hidden && !suspended && !disposed; }
  function syncMotion() {
    stage?.setMotion(!preference.matches);
    stage?.setActive(active() && root.dataset.view === 'facility' && !host.hasAttribute('data-selection-pending'));
    globe?.setActive(active() && root.dataset.view === 'globe');
  }
  function view(value) {
    root.dataset.view = value;
    layer.setAttribute('aria-hidden', String(value !== 'facility'));
    syncMotion();
  }
  function settled() {
    host.removeAttribute('data-selection-pending');
    root.removeAttribute('aria-busy');
    status.textContent = 'Illustrative facility';
    syncMotion();
  }
  function fallback() {
    if (disposed) return;
    failed = true; ++generation;
    stage?.dispose(); stage = null;
    host.dataset.renderState = 'fallback';
    if (placeholder) placeholder.textContent = '3D preview unavailable. Explore the site research alongside.';
    if (root.dataset.view === 'facility') settled();
  }
  load(sources.globeSrc).then(module => {
    if (disposed) return;
    globe = module.mountHomeDiscoveryGlobe(globeHost);
    globe?.select?.(selected);
    syncMotion();
  }).catch(() => { if (!disposed) globeHost.dataset.renderState = 'fallback'; });

  async function prepare(id, token) {
    if (failed) { if (current(token)) settled(); return; }
    try {
      const runtime = await load(sources.monumentSrc);
      if (!current(token)) return;
      if (!stage) {
        if (!mounting) {
          const attempt = ++generation;
          mounting = (async () => {
            const instance = await runtime.mountFacilityMonument(host, {source:id, modelsUrl:sources.monumentModelsSrc, onError:() => {
              if (!disposed && attempt === generation) fallback();
            }});
            if (disposed || failed || attempt !== generation) { instance?.dispose(); return null; }
            if (!instance) throw new Error('Facility renderer unavailable');
            stage = instance;
            syncMotion();
            return instance;
          })().finally(() => { mounting = null; });
        }
        await mounting;
      }
      if (!current(token) || !stage) return;
      // Always request the current source, even when it matches the last frame:
      // an intervening asynchronous swap may still need to be cancelled.
      const installed = await stage.setSource(id);
      if (!current(token)) { syncMotion(); return; }
      if (installed === false) { fallback(); return; }
      if (!current(token)) return;
      host.dataset.monumentSource = id;
      host.dataset.renderState = 'ready';
      settled();
    } catch { if (current(token)) fallback(); }
  }
  function choose(id) {
    if (!Object.hasOwn(sites, id) || disposed) return;
    if (root.dataset.view === 'facility' && selected === id) return;
    const token = ++revision;
    selected = id; back.hidden = false;
    heading.textContent = sites[id][1];
    host.dataset.monumentSource = id;
    host.dataset.renderState = failed ? 'fallback' : 'loading';
    host.dataset.selectionPending = 'true';
    host.setAttribute('aria-label', 'Illustrative ' + sites[id][0].toLowerCase() + ' facility sculpture');
    if (!failed && placeholder) placeholder.textContent = 'Preparing ' + sites[id][0].toLowerCase() + '…';
    status.textContent = 'Exploring ' + sites[id][0] + '…';
    root.setAttribute('aria-busy', 'true');
    globe?.select?.(id);
    view('facility');
    prepare(id, token);
  }
  function returnToGlobe() {
    if (disposed) return;
    ++revision;
    host.removeAttribute('data-selection-pending');
    root.removeAttribute('aria-busy');
    heading.textContent = 'A world of energy.';
    status.textContent = 'Explore an energy source.';
    view('globe');
    // Research owns source focus so restoring it cannot select the source again.
    document.dispatchEvent(new CustomEvent('proton:discovery-back', {detail:{source:selected}}));
    back.hidden = true;
  }
  function sourceChanged(event) { choose(event.detail?.source); }
  function pageHide(event) {
    suspended = true; syncMotion();
    if (event.persisted) return;
    disposed = true; ++revision; ++generation;
    observer?.disconnect(); stage?.dispose(); globe?.dispose();
    document.removeEventListener('proton:discovery-source', sourceChanged);
    document.removeEventListener('visibilitychange', syncMotion);
    preference.removeEventListener('change', syncMotion);
    back.removeEventListener('click', returnToGlobe);
    window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
  }
  function pageShow() { suspended = false; syncMotion(); }
  document.addEventListener('proton:discovery-source', sourceChanged);
  document.addEventListener('visibilitychange', syncMotion);
  preference.addEventListener('change', syncMotion);
  back.addEventListener('click', returnToGlobe);
  window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
  if (window.IntersectionObserver) {
    observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); syncMotion(); });
    observer.observe(root);
  } else { visible = true; }
})();
