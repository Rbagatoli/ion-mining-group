/* Geometry, generated content and loading/recovery behavior. Browser gesture checks
   are also run against the actual WebGL scenes before publishing. */
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {Element,parse}=require('./helpers/terrain-dom.js'),F=require('../../site/facilities.js');
const html=fs.readFileSync(__dirname+'/../../site/hosting.html','utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('  ok    '+name);}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({fail=false,delay=false,search=''}={}){
    const document=parse(html),observers=[],scenes=[],pending=[],events={},fields=[];
    document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag);document.createElementNS=(_,tag)=>new Element(tag);
    const tag=html.match(/<script src="\.\/hosting-experience\.js[^>]*>/)[0];
    document.currentScript=new Element('script',Object.fromEntries([...tag.matchAll(/(data-[\w-]+)="([^"]+)"/g)].map(m=>[m[1],m[2]])));
    const modules={
        globe:{mountGlobe(host,land,runtime,cb){const scene={kind:'globe',cb,selections:[],select(id){this.selections.push(id);this.current=id;cb.onSelect(id);},zoom(){},reset(){},dispose(){this.disposed=true;}};scenes.push(scene);scene.select('permian');return scene;}},world:{LAND:[]},stage:{}
    };
    const sandbox={document,console,location:{search},Facilities:{...F,choose(){throw Error('Exploring cannot change a saved order.');}},
        ProtonField:{mount(){const field={dispose(){this.disposed=true;}};fields.push(field);return field;}},
        IntersectionObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(el){this.el=el;}disconnect(){this.disconnected=true;}},
        addEventListener:(type,fn)=>{events[type]=fn;},loadModule(url){
            if(fail)return Promise.reject(Error('offline'));
            const entry=Object.entries(document.currentScript.attrs).find(([,value])=>value===url),key=entry[0].split('-')[1];
            return delay?new Promise(resolve=>pending.push(()=>resolve(modules[key]))):Promise.resolve(modules[key]);
        }};
    sandbox.window=sandbox;vm.createContext(sandbox);
    new vm.Script(fs.readFileSync(__dirname+'/../../site/hosting-experience.js','utf8').replace('import(urls[key])','loadModule(urls[key])')).runInContext(sandbox);
    return {document,scenes,events,fields,ref:(prefix,key)=>document.querySelector('[data-'+prefix+'="'+key+'"]'),
        click:selector=>document.querySelector(selector).fire('click'),approach(){observers.forEach(o=>o.fn([{isIntersecting:true}]));},release(){pending.forEach(fn=>fn());}};
}
function rendererFixture(globe,T,aspect){
    const previousDocument=global.document,canvas=new Element('canvas'),selections=[];
    let options,points=[],scene;
    const stage={world:new T.Scene(),camera:new T.PerspectiveCamera(48,aspect,.06,600),canvas,controls:{},
        renderer:{capabilities:{getMaxAnisotropy:()=>8}},wake(){},wasShiftGesture:()=>false,
        move(position){this.camera.position.set(...position);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();},
        zoom(factor){stage.zoomFactor=factor;},setActive(value){stage.active=value;},dispose(){stage.disposed=true;}};
    global.document={createElement(){return {getContext(){return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){}};}};},
        createElementNS:(_,tag)=>new Element(tag)};
    try{scene=globe.mountGlobe({},[],{createStage(host,settings){options=settings;return stage;}},{onProject:value=>{points=value;},onSelect:id=>selections.push(id)});}
    finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
    return {scene,stage,options,selections,get points(){return points;}};
}
(async()=>{
    const globe=await import('../../site/hosting-globe-scene.js'),world=await import('../../site/hosting-earth-data.js');
    const T=await import('../../site/vendor/three-0.185.1/three.module.min.js');
    check('operator maps share the website surface and cache all rendering dependencies',()=>{
        const shared=require('../../tools/build-globe-assets.js');assert.equal(shared.build(true),0);
        const sw=fs.readFileSync(__dirname+'/../../sw.js','utf8');
        for(const asset of shared.FILES.filter(name=>name.endsWith('.js')))
            assert.ok(sw.includes("'./globe-assets/"+asset+"'"),asset);
        assert.ok(sw.includes("'./map-globe-style.js'"));
    });
    check('every listed region has a finite, approximate globe marker',()=>{
        assert.deepEqual(Object.keys(globe.REGIONS),F.all().map(s=>s.id));
        for(const point of Object.values(globe.REGIONS))assert.ok(Math.abs(globe.globePoint(point.lat,point.lon).length()-3.2)<1e-10);
        assert.ok(globe.globePoint(0,0).distanceTo(new T.Vector3(0,0,3.2))<1e-10);
    });
    check('globe framing fits narrow and wide viewports without clipping the earth',()=>{
        for(const aspect of [.55,.73,1,1.8,2.4]){
            const distance=globe.cameraDistance(aspect),halfFov=Math.atan(Math.tan(48*Math.PI/360)*Math.min(1,aspect));
            assert.ok(Math.asin(3.31/distance)<halfFov*.94);
        }
        assert.ok(world.LAND.length>100);let count=0;
        for(const polygon of world.LAND)for(const ring of polygon)for(const p of ring){assert.ok(Math.abs(p[0])<=180&&Math.abs(p[1])<=90);count++;}
        assert.ok(count>50000&&count<80000);assert.ok(world.LAKES.length>300);
        for(const polygon of world.LAKES)for(const ring of polygon)for(const p of ring)assert.ok(Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
    });
    check('country boundaries stay above the globe, including long segments and the date line',()=>{
        assert.ok(world.BORDERS.length>300);
        for(const line of world.BORDERS)for(const p of line)assert.ok(Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
        for(const data of [world.BORDERS,[[[179,10],[-179,10]],[[10,80],[110,85]]]]){
            const borders=globe.buildCountryBorders(data),positions=borders.geometry.attributes.position;
            assert.equal(borders.material.color.getHex(),0x000000);assert.equal(borders.material.depthTest,true);
            assert.ok(positions.count>0&&positions.count<100000);
            for(let i=0;i<positions.count;i+=2){
                const a=new T.Vector3().fromBufferAttribute(positions,i),b=new T.Vector3().fromBufferAttribute(positions,i+1);
                assert.ok(Math.abs(a.length()-3.212)<1e-6&&Math.abs(b.length()-3.212)<1e-6);
                assert.ok(a.lerp(b,.5).length()>3.21,'the entire segment clears the earth');
            }
            borders.geometry.dispose();borders.material.dispose();
        }
    });
    check('shallow markers follow every region and remain navigable across viewport shapes',()=>{
        for(const aspect of [.55,1,2.4]){
            const f=rendererFixture(globe,T,aspect),root=f.stage.world.getObjectByName('hosting-globe');
            for(const [id,region] of Object.entries(globe.REGIONS)){
                f.scene.select(id,true);f.options.tick(0,0,true);root.updateMatrixWorld(true);
                const pin=root.getObjectByName('region-pin-'+id),cap=pin.getObjectByName('orange-pin-head');
                const normal=globe.globePoint(region.lat,region.lon,1),tip=cap.getWorldPosition(new T.Vector3());
                assert.ok(pin.position.clone().normalize().distanceTo(normal)<1e-10,'marker stays at the listed region');
                assert.ok(tip.length()>3.2&&tip.length()<3.28,'marker center stays close to the surface');
                assert.ok(new T.Vector3(0,0,1).applyQuaternion(pin.quaternion).distanceTo(normal)<1e-10,'bezel faces away from the surface');
                const projected=f.points.find(point=>point.id===id);
                assert.ok(projected.visible&&Math.abs(projected.x-.5)<1e-10&&Math.abs(projected.y-.5)<1e-10,'selection centers its marker');
                assert.ok(Math.abs(f.stage.camera.position.length()-globe.cameraDistance(aspect))<1e-10);
            }
            const selected=f.selections.at(-1),before=f.stage.camera.position.clone();
            f.scene.select('unknown');assert.equal(f.selections.at(-1),selected);assert.ok(f.stage.camera.position.equals(before));
            f.stage.camera.position.multiplyScalar(.8);f.scene.reset();assert.ok(f.stage.camera.position.distanceTo(before)<1e-10);
            f.scene.zoom(.8);assert.equal(f.stage.zoomFactor,.8);f.scene.setActive(false);assert.equal(f.stage.active,false);
            f.options.tick(0,10,true);const cap=root.getObjectByName('region-pin-'+selected).getObjectByName('orange-pin-head'),still=cap.material.emissiveIntensity;
            f.options.tick(0,20,true);assert.equal(cap.material.emissiveIntensity,still,'reduced motion holds marker brightness steady');
            f.scene.dispose();assert.equal(f.stage.disposed,true);assert.equal(f.stage.canvas.listeners.pointerup.length,0);
        }
    });
    check('generated globe preserves commercial disclosures, destinations and stamped modules',()=>{
        assert.ok(!html.includes('hosting-tour'));assert.ok(!html.includes('data-tour'));assert.ok(!fs.existsSync(__dirname+'/../../site/hosting-tour-scene.js'));assert.ok(html.includes('Markers identify regions, not exact facilities.'));assert.ok(html.includes(F.INDICATIVE_NOTE));
        for(const asset of ['hosting-experience.js','hosting-stage.js','hosting-globe-scene.js','hosting-earth-data.js'])assert.ok(new RegExp(asset.replace('.','\\.')+'\\?v=[a-f0-9]{8}').test(html));
        assert.equal(parse(html).querySelector('#hosting-globe').querySelectorAll('[data-region]').length,F.all().length);
        assert.ok(!html.includes('hosting-terrain.js'));assert.ok(!html.includes('ht-stage'));
    });
    const early=fixture({delay:true,search:'?site=cold-lake'});early.approach();early.click('[data-region="dubai"]');early.release();await settle();await settle();
    check('choices made while modules load survive scene initialization',()=>{
        assert.equal(early.scenes.find(s=>s.kind==='globe').current,'dubai');
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=dubai');
        assert.equal(early.ref('globe','location').value,'dubai');
    });
    const gs=early.scenes.find(s=>s.kind==='globe');gs.cb.onReady();
    check('context loss disables only 3D controls and restores the latest region',()=>{
        gs.cb.onError();const previous=gs.selections.length;early.click('[data-region="bakken"]');assert.equal(gs.selections.length,previous);assert.equal(early.ref('globe','reset').disabled,true);
        assert.equal(early.ref('globe','name').textContent,'Bakken');gs.cb.onRestore();gs.cb.onReady();assert.equal(gs.current,'bakken');assert.equal(early.ref('globe','reset').disabled,false);
    });
    check('mobile location choices, map markers and region controls share the same selection',()=>{
        const location=early.ref('globe','location');
        assert.deepEqual(location.querySelectorAll('option').map(option=>option.value),F.all().map(site=>site.id));
        location.value='cold-lake';location.fire('change');
        assert.equal(gs.current,'cold-lake');assert.equal(early.ref('globe','name').textContent,F.byId('cold-lake').name);
        assert.equal(early.ref('region','cold-lake').getAttribute('aria-pressed'),'true');
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=cold-lake');
        early.click('[data-marker="permian"]');assert.equal(location.value,'permian');assert.equal(gs.current,'permian');
    });
    check('clustered markers keep the chosen region anchored and hide off-globe leaders',()=>{
        early.click('[data-region="cold-lake"]');
        const surface=early.ref('globe','surface'),ids=F.all().map(site=>site.id),leaders=early.ref('globe','leaders').querySelectorAll('line');
        const points=ids.map((id,index)=>({id,x:.5,y:id==='cold-lake'?.52:.48+index*.005,visible:id!=='dubai'}));
        for(const [width,height] of [[360,340],[1280,470]]){
            Object.defineProperties(surface,{clientWidth:{value:width,configurable:true},clientHeight:{value:height,configurable:true}});
            gs.cb.onProject(points.map(point=>({...point,visible:true})));
            assert.equal(early.ref('marker','dubai').hidden,false);
            assert.equal(leaders[ids.indexOf('dubai')].getAttribute('visibility'),'visible');
            gs.cb.onProject(points);
            const chosen=early.ref('marker','cold-lake'),anchor=points.find(point=>point.id==='cold-lake');
            assert.equal(parseFloat(chosen.style.left),anchor.x*width,'selected marker retains its geographic x position');
            assert.equal(parseFloat(chosen.style.top),anchor.y*height,'selected marker retains its geographic y position');
            const visible=points.filter(point=>point.visible).map(point=>early.ref('marker',point.id));
            for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
                assert.equal(visible[i].hidden,false);
                assert.ok(Math.hypot(parseFloat(visible[i].style.left)-parseFloat(visible[j].style.left),parseFloat(visible[i].style.top)-parseFloat(visible[j].style.top))>=44-1e-7,'clustered targets retain 44px spacing');
            }
            assert.equal(early.ref('marker','dubai').hidden,true);
            assert.equal(leaders[ids.indexOf('dubai')].getAttribute('visibility'),'hidden','a previously visible leader disappears with its marker');
        }
        delete surface.clientWidth;delete surface.clientHeight;
    });
    const offline=fixture({fail:true});offline.approach();await settle();await settle();
    check('import failure leaves all regional pricing usable',()=>{
        for(const site of F.all()){
            const location=offline.ref('globe','location');location.value=site.id;location.fire('change');
            assert.equal(offline.ref('region',site.id).getAttribute('aria-pressed'),'true');
            assert.equal(offline.ref('globe','capacity').textContent,F.capacityLabel(site));assert.equal(offline.ref('globe','rate').textContent,F.powerLabel(site));assert.equal(offline.ref('globe','cta').getAttribute('href'),'./hardware.html?site='+site.id);
            assert.equal(offline.ref('globe','status').getAttribute('data-available'),String(F.acceptsMachines(site)));
            offline.click('[data-region="'+site.id+'"]');assert.equal(location.value,site.id);
        }
    });
    check('back-forward cache preserves scenes while final navigation disposes the globe and its field',()=>{
        early.events.pagehide({persisted:true});assert.ok(early.scenes.every(s=>!s.disposed));early.events.pagehide({persisted:false});assert.ok(early.scenes.every(s=>s.disposed));assert.ok(early.fields.every(f=>f.disposed));
    });
    const leaving=fixture({delay:true});leaving.approach();leaving.events.pagehide({persisted:false});leaving.release();await settle();await settle();
    check('late imports do not create renderers after the page is gone',()=>{assert.equal(leaving.scenes.length,0);});
    console.log('\n'+passed+' hosting experience checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
