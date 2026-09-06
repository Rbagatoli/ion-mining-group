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
(async()=>{
    const globe=await import('../../site/hosting-globe-scene.js'),world=await import('../../site/hosting-world-data.js');
    const T=await import('../../site/vendor/three-0.185.1/three.module.min.js');
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
        assert.ok(count>4000&&count<15000);
    });
    check('generated globe preserves commercial disclosures, destinations and stamped modules',()=>{
        assert.ok(!html.includes('hosting-tour'));assert.ok(!html.includes('data-tour'));assert.ok(!fs.existsSync(__dirname+'/../../site/hosting-tour-scene.js'));assert.ok(html.includes('Markers identify regions, not exact facilities.'));assert.ok(html.includes(F.INDICATIVE_NOTE));
        for(const asset of ['hosting-experience.js','hosting-stage.js','hosting-globe-scene.js','hosting-world-data.js'])assert.ok(new RegExp(asset.replace('.','\\.')+'\\?v=[a-f0-9]{8}').test(html));
        assert.equal(parse(html).querySelector('#hosting-globe').querySelectorAll('[data-region]').length,F.all().length);
        assert.ok(!html.includes('hosting-terrain.js'));assert.ok(!html.includes('ht-stage'));
    });
    const early=fixture({delay:true,search:'?site=cold-lake'});early.approach();early.click('[data-region="niger-delta"]');early.release();await settle();await settle();
    check('choices made while modules load survive scene initialization',()=>{
        assert.equal(early.scenes.find(s=>s.kind==='globe').current,'niger-delta');
        assert.equal(early.ref('globe','cta').getAttribute('href'),'./hardware.html?site=niger-delta');
    });
    const gs=early.scenes.find(s=>s.kind==='globe');gs.cb.onReady();
    check('context loss disables only 3D controls and restores the latest region',()=>{
        gs.cb.onError();const previous=gs.selections.length;early.click('[data-region="bakken"]');assert.equal(gs.selections.length,previous);assert.equal(early.ref('globe','reset').disabled,true);
        assert.equal(early.ref('globe','name').textContent,'Bakken');gs.cb.onRestore();gs.cb.onReady();assert.equal(gs.current,'bakken');assert.equal(early.ref('globe','reset').disabled,false);
    });
    const offline=fixture({fail:true});offline.approach();await settle();await settle();
    check('import failure leaves all regional pricing usable',()=>{
        for(const site of F.all()){offline.click('[data-region="'+site.id+'"]');assert.equal(offline.ref('globe','capacity').textContent,F.capacityLabel(site));assert.equal(offline.ref('globe','rate').textContent,F.powerLabel(site));assert.equal(offline.ref('globe','cta').getAttribute('href'),'./hardware.html?site='+site.id);}
    });
    check('back-forward cache preserves scenes while final navigation disposes the globe and its field',()=>{
        early.events.pagehide({persisted:true});assert.ok(early.scenes.every(s=>!s.disposed));early.events.pagehide({persisted:false});assert.ok(early.scenes.every(s=>s.disposed));assert.ok(early.fields.every(f=>f.disposed));
    });
    const leaving=fixture({delay:true});leaving.approach();leaving.events.pagehide({persisted:false});leaving.release();await settle();await settle();
    check('late imports do not create renderers after the page is gone',()=>{assert.equal(leaving.scenes.length,0);});
    console.log('\n'+passed+' hosting experience checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
