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
