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
        alt: 'Interactive cutaway of a containerised bitcoin mining deployment: gas conditioning, generation, a transformer, and four shipping containers of hydro-cooled ASIC miners. Drag to rotate, scroll to zoom.' },
    ],
  },
  hosting: {
    target: '../hosting.html',
    sectionId: 'inside-container',
    marker: 'INSIDE A HOSTED CONTAINER',
    insertBefore: '<!-- ===== TERMS ===== -->',
    eyebrow: 'Inside the container',
    heading: 'Where your machines actually sit.',
    lede: 'The same list again, as a place: a closed water loop, your racks in the middle, metering on every circuit, and the heat leaving through the cooler on the roof. Pull the slider to go from the whole container down to a single machine.',
    link: 'hosting',
    chain: 'cont',
    /* scene-hosting.js reads KIT.COOLER so its roof cooler cannot drift from the one
       site-kit.js draws on every other container. Without this the page loaded the scene
       before SiteKit existed, the module threw, and hosting.html silently fell back to its
       baked static frame — which was still the old air-cooled drawing. The figure looked
       merely un-updated rather than broken, which is the worst way for it to fail. */
    deps: ['site-kit.js'],
    scale: { lo: 'Whole container', hi: 'One machine',
             label: 'Detail level: the whole container, or one machine' },
    views: [
      { key: 'cont', name: 'hosting', module: '../scene-hosting.js',
        script: 'scene-hosting.js', prefix: '',
        alt: 'Interactive cutaway of a hydro-cooled hosting container: a closed coolant loop with supply and return manifolds, racked ASIC miners on quick-disconnect couplings, the coolant distribution unit, metered power distribution, network, spares, and the dry cooler on the roof. Drag to rotate, scroll to zoom.' },
      { key: 'asic', name: 'asic', module: '../scene-asic.js',
        script: 'scene-asic.js', prefix: 'a-',
        /* "Antminer S21+ Hyd." keeps its trailing period: asic-suite.js builds both of these
           strings from MODEL.name, so the machine the page names and the machine the drawing
           is proportioned from cannot drift apart. Dropping the period fails the suite. */
        alt: 'Interactive cutaway of an Antminer S21+ Hyd. Two OD10 coolant ports on a sealed end plate, three hashboards under clamped cold plates, copper busbars, the integrated power supply, and the control board. It has no fans. Drag to rotate, scroll to zoom.',
        note: 'Modelled on an Antminer S21+ Hyd. &mdash; 339 &times; 173 &times; 207 mm, hydro-cooled on an OD10 loop, no fans, three hashboards.' },
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
    /* FUEL-NEUTRAL ON PURPOSE, and it has to stay that way. This paragraph
       opens the drawing for BOTH fuels, so it may not name a wellhead, a
       separator or a tank battery: a landfill has none of them. It says "your
       existing equipment" and lets whichever drawing is on screen be the
       specific one. Changing it back here silently reverts energy.html on the
       next build. */
    lede: 'One site, drawn twice from the same angle. Pull the slider and the gas stops going up the stack and starts going into engines. Your collection system, your existing equipment and your flare stay exactly where they are — because in practice that is what changes and what does not.',
    chain: 'pad',
    /* pad-geometry.js FIRST. landfill-geometry.js is built on its primitives
       and reads root.PadGeometry at load. */
    deps: ['pad-geometry.js', 'landfill-geometry.js', 'site-kit.js'],
    /* TWO FUELS, ONE ON SCREEN AT A TIME.

       Landfill leads because that is the market we are going after first, so
       it is the pane the section opens on. Flared gas is still served and is
       one click away — the pad drawing is untouched, it simply no longer opens
       the section.

       Both fuels are drawn twice and each pair shares ITS OWN camera: the two
       links below must differ, or turning the landfill would turn the wellpad
       behind it and the pane you switch to would be facing somewhere you never
       put it.

       Neither drawing is a cutaway — unlike the other two pages, where you look
       THROUGH a container wall and the near faces have to be nearly
       transparent. These are solid plant standing on open ground, and at
       cutaway weights they read as a ghost of a site rather than a site. */
    fuelLabel: 'Which kind of site is yours?',
    fuels: [
      {
        key: 'landfill', label: 'Landfill gas', link: 'landfill',
        scale: { lo: 'Your site today', hi: 'With Proton on it',
                 label: 'Your landfill as it is today, or the same site with Proton on it' },
        views: [
          { key: 'now', name: 'landfillnow', module: '../scene-landfill-now.js',
            script: 'scene-landfill-now.js', prefix: 'l-',
            /* WRITTEN, NOT COPIED FROM THE PAD. A screen reader that is told
               about a separator and a tank battery has been told about a site
               that is not on the screen. */
            alt: 'Interactive drawing of a landfill gas collection system as it operates today: a capped cell with extraction wells across it, a header main gathering them, a blower holding the field under vacuum, and an enclosed flare burning everything it brings up. Drag to rotate, scroll to zoom.' },
          { key: 'ion', name: 'landfillion', module: '../scene-landfill-ion.js',
            script: 'scene-landfill-ion.js', prefix: 'li-',
            alt: 'The same landfill with Proton on it: the flare down to a pilot, and a tie-in downstream of the blower running gas through a treatment skid, an enclosed genset, a transformer, and four containers of miners — the same equipment drawn on the home page. Drag to rotate, scroll to zoom.',
            note: 'The flare stays. It remains permitted and available for upsets, and for any time you take the gas back.' },
        ],
      },
      {
        key: 'flare', label: 'Flared gas', link: 'pad',
        scale: { lo: 'Your pad today', hi: 'With Proton on it',
                 label: 'Your pad as it is today, or the same pad with Proton on it' },
        views: [
          { key: 'now', name: 'padnow', module: '../scene-pad-now.js',
            script: 'scene-pad-now.js', prefix: '',
            alt: 'Interactive drawing of a wellpad as it operates today: wellhead, separator, tank battery, and a lit flare stack burning the gas that has no customer. Drag to rotate, scroll to zoom.' },
          { key: 'ion', name: 'padion', module: '../scene-pad-ion.js',
            script: 'scene-pad-ion.js', prefix: 'i-',
            alt: 'The same wellpad with Proton on it: the flare down to a pilot, and a tie-in running gas through a conditioning skid, an enclosed genset, a transformer, and four containers of miners — the same equipment drawn on the home page. Drag to rotate, scroll to zoom.',
            note: 'The flare stack stays. It remains permitted and available for upsets, and for any time you take the gas back.' },
        ],
      },
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
   Proton" state is built from site-kit.js, so it contains the very gas skid,
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

  /* The occluder is DATA, not a drawing. It never renders — styles.css gives it
     display:none — and exists so the gas field on the canvas behind this SVG
     knows which pixels the plant is standing in front of.

     Why the canvas erases instead of this painting an opaque shape: what sits
     behind the canvas is not a flat colour. .dg-wrap's background is
     rgba(255,255,255,0.016) over the body's diagonal light field and its 88px
     grid, so an opaque silhouette — whatever colour you picked — would read as
     a hole punched through the panel wherever that sheen is bright. Erasing
     removes the particles and nothing else.

     It ships with d="" rather than a baked yaw-0 union. Baking it would add
     roughly half the slot geometry again to every page, and it would buy
     nothing: the only reader is a canvas that JS also has to start, so with
     scripting off there is no field to occlude. */
  /* The arrowheads ride along from frame() itself — f.flowHeads is computed by
     the engine's exported flowHeads() from the very flow string above, so the
     baked heads cannot drift from the runtime ones. host-suite.js holds the
     two to byte parity the same way it does the slot layers. */
  /* FLOW ABOVE THE SLOTS since the solid pass. It used to paint first and glow
     through the translucent metal; with opaque fills the ground quad simply
     erased it — rendered at rest, the home page's trunk was gone entirely. The
     energy path is the one annotation this site highlights, so it rides above
     the drawing the way the leaders and callouts always have. Order is baked
     here and only here: the engine re-points d attributes and never reorders. */
  return `<svg class="site-diagram" id="${p}siteDiagram" viewBox="0 0 ${D.VB.w} ${D.VB.h}" preserveAspectRatio="xMidYMid meet" tabindex="0" role="img" aria-label="${esc(alt)}">
        <path class="dg-occluder" id="${p}dg-occluder" d=""/>${slots}
        <path class="dg-flow" id="${p}dg-flow" d="${f.flow}"/>
        <path class="dg-flow-heads" id="${p}dg-flow-heads" d="${f.flowHeads}"/>
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

/* TWO SENTENCES, ONE SHOWN. The mouse one was the only one for a long time, and on a
   phone every clause of it was false: there is no hover, there is no wheel, and dragging
   scrolled. The figure's gestures on touch are now real and different, so they get said.
   The stylesheet picks which sentence is visible; see .dg-hint-touch. */
const HINT = '<p class="dg-hint">' +
  '<span class="dg-hint-mouse">Drag to rotate &middot; hover a part to identify it &middot; scroll to zoom</span>' +
  /* SHORT ENOUGH FOR ONE LINE AT 390px, which is the whole design constraint: the
     first version ran to two lines and cost every figure on the page 46px, most of
     what the density pass had just saved. Measured, not guessed - 29 characters of
     10.5px mono at 0.1em fits, 60 does not. The clause about tapping a label came
     out because tapping a label is the one thing here somebody will try anyway. */
  '<span class="dg-hint-touch">Drag to turn &middot; pinch to zoom</span>' +
  '<span class="dg-hint-live">Scroll from outside this box</span>' +
  '</p>';

/* ---- writing it back ---- */

function splice(cfg, section, scripts) {
  const OUT = path.join(__dirname, cfg.target);
  const open = `<!-- ===== ${cfg.marker} ===== -->`;
  let html = fs.readFileSync(OUT, 'utf8');
  if (!html.includes(cfg.insertBefore)) {
    console.error(`anchor not found in ${cfg.target}`);
    process.exit(1);
  }
  /* THIS GENERATOR OWNS ITS OWN SECTION AND NOTHING ELSE.

     It used to splice from its opening marker all the way to `insertBefore`, which meant it
     silently deleted anything a person put between the two. That is not hypothetical: a
     "what you get" section and a prepaid-pricing section were both written into that gap and
     both vanished on the next generator run, with no error and no diff anybody was watching.
     The page simply had less in it than before.

     Now it replaces from its opening marker to its own CLOSING marker. Anything after that
     marker is somebody else's and is left alone.

     The fallback matters as much as the rule. A page generated before the closing marker
     existed does not have one, and falling back to the old
     "delete everything up to insertBefore" would eat a neighbour on exactly the run that was
     supposed to fix this. So it falls back to the end of the section ELEMENT instead: the first
     `</section>` that starts a line after the marker, which is how this generator has always
     closed its own block. */
  const close = `<!-- ===== /${cfg.marker} ===== -->`;
  const start = html.indexOf(open);

  if (start >= 0) {
    let endAt = html.indexOf(close, start);
    if (endAt >= 0) {
      endAt += close.length;
    } else {
      const tag = html.indexOf('\n</section>', start);
      if (tag < 0) {
        console.error(`${cfg.target}: cannot find the end of the ${cfg.marker} section`);
        process.exit(1);
      }
      endAt = tag + '\n</section>'.length;
    }
    /* Keep whatever separated the block from what follows it. */
    let tail = html.slice(endAt);
    tail = tail.replace(/^\s*/, '\n');
    html = html.slice(0, start) + section.replace(/\s*$/, '\n') + tail;
  } else {
    html = html.replace(cfg.insertBefore, section + cfg.insertBefore);
  }

  /* The engine goes in ONCE, however many scenes a page carries. Two copies
     would mean two module instances, two separate link registries, and a
     shared view that silently is not shared. */
  /* The wrappers carry an .anim-field canvas, so the page needs the script that
     drives them — emitting the element without the driver leaves a dead canvas. */
  scripts = ['hero-anim.js'].concat(scripts);

  /* STAMPED OR NOT.

     tools/build-asset-stamp.js rewrites these same tags to carry ?v=<hash>, and it runs
     AFTER this generator. So on any page that has been stamped even once, every match below
     that looked for a bare `<script src="./x.js"></script>` found nothing, and the whole
     remove-and-reorder block quietly did nothing at all.

     That is not theoretical. hosting.html needed site-kit.js the moment scene-hosting.js
     started reading KIT.COOLER for its roof cooler. The dep was declared here, this generator
     printed its usual success line, and not one tag moved — so the page loaded the scene
     before SiteKit existed, the module threw, and the figure fell back to its baked static
     frame. It looked merely out of date rather than broken.

     Matching the optional stamp is what build-asset-stamp.js itself does (see its REF regex),
     and it makes this block idempotent from either direction. */
  var stamped = function (file) {
    return new RegExp('<script src="\\./' + file.replace(/\./g, '\\.') +
                      '(?:\\?v=[0-9a-f]+)?"></script>', 'g');
  };

  if (!stamped('diagram-engine.js').test(html)) {
    html = html.replace(stamped('site.js'),
      function (m) { return m + '\n<script src="./diagram-engine.js"></script>'; });
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
    html = html.replace(new RegExp('\\n?' + stamped(s).source, 'g'), '');
  });
  /* Re-emitted WITHOUT a stamp. build-asset-stamp.js runs after this and puts the current
     hash back on every tag; writing a stale one here would be a hash that never matched. */
  html = html.replace(stamped('diagram-engine.js'), function (m) {
    return m + '\n' + scripts.map(s => `<script src="./${s}"></script>`).join('\n');
  });
  fs.writeFileSync(OUT, html);
}

/* ---- the fuel switch: which of several pairs is on screen ----

   Only a page that declares `fuels` gets one. It picks between GROUPS of views,
   where the slider picks between the two views inside the chosen group — a
   different axis, so it is a different control and looks like one.

   The panes are all in the DOM and all mounted; the switch only hides. That
   costs nothing per frame, because diagram-engine.js watches each drawing with
   an IntersectionObserver and a hidden pane has no box to intersect with, so
   its render loop is already stopped. Switching back finds it exactly as you
   left it. */
function fuelOf(cfg, groups) {
  if (!cfg.fuels) return '';
  const seg = groups.map((g, i) =>
    `<button type="button" data-fuel="${g.key}" aria-pressed="${i === 0}">${esc(g.label)}</button>`
  ).join('\n      ');
  /* WITHOUT JS THE SWITCH CANNOT SWITCH, and every drawing on this site is
     supposed to survive that: the generator bakes a static frame precisely so
     that JS-off gets a complete, annotated diagram. A hidden second pane would
     quietly break that promise for the second fuel — its drawing, its callouts
     and its plain-text list would all be unreachable.

     So with scripting off, both pairs are shown stacked and the control that
     cannot work is taken away.

     THE !important IS LOAD-BEARING, and not cargo cult. styles.css carries a
     global `[hidden] { display: none !important; }`, which beats an ordinary
     author rule no matter how specific it is or how late it comes — the first
     version of this block was plain `display: block` and did nothing at all.
     Between two important author declarations specificity decides, and
     `.dg-fuel-pane[hidden]` (0,2,0) beats `[hidden]` (0,1,0). */
  return `
    <noscript>
      <style>
        .dg-fuel { display: none; }
        .dg-fuel-pane[hidden] { display: block !important; }
      </style>
    </noscript>
    <div class="dg-fuel reveal" id="dgFuel" role="group" aria-label="${esc(cfg.fuelLabel)}">
      ${seg}
    </div>`;
}

/* ---- a page: two views behind a slider ---- */

function build(key) {
  const cfg = PAGES[key];

  /* One shape for both kinds of page. Without `fuels` there is a single
     unnamed group, and everything below emits exactly what it always did —
     that is what keeps index.html and hosting.html byte-identical through
     this change. */
  const groups = (cfg.fuels || [{ key: null, link: cfg.link, scale: cfg.scale, views: cfg.views }])
    .map(g => ({ ...g, views: g.views.map(v => ({ ...v, D: require(path.join(__dirname, v.module)) })) }));

  const all = groups.reduce((a, g) => a.concat(g.views), []);

  /* Across ALL groups, not just within one. Every pane lands in the same
     section, so a landfill drawn at a different aspect ratio from the wellpad
     would make the page change height when you switch fuels. */
  const vb = all[0].D.VB;
  all.forEach(v => {
    if (v.D.VB.w !== vb.w || v.D.VB.h !== vb.h) {
      console.error(`${key}: view "${v.key}" has viewBox ${v.D.VB.w}x${v.D.VB.h}, ` +
                    `but "${all[0].key}" has ${vb.w}x${vb.h}. Stacked views must ` +
                    `share one aspect ratio or the section changes height as the slider moves.`);
      process.exit(1);
    }
  });

  /* Two pairs on one page must not share a camera. `link` is what joins two
     views' view state, so if both groups named the same one, turning the
     landfill would turn the wellpad behind it. */
  const links = groups.map(g => g.link).filter(Boolean);
  if (new Set(links).size !== links.length) {
    console.error(`${key}: two view groups share a data-link (${links.join(', ')}). ` +
                  `Each group needs its own, or dragging one pane turns the other.`);
    process.exit(1);
  }

  /* Same for id prefixes: every drawing on the page answers to ${prefix}dg-flow
     and the rest, so a repeat means two scenes writing the same path. */
  const pre = all.map(v => v.prefix);
  if (new Set(pre).size !== pre.length) {
    console.error(`${key}: two views share an id prefix (${pre.map(p => `"${p}"`).join(', ')}). ` +
                  `Every drawing on a page needs its own, or they overwrite each other.`);
    process.exit(1);
  }

  /* Everything that belongs to ONE pair: its slider, its two stacked drawings,
     and the plain-list fallback for both. A page without fuels calls this once
     and splices the result straight in, which is why the output for
     index.html and hosting.html does not move. */
  function groupBlock(g) {
    const views = g.views;
    const pair = views.length > 1;
    /* Suffixed only when the page has more than one group, so a single-group
       page keeps the bare dgScale/dgViews ids it has always had. Two panes
       both answering to #dgScale would be invalid, and only the first would
       ever be found. */
    const sfx = g.key ? `-${g.key}` : '';

    const wraps = views.map(v => {
      const svg = svgOf(v.D, v.alt, v.prefix);
      const note = v.note ? `\n        <p class="dg-note">${v.note}</p>` : '';
      const link = g.link ? ` data-link="${g.link}"` : '';
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

    /* The hint is aria-hidden: the input already carries a label saying what
       the two ends are, and a screen reader gets no use from being told to
       drag. */
    const slider = pair ? `
    <div class="dg-scale reveal">
      <span class="dg-scale-end" data-end="lo">${esc(g.scale.lo)}</span>
      <span class="dg-scale-track">
        <input class="dg-scale-input" id="dgScale${sfx}" type="range" min="0" max="100" step="1" value="0"
               aria-label="${esc(g.scale.label)}">
        <span class="dg-scale-hint" aria-hidden="true">${ARROW_BACK}Drag to compare${ARROW}</span>
      </span>
      <span class="dg-scale-end" data-end="hi">${esc(g.scale.hi)}</span>
    </div>` : '';

    const body = pair ? `
    <!-- Both views share one grid cell, so the taller sets the height and the
         section never changes size as the slider moves. -->
    <div class="dg-views reveal" id="dgViews${sfx}" style="--d:0">${wraps}
    </div>` : wraps;

    return slider + body +
      `\n    <!-- Below 900px the drawing is too dense to read and there is no pointer to
         hover with, so the same callouts carry the content as a plain list.
         Generated from the same source. -->${lists}`;
  }

  /* The TOGGLE crosses pages. Its second segment is a link, so stepping to the
     next drawing is a deliberate navigation rather than a drag that surprises
     you by leaving the page. It sits above the fuel switch because it changes
     which site you are looking at, not which fuel feeds it. */
  const toggle = chainOf(cfg.chain);

  /* One group splices bare. Several are each wrapped in a pane the fuel switch
     shows and hides — and the pane, not the drawing, carries `hidden`, so the
     slider and the mobile list go with it. */
  const panes = cfg.fuels
    ? groups.map((g, i) => `
    <div class="dg-fuel-pane" data-fuel="${g.key}"${i === 0 ? '' : ' hidden'}>${groupBlock(g)}
    </div>`).join('')
    : groupBlock(groups[0]);

  const section = `<!-- ===== ${cfg.marker} ===== -->
<section class="band" id="${cfg.sectionId}">
  <div class="wrap">
    <div class="reveal sec-head" style="--sh:40px">
      <div class="eyebrow">${esc(cfg.eyebrow)}</div>
      <h2 class="h-section">${esc(cfg.heading)}</h2>
      <p class="lede">${esc(cfg.lede)}</p>
    </div>${toggle}${fuelOf(cfg, groups)}${panes}
  </div>
</section>
<!-- ===== /${cfg.marker} ===== -->

`;

  /* deps come first: a scene that reads shared geometry needs that module to
     have executed before it does. */
  splice(cfg, section, (cfg.deps || []).concat(all.map(v => v.script)));
  console.log(`${key}: ${all.length} views [${groups.map(g =>
    (g.key ? `${g.key}: ` : '') + g.views.map(v =>
      `${v.key}(${v.name}) ${v.D.SLOTS}x${v.D.LAYERS.length} ${v.D.CALLOUTS.length}co` +
      (v.prefix ? ` "${v.prefix}"` : '')).join(', ') +
    (g.link ? ` link "${g.link}"` : '')).join(' | ')}] chain@${cfg.chain} ` +
    `-> ${path.basename(cfg.target)}`);
}

const only = process.argv[2];
if (only && !PAGES[only]) {
  console.error(`unknown page "${only}". known: ${Object.keys(PAGES).join(', ')}`);
  process.exit(1);
}
(only ? [only] : Object.keys(PAGES)).forEach(build);
