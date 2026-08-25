/* ===== Routes to a contact =====
 *
 * For US landfills there is no phone number to show, and no amount of code will
 * produce one. EPA's LMOP publishes the landfill and its owner's name; GHGRP adds
 * the legal parent, its ownership share and the facility address. Neither
 * publishes a telephone number, an email or a named person — verified across
 * every dataset this app ships, where the only occurrences of the word "phone"
 * are company names containing "Telephone" and notes saying none is published.
 * Alberta is different only because the AER happens to run a business associate
 * registry, and that registry is where the 482 phone numbers in operators.json
 * come from.
 *
 * So this module does the next most useful thing: it turns what IS published
 * into the shortest path to what is not. Every route is a link built from fields
 * already on the record, opened in a new tab, and each one says what it will
 * actually get you.
 *
 * THREE RULES, because a list of hopeful links is worse than none.
 *
 *   1. NOTHING IS INVENTED. A route is emitted only when every field its URL
 *      needs is present. No FRS id, no ECHO link — not a link to ECHO's search
 *      page dressed up as a facility report.
 *
 *   2. PUBLIC AND PRIVATE ARE DIFFERENT PROBLEMS. A county landfill's switchboard
 *      is reached through the authority's own name and the facility address. A
 *      Republic or WM site is reached through a corporate head office, and the
 *      facility address is actively misleading there — it is a weighbridge. The
 *      order changes accordingly, and the reason is printed.
 *
 *   3. NO ROUTE PROMISES A NUMBER. They are described by what they open, not by
 *      what you hope is inside. "Google Maps listing for the facility" is honest;
 *      "find their phone number" is not, and the first time one fails to deliver
 *      is the last time any of them get clicked.
 *
 * No API calls, no keys, no third-party account, and nothing is redistributed —
 * these are ordinary links to public pages.
 */
var ContactRoutes = (function () {
    'use strict';

    function has(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
    function t(v) { return has(v) ? String(v).trim() : null; }

    function q(s) { return encodeURIComponent(String(s)); }

    /* A plain web search, which is the honest description of what it is. Quoted
       so the exact legal name is searched as a phrase — "Prince William County,
       Department of Public Works" unquoted returns the county, not the
       department, and the department is the half that answers the phone. */
    function websearch(phrase, extra) {
        var s = '"' + String(phrase).replace(/"/g, '') + '"' + (extra ? ' ' + extra : '');
        return 'https://duckduckgo.com/?q=' + q(s);
    }

    function maps(phrase) {
        return 'https://www.google.com/maps/search/?api=1&query=' + q(phrase);
    }

    /* EPA's Enforcement and Compliance History Online. A detailed facility report
       carries the facility's mailing details and its compliance history, and the
       landfill research checklist already has a step for reading it — so this is
       the same page that workflow wants, reached in one click instead of a
       search. Needs the FRS id, which arrives with the GHGRP join. */
    function echo(frsId) {
        return 'https://echo.epa.gov/detailed-facility-report?fid=' + q(frsId);
    }

    function frs(frsId) {
        return 'https://frs-public.epa.gov/ords/frs_public2/fii_query_dtl.disp_program_facility' +
               '?p_registry_id=' + q(frsId);
    }

    function addressPhrase(d) {
        var bits = [];
        if (has(d.address)) bits.push(d.address);
        if (has(d.city)) bits.push(d.city);
        if (has(d.state)) bits.push(d.state);
        if (has(d.zip)) bits.push(d.zip);
        return bits.length ? bits.join(', ') : null;
    }

    /* opts: { name, owner, ownershipType, counterpartyType, address, city, state,
     *         zip, county, frsId, parent, operator, operatorPhone, region }
     * Returns an ordered list of { key, label, why, url }. Empty when the record
     * already carries a phone — a page of routes to something you have is noise.
     */
    function routes(opts) {
        opts = opts || {};
        if (has(opts.operatorPhone)) return [];

        var out = [];
        var owner = t(opts.owner) || t(opts.parent) || t(opts.operator);
        var name = t(opts.name);
        var city = t(opts.city);
        var state = t(opts.state);
        var county = t(opts.county);
        var frsId = t(opts.frsId);
        var addr = addressPhrase(opts);
        /* LMOP records it as the ownership of the LANDFILL, and GHGRP's parent
           string is the legal entity. "Public" means a county, a city or a waste
           authority, and that is a switchboard you can actually reach. */
        var isPublic = (t(opts.counterpartyType) === 'landfill_public') ||
                       (String(opts.ownershipType || '').toLowerCase() === 'public');

        /* THE FACILITY'S OWN LISTING FIRST, for a public site. A county landfill
           has a scalehouse with a published number and opening hours, and that
           number reaches somebody who knows the site — which a county
           switchboard often does not. It is the highest-yield link on the list
           and costs one click. */
        if (name && (addr || city)) {
            out.push({
                key: 'maps',
                label: 'Google Maps listing for the site',
                why: 'A working landfill usually has a scalehouse listing with a number and hours. ' +
                     'That number reaches somebody who knows the site.',
                url: maps(name + (addr ? ', ' + addr : ', ' + city + (state ? ', ' + state : '')))
            });
        }

        if (owner) {
            out.push({
                key: 'owner',
                label: isPublic ? 'Search the authority by its exact name'
                                : 'Search the owning company by its exact name',
                why: isPublic
                    ? 'The department name is the half that gets you past a county switchboard, ' +
                      'so it is searched as a phrase rather than as loose words.'
                    : 'The parent company, searched as a phrase. For a private operator the site ' +
                      'address is a weighbridge, not an office — this is the route that reaches a desk.',
                url: websearch(owner, isPublic ? 'phone' : 'corporate office phone')
            });
        }

        /* ECHO before FRS: the detailed facility report is a page somebody can
           read, and the FRS query is a record. Both are the same facility. */
        if (frsId) {
            out.push({
                key: 'echo',
                label: 'EPA ECHO detailed facility report',
                why: 'The facility as EPA holds it: mailing details, permits and compliance ' +
                     'history. The landfill research checklist has a step for this page.',
                url: echo(frsId)
            });
            out.push({
                key: 'frs',
                label: 'EPA Facility Registry record',
                why: 'The registry entry behind the ECHO report. Useful when the owner on file ' +
                     'and the operator on site are different companies.',
                url: frs(frsId)
            });
        }

        /* The county is the fallback that always exists for a public site, and it
           is the one route that survives a landfill with no listing, no FRS id
           and an owner string that is just a city name. */
        if (isPublic && county) {
            out.push({
                key: 'county',
                label: 'County solid waste department',
                why: 'Where the landfill is run from when the site itself has no listing.',
                url: websearch(county + (state ? ' County, ' + state : ' County'),
                               'solid waste department phone')
            });
        }

        return out;
    }

    /* Why the app has nothing to show, in one sentence, so the absence reads as a
       fact about the source rather than as a gap in the app. */
    function absenceNote(opts) {
        opts = opts || {};
        if (has(opts.operatorPhone)) return null;
        var src = t(opts.sourceKind);
        if (src === 'lmop-landfill') {
            return 'EPA publishes the owner, the ownership share and the facility address for a ' +
                   'landfill — never a phone number, an email or a named person. Alberta sites ' +
                   'carry one only because the AER runs a business associate registry.';
        }
        if (src === 'eia-facility') {
            return 'EIA publishes a mailing address and an entity type for a generating facility, ' +
                   'and no telephone number or named individual.';
        }
        return 'No public dataset here publishes a phone number for this site.';
    }

    return { routes: routes, absenceNote: absenceNote };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ContactRoutes;
