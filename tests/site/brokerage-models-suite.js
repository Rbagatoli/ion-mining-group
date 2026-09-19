'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const catalog = require('../../site/brokerage-catalog-data.js');
const site = path.join(__dirname, '../../site');

// Import the genuine Three geometry runtime as ESM without relying on package
// type detection (the deployment runner uses Node 20 and this repository is CJS).
async function main() {
  const core = fs.readFileSync(path.join(site, 'vendor/three-0.185.1/three.core.min.js'), 'utf8');
  const THREE = await import('data:text/javascript;base64,' + Buffer.from(core).toString('base64'));
  const source = fs.readFileSync(path.join(site, 'brokerage-models.js'), 'utf8')
    .replace(/^import \* as THREE from .*;\s*$/m, '')
    .replace(/^export /gm, '');
  const context = { THREE, document: { createElement: () => ({
    width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} })
  }) } };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.api = { MODEL_DEFINITIONS, buildMiner, animateMiner, disposeMiner };', context);
  const { MODEL_DEFINITIONS, buildMiner, animateMiner, disposeMiner } = context.api;
  const nodes = (model, name) => {
    const result = []; model.root.traverse(node => { if (node.name === name) result.push(node); }); return result;
  };
  const position = node => node.getWorldPosition(new THREE.Vector3());
  const models = new Map();
  for (const family of catalog.families) {
    assert(MODEL_DEFINITIONS[family.modelKey], 'catalog model is implemented: ' + family.modelKey);
    const model = buildMiner(family.modelKey, family.variants[0]); models.set(family.modelKey, model);
    assert.strictEqual(model.modelKey, family.modelKey, 'no silent wrong-hardware fallback');
    assert.strictEqual(model.root.userData.exteriorOnly, true);
    assert(!model.bounds.isEmpty(), family.modelKey + ' has visible geometry');
    const size = model.bounds.getSize(new THREE.Vector3());
    const [L, W, H] = model.dimensionsMM;
    [[size.x, W], [size.y, H], [size.z, L]].forEach(([actual, nominal]) => {
      assert(Number.isFinite(actual) && actual > 0, family.modelKey + ' has finite bounds');
      assert(Math.abs(actual * 100 / nominal - 1) < .16, family.modelKey + ' respects its nominal envelope');
    });
    model.root.traverse(node => {
      assert(!/floor|ground|pedestal/.test(node.name), 'models float without an embedded floor');
      if (node.geometry) {
        const vertices = node.geometry.getAttribute('position');
        if (vertices) for (const value of vertices.array) assert(Number.isFinite(value), family.modelKey + ' vertex is finite');
      }
    });
  }
  assert.throws(() => buildMiner('unsupported-miner'), /Unknown physical miner model/);
  assert.throws(() => buildMiner('s21-pro', { renderDimensionsMM: [450, 0, NaN] }), /Invalid physical miner dimensions/);
  const mainFans = { 's21-pro': 4, 's19-air': 4, 'whatsminer-air': 2, 'avalon-a15': 2, 'avalon-a16': 2, 'sealminer-air': 4 };
  for (const [key, model] of models) assert.strictEqual(nodes(model, 'main-air-fan').length, mainFans[key] || 0, key + ' verified cooling architecture');
  const fanEnclosures = {
    's21-pro': ['hashboard-enclosure', 'side-power-supply'],
    's19-air': ['hashboard-enclosure', 'side-power-supply'],
    'whatsminer-air': ['airflow-tunnel', 'top-power-supply'],
    'avalon-a15': ['avalon-body', 'avalon-power-supply'],
    'avalon-a16': ['avalon-body', 'avalon-power-supply'],
    'sealminer-air': ['sealminer-air-enclosure', 'side-power-supply']
  };
  for (const [key, names] of Object.entries(fanEnclosures)) {
    const model = models.get(key);
    for (const rotor of model.animation.rotors) {
      const enclosure = nodes(model, names[rotor.parent.name === 'power-supply-fan' ? 1 : 0])[0];
      const bounds = new THREE.Box3().setFromObject(enclosure), center = position(rotor);
      const facesForward = rotor.localToWorld(new THREE.Vector3(0, 0, 1)).z > center.z;
      assert(facesForward ? center.z > bounds.max.z : center.z < bounds.min.z,
        key + ' ' + rotor.parent.name + ' blades are outside the opaque enclosure face, not animated behind it');
    }
  }
  for (const [key, model] of models) {
    const rotors = nodes(model, 'fan-rotor'), status = nodes(model, 'status-led'), faults = nodes(model, 'fault-led');
    assert.strictEqual(model.animation.rotors.length, rotors.length, key + ' animates every existing rotor');
    assert.strictEqual(rotors.length, nodes(model, 'main-air-fan').length + nodes(model, 'power-supply-fan').length,
      key + ' only physical main/PSU fans have animation');
    assert.strictEqual(model.animation.statusLights.length, status.length);
    assert.strictEqual(model.animation.faultLights.length, faults.length);
    const fixed = [];
    model.root.traverse(node => { if (node.name !== 'fan-rotor') fixed.push([node, node.position.clone(), node.quaternion.clone()]); });
    const before = rotors.map(node => node.rotation.z), green = status.map(node => node.material.emissiveIntensity);
    for (const dt of [0, -1, NaN, Infinity]) animateMiner(model, dt);
    assert.deepStrictEqual(rotors.map(node => node.rotation.z), before, 'invalid or zero elapsed time never moves a fan');
    for (let i = 0; i < 30; i++) animateMiner(model, 1 / 60);
    rotors.forEach((rotor, index) => assert.notStrictEqual(rotor.rotation.z, before[index], key + ' rotor visibly spins'));
    fixed.forEach(([node, position, rotation]) => {
      assert(node.position.equals(position) && node.quaternion.equals(rotation), key + ' only rotors move, not grilles/enclosures');
    });
    status.forEach((led, index) => {
      assert.notStrictEqual(led.material.emissiveIntensity, green[index], key + ' green status activity changes');
      assert(led.material.emissiveIntensity >= 1.5 && led.material.emissiveIntensity <= 2.1, 'powered LED never goes dark');
    });
    faults.forEach(led => assert.strictEqual(led.material.emissive.getHex(), 0, key + ' healthy preview does not light red fault LEDs'));
    assert.strictEqual(status.length, key === 'avalon-immersion' ? 0 : 1,
      'unreferenced status indicators are not invented');
  }
  for (const key of ['s21-pro', 's19-air']) {
    const model = models.get(key);
    assert.strictEqual(nodes(model, 'power-supply-fan').length, 3, key + ' three small PSU fans');
    assert(nodes(model, 'side-power-supply')[0].position.x > 0, 'PSU is on the right of the inlet fans');
    assert.strictEqual(nodes(model, 'main-air-fan').filter(node => position(node).z > 0).length, 2);
    assert.strictEqual(nodes(model, 'main-air-fan').filter(node => position(node).z < 0).length, 2);
  }
  assert.strictEqual(nodes(models.get('s19-air'), 'power-connector').length, 2, 'S19k Pro has two AC inputs');
  for (const key of ['avalon-a15', 'avalon-a16']) {
    const model = models.get(key);
    assert(nodes(model, 'main-air-fan').every(node => position(node).z > 0), 'Avalon uses inlet fans and passive rear exhaust');
    assert(nodes(model, 'honeycomb-exhaust').some(node => position(node).z < 0));
    assert(nodes(model, 'avalon-power-supply')[0].position.x > 0);
  }
  assert.strictEqual(nodes(models.get('sealminer-air'), 'power-supply-fan').length, 2);
  assert.strictEqual(nodes(models.get('sealminer-air'), 'full-width-controller-cap').length, 1);
  assert.strictEqual(nodes(models.get('s21-hydro'), 'corrugated-coolant-loop').length, 6, 'compact hydro has two three-loop banks');
  assert.strictEqual(nodes(models.get('whatsminer-hydro'), 'water-connection').length, 0, 'M73 front is not fabricated with water connectors');
  for (const key of ['sealminer-hydro', 'avalon-hydro']) {
    const ports = nodes(models.get(key), 'water-connection');
    assert(ports.length >= 2 && ports.every(node => position(node).z < 0), key + ' water connectors are at the photographed rear');
  }
  assert.strictEqual(nodes(models.get('avalon-immersion'), 'top-carry-handle').length, 1);
  assert(nodes(models.get('avalon-immersion'), 'round-perforations').length >= 6);
  assert.strictEqual(nodes(models.get('whatsminer-immersion'), 'top-carry-handle').length, 0);
  assert.strictEqual(nodes(models.get('s21-immersion'), 'apw11i-side-power-supply').length, 1);
  assert.deepStrictEqual(Array.from(models.get('sealminer-air').dimensionsMM), [365, 197, 292]);
  assert.deepStrictEqual(Array.from(models.get('sealminer-hydro').dimensionsMM), [665, 482, 86]);

  // Exercise the actual stage loop with GPU/DOM adapters: there must be one
  // scheduler, with no elapsed catch-up when a hidden or paused view resumes.
  const frames = new Map(), events = {}, canvasEvents = {};
  let frameId = 0, intersect, preferenceChange, activeModel, renderCount = 0;
  const canvas = {style: {}, setAttribute() {}, addEventListener(name, cb) { canvasEvents[name] = cb; }, removeEventListener() {}, remove() {}};
  class Renderer { constructor() { this.domElement = canvas; } setClearColor() {} setPixelRatio() {} setSize() {} render() { renderCount++; } dispose() {} }
  class Controls extends THREE.EventDispatcher { constructor() { super(); this.target = new THREE.Vector3(); } update() {} dispose() {} }
  class Environment extends THREE.Scene { dispose() {} }
  class PMREM { fromScene() { return {texture: new THREE.Texture(), dispose() {}}; } dispose() {} }
  const host = {clientWidth: 800, clientHeight: 600, dataset: {}, appendChild() {}};
  const doc = {hidden: false, addEventListener(name, cb) { events[name] = cb; }, removeEventListener() {}};
  const stageContext = {
    THREE: {...THREE, WebGLRenderer: Renderer, PMREMGenerator: PMREM}, OrbitControls: Controls, RoomEnvironment: Environment,
    document: doc, devicePixelRatio: 1,
    matchMedia: () => ({matches: false, addEventListener(name, cb) { preferenceChange = cb; }, removeEventListener() {}}),
    requestAnimationFrame: cb => { frames.set(++frameId, cb); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(cb) { intersect = cb; } observe() {} disconnect() {} }
  };
  const stageSource = fs.readFileSync(path.join(site, 'brokerage-stage.js'), 'utf8').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
  vm.createContext(stageContext); vm.runInContext(stageSource + '\nthis.mount = mountMinerStage;', stageContext);
  const stage = stageContext.mount(host, {buildMiner(key) { activeModel = buildMiner(key); return activeModel; }, disposeMiner, animateMiner});
  const tick = time => { assert(frames.size <= 1, 'only one animation frame can be scheduled'); const entry = frames.entries().next().value; if (entry) { frames.delete(entry[0]); entry[1](time); } };
  stage.setModel('s21-pro'); tick(1000); tick(1016);
  assert(activeModel.animation.elapsed > 0 && host.dataset.motion === 'playing', 'stage drives real fan/LED animation');
  stage.setMotion(false); const paused = activeModel.animation.elapsed; tick(1032);
  assert.strictEqual(activeModel.animation.elapsed, paused); assert.strictEqual(frames.size, 0, 'paused scene stops scheduling');
  stage.setMotion(true); tick(3000); assert.strictEqual(activeModel.animation.elapsed, paused, 'resume does not jump through paused elapsed time'); tick(3016);
  intersect([{isIntersecting: false}]); const offscreen = activeModel.animation.elapsed;
  assert.strictEqual(frames.size, 0); tick(4000); assert.strictEqual(activeModel.animation.elapsed, offscreen);
  intersect([{isIntersecting: true}]); tick(5000); tick(5016);
  doc.hidden = true; events.visibilitychange(); assert.strictEqual(frames.size, 0, 'background tabs stop animation');
  doc.hidden = false; events.visibilitychange(); tick(6000); tick(6016);
  preferenceChange({matches: true}); const reduced = activeModel.animation.elapsed; tick(6032);
  assert.strictEqual(activeModel.animation.elapsed, reduced); assert.strictEqual(frames.size, 0, 'reduced motion stops all animation');
  assert.strictEqual(host.dataset.motion, 'reduced');
  stage.setMotion(true); tick(6048); assert.strictEqual(activeModel.animation.elapsed, reduced, 'play cannot override reduced motion');
  stage.setActive(false); assert.strictEqual(frames.size, 0);
  assert(renderCount > 0, 'a static frame remains renderable while animation is disabled');
  stage.dispose(); assert.strictEqual(frames.size, 0, 'teardown cancels the scheduler');

  // InstancedMesh owns separate instanceMatrix/instanceColor GPU buffers. Its
  // dispose event releases those even when shared geometry is disposed below.
  const sample = models.get('s21-pro'), resources = new Set(), disposed = new Set(), instances = new Set(), disposedInstances = new Set();
  sample.root.traverse(node => {
    if (node.isInstancedMesh) { instances.add(node); node.addEventListener('dispose', () => disposedInstances.add(node)); }
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
      resources.add(material); if (material.map) resources.add(material.map);
    }
  });
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
  disposeMiner(sample);
  assert(instances.size > 0, 'disposal fixture contains instanced geometry');
  assert.strictEqual(disposedInstances.size, instances.size, 'every InstancedMesh releases its instance buffers');
  assert.strictEqual(disposed.size, resources.size, 'all detached model GPU resources are disposed');
  for (const [key, model] of models) if (key !== 's21-pro') disposeMiner(model);
  console.log('  ok   15 catalogue models: physical envelopes, fan layouts, cooling architectures, fan/LED animation, pause/visibility/reduced-motion scheduling and disposal');
}
main().catch(error => { console.error('  FAIL ' + error.stack); process.exitCode = 1; });
