/* Numerical regressions for user-supplied mining economics, independent of the renderer. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../../site/mine-builder-model.js');
const E = require('../../site/calc-engine.js');
const root = path.resolve(__dirname,'../..');
const day = '2026-09-05T00:00:00Z';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ok    '+name); }
function near(a,b,relative=1e-10) { assert.ok(Math.abs(a-b) <= Math.max(1,Math.abs(b))*relative,`${a} != ${b}`); }
const base = M.estimate({},day);

check('power budget reserves auxiliary load before flooring the fleet',() => {
    assert.equal(base.count,160); near(base.siteKW,995.4); near(base.unusedKW,4.6);
    assert.ok(base.siteKW <= base.availableKW);
});
check('BTC/day matches the independent proof-of-work formula',() => {
    const expected = 160*395*1e12*86400*3.125/(125.86e12*2**32)*.95*.98;
    near(base.btcDay,expected);
});
check('cooling overhead is billed, alongside miners, during uptime',() => {
    near(base.energyDay,160*5.925*1.05*24*.07*.95);
    near(base.marginDay,base.btcDay*96000-base.energyDay);
});
check('gas-to-electricity conversion preserves Mcf and hours',() => {
    const r=M.estimate({sizing:'gas',gasMcf:240,gasBtu:1000,heatRate:10000},day);
    near(r.availableKW,1000); assert.equal(r.count,base.count); near(r.btc30,base.btc30);
});
check('machine-count mode sizes required supply instead of silently clamping',() => {
    const r=M.estimate({sizing:'machines',machineCount:100},day);
    assert.equal(r.count,100); near(r.siteKW,622.125); near(r.unusedKW,0);
});
check('zero power, gas and machine count never become one miner',() => {
    for (const input of [{powerMW:0},{powerMW:.001},{sizing:'gas',gasMcf:0},{sizing:'machines',machineCount:0}]) {
        const r=M.estimate(input,day);
        assert.equal(r.count,0); assert.equal(r.btcDay,0); assert.equal(r.btc30,0); assert.equal(r.btcYear,0);
        assert.equal(r.marginDay,0); assert.equal(r.energyPerBTC,null); assert.equal(r.containers,0);
        assert.equal(M.calculatorURL(r),null);
    }
});
check('zero uptime earns and consumes nothing under the stated standby assumption',() => {
    const r=M.estimate({uptime:0},day); assert.equal(r.btcYear,0); assert.equal(r.energyDay,0); assert.equal(r.breakEvenRate,null);
});
check('a 100% pool fee yields zero payout and a real electricity loss',() => {
    const r=M.estimate({poolFee:100},day); assert.equal(r.btcYear,0); assert.ok(r.marginDay<0); assert.equal(r.energyPerBTC,null); assert.equal(r.breakEvenRate,0);
});
check('free power remains zero and never falls back to the example rate',() => {
    const r=M.estimate({elecCost:0},day); assert.equal(r.energyDay,0); assert.equal(r.energyPerBTC,0); near(r.marginDay,r.revenueDay);
});
check('difficulty doubles and BTC production halves with other inputs unchanged',() => {
    const r=M.estimate({difficulty:251.72},day); near(r.btcDay,base.btcDay/2); near(r.btcYear,base.btcYear/2);
});
check('changing BTC price changes dollar revenue, never BTC production',() => {
    const r=M.estimate({btcPrice:192000},day); near(r.btcDay,base.btcDay); near(r.btcYear,base.btcYear); near(r.revenueDay,base.revenueDay*2);
});
check('30-day and 365-day projections include difficulty growth',() => {
    assert.ok(base.btc30<base.btcDay*30); assert.ok(base.btcYear<base.btcDay*365);
    const flat=M.estimate({diffChange:0},day); near(flat.btc30,flat.btcDay*30); near(flat.btcYear,flat.btcDay*365);
});
check('daily projection crosses the estimated halving on the correct day',() => {
    const r=M.estimate({diffChange:0},'2028-04-16T00:00:00Z');
    near(r.btc30,r.btcDay*(1+29/2)); near(r.btcYear,r.btcDay*(1+364/2));
});
check('container count obeys BOTH rack slots and IT power capacity',() => {
    const r=M.estimate({sizing:'machines',machineCount:300,containerMW:.6,slots:240},day);
    assert.equal(r.perContainer,101); assert.equal(r.containers,3);
    assert.equal(M.estimate({slots:40},day).containers,4);
});
check('a container too small for a single machine reports a validation error',() => {
    const r=M.estimate({power:20,containerMW:.01},day); assert.equal(r.valid,false); assert.equal(r.errors[0].field,'containerMW');
});
check('grid supply removes modeled on-site generation',() => {
    assert.equal(M.estimate({source:'grid'},day).generators,0);
    assert.equal(M.estimate({sizing:'gas',source:'grid'},day).settings.source,'gas');
});
check('negative, empty, nonfinite, fractional counts and out-of-range inputs are rejected',() => {
    for (const input of [{powerMW:-1},{elecCost:''},{btcPrice:NaN},{difficulty:0},{poolFee:101},{uptime:-1},{slots:1.5},{sizing:'machines',machineCount:1.1},{diffChange:-100},{power:Infinity}]) {
        assert.equal(M.estimate(input,day).valid,false,JSON.stringify(input));
    }
});
check('hidden sizing inputs do not invalidate the active sizing method',() => {
    assert.equal(M.estimate({powerMW:1,machineCount:'',gasMcf:'',gasBtu:'',heatRate:''},day).valid,true);
});
check('capital budgets use the entered prices and include entered infrastructure',() => {
    const r=M.estimate({capex:3000,infrastructureCost:200000},day);
    assert.equal(r.hardwareCost,480000); assert.equal(r.totalCost,680000);
});
check('the break-even rate actually zeroes daily margin',() => {
    const r=M.estimate({elecCost:base.breakEvenRate},day); near(r.marginDay,0,1e-8);
});
check('the full-calculator handoff reproduces production and energy expense',() => {
    const url=M.calculatorURL(base), params=new URL(url,'https://example.test/').searchParams;
    const state=Object.fromEntries(params);
    ['autoReplace','additionCapex','reinvest','replacementEnabled','taxAdjustment','coverElec'].forEach(k=>state[k]=state[k]==='1');
    state.startDate=day;
    const r=E.computeProjection(state);
    near(r.cumulBtcMined,base.btcYear); near(r.dailyRevenueDay1,base.revenueDay); near(r.dailyElecDay1,base.energyDay);
    assert.equal(state.minerModel,'__custom__');
    const html=fs.readFileSync(path.join(root,'site/calculator.html'),'utf8');
    for (const key of params.keys()) assert.ok(html.includes('id="'+key+'"'),'calculator field exists: '+key);
});
check('machine cooling is correctly identified for all supported families',() => {
    assert.equal(M.coolingFor('Antminer S21+ Hyd.'),'hydro'); assert.equal(M.coolingFor('Antminer S21 XP'),'air');
    assert.equal(M.coolingFor('Whatsminer M66S'),'immersion'); assert.equal(M.coolingFor('Avalon A1566I'),'immersion');
});
check('the generated page ships both tabs, accessible panels and the lazy renderer reference',() => {
    const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
    for (const id of ['mb-tab-ours','mb-tab-build','mb-builder','mb-our-mine','mb-stage']) assert.ok(html.includes('id="'+id+'"'));
    assert.match(html,/data-module-src="\.\/mine-builder-scene\.js(?:\?v=[a-f0-9]+)?"/);
    assert.match(html,/aria-labelledby="mb-tab-build"[^>]*hidden/);
    assert.ok(html.includes('mine-builder.css'));
    assert.ok(html.indexOf('src="./calc-engine.js')<html.indexOf('src="./mine-builder-model.js'));
    assert.ok(html.indexOf('src="./mine-builder-model.js')<html.indexOf('src="./mine-builder.js'));
});

(async()=>{
    const {buildYard,yardCameraPose}=await import('../../site/mine-builder-scene.js');
    const T=await import('../../site/vendor/three-0.185.1/three.module.min.js');
    check('all three cooling designs produce finite geometry within a bounded yard',() => {
        for (const cooling of ['hydro','air','immersion']) {
            const r=M.estimate({powerMW:6,cooling},day), y=buildYard(r);
            assert.equal(y.containers.length,r.containers);
            y.root.traverse(o=>{ for (const n of o.matrixWorld.elements) assert.ok(Number.isFinite(n));
                if (o.isInstancedMesh) for (const n of o.instanceMatrix.array) assert.ok(Number.isFinite(n)); });
            assert.ok(y.fans.length>0);
        }
    });
    check('large fleets render representative groups without lying about container totals',() => {
        const r=M.estimate({powerMW:100},day), y=buildYard(r);
        assert.ok(r.containers>12); assert.equal(y.containers.length,12);
        assert.equal(y.containers.reduce((sum,c)=>sum+c.root.userData.represented,0),r.containers);
    });
    check('empty fleets render an empty pad with no energized machinery',() => {
        const y=buildYard(M.estimate({powerMW:0},day)); assert.equal(y.containers.length,0); assert.equal(y.pulses.length,0); assert.equal(y.fans.length,0);
    });
    check('desktop and mobile cameras fit the full yard throughout the idle sweep',()=>{
        for(const powerMW of [1,6,100]) for(const aspect of [860/460,350/290]) {
            const yard=buildYard(M.estimate({powerMW},day)), pose=yardCameraPose(yard,aspect);
            const camera=new T.PerspectiveCamera(38,aspect,.1,1000);
            for(const angle of [-.075,0,.075]) {
                camera.position.copy(pose.position).sub(pose.target).applyAxisAngle(new T.Vector3(0,1,0),angle).add(pose.target);
                camera.lookAt(pose.target);camera.updateMatrixWorld();
                for(const x of [yard.bounds.min.x,yard.bounds.max.x]) for(const y of [yard.bounds.min.y,yard.bounds.max.y]) for(const z of [yard.bounds.min.z,yard.bounds.max.z]) {
                    const p=new T.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.93);assert.ok(Math.abs(p.y)<.76);
                }
            }
        }
    });
    console.log('\n  '+passed+' mine builder checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
