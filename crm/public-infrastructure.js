/* Public asset evidence, joined by authority ID. Does not write a budget or certify reuse. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProtonPublicInfrastructure=factory();}(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const checkedOn='2026-09-17';
  const research={
    '10540':[
      {title:'North Dade · air permit renewal notice',publisher:'Miami-Dade / Florida DEP',date:'2024-09-11',kind:'Existing equipment described',url:'https://www.miamidade.gov/resources/legal-ads/2024/2024-09-11-public-notice-intent-to-issue-air-permit.pdf#page=1',facts:[
        ['Collection & flare','A piped extraction network feeds a utility flare rated at 3,000 scfm.'],
        ['Emergency equipment','The listed Kohler emergency generators burn fuel oil. They do not establish landfill-gas generating capacity.']
      ],note:'The flare rating and the EPA collection-system rating describe different equipment; scfm and cfm are not automatically interchangeable. This notice is for a draft permit renewal, not proof of final permit issuance.'},
      {title:'North Dade · county gas-conversion project scope',publisher:'Miami-Dade County',date:null,kind:'Draft proposal · existing assets described separately',url:'https://www.miamidade.gov/Apps/ISD/StratProc/ProcurementNAS/pdf_Files/FutureSolicitations/DRAFT_-_FUTURE_SOLICITATION-RNG.pdf',facts:[
        ['Existing collection','The county describes active gas collection and flaring at the landfill.'],
        ['Existing utilities','A building, utilities and three-phase power are described at the proposed development area.'],
        ['Collection responsibility','The draft keeps collection-system operation, maintenance and monitoring with the county.'],
        ['New work proposed','The developer would finance the conversion plant and its connections. The proposed RNG plant is not established as built.']
      ],note:'See pages 1–2 and 5–6. Undated draft containing 2024 waste data; no award, available gas allocation or agreement with Proton is established.'}
    ],
    '90':[
      {title:'California Street · adopted water-board order',publisher:'California Regional Water Quality Control Board',date:'2023-06-09',kind:'Existing equipment described',url:'https://www.waterboards.ca.gov/santaana/board_decisions/adopted_orders/orders/2023/r8-2023-0001_wdr.pdf#page=14',facts:[
        ['Extraction wells','39 vertical and 24 horizontal gas-extraction wells.'],
        ['Gas piping','8,500 feet of 10-inch collection pipe.'],
        ['Blowers & gas use','Centrifugal blowers supply gas to an engine serving the adjacent municipal wastewater treatment plant.'],
        ['Condensate handling','An automated pumping system carries condensate to the wastewater plant.']
      ],note:'Order R8-2023-0001, findings 31–32, page 14. Its well counts and generation description differ from the EPA records; retain both dated accounts until their scope and current status are reconciled.'},
      {title:'California Street · EPA greenhouse-gas filing',publisher:'US EPA GHGRP',date:'2023',kind:'Operator-reported equipment',url:'https://ghgdata.epa.gov/ghgp/html/2023.do?et=undefined&id=1010207',facts:[
        ['Manufacturer entry','Lampson Blower'],
        ['Collection system','52 wells and 700 acfm system capacity.']
      ],note:'Facility 1010207, reporting year 2023, Gas Collection System Information. A filing documents reported equipment; it is not an inspection.'}
    ],
    '952':[
      {title:'Pennsauken · contractor installation record',publisher:'SCS Engineers',date:'2004-11',kind:'Historical project · operation began November 2004',url:'https://www.scsengineers.com/scs-project-case-stu/landfill-gas-lfge-ppl-energy-services-pennsauken-new-jersey/',facts:[
        ['Gas conditioning','SCS describes installing a gas pressurization and conditioning skid.'],
        ['Generating plant','Three Caterpillar 3516 engine-generators in a 2.8 MW project.'],
        ['Associated infrastructure','Mechanical piping, flare work, civil works and plant SCADA formed part of the installation.']
      ],note:'Historical installation scope, not confirmation that this equipment remains available. Do not combine it with the separate operating-project capacity or assume present ownership/use rights.'}
    ]
  };
  function num(v){if(v==null||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safeUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch(_){return null;}}
  const fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:3});
  function profile(c){
    const sd=c?.sourceDetail||{};if(c?.source!=='lmop-landfill')return null;
    const lfid=String(sd.lfid||'').trim(),documents=Object.prototype.hasOwnProperty.call(research,lfid)?research[lfid]:[];
    const wells=num(sd.wellCount),flares=num(sd.flareCount),rating=num(sd.gccsCapacityCfm);
    const sourceUrl=safeUrl(sd.infrastructureSourceUrl)||'https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx';
    return {lfid,sourceUrl,period:sd.reportingPeriod||c.sourceSnapshot?.reportingPeriod||'2024-09-04',documents:JSON.parse(JSON.stringify(documents)),metrics:[
      ['Collection system',sd.collectionSystem||'Not reported'],['Extraction wells',wells===null?'Not reported':fmt(wells)],
      ['Flares',flares!==null?fmt(flares):sd.flaresInPlace?sd.flaresInPlace+' · count unreported':'Not reported'],['System rating',rating===null?'Not reported':fmt(rating)+' cfm']
    ],gas:[
      ['Gas collected',num(sd.lfgCollectedMmscfd)===null?'Not reported':fmt(sd.lfgCollectedMmscfd)+' mmscfd'+(sd.lfgCollectedYear?' · '+sd.lfgCollectedYear:' · year unreported')],
      ['Gas flared',num(sd.lfgFlaredMmscfd)===null?'Not reported':fmt(sd.lfgFlaredMmscfd)+' mmscfd'+(sd.lfgFlaredYear?' · '+sd.lfgFlaredYear:' · year unreported')],
      ['Methane content',num(sd.methanePct)===null?'Not reported':fmt(sd.methanePct)+'% · sample date unreported']
    ]};
  }
  function link(url,label){const u=safeUrl(url);return u?'<a class="link" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';}
  function facts(rows,cls){return '<dl class="'+cls+'">'+rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';}
  function render(c){
    const p=profile(c);if(!p)return '';
    return '<section class="crm-public-infra" aria-label="Public infrastructure records"><div class="public-infra-heading"><h4>Public infrastructure records</h4><span>EPA inventory · '+esc(p.period)+'</span></div>'+facts(p.metrics,'public-infra-metrics')+
      '<details class="public-infra-source"><summary>Gas measurements & EPA source</summary>'+facts(p.gas,'fact-list')+'<p class="quiet-note">Landfill ID '+esc(p.lfid||'not recorded')+'. Inventory release date is separate from measurement years.</p><p>'+link(p.sourceUrl,'Open EPA inventory')+'</p></details>'+
      (p.documents.length?'<div class="public-infra-documents">'+p.documents.map(d=>'<details class="public-infra-document"><summary><span>'+esc(d.title)+'<small>'+esc(d.kind)+'</small></span></summary>'+facts(d.facts,'fact-list')+'<p class="quiet-note">'+esc(d.note)+'</p><p class="quiet-note">'+esc(d.publisher)+' · '+esc(d.date||'Document date not published')+' · reviewed '+checkedOn+'</p><p>'+link(d.url,'Read source document')+'</p></details>').join('')+'</div>':'<p class="quiet-note">EPA inventory is available here. Additional site-specific permit or engineering documents have not yet been reviewed for this landfill.</p>')+
      '<p class="quiet-note public-infra-basis">Public records establish what was reported on site. Reuse cost, condition and Proton’s access are recorded separately below.</p></section>';
  }
  function enrichInventory(c,inventory){
    const sd=c?.sourceDetail||{};if(c?.source!=='lmop-landfill')return inventory;
    const id=String(sd.lfid||''),record=sd.legacyRecordId||c.id,additions={};
    // Scope installation evidence to the historical project; a sibling project does not inherit it.
    if(id==='952'&&record==='lmop_1023-0'){
      const source=research['952'][0];
      additions.gas_treatment={presence:'historical',finding:'SCS documents a gas pressurization and conditioning skid in the project that began operation in November 2004. Current retention, treatment specification and repair scope are unconfirmed.',source_url:source.url,reportingPeriod:source.date};
      additions.civil={presence:'historical',finding:'SCS documents completed civil and structural work for the historical 2004 generating project. Suitability for a new mine layout is unconfirmed.',source_url:source.url,reportingPeriod:source.date};
    }
    if(id==='10540')additions.grid={presence:'reported',finding:'The county draft describes existing three-phase power at the proposed development area. Capacity, utility upgrade costs and access for Proton are not established.',source_url:research[id][1].url,reportingPeriod:null};
    if(id==='90')additions.gas_treatment={presence:'unknown',finding:'The 2023 water-board order documents condensate pumping to the wastewater plant. It does not establish a complete engine-grade treatment and compression package for Proton.',source_url:research[id][0].url,reportingPeriod:research[id][0].date};
    return inventory.map(a=>!a.userRecorded&&a.presence==='unknown'&&additions[a.id]?Object.assign({},a,additions[a.id],{publicDocument:true,condition:'unknown',access:'unknown'}):a);
  }
  return {profile,render,enrichInventory,checkedOn};
}));
