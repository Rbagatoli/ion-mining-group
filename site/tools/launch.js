/* One flag: is the site finished enough to be indexed?
 *
 * The site is LIVE at protonminingco.com and it is not finished. 114 [PLACEHOLDER] spans still
 * render as orange brackets across 17 pages — 35 on hosting, 29 on energy, 12 on the home page.
 *
 * Those two facts are not in conflict, they are just usually confused. Being reachable and
 * being indexed are separate things, and separating them is worth doing here: Google evaluates
 * what it crawls, and a first impression of an unfinished site is one you then have to
 * overwrite. Re-crawling and re-evaluation is slower than getting it right once, so indexing
 * the placeholder version would spend the head start the domain was registered to gain.
 *
 * WHILE THIS IS FALSE:
 *   - every page carries <meta name="robots" content="noindex, nofollow">
 *   - robots.txt still allows crawling, because a page that is never fetched is a page whose
 *     noindex is never read. Blocking the crawl would be the wrong tool: it hides the page
 *     without de-indexing it, which is the opposite of what is wanted
 *   - sitemap.xml is still generated and kept current, but robots.txt does not name it.
 *     Advertising a list of pages you have asked not to be indexed is the contradiction this
 *     codebase already refuses for 404.html and for draft posts
 *
 * TO LAUNCH FOR REAL: set INDEXABLE to true, run the generators, commit. Then submit the
 * sitemap in Search Console. That is the whole flip — the noindex tags disappear from every
 * page, robots.txt names the sitemap again, and the tests change what they assert with it.
 *
 * DO NOT flip it until `grep -c 'class="ph"' site/*.html` is zero on every page a visitor can
 * reach. That is the actual launch gate, and it is a content gate rather than a technical one.
 */
module.exports = {
    INDEXABLE: false,

    /* The tag written into every page while the hold is on. nofollow as well as noindex: the
       internal link graph is real and there is no reason to have it crawled and weighted
       against a version of the site that is going to change. */
    HOLD_TAG: '<meta name="robots" content="noindex, nofollow">',
};
