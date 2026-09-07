'use strict';
// Replaces the historical unchanged-output digest: engineering assumptions were corrected.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../site-capacity'),L=require('../source-landfill'),data=require('../data/landfills.json');
test('reported gas composition and auxiliaries constrain a rated engine',()=>{
  const c={source:'lmop-landfill',energyType:'landfill_gas',powerPotentialKw:5000,sourceDetail:{capacityBasis:'rated MW',lfgCollectedMmscfd:2,methanePct:40}};
  // 2m scf/day * 40% * 1012 Btu/scf / 24 / 11250 Btu/kWh = 2998.5 gross kW.
  const u=C.usableCapacity(c);assert.equal(u.kw,2789);assert.equal(u.gasCapped,true);assert.equal(u.availableKw,null);
  assert.equal(C.usableCapacity({...c,powerPotentialKw:1000}).kw,930,'fuel does not enlarge installed rating');
});
test('unknown and zero capacity stay distinct',()=>{
  assert.equal(C.usableCapacity(null).kw,null);assert.equal(C.usableCapacity({powerPotentialKw:null}).kw,null);
  assert.equal(C.usableCapacity({powerPotentialKw:0}).kw,0);
  assert.equal(C.usableCapacity({powerPotentialKw:100,sourceDetail:{capacityBasis:'nominal 100 kW placeholder'}}).kw,null);
});
test('all LMOP rows yield finite nonnegative or explicitly unknown screening, never allocated power',()=>{
  assert.equal(data.projects.length,2755);
  for(const p of data.projects){const c={...L.adapter.normalize(p),source:'lmop-landfill'},u=C.usableCapacity(c);
    assert.ok(u.kw===null||Number.isFinite(u.kw)&&u.kw>=0,p.id);assert.equal(u.availableKw,null);
    if(u.gasSupportedKw!==null&&u.kw!==null)assert.ok(u.kw<=u.gasSupportedKw+1,p.id);
  }
});
test('the live map loads and uses the shared capacity model',()=>{
  const map=fs.readFileSync(require.resolve('../map-sourcing.js'),'utf8'),html=fs.readFileSync(require.resolve('../map.html'),'utf8');
  assert.match(map,/SiteCapacity\.usableCapacity/);assert.ok(html.indexOf('src="./site-capacity.js')<html.indexOf('src="./map-sourcing.js'));
});
