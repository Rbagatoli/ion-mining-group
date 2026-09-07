/* Historical research leads, grouped by the exact EPA landfill ID. No inferred agreement dates. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),L=require('../source-landfill');
const normalize=b=>b.toString('utf8').replace(/\r\n/g,'\n');
const digest=b=>crypto.createHash('sha256').update(normalize(b)).digest('hex');
async function build(){
    const sourceBytes=fs.readFileSync(path.join(root,'data/landfills.json')),data=JSON.parse(sourceBytes),contactFiles=fs.readdirSync(path.join(root,'data')).filter(f=>/^landfill-contacts-2026-09-06-[a-f0-9]{2}\.json$/.test(f)).sort();
    const contacts={},contactHash=crypto.createHash('sha256');
    for(const f of contactFiles){const bytes=fs.readFileSync(path.join(root,'data',f));contactHash.update(f).update(normalize(bytes));Object.assign(contacts,JSON.parse(bytes).sites);}
    // Feed the actual adapter its on-disk source. This fixes aliases and IDs exactly as the app does.
    const originalFetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>data});try{await L.load();}finally{global.fetch=originalFetch;}
    const groups=new Map();
    for(const raw of data.projects){if(!/^\d+$/.test(String(raw.lfid||'')))continue;const key='us-lf-'+raw.lfid,c={...L.adapter.normalize(raw),source:'lmop-landfill'};
        if(!groups.has(key))groups.set(key,{key,raws:[],candidates:[]});groups.get(key).raws.push(raw);groups.get(key).candidates.push(c);}
    const leads=[];
    for(const g of groups.values()){
        const r=g.raws[0],c=g.candidates[0],active=g.raws.some(x=>/^operational$/i.test(x.projectStatus||'')),planned=g.raws.some(x=>/construction|planned/i.test(x.projectStatus||'')),routes=contacts[g.key]?.contacts||[];
        const contact=routes.find(x=>(x.phone||x.email)&&x.sourceUrl),cues=[];
        const collected=g.raws.find(x=>x.lfgCollectedMmscfd>0),flare=g.raws.find(x=>x.lfgFlaredMmscfd>0),collection=g.raws.some(x=>/^yes$/i.test(x.collectionSystem||'')||/^yes$/i.test(x.inventoryCollectionSystem||''));
        const hasFlow=g.raws.some(x=>[x.lfgCollectedMmscfd,x.lfgFlaredMmscfd,x.lfgFlowToProjectMmscfd].some(v=>v!==null&&v!==undefined));
        if(collection&&flare&&!active)cues.push({play:'flared_surplus',claim:'Collection is recorded and '+flare.lfgFlaredMmscfd+' mmscfd was reported flared in '+(flare.lfgFlaredYear||'an unrecorded measurement year')+'. No operational energy project is listed for this landfill in this snapshot.',source_url:data.infrastructureSource.sourceUrl,locator:'Landfill inventory; Landfill ID '+r.lfid+'; collection and flared-gas fields'});
        const idle=g.raws.find((x,i)=>/shutdown/i.test(x.projectStatus||'')&&g.candidates[i].sourceDetail.generationEvidence==='historical shutdown project');
        if(idle&&collection&&collected)cues.push({play:'idle_generation',claim:'An electricity project is listed as shutdown, with collection recorded and '+collected.lfgCollectedMmscfd+' mmscfd collected in '+(collected.lfgCollectedYear||'an unrecorded measurement year')+'. Current equipment condition and availability are unknown.',source_url:data.sourceUrl,locator:'Project inventory; Landfill ID '+r.lfid+'; project '+idle.id});
        if(!hasFlow&&contact)cues.push({play:'capacity_gap',claim:'No measured collection, flare or project flow is reported in this snapshot. A public business contact route is recorded; its current role and reachability require confirmation.',source_url:data.infrastructureSource.sourceUrl,locator:'Landfill inventory; Landfill ID '+r.lfid+'; gas-volume fields'});
        if(!cues.length)continue;
        leads.push({physical_id:g.key,name:r.name,region:r.state||'',owner:r.owner||'',candidate_id:c.id,candidate_ids:g.candidates.map(x=>x.id).sort(),project_count:g.raws.length,
            source_date:data.sourceReleaseDate,measurement_years:[...new Set(g.raws.flatMap(x=>[x.lfgCollectedYear,x.lfgFlaredYear]).filter(x=>x!=null))].sort(),
            competing_use:active?'An operational energy project is also listed. Confirm existing allocations.':planned?'A planned or construction-stage energy project is also listed. Confirm competing rights and schedule.':'Current gas-rights agreements and competing uses are unknown.',
            contact:contact?{source_url:contact.sourceUrl,source_date:contact.sourceDate||'',scope:contact.scope||'',checked_on:contact.retrievedOn||''}:null,cues});
    }
    leads.sort((a,b)=>a.name.localeCompare(b.name,'en')||a.physical_id.localeCompare(b.physical_id));
    const result={v:1,edition:'2026-09-07',source_release:data.sourceReleaseDate,source_url:data.sourceUrl,inventory_url:data.infrastructureSource.sourceUrl,
        source_sha256:digest(sourceBytes),contacts_sha256:contactHash.digest('hex'),source_records:data.projects.length,physical_landfills:groups.size,
        note:'Historical catalogue research leads. A later import or contact lookup does not make gas measurements current. These cues never establish available rights, reuse savings, live procurement or PPA expiry.',leads};
    fs.writeFileSync(path.join(root,'data/sourcing-leads-2026-09-07.json'),JSON.stringify(result)+'\n');
    console.log(JSON.stringify({leads:leads.length,physicalLandfills:groups.size,sourceRecords:data.projects.length,counts:Object.fromEntries(['flared_surplus','idle_generation','capacity_gap'].map(k=>[k,leads.filter(x=>x.cues.some(c=>c.play===k)).length]))}));
    return result;
}
if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={build};
