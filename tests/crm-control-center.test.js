'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../crm/control-center'),A=require('../agent-control-model');
function fixture(){return {date:'2026-09-17',state:A.initial(),sites:[],contacts:[],followups:[]};}
test('overview separates active pipeline records, suppression, reviews and overdue work without mutating stores',()=>{
  const f=fixture();f.sites=[{id:'same',name:'Energy',stage:'researching'},{id:'closed',name:'Closed',stage:'closed_won'}];
  f.state.leads=[{id:'same',company:'Buyer',stage:'qualified',nextAction:'Prepare review',due:'2026-09-16'},{id:'suppressed',company:'Suppressed',stage:'dnc',due:'2026-01-01'}];
  f.state.deals=[{id:'deal',name:'Proposal',stage:'proposed',feeCents:150000},{id:'finished',name:'Finished',stage:'accepted',feeCents:900000}];
  f.state.tasks=[{id:'r',title:'Review',status:'review'},{id:'b',title:'Blocked',status:'blocked'},{id:'done',title:'Old',status:'done',due:'2026-01-01'}];
  f.followups=[{id:'future',prospect_id:'same',description:'Next call',status:'pending',due_date:'2026-09-20'},{id:'old',prospect_id:'same',status:'done',due_date:'2026-01-01'}];
  const before=JSON.stringify(f),v=C.summary(f);
  assert.equal(v.pipeline.length,3);assert.equal(v.reviews,1);assert.equal(v.blocked,1);assert.equal(v.due,1);assert.equal(v.overdue,1);
  assert.equal(v.nextWeek,1);assert.equal(v.withoutNextAction.length,0);assert.equal(v.leads.length,1);assert.equal(v.cash.pipeline,150000);
  assert.deepEqual(v.actions.map(a=>a.id),['same','r','b']);assert.equal(JSON.stringify(f),before);
});
test('monthly contribution uses collected cash less costs and reserves, excluding proposals and voided or older entries',()=>{
  const f=fixture();f.state.entries=[{kind:'earned',cents:100000,date:'2026-09-01'},{kind:'delivery',cents:10000,date:'2026-09-02'},{kind:'software',cents:2000,date:'2026-09-02'},{kind:'reserve',cents:5000,date:'2026-09-02'},{kind:'release',cents:1000,date:'2026-09-03'},{kind:'earned',cents:990000,date:'2026-08-01'},{kind:'earned',cents:990000,date:'2026-09-01',voidedAt:'2026-09-02'}];
  f.state.deals=[{id:'d',name:'Potential',stage:'proposed',feeCents:999900}];
  const v=C.summary(f);assert.equal(v.cash.contribution,84000);assert.equal(v.cashEntries,5);assert.equal(v.cash.pipeline,999900);
});
test('research and contact gaps count only saved active records and pending follow-ups',()=>{
  const f=fixture();f.sites=[{id:'a',name:'Needs action',stage:'researching'},{id:'b',name:'Scheduled',stage:'diligence'},{id:'d',name:'Dead',stage:'dead'}];
  f.followups=[{id:'f1',prospect_id:'a',status:'done',due_date:'2026-09-15'},{id:'f2',prospect_id:'b',status:'snoozed',due_date:'2026-09-22'}];
  f.contacts=[{name:'A',email:'a@example.test',role:'decision_maker',last_verified:'2026-09-01'},{name:'B',phone:' ',last_verified:''}];
  const v=C.summary(f);assert.equal(v.activeSites.length,2);assert.equal(v.researchSites.length,1);assert.deepEqual(v.withoutNextAction.map(s=>s.id),['a']);
  assert.equal(v.contacts,2);assert.equal(v.reachable,1);assert.equal(v.decisionMakers,1);assert.equal(v.unverified,1);
});
