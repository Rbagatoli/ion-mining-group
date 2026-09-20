'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../crm/release-update'),B=require('../tools/build-crm.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const OLD=hash('old release'),NEW=hash('new release'),OTHER=hash('another release');
function fixture(version=NEW){
  const files={'app.js':'window.syntheticRelease = true;','app.css':'body { color: orange; }'};
  const references=Object.entries(files).map(([name,body])=>'./'+name+'?v='+hash(body).slice(0,12)).sort();
  const html='<html><head><meta name="proton-crm-release" content="'+version+'"><link rel="stylesheet" href="'+references.find(r=>r.includes('.css'))+'"></head><body><script src="'+references.find(r=>r.includes('.js'))+'" defer></script></body></html>';
  return {files,html,manifest:{schema:1,version,shellHash:hash(html),references}};
}
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function events(){const listeners=new Map();return {listeners,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},emit:name=>listeners.get(name)?.()};}
function setup(options={}){
  const release=options.release||fixture(),doc={...events(),hidden:false},win={...events(),scrollX:0,scrollY:380,scrollTo:(x,y)=>{h.restored.push([x,y]);}};
  const h={release,doc,win,clock:1000000,safe:options.safe!==false,account:'user-a',requests:[],notices:[],reloads:0,restored:[],intervals:new Map(),timeouts:new Map(),store:options.store||storage()};
  const location={href:'https://example.test/crm/?release=legacy#team',hash:'#team',reload:()=>{h.reloads++;}};
  let timer=0;
  const env={window:win,document:doc,location,currentVersion:options.current||OLD,storage:h.store,now:()=>h.clock,
    digest:async bytes=>hash(new Uint8Array(bytes)),AbortController,
    setTimeout:(fn,ms)=>{h.timeouts.set(++timer,{fn,at:h.clock+ms});return timer;},clearTimeout:id=>h.timeouts.delete(id),
    setInterval:(fn,ms)=>{h.intervals.set(++timer,{fn,ms});return timer;},clearInterval:id=>h.intervals.delete(id),
    fetch:async(url,init)=>{
      h.requests.push({url,init});
      if(options.fetch)await options.fetch(url,init,h);
      const route=new URL(url),rel=route.pathname.split('/').pop();
      const body=rel==='release.json'?JSON.stringify(h.release.manifest):rel==='index.html'?h.release.html:h.release.files[rel];
      if(body===undefined)throw Error('Unexpected request: '+url);
      return {ok:true,redirected:false,url,text:async()=>body,json:async()=>JSON.parse(body),arrayBuffer:async()=>Uint8Array.from(Buffer.from(body)).buffer};
    }};
  h.options={isSafeToReload:()=>h.safe,getAccountKey:()=>h.account,onUpdatePending:notice=>h.notices.push(notice)};
  h.env=env;h.location=location;h.controller=R.start(h.options,env);h.done=()=>h.controller.check();return h;
}

test('coherent new package reloads once without a notice and preserves route/account; only position and loop metadata stored',async()=>{
  const h=setup();await h.done();
  assert.equal(h.reloads,1);assert.equal(h.notices.length,0);assert.equal(h.location.hash,'#team');assert.equal(h.location.href,'https://example.test/crm/?release=legacy#team');assert.equal(h.account,'user-a');
  assert.equal(h.store.values.size,2);for(const [key,value]of h.store.values){assert.match(key,/proton\.crm\.release\.(attempt|scroll):/);assert.doesNotMatch(value,/customer|draft|password|email/);}
  assert.equal(h.requests.filter(r=>r.url.endsWith('release.json')).length,2);
  for(const request of h.requests){assert.equal(request.init.cache,'no-store');assert.equal(request.init.credentials,'same-origin');assert.equal(request.init.redirect,'error');assert.equal(new URL(request.url).origin,'https://example.test');}
  h.controller.dispose();
});

test('unchanged release only reads one small manifest and does not refresh',async()=>{
  const h=setup({release:fixture(OLD)});await h.done();assert.equal(h.reloads,0);assert.equal(h.requests.length,1);assert.equal(h.controller.status.phase,'current');h.controller.dispose();
});

test('open draft defers dependency reads and shows one notice; resume verifies again and never copies the draft',async()=>{
  const h=setup({safe:false});h.syntheticDraft={body:'Unsaved private draft'};await h.done();
  assert.equal(h.reloads,0);assert.equal(h.requests.length,2);assert.equal(h.notices.length,1);assert.equal(h.store.values.size,0);
  await h.controller.resume();assert.equal(h.notices.length,1);assert.equal(h.store.values.size,0);
  h.safe=true;await h.controller.resume();assert.equal(h.reloads,1);assert.deepEqual(h.syntheticDraft,{body:'Unsaved private draft'});
  assert.ok([...h.store.values.values()].every(value=>!value.includes('Unsaved private draft')));h.controller.dispose();
});

test('active browsing defers reload for ten quiet seconds then resumes automatically',async()=>{
  const h=setup({safe:false});await h.done();h.safe=true;h.win.emit('wheel');await h.controller.resume();assert.equal(h.reloads,0);
  h.clock+=9000;h.win.emit('pointerdown');assert.equal(h.timeouts.size,1);
  h.clock+=R.IDLE_MS;for(const [id,timer]of [...h.timeouts])if(timer.at<=h.clock){h.timeouts.delete(id);timer.fn();}
  await h.done();assert.equal(h.reloads,1);assert.equal(h.notices.length,1);h.controller.dispose();assert.equal(h.timeouts.size,0);
});

test('rollback to the open release clears a prior pending notice without reloading',async()=>{
  const h=setup({safe:false});await h.done();h.release=fixture(OLD);await h.controller.resume();
  assert.equal(h.notices.length,2);assert.equal(h.notices[1].status,'current');assert.equal(h.controller.status.pendingVersion,'');assert.equal(h.reloads,0);h.controller.dispose();
});

test('a save becoming pending during dependency verification blocks the final navigation',async()=>{
  const h=setup({fetch:async(url,init,h)=>{if(url.includes('app.js'))h.safe=false;}});await h.done();
  assert.equal(h.reloads,0);assert.equal(h.notices.length,1);assert.equal(h.store.values.size,0);
  h.controller.dispose();
});

test('synchronous account/safety change during session write removes attempted navigation metadata',async()=>{
  const saved=storage(),original=saved.setItem;let h;
  saved.setItem=(key,value)=>{original(key,value);if(key.includes('.scroll:'))h.account='user-b';};
  h=setup({store:saved});await h.done();assert.equal(h.reloads,0);assert.equal(saved.values.size,0);h.controller.dispose();
});

test('unknown account or throwing/nonboolean safety gates cannot enable reload',async()=>{
  const h=setup({safe:false});await h.done();h.safe=true;h.account=null;await h.controller.resume();assert.equal(h.reloads,0);
  h.account='user-a';h.options.isSafeToReload=()=>{throw Error('sync uncertain');};await h.controller.resume();assert.equal(h.reloads,0);
  h.options.isSafeToReload=()=>1;await h.controller.resume();assert.equal(h.reloads,0);h.controller.dispose();
});

test('offline check recovers on later visible poll without writing or retrying customer records',async()=>{
  let offline=true;const h=setup({fetch:async()=>{if(offline)throw Error('offline');}});await h.done();
  assert.equal(h.reloads,0);assert.equal(h.store.values.size,0);assert.equal(h.notices.length,0);assert.match(h.controller.status.lastError,/offline/);
  offline=false;h.clock+=R.POLL_MS;[...h.intervals.values()][0].fn();await h.done();assert.equal(h.reloads,1);h.controller.dispose();
});

test('five-minute visible poll and one-minute focus throttle coalesce requests; hidden pages make no requests',async()=>{
  const h=setup({release:fixture(OLD)});await h.done();assert.equal([...h.intervals.values()][0].ms,R.POLL_MS);
  h.win.emit('focus');h.doc.emit('visibilitychange');await h.done();assert.equal(h.requests.length,1);
  h.doc.hidden=true;h.clock+=R.POLL_MS;[...h.intervals.values()][0].fn();await h.done();assert.equal(h.requests.length,1);
  h.doc.hidden=false;h.doc.emit('visibilitychange');h.win.emit('focus');await h.done();assert.equal(h.requests.length,2);
  h.controller.dispose();assert.equal(h.intervals.size,0);assert.equal(h.win.listeners.size,0);assert.equal(h.doc.listeners.size,0);
  h.clock+=R.POLL_MS;await h.controller.check(true);assert.equal(h.requests.length,2);
});

for(const fault of ['wrong-meta','wrong-shell-hash','wrong-reference','old-dependency','changing-manifest'])test('mixed deployment is rejected: '+fault,async()=>{
  const release=fixture();let manifests=0;
  if(fault==='wrong-meta')release.html=release.html.replace(NEW,OLD);
  if(fault==='wrong-shell-hash')release.manifest.shellHash=hash('different shell');
  if(fault==='wrong-reference')release.manifest.references[0]='./other.css?v=0123456789ab';
  if(fault==='old-dependency')release.files['app.js']='Old served asset';
  const h=setup({release,fetch:async(url,init,h)=>{if(url.endsWith('release.json')&&++manifests===2&&fault==='changing-manifest')h.release.manifest.version=OTHER;}});
  await h.done();assert.equal(h.reloads,0);assert.equal(h.store.values.size,0);assert.match(h.controller.status.lastError,/match|changed/);h.controller.dispose();
});

test('loop guard survives an old shell reload, and successful new-shell restore consumes only its account position',async()=>{
  const saved=storage(),first=setup({store:saved});await first.done();first.controller.dispose();assert.equal(first.reloads,1);
  const stale=setup({store:saved});await stale.done();assert.equal(stale.reloads,0);assert.equal(stale.notices[0].status,'blocked');stale.controller.dispose();
  const fresh=setup({store:saved,current:NEW});await fresh.done();
  fresh.account='user-b';assert.equal(fresh.controller.restore(),false);fresh.account='user-a';fresh.location.hash='#pipeline';assert.equal(fresh.controller.restore(),false);
  fresh.location.hash='#team';fresh.safe=false;assert.equal(fresh.controller.restore(),false);fresh.safe=true;
  assert.equal(fresh.controller.restore(),true);assert.deepEqual(fresh.restored,[[0,380]]);assert.equal(saved.values.size,0);assert.equal(fresh.controller.restore(),false);fresh.controller.dispose();
});

test('alternating deployments cannot repeatedly reload the same stale source shell',async()=>{
  const saved=storage(),first=setup({store:saved});await first.done();first.controller.dispose();assert.equal(first.reloads,1);
  const second=setup({store:saved,release:fixture(OTHER)});await second.done();second.controller.dispose();assert.equal(second.reloads,1);
  const repeated=setup({store:saved});await repeated.done();assert.equal(repeated.reloads,0);assert.equal(repeated.notices[0].status,'blocked');repeated.controller.dispose();
});

test('session storage denial cannot trigger a reload loop',async()=>{
  const h=setup({store:{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}}});await h.done();
  assert.equal(h.reloads,0);assert.equal(h.notices[0].status,'blocked');assert.match(h.notices[0].message,/session storage/);h.controller.dispose();
});

test('dispose aborts a pending check without reload',async()=>{
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const h=setup({fetch:async(url,init)=>{entered();await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}});
  await started;h.controller.dispose();await h.done();assert.equal(h.reloads,0);assert.equal(h.requests[0].init.signal.aborted,true);
});

test('source development shell does not poll; invalid manifests and traversal references are not compatible',async()=>{
  const h=setup({current:'development'});await h.done();assert.equal(h.requests.length,0);assert.equal(h.intervals.size,0);h.controller.dispose();
  const good=fixture().manifest;assert.equal(R.validManifest(good),true);
  for(const bad of [{...good,schema:2},{...good,version:'yesterday'},{...good,references:['./../runtime.js?v=0123456789ab']},{...good,references:['https://other.test/app.js?v=0123456789ab']},{...good,references:[good.references[0],good.references[0]]}])assert.equal(R.validManifest(bad),false);
  assert.equal(R.shellInfo('<meta name="proton-crm-release" content="'+OLD+'"><meta name="proton-crm-release" content="'+NEW+'">').version,'');
});

test('release version covers every declared package byte and path, regardless of entry order',()=>{
  const files=new Map([['index.html',Buffer.from('<p>shell</p>')],['main.js',Buffer.from('runtime')],['main.css',Buffer.from('styles')],['data/sites.json',Buffer.from('[]')],['icon.png',Buffer.from([1,2,3])]]);
  const entries=[...files.keys()].map(to=>({to})),original=B.packageVersion(entries,to=>files.get(to));
  assert.equal(B.packageVersion(entries.slice().reverse(),to=>files.get(to)),original);
  for(const [name,body]of files){files.set(name,Buffer.concat([body,Buffer.from('changed')]));assert.notEqual(B.packageVersion(entries,to=>files.get(to)),original,name+' must affect release');files.set(name,body);}
  const renamed=entries.map(a=>({to:a.to==='main.css'?'renamed.css':a.to}));assert.notEqual(B.packageVersion(renamed,to=>files.get(to==='renamed.css'?'main.css':to)),original);
});

test('Windows and Linux text produce the same packaged release; binary bytes remain exact',()=>{
  const entries=['index.html','app.js','main.css','data/sites.json','icon.svg','manifest.webmanifest','runtime/LICENSE','guide.md','notes.txt'].map(to=>({to}));
  const linux=Buffer.from('first\nsecond\n'),windows=Buffer.from('first\r\nsecond\r\n');
  assert.equal(B.packageVersion(entries,rel=>B.packageBytes(rel,linux)),B.packageVersion(entries,rel=>B.packageBytes(rel,windows)));
  const binary=Buffer.from([0,13,10,255]);assert.equal(B.packageBytes('texture.png',binary),binary);assert.deepEqual(B.packageBytes('texture.png',binary),Buffer.from([0,13,10,255]));
});
