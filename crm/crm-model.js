/* Presentation rules only. Original records, stages and evidence remain authoritative. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../agent-control-model'):root.AgentControlModel);if(typeof module==='object'&&module.exports)module.exports=api;else root.ProtonCrmModel=api;}(typeof window!=='undefined'?window:globalThis,function(A){
  'use strict';
  const groups=[{id:'all',label:'All'},{id:'research',label:'Research'},{id:'conversation',label:'Conversations'},{id:'agreement',label:'Agreements'},{id:'closed',label:'Closed'}];
  function group(kind,stage){
    if(kind==='site')return ['dead','closed_won'].includes(stage)?'closed':['contacted','in_discussion'].includes(stage)?'conversation':['term_sheet','diligence','agreement'].includes(stage)?'agreement':'research';
    if(kind==='lead')return ['dnc','disqualified'].includes(stage)?'closed':['contacted','replied','meeting'].includes(stage)?'conversation':'research';
    return ['closed','accepted'].includes(stage)?'closed':['signed','delivery','proposed'].includes(stage)?'agreement':'conversation';
  }
  function pipeline(sites,leads,deals){return [
    ...sites.map(s=>({id:s.id,kind:'site',name:s.name,stage:s.stage,group:group('site',s.stage),subtitle:(s.custom_fields?.managedHosting?'Managed Energy Hosting · ':'')+(s.operator||s.energy_type||'Energy site'),updated:s.updated||s.created||''})),
    ...leads.map(l=>({id:l.id,kind:'lead',name:l.company,stage:l.stage,group:group('lead',l.stage),subtitle:[A.OFFERS[l.offer],l.buyer||l.contact].filter(Boolean).join(' · ')||'Revenue lead',updated:l.updatedAt||''})),
    ...deals.map(d=>({id:d.id,kind:'deal',name:d.name,stage:d.stage,group:group('deal',d.stage),subtitle:A.OFFERS[d.offer]||d.offer||'Service opportunity',updated:d.updatedAt||''}))
  ].sort((a,b)=>b.updated.localeCompare(a.updated)||a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id)));}
  function today({sites,leads,tasks,followups,date,state}){
    const siteMap=new Map(sites.map(s=>[String(s.id),s])),actions=[];
    followups.filter(f=>['pending','snoozed'].includes(f.status)&&f.due_date<=date).forEach(f=>{
      const site=siteMap.get(String(f.prospect_id));
      actions.push({id:f.id,kind:'followup',target:f.prospect_id,name:f.description,context:site?site.name:'Unlinked reminder',due:f.due_date,rank:f.due_date<date?0:2});
    });
    leads.forEach(l=>{
      const contact=state&&A.outreachForLead(state,l,{now:date+'T12:00:00Z'});
      if(contact?.unknown){actions.push({id:l.id,kind:'lead',name:'Reconcile uncertain contact before retry',context:l.company,due:date,rank:-2});return;}
      if(contact?.paused&&!contact.suppressed){actions.push({id:l.id,kind:'lead',name:'Review reply · prospecting paused',context:l.company,due:date,rank:-1});return;}
      if(contact?.suppressed||contact?.parked||['dnc','disqualified'].includes(l.stage))return;
      if(l.due&&l.due<=date)actions.push({id:l.id,kind:'lead',name:l.nextAction||'Set the next action',context:l.company,due:l.due,rank:l.due<date?0:2});
    });
    tasks.filter(t=>A.actionable(t)&&(t.routing?.reviewOwner==='owner'||t.status==='review'||t.status==='blocked'||t.due&&t.due<=date)).forEach(t=>actions.push({id:t.id,kind:'task',name:t.title,context:t.routing?.reviewOwner==='owner'?'Owner decision · '+t.routing.reason:t.status==='review'?'Team review · '+(A.reviewRole({tasks},t)==='revenue'?'Revenue Lead':'Quality Review'):t.status==='blocked'?(t.blockerKind==='correction'?'Corrections requested':'Execution blocker · Revenue Lead'):'Team task',due:t.due,rank:t.routing?.reviewOwner==='owner'?0:t.status==='review'?1:t.status==='blocked'?2:3}));
    if(state)actions.forEach(action=>{
      if(action.kind!=='task')return;
      const task=tasks.find(t=>t.id===action.id);
      if(task.role!=='outreach'||task.status==='review'||task.routing?.reviewOwner==='owner')return;
      const lead=leads.find(l=>l.id===task.leadId),contact=lead&&A.outreachForLead(state,lead,{now:date+'T12:00:00Z'});
      if(lead?.stage==='dnc'||contact?.suppressed){action.name='Review stale outreach · contact restricted';action.context='Revenue Lead · keep refusal in place';}
      else if(contact?.unknown){action.name='Reconcile uncertain contact before retry';action.context='Revenue Lead · check actual provider outcome';action.rank=-2;}
      else if(contact?.paused){action.name='Review buyer reply · prospecting paused';action.context='Revenue Lead · requested conversation only';action.rank=-1;}
      else if(contact?.parked){action.name='Review stale outreach · sequence parked';action.context='Revenue Lead · no automatic restart';}
    });
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
