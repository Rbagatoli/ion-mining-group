/* ===== ION MINING GROUP — talking to the orders service =====

   Where the service is, and what to say when it is not there.

   This exists because the same twenty lines were copied into checkout.js,
   pay.js and order.js, and every correction to them had to be made three times.
   It had already gone wrong twice that way: a hardcoded dev port, and an error
   message that told somebody to email their own order to themselves.

   Nothing here measures the page. */

var OrdersAPI = (function () {
    'use strict';

    /* Set this to the deployed Worker. Empty is a supported state: served from
       localhost the calls go to the same origin, and served anywhere else with
       nothing set every page degrades to something honest and says so.

       Public on purpose. There is no key here and there must never be one —
       a key in a static page is a published key, and there is a test for it. */
    var ORDERS_ENDPOINT = '';

    function isLocal() {
        var host = (typeof location !== 'undefined' && location.hostname) || '';
        return host === 'localhost' || host === '127.0.0.1';
    }

    /* SAME ORIGIN, not a fixed port. tools/dev-server.js serves the site and the
       orders API together, so /api is wherever the page is: any port, and no
       cross-origin preflight to get wrong. */
    function base() {
        if (ORDERS_ENDPOINT) return ORDERS_ENDPOINT;
        if (isLocal()) return location.origin + '/api';
        return '';
    }

    /* The failure that actually happens, and the one worth naming precisely.

       A plain static file server — python http.server, Live Server, anything
       that only hands back files — serves the pages perfectly and answers /api
       with its own HTML 404. The fetch succeeds; the JSON parse fails; and the
       page reports "Unexpected token '<'", which tells somebody nothing about
       what to do. It is not a broken service. It is the wrong kind of server. */
    var STATIC_SERVER = 'static-server';

    function explain(err) {
        if ((typeof location !== 'undefined' ? location.protocol : '') === 'file:') {
            return 'This page was opened straight from the filesystem, and browsers ' +
                   'block storage on file:// — so an order cannot survive moving to ' +
                   'the next page. Serve the folder over http instead: any static ' +
                   'server will do, or run  node tools/dev-server.js  for the real one.';
        }
        if (!isLocal()) {
            return (err && err.message) ? err.message : 'No connection';
        }
        if (err && err.kind === STATIC_SERVER) {
            return 'The page is being served by a plain file server, which has no ' +
                   'orders service behind it. Stop it and run:  node tools/dev-server.js  ' +
                   'then use the address it prints.';
        }
        return 'Nothing is answering at ' + base() + '. Start the orders service with:  ' +
               'node tools/dev-server.js  and open the site on the address it prints.';
    }

    /* Reads the response as JSON, or throws something that knows WHY it could
       not. Checking the content type rather than catching a parse error, so the
       diagnosis does not depend on what the HTML happens to start with. */
    function read(res) {
        var type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (type.indexOf('json') < 0) {
            var wrong = new Error('the orders service did not answer');
            wrong.kind = STATIC_SERVER;
            throw wrong;
        }
        return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
        });
    }

    /* Where the demo is allowed to stand in: localhost only, and never with a
       real endpoint configured. A deployed page cannot satisfy either test.

       NOT file://. It was tried, and browsers block localStorage on it — so an
       order created on the checkout is invisible to the payment page, and the
       flow dead-ends one click in. Better to say the site must be served than
       to half-work. */
    function demoAllowed() {
        if (ORDERS_ENDPOINT) return false;
        if (typeof OrdersDemo === 'undefined') return false;
        return isLocal();
    }

    /* Try the real service; stand in for it only when there plainly is not
       one. Requiring a particular dev server made the checkout unclickable
       for anyone who opened the site any other way, which is most of the
       time — and a checkout nobody can click cannot be reviewed. */
    function orElseDemo(path, run, demoRun) {
        if (!base() && demoAllowed()) return demoRun();
        return run().catch(function (err) {
            if (demoAllowed()) return demoRun();
            throw err;
        });
    }

    function get(path) {
        return orElseDemo(path,
            function () { return fetch(base() + path).then(read); },
            function () { return OrdersDemo.get(path); });
    }

    function post(path, body) {
        return orElseDemo(path,
            function () {
                return fetch(base() + path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }).then(read);
            },
            function () { return OrdersDemo.post(path, body); });
    }

    return {
        base: base,
        demoAllowed: demoAllowed,
        isLocal: isLocal,
        explain: explain,
        get: get,
        post: post,
        STATIC_SERVER: STATIC_SERVER,
        /* for the suite */
        configured: function () { return ORDERS_ENDPOINT; }
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OrdersAPI;
