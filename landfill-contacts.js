/* Public contact research, joined only by the landfill's source identifier.
 * Loaded in small shards when a contact panel opens. Never writes to the CRM:
 * a public listing is not a verified conversation or a confirmed decision-maker.
 */
var LandfillContacts = (function () {
    'use strict';

    var EDITION = '2026-09-06';
    var SHARD_COUNT = 64;
    var _data = Object.create(null), _loading = Object.create(null);
    var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    function validId(id) { return /^(us-lf-[0-9]+|ca-lf-G[0-9]+)$/.test(String(id || '')); }

    function siteIdFor(c) {
        if (!c) return null;
        var sd = c.sourceDetail || {};
        if (c.source === 'lmop-landfill' && /^[0-9]+$/.test(String(sd.lfid))) {
            return 'us-lf-' + sd.lfid;
        }
        if (c.source === 'eccc-landfill-ca') {
            var byRecord = /^ca-lf-G[0-9]+$/.test(String(c.id)) ? c.id : null;
            var byRegistry = /^G[0-9]+$/.test(String(sd.ghgrpId)) ? 'ca-lf-' + sd.ghgrpId : null;
            if (byRecord && byRegistry && byRecord !== byRegistry) return null;
            return byRegistry || byRecord;
        }
        return null;
    }

    function shardFor(id) {
        if (!validId(id)) return null;
        var hash = 0;
        for (var i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        return ('0' + (hash % SHARD_COUNT).toString(16)).slice(-2);
    }

    function assetFor(id) {
        var shard = shardFor(id);
        return shard === null ? null : './data/landfill-contacts-' + EDITION + '-' + shard + '.json';
    }

    function get(c) {
        var id = siteIdFor(c), shard = id && shardFor(id);
        return shard && _data[shard] && own(_data[shard].sites, id) ? _data[shard].sites[id] : null;
    }

    function loadFor(c) {
        var id = siteIdFor(c);
        if (!id) return Promise.resolve(null);
        var shard = shardFor(id);
        if (_data[shard]) return Promise.resolve(get(c));
        if (!_loading[shard]) {
            _loading[shard] = fetch(assetFor(id)).then(function (res) {
                if (!res.ok) throw new Error('Contact research HTTP ' + res.status);
                return res.json();
            }).then(function (d) {
                if (!d || d.v !== 1 || d.generated !== EDITION || !d.sites || typeof d.sites !== 'object') {
                    throw new Error('Contact research format is unavailable');
                }
                Object.keys(d.sites).forEach(function (key) {
                    var site = d.sites[key];
                    if (shardFor(key) !== shard || !site || site.siteId !== key || !Array.isArray(site.contacts)) {
                        throw new Error('Contact research contains an invalid site');
                    }
                });
                _data[shard] = d;
                return d;
            }).then(function (d) {
                delete _loading[shard];
                return d;
            }, function (err) {
                delete _loading[shard]; // A failed request must be retryable.
                throw err;
            });
        }
        return _loading[shard].then(function () { return get(c); });
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function webLink(url, label) {
        if (!/^https?:\/\/[^\s]+$/i.test(String(url || ''))) return esc(label || '');
        return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label || url) + '</a>';
    }

    function phoneHref(phone) {
        var match = String(phone || '').trim().match(/^([+()\d.\s-]+)(?:\s*(?:ext\.?|x|extension)\s*(\d+))?$/i);
        if (!match) return null;
        var number = match[1].replace(/[^\d+]/g, '');
        if (!/^\+?\d{10,15}$/.test(number)) return null;
        return 'tel:' + number + (match[2] ? ';ext=' + match[2] : '');
    }

    function emailHref(email) {
        return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(email || ''))
            ? 'mailto:' + encodeURIComponent(email).replace(/%40/g, '@') : null;
    }

    function contactCard(contact, first) {
        var c = contact || {}, tel = phoneHref(c.phone), mail = emailHref(c.email);
        var html = '<article class="lfc-card' + (first ? ' lfc-primary' : '') + '">' +
            (first ? '<div class="lfc-eyebrow">Suggested starting contact</div>' : '') +
            '<h4>' + esc(c.contactName || c.organization || 'Public contact listing') + '</h4>' +
            (c.title ? '<p class="lfc-role">' + esc(c.title) + '</p>' : '') +
            (c.organization && c.organization !== c.contactName ? '<p class="lfc-org">' + esc(c.organization) + '</p>' : '') +
            '<div class="lfc-ways">' +
            (c.phone ? (tel ? '<a href="' + esc(tel) + '">' + esc(c.phone) + '</a>' : '<span>' + esc(c.phone) + '</span>') : '') +
            (c.email ? (mail ? '<a href="' + esc(mail) + '">' + esc(c.email) + '</a>' : '<span>' + esc(c.email) + '</span>') : '') +
            '</div>' +
            (c.contactCategory ? '<p class="lfc-category">' + esc(c.contactCategory) + '</p>' : '') +
            (c.scope ? '<p class="lfc-note">' + esc(c.scope) + '</p>' : '') +
            (c.notes ? '<p class="lfc-note">' + esc(c.notes) + '</p>' : '') +
            '<p class="lfc-source">' + webLink(c.sourceUrl, c.source || 'Source') +
            ' · ' + (c.sourceDate ? 'Source date: ' + esc(c.sourceDate) : 'Source date not published') + '</p>' +
            '<details class="lfc-evidence"><summary>Source &amp; verification details</summary><dl>';
        [
            ['Listing type', c.contactType && c.contactType.replace(/_/g, ' ')],
            ['Source record', c.sourceLocator],
            ['Matched by', c.matchMethod && c.matchMethod.replace(/_/g, ' ')],
            ['Source age', c.sourceAgeBand],
            ['Retrieved', c.retrievedOn],
            ['Verification', c.verification]
        ].forEach(function (item) {
            if (item[1]) html += '<dt>' + esc(item[0]) + '</dt><dd>' + esc(item[1]) + '</dd>';
        });
        html += '</dl>';
        if (c.additionalSourceUrl) html += '<p>' + webLink(c.additionalSourceUrl, 'Additional source') + '</p>';
        if (c.website) html += '<p>' + webLink(c.website, 'Listed website') + '</p>';
        return html + '</details></article>';
    }

    function renderRecord(site) {
        if (!site) return '<p class="lfc-note">This site is not in the ' + EDITION + ' contact research. Existing contact details are shown below.</p>';
        var contacts = site.contacts || [];
        var html = '<div class="lfc-heading"><h3>Researched contacts</h3><span>' +
            contacts.length + ' public ' + (contacts.length === 1 ? 'record' : 'records') + '</span></div>' +
            '<p class="lfc-note">Research: ' + EDITION + '. Public listings; current roles, contact details and authority to agree gas or energy terms need confirmation.</p>';
        if (!contacts.length) {
            return html + '<p><strong>No public phone or email found for this site.</strong></p>' +
                (site.researchNotes ? '<p class="lfc-note">' + esc(site.researchNotes) + '</p>' : '') +
                (site.nextAction ? '<p class="lfc-next"><strong>Next step:</strong> ' + esc(site.nextAction) + '</p>' : '');
        }
        html += contactCard(contacts[0], true);
        if (contacts.length > 1) {
            html += '<details class="lfc-more"><summary>More contacts &amp; source records (' + (contacts.length - 1) + ')</summary>';
            for (var i = 1; i < contacts.length; i++) html += contactCard(contacts[i], false);
            html += '</details>';
        }
        return html;
    }

    function placeholder(c) {
        var id = siteIdFor(c);
        if (!id) return '';
        return '<div class="lfc" data-landfill-contacts="' + esc(id) + '">' +
            (get(c) ? renderRecord(get(c)) : '<p class="lfc-note" role="status">Loading researched contacts…</p>') + '</div>';
    }

    // Updates only this widget. An async reply must not erase typed terms, switch
    // the active tab, or paint one landfill's people onto a newly selected site.
    function mount(root, c) {
        var id = siteIdFor(c);
        if (!root || !id) return Promise.resolve(null);
        var host = root.querySelector('[data-landfill-contacts="' + id + '"]');
        if (!host) return Promise.resolve(null);
        if (host._landfillContactRequest) return host._landfillContactRequest;
        if (host._landfillContactsReady) return Promise.resolve(get(c));
        host.setAttribute('aria-busy', 'true');
        var current = function () {
            return host.isConnected !== false && host.getAttribute('data-landfill-contacts') === id;
        };
        host._landfillContactRequest = loadFor(c).then(function (site) {
            if (current()) {
                host.innerHTML = renderRecord(site);
                host._landfillContactsReady = true;
            }
            return site;
        }, function () {
            if (current()) {
                host.innerHTML = '<p class="lfc-note" role="status">Contact research could not be loaded. Your saved details are still available.</p>' +
                    '<button type="button" class="lfc-retry">Retry contact research</button>';
                host.querySelector('button').addEventListener('click', function () { mount(root, c); });
            }
            return null;
        }).then(function (site) {
            host.removeAttribute('aria-busy');
            host._landfillContactRequest = null;
            return site;
        });
        return host._landfillContactRequest;
    }

    return { edition: EDITION, shardCount: SHARD_COUNT, siteIdFor: siteIdFor, shardFor: shardFor,
        assetFor: assetFor, get: get, loadFor: loadFor, renderRecord: renderRecord,
        placeholder: placeholder, mount: mount, phoneHref: phoneHref, emailHref: emailHref };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LandfillContacts;
