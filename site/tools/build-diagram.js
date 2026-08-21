/* Emits a diagram section into a page.

   The static angle-0 frame comes from the SAME module the browser runs, so the
   no-JS render and the interactive one cannot drift apart. Re-run after any
   change to a scene:

       node tools/build-diagram.js            # both pages
       node tools/build-diagram.js hosting    # just one

   The story runs across two pages:

       home     the whole site, with a toggle through to
       hosting  one container  ->  one machine, cross-dissolved by a slider

   So the home page emits ONE drawing plus a toggle whose second segment is a
   link, and the hosting page emits a PAIR stacked in one grid cell — plus its
   own toggle pointing back up the chain. A page may carry either control or
   both.

   The page — not the scene module — says where each drawing goes, under what id prefix,
   and which other views it moves with. Those travel as data-scene, data-prefix
   and data-link on the wrapper. Without a prefix, two diagrams on one page
   would both answer to dg-flow, dg-s0-top, dg-zoom-in and the rest.
*/
const fs = require('fs');
const path = require('path');

const PAGES = {
  site: {
    target: '../index.html',
    sectionId: 'inside',
    marker: 'INSIDE A SITE',
    insertBefore: '<!-- ===== THE MODEL ===== -->',
    eyebrow: 'Inside our mine',
    heading: 'What we actually build.',
    lede: 'Gas that would otherwise be flared, engines to burn it, a transformer, and containers of machines. Cut the wall away and this is the whole of it.',
    deps: ['site-kit.js'],
    chain: 'site',
    views: [
      { key: 'site', name: 'site', module: '../scene-site.js',
        script: 'scene-site.js', prefix: '',
        alt: 'Interactive cutaway of a containerised bitcoin mining deployment: gas conditioning, generation, a transformer, and two shipping containers of ASIC miners. Drag to rotate, scroll to zoom.' },
    ],
  },
  hosting: {
    target: '../hosting.html',
    sectionId: 'inside-container',
    marker: 'INSIDE A HOSTED CONTAINER',
    insertBefore: '<!-- ===== TERMS ===== -->',
    eyebrow: 'Inside the container',
    heading: 'Where your machines actually sit.',
    lede: 'The same list again, as a place: filtered air in one end, your racks in the middle, metering on every circuit, and the heat leaving the far end. Pull the slider to go from the whole container down to a single machine.',
    link: 'hosting',
    chain: 'cont',
    scale: { lo: 'Whole container', hi: 'One machine',
             label: 'Detail level: the whole container, or one machine' },
    views: [
      { key: 'cont', name: 'hosting', module: '../scene-hosting.js',
        script: 'scene-hosting.js', prefix: '',
        alt: 'Interactive cutaway of a hosting container: filtered intake, cold aisle, racked ASIC miners, metered power distribution, network, spares, and hot aisle exhaust. Drag to rotate, scroll to zoom.' },
      { key: 'asic', name: 'asic', module: '../scene-asic.js',
        script: 'scene-asic.js', prefix: 'a-',
        alt: 'Interactive cutaway of an Antminer S21 Pro: four 140 mm fans in two stacked pairs, three hashboards under finned heatsinks, copper busbars, the integrated power supply, and the control board. Drag to rotate, scroll to zoom.',
        note: 'Modelled on an Antminer S21 Pro &mdash; 450 &times; 219 &times; 293 mm, four 140 mm fans, three hashboards.' },
    ],
  },
  energy: {
    target: '../energy.html',
    sectionId: 'the-pad',
    marker: 'THE PAD',
    insertBefore: '<!-- ===== WHAT EACH SIDE BRINGS ===== -->',
    /* Literal em dash, not an entity: lede/heading/eyebrow all go through
       esc(), which would turn &mdash; into &amp;mdash; and print it. Only
       'note' is inserted raw and may carry entities. */
    eyebrow: 'Your site, before and after',
    heading: 'The flare goes out. Nothing else moves.',
    lede: 'One pad, drawn twice from the same angle. Pull the slider and the gas stops going up the stack and starts going into engines. Your wellhead, your separator, your tanks and your flare stay exactly where they are — because in practice that is what changes and what does not.',
    /* The two states share the same camera, so the slider reads as one site
       changing rather than as two drawings. There is no toggle: this page is
       not a step in the index -> hosting sequence, it is its own argument. */
    link: 'pad',
    chain: 'pad',
    deps: ['pad-geometry.js', 'site-kit.js'],
    /* The other two drawings are cutaways: you are looking THROUGH a container
       wall at what is racked inside it, and the near faces have to be nearly
       transparent for that to work at all. This one is not a cutaway. It is
       solid plant standing on open ground, and at cutaway weights it read as a
       ghost of a site rather than a site. */
    scale: { lo: 'Your pad today', hi: 'With Ion on it',
             label: 'Your pad as it is today, or the same pad with Ion on it' },
    views: [
      { key: 'now', name: 'padnow', module: '../scene-pad-now.js',
        script: 'scene-pad-now.js', prefix: '',
        alt: 'Interactive drawing of a wellpad as it operates today: wellhead, separator, tank battery, and a lit flare stack burning the gas that has no customer. Drag to rotate, scroll to zoom.' },
      { key: 'ion', name: 'padion', module: '../scene-pad-ion.js',
        script: 'scene-pad-ion.js', prefix: 'i-',
        alt: 'The same wellpad with Ion on it: the flare down to a pilot, and a tie-in running gas through a conditioning skid, an enclosed genset, a transformer, and two containers of miners — the same equipment drawn on the home page. Drag to rotate, scroll to zoom.',
        note: 'The flare stack stays. It remains permitted and available for upsets, and for any time you take the gas back.' },
    ],
  },
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ARROW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_BACK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';

/* The three drawings are one sequence, read upstream to downstream, and named by
   whose each one is. That is the real difference between the first two: the
   partner owns the land, we own the plant standing on it.

   It is a true nesting, not a figure of speech — the energy drawing's "with
   Ion" state is built from site-kit.js, so it contains the very gas skid,
   genset, transformer and container shells the home page draws, which in turn
   contains the one container the hosting page opens up.

   "Site" used to name two of them at once: the home page's eyebrow said
   "Inside a site" while the energy page's said "Your site".

   Every drawing carries the WHOLE chain rather than just the next step, so any
   of them is one click from any other. It used to be a two-segment control that
   only knew about its neighbour, which meant the energy drawing could not be
   reached from either of the others and had no way back.

   One list, so a label or a target can only be wrong in one place. */
const CHAIN = [
  { key: 'pad',  label: 'Your site',     href: './energy.html#the-pad' },
  { key: 'site', label: 'Our mine',      href: './index.html#inside' },
  { key: 'cont', label: 'One container', href: './hosting.html#inside-container' },
];

function chainOf(key) {
  const at = CHAIN.findIndex(s => s.key === key);
  if (at < 0) return '';
  const seg = CHAIN.map((s, i) => {
    if (i === at) {
      return `<span class="dg-toggle-on" aria-current="true">${esc(s.label)}</span>`;
    }
    /* The arrow travels the way the reader does: back-pointing and leading for
       a stop earlier in the chain, forward-pointing and trailing for a later
       one. */
    const back = i < at;
    return `<a class="dg-toggle-to${back ? ' dg-toggle-to--back' : ''}" href="${s.href}">` +
           (back ? `${ARROW_BACK}\n        ${esc(s.label)}`
                 : `${esc(s.label)}\n        ${ARROW}`) +
           `\n      </a>`;
  });
  return `
    <div class="dg-toggle reveal">
      ${seg.join('\n      ')}
    </div>`;
}


/* ---- the pieces one view is made of. p is the id prefix. ---- */

function svgOf(D, alt, p) {
  const f = D.frame(0, null);

  const slots = f.slots.map((L, i) => '\n        <g class="dg-slot">' +
    D.LAYERS.map(k => `<path class="dg-${k}" id="${p}dg-s${i}-${k}" d="${L[k]}"/>`).join('') +
    '</g>').join('');

  const leaders = f.leaders.map(L =>
    `\n        <line class="dg-lead" id="${p}dg-lead-${L.id}" x1="${L.x1}" y1="${L.y1}" x2="${L.x2}" y2="${L.y2}"/>`
  ).join('');

  const nodes = D.CALLOUTS.map(co => {
    const [x, y] = D.calloutOrigin(co);
    return `\n        <rect class="dg-node" x="${x - 2.5}" y="${y - 2.5}" width="5" height="5"/>`;
  }).join('');

  // Invisible pointer targets, largest first so the smallest region ends up on
  // top and wins. They carry data-region; the geometry slots cannot, because a
  // slot holds a different object from one frame to the next.
  const hits = f.hits.map((h, i) =>
    `\n        <path class="dg-hit" id="${p}dg-hit${i}" data-region="${h.id}" d="${h.d}"/>`
  ).join('');

  return `<svg class="site-diagram" id="${p}siteDiagram" viewBox="0 0 ${D.VB.w} ${D.VB.h}" preserveAspectRatio="xMidYMid meet" tabindex="0" role="img" aria-label="${esc(alt)}">
        <path class="dg-flow" id="${p}dg-flow" d="${f.flow}"/>${slots}
        <path class="dg-highlight" id="${p}dg-highlight" d=""/>${leaders}${nodes}${hits}
      </svg>`;
}

// Bubbles are HTML, not SVG: <text> does not wrap, and these descriptions
// overflow a fixed box. The SVG is width:100% with a matching aspect ratio,
// so viewBox units map to percentages exactly.
function bubblesOf(D) {
  return D.CALLOUTS.map(co => {
    const [, y] = D.calloutOrigin(co);
    return `
      <div class="dg-callout dg-callout--${co.side}" data-region="${co.id}" tabindex="0" style="top:${(y / D.VB.h * 100).toFixed(2)}%">
        <span class="dg-c-title">${esc(co.title)}</span>
        <span class="dg-c-desc">${esc(co.desc)}</span>
      </div>`;
  }).join('');
}

function controlsOf(p) {
  return `
      <div class="dg-controls">
        <button type="button" id="${p}dg-zoom-out" aria-label="Zoom out">&minus;</button>
        <button type="button" id="${p}dg-zoom-in" aria-label="Zoom in">+</button>
        <button type="button" id="${p}dg-reset" aria-label="Reset view">Reset</button>
      </div>`;
}

function listOf(D) {
  return D.CALLOUTS.map(c =>
    `\n      <li><span class="dg-list-title">${esc(c.title)}</span><span class="dg-list-desc">${esc(c.desc)}</span></li>`
  ).join('');
}

const HINT = '<p class="dg-hint">Drag to rotate &middot; hover a part to identify it &middot; scroll to zoom</p>';

/* ---- writing it back ---- */

function splice(cfg, section, scripts) {
  const OUT = path.join(__dirname, cfg.target);
  const open = `<!-- ===== ${cfg.marker} ===== -->`;
  let html = fs.readFileSync(OUT, 'utf8');
  if (!html.includes(cfg.insertBefore)) {
    console.error(`anchor not found in ${cfg.target}`);
    process.exit(1);
  }
  const start = html.indexOf(open);
  if (start >= 0) html = html.slice(0, start) + section + html.slice(html.indexOf(cfg.insertBefore));
  else html = html.replace(cfg.insertBefore, section + cfg.insertBefore);

  /* The engine goes in ONCE, however many scenes a page carries. Two copies
     would mean two module instances, two separate link registries, and a
     shared view that silently is not shared. */
  /* The wrappers carry an .anim-field canvas, so the page needs the script that
     drives them — emitting the element without the driver leaves a dead canvas. */
  scripts = ['hero-anim.js'].concat(scripts);

  if (!html.includes('src="./diagram-engine.js"')) {
    html = html.replace('<script src="./site.js"></script>',
      '<script src="./site.js"></script>\n<script src="./diagram-engine.js"></script>');
  }

  /* Emit the whole block in declared order, every run.

     This used to splice each script in directly after the engine tag and skip
     any that were already present. Both halves of that were wrong: splicing
     after a fixed anchor reverses the list, and skipping what exists means the
     final order records the order pages were built in rather than the order
     declared here. It survived only because nothing depended on load order.

     Something does now — a scene that shares geometry with another reads it
     from a module that has to have run first — so the tags are removed and
     rewritten as one ordered block, which is also idempotent. */
  scripts.forEach(s => {
    html = html.replace(`\n<script src="./${s}"></script>`, '');
  });
  html = html.replace('<script src="./diagram-engine.js"></script>',
    '<script src="./diagram-engine.js"></script>\n' +
    scripts.map(s => `<script src="./${s}"></script>`).join('\n'));
  fs.writeFileSync(OUT, html);
}

/* ---- a page: two views behind a slider ---- */

function build(key) {
  const cfg = PAGES[key];
  const views = cfg.views.map(v => ({ ...v, D: require(path.join(__dirname, v.module)) }));

  const vb = views[0].D.VB;
  views.forEach(v => {
    if (v.D.VB.w !== vb.w || v.D.VB.h !== vb.h) {
      console.error(`${key}: view "${v.key}" has viewBox ${v.D.VB.w}x${v.D.VB.h}, ` +
                    `but "${views[0].key}" has ${vb.w}x${vb.h}. Stacked views must ` +
                    `share one aspect ratio or the section changes height as the slider moves.`);
      process.exit(1);
    }
  });

  const pair = views.length > 1;

  const wraps = views.map(v => {
    const svg = svgOf(v.D, v.alt, v.prefix);
    const note = v.note ? `\n        <p class="dg-note">${v.note}</p>` : '';
    const link = cfg.link ? ` data-link="${cfg.link}"` : '';
    return `
      <div class="dg-wrap dg-wrap--${v.key}${pair ? '' : ' reveal'}" data-view="${v.key}" data-scene="${v.name}" data-prefix="${v.prefix}"${link}>
        <canvas class="anim-field anim-field--dg" data-w="${v.D.VB.w}" data-h="${v.D.VB.h}" aria-hidden="true"></canvas>
        ${svg}${bubblesOf(v.D)}${controlsOf(v.prefix)}
        ${HINT}${note}
      </div>`;
  }).join('');

  const lists = views.map(v =>
    `\n    <ol class="dg-list dg-list--${v.key} reveal">${listOf(v.D)}
    </ol>`).join('');

  /* Two controls, and a page can carry either or both:

       the TOGGLE crosses pages. Its second segment is a link, so stepping to
       the next drawing is a deliberate navigation rather than a drag that
       surprises you by leaving the page.

       the SLIDER works within a page, cross-dissolving two stacked views. */
  const toggle = chainOf(cfg.chain);

  /* The hint is aria-hidden: the input already carries a label saying what the
     two ends are, and a screen reader gets no use from being told to drag. */
  const slider = pair ? `
    <div class="dg-scale reveal">
      <span class="dg-scale-end" data-end="lo">${esc(cfg.scale.lo)}</span>
      <span class="dg-scale-track">
        <input class="dg-scale-input" id="dgScale" type="range" min="0" max="100" step="1" value="0"
               aria-label="${esc(cfg.scale.label)}">
        <span class="dg-scale-hint" aria-hidden="true">${ARROW_BACK}Drag to compare${ARROW}</span>
      </span>
      <span class="dg-scale-end" data-end="hi">${esc(cfg.scale.hi)}</span>
    </div>` : '';

  const control = toggle + slider;

  const body = pair ? `
    <!-- Both views share one grid cell, so the taller sets the height and the
         section never changes size as the slider moves. -->
    <div class="dg-views reveal" id="dgViews" style="--d:0">${wraps}
    </div>` : wraps;

  const section = `<!-- ===== ${cfg.marker} ===== -->
<section class="band" id="${cfg.sectionId}">
  <div class="wrap">
    <div class="reveal" style="margin-bottom:40px">
      <div class="eyebrow">${esc(cfg.eyebrow)}</div>
      <h2 class="h-section">${esc(cfg.heading)}</h2>
      <p class="lede" style="margin-top:20px">${esc(cfg.lede)}</p>
    </div>${control}${body}
    <!-- Below 900px the drawing is too dense to read and there is no pointer to
         hover with, so the same callouts carry the content as a plain list.
         Generated from the same source. -->${lists}
  </div>
</section>

`;

  /* deps come first: a scene that reads shared geometry needs that module to
     have executed before it does. */
  splice(cfg, section, (cfg.deps || []).concat(views.map(v => v.script)));
  console.log(`${key}: ${views.length} views [${views.map(v =>
    `${v.key}(${v.name}) ${v.D.SLOTS}x${v.D.LAYERS.length} ${v.D.CALLOUTS.length}co` +
    (v.prefix ? ` "${v.prefix}"` : '')).join(', ')}]${cfg.link ? ` link "${cfg.link}"` : ''} chain@${cfg.chain} ` +
    `-> ${path.basename(cfg.target)}`);
}

const only = process.argv[2];
if (only && !PAGES[only]) {
  console.error(`unknown page "${only}". known: ${Object.keys(PAGES).join(', ')}`);
  process.exit(1);
}
(only ? [only] : Object.keys(PAGES)).forEach(build);
