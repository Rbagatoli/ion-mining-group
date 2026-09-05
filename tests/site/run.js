/* Every guard on the marketing site and the orders path, in one command.
 *
 *     node tests/site/run.js              the suites
 *     node tests/site/run.js --mutate     the suites, then the mutation harnesses
 *
 * WHY THESE LIVE HERE NOW. They were written in a temp scratchpad and run from
 * there for the whole of their life so far, while site/README.md,
 * site/price-list.js and tools/build-order-catalogue.js all cite them by name
 * as the thing that enforces an invariant. A guard the operating system is
 * entitled to delete is not a guard. Moving them cost one change each: an
 * absolute c:/Users/... root became a path derived from this file's location.
 *
 * WHY tests/site/ AND NOT site/tests/. _config.yml already excludes tests/
 * from the Pages build, and site/ is going to stop being excluded on the day
 * the marketing site publishes. Test files served to the public is not
 * something anyone wants to find out about afterwards.
 *
 * THE MUTATION HARNESSES ARE OPT-IN. They rewrite files under site/ to prove a
 * guard actually fails, and restore them in a finally. That is exactly what
 * makes the guards trustworthy and exactly why a plain test run must not do it
 * — an interrupted run leaves the tree modified.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;

/* Ordered roughly cheapest-first, so a broken checkout fails fast. */
const SUITES = [
    'seo-suite.js', 'og-suite.js', 'hero-suite.js', 'dg-suite.js', 'home-scene-suite.js',
    'dupe-ids.js', 'cascade.js', 'contrast.js', 'modifier-suite.js', 'verify.js',
    'calc-suite.js', 'asic-suite.js', 'host-suite.js', 'dg-regress.js',
    'pad-suite.js', 'landfill-copy-suite.js', 'dg-crop.js',
    'hardware-suite.js', 'cart-suite.js', 'paypage-suite.js', 'demo-suite.js',
    'orders-suite.mjs', 'pay-suite.mjs', 'stripe-suite.mjs', 'facility-suite.mjs',
    'blog-suite.mjs',
    /* The deploy tree. It asserts that every sitemap url resolves to a real file and every
       canonical points at the page it is on — the launch-day failure the /site/ topology
       would have caused on all twelve pages, silently. --check builds it, verifies it, and
       removes it, so running the suite leaves no _site/ behind. */
    'deploy-check.js',
];

const MUTATORS = ['mutate-landfill.js', 'mutate-copy.js', 'mutate-econ.js'];

function run(file, args) {
    try {
        execFileSync(process.execPath, [path.join(HERE, file)].concat(args || []),
                     { cwd: HERE, stdio: 'pipe' });
        return null;
    } catch (e) {
        /* Suites report their own detail on stdout; keep the tail so a failure
           says something without burying the summary. */
        /* THE FAILING ASSERTIONS FIRST, then the tail — in that order, because the tail alone
           was useless. A suite prints its FAIL lines wherever they occur and its summary at the
           end, so keeping only the last six lines showed six passing assertions and a count.
           When CI failed a deploy on an asset-hash mismatch, the log said "1 FAILED" followed
           by four lines of "ok", and the actual reason sat in the middle where nothing showed
           it. Diagnosing it needed a local clone with different line endings. */
        const out = ((e.stdout || '') + '' + (e.stderr || '')).trim().split('\n');
        const fails = out.filter(function (l) { return /^\s*FAIL\b/.test(l); });
        const tail = out.slice(-4);
        return (fails.length ? fails.slice(0, 8).join('\n') + '\n' : '') + tail.join('\n');
    }
}

let failed = [];
console.log('');
SUITES.forEach(function (s) {
    if (!fs.existsSync(path.join(HERE, s))) {
        console.log('  MISSING  ' + s);
        failed.push(s);
        return;
    }
    const err = run(s);
    console.log('  ' + (err ? 'FAIL  ' : 'ok    ') + s);
    if (err) failed.push(s + '\n' + err.replace(/^/gm, '        '));
});

/* snapshot.js is a tool with subcommands, not a suite — it only asserts when
   asked to verify. Every scene's path data, compared byte for byte against a
   captured baseline. */
const snapErr = run('snapshot.js', ['verify']);
console.log('  ' + (snapErr ? 'FAIL  ' : 'ok    ') + 'snapshot.js verify');
if (snapErr) failed.push('snapshot.js verify\n' + snapErr.replace(/^/gm, '        '));

if (process.argv.indexOf('--mutate') >= 0) {
    console.log('');
    MUTATORS.forEach(function (m) {
        const err = run(m);
        console.log('  ' + (err ? 'FAIL  ' : 'ok    ') + m);
        if (err) failed.push(m + '\n' + err.replace(/^/gm, '        '));
    });
    /* The harnesses restore in a finally, but "it restores itself" is a claim
       worth checking rather than trusting: if a mutation run leaves the tree
       dirty, every later result in this process is suspect. */
    const snapAfter = run('snapshot.js', ['verify']);
    console.log('  ' + (snapAfter ? 'FAIL  ' : 'ok    ') + 'tree restored after mutation');
    if (snapAfter) failed.push('tree NOT restored after mutation\n' +
                               snapAfter.replace(/^/gm, '        '));
}

console.log('');
if (failed.length) {
    console.log('  ' + failed.length + ' FAILED');
    failed.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
}
console.log('  all green');
