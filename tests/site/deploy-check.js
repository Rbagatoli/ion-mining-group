/* The tree GitHub Pages will actually serve.
 *
 * WHAT THIS IS GUARDING AGAINST, precisely.
 *
 * Every canonical, every og:url and all twelve sitemap <loc>s say
 * https://protonminingco.com/<page>.html — the origin root. The launch instruction written into
 * _config.yml is "delete the - site/ line", which publishes the marketing site at /site/. Doing
 * that makes every canonical point at a 404, gets the sitemap rejected wholesale, stops
 * site/404.html ever firing (Pages only honours a 404 at the publish root) and serves the
 * internal operator dashboard as the company homepage.
 *
 * None of that would have thrown an error anywhere. The build would succeed, the pages would
 * render, and the site would simply not be findable. So the shape of the deploy is asserted
 * here rather than discovered on launch day.
 *
 * The build is real: it writes _site/, checks it, and removes it again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'tools', 'build-pages.js'));

let pass = 0, fail = 0;
function ok(cond, label, note) {
    if (cond) { pass++; console.log('  ok    ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (note ? '   ' + note : '')); }
}

console.log('=== the deploy tree is the tree the URLs describe ===');

let files = 0, result = null;
try {
    files = P.build();
    result = P.verify();
} catch (e) {
    ok(false, 'the tree assembles', e.message);
}

if (result) {
    ok(files > 50, 'the tree assembles', files + ' files');
    ok(result.problems.length === 0, 'and every assertion about its shape holds',
       result.problems.slice(0, 4).join(' | '));
    ok(result.locs >= 10, 'the sitemap lists the pages', result.locs + ' urls');

    /* Spelled out here as well as inside build-pages.js, because these are the specific
       outcomes somebody would look for when this fails. */
    const at = (rel) => fs.existsSync(path.join(P.OUT, rel));

    /* THE CUSTOM DOMAIN. Pages reads CNAME from the published root and nowhere else. The file
       lives at the repository root, which is the source for /app/, so it was being excluded
       from the app copy correctly and never reaching the deploy root at all — the domain
       would not have resolved to the site, and nothing in any build log would have said so. */
    ok(at('CNAME'), 'the custom domain file is at the deploy root');

    ok(at('index.html'), 'the marketing home page is at the origin root');
    ok(at('why-mining.html') && at('blog.html'), 'and so are the hub and the blog');
    ok(at('404.html'), 'the 404 handler is at the root, where Pages will honour it');
    ok(at('portal/index.html'), 'the client portal is at /portal/');
    ok(at('app/index.html'), 'the operator app is at /app/, not at the root');

    /* The app relocates only because everything it loads is relative. If that stops being
       true, it breaks at /app/ and nowhere else, which is the worst place to find out. */
    ok(at('app/data/site-quality.json'),
       'and the data it fetches moved with it, so ./data/ still resolves');

    /* THE THINGS THAT MUST NEVER BE PUBLISHED. worker-portal/ was live for two days because it
       was created after the exclude list was written and nobody updated it. A list in a config
       file is a list someone has to remember; this is a test. */
    const NEVER = [
        ['worker-portal', 'Worker source: route surface and key derivation'],
        ['worker-orders', 'the payments Worker'],
        ['app/worker-portal', 'the same, under the app'],
        ['tools', 'generator source, whose comments state commercial reasoning'],
        ['README.md', '67KB of internal design documentation, served as plain text'],
        ['posts', 'the markdown behind pages that are already built'],
        ['tests', 'this suite'],
        ['app/site', 'the marketing site, duplicated under the app'],
    ];
    NEVER.forEach(([rel, why]) => {
        ok(!at(rel), 'not published: ' + rel, why);
    });

    /* robots.txt at the deploy root must be the generated one that ALLOWS the marketing site,
       not the repo-root one that disallows everything. Shipping the wrong one hides the entire
       site from every search engine on launch day, and looks like nothing is wrong. */
    if (at('robots.txt')) {
        const r = fs.readFileSync(path.join(P.OUT, 'robots.txt'), 'utf8');
        ok(/^Allow: \/$/m.test(r), 'the live robots.txt allows the marketing site');
        ok(/Disallow: \/app\//.test(r), 'and disallows the operator app');
        const LAUNCH = require(path.join(ROOT, 'site', 'tools', 'launch.js'));
        ok(/Sitemap:/.test(r) === LAUNCH.INDEXABLE,
           LAUNCH.INDEXABLE ? 'and names the sitemap'
                            : 'and withholds the sitemap while the launch hold is on');
        ok(!/^Disallow: \/$/m.test(r),
           'and is NOT the repo-root one that blocks everything',
           'the pre-launch robots.txt shipped as the live one');
    } else {
        ok(false, 'robots.txt is in the tree');
    }
}

/* Leave nothing behind. A stray 21MB _site/ would end up in somebody's next commit. */
fs.rmSync(P.OUT, { recursive: true, force: true });
ok(!fs.existsSync(P.OUT), 'and the check cleans up after itself');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('  deploy-check: ALL OK');
