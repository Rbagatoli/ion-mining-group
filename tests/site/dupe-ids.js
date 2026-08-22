/* Duplicate ids across every page. energy.html now carries four drawings, and
   every drawing answers to <prefix>dg-flow, <prefix>dg-s0-top and the rest — a
   repeated prefix means two scenes writing the same path element, which looks
   like one drawing simply refusing to move. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const path = require('path');

const DIR = REPO_ROOT + 'site';
let bad = 0;

fs.readdirSync(DIR).filter(f => f.endsWith('.html')).forEach(f => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const seen = new Map();
    const re = /\sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        seen.set(m[1], (seen.get(m[1]) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    if (dupes.length) {
        bad++;
        console.log('  ' + f + ': ' + dupes.length + ' duplicated');
        dupes.slice(0, 12).forEach(([id, n]) => console.log('      ' + id + ' x' + n));
    }
});

console.log(bad ? '\n  FAIL: ' + bad + ' page(s) with duplicate ids'
                : '  every id on every page is unique');
process.exit(bad ? 1 : 0);
