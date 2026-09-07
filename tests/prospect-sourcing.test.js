'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../prospect-sourcing'),U=require('../prospect-sourcing-ui');
const NOW=Date.parse('2026-09-07T16:00:00Z');
const site=()=>({id:'test',name:'Synthetic landfill',jurisdiction:'US-FL',stage:'researching',quoted_rate:.03,custom_fields:{private:'Keep'}});
const signal=extra=>({play:'ppa_expiry',by:'Test recorder',claim:'Synthetic PPA expiry opens an owner discussion.',source_url:'https://example.com/owner-agreement',document_date:'2020-01-01',locator:'Executed agreement, section 8',site_match:'Exact landfill ID and address in the executed document',event_on:'2026-10-05',notice_on:'2026-09-17',date_detail:'5 PM Eastern; verify owner receipt requirements',verification:'Confirm renewal rights and the incumbent plan with the owner',owner:'Test recorder',due_on:'2026-09-10',...extra});
const review=extra=>({by:'Test reviewer',decision:'reviewed',checked_on:'2026-09-07',note:'Synthetic review: source and current applicability checked with owner',site_confirmed:true,current_confirmed:true,...extra});
function save(s,type,value,id,now=NOW){const r=S.apply(s,{revision:S.state(s).revision,type,value,id},now);assert.equal(r.ok,true,r.err);return {...s,custom_fields:{...s.custom_fields,[S.KEY]:r.sourcing}};}
test('source and assigned verification save together, without changing commercial qualification or private data',()=>{
 const original=site(),s=save(original,'add',signal()),e=S.state(s).signals[0];assert.equal(e.status,'pending');assert.equal(e.action.status,'open');assert.equal(e.action.owner,'Test recorder');assert.equal(S.state(original).signals.length,0);assert.equal(s.quoted_rate,.03);assert.equal(s.custom_fields.private,'Keep');assert.equal(s.stage,'researching');assert.equal(S.queue([s],{},NOW).rows[0].phase,'review');
});
test('source, site match, dates and action ownership are required; undated means explicitly undated',()=>{
 const patches=[{source_url:'',document_ref:''},{site_match:''},{locator:''},{document_date:''},{document_date:'2026-09-08'},{undated_source:true},{event_on:''},{event_on:'2026-02-30'},{notice_on:'2026-11-01'},{owner:''},{due_on:''},{source_url:'javascript:alert(1)'},{source_url:'https://user:secret@example.com/'}];
 for(const p of patches)assert.equal(S.apply(site(),{revision:0,type:'add',value:signal(p)},NOW).ok,false,JSON.stringify(p));
 assert.equal(S.state(save(site(),'add',signal({document_date:'',undated_source:true}))).signals[0].undated_source,true);
});
test('review requires explicit applicability and site confirmation and rejects future or pre-document dates',()=>{
 const s=save(site(),'add',signal());for(const p of [{site_confirmed:false},{current_confirmed:false},{checked_on:'2026-09-08'},{checked_on:'2019-01-01'},{note:''}])assert.equal(S.apply(s,{revision:1,type:'review',id:'sg_1',value:review(p)},NOW).ok,false);
 const current=save(s,'review',review(),'sg_1'),r=S.queue([current],{},NOW).rows[0];assert.equal(r.phase,'current');assert.equal(r.window_on,'2026-09-17');assert.equal(r.window_days,10);assert.equal(r.rank,0);assert.match(r.reason,/within 30/);
});
test('notice cutoff, passed windows, dated review freshness and local calendar boundaries are handled independently',()=>{
 let s=save(site(),'add',signal());s=save(s,'review',review(),'sg_1');assert.equal(S.queue([s],{},Date.parse('2026-09-18T16:00:00Z')).rows[0].phase,'passed');
 const later=save(site(),'add',signal({event_on:'2027-09-01',notice_on:''}));const checked=save(later,'review',review(),'sg_1');assert.equal(S.queue([checked],{},Date.parse('2026-12-07T16:00:00Z')).rows[0].phase,'review');
 assert.equal(S.days('2026-09-07',new Date(2026,8,7,23,59).getTime()),0);
});
test('completing or rescheduling verification does not move a source deadline or silently close an opportunity',()=>{
 let s=save(site(),'add',signal());s=save(s,'review',review(),'sg_1');s=save(s,'action',{by:'Test recorder',status:'reschedule',due_on:'2026-09-20',note:'Owner requested a later meeting'},'sg_1');let r=S.queue([s],{},NOW).rows[0];assert.equal(r.window_on,'2026-09-17');assert.match(r.date_warning,/after/);
 s=save(s,'action',{by:'Test recorder',status:'done',note:'Obtained signed agreement'},'sg_1');assert.equal(S.queue([s],{},NOW).rows.length,1);assert.equal(S.queue([s],{},NOW).rows[0].action_open,false);
 s=save(s,'action',{by:'Test recorder',status:'open',note:'Confirm the earlier notice provision'},'sg_1');assert.equal(S.queue([s],{},NOW).rows[0].action_open,true);assert.equal(S.state(s).signals[0].action.history.length,3);
});
test('withdrawal and rejection retain the record while removing it from active sourcing',()=>{
 let s=save(site(),'add',signal());s=save(s,'review',review(),'sg_1');s=save(s,'review',review({decision:'withdrawn',note:'Owner produced an executed extension'}),'sg_1');assert.equal(S.queue([s],{},NOW).rows.length,0);assert.equal(S.state(s).signals.length,1);assert.equal(S.state(s).history.length,3);
 assert.equal(S.apply(s,{revision:3,type:'review',id:'sg_1',value:review()},NOW).ok,false);
 const rejected=save(save(site(),'add',signal()),'review',review({decision:'rejected',site_confirmed:false,current_confirmed:false}),'sg_1');assert.equal(S.queue([rejected],{},NOW).rows.length,0);
});
test('stale forms, duplicate claims and corrupted saved records cannot replace the existing history',()=>{
 const s=save(site(),'add',signal());assert.match(S.apply(s,{revision:0,type:'add',value:signal()},NOW).err,/another view/);assert.match(S.apply(s,{revision:1,type:'add',value:signal()},NOW).err,/already recorded/);
 const bad=structuredClone(s);bad.custom_fields[S.KEY].signals[0].reviews=[null];assert.ok(S.state(bad).error);assert.equal(S.queue([bad],{},NOW).errors.length,1);assert.equal(S.apply(bad,{revision:1,type:'add',value:signal()},NOW).ok,false);
});
test('queue filters and order are transparent; closed sites stay out and no MW score is invented',()=>{
 let first=save(site(),'add',signal());first=save(first,'review',review(),'sg_1');const pending=save({...site(),id:'second'},'add',signal({play:'other_energy',event_on:'',notice_on:'',due_on:'2026-09-01'}));
 const q=S.queue([pending,first,{...first,id:'lost',stage:'dead'},{...first,id:'won',stage:'closed_won'}],{},NOW);assert.equal(q.rows.length,2);assert.equal(q.rows[0].prospect_id,'test');assert.equal(q.rows[0].availableKw,undefined);
 assert.equal(S.queue([pending,first],{phase:'current',horizon:'30',region:'fl',q:'synthetic',play:'ppa_expiry'},NOW).rows.length,1);assert.equal(S.queue([pending],{horizon:'30'},NOW).rows.length,0);
 const f={q:'A & B #1',play:'ppa_expiry',region:'US-FL',phase:'current',horizon:'90'};assert.deepEqual(S.fromHash(S.hash(f)),f);assert.equal(S.fromHash('#sourcing?play=bad&horizon=-1').play,'');
});
test('saved searches survive reload and refuse duplicate names, stale writes, corrupt stores and storage failure',()=>{
 const data={},storage={getItem:k=>data[k]||null,setItem:(k,v)=>{data[k]=v;}};let r=S.saveSearch(storage,{revision:0,type:'save',name:'Florida windows',filters:{region:'FL',horizon:'90'}});assert.equal(r.ok,true);assert.equal(S.searches(storage).items[0].filters.region,'FL');
 assert.equal(S.saveSearch(storage,{revision:0,type:'save',name:'Other',filters:{}}).ok,false);assert.equal(S.saveSearch(storage,{revision:1,type:'save',name:'florida windows',filters:{}}).ok,false);
 const before=data[S.SEARCH_KEY];const failed={getItem:storage.getItem,setItem:()=>{throw Error('Quota');}};assert.equal(S.saveSearch(failed,{revision:1,type:'remove',id:'search_1'}).ok,false);assert.equal(data[S.SEARCH_KEY],before);
 assert.equal(S.saveSearch(storage,{revision:1,type:'remove',id:'search_1'}).ok,true);data[S.SEARCH_KEY]='broken';assert.ok(S.searches(storage).error);assert.equal(S.saveSearch(storage,{revision:2,type:'save',name:'New'}).ok,false);
});
test('untrusted notes render as text and unsafe URLs cannot become source links',()=>{
 const s=save(site(),'add',signal({claim:'<img src=x onerror=alert(1)>'}));const html=U.render(s);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/awaiting|Verification needed/);
});
test('a recorded state survives country-only site storage and seeds the next trigger without changing jurisdiction',()=>{
 const original={...site(),jurisdiction:'USA'},s=save(original,'add',signal({region:'FL'}));assert.equal(s.jurisdiction,'USA');assert.equal(S.region(s),'FL');assert.equal(S.queue([s],{region:'FL'},NOW).rows.length,1);assert.equal(S.queue([s],{region:'TX'},NOW).rows.length,0);
 assert.equal(S.queue([s],{},NOW).rows[0].window_label,'Notice / submission cutoff');assert.equal(S.queue([save(original,'add',signal({notice_on:''}))],{},NOW).rows[0].window_label,'Agreement expiry');assert.equal(S.region(original),'USA');
 assert.equal(S.apply(original,{revision:0,type:'add',value:signal({region:'x'.repeat(61)})},NOW).ok,false);
});
