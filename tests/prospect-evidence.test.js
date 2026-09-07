'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../prospect-evidence'),S=require('../prospect-sourcing');
const NOW=Date.parse('2026-09-07T16:00:00Z'),TEXT='North Dade Landfill. Synthetic agreement only.\nThe generator is not available for reuse.\nThe PPA expires on October 5, 2026; notice is required on September 17, 2026.\nCollected gas was 500 scfm in 2022. No current allocation is established.';
const site=()=>({id:'s1',name:'North Dade Landfill',operator:'Miami-Dade County',jurisdiction:'USA',stage:'researching',quoted_rate:.03,usable_kw:null,custom_fields:{private:'Keep',_proton_diligence_v1:{v:1,revision:0,assets:{},capacity:{},history:[]}}});
const source=(extra={})=>({by:'Test recorder',title:'Synthetic executed agreement',organization:'Miami-Dade County',kind:'agreement',source_url:'https://example.com/agreement',document_date:'2020-01-01',site_hint:'Exact site identifier still requires review',excerpt:TEXT,...extra});
const finding=(extra={})=>({by:'Test recorder',topic:'equipment',passage:'The generator is not available for reuse.',claim:'The document explicitly rules out generator reuse.',locator:'Clause 3',...extra});
const review=(extra={})=>({by:'Test reviewer',decision:'accepted',checked_on:'2026-09-07',source_checked:true,site_confirmed:true,match_reason:'Exact EPA landfill identifier and street address in executed agreement',note:'Read the full clause. Negative statement is retained.',...extra});
const task=(extra={})=>({by:'Test recorder',play:'idle_generation',region:'FL',owner:'Research owner',due_on:'2026-09-09',verification:'Request an itemized replacement-generator quote and remaining equipment scope',...extra});
const watch=(extra={})=>({by:'Test recorder',title:'Owner procurement records',organization:'Miami-Dade County',url:'https://example.com/notices',owner:'Research owner',match_note:'County-wide; verify exact North Dade site in each record',cadence:7,next_on:'2026-09-07',...extra});
function save(s,type,value,ids={},now=NOW){const r=E.apply(s,{revision:E.state(s).revision,type,value,...ids},now);assert.equal(r.ok,true,r.err);return {...s,custom_fields:r.fields};}
function accepted(){let s=save(site(),'capture',source());s=save(s,'claim',finding(),{document_id:'doc_1'});return save(s,'review',review(),{document_id:'doc_1',claim_id:'cl_2'});}
test('retained source, original date and exact negative passage stay distinct from capacity and capital',()=>{
 const original=site(),s=accepted(),d=E.state(s).documents[0];assert.equal(d.excerpt,TEXT);assert.equal(d.document_date,'2020-01-01');assert.equal(d.claims[0].status,'accepted');assert.equal(d.claims[0].passage,'The generator is not available for reuse.');assert.deepEqual(s.custom_fields._proton_diligence_v1,original.custom_fields._proton_diligence_v1);assert.equal(s.usable_kw,null);assert.equal(s.quoted_rate,.03);assert.equal(S.state(s).signals.length,0);assert.equal(E.state(original).documents.length,0);
});
test('capture requires source context, truthful clocks and a retained excerpt; duplicate snapshots are refused',()=>{
 for(const p of [{source_url:'',document_ref:''},{source_url:'javascript:alert(1)'},{organization:''},{site_hint:''},{document_date:'2026-09-08'},{document_date:''},{undated:true},{excerpt:''}])assert.equal(E.apply(site(),{revision:0,type:'capture',value:source(p)},NOW).ok,false,JSON.stringify(p));
 const s=save(site(),'capture',source());assert.equal(E.apply(s,{revision:1,type:'capture',value:source()},NOW).ok,false);assert.equal(E.state(save(site(),'capture',source({undated:true,document_date:''}))).documents[0].undated,true);
});
test('findings must quote retained text and preserve document locators; keyword suggestions make no numeric claims',()=>{
 const s=save(site(),'capture',source());for(const p of [{passage:'The generator is available.'},{locator:''},{topic:'fake'}])assert.equal(E.apply(s,{revision:1,type:'claim',document_id:'doc_1',value:finding(p)},NOW).ok,false);
 const hits=E.passages(TEXT);assert.ok(hits.some(p=>p.passage.includes('not available')));assert.equal(hits.find(p=>p.topics.includes('agreement')).dates.length,2);assert.equal(hits[0].available_kw,undefined);assert.match(hits[0].ambiguity,/negation/);
});
test('site matches remain suggestions, including organization-only ambiguity and multiple named sites',()=>{
 const other={...site(),id:'s2',name:'South Dade Landfill'};assert.equal(E.matching('Miami-Dade County',[site(),other]).length,2);assert.ok(E.matching('Miami-Dade County',[site()])[0].basis.includes('ambiguous'));assert.equal(E.matching('North Dade Landfill and South Dade Landfill',[site(),other]).length,2);assert.equal(E.matching('unrelated text',[site()]).length,0);
});
test('acceptance needs exact site and original-source confirmation; chronology and archive transitions are enforced',()=>{
 let s=save(site(),'capture',source());s=save(s,'claim',finding(),{document_id:'doc_1'});for(const p of [{site_confirmed:false},{source_checked:false},{match_reason:''},{checked_on:'2019-01-01'},{checked_on:'2026-09-08'}])assert.equal(E.apply(s,{revision:2,type:'review',document_id:'doc_1',claim_id:'cl_2',value:review(p)},NOW).ok,false);
 s=save(s,'review',review({decision:'rejected'}),{document_id:'doc_1',claim_id:'cl_2'});assert.equal(E.apply(s,{revision:3,type:'review',document_id:'doc_1',claim_id:'cl_2',value:review()},NOW).ok,false);
});
test('a reviewed finding becomes one pending sourcing task; neither dates nor applicability are guessed',()=>{
 const s=save(accepted(),'task',task(),{document_id:'doc_1',claim_id:'cl_2'}),d=E.state(s).documents[0],signal=S.state(s).signals[0];assert.equal(d.claims[0].sourcing_id,signal.id);assert.equal(signal.status,'pending');assert.equal(signal.event_on,'');assert.equal(signal.region,'FL');assert.equal(signal.action.owner,'Research owner');assert.equal(E.apply(s,{revision:4,type:'task',document_id:'doc_1',claim_id:'cl_2',value:task()},NOW).ok,false);
 assert.equal(E.apply(accepted(),{revision:3,type:'task',document_id:'doc_1',claim_id:'cl_2',value:task({play:'ppa_expiry'})},NOW).ok,false);assert.equal(E.apply({...accepted(),stage:'dead'},{revision:3,type:'task',document_id:'doc_1',claim_id:'cl_2',value:task()},NOW).ok,false);
 assert.equal(E.apply(accepted(),{revision:3,type:'task',document_id:'doc_1',claim_id:'cl_2',value:task()},Date.parse('2026-12-08T16:00:00Z')).ok,false);
});
test('withdrawing evidence archives its pending or reviewed sourcing task atomically while retaining original records',()=>{
 for(const reviewed of [false,true]){let s=save(accepted(),'task',task(),{document_id:'doc_1',claim_id:'cl_2'});if(reviewed){const r=S.apply(s,{revision:1,type:'review',id:'sg_1',value:{by:'Reviewer',decision:'reviewed',checked_on:'2026-09-07',note:'Current applicability separately checked',site_confirmed:true,current_confirmed:true}},NOW);assert.equal(r.ok,true);s.custom_fields[S.KEY]=r.sourcing;}
 s=save(s,'review',review({decision:'withdrawn',note:'A newer executed document supersedes this clause'}),{document_id:'doc_1',claim_id:'cl_2'});assert.equal(E.state(s).documents[0].claims[0].status,'withdrawn');assert.equal(S.state(s).signals[0].status,reviewed?'withdrawn':'rejected');assert.equal(S.queue([s],{},NOW).rows.length,0);assert.equal(E.state(s).documents[0].excerpt,TEXT);}
 const broken=save(accepted(),'task',task(),{document_id:'doc_1',claim_id:'cl_2'});broken.custom_fields[S.KEY].signals=[];assert.equal(E.apply(broken,{revision:4,type:'review',document_id:'doc_1',claim_id:'cl_2',value:review({decision:'withdrawn'})},NOW).ok,false);
});
test('watch cadence, failed checks, pause/resume and closed prospects produce honest due counts',()=>{
 let s=save(site(),'watch',watch());assert.equal(E.queue([s],{},NOW).due,1);s=save(s,'check',{by:'Reviewer',checked_on:'2026-09-07',outcome:'unavailable',note:'Portal would not load'},{watch_id:'watch_1'});assert.equal(E.queue([s],{},NOW).overdue,1);assert.equal(E.state(s).watches[0].next_on,'2026-09-07');
 s=save(s,'check',{by:'Reviewer',checked_on:'2026-09-07',outcome:'unchanged',note:'Read current notice list manually'},{watch_id:'watch_1'});assert.equal(E.state(s).watches[0].next_on,'2026-09-14');assert.equal(E.queue([s],{},NOW).due,0);
 s=save(s,'watch_update',{by:'Reviewer',status:'paused',next_on:'2026-09-07',note:'Owner asked us to pause monitoring'},{watch_id:'watch_1'});assert.equal(E.queue([s],{},NOW).due,0);assert.equal(E.exportWatches([s],NOW).sources.length,0);assert.equal(E.queue([{...s,stage:'dead'}],{},NOW).watches.length,0);
});
test('source import is idempotent, baseline-checked and records capture dates without inventing publication dates',()=>{
 let s=save(site(),'watch',watch());const r={site_id:'s1',watch_id:'watch_1',url:watch().url,previous_digest:'',checked_on:'2026-09-07',check_id:'a'.repeat(64),digest:'b'.repeat(64),outcome:'changed',note:'HTML changed; requires review',text:TEXT,archive_ref:'local original copy.html'};
 s=save(s,'import_checks',{by:'Reviewer',results:[r]});assert.equal(E.state(s).documents.length,1);assert.equal(E.state(s).documents[0].document_date,'');assert.equal(E.state(s).documents[0].undated,true);assert.equal(E.state(s).documents[0].claims.length,0);assert.equal(E.state(s).watches[0].digest,r.digest);assert.equal(E.exportWatches([s],NOW).sources[0].previous_digest,r.digest);
 const again=E.apply(s,{revision:2,type:'import_checks',value:{by:'Reviewer',results:[r]}},NOW);assert.equal(again.unchanged,true);assert.equal(again.evidence.revision,2);
 for(const patch of [{site_id:'different'},{url:'https://example.com/wrong'},{previous_digest:''},{checked_on:'2026-09-08'},{outcome:'unchanged',digest:'c'.repeat(64)}])assert.equal(E.apply(s,{revision:2,type:'import_checks',value:{by:'Reviewer',results:[{...r,check_id:'c'.repeat(64),previous_digest:r.digest,...patch}]}},NOW).ok,false);
});
test('stale, malformed and oversize inbox writes preserve existing records',()=>{
 const s=accepted();assert.equal(E.apply(s,{revision:0,type:'capture',value:source()},NOW).ok,false);const bad=structuredClone(s);bad.custom_fields[E.KEY].documents[0].claims[0].reviews=[null];assert.ok(E.state(bad).error);assert.equal(E.queue([bad],{},NOW).errors.length,1);assert.equal(E.apply(bad,{revision:3,type:'capture',value:source()},NOW).ok,false);
 assert.equal(E.apply(s,{revision:3,type:'capture',value:source({excerpt:'x'.repeat(60001)})},NOW).ok,false);
});
test('irrelevant source changes can leave the review queue without inventing a finding, and can be reopened',()=>{
 let s=save(site(),'capture',source());s=save(s,'triage',{by:'Reviewer',decision:'no_relevant_change',checked_on:'2026-09-07',note:'Reviewed surrounding text; the page change was navigation only.'},{document_id:'doc_1'});assert.equal(E.queue([s],{},NOW).pending,0);assert.equal(E.state(s).documents[0].claims.length,0);assert.equal(E.state(s).documents[0].excerpt,TEXT);
 assert.equal(E.apply(s,{revision:2,type:'claim',document_id:'doc_1',value:finding()},NOW).ok,false);s=save(s,'triage',{by:'Reviewer',decision:'needs_review',checked_on:'2026-09-07',note:'Additional site context arrived.'},{document_id:'doc_1'});assert.equal(E.queue([s],{},NOW).pending,1);
 assert.equal(E.apply(accepted(),{revision:3,type:'triage',document_id:'doc_1',value:{by:'Reviewer',decision:'wrong_site',checked_on:'2026-09-07',note:'Cannot hide accepted findings'}},NOW).ok,false);
});
