const CACHE_NAME = 'proton-mining-v352';
const ASSETS = [
  // HTML pages
  './index.html',
  './calculator.html',
  './cycle.html',
  './charts.html',
  './banking.html',
  './map.html',
  './workstation.html',
  './btc-mining-calculator.html',
  './accounting.html',
  './legal-eula.html',
  './legal-privacy.html',
  './pay.html',
  './payouts.html',
  './wallet.html',

  // Stylesheets
  './favicon.svg',
  './tokens.css',
  './shared.css',

  // JavaScript
  './brand-migrate.js',
  './theme.js',
  './chart-theme.js',
  './shared.js',
  './fleet-data.js',
  './geo-data.js',
  './dashboard.js',
  './calculator.js',
  './calc-engine.js',
  './charts.js',
  './cycle.js',
  './cycle-indicators.js',
  './map-sourcing.js',
  './site-catalog.js',
  './site-engine.js',
  './site-flags.js',
  './site-scoring.js',
  './site-opportunity.js',
  './site-acquirability.js',
  './site-capex.js',
  './site-availability.js',
  './site-sources.js',
  './source-flare-gas.js',
  './permit-index.js',
  './site-links.js',
  './source-facility.js',
  './source-landfill.js',
  // Not an adapter -- it decorates landfill prospects with the legal owner and a mailable
  // address. data/ghgrp-contacts.json is deliberately NOT cached here, matching every other
  // artifact: the data/ files are far too large to precache and are fetched on demand.
  './ghgrp-contacts.js',
  './contact-routes.js',
  './prospect-store.js',
  './crm-config.js',
  './crm-log.js',
  './crm-contacts.js',
  './crm-interactions.js',
  './crm-followups.js',
  './crm-enrichment.js',
  './crm-documents.js',
  './prospect-today.js',
  './prospect-detail.js',
  './prospect-nav.js',
  './prospect-board.js',
  './prospect-analytics.js',
  './prospect-summary.js',
  './prospect-contacts.js',
  './contacts.html',
  './contacts.js',
  './prospecting.js',
  './prospecting.html',
  './site-model.js',
  './jurisdictions.js',
  './price-history.js',
  './network-history.js',
  './banking.js',
  './map.js',
  './miner-db.js',
  './firebase-config.js',
  './sync.js',
  './auth-ui.js',
  './profile-panel.js',
  './alerts.js',
  './onboarding.js',
  './widget-settings.js',
  './chart.min.js',

  // PWA manifest
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Deliberately NOT skipWaiting() here. Installing a new worker used to take control of every
  // open tab the moment a build landed, which fired controllerchange, which made shared.js
  // hard-reload the page out from under whatever was on screen. On the prospects view that
  // meant losing a selected site and a scroll position mid-search, with no warning and no way
  // to decline. The new worker now waits; shared.js offers the update and skips only when the
  // user accepts it below.
});

// The page asks for the update when the user clicks Reload on the toast.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests — Cache API doesn't support POST
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only handle same-origin requests — let API calls (CoinGecko, Mempool) pass through directly
  if (url.origin !== self.location.origin) return;

  // Redirect old calculator URL directly to dashboard
  if (url.pathname.endsWith('btc-mining-calculator.html')) {
    const redirectUrl = new URL('./index.html', url).href;
    event.respondWith(Response.redirect(redirectUrl, 302));
    return;
  }

  // Network-first for ALL assets — always serve latest, cache as offline fallback
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, clone);
      });
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
