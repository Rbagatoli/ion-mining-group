/* Runs the marketing site and the orders Worker together, locally, so the whole
   purchase path can be clicked through.

       node tools/dev-server.js
       →  http://localhost:8080/hardware.html

   WHY THIS EXISTS. Everything from the catalogue to the payment page is gated on
   ORDERS_ENDPOINT, which is empty in the repo because the deployed URL is not
   knowable here. That is correct for production and useless for looking at: with
   no endpoint the checkout is a mail draft and the pay button never appears. The
   site's scripts fall back to this server when they are served from localhost,
   so running this is the whole setup.

   STRIKE IS STUBBED unless you give it a key. With STRIKE_API_KEY set it talks
   to the real Strike; without one it fakes invoices so the flow is walkable, and
   says so loudly on startup — a payment page that silently pretends to take
   money is the last thing this should be.

   Orders live in memory and die with the process. That is deliberate: this is
   for looking at the flow, not for keeping anything.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
/* 8080 by default, because that is the port a plain static server usually
   ends up on and this is meant to replace one. Override with PORT=. */
const PORT = Number(process.env.PORT || 8080);
const STRIKE_KEY = process.env.STRIKE_API_KEY || '';
const OPS_SECRET = process.env.OPS_SECRET || 'dev-ops-secret';

/* ---- a KV that forgets ---- */
const box = new Map();
const ORDERS = {
    async get(k, type) {
        const v = box.has(k) ? box.get(k) : null;
        return v === null ? null : (type === 'json' ? JSON.parse(v) : v);
    },
    async put(k, v) { box.set(k, String(v)); },
    async list({ prefix, limit }) {
        const keys = [...box.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit || 1000);
        return { keys: keys.map(name => ({ name })) };
    }
};

/* ---- a Strike that is only stubbed when there is no key ---- */
const stub = { invoices: new Map(), n: 1 };
const realFetch = globalThis.fetch;
if (!STRIKE_KEY) {
    globalThis.fetch = async (url, opts) => {
        const u = String(url);
        if (!u.startsWith('https://api.strike.me')) return realFetch(url, opts);
        const method = (opts && opts.method) || 'GET';
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        const J = (o, s = 200) => new Response(JSON.stringify(o), {
            status: s, headers: { 'Content-Type': 'application/json' }
        });
        if (method === 'POST' && u.endsWith('/v1/invoices')) {
            const id = 'devinv_' + (stub.n++);
            stub.invoices.set(id, { invoiceId: id, state: 'UNPAID', amount: body.amount });
            return J({ invoiceId: id, state: 'UNPAID' });
        }
        let m = /\/v1\/invoices\/([^/]+)\/quote$/.exec(u);
        if (m && method === 'POST') {
            return J({ lnInvoice: 'lnbc1pdev' + m[1] + 'qqqqqqsp5thisisastubbedinvoicefordevelopmentonly',
                       expirationInSec: 3600 });
        }
        m = /\/v1\/invoices\/([^/]+)$/.exec(u);
        if (m && method === 'GET') {
            const inv = stub.invoices.get(m[1]);
            return inv ? J(inv) : J({ data: 'not found' }, 404);
        }
        if (method === 'POST' && u.endsWith('/v1/receive-requests')) {
            /* A deliberately obvious non-address. Nobody should be able to paste
               this into a wallet by accident and lose anything. */
            return J({ onchain: { address: 'bcrt1qDEVELOPMENTSTUBNOTAREALADDRESS' } });
        }
        return J({ data: 'unhandled' }, 404);
    };
}

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml',
    '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};

(async () => {
    const worker = await import('file://' + path.join(ROOT, 'worker-orders', 'index.js').replace(/\\/g, '/'));
    const env = { ORDERS, OPS_SECRET, STRIKE_API_KEY: STRIKE_KEY || 'dev-stub-key' };

    http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost:' + PORT);

        /* Settle everything outstanding, so the paid path can be seen without a
           wallet. Stub only — with a real key this is not offered. */
        if (url.pathname === '/__settle') {
            if (STRIKE_KEY) { res.writeHead(403); res.end('refusing: a real Strike key is configured'); return; }
            stub.invoices.forEach(i => { i.state = 'PAID'; });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('settled ' + stub.invoices.size + ' stub invoice(s)');
            return;
        }

        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const wreq = new Request('https://orders.local' + url.pathname.replace('/api', '') + url.search, {
                method: req.method,
                headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
                body: (req.method === 'GET' || req.method === 'HEAD') ? undefined
                      : (chunks.length ? Buffer.concat(chunks) : undefined)
            });
            const wres = await worker.default.fetch(wreq, env);
            let text = await wres.text();

            /* MARK IT, or the page has no way to know.

               The pages raise their "nothing here is real" banner from a
               demo:true flag on the response. Stubbing Strike happens down at
               the fetch layer, so the Worker answers perfectly normally and the
               flag never appears — which meant this mode showed a fake bitcoin
               address, said "waiting for the payment to arrive", and displayed
               no warning whatsoever. A payment page that might be pretending has
               to say so in every mode that can pretend. */
            if (!STRIKE_KEY) {
                try {
                    const body = JSON.parse(text);
                    if (body && typeof body === 'object' && !Array.isArray(body)) {
                        body.demo = true;
                        text = JSON.stringify(body);
                    }
                } catch (e) { /* not JSON; nothing to mark */ }
            }

            const headers = {};
            wres.headers.forEach((v, k) => { headers[k] = v; });
            if (headers['content-length']) headers['content-length'] = Buffer.byteLength(text);
            res.writeHead(wres.status, headers);
            res.end(text);
            return;
        }

        let file = path.join(SITE, decodeURIComponent(url.pathname));
        if (url.pathname === '/') file = path.join(SITE, 'index.html');
        /* Never serve outside site/ — this is a dev server, but it is still a
           server, and a path with .. in it should not reach the repo root. */
        if (!file.startsWith(SITE)) { res.writeHead(403); res.end('no'); return; }
        fs.readFile(file, (e, d) => {
            if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(d);
        });
    }).on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error('');
            console.error('  Port ' + PORT + ' is already in use.');
            console.error('');
            console.error('  That is almost certainly another static server — the one that serves');
            console.error('  the pages but has no orders API behind it, which is what makes the');
            console.error('  checkout fail. Stop it and run this again, or pick another port:');
            console.error('');
            console.error('      PORT=9000 node tools/dev-server.js');
            console.error('');
            process.exit(1);
        }
        throw e;
    }).listen(PORT, () => {
        const line = (s) => console.log('  ' + s);
        console.log('');
        line('Ion Mining Group — site + orders, running locally');
        console.log('');
        line('  Catalogue   http://localhost:' + PORT + '/hardware.html');
        line('  Checkout    http://localhost:' + PORT + '/cart.html');
        console.log('');
        if (STRIKE_KEY) {
            line('  Strike:     LIVE — invoices will be real. Do not pay them casually.');
        } else {
            line('  Strike:     STUBBED. No invoice here is real and nothing can be paid.');
            line('              To watch the settled state, hit');
            line('              http://localhost:' + PORT + '/__settle');
        }
        line('  Ops token:  ' + OPS_SECRET + '   (Authorization: Bearer …)');
        line('  Orders are in memory and vanish when this stops.');
        console.log('');
        line('Pick machines, review the order, place it, then pay it.');
        console.log('');
    });
})();
