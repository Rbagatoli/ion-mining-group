/* Preserve the supplied hero footage while respecting motion preferences and
   avoiding playback work when the hero is offscreen or the page is hidden. */
(function () {
  'use strict';
  const video = document.querySelector('.home-hero-video');
  if (!video) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, suspended = false, disposed = false, observer;
  function sync() {
    if (!disposed && visible && !suspended && !document.hidden && !motion.matches) {
      video.muted = true;
      video.play()?.catch(() => {});
    } else video.pause();
  }
  function hide(event) {
    suspended = true; sync();
    if (event.persisted) return;
    disposed = true; observer?.disconnect();
    motion.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
  }
  function show() { suspended = false; sync(); }
  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
  if (window.IntersectionObserver) {
    observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); });
    observer.observe(video);
  } else { visible = true; sync(); }
})();
