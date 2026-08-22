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
const BASE = 'https://ionmininggroup.com';

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
  'contact.html':    { priority: '0.7', changefreq: 'yearly' },
  'privacy.html':    { priority: '0.3', changefreq: 'yearly' },
};

/* The home page is the site's root once the domain is attached, so it is listed
   as the bare origin rather than as /index.html. */
function urlFor(file) {
  return file === 'index.html' ? BASE + '/' : BASE + '/' + file;
}

/* ---------- robots.txt ---------- */

const robots = [
  '# ' + BASE,
  'User-agent: *',
  'Allow: /',
  '',
  'Sitemap: ' + BASE + '/sitemap.xml',
  '',
].join('\n');

/* ---------- sitemap.xml ---------- */

/* Dated from each file's own last modification, so a page that has not changed
   does not claim it has. */
function lastmod(file) {
  const p = path.join(SITE, file);
  return fs.statSync(p).mtime.toISOString().slice(0, 10);
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Object.keys(PAGES).map(f => [
    '  <url>',
    '    <loc>' + urlFor(f) + '</loc>',
    '    <lastmod>' + lastmod(f) + '</lastmod>',
    '    <changefreq>' + PAGES[f].changefreq + '</changefreq>',
    '    <priority>' + PAGES[f].priority + '</priority>',
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
  name: 'Ion Mining Group',
  url: BASE + '/',
  logo: BASE + '/favicon.svg',
  description: 'Bitcoin mining sites built on landfill gas, flared gas, and ' +
               'curtailed power. We finance, build, and operate the interruptible ' +
               'load that turns stranded energy into revenue, and host third-party fleets.',
  email: 'hello@ionmininggroup.com',
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
console.log('sitemap.xml: ' + Object.keys(PAGES).length + ' urls');

const homePath = path.join(SITE, 'index.html');
const before = fs.readFileSync(homePath, 'utf8');
const after = injectLd(before, 'index.html');
if (after !== before) fs.writeFileSync(homePath, after);
console.log('index.html: Organization structured data' + (after === before ? ' — unchanged' : ''));
