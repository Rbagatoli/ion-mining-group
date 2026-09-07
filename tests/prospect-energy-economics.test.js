'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../site-engine');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('fuel quotes use engine efficiency and actual heat content, not a thermal kWh shortcut',()=>{
  const a={heatRateBtuPerKwh:11250/.93,gasBtuPerCf:1012*.342};
  near(E.powerRateFromQuote(3,'usd_mmbtu',a),3*11250/.93/1e6);
  near(E.powerRateFromQuote(3,'usd_gj',a),3*11250/.93*1.05505585262e-6);
  near(E.powerRateFromQuote(3,'usd_mcf',a),3*11250/.93/(1000*1012*.342));
  assert.equal(E.powerRateFromQuote(3,'usd_mcf',{}),null);assert.equal(E.powerRateFromQuote(0,'usd_kwh'),0);
  const legacy=E.evaluate({energy_type:'landfill_gas',quoted_rate:3,quoted_rate_units:'usd_gj',power_rate:.0108,power_rate_currency:'USD'});
  near(legacy.power_rate_usd,3*11250/.93*1.05505585262e-6);
});
test('power-price ceilings cover take-or-pay bills and fixed O&M at the modeled utilization',()=>{
  const s={nameplate_kw:2000,usable_kw:2000,purchase_price_usd:500000,power_rate:.03,power_rate_currency:'USD',take_or_pay_pct:90,om_hourly_rate:20};
  const market={btcPriceUsd:96000,networkHashratePh:800000,blockRewardBtc:3.125},cfg={uptimePct:50,targetPaybackMonths:36};
  const r=E.evaluate(s,market,cfg);near(E.evaluate({...s,power_rate:r.max_power_rate_cash_usd},market,cfg).monthly_net,0);
  near(E.evaluate({...s,power_rate:r.max_power_rate_capital_usd},market,cfg).payback_months,36);
});
