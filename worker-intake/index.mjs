// Private site-sourcing receipt queue. No provider, email, or agent is invoked.
// Reuse the portal's signature verifier; stricter claim guards below fail closed
// for missing/nonnumeric expiry, unsupported algorithm, and unapproved owners.
import '../worker-portal/identity.js';

const SERVICES = ['custom_search', 'site_review', 'site_submission'];
const ROUTE = 'energy@protonminingco.com';
const MAX_BODY = 24576;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^REQ-[0-9a-f-]{36}$/i;
const REF_ID = /^[A-Za-z0-9_-]{1,120}$/;
const SITE_ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP'.split(' '));
export const SOURCE_TYPES = ['landfill_gas','flare_gas','hydro','nuclear','wind','solar','geothermal','natural_gas','biomass_biogas','coal','oil','industrial_surplus','grid_supply','waste_to_energy','marine','recovered_energy','hybrid','storage','unknown','other'];
const encoder = new TextEncoder();

class IntakeError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new IntakeError(status, code, message); };
const invalid = message => fail(422, 'invalid_request', message);
function object(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v)) invalid(`${label} must be an object.`); return v; }
function keys(v, allowed, label) { for (const k of Object.keys(v)) if (!allowed.includes(k)) invalid(`Unsupported ${label} field.`); }
function text(v, max, label, required = false) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) invalid(`Invalid ${label}.`);
  v = v.trim(); if (required && !v) invalid(`${label} is required.`); return v;
}
function number(v, max, label, min = 0) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) invalid(`Invalid ${label}.`); return v;
}
function array(v, label, limit = 30) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > limit) invalid(`Invalid ${label}.`);
  return [...new Set(v.map(x => text(x, 160, label, true)))];
}
function choice(v, allowed, label, fallback = '') {
  if (v === undefined || v === null || v === '') return fallback;
  if (!allowed.includes(v)) invalid(`Invalid ${label}.`); return v;
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function rateKey(secret, ip, hour) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'ip:' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(hour + ':' + ip)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
function attribution(raw = {}) {
  object(raw, 'Attribution'); keys(raw, ['source','medium','campaign','referrer','landingPath'], 'attribution');
  const out = {};
  for (const k of ['source','medium','campaign']) out[k] = text(raw[k], k==='campaign'?180:120, k);
  const ref = text(raw.referrer, 2000, 'referrer');
  if (ref) {
    let u; try { u = new URL(ref.includes('://')?ref:'https://'+ref); } catch { invalid('Invalid referrer.'); }
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password) invalid('Invalid referrer.');
    out.referrer = (u.origin + u.pathname).slice(0, 600);
  } else out.referrer = '';
  const path = text(raw.landingPath, 2000, 'landing path').split(/[?#]/)[0];
  if (path && (!path.startsWith('/') || path.startsWith('//'))) invalid('Invalid landing path.');
  out.landingPath = path.slice(0, 300);
  return out;
}

export function validateSubmission(raw) {
  object(raw, 'Request'); keys(raw, ['service','contact','brief','attribution','consent','website'], 'request');
  if (raw.consent !== true || (raw.website !== undefined && raw.website !== '')) invalid('Please confirm the request details.');
  const service = choice(raw.service, SERVICES, 'service'); if (!service) invalid('Select a service.');
  const c = object(raw.contact, 'Contact'); keys(c, ['name','email','phone','company'], 'contact');
  const contact = { name:text(c.name,160,'name',true), email:text(c.email,254,'email',true).toLowerCase(), phone:text(c.phone,80,'phone'), company:text(c.company,180,'company') };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || /[\r\n]/.test(contact.email)) invalid('Enter a valid email.');
  const b = object(raw.brief, 'Brief');
  keys(b, ['power','country','geography','transaction','upfrontBudget','timing','costBasis','existingOpportunities','siteDetails','acquisitionSource','sourceTypes','notes','states','excludedStates','excludedSources','minMw','maxMw','maxDeliveredCentsKwh','maxEnergyCentsKwh','maxSiteCapitalUsd','supply','operation','connectionReadiness','minUptimePct','minTermMonths','startBy','additionalRequirements','knownSiteExclusions','targetSiteIds','capitalPayer','authority','introductionTerms','powerCostCents','operatingFlexibility','minimumAvailabilityPct','supplyArrangement','capitalResponsibility','infrastructurePreference','exclusions'], 'brief');
  if (b.country !== 'US') invalid('Public site sourcing currently covers the United States.');
  const p = object(b.power || { value:null,unit:'MW' }, 'Power'); keys(p,['value','unit'],'power');
  const power = { value:number(p.value,100000000,'power'),unit:choice(p.unit,['kW','MW'],'power unit','MW') };
  if (power.value !== null && (power.value <= 0 || (power.unit === 'MW' && power.value > 100000))) invalid('Enter a positive usable power requirement.');
  const budget = object(b.upfrontBudget || (b.maxSiteCapitalUsd!=null?{amount:b.maxSiteCapitalUsd,currency:'USD'}:{}), 'Budget'); keys(budget,['amount','currency'],'budget');
  const brief = { country:'US',power,upfrontBudget:{amount:number(budget.amount,1e12,'budget'),currency:choice(budget.currency,['USD','CAD','unknown'],'currency','unknown')} };
  for (const k of ['geography','transaction','timing','costBasis','acquisitionSource','capitalPayer','authority','operatingFlexibility','supplyArrangement','capitalResponsibility','infrastructurePreference']) {
    brief[k]=text(b[k],k==='capitalPayer'?400:600,k);if(brief[k]==='Not specified')brief[k]='unknown';
  }
  for (const k of ['existingOpportunities','siteDetails','notes','additionalRequirements','introductionTerms','exclusions']) brief[k]=text(b[k],3000,k);
  if (!brief.geography) invalid('Enter the search region or site location.');
  if (service !== 'custom_search' && !brief.siteDetails && !brief.existingOpportunities) invalid('Identify the site to review or submit.');
  for (const k of ['sourceTypes','states','excludedStates','excludedSources','knownSiteExclusions','targetSiteIds']) brief[k] = array(b[k],k);
  const sourceAliases={petroleum:'oil',biomass:'biomass_biogas',biogas:'biomass_biogas'};
  for(const k of ['sourceTypes','excludedSources'])brief[k]=[...new Set(brief[k].map(s=>sourceAliases[s]||s))];
  for (const k of ['states','excludedStates']) if (brief[k].some(s=>!STATES.has(s))) invalid('Use US state abbreviations.');
  for (const k of ['knownSiteExclusions','targetSiteIds']) if (brief[k].some(s=>!SITE_ID.test(s))) invalid('Invalid site reference.');
  for (const k of ['sourceTypes','excludedSources']) if (brief[k].some(s=>!SOURCE_TYPES.includes(s))) invalid('Unknown energy source family.');
  if(brief.sourceTypes.some(s=>brief.excludedSources.includes(s))||brief.states.some(s=>brief.excludedStates.includes(s))) invalid('A selected source or state cannot also be excluded.');
  for (const [k,max] of Object.entries({minMw:100000,maxMw:100000,maxDeliveredCentsKwh:1000,maxEnergyCentsKwh:1000,maxSiteCapitalUsd:1e12,minUptimePct:100,minTermMonths:1200,powerCostCents:1000,minimumAvailabilityPct:100})) if (b[k] !== undefined) brief[k] = number(b[k],max,k);
  if (brief.minMw !== null && brief.maxMw != null && brief.minMw > brief.maxMw) invalid('Maximum power is below minimum power.');
  if(brief.minMw===0||brief.maxMw===0||brief.minTermMonths===0)invalid('Power and minimum term must be positive when supplied.');
  const converted=power.value===null?null:power.value/(power.unit==='kW'?1000:1);
  if(converted!==null&&brief.minMw!=null&&Math.abs(converted-brief.minMw)>1e-10)invalid('Usable power and minimum MW disagree.');
  if(converted!==null&&brief.maxMw!=null&&converted>brief.maxMw)invalid('Maximum power is below usable power.');
  for (const [k,opts] of Object.entries({supply:['either','electricity','fuel'],operation:['flexible','continuous','interruptible','seasonal'],connectionReadiness:['any','existing','new_build_allowed']})) if (b[k] !== undefined) brief[k] = choice(['unknown','Not specified'].includes(b[k])?null:b[k],opts,k,null);
  if (b.startBy !== undefined) { brief.startBy = text(b.startBy,10,'start date') || null; if (brief.startBy && (!/^\d{4}-\d{2}-\d{2}$/.test(brief.startBy) || !Number.isFinite(Date.parse(brief.startBy)) || new Date(brief.startBy).toISOString().slice(0,10)!==brief.startBy)) invalid('Invalid start date.'); }
  return {service,contact,brief,attribution:attribution(raw.attribution),consent:true};
}

function config(env) {
  const uids=String(env.OWNER_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const emails=String(env.OWNER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!env.INTAKE_DB?.prepare || env.FIREBASE_PROJECT_ID !== 'ion-mining' || env.ROUTE_EMAIL !== ROUTE || (!uids.length && !emails.length) || String(env.RATE_LIMIT_SECRET||'').length<32) fail(503,'unavailable','Private intake is not configured. Please email energy@protonminingco.com.');
  if (uids.some(x=>x.length>128 || /\s/.test(x)) || emails.some(x=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) fail(503,'unavailable','Private intake is not configured.');
  return {uids,emails};
}
function allowedOrigin(origin, env) {
  if (!origin) return false;
  const allowed=String(env.ALLOWED_ORIGINS||'https://protonminingco.com,https://www.protonminingco.com').split(',').map(x=>x.trim());
  // Local origins must be explicitly enabled in an isolated development config.
  return allowed.includes(origin) && (origin.startsWith('https://') || (env.ALLOW_LOCAL_ORIGINS === 'true' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)));
}
function response(data, status=200, origin='') {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key','Access-Control-Max-Age':'600'});
  return new Response(status===204?null:JSON.stringify(data),{status,headers});
}
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')) fail(415,'content_type','Use JSON for this request.');
  if (Number(request.headers.get('Content-Length')||0)>MAX_BODY) fail(413,'payload_too_large','Request is too large.');
  const reader=request.body?.getReader(); if(!reader) invalid('Request body is required.');
  const chunks=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();fail(413,'payload_too_large','Request is too large.');}chunks.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'invalid_json','Request body must be valid JSON.');}
}
function claimPart(part) { return JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'='))); }
async function owner(request,env,cfg) {
  try {
    const token=(request.headers.get('Authorization')||'').match(/^Bearer (\S+)$/)?.[1];
    if(!token || token.length>12000) throw new Error();
    const parts=token.split('.');if(parts.length!==3)throw new Error();
    const h=claimPart(parts[0]),p=claimPart(parts[1]),now=Math.floor(Date.now()/1000);
    if(h.alg!=='RS256'||typeof h.kid!=='string'||!Number.isSafeInteger(p.exp)||p.exp<=now||!Number.isSafeInteger(p.iat)||p.iat>now+300||p.iat<0||typeof p.sub!=='string'||!p.sub||p.sub.length>128)throw new Error();
    const claims=await globalThis.PortalIdentity.verifyIdToken(token,env.FIREBASE_PROJECT_ID,Date.now());
    if(!cfg.uids.includes(claims.sub) && !(claims.email_verified===true && typeof claims.email==='string' && cfg.emails.includes(claims.email.toLowerCase())))throw new Error();
    return claims.sub;
  } catch { fail(401,'unauthorized','Owner sign-in is required.'); }
}
async function schema(env){
  const row=await env.INTAKE_DB.prepare('SELECT version FROM intake_schema WHERE version = 1').first();if(!row)throw new Error('schema');
  await env.INTAKE_DB.prepare('SELECT (SELECT count(*) FROM requests WHERE 0) AS requests, (SELECT count(*) FROM request_actions WHERE 0) AS actions, (SELECT count(*) FROM intake_rates WHERE 0) AS rates').first();
}
function stmt(env,sql,args=[]){return env.INTAKE_DB.prepare(sql).bind(...args);}
function checkBatch(results){if(results.some(r=>r.success===false))throw new Error('storage');return results;}

async function receive(request,env,origin){
  const key=request.headers.get('Idempotency-Key')||'';if(!UUID.test(key))fail(400,'idempotency_required','Use a unique request identity and retain it when retrying.');
  const payload=validateSubmission(await readJson(request));
  const ip=request.headers.get('CF-Connecting-IP');if(!ip && env.ALLOW_LOCAL_ORIGINS!=='true')fail(503,'unavailable','Private intake is temporarily unavailable.');
  const now=Date.now(),at=new Date(now).toISOString(),hour=Math.floor(now/3600000),day=Math.floor(now/86400000);
  const [idem,hash,bucket]=await Promise.all([digest(key.toLowerCase()),digest(canonical(payload)),rateKey(env.RATE_LIMIT_SECRET,ip||'local',hour)]);
  const globalBucket='global:'+day,id='REQ-'+crypto.randomUUID(),db=env.INTAKE_DB;
  const rateSql='INSERT INTO intake_rates(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1';
  // D1 batch is one transaction. Unique idempotency index resolves concurrent
  // retries; rate increments, receipt and its durable identity commit together.
  const results=checkBatch(await db.batch([
    stmt(env,rateSql,[bucket,(hour+2)*3600000]),stmt(env,rateSql,[globalBucket,(day+2)*86400000]),
    stmt(env,`INSERT INTO requests(id,idempotency_hash,payload_hash,payload_json,service,route_email,received_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count FROM intake_rates WHERE bucket=?)<=15 AND (SELECT count FROM intake_rates WHERE bucket=?)<=300
      ON CONFLICT(idempotency_hash) DO NOTHING`,[id,idem,hash,JSON.stringify(payload),payload.service,ROUTE,at,at,bucket,globalBucket]),
    stmt(env,'SELECT id,payload_hash,received_at FROM requests WHERE idempotency_hash=?',[idem]),
    stmt(env,'SELECT count,bucket FROM intake_rates WHERE bucket IN (?,?)',[bucket,globalBucket])
  ]));
  const row=results[3].results?.[0];
  if(!row)fail(429,'rate_limited','Too many requests. Keep your request identity and try again later, or email energy@protonminingco.com.');
  if(row.payload_hash!==hash)fail(409,'idempotency_conflict','This request identity already received different details. Start a new request to change them.');
  const duplicate=row.id!==id;
  return response({received:true,requestId:row.id,receivedAt:row.received_at,status:'received',duplicate,receipt:'private_queue',notification:'not_configured'},duplicate?200:201,origin);
}
async function record(env,row) {
  const events=await stmt(env,'SELECT event_json FROM request_actions WHERE request_id=? ORDER BY revision',[row.id]).all();
  return {id:row.id,service:row.service,briefRevision:1,revision:row.revision,status:row.status,queue:JSON.parse(row.queue_json),receivedAt:row.received_at,updatedAt:row.updated_at,routeEmail:row.route_email,notification:{status:row.notification_state},payload:JSON.parse(row.payload_json),history:(events.results||[]).map(e=>JSON.parse(e.event_json))};
}
async function getRequest(env,id){const row=await stmt(env,'SELECT * FROM requests WHERE id=?',[id]).first();if(!row)fail(404,'not_found','Request not found.');return row;}
function actionInput(raw){
  object(raw,'Action'); keys(raw,['actionId','expectedRevision','type','note','taskId','briefId','acknowledgedBy','acknowledgedAt','evidence'],'action');
  if(!UUID.test(raw.actionId||''))invalid('Action identity is required.');
  if(!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<1)invalid('Expected revision is required.');
  const type=choice(raw.type,['qualify','reject','queue','acknowledge'],'action');if(!type)invalid('Select an action.');
  const p={actionId:raw.actionId.toLowerCase(),expectedRevision:raw.expectedRevision,type,note:text(raw.note,1600,'decision note',true)};
  if(type==='queue'||type==='acknowledge'){p.taskId=text(raw.taskId,120,'task reference',true);if(!REF_ID.test(p.taskId))invalid('Invalid task reference.');}
  if(type==='queue'){p.briefId=text(raw.briefId,120,'brief reference',true);if(!REF_ID.test(p.briefId))invalid('Invalid brief reference.');}
  if(type==='acknowledge'){
    p.acknowledgedBy=text(raw.acknowledgedBy,180,'acknowledging actor',true);p.evidence=text(raw.evidence,2000,'acknowledgment evidence',true);
    p.acknowledgedAt=text(raw.acknowledgedAt,40,'acknowledgment time',true);
    if(!/^\d{4}-\d{2}-\d{2}T/.test(p.acknowledgedAt)||!Number.isFinite(Date.parse(p.acknowledgedAt))||Date.parse(p.acknowledgedAt)>Date.now()+60000)invalid('Invalid acknowledgment time.');
  }
  return p;
}
async function act(request,env,id,actor,origin){
  const p=actionInput(await readJson(request)),hash=await digest(canonical({id,...p}));
  const prior=await stmt(env,'SELECT * FROM request_actions WHERE action_id=?',[p.actionId]).first();
  if(prior){if(prior.request_id!==id||prior.payload_hash!==hash)fail(409,'action_conflict','This action identity has different details.');return response({request:await record(env,await getRequest(env,id)),duplicate:true},200,origin);}
  const row=await getRequest(env,id);if(row.revision!==p.expectedRevision)fail(409,'revision_conflict','This request changed. Keep your draft and reload the request before deciding.');
  let status=row.status,queue=JSON.parse(row.queue_json);
  if(p.type==='qualify'||p.type==='reject'){
    if(row.status!=='received'||queue.state!=='not_queued')fail(409,'invalid_state','This request already has a qualification decision.');
    const brief=JSON.parse(row.payload_json).brief;
    if(p.type==='qualify'&&row.service==='custom_search'&&!(brief.power?.value>0)&&!(brief.minMw>0))fail(409,'needs_clarification','Confirm usable power in a new brief before qualifying a custom search.');
    status=p.type==='qualify'?'qualified':'rejected';
  } else if(p.type==='queue'){
    if(row.service==='site_submission')fail(409,'supply_intake','Site submissions belong in the supply review flow, not a client search task.');
    if(status!=='qualified'||queue.state!=='not_queued')fail(409,'invalid_state','Only a qualified, unqueued request can link a research draft.');
    if(p.briefId!==id)fail(409,'brief_mismatch','The research draft must refer to this exact received brief.');
    const brief=JSON.parse(row.payload_json).brief;
    if(row.service==='custom_search'&&!(brief.power?.value>0)&&!(brief.minMw>0))fail(409,'needs_clarification','Confirm usable power in a new brief before creating a custom-search assignment.');
    queue={state:'draft_saved',taskId:p.taskId,briefId:p.briefId,taskOwnerUid:actor};
  } else {
    if(queue.state!=='draft_saved'||p.taskId!==queue.taskId)fail(409,'invalid_state','A matching saved draft is required before acknowledgment.');
    if(queue.taskOwnerUid!==actor)fail(409,'owner_mismatch','Acknowledge from the owner account that saved this draft.');
    if(Date.parse(p.acknowledgedAt)<Date.parse(row.received_at))invalid('Acknowledgment cannot precede receipt.');
    queue={...queue,state:'acknowledged',acknowledgedBy:p.acknowledgedBy,acknowledgedAt:p.acknowledgedAt,evidence:p.evidence};
  }
  const at=new Date().toISOString(),event={...p,recordedByUid:actor,at,revision:row.revision+1};
  const results=checkBatch(await env.INTAKE_DB.batch([
    stmt(env,'UPDATE requests SET status=?,queue_json=?,revision=revision+1,updated_at=?,last_action_id=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM request_actions WHERE action_id=?)',[status,JSON.stringify(queue),at,p.actionId,id,p.expectedRevision,p.actionId]),
    stmt(env,`INSERT INTO request_actions(action_id,request_id,payload_hash,revision,event_json,at)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM requests WHERE id=? AND revision=? AND last_action_id=?)
      ON CONFLICT(action_id) DO NOTHING`,[p.actionId,id,hash,event.revision,JSON.stringify(event),at,id,event.revision,p.actionId]),
    stmt(env,'SELECT * FROM request_actions WHERE action_id=?',[p.actionId]),stmt(env,'SELECT * FROM requests WHERE id=?',[id])
  ]));
  const saved=results[2].results?.[0];
  if(!saved)fail(409,'revision_conflict','This request changed. Your action was not applied.');
  if(saved.request_id!==id||saved.payload_hash!==hash)fail(409,'action_conflict','This action identity has different details.');
  return response({request:await record(env,results[3].results[0]),duplicate:results[0].meta?.changes===0},200,origin);
}
async function metrics(env){
  const totals=await env.INTAKE_DB.prepare(`SELECT count(*) AS receivedTotal,
    COALESCE(sum(status='qualified'),0) AS qualifiedTotal,COALESCE(sum(status='rejected'),0) AS rejectedTotal,
    COALESCE(sum(json_extract(queue_json,'$.state')='draft_saved'),0) AS queueDrafts,
    COALESCE(sum(json_extract(queue_json,'$.state')='acknowledged'),0) AS acknowledged FROM requests`).first();
  const rows=(await env.INTAKE_DB.prepare(`SELECT service,count(*) AS received,sum(status='qualified') AS qualified,sum(status='rejected') AS rejected FROM requests GROUP BY service`).all()).results||[];
  const byService=Object.fromEntries(SERVICES.map(s=>[s,{received:0,qualified:0,rejected:0}]));
  for(const r of rows)byService[r.service]={received:r.received,qualified:r.qualified,rejected:r.rejected};
  const bySource=(await env.INTAKE_DB.prepare(`SELECT COALESCE(NULLIF(json_extract(payload_json,'$.attribution.source'),''),'direct / unknown') AS source,
    count(*) AS received,sum(status='qualified') AS qualified FROM requests GROUP BY source ORDER BY received DESC LIMIT 100`).all()).results||[];
  return {...totals,byService,bySource};
}

export default {
  async fetch(request,env){
    let origin='';
    try{
      const requestedOrigin=request.headers.get('Origin'),url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
      if(requestedOrigin&&!allowedOrigin(requestedOrigin,env))fail(403,'origin_denied','This origin is not allowed.');
      origin=requestedOrigin||'';
      if(request.method==='OPTIONS')return response(null,204,origin);
      const cfg=config(env);await schema(env);
      if(path==='/v1/health'&&request.method==='GET')return response({ready:true,service:'proton-site-intake',receipt:'private_queue',notification:'not_configured'},200,origin);
      if(path==='/v1/requests'&&request.method==='POST'){
        if(!origin)fail(403,'origin_denied','Use the published request form.');
        return await receive(request,env,origin);
      }
      const actor=await owner(request,env,cfg);
      if(path==='/v1/metrics'&&request.method==='GET')return response(await metrics(env),200,origin);
      if(path==='/v1/requests'&&request.method==='GET'){
        const status=url.searchParams.get('status')||'',cursor=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit')||30);
        if((status&&!['received','qualified','rejected'].includes(status))||!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>50)invalid('Invalid queue filter.');
        const args=[cursor],filter=status?' AND status=?':'';if(status)args.push(status);args.push(limit+1);
        const rows=(await stmt(env,'SELECT * FROM requests WHERE seq>?'+filter+' ORDER BY seq LIMIT ?',args).all()).results||[];
        const page=rows.slice(0,limit),records=[];for(const row of page)records.push(await record(env,row));
        return response({requests:records,nextCursor:rows.length>limit?String(page.at(-1).seq):null},200,origin);
      }
      const m=path.match(/^\/v1\/requests\/(REQ-[0-9a-f-]{36})(\/actions)?$/i);
      if(m&&REQUEST_ID.test(m[1])){
        if(request.method==='GET'&&!m[2])return response({request:await record(env,await getRequest(env,m[1]))},200,origin);
        if(request.method==='POST'&&m[2])return await act(request,env,m[1],actor,origin);
      }
      return response({error:{code:'not_found',message:'Endpoint not found.'}},404,origin);
    }catch(error){
      // No customer payload/token/database errors in logs or public responses.
      return response({...new URL(request.url).pathname.startsWith('/v1/health')?{ready:false}:{},error:{code:error instanceof IntakeError?error.code:'unavailable',message:error instanceof IntakeError?error.message:'Private intake is temporarily unavailable. Keep your request identity and retry, or email energy@protonminingco.com.'}},error instanceof IntakeError?error.status:503,origin);
    }
  },
  async scheduled(_event,env){config(env);await env.INTAKE_DB.prepare('DELETE FROM intake_rates WHERE expires_at<?').bind(Date.now()).run();}
};
