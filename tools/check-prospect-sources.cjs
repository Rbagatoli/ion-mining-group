/* Read explicitly exported public source URLs; retain local originals and importable checks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),dns=require('node:dns/promises'),net=require('node:net'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),MAX_BYTES=2*1024*1024;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function publicAddress(address){
 if(net.isIP(address)===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:db8:/i.test(address);
 if(net.isIP(address)!==4)return false;
 const p=address.split('.').map(Number),a=p[0],b=p[1];
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===192&&[0,2].includes(b)||a===203&&b===0);
}
function publicUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hostname.includes('%')||u.hostname==='localhost'||u.hostname.endsWith('.local'))throw Error('Automated checks require a public HTTPS URL without credentials or a custom port.');return u;}
async function fetchPublic(value,redirects=0){
 const u=publicUrl(value);if(redirects>4)throw Error('Too many redirects; check the original manually.');
 const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('This source resolves to a private, local or reserved address.');
 const selected=addresses[0];
 return new Promise((resolve,reject)=>{
  const req=https.get(u,{headers:{'User-Agent':'ProtonSourceCheck/1.0 (operator-requested document check)','Accept-Encoding':'identity'},lookup:(_host,opts,callback)=>opts.all?callback(null,[selected]):callback(null,selected.address,selected.family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!res.headers.location){reject(Error('Redirect has no destination.'));return;}fetchPublic(new URL(res.headers.location,u).href,redirects+1).then(resolve,reject);return;}
   if(res.statusCode!==200){res.resume();reject(Error('HTTP '+res.statusCode+'; the source was not checked.'));return;}
   if(res.headers['content-encoding']&&!/^identity$/i.test(res.headers['content-encoding'])){res.resume();reject(Error('Compressed response requires manual review.'));return;}
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){req.destroy(Error('Source exceeds 2 MB; retain it manually.'));return;}chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({bytes:Buffer.concat(chunks),contentType:String(res.headers['content-type']||''),finalUrl:u.href}));
  });const timer=setTimeout(()=>req.destroy(Error('The source timed out; retry or check manually.')),15000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);
 });
}
function extract(bytes,contentType){
 if(!/^(text\/|application\/(?:json|(?:\w+\+)?xml))/i.test(contentType))return {text:'',note:'File fingerprint retained. Open the original file and capture the relevant text manually.'};
 let text=bytes.toString('utf8');
 if(/html/i.test(contentType))text=text.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(?:\/p|\/div|\/li|\/h[1-6]|br|\/tr)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s]));
 text=text.replace(/\r\n/g,'\n').split('\n').map(x=>x.replace(/[\t ]+/g,' ').trim()).filter(Boolean).join('\n');
 return {text:text.slice(0,10000),note:'Public source fingerprint checked; '+(text.length>10000?'first 10,000 extracted characters retained. The complete original is in the local archive.':'extracted text retained.')+' Page changes can include navigation or formatting. Site applicability and publication date require review.'};
}
function validateJob(job){if(!job||job.v!==1||job.type!=='proton-evidence-watchlist'||!Array.isArray(job.sources)||!job.sources.length||job.sources.length>30)throw Error('Export 1–30 active source watches. Filter to one prospect for larger worklists.');const ids=new Set();for(const s of job.sources){if(!s||typeof s.site_id!=='string'||!s.site_id||typeof s.watch_id!=='string'||!/^watch_[1-9]\d*$/.test(s.watch_id)||typeof s.url!=='string'||s.url.length>2000||s.previous_digest&&!/^[a-f0-9]{64}$/.test(s.previous_digest))throw Error('The exported source watch format is invalid.');const key=s.site_id+'|'+s.watch_id;if(ids.has(key))throw Error('The watchlist contains a duplicate source watch.');ids.add(key);}return job;}
async function runChecks(job,{fetcher=fetchPublic,archive,now=new Date(),progress=()=>{}}={}){
 validateJob(job);const checked_on=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),results=[];
 for(const [i,s]of job.sources.entries()){
  progress('Checking '+(i+1)+' of '+job.sources.length+': '+s.url);
  const r={site_id:s.site_id,watch_id:s.watch_id,url:s.url,previous_digest:s.previous_digest||'',checked_on,outcome:'unavailable',note:'',digest:'',text:''};
  try{publicUrl(s.url);const response=await fetcher(s.url);if(!Buffer.isBuffer(response.bytes)||response.bytes.length>MAX_BYTES)throw Error('Invalid or oversized source response.');publicUrl(response.finalUrl||s.url);r.digest=hash(response.bytes);r.final_url=response.finalUrl||s.url;r.outcome=r.digest===r.previous_digest?'unchanged':'changed';Object.assign(r,extract(response.bytes,response.contentType));r.content_type=response.contentType;
   if(r.outcome==='changed'){if(typeof archive!=='function')throw Error('No local archive was provided; original bytes have not been retained.');r.archive_ref=await archive(response.bytes,r.digest,/pdf/i.test(response.contentType)?'.pdf':/html/i.test(response.contentType)?'.html':/text\/|json|xml/i.test(response.contentType)?'.txt':'.bin');}
  }catch(e){r.outcome='unavailable';r.note=e.message;r.digest='';r.text='';delete r.archive_ref;}
  r.check_id=hash([now.toISOString(),s.site_id,s.watch_id,s.url,r.digest,r.outcome].join('\n'));results.push(r);
 }
 return {v:1,type:'proton-evidence-checks',checked_at:now.toISOString(),results};
}
function latestDownload(){const dir=path.join(process.env.USERPROFILE||'','Downloads'),files=fs.readdirSync(dir).filter(f=>/^proton-evidence-watchlist(?: \(\d+\))?\.json$/i.test(f)).map(f=>({path:path.join(dir,f),modified:fs.statSync(path.join(dir,f)).mtimeMs})).sort((a,b)=>b.modified-a.modified);if(!files.length)throw Error('Export source checks from Prospecting → Evidence first. If downloads use another folder, drag that JSON file onto Check-Prospect-Sources.cmd.');return files[0].path;}
async function main(){
 const args=process.argv.slice(2);if(!(args.length===1&&args[0]==='--latest-download'||args.length===2&&args[0]==='--input'))throw Error('Use --input <exported-watchlist.json> or --latest-download.');
 const input=path.resolve(args[0]==='--input'?args[1]:latestDownload());if(fs.statSync(input).size>250000)throw Error('The watchlist is too large. Export fewer sources.');const job=validateJob(JSON.parse(fs.readFileSync(input,'utf8'))),now=new Date();
 const folder=path.join(root,'reports/evidence-monitor-runs',now.toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(folder,{recursive:true});
 console.log('Using exported watchlist: '+input+'\nPublic sources only. Original files stay in this local folder.');
 const result=await runChecks(job,{now,progress:console.log,archive:async(bytes,digest,ext)=>{const file=path.join(folder,digest+ext);fs.writeFileSync(file,bytes);return file;}});
 const output=path.join(folder,'proton-evidence-checks.json');fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log('\nImport this file in Prospecting → Evidence:\n'+output+'\n\n'+result.results.filter(r=>r.outcome==='changed').length+' changed; '+result.results.filter(r=>r.outcome==='unchanged').length+' unchanged; '+result.results.filter(r=>r.outcome==='unavailable').length+' unavailable. No prospect records were changed.');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={publicAddress,publicUrl,fetchPublic,extract,validateJob,runChecks};
