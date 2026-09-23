/* Shared hosting inventory for the map, catalogue and order flow.
 * Alberta has one existing 160 kW site, fully occupied. Every other entry is a
 * proposed site: capacity is a planning range and no ready date is confirmed.
 * Rates remain estimates; a selected site records a preference, not reserved space.
 */

var Facilities = (function () {
    'use strict';

    var SITES = [
        {
            id: 'permian',
            groupId: 'permian', groupName: 'Permian Basin',
            region: 'Texas, USA',
            name: 'Permian Basin',
            fuel: 'Flared associated gas',
            blurb: 'Proposed hosting using associated gas in the Permian Basin; site and supply arrangements remain unconfirmed.',
            capacityMinMw: .3, capacityMaxMw: .75,
            /* AN ALL-IN HOSTING RATE, not the cost of the energy. What a client pays covers
               power, cooling, network, security and hands on site, so it sits several cents
               above the raw stranded-gas cost — which is the margin the business runs on and
               is why 6-8c is the honest number to publish rather than 2-3c. */
            powerCents: 7.1,
            status: 'Coming soon',
            statusKind: 'coming-soon',
            leadTime: 'Proposed site. No commissioning date or available capacity is confirmed.',
            indicative: true
        },
        {
            id: 'bakken',
            groupId: 'bakken', groupName: 'Bakken',
            region: 'North Dakota, USA',
            name: 'Bakken',
            fuel: 'Flared associated gas',
            blurb: 'Proposed hosting using associated gas in the Bakken; site and supply arrangements remain unconfirmed.',
            capacityMinMw: .3, capacityMaxMw: .75,
            powerCents: 6.8,
            status: 'Coming soon',
            statusKind: 'coming-soon',
            leadTime: 'Proposed site. No commissioning date or available capacity is confirmed.',
            indicative: true
        },
        {
            id: 'alberta',
            groupId: 'alberta', groupName: 'Alberta',
            region: 'Alberta, Canada',
            name: 'Alberta · Existing site',
            fuel: 'Vented and flared gas',
            blurb: 'The existing Alberta hosting site has 160 kW of capacity and is fully occupied.',
            capacityMw: .16,
            powerCents: 7.4,
            status: 'Fully occupied',
            statusKind: 'full',
            leadTime: 'Waitlist open. No release date is confirmed.',
            indicative: true
        },
        {
            id: 'cold-lake',
            groupId: 'alberta', groupName: 'Alberta',
            region: 'Alberta, Canada',
            name: 'Alberta · Proposed site 1',
            fuel: 'Solution gas',
            blurb: 'A proposed Alberta site, planned at 400–600 kW. The location and supply arrangements remain unconfirmed.',
            capacityMinMw: .4, capacityMaxMw: .6,
            powerCents: 7.7,
            status: 'Coming soon',
            statusKind: 'coming-soon',
            leadTime: 'Proposed site. No commissioning date or available capacity is confirmed.',
            indicative: true
        },
        {
            id: 'alberta-expansion',
            groupId: 'alberta', groupName: 'Alberta',
            region: 'Alberta, Canada',
            name: 'Alberta · Proposed site 2',
            fuel: 'Power source to be confirmed',
            blurb: 'A second proposed Alberta site, planned at 400–600 kW. The location and supply arrangements remain unconfirmed.',
            capacityMinMw: .4, capacityMaxMw: .6,
            powerCents: null,
            status: 'Coming soon',
            statusKind: 'coming-soon',
            leadTime: 'Proposed site. No commissioning date or available capacity is confirmed.',
            indicative: true
        },
        {
            id: 'dubai',
            groupId: 'dubai', groupName: 'Dubai',
            region: 'United Arab Emirates',
            name: 'Dubai',
            fuel: 'Power source to be confirmed',
            blurb: 'Proposed hosting in Dubai; location, power supply and site specifications remain unconfirmed.',
            capacityMinMw: .3, capacityMaxMw: .75,
            powerCents: 6.5,
            status: 'Coming soon',
            statusKind: 'coming-soon',
            leadTime: 'Proposed site. No commissioning date or available capacity is confirmed.',
            indicative: true
        }
    ];

    function all() { return SITES.slice(); }
    function groups() {
        var result = [];
        SITES.forEach(function (site) {
            var group = result.find(function (item) { return item.id === site.groupId; });
            if (!group) { group = {id:site.groupId,name:site.groupName,region:site.region,sites:[]}; result.push(group); }
            group.sites.push(site);
        });
        return result;
    }
    function groupFor(site) {
        if (typeof site === 'string') site = byId(site);
        return site ? groups().find(function (group) { return group.id === site.groupId; }) || null : null;
    }

    /* Returns null for anything that is not a known id. EVERY CALLER HAS TO HANDLE THAT, because
       the id arrives in a query string that a customer can edit, and a page that renders
       "shipping to undefined" above a checkout is worse than one that renders nothing. */
    function byId(id) {
        if (typeof id !== 'string') return null;
        for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i];
        return null;
    }

    /* An existing full site and a proposed site both lack available space, but
       only the former has an operating capacity to wait for. */
    function acceptsMachines(site) {
        return !!site && site.statusKind === 'open';
    }

    /* Full is a state a site can leave. Anything not known at all is a different thing entirely
       and is handled by byId() returning null. */
    function isFull(site) {
        return !!site && site.statusKind === 'full';
    }
    function isComingSoon(site) {
        return !!site && site.statusKind === 'coming-soon';
    }
    function capacityTitle(site) { return isComingSoon(site) ? 'Planned capacity' : 'Site capacity'; }
    function actionLabel(site) {
        return acceptsMachines(site) ? 'Start mining here' : isFull(site) ? 'Join waitlist' : 'Register interest';
    }
    function availabilityNote(site) {
        if (isComingSoon(site)) return 'This is a proposed site. Capacity and timing are unconfirmed; registering interest does not reserve space or a commissioning date.';
        if (isFull(site)) return 'This site is fully occupied. Join the waitlist; space and timing must be confirmed before hosting or shipment.';
        return 'Availability and placement timing are confirmed on your hosting agreement.';
    }

    function powerLabel(site) {
        if (!site) return null;
        if (typeof site.powerCents !== 'number' || !isFinite(site.powerCents)) return 'To be confirmed';
        return site.powerCents.toFixed(1) + '¢/kWh';
    }
    function capacityLabel(site) {
        if (!site) return null;
        if (typeof site.capacityMinMw === 'number' && typeof site.capacityMaxMw === 'number')
            return Math.round(site.capacityMinMw * 1000) + '–' + Math.round(site.capacityMaxMw * 1000) + ' kW';
        if (typeof site.capacityMw !== 'number') return null;
        return Math.round(site.capacityMw * 1000) + ' kW';
    }

    /* The one sentence that has to travel with any figure from this file. Kept here rather than
       written into each page, so it cannot be shown on two surfaces and forgotten on the third. */
    var INDICATIVE_NOTE = 'Proposed capacities and hosting rates are indicative. Availability, final capacity, ' +
        'rate and timing must be confirmed on your hosting agreement.';

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
        var availability = '<p class="fac-full">' + esc(availabilityNote(site)) + '</p>';
        return '<div class="fac-chosen' + (acceptsMachines(site) ? '' : ' fac-chosen--wait') + '">' +
            '<div class="fac-chosen-head">' +
              '<div>' +
                '<div class="fac-chosen-eyebrow">' +
                  esc(isComingSoon(site) ? 'Proposed hosting preference' : 'Preferred hosting site') + '</div>' +
                '<div class="fac-chosen-name">' + esc(site.name) +
                  ' <span class="fac-chosen-region">' + esc(site.region) + '</span></div>' +
              '</div>' + change +
            '</div>' +
            '<dl class="fac-chosen-spec">' +
              '<div class="fac-row"><dt>' + esc(capacityTitle(site)) + '</dt><dd>' + esc(capacityLabel(site)) + '</dd></div>' +
              '<div class="fac-row"><dt>Est. hosting rate</dt><dd>' + powerCell + '</dd></div>' +
              '<div class="fac-row"><dt>Status</dt><dd>' + esc(site.status) + '</dd></div>' +
              '<div class="fac-row"><dt>Energy</dt><dd>' + esc(site.fuel) + '</dd></div>' +
            '</dl>' + availability + lead +
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
        groups: groups,
        groupFor: groupFor,
        byId: byId,
        acceptsMachines: acceptsMachines,
        isFull: isFull,
        isComingSoon: isComingSoon,
        capacityTitle: capacityTitle,
        actionLabel: actionLabel,
        availabilityNote: availabilityNote,
        powerLabel: powerLabel,
        capacityLabel: capacityLabel,
        INDICATIVE_NOTE: INDICATIVE_NOTE
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Facilities;
