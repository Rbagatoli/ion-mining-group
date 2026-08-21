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
  'calculator.html': 'calculator',
  'contact.html': 'contact',
  /* No nav item is active on the error page — you did not navigate to it on
     purpose, so highlighting one would be a lie about where you are. */
  'privacy.html': '',
  '404.html':     '',
};

/* A platinum hydrogen atom: one shell, one proton, one electron. Hydrogen is
   the simplest thing that unmistakably reads as an atom, so it survives a 16px
   favicon without needing a stripped-down variant. Platinum carries the
   structure; the electron is the single BTC-orange element, which is also where
   the charge is — and charge is what makes an ion. */
const BRAND_MARK = `<svg width="26" height="26" viewBox="0 0 512 512" aria-hidden="true">
        <defs>
          <linearGradient id="ionMarkNavP" x1="0" y1="0" x2="1" y2="1">
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
          <linearGradient id="ionMarkNavO" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffcf8a"/>
          <stop offset="38%" stop-color="#f7a02b"/>
          <stop offset="70%" stop-color="#ffdcae"/>
          <stop offset="100%" stop-color="#e07f10"/>
          </linearGradient>
        </defs>
        <circle cx="256" cy="256" r="190" fill="none" stroke="url(#ionMarkNavP)" stroke-width="26"/>
        <circle cx="256" cy="256" r="52" fill="url(#ionMarkNavP)"/>
        <circle cx="373" cy="106" r="42" fill="url(#ionMarkNavO)"/>
        </svg>`;

function nav(active, cta) {
  const on = id => (active === id ? ' class="active"' : '');
  return `<nav class="nav">
  <div class="nav-inner">
    <a class="brand" href="./index.html">
      ${BRAND_MARK}
      <span class="brand-name">Ion <span>Mining Group</span></span>
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
      <!-- Sits after both audience pages because it is what you reach for once
           you know which side of the business you are on: you have machines,
           or you have energy. Either way the next question is the numbers. -->
      <a href="./calculator.html"${on('calculator')}>Calculator</a>
      <a href="./index.html#operate">How We Operate</a>
      <a href="./contact.html"${on('contact')}>Contact</a>
      <a class="btn btn--primary btn--sm nav-cta" href="${cta.href}">${cta.label}</a>
    </div>
  </div>
</nav>`;
}

/* Per-page CTA, preserved from what each page already had. */
const CTA = {
  'index.html':            { href: './contact.html', label: 'Start a conversation' },
  'hosting.html':          { href: './contact.html?topic=hosting', label: 'Request a quote' },
  'energy.html':           { href: '#submit', label: 'Submit a site' },
  'calculator.html':       { href: './contact.html', label: 'Talk to us' },
  'contact.html':          { href: '#form', label: 'Send a message' },
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
        <a href="mailto:hello@ionmininggroup.com">hello@ionmininggroup.com</a>`;

function replaceBlock(html, startTag, endTag, replacement, label, file) {
  const a = html.indexOf(startTag);
  if (a < 0) { console.error(`${file}: ${label} start not found`); process.exit(1); }
  const b = html.indexOf(endTag, a);
  if (b < 0) { console.error(`${file}: ${label} end not found`); process.exit(1); }
  return html.slice(0, a) + replacement + html.slice(b + endTag.length);
}

let touched = 0;
for (const [file, active] of Object.entries(PAGES)) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) { console.log(`skip (not created yet): ${file}`); continue; }
  let html = fs.readFileSync(p, 'utf8');
  const before = html;

  html = replaceBlock(html, '<nav class="nav">', '</nav>', nav(active, CTA[file]), 'nav', file);
  html = replaceBlock(html, '<h4>Company</h4>', 'hello@ionmininggroup.com</a>',
                      COMPANY_COL, 'footer Company column', file);
  html = replaceBlock(html, '<h4>Legal</h4>', 'Media &amp; enquiries</a>',
                      LEGAL_COL, 'footer Legal column', file);

  if (html !== before) { fs.writeFileSync(p, html); touched++; }
  console.log(`${file}: nav${active ? ` (active: ${active})` : ''} + footer${html === before ? ' — unchanged' : ''}`);
}
console.log(`\n${touched} file(s) rewritten`);
