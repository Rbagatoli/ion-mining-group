/* Mutation-test national service scope and project-specific fuel copy guards.

   The plan for this change asked specifically that the vocabulary check be
   mutation-tested "by putting one back", because a check that greps for absent
   words passes just as happily when its own scoping is broken and it is reading
   an empty string. Mutations narrow the company-wide service scope or reinstate
   an inaccurate fuel description in the hosted-project presentation. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const { execFileSync } = require('child_process');

const S = REPO_ROOT + 'site/';
const HERE = __dirname + '/';

function fails(args, cwd) {
    try { execFileSync(process.execPath, args, { cwd: cwd, stdio: 'pipe' }); return false; }
    catch (e) { return true; }
}
const copy = () => fails([HERE + 'landfill-copy-suite.js'], HERE);
const rebuild = () => { try { execFileSync(process.execPath, ['tools/build-seo.js'], { cwd: S, stdio: 'pipe' }); execFileSync(process.execPath, ['tools/build-diagram.js', 'energy'], { cwd: S, stdio: 'pipe' }); } catch (e) {} };

/* An existing unrelated failure must not make every mutation look caught. */
if (copy()) {
    console.error('Copy checks must pass before mutations run. Regenerate the site first.');
    process.exit(1);
}

const MUTATIONS = [
    /* Check the shared source separately from one stale generated artifact.
       Requiring build-nav is read-only, so its source mutation needs no rebuild. */
    { file: S + 'tools/build-nav.js',
      why: 'the shared footer source narrows nationwide sourcing to two fuels',
      from: "const FOOTER_BLURB = 'Bitcoin mining, hosting and nationwide energy site sourcing.';",
      to:   "const FOOTER_BLURB = 'Bitcoin mining sites built on landfill gas and flared gas.';" },

    { file: S + 'tools/build-seo.js', gen: true,
      why: 'generated Organization metadata loses the nationwide service scope',
      from: "description: FOOTER_BLURB +",
      to:   "description: 'Landfill and flare site sourcing only. ' +" },

    { file: S + 'hosting.html',
      why: 'one page retains a restricted company footer while the source is broad',
      from: '<p class="footer-blurb">Bitcoin mining, hosting and nationwide energy site sourcing.</p>',
      to:   '<p class="footer-blurb">Bitcoin mining sites built on landfill gas and flared gas.</p>' },

    { file: S + 'index.html',
      why: 'the home source preview drops a non-gas source',
      from: '<li>Nuclear</li>', to: '' },

    { file: S + 'energy.html',
      why: '"wellhead" reinstated in the page lede',
      from: 'Our initial focus is landfill and stranded gas, including flare sites.',
      to:   'Our initial focus is landfill and stranded gas at the wellhead, including flare sites.' },

    { file: S + 'energy.html',
      why: 'the owner hero invitation removes selective wider sourcing',
      from: 'Hydro, existing powered sites and other sources are considered selectively around client needs.',
      to:   'We only consider landfill gas and flare gas sites.' },

    { file: S + 'energy.html',
      why: 'the enquiry loses nuclear while the explorer still offers it',
      from: '<select id="s-type" name="energy_type" required data-mailto-label><option value="">Choose a source</option><option value="hydro">Hydro</option><option value="nuclear">Nuclear</option>',
      to:   '<select id="s-type" name="energy_type" required data-mailto-label><option value="">Choose a source</option><option value="hydro">Hydro</option>' },

    { file: S + 'energy.html',
      why: 'the enquiry silently preselects a fuel instead of asking the owner',
      from: '<select id="s-type" name="energy_type" required data-mailto-label><option value="">Choose a source</option>',
      to:   '<select id="s-type" name="energy_type" required data-mailto-label><option value="landfill_gas" selected>Landfill gas</option>' },

    { file: S + 'tools/build-diagram.js', gen: true,
      why: 'the gas scene selector claims to represent every energy source',
      from: "fuelLabel: 'Choose a gas-site example'",
      to:   "fuelLabel: 'Choose your energy source'" },

    { file: S + 'tools/build-diagram.js', gen: true,
      why: 'the gas drawings lose their explicit example framing',
      from: "heading: 'See two gas-site configurations.'",
      to:   "heading: 'See every type of energy site.'" },

    { file: S + 'energy.html',
      why: '"tank battery" reinstated in a spec row',
      from: '<div class="spec-key">Land</div>',
      to:   '<div class="spec-key">Land beside the tank battery</div>' },

    { file: S + 'tools/build-diagram.js', gen: true,
      why: "the wellpad's alt text copied onto a landfill drawing",
      from: "alt: 'Interactive drawing of a landfill gas collection system as it operates today: a capped cell with extraction wells across it, a header main gathering them, a blower holding the field under vacuum, and an enclosed flare burning everything it brings up. Drag to rotate, scroll to zoom.'",
      to:   "alt: 'Interactive drawing of a wellpad as it operates today: wellhead, separator, tank battery, and a lit flare stack burning the gas that has no customer. Drag to rotate, scroll to zoom.'" },

    { file: S + 'tools/build-diagram.js', gen: true,
      why: 'the two landfill drawings given the same alt text',
      from: "alt: 'The same landfill with Proton on it: the flare down to a pilot, and a tie-in downstream of the blower running gas through a treatment skid, an enclosed genset, a transformer, and four containers of miners — the same equipment drawn on the home page. Drag to rotate, scroll to zoom.'",
      to:   "alt: 'Interactive drawing of a landfill gas collection system as it operates today: a capped cell with extraction wells across it, a header main gathering them, a blower holding the field under vacuum, and an enclosed flare burning everything it brings up. Drag to rotate, scroll to zoom.'" },

];

const touched = [...new Set(MUTATIONS.map(m => m.file))]
    .concat([S + 'energy.html', S + 'index.html', S + 'hosting.html']);
const original = new Map([...new Set(touched)].map(f => [f, fs.readFileSync(f, 'utf8')]));

let caught = 0; const missed = [];

try {
    for (const m of MUTATIONS) {
        const src = original.get(m.file);
        if (src.indexOf(m.from) < 0) { missed.push(m.why + '   [ANCHOR NOT FOUND]'); continue; }
        const next = src.replace(m.from, m.to);
        fs.writeFileSync(m.file, next);
        if (m.gen) rebuild();

        const red = copy();
        console.log((red ? '  caught  ' : '  MISSED  ') + m.why);
        if (red) caught++; else missed.push(m.why);

        fs.writeFileSync(m.file, src);
        if (m.gen) { for (const [f, s2] of original) fs.writeFileSync(f, s2); rebuild(); }
    }
} finally {
    for (const [f, s2] of original) fs.writeFileSync(f, s2);
    rebuild();
    for (const [f, s2] of original) fs.writeFileSync(f, s2);
}

console.log('');
console.log('  ' + caught + '/' + MUTATIONS.length + ' copy mutations caught');
if (missed.length) { console.log('  SURVIVED:'); missed.forEach(w => console.log('    - ' + w)); }
process.exit(missed.length ? 1 : 0);
