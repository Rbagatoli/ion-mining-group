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

/* THE LAUNCH HOLD CHANGES WHAT IS CORRECT, so the suite reads the flag rather than assuming
   one state. While the hold is on the site is live and every page carries noindex, so robots
   must NOT name the sitemap: advertising pages you have asked not to index is the same
   contradiction 404.html is kept out of the sitemap for. When the hold lifts, the sitemap is
   named and the noindex tags are gone. Both are correct; which one is correct is a one-line
   flag, and a suite that only knew one of them would fail on launch day. */
var LAUNCH = require(S + 'tools/launch.js');

if (LAUNCH.INDEXABLE) {
    ok(robots.indexOf('Sitemap: ' + BASE + '/sitemap.xml') >= 0,
       'robots.txt points crawlers at the sitemap', 'the sitemap line is missing or wrong');
} else {
    ok(robots.indexOf('Sitemap:') < 0,
       'robots.txt withholds the sitemap while the site is on the launch hold',
       'it advertises pages that carry noindex');
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

/* ---- the sitemap and the nav agree on what pages exist ---- */

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

/* Some pages are deliberately in one list and not the other, because they carry
   noindex and listing a page you have asked not to be indexed contradicts
   itself. That WAS a hard-coded exemption for 404.html; it is now the rule it
   was always standing in for — a page belongs in the sitemap exactly when it is
   not noindex. Stated that way it covers pay.html and order.html, which carry an
   order reference and would put a delivery address in a search result, and it
   keeps covering whatever comes next without being edited. */
function isNoindex(page) {
    var p = S + page;
    if (!fs.existsSync(p)) return false;
    return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(fs.readFileSync(p, 'utf8'));
}
var exempt = navPages.filter(isNoindex);
ok(exempt.indexOf('404.html') >= 0, 'the error page is noindex', exempt.join(', '));
ok(exempt.length >= 1, 'and the noindex pages are found by reading them, not by a list',
   exempt.join(', '));
/* While the hold is on, EVERY page is noindex, so "belongs in the sitemap exactly when it is
   not noindex" would empty the expected list and report all ten as inventions. The rule is
   right; it is just about the post-launch state. During the hold the generator's list is
   checked against the pages that will be indexable once the tags come off — which is every
   page that does not carry a noindex of its own for its own reason. */
function isOwnNoindex(page) {
    var p = S + page;
    if (!fs.existsSync(p)) return false;
    var h = fs.readFileSync(p, 'utf8');
    /* 404, pay and order each carry one because of what they are, not because of the hold.
       The hold's tag is the one immediately after theme-color. */
    var withoutHold = h.replace(
        /<meta name="theme-color" content="#000000">\s*<meta name="robots" content="noindex, nofollow">/,
        '<meta name="theme-color" content="#000000">');
    return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(withoutHold);
}
var expected = navPages.filter(function (p) {
    return LAUNCH.INDEXABLE ? !isNoindex(p) : !isOwnNoindex(p);
});
var missing = expected.filter(function (p) { return seoPages.indexOf(p) < 0; });
var extra = seoPages.filter(function (p) { return expected.indexOf(p) < 0; });
ok(missing.length === 0, 'every real page is in the sitemap generator',
   'absent: ' + missing.join(', '));
ok(extra.length === 0, 'and the sitemap invents none', 'unexpected: ' + extra.join(', '));
ok(seoPages.indexOf('404.html') < 0, 'the error page is kept out of the sitemap',
   'a noindex page is being advertised');

var notFound = fs.readFileSync(S + '404.html', 'utf8');
ok(notFound.indexOf('name="robots" content="noindex"') >= 0,
   'and asks not to be indexed', 'the 404 has no noindex');

/* Every listed url must actually resolve to a file. */
var badUrl = [];
seoPages.forEach(function (p) {
    var url = p === 'index.html' ? BASE + '/' : BASE + '/' + p;
    if (sitemap.indexOf('<loc>' + url + '</loc>') < 0) badUrl.push(p);
});
ok(badUrl.length === 0, 'the written sitemap lists every one of them',
   'not in the file: ' + badUrl.join(', '));

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
    .filter(function (p) { return p.meta.status === 'published'; }).length;
ok(lastmods === postCount,
   'only the posts, which have a real date, claim a lastmod',
   lastmods + ' lastmod(s) for ' + postCount + ' published post(s)');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  seo-suite: ALL OK');
process.exit(fail ? 1 : 0);
