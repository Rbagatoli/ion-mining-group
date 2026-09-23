import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url));
const builder=require('../tools/build-crm.cjs');
const frontend=['client.mjs','journal.mjs','exchange-controller.mjs','exchange-page.mjs','crm-host.mjs','view.mjs','config.mjs','exchange.css','review-client.mjs','review-host.mjs','review-view.mjs','review-config.mjs'];
const approvedConfig={enabled:true,endpoint:'https://proton-agent-interface.renzo-539.workers.dev',approvedOrigin:'https://proton-agent-interface.renzo-539.workers.dev',ownerUid:'15nXwDeq9pVS6iRkT7G4Jzhz2y32',policyId:'PROTON-CRM-LEAD-ONLY-20260923'};
const disabledConfig={enabled:false,endpoint:'',ownerUid:'',policyId:''};
const read=file=>fs.readFileSync(file,'utf8');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,12);
function write(file,body){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);}
function inventory(dir,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?inventory(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]).sort();
}
function checkImports(out){
  const versions=new Set();let count=0;
  for(const rel of ['crm.js',...frontend.filter(name=>name.endsWith('.mjs')).map(name=>'agent-exchange/'+name)]){
    for(const match of read(path.join(out,rel)).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"\r\n]+\.mjs(?:\?[^'"\r\n]*)?)\1/g)){
      const url=new URL(match[2],pathToFileURL(path.join(out,rel)));
      assert.ok(fs.statSync(fileURLToPath(url)).isFile(),rel+' resolves '+match[2]);
      assert.match(url.search,/^\?v=[a-f0-9]{12}$/);versions.add(url.search);count++;
    }
  }
  assert.ok(count>=8,'entry point and every transitive module import were examined');
  assert.equal(versions.size,1,'the entire module graph uses one release stamp');
  return [...versions][0];
}
function checkHtml(out){
  let count=0;
  for(const match of read(path.join(out,'index.html')).matchAll(/(?:src|href)="\.\/([^"?]+\.(?:css|m?js))\?v=([a-f0-9]{12})"/g)){
    assert.equal(match[2],hash(path.join(out,match[1])),match[1]+' matches its packaged bytes');count++;
  }
  assert.ok(count>0);
}
function checkManifest(out){
  const html=read(path.join(out,'index.html')),manifest=JSON.parse(read(path.join(out,'release.json')));
  const info=require('../crm/release-update.js').shellInfo(html);
  assert.equal(manifest.schema,1);assert.match(manifest.version,/^[a-f0-9]{64}$/);
  assert.equal(manifest.version,info.version);
  assert.equal(manifest.shellHash,crypto.createHash('sha256').update(html).digest('hex'));
  assert.deepEqual(manifest.references,info.references);
  return manifest;
}

test('CRM agent assets remain explicit, closed, versioned and public-only',async t=>{
  const cache=path.resolve(root,'tools/.cache');fs.mkdirSync(cache,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(cache,'crm-agent-assets-'));
  t.after(()=>{
    const resolved=fs.realpathSync(temporary),allowed=fs.realpathSync(cache)+path.sep;
    assert.ok(resolved.startsWith(allowed),'cleanup stays within the test cache');
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  const entries=builder.assets(),out=path.join(temporary,'assembled');
  assert.equal(builder.build(out),entries.length+1);
  const publishedFiles=[...entries.map(a=>a.to),'release.json'].sort();

  await t.test('actual assembled CRM resolves every module with a current release stamp',()=>{
    assert.deepEqual(entries.filter(a=>a.to.startsWith('agent-exchange/')).map(a=>a.to.slice('agent-exchange/'.length)).sort(),[...frontend].sort());
    checkImports(out);checkHtml(out);checkManifest(out);
    assert.match(read(path.join(out,'index.html')),/agent-exchange\/exchange\.css\?v=[a-f0-9]{12}/);
  });

  await t.test('only declared assets and the release manifest are published with the exact approved pins',async()=>{
    assert.deepEqual(inventory(out),publishedFiles);
    assert.ok(!inventory(out).some(name=>/(?:^|\/)(?:worker[^/]*|reports|operations|\.dev\.vars|\.env)(?:\/|$)/.test(name)));
    const config=(await import(pathToFileURL(path.join(out,'agent-exchange/config.mjs')))).default;
    assert.deepEqual(config,approvedConfig);
    const reviewConfig=(await import(pathToFileURL(path.join(out,'agent-exchange/review-config.mjs')))).default;
    assert.equal(reviewConfig.enabled,false);
    assert.ok(Object.entries(reviewConfig).every(([key,value])=>key==='enabled'||value===''),'unactivated review has no endpoint or principal pins');
    assert.ok(!read(path.join(out,'crm.js')).includes('review-view.mjs'),'staged review is not mounted into the live CRM route');
    assert.ok(!fs.existsSync(path.join(out,'agent-exchange/exchange.html')));
  });

  // A small isolated source tree exercises rebuilds without changing application
  // sources or copying the public data corpus a second time.
  const fixture=path.join(temporary,'fixture');
  write(path.join(fixture,'tools/build-crm.cjs'),read(path.join(root,'tools/build-crm.cjs')));
  write(path.join(fixture,'tools/app-assets.json'),read(path.join(root,'tools/app-assets.json')));
  for(const asset of entries){
    const actual=asset.from==='crm/index.html'||asset.from==='crm/crm.js'||asset.from==='crm/release-update.js'||asset.from.startsWith('crm/agent-exchange/');
    write(path.join(fixture,asset.from),actual?read(path.join(root,asset.from)):'');
  }
  fs.appendFileSync(path.join(fixture,'crm/index.html'),'\n<script type="module" src="./agent-exchange/view.mjs?v=old"></script>\n');
  const marker='PRIVATE_FIXTURE_'+crypto.randomUUID();
  for(const name of ['worker-agent-interface/index.mjs','worker-agent-interface/.dev.vars','reports/private.json','operations/budget.json','crm/agent-exchange/undeclared-secret.mjs'])write(path.join(fixture,name),marker);
  const fixtureBuilder=require(path.join(fixture,'tools/build-crm.cjs'));

  await t.test('an explicit disabled fixture retains its closed host without accessing an account',async()=>{
    write(path.join(fixture,'crm/agent-exchange/config.mjs'),'export default Object.freeze('+JSON.stringify(disabledConfig)+');\n');
    const disabled=path.join(fixture,'disabled');fixtureBuilder.build(disabled);
    const config=(await import(pathToFileURL(path.join(disabled,'agent-exchange/config.mjs')))).default;
    assert.deepEqual(config,disabledConfig);checkManifest(disabled);checkImports(disabled);
    const {mountCrmExchangeHost}=await import(pathToFileURL(path.join(disabled,'agent-exchange/crm-host.mjs')));
    const host=mountCrmExchangeHost({config});
    assert.deepEqual(host.status(),{state:'disabled'});await host.ready();
  });

  await t.test('a transitive module change invalidates the entry and every module import',()=>{
    const before=path.join(fixture,'before'),after=path.join(fixture,'after');
    fixtureBuilder.build(before);const oldVersion=checkImports(before);checkHtml(before);const oldManifest=checkManifest(before);
    fs.appendFileSync(path.join(fixture,'crm/agent-exchange/client.mjs'),'\n// Isolated transitive dependency change.\n');
    fixtureBuilder.build(after);const newVersion=checkImports(after);checkHtml(after);const newManifest=checkManifest(after);
    assert.notEqual(newVersion,oldVersion);assert.notEqual(hash(path.join(before,'crm.js')),hash(path.join(after,'crm.js')));
    assert.notEqual(newManifest.version,oldManifest.version);
    assert.match(read(path.join(after,'index.html')),/agent-exchange\/view\.mjs\?v=[a-f0-9]{12}/);
    assert.deepEqual(inventory(after),publishedFiles);
    for(const file of inventory(after))assert.ok(!read(path.join(after,file)).includes(marker),file+' excludes undeclared private fixture content');
  });

  await t.test('module source normalization preserves reproducible packages across checkout line endings',()=>{
    const source='export default true;\n';
    assert.deepEqual(builder.packageBytes('agent-exchange/config.mjs',Buffer.from(source.replaceAll('\n','\r\n'))),Buffer.from(source));
  });

  await t.test('undeclared local, escaping and remote imports fail before output writes',()=>{
    const view=path.join(fixture,'crm/agent-exchange/view.mjs'),original=read(view);
    for(const [index,specifier] of ['./undeclared-secret.mjs','../../worker-agent-interface/index.mjs','https://example.test/private.mjs'].entries()){
      write(view,original+'\nimport '+JSON.stringify(specifier)+';\n');
      const rejected=path.join(fixture,'rejected-'+index);
      assert.throws(()=>fixtureBuilder.build(rejected),/Undeclared CRM module import/);
      assert.equal(fs.existsSync(rejected),false);
    }
    write(view,original);
  });

  await t.test('preview serves a declared module with JavaScript MIME and nosniff without a network listener',async()=>{
    const server=require('../tools/preview-crm.cjs').createServer();let headers,status,body='';
    const response=new Writable({write(chunk,encoding,callback){body+=chunk.toString();callback();}});
    response.writeHead=(code,value)=>{status=code;headers=value;return response;};
    const complete=finished(response);
    server.emit('request',{url:'/crm/agent-exchange/view.mjs'},response);await complete;
    assert.equal(status,200);assert.equal(headers['Content-Type'],'text/javascript; charset=utf-8');
    assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.equal(headers['Cache-Control'],'no-store');
    assert.equal(body,read(path.join(root,'crm/agent-exchange/view.mjs')));assert.equal(server.listening,false);
  });
});
