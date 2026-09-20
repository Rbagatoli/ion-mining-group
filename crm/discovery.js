/* Discover owns its view state; searching never rebuilds the WebGL canvas. */
(function(root){
  'use strict';
  const S=ProtonDiscoveryModel,E=ProtonCrmEnergyScouting,scriptBase=new URL('.',document.currentScript.src);
  const energy={specialty:'Specialty · landfill & stranded gas',all:'All energy sources',grid_facility:'Power generation & storage',...Object.fromEntries(E.matching.sourceTypes.map(s=>[s.id,s.label]))};
  const scopeNotes={supply:'Operating power plants across energy types, plus landfill and flare fuel prospects. On-site, backup-only, offline and storage-only records stay outside this view. Available client energy and willingness to supply still need confirmation.',producers:'Utility and independent power plants with reported operating generation. Available client power and willingness to supply still need confirmation.',resources:'Fuel and development prospects need a verified route to usable electricity. They are not ready power offers.',onsite:'Generation at commercial or industrial sites. Export rights, surplus and willingness to supply are unconfirmed.',storage:'Storage shifts energy; confirm charging supply, usable duration and discharge terms.',all:'All energy research includes self-generation, storage, standby plants and fuel prospects. Inclusion does not establish available supply.'};
  const defaults=S.defaultFilters;
  function create({data:D,model:M,esc,options,row,tag,empty,onSelect,onRestore,onBrief}){
    let clientBrief=null,showExcluded=false,allResults=[];
    let f=defaults(),host=null,globe=null,globeView=null,run=0,mountId=0,limit=40,results=[],catalog=[],selected='',mode='sites',advanced=false,timer,aborter,detailOpen=false,detailHtml='',detailLabel='',detailRecord='',detailSection='',detailScroll=0,restorePending=false,rangeCeiling=5;
    const el=id=>host?.querySelector('#'+id),action=(label,id,extra='')=>'<button type="button" data-discovery-action="'+id+'" '+extra+'>'+label+'</button>';
    const field=(label,id,input)=>'<label class="discover-field" for="'+id+'"><span>'+label+'</span>'+input+'</label>';
    const input=(id,placeholder,value,extra='')=>'<input id="'+id+'" placeholder="'+placeholder+'" value="'+esc(value)+'" '+extra+'>';
    const select=(id,map,value)=>'<select id="'+id+'">'+options(map,value)+'</select>';
    function capacity(){const b=S.sliderBounds(f);rangeCeiling=b.ceiling;return '<section class="discover-capacity" aria-label="Filter by planned megawatts"><div class="discover-capacity-head"><strong>Mine size to price</strong><span id="discoveryMwLabel"></span></div><div class="discover-capacity-controls"><div class="discover-range-wrap"><div class="discover-range" id="discoveryRange"><span class="discover-range-track"></span><span class="discover-range-fill" id="discoveryRangeFill"></span><input id="discoveryMinRange" type="range" min="0" max="'+b.ceiling+'" step="0.025" value="'+b.low+'" aria-label="Minimum planned mine size in MW"><input id="discoveryMaxRange" type="range" min="0" max="'+b.ceiling+'" step="0.025" value="'+b.high+'" aria-label="Maximum planned mine size in MW"></div><div class="discover-range-ends"><span>0 MW</span><span id="discoveryRangeEnd">'+b.ceiling+' MW+</span></div></div>'+field('Min MW','discoveryMinMw',input('discoveryMinMw','Any',f.minMw,'type="number" min="0" step="any" inputmode="decimal"'))+field('Max MW','discoveryMaxMw',input('discoveryMaxMw','No limit',f.maxMw,'type="number" min="0" step="any" inputmode="decimal"'))+'</div></section>';}
    function html(){return '<section id="discoverWorkspace" class="discover-workspace" data-view="'+mode+'" data-expanded="'+detailOpen+'">'+
      '<header class="page-heading discover-heading"><div><p class="eyebrow">DISCOVER</p><h1>Find energy supply sites.</h1><p>Start with landfill and stranded gas. Expand the search when a client’s needs or site evidence support it.</p></div>'+action('Client search brief','client-brief','class="button"')+'</header><div id="discoveryBrief"></div>'+
      '<div class="discover-search-panel"><div class="discover-searches">'+
      field('Site or operator','discoverySearch',input('discoverySearch','Search names, companies or source IDs',f.query,'type="search" autocomplete="off"'))+
      field('Location','discoveryLocation',input('discoveryLocation','City, county, state or province',f.location,'type="search" list="discoveryPlaces" autocomplete="off"'))+'</div><datalist id="discoveryPlaces"></datalist>'+
      '<div class="discover-controls">'+field('Source / research focus','discoveryKind',select('discoveryKind',energy,f.kind))+field('Country','discoveryCountry',select('discoveryCountry',{'':'All countries',USA:'United States',CAN:'Canada'},f.country))+
      '<div class="discover-shortcuts">'+action('Generation reported','generation','class="discover-chip" aria-pressed="'+f.generation+'" title="Source reports installed generation; condition and available power still need confirmation"')+
      action('More filters <span id="discoveryFilterCount"></span>','filters','class="discover-chip" aria-expanded="'+advanced+'" aria-controls="discoveryAdvanced"')+'</div></div>'+capacity()+
      '<div class="discover-supply">'+field('Energy site role','discoverySupplyScope',select('discoverySupplyScope',S.supplyScopes,f.supplyScope))+'<p id="discoverySupplyNote"></p></div>'+
      '<p id="discoveryFocusNote" class="discover-focus-note"></p>'+
      '<div id="discoveryAdvanced" class="discover-advanced"'+(advanced?'':' hidden')+'>'+field('Max remaining cost · USD','discoveryCash',input('discoveryCash','No limit',f.cash,'type="number" min="0" step="any" inputmode="decimal"'))+
      field('Infrastructure','discoveryInfrastructure',select('discoveryInfrastructure',{'':'Any infrastructure',reported:'Equipment reported',reuse:'Reuse documented'},f.infrastructure))+
      field('Pipeline','discoveryTracking',select('discoveryTracking',{'':'All sites',new:'Not yet saved',saved:'Saved to pipeline'},f.tracking))+
      '<p>Cost limits use the funding estimate without unconfirmed reuse savings. Unpriced work may remain.</p></div>'+
      '<div id="discoveryChips" class="discover-active"></div><p id="discoveryError" role="alert" class="discover-error" hidden></p></div>'+
      '<div id="catalogWarning"></div><div class="discover-results-bar"><div><p id="discoveryCount" role="status">Loading the source catalog…</p><span id="discoveryExcluded"></span></div><div class="segmented discover-mode" aria-label="Discover view">'+action('Sites','view-sites','aria-pressed="'+(mode==='sites')+'"')+action('Globe','view-globe','aria-pressed="'+(mode==='globe')+'"')+'</div></div>'+
      '<div class="discover-layout"><section class="panel discover-results"><div class="discover-list-top">'+field('Sort','discoverySort',select('discoverySort',{priority:'Research priority',capital:'Lowest remaining cost',name:'Site name'},f.sort))+'<span id="discoveryResultBasis">Remaining<br>estimate</span></div><div id="discoveryList" aria-busy="true"><div class="loading">Preparing energy opportunities…</div></div><div id="discoveryMore"></div></section>'+
      '<section class="panel discover-map" aria-label="Explore sites on the globe"><div class="discover-map-head"><span><i></i> Energy opportunities</span>'+action('Fit results','fit','class="text-button"')+'</div><div id="discoveryGlobe" class="discovery-globe"><p id="globeStatus" class="globe-status">Loading the globe…</p></div><div class="discover-map-tools">'+action('+','zoom-in','aria-label="Zoom in"')+action('−','zoom-out','aria-label="Zoom out"')+action('↺','reset-globe','aria-label="Reset globe"')+'</div><div class="discover-legend"><span class="source-landfill_gas">● Landfill</span><span class="source-flare_gas">● Flare</span><span class="source-grid_facility">● Power generation / storage</span></div><p id="discoveryMapCount" class="discover-map-count"></p><p class="discover-map-hint">Drag to rotate · Scroll to zoom · Select a site</p></section>'+
      '<section id="discoveryDetail" class="panel discover-detail" aria-labelledby="discoveryDetailTitle"'+(detailOpen?'':' hidden')+'><header class="discover-detail-header"><h2 id="discoveryDetailTitle">'+esc(detailLabel||'Selected prospect')+'</h2>'+action('Collapse <span aria-hidden="true">⌃</span>','collapse-detail','class="text-button" aria-label="Collapse prospect details" aria-expanded="'+detailOpen+'" aria-controls="discoveryDetailBody"')+'</header><div id="discoveryDetailBody" tabindex="-1">'+detailHtml+'</div></section></div>'+
      '<p id="discoveryBasisNote" class="quiet-note discover-footnote">MW filters and prices use the same planned mine size. This is not allocated power. Open Capital for reported equipment, possible reuse savings and unpriced work.</p></section>';}
    function filters(){
      if(!host)return;const chips=[];
      el('discoverySupplyNote').textContent=scopeNotes[f.supplyScope];
      el('discoveryFocusNote').textContent=(f.kind==='specialty'?'Specialty view: landfill gas resources and generation, plus flare / stranded gas prospects. Choose All energy sources or an individual source to expand. ':'Broader research: pursue sources that fit a client or have specific evidence worth investigating. ')+'Catalog inclusion or saving a site does not qualify it or assign agent work.';
      el('discoveryBrief').innerHTML=clientBrief?'<div class="banner"><strong>'+esc(clientBrief.client||'Internal sample')+'</strong> · '+esc(clientBrief.minMw)+' MW minimum client allocation · '+esc(E.costBases[clientBrief.costBasis])+'<p>Applying a brief opens all energy sources; its allowed sources and exclusions guide fit. The Source control can refine this view. Fit covers the selected Energy site role and filters. Choose All energy research to include every role. Public capacity alone stays unresolved. This search brief is temporary until saved with site evidence or a research assignment.</p>'+action('Edit brief','client-brief','class="text-button"')+' '+action('Clear client brief','clear-brief','class="text-button"')+'</div>':'';
      host.querySelector('.discover-capacity').hidden=!!clientBrief;el('discoverySort').disabled=!!clientBrief;el('discoveryResultBasis').innerHTML=clientBrief?'Owner-evidenced<br>terms':'Remaining<br>estimate';
      el('discoveryBasisNote').textContent=clientBrief?'Client fit uses the brief’s geography, source exclusions and dated owner evidence for offered allocation, price and client capital. Missing facts stay unknown. Comparable prices rank only after hard-fit checks; source-level mine planning is separate.':'MW filters and prices use the same planned mine size. This is not allocated power. Open Capital for reported equipment, possible reuse savings and unpriced work.';
      if(f.query)chips.push(['query','Search: '+f.query]);if(f.location)chips.push(['location',f.location]);if(f.kind!=='all')chips.push(['kind',energy[f.kind]]);if(f.country)chips.push(['country',S.countryName(f.country)]);
      if(f.infrastructure)chips.push(['infrastructure',f.infrastructure==='reuse'?'Reuse documented':'Equipment reported']);if(f.generation)chips.push(['generation','Generation reported']);if(f.cash!=='')chips.push(['cash','Up to '+M.money(S.numeric(f.cash))]);if(f.minMw!=='')chips.push(['minMw','From '+f.minMw+' MW']);if(f.maxMw!=='')chips.push(['maxMw','Up to '+f.maxMw+' MW']);if(f.tracking)chips.push(['tracking',f.tracking==='saved'?'In pipeline':'Not yet saved']);
      el('discoveryChips').innerHTML=chips.map(([key,label])=>action(esc(label)+' <span aria-hidden="true">×</span>','clear-'+key,'class="discover-chip active" aria-label="Remove '+esc(label)+'"')).join('')+(chips.length?action('Clear all','clear-all','class="text-button"'):'');
      const n=['cash','tracking','infrastructure'].filter(k=>f[k]!=='').length;el('discoveryFilterCount').textContent=n?String(n):'';
      host.querySelector('[data-discovery-action="generation"]').setAttribute('aria-pressed',String(f.generation));
      paintRange();
    }
    function paintRange(recalculate=false){
      if(!el('discoveryRange'))return;if(recalculate)rangeCeiling=S.sliderBounds(f).ceiling;
      const low=S.numeric(f.minMw),high=S.numeric(f.maxMw),a=Number.isFinite(low)?Math.min(low,rangeCeiling):0,b=Number.isFinite(high)?Math.min(high,rangeCeiling):rangeCeiling;
      const lo=el('discoveryMinRange'),hi=el('discoveryMaxRange');lo.max=hi.max=rangeCeiling;lo.value=a;hi.value=b;lo.style.zIndex=a>=rangeCeiling/2?'3':'1';hi.style.zIndex=a>=rangeCeiling/2?'1':'3';
      lo.setAttribute('aria-valuetext',low===null?'No minimum':a+' MW');hi.setAttribute('aria-valuetext',high===null?'No maximum':b+' MW');
      const lowRatio=a/rangeCeiling,highRatio=b/rangeCeiling,fill=el('discoveryRangeFill');fill.style.left='calc('+(lowRatio*100)+'% + '+(10-lowRatio*20)+'px)';fill.style.right='calc('+((1-highRatio)*100)+'% + '+(highRatio*20-10)+'px)';el('discoveryRangeEnd').textContent=rangeCeiling+' MW+';
      el('discoveryMwLabel').textContent=low===null&&high===null?'Any size':low!==null&&high!==null&&low===high?low+' MW':(low===null?'0':low)+' – '+(high===null?'no maximum':high+' MW');
    }
    function syncControls(){for(const [id,key]of Object.entries(fields))if(el(id))el(id).value=f[key];paintRange(true);filters();}
    const fields={discoverySearch:'query',discoveryLocation:'location',discoveryKind:'kind',discoverySupplyScope:'supplyScope',discoveryCountry:'country',discoverySort:'sort',discoveryCash:'cash',discoveryMinMw:'minMw',discoveryMaxMw:'maxMw',discoveryTracking:'tracking',discoveryInfrastructure:'infrastructure'};
    function places(){const values=S.suggestions(catalog,f.country),q=f.location;el('discoveryPlaces').innerHTML=values.filter(s=>S.matches(s,q)).slice(0,150).map(s=>'<option value="'+esc(s)+'"></option>').join('');}
    function draw(){
      const count=results.length;el('discoveryList').innerHTML=count?results.slice(0,limit).map(c=>{
        const role=c.supplyRole;
        const fitLabel=c.fit?{qualified_for_review:'Ready for independent review',needs_confirmation:'Needs confirmation',excluded:'Excluded for this brief'}[c.fit.status]:'';
        const terms=c.fit?'<span class="discover-cash">'+esc(c.fit.candidate.deliveredCentsKwh===null?'Delivered price unknown':c.fit.candidate.deliveredCentsKwh+'¢/kWh delivered')+'</span><span class="discover-mw">'+esc(c.fit.candidate.availableMw===null?'Allocation unknown':c.fit.candidate.availableMw+' MW offered')+'</span><span class="discover-scope">'+esc(c.fit.candidate.capitalUsd===null?'Client capital unknown':M.money(c.fit.candidate.capitalUsd)+' client capital')+'</span>':'<span class="discover-cash">'+esc(M.money(c.cash))+'</span><span class="discover-mw">'+esc(S.mw(c.kw)+' plan')+'</span><span class="discover-scope">'+(c.quotedBudget?'Scoped budget':c.budgetComplete?'Includes allowances':c.cash===null?'Needs sizing':'+ unpriced work')+'</span>';
        return '<button type="button" class="row discover-site" data-action="candidate" data-id="'+esc(c.id)+'" aria-controls="discoveryDetail" aria-expanded="false"><span class="row-copy"><strong>'+esc(c.name)+'</strong><span class="sub" title="'+esc([c.place,c.operator].filter(Boolean).join(' · '))+'">'+esc(c.place)+'</span><span class="discover-site-labels"><span class="source-badge source-'+esc(c.kind)+'">'+esc(c.familyLabel||energy[c.kind]||'Energy')+'</span>'+(role?'<span class="generation-badge" title="'+esc(role.reason)+'">'+esc(role.label)+'</span>':'')+(c.saved?'<span class="saved-badge">In pipeline</span>':c.generation?'<span class="generation-badge">Generation reported</span>':'')+'</span><span class="discover-operator">'+esc(c.operator||'Operator not recorded')+'</span>'+(c.fit?'<span class="sub">'+esc(fitLabel)+' · '+esc((c.fit.disqualifiers[0]||c.fit.missing[0]||c.fit.reasons[0]||'Inspect the evidence'))+'</span>':'')+'</span><span class="row-end">'+terms+'</span></button>';
      }).join(''):empty('No energy sites match.','Try another Energy site role, remove a source filter or choose a nearby location.')+action('Clear filters','clear-all','class="button discover-empty-clear"');
      el('discoveryMore').innerHTML=count>limit?action('Show '+Math.min(40,count-limit)+' more · '+Math.min(limit,count)+' of '+count.toLocaleString(),'more','class="button load-more"'):'';
      el('discoveryList').setAttribute('aria-busy','false');
      const points=results.filter(c=>S.coordinates(c)).map(c=>({id:c.id,lat:c.lat,lng:c.lng,kw:c.kw,markerColor:S.sourceColors[c.kind]||S.sourceColors.unknown,label:c.name,sourceLabel:(energy[c.kind]||'Energy site')+' · planned mine size',operator:c.operator}));
      globe?.setPoints(points);el('discoveryMapCount').textContent=points.length.toLocaleString()+' mapped'+(count>points.length?' · '+(count-points.length).toLocaleString()+' without coordinates':'');
      if(selected&&!results.some(c=>c.sourceRecords.includes(selected)))collapseDetail(false);paintSelection();
      return points;
    }
    async function search(){
      if(!host)return;const mine=++run,issue=S.validate(f);filters();el('discoveryError').textContent=issue;el('discoveryError').hidden=!issue;
      if(issue){results=[];draw();el('discoveryCount').textContent='Update the highlighted search limits.';return;}
      el('discoveryList').setAttribute('aria-busy','true');el('discoveryCount').textContent='Finding matching sites…';
      el('discoveryList').innerHTML='<div class="loading">Checking the current search criteria…</div>';el('discoveryMore').innerHTML='';
      try{
        await D.load();if(mine!==run||!host)return;catalog=ProspectStore.all();
        const countries=[...new Set(catalog.map(c=>c.iso3).filter(Boolean))].sort((a,b)=>S.countryName(a).localeCompare(S.countryName(b)));
        el('discoveryCountry').innerHTML=options(Object.assign({'':'All countries'},Object.fromEntries(countries.map(c=>[c,S.countryName(c,catalog.find(x=>x.iso3===c)?.country)]))),f.country);places();
        const savedBySource=new Map(),savedByIdentity=new Map(),index=(map,key,s)=>{const matches=map.get(key)||[];matches.push(s);map.set(key,matches);};D.sites().forEach(s=>{index(savedBySource,String(s.id),s);if(s.discovery)index(savedBySource,String(s.discovery.sourceRecordId),s);SiteIdentity.keys(s).forEach(key=>index(savedByIdentity,key,s));});
        const rows=[];const cash=S.numeric(f.cash);
        for(let i=0;i<catalog.length;i++){
          if(mine!==run||!host)return;const c=catalog[i],identity=SiteIdentity.sourceKeys(c)[0],matches=[...new Set([...(savedBySource.get(String(c.id))||[]),...(savedByIdentity.get(identity)||[])])],saved=SiteIdentity.savedForCandidate(matches,c);
          const match=E.candidate(c,saved);
          if(S.matchCandidate({...c,energyTypes:match.energyTypes},f,saved)){const x=D.summary(c,saved,cash);if(clientBrief||S.matchCash(x,f)&&S.matchCapacity(x,f)&&S.matchInfrastructure(x,f))rows.push({...x,lat:c.lat,lng:c.lng,potentialKw:c.powerPotentialKw,generation:S.energyRole(c).id!=='storage'&&Number.isFinite(c.existingGenerationKw)&&c.existingGenerationKw>0,place:S.location(c),saved:!!saved,identity,fit:clientBrief?E.assess(c,saved,clientBrief):null,supplyRole:S.energyRole(c),familyLabel:(match.energyTypes||[]).map(id=>energy[id]||id).join(' / ')});}
          if(i%400===399)await new Promise(r=>setTimeout(r,0));
        }
        if(mine!==run||!host)return;
        if(clientBrief){const ranked=E.matching.rank(rows.map(r=>r.fit.candidate),clientBrief),positions=new Map(),evaluations=new Map();ranked.forEach((r,i)=>{for(const id of [...(r.candidate.sourceRecordIds||[]),r.candidate.id]){positions.set(id,i);evaluations.set(id,r);}});for(const r of rows)if(evaluations.has(r.id))r.fit=evaluations.get(r.id);rows.sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity));}
        else rows.sort((a,b)=>M.compareDiscovery(a,b,f.sort));
        allResults=M.groupSources(rows,r=>r.identity);const excluded=allResults.filter(r=>r.fit?.status==='excluded').length;results=clientBrief&&!showExcluded?allResults.filter(r=>r.fit.status!=='excluded'):allResults;draw();
        el('discoveryCount').textContent=clientBrief?(allResults.length-excluded).toLocaleString()+' energy sites in this view need fit review · '+excluded.toLocaleString()+' excluded · '+catalog.length.toLocaleString()+' in catalog':results.length.toLocaleString()+' energy sites · '+rows.length.toLocaleString()+' source records · '+catalog.length.toLocaleString()+' in catalog';
        el('discoveryExcluded').innerHTML=clientBrief&&excluded?action(showExcluded?'Hide excluded sites':'Show excluded sites and reasons','toggle-excluded','class="text-button"'):'';
        const warning=D.status().catalogError;el('catalogWarning').innerHTML=warning?'<div class="banner">Some source data is unavailable: '+esc(warning)+'</div>':'';
        if(restorePending&&selected&&detailOpen){restorePending=false;onRestore?.(selected,detailSection);}
      }catch(e){if(mine!==run||!host)return;results=[];draw();el('discoveryCount').textContent='Catalog unavailable';el('discoveryList').innerHTML=empty('The catalog could not load.',e.message)+action('Try again','retry','class="button discover-empty-clear"');}
    }
    function choose(id,fromMap=false){
      if(id===selected&&detailOpen&&!fromMap){collapseDetail();return;}
      const opening=!detailOpen;selected=id;globe?.select(id,!fromMap);paintSelection();
      onSelect(id);el('discoveryDetailBody')?.focus({preventScroll:true});
      if(opening&&host){const layout=host.querySelector('.discover-layout');requestAnimationFrame(()=>{if(!host)return;const target=matchMedia('(min-width: 1050px)').matches?layout:el('discoveryDetail');target?.scrollIntoView({block:'nearest',behavior:'instant'});});}
    }
    function paintSelection(){if(!host)return;const selectedRow=results.find(c=>c.sourceRecords.includes(selected));host.querySelectorAll('.discover-site').forEach(r=>{const active=detailOpen&&r.dataset.id===selectedRow?.id;r.classList.toggle('selected',active);r.setAttribute('aria-expanded',String(active));});globe?.select(detailOpen?(selectedRow?.id||selected):'');}
    function showDetail(id,label,html,section){if(!host)return false;const changed=id!==detailRecord||section!==detailSection,scroll=el('discoveryDetailBody').scrollTop;selected=id;detailRecord=id;detailSection=section;detailOpen=true;detailHtml=html;detailLabel=label;host.dataset.expanded='true';el('discoveryDetail').hidden=false;el('discoveryDetailTitle').textContent=label;el('discoveryDetailBody').innerHTML=html;el('discoveryDetailBody').scrollTop=changed?0:scroll;host.querySelector('[data-discovery-action="collapse-detail"]').setAttribute('aria-expanded','true');paintSelection();viewMode();return true;}
    function collapseDetail(focus=true){const id=results.find(c=>c.sourceRecords.includes(selected))?.id;selected='';detailOpen=false;detailHtml='';restorePending=false;if(!host)return;host.dataset.expanded='false';el('discoveryDetail').hidden=true;el('discoveryDetailBody').innerHTML='';paintSelection();viewMode();if(focus){const row=[...host.querySelectorAll('.discover-site')].find(r=>r.dataset.id===id);row?.focus({preventScroll:true});}}
    function globeFailure(message){if(!host)return;el('globeStatus').hidden=false;el('globeStatus').innerHTML='<span>'+esc(message||'The globe is unavailable. You can still search every site in the list.')+'</span>'+action('Reload globe','retry-globe','class="text-button"');}
    async function loadGlobe(){
      const version=mountId,target=el('discoveryGlobe');if(!target)return;
      try{const module=await import(new URL('./discovery-globe.js',scriptBase).href);if(version!==mountId||!host)return;globe=module.mount(target,{onSelect:id=>choose(id,true),onError:globeFailure,view:globeView});el('globeStatus').hidden=true;if(el('discoveryList').getAttribute('aria-busy')==='false')draw();viewMode();}catch(e){if(version===mountId&&host)globeFailure();}
    }
    function viewMode(){if(!host)return;host.dataset.view=mode;host.querySelector('[data-discovery-action="view-sites"]').setAttribute('aria-pressed',String(mode==='sites'));host.querySelector('[data-discovery-action="view-globe"]').setAttribute('aria-pressed',String(mode==='globe'));globe?.setActive(detailOpen||!matchMedia('(max-width: 1049px)').matches||mode==='globe');paintRange();}
    function mount(){host=document.getElementById('discoverWorkspace');mountId++;aborter=new AbortController();const signal=aborter.signal;
      host.addEventListener('input',e=>{const range=['discoveryMinRange','discoveryMaxRange'].includes(e.target.id),key=fields[e.target.id];if(!range&&(!key||e.target.tagName==='SELECT'))return;if(range){f=S.moveSlider(f,e.target.id==='discoveryMinRange'?'min':'max',e.target.value,rangeCeiling);el('discoveryMinMw').value=f.minMw;el('discoveryMaxMw').value=f.maxMw;paintRange();}else{f[key]=e.target.value;if(['minMw','maxMw'].includes(key))paintRange(true);}limit=40;run++;el('discoveryList').setAttribute('aria-busy','true');el('discoveryCount').textContent='Finding matching sites…';clearTimeout(timer);timer=setTimeout(search,180);if(key==='location')places();},{signal});
      // A blur after typing must not replace the filter button between pointerdown and click.
      host.addEventListener('change',e=>{const key=fields[e.target.id];if(!key||f[key]===e.target.value)return;f[key]=e.target.value;limit=40;clearTimeout(timer);search();},{signal});
      host.addEventListener('click',e=>{const b=e.target.closest('[data-discovery-action]');if(!b){const site=e.target.closest('.discover-site');if(site){e.preventDefault();e.stopPropagation();choose(site.dataset.id);}return;}const id=b.dataset.discoveryAction;
        if(id==='collapse-detail'){collapseDetail();return;}
        if(id==='client-brief'){onBrief?.(clientBrief);return;}
        if(id==='toggle-excluded'){showExcluded=!showExcluded;search();return;}
        if(id==='clear-brief'){clientBrief=null;search();return;}
        if(id==='filters'){advanced=!advanced;el('discoveryAdvanced').hidden=!advanced;b.setAttribute('aria-expanded',String(advanced));return;}
        if(id==='more'){limit+=40;draw();return;}if(id==='fit'){globe?.fit();return;}if(id==='zoom-in'){globe?.zoom(.84);return;}if(id==='zoom-out'){globe?.zoom(1.19);return;}if(id==='reset-globe'){globe?.reset();return;}
        if(id==='retry-globe'){globe?.dispose();globe=null;loadGlobe();return;}
        if(id.startsWith('view-')){mode=id.slice(5);viewMode();return;}
        if(id==='generation')f.generation=!f.generation;else if(id==='clear-all'){f=S.filtersForBrief(defaults(),clientBrief);}else if(id.startsWith('clear-')){const key=id.slice(6);f[key]=key==='kind'?'all':key==='generation'?false:'';}
        limit=40;syncControls();clearTimeout(timer);search();
      },{signal});
      window.addEventListener('resize',viewMode,{signal});restorePending=detailOpen;el('discoveryDetailBody').scrollTop=detailScroll;filters();search();loadGlobe();
    }
    function unmount(){run++;mountId++;if(host)detailScroll=el('discoveryDetailBody').scrollTop;clearTimeout(timer);aborter?.abort();if(globe){globeView=globe.view();globe.dispose();globe=null;}host=null;}
    return {html,mount,unmount,showDetail,collapseDetail,selectedId:()=>detailOpen?selected:'',cashLimit:()=>S.validate(f)?null:S.numeric(f.cash),brief:()=>clientBrief,setBrief:value=>{clientBrief=value;f=S.filtersForBrief(f,value);showExcluded=false;if(host){syncControls();search();}}};
  }
  root.ProtonCrmDiscovery={create};
}(window));
