/* Ion Mining Group -> Proton Mining.
 *
 * The name shown is "Proton Mining". The registered entity may still carry a suffix — that is
 * what the [REGISTERED ENTITY NAME] placeholder in the footer is for — but branding is the two
 * words. An intermediate pass used "Proton Mining Corp" and the domain protonminingcorp.com;
 * both are corrected below rather than in a separate script, so this file stays the one record
 * of what the brand is and lands correctly whether it runs against a fresh Ion checkout or a
 * tree already carrying the Corp variant.
 *
 *     node tools/rename-brand.js --dry     report what would change, touch nothing
 *     node tools/rename-brand.js           do it
 *
 * WHY THIS IS A SCRIPT AND NOT A FIND-AND-REPLACE
 *
 * "ion" is a common English substring. This repository contains 43,799 occurrences of it inside
 * ordinary words - transmissionOwner, region, function, Violation, Combustion, Corporation -
 * against 1,130 that are brand. A global replace would destroy the codebase and most of the
 * damage would be silent, because `regProton` and `funcProton` still parse.
 *
 * So every rule below is anchored: a whole phrase, a domain, or an identifier where "ion"
 * begins the token. Rules run longest-first, because `Ion Mining Group` must be consumed before
 * `Ion Mining`, and `hello@ionmininggroup.com` before `ionmininggroup.com`.
 *
 * WHAT IS DELIBERATELY NOT RENAMED is at the bottom, with the reason for each. That list is the
 * more important half of this file: the things that look like brand and would break something
 * real if they moved.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.indexOf('--dry') >= 0;

const SKIP_DIR = new Set(['.git', 'node_modules', '_site', '.cache', 'og', 'data']);

/* THIS FILE EXCLUDES ITSELF, and it did not the first time it ran. The walk reached
   tools/rename-brand.js and applied every rule to the source of every rule, so
   [/Ion Mining Group/, 'Proton Mining Corp'] became [/Proton Mining Corp/, 'Proton Mining
   Corp'] and the KEEP list became a list of identity pairs. The repository was renamed
   correctly - RULES was already in memory - but the script was left inert, which is the worst
   of both: it looks like a record of what happened and it is a record of nothing. */
const SELF = path.basename(__filename);

/* AND THE FILE WHOSE JOB IS TO ASSERT THE OLD BRAND IS GONE. tests/site/blog-suite.mjs holds a
   list of the tokens that must not appear anywhere; renaming those tokens would rewrite the
   list to check for the NEW brand, which every page satisfies. The guard would pass forever
   and guard nothing. Same trap this script fell into on its own source, one file over. */
const SKIP_FILE = new Set([SELF, 'blog-suite.mjs']);
const EXT = /\.(js|mjs|html|css|json|md|toml|yml|yaml|txt|xml|svg)$/;
const VENDOR = /\.min\.js$/;

/* ---------------------------------------------------------------- the rules
 *
 * Ordered. Each is [pattern, replacement, label]. Patterns are global regexes and are applied
 * in sequence, so an earlier rule's output is visible to a later one - which is why the long
 * forms come first.
 */
const RULES = [
    /* ---- the domain, and the addresses on it ---- */
    [/ionmininggroup\.com/g, 'protonminingco.com', 'domain'],
    /* The intermediate domain, corrected. Runs before the name rules so the spaced phrase
       "Proton Mining Corp" cannot reach inside a hostname. */
    [/protonminingcorp\.com/g, 'protonminingco.com', 'domain, corrected'],

    /* ---- the company name, longest form first ---- */
    [/ION MINING GROUP/g, 'PROTON MINING', 'name, caps'],
    [/Ion Mining Group/g, 'Proton Mining', 'name'],
    /* The intermediate name, corrected. */
    [/PROTON MINING CORP/g, 'PROTON MINING', 'name, caps, corrected'],
    [/Proton Mining Corp/g, 'Proton Mining', 'name, corrected'],
    [/ION MINING/g, 'PROTON MINING', 'name, caps, short'],
    [/Ion Mining/g, 'Proton Mining', 'name, short'],

    /* ---- the repo slug, which appears in URLs in comments and in User-Agent strings ---- */
    [/ion-mining-group/g, 'proton-mining', 'repo slug'],
    [/proton-mining-corp/g, 'proton-mining', 'repo slug, corrected'],

    /* ---- deployed Worker names and the account subdomain.
       The owner is redeploying these; until they do, the app points at endpoints that do not
       exist yet. That is a deliberate choice, recorded here so it is not mistaken for a bug. */
    [/ion-strike-proxy/g, 'proton-strike-proxy', 'worker'],
    [/ion-quickbooks/g, 'proton-quickbooks', 'worker'],
    [/ion-f2pool/g, 'proton-f2pool', 'worker'],
    [/ion-luxor/g, 'proton-luxor', 'worker'],
    [/ion-braiins/g, 'proton-braiins', 'worker'],
    [/ion-viabtc/g, 'proton-viabtc', 'worker'],
    [/ion-antpool/g, 'proton-antpool', 'worker'],
    [/ion-orders/g, 'proton-orders', 'worker'],
    [/ion-portal/g, 'proton-portal', 'worker'],
    /* The account subdomain. Only ever seen as <worker>.proton-mining.workers.dev, so it is
       anchored to that shape and cannot touch the Firebase project id, which is also
       "ion-mining" but must not move - see the do-not list. */
    [/\.ion-mining\.workers\.dev/g, '.proton-mining.workers.dev', 'workers.dev subdomain'],

    /* ---- PascalCase globals ---- */
    [/\bIonAuthUI\b/g, 'ProtonAuthUI', 'global'],
    [/\bIonAuth\b/g, 'ProtonAuth', 'global'],
    [/\bIonTheme\b/g, 'ProtonTheme', 'global'],
    [/\bIonPortal\b/g, 'ProtonPortal', 'global'],
    [/\bIonProfile\b/g, 'ProtonProfile', 'global'],
    [/\bIonMining\b/g, 'ProtonMining', 'global'],

    /* ---- camelCase identifiers and storage keys.
       Renaming a localStorage key orphans whatever is under the old one. Pre-launch that is a
       cleared cart and a forgotten currency preference, which is the right trade for not
       shipping the old brand in every browser's storage inspector. */
    [/\bionMining([A-Z_])/g, 'protonMining$1', 'storage key'],
    [/\bionMining\b/g, 'protonMining', 'storage key'],
    [/\bionStrike([A-Z])/g, 'protonStrike$1', 'storage key'],
    [/\bionMark([A-Z])/g, 'protonMark$1', 'svg gradient id'],
    [/\bionMark\b/g, 'protonMark', 'svg gradient id'],
    [/\bionPortalSession\b/g, 'protonPortalSession', 'storage key'],
    [/\bionFacility\b/g, 'protonFacility', 'storage key'],
    [/\bionPrepay\b/g, 'protonPrepay', 'storage key'],
    [/\bionSettings\b/g, 'protonSettings', 'identifier'],
    [/\bionCenterText\b/g, 'protonCenterText', 'identifier'],
    [/\bionSrcKit\b/g, 'protonSrcKit', 'test identifier'],
    [/\bionSrc\b/g, 'protonSrc', 'test identifier'],

    /* ---- THE SPLIT WORDMARK ----
       The nav renders the name across two elements:
         <span class="brand-name">Ion <span>Mining Group</span></span>
       so the full phrase never appears as one string and no phrase rule can see it. The first
       pass matched the bare "Ion" and left "Mining Group" behind, and every page's largest text
       read "Proton Mining Group" — a company that does not exist. Nothing failed; it simply
       said the wrong name. Handled explicitly here, and asserted on the rendered output by
       blog-suite rather than on these rules. */
    [/<span>Mining Group<\/span>/g, '<span>Mining</span>', 'split wordmark'],
    [/<span>Mining Corp<\/span>/g, '<span>Mining</span>', 'split wordmark, corrected'],
    [/"Mining Group" a step back/g, '"Mining" a step back', 'wordmark comment'],
    [/"Mining Corp" a step back/g, '"Mining" a step back', 'wordmark comment, corrected'],

    /* ---- CSS classes and DOM ids in the operator app ---- */
    [/\bion-nav([a-z-]*)/g, 'proton-nav$1', 'css class'],
    [/\bion-currency-select\b/g, 'proton-currency-select', 'css class'],
    [/\bion-prospects-/g, 'proton-prospects-', 'export filename'],
    [/\bion-mining-(payouts|tax-report|full-report|data)-/g, 'proton-mining-$1-', 'export filename'],
    [/\bion-mining-v(\d+)/g, 'proton-mining-v$1', 'service worker cache'],

    /* ---- the bare word, last, so it cannot eat any of the above ----
       \b on both sides, so "ionic", "region" and "Combustion" are untouched. The capitalised
       form is the company referred to by its short name in prose: "Proton hosts", "Proton's sites". */
    [/\bIon\b/g, 'Proton', 'short name'],
    [/\bION\b/g, 'PROTON', 'short name, caps'],
];

/* ---------------------------------------------------------------- what must NOT move
 *
 * Each of these looks like brand and is load-bearing. They are restored after the rules run,
 * which is simpler and far more auditable than trying to write a regex that avoids them.
 */
const KEEP = [
    /* The Firebase project. Renaming the string does not rename the project; it points auth at
       a project that does not exist and signs every user out permanently. Changing it for real
       means creating a new Firebase project and migrating the user records. */
    ['proton-mining.firebaseapp.com', 'ion-mining.firebaseapp.com', 'Firebase auth domain'],
    ['proton-mining.firebasestorage.app', 'ion-mining.firebasestorage.app', 'Firebase storage'],
    ['projectId: "proton-mining"', 'projectId: "ion-mining"', 'Firebase project id'],

    /* Stored data. These are attribution values and field names inside statement records
       already written to KV. Renaming them makes every existing record unreadable. */
    ['proton_economic', 'ion_economic', 'stored attribution value'],
    ['proton_maintenance', 'ion_maintenance', 'stored attribution value'],
    ['proton_curtailed_available', 'ion_curtailed_available', 'stored field name'],

    /* Scene variants. scene-pad-ion.js and scene-landfill-ion.js are the "built" version of a
       drawing against scene-*-now.js, the "today" version. The word is internal - it never
       reaches a reader - and the filenames are referenced by two generators, three suites and
       six committed fixtures. Renaming them is a separate job with no user-visible benefit. */
    ['scene-pad-proton', 'scene-pad-ion', 'scene filename'],
    ['scene-landfill-proton', 'scene-landfill-ion', 'scene filename'],
];

/* ---------------------------------------------------------------- run */

const files = [];
(function walk(d) {
    for (const n of fs.readdirSync(d)) {
        if (SKIP_DIR.has(n)) continue;
        const p = path.join(d, n);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (EXT.test(n) && !VENDOR.test(n) && !SKIP_FILE.has(n)) files.push(p);
    }
})(ROOT);

const tally = {};
const touched = [];
let total = 0;

for (const f of files) {
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    let out = src;

    for (const [re, to, label] of RULES) {
        out = out.replace(re, (...args) => {
            tally[label] = (tally[label] || 0) + 1;
            total++;
            return typeof to === 'string'
                ? to.replace(/\$(\d)/g, (_, i) => args[+i])
                : to;
        });
    }
    for (const [wrong, right] of KEEP) {
        out = out.split(wrong).join(right);
    }

    if (out !== src) {
        touched.push(path.relative(ROOT, f).replace(/\\/g, '/'));
        if (!DRY) fs.writeFileSync(f, out);
    }
}

console.log((DRY ? 'DRY RUN — nothing written\n' : '') + '=== replacements by kind ===');
Object.entries(tally).sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log('  ' + String(n).padStart(5) + '  ' + k));
console.log('  ' + String(total).padStart(5) + '  TOTAL in ' + touched.length + ' files');

console.log('\n=== deliberately left alone ===');
KEEP.forEach(([, right, why]) => console.log('  ' + right.padEnd(38) + why));
