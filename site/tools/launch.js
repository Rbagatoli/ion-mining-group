/* Search readiness is granted per audited page, never for the whole site.
 *
 * Being publicly reachable is separate from being ready for search. Add a page
 * or post here only after reviewing its claims, contact routes and sources.
 * Unknown pages and newly published posts remain noindex until that review.
 * Run build-nav.js, build-blog.js and build-seo.js after changing this policy.
 *
 * robots.txt permits crawling so search engines can read the noindex tags.
 * The sitemap advertises only approved canonical pages and approved posts
 * whose front matter still says published. Drafts remain excluded.
 */
const READY_PAGES = Object.freeze([
    'index.html',
    'energy-sites.html',
    'site-screening-checklist.html',
    'blog.html',
    'calculator.html',
    'contact.html',
    'privacy.html',
]);

const READY_POSTS = Object.freeze([
    'energy-hashprice-what-a-megawatt-hour-of-mining-earns',
    'cheap-mining-power-quote',
    'three-questions-before-you-buy-a-miner',
]);

/* These are purchase/session flows, an error route and a retired redirect,
 * not search landing pages. Directory routes (app, CRM, portal and demos) and
 * URL/query variants are also excluded by the exact root-filename check. */
const ALWAYS_NOINDEX = Object.freeze([
    'cart.html', 'pay.html', 'order.html', '404.html', 'brokerage.html',
    'app.html', 'crm.html', 'portal.html', 'operator.html', 'demo.html',
]);

function isPublicFilename(file) {
    return typeof file === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(file)
        && !ALWAYS_NOINDEX.includes(file);
}

function isIndexablePage(file) {
    return isPublicFilename(file) && READY_PAGES.includes(file);
}

function isIndexablePost(meta) {
    return !!meta && meta.status === 'published'
        && typeof meta.slug === 'string' && isPublicFilename(meta.slug + '.html')
        && READY_POSTS.includes(meta.slug);
}

module.exports = {
    READY_PAGES, READY_POSTS, ALWAYS_NOINDEX, isIndexablePage, isIndexablePost,
    HOLD_TAG: '<meta name="robots" content="noindex, nofollow">',
};
