/* Writes the nav and the footer's Company column into every site page from one
   definition here.

   The nav is otherwise hand-copied into every page, which drifts. Run after
   changing either:

       node tools/build-nav.js
*/
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');

/* Which nav item is highlighted on which page. */
const PAGES = {
  'index.html':   'home',
  'hosting.html': 'hosting',
  'energy.html':  'energy',
  'hardware.html': 'hardware',
  'calculator.html': 'calculator',
  /* Both highlight the same nav item. "Learn" is one slot, not two: the nav is already seven
     items and the note beside it warns against an eighth thing to read. The evergreen page is
     the destination and the blog is reached from it. */
  'why-mining.html': 'learn',
  'blog.html':    'learn',
  'contact.html': 'contact',
  /* The checkout highlights the catalogue: it is the same errand, and a nav
     item that only appears mid-purchase would be an eighth thing to read.
     What marks it instead is the order badge, which is only there when there
     is something in it. */
  'cart.html':    'hardware',
  /* No nav item is active on either: you did not navigate here, you were
     sent by an order. Both are noindex and neither is in the sitemap, for
     the same reason 404.html is not — they carry an order reference, and
     indexing one would publish a delivery address. */
  'pay.html':     '',
  'order.html':   '',
  /* No nav item is active on the error page — you did not navigate to it on
     purpose, so highlighting one would be a lie about where you are. */
  'privacy.html': '',
  '404.html':     '',
};

/* A platinum hydrogen atom: one shell, one proton, one electron. Hydrogen is the simplest
   thing that unmistakably reads as an atom, so it survives a 16px favicon without needing a
   stripped-down variant. Platinum carries the structure; the electron is the single BTC-orange
   element.

   THE RATIONALE CHANGED WITH THE NAME, and the artwork has not. This line used to end "charge
   is what makes an ion", which was the whole point of the mark and is no longer the point of
   anything. The drawing survives the rename better than the sentence did: a hydrogen nucleus
   IS a single proton, and it is already the centre of this mark.

   ONE DESIGN DECISION IS OUTSTANDING and it is the owner's, not a rename script's. The orange
   currently sits on the ELECTRON — the particle the company is no longer named after. Moving
   it to the nucleus would put the accent on the proton, and at 16px an orange centre inside a
   platinum ring reads more clearly than an orange satellite does. That is a change to the
   visual identity rather than a correction, so it has been left alone. */
const BRAND_MARK = `<svg width="26" height="26" viewBox="0 0 512 512" aria-hidden="true">
        <defs>
          <linearGradient id="protonMarkNavP" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#5c5b58"/>
          <stop offset="13%" stop-color="#b5b4b1"/>
          <stop offset="25%" stop-color="#ffffff"/>
          <stop offset="34%" stop-color="#d0cfcd"/>
          <stop offset="50%" stop-color="#83827f"/>
          <stop offset="65%" stop-color="#e8e7e5"/>
          <stop offset="76%" stop-color="#ffffff"/>
          <stop offset="89%" stop-color="#a2a19e"/>
          <stop offset="100%" stop-color="#6b6a67"/>
          </linearGradient>
          <linearGradient id="protonMarkNavO" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffcf8a"/>
          <stop offset="38%" stop-color="#f7a02b"/>
          <stop offset="70%" stop-color="#ffdcae"/>
          <stop offset="100%" stop-color="#e07f10"/>
          </linearGradient>
        </defs>
        <circle cx="256" cy="256" r="190" fill="none" stroke="url(#protonMarkNavP)" stroke-width="26"/>
        <circle cx="256" cy="256" r="52" fill="url(#protonMarkNavP)"/>
        <circle cx="373" cy="106" r="42" fill="url(#protonMarkNavO)"/>
        </svg>`;

/* THE SECOND O OF PROTON.

   The LETTER, with the metallic orange poured into it -- not a circle drawn to
   look like a letter. That is the whole of why this is a span and not an svg.

   The svg version could not be right: it had to be sized in em and nudged onto
   the baseline by hand, which meant it was never quite the width of the O beside
   it and never quite sat on the same line. A glyph has none of those problems
   because it IS the glyph -- same face, same weight, same tracking, same
   baseline, same optical size, for free and permanently.

   --metal-btc-lit rather than --metal-btc: the flat and default ramps bottom out
   around #a85a06 and #c06a08, which are too dark to read at 13px. The lit ramp
   exists for exactly this case and says so where it is defined. */
const BRAND_O = `<span class="brand-o">o</span>`;

/* Where the producer portal lives, relative to a page in site/.
   See the note beside the nav link for when this changes. */
const PORTAL_HREF = '../portal/';

function nav(active, cta) {
  const on = id => (active === id ? ' class="active"' : '');
  return `<nav class="nav">
  <div class="nav-inner">
    <a class="brand" href="./index.html">
      ${BRAND_MARK}
      <span class="brand-name">Prot${BRAND_O}n <span>Mining</span></span>
    </a>
    <button class="nav-toggle" aria-label="Menu" aria-expanded="false">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
    <div class="nav-links">
      <!-- Ordered like the drawings are: the partner's site, the mine we build
           on it, then one container inside that mine. Someone reading the nav
           left to right is walking the same chain the renderings do. -->
      <a href="./energy.html"${on('energy')}>Energy Partners</a>
      <a href="./index.html"${on('home')}>Home</a>
      <a href="./hosting.html"${on('hosting')}>Hosting</a>
      <a href="./hardware.html"${on('hardware')}>Hardware</a>
      <!-- Sits after both audience pages because it is what you reach for once
           you know which side of the business you are on: you have machines,
           or you have energy. Either way the next question is the numbers. -->
      <a href="./calculator.html"${on('calculator')}>Calculator</a>
      <!-- The argument for owning machines at all, and the posts that hang off it. Sits after
           the calculator because it is what you read when the numbers raised a question. -->
      <a href="./why-mining.html"${on('learn')}>Learn</a>
      <!-- "How We Operate" was here. Removed 24 Aug 2026 on request. The section it pointed
           at still exists on the home page and the footer still links it twice (Company, and
           "Site development" under Services) - it is out of the top nav, not off the site.
           The nav is the better place to lose an item: it was eight links wide and its
           breakpoints had to be re-measured once already to stop the page scrolling sideways. -->
      <a href="./contact.html"${on('contact')}>Contact</a>
      <!-- The order, when there is one. Hidden at zero rather than showing
           a 0, because an empty cart does not deserve a place in the nav.
           cart.js unhides it, and cart.js is on every page. -->
      <a class="nav-cart" id="navCart" href="./cart.html" hidden>Order <span class="nav-cart-n" data-cart-count>0</span></a>
      <!-- For people who are already counterparties, not for prospects — so it sits apart from
           the audience pages and is styled quietly rather than as a call to action. Somebody
           choosing between Hosting and Energy is not looking for this; somebody who already
           signed something is, and they know it exists because we told them.

           PATH: the portal is a sibling of site/ in the repo, so ../portal/ is correct for the
           current layout, where Pages publishes the root and site/ is excluded. If the marketing
           site ever becomes the domain root, this becomes /portal/ — one line, here. -->
      <a class="btn btn--ghost btn--sm nav-signin" href="${PORTAL_HREF}">Client portal</a>
      <a class="btn btn--primary btn--sm nav-cta" href="${cta.href}">${cta.label}</a>
    </div>
  </div>
</nav>`;
}

/* Per-page CTA, preserved from what each page already had. */
const CTA = {
  'index.html':            { href: './contact.html', label: 'Start a conversation' },
  // Hosting sells the pad, but the machines on it have to come from somewhere, and a
  // prospect who does not own ASICs yet cannot act on a hosting quote. The page's own copy
  // already says Proton will "source and host them on one agreement", so the top-of-page
  // action is the catalogue and the quote request stays on the sections that are about
  // machines somebody already has.
  'hosting.html':          { href: './hardware.html', label: 'Start mining' },
  'energy.html':           { href: '#submit', label: 'Submit a site' },
  'hardware.html':         { href: '#quote', label: 'Request a quote' },
  'calculator.html':       { href: './contact.html', label: 'Talk to us' },
  'why-mining.html':       { href: './hardware.html', label: 'Start mining' },
  'blog.html':             { href: './why-mining.html', label: 'Why own machines' },
  'contact.html':          { href: '#form', label: 'Send a message' },
  'cart.html':             { href: './hardware.html', label: 'Add machines' },
  'pay.html':              { href: './hardware.html', label: 'Back to the catalogue' },
  'order.html':            { href: './hardware.html', label: 'Order more machines' },
  'privacy.html':          { href: './contact.html', label: 'Talk to us' },
  '404.html':              { href: './index.html', label: 'Home page' },
};

/* The footer Legal column, generated for the same reason the Company one is:
   it was hand-copied into every page and pointed at the APP's privacy policy,
   which is written for account holders and lists QuickBooks and Firebase. A
   visitor here is not an app user, and that policy does not mention the two
   services the calculator calls. */
const LEGAL_COL = `<h4>Legal</h4>
        <a href="./privacy.html">Privacy</a>
        <a href="./contact.html">Media &amp; enquiries</a>`;

const COMPANY_COL = `<h4>Company</h4>
        <a href="./index.html#operate">How we operate</a>
        <a href="./contact.html">Contact</a>
        <a href="mailto:hello@protonminingco.com">hello@protonminingco.com</a>`;

/* ---- the page is not blank without JavaScript ----

   styles.css sets `.reveal { opacity: 0 }` and the ONLY thing that ever adds `.reveal.in` is
   site.js. So with scripting off, every element carrying .reveal stays invisible — which on
   most pages here is the entire body. The page loads, returns 200, and shows a nav and a
   footer with nothing between them.

   It is easy to miss because the two ways you would notice both hide it: the reduced-motion
   media query at styles.css:2426 already forces .reveal visible, so anyone testing with
   reduced motion sees a correct page, and a headless render with JS enabled is fine too.

   Fixed here rather than on one page because it is true of all of them, and generated rather
   than pasted because the next page added would not have it. calculator.html and energy.html
   already use <noscript><style> for their own reasons, so the idiom is house style. */
const NOSCRIPT = '<noscript><style>.reveal { opacity: 1; transform: none; }</style></noscript>';

/* ---- the launch hold ----
   The site is live and unfinished, so every page asks not to be indexed until launch.js says
   otherwise. Written by the generator rather than pasted, for the same reason the nav is: the
   next page somebody adds would not have it. */
const { INDEXABLE, HOLD_TAG } = require('./launch.js');

/* Matched with the tag optional, so this both ADDS it while the hold is on and REMOVES it when
   the hold lifts. A one-way injector would leave seventeen pages noindexed after launch, which
   is the failure that looks exactly like nothing happening. */
const HOLD_ANCHOR = /(<meta name="theme-color" content="#000000">)(\s*<meta name="robots" content="noindex, nofollow">)?/;

function applyHold(html, file) {
  if (!HOLD_ANCHOR.test(html)) {
    console.error(file + ': no theme-color meta to anchor the robots tag to');
    process.exit(1);
  }
  /* 404.html carries its own noindex for its own reason and keeps it either way. */
  if (/<meta name="robots" content="noindex[^>]*>/.test(html) && !INDEXABLE) {
    return html.replace(HOLD_ANCHOR, (m, anchor) => anchor + '\n' + HOLD_TAG);
  }
  return html.replace(HOLD_ANCHOR, (m, anchor) => anchor + (INDEXABLE ? '' : '\n' + HOLD_TAG));
}

/* Placed straight after the stylesheet link so it can override it, and matched with the
   cache-busting stamp optional — build-asset-stamp.js rewrites that hash on every run, and an
   anchor that assumed a particular one would work exactly once. */
const CSS_LINK = /(<link rel="stylesheet" href="\.\/styles\.css(?:\?v=[0-9a-f]+)?">)(\s*<noscript><style>[^<]*<\/style><\/noscript>)?/;

function ensureNoscript(html, file) {
  if (!CSS_LINK.test(html)) {
    console.error(file + ': no stylesheet link to anchor the noscript block to');
    process.exit(1);
  }
  return html.replace(CSS_LINK, (m, link) => link + '\n' + NOSCRIPT);
}

function replaceBlock(html, startTag, endTag, replacement, label, file) {
  const a = html.indexOf(startTag);
  if (a < 0) { console.error(`${file}: ${label} start not found`); process.exit(1); }
  const b = html.indexOf(endTag, a);
  if (b < 0) { console.error(`${file}: ${label} end not found`); process.exit(1); }
  return html.slice(0, a) + replacement + html.slice(b + endTag.length);
}

/* EXPORTED so build-blog.js can build a whole page with the same nav rather than a copy of it.
   Post pages are generated in full, so they cannot be spliced by the loop below the way a
   hand-authored page is - and a second copy of the nav is the exact drift this file exists to
   stop. Run build-blog.js after this one and generated pages pick up any nav change. */
module.exports = { nav, CTA, PAGES, COMPANY_COL, LEGAL_COL, BRAND_MARK };

/* Guarded, so requiring this file does not rewrite eleven pages as a side effect. */
if (require.main !== module) return;

let touched = 0;
for (const [file, active] of Object.entries(PAGES)) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) { console.log(`skip (not created yet): ${file}`); continue; }
  let html = fs.readFileSync(p, 'utf8');
  const before = html;

  html = applyHold(html, file);
  html = ensureNoscript(html, file);
  html = replaceBlock(html, '<nav class="nav">', '</nav>', nav(active, CTA[file]), 'nav', file);
  html = replaceBlock(html, '<h4>Company</h4>', 'hello@protonminingco.com</a>',
                      COMPANY_COL, 'footer Company column', file);
  html = replaceBlock(html, '<h4>Legal</h4>', 'Media &amp; enquiries</a>',
                      LEGAL_COL, 'footer Legal column', file);

  if (html !== before) { fs.writeFileSync(p, html); touched++; }
  console.log(`${file}: nav${active ? ` (active: ${active})` : ''} + footer${html === before ? ' — unchanged' : ''}`);
}
console.log(`\n${touched} file(s) rewritten`);
