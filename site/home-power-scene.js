/* Proton's decorative power-to-compute scene. The renderer is lazy-loaded and
   follows the page's visibility and motion preferences, independently of UI. */
(function () {
  'use strict';
  const script = document.currentScript;
  const host = document.querySelector('.home-power-scene');
  if (!script || !host || host.dataset.powerSceneMounted) return;
  host.dataset.powerSceneMounted = 'true';
  host.dataset.renderState = 'loading';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let stage = null, disposed = false, suspended = false, failed = false;
  let visible = !('IntersectionObserver' in window), observer;

  function sync() {
    if (disposed || !stage) return;
    stage.setMotion(!preference.matches);
    stage.setActive(visible && !document.hidden && !suspended && !failed);
  }
  function fallback() {
    if (disposed || failed) return;
    failed = true;
    stage?.dispose();
    stage = null;
    host.dataset.renderState = 'fallback';
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    preference.removeEventListener('change', sync);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    stage?.dispose();
    stage = null;
  }
  function hide(event) {
    if (!event.persisted) { dispose(); return; }
    suspended = true;
    sync();
  }
  function show() { suspended = false; sync(); }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      sync();
    }, {threshold: 0});
    observer.observe(host);
  }
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', sync);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);

  const source = script.dataset.moduleSrc || new URL('./home-power-stage.js', script.src).href;
  import(source).then(module => {
    if (disposed || failed) return null;
    return module.mountHomePowerScene(host, {onError: fallback});
  }).then(instance => {
    if (!instance) return;
    if (disposed || failed) { instance.dispose(); return; }
    stage = instance;
    host.dataset.renderState = 'ready';
    sync();
  }).catch(fallback);
})();
