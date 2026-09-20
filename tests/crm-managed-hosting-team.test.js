'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const A=require('../agent-control-model'),G=require('../crm/grok-team'),H=require('../crm/grok-managed-hosting');
let sequence=0;
const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'hosting_test_'+(++sequence),at:'2026-09-17T20:00:00Z'});

test('every hosting workflow saves as a draft using existing roles without altering earlier work',()=>{
  let state=apply(A.initial(),'task.add',{id:'existing',title:'Existing review',role:'review',brief:'Preserve original scope'});
  const original=JSON.stringify(state.tasks[0]);
  const context={siteId:'site_synthetic',siteName:'Synthetic phase',siteUrl:'https://example.test/crm/#pipeline/site/site_synthetic'};
  for(const key of Object.keys(H.workflows)){
    const draft=G.managedHostingAssignment(key,context);
    state=apply(state,'task.add',{id:'test_'+key,...draft});
    const saved=state.tasks.at(-1);
    assert.equal(saved.status,'draft');assert.equal(saved.handoffAt,'');assert.equal(saved.startedAt,'');
    assert.match(saved.brief,/site_synthetic/);assert.match(saved.brief,/Service: managed_energy_hosting/);
    assert.match(saved.brief,/No reserve is funded/);assert.match(saved.brief,/No outreach, orders, payments, signatures/);
    assert(A.ROLES.some(r=>r.id===saved.role));assert(saved.brief.length<=9000);
  }
  assert.equal(JSON.stringify(state.tasks[0]),original);assert.equal(state.deals.length,0);assert.equal(state.entries.length,0);
  assert.equal(state.tasks.length,9);assert.equal(state.goalCents,500000);
});

test('linked draft preserves an existing deal without inventing fees or commitment state',()=>{
  let state=apply(A.initial(),'deal.save',{id:'deal_existing',name:'Synthetic scoped assignment',offer:'brief',feeCents:0,stage:'qualified',contact:'',notes:'Scope pending'});
  const original=JSON.stringify(state.deals);
  const draft=H.assignment('hosting_launch',{siteId:'site_test',siteName:'Synthetic site',siteUrl:'https://example.test/crm/#pipeline/site/site_test',dealId:'deal_existing'});
  state=apply(state,'task.add',{id:'launch_draft',...draft});
  assert.equal(state.tasks[0].dealId,'deal_existing');assert.equal(state.tasks[0].status,'draft');assert.equal(JSON.stringify(state.deals),original);
  const packet=G.packet({...state,paused:true},state.tasks[0],'https://example.test/crm/');
  assert.match(packet,/PAUSED/);assert.match(packet,/payment backstop/i);assert.match(packet,/not physical occupancy/);assert.match(packet,/Copying this packet does not send it/);
});

test('assignment inputs remain bounded and cannot inject extra context lines or credential URLs',()=>{
  for(const bad of ['missing','constructor','__proto__'])assert.throws(()=>H.assignment(bad),/workflow/);
  for(const siteUrl of ['javascript:alert(1)','https://user:password@example.test/','not a url'])assert.throws(()=>H.assignment('hosting_fit',{siteUrl}));
  assert.throws(()=>H.assignment('hosting_fit',{siteName:'site\nFunding: active'}),/site name/);
  assert.throws(()=>H.assignment('hosting_fit',{dealId:'bad/id'}),/deal ID/);
  assert.throws(()=>H.assignment('hosting_fit',{siteName:'x'.repeat(181)}),/site name/);
  const draft=H.assignment('hosting_economics',{siteId:'x'.repeat(180),siteName:'y'.repeat(180),siteUrl:'https://example.test/'+ 'z'.repeat(1750),dealId:'d'.repeat(90)});
  assert(draft.brief.length<=9000);assert(draft.title.length<=180);
  assert.match(H.assignment('hosting_launch').brief,/No site linked/);
});

test('browser and Node configuration expose the same eight workflows and keep prior workflows',()=>{
  const context={AgentControlModel:A,URL,window:{}};context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../crm/grok-managed-hosting'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../crm/sourcing'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../energy-opportunity-matching'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../crm/energy-scouting'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../crm/grok-team'),'utf8'),context);
  const browser=context.ProtonGrokTeam;
  assert.deepEqual(Object.keys(browser.managedHosting.workflows),Object.keys(H.workflows));
  for(const key of ['energy','revenue','review'])assert(browser.workflows[key]);
  assert.equal(browser.roles.length,6);assert.equal(browser.managedHosting.serviceId,'managed_energy_hosting');
  assert.equal(browser.managedHostingAssignment('hosting_fit').brief,H.assignment('hosting_fit').brief);
  const brief=browser.briefing('https://example.test/crm/');
  assert.match(brief,/separate from Stoneport/);assert.match(brief,/proposed, approved, funded, active, expired and released/);
  assert.match(brief,/Refundable customer security is a liability/);assert.match(brief,/No recurring schedule is created/);
});
