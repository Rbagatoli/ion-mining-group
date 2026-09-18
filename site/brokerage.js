/* Local-only brokerage brief preparation. No email, network send, or persistent storage. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.ProtonBrokerage=api;api.mount(document);}
}(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const RATE=3;
  function estimate(value){
    const raw=String(value).trim();
    if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw))return null;
    const total=Math.round(Number(raw)*100);
    if(!Number.isSafeInteger(total)||total<=0||total>10000000000)return null;
    const fee=Math.round(total*RATE/100);
    return {totalCents:total,feeCents:fee,netCents:total-fee};
  }
  function clean(value){return String(value||'').trim().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,1800);}
  function buildBrief(values){
    const buy=values.mode==='buy',quantity=String(values.quantity||'').trim();
    if(!clean(values.model)||!clean(values.location)||!/^\d{1,5}$/.test(quantity)||Number(quantity)<1)throw Error('Enter a model, a whole quantity of at least one, and a location.');
    const lines=[buy?'PROTON MINING — BUYER REQUIREMENTS':'PROTON MINING — ASIC SELLER BRIEF','PREPARED ONLY — NOT SUBMITTED','',
      'Company / name: '+(clean(values.company)||'Not provided'),
      (buy?'Requested model(s): ':'Model(s): ')+clean(values.model),
      'Exact variant / hashrate / cooling: '+(clean(values.variant)||'To confirm'),
      (buy?'Desired quantity: ':'Quantity: ')+quantity,
      (buy?'Delivery location: ':'Equipment location: ')+clean(values.location),
      (buy?'Required condition: ':'Reported condition: ')+clean(values.condition),
      (buy?'Budget and currency: ':'Asking price and currency: ')+(clean(values.price)||'Not provided'),
      (buy?'Required delivery deadline: ':'Availability / timing: ')+(clean(values.timing)||'To confirm'),
      '',(buy?'Requirements / questions:':'Test records, photos, ownership details and questions:'),clean(values.notes)||'Not provided','',
      'This brief is not an offer, an equipment verification, or a brokerage agreement.'];
    if(buy)lines.push('Buyer sourcing scope and any fee: not agreed. The seller commission does not apply automatically to this request. Potential lots, availability, authority to sell, prices and test evidence still need confirmation.');
    else lines.push('Proposed seller fee: 3% of the completed sale price; final scope and fees agreed before representation. Shipping, inspection and other agreed costs are separate.');
    return lines.join('\n');
  }
  function mount(doc){
    const form=doc.getElementById('brBriefForm');if(!form)return;
    const total=doc.getElementById('brSaleValue'),fee=doc.getElementById('brFee'),net=doc.getElementById('brNet'),error=doc.getElementById('brFeeError');
    const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
    function updateFee(){const result=estimate(total.value);fee.textContent=result?money(result.feeCents):'—';net.textContent=result?money(result.netCents):'—';error.textContent=result?'Illustration only. Seller proceeds shown before shipping, inspection, taxes and other agreed costs.':'Enter a sale price from $0.01 to $100,000,000, with no more than two decimal places.';total.setAttribute('aria-invalid',String(!result));}
    total.addEventListener('input',updateFee);updateFee();
    const output=doc.getElementById('brOutput'),panel=doc.getElementById('brOutputPanel'),status=doc.getElementById('brStatus');
    function values(){return Object.fromEntries(new FormData(form).entries());}
    function syncMode(){
      const buy=values().mode==='buy';
      doc.querySelectorAll('[data-sell-label]').forEach(el=>{el.textContent=el.getAttribute(buy?'data-buy-label':'data-sell-label');});
      doc.getElementById('brTiming').placeholder=buy?'Required delivery date or timeframe':'Available from / preferred completion';
      panel.hidden=true;output.value='';status.textContent='';
    }
    form.querySelectorAll('[name="mode"]').forEach(el=>el.addEventListener('change',syncMode));
    form.addEventListener('input',()=>{panel.hidden=true;output.value='';status.textContent='';});
    doc.querySelectorAll('[data-brief-mode]').forEach(link=>link.addEventListener('click',()=>{form.querySelector('[name="mode"][value="'+link.dataset.briefMode+'"]').checked=true;syncMode();}));
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!form.reportValidity())return;
      try{output.value=buildBrief(values());panel.hidden=false;status.textContent='Your brief is ready below. Nothing has been sent.';output.focus();}catch(e){status.textContent=e.message;}
    });
    doc.getElementById('brCopy').addEventListener('click',async()=>{
      if(!output.value)return;
      try{await navigator.clipboard.writeText(output.value);status.textContent='Brief copied. Nothing has been sent.';}catch(e){output.focus();output.select();status.textContent='Select and copy the brief below. Nothing has been sent.';}
    });
    doc.getElementById('brDownload').addEventListener('click',()=>{
      if(!output.value)return;
      const url=URL.createObjectURL(new Blob([output.value],{type:'text/plain;charset=utf-8'})),link=doc.createElement('a');
      link.href=url;link.download=values().mode==='buy'?'proton-asic-buyer-brief.txt':'proton-asic-seller-brief.txt';doc.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Brief downloaded. Nothing has been sent.';
    });
    doc.querySelectorAll('[data-br-js]').forEach(el=>{el.disabled=false;});syncMode();
  }
  return {estimate,buildBrief,mount};
}));
