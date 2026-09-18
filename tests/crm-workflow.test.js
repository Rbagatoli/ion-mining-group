'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../crm/workflow'),A=require('../agent-control-model');
const lead=(id,stage='qualified')=>({id,company:'Test '+id,stage,offer:'sourcing',website:'https://'+id+'.example.test',contact:id+'@example.test'});
const task=(id,role,status,extra={})=>({id,role,status,title:id,brief:'',updatedAt:'2026-09-18T12:00:00Z',...extra});
test('only explicit IDs, CRM links and review ancestry link work; not company or domain mentions',()=>{
 const l=lead('lead_one'),state={leads:[l],tasks:[task('a','outreach','review',{brief:'Lead ID: lead_one\nCompany: Test'}),task('b','review','ready',{parentTaskId:'a'}),task('c','analysis','ready',{brief:'Company: Test lead_one https://lead_one.example.test'}),task('d','outreach','ready',{brief:'Lead ID: lead_one_more'}),task('e','analysis','ready',{sources:['https://protonminingco.com/crm/#pipeline/lead/lead_one']})]};
 assert.deepEqual(F.linkedTasks(l,state).map(t=>t.id).sort(),['a','b','e']);
});
test('accepted drafts are not contacts, and owner hold takes precedence over drafting completion',()=>{
 const l=lead('one'),state={leads:[l],tasks:[task('draft','outreach','done',{leadId:l.id}),task('charter','revenue','draft',{title:'PM-LOOP-002 operating charter — draft only / every 4 hours',brief:'OWNER HOLD (critical): NO actual outreach until OWNER confirms email ready AND send/reply path tested.'})]};
 const before=JSON.stringify(state),p=F.leadProgress(l,state);assert.equal(p.step,'contact');assert.match(p.now,/sending on hold/);assert.equal(p.owner,'You');assert.equal(l.stage,'qualified');assert.equal(JSON.stringify(state),before);
 state.tasks.push(task('new-charter','revenue','draft',{title:'PM-LOOP-003 operating charter',brief:'Updated operating rules',updatedAt:'2026-09-19T12:00:00Z'}));assert.equal(F.hold(state),null);
});
test('recorded conversations never move backward because old drafts remain, and suppression wins',()=>{
 const l=lead('one','replied'),state={leads:[l],tasks:[task('draft','outreach','review',{leadId:'one'}),task('qa','review','ready',{parentTaskId:'draft'})]};
 assert.equal(F.leadProgress(l,state).step,'conversation');
 state.leads.push({...lead('two','dnc'),contact:l.contact});const p=F.leadProgress(l,state);assert.equal(p.step,'closed');assert.equal(p.now,'Do not contact');assert.match(p.next,/suppressed/);
});
test('batch results awaiting independent QA advance the visible focus to queued QA without claiming acceptance',()=>{
 const state={tasks:[task('a','intelligence','review',{title:'PM-ASIC-001-01 Research a small cohort',result:'Five candidates'}),task('b','review','ready',{title:'PM-ASIC-001-02 Independently qualify the cohort'}),task('c','outreach','draft',{title:'PM-ASIC-001-03 Prepare drafts'}),task('d','review','draft',{title:'PM-ASIC-001-04 Review drafts'})]};
 const [c]=F.campaigns(state);assert.equal(c.current.task.id,'b');assert.equal(c.next.task.id,'c');assert.match(F.overview(state),/Check candidate fit/);assert.match(F.overview(state),/Result saved|Awaiting review/);assert.doesNotMatch(F.overview(state),/Five qualified/);
});
test('read-only UI escapes untrusted saved lead names, actions and task content',()=>{
 const l={...lead('one'),company:'<img src=x onerror=alert(1)>',nextAction:'<script>send()</script>'},state={leads:[l],tasks:[]};const html=F.card(l,state)+F.detail(l,state);
 assert(!html.includes('<img'));assert(!html.includes('<script>'));assert.match(html,/&lt;img/);
});
test('preparing a future draft assignment does not advance an unqualified lead',()=>{
 const l=lead('one','discovered'),state={leads:[l],tasks:[task('research','intelligence','ready',{leadId:l.id}),task('draft','outreach','draft',{leadId:l.id})]};
 const p=F.leadProgress(l,state);assert.equal(p.step,'research');assert.match(p.now,/Research queued/);
});
test('new assignment retains a valid lead link and rejects missing leads without mutating old records',()=>{
 let s=A.initial();s=A.reduce(s,{type:'lead.save',id:'ev1',revision:s.revision,at:'2026-09-18T12:00:00Z',payload:{id:'one',company:'One',website:'https://example.test',stage:'discovered',offer:'sourcing',channel:'direct'}});
 const action={type:'task.add',id:'ev2',revision:s.revision,at:'2026-09-18T12:01:00Z',payload:{id:'linked',leadId:'one',title:'Check One',role:'intelligence',brief:'Research only'}};
 const next=A.reduce(s,action);assert.equal(next.tasks[0].leadId,'one');assert.equal(s.tasks.length,0);assert.throws(()=>A.reduce(s,{...action,payload:{...action.payload,leadId:'missing'}}),/linked lead/);
});
