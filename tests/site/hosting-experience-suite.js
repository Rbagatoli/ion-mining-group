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
        globe:{mountGlobe(host,land,runtime,cb){const scene={kind:'globe',cb,selections:[],selectionCalls:[],select(id,instant=false,{focus=true}={}){this.selections.push(id);this.selectionCalls.push({id,instant,focus});this.current=id;this.focused=focus;cb.onSelect(id);if(focus)cb.onFocus?.();},zoom(){},reset(){this.focused=false;cb.onOverview?.();},dispose(){this.disposed=true;}};scenes.push(scene);scene.select('permian',true,{focus:false});return scene;}},world:{LAND:[]},stage:{}
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
    const previousDocument=global.document,canvas=new Element('canvas'),selections=[],moves=[],events=[];
    let options,points=[],scene;
    const stage={world:new T.Scene(),camera:new T.PerspectiveCamera(48,aspect,.06,600),canvas,controls:{},
        renderer:{capabilities:{getMaxAnisotropy:()=>8}},wake(){},wasShiftGesture:()=>false,
        move(position,target,settings={}){moves.push({position,target,settings});this.camera.position.set(...position);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();},
        zoom(factor){stage.zoomFactor=factor;},setActive(value){stage.active=value;},dispose(){stage.disposed=true;}};
    global.document={createElement(){return {getContext(){return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){}};}};},
        createElementNS:(_,tag)=>new Element(tag)};
    try{scene=globe.mountGlobe({},[],{createStage(host,settings){options=settings;return stage;}},{onProject:value=>{points=value;},onSelect:id=>selections.push(id),onFocus:()=>events.push('focus'),onOverview:()=>events.push('overview')});}
    finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
    return {scene,stage,options,selections,moves,events,get points(){return points;}};
}
function stageFixture(T,reduced=false){
    const host=new Element('section'),canvas=new Element('canvas'),motion=new Element('media'),frames=new Map();
    motion.matches=reduced;let nextFrame=0;
    const sandbox={T:{...T,
        WebGLRenderer:class{constructor(){this.domElement=canvas;this.shadowMap={};}setPixelRatio(){}setSize(){}render(){}dispose(){}},
        PMREMGenerator:class{fromScene(){return {texture:null,dispose(){}};}dispose(){}}},
        OrbitControls:class extends T.EventDispatcher{constructor(camera){super();this.target=new T.Vector3();this.camera=camera;}update(){this.camera.lookAt(this.target);}dispose(){}},
        RoomEnvironment:class{dispose(){}},enableScenePan:()=>({wasShiftGesture:()=>false,dispose(){}}),
        document:new Element('document'),devicePixelRatio:1,matchMedia:()=>motion,ResizeObserver:class{observe(){}disconnect(){}},
        requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)};
    const source=fs.readFileSync(__dirname+'/../../site/hosting-stage.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
    vm.runInNewContext(source+'\nglobalThis.createStage=createStage;',sandbox);
    const stage=sandbox.createStage(host,{lighting:false,spin:true,spinSpeed:0});
    return {stage,motion,frame(ms){const entry=frames.entries().next().value;assert.ok(entry,'stage requested a frame');frames.delete(entry[0]);entry[1](ms);},
        dispose(){stage.dispose();assert.equal(frames.size,0);}};
}
(async()=>{
    const globe=await import('../../site/hosting-globe-scene.js'),world=await import('../../site/hosting-earth-data.js');
    const T=await import('../../site/vendor/three-0.185.1/three.module.min.js');
    const start=[10,0,0],end=[0,0,14],initialTarget=[1,2,3],target=[5,6,7];
    const close=(a,b)=>assert.ok(a.distanceTo(new T.Vector3(...b))<1e-10);
    check('arc pullback eases outward between regions and preserves both endpoints',()=>{
        const f=stageFixture(T),s=f.stage;
        try{
            s.move(start,initialTarget,{instant:true});s.move(end,target,{arc:true,pullback:4,duration:2});
            f.frame(1000);close(s.camera.position,start);close(s.controls.target,initialTarget);
            f.frame(1500);const eased=53/512; // smootherstep(.25)
            assert.ok(Math.abs(s.camera.position.length()-(10+4*eased+4*Math.sin(Math.PI*eased)))<1e-10);
            f.frame(2000);assert.ok(Math.abs(s.camera.position.length()-16)<1e-10);
            close(s.camera.position.clone().normalize(),[Math.SQRT1_2,0,Math.SQRT1_2]);close(s.controls.target,[3,4,5]);assert.equal(s.travelling,true);
            f.frame(3000);close(s.camera.position,end);close(s.controls.target,target);assert.equal(s.travelling,false);
        }finally{f.dispose();}
    });
    check('omitting pullback preserves existing arc and non-arc movement',()=>{
        for(const options of [{arc:true},{arc:true,pullback:0},{arc:true,pullback:-4},{pullback:4}]){
            const f=stageFixture(T),s=f.stage;
            try{
                s.move(start,initialTarget,{instant:true});s.move(end,target,{...options,duration:2});f.frame(1000);f.frame(2000);
                if(options.arc)assert.ok(Math.abs(s.camera.position.length()-12)<1e-10);else close(s.camera.position,[5,0,7]);
                f.frame(3000);close(s.camera.position,end);assert.equal(s.travelling,false);
            }finally{f.dispose();}
        }
    });
    check('instant and reduced motion reach the target without a pullback animation',()=>{
        for(const reduced of [false,true]){
            const f=stageFixture(T,reduced),s=f.stage;
            try{
                s.move(start,initialTarget,{instant:true});s.move(end,target,{arc:true,pullback:4,duration:2,instant:!reduced});
                close(s.camera.position,end);close(s.controls.target,target);assert.equal(s.travelling,false);
            }finally{f.dispose();}
        }
        const f=stageFixture(T),s=f.stage;
        try{
            s.move(start,initialTarget,{instant:true});s.move(end,target,{arc:true,pullback:4,duration:2});f.frame(1000);f.frame(2000);
            f.motion.matches=true;f.motion.fire('change');close(s.camera.position,end);close(s.controls.target,target);assert.equal(s.travelling,false);
            f.frame(4000);close(s.camera.position,end);
        }finally{f.dispose();}
    });
    check('operator maps share the website surface and cache all rendering dependencies',()=>{
        const shared=require('../../tools/build-globe-assets.js');assert.equal(shared.build(true),0);
        const sw=fs.readFileSync(__dirname+'/../../sw.js','utf8');
        for(const asset of shared.FILES.filter(name=>name.endsWith('.js')))
            assert.ok(sw.includes("'./globe-assets/"+asset+"'"),asset);
        assert.ok(sw.includes("'./map-globe-style.js'"));
    });
    check('every listed region has a finite, approximate globe marker',()=>{
        assert.deepEqual(Object.keys(globe.REGIONS),F.groups().map(s=>s.id));
        for(const point of Object.values(globe.REGIONS))assert.ok(Math.abs(globe.globePoint(point.lat,point.lon).length()-3.2)<1e-10);
        assert.ok(globe.globePoint(0,0).distanceTo(new T.Vector3(0,0,3.2))<1e-10);
    });
    check('overview fits the whole globe with a small margin and regional focus remains close',()=>{
        for(const aspect of [.55,.73,1,1.8,2.4]){
            const overview=globe.cameraDistance(aspect),distance=globe.focusDistance(aspect),span=3.24/Math.sqrt(distance*distance-3.24*3.24)/Math.tan(48*Math.PI/360);
            const overviewSpan=3.31/Math.sqrt(overview*overview-3.31*3.31)/Math.tan(48*Math.PI/360)/Math.min(1,aspect);
            assert.ok(overviewSpan>.8&&overviewSpan<.98,'overview fits the globe atmosphere inside both edges with a small margin');
            assert.ok(distance>4.1&&distance<overview,'regional focus moves closer while remaining outside the globe');
            assert.ok(Math.abs(span/aspect-Math.min(1.08,1.85/aspect))<1e-10,'close globe fills the width, with intentional vertical cropping');
        }
        assert.ok(world.LAND.length>100);let count=0;
        for(const polygon of world.LAND)for(const ring of polygon)for(const p of ring){assert.ok(Math.abs(p[0])<=180&&Math.abs(p[1])<=90);count++;}
        assert.ok(count>50000&&count<80000);assert.ok(world.LAKES.length>300);
        for(const polygon of world.LAKES)for(const ring of polygon)for(const p of ring)assert.ok(Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
    });
    check('initial view, explicit selection, reset and resizing preserve the intended framing mode',()=>{
        const f=rendererFixture(globe,T,.55),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
        close(f.stage.camera.position.length(),globe.cameraDistance(.55));assert.deepEqual(f.events,[],'passive startup does not report a user focus');
        f.scene.select('alberta',true,{focus:false});close(f.stage.camera.position.length(),globe.cameraDistance(.55));
        f.stage.camera.aspect=2.4;f.options.onResize();close(f.stage.camera.position.length(),globe.cameraDistance(2.4));
        f.scene.select('alberta');close(f.stage.camera.position.length(),globe.focusDistance(2.4));assert.equal(f.events.at(-1),'focus');
        f.scene.select('dubai');assert.ok(f.moves.at(-1).settings.arc&&f.moves.at(-1).settings.pullback>0,'moving between focused regions requests a pullback flight');
        f.stage.camera.aspect=.73;f.options.onResize();close(f.stage.camera.position.length(),globe.focusDistance(.73));
        f.scene.reset();close(f.stage.camera.position.length(),globe.cameraDistance(.73));assert.equal(f.events.at(-1),'overview');
        assert.equal(f.selections.at(-1),'dubai','Reset changes framing without changing the selected region');
        f.stage.camera.aspect=1;f.options.onResize();close(f.stage.camera.position.length(),globe.cameraDistance(1));
        f.scene.select('alberta');f.options.onReset();close(f.stage.camera.position.length(),globe.cameraDistance(1));
        assert.equal(f.events.at(-1),'overview','keyboard Reset follows the same overview callback');f.scene.dispose();
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
                assert.ok(Math.abs(f.stage.camera.position.length()-globe.focusDistance(aspect))<1e-10);
            }
            const selected=f.selections.at(-1),before=f.stage.camera.position.clone();
            f.scene.select('unknown');assert.equal(f.selections.at(-1),selected);assert.ok(f.stage.camera.position.equals(before));
            f.stage.camera.position.multiplyScalar(.8);f.scene.reset();assert.ok(Math.abs(f.stage.camera.position.length()-globe.cameraDistance(aspect))<1e-10);
            f.scene.zoom(.8);assert.equal(f.stage.zoomFactor,.8);f.scene.setActive(false);assert.equal(f.stage.active,false);
            f.options.tick(0,10,true);const cap=root.getObjectByName('region-pin-'+selected).getObjectByName('orange-pin-head'),still=cap.material.emissiveIntensity;
            f.options.tick(0,20,true);assert.equal(cap.material.emissiveIntensity,still,'reduced motion holds marker brightness steady');
            f.scene.setActive(true);f.scene.select('permian',true,{focus:false});
            // Turn the overview toward a different pin before tapping its surface target.
            f.stage.move(globe.globePoint(globe.REGIONS.bakken.lat,globe.REGIONS.bakken.lon,globe.cameraDistance(aspect)).toArray());
            f.options.tick(0,20,true);root.updateMatrixWorld(true);
            const target=f.points.find(point=>point.id==='bakken'),bounds=f.stage.canvas.getBoundingClientRect();
            assert.ok(target.visible);
            const click={pointerId:1,button:0,clientX:bounds.left+target.x*bounds.width,clientY:bounds.top+target.y*bounds.height};
            f.stage.canvas.fire('pointerdown',click);f.stage.canvas.fire('pointerup',click);
            assert.equal(f.selections.at(-1),'bakken','surface pins remain selectable through the canvas without HTML callouts');
            assert.ok(Math.abs(f.stage.camera.position.length()-globe.focusDistance(aspect))<1e-10,'a surface pin click moves from overview to regional focus');
            assert.equal(f.events.at(-1),'focus');
            f.scene.dispose();assert.equal(f.stage.disposed,true);assert.equal(f.stage.canvas.listeners.pointerup.length,0);
        }
    });
    check('generated globe preserves commercial disclosures, destinations and stamped modules',()=>{
        assert.ok(!html.includes('hosting-tour'));assert.ok(!html.includes('data-tour'));assert.ok(!fs.existsSync(__dirname+'/../../site/hosting-tour-scene.js'));assert.ok(html.includes('Markers identify regions, not exact facilities.'));assert.ok(html.includes(F.INDICATIVE_NOTE));
        for(const asset of ['hosting-experience.js','hosting-stage.js','hosting-globe-scene.js','hosting-earth-data.js'])assert.ok(new RegExp(asset.replace('.','\\.')+'\\?v=[a-f0-9]{8}').test(html));
        assert.equal(parse(html).querySelector('#hosting-globe').querySelectorAll('[data-region]').length,F.groups().length);
        assert.equal(parse(html).querySelector('[data-globe="markers"]'),null);assert.equal(parse(html).querySelector('[data-globe="leaders"]'),null);
        assert.ok(!html.includes('hosting-terrain.js'));assert.ok(!html.includes('ht-stage'));
    });
    const early=fixture({delay:true,search:'?site=cold-lake'});early.approach();early.click('[data-region="dubai"]');early.release();await settle();await settle();
    check('choices made while modules load survive scene initialization and request a closer view',()=>{
        const scene=early.scenes.find(s=>s.kind==='globe');assert.equal(scene.current,'dubai');assert.equal(scene.selectionCalls.at(-1).focus,true);
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=dubai');
        assert.equal(early.ref('globe','location').value,'dubai');
    });
    const gs=early.scenes.find(s=>s.kind==='globe');gs.cb.onReady();
    check('context loss disables only 3D controls and restores the latest region',()=>{
        gs.cb.onError();const previous=gs.selections.length;early.click('[data-region="bakken"]');assert.equal(gs.selections.length,previous);assert.equal(early.ref('globe','reset').disabled,true);
        assert.equal(early.ref('globe','name').textContent,'Bakken');gs.cb.onRestore();gs.cb.onReady();assert.equal(gs.current,'bakken');assert.equal(gs.focused,true);assert.equal(early.ref('globe','reset').disabled,false);
    });
    check('mobile location choices, surface pins and region controls share the same selection',()=>{
        const location=early.ref('globe','location');
        assert.deepEqual(location.querySelectorAll('option').map(option=>option.value),F.groups().map(group=>group.id));
        location.value='alberta';location.fire('change');
        assert.equal(gs.selectionCalls.at(-1).focus,true,'the native selector focuses the chosen region');
        early.click('[data-hosting-site="cold-lake"]');
        assert.equal(gs.selectionCalls.at(-1).focus,true,'an Alberta site choice focuses its parent region');
        assert.equal(gs.current,'alberta');assert.equal(early.ref('globe','name').textContent,F.byId('cold-lake').name);
        assert.equal(early.ref('region','alberta').getAttribute('aria-pressed'),'true');
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=cold-lake');
        assert.equal(early.ref('globe','capacity').textContent,'400–600 kW');
        assert.equal(early.ref('globe','status').textContent,'Coming soon');
        early.click('[data-region="permian"]');assert.equal(location.value,'permian');assert.equal(gs.current,'permian');
        assert.equal(early.ref('globe','sites').hidden,true);
        gs.cb.onSelect('alberta');gs.cb.onFocus();assert.equal(location.value,'alberta');assert.equal(early.ref('region','alberta').getAttribute('aria-pressed'),'true');
        assert.equal(early.ref('globe','name').textContent,F.byId('cold-lake').name,'returning to Alberta preserves the selected proposed site');
        assert.equal(early.ref('globe','sites').hidden,false);
        early.click('[data-hosting-site="alberta"]');
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=alberta');
        assert.equal(early.ref('globe','capacity').textContent,'160 kW');
        assert.equal(early.ref('globe','status').textContent,'Fully occupied');
        assert.equal(early.document.querySelectorAll('[data-marker]').length,0,'the controller creates no floating callout buttons');
    });
    const deepLink=fixture({search:'?site=alberta-expansion'});deepLink.approach();await settle();await settle();
    check('passive Alberta deep links retain the whole globe through restoration',()=>{
        const scene=deepLink.scenes[0];
        assert.equal(scene.current,'alberta');assert.equal(scene.focused,false);
        assert.equal(deepLink.ref('globe','name').textContent,F.byId('alberta-expansion').name);
        assert.equal(deepLink.ref('globe','rate').textContent,'To be confirmed');
        scene.cb.onError();scene.cb.onRestore();scene.cb.onReady();
        assert.equal(scene.focused,false,'context restoration does not turn a passive deep link into a focus action');
        assert.equal(deepLink.ref('globe','cta').getAttribute('href'),'./hardware.html?site=alberta-expansion');
    });
    check('Reset restores overview while retaining the selected Alberta subsite',()=>{
        const scene=deepLink.scenes[0];deepLink.click('[data-hosting-site="alberta-expansion"]');assert.equal(scene.focused,true);
        deepLink.click('[data-globe="reset"]');assert.equal(scene.focused,false);
        assert.equal(deepLink.ref('globe','location').value,'alberta');assert.equal(deepLink.ref('globe','name').textContent,F.byId('alberta-expansion').name);
        scene.cb.onError();scene.cb.onRestore();scene.cb.onReady();assert.equal(scene.focused,false,'the last Reset survives context restoration');
        scene.cb.onSelect('dubai');scene.cb.onFocus();scene.cb.onError();scene.cb.onRestore();scene.cb.onReady();
        assert.equal(scene.current,'dubai');assert.equal(scene.focused,true,'a subsequent surface pin focus survives context restoration');
        deepLink.click('[data-region="alberta"]');assert.equal(deepLink.ref('globe','cta').getAttribute('href'),'./hardware.html?site=alberta-expansion');
    });
    const pendingMobile=fixture({delay:true});pendingMobile.approach();pendingMobile.ref('globe','location').value='alberta';pendingMobile.ref('globe','location').fire('change');pendingMobile.click('[data-hosting-site="cold-lake"]');pendingMobile.release();await settle();await settle();
    check('mobile and Alberta site choices made before loading retain their focus request',()=>{
        assert.equal(pendingMobile.scenes[0].current,'alberta');assert.equal(pendingMobile.scenes[0].focused,true);
        assert.equal(pendingMobile.ref('globe','cta').getAttribute('href'),'./hardware.html?site=cold-lake');
    });
    const offline=fixture({fail:true});offline.approach();await settle();await settle();
    check('import failure leaves all regional pricing usable',()=>{
        for(const site of F.all()){
            const group=F.groupFor(site),location=offline.ref('globe','location');location.value=group.id;location.fire('change');
            if(group.sites.length>1)offline.click('[data-hosting-site="'+site.id+'"]');
            assert.equal(offline.ref('region',group.id).getAttribute('aria-pressed'),'true');
            assert.equal(offline.ref('globe','capacity').textContent,F.capacityLabel(site));assert.equal(offline.ref('globe','rate').textContent,F.powerLabel(site));assert.equal(offline.ref('globe','cta').getAttribute('href'),'./hardware.html?site='+site.id);
            assert.equal(offline.ref('globe','capacity-title').textContent,F.capacityTitle(site));
            assert.equal(offline.ref('globe','status').getAttribute('data-available'),String(F.acceptsMachines(site)));
            offline.click('[data-region="'+group.id+'"]');assert.equal(location.value,group.id);
        }
    });
    check('back-forward cache preserves scenes while final navigation disposes the globe and its field',()=>{
        early.events.pagehide({persisted:true});assert.ok(early.scenes.every(s=>!s.disposed));early.events.pagehide({persisted:false});assert.ok(early.scenes.every(s=>s.disposed));assert.ok(early.fields.every(f=>f.disposed));
    });
    const leaving=fixture({delay:true});leaving.approach();leaving.events.pagehide({persisted:false});leaving.release();await settle();await settle();
    check('late imports do not create renderers after the page is gone',()=>{assert.equal(leaving.scenes.length,0);});
    console.log('\n'+passed+' hosting experience checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
