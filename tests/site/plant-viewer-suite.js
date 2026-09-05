/* Exercise the generated pages, site controls and progressive enhancement,
   including first-load integration with real scene geometry and OrbitControls. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
class Element {
    constructor(tag, attrs = {}) {
        this.tagName = tag.toLowerCase(); this.attrs = attrs; this.children = []; this.listeners = {}; this._text = '';
        this.style = {setProperty(k,v) { this[k] = v; }}; this.inert = false;
        this.classList = {contains:c => (this.attrs.class || '').split(/\s+/).includes(c),
            add:c => { this.attrs.class = (this.attrs.class || '')+' '+c; },
            remove:c => { this.attrs.class = (this.attrs.class || '').split(/\s+/).filter(x => x !== c).join(' '); },
            toggle:(c,on) => { if (on) this.classList.add(c); else this.classList.remove(c); }};
    }
    get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
    get value() { return this.attrs.value || ''; } set value(v) { this.attrs.value = String(v); }
    get hidden() { return 'hidden' in this.attrs; } set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get clientWidth() { return this.closest('[hidden]') ? 0 : 1280; }
    get clientHeight() { return this.closest('[hidden]') ? 0 : 470; }
    get textContent() { return this._text+this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(v) { const fragment = parse(v); this.children = []; for (const c of fragment.children) this.appendChild(c); }
    getAttribute(k) { return this.attrs[k] ?? null; } setAttribute(k,v) { this.attrs[k] = String(v); }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    getRootNode() { let root = this; while (root.parentElement) root = root.parentElement; return root; }
    get ownerDocument() { return this.getRootNode(); }
    setPointerCapture() {} releasePointerCapture() {}
    getBoundingClientRect() { return {left:0,top:0,width:this.clientWidth,height:this.clientHeight}; }
    remove() { this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({fn,capture:!!(options === true || options?.capture)}); }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(l => l.fn !== fn); }
    fire(type, extra = {}) {
        const event = {type,target:this,deltaMode:0,ctrlKey:false,metaKey:false,...extra,
            preventDefault() { this.defaultPrevented = true; },stopPropagation() { this.stopped = true; },
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
    matches(selector) {
        const attr = selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/);
        if (attr && (this.getAttribute(attr[1]) === null || (attr[2] !== undefined && this.getAttribute(attr[1]) !== attr[2]))) return false;
        const plain = selector.replace(/\[[^\]]+\]/g,'');
        if (!plain) return true;
        if (plain[0] === '.') return this.classList.contains(plain.slice(1));
        if (plain[0] === '#') return this.getAttribute('id') === plain.slice(1);
        return this.tagName === plain;
    }
    closest(s) { for (let p = this; p; p = p.parentElement) if (p.matches(s)) return p; return null; }
    querySelectorAll(s) { const out = []; const visit = p => { for (const c of p.children) { if (c.matches(s)) out.push(c); visit(c); }}; visit(this); return out; }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
}
function parse(html) {
    const root = new Element('document'), stack = [root], voids = new Set(['input','link','meta','br','hr','img','source']);
    for (const token of html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g,'').match(/<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('</')) { const tag = token.match(/^<\/([\w-]+)/)?.[1]?.toLowerCase(); while (stack.length > 1) if (stack.pop().tagName === tag) break; }
        else if (token.startsWith('<!')) continue;
        else if (token.startsWith('<')) {
            const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
            const attrs = {}; for (const m of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[m[1]] = m[2] || '';
            const el = new Element(tag,attrs); stack.at(-1).appendChild(el); if (!voids.has(tag) && !token.endsWith('/>')) stack.push(el);
        } else stack.at(-1)._text += token;
    }
    return root;
}
function fixture(page, fail = false, options = {}) {
    const html = fs.readFileSync(__dirname+'/../../site/'+page+'.html','utf8'), document = parse(html), observers = [], scenes = [], imports = [];
    const moduleURL = html.match(/<script src="\.\/plant-viewer\.js[^>]*data-module-src="([^"]+)"/)?.[1];
    assert.ok(moduleURL,page+' references the shared stamped scene');
    document.currentScript = new Element('script',{'data-module-src':moduleURL}); document.createElement = tag => new Element(tag);
    document.createElementNS = (ns,tag) => new Element(tag);
    document.getElementById = id => document.querySelector('#'+id);
    class Observer { constructor(fn,config = {}) { this.fn = fn; this.config = config; observers.push(this); } observe(el) { this.el = el; } disconnect() {} }
    const sandbox = {document,console,IntersectionObserver:Observer,addEventListener() {},loadSceneModule:async url => {
        imports.push(url); if (options.moduleGate) await options.moduleGate;
        return {mountMineScene:(host,callbacks) => {
            if (fail) throw new Error('WebGL unavailable');
            if (options.mount) {
                try { const scene = options.mount(host,callbacks,document); scenes.push(scene); return scene; }
                catch (error) { console.error('Scene mount failed:',error); throw error; }
            }
            const scene = {host,callbacks,calls:[],setConfig(v) { this.config = v; },
                setProgress(v) { this.progress = v; },energize(v) { this.powered = v; },setActive(v) { this.active = v; },
                setAnnotations(v) { this.annotations = v; callbacks.onProject(v.map(co => ({id:co.id,x:.5,y:.5,visible:true}))); },
                setXray(v) { this.xray = v; callbacks.onXray(v); },setAutoRotate(v) { this.rotating = v; callbacks.onRotate(v); },zoom(v) { this.calls.push(['zoom',v]); },
                reset() { callbacks.onPart(null); },setTouchControl(v) { this.touch = v; },
                highlightPart(v) { callbacks.onPart(v); },focusPart(v) { this.calls.push(['part',v]); callbacks.onPart(v); },dispose() { this.disposed = true; }};
            scenes.push(scene); return scene;
        }};
    }};
    for (const [name,file] of Object.entries({SiteDiagram:'site',ContainerDiagram:'hosting',AsicDiagram:'asic',
        LandfillNowDiagram:'landfill-now',LandfillIonDiagram:'landfill-ion',PadNowDiagram:'pad-now',PadIonDiagram:'pad-ion'})) sandbox[name] = require('../../site/scene-'+file+'.js');
    sandbox.window = sandbox; vm.createContext(sandbox);
    new vm.Script(fs.readFileSync(__dirname+'/../../site/site.js','utf8')).runInContext(sandbox);
    const source = fs.readFileSync(__dirname+'/../../site/plant-viewer.js','utf8').replace('import(moduleURL)','loadSceneModule(moduleURL)');
    new vm.Script(source).runInContext(sandbox);
    return {document,observers:observers.filter(o => o.config.rootMargin === '240px'),scenes,imports};
}
const settle = () => new Promise(r => setImmediate(r));
let passed = 0;
function check(name,fn) { fn(); passed++; console.log('  ok    '+name); }
const ref = (group,name) => group.querySelector('[data-plant="'+name+'"]');
(async () => {
    const home = fixture('index'), group = home.observers[0].el;
    check('the existing mine stays in place and Three.js is lazy until approached', () => {
        assert.equal(home.imports.length,0); assert.equal(home.scenes.length,0); assert.ok(!group.classList.contains('plant-ready'));
        assert.ok(group.querySelector('.site-diagram'));
    });
    home.observers[0].fn([{isIntersecting:true}]); await settle();
    check('the SVG stays interactive until the measured canvas has drawn its first frame', () => {
        assert.ok(!group.classList.contains('plant-ready'));
        assert.ok(group.querySelector('.plant-preview').classList.contains('plant-preview--loading'));
        assert.equal(home.scenes[0].host.clientWidth,1280); assert.equal(home.scenes[0].host.clientHeight,470);
        assert.equal(home.scenes[0].active,true);
        home.scenes[0].callbacks.onReady();
        assert.ok(!group.querySelector('.plant-preview').classList.contains('plant-preview--loading'));
    });
    check('the Our mine window upgrades in place and retains its tab panel identity', () => {
        assert.equal(group.getAttribute('id'),'mb-our-mine'); assert.equal(group.getAttribute('role'),'tabpanel');
        assert.ok(group.classList.contains('plant-ready')); assert.equal(home.scenes[0].config.view,'site');
        assert.equal(ref(group,'mode').textContent,'Exterior view'); assert.equal(ref(group,'callouts').children.length,8);
        assert.equal(home.scenes[0].powered,true); assert.equal(ref(group,'rotate').getAttribute('aria-pressed'),'true');
        assert.equal(home.scenes[0].config.definition.main,require('../../site/scene-site.js'));
        assert.equal(home.scenes[0].callbacks.interactionSurface,ref(group,'surface'));
    });
    check('existing scenes have X-ray, zoom and Reset without an Inside control', () => {
        assert.equal(ref(group,'inspect'),null);
        ref(group,'xray').fire('click'); assert.equal(ref(group,'xray').getAttribute('aria-pressed'),'true');
        ref(group,'in').fire('click'); ref(group,'out').fire('click');
        assert.equal(JSON.stringify(home.scenes[0].calls),JSON.stringify([['zoom',.8],['zoom',1.25]]));
        ref(group,'reset').fire('click');
        assert.equal(ref(group,'mode').textContent,'X-ray view');
    });
    check('auto-rotation can be paused and restored through its visible control', () => {
        ref(group,'rotate').fire('click'); assert.equal(home.scenes[0].rotating,false); assert.equal(ref(group,'rotate').textContent,'Auto-rotate off');
        ref(group,'rotate').fire('click'); assert.equal(home.scenes[0].rotating,true); assert.equal(ref(group,'rotate').getAttribute('aria-pressed'),'true');
    });
    check('pointing textboxes restore the original wording and two-column positions', () => {
        const original = require('../../site/scene-site.js');
        ref(group,'callouts').children.forEach((card,i) => {
            const co = original.CALLOUTS[i]; assert.equal(card.children[0].textContent,co.title); assert.equal(card.children[1].textContent,co.desc);
            assert.ok(card.classList.contains('plant-callout--'+co.side)); assert.equal(card.style.top,co.y/original.VB.h*100+'%');
        });
        assert.equal(ref(group,'leaders').children.length,16);
        const button = ref(group,'callouts').children[0]; button.fire('click');
        assert.equal(button.getAttribute('aria-pressed'),'true'); assert.deepEqual(home.scenes[0].calls.at(-1),['part','gas']);
        assert.ok(ref(group,'leaders').children[0].classList.contains('is-hot'));
        button.fire('blur'); assert.equal(button.getAttribute('aria-pressed'),'false');
        button.fire('pointerenter'); assert.equal(button.getAttribute('aria-pressed'),'true');
        button.fire('pointerleave'); assert.equal(button.getAttribute('aria-pressed'),'false');
    });
    check('projected leaders move with the camera and hide invalid endpoints', () => {
        const line = ref(group,'leaders').children[0], dot = ref(group,'leaders').children[1];
        home.scenes[0].callbacks.onProject([{id:'gas',x:.42,y:.67,visible:true}]);
        assert.equal(line.getAttribute('x2'),'420.00'); assert.equal(line.getAttribute('y2'),'670.00'); assert.equal(dot.getAttribute('cx'),'420.00');
        home.scenes[0].callbacks.onProject([{id:'gas',x:NaN,y:0,visible:true}]); assert.equal(line.getAttribute('visibility'),'hidden');
    });
    check('touch mode is explicitly enabled and can return to page scrolling', () => {
        ref(group,'touch').fire('click'); assert.equal(home.scenes[0].touch,true);
        ref(group,'touch').fire('click'); assert.equal(home.scenes[0].touch,false);
    });
    check('context loss restores the complete SVG and recovery reuses the same controls', () => {
        home.scenes[0].callbacks.onError(); assert.ok(!group.classList.contains('plant-ready')); assert.equal(home.scenes[0].active,false);
        assert.equal(group.querySelector('.plant-preview').hidden,true); assert.ok(group.querySelector('.site-diagram'));
        home.scenes[0].callbacks.onRestore(); assert.ok(!group.classList.contains('plant-ready')); assert.equal(home.scenes[0].active,true);
        home.scenes[0].callbacks.onReady(); assert.ok(group.classList.contains('plant-ready'));
        assert.equal(group.querySelectorAll('.plant-preview').length,1);
    });
    const hosting = fixture('hosting'); hosting.observers[0].fn([{isIntersecting:true}]); await settle();
    check('the existing hosting slider switches from a container to its hydro machine', () => {
        const g = hosting.observers[0].el, scale = hosting.document.querySelector('.dg-scale-input');
        assert.equal(hosting.scenes[0].config.view,'hosting'); assert.equal(hosting.scenes[0].xray,false);
        scale.value = 100; scale.fire('input'); assert.equal(hosting.scenes[0].xray,true,'only the ASIC starts with X-ray');
        assert.equal(hosting.scenes[0].config.view,'asic'); assert.equal(ref(g,'inspect'),null);
        assert.equal(ref(g,'callouts').children.length,6); assert.match(ref(g,'cooling').textContent,/no miner fans/);
        scale.value = 0; scale.fire('input'); assert.equal(hosting.scenes[0].config.view,'hosting'); assert.equal(hosting.scenes[0].xray,false);
    });
    const energy = fixture('energy'); energy.observers[0].fn([{isIntersecting:true}]); await settle();
    check('the hidden fuel does not load a renderer and before-state cannot X-ray absent miners', () => {
        assert.equal(energy.scenes.length,1); assert.equal(energy.scenes[0].config.view,'landfill'); assert.equal(energy.scenes[0].progress,0);
        assert.equal(energy.scenes[0].xray,false); assert.equal(energy.scenes[0].powered,true);
        assert.equal(ref(energy.observers[0].el,'xray').disabled,true);
    });
    check('before / after updates the model, original callouts and X-ray availability together', () => {
        const g = energy.observers[0].el, scale = g.closest('.dg-fuel-pane').querySelector('.dg-scale-input');
        scale.value = 100; scale.fire('input'); assert.equal(energy.scenes[0].progress,1); assert.equal(ref(g,'xray').disabled,false);
        assert.equal(energy.scenes[0].annotations,require('../../site/scene-landfill-ion.js').CALLOUTS);
        assert.equal(energy.scenes[0].config.definition.before,require('../../site/scene-landfill-now.js'));
        assert.match(ref(g,'callouts').children[0].textContent,/tie-in/);
    });
    energy.observers[1].fn([{isIntersecting:true}]); await settle();
    check('the wellpad has independent controls and shares one module download with the landfill', () => {
        assert.equal(energy.scenes.length,2); assert.equal(energy.scenes[1].config.view,'pad'); assert.equal(energy.scenes[1].progress,0);
        assert.equal(energy.scenes[0].progress,1); assert.equal(energy.imports.length,1);
    });
    const unavailable = fixture('index',true); unavailable.observers[0].fn([{isIntersecting:true}]); await settle();
    check('a device without WebGL keeps the original diagram and all descriptions', () => {
        const g = unavailable.observers[0].el; assert.ok(!g.classList.contains('plant-ready'));
        assert.ok(g.querySelector('.site-diagram')); assert.equal(g.querySelectorAll('.dg-callout').length,8);
    });
    // Use the actual scene/controller below. Only GPU drawing, layout dimensions
    // and the observer/frame clock are supplied by this harness.
    const T = await import('../../site/vendor/three-0.185.1/three.module.min.js');
    const {OrbitControls} = await import('../../site/vendor/three-0.185.1/OrbitControls.js');
    const sceneSource = fs.readFileSync(__dirname+'/../../site/mine-builder-scene.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
    const mountFactory = new Function('THREE','OrbitControls','RoomEnvironment','window','document','ResizeObserver','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame',sceneSource+'\nreturn mountMineScene;');
    const mounted = [];
    function realMount(host,callbacks,document) {
        const record = {host,frames:new Map(),time:0,sequence:0,renders:0}; mounted.push(record);
        class Renderer {
            constructor() { this.domElement = document.createElement('canvas'); this.shadowMap = {}; record.canvas = this.domElement; }
            setPixelRatio() {} setSize(w,h) { record.size = [w,h]; } dispose() {}
            render(world,camera) { world.updateMatrixWorld(); camera.updateMatrixWorld(); Object.assign(record,{world,camera,renders:record.renders+1}); }
        }
        class Controls extends OrbitControls { constructor(...args) { super(...args); record.controls = this; } }
        class Environment extends T.Scene { dispose() {} }
        class PMREM { fromScene() { return {texture:null,dispose() {}}; } dispose() {} }
        class Resize { observe() {} disconnect() {} }
        class Intersection { constructor(fn) { record.intersect = fn; } observe() {} disconnect() {} }
        const media = new Element('media'); media.matches = true;
        record.api = mountFactory({...T,WebGLRenderer:Renderer,PMREMGenerator:PMREM},Controls,Environment,
            {devicePixelRatio:1,matchMedia:() => media},document,Resize,Intersection,
            fn => { record.frames.set(++record.sequence,fn); return record.sequence; },id => record.frames.delete(id))(host,callbacks);
        record.draw = () => {
            const batch = [...record.frames.values()]; record.frames.clear(); record.time += 16;
            batch.forEach(fn => fn(record.time));
        };
        return record.api;
    }
    const direct = fixture('index',false,{mount:realMount});
    direct.observers[0].fn([{isIntersecting:true}]); await settle();
    const first = mounted.at(-1);
    check('a cold home-page load accepts real drag and wheel input on its first visible frame', () => {
        const g = direct.observers[0].el;
        assert.ok(!g.classList.contains('plant-ready')); assert.deepEqual(first.size,[1280,470]);
        first.intersect([{isIntersecting:false},{isIntersecting:true}]); first.draw();
        assert.ok(g.classList.contains('plant-ready')); assert.equal(first.renders,1);
        const distance = first.camera.position.distanceTo(first.controls.target);
        assert.equal(first.canvas.fire('wheel',{deltaY:-120}).defaultPrevented,true); first.draw();
        assert.ok(first.camera.position.distanceTo(first.controls.target)<distance);
        const position = first.camera.position.clone();
        const pointer = {pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:550,clientY:230};
        first.canvas.fire('pointerdown',pointer);
        first.canvas.fire('pointermove',{...pointer,clientX:650});
        first.canvas.fire('pointerup',{...pointer,clientX:650,buttons:0}); first.draw();
        assert.ok(first.camera.position.distanceTo(position)>1,'the real OrbitControls handler rotates immediately');
    });
    let releaseModule;
    const moduleGate = new Promise(resolve => { releaseModule = resolve; });
    const cold = fixture('energy',false,{mount:realMount,moduleGate});
    cold.observers[0].fn([{isIntersecting:true}]);
    const landfillGroup = cold.observers[0].el, padGroup = cold.observers[1].el;
    const landfillScale = landfillGroup.closest('.dg-fuel-pane').querySelector('.dg-scale-input');
    const padScale = padGroup.closest('.dg-fuel-pane').querySelector('.dg-scale-input');
    landfillScale.value = 75; landfillScale.fire('input');
    cold.document.querySelector('#dgFuel').querySelector('[data-fuel="flare"]').fire('click');
    cold.observers[1].fn([{isIntersecting:true}]); padScale.value = 100; padScale.fire('input');
    releaseModule(); await settle();
    const landfillRecord = mounted.at(-2), padRecord = mounted.at(-1);
    check('moving either Your site slider during a slow first download retains the latest choice', () => {
        assert.equal(cold.imports.length,1); assert.equal(cold.scenes.length,2);
        landfillRecord.draw(); assert.equal(landfillRecord.renders,0,'hidden fuel waits for a measurable layout');
        padRecord.draw(); assert.ok(padGroup.classList.contains('plant-ready'));
        assert.equal(padGroup.getAttribute('data-view'),'ion');
        assert.ok(padRecord.world.getObjectByName('proton-deployment').visible);
        assert.equal(ref(padGroup,'xray').disabled,false);
        padScale.value = 0; padScale.fire('input'); padRecord.draw();
        assert.equal(padRecord.world.getObjectByName('proton-deployment').visible,false);
        padScale.value = 100; padScale.fire('input'); padRecord.draw();
        assert.equal(padRecord.world.getObjectByName('proton-deployment').visible,true);
        cold.document.querySelector('#dgFuel').querySelector('[data-fuel="landfill"]').fire('click');
        landfillRecord.intersect([{isIntersecting:false},{isIntersecting:true}]); landfillRecord.draw();
        assert.ok(landfillGroup.classList.contains('plant-ready')); assert.equal(landfillScale.value,'75');
        assert.ok(landfillRecord.world.getObjectByName('proton-deployment').visible);
        const material = landfillRecord.world.getObjectByName('proton-deployment').getObjectByProperty('isMesh',true).material;
        assert.ok(material.opacity>0 && material.opacity<=.75);
        landfillScale.value = 100; landfillScale.fire('change'); landfillRecord.draw();
        assert.equal(ref(landfillGroup,'xray').disabled,false,'committed changes also synchronize the scene');
    });
    mounted.forEach(record => record.api.dispose());
    console.log('\n  '+passed+' presentation UI checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
