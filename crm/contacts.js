/* Site-specific contact presentation. Public research never writes to saved deal terms. */
(function(root){
  'use strict';
  const P=root.ProspectPeople||(typeof require==='function'?require('../prospect-people'):null);
  const L=root.LandfillContacts||(typeof require==='function'?require('../landfill-contacts'):null);
  const R=root.DealRelationships||(typeof require==='function'?require('../deal-relationships'):null);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const link=(url,label)=>R.safeUrl(url)?'<a class="link" href="'+esc(R.safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':'';
  const fact=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(present(value)?value:'Not recorded')+'</dd></div>';
  const value=(v,unit)=>present(v)?v+unit:null;
  const action=(label,id,record)=>'<button class="button small" data-action="'+id+'" data-id="'+esc(record)+'">'+label+'</button>';
  function contacts(c,s,directory,research,crm,company){
    const savedNodes=R.state(s).nodes||[];
    // A saved correction or archived map entry takes precedence over its imported public version.
    const publicNodes=(research&&research.nodes||[]).filter(n=>!savedNodes.some(old=>old.id===n.id));
    const rows=P.contacts(c,s,directory,{nodes:publicNodes},crm);
    const nodes=savedNodes.concat(publicNodes).filter(n=>!n.archived);
    rows.forEach(p=>{
      const n=nodes.find(n=>n.name===p.name&&n.phone===p.phone&&n.email===p.email);
      if(n){p.roles=(n.roles||[]).map(key=>(R.ROLES.find(r=>r[0]===key)||[key,key])[1]);p.authority=n.authority_status;p.authorityScope=n.authority_scope;p.nextAction=n.next_action;}
      if(p.source==='Saved site terms')p.title=s.contact_role;
      if(p.source==='Site source record')p.title=(c.sourceDetail||{}).contactTitle;
    });
    if(company&&(company.phone||company.email||company.address))rows.push({name:company.name||company.operator||c.operator||'Operator office',organization:company.name||c.operator,phone:company.phone,email:company.email,address:company.address,source:company.contactRegistry||company.source||'Operator registry',sourceUrl:company.contactSourceUrl||company.sourceUrl,sourceDate:company.asOf||company.as_of,person:false,notes:'Company office / switchboard. Ask for the person responsible for energy development at this site.'});
    return rows;
  }
  function card(p){
    const phone=L.phoneHref(p.phone),email=L.emailHref(p.email);
    return '<article class="contact-card crm-person"><span class="crm-contact-kind">'+(p.person?'Named contact':'Office / organization')+'</span><h3>'+esc(p.name||p.organization||'Contact route')+'</h3><p>'+esc([p.title,p.organization!==p.name?p.organization:''].filter(Boolean).join(' · '))+'</p>'+
      (p.roles&&p.roles.length?'<p class="crm-contact-role">'+esc(p.roles.join(' · '))+'</p>':'')+
      '<div class="actions">'+(phone?'<a class="button small" href="'+esc(phone)+'">'+esc(p.phone)+'</a>':'')+(email?'<a class="button small" href="'+esc(email)+'">'+esc(p.email)+'</a>':'')+'</div>'+
      (!phone&&!email?'<p class="quiet-note">Direct phone / email not recorded.</p>':'')+
      (p.address?'<p class="quiet-note">Office: '+esc(p.address)+'</p>':'')+
      (p.nextAction?'<p class="quiet-note">Next: '+esc(p.nextAction)+'</p>':'')+
      '<details><summary>Source & role details</summary><p class="quiet-note">'+esc(p.source||'Saved contact')+' · '+esc(p.sourceDate||'Verification date not recorded')+' '+link(p.sourceUrl,'View source')+'</p>'+
      (p.notes?'<p class="note-text">'+esc(p.notes)+'</p>':'')+
      (p.authority?'<p class="quiet-note">'+esc((R.AUTHORITIES.find(a=>a[0]===p.authority)||['','Authority unconfirmed'])[1])+(p.authorityScope?' · '+esc(p.authorityScope):'')+'</p>':'')+'</details></article>';
  }
  function render(o){
    const c=o.candidate,s=o.saved,d=o.directory,r=o.research,all=contacts(c,s,d,r,o.crm||[],o.company);
    const people=all.filter(p=>p.person),offices=all.filter(p=>!p.person),sd=c.sourceDetail||{},gh=o.registry;
    let html='<div class="crm-contact-heading"><h3>People to contact</h3><span>'+people.length+' people · '+offices.length+' offices</span></div><p class="quiet-note">Published contacts and your saved people. Confirm their current role and authority over this site.</p>';
    if(o.loading)html+='<p class="quiet-note" role="status">Checking published contacts…</p>';
    if(o.warning)html+='<p class="quiet-note" role="status">Some public contact sources could not load. '+action('Retry contacts','retry-contacts',c.id)+'</p>';
    if(R.state(s).error)html+='<p class="quiet-note" role="alert">'+esc(R.state(s).error)+'</p>';
    if(r&&r.first_step)html+='<div class="next-action"><small>Suggested first contact</small><p>'+esc(r.first_step)+'</p></div>';
    html+=people.length?people.slice(0,3).map(card).join(''):'<p class="quiet-note">No named individual recorded yet. Use an office contact below to ask for the site manager or energy development lead.</p>';
    if(people.length>3)html+='<details class="crm-contact-more"><summary>More people ('+(people.length-3)+')</summary>'+people.slice(3).map(card).join('')+'</details>';
    if(offices.length)html+=people.length?'<details class="crm-contact-more"><summary>Office contacts & introduction routes ('+offices.length+')</summary>'+offices.map(card).join('')+'</details>':offices.map(card).join('');
    if(!all.length&&d&&d.nextAction)html+='<p class="quiet-note">'+esc(d.nextAction)+'</p>';
    const owner=gh&&gh.parent,operator=c.operator||sd.owner||s&&s.operator,address=gh&&gh.address?[gh.address,gh.address2,gh.city,gh.state,gh.zip].filter(Boolean).join(', '):null;
    if(owner||operator||address)html+='<details class="crm-contact-more"><summary>Owner, operator & site address</summary><dl class="fact-list">'+(owner?fact('Reported legal parent',owner):'')+(operator?fact('Reported operator / owner',operator):'')+(address?fact('Facility address',address):'')+'</dl><p class="quiet-note">A listed owner or operator does not establish gas rights or signing authority.</p></details>';
    if(o.routes&&o.routes.length)html+='<details class="crm-contact-more"'+(!all.length?' open':'')+'><summary>Find another contact</summary><p class="quiet-note">Search routes, not verified contact details.</p>'+o.routes.map(route=>'<p class="quiet-note">'+link(route.url,route.label)+'</p>').join('')+'</details>';
    return html;
  }
  function terms(s){
    if(!s)return '<details class="crm-terms"><summary>Deal terms <span>Not recorded</span></summary><p class="quiet-note">Save this site to your pipeline to record quotes, responsibilities and agreement evidence.</p></details>';
    const a=s.acquisition||{},status={unknown:'Not confirmed',available:'Written availability recorded',committed:'Already committed',disputed:'Disputed',unavailable:'Unavailable',encumbered:'Existing obligations'};
    const recorded=Object.keys(a).some(k=>present(a[k])&&typeof a[k]!=='object')||['quoted_rate','power_rate','generator_ownership','contract_term_years'].some(k=>present(s[k]));
    let html='<details class="crm-terms"><summary>Deal terms <span>'+(recorded?'View recorded terms':'Not recorded')+'</span></summary><p class="quiet-note">Recorded discussions and evidence; not an assumed offer or confirmed availability.</p><dl class="fact-list">'+
      fact('Energy rights holder',a.rights_owner)+fact('Decision-maker',a.decision_maker)+fact('Rights availability',status[a.rights_status]||a.rights_status)+fact('Delivered power quote',value(a.delivered_rate_usd_kwh,' USD/kWh'))+fact('Who pays for infrastructure & O&M',a.cost_responsibility);
    const extra=[['Land / surface owner',a.surface_owner],['Approval process',a.approval_process],['Owner motivation',a.owner_motivation],['Existing energy commitments',a.existing_offtake],['Commitments expire',a.offtake_expiry],['Recorded available power',value(a.available_kw,' kW')],['Contracted power',value(a.contracted_kw,' kW')],['Quote evidence',a.quote_evidence],['Quote checked',a.quote_verified_on],['Rights evidence',a.rights_evidence],['Rights checked',a.rights_verified_on],['Agreement reference',a.agreement_ref],['Signed',a.signed_on],['Term ends',a.term_end]];
    html+=extra.filter(row=>present(row[1])).map(row=>fact(...row)).join('')+'</dl>';
    const units={usd_kwh:'/kWh · all-in power',usd_gj:'/GJ · fuel only',usd_mcf:'/Mcf · fuel only',usd_mmbtu:'/MMBtu · fuel only'};
    const original=[['Original gas / power quote',present(s.quoted_rate)?s.quoted_rate+' '+(s.power_rate_currency||'Currency not recorded')+(units[s.quoted_rate_units]||' · units not recorded'):null],['Stored model power rate',present(s.power_rate)?s.power_rate+' '+(s.power_rate_currency||'Currency not recorded')+'/kWh · '+(s.power_rate_basis==='delivered_power'?'delivered power':s.power_rate_basis==='fuel_only'?'fuel only':'basis not recorded'):null],['Generator owner',{client:'Proton',producer:'Energy producer',operator:'Third-party operator'}[s.generator_ownership]],['Contract length',value(s.contract_term_years,' years')],['Take-or-pay',value(s.take_or_pay_pct,'%')],['Fixed O&M',value(s.om_hourly_rate,' USD/hour')]].filter(row=>present(row[1]));
    if(original.length)html+='<p class="group-label">Terms from the Proton app</p><dl class="fact-list">'+original.map(row=>fact(...row)).join('')+'</dl>';
    return html+'<div class="actions">'+action('Edit terms & closing evidence','qualification',s.id)+'</div></details>';
  }
  const api={contacts,render,terms};root.ProtonCrmContacts=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
