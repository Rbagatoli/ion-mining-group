'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const O=require('../owner-confirmation'),Ui=require('../owner-confirmation-ui'),S=require('../site-model'),R=require('../deal-relationships'),D=require('../prospect-diligence');
const I=require('../crm-interactions'),L=require('../crm-log'),C=require('../crm-config'),F=require('../crm-followups'),T=require('../prospect-today'),Detail=require('../prospect-detail');
const Summary=require('../prospect-summary'),Board=require('../prospect-board'),Analytics=require('../prospect-analytics');
const NOW=Date.parse('2026-09-07T16:00:00Z');
function setup(){const data={},uploads=[];let fail=false;Object.assign(global,{OwnerConfirmation:O,OwnerConfirmationUi:Ui,SiteData:S,CrmLog:L,CrmConfig:C,CrmInteractions:I,CrmFollowups:F,SyncEngine:{save:(...a)=>uploads.push(a)},localStorage:{getItem:k=>data[k]||null,setItem:(k,v)=>{if(fail)throw Error('Synthetic quota failure');data[k]=v;}}});L.reset();C.reset();F.reset();return {data,uploads,fail:v=>{fail=v;}};}
function call(extra={}){return {recorded_by:'Test recorder',occurred_on:'2026-09-07',method:'call',direction:'outbound',outcome:'discussion',person:'Test operator',summary:'Synthetic discussion: usable equipment needs inspection.',answers:{infrastructure:{basis:'owner_report',note:'Collection reportedly exists; no generator offered. Request equipment records and quote for new generation.'}},due_on:'2026-09-07',next_action:'Obtain equipment list and capital scope',action_owner:'Test recorder',...extra};}
function command(s,extra={}){return {revision:O.state(s).revision,type:'conversation',value:call(extra)};}
test('one site save retains the conversation and promised action through ordinary edits, backup/reload and sync',()=>{
  const h=setup(),s=S.add({id:'owner-test',name:'Synthetic site',quoted_rate:.03,contact_name:'Existing contact',custom_fields:{private:'keep',[R.storageKey]:{v:1,revision:0,nodes:[],connections:[],history:[]},[D.KEY]:{v:1,revision:0,assets:{},capacity:{},history:[]}}});
  const fields=structuredClone(s.custom_fields),uploadCount=h.uploads.length;
  assert.equal(Ui.commit(s.id,command(s)).ok,true);assert.equal(h.uploads.length,uploadCount+1,'one site upload, no separate log or follow-up write');
  const saved=S.get(s.id);for(const key of Object.keys(fields))assert.deepEqual(saved.custom_fields[key],fields[key]);
  assert.equal(saved.quoted_rate,.03);assert.equal(saved.contact_name,'Existing contact');assert.equal(saved.stage,'unreviewed');
  assert.equal(L.forProspect(s.id).length,0);assert.equal(F.forProspect(s.id).length,0);assert.equal(O.actions(saved,NOW).length,1);
  S.update(s.id,{notes:'Edited by an older page'});const roundtrip=JSON.parse(h.data.protonMiningSites).sites.find(x=>x.id===s.id);assert.deepEqual(O.state(roundtrip),O.state(saved));
});
test('failed storage and stale views leave the saved conversation and capital ledger unchanged',()=>{
  const h=setup(),s=S.add({id:'failure-test',name:'Synthetic site'});assert.equal(Ui.commit(s.id,command(s)).ok,true);const before=JSON.stringify(S.get(s.id)),uploads=h.uploads.length;
  h.fail(true);const result=Ui.commit(s.id,command(S.get(s.id)));assert.equal(result.ok,false);assert.match(result.err,/draft is preserved/);assert.equal(JSON.stringify(S.get(s.id)),before);assert.equal(h.uploads.length,uploads);
  h.fail(false);assert.equal(Ui.commit(s.id,command(s)).ok,false);assert.equal(JSON.stringify(S.get(s.id)),before);
});
test('CRM history and Today derive from saved owner conversations without duplicates, including correction and completion',()=>{
  setup();const s=S.add({id:'history-test',name:'Synthetic site',stage:'contacted'});
  assert.equal(Ui.commit(s.id,command(s)).ok,true);assert.equal(I.currentFor(s.id).length,1);assert.equal(Detail.timeline(s.id).length,1);assert.equal(I.daysSinceContact(s.id,NOW),0);
  assert.equal(I.daysSinceContact(s.id,new Date(2026,8,7,23,30).getTime()),0,'A date-only owner call stays today through the local evening');
  let today=T.build(NOW);assert.equal(today.ownerActions.length,1);assert.equal(today.neverContacted.some(x=>x.prospect_id===s.id),false);
  const legacy=I.log(s.id,{type:'call',summary:'Legacy interaction',occurred_at:'2026-09-06T16:00:00Z'});assert.equal(legacy.ok,true,legacy.err);assert.equal(I.currentFor(s.id).length,2);
  assert.equal(Ui.commit(s.id,{revision:1,type:'void',id:'oc_1',value:{recorded_by:'Recorder',note:'Wrong site'}}).ok,true);assert.equal(I.currentFor(s.id).length,1);assert.equal(I.daysSinceContact(s.id,NOW),1);assert.equal(T.build(NOW).ownerActions.length,1);
  assert.equal(Ui.commit(s.id,{revision:2,type:'action',id:'oa_1',value:{recorded_by:'Recorder',status:'done',note:'No longer applicable to this site'}}).ok,true);assert.equal(T.build(NOW).ownerActions.length,0);
});
test('owner follow-ups and contact history still work if the separate legacy stores are unavailable',()=>{
  setup();const s=S.add({id:'degraded-test',name:'Synthetic site'});assert.equal(Ui.commit(s.id,command(s)).ok,true);global.CrmFollowups=undefined;global.CrmLog=undefined;
  assert.equal(T.build(NOW).ownerActions.length,1);assert.equal(I.currentFor(s.id).length,1);assert.equal(Detail.timeline(s.id).length,1);
});
test('Board, one-page summary and outreach analytics use the same current owner history and earliest promise',()=>{
  setup();const s=S.add({id:'summary-test',name:'Synthetic site'});assert.equal(Ui.commit(s.id,command(s)).ok,true);
  const saved=S.get(s.id),summary=Summary.build(s.id,NOW);assert.equal(summary.standing.nextDue,'2026-09-07');assert.match(summary.standing.nextAction,/equipment list/);assert.equal(summary.historyTotal,1);assert.match(Board.card(saved),/pb-due/);
  assert.equal(Analytics.outreach().sent,1);assert.equal(Analytics.outreach().answered,1);
  assert.equal(Ui.commit(s.id,command(saved,{direction:'inbound',occurred_on:'2026-09-06',summary:'Older incoming reply'})).ok,true);assert.equal(Analytics.outreach().sent,1);assert.match(Summary.build(s.id,NOW).history[0].line,/Synthetic discussion/);
  const legacy={id:'legacy',description:'Earlier legacy promise',due_date:'2026-09-06'};assert.equal(O.nextAction(S.get(s.id),legacy,NOW),legacy);
  assert.equal(Ui.commit(s.id,{revision:2,type:'void',id:'oc_1',value:{recorded_by:'Recorder',note:'Wrong site'}}).ok,true);assert.equal(Analytics.outreach().sent,0);assert.equal(Summary.build(s.id,NOW).historyTotal,1);
});
test('every CRM page loads the owner model before interactions, with offline and deployment assets included',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  for(const file of ['map.html','contacts.html','prospecting.html']){const html=read(file);assert.ok(html.indexOf('owner-confirmation.js?')>=0);assert.ok(html.indexOf('owner-confirmation.js?')<html.indexOf('crm-interactions.js?'));}
  const assets=JSON.parse(read('tools/app-assets.json'));for(const f of ['owner-confirmation.js','owner-confirmation-ui.js','owner-confirmation.css']){assert.ok(assets.includes(f));assert.ok(read('sw.js').includes("'./"+f+"'"));}
});
