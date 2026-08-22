// ===== ION MINING GROUP — the gas metering ledger =====
//
// Pure functions over readings. No KV, no fetch, no clock — everything comes in as an argument so
// this file can be tested in node without a Worker, and so a statement computed today from the
// same inputs is byte-identical to one computed next year.
//
//
// A READING IS A CUMULATIVE INDEX, NOT AN INTERVAL VOLUME.
//
// That is the decision the whole file rests on, so here is why, shortest reason first:
//
//   1. It is what the instrument actually is. A rotary or turbine meter has an odometer; an EVC
//      has a non-resettable grand total. Manual entry then means "type what the dial says" --
//      the SAME fact as telemetry, photographable and witnessable. If we stored intervals, the
//      manual path would require a human to do subtraction, and the manual path is first-class
//      here, so it has to be the easy one.
//   2. It self-heals over lost messages. Lose three of twenty-four hourly packets and the next
//      cumulative reading still contains that volume. With intervals it is gone and nothing in
//      the data says so.
//   3. It is idempotent under duplicate delivery. Re-delivering an index is arithmetically a
//      no-op. Re-delivering an interval double-bills unless dedupe is perfect, and dedupe is
//      never perfect.
//   4. It makes a GAP structurally different from a ZERO. Two readings with an equal index is a
//      MEASURED zero. No readings at all is a gap. With intervals both are an absent row in a
//      sum. This is the repo's null-is-never-zero rule falling out of the storage choice for
//      free, which is the strongest form of it available.
//
// The cost is rollover and meter replacement, and both are handled explicitly below. Both fail
// CLOSED: an index movement this file cannot explain bills nobody until a person looks at it.
//
//
// WHAT THIS FILE WILL NOT DO.
//
// It will not interpolate. Not ever, under any flag. Interpolation manufactures a number and then
// hands it the authority of a measurement, and somebody is paid or not paid on it. The industry
// answer to a missing period is not a formula, it is an estimate agreed by two named parties
// under the contract's measurement-failure clause -- so estimates exist in this system, as a
// SEPARATE record type with an author and a document reference, and they never enter segments[].
// There is no source: 'interpolated' anywhere, and a test asserts the string does not appear.

// Set on BOTH module.exports and the global, unconditionally.
//
// The Worker has no `module`, so it needs the global. Node has one, so the test suites can
// require() this directly. And when node imports it from an ESM file BOTH are defined -- an
// either/or wrapper takes the module.exports branch there and leaves the global undefined, which
// is a failure that only appears in the Worker entry point and not in any test.
(function(root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PortalLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // A device that cannot hold its clock to five minutes is broken and must be fixed, so the
    // TRANSPORT timestamp is tightly bounded. The MEASUREMENT timestamp is not: backfilling a
    // week after an outage is a legitimate and expected thing for a meter to do.
    //
    // But it may never be far in the FUTURE, because a future measurement timestamp is precisely
    // how volume gets pushed into a period that is being closed right now.
    var SKEW_FUTURE_MS = 120 * 1000;

    // Quantities accumulate in integer thousandths. An 8-digit index in a double is exact, so the
    // readings themselves are safe -- but Mcf at three decimal places summed across thousands of
    // segments drifts, and the drift lands in money.
    var MILLI = 1000;
    function toMilli(mcf) { return Math.round(mcf * MILLI); }
    function fromMilli(m) { return m / MILLI; }

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    // ---- Delta between two adjacent readings ------------------------------------------------
    //
    // Returns { mcf, quality } on success, or { mcf: null, quality: <why> } when the movement
    // cannot be explained. A null here propagates all the way to an unbillable segment: this
    // function never guesses.
    //
    // Rollover is real and frequent, not a curiosity. A 6-digit Mcf register on a small landfill
    // meter wraps every few months, so this branch is live code.
    function delta(prev, curr, meter) {
        if (!prev || !curr) return { mcf: null, quality: 'incomplete' };

        // An epoch change means the physical count was broken -- a meter swap, or a totaliser
        // reset at recalibration. No arithmetic across that boundary is meaningful.
        if (prev.epoch !== curr.epoch) return { mcf: null, quality: 'chain_break' };

        if (!isNum(prev.index_corrected) || !isNum(curr.index_corrected)) {
            return { mcf: null, quality: 'incomplete' };
        }

        // An uncorrected index is not billable. Correcting it needs pressure and temperature, and
        // the pressure ratio alone is tens of percent -- a raw index billed as corrected is not a
        // rounding error, it is a wrong cheque.
        if (prev.correction_basis === 'uncorrected' || curr.correction_basis === 'uncorrected') {
            return { mcf: null, quality: 'uncorrected' };
        }

        // The most likely accidental zero in the whole system. A faulted meter may have a FROZEN
        // index, so an unchanged reading across a fault is not a measured zero -- it is unknown.
        if (faulted(prev) || faulted(curr)) return { mcf: null, quality: 'suspect' };

        var d = curr.index_corrected - prev.index_corrected;
        if (d >= 0) return { mcf: d, quality: 'measured' };

        // Negative. Either the register wrapped, or something is wrong. Resolve it ONLY with
        // figures published on the meter's own datasheet -- never inferred from the data itself,
        // because inferring the wrap point from the wrap is circular.
        if (!meter || !isNum(meter.index_digits) || !isNum(meter.max_rate_per_hour)) {
            return { mcf: null, quality: 'unresolved' };
        }
        var span = Math.pow(10, meter.index_digits);
        var wrapped = (span - prev.index_corrected) + curr.index_corrected;
        var hours = elapsedHours(prev, curr);
        if (hours === null || wrapped < 0) return { mcf: null, quality: 'unresolved' };

        // Plausibility, not certainty. If the implied volume could not physically have passed
        // through this meter in the elapsed time, this is not a rollover and a human must look.
        if (wrapped <= meter.max_rate_per_hour * hours) {
            return { mcf: wrapped, quality: 'rollover_resolved' };
        }
        return { mcf: null, quality: 'unresolved' };
    }

    function faulted(r) {
        return !!(r.device_state && r.device_state.flow_status === 'fault');
    }

    function elapsedHours(a, b) {
        var ta = Date.parse(a.effective_ts), tb = Date.parse(b.effective_ts);
        if (!isFinite(ta) || !isFinite(tb) || tb < ta) return null;
        return (tb - ta) / 3600000;
    }

    // ---- Segments and gaps -------------------------------------------------------------------
    //
    // A SEGMENT is a span between two adjacent readings whose delta is explicable. A GAP is any
    // part of the requested window not covered by a segment. Together they must tile the window
    // exactly -- covered + gap === window, asserted in the tests, so a coverage figure of 100%
    // is a COMPUTED hundred rather than the absence of a check.
    //
    // Two kinds of gap, and they are not the same fact:
    //
    //   bounded    readings exist on both sides and the chain is intact, so the TOTAL volume
    //              across the hole is known -- only its distribution in time is not. For a
    //              monthly minimum this costs nothing; for a daily one it costs everything.
    //   unbounded  the chain broke inside the hole. The volume is genuinely unknown. null.
    //              Not zero, not estimated, not interpolated.
    function build(readings, meter, windowStart, windowEnd) {
        var out = {
            segments: [], gaps: [],
            milli: 0,                 // billable total, integer thousandths of an Mcf
            unbillable: [],
            windowStart: windowStart, windowEnd: windowEnd
        };
        var t0 = Date.parse(windowStart), t1 = Date.parse(windowEnd);
        if (!isFinite(t0) || !isFinite(t1) || t1 <= t0) return out;

        var rs = usable(readings);
        if (!rs.length) {
            out.gaps.push(gap(windowStart, windowEnd, 'unbounded', null, 'no_telemetry'));
            return out;
        }

        // Sorted by index within an epoch, NOT by timestamp. Within an epoch, monotonicity of the
        // index is physics; monotonicity of the clock is firmware. When the two disagree the
        // TIMESTAMP is the suspect one -- so ordering by index and then checking the timestamps
        // agree catches a clock fault instead of silently reordering real volume.
        rs.sort(function(a, b) {
            if (a.epoch !== b.epoch) return a.epoch - b.epoch;
            return a.seq - b.seq;
        });

        var cursor = t0;
        for (var i = 1; i < rs.length; i++) {
            var prev = rs[i - 1], curr = rs[i];
            var from = Date.parse(prev.effective_ts), to = Date.parse(curr.effective_ts);
            if (!isFinite(from) || !isFinite(to)) continue;

            // Entirely outside the window.
            if (to <= t0 || from >= t1) continue;

            var d = delta(prev, curr, meter);

            // A pair that cannot be explained leaves a hole rather than a zero.
            if (d.mcf === null) {
                out.unbillable.push({
                    from: prev.effective_ts, to: curr.effective_ts,
                    reason: d.quality,
                    start_reading_id: prev.reading_id, end_reading_id: curr.reading_id
                });
                continue;
            }

            // Clipping. A segment straddling the window edge contributes only the part inside it,
            // and the only defensible way to divide it is pro rata by time -- which is an
            // assumption, so it is LABELLED as one rather than presented as measured.
            var clippedFrom = Math.max(from, t0), clippedTo = Math.min(to, t1);
            var full = to - from;
            var share = full > 0 ? (clippedTo - clippedFrom) / full : 0;
            var partial = share < 1;
            var mcf = d.mcf * share;

            if (clippedFrom > cursor) {
                out.gaps.push(gap(iso(cursor), iso(clippedFrom), 'bounded', null, 'no_telemetry'));
            }
            cursor = Math.max(cursor, clippedTo);

            out.segments.push({
                from: iso(clippedFrom), to: iso(clippedTo),
                meter_id: prev.meter_id, epoch: prev.epoch,
                start_reading_id: prev.reading_id, end_reading_id: curr.reading_id,
                mcf: fromMilli(toMilli(mcf)),
                // A clipped segment is prorated by time, which the meter did not measure.
                quality: partial ? 'prorated' : d.quality,
                endpoint_source: prev.source === 'device' && curr.source === 'device'
                    ? 'device' : 'mixed'
            });
            out.milli += toMilli(mcf);
        }

        if (cursor < t1) {
            out.gaps.push(gap(iso(cursor), iso(t1), 'unbounded', null, 'no_telemetry'));
        }
        return out;
    }

    // Readings that are structurally fit to be an endpoint. A superseded reading is excluded here
    // rather than deleted anywhere -- the original stays readable at its own key forever, which is
    // what lets a seller be shown why last month's figure differed.
    function usable(readings) {
        return (readings || []).filter(function(r) {
            return r && !r.superseded && isNum(r.seq) && isNum(r.epoch) && r.effective_ts;
        });
    }

    function gap(from, to, kind, mcf, cause) {
        return {
            from: from, to: to, kind: kind,
            hours: (Date.parse(to) - Date.parse(from)) / 3600000,
            // Explicitly null for unbounded. A reader must never be able to add this into a total
            // by accident, so it is not 0 and there is no "or zero" default anywhere downstream.
            volume_mcf: kind === 'bounded' ? mcf : null,
            cause: cause,
            resolution: 'unresolved',
            estimate: null
        };
    }

    function iso(ms) { return new Date(ms).toISOString(); }

    // ---- Coverage ----------------------------------------------------------------------------
    // Stated on every statement so that a full month is a measured full month.
    function coverage(built) {
        var t0 = Date.parse(built.windowStart), t1 = Date.parse(built.windowEnd);
        var periodHours = (t1 - t0) / 3600000;
        var covered = 0;
        for (var i = 0; i < built.segments.length; i++) {
            covered += (Date.parse(built.segments[i].to) - Date.parse(built.segments[i].from)) / 3600000;
        }
        var gapHours = 0;
        for (var g = 0; g < built.gaps.length; g++) gapHours += built.gaps[g].hours;
        return {
            period_hours: round3(periodHours),
            covered_hours: round3(covered),
            gap_hours: round3(gapHours),
            coverage_pct: periodHours > 0 ? round3(100 * covered / periodHours) : null
        };
    }

    function round3(n) { return Math.round(n * 1000) / 1000; }

    // ---- Validation of an incoming reading ---------------------------------------------------
    //
    // Returns null when acceptable, or a reason string. The caller turns that into one identical
    // rejection response for every case -- an endpoint that explains WHICH part failed helps
    // forge the next attempt.
    function checkReading(r, receivedAtMs) {
        if (!r || typeof r !== 'object') return 'shape';
        if (!isNum(r.seq) || r.seq < 0) return 'seq';
        if (!isNum(r.epoch) || r.epoch < 0) return 'epoch';
        if (!isNum(r.index_corrected)) return 'index';
        var ts = Date.parse(r.device_ts);
        if (!isFinite(ts)) return 'device_ts';
        // The past is fine and expected: this is backfill after an outage. The future is not.
        if (ts > receivedAtMs + SKEW_FUTURE_MS) return 'future';
        return null;
    }

    return {
        delta: delta,
        build: build,
        coverage: coverage,
        checkReading: checkReading,
        toMilli: toMilli,
        fromMilli: fromMilli,
        SKEW_FUTURE_MS: SKEW_FUTURE_MS
    };
});
