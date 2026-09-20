/* Per-page readiness must never become a whole-site indexing switch. This
 * suite exercises the generators in memory; it does not rebuild any files. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
const launch = require(path.join(SITE, 'tools', 'launch.js'));
const nav = require(path.join(SITE, 'tools', 'build-nav.js'));
const watched = ['index.html', 'robots.txt', 'sitemap.xml'];
const before = watched.map((file) => fs.readFileSync(path.join(SITE, file), 'utf8'));
const seo = require(path.join(SITE, 'tools', 'build-seo.js'));
watched.forEach((file, i) => {
    assert.equal(fs.readFileSync(path.join(SITE, file), 'utf8'), before[i],
        'importing the SEO generator must not rewrite ' + file);
});

assert.ok(Object.isFrozen(launch.READY_PAGES) && Object.isFrozen(launch.READY_POSTS),
    'a runtime consumer cannot mutate the reviewed readiness lists');
assert.equal('INDEXABLE' in launch, false, 'there is no global indexing bypass');
assert.ok(launch.READY_PAGES.length > 0, 'the launch has at least one reviewed public page');

const anchor = '<meta name="theme-color" content="#000000">';
const head = '<head>' + anchor + '\n</head>';
const blocked = launch.ALWAYS_NOINDEX.concat([
    'unreviewed-page.html', 'crm/index.html', 'portal/index.html',
    'portal/scouting/index.html', 'app/index.html', 'operator/index.html',
    'demo/index.html', '../index.html', '/index.html', 'index.html?demo=1',
    'index.html#preview', 'https://protonminingco.com/index.html', '', null,
]);
blocked.forEach((file) => {
    assert.equal(launch.isIndexablePage(file), false, String(file) + ' must stay held');
    const held = nav.applyHold(head, file);
    assert.ok(held.includes(launch.HOLD_TAG), String(file) + ' receives a noindex');
    assert.equal(nav.applyHold(held, file), held, 'a repeated hold must not duplicate robots tags');
});

launch.READY_PAGES.forEach((file) => {
    assert.ok(launch.isIndexablePage(file), file + ' is explicitly approved');
    assert.ok(Object.hasOwn(nav.PAGES, file) && Object.hasOwn(seo.PAGES, file),
        file + ' approval must name an existing public landing page');
    assert.equal(nav.applyHold(head, file), head, file + ' needs no generated hold');
    assert.equal(nav.applyHold(head.replace(anchor, anchor + '\n' + launch.HOLD_TAG), file), head,
        file + ' loses a previous generated hold');
    const own = head.replace('</head>', '<meta name="robots" content="noindex">\n</head>');
    assert.ok(nav.applyHold(own, file).includes('content="noindex"'),
        'readiness cannot erase an independently authored robots restriction');
});

assert.equal(launch.isIndexablePost({ slug: 'new-unaudited-post', status: 'published' }), false,
    'publishing an unknown post cannot authorize search indexing');
assert.equal(launch.isIndexablePost(null), false);
launch.ALWAYS_NOINDEX.forEach((file) => {
    assert.equal(launch.isIndexablePost({ slug: file.replace(/\.html$/, ''), status: 'published' }), false);
});
launch.READY_POSTS.forEach((slug) => {
    assert.ok(launch.isIndexablePost({ slug, status: 'published' }), slug + ' passes both gates');
    for (const status of ['draft', undefined, 'Published']) {
        assert.equal(launch.isIndexablePost({ slug, status }), false,
            'an audited slug still needs explicit published status');
    }
});

const posts = require(path.join(SITE, 'tools', 'build-blog.js')).readPosts();
const expected = launch.READY_PAGES.map(seo.urlFor).concat(posts
    .filter((post) => launch.isIndexablePost(post.meta))
    .map((post) => seo.BASE + '/' + post.meta.slug + '.html')).sort();
const actual = [...seo.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(actual.slice().sort(), expected, 'only reviewed canonical pages/posts enter the sitemap');
assert.equal(new Set(actual).size, actual.length, 'sitemap canonical URLs are unique');
assert.ok(seo.robots.includes('Sitemap: ' + seo.BASE + '/sitemap.xml'));
assert.ok(/^Allow: \/$/m.test(seo.robots), 'crawlers can read page-level noindex tags');
assert.ok(/^Disallow: \/app\/$/m.test(seo.robots), 'operator-app crawl handling is preserved');
assert.equal(/^Disallow: \/(?:crm|portal)\//m.test(seo.robots), false,
    'CRM/portal noindex tags remain readable instead of blocking their removal from search');

for (const file of ['crm/index.html', 'portal/index.html', 'portal/statement.html',
    'portal/scouting/index.html', 'portal/energy-scouting/index.html']) {
    assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'),
        /<meta\s+name="robots"\s+content="[^"]*noindex/i,
        file + ' keeps its private/demo noindex');
}

console.log('launch-policy-suite: ALL OK');
