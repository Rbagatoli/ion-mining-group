/* Exercise the actual shared browser handler without opening mail or using a network. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const site=path.join(__dirname,'../../site'),source=fs.readFileSync(path.join(site,'site.js'),'utf8'),contact=fs.readFileSync(path.join(site,'contact.html'),'utf8');
let checks=0;
function check(name,run){run();checks++;console.log('  ok    '+name);}
function harness(search='',options={}){
 const listeners={},topicListeners={},navigation=[],attrs={'data-mailto':options.to||'hello@protonminingco.com','data-subject':options.subject||'Enquiry via protonminingco.com'},button={textContent:'Send message',disabled:!!options.disabled};
 const fields=[['name','Name','Example & Co.'],['email','Email','person@example.test'],['message','Message','A 5 MW site in Alberta.\nBudget & timing to discuss.']].map(([name,label,value])=>({name,type:'text',value,hasAttribute:()=>false,closest:()=>({querySelector:()=>({textContent:label})})}));
 const form={elements:fields,valid:true,reportValidity(){return this.valid;},getAttribute:name=>attrs[name]??null,setAttribute(name,value){attrs[name]=value;},removeAttribute(name){delete attrs[name];},addEventListener(name,fn){listeners[name]=fn;},querySelector(selector){if(selector==='button[type="submit"][data-mailto-enable]'){assert.equal(typeof listeners.submit,'function','Draft handler is attached before opt-in enabling.');return options.enableDraft?button:null;}return selector==='button[type="submit"]'?button:null;}};
 const topic={form,value:'hosting',addEventListener(name,fn){topicListeners[name]=fn;}};
 const location={search};Object.defineProperty(location,'href',{set(value){navigation.push(value);},get(){return navigation.at(-1)||'';}});
 const document={querySelector(selector){return selector==='[data-topic-select]'&&options.topic!==false?topic:null;},querySelectorAll(selector){return selector==='form[data-mailto]'?[form]:[];},getElementById(){return null;}};
 vm.runInNewContext(source,{document,window:{location,addEventListener(){}},URLSearchParams,setTimeout(){}});
 return {form,topic,attrs,button,navigation,change(value){topic.value=value;topicListeners.change();},submit(){let prevented=false;listeners.submit({preventDefault(){prevented=true;}});assert(prevented);}};
}
check('contact offers distinct site-search and site-owner routes with a short search-brief link',()=>{
 assert.match(contact,/<option value="site-sourcing">I need an energy site<\/option>/);assert.match(contact,/<option value="energy">I have energy or a site<\/option>/);assert.match(contact,/href="\.\/energy-sites\.html#request"/);assert.match(contact,/Site searches and submissions/);
});
check('site-sourcing deep link chooses the energy inbox and its specific subject',()=>{
 const h=harness('?topic=site-sourcing');assert.equal(h.topic.value,'site-sourcing');assert.equal(h.attrs['data-mailto'],'energy@protonminingco.com');assert.equal(h.attrs['data-subject'],'Energy site sourcing enquiry via protonminingco.com');assert.deepEqual(h.navigation,[]);
});
check('site sourcing composes an encoded draft only when the valid form is submitted',()=>{
 const h=harness('?topic=site-sourcing');h.submit();assert.equal(h.navigation.length,1);const url=new URL(h.navigation[0]);assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'energy@protonminingco.com');assert.equal(url.searchParams.get('subject'),'Energy site sourcing enquiry via protonminingco.com');assert.match(url.searchParams.get('body'),/Name: Example & Co\./);assert.match(url.searchParams.get('body'),/Message: A 5 MW site in Alberta\.\nBudget & timing to discuss\./);assert.equal(url.searchParams.size,2);assert.equal(h.button.textContent,'Opening your mail app…');
});
check('switching topics retains every existing inbox and subject and can return to sourcing',()=>{
 const h=harness('?topic=site-sourcing');
 for(const [topic,to,subject] of [['hosting','hosting','Hosting enquiry'],['energy','energy','Site / energy enquiry'],['managed-hosting','energy','Managed Energy Hosting enquiry'],['partnership','hello','Partnership enquiry'],['media','hello','Media enquiry'],['other','hello','Enquiry'],['site-sourcing','energy','Energy site sourcing enquiry']]){h.change(topic);assert.equal(h.attrs['data-mailto'],to+'@protonminingco.com');assert.equal(h.attrs['data-subject'],subject+' via protonminingco.com');}
 assert.deepEqual(h.navigation,[]);
});
check('unknown deep links preserve the ordinary hosting default',()=>{const h=harness('?topic=unrecognized');assert.equal(h.topic.value,'hosting');assert.equal(h.attrs['data-mailto'],'hosting@protonminingco.com');});
check('invalid forms and a checkout takeover never open a mail draft',()=>{
 const invalid=harness('?topic=site-sourcing');invalid.form.valid=false;invalid.submit();assert.deepEqual(invalid.navigation,[]);
 const checkout=harness('?topic=site-sourcing');checkout.form.removeAttribute('data-mailto');checkout.submit();assert.deepEqual(checkout.navigation,[]);assert.equal(checkout.button.textContent,'Send message');
});
check('a standalone energy-search brief preserves its data-mailto route without a topic selector',()=>{
 const h=harness('',{topic:false,to:'energy@protonminingco.com',subject:'Energy site sourcing enquiry via protonminingco.com'});h.submit();const url=new URL(h.navigation[0]);assert.equal(url.pathname,'energy@protonminingco.com');assert.equal(url.searchParams.get('subject'),'Energy site sourcing enquiry via protonminingco.com');
});
check('source preferences include only checked enabled controls and use their visible labels',()=>{
 const h=harness('',{topic:false,to:'energy@protonminingco.com'});
 for(const [name,checked,disabled] of [['Hydro',true,false],['Solar',true,false],['Nuclear',false,false],['Wind',true,true]]) h.form.elements.push({name:'energy_sources',type:'checkbox',value:name,checked,disabled,labels:[{textContent:name}],closest:()=>null});
 h.submit();const body=new URL(h.navigation[0]).searchParams.get('body');
 assert.match(body,/Energy sources: Hydro, Solar/);assert.doesNotMatch(body,/Nuclear|Wind/);
});
check('owner source drafts use visible names while other selects retain their values',()=>{
 const h=harness('',{topic:false,to:'energy@protonminingco.com'});
 const field=(name,label,value,display,labels)=>({name,type:'select-one',value,labels:[{textContent:label}],closest:()=>null,hasAttribute:key=>key==='data-mailto-label'&&labels,options:[{value,selected:true,textContent:display},{value:'ignore',selected:false,textContent:'Not selected'}]});
 h.form.elements.push(field('energy_type','Energy source','natural_gas','Natural gas generation',true),field('internal','Ordinary select','source_id','Readable label',false));
 h.submit();const body=new URL(h.navigation.at(-1)).searchParams.get('body');assert.match(body,/Energy source: Natural gas generation/);assert.doesNotMatch(body,/natural_gas|Not selected/);assert.match(body,/Ordinary select: source_id/);
});
check('only opted-in draft buttons are enabled after attaching the submit handler',()=>{
 const draft=harness('',{topic:false,enableDraft:true,disabled:true,to:'energy@protonminingco.com'});assert.equal(draft.button.disabled,false);assert.deepEqual(draft.navigation,[]);
 const other=harness('',{disabled:true});assert.equal(other.button.disabled,true);assert.deepEqual(other.navigation,[]);
});
check('energy choices preserve only checked sources and distinguish an unrestricted search',()=>{
 const h=harness('',{topic:false,to:'energy@protonminingco.com'});
 const fields=[['Hydro',true],['Nuclear',true],['Landfill gas',false]].map(([value,checked])=>({name:'energy_sources',type:'checkbox',value,checked}));
 h.form.elements.push(...fields);h.submit();let body=new URL(h.navigation.at(-1)).searchParams.get('body');
 assert.match(body,/Energy sources: Hydro, Nuclear/);assert(!body.includes('Landfill gas'));assert.equal((body.match(/Energy sources:/g)||[]).length,1);
 fields.forEach(f=>{f.checked=false;});h.submit();body=new URL(h.navigation.at(-1)).searchParams.get('body');assert.match(body,/Energy sources: Any energy source/);
});
check('unchecked or disabled controls do not become requirements and multiselect retains all choices',()=>{
 const h=harness('',{topic:false});const field=(name,type,value,extra={})=>({name,type,value,hasAttribute:()=>false,closest:()=>null,...extra});
 h.form.elements.push(field('reject','checkbox','not selected',{checked:false}),field('disabled','text','not active',{disabled:true}),field('allowed','checkbox','Yes',{checked:true}),field('states','select-multiple','NY',{multiple:true,options:[{value:'NY',selected:true},{value:'PA',selected:true},{value:'TX',selected:false}]}));h.submit();const body=new URL(h.navigation.at(-1)).searchParams.get('body');assert(!body.includes('not selected'));assert(!body.includes('not active'));assert.match(body,/allowed: Yes/);assert.match(body,/states: NY, PA/);
});
console.log('\n'+checks+' contact routing checks passed.');
