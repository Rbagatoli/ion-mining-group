/* Run the shipped progressive enhancement against each generated page. The scene
   adapter is recorded here; its actual geometry and controls have a separate suite. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
class Element {
    constructor(tag, attrs = {}) {
        this.tagName = tag.toLowerCase(); this.attrs = attrs; this.children = []; this.listeners = {}; this._text = ''; this.style = {};
        this.classList = {contains:c => (this.attrs.class || '').split(/\s+/).includes(c),
            add:c => { this.attrs.class = (this.attrs.class || '')+' '+c; },
            remove:c => { this.attrs.class = (this.attrs.class || '').split(/\s+/).filter(x => x !== c).join(' '); },
            toggle:(c,on) => { if (on) this.classList.add(c); else this.classList.remove(c); }};
    }
    get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
    get value() { return this.attrs.value || ''; } set value(v) { this.attrs.value = String(v); }
    get hidden() { return 'hidden' in this.attrs; } set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
    get textContent() { return this._text+this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(v) { const fragment = parse(v); this.children = []; for (const c of fragment.children) this.appendChild(c); }
    getAttribute(k) { return this.attrs[k] ?? null; } setAttribute(k,v) { this.attrs[k] = String(v); }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type) { for (const fn of this.listeners[type] || []) fn.call(this,{target:this}); }
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
function fixture(page, fail = false) {
    const html = fs.readFileSync(__dirname+'/../../site/'+page+'.html','utf8'), document = parse(html), observers = [], scenes = [], imports = [];
    const moduleURL = html.match(/<script src="\.\/plant-viewer\.js[^>]*data-module-src="([^"]+)"/)?.[1];
    assert.ok(moduleURL,page+' references the shared stamped scene');
    document.currentScript = new Element('script',{'data-module-src':moduleURL}); document.createElement = tag => new Element(tag);
    document.createElementNS = (ns,tag) => new Element(tag);
    class Observer { constructor(fn) { this.fn = fn; observers.push(this); } observe(el) { this.el = el; } disconnect() {} }
    const sandbox = {document,console,IntersectionObserver:Observer,loadSceneModule:async url => {
        imports.push(url); return {mountMineScene:(host,callbacks) => {
            if (fail) throw new Error('WebGL unavailable');
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
    const source = fs.readFileSync(__dirname+'/../../site/plant-viewer.js','utf8').replace('import(moduleURL)','loadSceneModule(moduleURL)');
    new vm.Script(source).runInContext(sandbox);
    return {document,observers,scenes,imports};
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
        home.scenes[0].callbacks.onRestore(); assert.ok(group.classList.contains('plant-ready')); assert.equal(home.scenes[0].active,true);
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
    console.log('\n  '+passed+' presentation UI checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
