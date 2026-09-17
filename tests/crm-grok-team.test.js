'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../agent-control-model'),G=require('../crm/grok-team');
let seq=0;const apply=(s,type,payload)=>A.reduce(s,{type,payload,revision:s.revision,id:'evt_'+(++seq),at:'2026-09-17T18:00:00Z'});
function reviewed(){let s=apply(A.initial(),'task.add',{id:'source',title:'Synthetic research',role:'intelligence',brief:'Research fit'});s=apply(s,'task.ready',{id:'source'});return apply(s,'task.result',{id:'source',result:'Original finding',sources:['https://example.test/source']});}
test('CRM instructions reuse the six native profiles without inventing connection state',()=>{
 assert.equal(G.roles.length,6);assert.deepEqual(G.roles.map(r=>r.id),A.ROLES.map(r=>r.id));assert(G.roles.every(r=>r.botName==='Proton '+r.name));
 const p=G.briefing('https://protonminingco.com/crm/#pipeline/site/123');assert.match(p,/Reuse the existing six/);assert.match(p,/separate from Stoneport/);assert.match(p,/https:\/\/protonminingco.com\/crm\/#team/);assert(!p.includes('/app/agent-control.html'));assert.match(p,/do not recreate or import existing tasks/);
 assert.throws(()=>G.teamUrl('https://user:pass@example.test/crm/'));assert.throws(()=>G.teamUrl('javascript:alert(1)'));
});
test('copied CRM assignment preserves routing, pause, original result and revision feedback without dispatch',()=>{
 let s=reviewed();s=apply(s,'task.revise',{id:'source',note:'Find the actual service buyer.'});s=apply(s,'pause',{});const before=JSON.stringify(s),p=G.packet(s,s.tasks[0],'https://protonminingco.com/crm/');
 assert.match(p,/Proton Lead Intelligence/);assert.match(p,/CRM task: https:\/\/protonminingco.com\/crm\/#team\/task\/source/);assert.match(p,/PAUSED/);assert.match(p,/Find the actual service buyer/);assert.match(p,/Original finding/);assert.equal(JSON.stringify(s),before);
});
test('linked Quality Review drafts keep their source intact and prevent duplicate open reviews',()=>{
 const s=reviewed(),p=G.qualityAssignment(s.tasks[0],'https://protonminingco.com/crm/');const next=apply(s,'task.add',Object.assign({id:'quality'},p));assert.equal(next.tasks[1].parentTaskId,'source');assert.equal(next.tasks[1].role,'review');assert.equal(next.tasks[1].status,'draft');assert.deepEqual(next.tasks[0],s.tasks[0]);
 assert.throws(()=>apply(next,'task.add',Object.assign({id:'duplicate'},p)),/already exists/);assert.throws(()=>apply(s,'task.add',{id:'lost',role:'review',title:'Lost',brief:'Missing parent',parentTaskId:'missing'}),/source task/);
 assert.throws(()=>G.qualityAssignment({...s.tasks[0],status:'ready'},'https://example.test/crm/'));assert.throws(()=>G.qualityAssignment({...s.tasks[0],role:'review'},'https://example.test/crm/'));
});
test('review round trips retain each reviewed result, evidence and feedback',()=>{
 let s=reviewed();s=apply(s,'task.revise',{id:'source',note:'Narrow commercial fit.'});s=apply(s,'task.ready',{id:'source'});s=apply(s,'task.result',{id:'source',result:'Corrected finding',sources:['https://example.test/revised']});
 assert.equal(s.tasks[0].reviewNote,'');assert.equal(s.tasks[0].reviewHistory[0].result,'Original finding');assert.deepEqual(s.tasks[0].reviewHistory[0].sources,['https://example.test/source']);
 s=apply(s,'task.accept',{id:'source',note:'Evidence and fit checked.'});assert.deepEqual(s.tasks[0].reviewHistory.map(h=>h.decision),['revise','accept']);assert.equal(s.tasks[0].reviewHistory[1].result,'Corrected finding');
 const broken=JSON.parse(JSON.stringify(s));broken.tasks[0].reviewHistory[0].sources=['javascript:alert(1)'];assert.throws(()=>A.valid(broken));
});
test('large source results still produce a saveable Quality Review draft with a full-record link',()=>{
 const s=reviewed(),source=s.tasks[0];source.result='Evidence '.repeat(2000);source.sources=Array.from({length:12},(_,i)=>'https://example.test/'+i+'?detail='+'x'.repeat(1700));
 const draft=G.qualityAssignment(source,'https://protonminingco.com/crm/');assert(draft.brief.length<=9000);assert.match(draft.brief,/Read the full current brief/);assert.match(draft.brief,/\/crm\/#team\/task\/source/);assert.doesNotThrow(()=>apply(s,'task.add',{id:'long_review',...draft}));
});
test('owner acceptance requires explicit passing or not-applicable review criteria',()=>{
 const good={decision:'accept',evidence:'pass',arithmetic:'na',fit:'pass',note:'No arithmetic in this draft.',lesson:'Require service-fit evidence.'};assert.match(G.feedback(good),/Feedback for the next assignment/);
 for(const key of ['evidence','arithmetic','fit'])for(const value of ['unchecked','revise','blocked'])assert.throws(()=>G.feedback({...good,[key]:value}),/before accepting/);
 assert.throws(()=>G.feedback({...good,decision:''}),/Choose/);assert.match(G.feedback({...good,decision:'revise',fit:'revise'}),/Commercial fit: REVISE/);
});
test('CRM qualification requires a service-buying rationale and legacy edits preserve it',()=>{
 assert.doesNotThrow(()=>G.validateLead({stage:'discovered',serviceFit:''}));assert.throws(()=>G.validateLead({stage:'qualified',serviceFit:''}),/specific reason/);
 const lead={id:'lead',company:'Synthetic vendor',website:'https://example.test',offer:'research',channel:'direct',stage:'discovered',serviceFit:'New territory requires account research.'};let s=apply(A.initial(),'lead.save',lead);
 s=apply(s,'lead.save',{...lead,serviceFit:undefined,company:'Renamed vendor'});assert.equal(s.leads[0].serviceFit,lead.serviceFit);
});
