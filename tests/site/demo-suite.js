/* Guards the browser-side stand-in for the orders service.

   It exists so the checkout can be clicked through with any static server, and
   the whole risk of it is one thing: A FAKE PAYMENT PAGE MUST NEVER REACH A
   CUSTOMER. Everything below is an attempt to make that happen. */
/* Repo-relative, so this runs wherever the checkout is. Was an absolute
   c:/Users/rbaga/... path that worked on one machine. */
const REPO_ROOT = require('path').join(__dirname, '..', '..').replace(/\\/g, '/') + '/';

var fs = require('fs');
var S = REPO_ROOT + 'site/';
var LF = String.fromCharCode(10);
var fail = 0;
function ok(cond, label, detail) {
    console.log((cond ? '  ok    ' : '  FAIL  ') + label + (cond ? '' : '   ' + (detail || '')));
    if (!cond) fail++;
}

var apiSrc = fs.readFileSync(S + 'orders-api.js', 'utf8');
var demoSrc = fs.readFileSync(S + 'orders-demo.js', 'utf8');

/* ---- it parses ---- */
var vm = require('vm');
try { new vm.Script(demoSrc, { filename: 'orders-demo.js' }); ok(true, 'orders-demo.js parses'); }
catch (e) { ok(false, 'orders-demo.js parses', e.message); }

/* ---- THE POINT: it cannot engage anywhere real ---- */

/* Driven, not read. Every host a deployed page could plausibly have, plus the
   two that are allowed, run through the real function. */
function allowedOn(hostname, protocol, configuredEndpoint) {
    var sandbox = {
        location: { hostname: hostname, protocol: protocol, origin: protocol + '//' + hostname },
        OrdersDemo: {},
        module: undefined,
        console: console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    var src = demoSrc + LF + apiSrc;
    if (configuredEndpoint) {
        src = src.replace("var ORDERS_ENDPOINT = '';",
                          "var ORDERS_ENDPOINT = '" + configuredEndpoint + "';");
    }
    vm.runInContext(src, sandbox);
    return sandbox.OrdersAPI.demoAllowed();
}

[['protonminingco.com', 'https:'],
 ['www.protonminingco.com', 'https:'],
 ['rbagatoli.github.io', 'https:'],
 ['protonminingco.com.evil.test', 'https:'],
 ['localhost.evil.test', 'https:'],
 ['notlocalhost', 'https:'],
 ['192.168.1.40', 'http:'],
 ['10.0.0.5', 'http:'],
 ['0.0.0.0', 'http:'],
 ['[::1]', 'http:'],
 ['', 'file:']]
.forEach(function (c) {
    ok(allowedOn(c[0], c[1]) === false,
       'the demo refuses to run on ' + (c[0] || '(file)'), 'it engaged');
});

[['localhost', 'http:'], ['127.0.0.1', 'http:']].forEach(function (c) {
    ok(allowedOn(c[0], c[1]) === true, 'but does run on ' + c[0], 'it did not engage');
});

/* A configured endpoint disables it outright, wherever you are. */
ok(allowedOn('localhost', 'http:', 'https://proton-orders.workers.dev') === false,
   'and never once a real service is configured, even on localhost');

/* ---- it cannot be mistaken for the real thing ---- */

ok(demoSrc.indexOf('DEMO-NOT-A-BITCOIN-ADDRESS-DO-NOT-SEND') >= 0,
   'the address it shows is not a bitcoin address at all');
(function () {
    var m = /var FAKE_ADDRESS = '([^']*)'/.exec(demoSrc);
    ok(!!m, 'the stand-in address can be located');
    if (!m) return;
    var a = m[1];
    /* Nothing that could be a real address: no bech32 or base58 shape. */
    ok(!/^(bc1|tb1|bcrt1|[13])/.test(a),
       'and could not be parsed as one by a wallet', a);
    ok(a.toUpperCase().indexOf('DEMO') >= 0 && /DO.?NOT.?SEND/i.test(a),
       'and says so in the address itself', a);
})();

ok(demoSrc.indexOf("'DEMO-' +") >= 0,
   'every reference it issues is prefixed DEMO-, so a real one cannot be confused with it');
ok(demoSrc.indexOf('demo: true') >= 0, 'and every response it returns is marked');

/* Every response shape must carry the marker — a page decides whether to warn
   from that flag, so an unmarked one is a page that pretends silently. */
(function () {
    var returns = demoSrc.match(/resolve\((\d+), \{[^}]*/g) || [];
    var unmarked = returns.filter(function (r) { return r.indexOf('demo: true') < 0; });
    ok(returns.length >= 4, 'it answers several routes', String(returns.length));
    ok(unmarked.length === 0, 'and marks every single answer', unmarked.join(' | '));
})();

/* ---- and every page that renders one says so ---- */

['cart.html', 'pay.html', 'order.html'].forEach(function (f) {
    var html = fs.readFileSync(S + f, 'utf8');
    ok(html.indexOf('id="demoFlag"') >= 0, f + ' has somewhere to say it is a demo');
    ok(html.indexOf('id="demoFlag" hidden') >= 0, '  hidden until it is one');
    ok(html.indexOf('Nothing here is real') >= 0, '  and says so in those words');
    /* Before anything that looks like an amount or an address. */
    ok(html.indexOf('id="demoFlag"') < html.indexOf('<!-- ===== HEADER ===== -->'),
       '  at the very top of the page, above everything');
});

/* CALLS, not the declaration. Checking for 'flagDemo(' matched the function
   definition, so deleting every call to it still passed — the banner would
   simply never appear, which is the one failure that matters here. */
['checkout.js', 'pay.js', 'order.js'].forEach(function (f) {
    var src = fs.readFileSync(S + f, 'utf8');
    var calls = (src.match(/(^|[^n] )flagDemo\(/gm) || []).length;
    ok(calls >= 1, f + ' actually calls flagDemo, not just declares it', String(calls));
    ok(src.indexOf('flagDemo(true)') >= 0, '  and raises it, not only lowers it');
});
(function () {
    var pay = fs.readFileSync(S + 'pay.js', 'utf8');
    ok(pay.indexOf('if (invoice.demo)') >= 0,
       'the payment page raises it from the response, not from a guess');
    var ord = fs.readFileSync(S + 'order.js', 'utf8');
    ok(ord.indexOf('if (order.demo)') >= 0, 'and so does the order page');
})();

/* The simulate button is a demo affordance and must not exist otherwise. */
(function () {
    var html = fs.readFileSync(S + 'pay.html', 'utf8');
    ok(html.indexOf('id="paySettleWrap" hidden') >= 0,
       'the simulate-payment control starts hidden');
    var pay = fs.readFileSync(S + 'pay.js', 'utf8');
    var i = pay.indexOf('if (invoice.demo)');
    ok(i >= 0 && pay.slice(i, i + 220).indexOf('paySettleWrap') >= 0,
       'and is only revealed for a demo response', pay.slice(i, i + 160));
})();

/* ---- the stand-in teaches the same shape as the real thing ---- */
(function () {
    ok(demoSrc.indexOf("method === 'card' && leg !== 'deposit'") >= 0,
       'the demo caps cards to the deposit, exactly as the Worker does',
       'a demo that allows what production refuses teaches the wrong shape');
    ok(demoSrc.indexOf("['btc', 'card', 'wire']") >= 0,
       'and refuses a method neither of them knows');
    ok(demoSrc.indexOf("checkoutUrl: ''") >= 0,
       'and hands back no Stripe URL, because there is no Stripe to go to');
})();

/* ---- it does not invent prices ---- */

ok(demoSrc.indexOf('Cart.totals()') >= 0,
   'the demo prices an order from the same totals the summary shows');
(function () {
    /* No money literals of its own. The real service is the authority and the
       demo must not become a second, quietly different one. */
    var code = demoSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    var big = (code.match(/\b\d{3,}\b/g) || []).filter(function (n) {
        return ['350', '400', '404', '409', '400', '201', '200', '100'].indexOf(n) < 0;
    });
    ok(big.length === 0, 'and hard-codes no figures of its own', big.join(', '));
})();

/* ---- the real service always gets first refusal ---- */

(function () {
    var i = apiSrc.indexOf('function orElseDemo');
    ok(i >= 0, 'the fallback is one function');
    var body = apiSrc.slice(i, apiSrc.indexOf(LF + '    }', i));
    ok(body.indexOf('if (!base() && demoAllowed())') >= 0,
       'the demo runs immediately only when there is no service to try');
    ok(body.indexOf('return run().catch(') >= 0,
       'otherwise the real service is tried first');
    ok(body.indexOf('throw err;') >= 0,
       'and a failure outside a demo context still fails, rather than quietly faking it');
})();

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  demo-suite: ALL OK');
process.exit(fail ? 1 : 0);
