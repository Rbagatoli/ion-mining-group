/* The home scene may change its presentation without changing the model or
   the other six scenes. Exercise geometry, cache invalidation and idle motion. */
const assert = require('node:assert/strict');
const engine = require('../../site/diagram-engine.js');
const home = require('../../site/scene-site.js');

const reference = engine.createDiagram(Object.assign({}, home.scene, { optimize: false }));
const optimized = engine.createDiagram(home.scene);
for (const pitch of [0.12, home.scene.view.BASE_PITCH, 0.9]) {
    for (const zoom of [0.55, 1, 2.6]) {
        reference.setView({ pitch, zoom });
        optimized.setView({ pitch, zoom });
        for (let step = 0; step < 16; step++) {
            const yaw = step * Math.PI / 8;
            assert.deepEqual(optimized.frame(yaw, 'cool'), reference.frame(yaw, 'cool'),
                'Cached camera calculations must preserve geometry, culling, hits and leaders');
        }
    }
}
console.log('  ok    optimized projection matches the reference at 144 camera poses');

let builds = 0;
const counted = engine.createDiagram(Object.assign({}, home.scene, {
    renderables: home.scene.renderables.map(r => Object.assign({}, r, {
        build(H, yaw) { builds++; return r.build(H, yaw); }
    }))
}));
const original = counted.frame(0, null);
const firstBuilds = builds;
const highlighted = counted.frame(0, 'gas');
assert.equal(builds, firstBuilds, 'A highlight must not rebuild the plant');
assert.strictEqual(highlighted.slots, original.slots);
assert.notEqual(highlighted.highlight, original.highlight);
assert.equal(original.highlight, '', 'Earlier frames must not acquire later highlights');

counted.setView({ pitch: 0.4 });
counted.frame(0, null);
assert.equal(builds, firstBuilds * 2, 'Pitch must invalidate the cached geometry');
counted.setView({ zoom: 1.2 });
counted.frame(0, null);
assert.equal(builds, firstBuilds * 3, 'Zoom must invalidate the cached geometry');
counted.frame(0.2, null);
assert.equal(builds, firstBuilds * 4, 'Manual rotation must invalidate the cached geometry');
console.log('  ok    hover reuses the plant; pitch, zoom and rotation rebuild it');

counted.resetView();
const full = counted.frame(0, null);
counted.setCompact(true);
const compact = counted.frame(0, null);
const size = f => f.slots.reduce((n, s) => n + counted.LAYERS.reduce((m, k) => m + s[k].length, 0), 0);
assert.ok(size(compact) < size(full) * 0.85, 'Phone detail must meaningfully reduce path data');
assert.deepEqual(compact.hits, full.hits, 'Simplification must preserve all touch targets');
assert.deepEqual(compact.leaders, full.leaders, 'Simplification must preserve all callout anchors');
compact.slots.forEach((slot, i) => {
    for (const layer of ['inside', 'asics', 'asictop', 'end', 'side', 'top', 'rim']) {
        assert.equal(slot[layer], full.slots[i][layer], 'Phone detail must preserve equipment shapes');
    }
});
counted.setView({ zoom: 1.6 });
const inspecting = counted.frame(0, null);
counted.setCompact(false);
assert.deepEqual(counted.frame(0, null), inspecting, 'Zooming in on a phone restores inspection detail');
console.log('  ok    phone detail retains shapes and targets, and zoom restores finer detail');

let previous = home.idleYawAt(0);
for (let ms = 16; ms <= 64000; ms += 16) {
    const yaw = home.idleYawAt(ms);
    assert.ok(Math.abs(yaw) <= 6 * Math.PI / 180, 'Idle motion must stay close to the composed view');
    assert.ok(Math.abs(yaw - previous) / 0.016 < 1.5 * Math.PI / 180,
        'Idle motion must stay slow and continuous, including the loop seam');
    previous = yaw;
}
assert.ok(Math.abs(home.idleYawAt(0) - home.idleYawAt(home.scene.idleMotion.period)) < 1e-10);
assert.notDeepEqual(home.frame(0, null).slots, home.frame(Math.PI, null).slots,
    'A restrained idle range must not restrict manual rotation');
console.log('  ok    restrained idle motion loops continuously and manual rotation remains unrestricted');

for (const name of ['scene-hosting', 'scene-asic', 'scene-pad-now', 'scene-pad-ion', 'scene-landfill-now', 'scene-landfill-ion']) {
    const scene = require('../../site/' + name + '.js');
    assert.equal(scene.scene.optimize, undefined);
    assert.equal(scene.scene.paint, undefined);
    assert.equal(scene.scene.idleMotion, undefined);
    assert.deepEqual(scene.LAYERS, engine.LAYERS);
    assert.equal(scene.idleYawAt(11000), scene.yawAt(11000));
}
console.log('  ok    the six comparison scenes keep their original rendering and motion options');
