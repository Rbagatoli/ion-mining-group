// Bumped with the asset stamps on prospecting.html, so activate() drops the old cache rather
// than leaving the superseded copies of the two panels beside the new ones.
const CACHE_NAME = 'proton-mining-v399';
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
  './gas-field.js',
  './fleet-data.js',
  './geo-data.js',
  './dashboard.js',
  './calculator.js',
  './calc-engine.js',
  './charts.js',
  './cycle.js',
  './cycle-indicators.js',
  './site-capacity.js',
  // Listed now that both files are committed, which is the pairing the previous commit held
  // these back for: addAll() is atomic, so a name with no file behind it in the deployed tree
  // rejects the whole install and precaches NOTHING. tests/workspace-reach.test.js asks git
  // rather than the filesystem, so it refuses an entry for a file that is not in the repo AND
  // demands an entry for a script a precached page loads — the two together make this pairing
  // enforced rather than remembered.
  './capacity-audit.js',
  './capacity-audit-ui.js',
  './map-sourcing.js',
  './site-catalog.js',
  './site-engine.js',
  './site-flags.js',
  './site-scoring.js',
  './site-opportunity.js',
  './site-acquirability.js',
  './site-capex.js',
  './site-infrastructure.js',
  './site-availability.js',
  './site-sources.js',
  './source-flare-gas.js',
  './permit-index.js',
  './site-links.js',
  './source-facility.js',
  './source-landfill.js',
  './lmr.js',
  './source-landfill-ca.js',
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
  './project-model.js',
  './project-gates.js',
  './project-budget.js',
  // site-capacity.js was listed a second time here, having already been added with the
  // cycle/capacity group above, and so were the two capacity-audit files. addAll() dedupes by
  // request so nothing was broken by it, which is why the redundant entries survived a review
  // -- but a precache list is read as an inventory, and a name appearing twice invites the next
  // reader to wonder which one is authoritative.
  './project-sizing.js',
  // The two ledger modules, missing since Stages 6 and 7. Offline, prospecting.html loaded
  // without them and both panels opened with a typeof guard, so the Procurement and Contractors
  // sections simply did not render -- which looks exactly like a project that has neither, and
  // is the graceful-degradation path doing real harm. tests/workspace-reach.test.js asserts the
  // script tags on the page; this is the same fact for the offline copy of that page.
  './procurement.js',
  './project-contractors.js',
  './project-link-audit.js',
  './project-link-audit-ui.js',
  './jurisdictions.js',
  './price-history.js',
  './network-history.js',
  './banking.js',
  './map.js',
  './miner-db.js',
  './firebase-config.js',
  './sync.js',
  './auth-ui.js',
  './backup.js',
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
