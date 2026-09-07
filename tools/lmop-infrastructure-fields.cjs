'use strict';
// Exact landfill-ID join to the original LMOP landfill-level workbook; no name or coordinate inference.
const FIELDS={
  lfgCollectedYear:'LFG Collected Year',lfgFlaredYear:'LFG Flared Year',methanePct:'Percent Methane',
  wellCount:'Number of Wells',flareCount:'Number of Flares',gccsCapacityCfm:'GCCS Capacity (cfm)',
  currentAreaAcres:'Current Landfill Area (acres)',designAreaAcres:'Design Landfill Area (acres)',
  wasteInPlaceYear:'Waste in Place Year',annualWasteAcceptanceTons:'Annual Waste Acceptance Rate (tons per year)',
  annualWasteAcceptanceYear:'Annual Waste Acceptance Year',lfgGeneratedMmscfd:'LFG Generated (mmscfd)'
};
const TEXT={inventoryCollectionSystem:'LFG Collection System In Place?',flaresInPlace:'Flares in Place?',
  passiveVentingFlaring:'Passive Venting/Flaring?',landfillOperator:'Landfill Operator Organization'};
function numeric(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;}
function enrich(projects,rows){
  if(!Array.isArray(rows)||!rows.length)return {projects,matched:0,landfills:0};
  const hi=rows.findIndex(row=>row.includes('Landfill ID')&&row.includes('Number of Wells'));
  if(hi<0)throw Error('LMOP infrastructure headers not found.');
  const h=rows[hi],index=Object.fromEntries(h.map((v,i)=>[v,i])),byId=new Map();
  for(const r of rows.slice(hi+1)){
    const id=String(r[index['Landfill ID']]||'').trim();if(!id)continue;
    if(byId.has(id))throw Error('Duplicate landfill ID in infrastructure workbook: '+id);
    const record={};
    for(const [key,name]of Object.entries(FIELDS)){record[key]=numeric(r[index[name]]);if(key==='methanePct'&&record[key]>100)record[key]=null;}
    for(const [key,name]of Object.entries(TEXT))record[key]=String(r[index[name]]||'').trim()||null;
    byId.set(id,record);
  }
  let matched=0;
  const result=projects.map(p=>{const fields=byId.get(String(p.lfid));if(!fields)return {...p,infrastructureMatched:false};matched++;return {...p,...fields,infrastructureMatched:true};});
  return {projects:result,matched,landfills:byId.size};
}
module.exports={enrich,FIELDS,TEXT};
