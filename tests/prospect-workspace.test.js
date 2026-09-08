'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../prospect-workspace');
const now=Date.UTC(2026,8,7,12),base=[{id:'a',name:'Cedar',stage:'contacted'},{id:'b',name:'Ash',stage:'diligence'},{id:'new',name:'New site',stage:'unreviewed'},{id:'signed',name:'Signed',stage:'closed_won'},{id:'stopped',name:'Stopped',stage:'dead'},{id:'custom',name:'Custom',stage:'permit_review'}];
function data(){return {ownerActions:[],sourcing:{rows:[],errors:[]},evidence:{documents:[],watches:[],errors:[]}};}
test('Existing stages retain their identities while sharing five work phases',()=>{
 assert.equal(W.PHASES.length,5);assert.equal(W.phase('researching').key,'review');assert.equal(W.phase('unreviewed').key,'review');assert.equal(W.phase('term_sheet').key,'terms');assert.equal(W.phase('in_discussion').key,'terms');
 assert.equal(W.phase('closed_won'),null);assert.equal(W.phase('permit_review'),null);assert.equal(W.closed('dead'),true);assert.equal(W.closed('permit_review'),false);
});
test('Custom stage labels are preserved, including renamed built-in stages',()=>{
 global.CrmConfig={stages:()=>[{key:'contacted',label:'Owner approach sent'},{key:'permit_review',label:'Local approval'}]};
 assert.equal(W.stageLabel('contacted'),'Owner approach sent');assert.equal(W.stageLabel('permit_review'),'Local approval');delete global.CrmConfig;
 assert.equal(W.stageLabel('contacted'),'Contact made');
});
test('Daily queue includes every real commitment and sorts overdue before today, unscheduled and future',()=>{
 const d=data();d.ownerActions=[{id:'oa_1',prospect_id:'a',description:'Owner sends flow logs',due_on:'2026-09-07',owner:'Site manager'}];
 d.sourcing.rows=[{id:'source_1',prospect_id:'a',action_open:true,action:{description:'Check procurement deadline',due_on:'2026-09-01',owner:'Analyst'}}];
 const q=W.tasks(base,d,[{id:'f1',prospect_id:'a',description:'Request quote',due_date:'2026-09-05'},{id:'f2',prospect_id:'b',description:'Visit site',due_date:'2026-10-01'}],now);
 assert.deepEqual(q.rows.slice(0,3).map(r=>r.text),['Check procurement deadline','Request quote','Owner sends flow logs']);assert.equal(q.rows.at(-1).text,'Visit site');
 assert.equal(q.rows.filter(r=>r.id==='a').length,3,'Distinct commitments at one site must not be collapsed');
});
test('Future owner commitments do not vanish or appear in the to-do-now queue',()=>{
 const d=data();d.ownerActions=[{id:'oa_1',prospect_id:'a',description:'Future call',due_on:'2026-10-01',owner:'Analyst'}];const q=W.tasks(base,d,[],now);
 assert.equal(q.rows.find(r=>r.text==='Future call').priority,3);assert.equal(q.rows.filter(r=>r.id==='a').length,1);
});
test('Source review, failed checks and pending document work remain actionable',()=>{
 const d=data();d.evidence.documents=[{site_id:'a',document:{id:'doc_1',title:'Gas agreement'},pending:true},{site_id:'a',document:{id:'doc_2',title:'Reviewed item'},pending:false}];
 d.evidence.watches=[{site_id:'b',failed:true,watch:{id:'w1',title:'Owner notices',next_on:'2026-12-01',status:'active',owner:'Analyst'}},{site_id:'b',watch:{id:'w2',title:'Paused check',status:'paused'}}];
 const q=W.tasks(base,d,[],now);assert.ok(q.rows.some(r=>r.kind==='document'&&r.panel==='evidence'));const failed=q.rows.find(r=>r.kind==='source');assert.equal(failed.priority,1);assert.match(failed.text,/Retry/);assert.ok(!q.rows.some(r=>/Paused|Reviewed item/.test(r.text)));
});
test('Closed outcomes are kept out of active work without modifying saved data',()=>{
 const d=data(),before=JSON.stringify(base);d.ownerActions=[{id:'oa_1',prospect_id:'signed',description:'Old action',due_on:'2026-01-01'}];
 const q=W.tasks(base,d,[{id:'f1',prospect_id:'stopped',description:'Old task',due_date:'2026-01-01'}],now);assert.ok(q.rows.every(r=>!['signed','stopped'].includes(r.id)));assert.equal(JSON.stringify(base),before);
});
test('New and custom-stage sites always have a visible next step',()=>{
 const q=W.tasks(base,data(),[],now);assert.ok(q.rows.some(r=>r.id==='new'&&r.panel==='contacts'));assert.ok(q.rows.some(r=>r.id==='custom'&&r.panel==='overview'));assert.equal(q.rows.length,4);
});
test('Duplicates are removed by task identity without discarding different sources',()=>{
 const d=data(),f={id:'same',prospect_id:'a',description:'Call',due_date:'2026-09-07'};d.ownerActions=[{id:'same',prospect_id:'a',description:'Send logs',due_on:'2026-09-07'}];
 const q=W.tasks(base,d,[f,f],now);assert.equal(q.rows.filter(r=>r.id==='a').length,2);
});
test('Unreadable records produce visible queue errors, not an all-clear result',()=>{
 const d=data();d.sourcing.errors.push({id:'a',error:'Cannot read opening'});d.evidence.errors.push({id:'b',error:'Cannot read document'});
 const q=W.tasks(base,d,[],now);assert.equal(q.errors.length,2);
});
test('Task routes safely encode site identifiers and target the correct section',()=>{
 assert.equal(W.href('site/a?&','capital'),'#p/site%2Fa%3F%26?tab=capital');assert.equal(W.href('x','activity','ownerConfirmation'),'#p/x?tab=activity&focus=ownerConfirmation');
});
