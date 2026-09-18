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
  vm.runInContext(source + '\nthis.api = { MODEL_DEFINITIONS, buildMiner, disposeMiner };', context);
  const { MODEL_DEFINITIONS, buildMiner, disposeMiner } = context.api;
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
  console.log('  ok   15 catalogue models: physical envelopes, fan layouts, distinct cooling architectures, connector positions and disposal');
}
main().catch(error => { console.error('  FAIL ' + error.stack); process.exitCode = 1; });
