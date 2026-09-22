/* Focused gas sourcing with broad research coverage and accurate fuel descriptions.

   The company-wide footer and Organization metadata must reflect broad energy
   sourcing. The Energy Partners explorer and enquiry accept the complete source
   range. The two existing gas drawings remain accurate examples, without
   implying that every energy source uses gas collection and generation.

   WHAT IS NOT A VIOLATION. Oil and gas vocabulary is correct in two places: the
   legacy "Flared associated gas" card, if present, and the wellpad drawing
   behind the fuel switch, whose own labels and alt text describe a
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
   /specialize in landfill and stranded gas/.test(organization.description) &&
   /other sources are researched selectively/.test(organization.description) && /Owner confirmation/.test(organization.description),
   'generated Organization metadata includes the gas specialty, selective wider scope and unconfirmed supply');
['flared gas, landfill gas', 'flared gas, landfill'].forEach(bad2 => {
    ok(index.indexOf(bad2) < 0, 'the home page does not lead with flare ("' + bad2 + '")');
});
const homeSources = (index.match(/<div class="home-research-sources"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
const homeSourceLabels = [...homeSources.matchAll(/<button\b[^>]*data-energy-site-select="[^"]+"[^>]*>([\s\S]*?)<\/button>/g)]
    .map(match => match[1].replace(/<[^>]+>/g, '').trim());
ok(['Hydro', 'Nuclear', 'Wind', 'Solar', 'Landfill gas', 'Flare gas', 'Industrial surplus', 'Grid supply'].every(label => homeSourceLabels.includes(label)),
   'the home sourcing preview includes gas and non-gas energy options');

/* Energy-owner discovery and intake must cover the same broad service. Keep an
   independent ID list so removing a source from both the module and the page
   cannot make the two agree on an accidentally narrowed catalogue. */
const energy = fs.readFileSync(D + 'energy.html', 'utf8');
const LFION = require(D + 'scene-landfill-ion.js');
const PROTON   = require(D + 'scene-pad-ion.js');
const { sources } = require(D + 'energy-partners.js');
const requiredSources = ['hydro', 'nuclear', 'wind', 'solar', 'geothermal', 'natural_gas',
    'landfill_gas', 'flare_gas', 'biomass_biogas', 'waste_to_energy', 'marine',
    'recovered_energy', 'coal', 'oil', 'industrial_surplus', 'grid_supply'];
ok(sources.length === requiredSources.length && requiredSources.every(id => sources.some(source => source.id === id)),
   'the owner explorer supports all sixteen energy source types');
ok(sources[0].id === 'landfill_gas' && sources[1].id === 'flare_gas',
   'the source guide leads with landfill and flare while retaining every source');
function selectMarkup(id) {
    const match = energy.match(new RegExp('<select\\b([^>]*\\bid="' + id + '"[^>]*)>([\\s\\S]*?)<\\/select>'));
    return match ? { attributes: match[1], options: [...match[2].matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(option => ({
        attributes: option[1], value: (option[1].match(/\bvalue="([^"]*)"/) || [])[1], label: option[2]
    })) } : { attributes: '', options: [] };
}
const explorer = selectMarkup('partnerSource');
const intake = selectMarkup('s-type');
ok(explorer.options[0]?.value === 'landfill_gas' &&
   /data-partner-source="landfill_gas" aria-pressed="true"/.test(energy) &&
   /id="partnerSourceTitle">Landfill gas,/.test(energy),
   'the initial owner selector, quick button and guidance agree on the landfill specialty');
for (const [label, select] of [['explorer', explorer], ['enquiry form', intake]]) {
    ok(requiredSources.every(id => select.options.filter(option => option.value === id).length === 1) &&
       sources.every(source => select.options.some(option => option.value === source.id && option.label === source.label)),
       'the ' + label + ' includes each source exactly once with the matching label');
}
ok(/id="partnerExplorer"/.test(energy) && /data-partner-discuss/.test(energy),
   'source-specific guidance has a route to the owner enquiry');
ok(/\brequired\b/.test(intake.attributes) && intake.options[0] && intake.options[0].value === '' &&
   !intake.options.some(option => /\bselected\b/.test(option.attributes)),
   'the enquiry requires an explicit source choice, without a preselected offer');
ok(intake.options.some(option => option.value === 'other'),
   'the enquiry allows other or mixed energy sources');
const gasSection = (energy.match(/<!-- ===== THE PAD ===== -->([\s\S]*?)<!-- ===== \/THE PAD ===== -->/) || [])[1] || '';
const gasIntro = gasSection.split('<div class="dg-fuel-pane"')[0];
ok(/Gas-site examples/.test(gasIntro) && /two gas-site configurations/.test(gasIntro) &&
   /landfill and flare examples/.test(gasIntro) && /Other energy sources follow the routes above/.test(gasIntro),
   'the 3D introduction explicitly limits the drawings to two gas-site examples');
ok(/Choose a gas-site example/.test(gasIntro),
   'the scene selector describes gas examples rather than all energy sources');
const sceneTypes = [...gasSection.matchAll(/class="dg-fuel-pane" data-fuel="([^"]+)"/g)].map(match => match[1]);
ok(sceneTypes.length === 2 && sceneTypes.includes('landfill') && sceneTypes.includes('flare'),
   'the gas drawings are not relabelled as other types of energy infrastructure');

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

/* The owner invitation identifies the specialty without removing wider routes. */
const lede = (energy.match(/<p class="lede"(?:\s[^>]*)?>([^<]+)/) || [])[1] || '';
ok(/initial focus is landfill and stranded gas/.test(lede) &&
   /Hydro, existing powered sites and other sources are considered selectively/.test(lede) &&
   /usable supply/.test(lede) && /existing infrastructure/.test(lede),
   'the owner lede leads with gas, retains selective wider sourcing and checks usable infrastructure');

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
