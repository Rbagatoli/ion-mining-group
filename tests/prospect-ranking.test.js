'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ranking=require('../prospect-ranking.js');
test('acquisition selection always means combined score descending',()=>{
    assert.deepEqual(ranking.decode('combined'),{key:'combined',dir:-1,column:false});
    assert.equal(ranking.next('score','combined'),'combined');
    assert.equal(ranking.next('combined','combined'),'column:combined:asc');
    assert.equal(ranking.next('column:combined:asc','combined'),'combined');
});
test('column choices carry their order in a restorable selection',()=>{
    for(const key of ['name','source','iso3','kw','duty','years','operator','allinkw','torevenue',
        'acquirability','combined','collection','capavoided','caprequired','infraverified','stage','opportunity']){
        for(const dir of [1,-1]){const order=ranking.decode(ranking.encode(key,dir));assert.equal(order.key,key);assert.equal(order.dir,dir);}
    }
    assert.equal(ranking.direction(ranking.decode('column:name:asc')),'A to Z');
    assert.equal(ranking.direction(ranking.decode('column:combined:asc')),'lowest first');
    assert.equal(ranking.encode('caprequired',1),'capital_required');
});
test('unknown is last, zero remains a score, and exact ties have a stable order',()=>{
    const rows=[{id:'unknown',v:null},{id:'b',v:57.45},{id:'zero',v:0},{id:'high',v:75.9},{id:'a',v:57.45},{id:'invalid',v:NaN}];
    function ordered(dir){return rows.slice().sort((a,b)=>ranking.compare(a.v,b.v,dir,a.id,b.id)).map(r=>r.id);}
    assert.deepEqual(ordered(-1),['high','a','b','zero','invalid','unknown']);
    assert.deepEqual(ordered(1),['zero','a','b','high','invalid','unknown']);
    assert.ok(ranking.compare(57.451,57.449,-1,'b','a')<0,'unrounded scores decide close ranks');
});
test('corrupt or retired saved selections are rejected',()=>{
    for(const value of ['',null,'__proto__','constructor','column:unknown:asc','column:combined:sideways','column:combined:asc:extra'])assert.equal(ranking.decode(value),null);
    assert.equal(ranking.encode('unknown',-1),null);assert.equal(ranking.next('combined','unknown'),null);
});
