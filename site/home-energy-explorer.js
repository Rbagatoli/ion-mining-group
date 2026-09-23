/* Energy choices keep the globe in place and update the research alongside it.
   The highlighted regions illustrate energy routes, not available inventory. */
(function () {
  'use strict';
  const script = document.currentScript;
  const root = document.getElementById('home-energy-explorer');
  if (!script || !root || root.dataset.explorerReady) return;
  const globeHost = root.querySelector('#home-discovery-globe');
  const heading = root.querySelector('#home-search-scope');
  const status = root.querySelector('.home-explorer-status');
  if (!globeHost || !heading || !status) return;
  root.dataset.explorerReady = 'true';
  root.dataset.view = 'globe';
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
  let selected = 'landfill', globe = null, disposed = false, suspended = false, visible = false, observer;
  function load(url) { return import(url); }
  function active() { return visible && !document.hidden && !suspended && !disposed; }
  // The globe owns its reduced-motion preference and lazy GPU initialization.
  // This controller only gates visibility; source choices never move its camera.
  function syncMotion() { globe?.setActive(active()); }
  load(script.dataset.globeSrc).then(module => {
    const instance = module.mountHomeDiscoveryGlobe(globeHost);
    // The module also auto-mounts its authored host. Release that instance if the
    // download completed after a final navigation away from this page.
    if (disposed) { instance?.dispose(); return; }
    globe = instance;
    globe?.select?.(selected);
    syncMotion();
  }).catch(() => { if (!disposed) globeHost.dataset.renderState = 'fallback'; });

  function choose(id) {
    if (!Object.hasOwn(sites, id) || disposed) return;
    selected = id;
    heading.textContent = sites[id][1];
    status.textContent = sites[id][0] + ' research';
    globe?.select?.(id);
  }
  function sourceChanged(event) { choose(event.detail?.source); }
  function pageHide(event) {
    suspended = true; syncMotion();
    if (event.persisted) return;
    disposed = true;
    observer?.disconnect(); globe?.dispose();
    document.removeEventListener('proton:discovery-source', sourceChanged);
    document.removeEventListener('visibilitychange', syncMotion);
    window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
  }
  function pageShow() { suspended = false; syncMotion(); }
  document.addEventListener('proton:discovery-source', sourceChanged);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
  if (window.IntersectionObserver) {
    observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); syncMotion(); });
    observer.observe(root);
  } else { visible = true; }
})();
