'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../agent-control-model'),S=require('../crm/sourcing'),G=require('../crm/grok-team');
const lead={id:'buyer',company:'Synthetic buyer',website:'https://buyer.example.test',offer:'sourcing',stage:'discovered',channel:'direct'};
let event=0;const apply=(state,type,payload)=>A.reduce(state,{type,payload,revision:state.revision,id:'evt_'+(++event),at:'2026-09-18T20:00:00Z'});
test('sourcing reuses the existing supply identity and preserves hosting roles',()=>{
 assert.equal(G.roles.length,6);assert.equal(G.role('supply').botName,'Proton Supply Partnerships');
 assert.match(G.role('supply').instructions,/nonbinding negotiation/);assert.match(G.role('supply').instructions,/generation\/gas-treatment/);
 assert.match(G.rules,/Revenue remains the sole CRM writer/);assert.match(G.rules,/mailbox send\/reply verification/);assert.match(G.rules,/not a buyer fee/);
 assert.match(S.negotiationRules,/one initial RFQ and one improvement round/);assert.match(S.rfqTemplate,/UNSENT RFQ/);
});
test('each workflow prepares a draft linked to the exact buyer without creating quotes or orders',()=>{
 const before=apply(A.initial(),'lead.save',lead),original=JSON.stringify(before);
 for(const step of S.steps){const draft=S.assignment({step:step.id,lead,page:'https://protonminingco.com/crm/#team',context:'All commercial fields still unknown.'});
  const after=apply(before,'task.add',{id:'draft_'+step.id,...draft});assert.equal(after.tasks[0].status,'draft');assert.equal(after.tasks[0].leadId,lead.id);assert.equal(S.recordState(after.tasks[0]).key,'');assert.equal(after.deals.length,0);assert.match(draft.brief,/#pipeline\/lead\/buyer/);assert.ok(draft.brief.length<=9000);}
 assert.equal(JSON.stringify(before),original);
 assert.throws(()=>S.assignment({lead:{...lead,stage:'dnc'},page:'https://example.test/crm/'}),/active/);
 assert.throws(()=>S.assignment({lead,page:'https://u:p@example.test/crm/'}),/credentials/);
});
test('new quote versions retain the original result and review and cannot cross buyers',()=>{
 let state=apply(A.initial(),'lead.save',lead);const draft=S.assignment({step:'quotes',lead,page:'https://protonminingco.com/crm/'});
 state=apply(state,'task.add',{id:'quote1',...draft});state=apply(state,'task.ready',{id:'quote1'});state=apply(state,'task.result',{id:'quote1',result:'SOURCING_RECORD_STATE: firm_quote\nSynthetic quote v1',sources:['https://quote.example.test/v1']});state=apply(state,'task.accept',{id:'quote1',note:'Research reviewed, no order accepted.'});
 const original=JSON.stringify(state.tasks[0]),next=S.assignment({step:'negotiate',lead,parent:state.tasks[0],page:'https://protonminingco.com/crm/'});state=apply(state,'task.add',{id:'quote2',...next});
 assert.equal(JSON.stringify(state.tasks[0]),original);assert.equal(state.tasks[1].parentTaskId,'quote1');assert.equal(S.recordState(state.tasks[0]).key,'firm_quote');assert.equal(S.recordState(state.tasks[1]).key,'');assert.equal(S.history(lead,state.tasks).length,2);
 assert.equal(S.history({...lead,id:'different'},state.tasks).length,0);
 assert.throws(()=>S.assignment({lead:{...lead,id:'different'},parent:state.tasks[0],page:'https://example.test/crm/'}),/this buyer/);
});
test('reported procurement states stay separate from task approval and unknown availability',()=>{
 for(const key of Object.keys(S.states))assert.equal(S.recordState({status:'done',result:'SOURCING_RECORD_STATE: '+key}).key,key);
 assert.equal(S.recordState({status:'done',result:'QA PASS; task accepted'}).key,'');
 assert.equal(S.recordState({result:'SOURCING_RECORD_STATE: invented'}).key,'');
 const task={brief:'[ASIC SOURCING: quotes]'};
 assert.throws(()=>S.validateResult(task,S.resultTemplate(task)),/Complete/);
 assert.throws(()=>S.validateResult(task,'A quote exists'),/SOURCING_RECORD_STATE/);
 assert.throws(()=>S.validateResult(task,'SOURCING_RECORD_STATE: firm_quote'),/evidence URL/);
 assert.throws(()=>S.validateResult(task,'SOURCING_RECORD_STATE: accepted_order',['https://example.test/order']),/approval/);
 assert.throws(()=>S.validateResult(task,'SOURCING_RECORD_STATE: accepted_order\nOwner approval reference (if any): Unknown\nAccepted order reference (only if an order actually exists): pending',['https://example.test/order']),/approval/);
 assert.doesNotThrow(()=>S.validateResult(task,'SOURCING_RECORD_STATE: indicative_listing\nAvailability: unknown'));
});
test('independent review inherits the request and routes specialists through Revenue',()=>{
 const draft=S.assignment({step:'recommendation',lead,page:'https://protonminingco.com/crm/'}),source={...draft,id:'costs',status:'review',result:'SOURCING_RECORD_STATE: research\nUnknown freight.',sources:[]};
 const review=G.qualityAssignment(source,'https://protonminingco.com/crm/');assert.equal(review.role,'review');assert.equal(review.leadId,lead.id);assert.equal(review.parentTaskId,'costs');assert.equal(S.stepOf(review).id,'recommendation');assert.match(review.brief,/QA PASS is not owner purchase approval/);
 const packet=G.packet(A.initial(),{...source,status:'ready'},'https://protonminingco.com/crm/');assert.match(packet,/sole CRM writer/);assert.match(packet,/Copying this packet does not send it/);
});
