/* Screening capacity, separate from contractual availability. All outputs retain their basis. */
var SiteCapacity = (function () {
    'use strict';
    // EPA LFGcost-Web v3.6 standard-engine assumptions, checked 2026-09-07, manual p.33.
    // These are screening inputs, not measurements of a particular landfill.
    var LFG = { methanePct: 50, methaneBtuPerCf: 1012, heatRateBtuPerKwh: 11250, parasiticPct: 7 };
    var SOURCE = 'https://www.epa.gov/system/files/documents/2023-09/lfgcost_web_v3.6_usersmanual_sep2023.pdf';
    var PARASITIC = { landfill_gas: 0.07, flare_gas: 0.07, _default: 0.07 };
    var LFG_MW_PER_MMSCFD = 1000000 * (LFG.methanePct / 100) * LFG.methaneBtuPerCf / (24 * LFG.heatRateBtuPerKwh * 1000);
    function num(v) { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; var n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
    function parasiticFor(c) {
        // EIA capacity factors already include the effect of plant auxiliary consumption.
        if (c && c.source === 'eia-facility') return 0;
        var t = c && c.energyType; return Object.prototype.hasOwnProperty.call(PARASITIC, t) ? PARASITIC[t] : PARASITIC._default;
    }
    function assumptionsFor(c) {
        var methane = num((c && c.sourceDetail || {}).methanePct), reported = methane !== null && methane <= 100;
        return { methanePct: reported ? methane : LFG.methanePct, methaneBtuPerCf: LFG.methaneBtuPerCf, heatRateBtuPerKwh: LFG.heatRateBtuPerKwh, parasiticPct: LFG.parasiticPct, methaneBasis: reported ? 'reported; sample date not published' : 'engineering default; not a site measurement' };
    }
    function gasFactor(c) { return LFG_MW_PER_MMSCFD * assumptionsFor(c).methanePct / LFG.methanePct; }
    function gasSupportedKw(c) {
        var sd = c && c.sourceDetail || {}, flow = num(sd.lfgCollectedMmscfd);
        return flow === null ? null : flow * gasFactor(c) * 1000;
    }
    function usableCapacity(c) {
        var sd = c && c.sourceDetail || {}, original = num(c && c.powerPotentialKw), par = parasiticFor(c), gas = gasSupportedKw(c);
        var empty = { kw: null, basis: null, gross: original, grossUsedKw: null, gasSupportedKw: gas, gasCapped: false, parasiticPct: par * 100, availableKw: null, screening: true };
        if (!c || /placeholder|nominal 100/i.test(String(sd.capacityBasis || ''))) { empty.basis = c ? 'No measured or modelled capacity; a catalogue placeholder is not power.' : null; return empty; }
        var gross = original, basis = sd.capacityBasis || 'Published nameplate / resource estimate';
        if (c.source === 'lmop-landfill' && !/rated|actual MW/i.test(basis)) {
            if (gas !== null) { gross = gas; basis = 'Reported landfill-wide gas collected, converted with EPA standard-engine assumptions'; }
            else if (num(sd.lfgFlowToProjectMmscfd) !== null) { gross = num(sd.lfgFlowToProjectMmscfd) * gasFactor(c) * 1000; basis = 'Reported project gas flow, converted with EPA standard-engine assumptions'; }
            else if (num(sd.lfgFlaredMmscfd) !== null) { gross = num(sd.lfgFlaredMmscfd) * gasFactor(c) * 1000; basis = 'Reported flared gas, converted with EPA standard-engine assumptions'; }
            else if (original !== null && /2\.08 MW|waste.in.place|modelled/i.test(basis)) { gross = original / 2.08 * gasFactor(c); basis += '; conversion updated to the EPA standard-engine screening heat rate'; }
        }
        if (gross === null) return empty;
        var base = gross, capped = gas !== null && gas < gross;
        if (capped) base = gas;
        return { kw: Math.round(base * (1 - par)), gross: original, grossUsedKw: Math.round(base), gasSupportedKw: gas === null ? null : Math.round(gas), gasCapped: capped,
            parasiticPct: Math.round(par * 100), basis: basis, availableKw: null, screening: true,
            assumptions: c.energyType === 'landfill_gas' && c.source === 'lmop-landfill' ? assumptionsFor(c) : null,
            sourceUrl: c.energyType === 'landfill_gas' && c.source === 'lmop-landfill' ? SOURCE : null };
    }
    return { PARASITIC: PARASITIC, LFG: LFG, LFG_MW_PER_MMSCFD: LFG_MW_PER_MMSCFD, assumptionsFor: assumptionsFor, parasiticFor: parasiticFor, gasSupportedKw: gasSupportedKw,
        usableCapacity: usableCapacity, usableKwFor: function (c) { return usableCapacity(c).kw; } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SiteCapacity;
