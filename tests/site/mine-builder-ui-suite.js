/* Execute the shipped UI against parsed HTML. No GPU or external services are needed.
   This catches broken controls, stale outputs, failed-feed behavior and market-input races. */
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const html = fs.readFileSync(__dirname+'/../../site/energy.html','utf8');
let document;
class Element {
    constructor(tag,attrs={}) { this.tagName=tag.toUpperCase(); this.attrs=attrs; this.children=[]; this.parentNode=null; this.listeners={}; this._text=''; this._value=undefined; this.style={setProperty(k,v){this[k]=v;}};
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
    dispatchEvent(event){fire(this,event.type,event);return !event.defaultPrevented;}
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
        if(selector.includes(','))return [...new Set(selector.split(',').flatMap(s=>this.querySelectorAll(s.trim())))];
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
const sandbox={document,console,URLSearchParams,AbortController,Event:class {constructor(type,options){this.type=type;Object.assign(this,options);}},addEventListener(){},location:{search:''},
    LandfillIonDiagram:require('../../site/scene-landfill-ion.js'),LandfillNowDiagram:require('../../site/scene-landfill-now.js'),
    PadIonDiagram:require('../../site/scene-pad-ion.js'),PadNowDiagram:require('../../site/scene-pad-now.js'),
    CalcEngine:require('../../site/calc-engine.js'),MinerDB:require('../../site/miner-db.js'),PriceList:require('../../site/price-list.js'),MineBuilderModel:require('../../site/mine-builder-model.js'),
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))
};sandbox.window=sandbox;
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(__dirname+'/../../site/site.js','utf8')).runInContext(sandbox);
new vm.Script(fs.readFileSync(__dirname+'/../../site/mine-builder.js','utf8')).runInContext(sandbox);
const el=id=>document.getElementById('mb-'+id);
function fire(target,type,extra={}){
    const event={target,...extra,preventDefault(){this.defaultPrevented=true;}};
    let node=target;while(node){for(const fn of node.listeners[type]||[])fn.call(node,event);node=node.parentNode;}
}
function input(name,value){el(name).value=value;fire(el(name),'input');}
function click(name){assert.ok(!el(name).disabled,name+' is enabled');fire(el(name),'click');}
function siteAction(fuel,end){
    const pane=document.querySelectorAll('.dg-fuel-pane').find(p=>p.getAttribute('data-fuel')===fuel);
    const button=pane.querySelector('[data-mb-end="'+end+'"]');
    assert.equal(button.tagName,'BUTTON');assert.equal(button.disabled,false);fire(button,'click');
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let passed=0;
function check(name,fn){fn();passed++;console.log('  ok    '+name);}

(async()=>{
    const comparisons=el('site-preview'), fuelPanes=comparisons.querySelectorAll('.dg-fuel-pane'), scales=comparisons.querySelectorAll('.dg-scale-input');
    const fuelButtons=document.getElementById('dgFuel').querySelectorAll('[data-fuel]');
    check('the energy page opens on Your site without requesting market data',()=>{
        assert.equal(el('builder').hidden,true);assert.equal(comparisons.hidden,false);assert.equal(el('tab-build'),null);assert.equal(requests.length,0);
        assert.equal(comparisons.closest('#the-pad'),el('builder').closest('#the-pad'));
        assert.equal(fuelPanes.length,2);assert.equal(fuelPanes[0].hidden,false);assert.equal(fuelPanes[1].hidden,true);
    });
    check('each site has an accessible two-choice toggle with no comparison slider',()=>{
        for(const pane of fuelPanes){
            const state=pane.querySelector('.dg-scale-input');assert.equal(state.getAttribute('type'),'hidden');
            assert.equal(pane.querySelector('.dg-scale-track'),null);
            assert.equal(pane.querySelector('[data-mb-end="lo"]').getAttribute('aria-pressed'),'true');
            assert.equal(pane.querySelector('[data-mb-end="hi"]').getAttribute('aria-pressed'),'false');
        }
    });
    siteAction('landfill','hi');await settle();
    check('With Proton opens a landfill build while retaining the site selector and comparison controls',()=>{
        assert.equal(el('builder').hidden,false);assert.equal(comparisons.hidden,false);assert.equal(fuelPanes[0].querySelector('[data-mb-end="hi"]').getAttribute('aria-expanded'),'true');
        assert.equal(scales[0].closest('[hidden]'),null);assert.equal(scales[1].closest('[hidden]'),fuelPanes[1]);
        assert.equal(fuelPanes[0].querySelector('.dg-views').hidden,false);assert.ok(comparisons.querySelectorAll('.dg-list').every(list=>!list.hidden));
        assert.equal(scales[0].value,'100');assert.equal(fuelPanes[0].querySelector('[data-mb-end="hi"]').getAttribute('aria-pressed'),'true');
        assert.equal(fuelPanes[0].querySelector('[data-mb-end="lo"]').getAttribute('aria-pressed'),'false');assert.match(el('heading').textContent,/Landfill gas/);assert.match(el('context-note').textContent,/extraction wells/);
        assert.equal(requests.length,2);assert.equal(el('out-count').textContent,'1,607');assert.equal(el('powerMW').value,'10');assert.equal(el('power-slider').value,'10');assert.ok(Number(el('out-btc30').textContent)>0);
    });
    check('the calculator remains usable alongside the original diagram without renderer support',()=>{
        assert.equal(el('canvas-host'),null);assert.equal(fuelPanes[0].querySelector('.dg-views').hidden,false);
        assert.ok(el('calculator').href.includes('machineCount=1607'));
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
    siteAction('landfill','lo');
    check('Your site today returns to the selected landfill without losing its configuration',()=>{
        assert.equal(comparisons.hidden,false);assert.equal(el('builder').hidden,true);
        assert.equal(fuelButtons[0].getAttribute('aria-pressed'),'true');assert.equal(fuelPanes[0].hidden,false);assert.equal(fuelPanes[1].hidden,true);
        assert.equal(scales[0].value,'0');assert.equal(scales[1].value,'0');assert.equal(el('elecCost').value,'1');
        assert.equal(fuelPanes[0].querySelector('.dg-views').hidden,false);
        assert.equal(fuelPanes[0].querySelector('.dg-views').style['--d'],'0.000');assert.equal(fuelPanes[1].querySelector('.dg-views').style['--d'],'0.000');
    });
    siteAction('landfill','hi');await settle();
    check('switching views preserves visitor input and does not refetch or remount',()=>{
        assert.equal(el('elecCost').value,'1');assert.equal(requests.length,2);
    });
    fire(fuelButtons[1],'click');
    check('changing fuel while building selects that site and its own starting configuration',()=>{
        assert.equal(el('builder').hidden,false);assert.match(el('heading').textContent,/Flared gas/);assert.match(el('context-note').textContent,/wellhead, separator, tanks/);
        assert.equal(fuelPanes[1].hidden,false);assert.equal(scales[1].value,'100');assert.equal(el('elecCost').value,'0.07');assert.equal(el('sizing').value,'power');
        assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250');
    });
    input('powerMW','3');input('elecCost','0.06');fire(fuelButtons[0],'click');
    check('landfill and flared-gas inputs survive repeated site switches independently',()=>{
        assert.equal(el('elecCost').value,'1');assert.equal(el('sizing').value,'gas');assert.equal(el('model').value,'__custom__');
        fire(fuelButtons[1],'click');assert.equal(el('elecCost').value,'0.06');assert.equal(el('powerMW').value,'3');
        fire(fuelButtons[0],'click');assert.equal(el('elecCost').value,'1');assert.equal(requests.length,2);
    });
    siteAction('landfill','lo');
    check('the Today toggle restores the original site and its accessible selected state',()=>{
        assert.equal(el('builder').hidden,true);assert.equal(fuelPanes[0].querySelector('.dg-views').hidden,false);
        assert.equal(fuelPanes[0].querySelector('.dg-views').style['--d'],'0.000');
        assert.equal(fuelPanes[0].querySelector('[data-mb-end="lo"]').getAttribute('aria-pressed'),'true');
        assert.equal(fuelPanes[0].querySelector('[data-mb-end="hi"]').getAttribute('aria-pressed'),'false');
    });
    siteAction('landfill','hi');click('refresh-market');
    requests[2].resolve({ok:false,text:async()=>''});requests[3].reject(new Error('offline'));await settle();
    check('failed feed refresh keeps entered values and states the failure',()=>{
        assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250');assert.match(el('market-note').textContent,/refresh unavailable/);assert.equal(el('refresh-market').disabled,false);
    });
    click('reset-inputs');
    check('reset restores the build while preserving market inputs',()=>{
        assert.equal(el('sizing').value,'power');assert.equal(el('powerMW').value,'10');assert.equal(el('out-count').textContent,'1,607');assert.equal(el('btcPrice').value,'123456');assert.equal(el('difficulty').value,'250');assert.equal(el('elecCost').value,'0.07');
    });
    input('power-slider','5');
    check('power slider drives the paired numeric input and fleet size',()=>{
        assert.equal(el('powerMW').value,'5');assert.equal(el('out-count').textContent,'803');
    });
    // The form configures the existing per-site view; it never mounts another canvas.
    document=parse(html);document.getElementById=id=>document.querySelector('#'+id);document.createElement=tag=>new Element(tag);
    const scheduled=new Map();let serial=0;
    const views=Object.fromEntries(['landfill','flare'].map(key=>[key,{calls:[],configure(value,options){this.estimate=value;this.calls.push({value,options});}}]));
    const live={...sandbox,document,ProtonSiteViews:views,fetch:()=>new Promise(()=>{}),
        setTimeout:(fn,ms)=>{scheduled.set(++serial,{fn,ms});return serial;},clearTimeout:id=>scheduled.delete(id)};live.window=live;
    vm.createContext(live);
    new vm.Script(fs.readFileSync(__dirname+'/../../site/site.js','utf8')).runInContext(live);
    new vm.Script(fs.readFileSync(__dirname+'/../../site/mine-builder.js','utf8')).runInContext(live);
    const renderScene=()=>{for(const[id,t]of[...scheduled])if(t.ms===100){scheduled.delete(id);t.fn();}};
    check('both lazy site views receive their 10 MW configuration before the first toggle',()=>{
        for(const view of Object.values(views)){assert.equal(view.estimate.availableKW,10000);assert.equal(view.estimate.count,1607);}
        assert.equal(el('builder').hidden,true);assert.equal(el('canvas-host'),null);
    });
    siteAction('landfill','hi');renderScene();
    check('building keeps the original renderer and callout region visible above the form',()=>{
        const group=document.querySelector('#dgViews-landfill');
        assert.equal(group.hidden,false);assert.equal(el('builder').hidden,false);
        assert.ok(group.querySelector('.dg-callout'));
        assert.equal(el('builder').querySelector('canvas'),null);
        assert.equal(views.landfill.estimate.count,1607);
    });
    input('powerMW','0');renderScene();
    check('zero and invalid configurations reach the shared view and recover without a remount',()=>{
        assert.equal(views.landfill.estimate.count,0);
        input('difficulty','');assert.equal(views.landfill.estimate.valid,false);
        input('difficulty','200');input('powerMW','2');renderScene();assert.equal(views.landfill.estimate.count,321);
    });
    click('reset-inputs');renderScene();
    check('Reset configuration requests an explicit reset and restores the 10 MW fleet',()=>{
        assert.equal(views.landfill.estimate.count,1607);assert.equal(views.landfill.calls.at(-1).options.reset,true);
    });
    check('fuel switches retain each configuration and flush the latest typed value',()=>{
        input('powerMW','3');
        const buttons=document.getElementById('dgFuel').querySelectorAll('[data-fuel]');
        fire(buttons[1],'click');renderScene();
        assert.equal(views.landfill.estimate.settings.powerMW,3);assert.equal(views.flare.estimate.settings.powerMW,10);
        input('model','Antminer S21 XP');renderScene();assert.equal(views.flare.estimate.settings.cooling,'air');
        siteAction('flare','lo');assert.equal(el('builder').hidden,true);assert.equal(document.querySelector('#dgViews-flare').hidden,false);
        siteAction('flare','hi');renderScene();assert.equal(views.flare.estimate.settings.cooling,'air');
        fire(buttons[0],'click');renderScene();assert.equal(el('powerMW').value,'3');
    });
    console.log('\n  '+passed+' mine builder UI checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
