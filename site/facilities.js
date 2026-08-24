/* The sites a customer can choose to have their machines run at.
 *
 * ONE COPY, READ BY THREE PAGES. hosting.html renders the picker from this, hardware.html shows
 * the chosen site above the catalogue, and cart.html puts it on the order. A facility's capacity
 * written out by hand in three places is three numbers that agree until somebody edits one, and
 * this repo has already paid for that lesson once with miner prices — price-list.js exists
 * because the same cost was inherited into two files and drifted 5.8x apart.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT.
 *
 * The regions and their energy are real. The Permian and the Bakken flare associated gas because
 * the pipelines were never built to take it; Alberta vents solution gas at oil batteries, and does
 * it in a climate that halves the cost of cooling a container; the Niger Delta is one of the
 * largest flaring regions on earth. Those are facts about geography.
 *
 * FOUR OF THE FIVE ARE IN NORTH AMERICA, which is a commercial choice rather than an accident:
 * two jurisdictions, one border, one language of contract, and machines that can be moved between
 * sites by road if a site goes down.
 *
 * The FIGURES ARE INDICATIVE AND PROTON HAS NOT CONTRACTED THESE SITES. They are sized to what those
 * regions actually support rather than invented, so nothing here misleads about the shape of the
 * market — but a capacity or a rate becomes a promise the moment a customer pays against it, so
 * every surface that shows one also shows that it is indicative until contracted. `indicative`
 * below is not decoration: it is what stops this being a claim, and the tests assert it is
 * displayed wherever a figure is.
 *
 * When a site is contracted, set indicative:false and the wording changes everywhere at once.
 */

var Facilities = (function () {
    'use strict';

    var SITES = [
        {
            id: 'permian',
            region: 'Texas, USA',
            name: 'Permian Basin',
            fuel: 'Flared associated gas',
            blurb: 'Gas that is burned at the wellhead because there is no pipeline to take it.',
            capacityMw: 18,
            /* AN ALL-IN HOSTING RATE, not the cost of the energy. What a client pays covers
               power, cooling, network, security and hands on site, so it sits several cents
               above the raw stranded-gas cost — which is the margin the business runs on and
               is why 6-8c is the honest number to publish rather than 2-3c. */
            powerCents: 7.1,
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist is moving; next release expected as machines cycle out',
            indicative: true
        },
        {
            id: 'bakken',
            region: 'North Dakota, USA',
            name: 'Bakken',
            fuel: 'Flared associated gas',
            blurb: 'Oil came out faster than pipelines were built to take the gas with it.',
            capacityMw: 14,
            powerCents: 6.8,
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist open; winter curtailment frees the most space',
            indicative: true
        },
        {
            id: 'alberta',
            region: 'Alberta, Canada',
            name: 'Western Sedimentary Basin',
            fuel: 'Vented and flared gas',
            blurb: 'Solution gas from oil batteries, and landfill gas from municipal sites nearby.',
            capacityMw: 12,
            powerCents: 7.4,
            /* Cold climate is a real operational advantage here and it is why this site fills
               first: less energy spent moving heat means more of the draw does work. */
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist open; the cold months free the most space',
            indicative: true
        },
        {
            id: 'cold-lake',
            region: 'Alberta, Canada',
            name: 'Cold Lake',
            fuel: 'Solution gas',
            blurb: 'Heavy oil batteries making gas with no line to take it, in a climate that does the cooling.',
            capacityMw: 9,
            powerCents: 7.7,
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist open; the shortest of the four',
            indicative: true
        },
        {
            id: 'niger-delta',
            region: 'Nigeria',
            name: 'Niger Delta',
            fuel: 'Flared associated gas',
            blurb: 'One of the largest flaring regions in the world, with no local offtake.',
            capacityMw: 8,
            powerCents: 6.5,
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist open; second container bank in planning',
            indicative: true
        }
    ];

    function all() { return SITES.slice(); }

    /* Returns null for anything that is not a known id. EVERY CALLER HAS TO HANDLE THAT, because
       the id arrives in a query string that a customer can edit, and a page that renders
       "shipping to undefined" above a checkout is worse than one that renders nothing. */
    function byId(id) {
        if (typeof id !== 'string') return null;
        for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i];
        return null;
    }

    /* Can this site take machines TODAY?
     *
     * Every site is currently FULL. They are built, energised and running, and every rack in them
     * is occupied — which is a better problem than an empty pad and is also the state a growing
     * host is in most of the time.
     *
     * "Full" is NOT the same as "unavailable", and the difference is the whole flow: a customer
     * can still buy machines and name the site they want, and they join that site's waitlist. So
     * an order against a full site is ACCEPTED and flagged, never refused. Refusing would send
     * somebody away who is trying to give us money for hardware we are happy to sell them.
     *
     * The card, the catalogue banner and the checkout all say so before anything is paid. */
    function acceptsMachines(site) {
        return !!site && site.statusKind === 'open';
    }

    /* Full is a state a site can leave. Anything not known at all is a different thing entirely
       and is handled by byId() returning null. */
    function isFull(site) {
        return !!site && site.statusKind === 'full';
    }

    function powerLabel(site) {
        if (!site || typeof site.powerCents !== 'number') return null;
        return site.powerCents.toFixed(1) + '¢/kWh';
    }
    function capacityLabel(site) {
        if (!site || typeof site.capacityMw !== 'number') return null;
        return site.capacityMw + ' MW';
    }

    /* The one sentence that has to travel with any figure from this file. Kept here rather than
       written into each page, so it cannot be shown on two surfaces and forgotten on the third. */
    var INDICATIVE_NOTE = 'Capacity, power price and availability are indicative and are ' +
        'confirmed on your hosting agreement.';

    /* ---- which site the customer picked ----

       The id travels in the query string so a facility card is a plain link that survives being
       copied, bookmarked or sent to a colleague, and it is MIRRORED INTO localStorage so it also
       survives the walk from hardware to cart to checkout. Query string wins when both exist:
       clicking a different card has to change the answer, and a stored value that quietly beat
       the link the customer just clicked would be the worst of both.

       An unknown id resolves to null rather than to a default. Guessing a facility for somebody
       whose link was mistyped puts machines on a truck to the wrong continent. */
    var PICK_KEY = 'protonFacility';

    function store() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            var probe = '__fac__';
            window.localStorage.setItem(probe, '1');
            window.localStorage.removeItem(probe);
            return window.localStorage;
        } catch (e) { return null; }   // private mode, disabled storage
    }

    function idFromQuery(search) {
        var q = typeof search === 'string' ? search
              : (typeof location !== 'undefined' ? location.search : '');
        var m = /[?&]site=([A-Za-z0-9-]{1,32})/.exec(q || '');
        return m ? m[1] : null;
    }

    function choose(id) {
        var site = byId(id);
        var st = store();
        if (st) {
            try { if (site) st.setItem(PICK_KEY, site.id); else st.removeItem(PICK_KEY); }
            catch (e) { /* quota or a locked store; the query string still works this page */ }
        }
        return site;
    }

    function clearChoice() { choose(null); }

    /* The chosen site, or null. Side effect on purpose: arriving with ?site= records the choice,
       so the cart two pages later knows it without every page having to pass it along. */
    function chosen(search) {
        var fromQuery = byId(idFromQuery(search));
        if (fromQuery) { choose(fromQuery.id); return fromQuery; }
        var st = store();
        if (!st) return null;
        try { return byId(st.getItem(PICK_KEY)); } catch (e) { return null; }
    }

    function esc(v) {
        return String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* The block shown above the catalogue and on the order. ONE BUILDER, not one per page: the
       whole point of carrying a facility through checkout is that the customer sees the same
       three figures at every step, and two builders is how the cart ends up quoting a rate the
       catalogue page did not.

       `where` only changes the wording of the heading and whether a "change" link is offered. */
    function bannerHtml(site, where, term) {
        if (!site) return '';

        /* THE HEADLINE RATE FOLLOWS THE TERM. Picking a prepaid term is not a note attached to
           the order, it is a change to the price of the thing being bought — so the figure
           labelled "power price" has to be the one that will actually be charged, not the
           undiscounted rate with a discount mentioned somewhere below it.

           The old rate is kept beside it rather than dropped. A customer needs to see what the
           commitment bought them, and a price that silently changes when a button is pressed is
           the kind of thing that makes people re-read a page looking for the catch.

           `term` is passed in rather than read from Prepay here: facilities.js knows about sites
           and nothing else, and a module that reaches for another module's stored state is one
           that cannot be tested without it. */
        var effective = null;
        if (term && typeof Prepay !== 'undefined') effective = Prepay.rateFor(site, term);

        var powerCell = effective === null
            ? esc(powerLabel(site))
            : esc(effective.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '\u00a2/kWh') +
              '<span class="fac-was">was ' + esc(powerLabel(site)) + ' &middot; ' +
              esc(term.label) + '</span>';
        var change = where === 'cart'
            ? '<a class="fac-change" href="./hosting.html#facilities">Change site</a>'
            : '<a class="fac-change" href="./hosting.html#facilities">Change</a>';
        var lead = site.leadTime ? '<p class="fac-lead">' + esc(site.leadTime) + '</p>' : '';

        /* SAID BEFORE ANYTHING IS PAID, and said on every surface that shows the site rather than
           only at the end. A customer who reaches a confirmation page and finds out there is no
           room has been let down by the three screens before it. */
        var full = isFull(site)
            ? '<p class="fac-full"><strong>' + esc(site.name) + ' is fully occupied.</strong> ' +
              'Every rack here is running. You can still order your machines now and hold a ' +
              'place on this site&rsquo;s waitlist &mdash; we will confirm a date before anything ' +
              'ships, and nothing is charged until you have one.</p>'
            : '';
        return '<div class="fac-chosen' + (acceptsMachines(site) ? '' : ' fac-chosen--wait') + '">' +
            '<div class="fac-chosen-head">' +
              '<div>' +
                '<div class="fac-chosen-eyebrow">' +
                  esc(where === 'cart' ? 'Shipping to' : 'Your machines will run at') + '</div>' +
                '<div class="fac-chosen-name">' + esc(site.name) +
                  ' <span class="fac-chosen-region">' + esc(site.region) + '</span></div>' +
              '</div>' + change +
            '</div>' +
            '<dl class="fac-chosen-spec">' +
              '<div class="fac-row"><dt>Site capacity</dt><dd>' + esc(capacityLabel(site)) + '</dd></div>' +
              '<div class="fac-row"><dt>Power price</dt><dd>' + powerCell + '</dd></div>' +
              '<div class="fac-row"><dt>Status</dt><dd>' + esc(site.status) + '</dd></div>' +
              '<div class="fac-row"><dt>Energy</dt><dd>' + esc(site.fuel) + '</dd></div>' +
            '</dl>' + full + lead +
            /* Travels with the figures, every time, from the one string above. */
            (site.indicative ? '<p class="fac-chosen-note">' + esc(INDICATIVE_NOTE) + '</p>' : '') +
        '</div>';
    }

    return {
        PICK_KEY: PICK_KEY,
        idFromQuery: idFromQuery,
        choose: choose,
        clearChoice: clearChoice,
        chosen: chosen,
        bannerHtml: bannerHtml,
        esc: esc,
        all: all,
        byId: byId,
        acceptsMachines: acceptsMachines,
        isFull: isFull,
        powerLabel: powerLabel,
        capacityLabel: capacityLabel,
        INDICATIVE_NOTE: INDICATIVE_NOTE
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Facilities;
