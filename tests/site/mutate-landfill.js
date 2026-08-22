/* Mutation-test the landfill and fuel-switch guards.

   A guard that has never seen a failure is a guard nobody has checked. Each
   mutation below breaks exactly one thing the new checks claim to catch; every
   one of them must turn something red. A mutation that survives means the
   assertion is decorative.

   Every file is restored from an in-memory copy in a finally, so an exception
   part-way through cannot leave the tree modified. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const { execFileSync } = require('child_process');

const S = REPO_ROOT + 'site/';
const HERE = __dirname + '/';

/* Runs a checker and says whether it FAILED. Generators signal by exit code,
   suites by exit code too — both non-zero on failure. */
function fails(cmd, args, cwd) {
    try {
        execFileSync(cmd, args, { cwd: cwd, stdio: 'pipe' });
        return false;
    } catch (e) {
        return true;
    }
}

const suite = () => fails(process.execPath, [HERE + 'pad-suite.js'], HERE);
const gen = () => fails(process.execPath, ['tools/build-diagram.js', 'energy'], S);
const snap = () => fails(process.execPath, [HERE + 'snapshot.js', 'verify'], HERE);
const copy = () => fails(process.execPath, [HERE + 'landfill-copy-suite.js'], HERE);

/* A mutation is: file, find, replace, and which checker should notice. */
const MUTATIONS = [
    // ---- the fuel switch, in the generator ----
    { file: S + 'tools/build-diagram.js', why: 'flared gas put first, so the page no longer leads with landfill',
      from: "key: 'landfill', label: 'Landfill gas', link: 'landfill',",
      to:   "key: 'zzflare', label: 'Landfill gas', link: 'landfill',",
      rebuild: true, by: suite },

    { file: S + 'tools/build-diagram.js', why: 'both pairs given the same camera',
      from: "key: 'flare', label: 'Flared gas', link: 'pad',",
      to:   "key: 'flare', label: 'Flared gas', link: 'landfill',",
      by: gen },

    { file: S + 'tools/build-diagram.js', why: 'two views given the same id prefix',
      from: "script: 'scene-landfill-now.js', prefix: 'l-',",
      to:   "script: 'scene-landfill-now.js', prefix: 'i-',",
      by: gen },

    { file: S + 'tools/build-diagram.js', why: 'the second pane left visible instead of hidden',
      from: "${i === 0 ? '' : ' hidden'}",
      to:   "${''}",
      rebuild: true, by: suite },

    { file: S + 'tools/build-diagram.js', why: 'both fuel buttons marked pressed',
      from: 'aria-pressed="${i === 0}"',
      to:   'aria-pressed="true"',
      rebuild: true, by: suite },

    // ---- the geometry ----
    { file: S + 'scene-landfill-now.js', why: 'the fitted scale put back to the eyeballed one',
      from: 'BASE_SCALE: 12', to: 'BASE_SCALE: 13.6', by: suite },

    { file: S + 'scene-landfill-ion.js', why: 'one scene of the pair refitted and not the other',
      from: 'ORIGIN: { x: 640, y: 262 }', to: 'ORIGIN: { x: 640, y: 268 }', by: suite },

    { file: S + 'landfill-geometry.js', why: 'the cell grown until it leaves the frame',
      from: 'var CELL = { x: -7.0, z: -9.5, w: 37, d: 25, h: 11.0 };',
      to:   'var CELL = { x: -7.0, z: -9.5, w: 52, d: 25, h: 11.0 };', by: suite },

    /* Moving FLARE in the geometry moves the flame WITH it, because the flame
       is built from G.FLARE.x — so that mutation is not a bug and rightly
       survived. To actually detach the flame from the stack, move only the
       flame's own origin. */
    { file: S + 'scene-landfill-now.js', why: 'the flame detached from the stack it leaves',
      from: 'var x = G.FLARE.x, z = G.FLARE.z;\n        var base = G.FLARE_H - 0.15;',
      to:   'var x = G.FLARE.x + 1.8, z = G.FLARE.z;\n        var base = G.FLARE_H - 0.15;',
      by: suite },

    { file: S + 'scene-landfill-now.js', why: 'the flame root widened past the bore it leaves',
      from: 'var r = G.FLARE_R * 0.55 * (wide / WIDEST);',
      to:   'var r = G.FLARE_R * 2.20 * (wide / WIDEST);', by: suite },

    // ---- the site driver ----
    { file: S + 'site.js', why: 'the slider driver back to a single #dgScale lookup',
      from: "var scales = document.querySelectorAll('.dg-scale-input');",
      to:   "var scales = [document.getElementById('dgScale')].filter(Boolean);",
      by: suite },

    // ---- the gate the fuel switch depends on ----
    { file: S + 'diagram-engine.js', why: 'the drawing render loop no longer stops when hidden',
      from: 'if (visible) start(); else stop();',
      to:   'if (visible) start(); else start();', by: suite },

    { file: S + 'diagram-engine.js', why: 'the IntersectionObserver on the drawing removed outright',
      from: '}, { threshold: 0 }).observe(svg);',
      to:   '}, { threshold: 0 });', by: suite },

    { file: S + 'hero-anim.js', why: 'the canvas behind each drawing left running while hidden',
      from: '}, { threshold: 0 }).observe(host);',
      to:   '}, { threshold: 0 });', by: suite },

    // ---- the no-JS fallback ----
    { file: S + 'tools/build-diagram.js', why: 'the no-JS override loses its !important, so the global [hidden] beats it',
      from: '.dg-fuel-pane[hidden] { display: block !important; }',
      to:   '.dg-fuel-pane[hidden] { display: block; }',
      rebuild: true, by: suite },

    { file: S + 'tools/build-diagram.js', why: 'the no-JS fallback removed entirely',
      from: '    <noscript>', to: '    <!--noscript',
      rebuild: true, by: suite },

    /* ---- the mound and the surface function must describe one shape ----

       There is deliberately no mutation here for "the cap-height function
       drifts from the drawn mound". It cannot: contourPoint() and lift() are
       both derived from the same LEVEL_Y / LEVEL_S / radial(), so there is
       nothing to hold in step by hand. That is the fix for the class of bug,
       and a mutation proving it would have to introduce a second copy first. */
    { file: S + 'landfill-geometry.js', why: 'the mound profile reversed, so the cap steps back up near the crown',
      from: 'var LEVEL_Y = [0.000, 0.333, 0.333, 0.667, 0.667, 1.000];',
      to:   'var LEVEL_Y = [0.000, 0.333, 0.333, 0.667, 0.667, 0.600];', by: suite },

    { file: S + 'landfill-geometry.js', why: 'the skirt winding flipped, so the far side of the mound is drawn',
      from: 'var quad = [ring[j], ring[i], next[i], next[j]];',
      to:   'var quad = [ring[i], ring[j], next[j], next[i]];', by: snap },

    { file: S + 'landfill-geometry.js', why: 'buildPad delegates back to the wellpad slab',
      from: '        var G = H.newLayers();',
      to:   '        return P.buildPad(H, yaw, L); var G = H.newLayers();', by: snap },


    { file: S + 'landfill-geometry.js', why: 'the bench terraces flattened out of the profile',
      from: 'var LEVEL_S = [1.000, 0.845, 0.755, 0.600, 0.510, 0.355];',
      to:   'var LEVEL_S = [1.000, 0.845, 0.845, 0.600, 0.600, 0.355];', by: snap },
    // ---- the shared yard must land in BOTH scenes ----
    { file: S + 'scene-landfill-ion.js', why: 'the yard added to one scene only, so kit appears when Ion arrives',
      from: '        G.buildYard(H, yaw, L);', to: '', by: suite },

    { file: S + 'landfill-geometry.js', why: 'the leachate compound moved onto the capped cell',
      from: 'var LEACH      = { x: -18.5, y: 0,   z: 7.4,',
      to:   'var LEACH      = { x: -7.0, y: 0,   z: -9.5,', by: suite },

    { file: S + 'landfill-geometry.js', why: 'the condensate sumps dropped off the header',
      from: 'var SUMP_X = [-15.5, -7.5, 0.5];',
      to:   'var SUMP_X = [];', by: snap },

    // ---- the container yard ----
    { file: S + 'scene-landfill-ion.js', why: 'the two container rows pushed back together, hiding the far one',
      from: 'var CONT_Z = [12.6, 20.1];', to: 'var CONT_Z = [12.6, 17.4];', by: snap },

    { file: S + 'scene-landfill-ion.js', why: 'a container column dropped, so the alt text overcounts',
      from: 'var CONT_X = [-6.2, 7.2];', to: 'var CONT_X = [-6.2];', by: copy },

    // ---- the fixtures ----
    { file: S + 'landfill-geometry.js', why: 'a well moved, which the snapshot must notice',
      from: 'var WELL_GRID_X = [-12.5, -4.2, 4.2, 12.5];',
      to:   'var WELL_GRID_X = [-12.4, -4.2, 4.2, 12.5];', by: snap },

    { file: S + 'scene-pad-now.js', why: 'the WELLPAD disturbed — the flare business must be protected too',
      from: 'BASE_SCALE: 16', to: 'BASE_SCALE: 15.9', by: snap },
];

/* Snapshot every file we are about to touch, once, up front. */
const touched = [...new Set(MUTATIONS.map(m => m.file))];
const original = new Map(touched.map(f => [f, fs.readFileSync(f, 'utf8')]));
const pages = ['energy.html'].map(f => [S + f, fs.readFileSync(S + f, 'utf8')]);

let caught = 0, missed = [];

try {
    for (const m of MUTATIONS) {
        const src = original.get(m.file);
        if (src.indexOf(m.from) < 0) {
            missed.push(m.why + '   [ANCHOR NOT FOUND: ' + m.from.slice(0, 50) + ']');
            continue;
        }
        fs.writeFileSync(m.file, src.replace(m.from, m.to));
        /* Some mutations only reach a checker through the generated page. */
        if (m.rebuild) { try { execFileSync(process.execPath, ['tools/build-diagram.js', 'energy'], { cwd: S, stdio: 'pipe' }); } catch (e) {} }

        const red = m.by();
        console.log((red ? '  caught  ' : '  MISSED  ') + m.why);
        if (red) caught++; else missed.push(m.why);

        /* Restore before the next one, and rebuild the page back to truth. */
        fs.writeFileSync(m.file, src);
        if (m.rebuild) { try { execFileSync(process.execPath, ['tools/build-diagram.js', 'energy'], { cwd: S, stdio: 'pipe' }); } catch (e) {} }
    }
} finally {
    for (const [f, src] of original) fs.writeFileSync(f, src);
    for (const [f, src] of pages) fs.writeFileSync(f, src);
    try { execFileSync(process.execPath, ['tools/build-diagram.js', 'energy'], { cwd: S, stdio: 'pipe' }); } catch (e) {}
}

console.log('');
console.log('  ' + caught + '/' + MUTATIONS.length + ' mutations caught');
if (missed.length) {
    console.log('  SURVIVED:');
    missed.forEach(w => console.log('    - ' + w));
}
process.exit(missed.length ? 1 : 0);
