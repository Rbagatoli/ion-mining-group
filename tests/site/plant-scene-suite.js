/* Real geometry, camera math and OrbitControls; only GPU / browser primitives
   are substituted. Events follow ancestor capture and bubble phases. */
const fs = require('fs'), assert = require('assert/strict');
const M = require('../../site/mine-builder-model.js');
const files = {site:'site',hosting:'hosting',asic:'asic',landfill:'landfill-ion',pad:'pad-ion'};
const definition = view => ({main:require('../../site/scene-'+files[view]+'.js'),
    before:['landfill','pad'].includes(view) ? require('../../site/scene-'+view+'-now.js') : null});
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ok    ' + name); }
class Surface {
    constructor() { this.listeners = {}; this.style = {}; this.attrs = {}; this.clientWidth = 1280; this.clientHeight = 470; }
    appendChild(child) { child.parentElement = this; child.ownerDocument = this.ownerDocument || this; this.canvas = child; }
    getRootNode() { return this.ownerDocument || this; }
    addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({fn,capture:!!(options === true || options?.capture)}); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x.fn !== fn); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    setPointerCapture() {} releasePointerCapture() {}
    remove() { this.removed = true; }
    getBoundingClientRect() { return {left:0,top:0,width:this.clientWidth,height:this.clientHeight}; }
    fire(type, extra = {}) {
        const event = {type,target:this,deltaMode:0,ctrlKey:false,metaKey:false,...extra,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.stopped = true; },
            stopImmediatePropagation() { this.stopped = true; this.immediate = true; }};
        const path = []; for (let node = this; node; node = node.parentElement) path.push(node);
        const invoke = (node,capture) => {
            event.currentTarget = node;
            for (const l of [...(node.listeners[type] || [])]) if (l.capture === capture) {
                l.fn.call(node,event); if (event.immediate) break;
            }
        };
        for (const node of [...path].reverse()) { invoke(node,true); if (event.stopped) return event; }
        for (const node of path) { invoke(node,false); if (event.stopped) break; }
        return event;
    }
}
(async () => {
    const T = await import('../../site/vendor/three-0.185.1/three.module.min.js');
    const {OrbitControls} = await import('../../site/vendor/three-0.185.1/OrbitControls.js');
    const shared = await import('../../site/mine-builder-scene.js');
    const {buildYard,yardCameraPose,setSceneXray,setSceneProgress,wheelZoomFactor} = shared;
    const buildPresentation = view => shared.buildPresentation(view,definition(view));
    check('hydro, air and immersion use physically distinct equipment', () => {
        const hydro = buildYard(M.estimate({cooling:'hydro'})).containers[0].root;
        const air = buildYard(M.estimate({cooling:'air'})).containers[0].root;
        const immersion = buildYard(M.estimate({cooling:'immersion'})).containers[0].root;
        for (const name of ['hydro-manifolds','coolant-distribution-unit','closed-loop-dry-cooler']) assert.ok(hydro.getObjectByName(name),name);
        assert.equal(hydro.getObjectByName('air-exhaust'),undefined);
        assert.equal(hydro.getObjectByName('air-intake-filters'),undefined);
        for (const name of ['air-exhaust','air-intake-filters']) assert.ok(air.getObjectByName(name),name);
        assert.equal(air.getObjectByName('closed-loop-dry-cooler'),undefined);
        assert.equal(air.getObjectByName('hydro-manifolds'),undefined);
        assert.ok(immersion.getObjectByName('immersion-tanks'));
        assert.equal(immersion.getObjectByName('miner-racks'),undefined);
    });
    check('all presentations have finite geometry and preserve authored equipment locations', () => {
        for (const view of Object.keys(files)) {
            const scene = buildPresentation(view), main = definition(view).main;
            scene.root.traverse(object => {
                for (const n of object.matrixWorld.elements) assert.ok(Number.isFinite(n));
                if (object.geometry) for (const n of object.geometry.attributes.position.array) assert.ok(Number.isFinite(n) && Math.abs(n)<1000,view);
                if (object.isInstancedMesh) for (const n of object.instanceMatrix.array) assert.ok(Number.isFinite(n));
            });
            if (['site','landfill','pad'].includes(view)) {
                const positions = main.CONTAINERS || main.scene.renderables.filter(r => /^cont\d*$/.test(r.id)).map(r => ({x:r.at[0],z:r.at[2]}));
                assert.equal(scene.containers.length,positions.length);
                positions.forEach((p,i) => { assert.equal(scene.containers[i].root.position.x,p.x); assert.equal(scene.containers[i].root.position.z,p.z); });
            }
        }
    });
    check('desktop camera reproduces the original projection at several orbit angles', () => {
        for (const view of Object.keys(files)) {
            const scene = buildPresentation(view), main = definition(view).main, v = main.scene.view;
            const pose = yardCameraPose(scene,v.VB.w/v.VB.h), camera = new T.PerspectiveCamera(pose.fov,v.VB.w/v.VB.h,.1,1000);
            camera.setViewOffset(v.VB.w,v.VB.h,0,pose.verticalOffset*v.VB.h,v.VB.w,v.VB.h);
            for (const yaw of [0,.4,1.6]) {
                camera.position.copy(pose.position).sub(pose.target).applyAxisAngle(new T.Vector3(0,1,0),-yaw).add(pose.target);
                camera.lookAt(pose.target); camera.updateMatrixWorld();
                for (const co of main.CALLOUTS) {
                    const expected = main.project(co.at,yaw), actual = new T.Vector3(...co.at).project(camera);
                    assert.ok(Math.abs((actual.x+1)/2*v.VB.w-expected[0])<.001,view+' x '+co.id);
                    assert.ok(Math.abs((1-actual.y)/2*v.VB.h-expected[1])<.001,view+' y '+co.id);
                }
            }
            const phone = yardCameraPose(scene,350/310);
            assert.ok(phone.position.distanceTo(phone.target)>pose.position.distanceTo(pose.target));
            assert.equal(phone.verticalOffset,0);
        }
    });
    check('detailed utilities share the same models across layouts and retain their authored positions', () => {
        for (const view of ['site','landfill','pad']) {
            const scene = buildPresentation(view), main = definition(view).main;
            for (const [id,name] of [['gen','generator-package'],[view === 'site' ? 'gas' : 'cond','gas-treatment-skid'],['xfmr','transformer-package']]) {
                const original = main.scene.renderables.find(r => r.id === id), model = scene.targets[id].getObjectByName(name);
                assert.ok(model,view+' '+id); assert.equal(model.position.x,original.at[0]); assert.equal(model.position.z,original.at[2]);
                const size = new T.Box3().setFromObject(model).getSize(new T.Vector3());
                assert.ok(size.y>1.5 && size.y<4 && size.x<6,'detailed fittings stay within the existing utility train');
            }
        }
        const yard = buildYard(M.estimate({powerMW:30}));
        assert.equal(yard.containers.length,12);
        let draws = 0, triangles = 0;
        yard.root.traverse(o => { if (o.isMesh) { draws++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count)/3*(o.isInstancedMesh ? o.count : 1); } });
        assert.ok(draws<1100 && triangles<500000,'instancing keeps the maximum representative yard bounded');
        assert.ok(yard.targets.gen.getObjectByName('generator-package'));
        const grid = buildYard(M.estimate({source:'grid'}));
        assert.equal(grid.targets.gen.getObjectByName('generator-package'),undefined);
        assert.equal(grid.targets.gas.children.length,0,'grid configuration has no gas conditioning equipment');
    });
    check('landfill wells stay on the original cap and collection laterals clear its surface', () => {
        const scene = buildPresentation('landfill'), d = definition('landfill').before;
        const G = require('../../site/landfill-geometry.js'), original = d.regionBoxes('wells');
        assert.equal(scene.targets.wells.children.length,original.length);
        scene.targets.wells.children.forEach((well,i) => {
            assert.deepEqual(well.position.toArray(),[original[i].x,original[i].y,original[i].z]);
            assert.ok(Math.abs(well.position.y-G.capHeightAt(well.position.x,well.position.z))<1e-9);
        });
        for (const mesh of scene.targets.header.children) if (mesh.geometry?.parameters?.path) {
            for (const p of mesh.geometry.parameters.path.getPoints(500)) assert.ok(p.y-G.capHeightAt(p.x,p.z)>.02,'collection pipe must not run through the solid cap');
        }
        const source = [scene.targets.wells,scene.targets.header,scene.targets.blower,scene.targets.flare];
        const before = [];
        source.forEach(group => group.traverse(o => { if (o.material) before.push([o.material,o.material.opacity]); }));
        for (const progress of [0,.5,1]) { setSceneProgress(scene,progress); before.forEach(([mat,opacity]) => assert.equal(mat.opacity,opacity,'existing source equipment does not fade with the added mine')); }
    });
    check('the single hydro machine has three board layers, two ports and no fans', () => {
        const scene = buildPresentation('asic');
        assert.equal(scene.fans.length,0); assert.ok(scene.targets.ports); assert.equal(scene.targets.boards.children.length,3);
        assert.equal(scene.containers[0].kind,'machine');
    });
    check('X-ray reveals the shell and keeps infrastructure opaque, including after comparison fades', () => {
        for (const view of ['hosting','landfill']) {
            const scene = buildPresentation(view), before = scene.mats.copper.opacity;
            setSceneXray(scene,true); setSceneProgress(scene,.5); setSceneProgress(scene,1);
            scene.containers[0].skinMaterials.forEach(m => { assert.ok(m.opacity<.2); assert.equal(m.depthWrite,false); });
            assert.equal(scene.mats.copper.opacity,before); assert.equal(scene.mats.miner.transparent,false);
            for (const mat of scene.miningMaterials || []) if (mat.isLineBasicMaterial) assert.equal(mat.opacity,mat.userData.baseOpacity);
            setSceneXray(scene,false);
            scene.containers[0].skinMaterials.forEach(m => { assert.equal(m.opacity,1); assert.equal(m.depthWrite,true); });
        }
    });
    check('every original callout maps to a real component or authored bounds', () => {
        for (const view of Object.keys(files)) {
            const scene = buildPresentation(view);
            for (const d of Object.values(definition(view)).filter(Boolean)) for (const c of d.CALLOUTS) assert.ok(scene.targets[c.id],view+': '+c.id);
        }
    });
    check('wheel units normalize and browser zoom modifiers remain untouched', () => {
        assert.equal(wheelZoomFactor({deltaY:1,deltaMode:1}),wheelZoomFactor({deltaY:16,deltaMode:0}));
        assert.ok(wheelZoomFactor({deltaY:-120})<1); assert.ok(wheelZoomFactor({deltaY:120})>1);
        assert.equal(wheelZoomFactor({deltaY:120,ctrlKey:true}),1);
        assert.equal(wheelZoomFactor({deltaY:120,metaKey:true}),1);
        assert.equal(wheelZoomFactor({deltaY:NaN}),1);
    });

    let renderer, controls, observer, rafID = 0;
    const frames = new Map(), document = new Surface(), media = new Surface();
    document.hidden = false; media.matches = true;
    const window = {devicePixelRatio:2,matchMedia:() => media};
    class Renderer {
        constructor() { renderer = this; this.domElement = new Surface(); this.shadowMap = {}; }
        setPixelRatio() {} setSize() {} dispose() { this.disposed = true; }
        render(world, camera) { world.updateMatrixWorld(); camera.updateMatrixWorld(); this.world = world; this.camera = camera; }
    }
    class Controls extends OrbitControls { constructor(...args) { super(...args); controls = this; } }
    class Environment extends T.Scene { dispose() {} }
    class PMREM { fromScene() { return {texture:null,dispose() {}}; } dispose() {} }
    class Resize { observe() {} disconnect() {} }
    class Intersection { constructor(fn) { this.fn = fn; observer = this; } observe() {} disconnect() {} }
    const source = fs.readFileSync(__dirname+'/../../site/mine-builder-scene.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
    const mount = new Function('THREE','OrbitControls','RoomEnvironment','window','document','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame',
        source+'\nreturn mountMineScene;')({...T,WebGLRenderer:Renderer,PMREMGenerator:PMREM},Controls,Environment,window,document,Resize,Intersection,
            fn => { frames.set(++rafID,fn); return rafID; },id => frames.delete(id));
    let time = 0;
    function step(ms = 16) { time += ms; const batch = [...frames]; frames.clear(); batch.forEach(([,fn]) => fn(time)); }
    function advance(ms) { for (let n = 0; n < ms; n += 16) step(Math.min(16,ms-n)); }
    function flush() { let count = 0; while (frames.size && count++<100) step(); assert.ok(count<100,'render loop settles under reduced motion'); }
    const panel = new Surface(), host = new Surface(), callout = new Surface();
    document.appendChild(panel); panel.appendChild(host); panel.appendChild(callout);
    const events = []; let projected = [];
    const api = mount(host,{interactionSurface:panel,onProject:v => { projected = v; },onInspect:v => events.push(['inspect',v]),onXray:v => events.push(['xray',v]),onError:() => events.push(['error'])});
    api.setConfig(M.estimate({powerMW:1})); api.setActive(true); flush();
    check('wheel on canvas, labels and panel background zooms exactly once with real OrbitControls', () => {
        for (const surface of [host.canvas,callout,panel]) for (const deltaY of [-120,120]) {
            const before = renderer.camera.position.distanceTo(controls.target);
            const e = surface.fire('wheel',{deltaY}); flush();
            const actual = renderer.camera.position.distanceTo(controls.target);
            assert.ok(Math.abs(actual/before-wheelZoomFactor(e))<1e-9,'no competing native dolly');
            assert.equal(e.defaultPrevented,true); assert.equal(e.stopped,true);
        }
    });
    check('Ctrl/Cmd-wheel preserves browser zoom; model limits never scroll the page under the pointer', () => {
        const before = renderer.camera.position.clone();
        for (const key of ['ctrlKey','metaKey']) assert.ok(!host.canvas.fire('wheel',{deltaY:120,[key]:true}).defaultPrevented);
        assert.ok(renderer.camera.position.equals(before));
        api.zoom(100000); flush();
        assert.equal(host.canvas.fire('wheel',{deltaY:120}).defaultPrevented,true);
        assert.ok(Math.abs(renderer.camera.position.distanceTo(controls.target)-controls.maxDistance)<1e-9);
        api.zoom(.000001); flush(); assert.equal(callout.fire('wheel',{deltaY:-120}).defaultPrevented,true);
        assert.ok(Math.abs(renderer.camera.position.distanceTo(controls.target)-controls.minDistance)<1e-9);
        assert.ok(!document.fire('wheel',{deltaY:120}).defaultPrevented,'outside rendering still scrolls');
    });
    check('Build your mine keeps Inside, keyboard X-ray and Reset', () => {
        api.inspect(true); flush();
        assert.ok(renderer.world.getObjectByName('removable-roof').position.y>2);
        assert.equal(renderer.world.getObjectByName('service-wall').visible,false);
        host.canvas.fire('keydown',{key:'x'}); flush(); assert.deepEqual(events.at(-1),['xray',true]);
        api.reset(); flush();
        assert.equal(renderer.world.getObjectByName('removable-roof').position.y,0);
        assert.equal(renderer.world.getObjectByName('service-wall').visible,true);
    });
    check('changing the selected miner rebuilds its corresponding cooling design', () => {
        api.setConfig(M.estimate({cooling:'air'})); flush();
        assert.ok(renderer.world.getObjectByName('air-intake-filters')); assert.equal(renderer.world.getObjectByName('hydro-manifolds'),undefined);
        api.setConfig(M.estimate({cooling:'hydro'})); flush(); assert.ok(renderer.world.getObjectByName('hydro-manifolds'));
    });
    check('existing views use X-ray without lifting roofs or entering containers', () => {
        api.setConfig({view:'site',definition:definition('site')}); flush();
        const before = renderer.camera.position.clone(); api.inspect(true); flush();
        assert.equal(renderer.world.getObjectByName('removable-roof').position.y,0);
        assert.equal(renderer.world.getObjectByName('service-wall').visible,true);
        assert.ok(renderer.camera.position.distanceTo(before)<1e-9); assert.deepEqual(events.at(-1),['xray',true]);
    });
    check('callout leaders track their equipment when zooming and rotating', () => {
        api.setAnnotations(definition('site').main.CALLOUTS); flush();
        const before = JSON.stringify(projected); assert.equal(projected.length,8); assert.ok(projected.every(p => p.visible));
        let anchor; renderer.world.traverse(o => { if (o.userData.containerIndex === 2) anchor = o; });
        const pdu = new T.Box3().setFromObject(anchor.getObjectByName('metered-power')).getCenter(new T.Vector3()).project(renderer.camera);
        assert.ok(Math.abs(projected.find(p => p.id === 'pdu').x-(pdu.x+1)/2)<1e-9,'leader follows the new PDU position');
        callout.fire('wheel',{deltaY:-120}); flush(); assert.notEqual(JSON.stringify(projected),before);
        const zoomed = JSON.stringify(projected); host.canvas.fire('keydown',{key:'ArrowRight'}); flush(); assert.notEqual(JSON.stringify(projected),zoomed);
        assert.ok(projected.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    });
    check('hover highlights the entire section with a filled region and restores it on leave', () => {
        api.highlightPart('gen'); flush();
        const highlight = renderer.world.getObjectByName('section-highlight'), volume = highlight.children.find(o => o.isInstancedMesh);
        assert.ok(volume.count > 0); assert.ok(volume.material.opacity >= .1); assert.equal(volume.material.depthTest,false);
        assert.ok(highlight.children.some(o => o instanceof T.Box3Helper));
        const size = new T.Box3().setFromObject(volume).getSize(new T.Vector3());
        assert.ok(size.x>5 && size.y>3,'covers the whole generator, including its exhaust, rather than a point at the leader');
        api.highlightPart('pdu'); flush();
        assert.equal(renderer.world.getObjectByName('section-highlight').children.find(o => o.isInstancedMesh).count,4,'every container PDU highlights together');
        api.highlightPart(null); flush(); assert.equal(renderer.world.getObjectByName('section-highlight'),undefined);
    });
    check('before / after preserves source equipment and camera, and retains the flare', () => {
        api.setConfig({view:'landfill',definition:definition('landfill')}); flush();
        const world = renderer.world, cell = world.getObjectByName('cell'), matrix = cell.matrixWorld.clone(), camera = renderer.camera.position.clone();
        api.setProgress(0); flush(); assert.equal(world.getObjectByName('proton-deployment').visible,false);
        api.setProgress(1); flush(); assert.equal(world.getObjectByName('proton-deployment').visible,true);
        world.updateMatrixWorld(true); assert.ok(cell.matrixWorld.equals(matrix)); assert.ok(renderer.camera.position.distanceTo(camera)<1e-9);
        assert.ok(world.getObjectByName('flare'));
        api.highlightPart('load'); flush();
        const fill = world.getObjectByName('section-highlight').children.find(o => o.isInstancedMesh);
        assert.equal(fill.count,4,'all four containers highlighted as one section');
        api.highlightPart(null); flush();
    });
    check('all scenes start energized, and normal motion automatically rotates the view', () => {
        api.setConfig({view:'site',definition:definition('site')}); flush();
        media.fire('change',{matches:false});
        const before = renderer.camera.position.clone(), radius = before.distanceTo(controls.target), rotor = renderer.world.getObjectByName('rotor'), rotation = rotor.rotation.y;
        advance(1000);
        assert.ok(renderer.camera.position.distanceTo(before)>1); assert.ok(Math.abs(renderer.camera.position.distanceTo(controls.target)-radius)<1e-8);
        assert.ok(rotor.rotation.y-rotation>8,'powered fans move without an Energize click');
    });
    check('scroll pauses rotation briefly, then resumes at the chosen zoom and angle', () => {
        callout.fire('wheel',{deltaY:-120});
        const after = renderer.camera.position.clone(), radius = after.distanceTo(controls.target);
        advance(2000); assert.ok(renderer.camera.position.distanceTo(after)<1e-8);
        advance(2000); assert.ok(renderer.camera.position.distanceTo(after)>1);
        assert.ok(Math.abs(renderer.camera.position.distanceTo(controls.target)-radius)<1e-8,'zoom is preserved');
    });
    check('textbox focus eases into its section and oscillates within a partial arc', () => {
        const before = renderer.camera.position.clone(), initialRadius = before.distanceTo(controls.target);
        const projection = renderer.camera.projectionMatrix.clone();
        api.focusPart('gen'); assert.ok(renderer.camera.position.equals(before),'transition begins without teleporting');
        assert.ok(renderer.camera.projectionMatrix.equals(projection),'framing must not jump ahead of the camera');
        step(); const firstStep = renderer.camera.position.distanceTo(before); assert.ok(firstStep>0);
        advance(2400); assert.ok(renderer.camera.position.distanceTo(before)>firstStep*2);
        const target = controls.target.clone(), radius = renderer.camera.position.distanceTo(target);
        assert.ok(radius<initialRadius,'section is magnified');
        api.highlightPart(null); assert.ok(renderer.world.getObjectByName('section-highlight'),'selected section stays highlighted after leaving the label');
        const angles = [];
        for (let i = 0; i < 32; i++) {
            advance(500); const offset = renderer.camera.position.clone().sub(controls.target); angles.push(Math.atan2(offset.x,offset.z));
            assert.ok(controls.target.distanceTo(target)<.02); assert.ok(Math.abs(offset.length()-radius)<.02);
        }
        assert.ok(angles.some((a,i) => i && a>angles[i-1]+.001)); assert.ok(angles.some((a,i) => i && a<angles[i-1]-.001));
        assert.ok(Math.max(...angles)-Math.min(...angles)<.37,'focus never becomes a full revolution');
        api.focusPart('gen'); advance(2500); assert.equal(renderer.world.getObjectByName('section-highlight'),undefined,'second click returns to site');
        assert.ok(controls.target.distanceTo(new T.Vector3(10.15,0,0))<.02);
    });
    check('drag and rotation controls preserve the camera and resume smoothly', () => {
        controls.dispatchEvent({type:'start'}); const held = renderer.camera.position.clone(); advance(4000);
        assert.ok(renderer.camera.position.distanceTo(held)<1e-8,'drag stays in control');
        controls.dispatchEvent({type:'end'}); advance(3500); assert.ok(renderer.camera.position.distanceTo(held)>.5);
        api.setAutoRotate(false); const paused = renderer.camera.position.clone(); advance(1000); assert.ok(renderer.camera.position.distanceTo(paused)<1e-8);
        api.setAutoRotate(true); advance(1000); assert.ok(renderer.camera.position.distanceTo(paused)>1);
        api.setAutoRotate(false); media.fire('change',{matches:true}); flush();
    });
    check('ASIC focus and Reset ease the framing together with the camera', () => {
        api.setConfig({view:'asic',definition:definition('asic')}); flush();
        media.fire('change',{matches:false});
        const initial = renderer.camera.projectionMatrix.clone();
        api.focusPart('ports'); assert.ok(renderer.camera.projectionMatrix.equals(initial));
        advance(100); assert.ok(!renderer.camera.projectionMatrix.equals(initial),'framing changes during the transition');
        assert.ok(renderer.camera.view.enabled,'the starting offset is eased toward zero');
        advance(2400); assert.equal(renderer.camera.view.enabled,false,'the part finishes centered');
        const focused = renderer.camera.projectionMatrix.clone();
        api.reset(); assert.ok(renderer.camera.projectionMatrix.equals(focused),'return does not jump either');
        advance(2500); assert.ok(renderer.camera.projectionMatrix.equals(initial),'original framing is restored exactly');
        media.fire('change',{matches:true}); flush();
    });
    check('touch is opt-in; inactive and offscreen viewers stop rendering', () => {
        assert.equal(host.canvas.style.touchAction,'pan-y');
        assert.equal(host.canvas.fire('pointerdown',{pointerType:'touch',pointerId:1}).stopped,true);
        api.setTouchControl(true); assert.equal(host.canvas.style.touchAction,'none');
        api.setActive(false); assert.equal(frames.size,0); assert.ok(!callout.fire('wheel',{deltaY:120}).defaultPrevented);
        api.setActive(true); observer.fn([{isIntersecting:false}]); assert.equal(frames.size,0);
        observer.fn([{isIntersecting:true}]); flush();
    });
    check('first-load visibility batches use the newest state so zoom and comparison render immediately', () => {
        observer.fn([{isIntersecting:false},{isIntersecting:true}]);
        api.zoom(.8);
        assert.ok(frames.size,'a hidden-to-visible batch must schedule the zoom frame');
        flush();
        for (const view of ['landfill','pad']) {
            api.setConfig({view,definition:definition(view)});
            api.setProgress(0); flush();
            const deployment = renderer.world.getObjectByName('proton-deployment');
            assert.equal(deployment.visible,false);
            api.setProgress(1);
            assert.ok(frames.size,'the first slider input must render without navigation');
            flush(); assert.equal(deployment.visible,true);
            let opaque = 0;
            deployment.traverse(o => { if (o.isMesh && o.material.opacity === 1) opaque++; });
            assert.ok(opaque>50,'the complete mine is visible at the far end of either slider');
        }
        observer.fn([{isIntersecting:true},{isIntersecting:false}]);
        assert.equal(frames.size,0,'a later hidden state still stops background animation');
        observer.fn([{isIntersecting:true}]); flush();
    });
    check('WebGL context loss reports fallback, cancels animation and permits recovery', () => {
        const event = host.canvas.fire('webglcontextlost'); assert.equal(event.defaultPrevented,true);
        assert.deepEqual(events.at(-1),['error']); assert.equal(frames.size,0);
        host.canvas.fire('webglcontextrestored'); flush(); api.dispose(); assert.equal(renderer.disposed,true); assert.equal(frames.size,0);
    });
    console.log('\n  '+passed+' shared 3D scene checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
