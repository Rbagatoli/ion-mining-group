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
        // genesis-field.js draws the hex field behind the sign-in. It is on this list
        // rather than exempted from it: DOM text on a grid and one setInterval, with
        // no network, no storage and no reference to anything else — which is
        // asserted below rather than asked for on trust. What a counterparty's
        // browser loads is decided deliberately, not by whatever got added.
        var ALLOWED = [/firebase-app-compat/, /firebase-auth-compat/, /firebase-config\.js/,
                       /\.\/portal\.js/, /\.\/portal-demo\.js/, /\.\/genesis-field\.js/];
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
    /* genesis-field.js is allowed into a counterparty's browser on the grounds
       that it cannot reach anything: it paints a canvas it was handed and does
       nothing else. That is the entire basis for the allowlist entry above, so
       it is checked rather than repeated. */
    var raw = fs.readFileSync(path.join(ROOT, 'portal', 'genesis-field.js'), 'utf8');
    // Comments stripped, because the header explains WHERE this was recovered from and names
    // shared.js in doing so. A rule about what the code may touch has to be checked against the
    // code — the same trap the firestore-rules and ledger tests both record.
    var gf = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB',
     'firebase', 'sync.js', 'shared.js', 'IonPortal', 'PORTAL_ENDPOINT'].forEach(function (bad) {
        ok('the genesis field does not reference ' + bad, gf.indexOf(bad) < 0);
    });

    /* It sizes itself from the VIEWPORT, never from the element it sits behind.
       A backdrop that measures its container is a backdrop that depends on the
       layout in front of it, which is how one ends up a frame behind. */
    ['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth']
        .forEach(function (m) {
            ok('it does not measure any element (' + m + ')', gf.indexOf(m) < 0);
        });

    /* Motion is optional; the picture is not. */
    ok('it honours prefers-reduced-motion', /prefers-reduced-motion/.test(gf));
    ok('and still draws one frame when motion is off', /reduced[\s\S]{0,200}draw\(0\)/.test(gf) ||
       /draw\(0\)[\s\S]{0,200}if \(reduced\) return/.test(gf),
       'reduced motion means still, not absent');

    /* Two independent stop conditions, so a tab regaining focus does not restart
       a field that is still scrolled out of sight. */
    ok('it stops on a hidden tab', /visibilitychange/.test(gf));
    ok('and when scrolled offscreen', /IntersectionObserver/.test(gf));

    var pt = fs.readFileSync(path.join(ROOT, 'portal', 'index.html'), 'utf8');
    ok('the canvas is in the markup', pt.indexOf('id="genesisField"') > 0);
    ok('inside an aria-hidden backdrop',
       /<div class="pt-bg" aria-hidden="true">[\s\S]{0,300}genesisField/.test(pt));

    /* THE HEX IS THE REAL BLOCK 0, and this DECODES it rather than looking for a
       substring. Inventing plausible-looking hex would have been easier and
       would have been a small lie on the first screen a counterparty sees.

       A substring check was the first version and it was too weak twice over: it
       missed that the string is concatenated across source lines, so the bytes
       it looked for spanned a break and were never contiguous in the file — and
       it would have passed anyway on a hex string with a wrong byte in it, which
       is exactly what the first draft had. Parsing the header catches both. */
    var body = raw.slice(raw.indexOf('var GENESIS_HEX ='),
                         raw.indexOf(';', raw.indexOf('var GENESIS_HEX =')));
    var hex = (body.match(/'([0-9a-f]+)'/g) || [])
        .map(function (s) { return s.slice(1, -1); }).join('');
    function le(h) { return h.match(/../g).reverse().join(''); }

    eq('block version is 1', parseInt(le(hex.slice(0, 8)), 16), 1);
    ok('the previous block hash is all zeroes, because this IS block 0',
       /^0{64}$/.test(hex.slice(8, 72)));
    eq('the merkle root is the genesis one', le(hex.slice(72, 136)),
       '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    eq('mined 3 January 2009',
       new Date(parseInt(le(hex.slice(136, 144)), 16) * 1000).toISOString(),
       '2009-01-03T18:15:05.000Z');
    eq('with the original difficulty bits', le(hex.slice(144, 152)), '1d00ffff');
    eq('and the nonce Satoshi found', parseInt(le(hex.slice(152, 160)), 16), 2083236893);

    // The headline, and the push-length byte in front of it. That byte is what the
    // first draft got wrong (0x44 for a 69-byte message), and nothing but decoding
    // would have caught it.
    var i = hex.indexOf('5468652054696d6573');
    var msg = Buffer.from(hex.slice(i, i + 138), 'hex').toString('ascii');
    eq('the coinbase carries the Times headline', msg,
       'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks');
    eq('and the length byte in front of it matches its length',
       parseInt(hex.slice(i - 2, i), 16), msg.length);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
