/* ===== PROTON MINING — Public site behaviour =====
   No dependencies. Everything degrades gracefully without JS:
   the nav links are real links, and the forms fall back to the
   plain mailto address printed beside them. */

/* Shared, local-only enquiry drafts. Long text is kept whole for explicit copy/paste. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ProtonMailDraft = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    var regions = new WeakMap();
    function compose(to, subject, body) {
        if (!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(to)) throw Error('Use the email address shown on this page.');
        var prefix = 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=';
        var href = prefix + encodeURIComponent(body), long = href.length > 1800;
        if (long) href = prefix + encodeURIComponent('I have prepared an enquiry on protonminingco.com.\n\n[Paste the complete enquiry copied from the website here before sending.]');
        return { to: to, subject: subject, body: body, href: href, long: long };
    }
    function campaign(location) {
        var params = new URLSearchParams(location.search || ''), lines = [];
        [['utm_source', 'Campaign source', 120], ['utm_medium', 'Campaign medium', 120], ['utm_campaign', 'Campaign name', 180]].forEach(function (item) {
            var value = (params.get(item[0]) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, item[2]);
            if (value) lines.push(item[1] + ': ' + value);
        });
        if (lines.length && location.pathname) lines.push('Enquiry page: ' + location.pathname.slice(0, 320));
        return lines.length ? ['Campaign context from the page URL:'].concat(lines) : [];
    }
    function open(w, form, to, subject, body) {
        var draft = compose(to, subject, body), previous = regions.get(form);
        if (!draft.long) {
            if (previous) previous.region.hidden = true;
            w.location.href = draft.href;
            return { opened: true, long: false };
        }
        var d = w.document, view = previous;
        if (!view) {
            var region = d.createElement('div'); region.className = 'field inquiry-email-draft';
            var heading = d.createElement('p'); heading.className = 'form-note';
            heading.textContent = 'Your enquiry is longer than some email apps accept. Copy the complete text below, open the email draft, then paste it before sending. This email has not been sent.';
            var label = d.createElement('label'); label.textContent = 'Complete enquiry text';
            var textarea = d.createElement('textarea'); textarea.readOnly = true; textarea.rows = 8; textarea.setAttribute('aria-label', 'Complete enquiry text'); label.append(textarea);
            var actions = d.createElement('div'); actions.className = 'btn-row';
            var copy = d.createElement('button'); copy.type = 'button'; copy.className = 'btn btn--ghost'; copy.textContent = 'Copy complete enquiry';
            var link = d.createElement('a'); link.className = 'btn btn--primary'; link.textContent = 'Open email draft ↗';
            var status = d.createElement('p'); status.className = 'form-note'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            copy.addEventListener('click', async function () {
                try {
                    if (!w.navigator?.clipboard?.writeText) throw Error('Clipboard unavailable');
                    await w.navigator.clipboard.writeText(textarea.value);
                    status.textContent = 'Complete enquiry copied. Paste it into your email draft and send it from your mail app.';
                } catch (_) {
                    textarea.focus(); textarea.select();
                    status.textContent = 'Select and copy the complete text above, then paste it into your email draft.';
                }
            });
            actions.append(copy, link); region.append(heading, label, actions, status); form.append(region);
            view = { region: region, textarea: textarea, link: link, status: status }; regions.set(form, view);
        }
        view.region.hidden = false; view.textarea.value = draft.body; view.link.href = draft.href; view.status.textContent = '';
        view.textarea.focus();
        return { opened: false, long: true };
    }
    return { compose: compose, campaign: campaign, open: open };
});

(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    /* --- Sticky nav gets a hairline once you scroll past the top --- */
    var nav = document.querySelector('.nav');
    if (nav) {
        var onScroll = function () {
            nav.classList.toggle('is-stuck', window.scrollY > 8);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }
    /* --- Mobile nav --- */
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (toggle && links) {
        toggle.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        links.addEventListener('click', function (e) {
            if (e.target.tagName === 'A') {
                links.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* --- Reveal on scroll --- */
    var targets = document.querySelectorAll('.reveal');
    if (targets.length) {
        if (!('IntersectionObserver' in window)) {
            for (var i = 0; i < targets.length; i++) targets[i].classList.add('in');
        } else {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('in');
                    io.unobserve(entry.target);
                });
            /* THRESHOLD 0, NOT 0.06, AND THIS IS NOT A TUNING PREFERENCE.

               A ratio threshold asks what FRACTION of an element is inside the root. The root
               here is the viewport shrunk 8%, so on a phone it is about 776px tall, and 6% of
               an element can only ever fit inside 776px if the element is under ~12,900px.
               Anything taller can never satisfy it at any scroll position: it stays at
               opacity 0 permanently, and .reveal starts at opacity 0.

               That is not hypothetical. who-carries-which-risk-in-a-stranded-gas-deal.html is
               one .bp.reveal 15,385px tall, and every one of its 20,642 characters was
               invisible on a phone — a published page rendering nothing but a nav and a
               footer. It only escaped notice because prefers-reduced-motion resets .reveal to
               opacity 1, so anyone testing with reduced motion saw a correct page.

               With threshold 0 an element reveals the instant any part of it crosses the root,
               so its height can never make the trigger unreachable. The bottom margin goes to
               -12% to hold the trigger point for short elements roughly where it was. */
            }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
            targets.forEach(function (el) { io.observe(el); });
        }
    }

    /* --- Hosting: the detail slider ---
       Two diagrams share one grid cell. The slider writes --d on the wrapper,
       CSS cross-dissolves them, and whichever side of the midpoint we are on
       becomes the interactive one. The other is made inert so it does not sit
       in the tab order or the accessibility tree while it is invisible —
       fourteen callout bubbles and six buttons behind a faded panel is a
       genuinely unpleasant thing to tab through. Both diagrams stay mounted
       and keep their own view state, so sliding back finds the container
       exactly as you left it. */
    /* EVERY slider on the page, each scoped to its own pane. This used to look
       up #dgScale and #dgViews once, which was true while a page could only
       ever carry one pair. energy.html now carries two behind a fuel switch,
       so a single lookup would drive the first pair and leave the second one
       dead — and a document-wide .dg-scale-end query would light up the hidden
       pane's labels from the visible pane's slider. */
    var scales = document.querySelectorAll('.dg-scale-input');
    Array.prototype.forEach.call(scales, function (scale) {
        var scope = (scale.closest && scale.closest('.dg-fuel-pane')) || document;
        var views = scope.querySelector('.dg-views');
        if (!views) return;
        var ends = scope.querySelectorAll('.dg-scale-end');
        var panes = views.querySelectorAll('.dg-wrap');

        /* Which two views these are is read off the page, not written here.
           This used to test for the literal 'cont' and 'asic', which was fine
           while the hosting page was the only slider on the site. The energy
           page's pair is 'now' and 'ion', and against hardcoded names NEITHER
           pane would ever match: the crossfade would still run, so it would
           look right, but both panes would be left inert and nothing would drag,
           zoom or hover. */
        var keys = [];
        for (var k = 0; k < panes.length; k++) keys.push(panes[k].getAttribute('data-view'));
        var LO = keys[0], HI = keys[keys.length - 1];

        var applyScale = function () {
            var d = (parseFloat(scale.value) || 0) / 100;
            views.style.setProperty('--d', d.toFixed(3));

            var atLo = d < 0.5;
            var view = atLo ? LO : HI;
            views.setAttribute('data-view', view);
            /* Positional twin of the above, so stylesheet rules that care only
               about which END we are at do not have to know the view names. */
            views.setAttribute('data-at', atLo ? 'lo' : 'hi');

            for (var i = 0; i < panes.length; i++) {
                var on = panes[i].getAttribute('data-view') === view;
                panes[i].classList.toggle('is-on', on);
                // Supported everywhere current; where it is not, the only cost
                // is a few extra tab stops.
                if ('inert' in panes[i]) panes[i].inert = !on;
            }
            for (var e = 0; e < ends.length; e++) {
                var lo = ends[e].getAttribute('data-end') === 'lo';
                ends[e].classList.toggle('is-on', lo === atLo);
                if (ends[e].tagName.toLowerCase() === 'button') ends[e].setAttribute('aria-pressed', String(lo === atLo));
            }
        };

        scale.addEventListener('input', applyScale);
        scale.addEventListener('change', applyScale);
        applyScale();

        // The gas-site comparison has two buttons and a hidden binary value.
        // This also keeps the SVG fallback usable if the optional builder fails.
        scope.querySelectorAll('[data-mb-end]').forEach(function (button) {
            button.addEventListener('click', function () {
                scale.value = button.getAttribute('data-mb-end') === 'hi' ? '100' : '0';
                scale.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        /* The hint stops nagging once it has been taken. Pointerdown as well as
           input, so grabbing the thumb and letting go without moving it still
           counts — the point is whether the control has been found. */
        var bar = scale.closest('.dg-scale');
        var used = function () {
            if (bar) bar.classList.add('is-used');
        };
        scale.addEventListener('pointerdown', used, { once: true });
        scale.addEventListener('input', used, { once: true });
        scale.addEventListener('keydown', used, { once: true });
    });

    /* --- The fuel switch ---
       Which PAIR is on screen, where the slider picks between the two drawings
       inside it. Both panes stay mounted and keep their view state; hiding one
       also stops it animating, because diagram-engine.js gates each drawing on
       an IntersectionObserver and a hidden pane has no box to intersect. */
    var fuel = document.getElementById('dgFuel');
    if (fuel) {
        var picks = fuel.querySelectorAll('[data-fuel]');
        var fuelPanes = document.querySelectorAll('.dg-fuel-pane');

        var showFuel = function (want) {
            for (var i = 0; i < picks.length; i++) {
                picks[i].setAttribute('aria-pressed',
                    picks[i].getAttribute('data-fuel') === want ? 'true' : 'false');
            }
            for (var p = 0; p < fuelPanes.length; p++) {
                var on = fuelPanes[p].getAttribute('data-fuel') === want;
                fuelPanes[p].hidden = !on;
                /* The reveal observer unobserves on first intersection, and a
                   pane that was hidden at load never had one — so its contents
                   would sit at the pre-reveal opacity forever once shown.
                   Marking them revealed on the way in costs nothing and needs
                   no measurement. */
                if (on) {
                    var late = fuelPanes[p].querySelectorAll('.reveal');
                    for (var r = 0; r < late.length; r++) late[r].classList.add('in');
                }
            }
        };

        Array.prototype.forEach.call(picks, function (b) {
            b.addEventListener('click', function () {
                showFuel(b.getAttribute('data-fuel'));
            });
        });
    }

    /* --- Forms ---
       GitHub Pages is static, so there is nothing to POST to. Each form
       composes a pre-filled mail draft instead. See site/README.md for how
       to swap this for a real endpoint (a Cloudflare Worker, like the ones
       already in worker/, is the natural fit). */
    var forms = document.querySelectorAll('form[data-mailto]');
    Array.prototype.forEach.call(forms, function (form) {
        if (form.getAttribute('data-private-intake') !== null) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!form.reportValidity()) return;

            /* The attribute is read HERE, not captured when the listener was
               attached, because a page can take the form over after this ran.

               checkout.js does exactly that: it removes data-mailto so the
               checkout can POST an order instead. But this listener was already
               bound — removing an attribute does not detach a listener — and it
               is bound FIRST, since site.js loads first. Without this guard it
               fired anyway, read null, and navigated to `mailto:null`, so
               placing an order opened a mail draft on top of it. */
            var to = form.getAttribute('data-mailto');
            if (!to) return;

            var subject = form.getAttribute('data-subject') || 'Website enquiry';
            var lines = [];
            var energySourcesWritten = false;

            Array.prototype.forEach.call(form.elements, function (el) {
                if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button' || el.type === 'reset') return;
                // Preserve multi-source intent as one field, including an unrestricted brief.
                if (el.name === 'energy_sources' && el.type === 'checkbox') {
                    if (energySourcesWritten) return;
                    energySourcesWritten = true;
                    var sources = Array.prototype.filter.call(form.elements, function (item) {
                        return item.name === 'energy_sources' && item.type === 'checkbox' && item.checked && !item.disabled;
                    }).map(function (item) { return item.value; });
                    lines.push('Energy sources: ' + (sources.length ? sources.join(', ') : 'Any energy source'));
                    return;
                }
                if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
                var field = el.closest('.field');
                var label = (el.labels && el.labels[0]) || (field && field.querySelector('label'));
                var key = label ? label.textContent.trim() : el.name;
                var value = el.multiple && el.options ? Array.prototype.filter.call(el.options, function (item) { return item.selected && !item.disabled; }).map(function (item) { return item.value; }).join(', ') : el.value;
                if (el.hasAttribute('data-mailto-label') && el.options && value) {
                    value = Array.prototype.filter.call(el.options, function (item) { return item.selected && !item.disabled; }).map(function (item) { return item.textContent.trim(); }).join(', ');
                }
                lines.push(key + ': ' + (value || '—'));
            });

            var context = window.ProtonMailDraft.campaign(window.location);
            var body = lines.concat(context.length ? [''].concat(context) : []).join('\n') + '\n\n— Enquiry prepared on protonminingco.com\n';
            var draft = window.ProtonMailDraft.open(window, form, to, subject, body);

            var btn = form.querySelector('button[type="submit"]');
            if (btn) {
                var original = btn.textContent;
                btn.textContent = draft.opened ? 'Opening your mail app…' : 'Complete enquiry ready below';
                setTimeout(function () { btn.textContent = original; }, 4000);
            }
        });
        // Opt-in forms remain disabled without JavaScript, so their fields
        // cannot fall through to a native GET submission.
        var draftButton = form.querySelector('button[type="submit"][data-mailto-enable]');
        if (draftButton) draftButton.disabled = false;
    });

    /* --- Deep links like contact.html?topic=hosting preselect the subject,
           and route the draft to the right inbox. --- */
    var topicSelect = document.querySelector('[data-topic-select]');
    if (topicSelect) {
        var routes = {
            hosting:     { to: 'sales@protonminingco.com', subject: 'Hosting enquiry via protonminingco.com' },
            'site-sourcing': { to: 'sales@protonminingco.com', subject: 'Energy site sourcing enquiry via protonminingco.com' },
            energy:      { to: 'sales@protonminingco.com',  subject: 'Site / energy enquiry via protonminingco.com' },
            'managed-hosting': { to: 'sales@protonminingco.com', subject: 'Managed Energy Hosting enquiry via protonminingco.com' },
            partnership: { to: 'sales@protonminingco.com',   subject: 'Partnership enquiry via protonminingco.com' },
            media:       { to: 'sales@protonminingco.com',   subject: 'Media enquiry via protonminingco.com' },
            other:       { to: 'sales@protonminingco.com',   subject: 'Enquiry via protonminingco.com' }
        };

        var applyRoute = function () {
            var form = topicSelect.form;
            var route = routes[topicSelect.value];
            if (!form || !route) return;
            form.setAttribute('data-mailto', route.to);
            form.setAttribute('data-subject', route.subject);
        };

        var requested = new URLSearchParams(window.location.search).get('topic');
        if (requested && routes[requested]) topicSelect.value = requested;
        topicSelect.addEventListener('change', applyRoute);
        applyRoute();
    }

    /* --- Current year in the footer --- */
    var years = document.querySelectorAll('[data-year]');
    Array.prototype.forEach.call(years, function (el) {
        el.textContent = String(new Date().getFullYear());
    });
})();

/* Compact supporting detail on phones; preserve the full desktop/no-JS page. */
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    var media = window.matchMedia('(max-width: 640px)');
    var printing = false, printDetails = null;
    document.documentElement.classList.add('mobile-details-ready');
    // Desktop HTML is the source copy. Only phone layouts use the short variant.
    // Keep live nodes (prices, order references, links) instead of recreating them.
    var copies = Array.from(document.querySelectorAll('[data-mobile-copy]')).map(function (el) {
        return { el: el, desktop: el.innerHTML, mobile: el.getAttribute('data-mobile-copy'), mode: null, last: el.innerHTML };
    });
    function applyCopy(item) {
        var mobile = media.matches && !printing;
        if (item.mode === mobile) return;
        if (item.mode === null && !mobile) { item.mode = false; return; }
        // These notes are owned by the quote/market renderer once it supplies live content.
        if (/^hw(Econ|Market)Note$/.test(item.el.id) && item.el.innerHTML !== item.last) return;
        var template = document.createElement('template');
        template.innerHTML = mobile ? item.mobile : item.desktop;
        var live = Array.from(item.el.querySelectorAll('[id]'));
        live.filter(function (node) { return !live.some(function (parent) { return parent !== node && parent.contains(node); }); })
            .forEach(function (node) {
                var replacement = Array.from(template.content.querySelectorAll('[id]')).find(function (el) { return el.id === node.id; });
                if (replacement) replacement.replaceWith(node);
            });
        item.el.replaceChildren(template.content);
        item.mode = mobile; item.last = item.el.innerHTML;
    }
    copies.forEach(applyCopy);

    // Placeholder-only company metrics do not contain a number to compare.
    document.querySelectorAll('.hero-zone .stats').forEach(function (stats) {
        var values = Array.from(stats.querySelectorAll('.stat-value'));
        if (values.length && values.every(function (v) { return v.querySelector('.ph'); })) {
            var section = stats.closest('section'); if (section) section.classList.add('mobile-empty-stats');
        }
    });
    var groups = Array.from(document.querySelectorAll('details[data-mobile-details]')).map(function (el) {
        return { el: el, summary: el.querySelector('summary'), mobileOpen: false, wasMobile: false };
    });
    function apply(group) {
        if (group.wasMobile && !media.matches) group.mobileOpen = group.el.open;
        group.el.open = media.matches ? group.mobileOpen : true;
        group.wasMobile = media.matches;
        if (group.summary) group.summary.tabIndex = media.matches ? 0 : -1;
    }
    groups.forEach(function (group) {
        group.el.addEventListener('toggle', function () { if (media.matches && !printing) group.mobileOpen = group.el.open; });
        if (group.summary) group.summary.addEventListener('click', function (event) { if (!media.matches) event.preventDefault(); });
        apply(group);
    });
    document.querySelectorAll('[data-article-expand]').forEach(function (button) {
        var article = button.closest('article'), sections = Array.from(article.querySelectorAll('details[data-mobile-details]'));
        function update() {
            var allOpen = sections.every(function (el) { return el.open; });
            button.textContent = allOpen ? 'Show section headings' : 'Read full article';
            button.setAttribute('aria-expanded', String(allOpen));
        }
        button.addEventListener('click', function () {
            var open = !sections.every(function (el) { return el.open; });
            sections.forEach(function (el) { el.open = open; }); update();
        });
        sections.forEach(function (el) { el.addEventListener('toggle', update); });
        update();
    });
    function revealHash() {
        var id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
        if (!id) return;
        var target = document.getElementById(id), ancestor = target;
        var child = target && target.querySelector(':scope > .wrap > .mobile-section-details, :scope > .mobile-section-details');
        if (child) child.open = true;
        while (ancestor) {
            if (ancestor.tagName === 'DETAILS') ancestor.open = true;
            ancestor = ancestor.parentElement;
        }
        if (target) requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
    }
    var change = function () { if (printing) return; copies.forEach(applyCopy); groups.forEach(apply); revealHash(); };
    if (media.addEventListener) media.addEventListener('change', change); else media.addListener(change);
    window.addEventListener('hashchange', revealHash);
    // A phone worksheet remains complete when printed. Restore the reading state afterwards.
    window.addEventListener('beforeprint', function () {
        if (printing) return;
        groups.forEach(function (group) {
            if (media.matches) group.mobileOpen = group.el.open;
            group.wasMobile = media.matches;
        });
        printDetails = Array.from(document.querySelectorAll('details')).map(function (el) { return { el: el, open: el.open }; });
        printing = true; copies.forEach(applyCopy);
        printDetails.forEach(function (item) { item.el.open = true; });
    });
    window.addEventListener('afterprint', function () {
        if (!printing) return;
        if (printDetails) printDetails.forEach(function (item) { item.el.open = item.open; });
        printing = false; printDetails = null; copies.forEach(applyCopy); groups.forEach(apply);
    });
    document.addEventListener('click', function (event) {
        var a = event.target.closest && event.target.closest('a[href^="#"]');
        if (a && a.getAttribute('href') === location.hash) revealHash();
    });
    document.addEventListener('invalid', function (event) {
        var node = event.target; while (node) { if (node.tagName === 'DETAILS') node.open = true; node = node.parentElement; }
    }, true);

    // The phone catalogue starts with four models. Search covers the full list;
    // quantities already selected stay visible when the list is shortened again.
    var rowsHost = document.getElementById('hwRows'), search = document.getElementById('hwSearch'), showModels = document.getElementById('hwShowModels');
    if (rowsHost && search && showModels) {
        var expanded = false;
        function catalogue() {
            var rows = Array.from(rowsHost.querySelectorAll('tr')), query = search.value.trim().toLowerCase(), shown = 0;
            rows.forEach(function (row, i) {
                var input = row.querySelector('[data-qty]'), name = input ? input.getAttribute('data-qty') : row.textContent;
                var visible = !media.matches || (name.toLowerCase().includes(query) && (query || expanded || i < 4 || (input && Number(input.value) > 0)));
                row.classList.toggle('mobile-hw-hidden', !visible); if (visible) shown++;
            });
            showModels.hidden = !media.matches || !!query || rows.length <= 4;
            showModels.textContent = expanded ? 'Show fewer models' : 'Show all ' + rows.length + ' models';
            showModels.setAttribute('aria-expanded', String(expanded));
            var result = document.getElementById('hwResults'); if (result) result.textContent = shown ? 'Showing ' + shown + ' of ' + rows.length + ' models' : 'No matching miners. Try another model name.';
        }
        search.addEventListener('input', catalogue);
        showModels.addEventListener('click', function () { expanded = !expanded; catalogue(); });
        if (typeof MutationObserver !== 'undefined') new MutationObserver(catalogue).observe(rowsHost, { childList: true, subtree: true });
        if (media.addEventListener) media.addEventListener('change', catalogue); else media.addListener(catalogue);
        catalogue();
    }

    revealHash();
})();
