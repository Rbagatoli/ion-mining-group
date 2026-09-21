/* Adapters to the existing Proton stores. No migration, duplicate CRM database or uploads on boot. */
(function(root){
  'use strict';
  const M=root.ProtonCrmModel;
  const records=[['sites',SiteData.KEY,'sites'],['contacts',CrmContacts.KEY,'contacts'],['crmFollowups',CrmFollowups.KEY,'items'],['crmLog',CrmLog.KEY,'entries']];
  const syncKeys=['sites','contacts','crmFollowups','crmLog','crmConfig','crmDocuments','crmEnrichment'];
  function create(){
    let uid=null,epoch=0,ready=typeof firebase==='undefined',sessionError='',syncError='',catalogError='',loading=null,priced=new Map(),listeners=[];
    const syncProblems=new Map(),syncPending=new Set();
    let syncPersistenceProblem='';
    let inFlightWrites=0,uncertainWrites=0;
    const agent=AgentControlStore.create({db:typeof firebase!=='undefined'?firebase.firestore():null});
    let agentView=agent.snapshot();
    const reset=()=>{CrmContacts.reset();CrmFollowups.reset();CrmLog.reset();CrmConfig.reset();CrmConfig.publish();priced.clear();};
    function emit(reason){listeners.forEach(fn=>fn(reason));}
    function verify(){records.forEach(([,key,box])=>M.checkedStore(localStorage.getItem(key),box));}
    function status(){let err=sessionError;try{verify();}catch(e){err=e.message;}return {uid,epoch,ready,error:err,syncError,agent:agentView,catalogError};}
    function snapshot(){return {epoch,uid,raw:records.map(([,key])=>localStorage.getItem(key))};}
    function reloadSafety(){
      const reasons=[],s=status();
      if(!s.ready||s.error)reasons.push('workspace-not-ready');
      if(s.syncError)reasons.push('record-sync-needs-attention');
      if(syncPending.size)reasons.push('record-sync-pending');
      if(inFlightWrites)reasons.push('write-in-flight');
      if(uncertainWrites)reasons.push('write-outcome-unconfirmed');
      try{
        if(localStorage.getItem('protonAccountSwitch'))reasons.push('account-switch-pending');
        if(uid){
          if(localStorage.getItem('protonMiningLastUid')!==uid)reasons.push('account-changed');
          const raw=localStorage.getItem('protonSyncOutbox:'+uid);
          if(raw!==null){const outbox=JSON.parse(raw);if(!outbox||typeof outbox!=='object'||Array.isArray(outbox))reasons.push('sync-outbox-unreadable');else if(Object.keys(outbox).length)reasons.push('sync-outbox-pending');}
        }
      }catch(_){reasons.push('sync-outbox-unreadable');}
      return Object.freeze({safe:reasons.length===0,reasons:Object.freeze(reasons),inFlight:inFlightWrites,uncertain:uncertainWrites});
    }
    async function trackedWrite(work){
      const original={uid,epoch};inFlightWrites++;
      try{const result=await work(original);if(original.uid!==uid||original.epoch!==epoch)throw Error('The account changed while saving. Check the original account before continuing.');return result;}
      catch(e){uncertainWrites++;throw e;}
      finally{inFlightWrites--;}
    }
    function assertWrite(stamp){
      if(!ready||sessionError)throw Error(sessionError||'Wait for the account connection.');
      verify();
      if(stamp&&(stamp.epoch!==epoch||stamp.uid!==uid||stamp.raw.some((raw,i)=>raw!==localStorage.getItem(records[i][1]))))throw Error('The workspace changed while this form was open. Your draft is still here; copy it before reopening the latest record.');
    }
    async function write(fn,stamp){
      return trackedWrite(original=>{
        const work=()=>{if(original.uid!==uid||original.epoch!==epoch)throw Error('The account changed while waiting to save.');assertWrite(stamp);reset();const result=fn();if(!result||!result.partial&&result.ok===false||result._save&&result._save.ok===false)throw Error(result&&result.err||result&&result._save&&result._save.err||'The change could not be saved.');reset();emit('records');return result;};
        return navigator.locks?navigator.locks.request('proton-crm-records-v1',work):work();
      });
    }
    async function readAgentRegister(){
      const original={uid,epoch};
      function assertAccount(){
        if(original.uid!==uid||original.epoch!==epoch)throw Error('The account changed while reading. Reopen the original account before continuing.');
        const current=status();
        if(!current.uid||!current.ready||current.error||current.agent.uid!==current.uid||current.agent.mode!=='cloud'||current.agent.error||current.agent.serverConfirmed!==true)throw Error('Wait for a confirmed signed-in CRM connection before reading the work register.');
      }
      assertAccount();
      let result;
      try{result=await agent.readServer();}catch(e){assertAccount();throw e;}
      assertAccount();
      if(!result||result.uid!==original.uid||result.serverConfirmed!==true||typeof result.observedAt!=='string'||!Number.isFinite(Date.parse(result.observedAt)))throw Error('The server read did not confirm this account’s work register.');
      return {uid:original.uid,epoch:original.epoch,serverConfirmed:true,observedAt:result.observedAt,state:result.state};
    }
    async function dispatch(type,payload,revision){
      return trackedWrite(()=>{
        if(!ready||sessionError)throw Error(sessionError||'Wait for the account connection.');
        return agent.dispatch({type,payload,revision:revision==null?agentView.state.revision:revision,id:'ev_'+crypto.randomUUID(),at:new Date().toISOString()});
      });
    }
    agent.subscribe(view=>{agentView=view;emit('agents');});
    async function auth(user){
      epoch++;ready=false;sessionError='';SyncEngine.stopAll();
      try{
        const last=localStorage.getItem('protonMiningLastUid');
        if(user){
          if(last&&(last!==user.uid||localStorage.getItem('protonAccountSwitch')))SyncEngine.switchAccount(last,user.uid);
          localStorage.setItem('protonMiningLastUid',user.uid);
        }
        uid=user?user.uid:null;reset();agent.setUser(user);ready=true;
        if(user)syncKeys.forEach(key=>SyncEngine.listen(key,()=>{reset();emit('remote');}));
      }catch(e){sessionError='Account connection paused: '+e.message;ready=true;}
      emit('account');
    }
    if(typeof firebase!=='undefined')firebase.auth().onAuthStateChanged(auth,e=>{ready=true;sessionError=e.message;emit('account');});
    else reset();
    root.addEventListener('storage',e=>{
      if(e.key==='protonMiningLastUid'&&uid&&e.newValue!==uid){epoch++;sessionError='The account changed in another Proton window. Reload before editing.';SyncEngine.stopAll();emit('account');return;}
      if(e.key===null||records.some(r=>r[1]===e.key)||e.key===CrmConfig.KEY){reset();emit('remote');}
    });
    root.addEventListener('proton:sync-status',e=>{
      const detail=e.detail||{},failed=['error','held','conflict'].includes(detail.state);
      if(detail.key===''&&failed){
        // The global outbox error has no operation identity. A later saved event
        // cannot prove that these particular changes survived; retain the hold.
        syncPersistenceProblem=detail.reason||'Pending changes could not be saved for retry. Keep this page open and export a backup.';
      }else if(syncKeys.includes(detail.key)){
        // SyncEngine suppresses completion events after an account-generation
        // change. Never let a new account/session clear the old session's hold.
        const key=JSON.stringify([uid,epoch,detail.key]);
        if(detail.state==='pending')syncPending.add(key);
        else if(failed)syncProblems.set(key,detail.reason||'Record sync needs attention. Keep this page open until the save is confirmed.');
        else if(detail.state==='saved'){syncPending.delete(key);syncProblems.delete(key);}
      }else return;
      syncError=[...new Set([syncPersistenceProblem,...syncProblems.values()].filter(Boolean))].join(' ');emit('sync');
    });
    function candidate(site){
      const id=site.discovery&&site.discovery.sourceRecordId;
      const found=ProspectStore.get(id)||ProspectStore.get(site.id);
      if(found&&SiteIdentity.matchesSource(site,found))return found;
      return {id:site.id,name:site.name,energyType:site.energy_type||'unknown',source:site.discovery&&site.discovery.sourceId||'manual',lat:site.latitude,lng:site.longitude,iso3:site.jurisdiction,operator:site.operator,powerPotentialKw:null,existingGenerationKw:null,sourceDetail:{},sourceSnapshot:site.discovery&&site.discovery.sourceSnapshot||null};
    }
    function saved(c){return SiteIdentity.savedForCandidate(SiteData.list(),c)||null;}
    function estimate(c,site){
      const ctx={screened:SiteCapacity.usableCapacity(c)};ctx.profile=ProspectDiligence.profile(c,site||null,ctx);
      ctx.profile.inventory=ProtonPublicInfrastructure.enrichInventory(c,ctx.profile.inventory);
      return ProspectCapital.estimate(c,site||null,ctx);
    }
    function priority(c,site,e,cashLimit){return ProspectPriority.evaluate(c,{saved:site,estimate:e,manual:site?CrmContacts.contactCtx(site.id):null,operator:{operator:c.operator||site&&site.operator},availability:SiteAvailability.evaluate(c),cashLimitUsd:cashLimit});}
    function summary(c,site,cashLimit){
      const key=String(c.id)+'|'+(site&&site.updated||'')+'|'+(cashLimit==null?'':cashLimit)+'|'+ProspectDiligence.today();if(priced.has(key))return priced.get(key);
      const e=estimate(c,site),p=priority(c,site,e,cashLimit);
      const infrastructureReported=e.inventory.some(a=>['collection','generation','gas_treatment','electrical','civil','mining_infrastructure'].includes(a.id)&&['reported','historical','present'].includes(a.presence)&&(a.userRecorded||a.id==='generation'||a.id==='collection'&&/^(yes|shutdown)$/i.test(c.sourceDetail?.collectionSystem||'')));
      const out={id:c.id,name:c.name||c.id,kind:c.energyType,country:c.iso3,operator:c.operator||c.operatorId||'',cash:e.ready?e.base:null,priority:p.sortValue,label:p.label,next:p.nextAction,kw:e.targetKw,budgetComplete:e.budget.complete,quotedBudget:e.budget.complete&&!e.budget.allowanceCount,infrastructureReported,reuseDocumented:!!e.creditedAssets?.length};
      priced.set(key,out);return out;
    }
    function load(){
      if(loading)return loading;
      catalogError='';
      loading=ProspectStore.load().then(r=>{catalogError=(r.errors||[]).map(e=>typeof e==='string'?e:e.message||e.error||JSON.stringify(e)).join('; ');emit('catalog');return r;}).catch(e=>{loading=null;catalogError=e.message;emit('catalog');throw e;});
      return loading;
    }
    function backup(){const out={format:'proton-crm-backup-v1',exportedAt:new Date().toISOString(),uid,stores:{},agentRegister:agent.raw()};syncKeys.forEach(k=>{const cfg=SyncEngine.SYNC_KEYS[k];if(cfg)out.stores[cfg.lsKey]=localStorage.getItem(cfg.lsKey);});return out;}
    return {status,snapshot,reloadSafety,write,dispatch,readAgentRegister,load,candidate,saved,estimate,priority,summary,backup,agent:()=>agentView.state,subscribe:fn=>{listeners.push(fn);return()=>{listeners=listeners.filter(listener=>listener!==fn);};},sites:()=>{verify();return SiteData.list();},contacts:()=>{verify();return CrmContacts.list();},followups:()=>{verify();return CrmFollowups.pending();},
      saveSite:(id,patch,stamp)=>write(()=>id?SiteData.update(id,patch):SiteData.add(patch),stamp),
      track:(c,stamp)=>write(()=>SiteData.fromCandidate(c),stamp),
      stage:(id,value,reason,stamp)=>write(()=>SiteData.setStage(id,value,{deadReason:reason}),stamp),
      diligence:(id,command,stamp)=>write(()=>{const site=SiteData.get(id);if(!site)throw Error('This site is no longer in the pipeline.');const r=ProspectDiligence.apply(site,command);if(!r.ok)return r;return SiteData.update(id,{custom_fields:Object.assign({},site.custom_fields,{[ProspectDiligence.KEY]:r.diligence})});},stamp),
      contact:(id,value,stamp)=>write(()=>id?CrmContacts.update(id,value):CrmContacts.add(value),stamp),
      followup:(value,stamp)=>write(()=>CrmFollowups.add(value),stamp),
      complete:(id,stamp)=>write(()=>CrmFollowups.done(id),stamp),
      interaction:(id,value,stamp)=>write(()=>CrmInteractions.log(id,value),stamp)
    };
  }
  root.ProtonCrmData={create};
}(window));
