/* Mutation-test the hardware catalogue's daily-economics guards.
 *
 * Each mutation breaks exactly one thing the new assertions claim to catch.
 * Every file is restored from an in-memory copy in a finally, so an exception
 * part-way through cannot leave the tree modified.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const REPO = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const S = REPO + 'site/';
const HERE = __dirname + '/';

function fails(args) {
    try { execFileSync(process.execPath, args, { cwd: HERE, stdio: 'pipe' }); return false; }
    catch (e) { return true; }
}
const suite = () => fails([HERE + 'hardware-suite.js']);
const contrast = () => fails([HERE + 'contrast.js']);
/* Rebuilds the nav from the generator, then asks whether every page still
   carries the portal button. The generator owns eleven pages, so a change
   there is eleven silent changes. */
const navcheck = function () {
    try { execFileSync(process.execPath, ['tools/build-nav.js'], { cwd: S, stdio: 'pipe' }); } catch (e) {}
    var html = fs.readFileSync(S + 'index.html', 'utf8');
    return html.indexOf('btn btn--ghost btn--sm nav-signin') < 0;
};

const MUTATIONS = [
    /* The whole point of the design: no second copy of the mining formula. */
    { file: S + 'hardware.js', why: 'the mining formula copied onto the page instead of calling the engine',
      from: 'var r = CalcEngine.computeProjection({',
      to:   'var TWO32 = 4294967296; var r = CalcEngine.computeProjection({', by: suite },

    /* An invented power price is the failure this feature exists to avoid. */
    { file: S + 'hardware.js', why: 'a power price invented on the visitor behalf',
      from: "return (f.value === '' || !isFinite(v) || v < 0) ? null : v;",
      to:   "return (f.value === '' || !isFinite(v) || v < 0) ? 0.05 : v;", by: suite },

    /* Zero is a real answer — a flared-gas site with no power bill — and must
       not be swallowed by a falsy check. */
    { file: S + 'hardware.js', why: 'a zero power price treated as "not told"',
      from: "return (f.value === '' || !isFinite(v) || v < 0) ? null : v;",
      to:   "return (!v || !isFinite(v) || v < 0) ? null : v;", by: suite },

    /* Payback on a machine that never pays back. */
    { file: S + 'hardware.js', why: 'payback shown for a machine losing money',
      from: 'paybackDays: (price === null || profit === null || profit <= 0)',
      to:   'paybackDays: (price === null || profit === null || false)', by: suite },

    /* A new outbound host nobody disclosed. */
    { file: S + 'hardware.js', why: 'a third-party host the privacy page never named',
      from: "url: 'https://blockchain.info/q/getdifficulty',",
      to:   "url: 'https://example-tracker.net/q/getdifficulty',", by: suite },


    /* The nav CTA: the reported fault was one cause with two faces, so each
       face gets a mutation. Single-line anchors on purpose. */
    { file: S + 'styles.css', why: 'the CTA allowed to wrap again, which is what made it thick',
      from: '    white-space: nowrap;', to: '    white-space: normal;', by: contrast },

    { file: S + 'styles.css', why: 'the CTA allowed to be squeezed and clipped again',
      from: '    flex-shrink: 0;', to: '    flex-shrink: 1;', by: contrast },

    { file: S + 'styles.css', why: 'the CTA padding made horizontally uneven',
      from: '    padding: 9px 15px 7px;', to: '    padding: 9px 20px 7px 10px;', by: contrast },

    /* The calculator link must stay reachable without hunting for a scrollbar. */
    { file: S + 'styles.css', why: 'the last column unpinned, so the link scrolls off again',
      from: '    position: sticky;', to: '    position: static;', by: suite },

    { file: S + 'styles.css', why: 'the pinned column made transparent, so cells scroll through it',
      from: '    background: var(--black);', to: '    background: transparent;', by: suite },

    { file: S + 'styles.css', why: 'cell padding put back, pushing the table past its container',
      from: '.hw-table td { padding: 16px 16px;', to: '.hw-table td { padding: 16px 22px;', by: suite },

    /* The producer portal, now a ghost button beside the CTA. */
    { file: S + 'styles.css', why: 'the portal button colour left to the nav, killing its contrast',
      from: '    color: var(--plat-100);', to: '    color: var(--plat-600);', by: contrast },

    { file: S + 'tools/build-nav.js', why: 'the portal stops being a button and goes back to a text link',
      from: 'class=\"btn btn--ghost btn--sm nav-signin\"', to: 'class=\"nav-signin\"',
      rebuild: true, by: navcheck },

    /* The columns themselves. */
    { file: S + 'hardware.html', why: 'the payback column removed from the table',
      from: '<th class="hw-num">Payback</th>', to: '', by: suite },
];

const touched = [...new Set(MUTATIONS.map(m => m.file))];
const original = new Map(touched.map(f => [f, fs.readFileSync(f, 'utf8')]));

let caught = 0, missed = [];
try {
    for (const m of MUTATIONS) {
        const src = original.get(m.file);
        if (src.indexOf(m.from) < 0) {
            missed.push(m.why + '   [ANCHOR NOT FOUND: ' + m.from.slice(0, 50) + ']');
            continue;
        }
        /* split/join, not replace: a replacement containing $' would splice the
           rest of the file in. That is not hypothetical — it happened while
           this very feature was being written. */
        fs.writeFileSync(m.file, src.split(m.from).join(m.to));
        const red = m.by();
        console.log((red ? '  caught  ' : '  MISSED  ') + m.why);
        if (red) caught++; else missed.push(m.why);
        fs.writeFileSync(m.file, src);
    }
} finally {
    for (const [f, src] of original) fs.writeFileSync(f, src);
}

console.log('');
console.log('  ' + caught + '/' + MUTATIONS.length + ' mutations caught');
if (missed.length) {
    console.log('  SURVIVED:');
    missed.forEach(w => console.log('    - ' + w));
}
process.exit(missed.length ? 1 : 0);
