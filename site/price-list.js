/* ===== ION MINING GROUP — indicative hardware prices =====

   The one place a quotable price is written. Separated from miner-db.js on
   purpose: that file is the app's SPEC table, and hashrate and draw do not
   change once a machine ships. Prices change weekly, and letting one file carry
   both meant a commercial number was living inside something nobody thought of
   as a price sheet.

   WHAT THIS LIST IS. Every figure below was inherited from miner-db.js, where it
   was labelled "cost (USD approx.)" with no date and no source. Across
   same-generation machines it spans 5.8x in dollars per terahash — from $6.2/TH
   to $36.2/TH — which is not a market spread but entries priced at different
   times and never reconciled. The per-TH figure is written beside each row so
   the outliers are visible while that work is done.

   SO IT IS PRESENTED AS INDICATIVE, AND THE PAGE SAYS SO. Ion brokers rather
   than holds stock, so a price is confirmed against a distributor per order
   anyway; nothing here is a commitment. hardware.html states ASOF beside the
   catalogue, and hardware-suite.js fails if that date is missing or does not
   reach the page.

   TO REFRESH: change the numbers and move ASOF. Nothing else reads them. */

var PriceList = (function () {

    /* THE DEPOSIT RATE IS A COMMERCIAL TERM AND IT HAS NOT BEEN CONFIRMED.

       It lives here rather than in cart.js because it belongs to the same
       category as the prices: a number that binds only once it is on a quote.
       The checkout shows it, and labels it indicative for exactly the reason
       the prices are indicative — it is a share of a total that is itself
       confirmed per order.

       0.25 is a placeholder drawn from what the market does (OneMiners sells
       at 25% down). Confirm it before this page is published. Changing it here
       changes every figure and every caption on the checkout. */
    var DEPOSIT_RATE = 0.25;

    /* Move this whenever a price moves. It is printed on the page. */
    var ASOF = '2026-08-21';

    /* Ordered by efficiency, best first — the same order the catalogue uses,
       because J/TH is what decides the running cost of a hosted machine. */
    var PRICES = [
        { model: "Antminer S21 XP Hyd.",       usd:  13500 },   // $28.5/TH
        { model: "Antminer S21 XP",            usd:   3010 },   // $11.1/TH
        { model: "Antminer S21+ Hyd.",         usd:   2649 },   // $6.7/TH
        { model: "Antminer S21 Pro",           usd:   4260 },   // $18.2/TH
        { model: "Whatsminer M66S++",          usd:  12500 },   // $35.9/TH
        { model: "Whatsminer M60S++",          usd:   6500 },   // $29.5/TH
        { model: "Antminer S21 Hyd.",          usd:   9000 },   // $26.9/TH
        { model: "Antminer S21+",              usd:   2204 },   // $10.2/TH
        { model: "Avalon A15 Pro",             usd:   3403 },   // $15.4/TH
        { model: "Antminer S21e Hyd.",         usd:   2070 },   // $6.2/TH
        { model: "Whatsminer M66S+",           usd:  11500 },   // $36.2/TH
        { model: "Avalon A1566I",              usd:   4385 },   // $16.8/TH
        { model: "Antminer S21",               usd:   3200 },   // $16.0/TH
        { model: "Whatsminer M66S",            usd:  10500 },   // $35.2/TH
        { model: "Whatsminer M60S",            usd:   5250 },   // $28.2/TH
        { model: "Avalon A1566",               usd:   2276 },   // $12.3/TH
        { model: "Antminer T21",               usd:   2394 },   // $12.6/TH
        { model: "Whatsminer M60",             usd:   4650 },   // $27.0/TH
        { model: "Antminer S19 XP Hyd.",       usd:   6000 },   // $23.3/TH
        { model: "Antminer S19 XP",            usd:   2500 },   // $17.9/TH
        { model: "Avalon A1466",               usd:   2750 },   // $18.3/TH
        { model: "Whatsminer M56S++",          usd:   8000 },   // $31.5/TH
        { model: "Whatsminer M50S++",          usd:   4000 },   // $25.0/TH
        { model: "Antminer S19k Pro",          usd:   3000 },   // $25.0/TH
        { model: "Avalon A1446",               usd:   2450 },   // $18.1/TH
        { model: "Whatsminer M50S",            usd:   3150 },   // $24.6/TH
        { model: "Antminer S19j Pro+",         usd:   2400 },   // $20.0/TH
        { model: "Antminer S19 Pro",           usd:   2200 },   // $20.0/TH
    ];

    var byModel = {};
    PRICES.forEach(function (p) { byModel[p.model] = p.usd; });

    /* null rather than 0 for a machine with no price on file: zero would read
       as free, and the page has to be able to tell the difference. */
    function priceFor(model) {
        return Object.prototype.hasOwnProperty.call(byModel, model) ? byModel[model] : null;
    }

    return { ASOF: ASOF, DEPOSIT_RATE: DEPOSIT_RATE,
             priceFor: priceFor, all: function () { return PRICES.slice(); } };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PriceList;
