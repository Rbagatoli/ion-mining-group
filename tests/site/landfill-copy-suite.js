/* Nationwide sourcing and accurate project-specific fuel descriptions.

   The company-wide footer and Organization metadata must reflect broad energy
   sourcing. Landfill still leads the existing hosted-project presentation, with
   flared gas also served. Those project details and drawings remain accurate
   without constraining the scope of the separate nationwide sourcing service.

   WHAT IS NOT A VIOLATION. Oil and gas vocabulary is correct in two places: the
   "Flared associated gas" card, which is about oil and gas, and the wellpad
   drawing behind the fuel switch, whose own labels and alt text describe a
   wellpad. Flagging those would be flagging the flared-gas business for
   existing. The checks below carve those zones out and read what is left. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';
const fs = require('fs');
const path = require('path');

const D = REPO_ROOT + 'site/';
let bad = 0;
function ok(cond, what, detail) {
    console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + what + (detail ? '   ' + detail : ''));
    if (!cond) bad++;
}

const pages = fs.readdirSync(D).filter(f => f.endsWith('.html'));

/* ---------- 1. Broad company scope; specific hosted-project fuels ---------- */

const navigation = require(D + 'tools/build-nav.js');
const expectedFooter = 'Bitcoin mining, hosting and nationwide energy site sourcing.';
ok(navigation.FOOTER_BLURB === expectedFooter,
   'the shared footer describes nationwide sourcing alongside mining and hosting');
const oldFooterFixture = '<main>Landfill project equipment.</main><footer><p class="footer-blurb">Landfill and flare sites only.</p><a href="./energy.html">Energy partnerships</a></footer>';
const generatedFooterFixture = navigation.applyFooterBlurb(oldFooterFixture, 'test-fixture');
ok(generatedFooterFixture === oldFooterFixture.replace('Landfill and flare sites only.', expectedFooter),
   'footer replacement changes the company description without rewriting project content');
ok(navigation.applyFooterBlurb(generatedFooterFixture, 'test-fixture') === generatedFooterFixture,
   'repeated footer generation is stable');

/* Static pages are updated by build-nav; generated articles inherit the updated
   privacy footer through build-blog. Check the artifacts as well as the source. */
const wrongFooters = [], missingFooters = [];
pages.forEach(f => {
    const s = fs.readFileSync(D + f, 'utf8');
    const m = s.match(/<p class="footer-blurb">([^<]*)<\/p>/);
    if (!m && Object.prototype.hasOwnProperty.call(navigation.PAGES, f)) missingFooters.push(f);
    if (m && m[1] !== expectedFooter) wrongFooters.push(f);
});
ok(!wrongFooters.length && !missingFooters.length,
   'static pages and generated articles retain the same broad footer',
   wrongFooters.concat(missingFooters).join(', ') || pages.length + ' pages');

/* The home hero. */
const index = fs.readFileSync(D + 'index.html', 'utf8');
const structuredData = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
const organization = structuredData.find(item => item['@type'] === 'Organization');
ok(organization && organization.description.startsWith(expectedFooter) &&
   /hydro, nuclear/.test(organization.description) && /Owner confirmation/.test(organization.description),
   'generated Organization metadata includes broad research scope and unconfirmed supply');
['flared gas, landfill gas', 'flared gas, landfill'].forEach(bad2 => {
    ok(index.indexOf(bad2) < 0, 'the home page does not lead with flare ("' + bad2 + '")');
});

/* The four-fuel grid on energy.html: landfill's card comes first. */
const energy = fs.readFileSync(D + 'energy.html', 'utf8');
const LFION = require(D + 'scene-landfill-ion.js');
const PROTON   = require(D + 'scene-pad-ion.js');
const cards = [...energy.matchAll(/<h3 class="h-card">([^<]+)<\/h3>/g)].map(m => m[1]);
const iLandCard = cards.findIndex(c => /landfill/i.test(c));
const iFlareCard = cards.findIndex(c => /flared/i.test(c));
ok(iLandCard >= 0 && iFlareCard >= 0 && iLandCard < iFlareCard,
   'the fuel cards put landfill ahead of flared gas',
   cards.slice(0, 4).join(' | '));

/* The form's fuel select, same order. */
const opts = [...energy.matchAll(/<option>([^<]*(?:andfill|lared)[^<]*)<\/option>/g)].map(m => m[1]);
ok(opts.length >= 2 && /andfill/.test(opts[0]),
   'and so does the enquiry form', opts.join(' | '));

/* ---------- 2. The narrative is fuel-neutral ----------
   Everything outside the flared-gas card and the wellpad drawing. */

function narrativeOf(src) {
    let s = src;
    /* Out: the whole flared-gas fuel card. */
    const c = s.indexOf('<h3 class="h-card">Flared associated gas</h3>');
    if (c > 0) {
        const end = s.indexOf('</div>', s.indexOf('</p>', c));
        s = s.slice(0, c) + s.slice(end);
    }
    /* Out: the flare pane, drawing, labels, alt text and mobile list alike. */
    const p = s.indexOf('<div class="dg-fuel-pane" data-fuel="flare"');
    if (p > 0) {
        const end = s.indexOf('</section>', p);
        s = s.slice(0, p) + s.slice(end);
    }
    /* Out: HTML comments, which explain the very words they must not contain. */
    return s.replace(/<!--[\s\S]*?-->/g, '');
}

const narrative = narrativeOf(energy);
ok(narrative.length > 4000 && narrative.indexOf('data-fuel="landfill"') > 0,
   'the narrative slice still contains the page', narrative.length + ' chars');
/* Proof the carve-out really removed the two zones. Match the card's BODY, not
   its heading: "Flared associated gas" also names an option in the enquiry
   form, which has to stay — the form lists the fuels we serve, and flared gas
   is still one of them. */
ok(narrative.indexOf('Oil producers with gas they cannot') < 0,
   'the carve-out removed the flared-gas card body');
ok(narrative.indexOf('padnow') < 0 && narrative.indexOf('padion') < 0,
   'and the wellpad drawing with it');

const UPSTREAM = ['wellhead', 'wellpad', 'well pad', 'separator', 'tank battery',
                  'Permian', 'Bakken', 'the barrels', 'Mcf you can send'];
UPSTREAM.forEach(t => {
    const re = new RegExp(t.replace(/ /g, '\\s+'), 'i');
    ok(!re.test(narrative), 'no "' + t + '" outside the flared-gas card and drawing');
});

/* The page lede itself names landfill first. */
const lede = (energy.match(/<p class="lede"(?:\s[^>]*)?>([^<]+)/) || [])[1] || '';
ok(/landfill/i.test(lede) && lede.indexOf('landfill') < lede.indexOf('associated'),
   'the page lede names landfill before associated gas', lede.slice(0, 72) + '...');

/* ---------- 3. The landfill drawings describe a landfill ---------- */

/* role="img" narrows this to the DRAWINGS. A bare aria-label search also picked
   up the slider's own label, which legitimately says "Your landfill as it is
   today" and is not alt text for anything. */
const alts = [...energy.matchAll(/role="img" aria-label="([^"]+)"/g)].map(m => m[1]);
const lfAlts = alts.filter(a => /landfill/i.test(a));
const padAlts = alts.filter(a => /wellpad/i.test(a));
ok(lfAlts.length === 2, 'both landfill drawings carry their own alt text', lfAlts.length + ' found');
ok(padAlts.length === 2, 'and both wellpad drawings still carry theirs', padAlts.length + ' found');
ok(new Set(alts).size === alts.length, 'every alt text on the page is distinct',
   alts.length + ' labels');

lfAlts.forEach((a, i) => {
    const leak = ['wellhead', 'tank battery', 'separator', 'wellpad']
        .filter(t => new RegExp(t, 'i').test(a));
    ok(leak.length === 0,
       'landfill alt ' + (i + 1) + ' describes no equipment that is not in it',
       leak.length ? 'MENTIONS: ' + leak.join(', ') : a.slice(0, 58) + '...');
});

/* THE COUNT IN THE ALT TEXT MUST MATCH THE COUNT IN THE DRAWING.

   The landfill yard went from two containers to four, and the alt text went on
   saying "two" — a number a sighted visitor can check and a screen-reader user
   cannot. Nothing else here would have caught it: every vocabulary check above
   passes on a sentence that is simply out of date.

   Counted off the scene module rather than written down, so the two cannot
   drift again. */
const WORD = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
[['landfill', LFION, /landfill/i], ['wellpad', PROTON, /wellpad/i]].forEach(([name, scene, which]) => {
    const boxes = scene.objects().filter(o => /^cont/.test(o.id)).length;
    const alt = alts.filter(a => which.test(a) && /container/.test(a))[0] || '';
    ok(boxes > 0, '  the ' + name + ' scene draws containers', boxes + ' of them');
    ok(alt.indexOf(WORD[boxes] + ' container') >= 0,
       '  and its alt text says "' + WORD[boxes] + ' containers", matching',
       alt ? (alt.match(/(one|two|three|four|five|six) containers?/) || ['no count'])[0]
           : 'NO ALT FOUND');
});

/* A screen reader must be told what a sighted visitor sees: a cell, wells, a
   blower. Copying the pad text and swapping a word would pass the check above
   and still describe the wrong site. */
const wants = [/cell/i, /extraction wells?/i, /blower/i];
ok(wants.every(w => lfAlts.some(a => w.test(a))),
   'and between them they name the cell, the wells and the blower');

console.log('');
console.log(bad ? '  landfill-copy-suite: ' + bad + ' FAILED' : '  landfill-copy-suite: ALL OK');
process.exit(bad ? 1 : 0);
