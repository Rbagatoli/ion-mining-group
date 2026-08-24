/* Prepaid electricity: the longer you commit, the lower the rate.
 *
 * A hosting client's largest running cost is power, and its biggest risk is that power costs more
 * next year than it does this year.
 *
 * WHAT A PREPAY LOCKS IS THE DISCOUNT, NOT THE RATE. The rate floats: it is indexed to gas and
 * CPI, and the discount applies to whatever the prevailing rate is when the client is billed.
 * This is the whole commercial shape of the product and it is easy to state backwards — an
 * earlier version of this file said a prepay bought "a number that cannot move", which would
 * have been Proton carrying years of input-cost risk at a fixed sale price.
 *
 * THE DISCOUNT IS A FUNCTION OF THE TERM, NOT OF THE SITE. Every site publishes its own rate,
 * and the same ladder applies to all of them — a 36-month prepay is 12% off wherever it is
 * bought. That keeps one commercial policy instead of five, and it means adding a site cannot
 * silently create a better deal than the one the sales page describes.
 *
 * THE SCHEDULE IS A COMMERCIAL TERM AND IS NOT CONFIRMED. Like DEPOSIT_RATE in price-list.js,
 * these percentages are a decision for the business rather than a fact about the world, and they
 * are the numbers a customer would be paying against. They are marked indicative wherever they
 * are shown, and `CONFIRMED` below flips the wording everywhere at once when they are agreed.
 *
 * WHAT IS PREPAID IS ELECTRICITY, NOT SERVICE. Hosting, pad and maintenance fees are billed
 * monthly throughout the term and are not part of a prepay. Hardware is bought separately and is
 * not part of it either.
 *
 * UNRESOLVED, AND FLAGGED RATHER THAN PAPERED OVER: the rate this discount multiplies is
 * published as an ALL-IN figure — facilities.js:41 and hosting.html:502 both say it covers
 * power, cooling, network and remote hands with no management fee on top. "Electricity only"
 * and "all-in" cannot both be true of the same number. Splitting the published rate into energy
 * and service is a commercial decision that changes the price on every site card, so it is not
 * made here. Until it is, the ladder discounts an all-in rate while the page says it discounts
 * electricity.
 */

var Prepay = (function () {
    'use strict';

    /* Not yet agreed with the business. Set true and the wording changes on every surface. */
    var CONFIRMED = false;

    /* `months` is what the customer is quoted and `years` is what the arithmetic uses. Both are
       stored rather than one derived from the other, so a term can never be advertised as one
       length and billed as another; the suite asserts months === years * 12.

       `featured` marks the tier the ladder highlights. It used to be inferred from the duration
       — hardware.js tested `t.years >= 7` — which meant removing the seven-year tier silently
       left the hardware ladder with nothing highlighted while the bar on the hosting page
       highlighted its last segment. Which tier is featured is a commercial choice and belongs
       next to the discounts, not in two renderers that have to agree by coincidence. */
    var TERMS = [
        { id: '12m', months: 12, years: 1, discount: 0.04,
          label: '12 months prepaid', note: 'Entry term' },
        { id: '24m', months: 24, years: 2, discount: 0.08,
          label: '24 months prepaid', note: 'Mid term' },
        { id: '36m', months: 36, years: 3, discount: 0.12,
          label: '36 months prepaid', note: 'Longest term', featured: true }
    ];

    /* The one a client is steered to when nothing is chosen. Deliberately the middle term rather
       than the longest: three years of power paid up front is a serious commitment, and a page
       that defaults to it is selling rather than advising.

       THE IDS CHANGED when the ladder did (1y/3y/7y -> 12m/24m/36m). A client carrying an old id
       in local storage resolves to null and is shown as having chosen nothing, which is the
       honest outcome — mapping '7y' onto the longest surviving term would move somebody onto a
       commitment they never agreed to. Orders already written keep their old id as a record of
       what was actually sold. */
    var DEFAULT_ID = '24m';

    /* Hours a machine draws in a year. 8,760 is the whole year at continuous draw, which is how a
       power contract is sized and how the prepaid sum has to be calculated — a prepay is a fixed
       amount, so it is bought against the full period rather than against expected uptime.
       Curtailment and downtime come back as credit on the statement, not as a smaller cheque. */
    var HOURS_PER_YEAR = 8760;

    function all() { return TERMS.slice(); }

    function byId(id) {
        if (typeof id !== 'string') return null;
        for (var i = 0; i < TERMS.length; i++) if (TERMS[i].id === id) return TERMS[i];
        return null;
    }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    /* The discounted rate for a site on a term, in cents per kWh.
     *
     * Returns null rather than a number when either input is missing. A rate is the thing a
     * customer signs against, so a plausible-looking figure derived from half the inputs is worse
     * than an empty space. */
    function rateFor(site, term) {
        if (!site || !term) return null;
        if (!isNum(site.powerCents) || !isNum(term.discount)) return null;
        /* Rounded to four decimal places of a cent, which is finer than anyone bills but is what
           keeps 5.8 x 0.7 from displaying as 4.0599999999999996. */
        return Math.round(site.powerCents * (1 - term.discount) * 10000) / 10000;
    }

    /* Cents/kWh as dollars, which is the unit the industry quotes: $0.0406 per kWh. */
    function rateUsd(site, term) {
        var c = rateFor(site, term);
        return c === null ? null : Math.round(c / 100 * 1e6) / 1e6;
    }

    /* What the whole term costs up front, for a given continuous draw in kilowatts.
     *
     * kW x hours x years x $/kWh. Rounded to the cent at the END, once — rounding the rate first
     * and multiplying by a five-figure number of hours turns a rounding error into real money. */
    function totalFor(site, term, kw) {
        var usdPerKwh = rateUsd(site, term);
        if (usdPerKwh === null || !isNum(kw) || kw <= 0) return null;
        return Math.round(usdPerKwh * kw * HOURS_PER_YEAR * term.years * 100) / 100;
    }

    /* What the same power would cost over the same term at the undiscounted rate, and the
     * difference. Shown because a percentage is an argument and a dollar figure is a reason. */
    function savingFor(site, term, kw) {
        if (!site || !term || !isNum(site.powerCents) || !isNum(kw) || kw <= 0) return null;
        var full = site.powerCents / 100 * kw * HOURS_PER_YEAR * term.years;
        var paid = totalFor(site, term, kw);
        if (paid === null) return null;
        return Math.round((full - paid) * 100) / 100;
    }

    function pctLabel(term) {
        return term && isNum(term.discount) ? Math.round(term.discount * 100) + '%' : null;
    }

    /* $0.0406 per kWh — four significant decimals, matching how the market quotes it. */
    function rateLabel(site, term) {
        var u = rateUsd(site, term);
        if (u === null) return null;
        return '$' + u.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') + ' per kWh';
    }

    /* ---- which term the customer picked ----

       Remembered the same way the facility is, and for the same reason: the choice is made on the
       catalogue page and has to still be true two pages later at the checkout. Unlike the site it
       does NOT travel in the query string — a term is picked here, not linked to from anywhere,
       and a URL parameter would be one more thing that can disagree with what is on screen.

       An unknown id resolves to null, never to a default. Quietly falling back to the longest
       term would put a customer on a three-year commitment they did not choose — and every id
       from the previous ladder is now an unknown id. */
    var PICK_KEY = 'protonPrepay';

    function store() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            var probe = '__pp__';
            window.localStorage.setItem(probe, '1');
            window.localStorage.removeItem(probe);
            return window.localStorage;
        } catch (e) { return null; }
    }

    function choose(id) {
        var term = byId(id);
        var st = store();
        if (st) {
            try { if (term) st.setItem(PICK_KEY, term.id); else st.removeItem(PICK_KEY); }
            catch (e) { /* quota or a locked store */ }
        }
        return term;
    }

    /* Null when nothing has been chosen. NOT the default term — "no prepay" is a real answer
       and is what a client who wants to pay monthly has selected by not selecting. */
    function chosen() {
        var st = store();
        if (!st) return null;
        try { return byId(st.getItem(PICK_KEY)); } catch (e) { return null; }
    }

    function clearChoice() { choose(null); }

    /* ---- what the customer is actually paying for ----

       ONE BUILDER FOR BOTH PAGES. The catalogue and the checkout show the same two costs, and
       two implementations of "hardware plus electricity" is how a page ends up quoting a total
       the next page disagrees with.

       THE TWO ARE NOT ADDED INTO A SINGLE PRICE, and that is the substance of this rather than
       its layout. They are separate purchases on separate schedules: the hardware is a deposit
       now and a balance before shipping, the electricity is bought forward when the hosting
       agreement is signed. A combined figure would be a number the customer never writes a
       cheque for, and it would bury the fact that the larger of the two is a multi-year
       commitment rather than a machine order.

       Returns '' when there is no hosting site, because then there is nothing to itemise
       against — a customer shipping to their own address buys hardware and nothing else here.
    */
    function itemisedHtml(opts) {
        var site = opts.site, term = opts.term;
        var hardware = opts.hardwareUsd, kw = opts.kw, depositRate = opts.depositRate;

        if (typeof hardware !== 'number' || !isFinite(hardware)) return '';

        var rows = [];
        rows.push({
            label: 'Machines',
            sub: (opts.units || 0) + ' machine' + (opts.units === 1 ? '' : 's') +
                 ', indicative until quoted',
            value: hardware,
            when: depositRate
                ? Math.round(depositRate * 100) + '% deposit now, balance before they ship'
                : 'deposit now, balance before they ship'
        });

        var power = (site && term) ? totalFor(site, term, kw) : null;
        if (power !== null) {
            rows.push({
                label: 'Electricity, ' + term.label.toLowerCase(),
                /* AT TODAY'S RATE, said out loud. The rate floats with gas and CPI and only the
                   discount is fixed, so this sum is a projection rather than a price. It is the
                   number a customer plans against, and leaving it looking like a quote would be
                   the one place the breakdown still misleads. */
                sub: rateLabel(site, term) + ' at ' + site.name +
                     ', ' + term.months + ' months at continuous draw, at today' + APOS + 's rate',
                value: power,
                when: 'due when the hosting agreement is signed'
            });
        }

        var body = rows.map(function (r) {
            return '<div class="it-row">' +
                '<div class="it-what"><span class="it-lab">' + esc(r.label) + '</span>' +
                    '<span class="it-sub">' + esc(r.sub) + '</span></div>' +
                '<div class="it-money"><span class="it-val">' + money(r.value) + '</span>' +
                    '<span class="it-when">' + esc(r.when) + '</span></div>' +
            '</div>';
        }).join('');

        /* The sum is shown, and immediately qualified. Leaving it out entirely would be the
           other kind of dishonest: a customer comparing hosts wants to know what the whole
           thing costs, and making them add two numbers up is not candour. */
        var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
        var total = rows.length > 1
            ? '<div class="it-row it-row--total">' +
                '<div class="it-what"><span class="it-lab">Both together</span>' +
                    '<span class="it-sub">not a single payment &mdash; see the timings above</span></div>' +
                '<div class="it-money"><span class="it-val">' + money(sum) + '</span></div>' +
              '</div>'
            : '';

        return '<div class="itemised">' +
            '<div class="it-head">What you are paying for</div>' + body + total + '</div>';
    }

    function money(v) {
        if (typeof v !== 'number' || !isFinite(v)) return '&mdash;';
        return '$' + Math.round(v).toLocaleString('en-US');
    }

    var APOS = String.fromCharCode(8217);

    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var INDICATIVE_NOTE = CONFIRMED
        ? 'Prepaid rates are fixed for the term of your hosting agreement.'
        : 'Prepaid rates and discounts are indicative and are fixed on your hosting agreement. ' +
          'Nothing is charged until the agreement is signed.';

    return {
        CONFIRMED: CONFIRMED,
        HOURS_PER_YEAR: HOURS_PER_YEAR,
        DEFAULT_ID: DEFAULT_ID,
        INDICATIVE_NOTE: INDICATIVE_NOTE,
        PICK_KEY: PICK_KEY,
        choose: choose,
        chosen: chosen,
        clearChoice: clearChoice,
        itemisedHtml: itemisedHtml,
        all: all,
        byId: byId,
        rateFor: rateFor,
        rateUsd: rateUsd,
        totalFor: totalFor,
        savingFor: savingFor,
        pctLabel: pctLabel,
        rateLabel: rateLabel
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Prepay;
