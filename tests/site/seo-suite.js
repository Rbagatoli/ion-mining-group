/* Guards the files search engines and link previews read.

   Everything here is machine-readable, which is what makes it worth testing:
   nobody looks at a sitemap, so a page missing from it is invisible until
   traffic does not arrive, and a placeholder leaking into JSON-LD is a false
   claim a search engine will repeat back as fact.

   indexOf rather than regexes throughout — see the note in calc-suite.js. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
var fs = require('fs');
var S = REPO_ROOT + 'site/';
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + detail));
    if (!cond) fail++;
}

var seo = fs.readFileSync(S + 'tools/build-seo.js', 'utf8');
var nav = fs.readFileSync(S + 'tools/build-nav.js', 'utf8');
var siteNavigation = require(S + 'tools/build-nav.js');
var sourcingNav = siteNavigation.nav('sites', siteNavigation.CTA['energy-sites.html']);
ok(siteNavigation.PAGES['energy-sites.html'] === 'sites', 'energy site sourcing has its own navigation identity');
ok(/href="\.\/energy-sites\.html" class="active">Find a site<\/a>/.test(sourcingNav),
   'Find a site identifies the buyer-facing service');
ok(/class="brand" href="\.\/index\.html"/.test(sourcingNav) && !/>Home<\/a>/.test(sourcingNav),
   'the brand retains Home without an extra navigation text link');
ok(/href="\.\/energy\.html">Energy Partners<\/a>/.test(sourcingNav),
   'the owner-facing Energy Partners route remains available');
ok(siteNavigation.CTA['energy-sites.html'].href === '#request', 'the sourcing CTA targets its request brief');
ok((siteNavigation.SERVICES_COL.match(/href="\.\/energy-sites\.html"/g) || []).length === 1,
   'the shared Services footer promotes sourcing exactly once');
ok((siteNavigation.SERVICES_COL.match(/href="\.\/energy\.html#managed-hosting"/g) || []).length === 1,
   'the shared Services footer preserves Managed Energy Hosting');
['index.html', 'hosting.html', 'energy.html'].forEach(function (file) {
    var page = fs.readFileSync(S + file, 'utf8');
    var content = page.slice(page.indexOf('</nav>') + 6, page.indexOf('<footer'));
    ok(/href="\.\/energy-sites\.html"/.test(content), file + ' provides a contextual route to site sourcing');
});
ok(!/middleman placing your machines|developer who flips|not brokers\./.test(fs.readFileSync(S + 'index.html', 'utf8')),
   'homepage operating positioning is compatible with the independent sourcing service');

/* The origin, read from the generator rather than restated here. */
var BASE = (function () {
    var i = seo.indexOf("const BASE = '");
    return i < 0 ? null : seo.slice(i + 14, seo.indexOf("'", i + 14));
})();
ok(!!BASE && BASE.indexOf('https://') === 0, 'the generator names one origin', String(BASE));

/* ---- the files exist and say what they should ---- */

['robots.txt', 'sitemap.xml', '404.html'].forEach(function (f) {
    ok(fs.existsSync(S + f), f + ' exists', 'never generated');
});
var robots = fs.readFileSync(S + 'robots.txt', 'utf8');
var sitemap = fs.readFileSync(S + 'sitemap.xml', 'utf8');

/* Only audited pages/posts are advertised. Published content and public
   reachability alone must not unlock indexing for the rest of the site. */
var LAUNCH = require(S + 'tools/launch.js');
var seoOutput = require(S + 'tools/build-seo.js');

if (/<loc>/.test(seoOutput.sitemap)) {
    ok(robots.indexOf('Sitemap: ' + BASE + '/sitemap.xml') >= 0,
       'robots.txt points crawlers at the sitemap', 'the sitemap line is missing or wrong');
} else {
    ok(robots.indexOf('Sitemap:') < 0,
       'robots.txt withholds an empty readiness sitemap',
       'it advertises a sitemap with no approved pages');
    ok(/Sitemap withheld/.test(robots), 'and says why, in the file itself');
}
ok(robots.indexOf('Allow: /') >= 0, 'and does not block the site', 'nothing is allowed');
/* A BLANKET disallow, not any disallow. `Disallow: /` on its own line delists the whole site
   silently; `Disallow: /app/` is the operator app being kept out of the index, which is the
   point. indexOf('Disallow: /') could not tell those apart — it matched the prefix of every
   possible path, so the moment one directory was excluded the suite reported the entire site
   was asking not to be indexed. */
ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'and carries no blanket Disallow',
   'the site is asking not to be indexed');

/* ---- the sitemap and page robots tags follow the same readiness policy ---- */

function pagesOf(src, marker) {
    var block = src.slice(src.indexOf(marker), src.indexOf('};', src.indexOf(marker)));
    var out = [], i = 0;
    while ((i = block.indexOf(".html'", i)) >= 0) {
        var start = block.lastIndexOf("'", i) + 1;
        out.push(block.slice(start, i + 5));
        i += 6;
    }
    return out;
}
var navPages = pagesOf(nav, 'const PAGES = {');
var seoPages = pagesOf(seo, 'const PAGES = {');
ok(navPages.length >= 5, 'read the nav page list', navPages.join(', '));

function isNoindex(page) {
    var p = S + page;
    if (!fs.existsSync(p)) return false;
    return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(fs.readFileSync(p, 'utf8'));
}
var expected = navPages.filter(LAUNCH.isIndexablePage);
var missing = expected.filter(function (p) { return seoPages.indexOf(p) < 0; });
var extra = seoPages.filter(function (p) { return navPages.indexOf(p) < 0; });
ok(missing.length === 0, 'every ready public page has sitemap metadata',
   'absent: ' + missing.join(', '));
ok(extra.length === 0, 'and the sitemap invents none', 'unexpected: ' + extra.join(', '));
navPages.forEach(function (p) {
    ok(isNoindex(p) === !LAUNCH.isIndexablePage(p), p + ' robots tag follows its audited readiness');
});
LAUNCH.READY_PAGES.forEach(function (p) {
    ok(navPages.indexOf(p) >= 0 && seoPages.indexOf(p) >= 0,
       p + ' approval names a registered public page');
    var html = fs.readFileSync(S + p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    var placeholder = Array.from(html.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi))
        .some(function (match) { return match[1].split(/\s+/).indexOf('ph') >= 0; });
    ok(!placeholder,
       p + ' is not approved with rendered placeholder spans');
});
['cart.html', 'pay.html', 'order.html', '404.html', 'brokerage.html'].forEach(function (p) {
    ok(seoPages.indexOf(p) < 0 && sitemap.indexOf('/' + p + '</loc>') < 0,
       p + ' is excluded from sitemap metadata and output');
});

var notFound = fs.readFileSync(S + '404.html', 'utf8');
ok(notFound.indexOf('name="robots" content="noindex"') >= 0,
   'and asks not to be indexed', 'the 404 has no noindex');

/* Every listed url must actually resolve to a file. */
var badUrl = [];
expected.forEach(function (p) {
    var url = p === 'index.html' ? BASE + '/' : BASE + '/' + p;
    if (sitemap.indexOf('<loc>' + url + '</loc>') < 0) badUrl.push(p);
});
ok(badUrl.length === 0, 'the written sitemap lists every one of them',
   'not in the file: ' + badUrl.join(', '));
ok(sitemap === seoOutput.sitemap, 'the written sitemap exactly matches ready canonical pages and audited published posts');
ok(robots === seoOutput.robots, 'the written robots.txt matches the readiness sitemap');
var posts = require(S + 'tools/build-blog.js').readPosts();
posts.forEach(function (p) {
    var file = p.meta.slug + '.html';
    ok(isNoindex(file) === !LAUNCH.isIndexablePost(p.meta), file + ' robots tag follows publication and audit readiness');
});
LAUNCH.READY_POSTS.forEach(function (slug) {
    ok(posts.some(function (p) { return p.meta.slug === slug; }), slug + ' approval names an existing post');
});
var known = navPages.concat(posts.map(function (p) { return p.meta.slug + '.html'; }), ['brokerage.html']);
fs.readdirSync(S).filter(function (f) { return /\.html$/.test(f) && known.indexOf(f) < 0; }).forEach(function (f) {
    ok(isNoindex(f), f + ' is unknown and must default to noindex');
});

/* ---- canonicals agree with the sitemap ---- */

/* Two different origins for one page is the classic way to split a page's own
   ranking between two addresses. */
var disagree = [];
navPages.forEach(function (p) {
    if (p === '404.html') return;
    var h = fs.readFileSync(S + p, 'utf8');
    var i = h.indexOf('rel="canonical" href="');
    if (i < 0) { disagree.push(p + ' (no canonical)'); return; }
    var href = h.slice(i + 22, h.indexOf('"', i + 22));
    if (href.indexOf(BASE) !== 0) disagree.push(p + ' -> ' + href);
});
ok(disagree.length === 0, 'every canonical shares the generator origin',
   disagree.join('; '));

/* The retired Brokerage URL is a compatibility entry, not another marketed
   service or a second indexed copy of the Hardware catalogue. */
var legacyHardware = fs.readFileSync(S + 'brokerage.html', 'utf8');
var pagesBuild = require(REPO_ROOT + 'tools/build-pages.js');
ok(pagesBuild.isHardwareRedirect(legacyHardware),
   'the old Brokerage URL has the precise Hardware compatibility contract');
ok(navPages.indexOf('brokerage.html') < 0 && seoPages.indexOf('brokerage.html') < 0 &&
   sitemap.indexOf('/brokerage.html') < 0,
   'the retired service is absent from navigation and the sitemap');
var redirectScript = /<script>([\s\S]*?)<\/script>/.exec(legacyHardware);
var redirectedTo = '';
require('vm').runInNewContext(redirectScript ? redirectScript[1] : '', {
    location: { search: '?facility=cold-lake&utm_source=legacy', replace: function (url) { redirectedTo = url; } }
});
ok(redirectedTo === './hardware.html?facility=cold-lake&utm_source=legacy#miners',
   'legacy visits preserve their query and land on the miner catalogue', redirectedTo);
ok(!/<script\b[^>]*\bsrc=/.test(legacyHardware) && !/id="(?:brForm|brCatalog|quoteForm)"/.test(legacyHardware),
   'the compatibility page cannot load the retired sales experience');
[
    legacyHardware.replace('rel="canonical" href="' + BASE + '/hardware.html"', 'rel="canonical" href="' + BASE + '/brokerage.html"'),
    legacyHardware.replace('href="./hardware.html#miners"', 'href="./contact.html"'),
    legacyHardware.replace(" + location.search", ''),
    legacyHardware.replace("'#miners'", "'#prepare'"),
    legacyHardware.replace('content="noindex, follow"', 'content="index, follow"')
].forEach(function (html, i) {
    ok(!pagesBuild.isHardwareRedirect(html), 'the deploy exception rejects a broken compatibility contract ' + (i + 1));
});
var promotedLegacy = [];
fs.readdirSync(S).filter(function (file) { return /\.html$/.test(file); }).forEach(function (file) {
    var html = fs.readFileSync(S + file, 'utf8');
    if (/<a\b[^>]*href="\.\/brokerage\.html(?:[?#][^"]*)?"/.test(html)) promotedLegacy.push(file);
});
ok(promotedLegacy.length === 0, 'public pages promote Hardware instead of the retired standalone service', promotedLegacy.join(', '));

/* ---- structured data ---- */

/* THE PLACEHOLDER SHAPE, NOT ANY BRACKET.

   The previous detector was `String(parsed[k]).indexOf('[') >= 0` over top-level keys, and it
   failed in both directions at once. `String([{a:1}])` is the literal text '[object Object]',
   which contains a bracket — so any array or object value would have been reported as a leak
   the moment one was added. And a placeholder nested one level down was invisible to it,
   because only top-level values were stringified.

   This matches the convention's actual shape: capitals, digits and punctuation inside square
   brackets, which is what `class="ph"` spans contain and what ordinary JSON never does. It
   runs over the serialised document, so depth does not matter.

   {1,} rather than {2,}: [X] is a live placeholder in the markup. */
var LEAK = /\[[A-Z0-9 _,.:%$\u00a7+#()\/-]{1,}\]/;

var home = fs.readFileSync(S + 'index.html', 'utf8');
var li = home.indexOf('application/ld+json');
ok(li >= 0, 'the home page carries structured data', 'none injected');
if (li >= 0) {
    var open = home.indexOf('>', li) + 1;
    var raw = home.slice(open, home.indexOf('</' + 'script>', open));
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* reported below */ }
    ok(!!parsed, 'and it is valid JSON', 'JSON.parse threw');
    if (parsed) {
        ok(parsed['@type'] === 'Organization', 'describing an Organization', parsed['@type']);
        ok(parsed.name === 'Proton Mining', 'named correctly', parsed.name);
        ok(String(parsed.url).indexOf(BASE) === 0, 'pointing at the same origin', parsed.url);

        /* The whole point of the placeholder convention is that nothing unverified ships,
           and JSON-LD is where a false claim gets repeated back as fact by a search engine.
           The page-wide version of this check is below — this one only covers the home page's
           Organization block, which is what the assertions around it are about. */
        ok(!LEAK.test(JSON.stringify(parsed)), 'and asserts nothing still unfilled',
           'placeholder text in the Organization block');

        /* These are all still [PLACEHOLDER] spans in the markup; they belong
           here only once they are real. */
        ['address', 'telephone', 'foundingDate', 'numberOfEmployees'].forEach(function (k) {
            ok(!(k in parsed), 'no unverified ' + k + ' is claimed', 'it is being asserted');
        });
    }
}

/* Markers, so re-running replaces the block instead of stacking copies. */
ok((home.split('application/ld+json').length - 1) === 1,
   'exactly one structured-data block on the home page',
   'the generator appended instead of replacing');

/* ---- EVERY page's structured data, not just the home page's ----

   Everything above this line reads index.html. Four pages carry JSON-LD — the home page, the
   two blog posts and why-mining.html — so three quarters of the site's machine-readable
   claims were unguarded.

   That is not hypothetical. why-mining.html's FAQPage asserted "We host in Canada and Nigeria
   as well as the United States" while facilities.js says in capitals that PROTON HAS NOT
   CONTRACTED THESE SITES and every record carries indicative:true. A present-tense claim about
   where a company operates, in a section about tax residency, in the one format a search engine
   repeats verbatim. Nothing could have caught it, because nothing was looking. */
function ldBlocks(html) {
    var out = [], i = 0;
    while ((i = html.indexOf('application/ld+json', i)) >= 0) {
        var open = html.indexOf('>', i) + 1;
        var close = html.indexOf('</' + 'script>', open);
        if (close < 0) break;
        out.push(html.slice(open, close));
        i = close;
    }
    return out;
}

var ldPages = 0, ldTotal = 0;
fs.readdirSync(S).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
    var blocks = ldBlocks(fs.readFileSync(S + f, 'utf8'));
    if (!blocks.length) return;
    ldPages++;
    blocks.forEach(function (raw, n) {
        ldTotal++;
        var doc = null;
        try { doc = JSON.parse(raw); } catch (e) { /* reported next */ }
        ok(!!doc, f + ' block ' + (n + 1) + ' is valid JSON', 'JSON.parse threw');
        if (!doc) return;
        var flat = JSON.stringify(doc);
        ok(!LEAK.test(flat), f + ' block ' + (n + 1) + ' asserts nothing still unfilled',
           (flat.match(LEAK) || [''])[0]);
        ok(String(doc['@context']).indexOf('schema.org') >= 0,
           f + ' block ' + (n + 1) + ' declares a schema.org context', doc['@context']);
        ok(typeof doc['@type'] === 'string' && doc['@type'].length > 0,
           f + ' block ' + (n + 1) + ' declares a type', doc['@type']);
    });
});
ok(ldPages >= 4, 'structured data was found and checked on every page carrying it',
   ldPages + ' page(s), ' + ldTotal + ' block(s)');

/* ---- no generator the deploy gate re-runs may read the wall clock ----------
 *
 * .github/workflows/pages.yml re-runs every generator on a fresh checkout and
 * fails the deploy if the committed output differs. That gate is only as good as
 * the generators being deterministic — and one of them was not. build-seo.js
 * dated each sitemap entry from the file's mtime, which on a fresh checkout is
 * the checkout, so CI produced a different sitemap from the committed one purely
 * because the run happened on a later UTC day. The deploy of 8622d2b failed on
 * exactly that, and the site sat a commit behind with nothing wrong in it.
 *
 * The generator list is READ FROM THE WORKFLOW rather than written here, so a
 * ninth generator added to the gate is covered the day it is added rather than
 * the day someone remembers this test exists.
 *
 * Comments are stripped before looking, because four separate tests in this repo
 * have failed on prose that merely mentioned the thing they forbade. */
var WORKFLOW = REPO_ROOT + '.github/workflows/pages.yml';
var wf = fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, 'utf8') : '';
ok(wf.length > 0, 'the deploy workflow is readable', WORKFLOW);

var gated = (wf.match(/^\s*node\s+([\w./-]+\.js)\s*$/gm) || [])
    .map(function (l) { return l.trim().replace(/^node\s+/, ''); })
    .filter(function (f, i, a) { return a.indexOf(f) === i; });
ok(gated.length >= 6, 'read the generators the deploy gate re-runs',
   gated.length + ': ' + gated.join(' '));

/* Block comments, line comments and quoted strings all removed: a filename or a
 * message mentioning Date is not a call to it. */
function codeOf(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ')
              .replace(/^\s*\/\/.*$/gm, ' ')
              .replace(/'(?:[^'\\]|\\.)*'/g, "''")
              .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

var CLOCK = /\bnew\s+Date\s*\(\s*\)|\bDate\s*\.\s*now\s*\(|\.\s*[mac]time\b|\bDate\s*\(\s*\)/;
var ticking = [];
gated.forEach(function (rel) {
    var p = REPO_ROOT + rel;
    if (!fs.existsSync(p)) { ticking.push(rel + ' (missing)'); return; }
    var hit = codeOf(fs.readFileSync(p, 'utf8')).match(CLOCK);
    if (hit) ticking.push(rel + ' -> ' + hit[0]);
});
ok(ticking.length === 0,
   'no gated generator dates its own output from the clock', ticking.join(', '));

/* And the sitemap must not carry the field that did it. Posts keep theirs —
 * an authored front-matter date is a fact about the writing, not the build — so
 * this asks only that the count matches the posts, not that it is zero. */
var sm = fs.readFileSync(S + 'sitemap.xml', 'utf8');
var lastmods = (sm.match(/<lastmod>/g) || []).length;
var postCount = require(S + 'tools/build-blog.js').readPosts()
    .filter(function (p) { return LAUNCH.isIndexablePost(p.meta); }).length;
ok(lastmods === postCount,
   'only the posts, which have a real date, claim a lastmod',
   lastmods + ' lastmod(s) for ' + postCount + ' audited published post(s)');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  seo-suite: ALL OK');
process.exit(fail ? 1 : 0);
