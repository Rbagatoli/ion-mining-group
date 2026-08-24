/* Guards the two pages a customer sees after ordering: the one they pay on, and
   the one they follow the order on.

   The payment page is the highest-consequence surface on the site. Two things
   matter more than anything else here: it must never tell somebody an unpaid
   order is paid, and the address it shows must be the address the service sent —
   a page that mangles a bitcoin address sends five figures somewhere nobody can
   get it back from. */
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

var payHtml = fs.readFileSync(S + 'pay.html', 'utf8');
var ordHtml = fs.readFileSync(S + 'order.html', 'utf8');
var payJs = fs.readFileSync(S + 'pay.js', 'utf8');
var ordJs = fs.readFileSync(S + 'order.js', 'utf8');
var ckJs = fs.readFileSync(S + 'checkout.js', 'utf8');
var cartHtml = fs.readFileSync(S + 'cart.html', 'utf8');
var sheet = fs.readFileSync(S + 'styles.css', 'utf8');

/* ---- they parse ---- */
var vm = require('vm');
['pay.js', 'order.js'].forEach(function (f) {
    try { new vm.Script(fs.readFileSync(S + f, 'utf8'), { filename: f }); ok(true, f + ' parses'); }
    catch (e) { ok(false, f + ' parses', e.message); }
});

/* ---- there is a way to reach payment at all ----
   This is the gap that prompted the whole build: the routes existed and nothing
   in the interface led to them. */
(function () {
    ok(cartHtml.indexOf('id="ckPayDeposit"') >= 0,
       'the order confirmation offers to pay the deposit', 'no pay button on cart.html');
    ok(cartHtml.indexOf('id="ckPayFull"') >= 0, 'and to pay in full instead');
    ok(cartHtml.indexOf('id="ckPayNow" hidden') >= 0,
       'hidden until the service is switched on, so it never leads nowhere');

    var sp = ckJs.indexOf('function showPlaced');
    var body = ckJs.slice(sp, ckJs.indexOf('function wireSubmit'));
    ok(body.indexOf("'./pay.html?ref='") >= 0, 'and the links carry the order reference');
    ok(body.indexOf("leg=deposit") >= 0 && body.indexOf("leg=full") >= 0,
       'and say which payment they are for');
    ok(body.indexOf("pay.hidden = false") >= 0, 'and are revealed once an order exists');
})();

/* ---- the address is passed through untouched ---- */
(function () {
    /* grouped() is the only thing that touches the address before display. It
       must add spacing and nothing else — an address that has been "cleaned"
       is an address that may no longer be the one that was issued. */
    var m = /function grouped\(addr\) \{([\s\S]*?)\n    \}/.exec(payJs);
    ok(!!m, 'the address formatter can be located');
    if (m) {
        var body = m[1];
        ok(body.indexOf('replace(/(.{4})/g') >= 0, 'it groups into fours for checking by eye');
        ['toLowerCase', 'toUpperCase', 'trim()', 'slice(', 'substring(']
        .forEach(function (bad) {
            /* .trim() at the end is fine; anything that could DROP characters is not */
            if (bad === 'trim()') return;
            ok(body.indexOf(bad) < 0, 'and never ' + bad + 's it', bad + ' would alter the address');
        });
    }

    /* What is copied and what is linked must be the raw address, not the
       grouped display string — a wallet given "bc1q xy2k …" cannot pay. */
    ok(payJs.indexOf("wireCopy('payCopyAddr', function () { return address; })") >= 0,
       'the copy button copies the raw address, not the spaced one');
    ok(payJs.indexOf("'bitcoin:' + address") >= 0,
       'and the wallet link carries the raw address too');
    ok(payJs.indexOf("'bitcoin:' + grouped") < 0, 'never the grouped form');
})();

/* ---- the page cannot decide it was paid ---- */
(function () {
    ok(payJs.indexOf("d.state === 'PAID'") >= 0,
       'the paid state comes from the service response');
    /* Nothing may reach settled() except a PAID from the service, or the
       service saying the leg was already paid. */
    /* Counting CALLS, not the declaration — the first version of this counted
       'function settled()' as a third caller. */
    var calls = (payJs.match(/(^|[^n] )settled\(\)/gm) || []).length;
    ok(calls === 2, 'settled() is called from exactly two places', String(calls));
    ok(payJs.indexOf('already paid') >= 0,
       'the second being the service refusing to re-invoice a paid leg');

    /* The payment request must not name an amount. */
    /* The REQUEST BODY, not the whole function — start() also assigns the
       amount it was told, which is not the same as sending one. */
    var st = payJs.indexOf('function start()');
    var fnBody = payJs.slice(st, payJs.indexOf('function init()'));
    /* The POST goes through OrdersAPI now, so the payload is its second
       argument rather than a JSON.stringify inline. */
    var call = /OrdersAPI\.post\([^,]+,\s*(\{[^}]*\})\)/.exec(fnBody);
    ok(!!call, 'the payment request body can be located', fnBody.slice(0, 120));
    var sent = call ? call[1] : '';
    ok(sent.indexOf('leg: leg') >= 0, 'the request says which payment', sent);
    ['amount', 'usd', 'deposit', 'total', 'price'].forEach(function (k) {
        ok(sent.indexOf(k) < 0, 'and never sends ' + k, sent);
    });
})();

/* ---- an outage is not a payment, and not a rejection ---- */
(function () {
    ok(payJs.indexOf("d.state === 'UNKNOWN'") >= 0, 'an unreachable network is handled');
    var i = payJs.indexOf("d.state === 'UNKNOWN'");
    var seg = payJs.slice(i, i + 500);
    ok(seg.indexOf('not lost') >= 0,
       'and tells somebody who has already paid that it is not lost', seg.slice(0, 90));
    ok(payJs.indexOf("setState('expired'") >= 0, 'an expired quote is handled');
    var e = payJs.indexOf("setState('expired'");
    ok(payJs.slice(e, e + 300).indexOf('has not changed') >= 0,
       'and says the amount owed is unchanged');
})();

/* ---- nothing on the page overclaims ---- */
['payment received', 'order confirmed', 'thank you for your purchase'].forEach(function (p) {
    var where = [];
    if (payHtml.toLowerCase().indexOf(p) >= 0 && p !== 'payment received') where.push('pay.html');
    if (ordHtml.toLowerCase().indexOf(p) >= 0) where.push('order.html');
    ok(where.length === 0, 'no page claims "' + p + '" before it is true', where.join(', '));
});
/* "Payment received" IS allowed on pay.html — but only inside the block that is
   hidden until the service says so. */
(function () {
    var i = payHtml.indexOf('Payment received');
    ok(i >= 0, 'the settled panel exists');
    var before = payHtml.lastIndexOf('id="payDone"', i);
    ok(before >= 0 && payHtml.slice(before, i).indexOf('hidden') >= 0,
       'and starts hidden, so it cannot flash before settlement',
       payHtml.slice(before, before + 60));
})();

/* ---- no QR, and no third-party fetch ---- */
(function () {
    /* Comments stripped: the file header explains WHY there is no QR and names
       the service while doing so. Third time this trap has bitten in this repo —
       a scan over raw source cannot tell an explanation from an instruction. */
    /* The line-comment stripper must not eat URLs. `https://` contains `//`, so
       a naive strip deleted every outbound address before the check could see
       it — this guard was blind to exactly the thing it exists to catch, and a
       mutation adding a live qrserver fetch sailed through it. Only treat `//`
       as a comment when it is not preceded by a colon. */
    var code = payJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(code.indexOf('qrserver') < 0 && payHtml.indexOf('qrserver') < 0,
       'the payment page does not send the address to a QR service');
    var outbound = (code.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
        .filter(function (u) { return u.indexOf('protonminingco.com') < 0; });
    /* localhost is not a third party — it is the dev fallback, and it cannot
       be reached from a public host. Everything else is disallowed, which is
       the check that matters. */
    var third = outbound.filter(function (u) {
        return u.indexOf('localhost') < 0 && u.indexOf('127.0.0.1') < 0;
    });
    ok(third.length === 0, 'and makes no third-party request at all', third.join(', '));
    ok(outbound.every(function (u) {
           return u.indexOf('http://localhost') === 0 || u.indexOf('http://127.0.0.1') === 0;
       }),
       'the only non-Proton host it names is the local dev service', outbound.join(', '));
})();

/* ---- the dev fallback cannot reach production ---- */
var apiSrc = fs.readFileSync(S + 'orders-api.js', 'utf8');

['pay.js', 'order.js'].forEach(function (f) {
    var src = fs.readFileSync(S + f, 'utf8');
    ok(src.indexOf('OrdersAPI.') >= 0, f + ' talks to the service through the shared module');
    ok(src.indexOf("var ORDERS_ENDPOINT") < 0, '  and keeps no endpoint of its own');
    /* No port may be hardcoded anywhere. One was, and it meant the site loaded
       on 8080 while every API call went to 8098 and failed. */
    ok(src.indexOf('8098') < 0, '  with no port hardcoded in it');
});

(function () {
    var open = apiSrc.indexOf('function base() {');
    ok(open >= 0, 'the shared module resolves the endpoint in one function');
    if (open < 0) return;
    var body = apiSrc.slice(open, apiSrc.indexOf(LF + '    }', open));
    ok(body.indexOf("location.origin + '/api'") >= 0,
       '  pointing at the same origin, so any dev port works', body);
    ok(apiSrc.indexOf('8098') < 0, '  with no port hardcoded in it');

    var lo = apiSrc.indexOf('function isLocal() {');
    ok(lo >= 0, '  and locality decided in one place');
    var loBody = apiSrc.slice(lo, apiSrc.indexOf(LF + '    }', lo));
    ok(loBody.indexOf('location.hostname') >= 0,
       '  keyed on the hostname, so a public host never matches it');
    ok(loBody.indexOf('localhost') >= 0, '  and only localhost gets the dev service');

    /* The failure that actually happened to somebody: a plain static file
       server answers /api with its own HTML 404, so the fetch succeeds and the
       JSON parse fails. Reporting \"Unexpected token '<'\" tells nobody what to
       do. It must be diagnosed by content type and named. */
    ok(apiSrc.indexOf("type.indexOf('json') < 0") >= 0,
       'a non-JSON answer is detected by content type, not by a parse error');
    ok(apiSrc.indexOf('plain file server') >= 0,
       'and reported as what it is — the wrong kind of server');
    ok(apiSrc.indexOf('node tools/dev-server.js') >= 0,
       'with the command that fixes it');
})();

/* ---- three rails, one at a time ---- */
(function () {
    var bankSrc = fs.readFileSync(S + 'bank-details.js', 'utf8');

    ok(payHtml.indexOf('id="payRails"') >= 0, 'the payment page offers a choice of rail');
    ['btc', 'card', 'wire'].forEach(function (r) {
        ok(payHtml.indexOf('data-rail="' + r + '"') >= 0, '  including ' + r);
    });
    /* Never two at once. A screen showing an address and a card button
       together invites paying twice, and only one of those refunds easily. */
    ok(payHtml.indexOf('id="payCard" hidden') >= 0, 'the card panel starts hidden');
    ok(payHtml.indexOf('id="payWire" hidden') >= 0, 'and so does the wire panel');
    ok(payJs.indexOf('RAIL_PANEL') >= 0 && payJs.indexOf('function showRail') >= 0,
       'and exactly one is shown at a time');

    /* The cap is the Worker's; the page only declines to offer it. */
    ok(payJs.indexOf('function cardAllowed()') >= 0, 'the page knows where cards apply');
    ok(payJs.indexOf("leg === 'deposit'") >= 0, '  which is the deposit');
    ok(payJs.indexOf('card.hidden = !cardAllowed()') >= 0,
       '  and hides the option elsewhere');

    /* THE REDIRECT PROVES NOTHING. The page must never read a query
       parameter and conclude anything was paid. */
    var code = payJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ['paid', 'success', 'payment_status', 'session_id'].forEach(function (k) {
        ok(code.indexOf("param('" + k + "')") < 0,
           'the page never reads ?' + k + ' back from Stripe', k + ' is read');
    });
    ok(code.indexOf('checkoutUrl') >= 0, 'it only follows the URL the service gave it');

    /* Bank details: placeholders must be visible AS placeholders, and the
       page must refuse to present them as usable. Somebody wiring five
       figures to [ACCOUNT NUMBER] cannot get it back. */
    ok(bankSrc.indexOf('[ACCOUNT NUMBER]') >= 0, 'the bank details start as placeholders');
    ok(payJs.indexOf('BankDetails.unfilled()') >= 0,
       'and the page checks whether they are filled in');
    ok(payJs.indexOf('Do not send anything against them') >= 0,
       'and says so plainly while they are not');
    ok(payHtml.indexOf('id="payBankUnready" hidden') >= 0,
       'with somewhere to say it, hidden once they are real');
    ok(payJs.indexOf('class="ph"') >= 0,
       'and unfilled fields carry the site placeholder style, so they read as gaps');
    ok(payJs.indexOf('BankDetails.isPlaceholder(') >= 0,
       'decided by the bank-details module rather than by pattern-matching here');

    /* The reference is the only thing that makes an incoming wire matchable. */
    ok(payHtml.indexOf('id="payWireRef"') >= 0, 'the wire panel shows the reference');
    ok(payHtml.indexOf('must be quoted on the transfer') >= 0,
       'and says it has to be quoted');
    ok(payJs.indexOf("wireCopy('payCopyRef'") >= 0, 'and offers it for copying');

    /* No polling on rails with nothing to poll. */
    ok(payJs.indexOf("if (which !== 'btc' && timer)") >= 0,
       'switching off bitcoin stops the poll timer');
})();

/* ---- pressing a button must visibly do something, next to the button ---- */
(function () {
    /* 'Nothing happens' was the report. Something did: the message went to the
       status line ABOVE the rail chooser, while the button quietly reverted to
       its old label. Feedback that far from what you pressed is invisible. */
    ok(payHtml.indexOf('id="payCardWhy"') >= 0,
       'the card panel has its own place to explain an outcome');
    ok(payHtml.indexOf('id="payCardWhy" hidden') >= 0, '  hidden until there is one');

    var i = payJs.indexOf('function wireCard()');
    var body = payJs.slice(i, payJs.indexOf('function paintBank'));
    ok(i >= 0 && body.length > 100, 'the card handler can be located');

    /* Every path out of the click has to say something. Counting them, so a
       new branch cannot be added silently without one. */
    var says = (body.split('cardSays(').length - 1);
    ok(says >= 5, 'every outcome of the click reports at the button', String(says));
    ok(body.indexOf('setState(') < 0,
       'and none of them report only in the status line far above it');

    /* ORDER MATTERS. The demo answers with an empty checkoutUrl, so a
       missing-URL guard placed first makes the demo branch unreachable and
       reports a generic error instead — which is exactly what happened. */
    var demoAt = body.indexOf('r.body.demo');
    var urlAt = body.indexOf('!r.body.checkoutUrl');
    ok(demoAt >= 0 && urlAt >= 0 && demoAt < urlAt,
       'the demo case is checked before the missing-URL guard that would swallow it',
       'demo at ' + demoAt + ', url guard at ' + urlAt);

    /* And the button must always come back, or a failed click leaves a dead
       control saying 'Opening Stripe…' forever. */
    var restores = (body.split('btn.disabled = false').length - 1);
    ok(restores >= 2, 'the button is re-enabled on every failure path', String(restores));
})();

/* ---- the human steps are labelled as such ---- */
(function () {
    ok(ordJs.indexOf('ours: true') >= 0, 'the status page marks the manual steps');
    var count = (ordJs.match(/ours: true/g) || []).length;
    ok(count === 2, 'both of them — quoting, and placing the purchase order', String(count));
    ok(ordJs.indexOf('our side') >= 0, 'and says so in words on the page');
    ok(sheet.indexOf('.ord-step-ours') >= 0, 'with a style for the marker');
})();

/* ---- only what is actually owed is offered ---- */
(function () {
    var i = ordJs.indexOf("var owedLeg = null;");
    var seg = ordJs.slice(i, i + 600);
    ok(seg.indexOf("stepIndex('deposit_paid')") >= 0,
       'the deposit is only offered before it has been paid');
    ok(seg.indexOf("stepIndex('balance_paid')") >= 0,
       'and the balance only before that has');
    ok(seg.indexOf("order.status !== 'cancelled'") >= 0,
       'and neither on a cancelled order');
})();

/* ---- both pages survive being opened with nothing ---- */
[['pay.js', payJs, 'payLive'], ['order.js', ordJs, 'ordLive']].forEach(function (p) {
    ok(p[1].indexOf("var ref = param('ref')") >= 0 || p[1].indexOf("ref = param('ref')") >= 0,
       p[0] + ' reads the reference from the URL');
    ok(p[1].indexOf('missing its order reference') >= 0,
       '  and says so plainly when there is not one');
    ok(p[1].indexOf('not switched on yet') >= 0,
       '  and when the service is not deployed, rather than hanging');
});

/* ---- they are not indexable ---- */
['pay.html', 'order.html'].forEach(function (f) {
    var t = fs.readFileSync(S + f, 'utf8');
    ok(t.indexOf('name="robots" content="noindex') >= 0,
       f + ' is noindex — it carries an order reference');
    ok(fs.readFileSync(S + 'sitemap.xml', 'utf8').indexOf(f) < 0,
       '  and is absent from the sitemap, like 404.html');
    ok(fs.readFileSync(S + 'tools/build-nav.js', 'utf8').indexOf("'" + f + "'") >= 0,
       '  but the nav generator still knows it, so its chrome stays in step');
});

/* ---- house rules ---- */
['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight',
 'ResizeObserver', 'innerHeight'].forEach(function (api) {
    ok(payJs.indexOf(api) < 0 && ordJs.indexOf(api) < 0,
       'nothing measures the page (' + api + ')');
});
['pay.html', 'order.html'].forEach(function (f) {
    ok(fs.readFileSync(S + f, 'utf8').indexOf('border-radius') < 0, f + ' has no inline radii');
});
ok(sheet.indexOf('.pay-addr') >= 0 && sheet.indexOf('.ord-step') >= 0,
   'both pages are styled by the site stylesheet, not inline');

console.log('');
console.log(fail ? '  ' + fail + ' FAILED' : '  paypage-suite: ALL OK');
process.exit(fail ? 1 : 0);
