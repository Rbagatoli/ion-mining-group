/* Regional geometry and the generated picker, exercised independently of a GPU. */
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const {Element,parse}=require('./helpers/terrain-dom.js');
const F=require('../../site/facilities.js');
const html=fs.readFileSync(__dirname+'/../../site/hosting.html','utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('  ok    '+name);}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(terrain,core,options={}) {
    const document=parse(html),observers=[],scenes=[],imports=[],pending=[],events={};
    document.getElementById=id=>document.querySelector('#'+id);document.createElementNS=(_,tag)=>new Element(tag);
    const tag=html.match(/<script src="\.\/hosting-terrain\.js[^>]+>/)[0];
    document.currentScript=new Element('script',Object.fromEntries([...tag.matchAll(/(data-[\w-]+)="([^"]+)"/g)].map(m=>[m[1],m[2]])));
    const coreURL=document.currentScript.getAttribute('data-core-src');
    const field={dispose(){this.disposed=true;}};
    const mockedCore={buildYard:core.buildYard,mountMineScene(host,callbacks){
        const canvas=new Element('canvas');host.appendChild(canvas);
        const scene={configs:[],zooms:[],callbacks,focused:null,inside:false,
            setConfig(config,options){if(this.key===config.sceneKey)return;this.key=config.sceneKey;this.configs.push({config,options});this.yard=callbacks.buildScene(config);callbacks.onInspect(false);},
            setAnnotations(value){this.annotations=value;},
            energize(value){this.powered=value;},
            setActive(value){this.active=value;if(value)callbacks.onReady();},
            inspect(value){this.inside=value;callbacks.onPart(null);callbacks.onInspect(value);},
            highlightPart(value){callbacks.onPart(value||this.focused);},
            focusPart(value,toggle=true){this.focused=toggle&&this.focused===value?null:value;callbacks.onInspect(false);callbacks.onPart(this.focused);},
            setXray(value){this.xray=value;callbacks.onXray(value);},
            reset(){this.focused=null;this.inside=false;callbacks.onPart(null);callbacks.onInspect(false);},
            zoom(value){this.zooms.push(value);},dispose(){this.disposed=true;canvas.remove();}};
        scenes.push(scene);return scene;
    }};
    const sandbox={document,location:{search:options.search||''},console,
        Facilities:{...F,choose(){throw new Error('Exploration must not select an order destination');},chosen(){throw new Error('Exploration must not read or update saved order state');}},
        ProtonField:{mount:()=>field},
        IntersectionObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(el){this.el=el;}disconnect(){this.disconnected=true;}},
        addEventListener:(name,fn)=>{events[name]=fn;},
        loadModule(url){imports.push(url);if(options.fail)return Promise.reject(new Error('offline'));const value=url===coreURL?mockedCore:terrain;return options.delay?new Promise(resolve=>pending.push(()=>resolve(value))):Promise.resolve(value);}
    };
    sandbox.window=sandbox;vm.createContext(sandbox);
    const source=fs.readFileSync(__dirname+'/../../site/hosting-terrain.js','utf8').replace(/import\((moduleURL|coreURL)\)/g,'loadModule($1)');
    new vm.Script(source).runInContext(sandbox);
    const root=document.getElementById('hosting-terrain');
    return {root,document,observers,scenes,imports,field,events,ref:name=>root.querySelector('[data-ht="'+name+'"]'),
        region:id=>root.querySelector('[data-region="'+id+'"]'),part:id=>root.querySelector('[data-part="'+id+'"]'),
        approach(){observers[0].fn([{isIntersecting:true}]);},release(){pending.forEach(resolve=>resolve());}};
}

(async()=>{
    const T=await import('../../site/vendor/three-0.185.1/three.module.min.js');
    const core=await import('../../site/mine-builder-scene.js'),terrain=await import('../../site/hosting-terrain-scene.js');
    const fingerprints=new Set();
    check('every listed hosting region has its own local terrain model',()=>{
        assert.deepEqual(Object.keys(terrain.REGIONS),F.all().map(s=>s.id));
        assert.throws(()=>terrain.buildHostingTerrain({region:'unknown'},core.buildYard));
    });
    for(const site of F.all()){
        const yard=terrain.buildHostingTerrain({region:site.id},core.buildYard);
        check(site.id+' has distinct, finite terrain and bounded rendering cost',()=>{
            let draws=0,triangles=0;
            yard.root.traverse(o=>{
                for(const value of o.matrixWorld.elements)assert.ok(Number.isFinite(value));
                if(o.geometry)for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
                if(o.isInstancedMesh)for(const value of o.instanceMatrix.array)assert.ok(Number.isFinite(value));
                if(o.isMesh){draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
            });
            assert.ok(draws<650);assert.ok(triangles<325000);
            const hash=crypto.createHash('sha256').update(Buffer.from(yard.terrain.geometry.attributes.position.array.buffer)).digest('hex');
            assert.ok(!fingerprints.has(hash));fingerprints.add(hash);
            assert.equal(yard.bounds.min.x,-54);assert.equal(yard.bounds.max.x,54);assert.equal(yard.bounds.min.z,-43);assert.equal(yard.bounds.max.z,43);
        });
        check(site.id+' keeps infrastructure above the terrain with complete callout bounds',()=>{
            assert.equal(yard.containers.length,6);
            for(const unit of yard.containers){
                assert.equal(unit.cooling,'hydro');assert.ok(unit.root.getObjectByName('hydro-manifolds'));
                const box=new T.Box3().setFromObject(unit.root),point=box.getCenter(new T.Vector3());
                assert.ok(box.min.y>terrain.terrainHeight(site.id,point.x,point.z));
                assert.ok(yard.targetBounds.load.containsBox(box));
            }
            for(const id of ['gas','gen','load','xfmr'])assert.ok(!yard.targetBounds[id].isEmpty());
            assert.equal(yard.targetRegions.load.length,6);assert.equal(yard.targetRegions.gas.length,2);
            const opacity=yard.terrain.material.opacity;core.setSceneXray(yard,true);
            assert.equal(yard.terrain.material.opacity,opacity);assert.equal(yard.containers[0].skinMaterials[0].opacity,.15);
        });
        check(site.id+' fits desktop and mobile frames throughout the full orbit',()=>{
            for(const aspect of [1142/570,348/409.5]){
                const pose=core.yardCameraPose(yard,aspect),camera=new T.PerspectiveCamera(38,aspect,.1,1000);
                for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
                    camera.position.copy(pose.position).sub(pose.target).applyAxisAngle(new T.Vector3(0,1,0),angle).add(pose.target);
                    camera.lookAt(pose.target);camera.updateMatrixWorld();
                    for(const x of [yard.bounds.min.x,yard.bounds.max.x])for(const y of [yard.bounds.min.y,yard.bounds.max.y])for(const z of [yard.bounds.min.z,yard.bounds.max.z]){
                        const p=new T.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.94 && Math.abs(p.y)<.92);
                    }
                }
            }
        });
    }
    check('the generated explorer discloses illustrative terrain and indicative figures beside its CTA',()=>{
        const region=html.split('<!-- hosting-terrain:begin -->')[1].split('<!-- hosting-terrain:end -->')[0];
        assert.match(region,/not a survey of an actual facility/);assert.ok(region.includes(F.INDICATIVE_NOTE));
        assert.equal((region.match(/data-region=/g)||[]).length,5);
        assert.match(html,/data-module-src="\.\/hosting-terrain-scene\.js\?v=[a-f0-9]+" data-core-src="\.\/mine-builder-scene\.js\?v=[a-f0-9]+"/);
        for(const site of F.all())assert.ok(html.includes('href="./hardware.html?site='+site.id+'"'));
    });
    const ui=fixture(terrain,core);
    check('region details work before lazy WebGL loads and never select an order destination',()=>{
        assert.equal(ui.imports.length,0);ui.region('bakken').fire('click');
        assert.equal(ui.ref('name').textContent,'Bakken');assert.equal(ui.ref('rate').textContent,F.powerLabel(F.byId('bakken')));
        assert.equal(ui.ref('inspect').disabled,true);
    });
    ui.approach();await settle();
    check('the first viewport entry mounts one shared scene with the latest selected region',()=>{
        assert.equal(ui.scenes.length,1);assert.equal(ui.imports.length,2);assert.equal(ui.scenes[0].yard.region,'bakken');
        assert.equal(ui.root.classList.contains('ht-ready'),true);assert.equal(ui.ref('inspect').disabled,false);assert.equal(ui.ref('fallback').hidden,true);
        assert.equal(ui.scenes[0].powered,true);assert.equal(ui.ref('xray').getAttribute('aria-pressed'),'false');
    });
    check('all region choices update scene and commercial details with preserved camera options',()=>{
        for(const site of F.all()){
            ui.region(site.id).fire('click');
            assert.equal(ui.ref('name').textContent,site.name);assert.equal(ui.ref('capacity').textContent,F.capacityLabel(site));
            assert.equal(ui.ref('rate').textContent,F.powerLabel(site));assert.equal(ui.ref('status').textContent,site.status);
            assert.equal(ui.ref('cta').getAttribute('href'),'./hardware.html?site='+site.id);
            assert.equal(ui.scenes[0].yard.region,site.id);assert.equal(ui.scenes[0].configs.at(-1).options.preserveView,true);
        }
        assert.equal(ui.scenes.length,1);assert.equal(ui.imports.length,2);
    });
    check('callouts highlight on hover, focus on click, and keep that focus across regions',()=>{
        ui.part('load').fire('pointerenter');assert.equal(ui.part('load').classList.contains('is-hot'),true);
        ui.part('load').fire('click');assert.equal(ui.scenes[0].focused,'load');
        ui.region('alberta').fire('click');assert.equal(ui.scenes[0].focused,'load');
        assert.equal(ui.part('load').getAttribute('aria-pressed'),'true');
    });
    check('interior, X-ray, zoom and Reset remain available in the same view',()=>{
        ui.ref('inspect').fire('click');assert.equal(ui.ref('inspect').textContent,'Return to landscape');
        ui.region('cold-lake').fire('click');assert.equal(ui.scenes[0].inside,true);
        ui.ref('xray').fire('click');assert.equal(ui.ref('xray').getAttribute('aria-pressed'),'true');
        ui.ref('in').fire('click');ui.ref('out').fire('click');assert.deepEqual(ui.scenes[0].zooms,[.8,1.25]);
        ui.ref('reset').fire('click');assert.equal(ui.scenes[0].inside,false);assert.equal(ui.scenes[0].focused,null);
    });
    check('keyboard region navigation wraps without requiring a pointer',()=>{
        ui.region('cold-lake').fire('keydown',{key:'End'});assert.equal(ui.ref('name').textContent,'Niger Delta');
        ui.region('niger-delta').fire('keydown',{key:'ArrowRight'});assert.equal(ui.ref('name').textContent,'Permian Basin');
        assert.equal(ui.document.activeElement,ui.region('permian'));
    });
    const delayed=fixture(terrain,core,{delay:true});delayed.approach();delayed.region('niger-delta').fire('click');delayed.release();await settle();
    check('a region picked during module loading wins the loading race',()=>assert.equal(delayed.scenes[0].yard.region,'niger-delta'));
    const failed=fixture(terrain,core,{fail:true});failed.approach();await settle();
    check('module failure retains the matching rate, availability and catalogue link for every region',()=>{
        assert.equal(failed.root.classList.contains('ht-ready'),false);assert.match(failed.ref('message').textContent,/unavailable/);
        for(const site of F.all()){
            failed.region(site.id).fire('click');assert.equal(failed.ref('rate').textContent,F.powerLabel(site));
            assert.equal(failed.ref('cta').getAttribute('href'),'./hardware.html?site='+site.id);
        }
        assert.equal(failed.ref('inspect').disabled,true);
    });
    check('context loss disables scene controls and recovery reuses the existing renderer',()=>{
        ui.scenes[0].callbacks.onError();assert.equal(ui.ref('inspect').disabled,true);
        ui.region('cold-lake').fire('click');assert.equal(ui.ref('inspect').disabled,true);assert.equal(ui.ref('fallback').hidden,false);
        ui.scenes[0].callbacks.onRestore();assert.equal(ui.ref('inspect').disabled,false);assert.equal(ui.scenes.length,1);
    });
    check('back-forward cache keeps the scene, while leaving the page disposes its resources',()=>{
        ui.events.pagehide({persisted:true});assert.ok(!ui.scenes[0].disposed);
        ui.events.pagehide({persisted:false});assert.equal(ui.scenes[0].disposed,true);assert.equal(ui.field.disposed,true);
    });
    console.log('\n  '+passed+' hosting terrain checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
