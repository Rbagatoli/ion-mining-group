/* Assemble the tree GitHub Pages serves.
 *
 *     node tools/build-pages.js            build _site/
 *     node tools/build-pages.js --check    build it, verify it, then delete it
 *
 * WHY THE TREE IS SHAPED LIKE THIS
 * Every canonical, every og:url and all the sitemap <loc>s in site/ say
 * https://protonminingco.com/<page>.html — the origin ROOT. The launch instruction written into
 * _config.yml is "delete the - site/ line", which publishes the marketing site at /site/ and
 * makes every one of those URLs a 404. This builds the tree the URLs already describe instead
 * of rewriting forty URLs to match an awkward one:
 *
 *     /             the marketing site   (site/)
 *     /portal/      the client portal    (portal/)
 *     /app/         the operator app     (the repo root)
 *     /app/data/    the 18MB the app fetches at runtime
 *
 * The app relocates without an edit: its only runtime fetch pattern is './data/*.json' and its
 * service worker registers './sw.js', both relative, so /app/ just works and the worker's scope
 * narrows to /app/ correctly.
 *
 * WHY A NODE SCRIPT AND NOT rsync IN THE YAML
 * Because this one can be run. A pile of --exclude flags inside a workflow file is only ever
 * exercised on a runner, which means the first time anyone finds out it is wrong is a broken
 * deployment. This runs locally, --check asserts the result, and the site suite calls it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');

/* Never published, under any path. Directories are matched by name at the level they appear. */
const NEVER = new Set([
    '.git', '.github', '.claude', 'node_modules', '_site',
    'tests', 'tools',
    /* Cloudflare Worker source. Their route surface and key-derivation schemes are not
       something to hand out, and nothing on any page loads them. */
    'worker', 'worker-strike', 'worker-orders', 'worker-portal',
]);

/* Excluded from the MARKETING site specifically. tools/ is generator source whose comments
   state commercial reasoning; README.md is internal design documentation with no front matter,
   which a server hands over as plain text; posts/ is the markdown behind pages that are
   already built. */
const SITE_SKIP = new Set(['tools', 'posts', 'README.md']);

/* Excluded from the APP copy: the other three trees have their own destinations, and the root
   robots.txt describes the pre-launch world where the app IS the site. */
const APP_SKIP = new Set(['site', 'portal', 'robots.txt', '_config.yml', 'CNAME']);

let copied = 0;

function copyTree(from, to, skip) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
        if (NEVER.has(name)) continue;
        if (skip && skip.has(name)) continue;
        const src = path.join(from, name);
        const dst = path.join(to, name);
        const st = fs.statSync(src);
        if (st.isDirectory()) copyTree(src, dst, null);
        else { fs.copyFileSync(src, dst); copied++; }
    }
}

function build() {
    fs.rmSync(OUT, { recursive: true, force: true });

    copyTree(path.join(ROOT, 'site'), OUT, SITE_SKIP);

    /* CNAME, AT THE DEPLOY ROOT. GitHub Pages reads it from the published root and nowhere
       else, and the file lives at the repository root, which is the source for /app/ — so it
       was being excluded from the app copy (correctly) and never reaching the root (not
       correctly). The custom domain would simply not have worked, with nothing in any build
       log to say why. */
    const cname = path.join(ROOT, 'CNAME');
    if (fs.existsSync(cname)) fs.copyFileSync(cname, path.join(OUT, 'CNAME'));
    copyTree(path.join(ROOT, 'portal'), path.join(OUT, 'portal'), null);
    copyTree(ROOT, path.join(OUT, 'app'), APP_SKIP);

    return copied;
}

/* ---------- verification ---------- */

const MUST_EXIST = [
    /* Without this the custom domain does not resolve to the site at all. */
    'CNAME',
    'index.html', 'why-mining.html', 'blog.html', 'hosting.html', 'hardware.html',
    'sitemap.xml', 'robots.txt', '404.html', 'styles.css',
    'portal/index.html',
    'app/index.html', 'app/shared.js', 'app/data/site-quality.json',
];

const MUST_NOT_EXIST = [
    'tools', 'posts', 'README.md', 'tests',
    'app/site', 'app/tests', 'app/tools', 'app/worker-portal', 'app/worker-orders',
    'app/robots.txt',
    'worker-portal', 'worker-orders',
];

function verify() {
    const problems = [];

    for (const rel of MUST_EXIST) {
        if (!fs.existsSync(path.join(OUT, rel))) problems.push('missing: ' + rel);
    }
    for (const rel of MUST_NOT_EXIST) {
        if (fs.existsSync(path.join(OUT, rel))) problems.push('PUBLISHED, should not be: ' + rel);
    }

    /* EVERY SITEMAP URL MUST RESOLVE TO A FILE IN THE TREE. This is the check the whole script
       exists for: a sitemap that lists a URL the deploy does not contain is precisely the
       launch-day failure the /site/ topology would have caused, silently, on all twelve pages. */
    /* Reported rather than thrown. When the tree is assembled wrongly this file is one of the
       first things missing, and an ENOENT stack is a worse description of that than a sentence
       saying the sitemap is not where it should be. */
    const sitemapPath = path.join(OUT, 'sitemap.xml');
    if (!fs.existsSync(sitemapPath)) {
        problems.push('missing: sitemap.xml (so no url in it could be checked)');
        return { problems, locs: 0 };
    }
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!locs.length) problems.push('sitemap.xml lists no urls');
    for (const loc of locs) {
        const p = new URL(loc).pathname;
        const rel = p.endsWith('/') ? p + 'index.html' : p;
        if (!fs.existsSync(path.join(OUT, rel.replace(/^\//, '')))) {
            problems.push('sitemap lists ' + loc + ' but the tree has no ' + rel);
        }
    }

    /* THE CNAME MUST NAME THE SAME HOST THE CANONICALS DO. Two different answers to "what is
       this site's address" is how a site ends up serving itself at one hostname while telling
       search engines the real one is somewhere else. */
    const cnamePath = path.join(OUT, 'CNAME');
    if (fs.existsSync(cnamePath)) {
        const host = fs.readFileSync(cnamePath, 'utf8').trim();
        const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
        const canon = /rel="canonical" href="https:\/\/([^\/"]+)/.exec(home);
        if (!canon) problems.push('index.html has no canonical to compare the CNAME against');
        else if (canon[1] !== host) {
            problems.push('CNAME says ' + host + ' but the canonical says ' + canon[1]);
        }
    }

    /* And every canonical must agree with where the file actually landed. */
    for (const f of fs.readdirSync(OUT).filter((x) => /\.html$/.test(x))) {
        const h = fs.readFileSync(path.join(OUT, f), 'utf8');
        const m = /rel="canonical" href="([^"]+)"/.exec(h);
        if (!m) continue;
        const want = new URL(m[1]).pathname.replace(/^\//, '') || 'index.html';
        if (want !== f && !(f === 'index.html' && want === 'index.html')) {
            problems.push(f + ' canonical points at /' + want + ', not at itself');
        }
    }

    return { problems, locs: locs.length };
}

if (require.main === module) {
    const files = build();
    const { problems, locs } = verify();

    console.log('_site: ' + files + ' files, ' + locs + ' sitemap urls');
    if (problems.length) {
        problems.forEach((p) => console.error('  ' + p));
        console.error('\n' + problems.length + ' problem(s)');
        process.exit(1);
    }
    console.log('  marketing site at /, portal at /portal/, operator app at /app/');

    if (process.argv.indexOf('--check') >= 0) {
        fs.rmSync(OUT, { recursive: true, force: true });
        console.log('  --check: verified and removed');
    }
}

module.exports = { build, verify, OUT, NEVER, SITE_SKIP, APP_SKIP };
