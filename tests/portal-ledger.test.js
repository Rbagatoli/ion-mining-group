// Tests for worker-portal/ledger.js — the gas metering ledger.
//
// These are the integrity invariants, not a happy path. Every one of them exists because getting
// it wrong sends a counterparty the wrong cheque, and the ones about NULL exist because the
// cheapest possible bug here is a missing measurement quietly becoming a zero.

var path = require('path');
var Ledger = require(path.join(__dirname, '..', 'worker-portal', 'ledger.js'));
var fs = require('fs');

var pass = 0, fail = 0;
function eq(label, actual, expected) {
    if (actual === expected) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + JSON.stringify(expected) +
                               '\n        actual   ' + JSON.stringify(actual)); }
}
function ok(label, cond, note) { eq(label + (note ? '  (' + note + ')' : ''), !!cond, true); }
function near(label, actual, expected, tol) {
    if (actual !== null && Math.abs(actual - expected) <= (tol || 0.001)) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + '\n        expected ' + expected + ' +/- ' + (tol || 0.001) +
                               '\n        actual   ' + actual); }
}

// A meter with everything published. index_digits and max_rate_per_hour come off the datasheet
// and are the ONLY things that may resolve a rollover.
var METER = { meter_id: 'MTR1', index_digits: 6, max_rate_per_hour: 60 };

var seq = 0;
function reading(over) {
    var r = {
        reading_id: 'RD-' + (++seq), meter_id: 'MTR1',
        source: 'device', epoch: 1, seq: seq,
        index_corrected: 0, correction_basis: 'evc_onboard',
        effective_ts: '2027-03-01T00:00:00.000Z',
        device_state: { flow_status: 'flowing' }, superseded: false
    };
    for (var k in (over || {})) r[k] = over[k];
    return r;
}
function at(hoursFromStart) {
    return new Date(Date.parse('2027-03-01T00:00:00.000Z') + hoursFromStart * 3600000).toISOString();
}

// ---- 1. the delta, which is where every wrong number would begin -------------------------------

console.log('\n=== a delta is measured, explained, or refused ===');
(function() {
    var a = reading({ index_corrected: 1000, effective_ts: at(0) });
    var b = reading({ index_corrected: 1042.5, effective_ts: at(1) });
    var d = Ledger.delta(a, b, METER);
    near('a normal advance is measured', d.mcf, 42.5);
    eq('and says so', d.quality, 'measured');

    // A MEASURED zero. Two readings, same index, healthy meter: the gas genuinely did not flow.
    var flat = Ledger.delta(reading({ index_corrected: 1000, effective_ts: at(0) }),
                            reading({ index_corrected: 1000, effective_ts: at(1) }), METER);
    eq('an unchanged index on a healthy meter is a measured zero', flat.mcf, 0);
    eq('and it is quality-measured, not a gap', flat.quality, 'measured');

    // The single most likely accidental zero in the system. A faulted meter may have a FROZEN
    // index, so an unchanged reading across a fault is unknown, not zero.
    var f = Ledger.delta(reading({ index_corrected: 1000, effective_ts: at(0),
                                   device_state: { flow_status: 'fault' } }),
                         reading({ index_corrected: 1000, effective_ts: at(1) }), METER);
    eq('but the same figures across a FAULT are null, not zero', f.mcf, null);
    eq('flagged suspect', f.quality, 'suspect');

    // An uncorrected index billed as corrected is not a rounding error. The pressure ratio alone
    // is tens of percent.
    var u = Ledger.delta(reading({ index_corrected: 1000, effective_ts: at(0),
                                   correction_basis: 'uncorrected' }),
                         reading({ index_corrected: 1100, effective_ts: at(1) }), METER);
    eq('an uncorrected index is refused outright', u.mcf, null);
    eq('and named', u.quality, 'uncorrected');
})();

console.log('\n=== rollover is resolved from the datasheet, or not at all ===');
(function() {
    // 6 digits: wraps at 1,000,000. 999,980 -> 30 is a wrap of 50 Mcf in an hour, and the meter
    // is rated 60/hr, so it is plausible.
    var a = reading({ index_corrected: 999980, effective_ts: at(0) });
    var b = reading({ index_corrected: 30, effective_ts: at(1) });
    var d = Ledger.delta(a, b, METER);
    near('a plausible wrap resolves', d.mcf, 50);
    eq('and is labelled as resolved, not as measured', d.quality, 'rollover_resolved');

    // Same wrap, but the implied volume could not physically have passed in the time. That is
    // not a rollover, it is something wrong, and a human must look.
    var fast = Ledger.delta(reading({ index_corrected: 900000, effective_ts: at(0) }),
                            reading({ index_corrected: 30, effective_ts: at(1) }), METER);
    eq('an implausible one is refused', fast.mcf, null);
    eq('as unresolved', fast.quality, 'unresolved');

    // Without the datasheet figures there is nothing legitimate to resolve it WITH. Inferring the
    // wrap point from the wrap itself would be circular.
    var noSpec = Ledger.delta(a, b, { meter_id: 'MTR1', index_digits: null, max_rate_per_hour: null });
    eq('and with no published digits, nothing is guessed', noSpec.mcf, null);
})();

console.log('\n=== a forward jump the meter could not physically pass is refused ===');
(function() {
    // The most expensive bug this file had. The datasheet bound was applied ONLY to negative
    // movement, on the reasoning that a backwards index needs explaining and a forwards one does
    // not. A firmware unit error reporting cf instead of Mcf is a clean 1000x forward jump, and
    // it came back as quality 'measured' -- the strongest word here -- and was billed. A verified
    // repro turned 300 Mcf of real gas into 4,510,860 Mcf and an $11.2M statement.
    var jump = Ledger.delta(reading({ index_corrected: 501140, effective_ts: at(0) }),
                            reading({ index_corrected: 4511000, effective_ts: at(1) }), METER);
    eq('40,000 Mcf in one hour on a 60 Mcf/hr meter is refused', jump.mcf, null);
    eq('and named as implausible rather than measured', jump.quality, 'implausible');

    // The bound must not swallow ordinary readings.
    var normal = Ledger.delta(reading({ index_corrected: 0, effective_ts: at(0) }),
                              reading({ index_corrected: 42.5, effective_ts: at(1) }), METER);
    eq('a normal hour still measures', normal.mcf, 42.5);
    var atLimit = Ledger.delta(reading({ index_corrected: 0, effective_ts: at(0) }),
                               reading({ index_corrected: 60, effective_ts: at(1) }), METER);
    eq('exactly the rated maximum is allowed', atLimit.mcf, 60);
    var zero = Ledger.delta(reading({ index_corrected: 100, effective_ts: at(0) }),
                            reading({ index_corrected: 100, effective_ts: at(1) }), METER);
    eq('and a measured zero is untouched', zero.mcf, 0);

    // Datasheet or nothing, mirroring the wrap branch: a meter with no published rate keeps the
    // old behaviour rather than having a bound invented from the data it is meant to police.
    var noSpec = Ledger.delta(reading({ index_corrected: 0, effective_ts: at(0) }),
                              reading({ index_corrected: 999999, effective_ts: at(1) }),
                              { meter_id: 'M', index_digits: 6, max_rate_per_hour: null });
    eq('with no published rate, nothing is inferred', noSpec.quality, 'measured');
})();

console.log('\n=== a clock that disagrees with the index is the suspect ===');
(function() {
    // Readings are ordered by (epoch, seq) because within an epoch the index is physics and the
    // clock is firmware. The header always said a disagreement makes the TIMESTAMP suspect; the
    // first version of build() never actually checked.
    //
    // Two readings sharing a timestamp made the segment duration zero, which made the pro-rata
    // share zero, which turned 500 Mcf of real gas into a segment of 0 Mcf reported as
    // 'measured' with the period fully covered.
    var same = Ledger.build([
        reading({ seq: 1, index_corrected: 0,   effective_ts: at(0) }),
        reading({ seq: 2, index_corrected: 500, effective_ts: at(0) }),
        reading({ seq: 3, index_corrected: 520, effective_ts: at(2) })
    ], METER, at(0), at(3));

    ok('the duplicated timestamp is unbillable', same.unbillable.length >= 1);
    eq('and named a clock fault', same.unbillable[0].reason, 'clock_fault');
    ok('its 500 Mcf did not become a measured zero', Ledger.fromMilli(same.milli) < 500,
       Ledger.fromMilli(same.milli) + ' Mcf billed');
    var c = Ledger.coverage(same);
    ok('and the period is no longer reported as fully covered', c.coverage_pct < 100,
       c.coverage_pct + '%');
    near('covered + gap still tiles the window', c.covered_hours + c.gap_hours, c.period_hours);

    // A timestamp going backwards against index order is the same fault.
    var back = Ledger.build([
        reading({ seq: 1, index_corrected: 0,   effective_ts: at(2) }),
        reading({ seq: 2, index_corrected: 500, effective_ts: at(1) })
    ], METER, at(0), at(3));
    ok('a decreasing timestamp is unbillable too', back.unbillable.length >= 1);
    eq('nothing was billed on it', back.milli, 0);
})();

console.log('\n=== an epoch break is never crossed ===');
(function() {
    // A meter swap. The new meter starts near zero; the arithmetic across the boundary would be
    // hugely negative and, resolved as a "rollover", enormous.
    var d = Ledger.delta(reading({ index_corrected: 480000, epoch: 1, effective_ts: at(0) }),
                         reading({ index_corrected: 12, epoch: 2, effective_ts: at(1) }), METER);
    eq('a delta across two epochs is null', d.mcf, null);
    eq('and is called a chain break', d.quality, 'chain_break');
})();

// ---- 2. segments, gaps, and the tiling invariant ----------------------------------------------

console.log('\n=== segments and gaps tile the window exactly ===');
(function() {
    var rs = [
        reading({ index_corrected: 0,   effective_ts: at(0) }),
        reading({ index_corrected: 100, effective_ts: at(10) }),
        reading({ index_corrected: 150, effective_ts: at(20) })
    ];
    var b = Ledger.build(rs, METER, at(0), at(24));
    var c = Ledger.coverage(b);

    near('total billable volume', Ledger.fromMilli(b.milli), 150);
    eq('two segments', b.segments.length, 2);
    near('covered + gap equals the window', c.covered_hours + c.gap_hours, c.period_hours);
    near('the window is 24 hours', c.period_hours, 24);
    near('four of them are uncovered', c.gap_hours, 4);
    ok('coverage is a computed percentage', c.coverage_pct > 83 && c.coverage_pct < 84,
       c.coverage_pct + '%');

    // The tail gap is unbounded: nothing bounds it on the far side, so its volume is genuinely
    // unknown rather than zero.
    var tail = b.gaps[b.gaps.length - 1];
    eq('the trailing gap is unbounded', tail.kind, 'unbounded');
    eq('so its volume is null, NOT zero', tail.volume_mcf, null);
})();

console.log('\n=== a hole in the middle does not become a zero ===');
(function() {
    // Readings stop for six hours, then resume. The pair spanning the hole still has an
    // explicable delta, so the volume IS known -- it is the distribution in time that is not.
    var rs = [
        reading({ index_corrected: 0,   effective_ts: at(0) }),
        reading({ index_corrected: 60,  effective_ts: at(6) }),
        reading({ index_corrected: 200, effective_ts: at(18) })
    ];
    var b = Ledger.build(rs, METER, at(0), at(18));
    near('all of the volume is still counted', Ledger.fromMilli(b.milli), 200);
    ok('no gap is invented inside a covered span', b.gaps.length === 0,
       b.gaps.length + ' gaps');
})();

console.log('\n=== an unexplained pair leaves a hole, never a number ===');
(function() {
    var rs = [
        reading({ index_corrected: 0,   effective_ts: at(0) }),
        reading({ index_corrected: 100, effective_ts: at(6), device_state: { flow_status: 'fault' } }),
        reading({ index_corrected: 260, effective_ts: at(12) })
    ];
    var b = Ledger.build(rs, METER, at(0), at(12));
    ok('the faulted pairs are recorded as unbillable', b.unbillable.length >= 1,
       b.unbillable.length + ' unbillable spans');
    ok('and none of their volume reached the total',
       Ledger.fromMilli(b.milli) < 260, Ledger.fromMilli(b.milli) + ' Mcf billed of 260 apparent');
})();

console.log('\n=== no readings at all is a gap, not an empty month ===');
(function() {
    var b = Ledger.build([], METER, at(0), at(24));
    eq('nothing is billed', b.milli, 0);
    eq('one gap covers the whole window', b.gaps.length, 1);
    eq('unbounded', b.gaps[0].kind, 'unbounded');
    eq('with a null volume', b.gaps[0].volume_mcf, null);
    var c = Ledger.coverage(b);
    eq('and coverage is zero percent, computed', c.coverage_pct, 0);
    near('with every hour accounted for as a gap', c.gap_hours, 24);
})();

// ---- 3. what must never appear -----------------------------------------------------------------

console.log('\n=== the rules that must survive future edits ===');
(function() {
    // Comments stripped FIRST. The file's own header explains that no code path may produce
    // source: 'interpolated' — and the first draft of this test read that sentence as a
    // violation. Same trap as tests/firestore-rules.test.js: a rule about code has to be checked
    // against the code, never against the prose describing it.
    var src = fs.readFileSync(path.join(__dirname, '..', 'worker-portal', 'ledger.js'), 'utf8')
        .replace(/\/\/[^\n]*/g, '');
    // Stated as a test rather than a comment because the temptation to add it arrives later, in a
    // hurry, when a statement looks embarrassing with a hole in it.
    ok('the ledger cannot interpolate', !/interpolat/i.test(src),
       'no code path, not just no default');

    // Every quantity a statement could add up is a real number or an explicit null.
    var rs = [reading({ index_corrected: 0, effective_ts: at(0) }),
              reading({ index_corrected: 5, effective_ts: at(1) })];
    var b = Ledger.build(rs, METER, at(0), at(2));
    ok('no segment quantity is ever negative',
       b.segments.every(function(s) { return s.mcf === null || s.mcf >= 0; }));
    ok('no segment spans two epochs',
       b.segments.every(function(s) { return typeof s.epoch === 'number'; }));
    ok('every gap volume is a number or null, never undefined',
       b.gaps.every(function(g) { return g.volume_mcf === null || typeof g.volume_mcf === 'number'; }));
})();

console.log('\n=== an incoming reading is checked before it is trusted ===');
(function() {
    var now = Date.parse('2027-03-15T12:00:00Z');
    eq('a well-formed reading is accepted',
       Ledger.checkReading({ seq: 1, epoch: 1, index_corrected: 10,
                             device_ts: '2027-03-15T11:59:00Z' }, now), null);

    // Backfill after an outage is the normal case, not an error.
    eq('a week-old measurement is fine — that is backfill',
       Ledger.checkReading({ seq: 1, epoch: 1, index_corrected: 10,
                             device_ts: '2027-03-08T00:00:00Z' }, now), null);

    // A future measurement timestamp is how volume gets pushed into a period being closed now.
    eq('a future measurement is refused',
       Ledger.checkReading({ seq: 1, epoch: 1, index_corrected: 10,
                             device_ts: '2027-03-15T13:00:00Z' }, now), 'future');

    eq('a missing index is refused',
       Ledger.checkReading({ seq: 1, epoch: 1, device_ts: '2027-03-15T11:00:00Z' }, now), 'index');
    eq('so is a missing sequence',
       Ledger.checkReading({ epoch: 1, index_corrected: 1, device_ts: '2027-03-15T11:00:00Z' }, now), 'seq');
})();

console.log('');
console.log(fail === 0 ? 'ALL PASS — ' + pass + ' assertions'
                       : pass + ' passed, ' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
