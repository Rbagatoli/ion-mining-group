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

ok(robots.indexOf('Sitemap: ' + BASE + '/sitemap.xml') >= 0,
   'robots.txt points crawlers at the sitemap', 'the sitemap line is missing or wrong');
ok(robots.indexOf('Allow: /') >= 0, 'and does not block the site', 'nothing is allowed');
/* A stray Disallow here would quietly delist the whole site. */
ok(robots.indexOf('Disallow: /') < 0, 'and carries no blanket Disallow',
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
var expected = navPages.filter(function (p) { return !isNoindex(p); });
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
        ok(parsed.name === 'Ion Mining Group', 'named correctly', parsed.name);
        ok(String(parsed.url).indexOf(BASE) === 0, 'pointing at the same origin', parsed.url);

        /* The whole point of the placeholder convention is that nothing
           unverified ships. JSON-LD is where a false claim would be repeated
           back as fact by a search engine, so it is the last place a bracket
           should ever appear. */
        var leaked = Object.keys(parsed).filter(function (k) {
            return String(parsed[k]).indexOf('[') >= 0;
        });
        ok(leaked.length === 0, 'and asserts nothing still unfilled',
           'placeholder text in: ' + leaked.join(', '));

        /* These are all still [PLACEHOLDER] spans in the markup; they belong
           here only once they are real. */
        ['address', 'telephone', 'foundingDate', 'numberOfEmployees'].forEach(function (k) {
            ok(!(k in parsed), 'no unverified ' + k + ' is claimed', 'it is being asserted');
        });
    }
}

/* Markers, so re-running replaces the block instead of stacking copies. */
ok((home.split('application/ld+json').length - 1) === 1,
   'exactly one structured-data block', 'the generator appended instead of replacing');

console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  seo-suite: ALL OK');
process.exit(fail ? 1 : 0);
