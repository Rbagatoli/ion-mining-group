/* Presentation rules only. Original records, stages and evidence remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmModel=api;}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const groups=[{id:'all',label:'All'},{id:'research',label:'Research'},{id:'conversation',label:'Conversations'},{id:'agreement',label:'Agreements'},{id:'closed',label:'Closed'}];
  function group(kind,stage){
    if(kind==='site')return ['dead','closed_won'].includes(stage)?'closed':['contacted','in_discussion'].includes(stage)?'conversation':['term_sheet','diligence','agreement'].includes(stage)?'agreement':'research';
    if(kind==='lead')return ['dnc','disqualified'].includes(stage)?'closed':['contacted','replied','meeting'].includes(stage)?'conversation':'research';
    return ['closed','accepted'].includes(stage)?'closed':['signed','delivery','proposed'].includes(stage)?'agreement':'conversation';
  }
  function pipeline(sites,leads,deals){return [
    ...sites.map(s=>({id:s.id,kind:'site',name:s.name,stage:s.stage,group:group('site',s.stage),subtitle:s.operator||s.energy_type||'Energy site',updated:s.updated||s.created||''})),
    ...leads.map(l=>({id:l.id,kind:'lead',name:l.company,stage:l.stage,group:group('lead',l.stage),subtitle:l.buyer||l.contact||'Revenue lead',updated:l.updatedAt||''})),
    ...deals.map(d=>({id:d.id,kind:'deal',name:d.name,stage:d.stage,group:group('deal',d.stage),subtitle:d.offer,updated:d.updatedAt||''}))
  ].sort((a,b)=>b.updated.localeCompare(a.updated)||a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id)));}
  function today({sites,leads,tasks,followups,date}){
    const siteMap=new Map(sites.map(s=>[String(s.id),s])),actions=[];
    followups.filter(f=>['pending','snoozed'].includes(f.status)&&f.due_date<=date).forEach(f=>{
      const site=siteMap.get(String(f.prospect_id));
      actions.push({id:f.id,kind:'followup',target:f.prospect_id,name:f.description,context:site?site.name:'Unlinked reminder',due:f.due_date,rank:f.due_date<date?0:2});
    });
    leads.filter(l=>!['dnc','disqualified'].includes(l.stage)&&l.due&&l.due<=date).forEach(l=>actions.push({id:l.id,kind:'lead',name:l.nextAction||'Set the next action',context:l.company,due:l.due,rank:l.due<date?0:2}));
    tasks.filter(t=>!['done','cancelled'].includes(t.status)&&(t.status==='review'||t.status==='blocked'||t.due&&t.due<=date)).forEach(t=>actions.push({id:t.id,kind:'task',name:t.title,context:t.status==='review'?'Result ready for your review':t.status==='blocked'?'Blocked · decision needed':'Team task',due:t.due,rank:t.status==='review'?1:t.status==='blocked'?2:3}));
    return actions.sort((a,b)=>a.rank-b.rank||(a.due||'9999').localeCompare(b.due||'9999')||String(a.id).localeCompare(String(b.id)));
  }
  function safeUrl(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch(_){return null;}}
  function checkedStore(raw,container){
    if(raw===null)return null;
    let value;try{value=JSON.parse(raw);}catch(_){throw new Error('Saved CRM data is unreadable. Export a backup before recovery.');}
    if(!value||value._v!==1||!Array.isArray(value[container])||value[container].some(r=>!r||typeof r!=='object'||r.id==null))throw new Error('Saved CRM data has an unsupported format. Export a backup before recovery.');
    return value;
  }
  function compareDiscovery(a,b,sort){
    if(sort==='name')return a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id));
    const key=sort==='capital'?'cash':'priority',av=a[key],bv=b[key];
    if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;
    if(av!==bv&&av!=null&&bv!=null)return sort==='capital'?av-bv:bv-av;
    return a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id));
  }
  function money(value){return value==null?'Not priced':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);}
  // Group only exact authority identities. Never combine equipment or add capacities.
  function groupSources(rows,keyFor){
    const groups=new Map();rows.forEach(row=>{const key=keyFor(row)||'record:'+row.id;let group=groups.get(key);if(!group){group={representative:row,records:[]};groups.set(key,group);}group.records.push(row.id);});
    return Array.from(groups.values()).map(g=>Object.assign({},g.representative,{sourceRecords:g.records}));
  }
  return {groups,group,pipeline,today,safeUrl,checkedStore,compareDiscovery,groupSources,money};
}));
