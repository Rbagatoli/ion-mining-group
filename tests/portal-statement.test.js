// Tests for worker-portal/statement.js — the document a counterparty is paid on.
//
// The assertions that matter most here are the ones about NOT producing a number: no heating
// value means null MMBtu, an unattributed curtailment means a pending shortfall rather than zero,
// and an unimplemented contract structure charges nothing at all. Every one of those, done the
// other way, is a wrong cheque that looks entirely convincing.

var path = require('path'), fs = require('fs');
var Statement = require(path.join(__dirname, '..', 'worker-portal', 'statement.js'));
var Ledger = require(path.join(__dirname, '..', 'worker-portal', 'ledger.js'));

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }
function near(label, actual, expected, tol) {
    if (actual !== null && Math.abs(actual - expected) <= (tol || 0.01)) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected +
                               '\n        actual   ' + actual); }
}

function contract(over) {
    var c = {
        contract_id: 'CT1', site_id: 'S1', version: 2, structure: '01_purchase',
        measurement: {
            billing_basis: 'energy_mmbtu',
            heating_value_source: 'contract_deemed',
            deemed_heating_value_btu_scf: 500     // landfill gas, roughly half of pipeline gas
        },
        terms: { price_basis: 'usd_per_mmbtu', price: 3.25, take_or_pay: null }
    };
    for (var k in (over || {})) c[k] = over[k];
    return c;
}
function built(mcf) {
    return { segments: [{ from: 'a', to: 'b', start_reading_id: 'r1', end_reading_id: 'r2', mcf: mcf }],
             gaps: [], milli: Math.round(mcf * 1000), unbillable: [] };
}

// ---- 1. the unit conversion that would double a cheque -----------------------------------------

console.log('\n=== Mcf is not MMBtu ===');
(function() {
    // 1000 Mcf of landfill gas at 500 Btu/scf = 500 MMBtu. At 1000 Btu/scf it would be 1000.
    near('landfill gas at 500 Btu/scf', Statement.toMMBtu(1000, 500), 500);
    near('pipeline gas at 1000 Btu/scf is double it', Statement.toMMBtu(1000, 1000), 1000);
    eq('and with no heating value there is no answer', Statement.toMMBtu(1000, null), null);

    var s = Statement.compute({ site_id: 'S1', contract: contract(), built: built(1000) });
    near('the statement converts at the CONTRACT figure', s.quantity.delivered_mmbtu, 500);
    near('so the charge is 500 MMBtu at $3.25', s.total_usd, 1625);
    ok('and it is nowhere near the pipeline-gas figure', s.total_usd < 2000,
       '$' + s.total_usd + ', not $3250');
})();

console.log('\n=== no heating value means null, never a default ===');
(function() {
    var c = contract({ measurement: { billing_basis: 'energy_mmbtu',
                                      heating_value_source: 'contract_deemed',
                                      deemed_heating_value_btu_scf: null } });
    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(1000) });
    eq('MMBtu is null', s.quantity.delivered_mmbtu, null);
    eq('the volume is still known', s.quantity.delivered_mcf, 1000);
    ok('the gap is named rather than hidden', s.basis.unresolved.indexOf('delivered_mmbtu') >= 0);
    eq('and nothing was charged on a number nobody has', s.charges.length, 0);
    eq('so the total is zero, with the reason on the record', s.total_usd, 0);
})();

console.log('\n=== the file cannot learn a heating value by accident ===');
(function() {
    // site-engine.js carries gasBtuPerCf: 1000 in its defaults. Copying that line here would
    // double every landfill seller's payment, so this asserts it never arrives.
    var src = fs.readFileSync(path.join(__dirname, '..', 'worker-portal', 'statement.js'), 'utf8')
        .replace(/\/\/[^\n]*/g, '');
    ok('it imports nothing', !/require\s*\(|\bimport\s/.test(src));
    ok('it never mentions site-engine', src.indexOf('site-engine') < 0);
    ok('and carries no heating-value literal', !/\b1000\s*\/\s*|gasBtuPerCf|btuPerCf\s*=\s*\d/.test(src) &&
       !/heating[_a-z]*\s*[:=]\s*\d/i.test(src));
})();

// ---- 2. take-or-pay, and the zero that must not appear -----------------------------------------

console.log('\n=== take-or-pay is shown as three lines, so a zero is computed ===');
(function() {
    var c = contract();
    c.terms.take_or_pay = { minimum_per_period: 400, excused_events: ['force_majeure', 'seller_outage'] };
    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(1000), curtailments: [] });

    eq('the minimum is stated', s.take_or_pay.minimum, 400);
    eq('delivered is stated', s.take_or_pay.delivered, 500);
    eq('and the shortfall is a computed zero', s.take_or_pay.shortfall, 0);
    eq('so no shortfall charge appears', s.charges.length, 1);
})();

console.log('\n=== a real shortfall is charged ===');
(function() {
    var c = contract();
    c.terms.take_or_pay = { minimum_per_period: 800, excused_events: [] };
    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(1000), curtailments: [] });
    eq('delivered 500 against a minimum of 800', s.take_or_pay.shortfall, 300);
    eq('a shortfall line is added', s.charges.length, 2);
    near('and the total covers both', s.total_usd, 500 * 3.25 + 300 * 3.25);
})();

console.log('\n=== an unattributed curtailment makes the shortfall PENDING, not zero ===');
(function() {
    // The meter cannot tell you why gas did not flow. Defaulting to zero here silently deletes
    // money the seller may be owed, and nobody would ever notice.
    var c = contract();
    c.terms.take_or_pay = { minimum_per_period: 800, excused_events: ['seller_outage'] };
    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(1000),
                                curtailments: [{ from: 'x', to: 'y', attribution: null }] });

    eq('the shortfall is null, not zero', s.take_or_pay.shortfall, null);
    ok('it is flagged pending', s.take_or_pay.pending_attribution);
    ok('the total says outright that it is partial', s.total_is_partial);
    ok('the reason is disclosed to the seller',
       s.basis.disclosures.some(function(d) { return /attributed/.test(d); }));
    ok('and it is listed as unresolved',
       s.basis.unresolved.indexOf('take_or_pay_shortfall') >= 0);
    eq('no shortfall charge was invented', s.charges.length, 1);
})();

console.log('\n=== gas Proton refused does NOT reduce what Proton owes ===');
(function() {
    // THIS SECTION PREVIOUSLY ASSERTED THE OPPOSITE, and the assertion was wrong rather than the
    // code being right. It read "gas Proton refused still counts toward the minimum" and expected the
    // refusal to shrink the shortfall.
    //
    // That inverts the clause. Take-or-pay exists so that when Proton declines gas the seller made
    // available, the seller is paid anyway. Netting it out made the clause pay ZERO in exactly the
    // month it exists for: minimum 800, delivered 0, 800 refused by Proton produced a $0 statement
    // when the seller was owed the full minimum.
    var c = contract();
    c.terms.take_or_pay = { minimum_per_period: 800, excused_events: ['seller_outage'] };

    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(1000),
        curtailments: [{ attribution: 'ion_economic', available_quantity: 200 }] });
    eq('delivered 500 against a minimum of 800 is a shortfall of 300', s.take_or_pay.shortfall, 300);
    eq('and Proton refusing 200 does not shrink it', s.take_or_pay.ion_curtailed_available, 200);

    // The case the old test could not have caught, because it netted to zero.
    var worst = Statement.compute({ site_id: 'S1', contract: c, built: built(0),
        curtailments: [{ attribution: 'ion_economic', available_quantity: 800 }] });
    eq('Proton refusing the entire minimum still owes the entire minimum', worst.take_or_pay.shortfall, 800);
    ok('and it is charged', worst.total_usd > 0, '$' + worst.total_usd);

    // A SELLER-side failure is the opposite case: Proton cannot be made to pay for gas that was
    // never available to take, so it reduces the minimum rather than being owed.
    var excused = Statement.compute({ site_id: 'S1', contract: c, built: built(1000),
        curtailments: [{ attribution: 'seller_outage', quantity: 300 }] });
    eq('a seller outage reduces the minimum instead', excused.take_or_pay.adjusted_minimum, 500);
    eq('leaving no shortfall', excused.take_or_pay.shortfall, 0);
})();

console.log('\n=== a shortfall is not charged against a hole in the data ===');
(function() {
    // Delivered is a floor, not a measurement, when part of the period has no readings. The
    // difference against the minimum would then partly be the size of the gap rather than a real
    // shortfall — so it is disclosed and left out rather than billed.
    var c = contract();
    c.terms.take_or_pay = { minimum_per_period: 800, excused_events: [] };
    var b = built(200);
    b.gaps = [{ kind: 'unbounded', volume_mcf: null, hours: 120 }];

    var holed = Statement.compute({ site_id: 'S1', contract: c, built: b });
    eq('the shortfall is not asserted', holed.take_or_pay.shortfall, null);
    eq('because delivered is not firm', holed.take_or_pay.delivered_is_firm, false);
    ok('the total says it is incomplete', holed.total_is_partial);
    ok('and the reason is given', holed.basis.disclosures.some(function(d) {
        return /minimum rather than a measurement/.test(d); }));

    // With full coverage the same figures DO produce a charge.
    var firm = Statement.compute({ site_id: 'S1', contract: c, built: built(200) });
    eq('with complete coverage it is charged', firm.take_or_pay.shortfall, 700);
})();

// ---- 3. structures that are not implemented ---------------------------------------------------

console.log('\n=== an unimplemented structure charges nothing and says so ===');
(function() {
    ['02_revenue_share', '03_lease_royalty', 'something_new'].forEach(function(st) {
        var s = Statement.compute({ site_id: 'S1', contract: contract({ structure: st }),
                                    built: built(1000) });
        eq(st + ' produces no charges', s.charges.length, 0);
        ok(st + ' explains itself', s.basis.disclosures.some(function(d) {
            return /does not yet compute/.test(d); }));
    });
})();

// ---- 4. coverage, gaps and freezing ------------------------------------------------------------

console.log('\n=== a gap is disclosed, never filled ===');
(function() {
    var b = Ledger.build([], { meter_id: 'M', index_digits: 6, max_rate_per_hour: 60 },
                         '2027-03-01T00:00:00.000Z', '2027-03-02T00:00:00.000Z');
    var cov = Ledger.coverage(b);
    var s = Statement.compute({ site_id: 'S1', contract: contract(), built: b, coverage: cov });

    eq('nothing was delivered that anyone can prove', s.quantity.delivered_mcf, 0);
    eq('the gap volume stays null', s.quantity.gaps[0].volume_mcf, null);
    ok('and the seller is told the coverage', s.basis.disclosures.some(function(d) {
        return /Coverage was 0%/.test(d); }));
    ok('and told nothing was estimated', s.basis.disclosures.some(function(d) {
        return /No volume has been estimated/.test(d); }));
})();

console.log('\n=== the statement freezes ===');
(function() {
    var input = { site_id: 'S1', contract: contract(), built: built(1000),
                  period: { id: '2027-03' }, computed_at: '2027-04-04T00:00:00Z' };
    var a = Statement.canonical(Statement.compute(input));
    var b = Statement.canonical(Statement.compute(input));
    eq('the same inputs canonicalise identically', a, b);

    // Key order must not matter, or a hash proves nothing.
    eq('canonical form sorts keys',
       Statement.canonical({ b: 1, a: 2 }), Statement.canonical({ a: 2, b: 1 }));

    var changed = Statement.compute({ site_id: 'S1', contract: contract(), built: built(1001),
                                      period: { id: '2027-03' }, computed_at: '2027-04-04T00:00:00Z' });
    ok('and a different quantity produces a different canonical form',
       Statement.canonical(changed) !== a);
})();

console.log('\n=== the status machine only moves forward ===');
(function() {
    ok('accruing to cutoff', Statement.canAdvance('accruing', 'cutoff'));
    ok('closed to issued', Statement.canAdvance('closed', 'issued'));
    ok('issued cannot go back to closed', !Statement.canAdvance('issued', 'closed'));
    ok('closed cannot skip straight to settled', !Statement.canAdvance('closed', 'settled'));
    ok('and nothing advances from settled', !Statement.canAdvance('settled', 'accruing'));
})();

console.log('\n=== money rounds once, at the end ===');
(function() {
    // Three lines that each round badly, summed. Rounding per line and then adding gives a total
    // the seller cannot reproduce from the lines they can see.
    var c = contract();
    c.terms.price = 3.333;
    var s = Statement.compute({ site_id: 'S1', contract: c, built: built(2001) });
    var lines = s.charges.reduce(function(t, x) { return t + x.amount_usd; }, 0);
    near('the total equals the lines a seller can add up', s.total_usd, Math.round(lines * 100) / 100);
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
