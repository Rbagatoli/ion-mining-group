'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
(async()=>{
    const T=await import('../globe-assets/vendor/three-0.185.1/three.module.min.js');
    const {projectMarkers,pickMarker,markerRadius}=await import('../prospect-globe-layer.js');
    const {globePoint}=await import('../globe-assets/globe-surface.js');
    const {countryBorders}=await import('../map-globe-style.js');
    const camera=new T.PerspectiveCamera(50,2,.1,1000);camera.position.set(0,0,200);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const centers=new Float32Array([0,0,100.16,0,0,-100.16,100.16,0,0]);
    let projected=projectMarkers(centers,camera,1000,500);
    assert.equal(projected.length,1,'back-side and horizon points are not selectable');
    assert.equal(projected[0].x,500);assert.equal(projected[0].y,250);
    assert.equal(pickMarker(projected,510,250,14).index,0,'small marks keep a comfortable click target');
    assert.equal(pickMarker(projected,520,250,14),null);
    assert.equal(pickMarker(projected,520,250,22).index,0,'touch gets more tolerance');
    assert.equal(pickMarker([{index:2,x:510,y:250},...projected],509,250,14).index,2,'nearest wins in a crowded area');
    camera.position.set(0,0,-200);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    assert.equal(projectMarkers(centers,camera,1000,500)[0].index,1,'rotation exposes the other hemisphere');
    for(const lat of [-75,0,45,80])for(const lng of [-180,-98,0,90,180]){
        const p=globePoint(lat,lng,100.16);camera.position.copy(p).multiplyScalar(2);camera.lookAt(0,0,0);camera.updateMatrixWorld();
        projected=projectMarkers(new Float32Array(p.toArray()),camera,390,350);
        assert.equal(projected.length,1);assert.ok(Math.abs(projected[0].x-195)<.01&&Math.abs(projected[0].y-175)<.01);
    }
    assert.ok(markerRadius(125)<markerRadius(10000));
    assert.equal(markerRadius(1e9),markerRadius(10000),'huge capacities never balloon');
    assert.ok(markerRadius(10000,true)>markerRadius(10000),'selection remains visible');
    const borders=countryBorders(100.38);
    assert.equal(borders.material.color.getHex(),0,'country borders are black');
    const positions=borders.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)assert.ok(Math.abs(Math.hypot(positions.getX(i),positions.getY(i),positions.getZ(i))-100.38)<.001);
    borders.geometry.dispose();borders.material.dispose();
    const assets=JSON.parse(fs.readFileSync(path.join(ROOT,'tools/app-assets.json'),'utf8'));
    for(const asset of ['prospect-globe-layer.js','map-globe.css','globe-assets/hosting-earth-data.js','globe-assets/textures/earth-normal.png']){
        assert.ok(assets.includes(asset));assert.ok(fs.existsSync(path.join(ROOT,asset)));
    }
    console.log('PASS: marker picking, globe occlusion, crowding, touch targets, polar/date-line projection, bounded sizes, black borders and runtime assets.');
})().catch(err=>{console.error(err);process.exitCode=1;});
