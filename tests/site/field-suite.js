/* Run the actual field with a deterministic clock and a recording 2D context.
   Canvas dimensions and drawing commands are checked without a browser or GPU. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync(__dirname+'/../../site/hero-anim.js','utf8');

function harness(options = {}) {
    let now = 0, sequence = 0, seed = 9214;
    const frames = new Map(), timers = new Map(), observers = [], canvases = [];
    function events() {
        const listeners = new Map();
        return {listeners,
            addEventListener(type,fn) { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(fn); },
            removeEventListener(type,fn) { listeners.get(type)?.delete(fn); },
            fire(type,event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }};
    }
    const media = {...events(),matches:!!options.reduced};
    const window = {...events(),devicePixelRatio:options.dpr || 1,matchMedia:() => media};
    const document = {...events(),hidden:false,querySelectorAll:() => canvases};
    class Observer {
        constructor(fn) { this.fn = fn; observers.push(this); }
        observe(host) { this.host = host; }
        disconnect() { this.disconnected = true; }
    }
    window.IntersectionObserver = Observer;
    function canvas(width = options.width ?? 1280,height = options.height ?? 470,page = options.page) {
        const ctx = {
            rects:[],draws:0,masks:0,transforms:[],
            clearRect() { this.rects = []; this.draws++; },
            fillRect(x,y,w,h) {
                assert.ok([x,y,w,h].every(Number.isFinite),'all drawing commands must be finite');
                assert.ok(w>=0 && h>=0);
                if (typeof this.fillStyle === 'string') assert.match(this.fillStyle,/^rgba\([\d,]+,(?:0|1)(?:\.\d+)?\)$/);
                this.rects.push({x,y,w,h,fill:this.fillStyle});
            },
            createLinearGradient(x0,y0,x1,y1) { return {x0,y0,x1,y1,stops:[],addColorStop(offset,color) { this.stops.push({offset,color}); }}; },
            setTransform(...args) { this.transforms.push(args); },save() {},restore() {},
            fill(path) { this.masks++; this.lastMask = {path,operation:this.globalCompositeOperation,after:this.rects.length}; }
        };
        const host = {querySelector(selector) {
            if (!options.mask) return null;
            return {getAttribute(name) { return name === 'viewBox' ? '0 0 1280 470' : 'M20 20L40 20L40 40Z'; }};
        }};
        const element = {ctx,parentNode:host,className:'anim-field '+(page ? 'anim-field--page' : 'anim-field--plant'),
            clientWidth:width,clientHeight:height,
            style:new Proxy({}, {set() { throw Error('A field must never write layout styles'); }}),
            getAttribute(name) { return name === 'data-w' ? '1280' : name === 'data-h' ? '470' : null; },
            querySelector() { return null; },getContext:() => options.noContext ? null : ctx};
        return element;
    }
    const initial = canvas(); canvases.push(initial);
    const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
    vm.runInNewContext(options.source || source,{window,document,Math:math,WeakMap,IntersectionObserver:Observer,
        Path2D:class { constructor(d) { this.d = d; } },
        requestAnimationFrame(fn) { frames.set(++sequence,fn); return sequence; },cancelAnimationFrame:id => frames.delete(id),
        setTimeout(fn,delay) { timers.set(++sequence,{fn,at:now+delay}); return sequence; },clearTimeout:id => timers.delete(id)});
    function step(ms = 1000/60) {
        now += ms;
        for (const [id,timer] of [...timers]) if (timer.at<=now) { timers.delete(id); timer.fn(); }
        const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now));
    }
    function advance(ms) { const end = now+ms; while (now<end-.001) step(Math.min(1000/60,end-now)); }
    return {window,document,media,frames,timers,observers,initial,canvas,step,advance};
}

function tests() {
    let passed = 0;
    const check = (name,fn) => { fn(); passed++; console.log('  ok    '+name); };
    const field = harness(), c = field.initial, api = field.window.ProtonField.mount(c);
    check('a populated field paints immediately and mounting it twice creates one loop', () => {
        assert.equal(c.ctx.draws,1); assert.ok(c.ctx.rects.length>200);
        assert.equal(field.frames.size,1); assert.equal(field.observers.length,1);
        assert.equal(field.observers[0].host,c.parentNode,'the visibility gate observes the actual panel');
        assert.equal(field.window.ProtonField.mount(c),api);
        assert.equal(field.frames.size,1); assert.equal(field.observers.length,1);
    });
    check('the original small pixels retain their colors, sizes and rising motion', () => {
        const heads = () => c.ctx.rects.filter(r => r.w === r.h);
        const before = heads(); field.advance(400); const after = heads();
        assert.deepEqual([...new Set(after.map(r => r.w))].sort(),[1,2]);
        assert.ok(after.every(r => Number.isInteger(r.x) && Number.isInteger(r.y)));
        const middle = before.filter(r => r.y>30 && r.y<440);
        assert.ok(middle.filter(r => after.some(next => next.w===r.w && Math.abs(next.x-r.x)<=6 && r.y-next.y>5 && r.y-next.y<21)).length>middle.length*.8);
        const colors = new Set(after.map(r => r.fill.split(',').slice(0,3).join(',')));
        assert.deepEqual([...colors].sort(),['rgba(229,228,226','rgba(247,147,26','rgba(255,196,107']);
    });
    check('the original animation follows display frames without resizing its CSS box', () => {
        const before = c.ctx.draws, width = c.width, height = c.height;
        field.advance(1000);
        assert.ok(c.ctx.draws-before>=59 && c.ctx.draws-before<=61);
        assert.equal(c.width,width); assert.equal(c.height,height);
        assert.ok(c.ctx.rects.length<500,'a desktop preview has a bounded draw budget');
    });
    check('hidden tabs, offscreen panels and inactive controllers stop completely', () => {
        field.observers[0].fn([{isIntersecting:false}]); assert.equal(field.frames.size,0);
        const before = c.ctx.draws; field.advance(2000); assert.equal(c.ctx.draws,before);
        field.observers[0].fn([{isIntersecting:false},{isIntersecting:true}]); assert.equal(field.frames.size,1);
        field.document.hidden = true; field.document.fire('visibilitychange'); assert.equal(field.frames.size,0);
        field.document.hidden = false; field.document.fire('visibilitychange'); field.advance(100);
        assert.ok(c.ctx.draws>before);
        api.setActive(false); assert.equal(field.frames.size,0); api.setActive(true); assert.equal(field.frames.size,1);
    });
    check('reduced motion has a complete still and responds when the preference changes', () => {
        field.media.fire('change',{matches:true}); assert.equal(field.frames.size,0);
        const still = JSON.stringify(c.ctx.rects); field.advance(5000); assert.equal(JSON.stringify(c.ctx.rects),still);
        field.media.fire('change',{matches:false}); assert.equal(field.frames.size,1);
        const quiet = harness({reduced:true}); assert.equal(quiet.frames.size,0); assert.ok(quiet.initial.ctx.rects.length>200);
    });
    check('dynamically created backgrounds work independently and release all listeners on disposal', () => {
        const dynamic = field.canvas(700,350), other = field.window.ProtonField.mount(dynamic);
        assert.ok(dynamic.ctx.rects.length>90); assert.equal(field.frames.size,2);
        other.dispose(); assert.equal(field.frames.size,1); assert.ok(field.observers[1].disconnected);
        api.dispose(); assert.equal(field.frames.size,0); assert.ok(field.observers[0].disconnected);
        for (const target of [field.window,field.document,field.media]) for (const listeners of target.listeners.values()) assert.equal(listeners.size,0);
        api.setActive(true); assert.equal(field.frames.size,0);
    });
    check('a hidden initial host is remeasured on reveal without a resize feedback loop', () => {
        const hidden = harness({width:0,height:0,dpr:3}), canvas = hidden.initial;
        assert.equal(canvas.width,2560); assert.equal(canvas.height,940);
        hidden.observers[0].fn([{isIntersecting:false}]);
        canvas.clientWidth = 720; canvas.clientHeight = 350;
        hidden.observers[0].fn([{isIntersecting:false},{isIntersecting:true}]);
        assert.equal(canvas.width,1440); assert.equal(canvas.height,700);
        hidden.window.fire('resize'); hidden.advance(300); assert.equal(canvas.width,1440);
    });
    check('legacy SVG silhouettes still remove pixels from the equipment', () => {
        const old = harness({mask:true});
        assert.ok(old.initial.ctx.masks>0);
        assert.equal(old.initial.ctx.lastMask.operation,'destination-out');
        assert.equal(old.initial.ctx.lastMask.after,old.initial.ctx.rects.length);
    });
    check('large screens stay bounded and a missing 2D context never blocks the page', () => {
        const large = harness({width:3840,height:2160}); assert.ok(large.initial.ctx.rects.length<1000);
        const unavailable = harness({noContext:true}); assert.equal(unavailable.frames.size,0);
        assert.equal(unavailable.window.ProtonField.mount(unavailable.initial),null);
    });
    console.log('\n  '+passed+' pixel field checks passed');
}
module.exports = {harness};
if (require.main === module) tests();
