/* Execute the shipped UI against parsed HTML. No GPU or external services are needed.
   This catches broken controls, stale outputs, failed-feed behavior and market-input races. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const html = fs.readFileSync(__dirname+'/../../site/index.html','utf8');
let document;
class Element {
    constructor(tag,attrs={}) { this.tagName=tag.toUpperCase(); this.attrs=attrs; this.children=[]; this.parentNode=null; this.listeners={}; this._text=''; this._value=undefined; this.style={};
        this.classList={
            contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),
            add:(...names)=>{ this.attrs.class=[...new Set((this.attrs.class||'').split(/\s+/).concat(names))].join(' '); },
            remove:(...names)=>{ this.attrs.class=(this.attrs.class||'').split(/\s+/).filter(c=>!names.includes(c)).join(' '); },
            toggle:(c,on)=>{ if(on) this.classList.add(c); else this.classList.remove(c); }
        };
    }
    get name(){return this.attrs.name||'';} get id(){return this.attrs.id||'';}
    get value(){ if(this._value!==undefined)return this._value; if(this.tagName==='SELECT'){const o=this.children.find(c=>c.tagName==='OPTION');return o?o.value:'';} return this.attrs.value||''; }
    set value(v){this._value=String(v);}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this._text=String(v);this.children=[];}
    set innerHTML(v){this._text=String(v).replace(/<[^>]+>/g,'');this.children=[];}
    get hidden(){return 'hidden' in this.attrs;} set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden;}
    get disabled(){return 'disabled' in this.attrs;} set disabled(v){if(v)this.attrs.disabled='';else delete this.attrs.disabled;}
    get href(){return this.attrs.href;} set href(v){this.attrs.href=String(v);}
    get open(){return 'open' in this.attrs;} set open(v){if(v)this.attrs.open='';else delete this.attrs.open;}
    getAttribute(k){return k in this.attrs?this.attrs[k]:null;}
    setAttribute(k,v){this.attrs[k]=String(v);} removeAttribute(k){delete this.attrs[k];}
    appendChild(c){c.parentNode=this;this.children.push(c);return c;}
    addEventListener(t,fn){(this.listeners[t] ||= []).push(fn);}
    focus(){document.activeElement=this;}
    matches(selector){
        if(selector[0]==='#')return this.id===selector.slice(1);
        if(selector[0]==='.')return this.classList.contains(selector.slice(1));
        const attr=selector.match(/^\[([^=\]^]+)(\^?=)?(?:"([^"]*)")?\]$/);
        if(attr){const v=this.getAttribute(attr[1]);return attr[2]==='^='?v!==null&&v.startsWith(attr[3]):attr[2]==='='?v===attr[3]:v!==null;}
        return this.tagName===selector.toUpperCase();
    }
    closest(selector){let e=this;while(e){if(e.matches(selector))return e;e=e.parentNode;}return null;}
    querySelectorAll(selector){
        const parts=selector.split(/\s+/), out=[];
        const visit=e=>{for(const c of e.children){if(c.matches(parts[parts.length-1])){
            let valid=true,p=c.parentNode;
            for(let i=parts.length-2;i>=0;i--){while(p&&!p.matches(parts[i]))p=p.parentNode;if(!p){valid=false;break;}p=p.parentNode;}
            if(valid)out.push(c);
        }visit(c);}};visit(this);return out;
    }
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
function parse(source){
    const root=new Element('document'),stack=[root];
    const voids=new Set(['input','img','meta','link','br','hr','source']);
    for(const token of source.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g,'').match(/<[^>]*>|[^<]+/g)||[]){
        if(token.startsWith('</')){const name=token.slice(2).match(/^[\w-]+/)?.[0]?.toUpperCase();while(stack.length>1){if(stack.pop().tagName===name)break;}continue;}
        if(token.startsWith('<!'))continue;
        if(token.startsWith('<')){
            const name=token.slice(1).match(/^[\w-]+/)?.[0];if(!name)continue;
            const attrs={};const text=token.slice(name.length+1,-1);
            for(const m of text.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g))attrs[m[1]]=m[2]||'';
            const e=new Element(name,attrs);stack[stack.length-1].appendChild(e);
            if(!voids.has(name)&&!token.endsWith('/>'))stack.push(e);
        }else stack[stack.length-1]._text+=token;
    }return root;
}
document=parse(html);document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag);
const requests=[],timers=new Map();let timerId=0;
const sandbox={document,console,URLSearchParams,AbortController,
    CalcEngine:require('../../site/calc-engine.js'),MinerDB:require('../../site/miner-db.js'),PriceList:require('../../site/price-list.js'),MineBuilderModel:require('../../site/mine-builder-model.js'),
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))
};sandbox.window=sandbox;
vm.createContext(sandbox);new vm.Script(fs.readFileSync(__dirname+'/../../site/mine-builder.js','utf8')).runInContext(sandbox);
const el=id=>document.getElementById('mb-'+id);
function fire(target,type,extra={}){
    const event={target,...extra,preventDefault(){this.defaultPrevented=true;}};
    let node=target;while(node){for(const fn of node.listeners[type]||[])fn.call(node,event);node=node.parentNode;}
}
function input(name,value){el(name).value=value;fire(el(name),'input');}
function click(name){assert.ok(!el(name).disabled,name+' is enabled');fire(el(name),'click');}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0;
function check(name,fn){fn();passed++;console.log('  ok    '+name);}

(async()=>{
    check('homepage opens on the original mine without requesting market data',()=>{
        assert.equal(el('builder').hidden,true);assert.equal(el('our-mine').hidden,false);assert.equal(el('tab-build').hidden,false);assert.equal(requests.length,0);
    });
    click('tab-build');await settle();
    check('Build your mine selects an independent panel and fetches inputs only on demand',()=>{
        assert.equal(el('builder').hidden,false);assert.equal(el('our-mine').hidden,true);assert.equal(el('tab-build').getAttribute('aria-selected'),'true');
        assert.equal(requests.length,2);assert.equal(el('out-count').textContent,'160');assert.ok(Number(el('out-btc30').textContent)>0);
    });
    check('missing WebGL/module support leaves the calculator usable with an honest fallback',()=>{
        assert.equal(el('scene-fallback').hidden,false);assert.match(el('scene-message').textContent,/3D is unavailable/);assert.equal(el('energize').disabled,true);assert.ok(el('calculator').href.includes('machineCount=160'));
    });
    input('btcPrice','123456');
    requests[0].resolve({ok:true,text:async()=>'{"data":{"amount":"111111"}}'});
    requests[1].resolve({ok:true,text:async()=>'250000000000000'});
    await settle();
    check('a late response cannot overwrite a market input typed by the visitor',()=>{
        assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250.0000');assert.match(el('market-note').textContent,/BTC price: your input/);
        assert.match(el('market-note').textContent,/Difficulty: fetched/);
    });
    check('market requests omit credentials and send no visitor configuration',()=>{
        for(const request of requests){assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.ok(!request.options.body);assert.ok(!request.url.includes('?'));}
    });
    input('powerMW','0');
    check('zero supply clears all production and removes the full-calculator link',()=>{
        assert.equal(el('out-count').textContent,'0');assert.equal(el('out-btc30').textContent,'0.000000');assert.equal(el('calculator').getAttribute('aria-disabled'),'true');assert.equal(el('calculator').href,undefined);
    });
    input('powerMW','2');
    check('changing supply updates machine count, projection and the handoff together',()=>{
        assert.equal(el('out-count').textContent,'321');assert.ok(el('calculator').href.includes('machineCount=321'));assert.equal(el('power-slider').value,'2');
    });
    input('sizing','machines');input('machineCount','10');
    check('machine-count sizing disables the irrelevant power field',()=>{
        assert.equal(el('powerMW').disabled,true);assert.equal(el('machineCount').disabled,false);assert.equal(el('out-count').textContent,'10');
    });
    input('sizing','gas');input('gasMcf','240');
    check('gas mode uses gas inputs and fixes the source to generation',()=>{
        assert.equal(el('source').value,'gas');assert.equal(el('source').disabled,true);assert.equal(el('out-count').textContent,'160');
    });
    input('model','Antminer S21 XP');
    check('choosing an air-cooled model updates specs, cooling and price together',()=>{
        assert.equal(el('power').value,'3.645');assert.equal(el('hashrate').value,'270');assert.equal(el('cooling').value,'air');assert.equal(el('capex').value,'3010');
    });
    input('power','4');
    check('editing a catalog specification visibly switches to Custom',()=>assert.equal(el('model').value,'__custom__'));
    input('difficulty','');
    check('invalid inputs clear stale numbers and block the calculator handoff',()=>{
        assert.equal(el('error').hidden,false);assert.equal(el('out-btc30').textContent,'—');assert.equal(el('difficulty').getAttribute('aria-invalid'),'true');assert.equal(el('calculator').href,undefined);
        assert.equal(el('assumptions').open,true);assert.match(el('chart').getAttribute('aria-label'),/Complete the inputs/);
    });
    input('difficulty','250');input('elecCost','1');
    check('valid inputs recover and a loss is displayed as a negative margin',()=>{
        assert.equal(el('error').hidden,true);assert.equal(el('out-marginDay').classList.contains('is-negative'),true);assert.match(el('out-marginDay').textContent,/^−\$/);
    });
    click('tab-ours');click('tab-build');await settle();
    check('switching views preserves visitor input and does not refetch or remount',()=>{
        assert.equal(el('elecCost').value,'1');assert.equal(requests.length,2);
    });
    fire(el('tab-build'),'keydown',{key:'ArrowLeft'});
    check('keyboard navigation switches panels and moves focus',()=>{
        assert.equal(el('builder').hidden,true);assert.equal(document.activeElement,el('tab-ours'));
    });
    click('tab-build');click('refresh-market');
    requests[2].resolve({ok:false,text:async()=>''});requests[3].reject(new Error('offline'));await settle();
    check('failed feed refresh keeps entered values and states the failure',()=>{
        assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250');assert.match(el('market-note').textContent,/refresh unavailable/);assert.equal(el('refresh-market').disabled,false);
    });
    click('reset-inputs');
    check('reset restores the build while preserving market inputs',()=>{
        assert.equal(el('sizing').value,'power');assert.equal(el('out-count').textContent,'160');assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250');assert.equal(el('elecCost').value,'0.07');
    });
    input('power-slider','5');
    check('power slider drives the paired numeric input and fleet size',()=>{
        assert.equal(el('powerMW').value,'5');assert.equal(el('out-count').textContent,'803');
    });
    // A second document exercises successful renderer wiring. The real scene /
    // camera is covered separately, so this adapter records only UI commands.
    document=parse(html);document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag);
    const scheduled=new Map();let serial=0, scene;
    const live={...sandbox,document,fetch:()=>new Promise(()=>{}),
        setTimeout:(fn,ms)=>{scheduled.set(++serial,{fn,ms});return serial;},clearTimeout:id=>scheduled.delete(id),
        loadSceneModule:async()=>({mountMineScene:(host,callbacks)=>{
            scene={host,callbacks,setConfig(v){this.config=v;callbacks.onInspect(false);},setActive(v){this.active=v;},energize(v){this.powered=!!v;},
                setXray(v){callbacks.onXray(v);},setAutoRotate(v){this.rotating=v;callbacks.onRotate(v);},inspect(v){callbacks.onInspect(v);},
                reset(){callbacks.onInspect(false);},zoom(v){this.zoomFactor=v;},setTouchControl(){}};return scene;
        }})};live.window=live;
    vm.createContext(live);new vm.Script(fs.readFileSync(__dirname+'/../../site/mine-builder.js','utf8').replace("import(panel.getAttribute('data-module-src'))",'loadSceneModule()')).runInContext(live);
    const renderScene=()=>{for(const[id,t]of[...scheduled])if(t.ms===100){scheduled.delete(id);t.fn();}};
    click('tab-build');await settle();renderScene();
    check('the builder starts energized with X-ray off and rotation enabled',()=>{
        assert.equal(scene.powered,true);assert.equal(el('energize').getAttribute('aria-pressed'),'true');assert.match(el('power-status').textContent,/energized/);
        assert.equal(el('xray').getAttribute('aria-pressed'),'false');assert.equal(el('rotate').getAttribute('aria-pressed'),'true');
        assert.equal(scene.callbacks.interactionSurface,el('stage'));
    });
    check('builder rotation and X-ray controls dispatch and expose their current state',()=>{
        click('rotate');assert.equal(scene.rotating,false);assert.equal(el('rotate').getAttribute('aria-pressed'),'false');
        click('rotate');assert.equal(scene.rotating,true);
        click('xray');assert.equal(el('xray').getAttribute('aria-pressed'),'true');assert.equal(el('xray').textContent,'X-ray on');
        click('xray');assert.equal(el('xray').getAttribute('aria-pressed'),'false');
    });
    check('empty or invalid builds stop power and valid builds recover the energized preference',()=>{
        input('powerMW','0');renderScene();assert.equal(scene.powered,false);assert.equal(el('energize').disabled,true);
        input('powerMW','2');renderScene();assert.equal(scene.powered,true);
        input('difficulty','');assert.equal(scene.powered,false);assert.equal(scene.active,false);
        input('difficulty','200');renderScene();assert.equal(scene.powered,true);assert.equal(scene.active,true);
    });
    check('an explicit Power down survives edits, and reset restores energized defaults',()=>{
        click('energize');assert.equal(scene.powered,false);input('powerMW','3');renderScene();assert.equal(scene.powered,false);
        click('reset-inputs');renderScene();assert.equal(scene.powered,true);assert.equal(el('energize').getAttribute('aria-pressed'),'true');
        click('inspect');assert.equal(el('inspect').getAttribute('aria-pressed'),'true');assert.equal(el('inspect').textContent,'Return to site');
    });
    console.log('\n  '+passed+' mine builder UI checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
