/* ===== ION MINING GROUP — Public site behaviour =====
   No dependencies. Everything degrades gracefully without JS:
   the nav links are real links, and the forms fall back to the
   plain mailto address printed beside them. */

(function () {
    'use strict';

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
            }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
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
            }
        };

        scale.addEventListener('input', applyScale);
        applyScale();

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

            Array.prototype.forEach.call(form.elements, function (el) {
                if (!el.name || el.type === 'submit') return;
                var field = el.closest('.field');
                var label = field && field.querySelector('label');
                var key = label ? label.textContent.trim() : el.name;
                lines.push(key + ': ' + (el.value || '—'));
            });

            var body = lines.join('\n') + '\n\n— Sent from ionmininggroup.com\n';
            window.location.href = 'mailto:' + to +
                '?subject=' + encodeURIComponent(subject) +
                '&body=' + encodeURIComponent(body);

            var btn = form.querySelector('button[type="submit"]');
            if (btn) {
                var original = btn.textContent;
                btn.textContent = 'Opening your mail app…';
                setTimeout(function () { btn.textContent = original; }, 4000);
            }
        });
    });

    /* --- Deep links like contact.html?topic=hosting preselect the subject,
           and route the draft to the right inbox. --- */
    var topicSelect = document.querySelector('[data-topic-select]');
    if (topicSelect) {
        var routes = {
            hosting:     { to: 'hosting@ionmininggroup.com', subject: 'Hosting enquiry via ionmininggroup.com' },
            energy:      { to: 'energy@ionmininggroup.com',  subject: 'Site / energy enquiry via ionmininggroup.com' },
            partnership: { to: 'hello@ionmininggroup.com',   subject: 'Partnership enquiry via ionmininggroup.com' },
            media:       { to: 'hello@ionmininggroup.com',   subject: 'Media enquiry via ionmininggroup.com' },
            other:       { to: 'hello@ionmininggroup.com',   subject: 'Enquiry via ionmininggroup.com' }
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
