const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(fetcher) {
    const handlers = {}, stored = [], removed = [];
    const ctx = { URL, Request, Response, Promise, fetch: fetcher,
        self: { location: { origin: 'https://local.invalid' }, registration: { scope: 'https://local.invalid/app/' },
            clients: { claim() {} }, addEventListener: (name, cb) => { handlers[name] = cb; } },
        caches: { keys: async () => ['proton-mining-v1', 'another-app-cache'], delete: async k => { removed.push(k); },
            open: async () => ({ put: async (k, v) => stored.push(k.url), match: async key => {
                if (key === 'https://local.invalid/app/shared.js') return new Response('current bundled source');
            } }) } };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), ctx);
    return { stored, removed, handlers, fetch: async (url, headers) => {
        const waits = []; let response;
        handlers.fetch({ request: new Request(url, { headers }), respondWith: p => { response = p; }, waitUntil: p => waits.push(p) });
        const result = await response; await Promise.all(waits); return result;
    } };
}
test('failed responses, account requests and files outside the app are not cached', async () => {
    const h = setup(async () => new Response('unavailable', { status: 500 }));
    await h.fetch('https://local.invalid/app/shared.js?v=419'); assert.equal(h.stored.length, 0);
    assert.equal(await h.fetch('https://local.invalid/portal/statement.html'), undefined);
    assert.equal(await h.fetch('https://local.invalid/app/balances.json', { Authorization: 'Bearer synthetic' }), undefined);
    assert.equal(await h.fetch('https://local.invalid/app/internal-report.html'), undefined);
});
test('a stamped offline dependency resolves only to this release and unrelated caches survive activation', async () => {
    const h = setup(async () => { throw new Error('offline'); });
    assert.equal(await (await h.fetch('https://local.invalid/app/shared.js?v=419')).text(), 'current bundled source');
    assert.equal((await h.fetch('https://local.invalid/app/shared.js?account=A')).type, 'error');
    const waits = []; h.handlers.activate({ waitUntil: p => waits.push(p) }); await Promise.all(waits);
    assert.deepEqual(h.removed, ['proton-mining-v1']);
});
