/* Writes robots.txt, sitemap.xml, and the JSON-LD block on the home page.

   Run after adding or removing a page:

       node tools/build-seo.js

   BASE is the one place the site's origin is written. The <link rel="canonical">
   and og:url tags already in each page assume the same origin, and a test
   asserts they agree — a sitemap that disagrees with the canonicals tells search
   engines two different things about the same page.

   As site/README.md notes, that origin is correct only once the custom domain is
   attached and serving this directory. Until then it points at a URL that does
   not resolve, which is a launch item rather than a bug in this script. */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const BASE = 'https://protonminingco.com';

/* Which pages belong in the sitemap, and how much of the site each one is.
   404.html is deliberately absent: it carries <meta name="robots" content
   ="noindex">, and listing a page you have asked not to be indexed is a
   contradiction. The keys are checked against build-nav.js's PAGES by
   calc-suite.js so a new page cannot be added to one and forgotten in the
   other. */
const PAGES = {
  'index.html':      { priority: '1.0', changefreq: 'monthly' },
  'energy.html':     { priority: '0.9', changefreq: 'monthly' },
  'hosting.html':    { priority: '0.9', changefreq: 'monthly' },
  'calculator.html': { priority: '0.8', changefreq: 'monthly' },
  'hardware.html':   { priority: '0.8', changefreq: 'monthly' },
  /* Low: a step inside a purchase, not a page anyone should land on cold.
     Listed rather than excluded so it is not treated as an orphan. */
  'cart.html':       { priority: '0.2', changefreq: 'monthly' },
  /* The evergreen page is the one meant to rank for a question somebody types into a search
     box, so it is weighted with the two audience pages rather than below them. The index
     changes whenever a post lands; the posts themselves do not change once written. */
  'why-mining.html': { priority: '0.9', changefreq: 'monthly' },
  'blog.html':       { priority: '0.6', changefreq: 'weekly' },
  'contact.html':    { priority: '0.7', changefreq: 'yearly' },
  'privacy.html':    { priority: '0.3', changefreq: 'yearly' },
};

/* The home page is the site's root once the domain is attached, so it is listed
   as the bare origin rather than as /index.html. */
function urlFor(file) {
  return file === 'index.html' ? BASE + '/' : BASE + '/' + file;
}

/* ---------- blog posts ----------

   READ FROM site/posts/, not listed in PAGES above. Posts arrive faster than anybody remembers
   to edit a registry, and a post that is live but absent from the sitemap is a page nobody
   finds — which is the entire point of writing it.

   PUBLISHED ONLY. A draft carries noindex, and advertising a page you have asked not to be
   indexed is the same contradiction 404.html is kept out of the sitemap for.

   build-blog.js is required rather than reimplemented, so there is one front-matter parser and
   one definition of what "published" means. It exports without generating anything. */
function postUrls() {
  let posts = [];
  try {
    posts = require('./build-blog.js').readPosts();
  } catch (e) {
    console.error('build-seo.js: could not read posts — ' + e.message);
    process.exit(1);
  }
  return posts
    .filter((p) => p.meta.status === 'published')
    .map((p) => ({
      loc: BASE + '/' + p.meta.slug + '.html',
      /* The post's own date, not the file's mtime. Regenerating a page does not revise what it
         says, and telling a crawler it did is how a sitemap stops being believed. */
      lastmod: p.meta.date,
      changefreq: 'yearly',
      priority: '0.5'
    }));
}

/* ---------- robots.txt ---------- */

/* THIS becomes the live robots.txt once the marketing site is served at the origin root. The
   one at the repository root is a different file for a different situation — it covers the
   period while the operator app is what Pages serves, and it disallows everything.

   /app/ is disallowed because .github/workflows/pages.yml puts the operator app and the 18MB
   of prospecting data it loads at that path. /portal/ is deliberately NOT disallowed: both its
   pages already carry noindex, the marketing nav links it from every page, and a page that is
   never fetched is a page whose noindex is never read. */
const { INDEXABLE } = require('./launch.js');

const robots = [
  '# ' + BASE,
  'User-agent: *',
  'Allow: /',
  '',
  '# The operator app, and the prospecting data it fetches at runtime. Neither was written',
  '# to be found in a search result.',
  'Disallow: /app/',
  '',
  '# Crawlable on purpose — see above.',
  'Allow: /portal/',
  '',
  /* THE SITEMAP IS NAMED ONLY WHEN THE SITE IS INDEXABLE. While the launch hold is on, every
     page carries noindex, and advertising a list of pages you have asked not to be indexed is
     the same contradiction 404.html and draft posts are kept out of the sitemap for. The file
     is still generated and stays current; it is simply not pointed at yet. */
  ...(INDEXABLE
      ? ['Sitemap: ' + BASE + '/sitemap.xml']
      : ['# Sitemap withheld: the site is live but not finished, and every page currently',
         '# carries noindex. See site/tools/launch.js. Crawling stays allowed so that tag',
         '# can actually be read.']),
  '',
].join('\n');

/* ---------- sitemap.xml ---------- */

/* NO <lastmod> ON THE STATIC PAGES, deliberately.

   It used to be each file's mtime, under a comment saying "so a page that has
   not changed does not claim it has". The code could not deliver that.
   build-asset-stamp.js rewrites every HTML file on every run, so the mtime this
   read was always the date of the last build - ten pages all claiming they
   changed today, every single time the generators ran.

   That is a fabricated freshness signal, and it is the one field in a sitemap a
   crawler will stop believing wholesale once it catches it being wrong. It also
   made this generator's output depend on the wall clock, which is what broke the
   deploy of 8622d2b: the push crossed UTC midnight, CI regenerated the file with
   the next day's date, and the "generated output is current" gate correctly
   called the committed one stale. The site sat a commit behind for a reason that
   had nothing to do with the site.

   The posts keep theirs because they have a real one - an authored date in the
   front-matter, a fact about the writing rather than about the build. The pages
   have no such date anywhere in the repo, and the honest thing to do with a
   field you cannot fill truthfully is to leave it out. It is optional in the
   protocol.

   If the pages ever need one, give them an authored date in PAGES above, the way
   a post gets one. Do not derive it from the filesystem again. */

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Object.keys(PAGES).map(f => [
    '  <url>',
    '    <loc>' + urlFor(f) + '</loc>',
    '    <changefreq>' + PAGES[f].changefreq + '</changefreq>',
    '    <priority>' + PAGES[f].priority + '</priority>',
    '  </url>',
  ].join('\n')),
  ...postUrls().map(u => [
    '  <url>',
    '    <loc>' + u.loc + '</loc>',
    '    <lastmod>' + u.lastmod + '</lastmod>',
    '    <changefreq>' + u.changefreq + '</changefreq>',
    '    <priority>' + u.priority + '</priority>',
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n');

/* ---------- structured data ---------- */

/* Only what is true today.

   No address, no telephone, no foundingDate, no numberOfEmployees: every one of
   those is still a [PLACEHOLDER] span in the markup. The placeholder convention
   exists so nothing unverified ships by accident, and JSON-LD is the one place a
   false claim would be machine-readable — a search engine will repeat it back as
   fact. Add these here at the same time the spans are filled in, not before. */
const LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Proton Mining',
  url: BASE + '/',
  logo: BASE + '/favicon.svg',
  description: 'Bitcoin mining sites built on landfill gas, flared gas, and ' +
               'curtailed power. We finance, build, and operate the interruptible ' +
               'load that turns stranded energy into revenue, and runs the machines it sells.',
  email: 'hello@protonminingco.com',
};

const LD_BLOCK = '<script type="application/ld+json">\n' +
  JSON.stringify(LD, null, 2) + '\n</script>';

/* Spliced between markers so re-running replaces rather than appends. */
const LD_START = '<!-- ===== STRUCTURED DATA ===== -->';
const LD_END = '<!-- ===== /STRUCTURED DATA ===== -->';

function injectLd(html, file) {
  const block = LD_START + '\n' + LD_BLOCK + '\n' + LD_END;
  const a = html.indexOf(LD_START);
  if (a >= 0) {
    const b = html.indexOf(LD_END, a);
    if (b < 0) { console.error(`${file}: structured-data end marker missing`); process.exit(1); }
    return html.slice(0, a) + block + html.slice(b + LD_END.length);
  }
  /* First run: land it just before </head>. */
  const head = html.indexOf('</head>');
  if (head < 0) { console.error(`${file}: no </head>`); process.exit(1); }
  return html.slice(0, head) + block + '\n' + html.slice(head);
}

/* ---------- write ---------- */

fs.writeFileSync(path.join(SITE, 'robots.txt'), robots);
console.log('robots.txt: ' + Object.keys(PAGES).length + ' pages allowed, sitemap pointed at ' + BASE);

fs.writeFileSync(path.join(SITE, 'sitemap.xml'), sitemap);
console.log('sitemap.xml: ' + Object.keys(PAGES).length + ' pages + ' +
            postUrls().length + ' published post(s)');

const homePath = path.join(SITE, 'index.html');
const before = fs.readFileSync(homePath, 'utf8');
const after = injectLd(before, 'index.html');
if (after !== before) fs.writeFileSync(homePath, after);
console.log('index.html: Organization structured data' + (after === before ? ' — unchanged' : ''));
