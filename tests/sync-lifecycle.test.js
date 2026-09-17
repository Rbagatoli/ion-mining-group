const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function harness() {
    let uid = 'A', seq = 0, failWrite = false, failStorageKey = null;
    const timers = new Map(), storage = {}, writes = [], listeners = {};
    const firestore = () => ({ collection: () => ({ doc: owner => ({ collection: () => ({ doc: key => ({
        set: async p => { if (failWrite) throw new Error('offline'); writes.push({ owner, key, payload: p }); },
        onSnapshot: cb => { listeners[key] = cb; return () => { delete listeners[key]; }; }
    }) }) }) }) });
    firestore.FieldValue = { serverTimestamp: () => 'SERVER_TIME' };
    const ctx = { console, firebase: { firestore }, ProtonAuth: { getUser: () => uid ? { uid } : null, isSignedIn: () => !!uid },
        localStorage: { getItem: k => storage[k] || null, setItem: (k, v) => { if (k === failStorageKey) throw new Error('storage unavailable'); storage[k] = v; }, removeItem: k => { delete storage[k]; } },
        setTimeout: f => { const id = ++seq; timers.set(id, f); return id; }, clearTimeout: id => timers.delete(id) };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '../sync.js'), 'utf8'), ctx);
    return { sync: ctx.SyncEngine, storage, writes, listeners, uid: v => { uid = v; }, fail: v => { failWrite = v; },
        failStorage: k => { failStorageKey = k; },
        tick: async () => { const list = [...timers.values()]; timers.clear(); list.forEach(f => f()); await new Promise(setImmediate); } };
}
test('debounced writes capture data and account at queue time', async () => {
    const h = harness(), data = { sites: [{ id: 'one' }] };
    h.sync.save('sites', data); data.sites[0].id = 'mutated'; await h.tick();
    assert.equal(h.writes[0].owner, 'A'); assert.equal(h.writes[0].payload.data.sites[0].id, 'one');
    h.sync.save('sites', data); h.uid('B'); await h.tick();
    assert.equal(h.writes.length, 1);
    assert.ok(h.storage['protonSyncOutbox:A'].includes('mutated'));
});
test('sign-out cancels callbacks and pending work replays only for its owner', async () => {
    const h = harness(); h.sync.save('sites', { sites: [{ id: 'local-A' }] }); h.sync.stopAll(); h.uid('B');
    h.sync.listen('sites'); await h.tick(); assert.equal(h.writes.length, 0);
    h.sync.stopAll(); h.uid('A'); h.sync.listen('sites'); await h.tick();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0].owner, 'A');
});
test('live snapshots retain local records missing from the cloud, including startup', () => {
    const h = harness(); h.storage.protonMiningSites = JSON.stringify({ sites: [{ id: 'local' }] });
    h.sync.listen('sites'); h.listeners.sites({ exists: true, metadata: {}, data: () => ({ data: { sites: [] } }) });
    assert.equal(JSON.parse(h.storage.protonMiningSites).sites[0].id, 'local');
});
test('failed upload survives reload in the account outbox', async () => {
    const h = harness(); h.fail(true); h.sync.save('sites', { sites: [{ id: 'pending' }] }); await h.tick();
    assert.ok(h.storage['protonSyncOutbox:A'].includes('pending'));
    h.sync.stopAll(); h.fail(false); h.sync.listen('sites'); await h.tick();
    assert.equal(h.writes.length, 1); assert.equal(h.storage['protonSyncOutbox:A'], '{}');
});
test('switching identities preserves pending work but removes financial sessions and caches', () => {
    const h = harness();
    h.storage.protonMiningSites = JSON.stringify({ sites: [{ id: 'private-A' }] });
    h.storage['protonSyncOutbox:A'] = '{"sites":"pending"}';
    h.storage.protonStrikeSession = 'synthetic-A-token'; h.storage.protonStrikeUser = '{"id":"A"}';
    h.storage.protonPortalSession = 'synthetic-portal-A'; h.storage.protonMiningStrikeBtcBalance = '100';
    h.storage['firebase:authUser:public'] = 'new-user-identity';
    h.storage['protonAccountArchive:B'] = JSON.stringify({ protonMiningSites: JSON.stringify({ sites: [{ id: 'private-B' }] }) });
    h.uid('B'); h.sync.switchAccount('A', 'B');
    assert.equal(JSON.parse(h.storage.protonMiningSites).sites[0].id, 'private-B');
    assert.ok(h.storage['protonAccountArchive:A'].includes('private-A'));
    assert.equal(h.storage.protonStrikeSession, undefined); assert.equal(h.storage.protonPortalSession, undefined);
    assert.equal(h.storage.protonMiningStrikeBtcBalance, undefined);
    assert.equal(h.storage['protonSyncOutbox:A'], '{"sites":"pending"}');
    assert.equal(h.storage['firebase:authUser:public'], 'new-user-identity');
});
test('retrying an interrupted account switch cannot overwrite the original recovery archive', () => {
    const h = harness(); h.uid('B'); h.storage.protonMiningLastUid = 'A';
    h.storage.protonMiningFleet = 'original-A-fleet'; h.storage.protonMiningSites = 'original-A-sites';
    h.storage['protonAccountArchive:B'] = JSON.stringify({ protonMiningSites: 'B-sites' });
    h.failStorage('protonMiningSites');
    assert.throws(() => h.sync.switchAccount('A', 'B'), /storage unavailable/);
    assert.equal(h.storage.protonMiningLastUid, 'A');
    h.failStorage(null); h.sync.switchAccount('A', 'B');
    const saved = JSON.parse(h.storage['protonAccountArchive:A']);
    assert.equal(saved.protonMiningFleet, 'original-A-fleet'); assert.equal(saved.protonMiningSites, 'original-A-sites');
    assert.equal(h.storage.protonMiningSites, 'B-sites'); assert.equal(h.storage.protonAccountSwitch, undefined);
    // Returning to the original identity after an interrupted switch must also recover it.
    h.storage.protonAccountSwitch = JSON.stringify({ previousUid: 'A', nextUid: 'B' });
    h.storage.protonMiningLastUid = 'A'; h.uid('A'); h.sync.switchAccount('A', 'A');
    assert.equal(h.storage.protonMiningSites, 'original-A-sites'); assert.equal(h.storage.protonAccountSwitch, undefined);
});
