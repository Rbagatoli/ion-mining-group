/* Real browser acceptance checks. All external services are blocked; no live account writes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../tools/.cache/hosting-terrain-browser/node_modules/playwright-core');
const root=path.resolve(process.env.PROTON_CONTROL_TEST_ROOT||path.join(__dirname,'..')),out=path.join(root,'reports/agent-control-2026-09-17');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/app\//,'/').replace(/^\//,'');
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||!mime[path.extname(file)]||!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
const checks=[];let browser,page;
async function check(name,fn){try{await fn();checks.push({name,pass:true});console.log('PASS '+name);}catch(e){checks.push({name,pass:false,error:e.message});throw e;}}
(async()=>{
    fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const ctx=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
    await ctx.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    const p=await ctx.newPage(),errors=[];page=p;p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(8000);
    await p.goto(origin+'/app/agent-control.html',{waitUntil:'domcontentloaded'});
    await check('existing Proton navigation and honest empty state',async()=>{
        await p.getByRole('heading',{name:'Control center.'}).waitFor();assert.match(await p.locator('#connection').innerText(),/Local workspace/);
        assert.equal(await p.locator('nav a[href="./agent-control.html"]').count(),1);assert.equal(await p.locator('.ac-task').count(),0);
        await p.screenshot({path:path.join(out,'desktop-empty.png'),fullPage:true});
    });
    await check('four repeat-safe launch drafts, with no invented dispatch',async()=>{
        await p.getByRole('tab',{name:/Work queue/}).click();
        await p.getByRole('button',{name:'Add launch tasks',exact:true}).click();await p.waitForFunction(()=>document.querySelectorAll('.ac-task').length===4);
        await p.locator('#launchPlanButton').click();assert.equal(await p.locator('.ac-task').count(),4);
        const raw=await p.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));assert(raw.tasks.every(t=>t.status==='draft'&&!t.handoffAt));
    });
    await check('lead-gen sprint adds six drafts once and preserves existing work',async()=>{
        await p.locator('#leadSprintButton').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')).tasks.length===10);
        await p.locator('#leadSprintButton').click();const raw=await p.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));assert.equal(raw.tasks.length,10);assert(raw.tasks.every(t=>t.status==='draft'));assert.equal(raw.leads.length,0);
    });
    await check('lead evidence, draft handoff and do-not-contact persist without external sends',async()=>{
        await p.getByRole('tab',{name:/Lead desk/}).click();await p.getByRole('button',{name:'+ Lead',exact:true}).click();
        await p.getByLabel('Company',{exact:true}).fill('Synthetic supplier <img src=x>');await p.getByLabel('Account website',{exact:true}).fill('https://example.test');await p.getByLabel('Service to test',{exact:true}).selectOption('research');
        await p.getByLabel('Lead status',{exact:true}).selectOption('qualified');await p.getByRole('button',{name:'Save lead',exact:true}).click();await p.locator('#dialogError').waitFor();assert.match(await p.locator('#dialogError').innerText(),/Qualification/);
        for(const [label,value]of [['Buying signal and relevance','Synthetic expansion signal'],['Signal source URL','https://example.test/expansion'],['Evidence checked on','2026-09-17'],['Buyer role / name','Sales director'],['Public business contact route','https://example.test/contact'],['Next action','Review a relevant draft'],['Next action due','2026-09-18']])await p.getByLabel(label,{exact:true}).fill(value);
        await p.getByRole('button',{name:'Save lead',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});assert.equal(await p.locator('#leads img').count(),0);
        await p.getByRole('button',{name:'Draft outreach task +',exact:true}).click();assert.match(await p.getByLabel('Brief, constraints and deliverable',{exact:true}).inputValue(),/Do not send/);assert.equal(await p.getByLabel('Responsible role',{exact:true}).inputValue(),'outreach');
        await p.getByRole('button',{name:'Save draft',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        await p.getByRole('button',{name:'Update lead →',exact:true}).click();await p.getByLabel('Lead status',{exact:true}).selectOption('replied');await p.getByLabel('Actual contact / outcome date',{exact:true}).fill('2026-09-17');await p.getByLabel('What happened',{exact:true}).fill('Synthetic reply asks for a scoped proposal.');await p.getByRole('button',{name:'Save lead',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        await p.getByRole('button',{name:'Create opportunity +',exact:true}).click();assert.equal(await p.getByLabel('Service',{exact:true}).inputValue(),'research');assert.equal(await p.getByLabel('Proposed service fee · USD',{exact:true}).inputValue(),'1500');await p.locator('#deskDialog').getByRole('button',{name:'Cancel',exact:true}).click();
        for(const width of [390,320]){await p.setViewportSize({width,height:900});await p.locator('.ac-offers summary').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('.ac-offers summary').click();}
        await p.setViewportSize({width:1440,height:1100});
        await p.getByRole('button',{name:'Update lead →',exact:true}).click();await p.getByLabel('Lead status',{exact:true}).selectOption('dnc');await p.getByLabel('Qualification notes / closure reason',{exact:true}).fill('Synthetic opt-out');await p.getByRole('button',{name:'Save lead',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        await p.getByLabel('Lead stage',{exact:true}).selectOption('dnc');assert.equal(await p.getByRole('button',{name:'Draft outreach task +',exact:true}).count(),0);
        const raw=await p.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));assert.equal(raw.leads[0].stage,'dnc');assert.equal(raw.leads[0].lastTouch,'2026-09-17');assert.equal(raw.entries.length,0);
        await p.getByRole('tab',{name:/Work queue/}).click();
    });
    await check('Grok setup packet contains roles and manual connection boundary',async()=>{
        await p.getByRole('button',{name:'Set up Grok',exact:true}).click();assert.match(await p.locator('#setupText').inputValue(),/Proton Revenue Desk/);
        assert.match(await p.locator('#dialogBody').innerText(),/preview address is local/);await p.getByRole('button',{name:'Close dialog',exact:true}).click();
    });
    const title='UI pilot <img src=x onerror=alert(1)>';
    await check('create a task, preserve text safely, and prepare handoff',async()=>{
        await p.getByRole('button',{name:'+ New task',exact:true}).click();await p.getByLabel('Task title',{exact:true}).fill(title);
        await p.getByLabel('Responsible role',{exact:true}).selectOption('supply');await p.getByLabel('Brief, constraints and deliverable',{exact:true}).fill('Compare two dated offers. List unresolved cooling and warranty terms.');
        await p.getByRole('button',{name:'Save draft',exact:true}).click();await p.getByRole('button',{name:title,exact:true}).click();
        assert.equal(await p.locator('#dialogBody img').count(),0);await p.getByRole('button',{name:'Ready for handoff',exact:true}).click();
        await p.getByRole('button',{name:title,exact:true}).click();await p.getByRole('button',{name:'Copy handoff packet',exact:true}).click();
        const text=await p.evaluate(()=>navigator.clipboard.readText());assert.match(text,/Compare two dated offers/);
        const raw=await p.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));assert.equal(raw.tasks.find(t=>t.title===title).handoffAt,'');
        await p.getByRole('button',{name:'Claim task',exact:true}).click();
    });
    await check('submit a sourced result, review it and close the task',async()=>{
        await p.getByRole('button',{name:title,exact:true}).click();await p.getByRole('button',{name:'Submit result',exact:true}).click();
        await p.getByLabel('Result and remaining uncertainties',{exact:true}).fill('Offer A lacks confirmed capacity. Request a current written allocation before placing a customer.');
        await p.getByLabel('Source URLs · one per line',{exact:true}).fill('https://example.test/dated-quote');await p.getByRole('button',{name:'Submit for review',exact:true}).click();
        await p.getByRole('button',{name:title,exact:true}).click();await p.getByRole('button',{name:'Review & decide',exact:true}).click();
        await p.getByLabel('Decision',{exact:true}).selectOption('accept');await p.getByLabel('Review notes',{exact:true}).fill('Checked source and confirmed that capacity remains unverified.');
        await p.getByRole('button',{name:'Save decision',exact:true}).click();await p.getByLabel('Task visibility',{exact:true}).selectOption('closed');
        await p.getByRole('button',{name:title,exact:true}).waitFor();await p.getByLabel('Task visibility',{exact:true}).selectOption('open');
    });
    await check('opportunity value remains distinct from collected fees',async()=>{
        await p.getByRole('tab',{name:'Opportunities',exact:true}).click();await p.getByRole('button',{name:'+ Opportunity',exact:true}).click();
        await p.getByLabel('Customer / opportunity',{exact:true}).fill('Synthetic pilot buyer');await p.getByRole('button',{name:'Save opportunity',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        assert.match(await p.locator('#deals').innerText(),/Synthetic pilot buyer/);assert.match(await p.locator('#metrics').innerText(),/\$1,500/);
        const raw=await p.evaluate(()=>JSON.parse(localStorage.getItem('protonAgentControlLocal_v1')));assert.equal(raw.entries.length,0);
    });
    await check('manual cash entries reconcile to the contribution target',async()=>{
        await p.getByRole('tab',{name:'Cash record',exact:true}).click();await p.getByLabel('Reporting month',{exact:true}).fill('2026-09');
        for(const [kind,amount,note]of [['earned','7000','Earned and collected pilot services'],['delivery','1500','Outside delivery review'],['software','500','Allocated paid software']]){
            await p.getByRole('button',{name:'+ Cash entry',exact:true}).click();await p.getByLabel('Type',{exact:true}).selectOption(kind);
            await p.getByLabel('Date',{exact:true}).fill('2026-09-17');await p.getByLabel('Amount · USD',{exact:true}).fill(amount);
            await p.getByLabel('Description',{exact:true}).fill(note);await p.getByLabel('Payment or obligation reference',{exact:true}).fill('SYNTHETIC TEST — no real payment');
            if(kind==='earned')await p.locator('input[name=confirmed]').check();await p.getByRole('button',{name:'Record cash',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        }
        assert.match(await p.locator('#cashSummary').innerText(),/Available contribution\s*\$5,000/);
    });
    await check('queue pause, local reload persistence and backup export',async()=>{
        await p.locator('#pauseButton').click();await p.getByRole('button',{name:'Pause queue',exact:true}).last().click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        await p.reload({waitUntil:'domcontentloaded'});assert.equal(await p.locator('#pauseButton').innerText(),'Resume queue');
        const download=p.waitForEvent('download');await p.getByRole('button',{name:'Export backup',exact:true}).click();const d=await download;assert.match(d.suggestedFilename(),/proton-control-center/);
        await p.locator('#pauseButton').click();await p.getByRole('button',{name:'Resume queue',exact:true}).last().click();await p.locator('#deskDialog').waitFor({state:'hidden'});
    });
    await check('cash corrections preserve history and update contribution',async()=>{
        await p.getByRole('tab',{name:'Cash record',exact:true}).click();await p.locator('#cashEntries tr').filter({hasText:'Allocated paid software'}).getByRole('button',{name:'Void',exact:true}).click();
        await p.getByLabel('Correction reason',{exact:true}).fill('Synthetic duplicate removed; original is preserved.');await p.getByRole('button',{name:'Void record',exact:true}).click();await p.locator('#deskDialog').waitFor({state:'hidden'});
        assert.match(await p.locator('#cashEntries').innerText(),/VOIDED/);assert.match(await p.locator('#cashSummary').innerText(),/Available contribution\s*\$5,500/);
    });
    await check('desktop and phone layouts fit without horizontal page overflow',async()=>{
        await p.getByRole('tab',{name:/Work queue/}).click();
        for(const width of [1440,800,390,320]){
            await p.setViewportSize({width,height:1000});await p.reload({waitUntil:'domcontentloaded'});await p.waitForTimeout(150);
            const size=await p.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.w+1,JSON.stringify(size));
            if(width<600)assert(Number(await p.locator('.ac-heading h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)))>=32);
            if(width===1440||width===390)await p.screenshot({path:path.join(out,'desk-'+width+'.png'),fullPage:true});
            await p.getByRole('button',{name:'+ New task',exact:true}).click();const modalSize=await p.locator('#deskDialog').boundingBox();assert(modalSize.width<=width);
            await p.getByRole('button',{name:'Close dialog',exact:true}).click();
        }
    });
    await check('no uncaught browser exceptions',async()=>{assert.deepEqual(errors,[]);});
    fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({externalServices:'blocked; synthetic local records only',checks},null,2));
})().catch(async e=>{console.error(e.stack);fs.mkdirSync(out,{recursive:true});if(page){console.error(await page.locator('#deskDialog').innerText());await page.screenshot({path:path.join(out,'failure.png')});}fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify({checks,error:e.message},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
