/* Mutation-test the landfill-first copy guards.

   The plan for this change asked specifically that the vocabulary check be
   mutation-tested "by putting one back", because a check that greps for absent
   words passes just as happily when its own scoping is broken and it is reading
   an empty string. Each mutation below reinstates exactly one thing the switch
   to landfill-first removed. */
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

const MUTATIONS = [
    /* The tagline is a concatenation split over three lines in the generator,
       which is exactly why it survived the first pass of this change: the
       eleven pages were fixed and the thing that rewrites them was not. */
    { file: S + 'tools/build-seo.js', gen: true,
      why: 'the GENERATED tagline put back to flare-first',
      from: "'Bitcoin mining sites built on landfill gas, flared gas, and '",
      to:   "'Bitcoin mining sites built on flared gas, landfill gas, and '" },

    { file: S + 'hosting.html',
      why: 'one page left flare-first while the generator is right',
      from: 'built on landfill gas, flared gas', to: 'built on flared gas, landfill gas' },

    { file: S + 'index.html',
      why: 'the home hero back to flare-first',
      from: 'landfill gas, flared gas', to: 'flared gas, landfill gas' },

    { file: S + 'energy.html',
      why: '"wellhead" reinstated in the page lede',
      from: 'If you are flaring landfill gas',
      to:   'If you are flaring gas at the wellhead, flaring landfill gas' },

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

    { file: S + 'energy.html',
      why: 'the fuel cards reordered so flared gas leads',
      swapCards: true },
];

const touched = [...new Set(MUTATIONS.map(m => m.file))]
    .concat([S + 'energy.html', S + 'index.html', S + 'hosting.html']);
const original = new Map([...new Set(touched)].map(f => [f, fs.readFileSync(f, 'utf8')]));

let caught = 0; const missed = [];

try {
    for (const m of MUTATIONS) {
        const src = original.get(m.file);
        let next;
        if (m.swapCards) {
            /* Move the flared-gas card ahead of the landfill one, headings and
               bodies together, by swapping the two <div class="card ...> blocks. */
            const cut = (s, head) => {
                const h = s.indexOf(head);
                if (h < 0) return null;
                const start = s.lastIndexOf('<div class="card', h);
                const end = s.indexOf('</div>', s.indexOf('</p>', h)) + 6;
                return { start, end, text: s.slice(start, end) };
            };
            const a = cut(src, '>Landfill &amp; digester gas<');
            const b = cut(src, '>Flared associated gas<');
            if (!a || !b || !(a.end <= b.start)) { missed.push(m.why + '   [could not locate the two cards]'); continue; }
            next = src.slice(0, a.start) + b.text + src.slice(a.end, b.start) + a.text + src.slice(b.end);
        } else {
            if (src.indexOf(m.from) < 0) { missed.push(m.why + '   [ANCHOR NOT FOUND]'); continue; }
            next = src.replace(m.from, m.to);
        }
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
