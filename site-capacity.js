/* ===== Site capacity: how much power you can actually use =====
 *
 * MOVED VERBATIM out of map-sourcing.js, where it was private to a 6,000-line browser IIFE with
 * no exports. Nothing about the arithmetic changed in the move and a fixture proves it: the
 * digest over all 30,517 real candidates from every adapter is identical before and after
 * (tests/site-capacity.test.js, tests/fixtures/usable-capacity-baseline.json).
 *
 * WHY IT HAD TO COME OUT. This is the number that sizes a build -- miner count, container count,
 * transformer, and every per-kW cost in the capex stack. The execution workspace needs it to
 * compare a target capacity against what the gas will actually sustain, and reaching it meant
 * either exporting it or writing a second one. A second capacity figure that drifts from the
 * first is worse than either, because both look authoritative and only one is on screen.
 *
 * The comment below is the original, unedited. It is the argument for the number.
 */
var SiteCapacity = (function () {
    'use strict';

    /* HOW MUCH POWER YOU CAN ACTUALLY USE, WHICH IS THE ONLY CAPACITY NUMBER THAT SIZES A BUILD.
     *
     * powerPotentialKw is a GROSS RESOURCE figure and it was being shown as though it were an
     * answer. It sizes the miner count, the container count, the transformer and the capex, and
     * on a large minority of landfills it is roughly double what the site can deliver.
     *
     * TWO THINGS SIT BETWEEN THE HEADLINE AND THE PLUG.
     *
     * 1. THE RATING IS THE IRON, NOT THE FUEL. For the 772 LMOP rows priced from EPA's published
     *    rated MW, tools/build-landfill-index.js takes the rating and never asks whether the gas
     *    supports it. Measured across the 755 of those that also publish a gas volume, the gas
     *    supports a median 131% of the rating -- but 273 of them, 36%, support LESS, and the p10
     *    supports 42%. Coastal Plains RDF is rated 6.67 MW, collects 1.927 mmscfd which is about
     *    4.01 MW, and LMOP records that it actually produced 3.38 MW. The card said 6,670 kW.
     *
     *    So the GAS drives this number, in both directions. A generator rating is a fact about
     *    equipment somebody else sized, possibly for a gas curve that has since declined; and if
     *    you are installing your own gensets you size them to the fuel, so a rating above the gas
     *    is unreachable and a rating below it is not a ceiling you have to accept.
     *
     * 2. PARASITIC LOAD, which was modelled nowhere in this codebase. A landfill gas plant spends
     *    part of its own output on the blower pulling gas from the wells, the treatment skid
     *    removing siloxanes and moisture, gas compression, and cooling. Published figures for LFG
     *    plants cluster around 8-12% of gross; wellhead gas without a siloxane train is lighter.
     *    These are the conservative middle of that band and they are configurable, because they
     *    are the difference between a container count that fits and one that does not.
     *
     * The result feeds site-engine.js as usable_kw, which is what max_miners divides, and
     * SiteCapex.stack as capacityKw, which is what every per-kW cost multiplies. Fixing it here
     * fixes the miner count, the infrastructure sizing and the capital in one place.
     *
     * A USER-ENTERED usable_kw still wins over all of this. A measurement beats a model. */
    var PARASITIC = {
        landfill_gas: 0.10,   // blower + siloxane/moisture treatment + compression + cooling
        flare_gas:    0.07,   // compression and cooling; no siloxane train
        _default:     0.07
    };
    var LFG_MW_PER_MMSCFD = 2.08;   // matches tools/build-landfill-index.js exactly

    function parasiticFor(c) {
        var t = c && c.energyType;
        return Object.prototype.hasOwnProperty.call(PARASITIC, t) ? PARASITIC[t] : PARASITIC._default;
    }

    /* The gas the FIELD delivers, where the source publishes a volume. Collected rather than
       flow-to-project on purpose: flow-to-project is what an existing plant was plumbed to take,
       which is a fact about that plant and not about the resource you would be buying. */
    function gasSupportedKw(c) {
        var sd = (c && c.sourceDetail) || {};
        var mmscfd = sd.lfgCollectedMmscfd;
        if (mmscfd === null || mmscfd === undefined || !(mmscfd > 0)) return null;
        return mmscfd * LFG_MW_PER_MMSCFD * 1000;
    }

    // { kw, basis, gross } -- kw is null only when the gross itself is unknown.
    function usableCapacity(c) {
        if (!c) return { kw: null, basis: null, gross: null };
        var gross = c.powerPotentialKw;
        if (gross === null || gross === undefined) return { kw: null, basis: null, gross: null };
        var par = parasiticFor(c);
        var gas = gasSupportedKw(c);
        /* THE BINDING CONSTRAINT, AND IT ONLY EVER BINDS DOWNWARD.
         *
         * Where a rating and a gas volume are both published they disagree in both directions:
         * across 755 LMOP rows the gas supports a median 131% of the rating, but 273 support
         * less. Taking the gas outright RAISED the headline on 441 rows and took the source
         * total to 117% of gross -- the opposite of what this number exists for.
         *
         * Gas above the rating is real, but it is upside that costs money: reaching it means
         * buying gensets for the difference. That is a capital decision and it belongs in a
         * note, not silently inside a figure somebody sizes a container order from. Gas BELOW
         * the rating is not optional -- you cannot run an engine on fuel that is not there.
         *
         * So: the lesser of the two, then parasitic. This can only ever move the number down. */
        var base = gross, basis, capped = false;
        if (gas !== null && gas < gross) {
            base = gas;
            capped = true;
            basis = 'limited by gas collected at the landfill, ' + LFG_MW_PER_MMSCFD + ' MW/mmscfd';
        } else {
            basis = (c.sourceDetail || {}).capacityBasis || 'published capacity';
        }
        return {
            kw: Math.round(base * (1 - par)),
            grossUsedKw: Math.round(base),
            parasiticPct: Math.round(par * 100),
            gasSupportedKw: gas === null ? null : Math.round(gas),
            gasCapped: capped,
            basis: basis,
            gross: gross
        };
    }

    return {
        PARASITIC: PARASITIC,
        LFG_MW_PER_MMSCFD: LFG_MW_PER_MMSCFD,
        parasiticFor: parasiticFor,
        gasSupportedKw: gasSupportedKw,
        usableCapacity: usableCapacity,
        // The thin accessor map-sourcing.js calls in fifteen places. Kept here rather than left
        // behind so there is one definition of "the usable number", not two.
        usableKwFor: function (c) { return usableCapacity(c).kw; }
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SiteCapacity;
