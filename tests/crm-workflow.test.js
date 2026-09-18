'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../crm/workflow'),A=require('../agent-control-model');
const lead=(id,stage='qualified')=>({id,company:'Test '+id,stage,offer:'sourcing',website:'https://'+id+'.example.test',contact:id+'@example.test'});
const task=(id,role,status,extra={})=>({id,role,status,title:id,brief:'',updatedAt:'2026-09-18T12:00:00Z',...extra});
test('only explicit IDs, CRM links and review ancestry link work; not company or domain mentions',()=>{
 const l=lead('lead_one'),state={leads:[l],tasks:[task('a','outreach','review',{brief:'Lead ID: lead_one\nCompany: Test'}),task('b','review','ready',{parentTaskId:'a'}),task('c','analysis','ready',{brief:'Company: Test lead_one https://lead_one.example.test'}),task('d','outreach','ready',{brief:'Lead ID: lead_one_more'}),task('e','analysis','ready',{sources:['https://protonminingco.com/crm/#pipeline/lead/lead_one']})]};
 assert.deepEqual(F.linkedTasks(l,state).map(t=>t.id).sort(),['a','b','e']);
});

test('explicit batch Leads list links current registered IDs and their QA while preserving cancelled history',()=>{
 const ids=['lead_629c5875-2793-47f6-87bc-969d333cd812','lead_c4bebb34-8dcf-4851-8575-296e8a7f899e','lead_60e143d3-e2e3-4cd0-9dfa-aa81b8dbdc27'],leads=ids.map(id=>lead(id));
 const brief='Artifact: campaigns/PM-ASIC-001/roles/outreach-first-conversations-v3.md Leads: '+ids[0]+' (ING); '+ids[1]+' (BlueForge); '+ids[2]+' (Endless). Predecessor: cancelled task_old';
 const state={leads,tasks:[task('current','outreach','review',{brief,result:'Synthetic current draft'}),task('quality','review','ready',{parentTaskId:'current'}),task('old','outreach','cancelled',{brief:'Lead ID: '+ids[0],result:'Synthetic obsolete draft'}),task('predecessor-only','outreach','cancelled',{brief:'Predecessor: cancelled task_current; '+ids[0]})]},before=JSON.stringify(state);
 assert.deepEqual(F.linkedTasks(leads[0],state).map(t=>t.id).sort(),['current','old','quality']);
 for(const l of leads.slice(1))assert.deepEqual(F.linkedTasks(l,state).map(t=>t.id).sort(),['current','quality']);
 const p=F.leadProgress(leads[0],state);assert.equal(p.current.id,'quality');assert.equal(p.owner,'Quality Review');assert.equal(p.step,'review');
 assert.equal(state.tasks[2].status,'cancelled');assert.equal(JSON.stringify(state),before);
});

test('explicit Leads lists support multiline, semicolon and comma entries but require registered exact IDs',()=>{
 const a=lead('lead_one'),b=lead('lead_two'),c=lead('lead_three'),missing=lead('lead_missing');
 const state={leads:[a,b,c],tasks:[task('multiline','analysis','review',{brief:'Artifact: campaigns/synthetic.md\r\nLeads:\r\n  lead_one (One);\r\n  lead_missing (Not in this register);\r\n  lead_two (Two),\r\n  lead_three (Three)\r\nPredecessor: lead_other'}),task('newline-only','analysis','review',{brief:'  Leads: lead_one\nlead_two\nlead_three\nNotes: lead_missing'}),task('artifact-semicolon','analysis','review',{brief:'Artifact: campaigns/synthetic.md; Leads: lead_one; lead_two.'})]};
 assert.deepEqual(F.linkedTasks(a,state).map(t=>t.id).sort(),['artifact-semicolon','multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(b,state).map(t=>t.id).sort(),['artifact-semicolon','multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(c,state).map(t=>t.id).sort(),['multiline','newline-only']);
 assert.deepEqual(F.linkedTasks(missing,state),[]);
});

test('batch links do not infer IDs from prose, predecessor fields, annotations or malformed token boundaries',()=>{
 const l=lead('lead_one'),briefs=[
  'Predecessor: cancelled task_old; lead_one',
  'Previous Leads: lead_one',
  'Notes: Leads: lead_one',
  'Notes: quoted example; Leads: lead_one',
  'NotLeads: lead_one',
  'Leads: lead_one_more',
  'Leads: lead_one-more',
  'Leads: lead_one.example.test',
  'Leads: https://example.test/lead_one',
  'Leads: lead_one?ignored=true',
  'Leads: lead_one/another',
  'Leads: lead_one<script>',
  'Leads: unknown (lead_one); Predecessor: lead_one',
  'Leads: unknown; Notes: lead_one',
  'Leads: unknown. Predecessor: lead_one',
  'Leads: unknown; do not extract lead_one',
  'Company: Test lead_one; website: https://lead_one.example.test'
 ];
 const state={leads:[l],tasks:briefs.map((brief,i)=>task('ambiguous_'+i,'analysis','review',{brief}))};
 state.tasks.push(task('source-text','analysis','review',{sources:['Leads: lead_one']}));
 assert.deepEqual(F.linkedTasks(l,state),[]);
});
test('accepted drafts are not contacts and stale charter prose cannot determine email readiness',()=>{
 const l=lead('one'),state={leads:[l],tasks:[task('draft','outreach','done',{leadId:l.id}),task('charter','revenue','draft',{title:'PM-LOOP-002 operating charter — draft only / every 4 hours',brief:'OWNER HOLD (critical): NO actual outreach until OWNER confirms email ready AND send/reply path tested.'})]};
 const before=JSON.stringify(state),p=F.leadProgress(l,state);assert.equal(p.step,'contact');assert.match(p.now,/readiness pending/);assert.equal(p.owner,'Revenue Lead');assert.equal(l.stage,'qualified');assert.equal(JSON.stringify(state),before);
 state.tasks.push(task('new-charter','revenue','draft',{title:'PM-LOOP-003 operating charter',brief:'Email ready: owner hold cleared',updatedAt:'2026-09-19T12:00:00Z'}));assert.equal(F.emailReadiness(state).ready,false);
 state.outreachReadiness={sender:'verified',reply:'verified',footer:'verified',authority:'authorized',checkedOn:'2026-09-18'};assert.equal(F.hold(state),null);assert.equal(F.leadProgress(l,state).now,'Draft accepted · not sent');
});
test('recorded conversations never move backward because old drafts remain, and suppression wins',()=>{
 const l=lead('one','replied'),state={leads:[l],tasks:[task('draft','outreach','review',{leadId:'one'}),task('qa','review','ready',{parentTaskId:'draft'})]};
 assert.equal(F.leadProgress(l,state).step,'conversation');
 state.leads.push({...lead('two','dnc'),contact:l.contact});const p=F.leadProgress(l,state);assert.equal(p.step,'closed');assert.equal(p.now,'Do not contact');assert.match(p.next,/suppressed/);
});
test('batch results awaiting independent QA advance the visible focus to queued QA without claiming acceptance',()=>{
 const state={tasks:[task('a','intelligence','review',{title:'PM-ASIC-001-01 Research a small cohort',result:'Five candidates'}),task('b','review','ready',{title:'PM-ASIC-001-02 Independently qualify the cohort'}),task('c','outreach','draft',{title:'PM-ASIC-001-03 Prepare drafts'}),task('d','review','draft',{title:'PM-ASIC-001-04 Review drafts'})]};
 const [c]=F.campaigns(state);assert.equal(c.current.task.id,'b');assert.equal(c.next.task.id,'c');assert.match(F.overview(state),/Check candidate fit/);assert.match(F.overview(state),/Agent review/);assert.doesNotMatch(F.overview(state),/Five qualified/);
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
test('brokerage labels require the explicit campaign marker and preserve earlier hosting records',()=>{
 const l={...lead('one'),notes:'PM-ASIC-001 | ASIC brokerage | seller'};assert.equal(F.offerLabel(l),'ASIC brokerage');
 assert.equal(F.offerLabel({...l,offer:'managed_energy_hosting'}),'Proton Managed Energy Hosting');
 assert.equal(F.offerLabel({...l,notes:'May be interested in ASIC brokerage'}),'Sourcing Desk');
});
