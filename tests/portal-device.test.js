// Tests for worker-portal/device.js — meter authentication.
//
// A meter has no login, so its signature IS its identity. Everything here is about the ways that
// can go wrong: a replayed body, a body borrowed from another device, a key that was rotated out,
// and a key that leaked and had to be killed.
//
// Node 18+ provides crypto.subtle and TextEncoder globally, which is what the Worker runtime
// provides too — so this file exercises the real code path, not a stand-in.

var path = require('path');
var Device = require(path.join(__dirname, '..', 'worker-portal', 'device.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }

var ROOT = 'test-root-key-not-a-real-one';
var NOW = Date.parse('2027-03-15T12:00:00Z');

// Sign the way a meter in the field would, so the tests fail if the scheme changes on either side.
async function sign(deviceId, kid, body, tSec) {
    var secret = await Device.deriveSecret(ROOT, deviceId, kid);
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var mac = await crypto.subtle.sign('HMAC', key,
        new TextEncoder().encode(tSec + '.' + deviceId + '.' + body));
    return 't=' + tSec + ',kid=' + kid + ',v1=' + Device.hex(mac);
}

function v(over) {
    var o = { rootKey: ROOT, deviceId: 'DEV1', keyState: 'active', nowMs: NOW, rawBody: '{}' };
    for (var k in (over || {})) o[k] = over[k];
    return Device.verify(o);
}

(async function() {
    var t = Math.floor(NOW / 1000);
    var body = '{"meter_id":"MTR1","readings":[{"seq":9,"index_corrected":1000}]}';

    console.log('\n=== a correctly signed request verifies ===');
    var good = await sign('DEV1', 'k1', body, t);
    var r = await v({ rawBody: body, signatureHeader: good });
    ok('a good signature passes', r.ok);
    eq('and reports which key signed it', r.kid, 'k1');

    console.log('\n=== the device id is inside the MAC, so a body cannot be borrowed ===');
    // This is the whole reason device_id is in the signed material. Without it, capturing one
    // device's request and posting it as another would verify.
    var asOther = await v({ rawBody: body, signatureHeader: good, deviceId: 'DEV2' });
    eq('a body signed for DEV1 is rejected as DEV2', asOther.ok, false);

    // And the derived secrets genuinely differ per device and per kid.
    var s1 = await Device.deriveSecret(ROOT, 'DEV1', 'k1');
    var s2 = await Device.deriveSecret(ROOT, 'DEV2', 'k1');
    var s3 = await Device.deriveSecret(ROOT, 'DEV1', 'k2');
    ok('each device derives a different secret', s1 !== s2);
    ok('each kid derives a different secret', s1 !== s3);
    ok('and derivation is deterministic', s1 === await Device.deriveSecret(ROOT, 'DEV1', 'k1'));
    eq('the secret is never the root key', s1 === ROOT, false);

    console.log('\n=== tampering ===');
    eq('a changed body fails',
       (await v({ rawBody: body + ' ', signatureHeader: good })).ok, false);
    eq('a changed timestamp fails',
       (await v({ rawBody: body, signatureHeader: good.replace('t=' + t, 't=' + (t + 1)) })).ok, false);
    eq('a signature from a different root key fails',
       (await v({ rawBody: body, signatureHeader: await sign('DEV1', 'k1', body, t),
                  rootKey: 'a-different-root' })).ok, false);
    eq('a malformed header fails', (await v({ signatureHeader: 'garbage' })).ok, false);
    eq('a missing header fails', (await v({ signatureHeader: null })).ok, false);
    eq('no kid fails', (await v({ rawBody: body, signatureHeader: 't=' + t + ',v1=abc' })).ok, false);

    console.log('\n=== the replay window ===');
    // Six minutes old. A captured request must not stay valid forever, or anyone who ever saw one
    // legitimate POST could replay it later.
    var oldSig = await sign('DEV1', 'k1', body, t - 400);
    eq('a stale request is refused', (await v({ rawBody: body, signatureHeader: oldSig })).ok, false);
    // Clock skew cuts both ways, so the tolerance is symmetric.
    var futureSig = await sign('DEV1', 'k1', body, t + 400);
    eq('so is one from the future', (await v({ rawBody: body, signatureHeader: futureSig })).ok, false);
    var edge = await sign('DEV1', 'k1', body, t - 290);
    ok('but just inside the window is fine',
       (await v({ rawBody: body, signatureHeader: edge })).ok, 'under five minutes');

    console.log('\n=== key state gates verification before any comparison ===');
    // A leaked key must be dead the moment it is marked, not at the next rotation.
    eq('a revoked key cannot sign',
       (await v({ rawBody: body, signatureHeader: good, keyState: 'revoked' })).ok, false);
    eq('a key still being enrolled cannot sign',
       (await v({ rawBody: body, signatureHeader: good, keyState: 'pending' })).ok, false);
    // Rotation needs an overlap, or every device in the field stops on the same day.
    ok('a retiring key still verifies, so a rotation is not a flag day',
       (await v({ rawBody: body, signatureHeader: good, keyState: 'retiring' })).ok);
    eq('an unknown state cannot sign',
       (await v({ rawBody: body, signatureHeader: good, keyState: 'nonsense' })).ok, false);

    console.log('\n=== rotation accepts both signatures at once ===');
    var sigOld = await sign('DEV1', 'k1', body, t);
    var sigNew = await sign('DEV1', 'k1', body, t);
    var both = sigOld + ',v1=' + sigNew.split('v1=')[1];
    ok('a header carrying two v1 values verifies', (await v({ rawBody: body, signatureHeader: both })).ok);
    var withJunk = 't=' + t + ',kid=k1,v1=deadbeef,v1=' + sigOld.split('v1=')[1];
    ok('and one good signature among bad ones is enough',
       (await v({ rawBody: body, signatureHeader: withJunk })).ok);

    console.log('\n=== it fails closed ===');
    // Same rule as isOwner in worker-orders: no secret configured means shut, not open.
    eq('no root key configured means nothing verifies',
       (await v({ rawBody: body, signatureHeader: good, rootKey: '' })).ok, false);
    eq('no device id means nothing verifies',
       (await v({ rawBody: body, signatureHeader: good, deviceId: '' })).ok, false);

    console.log('\n=== constant-time compare ===');
    ok('equal strings match', Device.constantEquals('abc', 'abc'));
    ok('different lengths do not', !Device.constantEquals('abc', 'abcd'));
    ok('same length different content does not', !Device.constantEquals('abc', 'abd'));
    ok('a non-string never matches', !Device.constantEquals('abc', null));

    console.log('');
    console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                           : pass + ' passed, ' + fail + ' FAILED');
    process.exit(fail === 0 ? 0 : 1);
})();
