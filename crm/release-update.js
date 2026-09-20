/* Release recovery only. No customer-record reads, writes, migrations or retries. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmRelease=api;
}(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const POLL_MS=5*60*1000,FOCUS_MS=60*1000,IDLE_MS=10*1000,SCHEMA=1;
  const versionPattern=/^[a-f0-9]{64}$/;
  function attributes(tag){const out={};for(const m of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g))out[m[1].toLowerCase()]=m[3];return out;}
  function shellInfo(html){
    const versions=[],references=[];
    for(const m of html.matchAll(/<(meta|script|link)\b[^>]*>/gi)){
      const tag=m[1].toLowerCase(),a=attributes(m[0]);
      if(tag==='meta'&&a.name==='proton-crm-release')versions.push(a.content);
      const rel=tag==='script'?a.src:tag==='link'&&a.rel==='stylesheet'?a.href:'';
      if(rel&&rel.startsWith('./'))references.push(rel);
    }
    return {version:versions.length===1?versions[0]:'',references:references.sort()};
  }
  function validManifest(value){
    return !!value&&value.schema===SCHEMA&&versionPattern.test(value.version)&&versionPattern.test(value.shellHash)
      &&Array.isArray(value.references)&&value.references.length>0&&value.references.length<=200
      &&new Set(value.references).size===value.references.length
      &&value.references.every(ref=>typeof ref==='string'&&/^\.\/[a-zA-Z0-9_./-]+\.(?:js|css)\?v=[a-f0-9]{12}$/.test(ref)&&!ref.split('/').includes('..'));
  }
  function start(options={},env={}){
    const win=env.window||root,doc=env.document||win.document,location=env.location||win.location;
    const fetcher=env.fetch||win.fetch?.bind(win),crypto=env.crypto||win.crypto;
    const now=env.now||Date.now,schedule=env.setInterval||win.setInterval?.bind(win),cancel=env.clearInterval||win.clearInterval?.bind(win);
    const setTimeoutFn=env.setTimeout||win.setTimeout?.bind(win),clearTimeoutFn=env.clearTimeout||win.clearTimeout?.bind(win);
    const current=env.currentVersion||doc?.querySelector('meta[name="proton-crm-release"]')?.content||'';
    const base=location?new URL('./',location.href):null;
    const digest=env.digest||(async bytes=>{
      const result=await crypto.subtle.digest('SHA-256',bytes);
      return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');
    });
    let stopped=false,checking=null,abort=null,lastCheck=-Infinity,pending=null,notice='',reloading=false,timer=null,lastInteraction=-Infinity,idleTimer=null;
    const status={currentVersion:current,pendingVersion:'',phase:'idle',lastError:''};
    function account(){try{const key=options.getAccountKey?.();return typeof key==='string'&&key.length>0&&key.length<=256?key:null;}catch(_){return null;}}
    function safe(){try{return !stopped&&!reloading&&!doc.hidden&&now()-lastInteraction>=IDLE_MS&&options.isSafeToReload?.()===true&&account()!==null;}catch(_){return false;}}
    function notify(phase,message){
      status.phase=phase;const key=phase+'|'+status.pendingVersion;
      if(key===notice)return;notice=key;
      try{options.onUpdatePending?.({version:status.pendingVersion,status:phase,message});}catch(_){}
    }
    function storage(){return env.storage||win.sessionStorage;}
    function key(name,identity){return 'proton.crm.release.'+name+':'+encodeURIComponent(base.origin+base.pathname)+':'+encodeURIComponent(identity);}
    function read(name,identity){try{return JSON.parse(storage().getItem(key(name,identity))||'null');}catch(_){return null;}}
    function reload(manifest){
      if(!safe()){defer();return false;}
      const identity=account(),attempt=read('attempt',identity);
      const attempts=Array.isArray(attempt?.attempts)?attempt.attempts:attempt?.target?[attempt]:[];
      if(attempts.some(a=>a.target===manifest.version&&a.from===current)||attempts.length>=16){notify('blocked','An update is available. Automatic reload already tried this release or reached its session limit; refresh when your work is safe.');return false;}
      const position={version:manifest.version,route:location.hash||'',x:Number(win.scrollX)||0,y:Number(win.scrollY)||0};
      try{
        storage().setItem(key('attempt',identity),JSON.stringify({attempts:[...attempts,{target:manifest.version,from:current}]}));
        storage().setItem(key('scroll',identity),JSON.stringify(position));
      }catch(_){notify('blocked','An update is available. Automatic reload is paused because browser session storage is unavailable.');return false;}
      // Last check is synchronous with navigation. A form/save opened during
      // any of the awaited network checks must keep this page intact.
      if(!safe()||account()!==identity){
        try{storage().removeItem(key('attempt',identity));storage().removeItem(key('scroll',identity));}catch(_){}
        defer();
        return false;
      }
      reloading=true;status.phase='reloading';location.reload();return true;
    }
    function defer(){if(!stopped){notify('pending','A CRM update is available. It will reload automatically after a brief pause when no draft, save or uncertain operation needs this page.');scheduleIdle();}}
    function scheduleIdle(){
      if(idleTimer!==null)clearTimeoutFn(idleTimer);
      const remaining=IDLE_MS-(now()-lastInteraction);
      if(pending&&remaining>0)idleTimer=setTimeoutFn(()=>{idleTimer=null;resume();},remaining);
    }
    // Only activity time is observed. Never inspect or store an input value.
    function interaction(){lastInteraction=now();scheduleIdle();}
    async function response(url,signal){
      if(url.origin!==base.origin)throw Error('Release check must remain on the CRM origin.');
      const result=await fetcher(url.href,{cache:'no-store',credentials:'same-origin',redirect:'error',signal});
      if(!result.ok||result.redirected||result.url&&new URL(result.url).origin!==base.origin)throw Error('Release response unavailable.');
      return result;
    }
    async function inspect(){
      const controller=new (env.AbortController||win.AbortController||AbortController)();abort=controller;
      const timeout=setTimeoutFn(()=>controller.abort(),30000);
      try{
        const raw=await (await response(new URL('release.json',base),controller.signal)).text();
        if(raw.length>64000)throw Error('Release manifest is oversized.');
        const manifest=JSON.parse(raw);if(!validManifest(manifest))throw Error('Release manifest is incompatible.');
        if(stopped)return;
        if(manifest.version===current){
          const wasPending=!!pending;pending=null;status.pendingVersion='';status.phase='current';
          if(wasPending)notify('current','The open CRM release is current.');
          return;
        }
        const shellBytes=await (await response(new URL('index.html',base),controller.signal)).arrayBuffer();
        const html=new TextDecoder().decode(shellBytes),info=shellInfo(html);
        if(info.version!==manifest.version||JSON.stringify(info.references)!==JSON.stringify(manifest.references.slice().sort())||await digest(shellBytes)!==manifest.shellHash)throw Error('Deployment shell and manifest do not match yet.');
        if(stopped)return;
        pending=manifest;status.pendingVersion=manifest.version;
        if(!safe()){defer();return;}
        // Verify the fetched shell's direct local JS/CSS, not only their names.
        // Four concurrent reads bound update traffic; normal polls read one manifest.
        let index=0;
        await Promise.all(Array.from({length:Math.min(4,manifest.references.length)},async()=>{
          while(index<manifest.references.length){
            const ref=manifest.references[index++],bytes=await (await response(new URL(ref,base),controller.signal)).arrayBuffer();
            if((await digest(bytes)).slice(0,12)!==new URL(ref,base).searchParams.get('v'))throw Error('Deployment assets do not match the shell yet.');
          }
        }));
        // Recheck the manifest after dependency reads so a deployment changing
        // under this check cannot be mistaken for one coherent target release.
        const final=await (await response(new URL('release.json',base),controller.signal)).json();
        if(!validManifest(final)||final.version!==manifest.version||final.shellHash!==manifest.shellHash||JSON.stringify(final.references)!==JSON.stringify(manifest.references))throw Error('Deployment changed during verification.');
        reload(manifest);
      }catch(error){status.lastError=error.message||'Release check unavailable.';}
      finally{clearTimeoutFn(timeout);if(abort===controller)abort=null;}
    }
    function check(force=false){
      if(stopped||reloading||!doc||doc.hidden||!fetcher||!base||!versionPattern.test(current))return Promise.resolve(false);
      if(checking)return checking;
      if(!force&&now()-lastCheck<FOCUS_MS)return Promise.resolve(false);
      lastCheck=now();status.lastError='';checking=inspect().finally(()=>{checking=null;});return checking;
    }
    function resume(){return pending?check(true):Promise.resolve(false);}
    function restoreScroll(){
      const identity=account();if(!identity||!safe())return false;
      const saved=read('scroll',identity);if(!saved||saved.version!==current||saved.route!==(location.hash||''))return false;
      if(![saved.x,saved.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1000000))return false;
      try{storage().removeItem(key('scroll',identity));storage().removeItem(key('attempt',identity));}catch(_){return false;}
      win.scrollTo(saved.x,saved.y);return true;
    }
    const focus=()=>{check();},activityEvents=['pointerdown','keydown','wheel','touchstart','input'];
    if(doc&&base&&versionPattern.test(current)&&fetcher&&schedule&&setTimeoutFn){
      win.addEventListener?.('focus',focus);doc.addEventListener?.('visibilitychange',focus);
      activityEvents.forEach(name=>win.addEventListener?.(name,interaction,{passive:true}));
      timer=schedule(focus,POLL_MS);check();
    }
    function stop(){stopped=true;if(timer!==null)cancel(timer);if(idleTimer!==null)clearTimeoutFn(idleTimer);abort?.abort();win.removeEventListener?.('focus',focus);doc?.removeEventListener?.('visibilitychange',focus);activityEvents.forEach(name=>win.removeEventListener?.(name,interaction));}
    return {check,resume,restore:restoreScroll,dispose:stop,restoreScroll,stop,status};
  }
  return {start,shellInfo,validManifest,POLL_MS,FOCUS_MS,IDLE_MS};
}));
