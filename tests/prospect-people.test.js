'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../prospect-people'),L=require('../landfill-contacts'),fs=require('node:fs'),path=require('node:path');
const c={id:'lmop_201737-0',source:'lmop-landfill',sourceDetail:{lfid:'10413'}};
test('named contacts and direct business channels appear before office routes',()=>{
 const directory={contacts:[{organization:'County office',phone:'202-555-0100'},{contactName:'Jane Example',organization:'County office',title:'Energy manager',phone:'202-555-0123 ext 9',email:'jane@example.com',sourceUrl:'https://example.com/directory',sourceDate:'2026-08-01'}]};
 const html=P.render(c,null,directory,null,[]);assert.ok(html.indexOf('Jane Example')<html.indexOf('Office contacts &'));
 assert.match(html,/tel:2025550123;ext=9/);assert.match(html,/mailto:jane@example.com/);assert.match(html,/Named contact/);assert.match(html,/2026-08-01/);
});
test('saved terms, CRM contacts and relationship people are included without merging shared switchboards',()=>{
 const saved={id:c.id,contact_name:'Terms Person',contact_phone:'2025550124'};
 const crm=[{name:'Sam Contact',organization:'County',phone:'2025550123',email:'sam@example.com'}];
 const research={nodes:[{name:'Kim Contact',kind:'person',phone:'2025550123'},{name:'Archived',kind:'person',archived:true}]};
 const rows=P.contacts(c,saved,{contacts:[{contactName:'Sam Contact',organization:'County',phone:'2025550123',email:'sam@example.com'}]},research,crm);
 assert.equal(rows.length,3);assert.ok(rows.some(n=>n.name==='Terms Person'));assert.ok(rows.some(n=>n.name==='Kim Contact'));assert.equal(rows.filter(n=>n.name==='Sam Contact').length,1);
});
test('unsafe URLs and markup never become executable actions; missing individual data stays explicit',()=>{
 const html=P.render(c,null,{contacts:[{organization:'<img src=x onerror=alert(1)>',phone:'javascript:alert(1)',email:'bad@example.com?subject=unsafe',sourceUrl:'javascript:alert(1)'}]},null,[]);
 assert.doesNotMatch(html,/<img|href="javascript|mailto:bad/);assert.match(html,/named individual is still to identify/);assert.match(html,/&lt;img/);
});
test('the shipped directory contains named people with business channels and the new renderer exposes them',()=>{
 let sites=0,people=0;for(let shard=0;shard<64;shard++){const file=path.join(__dirname,'../data/landfill-contacts-'+L.edition+'-'+shard.toString(16).padStart(2,'0')+'.json'),d=JSON.parse(fs.readFileSync(file,'utf8'));for(const site of Object.values(d.sites)){const rows=P.contacts(c,null,site,null,[]),named=rows.filter(n=>n.person&&(L.emailHref(n.email)||L.phoneHref(n.phone)));if(named.length){sites++;people+=named.length;const html=P.render(c,null,site,null,[]);assert.match(html,/Named contact/);}}}
 assert.ok(sites>500);console.log('Named business contacts available on '+sites+' landfill site records ('+people+' contact records).');
});
