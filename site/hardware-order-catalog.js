/* Exact variants carried by the existing quantity-only cart.
 * This bridge never turns a public market reference into an order price. */
(function (root, create) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = create(require('./miner-db.js'), require('./brokerage-catalog-data.js'));
    } else {
        root.HardwareOrderCatalog = create(root.MinerDB, root.BrokerageCatalog);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function create(MinerDB, BrokerageCatalog) {
    'use strict';
    var PREFIX = 'catalogue:';
    /* Identity is explicit; equal hashrate alone does not identify a machine.
     * Every alias is rechecked against both currently loaded spec tables. */
    var ALIASES = {
        's21-pro-234': 'Antminer S21 Pro',
        's21-plus-216': 'Antminer S21+',
        's21-xp-270': 'Antminer S21 XP',
        's21-200': 'Antminer S21',
        't21-190': 'Antminer T21',
        's21-plus-hyd-395': 'Antminer S21+ Hyd.',
        's21-xp-hyd-473': 'Antminer S21 XP Hyd.',
        's21-hyd-335': 'Antminer S21 Hyd.',
        's19k-pro-120': 'Antminer S19k Pro',
        's19j-pro-plus-120': 'Antminer S19j Pro+',
        's19-pro-110': 'Antminer S19 Pro',
        'a15-pro-221': 'Avalon A15 Pro'
    };
    function number(value) {
        return typeof value === 'number' && isFinite(value) && value > 0 ? value : null;
    }
    function find(id) {
        if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || !BrokerageCatalog ||
            typeof BrokerageCatalog.findVariant !== 'function') return null;
        var found = BrokerageCatalog.findVariant(id);
        return found && found.family && found.variant && found.variant.id === id ? found : null;
    }
    function legacyFor(found) {
        var variant = found.variant;
        var name = Object.prototype.hasOwnProperty.call(ALIASES, variant.id) ? ALIASES[variant.id] : null;
        var legacy = name && MinerDB && typeof MinerDB.findByModel === 'function' ? MinerDB.findByModel(name) : null;
        if (!legacy || number(variant.hashrateTH) === null || number(variant.powerW) === null ||
            number(legacy.hashrate) === null || number(legacy.power) === null) return null;
        /* A tiny tolerance handles only binary floating-point kW conversion;
         * even a one-watt discrepancy requires a separate quote line. */
        return legacy.model === name && variant.hashrateTH === legacy.hashrate &&
            Math.abs(variant.powerW - legacy.power * 1000) < 1e-8 ? name : null;
    }
    function entry(found, key, quoteRequired) {
        var variant = found.variant, family = found.family;
        return {
            model: key,
            displayName: family.maker + ' ' + variant.name,
            variantId: variant.id,
            familyId: family.id,
            cooling: family.cooling,
            hashrate: number(variant.hashrateTH),
            power: number(variant.powerW) === null ? null : variant.powerW / 1000,
            efficiency: number(variant.efficiency),
            sourceCheckedOn: BrokerageCatalog.checkedOn || null,
            quoteRequired: quoteRequired
        };
    }
    function keyForVariant(id) {
        var found = find(id);
        return found ? legacyFor(found) || PREFIX + id : null;
    }
    function descriptor(id) {
        var found = find(id);
        if (!found) return null;
        var legacy = legacyFor(found), result = entry(found, legacy || PREFIX + id, !legacy);
        result.legacyModel = legacy;
        return result;
    }
    function resolve(key) {
        if (typeof key !== 'string' || key.indexOf(PREFIX) !== 0) return null;
        var found = find(key.slice(PREFIX.length));
        /* An already stored request key never silently becomes a priced SKU. */
        return found ? entry(found, key, true) : null;
    }
    return {keyForVariant: keyForVariant, resolve: resolve, descriptor: descriptor, create: create};
}));
