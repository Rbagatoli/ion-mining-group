// Tests for the portal/ pages.
//
// These are containment tests. The portal is served from the same origin as the operator app and
// shares its palette, which makes it very easy for somebody to "helpfully" add shared.js to get
// the nav, or sync.js to get the sign-in plumbing — and either would put Proton's own fleet, wallet,
// payouts and banking data into a counterparty's browser.
//
// So the rule is asserted rather than remembered.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PORTAL = path.join(ROOT, 'portal');

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

/* WHAT SHIPS, not what is on this disk.
//
// Enumerated from git rather than from readdirSync, because those are different
// sets and only one of them reaches a counterparty. A scratch file dropped into
// portal/ during development — a stylesheet preview, a probe — is not a page
// anyone can load from the deployed site, and enrolling it here produces
// failures that say "_probe.html does not load firebase", which is true,
// meaningless, and teaches people that a red suite is normal.
//
// The exemption cannot be used to smuggle anything in: the moment such a file is
// committed it ships, and the moment it ships git lists it and every rule below
// applies to it. There is no state in which a file is both reachable and
// exempt. */
function tracked(ext) {
    try {
        var out = require('child_process')
            .execSync('git ls-files portal', { cwd: ROOT, encoding: 'utf8' });
        return out.split('\n')
            .map(function(l) { return l.trim().replace(/^portal\//, ''); })
            .filter(function(f) { return f && f.indexOf('/') < 0 && ext.test(f); });
    } catch (e) {
        // No git (a tarball, a CI image without it). Fall back to the disk and
        // say so, rather than silently checking nothing.
        console.log('  NOTE  git unavailable; falling back to the working directory');
        return fs.readdirSync(PORTAL).filter(function(f) { return ext.test(f); });
    }
}

var PAGES = tracked(/\.html$/);

var SCRIPTS = tracked(/\.js$/);

// ---- 1. what must never be loaded ---------------------------------------------------------------

console.log('\n=== the operator app is not shipped to a counterparty ===');
(function() {
    ok('there are pages to check', PAGES.length > 0, PAGES.join(', '));

    var BANNED = [
        ['sync.js', 'SYNC_KEYS covers Proton fleet, wallet, payouts and banking'],
        ['shared.js', 'builds the operator nav and its auth plumbing'],
        ['firestore-compat', 'the portal never talks to Firestore directly'],
        ['banking.js', 'Proton accounting'],
        ['fleet-data.js', 'Proton miners'],
        ['map-sourcing.js', 'Proton acquisition pipeline'],
        ['site-model.js', 'Proton prospect records']
    ];

    PAGES.forEach(function(p) {
        var src = fs.readFileSync(path.join(PORTAL, p), 'utf8');
        // Only <script src=...> matters — a prose mention in a comment explaining WHY it is
        // absent must not fail the test that keeps it absent.
        var tags = (src.match(/<script[^>]+src=["'][^"']+["']/g) || []).join(' ');
        BANNED.forEach(function(b) {
            ok(p + ' does not load ' + b[0], tags.indexOf(b[0]) < 0, b[1]);
        });
    });
})();

console.log('\n=== what the pages DO load is deliberate and minimal ===');
(function() {
    PAGES.forEach(function(p) {
        var src = fs.readFileSync(path.join(PORTAL, p), 'utf8');
        var srcs = (src.match(/<script[^>]+src=["']([^"']+)["']/g) || []).map(function(t) {
            return t.match(/src=["']([^"']+)["']/)[1];
        });
        // Firebase for authentication, the shared auth facade, and the portal's own code.
        ok(p + ' loads firebase auth', srcs.some(function(s) { return /firebase-auth-compat/.test(s); }));
        ok(p + ' loads the auth facade', srcs.some(function(s) { return /firebase-config\.js/.test(s); }));
        ok(p + ' loads portal.js', srcs.some(function(s) { return /portal\.js/.test(s); }));

        // An ALLOWLIST rather than a count. The first version asserted "exactly four scripts",
        // which failed the moment portal-demo.js was added and said nothing about whether the
        // fifth was dangerous — a count catches arrivals but cannot tell you what arrived.
        // gas-field.js draws the rising-gas field behind the sign-in. It is on this list
        // rather than exempted from it: one canvas driven by requestAnimationFrame,
        // with no network, no storage and no reference to anything else — which is
        // asserted below rather than asked for on trust. (That sentence used to say
        // "DOM text on a grid and one setInterval", which described hex-rain.js, two
        // backdrops ago. The justification for letting a file into a counterparty's
        // browser has to describe the file that is actually there.) What a
        // counterparty's browser loads is decided deliberately, not by whatever
        // got added.
        // fleet-chart.js draws the hosting client's daily history. It is on this list on
        // exactly the same terms as gas-field.js: it renders an SVG from an array it is
        // handed and touches nothing else — no network, no storage, no reference to any
        // other module — which is asserted at the bottom of this file rather than taken
        // on trust. It is also the file that would be most tempting to let fetch its own
        // data "just for the chart", which is why the assertion exists before anybody tries.
        var ALLOWED = [/firebase-app-compat/, /firebase-auth-compat/, /firebase-config\.js/,
                       /\.\/portal\.js/, /\.\/portal-demo\.js/, /\.\/gas-field\.js/,
                       /\.\/fleet-chart\.js/];
        var unexpected = srcs.filter(function(s) {
            return !ALLOWED.some(function(re) { return re.test(s); });
        });
        eq(p + ' loads nothing beyond the allowlist', unexpected.join(' '), '');
    });
})();

// ---- 2. no endpoint or key is baked into a static page -------------------------------------------

console.log('\n=== nothing secret is published ===');
(function() {
    var portalJs = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');

    // Same discipline as site/orders-api.js: the deployed URL is not knowable in the repo, and a
    // key in a static page is a published key.
    ok('PORTAL_ENDPOINT is empty in the repo',
       /var PORTAL_ENDPOINT = '';/.test(portalJs),
       'it is filled in at deploy, not committed');

    SCRIPTS.concat(PAGES).forEach(function(f) {
        var src = fs.readFileSync(path.join(PORTAL, f), 'utf8');
        ok(f + ' carries no bearer secret',
           !/OPS_SECRET|DEVICE_ROOT_KEY|sk_live|sk_test|whsec_/.test(src));
    });
})();

// ---- 3. the rendering rule that the whole ledger depends on ---------------------------------------

console.log('\n=== an absent value renders as absent, not as zero ===');
(function() {
    // The ledger goes to considerable trouble to return null rather than 0 for an unmeasured
    // quantity. A template that prints an empty string for null throws all of that away, because
    // a blank cell in a money column reads as zero.
    var portalJs = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');

    // Load it and check the behaviour rather than the source.
    var sandbox = { localStorage: null, location: { hostname: 'localhost', origin: 'http://x' } };
    var fn = new Function('localStorage', 'location', portalJs + '; return ProtonPortal;');
    var P = fn(sandbox.localStorage, sandbox.location);

    ok('null quantity says so', /not measured/.test(P.num(null)));
    ok('undefined quantity says so', /not measured/.test(P.num(undefined)));
    ok('NaN says so rather than printing NaN', /not measured/.test(P.num(NaN)));
    ok('and a real zero is a real zero', P.num(0).indexOf('0') === 0,
       'a MEASURED zero must not be hidden either');
    ok('a real number renders', /1,234/.test(P.num(1234.5, 'Mcf')));

    ok('null money says not calculated', /not calculated/.test(P.money(null)));
    ok('and zero money is $0.00', P.money(0).indexOf('$0.00') === 0);
    ok('a real amount renders', /\$1,625\.00/.test(P.money(1625)));

    ok('null coverage is unknown', /unknown/.test(P.pct(null)));
    ok('and zero coverage is 0.0%', P.pct(0) === '0.0%',
       'zero coverage is a fact, not a missing value');

    ok('a null date does not print Invalid Date', !/Invalid/.test(P.date(null)));
    ok('nor does a malformed one', !/Invalid/.test(P.date('not-a-date')));
})();

console.log('\n=== the incomplete-total warning cannot be missed ===');
(function() {
    var portalJs = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');
    var P = new Function(portalJs + '; return ProtonPortal;')();

    var partial = P.partialBanner({ total_is_partial: true });
    ok('a partial total produces a banner', partial.length > 0);
    ok('which says the total is incomplete', /incomplete/i.test(partial));
    ok('and says the real figure can only be higher', /higher than or equal/.test(partial),
       'so a seller is never led to think they are owed less than they are');
    eq('a complete total produces nothing', P.partialBanner({ total_is_partial: false }), '');
})();

// ---- 4. escaping ---------------------------------------------------------------------------------

console.log('\n=== values from the server are escaped ===');
(function() {
    var portalJs = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');
    var P = new Function(portalJs + '; return ProtonPortal;')();
    eq('angle brackets are escaped', P.esc('<script>'), '&lt;script&gt;');
    eq('quotes are escaped', P.esc('a"b'), 'a&quot;b');
    eq('ampersands first, so escaping is not double-applied',
       P.esc('&lt;'), '&amp;lt;');
    eq('null becomes empty rather than the word null', P.esc(null), '');
})();

// ---- 5. the preview, and the fence that kills it ------------------------------------------------

console.log('\n=== the sample-data preview cannot survive a real backend ===');
(function() {
    var demoSrc = fs.readFileSync(path.join(PORTAL, 'portal-demo.js'), 'utf8');
    var mainSrc = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');

    function build(endpoint) {
        // Rebuild portal.js with an endpoint configured, which is what deploying does. If the
        // preview can still be reached after that, the fence is decoration.
        var patched = mainSrc.replace("var PORTAL_ENDPOINT = '';",
                                      "var PORTAL_ENDPOINT = '" + endpoint + "';");
        var store = {};
        var fn = new Function('localStorage', 'location',
            demoSrc + ';' + patched + '; return ProtonPortal;');
        return fn(
            { getItem: function(k) { return store[k] || null; },
              setItem: function(k, v) { store[k] = v; },
              removeItem: function(k) { delete store[k]; } },
            { hostname: 'rbagatoli.github.io', origin: 'https://rbagatoli.github.io' });
    }

    var open = build('');
    ok('with no backend, the preview is offered', open.demoAvailable());
    ok('but nobody is in it until they ask', !open.inDemo(),
       'a counterparty who mistypes a password gets the real refusal, not sample numbers');
    ok('clicking enters it', open.startDemo('producer') && open.inDemo());
    eq('and the preview knows which portal it is', open.demoKind(), 'producer');

    /* Two portals now share the door, so entering a preview means saying WHICH.
       startDemo() with no kind refuses rather than defaulting: a preview that
       silently picks one shows a reviewer the wrong counterparty's business. */
    var other = build('');
    ok('a preview cannot be entered without naming a kind', !other.startDemo() && !other.inDemo());
    ok('nor with a kind that does not exist', !other.startDemo('operator') && !other.inDemo());
    ok('the hosting preview is its own', other.startDemo('hosting') && other.inDemo());
    eq('and knows it', other.demoKind(), 'hosting');

    // THE ASSERTION THIS SECTION EXISTS FOR.
    var deployed = build('https://proton-portal.example.workers.dev');
    ok('once a backend is configured the preview is gone', !deployed.demoAvailable(),
       'the fence is the endpoint, not a flag somebody has to remember');
    ok('and it cannot be entered',
       !deployed.startDemo('producer') && !deployed.startDemo('hosting') && !deployed.inDemo());
})();

console.log('\n=== and it says so on every screen ===');
(function() {
    var demoSrc = fs.readFileSync(path.join(PORTAL, 'portal-demo.js'), 'utf8');
    var mainSrc = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');
    var store = {};
    var P = new Function('localStorage', 'location', demoSrc + ';' + mainSrc + '; return ProtonPortal;')(
        { getItem: function(k) { return store[k] || null; },
          setItem: function(k, v) { store[k] = v; }, removeItem: function(k) { delete store[k]; } },
        { hostname: 'localhost', origin: 'http://localhost' });
    P.startDemo('producer');

    // Both pages must call it. A banner on one screen and not the other is how orders-demo.js
    // ended up showing a fake bitcoin address with no warning on it.
    PAGES.forEach(function(p) {
        var src = fs.readFileSync(path.join(PORTAL, p), 'utf8');
        ok(p + ' raises the demo banner', /demoBanner\(\)/.test(src));
    });

    // Every response carries the flag, so a page that forgets to check has still been told.
    var Demo = new Function(demoSrc + '; return PortalDemo;')();
    var PS = Demo.SESSIONS.producer, HS = Demo.SESSIONS.hosting;
    ok('the seller record is flagged', Demo.handle('/portal/me', PS).body.demo === true);
    ok('the statement list is flagged', Demo.handle('/portal/statements', PS).body.demo === true);
    ok('and a statement is flagged',
       Demo.handle('/portal/statements/SAMPLE-LANDFILL-1/2026-07', PS).body.demo === true);
    ok('the hosting account is flagged', Demo.handle('/portal/me', HS).body.demo === true);
    ok('the hosting list is flagged',
       Demo.handle('/portal/hosting/statements', HS).body.demo === true);
    ok('and a hosting statement is flagged',
       Demo.handle('/portal/hosting/statements/SAMPLE-SITE-1/2026-07', HS).body.demo === true);

    /* THE FLAG IS NOW READ, not merely written. It used to be stamped on every
       response with a comment saying "a page that forgets to check has still
       been told", while nothing anywhere read it — the banner came from
       localStorage alone. api() reads it at the one chokepoint every response
       passes through, so sample data cannot reach a screen that is not
       admitting it. */
    ok('portal.js reads the flag it is sent',
       /body\.demo === true/.test(mainSrc),
       'the banner is armed by the data, not only by the session');

    // The sample data must be obviously not a real counterparty.
    ok('the legal name says it is a demonstration', /demonstration/i.test(Demo.seller.legal_name));
    ok('and the site is named SAMPLE', /SAMPLE/.test(Demo.seller.sites[0]));

    // It must still refuse a site that is not the sample seller's — same answer as the worker,
    // so the preview does not teach a different behaviour than the real thing.
    var wrong = Demo.handle('/portal/statements/SOMEONE-ELSE/2026-07', PS);
    eq('another site is 404 in the preview too', wrong.status, 404);

    /* The two previews are as separated as the two accounts are: asking for the
       other kind's path gets the same 404 the worker gives, so a preview cannot
       teach a behaviour the real thing does not have. */
    eq('a producer preview cannot reach a hosting path',
       Demo.handle('/portal/hosting/statements', PS).status, 404);
    eq('and a hosting preview cannot reach a producer path',
       Demo.handle('/portal/statements', HS).status, 404);

    ok('the hosting legal name says it is a demonstration',
       /demonstration/i.test(Demo.host.legal_name));
    ok('and its site is named SAMPLE', /SAMPLE/.test(Demo.host.sites[0]));

    /* The sample fleet carries a machine that stopped reporting, with nulls
       rather than zeros. It is the case the whole rendering rule exists for, and
       a reviewer should meet it in the preview rather than in production. */
    var hst = Demo.handle('/portal/hosting/statements/SAMPLE-SITE-1/2026-07', HS).body;
    var dark = (hst.machines || []).filter(function(m) { return m.kwh === null; });
    ok('a machine that stopped reporting is null, not zero', dark.length === 1,
       'a machine nobody heard from is not a machine that did no work');
    ok('and its uptime and hashrate are null too',
       dark.length === 1 && dark[0].uptime_pct === null && dark[0].hashrate_th === null);
})();

console.log('\n=== the sample months show the cases that matter ===');
(function() {
    var Demo = new Function(fs.readFileSync(path.join(PORTAL, 'portal-demo.js'), 'utf8') +
                            '; return PortalDemo;')();
    var jul = Demo.statements['2026-07'];
    ok('one month has an incomplete total', jul.total_is_partial === true);
    eq('with the shortfall pending, not zero', jul.take_or_pay.shortfall, null);
    ok('and a prior-period adjustment', (jul.adjustments || []).length > 0);

    var jun = Demo.statements['2026-06'];
    var kinds = (jun.quantity.gaps || []).map(function(g) { return g.kind; });
    ok('another shows both kinds of gap', kinds.indexOf('bounded') >= 0 && kinds.indexOf('unbounded') >= 0,
       kinds.join(', '));
    eq('the unbounded one has a null volume, not zero',
       jun.quantity.gaps.filter(function(g) { return g.kind === 'unbounded'; })[0].volume_mcf, null);

    ok('and one is simply clean', Demo.statements['2026-05'].total_is_partial === false);
})();


console.log('\n=== the sign-in backdrop stays inert ===');
(function () {
    /* gas-field.js is allowed into a counterparty's browser on the grounds that
       it cannot reach anything: it paints a canvas it was handed and does
       nothing else. That is the entire basis for the allowlist entry above, so
       it is checked rather than repeated. */
    var raw = fs.readFileSync(path.join(ROOT, 'portal', 'gas-field.js'), 'utf8');
    // Comments stripped, because the header explains where this came FROM and
    // names site/hero-anim.js in doing so. A rule about what the code may touch
    // has to be checked against the code — the same trap the firestore-rules and
    // ledger tests both record.
    var gf = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
     'firebase', 'sync.js', 'shared.js', 'ProtonPortal', 'PORTAL_ENDPOINT'].forEach(function (bad) {
        ok('the gas field does not reference ' + bad, gf.indexOf(bad) < 0);
    });

    /* It sizes itself from the VIEWPORT, never from the element it sits behind.
       hero-anim.js carries a long note about exactly this: its first version read
       the host's border box and wrote it into a content box, and every observer
       tick grew the canvas by the border width. */
    ['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth']
        .forEach(function (m) {
            ok('it does not measure any element (' + m + ')', gf.indexOf(m) < 0);
        });

    ok('it honours prefers-reduced-motion', /prefers-reduced-motion/.test(gf));
    ok('and draws a still field rather than nothing', /still\(\)/.test(gf),
       'reduced motion means still, not absent');
    ok('it stops on a hidden tab', /visibilitychange/.test(gf));
    ok('and when scrolled offscreen', /IntersectionObserver/.test(gf));

    /* On BOTH pages and on every view. The field used to come off the moment a
       session started, on the argument that behind statements and volumes it is
       decoration over data somebody is reading. */
    ['index.html', 'statement.html'].forEach(function (page) {
        var pt = fs.readFileSync(path.join(ROOT, 'portal', page), 'utf8');
        ok(page + ' carries the canvas', pt.indexOf('id="gasField"') > 0);
        ok('  inside an aria-hidden backdrop',
           /<div class="pt-bg" aria-hidden="true">[\s\S]{0,400}gasField/.test(pt));
        ok('  and loads the field', /gas-field\.js/.test(pt));
    });

    var pcss = fs.readFileSync(path.join(ROOT, 'portal', 'portal.css'), 'utf8');
    var pcode = pcss.replace(/\/\*[\s\S]*?\*\//g, '');

    /* WHAT MAKES IT SAFE BEHIND DATA is not the scrim, it is that every figure
       sits on an opaque card. If --surface ever goes translucent, the gas field
       appears behind money and this whole arrangement is wrong — so the token
       is asserted here, in the file that depends on it, rather than trusted. */
    var tokens = fs.readFileSync(path.join(ROOT, 'tokens.css'), 'utf8');
    ok('--surface is opaque, so the field can never be behind a figure',
       /--surface:\s*#[0-9a-fA-F]{3,8}\s*;/.test(tokens),
       (tokens.match(/--surface:[^;]*/) || [''])[0].trim());
    ok('and the cards actually use it',
       /\.pt-card\s*\{[^}]*background:\s*var\(--surface\)/.test(pcode));

    /* The backdrop is no longer gated on the sign-in view. .pt-signin now picks
       WHICH scrim runs: a radial over the sign-in card, a column across the
       860px measure of the scrolling portal. */
    ok('the backdrop is not hidden by default',
       /\.pt-bg\s*\{[^}]*display:\s*block/.test(pcode) &&
       !/body\.pt-signin\s+\.pt-bg\s*\{\s*display/.test(pcode));
    ok('the default scrim is the column',
       /\.pt-bg::after\s*\{[^}]*linear-gradient\(90deg/.test(pcode));
    ok('and sign-in still gets the radial over its card',
       /body\.pt-signin\s+\.pt-bg::after\s*\{[^}]*radial-gradient/.test(pcode));
    ok('both clear to the same edge value the site is tuned against',
       (pcode.match(/rgba\(0,0,0,0\.12\)/g) || []).length >= 2,
       '.anim-field ships at 0.85; the scrims clear to 0.12 so the rise reads at ~0.88 either side');

    /* A statement is a commercial document. */
    var printBlock = (pcss.match(/@media print \{[\s\S]*?\n\}/) || [''])[0];
    ok('print drops the backdrop entirely', /\.pt-bg\s*\{\s*display:\s*none/.test(printBlock));
})();

console.log('\n=== it is the hero rise, and only the rise ===');
(function () {
    /* The point of this file is that it is the SAME animation as the marketing
       site's fields — not a lookalike. It used to be "the hero with two of its
       three parts removed"; the hero has since lost its lattice too, so the two
       files are now the same two parts and differ in one deliberate place, which
       is asserted below. So the constants are checked against site/hero-anim.js
       rather than pinned to literals here: if the site is retuned and this is not,
       they have drifted
       apart and a producer arriving from the site sees two different substances. */
    var gas = fs.readFileSync(path.join(ROOT, 'portal', 'gas-field.js'), 'utf8');
    var hero = fs.readFileSync(path.join(ROOT, 'site', 'hero-anim.js'), 'utf8');

    /* Comments stripped before the constants are compared, and this is the whole
       point of the section rather than a detail. Both files describe their own
       constants at length in prose — "the rule asks for 586 across the hero",
       "alpha 0.14 + (1 - climb) * 0.5" — so matched against the raw text, a file
       could delete the code and keep the sentence about it, and every row below
       would still pass. The table is supposed to prove the two animations ARE
       the same, so it has to read what runs. */
    var stripped = function (s) {
        return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    };
    var gasCode = stripped(gas), heroCode = stripped(hero);

    /* THE THIRD COPY. The app runs this animation too, behind every operator
       page, and it is a separate file for the same reason the portal's is: the
       build publishes site/ at /, the portal at /portal/ and the app at /app/,
       so one shared file a level up resolves to nothing in two of the three.
       Three copies with no assertion between them is how they drift; the table
       below is what makes the duplication safe rather than merely necessary. */
    var app = fs.readFileSync(path.join(ROOT, 'gas-field.js'), 'utf8');
    var appCode = stripped(app);

    var SHARED = [
        ['the platinum ink', "'229,228,226'"],
        ['the hot orange', "'247,147,26'"],
        ['the warm midpoint', "'255,196,107'"],
        ['the rise speed', 'rand(18, 46)'],
        ['the drift rate', 'rand(0.006, 0.02)'],
        ['the drift amplitude', 'rand(3, 11)'],
        ['the density rule', 'w * h / 2600'],
        ['the particle ceiling', 'Math.min(900,'],
        ['the emitter spacing', 'w / 62'],
        ['the cooling ramp', '0.14 + (1 - climb) * 0.5'],
        ['the haze flicker', 'Math.sin(t * 3.1) * 0.012']
    ];
    SHARED.forEach(function (pair) {
        ok(pair[0] + ' matches the site',
           gasCode.indexOf(pair[1]) >= 0 && heroCode.indexOf(pair[1]) >= 0, pair[1]);
        ok(pair[0] + ' matches in the app too',
           appCode.indexOf(pair[1]) >= 0, pair[1]);
    });

    /* And the app's copy is the portal's copy below the header comment. The two
       are sized to a viewport in the same way and differ only in what they say
       about themselves, so anything beyond a prose difference is drift. */
    ok('the app field is the portal field, code for code',
       appCode.replace(/\s+/g, ' ').trim() === gasCode.replace(/\s+/g, ' ').trim(),
       'gas-field.js vs portal/gas-field.js');

    /* The lattice, which this file never had and the site no longer has either.
       It was the busiest half of the hero and the half that said 'hashrate',
       which is not the argument a sign-in for somebody SELLING gas is making.
       Checked in both files now: site/hero-anim.js dropped it so that every
       backdrop on the site would be this same animation, and the cheap way to
       undo that by accident is to let one of the two grow it back. */
    ['nodes', 'lattice', 'NODE_GAP', 'LINK_AT', 'solve'].forEach(function (gone) {
        ok('no lattice in the portal field: ' + gone, gasCode.indexOf(gone) < 0);
        ok('  nor in the site field: ' + gone, heroCode.indexOf(gone) < 0);
    });

    /* THE ONE INTENDED DIFFERENCE, so that "the same animation" stays a claim
       with an edge to it rather than a slogan.

       The site's fields sit in bounded boxes whose bottom edge is a real edge —
       on the hero it is also the bevel between the hero zone and the band below
       — so the source burns ON it at h - 2 and you see the line. The portal's is
       a full viewport behind a sign-in card, which has no floor to be the floor
       of, so it pushes the source to h + 12 and the emitters sit below the fold:
       what you see there is gas that has already left them.

       If a third value ever appears, or these two converge, it should be because
       somebody decided to — not because a constant got copied across. */
    ok('the site burns its source line on the bottom edge',
       /sourceY = h - 2;/.test(heroCode));
    ok('and the portal puts its emitters below the fold',
       /sourceY = h \+ 12;/.test(gasCode));

    /* shadowBlur is the single most expensive thing available on a busy canvas.
       hero-anim.js says so in its header and layers rectangles instead — and so
       does this file, which is why the check is against the STRIPPED source. The
       first version read the raw text and failed on the comment forbidding it. */
    var code = gas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok('no shadowBlur', code.indexOf('shadowBlur') < 0);

    /* A backgrounded tab must not be able to teleport the field on return. */
    ok('the frame delta is clamped', /MAX_DT/.test(gas) && /Math\.min\(MAX_DT/.test(gas));
})();


    /* ---- the sign-in is the front door ----

       startDemo() persists its token so a reload mid-preview does not throw you
       out. The cost of that was: once anybody had ever clicked "Preview with
       sample data", every later arrival went straight past the sign-in into a
       lobby of invented numbers, and somebody sent the portal link never saw a
       login at all.

       The rule is where you came FROM. statement.html links back to index with
       "All statements" — an inside move, which must not end a preview — while
       the Producer Portal button on the site is an outside one, which must land
       on the sign-in.

       The function is lifted out of the page and run here rather than grepped
       for, because the interesting cases are the awkward ones: no referrer at
       all, a referrer on another origin, and a same-origin page that is not the
       portal. All three have to read as outside. */
    (function () {
        var page = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');

        ok('an outside arrival ends the preview session',
           /if \(P\.inDemo\(\) && !cameFromInsidePortal\(\)\)[\s\S]{0,60}setSession\(null\)/.test(page));

        var src = page.slice(page.indexOf('function cameFromInsidePortal'));
        src = src.slice(0, src.indexOf('\n    }') + 6);

        function evalWith(referrer, href) {
            var fn = new Function('document', 'location', 'URL',
                                  src + '; return cameFromInsidePortal();');
            return fn({ referrer: referrer }, { origin: 'https://protonminingco.com' }, URL);
        }

        var SITE = 'https://protonminingco.com';
        [['', false, 'no referrer at all (typed, bookmarked, new tab)'],
         [SITE + '/index.html', false, 'the marketing home page'],
         [SITE + '/hardware.html', false, 'the hardware catalogue'],
         ['https://example.com/portal/x', false, 'another origin, even at /portal/'],
         ['not a url', false, 'a referrer that will not parse'],
         [SITE + '/portal/statement.html', true, 'a statement, inside the portal'],
         [SITE + '/portal/', true, 'the portal itself']
        ].forEach(function (c) {
            eq('referrer "' + c[2] + '" reads as ' + (c[1] ? 'inside' : 'outside'),
               evalWith(c[0]), c[1]);
        });
    })();


console.log('\n=== a machine is only "mining" if we have actually heard from it ===');
(function() {
    var demoSrc = fs.readFileSync(path.join(PORTAL, 'portal-demo.js'), 'utf8');
    var mainSrc = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');
    var P = new Function('localStorage', 'location', mainSrc + '; return ProtonPortal;')(
        null, { hostname: 'x', origin: 'y' });

    /* THE ASSERTION THIS SECTION EXISTS FOR.

       Two of the pool proxies in this repo decide a worker is online with a
       fallback of the form `w.status === 'active' || w.is_active || w.hashrate > 0`,
       where that hashrate is a decaying hourly average. A machine that died fifty
       minutes ago still carries a non-zero one and reports Online. On the
       operator's own dashboard that is a nuisance; on a hosting customer's screen
       it is a false statement about their property.

       So the portal derives the state itself. A reported status can move a
       machine DOWN, but can never on its own hold one UP. */
    var now = Date.parse('2026-08-01T12:00:00Z');
    var fresh = '2026-08-01T11:55:00Z';   // 5 minutes
    var old = '2026-08-01T10:00:00Z';     // 2 hours

    eq('heard from recently and reported up', P.rigState(fresh, 'online', now), 'online');
    eq('reported down is down whatever the clock says', P.rigState(fresh, 'offline', now), 'offline');
    eq('reported UP but not heard from is NOT up', P.rigState(old, 'online', now), 'stale',
       'this is the pool fallback that reports a dead machine as online');
    eq('no timestamp at all is not up either', P.rigState(null, 'online', now), 'stale');
    eq('nor an unparseable one', P.rigState('not-a-date', 'online', now), 'stale');

    /* The three states have distinct words. The operator dashboard has only two
       and cannot say "we have not heard from it", which is the state a hosting
       client most needs distinguished from a confirmed failure. */
    var words = ['online', 'stale', 'offline'].map(function(k) { return P.stateWord(k); });
    ok('the three states read differently', new Set(words).size === 3, words.join(' / '));
    ok('and an unknown state does not read as fine',
       P.stateWord('wat') === P.stateWord('stale'),
       'an unrecognised state must never fall through to "mining"');

    /* The sample fleet carries the awkward case, so a reviewer meets it in the
       preview rather than in production. */
    var Demo = new Function(demoSrc + '; return PortalDemo;')();
    var fleet = Demo.handle('/portal/hosting/rigs', Demo.SESSIONS.hosting).body;
    ok('the sample fleet is flagged as sample', fleet.demo === true);

    /* THE ROUTE ANSWERS WITH SITES NOW, not one fleet. A hosting client can hold machines at
       more than one facility — the account record was always a list and listStatements always
       walked all of it, while this route and the history route quietly read sites[0]. The sample
       has two sites so that the case is the one a reviewer meets. */
    ok('the sample has more than one facility', (fleet.sites || []).length > 1,
       (fleet.sites || []).length + ' sites');
    ok('and a combined summary across them', !!fleet.summary);

    /* Flattened, because the assertions below are about the fleet a client owns, not about how
       it is split. */
    var all = [];
    (fleet.sites || []).forEach(function(v) {
        (v.rigs || []).forEach(function(g) { all.push(g); });
    });
    fleet = { rigs: all, sites: fleet.sites, summary: fleet.summary, demo: fleet.demo };

    var states = {};
    fleet.rigs.forEach(function(g) {
        var st = P.rigState(g.last_seen, g.reported);
        (states[st] = states[st] || []).push(g);
    });

    /* The sample is a CONTAINER, not a handful: a hosting customer with 104
       machines is the case that breaks a one-card-per-machine design, and a
       four-machine sample is how nobody notices. */
    ok('the sample fleet is a realistic size', fleet.rigs.length > 100,
       fleet.rigs.length + ' machines');

    ok('some are mining', (states.online || []).length > 0);
    ok('one is confirmed down', (states.offline || []).length === 1);
    ok('and several are reported up but not actually heard from',
       (states.stale || []).length >= 2,
       'the pool fallback case, which is the one worth meeting in a preview');
    ok('every machine the pool claims is up but we cannot confirm says so',
       (states.stale || []).every(function(g) { return g.reported === 'online'; }));

    var quiet = (states.stale || []).concat(states.offline || []);
    ok('and none of them reports a hashrate of zero',
       quiet.length > 0 && quiet.every(function(g) { return g.hashrate_th === null; }),
       'a machine nobody has heard from is not a machine doing no work');

    /* Deterministic, so two people reviewing the preview are looking at the same
       fleet and can say "s21-033" and mean the same machine. */
    /* Comment-stripped, because the generator documents its own determinism by
       saying "no Math.random" -- matched against the raw file this assertion
       fails on the sentence promising the thing it is checking for. Fourth time
       this repo has recorded that trap. */
    var demoCode = demoSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('the sample fleet is deterministic', !/Math\.random/.test(demoCode),
       'a preview that reshuffles cannot be discussed');

    // A producer preview must not reach it, same as the real worker.
    eq('a producer preview cannot see a fleet',
       Demo.handle('/portal/hosting/rigs', Demo.SESSIONS.producer).status, 404);
})();

console.log('\n=== the dashboard says where each figure came from ===');
(function() {
    var page = fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8');

    /* site/hosting.html promises "per-machine hashrate, board temperature, fan
       speed, and power draw". Exactly one of those four is obtainable: every pool
       proxy in this repo normalises a worker to {worker_name, hashrate, status},
       and a pool observes share submissions rather than sensors. So the portal
       must not display the other three, and must say why rather than showing
       three columns of permanent blanks. */
    ['board temperature', 'fan speed'].forEach(function(t) {
        ok('the page explains that ' + t + ' is not available', page.indexOf(t) > 0);
    });
    ok('and says a pool cannot measure them', /a pool cannot measure them/.test(page));
    ok('site draw is labelled as metered, not per-machine',
       /metered at the rack/.test(page) && /not divided between/.test(page),
       'dividing a cage meter by machine count is an allocation, not a measurement');
    ok('the freshness window is stated to the reader, not just applied',
       /heard from in the last/.test(page));

    /* Counted from the derived state rather than trusting summary.online, or the
       headline figure would carry the pool's claim while the cards below
       disagreed with it. */
    ok('the machines-mining count is derived, not taken from the payload',
       /P\.rigState\(rigs\[i\]\.last_seen/.test(page),
       'the summary and the cards must not be able to disagree');
})();




console.log('\n=== the fleet overview shows only what Proton can actually know ===');
(function() {
    var raw = fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8');
    /* Comments stripped, because the code that EXCLUDES those five cards
       explains itself by naming them -- "Est. daily earnings", "Fleet ROI",
       "Avg power / miner" all appear in the block arguing for their absence.
       Matched against the raw file every one of these checks fails on its own
       justification. Same trap this file records twice already. */
    var page = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    ok('there is a fleet overview', /Fleet overview/.test(page));
    ok('and the machines are their own labelled block', /pt-section-label">Machines/.test(page));

    /* The operator's own Fleet Overview carries ten cards. Five of them cannot
       honestly appear on a hosting client's screen, and the reason differs per
       card, so they are asserted absent individually rather than as one grep.

       Earnings is the important one. A hosting client's payouts go from the pool
       straight to their own wallet -- Proton neither holds nor pays them. A daily
       earnings estimate from Proton would be Proton asserting a figure about money it
       never touches, on a page whose whole claim is that every number is
       measured. */
    ok('no earnings estimate', !/Daily Earnings|Est\. Daily|dailyUSD|dailyBTC/i.test(page),
       'their payouts go pool to wallet; Proton does not hold or pay them');
    ok('no ROI', !/\bROI\b/.test(page), 'Proton does not know what they paid for the machines');
    ok('no per-machine power', !/Avg Power|avgPower/i.test(page),
       'dividing a cage meter by machine count is an allocation, not a measurement');

    /* Every derived figure goes through one guard that returns null when either
       input is missing, so a division by an absent hashrate renders "not
       measured" rather than a confident 0 J/TH. A bare division in a metric is
       the bug this prevents. */
    ok('derived metrics are guarded', /function ratio\(/.test(page));
    ok('and the guard refuses a missing or zero denominator',
       /typeof a !== 'number' \|\| typeof b !== 'number'/.test(page) && /b === 0/.test(page));

    /* Average per machine divides by the machines actually REPORTING. Dividing
       by the total would quietly report a lower average whenever a machine went
       quiet, which reads as every machine slowing down rather than as one
       machine missing. */
    ok('average per machine is over the reporting ones',
       /ratio\(sum\.hashrate_th, live\)/.test(page),
       'live is the count derived from rigState, not summary.online');
    ok('and the page says so', /ones actually reporting/.test(page),
       'the sentence is built by concatenation, so match a fragment of one piece');

    /* All-in efficiency is derived from a cage meter, so it includes cooling and
       it degrades when a machine draws without producing. Saying that is the
       difference between a number and a misleading number. */
    ok('all-in efficiency is labelled all-in', /All-in efficiency/.test(page));
    ok('and its basis is explained',
       /covers cooling too/.test(page) && /drawing power without reporting work/.test(page),
       'a number from a cage meter is misleading unless its scope is stated');
})();


console.log('\n=== a hundred machines do not become a hundred cards ===');
(function() {
    var raw = fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8');
    var page = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    /* THE PROBLEM THIS SOLVES. One card per machine is fine for a handful and a
       wall for a container. With a hundred machines the single fact worth having
       -- which one is broken -- ends up somewhere in the middle of a hundred
       identical tiles. So the exceptions come out of the list and go on top, and
       the rest goes into a table that starts collapsed. */
    ok('there is a size at which cards stop', /CARD_LIMIT/.test(page));
    ok('and a table for the rest', /pt-table/.test(page) && /<tbody id="ptRows">/.test(page));
    ok('the machines needing attention are lifted out',
       /attention = all\.filter/.test(page) && /pt-attention/.test(page));
    ok('and a healthy fleet says so rather than showing nothing',
       /pt-allgood/.test(page) && /machines are mining/.test(page));

    /* Worst first. A hundred rows in pool order buries the broken one; a
       hundred rows worst-first puts it on the first line. Sorted by name within
       a state so the order does not shuffle between refreshes. */
    ok('rows are ordered worst first', /RANK = \{ offline: 0, stale: 1, online: 2 \}/.test(page));
    ok('and stably within a state', /localeCompare/.test(page));

    /* The repo's rule about silent caps: if coverage is bounded, say by how
       much, or a subset reads as the whole fleet. */
    ok('the table cap is stated, not silent',
       /MAX_ROWS/.test(page) && /Showing the first/.test(page));

    ok('a large fleet is searchable by name', /ptFilter/.test(page) && /data-worker=/.test(page));
})();

console.log('\n=== the history chart stays inert too ===');
(function () {
    /* Same basis as the gas field, and the same check. This one matters more: a chart is
       the natural place for somebody to add "just a quick fetch" for its own data, and the
       portal's whole containment argument is that a counterparty's browser loads nothing
       that can reach Proton's side. The data arrives as an argument or it does not arrive. */
    var raw = fs.readFileSync(path.join(ROOT, 'portal', 'fleet-chart.js'), 'utf8');
    var fc = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
     'firebase', 'sync.js', 'shared.js', 'PortalDemo', 'PORTAL_ENDPOINT'
    ].forEach(function (bad) {
        ok('the chart does not reference ' + bad, fc.indexOf(bad) < 0);
    });

    /* NOTHING MAY MEASURE THE PAGE. The whole drawing is a viewBox and the pointer lands on
       a hit column that carries its own index, so there is nothing to convert. Every one of
       these would work, and every one of them reintroduces the layout-thrash class of bug
       this project has already paid for once. */
    ['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight',
     'ResizeObserver', 'innerWidth', 'innerHeight', 'getScreenCTM'
    ].forEach(function (bad) {
        ok('the chart does not measure with ' + bad, fc.indexOf(bad) < 0);
    });

    ok('it is loaded by index.html',
       fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8').indexOf('fleet-chart.js') >= 0);
})();

console.log(String.fromCharCode(10) + '=== the cache stamp matches what it is stamping ===');
(function () {
    /* THE FAILURE THIS CATCHES HAS NO SYMPTOMS.

       Every portal asset is requested as `?v=<stamp>`. When the stamp does not change, a browser
       that has the old file does not ask for the new one — so the deploy succeeds, the server
       holds the right bytes, every test here passes, and the person looking at the page sees the
       previous version. There is nothing to debug, because nothing is broken. The browser was
       told the URL had not changed and believed it.

       It happened: the portal was restyled end to end, verified in headless Chrome (a fresh
       profile every run, hence always a cold cache, hence never this bug), and reported as
       finished. The answer was "nothing changed", and that was the truth.

       The stamp is now a hash of the assets, so this asserts the committed pages carry the hash
       of the committed files. It deliberately RECOMPUTES rather than regenerating: a check that
       fixed the stamp in order to check it would report success while the repo still held the
       stale one. */
    /* One stamper for every area now. It began portal-only and the marketing site then went
       stale in exactly the same way — a new pricing section invisible because the page and its
       stylesheet were both cached and neither carried a version at all. Two tools doing one job
       is two tools to forget, so there is one. */
    var stamper = require(path.join(ROOT, 'tools', 'build-asset-stamp.js'));
    var area = stamper.AREAS.filter(function (a) { return a.name === 'portal'; })[0];
    ok('the portal is an area the stamper knows about', !!area);
    var want = stamper.expected(area);
    var have = stamper.current(area);

    ok('the portal hashes some assets', want.hashed > 0, want.hashed + ' files');
    eq('every page carries one stamp, not several', have.length, 1);
    eq('and it is the hash of what they load', have[0], want.stamp);

    /* A stamp is only worth having on things a browser caches hard. If a script or stylesheet
       ever ships unstamped, it is the one that will go stale. */
    ['index.html', 'statement.html'].forEach(function (page) {
        var src = fs.readFileSync(path.join(PORTAL, page), 'utf8');
        var local = (src.match(/(?:src|href)="(?:\.\/|\.\.\/)[^"]+\.(?:js|css)[^"]*"/g) || []);
        var bare = local.filter(function (u) { return u.indexOf('?v=') < 0; });
        eq(page + ': no local asset ships unstamped', bare.join(' '), '');
    });
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
