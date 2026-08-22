// Tests for the portal/ pages.
//
// These are containment tests. The portal is served from the same origin as the operator app and
// shares its palette, which makes it very easy for somebody to "helpfully" add shared.js to get
// the nav, or sync.js to get the sign-in plumbing — and either would put Ion's own fleet, wallet,
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

var PAGES = fs.readdirSync(PORTAL).filter(function(f) { return /\.html$/.test(f); });
var SCRIPTS = fs.readdirSync(PORTAL).filter(function(f) { return /\.js$/.test(f); });

// ---- 1. what must never be loaded ---------------------------------------------------------------

console.log('\n=== the operator app is not shipped to a counterparty ===');
(function() {
    ok('there are pages to check', PAGES.length > 0, PAGES.join(', '));

    var BANNED = [
        ['sync.js', 'SYNC_KEYS covers Ion fleet, wallet, payouts and banking'],
        ['shared.js', 'builds the operator nav and its auth plumbing'],
        ['firestore-compat', 'the portal never talks to Firestore directly'],
        ['banking.js', 'Ion accounting'],
        ['fleet-data.js', 'Ion miners'],
        ['map-sourcing.js', 'Ion acquisition pipeline'],
        ['site-model.js', 'Ion prospect records']
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
        // rather than exempted from it: DOM text on a grid and one setInterval, with
        // no network, no storage and no reference to anything else — which is
        // asserted below rather than asked for on trust. What a counterparty's
        // browser loads is decided deliberately, not by whatever got added.
        var ALLOWED = [/firebase-app-compat/, /firebase-auth-compat/, /firebase-config\.js/,
                       /\.\/portal\.js/, /\.\/portal-demo\.js/, /\.\/gas-field\.js/];
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
    var fn = new Function('localStorage', 'location', portalJs + '; return IonPortal;');
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
    var P = new Function(portalJs + '; return IonPortal;')();

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
    var P = new Function(portalJs + '; return IonPortal;')();
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
            demoSrc + ';' + patched + '; return IonPortal;');
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
    ok('clicking enters it', open.startDemo() && open.inDemo());

    // THE ASSERTION THIS SECTION EXISTS FOR.
    var deployed = build('https://ion-portal.example.workers.dev');
    ok('once a backend is configured the preview is gone', !deployed.demoAvailable(),
       'the fence is the endpoint, not a flag somebody has to remember');
    ok('and it cannot be entered', !deployed.startDemo() && !deployed.inDemo());
})();

console.log('\n=== and it says so on every screen ===');
(function() {
    var demoSrc = fs.readFileSync(path.join(PORTAL, 'portal-demo.js'), 'utf8');
    var mainSrc = fs.readFileSync(path.join(PORTAL, 'portal.js'), 'utf8');
    var store = {};
    var P = new Function('localStorage', 'location', demoSrc + ';' + mainSrc + '; return IonPortal;')(
        { getItem: function(k) { return store[k] || null; },
          setItem: function(k, v) { store[k] = v; }, removeItem: function(k) { delete store[k]; } },
        { hostname: 'localhost', origin: 'http://localhost' });
    P.startDemo();

    // Both pages must call it. A banner on one screen and not the other is how orders-demo.js
    // ended up showing a fake bitcoin address with no warning on it.
    PAGES.forEach(function(p) {
        var src = fs.readFileSync(path.join(PORTAL, p), 'utf8');
        ok(p + ' raises the demo banner', /demoBanner\(\)/.test(src));
    });

    // Every response carries the flag, so a page that forgets to check has still been told.
    var Demo = new Function(demoSrc + '; return PortalDemo;')();
    ok('the seller record is flagged', Demo.handle('/portal/me').body.demo === true);
    ok('the statement list is flagged', Demo.handle('/portal/statements').body.demo === true);
    ok('and a statement is flagged',
       Demo.handle('/portal/statements/SAMPLE-LANDFILL-1/2026-07').body.demo === true);

    // The sample data must be obviously not a real counterparty.
    ok('the legal name says it is a demonstration', /demonstration/i.test(Demo.seller.legal_name));
    ok('and the site is named SAMPLE', /SAMPLE/.test(Demo.seller.sites[0]));

    // It must still refuse a site that is not the sample seller's — same answer as the worker,
    // so the preview does not teach a different behaviour than the real thing.
    var wrong = Demo.handle('/portal/statements/SOMEONE-ELSE/2026-07');
    eq('another site is 404 in the preview too', wrong.status, 404);
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
     'firebase', 'sync.js', 'shared.js', 'IonPortal', 'PORTAL_ENDPOINT'].forEach(function (bad) {
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

    var pt = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
    ok('the canvas is in the markup', pt.indexOf('id="gasField"') > 0);
    ok('inside an aria-hidden backdrop',
       /<div class="pt-bg" aria-hidden="true">[\s\S]{0,400}gasField/.test(pt));
})();

console.log('\n=== it is the hero rise, and only the rise ===');
(function () {
    /* The point of this file is that it is the SAME animation as the marketing
       site's hero with two of its three parts removed — not a lookalike. So the
       constants are checked against site/hero-anim.js rather than pinned to
       literals here: if the hero is retuned and this is not, they have drifted
       apart and a producer arriving from the site sees two different substances. */
    var gas = fs.readFileSync(path.join(ROOT, 'portal', 'gas-field.js'), 'utf8');
    var hero = fs.readFileSync(path.join(ROOT, 'site', 'hero-anim.js'), 'utf8');

    var SHARED = [
        ['the platinum ink', "'229,228,226'"],
        ['the hot orange', "'247,147,26'"],
        ['the warm midpoint', "'255,196,107'"],
        ['the rise speed', 'rand(18, 46)'],
        ['the drift rate', 'rand(0.006, 0.02)'],
        ['the drift amplitude', 'rand(3, 11)'],
        ['the density rule', 'w * h / 2600'],
        ['the emitter spacing', 'w / 62'],
        ['the cooling ramp', '0.14 + (1 - climb) * 0.5'],
        ['the haze flicker', 'Math.sin(t * 3.1) * 0.012']
    ];
    SHARED.forEach(function (pair) {
        ok(pair[0] + ' matches the hero',
           gas.indexOf(pair[1]) >= 0 && hero.indexOf(pair[1]) >= 0, pair[1]);
    });

    /* And the two parts that were deliberately left behind. The lattice is the
       busiest half of the hero and the half that says 'hashrate'; this is a
       sign-in for somebody selling gas. */
    ['nodes', 'lattice', 'NODE_GAP', 'LINK_AT', 'solve'].forEach(function (gone) {
        ok('no lattice: ' + gone + ' is absent',
           gas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').indexOf(gone) < 0);
    });

    /* shadowBlur is the single most expensive thing available on a busy canvas.
       hero-anim.js says so in its header and layers rectangles instead — and so
       does this file, which is why the check is against the STRIPPED source. The
       first version read the raw text and failed on the comment forbidding it. */
    var code = gas.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok('no shadowBlur', code.indexOf('shadowBlur') < 0);

    /* A backgrounded tab must not be able to teleport the field on return. */
    ok('the frame delta is clamped', /MAX_DT/.test(gas) && /Math\.min\(MAX_DT/.test(gas));
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
